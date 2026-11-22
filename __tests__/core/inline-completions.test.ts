import { afterEach, describe, expect, it } from 'vitest'
import { liteMonaco } from '../../src/litemonaco'
import { registerInlineCompletionsProvider } from '../../src/lang/languagefeatures'
import { InlineCompletionsController } from '../../src/lang/inline/controller'
import type { IDisposable } from '../../src/api/types'

const fakeHl = () => ({
    codeToTokens: () => ({ tokens: [[]], fg: '#fff', bg: '#000' }),
    getTheme: () => ({ bg: '#1e1e1e', fg: '#d4d4d4', type: 'dark' as const }),
}) as never
async function until(cond: () => unknown, ms = 1500) {
    const t0 = Date.now()
    while (!cond() && Date.now() - t0 < ms) await wait(10)
}
const wait = (ms: number) => new Promise(r => setTimeout(r, ms))
const disposables: IDisposable[] = []
afterEach(() => { for (const d of disposables.splice(0)) d.dispose() })

function mount(doc: string, items: (text: string) => { insertText: string }[]) {
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    const editor = liteMonaco({ parent, doc, highlighter: fakeHl(), features: { autocomplete: false } } as never)
    disposables.push({ dispose: () => { editor.dispose(); parent.remove() } })
    disposables.push(registerInlineCompletionsProvider('*', {
        provideInlineCompletions: (model: { getValue(): string }) => ({ items: items(model.getValue()) }),
        disposeInlineCompletions() { },
    } as never))
    return { editor, parent }
}

describe('行内补全接线', () => {
    it('没有 provider 时不建控制器', async () => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const editor = liteMonaco({ parent, doc: 'abc', highlighter: fakeHl() } as never)
        await wait(5)
        expect(InlineCompletionsController.get(editor as never)).toBeNull()
        editor.dispose(); parent.remove()
    })

    it('provider 注册后惰性装上控制器;打字 → ghost 层出字;ghost 不进 contenteditable', async () => {
        const { editor, parent } = mount('', t => t === 'he' ? [{ insertText: 'hello' }] : [])
        await wait(5)
        const c = InlineCompletionsController.get(editor as never)
        expect(c).not.toBeNull()
        editor.focus()
        editor.trigger('keyboard', 'type', { text: 'he' })
        await until(() => c!.model!.primaryGhostText)
        expect(c!.model!.primaryGhostText?.parts[0].text).toBe('llo')
        // 内容 DOM 不含 ghost 文本
        expect(parent.querySelector('.cm-content')!.textContent).toBe('he')
        expect(editor.getValue()).toBe('he')
    })

    it('model.accept 接受', async () => {
        const { editor } = mount('', t => t === 'he' ? [{ insertText: 'hello' }] : [])
        await wait(5)
        editor.focus()
        editor.trigger('keyboard', 'type', { text: 'he' })
        const c = InlineCompletionsController.get(editor as never)!
        await until(() => c.model!.primaryGhostText)
        await c.model!.accept(editor as never)
        expect(editor.getValue()).toBe('hello')
        expect(c.model!.state).toBeUndefined()
    })

    // 真键位:keydown 走实例键位表(比内置 Tab=缩进 / Esc 先到);真页验过 Tab / Esc 的实际效果
    const press = (editor: { dom: HTMLElement }, init: KeyboardEventInit & { keyCode: number }) => {
        const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
        ;(editor.dom.querySelector('.cm-content') ?? editor.dom).dispatchEvent(e)
        return e
    }
    const typed = async (t: string) => {
        const { editor } = mount('', x => x === t ? [{ insertText: t + 'llo' }] : [])
        await wait(5)
        editor.focus()
        editor.trigger('keyboard', 'type', { text: t })
        const c = InlineCompletionsController.get(editor as never)!
        await until(() => c.model!.primaryGhostText)
        return { editor, c }
    }

    it('Tab 键接受 ghost', async () => {
        const { editor, c } = await typed('he')
        press(editor as never, { key: 'Tab', code: 'Tab', keyCode: 9 })
        await until(() => editor.getValue() === 'hello' + 'llo'.slice(3))
        expect(editor.getValue()).toBe('hello')
        expect(c.model!.state).toBeUndefined()
    })

    it('Esc 键取消 ghost,文本不变', async () => {
        const { editor, c } = await typed('he')
        press(editor as never, { key: 'Escape', code: 'Escape', keyCode: 27 })
        expect(editor.getValue()).toBe('he')
        expect(c.model!.state).toBeUndefined()
    })

    it('没有 ghost 时 Tab 照常缩进(不吞键)', async () => {
        const { editor } = mount('', () => [])
        await wait(5)
        editor.focus()
        press(editor as never, { key: 'Tab', code: 'Tab', keyCode: 9 })
        expect(editor.getValue()).toMatch(/^\s+$/) // 内置 Tab 缩进照常生效,没被行内补全键位截走
    })

    it('销毁编辑器后控制器随之释放', async () => {
        const { editor } = mount('', () => [])
        await wait(5)
        const c = InlineCompletionsController.get(editor as never)!
        editor.dispose()
        expect(c.model).toBeUndefined()
    })
})
