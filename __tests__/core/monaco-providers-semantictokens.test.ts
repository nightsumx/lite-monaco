// languages.registerDocumentSemanticTokensProvider / registerDocumentRangeSemanticTokensProvider
// → 编辑器语义着色(Monaco DocumentSemanticTokensFeature / ViewportSemanticTokensContribution)。
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { liteMonaco } from '../../src/litemonaco'
import { registerDocumentSemanticTokensProvider, registerDocumentRangeSemanticTokensProvider } from '../../src/lang/providerfeatures'
import { semanticField } from '../../src/lang/providersemantic'
import { defineTheme, setTheme } from '../../src/api/themes'
import type { ScopedShiki as ShikiLike } from '../../src/core/view/tokens'

const fakeHl = () => ({
    codeToTokens: (code: string) => ({ tokens: [[{ content: code }]] }),
    getLastGrammarState: () => ({ getScopes: () => undefined }),
    getLoadedLanguages: () => ['json', 'text'],
    getTheme: () => ({ bg: '#1e1e1e', fg: '#d4d4d4', type: 'dark' as const }),
}) as unknown as ShikiLike
const QUIET = { minimap: false, tsDiagnostics: false, signatureHelp: false, codeActions: false, stickyScroll: false } as const
type V = ReturnType<typeof liteMonaco>
const hosts: HTMLElement[] = []
const views: V[] = []
const disposables: { dispose(): void }[] = []
beforeEach(() => {
    defineTheme('sem-test', { base: 'vs', inherit: true, colors: {}, rules: [
        { token: 'variable', foreground: 'ff0000' },
        { token: 'function.declaration', foreground: '00ff00', fontStyle: 'bold' },
    ] })
    defineTheme('sem-test2', { base: 'vs', inherit: true, colors: {}, rules: [{ token: 'variable', foreground: '0000ff' }] })
    setTheme('sem-test')
})
afterEach(() => {
    while (disposables.length) disposables.pop()!.dispose()
    while (views.length) views.pop()!.destroy()
    while (hosts.length) hosts.pop()!.remove()
    setTheme('vs')
})
function mount(doc: string, enabled: unknown = true): V {
    const host = document.createElement('div')
    document.body.appendChild(host)
    hosts.push(host)
    const v = liteMonaco({ parent: host, doc, lang: 'plaintext', highlighter: fakeHl(), features: QUIET as never, options: { 'semanticHighlighting.enabled': enabled } } as never)
    views.push(v)
    return v
}
const wait = (ms = 20) => new Promise(r => setTimeout(r, ms))
const until = async (fn: () => boolean, ms = 2500) => { const t = Date.now(); while (!fn() && Date.now() - t < ms) await wait(10) }
const spans = (v: V) => v.state.field(semanticField)
const painted = (v: V) => [...v.contentDOM.querySelectorAll<HTMLElement>('.cm-semanticToken')].map(e => [e.textContent, e.style.color, e.style.fontWeight])
const legend = { tokenTypes: ['variable', 'function'], tokenModifiers: ['declaration'] }
// let foo = bar  →  foo(variable) bar(variable)
const TOKENS = new Uint32Array([0, 4, 3, 0, 0, 0, 6, 3, 0, 0])

describe('registerDocumentSemanticTokensProvider', () => {
    it('开着时按主题规则给 token 上色(颜色取 type 的主题规则)', async () => {
        disposables.push(registerDocumentSemanticTokensProvider('plaintext', { getLegend: () => legend, provideDocumentSemanticTokens: () => ({ data: TOKENS }), releaseDocumentSemanticTokens: () => { } }))
        const v = mount('let foo = bar')
        await until(() => spans(v).length === 2)
        expect(spans(v).map(s => [v.state.sliceDoc(s.from, s.to)])).toEqual([['foo'], ['bar']])
        await until(() => painted(v).length === 2)
        expect(painted(v).map(p => [p[0], p[1]])).toEqual([['foo', 'rgb(255, 0, 0)'], ['bar', 'rgb(255, 0, 0)']])
    })

    it('modifier 参与规则匹配(function.declaration → 绿色 + 粗体)', async () => {
        disposables.push(registerDocumentSemanticTokensProvider('plaintext', {
            getLegend: () => legend, releaseDocumentSemanticTokens: () => { },
            provideDocumentSemanticTokens: () => ({ data: new Uint32Array([0, 4, 3, 1, 1]) }),
        }))
        const v = mount('let foo = bar')
        await until(() => painted(v).length === 1)
        expect(painted(v)).toEqual([['foo', 'rgb(0, 255, 0)', 'bold']])
    })

    it('默认(configuredByTheme,standalone 主题恒 false)不着色,不去问 provider', async () => {
        let calls = 0
        disposables.push(registerDocumentSemanticTokensProvider('plaintext', { getLegend: () => legend, provideDocumentSemanticTokens: () => { calls++; return { data: TOKENS } }, releaseDocumentSemanticTokens: () => { } }))
        const v = mount('let foo = bar', 'configuredByTheme')
        await wait(500)
        expect(spans(v)).toHaveLength(0)
        expect(calls).toBe(0)
    })

    it('运行时 updateOptions 开 / 关', async () => {
        disposables.push(registerDocumentSemanticTokensProvider('plaintext', { getLegend: () => legend, provideDocumentSemanticTokens: () => ({ data: TOKENS }), releaseDocumentSemanticTokens: () => { } }))
        const v = mount('let foo = bar', false)
        await wait(400)
        expect(spans(v)).toHaveLength(0)
        v.updateOptions({ 'semanticHighlighting.enabled': true } as never)
        await until(() => spans(v).length === 2)
        expect(spans(v)).toHaveLength(2)
        v.updateOptions({ 'semanticHighlighting.enabled': false } as never)
        await until(() => spans(v).length === 0)
        expect(spans(v)).toHaveLength(0)
    })

    it('注销 provider 后清掉着色', async () => {
        const d = registerDocumentSemanticTokensProvider('plaintext', { getLegend: () => legend, provideDocumentSemanticTokens: () => ({ data: TOKENS }), releaseDocumentSemanticTokens: () => { } })
        const v = mount('let foo = bar')
        await until(() => spans(v).length === 2)
        d.dispose()
        await until(() => spans(v).length === 0)
        expect(spans(v)).toHaveLength(0)
    })

    it('改文档:颜色随编辑平移,防抖后重新取数', async () => {
        let calls = 0
        let doc = 'let foo = bar'
        disposables.push(registerDocumentSemanticTokensProvider('plaintext', {
            getLegend: () => legend, releaseDocumentSemanticTokens: () => { },
            provideDocumentSemanticTokens: m => {
                calls++
                doc = (m as unknown as { getValue(): string }).getValue()
                const data: number[] = []
                let prev = 0
                for (const x of doc.matchAll(/\b(foo|bar)\b/g)) { data.push(0, x.index! - prev, 3, 0, 0); prev = x.index! }
                return { data: new Uint32Array(data) }
            },
        }))
        const v = mount('let foo = bar')
        await until(() => spans(v).length === 2)
        const n = calls
        v.executeEdits('t', [{ range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }, text: 'XX' }])
        // 编辑立刻生效:原有 span 平移,不闪
        expect(spans(v).map(s => v.state.sliceDoc(s.from, s.to))).toEqual(['foo', 'bar'])
        await until(() => calls > n)
        await until(() => spans(v).length === 2)
        expect(doc).toBe('XXlet foo = bar')
        expect(spans(v).map(s => v.state.sliceDoc(s.from, s.to))).toEqual(['foo', 'bar'])
    })

    it('provider.onDidChange 触发重取', async () => {
        let calls = 0
        const listeners: (() => void)[] = []
        disposables.push(registerDocumentSemanticTokensProvider('plaintext', {
            getLegend: () => legend, releaseDocumentSemanticTokens: () => { },
            onDidChange: l => { listeners.push(l); return { dispose() { } } },
            provideDocumentSemanticTokens: () => { calls++; return { data: calls === 1 ? TOKENS : new Uint32Array([0, 4, 3, 0, 0]) } },
        }))
        const v = mount('let foo = bar')
        await until(() => spans(v).length === 2)
        listeners.forEach(l => l())
        await until(() => spans(v).length === 1)
        expect(spans(v)).toHaveLength(1)
    })

    it('带 resultId 的 edits 增量打在上一份数据上', async () => {
        let call = 0
        disposables.push(registerDocumentSemanticTokensProvider('plaintext', {
            getLegend: () => legend, releaseDocumentSemanticTokens: () => { },
            provideDocumentSemanticTokens: () => {
                call++
                return call === 1
                    ? { resultId: 'r1', data: TOKENS }
                    : { resultId: 'r2', edits: [{ start: 5, deleteCount: 5, data: new Uint32Array() }] } as never
            },
        }))
        const v = mount('let foo = bar')
        await until(() => spans(v).length === 2)
        v.executeEdits('t', [{ range: { startLineNumber: 1, startColumn: 14, endLineNumber: 1, endColumn: 14 }, text: ' ' }])
        await until(() => spans(v).length === 1)
        expect(spans(v).map(s => v.state.sliceDoc(s.from, s.to))).toEqual(['foo'])
    })

    it('主题切换后重取并换色', async () => {
        disposables.push(registerDocumentSemanticTokensProvider('plaintext', { getLegend: () => legend, provideDocumentSemanticTokens: () => ({ data: TOKENS }), releaseDocumentSemanticTokens: () => { } }))
        const v = mount('let foo = bar')
        await until(() => painted(v).length === 2)
        setTheme('sem-test2')
        await until(() => painted(v)[0]?.[1] === 'rgb(0, 0, 255)')
        expect(painted(v)[0][1]).toBe('rgb(0, 0, 255)')
    })

    it('model 的语言不匹配 provider 时不取数', async () => {
        let calls = 0
        disposables.push(registerDocumentSemanticTokensProvider('json', { getLegend: () => legend, provideDocumentSemanticTokens: () => { calls++; return { data: TOKENS } }, releaseDocumentSemanticTokens: () => { } }))
        mount('let foo = bar')
        await wait(500)
        expect(calls).toBe(0)
    })
})

describe('registerDocumentRangeSemanticTokensProvider', () => {
    it('没有整篇 provider 时按可视区取局部 token', async () => {
        const asked: unknown[] = []
        disposables.push(registerDocumentRangeSemanticTokensProvider('plaintext', {
            getLegend: () => legend,
            provideDocumentRangeSemanticTokens: (_m, range) => { asked.push(range); return { data: TOKENS } },
        }))
        const v = mount('let foo = bar')
        v.getVisibleRangesPlusViewportAboveBelow = () => [{ startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 14 }] as never
        await until(() => spans(v).length === 2)
        expect(asked.length).toBeGreaterThan(0)
        expect(spans(v).map(s => v.state.sliceDoc(s.from, s.to))).toEqual(['foo', 'bar'])
    })

    it('整篇 provider 同时存在时整篇优先,不再走 range', async () => {
        let rangeCalls = 0
        disposables.push(registerDocumentRangeSemanticTokensProvider('plaintext', { getLegend: () => legend, provideDocumentRangeSemanticTokens: () => { rangeCalls++; return { data: new Uint32Array([0, 0, 3, 0, 0]) } } }))
        disposables.push(registerDocumentSemanticTokensProvider('plaintext', { getLegend: () => legend, provideDocumentSemanticTokens: () => ({ data: TOKENS }), releaseDocumentSemanticTokens: () => { } }))
        const v = mount('let foo = bar')
        v.getVisibleRangesPlusViewportAboveBelow = () => [{ startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 14 }] as never
        await until(() => spans(v).length === 2)
        await wait(400)
        expect(spans(v).map(s => v.state.sliceDoc(s.from, s.to))).toEqual(['foo', 'bar'])
        void rangeCalls
    })
})
