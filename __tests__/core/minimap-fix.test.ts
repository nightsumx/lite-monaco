// 第三轮 M 组:minimap 字形墨量 / 面板宽 / 折行视觉行,对齐 Monaco 0.52。
// 浏览器侧复现与截图:/tmp/lc-hunt/r3/b/mm5.ts(glyphInk 墨量)、/tmp/lc-hunt/r3/fix-M/{mmshot.ts,wrmm.ts}。
import { describe, it, expect } from 'vitest'
import { glyphInk, minimapLayoutWidth, wrapSegments, visualColumns, blendInk, minimapClickScrollTop, GLYPH } from '../../src/core/chrome/minimapcore'
import { minimapCM7 } from '../../src/core/chrome/minimap'
import { makeScrolled } from './input-harness'
import { rulerPalette } from '../../src/product/theme'
import type { ScopedShiki } from '../../src/core/view/tokens'

const inkOf = (g: NonNullable<ReturnType<typeof glyphInk>>, ch: string) => {
    const per = g.cw * g.ch, base = (ch.charCodeAt(0) - GLYPH.ASCII_LO) * per
    let s = 0
    for (let i = 0; i < per; i++) s += g.ink[base + i]
    return s
}

describe('minimap 字形墨量(Monaco minimapPreBaked)', () => {
    it('dpr 1 / 2 下细字形 f i l t ( ) 都有墨(修前 dpr2 点采样丢笔画 → 0)', () => {
        for (const dpr of [1, 2]) {
            const g = glyphInk(dpr)
            expect(g, `dpr ${dpr}`).not.toBeNull()
            expect(g!.cw).toBe(dpr)
            expect(g!.ch).toBe(2 * dpr)
            for (const ch of 'filt()|.,:;\'!') expect(inkOf(g!, ch), `dpr ${dpr} '${ch}'`).toBeGreaterThan(0)
        }
    })
    it('墨量 = Monaco 预烤表 × soften(暗底 12/15、亮底 50/60)', () => {
        // Monaco scale 1 表里 '!'(第 2 格)= 0x51 0x1D,'"' = 0x63 0x00
        const d = glyphInk(1)!, l = glyphInk(1, true)!
        expect([...d.ink.slice(0, 4)]).toEqual([0x51, 0x1D, 0x63, 0x00].map(v => Math.floor(v * 12 / 15)))
        expect([...l.ink.slice(0, 2)]).toEqual([0x51, 0x1D].map(v => Math.floor(v * 50 / 60)))
        // 粗字形不比 Monaco 淡:'m' 在 scale 2 的总墨量 = 预烤表 × 0.8
        expect(inkOf(glyphInk(2)!, 'm')).toBeGreaterThan(600)
    })
    it('blendInk:空像素直接写前景色(不把墨量乘两遍)', () => {
        const buf = new Uint8ClampedArray(4)
        blendInk(buf, 0, 200, 100, 50, 128)
        expect([...buf]).toEqual([200, 100, 50, 128])
    })
})

describe('minimap 面板宽(Monaco EditorLayoutInfoComputer)', () => {
    // 对照页实测:Monaco 宽 766 / 516、gutter 65、字宽 7.8268 → minimapWidth 85 / 57
    it('按编辑器宽、gutter、字宽、dpr 算,不写死 94', () => {
        const cw = 7.8267952127659575
        expect(minimapLayoutWidth({ outerWidth: 766, gutterWidth: 65, charWidth: cw, dpr: 1 })).toBe(85)
        expect(minimapLayoutWidth({ outerWidth: 516, gutterWidth: 65, charWidth: cw, dpr: 1 })).toBe(57)
        expect(minimapLayoutWidth({ outerWidth: 516, gutterWidth: 65, charWidth: cw, dpr: 2 })).toBe(57)
        // 宽编辑器:封顶 maxColumn 120 × charW
        expect(minimapLayoutWidth({ outerWidth: 3000, gutterWidth: 65, charWidth: cw, dpr: 1 })).toBe(120)
        // dpr 1.5:fontScale 1 → charW 2/3
        expect(minimapLayoutWidth({ outerWidth: 766, gutterWidth: 65, charWidth: cw, dpr: 1.5 })).toBe(Math.floor((766 - 65 - 16) * (2 / 3) / (cw + 2 / 3)) + 8)
    })
    it('overlay 把算出的宽写到 .cm-minimap 和 canvas 上', { timeout: 15_000 }, () => {
        const view = makeScrolled(Array.from({ length: 300 }, (_, i) => `x${i}`).join('\n'), { clientHeight: 518, scrollTop: 0, lineHeight: 20 })
        Object.defineProperty(view.dom, 'clientWidth', { configurable: true, get: () => 516 })
        view.dom.getBoundingClientRect = () => ({ left: 0, top: 0, right: 516, bottom: 518, width: 516, height: 518, x: 0, y: 0, toJSON() {} }) as DOMRect
        view.scrollDOM.getBoundingClientRect = () => ({ left: 65, top: 0, right: 445, bottom: 518, width: 380, height: 518, x: 65, y: 0, toJSON() {} }) as DOMRect
        view.oracle.charWidth = 7.8267952127659575
        const off = minimapCM7({} as ScopedShiki, { lang: 'typescript', theme: 'dark-plus' }, rulerPalette({ bg: '#1e1e1e', fg: '#d4d4d4', dark: true }))(view)
        const wrap = view.dom.querySelector('.cm-minimap') as HTMLElement
        expect(wrap.style.width).toBe('57px')
        expect((wrap.querySelector('canvas') as HTMLCanvasElement).width).toBe(57)
        off()
        view.destroy()
    })
})

describe('minimap 点击滚动(Monaco revealRange mouse Center)', () => {
    it('点中行的行顶居中:对照页 y=100/300/450 → Monaco 741/2741/4241(视口 518、行高 20)', () => {
        const block = (n: number) => ({ top: (n - 1) * 20, height: 20 })
        expect([100, 300, 450].map(y => minimapClickScrollTop(y, 0, 2, 600, block, 518, 1e6))).toEqual([741, 2741, 4241])
    })
})

describe('折行视觉行拆段(minimap 按 view line 画)', () => {
    it('长行(≥2000 字符)同一宽度重复拆分走记忆:同一个数组;换宽度 / tab 宽就重拆', () => {
        const text = 'word '.repeat(1000)
        const a = wrapSegments(text, 40, 4)
        expect(wrapSegments(text, 40, 4)).toBe(a)
        expect(wrapSegments(text, 40.7, 4)).toBe(a) // 列数按整数取
        const b = wrapSegments(text, 20, 4)
        expect(b).not.toBe(a)
        expect(b.length).toBeGreaterThan(a.length)
        expect(wrapSegments(text.replace('word', 'WORD'), 40, 4)).not.toBe(a)
    })

    it('空格串后断、行尾空格挂在本行、长词硬断、续行缩进 = 行首空格', () => {
        expect(wrapSegments('short', 10)).toEqual([{ from: 0, to: 5, indent: 0 }])
        // 'aaaa bbbb cccc' cols 10:'aaaa bbbb '(空格挂行尾)| 'cccc'
        expect(wrapSegments('aaaa bbbb cccc', 10)).toEqual([{ from: 0, to: 10, indent: 0 }, { from: 10, to: 14, indent: 0 }])
        expect(wrapSegments('aaaa bbbbbb cc', 10)).toEqual([{ from: 0, to: 5, indent: 0 }, { from: 5, to: 14, indent: 0 }])
        expect(wrapSegments('x'.repeat(25), 10).map(s => s.to)).toEqual([10, 20, 25])
        expect(wrapSegments('    aa bb cc dd', 10)).toEqual([{ from: 0, to: 10, indent: 0 }, { from: 10, to: 15, indent: 4 }])
    })
    it('tab 按 tab stop 展开(Monaco minimap 同此);纯 tab 行首续行缩进 tabs × tabSize', () => {
        expect([...visualColumns('\ta\tb', 4)!]).toEqual([0, 4, 5, 8, 9])
        expect(visualColumns('ab', 4)).toBeNull()
        // '\tx + x + x' 视觉宽 4+9=13,cols 10:首行 '\tx + x ' 视觉 4+6=10(空格挂行尾),续行缩进 4
        expect(wrapSegments('\tx + x + x', 10, 4)).toEqual([{ from: 0, to: 7, indent: 0 }, { from: 7, to: 10, indent: 4 }])
    })
})
