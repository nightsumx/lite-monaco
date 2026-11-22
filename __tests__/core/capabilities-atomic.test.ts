// 能力: atomicRanges —— 光标/选区不能落在原子区间内
import { describe, expect, it } from 'vitest'
import { atomicRanges, skipAtomicRanges, skipAtomsForSelection } from '../../src/core/edit/atomic'
import { Decoration } from '../../src/core/model/decoration'
import { RangeSetBuilder } from '../../src/core/model/rangeset'
import { EditorSelection } from '../../src/core/model/selection'
import { EditorState } from '../../src/core/model/state'

function atomSet(ranges: [number, number][]) {
    const b = new RangeSetBuilder<Decoration>()
    const mark = Decoration.mark({ class: 'atom' })
    for (const [from, to] of ranges) b.add(from, to, mark)
    return b.finish()
}

describe('atomicRanges skip', () => {
    it('光标落在原子区间内 → 推到边界', () => {
        const set = atomSet([[2, 5]])
        expect(skipAtomicRanges([set], 3, 1)).toBe(5)
        expect(skipAtomicRanges([set], 3, -1)).toBe(2)
    })

    it('光标在边界不移动', () => {
        const set = atomSet([[2, 5]])
        expect(skipAtomicRanges([set], 2, 1)).toBe(2)
        expect(skipAtomicRanges([set], 5, -1)).toBe(5)
        expect(skipAtomicRanges([set], 0, 1)).toBe(0)
    })

    it('相邻原子段', () => {
        const set = atomSet([[2, 4], [4, 6]])
        expect(skipAtomicRanges([set], 3, 1)).toBe(4)
        expect(skipAtomicRanges([set], 5, 1)).toBe(6)
    })

    it('空集恒等', () => {
        expect(skipAtomicRanges([], 3, 1)).toBe(3)
    })

    it('skipAtomsForSelection 空选区推 head', () => {
        const set = atomSet([[1, 4]])
        const sel = EditorSelection.create([EditorSelection.cursor(2)])
        const next = skipAtomsForSelection([set], sel)
        expect(next.main.head).toBe(4)
    })

    it('skipAtomsForSelection 非空选区推 from/to', () => {
        const set = atomSet([[2, 8]])
        const sel = EditorSelection.create([EditorSelection.range(3, 6)])
        const next = skipAtomsForSelection([set], sel)
        expect(next.main.from).toBe(2)
        expect(next.main.to).toBe(8)
    })

    it('无重叠选区保持', () => {
        const set = atomSet([[10, 12]])
        const sel = EditorSelection.create([EditorSelection.range(0, 2)])
        const next = skipAtomsForSelection([set], sel)
        expect(next.main.from).toBe(0)
        expect(next.main.to).toBe(2)
    })

    it('Facet 可挂载', () => {
        const set = atomSet([[0, 2]])
        const state = EditorState.create({
            doc: 'abcd',
            extensions: [atomicRanges.of(() => set)],
        })
        expect(state.facet(atomicRanges).length).toBe(1)
        const produced = state.facet(atomicRanges)[0]({} as never)
        expect(produced).toBe(set)
    })
})
