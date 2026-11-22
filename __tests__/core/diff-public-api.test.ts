// Monaco 0.55.1 IDiffEditor / IStandaloneDiffEditor 公开面:setModel(IDiffEditorModel / ViewModel)、getModel、
// onDidChangeModel、saveViewState / restoreViewState、createViewModel、handleInitialized、getId、onDidDispose,
// 以及转给 modified 侧的编辑器方法(DelegatingEditor)和 addCommand / addAction / createContextKey。
import { afterEach, describe, expect, it } from 'vitest'
import * as monaco from '../../src/index'
import type { ShikiLike } from '../../src/litemonaco'

const hl = {
    codeToTokens: () => ({ tokens: [[]], fg: '#fff', bg: '#000' }),
    getLastGrammarState: () => undefined,
    getTheme: () => ({ bg: '#1e1e1e', fg: '#d4d4d4', type: 'dark' as const }),
} as unknown as ShikiLike

const live: { d: monaco.DiffEditor, el: HTMLElement }[] = []
const models: { dispose(): void }[] = []
afterEach(() => {
    for (const { d, el } of live.splice(0)) { d.destroy(); el.remove() }
    for (const m of models.splice(0)) m.dispose()
})
function mk(original = 'a\nb\nc\n', modified = 'a\nB\nc\n', extra: Record<string, unknown> = {}) {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const d = monaco.editor.createDiffEditor(el, { highlighter: hl, original, modified, recomputeDebounceMs: 0, ...extra } as never)
    live.push({ d, el })
    return d
}
function model(text: string) {
    const m = monaco.editor.createModel(text, 'plaintext')
    models.push(m)
    return m
}

describe('createDiffEditor:不需要前置配置', () => {
    it('没传 highlighter / lang / theme 也能建(同 Monaco),两侧是空文本', () => {
        const el = document.createElement('div')
        document.body.appendChild(el)
        const d = monaco.editor.createDiffEditor(el, {} as never)
        live.push({ d, el })
        expect(d.getOriginal()).toBe('')
        expect(d.getModified()).toBe('')
    })
    it('setDefaultHighlighter 登记的高亮器会被用上', () => {
        monaco.setDefaultHighlighter(hl)
        const el = document.createElement('div')
        document.body.appendChild(el)
        const d = monaco.editor.createDiffEditor(el, { original: 'x', modified: 'y' } as never)
        live.push({ d, el })
        expect(d.getModified()).toBe('y')
        monaco.setDefaultHighlighter(undefined)
    })
})

describe('getModel / setModel(IDiffEditorModel)', () => {
    it('getModel 返回两侧的 ITextModel;内容就是构造时的文本', () => {
        const d = mk()
        const m = d.getModel()!
        expect(m.original.getValue()).toBe('a\nb\nc\n')
        expect(m.modified.getValue()).toBe('a\nB\nc\n')
        expect(typeof m.original.getLineCount).toBe('function')
    })
    it('setModel({original, modified}) 用 ITextModel:两侧显示它们,diff 随之重算', async () => {
        const d = mk()
        const a = model('x\ny\n'), b = model('x\nY\nz\n')
        d.setModel({ original: a, modified: b })
        await d.waitForDiff()
        expect(d.getOriginal()).toBe('x\ny\n')
        expect(d.getModified()).toBe('x\nY\nz\n')
        expect(d.getModel()!.original).toBe(a)
        expect(d.getModel()!.modified).toBe(b)
        // x,y → x,Y,z:第 2 行改了、末尾多一行,Monaco 合成一块 [orig 2..2 → mod 2..3]
        expect(d.getLineChanges()!.map(c => [c.originalStartLineNumber, c.originalEndLineNumber, c.modifiedStartLineNumber, c.modifiedEndLineNumber])).toEqual([[2, 2, 2, 3]])
    })
    it('改 modified 侧的编辑会写回传进去的那个 ITextModel(Monaco:model 是数据源)', async () => {
        const d = mk()
        const a = model('x\n'), b = model('x\n')
        d.setModel({ original: a, modified: b })
        d.getModifiedEditor().setValue('x\nadded\n')
        await d.waitForDiff()
        expect(b.getValue()).toBe('x\nadded\n')
        expect(d.getLineChanges()!.length).toBe(1)
    })
    it('同一对 model 再 setModel 什么也不做(不发 onDidChangeModel)', () => {
        const d = mk()
        const a = model('1'), b = model('2')
        d.setModel({ original: a, modified: b })
        let n = 0
        d.onDidChangeModel(() => { n++ })
        d.setModel({ original: a, modified: b })
        expect(n).toBe(0)
    })
    it('onDidChangeModel:换 model 触发一次;dispose 之后不再触发', () => {
        const d = mk()
        let n = 0
        const sub = d.onDidChangeModel(() => { n++ })
        d.setModel({ original: model('1'), modified: model('2') })
        expect(n).toBe(1)
        sub.dispose()
        d.setModel({ original: model('3'), modified: model('4') })
        expect(n).toBe(1)
    })
    it('setModel(null):两侧都清空,getModel 返回 null', () => {
        const d = mk()
        d.setModel(null)
        expect(d.getModel()).toBeNull()
    })
    it('旧用法 setModel({original: string, modified: string}) 仍然可用', () => {
        const d = mk()
        d.setModel({ original: 'a\n', modified: 'b\n' } as never)
        expect(d.getOriginal()).toBe('a\n')
        expect(d.getModified()).toBe('b\n')
    })
    it('createViewModel + setModel(viewModel);viewModel.waitForDiff 等到 diff 算完', async () => {
        const d = mk()
        const vm = d.createViewModel({ original: model('p\nq\n'), modified: model('p\nQ\n') })
        expect(vm.model.original.getValue()).toBe('p\nq\n')
        d.setModel(vm)
        await vm.waitForDiff()
        expect(d.getModified()).toBe('p\nQ\n')
        expect(d.getLineChanges()!.length).toBe(1)
    })
})

describe('IDiffEditor 其余成员', () => {
    it('getId 形如 vs.editor.IDiffEditor:v2:<序号>,各实例不同', () => {
        const a = mk(), b = mk()
        expect(a.getId()).toMatch(/^vs\.editor\.IDiffEditor:v2:\d+$/)
        expect(a.getId()).not.toBe(b.getId())
        expect(a.getEditorType()).toBe('vs.editor.IDiffEditor')
    })
    it('onDidDispose:dispose 时触发一次', () => {
        const d = mk()
        let n = 0
        d.onDidDispose(() => { n++ })
        d.dispose()
        d.dispose()
        expect(n).toBe(1)
    })
    it('saveViewState / restoreViewState:两侧各自的选区带回来', () => {
        const d = mk()
        const mod = d.getModifiedEditor()
        d.setSelection({ startLineNumber: 3, startColumn: 1, endLineNumber: 3, endColumn: 2 })
        const st = d.saveViewState()
        expect(st.modified).not.toBeNull()
        expect(st.original).not.toBeNull()
        d.setSelection({ startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 })
        d.restoreViewState(st)
        expect(mod.getSelection()!.startLineNumber).toBe(3)
        d.restoreViewState(null) // 不抛
    })
    it('handleInitialized / onVisible / onHide / getContainerDomNode 存在且不抛', () => {
        const d = mk()
        d.handleInitialized(); d.onVisible(); d.onHide()
        expect(d.getContainerDomNode().classList.contains('monaco-diff-editor')).toBe(true)
    })
})

describe('转给 modified 侧的编辑器方法(DelegatingEditor)', () => {
    it('getPosition / setPosition / getSelection(s) / setSelection(s)', () => {
        const d = mk()
        d.setPosition({ lineNumber: 2, column: 1 })
        expect(d.getPosition()).toMatchObject({ lineNumber: 2, column: 1 })
        expect(d.getModifiedEditor().getPosition()).toMatchObject({ lineNumber: 2, column: 1 })
        d.setSelection({ startLineNumber: 1, startColumn: 1, endLineNumber: 2, endColumn: 2 })
        expect(d.getSelection()).toMatchObject({ startLineNumber: 1, endLineNumber: 2 })
        d.setSelections([{ selectionStartLineNumber: 3, selectionStartColumn: 1, positionLineNumber: 3, positionColumn: 2 }])
        expect(d.getSelections()!.length).toBe(1)
        expect(d.getOriginalEditor().getPosition()).not.toMatchObject({ lineNumber: 3, column: 2 }) // 原文侧不动
    })
    it('reveal* 一族都在,且转给 modified 侧', () => {
        const d = mk()
        for (const n of ['revealLine', 'revealLineInCenter', 'revealLineInCenterIfOutsideViewport', 'revealLineNearTop',
            'revealPosition', 'revealPositionInCenter', 'revealPositionInCenterIfOutsideViewport', 'revealPositionNearTop',
            'revealLines', 'revealLinesInCenter', 'revealLinesInCenterIfOutsideViewport', 'revealLinesNearTop',
            'revealRange', 'revealRangeInCenter', 'revealRangeAtTop', 'revealRangeInCenterIfOutsideViewport',
            'revealRangeNearTop', 'revealRangeNearTopIfOutsideViewport']) {
            expect(typeof (d as unknown as Record<string, unknown>)[n], n).toBe('function')
        }
        expect(() => d.revealLine(2)).not.toThrow()
        expect(() => d.revealRange({ startLineNumber: 1, startColumn: 1, endLineNumber: 2, endColumn: 1 })).not.toThrow()
    })
    it('createDecorationsCollection / changeDecorations 落在 modified 侧', () => {
        const d = mk()
        const c = d.createDecorationsCollection([{ range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 2 }, options: { description: 't', inlineClassName: 'my-deco' } }])
        expect(c.length).toBe(1)
        expect(d.getModifiedEditor().getModel()!.getAllDecorations().some(x => x.options.inlineClassName === 'my-deco')).toBe(true)
        expect(d.getOriginalEditor().getModel()!.getAllDecorations().some(x => x.options.inlineClassName === 'my-deco')).toBe(false)
    })
    it('trigger / getSupportedActions 转给 modified 侧', () => {
        const d = mk()
        expect(d.getSupportedActions().length).toBeGreaterThan(0)
        d.setPosition({ lineNumber: 1, column: 1 })
        d.trigger('test', 'type', { text: 'Z' })
        expect(d.getModified().startsWith('Z')).toBe(true)
    })
    it('addCommand / addAction / createContextKey(IStandaloneDiffEditor)', () => {
        const d = mk()
        const id = d.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyJ, () => {})
        expect(typeof id).toBe('string')
        let acted = 0
        const sub = d.addAction({ id: 'diff.test.action', label: 'T', run: () => { acted++ } })
        d.getModifiedEditor().getAction('diff.test.action')!.run()
        expect(acted).toBe(1)
        sub.dispose()
        const key = d.createContextKey<boolean>('myKey', false)
        key.set(true)
        expect(key.get()).toBe(true)
    })
})
