// scrollbar.* / minimap.* 选项(Monaco IEditorScrollbarOptions / IEditorMinimapOptions)真生效:
// 非默认值改了 DOM / 几何 / 画法,默认值行为不变;运行时换选项(Compartment.reconfigure)立即生效。
// jsdom 没有布局和 canvas:几何靠桩,canvas 用录制 ctx 看画了什么;像素和真实滚动条手感 jsdom 测不了。
import { describe, it, expect, vi, afterEach } from 'vitest'
import { EditorView } from '../../src/core/view/editorview'
import { EditorState, Compartment } from '../../src/core/model/state'
import { history } from '../../src/core/edit/history'
import { editorOptions } from '../../src/core/options'
import type { IEditorOptions } from '../../src/core/options/types'
import { vScrollbarCM7, vScrollGeometry, scrollbarOf } from '../../src/core/chrome/vscrollbar'
import { hScrollbarCM7, hScrollGeometry } from '../../src/core/chrome/hscrollbar'
import { scrollbarWheelOptions } from '../../src/core/chrome/wheelopts'
import { minimapCM7 } from '../../src/core/chrome/minimap'
import { minimapSizing, minimapLineHeight, glyphInk, glyphCell, minimapLayoutWidth } from '../../src/core/chrome/minimapcore'
import { findSectionHeaders, fitSectionHeader } from '../../src/core/chrome/sectionheaders'
import { setDiagnostics, diagnosticsField } from '../../src/core/feature/diagnostics'
import { rulerPalette } from '../../src/product/theme'
import type { ScopedShiki } from '../../src/core/view/tokens'

const comp = new Compartment()
const palette = rulerPalette({ bg: '#1e1e1e', fg: '#d4d4d4', dark: true })
const doc = (n = 2000) => Array.from({ length: n }, (_, i) => `const v${i} = ${i}`).join('\n')
const LH = 20

function mk(opts: IEditorOptions = {}, text = doc(), h = 500) {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const view = new EditorView({
        state: EditorState.create({ doc: text, extensions: [comp.of(editorOptions.of(opts)), history(), diagnosticsField] }),
        parent: host,
    })
    Object.defineProperty(view.scrollDOM, 'clientHeight', { configurable: true, get: () => h })
    Object.defineProperty(view.scrollDOM, 'clientWidth', { configurable: true, get: () => 800 })
    let top = 0
    Object.defineProperty(view.scrollDOM, 'scrollTop', { configurable: true, get: () => top, set: v => { top = v } })
    const sh = view.state.doc.lines * LH
    Object.defineProperty(view.scrollDOM, 'scrollHeight', { configurable: true, get: () => sh })
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get() { return (this as HTMLElement).classList?.contains('cm-line') ? LH : 0 } })
    view.oracle.lineHeight = LH
    view.resetHeights()
    view.remeasure()
    return view
}
const setOpts = (view: EditorView, opts: IEditorOptions) => {
    view.dispatch(view.state.update({ effects: comp.reconfigure(editorOptions.of(opts)) }))
}
const scroll = (view: EditorView, to: number) => {
    view.scrollDOM.scrollTop = to
    view.scrollDOM.dispatchEvent(new Event('scroll'))
}

afterEach(() => { document.body.innerHTML = '' })

describe('scrollbar 选项:读 computed 值', () => {
    it('没有 liteMonaco() 时是 Monaco 默认值', () => {
        const sb = scrollbarOf(EditorState.create({ doc: '' }))
        expect(sb).toMatchObject({ useShadows: true, verticalScrollbarSize: 14, horizontalScrollbarSize: 12, verticalSliderSize: 14, horizontalSliderSize: 12, arrowSize: 11, verticalHasArrows: false, scrollByPage: false, handleMouseWheel: true, alwaysConsumeMouseWheel: true })
    })
})

describe('scrollbar.useShadows', () => {
    it('默认 true:scrollTop > 0 时顶部阴影显示;false 不显示;运行时切换立即生效', () => {
        const view = mk()
        const off = vScrollbarCM7(palette)(view)
        const shadow = view.dom.querySelector('.cm-scroll-decoration') as HTMLElement
        expect(shadow.classList.contains('cm-visible')).toBe(false)
        scroll(view, 100)
        expect(shadow.classList.contains('cm-visible')).toBe(true)
        setOpts(view, { scrollbar: { useShadows: false } })
        expect(shadow.classList.contains('cm-visible')).toBe(false)
        scroll(view, 200)
        expect(shadow.classList.contains('cm-visible')).toBe(false)
        setOpts(view, {})
        expect(shadow.classList.contains('cm-visible')).toBe(true)
        off()
    })
})

describe('scrollbar 竖条:大小 / 滑块 / 可见性 / 箭头 / 翻页', () => {
    it('默认:条宽 14、滑块 14 贴满;verticalScrollbarSize / verticalSliderSize 非默认值改宽度并居中滑块', () => {
        const view = mk()
        const off = vScrollbarCM7(palette)(view)
        const wrap = view.dom.querySelector('.cm-scrollbar') as HTMLElement
        const thumb = wrap.querySelector('.cm-scrollbar-thumb') as HTMLElement
        expect(wrap.style.width).toBe('14px')
        expect(thumb.style.width).toBe('14px')
        expect(thumb.style.left).toBe('0px')
        setOpts(view, { scrollbar: { verticalScrollbarSize: 20, verticalSliderSize: 6 } })
        expect(wrap.style.width).toBe('20px')
        expect(thumb.style.width).toBe('6px')
        expect(thumb.style.left).toBe('7px') // floor((20 − 6) / 2)
        expect((view.dom.querySelector('.cm-scroll-decoration') as HTMLElement).style.right).toBe('20px')
        off()
    })
    it('vertical: hidden 加 cm-sb-hidden,visible 让滑块常显,auto(默认)两者都没有', () => {
        const view = mk()
        const off = vScrollbarCM7(palette)(view)
        const wrap = view.dom.querySelector('.cm-scrollbar') as HTMLElement
        const thumb = wrap.querySelector('.cm-scrollbar-thumb') as HTMLElement
        expect(wrap.classList.contains('cm-sb-hidden')).toBe(false)
        expect(thumb.classList.contains('cm-sb-always')).toBe(false)
        setOpts(view, { scrollbar: { vertical: 'hidden' } })
        expect(wrap.classList.contains('cm-sb-hidden')).toBe(true)
        setOpts(view, { scrollbar: { vertical: 'visible' } })
        expect(wrap.classList.contains('cm-sb-hidden')).toBe(false)
        expect(thumb.classList.contains('cm-sb-always')).toBe(true)
        off()
    })
    it('verticalHasArrows:两端箭头(arrowSize 高),滑块轨道缩短并下移 arrowSize', () => {
        const view = mk()
        const off = vScrollbarCM7(palette)(view)
        const wrap = view.dom.querySelector('.cm-scrollbar') as HTMLElement
        const arrows = [...wrap.querySelectorAll<HTMLElement>('.cm-sb-arrow')]
        expect(arrows).toHaveLength(2)
        expect(arrows.every(a => a.style.display === 'none')).toBe(true)
        setOpts(view, { scrollbar: { verticalHasArrows: true, arrowSize: 11 } })
        expect(arrows.every(a => a.style.display === '' && a.style.height === '11px')).toBe(true)
        const thumb = wrap.querySelector('.cm-scrollbar-thumb') as HTMLElement
        expect(parseInt(thumb.style.top)).toBe(11) // scrollTop 0:紧挨上箭头
        // 纯几何:track = vh − 2·arrow
        const g = vScrollGeometry(500, 2000, 0, 11)
        expect(g.thumbHeight).toBe(Math.round(Math.max(20, Math.floor((478 * 500) / 2000))))
        expect(vScrollGeometry(500, 2000, 1500, 11).thumbTop + vScrollGeometry(500, 2000, 1500, 11).thumbHeight).toBe(500 - 11)
        expect(vScrollGeometry(500, 2000, 0).thumbTop).toBe(0) // 默认无箭头不变
        off()
    })
    it('点箭头滚 50px(Monaco ScrollbarArrow → onMouseWheel(±1))× mouseWheelScrollSensitivity', () => {
        const view = mk({ scrollbar: { verticalHasArrows: true } })
        const off = vScrollbarCM7(palette)(view)
        const down = view.dom.querySelector('.cm-sb-arrow-down') as HTMLElement
        down.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }))
        window.dispatchEvent(new Event('pointerup'))
        expect(view.scrollDOM.scrollTop).toBe(50)
        off()
    })
    it('scrollByPage:点轨道翻一页;默认跳到点击位置', () => {
        const mkClick = (y: number) => Object.assign(new Event('pointerdown', { bubbles: true, cancelable: true }), { clientY: y })
        const a = mk({ scrollbar: { scrollByPage: true } })
        const offA = vScrollbarCM7(palette)(a)
        const wrapA = a.dom.querySelector('.cm-scrollbar') as HTMLElement
        scroll(a, 1000)
        wrapA.dispatchEvent(mkClick(499)) // 滑块在上半,点最下面 → 往下翻一页
        window.dispatchEvent(new Event('pointerup'))
        expect(a.scrollDOM.scrollTop).toBe(1000 + 500)
        offA()
        const b = mk()
        const offB = vScrollbarCM7(palette)(b)
        const wrapB = b.dom.querySelector('.cm-scrollbar') as HTMLElement
        scroll(b, 1000)
        wrapB.dispatchEvent(mkClick(499))
        window.dispatchEvent(new Event('pointerup'))
        expect(b.scrollDOM.scrollTop).not.toBe(1500) // 跳到点击位置(≈ 底部)
        expect(b.scrollDOM.scrollTop).toBeGreaterThan(1500)
        offB()
    })
})

describe('scrollbar 横条', () => {
    const text = 'x'.repeat(5000) + '\n' + doc(50)
    it('horizontalScrollbarSize / horizontalSliderSize / horizontal 可见性 / 箭头', () => {
        const view = mk({}, text)
        const off = hScrollbarCM7(14)(view)
        const wrap = view.dom.querySelector('.cm-hscrollbar') as HTMLElement
        const thumb = wrap.querySelector('.cm-hscrollbar-thumb') as HTMLElement
        expect(wrap.style.height).toBe('12px')
        expect(thumb.style.height).toBe('12px')
        setOpts(view, { scrollbar: { horizontalScrollbarSize: 18, horizontalSliderSize: 8, horizontal: 'hidden', horizontalHasArrows: true } })
        expect(wrap.style.height).toBe('18px')
        expect(thumb.style.height).toBe('8px')
        expect(thumb.style.top).toBe('5px') // floor((18 − 8) / 2)
        expect(wrap.classList.contains('cm-sb-hidden')).toBe(true)
        expect([...wrap.querySelectorAll<HTMLElement>('.cm-sb-arrow')].every(a => a.style.display === '' && a.style.width === '11px')).toBe(true)
        setOpts(view, { scrollbar: { horizontal: 'visible' } })
        expect(thumb.classList.contains('cm-sb-always')).toBe(true)
        off()
    })
    it('hScrollGeometry 的箭头:轨道缩 2·arrow,滑块左移 arrow;默认不变', () => {
        const a = hScrollGeometry(800, 4000, 0, 800, 0, 0, 0)
        const b = hScrollGeometry(800, 4000, 0, 800, 0, 0, 11)
        expect(a.thumbLeft).toBe(0)
        expect(b.thumbLeft).toBe(11)
        expect(b.thumbWidth).toBeLessThan(a.thumbWidth + 1)
        const end = hScrollGeometry(800, 4000, 3200, 800, 0, 0, 11)
        expect(end.thumbLeft + end.thumbWidth).toBe(800 - 11)
    })
})

describe('scrollbar.handleMouseWheel / alwaysConsumeMouseWheel', () => {
    const wheel = (view: EditorView, deltaY = 100) => {
        const e = new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true })
        view.contentDOM.dispatchEvent(e)
        return e
    }
    it('默认:滚轮滚编辑器并吞掉事件', () => {
        const view = mk()
        const off = scrollbarWheelOptions(view)
        const e = wheel(view)
        expect(view.scrollDOM.scrollTop).toBeGreaterThan(0)
        expect(e.defaultPrevented).toBe(true)
        off()
    })
    it('handleMouseWheel:false 编辑器不动(滚动让给外层)', () => {
        const view = mk({ scrollbar: { handleMouseWheel: false } })
        const off = scrollbarWheelOptions(view)
        const outer = vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
        const e = wheel(view)
        expect(view.scrollDOM.scrollTop).toBe(0)
        expect(e.defaultPrevented).toBe(true)
        expect(outer).toHaveBeenCalledWith(0, 100)
        setOpts(view, {})
        wheel(view)
        expect(view.scrollDOM.scrollTop).toBeGreaterThan(0)
        off()
        outer.mockRestore()
    })
    it('alwaysConsumeMouseWheel:默认 true 吞;false 时滚不动就放行', () => {
        const stuck = (v: EditorView) => Object.defineProperty(v.scrollDOM, 'scrollTop', { configurable: true, get: () => 0, set: () => {} })
        const a = mk()
        stuck(a)
        const offA = scrollbarWheelOptions(a)
        expect(wheel(a).defaultPrevented).toBe(true)
        offA()
        const b = mk({ scrollbar: { alwaysConsumeMouseWheel: false } })
        stuck(b)
        const offB = scrollbarWheelOptions(b)
        expect(wheel(b).defaultPrevented).toBe(false)
        offB()
    })
})

describe('minimap 选项(DOM 层)', () => {
    const hl = {} as ScopedShiki
    const attach = (view: EditorView) => {
        const off = minimapCM7(hl, { lang: 'typescript', theme: 'dark-plus' }, palette)(view)
        return { off, wrap: view.dom.querySelector('.cm-minimap') as HTMLElement, slider: view.dom.querySelector('.cm-minimap-slider') as HTMLElement }
    }
    it('默认:右侧、显示、宽 = floor(maxColumn 120 × 1 / dpr 1) = 120', () => {
        const view = mk()
        const { wrap, off } = attach(view)
        expect(wrap.style.display).toBe('')
        expect(wrap.style.order).toBe('')
        expect(wrap.style.width).toBe('120px')
        expect(wrap.classList.contains('cm-minimap-slider-always')).toBe(false)
        expect(wrap.classList.contains('cm-minimap-autohide-mouseover')).toBe(false)
        expect(wrap.classList.contains('cm-minimap-autohide-scroll')).toBe(false)
        off()
    })
    it('enabled:false:不显示,查找框让位变量归零;重新打开恢复', () => {
        const view = mk({ minimap: { enabled: false } })
        const { wrap, off } = attach(view)
        expect(wrap.style.display).toBe('none')
        expect(view.dom.style.getPropertyValue('--cm-minimap-w')).toBe('0px')
        setOpts(view, {})
        expect(wrap.style.display).toBe('')
        expect(wrap.style.width).toBe('120px')
        expect(view.dom.style.getPropertyValue('--cm-minimap-w')).toBe('120px')
        off()
    })
    it("side:'left':排到最左(order −1),不再给右上角浮层让位", () => {
        const view = mk({ minimap: { side: 'left' } })
        const { wrap, off } = attach(view)
        expect(wrap.style.order).toBe('-1')
        expect(wrap.classList.contains('cm-minimap-left')).toBe(true)
        expect(view.dom.style.getPropertyValue('--cm-minimap-w')).toBe('0px')
        expect((view.dom.querySelector('.cm-minimap-shadow') as HTMLElement).style.display).toBe('none')
        off()
    })
    it("showSlider:'always' / autohide:'mouseover' 加对应的类;autohide 'none' 去掉", () => {
        const view = mk({ minimap: { showSlider: 'always', autohide: 'mouseover' } })
        const { wrap, off } = attach(view)
        expect(wrap.classList.contains('cm-minimap-slider-always')).toBe(true)
        expect(wrap.classList.contains('cm-minimap-autohide-mouseover')).toBe(true)
        expect(wrap.classList.contains('cm-minimap-autohide-scroll')).toBe(false)
        setOpts(view, { minimap: { showSlider: 'mouseover', autohide: 'none' } })
        expect(wrap.classList.contains('cm-minimap-slider-always')).toBe(false)
        expect(wrap.classList.contains('cm-minimap-autohide-mouseover')).toBe(false)
        off()
    })
    it("autohide:'scroll'(Monaco 0.55):加 scroll 类;布尔值不是合法输入,按 Monaco validate 回落默认 'none'", () => {
        const view = mk({ minimap: { autohide: 'scroll' } })
        const { wrap, off } = attach(view)
        expect(wrap.classList.contains('cm-minimap-autohide-scroll')).toBe(true)
        expect(wrap.classList.contains('cm-minimap-autohide-mouseover')).toBe(false)
        off()
        const legacy = mk({ minimap: { autohide: true as never } })
        const l = attach(legacy)
        expect(l.wrap.classList.contains('cm-minimap-autohide-mouseover')).toBe(false)
        expect(l.wrap.classList.contains('cm-minimap-autohide-scroll')).toBe(false)
        l.off()
    })
    it('maxColumn / scale:面板宽 = floor(maxColumn × minimapScale / dpr)', () => {
        const a = mk({ minimap: { maxColumn: 60 } })
        const x = attach(a)
        expect(x.wrap.style.width).toBe('60px')
        x.off()
        const b = mk({ minimap: { scale: 2 } })
        const y = attach(b)
        expect(y.wrap.style.width).toBe('240px') // 字格 2 倍宽:120 列 × 2
        // 滑块高 = floor(视口行数 × minimapLineHeight(2·scale)/ dpr) = floor(500/20 × 4)
        scroll(b, 0)
        expect(y.slider.style.height).toBe('100px')
        y.off()
    })
    it('renderCharacters:false:色块模式,行高 3 × scale,滑块高随之变', () => {
        const view = mk({ minimap: { renderCharacters: false } })
        const { slider, off } = attach(view)
        scroll(view, 0)
        expect(slider.style.height).toBe('75px') // floor(25 × 3)
        off()
    })
})

describe('minimap 纯函数:scale / renderCharacters / size', () => {
    it('minimapLineHeight:scale 与 dpr 倍增;色块模式 baseCharHeight 3', () => {
        expect(minimapLineHeight(1)).toBe(2)
        expect(minimapLineHeight(1, 2)).toBe(4)
        expect(minimapLineHeight(2, 1)).toBe(4)
        expect(minimapLineHeight(2, 1.5)).toBe(6) // round(1.5 × 2) = 3 → 3 × 2
        expect(minimapLineHeight(1, 1, false)).toBe(3)
        expect(minimapLineHeight(1, 3, false)).toBe(9)
    })
    it('glyphCell / glyphInk:色块墨量是整块半透明,文字模式是预烤字形', () => {
        expect(glyphCell(1, 3)).toEqual({ cw: 3, ch: 6 })
        const blocks = glyphInk(1, false, 1, false)!
        expect(new Set(blocks.ink)).toEqual(new Set([128]))
        const text = glyphInk(1, false, 1, true)!
        expect(new Set(text.ink).size).toBeGreaterThan(2)
        expect(glyphInk(1, false, 1, false)).toBe(blocks) // 缓存
    })
    it('minimapLayoutWidth:maxColumn / 字格倍数', () => {
        const base = { outerWidth: 1e6, gutterWidth: 0, charWidth: 7, dpr: 1 }
        expect(minimapLayoutWidth(base)).toBe(120)
        expect(minimapLayoutWidth({ ...base, maxColumn: 80 })).toBe(80)
        expect(minimapLayoutWidth({ ...base, fontScale: 2 })).toBe(240)
        expect(minimapLayoutWidth({ ...base, fontScale: 2, widthMultiplier: 2 })).toBe(120)
        // 窄编辑器由宽度公式限制
        expect(minimapLayoutWidth({ ...base, outerWidth: 500 })).toBe(Math.floor(((500 - 14 - 2) * 1) / (7 + 1)) + 8)
    })
    it("minimap.size:'proportional' 不变;'fill' 把短文档拉满编辑器高度;'fit' 装得下就不动", () => {
        const base = { scale: 1, renderCharacters: true, dpr: 1, outerHeight: 500, lineHeight: 20 }
        expect(minimapSizing({ ...base, size: 'proportional', viewLineCount: 10 })).toMatchObject({ lineHeight: 2, scale: 1, heightIsEditorHeight: false })
        const fill = minimapSizing({ ...base, size: 'fill', viewLineCount: 10 })
        expect(fill.heightIsEditorHeight).toBe(true)
        expect(fill.lineHeight).toBe(20) // min(行高 20 × dpr, floor(1 / (10 / 500)) = 50)
        expect(fill.scale).toBe(2) // min(scale + 1, floor(20 / 2))
        expect(fill.widthMultiplier).toBe(2)
        expect(minimapSizing({ ...base, size: 'fit', viewLineCount: 10 })).toMatchObject({ lineHeight: 2, scale: 1, heightIsEditorHeight: false })
        // 'fit' 装不下(1000 行 × 2 > 500):变 fill 的采样
        expect(minimapSizing({ ...base, size: 'fit', viewLineCount: 1000 })).toMatchObject({ isSampling: true, lineHeight: 1, scale: 1 })
    })
})

describe('minimap 区段标题', () => {
    const markers = { start: [['//', { ws: 0 }, { opt: '#' }, { word: 'region' }]] as never, end: [] }
    it('region 标记:标题 = 标记后的文字;只去首尾的 -(空格留着,Monaco 同);以 - 开头有分隔线;空标题且无分隔线不算', () => {
        const lines = ['// #region Setup', '// #region -- Utils --', '// #region', '// #region ---', 'code']
        const hs = findSectionHeaders(lines, { region: true, mark: false, markers })
        expect(hs.map(h => [h.line, h.text, h.hasSeparatorLine, h.shouldBeInComments])).toEqual([
            [1, 'Setup', false, false], [2, ' Utils ', true, false], [4, '', true, false],
        ])
        expect(hs[0].startColumn).toBe(11) // 标记 "// #region" 占 10 列,标题文字(含前导空格)从第 11 列起
    })
    it('MARK:标题从 MARK: 之后取(默认正则 label / separator 两个命名组,Monaco 0.55),标记在注释里(shouldBeInComments)', () => {
        const hs = findSectionHeaders(['// MARK: - Helpers', 'let MARK: x', 'MARK:'], { region: false, mark: true, markers: null })
        expect(hs.map(h => [h.line, h.text, h.hasSeparatorLine, h.shouldBeInComments])).toEqual([
            [1, 'Helpers', true, true], [2, 'x', false, true],
        ])
    })
    it('开关各管各的;关掉不出标题', () => {
        const lines = ['// #region A', '// MARK: B']
        expect(findSectionHeaders(lines, { region: true, mark: false, markers }).map(h => h.text)).toEqual(['A'])
        expect(findSectionHeaders(lines, { region: false, mark: true, markers }).map(h => h.text)).toEqual(['B'])
        expect(findSectionHeaders(lines, { region: false, mark: false, markers })).toEqual([])
    })
    it('fitSectionHeader:放得下原样,放不下头尾夹省略号', () => {
        const measure = (s: string) => s.length * 10
        expect(fitSectionHeader(measure, 200, 'short')).toBe('short')
        const fitted = fitSectionHeader(measure, 100, 'a very long section header title')
        expect(fitted).toContain('…')
        expect(fitted.length).toBeLessThan('a very long section header title'.length)
        expect(fitted.startsWith('a ve')).toBe(true)
        expect(fitted.endsWith('itle')).toBe(true)
    })
})

describe('minimap 画布:区段标题与诊断装饰(录制 ctx)', () => {
    function recordCanvas() {
        const calls: { fn: string, args: unknown[], fillStyle: unknown }[] = []
        const ctx: Record<string, unknown> = { fillStyle: '', strokeStyle: '', font: '', lineWidth: 1, letterSpacing: '', globalAlpha: 1 }
        for (const fn of ['fillRect', 'fillText', 'clearRect', 'save', 'restore', 'beginPath', 'moveTo', 'lineTo', 'closePath', 'stroke', 'putImageData', 'drawImage'])
            ctx[fn] = (...args: unknown[]) => { calls.push({ fn, args, fillStyle: ctx.fillStyle }) }
        ctx.measureText = (s: string) => ({ width: s.length * 5 })
        ctx.createImageData = (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h })
        const spy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => ctx) as never)
        return { calls, spy }
    }
    const text = '// #region Alpha\nconst a = 1\n// MARK: Beta\nconst b = 2\n'
    const hl = {} as ScopedShiki
    // 字形和命中层在首帧之后画(afterNextPaint,没 rAF 或不触发时 200ms 兜底):等它画完再看录下的调用
    const settle = () => new Promise(r => setTimeout(r, 260))
    const run = async (opts: IEditorOptions, setup?: (v: EditorView) => void) => {
        const rec = recordCanvas()
        const view = mk(opts, text)
        setup?.(view)
        const off = minimapCM7(hl, { lang: 'typescript', theme: 'dark-plus' }, palette)(view)
        await settle()
        return { rec, view, off }
    }
    it('默认:region 与 MARK 标题都画(fillText),字号 = sectionHeaderFontSize 9,字距 1px', async () => {
        const { rec, off } = await run({})
        const texts = rec.calls.filter(c => c.fn === 'fillText').map(c => c.args[0])
        expect(texts).toContain('Alpha')
        expect(texts).toContain('Beta')
        off()
        rec.spy.mockRestore()
    })
    it('showRegionSectionHeaders:false / showMarkSectionHeaders:false 各管各的', async () => {
        const a = await run({ minimap: { showRegionSectionHeaders: false } })
        const ta = a.rec.calls.filter(c => c.fn === 'fillText').map(c => c.args[0])
        expect(ta).not.toContain('Alpha')
        expect(ta).toContain('Beta')
        a.off(); a.rec.spy.mockRestore()
        const b = await run({ minimap: { showMarkSectionHeaders: false } })
        const tb = b.rec.calls.filter(c => c.fn === 'fillText').map(c => c.args[0])
        expect(tb).toContain('Alpha')
        expect(tb).not.toContain('Beta')
        b.off(); b.rec.spy.mockRestore()
    })
    it('sectionHeaderFontSize / sectionHeaderLetterSpacing 进画笔', async () => {
        const rec = recordCanvas()
        const view = mk({ minimap: { sectionHeaderFontSize: 14, sectionHeaderLetterSpacing: 3 } }, text)
        const fonts: string[] = []
        const spacing: string[] = []
        const proto = rec.spy.getMockImplementation()!
        const ctx = (proto as unknown as () => Record<string, unknown>)()
        Object.defineProperty(ctx, 'font', { configurable: true, get: () => fonts[fonts.length - 1] ?? '', set: v => { fonts.push(v) } })
        Object.defineProperty(ctx, 'letterSpacing', { configurable: true, get: () => spacing[spacing.length - 1] ?? '', set: v => { spacing.push(v) } })
        const off = minimapCM7(hl, { lang: 'typescript', theme: 'dark-plus' }, palette)(view)
        await settle()
        expect(fonts.some(f => f.startsWith('500 14px '))).toBe(true)
        expect(spacing).toContain('3px')
        off()
        rec.spy.mockRestore()
    })
    it('诊断标记画进 minimap(error 红 70%、zIndex 最高)', async () => {
        const { rec, off } = await run({}, v => {
            v.dispatch(v.state.update({ effects: setDiagnostics.of([{ from: 27, to: 28, severity: 'error', message: 'x' }]) }))
        })
        // 装饰行底(半透明整行)用红色 fillRect
        expect(rec.calls.some(c => c.fn === 'fillRect' && c.fillStyle === 'rgba(255, 18, 18, 0.7)')).toBe(true)
        off()
        rec.spy.mockRestore()
    })
})
