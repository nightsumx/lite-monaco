// 超长行不交给 grammar —— 括号跳过谓词(bracketSkip → lineMask)也一样。
// 高亮早就尊重 maxTokenizationLineLength,括号这条路以前绕过它:光标在 53 万字符的行里,每键整行 tokenize 一遍(~420ms)。
import { beforeAll, describe, expect, it } from 'vitest'
import { createHighlighter, type Highlighter } from 'shiki'
import { bracketSkip } from '../../src/core/edit/brackets'
import { EditorState } from '../../src/core/model/state'
import { ensureTokenCache, ensureTokenizedRange, selectTokenCache, setMaxTokenizationLineLength, type ScopedShiki } from '../../src/core/view/tokens'

let hl: Highlighter
beforeAll(async () => {
    hl = await createHighlighter({ themes: ['dark-plus'], langs: ['typescript'] })
})
const opts = { lang: 'typescript', theme: 'dark-plus' }

function spyOn(seen: number[]): ScopedShiki {
    return {
        getLoadedLanguages: () => hl.getLoadedLanguages(),
        getLastGrammarState: t => hl.getLastGrammarState(t as never) as never,
        codeToTokens: (code, o) => { seen.push(code.length); return hl.codeToTokens(code, o as never) as never },
    }
}

describe('bracketSkip 与 maxTokenizationLineLength', () => {
    it('超长行的括号查询不 tokenize 这一行', () => {
        const long = 'x = "(' + 'a'.repeat(20000) + ')"'
        const lines = ['const a = (1)', long, 'const b = "(" + [2]']
        const state = EditorState.create({ doc: lines.join('\n') })
        const seen: number[] = []
        const owner = {}
        selectTokenCache(owner)
        ensureTokenCache(spyOn(seen), lines, opts)
        ensureTokenizedRange(1, 3)
        const skip = bracketSkip(owner, state.doc)!
        expect(skip).toBeTypeOf('function')
        const l2 = state.doc.line(2)
        skip(l2.from + 5)
        skip(l2.to - 1)
        expect(seen.includes(long.length)).toBe(false)
        // 普通行照旧:第 3 行字符串里的 ( 被跳过,外面的 [ 不跳
        const l3 = state.doc.line(3)
        expect(skip(l3.from + l3.text.indexOf('"(') + 1)).toBe(true)
        expect(skip(l3.from + l3.text.indexOf('['))).toBe(false)
    })

    it('上限是选项:调小以后更短的行也不 tokenize', () => {
        const mid = 'x = "(' + 'a'.repeat(100) + ')"'
        const lines = ['a', mid, 'b']
        const state = EditorState.create({ doc: lines.join('\n') })
        const seen: number[] = []
        const owner = {}
        setMaxTokenizationLineLength(owner, 50)
        selectTokenCache(owner)
        ensureTokenCache(spyOn(seen), lines, opts)
        ensureTokenizedRange(1, 3)
        const skip = bracketSkip(owner, state.doc)!
        skip(state.doc.line(2).from + 5)
        expect(seen.includes(mid.length)).toBe(false)
    })
})
