// 折叠区控制条里的面包屑(Monaco hideUnchangedRegionsFeature + contrib/diffEditorBreadcrumbs)+ 展开 / 折叠交互。
// getBreadcrumbItems:起点在折叠区间内、终点在区间外的符号,范围大(外层)的在前;图标 = SymbolKinds.toIcon;点击 → 把该行露出来。
import { afterEach, describe, expect, it } from 'vitest'
import { createDiffEditor, type DiffEditorConstructionOptions } from '../../src/diffeditor'
import { registerDocumentSymbolProvider, type DocumentSymbol } from '../../src/lang/languagefeatures'
import { symbolIconName } from '../../src/core/diff/widgets'
import type { ShikiLike } from '../../src/litemonaco'

const hl = {
    codeToTokens: () => ({ tokens: [[]], fg: '#fff', bg: '#000' }),
    getLastGrammarState: () => undefined,
    getTheme: () => ({ bg: '#1e1e1e', fg: '#d4d4d4', type: 'dark' as const }),
} as unknown as ShikiLike

const lines = (n: number, mark = new Map<number, string>()) =>
    Array.from({ length: n }, (_, i) => mark.get(i + 1) ?? `line ${i + 1}`).join('\n') + '\n'

type D = ReturnType<typeof createDiffEditor>
const live: (() => void)[] = []
afterEach(() => { while (live.length) live.pop()!() })
function mount(original: string, modified: string, extra: Partial<DiffEditorConstructionOptions> = {}) {
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    const d = createDiffEditor(parent, { highlighter: hl, lang: 'text', original, modified, hideUnchangedRegions: { enabled: true }, ...extra })
    live.push(() => { d.destroy(); parent.remove() })
    return d
}
const sym = (name: string, kind: number, from: number, to: number): DocumentSymbol => ({
    name, detail: '', kind, tags: [],
    range: { startLineNumber: from, startColumn: 1, endLineNumber: to, endColumn: 1 },
    selectionRange: { startLineNumber: from, startColumn: 1, endLineNumber: from, endColumn: 1 },
})
const tick = () => new Promise(r => setTimeout(r, 20))
const crumbs = (d: D) => [...d.getModifiedEditor().contentDOM.querySelectorAll('.diff-hidden-lines .center .others .breadcrumb-item')]
const hiddenWidgets = (d: D) => d.getModifiedEditor().contentDOM.querySelectorAll('.diff-hidden-lines-widget').length
const regions = (d: D) => (d as unknown as { regions: { getHiddenModifiedRange(): { start: number, end: number } }[] }).regions
const hiddenRanges = (d: D) => regions(d).map(r => { const h = r.getHiddenModifiedRange(); return [h.start, h.end] })

// 100 行,第 50 行改了;折叠区(上下文 3 行):1..46 和 54..101
const A = lines(100)
const B = lines(100, new Map([[50, 'CHANGED']]))

function withSymbols(symbols: DocumentSymbol[], name = 'test') {
    const off = registerDocumentSymbolProvider('*', { displayName: name, provideDocumentSymbols: () => symbols })
    live.push(() => off.dispose())
}

describe('面包屑:来源 = documentSymbolProvider', () => {
    it('起点在折叠区内、终点在区外的符号才出现,外层在前,带图标、分隔符、chevron', async () => {
        withSymbols([
            sym('Outer', 4, 10, 80),   // class,10 在第一段里,80 在改动之后 → 出现在第一段
            sym('inner', 5, 20, 70),   // method,同样跨过改动 → 出现在第一段(范围比 Outer 小,排后面)
            sym('tiny', 11, 5, 8),     // 整个在第一段里 → 不出现
            sym('later', 11, 60, 90),  // 起点在第二段、终点也在第二段 → 不出现
        ])
        const d = mount(A, B)
        await tick()
        const first = d.getModifiedEditor().contentDOM.querySelector('.diff-hidden-lines .center .others')!
        const items = [...first.querySelectorAll('.breadcrumb-item')]
        expect(items.map(x => x.textContent!.replace(/ /g, ' ').trim())).toEqual(['Outer', 'inner'])
        expect(items[0].querySelector('.codicon-symbol-class')).toBeTruthy()
        expect(items[1].querySelector('.codicon-symbol-method')).toBeTruthy()
        expect(items[0].querySelector('.codicon-chevron-right')).toBeTruthy()
        expect(items[1].querySelector('.codicon-chevron-right')).toBeNull()
        expect(first.textContent).toContain('hidden lines')
        expect(first.textContent).toContain('|')
    })
    it('getBreadcrumbItems 与 Monaco 一致:按范围大小倒序', async () => {
        withSymbols([sym('b', 5, 12, 60), sym('a', 4, 2, 90), sym('c', 5, 30, 55)])
        const d = mount(A, B)
        await tick()
        expect(d.getBreadcrumbItems({ start: 1, end: 47 }).map(x => x.name)).toEqual(['a', 'b', 'c'])
        expect(d.getBreadcrumbItems({ start: 1, end: 47 })[0]).toEqual({ name: 'a', kind: 4, startLineNumber: 2 })
        expect(d.getBreadcrumbItems({ start: 54, end: 101 })).toEqual([])
    })
    it('没有 provider:不画面包屑,控制条照常', async () => {
        const d = mount(A, B)
        await tick()
        expect(hiddenWidgets(d)).toBeGreaterThan(0)
        expect(crumbs(d).length).toBe(0)
    })
    it('provider 之后才注册:面包屑补上;注销后消失', async () => {
        const d = mount(A, B)
        await tick()
        expect(crumbs(d).length).toBe(0)
        const off = registerDocumentSymbolProvider('*', { provideDocumentSymbols: () => [sym('Late', 4, 3, 90)] })
        live.push(() => off.dispose())
        await tick()
        expect(crumbs(d).map(x => x.textContent)).toContain(' Late')
        off.dispose()
        await tick()
        expect(crumbs(d).length).toBe(0)
    })
    it('provider 抛错:不影响折叠条', async () => {
        const off = registerDocumentSymbolProvider('*', { provideDocumentSymbols: () => { throw new Error('boom') } })
        live.push(() => off.dispose())
        const d = mount(A, B)
        await tick()
        expect(hiddenWidgets(d)).toBeGreaterThan(0)
        expect(crumbs(d).length).toBe(0)
    })
    it('没开 hideUnchangedRegions:没有面包屑,getBreadcrumbItems 为空', async () => {
        withSymbols([sym('Outer', 4, 10, 80)])
        const d = mount(A, B, { hideUnchangedRegions: { enabled: false } })
        await tick()
        expect(hiddenWidgets(d)).toBe(0)
        expect(d.getBreadcrumbItems({ start: 1, end: 47 })).toEqual([])
        // 运行时打开:面包屑出现
        d.updateOptions({ hideUnchangedRegions: { enabled: true } })
        await tick()
        expect(crumbs(d).length).toBeGreaterThan(0)
    })
    it('编辑后重算 diff:面包屑跟着新大纲走', async () => {
        let name = 'v1'
        const off = registerDocumentSymbolProvider('*', { provideDocumentSymbols: () => [sym(name, 4, 3, 90)] })
        live.push(() => off.dispose())
        const d = mount(A, B, { recomputeDebounceMs: 0 })
        await tick()
        expect(crumbs(d)[0].textContent).toContain('v1')
        name = 'v2'
        const v = d.getModifiedEditor()
        v.dispatch(v.state.update({ changes: { from: v.state.doc.line(50).to, insert: '!' } }))
        await tick(); await tick()
        expect(crumbs(d)[0].textContent).toContain('v2')
    })
})

describe('面包屑:点击', () => {
    it('点面包屑项 → 把该符号起点那一行露出来(Monaco ensureModifiedLineIsVisible FromBottom)', async () => {
        withSymbols([sym('Outer', 4, 10, 80)])
        const d = mount(A, B)
        await tick()
        const before = hiddenRanges(d)[0]
        expect(before).toEqual([1, 47])
        ;(crumbs(d)[0] as HTMLElement).click()
        const after = hiddenRanges(d)[0]
        // FromBottom:从底部往上露到第 10 行 → 隐藏区间缩到 [1,10)
        expect(after).toEqual([1, 10])
        // 第二段不受影响
        expect(hiddenRanges(d)[1]).toEqual([54, 102])
    })
    it('点完以后第 10 行真的在 DOM 里可见', async () => {
        withSymbols([sym('Outer', 4, 10, 80)])
        const d = mount(A, B)
        await tick()
        expect(d.getModifiedEditor().contentDOM.textContent).not.toContain('line 10')
        ;(crumbs(d)[0] as HTMLElement).click()
        expect(d.getModifiedEditor().contentDOM.textContent).toContain('line 10')
    })
})

describe('symbolIconName(Monaco SymbolKinds.toIcon)', () => {
    it('每个 SymbolKind 都有图标,未知退 symbol-property', () => {
        const names = Array.from({ length: 26 }, (_, k) => symbolIconName(k))
        expect(new Set(names).size).toBeGreaterThanOrEqual(24)
        expect(symbolIconName(4)).toBe('symbol-class')
        expect(symbolIconName(11)).toBe('symbol-function')
        expect(symbolIconName(21)).toBe('symbol-enum-member')
        expect(symbolIconName(999)).toBe('symbol-property')
    })
})

describe('折叠 / 展开交互', () => {
    const hidden = (d: D) => d.getModifiedEditor().contentDOM.querySelector('.diff-hidden-lines')!
    it('展开图标(Show Unchanged Region)→ 整段展开', () => {
        const d = mount(A, B)
        const n = hiddenWidgets(d)
        ;(hidden(d).querySelector('a[title="Show Unchanged Region"]') as HTMLElement).click()
        expect(hiddenWidgets(d)).toBe(n - 1)
        expect(hiddenRanges(d)[0][0]).toBe(hiddenRanges(d)[0][1])
    })
    it('双击 "N hidden lines" 文字 → 整段展开', () => {
        const d = mount(A, B)
        const n = hiddenWidgets(d)
        const label = hidden(d).querySelector('.center .others > span') as HTMLElement
        expect(label.textContent).toBe('46 hidden lines')
        label.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, button: 0 }))
        expect(hiddenWidgets(d)).toBe(n - 1)
    })
    it('上手柄:按下不动 → 多露 revealLineCount(默认 20)行', () => {
        const d = mount(A, B)
        const top = hidden(d).querySelector('.top') as HTMLElement
        top.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, clientY: 100 }))
        window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, clientY: 100 }))
        expect(hiddenRanges(d)[0]).toEqual([21, 47])
    })
    it('下手柄:按下不动 → 从底部多露 20 行', () => {
        const d = mount(A, B)
        const bottom = hidden(d).querySelector('.bottom') as HTMLElement
        bottom.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, clientY: 100 }))
        window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, clientY: 100 }))
        expect(hiddenRanges(d)[0]).toEqual([1, 27])
    })
    it('revealLineCount 选项改变手柄一次露多少行', () => {
        const d = mount(A, B, { hideUnchangedRegions: { enabled: true, revealLineCount: 5 } })
        const top = hidden(d).querySelector('.top') as HTMLElement
        top.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, clientY: 100 }))
        window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, clientY: 100 }))
        expect(hiddenRanges(d)[0]).toEqual([6, 47])
    })
    it('光标跳进折叠行 → 该行被露出来(按离哪边近从哪边露)', () => {
        const d = mount(A, B)
        const v = d.getModifiedEditor()
        v.dispatch(v.state.update({ selection: { anchor: v.state.doc.line(40).from } }))
        const [s, e] = hiddenRanges(d)[0]
        expect(s <= 40 && 40 < e).toBe(false)
    })
    it('collapseAll 把露出来的全部收回去;showAll 全展开', () => {
        const d = mount(A, B)
        ;(hidden(d).querySelector('a[title="Show Unchanged Region"]') as HTMLElement).click()
        d.collapseAllUnchangedRegions()
        expect(hiddenRanges(d)).toEqual([[1, 47], [54, 102]])
        d.showAllUnchangedRegions()
        for (const [s, e] of hiddenRanges(d)) expect(s).toBe(e)
    })
    it('展开后控制条消失、行装饰成 diff-unchanged-lines 底色', () => {
        const d = mount(A, B)
        d.showAllUnchangedRegions()
        expect(hiddenWidgets(d)).toBe(0)
        expect(d.getModifiedEditor().contentDOM.querySelectorAll('.diff-unchanged-lines').length).toBeGreaterThan(40)
    })
})
