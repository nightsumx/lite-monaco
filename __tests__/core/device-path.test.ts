/**
 * DEVICE-TEST 主路径的可自动层（jsdom）。
 * 真人浏览器矩阵仍见 DEVICE-TEST.md；此处保证 CI 不断主路径。
 */
import { describe, expect, it } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { EditorView } from '../../src/core/view/editorview'
import { EditorSelection } from '../../src/core/model/selection'
import {
    addCursorAbove, addCursorBelow, selectNextOccurrence,
    copyLineDown, gotoLineNumber,
} from '../../src/core/edit/commands'
import { DiffEditor } from '../../src/diffeditor'
import type { ShikiLike } from '../../src/litemonaco'
import { openSearch, searchField } from '../../src/core/feature/search'
import { applyEditorA11y } from '../../src/core/feature/a11y'
import { classifyDoc, materializeDoc } from '../../src/core/perf'
import {
    make, typeText, pressEnter, setCaret, expectDOMMatchesDoc,
} from './input-harness'

function run(
    doc: string,
    sel: number,
    cmd: (t: { state: EditorState, dispatch: (tr: { state?: EditorState } & object) => void }) => boolean,
) {
    let state = EditorState.create({
        doc,
        selection: EditorSelection.cursor(sel),
        extensions: [EditorState.allowMultipleSelections.of(true)],
    })
    const ok = cmd({
        state,
        dispatch: tr => { state = state.applyTransaction(tr as never) },
    })
    return { ok, state }
}

describe('DEVICE-TEST 自动层', () => {
    it('用例1–2: 打字 / Enter', () => {
        const view = make('ab\ncd')
        setCaret(view, 1)
        typeText(view, 1, 'X')
        expect(view.state.doc.toString()).toContain('aXb')
        pressEnter(view, 2) // after aX|
        expect(view.state.doc.lines).toBeGreaterThanOrEqual(3)
        expectDOMMatchesDoc(view)
        view.destroy()
    })

    it('用例4: 多光标 addCursorAbove/Below', () => {
        const doc = 'aaa\nbbb\nccc'
        const mid = doc.indexOf('bbb') + 1
        const a = run(doc, mid, addCursorBelow)
        expect(a.ok).toBe(true)
        expect(a.state.selection.ranges.length).toBe(2)
        const b = run(doc, mid, addCursorAbove)
        expect(b.state.selection.ranges.length).toBe(2)
        expect(selectNextOccurrence({
            state: a.state,
            dispatch: () => {},
        })).toBeTypeOf('boolean')
    })

    it('用例6: 大文档预算 + materialize 缓存', () => {
        const lines = 12_000
        const text = Array.from({ length: lines }, (_, i) => `line ${i}`).join('\n')
        const state = EditorState.create({ doc: text })
        expect(classifyDoc(lines, text.length)).toMatch(/L|XL|M/)
        const a = materializeDoc(state)
        const c = materializeDoc(state)
        expect(a).toBe(c)
    })

    it('用例7: lineWrapping 配置可进 EditorView', () => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const view = new EditorView({
            state: EditorState.create({ doc: 'x'.repeat(200) }),
            parent,
            lineWrapping: true,
        })
        expect(view.dom.className).toBeTruthy()
        view.destroy()
        parent.remove()
    })

    it('用例8 命令: gotoLineNumber', () => {
        const state = EditorState.create({ doc: 'a\nb\nc\nd' })
        const tr = gotoLineNumber(state, 3)
        const next = state.applyTransaction(tr)
        expect(next.selection.main.head).toBe(next.doc.line(3).from)
    })

    it('用例9: a11y role=textbox', () => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const view = new EditorView({
            state: EditorState.create({ doc: 'hi' }),
            parent,
        })
        applyEditorA11y(view, { label: 'code' })
        expect(view.contentDOM.getAttribute('role')).toBe('textbox')
        view.destroy()
        parent.remove()
    })

    it('用例10: Diff 构造 + 改 modified', () => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const d = new DiffEditor({
            parent,
            highlighter: { codeToTokens: () => ({ tokens: [[]], fg: '#fff', bg: '#000' }), getTheme: () => ({ bg: '#1e1e1e', fg: '#d4d4d4', type: 'dark' }) } as unknown as ShikiLike,
            lang: 'text',
            original: 'a\nb\n',
            modified: 'a\nc\n',
        })
        expect(d.getMappings().length).toBeGreaterThan(0)
        const doc = d.modifiedView.state.doc
        d.modifiedView.dispatch(d.modifiedView.state.update({
            changes: { from: doc.length, insert: '\n' },
        }))
        expect(d.getModified().includes('c')).toBe(true)
        d.destroy()
        parent.remove()
    })

    it('查找 openSearch 字段', () => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const view = new EditorView({
            state: EditorState.create({
                doc: 'find me',
                extensions: [searchField],
            }),
            parent,
        })
        openSearch({
            state: view.state,
            dispatch: tr => view.dispatch(tr),
        })
        expect(view.state.field(searchField)?.open).toBe(true)
        view.destroy()
        parent.remove()
    })

    it('copyLineDown 不炸', () => {
        const r = run('hello', 0, copyLineDown)
        expect(r.ok).toBe(true)
        expect(r.state.doc.lines).toBe(2)
    })
})
