import { describe, expect, it } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'
import { findMatchingTag, findTagPair, jumpToMatchingTag, selectAroundTag, syncMatchingTag } from '../../src/core/feature/tags'

describe('findMatchingTag', () => {
    it('开标签对到闭标签', () => {
        const text = '<div>x</div>'
        const close = findMatchingTag(text, 1)
        expect(text.slice(close!.from, close!.to)).toBe('</div>')
        const open = findMatchingTag(text, 8)
        expect(text.slice(open!.from, open!.to)).toBe('<div>')
        expect(findMatchingTag('<img />', 1)).toBeNull()
        const pair = findTagPair('<div>x</div>', 6)
        expect(pair).toEqual({ from: 0, to: 12 })
    })
})

describe('jumpToMatchingTag', () => {
    it('从开标签跳到闭标签', () => {
        let state = EditorState.create({
            doc: '<div>x</div>',
            selection: EditorSelection.single(1),
        })
        expect(jumpToMatchingTag({ state, dispatch: tr => { state = tr.apply() } })).toBe(true)
        expect(state.sliceDoc(state.selection.main.from, state.selection.main.to)).toBe('</div>')
        expect(jumpToMatchingTag({ state, dispatch: tr => { state = tr.apply() } })).toBe(true)
        expect(state.sliceDoc(state.selection.main.from, state.selection.main.to)).toBe('<div>')
    })

    it('selectAroundTag 选中整段元素', () => {
        let state = EditorState.create({
            doc: '<div>x</div>',
            selection: EditorSelection.single(6),
        })
        expect(selectAroundTag({ state, dispatch: tr => { state = tr.apply() } })).toBe(true)
        expect(state.selection.main.from).toBe(0)
        expect(state.selection.main.to).toBe(12)
        expect(selectAroundTag({ state, dispatch: tr => { state = tr.apply() } })).toBe(false)
    })

    it('syncMatchingTag 把另一侧改成当前名字', () => {
        let state = EditorState.create({
            doc: '<div>x</span>',
            selection: EditorSelection.single(2),
        })
        expect(syncMatchingTag({ state, dispatch: tr => { state = tr.apply() } })).toBe(true)
        expect(state.doc.toString()).toBe('<div>x</div>')
        expect(syncMatchingTag({ state, dispatch: tr => { state = tr.apply() } })).toBe(false)
    })
})
