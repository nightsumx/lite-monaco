// 第六轮 T 组:token 缓存增量重扫的收敛判断。
// Monaco 0.52(TokenizationStateStore):从改动行往下重扫,直到某行算出的出口 state 与该行旧的入口 state
// equals(vscode-textmate StateStack.equals:逐帧比 ruleId / endRule / depth,再比 contentName 栈)才停。
// 修前四个洞,都会让下面几行留着旧 token(高亮、括号跳过掩码、闭括号回缩跟着错):
//   - 只比 getScopes():只有每帧的 name,块 { 和模板串 ` 的帧 name 都是外层的 meta.block,heredoc 的结束串
//     (endRule)也不在里面,两个不同的状态被当成一样;
//   - 收敛检查从改动区第一行就开始:整篇替换、多光标、行数不变的多行粘贴,首行没变就当场停扫,
//     后面改过的行根本没重算(/tmp/lc-hunt/r5/E/tokens-stale.ts 的整篇替换就是这个);
//   - 48 行窗口没收敛时,窗口后第一行的入口被盖掉却还标着已 tokenize;
//   - 大文档视口大跳跃按猜的 seed 算的行,之后从上面接上时直接沿用,不比 state。
// 黄金标准:同一份文本从零 tokenize(另一个 owner 的缓存)逐 token 相等。
import { beforeAll, describe, expect, it } from 'vitest'
import { createHighlighter, type Highlighter } from 'shiki'
import type { Transaction } from '../../src/core/model/state'

const { EditorState } = await import('../../src/core/model/state')
const tokens = await import('../../src/core/view/tokens')
const { bracketSkip } = await import('../../src/core/edit/brackets')
const { selectTokenCache, ensureTokenCache, ensureTokenizedRange, prepareLinesFromTransaction, linesForDoc, tokensInLineRange } = tokens
type ScopedShiki = import('../../src/core/view/tokens').ScopedShiki

let hl: Highlighter
beforeAll(async () => {
    hl = await createHighlighter({ themes: ['dark-plus'], langs: ['typescript', 'shellscript', 'markdown', 'html'] })
})

// 逐行 codeToTokens 计数(效率断言用)
function counting() {
    const n = { calls: 0 }
    const w: ScopedShiki = {
        getLoadedLanguages: () => hl.getLoadedLanguages(),
        getLastGrammarState: t => hl.getLastGrammarState(t as never) as never,
        codeToTokens: (code, o) => { n.calls++; return hl.codeToTokens(code, o as never) as never },
    }
    return { n, w }
}

const ser = (from = 1, to = 1e9) => tokensInLineRange(from, to).map(l => l.map(t => `${t.content}:${t.color}`).join('|'))

function fresh(lang: string, doc: string) {
    selectTokenCache({})
    const lines = doc.split('\n')
    ensureTokenCache(hl as never, lines, { lang, theme: 'dark-plus' })
    ensureTokenizedRange(1, lines.length)
    return ser()
}

// 照 EditorView.update:先 prepareLinesFromTransaction(单行编辑原地改行表),再由消费者 ensureTokenCache(linesForDoc)
function session(lang: string, doc: string, w: ScopedShiki = hl as never) {
    const owner = {}
    const opts = { lang, theme: 'dark-plus' }
    let state = EditorState.create({ doc })
    selectTokenCache(owner)
    ensureTokenCache(w, doc.split('\n'), opts)
    const s = {
        owner,
        get state() { return state },
        // consume = false:模拟两笔事务之间没有消费者取 token
        edit(changes: { from: number, to?: number, insert: string } | { from: number, to?: number, insert: string }[], consume = true) {
            const tr: Transaction = state.update({ changes })
            selectTokenCache(owner)
            prepareLinesFromTransaction(tr)
            state = tr.apply()
            if (consume) s.sync()
        },
        sync() {
            selectTokenCache(owner)
            ensureTokenCache(w, linesForDoc(state.doc.lines) ?? state.doc.toJSON(), opts)
        },
        tokens() {
            s.sync()
            ensureTokenizedRange(1, state.doc.lines)
            return ser()
        },
    }
    return s
}

describe('收敛用 StateStack.equals,不是 getScopes()', () => {
    it('块 { 和模板串 ` 的帧 getScopes 一样:改成 f(`${ 后下一行 }` 收尾,再往下的行要重算', () => {
        const s = session('typescript', 'function f() {\nif (a) {\n}`\nz()\nw()\n}')
        s.edit({ from: 15, to: 23, insert: 'f(`${' })
        // 修前:第 4 行 z() 还是代码色(实际在模板串里)
        expect(s.tokens()).toEqual(fresh('typescript', s.state.doc.toString()))
    })

    it('heredoc 的结束串(endRule)改了:<<EOF → <<END,下面的 EOF 不再结束 heredoc', () => {
        const doc = 'cat <<EOF\nhello\nEOF\necho hi\nEND\nls'
        const s = session('shellscript', doc)
        s.edit({ from: 6, to: 9, insert: 'END' })
        const want = fresh('shellscript', s.state.doc.toString())
        expect(s.tokens()).toEqual(want)
        // 第 3 行 EOF 现在是 heredoc 内容(字符串色),第 4 行 echo 也是
        expect(want[2]).not.toEqual(fresh('shellscript', doc)[2])
    })
})

describe('收敛只能在改动区之后算', () => {
    it('整篇替换,首行没变(tokens-stale.ts):x = ` → x = `${,括号跳过跟着新 token', () => {
        const s = session('typescript', 'function f() {\nx = `\n        }')
        s.edit({ from: 0, to: s.state.doc.length, insert: 'function f() {\nx = `${\n        ' })
        expect(s.tokens()).toEqual(fresh('typescript', s.state.doc.toString()))
        // 第 3 行在 ${ 里面:是代码,不跳过(修前沿用旧掩码,当成模板串文字)
        const skip = bracketSkip(s.owner, s.state.doc)!
        expect([20, 22, 23, 30].map(p => skip(p))).toEqual([false, false, false, false])
    })

    it('多光标同时改两行(行数不变):第二处也重算', () => {
        const doc = 'const a = 1\nconst b = 2\nconst c = 3\nconst d = 4\nconst e = 5'
        const s = session('typescript', doc)
        s.edit([{ from: 11, insert: ' /*' }, { from: 35, insert: ' */ "' }])
        expect(s.tokens()).toEqual(fresh('typescript', s.state.doc.toString()))
    })

    it('两笔事务之间没人取 token:第一笔原地改过的行不丢', () => {
        const doc = Array.from({ length: 30 }, (_, i) => `const v${i} = ${i}`).join('\n')
        const s = session('typescript', doc)
        s.edit({ from: s.state.doc.line(20).to, insert: ' /*' }, false)
        s.edit({ from: s.state.doc.line(5).to, insert: ' "x"' }, false)
        expect(s.tokens()).toEqual(fresh('typescript', s.state.doc.toString()))
    })

    it('两笔事务之间没人取 token:先换行再原地改', () => {
        const doc = Array.from({ length: 30 }, (_, i) => `const v${i} = ${i}`).join('\n')
        const s = session('typescript', doc)
        s.edit({ from: s.state.doc.line(10).to, insert: '\nlet q = `' }, false)
        s.edit({ from: s.state.doc.line(3).to, insert: ' /* */' }, false)
        expect(s.tokens()).toEqual(fresh('typescript', s.state.doc.toString()))
    })
})

describe('窗口没收敛 / 大跳跃猜的 seed', () => {
    it('打开一个不闭合的块注释:48 行窗口后第一行不留旧 token', () => {
        const doc = Array.from({ length: 120 }, (_, i) => `const v${i} = ${i}`).join('\n')
        const s = session('typescript', doc)
        s.edit({ from: s.state.doc.line(10).to, insert: ' /*' })
        expect(s.tokens()).toEqual(fresh('typescript', s.state.doc.toString()))
    })

    it('大文档先跳到注释中间(猜 seed),再从上面接上:接上处 state 对不上就重算', () => {
        const lines: string[] = []
        for (let i = 0; i < 3000; i++) lines.push(i === 1000 ? '/*' : i === 1200 ? '*/' : `const v${i} = f(${i})`)
        const doc = lines.join('\n')
        const s = session('typescript', doc)
        selectTokenCache(s.owner)
        ensureTokenizedRange(1100, 1140) // 往上 80 行内没有已 tokenize 的:按初始 state 猜,当成代码
        ensureTokenizedRange(1, 1140) // 从文件头一路接下来
        const want = fresh('typescript', doc)
        selectTokenCache(s.owner)
        expect(ser(1095, 1140)).toEqual(want.slice(1094, 1140))
        expect(s.tokens()).toEqual(want)
    })
})

describe('效率:换了比较方式也不会每键扫到文末', () => {
    // 每个位置敲一个字符,数重扫行数:代码、模板串里、块注释里、嵌入语言(markdown 代码块、html script)、begin/while(引用块)
    const cases: [string, string, string][] = [
        ['typescript', Array.from({ length: 200 }, (_, i) => `const v${i} = foo(${i}) + bar[${i}]`).join('\n'), 'v100 '],
        ['typescript', 'const t = `\n' + Array.from({ length: 200 }, (_, i) => `  line ${i} \${x}`).join('\n') + '\n`', 'line 100'],
        ['typescript', '/*\n' + Array.from({ length: 200 }, (_, i) => ` * line ${i}`).join('\n') + '\n */', 'line 100'],
        ['markdown', '# t\n\n```ts\n' + Array.from({ length: 200 }, (_, i) => `const v${i} = \`${i}\``).join('\n') + '\n```\n', 'v100 '],
        ['markdown', Array.from({ length: 200 }, (_, i) => `> quote ${i} *x*`).join('\n'), 'quote 100'],
        ['html', '<script>\n' + Array.from({ length: 200 }, (_, i) => `let v${i} = "${i}"`).join('\n') + '\n</script>', 'v100 '],
    ]
    for (const [lang, doc, at] of cases) {
        it(`${lang}:${JSON.stringify(at)} 处打字只重扫 1~2 行`, () => {
            const { n, w } = counting()
            const s = session(lang, doc, w)
            let pos = doc.indexOf(at) + at.length
            const per: number[] = []
            for (const ch of 'abc') {
                const before = n.calls
                s.edit({ from: pos, insert: ch })
                pos++
                per.push(n.calls - before)
            }
            expect(Math.max(...per)).toBeLessThanOrEqual(2)
            expect(s.tokens()).toEqual(fresh(lang, s.state.doc.toString()))
        })
    }
})

describe('千行文档不再冷启动全文分词(EAGER_MAX_LINES = 400)', () => {
    // 1000 行 > 400:ensureTokenCache 只建骨架,视口按需。用户在 Filo 里打开一个 1000 行的 TS,首屏从 430 ms 降到 60 ms 靠的就是这个。
    const lines: string[] = []
    for (let i = 0; i < 1000; i++) lines.push(i === 100 ? '/*' : i === 700 ? '*/' : `const v${i} = f(${i})`)
    const doc = lines.join('\n')

    it('冷启动一行都不分词;只要视口时只分视口(加回填)那几行', () => {
        const { n, w } = counting()
        const s = session('typescript', doc, w)
        expect(n.calls).toBe(0)
        selectTokenCache(s.owner)
        ensureTokenizedRange(1, 40)
        expect(n.calls).toBeLessThan(60)
    })

    it('跳到块注释中间,再从文件头一路接下来:与整篇从零分词逐 token 相等', () => {
        const s = session('typescript', doc)
        selectTokenCache(s.owner)
        ensureTokenizedRange(400, 440) // 猜的 seed:当成代码
        ensureTokenizedRange(1, 440)
        expect(s.tokens()).toEqual(fresh('typescript', doc))
    })
})
