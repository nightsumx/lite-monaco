// Monaco DefaultLinesDiffComputer(advanced 算法)→ lite-monaco computeLineDiff。
import { computeLineDiff } from '../../src/core/diff/linediff'
import { toMonacoLinesDiff } from './diffAdapt'

export class DefaultLinesDiffComputer {
    computeDiff(originalLines: string[], modifiedLines: string[], options: { ignoreTrimWhitespace: boolean, maxComputationTimeMs: number, computeMoves: boolean }) {
        const o = originalLines.join('\n'), m = modifiedLines.join('\n')
        const r = computeLineDiff(o, m, { algorithm: 'advanced', ignoreTrimWhitespace: options.ignoreTrimWhitespace, maxComputationTimeMs: options.maxComputationTimeMs, computeMoves: options.computeMoves })
        return toMonacoLinesDiff(r, originalLines, modifiedLines)
    }
}
