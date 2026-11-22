// Monaco common/diff/legacyLinesDiffComputer → lite-monaco 的 legacy diff(Monaco 0.52 机械搬运)。
// DiffComputer:原样导出。LegacyLinesDiffComputer:把 computeLineDiff({algorithm:'legacy'}) 的偏移式结果翻译成 Monaco 的 LinesDiff 形状。
export { DiffComputer } from '../../src/core/diff/legacy'
import { computeLineDiff } from '../../src/core/diff/linediff'
import { toMonacoLinesDiff } from './diffAdapt'

export class LegacyLinesDiffComputer {
    computeDiff(originalLines: string[], modifiedLines: string[], options: { ignoreTrimWhitespace: boolean, maxComputationTimeMs: number, computeMoves: boolean }) {
        const o = originalLines.join('\n'), m = modifiedLines.join('\n')
        const r = computeLineDiff(o, m, { algorithm: 'legacy', ignoreTrimWhitespace: options.ignoreTrimWhitespace, maxComputationTimeMs: options.maxComputationTimeMs, computeMoves: options.computeMoves })
        return toMonacoLinesDiff(r, originalLines, modifiedLines)
    }
}
