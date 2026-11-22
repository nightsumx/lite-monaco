// contextmenu 选项 / Go to Declaration / Peek Declaration / Refactor... / Source Action... / Shift+F10(showContextMenu)
import { describe, expect, it, afterEach, vi } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { EditorView } from '../../src/core/view/editorview'
import { editorOptions } from '../../src/core/options'
import type { IEditorOptions } from '../../src/core/options/types'
import { contextMenuCM7, defaultContextMenuItems, showContextMenu, type ContextMenuActionProviders } from '../../src/core/feature/contextmenu'

function make(opts: IEditorOptions = {}, providers: ContextMenuActionProviders = {}, readOnly = false) {
    const view = new EditorView({
        state: EditorState.create({ doc: 'hello world', extensions: [editorOptions.of(opts), ...(readOnly ? [EditorState.readOnly.of(true)] : [])] }),
        parent: document.body,
        drawSelection: true,
    })
    const detach = contextMenuCM7({ providers })(view)
    return { view, detach }
}
const labels = () => [...document.querySelectorAll('body > .cm-context-menu .cm-context-label')].map(e => e.textContent)
const ctx = (view: EditorView) => {
    const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 40, button: 2 })
    view.contentDOM.dispatchEvent(e)
    return e
}
afterEach(() => {
    document.querySelectorAll('body > .cm-context-menu').forEach(n => n.remove())
    document.querySelectorAll('.cm-editor').forEach(n => n.remove())
})

const ts = new Proxy({}, { get: () => async () => true }) as never

describe('contextmenu 选项', () => {
    it('默认 true:拦截原生菜单并打开自己的', () => {
        const { view } = make()
        const e = ctx(view)
        expect(e.defaultPrevented).toBe(true)
        expect(labels()).toContain('Copy')
    })
    it('false:不开自己的菜单,事件放行给浏览器原生菜单', () => {
        const { view } = make({ contextmenu: false })
        const e = ctx(view)
        expect(e.defaultPrevented).toBe(false)
        expect(document.querySelector('body > .cm-context-menu')).toBeNull()
    })
})

describe('Shift+F10 / editor.action.showContextMenu', () => {
    const key = (view: EditorView, init: KeyboardEventInit) => {
        const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
        view.contentDOM.dispatchEvent(e)
        return e
    }
    it('Shift+F10 在光标处打开菜单;别的组合不开', () => {
        const { view } = make()
        key(view, { key: 'F10', ctrlKey: true, shiftKey: true })
        key(view, { key: 'F10' })
        expect(document.querySelector('body > .cm-context-menu')).toBeNull()
        const e = key(view, { key: 'F10', shiftKey: true })
        expect(e.defaultPrevented).toBe(true)
        expect(labels()).toContain('Paste')
    })
    it('showContextMenu(view) 可编程触发;contextmenu:false 时不开', () => {
        const a = make()
        expect(showContextMenu(a.view)).toBe(true)
        expect(document.querySelector('body > .cm-context-menu')).not.toBeNull()
        document.querySelectorAll('body > .cm-context-menu').forEach(n => n.remove())
        a.view.destroy()
        const b = make({ contextmenu: false })
        expect(showContextMenu(b.view)).toBe(false)
        expect(key(b.view, { key: 'F10', shiftKey: true }).defaultPrevented).toBe(false)
        expect(document.querySelector('body > .cm-context-menu')).toBeNull()
    })
})

describe('菜单项:Declaration / Refactor / Source Action', () => {
    const find = (p: ContextMenuActionProviders, id: string) => defaultContextMenuItems(p).flatMap(i => [i, ...(i.submenu ?? [])]).find(i => i.id === id)!
    it('没有声明提供者时 Go to / Peek Declaration 不出现(Monaco precondition hasDeclarationProvider)', () => {
        const { view } = make({}, { ts })
        ctx(view)
        expect(labels()).not.toContain('Go to Declaration')
        expect(labels()).not.toContain('Peek Declaration')
    })
    it('有声明提供者:两项出现并调用对应函数', async () => {
        const go = vi.fn(async () => true), peek = vi.fn(async () => true)
        const p = { ts, declaration: { go, peek } }
        const { view } = make({}, p)
        ctx(view)
        expect(labels()).toContain('Go to Declaration')
        expect(labels()).toContain('Peek Declaration')
        find(p, 'gotoDecl').run!(view)
        find(p, 'peekDecl').run!(view)
        expect(go).toHaveBeenCalledOnce()
        expect(peek).toHaveBeenCalledOnce()
        // Peek Declaration 在 Peek 子菜单里
        expect(defaultContextMenuItems(p).find(i => i.id === 'peek')!.submenu!.map(i => i.id)).toContain('peekDecl')
    })
    it('Refactor... / Source Action... 只在有代码操作提供者时出现,带 Monaco 键位提示;只读不出现', () => {
        const refactor = vi.fn(), source = vi.fn()
        const none = make({}, { ts })
        ctx(none.view)
        expect(labels()).not.toContain('Refactor...')
        expect(labels()).not.toContain('Source Action...')
        none.view.destroy(); document.querySelectorAll('body > .cm-context-menu').forEach(n => n.remove())
        const p = { ts, codeActions: { refactor, source } }
        const has = make({}, p)
        ctx(has.view)
        expect(labels()).toContain('Refactor...')
        expect(labels()).toContain('Source Action...')
        const r = find(p, 'refactor')
        expect(r.keybinding).toMatch(/R$/)
        r.run!(has.view); find(p, 'sourceAction').run!(has.view)
        expect(refactor).toHaveBeenCalledOnce()
        expect(source).toHaveBeenCalledOnce()
        has.view.destroy(); document.querySelectorAll('body > .cm-context-menu').forEach(n => n.remove())
        const ro = make({}, p, true)
        ctx(ro.view)
        expect(labels()).not.toContain('Refactor...')
        expect(labels()).not.toContain('Source Action...')
    })
})
