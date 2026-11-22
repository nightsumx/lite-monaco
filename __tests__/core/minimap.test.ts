// CM7 minimap overlay 的 DOM 几何契约 + resize 回归 —— 真页「小地图渲染不对」bug 类的单测地基。
//
// 根因(实测复现):overlay 只在 scroll/事务时重算,resize(ResizeObserver→onScroll)不通知 overlay,
// canvas/slider/panelH 全部陈旧。这里用 makeScrolled 桩几何(jsdom 无布局),attach minimapCM7,断言
// slider/canvas 的 DOM 几何随 scroll/resize 正确更新。jsdom 无 canvas → glyphInk() 返 null → drawTokens
// 静默早退,故只测几何(slider.style/canvas.style/wrap.style),不测像素。

import { describe, it, expect, vi } from 'vitest'
import { makeScrolled } from './input-harness'
import { minimapCM7, matchBands } from '../../src/core/chrome/minimap'
import { rulerPalette } from '../../src/product/theme'
import { EditorSelection } from '../../src/core/model/selection'
import { EditorState } from '../../src/core/model/state'
import type { ScopedShiki } from '../../src/core/view/tokens'

const bigDoc = () => Array.from({ length: 2000 }, (_, i) => `const v${i} = ${i}`).join('\n')
const opts = { lang: 'typescript', theme: 'dark-plus' }
const palette = rulerPalette({ bg: '#1e1e1e', fg: '#d4d4d4', dark: true })
// jsdom 无 canvas → drawTokens 在 glyphInk() 早退,hl 实际不被调,平凡桩足矣。
const hlStub = {} as ScopedShiki

const attach = (view: ReturnType<typeof makeScrolled>) => {
    const detach = minimapCM7(hlStub, opts, palette)(view)
    const wrap = view.dom.querySelector('.cm-minimap') as HTMLElement
    const slider = wrap.querySelector('.cm-minimap-slider') as HTMLElement
    const canvas = wrap.querySelector('canvas:not(.cm-minimap-hl)') as HTMLCanvasElement
    return { detach, wrap, slider, canvas }
}

describe('minimap overlay DOM 几何契约', () => {
    // 并行全量时 makeScrolled 偶发慢

    // 滑块几何 = Monaco MinimapLayout.create:sliderHeight = floor(视口行数 × minimapLineHeight / dpr),
    // minimap 放不下全文时按整行滚,sliderTop = (视口首行 − minimap 首行 + 行内比例) × minimapLineHeight / dpr。
    // 旧断言(51.8 / 连续的 scrollTop × k − mmScroll)是 lite-monaco 以前的连续律,不是 Monaco。
    // 第五轮对照页实测(/tmp/lc-hunt/r5/N/slider.ts,视口 518、行高 20):Monaco 与 lite-monaco 的 .minimap-slider
    // height 都是 51px,dpr 1.25/1.5/2/3 下 41/34/51/34px;top 在 6600 行文档(折叠 / 不折叠)、220 行文档各 scrollTop 上逐字相同
    it('slider 高度 = Monaco floor(518 / 20 × 2) = 51px', { timeout: 15_000 }, () => {
        // 并行全量时偶发慢；给足超时防 flaky

        const view = makeScrolled(bigDoc(), { clientHeight: 518, scrollTop: 0, lineHeight: 20, scrollHeight: 2000 * 20 })
        const { slider } = attach(view)
        expect(slider.style.height).toBe('51px')
    })

    it('slider.top 随 scroll 跟踪;wrap 无 JS pin(flex 兄弟天然固定)', { timeout: 15_000 }, () => {
        const view = makeScrolled(bigDoc(), { clientHeight: 518, scrollTop: 0, lineHeight: 20, scrollHeight: 2000 * 20 })
        const { slider, wrap } = attach(view)
        view.scrollDOM.scrollTop = 4000
        view.scrollDOM.dispatchEvent(new Event('scroll')) // attachOverlay 同步监听 → position() 立即跑
        // Monaco:maxSliderTop = min(518 − 51, 2000×2 − 51) = 467,ratio = 467 / (40000 − 518),理想 top = 4000 × ratio = 47.31;
        // 视口首行 201,minimap 首行 = floor(201 − 47.31 / 2) = 177 → top = (201 − 177 + 0) × 2 = 48(整行对齐)
        expect(slider.style.top).toBe('48px')
        expect(wrap.style.top).toBe('') // 拆分后 wrap 是 flex 兄弟,position() 不再写 top/left
    })
})

describe('onGeometry 只在尺寸变时发', () => {
    it('同尺寸滚动不触发 onGeometry；改 clientHeight 才触发', async () => {
        const view = makeScrolled(bigDoc(), { clientHeight: 518, scrollTop: 0, lineHeight: 20, scrollHeight: 2000 * 20 })
        let n = 0
        view.onGeometry(() => { n++ })
        view.scrollDOM.scrollTop = 400
        view.scrollDOM.dispatchEvent(new Event('scroll'))
        await new Promise(r => setTimeout(r, 20))
        expect(n).toBe(0)
        Object.defineProperty(view.scrollDOM, 'clientHeight', { configurable: true, get: () => 300 })
        view.scrollDOM.dispatchEvent(new Event('scroll'))
        await new Promise(r => setTimeout(r, 20))
        expect(n).toBe(1)
    })
})

describe('minimap overlay resize 回归(修前红)', () => {
    it('编辑器变高 518→300:canvas 与 slider 随之重算', { timeout: 15_000 }, () => {
        const view = makeScrolled(bigDoc(), { clientHeight: 518, scrollTop: 0, lineHeight: 20, scrollHeight: 2000 * 20 })
        const { slider, canvas } = attach(view)
        expect(canvas.style.height).toBe('518px')

        // 模拟容器 resize:重定义 scrollDOM.clientHeight getter,触发 position() 自愈路径。
        Object.defineProperty(view.scrollDOM, 'clientHeight', { configurable: true, get: () => 300 })
        view.scrollDOM.dispatchEvent(new Event('scroll'))

        expect(canvas.style.height).toBe('300px') // 修前:仍 518(applyPanelH 未被 position 调用)
        expect(parseFloat(slider.style.height)).toBeCloseTo(300 * 0.1, 3) // 300×k=30;修前仍 51.8
    })
})

// minimap 同词高亮 matchBands 契约(对齐 Monaco:标点/括号不亮,真词才亮)。
// 回归 bug:光标停在行尾(wordAt 取到末尾的 {)或标点上,曾把全文每个 { 染成色带 → minimap 密密麻麻。
describe('matchBands 同 state 不重扫', () => {
    it('二次调用返回同一引用', () => {
        const state = EditorState.create({
            doc: 'foo bar foo',
            selection: EditorSelection.single(0, 3),
        })
        expect(matchBands(state)).toBe(matchBands(state))
    })
})

describe('matchBands —— minimap 同词高亮不淹没', () => {
    const doc = 'function a(c: T | null): void {\n  b(c)\n}\nfunction d() {\n  e()\n}'
    const stCursor = (at: number) => EditorState.create({ doc, selection: EditorSelection.single(at) })
    const stSelect = (from: number, to: number) => EditorState.create({ doc, selection: EditorSelection.single(from, to) })

    it('光标停在行尾 {(wordAt 取到 {):零色带', () => {
        expect(matchBands(stCursor(doc.indexOf('\n'))).bands).toHaveLength(0)
    })

    // Monaco getWordAtPosition:位置贴着词尾也算这个词(对照页实测 /tmp/lc-hunt/r5/N/wordat.ts:'a|(' → a,'function| ' → function,
    // ')|:' → null)。所以「两边都不是词」才是零色带;第五轮把旧用例的光标挤到这种位置
    it('光标停在两个标点之间 ):零色带', () => {
        expect(matchBands(stCursor(doc.indexOf('):') + 1)).bands).toHaveLength(0)
    })

    it('光标贴着词尾(a|( 、function| ):算这个词', () => {
        expect(matchBands(stCursor(doc.indexOf('('))).bands).toHaveLength(1)
        expect(matchBands(stCursor(doc.indexOf(' '))).bands).toHaveLength(2)
    })

    it('光标停在真词上:投出同词带', () => {
        const { kind, bands } = matchBands(stCursor(doc.indexOf('function') + 2))
        expect(kind).toBe('word')
        expect(bands.length).toBe(2)
    })

    it('显式选中整词:selection 带', () => {
        const from = doc.indexOf('function')
        const { kind, bands } = matchBands(stSelect(from, from + 'function'.length))
        expect(kind).toBe('selection')
        expect(bands.length).toBe(2)
    })

    it('光标在空白中间:零色带', () => {
        expect(matchBands(stCursor(doc.indexOf('  b') + 1)).bands).toHaveLength(0)
    })
})

describe('EditorView.onGeometry 钩子', () => {
    it('同尺寸 scroll 不发 onGeometry；clientHeight 变才发', { timeout: 15_000 }, () => {
        vi.useFakeTimers()
        try {
            const view = makeScrolled(bigDoc(), { clientHeight: 518, scrollTop: 0, lineHeight: 20, scrollHeight: 2000 * 20 })
            let fired = 0
            view.onGeometry(() => { fired++ })
            view.scrollDOM.scrollTop = 8000
            view.scrollDOM.dispatchEvent(new Event('scroll'))
            vi.runAllTimers()
            expect(fired).toBe(0)
            Object.defineProperty(view.scrollDOM, 'clientHeight', { configurable: true, get: () => 300 })
            view.scrollDOM.dispatchEvent(new Event('scroll'))
            vi.runAllTimers()
            expect(fired).toBe(1)
        } finally {
            vi.useRealTimers()
        }
    })
})
