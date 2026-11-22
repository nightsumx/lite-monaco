// CM7 选区/光标/行装饰层 —— 把 state.selection 投影成可见装饰。
//
// 三个装饰 provider,全是纯函数 (state)->DecorationSet:
//   selectionDecorations — 选区背景 + 光标 widget(多光标可见)
//   activeLineDecorations — 主选行高亮(VS Code 默认有)
//   selectionMatchDecorations — 光标所在词的同词高亮 + 选中文本的同串高亮(Monaco wordHighlighter / selectionHighlighter)
//   bracketMatchingDecorations — 光标邻括号时高亮匹配对,否则高亮包住光标的那一对
//
// 原生选区仍用于输入(contenteditable 要原生 selection 才能打字),但视觉上隐藏
// (caret-color: transparent + ::selection background transparent)。
// 选区背景由 highlightLayer 画成满行高的块(Monaco SelectionsOverlay);selectionDecorations 的
// cm-selectionBackground mark 只当类钩子(没挂 highlightLayer 时 CSS 退回给它上色)。

import type { DecorationSet } from '../model/decoration'
import type { EditorState } from '../model/state'
import { Decoration } from '../model/decoration'
import { RangeSet, RangeSetBuilder } from '../model/rangeset'
import { CharCategory } from '../model/charcategory'
import { bracketSkip, bracketTable, enclosingBracketPair, matchBracketPair } from '../edit/brackets'
import { scratchRange } from '../view/domutil'
import { containsRTL } from '../view/materialize'
import { searchField } from './search'
import { unicodeHighlightRanges } from './specialchar'
import { tagNameHighlight } from './tags'
import { getOption } from '../options'
import { LONG_LINE_SCAN, scanPieces, type ScanWindow } from '../view/scanwindow'

const selectionMark = Decoration.mark({ class: 'cm-selectionBackground' })
const selWsMark = Decoration.mark({ class: 'cm-selWs' })
const selTabMark = Decoration.mark({ class: 'cm-selTab' })
// 没给视口时(纯函数调用/测试)每个选区最多扫这么多字符找空白
const WS_SCAN_CAP = 20_000
const WRAPPED_WS_WINDOW: ScanWindow = { start: 0, end: LONG_LINE_SCAN }
// 折行块的视觉行数超过 VIS_ROWS_MIN 才只画滚动窗口附近的行;窗口上下各多 VIS_ROWS_PAD 行
const VIS_ROWS_MIN = 64
const VIS_ROWS_PAD = 12

// 从 state.selection 生成选区背景装饰集。
// 光标不在此:它由 CursorLayer(editorview)按坐标画在 overlay 层,绝不注入可编辑内容流
// (inline widget 混进 cm-line 会占空行编辑锚点、扰乱 contenteditable 选区 → 输入落错行)。
// 空白另起 mark 画点/箭头,取值照 Monaco renderWhitespace(默认 'selection'),只扫视口内:
//   none 不画;selection 只画选区内;boundary 画全部空白,但两个词之间的单个空格除外(tab 一律画);
//   trailing 只画行尾(含整行空白);all 全画。
export function selectionDecorations(state: EditorState, view?: { viewport: { from: number, to: number }, scanWindow?: ScanWindow }): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>()
    const mode = getOption(state, 'renderWhitespace') as 'none' | 'boundary' | 'selection' | 'trailing' | 'all' | undefined ?? 'selection'
    const marks: { from: number, to: number, mark: Decoration }[] = []
    const docCharAt = (pos: number) => (pos >= 0 && pos < state.doc.length ? state.sliceDoc(pos, pos + 1).charCodeAt(0) : NaN)
    for (const range of state.selection.ranges) {
        if (range.empty) continue
        marks.push({ from: range.from, to: range.to, mark: selectionMark })
        if (mode !== 'selection') continue
        const from = view ? Math.max(range.from, view.viewport.from) : range.from
        const to = view ? Math.min(range.to, view.viewport.to) : Math.min(range.to, range.from + WS_SCAN_CAP)
        if (to <= from) continue
        // 超长行只扫窗口里那截:全选一条 53 万字符的行,不能给里面几万处空白各画一个 mark(几十 ms,还把行切成上万段)
        // 折行时窗口不限(竖向滚,不知道哪段在屏上),但选区里的空白点只画每条超长行的前 LONG_LINE_SCAN 列(Monaco 的
        // stopRenderingLineAfter 是 1 万列,过了连字都不画):整条折行的 DOM 里每个空格一个 span,100 万字符的行 10 万个 span,
        // 每次重排慢 5~10 倍
        const win = view?.scanWindow && view.scanWindow.end === Infinity ? WRAPPED_WS_WINDOW : view?.scanWindow
        for (const p of scanPieces(state.doc, from, to, win)) {
            const a = Math.max(p.from, from), b = Math.min(p.to, to)
            if (b > a) scanWhitespace(state.sliceDoc(a, b), a, () => true, marks, docCharAt)
        }
    }
    if (mode === 'all' || mode === 'boundary' || mode === 'trailing') {
        const doc = state.doc
        const vf = view ? view.viewport.from : 0
        const vt = view ? view.viewport.to : Math.min(doc.length, WS_SCAN_CAP)
        const first = doc.lineAt(Math.max(0, Math.min(vf, doc.length))).number
        const last = doc.lineAt(Math.max(0, Math.min(vt, doc.length))).number
        for (let n = first; n <= last; n++) {
            const line = doc.line(n)
            const text = line.text
            const end = text.length
            scanWhitespace(text, line.from, (a, b) => {
                if (mode === 'all') return true
                if (mode === 'trailing') return b === end
                // boundary:行首、行尾的空白都画;夹在两个非空白之间的单个空格不画
                return !(b - a === 1 && text.charCodeAt(a) === 32 && a > 0 && b < end && text.charCodeAt(a - 1) !== 32 && text.charCodeAt(a - 1) !== 9 && text.charCodeAt(b) !== 32 && text.charCodeAt(b) !== 9)
            }, marks)
        }
    }
    // 选区 mark 与空白 mark 同一位置时,选区(外层)在前
    marks.sort((a, b) => a.from - b.from || (a.mark === selectionMark ? -1 : 0) - (b.mark === selectionMark ? -1 : 0) || a.to - b.to)
    // 去掉重复的空白 mark(选区里又被 all 命中)
    let prev: { from: number, to: number, mark: Decoration } | null = null
    for (const m of marks) {
        if (prev && prev.from === m.from && prev.to === m.to && prev.mark === m.mark) continue
        builder.add(m.from, m.to, m.mark)
        prev = m
    }
    return builder.finish()
}

// 强 RTL 字符(希伯来 / 阿拉伯 / 叙利亚 / 波斯等)。NaN(越界)不算。
const isRtlCode = (c: number) => (c >= 0x590 && c <= 0x8AC) || c === 0x200F || (c >= 0xFB1D && c <= 0xFDFF) || (c >= 0xFE70 && c <= 0xFEFC)

// 扫一段文本里的空白。游程 = 一串连续的空格 / tab(混着也算一个,Monaco 的 boundary / trailing 都按整串判断:
// 行尾「空格 + tab」是同一段行尾空白,不能只认最后那个 tab)。keep(游程起止,相对 text)为真才收;
// 收的时候空格串 → 一个 selWs,每个 tab 各一个 selTab(箭头画在每个 tab 起点)。
//
// 挨着 RTL 字符的游程不画(Monaco #99589):把 RTL 文字里的空格拆成单独的记号 span 会改掉浏览器的 bidi 排版,
// 整串的显示顺序就变了。Monaco 是整个含 RTL 的 token 都不画;这里没有 token,取「游程前一个或后一个字符是 RTL」,
// 行首的缩进、两个 LTR 词之间的空白照常画。`around` 给 text 之外的邻居(选区切片的两头)。
function scanWhitespace(text: string, base: number, keep: (a: number, b: number) => boolean, out: { from: number, to: number, mark: Decoration }[], around?: (pos: number) => number) {
    const at = (k: number) => (k >= 0 && k < text.length ? text.charCodeAt(k) : around ? around(base + k) : NaN)
    let i = 0
    while (i < text.length) {
        const c = text.charCodeAt(i)
        if (c !== 9 && c !== 32) { i++; continue }
        let j = i + 1
        for (let d = text.charCodeAt(j); d === 9 || d === 32; d = text.charCodeAt(++j));
        if (keep(i, j) && !isRtlCode(at(i - 1)) && !isRtlCode(at(j))) {
            for (let k = i; k < j;) {
                if (text.charCodeAt(k) === 9) { out.push({ from: base + k, to: base + k + 1, mark: selTabMark }); k++; continue }
                let m = k + 1
                while (m < j && text.charCodeAt(m) === 32) m++
                out.push({ from: base + k, to: base + m, mark: selWsMark })
                k = m
            }
        }
        i = j
    }
}

const activeLineMark = Decoration.line({ class: 'cm-activeLine' })

// 主选行高亮:每个选区的 head 所在行各一条 LineDecoration。
export function activeLineDecorations(state: EditorState): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>()
    const doc = state.doc
    const seen = new Set<number>()
    for (const range of state.selection.ranges) {
        const line = doc.lineAt(range.head)
        if (!seen.has(line.number)) {
            seen.add(line.number)
            builder.add(line.from, line.from, activeLineMark)
        }
    }
    return builder.finish()
}

const selectionMatchMark = Decoration.mark({ class: 'cm-selectionMatch' })
const wordHighlightMark = Decoration.mark({ class: 'cm-wordHighlightText' })

// 正文的两种同词高亮,对齐 Monaco 0.52(plaintext 实测 /tmp/lc-hunt/r6/V/mrules.ts):
//   同词(WordHighlighter + TextualDocumentHighlightProvider,wordHighlightText)—— wordHighlightRanges
//   选中串(SelectionHighlighter,selectionHighlight)—— selectionHighlightRanges
// 选中整词时两种都有(同词含选区那一处,选中串不含)。何时出现 / 清掉由 highlightLayer 管(同词只在用户挪光标、
// 获得焦点时出现,改文档、程序设选区清掉,失焦保留)。
// 大文档不 slice 全文:只在主光标邻域扫(避免每键 O(n) 搜索卡死;Monaco 全文找,上限 999)。
const MATCH_WINDOW = 80_000 // 字符,约前后各 40KB
const MATCH_HIT_CAP = 200

type Span = { from: number, to: number }

function matchWindow(state: EditorState): { from: number, text: string } {
    const head = state.selection.main.head
    const from = Math.max(0, head - MATCH_WINDOW / 2)
    return { from, text: state.sliceDoc(from, Math.min(state.doc.length, head + MATCH_WINDOW / 2)) }
}

/**
 * Monaco WordHighlighter._run + TextualDocumentHighlightProvider:只看主选区;主选区要单行,且落在
 * 主选区起点处的词里(getWordAtPosition:光标贴词首 / 词尾都算这个词),可以是词的一部分或正好包住它。
 * 全文整词、区分大小写找这个词,含主选区自己那一处。多光标时别的光标不管。
 */
export function wordHighlightRanges(state: EditorState): Span[] {
    const doc = state.doc
    const main = state.selection.main
    const line = doc.lineAt(main.from)
    if (main.to > line.to) return []
    const cat = state.charCategorizer(main.from)
    const isWord = (ch: string) => !!ch && cat(ch) === CharCategory.Word
    const off = main.from - line.from
    const word = wordAround(line.from + (isWord(line.text[off]) ? off : off - 1), cat, line)
    if (!word || word.to < main.to) return []
    const q = line.text.slice(word.from - line.from, word.to - line.from)
    const win = matchWindow(state)
    const out: Span[] = []
    for (let idx = 0; out.length < MATCH_HIT_CAP && (idx = win.text.indexOf(q, idx)) !== -1; idx += q.length) {
        const abs = win.from + idx
        const before = idx > 0 ? win.text[idx - 1] : abs > 0 ? state.sliceDoc(abs - 1, abs) : ''
        const end = idx + q.length
        const after = end < win.text.length ? win.text[end] : state.sliceDoc(abs + q.length, abs + q.length + 1)
        if (!isWord(before) && !isWord(after)) out.push({ from: abs, to: abs + q.length })
    }
    return out
}

/**
 * Monaco SelectionHighlighter._createState / _setState(查找框默认 matchCase、wholeWord 都关):
 * 主选区非空;单行(selectionHighlightMultiline 开了才放行跨行);多选区时要各选区都非空、文本相同(不分大小写);
 * 纯空白、超过 selectionHighlightMaxLength(默认 200,0 = 不限)字不画;
 * 子串、不分大小写地找主选区的文本,不含各选区自己(也不含和非空选区相交的)。
 */
export function selectionHighlightRanges(state: EditorState): Span[] {
    const doc = state.doc
    const ranges = state.selection.ranges
    const main = state.selection.main
    const maxLength = getOption(state, 'selectionHighlightMaxLength')
    if (main.empty || (maxLength > 0 && main.to - main.from > maxLength)) return []
    if (!getOption(state, 'selectionHighlightMultiline') && doc.lineAt(main.from).number !== doc.lineAt(main.to).number) return []
    const q = state.sliceDoc(main.from, main.to)
    if (/^[ \t]+$/.test(q)) return []
    // 查找框开着且查询就是选中文本(非正则,按 matchCase 比):命中已由查找画出,不再画一遍
    const sf = state.field(searchField, false)
    if (sf?.open && !sf.regex && (sf.caseSensitive ? sf.query === q : sf.query.toLowerCase() === q.toLowerCase())) return []
    if (ranges.length > 1) {
        const lower = q.toLowerCase()
        for (const r of ranges) if (r.empty || state.sliceDoc(r.from, r.to).toLowerCase() !== lower) return []
    }
    const win = matchWindow(state)
    const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
    const out: Span[] = []
    for (let m = re.exec(win.text); m && out.length < MATCH_HIT_CAP; m = re.exec(win.text)) {
        const from = win.from + m.index, to = from + m[0].length
        if (!ranges.some(r => r.from < to && from < r.to)) out.push({ from, to })
    }
    return out
}

/** 两种同词高亮的装饰(class cm-wordHighlightText / cm-selectionMatch);word:false 时只出选中串 */
export function selectionMatchDecorations(state: EditorState, opts: { word?: boolean } = {}): DecorationSet {
    const marks: { from: number, to: number, mark: Decoration }[] = []
    if (opts.word !== false) for (const r of wordHighlightRanges(state)) marks.push({ ...r, mark: wordHighlightMark })
    for (const r of selectionHighlightRanges(state)) marks.push({ ...r, mark: selectionMatchMark })
    if (!marks.length) return RangeSet.empty
    marks.sort((a, b) => a.from - b.from || a.to - b.to)
    const builder = new RangeSetBuilder<Decoration>()
    for (const m of marks) builder.add(m.from, m.to, m.mark)
    return builder.finish()
}

function wordAround(pos: number, cat: (ch: string) => CharCategory, line: { from: number, text: string }): { from: number, to: number } | null {
    const offset = pos - line.from
    const ch = line.text[offset]
    if (!ch || cat(ch) !== CharCategory.Word) return null
    let from = offset, to = offset + 1
    while (from > 0 && cat(line.text[from - 1]) === CharCategory.Word) from--
    while (to < line.text.length && cat(line.text[to]) === CharCategory.Word) to++
    return { from: line.from + from, to: line.from + to }
}

// —— 括号匹配 ——

const bracketMatchMark = Decoration.mark({ class: 'cm-matchingBracket' })

// Monaco BracketMatchingController(matchBrackets 默认 'always'):每个空光标(≤100 个,非空选区不算)
// 先 matchBracket(贴着的括号配对),配不上再 findEnclosingBrackets(包住光标的最近一对)。
// 禁止全文 sliceDoc(3 万行会卡):每个光标只看前后各 BRACKET_SCAN_DEFAULT 字符的窗口
// (Monaco 旧算法给 20ms;AST 版不限,但 4 万字符外的括号对实际很少)。邻近光标共用一个窗口。
// 字符串/注释/正则里的括号不算:owner(EditorView)的 token 缓存给跳过谓词,没有就照纯文本配。
const BRACKET_SCAN_DEFAULT = 40_000
const BRACKET_MAX_CURSORS = 100

// enclosing:false 只要贴着光标的那一对(Monaco 只有这种进概览尺:_DECORATION_OPTIONS_WITH_OVERVIEW_RULER;
// 包住光标的那对用 _WITHOUT_OVERVIEW_RULER)
export function bracketMatchingDecorations(state: EditorState, owner?: object | null, opts: { enclosing?: boolean } = {}): DecorationSet {
    const sel = state.selection
    if (sel.ranges.length > BRACKET_MAX_CURSORS) return RangeSet.empty
    const heads: number[] = []
    for (const r of sel.ranges) if (r.empty) heads.push(r.head)
    if (!heads.length) return RangeSet.empty
    heads.sort((a, b) => a - b)
    const len = state.doc.length
    const W = BRACKET_SCAN_DEFAULT
    const marks = new Map<number, number>() // 括号 token 起点 → 止点(多字符括号整词高亮)
    const skip = owner ? bracketSkip(owner, state.doc) : undefined
    const tbl = bracketTable(state)
    for (let i = 0; i < heads.length;) {
        // 窗口互相重叠的光标并成一组(组宽封顶,免得一组跨全文)
        let j = i + 1
        while (j < heads.length && heads[j] - W <= heads[j - 1] + W && heads[j] - heads[i] <= 4 * W) j++
        const base = Math.max(0, heads[i] - W)
        const text = state.sliceDoc(base, Math.min(len, heads[j - 1] + W))
        for (let k = i; k < j; k++) {
            const pair = matchBracketPair(text, base, heads[k], skip, tbl) ?? (opts.enclosing === false ? null : enclosingBracketPair(text, base, heads[k], skip, tbl))
            if (pair) { marks.set(pair.open, pair.openEnd); marks.set(pair.close, pair.closeEnd) }
        }
        i = j
    }
    if (!marks.size) return RangeSet.empty
    const builder = new RangeSetBuilder<Decoration>()
    for (const [from, to] of [...marks].sort((a, b) => a[0] - b[0])) builder.add(from, to, bracketMatchMark)
    return builder.finish()
}

// —— 高亮层(Monaco view-overlays):当前行 / 括号匹配框 / 同词框 ——
//
// 这三样只随选区变,而 EditorView 对「空选区搬家」不重建内容(只挪光标,见 editorview update 的
// tr.selection 分支)—— 做成行/mark 装饰就要等下一次无关重绘才更新(实测点击后 ~300ms 才跟上,
// ↓ 键干脆不更新)。改成正文下面一层绝对定位的框,每个事务同步重画,与光标同帧。
// 层在 .cm-scroller 内随内容滚,z-index:-1 + scroller isolation:压在字下、编辑器背景上。
//
// 同时管两件「焦点」相关的事:
//   - view.dom 加 cm-focusTracked,聚焦时再加 cm-focused:CSS 据此失焦藏光标、选区换 inactive 色(Monaco)
//   - 行号 gutter 给光标所在行加 cm-activeLineGutter(editorLineNumber.activeForeground)

interface LayerView {
    state: EditorState
    readonly dom: HTMLElement
    readonly scrollDOM: HTMLElement
    contentDOM: HTMLElement
    readonly oracle: { lineHeight: number, charWidth: number }
    viewport: { from: number, to: number }
    readonly hasFocus: boolean
    readonly composing?: boolean
    domAtPos?(pos: number): { node: Node, offset: number }
    posAtCoords?(coords: { x: number, y: number }, precise?: boolean): number | null
    caretCoords(pos: number, side?: number): { left: number, top: number, height: number, bottom: number } | null
    lineBlockAt(pos: number): { from: number, to: number, top: number, bottom: number, height: number }
    onTransaction(fn: (tr: { docChanged: boolean, selection?: unknown, isUserEvent(event: string): boolean }) => void): () => void
    onViewUpdate?(fn: () => void): () => void
    onGeometry(fn: () => void): () => void
}

export interface HighlightLayerOptions {
    activeLine?: boolean
    bracketMatch?: boolean
    selectionMatch?: boolean
    /** 文本同词(Monaco TextualDocumentHighlightProvider)。语义同词另有来源(TS getDocumentHighlights)时关掉:
     *  Monaco 有语义 provider 就不用文本的(哪怕语义结果为空)。默认开 */
    wordHighlight?: boolean | (() => boolean)
    /** HTML:光标在标签名里时高亮配对的开/闭标签名(Monaco documentHighlight,画成 wordHighlight),否则退回文本同词 */
    tagHighlight?: boolean
    /** 不可见 / 易混字符的框(Monaco unicodeHighlight,画在 overlay 层,不占字宽)。默认开 */
    unicodeHighlight?: boolean
}

/** 空选区时各光标所在行(Monaco:有非空选区就不画当前行)。 */
export function currentLineNumbers(state: EditorState): number[] {
    const out: number[] = []
    for (const r of state.selection.ranges) if (!r.empty) return out
    for (const r of state.selection.ranges) {
        const n = state.doc.lineAt(r.head).number
        if (!out.includes(n)) out.push(n)
    }
    return out
}

/** 光标 head 所在行(行号高亮用,不管选区空不空)。 */
export function headLineNumbers(state: EditorState): Set<number> {
    const out = new Set<number>()
    for (const r of state.selection.ranges) out.add(state.doc.lineAt(r.head).number)
    return out
}

function decoRanges(set: DecorationSet): { from: number, to: number }[] {
    const out: { from: number, to: number }[] = []
    const it = set.iter()
    while (it.value) {
        out.push({ from: it.from, to: it.to })
        it.next()
    }
    return out
}

// —— 选区块(Monaco SelectionsOverlay)——
//
// 一个视觉行一块满行高的矩形,多行连成一片;选区跨过逻辑行尾的那一行多一个半角字宽(空行因此也有一段),
// 软折行处不加。圆角 3px:外角直接 border-radius;凹角(上/下一行更宽)在外侧放一对 10px 小块 ——
// 先一块选区色,再盖一块编辑器背景色的反向圆角。和上下行左/右缘差不到 1/4 字宽算平齐,不圆。
// 多选区时每个选区首行上缩 1px、末行下缩 1px,相邻两个选区之间留一道缝。
// 只画视口内的行(大选区不按文档长度花时间)。

export interface SelRow { top: number, left: number, width: number }
export interface SelPiece { cls: string, left: number, top: number, width: number, height: number }

const ROUNDED_PIECE_WIDTH = 10
const EXTERN = 0
const INTERN = 1
const FLAT = 2

/** 一个选区在视口内的各视觉行(自上而下)→ 要画的块。凹角小块在前(Monaco #77777)。 */
export function selectionPieces(rows: readonly SelRow[], lh: number, charWidth: number, multi: boolean): SelPiece[] {
    const inner: SelPiece[] = []
    const rest: SelPiece[] = []
    const eps = charWidth / 4
    const W = ROUNDED_PIECE_WIDTH
    for (let i = 0; i < rows.length; i++) {
        const cur = rows[i]
        const curL = cur.left
        const curR = cur.left + cur.width
        let sTop = EXTERN, sBot = EXTERN, eTop = EXTERN, eBot = EXTERN
        if (i > 0) {
            const pL = rows[i - 1].left, pR = pL + rows[i - 1].width
            if (Math.abs(curL - pL) < eps) sTop = FLAT
            else if (curL > pL) sTop = INTERN
            if (Math.abs(curR - pR) < eps) eTop = FLAT
            else if (pL < curR && curR < pR) eTop = INTERN
        }
        if (i + 1 < rows.length) {
            const nL = rows[i + 1].left, nR = nL + rows[i + 1].width
            if (Math.abs(curL - nL) < eps) sBot = FLAT
            else if (nL < curL && curL < nR) sBot = INTERN
            if (Math.abs(curR - nR) < eps) eBot = FLAT
            else if (curR < nR) eBot = INTERN
        }
        const t = multi && i === 0 ? 1 : 0
        const b = multi && i > 0 && i === rows.length - 1 ? 1 : 0
        const piece = (cls: string, left: number, width: number): SelPiece => ({ cls, left, top: cur.top + t, width, height: lh - t - b })
        if (sTop === INTERN || sBot === INTERN) {
            inner.push(piece('cm-selectedText cm-selInner', curL - W, W))
            inner.push(piece('cm-selCorner cm-selInner' + (sTop === INTERN ? ' cm-tr' : '') + (sBot === INTERN ? ' cm-br' : ''), curL - W, W))
        }
        if (eTop === INTERN || eBot === INTERN) {
            inner.push(piece('cm-selectedText cm-selInner', curR, W))
            inner.push(piece('cm-selCorner cm-selInner' + (eTop === INTERN ? ' cm-tl' : '') + (eBot === INTERN ? ' cm-bl' : ''), curR, W))
        }
        let cls = 'cm-selectedText'
        if (sTop === EXTERN) cls += ' cm-tl'
        if (sBot === EXTERN) cls += ' cm-bl'
        if (eTop === EXTERN) cls += ' cm-tr'
        if (eBot === EXTERN) cls += ' cm-br'
        rest.push(piece(cls, curL, cur.width))
    }
    return inner.concat(rest)
}

export function highlightLayer(view: LayerView, opts: HighlightLayerOptions = {}): () => void {
    const doc = view.dom.ownerDocument
    const layer = doc.createElement('div')
    layer.className = 'cm-highlightLayer'
    layer.setAttribute('aria-hidden', 'true')
    view.scrollDOM.insertBefore(layer, view.scrollDOM.firstChild)
    view.dom.classList.add('cm-focusTracked')

    let lastState: EditorState | null = null
    let brackets: { from: number, to: number }[] = []
    let words: { from: number, to: number }[] = []
    let wordCls = 'cm-wordHighlightTextBox'
    let matches: { from: number, to: number }[] = []
    let focused = view.hasFocus
    // 同词高亮(Monaco WordHighlighter)在不在:用户挪光标(CursorChangeReason.Explicit = select / select.pointer)
    // 或获得焦点时按当前光标算;改文档、程序设选区清掉;失焦保留(实测 blur 后 wordHighlightText 不变)
    let wordLive = focused
    let wordState: EditorState | null = null
    // occurrencesHighlightDelay(Monaco WordHighlighter._beginRenderDecorations):光标一动,新同词高亮至少等 delay 毫秒才出;
    // wordHoldUntil = 用户这次挪光标 / 获得焦点的时间 + delay。0(默认)= 同步,不起定时器
    let wordHoldUntil = 0
    let holdTimer = 0
    let optsKey = ''
    view.dom.classList.toggle('cm-focused', focused)
    let composing = false
    let drawnViewport: { from: number, to: number } | null = null

    const compute = () => {
        const s = view.state
        // 选项读 state(updateOptions 换了跟着变):occurrencesHighlight 'off' 关同词;selectionHighlight false 关选中串;
        // matchBrackets 'never' 关括号框、'near' 只配贴着光标的那一对(Monaco 不找包住光标的)
        const matchBrackets = getOption(s, 'matchBrackets') as string | undefined
        const wantWords = wordLive && opts.selectionMatch !== false && (typeof opts.wordHighlight === 'function' ? opts.wordHighlight() : opts.wordHighlight !== false) && getOption(s, 'occurrencesHighlight') !== 'off'
        if (s !== lastState || optsKey !== (optsKey = `${matchBrackets}|${getOption(s, 'selectionHighlight')}|${getOption(s, 'selectionHighlightMaxLength')}|${getOption(s, 'selectionHighlightMultiline')}`)) {
            lastState = s
            brackets = opts.bracketMatch !== false && matchBrackets !== 'never' ? decoRanges(bracketMatchingDecorations(s, view, { enclosing: matchBrackets !== 'near' })) : []
            matches = opts.selectionMatch !== false && getOption(s, 'selectionHighlight') !== false ? selectionHighlightRanges(s) : []
        }
        if (!wantWords) { words = []; wordState = null; wordCls = 'cm-wordHighlightTextBox' }
        else if (wordState !== s) {
            // Monaco _run:新光标落在已有高亮范围内就不重算(原高亮原样保留,不等 delay);否则旧的先清,新的等 delay 到点再出
            const wait = wordHoldUntil - Date.now()
            const head = s.selection.main.head
            if (wait > 0 && !words.some(r => r.from <= head && head <= r.to)) {
                words = []; wordCls = 'cm-wordHighlightTextBox'
                if (holdTimer) clearTimeout(holdTimer)
                holdTimer = setTimeout(() => { holdTimer = 0; layout() }, wait) as unknown as number
                return
            }
            const tags = opts.tagHighlight ? tagNameHighlight(s) : null
            words = tags ?? wordHighlightRanges(s)
            wordCls = tags ? 'cm-wordHighlightBox' : 'cm-wordHighlightTextBox'
            wordState = s
        }
    }

    const layout = () => {
        compute()
        const s = view.state
        const lh = view.oracle.lineHeight
        const lr = layer.getBoundingClientRect()
        const cr = view.contentDOM.getBoundingClientRect()
        const dx = cr.left - lr.left
        const dy = cr.top - lr.top
        const vp = view.viewport
        const frag = doc.createDocumentFragment()
        const box = (cls: string, left: number, top: number, width: number, height: number) => {
            const el = doc.createElement('div')
            el.className = cls
            el.style.cssText = `left:${left}px;top:${top}px;width:${width}px;height:${height}px`
            frag.appendChild(el)
        }
        // 折行块里屏上矩形落在第几个视觉行(按中线,容忍字形 rect 的半像素取整)
        const rowIn = (blk: { top: number, height: number }, r: { top: number, height: number }) =>
            Math.max(0, Math.min(Math.round(blk.height / lh) - 1,
                Math.round((r.top + r.height / 2 - (cr.top + blk.top) - lh / 2) / lh)))
        // 折行的超长行(压缩 js 折成几千个视觉行):只给滚动窗口附近的视觉行出框,别给屏幕外几千行各建一个 div
        // (Monaco 只画可见 view line)。窗口 = 滚动区上下各多 VIS_ROWS_PAD 行,滚动由 onScroll 重画。
        const sr = view.scrollDOM.getBoundingClientRect()
        const visTop = sr.top - lr.top - lh * VIS_ROWS_PAD, visBot = sr.bottom - lr.top + lh * VIS_ROWS_PAD
        const rowsOf = (blk: { top: number, height: number }): [number, number] => {
            const n = Math.max(1, Math.round(blk.height / lh)), y0 = dy + blk.top
            if (n <= VIS_ROWS_MIN) return [0, n - 1]
            return [Math.max(0, Math.floor((visTop - y0) / lh)), Math.min(n - 1, Math.ceil((visBot - y0) / lh))]
        }
        // 当前行(Monaco CurrentLineHighlightOverlay):折行时每个视觉行都铺底色,只有光标所在的视觉行
        // 加边框(current-line-exact)。有非空选区就不画。
        // renderLineHighlight:'line' / 'all' 画正文里的当前行,'gutter' / 'all' 画行号区的(CSS 按 cm-hl-margin);
        // renderLineHighlightOnlyWhenFocus:失焦就都不画。
        const rlh = getOption(s, 'renderLineHighlight') as string | undefined ?? 'line'
        // foldingHighlight:false 去掉折叠起始行的底色(CSS 按 cm-no-foldHighlight)
        view.dom.classList.toggle('cm-no-foldHighlight', getOption(s, 'foldingHighlight') === false)
        const sfc = getOption(s, 'showFoldingControls') as string | undefined
        view.dom.classList.toggle('cm-fold-always', sfc === 'always')
        view.dom.classList.toggle('cm-fold-never', sfc === 'never')
        const hlFocus = !getOption(s, 'renderLineHighlightOnlyWhenFocus') || focused
        view.dom.classList.toggle('cm-hl-margin', opts.activeLine !== false && hlFocus && (rlh === 'gutter' || rlh === 'all'))
        if (opts.activeLine !== false && hlFocus && (rlh === 'line' || rlh === 'all') && currentLineNumbers(s).length) {
            const width = Math.max(view.scrollDOM.scrollWidth, view.scrollDOM.clientWidth) - dx
            const exact = new Map<number, { blk: ReturnType<LayerView['lineBlockAt']>, rows: Set<number> }>()
            for (const r of s.selection.ranges) {
                if (r.head < vp.from || r.head > vp.to) continue
                const blk = view.lineBlockAt(r.head)
                let e = exact.get(blk.from)
                if (!e) exact.set(blk.from, e = { blk, rows: new Set() })
                if (blk.height < lh * 1.5) { e.rows.add(0); continue }
                const c = view.caretCoords(r.head, r.assoc)
                e.rows.add(c ? rowIn(blk, c) : 0)
            }
            for (const { blk, rows } of exact.values()) {
                const n = blk.height < lh * 1.5 ? 1 : Math.round(blk.height / lh)
                const [k0, k1] = rowsOf(blk)
                for (let k = Math.max(0, k0); k <= Math.min(n - 1, k1); k++)
                    box('cm-currentLine' + (rows.has(k) ? ' cm-currentLine-exact' : ''), dx, dy + blk.top + k * lh, width, n === 1 ? blk.height : lh)
            }
        }
        // 选区块。组字中不画:浏览器已经拿组字文本替掉了选中的 DOM,state 里的旧选区要等提交才更新
        // (Monaco 开始组字时选区已被替换,同样看不到选区色)。
        const ranges = s.selection.ranges.filter(r => !r.empty)
        if (ranges.length && !composing && !view.composing) {
            const cw = view.oracle.charWidth || 0
            const x = (left: number) => Math.round(left - cr.left)
            const pieces: SelPiece[] = []
            for (const r of ranges) {
                const rows = selectionRows(r.from, r.to, cw, x, rowIn)
                if (rows.length) pieces.push(...selectionPieces(rows, lh, cw, ranges.length > 1))
            }
            // 凹角小块先于所有主体块(不盖住别的选区)
            for (const p of pieces) if (p.cls.includes('cm-selInner')) box(p.cls, p.left, p.top, p.width, p.height)
            for (const p of pieces) if (!p.cls.includes('cm-selInner')) box(p.cls, p.left, p.top, p.width, p.height)
        }
        // 按字符画框:框高 = 行高,顶对齐所在视觉行(同光标算法)
        // minWidth:比它窄(零宽字符)就以中点为心撑到这么宽(Monaco showIfCollapsed 的装饰撑到半角字宽)
        const charBox = (cls: string, from: number, to: number, minWidth = 0) => {
            if (to < vp.from || from > vp.to) return
            const a = view.caretCoords(from, 1)
            const b = view.caretCoords(to, -1)
            if (!a || !b) return
            let left = a.left - lr.left, width = b.left - a.left
            if (width < minWidth) {
                left = Math.max(dx, Math.round(Math.round(left + width / 2) - minWidth / 2))
                width = minWidth
            }
            if (width <= 0) return
            // 单视觉行的块顶直接取 heightMap(与当前行同一把尺);折行块才按 caret 定位到所在视觉行
            const blk = view.lineBlockAt(from)
            const top = blk.height < lh * 1.5
                ? dy + blk.top
                : (a.height ? a.top + a.height / 2 : a.top + lh / 2) - lh / 2 - lr.top
            box(cls, left, top, width, lh)
        }
        // 失焦(Monaco 实测):括号匹配框消失;同词(wordHighlightText)保留;选中串(selectionHighlight)保留,
        // 颜色减半(CSS 按 cm-focused 换);当前行保留
        if (focused) for (const r of brackets) charBox('cm-bracketBox', r.from, r.to)
        for (const r of words) charBox(wordCls, r.from, r.to)
        for (const r of matches) charBox('cm-selectionMatchBox', r.from, r.to)
        if (opts.unicodeHighlight !== false) for (const r of unicodeHighlightRanges(s, view)) charBox('cm-unicodeHighlight', r.from, r.to, view.oracle.charWidth)
        layer.replaceChildren(frag)
        drawnViewport = vp

        // 一个选区 [from,to] 在视口内的各视觉行(层坐标)。按 heightMap 块走:折叠块算一个视觉行。
        function selectionRows(from: number, to: number, cw: number, x: (left: number) => number,
            rowOf: (blk: { top: number, height: number }, r: { top: number, height: number }) => number): SelRow[] {
            const rows: SelRow[] = []
            const end = Math.min(to, vp.to)
            let pos = Math.max(from, vp.from)
            while (pos <= end) {
                const blk = view.lineBlockAt(pos)
                const a = Math.max(pos, blk.from)
                const b = Math.min(end, blk.to)
                const eol = to > blk.to ? cw : 0 // 选中了这一行的换行符
                if (blk.height < lh * 1.5) {
                    // 折叠块(一个视觉行包了多个逻辑行):右缘止于首行行尾,占位符「…」不算进选区(Monaco 同)
                    const firstEnd = view.state.doc.lineAt(blk.from).to
                    const bb = blk.to > firstEnd && b > firstEnd ? firstEnd : b
                    const ca = view.caretCoords(a)
                    const cb = a === bb ? ca : view.caretCoords(bb)
                    if (ca && cb) {
                        // RTL / 混排:选中的逻辑段在屏上可以是几段,两端的 caret 不是边界,要取字形矩形的包络(Monaco 同:按 DOM Range 的 rects)
                        let lo = Math.min(ca.left, cb.left), hi = Math.max(ca.left, cb.left)
                        if (a < b && view.domAtPos && containsRTL(view.state.sliceDoc(a, b))) {
                            const rg = scratchRange(doc)
                            try {
                                const s0 = view.domAtPos(a), s1 = view.domAtPos(b)
                                rg.setStart(s0.node, s0.offset)
                                rg.setEnd(s1.node, s1.offset)
                                for (const rc of Array.from(rg.getClientRects())) {
                                    if (!rc.width) continue
                                    lo = Math.min(lo, rc.left)
                                    hi = Math.max(hi, rc.right)
                                }
                            } catch { /* 节点不在 DOM → 只用两端 */ }
                        }
                        // 换行符的半角字宽先加再取整(先取整后加,行尾会比下一行的左缘多出零点几像素,被误判成凹角)
                        const l = x(lo), r = x(hi + eol)
                        rows.push({ top: dy + blk.top, left: dx + l, width: r - l })
                    }
                } else {
                    // 折行块:一次 Range.getClientRects 拿各视觉行的字形段,按行取左右包络;零宽 rect(Chrome
                    // 在软折行点吐的幽灵 rect)不算。空段退回 caret 定位。
                    const spans = new Map<number, [number, number]>()
                    // 超长折行块:只量滚动窗口附近那几行对应的字符段(行首到行尾取整行,上下各有余量,切口在屏幕外)
                    let ra = a, rb = b, cutEnd = false
                    const nRows = Math.round(blk.height / lh)
                    if (nRows > VIS_ROWS_MIN && a < b) {
                        const [k0, k1] = rowsOf(blk)
                        if (k0 > nRows - 1 || k1 < 0) { ra = rb = a }
                        else {
                            const yy = (k: number) => cr.top + blk.top + (k + 0.5) * lh
                            if (k0 > 0) {
                                const p = view.posAtCoords?.({ x: cr.left + 1, y: yy(k0) }, false)
                                if (p != null && p > ra) ra = Math.min(p, b)
                            }
                            if (k1 < nRows - 1) {
                                const p = view.posAtCoords?.({ x: cr.right - 1, y: yy(k1) }, false)
                                if (p != null && p < rb) { rb = Math.max(p, ra); cutEnd = true }
                            }
                        }
                    }
                    if (ra < rb && view.domAtPos) {
                        const rg = scratchRange(doc)
                        try {
                            const s0 = view.domAtPos(ra), s1 = view.domAtPos(rb)
                            rg.setStart(s0.node, s0.offset)
                            rg.setEnd(s1.node, s1.offset)
                            for (const rc of Array.from(rg.getClientRects())) {
                                if (!rc.width) continue
                                const k = rowOf(blk, rc)
                                const sp = spans.get(k)
                                if (sp) { sp[0] = Math.min(sp[0], rc.left); sp[1] = Math.max(sp[1], rc.right) }
                                else spans.set(k, [rc.left, rc.right])
                            }
                        } catch { /* 节点不在 DOM(视口切换中)→ 跳过 */ }
                    }
                    if (!spans.size && ra === a) {
                        const c = view.caretCoords(a, 1) ?? view.caretCoords(a)
                        if (c) spans.set(rowOf(blk, c), [c.left, c.left])
                    }
                    const keys = [...spans.keys()].sort((p, q) => p - q)
                    const last = keys[keys.length - 1]
                    for (const k of keys) {
                        const [l, r] = spans.get(k)!
                        rows.push({ top: dy + blk.top + k * lh, left: dx + x(l), width: Math.max(0, x(r + (k === last && !cutEnd ? eol : 0)) - x(l)) })
                    }
                }
                if (blk.to + 1 > end) break
                pos = blk.to + 1
            }
            return rows
        }
    }

    // 行号:光标所在行加 cm-activeLineGutter。gutter 行随视口重建,MutationObserver 兜住重建
    let gutters: HTMLElement | null = null
    let gutterMO: MutationObserver | null = null
    const markGutter = () => {
        if (!gutters || !gutters.isConnected) {
            gutters = view.dom.querySelector('.cm-gutters')
            gutterMO?.disconnect()
            gutterMO = null
            if (gutters && typeof MutationObserver !== 'undefined') {
                gutterMO = new MutationObserver(markGutter)
                gutterMO.observe(gutters, { childList: true })
            }
        }
        if (!gutters) return
        const heads = headLineNumbers(view.state)
        for (const el of Array.from(gutters.children)) {
            const num = el.querySelector('.cm-lineNumber')
            const n = num ? Number(num.textContent) : NaN
            const on = heads.has(n)
            if (el.classList.contains('cm-activeLineGutter') !== on) el.classList.toggle('cm-activeLineGutter', on)
        }
    }

    const refresh = () => {
        layout()
        markGutter()
    }
    const onTr = (tr: { docChanged: boolean, selection?: unknown, isUserEvent(event: string): boolean }) => {
        if (tr.docChanged) wordLive = false
        else if (tr.selection) {
            wordLive = view.hasFocus && tr.isUserEvent('select')
            if (wordLive) holdWords()
        }
    }
    const holdWords = () => {
        const delay = getOption(view.state, 'occurrencesHighlightDelay')
        wordHoldUntil = delay > 0 ? Date.now() + delay : 0
    }
    const onFocus = () => {
        focused = true
        wordLive = true
        holdWords()
        view.dom.classList.add('cm-focused')
        layout()
    }
    const onBlur = () => {
        focused = false
        view.dom.classList.remove('cm-focused')
        layout()
    }
    const onCompStart = () => {
        composing = true
        layout()
    }
    const onCompEnd = () => {
        composing = false
        layout()
    }
    // 滚动换窗(视口变了)后补画新进视口那些行的选区块。EditorView 的 scroll 监听先注册,它的 setTimeout(0)
    // 换窗先跑,这里的 setTimeout(0) 后跑;视口没变就不动(层随内容滚,位置不用重算)。
    const win = doc.defaultView
    let scrollTimer = 0
    const onScroll = () => {
        if (scrollTimer || !win) return
        scrollTimer = win.setTimeout(() => {
            scrollTimer = 0
            const vp = view.viewport
            if (drawnViewport && (vp.from !== drawnViewport.from || vp.to !== drawnViewport.to)) layout()
        }, 0)
    }
    view.contentDOM.addEventListener('focus', onFocus)
    view.contentDOM.addEventListener('blur', onBlur)
    view.contentDOM.addEventListener('compositionstart', onCompStart)
    view.contentDOM.addEventListener('compositionend', onCompEnd)
    view.scrollDOM.addEventListener('scroll', onScroll, { passive: true })
    const offTr = view.onTransaction(onTr)
    // 画(读几何)在视图画完之后:一帧里多笔事务只画一次
    const offView = view.onViewUpdate ? view.onViewUpdate(refresh) : view.onTransaction(refresh)
    const offGeo = view.onGeometry(refresh)
    refresh()

    return () => {
        offTr()
        offView()
        offGeo()
        gutterMO?.disconnect()
        if (holdTimer) clearTimeout(holdTimer)
        if (scrollTimer) win?.clearTimeout(scrollTimer)
        view.contentDOM.removeEventListener('focus', onFocus)
        view.contentDOM.removeEventListener('blur', onBlur)
        view.contentDOM.removeEventListener('compositionstart', onCompStart)
        view.contentDOM.removeEventListener('compositionend', onCompEnd)
        view.scrollDOM.removeEventListener('scroll', onScroll)
        view.dom.classList.remove('cm-focusTracked', 'cm-focused', 'cm-hl-margin', 'cm-no-foldHighlight')
        layer.remove()
    }
}
