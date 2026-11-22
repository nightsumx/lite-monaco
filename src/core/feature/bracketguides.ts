// 括号对参考线(Monaco guides.bracketPairs / bracketPairsHorizontal / highlightActiveBracketPair)。
//
// 算法照 guidesTextModelPart.getLinesBracketGuides:
//   - 多行括号对:竖线画在 min(开括号可见列, 闭括号可见列, 对内最小缩进列 + 1),从开括号行画到闭括号行之前;
//     闭括号前面有文字时多画一行(横线落在底部)。
//   - 横线(bracketPairsHorizontal):开括号行底部、闭括号行顶部(或底部)从竖线列横到括号列;单行括号对从开括号右边横到闭括号。
//   - bracketPairs: true 画所有对;'active' 只画包住光标的最内层一对;false 不画。
//   - 颜色按嵌套层数轮换(同括号配色池),活动对用实色,其余 30% 透明。
// 这是个 overlay(绝对定位 div),不是行内 HTML;和缩进线重叠处不去重(Monaco 在同列只画括号线)。

import type { EditorState } from '../model/state'
import { linePadLeft } from '../view/linepad'
import type { EditorView } from '../view/editorview'
import { getOption } from '../options'
import { bracketSkip, CLOSE_OPEN, OPEN_CLOSE, type BracketSkip } from '../edit/brackets'
import { bracketPairColorization } from '../edit/editoptions'
import { leadingCols } from '../edit/indent'

export interface BracketGuide {
    kind: 'vertical' | 'horizontal-top' | 'horizontal-bottom'
    /** vertical:起止行(含);horizontal:所在行 */
    fromLine: number
    toLine: number
    /** 竖线列 / 横线起点列(可见列,1 起) */
    col: number
    /** 横线终点可见列 */
    endCol?: number
    level: number
    active: boolean
}

export interface GuideConfig {
    pairs: boolean | 'active'
    horizontal: boolean | 'active'
    highlightActive: boolean
}

export function guideConfig(state: EditorState): GuideConfig {
    const g = (getOption(state, 'guides') ?? {}) as { bracketPairs?: boolean | string, bracketPairsHorizontal?: boolean | string, highlightActiveBracketPair?: boolean }
    return {
        pairs: g.bracketPairs === true ? true : g.bracketPairs === 'active' ? 'active' : false,
        horizontal: g.bracketPairsHorizontal === true ? true : g.bracketPairsHorizontal === 'active' ? 'active' : false,
        highlightActive: g.highlightActiveBracketPair !== false,
    }
}

const visCol = (text: string, idx: number, tab: number): number => {
    let c = 0
    for (let i = 0; i < idx && i < text.length; i++) c += text[i] === '\t' ? tab - (c % tab) : 1
    return c + 1
}

interface Pair { openLine: number, openIdx: number, closeLine: number, closeIdx: number, level: number, levelEq: number }

/** 在 [fromLine, toLine] 里扫括号对(开括号在窗口里的才算;窗口外没闭上的忽略)。 */
function scanPairs(state: EditorState, fromLine: number, toLine: number, skip: BracketSkip): Pair[] {
    const doc = state.doc
    const pairs: Pair[] = []
    const stack: { ch: string, line: number, idx: number }[] = []
    for (let n = fromLine; n <= toLine; n++) {
        const line = doc.line(n)
        const t = line.text
        for (let i = 0; i < t.length; i++) {
            const ch = t[i]
            const isOpen = ch in OPEN_CLOSE
            if (!isOpen && !(ch in CLOSE_OPEN)) continue
            if (skip?.(line.from + i)) continue
            if (isOpen) { stack.push({ ch, line: n, idx: i }); continue }
            if (stack.length && stack[stack.length - 1].ch === CLOSE_OPEN[ch]) {
                const o = stack.pop()!
                let eq = 0
                for (const s of stack) if (s.ch === o.ch) eq++
                pairs.push({ openLine: o.line, openIdx: o.idx, closeLine: n, closeIdx: i, level: stack.length, levelEq: eq })
            }
        }
    }
    return pairs
}

export function computeBracketGuides(
    state: EditorState,
    range: { fromLine: number, toLine: number },
    skip: BracketSkip,
    cfg: GuideConfig = guideConfig(state),
): BracketGuide[] {
    if (!cfg.pairs) return []
    const doc = state.doc
    const tab = state.tabSize
    const independent = bracketPairColorization(state).independentColorPoolPerBracketType
    const lo = Math.max(1, range.fromLine - 300)
    const hi = Math.min(doc.lines, range.toLine + 300)
    const pairs = scanPairs(state, lo, hi, skip)

    // 活动对:严格包住光标的最内层(开括号最靠后的)
    const head = state.selection.main.head
    let active: Pair | null = null
    {
        const hl = doc.lineAt(head)
        const hn = hl.number, hc = head - hl.from
        for (const p of pairs) {
            const afterOpen = hn > p.openLine || (hn === p.openLine && hc >= p.openIdx + 1)
            const beforeClose = hn < p.closeLine || (hn === p.closeLine && hc <= p.closeIdx)
            if (!(afterOpen && beforeClose)) continue
            if (!active || p.openLine > active.openLine || (p.openLine === active.openLine && p.openIdx > active.openIdx)) active = p
        }
    }

    const out: BracketGuide[] = []
    for (const p of pairs) {
        if (p.closeLine < range.fromLine || p.openLine > range.toLine) continue
        const isActive = p === active
        if (cfg.pairs === 'active' && !isActive) continue
        const level = independent ? p.levelEq : p.level
        const horiz = cfg.horizontal === true || (cfg.horizontal === 'active' && isActive)
        const act = cfg.highlightActive && isActive
        const openText = doc.line(p.openLine).text
        const closeText = doc.line(p.closeLine).text
        const startVis = visCol(openText, p.openIdx, tab)
        const endVis = visCol(closeText, p.closeIdx, tab)
        if (p.openLine === p.closeLine) {
            if (horiz) out.push({ kind: 'horizontal-bottom', fromLine: p.openLine, toLine: p.openLine, col: visCol(openText, p.openIdx + 1, tab), endCol: endVis, level, active: act })
            continue
        }
        let minIndent = Infinity
        for (let n = p.openLine; n <= p.closeLine; n++) {
            const t = doc.line(n).text
            if (/^\s*$/.test(t)) continue
            minIndent = Math.min(minIndent, leadingCols(t, tab))
        }
        const col = Math.min(startVis, endVis, (minIndent === Infinity ? 0 : minIndent) + 1)
        const firstNonWs = closeText.search(/\S/)
        const textBeforeClose = firstNonWs >= 0 && firstNonWs < p.closeIdx
        out.push({ kind: 'vertical', fromLine: p.openLine, toLine: textBeforeClose ? p.closeLine : p.closeLine - 1, col, level, active: act })
        if (horiz) {
            if (startVis > col) out.push({ kind: 'horizontal-bottom', fromLine: p.openLine, toLine: p.openLine, col, endCol: startVis, level, active: act })
            if (endVis > col) out.push({ kind: textBeforeClose ? 'horizontal-bottom' : 'horizontal-top', fromLine: p.closeLine, toLine: p.closeLine, col, endCol: endVis, level, active: act })
        }
    }
    return out
}

/** 每个 view 上一次画出的括号线所覆盖的行(缩进线的活动线层据此退让)。 */
export const bracketGuideLines = new WeakMap<EditorView, Set<number>>()

/**
 * 括号对参考线层:每个事务 / 滚动 / 几何变化后重画视口。
 * palette = 括号配色(editorBracketHighlight.foregroundN);线色 = 同色 30% 透明,活动对 = 实色。
 */
export function bracketPairGuideLayer(view: EditorView, palette: string[]): () => void {
    const doc = view.dom.ownerDocument
    const host = doc.createElement('div')
    host.className = 'cm-bracketPairGuides'
    host.setAttribute('aria-hidden', 'true')
    view.scrollDOM.appendChild(host)
    const probe = doc.createElement('span')
    probe.textContent = '0'.repeat(10)
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;font:inherit'
    let chW = 0
    const draw = () => {
        const cfg = guideConfig(view.state)
        const pal = palette.length ? palette : ['#808080']
        if (!cfg.pairs) {
            if (host.firstChild) host.textContent = ''
            bracketGuideLines.delete(view)
            return
        }
        const d = view.state.doc
        const vp = view.viewport
        const range = {
            fromLine: d.lineAt(Math.min(d.length, Math.max(0, vp.from))).number,
            toLine: d.lineAt(Math.min(d.length, Math.max(0, vp.to))).number,
        }
        const guides = computeBracketGuides(view.state, range, bracketSkip(view, d), cfg)
        const covered = new Set<number>()
        for (const g of guides) if (g.kind === 'vertical') for (let n = g.fromLine; n <= g.toLine; n++) covered.add(n)
        bracketGuideLines.set(view, covered)
        if (!chW) {
            // 量字宽的探针挂进正文再摘掉:不包 ignore 的话 DOM 观察者当成用户改了正文,下一次 flush 就读一遍整行
            view.observer.ignore(() => {
                view.contentDOM.appendChild(probe)
                chW = probe.getBoundingClientRect().width / 10
                probe.remove()
            })
        }
        const cw = chW || view.oracle.charWidth
        const sr = view.scrollDOM.getBoundingClientRect()
        const cr = view.contentDOM.getBoundingClientRect()
        const padL = linePadLeft(view)
        const x0 = cr.left - sr.left + view.scrollDOM.scrollLeft + padL
        const y0 = cr.top - sr.top + view.scrollDOM.scrollTop
        const frag = doc.createDocumentFragment()
        for (const g of guides) {
            const a = view.lineBlockAt(d.line(Math.min(d.lines, Math.max(1, g.fromLine))).from)
            const b = view.lineBlockAt(d.line(Math.min(d.lines, Math.max(1, g.toLine))).from)
            const el = doc.createElement('div')
            const color = pal[g.level % pal.length]
            el.className = `cm-bracketPairGuide cm-bpg-${g.kind}${g.active ? ' cm-bpg-active' : ''}`
            el.dataset.level = String(g.level)
            el.style.setProperty('--bpg-color', g.active ? color : `color-mix(in srgb, ${color} 30%, transparent)`)
            const left = x0 + (g.col - 1) * cw
            if (g.kind === 'vertical') {
                el.style.cssText += `;left:${left}px;top:${y0 + a.top}px;height:${b.bottom - a.top}px;width:${cw}px`
            } else {
                const w = Math.max(0, ((g.endCol ?? g.col) - g.col) * cw)
                const top = g.kind === 'horizontal-top' ? y0 + a.top : y0 + a.bottom - 1
                el.style.cssText += `;left:${left}px;top:${top}px;width:${w}px;height:1px`
            }
            frag.appendChild(el)
        }
        host.textContent = ''
        host.appendChild(frag)
    }
    const offTr = view.onViewUpdate(() => draw())
    const offGeo = view.onGeometry(() => { chW = 0; draw() })
    const onScroll = () => draw()
    view.scrollDOM.addEventListener('scroll', onScroll, { passive: true })
    draw()
    return () => { offTr(); offGeo(); view.scrollDOM.removeEventListener('scroll', onScroll); host.remove(); bracketGuideLines.delete(view) }
}
