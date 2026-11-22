// 光标撤销 / 重做(⌘U / ⇧⌘U 无默认键),对齐 Monaco CursorUndoRedoController:
// 只记「文档没变」的选区变化(移动、扩选、⌘D…),每次把变化前的选区压栈(与栈顶相同则不压,上限 50);
// 任何文档改动清空两栈(撤销 / 重做之后栈里留一个撤销前的选区,见下)。由 history() 一起装上。

import { EditorSelection } from '../model/selection'
import type { StateCommand, Transaction } from '../model/state'
import { Annotation, StateField } from '../model/state'

interface CursorStacks { undo: readonly EditorSelection[], redo: readonly EditorSelection[] }

const EMPTY: CursorStacks = { undo: [], redo: [] }
const LIMIT = 50

const cursorUndoAnno = Annotation.define<CursorStacks>()

export const cursorHistoryField = StateField.define<CursorStacks>({
    create: () => EMPTY,
    update(value: CursorStacks, tr: Transaction): CursorStacks {
        const fromCmd = tr.annotation(cursorUndoAnno)
        if (fromCmd) return fromCmd
        if (tr.docChanged) {
            // 撤销 / 重做:Monaco 先清栈(内容变化),再把选区设成撤销记下的那个——这次选区变化版本号没变,
            // 压进去的是撤销前选区的行列坐标(原样搬到新文档,列超出行尾贴尾,对照页实测 ab‸c 打 x、⌘Z、⌘U → abc‸)
            if (tr.isUserEvent('undo') || tr.isUserEvent('redo')) {
                const before = tr.startState.doc, after = tr.newDoc
                const at = (p: number) => {
                    const l = before.lineAt(p)
                    const line = after.line(Math.min(l.number, after.lines))
                    return line.from + Math.min(p - l.from, line.length)
                }
                const old = tr.startState.selection
                const prev = EditorSelection.create(old.ranges.map(r => EditorSelection.range(at(r.anchor), at(r.head))), old.mainIndex)
                return prev.eq(tr.newSelection) ? EMPTY : { undo: [prev], redo: [] }
            }
            return value.undo.length || value.redo.length ? EMPTY : value
        }
        if (!tr.selection) return value
        const prev = tr.startState.selection
        if (tr.selection.eq(prev)) return value
        const top = value.undo[value.undo.length - 1]
        if (top && top.eq(prev)) return value
        const undo = value.undo.length >= LIMIT ? value.undo.slice(1) : value.undo.slice()
        undo.push(prev)
        return { undo, redo: [] }
    },
})

function pop(redo: boolean): StateCommand {
    return ({ state, dispatch }) => {
        const stacks = state.field(cursorHistoryField, false)
        if (!stacks) return false
        const from = redo ? stacks.redo : stacks.undo
        if (!from.length) return false
        const target = from[from.length - 1]
        const rest = from.slice(0, -1)
        const to = [...(redo ? stacks.undo : stacks.redo), state.selection]
        const next: CursorStacks = redo ? { undo: to, redo: rest } : { undo: rest, redo: to }
        dispatch(state.update({
            selection: target,
            scrollIntoView: true,
            userEvent: redo ? 'select.cursorRedo' : 'select.cursorUndo',
            annotations: cursorUndoAnno.of(next),
        }))
        return true
    }
}

export const cursorUndo = pop(false)
export const cursorRedo = pop(true)
