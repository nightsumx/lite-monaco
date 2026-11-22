// 括号代数：一对表 + 深度扫。着色 / 匹配跳转 / 闭括号缩进共用这一套。
//
// 字符串、注释、正则、模板串字面部分里的括号不算(Monaco:括号树只收 StandardTokenType.Other 里的括号)。
// 判断先问 owner 登记的外部来源(lang/tsbrackets:TS 语法树,比 TextMate 准),没有再靠 shiki 的 scope,
// 按 view 的 token 缓存逐行算,见下面「跳过谓词」。都没有(没装 shiki、大文档还没 tokenize 到的行)就照纯文本算。

import type { Rope } from '../model/rope'
import type { EditorState, StateCommand, Transaction } from '../model/state'
import { Facet } from '../model/state'
import { EditorSelection, type SelectionRange } from '../model/selection'
import { lineTokenTypes, selectTokenCache, tokenLinesView, TT_STRING, type GrammarState } from '../view/tokens'
import { bracketRegExp, eachBracketMatch } from './bracketrule'

export const OPEN_CLOSE: Record<string, string> = { '(': ')', '[': ']', '{': '}' }
export const CLOSE_OPEN: Record<string, string> = { ')': '(', ']': '[', '}': '{' }
const OPEN = '([{'
const CLOSE = ')]}'

// ── 语言配置(setLanguageConfiguration 的 brackets / colorizedBracketPairs)──
// 匹配高亮 / 跳转(matchBracketAt)和彩虹括号(bracketSpans)按这张表走;不传表 = 上面写死的 () [] {}。
// 括号可以是多字符(begin/end、if/fi、(* *)、<!-- -->):词法规则同括号树(bracketrule:长的优先、大小写不敏感、字母起止的带词边界)。
// 全是单字符的表(绝大多数语言)逐字符扫,不碰正则;只要有一个多字符括号,整张表改成按行跑那条正则 ——
// 两种扫法住在同一对游标(FwdTokens / BackTokens)后面,上面的算法(配对、包围、着色)只看 token,不分哪种。
// 超大文档:Monaco 只在文档 > 5,000,000 字符(canBuildAST)时放弃括号树改走逐行老算法;这里实时匹配本来就只扫光标邻域的窗口,
// 不随文档大小增长,不需要这条退路 —— 有意不做。
// 不足:窗口(selectionlayer / bracketcolor 的邻域)从一个词中间切开时,窗口头尾那半个词会被当成括号(几万字符外,不处理)。
export interface BracketTable {
    open: Record<string, string>
    close: Record<string, string>
    custom: boolean
    /** 括号文本 → (种类号 << 1) | (开括号 ? 1 : 0)。同一种类 = 互相配对的开闭文本(共用闭括号的几个开括号并成一类);多字符表的键是小写 */
    tok: Record<string, number>
    kinds: number
    /** ASCII 单字符括号的 tok 编码速查表(其余 -1);逐字符扫的热路径用它代替字典查找 */
    lut: Int16Array
    /** 含多字符括号时,全部括号文本的正则;全是单字符 = null(逐字符扫) */
    re: RegExp | null
}
export interface BracketsConfig { brackets: readonly (readonly [string, string])[], colorized?: readonly (readonly [string, string])[] }
export const bracketsConfig = Facet.define<BracketsConfig, BracketsConfig | null>({ combine: v => v[v.length - 1] ?? null })
const tableCache = new WeakMap<object, BracketTable>()
/** 括号对列表 → 配对表(开闭相同的对不收;含多字符括号时按小写存) */
export function makeBracketTable(pairs: readonly (readonly [string, string])[]): BracketTable {
    const multi = pairs.some(([o, c]) => o.length > 1 || c.length > 1)
    const norm = multi ? (s: string) => s.toLowerCase() : (s: string) => s
    const open: Record<string, string> = Object.create(null), close: Record<string, string> = Object.create(null)
    const parent = new Map<string, string>()
    const find = (x: string): string => { while (parent.get(x) !== x) x = parent.get(x)!; return x }
    for (const [o0, c0] of pairs) {
        const o = norm(o0), cl = norm(c0)
        if (!o || !cl || o === cl) continue
        open[o] = cl; close[cl] = o
        if (!parent.has(o)) parent.set(o, o)
        if (!parent.has(cl)) parent.set(cl, cl)
        parent.set(find(cl), find(o))
    }
    const tok: Record<string, number> = Object.create(null)
    const kindOf = new Map<string, number>()
    for (const text of parent.keys()) {
        const root = find(text)
        let k = kindOf.get(root)
        if (k === undefined) kindOf.set(root, k = kindOf.size)
        tok[text] = (k << 1) | (open[text] !== undefined ? 1 : 0)
    }
    const lut = new Int16Array(128).fill(-1)
    for (const text of Object.keys(tok)) if (text.length === 1 && text.charCodeAt(0) < 128) lut[text.charCodeAt(0)] = tok[text]
    return { open, close, custom: true, tok, kinds: kindOf.size, lut, re: multi ? bracketRegExp(parent.keys()) : null }
}
function tableOf(_c: BracketsConfig, pairs: readonly (readonly [string, string])[]): BracketTable {
    let t = tableCache.get(pairs)
    if (!t) { t = makeBracketTable(pairs); tableCache.set(pairs, t) }
    return t
}
export const DEFAULT_BRACKETS: BracketTable = { ...makeBracketTable([['(', ')'], ['[', ']'], ['{', '}']]), open: OPEN_CLOSE, close: CLOSE_OPEN, custom: false }
/** 括号匹配用的表 */
export function bracketTable(state: EditorState): BracketTable {
    const c = state.facet(bracketsConfig)
    return c ? tableOf(c, c.brackets) : DEFAULT_BRACKETS
}
/** 彩虹括号用的表(colorizedBracketPairs 没给就用 brackets,同 Monaco) */
export function colorizedBracketTable(state: EditorState): BracketTable {
    const c = state.facet(bracketsConfig)
    return c ? tableOf(c, c.colorized ?? c.brackets) : DEFAULT_BRACKETS
}

// —— 括号 token 游标 ——
// text 里的括号 token 一个一个往后(FwdTokens)/往前(BackTokens)给,属性 s / e = [起, 止) 下标,code = tok 编码。
// 游标不管跳过谓词:调用方先用 code 做便宜的筛(种类、开闭),筛过了才问 skip(跳过谓词按行算掩码,少问一行是一行)。
// token 不跨行。多字符表一次切一行跑正则(词边界按行算);单字符表逐字符走,不预扫。

/** i 所在行的行首(i 是位置,可以等于 text.length) */
const lineStartOf = (text: string, i: number): number => i <= 0 ? 0 : text.lastIndexOf('\n', i - 1) + 1

/** 把 text[ls, le) 这一行的括号 token 按 (起, 止, 编码) 三个一组填进 buf */
function lineTokens(tbl: BracketTable, text: string, ls: number, le: number, buf: number[]): void {
    buf.length = 0
    if (le > ls) eachBracketMatch(tbl.re!, text.slice(ls, le), (i, m) => {
        const code = tbl.tok[m.toLowerCase()]
        if (code !== undefined) buf.push(ls + i, ls + i + m.length, code)
    })
}

/** 往后:止点 > from 的括号 token,按位置顺序 */
class FwdTokens {
    s = 0
    e = 0
    code = 0
    private i: number // 单字符:下一个下标;多字符:下一行的行首
    private readonly buf: number[] = []
    private bi = 0
    constructor(private readonly tbl: BracketTable, private readonly text: string, private readonly from: number) {
        this.i = tbl.re ? lineStartOf(text, Math.max(0, from)) : Math.max(0, from)
    }
    next(): boolean {
        const { tbl, text } = this
        if (!tbl.re) {
            while (this.i < text.length) {
                const i = this.i++
                const c = text.charCodeAt(i)
                const code = c < 128 ? tbl.lut[c] : (tbl.tok[text[i]] ?? -1)
                if (code < 0) continue
                this.s = i; this.e = i + 1; this.code = code
                return true
            }
            return false
        }
        const b = this.buf
        for (;;) {
            while (this.bi < b.length) {
                const k = this.bi
                this.bi += 3
                if (b[k + 1] <= this.from) continue
                this.s = b[k]; this.e = b[k + 1]; this.code = b[k + 2]
                return true
            }
            if (this.i > text.length) return false
            const ls = this.i
            let le = text.indexOf('\n', ls)
            if (le < 0) { this.i = text.length + 1; le = text.length } else this.i = le + 1
            lineTokens(tbl, text, ls, le, b)
            this.bi = 0
        }
    }
}

/** 往前:起点 < from 的括号 token,按位置倒序 */
class BackTokens {
    s = 0
    e = 0
    code = 0
    private i: number // 单字符:下一个下标(往下减);多字符:下一行里要找的位置(<0 = 没有了)
    private readonly buf: number[] = []
    private bi = -1
    private limit = Infinity
    private firstLimit: number
    constructor(private readonly tbl: BracketTable, private readonly text: string, from: number) {
        const p = Math.min(Math.max(from, 0), text.length)
        this.firstLimit = p
        this.i = tbl.re ? p : p - 1
    }
    next(): boolean {
        const { tbl, text } = this
        if (!tbl.re) {
            while (this.i >= 0) {
                const i = this.i--
                const c = text.charCodeAt(i)
                const code = c < 128 ? tbl.lut[c] : (tbl.tok[text[i]] ?? -1)
                if (code < 0) continue
                this.s = i; this.e = i + 1; this.code = code
                return true
            }
            return false
        }
        const b = this.buf
        for (;;) {
            while (this.bi >= 0) {
                const k = this.bi
                this.bi -= 3
                if (b[k] >= this.limit) continue
                this.s = b[k]; this.e = b[k + 1]; this.code = b[k + 2]
                return true
            }
            if (this.i < 0) return false
            const ls = lineStartOf(text, this.i)
            let le = text.indexOf('\n', ls)
            if (le < 0) le = text.length
            lineTokens(tbl, text, ls, le, b)
            this.bi = b.length - 3
            this.limit = this.firstLimit
            this.firstLimit = Infinity
            this.i = ls - 1
        }
    }
}

// —— 电键(Monaco BracketElectricCharacterSupport):打下哪些字符会触发「行首闭括号回缩」,以及触发后要对齐哪种开括号 ——

/** 会触发回缩的字符 = 各闭括号的最后一个字符(去重,按配对表顺序;多字符表大小写不敏感,大写也算) */
export function electricCharacters(tbl: BracketTable = DEFAULT_BRACKETS): string[] {
    const out = new Set<string>()
    for (const k of Object.keys(tbl.close)) {
        const c = k[k.length - 1]
        out.add(c)
        if (tbl.re) out.add(c.toUpperCase())
    }
    return [...out]
}

/**
 * 在 before(光标前的行文本)后打 ch:若 before + ch 里最后一个括号是闭括号,且它前面只有空白 → 返回要对齐的闭括号(matchOpenBracket 是该闭括号本身,
 * 同 Monaco IElectricAction)。tokenType 是光标处 token 的 StandardTokenType(1 注释 / 2 字符串 / 3 正则里的括号不算,返回 null)。
 */
export function electricAction(tbl: BracketTable, before: string, ch: string, tokenType = 0): { matchOpenBracket: string } | null {
    if (tokenType === 1 || tokenType === 2 || tokenType === 3) return null
    const text = before + ch
    const c = new BackTokens(tbl, text, text.length)
    if (!c.next()) return null
    if (c.code & 1 || !/^\s*$/.test(text.slice(0, c.s))) return null
    return { matchOpenBracket: text.slice(c.s, c.e) }
}

/** 文档位置 → 这里的括号是否不算(在字符串/注释/正则里)。undefined = 全都算。 */
export type BracketSkip = ((pos: number) => boolean) | undefined

/** 一对括号:[open, openEnd) 是开括号 token,[close, closeEnd) 是闭括号 token(文档偏移) */
export interface BracketPair { open: number, openEnd: number, close: number, closeEnd: number }

// from(下标)起往后,找 kind 这一类配得上「前面已有一只开括号」的闭括号;同类嵌套按深度数。返回 [起, 止) 下标
function findClose(tbl: BracketTable, text: string, base: number, skip: BracketSkip, from: number, kind: number): [number, number] | null {
    const c = new FwdTokens(tbl, text, from)
    let depth = 1
    while (c.next()) {
        if (c.code >> 1 !== kind) continue
        if (skip?.(base + c.s)) continue
        if (c.code & 1) depth++
        else if (--depth === 0) return [c.s, c.e]
    }
    return null
}

// from(下标)之前,找 kind 这一类配得上「后面已有一只闭括号」的开括号
function findOpen(tbl: BracketTable, text: string, base: number, skip: BracketSkip, from: number, kind: number): [number, number] | null {
    const c = new BackTokens(tbl, text, from)
    let depth = 1
    while (c.next()) {
        if (c.code >> 1 !== kind) continue
        if (skip?.(base + c.s)) continue
        if (!(c.code & 1)) depth++
        else if (--depth === 0) return [c.s, c.e]
    }
    return null
}

// text 是文档 [base, base+text.length) 的窗口;skip 收文档位置。open 是表里的键(多字符表为小写),text[from..] 以它开头。返回闭括号起点下标,没有 -1
export function matchForward(text: string, open: string, from: number, skip?: BracketSkip, base = 0, tbl: BracketTable = DEFAULT_BRACKETS): number {
    const code = tbl.tok[open]
    if (code === undefined || !(code & 1)) return -1
    return findClose(tbl, text, base, skip, from + open.length, code >> 1)?.[0] ?? -1
}

// from 是闭括号 close 的起点下标;返回开括号起点下标,没有 -1
export function matchBackward(text: string, close: string, from: number, skip?: BracketSkip, base = 0, tbl: BracketTable = DEFAULT_BRACKETS): number {
    const code = tbl.tok[close]
    if (code === undefined || code & 1) return -1
    return findOpen(tbl, text, base, skip, from, code >> 1)?.[0] ?? -1
}

// —— 光标处的括号对(Monaco BracketMatchingController,matchBrackets: 'always')——
// text 是文档 [base, base+text.length) 的窗口,pos 是文档偏移;返回两个括号 token 的文档范围。
// 只在窗口里找(调用方定窗口大小),每次 O(窗口)。

/**
 * bracketPairs.matchBracket(AST 版):pos 贴着的括号(括号 token 的范围含两端,光标在多字符括号中间也算),两侧都能配对取右边那只(findLastMaxBy 起点)。
 */
export function matchBracketPair(text: string, base: number, pos: number, skip?: BracketSkip, tbl: BracketTable = DEFAULT_BRACKETS): BracketPair | null {
    const p = pos - base
    const c = new FwdTokens(tbl, text, Math.max(0, p - 1))
    const cand: number[] = [] // (起, 止, 编码) 三个一组;起 ≤ p,至多两个
    while (c.next() && c.s <= p) cand.push(c.s, c.e, c.code)
    for (let k = cand.length - 3; k >= 0; k -= 3) {
        const s = cand[k], e = cand[k + 1], code = cand[k + 2]
        if (skip?.(base + s)) continue
        const open = code & 1
        const r = open ? findClose(tbl, text, base, skip, e, code >> 1) : findOpen(tbl, text, base, skip, s, code >> 1)
        if (r) return open ? { open: base + s, openEnd: base + e, close: base + r[0], closeEnd: base + r[1] } : { open: base + r[0], openEnd: base + r[1], close: base + s, closeEnd: base + e }
    }
    return null
}

/** matchBracketPair 只取两只括号的起点:[开, 闭] */
export function matchBracketAt(text: string, base: number, pos: number, skip?: BracketSkip, tbl: BracketTable = DEFAULT_BRACKETS): [number, number] | null {
    const r = matchBracketPair(text, base, pos, skip, tbl)
    return r && [r.open, r.close]
}

/**
 * bracketPairs.findEnclosingBrackets(AST 版):严格包住 pos 的最内层已闭合括号对(光标在多字符括号中间也算被它包住);没闭合的开括号跳过往外找。
 * 配对按同类括号计深度(同 matchForward)。向前(pos → 窗口头)扫:每类第 k 个没配上的开括号正好配
 * 「从 pos 往后看」该类第 k 个没配上的闭括号,第一个配得上的就是答案。往后那一侧按需推进(只扫到答案的
 * 闭括号为止),工作量跟到包围括号的距离成正比,不是整个窗口 —— 跳过谓词逐行算掩码,少问一行是一行。
 * 横跨 pos 的 token 只算一次:开括号归向前一侧,闭括号归向后一侧。
 */
export function enclosingBracketPair(text: string, base: number, pos: number, skip?: BracketSkip, tbl: BracketTable = DEFAULT_BRACKETS): BracketPair | null {
    const p = pos - base
    if (p < 0 || p > text.length) return null
    const kinds = tbl.kinds
    const closes: number[][] = Array.from({ length: kinds }, () => []) // 每类没配上的闭括号:(起, 止) 成对
    const depth: number[] = new Array(kinds).fill(0)
    const fwd = new FwdTokens(tbl, text, p)
    // 往后推进到该类有第 k 个没配上的闭括号(k 从 0 起);到窗口尾也没有 → false
    const closeAt = (o: number, k: number): boolean => {
        while (closes[o].length <= 2 * k && fwd.next()) {
            const open = fwd.code & 1
            if (open && fwd.s < p) continue
            if (skip?.(base + fwd.s)) continue
            const kd = fwd.code >> 1
            if (open) depth[kd]++
            else if (depth[kd] > 0) depth[kd]--
            else closes[kd].push(fwd.s, fwd.e)
        }
        return 2 * k < closes[o].length
    }
    const pending: number[] = new Array(kinds).fill(0)
    const used: number[] = new Array(kinds).fill(0)
    const dead: boolean[] = new Array(kinds).fill(false) // 该类往后已没有没配上的闭括号,再往外的同类开括号都配不上
    const back = new BackTokens(tbl, text, p)
    while (back.next()) {
        const open = back.code & 1
        if (!open && back.e > p) continue
        if (skip?.(base + back.s)) continue
        const o = back.code >> 1
        if (!open) { pending[o]++; continue }
        if (pending[o] > 0) { pending[o]--; continue }
        if (dead[o]) continue
        const k = used[o]++
        if (closeAt(o, k)) return { open: base + back.s, openEnd: base + back.e, close: base + closes[o][2 * k], closeEnd: base + closes[o][2 * k + 1] }
        dead[o] = true
        if (dead.every(Boolean)) return null
    }
    return null
}

/** enclosingBracketPair 只取两只括号的起点:[开, 闭] */
export function enclosingBrackets(text: string, base: number, pos: number, skip?: BracketSkip, tbl: BracketTable = DEFAULT_BRACKETS): [number, number] | null {
    const r = enclosingBracketPair(text, base, pos, skip, tbl)
    return r && [r.open, r.close]
}

/**
 * bracketPairs.findNextBracket(AST 版):pos 及之后第一只括号。不在任何闭合对里的位置往后看,
 * 先碰到的闭括号都是多出来的(树里没有),所以就是第一只开括号(没闭合的也算)。返回起点,没有 -1。
 */
export function nextOpenBracket(text: string, base: number, pos: number, skip?: BracketSkip, tbl: BracketTable = DEFAULT_BRACKETS): number {
    const c = new FwdTokens(tbl, text, Math.max(0, pos - base))
    while (c.next()) if (c.code & 1 && !skip?.(base + c.s)) return base + c.s
    return -1
}

export interface BracketSpan {
    from: number
    to: number
    depth: number
}

/**
 * independent = true(选项 bracketPairColorization.independentColorPoolPerBracketType):每种括号各数各的嵌套层数,
 * 不再把别种括号算进深度(Monaco:每种括号类型自己一份颜色池)。
 */
export function bracketSpans(text: string, base = 0, skip?: BracketSkip, independent = false, tbl: BracketTable = DEFAULT_BRACKETS): BracketSpan[] {
    const spans: BracketSpan[] = []
    const stack: number[] = []
    const depthOf = (kind: number) => {
        if (!independent) return stack.length
        let n = 0
        for (const s of stack) if (s === kind) n++
        return n
    }
    const c = new FwdTokens(tbl, text, 0)
    while (c.next()) {
        const pos = base + c.s
        if (skip?.(pos)) continue
        const kind = c.code >> 1
        if (c.code & 1) {
            spans.push({ from: pos, to: base + c.e, depth: depthOf(kind) })
            stack.push(kind)
        } else {
            if (stack.length && stack[stack.length - 1] === kind) stack.pop()
            spans.push({ from: pos, to: base + c.e, depth: depthOf(kind) })
        }
    }
    return spans
}

export function depthAt(text: string, end: number, base: number, skip: BracketSkip, start = 0): number {
    let depth = start
    for (let i = 0; i < end; i++) {
        const ch = text[i]
        const open = OPEN.includes(ch)
        if (!open && !CLOSE.includes(ch)) continue
        if (skip?.(base + i)) continue
        if (open) depth++
        else if (depth > 0) depth--
    }
    return depth
}

/** 去掉 text(文档位置从 base 起)里不算的括号字符(Monaco IndentationContextProcessor:字符串/注释里的括号删掉再套缩进规则)。 */
export function stripSkippedBrackets(text: string, base: number, skip: BracketSkip): string {
    if (!skip) return text
    let out = ''
    let last = 0
    for (let i = 0; i < text.length; i++) {
        if (!OPEN_CLOSE[text[i]] && !CLOSE_OPEN[text[i]]) continue
        if (!skip(base + i)) continue
        out += text.slice(last, i)
        last = i + 1
    }
    return last ? out + text.slice(last) : text
}

// —— 跳过谓词:字符串 / 注释 / 正则里的括号 ——
//
// scope → StandardTokenType 照 vscode-textmate(BasicScopeAttributesProvider):scope 名里第一个命中
// comment|string|regex|meta.embedded 的词定类型,越靠叶子越算数,meta.embedded 重置为 Other。
// 另加 VS Code TS/JS 的 tokenTypes:meta.template.expression 是 Other —— 模板串 ${} 的花括号和里面的代码
// 都算(对照页实测 Monaco 同),${} 里再套字符串又跳过。

const TOKEN_TYPE_RE = /\b(comment|string|regex|meta\.embedded)\b/
const TEMPLATE_EXPR_RE = /\bmeta\.template\.expression\b/

/** scopes 从根到叶。true = 这段是字符串/注释/正则,里面的括号不算。 */
export function isSkipScopes(scopes: readonly string[]): boolean {
    let skip = false
    for (const s of scopes) {
        const m = TOKEN_TYPE_RE.exec(s)
        if (m) skip = m[1] !== 'meta.embedded'
        else if (TEMPLATE_EXPR_RE.test(s)) skip = false
    }
    return skip
}

// 每行一个掩码(1 = 不算的字符),按该行 token 数组的身份缓存:行一重新 tokenize 数组就换了,掩码跟着失效。
// 高亮用的 token 不带 scope(带了贵一倍),这里只给真需要的行补一次带 scope 的 tokenize(接着该行入口
// state,不扫全文)。入口不在字符串/注释里时,行首到第一个「可能开始字符串/注释/正则」的字符(引号、/、#、
// ; - < 等,普通代码字符之外的都算;再加 Lua 长串的 [[)之前一定是代码,问这段里的括号不用 tokenize。
// 紧挨着它的那只括号也不算在内((* OCaml 注释、{- Haskell 注释)。多行注释、模板串续行靠入口 state
// 认出来(safe = 0)。
interface LineSkip { safe: number, mask?: Uint8Array | null }
const lineSkips = new WeakMap<object, LineSkip>()
const NOT_PLAIN = /[^\w$\s()[\]{}.,:=+&|>]|\[\[/

type LinesView = NonNullable<ReturnType<typeof tokenLinesView>>

function entryInSkipScope(st: GrammarState | undefined): boolean {
    if (!st) return false
    const names = st.getInternalStack?.()?.contentNameScopesList?.getScopeNames?.() ?? st.getScopes() ?? []
    // 栈里有字符串/注释就要细看(模板串 ${} 续行:当前是代码,但这一行可能回到字符串里)
    for (const s of names) {
        const m = TOKEN_TYPE_RE.exec(s)
        if (m && m[1] !== 'meta.embedded') return true
    }
    return false
}

function lineSkip(v: LinesView, i: number): LineSkip {
    const rel = v.rel[i]
    let info = lineSkips.get(rel)
    if (!info) {
        const text = v.lines[i]
        // 超过 maxTokenizationLineLength 的行高亮时没交给 grammar(一个没颜色的 token),这里也不问 grammar:
        // 整行都当代码(safe = 整行),不再每键把几十万字符的行 tokenize 一遍
        if (text.length >= v.maxLineLength) {
            info = { safe: text.length }
            lineSkips.set(rel, info)
            return info
        }
        let k = text.search(NOT_PLAIN)
        if (k < 0) k = text.length
        else if (k > 0 && (OPEN_CLOSE[text[k - 1]] || CLOSE_OPEN[text[k - 1]])) k--
        info = { safe: entryInSkipScope(v.statesIn[i]) ? 0 : k }
        lineSkips.set(rel, info)
    }
    return info
}

interface LineGrammar { tokenizeLine(text: string, stack: unknown): { tokens: { startIndex: number, endIndex: number, scopes: string[] }[] } }
const grammars = new WeakMap<object, Map<string, LineGrammar | null>>()

function grammarOf(v: LinesView): LineGrammar | null {
    let m = grammars.get(v.hl)
    if (!m) grammars.set(v.hl, m = new Map())
    let g = m.get(v.lang)
    if (g === undefined) {
        try { g = (v.hl as { getLanguage?: (l: string) => LineGrammar }).getLanguage?.(v.lang) ?? null }
        catch { g = null }
        if (typeof g?.tokenizeLine !== 'function') g = null
        m.set(v.lang, g)
    }
    return g
}

// 高亮时留下的 token 类型(tokens.ts lineTokenTypes)直接给掩码:Comment / String / RegEx 段跳过(引号也在里面,
// indent.ts 的 startsWithString 问的就是行首引号)。String 段里有括号的行不用它 —— 模板串 `${` `}` 的 token 类型
// 是 String(vscode-textmate 不认 meta.template.expression,VS Code 靠 tokenTypes 配置改成 Other),这种行照旧按 scope 算。结果跟 scope 算的一样,只是省掉这一行的 tokenize。
function maskFromTypes(text: string, types: readonly number[]): Uint8Array | null | undefined {
    let mask: Uint8Array | null = null
    for (let k = 0; k < types.length; k += 3) {
        const from = types[k], to = Math.min(types[k + 1], text.length)
        if (types[k + 2] === TT_STRING) {
            for (let p = from; p < to; p++) if (OPEN_CLOSE[text[p]] || CLOSE_OPEN[text[p]]) return undefined
        }
        mask ??= new Uint8Array(text.length)
        mask.fill(1, from, to)
    }
    return mask
}

function lineMask(v: LinesView, i: number, info: LineSkip): Uint8Array | null {
    if (info.mask !== undefined) return info.mask
    const text = v.lines[i]
    const types = lineTokenTypes(v.rel[i])
    if (types) {
        const m = maskFromTypes(text, types)
        if (m !== undefined) return info.mask = m
    }
    let mask: Uint8Array | null = null
    const set = (from: number, to: number) => { (mask ??= new Uint8Array(text.length)).fill(1, from, to) }
    try {
        // 直接问 grammar(tokenizeLine 只要 scope,不配主题,比 codeToTokens + explanation 省一半)
        const g = grammarOf(v)
        const st = v.statesIn[i]
        const stack = st ? st.getInternalStack?.() : null
        if (g && stack !== undefined) {
            for (const tok of g.tokenizeLine(text, stack ?? null).tokens)
                if (isSkipScopes(tok.scopes)) set(tok.startIndex, Math.min(tok.endIndex, text.length))
            info.mask = mask
            return mask
        }
        const r = v.hl.codeToTokens(text, { lang: v.lang, theme: v.theme, includeExplanation: 'scopeName', grammarState: v.statesIn[i] })
        for (const tok of r.tokens[0] ?? []) {
            let off = tok.offset
            for (const seg of tok.explanation ?? []) {
                if (isSkipScopes(seg.scopes.map(s => s.scopeName))) set(off, off + seg.content.length)
                off += seg.content.length
            }
        }
    } catch { mask = null }
    info.mask = mask
    return mask
}

/** 外部跳过来源:doc → 谓词;返回 undefined = 这一版给不了(没就绪、文档太大),退回 shiki scope */
export type BracketSkipSource = (doc: Rope) => BracketSkip
const skipSources = new WeakMap<object, BracketSkipSource>()

/** 给 owner(EditorView)登记外部跳过来源;null 撤销 */
export function setBracketSkipSource(owner: object, source: BracketSkipSource | null): void {
    if (source) skipSources.set(owner, source)
    else skipSources.delete(owner)
}

/**
 * 外部 token 类型来源(Monaco StandardTokenType:0 Other / 1 Comment / 2 String / 3 RegEx)。
 * 给了它,括号跳过(bracketSkip)和 standardTokenTypeAt 都按它走,不再问 shiki。
 * typeAt:位置 → 类型(也是「这一行被问到了」的信号);cheap:第 line 行现在 tokenize 便不便宜(Monaco isCheapToTokenize,缺省 = 便宜)。
 * 返回 undefined = 这一版给不了。
 */
export interface TokenTypes {
    typeAt(pos: number): number
    cheap?(line: number): boolean
    /** 在 pos 处假装插一个字符 ch,那个字符会落进什么类型的 token(Monaco getTokenTypeIfInsertingCharacter:判引号是开串还是收串);缺省 = 不探测 */
    typeIfInserting?(pos: number, ch: string): number
}
export type TokenTypeSource = (doc: Rope) => TokenTypes | undefined
const typeSources = new WeakMap<object, TokenTypeSource>()

export function setTokenTypeSource(owner: object, source: TokenTypeSource | null): void {
    if (source) typeSources.set(owner, source)
    else typeSources.delete(owner)
}

/** 外部 token 类型来源(setTokenTypeSource 登记的)对这篇文档的查询函数;没登记 / 这一版给不了 = undefined(调用方回退自己的词法) */
export function externalTokenType(owner: object | null | undefined, doc: Rope): TokenTypes | undefined {
    return owner ? typeSources.get(owner)?.(doc) : undefined
}

/**
 * pos 处字符所在 token 的类型(Monaco getStandardTokenTypeAtPosition;行尾取最后一个 token)。
 * 先问外部来源,再看高亮时留下的 token 类型;还没 tokenize 的行当 Other。
 */
export function standardTokenTypeAt(owner: object | null | undefined, doc: Rope, pos: number): number {
    const typed = owner ? typeSources.get(owner)?.(doc) : undefined
    if (typed) return typed.typeAt(pos)
    return cachedTokenTypeAt(owner, doc, pos)
}

/**
 * 渲染那一遍分词留下的 token 类型缓存里 pos 处的类型(不问外部来源)。
 * 外部来源自己也能读它:分词器只该被跑一遍(Monaco 同:一份 token store),渲染已经跑过的行不要再跑第二遍。
 */
export function cachedTokenTypeAt(owner: object | null | undefined, doc: Rope, pos: number): number {
    selectTokenCache(owner)
    const v = tokenLinesView()
    if (!v || v.lines.length !== doc.lines || v.lineStart[doc.lines] !== doc.length + 1) return 0
    const line = doc.lineAt(pos)
    if (!v.ready[line.number - 1]) return 0
    const types = lineTokenTypes(v.rel[line.number - 1])
    if (!types) return 0
    const off = Math.min(pos - line.from, Math.max(0, line.length - 1))
    for (let k = 0; k < types.length; k += 3) if (types[k] <= off && off < types[k + 1]) return types[k + 2]
    return 0
}

/**
 * Monaco model.tokenization.isCheapToTokenize(line):这一行之前都 tokenize 过(或它自己是第一个没 tokenize 的短行)。
 * 没有任何 token 来源(没装高亮)= 便宜。
 */
export function isCheapToTokenize(owner: object | null | undefined, doc: Rope, line: number): boolean {
    const typed = owner ? typeSources.get(owner)?.(doc) : undefined
    if (typed) return typed.cheap ? typed.cheap(line) : true
    selectTokenCache(owner)
    const v = tokenLinesView()
    if (!v || v.lines.length !== doc.lines || v.lineStart[doc.lines] !== doc.length + 1) return true
    if (v.ready[line - 1]) return true
    return (line === 1 || !!v.ready[line - 2]) && v.lines[line - 1].length < 2048
}

/**
 * owner(通常是 EditorView)→ 跳过谓词:先问外部来源,再用 token 缓存。缓存和 doc 对不上(没装 shiki、换了文档)
 * 返回 undefined。还没 tokenize 的行(大文档视口外)不跳。谓词按需逐行算掩码,只在被问到的括号所在行花时间。
 */
export function bracketSkip(owner: object | null | undefined, doc: Rope): BracketSkip {
    const ext = owner ? skipSources.get(owner)?.(doc) : undefined
    if (ext) return ext
    const typed = owner ? typeSources.get(owner)?.(doc) : undefined
    if (typed) return (pos) => { const t = typed.typeAt(pos); return t === 1 || t === 2 || t === 3 }
    selectTokenCache(owner)
    const v = tokenLinesView()
    if (!v) return undefined
    const n = v.lines.length
    if (n !== doc.lines || v.lineStart[n] !== doc.length + 1) return undefined
    let i = 0
    return (pos) => {
        // 扫描是顺序的:先看上次那行,不中再二分
        if (!(v.lineStart[i] <= pos && pos < v.lineStart[i + 1])) {
            let lo = 0, hi = n - 1
            while (lo < hi) {
                const mid = (lo + hi + 1) >> 1
                if (v.lineStart[mid] <= pos) lo = mid
                else hi = mid - 1
            }
            i = lo
        }
        if (!v.ready[i]) return false
        const off = pos - v.lineStart[i]
        const info = lineSkip(v, i)
        if (off < info.safe) return false
        const m = lineMask(v, i, info)
        return m !== null && m[off] === 1
    }
}

// —— 命令(Monaco BracketMatchingController)——
// target 通常是 EditorView(键位、命令面板都把 view 传进来),借它的 token 缓存跳过字符串/注释里的括号。
// 命令一次性跑,看全文(Monaco 的括号树不限距离)。

type Target = Parameters<StateCommand>[0]

function scan(target: Target) {
    return { text: target.state.sliceDoc(), skip: bracketSkip(target, target.state.doc) }
}

/** pos 贴着 [from, to) 这只括号(两端都算,光标在多字符括号中间也算) */
const touches = (from: number, to: number, pos: number) => from <= pos && pos <= to

/**
 * Go to Bracket(editor.action.jumpToBracket,⇧⌘\):按每个选区的起点 ——
 * 贴着括号:在开括号旁 → 落到配对闭括号之前;在闭括号旁 → 落到配对开括号之前;
 * 不贴括号:落到包住它的那对的闭括号之前;没有包围就落到后面第一只括号之前。
 */
export const jumpToBracket: StateCommand = (target) => {
    const { state } = target
    const { text, skip } = scan(target)
    const tbl = bracketTable(state)
    const sel = EditorSelection.create(state.selection.ranges.map((r) => {
        const pos = r.from
        let to = -1
        const pair = matchBracketPair(text, 0, pos, skip, tbl)
        if (pair) {
            if (touches(pair.open, pair.openEnd, pos) && !touches(pair.close, pair.closeEnd, pos)) to = pair.close
            else if (touches(pair.close, pair.closeEnd, pos)) to = pair.open
        }
        else to = enclosingBracketPair(text, 0, pos, skip, tbl)?.close ?? nextOpenBracket(text, 0, pos, skip, tbl)
        return EditorSelection.cursor(to >= 0 ? to : pos)
    }), state.selection.mainIndex)
    if (sel.eq(state.selection, true)) return false
    target.dispatch(state.update({ selection: sel, scrollIntoView: true, userEvent: 'select' }))
    return true
}

/**
 * Select to Bracket(editor.action.selectToBracket,Monaco 无默认键位):按每个选区的起点找一对括号 ——
 * 贴着的那对,否则包住的那对,再否则后面第一只括号所在的那对 —— 选中含两只括号在内的整段;
 * 起点在闭括号旁时反向选(锚在闭括号后)。找不到的选区丢掉,全找不到就不动。
 */
export const selectToBracket: StateCommand = target => selectToBracketWith(target, true)

/** selectBrackets=false(Monaco editor.action.selectToBracket 的 selectBrackets 参数):只选括号之间的内容,不含两只括号 */
export function selectToBracketWith(target: Parameters<StateCommand>[0], selectBrackets: boolean): boolean {
    const { state } = target
    const { text, skip } = scan(target)
    const tbl = bracketTable(state)
    const out: SelectionRange[] = []
    let main = 0
    state.selection.ranges.forEach((r, idx) => {
        const pos = r.from
        let pair = matchBracketPair(text, 0, pos, skip, tbl) ?? enclosingBracketPair(text, 0, pos, skip, tbl)
        if (!pair) {
            const next = nextOpenBracket(text, 0, pos, skip, tbl)
            if (next >= 0) pair = matchBracketPair(text, 0, next, skip, tbl)
        }
        if (!pair) return
        if (idx === state.selection.mainIndex) main = out.length
        const a = selectBrackets ? pair.open : pair.openEnd, b = selectBrackets ? pair.closeEnd : pair.close
        out.push(touches(pair.close, pair.closeEnd, pos) ? EditorSelection.range(b, a) : EditorSelection.range(a, b))
    })
    if (!out.length) return false
    const sel = EditorSelection.create(out, main)
    if (!sel.eq(state.selection, true))
        target.dispatch(state.update({ selection: sel, scrollIntoView: true, userEvent: 'select' }))
    return true
}

/**
 * Remove Brackets(editor.action.removeBrackets,⌥⌘⌫ / Ctrl+Alt+Backspace):按每个选区的光标(head)
 * 找贴着的那对,否则包住的那对,把两只括号删掉。照 Monaco:选区按主选区在前的顺序逐个做,每个用一开始
 * 的行列位置在前一次删除后的文档上找(不随删除平移),每删一对是一个撤销步。
 */
export const removeBrackets: StateCommand = (target) => {
    let state: EditorState = target.state
    if (state.readOnly) return false
    const { ranges, mainIndex } = state.selection
    const order = [ranges[mainIndex], ...ranges.filter((_, i) => i !== mainIndex)]
    const spots = order.map((r) => {
        const line = state.doc.lineAt(r.head)
        return { line: line.number, col: r.head - line.from }
    })
    let changed = false
    for (const { line, col } of spots) {
        const doc = state.doc
        // matchBracket 不校验位置:行列已出界就配不上;findEnclosingBrackets 先钳回文档里
        let exact = -1, clamped = doc.length
        if (line <= doc.lines) {
            const l = doc.line(line)
            clamped = l.from + Math.min(col, l.length)
            if (col <= l.length) exact = clamped
        }
        const text = state.sliceDoc()
        const skip = bracketSkip(target, doc)
        const tbl = bracketTable(state)
        const pair = (exact >= 0 ? matchBracketPair(text, 0, exact, skip, tbl) : null) ?? enclosingBracketPair(text, 0, clamped, skip, tbl)
        if (!pair) continue
        const tr: Transaction = state.update({
            changes: [{ from: pair.open, to: pair.openEnd }, { from: pair.close, to: pair.closeEnd }],
            userEvent: 'delete',
            scrollIntoView: true,
        })
        target.dispatch(tr)
        // view 的 state 跟着 dispatch 变;单测里的 { state, dispatch } 不变,自己 apply
        state = target.state !== state ? target.state : tr.apply()
        changed = true
    }
    return changed
}
