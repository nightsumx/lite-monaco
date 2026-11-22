// Portions of this file are derived from CodeMirror 6 (MIT, Copyright (C) Marijn Haverbeke and others). See THIRD-PARTY-NOTICES.md.
// CM7 DOMReader —— 从活 contenteditable 读文本回 doc 坐标。阶段3。映射 _cmsrc domreader.ts:8-130。
//
// CM6 用活 Tile(Tile.get/breakAfter/overrideDOMText/isWidget)判行边界。CM7 行是规则的
// <div class="cm-line">:逐行 div 读其文本节点,行间插 LineBreakPlaceholder。
// readTextNode 的 \r\n 归一与 DOMPoint 定位(_cmsrc domreader.ts:48-70,90-100)逐行照搬——纯 DOM。
//
// widget(Decoration.replace 折叠区):DOM 只有可见占位(⋯),隐藏了 N 个 doc 字符。若直接读占位文本,
// 会把 ⋯ 当 doc 文本、丢掉隐藏原文 → 邻近折叠输入损坏 doc。故 reader 追踪 doc 游标,撞到
// data-cm-widget 元素时【不读其 DOM 文本】,改从 doc 切出它覆盖的隐藏原文(CM6 overrideDOMText)。

import type { Rope } from '../model/rope'

export const LineBreakPlaceholder = '￿'

// widget 元素的 doc 长(materialize 打的 data-cm-widget=覆盖的 doc 字符数);非 widget 返 null。
function widgetLen(node: Node): number | null {
    if (node.nodeType !== 1) return null
    const attr = (node as Element).getAttribute?.('data-cm-widget')
    return attr == null ? null : Number(attr)
}

// widget 覆盖区在旧 doc 中的绝对起点(data-cm-widget-from)。无则 -1。
// 绝对起点不随「widget 前的可见文本被编辑」漂移——比累计 docPos 更稳,优先用它切隐藏原文。
function widgetFrom(node: Node): number {
    if (node.nodeType !== 1) return -1
    const attr = (node as Element).getAttribute?.('data-cm-widget-from')
    return attr == null ? -1 : Number(attr)
}

// 选区点:读文本时把 (node,offset) 映射到累计文本位置 pos(用于反推选区)。
export class DOMPoint {
    pos = -1
    constructor(readonly node: Node, readonly offset: number) {}
}

export class DOMReader {
    text = ''
    // doc 游标:随读取推进,用于 widget 隐藏原文回切。null 表示未启用 widget 感知(无 doc/无起点)。
    private doc: Rope | null = null
    private docPos = 0
    constructor(private points: DOMPoint[]) {}

    private append(text: string) { this.text += text }
    private lineBreak() { this.text += LineBreakPlaceholder; this.docPos += 1 }

    // 读 [startLineEl, endLineEl] 闭区间内的所有行(均为 contentDOM 直接子)。
    // doc/docStart 给出后启用 widget 感知:撞 widget 从 doc 切隐藏原文,而非读占位。
    readLines(startLineEl: HTMLElement, endLineEl: HTMLElement, doc?: Rope, docStart?: number) {
        if (doc && docStart != null) { this.doc = doc; this.docPos = docStart }
        for (let line: Node | null = startLineEl; ;) {
            this.readLineContent(line as HTMLElement)
            if (line === endLineEl) break
            this.lineBreak()
            line = (line as HTMLElement).nextSibling
            if (!line) break
        }
    }

    private readLineContent(lineEl: HTMLElement) {
        this.findPointBefore(lineEl, lineEl.firstChild)
        for (let cur = lineEl.firstChild; cur; cur = cur.nextSibling)
            this.readNode(cur)
        this.findPointBefore(lineEl, null)
    }

    private readNode(node: Node) {
        const wl = widgetLen(node)
        if (wl != null) {
            // widget:选区点仍要定位(可落在 widget 前/后);占的 doc 文本从 doc 切,不读 DOM 占位。
            // 用绝对起点(data-cm-widget-from)切,避免 widget 前的可见文本被编辑后 docPos 漂移。
            this.findPointBefore(node, node.firstChild)
            const wf = widgetFrom(node)
            const sliceFrom = wf >= 0 ? wf : this.docPos
            if (this.doc) this.append(this.doc.sliceString(sliceFrom, sliceFrom + wl, LineBreakPlaceholder))
            this.docPos = sliceFrom + wl
            this.findPointBefore(node, null)
            return
        }
        if (node.nodeType === 3)
            this.readTextNode(node as Text)
        else if (node.nodeType === 1) {
            this.findPointBefore(node, node.firstChild)
            for (let cur = node.firstChild; cur; cur = cur.nextSibling)
                this.readNode(cur)
            this.findPointBefore(node, null)
        }
    }

    private readTextNode(node: Text) {
        const text = node.nodeValue!
        for (const point of this.points)
            if (point.node === node)
                point.pos = this.text.length + Math.min(point.offset, text.length)

        const re = /\r\n?|\n/g
        for (let off = 0; ;) {
            const m = re.exec(text)
            const nextBreak = m ? m.index : -1
            const breakSize = m ? m[0].length : 1
            const seg = text.slice(off, nextBreak < 0 ? text.length : nextBreak)
            this.append(seg)
            this.docPos += seg.length  // doc 游标随可见文本推进(供后续 widget 隐藏原文回切)
            if (nextBreak < 0) break
            this.lineBreak()
            if (breakSize > 1) for (const point of this.points)
                if (point.node === node && point.pos > this.text.length) point.pos -= breakSize - 1
            off = nextBreak + breakSize
        }
    }

    private findPointBefore(node: Node, next: Node | null) {
        for (const point of this.points)
            if (point.node === node && node.childNodes[point.offset] === next)
                point.pos = this.text.length
    }
}
