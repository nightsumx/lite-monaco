// 第五轮 E 组:缩进规则 / 输入时回缩认 token 类型。
// Monaco 0.52:Reindent(getReindentEditOperations)经 ProcessedIndentRulesSupport 把字符串 / 注释 / 正则 token 里的
// 括号删掉再套 indentationRules,行首是字符串 token 的行(模板串续行、`"…"` 开头)整行跳过;
// 行首敲闭括号回缩(BracketElectricCharacterSupport)光标处的 token 是字符串 / 注释 / 正则就不回缩。
// 真值:对照页实测(/tmp/lc-hunt/r5/E/mon-reindent.ts、mon-type.ts),token 用真 shiki(typescript + dark-plus)。
import { beforeAll, describe, expect, it } from 'vitest'
import { createHighlighter, type Highlighter } from 'shiki'
import { setMacPlatform } from './f5-replay'
import type { Transaction } from '../../src/core/model/state'

setMacPlatform()
const core = await import('../../src/core/index')
const { EditorState } = await import('../../src/core/model/state')
const { EditorSelection } = await import('../../src/core/model/selection')
const { selectTokenCache, ensureTokenCache, prepareLinesFromTransaction } = await import('../../src/core/view/tokens')
const brackets = await import('../../src/core/edit/brackets')
const { indentOnCloseBracket } = await import('../../src/core/edit/indentoninput')

const OPTS = { lang: 'typescript', theme: 'dark-plus' }
let hl: Highlighter
beforeAll(async () => {
    hl = await createHighlighter({ themes: ['dark-plus'], langs: ['typescript'] })
})

// VS Code typescript-basics 的规则(r4p-fix.test.ts 同款)
const TS_RULES = {
    decreaseIndentPattern: /^\s*[\}\]\)].*$/,
    increaseIndentPattern: /^.*(\{[^}]*|\([^)]*|\[[^\]]*)$/,
    indentNextLinePattern: /^((.*=>\s*)|((.*[^\w]+|\s*)(if|while|for)\s*\(.*\)\s*))$/,
    unIndentedLinePattern: /^(\t|[ ])*[ ]\*[^/]*\*\/\s*$|^(\t|[ ])*[ ]\*\/\s*$|^(\t|[ ])*\*([ ]([^\*]|\*(?!\/))*)?$/,
}

// target 自带 token 缓存(owner = target,和 view 一样);dispatch 时照 EditorView.update 先改行表
function reindent(doc: string, withTokens = true) {
    let state = EditorState.create({ doc, selection: EditorSelection.single(0), extensions: [core.indentRulesFacet.of(TS_RULES)] })
    const target = {
        get state() { return state },
        dispatch(tr: Transaction) {
            selectTokenCache(target)
            prepareLinesFromTransaction(tr)
            state = tr.apply()
        },
    }
    if (withTokens) {
        selectTokenCache(target)
        ensureTokenCache(hl as never, doc.split('\n'), OPTS)
    }
    core.reindentLines(target)
    return state.doc.toString()
}

describe('Reindent Lines:字符串 / 注释 / 正则里的括号不算(mon-reindent.ts)', () => {
    const cases: [string, string, string][] = [
        ['字符串里的 {', 'a("{")\nb()\n', 'a("{")\nb()\n'],
        ['字符串里的 (', 'x = "("\ny\n', 'x = "("\ny\n'],
        ['行注释里的 {', 'a() // {\nb()\n', 'a() // {\nb()\n'],
        ['块注释里的 {', 'a() /* { */\nb()\n', 'a() /* { */\nb()\n'],
        // `/[/` 这种没收尾的 Monaco(Monarch)当正则、TextMate 不当,换成两边都认的
        ['正则里的 [', 'x = /\\[/\ny\n', 'x = /\\[/\ny\n'],
        ['正则里的 (', 'x = /[(]/\ny\n', 'x = /[(]/\ny\n'],
        ['代码里的 { 照旧', 'f() {\nb()\n}\n', 'f() {\n    b()\n}\n'],
        // 行首是字符串 token:整行不动、也不影响后面
        ['行首字符串 "}"', 'f() {\n"}"\nb()\n}\n', 'f() {\n"}"\n    b()\n}\n'],
        ['行首字符串 "a"', 'f() {\n"a"\nb()\n}\n', 'f() {\n"a"\n    b()\n}\n'],
        ['模板串续行', 'f() {\nx = `\n{\n  `\nb()\n}\n', 'f() {\n    x = `\n{\n  `\n    b()\n}\n'],
        ['模板串续行 2', 'x = `a\n    b {\nc`\nd()\n', 'x = `a\n    b {\nc`\nd()\n'],
    ]
    for (const [name, doc, want] of cases)
        it(name, () => expect(reindent(doc)).toBe(want))

    it('没有 token 信息时照纯文本匹配(现状)', () => {
        expect(reindent('a("{")\nb()\n', false)).toBe('a("{")\n    b()\n    ')
    })
})

describe('行首敲闭括号:光标在注释 / 字符串里不回缩(mon-type.ts)', () => {
    const type = (doc: string, at: number) => {
        const owner = {}
        selectTokenCache(owner)
        ensureTokenCache(hl as never, doc.split('\n'), OPTS)
        const state = EditorState.create({ doc })
        const r = indentOnCloseBracket(state, at, '}', brackets.bracketSkip(owner, state.doc))
        return r ? doc.slice(0, r.from) + r.insert + doc.slice(r.to) : doc.slice(0, at) + '}' + doc.slice(at)
    }
    const end = (doc: string) => [doc, doc.length] as const
    it('代码里回缩', () => expect(type(...end('function f() {\n        '))).toBe('function f() {\n}'))
    it('块注释里不回缩', () => expect(type(...end('function f() {\n/*\n        '))).toBe('function f() {\n/*\n        }'))
    it('块注释里、光标后还有字', () => {
        const doc = 'function f() {\n/*\n        x */'
        expect(type(doc, doc.indexOf('x'))).toBe('function f() {\n/*\n        }x */')
    })
    it('模板串里不回缩', () => expect(type(...end('function f() {\nx = `\n        '))).toBe('function f() {\nx = `\n        }'))
    it('模板串里、光标后还有字', () => {
        const doc = 'function f() {\nx = `\n        a`'
        expect(type(doc, doc.indexOf('a`'))).toBe('function f() {\nx = `\n        }a`')
    })
    it('模板串 ${ } 里是代码,回缩', () => expect(type(...end('function f() {\nx = `${\n        '))).toBe('function f() {\nx = `${\n}'))
    it('注释里的空行问不到 token,照旧回缩(Monaco 同)', () => expect(type(...end('function f() {\n    /*\n'))).toBe('function f() {\n    /*\n}'))
})
