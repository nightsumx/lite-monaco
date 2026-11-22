// visualColumns 对长行记结果:minimap 重画对同一行问几十次,超长行每次都整行扫一遍(方向键移一格 50 ms)。
import { describe, expect, it } from 'vitest'
import { visualColumns } from '../../src/core/chrome/minimapcore'

describe('visualColumns 记忆', () => {
    const plain = 'abc '.repeat(5000)
    const mixed = 'ab\t中文 '.repeat(1000)
    it('纯 ASCII 长行:null,第二次同样', () => {
        expect(visualColumns(plain, 4)).toBeNull()
        expect(visualColumns(plain, 4)).toBeNull()
    })
    it('带 tab / 全角的长行:第二次是同一个数组(命中),内容对', () => {
        const a = visualColumns(mixed, 4)!
        expect(a).not.toBeNull()
        expect(visualColumns(mixed, 4)).toBe(a)
        expect(a[3]).toBe(4) // "ab" 两列,tab 补到 4
        expect(a[mixed.length]).toBeGreaterThan(mixed.length)
    })
    it('tabSize 变了不能用旧结果', () => {
        const a = visualColumns(mixed, 4)!
        const b = visualColumns(mixed, 8)!
        expect(b).not.toBe(a)
        expect(b[3]).toBe(8)
    })
    it('短行不记也对', () => {
        const s = 'a\tb'
        expect(Array.from(visualColumns(s, 4)!)).toEqual([0, 1, 4, 5])
    })
    it('超过容量后旧的被挤掉,结果仍对', () => {
        const texts = Array.from({ length: 12 }, (_, i) => 'x\t'.repeat(1500) + i)
        const first = visualColumns(texts[0], 4)!
        for (const t of texts.slice(1)) visualColumns(t, 4)
        const again = visualColumns(texts[0], 4)!
        expect(Array.from(again.slice(0, 20))).toEqual(Array.from(first.slice(0, 20)))
    })
})
