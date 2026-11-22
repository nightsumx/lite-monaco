// Portions of this file are derived from CodeMirror 6 (MIT, Copyright (C) Marijn Haverbeke and others). See THIRD-PARTY-NOTICES.md.
// CM7 Decoration —— 把「怎么画/怎么排版一段内容」关联到文档区间的值类型。它是 RangeValue 子类,
//   被 RangeSet 承载、被 heightmap 的 RangeSet.spans 投影成块高度、被 buildtile 投影成 DOM。
//
// 数据结构(逐行移植 CM6 decoration.ts):
//   WidgetType —— 一个 widget 的「描述对象」,延迟建 DOM。heightmap 只读 estimatedHeight/lineBreaks。
//   Decoration(抽象,extends RangeValue)—— startSide/endSide/widget/spec + point/heightRelevant。
//   PointDecoration —— widget/replace/block 装饰(point=true,空区间也有意义)。
//   Side 稠密编码 —— 把「块/行内 × 前/后 × 含/不含边界」全压进一个数轴,排序即得正确叠放序。
//
// 阶段2 buildtile 恢复:MarkDecoration(行内 tagName/attrs,split 嵌套)、LineDecoration(行属性)。
// 仍砍:toDOM/updateDOM/coordsAt/ignoreEvent/destroy(要 EditorView/Rect)、bidiIsolate、BlockWrapper。
//
// 可监测:装饰是不透明用户对象,枚举(RangeSet.between/spans)即可监测面;Side 编码全是显式常量。

import type { RangeSet } from './rangeset'
import { MapMode } from './change'
import { RangeValue } from './rangeset'

// 一组装饰。heightmap 的 RangeSet.spans/compare 吃的就是它。
export type DecorationSet = RangeSet<Decoration>

// widget 的描述对象。heightmap 只读 estimatedHeight/lineBreaks；materialize 调 toDOM 产 DOM 节点。
export abstract class WidgetType {
    eq(_widget: WidgetType): boolean { return false }

    compare(other: WidgetType): boolean {
        return this === other || (this.constructor === other.constructor && this.eq(other))
    }

    // 内容未绘制时用于估高,返回 -1 表示未知。
    get estimatedHeight(): number { return -1 }

    // 行内 widget(以 inline 而非 inline-block 显示)引入的换行数。
    get lineBreaks(): number { return 0 }

    // 行内 widget 画出来的纯文本(Monaco 注入文字 before/after)。无布局的折行模型据此给它占宽、可被折断;非文本 widget 为 null。
    get inlineText(): string | null { return null }

    // 物化成 DOM 节点。materialize 调此方法产出真 DOM。
    abstract toDOM(): Node
}

// view zone(Monaco IViewZone):行与行之间的一段空白。挂在下一行行首(side<0)或文末(side>0),
// heightmap 把它记成那一行的 spaceAbove,buildtile 投成那一行的 margin-top,本身不出 DOM。
export class ZoneWidget extends WidgetType {
    constructor(readonly height: number, readonly id = '') { super() }
    eq(other: ZoneWidget) { return other.height === this.height && other.id === this.id }
    get estimatedHeight() { return this.height }
    toDOM(): Node { return document.createElement('div') }
}

// Side 稠密编码:把装饰相对位置的所有维度(块/行内、前/后、含/不含边界)压进一个数轴。
// 排序时 startSide/endSide 直接比较即得正确的叠放/分裂顺序——这是整个装饰系统的代数核心。
const Side = {
    NonIncEnd: -6e8, // 不含边界区间的结束
    GapStart: -5e8,
    BlockBefore: -4e8, // + widget side(块 widget 在前)
    BlockIncStart: -3e8, // 含边界块区间的开始
    Line: -2e8, // 行 widget
    InlineBefore: -1e8, // + widget side(行内 widget 在前)
    InlineIncStart: -1, // 含边界行内区间的开始
    InlineIncEnd: 1, // 含边界行内区间的结束
    InlineAfter: 1e8, // + widget side(行内 widget 在后)
    BlockIncEnd: 2e8, // 含边界块区间的结束
    BlockAfter: 3e8, // + widget side(块 widget 在后)
    GapEnd: 4e8,
    NonIncStart: 5e8, // 不含边界区间的开始
}

// 编辑器视图里可能出现的块类型。
export enum BlockType {
    Text, // 一行文本
    WidgetBefore, // 关联到其后位置的块 widget
    WidgetAfter, // 关联到其前位置的块 widget
    WidgetRange, // 替换一段内容的块 widget
}

interface WidgetDecorationSpec {
    widget: WidgetType
    side?: number
    inlineOrder?: boolean
    block?: boolean
    [other: string]: unknown
}

interface ReplaceDecorationSpec {
    widget?: WidgetType
    inclusive?: boolean
    inclusiveStart?: boolean
    inclusiveEnd?: boolean
    block?: boolean
    isBlockGap?: boolean
    [other: string]: unknown
}

// 行内样式装饰 spec:tagName 默认 span;class 是 attributes.class 的简写。
interface MarkDecorationSpec {
    inclusive?: boolean
    inclusiveStart?: boolean
    inclusiveEnd?: boolean
    tagName?: string
    class?: string
    attributes?: Attrs
    [other: string]: unknown
}

export interface LineDecorationSpec {
    class?: string
    attributes?: Attrs
    /** 加在这一行的 gutter 行上(Monaco marginClassName) */
    gutterClass?: string
    /** 行号右侧 lineDecorations 列里的元素类(Monaco linesDecorationsClassName) */
    gutterMarker?: string
    /** 字形边距(glyph margin)里的元素类(Monaco glyphMarginClassName);H2 的装饰写入,画不画由 view 的字形边距槽位决定 */
    glyphClass?: string
    /** glyphMargin.position:1 左 / 2 中 / 3 右(Monaco GlyphMarginLane) */
    glyphLane?: number
    /** glyphMarginHoverMessage(IMarkdownString[]) */
    glyphHover?: unknown
    /** 整行行高(px,Monaco IModelDecorationOptions.lineHeight):heightmap 估高用它代替 oracle.lineHeight,多条取最大;DOM 样式由 attributes 另带 */
    lineHeight?: number
    [other: string]: unknown
}

// 装饰:描述如何绘制/排版一段内容。通常包进 Range(加起止位置)使用。
export abstract class Decoration extends RangeValue {
    protected constructor(
        readonly startSide: number,
        readonly endSide: number,
        readonly widget: WidgetType | null,
        readonly spec: unknown,
    ) { super() }

    declare point: boolean

    get heightRelevant() { return false }

    abstract eq(other: Decoration): boolean

    // widget 装饰:在给定位置画一个 DOM 元素。
    static widget(spec: WidgetDecorationSpec): Decoration {
        let side = Math.max(-10000, Math.min(10000, spec.side || 0))
        const block = !!spec.block
        side += (block && !spec.inlineOrder)
            ? (side > 0 ? Side.BlockAfter : Side.BlockBefore)
            : (side > 0 ? Side.InlineAfter : Side.InlineBefore)
        return new PointDecoration(spec, side, side, block, spec.widget || null, false)
    }

    // replace 装饰:用 widget 替换给定区间,或单纯隐藏它。
    static replace(spec: ReplaceDecorationSpec): Decoration {
        const block = !!spec.block
        let startSide: number, endSide: number
        if (spec.isBlockGap) {
            startSide = Side.GapStart
            endSide = Side.GapEnd
        }
        else {
            const { start, end } = getInclusive(spec, block)
            startSide = (start ? (block ? Side.BlockIncStart : Side.InlineIncStart) : Side.NonIncStart) - 1
            endSide = (end ? (block ? Side.BlockIncEnd : Side.InlineIncEnd) : Side.NonIncEnd) + 1
        }
        return new PointDecoration(spec, startSide, endSide, block, spec.widget || null, true)
    }

    // 行内样式装饰:用 tagName/attrs 包裹区间。低优先级装饰/换行会把它切开 → 嵌套 DOM。
    static mark(spec: MarkDecorationSpec): Decoration {
        return new MarkDecoration(spec)
    }

    // 行装饰:给某行起点所在的行容器加属性(零长区间)。
    static line(spec: LineDecorationSpec): Decoration {
        return new LineDecoration(spec)
    }

    // 空装饰集。(RangeSet.empty 即可,落 DecorationSet 类型别名时再桥接。)

    hasHeight() { return this.widget ? this.widget.estimatedHeight > -1 : false }
}

export class PointDecoration extends Decoration {
    constructor(
        spec: unknown,
        startSide: number,
        endSide: number,
        readonly block: boolean,
        widget: WidgetType | null,
        readonly isReplace: boolean,
    ) {
        super(startSide, endSide, widget, spec)
        this.mapMode = !block ? MapMode.TrackDel : startSide <= 0 ? MapMode.TrackBefore : MapMode.TrackAfter
    }

    // 仅当 block 时有意义。
    get type() {
        return this.startSide !== this.endSide
            ? BlockType.WidgetRange
            : this.startSide <= 0 ? BlockType.WidgetBefore : BlockType.WidgetAfter
    }

    get heightRelevant() {
        return this.block || (!!this.widget && (this.widget.estimatedHeight >= 5 || this.widget.lineBreaks > 0))
    }

    eq(other: Decoration): boolean {
        return other instanceof PointDecoration
            && widgetsEq(this.widget, other.widget)
            && this.block === other.block
            && this.startSide === other.startSide && this.endSide === other.endSide
    }

    range(from: number, to = from) {
        if (this.isReplace && (from > to || (from === to && this.startSide > 0 && this.endSide <= 0)))
            throw new RangeError('replace 装饰区间非法')
        if (!this.isReplace && to !== from)
            throw new RangeError('widget 装饰只能是零长区间')
        return super.range(from, to)
    }
}

PointDecoration.prototype.point = true

// DOM 属性表。buildtile 把 mark/line 的 attrs 投影成 tile 上的纯数据(不碰真 DOM)。
export interface Attrs { [name: string]: string }

const noAttrs: Attrs = Object.create(null)

export function combineAttrs(source: Attrs, target: Attrs): Attrs {
    for (const name in source) {
        if (name === 'class' && target.class)
            target.class += ` ${source.class}`
        else if (name === 'style' && target.style)
            target.style += `;${source.style}`
        else target[name] = source[name]
    }
    return target
}

export function attrsEq(a: Attrs | null, b: Attrs | null): boolean {
    if (a === b)
        return true
    const x = a || noAttrs
    const y = b || noAttrs
    const keysA = Object.keys(x)
    const keysB = Object.keys(y)
    if (keysA.length !== keysB.length)
        return false
    for (const key of keysA) {
        if (!keysB.includes(key) || x[key] !== y[key])
            return false
    }
    return true
}

// 行内样式装饰:point=false,被 RangeSet 当区间区段处理,buildtile 据 active 列表嵌套成 MarkTile。
export class MarkDecoration extends Decoration {
    readonly tagName: string
    readonly attrs: Attrs

    constructor(spec: MarkDecorationSpec) {
        const { start, end } = getInclusive(spec)
        super(
            start ? Side.InlineIncStart : Side.NonIncStart,
            end ? Side.InlineIncEnd : Side.NonIncEnd,
            null,
            spec,
        )
        this.tagName = spec.tagName || 'span'
        this.attrs = spec.class && spec.attributes
            ? combineAttrs(spec.attributes, { class: spec.class })
            : spec.class ? { class: spec.class } : spec.attributes || noAttrs
    }

    eq(other: Decoration): boolean {
        return this === other
            || (other instanceof MarkDecoration && this.tagName === other.tagName && attrsEq(this.attrs, other.attrs))
    }

    range(from: number, to = from) {
        if (from >= to)
            throw new RangeError('mark 装饰区间不能为空')
        return super.range(from, to)
    }
}

MarkDecoration.prototype.point = false

// 行装饰:零长 point,给整行容器加属性。buildtile 在行起点把 attrs 合进 LineTile。
export class LineDecoration extends Decoration {
    declare readonly spec: LineDecorationSpec
    constructor(spec: LineDecorationSpec) {
        super(Side.Line, Side.Line, null, spec)
        this.mapMode = MapMode.TrackBefore
    }

    // 自定义行高会改块高,heightmap 必须重算这一行
    get heightRelevant() { return !!this.spec.lineHeight }

    eq(other: Decoration): boolean {
        if (!(other instanceof LineDecoration)) return false
        const a = this.spec
        const b = other.spec
        return a.class === b.class
            && a.gutterClass === b.gutterClass
            && a.gutterMarker === b.gutterMarker
            && a.glyphClass === b.glyphClass && a.glyphLane === b.glyphLane && a.glyphHover === b.glyphHover
            && a.lineHeight === b.lineHeight
            && attrsEq(a.attributes ?? null, b.attributes ?? null)
    }

    range(from: number, to = from) {
        if (to !== from)
            throw new RangeError('line 装饰必须是零长区间')
        return super.range(from, to)
    }
}

LineDecoration.prototype.point = true

function getInclusive(
    spec: { inclusive?: boolean, inclusiveStart?: boolean, inclusiveEnd?: boolean },
    block = false,
): { start: boolean, end: boolean } {
    let start = spec.inclusiveStart
    let end = spec.inclusiveEnd
    if (start == null)
        start = spec.inclusive
    if (end == null)
        end = spec.inclusive
    return { start: start ?? block, end: end ?? block }
}

function widgetsEq(a: WidgetType | null, b: WidgetType | null): boolean {
    return a === b || !!(a && b && a.compare(b))
}

// 把 [from,to) 并入已排序的扁平区间数组,相邻(距离 ≤ margin)则合并。heightmap diff 收集变更区用。
export function addRange(from: number, to: number, ranges: number[], margin = 0) {
    const last = ranges.length - 1
    if (last >= 0 && ranges[last] + margin >= from)
        ranges[last] = Math.max(ranges[last], to)
    else ranges.push(from, to)
}
