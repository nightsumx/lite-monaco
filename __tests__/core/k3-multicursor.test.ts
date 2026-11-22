// K3:多光标 / 列选 / 拖放 / 剪贴板选项。jsdom 无布局:posAtCoords 桩成「y/20 定行、x/10 定列」(同 mouse-f6.test.ts)
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'
import { EditorView } from '../../src/core/view/editorview'
import { handleMouseDown, isRectangleMouseEvent } from '../../src/core/input/mouseselection'
import { editorOptions, type IEditorOptions } from '../../src/core/options'
import { browser } from '../../src/core/browser'
import { buildDefaultKeymap, keymapHandler } from '../../src/core/edit/keymap'
import { addCursorBelow } from '../../src/core/edit/vertical'
import { selectAllOccurrences } from '../../src/core/edit/commands'
import { capSelection } from '../../src/core/edit/editoptions'
import { copiedRange, pasteTransaction, rememberCopied, resetClipboardMeta } from '../../src/core/input/clipboard'

void handleMouseDown
const DOC = Array.from({ length: 12 }, (_, i) => `line${i + 1} alpha beta`).join('\n')
const views: EditorView[] = []
const proto = Range.prototype as unknown as { getClientRects?: () => unknown }
const origRects = proto.getClientRects
beforeAll(() => { proto.getClientRects = () => [{ left: 0, right: 1e4, top: 0, bottom: 1e4 }] })
afterAll(() => { proto.getClientRects = origRects })
afterEach(() => { for (const v of views.splice(0)) { v.destroy(); v.dom.parentElement?.remove() } resetClipboardMeta() })

function make(options: IEditorOptions = {}, doc = DOC) {
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
const down = (view: EditorView, p: { clientX: number, clientY: number }, mods: MouseEventInit = {}) =>
    view.contentDOM.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, buttons: 1, detail: 1, ...p, ...mods }))
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
const selectRange = (v: EditorView, l: number, a: number, b: number) =>
    v.dispatch(v.state.update({ selection: EditorSelection.range(v.state.doc.line(l).from + a, v.state.doc.line(l).from + b) }))

describe('multiCursorModifier', () => {
    it('默认 alt:Alt+点加光标,Ctrl/Cmd+点不加', () => {
        const v = make()
        click(v, at(3, 4))
        click(v, at(6, 8), { altKey: true })
        expect(sel(v)).toEqual([[3, 4, 3, 4], [6, 8, 6, 8]])
        const w = make()
        click(w, at(3, 4))
        click(w, at(6, 8), ctrlCmd)
        expect(sel(w)).toEqual([[6, 8, 6, 8]])
    })

    it('ctrlCmd:Ctrl/Cmd+点加光标,Alt+点不加光标', () => {
        const v = make({ multiCursorModifier: 'ctrlCmd' })
        click(v, at(3, 4))
        click(v, at(6, 8), ctrlCmd)
        expect(sel(v)).toEqual([[3, 4, 3, 4], [6, 8, 6, 8]])
        const w = make({ multiCursorModifier: 'ctrlCmd' })
        click(w, at(3, 4))
        click(w, at(6, 8), { altKey: true })
        expect(sel(w)).toEqual([[6, 8, 6, 8]])
    })

    it('ctrlCmd:Alt+拖是列选(Monaco _columnSelect)', () => {
        const v = make({ multiCursorModifier: 'ctrlCmd' })
        click(v, at(2, 3))
        down(v, at(2, 3), { altKey: true })
        move(v, at(4, 6), { altKey: true })
        up(v, at(4, 6), { altKey: true })
        expect(sel(v)).toEqual([[2, 3, 2, 6], [3, 3, 3, 6], [4, 3, 4, 6]])
    })

    it('computed 形态 altKey 也认', () => {
        const v = make({ multiCursorModifier: 'altKey' as never })
        click(v, at(1, 1))
        click(v, at(2, 2), { altKey: true })
        expect(sel(v).length).toBe(2)
    })
})

describe('columnSelection', () => {
    it('默认 false:普通拖选是一个范围', () => {
        const v = make()
        down(v, at(2, 3))
        move(v, at(4, 6))
        up(v, at(4, 6))
        expect(sel(v)).toEqual([[2, 3, 4, 6]])
    })

    it('true:普通拖选是列选', () => {
        const v = make({ columnSelection: true })
        down(v, at(2, 3))
        move(v, at(4, 6))
        up(v, at(4, 6))
        expect(sel(v)).toEqual([[2, 3, 2, 6], [3, 3, 3, 6], [4, 3, 4, 6]])
    })

    it('true:单击仍是普通光标;双击仍选词', () => {
        const v = make({ columnSelection: true })
        click(v, at(3, 4))
        expect(sel(v)).toEqual([[3, 4, 3, 4]])
        expect(isRectangleMouseEvent(new MouseEvent('mousedown', { detail: 2 }), v)).toBe(false)
    })

    it('true:Alt+点仍是加光标(multiCursorModifier=alt)', () => {
        const v = make({ columnSelection: true })
        click(v, at(3, 4))
        click(v, at(6, 8), { altKey: true })
        expect(sel(v)).toEqual([[3, 4, 3, 4], [6, 8, 6, 8]])
    })

    it('true:Shift+方向键是列选命令', () => {
        const handler = keymapHandler(buildDefaultKeymap('mac'), { mac: true })
        const run = (options: IEditorOptions) => {
            let state = EditorState.create({ doc: 'abcd\nabcd\nabcd', selection: EditorSelection.cursor(2), extensions: [EditorState.allowMultipleSelections.of(true), editorOptions.of(options)] })
            const target = { state, dispatch: (tr: never) => { state = (tr as { apply(): EditorState }).apply(); target.state = state } }
            handler(new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true }), target as never)
            return state.selection.ranges.length
        }
        expect(run({})).toBe(1) // 普通扩选:一个范围
        expect(run({ columnSelection: true })).toBe(2) // 列选:每行一个
    })
})

describe('dragAndDrop', () => {
    it('默认 true:选区内按下拖到外面是移动文本', () => {
        const v = make()
        selectRange(v, 2, 6, 11)
        down(v, at(2, 8))
        move(v, at(5, 0))
        up(v, at(5, 0))
        expect(v.state.doc.line(2).text).toBe('line2  beta')
    })

    it('false:同样的操作不移动文本,是重新选择', () => {
        const v = make({ dragAndDrop: false })
        const before = v.state.doc.toString()
        selectRange(v, 2, 6, 11)
        down(v, at(2, 8))
        move(v, at(5, 0))
        up(v, at(5, 0))
        expect(v.state.doc.toString()).toBe(before)
        expect(sel(v)).toEqual([[2, 8, 5, 0]])
    })

    it('columnSelection 开着时也不拖放', () => {
        const v = make({ columnSelection: true })
        const before = v.state.doc.toString()
        selectRange(v, 2, 6, 11)
        down(v, at(2, 8))
        move(v, at(5, 0))
        up(v, at(5, 0))
        expect(v.state.doc.toString()).toBe(before)
    })
})

describe('multiCursorLimit', () => {
    it('capSelection 只留前 limit 个', () => {
        const st = EditorState.create({ doc: DOC, extensions: [EditorState.allowMultipleSelections.of(true), editorOptions.of({ multiCursorLimit: 2 })] })
        const many = EditorSelection.create([EditorSelection.cursor(0), EditorSelection.cursor(3), EditorSelection.cursor(6)], 2)
        const capped = capSelection(st, many)
        expect(capped.ranges.map(r => r.head)).toEqual([0, 3])
        expect(capped.mainIndex).toBe(0)
        // 默认 10000:原样返回
        const plain = EditorState.create({ doc: DOC, extensions: [EditorState.allowMultipleSelections.of(true)] })
        expect(capSelection(plain, many)).toBe(many)
    })

    it('Alt+点加光标到上限就不再加', () => {
        const v = make({ multiCursorLimit: 2 })
        click(v, at(1, 1))
        click(v, at(2, 2), { altKey: true })
        click(v, at(3, 3), { altKey: true })
        expect(sel(v).length).toBe(2)
    })

    it('向下加光标 / 全选同词都受限', () => {
        const mk = (options: IEditorOptions) => EditorState.create({ doc: DOC, selection: EditorSelection.range(6, 11), extensions: [EditorState.allowMultipleSelections.of(true), editorOptions.of(options)] })
        const run = (cmd: (t: never) => boolean, options: IEditorOptions, times = 1) => {
            let state = mk(options)
            if (cmd === (addCursorBelow as never)) state = state.update({ selection: EditorSelection.cursor(2) }).apply()
            for (let i = 0; i < times; i++) cmd({ state, dispatch: (tr: { apply(): EditorState }) => { state = tr.apply() } } as never)
            return state.selection.ranges.length
        }
        expect(run(addCursorBelow as never, { multiCursorLimit: 3 }, 5)).toBe(3)
        expect(run(addCursorBelow as never, {}, 5)).toBe(6)
        expect(run(selectAllOccurrences as never, { multiCursorLimit: 4 })).toBe(4)
        expect(run(selectAllOccurrences as never, {})).toBe(12)
    })
})

describe('emptySelectionClipboard', () => {
    const st = (options: IEditorOptions, pos = 2) => EditorState.create({ doc: 'abc\ndef\nghi', selection: EditorSelection.cursor(pos), extensions: [editorOptions.of(options)] })

    it('默认 true:空选区复制整行', () => {
        const r = copiedRange(st({}))
        expect(r.text).toBe('abc\n')
        expect(r.isFromEmptySelection).toBe(true)
        expect(r.ranges).toEqual([{ from: 0, to: 4 }])
    })

    it('false:空选区什么也不复制 / 不剪切', () => {
        const r = copiedRange(st({ emptySelectionClipboard: false }))
        expect(r.text).toBe('')
        expect(r.ranges).toEqual([])
        expect(r.isFromEmptySelection).toBe(false)
    })

    it('false:混合选区只取非空的', () => {
        const state = EditorState.create({
            doc: 'abc\ndef\nghi',
            selection: EditorSelection.create([EditorSelection.cursor(1), EditorSelection.range(4, 7)], 0),
            extensions: [EditorState.allowMultipleSelections.of(true), editorOptions.of({ emptySelectionClipboard: false })],
        })
        const r = copiedRange(state)
        expect(r.text).toBe('def')
        expect(r.ranges).toEqual([{ from: 4, to: 7 }])
    })

    it('false:粘贴整行文本不再插到行首', () => {
        rememberCopied('xyz\n', { isFromEmptySelection: true, multicursorText: null })
        const on = pasteTransaction(st({}, 5), 'xyz\n').apply()
        expect(on.doc.toString()).toBe('abc\nxyz\ndef\nghi')
        const off = pasteTransaction(st({ emptySelectionClipboard: false }, 5), 'xyz\n').apply()
        expect(off.doc.toString()).toBe('abc\nd' + 'xyz\n' + 'ef\nghi')
    })
})

describe('multiCursorPaste', () => {
    const two = (options: IEditorOptions) => EditorState.create({
        doc: 'a\nb',
        selection: EditorSelection.create([EditorSelection.cursor(1), EditorSelection.cursor(3)], 0),
        extensions: [EditorState.allowMultipleSelections.of(true), editorOptions.of(options)],
    })

    it("默认 spread:行数等于光标数,一行一个", () => {
        expect(pasteTransaction(two({}), 'X\nY').apply().doc.toString()).toBe('aX\nbY')
    })

    it("'full':每个光标贴全文", () => {
        expect(pasteTransaction(two({ multiCursorPaste: 'full' }), 'X\nY').apply().doc.toString()).toBe('aX\nY\nbX\nY')
    })

    it("'full' 下复制时记下的逐段文本仍按段分发(Monaco 同)", () => {
        rememberCopied('P\nQ', { isFromEmptySelection: false, multicursorText: ['P', 'Q'] })
        expect(pasteTransaction(two({ multiCursorPaste: 'full' }), 'P\nQ').apply().doc.toString()).toBe('aP\nbQ')
    })
})

describe('copyWithSyntaxHighlighting / emptySelectionClipboard 写剪贴板', () => {
    const sink = () => {
        const store = new Map<string, string>()
        return { clearData() { store.clear() }, setData(t: string, v: string) { store.set(t, v) }, get: (t: string) => store.get(t) ?? '' }
    }
    it('默认 true 写 text/html;false 只写 text/plain', async () => {
        const { cutOrCopy } = await import('../../src/core/input/clipboard')
        const a = make({}, 'const a = 1')
        selectRange(a, 1, 0, 5)
        const da = sink()
        expect(cutOrCopy(a, da, false)).toBe(true)
        expect(da.get('text/plain')).toBe('const')
        expect(da.get('text/html')).toContain('const')
        const b = make({ copyWithSyntaxHighlighting: false }, 'const a = 1')
        selectRange(b, 1, 0, 5)
        const db = sink()
        expect(cutOrCopy(b, db, false)).toBe(true)
        expect(db.get('text/plain')).toBe('const')
        expect(db.get('text/html')).toBe('')
    })

    it('emptySelectionClipboard=false:空选区 copy / cut 不消费、不改文档', async () => {
        const { cutOrCopy } = await import('../../src/core/input/clipboard')
        const v = make({ emptySelectionClipboard: false }, 'abc\ndef')
        const d = sink()
        expect(cutOrCopy(v, d, true)).toBe(false)
        expect(v.state.doc.toString()).toBe('abc\ndef')
        const w = make({}, 'abc\ndef')
        expect(cutOrCopy(w, sink(), true)).toBe(true)
        expect(w.state.doc.toString()).toBe('def')
    })
})
