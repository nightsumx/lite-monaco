import { describe, expect, it } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'
import { findQuotedAt, toggleQuotes, unwrapQuotes } from '../../src/core/feature/quotes'

describe('findQuotedAt', () => {
    it('光标在引号串里取出区间', () => {
        expect(findQuotedAt("x = 'hi'", 5)).toEqual({ from: 4, to: 8, quote: "'" })
        expect(findQuotedAt('nope', 1)).toBeNull()
    })
})

describe('toggleQuotes', () => {
    it("'hi' 换成 \"hi\"，再换回来", () => {
        let state = EditorState.create({
            doc: "x = 'hi'",
            selection: EditorSelection.single(5),
        })
        expect(toggleQuotes({ state, dispatch: tr => { state = tr.apply() } })).toBe(true)
        expect(state.doc.toString()).toBe('x = "hi"')
        expect(toggleQuotes({ state, dispatch: tr => { state = tr.apply() } })).toBe(true)
        expect(state.doc.toString()).toBe("x = 'hi'")
        expect(toggleQuotes({
            state: EditorState.create({ doc: 'plain' }),
            dispatch: () => {},
        })).toBe(false)
    })

    it('unwrapQuotes 拆掉引号', () => {
        let state = EditorState.create({
            doc: "x = 'hi'",
            selection: EditorSelection.single(5),
        })
        expect(unwrapQuotes({ state, dispatch: tr => { state = tr.apply() } })).toBe(true)
        expect(state.doc.toString()).toBe('x = hi')
        expect(unwrapQuotes({ state, dispatch: tr => { state = tr.apply() } })).toBe(false)
    })
})
