// FIX2 P0-1 / P0-2:后台分词 + 超长行不分词。
// Monaco 0.52:
//   - DefaultBackgroundTokenizer 空闲时从第一行无效行往下推(每片 >1ms 让出),最终全文 state 都有效,远跳猜的颜色被纠正;
//   - maxTokenizationLineLength = 20000:这么长的行 nullTokenize(一个没颜色的 token,入口 state 原样往下传)。
// 黄金标准同 tokens-r6-fix:同一份文本另一个 owner 从零 tokenize,逐 token 相等。
import { beforeAll, describe, expect, it } from 'vitest'
import { createHighlighter, type Highlighter } from 'shiki'

const tokens = await import('../../src/core/view/tokens')
const { selectTokenCache, ensureTokenCache, ensureTokenizedRange, tokensInLineRange, subscribeTokens } = tokens
type ScopedShiki = import('../../src/core/view/tokens').ScopedShiki

let hl: Highlighter
beforeAll(async () => {
    hl = await createHighlighter({ themes: ['dark-plus'], langs: ['typescript'] })
})

const ser = (from = 1, to = 1e9) => tokensInLineRange(from, to).map(l => l.map(t => `${t.content}:${t.color}`).join('|'))
const opts = { lang: 'typescript', theme: 'dark-plus' }

function fresh(doc: string) {
    selectTokenCache({})
    const lines = doc.split('\n')
    ensureTokenCache(hl as never, lines, opts)
    ensureTokenizedRange(1, lines.length)
    return ser()
}

describe('后台分词(DefaultBackgroundTokenizer)', () => {
    it('大文档远跳到不闭合的块注释里:猜的颜色由后台分词纠正,并通知变了的行', async () => {
        const lines = Array.from({ length: 6000 }, (_, i) => `const v${i} = ${i} // n`)
        lines.splice(3000, 0, '/*')
        const doc = lines.join('\n')
        const want = fresh(doc)
        const owner = {}
        selectTokenCache(owner)
        ensureTokenCache(hl as never, doc.split('\n'), opts)
        // 远跳:视口在注释中间,按猜的 seed 算 —— 这时是代码色(错的)
        ensureTokenizedRange(5000, 5040)
        const guessed = ser(5000, 5040)
        expect(guessed).not.toEqual(want.slice(4999, 5040))
        const hits: [number, number][] = []
        const off = subscribeTokens(owner, (a, b) => hits.push([a, b]))
        let fixedAt = -1
        // 全量并发跑时空闲片少,按时限等(不按轮数)
        const deadline = Date.now() + 25_000
        for (let t = 0; Date.now() < deadline; t++) {
            await new Promise(r => setTimeout(r, 20))
            selectTokenCache(owner)
            if (fixedAt < 0 && ser(5000, 5040).join() === want.slice(4999, 5040).join()) fixedAt = t
            if (hits.length && hits[hits.length - 1][1] >= 6001) break
        }
        expect(fixedAt).toBeGreaterThanOrEqual(0)
        off()
        selectTokenCache(owner)
        expect(ser()).toEqual(want)
        expect(hits.some(([a, b]) => a <= 4999 && b >= 5040)).toBe(true)
    }, 40000)

    it('没有订阅者不跑(没挂着的 view 不占空闲时间)', async () => {
        const lines = Array.from({ length: 3000 }, (_, i) => `const v${i} = ${i}`)
        const n = { calls: 0 }
        const w: ScopedShiki = {
            getLoadedLanguages: () => hl.getLoadedLanguages(),
            getLastGrammarState: t => hl.getLastGrammarState(t as never) as never,
            codeToTokens: (code, o) => { n.calls++; return hl.codeToTokens(code, o as never) as never },
        }
        selectTokenCache({})
        ensureTokenCache(w, lines, opts)
        ensureTokenizedRange(1, 40)
        const before = n.calls
        await new Promise(r => setTimeout(r, 100))
        expect(n.calls).toBe(before)
    })
})

describe('超长行(maxTokenizationLineLength = 20000)', () => {
    it('>= 20000 字符的行不交给 grammar:一个没颜色的 token,state 原样传给下一行', () => {
        const long = 'x = "' + 'a'.repeat(20000)
        const doc = ['/* c', long, 'still comment */', 'const z = 1'].join('\n')
        const seen: number[] = []
        const w: ScopedShiki = {
            getLoadedLanguages: () => hl.getLoadedLanguages(),
            getLastGrammarState: t => hl.getLastGrammarState(t as never) as never,
            codeToTokens: (code, o) => { seen.push(code.length); return hl.codeToTokens(code, o as never) as never },
        }
        selectTokenCache({})
        ensureTokenCache(w, doc.split('\n'), opts)
        expect(seen.includes(long.length)).toBe(false)
        const rows = tokensInLineRange(1, 4)
        expect(rows[1]).toHaveLength(1)
        expect(rows[1][0].content).toBe(long)
        expect(rows[1][0].color).toBeUndefined()
        // 入口在块注释里,出口也在:第 3 行仍是注释色(Monaco 同:长行不改 state)
        expect(rows[2][0].color).toBe(rows[0][0].color)
        // 19999 字符的照常分词
        const ok = 'y'.repeat(19999)
        selectTokenCache({})
        ensureTokenCache(w, [ok], opts)
        expect(seen.includes(19999)).toBe(true)
    })

    it('超长行的括号不着色、不计深度(Monaco 对照页实测:200k 字符一行没有 bracket-highlighting)', async () => {
        const { bracketColorDecorations } = await import('../../src/core/feature/bracketcolor')
        const { EditorState } = await import('../../src/core/model/state')
        const long = '('.repeat(20001)
        const state = EditorState.create({ doc: ['(a)', long, '[b]'].join('\n') })
        const spans: number[][] = []
        bracketColorDecorations(hl as never, state, opts, ['c0', 'c1', 'c2']).between(0, state.doc.length, (f, t) => { spans.push([f, t]) })
        const lineTwo = state.doc.line(2)
        expect(spans.some(([f]) => f >= lineTwo.from && f < lineTwo.to)).toBe(false)
        // 第 3 行深度从 0 起(长行里的 ( 没进栈)
        expect(spans.length).toBe(4)
    })
})
