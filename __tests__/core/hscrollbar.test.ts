import { describe, expect, it } from 'vitest'
import { hScrollGeometry, BAR_H } from '../../src/core/chrome/hscrollbar'

// §7 几何真源定律的回归闸门：横向滚动条 thumb 几何。
// 钉死的那条——thumbWidth 只随 vw/cw 变，与 scrollLeft 正交（绝不随滚动漂移）。
// 反模式（已判死）：靠 .cm-content.scrollWidth 撑条 → thumb 随 scrollLeft 抖。这里锁住不复发。

describe('hScrollGeometry —— 隐藏判定', () => {
    it('内容不溢出（cw ≤ vw）→ 隐藏', () => {
        expect(hScrollGeometry(500, 500, 0, 600).hidden).toBe(true)
        expect(hScrollGeometry(500, 400, 0, 600).hidden).toBe(true)
    })

    it('内容溢出（cw > vw）→ 显示', () => {
        expect(hScrollGeometry(500, 1000, 0, 600).hidden).toBe(false)
    })
})

describe('hScrollGeometry —— thumbWidth 恒定（定律核心）', () => {
    it('thumbWidth 与 scrollLeft 正交：滚到任意位置不变', () => {
        const vw = 478, cw = 1000, editorW = 586
        const at0 = hScrollGeometry(vw, cw, 0, editorW).thumbWidth
        const atMid = hScrollGeometry(vw, cw, 261, editorW).thumbWidth
        const atEnd = hScrollGeometry(vw, cw, cw - vw, editorW).thumbWidth
        expect(atMid).toBe(at0)
        expect(atEnd).toBe(at0)
    })

    it('thumbWidth = round(max(20, floor(vw·(vw+V)/(cw+V))))(Monaco ScrollbarState,V = 竖条宽)', () => {
        expect(hScrollGeometry(478, 1000, 0, 586).thumbWidth).toBe(Math.floor((478 * 478) / 1000))
        // p11:vw 541、contentWidth 1567(行宽 1539 + 4 列)、竖条 14 → Monaco 滑块 189
        expect(hScrollGeometry(541, 1567, 0, 680, 82, 14).thumbWidth).toBe(Math.floor(555 * 541 / 1581))
    })

    it('极窄视口 → 钳到 THUMB_MIN(20)', () => {
        // vw²/cw = 10²/1000 = 0.1，被下限 20 兜底
        expect(hScrollGeometry(10, 1000, 0, 100).thumbWidth).toBe(20)
    })
})

describe('hScrollGeometry —— thumbLeft 端点', () => {
    it('scrollLeft=0 → thumbLeft=0', () => {
        expect(hScrollGeometry(478, 1000, 0, 586).thumbLeft).toBe(0)
    })

    it('scrollLeft=最大(cw−vw) → thumbLeft=track 余量(vw−thumbWidth)', () => {
        const vw = 478, cw = 1000
        const g = hScrollGeometry(vw, cw, cw - vw, 586)
        expect(g.thumbLeft).toBeCloseTo(vw - g.thumbWidth)
    })

    it('thumbLeft 随 scrollLeft 单调递增', () => {
        const vw = 478, cw = 1000, editorW = 586
        const a = hScrollGeometry(vw, cw, 0, editorW).thumbLeft
        const b = hScrollGeometry(vw, cw, 100, editorW).thumbLeft
        const c = hScrollGeometry(vw, cw, 300, editorW).thumbLeft
        expect(b).toBeGreaterThan(a)
        expect(c).toBeGreaterThan(b)
    })
})

describe('hScrollGeometry —— rail 隔离 gutters / minimap / vscrollbar', () => {
    it('无 gutter：railRight = editorW − vw', () => {
        // editor 586 = scroller 478 + minimap 94 + scrollbar 14
        expect(hScrollGeometry(478, 1000, 0, 586).railRight).toBe(108)
    })

    it('有 gutter：railLeft + railRight 吃掉两侧列，轨道宽 = vw', () => {
        // editor 636 = gutter 50 + scroller 478 + minimap 94 + scrollbar 14
        const g = hScrollGeometry(478, 1000, 0, 636, 50)
        expect(g.railLeft).toBe(50)
        expect(g.railRight).toBe(108)
        expect(636 - g.railLeft - g.railRight).toBe(478)
    })

    it('无右侧列（editorW = vw）→ railRight = 0', () => {
        expect(hScrollGeometry(478, 1000, 0, 478).railRight).toBe(0)
    })
})

describe('BAR_H —— Monaco horizontalScrollbarSize 12', () => {
    it('横向条高 = 12', () => {
        expect(BAR_H).toBe(12)
    })
})
