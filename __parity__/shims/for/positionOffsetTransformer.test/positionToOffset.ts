// Monaco common/core/text/positionToOffset → lite-monaco core/model/posoffset(PositionOffsetTransformer)。
// 垫片只做类型翻译:lite 的 {lineNumber,column} ↔ Monaco 的 Position 实例,{start,endExclusive} ↔ OffsetRange。换算本身在 src。
import { PositionOffsetTransformer as Impl } from '../../../../src/core/model/posoffset'
import { Position, Range } from '../../../../src/api/position'
import { OffsetRange } from '../../../../../../reference/_vscode-src/src/vs/editor/common/core/ranges/offsetRange'

export class PositionOffsetTransformer {
    private readonly impl: Impl
    constructor(readonly text: string) { this.impl = new Impl(text) }
    getOffset(p: Position): number { return this.impl.getOffset(p) }
    getPosition(offset: number): Position { const p = this.impl.getPosition(offset); return new Position(p.lineNumber, p.column) }
    getOffsetRange(r: Range): OffsetRange { const o = this.impl.getOffsetRange(r); return new OffsetRange(o.start, o.endExclusive) }
    getRange(o: OffsetRange): Range { const r = this.impl.getRange(o.start, o.endExclusive); return new Range(r.startLineNumber, r.startColumn, r.endLineNumber, r.endColumn) }
    getLineLength(n: number): number { return this.impl.getLineLength(n) }
}
