// editor.stickyTabStops(Monaco cursorMoveOperations leftPositionAtomicSoftTabs / rightPositionAtomicSoftTabs)
import { describe, expect, it } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'
import { editorOptions, type IEditorOptions } from '../../src/core/options'
import { createEditor } from '../../src/index'
import { fakeHl } from './h1-helpers'
import { cursorCharLeft, cursorCharRight, selectCharLeft } from '../../src/core/edit/commands'

type Cmd = (t: never) => boolean
const head = (doc: string, at: number, options: IEditorOptions, cmd: Cmd) => {
    let state = EditorState.create({ doc, selection: EditorSelection.cursor(at), extensions: [editorOptions.of(options)] })
    cmd({ state, dispatch: (tr: { apply(): EditorState }) => { state = tr.apply() } } as never)
    return state.selection.main.head
}

describe('stickyTabStops', () => {
    it('默认关:左移逐个空格', () => {
        expect(head('        x', 8, {}, cursorCharLeft as Cmd)).toBe(7)
    })
    it('开:缩进里左移一次回到上一个缩进单位(8 → 4)', () => {
        expect(head('        x', 8, { stickyTabStops: true }, cursorCharLeft as Cmd)).toBe(4)
    })
    it('开:缩进里右移一次跳到下一个缩进单位(0 → 4)', () => {
        expect(head('        x', 0, { stickyTabStops: true }, cursorCharRight as Cmd)).toBe(4)
    })
    it('开:不在单位边界时,左移回到本单位起点(6 → 4)', () => {
        expect(head('        x', 6, { stickyTabStops: true }, cursorCharLeft as Cmd)).toBe(4)
    })
    it('开:选区扩展同样原子', () => {
        expect(head('        x', 8, { stickyTabStops: true }, selectCharLeft as Cmd)).toBe(4)
    })
    it('开:离开缩进区(光标在首个非空白之后)不受影响', () => {
        expect(head('        xy', 10, { stickyTabStops: true }, cursorCharLeft as Cmd)).toBe(9)
    })
    it('开:右移到缩进末尾那一步(列 = 缩进列)走普通移动,不越过 x', () => {
        expect(head('        x', 8, { stickyTabStops: true }, cursorCharRight as Cmd)).toBe(9)
    })
    it('开:Tab 字符组成的缩进也是一个单位', () => {
        expect(head('\t\tx', 2, { stickyTabStops: true }, cursorCharLeft as Cmd)).toBe(1)
    })
})

describe('stickyTabStops 经公开 API', () => {
    const at = (opts: Record<string, unknown>) => {
        const el = document.createElement('div')
        document.body.appendChild(el)
        const ed = createEditor(el, { highlighter: fakeHl(), value: '        x', language: 'text', tabSize: 4, detectIndentation: false, dimension: { width: 320, height: 200 }, features: { stickyScroll: false, autocomplete: false, tsDiagnostics: false }, ...opts } as never)
        ed.setPosition({ lineNumber: 1, column: 9 })
        ed.trigger('t', 'cursorLeft', null)
        const col = ed.getPosition()!.column
        ed.dispose()
        return col
    }
    it('createEditor({stickyTabStops:true}) 左移一个缩进单位', () => { expect(at({ stickyTabStops: true })).toBe(5) })
    it('默认(false)逐个空格', () => { expect(at({})).toBe(8) })
})
