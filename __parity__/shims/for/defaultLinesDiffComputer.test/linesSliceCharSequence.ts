// Monaco LinesSliceCharSequence → lite-monaco core/diff/linediff 的 charSlice(同一份字符序列,diff 内部也用它)。
// 只对 defaultLinesDiffComputer.test 生效(见 vitest.parity.config.ts 的 shims/for/<测试名>/)。
import { charSlice, type Slice } from '../../../../src/core/diff/linediff'

interface IRange { startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number }
interface OffsetRangeLike { start: number, endExclusive: number }

export class LinesSliceCharSequence {
    readonly slice: Slice
    constructor(lines: string[], range: IRange, considerWhitespaceChanges: boolean) {
        this.slice = charSlice(lines, { sl: range.startLineNumber, sc: range.startColumn, el: range.endLineNumber, ec: range.endColumn }, considerWhitespaceChanges)
    }
    get length() { return this.slice.length }
    getElement(i: number) { return this.slice.get(i) }
    getText(r: OffsetRangeLike) { return this.slice.text(r.start, r.endExclusive) }
    translateOffset(offset: number, preference: 'left' | 'right' = 'right') {
        const [line, column] = this.slice.translate(offset, preference === 'left')
        return { lineNumber: line, column, toString: () => `(${line},${column})` }
    }
    extendToFullLines(r: OffsetRangeLike): OffsetRangeLike {
        const [start, endExclusive] = this.slice.fullLines(r.start, r.endExclusive)
        return { start, endExclusive }
    }
}
