// K3:单击 / 双击 / 三击 / Alt 点击 / Shift+Alt 拖选 的默认鼠标行为(Monaco),wordSeparators 对双击的影响;cursorUndo / cursorRedo
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'
import { EditorView } from '../../src/core/view/editorview'
import { editorOptions, type IEditorOptions } from '../../src/core/options'
import { history } from '../../src/core/edit/history'
import { cursorUndo, cursorRedo } from '../../src/core/edit/cursorundo'

const views: EditorView[] = []
const proto = Range.prototype as unknown as { getClientRects?: () => unknown }
const origRects = proto.getClientRects
beforeAll(() => { proto.getClientRects = () => [{ left: 0, right: 1e4, top: 0, bottom: 1e4 }] })
afterAll(() => { proto.getClientRects = origRects })
afterEach(() => { for (const v of views.splice(0)) { v.destroy(); v.dom.parentElement?.remove() } })

function make(doc: string, options: IEditorOptions = {}) {
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    const view = new EditorView({
        state: EditorState.create({ doc, extensions: [EditorState.allowMultipleSelections.of(true), editorOptions.of(options)] }),
        parent,
    })
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
const press = (view: EditorView, p: { clientX: number, clientY: number }, detail: number, mods: MouseEventInit = {}) => {
    view.contentDOM.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, buttons: 1, detail, ...p, ...mods }))
    view.contentDOM.ownerDocument.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, ...p, ...mods }))
}
const selText = (v: EditorView) => v.state.selection.ranges.map(r => v.state.sliceDoc(r.from, r.to))

describe('单击 / 双击 / 三击(Monaco 默认行为)', () => {
    const DOC = 'foo bar.baz  qux\nsecond line\nthird'
    it('单击:落光标', () => {
        const v = make(DOC)
        press(v, at(1, 5), 1)
        expect(v.state.selection.main.head).toBe(5)
        expect(v.state.selection.main.empty).toBe(true)
    })
    it('双击:选词', () => {
        const v = make(DOC)
        press(v, at(1, 5), 1)
        press(v, at(1, 5), 2)
        expect(selText(v)).toEqual(['bar'])
    })
    it('双击词尾边界:选贴着的词', () => {
        const v = make(DOC)
        press(v, at(1, 7), 2) // bar| 之后的位置贴着 bar
        expect(selText(v)).toEqual(['bar'])
    })
    it('双击:两词之间的空白整段(Monaco WordOperations.word)', () => {
        const v = make(DOC)
        press(v, at(1, 12), 2) // baz 与 qux 之间的两个空格(光标在两个空格中间)
        expect(selText(v)).toEqual(['  '])
    })
    it('三击:选整行(含换行)', () => {
        const v = make(DOC)
        press(v, at(2, 3), 3)
        expect(selText(v)).toEqual(['second line\n'])
    })
    it('三击末行:选到文末', () => {
        const v = make(DOC)
        press(v, at(3, 2), 3)
        expect(selText(v)).toEqual(['third'])
    })
    it('Alt+双击:再加一个选中的词(多光标)', () => {
        const v = make(DOC)
        press(v, at(1, 1), 1)
        press(v, at(2, 2), 2, { altKey: true })
        expect(selText(v)).toEqual(['', 'second'])
    })
})

describe('wordSeparators 影响双击选词', () => {
    it('默认:. 是分隔符', () => {
        const v = make('a.b c')
        press(v, at(1, 2), 2)
        expect(selText(v)).toEqual(['b'])
    })
    it('去掉 . 之后 a.b 是一个词', () => {
        const v = make('a.b c', { wordSeparators: '`~!@#$%^&*()-=+[{]}\\|;:\'",<>/?' })
        press(v, at(1, 2), 2)
        expect(selText(v)).toEqual(['a.b'])
    })
})

describe('Shift+Alt 拖选列选择(Monaco)', () => {
    it('Shift+Alt+点:从主选区锚点到点击处的矩形', () => {
        const v = make('abcdefgh\nabcdefgh\nabcdefgh\nabcdefgh')
        press(v, at(1, 2), 1)
        press(v, at(3, 5), 1, { altKey: true, shiftKey: true })
        expect(selText(v)).toEqual(['cde', 'cde', 'cde'])
    })
})

describe('cursorUndo / cursorRedo', () => {
    const mk = () => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const view = new EditorView({ state: EditorState.create({ doc: 'abc\ndef\nghi', extensions: [history()] }), parent })
        views.push(view)
        return view
    }
    const run = (v: EditorView, cmd: typeof cursorUndo) => cmd({ state: v.state, dispatch: (tr: never) => v.dispatch(tr) } as never)
    const goto = (v: EditorView, pos: number) => v.dispatch(v.state.update({ selection: EditorSelection.cursor(pos) }))
    it('cursorUndo 回到上一个光标位置,cursorRedo 再回来', () => {
        const v = mk()
        goto(v, 2); goto(v, 6); goto(v, 10)
        expect(run(v, cursorUndo)).toBe(true)
        expect(v.state.selection.main.head).toBe(6)
        expect(run(v, cursorUndo)).toBe(true)
        expect(v.state.selection.main.head).toBe(2)
        expect(run(v, cursorRedo)).toBe(true)
        expect(v.state.selection.main.head).toBe(6)
        expect(run(v, cursorRedo)).toBe(true)
        expect(v.state.selection.main.head).toBe(10)
        expect(run(v, cursorRedo)).toBe(false)
    })
    it('新的光标移动清空 redo 栈', () => {
        const v = mk()
        goto(v, 2); goto(v, 6)
        run(v, cursorUndo)
        goto(v, 9)
        expect(run(v, cursorRedo)).toBe(false)
    })
    it('文档变化清空两栈', () => {
        const v = mk()
        goto(v, 2); goto(v, 6)
        v.dispatch(v.state.update({ changes: { from: 0, insert: 'x' } }))
        expect(run(v, cursorUndo)).toBe(false)
        expect(run(v, cursorRedo)).toBe(false)
    })
    it('选区没变不入栈', () => {
        const v = mk()
        goto(v, 3); goto(v, 3)
        run(v, cursorUndo)
        expect(v.state.selection.main.head).toBe(0)
        expect(run(v, cursorUndo)).toBe(false)
    })
})
