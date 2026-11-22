import { describe, expect, it } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'
import { encodeUriSelection, decodeUriSelection } from '../../src/core/feature/uri'

describe('encodeUriSelection / decodeUriSelection', () => {
    it('空格编成 %20，再解回', () => {
        let state = EditorState.create({
            doc: 'a b',
            selection: EditorSelection.single(0, 3),
        })
        expect(encodeUriSelection({ state, dispatch: tr => { state = tr.apply() } })).toBe(true)
        expect(state.doc.toString()).toBe('a%20b')
        expect(decodeUriSelection({ state, dispatch: tr => { state = tr.apply() } })).toBe(true)
        expect(state.doc.toString()).toBe('a b')
        expect(encodeUriSelection({
            state: EditorState.create({ doc: 'ab', selection: EditorSelection.single(1) }),
            dispatch: () => {},
        })).toBe(false)
    })
})
