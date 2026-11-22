// Monaco EditorWorker 里「把一批编辑缩成最小编辑」的三个算法(common/services/editorWebWorker.ts),不起 Worker,同线程直接算:
//   computeMoreMinimalEdits   formatting / rename 等 provider 回来的编辑 → 字符级 LcsDiff 之后只留真变了的那几段(相邻编辑先合并)
//   computeHumanReadableDiff  同上,但用行 diff + 字级 refine(inline chat 用),结果按"人读得懂"的粒度切
//   textualSuggest            wordBasedSuggestions 的取词:按 wordDefinition 扫若干 model,去掉前导词和纯数字词
// 只依赖一个最小的 model 形状(getValueInRange / getEOL / getOffsetAt / getPositionAt),不绑 ITextModel。
import { LcsDiff } from '../core/diff/legacy'
import { computeLineDiff, type LineDiffOptions } from '../core/diff/linediff'
import { Range, Position, type IRange } from '../core/model/position'

export interface MinimalEditModel {
    getValueInRange(range: IRange): string
    getEOL(): string
    getOffsetAt(position: { lineNumber: number, column: number }): number
    getPositionAt(offset: number): { lineNumber: number, column: number }
}
export interface MinimalTextEdit { range: IRange, text: string, eol?: number }

/** Monaco EditorWorker._diffLimit:超过就不 diff,整段替换 */
const DIFF_LIMIT = 100_000
/** Monaco EditorWorker._suggestionsLimit */
const SUGGESTIONS_LIMIT = 10_000

const sortEdits = (edits: readonly MinimalTextEdit[]) => edits.slice(0).sort((a, b) => {
    if (a.range && b.range) return Range.compareRangesUsingStarts(a.range, b.range)
    // 只改 eol 的排到最后
    return (a.range ? 0 : 1) - (b.range ? 0 : 1)
})
const eolEdit = (eol: number): MinimalTextEdit => ({ eol, text: '', range: { startLineNumber: 0, startColumn: 0, endLineNumber: 0, endColumn: 0 } })

/** Monaco stringDiff(original, modified, pretty):按 UTF-16 码元的 LcsDiff */
function stringDiff(original: string, modified: string, pretty: boolean) {
    const seq = (s: string) => ({ getElements: () => Int32Array.from({ length: s.length }, (_, i) => s.charCodeAt(i)) })
    return new LcsDiff(seq(original), seq(modified)).ComputeDiff(pretty).changes as { originalStart: number, originalLength: number, modifiedStart: number, modifiedLength: number }[]
}

export function computeMoreMinimalEdits(model: MinimalEditModel, rawEdits: readonly MinimalTextEdit[], pretty = false): MinimalTextEdit[] {
    const result: MinimalTextEdit[] = []
    let lastEol: number | undefined
    // 排序 + 合并相邻(前一条的终点 = 后一条的起点)。合并改的是拷贝,不动调用方的对象
    const sorted = sortEdits(rawEdits).map(e => ({ ...e, range: e.range ? { ...e.range } : e.range }))
    let w = 0
    for (let r = 1; r < sorted.length; r++) {
        if (Range.getEndPosition(sorted[w].range).equals(Range.getStartPosition(sorted[r].range))) {
            sorted[w].range = Range.fromPositions(Range.getStartPosition(sorted[w].range), Range.getEndPosition(sorted[r].range))
            sorted[w].text += sorted[r].text
        } else sorted[++w] = sorted[r]
    }
    sorted.length = sorted.length ? w + 1 : 0
    for (let { range, text, eol } of sorted) {
        if (typeof eol === 'number') lastEol = eol
        if (Range.isEmpty(range) && !text) continue
        const original = model.getValueInRange(range)
        text = text.replace(/\r\n|\n|\r/g, model.getEOL())
        if (original === text) continue
        if (Math.max(text.length, original.length) > DIFF_LIMIT) { result.push({ range, text }); continue }
        const editOffset = model.getOffsetAt(Range.lift(range).getStartPosition())
        for (const c of stringDiff(original, text, pretty)) {
            const start = model.getPositionAt(editOffset + c.originalStart)
            const end = model.getPositionAt(editOffset + c.originalStart + c.originalLength)
            const edit: MinimalTextEdit = {
                text: text.substr(c.modifiedStart, c.modifiedLength),
                range: { startLineNumber: start.lineNumber, startColumn: start.column, endLineNumber: end.lineNumber, endColumn: end.column },
            }
            if (model.getValueInRange(edit.range) !== edit.text) result.push(edit)
        }
    }
    if (typeof lastEol === 'number') result.push(eolEdit(lastEol))
    return result
}

export function computeHumanReadableDiff(model: MinimalEditModel, rawEdits: readonly MinimalTextEdit[], options: LineDiffOptions = {}): MinimalTextEdit[] {
    const result: MinimalTextEdit[] = []
    let lastEol: number | undefined
    for (let { range, text, eol } of sortEdits(rawEdits)) {
        if (typeof eol === 'number') lastEol = eol
        if (Range.isEmpty(range) && !text) continue
        const original = model.getValueInRange(range)
        const eolStr = model.getEOL()
        text = text.replace(/\r\n|\n|\r/g, eolStr)
        if (original === text) continue
        if (Math.max(text.length, original.length) > DIFF_LIMIT) { result.push({ range, text }); continue }
        const originalLines = original.split(/\r\n|\n|\r/)
        const modifiedLines = text.split(/\r\n|\n|\r/)
        const oText = originalLines.join('\n')
        const mText = modifiedLines.join('\n')
        const oAt = offsetToPosition(originalLines)
        const mAt = offsetToPosition(modifiedLines)
        const start = Range.lift(range).getStartPosition()
        // 行内相对位置 → 文档位置(第一行要加上编辑起点的列)
        const add = (p: Position) => new Position(start.lineNumber + p.lineNumber - 1, p.lineNumber === 1 ? start.column + p.column - 1 : p.column)
        for (const c of computeLineDiff(oText, mText, options).changes) {
            for (const x of c.innerChanges) {
                const a = add(oAt(x.originalFrom)), b = add(oAt(x.originalTo))
                const m1 = mAt(x.modifiedFrom), m2 = mAt(x.modifiedTo)
                result.push({ range: Range.fromPositions(a, b), text: textBetween(modifiedLines, m1, m2).join(eolStr) })
            }
        }
    }
    if (typeof lastEol === 'number') result.push(eolEdit(lastEol))
    return result
}

/** 行数组按 '\n' 拼起来之后的偏移 → 该数组内的 1-based 位置 */
function offsetToPosition(lines: readonly string[]) {
    const starts: number[] = []
    let p = 0
    for (const l of lines) { starts.push(p); p += l.length + 1 }
    return (offset: number): Position => {
        let lo = 0, hi = lines.length - 1
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1
            if (starts[mid] <= offset) lo = mid
            else hi = mid - 1
        }
        return new Position(lo + 1, offset - starts[lo] + 1)
    }
}
/** Monaco getText(lines, range):[start, end) 之间的文本,按行切开 */
function textBetween(lines: readonly string[], s: Position, e: Position): string[] {
    const out: string[] = []
    for (let i = s.lineNumber; i <= e.lineNumber; i++) {
        const line = lines[i - 1]
        if (i === s.lineNumber && i === e.lineNumber) out.push(line.substring(s.column - 1, e.column - 1))
        else if (i === s.lineNumber) out.push(line.substring(s.column - 1))
        else if (i === e.lineNumber) out.push(line.substring(0, e.column - 1))
        else out.push(line)
    }
    return out
}

/** Monaco ICommonModel.words:逐行按 wordDefinition 取词;遇到空匹配就停止这一行 */
export function* wordsOf(lines: readonly string[], wordDefinition: RegExp): Iterable<string> {
    for (const line of lines) {
        wordDefinition.lastIndex = 0
        for (let m = wordDefinition.exec(line); m; m = wordDefinition.exec(line)) {
            if (m[0].length === 0) break
            yield line.substring(m.index, m.index + m[0].length)
        }
    }
}

/** Monaco $textualSuggest:几个 model 里出现过的词(去重,不含 leadingWord 和纯数字词),最多 SUGGESTIONS_LIMIT 个 */
export function textualSuggest(models: readonly (readonly string[])[], leadingWord: string | undefined, wordDefinition: RegExp): { words: string[], duration: number } {
    const t0 = Date.now()
    const seen = new Set<string>()
    outer: for (const lines of models) {
        for (const w of wordsOf(lines, wordDefinition)) {
            if (w === leadingWord || !isNaN(Number(w))) continue
            seen.add(w)
            if (seen.size > SUGGESTIONS_LIMIT) break outer
        }
    }
    return { words: [...seen], duration: Date.now() - t0 }
}
