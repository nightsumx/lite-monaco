// languages.setTokensProvider / setMonarchTokensProvider / registerTokensProviderFactory / setColorMap / onLanguage:
// 注册 → 注册表有分词器 → 真编辑器渲染出对应颜色。数值对照 Monaco 的 TokenTheme / 适配器行为。
import { afterEach, describe, expect, it } from 'vitest'
import * as monaco from '../../src/index'
import { createEditor, createModel, Token } from '../../src/index'
import { fakeHl, QUIET } from './h1-helpers'
import { TokenizationSupportAdapter, EncodedTokenizationSupportAdapter } from '../../src/api/standalonelanguages'
import { NullState, TokenMetadata, MetadataConsts, getTokenizationRegistry } from '../../src/api/tokenization'

let n = 0
const uniq = () => `sl-lang-${++n}-${Math.random().toString(36).slice(2, 6)}`
const disposables: { dispose(): void }[] = []
afterEach(() => { for (const d of disposables.splice(0)) d.dispose(); monaco.languages.setColorMap(null) })

class St { constructor(readonly n = 0) { } clone() { return new St(this.n) } equals(o: St) { return o.n === this.n } }
const provider = (scopes: (line: string) => { startIndex: number, scopes: string }[]) => ({
    getInitialState: () => new St(),
    tokenize: (line: string, s: St) => ({ tokens: scopes(line), endState: s }),
})

function box(): HTMLElement { const el = document.createElement('div'); document.body.appendChild(el); return el }
const spans = (ed: { dom: HTMLElement }) => [...ed.dom.querySelectorAll<HTMLElement>('.cm-line span[style]')].map(s => [s.textContent, s.style.color])

describe('setTokensProvider', () => {
    it('未注册语言:抛 Cannot set tokens provider for unknown language X', () => {
        expect(() => monaco.languages.setTokensProvider('nope-lang-xyz', provider(() => []))).toThrow('Cannot set tokens provider for unknown language nope-lang-xyz')
    })

    it('经典 provider:token 名经 TokenTheme 取色,真编辑器渲染出来', () => {
        const id = uniq()
        monaco.languages.register({ id })
        disposables.push(monaco.languages.setTokensProvider(id, provider(line => line.startsWith('//') ? [{ startIndex: 0, scopes: 'comment' }] : [{ startIndex: 0, scopes: 'keyword' }, { startIndex: 3, scopes: '' }])))
        const ed = createEditor(box(), { highlighter: fakeHl(), value: 'let x\n// hi', language: id, features: QUIET, theme: 'vs' })
        const got = spans(ed)
        // vs 主题:keyword 0000FF,comment 008000
        expect(got).toContainEqual(['let', 'rgb(0, 0, 255)'])
        expect(got.some(([t, c]) => t === '// hi' && c === 'rgb(0, 128, 0)')).toBe(true)
        ed.destroy()
    })

    it('Promise 形式:解析之后才上色(走懒工厂)', async () => {
        const id = uniq()
        monaco.languages.register({ id })
        disposables.push(monaco.languages.setTokensProvider(id, Promise.resolve(provider(() => [{ startIndex: 0, scopes: 'keyword' }]))))
        const ed = createEditor(box(), { highlighter: fakeHl(), value: 'abc', language: id, features: QUIET, theme: 'vs' })
        await new Promise(r => setTimeout(r, 20))
        expect(spans(ed)).toContainEqual(['abc', 'rgb(0, 0, 255)'])
        ed.destroy()
    })

    it('dispose 之后撤回注册', () => {
        const id = uniq()
        monaco.languages.register({ id })
        const d = monaco.languages.setTokensProvider(id, provider(() => [{ startIndex: 0, scopes: 'keyword' }]))
        expect(getTokenizationRegistry().get(id)).not.toBeNull()
        d.dispose()
        expect(getTokenizationRegistry().get(id)).toBeNull()
    })

    it('已有编辑器的语言后设 provider:重装配后改色', () => {
        const id = uniq()
        monaco.languages.register({ id })
        const ed = createEditor(box(), { highlighter: fakeHl(), value: 'abc', language: id, features: QUIET, theme: 'vs' })
        expect(spans(ed)).toEqual([])
        disposables.push(monaco.languages.setTokensProvider(id, provider(() => [{ startIndex: 0, scopes: 'keyword' }])))
        expect(spans(ed)).toContainEqual(['abc', 'rgb(0, 0, 255)'])
        ed.destroy()
    })

    it('编码 provider:metadata 里的颜色编号按 setColorMap 的表取色', () => {
        const id = uniq()
        monaco.languages.register({ id })
        const langId = monaco.languages.getEncodedLanguageId(id)
        const meta = ((2 << MetadataConsts.FOREGROUND_OFFSET) | (langId)) >>> 0
        disposables.push(monaco.languages.setTokensProvider(id, {
            getInitialState: () => NullState,
            tokenizeEncoded: (_l: string, s: monaco.languages.IState) => ({ tokens: new Uint32Array([0, meta]), endState: s }),
        }))
        monaco.languages.setColorMap(['', '#000000', '#ff0000'])
        const ed = createEditor(box(), { highlighter: fakeHl(), value: 'abc', language: id, features: QUIET, theme: 'vs' })
        expect(spans(ed)).toContainEqual(['abc', 'rgb(255, 0, 0)'])
        monaco.languages.setColorMap(['', '#000000', '#00ff00'])
        expect(spans(ed)).toContainEqual(['abc', 'rgb(0, 255, 0)'])
        ed.destroy()
    })
})

describe('registerTokensProviderFactory', () => {
    it('factory 惰性:语言被 model 第一次用上才 create;结果可以是 provider 或 Monarch 定义', async () => {
        const id = uniq()
        monaco.languages.register({ id })
        let created = 0
        disposables.push(monaco.languages.registerTokensProviderFactory(id, { create: () => { created++; return { tokenizer: { root: [[/\w+/, 'keyword']] } } } }))
        await Promise.resolve()
        // 语言还没被 model 用过,但 registerTokensProviderFactory 对已登记语言立刻解析(没有「第一次」可等了)
        const m = createModel('foo bar', id)
        await new Promise(r => setTimeout(r, 10))
        expect(created).toBe(1)
        const ed = createEditor(box(), { highlighter: fakeHl(), model: m, features: QUIET, theme: 'vs' })
        expect(spans(ed)).toContainEqual(['foo', 'rgb(0, 0, 255)'])
        ed.destroy()
    })

    it('factory 返回空:没有分词器,不报错', async () => {
        const id = uniq()
        monaco.languages.register({ id })
        disposables.push(monaco.languages.registerTokensProviderFactory(id, { create: () => null }))
        createModel('x', id)
        await new Promise(r => setTimeout(r, 10))
        expect(getTokenizationRegistry().get(id)).toBeNull()
    })
})

describe('setMonarchTokensProvider', () => {
    it('同步定义:Monarch 词法驱动真渲染(关键字蓝、注释绿、字符串红)', () => {
        const id = uniq()
        monaco.languages.register({ id })
        disposables.push(monaco.languages.setMonarchTokensProvider(id, {
            keywords: ['if', 'else'],
            tokenizer: {
                root: [
                    [/[a-z]+/, { cases: { '@keywords': 'keyword', '@default': 'identifier' } }],
                    [/\/\/.*$/, 'comment'],
                    [/"[^"]*"/, 'string'],
                ],
            },
        } as monaco.languages.IMonarchLanguage))
        const ed = createEditor(box(), { highlighter: fakeHl(), value: 'if x // c\n"s"', language: id, features: QUIET, theme: 'vs' })
        const got = spans(ed)
        expect(got).toContainEqual(['if', 'rgb(0, 0, 255)'])
        expect(got).toContainEqual(['// c', 'rgb(0, 128, 0)'])
        expect(got).toContainEqual(['"s"', 'rgb(163, 21, 21)'])
        ed.destroy()
    })

    it('多行状态:块注释跨行继续上色;改第一行后第二行跟着变', () => {
        const id = uniq()
        monaco.languages.register({ id })
        disposables.push(monaco.languages.setMonarchTokensProvider(id, {
            tokenizer: { root: [[/\/\*/, 'comment', '@c'], [/\w+/, 'keyword']], c: [[/\*\//, 'comment', '@pop'], [/./, 'comment']] },
        } as monaco.languages.IMonarchLanguage))
        const ed = createEditor(box(), { highlighter: fakeHl(), value: '/* a\nbb', language: id, features: QUIET, theme: 'vs' })
        expect(spans(ed).some(([t, c]) => t === 'bb' && c === 'rgb(0, 128, 0)')).toBe(true)
        ed.setValue('/* a */\nbb')
        expect(spans(ed).some(([t, c]) => t === 'bb' && c === 'rgb(0, 0, 255)')).toBe(true)
        ed.destroy()
    })

    it('dispose 撤回', () => {
        const id = uniq()
        monaco.languages.register({ id })
        const d = monaco.languages.setMonarchTokensProvider(id, { tokenizer: { root: [[/./, 'keyword']] } } as monaco.languages.IMonarchLanguage)
        expect(getTokenizationRegistry().get(id)).not.toBeNull()
        d.dispose()
        expect(getTokenizationRegistry().get(id)).toBeNull()
    })
})

describe('适配器(照搬 Monaco TokenizationSupportAdapter)', () => {
    const lang = { languageIdCodec: { encodeLanguageId: () => 7 } }
    const theme = { getColorTheme: () => ({ tokenTheme: { match: (l: number, t: string) => (l | (t === 'a' ? 1 << 15 : 2 << 15)) >>> 0 } }) }

    it('classic:首 token 强制从 0 起;乱序的 startIndex 不得倒退;endState 等于入口就复用入口', () => {
        const s0 = new St()
        const a = new TokenizationSupportAdapter('L', { getInitialState: () => s0, tokenize: () => ({ tokens: [{ startIndex: 3, scopes: 'a' }, { startIndex: 4, scopes: 'b' }, { startIndex: 2, scopes: 'c' }], endState: new St() }) }, lang, theme)
        const r = a.tokenize('abcdef', true, s0)
        expect(r.tokens.map(t => t.offset)).toEqual([0, 4, 4])
        expect(r.tokens[0]).toBeInstanceOf(Token)
        expect(r.tokens[0].language).toBe('L')
        expect(r.endState).toBe(s0)
    })

    it('encoded:同 metadata 合并;每个 token 都带 BALANCED_BRACKETS 位;状态不等就用新状态', () => {
        const a = new TokenizationSupportAdapter('L', { getInitialState: () => new St(), tokenize: () => ({ tokens: [{ startIndex: 0, scopes: 'a' }, { startIndex: 2, scopes: 'a' }, { startIndex: 4, scopes: 'b' }], endState: new St(9) }) }, lang, theme)
        const s = new St()
        const r = a.tokenizeEncoded('abcdef', true, s)
        expect(Array.from(r.tokens).filter((_, i) => i % 2 === 0)).toEqual([0, 4])
        for (let i = 1; i < r.tokens.length; i += 2) expect(TokenMetadata.containsBalancedBrackets(r.tokens[i])).toBe(true)
        expect((r.endState as St).n).toBe(9)
    })

    it('EncodedTokenizationSupportAdapter.tokenize:provider 没带 tokenize 抛 Not supported!', () => {
        const a = new EncodedTokenizationSupportAdapter('L', { getInitialState: () => NullState, tokenizeEncoded: (_l, s) => ({ tokens: new Uint32Array(0), endState: s }) })
        expect(() => a.tokenize('x', true, NullState)).toThrow('Not supported!')
    })
})

describe('setColorMap / onLanguage', () => {
    it('setColorMap 之后 TokenTheme 之外的覆盖表生效,null 撤销', () => {
        const id = uniq()
        monaco.languages.register({ id })
        const langId = monaco.languages.getEncodedLanguageId(id)
        const meta = ((3 << MetadataConsts.FOREGROUND_OFFSET) | langId) >>> 0
        disposables.push(monaco.languages.setTokensProvider(id, { getInitialState: () => NullState, tokenizeEncoded: (_l: string, s: monaco.languages.IState) => ({ tokens: new Uint32Array([0, meta]), endState: s }) }))
        monaco.languages.setColorMap(['', '#111111', '#222222', '#abcdef'])
        const ed = createEditor(box(), { highlighter: fakeHl(), value: 'q', language: id, features: QUIET })
        expect(spans(ed)).toContainEqual(['q', 'rgb(171, 205, 239)'])
        monaco.languages.setColorMap(null)
        expect(spans(ed).some(([, c]) => c === 'rgb(171, 205, 239)')).toBe(false)
        ed.destroy()
    })

    it('onLanguage:语言第一次被 model 用上触发一次;onLanguageEncountered 同样', () => {
        const id = uniq()
        monaco.languages.register({ id })
        let a = 0, b = 0
        monaco.languages.onLanguage(id, () => a++)
        monaco.languages.onLanguageEncountered(id, () => b++)
        const m1 = createModel('x', id)
        const m2 = createModel('y', id)
        expect([a, b]).toEqual([1, 1])
        m1.dispose(); m2.dispose()
    })

    it('onLanguage 的 dispose 可以在触发前取消;setModelLanguage 也算「用上」', () => {
        const id = uniq()
        monaco.languages.register({ id })
        let a = 0, c = 0
        monaco.languages.onLanguage(id, () => a++).dispose()
        monaco.languages.onLanguage(id, () => c++)
        const m = createModel('x', 'plaintext')
        monaco.editor.setModelLanguage(m, id)
        expect([a, c]).toEqual([0, 1])
        m.dispose()
    })
})

describe('EditDeltaInfo / SelectedSuggestionInfo / FoldingRangeKind', () => {
    it('EditDeltaInfo.fromText / tryCreate', () => {
        const d = monaco.languages.EditDeltaInfo.fromText('ab\ncd\r\nef')
        expect([d.linesAdded, d.linesRemoved, d.charsAdded, d.charsRemoved]).toEqual([2, 0, 9, 0])
        expect(monaco.languages.EditDeltaInfo.tryCreate(1, 2, 3, undefined)).toBeUndefined()
        const e = monaco.languages.EditDeltaInfo.tryCreate(1, 2, 3, 4)!
        expect(e).toBeInstanceOf(monaco.languages.EditDeltaInfo)
        expect([e.linesAdded, e.linesRemoved, e.charsAdded, e.charsRemoved]).toEqual([1, 2, 3, 4])
    })
    it('FoldingRangeKind 常量与 fromValue(同值返回同一实例)', () => {
        const K = monaco.languages.FoldingRangeKind
        expect([K.Comment.value, K.Imports.value, K.Region.value]).toEqual(['comment', 'imports', 'region'])
        expect(K.fromValue('region')).toBe(K.Region)
        const x = K.fromValue('other')
        expect(x).toBeInstanceOf(K)
        expect(x.value).toBe('other')
    })
    it('SelectedSuggestionInfo 导出且 equals 可用', () => {
        const r = { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 2 }
        const a = new monaco.languages.SelectedSuggestionInfo(r, 'x', 1, false)
        expect(a.equals(new monaco.languages.SelectedSuggestionInfo({ ...r }, 'x', 1, false))).toBe(true)
        expect(a.equals(new monaco.languages.SelectedSuggestionInfo(r, 'y', 1, false))).toBe(false)
    })
})
