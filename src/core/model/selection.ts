// Portions of this file are derived from CodeMirror 6 (MIT, Copyright (C) Marijn Haverbeke and others). See THIRD-PARTY-NOTICES.md.
// CM7 Selection —— 选区。重新设计:CM6 把 bidiLevel/assoc/inverted/goalColumn 打包进单个
// flags 整数(位运算坏味道)。CM7 改显式字段 `{anchor,head,assoc,bidiLevel}`。
//
// anchor(锚,不动端)、head(头,移动端)、assoc(光标贴边方向 -1/0/1)是语义必要字段;
// bidiLevel(视觉移动落点所在 bidi span 的层级,null=未知)在阶段2 视图层(bidi.ts moveVisually)
// 接入时作为显式字段加回——它必须随 range 流转(moveVisually 读旧 level、产新 level),挂单独视图态
// 反而割裂这条流转链。goalColumn(竖向移动列锚,null=未设)在阶段4 cursorLineUp/Down 接入时加回:
// 上下移动要记住「原本想停在第几列」,跨过短行后回到长行仍落原列;它随 range 流转(竖向命令读旧
// goal、产带 goal 的新 range,横向命令产 null 清掉),挂单独态会割裂这条链,故作显式字段。
//
// 不变量:EditorSelection.ranges 按 from 升序、非空 range 不重叠(可相触)。
// 唯一例外:`keepOverlap` 选区(Monaco multiCursorMergeOverlapping=false)——仍按 from 升序,但重叠 / 重合的 range 不合并。
// 这条通道是可选的:只有 create(..., true) 产出的选区带它,map / replaceRange / addRange / changeByRange 沿用;
// 默认(false)走原路径,行为不变。

import type { ChangeDesc } from './change'

export class SelectionRange {
    constructor(
        readonly anchor: number,
        readonly head: number,
        readonly assoc: -1 | 0 | 1 = 0,
        readonly bidiLevel: number | null = null,
        readonly goalColumn: number | null = null,
    ) {}

    get from() { return Math.min(this.anchor, this.head) }
    get to() { return Math.max(this.anchor, this.head) }
    get empty() { return this.anchor === this.head }
    get inverted() { return this.head < this.anchor }

    map(change: ChangeDesc, assoc = -1): SelectionRange {
        let anchor: number, head: number
        if (this.empty) {
            anchor = head = change.mapPos(this.anchor, assoc)
        }
        else {
            // 非空区间:from 侧贴后(assoc=1)、to 侧贴前(assoc=-1),保区间不被插入撑开。
            const lo = change.mapPos(this.from, 1)
            const hi = change.mapPos(this.to, -1)
            ;[anchor, head] = this.inverted ? [hi, lo] : [lo, hi]
        }
        if (anchor === this.anchor && head === this.head) return this
        return new SelectionRange(anchor, head, this.assoc, this.bidiLevel, this.goalColumn)
    }

    extend(from: number, to: number = from, assoc: -1 | 0 | 1 = 0) {
        if (from <= this.anchor && to >= this.anchor)
            return EditorSelection.range(from, to, assoc)
        const head = Math.abs(from - this.anchor) > Math.abs(to - this.anchor) ? from : to
        return EditorSelection.range(this.anchor, head, assoc)
    }

    eq(other: SelectionRange, includeAssoc = false): boolean {
        return this.anchor === other.anchor && this.head === other.head
            && (!includeAssoc || !this.empty || this.assoc === other.assoc)
    }

    toJSON(): { anchor: number, head: number, assoc?: number, bidiLevel?: number | null, goalColumn?: number | null } {
        const j: { anchor: number, head: number, assoc?: number, bidiLevel?: number | null, goalColumn?: number | null } = { anchor: this.anchor, head: this.head }
        if (this.assoc) j.assoc = this.assoc
        if (this.bidiLevel !== null) j.bidiLevel = this.bidiLevel
        if (this.goalColumn !== null) j.goalColumn = this.goalColumn
        return j
    }

    static fromJSON(json: unknown): SelectionRange {
        const j = json as { anchor?: unknown, head?: unknown, assoc?: unknown, bidiLevel?: unknown, goalColumn?: unknown }
        if (!j || typeof j.anchor !== 'number' || typeof j.head !== 'number')
            throw new RangeError('SelectionRange JSON 非法')
        return new SelectionRange(
            j.anchor, j.head,
            typeof j.assoc === 'number' ? (j.assoc as -1 | 0 | 1) : 0,
            typeof j.bidiLevel === 'number' ? j.bidiLevel : null,
            typeof j.goalColumn === 'number' ? j.goalColumn : null,
        )
    }
}

/** 光标的创建顺序(Monaco getSelections 的顺序;ranges 内部总是文档序)。键是选区对象,选区被换掉自然失效。 */
// 鼠标选择的起点(Monaco SingleCursorState.selectionStart + selectionStartKind):双击 / 三击后继续拖或 Shift+点,
// 按词 / 按行扩。挂在选区对象上,选区被别的操作换掉即失效。
export const selectionStartInfo = new WeakMap<EditorSelection, { from: number, to: number, kind: 'simple' | 'word' | 'line' }>()
export const selectionCreationOrder = new WeakMap<EditorSelection, readonly SelectionRange[]>()

export class EditorSelection {
    constructor(
        readonly ranges: readonly SelectionRange[],
        readonly mainIndex: number,
        /** true:重叠 / 重合的 range 不合并(multiCursorMergeOverlapping=false) */
        readonly keepOverlap: boolean = false,
    ) {}

    map(change: ChangeDesc, assoc = -1): EditorSelection {
        if (change.empty)
            return this
        return EditorSelection.create(this.ranges.map(r => r.map(change, assoc)), this.mainIndex, this.keepOverlap)
    }

    eq(other: EditorSelection, includeAssoc = false): boolean {
        if (this.ranges.length !== other.ranges.length || this.mainIndex !== other.mainIndex)
            return false
        for (let i = 0; i < this.ranges.length; i++) {
            if (!this.ranges[i].eq(other.ranges[i], includeAssoc))
                return false
        }
        return true
    }

    get main(): SelectionRange { return this.ranges[this.mainIndex] }

    asSingle() {
        return this.ranges.length === 1 ? this : new EditorSelection([this.main], 0)
    }

    addRange(range: SelectionRange, main = true) {
        return EditorSelection.create([range].concat(this.ranges), main ? 0 : this.mainIndex + 1, this.keepOverlap)
    }

    replaceRange(range: SelectionRange, which: number = this.mainIndex) {
        const ranges = this.ranges.slice()
        ranges[which] = range
        return EditorSelection.create(ranges, this.mainIndex, this.keepOverlap)
    }

    toJSON(): { ranges: { anchor: number, head: number }[], main: number } {
        return { ranges: this.ranges.map(r => r.toJSON()), main: this.mainIndex }
    }

    static fromJSON(json: unknown): EditorSelection {
        const j = json as { ranges?: unknown, main?: unknown }
        if (!j || !Array.isArray(j.ranges) || typeof j.main !== 'number' || j.main >= j.ranges.length)
            throw new RangeError('EditorSelection JSON 非法')
        return new EditorSelection(j.ranges.map(r => SelectionRange.fromJSON(r)), j.main)
    }

    static single(anchor: number, head: number = anchor) {
        return new EditorSelection([EditorSelection.range(anchor, head)], 0)
    }

    /** keepOverlap:只按 from 稳定排序,重叠 / 重合的 range 保留(multiCursorMergeOverlapping=false) */
    static create(ranges: readonly SelectionRange[], mainIndex = 0, keepOverlap = false) {
        if (ranges.length === 0)
            throw new RangeError('选区至少有一个 range')
        if (keepOverlap) {
            const main = ranges[mainIndex]
            const sorted = ranges.slice().sort((a, b) => a.from - b.from)
            return new EditorSelection(sorted, sorted.indexOf(main), true)
        }
        for (let pos = 0, i = 0; i < ranges.length; i++) {
            const range = ranges[i]
            if (range.empty ? range.from <= pos : range.from < pos)
                return EditorSelection.normalized(ranges.slice(), mainIndex)
            pos = range.to
        }
        return new EditorSelection(ranges, mainIndex)
    }

    static cursor(pos: number, assoc: -1 | 0 | 1 = 0, bidiLevel: number | null = null, goalColumn: number | null = null) {
        return new SelectionRange(pos, pos, assoc, bidiLevel, goalColumn)
    }

    static range(anchor: number, head: number, assoc: -1 | 0 | 1 = 0, goalColumn: number | null = null) {
        // 非空且未显式给 assoc 时,由方向推默认:正向贴前(-1),反向贴后(1)。
        const a = !assoc && anchor !== head ? (head < anchor ? 1 : -1) : assoc
        return new SelectionRange(anchor, head, a, null, goalColumn)
    }

    static normalized(ranges: SelectionRange[], mainIndex = 0): EditorSelection {
        const main = ranges[mainIndex]
        ranges.sort((a, b) => a.from - b.from)
        mainIndex = ranges.indexOf(main)
        for (let i = 1; i < ranges.length; i++) {
            const range = ranges[i]
            const prev = ranges[i - 1]
            if (range.empty ? range.from <= prev.to : range.from < prev.to) {
                const from = prev.from
                const to = Math.max(range.to, prev.to)
                if (i <= mainIndex)
                    mainIndex--
                ranges.splice(--i, 2, range.inverted ? EditorSelection.range(to, from) : EditorSelection.range(from, to))
            }
        }
        return new EditorSelection(ranges, mainIndex)
    }
}

export function checkSelection(selection: EditorSelection, docLength: number) {
    for (const range of selection.ranges) {
        if (range.to > docLength)
            throw new RangeError('选区超出文档范围')
    }
}
