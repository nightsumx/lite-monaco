// Monaco StringEdit / StringReplacement → lite-monaco core/model/change 的 ChangeSet(CM6 式变更集)。
// StringEdit 不带「基准文档长度」,ChangeSet 要带:这里用「刚好够容纳所有区间」的虚拟长度建 ChangeSet,
// compose / invert / apply / 新旧区间的换算都交给 ChangeSet;垫片只做 OffsetRange ↔ {from,to} 的翻译。
// OffsetRange 是纯值类型,直接用 Monaco 原版(测试用 deepStrictEqual 比原型,必须是同一个类)。
import { OffsetRange } from '../../../../../../reference/_vscode-src/src/vs/editor/common/core/ranges/offsetRange'
import { ChangeSet } from '../../../../src/core/model/change'
import { Rope } from '../../../../src/core/model/rope'

const ropeOf = (s: string) => Rope.of(s.split('\n'))

export class StringReplacement {
    constructor(readonly replaceRange: OffsetRange, readonly newText: string) { }
    getLengthDelta() { return this.newText.length - this.replaceRange.length }
}

const maxEnd = (rs: readonly StringReplacement[]) => rs.reduce((m, r) => Math.max(m, r.replaceRange.endExclusive), 0)
const lengthDelta = (rs: readonly StringReplacement[]) => rs.reduce((n, r) => n + r.getLengthDelta(), 0)
const toSet = (rs: readonly StringReplacement[], length: number) =>
    ChangeSet.of(rs.map(r => ({ from: r.replaceRange.start, to: r.replaceRange.endExclusive, insert: r.newText })), length)

export class StringEdit {
    static create(replacements: readonly StringReplacement[]) { return new StringEdit(replacements) }
    static replace(range: OffsetRange, text: string) { return new StringEdit([new StringReplacement(range, text)]) }

    constructor(readonly replacements: readonly StringReplacement[]) { }

    private set() { return toSet(this.replacements, maxEnd(this.replacements)) }

    apply(base: string): string {
        return toSet(this.replacements, base.length).apply(ropeOf(base)).toString()
    }
    inverse(base: string): StringEdit {
        const inv = toSet(this.replacements, base.length).invert(ropeOf(base))
        const out: StringReplacement[] = []
        inv.iterChanges((fromA, toA, _fromB, _toB, text) => { out.push(new StringReplacement(new OffsetRange(fromA, toA), text.toString())) }, true)
        return new StringEdit(out)
    }
    compose(other: StringEdit): StringEdit {
        const delta = lengthDelta(this.replacements)
        const mid = Math.max(maxEnd(other.replacements), maxEnd(this.replacements) + delta)
        const composed = toSet(this.replacements, mid - delta).compose(toSet(other.replacements, mid))
        const out: StringReplacement[] = []
        composed.iterChanges((fromA, toA, _fromB, _toB, text) => { out.push(new StringReplacement(new OffsetRange(fromA, toA), text.toString())) }, false)
        return new StringEdit(out)
    }
    equals(other: StringEdit): boolean {
        return this.replacements.length === other.replacements.length
            && this.replacements.every((r, i) => r.replaceRange.equals(other.replacements[i].replaceRange) && r.newText === other.replacements[i].newText)
    }
    getNewRanges(): OffsetRange[] {
        const out: OffsetRange[] = []
        this.set().iterChanges((_a, _b, fromB, toB) => { out.push(new OffsetRange(fromB, toB)) }, true)
        return out
    }
    getJoinedReplaceRange(): OffsetRange | undefined {
        let from = -1, to = -1
        this.set().iterChanges((fromA, toA) => { if (from < 0) from = fromA; to = toA }, true)
        return from < 0 ? undefined : new OffsetRange(from, to)
    }
    getLengthDelta(): number { return this.set().newLength - this.set().length }
}
