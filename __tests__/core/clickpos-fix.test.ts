// 点击落点(对齐 Monaco 0.52):折叠行按 x 取列、不落进隐藏区;点最后一行下方的空白 → 文档末尾。
//
// Monaco 折叠 = 整行隐藏:折叠首行可见文字照常按 x 取列;点到行尾 ⋯ 右边 → 折叠首行行尾(10,53);
// 点 ⋯ 本身展开(mouseselection 处理)。隐藏行里的位置不是可见落点。
// 旧 bug:隐藏区内位置的 caretCoords 退回行首 left,坐标不单调,posAtCoordsLayout 二分一路右移到
// block.to(隐藏行行尾),点哪都落到 12,23。
//
// jsdom 无布局:按「物化 DOM 结构」桩等宽网格——行盒顶 = 第 i 个渲染行 × LH;行内 x = 该点之前的
// 可见字符数 × CW(文本节点按字符,widget 按 textContent 长);元素边界上的折叠 range 跟 Chrome 一样
// 返回空 rect 列表。浏览器里的同款验证见 /tmp/lc-hunt/r3/fix-V/{fold-probe,below,below-drag}.ts(对照 Monaco)。

import { afterEach, describe, expect, it } from 'vitest'
import { decorations, EditorView } from '../../src/core/view/editorview'
import { EditorState } from '../../src/core/model/state'
import { Decoration, WidgetType } from '../../src/core/model/decoration'
import { RangeSet } from '../../src/core/model/rangeset'

const LH = 20
const CW = 8
const TOP = 40
const LEFT = 30
const H = 400
const W = 600

const restores: (() => void)[] = []
afterEach(() => {
    while (restores.length) restores.pop()!()
    document.body.innerHTML = ''
})
function override(obj: object, key: string, desc: PropertyDescriptor) {
    const prev = Object.getOwnPropertyDescriptor(obj, key)
    Object.defineProperty(obj, key, { configurable: true, ...desc })
    restores.push(() => {
        if (prev) Object.defineProperty(obj, key, prev)
        else delete (obj as Record<string, unknown>)[key]
    })
}
const patch = (obj: object, key: string, value: unknown) => override(obj, key, { writable: true, value })
function rect(left: number, top: number, width: number, height: number): DOMRect {
    return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() { return this } } as DOMRect
}
const list = (rs: DOMRect[]) => Object.assign([...rs], { item: (i: number) => rs[i] ?? null }) as unknown as DOMRectList

function installGrid(getView: () => EditorView | null) {
    const lineOf = (node: Node): HTMLElement | null => {
        const el = (node.nodeType === 1 ? node : node.parentNode) as HTMLElement | null
        return el?.closest?.('.cm-line') as HTMLElement | null
    }
    const lineTop = (line: HTMLElement) => {
        const v = getView()
        const i = v ? Array.from(v.contentDOM.children).indexOf(line) : -1
        return TOP + Math.max(0, i) * LH
    }
    // (node, offset) 之前的可见列数:文本按字符,widget 原子按它显示的字符数
    const visCol = (line: HTMLElement, node: Node, offset: number): number => {
        let col = 0
        let done = false
        const walk = (n: Node) => {
            if (done) return
            if (n === node && n.nodeType === 3) { col += offset; done = true; return }
            if (n.nodeType === 3) { col += (n as Text).length; return }
            const kids = Array.from(n.childNodes)
            const isWidget = (n as Element).getAttribute?.('data-cm-widget') != null
            if (n === node) {
                for (let i = 0; i < offset; i++) walk(kids[i])
                done = true
                return
            }
            if (isWidget) { col += (n.textContent ?? '').length; return }
            for (const k of kids) walk(k)
        }
        walk(line)
        return col
    }
    const P = HTMLElement.prototype
    const origBox = P.getBoundingClientRect
    const origRects = Element.prototype.getClientRects
    const elBox = (el: HTMLElement): DOMRect | null => {
        if (el.classList.contains('cm-line')) {
            if (el.getAttribute('aria-hidden') === 'true') return rect(0, 0, 300, LH) // 文本探针
            return rect(LEFT, lineTop(el), W, LH)
        }
        if (el.classList.contains('cm-scroller')) return rect(LEFT, TOP, W, H)
        if (el.classList.contains('cm-content')) return rect(LEFT, TOP, W, getView()?.heightMap.height ?? 0)
        const line = lineOf(el)
        if (line && el !== line) {
            const parent = el.parentNode!
            const c0 = visCol(line, parent, Array.prototype.indexOf.call(parent.childNodes, el))
            return rect(LEFT + c0 * CW, lineTop(line) + 2, (el.textContent ?? '').length * CW, 16)
        }
        return null
    }
    patch(P, 'getBoundingClientRect', function (this: HTMLElement) { return elBox(this) ?? origBox.call(this) })
    patch(Element.prototype, 'getClientRects', function (this: Element) {
        const b = this instanceof HTMLElement ? elBox(this) : null
        return b ? list([b]) : origRects.call(this)
    })
    const R = Range.prototype as Range & Record<string, unknown>
    patch(R, 'getBoundingClientRect', function (this: Range) { return rect(0, 0, this.toString().length * CW, 16) })
    patch(R, 'getClientRects', function (this: Range) {
        const line = lineOf(this.startContainer)
        if (!line) return list([])
        // Chrome:元素边界上的折叠 range 没有 rect(真页 bug 的触发条件)
        if (this.collapsed && this.startContainer.nodeType !== 3) return list([])
        const a = visCol(line, this.startContainer, this.startOffset)
        const b = this.collapsed ? a : visCol(line, this.endContainer, this.endOffset)
        return list([rect(LEFT + a * CW, lineTop(line) + 2, (b - a) * CW, 16)])
    })
    const scroller = (el: HTMLElement) => el.classList.contains('cm-scroller')
    override(P, 'clientHeight', { get(this: HTMLElement) { return scroller(this) ? H : 0 } })
    override(P, 'clientWidth', { get(this: HTMLElement) { return scroller(this) ? W : 0 } })
}

class Dots extends WidgetType {
    eq() { return true }
    toDOM() { const s = document.createElement('span'); s.className = 'cm-foldPlaceholder'; s.textContent = '\u22EF'; return s }
}

// 第 2 行 `function f() {` 折叠:隐藏 [第 2 行行尾, 第 4 行行尾],第 5 行 `}` 可见(同 foldable 的 extent)
const DOC = 'const a = 1\nfunction f() {\n    one()\n    two()\n}\nlast line'
function mount(doc = DOC, folded = true): EditorView {
    let view: EditorView | null = null
    installGrid(() => view)
    const d = EditorState.create({ doc }).doc
    const deco = folded ? [decorations.of(RangeSet.of([Decoration.replace({ widget: new Dots() }).range(d.line(2).to, d.line(4).to)], true))] : []
    const host = document.createElement('div')
    document.body.appendChild(host)
    view = new EditorView({ state: EditorState.create({ doc, extensions: deco }), parent: host })
    view.remeasure()
    return view
}
const rowY = (row: number) => TOP + row * LH + LH / 2 // 屏上第 row 个视觉行(0 起)
const xAt = (col: number) => LEFT + col * CW
const lc = (v: EditorView, pos: number) => { const l = v.state.doc.lineAt(pos); return [l.number, pos - l.from + 1] }

describe('点折叠行:按 x 取列,不落进隐藏区', () => {
    it('折叠首行可见文字按 x 取最近列(Monaco 10,1 / 10,6 / 10,16 …)', () => {
        const v = mount()
        expect(v.contentDOM.querySelector('.cm-foldPlaceholder')).toBeTruthy()
        expect(lc(v, v.posAtCoords({ x: xAt(0) + 1, y: rowY(1) })!)).toEqual([2, 1])
        expect(lc(v, v.posAtCoords({ x: xAt(3) + 2, y: rowY(1) })!)).toEqual([2, 4])
        expect(lc(v, v.posAtCoords({ x: xAt(9) + 6, y: rowY(1) })!)).toEqual([2, 11])
        expect(lc(v, v.posAtCoords({ x: xAt(13) + 5, y: rowY(1) })!)).toEqual([2, 15]) // `{` 右半 → 行尾
    })

    it('⋯ 右边的空白 → 折叠首行行尾(Monaco 10,53),不是隐藏行行尾', () => {
        const v = mount()
        const line2 = v.state.doc.line(2)
        for (const x of [xAt(15) + 1, xAt(20), xAt(60)])
            expect(lc(v, v.posAtCoords({ x, y: rowY(1) })!)).toEqual([2, line2.length + 1])
    })

    it('折叠块下面的可见行照常取列', () => {
        const v = mount()
        expect(lc(v, v.posAtCoords({ x: xAt(1), y: rowY(2) })!)).toEqual([5, 2])
        expect(lc(v, v.posAtCoords({ x: xAt(4) + 1, y: rowY(3) })!)).toEqual([6, 5])
    })

    it('caretCoords:隐藏区内 = ⋯ 左缘,隐藏区末端 = ⋯ 右缘(单调,不退回行首)', () => {
        const v = mount()
        const d = v.state.doc
        const at = (p: number) => v.caretCoords(p)!.left
        expect(at(d.line(2).to)).toBe(xAt(14))
        expect(at(d.line(3).from + 2)).toBe(xAt(14))
        expect(at(d.line(4).to)).toBe(xAt(15))
    })
})

describe('点最后一行下方的空白 → 文档末尾(Monaco:不按 x 取列)', () => {
    const SHORT = 'const a = 1\nlast line here'
    it('posAtCoords:末行下方任意 x → doc.length', () => {
        const v = mount(SHORT, false)
        for (const [x, y] of [[xAt(0) + 1, rowY(2)], [xAt(3), rowY(2) + 3], [xAt(40), rowY(6)]])
            expect(v.posAtCoords({ x, y })).toBe(SHORT.length)
        expect(lc(v, v.posAtCoords({ x: xAt(3), y: rowY(1) })!)).toEqual([2, 4]) // 末行本身照常取列
    })

    it('折叠块是末块时,块下方也到文档末尾', () => {
        const doc = 'a\nfunction f() {\n    one()\n    two()'
        const v = mount(doc)
        expect(v.posAtCoords({ x: xAt(2), y: rowY(3) })).toBe(doc.length)
    })

    it('在内容盒下面的 .cm-scroller 空白处按下 → 光标到文档末尾并聚焦', () => {
        const v = mount(SHORT, false)
        v.dispatch(v.state.update({ selection: { anchor: 0 } }))
        const ev = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, detail: 1, clientX: xAt(3), clientY: rowY(8) })
        v.scrollDOM.dispatchEvent(ev)
        v.contentDOM.ownerDocument.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, clientX: xAt(3), clientY: rowY(8) }))
        expect(v.state.selection.main.head).toBe(SHORT.length)
        expect(ev.defaultPrevented).toBe(true)
        expect(document.activeElement).toBe(v.contentDOM)
    })

    it('点在原生滚动条区域(clientWidth/clientHeight 之外)不动光标', () => {
        const v = mount(SHORT, false)
        v.dispatch(v.state.update({ selection: { anchor: 0 } }))
        v.scrollDOM.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, clientX: LEFT + W + 2, clientY: rowY(8) }))
        expect(v.state.selection.main.head).toBe(0)
    })
})
