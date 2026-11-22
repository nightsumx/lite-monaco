// editor.action.quickOutline(⌘⇧O,@ / @:):所有有 outline 的语言
import { afterEach, describe, expect, it } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { EditorView } from '../../src/core/view/editorview'
import {
    fuzzyMatch, hasLanguageOutline, languageOutlineSymbols, openQuickOutline, quickOutlineForLanguage, symbolPicks, SymbolKind,
    type OutlineSymbol,
} from '../../src/lang/quickoutline'
import { createTSActions, runTsCommand } from '../../src/lang/tsactions'
import { liteMonaco } from '../../src/litemonaco'
import type { ScopedShiki as ShikiLike } from '../../src/core/view/tokens'

const fakeHl = () => ({
    codeToTokens: (code: string) => ({ tokens: [[{ content: code }]] }),
    getLastGrammarState: () => ({ getScopes: () => undefined }),
    getLoadedLanguages: () => ['json', 'text'],
    getTheme: () => ({ bg: '#1e1e1e', fg: '#d4d4d4', type: 'dark' as const }),
}) as unknown as ShikiLike
const QUIET = { minimap: false, autocomplete: false, tsDiagnostics: false, hover: false, signatureHelp: false, codeActions: false, stickyScroll: false } as const

const SLOW = 60_000
afterEach(() => { document.querySelectorAll('.cm-quick-input').forEach(n => n.remove()) })

const mk = (name: string, kind: number, container = '', from = 0): OutlineSymbol => ({ name, kind, container, from, to: from + 10, sel: from })

describe('symbolPicks', () => {
    const syms = [mk('alpha', SymbolKind.Function, '', 0), mk('Beta', SymbolKind.Class, '', 20), mk('gamma', SymbolKind.Function, 'Beta', 40), mk('method', SymbolKind.Method, 'Beta', 60)]
    it('@:空查询 → 一条 "symbols (n)" 分组线在首行,保持文档顺序', () => {
        const { items } = symbolPicks(syms, '')
        expect(items.map(i => i.label)).toEqual(['alpha', 'Beta', 'gamma', 'method'])
        expect(items[0].separator).toBe('symbols (4)')
        expect(items.slice(1).every(i => i.separator === undefined)).toBe(true)
    })
    it('过滤:模糊匹配 + 高亮区间,按分数排序', () => {
        const { items } = symbolPicks(syms, 'ga')
        expect(items.map(i => i.label)).toEqual(['gamma'])
        expect(items[0].highlights).toEqual([[0, 2]])
        expect(items[0].description).toBe('Beta')
    })
    it('@: → 按类别分组,类别 localeCompare 排序,每组首行带 "classes (1)" 之类', () => {
        const { items } = symbolPicks(syms, ':')
        expect(items.map(i => i.label)).toEqual(['Beta', 'alpha', 'gamma', 'method'])
        expect(items.filter(i => i.separator).map(i => i.separator)).toEqual(['classes (1)', 'functions (2)', 'methods (1)'])
    })
    it('@:fu → 类别分组 + 过滤', () => {
        const { items } = symbolPicks([mk('fun1', SymbolKind.Function), mk('fun2', SymbolKind.Function), mk('other', SymbolKind.Class)], ':fu')
        expect(items.map(i => i.label)).toEqual(['fun1', 'fun2'])
        expect(items[0].separator).toBe('functions (2)')
    })
    it('带空格:第一段匹配符号名,其余匹配容器名', () => {
        expect(symbolPicks(syms, 'method Beta').items.map(i => i.label)).toEqual(['method'])
        expect(symbolPicks(syms, 'method Zzz').items).toEqual([])
    })
    it('fuzzyMatch:子序列 / 词首', () => {
        expect(fuzzyMatch('getUserName', 'gun')).toBeDefined()
        expect(fuzzyMatch('getUserName', 'xyz')).toBeUndefined()
    })
})

describe('openQuickOutline(面板)', () => {
    function setup(doc = 'aaa\nbbb\nccc\n', head = 0) {
        const host = document.createElement('div')
        document.body.appendChild(host)
        const view = new EditorView({ state: EditorState.create({ doc, selection: { anchor: head } }), parent: host })
        return { view, done: () => { view.destroy(); host.remove() } }
    }
    const syms = [mk('aaa', SymbolKind.Function, '', 0), mk('bbb', SymbolKind.Function, '', 4), mk('ccc', SymbolKind.Class, '', 8)]
    const rows = () => [...document.querySelectorAll('.cm-quick-input-row')]
    const type = (v: string) => {
        const input = document.querySelector('.cm-quick-input-input') as HTMLInputElement
        input.value = v
        input.dispatchEvent(new Event('input', { bubbles: true }))
    }
    it('输入框以 @ 开头;列出全部;首行分组线 symbols (3)', () => {
        const s = setup()
        void openQuickOutline(s.view, syms)
        expect((document.querySelector('.cm-quick-input-input') as HTMLInputElement).value).toBe('@')
        expect(rows().map(r => r.querySelector('.cm-quick-input-label')!.textContent)).toEqual(['aaa', 'bbb', 'ccc'])
        expect(rows()[0].querySelector('.cm-quick-input-separator')!.textContent).toBe('symbols (3)')
        s.done()
    })
    it('空查询:焦点落在包着光标的符号', () => {
        const s = setup('aaa\nbbb\nccc\n', 9)
        void openQuickOutline(s.view, syms)
        expect(rows().findIndex(r => r.classList.contains('focused'))).toBe(2)
        s.done()
    })
    it('@: 打开:直接按类别分组', () => {
        const s = setup()
        void openQuickOutline(s.view, syms, '@:')
        expect(rows().map(r => r.querySelector('.cm-quick-input-separator')?.textContent ?? '')).toEqual(['classes (1)', 'functions (2)', ''])
        s.done()
    })
    it('Enter 跳到符号名开头;Esc 不动;没有匹配 → 提示行', async () => {
        const s = setup()
        const p = openQuickOutline(s.view, syms)
        type('@bb')
        const input = document.querySelector('.cm-quick-input-input') as HTMLInputElement
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        expect(await p).toBe(true)
        expect(s.view.state.selection.main.head).toBe(4)
        const p2 = openQuickOutline(s.view, syms)
        type('@zzz')
        expect(rows().map(r => r.textContent)).toEqual(['No matching editor symbols'])
        ;(document.querySelector('.cm-quick-input-input') as HTMLInputElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        expect(await p2).toBe(false)
        expect(s.view.state.selection.main.head).toBe(4)
        s.done()
    })
    it('没有符号 → resolve false(面板显示 No editor symbols)', async () => {
        const s = setup()
        const p = openQuickOutline(s.view, [])
        expect(await p).toBe(false)
        s.done()
    })
})

describe('非 TS 语言的符号', () => {
    it('json:key 名 / 数组下标,按值类型定类别,容器是父键', () => {
        const syms = languageOutlineSymbols('json', '{ "a": { "b": [1, true] }, "c": "x" }')!
        expect(syms.map(s => [s.name, s.container])).toEqual([['a', ''], ['b', 'a'], ['0', 'b'], ['1', 'b'], ['c', '']])
        const kinds = Object.fromEntries(syms.map(s => [s.name, s.kind]))
        expect(kinds.a).toBe(SymbolKind.Module)
        expect(kinds.b).toBe(SymbolKind.Array)
        expect(kinds.c).toBe(SymbolKind.String)
        expect(kinds['1']).toBe(SymbolKind.Boolean)
    })
    it('css:选择器 / @media / scss 变量', () => {
        const syms = languageOutlineSymbols('scss', '$x: 1;\n.a { color: red }\n@media print { .b { top: 0 } }\n')!
        const by = Object.fromEntries(syms.map(s => [s.name, s.kind]))
        expect(by.$x).toBe(SymbolKind.Variable)
        expect(by['.a']).toBe(SymbolKind.Class)
        expect(by['@media print']).toBe(SymbolKind.Module)
    })
    it('html:标签 + #id + .class,容器是外层元素', () => {
        const syms = languageOutlineSymbols('html', '<div id="m" class="a b"><p>x</p></div>')!
        expect(syms.map(s => s.name)).toEqual(['div#m.a.b', 'p'])
        expect(syms[1].container).toBe('div#m.a.b')
    })
    it('hasLanguageOutline', () => {
        expect(hasLanguageOutline('json')).toBe(true)
        expect(hasLanguageOutline('python')).toBe(false)
    })
    it('quickOutlineForLanguage 打开面板并跳转', async () => {
        const host = document.createElement('div')
        document.body.appendChild(host)
        const doc = '{\n  "one": 1,\n  "two": 2\n}'
        const view = new EditorView({ state: EditorState.create({ doc }), parent: host })
        const p = quickOutlineForLanguage(view, 'json')
        const input = document.querySelector('.cm-quick-input-input') as HTMLInputElement
        input.value = '@two'
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        expect(await p).toBe(true)
        expect(view.state.selection.main.head).toBe(doc.indexOf('"two"'))
        view.destroy(); host.remove()
    })
    it('liteMonaco(json):⌘⇧O 绑定在 + 命令面板有 Go to Symbol / @ 行', () => {
        const host = document.createElement('div')
        document.body.appendChild(host)
        const view = liteMonaco({ parent: host, doc: '{"a":1}', lang: 'json', highlighter: fakeHl(), features: QUIET })
        // Mod = Mac 上 ⌘、其余 Ctrl:两种都发一遍
        for (const mod of [{ ctrlKey: true }, { metaKey: true }])
            view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'O', code: 'KeyO', shiftKey: true, bubbles: true, cancelable: true, ...mod }))
        expect(document.querySelector('.cm-quick-input') !== null).toBe(true)
        view.destroy(); host.remove()
    })
})

describe('TS:outlineSymbols / editor.action.quickOutline', () => {
    it('kind 与容器照 Monaco outlineTypeTable;runTsCommand 能触发', async () => {
        const host = document.createElement('div')
        document.body.appendChild(host)
        const doc = 'export class Box {\n  size = 1\n  grow() { return 2 }\n}\nexport function make() {}\nexport const k = 1\n'
        const view = new EditorView({ state: EditorState.create({ doc }), parent: host })
        const actions = createTSActions({ lang: 'typescript', fileName: '/t-outline.ts' })
        const syms = await actions.outlineSymbols(view)
        const by = Object.fromEntries(syms.map(s => [s.name, s]))
        expect(by.Box.kind).toBe(SymbolKind.Class)
        expect(by.Box.container).toBe('')
        expect(by.size.kind).toBe(SymbolKind.Property)
        expect(by.size.container).toBe('Box')
        expect(by.grow.kind).toBe(SymbolKind.Method)
        expect(by.make.kind).toBe(SymbolKind.Function)
        expect(by.k.kind).toBe(SymbolKind.Variable)
        const p = runTsCommand(actions, 'editor.action.quickOutline', view)
        const end = Date.now() + 20_000
        while (Date.now() < end && !document.querySelector('.cm-quick-input')) await new Promise(r => setTimeout(r, 30))
        expect(document.querySelector('.cm-quick-input')).not.toBeNull()
        ;(document.querySelector('.cm-quick-input-input') as HTMLInputElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        await p
        view.destroy(); host.remove()
    }, SLOW)
})
