// Monaco 风格右键菜单 —— 结构对齐 VS Code/Monaco editor context menu。
// 不可用的项不显示(Monaco 把 precondition 并进菜单 when);只读时没有 Cut/Paste/Change All/Rename/Format。
// TS/JS 时才有 Definition/References/Rename/Format/Symbol。
// Command Palette 始终可用(F1)。挂载:overlay,拦原生 contextmenu。

import type { EditorView } from '../view/editorview'
import { selectAllOccurrences } from '../edit/commands'
import { copyCommand, cutCommand, pasteCommand } from '../input/clipboard'
import { hoverPosFromPoint } from './hover'
import { openCommandPalette, type PaletteCommand } from './commandpalette'
import { inheritThemeVars } from '../chrome/themevars'
import { keyOS } from '../keyos'
import { getOption } from '../options'
import type { TSActions } from '../../lang/tsactions'

export interface ContextMenuItem {
    id: string
    label?: string
    keybinding?: string
    separator?: boolean
    /** 默认 true;函数可按 view 状态判 */
    enabled?: boolean | ((view: EditorView) => boolean)
    run?: (view: EditorView) => boolean | void | Promise<boolean | void>
    submenu?: ContextMenuItem[]
}

const isMac = keyOS === 'mac'
// 键帽照 Monaco lookupKeybinding 三平台实测(/tmp/lc-hunt/r7/monaco-lookup.ts);Linux 不同的单给第三个
const L = (mac: string, win: string, linux: string = win) => keyOS === 'mac' ? mac : keyOS === 'win' ? win : linux

export interface ContextMenuActionProviders {
    ts?: TSActions
    paletteExtra?: PaletteCommand[]
    /**
     * Go to Declaration / Peek Declaration(editor.action.revealDeclaration / peekDeclaration)。
     * Monaco 的 precondition 是 hasDeclarationProvider:没有声明提供者就不出现(standalone 的 TS 没有),这里同理。
     */
    declaration?: { go: (view: EditorView) => Promise<boolean> | boolean, peek: (view: EditorView) => Promise<boolean> | boolean }
    /** Refactor... / Source Action...(editor.action.refactor / sourceAction):有代码操作提供者才出现,只读时不出现 */
    codeActions?: { refactor?: (view: EditorView) => unknown, source?: (view: EditorView) => unknown }
}

// 默认菜单树(对齐 Monaco 截图分组)。providers 注入后启用语言项。
export function defaultContextMenuItems(p: ContextMenuActionProviders = {}): ContextMenuItem[] {
    const ts = p.ts
    const runTs = (fn: (a: TSActions, v: EditorView) => Promise<boolean> | boolean) =>
        (view: EditorView) => {
            if (!ts) return false
            void Promise.resolve(fn(ts, view))
            return true
        }

    return [
        {
            id: 'gotoDef',
            label: 'Go to Definition',
            keybinding: 'F12',
            enabled: !!ts,
            run: runTs((a, v) => a.goToDefinition(v)),
        },
        ...(p.declaration
            ? [{
                id: 'gotoDecl',
                label: 'Go to Declaration',
                run: (v: EditorView) => { void Promise.resolve(p.declaration!.go(v)); return true },
            }]
            : []),
        {
            id: 'gotoRef',
            label: 'Go to References',
            keybinding: isMac ? '⇧F12' : 'Shift+F12',
            enabled: !!ts,
            run: runTs((a, v) => a.goToReferences(v)),
        },
        {
            id: 'gotoImpl',
            label: 'Go to Implementation',
            keybinding: isMac ? '⌘F12' : 'Ctrl+F12',
            enabled: !!ts,
            run: runTs((a, v) => a.goToImplementation(v)),
        },
        {
            id: 'gotoType',
            label: 'Go to Type Definition',
            enabled: !!ts,
            run: runTs((a, v) => a.goToTypeDefinition(v)),
        },
        {
            id: 'gotoSym',
            label: 'Go to Symbol...',
            keybinding: isMac ? '⇧⌘O' : 'Ctrl+Shift+O',
            enabled: !!ts,
            run: runTs((a, v) => a.goToSymbol(v)),
        },
        {
            id: 'peek',
            label: 'Peek',
            enabled: !!ts,
            submenu: [
                {
                    id: 'peekDef',
                    label: 'Peek Definition',
                    keybinding: L('⌥F12', 'Alt+F12', 'Ctrl+Shift+F10'),
                    enabled: !!ts,
                    run: runTs((a, v) => a.peekDefinition(v)),
                },
                ...(p.declaration
                    ? [{
                        id: 'peekDecl',
                        label: 'Peek Declaration',
                        run: (v: EditorView) => { void Promise.resolve(p.declaration!.peek(v)); return true },
                    }]
                    : []),
                {
                    id: 'peekRef',
                    label: 'Peek References',
                    enabled: !!ts,
                    run: runTs((a, v) => a.peekReferences(v)),
                },
                {
                    id: 'peekImpl',
                    label: 'Peek Implementation',
                    keybinding: L('⇧⌘F12', 'Ctrl+Shift+F12'),
                    enabled: !!ts,
                    run: runTs((a, v) => a.peekImplementation(v)),
                },
                {
                    id: 'peekType',
                    label: 'Peek Type Definition',
                    enabled: !!ts,
                    run: runTs((a, v) => a.peekTypeDefinition(v)),
                },
            ],
        },
        { id: 'sep1', separator: true },
        {
            id: 'rename',
            label: 'Rename Symbol',
            keybinding: 'F2',
            enabled: ts ? (v) => !v.state.readOnly : false,
            run: runTs((a, v) => a.renameSymbol(v)),
        },
        {
            id: 'changeAll',
            label: 'Change All Occurrences',
            keybinding: isMac ? '⌘F2' : 'Ctrl+F2',
            enabled: (v) => !v.state.readOnly,
            run: (v) => selectAllOccurrences(v),
        },
        {
            id: 'format',
            label: 'Format Document',
            keybinding: L('⇧⌥F', 'Shift+Alt+F', 'Ctrl+Shift+I'),
            enabled: ts ? (v) => !v.state.readOnly : false,
            run: runTs((a, v) => a.formatDocument(v)),
        },
        {
            id: 'formatSel',
            label: 'Format Selection',
            keybinding: L('⌘K ⌘F', 'Ctrl+K Ctrl+F'),
            enabled: ts ? (v) => !v.state.readOnly && !v.state.selection.main.empty : false,
            run: runTs((a, v) => a.formatSelection(v)),
        },
        {
            id: 'organize',
            label: 'Organize Imports',
            keybinding: isMac ? '⇧⌥O' : 'Shift+Alt+O',
            enabled: ts ? (v) => !v.state.readOnly : false,
            run: runTs((a, v) => a.organizeImports(v)),
        },
        {
            id: 'refactor',
            label: 'Refactor...',
            keybinding: L('⌃⇧R', 'Ctrl+Shift+R'),
            enabled: p.codeActions?.refactor ? (v) => !v.state.readOnly : false,
            run: (v) => { void Promise.resolve(p.codeActions?.refactor?.(v)); return true },
        },
        {
            id: 'sourceAction',
            label: 'Source Action...',
            enabled: p.codeActions?.source ? (v) => !v.state.readOnly : false,
            run: (v) => { void Promise.resolve(p.codeActions?.source?.(v)); return true },
        },
        { id: 'sep2', separator: true },
        {
            id: 'cut',
            label: 'Cut',
            enabled: (v) => !v.state.readOnly,
            run: (v) => cutCommand(v),
        },
        {
            id: 'copy',
            label: 'Copy',
            run: (v) => copyCommand(v),
        },
        {
            id: 'paste',
            label: 'Paste',
            enabled: (v) => !v.state.readOnly,
            run: (v) => pasteCommand(v),
        },
        { id: 'sep3', separator: true },
        {
            id: 'palette',
            label: 'Command Palette',
            keybinding: 'F1',
            run: (v) => openCommandPalette(v, undefined),
        },
    ]
}

function isEnabled(item: ContextMenuItem, view: EditorView): boolean {
    if (item.separator) return false
    if (item.enabled === undefined) return true
    if (typeof item.enabled === 'function') return item.enabled(view)
    return item.enabled
}

// 右键落点:点在已有选区内 → 保留选区;否则把光标移到点击位置(对齐 Monaco)。
function placeCaretOnRightClick(view: EditorView, clientX: number, clientY: number): void {
    const pos = hoverPosFromPoint(view, clientX, clientY)
    if (pos == null) return
    const sel = view.state.selection
    const inside = sel.ranges.some(r => !r.empty && pos >= r.from && pos <= r.to)
    if (inside) return
    view.dispatch(view.state.update({
        selection: { anchor: pos },
        userEvent: 'select',
    }))
}

// 一层菜单(根或子菜单):行 + 当前键盘/鼠标焦点。子菜单挂在父行里(CSS 绝对定位)。
interface MenuLevel {
    menu: HTMLElement
    rows: { el: HTMLElement, item: ContextMenuItem, enabled: boolean, sub: MenuLevel | null }[]
    focused: number
    parent: { level: MenuLevel, index: number } | null
}

function buildMenu(
    view: EditorView,
    items: ContextMenuItem[],
    hooks: { run: (item: ContextMenuItem) => void, hover: (level: MenuLevel, index: number) => void },
    parent: MenuLevel['parent'] = null,
): MenuLevel {
    const doc = view.dom.ownerDocument
    const menu = doc.createElement('div')
    menu.className = parent ? 'cm-context-menu cm-context-submenu' : 'cm-context-menu'
    menu.setAttribute('role', 'menu')
    menu.tabIndex = -1
    const level: MenuLevel = { menu, rows: [], focused: -1, parent }

    // Monaco _getMenuActions:隐藏项不占位,空子菜单不出,分隔线只夹在两组可见项之间
    const shown: ContextMenuItem[] = []
    for (const item of items) {
        if (item.separator) {
            if (shown.length && !shown[shown.length - 1].separator) shown.push(item)
        }
        else if (isEnabled(item, view) && (!item.submenu || item.submenu.some(s => !s.separator && isEnabled(s, view)))) shown.push(item)
    }
    if (shown[shown.length - 1]?.separator) shown.pop()

    for (const item of shown) {
        if (item.separator) {
            const sep = doc.createElement('div')
            sep.className = 'cm-context-sep'
            sep.setAttribute('role', 'separator')
            menu.appendChild(sep)
            continue
        }
        const row = doc.createElement('div')
        row.className = 'cm-context-item'
        row.setAttribute('role', 'menuitem')
        const enabled = isEnabled(item, view)
        if (!enabled) {
            row.classList.add('disabled')
            row.setAttribute('aria-disabled', 'true')
        }

        const label = doc.createElement('span')
        label.className = 'cm-context-label'
        label.textContent = item.label ?? ''
        row.appendChild(label)

        const index = level.rows.length
        let sub: MenuLevel | null = null
        if (item.submenu?.length) {
            const chev = doc.createElement('span')
            chev.className = 'cm-context-chevron codicon codicon-chevron-right'
            row.appendChild(chev)
            row.setAttribute('aria-haspopup', 'true')
            sub = buildMenu(view, item.submenu, hooks, { level, index })
            row.appendChild(sub.menu)
        } else if (item.keybinding) {
            const kbEl = doc.createElement('span')
            kbEl.className = 'cm-context-keybinding'
            kbEl.textContent = item.keybinding
            row.appendChild(kbEl)
        }

        row.addEventListener('mouseenter', e => {
            e.stopPropagation()
            hooks.hover(level, index)
        })
        // mousedown 只吞掉(不让编辑器失去选区/不触发外部关闭);mouseup 才执行 —— 对齐 Monaco:
        // 可以按住(左键或右键)拖到项上松开。
        row.addEventListener('mousedown', e => {
            e.preventDefault()
            e.stopPropagation()
        })
        row.addEventListener('mouseup', e => {
            if (e.target instanceof Node && sub?.menu.contains(e.target)) return
            e.preventDefault()
            e.stopPropagation()
            if (enabled && item.run && !item.submenu?.length) hooks.run(item)
        })
        level.rows.push({ el: row, item, enabled, sub })
        menu.appendChild(row)
    }
    return level
}

/** 外部贡献的菜单项(editor.addAction 的 contextMenuGroupId / contextMenuOrder) */
export interface ContextMenuContribution extends ContextMenuItem {
    group: string
    order?: number
}

const menuContributors = new WeakMap<EditorView, Set<() => ContextMenuContribution[]>>()

export function addContextMenuContributor(view: EditorView, fn: () => ContextMenuContribution[]): () => void {
    let set = menuContributors.get(view)
    if (!set) menuContributors.set(view, set = new Set())
    set.add(fn)
    return () => { set!.delete(fn) }
}

// 默认菜单按分隔线切成 navigation / 1_modification / 9_cutcopypaste / z_commands 四段(Monaco 的分组名),
// 贡献项按组名并入(没有的组新开一段),组按名字排(navigation 永远第一),组内按 order。内置项没有 order 值,贡献项排在内置项之后。
const BASE_GROUPS = ['navigation', '1_modification', '9_cutcopypaste', 'z_commands']

function mergeContributedItems(view: EditorView, base: ContextMenuItem[]): ContextMenuItem[] {
    const extra: ContextMenuContribution[] = []
    for (const fn of menuContributors.get(view) ?? []) extra.push(...fn())
    if (!extra.length) return base
    const segments: { name: string, items: ContextMenuItem[] }[] = []
    let cur: ContextMenuItem[] = []
    for (const it of base) {
        if (it.separator) { segments.push({ name: BASE_GROUPS[segments.length] ?? `${segments.length}`, items: cur }); cur = [] }
        else cur.push(it)
    }
    segments.push({ name: BASE_GROUPS[segments.length] ?? `${segments.length}`, items: cur })
    const byName = new Map(segments.map(s => [s.name, s]))
    const sorted = extra.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    for (const c of sorted) {
        const { group, order: _order, ...item } = c
        let seg = byName.get(group)
        if (!seg) { seg = { name: group, items: [] }; byName.set(group, seg); segments.push(seg) }
        seg.items.push(item)
    }
    segments.sort((a, b) => a.name === b.name ? 0 : a.name === 'navigation' ? -1 : b.name === 'navigation' ? 1 : a.name < b.name ? -1 : 1)
    const out: ContextMenuItem[] = []
    segments.forEach((seg, i) => {
        if (i > 0) out.push({ id: `sep-${seg.name}`, separator: true })
        out.push(...seg.items)
    })
    return out
}

export interface ContextMenuOptions {
    items?: ContextMenuItem[] | ((view: EditorView) => ContextMenuItem[])
    providers?: ContextMenuActionProviders
}

const openers = new WeakMap<EditorView, () => boolean>()

// overlay 工厂 → (view) => 卸载
export function contextMenuCM7(opts: ContextMenuOptions = {}): (view: EditorView) => () => void {
    return (view: EditorView) => {
        let root: MenuLevel | null = null
        // 键盘作用的那一层(子菜单打开并进入后是子菜单)
        let current: MenuLevel | null = null
        // 打开时鼠标所在点:原地松开右键不算选中(菜单从这个角展开,这里是 padding)
        let openPoint: { x: number, y: number } | null = null

        const win = view.dom.ownerDocument.defaultView ?? window

        const close = () => {
            if (!root) return
            root.menu.remove()
            root = current = null
            openPoint = null
            win.removeEventListener('mousedown', onWinDown, true)
            win.removeEventListener('mouseup', onWinUp, true)
            win.removeEventListener('keydown', onKey, true)
            win.removeEventListener('blur', close)
            view.dom.removeEventListener('wheel', close)
        }

        // 关菜单 → 焦点回编辑器 → 再跑命令(rename/format/palette 可能把焦点移到自己的浮层)
        const runItem = (item: ContextMenuItem) => {
            close()
            view.focus()
            void Promise.resolve(item.run!(view))
        }

        const showSub = (level: MenuLevel, index: number, on: boolean) => {
            const r = level.rows[index]
            if (!r?.sub) return
            if (on) {
                const rr = r.el.getBoundingClientRect()
                r.sub.menu.classList.toggle('open-left', win.innerWidth - rr.right < 208)
                r.sub.menu.classList.add('visible')
                r.el.setAttribute('aria-expanded', 'true')
            }
            else {
                setFocus(r.sub, -1)
                r.sub.menu.classList.remove('visible')
                r.el.setAttribute('aria-expanded', 'false')
            }
        }

        const setFocus = (level: MenuLevel, index: number) => {
            level.rows.forEach((r, i) => {
                r.el.classList.toggle('focused', i === index)
                if (i !== index && r.sub) showSub(level, i, false)
            })
            level.focused = index
            const el = level.rows[index]?.el
            if (el) {
                el.setAttribute('tabindex', '-1')
                el.focus({ preventScroll: true })
            }
        }

        const hover = (level: MenuLevel, index: number) => {
            current = level
            setFocus(level, index)
            const r = level.rows[index]
            if (r.sub && r.enabled) showSub(level, index, true)
        }

        // 只停在可用项上,首尾循环(Monaco ActionBar focusOnlyEnabledItems)
        const step = (level: MenuLevel, from: number, dir: 1 | -1): number => {
            const n = level.rows.length
            for (let k = 1; k <= n; k++) {
                const i = ((from + dir * k) % n + n) % n
                if (level.rows[i].enabled) return i
            }
            return -1
        }

        const onKey = (e: KeyboardEvent) => {
            const level = current
            if (!level || e.isComposing) return
            const cur = level.rows[level.focused]
            switch (e.key) {
                case 'ArrowDown': setFocus(level, step(level, level.focused < 0 ? -1 : level.focused, 1)); break
                case 'ArrowUp': setFocus(level, step(level, level.focused < 0 ? 0 : level.focused, -1)); break
                case 'Home': case 'PageUp': setFocus(level, step(level, -1, 1)); break
                case 'End': case 'PageDown': setFocus(level, step(level, 0, -1)); break
                case 'ArrowRight':
                    if (cur?.sub && cur.enabled) {
                        showSub(level, level.focused, true)
                        current = cur.sub
                        setFocus(cur.sub, step(cur.sub, -1, 1))
                    }
                    break
                case 'ArrowLeft':
                    if (level.parent) {
                        const { level: up, index } = level.parent
                        showSub(up, index, false)
                        current = up
                        setFocus(up, index)
                    }
                    break
                case 'Enter': case ' ':
                    if (cur?.sub && cur.enabled) {
                        showSub(level, level.focused, true)
                        current = cur.sub
                        setFocus(cur.sub, step(cur.sub, -1, 1))
                    }
                    else if (cur?.enabled && cur.item.run) runItem(cur.item)
                    break
                case 'Escape':
                    if (level.parent) {
                        const { level: up, index } = level.parent
                        showSub(up, index, false)
                        current = up
                        setFocus(up, index)
                    }
                    else {
                        close()
                        view.focus()
                    }
                    break
                case 'Tab': break
                default:
                    // 菜单开着时按键不进编辑器(Monaco:焦点在菜单上,打字被吞,菜单不关)
                    if (e.metaKey || e.ctrlKey || e.altKey || e.key.length !== 1) return
            }
            e.preventDefault()
            e.stopPropagation()
        }

        const onWinDown = (e: MouseEvent) => {
            const t = e.target
            if (root && !(t instanceof Node && root.menu.contains(t))) close()
        }
        // 右键按下开菜单、拖到项上松开 = 选中;原地松开不算
        const onWinUp = (e: MouseEvent) => {
            if (openPoint && Math.abs(e.clientX - openPoint.x) < 2 && Math.abs(e.clientY - openPoint.y) < 2) {
                openPoint = null
                const t = e.target
                if (t instanceof Node && root?.menu.contains(t)) { e.preventDefault(); e.stopPropagation() }
                return
            }
            openPoint = null
        }

        const resolveItems = () => {
            const base = typeof opts.items === 'function' ? opts.items(view)
                : opts.items ? opts.items
                    : defaultContextMenuItems(opts.providers ?? {})
            return mergeContributedItems(view, base)
        }

        const openAt = (clientX: number, clientY: number) => {
            close()
            root = current = buildMenu(view, resolveItems(), { run: runItem, hover })
            const menuEl = root.menu
            menuEl.style.position = 'fixed'
            menuEl.style.left = '0'
            menuEl.style.top = '0'
            menuEl.style.visibility = 'hidden'
            inheritThemeVars(view, menuEl)
            view.dom.ownerDocument.body.appendChild(menuEl)
            const mw = menuEl.offsetWidth
            const mh = menuEl.offsetHeight
            const vw = win.innerWidth
            const vh = win.innerHeight
            // 放不下就翻到鼠标另一侧(Monaco anchor 布局),再放不下才贴边
            let left = clientX
            let top = clientY
            if (left + mw > vw - 4) left = clientX - mw >= 4 ? clientX - mw : Math.max(4, vw - mw - 4)
            if (top + mh > vh - 4) top = clientY - mh >= 4 ? clientY - mh : Math.max(4, vh - mh - 4)
            menuEl.style.left = `${left}px`
            menuEl.style.top = `${top}px`
            menuEl.style.visibility = 'visible'
            // 焦点进菜单(无项高亮,↓ 落第一项):编辑器失焦,打字不进文档
            menuEl.focus({ preventScroll: true })
            openPoint = { x: clientX, y: clientY }
            win.addEventListener('mousedown', onWinDown, true)
            win.addEventListener('mouseup', onWinUp, true)
            win.addEventListener('keydown', onKey, true)
            win.addEventListener('blur', close)
            // Monaco 只在编辑器上滚滚轮时关(editor.onMouseWheel);resize 只重排,程序滚动不管
            view.dom.addEventListener('wheel', close, { passive: true })
        }

        const onContext = (e: MouseEvent) => {
            // contextmenu:false(Monaco ContextMenuController._onContextMenu):不出自己的菜单,
            // 只把光标放到点击处(点在选区里不动),事件放行给浏览器原生菜单
            if (getOption(view.state, 'contextmenu') === false) {
                view.focus()
                placeCaretOnRightClick(view, e.clientX, e.clientY)
                return
            }
            e.preventDefault()
            e.stopPropagation()
            placeCaretOnRightClick(view, e.clientX, e.clientY)
            openAt(e.clientX, e.clientY)
        }

        // editor.action.showContextMenu:菜单锚在光标下方(Monaco _doShowContextMenu 无鼠标事件时:光标左缘、光标底)
        const showAtCursor = (): boolean => {
            if (getOption(view.state, 'contextmenu') === false) return false
            const c = view.caretCoords(view.state.selection.main.head)
            const r = view.dom.getBoundingClientRect()
            openAt(c ? c.left : r.left, c ? c.bottom : r.top)
            openPoint = null // 键盘打开:没有"原地松开"这回事
            return true
        }
        openers.set(view, showAtCursor)
        // Shift+F10(Monaco ShowContextMenu 的键位,焦点在文本输入上)
        const onShiftF10 = (e: KeyboardEvent) => {
            if (e.key !== 'F10' || !e.shiftKey || e.ctrlKey || e.altKey || e.metaKey || e.defaultPrevented) return
            const t = e.target
            if (!(t instanceof Node) || !view.contentDOM.contains(t)) return
            if (!showAtCursor()) return
            e.preventDefault()
            e.stopPropagation()
        }
        view.dom.addEventListener('keydown', onShiftF10)

        view.dom.addEventListener('contextmenu', onContext)
        // 不经 config.overlays 手动挂的也要随 view.destroy 收掉(菜单 DOM + window 监听)
        const offDestroy = view.onDestroy(() => close())

        return () => {
            close()
            offDestroy()
            view.dom.removeEventListener('contextmenu', onContext)
            view.dom.removeEventListener('keydown', onShiftF10)
            openers.delete(view)
        }
    }
}

/** editor.action.showContextMenu:在光标处打开右键菜单;contextmenu 选项为 false 或没装菜单 → false */
export function showContextMenu(view: EditorView): boolean {
    return openers.get(view)?.() ?? false
}

export function contextMenuIsOpen(): boolean {
    return !!document.querySelector('body > .cm-context-menu')
}

