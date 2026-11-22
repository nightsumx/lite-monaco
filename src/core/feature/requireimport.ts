// require(...) → import。词法扫一行，不解析源码。

import type { StateCommand } from '../model/state'

function skipWs(s: string, i: number): number {
    while (i < s.length && (s[i] === ' ' || s[i] === '\t')) i++
    return i
}

function startsWith(s: string, i: number, w: string): boolean {
    for (let k = 0; k < w.length; k++)
        if (s[i + k] !== w[k]) return false
    return true
}

function isIdentStart(ch: string): boolean {
    const o = ch.charCodeAt(0)
    return (o >= 65 && o <= 90) || (o >= 97 && o <= 122) || o === 95 || o === 36
}

function isIdentChar(ch: string): boolean {
    const o = ch.charCodeAt(0)
    return isIdentStart(ch) || (o >= 48 && o <= 57)
}

export function convertRequireLine(line: string): string | null {
    let i = skipWs(line, 0)
    let kw = ''
    if (startsWith(line, i, 'const')) { kw = 'const'; i += 5 }
    else if (startsWith(line, i, 'let')) { kw = 'let'; i += 3 }
    else if (startsWith(line, i, 'var')) { kw = 'var'; i += 3 }
    else return null
    if (!kw) return null
    if (i < line.length && isIdentChar(line[i])) return null
    i = skipWs(line, i)
    let binding = ''
    if (line[i] === '{') {
        const close = line.indexOf('}', i + 1)
        if (close < 0) return null
        binding = line.slice(i, close + 1)
        i = close + 1
    }
    else if (i < line.length && isIdentStart(line[i])) {
        const from = i
        i++
        while (i < line.length && isIdentChar(line[i])) i++
        binding = line.slice(from, i)
    }
    else return null
    i = skipWs(line, i)
    if (line[i] !== '=') return null
    i = skipWs(line, i + 1)
    if (!startsWith(line, i, 'require')) return null
    i += 7
    i = skipWs(line, i)
    if (line[i] !== '(') return null
    i = skipWs(line, i + 1)
    const q = line[i]
    if (q !== "'" && q !== '"') return null
    const q2 = line.indexOf(q, i + 1)
    if (q2 < 0) return null
    const mod = line.slice(i, q2 + 1)
    i = skipWs(line, q2 + 1)
    if (line[i] !== ')') return null
    i = skipWs(line, i + 1)
    if (i < line.length && line[i] === ';') i++
    i = skipWs(line, i)
    if (i < line.length) return null
    return binding[0] === '{'
        ? `import ${binding} from ${mod}`
        : `import ${binding} from ${mod}`
}

export const convertRequireToImport: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const sel = state.selection.main
    const doc = state.doc
    const startN = sel.empty ? doc.lineAt(sel.head).number : doc.lineAt(sel.from).number
    const endN = sel.empty ? startN : doc.lineAt(sel.to === doc.lineAt(sel.to).from && sel.to > sel.from ? sel.to - 1 : sel.to).number
    const changes: { from: number, to: number, insert: string }[] = []
    for (let n = startN; n <= endN; n++) {
        const line = doc.line(n)
        const next = convertRequireLine(line.text)
        if (next == null || next === line.text) continue
        changes.push({ from: line.from, to: line.to, insert: next })
    }
    if (!changes.length) return false
    dispatch(state.update({ changes, userEvent: 'input', scrollIntoView: true }))
    return true
}

export function convertImportLine(line: string): string | null {
    let i = skipWs(line, 0)
    if (!startsWith(line, i, 'import')) return null
    i += 6
    if (i < line.length && isIdentChar(line[i])) return null
    i = skipWs(line, i)
    if (startsWith(line, i, 'type') && (line[i + 4] === ' ' || line[i + 4] === '\t')) return null
    let binding = ''
    if (line[i] === '{') {
        const close = line.indexOf('}', i + 1)
        if (close < 0) return null
        binding = line.slice(i, close + 1)
        i = close + 1
    }
    else if (i < line.length && isIdentStart(line[i])) {
        const from = i
        i++
        while (i < line.length && isIdentChar(line[i])) i++
        binding = line.slice(from, i)
    }
    else return null
    i = skipWs(line, i)
    if (!startsWith(line, i, 'from')) return null
    i += 4
    if (i < line.length && isIdentChar(line[i])) return null
    i = skipWs(line, i)
    const q = line[i]
    if (q !== "'" && q !== '"') return null
    const q2 = line.indexOf(q, i + 1)
    if (q2 < 0) return null
    const mod = line.slice(i, q2 + 1)
    i = skipWs(line, q2 + 1)
    if (i < line.length && line[i] === ';') i++
    i = skipWs(line, i)
    if (i < line.length) return null
    return `const ${binding} = require(${mod})`
}

export const convertImportToRequire: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const sel = state.selection.main
    const doc = state.doc
    const startN = sel.empty ? doc.lineAt(sel.head).number : doc.lineAt(sel.from).number
    const endN = sel.empty ? startN : doc.lineAt(sel.to === doc.lineAt(sel.to).from && sel.to > sel.from ? sel.to - 1 : sel.to).number
    const changes: { from: number, to: number, insert: string }[] = []
    for (let n = startN; n <= endN; n++) {
        const line = doc.line(n)
        const next = convertImportLine(line.text)
        if (next == null || next === line.text) continue
        changes.push({ from: line.from, to: line.to, insert: next })
    }
    if (!changes.length) return false
    dispatch(state.update({ changes, userEvent: 'input', scrollIntoView: true }))
    return true
}
