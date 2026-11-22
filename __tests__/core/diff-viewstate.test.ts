// Diff 编辑器的 saveViewState / restoreViewState:除了两侧视图状态,还带 diff 自己的 modelState(折叠区)。
// 期望格式来自 Monaco DiffEditorViewModel.serializeState:{ collapsedRegions: [{ range: [start, endExclusive] }] }
import { describe, expect, it } from 'vitest'
import { createDiffEditor, type DiffEditorConstructionOptions } from '../../src/diffeditor'
import type { ShikiLike } from '../../src/litemonaco'

const hl = {
    codeToTokens: () => ({ tokens: [[]], fg: '#fff', bg: '#000' }),
    getLastGrammarState: () => undefined,
    getTheme: () => ({ bg: '#1e1e1e', fg: '#d4d4d4', type: 'dark' as const }),
} as unknown as ShikiLike

const lines = (n: number, mark = new Map<number, string>()) =>
    Array.from({ length: n }, (_, i) => mark.get(i + 1) ?? `line ${i + 1}`).join('\n') + '\n'

function mount(original: string, modified: string, extra: Partial<DiffEditorConstructionOptions> = {}) {
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    const d = createDiffEditor(parent, { highlighter: hl, lang: 'text', original, modified, hideUnchangedRegions: { enabled: true }, ...extra })
    return { d, done: () => { d.destroy(); parent.remove() } }
}
const widgets = (d: ReturnType<typeof mount>['d']) => d.getModifiedEditor().contentDOM.querySelectorAll('.diff-hidden-lines-widget').length
const collapsed = (d: ReturnType<typeof mount>['d']) =>
    ((d.saveViewState().modelState as { collapsedRegions: { range: [number, number] }[] }).collapsedRegions)

/** 两侧光标都放到可见的改动行上(光标在折叠行里,还原选区时会按 Monaco 的规矩把它展开) */
const park = (d: ReturnType<typeof mount>['d']) => {
    for (const v of [d.getOriginalEditor(), d.getModifiedEditor()]) v.dispatch(v.state.update({ selection: { anchor: v.state.doc.line(30).from } }))
}

const A = lines(60)
const B = lines(60, new Map([[30, 'CHANGED']]))

describe('saveViewState 含 modelState.collapsedRegions(Monaco 格式)', () => {
    it('折叠态:每段区域一个 range,半开区间,不含上下文行', () => {
        const { d, done } = mount(A, B)
        const s = d.saveViewState()
        expect(s.original && s.modified).toBeTruthy()
        // 1..60 行,第 30 行改了,上下文 3 行:前段折叠 modified 行 1..26(不含首尾上下文),后段 34..61(文档末尾换行多一个空行,end 为 62)
        expect(collapsed(d)).toEqual([{ range: [1, 27] }, { range: [34, 62] }])
        done()
    })
    it('没开 hideUnchangedRegions:collapsedRegions 为 undefined,不报错', () => {
        const { d, done } = mount(A, B, { hideUnchangedRegions: { enabled: false } })
        expect((d.saveViewState().modelState as { collapsedRegions?: unknown }).collapsedRegions).toBeUndefined()
        done()
    })
    it('展开全部后,range 为空区间', () => {
        const { d, done } = mount(A, B)
        d.showAllUnchangedRegions()
        for (const r of collapsed(d)) expect(r.range[0]).toBe(r.range[1])
        done()
    })
    it('JSON 往返不丢信息(Monaco 把它存进 view state 持久化)', () => {
        const { d, done } = mount(A, B)
        const s = JSON.parse(JSON.stringify(d.saveViewState()))
        expect(s.modelState.collapsedRegions).toEqual(collapsed(d))
        done()
    })
})

describe('restoreViewState 还原折叠区', () => {
    it('展开一段 → 存 → 另一个编辑器还原:折叠范围一致', () => {
        const a = mount(A, B)
        // 用户展开了第一段的下面 10 行
        const first = (a.d as unknown as { regions: { showMoreBelow(n: number): void }[] }).regions[0]
        first.showMoreBelow(10)
        ;(a.d as unknown as { applyHidden(): void }).applyHidden()
        const saved = a.d.saveViewState()
        expect(collapsed(a.d)[0].range).toEqual([1, 17])

        const b = mount(A, B)
        expect(collapsed(b.d)[0].range).toEqual([1, 27])
        b.d.restoreViewState(JSON.parse(JSON.stringify(saved)))
        expect(collapsed(b.d)).toEqual(collapsed(a.d))
        a.done(); b.done()
    })
    it('全部展开的状态还原后:没有控制条', () => {
        const a = mount(A, B)
        a.d.showAllUnchangedRegions()
        const saved = a.d.saveViewState()
        const b = mount(A, B)
        expect(widgets(b.d)).toBeGreaterThan(0)
        b.d.restoreViewState(saved)
        expect(widgets(b.d)).toBe(0)
        a.done(); b.done()
    })
    it('折叠 → 展开 → 再还原旧的折叠态:控制条回来', () => {
        const { d, done } = mount(A, B)
        const folded = d.saveViewState()
        const n = widgets(d)
        d.showAllUnchangedRegions()
        expect(widgets(d)).toBe(0)
        d.restoreViewState(folded)
        expect(widgets(d)).toBe(n)
        done()
    })
    it('存档的区间与现有区域不相交:忽略,不抛', () => {
        const { d, done } = mount(A, B)
        park(d)
        const before = collapsed(d)
        const s = d.saveViewState()
        s.modelState = { collapsedRegions: [{ range: [500, 600] }] }
        d.restoreViewState(s)
        expect(collapsed(d)).toEqual(before)
        done()
    })
    it('没有 modelState(旧存档):只还原两侧,折叠态不变', () => {
        const { d, done } = mount(A, B)
        park(d)
        const before = collapsed(d)
        const s = d.saveViewState()
        delete s.modelState
        d.restoreViewState(s)
        expect(collapsed(d)).toEqual(before)
        d.restoreViewState(null)
        expect(collapsed(d)).toEqual(before)
        done()
    })
    it('两侧的光标 / 滚动仍然一并还原', () => {
        const a = mount(A, B)
        const v = a.d.getModifiedEditor()
        v.dispatch(v.state.update({ selection: { anchor: v.state.doc.line(30).from + 2 } }))
        const saved = a.d.saveViewState()
        const b = mount(A, B)
        b.d.restoreViewState(saved)
        const bv = b.d.getModifiedEditor()
        expect(bv.state.selection.main.head).toBe(bv.state.doc.line(30).from + 2)
        a.done(); b.done()
    })
})
