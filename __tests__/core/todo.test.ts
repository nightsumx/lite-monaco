import { describe, expect, it } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'
import { findTodos, gotoNextTodo, gotoPrevTodo } from '../../src/core/feature/todo'

describe('findTodos', () => {
    it('钉 TODO / FIXME，标识符里的不收', () => {
        const text = '// TODO fix\nconst TODOLIST = 1\n# FIXME now'
        const hits = findTodos(text)
        expect(hits.map(h => h.kind)).toEqual(['TODO', 'FIXME'])
        expect(text.slice(hits[0].from, hits[0].to)).toBe('TODO')
        expect(text.slice(hits[1].from, hits[1].to)).toBe('FIXME')
        expect(findTodos('plain')).toEqual([])
    })
})

describe('gotoNextTodo', () => {
    it('跳下一处，末处环回；没有则 false', () => {
        const doc = '// TODO a\n// TODO b'
        let state = EditorState.create({ doc, selection: EditorSelection.single(0) })
        const run = (cmd: typeof gotoNextTodo) => cmd({ state, dispatch: tr => { state = tr.apply() } })
        expect(run(gotoNextTodo)).toBe(true)
        expect(state.selection.main.from).toBe(3)
        expect(run(gotoNextTodo)).toBe(true)
        expect(state.selection.main.from).toBe(13)
        expect(run(gotoNextTodo)).toBe(true)
        expect(state.selection.main.from).toBe(3)
        expect(run(gotoPrevTodo)).toBe(true)
        expect(state.selection.main.from).toBe(13)
        expect(editorNone()).toBe(false)
    })
})

function editorNone() {
    const state = EditorState.create({ doc: 'nope' })
    return gotoNextTodo({ state, dispatch: () => {} })
}
