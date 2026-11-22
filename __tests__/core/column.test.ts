import { describe, expect, it } from 'vitest'
import { countColumn, findColumn } from '../../src/core/model/column'

describe('countColumn / findColumn', () => {
    it('纯 ASCII 列 = 偏移', () => {
        expect(countColumn('hello', 4)).toBe(5)
        expect(findColumn('hello', 3, 4)).toBe(3)
    })

    it('tab 展开到 tabSize', () => {
        expect(countColumn('\thello', 4)).toBe(9) // 4 + 5
        expect(countColumn('ab\t', 4)).toBe(4)
        expect(findColumn('\thello', 4, 4)).toBe(1)
    })

    it('strict 不够长返 -1', () => {
        expect(findColumn('hi', 10, 4, true)).toBe(-1)
        expect(findColumn('hi', 10, 4, false)).toBe(2)
    })

    it('空串列 0', () => {
        expect(countColumn('', 4)).toBe(0)
        expect(findColumn('', 0, 4)).toBe(0)
        expect(findColumn('', 3, 4, true)).toBe(-1)
    })

    it('混合 tab：a + tab 落到下一制表位再加 b', () => {
        expect(countColumn('a\tb', 4)).toBe(5)
        expect(findColumn('a\tb', 4, 4)).toBe(2)
    })

    it('字素簇（emoji）占 1 列', () => {
        expect(countColumn('👍x', 4)).toBe(2)
        expect(findColumn('👍x', 1, 4)).toBe(2)
    })

    it('tab 后接 emoji：制表位 + 簇占 1 列', () => {
        expect(countColumn('\t👍x', 4)).toBe(6)
        expect(findColumn('\t👍x', 4, 4)).toBe(1)
        expect(findColumn('\t👍x', 5, 4)).toBe(3)
        expect(countColumn('👍\tx', 4)).toBe(5)
    })
})
