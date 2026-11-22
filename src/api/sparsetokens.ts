// 稀疏语义 token 存储(Monaco common/tokens/sparseMultilineTokens + sparseTokensStore 的结构移植)。
// 语义 token(provider 给的 [deltaLine, deltaChar, length, type, modifiers])经 toMultilineTokens2 转成「按行带 metadata 的稀疏区间」,
// 存在 SparseTokensStore 里;model.tokenization.getLineTokens 把它叠在语法 token 上(语义色盖语法色,只盖 metadata 里标了 SEMANTIC_USE_* 的那几位)。
// 编辑时 token 偏移跟着文本平移 / 截断(acceptEdit),不等 provider 重新给就能画出大致正确的颜色。
import { Position, Range, type IRange } from './position'
import { LineTokens, type ILanguageIdCodec } from './tokenization'

/** 语义 token 的 metadata 位(同 Monaco encodedTokenAttributes):低 6 位标「这个属性由语义 token 决定」,其余位同语法 token 的布局 */
export const SemanticMetadata = {
    SEMANTIC_USE_ITALIC: 0b000001, SEMANTIC_USE_BOLD: 0b000010, SEMANTIC_USE_UNDERLINE: 0b000100,
    SEMANTIC_USE_STRIKETHROUGH: 0b001000, SEMANTIC_USE_FOREGROUND: 0b010000, SEMANTIC_USE_BACKGROUND: 0b100000,
    ITALIC_MASK: 0x800, BOLD_MASK: 0x1000, UNDERLINE_MASK: 0x2000, STRIKETHROUGH_MASK: 0x4000,
} as const
// 注意:不从 tokenization 取 MetadataConsts(tokenization 反过来 import 本文件,模块顶层求值会撞循环)
const M = { ...SemanticMetadata, FOREGROUND_MASK: 0xFF8000, BACKGROUND_MASK: 0xFF000000 }

/** [换行数, 首行长度, 末行长度](\r\n、\r、\n 都算一个换行) */
export function countEOL3(text: string): [number, number, number] {
    let eolCount = 0, firstLineLength = 0, lastLineStart = 0
    for (let i = 0, len = text.length; i < len; i++) {
        const chr = text.charCodeAt(i)
        if (chr === 13) {
            if (eolCount === 0) firstLineLength = i
            eolCount++
            if (i + 1 < len && text.charCodeAt(i + 1) === 10) i++
            lastLineStart = i + 1
        } else if (chr === 10) {
            if (eolCount === 0) firstLineLength = i
            eolCount++
            lastLineStart = i + 1
        }
    }
    if (eolCount === 0) firstLineLength = text.length
    return [eolCount, firstLineLength, text.length - lastLineStart]
}

/** 每分钟最多报几次(坏数据别刷屏) */
class RateLimiter {
    private _lastRun = 0
    private readonly _min: number
    constructor(readonly timesPerSecond: number = 5) { this._min = 1000 / timesPerSecond }
    runIfNotLimited(callback: () => void): void {
        const now = Date.now()
        if (now - this._lastRun >= this._min) { this._lastRun = now; callback() }
    }
}

/** 校验用的 model 子集 */
export interface SparseTokensModel { getLineCount(): number, getLineLength(lineNumber: number): number }

const Null = 0, Digit0 = 48, Digit9 = 57, CharA = 65, CharZ = 90, Chara = 97, Charz = 122
const CharCode = { Null, Digit0, Digit9, A: CharA, Z: CharZ, a: Chara, z: Charz }

function arrayInsert<T>(target: T[], insertIndex: number, insertArr: T[]): T[] {
    const before = target.slice(0, insertIndex)
    const after = target.slice(insertIndex)
    return before.concat(insertArr, after)
}


/**
 * Represents sparse tokens over a contiguous range of lines.
 */
export class SparseMultilineTokens {

    public static create(startLineNumber: number, tokens: Uint32Array): SparseMultilineTokens {
        return new SparseMultilineTokens(startLineNumber, new SparseMultilineTokensStorage(tokens))
    }

    private _startLineNumber: number
    private _endLineNumber: number
    private readonly _tokens: SparseMultilineTokensStorage

    /**
     * (Inclusive) start line number for these tokens.
     */
    public get startLineNumber(): number {
        return this._startLineNumber
    }

    /**
     * (Inclusive) end line number for these tokens.
     */
    public get endLineNumber(): number {
        return this._endLineNumber
    }

    private constructor(startLineNumber: number, tokens: SparseMultilineTokensStorage) {
        this._startLineNumber = startLineNumber
        this._tokens = tokens
        this._endLineNumber = this._startLineNumber + this._tokens.getMaxDeltaLine()
    }

    public toString(): string {
        return this._tokens.toString(this._startLineNumber)
    }

    private _updateEndLineNumber(): void {
        this._endLineNumber = this._startLineNumber + this._tokens.getMaxDeltaLine()
    }

    public isEmpty(): boolean {
        return this._tokens.isEmpty()
    }

    public getLineTokens(lineNumber: number): SparseLineTokens | null {
        if (this._startLineNumber <= lineNumber && lineNumber <= this._endLineNumber) {
            return this._tokens.getLineTokens(lineNumber - this._startLineNumber)
        }
        return null
    }

    public getRange(): Range | null {
        const deltaRange = this._tokens.getRange()
        if (!deltaRange) {
            return deltaRange
        }
        return new Range(this._startLineNumber + deltaRange.startLineNumber, deltaRange.startColumn, this._startLineNumber + deltaRange.endLineNumber, deltaRange.endColumn)
    }

    public removeTokens(range: Range): void {
        const startLineIndex = range.startLineNumber - this._startLineNumber
        const endLineIndex = range.endLineNumber - this._startLineNumber

        this._startLineNumber += this._tokens.removeTokens(startLineIndex, range.startColumn - 1, endLineIndex, range.endColumn - 1)
        this._updateEndLineNumber()
    }

    public split(range: Range): [SparseMultilineTokens, SparseMultilineTokens] {
        // split tokens to two:
        // a) all the tokens before `range`
        // b) all the tokens after `range`
        const startLineIndex = range.startLineNumber - this._startLineNumber
        const endLineIndex = range.endLineNumber - this._startLineNumber

        const [a, b, bDeltaLine] = this._tokens.split(startLineIndex, range.startColumn - 1, endLineIndex, range.endColumn - 1)
        return [new SparseMultilineTokens(this._startLineNumber, a), new SparseMultilineTokens(this._startLineNumber + bDeltaLine, b)]
    }

    public applyEdit(range: IRange, text: string): void {
        const [eolCount, firstLineLength, lastLineLength] = countEOL3(text)
        this.acceptEdit(range, eolCount, firstLineLength, lastLineLength, text.length > 0 ? text.charCodeAt(0) : CharCode.Null)
    }

    public acceptEdit(range: IRange, eolCount: number, firstLineLength: number, lastLineLength: number, firstCharCode: number): void {
        this._acceptDeleteRange(range)
        this._acceptInsertText(new Position(range.startLineNumber, range.startColumn), eolCount, firstLineLength, lastLineLength, firstCharCode)
        this._updateEndLineNumber()
    }

    private _acceptDeleteRange(range: IRange): void {
        if (range.startLineNumber === range.endLineNumber && range.startColumn === range.endColumn) {
            // Nothing to delete
            return
        }

        const firstLineIndex = range.startLineNumber - this._startLineNumber
        const lastLineIndex = range.endLineNumber - this._startLineNumber

        if (lastLineIndex < 0) {
            // this deletion occurs entirely before this block, so we only need to adjust line numbers
            const deletedLinesCount = lastLineIndex - firstLineIndex
            this._startLineNumber -= deletedLinesCount
            return
        }

        const tokenMaxDeltaLine = this._tokens.getMaxDeltaLine()

        if (firstLineIndex >= tokenMaxDeltaLine + 1) {
            // this deletion occurs entirely after this block, so there is nothing to do
            return
        }

        if (firstLineIndex < 0 && lastLineIndex >= tokenMaxDeltaLine + 1) {
            // this deletion completely encompasses this block
            this._startLineNumber = 0
            this._tokens.clear()
            return
        }

        if (firstLineIndex < 0) {
            const deletedBefore = -firstLineIndex
            this._startLineNumber -= deletedBefore

            this._tokens.acceptDeleteRange(range.startColumn - 1, 0, 0, lastLineIndex, range.endColumn - 1)
        } else {
            this._tokens.acceptDeleteRange(0, firstLineIndex, range.startColumn - 1, lastLineIndex, range.endColumn - 1)
        }
    }

    private _acceptInsertText(position: Position, eolCount: number, firstLineLength: number, lastLineLength: number, firstCharCode: number): void {

        if (eolCount === 0 && firstLineLength === 0) {
            // Nothing to insert
            return
        }

        const lineIndex = position.lineNumber - this._startLineNumber

        if (lineIndex < 0) {
            // this insertion occurs before this block, so we only need to adjust line numbers
            this._startLineNumber += eolCount
            return
        }

        const tokenMaxDeltaLine = this._tokens.getMaxDeltaLine()

        if (lineIndex >= tokenMaxDeltaLine + 1) {
            // this insertion occurs after this block, so there is nothing to do
            return
        }

        this._tokens.acceptInsertText(lineIndex, position.column - 1, eolCount, firstLineLength, lastLineLength, firstCharCode)
    }

    public reportIfInvalid(model: SparseTokensModel): void {
        this._tokens.reportIfInvalid(model, this._startLineNumber)
    }
}

class SparseMultilineTokensStorage {
    /**
     * The encoding of tokens is:
     *  4*i    deltaLine (from `startLineNumber`)
     *  4*i+1  startCharacter (from the line start)
     *  4*i+2  endCharacter (from the line start)
     *  4*i+3  metadata
     */
    private readonly _tokens: Uint32Array
    private _tokenCount: number

    constructor(tokens: Uint32Array) {
        this._tokens = tokens
        this._tokenCount = tokens.length / 4
    }

    public toString(startLineNumber: number): string {
        const pieces: string[] = []
        for (let i = 0; i < this._tokenCount; i++) {
            pieces.push(`(${this._getDeltaLine(i) + startLineNumber},${this._getStartCharacter(i)}-${this._getEndCharacter(i)})`)
        }
        return `[${pieces.join(',')}]`
    }

    public getMaxDeltaLine(): number {
        const tokenCount = this._getTokenCount()
        if (tokenCount === 0) {
            return -1
        }
        return this._getDeltaLine(tokenCount - 1)
    }

    public getRange(): Range | null {
        const tokenCount = this._getTokenCount()
        if (tokenCount === 0) {
            return null
        }
        const startChar = this._getStartCharacter(0)
        const maxDeltaLine = this._getDeltaLine(tokenCount - 1)
        const endChar = this._getEndCharacter(tokenCount - 1)
        return new Range(0, startChar + 1, maxDeltaLine, endChar + 1)
    }

    private _getTokenCount(): number {
        return this._tokenCount
    }

    private _getDeltaLine(tokenIndex: number): number {
        return this._tokens[4 * tokenIndex]
    }

    private _getStartCharacter(tokenIndex: number): number {
        return this._tokens[4 * tokenIndex + 1]
    }

    private _getEndCharacter(tokenIndex: number): number {
        return this._tokens[4 * tokenIndex + 2]
    }

    public isEmpty(): boolean {
        return (this._getTokenCount() === 0)
    }

    public getLineTokens(deltaLine: number): SparseLineTokens | null {
        let low = 0
        let high = this._getTokenCount() - 1

        while (low < high) {
            const mid = low + Math.floor((high - low) / 2)
            const midDeltaLine = this._getDeltaLine(mid)

            if (midDeltaLine < deltaLine) {
                low = mid + 1
            } else if (midDeltaLine > deltaLine) {
                high = mid - 1
            } else {
                let min = mid
                while (min > low && this._getDeltaLine(min - 1) === deltaLine) {
                    min--
                }
                let max = mid
                while (max < high && this._getDeltaLine(max + 1) === deltaLine) {
                    max++
                }
                return new SparseLineTokens(this._tokens.subarray(4 * min, 4 * max + 4))
            }
        }

        if (this._getDeltaLine(low) === deltaLine) {
            return new SparseLineTokens(this._tokens.subarray(4 * low, 4 * low + 4))
        }

        return null
    }

    public clear(): void {
        this._tokenCount = 0
    }

    public removeTokens(startDeltaLine: number, startChar: number, endDeltaLine: number, endChar: number): number {
        const tokens = this._tokens
        const tokenCount = this._tokenCount
        let newTokenCount = 0
        let hasDeletedTokens = false
        let firstDeltaLine = 0
        for (let i = 0; i < tokenCount; i++) {
            const srcOffset = 4 * i
            const tokenDeltaLine = tokens[srcOffset]
            const tokenStartCharacter = tokens[srcOffset + 1]
            const tokenEndCharacter = tokens[srcOffset + 2]
            const tokenMetadata = tokens[srcOffset + 3]

            if (
                (tokenDeltaLine > startDeltaLine || (tokenDeltaLine === startDeltaLine && tokenEndCharacter >= startChar))
                && (tokenDeltaLine < endDeltaLine || (tokenDeltaLine === endDeltaLine && tokenStartCharacter <= endChar))
            ) {
                hasDeletedTokens = true
            } else {
                if (newTokenCount === 0) {
                    firstDeltaLine = tokenDeltaLine
                }
                if (hasDeletedTokens) {
                    // must move the token to the left
                    const destOffset = 4 * newTokenCount
                    tokens[destOffset] = tokenDeltaLine - firstDeltaLine
                    tokens[destOffset + 1] = tokenStartCharacter
                    tokens[destOffset + 2] = tokenEndCharacter
                    tokens[destOffset + 3] = tokenMetadata
                } else if (firstDeltaLine !== 0) {
                    // must adjust the delta line in place
                    tokens[srcOffset] = tokenDeltaLine - firstDeltaLine
                }
                newTokenCount++
            }
        }

        this._tokenCount = newTokenCount

        return firstDeltaLine
    }

    public split(startDeltaLine: number, startChar: number, endDeltaLine: number, endChar: number): [SparseMultilineTokensStorage, SparseMultilineTokensStorage, number] {
        const tokens = this._tokens
        const tokenCount = this._tokenCount
        const aTokens: number[] = []
        const bTokens: number[] = []
        let destTokens: number[] = aTokens
        let destOffset = 0
        let destFirstDeltaLine: number = 0
        for (let i = 0; i < tokenCount; i++) {
            const srcOffset = 4 * i
            const tokenDeltaLine = tokens[srcOffset]
            const tokenStartCharacter = tokens[srcOffset + 1]
            const tokenEndCharacter = tokens[srcOffset + 2]
            const tokenMetadata = tokens[srcOffset + 3]

            if ((tokenDeltaLine > startDeltaLine || (tokenDeltaLine === startDeltaLine && tokenEndCharacter >= startChar))) {
                if ((tokenDeltaLine < endDeltaLine || (tokenDeltaLine === endDeltaLine && tokenStartCharacter <= endChar))) {
                    // this token is touching the range
                    continue
                } else {
                    // this token is after the range
                    if (destTokens !== bTokens) {
                        // this token is the first token after the range
                        destTokens = bTokens
                        destOffset = 0
                        destFirstDeltaLine = tokenDeltaLine
                    }
                }
            }

            destTokens[destOffset++] = tokenDeltaLine - destFirstDeltaLine
            destTokens[destOffset++] = tokenStartCharacter
            destTokens[destOffset++] = tokenEndCharacter
            destTokens[destOffset++] = tokenMetadata
        }

        return [new SparseMultilineTokensStorage(new Uint32Array(aTokens)), new SparseMultilineTokensStorage(new Uint32Array(bTokens)), destFirstDeltaLine]
    }

    public acceptDeleteRange(horizontalShiftForFirstLineTokens: number, startDeltaLine: number, startCharacter: number, endDeltaLine: number, endCharacter: number): void {
        // This is a bit complex, here are the cases I used to think about this:
        //
        // 1. The token starts before the deletion range
        // 1a. The token is completely before the deletion range
        //               -----------
        //                          xxxxxxxxxxx
        // 1b. The token starts before, the deletion range ends after the token
        //               -----------
        //                      xxxxxxxxxxx
        // 1c. The token starts before, the deletion range ends precisely with the token
        //               ---------------
        //                      xxxxxxxx
        // 1d. The token starts before, the deletion range is inside the token
        //               ---------------
        //                    xxxxx
        //
        // 2. The token starts at the same position with the deletion range
        // 2a. The token starts at the same position, and ends inside the deletion range
        //               -------
        //               xxxxxxxxxxx
        // 2b. The token starts at the same position, and ends at the same position as the deletion range
        //               ----------
        //               xxxxxxxxxx
        // 2c. The token starts at the same position, and ends after the deletion range
        //               -------------
        //               xxxxxxx
        //
        // 3. The token starts inside the deletion range
        // 3a. The token is inside the deletion range
        //                -------
        //             xxxxxxxxxxxxx
        // 3b. The token starts inside the deletion range, and ends at the same position as the deletion range
        //                ----------
        //             xxxxxxxxxxxxx
        // 3c. The token starts inside the deletion range, and ends after the deletion range
        //                ------------
        //             xxxxxxxxxxx
        //
        // 4. The token starts after the deletion range
        //                  -----------
        //          xxxxxxxx
        //
        const tokens = this._tokens
        const tokenCount = this._tokenCount
        const deletedLineCount = (endDeltaLine - startDeltaLine)
        let newTokenCount = 0
        let hasDeletedTokens = false
        for (let i = 0; i < tokenCount; i++) {
            const srcOffset = 4 * i
            let tokenDeltaLine = tokens[srcOffset]
            let tokenStartCharacter = tokens[srcOffset + 1]
            let tokenEndCharacter = tokens[srcOffset + 2]
            const tokenMetadata = tokens[srcOffset + 3]

            if (tokenDeltaLine < startDeltaLine || (tokenDeltaLine === startDeltaLine && tokenEndCharacter <= startCharacter)) {
                // 1a. The token is completely before the deletion range
                // => nothing to do
                newTokenCount++
                continue
            } else if (tokenDeltaLine === startDeltaLine && tokenStartCharacter < startCharacter) {
                // 1b, 1c, 1d
                // => the token survives, but it needs to shrink
                if (tokenDeltaLine === endDeltaLine && tokenEndCharacter > endCharacter) {
                    // 1d. The token starts before, the deletion range is inside the token
                    // => the token shrinks by the deletion character count
                    tokenEndCharacter -= (endCharacter - startCharacter)
                } else {
                    // 1b. The token starts before, the deletion range ends after the token
                    // 1c. The token starts before, the deletion range ends precisely with the token
                    // => the token shrinks its ending to the deletion start
                    tokenEndCharacter = startCharacter
                }
            } else if (tokenDeltaLine === startDeltaLine && tokenStartCharacter === startCharacter) {
                // 2a, 2b, 2c
                if (tokenDeltaLine === endDeltaLine && tokenEndCharacter > endCharacter) {
                    // 2c. The token starts at the same position, and ends after the deletion range
                    // => the token shrinks by the deletion character count
                    tokenEndCharacter -= (endCharacter - startCharacter)
                } else {
                    // 2a. The token starts at the same position, and ends inside the deletion range
                    // 2b. The token starts at the same position, and ends at the same position as the deletion range
                    // => the token is deleted
                    hasDeletedTokens = true
                    continue
                }
            } else if (tokenDeltaLine < endDeltaLine || (tokenDeltaLine === endDeltaLine && tokenStartCharacter < endCharacter)) {
                // 3a, 3b, 3c
                if (tokenDeltaLine === endDeltaLine && tokenEndCharacter > endCharacter) {
                    // 3c. The token starts inside the deletion range, and ends after the deletion range
                    // => the token moves to continue right after the deletion
                    tokenDeltaLine = startDeltaLine
                    tokenStartCharacter = startCharacter
                    tokenEndCharacter = tokenStartCharacter + (tokenEndCharacter - endCharacter)
                } else {
                    // 3a. The token is inside the deletion range
                    // 3b. The token starts inside the deletion range, and ends at the same position as the deletion range
                    // => the token is deleted
                    hasDeletedTokens = true
                    continue
                }
            } else if (tokenDeltaLine > endDeltaLine) {
                // 4. (partial) The token starts after the deletion range, on a line below...
                if (deletedLineCount === 0 && !hasDeletedTokens) {
                    // early stop, there is no need to walk all the tokens and do nothing...
                    newTokenCount = tokenCount
                    break
                }
                tokenDeltaLine -= deletedLineCount
            } else if (tokenDeltaLine === endDeltaLine && tokenStartCharacter >= endCharacter) {
                // 4. (continued) The token starts after the deletion range, on the last line where a deletion occurs
                if (horizontalShiftForFirstLineTokens && tokenDeltaLine === 0) {
                    tokenStartCharacter += horizontalShiftForFirstLineTokens
                    tokenEndCharacter += horizontalShiftForFirstLineTokens
                }
                tokenDeltaLine -= deletedLineCount
                tokenStartCharacter -= (endCharacter - startCharacter)
                tokenEndCharacter -= (endCharacter - startCharacter)
            } else {
                throw new Error(`Not possible!`)
            }

            const destOffset = 4 * newTokenCount
            tokens[destOffset] = tokenDeltaLine
            tokens[destOffset + 1] = tokenStartCharacter
            tokens[destOffset + 2] = tokenEndCharacter
            tokens[destOffset + 3] = tokenMetadata
            newTokenCount++
        }

        this._tokenCount = newTokenCount
    }

    public acceptInsertText(deltaLine: number, character: number, eolCount: number, firstLineLength: number, lastLineLength: number, firstCharCode: number): void {
        // Here are the cases I used to think about this:
        //
        // 1. The token is completely before the insertion point
        //            -----------   |
        // 2. The token ends precisely at the insertion point
        //            -----------|
        // 3. The token contains the insertion point
        //            -----|------
        // 4. The token starts precisely at the insertion point
        //            |-----------
        // 5. The token is completely after the insertion point
        //            |   -----------
        //
        const isInsertingPreciselyOneWordCharacter = (
            eolCount === 0
            && firstLineLength === 1
            && (
                (firstCharCode >= CharCode.Digit0 && firstCharCode <= CharCode.Digit9)
                || (firstCharCode >= CharCode.A && firstCharCode <= CharCode.Z)
                || (firstCharCode >= CharCode.a && firstCharCode <= CharCode.z)
            )
        )
        const tokens = this._tokens
        const tokenCount = this._tokenCount
        for (let i = 0; i < tokenCount; i++) {
            const offset = 4 * i
            let tokenDeltaLine = tokens[offset]
            let tokenStartCharacter = tokens[offset + 1]
            let tokenEndCharacter = tokens[offset + 2]

            if (tokenDeltaLine < deltaLine || (tokenDeltaLine === deltaLine && tokenEndCharacter < character)) {
                // 1. The token is completely before the insertion point
                // => nothing to do
                continue
            } else if (tokenDeltaLine === deltaLine && tokenEndCharacter === character) {
                // 2. The token ends precisely at the insertion point
                // => expand the end character only if inserting precisely one character that is a word character
                if (isInsertingPreciselyOneWordCharacter) {
                    tokenEndCharacter += 1
                } else {
                    continue
                }
            } else if (tokenDeltaLine === deltaLine && tokenStartCharacter < character && character < tokenEndCharacter) {
                // 3. The token contains the insertion point
                if (eolCount === 0) {
                    // => just expand the end character
                    tokenEndCharacter += firstLineLength
                } else {
                    // => cut off the token
                    tokenEndCharacter = character
                }
            } else {
                // 4. or 5.
                if (tokenDeltaLine === deltaLine && tokenStartCharacter === character) {
                    // 4. The token starts precisely at the insertion point
                    // => grow the token (by keeping its start constant) only if inserting precisely one character that is a word character
                    // => otherwise behave as in case 5.
                    if (isInsertingPreciselyOneWordCharacter) {
                        continue
                    }
                }
                // => the token must move and keep its size constant
                if (tokenDeltaLine === deltaLine) {
                    tokenDeltaLine += eolCount
                    // this token is on the line where the insertion is taking place
                    if (eolCount === 0) {
                        tokenStartCharacter += firstLineLength
                        tokenEndCharacter += firstLineLength
                    } else {
                        const tokenLength = tokenEndCharacter - tokenStartCharacter
                        tokenStartCharacter = lastLineLength + (tokenStartCharacter - character)
                        tokenEndCharacter = tokenStartCharacter + tokenLength
                    }
                } else {
                    tokenDeltaLine += eolCount
                }
            }

            tokens[offset] = tokenDeltaLine
            tokens[offset + 1] = tokenStartCharacter
            tokens[offset + 2] = tokenEndCharacter
        }
    }

    private static _rateLimiter = new RateLimiter(10 / 60); // limit to 10 times per minute

    public reportIfInvalid(model: SparseTokensModel, startLineNumber: number): void {
        for (let i = 0; i < this._tokenCount; i++) {
            const lineNumber = this._getDeltaLine(i) + startLineNumber

            if (lineNumber < 1) {
                SparseMultilineTokensStorage._rateLimiter.runIfNotLimited(() => {
                    console.error('Invalid Semantic Tokens Data From Extension: lineNumber < 1')
                })
            } else if (lineNumber > model.getLineCount()) {
                SparseMultilineTokensStorage._rateLimiter.runIfNotLimited(() => {
                    console.error('Invalid Semantic Tokens Data From Extension: lineNumber > model.getLineCount()')
                })
            } else if (this._getEndCharacter(i) > model.getLineLength(lineNumber)) {
                SparseMultilineTokensStorage._rateLimiter.runIfNotLimited(() => {
                    console.error('Invalid Semantic Tokens Data From Extension: end character > model.getLineLength(lineNumber)')
                })
            }
        }
    }
}

export class SparseLineTokens {

    private readonly _tokens: Uint32Array

    constructor(tokens: Uint32Array) {
        this._tokens = tokens
    }

    public getCount(): number {
        return this._tokens.length / 4
    }

    public getStartCharacter(tokenIndex: number): number {
        return this._tokens[4 * tokenIndex + 1]
    }

    public getEndCharacter(tokenIndex: number): number {
        return this._tokens[4 * tokenIndex + 2]
    }

    public getMetadata(tokenIndex: number): number {
        return this._tokens[4 * tokenIndex + 3]
    }
}




/**
 * Represents sparse tokens in a text model.
 */
export class SparseTokensStore {

    private _pieces: SparseMultilineTokens[]
    private _isComplete: boolean
    private readonly _languageIdCodec: ILanguageIdCodec

    constructor(languageIdCodec: ILanguageIdCodec) {
        this._pieces = []
        this._isComplete = false
        this._languageIdCodec = languageIdCodec
    }

    public flush(): void {
        this._pieces = []
        this._isComplete = false
    }

    public isEmpty(): boolean {
        return (this._pieces.length === 0)
    }

    public set(pieces: SparseMultilineTokens[] | null, isComplete: boolean, textModel: SparseTokensModel | undefined = undefined): void {
        this._pieces = pieces || []
        this._isComplete = isComplete

        if (textModel) {
            for (const p of this._pieces) {
                p.reportIfInvalid(textModel)
            }
        }
    }

    public setPartial(_range: Range, pieces: SparseMultilineTokens[]): Range {
        // console.log(`setPartial ${_range} ${pieces.map(p => p.toString()).join(', ')}`)

        let range = _range
        if (pieces.length > 0) {
            const _firstRange = pieces[0].getRange()
            const _lastRange = pieces[pieces.length - 1].getRange()
            if (!_firstRange || !_lastRange) {
                return _range
            }
            range = _range.plusRange(_firstRange).plusRange(_lastRange)
        }

        let insertPosition: { index: number } | null = null
        for (let i = 0, len = this._pieces.length; i < len; i++) {
            const piece = this._pieces[i]
            if (piece.endLineNumber < range.startLineNumber) {
                // this piece is before the range
                continue
            }

            if (piece.startLineNumber > range.endLineNumber) {
                // this piece is after the range, so mark the spot before this piece
                // as a good insertion position and stop looping
                insertPosition = insertPosition || { index: i }
                break
            }

            // this piece might intersect with the range
            piece.removeTokens(range)

            if (piece.isEmpty()) {
                // remove the piece if it became empty
                this._pieces.splice(i, 1)
                i--
                len--
                continue
            }

            if (piece.endLineNumber < range.startLineNumber) {
                // after removal, this piece is before the range
                continue
            }

            if (piece.startLineNumber > range.endLineNumber) {
                // after removal, this piece is after the range
                insertPosition = insertPosition || { index: i }
                continue
            }

            // after removal, this piece contains the range
            const [a, b] = piece.split(range)
            if (a.isEmpty()) {
                // this piece is actually after the range
                insertPosition = insertPosition || { index: i }
                continue
            }
            if (b.isEmpty()) {
                // this piece is actually before the range
                continue
            }
            this._pieces.splice(i, 1, a, b)
            i++
            len++

            insertPosition = insertPosition || { index: i }
        }

        insertPosition = insertPosition || { index: this._pieces.length }

        if (pieces.length > 0) {
            this._pieces = arrayInsert(this._pieces, insertPosition.index, pieces)
        }

        // console.log(`I HAVE ${this._pieces.length} pieces`)
        // console.log(`${this._pieces.map(p => p.toString()).join('\n')}`)

        return range
    }

    public isComplete(): boolean {
        return this._isComplete
    }

    public addSparseTokens(lineNumber: number, aTokens: LineTokens): LineTokens {
        if (aTokens.getTextLength() === 0) {
            // Don't do anything for empty lines
            return aTokens
        }

        const pieces = this._pieces

        if (pieces.length === 0) {
            return aTokens
        }

        const pieceIndex = SparseTokensStore._findFirstPieceWithLine(pieces, lineNumber)
        const bTokens = pieces[pieceIndex].getLineTokens(lineNumber)

        if (!bTokens) {
            return aTokens
        }

        const aLen = aTokens.getCount()
        const bLen = bTokens.getCount()

        let aIndex = 0
        const result: number[] = []
        let resultLen = 0
        let lastEndOffset = 0

        const emitToken = (endOffset: number, metadata: number) => {
            if (endOffset === lastEndOffset) {
                return
            }
            lastEndOffset = endOffset
            result[resultLen++] = endOffset
            result[resultLen++] = metadata
        }

        for (let bIndex = 0; bIndex < bLen; bIndex++) {
            // bTokens is not validated yet, but aTokens is. We want to make sure that the LineTokens we return
            // are valid, so we clamp the ranges to ensure that.
            const bStartCharacter = Math.min(bTokens.getStartCharacter(bIndex), aTokens.getTextLength())
            const bEndCharacter = Math.min(bTokens.getEndCharacter(bIndex), aTokens.getTextLength())
            const bMetadata = bTokens.getMetadata(bIndex)

            const bMask = (
                ((bMetadata & M.SEMANTIC_USE_ITALIC) ? M.ITALIC_MASK : 0)
                | ((bMetadata & M.SEMANTIC_USE_BOLD) ? M.BOLD_MASK : 0)
                | ((bMetadata & M.SEMANTIC_USE_UNDERLINE) ? M.UNDERLINE_MASK : 0)
                | ((bMetadata & M.SEMANTIC_USE_STRIKETHROUGH) ? M.STRIKETHROUGH_MASK : 0)
                | ((bMetadata & M.SEMANTIC_USE_FOREGROUND) ? M.FOREGROUND_MASK : 0)
                | ((bMetadata & M.SEMANTIC_USE_BACKGROUND) ? M.BACKGROUND_MASK : 0)
            ) >>> 0
            const aMask = (~bMask) >>> 0

            // push any token from `a` that is before `b`
            while (aIndex < aLen && aTokens.getEndOffset(aIndex) <= bStartCharacter) {
                emitToken(aTokens.getEndOffset(aIndex), aTokens.getMetadata(aIndex))
                aIndex++
            }

            // push the token from `a` if it intersects the token from `b`
            if (aIndex < aLen && aTokens.getStartOffset(aIndex) < bStartCharacter) {
                emitToken(bStartCharacter, aTokens.getMetadata(aIndex))
            }

            // skip any tokens from `a` that are contained inside `b`
            while (aIndex < aLen && aTokens.getEndOffset(aIndex) < bEndCharacter) {
                emitToken(aTokens.getEndOffset(aIndex), (aTokens.getMetadata(aIndex) & aMask) | (bMetadata & bMask))
                aIndex++
            }

            if (aIndex < aLen) {
                emitToken(bEndCharacter, (aTokens.getMetadata(aIndex) & aMask) | (bMetadata & bMask))
                if (aTokens.getEndOffset(aIndex) === bEndCharacter) {
                    // `a` ends exactly at the same spot as `b`!
                    aIndex++
                }
            } else {
                const aMergeIndex = Math.min(Math.max(0, aIndex - 1), aLen - 1)

                // push the token from `b`
                emitToken(bEndCharacter, (aTokens.getMetadata(aMergeIndex) & aMask) | (bMetadata & bMask))
            }
        }

        // push the remaining tokens from `a`
        while (aIndex < aLen) {
            emitToken(aTokens.getEndOffset(aIndex), aTokens.getMetadata(aIndex))
            aIndex++
        }

        return new LineTokens(new Uint32Array(result), aTokens.getLineContent(), this._languageIdCodec)
    }

    private static _findFirstPieceWithLine(pieces: SparseMultilineTokens[], lineNumber: number): number {
        let low = 0
        let high = pieces.length - 1

        while (low < high) {
            let mid = low + Math.floor((high - low) / 2)

            if (pieces[mid].endLineNumber < lineNumber) {
                low = mid + 1
            } else if (pieces[mid].startLineNumber > lineNumber) {
                high = mid - 1
            } else {
                while (mid > low && pieces[mid - 1].startLineNumber <= lineNumber && lineNumber <= pieces[mid - 1].endLineNumber) {
                    mid--
                }
                return mid
            }
        }

        return low
    }

    public acceptEdit(range: IRange, eolCount: number, firstLineLength: number, lastLineLength: number, firstCharCode: number): void {
        for (let i = 0; i < this._pieces.length; i++) {
            const piece = this._pieces[i]
            piece.acceptEdit(range, eolCount, firstLineLength, lastLineLength, firstCharCode)

            if (piece.isEmpty()) {
                // Remove empty pieces
                this._pieces.splice(i, 1)
                i--
            }
        }
    }
}


