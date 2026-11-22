// CM7 DOM↔pos 桥 —— 在「活 contenteditable DOM」与「doc 位置」间换算。阶段3 输入沼泽的地基。
//
// CM6 靠每个 Tile 携带活 .dom 指针做这件事(docview.ts:282-344 posFromDOM/domAtPos 走 tile 树)。
// CM7 刻意把 spec(buildtile,无 .dom)与物化(materialize,产 DOM 后丢映射)拆开,所以这里不复刻
// tile 树,而是直接在「规则的物化结构」上做结构化 walker:
//   contentDOM.children[i]  ≡  doc 第 (viewportStartLine + i) 行的 <div class="cm-line">
//   行内子节点 = 裸文本节点 或 <span> 套文本(mark 装饰),深度优先文本长度 == 行内偏移
// viewportStartLine=1 时退化为全文映射(阶段A 的不变量);虚拟化后 >1。
//
// 关键假设(钉死):**textContent.length === 行长** 仅在无 inline widget 时成立。当前 materialize 对
// widget throw(materialize.ts:34,45),故本桥对当前渲染器精确;widget 落地时本文件需同步改。

import type { Rope } from '../model/rope'

// widget 元素(Decoration.replace/point)物化时带 data-cm-widget=「它占的 doc 字符数」。
// 折叠区 ⋯ 可见 1 字符却隐藏 N 个 doc 字符,桥必须按此 doc 长换算,而非 textContent 长。
function widgetLen(node: Node): number | null {
    if (node.nodeType !== 1) return null
    const attr = (node as Element).getAttribute?.('data-cm-widget')
    return attr == null ? null : Number(attr)
}

// 从任意 DOM 节点向上走到 contentDOM 的直接子(即某行 <div>),返回它和它在 children 中的下标。
// 替代 CM6 Tile.nearest(tile.ts)。node 不在 contentDOM 内 → null。
export function lineElAt(contentDOM: HTMLElement, node: Node): { el: HTMLElement, index: number } | null {
    let cur: Node | null = node
    while (cur && cur.parentNode !== contentDOM) cur = cur.parentNode
    if (!cur) return null
    const index = domIndex(contentDOM).els!.get(cur as Element)
    return index == null ? null : { el: cur as HTMLElement, index }
}

// 累加 lineEl 内、文档序在 (stop,stopOffset) 之前的全部文本长度,得到行内偏移。
// stop 是文本节点 → 加 min(stopOffset, 该文本长);stop 是元素 → 加它前 stopOffset 个子节点的文本长。
function inLineOffset(lineEl: HTMLElement, stop: Node, stopOffset: number): number {
    // 选区落在行 div 自身(空行 / 边界):offset 是「第 offset 个子节点之前」,
    // 直接累加前 offset 个子节点文本长。空行 offset 0 → 0(行开头),不退回整行长。
    if (stop === lineEl) {
        let acc = 0
        for (let i = 0; i < stopOffset && i < lineEl.childNodes.length; i++) {
            const child = lineEl.childNodes[i]
            const wl = widgetLen(child)
            acc += wl ?? (child.textContent ?? '').length
        }
        return acc
    }
    let acc = 0
    const walk = (node: Node): boolean => {
        if (node === stop) {
            if (node.nodeType === 3)
                acc += Math.min(stopOffset, (node as Text).length)
            else {
                const wl = widgetLen(node)
                if (wl != null) acc += stopOffset > 0 ? wl : 0
                else
                    for (let i = 0; i < stopOffset && i < node.childNodes.length; i++)
                        acc += (node.childNodes[i].textContent ?? '').length
            }
            return true
        }
        if (node.nodeType === 3) {
            acc += (node as Text).length
            return false
        }
        const wl = widgetLen(node)
        if (wl != null) { acc += wl; return false }
        for (const child of Array.from(node.childNodes))
            if (walk(child)) return true
        return false
    }
    for (const child of Array.from(lineEl.childNodes)) {
        if (walk(child)) break
    }
    return acc
}

function isBlockWidget(el: HTMLElement): boolean {
    return el.classList.contains('cm-blockWidget')
}

function blockWidgetLen(el: HTMLElement): number {
    return Number(el.getAttribute('data-cm-widget') || 0)
}

// —— 行索引 ——
// 「第 i 个 DOM 子 → 起始 doc 位置」表。旧做法每次 domAtPos / posFromDOM 都从视口第一行逐行累加
// (每行再走一遍子节点求 doc 长),选区层一帧对每个视觉行各调一次 → O(行数²)(2 万行拖选自动滚 10fps)。
// 表只是旧累加的缓存,算法一字不差;doc、视口首行变了,或 contentDOM 子树有任何改动(MutationObserver
// takeRecords 同步查脏,浏览器原生输入先改 DOM、state 后到也照新 DOM 算)就重建。
// 每行的 doc 长按元素缓存,改动只作废被碰到的那几行:拖选每帧重画一两行,不再整窗重走子树。
interface LineIndex {
    mo: MutationObserver | null
    els: Map<Element, number> | null // 子 → 下标;DOM 一改就作废
    list: Element[]
    doc: Rope | null
    startLine: number
    starts: number[] // starts[i] = 第 i 个子的起始 doc 位置;starts[n] = 末行之后(每个子吃 doc 长 + 行间换行)
    lens: number[] // 行:domLineDocLen;block widget:-1 - 它的 data-cm-widget 长
    lineLen: WeakMap<Node, number> // 行元素 → domLineDocLen,子树一改就删
}
const indexes = new WeakMap<HTMLElement, LineIndex>()

function invalidate(contentDOM: HTMLElement, ix: LineIndex, records: MutationRecord[]) {
    if (!records.length) return
    ix.els = null
    ix.doc = null
    for (const r of records) {
        if (r.target === contentDOM) { r.removedNodes.forEach(n => ix.lineLen.delete(n)); continue }
        let cur = r.target
        while (cur.parentNode && cur.parentNode !== contentDOM) cur = cur.parentNode
        ix.lineLen.delete(cur)
    }
}

function domIndex(contentDOM: HTMLElement): LineIndex {
    let ix = indexes.get(contentDOM)
    if (!ix) {
        const fresh: LineIndex = { mo: null, els: null, list: [], doc: null, startLine: 0, starts: [], lens: [], lineLen: new WeakMap() }
        if (typeof MutationObserver !== 'undefined') {
            fresh.mo = new MutationObserver(records => invalidate(contentDOM, fresh, records))
            fresh.mo.observe(contentDOM, { childList: true, subtree: true, characterData: true })
        }
        indexes.set(contentDOM, ix = fresh)
    }
    if (ix.mo) invalidate(contentDOM, ix, ix.mo.takeRecords())
    else { ix.els = null; ix.doc = null; ix.lineLen = new WeakMap() }
    if (!ix.els) {
        const list = Array.from(contentDOM.children)
        const els = new Map<Element, number>()
        for (let i = 0; i < list.length; i++) els.set(list[i], i)
        ix.els = els
        ix.list = list
    }
    return ix
}

/** view 销毁时调:断开行索引的 MutationObserver(不然 observer 挂在脱离文档的 contentDOM 上,直到它被回收) */
export function disposeLineIndex(contentDOM: HTMLElement): void {
    indexes.get(contentDOM)?.mo?.disconnect()
    indexes.delete(contentDOM)
}

function lineIndex(contentDOM: HTMLElement, doc: Rope, viewportStartLine: number): LineIndex {
    const ix = domIndex(contentDOM)
    if (ix.doc === doc && ix.startLine === viewportStartLine) return ix
    const starts: number[] = [doc.line(viewportStartLine).from]
    const lens: number[] = []
    for (let i = 0; i < ix.list.length; i++) {
        const el = ix.list[i]
        if (isBlockWidget(el as HTMLElement)) {
            const wl = blockWidgetLen(el as HTMLElement)
            lens.push(-1 - wl)
            starts.push(starts[i] + wl)
        } else {
            let len = ix.lineLen.get(el)
            if (len === undefined) ix.lineLen.set(el, len = domLineDocLen(el as HTMLElement))
            lens.push(len)
            starts.push(starts[i] + len + 1)
        }
    }
    ix.doc = doc
    ix.startLine = viewportStartLine
    ix.starts = starts
    ix.lens = lens
    return ix
}

// 第 index 个 DOM 子的起始 doc 位置。block widget 吃 data-cm-widget 长、不另加换行。
function domLineStartPos(contentDOM: HTMLElement, doc: Rope, index: number, viewportStartLine: number): number {
    return lineIndex(contentDOM, doc, viewportStartLine).starts[index]
}

// DOM (node,offset) → doc 位置。viewportStartLine 是当前 contentDOM 第一行对应的文档行号(1-based)。
export function posFromDOM(contentDOM: HTMLElement, doc: Rope, node: Node, offset: number, viewportStartLine = 1): number {
    // 选区落在内容根:offset 当行号下标。
    if (node === contentDOM) {
        const idx = Math.min(offset, contentDOM.children.length - 1)
        return idx < 0 ? 0 : domLineStartPos(contentDOM, doc, idx, viewportStartLine)
    }
    const line = lineElAt(contentDOM, node)
    if (!line) {
        // 不在内容内:用文档序判断 0 还是末尾(镜像 docview.ts:284)。
        return contentDOM.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_PRECEDING ? doc.length : 0
    }
    const start = domLineStartPos(contentDOM, doc, line.index, viewportStartLine)
    if (isBlockWidget(line.el)) return start
    return start + inLineOffset(line.el, node, offset)
}

// 一行 DOM 承载的 doc 字符数:文本长 + widget 的 doc 长(widget 可吞掉换行,覆盖多 doc 行)。
export function domLineDocLen(lineEl: HTMLElement): number {
    let n = 0
    const walk = (node: Node) => {
        if (node.nodeType === 3) { n += (node as Text).length; return }
        const wl = widgetLen(node)
        if (wl != null) { n += wl; return }
        for (let c = node.firstChild; c; c = c.nextSibling) walk(c)
    }
    for (let c = lineEl.firstChild; c; c = c.nextSibling) walk(c)
    return n
}

// doc 位置 → DOM (node,offset)。viewportStartLine 同上。用于 rebuild 后复原原生选区。
export function domAtPos(contentDOM: HTMLElement, doc: Rope, pos: number, viewportStartLine = 1): { node: Node, offset: number } {
    // 按 doc 偏移逐 DOM 行定位:不用 doc 行号索引 children,因为跨行折叠 widget 会让
    // DOM 行数 < doc 行数(children[docLineNum] 越界)。每 DOM 行吃 domLineDocLen 个 doc
    // 字符,行间 1 个换行(除非已被 widget 吞进 length)。
    const ix = lineIndex(contentDOM, doc, viewportStartLine)
    const { starts, lens } = ix
    const n = lens.length
    if (pos < starts[0]) return { node: contentDOM, offset: 0 }  // 视口前
    // 二分:最后一个 starts[i] <= pos 的子(行尾 pos 归本行:下一行起点 = 行尾 + 1)
    let lo = 0, hi = n - 1
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1
        if (starts[mid] <= pos) lo = mid
        else hi = mid - 1
    }
    let lineEl: HTMLElement | undefined
    let target = pos - starts[lo]
    if (n) {
        const len = lens[lo]
        if (len < 0) {
            if (target < -1 - len) return { node: contentDOM, offset: lo }
        } else if (target <= len) lineEl = ix.list[lo] as HTMLElement
    }
    // 视口后:贴到最后一个渲染行的行尾(不是内容开头——跨视口的选区要盖住已渲染的部分)。
    // starts[n] - 1 就是最后一行末尾(每行都扣了行间换行)。
    if (!lineEl) {
        if (!n) return { node: contentDOM, offset: 0 }
        const end = starts[n] - 1
        return end >= starts[0] && end < pos ? domAtPos(contentDOM, doc, end, viewportStartLine) : { node: contentDOM, offset: n }
    }
    let lastText: Text | null = null
    const walk = (node: Node): { node: Node, offset: number } | null => {
        if (node.nodeType === 3) {
            const len = (node as Text).length
            lastText = node as Text
            if (target <= len) return { node, offset: target }
            target -= len
            return null
        }
        const wl = widgetLen(node)
        if (wl != null) {
            // widget 原子:占 wl 个 doc 字符,内部不可落点。落在其内→贴到 widget 前/后边界。
            const parent = node.parentNode!
            const idx = Array.prototype.indexOf.call(parent.childNodes, node)
            if (target < wl) return { node: parent, offset: idx }
            if (target === wl) return { node: parent, offset: idx + 1 }
            target -= wl
            return null
        }
        for (let child = node.firstChild; child; child = child.nextSibling) {
            const hit = walk(child)
            if (hit) return hit
        }
        return null
    }
    for (let child = lineEl.firstChild; child; child = child.nextSibling) {
        const hit = walk(child)
        if (hit) return hit
    }
    // 空行或落在行尾:落到最后文本节点末尾,否则行元素本身。
    if (lastText) return { node: lastText, offset: (lastText as Text).length }
    return { node: lineEl, offset: 0 }
}
