// Portions of this file are derived from CodeMirror 6 (MIT, Copyright (C) Marijn Haverbeke and others). See THIRD-PARTY-NOTICES.md.
// CM7 HeightMap —— 文档的「垂直几何」模型:把每行/每块的高度组织成一棵平衡树,
//   支持 O(log n) 的「位置→像素」(lineAt) 与「像素→位置」(blockAt) 双向查询。viewport 滚动、
//   光标定位、虚拟化渲染全靠它。是 RangeSet.spans(decorations) 的头号消费者——装饰投影成块高。
//
// 数据结构(逐行移植 CM6 heightmap.ts,§4 港接层,保真 > 砍):
//   HeightOracle —— 度量参数(lineHeight/charWidth/换行),把「长度→高度」的估算集中一处。
//   BlockInfo —— 一个块级元素的不可变快照(from/length/top/height/_content)。查询结果类型。
//   HeightMap(抽象)+ Block/Text/Gap/Branch —— 平衡树节点。Gap=未测量的纯文本段(惰性估高)。
//   NodeBuilder(SpanIterator<Decoration>)—— 把装饰跨度投影成 HeightMap 节点序列。
//   MeasuredHeights —— DOM 实测高度的载体({from, heights[]}),纯数据,合成高度即可测。
//
// 可监测:HeightMap.toString() 直接序列化树形(line(N)/gap(N)/block(N)),全程无 DOM 依赖,
//   合成 oracle + 合成 MeasuredHeights 即可钉死高度代数;heightChangeFlag 暴露读/清以观测重排。
//
// ChangedRange 本地化:extension.ts(协调层)尚未存在,heightmap 只需其 4 字段,先就地定义。
//
// 接线状态:已完整移植 + 测试绿,但**当前无产品消费者**(未在 core/index.ts 导出)。它与 viewport.ts
// 是为「视口虚拟化」预备的几何层,刻意暂不接进 EditorView——接它需复活 CM7 砍掉的 measure 循环
// (DOM 实测行高 → MeasuredHeights → updateHeight)+ 打破 dombridge「children[i]≡doc 行 i」不变量,
// 且 demo 无大文档消费者(元真理:无消费者不接)。触发条件见 [[litcode-cm7-stage3-deferred]]。

import type { ChangeSet } from '../model/change'
import type { DecorationSet, WidgetType } from '../model/decoration'
import type { RangeComparator, SpanIterator } from '../model/rangeset'
import { addRange, BlockType, Decoration, LineDecoration, PointDecoration, ZoneWidget } from '../model/decoration'
import { RangeSet } from '../model/rangeset'
import { Rope } from '../model/rope'

export interface ChangedRange {
    readonly fromA: number
    readonly toA: number
    readonly fromB: number
    readonly toB: number
}

const wrappingWhiteSpace = ['pre-wrap', 'normal', 'pre-line', 'break-spaces']

// updateHeight 期间是否有实测高度发生变化——viewstate 据此决定是否重排。
// eslint-disable-next-line import/no-mutable-exports -- 港接 CM6:updateHeight 是否改了高度的全局观测点
export let heightChangeFlag = false

export function clearHeightChangeFlag() {
    heightChangeFlag = false
}

const EXACT_ROWS_MAX_LINE = 20000
/** 一段 gap 里文本感知估算的字符数上限:再大的 gap(整篇大文件还没渲染的部分)退回按长度线性估 */
const EXACT_GAP_MAX = 200000

const isWide = (c: number) => (c >= 0x1100 && c <= 0x115f) || (c >= 0x2e80 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7a3)
    || (c >= 0xf900 && c <= 0xfaff) || (c >= 0xfe30 && c <= 0xfe6f) || (c >= 0xff00 && c <= 0xff60) || (c >= 0xffe0 && c <= 0xffe6)
    || (c >= 0x1f300 && c <= 0x1faff) || (c >= 0x20000 && c <= 0x3fffd)

/**
 * 等宽文本在 col 列里折成几行,以及最宽那一行占几列(含行尾空格:Monaco 量的是 view line 的 span 宽)。
 * starts 非空时把每个续行的起点(UTF-16 下标)依次推进去。
 */
export function wrapLayout(text: string, col: number, wrapIndent: WrapIndentRule = NO_WRAP_INDENT, starts?: number[]): { rows: number, width: number } {
    if (col < 1) return { rows: 1, width: text.length }
    // 续行缩进(wrappingIndent):none = 0;same = 行首缩进;indent / deepIndent = 行首缩进 + 1 / 2 个缩进单位。缩进占掉 col 的一部分(Monaco:缩进 ≥ 半个列宽就不缩)
    let ind = 0
    if (wrapIndent.mode) {
        for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); if (c === 32) ind++; else if (c === 9) ind += wrapIndent.tab - (ind % wrapIndent.tab); else break }
        ind += (wrapIndent.mode - 1) * wrapIndent.tab
        if (ind * 2 > col) ind = 0
    }
    // x:当前行已占列;bx / bi:最近一个可断点的列 / 下标(-1 = 没有);maxW:已折完的行里最宽的
    let rows = 1, x = 0, bx = -1, bi = -1, maxW = 0
    for (let i = 0; i < text.length; i++) {
        const ci = i
        let c = text.charCodeAt(i)
        if (c >= 0xd800 && c < 0xdc00 && i + 1 < text.length) c = text.codePointAt(i)!, i++
        const wide = isWide(c)
        const w = c === 9 ? 4 - (x % 4) : wide ? 2 : 1
        if (x + w > col) {
            rows++
            if (bx > 0) { if (bx > maxW) maxW = bx; x -= bx; starts?.push(bi) } else { if (x > maxW) maxW = x; x = 0; starts?.push(ci) }
            bx = -1
            x += ind
        }
        x += w
        if (c === 32 || c === 9 || wide || (c === 45 && !(text.charCodeAt(i + 1) >= 48 && text.charCodeAt(i + 1) <= 57))) { bx = x; bi = i + 1 }
    }
    return { rows, width: Math.max(maxW, x) }
}

/** mode:0 none / 1 same / 2 indent / 3 deepIndent;tab:缩进单位(tabSize) */
export interface WrapIndentRule { mode: number, tab: number }
const NO_WRAP_INDENT: WrapIndentRule = { mode: 0, tab: 4 }

export class HeightOracle {
    doc: Rope = Rope.empty
    heightSamples: { [key: number]: boolean } = {}
    lineHeight = 14
    charWidth = 7
    textHeight = 14
    lineLength = 30
    wrapIndent: WrapIndentRule = NO_WRAP_INDENT

    constructor(public lineWrapping: boolean) {}

    /**
     * 折行行数的估计(没渲染过的行):按列数贪心折,和 Monaco 按 wrappingColumn 折、浏览器 break-spaces 折的断点一致
     * (等宽字体;全角算 2 列;空格 / 横线 / 斜线之后、全角字之后可断,放不下的长词按列硬断)。
     * 太长的行不扫(O(字符数)),退回按长度估。渲染过的行用实测高度,不走这里。
     */
    rowsOfLine(from: number, length: number): number {
        const col = this.lineLength
        if (!this.lineWrapping || length * 2 <= col) return 1
        if (length > EXACT_ROWS_MAX_LINE) return 1 + Math.max(0, Math.ceil((length - col) / Math.max(1, col - 5)))
        return wrapLayout(this.doc.sliceString(from, from + length), col, this.wrapIndent).rows
    }

    heightForGap(from: number, to: number): number {
        let lines = this.doc.lineAt(to).number - this.doc.lineAt(from).number + 1
        if (this.lineWrapping)
            lines += Math.max(0, Math.ceil(((to - from) - (lines * this.lineLength * 0.5)) / this.lineLength))
        return this.lineHeight * lines
    }

    // lineHeight:装饰给的整行行高(Monaco decoration.lineHeight),缺省用默认行高。折行时每个视觉行都是这个高。
    heightForLine(length: number, lineHeight = this.lineHeight): number {
        if (!this.lineWrapping)
            return lineHeight
        const lines = 1 + Math.max(0, Math.ceil((length - this.lineLength) / Math.max(1, this.lineLength - 5)))
        return lines * lineHeight
    }

    setDoc(doc: Rope): this {
        this.doc = doc
        return this
    }

    mustRefreshForWrapping(whiteSpace: string): boolean {
        return (wrappingWhiteSpace.includes(whiteSpace)) !== this.lineWrapping
    }

    mustRefreshForHeights(lineHeights: number[]): boolean {
        let newHeight = false
        for (let i = 0; i < lineHeights.length; i++) {
            const h = lineHeights[i]
            if (h < 0) {
                i++
            }
            else if (!this.heightSamples[Math.floor(h * 10)]) {
                newHeight = true
                this.heightSamples[Math.floor(h * 10)] = true
            }
        }
        return newHeight
    }

    refresh(whiteSpace: string, lineHeight: number, charWidth: number, textHeight: number, lineLength: number, knownHeights: number[]): boolean {
        const lineWrapping = wrappingWhiteSpace.includes(whiteSpace)
        const changed = Math.abs(lineHeight - this.lineHeight) > 0.3 || this.lineWrapping !== lineWrapping
            || Math.abs(charWidth - this.charWidth) > 0.1
        this.lineWrapping = lineWrapping
        this.lineHeight = lineHeight
        this.charWidth = charWidth
        this.textHeight = textHeight
        this.lineLength = lineLength
        if (changed) {
            this.heightSamples = {}
            for (let i = 0; i < knownHeights.length; i++) {
                const h = knownHeights[i]
                if (h < 0)
                    i++
                else this.heightSamples[Math.floor(h * 10)] = true
            }
        }
        return changed
    }
}

// DOM 实测高度的载体:heights 是从 from 起的块高序列(负值=widget 上方间距标记)。
export class MeasuredHeights {
    public index = 0
    constructor(readonly from: number, readonly heights: number[]) {}
    get more() { return this.index < this.heights.length }
}

// 一个块级元素的不可变快照。lineAt/blockAt 的查询结果。
export class BlockInfo {
    constructor(
        readonly from: number,
        readonly length: number,
        readonly top: number,
        readonly height: number,
        readonly _content: readonly BlockInfo[] | PointDecoration | number,
        // 行上方的 view zone 空白(不含在 top/height 里:top 是正文顶)
        readonly spaceAbove = 0,
    ) {}

    get type(): BlockType | readonly BlockInfo[] {
        return typeof this._content === 'number'
            ? BlockType.Text
            : Array.isArray(this._content) ? this._content : (this._content as PointDecoration).type
    }

    get to() { return this.from + this.length }
    get bottom() { return this.top + this.height }

    get widget(): WidgetType | null {
        return this._content instanceof PointDecoration ? this._content.widget : null
    }

    get widgetLineBreaks(): number {
        return typeof this._content === 'number' ? this._content : 0
    }

    join(other: BlockInfo) {
        const content = (Array.isArray(this._content) ? this._content : [this])
            .concat(Array.isArray(other._content) ? other._content : [other])
        return new BlockInfo(this.from, this.length + other.length, this.top, this.height + other.height, content)
    }

    toJSON(): { from: number, length: number, top: number, height: number } {
        return { from: this.from, length: this.length, top: this.top, height: this.height }
    }
}

export enum QueryType { ByPos, ByHeight, ByPosNoHeight }

enum Flag { Break = 1, Outdated = 2, SingleLine = 4 }

const Epsilon = 1e-3

export abstract class HeightMap {
    constructor(
        public length: number,
        public height: number,
        public flags: number = Flag.Outdated,
    ) {}

    declare size: number

    get outdated() { return (this.flags & Flag.Outdated) > 0 }
    set outdated(value) { this.flags = (value ? Flag.Outdated : 0) | (this.flags & ~Flag.Outdated) }

    abstract blockAt(height: number, oracle: HeightOracle, top: number, offset: number): BlockInfo
    abstract lineAt(value: number, type: QueryType, oracle: HeightOracle, top: number, offset: number): BlockInfo
    abstract forEachLine(from: number, to: number, oracle: HeightOracle, top: number, offset: number, f: (line: BlockInfo) => void): void

    abstract updateHeight(oracle: HeightOracle, offset?: number, force?: boolean, measured?: MeasuredHeights): HeightMap
    abstract toString(): string

    abstract toJSON(): unknown

    setHeight(height: number) {
        if (this.height !== height) {
            if (Math.abs(this.height - height) > Epsilon)
                heightChangeFlag = true
            this.height = height
        }
    }

    replace(_from: number, _to: number, nodes: (HeightMap | null)[]): HeightMap {
        return HeightMap.of(nodes)
    }

    decomposeLeft(_to: number, result: (HeightMap | null)[]) { result.push(this) }
    decomposeRight(_from: number, result: (HeightMap | null)[]) { result.push(this) }

    applyChanges(decorations: readonly DecorationSet[], oldDoc: Rope, oracle: HeightOracle, changes: readonly ChangedRange[]): HeightMap {
        // eslint-disable-next-line ts/no-this-alias -- me 在循环里逐次 replace 重绑,非纯别名
        let me: HeightMap = this
        const doc = oracle.doc
        for (let i = changes.length - 1; i >= 0; i--) {
            let { fromA, toA, fromB, toB } = changes[i]
            let start = me.lineAt(fromA, QueryType.ByPosNoHeight, oracle.setDoc(oldDoc), 0, 0)
            const end = start.to >= toA ? start : me.lineAt(toA, QueryType.ByPosNoHeight, oracle, 0, 0)
            toB += end.to - toA
            toA = end.to
            while (i > 0 && start.from <= changes[i - 1].toA) {
                fromA = changes[i - 1].fromA
                fromB = changes[i - 1].fromB
                i--
                if (fromA < start.from)
                    start = me.lineAt(fromA, QueryType.ByPosNoHeight, oracle, 0, 0)
            }
            fromB += start.from - fromA
            fromA = start.from
            const nodes = NodeBuilder.build(oracle.setDoc(doc), decorations, fromB, toB)
            me = replace(me, me.replace(fromA, toA, nodes))
        }
        return me.updateHeight(oracle, 0)
    }

    static empty(): HeightMap { return new HeightMapText(0, 0, 0) }

    // nodes 用 null 表示换行;首尾不为 null、不连续两个 null、数组非空。
    static of(nodes: (HeightMap | null)[]): HeightMap {
        if (nodes.length === 1)
            return nodes[0] as HeightMap

        let i = 0
        let j = nodes.length
        let before = 0
        let after = 0
        for (;;) {
            if (i === j) {
                if (before > after * 2) {
                    const split = nodes[i - 1] as HeightMapBranch
                    if (split.break)
                        nodes.splice(--i, 1, split.left, null, split.right)
                    else nodes.splice(--i, 1, split.left, split.right)
                    j += 1 + split.break
                    before -= split.size
                }
                else if (after > before * 2) {
                    const split = nodes[j] as HeightMapBranch
                    if (split.break)
                        nodes.splice(j, 1, split.left, null, split.right)
                    else nodes.splice(j, 1, split.left, split.right)
                    j += 2 + split.break
                    after -= split.size
                }
                else {
                    break
                }
            }
            else if (before < after) {
                const next = nodes[i++]
                if (next)
                    before += next.size
            }
            else {
                const next = nodes[--j]
                if (next)
                    after += next.size
            }
        }

        let brk = 0
        if (nodes[i - 1] == null) {
            brk = 1
            i--
        }
        else if (nodes[i] == null) {
            brk = 1
            j++
        }
        return new HeightMapBranch(HeightMap.of(nodes.slice(0, i)), brk, HeightMap.of(nodes.slice(j)))
    }
}

function replace(old: HeightMap, val: HeightMap) {
    if (old === val)
        return old
    if (old.constructor !== val.constructor)
        heightChangeFlag = true
    return val
}

HeightMap.prototype.size = 1

const SpaceDeco = Decoration.replace({}) as PointDecoration

class HeightMapBlock extends HeightMap {
    spaceAbove = 0

    constructor(length: number, height: number, readonly deco: PointDecoration | null) { super(length, height) }

    mainBlock(top: number, offset: number) {
        return new BlockInfo(offset, this.length, top + this.spaceAbove, this.height - this.spaceAbove, this.deco || 0, this.spaceAbove)
    }

    blockAt(height: number, _oracle: HeightOracle, top: number, offset: number) {
        return this.spaceAbove && height < top + this.spaceAbove
            ? new BlockInfo(offset, 0, top, this.spaceAbove, SpaceDeco)
            : this.mainBlock(top, offset)
    }

    // 行块只含正文:上方的 zone 空白由 spaceAbove 带出,选区 / 行号 / 当前行都不该画进去(Monaco getTopForLineNumber)
    lineAt(_value: number, _type: QueryType, _oracle: HeightOracle, top: number, offset: number) {
        return this.mainBlock(top, offset)
    }

    forEachLine(from: number, to: number, oracle: HeightOracle, top: number, offset: number, f: (line: BlockInfo) => void) {
        if (from <= offset + this.length && to >= offset)
            f(this.lineAt(0, QueryType.ByPos, oracle, top, offset))
    }

    setMeasuredHeight(measured: MeasuredHeights) {
        let next = measured.heights[measured.index++]
        if (next < 0) {
            this.spaceAbove = -next
            next = measured.heights[measured.index++]
        }
        else {
            this.spaceAbove = 0
        }
        this.setHeight(next)
    }

    updateHeight(_oracle: HeightOracle, offset = 0, _force = false, measured?: MeasuredHeights) {
        if (measured && measured.from <= offset && measured.more)
            this.setMeasuredHeight(measured)
        this.outdated = false
        return this
    }

    toString() { return `block(${this.length})` }

    toJSON(): unknown { return { type: 'block', length: this.length, height: this.height } }
}

class HeightMapText extends HeightMapBlock {
    public collapsed = 0
    public widgetHeight = 0
    public breaks = 0
    // 装饰给的 zone 高:没实测时 spaceAbove 取它(实测时 DOM 的 margin-top 也是它投出来的)
    public zone = 0
    // 装饰给的整行行高(px);0 = 用默认行高。多条 lineHeight 装饰落同一行取最大(Monaco LineHeightsManager)
    public customLineHeight = 0

    constructor(length: number, height: number, above: number) {
        super(length, height, null)
        this.spaceAbove = above
    }

    mainBlock(top: number, offset: number) {
        return new BlockInfo(offset, this.length, top + this.spaceAbove, this.height - this.spaceAbove, this.breaks, this.spaceAbove)
    }

    replace(_from: number, _to: number, nodes: (HeightMap | null)[]): HeightMap {
        let node = nodes[0]
        if (nodes.length === 1 && (node instanceof HeightMapText || (node instanceof HeightMapGap && (node.flags & Flag.SingleLine)))
            && Math.abs(this.length - node.length) < 10 && this.zone === (node instanceof HeightMapText ? node.zone : 0)
            && this.customLineHeight === (node instanceof HeightMapText ? node.customLineHeight : 0)) {
            if (node instanceof HeightMapGap)
                node = new HeightMapText(node.length, this.height, this.spaceAbove)
            else node.height = this.height
            if (!this.outdated)
                node.outdated = false
            return node
        }
        else {
            return HeightMap.of(nodes)
        }
    }

    updateHeight(oracle: HeightOracle, offset = 0, force = false, measured?: MeasuredHeights) {
        if (measured && measured.from <= offset && measured.more) {
            this.setMeasuredHeight(measured)
        }
        else if (force || this.outdated) {
            this.spaceAbove = this.zone
            const lh = this.customLineHeight || oracle.lineHeight
            const rows = oracle.lineWrapping && !this.collapsed ? oracle.rowsOfLine(offset, this.length) : 0
            this.setHeight(this.zone + Math.max(this.widgetHeight, rows ? rows * lh : oracle.heightForLine(this.length - this.collapsed, lh))
                + this.breaks * oracle.lineHeight)
        }
        this.outdated = false
        return this
    }

    toString() {
        return `line(${this.length}${this.collapsed ? -this.collapsed : ''}${this.widgetHeight ? `:${this.widgetHeight}` : ''})`
    }

    toJSON(): unknown {
        return { type: 'line', length: this.length, height: this.height, collapsed: this.collapsed || undefined }
    }
}

class HeightMapGap extends HeightMap {
    constructor(length: number) { super(length, 0) }

    private rowCache: { doc: Rope, col: number, wi: WrapIndentRule, offset: number, firstLine: number, prefix: number[] } | null = null

    /** 折行时每行的估计行数的前缀和(prefix[i] = 前 i 行共几行);gap 太大退回线性估(null) */
    private exactRows(oracle: HeightOracle, offset: number): { firstLine: number, prefix: number[] } | null {
        if (!oracle.lineWrapping || this.length > EXACT_GAP_MAX) return null
        const c = this.rowCache
        if (c && c.doc === oracle.doc && c.col === oracle.lineLength && c.wi === oracle.wrapIndent && c.offset === offset) return c
        const doc = oracle.doc
        const firstLine = doc.lineAt(offset).number
        const prefix = [0]
        for (let pos = offset, end = offset + this.length; pos <= end;) {
            const line = doc.lineAt(pos)
            prefix.push(prefix[prefix.length - 1] + oracle.rowsOfLine(line.from, line.length))
            pos = line.to + 1
        }
        const made = { doc, col: oracle.lineLength, wi: oracle.wrapIndent, offset, firstLine, prefix }
        this.rowCache = made
        return made
    }

    private heightMetrics(oracle: HeightOracle, offset: number): {
        firstLine: number
        lastLine: number
        perLine: number
        perChar: number
    } {
        const firstLine = oracle.doc.lineAt(offset).number
        const lastLine = oracle.doc.lineAt(offset + this.length).number
        const lines = lastLine - firstLine + 1
        let perLine
        let perChar = 0
        if (oracle.lineWrapping) {
            const totalPerLine = Math.min(this.height, oracle.lineHeight * lines)
            perLine = totalPerLine / lines
            if (this.length > lines + 1)
                perChar = (this.height - totalPerLine) / (this.length - lines - 1)
        }
        else {
            perLine = this.height / lines
        }
        return { firstLine, lastLine, perLine, perChar }
    }

    blockAt(height: number, oracle: HeightOracle, top: number, offset: number) {
        const ex = this.exactRows(oracle, offset)
        if (ex) {
            const n = ex.prefix.length - 1, rowH = this.height / (ex.prefix[n] || 1)
            let lo = 0, hi = n - 1
            const y = height - top
            while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (ex.prefix[mid] * rowH <= y) lo = mid; else hi = mid - 1 }
            const { from, length } = oracle.doc.line(ex.firstLine + lo)
            return new BlockInfo(from, length, top + ex.prefix[lo] * rowH, (ex.prefix[lo + 1] - ex.prefix[lo]) * rowH, 0)
        }
        const { firstLine, lastLine, perLine, perChar } = this.heightMetrics(oracle, offset)
        if (oracle.lineWrapping) {
            const guess = offset + (height < oracle.lineHeight
                ? 0
                : Math.round(Math.max(0, Math.min(1, (height - top) / this.height)) * this.length))
            const line = oracle.doc.lineAt(guess)
            const lineHeight = perLine + line.length * perChar
            const lineTop = Math.max(top, height - lineHeight / 2)
            return new BlockInfo(line.from, line.length, lineTop, lineHeight, 0)
        }
        else {
            const line = Math.max(0, Math.min(lastLine - firstLine, Math.floor((height - top) / perLine)))
            const { from, length } = oracle.doc.line(firstLine + line)
            return new BlockInfo(from, length, top + perLine * line, perLine, 0)
        }
    }

    lineAt(value: number, type: QueryType, oracle: HeightOracle, top: number, offset: number) {
        if (type === QueryType.ByHeight)
            return this.blockAt(value, oracle, top, offset)
        if (type === QueryType.ByPosNoHeight) {
            const { from, to } = oracle.doc.lineAt(value)
            return new BlockInfo(from, to - from, 0, 0, 0)
        }
        const ex = this.exactRows(oracle, offset)
        if (ex) {
            const line = oracle.doc.lineAt(value), i = line.number - ex.firstLine, rowH = this.height / (ex.prefix[ex.prefix.length - 1] || 1)
            return new BlockInfo(line.from, line.length, top + ex.prefix[i] * rowH, (ex.prefix[i + 1] - ex.prefix[i]) * rowH, 0)
        }
        const { firstLine, perLine, perChar } = this.heightMetrics(oracle, offset)
        const line = oracle.doc.lineAt(value)
        const lineHeight = perLine + line.length * perChar
        const linesAbove = line.number - firstLine
        const lineTop = top + perLine * linesAbove + perChar * (line.from - offset - linesAbove)
        return new BlockInfo(line.from, line.length, Math.max(top, Math.min(lineTop, top + this.height - lineHeight)), lineHeight, 0)
    }

    forEachLine(from: number, to: number, oracle: HeightOracle, top: number, offset: number, f: (line: BlockInfo) => void) {
        from = Math.max(from, offset)
        to = Math.min(to, offset + this.length)
        const ex = this.exactRows(oracle, offset)
        if (ex) {
            const rowH = this.height / (ex.prefix[ex.prefix.length - 1] || 1)
            for (let pos = from; pos <= to;) {
                const line = oracle.doc.lineAt(pos), i = line.number - ex.firstLine
                f(new BlockInfo(line.from, line.length, top + ex.prefix[i] * rowH, (ex.prefix[i + 1] - ex.prefix[i]) * rowH, 0))
                pos = line.to + 1
            }
            return
        }
        const { firstLine, perLine, perChar } = this.heightMetrics(oracle, offset)
        for (let pos = from, lineTop = top; pos <= to;) {
            const line = oracle.doc.lineAt(pos)
            if (pos === from) {
                const linesAbove = line.number - firstLine
                lineTop += perLine * linesAbove + perChar * (from - offset - linesAbove)
            }
            const lineHeight = perLine + perChar * line.length
            f(new BlockInfo(line.from, line.length, lineTop, lineHeight, 0))
            lineTop += lineHeight
            pos = line.to + 1
        }
    }

    replace(from: number, to: number, nodes: (HeightMap | null)[]): HeightMap {
        const after = this.length - to
        if (after > 0) {
            const last = nodes[nodes.length - 1]
            if (last instanceof HeightMapGap)
                nodes[nodes.length - 1] = new HeightMapGap(last.length + after)
            else nodes.push(null, new HeightMapGap(after - 1))
        }
        if (from > 0) {
            const first = nodes[0]
            if (first instanceof HeightMapGap)
                nodes[0] = new HeightMapGap(from + first.length)
            else nodes.unshift(new HeightMapGap(from - 1), null)
        }
        return HeightMap.of(nodes)
    }

    decomposeLeft(to: number, result: (HeightMap | null)[]) {
        result.push(new HeightMapGap(to - 1), null)
    }

    decomposeRight(from: number, result: (HeightMap | null)[]) {
        result.push(null, new HeightMapGap(this.length - from - 1))
    }

    updateHeight(oracle: HeightOracle, offset = 0, force = false, measured?: MeasuredHeights): HeightMap {
        const end = offset + this.length
        if (measured && measured.from <= offset + this.length && measured.more) {
            // 用实测行高填充这段 gap。gap 里不可能有 widget/collapsed(那些会进 heightmap),故纯文本。
            const nodes: (HeightMap | null)[] = []
            let pos = Math.max(offset, measured.from)
            let singleHeight = -1
            if (measured.from > offset)
                nodes.push(new HeightMapGap(measured.from - offset - 1).updateHeight(oracle, offset))
            while (pos <= end && measured.more) {
                const len = oracle.doc.lineAt(pos).length
                if (nodes.length)
                    nodes.push(null)
                let height = measured.heights[measured.index++]
                let above = 0
                if (height < 0) {
                    above = -height
                    height = measured.heights[measured.index++]
                }
                if (singleHeight === -1)
                    singleHeight = height
                else if (Math.abs(height - singleHeight) >= Epsilon)
                    singleHeight = -2
                const line = new HeightMapText(len, height, above)
                line.outdated = false
                nodes.push(line)
                pos += len + 1
            }
            if (pos <= end)
                nodes.push(null, new HeightMapGap(end - pos).updateHeight(oracle, pos))
            const result = HeightMap.of(nodes)
            if (singleHeight < 0 || Math.abs(result.height - this.height) >= Epsilon
                || Math.abs(singleHeight - this.heightMetrics(oracle, offset).perLine) >= Epsilon) {
                heightChangeFlag = true
            }
            return replace(this, result)
        }
        else if (force || this.outdated) {
            const ex = this.exactRows(oracle, offset)
            this.setHeight(ex ? ex.prefix[ex.prefix.length - 1] * oracle.lineHeight : oracle.heightForGap(offset, offset + this.length))
            this.outdated = false
        }
        return this
    }

    toString() { return `gap(${this.length})` }

    toJSON(): unknown { return { type: 'gap', length: this.length, height: this.height } }
}

class HeightMapBranch extends HeightMap {
    size: number

    constructor(public left: HeightMap, brk: number, public right: HeightMap) {
        super(left.length + brk + right.length, left.height + right.height, brk | (left.outdated || right.outdated ? Flag.Outdated : 0))
        this.size = left.size + right.size
    }

    get break() { return this.flags & Flag.Break }

    blockAt(height: number, oracle: HeightOracle, top: number, offset: number) {
        const mid = top + this.left.height
        return height < mid
            ? this.left.blockAt(height, oracle, top, offset)
            : this.right.blockAt(height, oracle, mid, offset + this.left.length + this.break)
    }

    lineAt(value: number, type: QueryType, oracle: HeightOracle, top: number, offset: number) {
        const rightTop = top + this.left.height
        const rightOffset = offset + this.left.length + this.break
        const left = type === QueryType.ByHeight ? value < rightTop : value < rightOffset
        const base = left
            ? this.left.lineAt(value, type, oracle, top, offset)
            : this.right.lineAt(value, type, oracle, rightTop, rightOffset)
        if (this.break || (left ? base.to < rightOffset : base.from > rightOffset))
            return base
        const subQuery = type === QueryType.ByPosNoHeight ? QueryType.ByPosNoHeight : QueryType.ByPos
        if (left)
            return base.join(this.right.lineAt(rightOffset, subQuery, oracle, rightTop, rightOffset))
        else
            return this.left.lineAt(rightOffset, subQuery, oracle, top, offset).join(base)
    }

    forEachLine(from: number, to: number, oracle: HeightOracle, top: number, offset: number, f: (line: BlockInfo) => void) {
        const rightTop = top + this.left.height
        const rightOffset = offset + this.left.length + this.break
        if (this.break) {
            if (from < rightOffset)
                this.left.forEachLine(from, to, oracle, top, offset, f)
            if (to >= rightOffset)
                this.right.forEachLine(from, to, oracle, rightTop, rightOffset, f)
        }
        else {
            const mid = this.lineAt(rightOffset, QueryType.ByPos, oracle, top, offset)
            if (from < mid.from)
                this.left.forEachLine(from, mid.from - 1, oracle, top, offset, f)
            if (mid.to >= from && mid.from <= to)
                f(mid)
            if (to > mid.to)
                this.right.forEachLine(mid.to + 1, to, oracle, rightTop, rightOffset, f)
        }
    }

    replace(from: number, to: number, nodes: (HeightMap | null)[]): HeightMap {
        const rightStart = this.left.length + this.break
        if (to < rightStart)
            return this.balanced(this.left.replace(from, to, nodes), this.right)
        if (from > this.left.length)
            return this.balanced(this.left, this.right.replace(from - rightStart, to - rightStart, nodes))

        const result: (HeightMap | null)[] = []
        if (from > 0)
            this.decomposeLeft(from, result)
        const left = result.length
        for (const node of nodes) result.push(node)
        if (from > 0)
            mergeGaps(result, left - 1)
        if (to < this.length) {
            const right = result.length
            this.decomposeRight(to, result)
            mergeGaps(result, right)
        }
        return HeightMap.of(result)
    }

    decomposeLeft(to: number, result: (HeightMap | null)[]) {
        let left = this.left.length
        if (to <= left)
            return this.left.decomposeLeft(to, result)
        result.push(this.left)
        if (this.break) {
            left++
            if (to >= left)
                result.push(null)
        }
        if (to > left)
            this.right.decomposeLeft(to - left, result)
    }

    decomposeRight(from: number, result: (HeightMap | null)[]) {
        const left = this.left.length
        const right = left + this.break
        if (from >= right)
            return this.right.decomposeRight(from - right, result)
        if (from < left)
            this.left.decomposeRight(from, result)
        if (this.break && from < right)
            result.push(null)
        result.push(this.right)
    }

    balanced(left: HeightMap, right: HeightMap): HeightMap {
        if (left.size > 2 * right.size || right.size > 2 * left.size)
            return HeightMap.of(this.break ? [left, null, right] : [left, right])
        this.left = replace(this.left, left)
        this.right = replace(this.right, right)
        this.setHeight(left.height + right.height)
        this.outdated = left.outdated || right.outdated
        this.size = left.size + right.size
        this.length = left.length + this.break + right.length
        return this
    }

    updateHeight(oracle: HeightOracle, offset = 0, force = false, measured?: MeasuredHeights): HeightMap {
        let { left, right } = this
        const rightStart = offset + left.length + this.break
        let rebalance: HeightMap | null = null
        if (measured && measured.from <= offset + left.length && measured.more)
            rebalance = left = left.updateHeight(oracle, offset, force, measured)
        else
            left.updateHeight(oracle, offset, force)
        if (measured && measured.from <= rightStart + right.length && measured.more)
            rebalance = right = right.updateHeight(oracle, rightStart, force, measured)
        else
            right.updateHeight(oracle, rightStart, force)
        if (rebalance)
            return this.balanced(left, right)
        this.height = this.left.height + this.right.height
        this.outdated = false
        return this
    }

    toString() { return this.left + (this.break ? ' ' : '-') + this.right }

    toJSON(): unknown {
        return { type: 'branch', length: this.length, height: this.height, break: this.break, left: this.left.toJSON(), right: this.right.toJSON() }
    }
}

function mergeGaps(nodes: (HeightMap | null)[], around: number) {
    const before = nodes[around - 1]
    const after = nodes[around + 1]
    if (nodes[around] == null && before instanceof HeightMapGap && after instanceof HeightMapGap)
        nodes.splice(around - 1, 3, new HeightMapGap(before.length + 1 + after.length))
}

const relevantWidgetHeight = 5

class NodeBuilder implements SpanIterator<Decoration> {
    nodes: (HeightMap | null)[] = []
    writtenTo: number
    lineStart = -1
    lineEnd = -1
    covering: HeightMapBlock | null = null

    constructor(public pos: number, public oracle: HeightOracle) {
        this.writtenTo = pos
    }

    get isCovered() {
        return this.covering && this.nodes[this.nodes.length - 1] === this.covering
    }

    span(_from: number, to: number) {
        if (this.lineStart > -1) {
            const end = Math.min(to, this.lineEnd)
            const last = this.nodes[this.nodes.length - 1]
            if (last instanceof HeightMapText)
                last.length += end - this.pos
            else if (end > this.pos || !this.isCovered)
                this.nodes.push(new HeightMapText(end - this.pos, -1, 0))
            this.writtenTo = end
            if (to > end) {
                this.nodes.push(null)
                this.writtenTo++
                this.lineStart = -1
            }
        }
        this.pos = to
    }

    point(from: number, to: number, deco: Decoration) {
        if (deco instanceof LineDecoration) {
            const h = deco.spec.lineHeight
            if (h) { const line = this.ensureLine(); line.customLineHeight = Math.max(line.customLineHeight, h) }
            return
        }
        const point = deco as PointDecoration
        if (point.widget instanceof ZoneWidget) {
            // 文末的 zone(side>0)没有下一行可挂,由 view 加进底部留白
            if (point.startSide < 0) this.ensureLine().zone += point.widget.height
            return
        }
        if (from < to || point.heightRelevant) {
            let height = point.widget ? point.widget.estimatedHeight : 0
            const breaks = point.widget ? point.widget.lineBreaks : 0
            if (height < 0)
                height = this.oracle.lineHeight
            const len = to - from
            if (point.block) {
                this.addBlock(new HeightMapBlock(len, height, point))
            }
            else if (len || breaks || height >= relevantWidgetHeight) {
                this.addLineDeco(height, breaks, len)
            }
        }
        else if (to > from) {
            this.span(from, to)
        }
        if (this.lineEnd > -1 && this.lineEnd < this.pos)
            this.lineEnd = this.oracle.doc.lineAt(this.pos).to
    }

    enterLine() {
        if (this.lineStart > -1)
            return
        const { from, to } = this.oracle.doc.lineAt(this.pos)
        this.lineStart = from
        this.lineEnd = to
        if (this.writtenTo < from) {
            if (this.writtenTo < from - 1 || this.nodes[this.nodes.length - 1] == null)
                this.nodes.push(this.blankContent(this.writtenTo, from - 1))
            this.nodes.push(null)
        }
        if (this.pos > from)
            this.nodes.push(new HeightMapText(this.pos - from, -1, 0))
        this.writtenTo = this.pos
    }

    blankContent(from: number, to: number) {
        const gap = new HeightMapGap(to - from)
        if (this.oracle.doc.lineAt(from).to === to)
            gap.flags |= Flag.SingleLine
        return gap
    }

    ensureLine() {
        this.enterLine()
        const last = this.nodes.length ? this.nodes[this.nodes.length - 1] : null
        if (last instanceof HeightMapText)
            return last
        const line = new HeightMapText(0, -1, 0)
        this.nodes.push(line)
        return line
    }

    addBlock(block: HeightMapBlock) {
        this.enterLine()
        const deco = block.deco
        if (deco && deco.startSide > 0 && !this.isCovered)
            this.ensureLine()
        this.nodes.push(block)
        this.writtenTo = this.pos = this.pos + block.length
        if (deco && deco.endSide > 0)
            this.covering = block
    }

    addLineDeco(height: number, breaks: number, length: number) {
        const line = this.ensureLine()
        line.length += length
        line.collapsed += length
        line.widgetHeight = Math.max(line.widgetHeight, height)
        line.breaks += breaks
        this.writtenTo = this.pos = this.pos + length
    }

    finish(from: number) {
        const last = this.nodes.length === 0 ? null : this.nodes[this.nodes.length - 1]
        if (this.lineStart > -1 && !(last instanceof HeightMapText) && !this.isCovered)
            this.nodes.push(new HeightMapText(0, -1, 0))
        else if (this.writtenTo < this.pos || last == null)
            this.nodes.push(this.blankContent(this.writtenTo, this.pos))
        let pos = from
        for (const node of this.nodes) {
            if (node instanceof HeightMapText)
                node.updateHeight(this.oracle, pos)
            pos += node ? node.length : 1
        }
        return this.nodes
    }

    // 调用区间两侧总是抵到行边界或文档端。返回数组用 null 表示换行,首尾不为 null、不连续两 null。
    static build(oracle: HeightOracle, decorations: readonly DecorationSet[], from: number, to: number): (HeightMap | null)[] {
        const builder = new NodeBuilder(from, oracle)
        RangeSet.spans(decorations, from, to, builder, 0)
        return builder.finish(from)
    }
}

export function heightRelevantDecoChanges(a: readonly DecorationSet[], b: readonly DecorationSet[], diff: ChangeSet) {
    const comp = new DecorationComparator()
    RangeSet.compare(a, b, diff, comp, 0)
    return comp.changes
}

class DecorationComparator implements RangeComparator<Decoration> {
    changes: number[] = []

    compareRange() {}

    comparePoint(from: number, to: number, a: Decoration | null, b: Decoration | null) {
        if (from < to || (a && a.heightRelevant) || (b && b.heightRelevant))
            addRange(from, to, this.changes, 5)
    }
}
