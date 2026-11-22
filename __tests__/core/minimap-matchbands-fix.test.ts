// 第六轮 V 组:minimap 同词色带 matchBands 只按 state 缓存,每个选区事务都 sliceDoc 全文 + findMatches 全文
// (2 万行 plaintext 里挪光标,剖面里占 dispatch 的四成多,/tmp/lc-hunt/r6/V/caret.ts PLAIN=1 PROF=caret)。
// 修后:命中按 (doc, 词) 缓存,选区在同一个词的各处之间挪不再扫;换词才扫,逐行扫且凑够 101 条就停(同旧上限)。
import { describe, expect, it } from 'vitest'
import { matchBands } from '../../src/core/chrome/minimap'
import { EditorSelection } from '../../src/core/model/selection'
import { EditorState } from '../../src/core/model/state'

const LINES = 20_000
const BIG = Array.from({ length: LINES }, (_, i) => `    const value${i} = Math.max(${i}, 7) + "item".length // line ${i}`).join('\n')

describe('matchBands:按 (doc, 词) 缓存,换选区不重扫', () => {
    const s0 = EditorState.create({ doc: BIG })
    const at = (line: number, col: number) => s0.update({ selection: EditorSelection.cursor(s0.doc.line(line).from + col) }).apply()

    it('同一个词的各处之间挪光标 / 选中整词:同一份命中', () => {
        const a = matchBands(at(10, 20)) // Math
        const b = matchBands(at(500, 21))
        const c = matchBands(s0.update({ selection: EditorSelection.single(s0.doc.line(7).from + 19, s0.doc.line(7).from + 23) }).apply())
        expect(a.kind).toBe('word')
        expect(c.kind).toBe('selection')
        expect(b.bands).toBe(a.bands)
        expect(c.bands).toBe(a.bands)
        // 旧上限:最多 101 条,文档序
        expect(a.bands.length).toBe(101)
        expect(a.bands[0]).toEqual({ line: 1, from: 19, to: 23 })
        expect(a.bands[100].line).toBe(101)
    })

    it('改文档:重扫,命中跟新文档', () => {
        const s1 = at(3, 10) // value2
        expect(matchBands(s1).bands).toEqual([{ line: 3, from: 10, to: 16 }])
        const s2 = s1.update({ changes: { from: s1.doc.line(1).from, insert: 'value2 ' } }).apply()
        expect(matchBands(s2).bands).toEqual([{ line: 1, from: 0, to: 6 }, { line: 3, from: 10, to: 16 }])
    })

    it('整词:value1 不命中 value10;区分大小写', () => {
        const s = at(2, 12) // value1
        expect(matchBands(s).bands).toEqual([{ line: 2, from: 10, to: 16 }])
        const t = EditorState.create({ doc: 'math Math MATH Math', selection: EditorSelection.cursor(6) })
        expect(matchBands(t).bands).toEqual([{ line: 1, from: 5, to: 9 }, { line: 1, from: 15, to: 19 }])
    })

    it(`${LINES} 行里在两个词之间来回挪 200 次 < 40ms(修前每次全文 slice + 扫,约 1ms+ 一次)`, () => {
        const xs = [at(4000, 12), at(4000, 20), at(9000, 12), at(9000, 21)]
        const t0 = performance.now()
        for (let i = 0; i < 200; i++) matchBands(xs[i % 4].update({ selection: xs[i % 4].selection }).apply())
        expect(performance.now() - t0).toBeLessThan(40)
    })
})
