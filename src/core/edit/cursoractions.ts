// 只出现在命令面板里的多光标动作(Monaco multicursor.ts / cursorMove):
// Add Cursors to Bottom / Top、Focus Next / Previous Cursor。
import type { StateCommand } from '../model/state'
import { EditorSelection, selectionCreationOrder, type SelectionRange } from '../model/selection'
import { capSelection } from './editoptions'

// 选区按「创建顺序」报给 getSelections(Monaco 的 cursors 是按加入顺序,主选区在前;CM 的 ranges 是文档序)
function put(state: Parameters<StateCommand>[0]['state'], dispatch: Parameters<StateCommand>[0]['dispatch'], created: SelectionRange[]): true {
    const tr = state.update({ selection: capSelection(state, EditorSelection.create(created, 0)), scrollIntoView: true, userEvent: 'select' })
    selectionCreationOrder.set(tr.newSelection, created.map(r => tr.newSelection.ranges.find(x => x.anchor === r.anchor && x.head === r.head) ?? r))
    dispatch(tr)
    return true
}

// 同一列:行比选区短就夹到行尾(Monaco 之后由模型校验把 Selection 夹进行内)
function sameColumns(state: Parameters<StateCommand>[0]['state'], lines: number[]): SelectionRange[] {
    const doc = state.doc
    const m = state.selection.main
    const a = doc.lineAt(m.anchor), h = doc.lineAt(m.head)
    const ac = m.anchor - a.from, hc = m.head - h.from
    // 选区跨行时只取起点所在行的列,同 Monaco(用 selection 的 start/end 列各自落在每一行)
    return lines.map(n => {
        const l = doc.line(n)
        return EditorSelection.range(l.from + Math.min(ac, l.length), l.from + Math.min(hc, l.length))
    })
}

/** Add Cursors to Bottom:从主选区所在行到末行,每行一个同列的光标;主选区排第一 */
export const addCursorsToBottom: StateCommand = ({ state, dispatch }) => {
    const first = state.doc.lineAt(state.selection.main.from).number
    const lines: number[] = []
    for (let n = first; n <= state.doc.lines; n++) lines.push(n)
    return put(state, dispatch, sameColumns(state, lines))
}

/** Add Cursors to Top:从主选区所在行往上到第一行,主选区排第一 */
export const addCursorsToTop: StateCommand = ({ state, dispatch }) => {
    const first = state.doc.lineAt(state.selection.main.from).number
    const lines: number[] = []
    for (let n = first; n >= 1; n--) lines.push(n)
    return put(state, dispatch, sameColumns(state, lines))
}

function focusCursor(step: 1 | -1): StateCommand {
    return ({ state, dispatch }) => {
        const rs = state.selection.ranges
        const n = rs.length
        if (n < 2) return true
        const main = (state.selection.mainIndex + step + n) % n
        const tr = state.update({ selection: EditorSelection.create(rs, main), scrollIntoView: true, userEvent: 'select' })
        // 新的主光标在前,其余按文档序接在它后面循环(Monaco 把选区列表整体转一圈)
        const ns = tr.newSelection
        const cyc: SelectionRange[] = []
        for (let k = 0; k < n; k++) cyc.push(ns.ranges[(ns.mainIndex + k) % n])
        selectionCreationOrder.set(ns, cyc)
        dispatch(tr)
        return true
    }
}

/** Focus Next Cursor:主光标换成下一个(按位置顺序,末尾回到第一个) */
export const focusNextCursor = focusCursor(1)
/** Focus Previous Cursor */
export const focusPreviousCursor = focusCursor(-1)
