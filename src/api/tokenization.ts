// model.tokenization:按行、带状态的分词层(Monaco TokenizationTextModelPart + 状态库 + 连续 token 库 的公开语义)。
//
// 数据:
//   - 每行一个「行尾状态」(IState)。第 n 行的起始状态 = 第 n-1 行的行尾状态(第 1 行用 getInitialState())。
//   - 「失效行」集合:行尾状态不可信的行号区间。编辑只会让被改的行和紧随其后的一行失效;
//     重新分词一行得到的行尾状态若与旧状态 equals,后面的行就不用再算(这就是增量分词)。
//   - 每行的 token(Uint32Array,成对 [endOffset, metadata])。编辑时 token 偏移跟着文本平移 / 截断,
//     不等重新分词就能画出大致正确的颜色。
//
// 分词器来源是一个可替换的「注册表」(languageId → ITokenizationSupport,外加 onDidChange):缺省是本文件自己的实现,
// 宿主也可以用 setTokenizationRegistry 换成别的实现(形状同 Monaco 的 TokenizationRegistry)。
// 语言没有登记分词器时,整篇都是一个默认 token(语言 id 取 model 的语言),getLineTokens 照样可用。
//
// 与 Monaco 的差别(有意):
//   - 没有「可见区间」概念,不做 tokenizeHeuristically(远跳时按缩进猜起始状态);forceTokenization 总是从头顺序算;
//   - 缺省后台分词(DefaultBackgroundTokenizer)只在 model 挂着视图时,用 setTimeout 分片推进;分词器自带 createBackgroundTokenizer 则交给它。

import { Emitter } from './context'
import { Position } from './position'
import type { IDisposable, IEvent } from './types'
import { getLanguageService } from './languagesregistry'
import { SparseTokensStore, countEOL3, type SparseMultilineTokens } from './sparsetokens'
import type { Range } from './position'

// ───────────── token 元数据位布局(同 Monaco encodedTokenAttributes) ─────────────

export const StandardTokenType = { Other: 0, Comment: 1, String: 2, RegEx: 3 } as const
export type StandardTokenType = 0 | 1 | 2 | 3
export const FontStyle = { None: 0, Italic: 1, Bold: 2, Underline: 4, Strikethrough: 8 } as const
export const ColorId = { None: 0, DefaultForeground: 1, DefaultBackground: 2 } as const

export const MetadataConsts = {
    LANGUAGEID_MASK: 0xFF, TOKEN_TYPE_MASK: 0x300, BALANCED_BRACKETS_MASK: 0x400,
    FONT_STYLE_MASK: 0x7800, FOREGROUND_MASK: 0xFF8000, BACKGROUND_MASK: 0xFF000000,
    LANGUAGEID_OFFSET: 0, TOKEN_TYPE_OFFSET: 8, BALANCED_BRACKETS_OFFSET: 10,
    FONT_STYLE_OFFSET: 11, FOREGROUND_OFFSET: 15, BACKGROUND_OFFSET: 24,
} as const

export const TokenMetadata = {
    getLanguageId: (m: number): number => (m & MetadataConsts.LANGUAGEID_MASK) >>> MetadataConsts.LANGUAGEID_OFFSET,
    getTokenType: (m: number): StandardTokenType => ((m & MetadataConsts.TOKEN_TYPE_MASK) >>> MetadataConsts.TOKEN_TYPE_OFFSET) as StandardTokenType,
    containsBalancedBrackets: (m: number): boolean => (m & MetadataConsts.BALANCED_BRACKETS_MASK) !== 0,
    getFontStyle: (m: number): number => (m & MetadataConsts.FONT_STYLE_MASK) >>> MetadataConsts.FONT_STYLE_OFFSET,
    getForeground: (m: number): number => (m & MetadataConsts.FOREGROUND_MASK) >>> MetadataConsts.FOREGROUND_OFFSET,
    getBackground: (m: number): number => (m & MetadataConsts.BACKGROUND_MASK) >>> MetadataConsts.BACKGROUND_OFFSET,
    getClassNameFromMetadata(m: number): string {
        let cls = 'mtk' + TokenMetadata.getForeground(m)
        const fs = TokenMetadata.getFontStyle(m)
        if (fs & FontStyle.Italic) cls += ' mtki'
        if (fs & FontStyle.Bold) cls += ' mtkb'
        if (fs & FontStyle.Underline) cls += ' mtku'
        if (fs & FontStyle.Strikethrough) cls += ' mtks'
        return cls
    },
}

// ───────────── 分词器接口(同 Monaco languages.ts) ─────────────

export interface IState {
    clone(): IState
    equals(other: IState): boolean
}

/** 无状态语言的行尾状态 */
export const NullState: IState = new class implements IState {
    clone(): IState { return this }
    equals(other: IState): boolean { return this === other }
}()

export class EncodedTokenizationResult {
    /** 成对 [startOffset, metadata](分词器吐出)——model 取走后立刻转成 [endOffset, metadata] */
    constructor(readonly tokens: Uint32Array, readonly endState: IState) { }
}

/** 经典(非编码)token:起点 + token 名(`keyword.ts`)+ 语言(Monaco languages.Token,monaco.Token) */
export class Token {
    _tokenBrand: void = undefined
    constructor(readonly offset: number, readonly type: string, readonly language: string) { }
    toString(): string { return '(' + this.offset + ', ' + this.type + ')' }
}

/** 经典分词结果 */
export class TokenizationResult {
    _tokenizationResultBrand: void = undefined
    constructor(readonly tokens: Token[], readonly endState: IState) { }
}

/** 没有分词器时的整行结果(Monaco nullTokenize):一个空类型 token,状态原样往下传 */
export function nullTokenize(languageId: string, state: IState): TokenizationResult {
    return new TokenizationResult([new Token(0, '', languageId)], state)
}

/** 分词结果批:一段连续行的 token(Monaco ContiguousMultilineTokens;这里只要求这三个成员) */
export interface IMultilineTokens {
    readonly startLineNumber: number
    readonly endLineNumber: number
    getLineTokens(lineNumber: number): Uint32Array | ArrayBuffer | null
}

export interface IBackgroundTokenizationStore {
    setTokens(tokens: IMultilineTokens[]): void
    setEndState(lineNumber: number, state: IState): void
    backgroundTokenizationFinished(): void
}

export interface IBackgroundTokenizer extends IDisposable {
    requestTokens(startLineNumber: number, endLineNumberExclusive: number): void
    reportMismatchingTokens?(lineNumber: number): void
}

export interface ITokenizationSupport {
    getInitialState(): IState
    /** 经典 token(带 token 名);Monarch / TokensProvider 都有。EncodedTokensProvider 没提供 tokenize 时抛错(同 Monaco) */
    tokenize?(line: string, hasEOL: boolean, state: IState): TokenizationResult
    tokenizeEncoded(line: string, hasEOL: boolean, state: IState): EncodedTokenizationResult
    /** 返回 undefined = 用缺省后台分词 */
    createBackgroundTokenizer?(textModel: unknown, store: IBackgroundTokenizationStore): IBackgroundTokenizer | undefined
    /** true = 后台分词器的结果只拿来和主线结果对账(报告不一致),不参与渲染 */
    backgroundTokenizerShouldOnlyVerifyTokens?: boolean
}

/** 注册表变更:哪些语言的分词器换了;颜色表换了 changedColorMap = true(Monaco ITokenizationSupportChangedEvent) */
export interface ITokenizationSupportChangedEvent { changedLanguages: string[], changedColorMap?: boolean }

/** 懒创建的分词器(Monaco ILazyTokenizationSupport):第一次被 getOrCreate 才解析 */
export interface ILazyTokenizationSupport {
    readonly tokenizationSupport: Promise<ITokenizationSupport | null>
}

export interface ITokenizationRegistry {
    get(languageId: string): ITokenizationSupport | null
    readonly onDidChange: IEvent<ITokenizationSupportChangedEvent>
    /** 以下是 Monaco TokenizationRegistry 的其余成员;宿主自带的注册表可以不实现(缺了就当没有懒创建 / 颜色表) */
    handleChange?(languageIds: string[]): void
    registerFactory?(languageId: string, factory: ILazyTokenizationSupport): IDisposable
    getOrCreate?(languageId: string): Promise<ITokenizationSupport | null>
    isResolved?(languageId: string): boolean
}

class DefaultTokenizationRegistry implements ITokenizationRegistry {
    private readonly _map = new Map<string, ITokenizationSupport>()
    private readonly _factories = new Map<string, { factory: ILazyTokenizationSupport, resolved: boolean, disposed: boolean, promise: Promise<void> | null, sub: IDisposable | null }>()
    private readonly _onDidChange = new Emitter<ITokenizationSupportChangedEvent>()
    readonly onDidChange = this._onDidChange.event

    handleChange(languageIds: string[]): void { this._onDidChange.fire({ changedLanguages: languageIds, changedColorMap: false }) }

    register(languageId: string, support: ITokenizationSupport): IDisposable {
        this._map.set(languageId, support)
        this.handleChange([languageId])
        let done = false
        return {
            dispose: () => {
                if (done) return
                done = true
                if (this._map.get(languageId) === support) {
                    this._map.delete(languageId)
                    this.handleChange([languageId])
                }
            },
        }
    }
    get(languageId: string): ITokenizationSupport | null { return this._map.get(languageId) ?? null }

    registerFactory(languageId: string, factory: ILazyTokenizationSupport): IDisposable {
        const prev = this._factories.get(languageId)
        if (prev) { prev.disposed = true; prev.sub?.dispose() }
        const data = { factory, resolved: false, disposed: false, promise: null as Promise<void> | null, sub: null as IDisposable | null }
        this._factories.set(languageId, data)
        return {
            dispose: () => {
                if (this._factories.get(languageId) !== data) return
                this._factories.delete(languageId)
                data.disposed = true
                data.sub?.dispose()
            },
        }
    }

    async getOrCreate(languageId: string): Promise<ITokenizationSupport | null> {
        const hit = this.get(languageId)
        if (hit) return hit
        const data = this._factories.get(languageId)
        if (!data || data.resolved) return null
        data.promise ??= (async () => {
            const value = await data.factory.tokenizationSupport
            data.resolved = true
            if (value && !data.disposed) data.sub = this.register(languageId, value)
        })()
        await data.promise
        return this.get(languageId)
    }

    isResolved(languageId: string): boolean {
        if (this.get(languageId)) return true
        const data = this._factories.get(languageId)
        return !data || data.resolved
    }

    /** setColorMap 覆盖变了:所有语言都要重画 */
    handleColorMapChange(): void { this._onDidChange.fire({ changedLanguages: Array.from(this._map.keys()), changedColorMap: true }) }
}

export const tokenizationRegistry = new DefaultTokenizationRegistry()
let activeRegistry: ITokenizationRegistry = tokenizationRegistry

/** 换分词器来源(形状同 Monaco TokenizationRegistry)。之后创建的 model 用新的;已有 model 下次访问分词时会重新取 */
export function setTokenizationRegistry(r: ITokenizationRegistry | null): void { activeRegistry = r ?? tokenizationRegistry }
export function getTokenizationRegistry(): ITokenizationRegistry { return activeRegistry }

// ───────────── LineTokens ─────────────

export const defaultTokenMetadata = ((FontStyle.None << MetadataConsts.FONT_STYLE_OFFSET)
    | (ColorId.DefaultForeground << MetadataConsts.FOREGROUND_OFFSET)
    | (ColorId.DefaultBackground << MetadataConsts.BACKGROUND_OFFSET)) >>> 0

export interface ILanguageIdCodec {
    encodeLanguageId(languageId: string): number
    decodeLanguageId(id: number): string
}

export interface IViewLineTokens {
    getCount(): number
    getLineContent(): string
    getStartOffset(tokenIndex: number): number
    getEndOffset(tokenIndex: number): number
    getMetadata(tokenIndex: number): number
    getLanguageId(tokenIndex: number): string
    getStandardTokenType(tokenIndex: number): StandardTokenType
    getForeground(tokenIndex: number): number
    getClassName(tokenIndex: number): string
    getTokenText(tokenIndex: number): string
    findTokenIndexAtOffset(offset: number): number
    forEach(cb: (tokenIndex: number) => void): void
}

/** 一行的 token:成对 [endOffset, metadata],最后一个 token 的 endOffset 必须等于行长 */
export class LineTokens implements IViewLineTokens {
    constructor(private readonly _tokens: Uint32Array, private readonly _text: string, readonly languageIdCodec: ILanguageIdCodec) { }

    /** 分词器吐出的 [startOffset, metadata] → [endOffset, metadata](原地) */
    static convertToEndOffset(tokens: Uint32Array, lineTextLength: number): void {
        const n = tokens.length >>> 1
        for (let i = 0; i < n - 1; i++) tokens[i << 1] = tokens[(i + 1) << 1]
        if (n > 0) tokens[(n - 1) << 1] = lineTextLength
    }

    /** 第一个 endOffset > desired 的 token 下标(恰等于某 endOffset 时取下一个) */
    static findIndexInTokensArray(tokens: Uint32Array, desired: number): number {
        if (tokens.length <= 2) return 0
        let low = 0, high = (tokens.length >>> 1) - 1
        while (low < high) {
            const mid = low + ((high - low) >> 1)
            const end = tokens[mid << 1]
            if (end === desired) return mid + 1
            if (end < desired) low = mid + 1
            else high = mid
        }
        return low
    }

    static createEmpty(text: string, codec: ILanguageIdCodec): LineTokens {
        return new LineTokens(new Uint32Array([text.length, defaultTokenMetadata]), text, codec)
    }

    getLineContent(): string { return this._text }
    getTextLength(): number { return this._text.length }
    getCount(): number { return this._tokens.length >>> 1 }
    getStartOffset(i: number): number { return i > 0 ? this._tokens[(i - 1) << 1] : 0 }
    getEndOffset(i: number): number { return this._tokens[i << 1] }
    getMetadata(i: number): number { return this._tokens[(i << 1) + 1] }
    getLanguageId(i: number): string { return this.languageIdCodec.decodeLanguageId(TokenMetadata.getLanguageId(this.getMetadata(i))) }
    getStandardTokenType(i: number): StandardTokenType { return TokenMetadata.getTokenType(this.getMetadata(i)) }
    getForeground(i: number): number { return TokenMetadata.getForeground(this.getMetadata(i)) }
    getClassName(i: number): string { return TokenMetadata.getClassNameFromMetadata(this.getMetadata(i)) }
    getTokenText(i: number): string { return this._text.substring(this.getStartOffset(i), this.getEndOffset(i)) }
    findTokenIndexAtOffset(offset: number): number { return LineTokens.findIndexInTokensArray(this._tokens, offset) }
    forEach(cb: (tokenIndex: number) => void): void { for (let i = 0, n = this.getCount(); i < n; i++) cb(i) }
    inflate(): IViewLineTokens { return this }

    equals(other: unknown): boolean {
        if (!(other instanceof LineTokens) || this._text !== other._text || this._tokens.length !== other._tokens.length) return false
        for (let i = 0; i < this._tokens.length; i++) if (this._tokens[i] !== other._tokens[i]) return false
        return true
    }
}

// ───────────── 行 token 的编辑(文本变了,token 偏移跟着动) ─────────────

const EMPTY_LINE = new Uint32Array(0)
type LineTok = Uint32Array | null

function asU32(a: Uint32Array | ArrayBuffer): Uint32Array { return a instanceof Uint32Array ? a : new Uint32Array(a) }

/** 删 [from, to);EMPTY / null 原样 */
function tokDelete(lt: LineTok, from: number, to: number): LineTok {
    if (lt === null || lt === EMPTY_LINE || from === to) return lt
    const n = lt.length >>> 1
    if (from === 0 && lt[lt.length - 2] === to) return EMPTY_LINE
    const fromIdx = LineTokens.findIndexInTokensArray(lt, from)
    const fromStart = fromIdx > 0 ? lt[(fromIdx - 1) << 1] : 0
    const fromEnd = lt[fromIdx << 1]
    const delta = to - from
    if (to < fromEnd) {
        // 删区间落在单个 token 里
        for (let i = fromIdx; i < n; i++) lt[i << 1] -= delta
        return lt
    }
    let dest: number, lastEnd: number
    if (fromStart !== from) {
        lt[fromIdx << 1] = from
        dest = (fromIdx + 1) << 1
        lastEnd = from
    } else {
        dest = fromIdx << 1
        lastEnd = fromStart
    }
    for (let i = fromIdx + 1; i < n; i++) {
        const end = lt[i << 1] - delta
        if (end > lastEnd) {
            lt[dest++] = end
            lt[dest++] = lt[(i << 1) + 1]
            lastEnd = end
        }
    }
    return dest === lt.length ? lt : lt.slice(0, dest)
}
function tokDeleteEnding(lt: LineTok, from: number): LineTok {
    if (lt === null || lt === EMPTY_LINE) return lt
    return tokDelete(lt, from, lt[lt.length - 2])
}
function tokDeleteBeginning(lt: LineTok, to: number): LineTok {
    if (lt === null || lt === EMPTY_LINE) return lt
    return tokDelete(lt, 0, to)
}
/** 把 other 接在 lt 后面(合并行) */
function tokAppend(lt: LineTok, other: LineTok): LineTok {
    if (other === EMPTY_LINE) return lt
    if (lt === EMPTY_LINE) return other
    if (lt === null) return lt
    if (other === null) return null // 不知道合并后的行长
    const out = new Uint32Array(lt.length + other.length)
    out.set(lt, 0)
    const delta = lt[lt.length - 2]
    let d = lt.length
    for (let i = 0; i < other.length; i += 2) { out[d++] = other[i] + delta; out[d++] = other[i + 1] }
    return out
}
/** 在 at 处插入 len 个字符:从落在 at 的 token 起后面的 endOffset 都加 len */
function tokInsert(lt: LineTok, at: number, len: number): LineTok {
    if (lt === null || lt === EMPTY_LINE) return lt
    let idx = LineTokens.findIndexInTokensArray(lt, at)
    if (idx > 0 && lt[(idx - 1) << 1] === at) idx--
    for (let i = idx, n = lt.length >>> 1; i < n; i++) lt[i << 1] += len
    return lt
}

/** [换行数, 首行长度](\r\n、\r、\n 都算一个换行) */
function countEOL(text: string): [number, number] {
    let eols = 0, first = -1
    for (let i = 0; i < text.length; i++) {
        const c = text.charCodeAt(i)
        if (c !== 13 && c !== 10) continue
        if (first < 0) first = i
        if (c === 13 && text.charCodeAt(i + 1) === 10) i++
        eols++
    }
    return [eols, first < 0 ? text.length : first]
}

interface ContentChange { range: { startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number }, text: string }

// ───────────── 行 token 库 ─────────────

/** arr.splice(at, del, ...ins 个 null)。展开参数有调用栈上限(一次撤销几十万行会 RangeError),大段走 concat(返回新数组) */
export function spliceNulls<T>(arr: (T | null)[], at: number, del: number, ins: number): (T | null)[] {
    if (ins < 10000) { arr.splice(at, del, ...new Array<T | null>(ins).fill(null)); return arr }
    return arr.slice(0, at).concat(new Array<T | null>(ins).fill(null), arr.slice(at + del))
}

class TokenStore {
    private _lines: LineTok[] = []
    constructor(private readonly _codec: ILanguageIdCodec) { }

    flush(): void { this._lines = [] }
    get hasTokens(): boolean { return this._lines.length > 0 }

    private _defaultMetadata(langId: number): number {
        // 没有语法时按「可能是括号」猜:带 BALANCED_BRACKETS 位
        return ((langId << MetadataConsts.LANGUAGEID_OFFSET) | (ColorId.DefaultForeground << MetadataConsts.FOREGROUND_OFFSET)
            | (ColorId.DefaultBackground << MetadataConsts.BACKGROUND_OFFSET) | MetadataConsts.BALANCED_BRACKETS_MASK) >>> 0
    }

    get(topLang: string, lineIndex: number, text: string): LineTokens {
        const raw = lineIndex < this._lines.length ? this._lines[lineIndex] : null
        if (raw !== null && raw !== EMPTY_LINE) return new LineTokens(raw, text, this._codec)
        return new LineTokens(new Uint32Array([text.length, this._defaultMetadata(this._codec.encodeLanguageId(topLang))]), text, this._codec)
    }

    /** 收进一行(规整:末 token 盖到行尾;空行且语言没变 = EMPTY)。返回这行跟旧的比有没有变 */
    set(topLang: string, lineIndex: number, textLength: number, raw: Uint32Array | ArrayBuffer | null, checkEquality: boolean): boolean {
        const langId = this._codec.encodeLanguageId(topLang)
        let toks: Uint32Array | null = raw ? asU32(raw) : null
        let norm: Uint32Array
        if (textLength === 0 && !(toks && toks.length > 1 && TokenMetadata.getLanguageId(toks[1]) !== langId)) {
            norm = EMPTY_LINE
        } else if (!toks || toks.length === 0) {
            norm = new Uint32Array([textLength, this._defaultMetadata(langId)])
        } else {
            toks[toks.length - 2] = textLength
            norm = toks
        }
        while (lineIndex >= this._lines.length) this._lines.push(null)
        const old = this._lines[lineIndex]
        this._lines[lineIndex] = norm
        if (!checkEquality) return false
        if (!old) return true
        if (old.length !== norm.length) return true
        for (let i = 0; i < old.length; i++) if (old[i] !== norm[i]) return true
        return false
    }

    acceptEdit(range: ContentChange['range'], eolCount: number, firstLineLength: number): void {
        this._deleteRange(range)
        this._insertText(range.startLineNumber, range.startColumn, eolCount, firstLineLength)
    }

    private _deleteRange(r: ContentChange['range']): void {
        const first = r.startLineNumber - 1
        if (first >= this._lines.length) return
        if (r.startLineNumber === r.endLineNumber) {
            if (r.startColumn === r.endColumn) return
            this._lines[first] = tokDelete(this._lines[first], r.startColumn - 1, r.endColumn - 1)
            return
        }
        this._lines[first] = tokDeleteEnding(this._lines[first], r.startColumn - 1)
        const last = r.endLineNumber - 1
        const lastTokens = last < this._lines.length ? tokDeleteBeginning(this._lines[last], r.endColumn - 1) : null
        // 末行剩下的文字接到首行后面
        this._lines[first] = tokAppend(this._lines[first], lastTokens)
        // 删中间行(含末行)
        const count = Math.min(r.endLineNumber - r.startLineNumber, this._lines.length - r.startLineNumber)
        if (count > 0) this._lines.splice(r.startLineNumber, count)
    }

    private _insertText(lineNumber: number, column: number, eolCount: number, firstLineLength: number): void {
        if (eolCount === 0 && firstLineLength === 0) return
        const i = lineNumber - 1
        if (i >= this._lines.length) return
        if (eolCount === 0) {
            this._lines[i] = tokInsert(this._lines[i], column - 1, firstLineLength)
            return
        }
        this._lines[i] = tokDeleteEnding(this._lines[i], column - 1)
        this._lines[i] = tokInsert(this._lines[i], column - 1, firstLineLength)
        this._lines = spliceNulls(this._lines, lineNumber, 0, eolCount)
    }

    /** 收一批分词结果。返回有变化的行区间(给 onDidChangeTokens) */
    setBatches(batches: IMultilineTokens[], topLang: string, lineLength: (line: number) => number): { fromLineNumber: number, toLineNumber: number }[] {
        const out: { fromLineNumber: number, toLineNumber: number }[] = []
        for (const b of batches) {
            let min = 0, max = 0, changed = false
            for (let ln = b.startLineNumber; ln <= b.endLineNumber; ln++) {
                const c = this.set(topLang, ln - 1, lineLength(ln), b.getLineTokens(ln), !changed)
                if (changed) max = ln
                else if (c) { changed = true; min = max = ln }
            }
            if (changed) out.push({ fromLineNumber: min, toLineNumber: max })
        }
        return out
    }
}

// ───────────── 状态库:行尾状态 + 失效行区间 ─────────────

/** 失效行号集合:升序、不相交的 [start, endExclusive) 区间 */
export class InvalidLines {
    private _r: [number, number][] = []
    get min(): number | null { return this._r.length ? this._r[0][0] : null }

    private _normalize(): void {
        this._r.sort((a, b) => a[0] - b[0])
        const out: [number, number][] = []
        for (const r of this._r) {
            if (r[1] <= r[0]) continue
            const last = out[out.length - 1]
            if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1])
            else out.push([r[0], r[1]])
        }
        this._r = out
    }
    add(start: number, endEx: number): void { this._r.push([start, endEx]); this._normalize() }
    delete(line: number): void {
        const out: [number, number][] = []
        for (const [a, b] of this._r) {
            if (line < a || line >= b) { out.push([a, b]); continue }
            if (a < line) out.push([a, line])
            if (line + 1 < b) out.push([line + 1, b])
        }
        this._r = out
    }
    /**
     * 一批 replace 一次扫完:ch 升序、行段互不相交,坐标是改之前的(撤销 / 全部替换一次几万处,逐个 replace 是 O(处数 × 区间数))。
     * 结果和按坐标从大到小逐个 replace 完全一样。
     */
    replaceMany(ch: readonly (readonly [number, number, number])[]): void {
        const out: [number, number][] = []
        const push = (a: number, b: number): void => {
            if (b <= a) return
            const l = out[out.length - 1]
            if (l && a <= l[1]) { if (b > l[1]) l[1] = b } else out.push([a, b])
        }
        const r = this._r
        let ri = 0, a = 0, b = 0, has = false, shift = 0
        const next = (): void => { if (ri < r.length) { a = r[ri][0]; b = r[ri][1]; ri++; has = true } else has = false }
        next()
        for (const [s, e, n] of ch) {
            while (has && a < s) {
                if (b <= s) { push(a + shift, b + shift); next() } else { push(a + shift, s + shift); a = s; break }
            }
            while (has && a < e) {
                if (b <= e) next(); else { a = e; break }
            }
            push(s + shift, s + shift + n)
            shift += n - (e - s)
        }
        while (has) { push(a + shift, b + shift); next() }
        this._r = out
    }
    /** 区间 [s,e) 的行被换成 n 行:后面的整体平移,新的 n 行全部算失效 */
    replace(s: number, e: number, n: number): void {
        const d = n - (e - s)
        const out: [number, number][] = []
        for (const [a, b] of this._r) {
            if (b <= s) out.push([a, b])
            else if (a >= e) out.push([a + d, b + d])
            else {
                if (a < s) out.push([a, s])
                if (b > e) out.push([e + d, b + d])
            }
        }
        if (n > 0) out.push([s, s + n])
        this._r = out
        this._normalize()
    }
}

class StateStore {
    private _ends: (IState | null)[] = []   // 下标 = 行号 - 1
    private readonly _invalid = new InvalidLines()
    constructor(private _lineCount: number) { this._invalid.add(1, _lineCount + 1) }

    endState(line: number): IState | null { return this._ends[line - 1] ?? null }

    /** 记下行尾状态。返回状态是否变了(变了,下一行的起始状态就不可信,要失效) */
    setEndState(line: number, state: IState): boolean {
        this._invalid.delete(line)
        const old = this._ends[line - 1]
        if (old && old.equals(state)) return false
        while (this._ends.length < line - 1) this._ends.push(null)
        this._ends[line - 1] = state
        if (line < this._lineCount) this._invalid.add(line + 1, line + 2)
        return true
    }

    acceptChange(startLine: number, endLineExclusive: number, newLineCount: number): void {
        this._lineCount += newLineCount - (endLineExclusive - startLine)
        let del = endLineExclusive - startLine, ins = newLineCount
        // 保留被改区间的最后一行的旧状态:新状态碰巧跟它一样就说明后面不用重算
        if (ins > 0 && del > 0) { del--; ins-- }
        while (this._ends.length < startLine - 1) this._ends.push(null)
        this._ends = spliceNulls(this._ends, startLine - 1, del, ins)
        this._invalid.replace(startLine, endLineExclusive, newLineCount)
    }

    /** 一批改动(升序、改前坐标,首尾相接共用一行的已并成一段):行尾状态逐段改,失效区间一次扫完 */
    acceptChanges(ch: readonly (readonly [number, number, number])[]): void {
        for (let i = ch.length - 1; i >= 0; i--) {   // 从后往前,前面的下标不受影响
            const [s, e, n] = ch[i]
            this._lineCount += n - (e - s)
            let del = e - s, ins = n
            if (ins > 0 && del > 0) { del--; ins-- }
            if (del === 0 && ins === 0) continue
            while (this._ends.length < s - 1) this._ends.push(null)
            this._ends = spliceNulls(this._ends, s - 1, del, ins)
        }
        this._invalid.replaceMany(ch)
    }

    invalidate(startLine: number, endLineExclusive: number): void { this._invalid.add(startLine, endLineExclusive) }
    get firstInvalid(): number | null { return this._invalid.min }
    get firstInvalidOrMax(): number { return this._invalid.min || Number.MAX_SAFE_INTEGER }
    get allValid(): boolean { return this._invalid.min === null }
    startState(line: number, initial: IState): IState | null { return line === 1 ? initial : this.endState(line - 1) }
}

// ───────────── 主体 ─────────────

/** TokenizationPart 对 model 的需求(TextModel 自己满足) */
export interface TokenizationHost {
    getLineContent(lineNumber: number): string
    getLineCount(): number
    getLineLength(lineNumber: number): number
    getLanguageId(): string
    validatePosition(p: { lineNumber: number, column: number }): Position
    isAttachedToEditor(): boolean
}

export interface ITokensChangedEvent { readonly semanticTokensApplied: boolean, readonly ranges: { fromLineNumber: number, toLineNumber: number }[] }
export const BackgroundTokenizationState = { InProgress: 1, Completed: 2 } as const

const CHEAP_TOKENIZATION_LENGTH_LIMIT = 2048

export interface ITokenizationTextModelPart {
    readonly onDidChangeTokens: IEvent<ITokensChangedEvent>
    readonly onDidChangeBackgroundTokenizationState: IEvent<void>
    readonly backgroundTokenizationState: number
    forceTokenization(lineNumber: number): void
    hasAccurateTokensForLine(lineNumber: number): boolean
    isCheapToTokenize(lineNumber: number): boolean
    tokenizeIfCheap(lineNumber: number): void
    getLineTokens(lineNumber: number): LineTokens
    getLanguageId(): string
    getLanguageIdAtPosition(lineNumber: number, column: number): string
    getTokenTypeIfInsertingCharacter(lineNumber: number, column: number, character: string): StandardTokenType
    tokenizeLinesAt(lineNumber: number, lines: string[]): LineTokens[] | null
    readonly hasTokens: boolean
    /** 语义 token(provider 给的):整篇替换;isComplete = 这是整篇结果(视口按需的局部结果不是) */
    setSemanticTokens(tokens: SparseMultilineTokens[] | null, isComplete: boolean): void
    /** 把局部结果并进已有语义 token(整篇结果已在时忽略) */
    setPartialSemanticTokens(range: Range, tokens: SparseMultilineTokens[] | null): void
    hasCompleteSemanticTokens(): boolean
    hasSomeSemanticTokens(): boolean
}

/** 一批连续行的 token(同 Monaco ContiguousMultilineTokens 的读接口) */
class TokenBatch implements IMultilineTokens {
    private readonly _tokens: Uint32Array[] = []
    constructor(readonly startLineNumber: number) { }
    get endLineNumber(): number { return this.startLineNumber + this._tokens.length - 1 }
    push(t: Uint32Array): void { this._tokens.push(t) }
    getLineTokens(n: number): Uint32Array | null { return this._tokens[n - this.startLineNumber] ?? null }
}
class BatchBuilder {
    readonly batches: TokenBatch[] = []
    add(line: number, tokens: Uint32Array): void {
        const last = this.batches[this.batches.length - 1]
        if (last && last.endLineNumber + 1 === line) last.push(tokens)
        else { const b = new TokenBatch(line); b.push(tokens); this.batches.push(b) }
    }
}

export class TokenizationPart implements ITokenizationTextModelPart, IDisposable {
    private readonly _onTokens = new Emitter<ITokensChangedEvent>()
    readonly onDidChangeTokens = this._onTokens.event
    private readonly _onBgState = new Emitter<void>()
    readonly onDidChangeBackgroundTokenizationState = this._onBgState.event
    backgroundTokenizationState: number = BackgroundTokenizationState.InProgress

    private readonly _codec: ILanguageIdCodec = getLanguageService().languageIdCodec
    private readonly _tokens = new TokenStore(this._codec)
    private readonly _semantic = new SparseTokensStore(this._codec)
    private _registry: ITokenizationRegistry = getTokenizationRegistry()
    private _registrySub: IDisposable | null = null
    private _support: ITokenizationSupport | null = null
    private _boundLang = ''
    private _initial: IState | null = null
    private _states: StateStore | null = null
    private _bg: IBackgroundTokenizer | null = null
    private _defaultBg = false
    private _bgScheduled: ReturnType<typeof setTimeout> | null = null
    private _disposed = false

    constructor(private readonly _host: TokenizationHost & { validateRange?(r: Range): Range, getLineCount(): number }) {
        this._bind()
        this._reset(false)
    }

    // ── 来源 / 重置 ──

    private _bind(): void {
        this._registrySub?.dispose()
        this._registry = getTokenizationRegistry()
        this._registrySub = this._registry.onDidChange(e => {
            if (e.changedLanguages.includes(this._host.getLanguageId())) this._reset(true)
        })
    }

    /** 语言 / 注册表 / 分词器换了就重来(访问前调,免得订阅漏掉) */
    private _sync(): boolean {
        if (this._disposed) return false
        if (this._registry !== getTokenizationRegistry()) this._bind()
        const lang = this._host.getLanguageId()
        if (lang === this._boundLang && (this._registry.get(lang) ?? null) === this._support) return false
        this._reset(true)
        return true
    }

    private _reset(fire: boolean): void {
        const lang = this._host.getLanguageId()
        this._boundLang = lang
        this._tokens.flush()
        if (fire) this._onTokens.fire({ semanticTokensApplied: false, ranges: [{ fromLineNumber: 1, toLineNumber: this._host.getLineCount() }] })
        this._bg?.dispose()
        this._bg = null
        this._defaultBg = false
        if (this._bgScheduled !== null) { clearTimeout(this._bgScheduled); this._bgScheduled = null }
        this._support = this._registry.get(lang) ?? null
        this._initial = null
        this._states = null
        if (this._support) {
            try { this._initial = this._support.getInitialState() } catch { this._support = null }
        }
        if (!this._support || !this._initial) return
        this._states = new StateStore(this._host.getLineCount())
        const store: IBackgroundTokenizationStore = {
            setTokens: t => this._setTokens(t),
            backgroundTokenizationFinished: () => {
                if (this.backgroundTokenizationState === BackgroundTokenizationState.Completed) return
                this.backgroundTokenizationState = BackgroundTokenizationState.Completed
                this._onBgState.fire()
            },
            setEndState: (line, state) => {
                const first = this._states?.firstInvalid
                // 已经算过的行不收(渲染侧比后台跑得快)
                if (first != null && line >= first) this._states!.setEndState(line, state)
            },
        }
        if (this._support.createBackgroundTokenizer && !this._support.backgroundTokenizerShouldOnlyVerifyTokens) {
            this._bg = this._support.createBackgroundTokenizer(this._host, store) ?? null
        }
        if (!this._bg) {
            this._bg = { dispose: () => { }, requestTokens: (s, e) => this._states?.invalidate(s, e) }
            this._defaultBg = true
            this._scheduleBackground()
        }
    }

    // ── 事件入口(model 调) ──

    handleContent(e: { isFlush: boolean, isEolChange?: boolean, changes: readonly ContentChange[] }): void {
        // 语义 token 跟着文本平移(不等 provider 重新给);换行符变了行内容没变,不用动
        if (e.isFlush) this._semantic.flush()
        else if (!e.isEolChange) for (const c of e.changes) { const [n, f, l] = countEOL3(c.text); this._semantic.acceptEdit(c.range, n, f, l, c.text.length > 0 ? c.text.charCodeAt(0) : 0) }
        if (this._sync()) return // 刚按新文档重建过,不用再套这次编辑
        if (e.isFlush) { this._reset(false); return }
        if (e.isEolChange) return // 换行符变了,行内容没变
        const batch: [number, number, number][] | null = e.changes.length > 1 ? this._asBatch(e.changes) : null
        for (const c of e.changes) {
            const [eols, firstLen] = countEOL(c.text)
            this._tokens.acceptEdit(c.range, eols, firstLen)
            if (!batch) this._states?.acceptChange(c.range.startLineNumber, c.range.endLineNumber + 1, eols + 1)
        }
        if (batch) this._states?.acceptChanges(batch)
        this._scheduleBackground()
    }

    /** 从后往前、互不相交的改动(撤销 / 批量编辑的常态)转成升序的 [起始行, 结束行(不含), 新行数];不是这个形状返回 null,调用方逐个来 */
    private _asBatch(changes: readonly ContentChange[]): [number, number, number][] | null {
        const out: [number, number, number][] = []
        let prev: ContentChange | null = null
        for (let i = changes.length - 1; i >= 0; i--) {
            const c = changes[i], r = c.range
            if (prev) {   // 升序:这一段必须在上一段之前结束
                const p = prev.range
                if (p.endLineNumber > r.startLineNumber || (p.endLineNumber === r.startLineNumber && p.endColumn > r.startColumn)) return null
            }
            const s = r.startLineNumber, e = r.endLineNumber + 1, n = countEOL(c.text)[0] + 1
            const last = out[out.length - 1]
            if (last && s === last[1] - 1) { last[1] = e; last[2] += n - 1 } else out.push([s, e, n])
            prev = c
        }
        return out
    }

    handleLanguageChanged(): void { this._sync() }
    handleAttachedChanged(): void { this._scheduleBackground() }

    dispose(): void {
        this._disposed = true
        this._registrySub?.dispose()
        this._bg?.dispose()
        if (this._bgScheduled !== null) clearTimeout(this._bgScheduled)
        this._onTokens.dispose()
        this._onBgState.dispose()
    }

    // ── 分词 ──

    private _setTokens(batches: IMultilineTokens[]): void {
        if (batches.length === 0) return
        const changes = this._tokens.setBatches(batches, this._host.getLanguageId(), n => this._host.getLineLength(n))
        if (changes.length) this._onTokens.fire({ semanticTokensApplied: false, ranges: changes })
    }

    private _tokenize(text: string, hasEOL: boolean, state: IState): EncodedTokenizationResult {
        let r: EncodedTokenizationResult | null = null
        try { r = this._support!.tokenizeEncoded(text, hasEOL, state.clone()) } catch { /* 分词器抛错:当没分 */ }
        if (!r) {
            const t = new Uint32Array([0, ((this._codec.encodeLanguageId(this._host.getLanguageId()) << MetadataConsts.LANGUAGEID_OFFSET)
                | (ColorId.DefaultForeground << MetadataConsts.FOREGROUND_OFFSET) | (ColorId.DefaultBackground << MetadataConsts.BACKGROUND_OFFSET)) >>> 0])
            r = new EncodedTokenizationResult(t, state)
        }
        LineTokens.convertToEndOffset(r.tokens, text.length)
        return r
    }

    /** 从第一条失效行起顺序算到 lineNumber(含) */
    private _updateUntil(builder: BatchBuilder, lineNumber: number): void {
        const st = this._states!
        while (true) {
            const line = st.firstInvalid
            if (line === null || line > lineNumber) break
            const start = st.startState(line, this._initial!)
            if (!start) throw new Error('Start state must be defined')
            const r = this._tokenize(this._host.getLineContent(line), true, start)
            builder.add(line, r.tokens)
            st.setEndState(line, r.endState)
        }
    }

    forceTokenization(lineNumber: number): void {
        this._sync()
        if (!this._states) return
        const b = new BatchBuilder()
        this._updateUntil(b, lineNumber)
        this._setTokens(b.batches)
        this._checkFinished()
    }

    private _checkFinished(): void {
        if (this._defaultBg && this._states?.allValid && this.backgroundTokenizationState !== BackgroundTokenizationState.Completed) {
            this.backgroundTokenizationState = BackgroundTokenizationState.Completed
            this._onBgState.fire()
        }
    }

    private _scheduleBackground(): void {
        if (!this._defaultBg || this._bgScheduled !== null || this._disposed || !this._states || this._states.allValid || !this._host.isAttachedToEditor()) return
        this._bgScheduled = setTimeout(() => {
            this._bgScheduled = null
            if (this._disposed || !this._states || !this._host.isAttachedToEditor()) return
            const b = new BatchBuilder()
            const t0 = Date.now()
            const last = this._host.getLineCount()
            while (!this._states.allValid && Date.now() - t0 <= 1) {
                const line = this._states.firstInvalid!
                this._updateUntil(b, line)
                if (line >= last) break
            }
            this._setTokens(b.batches)
            this._checkFinished()
            this._scheduleBackground()
        }, 0)
    }

    hasAccurateTokensForLine(lineNumber: number): boolean {
        this._sync()
        return this._states ? lineNumber < this._states.firstInvalidOrMax : true
    }

    isCheapToTokenize(lineNumber: number): boolean {
        this._sync()
        if (!this._states) return true
        const first = this._states.firstInvalidOrMax
        return lineNumber < first || (lineNumber === first && this._host.getLineLength(lineNumber) < CHEAP_TOKENIZATION_LENGTH_LIMIT)
    }

    tokenizeIfCheap(lineNumber: number): void { if (this.isCheapToTokenize(lineNumber)) this.forceTokenization(lineNumber) }

    getLineTokens(lineNumber: number): LineTokens {
        this._sync()
        const n = this._host.getLineCount()
        if (lineNumber < 1 || lineNumber > n) throw new Error('Illegal value for lineNumber')
        // 语义 token 叠在语法 token 上(Monaco:syntactic → addSparseTokens)
        return this._semantic.addSparseTokens(lineNumber, this._tokens.get(this._host.getLanguageId(), lineNumber - 1, this._host.getLineContent(lineNumber)))
    }

    setSemanticTokens(tokens: SparseMultilineTokens[] | null, isComplete: boolean): void {
        this._semantic.set(tokens, isComplete, this._host)
        this._onTokens.fire({ semanticTokensApplied: tokens !== null, ranges: [{ fromLineNumber: 1, toLineNumber: this._host.getLineCount() }] })
    }
    hasCompleteSemanticTokens(): boolean { return this._semantic.isComplete() }
    hasSomeSemanticTokens(): boolean { return !this._semantic.isEmpty() }
    setPartialSemanticTokens(range: Range, tokens: SparseMultilineTokens[] | null): void {
        if (this.hasCompleteSemanticTokens()) return
        const changed = this._semantic.setPartial(range, tokens ?? [])
        const v = this._host.validateRange ? this._host.validateRange(changed) : changed
        this._onTokens.fire({ semanticTokensApplied: true, ranges: [{ fromLineNumber: v.startLineNumber, toLineNumber: v.endLineNumber }] })
    }

    getLanguageId(): string { return this._host.getLanguageId() }

    getLanguageIdAtPosition(lineNumber: number, column: number): string {
        const p = this._host.validatePosition({ lineNumber, column })
        const lt = this.getLineTokens(p.lineNumber)
        return lt.getLanguageId(lt.findTokenIndexAtOffset(p.column - 1))
    }

    /** 假设在 (line, column) 插入 character,那个字符落在什么类型的 token 里(自动闭合引号 / 括号判断用) */
    getTokenTypeIfInsertingCharacter(lineNumber: number, column: number, character: string): StandardTokenType {
        this._sync()
        if (!this._states) return StandardTokenType.Other
        const pos = this._host.validatePosition({ lineNumber, column })
        this.forceTokenization(pos.lineNumber)
        const start = this._states.startState(pos.lineNumber, this._initial!)
        if (!start) return StandardTokenType.Other
        const content = this._host.getLineContent(pos.lineNumber)
        const text = content.substring(0, pos.column - 1) + character + content.substring(pos.column - 1)
        const r = this._tokenize(text, true, start)
        const lt = new LineTokens(r.tokens, text, this._codec)
        if (lt.getCount() === 0) return StandardTokenType.Other
        return lt.getStandardTokenType(lt.findTokenIndexAtOffset(pos.column - 1))
    }

    /** 以 lineNumber 的起始状态把 lines 逐行分词(不缓存) */
    tokenizeLinesAt(lineNumber: number, lines: string[]): LineTokens[] | null {
        this._sync()
        if (!this._states) return null
        this.forceTokenization(lineNumber)
        let state = this._states.startState(lineNumber, this._initial!)
        if (!state) return null
        const out: LineTokens[] = []
        for (const line of lines) {
            const r = this._tokenize(line, true, state)
            out.push(new LineTokens(r.tokens, line, this._codec))
            state = r.endState
        }
        return out
    }

    get hasTokens(): boolean { return this._tokens.hasTokens }
}
