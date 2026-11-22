// 第六轮 T 组:括号跳字符串/注释的 shiki 路径(非 TS 语言,以及 TS 跳过源没就绪时)。
// 修前:每行第一次被问到都要再 tokenize 一遍带 scope 的(grammar.tokenizeLine,~0.1ms/行),
// 顶层光标向前扫 4 万字符要给 120~230 行算掩码,commands.ts 上冷查找 14~24ms。
// 修后:高亮时 shiki 本来就跑的 tokenizeLine2 metadata 里有 StandardTokenType,tokens.ts 顺手按行留下,
// brackets.ts 直接拿来当掩码;只有 String 段里有括号的行(模板串 `${` `}` 是 String 类型,但要算括号)才照旧按 scope 算。
// 黄金标准:逐个括号和「按 scope 算」(isSkipScopes(tokenizeLine 的 scopes))一致。
import { beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createHighlighter, type Highlighter } from 'shiki'
import { EditorState } from '../../src/core/model/state'
import { bracketSkip, isSkipScopes } from '../../src/core/edit/brackets'
import { ensureTokenCache, ensureTokenizedRange, lineTokenTypes, selectTokenCache, tokenLinesView } from '../../src/core/view/tokens'

const LANGS = ['typescript', 'javascript', 'markdown', 'html', 'vue', 'python', 'shellscript', 'rust', 'php', 'yaml', 'kotlin', 'css', 'go', 'lua', 'ruby']
let hl: Highlighter
beforeAll(async () => {
    hl = await createHighlighter({ themes: ['dark-plus'], langs: LANGS })
})

const SAMPLES: Record<string, string> = {
    typescript: 'const a = `x${f(1, [2])}y` + "(" + \'[\'\n// ( comment )\nconst r = /\\(a[b]/g; g(r)\n/* { */ h({ k: `${`${(1)}`}` })\nlet t = `\n  (still) ${x[0]} ]\n`\n',
    javascript: 'var s = "{" + `${a(b)}`; /* ( */ f(/[(]/.test(s))\n',
    markdown: '# T (x)\n\n```ts\nconst a = "(" + f(1)\n```\n\n> quote [x](y)\n`code (z)` and (p)\n',
    html: '<div title="(a)">(text)</div>\n<script>\nconst x = "(" + f(1)\n// [\n</script>\n<style>a[href="("] { color: red }</style>\n',
    vue: '<template><p :a="f(1)">{{ g("(") }}</p></template>\n<script setup lang="ts">\nconst y = `${h(2)}` // (\n</script>\n',
    python: 's = "(" + f\'{g(1)}\' + r"[" # (\ndef f(a=[1]):\n    """ ( doc """\n    return {a: (1)}\n',
    shellscript: 'echo "(" $(ls [a]) \'{\'\n# ( comment\ncat <<EOF\n(here)\nEOF\nf() { x=$((1+2)); }\n',
    rust: 'let s = r#"(raw"#; let c = \'(\'; f(vec![1]); // (\n/* [ */ g(&s[..])\n',
    php: '<?php $a = "(" . f([1]); // (\n# [\n$b = <<<EOT\n(here {$x[0]})\nEOT;\n',
    yaml: 'a: "(x)"\nb: [1, 2] # (\nc: { d: e }\n',
    kotlin: 'val s = "a${f(1)}(" + \'(\' // (\nval t = """\n(raw) ${g[0]}\n"""\n',
    css: 'a[href="("] { content: "{"; } /* ( */\n@media (min-width: 1px) { b { c: d } }\n',
    go: 's := "(" + `[raw` + string(\'(\') // (\nf(x[0])\n',
    lua: 's = "(" .. [[ (long ]] .. f(1) -- (\n--[[ { ]] g{1}\n',
    ruby: 's = "(#{f(1)})" + \'[\' # (\n=begin\n(\n=end\nputs [1].map { |x| x }\n',
}

// 括号,加上引号(indent.ts startsWithString 拿行首引号问 skip)
const PROBE = '()[]{}"\'`'

function golden(lang: string, doc: string): boolean[] {
    const g = hl.getLanguage(lang) as unknown as { tokenizeLine(l: string, s: unknown): { tokens: { startIndex: number, endIndex: number, scopes: string[] }[], ruleStack: unknown } }
    const out: boolean[] = []
    let st: unknown = null
    let base = 0
    for (const line of doc.split('\n')) {
        const r = g.tokenizeLine(line, st)
        for (const t of r.tokens) {
            const skip = isSkipScopes(t.scopes)
            for (let p = t.startIndex; p < Math.min(t.endIndex, line.length); p++) if (PROBE.includes(line[p])) out[base + p] = skip
        }
        st = r.ruleStack
        base += line.length + 1
    }
    return out
}

function viaCache(lang: string, doc: string) {
    const owner = {}
    selectTokenCache(owner)
    const lines = doc.split('\n')
    ensureTokenCache(hl as never, lines, { lang, theme: 'dark-plus' })
    ensureTokenizedRange(1, lines.length)
    // 数 brackets.ts 自己补算掩码的次数(tokenizeLine 带 scope;高亮走的是 tokenizeLine2)
    const g = hl.getLanguage(lang) as unknown as { tokenizeLine: (...a: unknown[]) => unknown }
    const orig = g.tokenizeLine
    let calls = 0
    g.tokenizeLine = function (this: unknown, ...a: unknown[]) { calls++; return orig.apply(this, a) }
    try {
        const skip = bracketSkip(owner, EditorState.create({ doc }).doc)!
        expect(skip).toBeTypeOf('function')
        const out: boolean[] = []
        for (let p = 0; p < doc.length; p++) if (PROBE.includes(doc[p])) out[p] = skip(p)
        return { out, calls }
    } finally {
        g.tokenizeLine = orig
    }
}

const diff = (a: boolean[], b: boolean[], doc: string) => {
    const bad: string[] = []
    for (let p = 0; p < doc.length; p++) if (a[p] !== b[p]) bad.push(`${p}:${doc[p]} cache=${a[p]} scope=${b[p]} «${doc.slice(Math.max(0, p - 12), p + 6).replace(/\n/g, '⏎')}»`)
    return bad
}

describe('高亮时留下的 token 类型当掩码:结果和按 scope 算一样', () => {
    for (const lang of LANGS) {
        it(lang, () => {
            const doc = SAMPLES[lang]
            const { out } = viaCache(lang, doc)
            expect(diff(out, golden(lang, doc), doc)).toEqual([])
        })
    }

    it('真文件:commands.ts / tokens.ts / brackets.ts 逐个括号一致', () => {
        for (const f of ['src/core/edit/commands.ts', 'src/core/view/tokens.ts', 'src/core/edit/brackets.ts']) {
            const doc = readFileSync(f, 'utf8')
            const { out } = viaCache('typescript', doc)
            expect(diff(out, golden('typescript', doc), doc).slice(0, 5)).toEqual([])
        }
    })

    it('模板串 ${} 的花括号和里面的代码算括号(String 类型但不能跳),字符串 / 注释 / 正则里的不算', () => {
        const doc = 'f(`a${g(1)}b`, "(", /\\(/) // (\n'
        const { out } = viaCache('typescript', doc)
        const at = (s: string, from = 0) => doc.indexOf(s, from)
        expect(out[at('{')]).toBe(false) // ${
        expect(out[at('(', at('g'))]).toBe(false) // g(
        expect(out[at('}')]).toBe(false)
        expect(out[at('"(') + 1]).toBe(true)
        expect(out[at('/\\(') + 2]).toBe(true)
        expect(out[at('// (') + 3]).toBe(true)
        expect(out[0 + 1]).toBe(false) // f(
    })
})

describe('效率:不再为每行补 tokenize', () => {
    it('commands.ts 全文每个括号都问一遍:补算的行只剩 String 段里有括号的(修前 500+ 行)', () => {
        const doc = readFileSync('src/core/edit/commands.ts', 'utf8')
        const { calls } = viaCache('typescript', doc)
        // 这些行是模板串 / 字符串里有括号的,照旧按 scope 算
        const v = tokenLinesView()!
        let strLines = 0
        for (let i = 0; i < v.lines.length; i++) {
            const ty = lineTokenTypes(v.rel[i])
            if (v.lines[i]) expect(ty, `line ${i + 1} 没留下类型`).toBeDefined() // 空行 shiki 不 tokenize
            for (let k = 0; ty && k < ty.length; k += 3)
                if (ty[k + 2] === 2 && /[()[\]{}]/.test(v.lines[i].slice(ty[k], ty[k + 1]))) { strLines++; break }
        }
        expect(strLines).toBeGreaterThan(0)
        expect(calls).toBeLessThanOrEqual(strLines)
        expect(calls).toBeLessThan(40)
    })

    it('没有 String 段括号的语言样本:一次都不补', () => {
        const { calls } = viaCache('python', 'def f(a=[1]):\n    # ( comment\n    return {a: (1)}\n')
        expect(calls).toBe(0)
    })

    it('拿不到 grammar(测试替身没有 getLanguage)照旧能算(走 codeToTokens + explanation)', () => {
        const owner = {}
        selectTokenCache(owner)
        const doc = 'f("(", 1) // )'
        const fake = {
            codeToTokens: (code: string, o: object) => hl.codeToTokens(code, o as never),
            getLastGrammarState: (t: unknown) => hl.getLastGrammarState(t as never),
        }
        ensureTokenCache(fake as never, [doc], { lang: 'typescript', theme: 'dark-plus' })
        ensureTokenizedRange(1, 1)
        const skip = bracketSkip(owner, EditorState.create({ doc }).doc)!
        expect([1, 3, 8, 13].map(p => skip(p))).toEqual([false, true, false, true])
    })
})
