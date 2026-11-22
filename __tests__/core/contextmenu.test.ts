import { describe, expect, it, afterEach } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { EditorView } from '../../src/core/view/editorview'
import { EditorSelection } from '../../src/core/model/selection'
import {
    contextMenuCM7,
    contextMenuIsOpen,
    defaultContextMenuItems,
} from '../../src/core/feature/contextmenu'
import { copyCommand } from '../../src/core/input/clipboard'
import { keyOS } from '../../src/core/keyos'

function make(doc = 'hello world\nfoo bar') {
    const view = new EditorView({
        state: EditorState.create({ doc }),
        parent: document.body,
        drawSelection: true,
    })
    const detach = contextMenuCM7()(view)
    return { view, detach }
}

function fireContext(view: EditorView, x = 40, y = 40) {
    const e = new MouseEvent('contextmenu', {
        bubbles: true, cancelable: true, clientX: x, clientY: y, button: 2,
    })
    view.contentDOM.dispatchEvent(e)
    return e
}

afterEach(() => {
    document.querySelectorAll('body > .cm-context-menu').forEach(n => n.remove())
    document.querySelectorAll('.cm-editor').forEach(n => n.remove())
})

describe('defaultContextMenuItems', () => {
    it('含 Monaco 主分组:导航 / 编辑 / 剪贴板 / 命令面板', () => {
        const ids = defaultContextMenuItems().map(i => i.id)
        expect(ids).toContain('gotoDef')
        expect(ids).toContain('changeAll')
        expect(ids).toContain('cut')
        expect(ids).toContain('copy')
        expect(ids).toContain('paste')
        expect(ids).toContain('palette')
        expect(ids.filter(id => id.startsWith('sep')).length).toBeGreaterThanOrEqual(2)
    })

    it('无 TS provider 时 LSP 项 disabled;剪贴板/调色板可跑', () => {
        const items = defaultContextMenuItems()
        expect(items.find(i => i.id === 'gotoDef')!.enabled).toBe(false)
        expect(items.find(i => i.id === 'rename')!.enabled).toBe(false)
        expect(typeof items.find(i => i.id === 'copy')!.run).toBe('function')
        expect(typeof items.find(i => i.id === 'changeAll')!.run).toBe('function')
        expect(typeof items.find(i => i.id === 'palette')!.run).toBe('function')
    })

    it('注入 ts provider 后 Definition/Rename/Format 启用', () => {
        const ts = {
            goToDefinition: async () => true,
            goToReferences: async () => true,
            peekDefinition: async () => true,
            peekReferences: async () => true,
            renameSymbol: async () => true,
            formatDocument: async () => true,
            formatSelection: async () => true,
            organizeImports: async () => true,
            addMissingImports: async () => true,
            removeUnusedImports: async () => true,
            addTypeAnnotation: async () => true,
            addMissingMembers: async () => true,
            removeUnusedLocals: async () => true,
            goToSymbol: async () => true,
            goToImplementation: async () => true,
            peekImplementation: async () => true,
            goToTypeDefinition: async () => true,
            peekTypeDefinition: async () => true,
            goToWorkspaceSymbol: async () => true,
            listWorkspaceSymbols: async () => [],
            expandSmartSelection: async () => true,
            shrinkSmartSelection: async () => true,
            hasDefinitionSync: () => true,
            definitionPreviewAt: async () => null,
            outlineSymbols: async () => [],
        }
        const items = defaultContextMenuItems({ ts })
        expect(items.find(i => i.id === 'gotoDef')!.enabled).toBe(true)
        expect(typeof items.find(i => i.id === 'gotoDef')!.run).toBe('function')
        expect(typeof items.find(i => i.id === 'format')!.run).toBe('function')
        const peek = items.find(i => i.id === 'peek')
        expect(peek?.submenu?.map(s => s.id)).toEqual(['peekDef', 'peekRef', 'peekImpl', 'peekType'])
    })

    it('点每项 LSP 都调对应 provider', () => {
        const called: string[] = []
        const ts = {
            goToDefinition: async () => { called.push('gotoDef'); return true },
            goToReferences: async () => { called.push('gotoRef'); return true },
            peekDefinition: async () => { called.push('peekDef'); return true },
            peekReferences: async () => { called.push('peekRef'); return true },
            renameSymbol: async () => { called.push('rename'); return true },
            formatDocument: async () => { called.push('format'); return true },
            formatSelection: async () => { called.push('formatSel'); return true },
            organizeImports: async () => { called.push('organize'); return true },
            addMissingImports: async () => { called.push('addImports'); return true },
            removeUnusedImports: async () => { called.push('rmUnused'); return true },
            addTypeAnnotation: async () => { called.push('addType'); return true },
            addMissingMembers: async () => { called.push('addMembers'); return true },
            removeUnusedLocals: async () => { called.push('rmLocals'); return true },
            goToSymbol: async () => { called.push('gotoSym'); return true },
            goToImplementation: async () => { called.push('gotoImpl'); return true },
            peekImplementation: async () => { called.push('peekImpl'); return true },
            goToTypeDefinition: async () => { called.push('gotoType'); return true },
            peekTypeDefinition: async () => { called.push('peekType'); return true },
            goToWorkspaceSymbol: async () => { called.push('gotoWs'); return true },
            listWorkspaceSymbols: async () => [],
            expandSmartSelection: async () => { called.push('expandSel'); return true },
            shrinkSmartSelection: async () => { called.push('shrinkSel'); return true },
            hasDefinitionSync: () => true,
            definitionPreviewAt: async () => null,
            outlineSymbols: async () => [],
        }
        const view = new EditorView({
            state: EditorState.create({ doc: 'x' }),
            parent: document.body,
        })
        const items = defaultContextMenuItems({ ts })
        const ids = ['gotoDef', 'gotoRef', 'gotoImpl', 'gotoType', 'gotoSym', 'peekDef', 'peekRef', 'peekImpl', 'peekType', 'rename', 'format', 'formatSel', 'organize']
        for (const id of ids) {
            const item = id.startsWith('peek')
                ? items.find(i => i.id === 'peek')!.submenu!.find(s => s.id === id)!
                : items.find(i => i.id === id)!
            expect(item.run!(view)).toBe(true)
        }
        expect(called.sort()).toEqual([...ids].sort())
        view.destroy()
    })

    it('点 Command Palette 打开面板', async () => {
        const view = new EditorView({
            state: EditorState.create({ doc: 'hello' }),
            parent: document.body,
        })
        const item = defaultContextMenuItems().find(i => i.id === 'palette')!
        expect(item.run!(view)).toBe(true)
        await Promise.resolve()
        const input = view.dom.querySelector('.cm-quick-input-input') as HTMLInputElement
        expect(input.value).toBe('>')
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        await Promise.resolve()
        expect(view.dom.querySelector('.cm-quick-input')).toBeNull()
        view.destroy()
    })
})

describe('contextMenuCM7', () => {
    it('右键 preventDefault 并弹出菜单 DOM', () => {
        const { view, detach } = make()
        const e = fireContext(view)
        expect(e.defaultPrevented).toBe(true)
        expect(contextMenuIsOpen()).toBe(true)
        const menu = document.querySelector('body > .cm-context-menu')!
        // 无 TS:语言项不出(Monaco 没 provider 时菜单里没有);剪贴板项无键帽(standalone 不给它们绑键)
        expect([...menu.querySelectorAll(':scope > .cm-context-item')].map(el => el.textContent))
            .toEqual([`Change All Occurrences${keyOS === 'mac' ? '⌘F2' : 'Ctrl+F2'}`, 'Cut', 'Copy', 'Paste', 'Command PaletteF1'])
        detach()
        view.destroy()
    })

    it('点 Copy 关闭菜单且不改 doc', () => {
        const { view, detach } = make()
        view.dispatch(view.state.update({ selection: EditorSelection.range(0, 5) }))
        fireContext(view)
        const copyRow = [...document.querySelectorAll('.cm-context-item')]
            .find(el => el.textContent?.includes('Copy') && !el.classList.contains('disabled')) as HTMLElement
        expect(copyRow).toBeTruthy()
        // mock clipboard write
        const writes: string[] = []
        const nav = globalThis.navigator as Navigator & { clipboard?: { writeText: (t: string) => Promise<void> } }
        const prev = nav.clipboard
        Object.defineProperty(nav, 'clipboard', {
            configurable: true,
            value: { writeText: (t: string) => { writes.push(t); return Promise.resolve() } },
        })
        try {
            // Monaco:mousedown 不执行,mouseup 才执行
            copyRow.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
            expect(writes).toEqual([])
            copyRow.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }))
            expect(writes).toEqual(['hello'])
            expect(view.state.doc.toString()).toContain('hello world')
            expect(contextMenuIsOpen()).toBe(false)
        } finally {
            Object.defineProperty(nav, 'clipboard', { configurable: true, value: prev })
            detach()
            view.destroy()
        }
    })

    it('点 Cut 删选区并关菜单', () => {
        const { view, detach } = make()
        view.dispatch(view.state.update({ selection: EditorSelection.range(0, 5) }))
        fireContext(view)
        const writes: string[] = []
        const nav = globalThis.navigator as Navigator & { clipboard?: { writeText: (t: string) => Promise<void> } }
        const prev = nav.clipboard
        Object.defineProperty(nav, 'clipboard', {
            configurable: true,
            value: { writeText: (t: string) => { writes.push(t); return Promise.resolve() } },
        })
        try {
            const cutRow = [...document.querySelectorAll('.cm-context-item')]
                .find(el => el.textContent?.includes('Cut')) as HTMLElement
            cutRow.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
            cutRow.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }))
            expect(writes).toEqual(['hello'])
            expect(view.state.doc.toString().startsWith('hello')).toBe(false)
            expect(contextMenuIsOpen()).toBe(false)
        } finally {
            Object.defineProperty(nav, 'clipboard', { configurable: true, value: prev })
            detach()
            view.destroy()
        }
    })

    it('Esc 关闭菜单', () => {
        const { view, detach } = make()
        fireContext(view)
        expect(contextMenuIsOpen()).toBe(true)
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        expect(contextMenuIsOpen()).toBe(false)
        detach()
        view.destroy()
    })

    it('编辑器上滚滚轮关菜单;程序滚动、resize、菜单里滚轮不关', () => {
        const { view, detach } = make()
        fireContext(view)
        view.scrollDOM.dispatchEvent(new Event('scroll'))
        window.dispatchEvent(new Event('resize'))
        document.querySelector('body > .cm-context-menu')!.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 50 }))
        expect(contextMenuIsOpen()).toBe(true)
        view.scrollDOM.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 50 }))
        expect(contextMenuIsOpen()).toBe(false)
        detach()
        view.destroy()
    })

    it('点菜单外关闭', () => {
        const { view, detach } = make()
        fireContext(view)
        expect(contextMenuIsOpen()).toBe(true)
        document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 0, clientY: 0 }))
        expect(contextMenuIsOpen()).toBe(false)
        detach()
        view.destroy()
    })

    it('Change All Occurrences 菜单项跑 shipped 命令', () => {
        const view = new EditorView({
            state: EditorState.create({
                doc: 'hello world\nhello bar',
                extensions: [EditorState.allowMultipleSelections.of(true)],
            }),
            parent: document.body,
        })
        const detach = contextMenuCM7()(view)
        view.dispatch(view.state.update({ selection: EditorSelection.range(0, 5) }))
        const item = defaultContextMenuItems().find(i => i.id === 'changeAll')!
        expect(item.run!(view)).toBe(true)
        expect(view.state.selection.ranges.length).toBe(2)
        detach()
        view.destroy()
    })

    it('copyCommand 可被菜单项直接调用', () => {
        const { view, detach } = make()
        view.dispatch(view.state.update({ selection: EditorSelection.range(0, 5) }))
        expect(copyCommand(view)).toBe(true)
        detach()
        view.destroy()
    })
})
