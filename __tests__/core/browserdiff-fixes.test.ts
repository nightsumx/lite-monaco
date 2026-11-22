// browser-diff(真 Chromium 里 Monaco 与 lite 逐项对照)发现并修掉的差异的固化。
// jsdom 没有排版,几何类的实测值在 scripts/browser-diff 场景里:`cd scripts/browser-diff && node build.mjs && node run.mjs <场景组>`
//   10-wrap(折行行数 / getContentWidth / visibleRanges)、70-structure(zone 行顶、foldLevel)、90-layout(glyphMargin)、80-decorations(括号匹配)。
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, mountEditor } from './h2-helpers'
import { GRID, installGrid, lines, mount } from './v-helpers'

afterEach(cleanup)

describe('独立编辑器的默认值 = Monaco 的(editor.api2 覆盖的那几项)', () => {
    it('glyphMargin 默认 false、overviewRulerLanes 默认 2', () => {
        const ed = mountEditor('x')
        expect(ed.getOption('glyphMargin' as never)).toBe(false)
        expect(ed.getOption('overviewRulerLanes' as never)).toBe(2)
    })
    it('显式 glyphMargin:true 就占一条车道;改回 false 不再占', () => {
        const on = mountEditor('x', { options: { glyphMargin: true } } as never)
        expect(on.getLayoutInfo().glyphMarginWidth).toBeGreaterThan(0)
        const off = mountEditor('x')
        expect(off.getLayoutInfo().glyphMarginWidth).toBe(0)
    })
})

describe('Monaco 的折叠动作 id', () => {
    it.each(['editor.foldLevel1', 'editor.foldLevel2', 'editor.foldLevel7', 'editor.gotoPreviousFold', 'editor.gotoParentFold',
        'editor.createFoldingRangeFromSelection', 'editor.removeManualFoldingRanges', 'editor.foldAllBlockComments',
        'editor.foldAllMarkerRegions', 'editor.unfoldAllMarkerRegions', 'editor.foldAllExcept', 'editor.unfoldAllExcept',
        'editor.toggleFoldRecursively'])('%s 存在', id => {
        const ed = mountEditor('x')
        expect(ed.getAction(id)).toBeTruthy()
    })
})

describe('view zone', () => {
    const node = () => document.createElement('div')

    it('domNode 被设成 position:absolute / width:100% / height=zone 高(Monaco 同样)', () => {
        const geo = installGrid()
        const { view } = mount(lines(5), {}, [], geo)
        const n = node()
        view.changeViewZones(a => { a.addZone({ afterLineNumber: 2, heightInPx: 50, domNode: n }) })
        expect(n.style.position).toBe('absolute')
        expect(n.style.width).toBe('100%')
        expect(n.style.height).toBe('50px')
    })

    it('同一行后面的多个 zone 叠加:下一行被推下的是它们的高度和', () => {
        const geo = installGrid()
        const { view } = mount(lines(5), {}, [], geo)
        const h0 = view.metrics.height
        view.changeViewZones(a => {
            a.addZone({ afterLineNumber: 2, heightInPx: 30, domNode: node() })
            a.addZone({ afterLineNumber: 2, heightInPx: 20, domNode: node() })
        })
        expect(view.metrics.height).toBe(h0 + 50)
        expect(view.getTopForLineNumber(3)).toBe(2 * 20 + 50)
        const line3 = [...view.contentDOM.querySelectorAll<HTMLElement>('.cm-line')][2]
        if (line3) expect(line3.style.marginTop).toBe('50px')
    })
})

describe('showIfCollapsed 的空区间装饰', () => {
    it('画成一字宽、两侧负外边距(净占宽 0)、行高的 inline-block,和 Monaco 的框同位同大小(80-decorations/empty-range-showIfCollapsed)', () => {
        const ed = mountEditor('line 1\nline 2\nline 3')
        ed.createDecorationsCollection([{ range: { startLineNumber: 2, startColumn: 5, endLineNumber: 2, endColumn: 5 }, options: { className: 'd-class', showIfCollapsed: true } }])
        const el = ed.dom.querySelector('.d-class') as HTMLElement
        expect(el).toBeTruthy()
        expect(el.style.display).toBe('inline-block')
        expect(el.style.width).toBe('1ch')
        expect(el.style.marginLeft).toBe('-0.5ch')
        expect(el.style.marginRight).toBe('-0.5ch')
    })
})

describe('开关折行', () => {
    it('转成折行时清掉不折行时横条撑开的 min-width(否则量行高时内容被钉在老宽度,折成几行都量成 1 行;80+ 的 10-wrap/toggle-wrap-alt-z)', () => {
        const geo = installGrid()
        const { view } = mount(lines(5), {}, [], geo)
        view.contentDOM.style.minWidth = '2115px'
        view.reconfigure({ lineWrapping: true })
        expect(view.contentDOM.style.minWidth).toBe('')
    })
})

void GRID
