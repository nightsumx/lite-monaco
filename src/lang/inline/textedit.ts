// 行内补全用的文本编辑值类型(移植自 vs/editor/common/core/edits/textEdit.ts 的子集 + text/textLength + 偏移互转)。
// 纯值类型,不依赖编辑器。「文本」一律是 string:位置 <-> 偏移靠 PositionOffsetTransformer。
import { Position, Range } from '../../api/position'
import type { IRange } from '../../api/position'

// ───────────── 字符串工具 ─────────────

export function commonPrefixLength(a: string, b: string): number {
    const n = Math.min(a.length, b.length)
    let i = 0
    while (i < n && a.charCodeAt(i) === b.charCodeAt(i)) i++
    return i
}
export function commonSuffixLength(a: string, b: string): number {
    const n = Math.min(a.length, b.length)
    let i = 0
    while (i < n && a.charCodeAt(a.length - 1 - i) === b.charCodeAt(b.length - 1 - i)) i++
    return i
}
export function getLeadingWhitespace(s: string): string {
    let i = 0
    while (i < s.length && (s.charCodeAt(i) === 32 || s.charCodeAt(i) === 9)) i++
    return s.substring(0, i)
}
export const splitLines = (s: string): string[] => s.split(/\r\n|\r|\n/)

// ───────────── TextLength(行数 + 末行列数)─────────────

export class TextLength {
    static readonly zero = new TextLength(0, 0)
    constructor(readonly lineCount: number, readonly columnCount: number) { }
    static ofText(text: string): TextLength {
        let line = 0
        let column = 0
        for (const c of text) {
            if (c === '\n') { line++; column = 0 } else column += c.length
        }
        return new TextLength(line, column)
    }
    static ofRange(range: IRange): TextLength {
        if (range.startLineNumber === range.endLineNumber) return new TextLength(0, range.endColumn - range.startColumn)
        return new TextLength(range.endLineNumber - range.startLineNumber, range.endColumn - 1)
    }
    static fromPosition(p: { lineNumber: number, column: number }): TextLength { return new TextLength(p.lineNumber - 1, p.column - 1) }
    addToPosition(position: Position): Position {
        if (this.lineCount === 0) return new Position(position.lineNumber, position.column + this.columnCount)
        return new Position(position.lineNumber + this.lineCount, this.columnCount + 1)
    }
    createRange(startPosition: Position): Range { return Range.fromPositions(startPosition, this.addToPosition(startPosition)) }
    isGreaterThanOrEqualTo(other: TextLength): boolean {
        if (this.lineCount !== other.lineCount) return this.lineCount > other.lineCount
        return this.columnCount >= other.columnCount
    }
}

// ───────────── 位置 <-> 偏移 ─────────────

export class PositionOffsetTransformer {
    private readonly lineStarts: number[] = [0]
    constructor(readonly text: string) {
        for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) this.lineStarts.push(i + 1)
    }
    get lineCount() { return this.lineStarts.length }
    private lineEnd(line: number): number { return line < this.lineStarts.length ? this.lineStarts[line] - 1 : this.text.length }
    getOffset(p: { lineNumber: number, column: number }): number {
        const line = Math.min(Math.max(p.lineNumber, 1), this.lineStarts.length)
        const start = this.lineStarts[line - 1]
        // 列号超出行尾(例如 Number.MAX_SAFE_INTEGER / 1000)夹到行尾
        return Math.min(start + p.column - 1, this.lineEnd(line))
    }
    getPosition(offset: number): Position {
        let lo = 0
        let hi = this.lineStarts.length - 1
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1
            if (this.lineStarts[mid] <= offset) lo = mid; else hi = mid - 1
        }
        return new Position(lo + 1, offset - this.lineStarts[lo] + 1)
    }
    getRange(startOffset: number, endOffset: number): Range { return Range.fromPositions(this.getPosition(startOffset), this.getPosition(endOffset)) }
    getValueOfRange(r: IRange): string {
        return this.text.substring(this.getOffset({ lineNumber: r.startLineNumber, column: r.startColumn }), this.getOffset({ lineNumber: r.endLineNumber, column: r.endColumn }))
    }
    get endPosition(): Position { return this.getPosition(this.text.length) }
}

// ───────────── TextReplacement / TextEdit ─────────────

export class TextReplacement {
    constructor(readonly range: Range, readonly text: string) { }
    static delete(range: Range): TextReplacement { return new TextReplacement(range, '') }
    get isEmpty(): boolean { return this.range.isEmpty() && this.text.length === 0 }
    static equals(a: TextReplacement, b: TextReplacement): boolean { return a.range.equalsRange(b.range) && a.text === b.text }
    equals(other: TextReplacement): boolean { return TextReplacement.equals(this, other) }
    toSingleEditOperation(): { range: Range, text: string } { return { range: this.range, text: this.text } }
    toEdit(): TextEdit { return new TextEdit([this]) }

    removeCommonPrefixAndSuffix(text: string): TextReplacement { return this.removeCommonPrefix(text).removeCommonSuffix(text) }
    removeCommonPrefix(text: string): TextReplacement {
        const original = new PositionOffsetTransformer(text).getValueOfRange(this.range).replaceAll('\r\n', '\n')
        const modified = this.text.replaceAll('\r\n', '\n')
        const len = commonPrefixLength(original, modified)
        const start = TextLength.ofText(original.substring(0, len)).addToPosition(this.range.getStartPosition())
        return new TextReplacement(Range.fromPositions(start, this.range.getEndPosition()), modified.substring(len))
    }
    removeCommonSuffix(text: string): TextReplacement {
        const original = new PositionOffsetTransformer(text).getValueOfRange(this.range).replaceAll('\r\n', '\n')
        const modified = this.text.replaceAll('\r\n', '\n')
        const len = commonSuffixLength(original, modified)
        const end = TextLength.ofText(original.substring(0, original.length - len)).addToPosition(this.range.getStartPosition())
        return new TextReplacement(Range.fromPositions(this.range.getStartPosition(), end), modified.substring(0, modified.length - len))
    }
    toString(): string {
        const s = this.range.getStartPosition()
        const e = this.range.getEndPosition()
        return `(${s.lineNumber},${s.column} -> ${e.lineNumber},${e.column}): "${this.text}"`
    }
}

export class TextEdit {
    static replace(range: Range, text: string): TextEdit { return new TextEdit([new TextReplacement(range, text)]) }
    static delete(range: Range): TextEdit { return new TextEdit([new TextReplacement(range, '')]) }
    static insert(position: Position, text: string): TextEdit { return new TextEdit([new TextReplacement(Range.fromPositions(position, position), text)]) }
    static fromParallelReplacementsUnsorted(replacements: readonly TextReplacement[]): TextEdit {
        return new TextEdit(replacements.slice().sort((a, b) => Range.compareRangesUsingStarts(a.range, b.range)))
    }
    constructor(readonly replacements: readonly TextReplacement[]) { }

    /** 合并相接的替换、去掉空替换 */
    normalize(): TextEdit {
        const out: TextReplacement[] = []
        for (const r of this.replacements) {
            const last = out[out.length - 1]
            if (last && last.range.getEndPosition().equals(r.range.getStartPosition())) out[out.length - 1] = new TextReplacement(last.range.plusRange(r.range), last.text + r.text)
            else if (!r.isEmpty) out.push(r)
        }
        return new TextEdit(out)
    }

    apply(text: string): string {
        const t = new PositionOffsetTransformer(text)
        let result = ''
        let last = 0
        for (const r of this.replacements) {
            const start = t.getOffset(r.range.getStartPosition())
            const end = t.getOffset(r.range.getEndPosition())
            if (start > last) result += text.substring(last, start)
            result += r.text
            last = end
        }
        return result + text.substring(last)
    }
    applyToString(text: string): string { return this.apply(text) }

    /** 应用之后每条替换在新文本里占的范围 */
    getNewRanges(): Range[] {
        const out: Range[] = []
        let previousEditEndLineNumber = 0
        let lineOffset = 0
        let columnOffset = 0
        for (const r of this.replacements) {
            const len = TextLength.ofText(r.text)
            const start = new Position(
                r.range.startLineNumber + lineOffset,
                r.range.startColumn + (r.range.startLineNumber === previousEditEndLineNumber ? columnOffset : 0),
            )
            const range = len.createRange(start)
            out.push(range)
            lineOffset = range.endLineNumber - r.range.endLineNumber
            columnOffset = range.endColumn - r.range.endColumn
            previousEditEndLineNumber = r.range.endLineNumber
        }
        return out
    }

    /** 多条替换折成一条(中间的空隙用原文补) */
    toReplacement(text: string): TextReplacement {
        if (this.replacements.length === 0) throw new Error('empty edit')
        if (this.replacements.length === 1) return this.replacements[0]
        const t = new PositionOffsetTransformer(text)
        const startPos = this.replacements[0].range.getStartPosition()
        const endPos = this.replacements[this.replacements.length - 1].range.getEndPosition()
        let newText = ''
        for (let i = 0; i < this.replacements.length; i++) {
            const cur = this.replacements[i]
            newText += cur.text
            if (i < this.replacements.length - 1) newText += t.getValueOfRange(Range.fromPositions(cur.range.getEndPosition(), this.replacements[i + 1].range.getStartPosition()))
        }
        return new TextReplacement(Range.fromPositions(startPos, endPos), newText)
    }

    equals(other: TextEdit): boolean {
        return this.replacements.length === other.replacements.length && this.replacements.every((r, i) => r.equals(other.replacements[i]))
    }

    /** 调试/测试用的可读形式:`前文❰被替换↦新文❱后文`,各段超过 10 字符取省略 */
    toString(text?: string): string {
        if (text === undefined) return this.replacements.map(r => r.toString()).join('\n')
        if (this.replacements.length === 0) return ''
        const t = new PositionOffsetTransformer(text)
        return this.replacements.map(r => {
            const maxLength = 10
            const originalText = t.getValueOfRange(r.range)
            let beforeText = t.getValueOfRange(Range.fromPositions(new Position(Math.max(1, r.range.startLineNumber - 1), 1), r.range.getStartPosition()))
            if (beforeText.length > maxLength) beforeText = '...' + beforeText.substring(beforeText.length - maxLength)
            let afterText = t.getValueOfRange(Range.fromPositions(r.range.getEndPosition(), new Position(r.range.endLineNumber + 1, 1)))
            if (afterText.length > maxLength) afterText = afterText.substring(0, maxLength) + '...'
            const half = Math.floor(maxLength / 2)
            const shorten = (s: string) => s.length > maxLength ? s.substring(0, half) + '...' + s.substring(s.length - half) : s
            const replacedText = shorten(originalText)
            const newText = shorten(r.text)
            if (replacedText.length === 0) return `${beforeText}❰${newText}❱${afterText}`
            return `${beforeText}❰${replacedText}↦${newText}❱${afterText}`
        }).join('\n')
    }
}
