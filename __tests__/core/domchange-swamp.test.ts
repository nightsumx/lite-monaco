import { describe, expect, it } from 'vitest'
import { findDiff } from '../../src/core/input/domchange'
import { LineBreakPlaceholder } from '../../src/core/view/domreader'

describe('domchange 沼泽化石（纯函数）', () => {
    it('findDiff 基础', () => {
        const d = findDiff('abc', 'aXc', 1, null)
        expect(d).toEqual({ from: 1, toA: 2, toB: 2 })
    })

    it('Chrome Shift-Enter 双换行：diff 覆盖两个 placeholder → toB 可减', () => {
        // 模拟行尾 diff 插入两个 PH
        const a = 'line'
        const b = 'line' + LineBreakPlaceholder + LineBreakPlaceholder
        const d = findDiff(a, b, 4, null)!
        expect(d.from).toBe(4)
        expect(d.toB - d.from).toBe(2)
        expect(b.slice(d.from, d.toB)).toBe(LineBreakPlaceholder + LineBreakPlaceholder)
        // 应用 H3 修正
        let toB = d.toB
        if (d.toB === d.from + 2 && b.slice(d.from, d.toB) === LineBreakPlaceholder + LineBreakPlaceholder)
            toB--
        expect(toB - d.from).toBe(1)
    })

    it('backspace preferredSide=end 仍能定位', () => {
        const d = findDiff('abcd', 'abd', 3, 'end')
        expect(d).not.toBeNull()
        expect(d!.from).toBe(2)
        expect(d!.toA).toBe(3)
    })

    it('空 → 一字：from 0', () => {
        const d = findDiff('', 'x', 0, null)
        expect(d).toEqual({ from: 0, toA: 0, toB: 1 })
    })

    it('全文删光', () => {
        const d = findDiff('abc', '', 0, null)
        expect(d).toEqual({ from: 0, toA: 3, toB: 0 })
    })

    it('相同串：无 diff', () => {
        expect(findDiff('abc', 'abc', 0, null)).toBeNull()
    })
})
