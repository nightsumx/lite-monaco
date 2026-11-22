// 第五轮 O 组:宿主 keymap 在编辑器自己的浮层输入框里也生效。
// Monaco 实测(/tmp/lc-hunt/r5/O/m-keys.ts):addCommand(⌘S)、addAction(⌘J)在查找框、替换框、quick input、
// rename 框里都会触发;⌘A / ⌘Z 在框里仍是输入框自己的全选 / 撤销,不动编辑器。
// 走完整 liteMonaco(真 keymap),平台要在 keymap 模块加载前定好,全用动态 import。
import { describe, expect, it } from 'vitest'
import { setMacPlatform } from './f5-replay'

setMacPlatform()
const { liteMonaco } = await import('../../src/litemonaco')
const core = await import('../../src/core/index')

const hl = {
    codeToTokens: (code: string) => ({ tokens: code.split('\n').map(l => [{ content: l, offset: 0 }]) }),
    getLastGrammarState: () => ({ getScopes: () => undefined }),
    getLoadedLanguages: () => ['typescript', 'text'],
    getTheme: () => ({ bg: '#1e1e1e', fg: '#d4d4d4', type: 'dark' as const }),
}
const QUIET = { minimap: false, autocomplete: false, tsDiagnostics: false, hover: false, signatureHelp: false, codeActions: false, stickyScroll: false } as const

function setup() {
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    const hits: string[] = []
    const view = liteMonaco({
        parent, highlighter: hl as never, doc: 'const foo = 1\nfoo + foo\n', lang: 'text', features: QUIET,
        keymap: [
            { key: 'Mod-s', run: () => (hits.push('save'), true) },
            // Filo 的 ⌘T:编辑器认领(不让内置 Mod-t 吃掉),但不 preventDefault,冒泡给 window
            { key: 'Mod-t', run: () => (hits.push('app-t'), true), preventDefault: false },
            { key: 'Mod-k Mod-x', run: () => (hits.push('chord'), true) },
            // 返回 false:落到后面(浮层里就是输入框原生行为)
            { key: 'ArrowLeft', run: () => (hits.push('left'), false) },
        ],
    })
    const done = () => { view.destroy(); parent.remove() }
    return { view, hits, done }
}

function key(target: Element, k: string, init: KeyboardEventInit = {}): KeyboardEvent {
    const code = k.length === 1 ? `Key${k.toUpperCase()}` : k
    const e = new KeyboardEvent('keydown', { key: k, code, bubbles: true, cancelable: true, ...init })
    target.dispatchEvent(e)
    return e
}

function openFind(view: InstanceType<typeof core.EditorView>): HTMLInputElement {
    core.openSearch(view)
    const input = view.dom.querySelector('.cm-find-input[main-field]') as HTMLInputElement
    input.focus()
    return input
}

describe('宿主 keymap 在浮层输入框里', () => {
    it('查找框里 ⌘S 触发宿主保存,并 preventDefault', () => {
        const { view, hits, done } = setup()
        const input = openFind(view)
        const e = key(input, 's', { metaKey: true })
        expect(hits).toEqual(['save'])
        expect(e.defaultPrevented).toBe(true)
        done()
    })

    it('替换框里 ⌘S 也触发', () => {
        const { view, hits, done } = setup()
        core.openSearchReplace(view)
        const repl = view.dom.querySelector('.cm-replace-part textarea') as HTMLInputElement
        repl.focus()
        key(repl, 's', { metaKey: true })
        expect(hits).toEqual(['save'])
        done()
    })

    it('quick input(F1 命令面板)里 ⌘S 触发', () => {
        const { view, hits, done } = setup()
        core.openCommandPalette(view, [])
        const input = view.dom.querySelector('.cm-quick-input-input') as HTMLInputElement
        expect(input).toBeTruthy()
        key(input, 's', { metaKey: true })
        expect(hits).toEqual(['save'])
        done()
    })

    it('run 返回 true 但 preventDefault:false 的键照样冒泡到 window,且不被阻止', () => {
        const { view, hits, done } = setup()
        const input = openFind(view)
        const seen: boolean[] = []
        const onWin = (e: KeyboardEvent) => { if (e.key === 't') seen.push(e.defaultPrevented) }
        window.addEventListener('keydown', onWin)
        key(input, 't', { metaKey: true })
        window.removeEventListener('keydown', onWin)
        expect(hits).toEqual(['app-t'])
        expect(seen).toEqual([false])
        done()
    })

    it('宿主和弦在框里也认', () => {
        const { view, hits, done } = setup()
        const input = openFind(view)
        key(input, 'k', { metaKey: true })
        key(input, 'x', { metaKey: true })
        expect(hits).toEqual(['chord'])
        done()
    })

    it('内置文本编辑键(⌘A、⌘Z、方向键)不进框里:编辑器选区和文档不动,也不 preventDefault', () => {
        const { view, hits, done } = setup()
        view.dispatch(view.state.update({ selection: { anchor: 3 } }))
        const input = openFind(view)
        const before = view.state.selection.main
        const a = key(input, 'a', { metaKey: true })
        const z = key(input, 'z', { metaKey: true })
        const left = key(input, 'ArrowLeft')
        expect(a.defaultPrevented).toBe(false)
        expect(z.defaultPrevented).toBe(false)
        // 宿主的 ArrowLeft 返回 false:落到输入框原生,不因「认领导航键」被 preventDefault
        expect(left.defaultPrevented).toBe(false)
        expect(hits).toEqual(['left'])
        expect(view.state.selection.main.eq(before)).toBe(true)
        expect(view.state.doc.toString()).toBe('const foo = 1\nfoo + foo\n')
        done()
    })

    it('rename 框里 ⌘S 触发;普通打字仍不外传', async () => {
        const { renameInput } = await import('../../src/lang/tsrename')
        const { view, hits, done } = setup()
        const outer: string[] = []
        const onWin = (e: KeyboardEvent) => outer.push(e.key)
        window.addEventListener('keydown', onWin)
        void renameInput(view, { from: 6, to: 9, name: 'foo' })
        const input = view.dom.querySelector('.cm-rename-input') as HTMLInputElement
        key(input, 'b')
        key(input, 's', { metaKey: true })
        window.removeEventListener('keydown', onWin)
        expect(hits).toEqual(['save'])
        expect(outer).toEqual(['s'])
        done()
    })

    it('编辑区里的宿主键只跑一次(不在冒泡到 view.dom 时再跑)', () => {
        const { view, hits, done } = setup()
        view.focus()
        key(view.contentDOM, 's', { metaKey: true })
        expect(hits).toEqual(['save'])
        done()
    })

    it('浮层自己处理过的键(查找框 Enter)不再交给宿主', () => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        let n = 0
        const view = liteMonaco({ parent, highlighter: hl as never, doc: 'foo foo', lang: 'text', features: QUIET, keymap: [{ key: 'Enter', run: () => (n++, true) }] })
        const input = openFind(view)
        key(input, 'Enter')
        expect(n).toBe(0)
        view.destroy()
        parent.remove()
    })
})
