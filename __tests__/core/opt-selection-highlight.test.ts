import { describe, expect, it } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'
import { editorOptions } from '../../src/core/options'
import { selectionHighlightRanges } from '../../src/core/feature/selectionlayer'

// selectionHighlightMaxLength(默认 200,0 = 不限)/ selectionHighlightMultiline(默认 false):
// Monaco SelectionHighlighter._createState 的两道闸
function ranges(doc: string, sel: [number, number], opts: Record<string, unknown> = {}) {
    const state = EditorState.create({ doc, selection: EditorSelection.single(sel[0], sel[1]), extensions: [editorOptions.of(opts as never)] })
    return selectionHighlightRanges(state).length
}

describe('selectionHighlightMaxLength', () => {
    const word = 'abcdefghij' // 10
    const doc = `${word} x ${word} y ${word}`
    it('默认 200:10 字的选区画', () => { expect(ranges(doc, [0, 10])).toBe(2) })
    it('超过上限不画,等于上限画', () => {
        expect(ranges(doc, [0, 10], { selectionHighlightMaxLength: 9 })).toBe(0)
        expect(ranges(doc, [0, 10], { selectionHighlightMaxLength: 10 })).toBe(2)
    })
    it('0 = 不限:超过默认 200 的也画', () => {
        const long = 'z'.repeat(300)
        const d = `${long} ${long}`
        expect(ranges(d, [0, 300])).toBe(0)
        expect(ranges(d, [0, 300], { selectionHighlightMaxLength: 0 })).toBe(1)
    })
})

describe('selectionHighlightMultiline', () => {
    const doc = 'ab\ncd\nxx\nab\ncd\nyy'
    it('默认 false:跨行选区不画', () => { expect(ranges(doc, [0, 5])).toBe(0) })
    it('true:跨行选区画出别处的同串', () => { expect(ranges(doc, [0, 5], { selectionHighlightMultiline: true })).toBe(1) })
    it('单行选区不受影响', () => { expect(ranges('aa bb aa', [0, 2])).toBe(1) })
})
