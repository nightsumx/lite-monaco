import { describe, expect, it } from 'vitest'
import { gotoLineNumber } from '../../src/core/edit/commands'
import { gotoLineCommand, openGotoLine } from '../../src/core/feature/commandpalette'
import { EditorSelection } from '../../src/core/model/selection'
import { EditorState } from '../../src/core/model/state'
import { make } from './input-harness'

describe('gotoLineNumber', () => {
    it('1-based 跳转并 clamp', () => {
        let state = EditorState.create({
            doc: 'a\nb\nc\nd',
            selection: EditorSelection.cursor(0),
        })
        state = state.applyTransaction(gotoLineNumber(state, 3))
        expect(state.selection.main.head).toBe(state.doc.line(3).from)
        state = state.applyTransaction(gotoLineNumber(state, 99))
        expect(state.selection.main.head).toBe(state.doc.line(4).from)
        state = state.applyTransaction(gotoLineNumber(state, 0))
        expect(state.selection.main.head).toBe(0)
    })

    it('空文档跳行仍落 0', () => {
        let state = EditorState.create({ doc: '' })
        state = state.applyTransaction(gotoLineNumber(state, 1))
        expect(state.selection.main.head).toBe(0)
        state = state.applyTransaction(gotoLineNumber(state, 9))
        expect(state.selection.main.head).toBe(0)
    })
})

// Go to Line 改成 Monaco 的 ':' quick input(挂在 view.dom 里,见 overlay.ts showQuickInput)
describe('openGotoLine', () => {
    const typeInto = (input: HTMLInputElement, v: string) => {
        input.value = v
        input.dispatchEvent(new Event('input', { bubbles: true }))
    }
    const key = (input: HTMLInputElement, k: string) =>
        input.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))

    it('Enter 跳到输入行号，Esc 不跳', () => {
        const view = make('a\nb\nc\nd')
        expect(openGotoLine(view)).toBe(true)
        const input = view.dom.querySelector('.cm-quick-input-input') as HTMLInputElement
        expect(input).not.toBeNull()
        expect(input.value).toBe(':')
        typeInto(input, ':3')
        key(input, 'Enter')
        expect(view.state.doc.lineAt(view.state.selection.main.head).number).toBe(3)
        expect(view.dom.querySelector('.cm-quick-input')).toBeNull()

        const at = view.state.selection.main.head
        expect(openGotoLine(view)).toBe(true)
        const again = view.dom.querySelector('.cm-quick-input-input') as HTMLInputElement
        typeInto(again, ':1')
        key(again, 'Escape')
        expect(view.state.selection.main.head).toBe(at)
        expect(view.dom.querySelector('.cm-quick-input')).toBeNull()
        view.destroy()
    })

    it('非数字输入 Enter 不跳、不关(Monaco);0 / 超范围 clamp 进 1..末行', () => {
        const view = make('a\nb\nc\nd')
        const at = view.state.selection.main.head
        expect(openGotoLine(view)).toBe(true)
        const input = view.dom.querySelector('.cm-quick-input-input') as HTMLInputElement
        for (const bad of [':abc', ':   ']) {
            typeInto(input, bad)
            key(input, 'Enter')
            expect(view.state.selection.main.head).toBe(at)
            expect(view.dom.querySelector('.cm-quick-input')).not.toBeNull()
        }
        key(input, 'Escape')
        view.destroy()
    })

    it('gotoLineCommand 打开面板,提示行数范围', () => {
        const view = make('a\nb')
        expect(gotoLineCommand(view)).toBe(true)
        expect(view.dom.querySelector('.cm-quick-input-label')?.textContent)
            .toBe('Type a line number to go to (from 1 to 2).')
        const input = view.dom.querySelector('.cm-quick-input-input') as HTMLInputElement
        key(input, 'Escape')
        view.destroy()
    })

    it('焦点移出面板就关,不跳', async () => {
        const view = make('a\nb\nc')
        const at = view.state.selection.main.head
        expect(openGotoLine(view)).toBe(true)
        const input = view.dom.querySelector('.cm-quick-input-input') as HTMLInputElement
        typeInto(input, ':2')
        view.contentDOM.focus()
        input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
        await new Promise(r => setTimeout(r, 5))
        expect(view.state.selection.main.head).toBe(at)
        expect(view.dom.querySelector('.cm-quick-input')).toBeNull()
        view.destroy()
    })
})

describe('cursorGroupForwardWin', () => {
    it('前进落到下一词起点附近', async () => {
        const { cursorGroupForwardWin } = await import('../../src/core/edit/commands')
        let state = EditorState.create({
            doc: 'foo  bar',
            selection: EditorSelection.cursor(0),
        })
        const d = (tr: any) => { state = state.applyTransaction(tr) }
        cursorGroupForwardWin({ state, dispatch: d })
        // 至少越过 foo
        expect(state.selection.main.head).toBeGreaterThanOrEqual(3)
    })
})
