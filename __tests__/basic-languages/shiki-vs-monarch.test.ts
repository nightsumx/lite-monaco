// Shiki 与 Monarch 同时能给同一个语言分词时谁生效 —— 固定行为(2026-11-22 实测):
//   - 语言在 TokenizationRegistry 里登记过分词器(setMonarchTokensProvider / setTokensProvider / 懒工厂)→ 渲染用它,不用 shiki
//   - 没登记 → 走 shiki
//   - 登记了又登记 → 后登记的生效(Monaco 语义:TokenizationRegistry.register 覆盖同语言的旧项)
//   - dispose 后一个 → 回到 shiki(这一层不会回退到「前一个 Monarch」:Monaco 的 register 返回的 disposable 只删自己,
//     而 Monaco 注册表是 Map.set 覆盖,被覆盖的旧项已经没了)
// 这条规则决定了 Filo 能不能 import 'lite-monaco/basic-languages':基础语言只给它自己的 81+ 个语言 id 登记分词器,
// Filo 里这些语言(python、rust、go …)当前由 shiki 着色;一旦 import,它们的着色会改走 Monarch。
import { afterEach, describe, expect, it } from 'vitest'
import * as monaco from '../../src/index'
import { createEditor } from '../../src/index'
import { QUIET } from '../core/h1-helpers'
import { getTokenizationRegistry } from '../../src/api/tokenization'

let n = 0
const uniq = () => `svm-${++n}-${Math.random().toString(36).slice(2, 6)}`
const disposables: { dispose(): void }[] = []
const editors: { destroy(): void }[] = []
afterEach(() => {
    for (const e of editors.splice(0)) e.destroy()
    for (const d of disposables.splice(0)) d.dispose()
})

const SHIKI = 'rgb(255, 0, 255)'
const KEYWORD_VS = 'rgb(0, 0, 255)' // vs 主题的 keyword
// 假 shiki:所有 token 一个颜色,用来分辨「渲染是 shiki 做的还是分词器做的」。要声明自己加载了这个语言,shiki 才会被用
const shikiFor = (lang: string): any => ({
    codeToTokens: (code: string) => ({ tokens: [[{ content: code, offset: 0, color: '#ff00ff' }]] }),
    getLastGrammarState: () => ({ getScopes: () => undefined }),
    getLoadedLanguages: () => [lang, 'text'],
    getTheme: () => ({ bg: '#fff', fg: '#000', type: 'light' }),
})
const box = () => { const e = document.createElement('div'); document.body.appendChild(e); return e }
const colors = (ed: { dom: HTMLElement }) => [...ed.dom.querySelectorAll<HTMLElement>('.cm-line span[style]')].map(s => [s.textContent, s.style.color])
const monarch = (kw: string) => ({ keywords: [kw], tokenizer: { root: [[/[a-z]+/, { cases: { '@keywords': 'keyword', '@default': 'identifier' } }]] } }) as monaco.languages.IMonarchLanguage
const open = (lang: string, value = 'if x') => {
    const ed = createEditor(box(), { highlighter: shikiFor(lang), value, language: lang, features: QUIET, theme: 'vs' } as never)
    editors.push(ed)
    return ed
}

describe('Shiki 与 Monarch 同时可用', () => {
    it('没登记分词器:走 shiki', () => {
        const id = uniq(); monaco.languages.register({ id })
        expect(colors(open(id))).toEqual([['if x', SHIKI]])
    })

    it('登记了 Monarch:渲染用 Monarch,不用 shiki', () => {
        const id = uniq(); monaco.languages.register({ id })
        disposables.push(monaco.languages.setMonarchTokensProvider(id, monarch('if')))
        expect(colors(open(id))).toEqual([['if', KEYWORD_VS]])
    })

    it('已经打开的编辑器:后登记的 Monarch 立刻热切换(不用重开)', () => {
        const id = uniq(); monaco.languages.register({ id })
        const ed = open(id)
        expect(colors(ed)).toEqual([['if x', SHIKI]])
        disposables.push(monaco.languages.setMonarchTokensProvider(id, monarch('if')))
        expect(colors(ed)).toEqual([['if', KEYWORD_VS]])
    })

    it('登记两个 Monarch:后登记的生效(Monaco 语义)', () => {
        const id = uniq(); monaco.languages.register({ id })
        disposables.push(monaco.languages.setMonarchTokensProvider(id, monarch('if')))
        const ed = open(id)
        expect(colors(ed)).toEqual([['if', KEYWORD_VS]])
        disposables.push(monaco.languages.setMonarchTokensProvider(id, monarch('x')))
        expect(colors(ed)).toEqual([['x', KEYWORD_VS]])
    })

    it('dispose 后登记的:回到 shiki(被覆盖的旧 Monarch 不会回来)', () => {
        const id = uniq(); monaco.languages.register({ id })
        disposables.push(monaco.languages.setMonarchTokensProvider(id, monarch('if')))
        const second = monaco.languages.setMonarchTokensProvider(id, monarch('x'))
        const ed = open(id)
        second.dispose()
        expect(getTokenizationRegistry().get(id)).toBeNull()
        expect(colors(ed)).toEqual([['if x', SHIKI]])
    })

    it('setTokensProvider(经典 provider)和 Monarch 一样压过 shiki', () => {
        const id = uniq(); monaco.languages.register({ id })
        class S { clone() { return this } equals() { return true } }
        disposables.push(monaco.languages.setTokensProvider(id, {
            getInitialState: () => new S() as never,
            tokenize: (_l: string, s: never) => ({ tokens: [{ startIndex: 0, scopes: 'keyword' }], endState: s }),
        }))
        expect(colors(open(id))).toEqual([['if x', KEYWORD_VS]])
    })

    it('不同语言互不影响:只登记了 A,B 照旧走 shiki', () => {
        const a = uniq(), b = uniq()
        monaco.languages.register({ id: a }); monaco.languages.register({ id: b })
        disposables.push(monaco.languages.setMonarchTokensProvider(a, monarch('if')))
        expect(colors(open(b))).toEqual([['if x', SHIKI]])
    })
})
