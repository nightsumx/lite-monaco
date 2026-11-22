// 期望值照 Monaco 0.52 viewLineRenderer 的可见列:每个 UTF-16 码元 1 列,全角 2 列,双向格式字符 8 列
import { describe, expect, it } from 'vitest'
import { findTabStops } from '../../src/core/feature/whitespace'

describe('findTabStops', () => {
    it('前面全是 ASCII 的 tab 交给 CSS,不标', () => {
        expect(findTabStops('a\tb\t', 4)).toEqual([])
        expect(findTabStops('\t\tx', 4)).toEqual([])
    })

    it('中文 2 列,之后同一行的 tab 都标上补到下一个 tab 位的列数', () => {
        expect(findTabStops('中a\tb\tc', 4)).toEqual([{ at: 2, cols: 1 }, { at: 4, cols: 3 }])
        expect(findTabStops('é\t', 4)).toEqual([{ at: 1, cols: 3 }])
    })

    it('代理对按 2 个码元算,双向格式字符 8 列,换行重新起算', () => {
        expect(findTabStops('\u{1F600}\t', 4)).toEqual([{ at: 2, cols: 2 }])
        expect(findTabStops('‮\t', 4)).toEqual([{ at: 1, cols: 4 }])
        expect(findTabStops('中\t\na\t', 8)).toEqual([{ at: 1, cols: 6 }])
    })
})
