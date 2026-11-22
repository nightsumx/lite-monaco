import { describe, expect, it } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'
import { findUrlAt, selectLink } from '../../src/core/feature/link'

describe('findUrlAt', () => {
    it('光标在 https 上取出 URL，剥掉句点', () => {
        const text = 'see https://ex.com/a.'
        expect(findUrlAt(text, 10)).toEqual({
            from: 4,
            to: 20,
            url: 'https://ex.com/a',
        })
        expect(findUrlAt('no link here', 3)).toBeNull()
    })

    it('selectLink 选中 URL', () => {
        let state = EditorState.create({
            doc: 'see https://ex.com/a.',
            selection: EditorSelection.single(10),
        })
        expect(selectLink({ state, dispatch: tr => { state = tr.apply() } })).toBe(true)
        expect(state.selection.main.from).toBe(4)
        expect(state.selection.main.to).toBe(20)
        expect(selectLink({ state, dispatch: tr => { state = tr.apply() } })).toBe(false)
    })
})
