// 视图 token 缓存每行存成紧凑行 [起点, 样式号, …]:读出来(tokensInLineRange / sharedTokens)必须和 grammar 直接给的
// token 一样(content、offset、color、fontStyle);grammar 给的 token 不首尾相接时照存对象数组,读出来也一样。
import { beforeAll, describe, expect, it } from 'vitest'
import { createHighlighter, type Highlighter } from 'shiki'
import { ensureTokenCache, selectTokenCache, tokensInLineRange, cachedRelTokens, sharedTokensLines, rowTokens, type ScopedShiki, type ScopedToken } from '../../src/core/view/tokens'

const OPTS = { lang: 'typescript', theme: 'dark-plus' } as const
let hl: Highlighter
beforeAll(async () => { hl = await createHighlighter({ themes: ['dark-plus'], langs: ['typescript'] }) })

const strip = (t: ScopedToken) => ({ content: t.content, offset: t.offset, color: t.color, fontStyle: t.fontStyle || undefined })

describe('紧凑的视图 token 行', () => {
    it('真 shiki:每行读出来和 codeToTokens 逐 token 相同,行里存的是数字', () => {
        const lines = [
            'const a = `x${1 + 2}y` // tail',
            '',
            '/* 注释 */ function f(p: string): number { return p.length }',
            "  let s = 'q' + \"w\"",
            '}',
        ]
        const owner = {}
        selectTokenCache(owner)
        expect(ensureTokenCache(hl as never, lines, OPTS)).toBe(true)
        const got = tokensInLineRange(1, lines.length)
        const want = hl.codeToTokens(lines.join('\n'), OPTS).tokens
        let base = 0
        for (let i = 0; i < lines.length; i++) {
            expect(got[i].map(strip)).toEqual(want[i].map(strip))
            expect(got[i].map(t => t.content).join('')).toBe(lines[i])
            for (const t of got[i]) expect(t.offset).toBeGreaterThanOrEqual(base)
            base += lines[i].length + 1
        }
        // 存的是紧凑行:每个 token 两个数字,没有对象和字符串
        const rows = cachedRelTokens()!.rel
        for (let i = 0; i < lines.length; i++) {
            expect(rows[i].every(x => typeof x === 'number')).toBe(true)
            expect(rows[i].length).toBe(got[i].length * 2)
        }
        // sharedTokensLines(rebase)同一份
        expect(sharedTokensLines(hl as never, lines, OPTS)!.map(r => r.map(strip))).toEqual(got.map(r => r.map(strip)))
    })

    it('grammar 给的 token 不首尾相接:照存原样,读出来不变', () => {
        const weird: ScopedShiki = {
            codeToTokens: () => ({ tokens: [[{ content: 'AB', offset: 0, color: '#111111' }, { content: 'zz', offset: 5, color: '#222222', fontStyle: 2 }]] }),
            getLastGrammarState: () => undefined,
        } as never
        const lines = ['ABcdezz', 'ABxyzzz']
        selectTokenCache({})
        expect(ensureTokenCache(weird, lines, { lang: 'x', theme: 'y' })).toBe(true)
        const got = tokensInLineRange(1, 2)
        expect(got[0].map(strip)).toEqual([{ content: 'AB', offset: 0, color: '#111111', fontStyle: undefined }, { content: 'zz', offset: 5, color: '#222222', fontStyle: 2 }])
        expect(got[1].map(strip)).toEqual([{ content: 'AB', offset: 8, color: '#111111', fontStyle: undefined }, { content: 'zz', offset: 13, color: '#222222', fontStyle: 2 }])
    })

    it('rowTokens 每次给新对象(调用方改了不污染缓存);fontStyle 按样式表还原', () => {
        const bridge: ScopedShiki = {
            codeToTokens: (code: string) => ({ tokens: [[{ content: code.slice(0, 2), offset: 0, color: '#AA0000', fontStyle: 1 }, { content: code.slice(2), offset: 2 }]] }),
            getLastGrammarState: () => undefined,
        } as never
        selectTokenCache({})
        ensureTokenCache(bridge, ['abcdef'], { lang: 'x', theme: 'y' })
        const row = cachedRelTokens()!.rel[0]
        const a = rowTokens(row, 'abcdef')
        expect(a.map(strip)).toEqual([{ content: 'ab', offset: 0, color: '#AA0000', fontStyle: 1 }, { content: 'cdef', offset: 2, color: undefined, fontStyle: undefined }])
        a[0].color = 'mutated'
        expect(rowTokens(row, 'abcdef')[0].color).toBe('#AA0000')
    })
})
