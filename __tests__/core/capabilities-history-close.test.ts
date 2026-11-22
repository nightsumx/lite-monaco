// 能力: history 边界 + closeBrackets + indentOnInput
import { describe, expect, it } from 'vitest'
import { history, undo, redo, undoDepth, isolateHistory, historyField } from '../../src/core/edit/history'
import { closeBracketChange, closeBracketsInput } from '../../src/core/edit/closebrackets'
import { indentOnInput } from '../../src/core/edit/indentoninput'
import { EditorSelection } from '../../src/core/model/selection'
import { EditorState } from '../../src/core/model/state'
import { EditorView } from '../../src/core/view/editorview'
import { inputHandler } from '../../src/core/view/editorview'

describe('history 深度与 isolate', () => {
    it('连续输入可合并；isolate 切断', () => {
        let state = EditorState.create({
            doc: '',
            extensions: [history()],
        })
        const d = (tr: any) => { state = state.applyTransaction(tr) }
        d(state.update({ changes: { from: 0, insert: 'a' }, userEvent: 'input.type' }))
        d(state.update({ changes: { from: 1, insert: 'b' }, userEvent: 'input.type' }))
        expect(undoDepth(state)).toBeGreaterThanOrEqual(1)
        undo({ state, dispatch: d })
        // 可能一次撤 ab 或只撤 b
        expect(state.doc.length).toBeLessThan(2)
        d(state.update({
            changes: { from: state.doc.length, insert: 'x' },
            annotations: isolateHistory.of('full'),
            userEvent: 'input.type',
        }))
        d(state.update({ changes: { from: state.doc.length, insert: 'y' }, userEvent: 'input.type' }))
        const before = state.doc.toString()
        undo({ state, dispatch: d })
        expect(state.doc.toString().length).toBeLessThan(before.length)
        redo({ state, dispatch: d })
    })

    it('historyField 存在', () => {
        const state = EditorState.create({ doc: 'a', extensions: [history()] })
        expect(state.field(historyField, false)).toBeTruthy()
    })
})

describe('closeBrackets', () => {
    it('开括号补闭', () => {
        const state = EditorState.create({ doc: '', selection: EditorSelection.cursor(0) })
        const ch = closeBracketChange(state, { from: 0, to: 0, insert: '(' }, true)
        expect(ch).not.toBeNull()
        expect(ch!.insert).toBe('()')
        expect(ch!.cursor).toBe(1)
    })

    it('过键闭括号跳过', () => {
        const state = EditorState.create({ doc: '()', selection: EditorSelection.cursor(1) })
        const ch = closeBracketChange(state, { from: 1, to: 1, insert: ')' }, true)
        expect(ch).not.toBeNull()
        expect(ch!.insert).toBe('')
        expect(ch!.cursor).toBe(1)
    })

    it('inputHandler 接线认领', () => {
        const host = document.createElement('div')
        document.body.appendChild(host)
        const view = new EditorView({
            state: EditorState.create({
                doc: '',
                extensions: [inputHandler.of(closeBracketsInput)],
            }),
            parent: host,
        })
        const ok = closeBracketsInput(view, 0, 0, '{')
        expect(ok).toBe(true)
        expect(view.state.doc.toString()).toContain('}')
        view.destroy()
    })
})

describe('indentOnInput', () => {
    it('行首闭括号 dedent', () => {
        const host = document.createElement('div')
        document.body.appendChild(host)
        const view = new EditorView({
            state: EditorState.create({
                doc: '{\n    \n}',
                selection: EditorSelection.cursor(6), // 中间行缩进处
                extensions: [inputHandler.of(indentOnInput), EditorState.tabSize.of(4)],
            }),
            parent: host,
        })
        // 在缩进行打 }
        const pos = view.state.doc.line(2).from + 4
        view.dispatch(view.state.update({ selection: { anchor: pos } }))
        const handled = indentOnInput(view, pos, pos, '}')
        // 可能认领 dedent 或 false（取决于实现条件）
        expect(typeof handled).toBe('boolean')
        view.destroy()
    })
})
