// Portions of this file are derived from CodeMirror 6 (MIT, Copyright (C) Marijn Haverbeke and others). See THIRD-PARTY-NOTICES.md.
// CM7 RangeSet —— 把不可变「值」关联到文档区间的集合(装饰/标记/有状态区间底座)。
//
// 数据结构(逐行移植 CM6 rangeset.ts 核心):
//   Chunk —— 一批区间,from/to 存相对块起点的偏移,maxPoint 记块内最大点尺寸(扫描可跳过纯区间块)。
//   RangeSet —— chunkPos + chunk[] + nextLayer(重叠区间下沉到下一层)+ maxPoint。不可变。
//   map/update O(变更量):未触及的块整块平移复用,只重算被碰到的块。
//
// spans/compare/eq/SpanCursor(阶段2 装饰落地后恢复):heightmap 的 NodeBuilder 消费 spans 把
//   装饰投影成块高度,视图 diff 消费 compare 算最小 DOM 更新——逐行移植 CM6,不重想(CM7-DESIGN §5)。
//
// 可监测:值是不透明用户对象,枚举(between/iter)即可监测面;结构双射 of(collect) 复现等价集合。

import type { ChangeDesc } from './change'
import { MapMode } from './change'

const CHUNK_SIZE = 250
const FAR = 1e9

export abstract class RangeValue {
    eq(other: RangeValue) { return this === other }
    declare startSide: number
    declare endSide: number
    declare mapMode: MapMode
    declare point: boolean

    range(from: number, to = from) { return Range.create(from, to, this) }
}

RangeValue.prototype.startSide = RangeValue.prototype.endSide = 0
RangeValue.prototype.point = false
RangeValue.prototype.mapMode = MapMode.TrackDel

function cmpVal(a: RangeValue, b: RangeValue) {
    return a === b || (a.constructor === b.constructor && a.eq(b))
}

export class Range<T extends RangeValue> {
    private constructor(readonly from: number, readonly to: number, readonly value: T) {}

    static create<T extends RangeValue>(from: number, to: number, value: T) {
        return new Range<T>(from, to, value)
    }
}

function cmpRange<T extends RangeValue>(a: Range<T>, b: Range<T>) {
    return a.from - b.from || a.value.startSide - b.value.startSide
}

class Chunk<T extends RangeValue> {
    constructor(
        readonly from: readonly number[],
        readonly to: readonly number[],
        readonly value: readonly T[],
        readonly maxPoint: number,
    ) {}

    get length() { return this.to[this.to.length - 1] }

    findIndex(pos: number, side: number, end: boolean, startAt = 0) {
        const arr = end ? this.to : this.from
        for (let lo = startAt, hi = arr.length; ;) {
            if (lo === hi)
                return lo
            const mid = (lo + hi) >> 1
            const diff = arr[mid] - pos || (end ? this.value[mid].endSide : this.value[mid].startSide) - side
            if (mid === lo)
                return diff >= 0 ? lo : hi
            if (diff >= 0)
                hi = mid
            else lo = mid + 1
        }
    }

    between(offset: number, from: number, to: number, f: (from: number, to: number, value: T) => void | false): void | false {
        for (let i = this.findIndex(from, -FAR, true), e = this.findIndex(to, FAR, false, i); i < e; i++) {
            if (f(this.from[i] + offset, this.to[i] + offset, this.value[i]) === false)
                return false
        }
    }

    map(offset: number, changes: ChangeDesc) {
        const value: T[] = []
        const from: number[] = []
        const to: number[] = []
        let newPos = -1
        let maxPoint = -1
        for (let i = 0; i < this.value.length; i++) {
            const val = this.value[i]
            const curFrom = this.from[i] + offset
            const curTo = this.to[i] + offset
            let newFrom: number, newTo: number
            if (curFrom === curTo) {
                const mapped = changes.mapPos(curFrom, val.startSide, val.mapMode)
                if (mapped == null)
                    continue
                newFrom = newTo = mapped
                if (val.startSide !== val.endSide) {
                    newTo = changes.mapPos(curFrom, val.endSide)
                    if (newTo < newFrom)
                        continue
                }
            }
            else {
                newFrom = changes.mapPos(curFrom, val.startSide)
                newTo = changes.mapPos(curTo, val.endSide)
                if (newFrom > newTo || (newFrom === newTo && val.startSide > 0 && val.endSide <= 0))
                    continue
            }
            if ((newTo - newFrom || val.endSide - val.startSide) < 0)
                continue
            if (newPos < 0)
                newPos = newFrom
            if (val.point)
                maxPoint = Math.max(maxPoint, newTo - newFrom)
            value.push(val)
            from.push(newFrom - newPos)
            to.push(newTo - newPos)
        }
        return { mapped: value.length ? new Chunk(from, to, value, maxPoint) : null, pos: newPos }
    }
}

export interface RangeCursor<T> {
    next: () => void
    goto: (pos: number) => void
    value: T | null
    from: number
    to: number
    rank: number
}

// 比较两组 RangeSet 时的回调面(视图层 diff 用):区间值变化 / 点装饰变化 / 边界裂变。
export interface RangeComparator<T extends RangeValue> {
    compareRange: (from: number, to: number, activeA: T[], activeB: T[]) => void
    comparePoint: (from: number, to: number, pointA: T | null, pointB: T | null) => void
    boundChange?: (pos: number) => void
}

// 遍历一组 RangeSet 产生的「跨度」时的回调面(heightmap 把跨度投影成块高度用):
//   span = 非点区间覆盖段(active 是覆盖它的值,openStart 是段起点已开着的区间数);
//   point = 点装饰(active 是优先级更高且覆盖该点的区间)。
export interface SpanIterator<T extends RangeValue> {
    span: (from: number, to: number, active: readonly T[], openStart: number) => void
    point: (from: number, to: number, value: T, active: readonly T[], openStart: number, index: number) => void
}

interface RangeSetUpdate<T extends RangeValue> {
    add?: readonly Range<T>[]
    sort?: boolean
    filter?: (from: number, to: number, value: T) => boolean
    filterFrom?: number
    filterTo?: number
}

export class RangeSet<T extends RangeValue> {
    private constructor(
        readonly chunkPos: readonly number[],
        readonly chunk: readonly Chunk<T>[],
        readonly nextLayer: RangeSet<T>,
        readonly maxPoint: number,
    ) {}

    static create<T extends RangeValue>(
        chunkPos: readonly number[],
        chunk: readonly Chunk<T>[],
        nextLayer: RangeSet<T>,
        maxPoint: number,
    ) {
        return new RangeSet<T>(chunkPos, chunk, nextLayer, maxPoint)
    }

    get length(): number {
        const last = this.chunk.length - 1
        return last < 0 ? 0 : Math.max(this.chunkEnd(last), this.nextLayer.length)
    }

    get size(): number {
        if (this.isEmpty)
            return 0
        let size = this.nextLayer.size
        for (const chunk of this.chunk) size += chunk.value.length
        return size
    }

    chunkEnd(index: number) {
        return this.chunkPos[index] + this.chunk[index].length
    }

    update<U extends T>(updateSpec: RangeSetUpdate<U>): RangeSet<T> {
        let add = updateSpec.add ?? []
        const sort = updateSpec.sort ?? false
        const filterFrom = updateSpec.filterFrom ?? 0
        const filterTo = updateSpec.filterTo ?? this.length
        const filter = updateSpec.filter as undefined | ((from: number, to: number, value: T) => boolean)
        if (add.length === 0 && !filter)
            return this
        if (sort)
            add = add.slice().sort(cmpRange)
        if (this.isEmpty)
            return add.length ? RangeSet.of(add) : this

        const cur = new LayerCursor(this, null, -1).goto(0)
        let i = 0
        const spill: Range<T>[] = []
        const builder = new RangeSetBuilder<T>()
        while (cur.value || i < add.length) {
            if (i < add.length && (cur.from - add[i].from || cur.startSide - add[i].value.startSide) >= 0) {
                const range = add[i++]
                if (!builder.addInner(range.from, range.to, range.value))
                    spill.push(range)
            }
            else if (cur.rangeIndex === 1 && cur.chunkIndex < this.chunk.length
                && (i === add.length || this.chunkEnd(cur.chunkIndex) < add[i].from)
                && (!filter || filterFrom > this.chunkEnd(cur.chunkIndex) || filterTo < this.chunkPos[cur.chunkIndex])
                && builder.addChunk(this.chunkPos[cur.chunkIndex], this.chunk[cur.chunkIndex])) {
                cur.nextChunk()
            }
            else {
                if (!filter || filterFrom > cur.to || filterTo < cur.from || filter(cur.from, cur.to, cur.value!)) {
                    if (!builder.addInner(cur.from, cur.to, cur.value!))
                        spill.push(Range.create(cur.from, cur.to, cur.value!))
                }
                cur.next()
            }
        }

        return builder.finishInner(this.nextLayer.isEmpty && !spill.length
            ? RangeSet.empty
            : this.nextLayer.update<T>({ add: spill, filter, filterFrom, filterTo }))
    }

    map(changes: ChangeDesc): RangeSet<T> {
        if (changes.empty || this.isEmpty)
            return this

        const chunks: Chunk<T>[] = []
        const chunkPos: number[] = []
        let maxPoint = -1
        for (let i = 0; i < this.chunk.length; i++) {
            const start = this.chunkPos[i]
            const chunk = this.chunk[i]
            const touch = changes.touchesRange(start, start + chunk.length)
            if (touch === false) {
                maxPoint = Math.max(maxPoint, chunk.maxPoint)
                chunks.push(chunk)
                chunkPos.push(changes.mapPos(start))
            }
            else if (touch === true) {
                const { mapped, pos } = chunk.map(start, changes)
                if (mapped) {
                    maxPoint = Math.max(maxPoint, mapped.maxPoint)
                    chunks.push(mapped)
                    chunkPos.push(pos)
                }
            }
        }
        const next = this.nextLayer.map(changes)
        return chunks.length === 0 ? next : new RangeSet(chunkPos, chunks, next || RangeSet.empty, maxPoint)
    }

    between(from: number, to: number, f: (from: number, to: number, value: T) => void | false): void {
        if (this.isEmpty)
            return
        for (let i = 0; i < this.chunk.length; i++) {
            const start = this.chunkPos[i]
            const chunk = this.chunk[i]
            if (to >= start && from <= start + chunk.length
                && chunk.between(start, from - start, to - start, f) === false) {
                return
            }
        }
        this.nextLayer.between(from, to, f)
    }

    // 可监测:枚举所有层(含 nextLayer 递归),每层一个 {ranges: [{from,to}]}。
    // 层 = 重叠区间下沉结构(同一 from 的区间在不同层)。value 不序列化(不透明用户对象)。
    toJSON(): { layers: { ranges: { from: number, to: number }[] }[] } {
        if (this.isEmpty)
            return { layers: [] }
        const layers: { ranges: { from: number, to: number }[] }[] = []
        for (let layer: RangeSet<T> = this; !layer.isEmpty; layer = layer.nextLayer) {
            const ranges: { from: number, to: number }[] = []
            for (let i = 0; i < layer.chunk.length; i++) {
                const start = layer.chunkPos[i]
                const chunk = layer.chunk[i]
                for (let j = 0; j < chunk.value.length; j++) {
                    ranges.push({ from: chunk.from[j] + start, to: chunk.to[j] + start })
                }
            }
            layers.push({ ranges })
        }
        return { layers }
    }

    iter(from = 0): RangeCursor<T> {
        return HeapCursor.from([this]).goto(from)
    }

    get isEmpty() { return this.nextLayer === this }

    static iter<T extends RangeValue>(sets: readonly RangeSet<T>[], from = 0): RangeCursor<T> {
        return HeapCursor.from(sets).goto(from)
    }

    // 比较两组 RangeSet,经 comparator 通知差异(同步迭代靠 textDiff 把旧位映射到新位)。
    // minPointSize:-1 比较所有区间;>-1 时忽略所有非点区间及更小的点。
    static compare<T extends RangeValue>(
        oldSets: readonly RangeSet<T>[],
        newSets: readonly RangeSet<T>[],
        textDiff: ChangeDesc,
        comparator: RangeComparator<T>,
        minPointSize = -1,
    ) {
        const a = oldSets.filter(set => set.maxPoint > 0 || (!set.isEmpty && set.maxPoint >= minPointSize))
        const b = newSets.filter(set => set.maxPoint > 0 || (!set.isEmpty && set.maxPoint >= minPointSize))
        const sharedChunks = findSharedChunks(a, b, textDiff)

        const sideA = new SpanCursor(a, sharedChunks, minPointSize)
        const sideB = new SpanCursor(b, sharedChunks, minPointSize)

        textDiff.iterGaps((fromA, fromB, length) => compareSpans(sideA, fromA, sideB, fromB, length, comparator))
        if (textDiff.empty && textDiff.length === 0)
            compareSpans(sideA, 0, sideB, 0, 0, comparator)
    }

    // 比较两组 RangeSet 在给定区间是否等价。
    // (gutter 的 gutterLineClass diff 用——阶段2 核心路径无消费者,落 gutter 时再恢复。)

    // 同时遍历一组 RangeSet,对覆盖每段内容的区间通知 iterator;返回迭代结束处的 open 计数。
    // minPointSize:>-1 时只计至少这么大的点。
    static spans<T extends RangeValue>(
        sets: readonly RangeSet<T>[],
        from: number,
        to: number,
        iterator: SpanIterator<T>,
        minPointSize = -1,
    ): number {
        const cursor = new SpanCursor(sets, null, minPointSize).goto(from)
        let pos = from
        let openRanges = cursor.openStart
        for (;;) {
            const curTo = Math.min(cursor.to, to)
            if (cursor.point) {
                const active = cursor.activeForPoint(cursor.to)
                const openCount = cursor.pointFrom < from
                    ? active.length + 1
                    : cursor.point.startSide < 0
                        ? active.length
                        : Math.min(active.length, openRanges)
                iterator.point(pos, curTo, cursor.point, active, openCount, cursor.pointRank)
                openRanges = Math.min(cursor.openEnd(curTo), active.length)
            }
            else if (curTo > pos) {
                iterator.span(pos, curTo, cursor.active, openRanges)
                openRanges = cursor.openEnd(curTo)
            }
            if (cursor.to > to)
                return openRanges + (cursor.point && cursor.to > to ? 1 : 0)
            pos = cursor.to
            cursor.next()
        }
    }

    static of<T extends RangeValue>(ranges: readonly Range<T>[] | Range<T>, sort = false): RangeSet<T> {
        const build = new RangeSetBuilder<T>()
        for (const range of ranges instanceof Range ? [ranges] : sort ? lazySort(ranges) : ranges)
            build.add(range.from, range.to, range.value)
        return build.finish()
    }

    static join<T extends RangeValue>(sets: readonly RangeSet<T>[]): RangeSet<T> {
        if (!sets.length)
            return RangeSet.empty
        let result = sets[sets.length - 1]
        for (let i = sets.length - 2; i >= 0; i--) {
            for (let layer = sets[i]; layer !== RangeSet.empty; layer = layer.nextLayer)
                result = new RangeSet(layer.chunkPos, layer.chunk, result, Math.max(layer.maxPoint, result.maxPoint))
        }
        return result
    }

    // 空集对任意 T 都合法(无区间),但 RangeSet<T> 在 T 上不变(update 消费 Range<T>)。
    // 这是唯一合理的 any:是型变,不是强转。
    static empty: RangeSet<any> = new RangeSet<RangeValue>([], [], null as never, -1)
}

function lazySort<T extends RangeValue>(ranges: readonly Range<T>[]): readonly Range<T>[] {
    if (ranges.length > 1) {
        for (let prev = ranges[0], i = 1; i < ranges.length; i++) {
            const cur = ranges[i]
            if (cmpRange(prev, cur) > 0)
                return ranges.slice().sort(cmpRange)
            prev = cur
        }
    }
    return ranges
}

// 修补出环形结构:空集的 nextLayer 指向自己(isEmpty 判据)。
;(RangeSet.empty as { nextLayer: RangeSet<any> }).nextLayer = RangeSet.empty

export class RangeSetBuilder<T extends RangeValue> {
    private chunks: Chunk<T>[] = []
    private chunkPos: number[] = []
    private chunkStart = -1
    private last: T | null = null
    private lastFrom = -FAR
    private lastTo = -FAR
    private from: number[] | null = []
    private to: number[] = []
    private value: T[] = []
    private maxPoint = -1
    private setMaxPoint = -1
    private nextLayer: RangeSetBuilder<T> | null = null

    private finishChunk(newArrays: boolean) {
        this.chunks.push(new Chunk(this.from!, this.to, this.value, this.maxPoint))
        this.chunkPos.push(this.chunkStart)
        this.chunkStart = -1
        this.setMaxPoint = Math.max(this.setMaxPoint, this.maxPoint)
        this.maxPoint = -1
        if (newArrays) {
            this.from = []
            this.to = []
            this.value = []
        }
    }

    add(from: number, to: number, value: T) {
        if (!this.addInner(from, to, value))
            (this.nextLayer || (this.nextLayer = new RangeSetBuilder())).add(from, to, value)
    }

    addInner(from: number, to: number, value: T) {
        const diff = from - this.lastTo || value.startSide - this.last!.endSide
        if (diff <= 0 && (from - this.lastFrom || value.startSide - this.last!.startSide) < 0)
            throw new Error('区间必须按 from 位置与 startSide 排序后再 add')
        if (diff < 0)
            return false
        if (this.from!.length === CHUNK_SIZE)
            this.finishChunk(true)
        if (this.chunkStart < 0)
            this.chunkStart = from
        this.from!.push(from - this.chunkStart)
        this.to.push(to - this.chunkStart)
        this.last = value
        this.lastFrom = from
        this.lastTo = to
        this.value.push(value)
        if (value.point)
            this.maxPoint = Math.max(this.maxPoint, to - from)
        return true
    }

    addChunk(from: number, chunk: Chunk<T>) {
        if ((from - this.lastTo || chunk.value[0].startSide - this.last!.endSide) < 0)
            return false
        if (this.from!.length)
            this.finishChunk(true)
        this.setMaxPoint = Math.max(this.setMaxPoint, chunk.maxPoint)
        this.chunks.push(chunk)
        this.chunkPos.push(from)
        const last = chunk.value.length - 1
        this.last = chunk.value[last]
        this.lastFrom = chunk.from[last] + from
        this.lastTo = chunk.to[last] + from
        return true
    }

    finish() { return this.finishInner(RangeSet.empty) }

    finishInner(next: RangeSet<T>): RangeSet<T> {
        if (this.from!.length)
            this.finishChunk(false)
        if (this.chunks.length === 0)
            return next
        const result = RangeSet.create(
            this.chunkPos,
            this.chunks,
            this.nextLayer ? this.nextLayer.finishInner(next) : next,
            this.setMaxPoint,
        )
        this.from = null // 之后再 add 会爆,防误用
        return result
    }
}

class LayerCursor<T extends RangeValue> {
    declare from: number
    declare to: number
    declare value: T | null
    declare chunkIndex: number
    declare rangeIndex: number

    constructor(
        readonly layer: RangeSet<T>,
        readonly skip: Set<Chunk<T>> | null,
        readonly minPoint: number,
        readonly rank = 0,
    ) {}

    get startSide() { return this.value ? this.value.startSide : 0 }
    get endSide() { return this.value ? this.value.endSide : 0 }

    goto(pos: number, side: number = -FAR) {
        this.chunkIndex = this.rangeIndex = 0
        this.gotoInner(pos, side, false)
        return this
    }

    gotoInner(pos: number, side: number, forward: boolean) {
        while (this.chunkIndex < this.layer.chunk.length) {
            const next = this.layer.chunk[this.chunkIndex]
            if (!((this.skip && this.skip.has(next))
                || this.layer.chunkEnd(this.chunkIndex) < pos
                || next.maxPoint < this.minPoint)) {
                break
            }
            this.chunkIndex++
            forward = false
        }
        if (this.chunkIndex < this.layer.chunk.length) {
            const rangeIndex = this.layer.chunk[this.chunkIndex].findIndex(pos - this.layer.chunkPos[this.chunkIndex], side, true)
            if (!forward || this.rangeIndex < rangeIndex)
                this.setRangeIndex(rangeIndex)
        }
        this.next()
    }

    forward(pos: number, side: number) {
        if ((this.to - pos || this.endSide - side) < 0)
            this.gotoInner(pos, side, true)
    }

    next() {
        for (;;) {
            if (this.chunkIndex === this.layer.chunk.length) {
                this.from = this.to = FAR
                this.value = null
                break
            }
            else {
                const chunkPos = this.layer.chunkPos[this.chunkIndex]
                const chunk = this.layer.chunk[this.chunkIndex]
                const from = chunkPos + chunk.from[this.rangeIndex]
                this.from = from
                this.to = chunkPos + chunk.to[this.rangeIndex]
                this.value = chunk.value[this.rangeIndex]
                this.setRangeIndex(this.rangeIndex + 1)
                if (this.minPoint < 0 || (this.value.point && this.to - this.from >= this.minPoint))
                    break
            }
        }
    }

    setRangeIndex(index: number) {
        if (index === this.layer.chunk[this.chunkIndex].value.length) {
            this.chunkIndex++
            if (this.skip) {
                while (this.chunkIndex < this.layer.chunk.length && this.skip.has(this.layer.chunk[this.chunkIndex]))
                    this.chunkIndex++
            }
            this.rangeIndex = 0
        }
        else {
            this.rangeIndex = index
        }
    }

    nextChunk() {
        this.chunkIndex++
        this.rangeIndex = 0
        this.next()
    }

    compare(other: LayerCursor<T>) {
        return this.from - other.from || this.startSide - other.startSide || this.rank - other.rank
            || this.to - other.to || this.endSide - other.endSide
    }
}

class HeapCursor<T extends RangeValue> {
    declare from: number
    declare to: number
    declare value: T | null
    declare rank: number

    constructor(readonly heap: LayerCursor<T>[]) {}

    static from<T extends RangeValue>(
        sets: readonly RangeSet<T>[],
        skip: Set<Chunk<T>> | null = null,
        minPoint = -1,
    ): HeapCursor<T> | LayerCursor<T> {
        const heap: LayerCursor<T>[] = []
        for (let i = 0; i < sets.length; i++) {
            for (let cur = sets[i]; !cur.isEmpty; cur = cur.nextLayer) {
                if (cur.maxPoint >= minPoint)
                    heap.push(new LayerCursor(cur, skip, minPoint, i))
            }
        }
        return heap.length === 1 ? heap[0] : new HeapCursor(heap)
    }

    get startSide() { return this.value ? this.value.startSide : 0 }

    goto(pos: number, side: number = -FAR) {
        for (const cur of this.heap) cur.goto(pos, side)
        for (let i = this.heap.length >> 1; i >= 0; i--) heapBubble(this.heap, i)
        this.next()
        return this
    }

    forward(pos: number, side: number) {
        for (const cur of this.heap) cur.forward(pos, side)
        for (let i = this.heap.length >> 1; i >= 0; i--) heapBubble(this.heap, i)
        if ((this.to - pos || this.value!.endSide - side) < 0)
            this.next()
    }

    next() {
        if (this.heap.length === 0) {
            this.from = this.to = FAR
            this.value = null
            this.rank = -1
        }
        else {
            const top = this.heap[0]
            this.from = top.from
            this.to = top.to
            this.value = top.value
            this.rank = top.rank
            if (top.value)
                top.next()
            heapBubble(this.heap, 0)
        }
    }
}

function heapBubble<T extends RangeValue>(heap: LayerCursor<T>[], index: number) {
    for (const cur = heap[index]; ;) {
        let childIndex = (index << 1) + 1
        if (childIndex >= heap.length)
            break
        let child = heap[childIndex]
        if (childIndex + 1 < heap.length && child.compare(heap[childIndex + 1]) >= 0) {
            child = heap[childIndex + 1]
            childIndex++
        }
        if (cur.compare(child) < 0)
            break
        heap[childIndex] = cur
        heap[index] = child
        index = childIndex
    }
}

// 找出两组集合间内容相同(且未被变更触及)的纯区间块,迭代时跳过——只比较真正不同的部分。
function findSharedChunks<T extends RangeValue>(a: readonly RangeSet<T>[], b: readonly RangeSet<T>[], textDiff?: ChangeDesc) {
    const inA = new Map<Chunk<T>, number>()
    for (const set of a) {
        for (let i = 0; i < set.chunk.length; i++) {
            if (set.chunk[i].maxPoint <= 0)
                inA.set(set.chunk[i], set.chunkPos[i])
        }
    }
    const shared = new Set<Chunk<T>>()
    for (const set of b) {
        for (let i = 0; i < set.chunk.length; i++) {
            const known = inA.get(set.chunk[i])
            if (known != null && (textDiff ? textDiff.mapPos(known) : known) === set.chunkPos[i]
                && !textDiff?.touchesRange(known, known + set.chunk[i].length)) {
                shared.add(set.chunk[i])
            }
        }
    }
    return shared
}

// 在一组 RangeSet 上同步推进的游标:维护「当前活跃区间集 active」与「当前点 point」,
// next() 推进到下一个边界(开/关一个区间,或遇到一个点)。spans/compare/eq 的共用引擎。
class SpanCursor<T extends RangeValue> {
    cursor: HeapCursor<T> | LayerCursor<T>

    active: T[] = []
    activeTo: number[] = []
    activeRank: number[] = []
    minActive = -1

    point: T | null = null
    pointFrom = 0
    pointRank = 0

    to = -FAR
    endSide = 0
    openStart = -1

    constructor(sets: readonly RangeSet<T>[], skip: Set<Chunk<T>> | null, readonly minPoint: number) {
        this.cursor = HeapCursor.from(sets, skip, minPoint)
    }

    goto(pos: number, side: number = -FAR) {
        this.cursor.goto(pos, side)
        this.active.length = this.activeTo.length = this.activeRank.length = 0
        this.minActive = -1
        this.to = pos
        this.endSide = side
        this.openStart = -1
        this.next()
        return this
    }

    forward(pos: number, side: number) {
        while (this.minActive > -1 && (this.activeTo[this.minActive] - pos || this.active[this.minActive].endSide - side) < 0)
            this.removeActive(this.minActive)
        this.cursor.forward(pos, side)
    }

    removeActive(index: number) {
        remove(this.active, index)
        remove(this.activeTo, index)
        remove(this.activeRank, index)
        this.minActive = findMinIndex(this.active, this.activeTo)
    }

    addActive(trackOpen: number[] | null) {
        let i = 0
        const { value, to, rank } = this.cursor
        while (i < this.activeRank.length && (rank - this.activeRank[i] || to - this.activeTo[i]) > 0) i++
        insert(this.active, i, value!)
        insert(this.activeTo, i, to)
        insert(this.activeRank, i, rank)
        if (trackOpen)
            insert(trackOpen, i, this.cursor.from)
        this.minActive = findMinIndex(this.active, this.activeTo)
    }

    // 调用后:point != null 则下一段是点;否则是 active 覆盖的普通区间段。
    next() {
        const from = this.to
        const wasPoint = this.point
        this.point = null
        const trackOpen = this.openStart < 0 ? [] : null
        for (;;) {
            const a = this.minActive
            if (a > -1 && (this.activeTo[a] - this.cursor.from || this.active[a].endSide - this.cursor.startSide) < 0) {
                if (this.activeTo[a] > from) {
                    this.to = this.activeTo[a]
                    this.endSide = this.active[a].endSide
                    break
                }
                this.removeActive(a)
                if (trackOpen)
                    remove(trackOpen, a)
            }
            else if (!this.cursor.value) {
                this.to = this.endSide = FAR
                break
            }
            else if (this.cursor.from > from) {
                this.to = this.cursor.from
                this.endSide = this.cursor.startSide
                break
            }
            else {
                const nextVal = this.cursor.value
                if (!nextVal.point) {
                    this.addActive(trackOpen)
                    this.cursor.next()
                }
                else if (wasPoint && this.cursor.to === this.to && this.cursor.from < this.cursor.to) {
                    this.cursor.next()
                }
                else {
                    this.point = nextVal
                    this.pointFrom = this.cursor.from
                    this.pointRank = this.cursor.rank
                    this.to = this.cursor.to
                    this.endSide = nextVal.endSide
                    this.cursor.next()
                    this.forward(this.to, this.endSide)
                    break
                }
            }
        }
        if (trackOpen) {
            this.openStart = 0
            for (let i = trackOpen.length - 1; i >= 0 && trackOpen[i] < from; i--) this.openStart++
        }
    }

    activeForPoint(to: number) {
        if (!this.active.length)
            return this.active
        const active = []
        for (let i = this.active.length - 1; i >= 0; i--) {
            if (this.activeRank[i] < this.pointRank)
                break
            if (this.activeTo[i] > to || (this.activeTo[i] === to && this.active[i].endSide >= this.point!.endSide))
                active.push(this.active[i])
        }
        return active.reverse()
    }

    openEnd(to: number) {
        let open = 0
        for (let i = this.activeTo.length - 1; i >= 0 && this.activeTo[i] > to; i--) open++
        return open
    }
}

function compareSpans<T extends RangeValue>(
    a: SpanCursor<T>,
    startA: number,
    b: SpanCursor<T>,
    startB: number,
    length: number,
    comparator: RangeComparator<T>,
) {
    a.goto(startA)
    b.goto(startB)
    const endB = startB + length
    let pos = startB
    const dPos = startB - startA
    const bounds = !!comparator.boundChange
    for (let boundChange = false; ;) {
        const dEnd = (a.to + dPos) - b.to
        const diff = dEnd || a.endSide - b.endSide
        const end = diff < 0 ? a.to + dPos : b.to
        const clipEnd = Math.min(end, endB)
        const point = a.point || b.point
        if (point) {
            if (!(a.point && b.point && cmpVal(a.point, b.point)
                && sameValues(a.activeForPoint(a.to), b.activeForPoint(b.to)))) {
                comparator.comparePoint(pos, clipEnd, a.point, b.point)
            }
            boundChange = false
        }
        else {
            if (boundChange)
                comparator.boundChange!(pos)
            if (clipEnd > pos && !sameValues(a.active, b.active))
                comparator.compareRange(pos, clipEnd, a.active, b.active)
            if (bounds && clipEnd < endB && (dEnd || a.openEnd(end) !== b.openEnd(end)))
                boundChange = true
        }
        if (end > endB)
            break
        pos = end
        if (diff <= 0)
            a.next()
        if (diff >= 0)
            b.next()
    }
}

function sameValues<T extends RangeValue>(a: T[], b: T[]) {
    if (a.length !== b.length)
        return false
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i] && !cmpVal(a[i], b[i]))
            return false
    }
    return true
}

function remove<T>(array: T[], index: number) {
    for (let i = index, e = array.length - 1; i < e; i++) array[i] = array[i + 1]
    array.pop()
}

function insert<T>(array: T[], index: number, value: T) {
    for (let i = array.length - 1; i >= index; i--) array[i + 1] = array[i]
    array[index] = value
}

function findMinIndex(value: RangeValue[], array: number[]) {
    let found = -1
    let foundPos = FAR
    for (let i = 0; i < array.length; i++) {
        if ((array[i] - foundPos || value[i].endSide - value[found].endSide) < 0) {
            found = i
            foundPos = array[i]
        }
    }
    return found
}
