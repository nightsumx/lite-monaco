// 行级 + 字级 diff。computeLineRangeMappings 照搬 Monaco 0.52 advanced 算法;
// lineDiff / charDiff 是朴素 LCS,给行视图和 moved 检测用。

import { computeMovedLines } from './moves'
import { toPairs } from './unchanged'
import { DiffComputer } from './legacy'

export type DiffOp =
    | { type: 'equal', lines: string[] }
    | { type: 'insert', lines: string[] }
    | { type: 'delete', lines: string[] }

export function splitLinesDiff(text: string): string[] {
    if (!text) return ['']
    const out: string[] = []
    let start = 0
    for (let i = 0; i < text.length; i++) {
        const c = text.charCodeAt(i)
        if (c === 10) {
            let s = text.slice(start, i)
            if (s.endsWith('\r')) s = s.slice(0, -1)
            out.push(s)
            start = i + 1
        }
    }
    let last = text.slice(start)
    if (last.endsWith('\r')) last = last.slice(0, -1)
    out.push(last)
    return out
}

export function lineDiff(aText: string, bText: string, maxLines = 4000): DiffOp[] {
    const a = splitLinesDiff(aText)
    const b = splitLinesDiff(bText)
    if (a.length * b.length > maxLines * maxLines) {
        const ops: DiffOp[] = []
        if (a.length) ops.push({ type: 'delete', lines: a })
        if (b.length) ops.push({ type: 'insert', lines: b })
        return ops
    }
    const n = a.length
    const m = b.length
    const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
    for (let i = 1; i <= n; i++) {
        for (let j = 1; j <= m; j++) {
            dp[i][j] = a[i - 1] === b[j - 1]
                ? dp[i - 1][j - 1] + 1
                : Math.max(dp[i - 1][j], dp[i][j - 1])
        }
    }
    const raw: DiffOp[] = []
    let i = n, j = m
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
            raw.push({ type: 'equal', lines: [a[i - 1]] })
            i--; j--
        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
            raw.push({ type: 'insert', lines: [b[j - 1]] })
            j--
        } else {
            raw.push({ type: 'delete', lines: [a[i - 1]] })
            i--
        }
    }
    raw.reverse()
    const out: DiffOp[] = []
    for (const op of raw) {
        const last = out[out.length - 1]
        if (last && last.type === op.type) last.lines.push(...op.lines)
        else out.push({ type: op.type, lines: [...op.lines] })
    }
    return out
}

/** 两侧各只出现一次的行：从 delete 落到 insert 即搬迁。空白行不算。 */
export function detectMovedLines(aText: string, bText: string): { text: string, originalLine: number, modifiedLine: number }[] {
    const a = splitLinesDiff(aText)
    const b = splitLinesDiff(bText)
    const count = (lines: string[]) => {
        const m = new Map<string, number>()
        for (const l of lines) m.set(l, (m.get(l) ?? 0) + 1)
        return m
    }
    const aN = count(a)
    const bN = count(b)
    const deleted: { text: string, line: number }[] = []
    const inserted: { text: string, line: number }[] = []
    let oa = 1, mb = 1
    for (const op of lineDiff(aText, bText)) {
        if (op.type === 'equal') {
            oa += op.lines.length
            mb += op.lines.length
        }
        else if (op.type === 'delete') {
            for (const t of op.lines) deleted.push({ text: t, line: oa++ })
        }
        else {
            for (const t of op.lines) inserted.push({ text: t, line: mb++ })
        }
    }
    const out: { text: string, originalLine: number, modifiedLine: number }[] = []
    for (const d of deleted) {
        if (!d.text.trim()) continue
        if (aN.get(d.text) !== 1 || bN.get(d.text) !== 1) continue
        const ins = inserted.find(i => i.text === d.text)
        if (ins) out.push({ text: d.text, originalLine: d.line, modifiedLine: ins.line })
    }
    return out
}

export function sideBySideRows(ops: DiffOp[]): { left: string | null, right: string | null, kind: 'equal' | 'insert' | 'delete' }[] {
    const rows: { left: string | null, right: string | null, kind: 'equal' | 'insert' | 'delete' }[] = []
    for (const op of ops) {
        if (op.type === 'equal') {
            for (const l of op.lines) rows.push({ left: l, right: l, kind: 'equal' })
        } else if (op.type === 'delete') {
            for (const l of op.lines) rows.push({ left: l, right: null, kind: 'delete' })
        } else {
            for (const l of op.lines) rows.push({ left: null, right: l, kind: 'insert' })
        }
    }
    return rows
}

/** 字符 LCS 片段 */
export type CharPart = { type: 'equal' | 'insert' | 'delete', text: string }

export function charDiff(a: string, b: string, max = 800): CharPart[] {
    if (a === b) return a ? [{ type: 'equal', text: a }] : []
    if (a.length * b.length > max * max) {
        const out: CharPart[] = []
        if (a) out.push({ type: 'delete', text: a })
        if (b) out.push({ type: 'insert', text: b })
        return out
    }
    const n = a.length, m = b.length
    const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
    for (let i = 1; i <= n; i++)
        for (let j = 1; j <= m; j++)
            dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1])
    const rev: CharPart[] = []
    let i = n, j = m
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
            rev.push({ type: 'equal', text: a[i - 1] })
            i--; j--
        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
            rev.push({ type: 'insert', text: b[j - 1] })
            j--
        } else {
            rev.push({ type: 'delete', text: a[i - 1] })
            i--
        }
    }
    rev.reverse()
    const out: CharPart[] = []
    for (const p of rev) {
        const last = out[out.length - 1]
        if (last && last.type === p.type) last.text += p.text
        else out.push({ ...p })
    }
    return out
}

/** Monaco 式 mapping:1-based 行区间 [start, endExclusive) + 字级 inner */
export interface LineRangeMapping {
    originalStart: number
    originalEnd: number
    modifiedStart: number
    modifiedEnd: number
    /** legacy 算法对「一侧是空文档」的整篇替换不算字级:Monaco 此时 innerChanges = undefined,这里 innerChanges 为 [] 且 noInner = true */
    noInner?: true
    /** 文档绝对偏移 [from,to) */
    innerChanges: {
        originalFrom: number
        originalTo: number
        modifiedFrom: number
        modifiedTo: number
    }[]
}

// —— 以下照搬 Monaco 0.52 DefaultLinesDiffComputer(advanced 算法)——

/** SequenceDiff:两侧半开区间 [s1,e1) / [s2,e2) */
export interface SeqDiff { s1: number, e1: number, s2: number, e2: number }
/** ISequence:元素哈希 + 原文严格相等 + 边界分(行看缩进,字看字符类别) */
export interface Seq {
    length: number
    get(i: number): number
    strong(a: number, b: number): boolean
    score(len: number): number
    text(s: number, e: number): string
}
/** 1-based 行列区间 */
export interface Rng { sl: number, sc: number, el: number, ec: number }
/** LinesSliceCharSequence:一段行里的字符,首尾空白按需剥掉 */
export interface Slice extends Seq {
    range(s: number, e: number): Rng
    /** Monaco translateOffset:元素偏移 → 1-based 行列;preferLeft 时行首落在上一行尾之后 */
    translate(off: number, preferLeft: boolean): [number, number]
    word(off: number): [number, number] | undefined
    /** fooBar 有两个子词 foo 和 Bar(大写字母开头新子词) */
    subword(off: number): [number, number] | undefined
    countLines(s: number, e: number): number
    fullLines(s: number, e: number): [number, number]
}

const sd = (s1: number, e1: number, s2: number, e2: number): SeqDiff => ({ s1, e1, s2, e2 })
const sdJoin = (a: SeqDiff, b: SeqDiff) =>
    sd(Math.min(a.s1, b.s1), Math.max(a.e1, b.e1), Math.min(a.s2, b.s2), Math.max(a.e2, b.e2))
const sdDelta = (a: SeqDiff, d: number) => sd(a.s1 + d, a.e1 + d, a.s2 + d, a.e2 + d)
/** OffsetRange.intersect:两侧都相交或相切才有 */
function sdIntersect(a: SeqDiff, b: SeqDiff): SeqDiff | undefined {
    const s1 = Math.max(a.s1, b.s1), e1 = Math.min(a.e1, b.e1)
    const s2 = Math.max(a.s2, b.s2), e2 = Math.min(a.e2, b.e2)
    return s1 <= e1 && s2 <= e2 ? sd(s1, e1, s2, e2) : undefined
}

/** Monaco DateTimeout / InfiniteTimeout:maxComputationTime 到了就停,退回整段替换并记 hit */
export class Deadline {
    hit = false
    private readonly at: number
    constructor(ms: number) { this.at = ms > 0 ? Date.now() + ms : Infinity }
    expired() {
        if (!this.hit && Date.now() > this.at) this.hit = true
        return this.hit
    }
}

/** Monaco areLinesSimilar(沿用它的写法:序列是 trim 后的字符,索引却回到原行上查是不是空白) */
function areLinesSimilar(line1: string, line2: string, deadline: Deadline): boolean {
    if (line1.trim() === line2.trim()) return true
    if (line1.length > 300 && line2.length > 300) return false
    const s1 = charSlice([line1], { sl: 1, sc: 1, el: 1, ec: line1.length }, false)
    const s2 = charSlice([line2], { sl: 1, sc: 1, el: 1, ec: line2.length }, false)
    const diffs = myersDiff(s1, s2, deadline)
    const isSpace = (c: number) => c === 32 || c === 9
    let common = 0
    let last = 0
    const count = (from: number, to: number) => {
        for (let i = from; i < to; i++) if (!isSpace(line1.charCodeAt(i))) common++
    }
    for (const d of diffs) {
        count(last, d.s1)
        last = d.e1
    }
    count(last, line1.length)
    const nonWs = (str: string) => {
        let c = 0
        // Monaco 这里数的永远是 line1.length 个字符(countNonWsChars 里的 line1 不是参数),照搬
        for (let i = 0; i < line1.length; i++) if (!isSpace(str.charCodeAt(i))) c++
        return c
    }
    const longer = nonWs(line1.length > line2.length ? line1 : line2)
    return common / longer > 0.6 && longer > 10
}

/** DynamicProgrammingDiffing:O(MN),偏好连续对角线,可带相等分 */
function dpDiff(a: Seq, b: Seq, deadline: Deadline, eqScore?: (i: number, j: number) => number): SeqDiff[] {
    const n = a.length, m = b.length
    if (!n || !m) return [sd(0, n, 0, m)]
    const lcs = new Float64Array(n * m)
    const dir = new Uint8Array(n * m)
    const run = new Uint32Array(n * m)
    for (let i = 0; i < n; i++) {
        if (deadline.expired()) return [sd(0, n, 0, m)]
        for (let j = 0; j < m; j++) {
            const k = i * m + j
            const hor = i === 0 ? 0 : lcs[k - m]
            const ver = j === 0 ? 0 : lcs[k - 1]
            let ext = -1
            if (a.get(i) === b.get(j)) {
                ext = i === 0 || j === 0 ? 0 : lcs[k - m - 1]
                if (i > 0 && j > 0 && dir[k - m - 1] === 3) ext += run[k - m - 1]
                ext += eqScore ? eqScore(i, j) : 1
            }
            const v = Math.max(hor, ver, ext)
            if (v === ext) {
                run[k] = (i > 0 && j > 0 ? run[k - m - 1] : 0) + 1
                dir[k] = 3
            } else dir[k] = v === hor ? 1 : 2
            lcs[k] = v
        }
    }
    const out: SeqDiff[] = []
    let lastI = n, lastJ = m
    const report = (i: number, j: number) => {
        if (i + 1 !== lastI || j + 1 !== lastJ) out.push(sd(i + 1, lastI, j + 1, lastJ))
        lastI = i
        lastJ = j
    }
    let i = n - 1, j = m - 1
    while (i >= 0 && j >= 0) {
        const d = dir[i * m + j]
        if (d === 3) {
            report(i, j)
            i--
            j--
        } else if (d === 1) i--
        else j--
    }
    report(-1, -1)
    return out.reverse()
}

interface SnakePath { prev: SnakePath | null, x: number, y: number, len: number }

/** MyersDiffAlgorithm:O(ND),大文件用 */
export function myersDiff(a: Seq, b: Seq, deadline: Deadline): SeqDiff[] {
    const n = a.length, m = b.length
    if (!n || !m) return [sd(0, n, 0, m)]
    const snake = (x: number, y: number) => {
        while (x < n && y < m && a.get(x) === b.get(y)) { x++; y++ }
        return x
    }
    // 对角线 k ∈ [-(m+2), n+2],平移成非负下标
    const off = m + 2
    const V = new Int32Array(n + m + 5)
    const paths: (SnakePath | null)[] = new Array(n + m + 5).fill(null)
    V[off] = snake(0, 0)
    paths[off] = V[off] === 0 ? null : { prev: null, x: 0, y: 0, len: V[off] }
    let k = 0
    loop: for (let d = 1; ; d++) {
        if (deadline.expired()) return [sd(0, n, 0, m)]
        const lo = -Math.min(d, m + (d % 2))
        const hi = Math.min(d, n + (d % 2))
        for (k = lo; k <= hi; k += 2) {
            const top = k === hi ? -1 : V[off + k + 1]
            const left = k === lo ? -1 : V[off + k - 1] + 1
            const x = Math.min(Math.max(top, left), n)
            const y = x - k
            if (x > n || y > m) continue
            const nx = snake(x, y)
            V[off + k] = nx
            const last = x === top ? paths[off + k + 1] : paths[off + k - 1]
            paths[off + k] = nx !== x ? { prev: last, x, y, len: nx - x } : last
            if (nx === n && nx - k === m) break loop
        }
    }
    let p = paths[off + k]
    const out: SeqDiff[] = []
    let lx = n, ly = m
    for (;;) {
        const ex = p ? p.x + p.len : 0
        const ey = p ? p.y + p.len : 0
        if (ex !== lx || ey !== ly) out.push(sd(ex, lx, ey, ly))
        if (!p) break
        lx = p.x
        ly = p.y
        p = p.prev
    }
    return out.reverse()
}

/** joinSequenceDiffsByShifting:单侧空的 diff 先尽量左移并吞前一个,再右移吞后一个 */
function joinByShifting(a: Seq, b: Seq, diffs: SeqDiff[]): SeqDiff[] {
    if (!diffs.length) return diffs
    const r: SeqDiff[] = [diffs[0]]
    for (let i = 1; i < diffs.length; i++) {
        const prev = r[r.length - 1]
        let cur = diffs[i]
        if (cur.s1 === cur.e1 || cur.s2 === cur.e2) {
            const length = cur.s1 - prev.e1
            let d = 1
            for (; d <= length; d++)
                if (a.get(cur.s1 - d) !== a.get(cur.e1 - d) || b.get(cur.s2 - d) !== b.get(cur.e2 - d)) break
            d--
            if (d === length) {
                r[r.length - 1] = sd(prev.s1, cur.e1 - length, prev.s2, cur.e2 - length)
                continue
            }
            cur = sdDelta(cur, -d)
        }
        r.push(cur)
    }
    const r2: SeqDiff[] = []
    for (let i = 0; i < r.length - 1; i++) {
        const next = r[i + 1]
        let cur = r[i]
        if (cur.s1 === cur.e1 || cur.s2 === cur.e2) {
            const length = next.s1 - cur.e1
            let d = 0
            for (; d < length; d++)
                if (!a.strong(cur.s1 + d, cur.e1 + d) || !b.strong(cur.s2 + d, cur.e2 + d)) break
            if (d === length) {
                r[i + 1] = sd(cur.s1 + length, next.e1, cur.s2 + length, next.e2)
                continue
            }
            if (d > 0) cur = sdDelta(cur, d)
        }
        r2.push(cur)
    }
    r2.push(r[r.length - 1])
    return r2
}

/** shiftDiffToBetterPosition:a 侧为空的 diff 在合法范围内滑到边界分最高处 */
function shiftToBetter(d: SeqDiff, a: Seq, b: Seq, v1s: number, v1e: number, v2s: number, v2e: number): SeqDiff {
    let before = 1
    while (d.s1 - before >= v1s && d.s2 - before >= v2s
        && b.strong(d.s2 - before, d.e2 - before) && before < 100) before++
    before--
    let after = 0
    while (d.s1 + after < v1e && d.e2 + after < v2e
        && b.strong(d.s2 + after, d.e2 + after) && after < 100) after++
    if (!before && !after) return d
    let best = 0, bestScore = -1
    for (let x = -before; x <= after; x++) {
        const s = a.score(d.s1 + x) + b.score(d.s2 + x) + b.score(d.e2 + x)
        if (s > bestScore) {
            bestScore = s
            best = x
        }
    }
    return sdDelta(d, best)
}

/** optimizeSequenceDiffs = 两遍 join + shift */
function optimizeDiffs(a: Seq, b: Seq, diffs: SeqDiff[]): SeqDiff[] {
    const r = joinByShifting(a, b, joinByShifting(a, b, diffs))
    for (let i = 0; i < r.length; i++) {
        const prev = r[i - 1], d = r[i], next = r[i + 1]
        const v1s = prev ? prev.e1 + 1 : 0, v1e = next ? next.s1 - 1 : a.length
        const v2s = prev ? prev.e2 + 1 : 0, v2e = next ? next.s2 - 1 : b.length
        if (d.s1 === d.e1) r[i] = shiftToBetter(d, a, b, v1s, v1e, v2s, v2e)
        else if (d.s2 === d.e2) {
            const s = shiftToBetter(sd(d.s2, d.e2, d.s1, d.e1), b, a, v2s, v2e, v1s, v1e)
            r[i] = sd(s.s2, s.e2, s.s1, s.e1)
        }
    }
    return r
}

const indentOf = (s: string) => {
    let i = 0
    while (i < s.length && (s.charCodeAt(i) === 32 || s.charCodeAt(i) === 9)) i++
    return i
}
const isWordCode = (c: number) => (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || (c >= 48 && c <= 57)
/** 字符边界类别:小写 0 · 大写 1 · 数字 2 · 端点 3 · 其它 4 · , ; 5 · 空格制表 6 · CR 7 · LF 8 */
const charCat = (c: number) => c === 10 ? 8 : c === 13 ? 7 : c === 32 || c === 9 ? 6
    : c >= 97 && c <= 122 ? 0 : c >= 65 && c <= 90 ? 1 : c >= 48 && c <= 57 ? 2
        : c === -1 ? 3 : c === 44 || c === 59 ? 5 : 4
const CAT_SCORE = [0, 0, 0, 10, 2, 30, 3, 10, 10]

export function charSlice(lines: string[], r: Rng, considerWs: boolean): Slice {
    const els: number[] = []
    const firstOff = [0]
    const lineStart: number[] = []
    const trimmed: number[] = []
    for (let ln = r.sl; ln <= r.el; ln++) {
        let line = lines[ln - 1]
        let ls = 0
        if (ln === r.sl && r.sc > 1) {
            ls = r.sc - 1
            line = line.substring(ls)
        }
        lineStart.push(ls)
        let tw = 0
        if (!considerWs) {
            const t = line.trimStart()
            tw = line.length - t.length
            line = t.trimEnd()
        }
        trimmed.push(tw)
        const len = ln === r.el ? Math.min(r.ec - 1 - ls - tw, line.length) : line.length
        for (let i = 0; i < len; i++) els.push(line.charCodeAt(i))
        if (ln < r.el) {
            els.push(10)
            firstOff.push(els.length)
        }
    }
    /** 最后一个 firstOff[i] <= off */
    const lineIdx = (off: number) => {
        let lo = 0, hi = firstOff.length - 1
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1
            if (firstOff[mid] <= off) lo = mid
            else hi = mid - 1
        }
        return lo
    }
    const pos = (off: number, left: boolean): [number, number] => {
        const i = lineIdx(off)
        const lo = off - firstOff[i]
        return [r.sl + i, 1 + lineStart[i] + lo + (lo === 0 && left ? 0 : trimmed[i])]
    }
    return {
        length: els.length,
        translate: pos,
        get: i => els[i],
        strong: (x, y) => els[x] === els[y],
        score: len => {
            const p = charCat(len > 0 ? els[len - 1] : -1)
            const n = charCat(len < els.length ? els[len] : -1)
            if (p === 7 && n === 8) return 0
            if (p === 8) return 150
            let s = 0
            if (p !== n) s += p === 0 && n === 1 ? 11 : 10
            return s + CAT_SCORE[p] + CAT_SCORE[n]
        },
        text: (s, e) => {
            let t = ''
            for (let i = s; i < e; i++) t += String.fromCharCode(els[i])
            return t
        },
        range: (s, e) => {
            const [l1, c1] = pos(s, false)
            const [l2, c2] = pos(e, true)
            if (l2 < l1 || (l2 === l1 && c2 < c1)) return { sl: l2, sc: c2, el: l2, ec: c2 }
            return { sl: l1, sc: c1, el: l2, ec: c2 }
        },
        word: off => {
            if (off < 0 || off >= els.length || !isWordCode(els[off])) return undefined
            let s = off
            while (s > 0 && isWordCode(els[s - 1])) s--
            let e = off
            while (e < els.length && isWordCode(els[e])) e++
            return [s, e]
        },
        subword: off => {
            if (off < 0 || off >= els.length || !isWordCode(els[off])) return undefined
            const upper = (c: number) => c >= 65 && c <= 90
            let s = off
            while (s > 0 && isWordCode(els[s - 1]) && !upper(els[s])) s--
            let e = off
            while (e < els.length && isWordCode(els[e]) && !upper(els[e])) e++
            return [s, e]
        },
        countLines: (s, e) => pos(e, false)[0] - pos(s, false)[0],
        fullLines: (s, e) => {
            const start = firstOff[lineIdx(s)]
            let end = els.length
            for (const x of firstOff) if (e <= x) { end = x; break }
            return [start, end]
        },
    }
}

/** extendDiffsToEntireWordIfAppropriate:词里改动过半(相等字符 < 2/3)就整词标出 */
function extendToWords(a: Slice, b: Slice, diffs: SeqDiff[], find: (s: Slice, off: number) => [number, number] | undefined = (s, o) => s.word(o), force = false): SeqDiff[] {
    const eq: SeqDiff[] = []
    for (let i = 0; i <= diffs.length; i++) {
        const p = diffs[i - 1], n = diffs[i]
        eq.push(sd(p ? p.e1 : 0, n ? n.s1 : a.length, p ? p.e2 : 0, n ? n.s2 : (p ? p.e2 - p.e1 : 0) + a.length))
    }
    const add: SeqDiff[] = []
    let last1 = 0, last2 = 0
    const scan = (o1: number, o2: number, eqm: SeqDiff) => {
        if (o1 < last1 || o2 < last2) return
        const w1 = find(a, o1), w2 = find(b, o2)
        if (!w1 || !w2) return
        let w = sd(w1[0], w1[1], w2[0], w2[1])
        const part = sdIntersect(w, eqm)
        let e1 = part ? part.e1 - part.s1 : 0
        let e2 = part ? part.e2 - part.s2 : 0
        while (eq.length) {
            const next = eq[0]
            if (!(Math.max(next.s1, w.s1) < Math.min(next.e1, w.e1)
                || Math.max(next.s2, w.s2) < Math.min(next.e2, w.e2))) break
            const v1 = find(a, next.s1), v2 = find(b, next.s2)
            if (!v1 || !v2) break
            const v = sd(v1[0], v1[1], v2[0], v2[1])
            const vp = sdIntersect(v, next)
            if (vp) {
                e1 += vp.e1 - vp.s1
                e2 += vp.e2 - vp.s2
            }
            w = sdJoin(w, v)
            if (w.e1 >= next.e1) eq.shift()
            else break
        }
        if ((force && e1 + e2 < w.e1 - w.s1 + w.e2 - w.s2) || e1 + e2 < (w.e1 - w.s1 + w.e2 - w.s2) * 2 / 3) add.push(w)
        last1 = w.e1
        last2 = w.e2
    }
    while (eq.length) {
        const next = eq.shift()!
        if (next.s1 === next.e1) continue
        scan(next.s1, next.s2, next)
        scan(next.e1 - 1, next.e2 - 1, next)
    }
    const out: SeqDiff[] = []
    let i = 0, j = 0
    while (i < diffs.length || j < add.length) {
        const x = diffs[i], y = add[j]
        const next = x && (!y || x.s1 < y.s1) ? diffs[i++] : add[j++]
        const last = out[out.length - 1]
        if (last && last.e1 >= next.s1) out[out.length - 1] = sdJoin(last, next)
        else out.push(next)
    }
    return out
}

/** removeVeryShortMatchingTextBetweenLongDiffs + 去掉长 diff 两头的短前后缀 */
function removeShortTextBetweenLongDiffs(a: Slice, b: Slice, diffs: SeqDiff[]): SeqDiff[] {
    if (!diffs.length) return diffs
    const cap = (v: number) => Math.min(v, 130)
    const weight = (x: SeqDiff) => Math.pow(
        Math.pow(cap(a.countLines(x.s1, x.e1) * 40 + x.e1 - x.s1), 1.5)
        + Math.pow(cap(b.countLines(x.s2, x.e2) * 40 + x.e2 - x.s2), 1.5), 1.5)
    let counter = 0
    let again: boolean
    do {
        again = false
        const r = [diffs[0]]
        for (let i = 1; i < diffs.length; i++) {
            const cur = diffs[i], before = r[r.length - 1]
            let join = false
            if (a.countLines(before.e1, cur.s1) <= 5 && cur.s1 - before.e1 <= 500) {
                const t = a.text(before.e1, cur.s1).trim()
                if (t.length <= 20 && !t.includes('\n') && !t.includes('\r'))
                    join = weight(before) + weight(cur) > ((130 ** 1.5) ** 1.5) * 1.3
            }
            if (join) {
                again = true
                r[r.length - 1] = sdJoin(before, cur)
            } else r.push(cur)
        }
        diffs = r
    } while (counter++ < 10 && again)
    const out: SeqDiff[] = []
    for (let i = 0; i < diffs.length; i++) {
        const prev = diffs[i - 1], cur = diffs[i], next = diffs[i + 1]
        const mark = (t: string) => t.length > 0 && t.trim().length <= 3 && cur.e1 - cur.s1 + cur.e2 - cur.s2 > 100
        let nd = cur
        const [fs, fe] = a.fullLines(cur.s1, cur.e1)
        const prefix = a.text(fs, cur.s1)
        if (mark(prefix)) nd = sd(nd.s1 - prefix.length, nd.e1, nd.s2 - prefix.length, nd.e2)
        const suffix = a.text(cur.e1, fe)
        if (mark(suffix)) nd = sd(nd.s1, nd.e1 + suffix.length, nd.s2, nd.e2 + suffix.length)
        const max = Number.MAX_SAFE_INTEGER
        const res = sdIntersect(nd, sd(prev ? prev.e1 : 0, next ? next.s1 : max, prev ? prev.e2 : 0, next ? next.s2 : max))
        if (!res) continue
        const last = out[out.length - 1]
        if (last && res.s1 === last.e1 && res.s2 === last.e2) out[out.length - 1] = sdJoin(last, res)
        else out.push(res)
    }
    return out
}

/**
 * 从全文算 LineRangeMapping 列表:Monaco 0.52 默认 advanced 算法逐步照搬
 * (行哈希 DP/Myers → 平移合并 → 字级 refine → 整词扩展 → 分组)。
 * ignoreTrimWhitespace(默认 true):行按 trim() 比较,字级也剥掉首尾空白。
 * maxComputationTimeMs(默认 5000,0 = 不限):超时的那一步退回整段替换。
 */
export function computeLineRangeMappings(
    original: string,
    modified: string,
    opts?: LineDiffOptions,
): LineRangeMapping[] {
    return computeLineDiff(original, modified, opts).changes
}

export interface LineDiffOptions {
    ignoreTrimWhitespace?: boolean
    maxComputationTimeMs?: number
    /** 同时检测移动的代码块(Monaco computeMoves,diffEditor.experimental.showMoves 用) */
    computeMoves?: boolean
    /** Monaco diffAlgorithm:'advanced'(默认)或 'legacy'(LcsDiff,不做移动检测) */
    algorithm?: 'legacy' | 'advanced'
    /** Monaco extendToSubwords:字级 diff 再按子词(fooBar = foo + Bar)整段标出(行内补全的 inline edit 用) */
    extendToSubwords?: boolean
}

/** Monaco MovedText:一块代码从 original 的行区间挪到 modified 的行区间(半开,1-based),changes 是块里面还有的小改动 */
export interface MovedText {
    originalStart: number
    originalEnd: number
    modifiedStart: number
    modifiedEnd: number
    changes: LineRangeMapping[]
}

/** 同 computeLineRangeMappings,另报告是否超时(Monaco LinesDiff.hitTimeout → IDocumentDiff.quitEarly) */
/** Monaco LegacyLinesDiffComputer:LcsDiff 逐行 + 字级,结果拼成 LineRangeMapping(相邻相切的合并) */
function legacyDiff(
    oLines: string[], mLines: string[], oStarts: number[], mStarts: number[], opts: LineDiffOptions,
): { changes: LineRangeMapping[], moves: MovedText[], hitTimeout: boolean } {
    const r = new DiffComputer(oLines, mLines, {
        maxComputationTime: opts.maxComputationTimeMs ?? 5000,
        shouldIgnoreTrimWhitespace: opts.ignoreTrimWhitespace !== false,
        shouldComputeCharChanges: true,
        shouldMakePrettyDiff: true,
        shouldPostProcessCharChanges: true,
    }).computeDiff() as { quitEarly: boolean, changes: LegacyLineChange[] }
    const changes: LineRangeMapping[] = []
    const off = (starts: number[], lines: string[], line: number, col: number) => starts[line - 1] + Math.min(col - 1, lines[line - 1].length)
    for (const c of r.changes) {
        const m: LineRangeMapping = {
            originalStart: c.originalEndLineNumber === 0 ? c.originalStartLineNumber + 1 : c.originalStartLineNumber,
            originalEnd: c.originalEndLineNumber === 0 ? c.originalStartLineNumber + 1 : c.originalEndLineNumber + 1,
            modifiedStart: c.modifiedEndLineNumber === 0 ? c.modifiedStartLineNumber + 1 : c.modifiedStartLineNumber,
            modifiedEnd: c.modifiedEndLineNumber === 0 ? c.modifiedStartLineNumber + 1 : c.modifiedEndLineNumber + 1,
            innerChanges: (c.charChanges ?? []).map(x => ({
                originalFrom: off(oStarts, oLines, x.originalStartLineNumber, x.originalStartColumn),
                originalTo: off(oStarts, oLines, x.originalEndLineNumber, x.originalEndColumn),
                modifiedFrom: off(mStarts, mLines, x.modifiedStartLineNumber, x.modifiedStartColumn),
                modifiedTo: off(mStarts, mLines, x.modifiedEndLineNumber, x.modifiedEndColumn),
            })),
            ...(c.charChanges ? null : { noInner: true as const }),
        }
        const last = changes[changes.length - 1]
        if (last && (last.modifiedEnd === m.modifiedStart || last.originalEnd === m.originalStart)) {
            last.originalEnd = m.originalEnd
            last.modifiedEnd = m.modifiedEnd
            last.innerChanges.push(...m.innerChanges)
            if (m.noInner) last.noInner = true
        } else changes.push(m)
    }
    return { changes, moves: [], hitTimeout: r.quitEarly }
}

interface LegacyLineChange {
    originalStartLineNumber: number
    originalEndLineNumber: number
    modifiedStartLineNumber: number
    modifiedEndLineNumber: number
    charChanges?: {
        originalStartLineNumber: number, originalStartColumn: number, originalEndLineNumber: number, originalEndColumn: number
        modifiedStartLineNumber: number, modifiedStartColumn: number, modifiedEndLineNumber: number, modifiedEndColumn: number
    }[]
}

/**
 * Monaco getLineRangeMapping:一条字级 RangeMapping(1-based 行列)推出它占的行区间 [o1,o2) / [m1,m2)。
 * 区间两端落在行首 / 行尾时少算一行:「xxx[ \n」整行没动不算改,「]xxx \n」同理。
 */
export function lineRangeOfRangeMapping(o: Rng, m: Rng, oLines: readonly string[], mLines: readonly string[]): { o1: number, o2: number, m1: number, m2: number } {
    let led = 0, lsd = 0
    if (m.ec === 1 && o.ec === 1 && o.sl <= o.el && m.sl <= m.el) led = -1
    if (m.sc - 1 >= mLines[m.sl - 1].length && o.sc - 1 >= oLines[o.sl - 1].length
        && o.sl <= o.el + led && m.sl <= m.el + led) lsd = 1
    return { o1: o.sl + lsd, o2: o.el + 1 + led, m1: m.sl + lsd, m2: m.el + 1 + led }
}

export function computeLineDiff(
    original: string,
    modified: string,
    opts?: LineDiffOptions,
): { changes: LineRangeMapping[], moves: MovedText[], hitTimeout: boolean } {
    const oLines = splitLinesDiff(original)
    const mLines = splitLinesDiff(modified)
    const starts = (lines: string[]) => {
        const out: number[] = []
        let p = 0
        for (const l of lines) {
            out.push(p)
            p += l.length + 1
        }
        return out
    }
    const oStarts = starts(oLines)
    const mStarts = starts(mLines)
    if (opts?.algorithm === 'legacy') return legacyDiff(oLines, mLines, oStarts, mStarts, opts)
    if (oLines.length <= 1 && oLines.length === mLines.length && oLines[0] === mLines[0]) return { changes: [], moves: [], hitTimeout: false }
    if ((oLines.length === 1 && !oLines[0]) || (mLines.length === 1 && !mLines[0])) {
        return {
            changes: [{
                originalStart: 1, originalEnd: oLines.length + 1,
                modifiedStart: 1, modifiedEnd: mLines.length + 1,
                innerChanges: [{
                    originalFrom: 0, originalTo: oStarts[oLines.length - 1] + oLines[oLines.length - 1].length,
                    modifiedFrom: 0, modifiedTo: mStarts[mLines.length - 1] + mLines[mLines.length - 1].length,
                }],
            }],
            moves: [],
            hitTimeout: false,
        }
    }
    // Monaco diffEditor.maxComputationTime 默认 5000ms(0 = 不限),超时退回整段替换
    const deadline = new Deadline(opts?.maxComputationTimeMs ?? 5000)
    const considerWs = opts?.ignoreTrimWhitespace === false
    const hashes = new Map<string, number>()
    const hash = (l: string) => {
        const t = l.trim()
        let h = hashes.get(t)
        if (h === undefined) {
            h = hashes.size
            hashes.set(t, h)
        }
        return h
    }
    const lineSeq = (lines: string[]): Seq => {
        const h = lines.map(hash)
        return {
            length: h.length,
            get: i => h[i],
            strong: (x, y) => lines[x] === lines[y],
            score: len => 1000 - (len === 0 ? 0 : indentOf(lines[len - 1])) - (len === lines.length ? 0 : indentOf(lines[len])),
            text: (s, e) => lines.slice(s, e).join('\n'),
        }
    }
    const oSeq = lineSeq(oLines)
    const mSeq = lineSeq(mLines)
    let diffs = oSeq.length + mSeq.length < 1700
        ? dpDiff(oSeq, mSeq, deadline, (i, j) => oLines[i] === mLines[j]
            ? (mLines[j].length === 0 ? 0.1 : 1 + Math.log(1 + mLines[j].length))
            : 0.99)
        : myersDiff(oSeq, mSeq, deadline)
    diffs = optimizeDiffs(oSeq, mSeq, diffs)
    // removeVeryShortMatchingLinesBetweenDiffs:夹在两个 diff 间、去空白后 ≤4 字的行并进去
    if (diffs.length) {
        let counter = 0
        let again: boolean
        do {
            again = false
            const r = [diffs[0]]
            for (let i = 1; i < diffs.length; i++) {
                const cur = diffs[i], last = r[r.length - 1]
                const t = oSeq.text(last.e1, cur.s1)
                let solid = 0
                for (let k = 0; k < t.length; k++) if (t[k].trim()) solid++
                if (solid <= 4 && (last.e1 - last.s1 + last.e2 - last.s2 > 5 || cur.e1 - cur.s1 + cur.e2 - cur.s2 > 5)) {
                    again = true
                    r[r.length - 1] = sdJoin(last, cur)
                } else r.push(cur)
            }
            diffs = r
        } while (counter++ < 10 && again)
    }

    const MAX = Number.MAX_SAFE_INTEGER
    const norm = (lines: string[], line: number, col: number): [number, number] => {
        if (line < 1) return [1, 1]
        if (line > lines.length) return [lines.length, lines[lines.length - 1].length + 1]
        return [line, Math.min(col, lines[line - 1].length + 1)]
    }
    const rangeOf = (a: [number, number], b: [number, number]): Rng => ({ sl: a[0], sc: a[1], el: b[0], ec: b[1] })
    const alignments: { o: Rng, m: Rng }[] = []
    const refine = (d: SeqDiff, sink = alignments) => {
        // LineRangeMapping.toRangeMapping2
        const os = d.s1 + 1, oe = d.e1 + 1, ms = d.s2 + 1, me = d.e2 + 1
        let o: Rng, m: Rng
        if (oe >= 1 && oe <= oLines.length && me >= 1 && me <= mLines.length) {
            o = { sl: os, sc: 1, el: oe, ec: 1 }
            m = { sl: ms, sc: 1, el: me, ec: 1 }
        } else if (os < oe && ms < me) {
            o = rangeOf([os, 1], norm(oLines, oe - 1, MAX))
            m = rangeOf([ms, 1], norm(mLines, me - 1, MAX))
        } else {
            o = rangeOf(norm(oLines, os - 1, MAX), norm(oLines, oe - 1, MAX))
            m = rangeOf(norm(mLines, ms - 1, MAX), norm(mLines, me - 1, MAX))
        }
        const s1 = charSlice(oLines, o, considerWs)
        const s2 = charSlice(mLines, m, considerWs)
        let cd = s1.length + s2.length < 500 ? dpDiff(s1, s2, deadline) : myersDiff(s1, s2, deadline)
        cd = optimizeDiffs(s1, s2, cd)
        cd = extendToWords(s1, s2, cd)
        if (opts?.extendToSubwords) cd = extendToWords(s1, s2, cd, (s, o) => s.subword(o), true)
        // removeShortMatches:相隔 ≤2 字就合并
        const joined: SeqDiff[] = []
        for (const s of cd) {
            const last = joined[joined.length - 1]
            if (last && (s.s1 - last.e1 <= 2 || s.s2 - last.e2 <= 2)) joined[joined.length - 1] = sdJoin(last, s)
            else joined.push(s)
        }
        cd = removeShortTextBetweenLongDiffs(s1, s2, joined)
        for (const x of cd) sink.push({ o: s1.range(x.s1, x.e1), m: s2.range(x.s2, x.e2) })
    }
    let last1 = 0, last2 = 0
    // 行哈希相等但原文不同(只差首尾空白):考虑空白时逐行再细分
    const scanWs = (count: number) => {
        if (!considerWs) return
        for (let i = 0; i < count; i++) {
            const a = last1 + i, b = last2 + i
            if (oLines[a] !== mLines[b]) refine(sd(a, a + 1, b, b + 1))
        }
    }
    for (const d of diffs) {
        scanWs(d.s1 - last1)
        last1 = d.e1
        last2 = d.e2
        refine(d)
    }
    scanWs(oLines.length - last1)

    // lineRangeMappingFromRangeMappings:每个字级区间推出行区间,相邻相切的合成一组
    const group = (alignments: { o: Rng, m: Rng }[]): LineRangeMapping[] => {
    const out: LineRangeMapping[] = []
    let prev: { o1: number, o2: number, m1: number, m2: number } | null = null
    for (const { o, m } of alignments) {
        const cur = lineRangeOfRangeMapping(o, m, oLines, mLines)
        const inner = {
            originalFrom: oStarts[o.sl - 1] + o.sc - 1, originalTo: oStarts[o.el - 1] + o.ec - 1,
            modifiedFrom: mStarts[m.sl - 1] + m.sc - 1, modifiedTo: mStarts[m.el - 1] + m.ec - 1,
        }
        const g = out[out.length - 1]
        if (prev && g && ((prev.o1 <= cur.o2 && cur.o1 <= prev.o2) || (prev.m1 <= cur.m2 && cur.m1 <= prev.m2))) {
            g.originalStart = Math.min(g.originalStart, cur.o1)
            g.originalEnd = Math.max(g.originalEnd, cur.o2)
            g.modifiedStart = Math.min(g.modifiedStart, cur.m1)
            g.modifiedEnd = Math.max(g.modifiedEnd, cur.m2)
            g.innerChanges.push(inner)
        } else {
            out.push({ originalStart: cur.o1, originalEnd: cur.o2, modifiedStart: cur.m1, modifiedEnd: cur.m2, innerChanges: [inner] })
        }
        prev = cur
    }
    return out
    }
    const out = group(alignments)
    let moves: MovedText[] = []
    if (opts?.computeMoves) {
        const oH = oLines.map(hash), mH = mLines.map(hash)
        const found = computeMovedLines(toPairs(out), oLines, mLines, {
            hashedOriginal: oH, hashedModified: mH,
            areLinesSimilar: (a, b) => areLinesSimilar(a, b, deadline),
            isValid: () => !deadline.expired(),
        })
        moves = found.map(m => {
            const sink: { o: Rng, m: Rng }[] = []
            refine(sd(m.original.start - 1, m.original.end - 1, m.modified.start - 1, m.modified.end - 1), sink)
            return {
                originalStart: m.original.start, originalEnd: m.original.end,
                modifiedStart: m.modified.start, modifiedEnd: m.modified.end,
                changes: group(sink),
            }
        })
    }
    return { changes: out, moves, hitTimeout: deadline.hit }
}
