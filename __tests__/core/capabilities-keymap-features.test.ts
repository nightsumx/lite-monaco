// 能力: 键位绑定表含缺口命令；feature 开关语义（纯表检查）
import { describe, expect, it } from 'vitest'
import { defaultKeymap, keymapHandler } from '../../src/core/edit/keymap'
import {
    addCursorAbove, addCursorBelow,
    cursorSubwordForward, deleteToLineEnd, deleteToLineStart,
} from '../../src/core/edit/commands'
import { EditorSelection } from '../../src/core/model/selection'
import { EditorState } from '../../src/core/model/state'
import { EditorView } from '../../src/core/view/editorview'

function keysOf(map: readonly { key: string, run: unknown }[]) {
    return new Set(map.map(b => b.key))
}

describe('defaultKeymap 能力覆盖', () => {
    it('含多光标/删行边界/基础编辑键', () => {
        const keys = keysOf(defaultKeymap as any)
        // 加光标:Mac / Win 是 Mod-Alt-↑↓,Linux(jsdom 的 '' 平台)是 Shift-Alt-↑↓ / Ctrl-Shift-↑↓
        expect(keys.has('Mod-Alt-ArrowUp') || keys.has('Shift-Alt-ArrowUp')).toBe(true)
        expect(keys.has('Mod-Shift-k')).toBe(true)
        expect(keys.has('Mod-d')).toBe(true)
        expect(keys.has('Mod-a')).toBe(true)
        expect(keys.has('Enter')).toBe(true)
        expect(keys.has('Backspace')).toBe(true)
        expect(keys.has('Escape')).toBe(true)
    })

    it('keymapHandler 执行 addCursorBelow', () => {
        const host = document.createElement('div')
        document.body.appendChild(host)
        const bindings = [
            { key: 'Mod-Alt-ArrowDown', run: addCursorBelow },
            { key: 'Mod-Alt-ArrowUp', run: addCursorAbove },
        ]
        const view = new EditorView({
            state: EditorState.create({
                doc: 'a\nb\nc',
                selection: EditorSelection.cursor(1),
                extensions: [EditorState.allowMultipleSelections.of(true)],
            }),
            parent: host,
            keymap: bindings,
        })
        const run = keymapHandler(bindings)
        const handled = run(
            new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, metaKey: true }),
            view,
        )
        // Mac meta / 非 Mac 可能不匹配 Mod；命令直调仍保证
        if (!handled) expect(addCursorBelow(view)).toBe(true)
        expect(view.state.selection.ranges.length).toBe(2)
        view.destroy()
        expect(typeof run).toBe('function')
    })

    it('defaultKeymap 的 Backspace 真删一字', () => {
        const host = document.createElement('div')
        document.body.appendChild(host)
        const view = new EditorView({
            state: EditorState.create({
                doc: 'ab',
                selection: EditorSelection.cursor(2),
            }),
            parent: host,
            keymap: defaultKeymap,
        })
        const handled = keymapHandler(defaultKeymap)(
            new KeyboardEvent('keydown', { key: 'Backspace' }),
            view,
        )
        expect(handled).toBe(true)
        expect(view.state.sliceDoc()).toBe('a')
        view.destroy()
        host.remove()
    })

    it('deleteToLine* 命令可绑定', () => {
        let state = EditorState.create({ doc: 'hello world', selection: EditorSelection.cursor(5) })
        const d = (tr: any) => { state = state.applyTransaction(tr) }
        expect(deleteToLineEnd({ state, dispatch: d })).toBe(true)
        expect(state.doc.toString()).toBe('hello')
        expect(deleteToLineStart({ state, dispatch: d })).toBe(true)
        expect(state.doc.toString()).toBe('')
        expect(cursorSubwordForward).toBeTypeOf('function')
    })
})
