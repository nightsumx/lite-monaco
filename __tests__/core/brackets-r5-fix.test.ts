// 第五轮 L 组:TS/JS 的括号跳过表改用 TS 语法树(lang/tsbrackets),shiki 的 TextMate 判错的正则也对。
// 真值:Monaco 0.52 对照页实测(/tmp/lc-hunt/r4/B/lc-match.ts 23 例 + /tmp/lc-hunt/r5/L/match-extra.ts)。
// 修前:'r = /a(b/g; f(x‸)' 括号匹配 [](Monaco [13,15]),彩虹括号没有(Monaco 13:0 15:0)。
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createHighlighter, type Highlighter } from 'shiki'
import type * as TS from 'typescript'
import { parse } from './f5-replay'
import type { EditorView } from '../../src/core/view/editorview'

const { liteMonaco } = await import('../../src/litemonaco')
const { EditorState } = await import('../../src/core/model/state')
const { EditorSelection } = await import('../../src/core/model/selection')
const { bracketMatchingDecorations } = await import('../../src/core/feature/selectionlayer')
const { bracketSkip, bracketSpans, setBracketSkipSource } = await import('../../src/core/edit/brackets')
const { selectTokenCache, ensureTokenCache } = await import('../../src/core/view/tokens')
const { skipRangesPredicate } = await import('../../src/lang/tsbrackets')
// 服务一侧(Worker)里算区间表的纯函数:语法树 → 区间表(主线程只拿区间表)
const { tsSkipTree, skipRangesIn } = await import('../../src/lang/tsskip')
const { textChange } = await import('../../src/lang/tsbudget')

const SLOW = 60_000
let ts: typeof TS
let hl: Highlighter
beforeAll(async () => {
    ts = (await import('typescript')).default ?? await import('typescript')
    hl = await createHighlighter({ themes: ['dark-plus'], langs: ['typescript'] })
})

// owner 上登记 TS 跳过来源(同 tsBracketSkipSession,只是不等空闲回调);withShiki 同时建 shiki token 缓存
function owned(doc: string, withShiki = false, fileName = '/a.ts') {
    const owner = {}
    if (withShiki) {
        selectTokenCache(owner)
        ensureTokenCache(hl as never, doc.split('\n'), { lang: 'typescript', theme: 'dark-plus' })
    }
    const tree = tsSkipTree(ts, fileName, doc)
    const skip = skipRangesPredicate(skipRangesIn(ts, tree.sf, 0, doc.length + 1))
    setBracketSkipSource(owner, () => skip)
    return owner
}

const marks = (spec: string, owner?: object) => {
    const { doc, sels } = parse(spec)
    const state = EditorState.create({ doc, selection: EditorSelection.create(sels.map(([a, h]) => EditorSelection.range(a, h)), 0) })
    const o = owner ?? owned(doc, true)
    const out: number[] = []
    const it = bracketMatchingDecorations(state, o).iter()
    while (it.value) { out.push(it.from); it.next() }
    return out
}
const levels = (doc: string) => {
    const owner = owned(doc, true)
    return bracketSpans(doc, 0, bracketSkip(owner, EditorState.create({ doc }).doc)).map(s => `${s.from}:${s.depth}`).join(' ')
}

// [光标文档, Monaco bracket-match 起点, Monaco getBracketsInRange 起点:层级]
const MONACO: [string, number[], string][] = [
    ['f("(", x‸)', [1, 8], '1:0 8:0'],
    ['f("(‸", x)', [1, 8], '1:0 8:0'],
    ["f('[', ‸x)", [1, 8], '1:0 8:0'],
    ['f(`(`, x‸)', [1, 8], '1:0 8:0'],
    ['f(`${(a‸)}`)', [5, 7], '1:0 4:1 5:2 7:2 8:1 10:0'],
    ['f(`${a}‸`)', [4, 6], '1:0 4:1 6:1 8:0'],
    ['f(`a${‸b}c`)', [5, 7], '1:0 5:1 7:1 10:0'],
    ['f(/\\(/, x‸)', [1, 9], '1:0 9:0'],
    ['f(/[(]/, x‸)', [1, 10], '1:0 10:0'],
    ['// (\nf(x‸)', [6, 8], '6:0 8:0'],
    ['/* ( */ f(x‸)', [9, 11], '9:0 11:0'],
    ['f(x) // )‸', [], '1:0 3:0'],
    ['a = "(" + (b‸)', [10, 12], '10:0 12:0'],
    ['"(abc‸)"', [], ''],
    ['// (a‸)', [], ''],
    ['f("{", [x‸])', [7, 9], '1:0 7:1 9:1 10:0'],
    ['f(`\n(\n`, x‸)', [1, 10], '1:0 10:0'],
    ['x = `${"(" + y‸}`', [6, 14], '6:0 14:0'],
    ["a('{', {b: [1‸]})", [11, 13], '1:0 7:1 11:2 13:2 14:1 15:0'],
    ['f(`(${(a)})`‸)', [1, 12], '1:0 5:1 6:2 8:2 9:1 12:0'],
    ['/*\n (\n*/ f(x‸)', [10, 12], '10:0 12:0'],
    ['s = "a\\"(" + (b‸)', [13, 15], '13:0 15:0'],
    ['r = /a(b/g; f(x‸)', [13, 15], '13:0 15:0'],
    // match-extra.ts
    ['/** @param {Array<(x)>} a */ f(x‸)', [30, 32], '30:0 32:0'],
    ['x = a / (b‸) / c', [8, 10], '8:0 10:0'],
    ['function g() { return /[)]/.test(s‸) }', [32, 34], '10:0 11:0 13:0 32:1 34:1 36:0'],
    ['x = y / 2; z = (a‸) / 3', [15, 17], '15:0 17:0'],
]

describe('TS 语法树的跳过表:和 Monaco 一致(括号匹配 + 彩虹括号层级)', () => {
    for (const [spec, want, color] of MONACO) {
        it(`${JSON.stringify(spec)} 匹配 ${JSON.stringify(want)}`, () => expect(marks(spec)).toEqual(want))
        it(`${JSON.stringify(spec)} 层级 ${color || '(无)'}`, () => expect(levels(parse(spec).doc)).toBe(color))
    }
})

describe('服务一侧:增量更新和整份重解析一致', () => {
    const SRC = [
        'const re = /a(b/g; f(x)',
        'const t = `a${(b)}c${`d${[e]}`}`',
        '/** {x} */ function g(a: string) { return a.replace(/[{]/, "}") } // (',
        'let s = \'(\' + "[" /* { */',
    ].join('\n')
    it('随机插删 300 步,每步各块跳过范围相同', () => {
        let seed = 7
        const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n }
        const alphabet = ['"', "'", '`', '/', '*', '(', ')', '{', '}', '${', '\n', 'x', ' ', '//', '/*', '*/']
        let text = SRC
        let tree = tsSkipTree(ts, '/inc.ts', text)
        for (let step = 0; step < 300; step++) {
            const at = rnd(text.length + 1)
            text = rnd(3) === 0 && text.length
                ? text.slice(0, at) + text.slice(Math.min(text.length, at + 1 + rnd(4)))
                : text.slice(0, at) + alphabet[rnd(alphabet.length)] + text.slice(at)
            tree = tsSkipTree(ts, '/inc.ts', text, tree)
            const fresh = ts.createSourceFile('/inc.ts', text, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS)
            expect(skipRangesIn(ts, tree.sf, 0, text.length + 1)).toEqual(skipRangesIn(ts, fresh, 0, text.length + 1))
        }
    })
    it('分块算和整份算一样(注释、字符串跨块)', () => {
        const big = Array.from({ length: 400 }, (_, i) => i % 7 === 0 ? `/* ${'('.repeat(i % 50)}\n */` : `f("${'['.repeat(i % 30)}", /x(/g, \`\${(a)}\`) // {`).join('\n')
        const tree = tsSkipTree(ts, '/big.ts', big)
        const all = skipRangesIn(ts, tree.sf, 0, big.length + 1)
        const inAll = skipRangesPredicate(all)
        // 4096 字符一块分别算,拼起来要和整份算的一样
        const inChunks = new Uint8Array(big.length + 1)
        for (let c0 = 0; c0 < big.length; c0 += 4096) {
            const r = skipRangesIn(ts, tree.sf, c0, c0 + 4096)
            for (let i = 0; i < r.length; i += 2)
                for (let p = Math.max(r[i], c0); p < Math.min(r[i + 1], c0 + 4096); p++) inChunks[p] = 1
        }
        for (let p = 0; p < big.length; p++) if ('()[]{}'.includes(big[p])) expect(!!inChunks[p]).toBe(inAll(p))
    })
    it('textChange:公共前后缀之外', () => {
        expect(textChange('abcdef', 'abXdef')).toEqual({ span: { start: 2, length: 1 }, newLength: 1 })
        expect(textChange('aaaa', 'aaaaa')).toEqual({ span: { start: 4, length: 0 }, newLength: 1 })
        expect(textChange('x', 'x')).toBeNull()
        const long = 'q'.repeat(1000)
        expect(textChange(long + 'a' + long, long + long)).toEqual({ span: { start: 1000, length: 1 }, newLength: 0 })
    })
})

describe('真编辑器:TS 加载后改用语法树,编辑后跟着当前文档', () => {
    const views: EditorView[] = []
    afterEach(() => { for (const v of views.splice(0)) v.destroy() })
    const mount = (spec: string) => {
        const { doc, sels } = parse(spec)
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const view = liteMonaco({
            parent, highlighter: hl as never, doc, lang: 'typescript', theme: 'dark-plus', fileName: '/r5-brackets.ts',
            features: { autocomplete: false, signatureHelp: false, hover: false, codeActions: false, tsDiagnostics: false, minimap: false, stickyScroll: false },
        })
        views.push(view)
        view.dispatch(view.state.update({ selection: EditorSelection.create(sels.map(([a, h]) => EditorSelection.range(a, h)), 0) }))
        return view
    }
    const got = (v: EditorView) => {
        const out: number[] = []
        const it = bracketMatchingDecorations(v.state, v).iter()
        while (it.value) { out.push(it.from); it.next() }
        return out
    }
    it('r = /a(b/g; f(x‸):TS 就绪前退回 shiki(配不上),就绪后 [13,15];前面插字后仍对', async () => {
        const v = mount('r = /a(b/g; f(x‸)')
        expect(got(v)).toEqual([])
        // 等 TS 加载 + 空闲回调里的首次解析(发一个空 effect 事务)
        let refreshed = false
        const off = v.onTransaction(tr => { if (!tr.docChanged && tr.effects.length) refreshed = true })
        for (let i = 0; i < 600 && !refreshed; i++) await new Promise(r => setTimeout(r, 50))
        off()
        expect(refreshed).toBe(true)
        expect(got(v)).toEqual([13, 15])
        let refreshes = 0
        const off2 = v.onTransaction(tr => { if (!tr.docChanged && tr.effects.length) refreshes++ })
        v.dispatch(v.state.update({ changes: { from: 0, insert: 'let ' }, selection: EditorSelection.cursor(19) }))
        // 新表还在路上:同步查到的是旧表映射后的临时答案,正则体里的 ( 仍被跳过
        expect(got(v)).toEqual([17, 19])
        // 新表回来(发 refresh)后是精确答案
        await vi.waitFor(() => expect(refreshes).toBeGreaterThan(0), { timeout: 30_000 })
        off2()
        expect(got(v)).toEqual([17, 19])
        // 光标挪到前面再回来:同一版文档复用区间表
        v.dispatch(v.state.update({ selection: EditorSelection.cursor(0) }))
        v.dispatch(v.state.update({ selection: EditorSelection.cursor(19) }))
        expect(got(v)).toEqual([17, 19])
    }, SLOW)
})
