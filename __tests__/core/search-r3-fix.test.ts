// 第三轮 Q 组:查找/替换框逐项对照 Monaco 0.52(Mac 键位)。
// 期望值来自对照页实测:/tmp/lc-hunt/r3/fix-Q/probe.ts、/tmp/lc-hunt/r3/d/{find2,find-reopen}.ts。
// 走完整 liteMonaco(真 keymap),所以平台要在 keymap 模块加载前定好,全用动态 import。
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, setMacPlatform } from './f5-replay'

setMacPlatform()
const lm = await import('../../src/litemonaco')
const core = await import('../../src/core/index')
const mods = { lm, core }

// find2.ts / probe.ts 用的同一份文档
const DOC = "const foo = 1\nlet Foo = foo + 2\nfunction foobar() { return foo }\n// foo foo\nconst bar = 'x.y'\n"

function setup(doc: string) {
    const r = mount(mods, { doc: '‸' + doc })
    const view = r.view
    view.focus()
    const q = (s: string) => view.dom.querySelector(s) as HTMLElement | null
    const findInput = () => q('.cm-find-input[main-field]') as HTMLInputElement
    const replInput = () => q('.cm-replace-part textarea') as HTMLInputElement
    const panel = () => q('.cm-find-widget')
    const typeFind = (v: string) => {
        // 像真打字:替换框里的选区
        const i = document.activeElement as HTMLInputElement
        const a = i.selectionStart ?? i.value.length
        const b = i.selectionEnd ?? i.value.length
        i.value = i.value.slice(0, a) + v + i.value.slice(b)
        i.setSelectionRange(a + v.length, a + v.length)
        i.dispatchEvent(new Event('input', { bubbles: true }))
    }
    // 焦点所在的元素上按键(查找框里的键由面板处理,编辑器里的走 keymap)
    const press = (spec: string) => {
        const a = document.activeElement
        if (a && a !== view.contentDOM && panel()?.contains(a)) {
            const [key, ...m] = spec.split('+').reverse()
            const mods = new Set(m)
            const code = key.length === 1 ? `Key${key.toUpperCase()}` : ''
            a.dispatchEvent(new KeyboardEvent('keydown', {
                key, code, bubbles: true, cancelable: true,
                metaKey: mods.has('Meta'), altKey: mods.has('Alt'), shiftKey: mods.has('Shift'), ctrlKey: mods.has('Control'),
            }))
        }
        else r.press(spec)
    }
    const caret = (pos: number) => view.dispatch(view.state.update({ selection: core.EditorSelection.cursor(pos) }))
    const sel = () => `${view.state.selection.main.anchor}-${view.state.selection.main.head}`
    const count = () => q('.cm-matches-count')?.textContent
    const focus = () => {
        const a = document.activeElement
        return a === findInput() ? 'find' : a === replInput() ? 'replace' : a === view.contentDOM ? 'editor' : 'other'
    }
    const caretIn = (i: HTMLInputElement) => `${i.selectionStart},${i.selectionEnd}`
    const highlighted = () => view.dom.querySelectorAll('.cm-searchMatch-selected').length
    return { ...r, view, findInput, replInput, panel, typeFind, press, caret, sel, count, focus, caretIn, highlighted }
}

const frame = () => new Promise(r => setTimeout(r, 30))

afterEach(() => { vi.useRealTimers() })

describe('#1 Esc 关掉后 200ms 内再 ⌘F', () => {
    it('查找框重新可见、焦点在框里;过了淡出时间也不被删掉', async () => {
        const t = setup(DOC)
        t.press('Meta+f')
        await frame()
        t.typeFind('foo')
        t.press('Escape')
        expect(t.panel()?.classList.contains('visible')).toBe(false)
        t.press('Meta+f')
        await frame()
        expect(t.panel()?.classList.contains('visible')).toBe(true)
        expect(t.focus()).toBe('find')
        await new Promise(r => setTimeout(r, 260))
        expect(t.panel()?.isConnected).toBe(true)
        expect(t.panel()?.classList.contains('visible')).toBe(true)
        t.destroy()
    })
})

describe('#2 Esc 后 ⌘G 不抢焦点', () => {
    it('⌘F foo → Esc → (淡出完) → ⌘G:打开查找框、跳到下一个,焦点留在编辑器', async () => {
        const t = setup(DOC)
        t.press('Meta+f')
        t.typeFind('foo')
        t.press('Escape')
        await new Promise(r => setTimeout(r, 260))
        expect(t.panel()).toBe(null)
        t.press('Meta+g')
        expect(t.panel()).not.toBe(null)
        expect(t.sel()).toBe('18-21')
        expect(t.focus()).toBe('editor')
        expect(t.findInput().value).toBe('foo')
        t.destroy()
    })

    it('⇧⌘G 同理', async () => {
        const t = setup(DOC)
        t.press('Meta+f')
        t.typeFind('foo')
        t.press('Escape')
        await new Promise(r => setTimeout(r, 260))
        t.press('Shift+Meta+g')
        expect(t.sel()).toBe('72-75')
        expect(t.focus()).toBe('editor')
        t.destroy()
    })
})

describe('#3 ⌥⌘F 替换(Monaco StartFindReplaceAction)', () => {
    it('空选区第一次打开:不从光标词 seed,查询空,焦点进查找框', () => {
        const t = setup(DOC)
        t.caret(7)
        t.press('Alt+Meta+f')
        expect(t.findInput().value).toBe('')
        expect(t.focus()).toBe('find')
        expect(t.count()).toBe('No results')
        t.destroy()
    })

    it('单行非空选区:seed 选区,焦点进替换框', () => {
        const t = setup(DOC)
        t.view.dispatch(t.view.state.update({ selection: core.EditorSelection.range(6, 9) }))
        t.press('Alt+Meta+f')
        expect(t.findInput().value).toBe('foo')
        expect(t.focus()).toBe('replace')
        t.destroy()
    })

    it('Esc 后选区停在命中上再 ⌥⌘F:焦点进替换框', () => {
        const t = setup(DOC)
        t.press('Meta+f')
        t.typeFind('bar')
        t.press('Escape')
        t.press('Alt+Meta+f')
        expect(t.findInput().value).toBe('bar')
        expect(t.focus()).toBe('replace')
        expect(t.sel()).toBe('44-47')
        t.destroy()
    })

    it('查找框里按 ⌥⌘F:展开替换,查询不变,焦点进替换框', () => {
        const t = setup(DOC)
        t.press('Meta+f')
        t.typeFind('foo')
        expect(t.focus()).toBe('find')
        t.press('Alt+Meta+f')
        expect(t.view.state.field(core.searchField).replaceOpen).toBe(true)
        expect(t.findInput().value).toBe('foo')
        expect(t.focus()).toBe('replace')
        t.destroy()
    })

    it('已有查询、空选区在别的词上:保留查询(不 seed 光标词),焦点进查找框并全选', () => {
        const t = setup(DOC)
        t.press('Meta+f')
        t.typeFind('foo')
        t.press('Escape')
        t.caret(52)
        t.press('Alt+Meta+f')
        expect(t.findInput().value).toBe('foo')
        expect(t.focus()).toBe('find')
        expect(t.caretIn(t.findInput())).toBe('0,3')
        t.destroy()
    })

    it('Tab / Shift+Tab 在查找、替换框之间:只挪焦点,不全选,光标留在原处', () => {
        const t = setup(DOC)
        t.press('Alt+Meta+f')
        t.typeFind('foo')
        t.press('Tab')
        expect(t.focus()).toBe('replace')
        t.typeFind('QQ')
        t.press('Shift+Tab')
        expect(t.focus()).toBe('find')
        expect(t.caretIn(t.findInput())).toBe('3,3')
        t.press('Tab')
        expect(t.focus()).toBe('replace')
        expect(t.caretIn(t.replInput())).toBe('2,2')
        // 关掉、挪开光标再 ⌥⌘F(焦点进查找框),Tab 到替换框:QQ 还在,光标在末尾
        t.press('Escape')
        t.caret(2)
        t.press('Alt+Meta+f')
        expect(t.focus()).toBe('find')
        t.press('Tab')
        expect(t.replInput().value).toBe('QQ')
        expect(t.caretIn(t.replInput())).toBe('2,2')
        t.destroy()
    })
})

describe('#4 计数「k of N」(Monaco FindModel.research)', () => {
    it('重开时光标不在命中上:显示光标前最近一个命中的序号;都在后面才是「?」', () => {
        const t = setup(DOC)
        t.press('Meta+f')
        t.typeFind('bar')
        t.press('Escape')
        t.caret(t.view.state.doc.length)
        t.press('Meta+f')
        expect(t.count()).toBe('2 of 2')
        t.press('Escape')
        t.caret(0)
        t.press('Meta+f')
        // 光标在 const 上 → seed const,碰到第一个
        expect(t.count()).toBe('1 of 2')
        t.destroy()
    })

    it('光标在所有命中前面:「?」', () => {
        const t = setup(DOC)
        t.press('Meta+f')
        t.typeFind('foo')
        t.press('Escape')
        t.caret(2)
        t.press('Alt+Meta+f')
        expect(t.count()).toBe('? of 7')
        t.destroy()
    })

    it('⌥⌘F 时光标在 return 里:4 of 7(前面有 4 个 foo)', () => {
        const t = setup(DOC)
        t.press('Meta+f')
        t.typeFind('foo')
        t.press('Escape')
        t.caret(52)
        t.press('Alt+Meta+f')
        expect(t.count()).toBe('4 of 7')
        t.destroy()
    })

    it('光标挨着命中之后一格(10):重开 1 of 7', () => {
        const t = setup(DOC)
        t.press('Meta+f')
        t.typeFind('foo')
        t.press('Escape')
        t.caret(10)
        t.press('Meta+f')
        expect(t.count()).toBe('1 of 7')
        t.destroy()
    })

    it('查找框开着时只挪光标:计数和当前命中高亮都不变', () => {
        const t = setup(DOC)
        t.press('Meta+f')
        t.typeFind('foo')
        t.press('Enter')
        expect(t.count()).toBe('2 of 7')
        expect(t.highlighted()).toBe(1)
        t.caret(50)
        expect(t.count()).toBe('2 of 7')
        expect(t.highlighted()).toBe(1)
        t.view.dispatch(t.view.state.update({ selection: core.EditorSelection.range(6, 9) }))
        expect(t.count()).toBe('2 of 7')
        t.destroy()
    })

    it('⌥⌘C 切条件:按光标重算(光标前最近一个),不高亮', () => {
        const t = setup(DOC)
        t.press('Meta+f')
        t.typeFind('foo')
        t.caret(50)
        t.press('Alt+Meta+c')
        expect(t.count()).toBe('3 of 6')
        expect(t.highlighted()).toBe(0)
        t.press('Alt+Meta+c')
        expect(t.count()).toBe('4 of 7')
        t.destroy()
    })

    it('查找框开着时在最后一行打字:改文档后按光标重算(3 of 3)', () => {
        const t = setup('const foo = 1\nlet bar = foo + foo\n\n')
        t.press('Meta+f')
        t.typeFind('foo')
        expect(t.count()).toBe('1 of 3')
        t.view.focus()
        t.caret(34)
        t.type('x')
        expect(t.count()).toBe('3 of 3')
        t.type(' foo')
        expect(t.count()).toBe('4 of 4')
        t.destroy()
    })

    it('重开时不高亮当前命中(Monaco 只有跳转后才高亮)', () => {
        const t = setup(DOC)
        t.caret(7)
        t.press('Meta+f')
        expect(t.count()).toBe('1 of 7')
        expect(t.highlighted()).toBe(0)
        t.press('Enter')
        expect(t.highlighted()).toBe(1)
        t.destroy()
    })
})

describe('框内 ⌘F(Monaco StartFindAction 不看焦点)', () => {
    it('Enter 跳到 Foo 后在查找框里按 ⌘F:按选区重新 seed 成 Foo 并全选,不高亮', () => {
        const t = setup(DOC)
        t.press('Meta+f')
        t.typeFind('foo')
        t.press('Enter')
        expect(t.sel()).toBe('18-21')
        t.press('Meta+f')
        expect(t.findInput().value).toBe('Foo')
        expect(t.focus()).toBe('find')
        expect(t.caretIn(t.findInput())).toBe('0,3')
        expect(t.count()).toBe('2 of 7')
        expect(t.highlighted()).toBe(0)
        t.destroy()
    })
})

describe('#5 替换快捷键', () => {
    it('Mac:⌘H 不开替换(那是隐藏应用),⌥⌘F 开', () => {
        const t = setup(DOC)
        t.press('Meta+h')
        expect(t.view.state.field(core.searchField).open).toBe(false)
        t.press('Alt+Meta+f')
        expect(t.view.state.field(core.searchField).replaceOpen).toBe(true)
        t.destroy()
    })

    it('Win/Linux:Ctrl+H 开替换,Ctrl+Alt+F 不开', async () => {
        Object.defineProperty(window.navigator, 'platform', { value: 'Win32', configurable: true })
        vi.resetModules()
        try {
            const winMods = { lm: await import('../../src/litemonaco'), core: await import('../../src/core/index') }
            const a = mount(winMods, { doc: '‸' + DOC })
            a.press('Control+Alt+f')
            expect(a.view.state.field(winMods.core.searchField).open).toBe(false)
            a.press('Control+h')
            expect(a.view.state.field(winMods.core.searchField).replaceOpen).toBe(true)
            a.destroy()
        }
        finally { setMacPlatform() }
    })
})
