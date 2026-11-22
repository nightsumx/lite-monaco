// 无障碍主路径(M2.5)—— contenteditable 最小 ARIA + 实时播报。
// 非完整 screen-reader optimized mode;覆盖:role/label/live region/选区与诊断播报。

import type { EditorView } from '../view/editorview'
import { diagnosticsField, setDiagnostics } from './diagnostics'
import { getOption } from '../options'
import { toggleTabFocusMode, tabFocusMoves } from '../edit/commands'
import { AccessibilitySupport } from '../options/types'

export interface A11yOptions {
    /** aria-label,默认 "Code editor" */
    label?: string
    /** 播报选区变化,默认 true */
    announceSelection?: boolean
    /** 播报诊断数量变化,默认 true */
    announceDiagnostics?: boolean
}

const LIVE_ATTR = 'data-cm-a11y-live'
/** Monaco aria.ts:整条消息塞进 DOM,太长会让浏览器卡住(#94233) */
const MAX_MESSAGE_LENGTH = 20000

/**
 * 播报容器,结构同 Monaco base/browser/ui/aria:
 *   2 × role=alert(aria-atomic,assertive)  —— alert()
 *   2 × aria-live=polite(aria-atomic)       —— status()
 * 各两个是为了重复消息也能再读一遍:新消息和当前容器里的相同就写进另一个容器。
 * 容器本身带 data-cm-a11y-live,textContent 是四个容器的并集。
 */
interface AriaContainers { root: HTMLElement, alerts: [HTMLElement, HTMLElement], statuses: [HTMLElement, HTMLElement] }
const containers = new WeakMap<HTMLElement, AriaContainers>()

function ensureAriaContainers(view: EditorView): AriaContainers {
    const found = view.dom.querySelector(`[${LIVE_ATTR}]`) as HTMLElement | null
    const known = found && containers.get(found)
    if (known) return known
    found?.remove()
    const doc = view.dom.ownerDocument
    const root = doc.createElement('div')
    root.setAttribute(LIVE_ATTR, '1')
    root.className = 'cm-aria-container'
    // 视觉隐藏,屏幕阅读器可读
    root.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;'
    const mk = (cls: string, set: (el: HTMLElement) => void) => {
        const el = doc.createElement('div')
        el.className = cls
        set(el)
        el.setAttribute('aria-atomic', 'true')
        root.appendChild(el)
        return el
    }
    const alert = () => mk('cm-alert', el => el.setAttribute('role', 'alert'))
    const status = () => mk('cm-status', el => el.setAttribute('aria-live', 'polite'))
    const c: AriaContainers = { root, alerts: [alert(), alert()], statuses: [status(), status()] }
    containers.set(root, c)
    view.dom.appendChild(root)
    return c
}

function insertMessage(target: HTMLElement, msg: string): void {
    target.textContent = msg.length > MAX_MESSAGE_LENGTH ? msg.slice(0, MAX_MESSAGE_LENGTH) : msg
    // 同 Monaco:让 role=alert 在各浏览器里都触发播报
    target.style.visibility = 'hidden'
    target.style.visibility = 'visible'
}

function write(pair: [HTMLElement, HTMLElement], msg: string): void {
    const [a, b] = pair
    if (a.textContent !== msg) { b.textContent = ''; insertMessage(a, msg) }
    else { a.textContent = ''; insertMessage(b, msg) }
}

/** Monaco aria.alert:紧急、打断式(role=alert,assertive)。命令的结果、错误提示用它 */
export function alert(view: EditorView, message: string): void {
    write(ensureAriaContainers(view).alerts, message)
}

/** Monaco aria.status:礼貌式(aria-live=polite),等读屏读完当前这句再读 */
export function status(view: EditorView, message: string): void {
    write(ensureAriaContainers(view).statuses, message)
}

/** 向编辑器 live region 播报(礼貌式)。同 `status`,保留旧名 */
export function announce(view: EditorView, message: string): void {
    status(view, message)
}

/** Monaco ariaLabel 的默认值 */
const DEFAULT_ARIA_LABEL = 'Editor content'

/** 生效的 aria-label:ariaLabel 选项被用户改过就用它,否则调用方给的 opts.label,最后 Monaco 的默认 */
export function ariaLabelOf(view: EditorView, opts: A11yOptions = {}): string {
    const o = getOption(view.state, 'ariaLabel') as string | undefined
    if (typeof o === 'string' && o !== DEFAULT_ARIA_LABEL) return o
    return opts.label ?? DEFAULT_ARIA_LABEL
}

/** Monaco ariaLabelForScreenReaderContent:accessibilitySupport 关掉时,标签换成「编辑器此时不可访问」 */
export function screenReaderLabel(view: EditorView, opts: A11yOptions = {}): string {
    if (getOption(view.state, 'accessibilitySupport') === AccessibilitySupport.Disabled)
        return 'The editor is not accessible at this time.'
    return ariaLabelOf(view, opts)
}

function setAttr(el: Element, name: string, value: string): void {
    if (el.getAttribute(name) !== value) el.setAttribute(name, value)
}

/**
 * 同步随状态变的 ARIA 属性(Monaco screenReaderSupport._updateDomAttributes + setAriaOptions)。
 * aria-autocomplete:只读 none,否则 both;补全列表有 activedescendant 时 list + haspopup=true。
 */
export function syncEditorAria(view: EditorView, opts: A11yOptions = {}): void {
    const el = view.contentDOM
    const active = el.hasAttribute('aria-activedescendant')
    setAttr(el, 'role', 'textbox')
    setAttr(el, 'aria-required', getOption(view.state, 'ariaRequired') ? 'true' : 'false')
    setAttr(el, 'aria-multiline', 'true')
    setAttr(el, 'aria-roledescription', 'editor')
    setAttr(el, 'aria-label', screenReaderLabel(view, opts))
    setAttr(el, 'autocomplete', 'off')
    // Monaco 只在 setAriaOptions 之后才有 aria-haspopup:补全开着 true,关了写回 false,从没开过就不写
    if (active) setAttr(el, 'aria-haspopup', 'true')
    else if (el.hasAttribute('aria-haspopup')) setAttr(el, 'aria-haspopup', 'false')
    setAttr(el, 'aria-autocomplete', active ? 'list' : view.state.readOnly || getOption(view.state, 'readOnly') ? 'none' : 'both')
}

/** Monaco setAriaOptions({ activeDescendant }):补全列表选中项的 id;undefined 清掉 */
export function setActiveDescendant(view: EditorView, id: string | undefined): void {
    if (id) view.contentDOM.setAttribute('aria-activedescendant', id)
    else view.contentDOM.removeAttribute('aria-activedescendant')
    syncEditorAria(view)
}

export function applyEditorA11y(view: EditorView, opts: A11yOptions = {}): void {
    syncEditorAria(view, opts)
    // Monaco view.ts:外层 role=code(application 会让读屏进入应用模式、吞掉浏览键)
    if (view.dom.getAttribute('role') === 'application' || !view.dom.hasAttribute('role'))
        view.dom.setAttribute('role', 'code')
    view.dom.removeAttribute('aria-label')
    ensureAriaContainers(view)
}

function selectionSummary(view: EditorView): string {
    const sel = view.state.selection.main
    const doc = view.state.doc
    const line = doc.lineAt(sel.head)
    const col = sel.head - line.from + 1
    if (sel.empty)
        return `Line ${line.number}, column ${col}`
    const len = Math.abs(sel.to - sel.from)
    return `Selected ${len} characters, line ${line.number}`
}

function diagnosticsSummary(view: EditorView): string | null {
    const diags = view.state.field(diagnosticsField, false)
    if (!diags) return null
    if (!diags.length) return 'No diagnostics'
    let err = 0, warn = 0, info = 0
    for (const d of diags) {
        if (d.severity === 'error') err++
        else if (d.severity === 'warning') warn++
        else info++
    }
    const parts: string[] = []
    if (err) parts.push(`${err} error${err > 1 ? 's' : ''}`)
    if (warn) parts.push(`${warn} warning${warn > 1 ? 's' : ''}`)
    if (info) parts.push(`${info} info`)
    return parts.join(', ')
}

/**
 * 挂载 a11y:ARIA 属性 + 选区/诊断播报。
 * 返回卸载函数。
 */
export function a11ySession(view: EditorView, opts: A11yOptions = {}): () => void {
    applyEditorA11y(view, opts)
    const announceSel = opts.announceSelection !== false
    const announceDiag = opts.announceDiagnostics !== false
    let lastDiagKey = ''
    let selTimer: ReturnType<typeof setTimeout> | null = null

    const off = view.onTransaction((tr) => {
        // 运行时改 ariaLabel / ariaRequired / readOnly / accessibilitySupport:下一个事务就更新 DOM
        syncEditorAria(view, opts)
        if (announceSel && tr.selection) {
            if (selTimer) clearTimeout(selTimer)
            selTimer = setTimeout(() => announce(view, selectionSummary(view)), 400)
        }
        if (announceDiag) {
            let diagTouched = false
            for (const e of tr.effects) {
                if (e.is(setDiagnostics)) { diagTouched = true; break }
            }
            if (diagTouched) {
                const key = diagnosticsSummary(view) ?? 'No diagnostics'
                if (key !== lastDiagKey) {
                    lastDiagKey = key
                    announce(view, key)
                }
            }
        }
    })

    return () => {
        if (selTimer) clearTimeout(selTimer)
        off()
        view.dom.querySelector(`[${LIVE_ATTR}]`)?.remove()
    }
}

/**
 * tabFocusMode 选项:true 时 Tab 键把焦点移出编辑器(Monaco 的 TabFocus 是全页一份,
 * 工作台把 editor.tabFocusMode 设置同步进去)。这里同样:选项值变化时把全页开关调到那个值,
 * 之后 Ctrl+M / ⌃⇧M(editor.action.toggleTabFocusMode)照常翻它。
 */
export function tabFocusModeSync(view: EditorView): () => void {
    let last: boolean | undefined
    const sync = () => {
        const want = getOption(view.state, 'tabFocusMode') === true
        if (want === last) return
        const first = last === undefined
        last = want
        // 起始是默认值 false 时不动全页状态(别的实例或用户已经切过)
        if (first && !want) return
        if (tabFocusMoves() !== want) toggleTabFocusMode(view)
    }
    const off = view.onTransaction(() => sync())
    sync()
    return off
}

/** editor.action.toggleTabFocusMode:翻全页开关并播报新状态(Ctrl+M / ⌃⇧M 与 F1 面板共用) */
export function toggleTabFocusModeAnnounced(view: EditorView): boolean {
    toggleTabFocusMode(view)
    alert(view, tabFocusMoves()
        ? 'Pressing Tab will now move focus to the next focusable element'
        : 'Pressing Tab will now insert the tab character')
    return true
}
