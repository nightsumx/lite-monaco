import { describe, expect, it } from 'vitest'
import {
    addCursorAbove, addCursorBelow,
    cursorSubwordForward, cursorSubwordBackward,
    deleteToLineEnd, deleteToLineStart,
    insertBlankLine, insertNewlineKeepIndent,
    selectMatchingBracket,
    toggleBlockComment, commentTokens,
} from '../../src/core/edit/commands'
import { foldAll, unfoldAll, foldField, foldable } from '../../src/core/edit/fold'
import { EditorSelection } from '../../src/core/model/selection'
import { EditorState } from '../../src/core/model/state'

function run(doc: string, sel: number | { anchor: number, head?: number }, cmd: (t: { state: EditorState, dispatch: (tr: any) => void }) => boolean, ext: any[] = []) {
    let state = EditorState.create({
        doc,
        selection: typeof sel === 'number' ? EditorSelection.cursor(sel) : EditorSelection.single(sel.anchor, sel.head ?? sel.anchor),
        extensions: [EditorState.allowMultipleSelections.of(true), ...ext],
    })
    const ok = cmd({ state, dispatch: tr => { state = state.applyTransaction(tr) } })
    return { ok, state, doc: state.doc.toString(), sel: state.selection }
}

describe('缺口命令', () => {
    it('deleteToLineEnd / Start', () => {
        const a = run('hello world', 5, deleteToLineEnd)
        expect(a.ok).toBe(true)
        expect(a.doc).toBe('hello')
        const b = run('hello world', 5, deleteToLineStart)
        expect(b.doc).toBe(' world')
    })

    it('subword camelCase', () => {
        // fooBarBaz 在 B 处
        const pos = 'foo'.length // at B of Bar
        const a = run('fooBarBaz', pos, cursorSubwordForward)
        expect(a.sel.main.head).toBe('fooBar'.length)
        const b = run('fooBarBaz', 'fooBar'.length, cursorSubwordBackward)
        expect(b.sel.main.head).toBe(pos)
    })

    it('addCursorAbove/Below', () => {
        const doc = 'aaa\nbbb\nccc'
        const mid = doc.indexOf('bbb') + 1
        const a = run(doc, mid, addCursorBelow)
        expect(a.ok).toBe(true)
        expect(a.sel.ranges.length).toBe(2)
        const b = run(doc, mid, addCursorAbove)
        expect(b.sel.ranges.length).toBe(2)
    })

    it('insertBlankLine / keepIndent', () => {
        const a = run('  hi', 4, insertNewlineKeepIndent)
        expect(a.doc).toBe('  hi\n  ')
        const b = run('  hi', 4, insertBlankLine)
        expect(b.doc).toContain('\n  \n  ')
    })

    it('selectMatchingBracket', () => {
        const a = run('a(b)c', 1, selectMatchingBracket) // on (
        expect(a.ok).toBe(true)
        expect(a.sel.main.from).toBe(1)
        expect(a.sel.main.to).toBe(4)
    })

    it('toggleBlockComment', () => {
        const ext = [commentTokens.of({ block: { open: '/*', close: '*/' } })]
        const a = run('hello', { anchor: 0, head: 5 }, toggleBlockComment, ext)
        expect(a.ok).toBe(true)
        expect(a.doc).toBe('/* hello */')
        // 选中整段再 toggle → 去掉注释
        const b = run(a.doc, { anchor: 0, head: a.doc.length }, toggleBlockComment, ext)
        expect(b.ok).toBe(true)
        expect(b.doc).toBe('hello')
    })

    it('foldAll / unfoldAll', () => {
        const doc = 'function f() {\n  a\n  b\n}\n'
        let state = EditorState.create({
            doc,
            extensions: [foldField, EditorState.allowMultipleSelections.of(true)],
        })
        // 行 1 应可折
        expect(foldable(state, 0)).not.toBeNull()
        foldAll({ state, dispatch: tr => { state = state.applyTransaction(tr) } })
        expect(state.field(foldField).size).toBeGreaterThan(0)
        unfoldAll({ state, dispatch: tr => { state = state.applyTransaction(tr) } })
        expect(state.field(foldField).size).toBe(0)
    })
})
