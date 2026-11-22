// model.findMatches / findNextMatch / findPreviousMatch 与 getWordAtPosition 的算法
// (逐行移植自 Monaco vs/editor/common/model/textModelSearch.js 与 core/wordHelper.js)。
// 只依赖 SearchableModel 这一个最小接口,所以 ITextModel 视图和测试里的替身都能用。

import { wordClassifier, type WordClassifier } from '../core/edit/words'
import { Position, Range, type IPosition, type IRange } from './position'

export const LIMIT_FIND_COUNT = 999

/** 一处查找结果(Monaco FindMatch) */
export class FindMatch {
    _findMatchBrand: void = undefined
    readonly range: Range
    readonly matches: string[] | null
    constructor(range: Range, matches: string[] | null) {
        this.range = range
        this.matches = matches
    }
}

/** 搜索算法需要的模型能力 */
export interface SearchableModel {
    getLineContent(lineNumber: number): string
    getLineCount(): number
    getLineMaxColumn(lineNumber: number): number
    /** eol: 0 = 文本自带,1 = LF,2 = CRLF(Monaco EndOfLinePreference) */
    getValueInRange(range: IRange, eol?: number): string
    getEOL(): string
    getOffsetAt(position: IPosition): number
    getPositionAt(offset: number): Position
}

export class SearchData {
    constructor(
        readonly regex: RegExp,
        readonly wordSeparators: WordClassifier | null,
        readonly simpleSearch: string | null,
    ) {}
}

function escapeRegExpCharacters(value: string): string {
    return value.replace(/[\\{}*+?|^$.[\]()]/g, '\\$&')
}

interface RegExpOptions { matchCase?: boolean, wholeWord?: boolean, multiline?: boolean, global?: boolean, unicode?: boolean }

function createRegExp(searchString: string, isRegex: boolean, options: RegExpOptions = {}): RegExp {
    if (!searchString) throw new Error('Cannot create regex from empty string')
    if (!isRegex) searchString = escapeRegExpCharacters(searchString)
    if (options.wholeWord) {
        if (!/\B/.test(searchString.charAt(0))) searchString = '\\b' + searchString
        if (!/\B/.test(searchString.charAt(searchString.length - 1))) searchString = searchString + '\\b'
    }
    let modifiers = ''
    if (options.global) modifiers += 'g'
    if (!options.matchCase) modifiers += 'i'
    if (options.multiline) modifiers += 'm'
    if (options.unicode) modifiers += 'u'
    return new RegExp(searchString, modifiers)
}

function isHighSurrogate(c: number): boolean { return c >= 0xD800 && c <= 0xDBFF }
function isLowSurrogate(c: number): boolean { return c >= 0xDC00 && c <= 0xDFFF }
function getNextCodePoint(str: string, len: number, offset: number): number {
    const charCode = str.charCodeAt(offset)
    if (isHighSurrogate(charCode) && offset + 1 < len) {
        const next = str.charCodeAt(offset + 1)
        if (isLowSurrogate(next)) return ((charCode - 0xD800) << 10) + (next - 0xDC00) + 0x10000
    }
    return charCode
}

export class SearchParams {
    constructor(
        readonly searchString: string,
        readonly isRegex: boolean,
        readonly matchCase: boolean,
        readonly wordSeparators: string | null,
    ) {}

    parseSearchRequest(): SearchData | null {
        if (this.searchString === '') return null
        const multiline = this.isRegex ? isMultilineRegexSource(this.searchString) : this.searchString.indexOf('\n') >= 0
        let regex: RegExp | null = null
        try {
            regex = createRegExp(this.searchString, this.isRegex, {
                matchCase: this.matchCase, wholeWord: false, multiline, global: true, unicode: true,
            })
        } catch { return null }
        if (!regex) return null
        let canUseSimpleSearch = !this.isRegex && !multiline
        if (canUseSimpleSearch && this.searchString.toLowerCase() !== this.searchString.toUpperCase()) {
            // 大小写会影响结果
            canUseSimpleSearch = this.matchCase
        }
        return new SearchData(regex, this.wordSeparators ? wordClassifier(this.wordSeparators, []) : null, canUseSimpleSearch ? this.searchString : null)
    }
}

export function isMultilineRegexSource(searchString: string): boolean {
    if (!searchString || searchString.length === 0) return false
    for (let i = 0, len = searchString.length; i < len; i++) {
        const ch = searchString.charCodeAt(i)
        if (ch === 10) return true
        if (ch === 92) {
            i++
            if (i >= len) break
            const next = searchString.charCodeAt(i)
            if (next === 110 || next === 114 || next === 87) return true // \n \r \W
        }
    }
    return false
}

function createFindMatch(range: Range, rawMatches: RegExpExecArray, captureMatches: boolean): FindMatch {
    if (!captureMatches) return new FindMatch(range, null)
    const matches: string[] = []
    for (let i = 0, len = rawMatches.length; i < len; i++) matches[i] = rawMatches[i]
    return new FindMatch(range, matches)
}

class LineFeedCounter {
    private readonly offsets: number[]
    constructor(text: string) {
        const offsets: number[] = []
        for (let i = 0, n = text.length; i < n; i++) if (text.charCodeAt(i) === 10) offsets.push(i)
        this.offsets = offsets
    }

    findLineFeedCountBeforeOffset(offset: number): number {
        const offsets = this.offsets
        let min = 0
        let max = offsets.length - 1
        if (max === -1) return 0
        if (offset <= offsets[0]) return 0
        while (min < max) {
            const mid = min + ((max - min) / 2 >> 0)
            if (offsets[mid] >= offset) max = mid - 1
            else if (offsets[mid + 1] >= offset) { min = mid; max = mid }
            else min = mid + 1
        }
        return min + 1
    }
}

export class TextModelSearch {
    static findMatches(model: SearchableModel, searchParams: SearchParams, searchRange: Range, captureMatches: boolean, limitResultCount: number): FindMatch[] {
        const searchData = searchParams.parseSearchRequest()
        if (!searchData) return []
        if (searchData.regex.multiline) {
            return this.findMultiline(model, searchRange, new Searcher(searchData.wordSeparators, searchData.regex), captureMatches, limitResultCount)
        }
        return this.findLineByLine(model, searchRange, searchData, captureMatches, limitResultCount)
    }

    /** 多行搜索总是在以 \n 连接的文本上跑,CRLF 模型要把多出的 \r 补回去 */
    private static multilineRange(model: SearchableModel, deltaOffset: number, lf: LineFeedCounter | null, matchIndex: number, match0: string): Range {
        let startOffset: number
        let lfBefore = 0
        if (lf) {
            lfBefore = lf.findLineFeedCountBeforeOffset(matchIndex)
            startOffset = deltaOffset + matchIndex + lfBefore
        } else {
            startOffset = deltaOffset + matchIndex
        }
        let endOffset: number
        if (lf) {
            const lfBeforeEnd = lf.findLineFeedCountBeforeOffset(matchIndex + match0.length)
            endOffset = startOffset + match0.length + (lfBeforeEnd - lfBefore)
        } else {
            endOffset = startOffset + match0.length
        }
        const s = model.getPositionAt(startOffset)
        const e = model.getPositionAt(endOffset)
        return new Range(s.lineNumber, s.column, e.lineNumber, e.column)
    }

    private static findMultiline(model: SearchableModel, searchRange: Range, searcher: Searcher, captureMatches: boolean, limitResultCount: number): FindMatch[] {
        const deltaOffset = model.getOffsetAt(searchRange.getStartPosition())
        const text = model.getValueInRange(searchRange, 1)
        const lf = model.getEOL() === '\r\n' ? new LineFeedCounter(text) : null
        const result: FindMatch[] = []
        let counter = 0
        let m: RegExpExecArray | null
        searcher.reset(0)
        while ((m = searcher.next(text))) {
            result[counter++] = createFindMatch(this.multilineRange(model, deltaOffset, lf, m.index, m[0]), m, captureMatches)
            if (counter >= limitResultCount) return result
        }
        return result
    }

    /** 逐行查找(Monaco findMatchesLineByLine) */
    static findLineByLine(model: SearchableModel, searchRange: Range, searchData: SearchData, captureMatches: boolean, limitResultCount: number): FindMatch[] {
        const result: FindMatch[] = []
        let resultLen = 0
        if (searchRange.startLineNumber === searchRange.endLineNumber) {
            const text = model.getLineContent(searchRange.startLineNumber).substring(searchRange.startColumn - 1, searchRange.endColumn - 1)
            this.findInLine(searchData, text, searchRange.startLineNumber, searchRange.startColumn - 1, resultLen, result, captureMatches, limitResultCount)
            return result
        }
        const first = model.getLineContent(searchRange.startLineNumber).substring(searchRange.startColumn - 1)
        resultLen = this.findInLine(searchData, first, searchRange.startLineNumber, searchRange.startColumn - 1, resultLen, result, captureMatches, limitResultCount)
        for (let n = searchRange.startLineNumber + 1; n < searchRange.endLineNumber && resultLen < limitResultCount; n++) {
            resultLen = this.findInLine(searchData, model.getLineContent(n), n, 0, resultLen, result, captureMatches, limitResultCount)
        }
        if (resultLen < limitResultCount) {
            const last = model.getLineContent(searchRange.endLineNumber).substring(0, searchRange.endColumn - 1)
            this.findInLine(searchData, last, searchRange.endLineNumber, 0, resultLen, result, captureMatches, limitResultCount)
        }
        return result
    }

    private static findInLine(searchData: SearchData, text: string, lineNumber: number, deltaOffset: number, resultLen: number, result: FindMatch[], captureMatches: boolean, limitResultCount: number): number {
        const wordSeparators = searchData.wordSeparators
        if (!captureMatches && searchData.simpleSearch) {
            const searchString = searchData.simpleSearch
            const searchStringLen = searchString.length
            const textLength = text.length
            let lastMatchIndex = -searchStringLen
            while ((lastMatchIndex = text.indexOf(searchString, lastMatchIndex + searchStringLen)) !== -1) {
                if (!wordSeparators || isValidMatch(wordSeparators, text, textLength, lastMatchIndex, searchStringLen)) {
                    result[resultLen++] = new FindMatch(new Range(lineNumber, lastMatchIndex + 1 + deltaOffset, lineNumber, lastMatchIndex + 1 + searchStringLen + deltaOffset), null)
                    if (resultLen >= limitResultCount) return resultLen
                }
            }
            return resultLen
        }
        const searcher = new Searcher(searchData.wordSeparators, searchData.regex)
        let m: RegExpExecArray | null
        searcher.reset(0)
        do {
            m = searcher.next(text)
            if (m) {
                result[resultLen++] = createFindMatch(new Range(lineNumber, m.index + 1 + deltaOffset, lineNumber, m.index + 1 + m[0].length + deltaOffset), m, captureMatches)
                if (resultLen >= limitResultCount) return resultLen
            }
        } while (m)
        return resultLen
    }

    static findNextMatch(model: SearchableModel, searchParams: SearchParams, searchStart: Position, captureMatches: boolean): FindMatch | null {
        const searchData = searchParams.parseSearchRequest()
        if (!searchData) return null
        const searcher = new Searcher(searchData.wordSeparators, searchData.regex)
        if (searchData.regex.multiline) return this.nextMultiline(model, searchStart, searcher, captureMatches)
        return this.nextLineByLine(model, searchStart, searcher, captureMatches)
    }

    private static nextMultiline(model: SearchableModel, searchStart: Position, searcher: Searcher, captureMatches: boolean): FindMatch | null {
        const searchTextStart = new Position(searchStart.lineNumber, 1)
        const deltaOffset = model.getOffsetAt(searchTextStart)
        const lineCount = model.getLineCount()
        const text = model.getValueInRange(new Range(searchTextStart.lineNumber, searchTextStart.column, lineCount, model.getLineMaxColumn(lineCount)), 1)
        const lf = model.getEOL() === '\r\n' ? new LineFeedCounter(text) : null
        searcher.reset(searchStart.column - 1)
        const m = searcher.next(text)
        if (m) return createFindMatch(this.multilineRange(model, deltaOffset, lf, m.index, m[0]), m, captureMatches)
        if (searchStart.lineNumber !== 1 || searchStart.column !== 1) {
            // 从头再找一遍
            return this.nextMultiline(model, new Position(1, 1), searcher, captureMatches)
        }
        return null
    }

    private static nextLineByLine(model: SearchableModel, searchStart: Position, searcher: Searcher, captureMatches: boolean): FindMatch | null {
        const lineCount = model.getLineCount()
        const startLineNumber = searchStart.lineNumber
        const r = this.firstInLine(searcher, model.getLineContent(startLineNumber), startLineNumber, searchStart.column, captureMatches)
        if (r) return r
        for (let i = 1; i <= lineCount; i++) {
            const lineIndex = (startLineNumber + i - 1) % lineCount
            const r2 = this.firstInLine(searcher, model.getLineContent(lineIndex + 1), lineIndex + 1, 1, captureMatches)
            if (r2) return r2
        }
        return null
    }

    private static firstInLine(searcher: Searcher, text: string, lineNumber: number, fromColumn: number, captureMatches: boolean): FindMatch | null {
        searcher.reset(fromColumn - 1)
        const m = searcher.next(text)
        if (m) return createFindMatch(new Range(lineNumber, m.index + 1, lineNumber, m.index + 1 + m[0].length), m, captureMatches)
        return null
    }

    static findPreviousMatch(model: SearchableModel, searchParams: SearchParams, searchStart: Position, captureMatches: boolean): FindMatch | null {
        const searchData = searchParams.parseSearchRequest()
        if (!searchData) return null
        const searcher = new Searcher(searchData.wordSeparators, searchData.regex)
        if (searchData.regex.multiline) return this.prevMultiline(model, searchStart, searcher, captureMatches)
        return this.prevLineByLine(model, searchStart, searcher, captureMatches)
    }

    private static prevMultiline(model: SearchableModel, searchStart: Position, searcher: Searcher, captureMatches: boolean): FindMatch | null {
        const matches = this.findMultiline(model, new Range(1, 1, searchStart.lineNumber, searchStart.column), searcher, captureMatches, 10 * LIMIT_FIND_COUNT)
        if (matches.length > 0) return matches[matches.length - 1]
        const lineCount = model.getLineCount()
        if (searchStart.lineNumber !== lineCount || searchStart.column !== model.getLineMaxColumn(lineCount)) {
            return this.prevMultiline(model, new Position(lineCount, model.getLineMaxColumn(lineCount)), searcher, captureMatches)
        }
        return null
    }

    private static prevLineByLine(model: SearchableModel, searchStart: Position, searcher: Searcher, captureMatches: boolean): FindMatch | null {
        const lineCount = model.getLineCount()
        const startLineNumber = searchStart.lineNumber
        const text = model.getLineContent(startLineNumber).substring(0, searchStart.column - 1)
        const r = this.lastInLine(searcher, text, startLineNumber, captureMatches)
        if (r) return r
        for (let i = 1; i <= lineCount; i++) {
            const lineIndex = (lineCount + startLineNumber - i - 1) % lineCount
            const r2 = this.lastInLine(searcher, model.getLineContent(lineIndex + 1), lineIndex + 1, captureMatches)
            if (r2) return r2
        }
        return null
    }

    private static lastInLine(searcher: Searcher, text: string, lineNumber: number, captureMatches: boolean): FindMatch | null {
        let best: FindMatch | null = null
        let m: RegExpExecArray | null
        searcher.reset(0)
        while ((m = searcher.next(text))) {
            best = createFindMatch(new Range(lineNumber, m.index + 1, lineNumber, m.index + 1 + m[0].length), m, captureMatches)
        }
        return best
    }
}

function leftIsWordBoundary(ws: WordClassifier, text: string, matchStartIndex: number, matchLength: number): boolean {
    if (matchStartIndex === 0) return true
    const charBefore = text.charCodeAt(matchStartIndex - 1)
    if (ws.get(charBefore) !== 0) return true
    if (charBefore === 13 || charBefore === 10) return true
    if (matchLength > 0 && ws.get(text.charCodeAt(matchStartIndex)) !== 0) return true
    return false
}

function rightIsWordBoundary(ws: WordClassifier, text: string, textLength: number, matchStartIndex: number, matchLength: number): boolean {
    if (matchStartIndex + matchLength === textLength) return true
    const charAfter = text.charCodeAt(matchStartIndex + matchLength)
    if (ws.get(charAfter) !== 0) return true
    if (charAfter === 13 || charAfter === 10) return true
    if (matchLength > 0 && ws.get(text.charCodeAt(matchStartIndex + matchLength - 1)) !== 0) return true
    return false
}

export function isValidMatch(ws: WordClassifier, text: string, textLength: number, matchStartIndex: number, matchLength: number): boolean {
    return leftIsWordBoundary(ws, text, matchStartIndex, matchLength) && rightIsWordBoundary(ws, text, textLength, matchStartIndex, matchLength)
}

export class Searcher {
    private prevMatchStartIndex = -1
    private prevMatchLength = 0
    constructor(private readonly wordSeparators: WordClassifier | null, private readonly searchRegex: RegExp) {}

    reset(lastIndex: number): void {
        this.searchRegex.lastIndex = lastIndex
        this.prevMatchStartIndex = -1
        this.prevMatchLength = 0
    }

    next(text: string): RegExpExecArray | null {
        const textLength = text.length
        let m: RegExpExecArray | null
        do {
            if (this.prevMatchStartIndex + this.prevMatchLength === textLength) return null
            m = this.searchRegex.exec(text)
            if (!m) return null
            const matchStartIndex = m.index
            const matchLength = m[0].length
            if (matchStartIndex === this.prevMatchStartIndex && matchLength === this.prevMatchLength) {
                if (matchLength === 0) {
                    // 空匹配不会推进 lastIndex,跳过一个码点免得卡死
                    if (getNextCodePoint(text, textLength, this.searchRegex.lastIndex) > 0xFFFF) this.searchRegex.lastIndex += 2
                    else this.searchRegex.lastIndex += 1
                    continue
                }
                return null
            }
            this.prevMatchStartIndex = matchStartIndex
            this.prevMatchLength = matchLength
            if (!this.wordSeparators || isValidMatch(this.wordSeparators, text, textLength, matchStartIndex, matchLength)) return m
        } while (m)
        return null
    }
}

// ───────────── 词定义(Monaco core/wordHelper.js) ─────────────

export const USUAL_WORD_SEPARATORS = '`~!@#$%^&*()-=+[{]}\\|;:\'",.<>/?'

/** 默认词定义:数字(含小数)一组,其余非分隔符非空白一组 */
function createWordRegExp(allowInWords = ''): RegExp {
    let source = '(-?\\d*\\.\\d\\w*)|([^'
    for (const sep of USUAL_WORD_SEPARATORS) {
        if (allowInWords.indexOf(sep) >= 0) continue
        source += '\\' + sep
    }
    source += '\\s]+)'
    return new RegExp(source, 'g')
}

export const DEFAULT_WORD_REGEXP = createWordRegExp()

export function ensureValidWordDefinition(wordDefinition?: RegExp | null): RegExp {
    let result = DEFAULT_WORD_REGEXP
    if (wordDefinition && wordDefinition instanceof RegExp) {
        if (!wordDefinition.global) {
            let flags = 'g'
            if (wordDefinition.ignoreCase) flags += 'i'
            if (wordDefinition.multiline) flags += 'm'
            if (wordDefinition.unicode) flags += 'u'
            result = new RegExp(wordDefinition.source, flags)
        } else {
            result = wordDefinition
        }
    }
    result.lastIndex = 0
    return result
}

export interface IWordAtPosition {
    readonly word: string
    readonly startColumn: number
    readonly endColumn: number
}

const WORD_CONFIG = { maxLen: 1000, windowSize: 15, timeBudget: 150 }

function findRegexMatchEnclosingPosition(wordDefinition: RegExp, text: string, pos: number, stopPos: number): RegExpExecArray | null {
    let match: RegExpExecArray | null
    while ((match = wordDefinition.exec(text))) {
        const matchIndex = match.index || 0
        if (matchIndex <= pos && wordDefinition.lastIndex >= pos) return match
        else if (stopPos > 0 && matchIndex > stopPos) return null
    }
    return null
}

/** 取 column 处的词(列 1 基;textOffset 是 text 在整行里的起点偏移) */
export function getWordAtText(column: number, wordDefinition: RegExp, text: string, textOffset: number): IWordAtPosition | null {
    wordDefinition = ensureValidWordDefinition(wordDefinition)
    const config = WORD_CONFIG
    if (text.length > config.maxLen) {
        // 太长的行只取附近一段,免得把大串丢给正则
        let start = column - config.maxLen / 2
        if (start < 0) start = 0
        else textOffset += start
        text = text.substring(start, column + config.maxLen / 2)
        return getWordAtText(column, wordDefinition, text, textOffset)
    }
    const t1 = Date.now()
    const pos = column - 1 - textOffset
    let prevRegexIndex = -1
    let match: RegExpExecArray | null = null
    for (let i = 1; ; i++) {
        if (Date.now() - t1 >= config.timeBudget) break
        const regexIndex = pos - config.windowSize * i
        wordDefinition.lastIndex = Math.max(0, regexIndex)
        const thisMatch = findRegexMatchEnclosingPosition(wordDefinition, text, pos, prevRegexIndex)
        if (!thisMatch && match) break
        match = thisMatch
        if (regexIndex <= 0) break
        prevRegexIndex = regexIndex
    }
    if (match) {
        const result = {
            word: match[0],
            startColumn: textOffset + 1 + match.index,
            endColumn: textOffset + 1 + match.index + match[0].length,
        }
        wordDefinition.lastIndex = 0
        return result
    }
    return null
}
