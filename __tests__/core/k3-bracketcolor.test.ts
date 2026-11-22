// K3:bracketPairColorization.enabled / independentColorPoolPerBracketType + maxTokenizationLineLength
import { describe, expect, it } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { editorOptions, type IEditorOptions } from '../../src/core/options'
import { bracketColorDecorations } from '../../src/core/feature/bracketcolor'
import { bracketSpans } from '../../src/core/edit/brackets'
import { ensureTokenCache, cachedRelTokens, selectTokenCache, ensureTokenizedRange, setMaxTokenizationLineLength, type ScopedShiki } from '../../src/core/view/tokens'

const hl = {
    codeToTokens: (code: string) => ({ tokens: [[{ content: code, offset: 0 }]] }),
    getLastGrammarState: () => ({ getScopes: () => undefined }),
    getLoadedLanguages: () => ['ts'],
} as unknown as ScopedShiki
const opts = { lang: 'ts', theme: 't' }
const PALETTE = ['c0', 'c1', 'c2', 'c3']

function colors(doc: string, options: IEditorOptions) {
    const state = EditorState.create({ doc, extensions: [editorOptions.of(options)] })
    const out: string[] = []
    bracketColorDecorations(hl, state, opts, PALETTE).between(0, doc.length, (f, _t, v) => {
        out.push(`${doc[f]}:${(v as { spec?: { attributes?: { style?: string } } }).spec?.attributes?.style?.replace('color:', '')}`)
    })
    return out
}

describe('bracketPairColorization', () => {
    it('默认:按总嵌套深度取色', () => {
        expect(colors('([{}])', {})).toEqual(['(:c0', '[:c1', '{:c2', '}:c2', ']:c1', '):c0'])
    })
    it('enabled=false:不着色', () => {
        expect(colors('([{}])', { bracketPairColorization: { enabled: false } })).toEqual([])
    })
    it('independentColorPoolPerBracketType:每种括号各数各的层数', () => {
        expect(colors('([{}])', { bracketPairColorization: { independentColorPoolPerBracketType: true } }))
            .toEqual(['(:c0', '[:c0', '{:c0', '}:c0', ']:c0', '):c0'])
        expect(colors('((([])))', { bracketPairColorization: { independentColorPoolPerBracketType: true } }))
            .toEqual(['(:c0', '(:c1', '(:c2', '[:c0', ']:c0', '):c2', '):c1', '):c0'])
    })
    it('bracketSpans 直接:独立池时同类嵌套才加深', () => {
        expect(bracketSpans('({()})', 0, undefined, true).map(s => s.depth)).toEqual([0, 0, 1, 1, 0, 0])
        expect(bracketSpans('({()})', 0).map(s => s.depth)).toEqual([0, 1, 2, 2, 1, 0])
    })
})

describe('maxTokenizationLineLength', () => {
    const tokensOf = (limit: number | undefined, line: string) => {
        const owner = {}
        if (limit !== undefined) setMaxTokenizationLineLength(owner, limit)
        selectTokenCache(owner)
        let called = 0
        const spy = { ...hl, codeToTokens: (code: string) => { called++; return { tokens: [[{ content: code, offset: 0 }]] } } } as unknown as ScopedShiki
        ensureTokenCache(spy, [line], opts)
        ensureTokenizedRange(1, 1)
        void cachedRelTokens
        return called
    }
    it('默认 20000:短行交给 grammar', () => { expect(tokensOf(undefined, 'a'.repeat(100))).toBeGreaterThan(0) })
    it('默认 20000:20000 及以上的行不交给 grammar', () => { expect(tokensOf(undefined, 'a'.repeat(20000))).toBe(0) })
    it('调小:超过的行不分词', () => {
        expect(tokensOf(10, 'a'.repeat(50))).toBe(0)
        expect(tokensOf(100, 'a'.repeat(50))).toBeGreaterThan(0)
    })
    it('超长行的括号不着色(上限按选项)', () => {
        const doc = ['(a)', '(' + 'x'.repeat(30) + ')', '[b]'].join('\n')
        const run = (options: IEditorOptions) => {
            const state = EditorState.create({ doc, extensions: [editorOptions.of(options)] })
            let n = 0
            bracketColorDecorations(hl, state, opts, PALETTE).between(0, doc.length, () => { n++ })
            return n
        }
        expect(run({})).toBe(6)
        expect(run({ maxTokenizationLineLength: 20 } as never)).toBe(4)
        expect(run({})).toBe(6) // 默认缓存没被上一次的上限带偏
    })
})
