import type { EditorState } from '../model/state'
import { CharCategory } from '../model/charcategory'

export interface FindQuery {
    query: string
    caseSensitive?: boolean
    wholeWord?: boolean
    regex?: boolean
    from?: number
    to?: number
}

export function findMatches(state: EditorState, spec: FindQuery): { from: number, to: number }[] {
    if (!spec.query) return []
    const text = state.sliceDoc()
    return findInText(text, spec, spec.wholeWord ? state.charCategorizer(0) : null)
}

export function findInText(
    text: string,
    spec: FindQuery,
    cat: ((ch: string) => CharCategory) | null = null,
): { from: number, to: number }[] {
    if (!spec.query) return []
    const lo = Math.max(0, spec.from ?? 0)
    const hi = Math.min(text.length, spec.to ?? text.length)
    // 正则可以在空文档 / 空行上空匹配(Monaco:空文档里 ^ 有 1 个命中)
    if (spec.regex) {
        if (lo > hi) return []
        return findRegex(text, spec.query, !!spec.caseSensitive, lo, hi, spec.wholeWord ? cat : null)
    }
    if (!text || lo >= hi) return []
    const needle = spec.caseSensitive ? spec.query : spec.query.toLowerCase()
    const haystack = spec.caseSensitive ? text : text.toLowerCase()
    const hits: { from: number, to: number }[] = []
    let idx = lo
    while (idx < hi && (idx = haystack.indexOf(needle, idx)) !== -1) {
        if (idx >= hi) break
        const end = idx + spec.query.length
        if (end > hi) break
        if (!spec.wholeWord || isWordBoundary(text, idx, needle.length, cat))
            hits.push({ from: idx, to: end })
        idx += needle.length || 1
    }
    return hits
}

/** Monaco isMultilineRegexSource:含换行、\n、\r、\W 的正则整篇搜,其余逐行搜。 */
export function isMultilineRegexSource(src: string): boolean {
    for (let i = 0; i < src.length; i++) {
        const ch = src.charCodeAt(i)
        if (ch === 10) return true
        if (ch === 92) {
            i++
            if (i >= src.length) break
            const next = src[i]
            if (next === 'n' || next === 'r' || next === 'W') return true
        }
    }
    return false
}

/** Monaco strings.createRegExp(global + unicode;整篇搜时加 m)。非法 → null。 */
export function searchRegExp(pattern: string, caseSensitive: boolean, extra = ''): RegExp | null {
    const flags = 'g' + (caseSensitive ? '' : 'i') + (isMultilineRegexSource(pattern) ? 'm' : '') + 'u' + extra
    try { return new RegExp(pattern, flags) }
    catch { return null }
}

// Monaco TextModelSearch.Searcher.next 的逐字搬运:空匹配卡在原地 → 前进一个码点;
// 上一个命中顶到文本末尾 → 停(所以非空命中吃到行尾后,这一行不再报行尾的空命中)。
function searchIn(re: RegExp, s: string, base: number, ok: (from: number, len: number) => boolean, out: { from: number, to: number }[]) {
    re.lastIndex = 0
    let prevStart = -1
    let prevLen = 0
    for (;;) {
        if (prevStart + prevLen === s.length) return
        const m = re.exec(s)
        if (!m) return
        const start = m.index
        const len = m[0].length
        if (start === prevStart && len === prevLen) {
            if (len) return
            const cp = s.codePointAt(re.lastIndex)
            re.lastIndex += cp !== undefined && cp > 0xffff ? 2 : 1
            continue
        }
        prevStart = start
        prevLen = len
        if (ok(base + start, len)) out.push({ from: base + start, to: base + start + len })
    }
}

function findRegex(
    text: string,
    pattern: string,
    caseSensitive: boolean,
    lo: number,
    hi: number,
    cat: ((ch: string) => CharCategory) | null,
): { from: number, to: number }[] {
    const re = searchRegExp(pattern, caseSensitive)
    if (!re) return []
    const hits: { from: number, to: number }[] = []
    const ok = (from: number, len: number) => !cat || isWordBoundary(text, from, len, cat)
    if (re.multiline) {
        searchIn(re, text.slice(lo, hi), lo, ok, hits)
        return hits
    }
    // 逐行:范围首行从 lo 起、末行到 hi 止(Monaco 同样截行,所以 ^ 在范围起点也算行首)
    let start = lo > 0 ? text.lastIndexOf('\n', lo - 1) + 1 : 0
    for (;;) {
        let end = text.indexOf('\n', start)
        if (end < 0) end = text.length
        const a = Math.max(start, lo)
        const b = Math.min(end, hi)
        if (a <= b) searchIn(re, text.slice(a, b), a, ok, hits)
        if (end >= hi || end >= text.length) break
        start = end + 1
    }
    return hits
}

// Monaco replacePattern.ts:替换串 = 一串 ReplacePiece(字面段 / 捕获组引用,引用可带 \u \U \l \L 大小写操作)。
//   \n 换行、\t Tab、\\ 反斜杠;$$ 字面 $;$0 / $& 整段;$n / $nn 第 n 组;其余原样(含 \E、$<name>、末尾的 \ 和 $)
export class ReplacePiece {
    static staticValue(value: string): ReplacePiece { return new ReplacePiece(value, -1, null) }
    static matchIndex(index: number): ReplacePiece { return new ReplacePiece(null, index, null) }
    static caseOps(index: number, caseOps: string[]): ReplacePiece { return new ReplacePiece(null, index, caseOps) }

    readonly caseOps: string[] | null
    private constructor(readonly staticValue: string | null, readonly matchIndex: number, caseOps: string[] | null) {
        this.caseOps = caseOps && caseOps.length ? caseOps.slice() : null
    }
}

export class ReplacePattern {
    static fromStaticValue(value: string): ReplacePattern { return new ReplacePattern([ReplacePiece.staticValue(value)]) }

    private readonly pieces: ReplacePiece[]
    /** 全是字面段(没有 $n / \u 之类) */
    private readonly staticValue: string | null

    get hasReplacementPatterns(): boolean { return this.staticValue === null }

    constructor(pieces: ReplacePiece[] | null) {
        this.pieces = pieces ?? []
        if (this.pieces.length === 0) this.staticValue = ''
        else if (this.pieces.length === 1 && this.pieces[0].staticValue !== null) this.staticValue = this.pieces[0].staticValue
        else this.staticValue = null
    }

    /** matches = 正则 exec 的结果(含各捕获组);null = 没有命中信息,引用一律当空串 */
    buildReplaceString(matches: readonly (string | undefined)[] | null, preserveCase?: boolean): string {
        if (this.staticValue !== null) return preserveCase ? buildReplaceStringWithCasePreserved(matches, this.staticValue) : this.staticValue
        let out = ''
        for (const piece of this.pieces) {
            if (piece.staticValue !== null) { out += piece.staticValue; continue }
            const g = substituteGroup(piece.matchIndex, matches)
            const ops = piece.caseOps
            if (!ops) { out += g; continue }
            // 大小写操作逐字符:u / l 只管一个字符并用掉,U / L 管到结尾;操作用完后原样
            let k = 0
            for (let i = 0; i < g.length; i++) {
                if (k >= ops.length) { out += g.slice(i); break }
                const op = ops[k]
                out += op === 'U' || op === 'u' ? g[i].toUpperCase() : g[i].toLowerCase()
                if (op === 'u' || op === 'l') k++
            }
        }
        return out
    }
}

export function parseReplaceString(s: string): ReplacePattern {
    if (!s) return new ReplacePattern(null)
    const pieces: ReplacePiece[] = []
    let text = ''
    let ops: string[] = []
    const ref = (index: number) => {
        if (text) pieces.push(ReplacePiece.staticValue(text))
        pieces.push(ReplacePiece.caseOps(index, ops))
        text = ''
        ops = []
    }
    for (let i = 0; i < s.length; i++) {
        const ch = s[i]
        if (ch === '\\') {
            i++
            if (i >= s.length) { text += ch; break }
            const n = s[i]
            if (n === '\\') text += '\\'
            else if (n === 'n') text += '\n'
            else if (n === 't') text += '\t'
            else if (n === 'u' || n === 'U' || n === 'l' || n === 'L') ops.push(n)
            else text += ch + n
            continue
        }
        if (ch === '$') {
            i++
            if (i >= s.length) { text += ch; break }
            const n = s[i]
            if (n === '$') text += '$'
            else if (n === '0' || n === '&') ref(0)
            else if (n >= '1' && n <= '9') {
                const nn = s[i + 1]
                if (nn !== undefined && nn >= '0' && nn <= '9') { ref(Number(n + nn)); i++ }
                else ref(Number(n))
            }
            else text += ch + n
            continue
        }
        text += ch
    }
    if (text) pieces.push(ReplacePiece.staticValue(text))
    return new ReplacePattern(pieces)
}

// Monaco ReplacePattern._substitute:组号超出 → 逐位退回($12 只有 1 组 = 第 1 组 + "2"),一个都不够就原样
function substituteGroup(index: number, m: readonly (string | undefined)[] | null): string {
    if (!m) return ''
    if (index === 0) return m[0] ?? ''
    let rest = ''
    while (index > 0) {
        if (index < m.length) return (m[index] || '') + rest
        rest = String(index % 10) + rest
        index = Math.floor(index / 10)
    }
    return '$' + rest
}

/** Monaco buildReplaceStringWithCasePreserved:按 - 或 _ 分段(两边段数相同)逐段套;全大写 / 全小写 / 首字母。 */
export function replaceWithCasePreserved(matched: string, pattern: string): string {
    if (!matched) return pattern
    for (const sep of ['-', '_']) {
        const other = sep === '-' ? '_' : '-'
        const splits = (sep2: string) => matched.includes(sep2) && pattern.includes(sep2)
            && matched.split(sep2).length === pattern.split(sep2).length
        if (splits(sep) && !splits(other)) {
            const ms = matched.split(sep)
            return pattern.split(sep).map((p, i) => replaceWithCasePreserved(ms[i], p)).join(sep)
        }
    }
    if (matched.toUpperCase() === matched) return pattern.toUpperCase()
    if (matched.toLowerCase() === matched) return pattern.toLowerCase()
    if (!pattern) return pattern
    if (matched[0].toLowerCase() !== matched[0]) return pattern[0].toUpperCase() + pattern.slice(1)
    if (matched[0].toUpperCase() !== matched[0]) return pattern[0].toLowerCase() + pattern.slice(1)
    return pattern
}

/** Monaco base/common/search.buildReplaceStringWithCasePreserved:matches[0] 是被替换的原文;没有命中或原文为空 → 原样 */
export function buildReplaceStringWithCasePreserved(matches: readonly (string | undefined)[] | null, pattern: string): string {
    return matches && matches[0] ? replaceWithCasePreserved(matches[0], pattern) : pattern
}

/** 正则替换串(Monaco ReplacePattern.buildReplaceString):全是字面段时 preserveCase 才生效。 */
export function expandRegexReplacement(
    text: string,
    pattern: string,
    caseSensitive: boolean,
    from: number,
    to: number,
    replacement: string,
    preserveCase = false,
): string {
    const replacePattern = parseReplaceString(replacement)
    if (!replacePattern.hasReplacementPatterns) return replacePattern.buildReplaceString([text.slice(from, to)], preserveCase)
    // 在命中原位重跑(粘性),前瞻 / \b / ^ 等依赖上下文的写法才拿得到捕获组;逐行搜的正则只给它那一行
    let m: RegExpExecArray | null = null
    const re = searchRegExp(pattern, caseSensitive, 'y')
    if (re) {
        let base = 0
        let hay = text
        if (!re.multiline) {
            base = from > 0 ? text.lastIndexOf('\n', from - 1) + 1 : 0
            const end = text.indexOf('\n', to)
            hay = text.slice(base, end < 0 ? text.length : end)
        }
        re.lastIndex = from - base
        m = re.exec(hay)
        if (m && m[0].length !== to - from) m = searchRegExp(pattern, caseSensitive)?.exec(text.slice(from, to)) ?? null
    }
    return replacePattern.buildReplaceString(m, preserveCase)
}

export function isWordBoundary(text: string, from: number, len: number, cat: ((ch: string) => CharCategory) | null): boolean {
    if (!cat) return true
    const before = from > 0 ? text[from - 1] : ''
    const after = from + len < text.length ? text[from + len] : ''
    return cat(before) !== CharCategory.Word && cat(after) !== CharCategory.Word
}
