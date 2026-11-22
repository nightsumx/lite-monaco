// TODO / FIXME / HACK / XXX。词法扫，不解析源码。

import type { StateCommand } from '../model/state'
import { EditorSelection } from '../model/selection'

const TAGS = ['FIXME', 'TODO', 'HACK', 'XXX'] as const

export interface TodoHit { from: number, to: number, kind: (typeof TAGS)[number] }

function isIdentChar(ch: string): boolean {
    const o = ch.charCodeAt(0)
    return (o >= 48 && o <= 57) || (o >= 65 && o <= 90) || (o >= 97 && o <= 122) || o === 95 || o === 36
}

export function findTodos(text: string): TodoHit[] {
    const out: TodoHit[] = []
    for (let i = 0; i < text.length; i++) {
        for (const tag of TAGS) {
            if (i + tag.length > text.length) continue
            let ok = true
            for (let k = 0; k < tag.length; k++) {
                if (text[i + k] !== tag[k]) { ok = false; break }
            }
            if (!ok) continue
            if (i > 0 && isIdentChar(text[i - 1])) continue
            const after = text[i + tag.length]
            if (after && isIdentChar(after)) continue
            out.push({ from: i, to: i + tag.length, kind: tag })
            i += tag.length - 1
            break
        }
    }
    return out
}

export const gotoNextTodo: StateCommand = ({ state, dispatch }) => {
    const hits = findTodos(state.sliceDoc())
    if (!hits.length) return false
    const head = state.selection.main.from
    let next = hits.find(h => h.from > head)
    if (!next) next = hits[0]
    if (next.from === head) return false
    dispatch(state.update({
        selection: EditorSelection.range(next.from, next.to),
        scrollIntoView: true,
        userEvent: 'select',
    }))
    return true
}

export const gotoPrevTodo: StateCommand = ({ state, dispatch }) => {
    const hits = findTodos(state.sliceDoc())
    if (!hits.length) return false
    const head = state.selection.main.from
    let prev: TodoHit | undefined
    for (const h of hits) {
        if (h.from >= head) break
        prev = h
    }
    if (!prev) prev = hits[hits.length - 1]
    if (prev.from === head) return false
    dispatch(state.update({
        selection: EditorSelection.range(prev.from, prev.to),
        scrollIntoView: true,
        userEvent: 'select',
    }))
    return true
}
