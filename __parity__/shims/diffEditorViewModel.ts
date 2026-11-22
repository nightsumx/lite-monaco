// Monaco diffEditorViewModel.UnchangedRegion → lite-monaco core/diff/unchanged 的 UnchangedRegion。
// 只翻译形状:Monaco 的 DetailedLineRangeMapping(LineRange{startLineNumber,endLineNumberExclusive})→ lite 的 LineRangeMapping;
// 结果区间补 Monaco LineRange 的 toString "[s,e)"。
import { UnchangedRegion as Lite } from '../../src/core/diff/unchanged'

type MLR = { startLineNumber: number, endLineNumberExclusive: number }
const range = (r: { start: number, end: number }) => ({ ...r, toString: () => `[${r.start},${r.end})` })

export class UnchangedRegion {
    static fromDiffs(changes: readonly { original: MLR, modified: MLR }[], originalLineCount: number, modifiedLineCount: number, minHiddenLineCount: number, minContext: number) {
        const mapped = changes.map(c => ({
            originalStart: c.original.startLineNumber, originalEnd: c.original.endLineNumberExclusive,
            modifiedStart: c.modified.startLineNumber, modifiedEnd: c.modified.endLineNumberExclusive,
            innerChanges: [],
        }))
        return Lite.fromDiffs(mapped, originalLineCount, modifiedLineCount, minHiddenLineCount, minContext).map(r => ({
            originalUnchangedRange: range(r.originalUnchangedRange),
            modifiedUnchangedRange: range(r.modifiedUnchangedRange),
        }))
    }
}
