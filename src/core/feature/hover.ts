// CM7 悬停 tooltip —— 可插拔 hover 框架(对齐 Monaco HoverProvider / CM6 hoverTooltip)。
//
// 两层:framework(本文件,零语言依赖)+ provider(hoverSources facet 注入的源)。
// framework 负责:mousemove 命中(caretPositionFromPoint→posFromDOM)、防抖、遍历源、定位、显隐。
// provider 只答"这个 pos 显示什么内容"。内置 diagnosticHoverSource(诊断卡,同步,零语言依赖);
// TS 类型签名/JSDoc 由懒加载的 tsQuickInfoSource 经 facet 注入(见 src/tsquickinfo.ts)。
//
// core 层绝不 import typescript —— 语义能力由宿主/装配层注入,不用的语言零成本。

import type { EditorState } from '../model/state'
import type { EditorView } from '../view/editorview'
import { Facet } from '../model/state'
import { diagnosticsField } from './diagnostics'
import type { Diagnostic, Severity } from '../chrome/ruler'
import { EditorSelection } from '../model/selection'
import { chordPrefixKeys } from '../edit/keymap'
import { wheelScrollDelta } from '../input/wheel'
import { getOption } from '../options'
import { findHexColors } from './hexcolor'
import { announce } from './a11y'
import { writeClipboardText } from '../input/clipboard'

// hover 卡片底部的操作(对齐 Monaco 状态栏:View Problem / Quick Fix…)。disabled → 灰字提示(No quick fixes available)
export interface HoverAction {
    label: string
    /** 显示在 label 后的快捷键,如 ⌥F8 */
    keybinding?: string
    /** at:操作链接左下角(视口坐标),给要贴着它弹菜单的操作(Quick Fix…) */
    run?: (view: EditorView, at?: { x: number, y: number }) => void
    disabled?: boolean
}

// hover 结果:锚点区间 [pos,end] + 内容 DOM 工厂。对齐 CM6 hoverTooltip 语义,但 create 直接返 element。
// 多个源同时命中时合成一张卡(对齐 Monaco:诊断在上、类型信息在下),actions 汇总进卡底状态栏。
export interface HoverResult {
    pos: number
    end?: number
    above?: boolean
    /** view:卡里的链接要操作编辑器(related 行跳转) */
    create: (view?: EditorView) => HTMLElement
    /** 卡底操作。数组里可以混 Promise:同步的立刻显示,异步的(如 Quick Fix 要问 LS)到了按原位置补上 */
    actions?: (view: EditorView) => readonly (HoverAction | Promise<HoverAction[]>)[] | Promise<HoverAction[]>
}

// side: -1 光标左侧字符,1 右侧(多数源忽略)。允许返回 Promise —— TS quickInfo 首次懒加载 typescript 是异步的。
export type HoverSource =
    (state: EditorState, pos: number, side: -1 | 1, view?: EditorView) => HoverResult | null | Promise<HoverResult | null>

// 源 facet:按注册顺序全部咨询,命中的合成一张卡(Monaco 的 hover participants)。
export const hoverSources = Facet.define<HoverSource, readonly HoverSource[]>({
    combine: vs => vs,
})

// 诊断卡的额外操作(语言层注入,如 TS 的 Quick Fix…)。core 不认识语言,只负责摆出来。
export const diagnosticHoverActions = Facet.define<
    (view: EditorView, diag: Diagnostic) => HoverAction[] | Promise<HoverAction[]>,
    readonly ((view: EditorView, diag: Diagnostic) => HoverAction[] | Promise<HoverAction[]>)[]
>({ combine: vs => vs })

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

// —— hover 选项(IEditorHoverOptions;默认值 = Monaco,经 core.getOption 读,updateOptions 换了立刻生效)——
interface HoverOptions { enabled: boolean, delay: number, sticky: boolean, hidingDelay: number, above: boolean }
function hoverOpts(state: EditorState): HoverOptions {
    const o = (getOption(state, 'hover') ?? {}) as Partial<HoverOptions>
    return {
        enabled: o.enabled !== false,
        delay: Number.isFinite(o.delay) ? Math.max(0, o.delay as number) : 300,
        sticky: o.sticky !== false,
        hidingDelay: Number.isFinite(o.hidingDelay) ? Math.max(0, o.hidingDelay as number) : 300,
        above: o.above !== false,
    }
}

// 鼠标坐标 → 文档 offset。命中不在 contentDOM 内(gutter/tooltip)返 null。
export function hoverPosFromPoint(view: EditorView, x: number, y: number): number | null {
    const doc = view.contentDOM.ownerDocument as Document & {
        caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node, offset: number } | null
        caretRangeFromPoint?: (x: number, y: number) => Range | null
    }
    let node: Node
    let offset: number
    if (doc.caretPositionFromPoint) {
        const cp = doc.caretPositionFromPoint(x, y)
        if (!cp) return null
        node = cp.offsetNode
        offset = cp.offset
    } else if (doc.caretRangeFromPoint) {
        const r = doc.caretRangeFromPoint(x, y)
        if (!r) return null
        node = r.startContainer
        offset = r.startOffset
    } else return null
    if (!view.contentDOM.contains(node)) return null
    try {
        return view.posFromDOM(node, offset)
    } catch {
        return null
    }
}

// 定位纯函数:算 tooltip 相对编辑器盒的 left/top。水平 clamp 编辑器右/左缘;
// 垂直 above 优先放上方(放不下退下方),below 溢出底部退上方。抽出便于单测几何边界。
export function placeTooltip(
    caret: { left: number, top: number, bottom: number },
    tt: { w: number, h: number },
    editor: { left: number, top: number, width: number, height: number },
    above: boolean,
): { left: number, top: number } {
    let left = caret.left - editor.left
    left = Math.min(left, editor.width - tt.w - 4)
    left = Math.max(left, 0)
    const belowTop = caret.bottom - editor.top
    const aboveTop = caret.top - editor.top - tt.h
    let top: number
    if (above) top = aboveTop >= 0 ? aboveTop : belowTop
    else top = belowTop + tt.h <= editor.height ? belowTop : aboveTop
    return { left, top }
}

// hover 卡的上下位置(Monaco ResizableContentWidget._findPositionPreference,editor.hover.above 默认 true):
// 上方空间 = 行顶 - 30、下方 = 窗口高 - 行底 - 24,都按窗口算(Monaco 的 hover 允许伸出编辑器);
// 卡高先截到两边较大的空间,放得进上方就上方,否则下方。水平同 placeTooltip(夹在编辑器内)。
// 坐标:caret / editor 是视口坐标,返回值相对编辑器盒(可为负 = 伸出编辑器顶)。
export function placeHoverCard(
    caret: { left: number, top: number, bottom: number },
    tt: { w: number, h: number },
    editor: { left: number, top: number, width: number, height: number },
    viewportHeight: number,
    preferAbove = true,
): { left: number, top: number, above: boolean } {
    let left = caret.left - editor.left
    left = Math.min(left, editor.width - tt.w - 4)
    left = Math.max(left, 0)
    const spaceAbove = Math.min(caret.top - 30, tt.h)
    const spaceBelow = Math.min(viewportHeight - caret.bottom - 24, tt.h)
    const h = Math.min(tt.h, Math.max(spaceAbove, spaceBelow))
    const above = preferAbove ? h <= spaceAbove : !(h <= spaceBelow)
    const top = above ? caret.top - tt.h - editor.top : caret.bottom - editor.top
    return { left, top, above }
}

// ———— Monaco RenderedContentHover.computeHoverPositions(model 的 line/column 坐标)————
// showAtPosition = 锚点起点;showAtSecondaryPosition = 同一行上各 part 起点的最小列,但不越过锚点所在视觉行的行首
// (软折行时 part 起点在上一视觉行,卡不能贴到上一行去)。forceShowAtRange 的 part 把两者都钉在它的起点。
export interface HoverPosition { lineNumber: number, column: number }
export interface HoverRangeLike { startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number }

export function computeHoverPositions(
    view: EditorView,
    anchorRange: HoverRangeLike,
    parts: readonly { range: HoverRangeLike, forceShowAtRange?: boolean }[],
): { showAtPosition: HoverPosition, showAtSecondaryPosition: HoverPosition } {
    const doc = view.state.doc
    // 锚点行的视觉行首列(锚点可越过文档 → 夹进文档,Monaco convertModelRangeToViewRange 同样先校验)
    const line = doc.line(Math.max(1, Math.min(doc.lines, anchorRange.startLineNumber)))
    const offset = Math.max(0, Math.min(line.length, anchorRange.startColumn - 1))
    const startColumnBoundary = view.visualRowStart(line.from + offset) - line.from + 1

    const anchorLine = anchorRange.startLineNumber
    let secondaryColumn = anchorRange.startColumn
    let force: HoverRangeLike | undefined
    for (const { range, forceShowAtRange } of parts) {
        if (range.startLineNumber === anchorLine && range.endLineNumber === anchorLine)
            secondaryColumn = Math.max(Math.min(secondaryColumn, range.startColumn), startColumnBoundary)
        if (forceShowAtRange) force = range
    }
    if (force) {
        const at = { lineNumber: force.startLineNumber, column: force.startColumn }
        return { showAtPosition: at, showAtSecondaryPosition: { ...at } }
    }
    return {
        showAtPosition: { lineNumber: anchorLine, column: anchorRange.startColumn },
        showAtSecondaryPosition: { lineNumber: anchorLine, column: secondaryColumn },
    }
}

// caretCoords 是字形盒(20px 行里 15px 高、顶在 +2);Monaco 的 content widget 锚在视觉行盒上
// (上方卡底 = 行顶、下方卡顶 = 行底)。按字形中线定第几个视觉行,行顶取 heightMap(同光标层的算法)。
export function rowBox(view: EditorView, pos: number, g: { left: number, top: number, bottom: number }): { left: number, top: number, bottom: number } {
    const lh = view.oracle.lineHeight
    if (!(lh > 0) || g.bottom - g.top >= lh) return g
    const cr = view.contentDOM.getBoundingClientRect()
    const blk = view.lineBlockAt(pos)
    const mid = (g.top + g.bottom) / 2 - cr.top
    const row = Math.max(0, Math.min(Math.round(blk.height / lh) - 1, Math.floor((mid - blk.top) / lh)))
    const top = cr.top + blk.top + row * lh
    return { left: g.left, top, bottom: top + lh }
}

/** 进 marker hover 的一条:诊断(error/warning/info)或语言层的 hint 级标记(未使用 / 废弃 / suggestion) */
export type HoverMarker = Omit<Diagnostic, 'severity'> & { severity: Severity | 'hint' }

// hint 级标记不进 diagnosticsField(不上 ruler、不画波浪线),由语言层经这个 facet 交给诊断卡(Monaco 的 hint marker)
export const hoverMarkers = Facet.define<(state: EditorState) => readonly HoverMarker[], readonly ((state: EditorState) => readonly HoverMarker[])[]>({
    combine: vs => vs,
})

// 内置源:marker 卡。读 diagnosticsField + hoverMarkers,命中 pos 的 → message + 灰码 + related 行。Monaco 0.52 marker hover
// 不画严重度图标(图标只在 Problems / peek 里);此源不带 palette 参数(对齐 diagnostics.ts "provider 不带色")。
// 顺序同 Monaco 的 lineDecorations:没有概览条颜色的 hint 在一棵区间树、其余在另一棵,先 hint 后其余,各自按起点再终点
export const diagnosticHoverSource: HoverSource = (state, pos) => {
    const diags = (state.field(diagnosticsField, false) ?? []).filter(d => d.message && pos >= d.from && pos <= d.to)
    const hints: HoverMarker[] = []
    for (const f of state.facet(hoverMarkers)) {
        for (const m of f(state)) {
            if (!m.message || pos < m.from || pos > m.to) continue
            // 同一条既是诊断又带标签(开了 noUnusedLocals 的 6133)/ 既 unnecessary 又 deprecated:只显示一次
            const same = (d: HoverMarker) => d.from === m.from && d.to === m.to && d.message === m.message
            if (!diags.some(same) && !hints.some(same)) hints.push(m)
        }
    }
    const byPos = (a: HoverMarker, b: HoverMarker) => a.from - b.from || a.to - b.to
    const hits: HoverMarker[] = [...hints.sort(byPos), ...[...diags].sort(byPos)]
    if (!hits.length) return null
    const hit = hits[0]
    // 状态栏挑最严重的那条(Monaco renderMarkerStatusbar);hint 级没有 View Problem
    const rank = { error: 0, warning: 1, info: 2, hint: 3 } as const
    const primary = [...hits].sort((a, b) => rank[a.severity] - rank[b.severity])[0]
    return {
        pos: hit.from,
        end: hit.to,
        above: true,
        create: (view) => {
            if (hits.length === 1) return diagnosticRow(hit, view)
            const wrap = document.createElement('div')
            wrap.className = 'cm-diagnostic-rows'
            for (const d of hits) wrap.appendChild(diagnosticRow(d, view))
            return wrap
        },
        actions: (view) => {
            const out: (HoverAction | Promise<HoverAction[]>)[] = primary.severity === 'hint' ? [] : [{
                label: 'View Problem',
                keybinding: isMac ? '⌥F8' : 'Alt+F8',
                run: v => {
                    v.dispatch(v.state.update({
                        selection: EditorSelection.range(primary.from, Math.min(primary.to, v.state.doc.length)),
                        scrollIntoView: true,
                        userEvent: 'select',
                    }))
                    v.focus()
                },
            }]
            const diag: Diagnostic = { ...primary, severity: primary.severity === 'hint' ? 'info' : primary.severity }
            for (const f of view.state.facet(diagnosticHoverActions)) {
                const r = f(view, diag)
                if (r instanceof Promise) out.push(r)
                else out.push(...r)
            }
            return out
        },
    }
}

/**
 * Monaco HoverCopyButton:hover 行右上角的「复制」按钮(marker hover 才有)。
 * 容器加 hover-row-with-copy;按钮 role=button、tabindex 0、aria-label "Copy",点击 / Enter / Space 复制 getContent()(空串不复制)。
 * write / status 可注入(默认写系统剪贴板 + 向 live region 播报 "Copied to clipboard")。
 */
export function attachHoverCopyButton(
    container: HTMLElement,
    getContent: () => string,
    opts: { write?: (text: string) => unknown, status?: (message: string) => void, view?: EditorView } = {},
): { dom: HTMLElement, dispose(): void } {
    const doc = container.ownerDocument
    container.classList.add('hover-row-with-copy')
    const btn = doc.createElement('div')
    btn.className = 'button hover-copy-button codicon codicon-copy'
    btn.tabIndex = 0
    btn.setAttribute('role', 'button')
    btn.setAttribute('aria-label', 'Copy')
    const write = opts.write ?? ((text: string) => writeClipboardText(text, opts.view))
    const status = opts.status ?? ((m: string) => { if (opts.view) announce(opts.view, m) })
    const copy = async () => {
        const text = getContent()
        if (!text) return
        await write(text)
        status('Copied to clipboard')
    }
    const onClick = (e: Event) => { void copy(); e.preventDefault() }
    const onKey = (e: KeyboardEvent) => {
        if (e.key !== 'Enter' && e.key !== ' ') return
        void copy()
        e.preventDefault()
    }
    // 不让按下抢走编辑器焦点 / 触发卡的关闭判定
    const onDown = (e: Event) => e.preventDefault()
    btn.addEventListener('click', onClick)
    btn.addEventListener('keydown', onKey)
    btn.addEventListener('mousedown', onDown)
    container.appendChild(btn)
    return {
        dom: btn,
        dispose() {
            btn.removeEventListener('click', onClick)
            btn.removeEventListener('keydown', onKey)
            btn.removeEventListener('mousedown', onDown)
            btn.remove()
            container.classList.remove('hover-row-with-copy')
        },
    }
}

// Monaco markerHoverParticipant._renderMarkerHover:消息 + 码;每条 related 一行 div(margin-top 8px) > a `文件(行, 列): ` + span 消息
function diagnosticRow(hit: HoverMarker, view?: EditorView): HTMLElement {
    const dom = document.createElement('div')
    dom.className = hit.severity === 'hint' ? 'cm-diagnostic-tooltip cm-diagnostic-hint' : 'cm-diagnostic-tooltip'
    const msg = document.createElement('span')
    msg.className = 'cm-diagnostic-msg'
    msg.textContent = hit.message!
    dom.appendChild(msg)
    if (hit.code) {
        const code = document.createElement('span')
        code.className = 'cm-diagnostic-code'
        code.textContent = hit.code
        dom.appendChild(code)
    }
    for (const r of hit.related ?? []) {
        const div = document.createElement('div')
        div.className = 'cm-diagnostic-related'
        div.style.marginTop = '8px'
        const a = document.createElement('a')
        a.textContent = `${r.file}(${r.line}, ${r.col}): `
        a.style.cursor = 'pointer'
        a.addEventListener('click', e => {
            e.preventDefault()
            e.stopPropagation()
            // 别的文件:独立编辑器里 Monaco 也打不开(StandaloneCodeEditorService 只认当前 model)
            if (!r.same || !view) return
            const doc = view.state.doc
            const line = doc.line(Math.min(r.line, doc.lines))
            view.dispatch(view.state.update({
                selection: { anchor: Math.min(line.from + r.col - 1, line.to) },
                scrollIntoView: true,
                userEvent: 'select',
            }))
            view.focus()
        })
        const text = document.createElement('span')
        text.textContent = r.message
        div.append(a, text)
        dom.appendChild(div)
    }
    // Monaco 0.55:marker hover 行带复制按钮(复制的是 marker.message)
    attachHoverCopyButton(dom, () => hit.message ?? '', { view })
    return dom
}

// —— 卡片控制器:鼠标 hover 与键盘 Show Hover 共用一套显隐(对齐 Monaco 一个 content hover)——

interface HoverController {
    showAt(pos: number, opts: { keyboard: boolean, seq?: number }): Promise<boolean>
    hide(): void
    /** 当前卡片(没有 → null) */
    active(): { root: HTMLElement, from: number, to: number, keyboard: boolean } | null
    dispose(): void
}

const controllers = new WeakMap<EditorView, HoverController>()

// —— 卡内滚动(Monaco hoverActions:卡聚焦时 ↑↓←→ / PageUp·PageDown / Home·End、⌘↑·⌘↓)——
export type HoverScrollKind = 'up' | 'down' | 'left' | 'right' | 'pageUp' | 'pageDown' | 'top' | 'bottom'
const HORIZONTAL_SCROLLING_BY = 30

/** Monaco 默认键位:无修饰键的方向键 / PageUp·PageDown / Home·End;⌘/Ctrl+↑ = 到顶、⌘/Ctrl+↓ = 到底 */
export function hoverScrollKey(e: KeyboardEvent): HoverScrollKind | null {
    const mod = e.metaKey || e.ctrlKey
    if (e.altKey || e.shiftKey) return null
    if (mod) return e.key === 'ArrowUp' ? 'top' : e.key === 'ArrowDown' ? 'bottom' : null
    switch (e.key) {
        case 'ArrowUp': return 'up'
        case 'ArrowDown': return 'down'
        case 'ArrowLeft': return 'left'
        case 'ArrowRight': return 'right'
        case 'PageUp': return 'pageUp'
        case 'PageDown': return 'pageDown'
        case 'Home': return 'top'
        case 'End': return 'bottom'
        default: return null
    }
}

function scrollHoverCard(root: HTMLElement, lineHeight: number, kind: HoverScrollKind): void {
    switch (kind) {
        case 'up': root.scrollTop -= lineHeight; break
        case 'down': root.scrollTop += lineHeight; break
        case 'left': root.scrollLeft -= HORIZONTAL_SCROLLING_BY; break
        case 'right': root.scrollLeft += HORIZONTAL_SCROLLING_BY; break
        case 'pageUp': root.scrollTop -= root.clientHeight; break
        case 'pageDown': root.scrollTop += root.clientHeight; break
        case 'top': root.scrollTop = 0; break
        case 'bottom': root.scrollTop = root.scrollHeight; break
    }
}

/** 当前聚焦的 hover 卡(Monaco EditorContextKeys.hoverFocused);没有 → null */
function focusedHoverCard(view: EditorView): HTMLElement | null {
    const a = controllers.get(view)?.active()
    return a && a.root.contains(view.dom.ownerDocument.activeElement) ? a.root : null
}

function hoverScrollCommand(kind: HoverScrollKind): (view: EditorView) => boolean {
    return (view) => {
        const root = focusedHoverCard(view)
        if (!root) return false
        scrollHoverCard(root, view.oracle.lineHeight || 19, kind)
        return true
    }
}
export const scrollUpHover = hoverScrollCommand('up')
export const scrollDownHover = hoverScrollCommand('down')
export const scrollLeftHover = hoverScrollCommand('left')
export const scrollRightHover = hoverScrollCommand('right')
export const pageUpHover = hoverScrollCommand('pageUp')
export const pageDownHover = hoverScrollCommand('pageDown')
export const goToTopHover = hoverScrollCommand('top')
export const goToBottomHover = hoverScrollCommand('bottom')

/** Monaco 命令 id → 动作(precondition = hover 卡有焦点,否则返 false);showOrFocusHover 即 ⌘K ⌘I */
export const HOVER_COMMANDS: Record<string, (view: EditorView) => boolean | Promise<boolean>> = {
    'editor.action.showHover': view => showHover(view),
    'editor.action.hideHover': hideHover,
    'editor.action.scrollUpHover': scrollUpHover,
    'editor.action.scrollDownHover': scrollDownHover,
    'editor.action.scrollLeftHover': scrollLeftHover,
    'editor.action.scrollRightHover': scrollRightHover,
    'editor.action.pageUpHover': pageUpHover,
    'editor.action.pageDownHover': pageDownHover,
    'editor.action.goToTopHover': goToTopHover,
    'editor.action.goToBottomHover': goToBottomHover,
}

// —— 颜色悬浮卡(Monaco ColorHoverParticipant 的预览部分:色块 + 颜色值)——
// 扫当前行里的 #hex / rgb() / rgba() / hsl() / hsla();colorDecorators 关、或 colorDecoratorsActivatedOn 为 'click' 时不给。
// 完整的取色器(饱和度面板 / 色相条)不做:卡里只有预览和换算出的 hex。
const COLOR_FN_RE = /\b(?:rgba?|hsla?)\(\s*[^()]*\)/gi

function clamp255(n: number) { return Math.max(0, Math.min(255, Math.round(n))) }
function cssNumber(token: string, percentScale: number): number {
    const t = token.trim()
    return t.endsWith('%') ? Number.parseFloat(t) * percentScale / 100 : Number.parseFloat(t)
}
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
    h = ((h % 360) + 360) % 360 / 360
    const a = s * Math.min(l, 1 - l)
    const f = (n: number) => {
        const k = (n + h * 12) % 12
        return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    }
    return [f(0) * 255, f(8) * 255, f(4) * 255]
}
const hex2 = (n: number) => clamp255(n).toString(16).padStart(2, '0')

/** CSS 颜色文本 → #rrggbb(带透明度时 #rrggbbaa);不认识 → null */
export function colorToHex(text: string): string | null {
    const t = text.trim()
    if (t.startsWith('#')) {
        let h = t.slice(1)
        if (h.length === 3 || h.length === 4) h = [...h].map(c => c + c).join('')
        return /^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(h) ? `#${h.toLowerCase()}` : null
    }
    const m = /^(rgba?|hsla?)\(\s*([^)]*)\)$/i.exec(t)
    if (!m) return null
    const parts = m[2].split(/[\s,/]+/).filter(Boolean)
    if (parts.length < 3) return null
    let rgb: [number, number, number]
    if (m[1].toLowerCase().startsWith('rgb')) {
        rgb = [cssNumber(parts[0], 255), cssNumber(parts[1], 255), cssNumber(parts[2], 255)]
    }
    else {
        const hue = Number.parseFloat(parts[0])
        rgb = hslToRgb(hue, cssNumber(parts[1], 1) / (parts[1].trim().endsWith('%') ? 1 : 100), cssNumber(parts[2], 1) / (parts[2].trim().endsWith('%') ? 1 : 100))
    }
    if (rgb.some(n => Number.isNaN(n))) return null
    let out = `#${hex2(rgb[0])}${hex2(rgb[1])}${hex2(rgb[2])}`
    if (parts[3] !== undefined) {
        const a = cssNumber(parts[3], 1)
        if (!Number.isNaN(a) && a < 1) out += hex2(a * 255)
    }
    return out
}

export const colorHoverSource: HoverSource = (state, pos) => {
    if (getOption(state, 'colorDecorators') === false) return null
    if (getOption(state, 'colorDecoratorsActivatedOn') === 'click') return null
    const line = state.doc.lineAt(pos)
    const off = pos - line.from
    const found: { from: number, to: number, text: string }[] = []
    for (const h of findHexColors(line.text)) found.push({ from: h.from, to: h.to, text: line.text.slice(h.from, h.to) })
    for (const m of line.text.matchAll(COLOR_FN_RE)) found.push({ from: m.index!, to: m.index! + m[0].length, text: m[0] })
    const hit = found.find(c => off >= c.from && off <= c.to && colorToHex(c.text))
    if (!hit) return null
    const hex = colorToHex(hit.text)!
    return {
        pos: line.from + hit.from,
        end: line.from + hit.to,
        create: () => {
            const dom = document.createElement('div')
            dom.className = 'cm-color-hover'
            dom.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 8px;'
            const swatch = document.createElement('span')
            swatch.className = 'cm-color-hover-swatch'
            swatch.style.cssText = `display:inline-block;width:32px;height:18px;border:1px solid rgba(128,128,128,.6);box-sizing:border-box;background:${hex};`
            const label = document.createElement('span')
            label.className = 'cm-color-hover-text'
            label.textContent = hex
            dom.append(swatch, label)
            return dom
        },
    }
}

/** 多个源的结果合成一张卡:单个、无操作 → 源的 DOM 原样;否则每段一行 + 底部状态栏 */
function buildCard(view: EditorView, parts: HoverResult[], onAction: () => void): HTMLElement {
    const withActions = parts.filter(p => p.actions)
    let root: HTMLElement
    if (parts.length === 1 && !withActions.length) {
        root = parts[0].create(view)
    } else {
        root = document.createElement('div')
        root.className = 'cm-hover-card'
        for (const p of parts) {
            const row = document.createElement('div')
            row.className = 'cm-hover-row'
            row.appendChild(p.create(view))
            root.appendChild(row)
        }
        if (withActions.length) {
            const bar = document.createElement('div')
            bar.className = 'cm-hover-status'
            root.appendChild(bar)
            const seen = new Set<string>()
            const make = (a: HoverAction): HTMLElement | null => {
                if (seen.has(a.label)) return null
                seen.add(a.label)
                if (a.disabled || !a.run) {
                    const span = document.createElement('span')
                    span.className = 'cm-hover-action cm-hover-action-disabled'
                    span.textContent = a.label
                    return span
                }
                const el = document.createElement('a')
                el.className = 'cm-hover-action'
                el.setAttribute('role', 'button')
                el.tabIndex = 0
                el.textContent = a.label
                if (a.keybinding) {
                    const kb = document.createElement('span')
                    kb.className = 'cm-hover-keybinding'
                    kb.textContent = ` (${a.keybinding})`
                    el.appendChild(kb)
                }
                const run = a.run
                const fire = (e: Event) => {
                    e.preventDefault()
                    const r = el.getBoundingClientRect()
                    onAction()
                    run(view, { x: r.left, y: r.bottom })
                }
                el.addEventListener('mousedown', e => e.preventDefault())
                el.addEventListener('click', fire)
                el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') fire(e) })
                return el
            }
            // 异步操作先占位(Monaco 的 quickfix placeholder),到了替换,保持顺序
            const later = (p: Promise<HoverAction[]>) => {
                const slot = document.createElement('span')
                slot.className = 'cm-hover-action-slot'
                bar.appendChild(slot)
                void p.then(acts => {
                    if (!slot.isConnected) return
                    for (const a of acts) { const el = make(a); if (el) slot.before(el) }
                    slot.remove()
                }, () => slot.remove())
            }
            for (const p of withActions) {
                const r = p.actions!(view)
                if (r instanceof Promise) { later(r); continue }
                for (const a of r) {
                    if (a instanceof Promise) later(a)
                    else { const el = make(a); if (el) bar.appendChild(el) }
                }
            }
        }
    }
    root.classList.add('cm-tooltip-hover')
    return root
}

function createController(view: EditorView): HoverController {
    let seq = 0
    type Card = { root: HTMLElement, from: number, to: number, keyboard: boolean }
    let current: Card | null = null
    let downInCard = false
    // 按下这一键时开着的卡(keymap 跑完再决定关不关)
    let keyCard: Card | null = null

    // Monaco _onKeyDown:修饰键、和弦前缀(MoreChordsNeeded)、卡开着时再按 Show Hover(焦点进卡)不关,其余键关;
    // Escape 只关 hover 不往下传。和弦要等 keymap 认过才知道,所以捕获阶段只记下,冒泡阶段(keymap 之后)再判断
    const onKey = (e: KeyboardEvent) => {
        keyCard = null
        if (!current) return
        if (e.key === 'Shift' || e.key === 'Meta' || e.key === 'Control' || e.key === 'Alt') return
        if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            hide()
            return
        }
        keyCard = current
    }
    const onKeyAfter = (e: KeyboardEvent) => {
        const at = keyCard
        keyCard = null
        if (!at || current !== at || chordPrefixKeys.has(e)) return
        if (at.root.contains(view.dom.ownerDocument.activeElement)) return
        hide()
    }
    const onDocDown = (e: MouseEvent) => {
        if (!current) return
        if (current.root.contains(e.target as Node)) { downInCard = true; return }
        // 键盘唤起的卡只被编辑器里的按下关掉(Monaco 只听 editor.onMouseDown)
        if (current.keyboard && !view.dom.contains(e.target as Node)) return
        hide()
    }
    // 键盘唤起的卡失焦不关(Monaco 的 content hover 不听失焦)
    const onBlur = (e: FocusEvent) => {
        if (!current || current.keyboard) return
        if (downInCard || (e.relatedTarget && current.root.contains(e.relatedTarget as Node))) return
        hide()
    }
    const onScroll = () => hide()
    let offTr: (() => void) | null = null

    const listen = (on: boolean) => {
        const doc = view.dom.ownerDocument
        if (on) {
            view.contentDOM.addEventListener('keydown', onKey, true)
            view.contentDOM.addEventListener('keydown', onKeyAfter)
            doc.addEventListener('mousedown', onDocDown, true)
            view.contentDOM.addEventListener('blur', onBlur)
            view.scrollDOM.addEventListener('scroll', onScroll, { passive: true })
            // 只在改文档 / 动选区时关(Monaco content hover);异步诊断、TS 折叠表这类纯 effect 事务不关
            offTr = view.onTransaction(tr => { if (tr.docChanged || tr.selection) hide() })
        } else {
            view.contentDOM.removeEventListener('keydown', onKey, true)
            view.contentDOM.removeEventListener('keydown', onKeyAfter)
            doc.removeEventListener('mousedown', onDocDown, true)
            view.contentDOM.removeEventListener('blur', onBlur)
            view.scrollDOM.removeEventListener('scroll', onScroll)
            offTr?.()
            offTr = null
        }
    }

    const hide = () => {
        seq++
        if (!current) return
        // 卡抢过焦点 → 还给编辑器(Monaco ContentHoverWidget.hide: hoverStoleFocus → editor.focus())
        const stole = current.root.contains(view.dom.ownerDocument.activeElement)
        current.root.remove()
        current = null
        downInCard = false
        listen(false)
        if (stole) view.focus()
    }

    const render = (parts: HoverResult[], keyboard: boolean) => {
        const wasOpen = !!current
        const hadFocus = !!current && current.root.contains(view.dom.ownerDocument.activeElement)
        if (current) current.root.remove()
        current = null
        // 锚点取最具体(最短)的那段;保持区间取并集
        const anchor = parts.reduce((a, b) => ((b.end ?? b.pos) - b.pos < (a.end ?? a.pos) - a.pos ? b : a))
        const from = Math.min(...parts.map(p => p.pos))
        const to = Math.max(...parts.map(p => p.end ?? p.pos))
        const root = buildCard(view, parts, () => hide())
        const editor = view.dom.getBoundingClientRect()
        // Monaco _updateMaxDimensions:max(编辑器宽 × 0.66, 500) × max(编辑器高 / 4, 250)
        root.style.maxWidth = `${Math.max(editor.width * 0.66, 500)}px`
        root.style.maxHeight = `${Math.max(editor.height / 4, 250)}px`
        // 能聚焦(Monaco .monaco-hover tabIndex 0):再按 Show Hover 焦点进卡,卡内按键滚动(hoverFocused 的那组键位)
        root.tabIndex = 0
        root.addEventListener('keydown', e => {
            if (e.key === 'Escape') { hide(); e.preventDefault(); e.stopPropagation(); return }
            const kind = hoverScrollKey(e)
            if (!kind) return
            scrollHoverCard(root, view.oracle.lineHeight || 19, kind)
            e.preventDefault()
            e.stopPropagation()
        })
        // 滚轮按编辑器同一套换算(每格 50px);需要滚动条就归卡自己,到头也不传给编辑器(consumeMouseWheelIfScrollbarIsNeeded)
        root.addEventListener('wheel', e => {
            if (root.scrollHeight <= root.clientHeight && root.scrollWidth <= root.clientWidth) return
            const d = wheelScrollDelta(e)
            e.preventDefault()
            e.stopPropagation()
            root.scrollTop += d.y
            root.scrollLeft += d.x
        }, { passive: false })
        view.dom.appendChild(root)
        if (keyboard) root.setAttribute('data-cm-kb-hover', '1')
        const glyph = view.caretCoords(anchor.pos) // 空行/元素边界/jsdom 无布局的退化统一处理
        const caret = glyph && rowBox(view, anchor.pos, glyph)
        if (!caret && !keyboard) { root.remove(); if (wasOpen) listen(false); return false } // 无几何 → 不留悬空 DOM
        if (caret) {
            const tt = root.getBoundingClientRect()
            const vh = view.dom.ownerDocument.defaultView?.innerHeight || editor.height
            // Monaco 内容 widget「尽量贴着 secondary 锚点」:卡的左缘从锚点起点挪到 part 区间起点(同一视觉行内),
            // 但不离锚点超过「卡宽 − 一个全角字宽」(_reduceAnchorCoordinates)
            const doc = view.state.doc
            const lc = (p: number) => { const l = doc.lineAt(p); return { lineNumber: l.number, column: p - l.from + 1 } }
            const at = lc(anchor.pos)
            const rng = (p: HoverResult) => { const a = lc(p.pos), b = lc(p.end ?? p.pos); return { startLineNumber: a.lineNumber, startColumn: a.column, endLineNumber: b.lineNumber, endColumn: b.column } }
            const sec = computeHoverPositions(view, rng(anchor), parts.map(p => ({ range: rng(p) }))).showAtSecondaryPosition
            let anchorBox = caret
            if (sec.column !== at.column) {
                const sg = view.caretCoords(doc.line(sec.lineNumber).from + sec.column - 1)
                if (sg) {
                    const full = view.fontInfo().typicalFullwidthCharacterWidth
                    const l = sg.left < caret.left ? Math.max(sg.left, caret.left - tt.width + full) : Math.min(sg.left, caret.left + tt.width - full)
                    anchorBox = { ...caret, left: l }
                }
            }
            const { left, top } = placeHoverCard(anchorBox, { w: tt.width, h: tt.height }, editor, vh, hoverOpts(view.state).above)
            // .cm-editor 是 overflow:hidden:伸出编辑器的卡改 fixed(视口坐标),不被裁(Monaco 的 overflow widget)
            if (top < 0 || top + tt.height > editor.height) {
                root.style.position = 'fixed'
                root.style.left = `${editor.left + left}px`
                root.style.top = `${editor.top + top}px`
            }
            else {
                root.style.left = `${left}px`
                root.style.top = `${top}px`
            }
        }
        current = { root, from, to, keyboard }
        if (hadFocus) root.focus()
        if (!wasOpen) listen(true)
        return true
    }

    return {
        async showAt(pos, opts) {
            const my = opts.seq ?? ++seq
            if (opts.seq == null) seq = my
            const sources = view.state.facet(hoverSources)
            const state = view.state
            const results: (HoverResult | null)[] = sources.map(() => null)
            const pending: Promise<void>[] = []
            let shown = false
            const paint = () => {
                if (my !== seq) return
                const parts = results.filter((r): r is HoverResult => !!r)
                if (!parts.length) return
                shown = render(parts, opts.keyboard) || shown
                // render 里 hide→seq 不变;保持本次请求号
            }
            sources.forEach((src, i) => {
                let r: HoverResult | null | Promise<HoverResult | null>
                try { r = src(state, pos, 1, view) } catch { r = null }
                if (r instanceof Promise) {
                    pending.push(r.then(v => {
                        if (my !== seq || !v) return
                        results[i] = v
                        paint()
                    }, () => {}))
                } else results[i] = r
            })
            // 同步结果先出(诊断卡不用等 TS 冷启动),异步的到了再并进来
            if (results.some(r => r)) paint()
            await Promise.all(pending)
            if (my !== seq) return shown
            if (!results.some(r => r)) { hide(); return false }
            return shown
        },
        hide,
        active: () => current,
        dispose() { hide() },
    }
}

function controllerFor(view: EditorView): HoverController {
    let c = controllers.get(view)
    if (!c) {
        const ctl = createController(view)
        c = ctl
        controllers.set(view, ctl)
        // 卡片和全局监听绑 view 生命周期(只用 Show Hover、没装鼠标挂载器时也不泄漏)
        view.onDestroy(() => { ctl.dispose(); controllers.delete(view) })
    }
    return c
}

/**
 * 键盘唤起(Show or Focus Hover):在光标处跑 hover 源并弹出卡片;卡已显示时焦点进卡(Monaco controller.focus())。
 * Escape / 打字 / 动光标 / 在编辑器里按下关闭
 */
export async function showHover(view: EditorView): Promise<boolean> {
    const ctl = controllerFor(view)
    const a = ctl.active()
    if (a) { a.root.focus(); return true }
    return ctl.showAt(view.state.selection.main.head, { keyboard: true })
}

/** Hide Hover(Monaco HideContentHoverAction):关掉当前的悬浮卡。没有卡也算执行过 */
export function hideHover(view: EditorView): boolean {
    controllers.get(view)?.hide()
    return true
}

// 挂载器:鼠标 hover(mousemove 命中 + 防抖 + 移出延迟关)。返回卸载函数。
export function hoverTooltip(view: EditorView): () => void {
    const ctl = controllerFor(view)
    let hoverTimer: ReturnType<typeof setTimeout> | null = null
    let hideTimer: ReturnType<typeof setTimeout> | null = null
    let requestSeq = 0
    let pointerInsideTooltip = false
    // 最近一次鼠标在编辑器里的位置(隐藏延迟到期时按它重新判断)
    let lastPoint: { x: number, y: number } | null = null
    // 鼠标发起的 showAt 还没算完
    let mousePending = false

    const clearHover = () => { if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null } }
    const clearHide = () => { if (hideTimer) { clearTimeout(hideTimer); hideTimer = null } }

    const hideTooltip = () => {
        clearHide()
        requestSeq++
        mousePending = false
        ctl.hide()
        pointerInsideTooltip = false
    }
    // Monaco hidingDelay 300:从鼠标离开锚点起算(期间再动不重新计时),到期按当时的鼠标位置判断 ——
    // 在卡上、回到锚点区都不关
    const scheduleHide = () => {
        if (hideTimer) return
        const ho = hoverOpts(view.state)
        // sticky:false → 鼠标一离开锚点就关(没有 hidingDelay,也不能移进卡里)
        if (!ho.sticky) {
            const a = ctl.active()
            if (a && !a.keyboard) hideTooltip()
            return
        }
        hideTimer = setTimeout(() => {
            hideTimer = null
            const a = ctl.active()
            if (pointerInsideTooltip || !a || a.keyboard) return
            const pos = lastPoint && hoverPosFromPoint(view, lastPoint.x, lastPoint.y)
            if (pos != null && pos >= a.from && pos <= a.to) return
            hideTooltip()
        }, ho.hidingDelay)
    }

    const triggerHover = async (x: number, y: number) => {
        const pos = hoverPosFromPoint(view, x, y)
        if (pos == null) { if (!ctl.active()?.keyboard) hideTooltip(); return }
        const my = ++requestSeq
        mousePending = true
        const shown = await ctl.showAt(pos, { keyboard: false })
        if (my !== requestSeq) return
        mousePending = false
        if (!shown && !ctl.active()) pointerInsideTooltip = false
    }

    // Monaco ContentHoverController onMouseDown / onKeyDown → _hideWidgets:开着的卡关掉(控制器自己管),
    // 还没弹的也取消 —— 移到词上点一下、或者移上去就按 F12/方向键/打字,鼠标不再动就不弹。
    const cancelPending = () => {
        clearHover()
        if (!mousePending) return
        mousePending = false
        requestSeq++
        if (!ctl.active()?.keyboard) ctl.hide() // 作废在算的请求(控制器 seq++)
    }
    const inCard = (t: EventTarget | null) => { const a = ctl.active(); return !!a && a.root.contains(t as Node) }
    // 挂在 view.dom 的捕获阶段:先于 keymap 跑,不会误杀这一键刚唤起的键盘 hover
    const onKeyDown = (e: KeyboardEvent) => {
        // 单独按修饰键不关不取消(Monaco 同样跳过 Ctrl/Alt/Meta/Shift)
        if (e.key === 'Shift' || e.key === 'Meta' || e.key === 'Control' || e.key === 'Alt') return
        if (inCard(e.target)) return
        cancelPending()
    }
    const onMouseDown = (e: MouseEvent) => {
        if (inCard(e.target)) return // 在卡片上按下不关(Monaco _isMouseOnContentHoverWidget)
        cancelPending()
    }

    const onMouseMove = (e: MouseEvent) => {
        lastPoint = { x: e.clientX, y: e.clientY }
        const ho = hoverOpts(view.state)
        // hover.enabled:false → 鼠标不弹卡(键盘 Show Hover 照常);已开着的鼠标卡收起
        if (!ho.enabled) {
            clearHover()
            if (ctl.active() && !ctl.active()!.keyboard) hideTooltip()
            return
        }
        if (pointerInsideTooltip) return
        const a = ctl.active()
        // 键盘唤起的卡不随鼠标走(Monaco sticky);焦点在卡里也不动(Monaco isFocused)
        if (a?.keyboard || (a && a.root.contains(view.dom.ownerDocument.activeElement))) return
        clearHover()
        if (a) {
            const pos = hoverPosFromPoint(view, e.clientX, e.clientY)
            if (pos != null && pos >= a.from && pos <= a.to) { clearHide(); return } // 仍在锚点区,不动
            scheduleHide()
        }
        const x = e.clientX
        const y = e.clientY
        hoverTimer = setTimeout(() => triggerHover(x, y), ho.delay)
    }
    const onMouseLeave = () => { clearHover(); lastPoint = null; scheduleHide() }
    // 离开整个编辑器:立即关(Monaco _onEditorMouseLeave 不等 hidingDelay;卡是 view.dom 的子节点,移进卡不算离开)
    const onEditorLeave = () => { clearHover(); if (!pointerInsideTooltip) hideTooltip() }
    const onOver = (e: Event) => {
        const a = ctl.active()
        if (a && a.root.contains(e.target as Node)) {
            // sticky:false 时卡不是"安全区":鼠标移上来就关
            if (!hoverOpts(view.state).sticky && !a.keyboard) { hideTooltip(); return }
            pointerInsideTooltip = true; clearHide(); clearHover()
        } // 路过空白时排的重算也作废
    }
    const onOut = (e: MouseEvent) => {
        const a = ctl.active()
        if (a && a.root.contains(e.target as Node) && !a.root.contains(e.relatedTarget as Node)) {
            pointerInsideTooltip = false
            scheduleHide()
        }
    }

    view.contentDOM.addEventListener('mousemove', onMouseMove)
    view.contentDOM.addEventListener('mouseleave', onMouseLeave)
    view.dom.addEventListener('mouseleave', onEditorLeave)
    view.dom.addEventListener('mouseover', onOver)
    view.dom.addEventListener('mouseout', onOut)
    view.dom.addEventListener('keydown', onKeyDown, true)
    view.dom.addEventListener('mousedown', onMouseDown, true)

    return () => {
        view.contentDOM.removeEventListener('mousemove', onMouseMove)
        view.contentDOM.removeEventListener('mouseleave', onMouseLeave)
        view.dom.removeEventListener('mouseleave', onEditorLeave)
        view.dom.removeEventListener('mouseover', onOver)
        view.dom.removeEventListener('mouseout', onOut)
        view.dom.removeEventListener('keydown', onKeyDown, true)
        view.dom.removeEventListener('mousedown', onMouseDown, true)
        clearHover()
        hideTooltip()
        ctl.dispose()
        controllers.delete(view)
    }
}
