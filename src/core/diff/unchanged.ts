// 折叠未改区域(hideUnchangedRegions)的数据模型。照搬 Monaco diffEditorViewModel.ts 的 UnchangedRegion,
// 去掉 observable:区域是普通对象,谁改了谁通知 DiffEditor 重画。行号都是 1-based,区间半开 [start, end)。
import type { LineRangeMapping } from './linediff'

/** 半开行区间 */
export interface LRange { start: number, end: number }

const len = (r: LRange) => r.end - r.start

/** 把 ranges 按起点排序后合并相交 / 相切的 */
function normalize(ranges: LRange[]): LRange[] {
    const sorted = ranges.filter(r => r.end > r.start).sort((a, b) => a.start - b.start)
    const out: LRange[] = []
    for (const r of sorted) {
        const last = out[out.length - 1]
        if (last && r.start <= last.end) last.end = Math.max(last.end, r.end)
        else out.push({ ...r })
    }
    return out
}

/** Monaco LineRangeSet.subtractFrom:range 里没被 set 盖住的部分 */
export function subtractFromRange(set: LRange[], range: LRange): LRange[] {
    const out: LRange[] = []
    let cur = range.start
    for (const r of normalize(set)) {
        if (r.end <= cur) continue
        if (r.start >= range.end) break
        if (r.start > cur) out.push({ start: cur, end: Math.min(r.start, range.end) })
        cur = Math.max(cur, r.end)
        if (cur >= range.end) break
    }
    if (cur < range.end) out.push({ start: cur, end: range.end })
    return out
}

/** Monaco LineRange.contains:半开区间,不含 end */
export const lineRangeContains = (r: LRange, n: number) => r.start <= n && n < r.end

/** Monaco LineRange.intersectsStrict:重叠至少一行 */
export const intersectsStrict = (a: LRange, b: LRange) => a.start < b.end && b.start < a.end

/** 两侧对应的一对未改行区间(Monaco LineRangeMapping 的最小形态) */
export interface RangePair { original: LRange, modified: LRange }

/**
 * Monaco LineRangeMapping.inverse:两个 mapping 之间(含首尾)未改的那些行区间。modified 为空的丢掉。
 */
export function inverseMappings(mappings: readonly RangePair[], originalLineCount: number, modifiedLineCount: number): RangePair[] {
    const result: RangePair[] = []
    let lastO = 1
    let lastM = 1
    for (const m of mappings) {
        const r = { original: { start: lastO, end: m.original.start }, modified: { start: lastM, end: m.modified.start } }
        if (len(r.modified) > 0) result.push(r)
        lastO = m.original.end
        lastM = m.modified.end
    }
    const r = { original: { start: lastO, end: originalLineCount + 1 }, modified: { start: lastM, end: modifiedLineCount + 1 } }
    if (len(r.modified) > 0) result.push(r)
    return result
}

/** LineRangeMapping 列表(lite-monaco 形态)→ RangePair */
export const toPairs = (changes: readonly LineRangeMapping[]): RangePair[] =>
    changes.map(c => ({ original: { start: c.originalStart, end: c.originalEnd }, modified: { start: c.modifiedStart, end: c.modifiedEnd } }))

/** Monaco RevealPreference */
export const RevealPreference = { FromCloserSide: 0, FromTop: 1, FromBottom: 2 } as const
export type RevealPreference = typeof RevealPreference[keyof typeof RevealPreference]

/** 一段被折叠的未改区域。originalLineNumber / modifiedLineNumber 是首行,lineCount 是总行数;上下各露出 visibleTop / visibleBottom 行 */
export class UnchangedRegion {
    isDragged: 'top' | 'bottom' | undefined
    visibleLineCountTop: number
    visibleLineCountBottom: number

    constructor(
        public originalLineNumber: number,
        public modifiedLineNumber: number,
        public lineCount: number,
        visibleLineCountTop = 0,
        visibleLineCountBottom = 0,
    ) {
        this.visibleLineCountTop = Math.max(Math.min(visibleLineCountTop, lineCount), 0)
        this.visibleLineCountBottom = Math.max(Math.min(visibleLineCountBottom, lineCount - this.visibleLineCountTop), 0)
    }

    /** Monaco UnchangedRegion.fromDiffs */
    static fromDiffs(changes: readonly LineRangeMapping[], originalLineCount: number, modifiedLineCount: number, minHiddenLineCount: number, minContext: number): UnchangedRegion[] {
        const result: UnchangedRegion[] = []
        for (const mapping of inverseMappings(toPairs(changes), originalLineCount, modifiedLineCount)) {
            let origStart = mapping.original.start
            let modStart = mapping.modified.start
            let length = len(mapping.original)
            const atStart = origStart === 1 && modStart === 1
            const atEnd = origStart + length === originalLineCount + 1 && modStart + length === modifiedLineCount + 1
            if ((atStart || atEnd) && length >= minContext + minHiddenLineCount) {
                if (atStart && !atEnd) length -= minContext
                if (atEnd && !atStart) {
                    origStart += minContext
                    modStart += minContext
                    length -= minContext
                }
                result.push(new UnchangedRegion(origStart, modStart, length, 0, 0))
            } else if (length >= minContext * 2 + minHiddenLineCount) {
                origStart += minContext
                modStart += minContext
                length -= minContext * 2
                result.push(new UnchangedRegion(origStart, modStart, length, 0, 0))
            }
        }
        return result
    }

    get originalUnchangedRange(): LRange { return { start: this.originalLineNumber, end: this.originalLineNumber + this.lineCount } }
    get modifiedUnchangedRange(): LRange { return { start: this.modifiedLineNumber, end: this.modifiedLineNumber + this.lineCount } }
    get hiddenLineCount() { return this.lineCount - this.visibleLineCountTop - this.visibleLineCountBottom }
    getHiddenOriginalRange(): LRange {
        const start = this.originalLineNumber + this.visibleLineCountTop
        return { start, end: start + this.hiddenLineCount }
    }
    getHiddenModifiedRange(): LRange {
        const start = this.modifiedLineNumber + this.visibleLineCountTop
        return { start, end: start + this.hiddenLineCount }
    }
    /** 上下都露满了:不再画控制条(拖动时除外) */
    shouldHideControls() {
        return this.visibleLineCountTop + this.visibleLineCountBottom === this.lineCount && !this.isDragged
    }

    /** Monaco setVisibleRanges:这一段里 visibleRanges(modified 侧)之外的是折叠的,可能因此裂成几段 */
    setVisibleRanges(visibleModified: LRange[]): UnchangedRegion[] {
        const result: UnchangedRegion[] = []
        const hiddenModified = subtractFromRange(visibleModified, this.modifiedUnchangedRange)
        let originalStart = this.originalLineNumber
        let modifiedStart = this.modifiedLineNumber
        const modifiedEndEx = this.modifiedLineNumber + this.lineCount
        if (hiddenModified.length === 0) {
            this.showAll()
            result.push(this)
        } else {
            let i = 0
            for (const r of hiddenModified) {
                const isLast = i === hiddenModified.length - 1
                i++
                const length = (isLast ? modifiedEndEx : r.end) - modifiedStart
                const piece = new UnchangedRegion(originalStart, modifiedStart, length, 0, 0)
                piece.setHiddenModifiedRange(r)
                result.push(piece)
                originalStart = piece.originalUnchangedRange.end
                modifiedStart = piece.modifiedUnchangedRange.end
            }
        }
        return result
    }

    setHiddenModifiedRange(range: LRange) {
        this.setState(range.start - this.modifiedLineNumber, (this.modifiedLineNumber + this.lineCount) - range.end)
    }
    getMaxVisibleLineCountTop() { return this.lineCount - this.visibleLineCountBottom }
    getMaxVisibleLineCountBottom() { return this.lineCount - this.visibleLineCountTop }
    showMoreAbove(count = 10) {
        this.visibleLineCountTop = Math.min(this.visibleLineCountTop + count, this.getMaxVisibleLineCountTop())
    }
    showMoreBelow(count = 10) {
        this.visibleLineCountBottom = Math.min(this.visibleLineCountBottom + count, this.lineCount - this.visibleLineCountTop)
    }
    showAll() { this.visibleLineCountBottom = this.lineCount - this.visibleLineCountTop }
    collapseAll() {
        this.visibleLineCountTop = 0
        this.visibleLineCountBottom = 0
    }
    showModifiedLine(lineNumber: number, preference: RevealPreference) {
        const top = lineNumber + 1 - (this.modifiedLineNumber + this.visibleLineCountTop)
        const bottom = (this.modifiedLineNumber - this.visibleLineCountBottom + this.lineCount) - lineNumber
        if ((preference === RevealPreference.FromCloserSide && top < bottom) || preference === RevealPreference.FromTop) this.visibleLineCountTop += top
        else this.visibleLineCountBottom += bottom
    }
    showOriginalLine(lineNumber: number, preference: RevealPreference) {
        const top = lineNumber - this.originalLineNumber
        const bottom = (this.originalLineNumber + this.lineCount) - lineNumber
        if ((preference === RevealPreference.FromCloserSide && top < bottom) || preference === RevealPreference.FromTop)
            this.visibleLineCountTop = Math.min(this.visibleLineCountTop + bottom - top, this.getMaxVisibleLineCountTop())
        else
            this.visibleLineCountBottom = Math.min(this.visibleLineCountBottom + top - bottom, this.getMaxVisibleLineCountBottom())
    }
    setState(top: number, bottom: number) {
        top = Math.max(Math.min(top, this.lineCount), 0)
        bottom = Math.max(Math.min(bottom, this.lineCount - top), 0)
        this.visibleLineCountTop = top
        this.visibleLineCountBottom = bottom
    }
}

/**
 * 新一轮 diff 算完后,把旧区域里用户已展开的部分带到新区域上(Monaco updateUnchangedRegions 的"Transfer state")。
 * previous 是 undefined(第一次)→ 全部折叠;否则旧区域折叠着的行仍折叠,其余(用户展开过 / 本来就可见)保持可见。
 */
export function transferUnchangedRegions(
    fresh: UnchangedRegion[],
    previous: readonly UnchangedRegion[] | undefined,
    originalLineCount: number,
    modifiedLineCount: number,
): UnchangedRegion[] {
    if (!previous) return fresh
    // 旧区域按现在的行数收敛(编辑会缩短它),并去掉彼此重叠的
    const updated: UnchangedRegion[] = []
    let prev: UnchangedRegion | undefined
    for (const r of previous) {
        const cur = new UnchangedRegion(r.originalLineNumber, r.modifiedLineNumber, r.lineCount, Math.min(r.visibleLineCountTop, r.lineCount), Math.min(r.visibleLineCountBottom, r.lineCount - r.visibleLineCountTop))
        if (!prev || (cur.modifiedLineNumber >= prev.modifiedLineNumber + prev.lineCount && cur.originalLineNumber >= prev.originalLineNumber + prev.lineCount)) {
            updated.push(cur)
            prev = cur
        }
    }
    // hiddenRegions → LineRangeMapping.clip → inverse = 当前可见的行对
    const clip = (r: LRange, max: number): LRange => ({ start: Math.max(1, Math.min(r.start, max + 1)), end: Math.max(1, Math.min(r.end, max + 1)) })
    const hidden = updated.map(r => ({ original: clip(r.getHiddenOriginalRange(), originalLineCount), modified: clip(r.getHiddenModifiedRange(), modifiedLineCount) }))
    const visible = inverseMappings(hidden, originalLineCount, modifiedLineCount)
    const out: UnchangedRegion[] = []
    for (const r of fresh) {
        const intersecting = visible.filter(f => intersectsStrict(f.original, r.originalUnchangedRange) && intersectsStrict(f.modified, r.modifiedUnchangedRange))
        out.push(...r.setVisibleRanges(intersecting.map(f => f.modified)))
    }
    return out
}
