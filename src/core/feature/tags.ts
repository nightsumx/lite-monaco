// HTML / JSX 配对标签。词法扫，不解析源码。

import type { EditorState, StateCommand } from '../model/state'
import { EditorSelection } from '../model/selection'

export interface TagHit {
    from: number
    to: number
    name: string
    close: boolean
    self: boolean
}

function isNameChar(ch: string): boolean {
    const o = ch.charCodeAt(0)
    return (o >= 48 && o <= 57) || (o >= 65 && o <= 90) || (o >= 97 && o <= 122) || o === 45 || o === 58 || o === 95
}

export function findTags(text: string): TagHit[] {
    const out: TagHit[] = []
    for (let i = 0; i < text.length; i++) {
        if (text[i] !== '<') continue
        if (text[i + 1] === '!' && text[i + 2] === '-' && text[i + 3] === '-') {
            i += 4
            while (i < text.length && !(text[i] === '-' && text[i + 1] === '-' && text[i + 2] === '>')) i++
            i += 2
            continue
        }
        const start = i
        const close = text[i + 1] === '/'
        i += close ? 2 : 1
        const nameFrom = i
        while (i < text.length && isNameChar(text[i])) i++
        if (i === nameFrom) continue
        const name = text.slice(nameFrom, i)
        let self = false
        while (i < text.length && text[i] !== '>') {
            if (text[i] === '/' && text[i + 1] === '>') self = true
            i++
        }
        if (i >= text.length) break
        i++
        out.push({ from: start, to: i, name, close, self: self && !close })
        i--
    }
    return out
}

function tagPairs(text: string): { open: TagHit, close: TagHit }[] {
    const tags = findTags(text)
    const stack: TagHit[] = []
    const pairs: { open: TagHit, close: TagHit }[] = []
    for (const t of tags) {
        if (t.self) continue
        if (!t.close) {
            stack.push(t)
            continue
        }
        for (let i = stack.length - 1; i >= 0; i--) {
            if (stack[i].name !== t.name) continue
            pairs.push({ open: stack[i], close: t })
            stack.length = i
            break
        }
    }
    return pairs
}

function tagAt(text: string, pos: number): TagHit | undefined {
    return findTags(text).find(t => pos >= t.from && pos < t.to)
}

export function findMatchingTag(text: string, pos: number): { from: number, to: number } | null {
    const here = tagAt(text, pos)
    if (!here || here.self) return null
    for (const p of tagPairs(text)) {
        if (here.from === p.open.from && here.to === p.open.to)
            return { from: p.close.from, to: p.close.to }
        if (here.from === p.close.from && here.to === p.close.to)
            return { from: p.open.from, to: p.open.to }
    }
    return null
}

export function findTagPair(text: string, pos: number): { from: number, to: number } | null {
    for (const p of tagPairs(text)) {
        if (pos >= p.open.from && pos <= p.close.to)
            return { from: p.open.from, to: p.close.to }
    }
    return null
}

export const jumpToMatchingTag: StateCommand = ({ state, dispatch }) => {
    const sel = state.selection.main
    const hit = findMatchingTag(state.sliceDoc(), sel.empty ? sel.head : sel.from)
    if (!hit) return false
    if (state.selection.main.from === hit.from && state.selection.main.to === hit.to)
        return false
    dispatch(state.update({
        selection: EditorSelection.range(hit.from, hit.to),
        scrollIntoView: true,
        userEvent: 'select',
    }))
    return true
}

function nestPairs(text: string): { open: TagHit, close: TagHit }[] {
    const stack: TagHit[] = []
    const pairs: { open: TagHit, close: TagHit }[] = []
    for (const t of findTags(text)) {
        if (t.self) continue
        if (!t.close) stack.push(t)
        else if (stack.length) pairs.push({ open: stack.pop()!, close: t })
    }
    return pairs
}

function tagNameSpan(t: TagHit): { from: number, to: number } {
    const from = t.from + (t.close ? 2 : 1)
    return { from, to: from + t.name.length }
}

export const syncMatchingTag: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const sel = state.selection.main
    const text = state.sliceDoc()
    const here = tagAt(text, sel.empty ? sel.head : sel.from)
    if (!here) return false
    const pair = nestPairs(text).find(p =>
        (p.open.from === here.from && p.open.to === here.to)
        || (p.close.from === here.from && p.close.to === here.to))
    if (!pair) return false
    const other = pair.open.from === here.from ? pair.close : pair.open
    if (other.name === here.name) return false
    const span = tagNameSpan(other)
    dispatch(state.update({
        changes: { from: span.from, to: span.to, insert: here.name },
        userEvent: 'input',
        scrollIntoView: true,
    }))
    return true
}

export const selectAroundTag: StateCommand = ({ state, dispatch }) => {
    const sel = state.selection.main
    const hit = findTagPair(state.sliceDoc(), sel.empty ? sel.head : sel.from)
    if (!hit) return false
    if (sel.from === hit.from && sel.to === hit.to) return false
    dispatch(state.update({
        selection: EditorSelection.range(hit.from, hit.to),
        scrollIntoView: true,
        userEvent: 'select',
    }))
    return true
}

// —— 配对标签高亮(Monaco documentHighlight ← vscode-html-languageservice findDocumentHighlights)——
// 光标在某个标签名里(含两端:`<|div`、`div|>` 都算)→ 开标签名和闭标签名两处都高亮(DocumentHighlightKind.Read,
// 画成 wordHighlight);没有闭标签(空元素、没写完)就只高亮自己这一处。光标不在标签名里 → null,调用方退回文本同词。
const pairCache = new WeakMap<object, { open: TagHit, close: TagHit }[]>()
const NAME_CHAR = /[\w:.-]/

export function tagNameHighlight(state: EditorState): { from: number, to: number }[] | null {
    const sel = state.selection.main
    if (!sel.empty) return null
    const pos = sel.head
    const line = state.doc.lineAt(pos)
    const col = pos - line.from
    // 便宜的预检:光标左边紧挨着 `<` 或 `</` 加名字字符;不是就不用扫全文
    const before = line.text.slice(0, col)
    const m = /<(\/?)([\w:.-]*)$/.exec(before)
    if (!m) return null
    let end = col
    while (end < line.text.length && NAME_CHAR.test(line.text[end])) end++
    const nameFrom = line.from + col - m[2].length
    const nameTo = line.from + end
    if (nameTo === nameFrom) return null
    const tagFrom = nameFrom - 1 - m[1].length
    const text = state.sliceDoc(0, state.doc.length)
    let pairs = pairCache.get(state.doc)
    if (!pairs) { pairs = tagPairs(text); pairCache.set(state.doc, pairs) }
    const nameRange = (t: TagHit) => ({ from: t.from + (t.close ? 2 : 1), to: t.from + (t.close ? 2 : 1) + t.name.length })
    for (const p of pairs) {
        if (p.open.from === tagFrom || p.close.from === tagFrom) return [nameRange(p.open), nameRange(p.close)]
    }
    return [{ from: nameFrom, to: nameTo }]
}
