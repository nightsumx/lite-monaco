// 语义 token(Monaco contrib/semanticTokens/common/getSemanticTokens + common/services/semanticTokensProviderStyling / semanticTokensStylingService):
//   - provider 协议:DocumentSemanticTokensProvider(整篇,可带 resultId 做增量 edits)/ DocumentRangeSemanticTokensProvider(按区间)
//   - getDocumentSemanticTokens:最高分那一组 provider 同时问,取第一个「真有 token 的」;有人抛错就抛(让上游别把闪烁的空结果当真)
//   - toMultilineTokens2:provider 给的 [deltaLine, deltaChar, length, type, modifiers] → 带主题 metadata 的稀疏区间(SparseMultilineTokens)
//   - SemanticTokensProviderStyling:(tokenType, modifiers, language) → metadata 的哈希缓存,主题给不出样式的算 NO_STYLING 直接丢
import type { CancellationToken } from './async'
import { SparseMultilineTokens, SemanticMetadata } from '../api/sparsetokens'
import { FontStyle, MetadataConsts } from '../api/tokenization'
import type { LanguageFeatureRegistry, FeatureModel } from './languagefeatures'
import type { IEvent, IDisposable } from '../api/types'
import type { IRange } from '../api/position'

export interface SemanticTokensLegend { readonly tokenTypes: string[], readonly tokenModifiers: string[] }
export interface SemanticTokens { readonly resultId?: string, readonly data: Uint32Array }
export interface SemanticTokensEdit { readonly start: number, readonly deleteCount: number, readonly data?: Uint32Array }
export interface SemanticTokensEdits { readonly resultId?: string, readonly edits: SemanticTokensEdit[] }
type Maybe<T> = T | null | undefined | PromiseLike<T | null | undefined>
export interface DocumentSemanticTokensProvider {
    readonly onDidChange?: IEvent<void>
    getLegend(): SemanticTokensLegend
    provideDocumentSemanticTokens(model: FeatureModel, lastResultId: string | null, token: CancellationToken): Maybe<SemanticTokens | SemanticTokensEdits>
    releaseDocumentSemanticTokens(resultId: string | undefined): void
}
export interface DocumentRangeSemanticTokensProvider {
    readonly onDidChange?: IEvent<void>
    getLegend(): SemanticTokensLegend
    provideDocumentRangeSemanticTokens(model: FeatureModel, range: IRange, token: CancellationToken): Maybe<SemanticTokens>
}
export type DocumentTokensProvider = DocumentSemanticTokensProvider | DocumentRangeSemanticTokensProvider

export function isSemanticTokens(v: SemanticTokens | SemanticTokensEdits): v is SemanticTokens {
    return v && !!((v as SemanticTokens).data)
}
export function isSemanticTokensEdits(v: SemanticTokens | SemanticTokensEdits): v is SemanticTokensEdits {
    return v && Array.isArray((v as SemanticTokensEdits).edits)
}

export class DocumentSemanticTokensResult {
    constructor(
        readonly provider: DocumentSemanticTokensProvider,
        readonly tokens: SemanticTokens | SemanticTokensEdits | null,
        readonly error: unknown,
    ) { }
}
class DocumentRangeSemanticTokensResult {
    constructor(readonly provider: DocumentRangeSemanticTokensProvider, readonly tokens: SemanticTokens | null) { }
}

const highestGroup = <T>(registry: LanguageFeatureRegistry<T>, model: FeatureModel): T[] => registry.orderedGroups(model)[0] ?? []

export const hasDocumentSemanticTokensProvider = (registry: LanguageFeatureRegistry<DocumentSemanticTokensProvider>, model: FeatureModel): boolean => registry.has(model)
export const hasDocumentRangeSemanticTokensProvider = (registry: LanguageFeatureRegistry<DocumentRangeSemanticTokensProvider>, model: FeatureModel): boolean => registry.has(model)

export async function getDocumentSemanticTokens(
    registry: LanguageFeatureRegistry<DocumentSemanticTokensProvider>, model: FeatureModel,
    lastProvider: DocumentSemanticTokensProvider | null, lastResultId: string | null, token: CancellationToken,
): Promise<DocumentSemanticTokensResult | null> {
    // 最高分那一组的所有 provider 同时问
    const results = await Promise.all(highestGroup(registry, model).map(async provider => {
        let result: SemanticTokens | SemanticTokensEdits | null | undefined
        let error: unknown = null
        try {
            result = await provider.provideDocumentSemanticTokens(model, provider === lastProvider ? lastResultId : null, token)
        } catch (err) {
            error = err
            result = null
        }
        if (!result || (!isSemanticTokens(result) && !isSemanticTokensEdits(result))) result = null
        return new DocumentSemanticTokensResult(provider, result, error)
    }))
    // 第一个有 token 的;或者第一个抛了错的(!!)
    for (const r of results) {
        if (r.error) throw r.error
        if (r.tokens) return r
    }
    // 都没有 token:返回第一个
    return results.length > 0 ? results[0] : null
}

export async function getDocumentRangeSemanticTokens(
    registry: LanguageFeatureRegistry<DocumentRangeSemanticTokensProvider>, model: FeatureModel, range: IRange, token: CancellationToken,
): Promise<DocumentRangeSemanticTokensResult | null> {
    const results = await Promise.all(highestGroup(registry, model).map(async provider => {
        let result: SemanticTokens | null | undefined
        try {
            result = await provider.provideDocumentRangeSemanticTokens(model, range, token)
        } catch (err) {
            console.error(err)
            result = null
        }
        if (!result || !isSemanticTokens(result)) result = null
        return new DocumentRangeSemanticTokensResult(provider, result)
    }))
    for (const r of results) if (r.tokens) return r
    return results.length > 0 ? results[0] : null
}

// ───────────── 样式:主题 → metadata ─────────────

/** 主题给语义 token 的样式(Monaco TokenStyle 的子集):字段 undefined = 主题没说,沿用语法 token 的 */
export interface SemanticTokenStyle { foreground?: number, italic?: boolean, bold?: boolean, underline?: boolean, strikethrough?: boolean }
/** SemanticTokensProviderStyling 要的主题:token 样式查询 */
export interface SemanticStylingTheme {
    getColorTheme(): { getTokenStyleMetadata(type: string, modifiers: string[], modelLanguage: string): SemanticTokenStyle | undefined }
}
export interface SemanticStylingLog { warn(message: string): void }

const NO_STYLING = 0b01111111111111111111111111111111
const ITALIC = FontStyle.Italic, BOLD = FontStyle.Bold, UNDERLINE = FontStyle.Underline, STRIKE = FontStyle.Strikethrough
const FS = MetadataConsts.FONT_STYLE_OFFSET, FG = MetadataConsts.FOREGROUND_OFFSET
const S = SemanticMetadata

export class SemanticTokensProviderStyling {
    private readonly _hashTable = new HashTable()
    private _hasWarnedOverlappingTokens = false
    private _hasWarnedInvalidLengthTokens = false
    private _hasWarnedInvalidEditStart = false

    constructor(
        private readonly _legend: SemanticTokensLegend,
        private readonly _themeService: SemanticStylingTheme,
        private readonly _languageService: { languageIdCodec: { encodeLanguageId(id: string): number } },
        private readonly _logService: SemanticStylingLog,
    ) { }

    getMetadata(tokenTypeIndex: number, tokenModifierSet: number, languageId: string): number {
        const encodedLanguageId = this._languageService.languageIdCodec.encodeLanguageId(languageId)
        const entry = this._hashTable.get(tokenTypeIndex, tokenModifierSet, encodedLanguageId)
        if (entry) return entry.metadata
        let metadata: number
        const tokenType = this._legend.tokenTypes[tokenTypeIndex]
        if (tokenType) {
            const tokenModifiers: string[] = []
            let modifierSet = tokenModifierSet
            for (let i = 0; modifierSet > 0 && i < this._legend.tokenModifiers.length; i++) {
                if (modifierSet & 1) tokenModifiers.push(this._legend.tokenModifiers[i])
                modifierSet = modifierSet >> 1
            }
            const style = this._themeService.getColorTheme().getTokenStyleMetadata(tokenType, tokenModifiers, languageId)
            if (typeof style === 'undefined') {
                metadata = NO_STYLING
            } else {
                metadata = 0
                // 只在主题明说了的属性上打「用语义的」位(叠加时语义只盖这些位)
                if (typeof style.italic !== 'undefined') metadata |= ((style.italic ? ITALIC : 0) << FS) | S.SEMANTIC_USE_ITALIC
                if (typeof style.bold !== 'undefined') metadata |= ((style.bold ? BOLD : 0) << FS) | S.SEMANTIC_USE_BOLD
                if (typeof style.underline !== 'undefined') metadata |= ((style.underline ? UNDERLINE : 0) << FS) | S.SEMANTIC_USE_UNDERLINE
                if (typeof style.strikethrough !== 'undefined') metadata |= ((style.strikethrough ? STRIKE : 0) << FS) | S.SEMANTIC_USE_STRIKETHROUGH
                if (style.foreground) metadata |= (style.foreground << FG) | S.SEMANTIC_USE_FOREGROUND
                if (metadata === 0) metadata = NO_STYLING // 什么都没说
            }
        } else {
            metadata = NO_STYLING // legend 里没有这个类型
        }
        this._hashTable.add(tokenTypeIndex, tokenModifierSet, encodedLanguageId, metadata)
        return metadata
    }

    warnOverlappingSemanticTokens(lineNumber: number, startColumn: number): void {
        if (this._hasWarnedOverlappingTokens) return
        this._hasWarnedOverlappingTokens = true
        this._logService.warn(`Overlapping semantic tokens detected at lineNumber ${lineNumber}, column ${startColumn}`)
    }
    warnInvalidLengthSemanticTokens(lineNumber: number, startColumn: number): void {
        if (this._hasWarnedInvalidLengthTokens) return
        this._hasWarnedInvalidLengthTokens = true
        this._logService.warn(`Semantic token with invalid length detected at lineNumber ${lineNumber}, column ${startColumn}`)
    }
    warnInvalidEditStart(previousResultId: string | undefined, resultId: string | undefined, editIndex: number, editStart: number, maxExpectedStart: number): void {
        if (this._hasWarnedInvalidEditStart) return
        this._hasWarnedInvalidEditStart = true
        this._logService.warn(`Invalid semantic tokens edit detected (previousResultId: ${previousResultId}, resultId: ${resultId}) at edit #${editIndex}: The provided start offset ${editStart} is outside the previous data (length ${maxExpectedStart}).`)
    }
}

/** provider → styling 的缓存;主题一换就整个作废(metadata 里嵌了主题色 id) */
export class SemanticTokensStylingService implements IDisposable {
    private _caches = new WeakMap<DocumentTokensProvider, SemanticTokensProviderStyling>()
    private readonly _sub: IDisposable | undefined
    constructor(
        private readonly _themeService: SemanticStylingTheme & { onDidColorThemeChange: IEvent<unknown> },
        private readonly _logService: SemanticStylingLog,
        private readonly _languageService: { languageIdCodec: { encodeLanguageId(id: string): number } },
    ) {
        this._sub = this._themeService.onDidColorThemeChange(() => { this._caches = new WeakMap() })
    }
    getStyling(provider: DocumentTokensProvider): SemanticTokensProviderStyling {
        let s = this._caches.get(provider)
        if (!s) this._caches.set(provider, s = new SemanticTokensProviderStyling(provider.getLegend(), this._themeService, this._languageService, this._logService))
        return s
    }
    dispose(): void { this._sub?.dispose() }
}

const enum SemanticColoringConstants {
    /**
     * Let's aim at having 8KB buffers if possible...
     * So that would be 8192 / (5 * 4) = 409.6 tokens per area
     */
    DesiredTokensPerArea = 400,

    /**
     * Try to keep the total number of areas under 1024 if possible,
     * simply compensate by having more tokens per area...
     */
    DesiredMaxAreas = 1024,
}

export function toMultilineTokens2(tokens: SemanticTokens, styling: SemanticTokensProviderStyling, languageId: string): SparseMultilineTokens[] {
    const srcData = tokens.data
    const tokenCount = (tokens.data.length / 5) | 0
    const tokensPerArea = Math.max(Math.ceil(tokenCount / SemanticColoringConstants.DesiredMaxAreas), SemanticColoringConstants.DesiredTokensPerArea)
    const result: SparseMultilineTokens[] = []

    let tokenIndex = 0
    let lastLineNumber = 1
    let lastStartCharacter = 0
    while (tokenIndex < tokenCount) {
        const tokenStartIndex = tokenIndex
        let tokenEndIndex = Math.min(tokenStartIndex + tokensPerArea, tokenCount)

        // Keep tokens on the same line in the same area...
        if (tokenEndIndex < tokenCount) {

            let smallTokenEndIndex = tokenEndIndex
            while (smallTokenEndIndex - 1 > tokenStartIndex && srcData[5 * smallTokenEndIndex] === 0) {
                smallTokenEndIndex--
            }

            if (smallTokenEndIndex - 1 === tokenStartIndex) {
                // there are so many tokens on this line that our area would be empty, we must now go right
                let bigTokenEndIndex = tokenEndIndex
                while (bigTokenEndIndex + 1 < tokenCount && srcData[5 * bigTokenEndIndex] === 0) {
                    bigTokenEndIndex++
                }
                tokenEndIndex = bigTokenEndIndex
            } else {
                tokenEndIndex = smallTokenEndIndex
            }
        }

        let destData = new Uint32Array((tokenEndIndex - tokenStartIndex) * 4)
        let destOffset = 0
        let areaLine = 0
        let prevLineNumber = 0
        let prevEndCharacter = 0
        while (tokenIndex < tokenEndIndex) {
            const srcOffset = 5 * tokenIndex
            const deltaLine = srcData[srcOffset]
            const deltaCharacter = srcData[srcOffset + 1]
            // Casting both `lineNumber`, `startCharacter` and `endCharacter` here to uint32 using `|0`
            // to validate below with the actual values that will be inserted in the Uint32Array result
            const lineNumber = (lastLineNumber + deltaLine) | 0
            const startCharacter = (deltaLine === 0 ? (lastStartCharacter + deltaCharacter) | 0 : deltaCharacter)
            const length = srcData[srcOffset + 2]
            const endCharacter = (startCharacter + length) | 0
            const tokenTypeIndex = srcData[srcOffset + 3]
            const tokenModifierSet = srcData[srcOffset + 4]

            if (endCharacter <= startCharacter) {
                // this token is invalid (most likely a negative length casted to uint32)
                styling.warnInvalidLengthSemanticTokens(lineNumber, startCharacter + 1)
            } else if (prevLineNumber === lineNumber && prevEndCharacter > startCharacter) {
                // this token overlaps with the previous token
                styling.warnOverlappingSemanticTokens(lineNumber, startCharacter + 1)
            } else {
                const metadata = styling.getMetadata(tokenTypeIndex, tokenModifierSet, languageId)

                if (metadata !== NO_STYLING) {
                    if (areaLine === 0) {
                        areaLine = lineNumber
                    }
                    destData[destOffset] = lineNumber - areaLine
                    destData[destOffset + 1] = startCharacter
                    destData[destOffset + 2] = endCharacter
                    destData[destOffset + 3] = metadata
                    destOffset += 4

                    prevLineNumber = lineNumber
                    prevEndCharacter = endCharacter
                }
            }

            lastLineNumber = lineNumber
            lastStartCharacter = startCharacter
            tokenIndex++
        }

        if (destOffset !== destData.length) {
            destData = destData.subarray(0, destOffset)
        }

        const tokens = SparseMultilineTokens.create(areaLine, destData)
        result.push(tokens)
    }

    return result
}

class HashTableEntry {
    public readonly tokenTypeIndex: number
    public readonly tokenModifierSet: number
    public readonly languageId: number
    public readonly metadata: number
    public next: HashTableEntry | null

    constructor(tokenTypeIndex: number, tokenModifierSet: number, languageId: number, metadata: number) {
        this.tokenTypeIndex = tokenTypeIndex
        this.tokenModifierSet = tokenModifierSet
        this.languageId = languageId
        this.metadata = metadata
        this.next = null
    }
}

class HashTable {

    private static _SIZES = [3, 7, 13, 31, 61, 127, 251, 509, 1021, 2039, 4093, 8191, 16381, 32749, 65521, 131071, 262139, 524287, 1048573, 2097143]

    private _elementsCount: number
    private _currentLengthIndex: number
    private _currentLength: number
    private _growCount: number
    private _elements: (HashTableEntry | null)[]

    constructor() {
        this._elementsCount = 0
        this._currentLengthIndex = 0
        this._currentLength = HashTable._SIZES[this._currentLengthIndex]
        this._growCount = Math.round(this._currentLengthIndex + 1 < HashTable._SIZES.length ? 2 / 3 * this._currentLength : 0)
        this._elements = []
        HashTable._nullOutEntries(this._elements, this._currentLength)
    }

    private static _nullOutEntries(entries: (HashTableEntry | null)[], length: number): void {
        for (let i = 0; i < length; i++) {
            entries[i] = null
        }
    }

    private _hash2(n1: number, n2: number): number {
        return (((n1 << 5) - n1) + n2) | 0;  // n1 * 31 + n2, keep as int32
    }

    private _hashFunc(tokenTypeIndex: number, tokenModifierSet: number, languageId: number): number {
        return this._hash2(this._hash2(tokenTypeIndex, tokenModifierSet), languageId) % this._currentLength
    }

    public get(tokenTypeIndex: number, tokenModifierSet: number, languageId: number): HashTableEntry | null {
        const hash = this._hashFunc(tokenTypeIndex, tokenModifierSet, languageId)

        let p = this._elements[hash]
        while (p) {
            if (p.tokenTypeIndex === tokenTypeIndex && p.tokenModifierSet === tokenModifierSet && p.languageId === languageId) {
                return p
            }
            p = p.next
        }

        return null
    }

    public add(tokenTypeIndex: number, tokenModifierSet: number, languageId: number, metadata: number): void {
        this._elementsCount++
        if (this._growCount !== 0 && this._elementsCount >= this._growCount) {
            // expand!
            const oldElements = this._elements

            this._currentLengthIndex++
            this._currentLength = HashTable._SIZES[this._currentLengthIndex]
            this._growCount = Math.round(this._currentLengthIndex + 1 < HashTable._SIZES.length ? 2 / 3 * this._currentLength : 0)
            this._elements = []
            HashTable._nullOutEntries(this._elements, this._currentLength)

            for (const first of oldElements) {
                let p = first
                while (p) {
                    const oldNext = p.next
                    p.next = null
                    this._add(p)
                    p = oldNext
                }
            }
        }
        this._add(new HashTableEntry(tokenTypeIndex, tokenModifierSet, languageId, metadata))
    }

    private _add(element: HashTableEntry): void {
        const hash = this._hashFunc(element.tokenTypeIndex, element.tokenModifierSet, element.languageId)
        element.next = this._elements[hash]
        this._elements[hash] = element
    }
}

