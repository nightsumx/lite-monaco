// 行级删除 / 换位命令,逐条对齐 Monaco 0.52(linesOperations.js)。
//
//   ⌘⌫        deleteAllLeft   空光标在行首 → 并入上一行;否则删行首到光标;非空选区删「首行行首 → 选区尾」
//   ⌘⌦ / ⌃K   deleteAllRight  空光标在行尾 → 并下一行;否则删到行尾;非空选区删选区本身
//   ⇧⌘K       deleteLine      删选区覆盖的整行,光标保持原列(clamp 到新行长)
//   ⌃T        transposeLetters 交换光标两侧字符,光标后移一格;行尾时与换行符交换
//
// 多选区:删除范围排序、相交的合并;主光标取与原主选区相交的那段。

import type { ChangeSpec } from '../model/change'
import type { SelectionRange } from '../model/selection'
import type { EditorState, StateCommand } from '../model/state'
import { EditorSelection } from '../model/selection'
import { findClusterBreak } from '../model/char'

interface Span { from: number, to: number }

function mergeSpans(spans: Span[]): Span[] {
    spans.sort((a, b) => a.from - b.from || a.to - b.to)
    const out: Span[] = []
    for (const s of spans) {
        const last = out[out.length - 1]
        // Monaco Range.intersectRanges:端点相接也算相交
        if (last && s.from <= last.to) last.to = Math.max(last.to, s.to)
        else out.push({ ...s })
    }
    return out
}

function intersects(s: Span, r: SelectionRange): boolean {
    return s.from <= r.to && r.from <= s.to
}

// 删一组 span,每段删后光标落 span 起点(经前面删除的偏移)。
function deleteSpans(state: EditorState, spans: Span[]): { changes: ChangeSpec[], selection: EditorSelection } | null {
    // 空 span(行首在文首 / 行尾在文末)不删东西,但那个光标照留(Monaco:range 被模型夹成空仍产出 endCursor)
    const merged = mergeSpans(spans)
    if (!merged.some(s => s.from < s.to)) return null
    const main = state.selection.main
    const ranges: SelectionRange[] = []
    let removed = 0, mainIndex = 0
    for (const s of merged) {
        const pos = s.from - removed
        if (intersects(s, main)) mainIndex = ranges.length
        ranges.push(EditorSelection.cursor(pos))
        removed += s.to - s.from
    }
    return { changes: merged.filter(s => s.from < s.to).map(s => ({ from: s.from, to: s.to })), selection: EditorSelection.create(ranges, mainIndex) }
}

export const deleteAllLeft: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const spans = state.selection.ranges.map((r): Span => {
        if (r.empty) {
            const line = state.doc.lineAt(r.head)
            if (r.head === line.from) return { from: Math.max(0, line.from - 1), to: line.from }
            return { from: line.from, to: r.head }
        }
        return { from: state.doc.lineAt(r.from).from, to: r.to }
    })
    const res = deleteSpans(state, spans)
    if (!res) return false
    dispatch(state.update({ ...res, scrollIntoView: true, userEvent: 'delete.line' }))
    return true
}

export const deleteAllRight: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const spans = state.selection.ranges.map((r): Span => {
        if (r.empty) {
            const line = state.doc.lineAt(r.head)
            if (r.head === line.to) return { from: r.head, to: Math.min(state.doc.length, line.to + 1) }
            return { from: r.head, to: line.to }
        }
        return { from: r.from, to: r.to }
    })
    const res = deleteSpans(state, spans)
    if (!res) return false
    dispatch(state.update({ ...res, scrollIntoView: true, userEvent: 'delete.line' }))
    return true
}

// Monaco DeleteLinesAction:选区跨行且止于行首 → 不含末行;相邻/重叠行块合并(保留首段的光标列)。
export const deleteLine: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const doc = state.doc
    if (doc.length === 0) return false
    const ops = state.selection.ranges.map((r) => {
        const start = doc.lineAt(r.from).number
        let end = doc.lineAt(r.to).number
        if (start < end && r.to === doc.line(end).from) end--
        const headLine = doc.lineAt(r.head)
        return { start, end, col: r.head - headLine.from, main: r === state.selection.main }
    }).sort((a, b) => a.start - b.start || a.end - b.end)
    const merged: typeof ops = []
    for (const op of ops) {
        const prev = merged[merged.length - 1]
        if (prev && prev.end + 1 >= op.start) { prev.end = Math.max(prev.end, op.end); prev.main ||= op.main }
        else merged.push({ ...op })
    }
    const changes: ChangeSpec[] = []
    const targets: { line: number, col: number, main: boolean }[] = []
    let linesDeleted = 0
    for (const op of merged) {
        let from = doc.line(op.start).from
        let to = doc.line(op.end).to
        let startLine = op.start
        if (op.end < doc.lines) to += 1
        else if (op.start > 1) { from -= 1; startLine-- }
        changes.push({ from, to })
        targets.push({ line: startLine - linesDeleted, col: op.col, main: op.main })
        linesDeleted += op.end - op.start + 1
    }
    const changeSet = state.changes(changes)
    const newDoc = changeSet.apply(doc)
    let mainIndex = 0
    const ranges = targets.map((t, i) => {
        if (t.main) mainIndex = i
        const line = newDoc.line(Math.min(Math.max(1, t.line), newDoc.lines))
        return EditorSelection.cursor(line.from + Math.min(t.col, line.length))
    })
    dispatch(state.update({ changes: changeSet, selection: EditorSelection.create(ranges, mainIndex), scrollIntoView: true, userEvent: 'delete.line' }))
    return true
}

// ⌃T:Monaco 没绑这个键(editor.action.transpose 无默认键位),Mac 上是 textarea 的系统 transpose:,对照页实测照它:
// 按字素簇,行中把光标前后两个字交换、光标移到两者之后;光标在行尾(后面是换行或文末)交换光标前两个字、光标不动;
// 文首或前面不够两个字不动。换行算一个字。
export const transposeLetters: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const doc = state.doc
    const before = (p: number) => {
        const line = doc.lineAt(p)
        return p === line.from ? p - 1 : line.from + findClusterBreak(line.text, p - line.from, false)
    }
    const after = (p: number) => {
        const line = doc.lineAt(p)
        return p === line.to ? p + 1 : line.from + findClusterBreak(line.text, p - line.from, true)
    }
    const changes: ChangeSpec[] = []
    const ranges: SelectionRange[] = []
    for (const r of state.selection.ranges) {
        const pos = r.head
        if (!r.empty || pos === 0) { ranges.push(r); continue }
        let a: number, mid: number, b: number
        if (pos === doc.lineAt(pos).to) {
            mid = before(pos)
            a = mid > 0 ? before(mid) : -1
            b = pos
        }
        else {
            a = before(pos)
            mid = pos
            b = after(pos)
        }
        if (a < 0) { ranges.push(r); continue }
        changes.push({ from: a, to: b, insert: state.sliceDoc(mid, b) + state.sliceDoc(a, mid) })
        ranges.push(EditorSelection.cursor(b))
    }
    if (!changes.length) return false
    dispatch(state.update({
        changes,
        selection: EditorSelection.create(ranges, state.selection.mainIndex), // 等长替换,位置不变
        scrollIntoView: true,
        userEvent: 'input.transpose',
    }))
    return true
}

// Monaco TransposeAction(editor.action.transpose,无默认键位):与上面的 ⌃T(Mac 原生换位)不同。
// 空光标:行中交换光标前后两个 UTF-16 码元,光标后移一格(行首只后移不换);行尾(非末行)与换行符互换,光标落下一行行首;文末不动。
export const transposeCharacters: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const doc = state.doc
    const changes: ChangeSpec[] = []
    const ranges: SelectionRange[] = []
    for (const r of state.selection.ranges) {
        if (!r.empty) { ranges.push(r); continue }
        const pos = r.head
        const line = doc.lineAt(pos)
        if (pos === line.to && line.number === doc.lines) { ranges.push(r); continue }
        const from = Math.max(line.from, pos - 1)
        const to = pos + 1 // 行尾:+1 正好含换行符
        changes.push({ from, to, insert: state.sliceDoc(from, to).split('').reverse().join('') })
        ranges.push(EditorSelection.cursor(pos + 1))
    }
    dispatch(state.update({
        changes,
        selection: EditorSelection.create(ranges, state.selection.mainIndex),
        scrollIntoView: true,
        userEvent: 'input.transpose',
    }))
    return changes.length > 0
}
