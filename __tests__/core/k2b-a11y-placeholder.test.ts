// ariaLabel / tabFocusMode / editor.action.toggleTabFocusMode / placeholder
import { describe, expect, it, afterEach } from 'vitest'
import { liteMonaco } from '../../src/litemonaco'
import type { ShikiLike } from '../../src/litemonaco'
import type { IEditorOptions } from '../../src/core/options'
import { tabFocusMoves, toggleTabFocusMode } from '../../src/core/edit/commands'
import { Compartment, EditorState } from '../../src/core/model/state'
import { EditorView } from '../../src/core/view/editorview'
import { a11ySession } from '../../src/core/feature/a11y'
import { editorOptions } from '../../src/core/options'

const hl = () => ({
    codeToTokens: () => ({ tokens: [[]], fg: '#fff', bg: '#000' }),
    getTheme: () => ({ bg: '#1e1e1e', fg: '#d4d4d4', type: 'dark' as const }),
}) as unknown as ShikiLike
const QUIET = { minimap: false, overviewRuler: false, vScrollbar: false, hScrollbar: false, stickyScroll: false } as const
function mk(doc: string, options: IEditorOptions = {}) {
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    const view = liteMonaco({ parent, highlighter: hl(), doc, lang: 'text', features: QUIET, options })
    return { view, done: () => { view.destroy(); parent.remove() } }
}
afterEach(() => { if (tabFocusMoves()) toggleTabFocusMode({ inputState: { tabFocusMode: -1 } }) })

describe('ariaLabel', () => {
    it('默认标签同 Monaco(Editor content);改了就用选项', () => {
        const a = mk('x')
        expect(a.view.contentDOM.getAttribute('aria-label')).toBe('Editor content')
        a.done()
        const b = mk('x', { ariaLabel: 'My editor' })
        expect(b.view.contentDOM.getAttribute('aria-label')).toBe('My editor')
        // 外层同 Monaco:role=code,不带 label(标签只在 textbox 上)
        expect(b.view.dom.getAttribute('role')).toBe('code')
        expect(b.view.dom.hasAttribute('aria-label')).toBe(false)
        b.done()
    })
    it('运行时换 ariaLabel 下一个事务生效', () => {
        const comp = new Compartment()
        const view = new EditorView({
            state: EditorState.create({ doc: 'x', extensions: [comp.of(editorOptions.of({}))] }),
            parent: document.body,
        })
        const off = a11ySession(view, { label: 'Code editor (text)' })
        expect(view.contentDOM.getAttribute('aria-label')).toBe('Code editor (text)')
        view.dispatch(view.state.update({ effects: comp.reconfigure(editorOptions.of({ ariaLabel: 'Changed' })) }))
        expect(view.contentDOM.getAttribute('aria-label')).toBe('Changed')
        view.dispatch(view.state.update({ effects: comp.reconfigure(editorOptions.of({})) }))
        expect(view.contentDOM.getAttribute('aria-label')).toBe('Code editor (text)')
        off(); view.destroy()
    })
})

describe('tabFocusMode 选项 + toggleTabFocusMode', () => {
    it('默认 false:Tab 插入制表符(tabFocusMoves() === false)', () => {
        const { done } = mk('x')
        expect(tabFocusMoves()).toBe(false)
        done()
    })
    it('tabFocusMode:true:Tab 移出焦点;Ctrl+M 的切换函数能翻回去', () => {
        const { view, done } = mk('x', { tabFocusMode: true })
        expect(tabFocusMoves()).toBe(true)
        toggleTabFocusMode(view)
        expect(tabFocusMoves()).toBe(false)
        done()
    })
    it('toggleTabFocusMode 的播报文案与 Monaco 一致', () => {
        const { view, done } = mk('x')
        const mac = /Mac|iPhone|iPad/.test(navigator.platform)
        const ev = new KeyboardEvent('keydown', mac ? { key: 'm', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true } : { key: 'm', ctrlKey: true, bubbles: true, cancelable: true })
        view.contentDOM.dispatchEvent(ev)
        const live = view.dom.querySelector('[data-cm-a11y-live]') as HTMLElement
        // announce 经 requestAnimationFrame 写入
        return new Promise<void>(res => setTimeout(() => {
            expect(tabFocusMoves()).toBe(true)
            expect(live.textContent).toBe('Pressing Tab will now move focus to the next focusable element')
            done(); res()
        }, 60))
    })
})

describe('placeholder', () => {
    it('默认不画;空文档 + placeholder 才画;有内容就藏', () => {
        const a = mk('')
        expect(a.view.dom.querySelector('.cm-placeholder')).not.toBeNull()
        expect((a.view.dom.querySelector('.cm-placeholder') as HTMLElement).style.display).toBe('none')
        a.done()
        const b = mk('', { placeholder: 'Type here' })
        const el = b.view.dom.querySelector('.cm-placeholder') as HTMLElement
        expect(el.textContent).toBe('Type here')
        expect(el.style.display).toBe('block')
        b.view.dispatch(b.view.state.update({ changes: { from: 0, insert: 'x' } }))
        expect(el.style.display).toBe('none')
        b.view.dispatch(b.view.state.update({ changes: { from: 0, to: 1, insert: '' } }))
        expect(el.style.display).toBe('block')
        b.done()
    })
    it('有初始内容时不显示', () => {
        const { view, done } = mk('abc', { placeholder: 'Type here' })
        expect((view.dom.querySelector('.cm-placeholder') as HTMLElement).style.display).toBe('none')
        done()
    })
})
