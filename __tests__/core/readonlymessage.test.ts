import { describe, expect, it } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { EditorView } from '../../src/core/view/editorview'
import {
    showReadOnlyMessage, hideReadOnlyMessage, isEditInputType,
} from '../../src/core/feature/readonlymessage'

function mk(readOnly: boolean) {
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    const view = new EditorView({
        state: EditorState.create({
            doc: 'hello world',
            extensions: readOnly ? [EditorState.readOnly.of(true)] : [],
        }),
        parent,
    })
    return { view, parent }
}

describe('isEditInputType', () => {
    it('识别 insert/delete/format', () => {
        expect(isEditInputType('insertText')).toBe(true)
        expect(isEditInputType('deleteContentBackward')).toBe(true)
        expect(isEditInputType('formatBold')).toBe(true)
        expect(isEditInputType('historyUndo')).toBe(true)
        expect(isEditInputType('')).toBe(false)
    })
})

describe('read-only message (Monaco-aligned)', () => {
    it('readOnly 时 show 弹出 tip', () => {
        const { view, parent } = mk(true)
        showReadOnlyMessage(view)
        // fixed + body(allowEditorOverflow),不在 view.dom 内
        const tip = document.querySelector('.cm-readonly-message')
        expect(tip).toBeTruthy()
        expect(tip?.textContent).toContain('Cannot edit in read-only editor')
        // Monaco 结构: .anchor.top + .message + .anchor.below
        expect(tip?.querySelector('.anchor.top')).toBeTruthy()
        expect(tip?.querySelector('.anchor.below')).toBeTruthy()
        expect(tip?.querySelector('.message')).toBeTruthy()
        // 默认 tip 在上 → 无 .below → 朝下三角(.anchor.below)可见,朝上(.anchor.top)隐藏
        if (!tip?.classList.contains('below')) {
            const topA = tip!.querySelector('.anchor.top') as HTMLElement
            const belowA = tip!.querySelector('.anchor.below') as HTMLElement
            expect(getComputedStyle(topA).display).toBe('none')
            expect(getComputedStyle(belowA).display).not.toBe('none')
            // border-top 实色 = 尖朝下
            expect(getComputedStyle(belowA).borderTopColor).not.toBe('rgba(0, 0, 0, 0)')
        }
        hideReadOnlyMessage(view)
        view.destroy()
        parent.remove()
        document.querySelectorAll('.cm-readonly-message').forEach(n => n.remove())
    })

    it('hideReadOnlyMessage 先 fadeOut，随后卸掉 tip', async () => {
        const { view, parent } = mk(true)
        showReadOnlyMessage(view)
        expect(document.querySelector('.cm-readonly-message')).not.toBeNull()
        hideReadOnlyMessage(view)
        expect(document.querySelector('.cm-readonly-message')?.classList.contains('fadeOut')).toBe(true)
        await new Promise(r => setTimeout(r, 150))
        expect(document.querySelector('.cm-readonly-message')).toBeNull()
        view.destroy()
        parent.remove()
    })

    it('非 readOnly 不弹', () => {
        const { view, parent } = mk(false)
        showReadOnlyMessage(view)
        expect(document.querySelector('.cm-readonly-message')).toBeNull()
        view.destroy()
        parent.remove()
    })

    it('beforeinput 在 readOnly 时 preventDefault 并弹 tip', () => {
        const { view, parent } = mk(true)
        view.contentDOM.focus()
        const e = new InputEvent('beforeinput', {
            bubbles: true,
            cancelable: true,
            inputType: 'insertText',
            data: 'x',
        })
        view.contentDOM.dispatchEvent(e)
        expect(e.defaultPrevented).toBe(true)
        expect(document.querySelector('.cm-readonly-message')).toBeTruthy()
        view.destroy()
        parent.remove()
        document.querySelectorAll('.cm-readonly-message').forEach(n => n.remove())
    })

    it('可编辑编辑器 beforeinput 不弹', () => {
        const { view, parent } = mk(false)
        const e = new InputEvent('beforeinput', {
            bubbles: true,
            cancelable: true,
            inputType: 'insertText',
            data: 'x',
        })
        view.contentDOM.dispatchEvent(e)
        expect(e.defaultPrevented).toBe(false)
        expect(document.querySelector('.cm-readonly-message')).toBeNull()
        view.destroy()
        parent.remove()
    })
})
