// CM7 buildtile —— 把「文档文本 × 装饰集」投影成一棵 tile 树:编辑器对「该渲染成什么」的决定。
//
// CM6 的 buildtile 把这棵树和真 DOM 节点焊死(每个 tile 携 .dom + 复用缓存 freeNode/setDOM),
// 这正是 CM6 的可监测黑洞——「渲染决策」无法脱离浏览器被枚举/快照。CM7 的「7」在这一层=
// 把 tile 树解冻成**纯可序列化 spec**:同样的 Precedence 嵌套算法、同样的行切分,但产出 DOM-free
// 的树 + toJSON()。DOM 物化(createElement/增量复用)推迟到阶段4 docview,不在此。
//
// 算法核心(逐行移植 CM6 buildtile.ts 的全量重建路径,砍掉增量复用):
//   RangeSet.spans 驱动遍历 —— span(普通文本段,遇换行切行,按 active marks 嵌套)、
//   point(widget 装饰 / line 装饰)。
//   ensureMarks:active 列表按 rank 升序(外层在前),openStart 复用已开的外层 mark → 嵌套。
//     这就是「高优先级装饰建内层 DOM,被低优先级/换行切开」的 Precedence 合并。
//
// 砍(阶段4 docview 才需要):.dom/TileCache/freeNode/Reused、TileUpdate/preserve/forward 增量、
//   WidgetBufferTile/<br> 占位、BlockWrapper、composition。这些是浏览器物理与增量优化,非渲染语义。
//
// 可监测:整棵树 toJSON() 出规范 JSON,buildTileTree 是纯函数 → 受控快照钉死 CM6 等价行为。

import type { Attrs, DecorationSet, MarkDecoration } from '../model/decoration'
import type { Line, Rope } from '../model/rope'
import type { WidgetType } from '../model/decoration'
import { combineAttrs, Decoration, LineDecoration, PointDecoration, ZoneWidget } from '../model/decoration'
import { RangeSet } from '../model/rangeset'

const lineBaseClass = 'cm-line'

// tile 树节点。block 层:LineTile | BlockWidgetTile。inline 层:TextTile | MarkTile | InlineWidgetTile。
export type BlockTile = LineTile | BlockWidgetTile
export type InlineTile = TextTile | MarkTile | InlineWidgetTile

export class DocTile {
    constructor(readonly children: readonly BlockTile[]) {}

    get length(): number {
        let n = 0
        for (const c of this.children) n += c.length
        return n
    }

    toJSON(): unknown {
        return { type: 'doc', children: this.children.map(c => c.toJSON()) }
    }
}

export class LineTile {
    constructor(
        readonly attrs: Attrs,
        readonly children: readonly InlineTile[],
    ) {}

    get length(): number {
        let n = 0
        for (const c of this.children) n += c.length
        return n
    }

    toJSON(): unknown {
        return { type: 'line', attrs: sortedAttrs(this.attrs), children: this.children.map(c => c.toJSON()) }
    }
}

export class TextTile {
    constructor(readonly text: string) {}

    get length(): number { return this.text.length }

    toJSON(): unknown {
        return { type: 'text', text: this.text }
    }
}

export class MarkTile {
    constructor(
        readonly mark: MarkDecoration,
        readonly children: readonly InlineTile[],
    ) {}

    get length(): number {
        let n = 0
        for (const c of this.children) n += c.length
        return n
    }

    toJSON(): unknown {
        return {
            type: 'mark',
            tag: this.mark.tagName,
            attrs: sortedAttrs(this.mark.attrs),
            children: this.children.map(c => c.toJSON()),
        }
    }
}

export class InlineWidgetTile {
    constructor(
        readonly length: number,
        readonly side: number,
        readonly widget: WidgetType | null,
        readonly from: number = -1,  // 覆盖区在 doc 中的起点(replace 折叠读回隐藏原文用);toJSON 不含以保稳定
    ) {}

    toJSON(): unknown {
        return { type: 'widget', inline: true, length: this.length, side: this.side }
    }
}

export class BlockWidgetTile {
    constructor(
        readonly length: number,
        readonly side: number,
        readonly widget: WidgetType | null,
    ) {}

    toJSON(): unknown {
        return { type: 'widget', inline: false, length: this.length, side: this.side }
    }
}

function sortedAttrs(attrs: Attrs): Attrs {
    const out: Attrs = {}
    for (const key of Object.keys(attrs).sort()) out[key] = attrs[key]
    return out
}

// 可变构建节点:build 期间用数组累积 children,结束时冻结成上面的只读 tile。
class BuildLine {
    attrs: Attrs
    children: InlineMut[] = []
    constructor(attrs: Attrs | null) {
        this.attrs = attrs || { class: lineBaseClass }
    }
}

class BuildMark {
    children: InlineMut[] = []
    constructor(readonly mark: MarkDecoration) {}
}

type InlineMut = TextTile | BuildMark | InlineWidgetTile

type Composite = BuildLine | BuildMark

// 把可变构建树冻结成只读 tile 树。
function freezeInline(node: InlineMut): InlineTile {
    if (node instanceof BuildMark)
        return new MarkTile(node.mark, node.children.map(freezeInline))
    return node
}

// 文本读取游标:按 spans 的 skip/next 协议从 Rope 取字符,遇行边界返回 null(并跨过换行符)。
// 只持有绝对 pos + 当前行缓存;pos 落在缓存行外时按需重取。
class TextStream {
    private line: Line
    private pos: number

    constructor(private doc: Rope, from: number) {
        this.pos = from
        this.line = doc.lineAt(from)
    }

    private sync() {
        if (this.pos < this.line.from || this.pos > this.line.to)
            this.line = this.doc.lineAt(this.pos)
    }

    skip(len: number) {
        this.pos += len
        this.sync()
    }

    next(maxLen: number): string | null {
        this.sync()
        if (this.pos === this.line.to && this.pos < this.doc.length) {
            this.pos += 1
            this.line = this.doc.lineAt(this.pos)
            return null
        }
        const end = Math.min(this.line.to, this.pos + maxLen)
        const chars = this.line.text.slice(this.pos - this.line.from, end - this.line.from)
        this.pos = end
        return chars
    }
}

const Chunk = 512
/** 切段文本里隔一个包的壳;样式在 themecss.ts,editorview 的就地补丁把它当透明 */
export const CHUNK_CLASS = 'lc-ck'
const CHUNK_MARK = Decoration.mark({ class: CHUNK_CLASS }) as MarkDecoration

// 增量构建器:维护当前 block 列表、当前行、行内 mark 栈,镜像 CM6 TileBuilder 的全量重建子集。
class TileBuilder {
    blocks: BlockTile[] = []
    curLine: BuildLine | null = null

    addLineStart(attrs: Attrs | null) {
        this.curLine = new BuildLine(attrs)
    }

    ensureLine(attrs: Attrs | null) {
        if (!this.curLine)
            this.addLineStart(attrs)
    }

    // 沿 active marks(rank 升序=外→内)下钻,复用 openStart 个已开 mark,其余新建 → Precedence 嵌套。
    ensureMarks(marks: readonly MarkDecoration[], openStart: number): Composite {
        let parent: Composite = this.curLine!
        let open = openStart
        for (let i = marks.length - 1; i >= 0; i--) {
            const mark = marks[i]
            const last: InlineMut | undefined = parent.children[parent.children.length - 1]
            if (open > 0 && last instanceof BuildMark && last.mark.eq(mark)) {
                parent = last
                open--
            }
            else {
                const tile: BuildMark = new BuildMark(mark)
                parent.children.push(tile)
                parent = tile
                open = 0
            }
        }
        return parent
    }

    addText(text: string, marks: readonly MarkDecoration[], openStart: number) {
        const parent = this.ensureMarks(marks, openStart)
        const prev = parent.children[parent.children.length - 1]
        if (prev instanceof TextTile && prev.text.length + text.length < Chunk)
            parent.children[parent.children.length - 1] = new TextTile(prev.text + text)
        else if (prev instanceof TextTile) {
            // 一段文字被切成多个 512 字符的文本节点时,隔一个包一层 .lc-ck(font-kerning:normal,auto 在 Chrome 里等价,看不出区别)。
            // 为什么:Blink 把相邻同字体的文本合成一次排版(shaping),53 万字符的行里改一个字符要整行重排(实测 14 ms);
            // 字体描述不同的相邻片段不合并,只重排改到的那 512 个字符(~1 ms)。
            const wrap = new BuildMark(CHUNK_MARK)
            wrap.children.push(new TextTile(text))
            parent.children.push(wrap)
        }
        else parent.children.push(new TextTile(text))
    }

    addInlineWidget(widget: InlineWidgetTile, marks: readonly MarkDecoration[], openStart: number) {
        const parent = this.ensureMarks(marks, openStart)
        parent.children.push(widget)
    }

    addBlockWidget(widget: BlockWidgetTile) {
        this.blocks.push(widget)
        this.endLine()
    }

    endLine() {
        if (this.curLine) {
            const line = this.curLine
            this.blocks.push(new LineTile(line.attrs, line.children.map(freezeInline)))
            this.curLine = null
        }
    }

    finish(): DocTile {
        this.endLine()
        return new DocTile(this.blocks)
    }
}

function widgetSide(deco: PointDecoration): number {
    return deco.startSide
}

function addLineDeco(value: Attrs | null, deco: LineDecoration): Attrs {
    const spec = deco.spec as { attributes?: Attrs, class?: string }
    let out = value || { class: lineBaseClass }
    if (spec.attributes)
        out = combineAttrs(spec.attributes, out)
    if (spec.class)
        out.class = (out.class ? `${out.class} ` : '') + spec.class
    return out
}

// 纯函数:文档 + 装饰集 → tile 树。这是阶段2 视图输出的可监测核心。
export function buildTileTree(doc: Rope, decorations: readonly DecorationSet[], from = 0, to = doc.length): DocTile {
    const start = Date.now()
    const tree = buildTileTreeInner(doc, decorations, from, to)
    const result: BuildResult = { tree, from, to, elapsedMs: Date.now() - start, decorationCount: decorations.length }
    buildHook?.(result)
    return tree
}

// 可观测 hook:每次 buildTileTree 调用后触发,传入 {tree,from,to,elapsedMs}。
// 不设则零开销。生产环境可设为 null 跳过(=不进热路径)。
export interface BuildResult {
    tree: DocTile
    from: number
    to: number
    elapsedMs: number
    decorationCount: number
}
let buildHook: ((r: BuildResult) => void) | null = null
export function setBuildHook(hook: ((r: BuildResult) => void) | null) { buildHook = hook }

function buildTileTreeInner(doc: Rope, decorations: readonly DecorationSet[], from: number, to: number): DocTile {
    const b = new TileBuilder()
    const stream = new TextStream(doc, from)
    let pendingLineAttrs: Attrs | null = null

    RangeSet.spans(decorations, from, to, {
        point: (pFrom, pTo, deco, active, openStart) => {
            if (deco instanceof PointDecoration) {
                const widgetLen = pTo - pFrom
                if (deco.widget instanceof ZoneWidget) {
                    if (deco.startSide < 0) {
                        // 同一行上方的几个 zone 累加成这一行的 margin-top(Monaco:同一 afterLineNumber 的 zone 依次堆叠)
                        const prev = pendingLineAttrs?.style?.match(/(?:^|;)margin-top:([\d.]+)px/)
                        if (prev && pendingLineAttrs) pendingLineAttrs.style = pendingLineAttrs.style!.replace(prev[0], '').replace(/^;/, '')
                        pendingLineAttrs = combineAttrs({ style: `margin-top:${deco.widget.height + (prev ? Number(prev[1]) : 0)}px` }, pendingLineAttrs || { class: lineBaseClass })
                    }
                }
                else if (deco.block) {
                    b.addBlockWidget(new BlockWidgetTile(widgetLen, widgetSide(deco), deco.widget))
                }
                else {
                    b.ensureLine(pendingLineAttrs)
                    pendingLineAttrs = null
                    b.addInlineWidget(
                        new InlineWidgetTile(widgetLen, widgetSide(deco), deco.widget, pFrom),
                        active as MarkDecoration[],
                        openStart,
                    )
                }
            }
            else if (deco instanceof LineDecoration) {
                pendingLineAttrs = addLineDeco(pendingLineAttrs, deco)
            }
            if (pTo > pFrom)
                stream.skip(pTo - pFrom)
        },
        span: (sFrom, sTo, active, openStart) => {
            for (let pos = sFrom; pos < sTo;) {
                const chars = stream.next(Math.min(Chunk, sTo - pos))
                if (chars == null) {
                    b.ensureLine(pendingLineAttrs)
                    pendingLineAttrs = null
                    b.endLine()
                    pos++
                }
                else {
                    b.ensureLine(pendingLineAttrs)
                    pendingLineAttrs = null
                    b.addText(chars, active as MarkDecoration[], pos === sFrom ? openStart : active.length)
                    pos += chars.length
                }
            }
        },
    })

    if (pendingLineAttrs || !b.curLine)
        b.ensureLine(pendingLineAttrs)
    return b.finish()
}
