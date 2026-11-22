// @vitest-environment jsdom
// 拖选到左右边缘 / 编辑器外:对齐 Monaco 0.52 MouseDownOperation._onMouseDownThenMove。
// Monaco 只有出了上下沿才有定时自动滚(TopBottomDragScrolling);左右没有定时器,
// 出了文字区左沿(行号区、编辑器左外)→ 该行行首,出了右沿(minimap、滚动条、编辑器右外)→ 该行行尾,
// 再按 Minimal reveal 横向滚到刚好露出光标。文字区里贴着边拖不滚。
// 实测(compare-cm7,/tmp/lc-hunt/r5/R/ash2.ts):407 字的长行,拖到右外 → 列 408、scrollLeft 一步到 2584 后不再动;
// 拖到行号区 → 列 1、scrollLeft 0;文字区里离右沿 10px → 不滚。
import { describe, it, expect, afterEach } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { EditorView } from '../../src/core/view/editorview'

const LONG = 'x'.repeat(200)
const DOC = Array.from({ length: 12 }, (_, i) => `l${i} ` + LONG).join('\n') // 每行 203 字
const views: EditorView[] = []
afterEach(() => { for (const v of views.splice(0)) { v.destroy(); v.dom.parentElement?.remove() } })

// 文字区屏上 [0, 600) × [0, 240),行高 20,字宽 10;caret 屏上 x = col*10 - scrollLeft
function make(multi = false) {
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    const view = new EditorView({ state: EditorState.create({ doc: DOC, extensions: multi ? [EditorState.allowMultipleSelections.of(true)] : [] }), parent })
    let left = 0
    Object.defineProperty(view.scrollDOM, 'scrollLeft', { configurable: true, get: () => left, set: (v: number) => { left = Math.max(0, Math.min(2030 - 600, v)) } })
    Object.defineProperty(view.scrollDOM, 'clientWidth', { configurable: true, get: () => 600 })
    view.posAtCoords = ({ x, y }) => {
        const d = view.state.doc
        const l = d.line(Math.max(1, Math.min(d.lines, Math.floor(y / 20) + 1)))
        return l.from + Math.max(0, Math.min(l.length, Math.round((x + left) / 10)))
    }
    view.caretCoords = (pos: number) => {
        const l = view.state.doc.lineAt(pos)
        const x = (pos - l.from) * 10 - left, top = (l.number - 1) * 20
        return { left: x, top, bottom: top + 20, height: 20 } as never // 真 caretCoords 没有 right
    }
    const rect = () => ({ top: 0, left: 0, right: 600, bottom: 240, width: 600, height: 240, x: 0, y: 0, toJSON() {} }) as DOMRect
    view.scrollDOM.getBoundingClientRect = rect
    view.contentDOM.getBoundingClientRect = rect
    views.push(view)
    return view
}
const ev = (type: string, x: number, y: number) => new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: 1, detail: 1, clientX: x, clientY: y })
const down = (v: EditorView, x: number, y: number) => v.contentDOM.dispatchEvent(ev('mousedown', x, y))
const move = (v: EditorView, x: number, y: number) => v.contentDOM.ownerDocument.dispatchEvent(ev('mousemove', x, y))
const up = (v: EditorView, x: number, y: number) => v.contentDOM.ownerDocument.dispatchEvent(ev('mouseup', x, y))
const head = (v: EditorView) => { const h = v.state.selection.main.head; const l = v.state.doc.lineAt(h); return [l.number, h - l.from] }
const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

describe('拖选左右:没有定时自动滚,出界落到行首 / 行尾并横向 reveal(Monaco)', () => {
    it('文字区里贴着右沿拖(离右沿 10px):不滚', async () => {
        const v = make()
        down(v, 300, 50); move(v, 320, 50); move(v, 590, 50)
        await wait(150)
        expect(v.scrollDOM.scrollLeft).toBe(0)
        expect(head(v)).toEqual([3, 59])
        up(v, 590, 50)
    })

    it('拖出右沿:光标到该行行尾,横向一步滚到刚好露出光标,鼠标不动就不再滚', async () => {
        const v = make()
        down(v, 300, 50); move(v, 320, 50); move(v, 640, 50)
        expect(head(v)).toEqual([3, 203])
        expect(v.scrollDOM.scrollLeft).toBe(2030 - 600)
        await wait(150)
        expect(v.scrollDOM.scrollLeft).toBe(2030 - 600)
        up(v, 640, 50)
    })

    it('拖出左沿(行号区 / 编辑器左外):光标到行首,scrollLeft 回 0;文字区里贴左沿不滚', async () => {
        const v = make()
        v.scrollDOM.scrollLeft = 800
        down(v, 300, 50); move(v, 280, 50); move(v, 8, 50)
        await wait(150)
        expect(v.scrollDOM.scrollLeft).toBe(800)
        expect(head(v)).toEqual([3, 81])
        move(v, -20, 50)
        expect(head(v)).toEqual([3, 0])
        expect(v.scrollDOM.scrollLeft).toBe(0)
        await wait(100)
        expect(v.scrollDOM.scrollLeft).toBe(0)
        up(v, -20, 50)
    })

    it('列选(Shift+Alt 拖)拖出右沿:按鼠标列选,每动一下 reveal 一次(右留 15px),鼠标不动不滚', async () => {
        // Monaco 实测(/tmp/lc-hunt/r5/R/ashc.ts):出右外 10px → scrollLeft 125,再动 2px → 251,再到 40px → 407
        const v = make(true)
        const mods = { shiftKey: true, altKey: true }
        v.contentDOM.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, buttons: 1, detail: 1, clientX: 300, clientY: 50, ...mods }))
        v.contentDOM.ownerDocument.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, buttons: 1, clientX: 640, clientY: 90, ...mods }))
        expect(v.state.selection.ranges.length).toBe(5) // Shift+Alt:从主选区锚点(1:0)拉到鼠标处
        expect(head(v)).toEqual([1, 64]) // 主选区是锚点所在那行
        expect(v.scrollDOM.scrollLeft).toBe(640 + 15 - 600)
        await wait(100)
        expect(v.scrollDOM.scrollLeft).toBe(55)
        v.contentDOM.ownerDocument.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, buttons: 1, clientX: 642, clientY: 90, ...mods }))
        expect(head(v)).toEqual([1, 70])
        expect(v.scrollDOM.scrollLeft).toBe(55 + 60)
        up(v, 642, 90)
    })
})
