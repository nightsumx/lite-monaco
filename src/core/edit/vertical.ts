// 上下移动 / 翻页 / 上下加光标,对齐 Monaco 0.52 MoveOperations.vertical / moveUp / moveDown / translateUp/Down。
//
// 列按「可见列」算(vcol.ts:Tab 展到 tab stop,CJK/emoji 记 2),目标落在字素边界、取更近的一侧。
// goalColumn 存目标可见列(= Monaco 的 当前可见列 + leftoverVisibleColumns),只在竖向移动之间保留;
// 横向移动、输入都会产生不带 goalColumn 的新光标,自然复位。
//   - ↓ 在末行:到行尾(allowMoveOnLastLine);↑ 在首行:到行首。目标列保留,回头再 ↓/↑ 回到原列。
//   - 从首/末位置出发(已在文档头/尾)时目标列复位成落点的列。
//   - 有选区不扩选:↑ 从选区起点、↓ 从选区终点出发。
//   - PageUp/PageDown 一次跨 pageSize 行(Monaco:可视行数 - 2,至少 1)。
//   - ⌘⌥↑/↓ 给每个选区在上/下一行加一份(translateUp/Down,不吸附到行首尾),重合的合并。Monaco 这条走逻辑行,折行时也一样。
//
// 折行(target 是开了 lineWrapping 的 EditorView):↑↓/PageUp/PageDown 按视觉行走(Monaco 在 view line 上移动)。
// 目标 x 来自 view.moveVertically,存进 goalColumn 时按 charWidth 折成列(与不折行时同单位,退回逻辑行也能用);
// 落点在软折行点时 assoc 标出画在哪一侧。目标行不在渲染区(无 DOM)时退回逻辑行。

import type { SelectionRange } from '../model/selection'
import type { EditorState, StateCommand, Transaction } from '../model/state'
import { EditorSelection, selectionCreationOrder } from '../model/selection'
import { StateEffect } from '../model/state'
import { columnFromVisible, visibleColumn } from './vcol'
import { hiddenRanges } from './fold'
import { capSelection, keepOverlappingCursors } from './editoptions'
import { Affinity, assocAffinity, type SoftWrapModel, type ViewPos, type ViewRow } from '../view/softwrap'

/** 从 pos(目标可见列 goal,null=取当前列)竖移 delta 个可见行,跳过折起的行。allowEdge:越过首/末可见行时吸附到行首/行尾。 */
export function verticalPos(state: EditorState, pos: number, goal: number | null, delta: number, allowEdge: boolean): SelectionRange {
    const doc = state.doc, tab = state.tabSize
    const hidden = hiddenRanges(state)
    // 第 m 行若被藏,沿 dir 跳到藏区外的第一行(Monaco 在 view line 上移动)
    const visible = (m: number, dir: number) => {
        const from = doc.line(m).from
        const h = hidden.find(h => from > h.from && from <= h.to)
        if (!h) return m
        return dir > 0 ? doc.lineAt(h.to).number + 1 : doc.lineAt(h.from).number
    }
    const step = (n: number, dir: number) => {
        const m = n + dir
        if (m < 1 || m > doc.lines) return 0
        const v = visible(m, dir)
        return v > doc.lines ? 0 : v
    }
    const line = doc.lineAt(pos)
    const col = pos - line.from
    const cur = goal ?? visibleColumn(line.text, col, tab)
    const dir = delta < 0 ? -1 : 1
    const atEdge = pos === (dir < 0 ? line.from : line.to) && !step(line.number, dir)
    let n = line.number
    let left = Math.abs(delta)
    for (; left > 0; left--) {
        const m = step(n, dir)
        if (!m) break
        n = m
    }
    const l = doc.line(n)
    const newPos = left === 0 ? l.from + columnFromVisible(l.text, cur, tab)
        : allowEdge ? (dir < 0 ? l.from : l.to) : Math.min(l.to, l.from + col)
    const newGoal = atEdge ? visibleColumn(l.text, newPos - l.from, tab) : cur
    return EditorSelection.cursor(newPos, 0, null, newGoal)
}

/** 折行几何:EditorView 开 lineWrapping 时有。 */
interface WrapTarget {
    state: EditorState
    dispatch: (tr: Transaction) => void
    lineWrapping?: boolean
    oracle?: { charWidth: number }
    moveVertically?: (pos: number, forward: boolean, goalX?: number, assoc?: number, rows?: number) => { pos: number, goalX: number, assoc: -1 | 0 | 1 } | null
    linesPerPage?: () => number
    softWrapModel?: () => SoftWrapModel | null
}

// ───── 无布局的折行竖移:Monaco MoveOperations.vertical / moveDown / moveUp 在视图行(softwrap.ts)上的逐行移植 ─────
// 视图行内容含续行缩进空格与注入文字,可见列按它算(续行的目标列因此含缩进)。goalColumn = 当前可见列 + leftoverVisibleColumns。
const sameRow = (a: ViewRow, b: ViewRow) => a.line === b.line && a.row === b.row

function wrapVertical(m: SoftWrapModel, tab: number, v: ViewPos, leftover: number, count: number, down: boolean, aff: Affinity): { v: ViewPos, leftover: number } {
    const curVis = visibleColumn(m.content(v.line, v.row), v.col - 1, tab) + leftover
    const first = m.firstRow(), last = m.lastRow()
    const wasAtEdge = down
        ? sameRow(v, last) && v.col === m.maxColumn(v.line, v.row)
        : sameRow(v, first) && v.col === 1
    const to = m.shift(v, down ? count : -count)
    let line: ViewRow, col: number
    if (to === 'before') { line = first; col = m.minColumn(line.line, line.row) }
    else if (to === 'after') { line = last; col = m.maxColumn(line.line, line.row) }
    else {
        line = to
        // columnFromVisibleColumn:按目标视图行内容取列,不小于最小列
        col = Math.max(m.minColumn(line.line, line.row), columnFromVisible(m.content(line.line, line.row), curVis, tab) + 1)
    }
    let pos: ViewPos = { ...line, col }
    let left = wasAtEdge ? 0 : curVis - visibleColumn(m.content(line.line, line.row), col - 1, tab)
    const np = m.normalize(pos, aff)
    left += pos.col - np.col
    pos = np
    return { v: pos, leftover: left }
}

// 一格竖移(count 个视图行)。↓ 先落到下面再按「不停在注入文字里」归一,仍在原行就继续往下找(越过整段注入文字)。
function wrapMove(t: WrapTarget, m: SoftWrapModel, pos: number, assoc: -1 | 0 | 1, goal: number | null, delta: number): SelectionRange {
    const tab = t.state.tabSize, doc = t.state.doc
    const line = doc.lineAt(pos)
    const v = m.toView(line.number, pos - line.from, assocAffinity(assoc))
    const cur0 = visibleColumn(m.content(v.line, v.row), v.col - 1, tab)
    const leftover = goal == null ? 0 : goal - cur0
    const down = delta > 0, count = Math.abs(delta)
    let r!: { v: ViewPos, leftover: number }
    if (!down) r = wrapVertical(m, tab, v, leftover, count, false, Affinity.LeftOfInjectedText)
    else {
        for (let i = 0; ;) {
            const at = i === 0 ? v : m.shift(v, i) as ViewRow // 下面保证 i 行内必有
            r = wrapVertical(m, tab, { ...at, col: v.col }, leftover, count, true, Affinity.RightOfInjectedText)
            const np = m.normalize(r.v, Affinity.None)
            if (np.line > v.line || (np.line === v.line && np.row > v.row) || i++ >= 10) break
            const next = m.shift(v, i)
            if (typeof next === 'string' || m.shift(next, 1) === 'after') break
        }
    }
    const l = doc.line(r.v.line)
    const off = m.toModel(r.v)
    // 视图位置 → 模型位置 + assoc:落在折点 / 注入文字边上时记下画在哪一侧(-1 前一行尾 / 注入文字左,1 注入文字右)
    const at = (a: Affinity) => { const b = m.toView(r.v.line, off, a); return b.row === r.v.row && b.col === r.v.col }
    const side = at(Affinity.None) ? 0 : at(Affinity.Left) ? -1 : at(Affinity.Right) ? 1 : 0
    const g = visibleColumn(m.content(r.v.line, r.v.row), r.v.col - 1, tab) + r.leftover
    return EditorSelection.cursor(l.from + off, side, null, g)
}

// 从 pos 按视觉行竖移 |delta| 行;无折行几何 / 目标行无布局 → 逻辑行。
function movePos(t: WrapTarget, pos: number, assoc: -1 | 0 | 1, goal: number | null, delta: number): SelectionRange {
    const cw = t.oracle?.charWidth ?? 0
    if (t.lineWrapping && t.moveVertically && cw > 0) {
        // 从文档头 ↑ / 文档尾 ↓:目标列复位成当前列(同 verticalPos 的 atEdge)
        const atEdge = delta < 0 ? pos === 0 : pos === t.state.doc.length
        const r = t.moveVertically(pos, delta > 0, goal == null || atEdge ? undefined : goal * cw, assoc, Math.abs(delta))
        if (r) return EditorSelection.cursor(r.pos, r.assoc, null, r.goalX / cw)
    }
    const m = t.lineWrapping ? t.softWrapModel?.() : null
    if (m) return wrapMove(t, m, pos, assoc, goal, delta)
    return verticalPos(t.state, pos, goal, delta, true)
}

function moveRange(t: WrapTarget, range: SelectionRange, delta: number, extend: boolean): SelectionRange {
    if (extend) {
        const moved = movePos(t, range.head, range.assoc, range.goalColumn, delta)
        return EditorSelection.range(range.anchor, moved.head, moved.assoc, moved.goalColumn)
    }
    // 不扩选:有选区时 ↑ 从起点、↓ 从终点出发(Monaco moveUp/moveDown)
    const start = range.empty ? range.head : (delta < 0 ? range.from : range.to)
    return movePos(t, start, start === range.head ? range.assoc : 0, start === range.head ? range.goalColumn : null, delta)
}

function run(t: WrapTarget, delta: number, extend: boolean): boolean {
    const { state, dispatch } = t
    const ranges = state.selection.ranges.map(r => moveRange(t, r, delta, extend))
    const sel = EditorSelection.create(ranges, state.selection.mainIndex, keepOverlappingCursors(state))
    // 位置没变、存着的目标列变了(在文档头尾再按一次:目标列复位成当前列)也要派发
    const same = (r: SelectionRange, i: number) => { const g = state.selection.ranges[i].goalColumn; return g == null || g === r.goalColumn }
    if (sel.eq(state.selection, true) && sel.ranges.every(same)) return false
    dispatch(state.update({ selection: sel, scrollIntoView: true, userEvent: 'select' }))
    return true
}

export const cursorLineDown: StateCommand = (t: WrapTarget) => run(t, 1, false)
export const cursorLineUp: StateCommand = (t: WrapTarget) => run(t, -1, false)
export const selectLineDown: StateCommand = (t: WrapTarget) => run(t, 1, true)
export const selectLineUp: StateCommand = (t: WrapTarget) => run(t, -1, true)

// 翻页大小:Monaco cursorConfig.pageSize = max(1, floor(可视高度 / 行高) - 2)。折行时按视觉行数。
// target 带 linesPerPage()(EditorView 有,= floor(clientHeight / lineHeight));无布局(jsdom)时用默认值。
const DEFAULT_PAGE = 30
export function pageSize(target: { linesPerPage?: () => number }): number {
    const n = target.linesPerPage?.() ?? 0
    return n > 0 ? Math.max(1, n - 2) : DEFAULT_PAGE
}

export const cursorPageDown: StateCommand = (t: WrapTarget) => run(t, pageSize(t), false)
export const cursorPageUp: StateCommand = (t: WrapTarget) => run(t, -pageSize(t), false)
export const selectPageDown: StateCommand = (t: WrapTarget) => run(t, pageSize(t), true)
export const selectPageUp: StateCommand = (t: WrapTarget) => run(t, -pageSize(t), true)

/** scrollIntoView 时滚到这个位置,而不是主光标(Monaco revealTopMostCursor / revealBottomMostCursor)。 */
export const revealPos = StateEffect.define<number>()

// Monaco editorScroll(scrollLineUp/Down 按一行、scrollPageUp/Down 按一页 = pageSize 行,revealCursor:false):
// 只滚视口,光标不动。行高取 EditorView.oracle.lineHeight;没有滚动容器(纯 state target)时不认领。
type ScrollTarget = { state: EditorState, scrollDOM?: HTMLElement, oracle?: { lineHeight: number }, linesPerPage?: () => number }
function scrollByLines(t: ScrollTarget, lines: number): boolean {
    const dom = t.scrollDOM
    if (!dom) return false
    dom.scrollTop = Math.max(0, dom.scrollTop + lines * (t.oracle?.lineHeight || 14))
    return true
}
export const scrollLineUp: StateCommand = (t: ScrollTarget) => scrollByLines(t, -1)
export const scrollLineDown: StateCommand = (t: ScrollTarget) => scrollByLines(t, 1)
export const scrollPageUp: StateCommand = (t: ScrollTarget) => scrollByLines(t, -pageSize(t))
export const scrollPageDown: StateCommand = (t: ScrollTarget) => scrollByLines(t, pageSize(t))

// ⌘⌥↑/↓:每个选区的锚与头各自 translate 一行(不吸附行首尾),作为新选区加进去;重合的由 create 合并。
function addCursorVertically(state: EditorState, dispatch: (tr: Transaction) => void, forward: boolean): boolean {
    const delta = forward ? 1 : -1
    const old = state.selection.ranges
    const added = old.map(r => {
        const a = verticalPos(state, r.anchor, r.empty ? r.goalColumn : null, delta, false)
        const h = r.empty ? a : verticalPos(state, r.head, r.goalColumn, delta, false)
        return EditorSelection.range(a.head, h.head, 0, h.goalColumn)
    })
    // 主光标还是原来那个(Monaco 新光标排在各自原光标之后,主光标不换);滚到最上 / 最下的光标
    const sel = capSelection(state, EditorSelection.create([...old, ...added], state.selection.mainIndex))
    if (sel.eq(state.selection, true)) return false
    const edge = forward ? sel.ranges[sel.ranges.length - 1].head : sel.ranges[0].head
    dispatch(state.update({ selection: sel, scrollIntoView: true, effects: revealPos.of(edge), userEvent: 'select' }))
    return true
}

export const addCursorAbove: StateCommand = ({ state, dispatch }) => addCursorVertically(state, dispatch, false)
export const addCursorBelow: StateCommand = ({ state, dispatch }) => addCursorVertically(state, dispatch, true)

// ⇧⌥⌘ 方向键 / 翻页:键盘列选择(Monaco ColumnSelection)。从框的起点(行, 可见列)到终点按可见列框出矩形,每行一个选区,
// 起点那行是主选区;落在框外的短行跳过,全落空时每行放在行尾。连按时接着上一次的框;选区被别的操作换掉就从主选区的锚 → 头重新取
// (Monaco columnSelectData,setStates 时清空)。框按结果选区记在 WeakMap 里,选区对象一换自然失效。
type ColumnBox = { fromLine: number, fromCol: number, toLine: number, toCol: number }
const columnBoxes = new WeakMap<EditorSelection, ColumnBox>()

function columnSelect(t: WrapTarget, move: (box: ColumnBox, state: EditorState) => ColumnBox): boolean {
    const { state, dispatch } = t
    const doc = state.doc, tab = state.tabSize
    const vcol = (pos: number) => { const l = doc.lineAt(pos); return visibleColumn(l.text, pos - l.from, tab) }
    const main = state.selection.main
    const box = move(columnBoxes.get(state.selection)
        ?? { fromLine: doc.lineAt(main.anchor).number, fromCol: vcol(main.anchor), toLine: doc.lineAt(main.head).number, toCol: vcol(main.head) }, state)
    const dir = box.fromLine > box.toLine ? -1 : 1
    const ltr = box.fromCol < box.toCol, rtl = box.fromCol > box.toCol
    const ranges: SelectionRange[] = []
    for (let n = box.fromLine; ; n += dir) {
        const l = doc.line(n)
        const a = columnFromVisible(l.text, box.fromCol, tab), h = columnFromVisible(l.text, box.toCol, tab)
        const va = visibleColumn(l.text, a, tab), vh = visibleColumn(l.text, h, tab)
        if (!(ltr && (va > box.toCol || vh < box.fromCol)) && !(rtl && (vh > box.fromCol || va < box.toCol)))
            ranges.push(EditorSelection.range(l.from + a, l.from + h))
        if (n === box.toLine) break
    }
    if (!ranges.length)
        for (let n = box.fromLine; ; n += dir) { ranges.push(EditorSelection.cursor(doc.line(n).to)); if (n === box.toLine) break }
    const sel = capSelection(state, EditorSelection.create(ranges, 0))
    const edge = dir < 0 ? sel.ranges[0].head : sel.ranges[sel.ranges.length - 1].head
    const tr = state.update({ selection: sel, scrollIntoView: true, effects: revealPos.of(edge), userEvent: 'select' })
    columnBoxes.set(tr.newSelection, box)
    selectionCreationOrder.set(tr.newSelection, ranges.map(r => tr.newSelection.ranges.find(x => x.anchor === r.anchor && x.head === r.head) ?? r))
    dispatch(tr)
    return true
}

/** 鼠标式列选(Monaco ColumnSelect 命令):restart=从 (line, visualCol) 重新起框;否则沿用当前框的起点,只改终点。 */
export function columnSelectTo(t: WrapTarget, line: number, visualCol: number, restart: boolean): boolean {
    return columnSelect(t, b => restart ? { fromLine: line, fromCol: visualCol, toLine: line, toCol: visualCol } : { ...b, toLine: line, toCol: visualCol })
}

export const cursorColumnSelectLeft: StateCommand = (t: WrapTarget) => columnSelect(t, b => ({ ...b, toCol: Math.max(0, b.toCol - 1) }))
export const cursorColumnSelectRight: StateCommand = (t: WrapTarget) => columnSelect(t, (b, state) => {
    let max = 0
    for (let n = Math.min(b.fromLine, b.toLine); n <= Math.max(b.fromLine, b.toLine); n++) {
        const text = state.doc.line(n).text
        max = Math.max(max, visibleColumn(text, text.length, state.tabSize))
    }
    return { ...b, toCol: b.toCol < max ? b.toCol + 1 : b.toCol }
})
export const cursorColumnSelectUp: StateCommand = (t: WrapTarget) => columnSelect(t, b => ({ ...b, toLine: Math.max(1, b.toLine - 1) }))
export const cursorColumnSelectDown: StateCommand = (t: WrapTarget) => columnSelect(t, (b, state) => ({ ...b, toLine: Math.min(state.doc.lines, b.toLine + 1) }))
export const cursorColumnSelectPageUp: StateCommand = (t: WrapTarget) => columnSelect(t, b => ({ ...b, toLine: Math.max(1, b.toLine - pageSize(t)) }))
export const cursorColumnSelectPageDown: StateCommand = (t: WrapTarget) => columnSelect(t, (b, state) => ({ ...b, toLine: Math.min(state.doc.lines, b.toLine + pageSize(t)) }))
