// V:Monaco 视图 API —— reveal* / scroll* / 位置与选区 / getTargetAtClientPoint / changeViewZones / 事件 / wheel。
// 几何走 v-helpers 的网格桩(行高 20、字宽 8、视口 600×400、content 左上 = (40,100))。

import { describe, expect, it, vi } from 'vitest'
import { EditorSelection } from '../../src/core/model/selection'
import { EditorState, type Extension } from '../../src/core/model/state'
import { editorOptions, resolveEditorOptions } from '../../src/core/options'
import { CursorChangeReason, MouseTargetType, ScrollType, computeMinimumScrolling, computeScrollTopToReveal, EditorZoom, VerticalRevealType, type IViewZone } from '../../src/core/view/viewapi'
import { handleWheel, wheelScrollDelta } from '../../src/core/input/wheel'
import { GRID, installGrid, lines, mount } from './v-helpers'

const LH = 20
const VIEW_H = GRID.H

function setup(n = 100, doc = lines(n), extra = {}, exts: Extension[] = []) {
    const geo = installGrid()
    const m = mount(doc, { drawSelection: true, ...extra }, exts, geo)
    return { geo, ...m }
}

describe('scroll* / content 尺寸', () => {
    it('getScroll* 读 scroller;setScrollTop / Left / Position 立即生效并夹范围', () => {
        const { view, geo } = setup(100, Array.from({ length: 100 }, () => 'x'.repeat(200)).join('\n'))
        expect(view.getScrollTop()).toBe(0)
        expect(view.getScrollHeight()).toBe(100 * LH)
        view.setScrollTop(300)
        expect(geo.scrollTop).toBe(300)
        expect(view.getScrollTop()).toBe(300)
        view.setScrollPosition({ scrollTop: 40, scrollLeft: 16 }, ScrollType.Immediate)
        expect(geo.scrollTop).toBe(40)
        expect(geo.scrollLeft).toBe(16)
        expect(view.getScrollLeft()).toBe(16)
        expect(view.getContentHeight()).toBe(100 * LH)
        expect(view.getContentWidth()).toBeGreaterThan(0)
    })

    it('getContainerDomNode / getDomNode', () => {
        const { view, host } = setup(3)
        expect(view.getDomNode()).toBe(view.dom)
        expect(view.getContainerDomNode()).toBe(host)
    })
})

describe('位置 / 坐标', () => {
    it('getTopForLineNumber / getTopForPosition / getOffsetForColumn', () => {
        const { view } = setup(50)
        expect(view.getTopForLineNumber(1)).toBe(0)
        expect(view.getTopForLineNumber(11)).toBe(200)
        expect(view.getTopForPosition(11, 5)).toBe(200)
        expect(view.getOffsetForColumn(1, 1)).toBe(0)
        expect(view.getOffsetForColumn(1, 6)).toBeCloseTo(5 * 8, 0)
    })

    it('getVisibleRanges:视口内的行区间(整行,列取行末)', () => {
        const { view, geo } = setup(100)
        geo.scrollTop = 200
        view.remeasure()
        const [r] = view.getVisibleRanges()
        expect(r.startLineNumber).toBe(11)
        expect(r.endLineNumber).toBeGreaterThanOrEqual(30)
        expect(r.endLineNumber).toBeLessThanOrEqual(32)
    })

    it('setPosition / setSelection / setSelections / getPosition / getSelection(s):1 基坐标,不自动 reveal', () => {
        const { view, geo } = setup(50, undefined, {}, [EditorState.allowMultipleSelections.of(true)])
        view.setPosition({ lineNumber: 3, column: 4 })
        expect(view.getPosition()).toEqual({ lineNumber: 3, column: 4 })
        view.setSelection({ startLineNumber: 2, startColumn: 1, endLineNumber: 4, endColumn: 3 })
        const s = view.getSelection()
        expect(s).toMatchObject({ selectionStartLineNumber: 2, selectionStartColumn: 1, positionLineNumber: 4, positionColumn: 3, startLineNumber: 2, endLineNumber: 4 })
        // 反向选区:ISelection(anchor → position)
        view.setSelection({ selectionStartLineNumber: 4, selectionStartColumn: 3, positionLineNumber: 2, positionColumn: 1 })
        expect(view.getSelection()).toMatchObject({ selectionStartLineNumber: 4, positionLineNumber: 2 })
                view.setSelections([
            { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 2 },
            { startLineNumber: 40, startColumn: 1, endLineNumber: 40, endColumn: 1 },
        ])
        expect(view.getSelections()).toHaveLength(2)
        expect(geo.scrollTop).toBe(0) // setSelection 不滚
        // 越界钳位
        view.setPosition({ lineNumber: 999, column: 999 })
        expect(view.getPosition().lineNumber).toBe(50)
    })
})

describe('reveal*', () => {
    it('revealLine:最小滚动 —— 视口下方的行贴底,上方贴顶,已在视口内不动', () => {
        const { view, geo } = setup(100)
        view.revealLine(50, ScrollType.Immediate)
        expect(geo.scrollTop).toBe(50 * LH - VIEW_H + LH) // 行 50 的底 = 1000;Simple 多露一行(防横向滚动条盖住)
        view.revealLine(10, ScrollType.Immediate)
        expect(geo.scrollTop).toBe(9 * LH) // 行 10 的顶 = 180
        const t = geo.scrollTop
        view.revealLine(12, ScrollType.Immediate)
        expect(geo.scrollTop).toBe(t)
    })

    it('revealLineInCenter / InCenterIfOutsideViewport / NearTop', () => {
        const { view, geo } = setup(100)
        view.revealLineInCenter(50, ScrollType.Immediate)
        expect(geo.scrollTop).toBe(49 * LH + LH / 2 - VIEW_H / 2) // 行中心对视口中心
        view.revealLineInCenterIfOutsideViewport(52, ScrollType.Immediate)
        expect(geo.scrollTop).toBe(49 * LH + LH / 2 - VIEW_H / 2) // 在视口内 → 不动
        view.revealLineInCenterIfOutsideViewport(5, ScrollType.Immediate)
        expect(geo.scrollTop).toBe(4 * LH + LH / 2 - VIEW_H / 2 < 0 ? 0 : 4 * LH + LH / 2 - VIEW_H / 2)
        view.revealLineNearTop(60, ScrollType.Immediate)
        // NearTop:上方留 max(5 行, 视口 20%)(Monaco _computeScrollTopToRevealRange)
        expect(geo.scrollTop).toBe(59 * LH - Math.max(5 * LH, VIEW_H * 0.2))
    })

    it('revealLines*:范围放得下 → 整段入视口;放不下 → 贴范围顶', () => {
        const { view, geo } = setup(100)
        view.revealLines(40, 45, ScrollType.Immediate)
        expect(geo.scrollTop).toBe(45 * LH - VIEW_H + LH)
        geo.scrollTop = 0
        view.revealLines(10, 80, ScrollType.Immediate)
        expect(geo.scrollTop).toBe(9 * LH)
    })

    it('revealPosition* / revealRange*:行同 revealLine;长行里水平方向也 reveal(左留 30、右留 15)', () => {
        const long = Array.from({ length: 20 }, () => 'x'.repeat(300)).join('\n')
        const { view, geo } = setup(0, long)
        view.revealPosition({ lineNumber: 1, column: 250 }, ScrollType.Immediate)
        // 列 250 → x = 249 × 8 = 1992;视口 600 → 右留 15 → scrollLeft = 1992 + 15 − 600
        expect(geo.scrollLeft).toBeGreaterThan(1300)
        expect(geo.scrollLeft).toBeLessThanOrEqual(1992 + 15 + 8 - 600 + 8)
        view.revealRange({ startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 2 }, ScrollType.Immediate)
        expect(geo.scrollLeft).toBe(0) // 回到左边(左留 30 → 不够就清零)
        view.revealPosition({ lineNumber: 15, column: 1 }, ScrollType.Immediate)
        expect(geo.scrollTop).toBe(0) // 行 15 本来就在视口里
    })

    it('revealRange 的变体:centered / IfOutsideViewport / NearTop / AtTop', () => {
        const { view, geo } = setup(100)
        const r = (l: number) => ({ startLineNumber: l, startColumn: 1, endLineNumber: l, endColumn: 2 })
        view.revealRangeInCenter(r(50), ScrollType.Immediate)
        expect(geo.scrollTop).toBe(49 * LH + LH / 2 - VIEW_H / 2)
        view.revealRangeInCenterIfOutsideViewport(r(51), ScrollType.Immediate)
        expect(geo.scrollTop).toBe(49 * LH + LH / 2 - VIEW_H / 2)
        view.revealRangeAtTop(r(70), ScrollType.Immediate)
        expect(geo.scrollTop).toBe(69 * LH)
        view.revealRangeNearTop(r(20), ScrollType.Immediate)
        expect(geo.scrollTop).toBe(19 * LH - Math.max(5 * LH, VIEW_H * 0.2))
        const t = geo.scrollTop
        view.revealRangeNearTopIfOutsideViewport(r(22), ScrollType.Immediate)
        expect(geo.scrollTop).toBe(t)
    })

    it('scrollType Smooth(默认):jsdom 没有 rAF 时立即到位;smoothScrolling 开 + rAF 时按 125ms 动画走到终点', async () => {
        const { view, geo } = setup(100)
        view.revealLine(50) // 默认 Smooth,但 smoothScrolling 关 → 立即
        expect(geo.scrollTop).toBe(50 * LH - VIEW_H + LH)
        geo.scrollTop = 0
        view.applyViewOptions(resolveEditorOptions({ smoothScrolling: true }, view.getResolveEnv()))
        view.revealLine(50, ScrollType.Smooth)
        await new Promise(r => setTimeout(r, 400))
        expect(geo.scrollTop).toBe(50 * LH - VIEW_H + LH)
        geo.scrollTop = 0
        view.revealLine(50, ScrollType.Immediate) // Immediate 不走动画
        expect(geo.scrollTop).toBe(50 * LH - VIEW_H + LH)
    })
})

describe('纯函数:computeMinimumScrolling / computeScrollTopToReveal', () => {
    it('computeMinimumScrolling', () => {
        expect(computeMinimumScrolling(100, 300, 150, 200)).toBe(100) // 已在视口
        expect(computeMinimumScrolling(100, 300, 50, 80)).toBe(50) // 上方 → 贴顶
        expect(computeMinimumScrolling(100, 300, 320, 340)).toBe(140) // 下方 → 贴底
        expect(computeMinimumScrolling(100, 300, 50, 400)).toBe(50) // 放不下 → 贴盒顶
    })
    it('computeScrollTopToReveal:多光标盒比视口高 → -1(放弃);IfOutsideViewport 盒在视口内 → 原位', () => {
        const base = { viewportTop: 0, viewportHeight: 400, lineHeight: 20, boxStartY: 100, boxEndY: 120, boxIsSingleRange: true, surroundingLines: 0, surroundingLinesStyle: 'default' as const, source: 'api', minimalReveal: false }
        expect(computeScrollTopToReveal({ ...base, verticalType: VerticalRevealType.CenterIfOutsideViewport })).toBe(0)
        expect(computeScrollTopToReveal({ ...base, boxStartY: 0, boxEndY: 900, boxIsSingleRange: false, verticalType: VerticalRevealType.Simple })).toBe(-1)
        expect(computeScrollTopToReveal({ ...base, boxStartY: 50, boxEndY: 900, verticalType: VerticalRevealType.Simple })).toBe(50)
        // cursorSurroundingLines:上下各留 N 行(下边少 1)
        expect(computeScrollTopToReveal({ ...base, boxStartY: 1000, boxEndY: 1020, surroundingLines: 3, verticalType: VerticalRevealType.Simple })).toBe(1020 + 2 * 20 + 20 - 400)
    })
})

describe('getTargetAtClientPoint', () => {
    it('文本 / 行尾空白 / 视口外', () => {
        const { view } = setup(10, 'hello\nworld')
        const x0 = GRID.LEFT, y0 = GRID.TOP
        const t = view.getTargetAtClientPoint(x0 + 2 * 8 + 1, y0 + 5)!
        expect(t.type).toBe(MouseTargetType.CONTENT_TEXT)
        expect(t.position).toEqual({ lineNumber: 1, column: 3 })
        const e = view.getTargetAtClientPoint(x0 + 400, y0 + 5)!
        expect(e.type).toBe(MouseTargetType.CONTENT_EMPTY)
        expect(e.position).toEqual({ lineNumber: 1, column: 6 })
        expect(view.getTargetAtClientPoint(x0 + 1, y0 - 80)!.type).toBe(MouseTargetType.OUTSIDE_EDITOR)
    })
})

describe('changeViewZones', () => {
    const zoneNode = () => { const d = document.createElement('div'); d.textContent = 'zone'; return d }

    it('addZone:占 heightInPx / heightInLines × 行高,把下面的行往下推;onComputedHeight / onDomNodeTop 回调', () => {
        const { view } = setup(10)
        const h0 = view.metrics.height
        let id = '', top = -1, computed = -1
        const node = zoneNode()
        view.changeViewZones(a => {
            id = a.addZone({ afterLineNumber: 2, heightInPx: 50, domNode: node, onDomNodeTop: t => { top = t }, onComputedHeight: h => { computed = h } })
        })
        expect(id).not.toBe('')
        expect(view.metrics.height).toBe(h0 + 50)
        expect(view.getTopForLineNumber(3)).toBe(2 * LH + 50) // 行 3 被推下
        expect(view.getTopForLineNumber(3, true)).toBe(2 * LH) // 含 zone:从 zone 上沿
        expect(computed).toBe(50)
        expect(top).toBe(2 * LH)
        expect(view.dom.contains(node)).toBe(true)
        view.changeViewZones(a => a.removeZone(id))
        expect(view.metrics.height).toBe(h0)
        expect(view.dom.contains(node)).toBe(false)
    })

    it('heightInLines;afterLineNumber 0 = 首行之上;layoutZone 重新读高度', () => {
        const { view } = setup(5)
        const h0 = view.metrics.height
        const z: IViewZone = { afterLineNumber: 0, heightInLines: 2, domNode: zoneNode() }
        let id = ''
        view.changeViewZones(a => { id = a.addZone(z) })
        expect(view.metrics.height).toBe(h0 + 2 * LH)
        expect(view.lineBlockAt(0).top).toBe(2 * LH)
        z.heightInLines = 3
        view.changeViewZones(a => a.layoutZone(id))
        expect(view.metrics.height).toBe(h0 + 3 * LH)
    })

    it('一次回调里批量 add/remove,只重排一次;ID 唯一', () => {
        const { view } = setup(5)
        const ids: string[] = []
        view.changeViewZones(a => {
            for (let i = 0; i < 3; i++) ids.push(a.addZone({ afterLineNumber: i + 1, heightInPx: 10, domNode: zoneNode() }))
        })
        expect(new Set(ids).size).toBe(3)
        expect(view.metrics.height).toBe(5 * LH + 30)
    })

    it('zone 前行的 mousedown 命中 CONTENT_VIEW_ZONE', () => {
        const { view } = setup(5)
        let id = ''
        const node = zoneNode()
        view.changeViewZones(a => { id = a.addZone({ afterLineNumber: 1, heightInPx: 40, domNode: node }) })
        const y = GRID.TOP + LH + 10
        const orig = document.elementFromPoint
        document.elementFromPoint = () => node
        // 桩没有布局:zone 外层节点按它的 top 样式给个盒
        const wrap = node.parentElement!
        wrap.getBoundingClientRect = () => ({ left: GRID.LEFT, top: GRID.TOP + LH, width: GRID.W, height: 40, right: GRID.LEFT + GRID.W, bottom: GRID.TOP + LH + 40, x: GRID.LEFT, y: GRID.TOP + LH, toJSON() { return this } } as DOMRect)
        try {
            const t = view.getTargetAtClientPoint(GRID.LEFT + 5, y)!
            expect(t.type).toBe(MouseTargetType.CONTENT_VIEW_ZONE)
            expect((t as { detail: { viewZoneId: string } }).detail.viewZoneId).toBe(id)
        } finally { document.elementFromPoint = orig }
    })
})

describe('事件', () => {
    it('onDidScrollChange:scrollTop/Left/Width/Height + 变化标志', () => {
        const { view, geo } = setup(100)
        const fn = vi.fn()
        view.onDidScrollChange(fn)
        view.setScrollTop(120)
        view.scrollDOM.dispatchEvent(new Event('scroll'))
        expect(fn).toHaveBeenCalled()
        const e = fn.mock.calls.at(-1)![0]
        expect(e).toMatchObject({ scrollTop: 120, scrollLeft: 0, scrollHeight: 100 * LH, scrollTopChanged: true, scrollLeftChanged: false })
        expect(geo.scrollTop).toBe(120)
    })

    it('onDidContentSizeChange:文档变高时发,尺寸没变不发', () => {
        const { view } = setup(10)
        const fn = vi.fn()
        view.onDidContentSizeChange(fn)
        view.dispatch(view.state.update({ changes: { from: view.state.doc.length, insert: '\nx\ny' } }))
        expect(fn).toHaveBeenCalledTimes(1)
        expect(fn.mock.calls[0][0]).toMatchObject({ contentHeight: 12 * LH, contentHeightChanged: true })
        view.dispatch(view.state.update({ selection: EditorSelection.cursor(0) }))
        expect(fn).toHaveBeenCalledTimes(1)
    })

    it('onDidLayoutChange:容器尺寸变了发 EditorLayoutInfo', () => {
        const { view, geo } = setup(10)
        const fn = vi.fn()
        view.onDidLayoutChange(fn)
        geo.w = 500
        view.layout()
        expect(fn).toHaveBeenCalled()
        expect(fn.mock.calls.at(-1)![0]).toMatchObject({ width: 500, height: VIEW_H })
    })

    it('onDidChangeCursorPosition / Selection:位置、reason、source', () => {
        const { view } = setup(10, 'hello\nworld')
        const pos = vi.fn(), sel = vi.fn()
        view.onDidChangeCursorPosition(pos)
        view.onDidChangeCursorSelection(sel)
        view.dispatch(view.state.update({ selection: EditorSelection.cursor(8), userEvent: 'select.pointer' }))
        expect(pos.mock.calls.at(-1)![0]).toMatchObject({ position: { lineNumber: 2, column: 3 }, reason: CursorChangeReason.Explicit, source: 'mouse' })
        expect(sel.mock.calls.at(-1)![0]).toMatchObject({ selection: { positionLineNumber: 2, positionColumn: 3 }, source: 'mouse', reason: CursorChangeReason.Explicit })
        view.setPosition({ lineNumber: 1, column: 2 })
        expect(pos.mock.calls.at(-1)![0]).toMatchObject({ position: { lineNumber: 1, column: 2 }, source: 'api', reason: CursorChangeReason.NotSet })
        view.dispatch(view.state.update({ changes: { from: 1, insert: 'ZZ' }, selection: EditorSelection.cursor(3), userEvent: 'input.type' }))
        expect(pos.mock.calls.at(-1)![0]).toMatchObject({ source: 'keyboard', reason: CursorChangeReason.NotSet })
        view.dispatch(view.state.update({ changes: { from: 0, insert: 'Q' } })) // 光标被映射但没有 userEvent
        expect(pos.mock.calls.at(-1)![0]).toMatchObject({ source: 'modelChange' })
        const n = pos.mock.calls.length
        view.dispatch(view.state.update({ selection: view.state.selection })) // 没变 → 不发
        expect(pos.mock.calls.length).toBe(n)
    })

    it('事件返回 IDisposable;dispose 后不再收到', () => {
        const { view } = setup(10)
        const fn = vi.fn()
        const d = view.onDidChangeCursorPosition(fn)
        d.dispose()
        view.setPosition({ lineNumber: 2, column: 1 })
        expect(fn).not.toHaveBeenCalled()
    })
})

describe('getLayoutInfo', () => {
    it('Monaco EditorLayoutInfo 全字段;lineNumbers 开时 lineNumbersLeft / contentLeft 按真实 gutter 算', () => {
        const { view } = setup(100, undefined, { lineNumbers: true })
        const li = view.getLayoutInfo()
        for (const k of ['width', 'height', 'glyphMarginLeft', 'glyphMarginWidth', 'glyphMarginDecorationLaneCount', 'lineNumbersLeft', 'lineNumbersWidth', 'decorationsLeft', 'decorationsWidth', 'contentLeft', 'contentWidth', 'minimap', 'viewportColumn', 'isWordWrapMinified', 'isViewportWrapping', 'wrappingColumn', 'verticalScrollbarWidth', 'horizontalScrollbarHeight', 'overviewRuler'])
            expect(li, k).toHaveProperty(k)
        expect(li.height).toBe(VIEW_H)
        expect(li.lineNumbersWidth).toBe(Math.round(5 * view.oracle.charWidth)) // 100 行 → 3 位,minChars 5
        expect(li.contentLeft).toBe(li.decorationsLeft + li.decorationsWidth)
        expect(li.width).toBeGreaterThan(li.contentWidth)
    })

    it('无行号 gutter:lineNumbersWidth / glyphMarginWidth 为 0', () => {
        const { view } = setup(5)
        const li = view.getLayoutInfo()
        expect(li.lineNumbersWidth).toBe(0)
        expect(li.glyphMarginWidth).toBe(0)
    })

    it('折行:isViewportWrapping / wrappingColumn 随 wordWrap 选项', () => {
        const { view } = setup(5)
        view.applyViewOptions(resolveEditorOptions({ wordWrap: 'wordWrapColumn', wordWrapColumn: 40 }, view.getResolveEnv()))
        const li = view.getLayoutInfo()
        expect(li.isViewportWrapping).toBe(false)
        expect(li.wrappingColumn).toBe(40)
        view.applyViewOptions(resolveEditorOptions({ wordWrap: 'on' }, view.getResolveEnv()))
        expect(view.getLayoutInfo().isViewportWrapping).toBe(true)
    })
})

describe('automaticLayout', () => {
    it('applyViewOptions 把 automaticLayout 接到 setAutomaticLayout', () => {
        const { view } = setup(5)
        // Monaco 默认 false;只有与上次应用的值不同才动(裸 EditorView 的默认 true 不被覆盖)
        view.applyViewOptions(resolveEditorOptions({ automaticLayout: true }, view.getResolveEnv()))
        expect(view.automaticLayout).toBe(true)
        view.applyViewOptions(resolveEditorOptions({ automaticLayout: false }, view.getResolveEnv()))
        expect(view.automaticLayout).toBe(false)
        view.applyViewOptions(resolveEditorOptions({ automaticLayout: true }, view.getResolveEnv()))
        expect(view.automaticLayout).toBe(true)
    })

    it('facet 选项在 state 变化后自动同步到视图(editorOptions 换了 → applyViewOptions)', () => {
        const geo = installGrid()
        const { view } = mount('a', {}, [editorOptions.of({ lineHeight: 24 })], geo)
        expect(view.dom.style.lineHeight).toBe('24px')
    })
})

describe('wheel', () => {
    const mk = (init: WheelEventInit) => new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaMode: 0, ...init })

    it('mouseWheelScrollSensitivity / fastScrollSensitivity(Alt)/ scrollPredominantAxis', () => {
        const base = wheelScrollDelta(mk({ deltaY: 100 }), false)
        const dbl = wheelScrollDelta(mk({ deltaY: 100 }), false, { sensitivity: 2 })
        expect(dbl.y).toBe(base.y * 2)
        const fast = wheelScrollDelta(mk({ deltaY: 100, altKey: true }), false, { sensitivity: 1, fastSensitivity: 5 })
        expect(fast.y).toBe(base.y * 5)
        const diag = wheelScrollDelta(mk({ deltaY: 100, deltaX: 10 }), false, { predominantAxis: true })
        expect(diag.x).toBe(0)
        const diag2 = wheelScrollDelta(mk({ deltaY: 100, deltaX: 10 }), false, { predominantAxis: false })
        expect(diag2.x).not.toBe(0)
    })

    it('视图的 wheel 监听读 opts:mouseWheelScrollSensitivity 翻倍 → 滚动量翻倍', () => {
        const { view, geo } = setup(200)
        const fire = () => view.dom.dispatchEvent(mk({ deltaY: 40 }))
        fire()
        const one = geo.scrollTop
        expect(one).toBeGreaterThan(0)
        geo.scrollTop = 0
        view.applyViewOptions(resolveEditorOptions({ mouseWheelScrollSensitivity: 2 }, view.getResolveEnv()))
        fire()
        expect(geo.scrollTop).toBe(one * 2)
        geo.scrollTop = 0
        view.applyViewOptions(resolveEditorOptions({ mouseWheelScrollSensitivity: 2, fastScrollSensitivity: 3 }, view.getResolveEnv()))
        view.dom.dispatchEvent(mk({ deltaY: 40, altKey: true }))
        expect(geo.scrollTop).toBe(one * 2 * 3)
    })

    it('mouseWheelZoom:Ctrl + 滚轮 → EditorZoom ±1 级;关着不动', () => {
        const { view } = setup(20)
        try {
            view.dom.dispatchEvent(mk({ deltaY: -100, ctrlKey: true }))
            expect(EditorZoom.getZoomLevel()).toBe(0) // 默认关
            view.applyViewOptions(resolveEditorOptions({ mouseWheelZoom: true }, view.getResolveEnv()))
            const ev = mk({ deltaY: -100, ctrlKey: true })
            view.dom.dispatchEvent(ev)
            expect(EditorZoom.getZoomLevel()).toBe(1) // 向上滚 = 放大
            expect(ev.defaultPrevented).toBe(true)
            view.dom.dispatchEvent(mk({ deltaY: 100, ctrlKey: true }))
            expect(EditorZoom.getZoomLevel()).toBe(0)
        } finally { EditorZoom.setZoomLevel(0) }
    })

    it('handleWheel 签名向后兼容(无 opts)', () => {
        const root = document.createElement('div'), sc = document.createElement('div')
        root.appendChild(sc)
        Object.defineProperty(sc, 'scrollHeight', { value: 1000 }); Object.defineProperty(sc, 'clientHeight', { value: 100 })
        handleWheel(root, sc, mk({ deltaY: 40 }), false)
        expect(sc.scrollTop).toBeGreaterThan(0)
    })
})
