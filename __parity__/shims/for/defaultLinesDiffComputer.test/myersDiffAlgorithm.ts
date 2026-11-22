// Monaco MyersDiffAlgorithm → lite-monaco core/diff/linediff 的 myersDiff
import { myersDiff, Deadline } from '../../../../src/core/diff/linediff'
import type { LinesSliceCharSequence } from './linesSliceCharSequence'

export class MyersDiffAlgorithm {
    compute(a: LinesSliceCharSequence, b: LinesSliceCharSequence) {
        return myersDiff(a.slice, b.slice, new Deadline(0))
    }
}
