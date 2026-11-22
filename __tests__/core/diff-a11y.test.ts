import { describe, expect, it } from 'vitest'
import { charDiff, computeLineRangeMappings, detectMovedLines } from '../../src/core/diff/linediff'
import { DiffEditor } from '../../src/diffeditor'
import type { ShikiLike } from '../../src/litemonaco'
import { openSearch, searchField } from '../../src/core/feature/search'
import { applyEditorA11y, announce, a11ySession } from '../../src/core/feature/a11y'
import { EditorState } from '../../src/core/model/state'
import { EditorView } from '../../src/core/view/editorview'
import { setDiagnostics, diagnosticsField } from '../../src/core/feature/diagnostics'

describe('charDiff / LineRangeMapping', () => {
    it('字级 diff', () => {
        const parts = charDiff('hello', 'hallo')
        expect(parts.some(p => p.type === 'delete' && p.text === 'e')).toBe(true)
        expect(parts.some(p => p.type === 'insert' && p.text === 'a')).toBe(true)
    })

    it('computeLineRangeMappings 含 innerChanges', () => {
        const maps = computeLineRangeMappings('const a = 1\n', 'const b = 1\n')
        expect(maps.length).toBeGreaterThan(0)
        const m = maps[0]
        expect(m.innerChanges.length).toBeGreaterThan(0)
    })

    it('默认忽略行尾空白：只差空格不算变更', () => {
        const ignore = computeLineRangeMappings('a  \n', 'a\n')
        expect(ignore.every(m => m.originalStart === m.modifiedStart
            && m.originalEnd === m.modifiedEnd
            && !m.innerChanges.length)).toBe(true)
        const keep = computeLineRangeMappings('a  \n', 'a\n', { ignoreTrimWhitespace: false })
        expect(keep.some(m => m.innerChanges.length > 0 || m.originalEnd !== m.modifiedEnd)).toBe(true)
    })

    it('detectMovedLines：独一行从删到插算 moved', () => {
        const moved = detectMovedLines('keep\nMOVED\nend', 'keep\nend\nMOVED')
        expect(moved).toEqual([
            { text: 'MOVED', originalLine: 2, modifiedLine: 3 },
        ])
        expect(detectMovedLines('a\nb', 'a\nb')).toEqual([])
        expect(detectMovedLines('{\n}\n{', '{\nfoo\n}')).toEqual([])
    })
})

function fakeHl(): ShikiLike {
    return {
        codeToTokens: () => ({ tokens: [[]], fg: '#fff', bg: '#000' }),
        getTheme: () => ({ bg: '#1e1e1e', fg: '#d4d4d4', type: 'dark' as const }),
    } as unknown as ShikiLike
}

function mount(original: string, modified: string) {
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    const d = new DiffEditor({ parent, highlighter: fakeHl(), lang: 'text', original, modified })
    return { d, parent, done: () => { d.destroy(); parent.remove() } }
}

describe('DiffEditor DOM (Monaco-aligned)', () => {
    it('monaco-diff-editor 结构 + 可编辑 modified', () => {
        const { d, done } = mount('one\ntwo\nthree', 'one\nTWO\nthree\nfour')
        expect(d.dom.classList.contains('monaco-diff-editor')).toBe(true)
        expect(d.dom.classList.contains('side-by-side')).toBe(true)
        expect(d.dom.querySelectorAll('.editor.original, .editor.modified').length).toBe(2)
        expect(d.originalView.state.readOnly).toBe(true)
        expect(d.modifiedView.state.readOnly).toBe(false)
        expect(d.getMappings().length).toBeGreaterThan(0)
        expect(d.goToNextChange()).toBe(true)
        d.modifiedView.dispatch(d.modifiedView.state.update({ changes: { from: 0, insert: '// x\n' } }))
        expect(d.getModified().startsWith('// x')).toBe(true)
        d.setModels('x', 'x')
        expect(d.getMappings().length).toBe(0)
        done()
    })

    it('revertMapping 还原 change 行', () => {
        const { d, done } = mount('a\nb\nc', 'a\nB\nc')
        d.revertMapping(d.getMappings()[0])
        expect(d.getModified()).toBe('a\nb\nc')
        done()
    })

    it('goToPrevChange 回到上一条变更；改 modified 不动 original', () => {
        const { d, done } = mount('a\nb\nc', 'A\nb\nC')
        expect(d.getMappings().length).toBe(2)
        expect(d.goToNextChange()).toBe(true)
        const first = d.modifiedView.state.selection.main.head
        expect(d.goToNextChange()).toBe(true)
        expect(d.modifiedView.state.selection.main.head).not.toBe(first)
        expect(d.goToPrevChange()).toBe(true)
        expect(d.modifiedView.state.selection.main.head).toBe(first)
        const orig = d.getOriginal()
        d.modifiedView.dispatch(d.modifiedView.state.update({ changes: { from: 0, insert: 'Z' } }))
        expect(d.getOriginal()).toBe(orig)
        expect(d.getModified().startsWith('Z')).toBe(true)
        done()
    })

    it('setModels 换两侧文本', () => {
        const { d, done } = mount('a', 'b')
        d.setModels('left\n', 'right\n')
        expect(d.getOriginal()).toBe('left\n')
        expect(d.getModified()).toBe('right\n')
        done()
    })

    it('destroy 卸掉根节点，再 destroy 不炸', () => {
        const { d, parent } = mount('a', 'b')
        expect(parent.querySelector('.monaco-diff-editor')).not.toBeNull()
        d.destroy()
        expect(parent.querySelector('.monaco-diff-editor')).toBeNull()
        d.destroy()
        parent.remove()
    })

    it('两侧相同：goToNextChange 返 false', () => {
        const { d, done } = mount('same\nline', 'same\nline')
        expect(d.getMappings().length).toBe(0)
        expect(d.goToNextChange()).toBe(false)
        expect(d.goToPrevChange()).toBe(false)
        done()
    })

    it('goToNextChange 从末条环回第一条', () => {
        const { d, done } = mount('a\nb\nc', 'A\nb\nC')
        const n = d.getMappings().length
        expect(d.goToNextChange()).toBe(true)
        const first = d.modifiedView.state.selection.main.head
        for (let i = 1; i < n; i++) expect(d.goToNextChange()).toBe(true)
        expect(d.goToNextChange()).toBe(true)
        expect(d.modifiedView.state.selection.main.head).toBe(first)
        done()
    })

    it('Mod-f 可在 modified 侧打开查找面板', () => {
        const { d, done } = mount('hello world', 'hello WORLD')
        expect(d.modifiedView.state.field(searchField, false)).toBeTruthy()
        expect(openSearch({ state: d.modifiedView.state, dispatch: tr => d.modifiedView.dispatch(tr) })).toBe(true)
        expect(d.modifiedView.state.field(searchField)!.open).toBe(true)
        expect(d.modifiedView.dom.querySelector('.cm-find-widget')).toBeTruthy()
        done()
    })

    it('行数少的一侧补 view zone，斜纹画在 fill 层而不是 contentDOM 里', () => {
        const { d, done } = mount('a\nb\nc', 'a\nB\nC\nD')
        expect(d.originalView.contentDOM.querySelectorAll('.diagonal-fill').length).toBe(0)
        expect(d.originalView.scrollDOM.querySelector('.cm-diffFillLayer')).toBeTruthy()
        done()
    })
})

describe('a11y', () => {
    it('applyEditorA11y 写 ARIA', () => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const view = new EditorView({
            state: EditorState.create({ doc: 'hi' }),
            parent,
        })
        applyEditorA11y(view, { label: 'Test editor' })
        expect(view.contentDOM.getAttribute('role')).toBe('textbox')
        announce(view, 'hello')
        expect(view.dom.querySelector('[data-cm-a11y-live]')).toBeTruthy()
        view.destroy()
        parent.remove()
    })

    it('默认构造已有 role=textbox', () => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const view = new EditorView({
            state: EditorState.create({ doc: 'x' }),
            parent,
        })
        expect(view.contentDOM.getAttribute('role')).toBe('textbox')
        view.destroy()
        parent.remove()
    })

    it('a11ySession 诊断播报', async () => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const view = new EditorView({
            state: EditorState.create({
                doc: 'const x = 1',
                extensions: [diagnosticsField],
            }),
            parent,
        })
        const off = a11ySession(view)
        view.dispatch(view.state.update({
            effects: setDiagnostics.of([
                { from: 0, to: 5, severity: 'error', message: 'bad' },
            ]),
        }))
        await new Promise(r => setTimeout(r, 30))
        const live = view.dom.querySelector('[data-cm-a11y-live]') as HTMLElement
        expect(live?.textContent).toMatch(/error/i)
        off()
        view.destroy()
        parent.remove()
    })
})
