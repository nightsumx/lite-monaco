import { describe, expect, it } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'
import { escapeText, unescapeText, escapeSelection, unescapeSelection } from '../../src/core/feature/escape'

describe('escapeText / unescapeText', () => {
    it('换行和反斜杠往返', () => {
        expect(escapeText('a\nb\\c')).toBe('a\\nb\\\\c')
        expect(unescapeText('a\\nb\\\\c')).toBe('a\nb\\c')
        expect(unescapeText(escapeText('x"y'))).toBe('x"y')
    })
})

describe('escapeSelection', () => {
    it('选区转义，空选区返 false', () => {
        let state = EditorState.create({
            doc: 'a\nb',
            selection: EditorSelection.single(0, 3),
        })
        expect(escapeSelection({ state, dispatch: tr => { state = tr.apply() } })).toBe(true)
        expect(state.doc.toString()).toBe('a\\nb')
        expect(unescapeSelection({ state, dispatch: tr => { state = tr.apply() } })).toBe(true)
        expect(state.doc.toString()).toBe('a\nb')
        expect(escapeSelection({
            state: EditorState.create({ doc: 'ab', selection: EditorSelection.single(1) }),
            dispatch: () => {},
        })).toBe(false)
    })
})
