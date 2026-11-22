// 第七轮:foldingMaximumRegions(Monaco 默认 5000,取值 10–65000)。缩进 provider 的 RangesCollector.toIndentRanges:
// 块数超过上限时按缩进层从浅到深整层收,收不下整层的那一层从文档顶往下收到满为止,更深的全丢。
// 对照页实测(/tmp/lc-hunt/r7/monaco-foldlimit.ts):4 段 a/b/c/d(12 块,缩进 0 / 2 / 4)、上限 10
// → 1-4 2-4 3-4 5-8 6-8 7-8 9-12 10-12 13-17 14-17(缩进 4 只留前两段的)。修前:不设上限。
import { describe, expect, it } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { collectFoldableLines, foldable, foldingMaximumRegions } from '../../src/core/edit/fold'

const block = (i: number) => `a${i}\n  b${i}\n    c${i}\n      d${i}`

function regions(state: EditorState): string[] {
    const doc = state.doc
    return collectFoldableLines(state).map(n => `${n}-${doc.lineAt(foldable(state, doc.line(n).from)!.to).number}`)
}

describe('foldingMaximumRegions', () => {
    it('上限 10:与 Monaco 实测一致', () => {
        const s = EditorState.create({ doc: [0, 1, 2, 3].map(block).join('\n') + '\n', extensions: [foldingMaximumRegions.of(10)] })
        expect(regions(s)).toEqual(['1-4', '2-4', '3-4', '5-8', '6-8', '7-8', '9-12', '10-12', '13-17', '14-17'])
    })

    it('上限低于 10 按 10 算;不超上限时全留', () => {
        const doc = [0, 1, 2, 3].map(block).join('\n') + '\n'
        expect(regions(EditorState.create({ doc, extensions: [foldingMaximumRegions.of(3)] })).length).toBe(10)
        expect(regions(EditorState.create({ doc, extensions: [foldingMaximumRegions.of(12)] })).length).toBe(12)
    })

    it('默认 5000:6000 块时缩进 0 的 3000 块全留,缩进 2 的只留前 2000 块', () => {
        const doc = Array.from({ length: 3000 }, (_, i) => `a${i}\n  b${i}\n    c${i}`).join('\n')
        const s = EditorState.create({ doc })
        const lines = collectFoldableLines(s)
        expect(lines.length).toBe(5000)
        const line = (k: number, row: number) => 3 * k + row + 1
        expect(foldable(s, s.doc.line(line(1999, 1)).from)).not.toBeNull()
        expect(foldable(s, s.doc.line(line(2000, 1)).from)).toBeNull()
        expect(foldable(s, s.doc.line(line(2999, 0)).from)).not.toBeNull()
    })
})
