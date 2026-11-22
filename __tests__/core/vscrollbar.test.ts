import { describe, expect, it } from 'vitest'
import { vScrollGeometry } from '../../src/core/chrome/vscrollbar'

describe('vScrollGeometry —— 隐藏判定', () => {
    it('内容不溢出（ch ≤ vh）→ 隐藏', () => {
        expect(vScrollGeometry(500, 500, 0).hidden).toBe(true)
        expect(vScrollGeometry(500, 400, 0).hidden).toBe(true)
    })

    it('内容溢出（ch > vh）→ 显示', () => {
        expect(vScrollGeometry(500, 1000, 0).hidden).toBe(false)
    })
})

describe('vScrollGeometry —— thumbHeight 恒定', () => {
    it('thumbHeight 与 scrollTop 正交', () => {
        const vh = 500, ch = 2000
        const at0 = vScrollGeometry(vh, ch, 0).thumbHeight
        const atMid = vScrollGeometry(vh, ch, 750).thumbHeight
        const atEnd = vScrollGeometry(vh, ch, ch - vh).thumbHeight
        expect(atMid).toBe(at0)
        expect(atEnd).toBe(at0)
    })

    it('thumbHeight = vh²/ch', () => {
        expect(vScrollGeometry(500, 2000, 0).thumbHeight).toBeCloseTo((500 * 500) / 2000)
    })

    it('极矮视口 → 钳到 THUMB_MIN(20)', () => {
        expect(vScrollGeometry(10, 1000, 0).thumbHeight).toBe(20)
    })
})

describe('vScrollGeometry —— thumbTop 端点', () => {
    it('scrollTop=0 → thumbTop=0', () => {
        expect(vScrollGeometry(500, 2000, 0).thumbTop).toBe(0)
    })

    it('scrollTop=最大 → thumbTop=轨道余量', () => {
        const vh = 500, ch = 2000
        const g = vScrollGeometry(vh, ch, ch - vh)
        expect(g.thumbTop).toBeCloseTo(vh - g.thumbHeight)
    })

    it('thumbTop 随 scrollTop 单调递增', () => {
        const a = vScrollGeometry(500, 2000, 0).thumbTop
        const b = vScrollGeometry(500, 2000, 400).thumbTop
        const c = vScrollGeometry(500, 2000, 1000).thumbTop
        expect(b).toBeGreaterThan(a)
        expect(c).toBeGreaterThan(b)
    })
})
