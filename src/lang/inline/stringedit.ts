// 偏移坐标的编辑(移植自 vs/editor/common/core/edits/stringEdit.ts + ranges/offsetRange.ts 的子集)。
// 行内补全要把「用户刚做的编辑」作用到「还没接受的建议」上:建议的范围以偏移记,逐条平移/裁剪/丢弃。
import { commonPrefixLength, commonSuffixLength } from './textedit'

export class OffsetRange {
    constructor(readonly start: number, readonly endExclusive: number) {
        if (start > endExclusive) throw new Error(`Invalid range: ${start}-${endExclusive}`)
    }
    static emptyAt(offset: number): OffsetRange { return new OffsetRange(offset, offset) }
    get length(): number { return this.endExclusive - this.start }
    get isEmpty(): boolean { return this.start === this.endExclusive }
    delta(offset: number): OffsetRange { return new OffsetRange(this.start + offset, this.endExclusive + offset) }
    deltaStart(offset: number): OffsetRange { return new OffsetRange(this.start + offset, this.endExclusive) }
    deltaEnd(offset: number): OffsetRange { return new OffsetRange(this.start, this.endExclusive + offset) }
    join(other: OffsetRange): OffsetRange { return new OffsetRange(Math.min(this.start, other.start), Math.max(this.endExclusive, other.endExclusive)) }
    /** 相交结果;只相切得空区间,完全不挨着得 undefined */
    intersect(other: OffsetRange): OffsetRange | undefined {
        const start = Math.max(this.start, other.start)
        const end = Math.min(this.endExclusive, other.endExclusive)
        return start <= end ? new OffsetRange(start, end) : undefined
    }
    intersectsOrTouches(other: OffsetRange): boolean { return Math.max(this.start, other.start) <= Math.min(this.endExclusive, other.endExclusive) }
    substring(s: string): string { return s.substring(this.start, this.endExclusive) }
    equals(other: OffsetRange): boolean { return this.start === other.start && this.endExclusive === other.endExclusive }
    toString(): string { return `[${this.start}, ${this.endExclusive})` }
}

export class StringReplacement {
    static replace(range: OffsetRange, text: string): StringReplacement { return new StringReplacement(range, text) }
    constructor(readonly replaceRange: OffsetRange, readonly newText: string) { }
    get isEmpty(): boolean { return this.newText.length === 0 && this.replaceRange.isEmpty }
    equals(other: StringReplacement): boolean { return this.replaceRange.equals(other.replaceRange) && this.newText === other.newText }
    replace(str: string): string { return str.substring(0, this.replaceRange.start) + this.newText + str.substring(this.replaceRange.endExclusive) }
    /** 替换之后这段新文本占的偏移区间(只看这一条,不含它前面的改动) */
    getRangeAfterReplace(): OffsetRange { return new OffsetRange(this.replaceRange.start, this.replaceRange.start + this.newText.length) }
    removeCommonPrefix(source: string): StringReplacement {
        const len = commonPrefixLength(this.replaceRange.substring(source), this.newText)
        return len === 0 ? this : new StringReplacement(this.replaceRange.deltaStart(len), this.newText.substring(len))
    }
    removeCommonSuffix(source: string): StringReplacement {
        const len = commonSuffixLength(this.replaceRange.substring(source), this.newText)
        return len === 0 ? this : new StringReplacement(this.replaceRange.deltaEnd(-len), this.newText.substring(0, this.newText.length - len))
    }
    removeCommonSuffixAndPrefix(source: string): StringReplacement { return this.removeCommonSuffix(source).removeCommonPrefix(source) }
    toJson(): { txt: string, pos: number, len: number } { return { txt: this.newText, pos: this.replaceRange.start, len: this.replaceRange.length } }
}

export class StringEdit {
    static readonly empty = new StringEdit([])
    constructor(readonly replacements: readonly StringReplacement[]) { }
    isEmpty(): boolean { return this.replacements.length === 0 }
    /** 合并首尾相接的替换、去掉空替换 */
    normalize(): StringEdit {
        const out: StringReplacement[] = []
        for (const r of this.replacements) {
            if (r.newText.length === 0 && r.replaceRange.isEmpty) continue
            const last = out[out.length - 1]
            if (last && last.replaceRange.endExclusive === r.replaceRange.start)
                out[out.length - 1] = new StringReplacement(new OffsetRange(last.replaceRange.start, r.replaceRange.endExclusive), last.newText + r.newText)
            else out.push(r)
        }
        return new StringEdit(out)
    }
    removeCommonSuffixAndPrefix(source: string): StringEdit {
        return new StringEdit(this.replacements.map(r => r.removeCommonSuffixAndPrefix(source))).normalize()
    }
    apply(base: string): string {
        let out = ''
        let last = 0
        for (const r of this.replacements) {
            out += base.substring(last, r.replaceRange.start) + r.newText
            last = r.replaceRange.endExclusive
        }
        return out + base.substring(last)
    }
}

/** 模型内容事件里的 changes(各自相对「改前文档」的偏移,倒序给)→ 升序的 StringEdit */
export function offsetEditFromContentChanges(changes: readonly { rangeOffset: number, rangeLength: number, text: string }[]): StringEdit {
    const sorted = changes.slice().sort((a, b) => a.rangeOffset - b.rangeOffset)
    return new StringEdit(sorted.map(c => new StringReplacement(new OffsetRange(c.rangeOffset, c.rangeOffset + c.rangeLength), c.text)))
}

/**
 * 把一条升序的编辑作用到一组升序区间上:编辑当作「删掉被替换段,再插入」,插入并入第一个相交的区间。
 * 完全落在编辑之后的区间整体平移,相交的区间收缩/扩张,完全落在编辑之前的不动。
 */
export function applyEditsToRanges(sortedRanges: OffsetRange[], edit: StringEdit): OffsetRange[] {
    sortedRanges = sortedRanges.slice()
    const result: OffsetRange[] = []
    let offset = 0
    for (const e of edit.replacements) {
        for (; ;) {
            const r = sortedRanges[0]
            if (!r || r.endExclusive >= e.replaceRange.start) break
            sortedRanges.shift()
            result.push(r.delta(offset))
        }
        const intersecting: OffsetRange[] = []
        for (; ;) {
            const r = sortedRanges[0]
            if (!r || !r.intersectsOrTouches(e.replaceRange)) break
            sortedRanges.shift()
            intersecting.push(r)
        }
        for (let i = intersecting.length - 1; i >= 0; i--) {
            let r = intersecting[i]
            const overlap = r.intersect(e.replaceRange)!.length
            r = r.deltaEnd(-overlap + (i === 0 ? e.newText.length : 0))
            const ahead = r.start - e.replaceRange.start
            if (ahead > 0) r = r.delta(-ahead)
            if (i !== 0) r = r.delta(e.newText.length)
            // 它会重新进队列、再加一次 offset,所以这里先减掉
            r = r.delta(-(e.newText.length - e.replaceRange.length))
            sortedRanges.unshift(r)
        }
        offset += e.newText.length - e.replaceRange.length
    }
    for (const r of sortedRanges) result.push(r.delta(offset))
    return result
}
