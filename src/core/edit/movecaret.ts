// 把选中的文本左 / 右挪一格(Monaco caretOperations MoveCaretCommand / editor.action.moveCarretLeftAction|RightAction)。
// 只作用于单行非空选区(空选区 / 多行选区原样不动);已在行首(左)/ 行尾(右)不动。选区跟着文本走。
// 多选区:各自独立挪,互相相邻时先挪靠前的会被后一个的编辑区间吃掉,与 Monaco 一样不特殊处理(重叠的编辑交给 changes 校验,这里跳过)。
import type { ChangeSpec } from '../model/change'
import type { EditorState, StateCommand } from '../model/state'
import { EditorSelection } from '../model/selection'

function move(state: EditorState, dispatch: (tr: ReturnType<EditorState['update']>) => void, left: boolean): boolean {
    if (state.readOnly) return false
    const doc = state.doc
    const changes: ChangeSpec[] = []
    const ranges = state.selection.ranges.map((r) => {
        if (r.empty) return r
        const line = doc.lineAt(r.from)
        if (r.to > line.to) return r
        if (left ? r.from === line.from : r.to === line.to) return r
        const dir = left ? -1 : 1
        if (left) changes.push({ from: r.from - 1, to: r.from }, { from: r.to, insert: doc.sliceString(r.from - 1, r.from) })
        else changes.push({ from: r.to, to: r.to + 1 }, { from: r.from, insert: doc.sliceString(r.to, r.to + 1) })
        return EditorSelection.range(r.anchor + dir, r.head + dir)
    })
    if (!changes.length) return false
    dispatch(state.update({ changes, selection: EditorSelection.create(ranges, state.selection.mainIndex), scrollIntoView: true, userEvent: 'move.caret' }))
    return true
}

export const moveCaretLeft: StateCommand = ({ state, dispatch }) => move(state, dispatch, true)
export const moveCaretRight: StateCommand = ({ state, dispatch }) => move(state, dispatch, false)
