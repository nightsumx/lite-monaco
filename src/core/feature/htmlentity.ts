// 选区 HTML 实体编解码。

import type { StateCommand } from '../model/state'
import { EditorSelection } from '../model/selection'

const PAIRS: [string, string][] = [
    ['&', '&amp;'],
    ['<', '&lt;'],
    ['>', '&gt;'],
    ['"', '&quot;'],
    ["'", '&apos;'],
]

export function encodeHtml(s: string): string {
    let out = ''
    for (let i = 0; i < s.length; i++) {
        const ch = s[i]
        let hit = ''
        for (const [raw, ent] of PAIRS)
            if (ch === raw) { hit = ent; break }
        out += hit || ch
    }
    return out
}

export function decodeHtml(s: string): string {
    let out = ''
    for (let i = 0; i < s.length; i++) {
        if (s[i] !== '&') { out += s[i]; continue }
        let done = false
        for (const [raw, ent] of PAIRS) {
            let ok = true
            for (let k = 0; k < ent.length; k++)
                if (s[i + k] !== ent[k]) { ok = false; break }
            if (!ok) continue
            out += raw
            i += ent.length - 1
            done = true
            break
        }
        if (!done) out += s[i]
    }
    return out
}

function rewrite(fn: (s: string) => string): StateCommand {
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

export const encodeHtmlSelection = rewrite(encodeHtml)
export const decodeHtmlSelection = rewrite(decodeHtml)
