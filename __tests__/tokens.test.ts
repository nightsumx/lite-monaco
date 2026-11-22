// 增量 tokenize 契约 —— 钉死「编辑卡顿」的真修复:一次只重扫被改的几行,不是全文。
//
// 病根:shiki 无增量 API,旧实现每次停顿对全文 codeToTokens(391 行 ~45ms),CM6 只渲染 ~41 可见行,
// 扫另外 350 行纯浪费,文件越大越卡。修复:逐行携带 grammar state 重扫,只跑改动行往下到状态收敛。
//
// 用真 shiki 当黄金标准:增量结果必须与「从零全文 tokenize」逐 token 字节相等(正确性),
// 且单行编辑只重扫常数行(效率)。计数包装器逐行自增 calls,断言重扫行数。
// 缓存是模块级、按 hl 身份键 —— 每个用例用全新包装器 → 首调必整篇重建,天然隔离。

import { describe, it, expect, beforeAll } from 'vitest'
import { createHighlighter, type Highlighter } from 'shiki'
import { sharedTokens, type ScopedShiki } from '../src/core/view/tokens'

const OPTS = { lang: 'typescript', theme: 'github-dark' }
let real: Highlighter

beforeAll(async () => {
    real = await createHighlighter({ themes: ['github-dark'], langs: ['typescript'] })
})

// 包装真 shiki,逐行 codeToTokens 计数。身份唯一 → 缓存隔离。
function wrap() {
    const state = { calls: 0 }
    const hl: ScopedShiki = {
        getLoadedLanguages: () => real.getLoadedLanguages(),
        getLastGrammarState: tokens => real.getLastGrammarState(tokens as never) as never,
        codeToTokens: (code, o) => {
            state.calls++
            return real.codeToTokens(code, o as never)
        },
    }
    return { state, hl }
}

// 从零全文 tokenize(黄金标准):用独立包装器,不碰被测缓存。
function fullTokens(code: string): string[] {
    const { hl } = wrap() // 全新身份 → sharedTokens 整篇重建,等价从零
    return serialize(sharedTokens(hl, code, OPTS)!)
}

// token 流序列化成可比字符串:每 token 的 绝对offset:内容:色:scopes。逐 token 字节比对。
function serialize(tokens: { content: string; offset: number; color?: string; explanation?: { scopes: { scopeName: string }[] }[] }[][]): string[] {
    return tokens.map(line =>
        line.map(t => `${t.offset}:${t.content}:${t.color ?? ''}:${(t.explanation ?? []).flatMap(e => e.scopes.map(s => s.scopeName)).join('>')}`).join('|'),
    )
}

const SAMPLE = `const greeting = "hello"
function add(a: number, b: number) {
    return a + b
}
const arr = [1, 2, 3].map(x => x * 2)
// a trailing comment`

describe('增量 tokenize:正确性 = 与全文逐 token 字节相等', () => {
    it('行内改一个字符:结果与全文 tokenize 完全一致', () => {
        const { hl } = wrap()
        sharedTokens(hl, SAMPLE, OPTS) // 建缓存
        const edited = SAMPLE.replace('hello', 'world')
        const inc = serialize(sharedTokens(hl, edited, OPTS)!)
        expect(inc).toEqual(fullTokens(edited))
    })

    it('插入新行(Enter):后续行 offset 整体下移,与全文一致', () => {
        const { hl } = wrap()
        sharedTokens(hl, SAMPLE, OPTS)
        const lines = SAMPLE.split('\n')
        lines.splice(2, 0, '    const local = 42')
        const edited = lines.join('\n')
        const inc = serialize(sharedTokens(hl, edited, OPTS)!)
        expect(inc).toEqual(fullTokens(edited))
    })

    it('删除一行(退格合并):后续行 offset 上移,与全文一致', () => {
        const { hl } = wrap()
        sharedTokens(hl, SAMPLE, OPTS)
        const lines = SAMPLE.split('\n')
        lines.splice(4, 1)
        const edited = lines.join('\n')
        const inc = serialize(sharedTokens(hl, edited, OPTS)!)
        expect(inc).toEqual(fullTokens(edited))
    })

    it('打开一个未闭合字符串:下方行被重新着色为字符串,直到收敛,与全文一致', () => {
        const { hl } = wrap()
        const base = `const a = 1
const b = 2
const c = 3`
        sharedTokens(hl, base, OPTS)
        // 第 1 行尾插一个未闭合引号 → 第 2、3 行进入字符串态(跨行污染),增量必须重扫到收敛
        const edited = `const a = 1"
const b = 2
const c = 3`
        const inc = serialize(sharedTokens(hl, edited, OPTS)!)
        expect(inc).toEqual(fullTokens(edited))
    })

    it('关闭之前未闭合的字符串:下方行从字符串态恢复为代码,与全文一致', () => {
        const { hl } = wrap()
        const open = `const a = 1"
const b = 2
const c = 3`
        sharedTokens(hl, open, OPTS)
        const closed = `const a = 1
const b = 2
const c = 3`
        const inc = serialize(sharedTokens(hl, closed, OPTS)!)
        expect(inc).toEqual(fullTokens(closed))
    })

    it('块注释跨行打开 /* :下方行变注释直到 */ 收敛,与全文一致', () => {
        const { hl } = wrap()
        const base = `const a = 1
const b = 2
const c = 3`
        sharedTokens(hl, base, OPTS)
        const edited = `const a = 1 /*
const b = 2
const c = 3`
        const inc = serialize(sharedTokens(hl, edited, OPTS)!)
        expect(inc).toEqual(fullTokens(edited))
    })
})

describe('增量 tokenize:效率 = 单行编辑只重扫常数行,不是全文', () => {
    // 构造一篇 60 行的「正常代码」文档(无跨行字符串/注释),改中间一行应只重扫 1~2 行。
    const lines = Array.from({ length: 60 }, (_, i) => `const v${i} = foo(${i}) + bar[${i}]`)
    const doc = lines.join('\n')

    it('行内改一个字符:只重扫该行(+收敛探测),远小于总行数', () => {
        const { state, hl } = wrap()
        sharedTokens(hl, doc, OPTS)
        const afterBuild = state.calls // 整篇建缓存:60 行 → 60 次
        expect(afterBuild).toBe(60)

        const edited = doc.replace('foo(30)', 'foo(31)')
        sharedTokens(hl, edited, OPTS)
        const reTokenized = state.calls - afterBuild
        // 改第 30 行:重扫该行,scope 收敛立即停 → ≤ 2 行(留 1 行收敛探测余量),绝不是 60。
        expect(reTokenized).toBeLessThanOrEqual(2)
        expect(reTokenized).toBeGreaterThanOrEqual(1)
    })

    it('同一停顿三插件传同一 code:精确命中,零额外 tokenize(跨插件去重)', () => {
        const { state, hl } = wrap()
        sharedTokens(hl, doc, OPTS) // 插件 A:整篇建缓存
        const afterA = state.calls
        sharedTokens(hl, doc, OPTS) // 插件 B:同 code
        sharedTokens(hl, doc, OPTS) // 插件 C:同 code
        expect(state.calls).toBe(afterA) // B/C 走精确命中快路径,不再调 codeToTokens
    })
})
