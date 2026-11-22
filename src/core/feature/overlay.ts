// CM7 overlay 挂载机制 —— minimap / overview ruler 共用的三连:挂 DOM 到 view.dom、事务后重绘、滚动时重定位。
//
// 不往 EditorView 加 ViewPlugin 生命周期(违背「去到不能再去」);而是组合 CM7 已有两个公开钩子:
// onTransaction(事务后)+ view.scrollDOM 的原生 scroll。约束:CM7 无 measure 阶段,redraw/reposition 里同步
// 读 view.scrollDOM.scrollHeight/clientHeight 必须先读后写一次过,不 write-then-read(否则强制回流)。

import type { EditorView } from '../view/editorview'
import type { Transaction } from '../model/state'
import { keymapHandler, type KeyBinding } from '../edit/keymap'
import { keyOS } from '../keyos'

const isMac = keyOS === 'mac'

export interface OverlaySpec {
    mount(view: EditorView): HTMLElement                     // 建+append DOM,返回 root 供销毁
    redraw?(view: EditorView, tr: Transaction | null): void  // 每事务后(doc/selection/effects);初始 tr=null 全量
    reposition?(view: EditorView): void                      // 滚动时 + redraw 后
}

// 挂一个 overlay,返回卸载函数(移 DOM + 退订 + 摘 scroll 监听)。
export function attachOverlay(view: EditorView, spec: OverlaySpec): () => void {
    const root = spec.mount(view)

    const onScroll = () => spec.reposition?.(view)
    view.scrollDOM.addEventListener('scroll', onScroll, { passive: true })

    const unsubscribe = view.onViewUpdate((tr) => {
        spec.redraw?.(view, tr)
        spec.reposition?.(view)
    })

    // 几何事件(scroll setTimeout + ResizeObserver 共汇于 onScroll 末尾):resize 感知全量重绘。
    // redraw(view,null) 复用「全量」路径,让 minimap applyPanelH 重设 canvas、ruler 重设 canvas.height。
    const stopGeometry = view.onGeometry(() => {
        spec.redraw?.(view, null)
        spec.reposition?.(view)
    })

    // 初始一次:构造后立即全量画(tr=null)+ 定位。
    spec.redraw?.(view, null)
    spec.reposition?.(view)

    return () => {
        unsubscribe()
        stopGeometry()
        view.scrollDOM.removeEventListener('scroll', onScroll)
        root.remove()
    }
}

// —— 宿主键在浮层里 ——
//
// Monaco 的 addCommand / addAction 键挂在编辑器容器上,查找框、替换框、rename、quick input 都是编辑器的 widget
// (editorFocus 为真),在里面按照样触发(实测 /tmp/lc-hunt/r5/O/m-keys.ts)。我们的 keymap 只听 contentDOM,
// 这里在 view.dom 冒泡阶段补一道,只跑宿主键:内置的方向键、⌘A、⌘Z 等在输入框里仍是输入框自己的行为。
// 浮层已处理(preventDefault)的键不再给宿主;返回 false 的导航键不吞(claim:false),落回原生。
// 不 stopPropagation:run 返回 true 但 preventDefault:false 的键照样冒泡到 window(宿主自己的 ⌘T 等靠它)。
export function overlayInputKeymap(view: EditorView, bindings: readonly KeyBinding[]): () => void {
    const run = keymapHandler(bindings, { claim: false })
    const onKey = (e: KeyboardEvent) => {
        if (e.defaultPrevented) return
        const t = e.target as Element | null
        if (!t || t === view.dom || view.contentDOM.contains(t)) return
        // 嵌在里面的另一个编辑器(宿主塞进来的)自己有 keymap
        if (t.closest?.('.cm-editor') !== view.dom) return
        run(e, view)
    }
    view.dom.addEventListener('keydown', onKey)
    return () => view.dom.removeEventListener('keydown', onKey)
}

// —— Quick Input:命令面板(>)与 Go to Line(:)共用的输入框 ——
//
// 对齐 Monaco quick-input-widget:挂在 view.dom 里、编辑器顶部居中(宽 = min(62%, 600px));
// 按输入前缀分派 provider(':' 跳行、'>' 命令、'' 帮助),删掉前缀就换 provider。
// 每个 view 至多一个(再次打开 = 换前缀并聚焦已有的);随 view.destroy 关闭;焦点移出就关。
// 关闭顺序:先摘 DOM → provider.onLeave → view.focus() → 再跑选中项(命令可能把焦点移到自己的浮层)。

export interface QuickPickItem {
    label: string
    /** label 里要加粗高亮的 [from, to) 区间 */
    highlights?: readonly (readonly [number, number])[]
    description?: string
    keybinding?: string
    /** 选中后执行;没有 run 的是提示行(Enter 不关) */
    run?: () => unknown
    /** 帮助行:run 只换前缀,输入框不关 */
    keepOpen?: boolean
    /** 分组线文字(Monaco quick pick separator):画在行右侧,行顶描一条 pickerGroup.border(首行不描) */
    separator?: string
    /** 不给 = label + 键帽读法 */
    ariaLabel?: string
}

export interface QuickAccessProvider {
    prefix: string
    /** filter = 去掉前缀后的原文(trim 由 provider 自己决定) */
    items(filter: string): QuickPickItem[]
    /** 每次文本变化后调(Go to Line 预览) */
    onChange?(filter: string): void
    /** 换走 / 取消(false)或选中后关闭(true) */
    onLeave?(accepted: boolean): void
    /** 输入框占位文字(Monaco quickPick.placeholder) */
    placeholder?: string
    /** 列表更新后聚焦哪一行(Monaco quickPick.activeItems);不给 = 第一行 */
    activeIndex?(items: readonly QuickPickItem[], filter: string): number
}

export interface QuickInput {
    readonly root: HTMLElement
    readonly input: HTMLInputElement
    setValue(value: string): void
    hide(): void
}

const quickInputs = new WeakMap<EditorView, QuickInput>()

export function activeQuickInput(view: EditorView): QuickInput | null {
    return quickInputs.get(view) ?? null
}

export function showQuickInput(view: EditorView, value: string, providers: readonly QuickAccessProvider[]): QuickInput {
    const existing = quickInputs.get(view) as (QuickInput & { reset(p: readonly QuickAccessProvider[]): void }) | undefined
    if (existing) {
        existing.reset(providers)
        existing.setValue(value)
        existing.input.focus()
        return existing
    }
    const doc = view.dom.ownerDocument
    const root = doc.createElement('div')
    root.className = 'cm-quick-input'
    const header = doc.createElement('div')
    header.className = 'cm-quick-input-header'
    const box = doc.createElement('div')
    box.className = 'cm-quick-input-box'
    const input = doc.createElement('input')
    input.className = 'cm-quick-input-input'
    input.type = 'text'
    input.spellcheck = false
    input.autocomplete = 'off'
    input.setAttribute('role', 'combobox')
    input.setAttribute('aria-haspopup', 'listbox')
    input.setAttribute('aria-autocomplete', 'list')
    // Monaco quickInput:输入框和列表都叫「Type to narrow down results.」
    input.setAttribute('aria-label', 'Type to narrow down results.')
    const list = doc.createElement('div')
    list.className = 'cm-quick-input-list'
    list.setAttribute('role', 'listbox')
    list.setAttribute('aria-label', 'Type to narrow down results.')
    const listId = `cm-quick-input-list-${++quickInputSeq}`
    list.id = listId
    input.setAttribute('aria-controls', listId)
    box.appendChild(input)
    header.appendChild(box)
    root.append(header, list)
    // Monaco:list maxHeight = floor(0.4 * 编辑器高 / 44) * 44 + 6(jsdom 无布局不限高)
    const edH = view.dom.clientHeight
    if (edH > 0) list.style.maxHeight = `${Math.floor(edH * 0.4 / 44) * 44 + 6}px`
    view.dom.appendChild(root)

    let all = providers
    let active: QuickAccessProvider | null = null
    let items: QuickPickItem[] = []
    let focused = 0
    let closed = false
    let blurTimer = 0
    // Monaco:第一次 Tab 把焦点从输入框移到列表(还在 widget 里),再 Tab 就出了 widget
    let tabbed = false

    const pick = (v: string): QuickAccessProvider | null => {
        let best: QuickAccessProvider | null = null
        for (const p of all)
            if (v.startsWith(p.prefix) && (!best || p.prefix.length > best.prefix.length)) best = p
        return best
    }

    const paint = () => {
        list.textContent = ''
        items.forEach((it, i) => {
            const row = doc.createElement('div')
            row.className = 'cm-quick-input-row' + (i === focused ? ' focused' : '')
            row.id = `${listId}-${i}`
            row.setAttribute('role', 'option')
            row.setAttribute('aria-selected', i === focused ? 'true' : 'false')
            row.setAttribute('aria-label', it.ariaLabel ?? (it.keybinding ? `${it.label}, ${keybindingAriaLabel(it.keybinding)}` : it.label))
            if (it.separator !== undefined && i > 0) row.classList.add('cm-quick-input-separator-border')
            const label = doc.createElement('span')
            label.className = 'cm-quick-input-label'
            let at = 0
            for (const [from, to] of it.highlights ?? []) {
                if (from > at) label.appendChild(doc.createTextNode(it.label.slice(at, from)))
                const hl = doc.createElement('span')
                hl.className = 'cm-quick-input-highlight'
                hl.textContent = it.label.slice(from, to)
                label.appendChild(hl)
                at = to
            }
            if (at < it.label.length) label.appendChild(doc.createTextNode(it.label.slice(at)))
            row.appendChild(label)
            if (it.description) {
                const d = doc.createElement('span')
                d.className = 'cm-quick-input-desc'
                d.textContent = it.description
                row.appendChild(d)
            }
            if (it.keybinding) {
                const kb = doc.createElement('span')
                kb.className = 'cm-quick-input-kb'
                // 和弦('⌘K ⌘L')逐段画键帽,段间一个 6px 分隔(Monaco keybindingLabel chord-separator)
                it.keybinding.split(' ').forEach((chord, ci) => {
                    if (ci) {
                        const sep = doc.createElement('span')
                        sep.className = 'cm-keybinding-chord-sep'
                        sep.style.width = '6px'
                        sep.textContent = ' '
                        kb.appendChild(sep)
                    }
                    for (const k of keybindingParts(chord)) {
                        const key = doc.createElement('span')
                        key.className = 'cm-keybinding-key'
                        key.textContent = k
                        kb.appendChild(key)
                    }
                })
                row.appendChild(kb)
            }
            if (it.separator) {
                const sep = doc.createElement('span')
                sep.className = 'cm-quick-input-separator'
                sep.textContent = it.separator
                row.appendChild(sep)
            }
            // mousedown 不抢输入框焦点;click 才执行(对齐 Monaco list)
            row.addEventListener('mousedown', e => e.preventDefault())
            row.addEventListener('click', e => { e.preventDefault(); accept(i) })
            list.appendChild(row)
        })
        if (items.length) input.setAttribute('aria-activedescendant', `${listId}-${focused}`)
        else input.removeAttribute('aria-activedescendant')
        ;(list.children[focused] as HTMLElement | undefined)?.scrollIntoView?.({ block: 'nearest' })
    }

    const render = () => {
        const v = input.value
        const next = pick(v)
        if (next !== active) {
            active?.onLeave?.(false)
            active = next
        }
        const filter = active ? v.slice(active.prefix.length) : v
        items = active ? active.items(filter) : []
        focused = Math.max(0, Math.min(items.length - 1, active?.activeIndex?.(items, filter) ?? 0))
        if (active?.placeholder) input.placeholder = active.placeholder
        else input.removeAttribute('placeholder')
        paint()
        active?.onChange?.(filter)
    }

    const hide = (accepted: boolean) => {
        if (closed) return
        closed = true
        window.clearTimeout(blurTimer)
        quickInputs.delete(view)
        offDestroy()
        root.remove()
        active?.onLeave?.(accepted)
        active = null
    }

    const accept = (i: number) => {
        const it = items[i]
        if (!it?.run) return
        if (it.keepOpen) { it.run(); return }
        hide(true)
        view.focus()
        void Promise.resolve(it.run())
    }

    const move = (delta: number, wrap: boolean) => {
        if (!items.length) return
        const n = items.length
        focused = wrap ? (focused + delta + n) % n : Math.max(0, Math.min(n - 1, focused + delta))
        paint()
    }

    input.addEventListener('input', render)
    // 跳分组(Monaco QuickPickFocus.NextSeparator / PreviousSeparator,focusNext/Previous 带 loop):
    // 按方向循环找带分组的行或第一行;往后一步没动(没有分组、或只有自己)就落到最后一行
    const jumpSeparator = (dir: 1 | -1) => {
        const n = items.length
        if (!n) return
        let to = focused
        for (let k = 1; k <= n; k++) {
            const i = ((focused + dir * k) % n + n) % n
            if (items[i].separator !== undefined || i === 0) { to = i; break }
        }
        focused = dir === 1 && to === focused ? n - 1 : to
        paint()
    }

    // Monaco quickInputActions:↑↓ 带 ⌃(Mac 的 WinCtrl / 其余 Ctrl)同样;⌃Home / ⌃End 首尾(可加 ⌥ ⌘);
    // PageUp / PageDown 可加任意修饰;Mac ⌘↓ ⌘↑、Win/Linux ⌥↓ ⌥↑ 跳分组(quick access 下没有分组时 ⌘↓ 落到末行)
    input.addEventListener('keydown', e => {
        if (e.isComposing) return
        const page = Math.max(1, Math.floor(list.clientHeight / 22) - 1)
        const ctrl = isMac ? e.ctrlKey : e.ctrlKey || e.metaKey
        const sepMod = isMac ? e.metaKey && !e.ctrlKey : e.altKey && !e.ctrlKey && !e.metaKey
        const plain = !e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey
        if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !e.shiftKey && (sepMod || (isMac && e.metaKey && (e.altKey || e.ctrlKey)))) {
            jumpSeparator(e.key === 'ArrowDown' ? 1 : -1)
        }
        else if (e.key === 'ArrowDown' && !e.shiftKey && !e.altKey && (isMac ? !e.metaKey : true)) move(1, true)
        else if (e.key === 'ArrowUp' && !e.shiftKey && !e.altKey && (isMac ? !e.metaKey : true)) move(-1, true)
        else if (e.key === 'PageDown' && !e.shiftKey) move(page, false)
        else if (e.key === 'PageUp' && !e.shiftKey) move(-page, false)
        else if ((e.key === 'Home' || e.key === 'End') && ctrl && !e.shiftKey) {
            if (items.length) { focused = e.key === 'Home' ? 0 : items.length - 1; paint() }
        }
        else if (e.key === 'Enter') accept(focused)
        else if (e.key === 'Escape') { hide(false); view.focus() }
        // 第二次 Tab 出了 widget:Monaco 关掉、焦点回编辑器(列表是可滚动的 div,Chrome 会让它接住 Tab,不能靠 focusout);
        // ⇧Tab(输入框是第一个停靠点)和带修饰的 Tab 留在框内
        else if (e.key === 'Tab' && plain && tabbed) { hide(false); view.focus() }
        else if (e.key === 'Tab') tabbed ||= plain
        else return
        e.preventDefault()
        e.stopPropagation()
    })
    // 焦点移出(点编辑器、点页面别处)→ 关;窗口失焦时 activeElement 仍在框内,不关
    root.addEventListener('focusout', () => {
        window.clearTimeout(blurTimer)
        blurTimer = window.setTimeout(() => {
            if (!closed && !root.contains(doc.activeElement)) hide(false)
        }, 0)
    })
    const offDestroy = view.onDestroy(() => hide(false))

    const qi: QuickInput & { reset(p: readonly QuickAccessProvider[]): void } = {
        root,
        input,
        setValue(v: string) {
            tabbed = false
            input.value = v
            input.setSelectionRange(v.length, v.length)
            render()
        },
        hide() { hide(false) },
        reset(p) {
            active?.onLeave?.(false)
            active = null
            all = p
        },
    }
    quickInputs.set(view, qi)
    qi.setValue(value)
    input.focus()
    return qi
}

let quickInputSeq = 0

// 'Ctrl+Shift+P' → [Ctrl, Shift, P];'⇧⌘O' → [⇧, ⌘, O](Monaco 键帽逐键)
export function keybindingParts(kb: string): string[] {
    if (kb.length > 1 && kb.includes('+')) {
        const parts: string[] = []
        for (const p of kb.split('+')) {
            if (p) parts.push(p)
            else if (!parts.length || parts[parts.length - 1] !== '+') parts.push('+')
        }
        return parts
    }
    const parts: string[] = []
    let i = 0
    while (i < kb.length && '⌃⌥⇧⌘'.includes(kb[i])) parts.push(kb[i++])
    if (i < kb.length) parts.push(kb.slice(i))
    return parts
}

// 读屏用的快捷键写法(Monaco AriaLabelProvider):修饰键长写、'+' 连接,方向键 UpArrow…,和弦空格分隔。
// '⌘K ⌘I' → 'Command+K Command+I','⇧⌥↑' → 'Shift+Option+UpArrow','Ctrl+Shift+O' → 'Control+Shift+O'。
// 键帽照旧画符号(UILabelProvider),只有 aria-label 换写法。
const ARIA_KEY: Record<string, string> = {
    '⌃': 'Control', Ctrl: 'Control', '⇧': 'Shift', '⌥': 'Option', '⌘': 'Command',
    '↑': 'UpArrow', '↓': 'DownArrow', '←': 'LeftArrow', '→': 'RightArrow',
    '⌫': 'Backspace', '⌦': 'Delete', '↵': 'Enter', '⏎': 'Enter', '⎋': 'Escape', '⇥': 'Tab',
}
export function keybindingAriaLabel(kb: string): string {
    return kb.split(' ').map(chord => keybindingParts(chord).map(k => ARIA_KEY[k] ?? k).join('+')).join(' ')
}
