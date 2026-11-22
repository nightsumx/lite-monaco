import { describe, expect, it } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'
import { closeHtmlTag } from '../../src/core/feature/html'
import { encodeHtmlSelection, decodeHtmlSelection } from '../../src/core/feature/htmlentity'

describe('closeHtmlTag', () => {
    it('未闭合 <div> 后补 </div>', () => {
        let state = EditorState.create({
            doc: '<div>',
            selection: EditorSelection.single(5),
        })
        expect(closeHtmlTag({ state, dispatch: tr => { state = tr.apply() } })).toBe(true)
        expect(state.doc.toString()).toBe('<div></div>')
        expect(closeHtmlTag({ state, dispatch: tr => { state = tr.apply() } })).toBe(false)
    })
})

describe('encodeHtmlSelection / decodeHtmlSelection', () => {
    it('& 编成 &amp; 再解回', () => {
        let state = EditorState.create({
            doc: 'a&b',
            selection: EditorSelection.single(0, 3),
        })
        expect(encodeHtmlSelection({ state, dispatch: tr => { state = tr.apply() } })).toBe(true)
        expect(state.doc.toString()).toBe('a&amp;b')
        expect(decodeHtmlSelection({ state, dispatch: tr => { state = tr.apply() } })).toBe(true)
        expect(state.doc.toString()).toBe('a&b')
        expect(encodeHtmlSelection({
            state: EditorState.create({ doc: 'ab', selection: EditorSelection.single(1) }),
            dispatch: () => {},
        })).toBe(false)
    })
})
