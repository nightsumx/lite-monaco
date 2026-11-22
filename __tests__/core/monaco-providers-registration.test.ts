// languages.register{Hover,Rename,NewSymbolName,Reference,DocumentHighlight,Implementation,TypeDefinition,Declaration,CodeLens,
// DocumentFormattingEdit,DocumentRangeFormattingEdit,OnTypeFormattingEdit,Link,Color,DocumentSemanticTokens,DocumentRangeSemanticTokens}Provider
// 的注册面:Monaco 签名 / 返回 IDisposable / 进 languageFeatures 注册表 / selector 打分 / hover 补 range 的包装。
// 真实编辑器行为(悬停、F2、Shift+F12…)由各自的 monaco-providers-*.test.ts 覆盖。
import { describe, expect, it } from 'vitest'
import * as monaco from '../../src/index'
import { languageFeatures } from '../../src/lang/languagefeatures'
import { createModel } from '../../src/api/model'

const languages = monaco.languages as unknown as Record<string, (selector: unknown, provider: unknown) => { dispose(): void }>
const noop = () => undefined
const TOKEN = { isCancellationRequested: false, onCancellationRequested: () => ({ dispose() { } }) }

// [register 函数名, 注册表字段, 最小合法 provider]
const CASES: [string, keyof typeof languageFeatures, object][] = [
    ['registerHoverProvider', 'hoverProvider', { provideHover: noop }],
    ['registerRenameProvider', 'renameProvider', { provideRenameEdits: noop }],
    ['registerNewSymbolNameProvider', 'newSymbolNamesProvider', { provideNewSymbolNames: noop }],
    ['registerReferenceProvider', 'referenceProvider', { provideReferences: noop }],
    ['registerDocumentHighlightProvider', 'documentHighlightProvider', { provideDocumentHighlights: noop }],
    ['registerImplementationProvider', 'implementationProvider', { provideImplementation: noop }],
    ['registerTypeDefinitionProvider', 'typeDefinitionProvider', { provideTypeDefinition: noop }],
    ['registerDeclarationProvider', 'declarationProvider', { provideDeclaration: noop }],
    ['registerCodeLensProvider', 'codeLensProvider', { provideCodeLenses: noop }],
    ['registerDocumentFormattingEditProvider', 'documentFormattingEditProvider', { provideDocumentFormattingEdits: noop }],
    ['registerDocumentRangeFormattingEditProvider', 'documentRangeFormattingEditProvider', { provideDocumentRangeFormattingEdits: noop }],
    ['registerOnTypeFormattingEditProvider', 'onTypeFormattingEditProvider', { autoFormatTriggerCharacters: [';'], provideOnTypeFormattingEdits: noop }],
    ['registerLinkProvider', 'linkProvider', { provideLinks: noop }],
    ['registerColorProvider', 'colorProvider', { provideDocumentColors: noop, provideColorPresentations: noop }],
    ['registerDocumentSemanticTokensProvider', 'documentSemanticTokensProvider', { getLegend: () => ({ tokenTypes: ['a'], tokenModifiers: [] }), provideDocumentSemanticTokens: noop, releaseDocumentSemanticTokens: noop }],
    ['registerDocumentRangeSemanticTokensProvider', 'documentRangeSemanticTokensProvider', { getLegend: () => ({ tokenTypes: ['a'], tokenModifiers: [] }), provideDocumentRangeSemanticTokens: noop }],
]

describe('monaco.languages.register*Provider(16 个)', () => {
    for (const [fn, field, provider] of CASES) {
        describe(fn, () => {
            it('monaco.languages 上有同名函数,调用返回 IDisposable', () => {
                expect(typeof languages[fn]).toBe('function')
                const d = languages[fn]('plaintext', provider)
                expect(typeof d.dispose).toBe('function')
                d.dispose()
            })
            it('进 languageFeatures 注册表;selector 不匹配的语言看不见;dispose 后摘掉(重复 dispose 无害)', () => {
                const registry = languageFeatures[field] as unknown as { has(m: unknown): boolean, ordered(m: unknown): unknown[] }
                const plain = createModel('x', 'plaintext')
                const json = createModel('{}', 'json')
                const d = languages[fn]('plaintext', provider)
                expect(registry.has(plain)).toBe(true)
                expect(registry.has(json)).toBe(false)
                d.dispose()
                d.dispose()
                expect(registry.has(plain)).toBe(false)
                plain.dispose()
                json.dispose()
            })
            it('LanguageFilter / 数组 selector:按 Monaco 打分规则命中', () => {
                const registry = languageFeatures[field] as unknown as { has(m: unknown): boolean }
                const m = createModel('x', 'json')
                const a = languages[fn]({ language: 'json' }, provider)
                const b = languages[fn](['css', { language: 'json' }], provider)
                const c = languages[fn]('*', provider)
                expect(registry.has(m)).toBe(true)
                a.dispose(); b.dispose()
                expect(registry.has(m)).toBe(true) // '*' 还在
                c.dispose()
                expect(registry.has(m)).toBe(false)
                m.dispose()
            })
        })
    }

    it('同分 provider:后注册的排前面(Monaco 同分按注册时间倒序)', () => {
        const registry = languageFeatures.referenceProvider
        const m = createModel('x', 'plaintext')
        const p1 = { provideReferences: () => [] }
        const p2 = { provideReferences: () => [] }
        const d1 = languages.registerReferenceProvider('plaintext', p1)
        const d2 = languages.registerReferenceProvider('plaintext', p2)
        expect(registry.ordered(m as never)).toEqual([p2, p1])
        d1.dispose(); d2.dispose(); m.dispose()
    })

    it('registerHoverProvider 包装(同 Monaco standalone):缺 range → 词范围;没有词 → 位置处的空范围;有 range 原样保留', async () => {
        const m = createModel('foo bar', 'plaintext')
        let next: unknown
        const d = languages.registerHoverProvider('plaintext', { provideHover: () => next })
        const [p] = languageFeatures.hoverProvider.ordered(m as never)
        next = { contents: [{ value: 'x' }] }
        expect(await p.provideHover(m as never, new monaco.Position(1, 6), TOKEN as never)).toEqual({ contents: [{ value: 'x' }], range: new monaco.Range(1, 5, 1, 8) })
        const empty = createModel('a  b', 'plaintext')
        const [p2] = languageFeatures.hoverProvider.ordered(m as never)
        next = { contents: [{ value: 'x' }] }
        expect((await p2.provideHover(empty as never, new monaco.Position(1, 3), TOKEN as never))!.range).toEqual(new monaco.Range(1, 3, 1, 3))
        next = { contents: [{ value: 'x' }], range: new monaco.Range(1, 1, 1, 2) }
        expect((await p.provideHover(m as never, new monaco.Position(1, 6), TOKEN as never))!.range).toEqual(new monaco.Range(1, 1, 1, 2))
        next = undefined
        expect(await p.provideHover(m as never, new monaco.Position(1, 6), TOKEN as never)).toBeUndefined()
        d.dispose(); m.dispose(); empty.dispose()
    })

    it('语义 token provider 注册表就是 Monaco 同名字段(已有的 getDocumentSemanticTokens 直接可用)', () => {
        const m = createModel('x', 'plaintext')
        const d = languages.registerDocumentSemanticTokensProvider('plaintext', CASES.find(c => c[0] === 'registerDocumentSemanticTokensProvider')![2])
        expect(languageFeatures.documentSemanticTokensProvider.ordered(m as never)).toHaveLength(1)
        d.dispose(); m.dispose()
    })
})
