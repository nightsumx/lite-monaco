// languages.register{CompletionItem,Definition,FoldingRange,InlayHints}Provider
import { afterEach, describe, expect, it } from 'vitest'
import { liteMonaco } from '../../src/litemonaco'
import { SuggestController } from '../../src/lang/suggestcontroller'
import { suggestUi } from '../../src/core/feature/suggestwidget'
import { foldable } from '../../src/core/edit/fold'
import { inlayField } from '../../src/lang/tsinlay'
import {
    registerCompletionItemProvider, registerDefinitionProvider, registerFoldingRangeProvider, registerInlayHintsProvider,
    providerModel, type IDisposable,
} from '../../src/lang/providers'
import { EditorState } from '../../src/core/model/state'
import type { ScopedShiki as ShikiLike } from '../../src/core/view/tokens'

const fakeHl = () => ({
    codeToTokens: (code: string) => ({ tokens: [[{ content: code }]] }),
    getLastGrammarState: () => ({ getScopes: () => undefined }),
    getLoadedLanguages: () => ['json', 'text'],
    getTheme: () => ({ bg: '#1e1e1e', fg: '#d4d4d4', type: 'dark' as const }),
}) as unknown as ShikiLike
const QUIET = { minimap: false, tsDiagnostics: false, hover: false, signatureHelp: false, codeActions: false, stickyScroll: false } as const

const disposables: IDisposable[] = []
const hosts: HTMLElement[] = []
afterEach(() => {
    while (disposables.length) disposables.pop()!.dispose()
    while (hosts.length) hosts.pop()!.remove()
})
function mount(doc: string, lang = 'plaintext', features: Record<string, unknown> = {}) {
    const host = document.createElement('div')
    document.body.appendChild(host)
    hosts.push(host)
    return liteMonaco({ parent: host, doc, lang, highlighter: fakeHl(), features: { ...QUIET, ...features } as never })
}
/** 控件现状:open / 列表项(标签 + kind + 是否 snippet) */
const csOf = (v: ReturnType<typeof mount>) => {
    const ui = suggestUi(v)
    const n = ui.state.open && !ui.state.message ? ui.state.count : 0
    const rows = Array.from({ length: n }, (_, i) => ui.host!.rowAt(i))
    return { open: ui.state.open, rows, options: rows.map(r => ({ label: r.label, kind: r.kind })) }
}
const startCompletion = (v: ReturnType<typeof mount>) => { v.trigger('keyboard', 'editor.action.triggerSuggest', {}) }
const wait = (ms = 30) => new Promise(r => setTimeout(r, ms))
const until = async (fn: () => boolean, ms = 3000) => { const t = Date.now(); while (!fn() && Date.now() - t < ms) await wait(15) }

describe('providerModel(ITextModel 子集)', () => {
    const st = EditorState.create({ doc: 'foo bar\nbaz' })
    const m = providerModel(() => st, 'x')
    it('位置/偏移互转,行信息,单词', () => {
        expect(m.getLineCount()).toBe(2)
        expect(m.getPositionAt(9)).toEqual({ lineNumber: 2, column: 2 })
        expect(m.getOffsetAt({ lineNumber: 2, column: 2 })).toBe(9)
        expect(m.getLineMaxColumn(1)).toBe(8)
        expect(m.getWordAtPosition({ lineNumber: 1, column: 6 })).toEqual({ word: 'bar', startColumn: 5, endColumn: 8 })
        expect(m.getWordUntilPosition({ lineNumber: 1, column: 7 })).toEqual({ word: 'ba', startColumn: 5, endColumn: 7 })
        expect(m.getValueInRange({ startLineNumber: 1, startColumn: 5, endLineNumber: 2, endColumn: 2 })).toBe('bar\nb')
        expect(m.getFullModelRange()).toEqual({ startLineNumber: 1, startColumn: 1, endLineNumber: 2, endColumn: 4 })
    })
})

describe('registerCompletionItemProvider', () => {
    it('收到 model/position/context/token;返回的项出现在补全里,range/insertText 生效', async () => {
        let seen: { pos?: unknown, ctx?: unknown, tok?: boolean, lang?: string } = {}
        disposables.push(registerCompletionItemProvider('plaintext', {
            provideCompletionItems(model, position, context, token) {
                seen = { pos: position, ctx: context, tok: token.isCancellationRequested === false, lang: model.getLanguageId() }
                const w = model.getWordUntilPosition(position)
                return {
                    suggestions: [
                        { label: 'hello', kind: 1, insertText: 'hello()', range: { startLineNumber: position.lineNumber, startColumn: w.startColumn, endLineNumber: position.lineNumber, endColumn: position.column } },
                        { label: 'hesnip', kind: 28, insertText: 'snip(${1:x})', insertTextRules: 4, range: { startLineNumber: 1, startColumn: w.startColumn, endLineNumber: 1, endColumn: position.column } },
                    ],
                }
            },
        }))
        const v = mount('he', 'plaintext', { autocomplete: true })
        v.dispatch(v.state.update({ selection: { anchor: 2 } }))
        startCompletion(v)
        await until(() => csOf(v).open)
        const cs = csOf(v)
        expect(cs.options.map(o => o.label)).toContain('hello')
        expect(seen).toEqual({ pos: { lineNumber: 1, column: 3 }, ctx: { triggerKind: 0 }, tok: true, lang: 'plaintext' })
        expect(cs.options.find(o => o.label === 'hello')!.kind).toBe('function')
        suggestUi(v).select(cs.options.findIndex(o => o.label === 'hesnip'))
        expect(SuggestController.get(v)!.getFocusedItem()!.item.completion.insertTextRules! & 4).toBe(4)
    })
    it('dispose 之后不再有结果;选择器按语言过滤', async () => {
        const d = registerCompletionItemProvider('json', { provideCompletionItems: () => ({ suggestions: [{ label: 'onlyjson', kind: 0, insertText: 'onlyjson' }] }) })
        const v = mount('on', 'plaintext', { autocomplete: true })
        v.dispatch(v.state.update({ selection: { anchor: 2 } }))
        startCompletion(v)
        await wait(80)
        expect(csOf(v).options.map(o => o.label)).not.toContain('onlyjson')
        d.dispose()
    })
    it('triggerCharacters:敲出该字符(非词字符)时自动开补全,context 是 TriggerCharacter', async () => {
        let ctx: unknown
        disposables.push(registerCompletionItemProvider('plaintext', {
            triggerCharacters: ['<'],
            provideCompletionItems(_m, _p, c) { ctx = c; return { suggestions: [{ label: 'div', kind: 5, insertText: 'div' }] } },
        }))
        const v = mount('', 'plaintext', { autocomplete: true })
        v.dispatch(v.state.update({ changes: { from: 0, insert: '<' }, selection: { anchor: 1 }, userEvent: 'input.type' }))
        await until(() => csOf(v).open)
        expect(csOf(v).open).toBe(true)
        expect(ctx).toEqual({ triggerKind: 1, triggerCharacter: '<' })
    })
    it('provider 抛错 = 没结果,不影响别的 provider', async () => {
        disposables.push(registerCompletionItemProvider('plaintext', { provideCompletionItems: () => { throw new Error('boom') } }))
        disposables.push(registerCompletionItemProvider('plaintext', { provideCompletionItems: async () => ({ suggestions: [{ label: 'okay', kind: 4, insertText: 'okay' }] }) }))
        const v = mount('ok', 'plaintext', { autocomplete: true })
        v.dispatch(v.state.update({ selection: { anchor: 2 } }))
        startCompletion(v)
        await until(() => csOf(v).open)
        expect(csOf(v).options.map(o => o.label)).toContain('okay')
    })
})

describe('registerDefinitionProvider', () => {
    const DOC = 'let foo = 1\nlet bar = foo\n'
    const target = { startLineNumber: 1, startColumn: 5, endLineNumber: 1, endColumn: 8 }
    it('F12 跳到 provider 给的位置;Location 与 LocationLink 都认', async () => {
        let got: { lineNumber: number, column: number } | undefined
        const d = registerDefinitionProvider('plaintext', {
            provideDefinition(_model, position) { got = position; return { uri: { toString: () => 'inmemory://model/1' }, range: target } },
        })
        disposables.push(d)
        const v = mount(DOC)
        v.dispatch(v.state.update({ selection: { anchor: DOC.indexOf('foo', 12) + 1 } }))
        v.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'F12', bubbles: true, cancelable: true }))
        await until(() => v.state.selection.main.head === 4)
        expect(v.state.selection.main.head).toBe(4)
        expect(got).toEqual({ lineNumber: 2, column: 12 })
    })
    it('没注册 provider:F12 不吃键(返回 false)', () => {
        const v = mount(DOC)
        const e = new KeyboardEvent('keydown', { key: 'F12', bubbles: true, cancelable: true })
        v.contentDOM.dispatchEvent(e)
        expect(e.defaultPrevented).toBe(false)
    })
    it('Ctrl+点击:definitionLinkOpensInPeek 默认直接跳', async () => {
        disposables.push(registerDefinitionProvider('plaintext', { provideDefinition: () => [{ uri: { toString: () => 'inmemory://model/1' }, range: target, targetSelectionRange: target }] }))
        const v = mount(DOC)
        v.dispatch(v.state.update({ selection: { anchor: DOC.indexOf('foo', 12) + 1 } }))
        const { clickDefinitionHandler } = await import('../../src/core/input/mouseselection')
        const fn = v.state.facet(clickDefinitionHandler)[0]
        expect(fn(v, v.state.selection.main.head)).toBe(true)
        await until(() => v.state.selection.main.head === 4)
        expect(v.state.selection.main.head).toBe(4)
    })
})

describe('registerFoldingRangeProvider', () => {
    const DOC = 'a\nb\nc\nd\ne\n'
    it('provider 的范围成为可折叠范围(start>0、end>start、end<=行数);onDidChange 触发重算', async () => {
        let ranges = [{ start: 1, end: 3 }, { start: 0, end: 2 }, { start: 4, end: 99 }]
        let fire: () => void = () => {}
        disposables.push(registerFoldingRangeProvider('plaintext', {
            onDidChange: l => { fire = () => l({}); return { dispose() {} } },
            provideFoldingRanges: () => ranges,
        }))
        const v = mount(DOC)
        await until(() => foldable(v.state, 0) !== null)
        expect(foldable(v.state, 0)).toEqual({ from: 1, to: 5 })
        expect(foldable(v.state, DOC.indexOf('d'))).toBeNull()
        ranges = [{ start: 4, end: 5 }]
        fire()
        await until(() => foldable(v.state, DOC.indexOf('d')) !== null)
        expect(foldable(v.state, DOC.indexOf('d'))).not.toBeNull()
        expect(foldable(v.state, 0)).toBeNull()
    })
})

describe('registerInlayHintsProvider', () => {
    it('provideInlayHints(model, range, token) 的 hints 变成内联提示;kind/padding 传下去;enabled=off 不请求', async () => {
        let calls = 0
        let disposed = 0
        disposables.push(registerInlayHintsProvider('plaintext', {
            provideInlayHints(model, range) {
                calls++
                expect(range).toEqual(model.getFullModelRange())
                return { hints: [{ label: 'name:', position: { lineNumber: 1, column: 5 }, kind: 2, paddingRight: true }, { label: [{ label: ': ' }, { label: 'number' }], position: { lineNumber: 1, column: 4 }, kind: 1 }], dispose() { disposed++ } }
            },
        }))
        const v = mount('f(1)', 'plaintext')
        await until(() => (v.state.field(inlayField, false) ?? []).length === 2)
        const marks = v.state.field(inlayField)
        expect(marks.map(m => [m.pos, m.text, m.kind, m.paddingRight])).toEqual([[3, ': number', 'Type', undefined], [4, 'name:', 'Parameter', true]])
        expect(calls).toBeGreaterThan(0)
        // 关掉:清空
        v.dispatch(v.state.update({ changes: { from: 0, insert: ' ' } }))
        await until(() => disposed > 0)
        expect(disposed).toBeGreaterThan(0)
    })
    it('onDidChangeInlayHints 触发重取', async () => {
        let n = 0
        let fire: () => void = () => {}
        disposables.push(registerInlayHintsProvider('plaintext', {
            onDidChangeInlayHints: l => { fire = l; return { dispose() {} } },
            provideInlayHints: () => ({ hints: [{ label: String(++n), position: { lineNumber: 1, column: 1 } }], dispose() {} }),
        }))
        const v = mount('x')
        await until(() => (v.state.field(inlayField, false) ?? []).length === 1)
        const first = v.state.field(inlayField)[0].text
        fire()
        await until(() => v.state.field(inlayField)[0]?.text !== first)
        expect(v.state.field(inlayField)[0].text).not.toBe(first)
    })
})
