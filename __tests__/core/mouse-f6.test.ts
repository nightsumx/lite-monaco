// F6 P1-9/10/11 + P2-19 鼠标:修饰键(Monaco multiCursorModifier)、拖放选区、行号拖选 / Shift+点、自动滚速度。
// jsdom 无布局:posAtCoords 桩成「y/20 定行、x/10 定列」。浏览器对 Monaco 逐场景比对见 /tmp/lc-hunt/f6/mouse.ts、autoscroll.ts
import { describe, it, expect, afterEach, beforeAll, afterAll } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'
import { EditorView } from '../../src/core/view/editorview'
import {
    handleMouseDown, gutterMouseSelection, lineNumberSelectionStyle, hasMultiCursorModifier,
    multiCursorModifier, clickDefinitionHandler, dragScrollLinesPerSecond,
} from '../../src/core/input/mouseselection'
import { browser } from '../../src/core/browser'

const DOC = Array.from({ length: 12 }, (_, i) => `line${i + 1} alpha beta`).join('\n')
const views: EditorView[] = []
// jsdom 没实现 Range.getClientRects:桩成整块,isInPrimarySelection 视为按在选区里
const proto = Range.prototype as unknown as { getClientRects?: () => unknown }
const origRects = proto.getClientRects
beforeAll(() => { proto.getClientRects = () => [{ left: 0, right: 1e4, top: 0, bottom: 1e4 }] })
afterAll(() => { proto.getClientRects = origRects })
afterEach(() => { for (const v of views.splice(0)) { v.destroy(); v.dom.parentElement?.remove() } })

function make(extensions: unknown[] = [], doc = DOC) {
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    const view = new EditorView({
        state: EditorState.create({ doc, extensions: [EditorState.allowMultipleSelections.of(true), ...extensions] as never }),
        parent,
    })
    // 行 = floor(y/20)+1,列 = floor(x/10)
    view.posAtCoords = ({ x, y }) => {
        const d = view.state.doc
        const n = Math.max(1, Math.min(d.lines, Math.floor(y / 20) + 1))
        const l = d.line(n)
        return l.from + Math.max(0, Math.min(l.length, Math.floor(x / 10)))
    }
    const rect = (top: number, h: number) => () => ({ top, left: 0, right: 600, bottom: top + h, width: 600, height: h, x: 0, y: top, toJSON() {} }) as DOMRect
    view.scrollDOM.getBoundingClientRect = rect(0, 240)
    view.contentDOM.getBoundingClientRect = rect(0, 240)
    views.push(view)
    return view
}
const at = (line: number, col: number) => ({ clientX: col * 10 + 1, clientY: (line - 1) * 20 + 10 })
const down = (view: EditorView, p: { clientX: number, clientY: number }, mods: MouseEventInit = {}) => {
    const e = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, buttons: 1, detail: 1, ...p, ...mods })
    view.contentDOM.dispatchEvent(e)
    return e
}
const move = (view: EditorView, p: { clientX: number, clientY: number }, mods: MouseEventInit = {}) =>
    view.contentDOM.ownerDocument.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, buttons: 1, ...p, ...mods }))
const up = (view: EditorView, p: { clientX: number, clientY: number }, mods: MouseEventInit = {}) =>
    view.contentDOM.ownerDocument.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, ...p, ...mods }))
const click = (view: EditorView, p: { clientX: number, clientY: number }, mods: MouseEventInit = {}) => { down(view, p, mods); up(view, p, mods) }
const sel = (view: EditorView) => view.state.selection.ranges.map(r => {
    const a = view.state.doc.lineAt(r.anchor), h = view.state.doc.lineAt(r.head)
    return [a.number, r.anchor - a.from, h.number, r.head - h.from]
})
const ctrlCmd = browser.mac ? { metaKey: true } : { ctrlKey: true }

describe('修饰键(multiCursorModifier 默认 alt)', () => {
    it('Alt+点加光标,再 Alt+点同处删掉', () => {
        const v = make()
        click(v, at(3, 4))
        click(v, at(6, 8), { altKey: true })
        expect(sel(v)).toEqual([[3, 4, 3, 4], [6, 8, 6, 8]])
        click(v, at(6, 8), { altKey: true })
        expect(sel(v)).toEqual([[3, 4, 3, 4]])
    })

    it('Alt+拖:追加一个带选区的光标', () => {
        const v = make()
        click(v, at(2, 2))
        down(v, at(5, 2), { altKey: true })
        move(v, at(7, 9), { altKey: true })
        up(v, at(7, 9), { altKey: true })
        expect(sel(v)).toEqual([[2, 2, 2, 2], [5, 2, 7, 9]])
    })

    it('Shift+Alt+拖:列选,从主选区锚点起', () => {
        const v = make()
        click(v, at(2, 3))
        down(v, at(4, 6), { altKey: true, shiftKey: true })
        up(v, at(4, 6), { altKey: true, shiftKey: true })
        expect(sel(v)).toEqual([[2, 3, 2, 6], [3, 3, 3, 6], [4, 3, 4, 6]])
    })

    it('Cmd/Ctrl+点:单光标落点 + 调跳定义处理者;不追加光标', () => {
        const hits: number[] = []
        const v = make([clickDefinitionHandler.of((_v, pos) => { hits.push(pos); return true })])
        click(v, at(3, 4))
        click(v, at(6, 8), ctrlCmd)
        expect(sel(v)).toEqual([[6, 8, 6, 8]])
        expect(hits).toEqual([v.state.doc.line(6).from + 8])
    })

    it('multiCursorModifier=ctrlCmd 时反过来', () => {
        const v = make([multiCursorModifier.of('ctrlCmd')])
        expect(hasMultiCursorModifier(v, new MouseEvent('mousedown', ctrlCmd))).toBe(true)
        expect(hasMultiCursorModifier(v, new MouseEvent('mousedown', { altKey: true }))).toBe(false)
        click(v, at(1, 1))
        click(v, at(2, 2), ctrlCmd)
        expect(sel(v).length).toBe(2)
    })
})

describe('拖放选区', () => {
    const selectRange = (v: EditorView, l: number, a: number, b: number) =>
        v.dispatch(v.state.update({ selection: EditorSelection.range(v.state.doc.line(l).from + a, v.state.doc.line(l).from + b) }))

    it('拖到选区外:移动文本,选中落下的文本', () => {
        const v = make()
        selectRange(v, 2, 6, 11) // "alpha"
        down(v, at(2, 8))
        move(v, at(5, 0))
        up(v, at(5, 0))
        expect(v.state.doc.line(2).text).toBe('line2  beta')
        expect(v.state.doc.line(5).text).toBe('alphaline5 alpha beta')
        expect(sel(v)).toEqual([[5, 0, 5, 5]])
    })

    it('松开时按着 Alt(mac)/Ctrl:复制', () => {
        const v = make()
        selectRange(v, 2, 6, 11)
        down(v, at(2, 8))
        move(v, at(5, 0))
        up(v, at(5, 0), browser.mac ? { altKey: true } : { ctrlKey: true })
        expect(v.state.doc.line(2).text).toBe('line2 alpha beta')
        expect(v.state.doc.line(5).text).toBe('alphaline5 alpha beta')
    })

    it('落在选区里不动;按下不动松开 = 普通点击', () => {
        const v = make()
        selectRange(v, 2, 6, 16)
        down(v, at(2, 8))
        move(v, at(2, 12))
        up(v, at(2, 12))
        expect(v.state.doc.toString()).toBe(DOC)
        expect(sel(v)).toEqual([[2, 6, 2, 16]])
        down(v, at(2, 8))
        up(v, at(2, 8))
        expect(sel(v)).toEqual([[2, 8, 2, 8]])
    })

    it('拖动中画落点竖线,结束后移除', () => {
        const v = make()
        v.caretCoords = () => ({ left: 10, top: 20, height: 20, bottom: 40 })
        selectRange(v, 2, 6, 11)
        down(v, at(2, 8))
        move(v, at(5, 0))
        expect(v.dom.querySelector('.cm-dropCursor')).not.toBeNull()
        up(v, at(5, 0))
        expect(v.dom.querySelector('.cm-dropCursor')).toBeNull()
    })
})

describe('行号区', () => {
    const gdown = (v: EditorView, line: number, mods: MouseEventInit = {}) => {
        let g = v.dom.querySelector('.cm-gutters')
        if (!g) { g = document.createElement('div'); g.className = 'cm-gutters'; v.dom.appendChild(g) }
        g.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, buttons: 1, detail: 1, clientX: 5, clientY: (line - 1) * 20 + 10, ...mods }))
    }
    const gp = (line: number) => ({ clientX: 5, clientY: (line - 1) * 20 + 10 })

    it('lineNumberSelectionStyle:向下拖到第 8 行 = [4 行首, 9 行首);向上拖 = [10 行首 → 5 行首]', () => {
        const v = make()
        const s1 = lineNumberSelectionStyle(v, new MouseEvent('mousedown', gp(4)))!
        expect(sel({ state: v.state.update({ selection: s1.get(new MouseEvent('mousemove', gp(8)), false, false) }).apply() } as EditorView)).toEqual([[4, 0, 9, 0]])
        const s2 = lineNumberSelectionStyle(v, new MouseEvent('mousedown', gp(9)))!
        expect(sel({ state: v.state.update({ selection: s2.get(new MouseEvent('mousemove', gp(5)), false, false) }).apply() } as EditorView)).toEqual([[10, 0, 5, 0]])
    })

    it('装上后:点行号选整行,拖动扩行,Shift+点从锚点扩', () => {
        const v = make()
        const off = gutterMouseSelection(v)
        gdown(v, 4); move(v, gp(8)); up(v, gp(8))
        expect(sel(v)).toEqual([[4, 0, 9, 0]])
        click(v, at(3, 4))
        gdown(v, 8, { shiftKey: true }); up(v, gp(8))
        expect(sel(v)).toEqual([[3, 4, 9, 0]])
        click(v, at(9, 4))
        gdown(v, 4, { shiftKey: true }); up(v, gp(4))
        expect(sel(v)).toEqual([[9, 4, 4, 0]])
        off()
    })
})

describe('点 ⋯ 展开', () => {
    it('mousedown 落在 .cm-foldPlaceholder 上 → 展开该折叠', async () => {
        const { foldField, foldCode } = await import('../../src/core/edit/fold')
        const v = make([foldField], 'function f() {\n    a()\n}\nz')
        foldCode(v)
        expect(v.state.field(foldField).size).toBe(1)
        const ph = document.createElement('span')
        ph.className = 'cm-foldPlaceholder'
        v.contentDOM.appendChild(ph)
        v.posFromDOM = () => v.state.doc.line(1).to
        const e = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, detail: 1 })
        Object.defineProperty(e, 'target', { value: ph })
        expect(handleMouseDown(v, e)).toBe(true)
        expect(v.state.field(foldField).size).toBe(0)
    })
})

describe('拖选自动滚(Monaco TopBottomDragScrolling)', () => {
    it('速度:出界 ≤1.5 行 / ≤3 行 / 更远 三档,按视口行数放大', () => {
        // 视口 45 行(900px / 20)
        expect(dragScrollLinesPerSecond(0, 900, 20)).toBe(45)
        expect(dragScrollLinesPerSecond(20, 900, 20)).toBe(90)
        expect(dragScrollLinesPerSecond(40, 900, 20)).toBe(180)
        expect(dragScrollLinesPerSecond(100, 900, 20)).toBe(540)
        // 小视口有下限
        expect(dragScrollLinesPerSecond(0, 100, 20)).toBe(30)
    })
})
