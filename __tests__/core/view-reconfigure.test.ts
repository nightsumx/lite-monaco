// EditorView.reconfigure / layout / setAutomaticLayout —— 运行时改视图配置(Monaco updateOptions 的结构部分)。
// 同一个 view 对象:不丢文档 / 选区 / 历史 / 折叠 / 滚动位置 / 焦点,不泄漏 overlay、监听和 DOM。
// jsdom 无布局:几何用「等宽网格」桩(同 geometry-fix.test.ts)——行盒高 LH(折行时 ceil(len/WRAP) × LH),字宽 CW。
// 像素级结果(gutter 宽度、横向条、折行断点)只能真浏览器看,见 /tmp/parity/done/R.md。

import { afterEach, describe, expect, it, vi } from 'vitest'
import { EditorView, decorations } from '../../src/core/view/editorview'
import type { FoldGutterSpec, ViewReconfigure } from '../../src/core/view/editorview'
import { EditorState, type Extension } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'
import { history, undoDepth } from '../../src/core/edit/history'
import { foldCode, foldDecorations, foldField, foldable } from '../../src/core/edit/fold'
import type { KeyBinding } from '../../src/core/edit/keymap'

const LH = 20
const CW = 8
const VIEW_H = 400
const VIEW_W = 600
const WRAP = 75 // 折行时每视觉行字符数

const restores: (() => void)[] = []
afterEach(() => {
    while (restores.length) restores.pop()!()
    document.body.innerHTML = ''
})

function override(obj: object, key: string, desc: PropertyDescriptor) {
    const prev = Object.getOwnPropertyDescriptor(obj, key)
    Object.defineProperty(obj, key, { configurable: true, ...desc })
    restores.push(() => {
        if (prev) Object.defineProperty(obj, key, prev)
        else delete (obj as Record<string, unknown>)[key]
    })
}

function rect(left: number, top: number, width: number, height: number): DOMRect {
    return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() { return this } } as DOMRect
}

interface Geo { view: EditorView | null, scrollTop: number, w: number, h: number }

// 安装网格几何桩(必须在 new EditorView 之前)。w / h 可由测试改,模拟容器尺寸变化。
function installGrid(): Geo {
    const geo: Geo = { view: null, scrollTop: 0, w: VIEW_W, h: VIEW_H }
    const P = HTMLElement.prototype
    const rows = (len: number) => geo.view?.lineWrapping ? Math.max(1, Math.ceil(len / WRAP)) : 1
    override(P, 'getBoundingClientRect', {
        writable: true,
        value(this: HTMLElement) {
            const v = geo.view
            if (this.classList.contains('cm-line')) {
                if (this.getAttribute('aria-hidden') === 'true') return rect(0, 0, 300, LH) // 文本探针
                if (!v) return rect(0, 0, 0, 0)
                const i = Array.from(v.contentDOM.children).indexOf(this)
                if (i < 0) return rect(0, 0, 0, 0)
                const n = v.viewportStartLine + i
                return rect(0, 0, VIEW_W, rows(v.state.doc.line(n).length) * LH)
            }
            return rect(0, 0, 0, 0)
        },
    })
    override(Range.prototype, 'getBoundingClientRect', {
        writable: true,
        value(this: Range) { return rect(0, 0, this.toString().length * CW, 15) },
    })
    const scroller = (el: HTMLElement) => el.classList.contains('cm-scroller')
    override(P, 'clientHeight', { get(this: HTMLElement) { return scroller(this) ? geo.h : 0 } })
    override(P, 'clientWidth', { get(this: HTMLElement) { return scroller(this) ? geo.w : 0 } })
    override(P, 'scrollTop', {
        get(this: HTMLElement) { return scroller(this) ? geo.scrollTop : 0 },
        set(this: HTMLElement, x: number) { if (scroller(this)) geo.scrollTop = Math.max(0, x) },
    })
    return geo
}

const lines = (n: number, f = (i: number) => `const v${i} = ${i}`) => Array.from({ length: n }, (_, i) => f(i + 1)).join('\n')

interface Mounted { view: EditorView, host: HTMLElement }
function mount(doc: string, extra: Partial<ConstructorParameters<typeof EditorView>[0]> = {}, extensions: Extension[] = [], geo?: Geo): Mounted {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const view = new EditorView({ state: EditorState.create({ doc, extensions }), parent: host, ...extra })
    if (geo) { geo.view = view; view.remeasure() }
    return { view, host }
}

const spec = (hits: string[] = []): FoldGutterSpec => ({
    foldableAt: (s, from) => !!foldable(s, from),
    isFolded: (s, n) => s.field(foldField).has(n),
    toggle: (_s, n) => { hits.push(`toggle:${n}`) },
})

function keydown(view: EditorView, key: string, init: KeyboardEventInit = {}) {
    const e = new KeyboardEvent('keydown', { key, code: key, bubbles: true, cancelable: true, ...init })
    view.contentDOM.dispatchEvent(e)
    return e
}

// 一个会记账的 overlay 工厂:挂载 / 卸载次数 + 事件顺序
function overlayProbe(name: string, log: string[]) {
    const p = { mounts: 0, disposes: 0, factory: (_v: EditorView) => { p.mounts++; log.push(`+${name}`); return () => { p.disposes++; log.push(`-${name}`) } } }
    return p
}

const gutterCount = (v: EditorView) => v.dom.querySelectorAll('.cm-gutters').length
const domShape = (v: EditorView) => Array.from(v.dom.children).map(c => c.className).join('|')

describe('lineNumbers 运行时开关', () => {
    it('开 → 新建 gutter(行号随视口行带上);关 → 整个移除;再开 → 再来一份', () => {
        const { view } = mount('a\nb\nc')
        expect(gutterCount(view)).toBe(0)
        expect(view.dom.firstElementChild).toBe(view.scrollDOM)
        view.reconfigure({ lineNumbers: true })
        expect(gutterCount(view)).toBe(1)
        expect(view.dom.querySelector('.cm-gutters-clip')!.nextElementSibling).toBe(view.scrollDOM) // gutter 在 scroller 左侧
        expect(Array.from(view.dom.querySelectorAll('.cm-lineNumber')).map(e => e.textContent)).toEqual(['1', '2', '3'])
        view.reconfigure({ lineNumbers: false })
        expect(gutterCount(view)).toBe(0)
        expect(view.dom.querySelector('.cm-gutters-clip')).toBeNull()
        view.reconfigure({ lineNumbers: true })
        expect(Array.from(view.dom.querySelectorAll('.cm-lineNumber')).map(e => e.textContent)).toEqual(['1', '2', '3'])
    })

    it('值没变 → 不重建 gutter(节点同一个)', () => {
        const { view } = mount('a\nb', { lineNumbers: true })
        const g = view.dom.querySelector('.cm-gutters')
        view.reconfigure({ lineNumbers: true })
        expect(view.dom.querySelector('.cm-gutters')).toBe(g)
    })

    it('开了之后文档编辑 / 滚动换窗,行号继续跟视口走', () => {
        const { view } = mount('a\nb', { lineNumbers: true })
        view.reconfigure({ lineNumbers: true })
        view.dispatch(view.state.update({ changes: { from: 1, insert: '\nx' } }))
        expect(Array.from(view.dom.querySelectorAll('.cm-lineNumber')).map(e => e.textContent)).toEqual(['1', '2', '3'])
    })

    it('行号点击选整行在运行时新建的 gutter 上也生效', () => {
        const { view } = mount('ab\ncd\nef')
        view.reconfigure({ lineNumbers: true })
        const row = view.dom.querySelectorAll('.cm-gutterElement')[1] as HTMLElement
        row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
        expect(view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to)).toBe('cd\n')
    })
})

describe('foldGutter 运行时开关', () => {
    const FOLD_DOC = 'function f() {\n    a()\n}\nz'
    const FOLD_EXT = [foldField, decorations.of(foldDecorations)]

    it('传 spec → 每行带折叠槽,可折行有 active 箭头,点击走 spec.toggle;null → 回到纯留白槽', () => {
        const hits: string[] = []
        const { view } = mount(FOLD_DOC, { lineNumbers: true }, FOLD_EXT)
        expect(view.dom.querySelector('.cm-foldMarker')).toBeNull()
        view.reconfigure({ foldGutter: spec(hits) })
        expect(view.dom.querySelectorAll('.cm-foldMarker').length).toBe(4)
        const active = view.dom.querySelectorAll('.cm-foldMarker-active')
        expect(active.length).toBeGreaterThan(0)
        active[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
        expect(hits).toEqual(['toggle:1'])
        view.reconfigure({ foldGutter: null })
        expect(view.dom.querySelector('.cm-foldMarker')).toBeNull()
        expect(view.dom.querySelectorAll('.cm-lineDecorations').length).toBe(4)
    })

    it('不传 foldGutter 字段 → 保持原样;同一个 spec 再传 → 不重画', () => {
        const s = spec()
        const { view } = mount(FOLD_DOC, { lineNumbers: true, foldGutter: s }, FOLD_EXT)
        const g = view.dom.querySelector('.cm-gutters')!
        const row = g.firstElementChild
        view.reconfigure({ lineNumbers: true })
        view.reconfigure({ foldGutter: s })
        expect(view.dom.querySelector('.cm-gutters')!.firstElementChild).toBe(row)
        expect(view.dom.querySelector('.cm-foldMarker')).not.toBeNull()
    })

    it('先有折叠列再关行号再开行号,折叠列配置还在', () => {
        const { view } = mount(FOLD_DOC, { lineNumbers: true, foldGutter: spec() }, FOLD_EXT)
        view.reconfigure({ lineNumbers: false })
        view.reconfigure({ lineNumbers: true })
        expect(view.dom.querySelector('.cm-foldMarker')).not.toBeNull()
    })
})

describe('lineWrapping 运行时开关', () => {
    it('view.dom / contentDOM 的 cm-lineWrapping 类、oracle、行宽表跟着切', () => {
        const { view } = mount('x'.repeat(200))
        expect(view.lineWrapping).toBe(false)
        expect(view.dom.classList.contains('cm-lineWrapping')).toBe(false)
        view.reconfigure({ lineWrapping: true })
        expect(view.lineWrapping).toBe(true)
        expect(view.dom.classList.contains('cm-lineWrapping')).toBe(true)
        expect(view.contentDOM.classList.contains('cm-lineWrapping')).toBe(true)
        expect(view.oracle.lineWrapping).toBe(true)
        expect(view.lineWidthOracle.lineWrapping).toBe(true)
        expect(view.lineWidthMap.contentWidth()).toBe(0) // 折行永不横滚
        view.reconfigure({ lineWrapping: false })
        expect(view.lineWrapping).toBe(false)
        expect(view.dom.classList.contains('cm-lineWrapping')).toBe(false)
        expect(view.contentDOM.classList.contains('cm-lineWrapping')).toBe(false)
        expect(view.oracle.lineWrapping).toBe(false)
        expect(view.lineWidthOracle.lineWrapping).toBe(false)
        expect(view.lineWidthMap.contentWidth()).toBeGreaterThan(0) // 切回不折行:行宽表重建,横向滚动条有数据
    })

    it('值没变 → 无副作用(行 DOM 节点不被重画)', () => {
        const { view } = mount('abc\ndef')
        const first = view.contentDOM.firstChild
        const listener = vi.fn()
        view.onGeometry(listener)
        view.reconfigure({ lineWrapping: false })
        view.reconfigure({})
        expect(view.contentDOM.firstChild).toBe(first)
        expect(listener).not.toHaveBeenCalled()
    })

    it('折行下 gutter 高度按多视觉行重算(有布局桩)', () => {
        const geo = installGrid()
        const { view } = mount('x'.repeat(WRAP * 3) + '\nshort', { lineNumbers: true }, [], geo)
        expect(view.heightMap.height).toBeCloseTo(2 * LH, 3)
        view.reconfigure({ lineWrapping: true })
        expect(view.heightMap.height).toBeCloseTo(4 * LH, 3) // 3 视觉行 + 1
        const rows = view.dom.querySelectorAll('.cm-gutterElement') as NodeListOf<HTMLElement>
        expect(parseFloat(rows[0].style.height)).toBeCloseTo(3 * LH, 3)
        expect(parseFloat(rows[1].style.height)).toBeCloseTo(LH, 3)
        view.reconfigure({ lineWrapping: false })
        expect(view.heightMap.height).toBeCloseTo(2 * LH, 3)
        expect(parseFloat((view.dom.querySelectorAll('.cm-gutterElement')[0] as HTMLElement).style.height)).toBeCloseTo(LH, 3)
    })

    it('折行切换后滚动位置停在同一个文档位置', () => {
        const geo = installGrid()
        // 每行 = 一整行(不折)或 2 视觉行(折):第 100 行在视口顶
        const { view } = mount(lines(300, i => `${'y'.repeat(WRAP + 10)} ${i}`), {}, [], geo)
        geo.scrollTop = 99 * LH + 4
        view.remeasure()
        const topPos = () => view.heightMap.lineAt(view.scaler.fromDOM(geo.scrollTop), 1, view.oracle, 0, 0).from
        const before = topPos()
        view.reconfigure({ lineWrapping: true })
        expect(topPos()).toBe(before)
        // scrollTop = 锚点行块顶 + 原偏移(偏移不超过块高,保留);视口外行是估高,所以不写死数值
        expect(geo.scrollTop).toBeCloseTo(view.lineBlockAt(before).top + 4, 3)
        expect(view.lineBlockAt(before).height).toBeCloseTo(2 * LH, 3)
        view.reconfigure({ lineWrapping: false })
        expect(topPos()).toBe(before)
        // 块变矮(2 视觉行 → 1):块内偏移是折行下的视觉行数,作废,停在块顶
        expect(geo.scrollTop).toBeCloseTo(99 * LH, 3)
    })
})

describe('scrollBeyondLastLine 运行时开关', () => {
    it('总可滚高度 / contentDOM 下 padding 跟着变(末行下留 视口高 − 行高)', () => {
        const geo = installGrid()
        const { view } = mount(lines(100), {}, [], geo)
        const base = view.metrics.height
        expect(base).toBeCloseTo(100 * LH, 3)
        expect(view.scrollBeyondLastLine).toBe(false)
        view.reconfigure({ scrollBeyondLastLine: true })
        expect(view.scrollBeyondLastLine).toBe(true)
        expect(view.metrics.height).toBeCloseTo(100 * LH + VIEW_H - LH, 3)
        view.scrollDOM.scrollTop = 1e9 // 滚到最底(底部 padding 已含留白)
        view.remeasure()
        expect(parseFloat(view.contentDOM.style.paddingBottom)).toBeGreaterThanOrEqual(VIEW_H - LH)
        view.reconfigure({ scrollBeyondLastLine: false })
        expect(view.metrics.height).toBeCloseTo(100 * LH, 3)
    })

    it('改它不改滚动位置,且通知 overlay 重算几何', () => {
        const geo = installGrid()
        const { view } = mount(lines(100), {}, [], geo)
        geo.scrollTop = 500
        view.remeasure()
        const listener = vi.fn()
        view.onGeometry(listener)
        view.reconfigure({ scrollBeyondLastLine: true })
        expect(geo.scrollTop).toBe(500)
        expect(listener).toHaveBeenCalledTimes(1)
    })
})

describe('keymap 整体替换', () => {
    it('替换后立即生效:新绑定命中,旧绑定不再命中', () => {
        const hits: string[] = []
        const a: KeyBinding[] = [{ key: 'F9', run: () => (hits.push('a'), true) }]
        const b: KeyBinding[] = [{ key: 'F9', run: () => (hits.push('b'), true) }, { key: 'F10', run: () => (hits.push('m'), true) }]
        const { view } = mount('x', { keymap: a })
        keydown(view, 'F9', {})
        view.reconfigure({ keymap: b })
        keydown(view, 'F9', {})
        keydown(view, 'F10', {})
        expect(hits).toEqual(['a', 'b', 'm'])
        view.reconfigure({ keymap: a })
        keydown(view, 'F10', {})
        expect(hits).toEqual(['a', 'b', 'm']) // F10 已不在表里
    })

    it('换键位不增加监听:contentDOM 的 keydown 只走一个处理器(命中不重复)', () => {
        const hits: string[] = []
        const mk = (n: string): KeyBinding[] => [{ key: 'F9', run: () => (hits.push(n), true) }]
        const { view } = mount('x', { keymap: mk('0') })
        for (let i = 1; i <= 5; i++) view.reconfigure({ keymap: mk(String(i)) })
        keydown(view, 'F9', {})
        expect(hits).toEqual(['5'])
    })
})

describe('overlays 整体替换', () => {
    it('逆序 dispose 旧的,再按给定顺序挂新的', () => {
        const log: string[] = []
        const a = overlayProbe('a', log), b = overlayProbe('b', log), c = overlayProbe('c', log), d = overlayProbe('d', log)
        const { view } = mount('x', { overlays: [a.factory, b.factory] })
        expect(log).toEqual(['+a', '+b'])
        view.reconfigure({ overlays: [c.factory, d.factory] })
        expect(log).toEqual(['+a', '+b', '-b', '-a', '+c', '+d'])
        view.destroy()
        expect(log.slice(6)).toEqual(['-d', '-c'])
        expect([a, b, c, d].map(p => [p.mounts, p.disposes])).toEqual([[1, 1], [1, 1], [1, 1], [1, 1]])
    })

    it('同一份列表 / 不传 overlays → 不拆装', () => {
        const log: string[] = []
        const a = overlayProbe('a', log)
        const list = [a.factory]
        const { view } = mount('x', { overlays: list })
        view.reconfigure({ overlays: list })
        view.reconfigure({ overlays: [a.factory] }) // 内容相同的新数组
        view.reconfigure({ lineNumbers: true })
        expect(log).toEqual(['+a'])
    })

    it('overlay 在挂载时能看到最新结构:行号 gutter 先改好、overlay 后挂', () => {
        let seen = -1
        const { view } = mount('x')
        view.reconfigure({ lineNumbers: true, overlays: [v => { seen = v.dom.querySelectorAll('.cm-gutters').length; return () => {} }] })
        expect(seen).toBe(1)
    })

    it('旧 overlay 在结构变化之前就卸载(去掉 gutter 时旧 overlay 不会面对半拆的 DOM)', () => {
        let guttersAtDispose = -1
        const { view } = mount('x', { lineNumbers: true, overlays: [v => () => { guttersAtDispose = v.dom.querySelectorAll('.cm-gutters').length }] })
        view.reconfigure({ lineNumbers: false, overlays: [] })
        expect(guttersAtDispose).toBe(1)
    })

    it('destroy 对新旧 overlay 都只清理一次;destroy 之后 reconfigure / 再 destroy 是 no-op', () => {
        const log: string[] = []
        const a = overlayProbe('a', log), b = overlayProbe('b', log)
        const { view } = mount('x', { overlays: [a.factory] })
        view.reconfigure({ overlays: [b.factory] })
        view.destroy()
        view.destroy()
        view.reconfigure({ overlays: [a.factory], lineNumbers: true })
        expect([a.mounts, a.disposes, b.mounts, b.disposes]).toEqual([1, 1, 1, 1])
        expect(view.dom.isConnected).toBe(false)
    })

    it('某个 disposer 抛错:其余照常卸载 / 新的照常挂,错误最后抛出,不会二次 dispose', () => {
        const log: string[] = []
        const a = overlayProbe('a', log), c = overlayProbe('c', log)
        const bad = (_v: EditorView) => () => { log.push('-bad'); throw new Error('boom') }
        const { view } = mount('x', { overlays: [a.factory, bad] })
        expect(() => view.reconfigure({ overlays: [c.factory] })).toThrow('boom')
        expect(log).toEqual(['+a', '-bad', '-a', '+c'])
        view.destroy()
        expect(log).toEqual(['+a', '-bad', '-a', '+c', '-c'])
    })
})

describe('reconfigure 不丢状态 / 焦点', () => {
    function rich() {
        const doc = 'function f() {\n    a()\n}\n' + lines(30)
        const { view } = mount(doc, { lineNumbers: true }, [history(), foldField, decorations.of(foldDecorations)])
        view.dispatch(view.state.update({ changes: { from: doc.length, insert: '!' }, selection: EditorSelection.single(3, 8), userEvent: 'input.type' }))
        view.dispatch(view.state.update({ selection: EditorSelection.single(0) }))
        foldCode({ state: view.state, dispatch: tr => view.dispatch(tr) })
        view.dispatch(view.state.update({ selection: EditorSelection.create([EditorSelection.range(3, 8), EditorSelection.cursor(20)], 0) }))
        return view
    }
    const snap = (v: EditorView) => ({
        doc: v.state.doc.toString(), sel: v.state.selection.toJSON(), undo: undoDepth(v.state),
        folds: Array.from(v.state.field(foldField)), stateObj: v.state,
    })
    const patches: ViewReconfigure[] = [
        { lineNumbers: false }, { lineNumbers: true, foldGutter: spec() }, { lineWrapping: true }, { lineWrapping: false },
        { scrollBeyondLastLine: true }, { keymap: [] }, { overlays: [() => () => {}] }, { foldGutter: null },
    ]

    it('每种 patch 之后 doc / 选区 / 历史深度 / 折叠 / state 对象都原样', () => {
        const view = rich()
        expect(snap(view).folds).toEqual([1])
        const before = snap(view)
        for (const p of patches) {
            view.reconfigure(p)
            const after = snap(view)
            expect(after.doc).toBe(before.doc)
            expect(after.sel).toEqual(before.sel)
            expect(after.undo).toBe(before.undo)
            expect(after.folds).toEqual(before.folds)
            expect(after.stateObj).toBe(before.stateObj) // reconfigure 不派发事务
        }
        expect(view.contentDOM.textContent).toContain('⋯') // 折叠占位还在
    })

    it('reconfigure 期间不丢焦点', () => {
        const { view } = mount(lines(5), { lineNumbers: true })
        view.contentDOM.focus()
        expect(document.activeElement).toBe(view.contentDOM)
        for (const p of patches) {
            view.reconfigure(p)
            expect(document.activeElement).toBe(view.contentDOM)
        }
    })

    it('关/开 gutter 后原生选区仍然是 state 选区', () => {
        const { view } = mount('hello world', { lineNumbers: true })
        view.contentDOM.focus()
        view.dispatch(view.state.update({ selection: EditorSelection.single(2, 7) }))
        view.reconfigure({ lineNumbers: false })
        view.reconfigure({ lineNumbers: true })
        expect(document.getSelection()!.toString()).toBe('llo w')
    })

    it('reconfigure 引起的 DOM 变更不被当成用户输入(文档不变)', async () => {
        const { view } = mount(lines(20), { lineNumbers: true })
        const doc = view.state.doc.toString()
        view.reconfigure({ lineWrapping: true, lineNumbers: false })
        await new Promise(r => setTimeout(r, 20))
        expect(view.state.doc.toString()).toBe(doc)
    })
})

describe('多次来回切换不泄漏', () => {
    it('overlay 挂载 / 卸载平衡;view.dom 子节点数稳定;gutter 同时最多一份', () => {
        const log: string[] = []
        const a = overlayProbe('a', log)
        const { view } = mount(lines(10), { overlays: [a.factory] })
        const base = domShape(view)
        const baseCount = view.dom.childElementCount
        const scrollerKids = view.scrollDOM.childElementCount
        for (let i = 0; i < 20; i++) {
            view.reconfigure({ lineNumbers: true, foldGutter: spec(), lineWrapping: true, scrollBeyondLastLine: true, overlays: [overlayProbe('t', log).factory] })
            expect(gutterCount(view)).toBe(1)
            expect(view.dom.childElementCount).toBe(baseCount + 1)
            view.reconfigure({ lineNumbers: false, foldGutter: null, lineWrapping: false, scrollBeyondLastLine: false, overlays: [a.factory] })
            expect(gutterCount(view)).toBe(0)
            expect(view.dom.childElementCount).toBe(baseCount)
        }
        expect(domShape(view)).toBe(base)
        expect(view.scrollDOM.childElementCount).toBe(scrollerKids)
        const mounts = log.filter(l => l.startsWith('+')).length
        const disposes = log.filter(l => l.startsWith('-')).length
        expect(mounts - disposes).toBe(1) // 只剩当前挂着的那个 a
        view.destroy()
        expect(log.filter(l => l.startsWith('+')).length).toBe(log.filter(l => l.startsWith('-')).length)
    })

    it('带几何桩来回切折行 / 行号:行 DOM 数量、几何通知次数有界', () => {
        const geo = installGrid()
        const { view } = mount(lines(200, i => 'z'.repeat(i % 7 === 0 ? 100 : 10)), {}, [], geo)
        const n0 = view.contentDOM.childElementCount
        for (let i = 0; i < 10; i++) {
            view.reconfigure({ lineWrapping: true, lineNumbers: true })
            view.reconfigure({ lineWrapping: false, lineNumbers: false })
        }
        expect(view.contentDOM.childElementCount).toBe(n0)
        expect(view.heightMap.height).toBeCloseTo(200 * LH, 3)
        expect(gutterCount(view)).toBe(0)
    })
})

describe('layout / setAutomaticLayout', () => {
    class FakeRO {
        static all: FakeRO[] = []
        observed = new Set<Element>()
        constructor(public cb: () => void) { FakeRO.all.push(this) }
        observe(el: Element) { this.observed.add(el) }
        unobserve(el: Element) { this.observed.delete(el) }
        disconnect() { this.observed.clear() }
    }
    function withRO() {
        FakeRO.all = []
        override(window, 'ResizeObserver', { writable: true, value: FakeRO })
    }

    it('layout(dimension) 把 view.dom 固定成这个尺寸;layout() 还原宿主原有的内联尺寸并重量', () => {
        const { view } = mount('x')
        view.dom.style.height = '50%'
        view.layout({ width: 321, height: 123 })
        expect(view.dom.style.width).toBe('321px')
        expect(view.dom.style.height).toBe('123px')
        view.layout({ width: 400, height: 200 })
        expect(view.dom.style.height).toBe('200px')
        view.layout()
        expect(view.dom.style.width).toBe('')
        expect(view.dom.style.height).toBe('50%')
    })

    it('layout() 重新量容器并重排:容器变高 → 视口多渲染行;并总会通知几何监听', () => {
        const geo = installGrid()
        const { view } = mount(lines(200), {}, [], geo)
        const rows0 = view.contentDOM.childElementCount
        const listener = vi.fn()
        view.onGeometry(listener)
        geo.h = 800
        view.layout()
        expect(view.contentDOM.childElementCount).toBeGreaterThan(rows0)
        expect(listener).toHaveBeenCalled()
        const n = listener.mock.calls.length
        view.layout() // 尺寸没变也要再通知一次(Monaco layout 总会 render)
        expect(listener.mock.calls.length).toBe(n + 1)
    })

    it('默认跟随容器(observe scrollDOM);setAutomaticLayout(false) 停止观察、true 恢复,重复调用幂等', () => {
        withRO()
        const { view } = mount('x')
        const ro = FakeRO.all[0]
        expect(view.automaticLayout).toBe(true)
        expect(ro.observed.has(view.scrollDOM)).toBe(true)
        view.setAutomaticLayout(false)
        view.setAutomaticLayout(false)
        expect(view.automaticLayout).toBe(false)
        expect(ro.observed.has(view.scrollDOM)).toBe(false)
        expect(ro.observed.size).toBe(1) // 文本探针仍观察(字体 / 字号变化与 automaticLayout 无关)
        view.setAutomaticLayout(true)
        view.setAutomaticLayout(true)
        expect(ro.observed.has(view.scrollDOM)).toBe(true)
        expect(FakeRO.all.length).toBe(1)
    })

    it('构造时 automaticLayout:false → 一开始就不观察容器', () => {
        withRO()
        const { view } = mount('x', { automaticLayout: false })
        expect(FakeRO.all[0].observed.has(view.scrollDOM)).toBe(false)
        view.setAutomaticLayout(true)
        expect(FakeRO.all[0].observed.has(view.scrollDOM)).toBe(true)
    })

    it('automaticLayout 关着时容器变了不自动重排,手动 layout() 才重排', () => {
        withRO()
        const geo = installGrid()
        const { view } = mount(lines(200), { automaticLayout: false }, [], geo)
        const rows0 = view.contentDOM.childElementCount
        geo.h = 800
        FakeRO.all[0].cb() // 即使有人误触发,真实 RO 不会通知 scrollDOM;这里只验证 layout() 的路径
        view.layout()
        expect(view.contentDOM.childElementCount).toBeGreaterThan(rows0)
    })

    it('destroy 之后 layout / setAutomaticLayout 是 no-op', () => {
        withRO()
        const { view } = mount('x')
        view.destroy()
        view.layout({ width: 10, height: 10 })
        view.setAutomaticLayout(false)
        expect(view.dom.style.width).toBe('')
        expect(view.automaticLayout).toBe(true)
    })
})
