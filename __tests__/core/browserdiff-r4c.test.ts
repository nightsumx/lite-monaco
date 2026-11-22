// 第四轮·块C:diff 编辑器 / 命令面板 / 懒加载高亮器的浏览器对照修复固化。
// 几何类的实测值在 scripts/browser-diff/scenarios/96-diff.mjs(真 Chromium 里 Monaco 0.55.1 与 lite 逐项对照)。
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, mountEditor } from './h2-helpers'
import { createDiffEditor } from '../../src/diffeditor'
import { defaultPaletteCommands } from '../../src/core/feature/commandpalette'
import type { ShikiLike } from '../../src/litemonaco'

const hl = {
    codeToTokens: () => ({ tokens: [[]], fg: '#fff', bg: '#000' }),
    getLastGrammarState: () => undefined,
    getTheme: () => ({ bg: '#1e1e1e', fg: '#d4d4d4', type: 'dark' as const }),
} as unknown as ShikiLike

function diff(extra: Record<string, unknown> = {}, original = 'a\nb\nc\nd', modified = 'a\nB\nc\nd\ne') {
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    const d = createDiffEditor(parent, { highlighter: hl, lang: 'text', original, modified, ...extra } as never)
    return { d, done: () => { d.destroy(); parent.remove() } }
}

afterEach(cleanup)

describe('diff 两侧编辑器吃到编辑器选项(Monaco _adjustOptionsFor*)', () => {
    it('fontSize / lineHeight 进视图层,不只是 facet', () => {
        const { d, done } = diff({ fontSize: 14, lineHeight: 20 })
        for (const e of [d.getOriginalEditor(), d.getModifiedEditor()]) {
            expect(e.getOption(50 as never) === undefined).toBe(false)
            expect(e.getRawOptions().fontSize).toBe(14)
            expect(e.getRawOptions().lineHeight).toBe(20)
            expect((e as unknown as { opts: { fontInfo: { fontSize: number, lineHeight: number } } }).opts.fontInfo.fontSize).toBe(14)
            expect((e as unknown as { opts: { fontInfo: { lineHeight: number } } }).opts.fontInfo.lineHeight).toBe(20)
        }
        done()
    })
    it('原文侧并排时只读、留一条字形边距;originalEditable 才可编辑', () => {
        const { d, done } = diff()
        const o = d.getOriginalEditor() as unknown as { getRawOptions(): Record<string, unknown>, opts: { glyphMargin: boolean } }
        expect(o.getRawOptions().readOnly).toBe(true)
        expect(o.getRawOptions().glyphMargin).toBe(true)
        expect(o.opts.glyphMargin).toBe(true)
        d.updateOptions({ originalEditable: true })
        expect(o.getRawOptions().readOnly).toBe(false)
        done()
    })
    it('并排 ↔ 行内:原文侧的字形边距跟着开关,视图层(不只是选项)也换掉', () => {
        const { d, done } = diff()
        const o = d.getOriginalEditor() as unknown as { opts: { glyphMargin: boolean }, dom: HTMLElement }
        expect(o.opts.glyphMargin).toBe(true)
        d.updateOptions({ renderSideBySide: false, useInlineViewWhenSpaceIsLimited: false })
        expect(o.opts.glyphMargin).toBe(false)
        expect(o.dom.classList.contains('cm-glyphMargin-off')).toBe(true)
        d.updateOptions({ renderSideBySide: true })
        expect(o.opts.glyphMargin).toBe(true)
        // 切回来要去掉「没有字形边距」的类(以前只加不减)
        expect(o.dom.classList.contains('cm-glyphMargin-off')).toBe(false)
        done()
    })
})

describe('命令面板补齐 Monaco 0.55.1 的动作(真 Monaco F1 逐条对照得出)', () => {
    const labels = () => new Set(defaultPaletteCommands().map(c => c.label))
    it.each([
        'Hide Hover', 'Add Selection to Previous Find Match', 'Move Last Selection to Previous Find Match',
        'Add Cursors to Bottom', 'Add Cursors to Top', 'Focus Next Cursor', 'Focus Previous Cursor', 'Delete Word',
        'Move Selected Text Left', 'Move Selected Text Right', 'Increase Editor Font Size', 'Decrease Editor Font Size',
        'Reset Editor Font Size', 'Show Editor Context Menu', 'Insert Final New Line',
    ])('F1 里有 %s', l => expect(labels().has(l), l).toBe(true))
    it('大小写同 Monaco 0.55.1(Find with Selection / Reverse lines / …to Next Find Match)', () => {
        for (const l of ['Find with Selection', 'Reverse lines', 'Add Selection to Next Find Match', 'Move Last Selection to Next Find Match'])
            expect(labels().has(l), l).toBe(true)
        for (const old of ['Find With Selection', 'Reverse Lines', 'Insert Final Newline'])
            expect(labels().has(old), old).toBe(false)
    })
    it('editor.action.* 的 id 都能 getAction 到', () => {
        const ed = mountEditor('x')
        for (const id of ['editor.action.hideHover', 'editor.action.addSelectionToPreviousFindMatch', 'editor.action.moveSelectionToPreviousFindMatch',
            'editor.action.addCursorsToBottom', 'editor.action.addCursorsToTop', 'editor.action.focusNextCursor', 'editor.action.focusPreviousCursor',
            'editor.action.insertFinalNewLine', 'deleteInsideWord', 'editor.action.fontZoomIn', 'editor.action.fontZoomOut', 'editor.action.fontZoomReset',
            'editor.action.showContextMenu', 'editor.action.startFindReplaceAction', 'editor.action.insertCursorAtEndOfEachLineSelected'])
            expect(ed.getAction(id), id).toBeTruthy()
    })
})

const sels = (ed: ReturnType<typeof mountEditor>) => ed.getSelections().map((s: { selectionStartLineNumber: number, selectionStartColumn: number, positionLineNumber: number, positionColumn: number }) =>
    [s.selectionStartLineNumber, s.selectionStartColumn, s.positionLineNumber, s.positionColumn])
const set = (ed: ReturnType<typeof mountEditor>, ...r: number[][]) => ed.setSelections(r.map(([a, b, c, d]) => ({ selectionStartLineNumber: a, selectionStartColumn: b, positionLineNumber: c, positionColumn: d })))

// 期望值是真 Monaco 0.55.1 在 headless Chromium 里跑出来的(scripts/browser-diff 的 _explore3 同款夹具)
describe('新增动作的结果与 Monaco 一致', () => {
    it('Add Cursors to Bottom:每行同列,短行夹到行尾,主选区在前', async () => {
        const ed = mountEditor('abc\ndefgh\nij\nklmno')
        set(ed, [2, 4, 2, 4])
        await ed.getAction('editor.action.addCursorsToBottom').run()
        expect(sels(ed)).toEqual([[2, 4, 2, 4], [3, 3, 3, 3], [4, 4, 4, 4]])
        set(ed, [2, 2, 2, 3])
        await ed.getAction('editor.action.addCursorsToBottom').run()
        expect(sels(ed)).toEqual([[2, 2, 2, 3], [3, 2, 3, 3], [4, 2, 4, 3]])
    })
    it('Add Cursors to Top:从主选区往上逐行(getSelections 是创建顺序 3,2,1,不是文档序)', async () => {
        const ed = mountEditor('abc\ndefgh\nij\nklmno')
        set(ed, [3, 3, 3, 3])
        await ed.getAction('editor.action.addCursorsToTop').run()
        expect(sels(ed)).toEqual([[3, 3, 3, 3], [2, 3, 2, 3], [1, 3, 1, 3]])
    })
    it('Focus Next / Previous Cursor:主光标换到下一个 / 上一个,列表整体转一圈', async () => {
        const ed = mountEditor('a\nb\nc')
        set(ed, [1, 1, 1, 1], [2, 1, 2, 1], [3, 1, 3, 1])
        await ed.getAction('editor.action.focusNextCursor').run()
        expect(sels(ed)).toEqual([[2, 1, 2, 1], [3, 1, 3, 1], [1, 1, 1, 1]])
        set(ed, [1, 1, 1, 1], [2, 1, 2, 1], [3, 1, 3, 1])
        await ed.getAction('editor.action.focusPreviousCursor').run()
        expect(sels(ed)).toEqual([[3, 1, 3, 1], [1, 1, 1, 1], [2, 1, 2, 1]])
    })
    it('Add Selection to Previous Find Match:往前找,空光标先选词;Move Last 在文首环绕到文末', async () => {
        const ed = mountEditor('foo bar foo baz foo')
        set(ed, [1, 17, 1, 20])
        await ed.getAction('editor.action.addSelectionToPreviousFindMatch').run()
        expect(sels(ed)).toEqual([[1, 17, 1, 20], [1, 9, 1, 12]])
        set(ed, [1, 10, 1, 10])
        await ed.getAction('editor.action.addSelectionToPreviousFindMatch').run()
        expect(sels(ed)).toEqual([[1, 9, 1, 12]])
        set(ed, [1, 9, 1, 12])
        await ed.getAction('editor.action.moveSelectionToPreviousFindMatch').run()
        expect(sels(ed)).toEqual([[1, 1, 1, 4]])
        await ed.getAction('editor.action.moveSelectionToPreviousFindMatch').run()
        expect(sels(ed)).toEqual([[1, 17, 1, 20]])
    })
    it('Hide Hover:没有悬浮卡也能执行,不抛', async () => {
        const ed = mountEditor('x')
        await expect(ed.getAction('editor.action.hideHover').run()).resolves.toBeUndefined()
    })
    it('Insert Final New Line:末行非空才补', async () => {
        const ed = mountEditor('abc\ndef')
        await ed.getAction('editor.action.insertFinalNewLine').run()
        expect(ed.getValue()).toBe('abc\ndef\n')
        await ed.getAction('editor.action.insertFinalNewLine').run()
        expect(ed.getValue()).toBe('abc\ndef\n')
    })
})
