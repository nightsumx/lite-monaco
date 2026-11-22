// ⌘D / ⌘K ⌘D:对齐 Monaco MultiCursorSession(contrib/multicursor)。
//
// - 从「单个空光标」起步:选中光标处(前或后贴着)的词,之后的 ⌘D 按「整词 + 区分大小写」找下一处。
// - 从已有选区起步:以主选区文本为查询,不区分大小写、不限整词(Monaco 取查找框的默认选项)。
// - 下一处从「最后加入的选区」尾部向后找,到文末环绕。
// - ⌘K ⌘D:同样找下一处,但替换掉最后加入的选区(跳过当前匹配)。
//
// 会话状态(查询、选项、选区加入顺序)挂在这次命令产出的 EditorSelection 对象上(WeakMap):选区一旦被
// 别的操作换掉(移动光标、输入),会话自然失效,和 Monaco「选区被外部改动即结束会话」一致。

import type { SelectionRange } from '../model/selection'
import type { EditorState, StateCommand, Transaction } from '../model/state'
import { EditorSelection } from '../model/selection'
import { capSelection } from './editoptions'
import { findInText } from './find'

// 查找框状态读取器由 feature/search 在模块加载时注册(反向 import 会和 commands → multicursor → search → commands 成环,keymap 加载时捕获到 undefined)。
export interface OpenFindQuery { open: boolean, query: string, regex: boolean, caseSensitive: boolean, wholeWord: boolean }
let readFindState: (state: EditorState) => OpenFindQuery | null = () => null
export function setFindStateReader(fn: (state: EditorState) => OpenFindQuery | null): void { readFindState = fn }
import { isWholeWordAt, stateWordClassifier, wordAtPosition } from './words'

interface Session {
    query: string
    wholeWord: boolean
    matchCase: boolean
    // 按加入顺序(Monaco getSelections 的顺序:主选区在前);已有选区保留方向,新加的匹配是正向
    order: { from: number, to: number, reversed?: boolean }[]
}

const sessions = new WeakMap<EditorSelection, Session>()

// 偏移全在文档坐标(换行 = 1 字符):配了 CRLF 的 lineSeparator 时 sliceDoc 会拼出 \r\n 让偏移错位,统一按 \n 取。
function plain(state: EditorState, from = 0, to = state.doc.length): string {
    return state.doc.sliceString(from, to, '\n')
}

function selectionOrder(state: EditorState): { from: number, to: number }[] {
    const { ranges, main } = state.selection
    return [main, ...ranges.filter(r => r !== main)].map(r => ({ from: r.from, to: r.to, reversed: r.head < r.anchor }))
}

function findNext(state: EditorState, s: Session, from: number): { from: number, to: number } | null {
    const doc = plain(state)
    let hay = doc, needle = s.query
    if (!s.matchCase) {
        const lower = doc.toLowerCase()
        // toLowerCase 改变长度(少数 Unicode 字符)时退回区分大小写,免得 offset 错位
        if (lower.length === doc.length && s.query.toLowerCase().length === s.query.length) {
            hay = lower
            needle = s.query.toLowerCase()
        }
    }
    if (!needle) return null
    const wc = stateWordClassifier(state)
    const ok = (i: number) => !s.wholeWord || isWholeWordAt(doc, i, i + needle.length, wc)
    for (let i = hay.indexOf(needle, from); i !== -1; i = hay.indexOf(needle, i + 1))
        if (ok(i)) return { from: i, to: i + needle.length }
    for (let i = hay.indexOf(needle, 0); i !== -1 && i < from; i = hay.indexOf(needle, i + 1))
        if (ok(i)) return { from: i, to: i + needle.length }
    return null
}

function begin(state: EditorState): Session | null {
    const known = sessions.get(state.selection)
    if (known) return known
    const main = state.selection.main
    if (main.empty) {
        const word = wordAtPosition(state, main.head)
        if (!word) return null
        const single = state.selection.ranges.length === 1
        return { query: plain(state, word.from, word.to), wholeWord: single, matchCase: single, order: selectionOrder(state) }
    }
    return { query: plain(state, main.from, main.to), wholeWord: false, matchCase: false, order: selectionOrder(state) }
}

function apply(state: EditorState, dispatch: (tr: Transaction) => void, s: Session, order: Session['order']): void {
    const ranges: SelectionRange[] = order.map(r => r.reversed ? EditorSelection.range(r.to, r.from) : EditorSelection.range(r.from, r.to))
    const selection = capSelection(state, EditorSelection.create(ranges, 0))
    sessions.set(selection, { ...s, order })
    dispatch(state.update({ selection, scrollIntoView: true, userEvent: 'select' }))
}

// 所有选区都是空光标 → 每个光标选中所在词(Monaco 的首次 ⌘D)。
function expandEmpty(state: EditorState, dispatch: (tr: Transaction) => void, s: Session): boolean {
    const order: { from: number, to: number }[] = []
    for (const r of s.order) {
        const w = wordAtPosition(state, r.from)
        if (w) order.push(w)
    }
    if (!order.length) return false
    apply(state, dispatch, s, order)
    return true
}

// Monaco addSelectionToNextFindMatch:无会话且多选区「文本不全相同(含空光标)」时,只把空光标展开成词就结束,不加新匹配。
function expandMixedSelections(state: EditorState, dispatch: (tr: Transaction) => void): boolean {
    const { ranges, main } = state.selection
    if (ranges.length < 2 || sessions.has(state.selection)) return false
    const first = plain(state, main.from, main.to).toLowerCase()
    if (ranges.every(r => !r.empty && plain(state, r.from, r.to).toLowerCase() === first)) return false
    const next = ranges.map(r => {
        const w = r.empty ? wordAtPosition(state, r.head) : null
        return w ? EditorSelection.range(w.from, w.to) : r
    })
    dispatch(state.update({ selection: EditorSelection.create(next, state.selection.mainIndex), scrollIntoView: true, userEvent: 'select' }))
    return true
}

export const selectNextOccurrence: StateCommand = ({ state, dispatch }) => {
    if (expandMixedSelections(state, dispatch)) return true
    const s = begin(state)
    if (!s) return false
    if (state.selection.ranges.every(r => r.empty)) return expandEmpty(state, dispatch, s)
    const last = s.order[s.order.length - 1]
    const next = findNext(state, s, last.to)
    if (!next || s.order.some(r => r.from === next.from && r.to === next.to)) return false
    apply(state, dispatch, s, [...s.order, next])
    return true
}

// 向前找:匹配起点在 from 之前的最后一处,到文首环绕(Monaco findPreviousMatch)
function findPrev(state: EditorState, s: Session, from: number): { from: number, to: number } | null {
    const doc = plain(state)
    let hay = doc, needle = s.query
    if (!s.matchCase) {
        const lower = doc.toLowerCase()
        if (lower.length === doc.length && s.query.toLowerCase().length === s.query.length) {
            hay = lower
            needle = s.query.toLowerCase()
        }
    }
    if (!needle) return null
    const wc = stateWordClassifier(state)
    const ok = (i: number) => !s.wholeWord || isWholeWordAt(doc, i, i + needle.length, wc)
    // lastIndexOf 的负起点按 0 算:起点在文首时前半段没有可找的
    if (from > 0) {
        for (let i = hay.lastIndexOf(needle, from - 1); i !== -1; i = i === 0 ? -1 : hay.lastIndexOf(needle, i - 1))
            if (ok(i)) return { from: i, to: i + needle.length }
    }
    for (let i = hay.lastIndexOf(needle); i !== -1 && i >= from; i = i === 0 ? -1 : hay.lastIndexOf(needle, i - 1))
        if (ok(i)) return { from: i, to: i + needle.length }
    return null
}

/** Add Selection to Previous Find Match:同 ⌘D,方向相反(从最后加入的选区起点往前找) */
export const selectPreviousOccurrence: StateCommand = ({ state, dispatch }) => {
    if (expandMixedSelections(state, dispatch)) return true
    const s = begin(state)
    if (!s) return false
    if (state.selection.ranges.every(r => r.empty)) return expandEmpty(state, dispatch, s)
    const last = s.order[s.order.length - 1]
    const prev = findPrev(state, s, last.from)
    if (!prev || s.order.some(r => r.from === prev.from && r.to === prev.to)) return false
    apply(state, dispatch, s, [...s.order, prev])
    return true
}

/** Move Last Selection to Previous Find Match */
export const moveSelectionToPreviousFindMatch: StateCommand = ({ state, dispatch }) => {
    const s = begin(state)
    if (!s) return false
    if (state.selection.ranges.every(r => r.empty)) return expandEmpty(state, dispatch, s)
    const last = s.order[s.order.length - 1]
    const prev = findPrev(state, s, last.from)
    if (!prev) return false
    const kept = s.order.slice(0, -1)
    if (kept.some(r => r.from === prev.from && r.to === prev.to)) return false
    apply(state, dispatch, s, [...kept, prev])
    return true
}

export const moveSelectionToNextFindMatch: StateCommand = ({ state, dispatch }) => {
    const s = begin(state)
    if (!s) return false
    if (state.selection.ranges.every(r => r.empty)) return expandEmpty(state, dispatch, s)
    const last = s.order[s.order.length - 1]
    const next = findNext(state, s, last.to)
    if (!next) return false
    const kept = s.order.slice(0, -1)
    if (kept.some(r => r.from === next.from && r.to === next.to)) return false
    apply(state, dispatch, s, [...kept, next])
    return true
}

// ⇧⌘L / ⌘F2(Monaco selectHighlights → MultiCursorSession.selectAll):同一会话的选项沿用(单光标起步 = 整词 + 区分大小写),
// 全文所有匹配一次选中;和主选区相交的那处当主选区。查找框开着且是正则时由查找框拥有查询(#5400),走 searchField。
export const selectAllOccurrences: StateCommand = ({ state, dispatch }) => {
    const sf = readFindState(state)
    let hits: { from: number, to: number }[]
    let session: Session | null = null
    if (sf && sf.open && sf.query.length > 0 && sf.regex) {
        hits = findInText(plain(state), { query: sf.query, caseSensitive: sf.caseSensitive, wholeWord: sf.wholeWord, regex: true }, sf.wholeWord ? state.charCategorizer(0) : null)
    } else {
        session = begin(state)
        if (!session || !session.query) return false
        const text = plain(state)
        hits = findInText(text, { query: session.query, caseSensitive: session.matchCase, wholeWord: false }, null)
            .filter(h => !session!.wholeWord || isWholeWordAt(text, h.from, h.to, stateWordClassifier(state)))
    }
    if (!hits.length) return false
    const main = state.selection.main
    const mainIdx = Math.max(0, hits.findIndex(h => h.from <= main.to && h.to >= main.from))
    const ordered = [hits[mainIdx], ...hits.filter((_, i) => i !== mainIdx)]
    const selection = capSelection(state, EditorSelection.create(ordered.map(h => EditorSelection.range(h.from, h.to)), 0))
    if (session) sessions.set(selection, { ...session, order: ordered })
    dispatch(state.update({ selection, scrollIntoView: true, userEvent: 'select' }))
    return true
}
