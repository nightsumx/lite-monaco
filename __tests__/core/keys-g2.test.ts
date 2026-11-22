// G2 键位:对齐 Monaco 0.52 macOS 实测(/tmp/lc-hunt/g2/mfind.ts、mfind2.ts、mfind4.ts)。
// - 补全显式触发:⌃Space(Monaco 主键)、⌥Esc、⌘I(次键)。⌘Space 第七轮起不再绑(Monaco Mac 没有,⇧⌘Space 是参数提示;
//   r7/monaco-keys-mac.json),见 keys-r7-fix.test.ts
// - ⌘K ⌘I:Show Hover(光标处弹卡)
// - 查找框聚焦时 ⌃G 打开 Go to Line;⌘G / ⇧⌘G 在框里仍是下一个 / 上一个
import { afterEach, describe, expect, it } from 'vitest'
import { setMacPlatform } from './f5-replay'
import type { HoverSource } from '../../src/core/index'
import type { IDisposable } from '../../src/lang/providers'

setMacPlatform()
const { liteMonaco } = await import('../../src/litemonaco')
const core = await import('../../src/core/index')
// 平台在模块加载时定,所以 providers 也得在 setMacPlatform() 之后才 import(静态 import 会提前加载 keymap)
const { registerCompletionItemProvider } = await import('../../src/lang/providers')

const hl = {
    codeToTokens: (code: string) => ({ tokens: code.split('\n').map(l => [{ content: l, offset: 0 }]) }),
    getLastGrammarState: () => ({ getScopes: () => undefined }),
    getLoadedLanguages: () => ['typescript', 'text'],
    getTheme: () => ({ bg: '#1e1e1e', fg: '#d4d4d4', type: 'dark' as const }),
}

function make(doc: string, pos: number, features: Record<string, boolean> = {}, extensions: unknown[] = []) {
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    const view = liteMonaco({
        parent, highlighter: hl as never, doc, lang: 'text', theme: 'dark-plus',
        extensions: extensions as never,
        features: { signatureHelp: false, codeActions: false, tsDiagnostics: false, minimap: false, stickyScroll: false, ...features },
    })
    view.dispatch(view.state.update({ selection: core.EditorSelection.cursor(pos) }))
    view.focus()
    return view
}

const key = (t: EventTarget, init: KeyboardEventInit & { keyCode?: number }) => {
    const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
    if (init.keyCode) Object.defineProperty(e, 'keyCode', { value: init.keyCode })
    t.dispatchEvent(e)
    return e
}
const SPACE = { key: ' ', code: 'Space', keyCode: 32 }
const tick = () => new Promise(r => setTimeout(r, 20))

const disposers: IDisposable[] = []
afterEach(() => { for (const d of disposers.splice(0)) d.dispose(); document.body.replaceChildren() })
const completionOpen = (v: ReturnType<typeof make>) => core.suggestUi(v).state.open

describe('补全显式触发', () => {
    // 宿主 provider(Monaco registerCompletionItemProvider):al → alpha / alpine
    const withProvider = () => {
        disposers.push(registerCompletionItemProvider('*', {
            provideCompletionItems(_m, p) {
                const range = { startLineNumber: p.lineNumber, startColumn: 1, endLineNumber: p.lineNumber, endColumn: p.column }
                return { suggestions: ['alpha', 'alpine'].map(label => ({ label, kind: 17, insertText: label, range })) }
            },
        }))
    }
    for (const [name, init] of [
        ['⌃Space', { ...SPACE, ctrlKey: true }],
        ['⌘I', { key: 'i', code: 'KeyI', keyCode: 73, metaKey: true }],
        ['⌥Esc', { key: 'Escape', code: 'Escape', keyCode: 27, altKey: true }],
    ] as const) {
        it(`${name} 弹补全`, async () => {
            withProvider()
            const v = make('al', 2)
            const e = key(v.contentDOM, init)
            await tick()
            expect(e.defaultPrevented).toBe(true)
            expect(completionOpen(v)).toBe(true)
            v.destroy()
        })
    }
    it('⌘Space 不弹补全(Monaco Mac 没有这个键)', async () => {
        withProvider()
        const v = make('al', 2)
        key(v.contentDOM, { ...SPACE, metaKey: true })
        await tick()
        expect(completionOpen(v)).toBe(false)
        v.destroy()
    })
})

describe('⌘K ⌘I Show Hover', () => {
    it('光标处跑 hover 源并弹卡;⌘K 后的 ⌘I 不当补全', async () => {
        const seen: number[] = []
        const src: HoverSource = (_s, pos) => {
            seen.push(pos)
            return { pos, create: () => { const d = document.createElement('div'); d.className = 'g2-hover'; d.textContent = 'hi'; return d } }
        }
        const v = make('foo bar', 5, { hover: true, autocomplete: true }, [core.hoverSources.of(src)])
        key(v.contentDOM, { key: 'k', code: 'KeyK', keyCode: 75, metaKey: true })
        const e = key(v.contentDOM, { key: 'i', code: 'KeyI', keyCode: 73, metaKey: true })
        await tick()
        expect(e.defaultPrevented).toBe(true)
        expect(seen).toEqual([5])
        expect(document.querySelector('.g2-hover')).not.toBeNull()
        expect(completionOpen(v)).toBe(false)
        v.destroy()
    })
})

describe('查找框里的 ⌃G / ⌘G', () => {
    it('查找框聚焦时 ⌃G 打开 Go to Line,文档 / 选区不动', () => {
        const v = make('foo\nbar\nfoo', 0, { autocomplete: false, hover: false })
        key(v.contentDOM, { key: 'f', code: 'KeyF', keyCode: 70, metaKey: true })
        const input = v.dom.querySelector('textarea[main-field]') as HTMLInputElement
        expect(input).not.toBeNull()
        input.focus()
        const e = key(input, { key: 'g', code: 'KeyG', keyCode: 71, ctrlKey: true })
        expect(e.defaultPrevented).toBe(true)
        const qi = v.dom.querySelector('.cm-quick-input input') as HTMLInputElement | null
        expect(qi?.value).toBe(':')
        expect(v.state.selection.main.head).toBe(0)
        v.destroy()
    })

    it('查找框聚焦时 ⌘G 跳下一个,⇧⌘G 跳上一个(焦点留在框里)', () => {
        const v = make('foo\nbar\nfoo', 0, { autocomplete: false, hover: false })
        key(v.contentDOM, { key: 'f', code: 'KeyF', keyCode: 70, metaKey: true })
        const input = v.dom.querySelector('textarea[main-field]') as HTMLInputElement
        input.focus()
        expect(v.state.field(core.searchField).query).toBe('foo')
        key(input, { key: 'g', code: 'KeyG', keyCode: 71, metaKey: true })
        expect([v.state.selection.main.from, v.state.selection.main.to]).toEqual([0, 3])
        key(input, { key: 'g', code: 'KeyG', keyCode: 71, metaKey: true })
        expect([v.state.selection.main.from, v.state.selection.main.to]).toEqual([8, 11])
        key(input, { key: 'g', code: 'KeyG', keyCode: 71, metaKey: true, shiftKey: true })
        expect([v.state.selection.main.from, v.state.selection.main.to]).toEqual([0, 3])
        expect(v.dom.querySelector('.cm-quick-input')).toBeNull()
        expect(document.activeElement).toBe(input)
        v.destroy()
    })
})
