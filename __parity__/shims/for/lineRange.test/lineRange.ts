// Monaco common/core/ranges/lineRange → lite-monaco core/diff:LRange {start,end} 的 contains + LineRangeSet(moves.ts)
import { lineRangeContains } from '../../../../src/core/diff/unchanged'
export { LineRangeSet } from '../../../../src/core/diff/moves'

/** lite 的行区间只是 {start, end}(半开);这里给它一个能 new 的壳,方法一律转给 lite 的函数 */
export class LineRange {
    constructor(readonly start: number, readonly end: number) { }
    contains(n: number) { return lineRangeContains(this, n) }
}
