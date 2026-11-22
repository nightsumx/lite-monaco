// CM7 缩进参考线 —— provider (state, view?)->DecorationSet + 活动参考线层。
//
// 大文档 + 有 view:只给视口邻域挂 line deco(虚拟化后不可见行挂 deco 也白费,且每键 O(全文) 卡死)。
// 小文档/无 view:全文(单测/无挂载)。
//
// 规则照 VS Code(textModel getLinesIndentGuides / getActiveIndentGuide):
//   - 单位 = model 的 indentSize:缩进选项槽(indentOptions,Indent Using Spaces / Tabs、Change Tab Display Size、
//     Detect Indentation 写进去)显式设过就用它;没设过 = 加载时 guessIndentation 探出的缩进宽(detectIndentWidth)
//   - 有字的行:ceil(缩进列 / 单位) 条
//   - 空行:看上下最近的有字行,上浅下深(块开头)= 上层 +1,一样深 = ceil,上深下浅 = 下层 +1;一边没有 = 0
//   - 活动线(光标所在块)单独一层画在正文上面:选区搬家不重建内容,做成 line deco 会跟不上光标

import type { DecorationSet } from '../model/decoration'
import { linePadLeft } from '../view/linepad'
import type { EditorState } from '../model/state'
import type { Rope as Text } from '../model/rope'
import type { EditorView } from '../view/editorview'
import { Decoration } from '../model/decoration'
import { RangeSet, RangeSetBuilder } from '../model/rangeset'
import { detectIndentWidth, leadingCols, leadingWs } from '../edit/indent'
import { indentConfig } from '../edit/enter'
import { indentOptions } from '../edit/commands'
import { getOption } from '../options'
import { bracketGuideLines } from './bracketguides'

// 有 view 就只画视口(虚拟化下挂全文 deco 白费);无 view(单测)才全文。
const VIEW_PAD = 40
// 空行向上/下找有字行的最远距离(超出按 0 处理,防大段空白卡顿)
const BLANK_SCAN = 200
// 探测缩进单位的采样行数
const SAMPLE = 1000

// 推断值按 doc + tabSize 缓存(Tab 缩进的文档推出来就是 tabSize,改了 tabSize 不能粘住旧值)
const unitCache = new WeakMap<Text, Map<number, number>>()

/** 缩进选项槽里有值 = 被命令显式设过(槽默认是空数组)。 */
function indentOptionsSet(state: EditorState): boolean {
    const c = indentOptions.get(state)
    return Array.isArray(c) ? c.length > 0 : c != null
}

/**
 * 参考线单位(Monaco model.getOptions().indentSize):缩进选项显式设过就用 indentSize(空格 = unit 长度,Tab = tabSize);
 * 否则按内容推断(VS Code 打开文件时 guessIndentation 一次,这里每个新 doc 探一次,采样前 1000 行)。
 */
export function indentUnit(state: EditorState): number {
    if (indentOptionsSet(state)) return Math.max(1, indentConfig(state).indentSize)
    const doc = state.doc
    const tab = state.tabSize
    let byTab = unitCache.get(doc)
    const hit = byTab?.get(tab)
    if (hit != null) return hit
    const sample: string[] = []
    for (let i = 1; i <= Math.min(doc.lines, SAMPLE); i++) sample.push(doc.line(i).text)
    const unit = detectIndentWidth(sample, tab)
    if (!byTab) unitCache.set(doc, byTab = new Map())
    byTab.set(tab, unit)
    return unit
}

/** 有字行的缩进列;空行/纯空白行 -1。 */
function contentIndent(text: string, tabSize: number): number {
    return leadingWs(text) === text.length ? -1 : leadingCols(text, tabSize)
}

/** 第 n 行的参考线条数(VS Code getLinesIndentGuides 同规则)。 */
export function guideLevel(doc: Text, n: number, unit: number, tabSize: number): number {
    const own = contentIndent(doc.line(n).text, tabSize)
    if (own >= 0) return Math.ceil(own / unit)
    let above = -1, below = -1
    for (let i = n - 1; i >= Math.max(1, n - BLANK_SCAN) && above < 0; i--) above = contentIndent(doc.line(i).text, tabSize)
    for (let i = n + 1; i <= Math.min(doc.lines, n + BLANK_SCAN) && below < 0; i++) below = contentIndent(doc.line(i).text, tabSize)
    if (above < 0 || below < 0) return 0
    if (above < below) return 1 + Math.floor(above / unit)
    if (above === below) return Math.ceil(below / unit)
    return 1 + Math.floor(below / unit)
}

/**
 * 光标所在块的活动参考线(VS Code getActiveIndentGuide 简化):
 *   - 光标行是块头(下一条有字行更深):活动线 = 光标行这一层,范围往下到块尾
 *   - 光标行是块尾(上一条有字行更深,如 `}`):活动线 = 光标行这一层,范围往上到块头
 *   - 否则:活动线 = 光标行的外一层,上下扩到比它浅的行为止
 * 返回 { index(第几条线,0 起), from/to(行号) };没有线返回 null。
 */
export function activeIndentGuide(state: EditorState, unit = indentUnit(state), bounds?: { from: number, to: number }): { index: number, from: number, to: number } | null {
    const doc = state.doc
    const tab = state.tabSize
    const L = doc.lineAt(state.selection.main.head).number
    const lv = (n: number) => guideLevel(doc, n, unit, tab)
    const cur = lv(L)
    const nextContent = (n: number, dir: 1 | -1) => {
        for (let i = n + dir, k = 0; i >= 1 && i <= doc.lines && k < BLANK_SCAN; i += dir, k++)
            if (contentIndent(doc.line(i).text, tab) >= 0) return i
        return 0
    }
    // bounds:只关心可见区时,扩到可见区外一行就停(大块不必扫全文)
    const lo = Math.max(1, bounds ? bounds.from : 1), hi = Math.min(doc.lines, bounds ? bounds.to : doc.lines)
    const extend = (from: number, dir: 1 | -1, min: number) => {
        let end = from
        for (let i = from + dir; i >= lo && i <= hi; i += dir) {
            if (lv(i) < min) break
            end = i
        }
        return end
    }
    const below = nextContent(L, 1)
    if (below && lv(below) > cur && contentIndent(doc.line(L).text, tab) >= 0) {
        const to = extend(L, 1, cur + 1)
        return to > L ? { index: cur, from: L + 1, to } : null
    }
    const above = nextContent(L, -1)
    if (above && lv(above) > cur && contentIndent(doc.line(L).text, tab) >= 0) {
        const from = extend(L, -1, cur + 1)
        return from < L ? { index: cur, from, to: L - 1 } : null
    }
    if (cur < 1) return null
    return { index: cur - 1, from: extend(L, -1, cur), to: extend(L, 1, cur) }
}

export function indentGuidesCM7(): (state: EditorState, view?: EditorView) => DecorationSet {
    // 只动选区的事务交回同一个对象(同 shikiHighlightCM7)
    let memo: { doc: Text, fromLine: number, toLine: number, unit: number, tabSize: number, set: DecorationSet } | null = null
    return (state: EditorState, view?: EditorView) => {
        // guides.indentation:false 不画缩进线(Monaco IndentGuidesOverlay:不取 getLinesIndentGuides)
        if ((getOption(state, 'guides') as { indentation?: boolean } | undefined)?.indentation === false) return RangeSet.empty
        const doc = state.doc
        const unit = indentUnit(state)

        let fromLine = 1
        let toLine = doc.lines
        if (view) {
            const a = doc.lineAt(Math.min(doc.length, Math.max(0, view.viewport.from))).number
            const b = doc.lineAt(Math.min(doc.length, Math.max(0, view.viewport.to))).number
            fromLine = Math.max(1, a - VIEW_PAD)
            toLine = Math.min(doc.lines, b + VIEW_PAD)
        }
        if (memo && memo.doc === doc && memo.fromLine === fromLine && memo.toLine === toLine && memo.unit === unit && memo.tabSize === state.tabSize) return memo.set

        const builder = new RangeSetBuilder<Decoration>()
        for (let i = fromLine; i <= toLine; i++) {
            const line = doc.line(i)
            const depth = guideLevel(doc, i, unit, state.tabSize)
            if (depth >= 1)
                builder.add(line.from, line.from, Decoration.line({
                    class: 'cm-indentGuide',
                    attributes: { style: `--indent-depth:${depth};--indent-width:${unit}` },
                }))
        }
        const set = builder.finish()
        memo = { doc, fromLine, toLine, unit, tabSize: state.tabSize, set }
        return set
    }
}

/** 活动参考线层:一根 1px 竖线盖在对应那条普通参考线上(editorIndentGuide.activeBackground1),每个事务同步重画。 */
export function activeIndentGuideLayer(view: EditorView): () => void {
    const doc = view.dom.ownerDocument
    const el = doc.createElement('div')
    el.className = 'cm-activeIndentGuide'
    el.setAttribute('aria-hidden', 'true')
    view.scrollDOM.appendChild(el)
    // 1ch 实测(参考线 CSS 用 ch 画,这里必须同一把尺)
    const probe = doc.createElement('span')
    probe.textContent = '0'.repeat(10)
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;font:inherit'
    let chW = 0
    // Monaco _primaryPosition 初值 null:光标第一次变化前不画活动参考线
    let live = false
    const draw = () => {
        if (!live) { el.style.display = 'none'; return }
        // guides.highlightActiveIndentation:false 不画活动线;true 在有括号对线的行上让位,'always' 照画
        const guides = getOption(view.state, 'guides') as { highlightActiveIndentation?: boolean | string, bracketPairs?: boolean | string } | undefined
        const hai = guides?.highlightActiveIndentation
        if (hai === false) { el.style.display = 'none'; return }
        const d = view.state.doc
        const vp = view.viewport
        const g = activeIndentGuide(view.state, indentUnit(view.state), {
            from: d.lineAt(Math.min(d.length, vp.from)).number - 1,
            to: d.lineAt(Math.min(d.length, vp.to)).number + 1,
        })
        if (!g) { el.style.display = 'none'; return }
        if (hai !== 'always' && guides?.bracketPairs) {
            const cov = bracketGuideLines.get(view)
            if (cov) for (let n = g.from; n <= g.to; n++) if (cov.has(n)) { el.style.display = 'none'; return }
        }
        if (!chW) {
            // 量字宽的探针挂进正文再摘掉:不包 ignore 的话 DOM 观察者当成用户改了正文,下一次 flush 就读一遍整行
            view.observer.ignore(() => {
                view.contentDOM.appendChild(probe)
                chW = probe.getBoundingClientRect().width / 10
                probe.remove()
            })
        }
        const unit = indentUnit(view.state)
        const a = view.lineBlockAt(view.state.doc.line(g.from).from)
        const b = view.lineBlockAt(view.state.doc.line(g.to).from)
        const sr = view.scrollDOM.getBoundingClientRect()
        const cr = view.contentDOM.getBoundingClientRect()
        const padL = linePadLeft(view)
        const left = cr.left - sr.left + view.scrollDOM.scrollLeft + padL + g.index * unit * (chW || view.oracle.charWidth)
        const top = cr.top - sr.top + view.scrollDOM.scrollTop + a.top
        el.style.cssText = `display:block;left:${left}px;top:${top}px;height:${b.bottom - a.top}px`
    }
    const offSel = view.onTransaction(tr => { if (tr.selection) live = true })
    const offTr = view.onViewUpdate(() => draw())
    const offGeo = view.onGeometry(() => { chW = 0; draw() })
    draw()
    return () => { offSel(); offTr(); offGeo(); el.remove() }
}
