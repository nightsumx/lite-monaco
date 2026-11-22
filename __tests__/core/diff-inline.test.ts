// Diff 行内(inline)模式:被删行、新增行、字级高亮、窄面板自动退回、useTrueInlineView。
// jsdom 没有布局:clientWidth / clientHeight 用桩(宽度可调,用来测 renderSideBySideInlineBreakpoint)。
// 期望对照 Monaco 0.55.1 diffEditorViewZones / diffEditorDecorations / style.css 的规则。
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDiffEditor, type DiffEditor, type DiffEditorConstructionOptions } from '../../src/diffeditor'
import type { ShikiLike } from '../../src/litemonaco'

const hl = {
    codeToTokens: () => ({ tokens: [[]], fg: '#fff', bg: '#000' }),
    getLastGrammarState: () => undefined,
    getTheme: () => ({ bg: '#1e1e1e', fg: '#d4d4d4', type: 'dark' as const }),
} as unknown as ShikiLike

let width = 0
const restores: (() => void)[] = []
beforeEach(() => {
    width = 0
    const P = HTMLElement.prototype
    const prev = { h: Object.getOwnPropertyDescriptor(P, 'clientHeight'), w: Object.getOwnPropertyDescriptor(P, 'clientWidth') }
    Object.defineProperty(P, 'clientHeight', { configurable: true, get(this: HTMLElement) { return this.classList.contains('cm-scroller') || this.classList.contains('monaco-diff-editor') ? 400 : 0 } })
    Object.defineProperty(P, 'clientWidth', { configurable: true, get(this: HTMLElement) { return this.classList.contains('cm-scroller') ? 400 : this.classList.contains('monaco-diff-editor') ? width : 0 } })
    restores.push(() => {
        if (prev.h) Object.defineProperty(P, 'clientHeight', prev.h); else delete (P as unknown as Record<string, unknown>).clientHeight
        if (prev.w) Object.defineProperty(P, 'clientWidth', prev.w); else delete (P as unknown as Record<string, unknown>).clientWidth
    })
})
const live: { d: DiffEditor, parent: HTMLElement }[] = []
afterEach(() => {
    for (const { d, parent } of live.splice(0)) { d.destroy(); parent.remove() }
    while (restores.length) restores.pop()!()
    document.body.innerHTML = ''
})

function mount(original: string, modified: string, extra: Partial<DiffEditorConstructionOptions> = {}) {
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    const d = createDiffEditor(parent, { highlighter: hl, lang: 'text', original, modified, recomputeDebounceMs: 0, renderSideBySide: false, ...extra })
    live.push({ d, parent })
    d.layout()
    return d
}
const lineClasses = (v: { contentDOM: HTMLElement }, cls: string) =>
    [...v.contentDOM.querySelectorAll('.cm-line')].flatMap((el, i) => el.classList.contains(cls) ? [i + 1] : [])
const deletedRows = (d: DiffEditor) => [...d.dom.querySelectorAll('.inline-deleted-line')]
const rowText = (r: Element) => r.querySelector('.inline-deleted-text-line')?.textContent

describe('Diff 行内视图:被删行画在修改侧', () => {
    it('原文侧藏起来(没有 side-by-side 类),也没有分隔条拖动', () => {
        const d = mount('a\nb\n', 'a\nB\n')
        expect(d.dom.classList.contains('side-by-side')).toBe(false)
    })
    it('纯删除:被删的行各占一行,带 line-delete 和 - 号;修改侧没有 line-insert', () => {
        const d = mount('a\nX\nY\nb\n', 'a\nb\n')
        const rows = deletedRows(d)
        expect(rows.map(rowText)).toEqual(['X', 'Y'])
        expect(rows.every(r => r.classList.contains('line-delete'))).toBe(true)
        expect(d.dom.querySelectorAll('.inline-deleted-line .delete-sign.codicon-remove').length).toBe(2)
        expect(lineClasses(d.getModifiedEditor(), 'line-insert')).toEqual([])
    })
    it('被删行带原文行号(inline-deleted-margin-view-zone),compactMode 以外都显示', () => {
        const d = mount('a\nX\nY\nb\n', 'a\nb\n')
        expect(deletedRows(d).map(r => r.querySelector('.inline-deleted-margin-view-zone')?.textContent)).toEqual(['2', '3'])
    })
    it('纯插入:没有被删行,新增的行带 line-insert + char-insert', () => {
        const d = mount('a\nb\n', 'a\nX\nY\nb\n')
        expect(deletedRows(d)).toEqual([])
        expect(lineClasses(d.getModifiedEditor(), 'line-insert')).toEqual([2, 3])
        expect(lineClasses(d.getModifiedEditor(), 'char-insert')).toEqual([2, 3])
    })
    it('整行替换:被删的旧行出现在新行之前,新行有 line-insert', () => {
        const d = mount('a\nold\nc\n', 'a\nnew\nc\n')
        expect(deletedRows(d).map(rowText)).toEqual(['old'])
        expect(lineClasses(d.getModifiedEditor(), 'line-insert')).toEqual([2])
    })
})

describe('Diff 行内视图:字级高亮', () => {
    it('改一个词:被删行里旧词是 .char-delete,新行里新词是 .char-insert', () => {
        const d = mount('a\nhello world\nc\n', 'a\nhello there\nc\n')
        const row = deletedRows(d)[0]
        expect(rowText(row)).toBe('hello world')
        expect([...row.querySelectorAll('.char-delete')].map(e => e.textContent)).toEqual(['world'])
        expect([...d.getModifiedEditor().contentDOM.querySelectorAll('.cm-line span.char-insert')].map(e => e.textContent)).toEqual(['there'])
    })
    it('同一行里多处改动各自一个框', () => {
        const d = mount('let a = 1, b = 2\n', 'let a = 5, b = 7\n')
        const row = deletedRows(d)[0]
        expect([...row.querySelectorAll('.char-delete')].map(e => e.textContent)).toEqual(['1', '2'])
        expect([...d.getModifiedEditor().contentDOM.querySelectorAll('.cm-line span.char-insert')].map(e => e.textContent)).toEqual(['5', '7'])
    })
    it('Tab 在被删行里按 tabSize 展开成空格(行内视图的删除行不是编辑器里的真文字)', () => {
        const d = mount('\tfoo\n', '\tbar\n')
        expect(rowText(deletedRows(d)[0])).toBe(`${' '.repeat(d.getModifiedEditor().state.tabSize)}foo`)
    })
})

describe('Diff 行内视图:编辑后重算', () => {
    it('改 modified 文字 → 重算后被删行跟着变', async () => {
        const d = mount('a\nb\nc\n', 'a\nb\nc\n')
        expect(deletedRows(d)).toEqual([])
        const v = d.getModifiedEditor()
        v.dispatch(v.state.update({ changes: { from: v.state.doc.line(2).from, to: v.state.doc.line(2).to, insert: 'B' } }))
        await d.waitForDiff()
        expect(deletedRows(d).map(rowText)).toEqual(['b'])
        expect(lineClasses(d.getModifiedEditor(), 'line-insert')).toEqual([2])
    })
})

describe('Diff:窄面板自动退回行内(useInlineViewWhenSpaceIsLimited)', () => {
    const sbs = (d: DiffEditor) => d.dom.classList.contains('side-by-side')
    it('宽度 ≤ renderSideBySideInlineBreakpoint(默认 900)→ 行内;更宽 → 并排', () => {
        width = 800
        expect(sbs(mount('a\nb\n', 'a\nB\n', { renderSideBySide: true }))).toBe(false)
        width = 1200
        expect(sbs(mount('a\nb\n', 'a\nB\n', { renderSideBySide: true }))).toBe(true)
    })
    it('自定义断点:renderSideBySideInlineBreakpoint 生效', () => {
        width = 800
        expect(sbs(mount('a\nb\n', 'a\nB\n', { renderSideBySide: true, renderSideBySideInlineBreakpoint: 500 }))).toBe(true)
    })
    it('useInlineViewWhenSpaceIsLimited:false → 再窄也并排', () => {
        width = 300
        expect(sbs(mount('a\nb\n', 'a\nB\n', { renderSideBySide: true, useInlineViewWhenSpaceIsLimited: false }))).toBe(true)
    })
    it('运行时拖宽 → 自动换回并排(updateOptions / layout)', () => {
        width = 800
        const d = mount('a\nb\n', 'a\nB\n', { renderSideBySide: true })
        expect(sbs(d)).toBe(false)
        width = 1400
        d.layout()
        expect(sbs(d)).toBe(true)
    })
})

describe('Diff:experimental.useTrueInlineView(被删文字画在修改侧原位)', () => {
    const inlineDeleted = (d: DiffEditor) => [...d.getModifiedEditor().contentDOM.querySelectorAll('.inline-deleted-text')].map(e => e.textContent)
    it('单行内的改动:不再有被删行块,旧文字作为 .inline-deleted-text 插在新文字前', () => {
        const d = mount('a\nhello world\nc\n', 'a\nhello there\nc\n', { experimental: { useTrueInlineView: true } })
        expect(deletedRows(d)).toEqual([])
        expect(inlineDeleted(d)).toEqual(['world'])
        expect([...d.getModifiedEditor().contentDOM.querySelectorAll('.cm-line span.char-insert')].map(e => e.textContent)).toEqual(['there'])
        const line = d.getModifiedEditor().contentDOM.querySelectorAll('.cm-line')[1]
        expect(line.textContent).toContain('worldthere') // 旧词在新词之前,同一行
    })
    it('纯删一个词(新侧是空区间):旧词画在原位', () => {
        const d = mount('a b c\n', 'a  c\n', { experimental: { useTrueInlineView: true } })
        expect(inlineDeleted(d)).toEqual(['b'])
        expect(deletedRows(d)).toEqual([])
    })
    it('块里有跨行的改动 → 退回被删行块(Monaco allowsTrueInlineDiffRendering)', () => {
        const d = mount('a\nfunction x() {\n  return 1\n}\nz\n', 'a\nclass Y {\n  m() {}\n  n() {}\n}\nz\n', { experimental: { useTrueInlineView: true } })
        expect(deletedRows(d).length).toBeGreaterThan(0)
        expect(inlineDeleted(d)).toEqual([])
    })
    it('整行被删(纯删除)也用被删行块', () => {
        const d = mount('a\nX\nb\n', 'a\nb\n', { experimental: { useTrueInlineView: true } })
        expect(deletedRows(d).map(rowText)).toEqual(['X'])
    })
    it('只在行内视图生效:并排时仍是两侧各自的框', () => {
        const d = mount('hello world\n', 'hello there\n', { renderSideBySide: true, experimental: { useTrueInlineView: true } })
        expect(inlineDeleted(d)).toEqual([])
        expect(d.getOriginalEditor().contentDOM.querySelector('.cm-line span.char-delete')?.textContent).toBe('world')
    })
    it('默认关:行内视图里单行改动仍是被删行块', () => {
        const d = mount('hello world\n', 'hello there\n')
        expect(inlineDeleted(d)).toEqual([])
        expect(deletedRows(d).map(rowText)).toEqual(['hello world'])
    })
    it('updateOptions 运行时打开 / 关闭', async () => {
        const d = mount('hello world\n', 'hello there\n')
        d.updateOptions({ experimental: { useTrueInlineView: true } })
        await d.waitForDiff()
        expect(inlineDeleted(d)).toEqual(['world'])
        d.updateOptions({ experimental: { useTrueInlineView: false } })
        await d.waitForDiff()
        expect(inlineDeleted(d)).toEqual([])
        expect(deletedRows(d).length).toBe(1)
    })
})
