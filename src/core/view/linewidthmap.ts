// CM7 LineWidthMap —— 文档的「水平几何」模型：HeightMap 的对偶。
//
// 几何真源定律：contentWidth = max over ALL lines（每行像素宽），与「当前渲染了哪些行」正交。
// 但照 Monaco 的真实做法（不是理想化的全文档数组）——用**标量 maxLineWidth** 收敛：
//   DOM 实测视口内行宽 → 更新 maxLineWidth。删掉当前最宽行时从缓存重算，必须跌。
//   横向滚动条 thumb = viewportWidth/contentWidth，恒定，不随 scrollTop/scrollLeft 漂移。
//
// 反模式（已判死）：靠 .cm-content.scrollWidth 撑滚动条——虚拟化后 DOM 只有视口行，scrollWidth 是局部量。
//
// 数据结构（对齐 Monaco ViewLayout._maxLineWidth + ViewLine.getWidth）：
//   LineWidthOracle —— 估算参数（charWidth），纯 ASCII + 等宽时可纯算 width 免读 DOM（Monaco FastRenderedViewLine）。
//   LineWidthMap —— maxLineWidth 标量 + 行宽缓存（line → measured width）。measureLine 读 DOM offsetWidth（slow），
//     纯算快速路径（charWidth × charCount）命中时不读 DOM。applyChanges 标脏受影响行、行数变化时重置。
//
// 可监测：toJSON() 出 {maxLineWidth, contentWidth}，零 DOM 依赖，合成 oracle + 缓存即可钉死 width 代数。

import type { ChangeSet } from '../model/change'
import { Line, Rope } from '../model/rope'

export let widthChangeFlag = false

export function clearWidthChangeFlag() {
    widthChangeFlag = false
}

export class LineWidthOracle {
    doc: Rope = Rope.empty
    charWidth = 7
    // 纯算快速路径成立条件（对齐 Monaco monospaceAssumptionsAreValid + isBasicASCII + useMonospaceOptimizations）。
    // 默认 false：保守走 DOM 实测。产品层（liteMonaco() 知道字体是等宽 + ASCII）可设 true 启用纯算。
    fastRender = false
    // .cm-line 左 padding(行文本起点相对 contentDOM 左缘)。行宽从 contentDOM 左缘量到文字末尾,右 padding 不算
    //(Monaco maxLineWidth 就是文字宽,行尾留白只有 scrollBeyondLastColumn 那 4 列)。EditorView 用文本探针量好写入;默认 0。
    linePadding = 0
    // 能不能拿「字数 × 字宽」估没渲染过的行。比例字体下最长的行不一定最宽,估出来的下界只增不减、永远降不下来
    //(真 Chromium Georgia:content.width 184 对 Monaco 的 163),所以不估,同 Monaco 等渲染后 DOM 实测。EditorView 接上 fontInfo.isMonospace。
    canEstimate: () => boolean = () => true

    constructor(public lineWrapping: boolean) {}

    setDoc(doc: Rope): this {
        this.doc = doc
        return this
    }

    // 纯算行宽（Monaco FastRenderedViewLine.getWidth 的 <300 字符路径）：charWidth × charCount。
    // 仅在 fastRender && 纯 ASCII && 无 widget/collapsed 时成立；否则返回 -1 表示须 DOM 实测。
    fastWidthFor(line: Line): number {
        if (!this.fastRender || this.lineWrapping) return -1
        if (!isBasicASCII(line.text)) return -1
        return Math.ceil(this.charWidth * line.length + this.linePadding)
    }

    refresh(charWidth: number, fastRender: boolean): boolean {
        const changed = Math.abs(charWidth - this.charWidth) > 0.1 || fastRender !== this.fastRender
        this.charWidth = charWidth
        this.fastRender = fastRender
        return changed
    }

    // 全文档最长行的纯算估算宽（charWidth × maxLen）——对齐 Monaco。
    // 仅初始化 / flush 后调用；热路径禁止（O(行数) 会卡大文件打字）。
    // 大文档采样估,不全扫(打开 5 万行时 O(n) line() 也会卡半秒+)。
    /** 上一次 estimateMaxWidth 里最长那行的行号(没有行为 0):它没被改,估值就还是对的 */
    lastEstLine = 0
    estimateMaxWidth(): number {
        if (this.lineWrapping || !this.canEstimate()) return 0
        let maxLen = 0, at = 0
        const n = this.doc.lines
        const probe = (i: number) => { const len = estLen(this.doc.line(i)); if (len > maxLen) { maxLen = len; at = i } }
        if (n <= 4000) {
            for (let i = 1; i <= n; i++) probe(i)
        } else {
            const head = 400
            const tail = 400
            const midSamples = 800
            for (let i = 1; i <= Math.min(n, head); i++) probe(i)
            const lo = head + 1
            const hi = Math.max(lo, n - tail)
            const step = Math.max(1, Math.floor((hi - lo) / midSamples))
            for (let i = lo; i < hi; i += step) probe(i)
            for (let i = Math.max(1, n - tail + 1); i <= n; i++) probe(i)
        }
        this.lastEstLine = at
        return Math.ceil(this.charWidth * maxLen + this.linePadding)
    }

    // 只扫变更覆盖行，取 charWidth × maxLen 作为下界 bump（O(脏行)）。
    estimateWidthForLines(fromLine: number, toLine: number): number {
        if (this.lineWrapping || !this.canEstimate()) return 0
        let maxLen = 0
        const lo = Math.max(1, fromLine)
        const hi = Math.min(this.doc.lines, toLine)
        const probe = (i: number) => { const len = estLen(this.doc.line(i)); if (len > maxLen) maxLen = len }
        if (hi - lo < 4000) {
            for (let i = lo; i <= hi; i++) probe(i)
        } else {
            // 大范围(整篇替换、setModel)同 estimateMaxWidth 采样:只是下界估计,真宽由渲染行实测;全扫是 O(行数) 次 line()
            const edge = 400
            for (let i = lo; i < lo + edge; i++) probe(i)
            const a = lo + edge, b = hi - edge
            const step = Math.max(1, Math.floor((b - a) / 800))
            for (let i = a; i < b; i += step) probe(i)
            for (let i = b; i <= hi; i++) probe(i)
        }
        return Math.ceil(this.charWidth * maxLen + this.linePadding)
    }
}

const ASCII = /^[\x00-\x7F]*$/
function isBasicASCII(s: string): boolean {
    return ASCII.test(s)
}

// 估算只算纯 ASCII 行:非 ASCII(emoji 代理对、ZWJ、组合符、全角)的字宽 ≠ UTF-16 长度 × 半角宽,估高了就永远降不下来
// (maxLineWidth 只增不减),真 Chromium 实测 emoji 行 content.width 225 对 Monaco 的 161。Monaco 不估,只量渲染出来的行,这里同:这类行等渲染后 DOM 实测。
function estLen(line: Line): number {
    return line.length > 0 && !isBasicASCII(line.text) ? 0 : line.length
}

// 全文档行宽缓存 + maxLineWidth 标量。measureWidth 喂已量好的像素宽；DOM 量宽策略在 EditorView。
// 缓存键 = 行号（1-based）。行数变化（插入/删除行）→ 重置（对齐 Monaco onLinesInserted/onFlushed 的 _maxLineWidth=0）。
export class LineWidthMap {
    maxLineWidth = 0
    // 行号 → 实测像素宽。脏行被删除（下次实测重读）。行号不稳定（插删行后整体平移）→ 直接 clear。
    private widths: Map<number, number> = new Map()
    // contentWidth 额外偏移（对齐 Monaco _computeContentWidth 的 extraHorizontalSpace + verticalScrollbarWidth）。
    // 产品层按 layoutInfo 设；默认 0。
    extraWidth = 0

    constructor(readonly oracle: LineWidthOracle) {}

    // 写一行实测宽（DOM 量宽在 EditorView 用 Range 完成，这里只存 + bumpMax）。cache 命中则跳过。
    // width < 0 表示未量到（视口外/无 DOM），不更新缓存。
    measureWidth(lineNumber: number, width: number): number {
        if (lineNumber < 1 || width < 0) return -1
        const cached = this.widths.get(lineNumber)
        if (cached !== undefined) return cached
        this.widths.set(lineNumber, width)
        this.bumpMax(width)
        return width
    }

    // 纯算快速路径（不读 DOM）。命中则更新缓存 + maxLineWidth。
    measureLineFast(line: Line): number {
        const lineNumber = line.number
        const cached = this.widths.get(lineNumber)
        if (cached !== undefined) return cached
        const w = this.oracle.fastWidthFor(line)
        if (w < 0) return -1
        this.widths.set(lineNumber, w)
        this.bumpMax(w)
        return w
    }

    // 视口内批量实测：返回 maxLineWidth 是否变化（对偶 heightChangeFlag）。
    // entries = {lineNumber, width}（width 由 EditorView 用 Range 量好；< 0 表示未量到，走纯算快速路径）。
    measureViewport(entries: readonly { lineNumber: number, width: number }[]): boolean {
        clearWidthChangeFlag()
        // 折行:行宽恒≤视口宽,不记(量到的是折后块宽,记了反而用 min-width 把内容钉住,容器变窄不重折)。
        if (this.oracle.lineWrapping) return false
        for (const { lineNumber, width } of entries) {
            const line = this.oracle.doc.line(lineNumber)
            let w = this.measureLineFast(line)
            if (w < 0) w = this.measureWidth(lineNumber, width)
            void w
        }
        return widthChangeFlag
    }

    applyChanges(changes: ChangeSet, oldDoc: Rope, newDoc: Rope): void {
        this.oracle.setDoc(newDoc)
        if (oldDoc.lines !== newDoc.lines) {
            this.widths.clear()
            this.maxLineWidth = 0
            widthChangeFlag = true
            this.seedEstimate()
            return
        }
        let droppedMax = false
        let dirtyLo = Infinity
        let dirtyHi = 0
        changes.iterChangedRanges((fromA, toA) => {
            const startLine = oldDoc.lineAt(fromA).number
            const endLine = oldDoc.lineAt(toA).number
            if (startLine < dirtyLo) dirtyLo = startLine
            if (endLine > dirtyHi) dirtyHi = endLine
            for (let n = startLine; n <= endLine; n++) {
                const prev = this.widths.get(n)
                this.widths.delete(n)
                if (prev !== undefined && prev === this.maxLineWidth) droppedMax = true
            }
        })
        // 全文档估值只在「估到的最长行被改了」时作废:没动它,行数和采样点都没变,估值原样有效,不用每次(最长行恰是视口里量到的最宽行时)再扫 400~1600 行
        const c = this._docEst
        const cacheOk = c !== null && !this.oracle.lineWrapping && c.cw === this.oracle.charWidth && c.pad === this.oracle.linePadding
            && (c.line < dirtyLo || c.line > dirtyHi)
        if (!cacheOk) this._docEst = null
        if (droppedMax) {
            this.recomputeMax()
            if (cacheOk) {
                this.bumpMax(c!.px)
                this.bumpMax(this.oracle.estimateWidthForLines(dirtyLo, dirtyHi))
            } else this.seedEstimate()
        } else if (dirtyLo <= dirtyHi) {
            this.seedEstimate(dirtyLo, dirtyHi)
        }
    }

    /** 最近一次全文档估值(px)和它的来源:最长行、当时的字宽和左 padding */
    private _docEst: { px: number, line: number, cw: number, pad: number } | null = null

    private recomputeMax(): void {
        let max = 0
        for (const w of this.widths.values())
            if (w > max) max = w
        if (max !== this.maxLineWidth) {
            this.maxLineWidth = max
            widthChangeFlag = true
        }
    }

    // 注入 contentWidth 下界(只增不减)。有行范围 → 只估脏段;无范围 → 全文档/采样估。
    seedEstimate(fromLine?: number, toLine?: number): void {
        if (fromLine != null && toLine != null) {
            this.bumpMax(this.oracle.estimateWidthForLines(fromLine, toLine))
            return
        }
        const px = this.oracle.estimateMaxWidth()
        this._docEst = { px, line: this.oracle.lastEstLine, cw: this.oracle.charWidth, pad: this.oracle.linePadding }
        this.bumpMax(px)
    }

    // flush（文档全量替换/resetDOM）——重置一切。
    flush(): void {
        this._docEst = null
        this.widths.clear()
        this.maxLineWidth = 0
        widthChangeFlag = true
    }

    // contentWidth = maxLineWidth + extraWidth(对齐 Monaco _computeContentWidth 的 maxLineWidth + extraHorizontalSpace,
    // 竖条宽不算:我们的 scroller 本来就不含竖条)。取整同 Monaco EditorScrollDimensions 的 `| 0`。
    contentWidth(): number {
        // 折行(Monaco wordWrap):永不横向滚动,contentWidth=0 → 横条隐藏、contentDOM 不被 min-width 撑宽。
        if (this.oracle.lineWrapping) return 0
        return Math.floor(Math.max(this.maxLineWidth, 0) + this.extraWidth)
    }

    /** 这一行的宽是否已有(实测或纯算),有就不用再量 DOM。 */
    has(lineNumber: number): boolean {
        return this.widths.has(lineNumber)
    }

    /** 宽度下界抬到 w(Monaco _ensureMaxLineWidth:横向 reveal 要滚到的位置得在 scrollWidth 里)。 */
    ensureMaxLineWidth(w: number): void {
        this.bumpMax(w)
    }

    getScrollWidth(): number {
        const cw = this.contentWidth()
        return cw > 0 ? cw : 1
    }

    private bumpMax(w: number): void {
        const iw = Math.ceil(w)
        if (iw > this.maxLineWidth) {
            this.maxLineWidth = iw
            widthChangeFlag = true
        }
    }

    toJSON(): { maxLineWidth: number, contentWidth: number, extraWidth: number, cached: number } {
        return {
            maxLineWidth: this.maxLineWidth,
            contentWidth: this.contentWidth(),
            extraWidth: this.extraWidth,
            cached: this.widths.size,
        }
    }
}
