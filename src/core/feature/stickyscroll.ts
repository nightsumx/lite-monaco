// Sticky Scroll —— 视口上方粘性作用域行(对齐 VS Code StickyScrollController)。
//
// 作用域来源按 Monaco stickyScroll.defaultModel = 'outlineModel' 的回退链:
//   outline(宿主传 opts.outline,如 lang/tssticky 的 TS navigation tree)→ 折叠范围(foldingProviderModel /
//   indentationModel:起始行 = 可折行,结束行 = 折叠体最后一行,不含收尾的 `}`)。宿主也可传 scopes 直接给扁平作用域。
// 布局按 VS Code findScrollWidgetState:第 i 个 sticky 行占 [i*lh, (i+1)*lh);作用域起始行顶已滚出该格
// 且结束行底还在格下方才上榜;最后一行被结束行顶上去(负偏移),整块高度跟着缩。
// scroll 事件里同步画(scroll 事件在本帧 rAF 前派发),不等 EditorView 的 setTimeout 视口更新。

import type { EditorView } from '../view/editorview'
import type { EditorState } from '../model/state'
import type { ChangeSet } from '../model/change'
import { EditorSelection } from '../model/selection'
import { budgetForState } from '../perf'
import { leadingWs } from '../edit/indent'
import type { Transaction } from '../model/state'
import { providerFoldLines, providerRange, extraFoldField, indentFoldLines, indentMarkerRange, hiddenLineRanges } from '../edit/fold'
import { getOption } from '../options'
import { selectTokenCache, tokensInLineRange, linesForDoc, subscribeTokens, EDIT_RETOKENIZE_MAX } from '../view/tokens'
import { bracketSkip, CLOSE_OPEN, OPEN_CLOSE } from '../edit/brackets'
import { DepthIndex } from './depthindex'

export interface StickyLine {
    line: number
    from: number
    text: string
    indent: number
}

/** 一个作用域:start 行(显示在 sticky 里)到 end 行(作用域体最后一行),1-based */
export interface StickyScope {
    start: number
    end: number
}

export function leadingIndent(text: string): number {
    return leadingWs(text)
}

/**
 * 旧的缩进启发式(视口顶行往上收集缩进更浅的行)。overlay 已改用作用域,保留导出给老调用方。
 */
export function computeStickyLines(
    doc: {
        lines: number
        line: (n: number) => { from: number, text: string }
    },
    viewportStartLine: number,
    maxLines = 5,
): StickyLine[] {
    if (viewportStartLine <= 1) return []
    const stack: StickyLine[] = []
    let water = Infinity
    for (let n = viewportStartLine - 1; n >= 1 && stack.length < maxLines * 3; n--) {
        const line = doc.line(n)
        const t = line.text
        if (!t.trim()) continue
        const ind = leadingIndent(t)
        if (ind < water) {
            stack.push({ line: n, from: line.from, text: t.trimEnd(), indent: ind })
            water = ind
            if (water === 0 && stack.length >= 1) break
        }
    }
    stack.reverse()
    return stack.slice(0, maxLines)
}

const CLOSERS = ')]}'
// 改文档后多久重算折叠作用域(Monaco:RunOnceScheduler 50ms + StickyModelProvider 的 Delayer 300ms)
const STICKY_FOLD_DELAY = 350

/** 作用域树节点(Monaco StickyElement):children 按 start 升序、互不相交 */
export interface StickyNode extends StickyScope {
    children: StickyNode[]
}

/** 扁平作用域 → 嵌套树(按 start 升序、同 start 长者在外;被父范围包住的挂到父下) */
export function scopeTree(flat: readonly StickyScope[]): StickyNode[] {
    const sorted = [...flat].sort((a, b) => a.start - b.start || b.end - a.end)
    const roots: StickyNode[] = []
    const stack: StickyNode[] = []
    for (const s of sorted) {
        const node: StickyNode = { start: s.start, end: s.end, children: [] }
        while (stack.length && !(s.start > stack[stack.length - 1].start && s.end <= stack[stack.length - 1].end)) stack.pop()
        const parent = stack[stack.length - 1]
        if (parent) parent.children.push(node)
        else roots.push(node)
        stack.push(node)
    }
    return roots
}

// 折叠范围 → 作用域树。按 doc + 外部折叠表缓存(滚动时不重算)。
// 只取 provider 块(region / 缩进 / TS outlining 补的),不看手建块:Monaco 的 sticky 模型自己跑
// IndentRangeProvider / SyntaxRangeProvider(stickyScrollModelProvider),不读 FoldingModel 里的 userDefined 块,
// 也不受手建块挤掉 provider 块的影响(对照页实测:平铺文档手建一块、滚进块里,Monaco 没有 sticky)。
const scopeCache = new WeakMap<object, { extra: unknown, roots: StickyNode[] }>()
const indentScopeCache = new WeakMap<object, { tabSize: number, roots: StickyNode[] }>()
/** indentOnly:stickyScroll.defaultModel = 'indentationModel' —— 只看缩进 / region 块,不用 TS outlining 补的 */
export function foldScopes(state: EditorState, indentOnly = false): StickyNode[] {
    const extra = state.field(extraFoldField, false)
    const hit = indentOnly ? indentScopeCache.get(state.doc) : scopeCache.get(state.doc)
    if (hit && (indentOnly ? (hit as { tabSize: number }).tabSize === state.tabSize : (hit as { extra: unknown }).extra === extra)) return hit.roots
    const doc = state.doc
    const out: StickyScope[] = []
    const seen = new Set<number>()
    for (const n of indentOnly ? indentFoldLines(state) : providerFoldLines(state)) {
        if (seen.has(n)) continue
        seen.add(n)
        const r = indentOnly ? indentMarkerRange(state, doc.line(n).from) : providerRange(state, doc.line(n).from)
        if (!r) continue
        let end = doc.lineAt(r.to).number
        // 范围收在本作用域自己的 `}` 上(TS outlining 这样给)时不算作用域体,VS Code 折叠范围止于它前一行。
        // 缩进更深的 `}`(内层块的收尾)属于体内,不动
        const et = doc.line(end).text
        const t = et.trim()
        if (end > n && t && CLOSERS.includes(t[0]) && leadingWs(et) <= leadingWs(doc.line(n).text)) end--
        // VS Code 缩进范围(非 offSide 语言)把紧随的空行算进体内:作用域一直顶到下一个非空行之前
        else while (end < doc.lines && !doc.line(end + 1).text.trim()) end++
        if (end > n) out.push({ start: n, end })
    }
    const roots = scopeTree(out)
    if (indentOnly) indentScopeCache.set(state.doc, { tabSize: state.tabSize, roots })
    else scopeCache.set(state.doc, { extra, roots })
    return roots
}

/** Monaco binarySearch + StickyLineCandidateProvider.updateIndex:≤ key 的最后一个下标(没有则 0) */
function floorIndex(starts: number[], key: number): number {
    let lo = 0, hi = starts.length - 1
    while (lo <= hi) {
        const mid = (lo + hi) >> 1
        if (starts[mid] < key) lo = mid + 1
        else if (starts[mid] > key) hi = mid - 1
        else return mid
    }
    const ins = lo // 未命中:插入点
    return ins === 0 ? 0 : ins - 1
}

/** 一个候选行(Monaco StickyLineCandidate):start / end = 作用域起始行 / 体末行;top / height = 它在 sticky 区里占的格(自上而下累加) */
export interface StickyCandidate {
    start: number
    end: number
    depth: number
    top: number
    height: number
}

/**
 * 候选行(Monaco getCandidateStickyLinesIntersectingFromStickyModel):
 * 每层只看 start 落在 [视口首行所在位置, 视口末行所在位置] 里的子节点(二分),且与视口相交、体跨至少两行。
 * lineHeight:格高(数,或 行号→高),候选的 top = 祖先格高之和。
 */
export function stickyCandidates(
    roots: readonly StickyNode[],
    visStart: number,
    visEnd: number,
    lineHeight: number | ((line: number) => number) = 0,
): StickyCandidate[] {
    const out: StickyCandidate[] = []
    const heightOf = typeof lineHeight === 'function' ? lineHeight : () => lineHeight
    const walk = (children: readonly StickyNode[], depth: number, lastStart: number, top: number) => {
        if (!children.length) return
        const starts = children.map(c => c.start)
        const lower = floorIndex(starts, visStart)
        const upper = floorIndex(starts, visEnd)
        let last = lastStart
        for (let i = lower; i <= upper; i++) {
            const c = children[i]
            if (!c) return
            // Monaco 的 range.end 是「体末行 + 1」;这里 c.end 是体末行。Monaco 要求 endLineNumber > startLineNumber + 1,即体末行 > 起始行
            if (c.end > c.start && visStart <= c.end + 2 && c.start - 1 <= visEnd && c.start !== last) {
                last = c.start
                const height = heightOf(c.start)
                out.push({ start: c.start, end: c.end, depth: depth + 1, top, height })
                walk(c.children, depth + 1, c.start, top + height)
            }
        }
    }
    walk(roots, 0, -1, 0)
    return out
}

/** Monaco StickyScrollWidgetState:挂在 sticky 区里的作用域起始行 / (体末行 + 1)、最后一格被下一个作用域顶上去的偏移(≤ 0) */
export interface StickyWidgetState {
    startLineNumbers: number[]
    endLineNumbers: number[]
    lastLineRelativePosition: number
}

/**
 * Monaco findScrollWidgetState 的挑选规则(纯函数,sticky overlay 和 StickyScrollController 共用):
 * 候选格顶 > 起始行顶(起始行已滚到格上面)且 ≤ 末行底(体还没滚完)才上榜;最多 maxLines 行。
 * 格底超出末行底(体末被下一个作用域顶着走)时,最后一行相对位置 = 末行底 − 格底(负数)。
 * topOf / bottomOf:行号 → 内容坐标(含折行,隐藏行不占高)。
 */
export function stickyWidgetState(
    cands: readonly Pick<StickyCandidate, 'start' | 'end' | 'top' | 'height'>[],
    scrollTop: number,
    maxLines: number,
    topOf: (line: number) => number,
    bottomOf: (line: number) => number,
): StickyWidgetState {
    const startLineNumbers: number[] = []
    const endLineNumbers: number[] = []
    let lastLineRelativePosition = 0
    for (const c of cands) {
        const bottomOfElement = c.top + c.height
        const topOfBeginningLine = topOf(c.start) - scrollTop
        const bottomOfEndLine = bottomOf(c.end) - scrollTop
        if (c.top > topOfBeginningLine && c.top <= bottomOfEndLine) {
            startLineNumbers.push(c.start)
            endLineNumbers.push(c.end + 1)
            if (bottomOfElement > bottomOfEndLine) lastLineRelativePosition = bottomOfEndLine - bottomOfElement
        }
        if (startLineNumbers.length === maxLines) break
    }
    return { startLineNumbers, endLineNumbers, lastLineRelativePosition }
}

/** Monaco _onDidResize:sticky 最多占编辑器高度的 1/4(四舍五入的行数);没有布局(高 0)时不限 */
export function stickyMaxLines(editorHeight: number, lineHeight: number, maxLineCount: number): number {
    return editorHeight > 0 && lineHeight > 0 ? Math.min(maxLineCount, Math.round(editorHeight / lineHeight * 0.25)) : maxLineCount
}

/** 候选整段落在隐藏行段里的不上 sticky(Monaco filterHiddenRanges:折叠 + setHiddenAreas 的并集) */
export function filterHiddenCandidates<T extends { start: number, end: number }>(cands: T[], hidden: readonly (readonly [number, number])[]): T[] {
    if (!hidden.length) return cands
    return cands.filter(c => !hidden.some(([a, b]) => c.start >= a && c.end <= b + 1))
}

/**
 * Monaco findScrollWidgetState 用 editor.getVisibleRanges() —— 完整可见的行(LinesLayout.getLinesViewportData 的
 * completelyVisibleStart/EndLineNumber):首行顶部被卷掉一点就从下一行算,末行底部露不全就退一行(只剩一行时不动)。
 * first / last:部分可见的首末行。
 */
export function completelyVisibleLines(
    first: number,
    last: number,
    scrollTop: number,
    height: number,
    lineTop: (n: number) => number,
    lineBottom: (n: number) => number,
): { start: number, end: number } {
    let start = first, end = last
    // 0.5px 容差:scrollTop 由 DOM 矩形相减得到,带亚像素误差;Monaco 的 scrollTop 是整数
    if (start < end && lineTop(start) < scrollTop - 0.5) start++
    if (start < end && lineBottom(end) > scrollTop + height + 0.5) end--
    return { start, end }
}

/**
 * 按 Monaco findScrollWidgetState 选 sticky 行(stickyWidgetState 的定高包装:第 depth 层占 [(depth-1)*lh, depth*lh))。
 * lineTop/lineBottom:行号 → 内容坐标;返回行号表和最后一行的偏移(≤0,被下一个作用域顶上去)。
 */
export function stickyLayout(
    cands: readonly { start: number, end: number, depth: number }[],
    scrollTop: number,
    lineHeight: number,
    lineTop: (n: number) => number,
    lineBottom: (n: number) => number,
    maxLines = 5,
): { lines: number[], lastOffset: number } {
    const boxes = cands.map(c => ({ start: c.start, end: c.end, top: (c.depth - 1) * lineHeight, height: lineHeight }))
    const st = stickyWidgetState(boxes, scrollTop, maxLines, lineTop, lineBottom)
    // Monaco _isWidgetHeightZero:整块高度 ≤ 0 就不显示
    if (st.startLineNumbers.length * lineHeight + st.lastLineRelativePosition <= 0) return { lines: [], lastOffset: 0 }
    return { lines: st.startLineNumbers, lastOffset: st.lastLineRelativePosition }
}

/**
 * sticky 行点击的列偏移(Monaco getEditorPositionFromNode):点中叶子 token span → 该 span 起点;
 * 同色相邻 span 先并成一段(Monaco 渲染把同 metadata 的 token 合成一个 span,前导空白和后面的标识符同色就在一段里)。
 * 点在文本外(行背景、行号、代码容器)→ 0。
 */
export function stickyClickOffset(target: Node | null, inner: HTMLElement): number {
    if (!target || target === inner || target.parentNode !== inner || (target as HTMLElement).children?.length) return 0
    let el = target as HTMLElement
    const color = el.style?.color ?? ''
    // 往前吞同色 span:段起点
    while (el.previousElementSibling && (el.previousElementSibling as HTMLElement).style.color === color)
        el = el.previousElementSibling as HTMLElement
    let off = 0
    for (let p = el.previousSibling; p; p = p.previousSibling) off += p.textContent?.length ?? 0
    return off
}

/**
 * Monaco revealPosition(VerticalRevealType.Simple,非鼠标来源)的目标 scrollTop(viewLines._computeScrollTopToRevealRange):
 * 上下各留 context = min(视口行数/2, max(cursorSurroundingLines=0, sticky maxLineCount)) 行,Simple 底部再多留 1 行;
 * 盒在视口内不动,否则最小滚动。
 */
export function stickyRevealScrollTop(lineTop: number, lineHeight: number, scrollTop: number, viewportHeight: number, maxLines = 5): number {
    const context = Math.min(viewportHeight / lineHeight / 2, maxLines)
    const boxStart = lineTop - context * lineHeight
    const boxEnd = lineTop + lineHeight + Math.max(0, context - 1) * lineHeight + lineHeight
    if (boxEnd - boxStart > viewportHeight) return Math.max(0, boxStart)
    if (boxStart < scrollTop) return Math.max(0, boxStart)
    if (boxEnd > scrollTop + viewportHeight) return Math.max(0, boxEnd - viewportHeight)
    return scrollTop
}

/**
 * 语义作用域来源(Monaco OutlineModel):异步算好后 publish(作用域树);publish(null) = 没有 outline,退回折叠范围。
 * 树里的行号按 publish 那一刻的文档;之后的编辑由 overlay 映射,来源自己防抖重算。返回退订。
 */
export type StickyOutlineSource = (view: EditorView, publish: (roots: StickyNode[] | null) => void) => () => void

/**
 * 一次编辑后括号深度索引要作废什么。
 * 每处改动都不改行数(打字、删字、同样行数的替换):行号不动,只有改到的行(和同步重分词窗口里字符串/注释判定可能变的那几行,
 * 至多 EDIT_RETOKENIZE_MAX 行)的块要重算;其余块的文字和跳过结果都没变,留着。以前一律作废编辑点之后的所有块,
 * 10 万行里每敲一个字符空闲时都要重数 ~195 个块(~6 ms)。改了行数(Enter、删行、粘贴多行)块边界整体挪位,从编辑点往后都作废。
 * 不挪行号的前提下,更后面的行因状态传播变色的,由后台分词的通知(subscribeTokens)按它重算的范围作废。
 */
export function depthInvalidation(oldDoc: EditorState['doc'], changes: ChangeSet): { lines: [from: number, to: number] } | { fromLine: number } | null {
    let first = Infinity, last = 0, neutral = true
    changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
        const a = oldDoc.lineAt(fromA).number
        const b = oldDoc.lineAt(Math.min(toA, oldDoc.length)).number
        if (a < first) first = a
        if (b > last) last = b
        if (inserted.lines - 1 !== b - a) neutral = false
    })
    if (first === Infinity) return null
    return neutral ? { lines: [first - 1, last + EDIT_RETOKENIZE_MAX] } : { fromLine: first }
}

/** 这次编辑有没有增删换行(没有:每行行号不变,作用域树原样沿用) */
function changesLines(tr: Transaction): boolean {
    const old = tr.startState.doc
    let hit = false
    tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
        if (!hit && (inserted.lines > 1 || old.lineAt(fromA).number !== old.lineAt(toA).number)) hit = true
    })
    return hit
}

/**
 * 作用域树按一次编辑映射行号(重算回来之前别让 sticky 指错行)。
 * 单段改动(打字、Enter、粘贴、删除)时:改动行之前的行号不变,之后的整体平移行数差,只有改动行本身要查 rope。
 * 以前每个节点查两次 rope(10 万行的代码有上万节点,Enter 占 7 ms);现在 O(节点) 只剩加法,改动行之前的子树连对象都不新建。
 * 多段改动(多光标)走逐节点查 rope。
 */
export function mapStickyTree(roots: readonly StickyNode[], oldDoc: EditorState['doc'], newDoc: EditorState['doc'], mapPos: (pos: number, assoc: number) => number, changes?: ChangeSet): StickyNode[] {
    const slowLine = (n: number, side: -1 | 1) => {
        const l = oldDoc.line(Math.max(1, Math.min(n, oldDoc.lines)))
        return newDoc.lineAt(mapPos(side < 0 ? l.to : l.from, side)).number
    }
    let lo = 0, hi = 0, delta = 0
    let single = false
    if (changes) {
        let ranges = 0
        let fromA = 0, toA = 0
        changes.iterChangedRanges((a, b) => { ranges++; fromA = a; toA = b })
        if (ranges === 1) {
            single = true
            lo = oldDoc.lineAt(fromA).number
            hi = oldDoc.lineAt(Math.min(toA, oldDoc.length)).number
            delta = newDoc.lines - oldDoc.lines
        }
    }
    // 行 n(夹进旧文档范围)在 lo..hi 之内才可能被这次改动动到;之前的原样,之后的平移
    const lineOf = single
        ? (n: number, side: -1 | 1) => {
            const c = Math.max(1, Math.min(n, oldDoc.lines))
            return c < lo ? c : c > hi ? c + delta : slowLine(n, side)
        }
        : slowLine
    const map = (n: StickyNode): StickyNode => {
        // 整棵子树都在改动行之前:行号一个都不变,沿用原对象
        if (single && n.start >= 1 && n.start < lo && n.end < lo) return n
        const start = lineOf(n.start, 1)
        // 单行条目(end = start - 1)保持相对关系
        const end = n.end >= n.start ? Math.max(start - 1, lineOf(n.end, -1)) : start - (n.start - n.end)
        return { start, end, children: n.children.map(map) }
    }
    return roots.map(map)
}

/** Monaco 对 stickyScroll.maxLineCount 的校验:整数,夹在 1..10,不是数字用默认 5 */
function clampCount(v: unknown): number {
    return typeof v === 'number' && Number.isFinite(v) ? Math.min(10, Math.max(1, Math.floor(v))) : 5
}

export function stickyScrollOverlay(
    view: EditorView,
    opts?: { maxLines?: number, scopes?: (state: EditorState) => readonly StickyScope[] | null, outline?: StickyOutlineSource, brackets?: readonly string[] },
    // scopes:宿主直接给扁平作用域;outline:异步语义作用域(TS navigation tree);都没有用折叠范围
): () => void {
    // stickyScroll 选项(Monaco IEditorStickyScrollOptions)每次从 state 读,updateOptions 换了就跟着变。
    // opts.maxLines 是宿主显式给的,优先于选项;选项值夹在 1..10(Monaco 的校验)
    const cfg = () => getOption(view.state, 'stickyScroll') as { enabled?: boolean, maxLineCount?: number, defaultModel?: string, scrollWithEditor?: boolean } | undefined
    const maxOf = () => opts?.maxLines ?? clampCount(cfg()?.maxLineCount)
    let maxLines = maxOf()
    let outline: StickyNode[] | null = null
    // 折叠作用域(没有 outline 时用)。改文档不当场整篇重算(2 万行打字时占一半开销):旧树按改动映射过去,
    // 停手 STICKY_FOLD_DELAY 后再重算(Monaco:改文档排 50ms 的 RunOnceScheduler,StickyModelProvider 再
    // Delayer(300),期间沿用旧模型)。folds.doc / extra 对不上当前 state(换文档、TS outlining 表到了)就当场算。
    let folds: { doc: EditorState['doc'], extra: unknown, roots: StickyNode[] } | null = null
    let foldTimer: ReturnType<typeof setTimeout> | null = null
    const foldRoots = (): StickyNode[] => {
        const s = view.state
        const extra = s.field(extraFoldField, false)
        if (folds && folds.doc === s.doc && folds.extra === extra) return folds.roots
        if (foldTimer) { clearTimeout(foldTimer); foldTimer = null }
        folds = { doc: s.doc, extra, roots: foldScopes(s) }
        return folds.roots
    }
    const foldsAfter = (tr: Transaction) => {
        if (!folds || folds.doc !== tr.startState.doc || folds.extra !== tr.startState.field(extraFoldField, false)) return
        const roots = changesLines(tr) ? mapStickyTree(folds.roots, tr.startState.doc, view.state.doc, (p, a) => tr.changes.mapPos(p, a), tr.changes) : folds.roots
        folds = { doc: view.state.doc, extra: view.state.field(extraFoldField, false), roots }
        if (foldTimer) clearTimeout(foldTimer)
        foldTimer = setTimeout(() => {
            foldTimer = null
            folds = null
            lastKey = ''
            paint()
        }, STICKY_FOLD_DELAY)
    }
    const root = document.createElement('div')
    root.className = 'cm-sticky-scroll'
    root.setAttribute('aria-hidden', 'true')
    view.dom.appendChild(root)
    // Monaco:stickyScroll 开着时光标 reveal 上下留 maxLineCount 行(viewLines._computeScrollTopToRevealRange)
    view.revealSurroundingLines = maxLines

    const lineTop = (n: number) => view.lineBlockAt(view.state.doc.line(n).from).top
    const lineBottom = (n: number) => view.lineBlockAt(view.state.doc.line(n).to).bottom
    // 内容坐标 y → 行号(二分 heightMap;折叠/折行都由 lineBlockAt 处理)
    const lineAtHeight = (y: number) => {
        const doc = view.state.doc
        let lo = 1, hi = doc.lines
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1
            if (lineTop(mid) <= y) lo = mid
            else hi = mid - 1
        }
        return lo
    }
    // Monaco:候选整段落在隐藏区(折叠 / setHiddenAreas)里的不上 sticky
    const hideFolded = <T extends { start: number, end: number }>(cands: T[]): T[] => filterHiddenCandidates(cands, hiddenLineRanges(view.state))

    // 行首括号深度(文档开头到行首)。分块索引:编辑只作废改动点所在块和之后的,后台分词只作废它重算过的行所在的块,
    // 查询是把前面各块的小函数复合起来 + 块内零头,不再每次切整段前缀(10 万行时每键 ~24ms)。
    const depthIndex = new DepthIndex()
    // 空闲时把没算的块先算好:每片 ≤ 4ms,编辑 / 后台分词作废了块以后 50ms 再接着算(合并成一个定时器)
    let warmTimer = 0
    const warmDepths = () => {
        if (warmTimer || !opts?.brackets?.length) return
        warmTimer = window.setTimeout(() => {
            warmTimer = 0
            const doc = view.state.doc
            if (!depthIndex.warm({ lines: doc.lines, line: k => doc.line(k), texts: (a, b) => doc.lineTexts(a, b) }, bracketSkip(view, doc), 4)) warmDepths()
        }, 50)
    }
    // 渲染单行:行号列(宽 = gutter,数字右缘对齐 gutter 行号)+ 代码列(左缘 = 内容左缘,随横向滚动)
    const renderRow = (n: number, idx: number, top: number, lh: number, gutterW: number, numBox: { left: number, width: number } | null, codeLeft: number, scrollLeft: number) => {
        const line = view.state.doc.line(n)
        const row = document.createElement('div')
        row.className = 'cm-sticky-line'
        row.style.top = `${top}px`
        row.style.height = `${lh}px`
        row.style.lineHeight = `${lh}px`
        row.dataset.line = String(n)
        row.style.zIndex = String(maxLines - idx) // 被顶上去的最后一行压在上面几行下面
        const ln = document.createElement('div')
        ln.className = 'cm-sticky-ln'
        ln.style.width = `${gutterW}px`
        const num = document.createElement('span')
        num.textContent = String(n)
        if (numBox) {
            num.style.marginLeft = `${numBox.left}px`
            num.style.width = `${numBox.width}px`
        }
        ln.appendChild(num)
        const code = document.createElement('div')
        code.className = 'cm-sticky-code'
        code.style.left = `${codeLeft}px`
        const inner = document.createElement('div')
        inner.className = 'cm-sticky-text'
        inner.style.transform = scrollLeft ? `translateX(${-scrollLeft}px)` : ''
        // 语法色:取 view 的 token 缓存(与正文同一份);缓存未就绪就画纯文本
        let toks: { content: string, color?: string }[] | null = null
        selectTokenCache(view)
        if (linesForDoc(view.state.doc.lines)) {
            const t = tokensInLineRange(n, n)[0]
            if (t && t.map(x => x.content).join('') === line.text) toks = t
        }
        // 括号着色(Monaco sticky 行同正文 bracket-highlighting):括号拆成独立 span,深度从文档开头数到行首
        const palette = opts?.brackets
        const skip = palette?.length ? bracketSkip(view, view.state.doc) : undefined
        const stack: string[] = []
        const sdoc = view.state.doc
        let base = palette?.length ? depthIndex.depthAtLine({ lines: sdoc.lines, line: k => sdoc.line(k), texts: (a, b) => sdoc.lineTexts(a, b) }, n, skip) : 0
        const add = (text: string, color?: string) => {
            const s = document.createElement('span')
            s.textContent = text
            if (color) s.style.color = color
            inner.appendChild(s)
        }
        const pieces = toks ?? [{ content: line.text }]
        let pos = line.from
        for (const t of pieces) {
            if (!palette?.length) { add(t.content, t.color); continue }
            let start = 0
            for (let i = 0; i < t.content.length; i++) {
                const ch = t.content[i]
                if (!OPEN_CLOSE[ch] && !CLOSE_OPEN[ch]) continue
                if (skip?.(pos + i)) continue
                if (i > start) add(t.content.slice(start, i), t.color)
                let depth
                if (OPEN_CLOSE[ch]) { depth = base + stack.length; stack.push(ch) }
                else if (stack.length && stack[stack.length - 1] === CLOSE_OPEN[ch]) { stack.pop(); depth = base + stack.length }
                else { if (!stack.length && base > 0) base--; depth = base + stack.length }
                add(ch, palette[depth % palette.length])
                start = i + 1
            }
            if (start < t.content.length) add(t.content.slice(start), t.color)
            pos += t.content.length
        }
        code.appendChild(inner)
        row.append(ln, code)
        row.addEventListener('mousedown', e => {
            e.preventDefault()
            // Monaco StickyScrollController 点击:列 = 点中 token span 的起点(getEditorPositionFromNode,
            // offset 0);点在文本外 / 行号上 → 第 1 列。再 revealPosition(Simple):行顶留 maxLines 行余量,
            // 落到 sticky 区下面,光标不被 sticky 头盖住。
            const head = line.from + Math.min(line.length, stickyClickOffset(e.target as Node, inner))
            const sd = view.scrollDOM
            const lh = view.oracle.lineHeight || 20
            const b = view.lineBlockAt(head)
            const next = stickyRevealScrollTop(b.top, lh, sd.scrollTop, sd.clientHeight, maxLines)
            // 先滚再落光标:dispatch 时光标行若未渲染,编辑器按新 scrollTop 补渲染再写原生选区
            if (next !== sd.scrollTop) sd.scrollTop = Math.max(0, Math.min(next, sd.scrollHeight - sd.clientHeight))
            view.dispatch(view.state.update({
                selection: EditorSelection.cursor(head),
                userEvent: 'select',
            }))
            view.focus()
        })
        return row
    }

    let lastKey = ''
    let lastDoc: EditorState['doc'] | null = null
    const paint = () => {
        const c = cfg()
        if (c?.enabled === false || !budgetForState(view.state).stickyScroll) {
            root.style.display = 'none'
            root.textContent = ''
            lastKey = ''
            if (view.revealSurroundingLines === maxLines) view.revealSurroundingLines = 0
            return
        }
        const nowMax = maxOf()
        if (nowMax !== maxLines) {
            if (view.revealSurroundingLines === maxLines) view.revealSurroundingLines = nowMax
            maxLines = nowMax
            lastKey = ''
        }
        if (!view.revealSurroundingLines) view.revealSurroundingLines = maxLines
        // defaultModel:outlineModel = 语义大纲 → 折叠块 → 缩进;foldingProviderModel 跳过大纲;indentationModel 只看缩进
        const model = c?.defaultModel ?? 'outlineModel'
        const custom = opts?.scopes?.(view.state)
        const lh = view.oracle.lineHeight || 20
        // lineBlockAt 的 top 以 contentDOM 顶为 0;sr.top - cr.top = 已滚出内容区顶的像素
        const srect = view.scrollDOM.getBoundingClientRect()
        const st = srect.top - view.contentDOM.getBoundingClientRect().top
        // 滚在顶上(没有内容滚出视口)时一行也不会粘住:不去算范围树(10 万行的文件首屏要为它扫一遍全文)
        const roots = st <= 0 ? [] : custom ? scopeTree(custom) : model === 'indentationModel' ? foldScopes(view.state, true) : (model === 'outlineModel' ? outline : null) ?? foldRoots()
        const { start: visStart, end: visEnd } = completelyVisibleLines(lineAtHeight(st), lineAtHeight(st + srect.height - 1), st, srect.height, lineTop, lineBottom)
        // Monaco _onDidResize:sticky 最多占编辑器高度的 1/4(四舍五入的行数);没有布局(高 0)时不限
        const shown = stickyMaxLines(srect.height, lh, maxLines)
        const cands = hideFolded(stickyCandidates(roots, visStart, visEnd))
        const { lines, lastOffset } = stickyLayout(cands, st, lh, lineTop, lineBottom, shown)
        const sl = view.scrollDOM.scrollLeft
        // scrollWithEditor(默认 true):横向滚动时 sticky 行跟着编辑器走;false 时钉在原位(Monaco left = scrollWithEditor ? -scrollLeft : 0)
        const follow = c?.scrollWithEditor !== false
        const key = lines.join(',') + '|' + lastOffset + '|' + sl + '|' + lh + '|' + follow
        // 文档变了要重画(sticky 行的文字和括号深度可能变了)
        if (key === lastKey && lastDoc === view.state.doc && root.childElementCount === lines.length) return
        lastKey = key
        lastDoc = view.state.doc
        root.textContent = ''
        if (!lines.length) {
            root.style.display = 'none'
            return
        }
        // 几何:gutter 宽、gutter 行号框、内容左缘、右侧让出竖滚动条
        const dr = view.dom.getBoundingClientRect()
        const sr = view.scrollDOM.getBoundingClientRect()
        const gut = view.dom.querySelector('.cm-gutters') as HTMLElement | null
        const gutterW = gut ? gut.getBoundingClientRect().width : 0
        const numEl = view.dom.querySelector('.cm-gutterElement .cm-lineNumber') as HTMLElement | null
        const nr = numEl?.getBoundingClientRect()
        const gr = gut?.getBoundingClientRect()
        const numBox = nr && gr ? { left: nr.left - gr.left, width: nr.width } : null
        const firstLine = view.contentDOM.querySelector('.cm-line') as HTMLElement | null
        const codeLeft = (firstLine ? firstLine.getBoundingClientRect().left + sl : sr.left) - dr.left
        // 字体跟正文 / 行号(宿主常把字体设在 .cm-content 上,root 继承不到)
        const cf = getComputedStyle(view.contentDOM)
        root.style.fontFamily = cf.fontFamily
        root.style.fontSize = cf.fontSize
        root.style.fontWeight = cf.fontWeight
        root.style.letterSpacing = cf.letterSpacing
        root.style.fontFeatureSettings = cf.fontFeatureSettings
        root.style.display = 'block'
        root.style.width = `${sr.right - dr.left}px`
        root.style.height = `${lines.length * lh + lastOffset}px`
        lines.forEach((n, i) => {
            const top = i * lh + (i === lines.length - 1 ? lastOffset : 0)
            root.appendChild(renderRow(n, i, top, lh, gutterW, numBox, codeLeft, follow ? sl : 0))
        })
    }

    view.scrollDOM.addEventListener('scroll', paint, { passive: true })
    const offTr = view.onTransaction(tr => {
        if (outline && tr.docChanged) outline = mapStickyTree(outline, tr.startState.doc, view.state.doc, (p, a) => tr.changes.mapPos(p, a), tr.changes)
        if (tr.docChanged) foldsAfter(tr)
        if (tr.docChanged) {
            const inv = depthInvalidation(tr.startState.doc, tr.changes)
            if (inv && 'lines' in inv) depthIndex.invalidateLines(inv.lines[0], inv.lines[1])
            else if (inv) depthIndex.invalidateFromLine(inv.fromLine)
            warmDepths()
        }
    })
    // 只动选区的事务不改 sticky 行;它带出的滚动由 scroll 监听接。画在视图画完之后(合并时一帧一次)
    const offView = view.onViewUpdate(tr => { if (tr.docChanged || tr.effects.length) paint() })
    // 后台分词改了某行起的字符串/注释判定,之后的深度重数
    const offTokens = opts?.brackets?.length ? subscribeTokens(view, (from, to) => { depthIndex.invalidateLines(from, to); warmDepths() }) : undefined
    warmDepths()
    const offOutline = opts?.outline?.(view, roots => {
        outline = roots
        lastKey = ''
        paint()
    })
    const offGeo = view.onGeometry(() => paint())
    let raf = requestAnimationFrame(paint)

    return () => {
        cancelAnimationFrame(raf)
        raf = 0
        if (warmTimer) clearTimeout(warmTimer)
        warmTimer = 0
        if (foldTimer) clearTimeout(foldTimer)
        view.scrollDOM.removeEventListener('scroll', paint)
        offTr()
        offView()
        offTokens?.()
        offOutline?.()
        offGeo()
        root.remove()
        if (view.revealSurroundingLines === maxLines) view.revealSurroundingLines = 0
    }
}
