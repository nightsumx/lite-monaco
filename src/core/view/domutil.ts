// DOM 选区/焦点工具 —— L1–L7 沼泽边角（对齐 CM6 view/src/dom.ts + docview 选区路径）。

import { browser } from '../browser'

// 量坐标共用一个 Range(CM6 dom.ts textRange 同理):每个活 Range 在 DOM 每次增删时都要被浏览器修正,
// 每次 createRange 留下一堆等 GC 的 Range,拖选这种一帧改一批行的场景每次 replaceWith 都被拖慢
const scratchRanges = new WeakMap<Document, Range>()
export function scratchRange(doc: Document): Range {
    let r = scratchRanges.get(doc)
    if (!r) scratchRanges.set(doc, r = doc.createRange())
    return r
}

// 编辑器所在根(document 或 ShadowRoot)的原生选区。Chromium 的 ShadowRoot 有自己的 getSelection
// (document.getSelection 把 shadow 里的节点重定向成宿主);Firefox 的 document 选区直接给 shadow 里的节点;
// Safari 两边都拿不到,由 domobserver 的 getComposedRanges 兜底。
export function getSelection(root: Document | ShadowRoot): Selection | null {
    const own = (root as { getSelection?: () => Selection | null }).getSelection
    return own ? own.call(root) : root.ownerDocument!.getSelection()
}

/** 节点可放 caret 的最大 offset（Safari 会撒谎 #1152 → L7） */
export function maxOffset(node: Node): number {
    if (node.nodeType === 3) return (node as Text).length
    if (node.nodeType === 1) return node.childNodes.length
    return 0
}

export function clampDomPos(node: Node, offset: number): { node: Node, offset: number } {
    const max = maxOffset(node)
    return { node, offset: Math.max(0, Math.min(offset, max)) }
}

/** 是否 contenteditable=false / 原子 widget */
export function isUneditable(node: Node | null | undefined): boolean {
    if (!node || node.nodeType !== 1) return false
    const el = node as HTMLElement
    // 非 Element（部分宿主/探针会把 Text 当 parent 传入）
    if (typeof el.getAttribute !== 'function') return false
    if (el.contentEditable === 'false') return true
    if (el.getAttribute('data-cm-widget') != null) return true
    return false
}

/** 空选区 collapse 时，Gecko 贴 uneditable 会跳飞 → 挪到相邻文本（L2） */
export function avoidUneditable(
    node: Node,
    offset: number,
    preferAfter: boolean,
): { node: Node, offset: number } {
    // 文本节点本身 OK
    if (node.nodeType === 3) return { node, offset }

    // 元素边界：看相邻子节点
    if (node.nodeType === 1) {
        const el = node as HTMLElement
        const child = el.childNodes[Math.min(offset, el.childNodes.length)] as Node | undefined
        const prev = offset > 0 ? el.childNodes[offset - 1] : null
        if (preferAfter && child && isUneditable(child)) {
            const t = textNodeAfter(child)
            if (t) return t
        }
        if (!preferAfter && prev && isUneditable(prev)) {
            const t = textNodeBefore(prev)
            if (t) return t
        }
        if (child && isUneditable(child)) {
            const t = textNodeBefore(child) || textNodeAfter(child)
            if (t) return t
        }
    }
    return { node, offset }
}

function textNodeBefore(node: Node): { node: Node, offset: number } | null {
    let cur: Node | null = node
    while (cur) {
        if (cur.nodeType === 3) return { node: cur, offset: (cur as Text).length }
        if (cur.lastChild) {
            cur = cur.lastChild
            continue
        }
        while (cur && !cur.previousSibling) cur = cur.parentNode
        cur = cur?.previousSibling ?? null
    }
    return null
}

function textNodeAfter(node: Node): { node: Node, offset: number } | null {
    let cur: Node | null = node
    while (cur) {
        if (cur.nodeType === 3) return { node: cur, offset: 0 }
        if (cur.firstChild) {
            cur = cur.firstChild
            continue
        }
        while (cur && !cur.nextSibling) cur = cur.parentNode
        cur = cur?.nextSibling ?? null
    }
    return null
}

let preventScrollSupported: null | false | { preventScroll: boolean } = null
if (typeof document !== 'undefined' && browser.safari && browser.safari_version >= 26)
    preventScrollSupported = false

/** L6: Safari 26+ 坏 preventScroll → 手写恢复 scroll 栈 */
export function focusPreventScroll(dom: HTMLElement) {
    if ((dom as HTMLElement & { setActive?: () => void }).setActive) {
        try {
            ;(dom as HTMLElement & { setActive: () => void }).setActive()
            return
        } catch { /* */ }
    }
    if (preventScrollSupported) {
        dom.focus(preventScrollSupported)
        return
    }

    const stack: (Node | number)[] = []
    for (let cur: Node | null = dom; cur; cur = cur.parentNode) {
        stack.push(cur, (cur as HTMLElement).scrollTop ?? 0, (cur as HTMLElement).scrollLeft ?? 0)
        if (cur === cur.ownerDocument) break
    }
    dom.focus(preventScrollSupported == null
        ? {
            get preventScroll() {
                preventScrollSupported = { preventScroll: true }
                return true
            },
        } as FocusOptions
        : undefined)
    if (!preventScrollSupported) {
        preventScrollSupported = false
        for (let i = 0; i < stack.length;) {
            const elt = stack[i++] as HTMLElement
            const top = stack[i++] as number
            const left = stack[i++] as number
            if (elt.scrollTop != null && elt.scrollTop !== top) elt.scrollTop = top
            if (elt.scrollLeft != null && elt.scrollLeft !== left) elt.scrollLeft = left
        }
    }
}

/**
 * 把 state 选区写进原生 Selection（L1 force / L2 gecko / L3 safari extend / L7 clamp）。
 */
export function applyDOMSelection(
    root: Document | ShadowRoot,
    contentDOM: HTMLElement,
    anchor: { node: Node, offset: number },
    head: { node: Node, offset: number },
    empty: boolean,
): void {
    const sel = getSelection(root)
    if (!sel) return

    let a = clampDomPos(anchor.node, anchor.offset)
    let h = clampDomPos(head.node, head.offset)

    if (empty && browser.gecko) {
        a = avoidUneditable(a.node, a.offset, false)
        h = a
    }

    // L4: Chrome Android 点在 uneditable 里会丢键盘
    const focusNode = sel.focusNode
    if (browser.android && browser.chrome && focusNode && contentDOM.contains(focusNode)) {
        const bad = isUneditable(focusNode) || isUneditable(focusNode.parentElement)
        if (bad) {
            contentDOM.blur()
            focusPreventScroll(contentDOM)
        }
    }

    try {
        if (empty) {
            sel.collapse(a.node, a.offset)
        } else if (typeof (sel as Selection).extend === 'function') {
            sel.collapse(a.node, a.offset)
            // L3: Safari hidden 时 extend 抛错
            try {
                ;(sel as Selection).extend(h.node, h.offset)
            } catch {
                try {
                    sel.setBaseAndExtent(a.node, a.offset, h.node, h.offset)
                } catch { /* */ }
            }
        } else {
            // 原始 Range 路径
            const range = contentDOM.ownerDocument.createRange()
            const forward = true // setBase 顺序：anchor→head
            if (forward) {
                try {
                    range.setStart(a.node, a.offset)
                    range.setEnd(h.node, h.offset)
                } catch {
                    range.setStart(h.node, h.offset)
                    range.setEnd(a.node, a.offset)
                }
            }
            sel.removeAllRanges()
            sel.addRange(range)
        }
    } catch {
        try {
            sel.setBaseAndExtent(a.node, a.offset, h.node, h.offset)
        } catch { /* jsdom / 跨文档 */ }
    }
}
