// 未闭合标签补闭合。词法扫。

import type { StateCommand } from '../model/state'
import { EditorSelection } from '../model/selection'
import { findTags } from './tags'

export function unclosedTagBefore(text: string, pos: number): string | null {
    const stack: string[] = []
    for (const t of findTags(text)) {
        if (t.from > pos) break
        if (t.self) continue
        if (!t.close) stack.push(t.name)
        else if (stack.length && stack[stack.length - 1] === t.name) stack.pop()
        else if (stack.length) stack.pop()
    }
    return stack.length ? stack[stack.length - 1] : null
}

export const closeHtmlTag: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const pos = state.selection.main.head
    const name = unclosedTagBefore(state.sliceDoc(), pos)
    if (!name) return false
    const insert = `</${name}>`
    dispatch(state.update({
        changes: { from: pos, insert },
        selection: EditorSelection.cursor(pos),
        userEvent: 'input',
        scrollIntoView: true,
    }))
    return true
}
