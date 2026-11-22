// Monaco rangeMapping(getLineRangeMapping / RangeMapping)→ lite-monaco core/diff/linediff 的 lineRangeOfRangeMapping
import { lineRangeOfRangeMapping } from '../../../../src/core/diff/linediff'

interface R { startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number }
interface TextLike { getValue(): string }

export class RangeMapping {
    constructor(readonly originalRange: R, readonly modifiedRange: R) { }
}

const rng = (r: R) => ({ sl: r.startLineNumber, sc: r.startColumn, el: r.endLineNumber, ec: r.endColumn })

export function getLineRangeMapping(rm: RangeMapping, original: TextLike, modified: TextLike) {
    const c = lineRangeOfRangeMapping(rng(rm.originalRange), rng(rm.modifiedRange), original.getValue().split('\n'), modified.getValue().split('\n'))
    return { toString: () => `{[${c.o1},${c.o2})->[${c.m1},${c.m2})}` }
}
