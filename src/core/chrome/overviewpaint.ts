// 概览尺(竖条下面那一列标记)照 Monaco 0.52 画:
//   - 标记来源 = 带 overviewRuler 选项的装饰(viewModelImpl.getAllOverviewRulerDecorations):
//       查找命中(findDecorations,Center,findMatchForeground,当前命中 z 13 / 其余 z 10;超过 1000 个按行距并段)、
//       诊断(markerDecorationsService,Right,error z30 / warning z20 / info z10)、
//       同词高亮(highlightDecorations,Center:Write = wordHighlightStrongForeground,Text = wordHighlightTextForeground,
//         Read = wordHighlightForeground)、选中串(selectionHighlighter,Center,selectionHighlightForeground;
//         语言有 documentHighlightProvider 时不进概览尺)、括号匹配(bracketMatching,Center,bracketMatchForeground);
//   - 按颜色分组,同组同 lane 行号相邻的并成一段(OverviewRulerDecorations.accept);组按 zIndex、颜色排序后依次画;
//   - decorationsOverviewRuler._render:lane 由 overviewRulerLanes(API 默认 2)从 x=1 起分;一段至少 6px 高
//     (不足按中心撑开);光标另画在最上面,满宽 2px,颜色 editorCursor × 0.7;最后描左边和顶边的 border。
// 对照页实测像素见 /tmp/lc-hunt/r7/monaco-ruler.ts、ruler-compare.ts。
// 只依赖 model / 几个 feature 的纯函数,不 import view(避免环)。

import type { EditorState, Transaction } from '../model/state'
import type { EditorView } from '../view/editorview'
import type { OverviewColors, RulerPalette } from './ruler'

export type { OverviewColors }
import { getOption } from '../options'
import { diagnosticsField } from '../feature/diagnostics'
import { searchField } from '../feature/search'
import { rangeHighlightField } from '../feature/gotoline'
import { bracketMatchingDecorations, selectionHighlightRanges, wordHighlightRanges } from '../feature/selectionlayer'

/** OverviewRulerLane:Left 1 / Center 2 / Right 4 / Full 7 */
export const LANE = { Left: 1, Center: 2, Right: 4, Full: 7 } as const

/** 一条装饰:文档位置区间 → 起止行(Monaco 用 range 的 start / end 行) */
export interface OverviewDeco { from: number, to: number, color: string, z: number, lane: number }
export interface OverviewGroup { color: string, z: number, data: number[] } // data:[lane, startLine, endLine]×n

/** 同词高亮来源(TS 语义高亮 highlightField):write → Strong,其余 → Text */
export type WordHighlightSource = (state: EditorState) => readonly { from: number, to: number, write?: boolean }[] | null

export interface OverviewSourceOptions {
    /** 编辑器的语义同词高亮;给了(返回数组或 null 都算)就当作有 documentHighlightProvider:选中串不进概览尺 */
    wordHighlights?: WordHighlightSource
    /** wordHighlights 来源为空时退回文本同词 + 选中串(非 TS 语言:documentHighlightProvider 可能没注册,或这次没给结果)。
     *  不设 = TS 语义来源:只要给了来源,选中串就不进概览尺 */
    wordHighlightsFallback?: boolean
    /** 文本同词(TextualDocumentHighlightProvider)是否在(Monaco WordHighlighter 的出现 / 清掉时机) */
    textualWordsLive?: boolean
    selectionHighlight?: boolean
    bracketMatch?: boolean
    /** 括号匹配跳过字符串 / 注释用的 owner(highlightLayer 传 view) */
    bracketOwner?: object | null
    /** 主题没给 editorOverviewRuler.background 时的底色:Monaco 在 minimap 开在右边时用编辑器底色,否则透明 */
    background?: string
}

// 查找命中超过这么多时改画「近似」段(findDecorations.set)
const FIND_APPROX = 1000

export function collectOverviewDecos(state: EditorState, colors: OverviewColors, opts: OverviewSourceOptions = {}, approxPixelsPerLine = 1): OverviewDeco[] {
    const out: OverviewDeco[] = []
    const doc = state.doc
    const len = doc.length

    const sf = state.field(searchField, false)
    if (sf && sf.open && sf.matches.length) {
        if (sf.matches.length > FIND_APPROX) {
            // 按行距并段:mergeLinesDelta = max(2, ceil(3 / 每行像素))
            const delta = Math.max(2, Math.ceil(3 / approxPixelsPerLine))
            let s = doc.lineAt(sf.matches[0].from).number, e = doc.lineAt(sf.matches[0].to).number
            const push = () => out.push({ from: doc.line(s).from, to: doc.line(e).from, color: colors.findMatch, z: 0, lane: LANE.Center })
            for (let i = 1; i < sf.matches.length; i++) {
                const m = sf.matches[i]
                const ms = doc.lineAt(m.from).number
                if (e + delta >= ms) { const me = doc.lineAt(m.to).number; if (me > e) e = me }
                else { push(); s = ms; e = doc.lineAt(m.to).number }
            }
            push()
        } else {
            const cur = sf.highlighted ? sf.currentMatch : -1
            sf.matches.forEach((m, i) => out.push({ from: m.from, to: m.to, color: colors.findMatch, z: i === cur ? 13 : 10, lane: LANE.Center }))
        }
    }

    // Go to Line 预览行(quick-access-range-highlight,Full)
    const rh = state.field(rangeHighlightField, false)
    if (rh != null && colors.rangeHighlight) out.push({ from: rh, to: rh, color: colors.rangeHighlight, z: 0, lane: LANE.Full })

    for (const d of state.field(diagnosticsField, false) ?? []) {
        const color = d.severity === 'error' ? colors.error : d.severity === 'warning' ? colors.warning : colors.info
        const z = d.severity === 'error' ? 30 : d.severity === 'warning' ? 20 : 10
        out.push({ from: Math.min(d.from, len), to: Math.min(Math.max(d.to, d.from), len), color, z, lane: LANE.Right })
    }

    const semantic = opts.wordHighlights ? opts.wordHighlights(state) : null
    if (semantic) {
        for (const m of semantic) if (m.from < m.to && m.to <= len)
            out.push({ from: m.from, to: m.to, color: m.write ? colors.wordHighlightStrong : colors.wordHighlightText, z: 0, lane: LANE.Center })
    } else if (opts.textualWordsLive) {
        for (const r of wordHighlightRanges(state)) out.push({ from: r.from, to: r.to, color: colors.wordHighlightText, z: 0, lane: LANE.Center })
    }
    // 选中串:语言有 documentHighlightProvider 时用 _SELECTION_HIGHLIGHT_OPTIONS_NO_OVERVIEW
    const hasSemanticSource = opts.wordHighlights ? (opts.wordHighlightsFallback ? !!semantic : true) : false
    if (opts.selectionHighlight !== false && !hasSemanticSource)
        for (const r of selectionHighlightRanges(state)) out.push({ from: r.from, to: r.to, color: colors.selectionHighlight, z: 0, lane: LANE.Center })

    if (opts.bracketMatch !== false) {
        const it = bracketMatchingDecorations(state, opts.bracketOwner, { enclosing: false }).iter()
        for (; it.value; it.next()) out.push({ from: it.from, to: it.to, color: colors.bracketMatch, z: 0, lane: LANE.Center })
    }
    return out
}

/** Monaco OverviewRulerDecorations:装饰按起点排序后按颜色分组,同 lane 且行相邻(prevEnd + 1 >= start)的并段 */
export function groupOverviewDecos(state: EditorState, decos: readonly OverviewDeco[], viewLine: (line: number) => number = l => l): OverviewGroup[] {
    const doc = state.doc
    const sorted = decos.map((d, i) => ({ d, i })).sort((a, b) => a.d.from - b.d.from || a.d.to - b.d.to || a.i - b.i)
    const map = new Map<string, OverviewGroup>()
    const arr: OverviewGroup[] = []
    for (const { d } of sorted) {
        const s = viewLine(doc.lineAt(d.from).number)
        const e = viewLine(doc.lineAt(d.to).number)
        const g = map.get(d.color)
        if (!g) { const ng = { color: d.color, z: d.z, data: [d.lane, s, e] }; map.set(d.color, ng); arr.push(ng); continue }
        const n = g.data.length
        if (g.data[n - 3] === d.lane && g.data[n - 1] + 1 >= s) { if (e > g.data[n - 1]) g.data[n - 1] = e }
        else g.data.push(d.lane, s, e)
    }
    // OverviewRulerDecorationsGroup.compareByRenderingProps:zIndex 升序,同 z 按颜色串
    return arr.sort((a, b) => a.z - b.z || (a.color < b.color ? -1 : a.color > b.color ? 1 : 0))
}

/** Settings._initLanes:返回 [x[], w[]],下标是 lane 位掩码 */
export function overviewLanes(canvasWidth: number, laneCount: number): [number[], number[]] {
    const left = 1
    const rem = canvasWidth - left
    if (laneCount >= 3) {
        const lw = Math.floor(rem / 3), rw = Math.floor(rem / 3), cw = rem - lw - rw
        const co = left + lw, ro = left + lw + cw
        return [[0, left, co, left, ro, left, co, left], [0, lw, cw, lw + cw, rw, lw + cw + rw, cw + rw, lw + cw + rw]]
    }
    if (laneCount === 2) {
        const lw = Math.floor(rem / 2), rw = rem - lw, ro = left + lw
        return [[0, left, left, left, ro, left, left, left], [0, lw, lw, lw, rw, lw + rw, lw + rw, lw + rw]]
    }
    return [[0, left, left, left, left, left, left, left], [0, rem, rem, rem, rem, rem, rem, rem]]
}

export interface OverviewGeometry {
    /** canvas 像素尺寸(CSS 尺寸 × dpr,取整) */
    width: number
    height: number
    dpr: number
    /** Monaco viewLayout.getScrollHeight()(CSS px) */
    scrollHeight: number
    /** 视图行 → 顶边 / 行高(CSS px,文档坐标) */
    lineTop: (viewLine: number) => number
    lineHeight: (viewLine: number) => number
    lanes?: number
}

/** decorationsOverviewRuler._render */
export function paintOverview(ctx: CanvasRenderingContext2D, groups: readonly OverviewGroup[],
    cursors: readonly { line: number, color: string }[], g: OverviewGeometry, border?: string, background?: string): void {
    const { width, height, dpr } = g
    ctx.clearRect(0, 0, width, height)
    if (background) {
        ctx.fillStyle = background
        ctx.fillRect(0, 0, width, height)
    }
    const [x, w] = overviewLanes(width, g.lanes ?? 2)
    const ratio = height / Math.max(1, g.scrollHeight)
    const minH = (6 * dpr) | 0
    const halfMin = (minH / 2) | 0
    for (const grp of groups) {
        ctx.fillStyle = grp.color
        const data = grp.data
        let prevLane = 0, prevY1 = 0, prevY2 = 0
        for (let i = 0, n = data.length / 3; i < n; i++) {
            const lane = data[3 * i], s = data[3 * i + 1], e = data[3 * i + 2]
            let y1 = (g.lineTop(s) * ratio) | 0
            let y2 = ((g.lineTop(e) + g.lineHeight(e)) * ratio) | 0
            if (y2 - y1 < minH) {
                let yc = ((y1 + y2) / 2) | 0
                if (yc < halfMin) yc = halfMin
                else if (yc + halfMin > height) yc = height - halfMin
                y1 = yc - halfMin
                y2 = yc + halfMin
            }
            if (y1 > prevY2 + 1 || lane !== prevLane) {
                if (i !== 0) ctx.fillRect(x[prevLane], prevY1, w[prevLane], prevY2 - prevY1)
                prevLane = lane; prevY1 = y1; prevY2 = y2
            } else if (y2 > prevY2) prevY2 = y2
        }
        ctx.fillRect(x[prevLane], prevY1, w[prevLane], prevY2 - prevY1)
    }
    // 光标:满宽 2px,按行排好序;相邻同色并段
    const ch = (2 * dpr) | 0
    const half = (ch / 2) | 0
    const cx = x[LANE.Full], cw = w[LANE.Full]
    let prevY1 = -100, prevY2 = -100
    let prevColor: string | null = null
    cursors.forEach((c, i) => {
        let yc = (g.lineTop(c.line) * ratio) | 0
        if (yc < half) yc = half
        else if (yc + half > height) yc = height - half
        const y1 = yc - half, y2 = y1 + ch
        if (y1 > prevY2 + 1 || c.color !== prevColor) {
            if (i !== 0 && prevColor) ctx.fillRect(cx, prevY1, cw, prevY2 - prevY1)
            prevY1 = y1; prevY2 = y2
        } else if (y2 > prevY2) prevY2 = y2
        prevColor = c.color
        ctx.fillStyle = c.color
    })
    if (prevColor) ctx.fillRect(cx, prevY1, cw, prevY2 - prevY1)
    if (border) {
        ctx.beginPath()
        ctx.lineWidth = 1
        ctx.strokeStyle = border
        ctx.moveTo(0, 0)
        ctx.lineTo(0, height)
        ctx.moveTo(1, 0)
        ctx.lineTo(width, 0)
        ctx.stroke()
    }
}

/** 光标:单光标 editorCursor,多光标主 / 次(editorMultiCursor.primary / secondary),按位置排序 */
export function overviewCursors(state: EditorState, colors: OverviewColors, viewLine: (line: number) => number = l => l): { line: number, color: string }[] {
    // hideCursorInOverviewRuler:概览尺不标光标
    if (getOption(state, 'hideCursorInOverviewRuler')) return []
    const rs = state.selection.ranges
    const main = state.selection.mainIndex
    const out = rs.map((r, i) => ({
        head: r.head,
        color: rs.length > 1 ? (i === main ? colors.cursorPrimary ?? colors.cursor : colors.cursorSecondary ?? colors.cursor) : colors.cursor,
    }))
    out.sort((a, b) => a.head - b.head)
    return out.map(c => ({ line: viewLine(state.doc.lineAt(c.head).number), color: c.color }))
}

/** Monaco WordHighlighter 的出现时机(文本同词):有焦点时用户挪光标、获得焦点 → 在;改文档、程序设选区 → 清;失焦保留 */
export function trackTextualWords(view: EditorView, onChange: () => void): { live: () => boolean, update: (tr: Transaction) => void, dispose: () => void } {
    let live = view.hasFocus
    const onFocus = () => { if (!live) { live = true; onChange() } }
    view.contentDOM.addEventListener('focus', onFocus)
    return {
        live: () => live,
        update(tr) {
            if (tr.docChanged) live = false
            else if (tr.selection) live = view.hasFocus && tr.isUserEvent('select')
        },
        dispose: () => view.contentDOM.removeEventListener('focus', onFocus),
    }
}

/** 画一帧:收集 → 分组 → 画。view 相关的几何都在这里读 */
export function drawOverview(view: EditorView, canvas: HTMLCanvasElement, cssW: number, cssH: number,
    palette: RulerPalette, opts: OverviewSourceOptions): void {
    const colors = palette.overview
    if (!colors) return
    const dpr = window.devicePixelRatio || 1
    const W = (cssW * dpr) | 0, H = (cssH * dpr) | 0
    if (canvas.width !== W) canvas.width = W
    if (canvas.height !== H) canvas.height = H
    canvas.style.width = `${cssW}px`
    canvas.style.height = `${cssH}px`
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const state = view.state
    const scrollHeight = Math.max(view.metrics.height, cssH)
    const lines = state.doc.lines
    const decos = collectOverviewDecos(state, colors, opts, cssH / Math.max(1, lines))
    // 行 → 顶边:折叠里的行落在折叠头(Monaco 的视图行);段底 = 顶边 + lineHeight(Monaco 用的是选项里的行高)
    const top = (line: number) => view.lineBlockAt(state.doc.line(Math.min(Math.max(1, line), lines)).from).top
    const lh = view.oracle.lineHeight
    paintOverview(ctx, groupOverviewDecos(state, decos), overviewCursors(state, colors), {
        width: W, height: H, dpr, scrollHeight: scrollHeight * dpr,
        lineTop: l => top(l) * dpr,
        lineHeight: () => lh * dpr,
    }, colors.border, colors.background ?? opts.background)
}
