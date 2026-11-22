// 补全控件的 UI 层(下拉列表 + 详情 + 提示行)。只管「怎么画 / 怎么滚 / 怎么挪焦点」,不管「有哪些候选」——
// 候选 / 过滤 / 接受全在 lang 层的 SuggestModel + SuggestController,它们经 SuggestHost 把结果喂进每个 view 一份的 SuggestUi。
//
// 外观照 Monaco 0.52 suggestWidget:
//   · 宽 430、行高 = 编辑器行高、最多 12 行、虚拟渲染;只在聚焦行显示 detail;⌃Space 切详情;东/南(上方时北)边可拖改尺寸
//   · 显式触发没结果 → "No suggestions.";语言源 50ms 还没回 → "Loading..."(suggestWidget State.Empty / Loading)
// 弹层挂 document.body(position:fixed),绝不进 contenteditable(DOM≡doc)。

import type { StateCommand } from '../model/state'
import type { EditorView } from '../view/editorview'
import { wheelScrollDelta } from '../input/wheel'
import { getOption } from '../options'
import { setActiveDescendant } from './a11y'
import { inheritThemeVars } from '../chrome/themevars'

/** 列表一行(宿主按需 rowAt 生成;不预先物化,几万候选也不卡) */
export interface SuggestRow {
    label: string
    /** variable|function|method|class|interface|property|field|keyword|module|enum|text|snippet|file */
    kind: string
    /** Monaco CompletionItemTag.Deprecated:半透明 + 删除线,不画命中高亮 */
    deprecated: boolean
    /** label 里要高亮的下标(模糊匹配命中) */
    matches: readonly number[]
    /** 聚焦行内联显示的 detail */
    detail?: string
    /** label 对象形态的 detail / description(紧跟 label,暗色) */
    labelDetail?: string
    labelDescription?: string
}

/** 聚焦项的细节(Monaco resolveCompletionItem 之后) */
export interface SuggestInfo {
    detail?: string
    documentation?: string
    /** documentation 是 markdown 时由源给渲染;没有就按纯文本显示 */
    renderDocumentation?: () => HTMLElement
}

/** lang 层给 UI 的回调口 */
export interface SuggestHost {
    rowAt(i: number): SuggestRow
    /** 第 i 项的细节;没解析完先给手上有的,解析完调 onReady 重画 */
    info(i: number, onReady: () => void): SuggestInfo | null
    accept(i: number): void
    /** 列表里挪了焦点(方向键 / 翻页):控制器的焦点项跟着变 */
    focus(i: number): void
    close(): void
}

export interface SuggestUiState {
    open: boolean
    /** 只显示一行提示、没有列表(显式触发:loading = Loading...,empty = No suggestions.) */
    message: '' | 'loading' | 'empty'
    count: number
    selected: number
    /** 有聚焦项(Monaco HasFocusedSuggestion) */
    focused: boolean
    /** 列表 scrollTop(px;Monaco 列表按像素滚,翻页落点由它算) */
    scrollTop: number
    /** 触发词的起点 / 终点(文档偏移):定位锚 */
    from: number
    to: number
    /** 每次候选集换了就 +1(行缓存键) */
    epoch: number
    /** 详情面板展开(⌃Space 切换,跨次打开保留) */
    details: boolean
}

export type SuggestCommandName = 'accept' | 'acceptAlt' | 'enter' | 'tab' | 'shiftTab' | 'trigger' | 'triggerAction' | 'close' | 'leaveSnippet'

/** Monaco suggest-widget maxVisibleSuggestions */
export const COMPLETION_VISIBLE_ROWS = 12

interface ListGeom { rowH: number, h: number }

const CLOSED: SuggestUiState = { open: false, message: '', count: 0, selected: 0, focused: true, scrollTop: 0, from: 0, to: 0, epoch: 0, details: false }

/** 每个 view 一份的控件状态(store):lang 层写、overlay 读 */
export class SuggestUi {
    state: SuggestUiState = CLOSED
    host: SuggestHost | null = null
    /** overlay 量出的列表几何(翻页按它算;Monaco list renderHeight = 列表高含边框) */
    geom: ListGeom | null = null
    /** 键位命令的落点(lang 层设) */
    command: ((name: SuggestCommandName, arg?: unknown) => boolean) | null = null
    private readonly subs = new Set<() => void>()
    private readonly showSubs = new Set<() => void>()
    private readonly hideSubs = new Set<() => void>()
    private epoch = 0
    private details = false

    subscribe(fn: () => void): () => void {
        this.subs.add(fn)
        return () => { this.subs.delete(fn) }
    }
    /** 控件从关到开 / 从开到关(Monaco SuggestWidget.onDidShow / onDidHide) */
    onDidShow(fn: () => void): () => void { this.showSubs.add(fn); return () => { this.showSubs.delete(fn) } }
    onDidHide(fn: () => void): () => void { this.hideSubs.add(fn); return () => { this.hideSubs.delete(fn) } }
    private set(next: SuggestUiState): void {
        const was = this.state.open
        this.state = next
        for (const fn of [...this.subs]) fn()
        if (!was && next.open) for (const fn of [...this.showSubs]) fn()
        else if (was && !next.open) for (const fn of [...this.hideSubs]) fn()
    }
    /** 只重画(细节异步到了等) */
    touch(): void { for (const fn of [...this.subs]) fn() }

    private geomFor(n: number): ListGeom {
        return this.geom ?? { rowH: 20, h: Math.min(n, COMPLETION_VISIBLE_ROWS) * 20 + 2 }
    }

    // Monaco list.reveal(index)(不给 relativeTop):行顶在视口上方 → 顶对齐;行底够到视口底 → 底对齐
    private reveal(scrollTop: number, selected: number, n: number): number {
        const g = this.geomFor(n)
        const top = selected * g.rowH
        let st = scrollTop
        if (top < st) st = top
        else if (top + g.rowH >= st + g.h) st = top + g.rowH - g.h
        return Math.max(0, Math.min(st, n * g.rowH - g.h))
    }

    /** 候选列表(新结果 / 重新过滤):selected 是控制器挑的焦点项,focused = 有没有焦点 */
    show(spec: { host: SuggestHost, count: number, selected: number, focused: boolean, from: number, to: number }): void {
        this.host = spec.host
        const selected = Math.max(0, Math.min(spec.count - 1, spec.selected))
        this.set({
            open: true, message: '', count: spec.count, selected, focused: spec.focused,
            scrollTop: this.reveal(0, selected, spec.count), from: spec.from, to: spec.to,
            epoch: ++this.epoch, details: this.details,
        })
    }
    showMessage(message: 'loading' | 'empty', from: number, to: number): void {
        this.set({ ...CLOSED, open: true, message, from, to, epoch: ++this.epoch, details: this.details })
    }
    hide(): void {
        if (!this.state.open) return
        this.set({ ...CLOSED, details: this.details })
    }
    /** 控制器的焦点项变了(onDidFocus):跟着滚到可见 */
    setSelected(i: number): void {
        const s = this.state
        if (!s.open || !s.count) return
        const selected = Math.max(0, Math.min(s.count - 1, i))
        if (s.selected === selected && s.focused) return
        this.set({ ...s, selected, focused: true, scrollTop: this.reveal(s.scrollTop, selected, s.count) })
    }
    setScrollTop(px: number): void {
        const s = this.state
        if (s.open) this.set({ ...s, scrollTop: Math.max(0, px) })
    }
    setDetails(on: boolean): void {
        this.details = on
        if (this.state.open) this.set({ ...this.state, details: on })
    }
    get detailsOn(): boolean { return this.details }

    /**
     * Monaco selectNext/Prev(Page)Suggestion 的 precondition:Visible && (MultipleSuggestions || !HasFocusedSuggestion)。
     * 只剩一项且已聚焦时 ↑↓ / PgUp / PgDn 不归补全:穿透成光标移动,光标离开词后列表随之关闭。
     */
    canNavigate(): boolean {
        const s = this.state
        return s.open && !s.message && s.count > 0 && (s.count > 1 || !s.focused)
    }

    /** 方向键:到头环绕;没有聚焦项时第一次 ↓ 聚焦第一项,↑ 聚焦最后一项(Monaco list.focusNext / focusPrevious) */
    move(dir: 1 | -1): boolean {
        if (!this.canNavigate()) return false
        const s = this.state
        const n = s.count
        const from = s.focused ? s.selected : dir > 0 ? -1 : 0
        this.focusTo(((from + dir) % n + n) % n)
        return true
    }

    /**
     * Monaco list.focusNextPage / focusPreviousPage(按像素):
     *   下翻:末行 = indexAt(scrollTop + 视口高) - 1;焦点在它上方 → 跳过去,否则滚一屏再取末行
     *   上翻:首行 = scrollTop 为 0 时 indexAt(0),否则 indexAfter(scrollTop - 1)(多 1:半露的那行不算);
     *         不在首行 → 跳过去,否则上滚一屏再取首行。到头停住。
     */
    page(dir: 1 | -1): boolean {
        if (!this.canNavigate()) return false
        const s = this.state
        const n = s.count
        const { rowH, h } = this.geomFor(n)
        const max = Math.max(0, n * rowH - h)
        const at = (px: number) => Math.min(n, Math.floor(px / rowH))
        let { scrollTop, selected } = s
        if (dir > 0) {
            const last = Math.max(0, at(scrollTop + h) - 1)
            if (last > selected) selected = last
            else if (Math.min(max, scrollTop + h) !== scrollTop) {
                scrollTop = Math.min(max, scrollTop + h)
                selected = Math.min(n - 1, Math.max(0, at(scrollTop + h) - 1))
            }
        }
        else {
            const firstAt = (st: number) => st === 0 ? 0 : Math.min(n, at(st - 1) + 1)
            const first = firstAt(scrollTop)
            if (selected > first) selected = first
            else if (scrollTop > 0) {
                scrollTop = Math.max(0, scrollTop - h)
                selected = Math.min(n - 1, firstAt(scrollTop))
            }
        }
        this.set({ ...s, scrollTop: this.reveal(scrollTop, selected, n), selected, focused: true })
        this.host?.focus(selected)
        return true
    }

    private focusTo(i: number): void {
        const s = this.state
        this.set({ ...s, selected: i, focused: true, scrollTop: this.reveal(s.scrollTop, i, s.count) })
        this.host?.focus(i)
    }
    /** 点选 / 程序设焦点 */
    select(i: number): void {
        const s = this.state
        if (!s.open || !s.count) return
        this.focusTo(Math.max(0, Math.min(s.count - 1, i)))
    }
}

const stores = new WeakMap<object, SuggestUi>()
/** view 的补全控件状态(没有就建) */
export function suggestUi(view: object): SuggestUi {
    let ui = stores.get(view)
    if (!ui) { ui = new SuggestUi(); stores.set(view, ui) }
    return ui
}
/** 只查不建(上下文键之类的读者) */
export function peekSuggestUi(view: object): SuggestUi | undefined { return stores.get(view) }

// —— 键位命令:全是薄壳,落到 lang 层设在 store 上的 command / 或 store 自己 ——
const uiOf = (target: object): SuggestUi | undefined => stores.get(target)
const cmd = (name: SuggestCommandName): StateCommand => target => uiOf(target)?.command?.(name) ?? false
/** 带参数的动作入口(editor.action.triggerSuggest 的 { auto }) */
export const runSuggestCommand = (view: object, name: SuggestCommandName, arg?: unknown): boolean => uiOf(view)?.command?.(name, arg) ?? false
export const suggestAccept = cmd('accept')
export const suggestAcceptAlternative = cmd('acceptAlt')
export const suggestAcceptOnEnter = cmd('enter')
export const suggestTab = cmd('tab')
export const suggestShiftTab = cmd('shiftTab')
export const suggestTrigger = cmd('trigger')
export const suggestClose = cmd('close')
export const suggestLeaveSnippet = cmd('leaveSnippet')
export const suggestNext: StateCommand = target => uiOf(target)?.move(1) ?? false
export const suggestPrev: StateCommand = target => uiOf(target)?.move(-1) ?? false
export const suggestPageNext: StateCommand = target => uiOf(target)?.page(1) ?? false
export const suggestPagePrev: StateCommand = target => uiOf(target)?.page(-1) ?? false

// Monaco suggestWidget getLayoutInfo().verticalPadding
const SUGGEST_VERTICAL_PADDING = 22

// —— 定位:屏上坐标 + position:fixed ——
// 铁律:列表顶永远贴 caret 行(下或上),绝不能退化成「容器顶 + 4」。
// 竖直照 Monaco suggestWidget._layout:下方放得下整表 → 下;否则取上下中空间大的一侧,并把高度缩到放得下。
// bounds 由调用方给:实际传窗口(Monaco 按 body 算空间,列表可伸出编辑器)。
export function placeCompletionWidget(
    caret: { left: number, top: number, bottom: number },
    list: { w: number, h: number, minH?: number },
    bounds: { left: number, top: number, right: number, bottom: number },
): { left: number, top: number, height: number, above: boolean } {
    // 实测 Monaco 0.52:下方时列表顶 = caret 行底;上方时列表底 = caret 行顶 - 2
    const gapAbove = 2
    // 水平:贴 caret.left,只在越出 bounds 时夹
    let left = caret.left
    if (left + list.w > bounds.right - 4)
        left = Math.max(bounds.left + 4, bounds.right - list.w - 4)
    if (left < bounds.left + 4)
        left = bounds.left + 4

    const below = Math.max(0, bounds.bottom - caret.bottom)
    const above = Math.max(0, caret.top - bounds.top - gapAbove)
    const minH = Math.min(list.minH ?? 0, list.h)
    // 下方放得下整表,或下方空间不比上方小 → 下(高度缩到放得下)
    if (list.h <= below || below >= above) {
        const height = Math.max(minH, Math.min(list.h, below))
        return { left, top: caret.bottom, height, above: false }
    }
    const height = Math.max(minH, Math.min(list.h, above))
    return { left, top: caret.top - gapAbove - height, height, above: true }
}

// —— 渲染:kind 图标 + 模糊高亮 + 聚焦行 detail + 详情面板 ——

function renderLabel(c: SuggestRow): HTMLElement {
    const span = document.createElement('span')
    span.className = 'cm-completionLabel'
    const label = c.label
    const hit = new Set(c.matches)
    if (!hit.size) {
        span.textContent = label
        return span
    }
    let buf = ''
    let inHit = false
    const flush = (asHit: boolean) => {
        if (!buf) return
        if (asHit) {
            const em = document.createElement('span')
            em.className = 'cm-completionMatched'
            em.textContent = buf
            span.appendChild(em)
        }
        else span.appendChild(document.createTextNode(buf))
        buf = ''
    }
    for (let i = 0; i < label.length; i++) {
        const h = hit.has(i)
        if (h !== inHit) {
            flush(inHit)
            inHit = h
        }
        buf += label[i]
    }
    flush(inHit)
    return span
}

// kind → codicon(Monaco CompletionItemKinds.toIcon)
const KIND_CODICON: Record<string, string> = {
    variable: 'symbol-variable',
    field: 'symbol-field',
    property: 'symbol-property',
    function: 'symbol-function',
    method: 'symbol-method',
    class: 'symbol-class',
    interface: 'symbol-interface',
    type: 'symbol-type-parameter',
    enum: 'symbol-enum',
    keyword: 'symbol-keyword',
    module: 'symbol-module',
    text: 'symbol-text',
    file: 'symbol-text',
    snippet: 'symbol-snippet',
}

/** Monaco suggestWidget accessibilityProvider.getAriaLabel:label + detail/description,最后是 kind 的读法 */
const KIND_ARIA: Record<string, string> = {
    method: 'Method', function: 'Function', field: 'Field', variable: 'Variable', class: 'Class', interface: 'Interface',
    module: 'Module', property: 'Property', enum: 'Enum', keyword: 'Keyword', text: 'Text', file: 'File', snippet: 'Snippet',
    type: 'Type Parameter',
}
export function suggestAriaLabel(opt: SuggestRow): string {
    const kind = KIND_ARIA[opt.kind] ?? ''
    const { labelDetail: detail, labelDescription: description } = opt
    if (detail && description) return `${opt.label} ${detail}, ${description}, ${kind}`
    if (detail) return `${opt.label} ${detail}, ${kind}`
    if (description) return `${opt.label}, ${description}, ${kind}`
    return `${opt.label}, ${kind}`
}

let viewIdSeq = 0
const viewIds = new WeakMap<object, number>()
function viewId(view: object): number {
    let id = viewIds.get(view)
    if (id == null) { id = ++viewIdSeq; viewIds.set(view, id) }
    return id
}


/** 补全列表默认宽(Monaco suggest-widget defaultSize 430) */
const LIST_WIDTH = 430
/** 详情面板宽(Monaco 默认 330) */
const DETAILS_WIDTH = 330

/** Monaco canExpandCompletionItem:有文档,或 detail 不等于 label */
function canExpand(opt: SuggestRow, r: SuggestInfo | null): boolean {
    return !!r?.documentation || (!!r?.detail && r.detail !== opt.label)
}

export function suggestOverlay(view: EditorView): () => void {
    let root: HTMLElement | null = null
    let sizer: HTMLElement | null = null
    let details: HTMLElement | null = null
    /** 当前画的是提示行(Loading / No suggestions)还是列表;换了就整个重建 */
    let mode: '' | 'list' | 'message' = ''
    const sashes: Partial<Record<'n' | 'e' | 's', HTMLElement>> = {}
    let posRaf = 0
    // 上次 layout 定下的方向和高度。Monaco 的 suggest widget 是 content widget:上下 preference 只在 layout
    // (打开、打字、列表变化)时挑,滚动只按新的光标坐标重放,不翻也不缩,所以列表可以伸出编辑器上下缘
    // (实测 /tmp/lc-hunt/r5/O/m-suggest-scroll.ts)。
    let locked: { above: boolean, height: number } | null = null
    let pendingLayout = false
    let lastKey = ''
    let rowH = 20
    // 拖 sash 定下的尺寸(Monaco PersistedWidgetSize;这里只在内存里,跟着 view 走);live = 正在拖
    let persisted: { w: number, h: number } | null = null
    let live: { w: number, h: number } | null = null
    const id = viewId(view)
    const doc = view.dom.ownerDocument

    const remove = () => {
        if (posRaf) {
            cancelAnimationFrame(posRaf)
            posRaf = 0
        }
        if (root) { root.remove(); root = null; sizer = null }
        if (details) { details.remove(); details = null }
        delete sashes.n
        delete sashes.e
        delete sashes.s
        mode = ''
        locked = null
        live = null
        pendingLayout = false
        lastKey = ''
        // Monaco hideWidget:记下的高度至少 4.3 行,免得误拖成一行后每次都只开一行
        const minH = Math.ceil(rowH * 4.3)
        if (persisted && persisted.h < minH) persisted = { ...persisted, h: minH }
        setActiveDescendant(view, undefined)
    }

    const ui = suggestUi(view)
    const geom = (): ListGeom => ui.geom ?? { rowH, h: COMPLETION_VISIBLE_ROWS * rowH + 2 }

    const acceptAt = (idx: number) => {
        if (!ui.state.open) return
        ui.host?.accept(idx)
        view.focus()
    }

    // 异步细节到了:这一项还是聚焦项就重画(详情、行内 detail、读更多箭头)
    const refreshIfSelected = (idx: number) => () => {
        if (ui.state.open && ui.state.selected === idx) ui.touch()
    }

    const toggleDetails = () => ui.setDetails(!ui.state.details)

    const editorFont = () => {
        const st = view.contentDOM.ownerDocument.defaultView?.getComputedStyle(view.contentDOM)
        // suggestFontSize(0 = 跟编辑器)
        const fs = Number(getOption(view.state, 'suggestFontSize')) || 0
        return { family: st?.fontFamily || '', size: fs > 0 ? `${fs}px` : st?.fontSize || '' }
    }

    const measureRowH = () => {
        // suggestLineHeight(0 = 跟编辑器行高;Monaco clamp 到 8..1000)
        const slh = Number(getOption(view.state, 'suggestLineHeight')) || 0
        if (slh > 0) return Math.max(8, Math.min(1000, Math.round(slh)))
        const lh = view.oracle?.lineHeight
        return lh && lh > 4 ? Math.round(lh) : 20
    }

    const hide = () => {
        if (root) root.style.visibility = 'hidden'
        if (details) details.style.visibility = 'hidden'
        for (const s of Object.values(sashes)) s.style.display = 'none'
    }

    // scrolled:只是编辑器 / 页面滚了(沿用 locked 的方向和高度);否则重新 layout
    const position = (scrolled = false) => {
        if (!root) return
        const cs = ui.state
        if (!cs.open) return
        const head = view.state.selection.main.head
        const anchorPos = head >= cs.from && head <= cs.to ? head : cs.to
        const glyph = view.caretCoords(anchorPos) ?? view.caretCoords(cs.from)
        // caretCoords 是字形盒(比行矮);Monaco 按行盒定位(列表顶 = 行底)→ 以字形中线扩成行高
        const caret = glyph && glyph.bottom - glyph.top < rowH
            ? { left: glyph.left, top: (glyph.top + glyph.bottom - rowH) / 2, bottom: (glyph.top + glyph.bottom + rowH) / 2 }
            : glyph
        if (!caret) { hide(); return }
        const win = doc.defaultView
        const winB = { left: 0, top: 0, right: win?.innerWidth ?? 1920, bottom: win?.innerHeight ?? 1080 }
        const sr = view.scrollDOM.getBoundingClientRect()
        // 光标滚出编辑器可视区 → 藏起来(Monaco content widget 锚点不可见即隐藏)
        const hasBox = sr.height > 1 && sr.width > 1
        if (hasBox && (caret.bottom <= sr.top || caret.top >= sr.bottom)) { hide(); return }
        if (mode === 'message') {
            // Monaco _layout 的 Empty / Loading:宽 = 默认宽一半,高 = 一行 + 边框,只放下方,不能拖
            root.style.left = `${Math.round(Math.min(caret.left, winB.right - LIST_WIDTH / 2 - 4))}px`
            root.style.top = `${Math.round(caret.bottom)}px`
            root.style.width = `${LIST_WIDTH / 2}px`
            root.style.height = `${rowH + 2}px`
            root.style.visibility = 'visible'
            return
        }
        const n = cs.count
        const fullH = n * rowH + 2
        // 宽高:拖动中 → 拖的值;否则记下的值;都没有 → 默认 430 × 12 行。宽不超过窗口 - 边框 - 2×14
        const want = live ?? persisted ?? { w: LIST_WIDTH, h: COMPLETION_VISIBLE_ROWS * rowH + 2 }
        const w = Math.max(220, Math.min(want.w, winB.right - 2 - 28))
        root.style.width = `${w}px`
        const placed = placeCompletionWidget(
            { left: caret.left, top: caret.top, bottom: caret.bottom },
            { w, h: Math.min(Math.max(want.h, rowH), fullH), minH: rowH + 2 },
            // 水平、竖直都用窗口:列表可伸出编辑器右缘和底边(Monaco suggestWidget._layout 按 body 算空间,
            // 上下各扣 verticalPadding 22:下方 = 窗口高 - 行底 - 22,上方 = 行顶 - 22;函数里上方另扣 2)
            { left: winB.left, right: winB.right, top: winB.top + SUGGEST_VERTICAL_PADDING - 2, bottom: winB.bottom - SUGGEST_VERTICAL_PADDING },
        )
        if ((scrolled || live) && locked) {
            // 滚动只重放位置;拖 sash 时 Monaco lockPreference,方向不变
            placed.above = locked.above
            placed.height = live ? Math.min(Math.max(live.h, rowH), fullH) : Math.min(locked.height, fullH)
            placed.top = locked.above ? caret.top - 2 - placed.height : caret.bottom
            if (live) locked = { above: locked.above, height: placed.height }
        }
        else locked = { above: placed.above, height: placed.height }
        ui.geom = { rowH, h: placed.height }
        root.style.left = `${Math.round(placed.left)}px`
        root.style.top = `${Math.round(placed.top)}px`
        root.style.height = `${Math.round(placed.height)}px`
        root.style.maxHeight = 'none'
        root.style.maxWidth = 'none' // 宽只受窗口限(上面已夹),主题 CSS 的 max-width 会把拖宽截住
        root.style.visibility = 'visible'
        // Monaco enableSashes:下方 (东, 南),上方 (北, 东);4px 宽、骑在边上
        const L = Math.round(placed.left)
        const T = Math.round(placed.top)
        const H = Math.round(placed.height)
        const place = (s: HTMLElement | undefined, on: boolean, x: number, y: number, sw: number, sh: number) => {
            if (!s) return
            s.style.display = on ? 'block' : 'none'
            s.style.cssText += `left:${x}px;top:${y}px;width:${sw}px;height:${sh}px;`
        }
        place(sashes.e, true, L + w - 2, T, 4, H)
        place(sashes.s, !placed.above, L, T + H - 2, w, 4)
        place(sashes.n, placed.above, L, T - 2, w, 4)
        if (details) {
            const dl = placed.left + w + DETAILS_WIDTH <= winB.right ? placed.left + w - 1 : placed.left - DETAILS_WIDTH + 1
            details.style.left = `${Math.round(dl)}px`
            details.style.top = placed.above
                ? `${Math.round(placed.top + placed.height - details.offsetHeight)}px`
                : `${Math.round(placed.top)}px`
            details.style.visibility = 'visible'
        }
        renderRows()
    }

    const schedulePosition = (scrolled = false) => {
        if (!scrolled) pendingLayout = true
        if (posRaf) cancelAnimationFrame(posRaf)
        posRaf = requestAnimationFrame(() => {
            posRaf = 0
            const layout = pendingLayout
            pendingLayout = false
            position(!layout)
        })
    }

    // 虚拟渲染:只画视口附近的行(Monaco 列表虚拟化),不截断候选;聚焦行滚出视口也留着(Monaco 焦点不随滚动丢)
    const renderRows = () => {
        if (!root || !sizer) return
        const cs = ui.state
        if (!cs.open) return
        const n = cs.count
        const showDetails = cs.details
        const h = locked?.height ?? COMPLETION_VISIBLE_ROWS * rowH + 2
        const first = Math.max(0, Math.floor(cs.scrollTop / rowH) - 2)
        const last = Math.min(n - 1, Math.ceil((cs.scrollTop + h) / rowH) + 2)
        const so = (getOption(view.state, 'suggest') ?? {}) as Record<string, any>
        const showIcons = so.showIcons !== false
        const inlineDetails = so.showInlineDetails !== false
        const key = `${first}:${last}:${cs.selected}:${cs.focused}:${cs.epoch}:${showDetails}:${rowH}:${showIcons}:${inlineDetails}:${editorFont().size}`
        if (key === lastKey && sizer.childElementCount) return
        lastKey = key
        const font = editorFont()
        sizer.textContent = ''
        const rows: number[] = []
        if (cs.selected < first) rows.push(cs.selected)
        for (let i = first; i <= last; i++) rows.push(i)
        if (cs.selected > last) rows.push(cs.selected)
        for (const i of rows) {
            const opt = ui.host!.rowAt(i)
            const sel = cs.focused && i === cs.selected
            const item = document.createElement('div')
            item.className = sel ? 'cm-completionItem cm-completionSelected' : 'cm-completionItem'
            item.id = `cm-completion-${id}-${i}`
            item.setAttribute('role', 'option')
            item.setAttribute('aria-selected', sel ? 'true' : 'false')
            item.setAttribute('aria-label', suggestAriaLabel(opt))
            item.setAttribute('aria-posinset', String(i + 1))
            item.setAttribute('aria-setsize', String(n))
            // Monaco 行:padding-right 10,.contents padding-left 2;图标 16 宽 × 行高、右距 4
            item.style.cssText = `position:absolute;left:0;right:0;top:${i * rowH}px;height:${rowH}px;line-height:${rowH}px;min-height:0;`
                + `padding:0 10px 0 2px;gap:4px;box-sizing:border-box;`
                + (font.family ? `font-family:${font.family};` : '') + (font.size ? `font-size:${font.size};` : '')

            const icon = document.createElement('span')
            const kind = opt.kind || 'property'
            const ci = KIND_CODICON[kind] || KIND_CODICON.property
            icon.className = `cm-completionIcon codicon codicon-${ci} cm-completionIcon-${kind}`
            icon.setAttribute('aria-hidden', 'true')
            icon.style.height = `${rowH}px`
            // suggest.showIcons: false → 不画图标(Monaco no-icons)
            if (showIcons) item.appendChild(icon)

            // Monaco 废弃项:extraClasses deprecated(0.66 透明 + 删除线),matches 清空(不画命中)
            const label = renderLabel(opt.deprecated ? { ...opt, matches: [] } : opt)
            if (font.family) label.style.fontFamily = 'inherit'
            label.style.fontSize = 'inherit'
            if (opt.deprecated) {
                label.classList.add('cm-deprecated')
                label.style.opacity = '0.66'
                label.style.textDecoration = 'line-through'
            }
            item.appendChild(label)
            // Monaco label 对象形态:detail 紧跟 label,description 再靠后,都是暗色小字
            for (const [text, cls] of [[opt.labelDetail, 'cm-completionLabelDetail'], [opt.labelDescription, 'cm-completionLabelDescription']] as const) {
                if (!text) continue
                const extra = document.createElement('span')
                extra.className = cls
                extra.textContent = text
                extra.style.cssText = 'opacity:0.7;margin-left:0.6em;font-family:inherit;white-space:pre;'
                item.appendChild(extra)
            }

            const r = sel ? ui.host!.info(i, refreshIfSelected(i)) : null
            let detailEl: HTMLElement | null = null
            // Monaco:detail 只在聚焦行显示(详情面板开着时面板里显示,行内不显示)
            if (sel && !showDetails && inlineDetails) {
                const detail = r?.detail ?? opt.detail
                if (detail) {
                    detailEl = document.createElement('span')
                    detailEl.className = 'cm-completionDetail'
                    detailEl.textContent = detail
                    detailEl.style.cssText = 'flex:0 4 auto;max-width:70%;margin-left:1.1em;font-size:85%;opacity:0.7;font-family:inherit;'
                    item.appendChild(detailEl)
                }
            }
            // Monaco readMore:聚焦行、能展开、详情没开时,悬停才露出的 ›(行高见方,贴右 10px);点它切详情
            if (sel && !showDetails && canExpand(opt, r)) {
                const more = document.createElement('span')
                more.className = 'cm-completionReadMore codicon codicon-chevron-right'
                more.title = 'Read More'
                more.style.cssText = `position:absolute;right:10px;top:0;width:${rowH}px;height:${rowH}px;line-height:${rowH}px;font-size:14px;visibility:hidden;cursor:pointer;`
                more.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation() })
                more.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); toggleDetails() })
                item.appendChild(more)
                const d = detailEl
                // Monaco .focused:hover:readMore 可见,detail 让出 26px
                item.addEventListener('mouseenter', () => { more.style.visibility = 'visible'; if (d) d.style.marginRight = '26px' })
                item.addEventListener('mouseleave', () => { more.style.visibility = 'hidden'; if (d) d.style.marginRight = '' })
            }
            item.addEventListener('click', e => {
                e.preventDefault()
                e.stopPropagation()
                acceptAt(i)
            })
            sizer.appendChild(item)
        }
        setActiveDescendant(view, cs.focused ? `cm-completion-${id}-${cs.selected}` : undefined)
        renderDetails(cs, showDetails && cs.focused)
    }

    const renderDetails = (cs: SuggestUiState, show: boolean) => {
        const opt = cs.count ? ui.host!.rowAt(cs.selected) : null
        const r = opt ? ui.host!.info(cs.selected, refreshIfSelected(cs.selected)) : null
        if (!show || !opt || !canExpand(opt, r)) {
            if (details) { details.remove(); details = null }
            return
        }
        const detailText = r?.detail ?? opt.detail ?? ''
        const docText = r?.documentation ?? ''
        if (!details) {
            details = document.createElement('div')
            details.className = 'cm-completionDetails'
            details.addEventListener('mousedown', e => e.preventDefault())
            doc.body.appendChild(details)
        }
        const st = root ? doc.defaultView?.getComputedStyle(root) : null
        // Monaco suggest-details:宽 330、无圆角、字号 13 / 行高 20、界面字体
        details.style.cssText = `position:fixed;z-index:1000;width:${DETAILS_WIDTH}px;overflow:auto;box-sizing:border-box;`
            + `background:${st?.backgroundColor || '#252526'};border:1px solid ${st?.borderTopColor || '#454545'};border-radius:0;`
            + `color:${st?.color || 'inherit'};font-family:${st?.fontFamily || 'inherit'};font-size:13px;line-height:20px;visibility:hidden;`
        inheritThemeVars(view, details) // F6:主题变量(cssText 会清掉,每次重设后再抄)
        details.textContent = ''
        const close = document.createElement('span')
        close.className = 'codicon codicon-close'
        close.title = 'Close'
        close.style.cssText = `position:absolute;top:6px;right:2px;width:${20}px;height:${20}px;line-height:20px;font-size:14px;cursor:pointer;`
        close.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation() })
        close.addEventListener('click', (e) => {
            e.preventDefault()
            e.stopPropagation()
            ui.setDetails(false)
        })
        details.appendChild(close)
        let type: HTMLElement | null = null
        if (detailText) {
            type = document.createElement('p')
            type.className = 'cm-completionDetails-type'
            type.textContent = detailText
            type.style.cssText = `margin:0 24px 0 0;padding:4px 0 12px 5px;opacity:0.7;white-space:normal;word-break:break-all;font-family:${editorFont().family || 'monospace'};`
            details.appendChild(type)
        }
        let docs: HTMLElement | null = null
        const md = docText ? r?.renderDocumentation?.() : undefined
        if (md) {
            // Monaco markdown-docs:外层 padding 0、最小高 1rem+8px;内层 div 4px 5px;段落无外距
            docs = document.createElement('div')
            docs.className = 'cm-completionDetails-docs markdown-docs'
            docs.style.cssText = `margin:0;padding:0;white-space:initial;min-height:calc(1rem + 8px);${type ? '' : 'margin-right:24px;'}`
            md.style.padding = '4px 5px'
            for (const p of md.querySelectorAll('p')) p.style.margin = '0'
            docs.appendChild(md)
            details.appendChild(docs)
        }
        else if (docText) {
            docs = document.createElement('p')
            docs.className = 'cm-completionDetails-docs'
            docs.textContent = docText
            docs.style.cssText = `margin:0;padding:4px 5px;white-space:pre-wrap;${type ? '' : 'margin-right:24px;'}`
            details.appendChild(docs)
        }
        // Monaco layout(width, type.clientHeight + docs.clientHeight);窗口放不下由 overflow 滚
        const h = (type?.offsetHeight ?? 0) + (docs?.offsetHeight ?? 0)
        if (h > 0) {
            const maxH = (doc.defaultView?.innerHeight ?? 1080) - SUGGEST_VERTICAL_PADDING - 2
            details.style.height = `${Math.min(h, maxH)}px`
        }
    }

    // 拖 sash 改尺寸(Monaco ResizableHTMLElement + suggestWidget onDidResize)
    const startResize = (side: 'n' | 'e' | 's', e: PointerEvent) => {
        if (!root || !locked) return
        e.preventDefault()
        e.stopPropagation()
        const target = e.currentTarget
        if (target instanceof HTMLElement) target.setPointerCapture?.(e.pointerId)
        const start = { w: root.offsetWidth || parseFloat(root.style.width) || LIST_WIDTH, h: locked.height }
        const x0 = e.clientX
        const y0 = e.clientY
        const maxW = (doc.defaultView?.innerWidth ?? 1920) - 2 - 28
        const onMove = (ev: PointerEvent) => {
            const w = side === 'e' ? Math.max(220, Math.min(maxW, start.w + ev.clientX - x0)) : start.w
            const h = side === 's' ? start.h + ev.clientY - y0 : side === 'n' ? start.h - (ev.clientY - y0) : start.h
            live = { w, h: Math.max(rowH, h) }
            position()
        }
        const onUp = (ev: PointerEvent) => {
            doc.removeEventListener('pointermove', onMove)
            doc.removeEventListener('pointerup', onUp)
            onMove(ev) // 松手位置为准(快拖时 pointermove 会被合并)
            if (!live) return
            // 只记变化超过半行的那一维;另一维沿用记下的或默认值
            const threshold = Math.round(rowH / 2)
            const def = { w: LIST_WIDTH, h: COMPLETION_VISIBLE_ROWS * rowH + 2 }
            const w = side === 'e' && Math.abs(live.w - start.w) > threshold ? live.w : persisted?.w ?? def.w
            const h = side !== 'e' && Math.abs((locked?.height ?? live.h) - start.h) > threshold ? locked?.height ?? live.h : persisted?.h ?? def.h
            persisted = { w, h }
            live = null
            position()
        }
        doc.addEventListener('pointermove', onMove)
        doc.addEventListener('pointerup', onUp)
    }

    const build = (next: 'list' | 'message') => {
        remove()
        mode = next
        const el = document.createElement('div')
        root = el
        el.className = next === 'message' ? 'cm-completionList cm-completionList-message' : 'cm-completionList'
        el.id = `cm-completion-list-${id}`
        el.dataset.cmView = String(id)
        el.setAttribute('role', 'listbox')
        el.setAttribute('aria-label', 'Suggest')
        el.style.position = 'fixed'
        el.style.zIndex = '1000'
        el.style.visibility = 'hidden'
        el.style.minWidth = '0'
        el.style.boxSizing = 'border-box'
        el.addEventListener('mousedown', e => e.preventDefault())
        inheritThemeVars(view, el) // 挂 body 继承不到 .cm-editor 的主题变量(F6)
        if (next === 'message') {
            el.style.overflow = 'hidden'
            const m = document.createElement('div')
            m.className = 'cm-completionMessage'
            m.style.cssText = `padding-left:22px;height:${rowH}px;line-height:${rowH}px;white-space:nowrap;`
            el.appendChild(m)
        }
        else {
            el.style.overflowY = 'auto'
            // 原生滚动条拖动等:同步回状态
            el.addEventListener('scroll', () => {
                const c = ui.state
                if (!c.open) return
                if (Math.abs(el.scrollTop - c.scrollTop) >= 1) ui.setScrollTop(el.scrollTop)
                else renderRows()
            }, { passive: true })
            // 滚轮按 Monaco 算(一格 50px),不走浏览器原生 100px
            el.addEventListener('wheel', (e) => {
                const c = ui.state
                if (!c.open) return
                e.preventDefault()
                e.stopPropagation()
                const dy = wheelScrollDelta(e).y
                const max = Math.max(0, c.count * rowH - (el.clientHeight || geom().h - 2))
                const t = Math.max(0, Math.min(max, c.scrollTop + dy))
                if (t !== c.scrollTop) ui.setScrollTop(t)
            }, { passive: false })
            sizer = document.createElement('div')
            sizer.style.position = 'relative'
            el.appendChild(sizer)
            for (const side of ['n', 'e', 's'] as const) {
                const s = document.createElement('div')
                s.className = `cm-completion-sash cm-completion-sash-${side}`
                s.style.cssText = `position:fixed;z-index:1001;display:none;touch-action:none;cursor:${side === 'e' ? 'ew-resize' : 'ns-resize'};`
                s.addEventListener('pointerdown', e => startResize(side, e))
                s.addEventListener('mousedown', e => e.preventDefault())
                el.appendChild(s)
                sashes[side] = s
            }
        }
        // 挂 body:避开 editor flex/overflow/transform 含块干扰(fixed 相对 viewport)
        doc.body.appendChild(el)
    }

    const render = () => {
        const cs = ui.state
        if (!cs.open || (!cs.count && !cs.message)) { remove(); return }
        rowH = measureRowH()
        const next = cs.message ? 'message' : 'list'
        if (mode !== next) build(next)
        if (!root) return
        if (next === 'message') {
            const m = root.firstElementChild
            if (m) m.textContent = cs.message === 'loading' ? 'Loading...' : 'No suggestions.'
            position()
            schedulePosition()
            return
        }
        sizer!.style.height = `${cs.count * rowH}px`
        // 视口跟随状态(方向键 / 翻页 / 滚轮都改 scrollTop)
        if (Math.abs(root.scrollTop - cs.scrollTop) >= 1) root.scrollTop = cs.scrollTop
        lastKey = ''
        renderRows()
        position()
        schedulePosition()
    }

    const onScroll = () => schedulePosition(true)
    // 窗口尺寸 / 编辑器几何变了:重新 layout(Monaco onDidLayoutChange → suggest widget _layout)
    const onRelayout = () => schedulePosition()
    view.scrollDOM.addEventListener('scroll', onScroll, { passive: true })
    const win = doc.defaultView
    win?.addEventListener('scroll', onScroll, { passive: true, capture: true })
    win?.addEventListener('resize', onRelayout, { passive: true })
    const offGeo = typeof view.onGeometry === 'function' ? view.onGeometry(onRelayout) : () => {}
    // 失焦即关(Monaco onDidBlurEditorWidget → cancel);点列表本身 mousedown 已 preventDefault 不失焦
    let blurTimer: ReturnType<typeof setTimeout> | null = null
    const onFocusOut = () => {
        if (blurTimer) clearTimeout(blurTimer)
        blurTimer = setTimeout(() => {
            blurTimer = null
            if (view.hasFocus) return
            if (ui.state.open) ui.host?.close()
        }, 0)
    }
    view.contentDOM.addEventListener('focusout', onFocusOut)

    const off = view.onViewUpdate(() => render())
    const offUi = ui.subscribe(render)
    render()
    return () => {
        off()
        offUi()
        offGeo()
        if (blurTimer) clearTimeout(blurTimer)
        view.contentDOM.removeEventListener('focusout', onFocusOut)
        view.scrollDOM.removeEventListener('scroll', onScroll)
        win?.removeEventListener('scroll', onScroll, true)
        win?.removeEventListener('resize', onRelayout)
        remove()
        ui.geom = null
    }
}
