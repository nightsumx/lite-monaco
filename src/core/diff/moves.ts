// 移动代码块检测:照搬 Monaco common/diff/defaultLinesDiffComputer/computeMovedLines.ts。
// 两步找:① 只删 / 只增的大块(≥3 行)按字符直方图配对,相似度 > 0.9;② 在剩下的改动里找连续 3 行哈希相同的块,再向上下延伸。
// 最后合并相邻的、丢掉太短的、丢掉两端落在同一个 diff 里的。
import type { LRange, RangePair } from './unchanged'
import { subtractFromRange, lineRangeContains, intersectsStrict } from './unchanged'

/** Monaco LineRangeSet:有序、互不相交也不相切的行区间 */
export class LineRangeSet {
    ranges: LRange[] = []
    constructor(ranges: readonly LRange[] = []) { for (const r of ranges) this.addRange(r) }
    addRange(r: LRange) {
        if (r.end <= r.start) return
        const all = [...this.ranges, r].sort((a, b) => a.start - b.start)
        const out: LRange[] = []
        for (const x of all) {
            const last = out[out.length - 1]
            if (last && x.start <= last.end) last.end = Math.max(last.end, x.end)
            else out.push({ ...x })
        }
        this.ranges = out
    }
    contains(n: number) { return this.ranges.some(r => lineRangeContains(r, n)) }
    /** 和 range 至少重叠一行(相切不算) */
    intersects(range: LRange) { return this.ranges.some(r => intersectsStrict(r, range)) }
    getUnion(other: LineRangeSet): LineRangeSet { return new LineRangeSet([...this.ranges, ...other.ranges]) }
    toString() { return this.ranges.map(r => `[${r.start},${r.end})`).join(', ') }
    subtractFrom(r: LRange): LineRangeSet {
        const s = new LineRangeSet()
        s.ranges = subtractFromRange(this.ranges, r)
        return s
    }
    getWithDelta(d: number): LineRangeSet {
        const s = new LineRangeSet()
        s.ranges = this.ranges.map(r => ({ start: r.start + d, end: r.end + d }))
        return s
    }
    getIntersection(o: LineRangeSet): LineRangeSet {
        const s = new LineRangeSet()
        for (const a of this.ranges) {
            for (const b of o.ranges) {
                const start = Math.max(a.start, b.start), end = Math.min(a.end, b.end)
                if (start < end) s.ranges.push({ start, end })
            }
        }
        s.ranges.sort((a, b) => a.start - b.start)
        return s
    }
}

/** Monaco LineRangeFragment:一段行的字符直方图,用来算两块文字多像 */
class Fragment {
    private readonly histogram = new Map<string, number>()
    readonly totalCount: number
    constructor(readonly range: LRange, lines: readonly string[], readonly source: number) {
        let counter = 0
        for (let i = range.start - 1; i < range.end - 1; i++) {
            const line = lines[i]
            for (let j = 0; j < line.length; j++) {
                counter++
                this.histogram.set(line[j], (this.histogram.get(line[j]) ?? 0) + 1)
            }
            counter++
            this.histogram.set('\n', (this.histogram.get('\n') ?? 0) + 1)
        }
        this.totalCount = counter
    }
    computeSimilarity(other: Fragment): number {
        let sum = 0
        for (const [k, v] of this.histogram) sum += Math.abs(v - (other.histogram.get(k) ?? 0))
        for (const [k, v] of other.histogram) if (!this.histogram.has(k)) sum += v
        return 1 - sum / (this.totalCount + other.totalCount)
    }
}

export interface MoveContext {
    /** 每行 trim 后的哈希(下标 = 行号 - 1) */
    hashedOriginal: readonly number[]
    hashedModified: readonly number[]
    /** 两行是不是"基本是同一行"(Monaco areLinesSimilar:字符 Myers diff 后公共非空白字符 > 60%) */
    areLinesSimilar: (a: string, b: string) => boolean
    /** diff 计算的时限还没到 */
    isValid: () => boolean
}

const len = (r: LRange) => r.end - r.start

function computeMovesFromSimpleDeletionsToSimpleInsertions(changes: readonly RangePair[], originalLines: readonly string[], modifiedLines: readonly string[], ctx: MoveContext) {
    const moves: RangePair[] = []
    const deletions: Fragment[] = []
    const insertions = new Set<Fragment>()
    changes.forEach((c, i) => {
        if (len(c.modified) === 0 && len(c.original) >= 3) deletions.push(new Fragment(c.original, originalLines, i))
    })
    changes.forEach((c, i) => {
        if (len(c.original) === 0 && len(c.modified) >= 3) insertions.add(new Fragment(c.modified, modifiedLines, i))
    })
    const excluded = new Set<number>()
    for (const deletion of deletions) {
        let highest = -1
        let best: Fragment | undefined
        for (const insertion of insertions) {
            const similarity = deletion.computeSimilarity(insertion)
            if (similarity > highest) {
                highest = similarity
                best = insertion
            }
        }
        if (highest > 0.90 && best) {
            insertions.delete(best)
            moves.push({ original: deletion.range, modified: best.range })
            excluded.add(deletion.source)
            excluded.add(best.source)
        }
        if (!ctx.isValid()) return { moves, excluded }
    }
    return { moves, excluded }
}

function computeUnchangedMoves(changes: RangePair[], originalLines: readonly string[], modifiedLines: readonly string[], ctx: MoveContext): RangePair[] {
    const moves: RangePair[] = []
    const original3: Map<string, LRange[]> = new Map()
    const hO = ctx.hashedOriginal, hM = ctx.hashedModified
    for (const change of changes) {
        for (let i = change.original.start; i < change.original.end - 2; i++) {
            const key = `${hO[i - 1]}:${hO[i]}:${hO[i + 1]}`
            const list = original3.get(key)
            const r = { start: i, end: i + 3 }
            if (list) list.push(r)
            else original3.set(key, [r])
        }
    }
    interface Mapping { modifiedLineRange: LRange, originalLineRange: LRange }
    const possible: Mapping[] = []
    changes.sort((a, b) => a.modified.start - b.modified.start)
    for (const change of changes) {
        let lastMappings: Mapping[] = []
        for (let i = change.modified.start; i < change.modified.end - 2; i++) {
            const key = `${hM[i - 1]}:${hM[i]}:${hM[i + 1]}`
            const currentModified = { start: i, end: i + 3 }
            const next: Mapping[] = []
            for (const range of original3.get(key) ?? []) {
                const extend = lastMappings.find(l =>
                    l.originalLineRange.end + 1 === range.end && l.modifiedLineRange.end + 1 === currentModified.end)
                if (extend) {
                    extend.originalLineRange = { start: extend.originalLineRange.start, end: range.end }
                    extend.modifiedLineRange = { start: extend.modifiedLineRange.start, end: currentModified.end }
                    next.push(extend)
                    continue
                }
                const mapping = { modifiedLineRange: currentModified, originalLineRange: range }
                possible.push(mapping)
                next.push(mapping)
            }
            lastMappings = next
        }
        if (!ctx.isValid()) return []
    }
    // 稳定的降序:长的先占位
    possible.sort((a, b) => len(b.modifiedLineRange) - len(a.modifiedLineRange))
    const modifiedSet = new LineRangeSet()
    const originalSet = new LineRangeSet()
    for (const mapping of possible) {
        const diffOrigToMod = mapping.modifiedLineRange.start - mapping.originalLineRange.start
        const modifiedSections = modifiedSet.subtractFrom(mapping.modifiedLineRange)
        const originalTranslated = originalSet.subtractFrom(mapping.originalLineRange).getWithDelta(diffOrigToMod)
        const intersected = modifiedSections.getIntersection(originalTranslated)
        for (const s of intersected.ranges) {
            if (len(s) < 3) continue
            const originalLineRange = { start: s.start - diffOrigToMod, end: s.end - diffOrigToMod }
            moves.push({ original: originalLineRange, modified: s })
            modifiedSet.addRange(s)
            originalSet.addRange(originalLineRange)
        }
    }
    moves.sort((a, b) => a.original.start - b.original.start)
    const findLast = (pred: (c: RangePair) => boolean): RangePair | undefined => {
        for (let k = changes.length - 1; k >= 0; k--) if (pred(changes[k])) return changes[k]
        return undefined
    }
    for (let i = 0; i < moves.length; i++) {
        const move = moves[i]
        const firstO = findLast(c => c.original.start <= move.original.start)!
        const firstM = findLast(c => c.modified.start <= move.modified.start)!
        const linesAbove = Math.max(move.original.start - firstO.original.start, move.modified.start - firstM.modified.start)
        const lastO = findLast(c => c.original.start < move.original.end)!
        const lastM = findLast(c => c.modified.start < move.modified.end)!
        const linesBelow = Math.max(lastO.original.end - move.original.end, lastM.modified.end - move.modified.end)

        let extendToTop: number
        for (extendToTop = 0; extendToTop < linesAbove; extendToTop++) {
            const origLine = move.original.start - extendToTop - 1
            const modLine = move.modified.start - extendToTop - 1
            if (origLine > originalLines.length || modLine > modifiedLines.length) break
            if (modifiedSet.contains(modLine) || originalSet.contains(origLine)) break
            if (!ctx.areLinesSimilar(originalLines[origLine - 1], modifiedLines[modLine - 1])) break
        }
        if (extendToTop > 0) {
            originalSet.addRange({ start: move.original.start - extendToTop, end: move.original.start })
            modifiedSet.addRange({ start: move.modified.start - extendToTop, end: move.modified.start })
        }
        let extendToBottom: number
        for (extendToBottom = 0; extendToBottom < linesBelow; extendToBottom++) {
            const origLine = move.original.end + extendToBottom
            const modLine = move.modified.end + extendToBottom
            if (origLine > originalLines.length || modLine > modifiedLines.length) break
            if (modifiedSet.contains(modLine) || originalSet.contains(origLine)) break
            if (!ctx.areLinesSimilar(originalLines[origLine - 1], modifiedLines[modLine - 1])) break
        }
        if (extendToBottom > 0) {
            originalSet.addRange({ start: move.original.end, end: move.original.end + extendToBottom })
            modifiedSet.addRange({ start: move.modified.end, end: move.modified.end + extendToBottom })
        }
        if (extendToTop > 0 || extendToBottom > 0) {
            moves[i] = {
                original: { start: move.original.start - extendToTop, end: move.original.end + extendToBottom },
                modified: { start: move.modified.start - extendToTop, end: move.modified.end + extendToBottom },
            }
        }
    }
    return moves
}

function joinCloseConsecutiveMoves(moves: RangePair[]): RangePair[] {
    if (moves.length === 0) return moves
    moves.sort((a, b) => a.original.start - b.original.start)
    const result = [moves[0]]
    for (let i = 1; i < moves.length; i++) {
        const last = result[result.length - 1]
        const current = moves[i]
        const originalDist = current.original.start - last.original.end
        const modifiedDist = current.modified.start - last.modified.end
        if (originalDist >= 0 && modifiedDist >= 0 && originalDist + modifiedDist <= 2) {
            result[result.length - 1] = {
                original: { start: Math.min(last.original.start, current.original.start), end: Math.max(last.original.end, current.original.end) },
                modified: { start: Math.min(last.modified.start, current.modified.start), end: Math.max(last.modified.end, current.modified.end) },
            }
            continue
        }
        result.push(current)
    }
    return result
}

function removeMovesInSameDiff(changes: readonly RangePair[], moves: RangePair[]): RangePair[] {
    const findLastIndex = (pred: (c: RangePair) => boolean) => {
        for (let k = changes.length - 1; k >= 0; k--) if (pred(changes[k])) return k
        return -1
    }
    return moves.filter(m => {
        const o = findLastIndex(c => c.original.start < m.original.end)
        const mod = findLastIndex(c => c.modified.start < m.modified.end)
        return o === -1 || o !== mod
    })
}

/** Monaco computeMovedLines:changes 是行级改动(两侧行区间),返回移动块(原位 → 新位) */
export function computeMovedLines(changes: readonly RangePair[], originalLines: readonly string[], modifiedLines: readonly string[], ctx: MoveContext): RangePair[] {
    const first = computeMovesFromSimpleDeletionsToSimpleInsertions(changes, originalLines, modifiedLines, ctx)
    let moves = first.moves
    if (!ctx.isValid()) return []
    const filtered = changes.filter((_, i) => !first.excluded.has(i))
    moves.push(...computeUnchangedMoves(filtered, originalLines, modifiedLines, ctx))
    moves = joinCloseConsecutiveMoves(moves)
    // 太短的不算
    moves = moves.filter(current => {
        const lines = originalLines.slice(current.original.start - 1, current.original.end - 1).map(l => l.trim())
        return lines.join('\n').length >= 15 && lines.filter(l => l.length >= 2).length >= 2
    })
    return removeMovesInSameDiff(changes, moves)
}
