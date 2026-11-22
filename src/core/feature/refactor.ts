// 小重构：if→三元、function→箭头、调用参数拆行。词法扫。

import { findQuotedAt } from './quotes'

function skipWs(s: string, i: number): number {
    while (i < s.length && (s[i] === ' ' || s[i] === '\t')) i++
    return i
}

function startsWord(s: string, i: number, w: string): boolean {
    for (let k = 0; k < w.length; k++)
        if (s[i + k] !== w[k]) return false
    const a = s[i + w.length]
    if (a && ((a >= 'A' && a <= 'Z') || (a >= 'a' && a <= 'z') || a === '_' || (a >= '0' && a <= '9')))
        return false
    return true
}

function matchParen(s: string, open: number): number {
    if (s[open] !== '(') return -1
    let d = 0
    for (let i = open; i < s.length; i++) {
        if (s[i] === '(') d++
        else if (s[i] === ')') {
            d--
            if (d === 0) return i
        }
    }
    return -1
}

export function ifToTernaryLine(line: string): string | null {
    let i = skipWs(line, 0)
    const indent = line.slice(0, i)
    if (!startsWord(line, i, 'if')) return null
    while (i < line.length && line[i] !== '(') i++
    const close = matchParen(line, i)
    if (close < 0) return null
    const cond = line.slice(i + 1, close).trim()
    i = skipWs(line, close + 1)
    if (!startsWord(line, i, 'return')) return null
    i += 6
    i = skipWs(line, i)
    const aFrom = i
    while (i < line.length && line[i] !== ';' && !(line[i] === 'e' && startsWord(line, i, 'else'))) i++
    const a = line.slice(aFrom, i).trim()
    if (!a) return null
    if (line[i] === ';') i++
    i = skipWs(line, i)
    if (!startsWord(line, i, 'else')) return null
    i += 4
    i = skipWs(line, i)
    if (!startsWord(line, i, 'return')) return null
    i += 6
    i = skipWs(line, i)
    let b = line.slice(i).trim()
    if (b.endsWith(';')) b = b.slice(0, -1).trim()
    if (!b) return null
    return `${indent}return ${cond} ? ${a} : ${b}`
}

export function functionToArrowLine(line: string): string | null {
    let i = skipWs(line, 0)
    const indent = line.slice(0, i)
    if (!startsWord(line, i, 'function')) return null
    i = skipWs(line, i + 8)
    if (i >= line.length) return null
    const ch = line[i]
    if (!((ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || ch === '_' || ch === '$')) return null
    const nameFrom = i
    while (i < line.length && ((line[i] >= 'A' && line[i] <= 'Z') || (line[i] >= 'a' && line[i] <= 'z') || line[i] === '_' || line[i] === '$' || (line[i] >= '0' && line[i] <= '9')))
        i++
    const name = line.slice(nameFrom, i)
    i = skipWs(line, i)
    if (line[i] !== '(') return null
    const close = matchParen(line, i)
    if (close < 0) return null
    const params = line.slice(i, close + 1)
    i = skipWs(line, close + 1)
    if (line[i] !== '{') return null
    let j = line.length - 1
    while (j > i && (line[j] === ' ' || line[j] === '\t')) j--
    if (line[j] !== '}') return null
    const body = line.slice(i + 1, j).trim()
    if (!startsWord(body, 0, 'return')) return null
    let expr = body.slice(6).trim()
    if (expr.endsWith(';')) expr = expr.slice(0, -1).trim()
    if (!expr || expr.includes(';')) return null
    return `${indent}const ${name} = ${params} => ${expr}`
}

function callParenAt(text: string, pos: number): { from: number, to: number } | null {
    let best: { from: number, to: number } | null = null
    for (let i = 0; i < text.length; i++) {
        if (text[i] !== '(') continue
        const prev = i > 0 ? text[i - 1] : ''
        const isCall = (prev >= 'A' && prev <= 'Z') || (prev >= 'a' && prev <= 'z') || prev === '_' || prev === '$' || prev === ')'
        if (!isCall) continue
        const close = matchParen(text, i)
        if (close < 0) continue
        if (pos >= i && pos <= close) {
            if (!best || close - i < best.to - best.from)
                best = { from: i, to: close + 1 }
        }
    }
    return best
}

function topCommas(inner: string): number[] {
    const out: number[] = []
    let d = 0
    let inQ = ''
    for (let i = 0; i < inner.length; i++) {
        if (inQ) {
            if (inner[i] === '\\') { i++; continue }
            if (inner[i] === inQ) inQ = ''
            continue
        }
        if (inner[i] === "'" || inner[i] === '"') { inQ = inner[i]; continue }
        if (inner[i] === '(' || inner[i] === '[' || inner[i] === '{') d++
        else if (inner[i] === ')' || inner[i] === ']' || inner[i] === '}') d--
        else if (inner[i] === ',' && d === 0) out.push(i)
    }
    return out
}

export function splitCallArgsAt(text: string, pos: number): { from: number, to: number, insert: string } | null {
    const call = callParenAt(text, pos)
    if (!call) return null
    const inner = text.slice(call.from + 1, call.to - 1)
    if (!inner.trim() || inner.indexOf('\n') >= 0) return null
    const commas = topCommas(inner)
    if (!commas.length) return null
    const parts: string[] = []
    let start = 0
    for (const c of commas) {
        parts.push(inner.slice(start, c).trim())
        start = c + 1
    }
    parts.push(inner.slice(start).trim())
    if (parts.some(p => !p)) return null
    return { from: call.from, to: call.to, insert: '(\n  ' + parts.join(',\n  ') + '\n)' }
}

export function joinCallArgsAt(text: string, pos: number): { from: number, to: number, insert: string } | null {
    const call = callParenAt(text, pos)
    if (!call) return null
    const inner = text.slice(call.from + 1, call.to - 1)
    if (inner.indexOf('\n') < 0) return null
    const commas = topCommas(inner)
    const parts: string[] = []
    let start = 0
    const cuts = commas.concat(inner.length)
    for (const c of cuts) {
        const p = inner.slice(start, c).trim()
        if (p) parts.push(p)
        start = c + 1
    }
    if (parts.length < 2) return null
    return { from: call.from, to: call.to, insert: '(' + parts.join(', ') + ')' }
}

function splitTernary(s: string): { cond: string, a: string, b: string } | null {
    let d = 0
    let inQ = ''
    let q = -1
    let nest = 0
    let colon = -1
    for (let i = 0; i < s.length; i++) {
        if (inQ) {
            if (s[i] === '\\') { i++; continue }
            if (s[i] === inQ) inQ = ''
            continue
        }
        if (s[i] === "'" || s[i] === '"' || s[i] === '`') { inQ = s[i]; continue }
        if (s[i] === '(' || s[i] === '[' || s[i] === '{') d++
        else if (s[i] === ')' || s[i] === ']' || s[i] === '}') d--
        else if (d === 0 && s[i] === '?') {
            if (q < 0) q = i
            else nest++
        }
        else if (d === 0 && s[i] === ':' && q >= 0) {
            if (nest > 0) nest--
            else { colon = i; break }
        }
    }
    if (q < 0 || colon < 0) return null
    const cond = s.slice(0, q).trim()
    const a = s.slice(q + 1, colon).trim()
    const b = s.slice(colon + 1).trim()
    if (!cond || !a || !b) return null
    return { cond, a, b }
}

export function unwrapTernaryLine(line: string): string | null {
    let i = skipWs(line, 0)
    const indent = line.slice(0, i)
    if (!startsWord(line, i, 'return')) return null
    i = skipWs(line, i + 6)
    let rest = line.slice(i).trim()
    if (rest.endsWith(';')) rest = rest.slice(0, -1).trim()
    const parts = splitTernary(rest)
    if (!parts) return null
    return `${indent}if (${parts.cond}) return ${parts.a}; else return ${parts.b}`
}

function isIdentChar(ch: string): boolean {
    return (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || ch === '_' || ch === '$' || (ch >= '0' && ch <= '9')
}

export function toggleBooleanAt(text: string, pos: number): { from: number, to: number, insert: string } | null {
    if (!text.length) return null
    let i = pos
    if (i >= text.length) i = text.length - 1
    if (i < 0) return null
    if (!isIdentChar(text[i])) {
        if (i > 0 && isIdentChar(text[i - 1])) i--
        else return null
    }
    let from = i
    while (from > 0 && isIdentChar(text[from - 1])) from--
    let to = from
    while (to < text.length && isIdentChar(text[to])) to++
    const w = text.slice(from, to)
    if (w === 'true') return { from, to, insert: 'false' }
    if (w === 'false') return { from, to, insert: 'true' }
    return null
}

export function promoteBindingLine(line: string): string | null {
    let i = skipWs(line, 0)
    if (startsWord(line, i, 'var')) return line.slice(0, i) + 'let' + line.slice(i + 3)
    if (startsWord(line, i, 'let')) return line.slice(0, i) + 'const' + line.slice(i + 3)
    return null
}

const CMP_OPS = ['===', '!==', '==', '!=', '<=', '>=', '<', '>'] as const
const CMP_FLIP: Record<string, string> = {
    '===': '!==',
    '!==': '===',
    '==': '!=',
    '!=': '==',
    '<=': '>',
    '>=': '<',
    '<': '>=',
    '>': '<=',
}

export function invertComparisonAt(text: string, pos: number): { from: number, to: number, insert: string } | null {
    const lo = Math.max(0, pos - 3)
    const hi = Math.min(text.length, pos + 1)
    let best: { from: number, to: number, insert: string } | null = null
    for (let i = lo; i < hi; i++) {
        for (const op of CMP_OPS) {
            if (i + op.length > text.length) continue
            if (text.slice(i, i + op.length) !== op) continue
            if (pos < i || pos > i + op.length) continue
            if (op === '>' && i > 0 && text[i - 1] === '=') continue
            if (op === '<' && text[i + 1] === '/') continue
            if (!best || op.length > best.to - best.from)
                best = { from: i, to: i + op.length, insert: CMP_FLIP[op] }
        }
    }
    return best
}

function isIdentStart(ch: string): boolean {
    return (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || ch === '_' || ch === '$'
}

function isIdent(s: string): boolean {
    if (!s.length || !isIdentStart(s[0])) return false
    for (let i = 1; i < s.length; i++)
        if (!isIdentChar(s[i])) return false
    return true
}

function matchPair(s: string, open: number, openCh: string, closeCh: string): number {
    if (s[open] !== openCh) return -1
    let d = 0
    let inQ = ''
    for (let i = open; i < s.length; i++) {
        if (inQ) {
            if (s[i] === '\\') { i++; continue }
            if (s[i] === inQ) inQ = ''
            continue
        }
        if (s[i] === "'" || s[i] === '"' || s[i] === '`') { inQ = s[i]; continue }
        if (s[i] === openCh) d++
        else if (s[i] === closeCh) {
            d--
            if (d === 0) return i
        }
    }
    return -1
}

function findArrow(s: string): number {
    let inQ = ''
    for (let i = 0; i < s.length; i++) {
        if (inQ) {
            if (s[i] === '\\') { i++; continue }
            if (s[i] === inQ) inQ = ''
            continue
        }
        if (s[i] === "'" || s[i] === '"' || s[i] === '`') { inQ = s[i]; continue }
        if (s[i] === '=' && s[i + 1] === '>') return i
    }
    return -1
}

function findWordAtDepth0(s: string, from: number, w: string): number {
    let d = 0
    let inQ = ''
    for (let i = from; i < s.length; i++) {
        if (inQ) {
            if (s[i] === '\\') { i++; continue }
            if (s[i] === inQ) inQ = ''
            continue
        }
        if (s[i] === "'" || s[i] === '"' || s[i] === '`') { inQ = s[i]; continue }
        if (s[i] === '(' || s[i] === '[' || s[i] === '{') d++
        else if (s[i] === ')' || s[i] === ']' || s[i] === '}') d--
        else if (d === 0 && startsWord(s, i, w)) return i
    }
    return -1
}

export function arrowToFunctionLine(line: string): string | null {
    let i = skipWs(line, 0)
    const indent = line.slice(0, i)
    let exp = ''
    if (startsWord(line, i, 'export')) {
        exp = 'export '
        i = skipWs(line, i + 6)
    }
    if (startsWord(line, i, 'const')) i = skipWs(line, i + 5)
    else if (startsWord(line, i, 'let')) i = skipWs(line, i + 3)
    else return null
    if (i >= line.length || !isIdentStart(line[i])) return null
    const nameFrom = i
    while (i < line.length && isIdentChar(line[i])) i++
    const name = line.slice(nameFrom, i)
    i = skipWs(line, i)
    if (line[i] !== '=') return null
    i = skipWs(line, i + 1)
    let asyncP = ''
    if (startsWord(line, i, 'async')) {
        asyncP = 'async '
        i = skipWs(line, i + 5)
    }
    let params: string
    if (line[i] === '(') {
        const close = matchParen(line, i)
        if (close < 0) return null
        params = line.slice(i, close + 1)
        i = skipWs(line, close + 1)
    }
    else if (i < line.length && isIdentStart(line[i])) {
        const pFrom = i
        while (i < line.length && isIdentChar(line[i])) i++
        params = '(' + line.slice(pFrom, i) + ')'
        i = skipWs(line, i)
    }
    else return null
    if (line[i] !== '=' || line[i + 1] !== '>') return null
    i = skipWs(line, i + 2)
    if (line[i] === '{') {
        const close = matchPair(line, i, '{', '}')
        if (close < 0) return null
        return `${indent}${exp}${asyncP}function ${name}${params} ${line.slice(i, close + 1)}`
    }
    let expr = line.slice(i).trim()
    if (expr.endsWith(';')) expr = expr.slice(0, -1).trim()
    if (!expr) return null
    return `${indent}${exp}${asyncP}function ${name}${params} { return ${expr} }`
}

export function toggleArrowBracesLine(line: string): string | null {
    const arrow = findArrow(line)
    if (arrow < 0) return null
    const after = skipWs(line, arrow + 2)
    let j = line.length
    while (j > after && (line[j - 1] === ' ' || line[j - 1] === '\t')) j--
    let semi = ''
    if (j > after && line[j - 1] === ';') {
        semi = ';'
        j--
        while (j > after && (line[j - 1] === ' ' || line[j - 1] === '\t')) j--
    }
    const body = line.slice(after, j)
    if (!body) return null
    const suffix = line.slice(j + (semi ? 1 : 0))
    if (body[0] === '{') {
        const close = matchPair(body, 0, '{', '}')
        if (close !== body.length - 1) return null
        const inner = body.slice(1, close).trim()
        if (!startsWord(inner, 0, 'return')) return null
        let expr = inner.slice(6).trim()
        if (expr.endsWith(';')) expr = expr.slice(0, -1).trim()
        if (!expr || expr.includes(';')) return null
        if (expr[0] === '{') expr = `(${expr})`
        return line.slice(0, after) + expr + semi + suffix
    }
    return line.slice(0, after) + '{ return ' + body + ' }' + semi + suffix
}

export function extractConstantEdit(doc: string, from: number, to: number, lineBreak = '\n'): { from: number, to: number, insert: string } | null {
    if (from >= to) return null
    const trimmed = doc.slice(from, to).trim()
    if (!trimmed || trimmed === '_') return null
    let lineFrom = 0
    for (let i = from - 1; i >= 0; i--) {
        if (doc[i] === '\n') { lineFrom = i + 1; break }
    }
    let indentEnd = lineFrom
    while (indentEnd < from && (doc[indentEnd] === ' ' || doc[indentEnd] === '\t')) indentEnd++
    const indent = doc.slice(lineFrom, indentEnd)
    const prefix = doc.slice(lineFrom, from)
    return { from: lineFrom, to, insert: `${indent}const _ = ${trimmed}${lineBreak}${prefix}_` }
}

export function flipIfElseLine(line: string): string | null {
    let i = skipWs(line, 0)
    const indent = line.slice(0, i)
    if (!startsWord(line, i, 'if')) return null
    while (i < line.length && line[i] !== '(') i++
    if (line[i] !== '(') return null
    const close = matchParen(line, i)
    if (close < 0) return null
    const cond = line.slice(i + 1, close).trim()
    i = skipWs(line, close + 1)
    if (line[i] === '{') return null
    const thenFrom = i
    const elseAt = findWordAtDepth0(line, i, 'else')
    if (elseAt < 0) return null
    let then = line.slice(thenFrom, elseAt).trim()
    if (then.endsWith(';')) then = then.slice(0, -1).trim()
    if (!then || then[0] === '{') return null
    i = skipWs(line, elseAt + 4)
    if (line[i] === '{') return null
    let els = line.slice(i).trim()
    if (els.endsWith(';')) els = els.slice(0, -1).trim()
    if (!els) return null
    return `${indent}if (${cond}) ${els}; else ${then}`
}

function negateCond(cond: string): string {
    const c = cond.trim()
    if (c[0] === '!' && c[1] === '(') {
        const m = matchParen(c, 1)
        if (m === c.length - 1) return c.slice(2, m).trim()
    }
    if (c[0] === '!' && isIdent(c.slice(1))) return c.slice(1)
    if (isIdent(c)) return '!' + c
    return `!(${c})`
}

export function negateIfLine(line: string): string | null {
    let i = skipWs(line, 0)
    const indent = line.slice(0, i)
    if (!startsWord(line, i, 'if')) return null
    while (i < line.length && line[i] !== '(') i++
    if (line[i] !== '(') return null
    const close = matchParen(line, i)
    if (close < 0) return null
    const cond = line.slice(i + 1, close).trim()
    if (!cond) return null
    const next = negateCond(cond)
    return indent + line.slice(indent.length, i + 1) + next + line.slice(close)
}

function objectBraceAt(text: string, pos: number): { from: number, to: number } | null {
    let best: { from: number, to: number } | null = null
    let inQ = ''
    for (let i = 0; i < text.length; i++) {
        if (inQ) {
            if (text[i] === '\\') { i++; continue }
            if (text[i] === inQ) inQ = ''
            continue
        }
        if (text[i] === "'" || text[i] === '"' || text[i] === '`') { inQ = text[i]; continue }
        if (text[i] !== '{') continue
        const close = matchPair(text, i, '{', '}')
        if (close < 0) continue
        if (pos >= i && pos <= close) {
            if (!best || close - i < best.to - best.from)
                best = { from: i, to: close + 1 }
        }
    }
    return best
}

function collapseProp(part: string): string | null {
    let i = skipWs(part, 0)
    if (i >= part.length || (part[i] === '.' && part[i + 1] === '.')) return null
    if (!isIdentStart(part[i])) return null
    const kFrom = i
    while (i < part.length && isIdentChar(part[i])) i++
    const key = part.slice(kFrom, i)
    i = skipWs(part, i)
    if (part[i] !== ':') return null
    i = skipWs(part, i + 1)
    if (i >= part.length || !isIdentStart(part[i])) return null
    const vFrom = i
    while (i < part.length && isIdentChar(part[i])) i++
    const val = part.slice(vFrom, i)
    if (val !== key) return null
    i = skipWs(part, i)
    if (i < part.length) return null
    return part.slice(0, kFrom) + key + part.slice(vFrom + val.length)
}

function expandProp(part: string): string | null {
    let i = skipWs(part, 0)
    if (i >= part.length || (part[i] === '.' && part[i + 1] === '.')) return null
    if (!isIdentStart(part[i])) return null
    const kFrom = i
    while (i < part.length && isIdentChar(part[i])) i++
    const key = part.slice(kFrom, i)
    i = skipWs(part, i)
    if (i < part.length) return null
    return part.slice(0, kFrom) + key + ': ' + key + part.slice(kFrom + key.length)
}

export function toggleObjectShorthandAt(text: string, pos: number): { from: number, to: number, insert: string } | null {
    const obj = objectBraceAt(text, pos)
    if (!obj) return null
    const inner = text.slice(obj.from + 1, obj.to - 1)
    const commas = topCommas(inner)
    const parts: string[] = []
    let start = 0
    const cuts = commas.concat(inner.length)
    for (const c of cuts) {
        parts.push(inner.slice(start, c))
        start = c + 1
    }
    let changed = false
    let didCollapse = false
    const collapsed = parts.map(p => {
        const r = collapseProp(p)
        if (r != null) { didCollapse = true; changed = true; return r }
        return p
    })
    const next = didCollapse ? collapsed : parts.map(p => {
        const r = expandProp(p)
        if (r != null) { changed = true; return r }
        return p
    })
    if (!changed) return null
    return { from: obj.from, to: obj.to, insert: '{' + next.join(',') + '}' }
}

function skipWsBack(s: string, i: number): number {
    while (i > 0 && (s[i - 1] === ' ' || s[i - 1] === '\t')) i--
    return i
}

function matchPairBack(s: string, close: number): number {
    const closeCh = s[close]
    const openCh = closeCh === ')' ? '(' : closeCh === ']' ? '[' : closeCh === '}' ? '{' : ''
    if (!openCh) return -1
    let d = 0
    for (let i = close; i >= 0; i--) {
        if (s[i] === closeCh) d++
        else if (s[i] === openCh) {
            d--
            if (d === 0) return i
        }
    }
    return -1
}

function stringEnd(s: string, open: number): number {
    const q = s[open]
    for (let i = open + 1; i < s.length; i++) {
        if (s[i] === '\\') { i++; continue }
        if (s[i] === q) return i + 1
    }
    return -1
}

function stringStartBack(s: string, close: number): number {
    const q = s[close]
    for (let i = close - 1; i >= 0; i--) {
        if (s[i] === q) {
            let bs = 0
            let j = i - 1
            while (j >= 0 && s[j] === '\\') { bs++; j-- }
            if (bs % 2 === 0) return i
        }
    }
    return -1
}

function operandLeft(s: string, end: number): { from: number, to: number } | null {
    const i = skipWsBack(s, end)
    if (i <= 0) return null
    const ch = s[i - 1]
    if (ch === ')' || ch === ']' || ch === '}') {
        const open = matchPairBack(s, i - 1)
        if (open < 0) return null
        let from = open
        if (from > 0 && isIdentChar(s[from - 1])) {
            from--
            while (from > 0 && isIdentChar(s[from - 1])) from--
        }
        return { from, to: i }
    }
    if (ch === '"' || ch === "'" || ch === '`') {
        const from = stringStartBack(s, i - 1)
        if (from < 0) return null
        return { from, to: i }
    }
    if (isIdentChar(ch)) {
        let from = i
        while (from > 0 && (isIdentChar(s[from - 1]) || s[from - 1] === '.')) from--
        if (s[from] === '.') from++
        return { from, to: i }
    }
    return null
}

function operandRight(s: string, start: number): { from: number, to: number } | null {
    const i0 = skipWs(s, start)
    if (i0 >= s.length) return null
    let i = i0
    if (s[i] === '!' || s[i] === '~') {
        const inner = operandRight(s, i + 1)
        if (!inner) return null
        return { from: i, to: inner.to }
    }
    if (s[i] === '(' || s[i] === '[' || s[i] === '{') {
        const closeCh = s[i] === '(' ? ')' : s[i] === '[' ? ']' : '}'
        const close = matchPair(s, i, s[i], closeCh)
        if (close < 0) return null
        return { from: i, to: close + 1 }
    }
    if (s[i] === '"' || s[i] === "'" || s[i] === '`') {
        const to = stringEnd(s, i)
        if (to < 0) return null
        return { from: i, to }
    }
    if (isIdentStart(s[i]) || (s[i] >= '0' && s[i] <= '9')) {
        let to = i
        while (to < s.length && (isIdentChar(s[to]) || s[to] === '.')) to++
        while (to < s.length && (s[to] === '(' || s[to] === '[')) {
            const closeCh = s[to] === '(' ? ')' : ']'
            const close = matchPair(s, to, s[to], closeCh)
            if (close < 0) break
            to = close + 1
        }
        return { from: i, to }
    }
    return null
}

const BIN_OPS = ['===', '!==', '==', '!=', '<=', '>=', '&&', '||', '??', '<<', '>>', '<', '>', '+', '-', '*', '/', '%']

export function swapOperandsAt(text: string, pos: number): { from: number, to: number, insert: string, head: number } | null {
    const lo = Math.max(0, pos - 3)
    const hi = Math.min(text.length, pos + 1)
    let best: { from: number, to: number } | null = null
    for (let i = lo; i < hi; i++) {
        for (const op of BIN_OPS) {
            if (text.slice(i, i + op.length) !== op) continue
            if (pos < i || pos > i + op.length) continue
            if (op === '>' && i > 0 && text[i - 1] === '=') continue
            if ((op === '+' || op === '-' || op === '*' || op === '/' || op === '%') && text[i + 1] === '=') continue
            if ((op === '+' || op === '-') && i > 0 && text[i - 1] === op) continue
            if (!best || op.length > best.to - best.from)
                best = { from: i, to: i + op.length }
        }
    }
    if (!best) return null
    const left = operandLeft(text, best.from)
    const right = operandRight(text, best.to)
    if (!left || !right) return null
    const insert = text.slice(right.from, right.to) + text.slice(left.to, right.from) + text.slice(left.from, left.to)
    return {
        from: left.from,
        to: right.to,
        insert,
        head: left.from + (right.to - right.from) + (best.from - left.to),
    }
}

export function toggleMemberAccessAt(text: string, pos: number): { from: number, to: number, insert: string } | null {
    let i = pos
    if (i < text.length && text[i] === '.') {
        let to = i + 1
        if (to >= text.length || !isIdentStart(text[to])) return null
        while (to < text.length && isIdentChar(text[to])) to++
        return { from: i, to, insert: `['${text.slice(i + 1, to)}']` }
    }
    if (i < text.length && isIdentChar(text[i])) {
        let from = i
        while (from > 0 && isIdentChar(text[from - 1])) from--
        if (from > 0 && text[from - 1] === '.') {
            let to = from
            while (to < text.length && isIdentChar(text[to])) to++
            return { from: from - 1, to, insert: `['${text.slice(from, to)}']` }
        }
    }
    for (let k = Math.min(pos, text.length - 1); k >= 0; k--) {
        if (text[k] === '\n') break
        if (text[k] !== '[') continue
        const close = matchPair(text, k, '[', ']')
        if (close < 0 || pos > close) continue
        let a = k + 1
        let b = close
        while (a < b && (text[a] === ' ' || text[a] === '\t')) a++
        while (b > a && (text[b - 1] === ' ' || text[b - 1] === '\t')) b--
        const q = text[a]
        if ((q !== "'" && q !== '"') || text[b - 1] !== q) return null
        const name = text.slice(a + 1, b - 1)
        if (!isIdent(name)) return null
        return { from: k, to: close + 1, insert: '.' + name }
    }
    return null
}

function looksLikeObject(inner: string): boolean {
    const commas = topCommas(inner)
    const parts: string[] = []
    let start = 0
    const cuts = commas.concat(inner.length)
    for (const c of cuts) {
        parts.push(inner.slice(start, c))
        start = c + 1
    }
    let any = false
    for (const part of parts) {
        let i = 0
        while (i < part.length && (part[i] === ' ' || part[i] === '\t' || part[i] === '\n' || part[i] === '\r')) i++
        if (i >= part.length) continue
        any = true
        if (isIdentStart(part[i])) {
            while (i < part.length && isIdentChar(part[i])) i++
            while (i < part.length && (part[i] === ' ' || part[i] === '\t' || part[i] === '\n' || part[i] === '\r')) i++
            if (i >= part.length || part[i] === ':') continue
            return false
        }
        if (part[i] === "'" || part[i] === '"') {
            const end = stringEnd(part, i)
            if (end < 0) return false
            i = end
            while (i < part.length && (part[i] === ' ' || part[i] === '\t' || part[i] === '\n' || part[i] === '\r')) i++
            if (part[i] === ':') continue
            return false
        }
        return false
    }
    return any
}

function enclosingListAt(text: string, pos: number): { from: number, to: number } | null {
    let best: { from: number, to: number } | null = null
    let inQ = ''
    for (let i = 0; i < text.length; i++) {
        if (inQ) {
            if (text[i] === '\\') { i++; continue }
            if (text[i] === inQ) inQ = ''
            continue
        }
        if (text[i] === "'" || text[i] === '"' || text[i] === '`') { inQ = text[i]; continue }
        const open = text[i]
        const closeCh = open === '(' ? ')' : open === '[' ? ']' : open === '{' ? '}' : ''
        if (!closeCh) continue
        const close = matchPair(text, i, open, closeCh)
        if (close < 0) continue
        if (pos >= i && pos <= close) {
            if (!best || close - i < best.to - best.from)
                best = { from: i, to: close + 1 }
        }
    }
    return best
}

export function toggleTrailingCommaAt(text: string, pos: number): { from: number, to: number, insert: string } | null {
    const pair = enclosingListAt(text, pos)
    if (!pair) return null
    const openCh = text[pair.from]
    const inner = text.slice(pair.from + 1, pair.to - 1)
    if (openCh === '{' && !looksLikeObject(inner)) return null
    let j = inner.length
    while (j > 0 && (inner[j - 1] === ' ' || inner[j - 1] === '\t' || inner[j - 1] === '\n' || inner[j - 1] === '\r')) j--
    if (j === 0) return null
    const next = inner[j - 1] === ','
        ? inner.slice(0, j - 1) + inner.slice(j)
        : inner.slice(0, j) + ',' + inner.slice(j)
    return { from: pair.from, to: pair.to, insert: openCh + next + text[pair.to - 1] }
}

function parseDecl(line: string): { indent: string, exp: string, kind: string, rest: string } | null {
    let i = skipWs(line, 0)
    const indent = line.slice(0, i)
    let exp = ''
    if (startsWord(line, i, 'export')) {
        const after = skipWs(line, i + 6)
        exp = line.slice(i, after)
        i = after
    }
    let kind = ''
    if (startsWord(line, i, 'const')) { kind = 'const'; i += 5 }
    else if (startsWord(line, i, 'let')) { kind = 'let'; i += 3 }
    else if (startsWord(line, i, 'var')) { kind = 'var'; i += 3 }
    else return null
    i = skipWs(line, i)
    const rest = line.slice(i)
    if (!rest) return null
    return { indent, exp, kind, rest }
}

export function splitDeclLine(line: string): string | null {
    const d = parseDecl(line)
    if (!d) return null
    const commas = topCommas(d.rest)
    if (!commas.length) return null
    const parts: string[] = []
    let start = 0
    const cuts = commas.concat(d.rest.length)
    for (const c of cuts) {
        const p = d.rest.slice(start, c).trim()
        if (!p) return null
        parts.push(p)
        start = c + 1
    }
    if (parts.length < 2) return null
    return parts.map(p => `${d.indent}${d.exp}${d.kind} ${p}`).join('\n')
}

export function joinDeclLines(a: string, b: string): string | null {
    const da = parseDecl(a)
    const db = parseDecl(b)
    if (!da || !db || da.kind !== db.kind || da.exp !== db.exp) return null
    if (topCommas(db.rest).length) return null
    return `${da.indent}${da.exp}${da.kind} ${da.rest.trimEnd()}, ${db.rest}`
}

export function unwrapIfLine(line: string): string | null {
    let i = skipWs(line, 0)
    const indent = line.slice(0, i)
    if (!startsWord(line, i, 'if')) return null
    while (i < line.length && line[i] !== '(') i++
    if (line[i] !== '(') return null
    const close = matchParen(line, i)
    if (close < 0) return null
    i = skipWs(line, close + 1)
    if (findWordAtDepth0(line, i, 'else') >= 0) return null
    if (line[i] === '{') {
        const end = matchPair(line, i, '{', '}')
        if (end < 0) return null
        let after = skipWs(line, end + 1)
        if (line[after] === ';') after++
        after = skipWs(line, after)
        if (after < line.length) return null
        const inner = line.slice(i + 1, end).trim()
        if (!inner) return null
        return indent + inner
    }
    let body = line.slice(i).trim()
    if (body.endsWith(';')) body = body.slice(0, -1).trim() + ';'
    if (!body) return null
    return indent + body
}

export function toggleAsyncLine(line: string): string | null {
    let i = skipWs(line, 0)
    if (startsWord(line, i, 'export')) i = skipWs(line, i + 6)
    if (startsWord(line, i, 'async')) {
        const after = skipWs(line, i + 5)
        if (startsWord(line, after, 'function') || line[after] === '(' || (after < line.length && isIdentStart(line[after])))
            return line.slice(0, i) + line.slice(after)
        return null
    }
    if (startsWord(line, i, 'function'))
        return line.slice(0, i) + 'async ' + line.slice(i)
    const arrow = findArrow(line)
    if (arrow < 0) return null
    let p = skipWsBack(line, arrow)
    if (p > 0 && line[p - 1] === ')') {
        const open = matchPairBack(line, p - 1)
        if (open < 0) return null
        p = open
    }
    else if (p > 0 && isIdentChar(line[p - 1])) {
        while (p > 0 && isIdentChar(line[p - 1])) p--
    }
    else return null
    const q = skipWsBack(line, p)
    if (q >= 5 && startsWord(line, q - 5, 'async'))
        return line.slice(0, q - 5) + line.slice(p)
    return line.slice(0, p) + 'async ' + line.slice(p)
}

export function removeBracesLine(line: string): string | null {
    let i = skipWs(line, 0)
    if (startsWord(line, i, 'else')) {
        const after = skipWs(line, i + 4)
        if (startsWord(line, after, 'if')) i = after
        else i = after
    }
    if (startsWord(line, i, 'if') || startsWord(line, i, 'for') || startsWord(line, i, 'while')) {
        while (i < line.length && line[i] !== '(') i++
        if (line[i] !== '(') return null
        const close = matchParen(line, i)
        if (close < 0) return null
        i = skipWs(line, close + 1)
    }
    else if (!(i < line.length && line[i] === '{')) return null
    if (line[i] !== '{') return null
    const end = matchPair(line, i, '{', '}')
    if (end < 0) return null
    let after = skipWs(line, end + 1)
    if (line[after] === ';') after++
    after = skipWs(line, after)
    if (after < line.length) return null
    const inner = line.slice(i + 1, end).trim()
    if (!inner) return null
    let core = inner
    if (core.endsWith(';')) core = core.slice(0, -1).trim()
    if (core.includes(';')) return null
    return line.slice(0, i) + inner
}

function identAt(text: string, pos: number): { from: number, to: number, name: string } | null {
    if (!text.length) return null
    let i = pos
    if (i >= text.length) i = text.length - 1
    if (!isIdentChar(text[i])) {
        if (i > 0 && isIdentChar(text[i - 1])) i--
        else return null
    }
    let from = i
    while (from > 0 && isIdentChar(text[from - 1])) from--
    if (!isIdentStart(text[from])) return null
    let to = from
    while (to < text.length && isIdentChar(text[to])) to++
    return { from, to, name: text.slice(from, to) }
}

function parseBindingLine(line: string): { name: string, expr: string } | null {
    let i = skipWs(line, 0)
    if (startsWord(line, i, 'const')) i = skipWs(line, i + 5)
    else if (startsWord(line, i, 'let')) i = skipWs(line, i + 3)
    else if (startsWord(line, i, 'var')) i = skipWs(line, i + 3)
    else return null
    if (i >= line.length || !isIdentStart(line[i])) return null
    const nameFrom = i
    while (i < line.length && isIdentChar(line[i])) i++
    const name = line.slice(nameFrom, i)
    i = skipWs(line, i)
    if (line[i] !== '=') return null
    let expr = line.slice(i + 1).trim()
    if (expr.endsWith(';')) expr = expr.slice(0, -1).trim()
    if (!expr) return null
    return { name, expr }
}

export function inlineConstantEdit(doc: string, pos: number): { from: number, to: number, insert: string } | null {
    const id = identAt(doc, pos)
    if (!id) return null
    let lineFrom = 0
    for (let i = id.from - 1; i >= 0; i--) {
        if (doc[i] === '\n') { lineFrom = i + 1; break }
    }
    if (lineFrom === 0) return null
    const prevTo = lineFrom - 1
    let prevFrom = 0
    for (let i = prevTo - 1; i >= 0; i--) {
        if (doc[i] === '\n') { prevFrom = i + 1; break }
    }
    const prev = doc.slice(prevFrom, prevTo)
    const bind = parseBindingLine(prev)
    if (!bind || bind.name !== id.name) return null
    if (id.from >= prevFrom && id.from < prevTo) return null
    return { from: prevFrom, to: id.to, insert: doc.slice(lineFrom, id.from) + bind.expr }
}

const STRICT_OPS = ['===', '!==', '==', '!='] as const
const STRICT_FLIP: Record<string, string> = { '===': '==', '==': '===', '!==': '!=', '!=': '!==' }

export function toggleStrictEqAt(text: string, pos: number): { from: number, to: number, insert: string } | null {
    const lo = Math.max(0, pos - 3)
    const hi = Math.min(text.length, pos + 1)
    let best: { from: number, to: number, insert: string } | null = null
    for (let i = lo; i < hi; i++) {
        for (const op of STRICT_OPS) {
            if (text.slice(i, i + op.length) !== op) continue
            if (pos < i || pos > i + op.length) continue
            if (!best || op.length > best.to - best.from)
                best = { from: i, to: i + op.length, insert: STRICT_FLIP[op] }
        }
    }
    return best
}

function arrayBracketAt(text: string, pos: number): { from: number, to: number } | null {
    let best: { from: number, to: number } | null = null
    let inQ = ''
    for (let i = 0; i < text.length; i++) {
        if (inQ) {
            if (text[i] === '\\') { i++; continue }
            if (text[i] === inQ) inQ = ''
            continue
        }
        if (text[i] === "'" || text[i] === '"' || text[i] === '`') { inQ = text[i]; continue }
        if (text[i] !== '[') continue
        const close = matchPair(text, i, '[', ']')
        if (close < 0) continue
        if (pos >= i && pos <= close) {
            if (!best || close - i < best.to - best.from)
                best = { from: i, to: close + 1 }
        }
    }
    return best
}

export function splitArrayAt(text: string, pos: number): { from: number, to: number, insert: string } | null {
    const arr = arrayBracketAt(text, pos)
    if (!arr) return null
    const inner = text.slice(arr.from + 1, arr.to - 1)
    if (!inner.trim() || inner.indexOf('\n') >= 0) return null
    const commas = topCommas(inner)
    if (!commas.length) return null
    const parts: string[] = []
    let start = 0
    for (const c of commas) {
        parts.push(inner.slice(start, c).trim())
        start = c + 1
    }
    parts.push(inner.slice(start).trim())
    if (parts.some(p => !p)) return null
    return { from: arr.from, to: arr.to, insert: '[\n  ' + parts.join(',\n  ') + '\n]' }
}

export function joinArrayAt(text: string, pos: number): { from: number, to: number, insert: string } | null {
    const arr = arrayBracketAt(text, pos)
    if (!arr) return null
    const inner = text.slice(arr.from + 1, arr.to - 1)
    if (inner.indexOf('\n') < 0) return null
    const commas = topCommas(inner)
    const parts: string[] = []
    let start = 0
    const cuts = commas.concat(inner.length)
    for (const c of cuts) {
        const p = inner.slice(start, c).trim()
        if (p) parts.push(p)
        start = c + 1
    }
    if (parts.length < 2) return null
    return { from: arr.from, to: arr.to, insert: '[' + parts.join(', ') + ']' }
}

export function toggleIncrementAt(text: string, pos: number): { from: number, to: number, insert: string } | null {
    const id = identAt(text, pos)
    if (id) {
        const after = text.slice(id.to, id.to + 2)
        if (after === '++' || after === '--')
            return { from: id.from, to: id.to + 2, insert: after + id.name }
        if (id.from >= 2) {
            const before = text.slice(id.from - 2, id.from)
            if (before === '++' || before === '--')
                return { from: id.from - 2, to: id.to, insert: id.name + before }
        }
    }
    for (const start of [pos, pos - 1]) {
        if (start < 0) continue
        const op = text.slice(start, start + 2)
        if (op !== '++' && op !== '--') continue
        if (start + 2 < text.length && isIdentStart(text[start + 2])) {
            let to = start + 2
            while (to < text.length && isIdentChar(text[to])) to++
            return { from: start, to, insert: text.slice(start + 2, to) + op }
        }
        if (start > 0 && isIdentChar(text[start - 1])) {
            let from = start
            while (from > 0 && isIdentChar(text[from - 1])) from--
            if (isIdentStart(text[from]))
                return { from, to: start + 2, insert: op + text.slice(from, start) }
        }
    }
    return null
}

export function splitStringAt(text: string, pos: number): { from: number, to: number, insert: string } | null {
    const q = findQuotedAt(text, pos)
    if (!q) return null
    if (pos <= q.from + 1 || pos >= q.to - 1) return null
    return {
        from: q.from,
        to: q.to,
        insert: text.slice(q.from, pos) + q.quote + ' + ' + q.quote + text.slice(pos, q.to),
    }
}

export function joinStringAt(text: string, pos: number): { from: number, to: number, insert: string } | null {
    let seed = findQuotedAt(text, pos)
    if (!seed) {
        let p = pos
        if (text[p] !== '+' && p > 0 && text[p - 1] === '+') p--
        if (text[p] === '+') {
            const left = skipWsBack(text, p)
            seed = findQuotedAt(text, left - 1)
        }
    }
    if (!seed) return null
    const quote = seed.quote
    const parts = [seed]
    for (;;) {
        const first = parts[0]
        const i = skipWsBack(text, first.from)
        if (i <= 0 || text[i - 1] !== '+') break
        const j = skipWsBack(text, i - 1)
        const prev = findQuotedAt(text, j - 1)
        if (!prev || prev.quote !== quote || prev.to !== j) break
        parts.unshift(prev)
    }
    for (;;) {
        const last = parts[parts.length - 1]
        let i = skipWs(text, last.to)
        if (text[i] !== '+') break
        i = skipWs(text, i + 1)
        const next = findQuotedAt(text, i)
        if (!next || next.quote !== quote || next.from !== i) break
        parts.push(next)
    }
    if (parts.length < 2) return null
    let inner = ''
    for (const p of parts) inner += text.slice(p.from + 1, p.to - 1)
    return { from: parts[0].from, to: parts[parts.length - 1].to, insert: quote + inner + quote }
}

export function wrapInIfLine(line: string): string | null {
    let i = skipWs(line, 0)
    if (i >= line.length) return null
    if (startsWord(line, i, 'if')) return null
    return line.slice(0, i) + 'if (true) ' + line.slice(i)
}

export function toggleSemicolonLine(line: string): string | null {
    let end = line.length
    while (end > 0 && (line[end - 1] === ' ' || line[end - 1] === '\t')) end--
    if (end === 0) return null
    const tail = line.slice(end)
    if (line[end - 1] === ';') return line.slice(0, end - 1) + tail
    const last = line[end - 1]
    if (last === '{' || last === '}' || last === ',' || last === ':' || last === '(') return null
    if (last === ')') {
        const i = skipWs(line, 0)
        if (startsWord(line, i, 'if') || startsWord(line, i, 'for') || startsWord(line, i, 'while')
            || startsWord(line, i, 'switch') || startsWord(line, i, 'function') || startsWord(line, i, 'catch'))
            return null
    }
    return line.slice(0, end) + ';' + tail
}

export function toggleLogAt(text: string, from: number, to: number): { from: number, to: number, insert: string } | null {
    const pos = from === to ? from : ((from + to) >> 1)
    const needle = 'console.log'
    const lo = Math.max(0, pos - 200)
    for (let i = lo; i <= pos; i++) {
        let ok = true
        for (let k = 0; k < needle.length; k++)
            if (text[i + k] !== needle[k]) { ok = false; break }
        if (!ok) continue
        const prev = i > 0 ? text[i - 1] : ''
        if (prev && isIdentChar(prev)) continue
        let j = skipWs(text, i + needle.length)
        if (text[j] !== '(') continue
        const close = matchParen(text, j)
        if (close < 0) continue
        if (pos < i || pos > close) continue
        const inner = text.slice(j + 1, close).trim()
        if (!inner) return null
        return { from: i, to: close + 1, insert: inner }
    }
    if (from < to) {
        const sel = text.slice(from, to)
        if (!sel.trim()) return null
        return { from, to, insert: 'console.log(' + sel + ')' }
    }
    const id = identAt(text, from)
    if (!id) return null
    return { from: id.from, to: id.to, insert: 'console.log(' + id.name + ')' }
}

function isHexDigit(ch: string): boolean {
    return (ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f') || (ch >= 'A' && ch <= 'F')
}

export function toggleHexDecAt(text: string, pos: number): { from: number, to: number, insert: string } | null {
    if (!text.length) return null
    let i = pos
    if (i >= text.length) i = text.length - 1
    const on = isHexDigit(text[i]) || text[i] === 'x' || text[i] === 'X'
    if (!on) {
        if (i > 0 && (isHexDigit(text[i - 1]) || text[i - 1] === 'x' || text[i - 1] === 'X')) i--
        else return null
    }
    let from = i
    while (from > 0 && (isHexDigit(text[from - 1]) || text[from - 1] === 'x' || text[from - 1] === 'X')) from--
    let to = from
    while (to < text.length && (isHexDigit(text[to]) || text[to] === 'x' || text[to] === 'X')) to++
    if (from > 0 && text[from - 1] === '.' && text[from] >= '0' && text[from] <= '9') return null
    if (to < text.length && text[to] === '.' && to + 1 < text.length && text[to + 1] >= '0' && text[to + 1] <= '9') return null
    const raw = text.slice(from, to)
    if (raw.length >= 3 && raw[0] === '0' && (raw[1] === 'x' || raw[1] === 'X')) {
        for (let k = 2; k < raw.length; k++)
            if (!isHexDigit(raw[k])) return null
        const n = parseInt(raw.slice(2), 16)
        if (n !== n) return null
        return { from, to, insert: String(n) }
    }
    if (raw.length > 1 && raw[0] === '0') return null
    for (let k = 0; k < raw.length; k++)
        if (raw[k] < '0' || raw[k] > '9') return null
    const n = parseInt(raw, 10)
    if (n !== n) return null
    return { from, to, insert: '0x' + n.toString(16) }
}

function findTopAnd(s: string): number {
    let d = 0
    let inQ = ''
    for (let i = 0; i < s.length; i++) {
        if (inQ) {
            if (s[i] === '\\') { i++; continue }
            if (s[i] === inQ) inQ = ''
            continue
        }
        if (s[i] === "'" || s[i] === '"' || s[i] === '`') { inQ = s[i]; continue }
        if (s[i] === '(' || s[i] === '[' || s[i] === '{') d++
        else if (s[i] === ')' || s[i] === ']' || s[i] === '}') d--
        else if (d === 0 && s[i] === '&' && s[i + 1] === '&') return i
    }
    return -1
}

export function mergeIfLine(line: string): string | null {
    let i = skipWs(line, 0)
    const indent = line.slice(0, i)
    if (!startsWord(line, i, 'if')) return null
    while (i < line.length && line[i] !== '(') i++
    if (line[i] !== '(') return null
    const close1 = matchParen(line, i)
    if (close1 < 0) return null
    const cond1 = line.slice(i + 1, close1).trim()
    i = skipWs(line, close1 + 1)
    if (!startsWord(line, i, 'if')) return null
    i = skipWs(line, i + 2)
    if (line[i] !== '(') return null
    const close2 = matchParen(line, i)
    if (close2 < 0) return null
    const cond2 = line.slice(i + 1, close2).trim()
    if (!cond1 || !cond2) return null
    const rest = line.slice(close2 + 1)
    if (findWordAtDepth0(rest, 0, 'else') >= 0) return null
    return `${indent}if (${cond1} && ${cond2})${rest}`
}

export function splitIfAndLine(line: string): string | null {
    let i = skipWs(line, 0)
    const indent = line.slice(0, i)
    if (!startsWord(line, i, 'if')) return null
    while (i < line.length && line[i] !== '(') i++
    if (line[i] !== '(') return null
    const close = matchParen(line, i)
    if (close < 0) return null
    const cond = line.slice(i + 1, close)
    const andAt = findTopAnd(cond)
    if (andAt < 0) return null
    const left = cond.slice(0, andAt).trim()
    const right = cond.slice(andAt + 2).trim()
    if (!left || !right) return null
    return `${indent}if (${left}) if (${right})${line.slice(close + 1)}`
}

export function toggleArrowParensLine(line: string): string | null {
    const arrow = findArrow(line)
    if (arrow < 0) return null
    const p = skipWsBack(line, arrow)
    if (p > 0 && line[p - 1] === ')') {
        const open = matchPairBack(line, p - 1)
        if (open < 0) return null
        const inner = line.slice(open + 1, p - 1).trim()
        if (!isIdent(inner)) return null
        return line.slice(0, open) + inner + line.slice(p)
    }
    if (p > 0 && isIdentChar(line[p - 1])) {
        let from = p
        while (from > 0 && isIdentChar(line[from - 1])) from--
        if (!isIdentStart(line[from])) return null
        return line.slice(0, from) + '(' + line.slice(from, p) + ')' + line.slice(p)
    }
    return null
}

export function splitObjectAt(text: string, pos: number): { from: number, to: number, insert: string } | null {
    const obj = objectBraceAt(text, pos)
    if (!obj) return null
    const inner = text.slice(obj.from + 1, obj.to - 1)
    if (!inner.trim() || inner.indexOf('\n') >= 0 || !looksLikeObject(inner)) return null
    const commas = topCommas(inner)
    if (!commas.length) return null
    const parts: string[] = []
    let start = 0
    for (const c of commas) {
        parts.push(inner.slice(start, c).trim())
        start = c + 1
    }
    parts.push(inner.slice(start).trim())
    if (parts.some(p => !p)) return null
    return { from: obj.from, to: obj.to, insert: '{\n  ' + parts.join(',\n  ') + '\n}' }
}

export function joinObjectAt(text: string, pos: number): { from: number, to: number, insert: string } | null {
    const obj = objectBraceAt(text, pos)
    if (!obj) return null
    const inner = text.slice(obj.from + 1, obj.to - 1)
    if (inner.indexOf('\n') < 0 || !looksLikeObject(inner)) return null
    const commas = topCommas(inner)
    const parts: string[] = []
    let start = 0
    const cuts = commas.concat(inner.length)
    for (const c of cuts) {
        const p = inner.slice(start, c).trim()
        if (p) parts.push(p)
        start = c + 1
    }
    if (parts.length < 2) return null
    return { from: obj.from, to: obj.to, insert: '{' + parts.join(', ') + '}' }
}

const COMPOUND_OPS: { tok: string, bin: string }[] = [
    { tok: '||=', bin: '||' },
    { tok: '&&=', bin: '&&' },
    { tok: '??=', bin: '??' },
    { tok: '+=', bin: '+' },
    { tok: '-=', bin: '-' },
    { tok: '*=', bin: '*' },
    { tok: '/=', bin: '/' },
    { tok: '%=', bin: '%' },
]

const FOLD_BINS = ['||', '&&', '??', '+', '-', '*', '/', '%']

function findCompoundAt(text: string, pos: number): { from: number, to: number, bin: string } | null {
    const lo = Math.max(0, pos - 3)
    const hi = Math.min(text.length, pos + 1)
    let best: { from: number, to: number, bin: string } | null = null
    for (let i = lo; i < hi; i++) {
        for (const c of COMPOUND_OPS) {
            if (text.slice(i, i + c.tok.length) !== c.tok) continue
            if (pos < i || pos > i + c.tok.length) continue
            if (!best || c.tok.length > best.to - best.from)
                best = { from: i, to: i + c.tok.length, bin: c.bin }
        }
    }
    return best
}

function collapseAssign(text: string, eq: number): { from: number, to: number, insert: string, head: number } | null {
    if (text[eq + 1] === '=' || text[eq + 1] === '>') return null
    const prev = eq > 0 ? text[eq - 1] : ''
    if (prev === '=' || prev === '!' || prev === '<' || prev === '>' || prev === '+' || prev === '-' || prev === '*' || prev === '/' || prev === '%' || prev === '&' || prev === '|' || prev === '?')
        return null
    const left = operandLeft(text, eq)
    if (!left) return null
    const name = text.slice(left.from, left.to)
    if (!isIdent(name)) return null
    let i = skipWs(text, eq + 1)
    if (text.slice(i, i + name.length) !== name) return null
    if (isIdentChar(text[i + name.length] ?? '')) return null
    i = skipWs(text, i + name.length)
    let bin = ''
    for (const b of FOLD_BINS) {
        if (text.slice(i, i + b.length) === b) { bin = b; break }
    }
    if (!bin) return null
    const rhs = operandRight(text, i + bin.length)
    if (!rhs) return null
    const insert = name + ' ' + bin + '= ' + text.slice(rhs.from, rhs.to)
    return { from: left.from, to: rhs.to, insert, head: left.from + name.length + 1 }
}

export function toggleAssignOpAt(text: string, pos: number): { from: number, to: number, insert: string, head: number } | null {
    const comp = findCompoundAt(text, pos)
    if (comp) {
        const left = operandLeft(text, comp.from)
        const rhs = operandRight(text, comp.to)
        if (left && rhs && isIdent(text.slice(left.from, left.to))) {
            const name = text.slice(left.from, left.to)
            const insert = name + ' = ' + name + ' ' + comp.bin + ' ' + text.slice(rhs.from, rhs.to)
            return { from: left.from, to: rhs.to, insert, head: left.from + name.length + 1 }
        }
    }
    const id = identAt(text, pos)
    if (id) {
        const after = skipWs(text, id.to)
        const c2 = findCompoundAt(text, after)
        if (c2 && c2.from === after)
            return toggleAssignOpAt(text, after)
        if (text[after] === '=') {
            const hit = collapseAssign(text, after)
            if (hit) return hit
        }
    }
    const lo = Math.max(0, pos - 1)
    const hi = Math.min(text.length, pos + 1)
    for (let i = lo; i < hi; i++) {
        if (text[i] === '=') {
            const hit = collapseAssign(text, i)
            if (hit) return hit
        }
    }
    return null
}

export function toggleTypeImportLine(line: string): string | null {
    let i = skipWs(line, 0)
    if (!startsWord(line, i, 'import')) return null
    const j = skipWs(line, i + 6)
    if (line[j] === '(') return null
    if (startsWord(line, j, 'type')) {
        const after = skipWs(line, j + 4)
        return line.slice(0, j) + line.slice(after)
    }
    return line.slice(0, j) + 'type ' + line.slice(j)
}

export function toggleExportDefaultLine(line: string): string | null {
    let i = skipWs(line, 0)
    if (!startsWord(line, i, 'export')) return null
    const j = skipWs(line, i + 6)
    if (startsWord(line, j, 'default')) {
        const k = skipWs(line, j + 7)
        if (!startsWord(line, k, 'function') && !startsWord(line, k, 'class') && !startsWord(line, k, 'async'))
            return null
        return line.slice(0, j) + line.slice(k)
    }
    if (startsWord(line, j, 'function') || startsWord(line, j, 'class') || startsWord(line, j, 'async'))
        return line.slice(0, j) + 'default ' + line.slice(j)
    return null
}
