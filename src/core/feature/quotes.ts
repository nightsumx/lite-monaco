// 光标处 '…' / "…" 互换。词法扫，不解析源码。

import type { StateCommand } from '../model/state'
import { EditorSelection } from '../model/selection'

export interface Quoted { from: number, to: number, quote: "'" | '"' }

export function findQuotedAt(text: string, pos: number): Quoted | null {
    let i = 0
    while (i < text.length) {
        const q = text[i]
        if (q !== "'" && q !== '"') { i++; continue }
        let j = i + 1
        while (j < text.length) {
            if (text[j] === '\\') { j += 2; continue }
            if (text[j] === q) {
                if (pos >= i && pos <= j)
                    return { from: i, to: j + 1, quote: q }
                i = j + 1
                break
            }
            if (text[j] === '\n') { i = j + 1; break }
            j++
        }
        if (j >= text.length) break
    }
    return null
}

function flipQuotes(inner: string, from: "'" | '"', to: "'" | '"'): string {
    let out = ''
    for (let i = 0; i < inner.length; i++) {
        if (inner[i] === '\\' && i + 1 < inner.length) {
            const n = inner[i + 1]
            if (n === from) { out += from; i++; continue }
            if (n === to) { out += '\\' + to; i++; continue }
            out += inner[i]
            continue
        }
        if (inner[i] === to) out += '\\' + to
        else out += inner[i]
    }
    return out
}

export const toggleQuotes: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const hit = findQuotedAt(state.sliceDoc(), state.selection.main.head)
    if (!hit) return false
    const nextQ: "'" | '"' = hit.quote === "'" ? '"' : "'"
    const inner = state.sliceDoc(hit.from + 1, hit.to - 1)
    const insert = nextQ + flipQuotes(inner, hit.quote, nextQ) + nextQ
    if (insert === state.sliceDoc(hit.from, hit.to)) return false
    dispatch(state.update({
        changes: { from: hit.from, to: hit.to, insert },
        selection: EditorSelection.cursor(hit.from + 1),
        userEvent: 'input',
        scrollIntoView: true,
    }))
    return true
}

export const unwrapQuotes: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const hit = findQuotedAt(state.sliceDoc(), state.selection.main.head)
    if (!hit || hit.to - hit.from < 2) return false
    const inner = state.sliceDoc(hit.from + 1, hit.to - 1)
    dispatch(state.update({
        changes: { from: hit.from, to: hit.to, insert: inner },
        selection: EditorSelection.range(hit.from, hit.from + inner.length),
        userEvent: 'input',
        scrollIntoView: true,
    }))
    return true
}
