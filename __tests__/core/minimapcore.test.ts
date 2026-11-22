import { describe, expect, it } from 'vitest'
import { minimapRows, minimapScroll, sliderRect, hexRGB, minimapLayout, type LineIndex } from '../../src/core/chrome/minimapcore'

// doc stub:两行,行首偏移 0 / 6('abc\n' 起点各自)。minimapRows 只碰 lines + line(n).from。
const doc: LineIndex = { lines: 2, line: (n) => ({ from: n === 1 ? 0 : 6 }) }

describe('minimapRows', () => {
    it('offset 折算行内列,尾空白剪除,无色 token 丢弃', () => {
        const rows = minimapRows([
            [{ content: '  ', offset: 0 }, { content: 'foo ', offset: 2, color: '#abc' }],
            [{ content: 'bar', offset: 6, color: '#def' }, { content: '   ', offset: 9, color: '#000' }],
        ], doc)
        expect(rows).toEqual([
            { blocks: [{ x: 2, text: 'foo', color: '#abc' }] },   // 前导空格无色→丢;'foo '尾空格剪除;x=2(前导偏移)
            { blocks: [{ x: 0, text: 'bar', color: '#def' }] },   // 第二行 x=offset−行首6=0;纯空格块剪空→丢
        ])
    })
})

describe('hexRGB', () => {
    it('#rgb 与 #rrggbb 都解析', () => {
        expect(hexRGB('#abc')).toEqual([0xaa, 0xbb, 0xcc])
        expect(hexRGB('#1e2f3a')).toEqual([0x1e, 0x2f, 0x3a])
        expect(hexRGB('abc')).toEqual([0xaa, 0xbb, 0xcc])
    })
})

describe('minimapScroll', () => {
    it('短文档(整篇可见)恒 0', () => {
        expect(minimapScroll(500, 800, 400, 600)).toBe(0) // minimapContentH<panelH → maxMm≤0
    })
    it('长文档按 maxMm/maxEd 线性同步,到底夹紧', () => {
        // docH=2000 panelH=500 contentH=1500 → maxMm=1000 maxEd=1500;scrollTop=750 → 750×1000/1500=500
        expect(minimapScroll(750, 2000, 1500, 500)).toBe(500)
        expect(minimapScroll(1500, 2000, 1500, 500)).toBe(1000) // 编辑器到底 → minimap 到底(maxMm)
    })
    it('真页自滚区间(docH≫panelH):0→0、到底夹到 maxMm、中值线性', () => {
        // docH=40000 contentH=4000 panelH=300 → maxMm=3700 maxEd=39700
        expect(minimapScroll(0, 40000, 4000, 300)).toBe(0)
        expect(minimapScroll(39700, 40000, 4000, 300)).toBe(3700) // 到底夹到 maxMm
        expect(minimapScroll(19850, 40000, 4000, 300)).toBeCloseTo(19850 * 3700 / 39700, 5) // 中值线性
    })
})

describe('sliderRect', () => {
    it('top 随 scrollTop 缩放,height 至少一行', () => {
        // k = rowH/lineHeight = 2/20 = 0.1
        expect(sliderRect(1000, 400, 20, 2)).toEqual({ top: 100, height: 40 })
        expect(sliderRect(0, 5, 20, 2)).toEqual({ top: 0, height: 2 }) // 可见极小 → 至少 rowH
    })
    it('mmScroll 抵掉 minimap 自身偏移', () => {
        expect(sliderRect(1000, 400, 20, 2, 30)).toEqual({ top: 70, height: 40 }) // 100−30
    })
    it('自滚区间:mmScroll 大于 scrollTop×k → top 夹到 0;tiny clientHeight → height 夹到 rowH', () => {
        // k=0.1;scrollTop×k=50 < mmScroll=200 → top=max(0,50−200)=0
        expect(sliderRect(500, 300, 20, 2, 200)).toEqual({ top: 0, height: 30 }) // height=300×0.1=30
        // clientHeight=5 → 5×0.1=0.5 < rowH=2 → 夹到 2
        expect(sliderRect(1000, 5, 20, 2)).toEqual({ top: 100, height: 2 })
    })
    it('真页 51.8px:clientHeight=518 lineHeight=20 rowH=2 → height=51.8(几何正确,非 thumb 比例)', () => {
        expect(sliderRect(0, 518, 20, 2, 0).height).toBeCloseTo(51.8, 5)
    })
})

describe('Monaco minimap 像素布局 / 点击映射(P1-5)', () => {
    // Monaco EditorLayoutInfoComputer:minimapScale = pixelRatio ≥ 2 ? round(scale × 2) : scale,scale 1 → 只有 1 / 2 两档,
    // dpr 3 也是 2(字格 2×4 device px,行高 4 device px = 1.33 CSS px)。旧断言 dpr 3 → 3×6 是按 dpr 线性放大,不是 Monaco。
    // 第五轮对照页实测(/tmp/lc-hunt/r5/N/dpr.ts):dpr 1/1.25/1.5 → getLayoutInfo().minimap.minimapScale 1、lh 2;dpr 2/3 → 2、4,
    // 两边前 24 个 device 行的墨水像素数逐行相同
    it('字格 = Monaco minimapScale:dpr <2 → 1×2,dpr ≥2(含 3)→ 2×4 device px(字高 = 行高,不留缝)', async () => {
        const { glyphCell, minimapScale, minimapLineHeight } = await import('../../src/core/chrome/minimapcore')
        for (const dpr of [1, 1.25, 1.5]) {
            expect(glyphCell(dpr), `dpr ${dpr}`).toEqual({ cw: 1, ch: 2 })
            expect(minimapScale(dpr)).toBe(1)
            expect(minimapLineHeight(dpr)).toBe(2)
        }
        for (const dpr of [2, 3]) {
            expect(glyphCell(dpr), `dpr ${dpr}`).toEqual({ cw: 2, ch: 4 })
            expect(minimapScale(dpr)).toBe(2)
            expect(minimapLineHeight(dpr)).toBe(4)
        }
    })
    it('点击滑块外:点中的行滚到视口中间(Monaco revealLineNumber Center)', async () => {
        const { minimapClickScrollTop } = await import('../../src/core/chrome/minimapcore')
        const lh = 20
        const block = (n: number) => ({ top: (n - 1) * lh, height: lh })
        // 点在 minimap y=300、minimap 自身未滚:第 151 行 → 行顶 3000 居中(视口 600)→ 2700
        // (Monaco 鼠标来源 Center 是行顶居中,第三轮实测改正;旧值按行中线 2710)
        expect(minimapClickScrollTop(300, 0, 2, 1000, block, 600, 20000)).toBe(2700)
        // minimap 已滚 100px:第 201 行
        expect(minimapClickScrollTop(300, 100, 2, 1000, block, 600, 20000)).toBe(200 * lh - 300)
        // 夹到 [0, max]
        expect(minimapClickScrollTop(2, 0, 2, 1000, block, 600, 20000)).toBe(0)
        expect(minimapClickScrollTop(5000, 0, 2, 1000, block, 600, 19400)).toBe(19400)
    })
})

// Monaco MinimapLayout.create + scrollBeyondLastLine:底部多出 vh/lh − 1 行,滑块行程和「装得下」都按它算
describe('minimapLayout scrollBeyondLastLine', () => {
    const at = (lineCount: number, sbl: boolean, bottom: boolean) => {
        const scrollHeight = lineCount * 20 + (sbl ? 580 : 0)
        const scrollTop = bottom ? scrollHeight - 600 : 0
        return minimapLayout({
            dpr: 1, minimapLineHeight: 2, canvasInnerHeight: 600, minimapHeight: 600, lineHeight: 20, viewportHeight: 600,
            scrollTop, scrollHeight, lineCount, scrollBeyondLastLine: sbl,
            viewportStartLineNumber: Math.floor(scrollTop / 20) + 1, viewportStartLineNumberVerticalOffset: Math.floor(scrollTop / 20) * 20,
        })
    }
    it('滑块到底 = (lineCount + vh/lh − 1 − vh/lh − 1) × mlh', () => {
        expect(at(100, true, true).sliderTop).toBe(196)
        expect(at(100, false, true).sliderTop).toBe(140)
    })
    it('装得下要算上多出的行:280 行 + 29 > 300 行容量就要滚 minimap', () => {
        expect(at(280, false, true).startLineNumber).toBe(1)
        expect(at(280, true, true).startLineNumber).toBeGreaterThan(1)
    })
})
