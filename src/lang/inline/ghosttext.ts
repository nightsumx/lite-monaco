// Ghost text:一次行内补全在编辑器里「该显示什么」。移植自 vs/editor/contrib/inlineCompletions/browser/model/{ghostText,computeGhostText,singleTextEditHelpers}.ts。
// 纯函数 + 值类型,不碰 DOM;渲染见 view.ts。
import { LcsDiff } from '../../core/diff/legacy'
import { Position, Range } from '../../api/position'
import { TextEdit, TextLength, TextReplacement, commonPrefixLength, getLeadingWhitespace, splitLines } from './textedit'

/** computeGhostText 只读 model 的这几样 */
export interface GhostTextModel {
    getLineContent(lineNumber: number): string
    getValueInRange(range: Range, eol?: number): string
}

export class GhostTextPart {
    readonly lines: { line: string }[]
    constructor(readonly column: number, readonly text: string,
        /** 这一段是「补全菜单项预览」(斜体),不是已定的补全 */
        readonly preview: boolean) {
        this.lines = splitLines(text).map(line => ({ line }))
    }
    equals(other: GhostTextPart): boolean {
        return this.column === other.column && this.lines.length === other.lines.length && this.lines.every((l, i) => l.line === other.lines[i].line)
    }
}

export class GhostText {
    constructor(readonly lineNumber: number, readonly parts: GhostTextPart[]) { }
    equals(other: GhostText): boolean {
        return this.lineNumber === other.lineNumber && this.parts.length === other.parts.length && this.parts.every((p, i) => p.equals(other.parts[i]))
    }
    /** 仅测试/调试:把 ghost 插进文档文本,debug 时用 [] 括起来 */
    render(documentText: string, debug = false): string {
        return new TextEdit(this.parts.map(p => new TextReplacement(
            Range.fromPositions(new Position(this.lineNumber, p.column)),
            debug ? `[${p.lines.map(l => l.line).join('\n')}]` : p.lines.map(l => l.line).join('\n'),
        ))).applyToString(documentText)
    }
    renderForScreenReader(lineText: string): string {
        if (this.parts.length === 0) return ''
        const last = this.parts[this.parts.length - 1]
        const capped = lineText.substr(0, last.column - 1)
        const text = new TextEdit(this.parts.map(p => new TextReplacement(Range.fromPositions(new Position(1, p.column)), p.lines.map(l => l.line).join('\n')))).applyToString(capped)
        return text.substring(this.parts[0].column - 1)
    }
    isEmpty(): boolean { return this.parts.every(p => p.lines.length === 0) }
    get lineCount(): number { return 1 + this.parts.reduce((r, p) => r + p.lines.length - 1, 0) }
}

export type GhostTextOrReplacement = GhostText

export function ghostTextOrReplacementEquals(a: GhostTextOrReplacement | undefined, b: GhostTextOrReplacement | undefined): boolean {
    if (a === b) return true
    if (!a || !b) return false
    return a.equals(b)
}
export function ghostTextsOrReplacementsEqual(a: readonly GhostTextOrReplacement[] | undefined, b: readonly GhostTextOrReplacement[] | undefined): boolean {
    if (a === b) return true
    if (!a || !b) return false
    return a.length === b.length && a.every((x, i) => ghostTextOrReplacementEquals(x, b[i]))
}

// ───────────── singleTextEditHelpers ─────────────

export function singleTextRemoveCommonPrefix(edit: TextReplacement, model: GhostTextModel, validModelRange?: Range): TextReplacement {
    const modelRange = validModelRange ? edit.range.intersectRanges(validModelRange) : edit.range
    if (!modelRange) return edit
    const normalizedText = edit.text.replaceAll('\r\n', '\n')
    const valueToReplace = model.getValueInRange(modelRange, 1 /* LF */)
    const len = commonPrefixLength(valueToReplace, normalizedText)
    const start = TextLength.ofText(valueToReplace.substring(0, len)).addToPosition(edit.range.getStartPosition())
    return new TextReplacement(Range.fromPositions(start, edit.range.getEndPosition()), normalizedText.substring(len))
}

export function singleTextEditAugments(edit: TextReplacement, base: TextReplacement): boolean {
    // 增强后的补全必须覆盖 base 的范围,但可以覆盖更多
    return edit.text.startsWith(base.text)
        && base.range.getStartPosition().equals(edit.range.getStartPosition())
        && base.range.getEndPosition().isBeforeOrEqual(edit.range.getEndPosition())
}

// ───────────── computeGhostText ─────────────

/** @param previewSuffixLength 把 `edit.text` 劈成两段:`hello` + 后缀长 2 → 非预览 `hel`、预览 `lo` */
export function computeGhostText(
    edit: TextReplacement,
    model: GhostTextModel,
    mode: 'prefix' | 'subword' | 'subwordSmart',
    cursorPosition?: Position,
    previewSuffixLength = 0,
): GhostText | undefined {
    let e = singleTextRemoveCommonPrefix(edit, model)
    // 跨行的编辑,前面的整行必须是公共前缀
    if (e.range.endLineNumber !== e.range.startLineNumber) return undefined

    const sourceLine = model.getLineContent(e.range.startLineNumber)
    const sourceIndentationLength = getLeadingWhitespace(sourceLine).length
    const suggestionTouchesIndentation = e.range.startColumn - 1 <= sourceIndentationLength
    if (suggestionTouchesIndentation) {
        const suggestionAddedIndentationLength = getLeadingWhitespace(e.text).length
        const replacedIndentation = sourceLine.substring(e.range.startColumn - 1, sourceIndentationLength)
        const [startPosition, endPosition] = [e.range.getStartPosition(), e.range.getEndPosition()]
        const newStartPosition = startPosition.column + replacedIndentation.length <= endPosition.column
            ? startPosition.delta(0, replacedIndentation.length)
            : endPosition
        const rangeThatDoesNotReplaceIndentation = Range.fromPositions(newStartPosition, endPosition)
        const suggestionWithoutIndentationChange = e.text.startsWith(replacedIndentation)
            // 只加缩进、不改已有缩进:可以出 ghost
            ? e.text.substring(replacedIndentation.length)
            // 改了/删了已有缩进:只对非缩进部分出 ghost
            : e.text.substring(suggestionAddedIndentationLength)
        e = new TextReplacement(rangeThatDoesNotReplaceIndentation, suggestionWithoutIndentationChange)
    }

    const valueToBeReplaced = model.getValueInRange(e.range)
    const changes = cachingDiff(valueToBeReplaced, e.text)
    if (!changes) return undefined // diff 太慢就不出 ghost

    const lineNumber = e.range.startLineNumber
    const parts: GhostTextPart[] = []

    if (mode === 'prefix') {
        const filtered = changes.filter(c => c.originalLength === 0)
        if (filtered.length > 1 || (filtered.length === 1 && filtered[0].originalStart !== valueToBeReplaced.length)) return undefined // prefix 只允许单个尾部插入
    }

    const previewStartInCompletionText = e.text.length - previewSuffixLength
    for (const c of changes) {
        const insertColumn = e.range.startColumn + c.originalStart + c.originalLength
        if (mode === 'subwordSmart' && cursorPosition && cursorPosition.lineNumber === e.range.startLineNumber && insertColumn < cursorPosition.column) return undefined // 光标前不出 ghost
        if (c.originalLength > 0) return undefined
        if (c.modifiedLength === 0) continue
        const modifiedEnd = c.modifiedStart + c.modifiedLength
        const nonPreviewTextEnd = Math.max(c.modifiedStart, Math.min(modifiedEnd, previewStartInCompletionText))
        const nonPreviewText = e.text.substring(c.modifiedStart, nonPreviewTextEnd)
        const italicText = e.text.substring(nonPreviewTextEnd, Math.max(c.modifiedStart, modifiedEnd))
        if (nonPreviewText.length > 0) parts.push(new GhostTextPart(insertColumn, nonPreviewText, false))
        if (italicText.length > 0) parts.push(new GhostTextPart(insertColumn, italicText, true))
    }
    return new GhostText(lineNumber, parts)
}

interface DiffChangeLike { originalStart: number, originalLength: number, modifiedStart: number, modifiedLength: number }

let lastRequest: { originalValue: string, newValue: string, changes: readonly DiffChangeLike[] | undefined } | undefined
function cachingDiff(originalValue: string, newValue: string): readonly DiffChangeLike[] | undefined {
    if (lastRequest?.originalValue === originalValue && lastRequest?.newValue === newValue) return lastRequest.changes
    let changes = smartDiff(originalValue, newValue, true)
    if (changes) {
        const deleted = deletedCharacters(changes)
        if (deleted > 0) {
            // 没得改进就不多算一遍
            const newChanges = smartDiff(originalValue, newValue, false)
            if (newChanges && deletedCharacters(newChanges) < deleted) changes = newChanges
        }
    }
    lastRequest = { originalValue, newValue, changes }
    return changes
}
const deletedCharacters = (changes: readonly DiffChangeLike[]): number => changes.reduce((s, c) => s + c.originalLength, 0)

/**
 * `if ()` 对 `if (f() = 1) { g(); }` 要对成 `if (       )`,不是 `if (  )`,也不是 `if (             )`:括号先按层级/分组预处理成唯一字符。
 */
export function smartDiff(originalValue: string, newValue: string, smartBracketMatching: boolean): readonly DiffChangeLike[] | undefined {
    if (originalValue.length > 5000 || newValue.length > 5000) return undefined
    const maxCode = (v: string) => { let m = 0; for (let i = 0; i < v.length; i++) { const c = v.charCodeAt(i); if (c > m) m = c } return m }
    const maxCharCode = Math.max(maxCode(originalValue), maxCode(newValue))
    const uniqueCode = (id: number) => maxCharCode + id + 1
    function getElements(source: string): Int32Array {
        let level = 0
        let group = 0
        const out = new Int32Array(source.length)
        for (let i = 0; i < source.length; i++) {
            if (smartBracketMatching && source[i] === '(') {
                out[i] = uniqueCode(2 * (group * 100 + level))
                level++
            } else if (smartBracketMatching && source[i] === ')') {
                level = Math.max(level - 1, 0)
                out[i] = uniqueCode(2 * (group * 100 + level) + 1)
                if (level === 0) group++
            } else out[i] = source.charCodeAt(i)
        }
        return out
    }
    const e1 = getElements(originalValue)
    const e2 = getElements(newValue)
    return new LcsDiff({ getElements: () => e1 }, { getElements: () => e2 }).ComputeDiff(false).changes
}
