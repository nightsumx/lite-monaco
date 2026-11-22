// atomicRanges —— 原子区间：光标/选区不能落在区间内部（CM6 cursor.skipAtoms）。
// H10：指针选区与扩展选区时跳过。

import type { RangeSet } from '../model/rangeset'
import type { RangeValue } from '../model/rangeset'
import type { EditorView } from '../view/editorview'
import { EditorSelection, type SelectionRange } from '../model/selection'
import { Facet } from '../model/state'

export type AtomicRangesSource = (view: EditorView) => RangeSet<RangeValue>

export const atomicRanges = Facet.define<AtomicRangesSource>()

export function skipAtomicRanges(
    sets: readonly RangeSet<RangeValue>[],
    pos: number,
    side: -1 | 1,
): number {
    for (;;) {
        let moved = false
        for (const set of sets) {
            set.between(pos - 1, pos + 1, (from, to) => {
                if (pos > from && pos < to) {
                    pos = side < 0 ? from : to
                    moved = true
                    return false
                }
            })
        }
        if (!moved) return pos
    }
}

export function skipAtomsForSelection(
    sets: readonly RangeSet<RangeValue>[],
    sel: EditorSelection,
): EditorSelection {
    if (!sets.length) return sel
    return EditorSelection.create(
        sel.ranges.map(r => skipAtomsForRange(sets, r)),
        sel.mainIndex,
    )
}

function skipAtomsForRange(sets: readonly RangeSet<RangeValue>[], range: SelectionRange): SelectionRange {
    if (range.empty) {
        const pos = skipAtomicRanges(sets, range.head, range.assoc < 0 ? -1 : 1)
        return pos === range.head ? range : EditorSelection.cursor(pos, range.assoc, range.bidiLevel, range.goalColumn)
    }
    const from = skipAtomicRanges(sets, range.from, -1)
    const to = skipAtomicRanges(sets, range.to, 1)
    if (from === range.from && to === range.to) return range
    return EditorSelection.range(from, to, range.assoc, range.goalColumn)
}
