// Monaco GlyphMarginLanesModel(移植):字形边距的「每行占哪几条车道」。
//   · push(lane, range, persist):range 覆盖的每一行占 lane;persist 的车道对所有行都算占着
//   · getLanesAtLine(line):该行占的车道(升序),一条都没有时是 [Center]
//   · requiredLanes:所有行里「同一行同时占用的车道数」的最大值,至少 1 —— 字形边距要留的宽度
// 车道取值同 Monaco GlyphMarginLane(1 左 / 2 中 / 3 右)。
// 注意:editorview 目前的字形边距车道记账是「出现过哪些车道」的并集(addGlyphItem 的 glyphLaneSeen),
// 和这里的「每行同时占用的最大数」口径不同;这个类还没接进 editorview(见 __parity__ 报告)。

export const enum GlyphLane { Left = 1, Center = 2, Right = 3 }
const MAX_LANE = GlyphLane.Right

/** 只要起止行号:Monaco Range / IRange 都满足 */
export interface LineSpan { readonly startLineNumber: number, readonly endLineNumber: number }

export class GlyphMarginLanesModel {
    private lanes: Uint8Array
    private persist = 0
    private required = 1 // 至少画一条车道

    constructor(maxLine: number) {
        this.lanes = new Uint8Array(Math.ceil(((maxLine + 1) * MAX_LANE) / 8))
    }

    reset(maxLine: number): void {
        const bytes = Math.ceil(((maxLine + 1) * MAX_LANE) / 8)
        if (this.lanes.length < bytes) this.lanes = new Uint8Array(bytes)
        else this.lanes.fill(0)
        this.required = 1
    }

    get requiredLanes(): number { return this.required }

    push(lane: GlyphLane, range: LineSpan, persist?: boolean): void {
        if (persist) this.persist |= 1 << (lane - 1)
        for (let line = range.startLineNumber; line <= range.endLineNumber; line++) {
            const bit = MAX_LANE * line + (lane - 1)
            this.lanes[bit >>> 3] |= 1 << (bit % 8)
            this.required = Math.max(this.required, this.laneBits(line).length)
        }
    }

    getLanesAtLine(line: number): GlyphLane[] {
        const lanes = this.laneBits(line)
        return lanes.length ? lanes : [GlyphLane.Center]
    }

    private laneBits(line: number): GlyphLane[] {
        const out: GlyphLane[] = []
        let bit = MAX_LANE * line
        for (let i = 0; i < MAX_LANE; i++, bit++) {
            if (this.persist & (1 << i) || this.lanes[bit >>> 3] & (1 << (bit % 8))) out.push((i + 1) as GlyphLane)
        }
        return out
    }
}
