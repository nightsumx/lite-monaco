// 选区转义 / 反转义。词法扫，不解析源码。

import type { StateCommand } from '../model/state'
import { EditorSelection } from '../model/selection'

export function escapeText(s: string): string {
    let out = ''
    for (let i = 0; i < s.length; i++) {
        const ch = s[i]
        if (ch === '\\') out += '\\\\'
        else if (ch === '\n') out += '\\n'
        else if (ch === '\r') out += '\\r'
        else if (ch === '\t') out += '\\t'
        else if (ch === '"') out += '\\"'
        else if (ch === "'") out += "\\'"
        else out += ch
    }
    return out
}

export function unescapeText(s: string): string {
    let out = ''
    for (let i = 0; i < s.length; i++) {
        if (s[i] !== '\\' || i + 1 >= s.length) { out += s[i]; continue }
        const n = s[i + 1]
        if (n === 'n') out += '\n'
        else if (n === 'r') out += '\r'
        else if (n === 't') out += '\t'
        else if (n === '\\') out += '\\'
        else if (n === '"') out += '"'
        else if (n === "'") out += "'"
        else { out += s[i]; continue }
        i++
    }
    return out
}

function rewriteSelection(fn: (s: string) => string): StateCommand {
    return ({ state, dispatch }) => {
        if (state.readOnly) return false
        const sel = state.selection.main
        if (sel.empty) return false
        const raw = state.sliceDoc(sel.from, sel.to)
        const next = fn(raw)
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

export const escapeSelection = rewriteSelection(escapeText)
export const unescapeSelection = rewriteSelection(unescapeText)
