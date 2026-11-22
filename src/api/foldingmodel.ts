// 折叠区域表(Monaco contrib/folding 的 FoldingRegions / FoldingModel / HiddenRangeModel 的等价物)。
//
// 编辑器内部的折叠(core/edit/fold.ts 的 foldField)是「已折叠的起始行集合」,块范围每次现算;这里是它的对象化门面:
// 一张按起始行排好的区域表(行号 + 嵌套父索引 + 折叠位 + 来源),折叠 / 展开 / 递归 / 按层 / 按行匹配 / 跳转都在表上做,
// 每个区域对应模型里的一条装饰(随编辑移动),update(新区域表) 时按装饰当前位置把已折叠、手建的区域并回去。
// 隐藏区间(HiddenRangeModel)订阅它,把折叠区合并成「首行之后到末行」的隐藏行段。
//
// 区域来源可以是任何范围提供者:编辑器自己的缩进 / region 标记 / provider 折叠(foldingRegionsOf)、
// Monaco 形状的 FoldingRegions(只要有 length / toFoldRange(i))、手工给的 FoldRange[]。

import { Emitter } from './context'
import type { IDisposable, IEvent, IRange } from './types'
import type { EditorState } from '../core/index'
import { collectFoldableLines, foldable, foldField } from '../core/edit/fold'

// ───────────── 区域表 ─────────────

export interface ILineRange {
    startLineNumber: number
    endLineNumber: number
}

export const enum FoldSource {
    provider = 0,
    userDefined = 1,
    recovered = 2,
}

export const foldSourceAbbr = {
    [FoldSource.provider]: ' ',
    [FoldSource.userDefined]: 'u',
    [FoldSource.recovered]: 'r',
}

export interface FoldRange {
    startLineNumber: number
    endLineNumber: number
    type: string | undefined
    isCollapsed: boolean
    source: FoldSource
}

export const MAX_FOLDING_REGIONS = 0xFFFF
export const MAX_LINE_NUMBER = 0xFFFFFF
const MASK_INDENT = 0xFF000000

/** 选区起始行落进某段行里吗(折叠时:光标在里面的块不收起) */
export interface SelectedLines {
    startsInside(startLine: number, endLine: number): boolean
}

/** Monaco toSelectedLines:选区的起始行集合 */
export function toSelectedLines(selections: readonly { startLineNumber: number }[] | null): SelectedLines {
    if (!selections || selections.length === 0) return { startsInside: () => false }
    return {
        startsInside(startLine, endLine) {
            for (const s of selections) {
                if (s.startLineNumber >= startLine && s.startLineNumber <= endLine) return true
            }
            return false
        },
    }
}

/** 区域表的只读形态:FoldingRegions 本身,或别处(编辑器自己的 provider)按同形态给的表 */
export interface FoldingRegionsLike {
    readonly length: number
    toFoldRange(index: number): FoldRange
}

class BitField {
    private readonly _states: Uint32Array
    constructor(size: number) { this._states = new Uint32Array(Math.ceil(size / 32)) }
    get(index: number): boolean { return (this._states[(index / 32) | 0] & (1 << (index % 32))) !== 0 }
    set(index: number, state: boolean): void {
        const i = (index / 32) | 0, bit = 1 << (index % 32)
        this._states[i] = state ? this._states[i] | bit : this._states[i] & ~bit
    }
}

export class FoldingRegions implements FoldingRegionsLike {
    private readonly _startIndexes: Uint32Array
    private readonly _endIndexes: Uint32Array
    private readonly _collapseStates: BitField
    private readonly _userDefinedStates: BitField
    private readonly _recoveredStates: BitField
    private _parentsComputed = false
    private readonly _types: Array<string | undefined> | undefined

    constructor(startIndexes: Uint32Array, endIndexes: Uint32Array, types?: Array<string | undefined>) {
        if (startIndexes.length !== endIndexes.length || startIndexes.length > MAX_FOLDING_REGIONS) throw new Error('invalid startIndexes or endIndexes size')
        this._startIndexes = startIndexes
        this._endIndexes = endIndexes
        this._collapseStates = new BitField(startIndexes.length)
        this._userDefinedStates = new BitField(startIndexes.length)
        this._recoveredStates = new BitField(startIndexes.length)
        this._types = types
    }

    // 父索引塞进起止行的高位(起始行高 8 位放低字节,结束行放高字节),一次算出
    private ensureParentIndices(): void {
        if (this._parentsComputed) return
        this._parentsComputed = true
        const parentIndexes: number[] = []
        const isInsideLast = (startLineNumber: number, endLineNumber: number) => {
            const index = parentIndexes[parentIndexes.length - 1]
            return this.getStartLineNumber(index) <= startLineNumber && this.getEndLineNumber(index) >= endLineNumber
        }
        for (let i = 0, len = this._startIndexes.length; i < len; i++) {
            const startLineNumber = this._startIndexes[i]
            const endLineNumber = this._endIndexes[i]
            if (startLineNumber > MAX_LINE_NUMBER || endLineNumber > MAX_LINE_NUMBER) throw new Error('startLineNumber or endLineNumber must not exceed ' + MAX_LINE_NUMBER)
            while (parentIndexes.length > 0 && !isInsideLast(startLineNumber, endLineNumber)) parentIndexes.pop()
            const parentIndex = parentIndexes.length > 0 ? parentIndexes[parentIndexes.length - 1] : -1
            parentIndexes.push(i)
            this._startIndexes[i] = startLineNumber + ((parentIndex & 0xFF) << 24)
            this._endIndexes[i] = endLineNumber + ((parentIndex & 0xFF00) << 16)
        }
    }

    get length(): number { return this._startIndexes.length }
    getStartLineNumber(index: number): number { return this._startIndexes[index] & MAX_LINE_NUMBER }
    getEndLineNumber(index: number): number { return this._endIndexes[index] & MAX_LINE_NUMBER }
    getType(index: number): string | undefined { return this._types ? this._types[index] : undefined }
    hasTypes(): boolean { return !!this._types }
    isCollapsed(index: number): boolean { return this._collapseStates.get(index) }
    setCollapsed(index: number, newState: boolean): void { this._collapseStates.set(index, newState) }

    getSource(index: number): FoldSource {
        if (this._userDefinedStates.get(index)) return FoldSource.userDefined
        if (this._recoveredStates.get(index)) return FoldSource.recovered
        return FoldSource.provider
    }

    setSource(index: number, source: FoldSource): void {
        this._userDefinedStates.set(index, source === FoldSource.userDefined)
        this._recoveredStates.set(index, source === FoldSource.recovered)
    }

    setCollapsedAllOfType(type: string, newState: boolean): boolean {
        let hasChanged = false
        if (this._types) {
            for (let i = 0; i < this._types.length; i++) {
                if (this._types[i] === type) { this.setCollapsed(i, newState); hasChanged = true }
            }
        }
        return hasChanged
    }

    toRegion(index: number): FoldingRegion { return new FoldingRegion(this, index) }

    getParentIndex(index: number): number {
        this.ensureParentIndices()
        const parent = ((this._startIndexes[index] & MASK_INDENT) >>> 24) + ((this._endIndexes[index] & MASK_INDENT) >>> 16)
        return parent === MAX_FOLDING_REGIONS ? -1 : parent
    }

    contains(index: number, line: number): boolean {
        return this.getStartLineNumber(index) <= line && this.getEndLineNumber(index) >= line
    }

    private findIndex(line: number): number {
        let low = 0, high = this._startIndexes.length
        if (high === 0) return -1
        while (low < high) {
            const mid = Math.floor((low + high) / 2)
            if (line < this.getStartLineNumber(mid)) high = mid
            else low = mid + 1
        }
        return low - 1
    }

    /** 含 line 的最内层区域下标,没有 -1 */
    findRange(line: number): number {
        let index = this.findIndex(line)
        if (index >= 0) {
            if (this.getEndLineNumber(index) >= line) return index
            index = this.getParentIndex(index)
            while (index !== -1) {
                if (this.contains(index, line)) return index
                index = this.getParentIndex(index)
            }
        }
        return -1
    }

    toString(): string {
        const res: string[] = []
        for (let i = 0; i < this.length; i++) res[i] = `[${foldSourceAbbr[this.getSource(i)]}${this.isCollapsed(i) ? '+' : '-'}] ${this.getStartLineNumber(i)}/${this.getEndLineNumber(i)}`
        return res.join(', ')
    }

    toFoldRange(index: number): FoldRange {
        return {
            startLineNumber: this._startIndexes[index] & MAX_LINE_NUMBER,
            endLineNumber: this._endIndexes[index] & MAX_LINE_NUMBER,
            type: this._types ? this._types[index] : undefined,
            isCollapsed: this.isCollapsed(index),
            source: this.getSource(index),
        }
    }

    static fromFoldRanges(ranges: FoldRange[]): FoldingRegions {
        const n = ranges.length
        const startIndexes = new Uint32Array(n)
        const endIndexes = new Uint32Array(n)
        let types: Array<string | undefined> | undefined = []
        let gotTypes = false
        for (let i = 0; i < n; i++) {
            startIndexes[i] = ranges[i].startLineNumber
            endIndexes[i] = ranges[i].endLineNumber
            types.push(ranges[i].type)
            if (ranges[i].type) gotTypes = true
        }
        if (!gotTypes) types = undefined
        const regions = new FoldingRegions(startIndexes, endIndexes, types)
        for (let i = 0; i < n; i++) {
            if (ranges[i].isCollapsed) regions.setCollapsed(i, true)
            regions.setSource(i, ranges[i].source)
        }
        return regions
    }

    /**
     * 两路输入(各是 FoldingRegions 或 FoldRange[],都按起始行排好)合并。
     * A = 范围提供者现在给的全部区域;B = 之前折叠过的 + 全部手建的。
     * 起始行相同:B 是手建的取 B,否则取 A 的范围(折叠态沿用 B:行数没变,或选区起始行不在块里);
     * 两边相交时 B 里的手建块赢、A 里被它压住的丢掉。无效项丢掉:行号越界、起始行不递增、和前一项交叉又没被它包含。
     */
    static sanitizeAndMerge(
        rangesA: FoldingRegionsLike | FoldRange[],
        rangesB: FoldingRegionsLike | FoldRange[],
        maxLineNumber: number | undefined,
        selection?: SelectedLines,
    ): FoldRange[] {
        maxLineNumber = maxLineNumber ?? Number.MAX_VALUE
        const indexed = (r: FoldingRegionsLike | FoldRange[]) => Array.isArray(r)
            ? (i: number): FoldRange | undefined => r[i]
            : (i: number): FoldRange | undefined => (i < r.length ? r.toFoldRange(i) : undefined)
        const getA = indexed(rangesA), getB = indexed(rangesB)
        let indexA = 0, indexB = 0
        let nextA = getA(0), nextB = getB(0)

        const stackedRanges: FoldRange[] = []
        let topStackedRange: FoldRange | undefined
        let prevLineNumber = 0
        const resultRanges: FoldRange[] = []

        while (nextA || nextB) {
            let useRange: FoldRange | undefined
            if (nextB && (!nextA || nextA.startLineNumber >= nextB.startLineNumber)) {
                if (nextA && nextA.startLineNumber === nextB.startLineNumber) {
                    if (nextB.source === FoldSource.userDefined) {
                        useRange = nextB // 手建的(可能已展开)
                    } else {
                        // 之前折过的 / 恢复出来的:用 A 的范围;行数没变或选区起始行不在块里,保持折叠
                        useRange = nextA
                        useRange.isCollapsed = nextB.isCollapsed && (nextA.endLineNumber === nextB.endLineNumber || !selection?.startsInside(nextA.startLineNumber + 1, nextA.endLineNumber + 1))
                        useRange.source = FoldSource.provider
                    }
                    nextA = getA(++indexA)
                } else {
                    useRange = nextB
                    if (nextB.isCollapsed && nextB.source === FoldSource.provider) useRange.source = FoldSource.recovered // 之前折过、提供者不再给的块
                }
                nextB = getB(++indexB)
            } else {
                // A 先来:往后看 B 里有没有手建块伸出 A 的末行(有就赢,A 被丢)
                let scanIndex = indexB
                let prescanB = nextB
                while (true) {
                    if (!prescanB || prescanB.startLineNumber > nextA!.endLineNumber) { useRange = nextA; break }
                    if (prescanB.source === FoldSource.userDefined && prescanB.endLineNumber > nextA!.endLineNumber) break
                    prescanB = getB(++scanIndex)
                }
                nextA = getA(++indexA)
            }

            if (useRange) {
                while (topStackedRange && topStackedRange.endLineNumber < useRange.startLineNumber) topStackedRange = stackedRanges.pop()
                if (useRange.endLineNumber > useRange.startLineNumber
                    && useRange.startLineNumber > prevLineNumber
                    && useRange.endLineNumber <= maxLineNumber
                    && (!topStackedRange || topStackedRange.endLineNumber >= useRange.endLineNumber)) {
                    resultRanges.push(useRange)
                    prevLineNumber = useRange.startLineNumber
                    if (topStackedRange) stackedRanges.push(topStackedRange)
                    topStackedRange = useRange
                }
            }
        }
        return resultRanges
    }
}

/** 区域表里的一项(视图对象,字段随表走) */
export class FoldingRegion {
    constructor(private readonly ranges: FoldingRegions, private index: number) {}
    get startLineNumber(): number { return this.ranges.getStartLineNumber(this.index) }
    get endLineNumber(): number { return this.ranges.getEndLineNumber(this.index) }
    get regionIndex(): number { return this.index }
    get parentIndex(): number { return this.ranges.getParentIndex(this.index) }
    get isCollapsed(): boolean { return this.ranges.isCollapsed(this.index) }
    containedBy(range: ILineRange): boolean { return range.startLineNumber <= this.startLineNumber && range.endLineNumber >= this.endLineNumber }
    containsLine(lineNumber: number): boolean { return this.startLineNumber <= lineNumber && lineNumber <= this.endLineNumber }
    hidesLine(lineNumber: number): boolean { return this.startLineNumber < lineNumber && lineNumber <= this.endLineNumber }
}

// ───────────── 模型 + 装饰 ─────────────

/** FoldingModel 要的文本模型(ITextModel 的子集,含装饰跟踪) */
export interface FoldingTextModel {
    getLineCount(): number
    getLineContent(lineNumber: number): string
    getLineMaxColumn(lineNumber: number): number
    getDecorationRange(id: string): IRange | null
}

/** 每个区域的装饰样式 + 改装饰的通道(区域一变就按「折叠 / 展开 / 被藏」换样式) */
export interface IDecorationProvider {
    getDecorationOption(isCollapsed: boolean, isHidden: boolean, isManual: boolean): unknown
    changeDecorations<T>(callback: (changeAccessor: {
        deltaDecorations(oldDecorations: readonly string[], newDecorations: readonly { range: IRange, options: unknown }[]): string[]
        changeDecorationOptions(id: string, newOptions: unknown): void
    }) => T): T | null
    removeDecorations(decorationIds: string[]): void
}

export interface FoldingModelChangeEvent {
    model: FoldingModel
    collapseStateChanged?: FoldingRegion[]
}

interface ILineMemento extends ILineRange {
    checksum?: number
    isCollapsed?: boolean
    source?: FoldSource
}

/** 折叠状态存档(只给持久化用):折叠 / 手建块 + 首尾行校验和 */
export type CollapseMemento = ILineMemento[]

type RegionFilter = (r: FoldingRegion) => boolean
type RegionFilterWithLevel = (r: FoldingRegion, level: number) => boolean

// 31 进制滚动哈希(Monaco base/common/hash 同算法;校验和只在同一实现里比较)
function stringHash(s: string): number {
    let h = 149417 | 0
    h = ((0 << 5) - 0 + h) | 0
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
    return h
}

export class FoldingModel {
    private readonly _textModel: FoldingTextModel
    private readonly _decorationProvider: IDecorationProvider
    private _regions: FoldingRegions
    private _editorDecorationIds: string[] = []
    private readonly _updateEventEmitter = new Emitter<FoldingModelChangeEvent>()
    readonly onDidChange: IEvent<FoldingModelChangeEvent> = this._updateEventEmitter.event

    get regions(): FoldingRegions { return this._regions }
    get textModel(): FoldingTextModel { return this._textModel }
    get decorationProvider(): IDecorationProvider { return this._decorationProvider }

    constructor(textModel: FoldingTextModel, decorationProvider: IDecorationProvider) {
        this._textModel = textModel
        this._decorationProvider = decorationProvider
        this._regions = new FoldingRegions(new Uint32Array(0), new Uint32Array(0))
    }

    /** 翻转这些区域的折叠态(区域在 regions 里的下标即其装饰下标);嵌套、已被藏起的区域按外层折叠态换装饰样式 */
    toggleCollapseState(toggledRegions: FoldingRegion[]): void {
        if (!toggledRegions.length) return
        toggledRegions = toggledRegions.sort((r1, r2) => r1.regionIndex - r2.regionIndex)
        const processed: { [key: string]: boolean | undefined } = {}
        this._decorationProvider.changeDecorations(accessor => {
            let k = 0 // 当前处理到第几个区域
            let dirtyRegionEndLine = -1 // 需要刷新装饰的行段终点
            let lastHiddenLine = -1 // 目前已知被藏起的最后一行
            const updateDecorationsUntil = (index: number) => {
                while (k < index) {
                    const endLineNumber = this._regions.getEndLineNumber(k)
                    const isCollapsed = this._regions.isCollapsed(k)
                    if (endLineNumber <= dirtyRegionEndLine) {
                        const isManual = this.regions.getSource(k) !== FoldSource.provider
                        accessor.changeDecorationOptions(this._editorDecorationIds[k], this._decorationProvider.getDecorationOption(isCollapsed, endLineNumber <= lastHiddenLine, isManual))
                    }
                    if (isCollapsed && endLineNumber > lastHiddenLine) lastHiddenLine = endLineNumber
                    k++
                }
            }
            for (const region of toggledRegions) {
                const index = region.regionIndex
                const id = this._editorDecorationIds[index]
                if (id && !processed[id]) {
                    processed[id] = true
                    updateDecorationsUntil(index)
                    this._regions.setCollapsed(index, !this._regions.isCollapsed(index))
                    dirtyRegionEndLine = Math.max(dirtyRegionEndLine, this._regions.getEndLineNumber(index))
                }
            }
            updateDecorationsUntil(this._regions.length)
        })
        this._updateEventEmitter.fire({ model: this, collapseStateChanged: toggledRegions })
    }

    /** 删掉和这些行段相交的手建块(提供者的块不动) */
    removeManualRanges(ranges: ILineRange[]): void {
        const intersects = (r: FoldRange) => ranges.some(x => !(x.startLineNumber > r.endLineNumber || r.startLineNumber > x.endLineNumber))
        const kept: FoldRange[] = []
        for (let i = 0; i < this._regions.length; i++) {
            const r = this._regions.toFoldRange(i)
            if (r.source === FoldSource.provider || !intersects(r)) kept.push(r)
        }
        this.updatePost(FoldingRegions.fromFoldRanges(kept))
    }

    /**
     * 提供者给出新区域表:折叠过的、手建的区域按它们装饰的当前位置(跟着编辑挪过)并进来;
     * selection 的起始行落在某折叠块里的,那个块展开。
     */
    update(newRegions: FoldingRegionsLike, selection?: SelectedLines): void {
        const foldedOrManualRanges = this._currentFoldedOrManualRanges(selection)
        const newRanges = FoldingRegions.sanitizeAndMerge(newRegions, foldedOrManualRanges, this._textModel.getLineCount(), selection)
        this.updatePost(FoldingRegions.fromFoldRanges(newRanges))
    }

    /** 直接换成这张区域表(装饰整体重建) */
    updatePost(newRegions: FoldingRegions): void {
        const decorations: { range: IRange, options: unknown }[] = []
        let lastHiddenLine = -1
        for (let index = 0, limit = newRegions.length; index < limit; index++) {
            const startLineNumber = newRegions.getStartLineNumber(index)
            const endLineNumber = newRegions.getEndLineNumber(index)
            const isCollapsed = newRegions.isCollapsed(index)
            const isManual = newRegions.getSource(index) !== FoldSource.provider
            decorations.push({
                // 首行行尾 → 末行行尾之后一格:块里改字不动它,在首行行尾后面敲字也不会把它撑开
                range: { startLineNumber, startColumn: this._textModel.getLineMaxColumn(startLineNumber), endLineNumber, endColumn: this._textModel.getLineMaxColumn(endLineNumber) + 1 },
                options: this._decorationProvider.getDecorationOption(isCollapsed, endLineNumber <= lastHiddenLine, isManual),
            })
            if (isCollapsed && endLineNumber > lastHiddenLine) lastHiddenLine = endLineNumber
        }
        this._decorationProvider.changeDecorations(accessor => { this._editorDecorationIds = accessor.deltaDecorations(this._editorDecorationIds, decorations) })
        this._regions = newRegions
        this._updateEventEmitter.fire({ model: this })
    }

    private _currentFoldedOrManualRanges(selection?: SelectedLines): FoldRange[] {
        const out: FoldRange[] = []
        for (let i = 0, limit = this._regions.length; i < limit; i++) {
            let isCollapsed = this.regions.isCollapsed(i)
            const source = this.regions.getSource(i)
            if (isCollapsed || source !== FoldSource.provider) {
                const foldRange = this._regions.toFoldRange(i)
                const decRange = this._textModel.getDecorationRange(this._editorDecorationIds[i])
                if (decRange) {
                    if (isCollapsed && selection?.startsInside(decRange.startLineNumber + 1, decRange.endLineNumber)) isCollapsed = false // 光标在块里:展开
                    out.push({ startLineNumber: decRange.startLineNumber, endLineNumber: decRange.endLineNumber, type: foldRange.type, isCollapsed, source })
                }
            }
        }
        return out
    }

    /** 折叠状态存档(只给持久化用) */
    getMemento(): CollapseMemento | undefined {
        const ranges = this._currentFoldedOrManualRanges()
        const result: ILineMemento[] = []
        const maxLineNumber = this._textModel.getLineCount()
        for (const range of ranges) {
            if (range.startLineNumber >= range.endLineNumber || range.startLineNumber < 1 || range.endLineNumber > maxLineNumber) continue
            result.push({
                startLineNumber: range.startLineNumber, endLineNumber: range.endLineNumber,
                isCollapsed: range.isCollapsed, source: range.source,
                checksum: this._getLinesChecksum(range.startLineNumber + 1, range.endLineNumber),
            })
        }
        return result.length > 0 ? result : undefined
    }

    /** 还原存档(校验和对不上的块不还原) */
    applyMemento(state: CollapseMemento): void {
        if (!Array.isArray(state)) return
        const toRestore: FoldRange[] = []
        const maxLineNumber = this._textModel.getLineCount()
        for (const range of state) {
            if (range.startLineNumber >= range.endLineNumber || range.startLineNumber < 1 || range.endLineNumber > maxLineNumber) continue
            const checksum = this._getLinesChecksum(range.startLineNumber + 1, range.endLineNumber)
            if (!range.checksum || checksum === range.checksum) {
                toRestore.push({ startLineNumber: range.startLineNumber, endLineNumber: range.endLineNumber, type: undefined, isCollapsed: range.isCollapsed ?? true, source: range.source ?? FoldSource.provider })
            }
        }
        this.updatePost(FoldingRegions.fromFoldRanges(FoldingRegions.sanitizeAndMerge(this._regions, toRestore, maxLineNumber)))
    }

    private _getLinesChecksum(lineNumber1: number, lineNumber2: number): number {
        return stringHash(this._textModel.getLineContent(lineNumber1) + this._textModel.getLineContent(lineNumber2)) % 1000000
    }

    dispose(): void {
        this._decorationProvider.removeDecorations(this._editorDecorationIds)
    }

    /** 含这一行的所有区域,由内到外;filter 带层级(1 = 最内层) */
    getAllRegionsAtLine(lineNumber: number, filter?: (r: FoldingRegion, level: number) => boolean): FoldingRegion[] {
        const result: FoldingRegion[] = []
        let index = this._regions.findRange(lineNumber)
        let level = 1
        while (index >= 0) {
            const current = this._regions.toRegion(index)
            if (!filter || filter(current, level)) result.push(current)
            level++
            index = current.parentIndex
        }
        return result
    }

    /** 含这一行的最内层区域 */
    getRegionAtLine(lineNumber: number): FoldingRegion | null {
        const index = this._regions.findRange(lineNumber)
        return index >= 0 ? this._regions.toRegion(index) : null
    }

    /** region 里面的区域(region = null:全部);filter 收 (region) 或 (region, 相对层级) */
    getRegionsInside(region: FoldingRegion | null, filter?: RegionFilter | RegionFilterWithLevel): FoldingRegion[] {
        const result: FoldingRegion[] = []
        const index = region ? region.regionIndex + 1 : 0
        const endLineNumber = region ? region.endLineNumber : Number.MAX_VALUE
        if (filter && filter.length === 2) {
            const levelStack: FoldingRegion[] = []
            for (let i = index, len = this._regions.length; i < len; i++) {
                const current = this._regions.toRegion(i)
                if (this._regions.getStartLineNumber(i) >= endLineNumber) break
                while (levelStack.length > 0 && !current.containedBy(levelStack[levelStack.length - 1])) levelStack.pop()
                levelStack.push(current)
                if ((filter as RegionFilterWithLevel)(current, levelStack.length)) result.push(current)
            }
        } else {
            for (let i = index, len = this._regions.length; i < len; i++) {
                const current = this._regions.toRegion(i)
                if (this._regions.getStartLineNumber(i) >= endLineNumber) break
                if (!filter || (filter as RegionFilter)(current)) result.push(current)
            }
        }
        return result
    }
}

// ───────────── 按行 / 按层 / 跳转 ─────────────

/**
 * 在这些行上折叠 / 展开(翻转)区域。
 * @param levels 层数:1 = 只动这一层,Number.MAX_VALUE = 全部子层
 */
export function toggleCollapseState(foldingModel: FoldingModel, levels: number, lineNumbers: number[]): void {
    const toToggle: FoldingRegion[] = []
    for (const lineNumber of lineNumbers) {
        const region = foldingModel.getRegionAtLine(lineNumber)
        if (region) {
            const doCollapse = !region.isCollapsed
            toToggle.push(region)
            if (levels > 1) toToggle.push(...foldingModel.getRegionsInside(region, (r, level: number) => r.isCollapsed !== doCollapse && level < levels))
        }
    }
    foldingModel.toggleCollapseState(toToggle)
}

/** 折叠 / 展开这些行的区域并向下 levels 层(不给行 = 整张表) */
export function setCollapseStateLevelsDown(foldingModel: FoldingModel, doCollapse: boolean, levels = Number.MAX_VALUE, lineNumbers?: number[]): void {
    const toToggle: FoldingRegion[] = []
    if (lineNumbers && lineNumbers.length > 0) {
        for (const lineNumber of lineNumbers) {
            const region = foldingModel.getRegionAtLine(lineNumber)
            if (region) {
                if (region.isCollapsed !== doCollapse) toToggle.push(region)
                if (levels > 1) toToggle.push(...foldingModel.getRegionsInside(region, (r, level: number) => r.isCollapsed !== doCollapse && level < levels))
            }
        }
    } else {
        toToggle.push(...foldingModel.getRegionsInside(null, (r, level: number) => r.isCollapsed !== doCollapse && level < levels))
    }
    foldingModel.toggleCollapseState(toToggle)
}

/** 折叠 / 展开这些行的区域并向上 levels 层的父区域 */
export function setCollapseStateLevelsUp(foldingModel: FoldingModel, doCollapse: boolean, levels: number, lineNumbers: number[]): void {
    const toToggle: FoldingRegion[] = []
    for (const lineNumber of lineNumbers) toToggle.push(...foldingModel.getAllRegionsAtLine(lineNumber, (region, level) => region.isCollapsed !== doCollapse && level <= levels))
    foldingModel.toggleCollapseState(toToggle)
}

/** 折叠 / 展开这些行的一个区域:最内层已经是目标态就换最近的一个不是的父区域 */
export function setCollapseStateUp(foldingModel: FoldingModel, doCollapse: boolean, lineNumbers: number[]): void {
    const toToggle: FoldingRegion[] = []
    for (const lineNumber of lineNumbers) {
        const regions = foldingModel.getAllRegionsAtLine(lineNumber, region => region.isCollapsed !== doCollapse)
        if (regions.length > 0) toToggle.push(regions[0])
    }
    foldingModel.toggleCollapseState(toToggle)
}

/** 折叠 / 展开第 foldLevel 层(1 = 顶层)所有不含被挡行的区域 */
export function setCollapseStateAtLevel(foldingModel: FoldingModel, foldLevel: number, doCollapse: boolean, blockedLineNumbers: number[]): void {
    const filter = (region: FoldingRegion, level: number) => level === foldLevel && region.isCollapsed !== doCollapse && !blockedLineNumbers.some(line => region.containsLine(line))
    foldingModel.toggleCollapseState(foldingModel.getRegionsInside(null, filter))
}

/** 折叠 / 展开其余所有区域:包含或被包含于「被挡行所在区域」的不动 */
export function setCollapseStateForRest(foldingModel: FoldingModel, doCollapse: boolean, blockedLineNumbers: number[]): void {
    const blocked: FoldingRegion[] = []
    for (const lineNumber of blockedLineNumbers) {
        const regions = foldingModel.getAllRegionsAtLine(lineNumber, undefined)
        if (regions.length > 0) blocked.push(regions[0])
    }
    const filter = (region: FoldingRegion) => blocked.every(b => !b.containedBy(region) && !region.containedBy(b)) && region.isCollapsed !== doCollapse
    foldingModel.toggleCollapseState(foldingModel.getRegionsInside(null, filter))
}

/** 折叠 / 展开起始行匹配正则的区域 */
export function setCollapseStateForMatchingLines(foldingModel: FoldingModel, regExp: RegExp, doCollapse: boolean): void {
    const regions = foldingModel.regions
    const toToggle: FoldingRegion[] = []
    for (let i = regions.length - 1; i >= 0; i--) {
        if (doCollapse !== regions.isCollapsed(i) && regExp.test(foldingModel.textModel.getLineContent(regions.getStartLineNumber(i)))) toToggle.push(regions.toRegion(i))
    }
    foldingModel.toggleCollapseState(toToggle)
}

/** 折叠 / 展开某类型(注释 / region 等)的区域 */
export function setCollapseStateForType(foldingModel: FoldingModel, type: string, doCollapse: boolean): void {
    const regions = foldingModel.regions
    const toToggle: FoldingRegion[] = []
    for (let i = regions.length - 1; i >= 0; i--) {
        if (doCollapse !== regions.isCollapsed(i) && type === regions.getType(i)) toToggle.push(regions.toRegion(i))
    }
    foldingModel.toggleCollapseState(toToggle)
}

/** 跳到父区域:不在起始行 → 本区域起始行;在起始行 → 父区域起始行(没有 null) */
export function getParentFoldLine(lineNumber: number, foldingModel: FoldingModel): number | null {
    let startLineNumber: number | null = null
    const foldingRegion = foldingModel.getRegionAtLine(lineNumber)
    if (foldingRegion !== null) {
        startLineNumber = foldingRegion.startLineNumber
        if (lineNumber === startLineNumber) {
            const parent = foldingRegion.parentIndex
            startLineNumber = parent !== -1 ? foldingModel.regions.getStartLineNumber(parent) : null
        }
    }
    return startLineNumber
}

/** 跳到同层上一个区域起始行(不在起始行 → 这行之前最后一个区域的起始行) */
export function getPreviousFoldLine(lineNumber: number, foldingModel: FoldingModel): number | null {
    let foldingRegion = foldingModel.getRegionAtLine(lineNumber)
    if (foldingRegion !== null && foldingRegion.startLineNumber === lineNumber) {
        // 在起始行:找同一个父下的上一个兄弟
        const expectedParentIndex = foldingRegion.parentIndex
        let minLineNumber = 0
        if (expectedParentIndex !== -1) minLineNumber = foldingModel.regions.getStartLineNumber(foldingRegion.parentIndex)
        while (foldingRegion !== null) {
            if (foldingRegion.regionIndex > 0) {
                foldingRegion = foldingModel.regions.toRegion(foldingRegion.regionIndex - 1)
                if (foldingRegion.startLineNumber <= minLineNumber) return null
                if (foldingRegion.parentIndex === expectedParentIndex) return foldingRegion.startLineNumber
            } else return null
        }
    } else if (foldingModel.regions.length > 0) {
        // 不在起始行:这行之前最后一个区域
        foldingRegion = foldingModel.regions.toRegion(foldingModel.regions.length - 1)
        while (foldingRegion !== null) {
            if (foldingRegion.startLineNumber < lineNumber) return foldingRegion.startLineNumber
            foldingRegion = foldingRegion.regionIndex > 0 ? foldingModel.regions.toRegion(foldingRegion.regionIndex - 1) : null
        }
    }
    return null
}

/** 跳到同层下一个区域起始行(不在起始行 → 这行之后第一个区域的起始行) */
export function getNextFoldLine(lineNumber: number, foldingModel: FoldingModel): number | null {
    let foldingRegion = foldingModel.getRegionAtLine(lineNumber)
    if (foldingRegion !== null && foldingRegion.startLineNumber === lineNumber) {
        const expectedParentIndex = foldingRegion.parentIndex
        let maxLineNumber = 0
        if (expectedParentIndex !== -1) maxLineNumber = foldingModel.regions.getEndLineNumber(foldingRegion.parentIndex)
        else if (foldingModel.regions.length === 0) return null
        else maxLineNumber = foldingModel.regions.getEndLineNumber(foldingModel.regions.length - 1)
        while (foldingRegion !== null) {
            if (foldingRegion.regionIndex < foldingModel.regions.length) {
                foldingRegion = foldingModel.regions.toRegion(foldingRegion.regionIndex + 1)
                if (foldingRegion.startLineNumber >= maxLineNumber) return null
                if (foldingRegion.parentIndex === expectedParentIndex) return foldingRegion.startLineNumber
            } else return null
        }
    } else if (foldingModel.regions.length > 0) {
        foldingRegion = foldingModel.regions.toRegion(0)
        while (foldingRegion !== null) {
            if (foldingRegion.startLineNumber > lineNumber) return foldingRegion.startLineNumber
            foldingRegion = foldingRegion.regionIndex < foldingModel.regions.length ? foldingModel.regions.toRegion(foldingRegion.regionIndex + 1) : null
        }
    }
    return null
}

// ───────────── 隐藏区间 ─────────────

function isInside(line: number, range: ILineRange): boolean {
    return line >= range.startLineNumber && line <= range.endLineNumber
}

function findRange(ranges: IRange[], line: number): IRange | null {
    // 区间按起始行升序且互不相交:二分找最后一个起始行 ≤ line 的
    let lo = 0, hi = ranges.length
    while (lo < hi) {
        const mid = (lo + hi) >> 1
        if (line < ranges[mid].startLineNumber) hi = mid
        else lo = mid + 1
    }
    const i = lo - 1
    return i >= 0 && ranges[i].endLineNumber >= line ? ranges[i] : null
}

/**
 * 折叠区 → 隐藏行段(块首行本身可见,藏的是「首行之后到末行」整行),嵌套在已折叠块里的不重复算。
 * 订阅 FoldingModel.onDidChange;变了才触发自己的 onDidChange(带整套新区间)。
 */
export class HiddenRangeModel {
    private readonly _foldingModel: FoldingModel
    private _hiddenRanges: IRange[] = []
    private _foldingModelListener: IDisposable | null
    private readonly _updateEventEmitter = new Emitter<IRange[]>()
    private _hasLineChanges = false

    get onDidChange(): IEvent<IRange[]> { return this._updateEventEmitter.event }
    get hiddenRanges(): IRange[] { return this._hiddenRanges }

    constructor(model: FoldingModel) {
        this._foldingModel = model
        this._foldingModelListener = model.onDidChange(() => this.updateHiddenRanges())
        if (model.regions.length) this.updateHiddenRanges()
    }

    /** 模型内容变了:有换行的改动 → 下次更新必发事件(隐藏行号变了,即使区间看起来一样) */
    notifyChangeModelContent(e: { changes: readonly { range: ILineRange, text: string }[] }): void {
        if (this._hiddenRanges.length && !this._hasLineChanges) {
            this._hasLineChanges = e.changes.some(change => change.range.endLineNumber !== change.range.startLineNumber || /[\r\n]/.test(change.text))
        }
    }

    private updateHiddenRanges(): void {
        let updateHiddenAreas = false
        const newHiddenAreas: IRange[] = []
        let k = 0
        let lastCollapsedStart = Number.MAX_VALUE
        let lastCollapsedEnd = -1
        const ranges = this._foldingModel.regions
        for (let i = 0; i < ranges.length; i++) {
            if (!ranges.isCollapsed(i)) continue
            const startLineNumber = ranges.getStartLineNumber(i) + 1 // 首行不藏
            const endLineNumber = ranges.getEndLineNumber(i)
            if (lastCollapsedStart <= startLineNumber && endLineNumber <= lastCollapsedEnd) continue // 在已折叠块里的不算
            if (!updateHiddenAreas && k < this._hiddenRanges.length && this._hiddenRanges[k].startLineNumber === startLineNumber && this._hiddenRanges[k].endLineNumber === endLineNumber) {
                newHiddenAreas.push(this._hiddenRanges[k]) // 区间没变,沿用旧对象
                k++
            } else {
                updateHiddenAreas = true
                newHiddenAreas.push({ startLineNumber, startColumn: 1, endLineNumber, endColumn: 1 })
            }
            lastCollapsedStart = startLineNumber
            lastCollapsedEnd = endLineNumber
        }
        if (this._hasLineChanges || updateHiddenAreas || k < this._hiddenRanges.length) {
            this._hiddenRanges = newHiddenAreas
            this._hasLineChanges = false
            this._updateEventEmitter.fire(newHiddenAreas)
        }
    }

    hasRanges(): boolean { return this._hiddenRanges.length > 0 }
    isHidden(line: number): boolean { return findRange(this._hiddenRanges, line) !== null }

    /** 落在隐藏行里的选区端点挪到所在隐藏段上一行(块首行)的行尾;返回有没有改 */
    adjustSelections<S extends { startLineNumber: number, endLineNumber: number, setStartPosition(l: number, c: number): S, setEndPosition(l: number, c: number): S }>(selections: S[]): boolean {
        let hasChanges = false
        const editorModel = this._foldingModel.textModel
        let lastRange: IRange | null = null
        const adjustLine = (line: number) => {
            if (!lastRange || !isInside(line, lastRange)) lastRange = findRange(this._hiddenRanges, line)
            return lastRange ? lastRange.startLineNumber - 1 : null
        }
        for (let i = 0, len = selections.length; i < len; i++) {
            let selection = selections[i]
            const adjustedStartLine = adjustLine(selection.startLineNumber)
            if (adjustedStartLine) {
                selection = selection.setStartPosition(adjustedStartLine, editorModel.getLineMaxColumn(adjustedStartLine))
                hasChanges = true
            }
            const adjustedEndLine = adjustLine(selection.endLineNumber)
            if (adjustedEndLine) {
                selection = selection.setEndPosition(adjustedEndLine, editorModel.getLineMaxColumn(adjustedEndLine))
                hasChanges = true
            }
            selections[i] = selection
        }
        return hasChanges
    }

    dispose(): void {
        if (this._hiddenRanges.length > 0) {
            this._hiddenRanges = []
            this._updateEventEmitter.fire(this._hiddenRanges)
        }
        this._foldingModelListener?.dispose()
        this._foldingModelListener = null
    }
}

// ───────────── 编辑器自己的区域 ─────────────

/**
 * 编辑器当前的折叠区域(缩进 / region 标记 / provider / 手建块,已按 Monaco 规则合并)做成区域表,
 * 已折叠的起始行带着折叠态。可直接喂给 FoldingModel.update。
 */
export function foldingRegionsOf(state: EditorState): FoldingRegions {
    const doc = state.doc
    const folded = state.field(foldField, false)
    const ranges: FoldRange[] = []
    for (const n of [...new Set(collectFoldableLines(state))].sort((a, b) => a - b)) {
        const f = foldable(state, doc.line(n).from)
        if (!f) continue
        const end = doc.lineAt(f.to).number
        if (end > n) ranges.push({ startLineNumber: n, endLineNumber: end, type: undefined, isCollapsed: !!folded?.has(n), source: FoldSource.provider })
    }
    return FoldingRegions.fromFoldRanges(ranges)
}
