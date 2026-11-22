// model.bracketPairs:括号对的公开数据口(Monaco BracketPairsTextModelPart)。
//
// 一棵括号树(Monaco bracketPairsTree 的语义):从分词层扫出全文括号 token,
// 按 Monaco parser 的规则配对 —— 闭括号若能配上祖先链里它能闭的某个开括号(ClosingBracketKind.openingBrackets),就把中间没闭合的开括号都收成「未闭合 Pair」;
// 配不上任何祖先的闭括号是「多余闭括号」(InvalidBracket)。getBracketPairsInRange / getBracketsInRange / findNextBracket /
// findPrevBracket / matchBracket / findEnclosingBrackets / findMatchingBracketUp 都是这棵树上的查询,逐字照 Monaco 的遍历移植
// (包括「第一个终点 ≥ 区间终点的孩子就只往下钻它」这类边界行为)。
//
// 与编辑器内部的括号匹配(core/edit/brackets 的窗口扫描,每次 O(窗口))分开:这里面向宿主按 model 查询,不进键入热路径,
// 树按 (versionId, 语言配置, token 版本) 缓存,同一版文本只建一次。两边认的括号 token 是同一套词法规则(core/edit/bracketrule:
// 长的优先、大小写不敏感、字母起止的括号带词边界),匹配高亮 / 彩虹括号 / 跳转也因此支持多字符括号。
// 括号 token 来自分词层(同 Monaco TextBufferTokenizer):只看 类型=Other 且带 balanced-brackets 位的 token,按 token 的语言取括号配置
// (内嵌语言各用各的),支持多字符括号(begin/end、\\left( \\right))。没有登记分词器的语言,整篇是一个默认 token,
// 这时字符串/注释里的括号靠 core 的跳过谓词(view 的 shiki token 缓存)排除。
// 与 Monaco 的差别(有意):超大文件不回退「逐行正则」老算法,一律走树。Monaco 只在文档 > 5,000,000 字符(canBuildAST)时放弃括号树、
// 改走逐行正则的老算法;lite-monaco 的实时匹配本来就只扫光标邻域的窗口
// (core/feature/selectionlayer 的 BRACKET_SCAN_DEFAULT),不随文档大小增长,所以不需要这条退路 —— 有意不做。

import { Position, Range, type IPosition, type IRange } from './position'
import { Emitter } from './context'
import type { IDisposable, IEvent } from './types'
import type { Rope } from '../core/model/rope'
import { bracketSkip, type BracketSkip } from '../core/edit/brackets'
import { bracketRegExp, eachBracketMatch } from '../core/edit/bracketrule'
import { tokenVersion } from '../core/view/tokens'
import { getLanguageConfiguration, languageConfigurationVersion, onDidChangeLanguageConfiguration, type LanguageConfiguration } from './languages'
import { StandardTokenType, TokenMetadata, getTokenizationRegistry, type ITokenizationTextModelPart, type LineTokens } from './tokenization'

// ───────────── 公开类型(同 monaco.d.ts / textModelBracketPairs.ts) ─────────────

/** Monaco CallbackIterable:惰性序列,iterate 的回调返回 false 就停 */
export class CallbackIterable<T> {
    static readonly empty = new CallbackIterable<never>(() => { })
    constructor(readonly iterate: (callback: (item: T) => boolean) => void) { }
    forEach(handler: (item: T) => void): void { this.iterate(item => { handler(item); return true }) }
    toArray(): T[] {
        const result: T[] = []
        this.iterate(item => { result.push(item); return true })
        return result
    }
    filter(predicate: (item: T) => boolean): CallbackIterable<T> {
        return new CallbackIterable(cb => this.iterate(item => predicate(item) ? cb(item) : true))
    }
    map<R>(fn: (item: T) => R): CallbackIterable<R> {
        return new CallbackIterable<R>(cb => this.iterate(item => cb(fn(item))))
    }
    some(predicate: (item: T) => boolean): boolean {
        let result = false
        this.iterate(item => { result = predicate(item); return !result })
        return result
    }
    findFirst(predicate: (item: T) => boolean): T | undefined {
        let result: T | undefined
        this.iterate(item => {
            if (predicate(item)) { result = item; return false }
            return true
        })
        return result
    }
    findLast(predicate: (item: T) => boolean): T | undefined {
        let result: T | undefined
        this.iterate(item => { if (predicate(item)) result = item; return true })
        return result
    }
    /** 取比较器下的最大值;并列时取最后一个 */
    findLastMaxBy(compare: (a: T, b: T) => number): T | undefined {
        let result: T | undefined
        let first = true
        this.iterate(item => {
            if (first || compare(item, result!) >= 0) { first = false; result = item }
            return true
        })
        return result
    }
}

// ───────────── 括号配置(逐字移植 Monaco LanguageBracketsConfiguration) ─────────────

export class BracketKindBase {
    constructor(protected readonly config: LanguageBracketsConfiguration, readonly bracketText: string) { }
    get languageId(): string { return this.config.languageId }
}

export class OpeningBracketKind extends BracketKindBase {
    readonly isOpeningBracket = true
    constructor(config: LanguageBracketsConfiguration, bracketText: string, readonly openedBrackets: ReadonlySet<ClosingBracketKind>) {
        super(config, bracketText)
    }
}

export class ClosingBracketKind extends BracketKindBase {
    readonly isOpeningBracket = false
    constructor(
        config: LanguageBracketsConfiguration, bracketText: string,
        /** 这个闭括号能闭的所有开括号(非空) */
        readonly openingBrackets: ReadonlySet<OpeningBracketKind>,
        private readonly openingColorizedBrackets: ReadonlySet<OpeningBracketKind>,
    ) { super(config, bracketText) }
    /** 不同配置来的括号互不相闭 */
    closes(other: OpeningBracketKind): boolean {
        if (other['config'] !== this.config) return false
        return this.openingBrackets.has(other)
    }
    closesColorized(other: OpeningBracketKind): boolean {
        if (other['config'] !== this.config) return false
        return this.openingColorizedBrackets.has(other)
    }
    getOpeningBrackets(): readonly OpeningBracketKind[] { return [...this.openingBrackets] }
}

export type BracketKind = OpeningBracketKind | ClosingBracketKind

export class LanguageBracketsConfiguration {
    private readonly _opening: ReadonlyMap<string, OpeningBracketKind>
    private readonly _closing: ReadonlyMap<string, ClosingBracketKind>

    constructor(readonly languageId: string, config: Pick<LanguageConfiguration, 'brackets' | 'colorizedBracketPairs'>) {
        const valid = (ps: readonly (readonly [string, string])[]) => ps.filter(([o, c]) => o !== '' && c !== '')
        const bracketPairs = config.brackets ? valid(config.brackets) : []
        const opens = new Map<string, { info: OpeningBracketKind, closing: Set<ClosingBracketKind> }>()
        const closes = new Map<string, { info: ClosingBracketKind, opening: Set<OpeningBracketKind>, colorized: Set<OpeningBracketKind> }>()
        const openOf = (b: string) => {
            let e = opens.get(b)
            if (!e) { const closing = new Set<ClosingBracketKind>(); e = { info: new OpeningBracketKind(this, b, closing), closing }; opens.set(b, e) }
            return e
        }
        const closeOf = (b: string) => {
            let e = closes.get(b)
            if (!e) { const opening = new Set<OpeningBracketKind>(), colorized = new Set<OpeningBracketKind>(); e = { info: new ClosingBracketKind(this, b, opening, colorized), opening, colorized }; closes.set(b, e) }
            return e
        }
        for (const [o, c] of bracketPairs) { const op = openOf(o), cl = closeOf(c); op.closing.add(cl.info); cl.opening.add(op.info) }
        // 没配 colorizedBracketPairs:取 brackets 去掉 <>(常被当比较运算符,Monaco issue #132476)
        const colorized = config.colorizedBracketPairs ? valid(config.colorizedBracketPairs) : bracketPairs.filter(p => !(p[0] === '<' && p[1] === '>'))
        for (const [o, c] of colorized) { const op = openOf(o), cl = closeOf(c); op.closing.add(cl.info); cl.colorized.add(op.info); cl.opening.add(op.info) }
        this._opening = new Map([...opens].map(([k, v]) => [k, v.info]))
        this._closing = new Map([...closes].map(([k, v]) => [k, v.info]))
    }
    get openingBrackets(): readonly OpeningBracketKind[] { return [...this._opening.values()] }
    get closingBrackets(): readonly ClosingBracketKind[] { return [...this._closing.values()] }
    getOpeningBracketInfo(bracketText: string): OpeningBracketKind | undefined { return this._opening.get(bracketText) }
    getClosingBracketInfo(bracketText: string): ClosingBracketKind | undefined { return this._closing.get(bracketText) }
    getBracketInfo(bracketText: string): BracketKind | undefined { return this.getOpeningBracketInfo(bracketText) || this.getClosingBracketInfo(bracketText) }
}

const DEFAULT_PAIRS: LanguageConfiguration['brackets'] = [['(', ')'], ['[', ']'], ['{', '}']]
const brackets = new Map<string, { cfg: object, cv: number, value: LanguageBracketsConfiguration }>()
/**
 * 某语言当前的括号配置(同一份语言配置恒返回同一个对象)。没登记配置的语言用 () [] {}。
 * 配置变了(setLanguageConfiguration / dispose)换新对象。
 */
export function getLanguageBrackets(languageId: string): LanguageBracketsConfiguration {
    const cfg = getLanguageConfiguration(languageId) ?? DEFAULT_PAIRS_CFG
    const cv = languageConfigurationVersion(languageId)
    const hit = brackets.get(languageId)
    if (hit && hit.cfg === cfg && hit.cv === cv) return hit.value
    const value = new LanguageBracketsConfiguration(languageId, cfg)
    brackets.set(languageId, { cfg, cv, value })
    return value
}
const DEFAULT_PAIRS_CFG: LanguageConfiguration = { brackets: DEFAULT_PAIRS }

/** 一种语言的括号 token 表:文本 → 括号种类,加一条把全部括号文本串起来的正则(Monaco BracketTokens) */
class BracketTokens {
    private _re: RegExp | null | undefined
    private readonly map = new Map<string, BracketKind>()
    constructor(cfg: LanguageBracketsConfiguration) {
        for (const o of cfg.openingBrackets) this.map.set(o.bracketText, o)
        for (const c of cfg.closingBrackets) this.map.set(c.bracketText, c)
    }
    /** 全局正则;没有括号时 null。key 排序后反转,保证长的优先、不会从一个更长的匹配中间起头 */
    get regExp(): RegExp | null {
        if (this._re === undefined) this._re = bracketRegExp(this.map.keys())
        return this._re
    }
    getToken(value: string): BracketKind | undefined { return this.map.get(value.toLowerCase()) }
}
const tokensCache = new WeakMap<LanguageBracketsConfiguration, BracketTokens>()
function bracketTokensOf(cfg: LanguageBracketsConfiguration): BracketTokens {
    let t = tokensCache.get(cfg)
    if (!t) { t = new BracketTokens(cfg); tokensCache.set(cfg, t) }
    return t
}

export interface IFoundBracket {
    range: Range
    bracketInfo: OpeningBracketKind | ClosingBracketKind
}

export class BracketInfo {
    constructor(
        readonly range: Range,
        /** 0 起 */
        readonly nestingLevel: number,
        readonly nestingLevelOfEqualBracketType: number,
        readonly isInvalid: boolean,
    ) { }
}

export class BracketPairInfo {
    constructor(
        readonly range: Range,
        readonly openingBracketRange: Range,
        readonly closingBracketRange: Range | undefined,
        /** 0 起 */
        readonly nestingLevel: number,
        readonly nestingLevelOfEqualBracketType: number,
        private readonly _open: OpeningBracketKind,
        private readonly _close: ClosingBracketKind | undefined,
    ) { }
    get openingBracketInfo(): OpeningBracketKind { return this._open }
    get closingBracketInfo(): ClosingBracketKind | undefined { return this._close }
}

export class BracketPairWithMinIndentationInfo extends BracketPairInfo {
    constructor(
        range: Range, openingBracketRange: Range, closingBracketRange: Range | undefined,
        nestingLevel: number, nestingLevelOfEqualBracketType: number,
        open: OpeningBracketKind, close: ClosingBracketKind | undefined,
        /** 括号对里文字行的最小缩进(可见列);没要求算时 -1 */
        readonly minVisibleColumnIndentation: number,
    ) { super(range, openingBracketRange, closingBracketRange, nestingLevel, nestingLevelOfEqualBracketType, open, close) }
}

export interface IBracketPairsTextModelPart {
    /** 括号对变了(文本或配置变化)。只有查询过括号之后才会发 */
    readonly onDidChange: IEvent<void>
    getBracketPairsInRange(range: IRange): CallbackIterable<BracketPairInfo>
    getBracketPairsInRangeWithMinIndentation(range: IRange): CallbackIterable<BracketPairWithMinIndentationInfo>
    getBracketsInRange(range: IRange, onlyColorizedBrackets?: boolean): CallbackIterable<BracketInfo>
    findMatchingBracketUp(bracket: string, position: IPosition, maxDuration?: number): Range | null
    findPrevBracket(position: IPosition): IFoundBracket | null
    findNextBracket(position: IPosition): IFoundBracket | null
    findEnclosingBrackets(position: IPosition, maxDuration?: number): [Range, Range] | null
    matchBracket(position: IPosition, maxDuration?: number): [Range, Range] | null
}

// ───────────── 括号树 ─────────────

const enum K { Text, Bracket, Invalid, Pair, List }
interface TextN { k: K.Text, start: number, end: number }
interface BracketN { k: K.Bracket, start: number, end: number, info: OpeningBracketKind | ClosingBracketKind }
interface InvalidN { k: K.Invalid, start: number, end: number }
interface PairN { k: K.Pair, start: number, end: number, open: BracketN, close: BracketN | null, child: ListN | null }
interface ListN { k: K.List, start: number, end: number, children: Node[] }
type Node = TextN | BracketN | InvalidN | PairN | ListN

interface Tree { root: ListN, doc: Rope }

/** Monaco parser 的递归深度上限:parseChild 的 level 每层嵌套 +2,>300 的开括号当普通文本 */
const MAX_NEST = 150
/** collectBrackets / collectBracketPairs 的递归深度上限 */
const MAX_COLLECT_LEVEL = 200

/** 一个括号 token:[start, end) 是文档偏移 */
interface BracketTok { start: number, end: number, info: BracketKind }

/**
 * 按 Monaco parser 的规则把括号 token 流收成树:闭括号找栈里最近的、它能闭的开括号(ClosingBracketKind.openingBrackets 里的),
 * 中间没闭合的开括号收成未闭合 Pair;栈里没有它能闭的 = 多余闭括号。
 */
function buildTree(toks: BracketTok[], length: number): Tree {
    interface Frame { open: BracketN, children: Node[] }
    const rootChildren: Node[] = []
    const stack: Frame[] = []
    let cur = 0 // 已经归入某个节点的文本末尾
    const top = (): Node[] => stack.length ? stack[stack.length - 1].children : rootChildren
    const flushText = (to: number) => { if (to > cur) { top().push({ k: K.Text, start: cur, end: to }); cur = to } }
    const closeFrame = (f: Frame, closeTok: BracketN | null, endAt: number): PairN => {
        const kids = f.children
        const childEnd = closeTok ? closeTok.start : endAt
        const child: ListN | null = kids.length ? { k: K.List, start: f.open.end, end: childEnd, children: kids } : null
        return { k: K.Pair, start: f.open.start, end: closeTok ? closeTok.end : endAt, open: f.open, close: closeTok, child }
    }
    for (const t of toks) {
        const info = t.info
        if (info.isOpeningBracket) {
            if (stack.length >= MAX_NEST) continue // 太深:当文本
            flushText(t.start)
            cur = t.end
            stack.push({ open: { k: K.Bracket, start: t.start, end: t.end, info }, children: [] })
            continue
        }
        let idx = -1
        for (let i = stack.length - 1; i >= 0; i--) if (info.closes(stack[i].open.info as OpeningBracketKind)) { idx = i; break }
        flushText(t.start)
        if (idx < 0) {
            top().push({ k: K.Invalid, start: t.start, end: t.end })
            cur = t.end
            continue
        }
        while (stack.length - 1 > idx) {
            const f = stack.pop()!
            top().push(closeFrame(f, null, t.start))
        }
        const f = stack.pop()!
        top().push(closeFrame(f, { k: K.Bracket, start: t.start, end: t.end, info }, t.end))
        cur = t.end
    }
    flushText(length)
    while (stack.length) {
        const f = stack.pop()!
        top().push(closeFrame(f, null, length))
    }
    return { root: { k: K.List, start: 0, end: length, children: rootChildren }, doc: null as never }
}

/**
 * 从分词层收括号 token(同 Monaco TextBufferTokenizer):每行的 token 里,只在「类型 Other 且带 balanced-brackets 位」的那些里找括号,
 * 括号表取 token 自己的语言。没有分词器的语言整篇是一个默认 token,字符串/注释里的括号交给 skip(view 的 shiki token 缓存)。
 */
function collectTokens(doc: Rope, tokenization: ITokenizationTextModelPart, skip: BracketSkip): BracketTok[] {
    const out: BracketTok[] = []
    const lines = doc.lines
    tokenization.forceTokenization(lines)
    for (let ln = 1; ln <= lines; ln++) {
        const lt: LineTokens = tokenization.getLineTokens(ln)
        const line = lt.getLineContent()
        const base = doc.line(ln).from
        const count = lt.getCount()
        let off = 0
        for (let ti = 0; ti < count; ti++) {
            const meta = lt.getMetadata(ti)
            while (ti + 1 < count && meta === lt.getMetadata(ti + 1)) ti++ // 同元数据的相邻 token 当一个(标识符常被拆开)
            const end = lt.getEndOffset(ti)
            if (!(TokenMetadata.getTokenType(meta) === StandardTokenType.Other && TokenMetadata.containsBalancedBrackets(meta) && off < end)) { off = end; continue }
            const bt = bracketTokensOf(getLanguageBrackets(lt.getLanguageId(ti)))
            const re = bt.regExp
            if (!re) { off = end; continue }
            const from = off
            eachBracketMatch(re, line.substring(from, end), (i, text) => {
                const start = from + i
                const info = bt.getToken(text)
                if (info && !skip?.(base + start)) out.push({ start: base + start, end: base + start + text.length, info })
            })
            off = end
        }
    }
    return out
}

// ───────────── 宿主(model)能力 ─────────────

export interface BracketPairsHost {
    getVersionId(): number
    getLanguageId(): string
    getLanguageIdAtPosition(lineNumber: number, column: number): string
    readonly tokenization: ITokenizationTextModelPart
    getTabSize(): number
    getLineFirstNonWhitespaceColumn(lineNumber: number): number
    getLineContent(lineNumber: number): string
    validateRange(range: IRange): Range
    validatePosition(position: IPosition): Position
    /** 当前文档(state.doc) */
    doc(): Rope
    /** 挂着视图时给跳过谓词借它的 token 缓存 */
    owner(): object | null
    onDidChangeContent(l: () => void): IDisposable
    onDidChangeLanguage(l: () => void): IDisposable
}

export function createBracketPairs(host: BracketPairsHost): IBracketPairsTextModelPart {
    const onDidChange = new Emitter<void>()
    let subs: IDisposable[] | null = null
    let cache: { version: number, stamp: number, tv: number, hasSkip: boolean, tree: Tree } | null = null

    /** 配置 / token 变了就让缓存作废(只在订阅后才递增;建树自己触发的 token 变化在建完后重新取戳,不算) */
    let stamp = 0

    /** 第一次查询之后才订阅文本/语言/配置/token 变化(没人用括号树就不花任何开销) */
    const requested = () => {
        if (subs) return
        subs = [
            host.onDidChangeContent(() => onDidChange.fire()),
            host.onDidChangeLanguage(() => onDidChange.fire()),
            onDidChangeLanguageConfiguration(() => { stamp++; onDidChange.fire() }),
            host.tokenization.onDidChangeTokens(() => { stamp++ }),
        ]
    }

    const tree = (): Tree => {
        requested()
        const doc = host.doc()
        // 没登记分词器时才借 view 的 token 缓存判字符串/注释
        const skip = getTokenizationRegistry().get(host.getLanguageId()) ? undefined : bracketSkip(host.owner(), doc)
        const tv = skip ? tokenVersion() : 0
        const version = host.getVersionId()
        if (cache && cache.version === version && cache.stamp === stamp && cache.tv === tv && cache.hasSkip === !!skip) return cache.tree
        const t = buildTree(collectTokens(doc, host.tokenization, skip), doc.length)
        t.doc = doc
        // stamp 此刻已含建树时 forceTokenization 触发的 token 变化,所以缓存的是建完后的值
        cache = { version, stamp, tv, hasSkip: !!skip, tree: t }
        return t
    }

    const posAt = (doc: Rope, off: number): Position => {
        const l = doc.lineAt(off)
        return new Position(l.number, off - l.from + 1)
    }
    const rangeOf = (doc: Rope, s: number, e: number): Range => {
        const a = posAt(doc, s), b = posAt(doc, e)
        return new Range(a.lineNumber, a.column, b.lineNumber, b.column)
    }
    const offsetOf = (doc: Rope, p: IPosition): number => doc.line(p.lineNumber).from + p.column - 1
    const offsetsOf = (doc: Rope, range: IRange): [number, number] => {
        const r = host.validateRange(range)
        return [offsetOf(doc, { lineNumber: r.startLineNumber, column: r.startColumn }), offsetOf(doc, { lineNumber: r.endLineNumber, column: r.endColumn })]
    }

    // ── getBracketsInRange:逐字移植 collectBrackets ──
    const collectBrackets = (
        t: Tree, node: Node, startOffset: number, endOffset: number, push: (b: BracketInfo) => boolean,
        level: number, nestingOfEqual: number, levelPerType: Map<string, number>, onlyColorized: boolean, parentIncomplete = false,
    ): boolean => {
        if (level > MAX_COLLECT_LEVEL) return true
        whileLoop:
        while (true) {
            switch (node.k) {
                case K.List: {
                    for (const child of node.children) {
                        if (child.start <= endOffset && child.end >= startOffset) {
                            if (child.end >= endOffset) { node = child; continue whileLoop }
                            if (!collectBrackets(t, child, startOffset, endOffset, push, level, 0, levelPerType, onlyColorized)) return false
                        }
                    }
                    return true
                }
                case K.Pair: {
                    const colorize = !onlyColorized || !node.close
                        || (node.close.info as ClosingBracketKind).closesColorized(node.open.info as OpeningBracketKind)
                    const key = (node.open.info as OpeningBracketKind).bracketText
                    let levelPerBracket = levelPerType.get(key) ?? 0
                    if (colorize) levelPerType.set(key, levelPerBracket + 1)
                    // 孩子:开括号、(内容列表)、闭括号
                    const kids: Node[] = [node.open]
                    if (node.child) kids.push(node.child)
                    if (node.close) kids.push(node.close)
                    for (const child of kids) {
                        if (child.start <= endOffset && child.end >= startOffset) {
                            const childEndsAfterEnd = child.end >= endOffset
                            if (childEndsAfterEnd && child.k !== K.Bracket) {
                                // 区间里后面没有别的孩子了,不用递归;括号除外(未闭合 / 未开启的括号)
                                node = child
                                if (colorize) { level++; nestingOfEqual = levelPerBracket + 1 } else nestingOfEqual = levelPerBracket
                                continue whileLoop
                            }
                            if (colorize || child.k !== K.Bracket || !node.close) {
                                if (!collectBrackets(t, child, startOffset, endOffset, push,
                                    colorize ? level + 1 : level, colorize ? levelPerBracket + 1 : levelPerBracket,
                                    levelPerType, onlyColorized, !node.close)) return false
                            }
                        }
                    }
                    levelPerType.set(key, levelPerBracket)
                    return true
                }
                case K.Invalid:
                    return push(new BracketInfo(rangeOf(t.doc, node.start, node.end), level - 1, 0, true))
                case K.Bracket:
                    return push(new BracketInfo(rangeOf(t.doc, node.start, node.end), level - 1, nestingOfEqual - 1, parentIncomplete))
                case K.Text:
                    return true
            }
        }
    }

    // ── getBracketPairsInRange:逐字移植 collectBracketPairs ──
    const minIndentationOf = (t: Tree, node: Node): number => {
        // Monaco TextAstNode.computeMinIndentation:文本节点覆盖到的行里,首个非空白列的最小可见列;括号 / 多余闭括号不贡献
        switch (node.k) {
            case K.Text: {
                const s = t.doc.lineAt(node.start), e = t.doc.lineAt(node.end)
                const startCol = node.start - s.from
                const first = startCol === 0 ? s.number : s.number + 1
                let result = Number.MAX_SAFE_INTEGER
                const tab = host.getTabSize()
                for (let ln = first; ln <= e.number; ln++) {
                    const fnw = host.getLineFirstNonWhitespaceColumn(ln)
                    if (fnw === 0) continue
                    const line = host.getLineContent(ln)
                    let vis = 0
                    for (let i = 0; i < fnw - 1; i++) vis = line.charCodeAt(i) === 9 ? vis - (vis % tab) + tab : vis + 1
                    result = Math.min(result, vis)
                }
                return result
            }
            case K.Pair: return node.child ? minIndentationOf(t, node.child) : Number.MAX_SAFE_INTEGER
            case K.List: {
                let r = Number.MAX_SAFE_INTEGER
                for (const c of node.children) r = Math.min(r, minIndentationOf(t, c))
                return r
            }
            default: return Number.MAX_SAFE_INTEGER
        }
    }

    const collectPairs = (
        t: Tree, node: Node, startOffset: number, endOffset: number, push: (p: BracketPairWithMinIndentationInfo) => boolean,
        includeMinIndent: boolean, level: number, levelPerType: Map<string, number>,
    ): boolean => {
        if (level > MAX_COLLECT_LEVEL) return true
        if (node.k === K.Pair) {
            const key = (node.open.info as OpeningBracketKind).bracketText
            const levelPerBracket = levelPerType.get(key) ?? 0
            levelPerType.set(key, levelPerBracket + 1)
            const doc = t.doc
            const closeRange = node.close ? rangeOf(doc, node.child ? node.child.end : node.open.end, node.end) : undefined
            let cont = push(new BracketPairWithMinIndentationInfo(
                rangeOf(doc, node.start, node.end), rangeOf(doc, node.open.start, node.open.end), closeRange,
                level, levelPerBracket, node.open.info as OpeningBracketKind, node.close?.info as ClosingBracketKind | undefined,
                includeMinIndent ? (node.child ? minIndentationOf(t, node.child) : Number.MAX_SAFE_INTEGER) : -1,
            ))
            if (cont && node.child) {
                const child = node.child
                if (child.start <= endOffset && child.end >= startOffset) {
                    cont = collectPairs(t, child, startOffset, endOffset, push, includeMinIndent, level + 1, levelPerType)
                    if (!cont) return false
                }
            }
            levelPerType.set(key, levelPerBracket)
        } else if (node.k === K.List) {
            for (const child of node.children) {
                if (child.start <= endOffset && startOffset <= child.end) {
                    if (!collectPairs(t, child, startOffset, endOffset, push, includeMinIndent, level, levelPerType)) return false
                }
            }
        }
        return true
    }

    const pairsIn = (range: IRange, includeMinIndent: boolean): CallbackIterable<BracketPairWithMinIndentationInfo> => {
        const t = tree()
        const [s, e] = offsetsOf(t.doc, range)
        return new CallbackIterable(cb => { collectPairs(t, t.root, s, e, cb, includeMinIndent, 0, new Map()) })
    }

    const found = (t: Tree, n: BracketN): IFoundBracket => ({ range: rangeOf(t.doc, n.start, n.end), bracketInfo: n.info })

    // ── findPrevBracket / findNextBracket:getFirstBracketBefore / After ──
    const firstBefore = (t: Tree, node: Node, pos: number): IFoundBracket | null => {
        if (node.k === K.List || node.k === K.Pair) {
            const kids: Node[] = node.k === K.List ? node.children : [node.open, ...(node.child ? [node.child] : []), ...(node.close ? [node.close] : [])]
            for (let i = kids.length - 1; i >= 0; i--) {
                if (kids[i].start < pos) {
                    const r = firstBefore(t, kids[i], pos)
                    if (r) return r
                }
            }
            return null
        }
        return node.k === K.Bracket ? found(t, node) : null
    }
    const firstAfter = (t: Tree, node: Node, pos: number): IFoundBracket | null => {
        if (node.k === K.List || node.k === K.Pair) {
            const kids: Node[] = node.k === K.List ? node.children : [node.open, ...(node.child ? [node.child] : []), ...(node.close ? [node.close] : [])]
            for (const child of kids) {
                if (pos < child.end) {
                    const r = firstAfter(t, child, pos)
                    if (r) return r
                }
            }
            return null
        }
        return node.k === K.Bracket ? found(t, node) : null
    }

    const pairsAt = (position: IPosition) => pairsIn(new Range(position.lineNumber, position.column, position.lineNumber, position.column), false)

    return {
        onDidChange: onDidChange.event,
        getBracketPairsInRange: range => pairsIn(range, false),
        getBracketPairsInRangeWithMinIndentation: range => pairsIn(range, true),
        getBracketsInRange(range, onlyColorizedBrackets = false) {
            const t = tree()
            const [s, e] = offsetsOf(t.doc, range)
            return new CallbackIterable<BracketInfo>(cb => { collectBrackets(t, t.root, s, e, cb, 0, 0, new Map(), onlyColorizedBrackets) })
        },
        findMatchingBracketUp(bracket, position) {
            const p = host.validatePosition(position)
            const closing = getLanguageBrackets(host.getLanguageIdAtPosition(p.lineNumber, p.column)).getClosingBracketInfo(bracket)
            if (!closing) return null
            const pair = pairsAt(p).findLast(b => closing.closes(b.openingBracketInfo))
            return pair ? pair.openingBracketRange : null
        },
        findPrevBracket(position) {
            const t = tree()
            return firstBefore(t, t.root, offsetOf(t.doc, host.validatePosition(position)))
        },
        findNextBracket(position) {
            const t = tree()
            return firstAfter(t, t.root, offsetOf(t.doc, host.validatePosition(position)))
        },
        findEnclosingBrackets(position) {
            const p = host.validatePosition(position)
            const at = new Range(p.lineNumber, p.column, p.lineNumber, p.column)
            const pair = pairsAt(p).findLast(item => item.closingBracketRange !== undefined && item.range.strictContainsRange(at))
            return pair ? [pair.openingBracketRange, pair.closingBracketRange!] : null
        },
        matchBracket(position) {
            const p = host.validatePosition(position)
            const pair = pairsAt(p)
                .filter(item => item.closingBracketRange !== undefined && (item.openingBracketRange.containsPosition(p) || item.closingBracketRange.containsPosition(p)))
                .findLastMaxBy((a, b) => {
                    const ra = a.openingBracketRange.containsPosition(p) ? a.openingBracketRange : a.closingBracketRange!
                    const rb = b.openingBracketRange.containsPosition(p) ? b.openingBracketRange : b.closingBracketRange!
                    return Range.compareRangesUsingStarts(ra, rb)
                })
            return pair ? [pair.openingBracketRange, pair.closingBracketRange!] : null
        },
    }
}
