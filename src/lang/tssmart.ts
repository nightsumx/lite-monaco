// 智能扩选 / 缩选 —— 照 Monaco smartSelect.js(SmartSelectController + provideSelectionRanges)。
//
// Monaco 的 TS 模式不注册 SelectionRangeProvider,所以 TS 和纯文本一样只有两家:
// WordSelectionRangeProvider(子词、词、空白行、全文)+ BracketSelectionRangeProvider(括号内、括号、带行首)。
// 每个光标各自算:区间按「起点靠后在前、同起点短的在前」排,只留逐级包住上一级的,
// 跨行时补上不含首尾空白的整行块和完整整行块。扩缩选沿这条链走,选区被别人改了就丢掉链重算。

import type { EditorView } from '../core/view/editorview'
import type { EditorState } from '../core/model/state'
import { EditorSelection } from '../core/model/selection'
import { bracketSkip, CLOSE_OPEN, OPEN_CLOSE, type BracketSkip } from '../core/edit/brackets'
import { materializeDoc } from '../core/perf'
import { getOption } from '../core/options'

export interface SmartSpan { from: number, to: number }

// Monaco USUAL_WORD_SEPARATORS;TS/JS 的 wordPattern 把 `$` 算进词里
const SEPARATORS = '`~!@#$%^&*()-=+[{]}\\|;:\'",.<>/?'

const isSpace = (c: number) => c === 32 || c === 9 || c === 10 || c === 13 || c === 11 || c === 12 || c === 0xa0
    || c === 0x1680 || (c >= 0x2000 && c <= 0x200a) || c === 0x2028 || c === 0x2029 || c === 0x202f
    || c === 0x205f || c === 0x3000 || c === 0xfeff
const isDigit = (c: number) => c >= 48 && c <= 57
const isWordCh = (c: number) => isDigit(c) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95
const isLower = (c: number) => c >= 97 && c <= 122
const isUpper = (c: number) => c >= 65 && c <= 90

/**
 * Monaco getWordAtPosition(默认 wordPattern `(-?\d*\.\d\w*)|([^分隔符\s]+)` 的词法扫描版):
 * 从左往右切词,第一个满足 start ≤ col ≤ end 的就是。col 从 0 起
 */
export function wordAtColumn(text: string, col: number, dollarInWord: boolean): { start: number, end: number } | null {
    const sep = (c: number) => SEPARATORS.includes(String.fromCharCode(c)) && !(dollarInWord && c === 36)
    let i = 0
    while (i < text.length && i <= col) {
        // 数字:-?\d*\.\d\w*
        let j = i
        if (text.charCodeAt(j) === 45) j++
        while (j < text.length && isDigit(text.charCodeAt(j))) j++
        if (text.charCodeAt(j) === 46 && isDigit(text.charCodeAt(j + 1))) {
            j += 2
            while (j < text.length && isWordCh(text.charCodeAt(j))) j++
            if (col <= j) return { start: i, end: j }
            i = j
            continue
        }
        const c = text.charCodeAt(i)
        if (isSpace(c) || sep(c)) { i++; continue }
        j = i + 1
        while (j < text.length && !isSpace(text.charCodeAt(j)) && !sep(text.charCodeAt(j))) j++
        if (col <= j) return { start: i, end: j }
        i = j
    }
    return null
}

const firstNonWsOf = (state: EditorState, n: number): number | null => {
    const l = state.doc.line(n)
    for (let i = 0; i < l.text.length; i++) { const c = l.text.charCodeAt(i); if (c !== 32 && c !== 9) return l.from + i }
    return null
}
const lastNonWsEndOf = (state: EditorState, n: number): number | null => {
    const l = state.doc.line(n)
    for (let i = l.text.length - 1; i >= 0; i--) { const c = l.text.charCodeAt(i); if (c !== 32 && c !== 9) return l.from + i + 1 }
    return null
}

/** BracketSelectionRangeProvider:括号内、括号、跨行时连带行首(Monaco 两轮各 30ms 的时间预算)。同一光标的区间由内到外、未排序 */
export function bracketSpans(state: EditorState, pos: number, skip: BracketSkip, budgetMs = 60): SmartSpan[] {
    const doc = state.doc
    const raw: SmartSpan[] = []
    const lineStart = (n: number) => doc.line(n).from
    const text = materializeDoc(state)
    const pending = new Map<string, number[]>()
    const counts = new Map<string, number>()
    // 往右:每类没配上的闭括号,近的在前
    const deadline = performance.now() + budgetMs
    for (let i = pos; i < text.length; i++) {
        const ch = text[i]
        const open = OPEN_CLOSE[ch] ? ch : CLOSE_OPEN[ch]
        if (!open || skip?.(i)) continue
        if ((i & 1023) === 0 && performance.now() > deadline) break
        const n = counts.get(open) ?? 0
        if (OPEN_CLOSE[ch]) { counts.set(open, n + 1); continue }
        counts.set(open, Math.max(0, n - 1))
        if (n - 1 < 0) {
            const list = pending.get(open) ?? []
            list.push(i)
            pending.set(open, list)
        }
    }
    counts.clear()
    for (let i = pos - 1; i >= 0 && pending.size; i--) {
        const ch = text[i]
        const open = OPEN_CLOSE[ch] ? ch : CLOSE_OPEN[ch]
        if (!open || skip?.(i)) continue
        const n = counts.get(open) ?? 0
        if (CLOSE_OPEN[ch]) { counts.set(open, n + 1); continue }
        counts.set(open, Math.max(0, n - 1))
        if (n - 1 >= 0) continue
        const list = pending.get(open)
        if (!list) continue
        const close = list.shift()!
        if (!list.length) pending.delete(open)
        raw.push({ from: i + 1, to: close }, { from: i, to: close + 1 })
        // _addBracketLeading:跨行的括号补上从行首(先首个非空白、再第 1 列)起的块,以及括号独占一行时连上一行
        const startLine = doc.lineAt(i)
        if (startLine.number === doc.lineAt(close).number) continue
        const first = firstNonWsOf(state, startLine.number)
        if (first != null && first !== i) raw.push({ from: first, to: close + 1 }, { from: startLine.from, to: close + 1 })
        if (startLine.number > 1) {
            const above = startLine.number - 1
            const af = firstNonWsOf(state, above)
            // Monaco 比的是列号:上一行首个非空白列 == 括号列
            if (af != null && af - lineStart(above) === i - startLine.from)
                raw.push({ from: af, to: close + 1 }, { from: lineStart(above), to: close + 1 })
        }
    }
    return raw
}

/** WordSelectionRangeProvider:子词(可关)、词、空白行、全文 */
export type WordAt = (lineText: string, col: number) => { start: number, end: number } | null

export function wordSpans(state: EditorState, pos: number, wordAt: WordAt, selectSubwords: boolean): SmartSpan[] {
    const doc = state.doc
    const raw: SmartSpan[] = []
    const line = doc.lineAt(pos)
    const word = wordAt(line.text, pos - line.from)
    if (word) {
        // _addInWordRanges:fooBar / foo_bar / foo-bar 的子词(lastCh 从左扫带到右扫,同 Monaco)
        const w = line.text.slice(word.start, word.end)
        const offset = pos - line.from - word.start
        let start = offset, end = offset, lastCh = 0
        for (; start >= 0; start--) {
            const ch = w.charCodeAt(start)
            if (start !== offset && (ch === 95 || ch === 45)) break
            else if (isLower(ch) && isUpper(lastCh)) break
            lastCh = ch
        }
        start += 1
        for (; end < w.length; end++) {
            const ch = w.charCodeAt(end)
            if (isUpper(ch) && isLower(lastCh)) break
            else if (ch === 95 || ch === 45) break
            lastCh = ch
        }
        if (selectSubwords && start < end) raw.push({ from: line.from + word.start + start, to: line.from + word.start + end })
        raw.push({ from: line.from + word.start, to: line.from + word.end })
    }
    if (line.text.length > 0 && firstNonWsOf(state, line.number) == null) raw.push({ from: line.from, to: line.to })
    raw.push({ from: 0, to: doc.length })
    return raw
}

/** provideSelectionRanges 的后半:过滤、排序、只留逐级包住的,跨行时补整行。raw 是各家 provider 的区间并集 */
export function chainSpans(state: EditorState, pos: number, raw: SmartSpan[], selectLeadingAndTrailingWhitespace: boolean): SmartSpan[] {
    const doc = state.doc
    const lineStart = (n: number) => doc.line(n).from
    const hits = raw.filter(r => r.from <= pos && pos <= r.to)
    hits.sort((a, b) => b.from - a.from || a.to - b.to)
    const chain: SmartSpan[] = []
    for (const r of hits) {
        const last = chain[chain.length - 1]
        if (!last || (r.from <= last.from && last.to <= r.to && !(r.from === last.from && r.to === last.to))) chain.push(r)
    }
    // selectLeadingAndTrailingWhitespace=false:不补整行块,链就是排序去重后的结果
    if (!selectLeadingAndTrailingWhitespace) return chain
    const contains = (a: SmartSpan, b: SmartSpan) => a.from <= b.from && b.to <= a.to
    const same = (a: SmartSpan, b: SmartSpan) => a.from === b.from && a.to === b.to
    const out: SmartSpan[] = chain.length ? [chain[0]] : []
    for (let i = 1; i < chain.length; i++) {
        const prev = chain[i - 1], cur = chain[i]
        const ps = doc.lineAt(prev.from).number, pe = doc.lineAt(prev.to).number
        if (ps !== doc.lineAt(cur.from).number || pe !== doc.lineAt(cur.to).number) {
            // 空白行的「首个非空白列」是 0,落到行首
            const noWs = { from: firstNonWsOf(state, ps) ?? lineStart(ps), to: lastNonWsEndOf(state, pe) ?? lineStart(pe) }
            if (contains(noWs, prev) && !same(noWs, prev) && contains(cur, noWs) && !same(cur, noWs)) out.push(noWs)
            const full = { from: lineStart(ps), to: doc.line(pe).to }
            if (contains(full, prev) && !same(full, noWs) && contains(cur, full) && !same(cur, full)) out.push(full)
        }
        out.push(cur)
    }
    return out
}

/** 一个光标位置的扩选链(不含当前选区),由内到外 */
export function selectionRangesAt(state: EditorState, pos: number, skip: BracketSkip, dollarInWord: boolean): SmartSpan[] {
    // smartSelect.selectSubwords / selectLeadingAndTrailingWhitespace(Monaco 默认都是 true)
    const opts = getOption(state, 'smartSelect') as { selectLeadingAndTrailingWhitespace: boolean, selectSubwords: boolean }
    const raw = [...bracketSpans(state, pos, skip), ...wordSpans(state, pos, (t, c) => wordAtColumn(t, c, dollarInWord), opts.selectSubwords)]
    return chainSpans(state, pos, raw, opts.selectLeadingAndTrailingWhitespace)
}

// SmartSelectController._state:每个光标一条链 + 当前走到第几级。选区被别的事务改了就丢掉
interface SmartState { chains: SmartSpan[][], index: number[] }
const states = new WeakMap<EditorView, SmartState>()
const watched = new WeakSet<EditorView>()
let ignoring = false

/** Expand / Shrink Selection(Monaco editor.action.smartSelect.expand / shrink)。dollarInWord:TS/JS 的 `$` 算词内 */
export function smartSelect(view: EditorView, forward: boolean, dollarInWord: boolean): boolean {
    if (!watched.has(view)) {
        watched.add(view)
        view.onTransaction(tr => { if (!ignoring && (tr.selection || tr.docChanged)) states.delete(view) })
    }
    const sel = view.state.selection
    let st = states.get(view)
    if (!st) {
        const skip = bracketSkip(view, view.state.doc)
        const chains = sel.ranges.map(r => [
            { from: r.from, to: r.to },
            // 只留包住当前选区两端的
            ...selectionRangesAt(view.state, r.head, skip, dollarInWord).filter(s => s.from <= r.from && r.to <= s.to),
        ])
        st = { chains, index: chains.map(() => 0) }
        states.set(view, st)
    }
    // SelectionRanges.mov:越界不动;下一级和这一级相同就再走一步
    const { chains } = st
    st.index = st.index.map((i, k) => {
        const c = chains[k]
        for (;;) {
            const n = i + (forward ? 1 : -1)
            if (n < 0 || n >= c.length) return i
            const same = c[n].from === c[i].from && c[n].to === c[i].to
            i = n
            if (!same) return i
        }
    })
    const ranges = st.index.map((i, k) => EditorSelection.range(chains[k][i].from, chains[k][i].to))
    ignoring = true
    try {
        view.dispatch(view.state.update({
            selection: EditorSelection.create(ranges, Math.min(sel.mainIndex, ranges.length - 1)),
            userEvent: 'select',
        }))
    } finally {
        ignoring = false
    }
    return true
}
