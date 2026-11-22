// 第 2 轮 F2 几何:横向 reveal(I1)、内容宽不含行右 padding(V5)、测宽测高只量新行(P0-3/P1-4)、展开全部只画视口。
//
// jsdom 无布局:等宽网格桩。每行盒高 LH、每字符宽 CW;行 n 顶 = 视口顶 + (n-1)×LH − scrollTop,
// 字符 x = 视口左 + 左 padding + 列×CW(scroller 与 contentDOM 盒都不随 scrollLeft 动,差值就是内容内坐标)。
// 浏览器里对照 Monaco 的验证见 /tmp/lc-hunt/fix2/f2/ 与 h-input/hscroll*.ts、h-view/p11-hwidth.ts。

import { afterEach, describe, expect, it } from 'vitest'
import { EditorView } from '../../src/core/view/editorview'
import { EditorState } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'
import { foldAll, foldDecorations, foldField, unfoldAll } from '../../src/core/edit/fold'

const LH = 20
const CW = 8
const TOP = 50
const LEFT = 30
const H = 400
const W = 600

const restores: (() => void)[] = []
afterEach(() => {
    while (restores.length) restores.pop()!()
    document.body.innerHTML = ''
    document.head.querySelectorAll('style[data-f2]').forEach(s => s.remove())
})

function override(obj: object, key: string, desc: PropertyDescriptor) {
    const prev = Object.getOwnPropertyDescriptor(obj, key)
    Object.defineProperty(obj, key, { configurable: true, ...desc })
    restores.push(() => {
        if (prev) Object.defineProperty(obj, key, prev)
        else delete (obj as Record<string, unknown>)[key]
    })
}

function rect(left: number, top: number, width: number, height: number): DOMRect {
    return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() { return this } } as DOMRect
}

// padRight:模拟产品 CSS `.cm-line { padding: 0 8px 0 0 }`(只有右 padding)。
function setup(doc: string, extra: Partial<ConstructorParameters<typeof EditorView>[0]> = {}, padRight = 0) {
    if (padRight) {
        const st = document.createElement('style')
        st.setAttribute('data-f2', '')
        st.textContent = `.cm-line { padding: 0 ${padRight}px 0 0; }`
        document.head.appendChild(st)
    }
    const g = { view: null as EditorView | null, top: 0, left: 0, lineRects: 0, rangeRects: 0 }
    const lineTop = (n: number) => TOP - g.top + (n - 1) * LH
    const P = HTMLElement.prototype
    const box = P.getBoundingClientRect
    override(P, 'getBoundingClientRect', { writable: true, value: function (this: HTMLElement) {
        const v = g.view
        if (this.classList.contains('cm-line')) {
            if (this.getAttribute('aria-hidden') === 'true') return rect(0, 0, 300, LH)
            g.lineRects++
            const i = v ? Array.from(v.contentDOM.children).indexOf(this) : -1
            return i < 0 ? rect(0, 0, 0, 0) : rect(LEFT, lineTop(v!.viewportStartLine + i), W, LH)
        }
        if (this.classList.contains('cm-scroller')) return rect(LEFT, TOP, W, H)
        if (this.classList.contains('cm-content')) return rect(LEFT, TOP - g.top, W, v ? v.heightMap.height : 0)
        return box.call(this)
    } })
    const R = Range.prototype
    override(R, 'getBoundingClientRect', { writable: true, value: function (this: Range) {
        g.rangeRects++
        return rect(0, 0, this.toString().length * CW, 15)
    } })
    override(R, 'getClientRects', { writable: true, value: function (this: Range) {
        const v = g.view
        if (!v) return { length: 0, item: () => null }
        const a = v.posFromDOM(this.startContainer, this.startOffset)
        const line = v.state.doc.lineAt(a)
        const r = rect(LEFT + (a - line.from) * CW, lineTop(line.number) + 2, 0, 15)
        return { 0: r, length: 1, item: (i: number) => i === 0 ? r : null }
    } })
    const scroller = (el: HTMLElement) => el.classList.contains('cm-scroller')
    override(P, 'clientHeight', { get(this: HTMLElement) { return scroller(this) ? H : 0 } })
    override(P, 'clientWidth', { get(this: HTMLElement) { return scroller(this) ? W : 0 } })
    override(P, 'scrollTop', {
        get(this: HTMLElement) { return scroller(this) ? g.top : 0 },
        set(this: HTMLElement, x: number) { if (scroller(this)) g.top = Math.max(0, x) },
    })
    override(P, 'scrollLeft', {
        get(this: HTMLElement) { return scroller(this) ? g.left : 0 },
        set(this: HTMLElement, x: number) { if (scroller(this)) g.left = Math.max(0, x) },
    })
    const host = document.createElement('div')
    document.body.appendChild(host)
    const view = new EditorView({ state: EditorState.create({ doc }), parent: host, ...extra })
    g.view = view
    view.remeasure()
    return { g, view }
}

const lines = (n: number, f = (i: number) => `line ${i}`) => Array.from({ length: n }, (_, i) => f(i + 1)).join('\n')
const select = (view: EditorView, sel: EditorSelection) => view.dispatch(view.state.update({ selection: sel, scrollIntoView: true }))

describe('I1 横向 reveal(Monaco revealHorizontal:左留 30、右留 15、最小滚动)', () => {
    const long = lines(20, i => i === 5 ? 'x'.repeat(300) : `line ${i}`)

    it('End 到长行尾 → 光标露在右缘内 15px;Home → 回到 0', () => {
        const { g, view } = setup(long)
        const l5 = view.state.doc.line(5)
        select(view, EditorSelection.single(l5.to))
        expect(g.left).toBe(300 * CW + 15 - W)
        select(view, EditorSelection.single(l5.from + 100))
        expect(g.left).toBe(100 * CW - 30)
        select(view, EditorSelection.single(l5.from))
        expect(g.left).toBe(0)
    })

    it('光标已在可见宽内不动', () => {
        const { g, view } = setup(long)
        const l5 = view.state.doc.line(5)
        select(view, EditorSelection.single(l5.from + 200))
        const left = g.left
        select(view, EditorSelection.single(l5.from + 190))
        expect(g.left).toBe(left)
    })

    it('多光标有跨行选区 → 不横滚;都在单行上 → 看各选区两端', () => {
        const { g, view } = setup(long, { state: EditorState.create({ doc: long, extensions: EditorState.allowMultipleSelections.of(true) }) })
        const l5 = view.state.doc.line(5)
        const l8 = view.state.doc.line(8).from
        select(view, EditorSelection.create([EditorSelection.range(0, l5.to), EditorSelection.cursor(l8)], 0))
        expect(g.left).toBe(0)
        // 多光标盒 [行首, 第 80 列 +15] 比视口宽 → Monaco 不滚
        select(view, EditorSelection.create([EditorSelection.cursor(l8), EditorSelection.cursor(l5.from + 80)], 1))
        expect(g.left).toBe(0)
        // 第 5 行第 100、120 列两个光标 → 盒 [100×CW−30, 120×CW+15] 右缘对齐
        select(view, EditorSelection.create([EditorSelection.cursor(l5.from + 100), EditorSelection.cursor(l5.from + 120)], 1))
        expect(g.left).toBe(120 * CW + 15 - W)
    })

    it('wordWrap 开 → 不横滚', () => {
        const { g, view } = setup(long, { lineWrapping: true })
        select(view, EditorSelection.single(view.state.doc.line(5).to))
        expect(g.left).toBe(0)
    })
})

describe('V5 内容宽:行宽不含 .cm-line 右 padding(Monaco maxLineWidth = 文字宽,行尾只留 4 列)', () => {
    it('最长行 40 字、右 padding 8 → contentWidth = 40×CW + 4×CW', () => {
        const { view } = setup(lines(30, i => i === 7 ? 'y'.repeat(40) : `l${i}`), {}, 8)
        expect(view.lineWidthMap.contentWidth()).toBe(40 * CW + 4 * CW)
    })
})

describe('P1-4 测宽只量新行 / P0-3 测高只量新出现的行', () => {
    it('打一个字:只量改到的那一行的宽', () => {
        const { g, view } = setup(lines(15))
        const n = view.contentDOM.children.length
        expect(n).toBe(15)
        g.rangeRects = 0
        view.dispatch(view.state.update({ changes: { from: view.state.doc.line(5).to, insert: 'a' } }))
        expect(g.rangeRects).toBe(1)
    })

    it('小幅滚动换窗:行盒只量新进视口的行', () => {
        const { g, view } = setup(lines(2000))
        g.lineRects = 0
        view.scrollDOM.scrollTop = 200
        view.scrollDOM.dispatchEvent(new Event('scroll'))
        const n = view.contentDOM.children.length
        expect(g.lineRects).toBeGreaterThan(0)
        expect(g.lineRects).toBeLessThan(n / 2)
    })
})

describe('展开全部只渲染视口', () => {
    it('foldAll → unfoldAll:按当前滚动位置重算视口,不把整篇展开的行全物化', () => {
        // 每块 20 行:折叠时视口 ~50 块,旧做法沿用这个 [from,to] → 展开后几百行全物化
        const body = Array.from({ length: 18 }, (_, k) => `  s${k}`).join('\n')
        const doc = Array.from({ length: 100 }, (_, i) => `function f${i}() {\n${body}\n}`).join('\n')
        const { view } = setup(doc, { state: EditorState.create({ doc, extensions: [foldField] }), decorationProviders: [foldDecorations] })
        foldAll({ state: view.state, dispatch: tr => view.dispatch(tr) })
        view.remeasure() // 折叠后的测量/滚动(真浏览器里随后就到):视口按折叠后的块算,跨过几百个文档行
        expect(view.state.doc.lineAt(view.viewport.to).number).toBeGreaterThan(200)
        unfoldAll({ state: view.state, dispatch: tr => view.dispatch(tr) })
        expect(view.state.doc.lines).toBe(2000)
        expect(view.contentDOM.children.length).toBeLessThan(100)
    })
})

// browser-diff 91-width/fontFamily-serif:比例字体下末列留白用 fontInfo.typicalHalfwidthCharacterWidth(Georgia 8.27),
// 不是探针量出的 oracle.charWidth(6.29);选项晚于构造到达时,构造里写下的留白值是过期的 → 每次重测都按当前 fontInfo 重算(差 4 列 ≈ 8px)
describe('末列留白跟随当前 fontInfo(比例字体)', () => {
    it('字体变成比例字体后重测 → extraWidth = 4 × typicalHalfwidthCharacterWidth', () => {
        const { view } = setup(lines(30))
        expect(view.lineWidthMap.extraWidth).toBe(4 * CW)
        const real = view.fontInfo()
        view.fontInfo = () => Object.assign(Object.create(Object.getPrototypeOf(real)), real, { isMonospace: false, typicalHalfwidthCharacterWidth: 9 })
        view.measureGeometry()
        expect(view.lineWidthMap.extraWidth).toBe(4 * 9)
    })
})
