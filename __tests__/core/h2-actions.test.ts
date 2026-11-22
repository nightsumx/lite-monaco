// H2:addAction / addEditorAction / getAction / getSupportedActions / addCommand / addKeybindingRule(s) / 命令面板 / 右键菜单。
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, mountEditor, key } from './h2-helpers'
const { KeyCode, KeyMod } = await import('../../src/api/keycodes')
const core = await import('../../src/core/index')
const { addEditorAction } = await import('../../src/api/actions')
const { addKeybindingRules, addKeybindingRule, keybindingToKey, keybindingLabel } = await import('../../src/api/commands')

afterEach(cleanup)

const paletteLabels = (ed: { dom: HTMLElement }) =>
    [...ed.dom.querySelectorAll('.cm-quick-input-label')].map(e => e.textContent)

describe('键位换算', () => {
    it('数字键位 ↔ lite-monaco 字符串键位 / 显示文字(Mac)', () => {
        expect(keybindingToKey(KeyMod.CtrlCmd | KeyCode.KeyS)).toBe('Mod-s')
        expect(keybindingToKey(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.F10)).toBe('Mod-Shift-F10')
        expect(keybindingToKey(KeyMod.chord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyC))).toBe('Mod-k Mod-c')
        expect(keybindingToKey(KeyCode.Enter)).toBe('Enter')
        expect(keybindingToKey(0)).toBeNull()
        expect(keybindingLabel(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyP)).toBe('⇧⌘P')
        expect(keybindingLabel(KeyMod.chord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyC))).toBe('⌘K ⌘C')
    })
})

describe('addCommand', () => {
    it('按键触发,返回命令 id;context 的 when 不满足时不触发', () => {
        const ed = mountEditor('x')
        const run = vi.fn()
        const flag = ed.createContextKey('flag', false)
        const id = ed.addCommand(KeyMod.CtrlCmd | KeyCode.KeyJ, run, 'flag')
        expect(typeof id).toBe('string')
        key(ed.contentDOM, 'j', { metaKey: true })
        expect(run).not.toHaveBeenCalled()
        flag.set(true)
        const ev = key(ed.contentDOM, 'j', { metaKey: true })
        expect(run).toHaveBeenCalledTimes(1)
        expect(ev.defaultPrevented).toBe(true)
        flag.set(false)
        key(ed.contentDOM, 'j', { metaKey: true })
        expect(run).toHaveBeenCalledTimes(1)
    })

    it('和弦键位:两段按完才触发', () => {
        const ed = mountEditor('x')
        const run = vi.fn()
        ed.addCommand(KeyMod.chord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyY), run)
        key(ed.contentDOM, 'k', { metaKey: true })
        expect(run).not.toHaveBeenCalled()
        key(ed.contentDOM, 'y', { metaKey: true })
        expect(run).toHaveBeenCalledTimes(1)
    })

    it('用户命令压过内置键位(⌘Z 之类)', () => {
        const ed = mountEditor('x')
        const run = vi.fn()
        ed.addCommand(KeyMod.CtrlCmd | KeyCode.KeyZ, run)
        key(ed.contentDOM, 'z', { metaKey: true })
        expect(run).toHaveBeenCalledTimes(1)
    })
})

describe('addAction', () => {
    it('返回 IDisposable;getAction 取回,run 带上 editor 和参数;dispose 后取不到', async () => {
        const ed = mountEditor('x')
        const run = vi.fn()
        const d = ed.addAction({ id: 'my.action', label: 'My Action', run })
        const a = ed.getAction('my.action')
        expect(a).not.toBeNull()
        expect(a.label).toBe('My Action')
        expect(a.alias).toBe('My Action')
        expect(a.id.endsWith(':my.action')).toBe(true)
        expect(a.isSupported()).toBe(true)
        await a.run()
        expect(run).toHaveBeenCalledTimes(1)
        expect(run.mock.calls[0][0]).toBe(ed)
        d.dispose()
        expect(ed.getAction('my.action')).toBeNull()
    })

    it('参数缺失会抛(同 Monaco)', () => {
        const ed = mountEditor('x')
        expect(() => ed.addAction({ id: 'x' })).toThrow(/Invalid action descriptor/)
    })

    it('keybindings 触发;keybindingContext 与 precondition 都参与', () => {
        const ed = mountEditor('x')
        const run = vi.fn()
        const pre = ed.createContextKey('pre', true)
        const ctxKey = ed.createContextKey('kb', false)
        ed.addAction({ id: 'a', label: 'A', precondition: 'pre', keybindingContext: 'kb', keybindings: [KeyMod.CtrlCmd | KeyCode.KeyU], run })
        key(ed.contentDOM, 'u', { metaKey: true })
        expect(run).not.toHaveBeenCalled()
        ctxKey.set(true)
        key(ed.contentDOM, 'u', { metaKey: true })
        expect(run).toHaveBeenCalledTimes(1)
        pre.set(false)
        key(ed.contentDOM, 'u', { metaKey: true })
        expect(run).toHaveBeenCalledTimes(1)
    })

    it('precondition 不满足:isSupported 为 false,run 什么也不做,getSupportedActions 里没有', async () => {
        const ed = mountEditor('x')
        const run = vi.fn()
        const k = ed.createContextKey('can', false)
        ed.addAction({ id: 'cond', label: 'Cond', precondition: 'can', run })
        const a = ed.getAction('cond')
        expect(a.isSupported()).toBe(false)
        await a.run()
        expect(run).not.toHaveBeenCalled()
        expect(ed.getSupportedActions().some((x: { id: string }) => x.id.endsWith(':cond'))).toBe(false)
        k.set(true)
        expect(a.isSupported()).toBe(true)
        expect(ed.getSupportedActions().some((x: { id: string }) => x.id.endsWith(':cond'))).toBe(true)
        await a.run()
        expect(run).toHaveBeenCalledTimes(1)
    })

    it('出现在命令面板;precondition 变化后面板里随之增减', () => {
        const ed = mountEditor('x')
        const k = ed.createContextKey('show', true)
        ed.addAction({ id: 'pal', label: 'Zzz Custom Palette Action', precondition: 'show', keybindings: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyU], run: () => {} })
        core.openCommandPalette(ed)
        expect(paletteLabels(ed)).toContain('Zzz Custom Palette Action')
        // 键帽
        const row = [...ed.dom.querySelectorAll('.cm-quick-input-row')].find(r => r.textContent?.includes('Zzz Custom'))!
        expect([...row.querySelectorAll('.cm-keybinding-key')].map(x => x.textContent)).toEqual(['⇧', '⌘', 'U'])
        ed.dom.querySelector('.cm-quick-input')!.remove()
        k.set(false)
        core.openCommandPalette(ed)
        expect(paletteLabels(ed)).not.toContain('Zzz Custom Palette Action')
    })

    it('选中面板项执行 run', () => {
        const ed = mountEditor('x')
        const run = vi.fn()
        ed.addAction({ id: 'go', label: 'Qqq Run Me', run })
        core.openCommandPalette(ed)
        const input = ed.dom.querySelector('.cm-quick-input-input') as HTMLInputElement
        input.value = '>Qqq Run Me'
        input.dispatchEvent(new Event('input', { bubbles: true }))
        key(input, 'Enter')
        expect(run).toHaveBeenCalledTimes(1)
    })

    it('dispose 后面板里没有', () => {
        const ed = mountEditor('x')
        const d = ed.addAction({ id: 'tmp', label: 'Tmp Palette Action', run: () => {} })
        d.dispose()
        core.openCommandPalette(ed)
        expect(paletteLabels(ed)).not.toContain('Tmp Palette Action')
    })
})

describe('右键菜单', () => {
    const openMenu = (ed: { contentDOM: HTMLElement }) => {
        ed.contentDOM.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10, button: 2 }))
        return [...document.querySelectorAll('.cm-contextmenu [role=menuitem], .cm-context-menu [role=menuitem]')]
    }

    it('contextMenuGroupId 的动作进菜单,precondition 不满足时不出现', () => {
        const ed = mountEditor('x', { features: { contextMenu: true, minimap: false, autocomplete: false, hover: false, stickyScroll: false } })
        const k = ed.createContextKey('menu', true)
        ed.addAction({ id: 'm', label: 'Menu Action Zed', precondition: 'menu', contextMenuGroupId: '9_cutcopypaste', contextMenuOrder: 5, run: () => {} })
        let items = openMenu(ed)
        expect(items.map(i => i.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('Menu Action Zed')]))
        document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        k.set(false)
        items = openMenu(ed)
        expect(items.map(i => i.textContent).join('|')).not.toContain('Menu Action Zed')
    })
})

describe('addEditorAction(全局)与内置动作', () => {
    it('全局动作所有实例都有,dispose 后消失', async () => {
        const a = mountEditor('a')
        const run = vi.fn()
        const d = addEditorAction({ id: 'global.one', label: 'Global One', run })
        const b = mountEditor('b')
        for (const ed of [a, b]) {
            expect(ed.getAction('global.one').label).toBe('Global One')
        }
        await b.getAction('global.one').run()
        expect(run.mock.calls[0][0]).toBe(b)
        d.dispose()
        expect(a.getAction('global.one')).toBeNull()
    })

    it('getAction 认内置 editor.action.*;只读时写操作 isSupported 为 false', async () => {
        const ed = mountEditor('b\na')
        const sort = ed.getAction('editor.action.sortLinesAscending')
        expect(sort).not.toBeNull()
        expect(sort.label).toBe('Sort Lines Ascending')
        ed.dispatch(ed.state.update({ selection: { anchor: 0, head: 3 } }))
        await sort.run()
        expect(ed.state.doc.toString()).toBe('a\nb')
        const ro = mountEditor('x', { readOnly: true })
        expect(ro.getAction('editor.action.sortLinesAscending').isSupported()).toBe(false)
        expect(ro.getAction('editor.action.nextMatchFindAction').isSupported()).toBe(true)
        expect(ed.getAction('no.such.action')).toBeNull()
    })

    it('getSupportedActions 含内置 + 用户动作', () => {
        const ed = mountEditor('x')
        ed.addAction({ id: 'u', label: 'U', run: () => {} })
        const ids = ed.getSupportedActions().map((a: { id: string }) => a.id)
        expect(ids).toContain('editor.action.commentLine')
        expect(ids.some((i: string) => i.endsWith(':u'))).toBe(true)
        expect(ids.length).toBeGreaterThan(30)
    })
})

describe('addKeybindingRule(s)', () => {
    it('把键位绑到命令 id(用户动作 / 内置命令),dispose 摘掉', () => {
        const ed = mountEditor('b\na')
        const run = vi.fn()
        ed.addAction({ id: 'ruled', label: 'Ruled', run })
        const id = ed.getAction('ruled').id
        const d = addKeybindingRules([
            { keybinding: KeyMod.CtrlCmd | KeyCode.KeyG | KeyMod.Alt, command: id },
        ])
        key(ed.contentDOM, 'g', { metaKey: true, altKey: true })
        expect(run).toHaveBeenCalledTimes(1)
        d.dispose()
        key(ed.contentDOM, 'g', { metaKey: true, altKey: true })
        expect(run).toHaveBeenCalledTimes(1)
    })

    it('when 过滤;command 以 - 开头 = 取消该键位(吞掉按键)', () => {
        const ed = mountEditor('x')
        const run = vi.fn()
        ed.addAction({ id: 'r2', label: 'R2', run })
        const id = ed.getAction('r2').id
        const k = ed.createContextKey('ruleOn', false)
        const d1 = addKeybindingRule({ keybinding: KeyMod.CtrlCmd | KeyCode.KeyL | KeyMod.Alt, command: id, when: 'ruleOn' })
        key(ed.contentDOM, 'l', { metaKey: true, altKey: true })
        expect(run).not.toHaveBeenCalled()
        k.set(true)
        key(ed.contentDOM, 'l', { metaKey: true, altKey: true })
        expect(run).toHaveBeenCalledTimes(1)
        d1.dispose()
        const d2 = addKeybindingRule({ keybinding: KeyMod.CtrlCmd | KeyCode.KeyB, command: '-editor.action.x' })
        const ev = key(ed.contentDOM, 'b', { metaKey: true })
        expect(ev.defaultPrevented).toBe(true)
        d2.dispose()
    })

    it('命令 id 指向内置命令也行', () => {
        const ed = mountEditor('b\na')
        ed.dispatch(ed.state.update({ selection: { anchor: 0, head: 3 } }))
        const d = addKeybindingRule({ keybinding: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyS, command: 'editor.action.sortLinesAscending' })
        key(ed.contentDOM, 's', { metaKey: true, altKey: true })
        expect(ed.state.doc.toString()).toBe('a\nb')
        d.dispose()
    })
})
