// V:视图选项(文字度量 / 换行 / 光标 / 渲染 / gutter)——非默认值时真的改了视图。
// jsdom 无布局,几何走 v-helpers 的网格桩;像素级结果见 /tmp/parity/done/V.md 的 headless chrome 抽检。

import { describe, expect, it } from 'vitest'
import { editorOptions, resolveEditorOptions, type IEditorOptions } from '../../src/core/options'
import { EditorSelection } from '../../src/core/model/selection'
import { InputMode } from '../../src/core/edit/inputmode'
import { Decoration } from '../../src/core/model/decoration'
import { RangeSet } from '../../src/core/model/rangeset'
import { EditorView, decorations } from '../../src/core/view/editorview'
import { EditorZoom } from '../../src/core/view/viewapi'
import { GRID, installGrid, lines, mount } from './v-helpers'

const apply = (view: EditorView, raw: IEditorOptions) => view.applyViewOptions(resolveEditorOptions(raw, view.getResolveEnv()))

describe('默认值不动 DOM', () => {
    it('不设选项:className / 内联样式和以前一样', () => {
        const geo = installGrid()
        const { view } = mount(lines(5), { lineNumbers: true }, [], geo)
        expect(view.dom.className).toBe('cm-editor')
        expect(view.dom.getAttribute('style') ?? '').toBe('')
        expect(view.contentDOM.getAttribute('style') ?? '').not.toMatch(/width/)
        expect(view.fontInfo().fontSize).toBeGreaterThan(0)
    })

    it('构造时 facet 里的非默认选项直接生效', () => {
        const geo = installGrid()
        const { view } = mount(lines(5), {}, [editorOptions.of({ fontSize: 20, lineHeight: 30, letterSpacing: 1 })], geo)
        expect(view.dom.style.fontSize).toBe('20px')
        expect(view.dom.style.lineHeight).toBe('30px')
        expect(view.dom.style.letterSpacing).toBe('1px')
    })
})

describe('文字度量', () => {
    it('fontFamily / fontSize / fontWeight / lineHeight / letterSpacing → view.dom 内联样式,改回默认就去掉', () => {
        const geo = installGrid()
        const { view } = mount(lines(20), {}, [], geo)
        apply(view, { fontFamily: 'Fira Code', fontSize: 18, fontWeight: 'bold', lineHeight: 28, letterSpacing: 2 })
        const s = view.dom.style
        expect(s.fontFamily).toContain('Fira Code')
        expect(s.fontSize).toBe('18px')
        expect(s.fontWeight).toBe('bold')
        expect(s.lineHeight).toBe('28px')
        expect(s.letterSpacing).toBe('2px')
        // 度量跟着变:oracle 行高来自(桩读的)内联 line-height
        expect(view.oracle.lineHeight).toBe(28)
        expect(view.oracle.charWidth).toBeCloseTo(18 * 0.6)
        expect(view.heightMap.height).toBe(20 * 28)
        apply(view, {})
        expect(view.dom.getAttribute('style') ?? '').toBe('')
        expect(view.oracle.lineHeight).toBe(20)
    })

    it('lineHeight = 0 → 自动(mac 1.5 / 其余 1.35 × 字号);< 8 当 em 倍数', () => {
        const geo = installGrid()
        const { view } = mount(lines(3), {}, [], geo)
        apply(view, { fontSize: 20, lineHeight: 0 })
        const auto = parseFloat(view.dom.style.lineHeight)
        expect([27, 30]).toContain(auto) // 1.35 × 20 / 1.5 × 20
        apply(view, { fontSize: 20, lineHeight: 2 })
        expect(view.dom.style.lineHeight).toBe('40px')
    })

    it('fontLigatures / fontVariations 写进 font-feature-settings / font-variation-settings', () => {
        const geo = installGrid()
        const { view } = mount(lines(3), {}, [], geo)
        apply(view, { fontLigatures: true, fontVariations: true, fontWeight: '600' })
        const cs = view.dom.style as CSSStyleDeclaration & Record<string, string>
        const features = cs.getPropertyValue('font-feature-settings')
        const variations = cs.getPropertyValue('font-variation-settings')
        // jsdom 的 cssstyle 可能不认这两个属性;认的话必须是 Monaco 的值
        if (features) expect(features).toBe('"liga" on, "calt" on')
        if (variations) expect(variations).toContain('wght')
        expect(view.fontInfo().fontFeatureSettings).toBe('"liga" on, "calt" on')
        expect(view.fontInfo().fontVariationSettings).toContain("'wght' 600")
        expect(view.fontInfo().fontWeight).toBe('normal') // 600 翻成 variation,字重回 normal
    })

    it('EditorZoom 每级 ±10%:字号和行高一起缩放,多个 view 都跟', () => {
        const geo = installGrid()
        const { view } = mount(lines(10), {}, [editorOptions.of({ fontSize: 20, lineHeight: 30 })], geo)
        const { view: other } = mount('x', {}, [])
        try {
            EditorZoom.setZoomLevel(2)
            expect(view.dom.style.fontSize).toBe('24px')
            expect(view.dom.style.lineHeight).toBe('36px')
            expect(view.oracle.lineHeight).toBe(36)
            expect(other.dom.style.fontSize).not.toBe('')
            EditorZoom.setZoomLevel(0)
            expect(view.dom.style.fontSize).toBe('20px')
            expect(view.oracle.lineHeight).toBe(30)
        } finally { EditorZoom.setZoomLevel(0) }
    })

    it('getResolveEnv:zoom 烤进 fontInfo 后,视图不重复缩放', () => {
        const geo = installGrid()
        const { view } = mount(lines(3), {}, [], geo)
        try {
            EditorZoom.setZoomLevel(5)
            const computed = resolveEditorOptions({ fontSize: 20, lineHeight: 30 }, view.getResolveEnv())
            expect(computed.fontSize).toBe(30) // 20 × 1.5
            view.applyViewOptions(computed)
            expect(view.dom.style.fontSize).toBe('30px')
            expect(view.dom.style.lineHeight).toBe('45px')
        } finally { EditorZoom.setZoomLevel(0) }
    })

    it('padding.top / padding.bottom:行往下推 / 末行下方留白', () => {
        const geo = installGrid()
        const { view } = mount(lines(10), {}, [], geo)
        const h0 = view.metrics.height
        apply(view, { padding: { top: 30, bottom: 12 } })
        expect(view.metrics.height).toBe(h0 + 30 + 12)
        expect(view.lineBlockAt(0).top).toBe(30)
        expect(view.getTopForLineNumber(1)).toBe(30)
        expect(view.getTopForLineNumber(1, true)).toBe(0) // 含 zone:从 padding 上沿算
        expect(view.getTopForLineNumber(3)).toBe(30 + 2 * 20)
        apply(view, {})
        expect(view.metrics.height).toBe(h0)
        expect(view.lineBlockAt(0).top).toBe(0)
    })

    it('scrollBeyondLastLine / scrollBeyondLastColumn', () => {
        const geo = installGrid()
        const { view } = mount(lines(10), {}, [], geo)
        const h0 = view.metrics.height
        // Monaco 默认 true 而 EditorView 构造默认 false(装配层映射):先显式 false 再 true,才是两次真实变化
        apply(view, { scrollBeyondLastLine: false })
        expect(view.scrollBeyondLastLine).toBe(false)
        apply(view, { scrollBeyondLastLine: true })
        expect(view.scrollBeyondLastLine).toBe(true)
        expect(view.metrics.height).toBe(h0 + GRID.H - 20)
        apply(view, { scrollBeyondLastLine: true, padding: { bottom: 50 } })
        expect(view.metrics.height).toBe(h0 + 50 + GRID.H - 20 - 50) // padding.bottom 已含在「视口 − 行高 − padding」里
        apply(view, { scrollBeyondLastLine: false })
        expect(view.metrics.height).toBe(h0)
        const w0 = view.getContentWidth()
        apply(view, { scrollBeyondLastColumn: 20 })
        expect(view.getContentWidth()).toBe(w0 + 16 * view.oracle.charWidth)
    })
})

describe('换行', () => {
    it('wordWrap on / off 随选项切换(和 reconfigure 同一条路径)', () => {
        const geo = installGrid()
        const { view } = mount(lines(10), {}, [], geo)
        expect(view.lineWrapping).toBe(false)
        apply(view, { wordWrap: 'on' })
        expect(view.lineWrapping).toBe(true)
        expect(view.dom.classList.contains('cm-lineWrapping')).toBe(true)
        apply(view, { wordWrap: 'off' })
        expect(view.lineWrapping).toBe(false)
    })

    it('wordWrapColumn:固定列,和视口宽无关;bounded:min(视口列数, wordWrapColumn)', () => {
        const geo = installGrid()
        const { view } = mount(lines(10), {}, [], geo)
        // 视口折行的列数 = Monaco 的 wrappingColumn(floor((内容宽 − 竖条 − 2) / 半角字宽)),不是 视口 / 字宽
        apply(view, { wordWrap: 'on' })
        const wc = view.getLayoutInfo().wrappingColumn
        expect(wc).toBeGreaterThan(0)
        expect(wc).toBeLessThan(75)
        expect(view.oracle.lineLength).toBe(wc)
        apply(view, { wordWrap: 'wordWrapColumn', wordWrapColumn: 40 })
        expect(view.oracle.lineLength).toBe(40)
        expect(view.contentDOM.style.width).toBe(`${40 * 8}px`)
        expect(view.dom.classList.contains('cm-wrapColumn')).toBe(true)
        apply(view, { wordWrap: 'wordWrapColumn', wordWrapColumn: 120 })
        expect(view.oracle.lineLength).toBe(120) // 比视口宽也照列数
        apply(view, { wordWrap: 'bounded', wordWrapColumn: 40 })
        expect(view.oracle.lineLength).toBe(40)
        expect(view.contentDOM.style.maxWidth).toBe(`${40 * 8}px`)
        apply(view, { wordWrap: 'bounded', wordWrapColumn: 120 })
        expect(view.oracle.lineLength).toBe(75) // bounded:min(视口列数, 列);视口列数仍是 视口 / 字宽
        apply(view, { wordWrap: 'off' })
        expect(view.contentDOM.style.width).toBe('')
        expect(view.contentDOM.style.maxWidth).toBe('')
        expect(view.dom.classList.contains('cm-wrapColumn')).toBe(false)
    })

    it('折行后行高按视觉行数估:列越窄越高', () => {
        const geo = installGrid()
        const { view } = mount('x'.repeat(100), {}, [], geo)
        apply(view, { wordWrap: 'wordWrapColumn', wordWrapColumn: 25 })
        expect(view.heightMap.height).toBe(4 * 20)
        apply(view, { wordWrap: 'wordWrapColumn', wordWrapColumn: 50 })
        expect(view.heightMap.height).toBe(2 * 20)
    })

    it('wrappingIndent / wordBreak → 类名和 --cm-wrap-extra(CSS 在 themecss);默认值不留痕迹', () => {
        const geo = installGrid()
        const { view } = mount(lines(3), {}, [], geo)
        apply(view, { wrappingIndent: 'none', wordBreak: 'keepAll' })
        expect(view.dom.classList.contains('cm-wrapIndent-none')).toBe(true)
        expect(view.dom.classList.contains('cm-wordBreak-keepAll')).toBe(true)
        apply(view, { wrappingIndent: 'indent' })
        expect(view.dom.classList.contains('cm-wrapIndent-none')).toBe(false)
        expect(view.dom.classList.contains('cm-wrapIndent-indent')).toBe(true)
        expect(view.dom.style.getPropertyValue('--cm-wrap-extra')).toContain('* 1ch')
        apply(view, { wrappingIndent: 'deepIndent' })
        expect(view.dom.style.getPropertyValue('--cm-wrap-extra')).toContain('* 2ch')
        apply(view, { wrappingIndent: 'same', wordBreak: 'normal' })
        expect(view.dom.className).toBe('cm-editor')
        expect(view.dom.style.getPropertyValue('--cm-wrap-extra')).toBe('')
    })
})

describe('光标', () => {
    const cursors = (v: EditorView) => Array.from(v.dom.querySelectorAll<HTMLElement>('.cm-cursor'))
    const layer = (v: EditorView) => v.dom.querySelector('.cm-cursorLayer') as HTMLElement

    it('cursorStyle 六种:layer 类名 + 光标宽高', () => {
        const geo = installGrid()
        const { view } = mount('hello world', { drawSelection: true }, [], geo)
        view.dispatch(view.state.update({ selection: EditorSelection.cursor(2) }))
        const lh = view.oracle.lineHeight, cw = view.oracle.charWidth
        const expectShape = (style: IEditorOptions['cursorStyle'], cls: string, w: number, h: number) => {
            apply(view, { cursorStyle: style })
            expect(layer(view).classList.contains(cls)).toBe(true)
            const c = cursors(view)[0]
            expect(parseFloat(c.style.width)).toBe(w)
            expect(parseFloat(c.style.height)).toBe(h)
        }
        expectShape('line', 'cursor-line-style', 2, lh)
        expectShape('line-thin', 'cursor-line-thin-style', 1, lh)
        expectShape('block', 'cursor-block-style', cw, lh)
        expect(cursors(view)[0].textContent).toBe('l') // 块光标盖着字、画在光标色上
        expectShape('block-outline', 'cursor-block-outline-style', cw, lh)
        expect(cursors(view)[0].textContent).toBe('')
        expectShape('underline', 'cursor-underline-style', cw, 2)
        expect(parseFloat(cursors(view)[0].style.top)).toBe(parseFloat(String(lh - 2)))
        expectShape('underline-thin', 'cursor-underline-thin-style', cw, 1)
        // 切走后旧类名清掉
        expect(layer(view).classList.contains('cursor-underline-style')).toBe(false)
    })

    it('cursorWidth:竖线光标宽度,上限 = 半角字宽', () => {
        const geo = installGrid()
        const { view } = mount('hello', { drawSelection: true }, [], geo)
        view.dispatch(view.state.update({ selection: EditorSelection.cursor(1) }))
        apply(view, { cursorWidth: 4 })
        expect(parseFloat(cursors(view)[0].style.width)).toBe(4)
        apply(view, { cursorWidth: 50 })
        expect(parseFloat(cursors(view)[0].style.width)).toBe(view.oracle.charWidth)
        apply(view, { cursorWidth: 0 })
        expect(parseFloat(cursors(view)[0].style.width)).toBe(2)
    })

    it('cursorHeight(0.55):竖线光标的高,不超过行高,行内垂直居中;块光标不受影响', () => {
        const geo = installGrid()
        const { view } = mount('hello', { drawSelection: true }, [], geo)
        view.dispatch(view.state.update({ selection: EditorSelection.cursor(1) }))
        const lh = view.oracle.lineHeight
        const top0 = parseFloat(cursors(view)[0].style.top)
        apply(view, { cursorHeight: 6 })
        expect(parseFloat(cursors(view)[0].style.height)).toBe(6)
        expect(parseFloat(cursors(view)[0].style.top)).toBe(top0 + (lh - 6) / 2)
        apply(view, { cursorHeight: 999 })
        expect(parseFloat(cursors(view)[0].style.height)).toBe(lh)
        apply(view, { cursorHeight: 6, cursorStyle: 'block' })
        expect(parseFloat(cursors(view)[0].style.height)).toBe(lh)
    })

    it('overtypeCursorStyle(0.55 effectiveCursorStyle):overtype 输入模式下换成这个形状,切回 insert 复原', () => {
        const geo = installGrid()
        const { view } = mount('hello', { drawSelection: true }, [], geo)
        view.dispatch(view.state.update({ selection: EditorSelection.cursor(1) }))
        apply(view, { cursorStyle: 'line', overtypeCursorStyle: 'block' })
        try {
            InputMode.setInputMode('overtype')
            expect(layer(view).classList.contains('cursor-block-style')).toBe(true)
            expect(layer(view).classList.contains('cursor-line-style')).toBe(false)
            InputMode.setInputMode('insert')
            expect(layer(view).classList.contains('cursor-line-style')).toBe(true)
        } finally { InputMode.setInputMode('insert') }
    })

    it('cursorBlinking 五种 + 只读常亮;cursorSmoothCaretAnimation 类名', () => {
        const geo = installGrid()
        const { view } = mount('x', { drawSelection: true }, [], geo)
        for (const [b, cls] of [['blink', 'cursor-blink'], ['smooth', 'cursor-smooth'], ['phase', 'cursor-phase'], ['expand', 'cursor-expand'], ['solid', 'cursor-solid']] as const) {
            apply(view, { cursorBlinking: b })
            expect(layer(view).classList.contains(cls), b).toBe(true)
        }
        apply(view, { cursorBlinking: 'blink', cursorSmoothCaretAnimation: 'on' })
        expect(layer(view).classList.contains('cursor-smooth-caret-animation')).toBe(true)
        apply(view, { cursorBlinking: 'blink', cursorSmoothCaretAnimation: 'off' })
        expect(layer(view).classList.contains('cursor-smooth-caret-animation')).toBe(false)
    })

    it('cursorSmoothCaretAnimation explicit:键入不动画,显式移动动画', () => {
        const geo = installGrid()
        const { view } = mount('hello', { drawSelection: true }, [], geo)
        apply(view, { cursorSmoothCaretAnimation: 'explicit' })
        view.dispatch(view.state.update({ changes: { from: 5, insert: '!' }, selection: EditorSelection.cursor(6), userEvent: 'input.type' }))
        expect(cursors(view)[0].style.transitionProperty).toBe('none')
        view.dispatch(view.state.update({ selection: EditorSelection.cursor(1), userEvent: 'select' }))
        expect(cursors(view)[0].style.transitionProperty).toBe('')
    })

    it('hideCursorInOverviewRuler:概览尺不收光标标记', async () => {
        const { collectMarks } = await import('../../src/core/chrome/overviewruler')
        const { overviewCursors } = await import('../../src/core/chrome/overviewpaint')
        const mk = (raw: IEditorOptions) => mount('a\nb\nc', {}, [editorOptions.of(raw)]).view.state
        expect(collectMarks(mk({})).some(m => m.kind === 'cursor')).toBe(true)
        expect(collectMarks(mk({ hideCursorInOverviewRuler: true })).some(m => m.kind === 'cursor')).toBe(false)
        const colors = { cursor: '#fff' } as never
        expect(overviewCursors(mk({}), colors).length).toBe(1)
        expect(overviewCursors(mk({ hideCursorInOverviewRuler: true }), colors).length).toBe(0)
    })
})

describe('渲染', () => {
    it('roundedSelection:false 加类名,true 去掉', () => {
        const geo = installGrid()
        const { view } = mount('x', {}, [], geo)
        apply(view, { roundedSelection: false })
        expect(view.dom.classList.contains('cm-noRoundedSelection')).toBe(true)
        apply(view, { roundedSelection: true })
        expect(view.dom.classList.contains('cm-noRoundedSelection')).toBe(false)
    })

    it('lineNumbersMinChars / lineDecorationsWidth:行号列和装饰列的宽度', () => {
        const geo = installGrid()
        const { view } = mount(lines(10), { lineNumbers: true }, [], geo)
        const num = () => view.dom.querySelector<HTMLElement>('.cm-lineNumber')!
        const deco = () => view.dom.querySelector<HTMLElement>('.cm-lineDecorations')!
        expect(num().style.width).toBe(`${5 * 8}px`)
        apply(view, { lineNumbersMinChars: 8, lineDecorationsWidth: 24 })
        expect(num().style.width).toBe(`${8 * 8}px`)
        expect(deco().style.width).toBe('24px')
        apply(view, {})
        expect(num().style.width).toBe(`${5 * 8}px`)
        expect(deco().style.width).toBe('')
    })

    it('折叠列宽 = lineDecorationsWidth + 16;showFoldingControls never 时只剩 lineDecorationsWidth', () => {
        const geo = installGrid()
        const { view } = mount(lines(4), { lineNumbers: true, foldGutter: { foldableAt: () => true, isFolded: () => false, toggle: () => {} } }, [], geo)
        const marker = () => view.dom.querySelector<HTMLElement>('.cm-foldMarker')!
        expect(marker().style.width).toBe('')
        apply(view, { lineDecorationsWidth: 20 })
        expect(marker().style.width).toBe('36px')
        apply(view, { lineDecorationsWidth: 20, showFoldingControls: 'never' })
        expect(marker().style.width).toBe('20px')
    })

    it('renderFinalNewline:末行是空行时 off 不画号 / dimmed 淡显 / on 照画', () => {
        const geo = installGrid()
        const { view } = mount('a\nb\n', { lineNumbers: true }, [], geo)
        const last = () => Array.from(view.dom.querySelectorAll<HTMLElement>('.cm-lineNumber')).at(-1)!
        expect(last().textContent).toBe('3')
        apply(view, { renderFinalNewline: 'off' })
        expect(last().textContent).toBe('')
        apply(view, { renderFinalNewline: 'dimmed' })
        expect(last().textContent).toBe('3')
        expect(last().classList.contains('dimmed-line-number')).toBe(true)
        apply(view, { renderFinalNewline: 'on' })
        expect(last().classList.contains('dimmed-line-number')).toBe(false)
    })

    it('glyphMargin:有 glyphClass 装饰才占槽位(gutter 左 padding = 行高 × 车道数),关掉就收回', () => {
        const geo = installGrid()
        const deco = Decoration.line({ glyphClass: 'my-glyph', gutterClass: 'x' })
        const ext = decorations.of(RangeSet.of([deco.range(0)], true))
        const { view } = mount('a\nb', { lineNumbers: true }, [ext], geo)
        const gutters = view.dom.querySelector<HTMLElement>('.cm-gutters')!
        // 默认 glyphMargin = true:出现 glyph 装饰后才占槽位
        expect(view.dom.querySelector('.my-glyph')).not.toBeNull()
        expect(gutters.style.paddingLeft).toBe('20px')
        expect(view.getLayoutInfo().glyphMarginWidth).toBe(20)
        apply(view, { glyphMargin: false })
        expect(view.dom.querySelector('.my-glyph')).toBeNull()
        expect(gutters.style.paddingLeft).toBe('')
        expect(view.getLayoutInfo().glyphMarginWidth).toBe(0)
        expect(view.dom.classList.contains('cm-glyphMargin-off')).toBe(true)
    })
})
