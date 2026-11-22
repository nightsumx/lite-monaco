// indentOf / leadingCols 的热路径写法(charCode 循环,不分配 trim() 串)与原语义一致。
import { describe, expect, it } from 'vitest'
import { indentOf, leadingCols } from '../../src/core/edit/indent'

describe('indentOf', () => {
    it('空白行 = -1,包括 trim() 认得的非 ASCII 空白', () => {
        for (const t of ['', '   ', '\t\t', ' \t ', '\r', '  \r', '\u00a0', '  \u3000', '\u2003\u2003', '\ufeff'])
            expect(indentOf(t), JSON.stringify(t)).toBe(t.trim() === '' ? -1 : leadingCols(t, 4))
    })
    it('非空白行 = 前导列数,tab 按 tabSize 对齐', () => {
        expect(indentOf('x')).toBe(0)
        expect(indentOf('    x')).toBe(4)
        expect(indentOf('\tx', 4)).toBe(4)
        expect(indentOf('  \tx', 4)).toBe(4)
        expect(indentOf(' \tx', 8)).toBe(8)
        expect(indentOf('  é', 4)).toBe(2)
        expect(indentOf('\u00a0x', 4)).toBe(0)
    })
})
