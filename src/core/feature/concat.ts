// "a" + x + "b" → `a${x}b`。词法扫，不解析源码。

import type { StateCommand } from '../model/state'
import { findQuotedAt } from './quotes'

function skipWs(s: string, i: number, dir: 1 | -1): number {
    while (i >= 0 && i < s.length && (s[i] === ' ' || s[i] === '\t')) i += dir
    return i
}

function isIdentStart(ch: string): boolean {
    const o = ch.charCodeAt(0)
    return (o >= 65 && o <= 90) || (o >= 97 && o <= 122) || o === 95 || o === 36
}

function isIdentChar(ch: string): boolean {
    const o = ch.charCodeAt(0)
    return isIdentStart(ch) || (o >= 48 && o <= 57)
}

function readExpr(text: string, i: number): { from: number, to: number, kind: 'str' | 'expr' } | null {
    i = skipWs(text, i, 1)
    if (i >= text.length) return null
    if (text[i] === "'" || text[i] === '"') {
        const q = findQuotedAt(text, i + 1) ?? findQuotedAt(text, i)
        if (!q || q.from !== i) return null
        return { from: q.from, to: q.to, kind: 'str' }
    }
    if (!isIdentStart(text[i])) return null
    const from = i
    i++
    while (i < text.length && isIdentChar(text[i])) i++
    while (text[i] === '.') {
        if (!isIdentStart(text[i + 1] ?? '')) break
        i++
        while (i < text.length && isIdentChar(text[i])) i++
    }
    return { from, to: i, kind: 'expr' }
}

function readExprBack(text: string, end: number): { from: number, to: number, kind: 'str' | 'expr' } | null {
    let i = skipWs(text, end - 1, -1)
    if (i < 0) return null
    if (text[i] === "'" || text[i] === '"') {
        const q = findQuotedAt(text, i)
        if (!q || q.to - 1 !== i) return null
        return { from: q.from, to: q.to, kind: 'str' }
    }
    if (!isIdentChar(text[i])) return null
    let to = i + 1
    while (i >= 0 && isIdentChar(text[i])) i--
    while (i >= 0 && text[i] === '.') {
        i--
        while (i >= 0 && isIdentChar(text[i])) i--
    }
    const from = i + 1
    if (!isIdentStart(text[from])) return null
    return { from, to, kind: 'expr' }
}

export function concatToTemplate(text: string, pos: number): { from: number, to: number, insert: string } | null {
    let cur = readExpr(text, pos) ?? readExprBack(text, pos)
    if (!cur) {
        const q = findQuotedAt(text, pos)
        if (q) cur = { from: q.from, to: q.to, kind: 'str' }
    }
    if (!cur) return null
    const parts = [cur]
    let left = cur.from
    for (;;) {
        const i = skipWs(text, left - 1, -1)
        if (i < 0 || text[i] !== '+') break
        const prev = readExprBack(text, i)
        if (!prev) break
        parts.unshift(prev)
        left = prev.from
    }
    let right = cur.to
    for (;;) {
        const i = skipWs(text, right, 1)
        if (i >= text.length || text[i] !== '+') break
        const next = readExpr(text, i + 1)
        if (!next) break
        parts.push(next)
        right = next.to
    }
    if (parts.length < 2) return null
    if (!parts.some(p => p.kind === 'str')) return null
    let inner = ''
    for (const p of parts) {
        if (p.kind === 'str') inner += text.slice(p.from + 1, p.to - 1)
        else inner += '${' + text.slice(p.from, p.to) + '}'
    }
    return { from: parts[0].from, to: parts[parts.length - 1].to, insert: '`' + inner + '`' }
}

export const convertConcatToTemplate: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const hit = concatToTemplate(state.sliceDoc(), state.selection.main.head)
    if (!hit) return false
    dispatch(state.update({
        changes: { from: hit.from, to: hit.to, insert: hit.insert },
        userEvent: 'input',
        scrollIntoView: true,
    }))
    return true
}

function matchBrace(s: string, open: number): number {
    if (s[open] !== '{') return -1
    let d = 0
    for (let i = open; i < s.length; i++) {
        if (s[i] === '{') d++
        else if (s[i] === '}') {
            d--
            if (d === 0) return i
        }
    }
    return -1
}

function findTemplateAt(text: string, pos: number): { from: number, to: number } | null {
    let i = 0
    while (i < text.length) {
        if (text[i] !== '`') { i++; continue }
        let j = i + 1
        let d = 0
        while (j < text.length) {
            if (text[j] === '\\') { j += 2; continue }
            if (d === 0 && text[j] === '`') {
                if (pos >= i && pos <= j) return { from: i, to: j + 1 }
                i = j + 1
                break
            }
            if (text[j] === '$' && text[j + 1] === '{') { d++; j += 2; continue }
            if (text[j] === '}' && d > 0) { d--; j++; continue }
            j++
        }
        if (j >= text.length) break
    }
    return null
}

function escapeDq(s: string): string {
    let out = ''
    for (let i = 0; i < s.length; i++) {
        if (s[i] === '\\' || s[i] === '"') out += '\\'
        out += s[i]
    }
    return out
}

export function templateToConcat(text: string, pos: number): { from: number, to: number, insert: string } | null {
    const t = findTemplateAt(text, pos)
    if (!t) return null
    const inner = text.slice(t.from + 1, t.to - 1)
    const bits: string[] = []
    let i = 0
    let lit = ''
    let sawExpr = false
    while (i < inner.length) {
        if (inner[i] === '\\') {
            lit += inner[i] + (inner[i + 1] ?? '')
            i += 2
            continue
        }
        if (inner[i] === '$' && inner[i + 1] === '{') {
            if (lit) bits.push('"' + escapeDq(lit) + '"')
            lit = ''
            const close = matchBrace(inner, i + 1)
            if (close < 0) return null
            const expr = inner.slice(i + 2, close).trim()
            if (!expr) return null
            bits.push(expr)
            sawExpr = true
            i = close + 1
            continue
        }
        lit += inner[i]
        i++
    }
    if (lit) bits.push('"' + escapeDq(lit) + '"')
    if (!sawExpr || !bits.length) return null
    return { from: t.from, to: t.to, insert: bits.join(' + ') }
}

export const convertTemplateToConcat: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const hit = templateToConcat(state.sliceDoc(), state.selection.main.head)
    if (!hit) return false
    dispatch(state.update({
        changes: { from: hit.from, to: hit.to, insert: hit.insert },
        userEvent: 'input',
        scrollIntoView: true,
    }))
    return true
}
