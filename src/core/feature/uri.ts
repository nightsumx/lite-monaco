// 选区 URI 编解码。

import type { StateCommand } from '../model/state'
import { EditorSelection } from '../model/selection'

function rewrite(fn: (s: string) => string | null): StateCommand {
    return ({ state, dispatch }) => {
        if (state.readOnly) return false
        const sel = state.selection.main
        if (sel.empty) return false
        const raw = state.sliceDoc(sel.from, sel.to)
        let next: string
        try { next = fn(raw) ?? raw }
        catch { return false }
        if (next === raw) return false
        dispatch(state.update({
            changes: { from: sel.from, to: sel.to, insert: next },
            selection: EditorSelection.range(sel.from, sel.from + next.length),
            userEvent: 'input',
            scrollIntoView: true,
        }))
        return true
    }
}

export const encodeUriSelection = rewrite(s => encodeURIComponent(s))
export const decodeUriSelection = rewrite(s => decodeURIComponent(s))
