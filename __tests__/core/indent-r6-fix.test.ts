// 第六轮 I 组:缩进。
// 真值:Monaco 0.52 源码(common/model.js TextModelResolvedOptions 的 _indentSizeIsTabSize、textModel.updateOptions、
// contrib/indentation ChangeIndentationSizeAction、cursorDeleteOperations deleteLeft)+ 对照页实测(/tmp/lc-hunt/r6/I/opts.ts、bs.ts)。
import { describe, expect, it } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'
import type { Transaction } from '../../src/core/model/state'
import { indentConfig } from '../../src/core/edit/enter'
import { applyIndentOptions, autoIndentFacet, deleteCharBackward, detectIndentationFromContent, indentOptions, indentRulesFacet, indentToTabs } from '../../src/core/edit/commands'
import { insertNewlineAndIndent } from '../../src/core/edit/enter'
import { autoIndentOnType, indentOnInput } from '../../src/core/edit/indentoninput'
import { closeBrackets, closeBracketsInput } from '../../src/core/edit/closebrackets'
import { commentTokensFacet } from '../../src/core/edit/commenttokens'
import { insertTab, indentLess } from '../../src/core/edit/tab'
import { guideLevel, indentUnit } from '../../src/core/feature/indentguides'

type Cmd = (t: { state: EditorState, dispatch: (tr: Transaction) => void }) => boolean

function editor(doc: string, extensions: unknown[] = []) {
    let state = EditorState.create({ doc, extensions: [indentOptions.of([]), ...extensions as never[]] })
    const api = {
        get state() { return state },
        run(cmd: Cmd) { return cmd({ state, dispatch: (tr) => { state = tr.apply() } }) },
        // Indent Using Spaces / Tabs:tabSize = indentSize = N;Change Tab Display Size:只给 tabSize
        spaces(n: number) { api.run(applyIndentOptions({ tabSize: n, indentSize: n, insertSpaces: true })) },
        tabs(n: number) { api.run(applyIndentOptions({ tabSize: n, indentSize: n, insertSpaces: false })) },
        display(n: number) { api.run(applyIndentOptions({ tabSize: n })) },
        opts() { const c = indentConfig(state); return [c.tabSize, c.indentSize, c.insertSpaces] },
        at(line: number, col: number) {
            const l = state.doc.line(line)
            state = state.update({ selection: EditorSelection.cursor(l.from + Math.min(col - 1, l.length)) }).apply()
            return api
        },
        // 在 (line, col) 跑一条命令,返回该行文本,然后撤回(回到原文档)
        probe(line: number, col: number, cmd: Cmd) {
            const before = state
            api.at(line, col).run(cmd)
            const text = state.doc.line(line).text
            state = before
            return text
        },
        guides(line: number) { return guideLevel(state.doc, line, indentUnit(state), state.tabSize) },
    }
    return api
}

// 对照页同款:第 3 行 8 空格,第 6 行 `x`,第 7 行 8 个空格
const DOC4 = 'function f() {\n    if (a) {\n        b()\n    }\n}\nx\n        \n'
const DOC2 = 'function f() {\n  if (a) {\n    b()\n  }\n}\nx\n        \n'

describe('缩进选项:indentSize 默认跟着 tabSize 走(Monaco indentSize: \'tabSize\')', () => {
    it('Change Tab Display Size 2:indentSize 跟到 2,Tab 插 2 格、退格删 2 格、参考线 4 根', () => {
        const e = editor(DOC4)
        e.display(2)
        expect(e.opts()).toEqual([2, 2, true])
        expect(e.probe(6, 1, insertTab)).toBe('  x')
        expect(e.probe(6, 2, insertTab)).toBe('x ')
        expect(e.probe(7, 9, deleteCharBackward)).toBe('      ')
        expect(e.probe(3, 9, indentLess)).toBe('      b()')
        expect(e.guides(3)).toBe(4)
        expect(e.state.indentUnit).toBe('  ')
    })

    it('Change Tab Display Size 8:indentSize 跟到 8', () => {
        const e = editor(DOC4)
        e.display(8)
        expect(e.opts()).toEqual([8, 8, true])
        expect(e.probe(6, 1, insertTab)).toBe('        x')
        expect(e.probe(3, 9, indentLess)).toBe('b()')
        expect(e.guides(3)).toBe(1)
    })

    it('Indent Using Spaces 之后 indentSize 是显式的,再改显示宽不动它', () => {
        const e = editor(DOC4)
        e.spaces(2)
        e.display(8)
        expect(e.opts()).toEqual([8, 2, true])
        expect(e.probe(6, 1, insertTab)).toBe('  x')
        expect(e.guides(3)).toBe(4)
        // 显示宽 2 → Spaces 4 → 显示宽 8
        const f = editor(DOC4)
        f.display(2)
        f.spaces(4)
        f.display(8)
        expect(f.opts()).toEqual([8, 4, true])
        expect(f.guides(3)).toBe(2)
    })

    it('Indent Using Tabs 2 → 显示宽 4:indentSize 留在 2(Tab 字符按 4 宽显示,参考线按 2)', () => {
        const e = editor(DOC4)
        e.tabs(2)
        e.display(4)
        expect(e.opts()).toEqual([4, 2, false])
        expect(e.probe(6, 1, insertTab)).toBe('\tx')
        expect(e.probe(6, 2, insertTab)).toBe('x\t')
        expect(e.probe(3, 9, indentLess)).toBe('\tb()')
        expect(e.guides(3)).toBe(4)
        expect(e.state.indentUnit).toBe('\t')
    })

    it('Detect Indentation 之后 indentSize 是显式的(Monaco detectIndentation 写 indentSize: N)', () => {
        const e = editor(DOC2)
        e.run(detectIndentationFromContent)
        e.display(8)
        expect(e.opts()).toEqual([8, 2, true])
        expect(e.probe(3, 5, indentLess)).toBe('  b()')
        expect(e.guides(3)).toBe(2)
        // 显示宽 2 → Detect:回到猜出来的 4
        const f = editor(DOC4)
        f.display(2)
        f.run(detectIndentationFromContent)
        expect(f.opts()).toEqual([4, 4, true])
    })

    it('Convert Indentation to Tabs 只改 insertSpaces,indentSize 仍跟着 tabSize', () => {
        const e = editor(DOC4)
        e.run(indentToTabs)
        e.display(2)
        expect(e.opts()).toEqual([2, 2, false])
    })

    it('宿主显式配的空格缩进单元当显式 indentSize,改显示宽不动它', () => {
        const e = editor(DOC2, [EditorState.indentUnit.of('  ')])
        e.display(8)
        expect(e.opts()).toEqual([8, 2, true])
    })
})

describe('退格在前导空白里删到上一个 indentSize 停靠点(Monaco deleteLeft useTabStops)', () => {
    // [文本, 光标列, tabSize, indentSize, insertSpaces] → [结果, 光标列];对照页实测(/tmp/lc-hunt/r6/I/bs.ts)
    const cases: [string, number, number, number, boolean, string, number][] = [
        ['\t\tx', 3, 4, 2, false, '\tx', 2],
        ['\t\tx', 3, 4, 4, true, '\tx', 2],
        ['  \tx', 4, 4, 4, true, 'x', 1],
        ['  \tx', 4, 4, 2, true, '  x', 3],
        ['\t   x', 5, 4, 4, true, '\tx', 2],
        ['\t  x', 4, 4, 4, true, '\tx', 2],
        ['   \t  x', 7, 4, 3, true, '   x', 4],
        ['      ', 7, 8, 4, true, '    ', 5],
        ['     x', 4, 8, 2, true, '    x', 3],
    ]
    for (const [text, col, tabSize, indentSize, insertSpaces, want, wantCol] of cases) {
        it(`${JSON.stringify(text)} 列 ${col},tab ${tabSize} / indent ${indentSize}${insertSpaces ? '' : ' / Tab'}`, () => {
            const e = editor(text)
            // Indent Using Spaces / Tabs N,再 Change Tab Display Size
            e.run(applyIndentOptions({ tabSize: indentSize, indentSize, insertSpaces }))
            e.display(tabSize)
            expect(e.opts()).toEqual([tabSize, indentSize, insertSpaces])
            e.at(1, col).run(deleteCharBackward)
            expect(e.state.doc.toString()).toBe(want)
            expect(e.state.selection.main.head + 1).toBe(wantCol)
        })
    }
})

// —— indentationRules 参与回车 / 打字(Monaco autoIndent.js,editor.autoIndent = 'full')——
// 期望值是对照页实测(/tmp/lc-hunt/r6/I/autoindent.ts:Monaco setLanguageConfiguration 配同一套规则 + autoIndent: 'full')。
// Monaco standalone 默认 autoIndent 是 'advanced'(editor.api.js),这时规则不参与回车 / 打字,lite-monaco 默认同。

// VS Code typescript-basics 的 indentationRules
const TS_RULES = {
    decreaseIndentPattern: /^\s*[\}\]\)].*$/,
    increaseIndentPattern: /^.*(\{[^}]*|\([^)]*|\[[^\]]*)$/,
    indentNextLinePattern: /^((.*=>\s*)|((.*[^\w]+|\s*)(if|while|for)\s*\(.*\)\s*))$/,
    unIndentedLinePattern: /^(\t|[ ])*[ ]\*[^/]*\*\/\s*$|^(\t|[ ])*[ ]\*\/\s*$|^(\t|[ ])*\*([ ]([^\*]|\*(?!\/))*)?$/,
}

// `|` 标光标
function ruled(doc: string, mode: 'full' | 'advanced' | 'none' = 'full') {
    const at = doc.indexOf('|')
    const exts: unknown[] = [commentTokensFacet.of({ line: '//', block: { open: '/*', close: '*/' } }), closeBrackets(), indentOptions.of([])]
    if (mode !== 'none') exts.push(indentRulesFacet.of(TS_RULES))
    if (mode === 'full') exts.push(autoIndentFacet.of('full'))
    let state = EditorState.create({ doc: doc.replace('|', ''), selection: EditorSelection.cursor(at), extensions: exts as never[] })
    const view = {
        get state() { return state },
        dispatch(tr: Transaction) { state = tr.apply() },
    }
    return {
        get state() { return state },
        text() { const t = state.doc.toString(), o = state.selection.main.head; return t.slice(0, o) + '|' + t.slice(o) },
        run(cmd: Cmd) { cmd(view); return this },
        // 打一个字符:同 liteMonaco() 的输入拦截顺序(autoIndentOnType → 自动配对 → 行首闭括号回缩 → 普通插入)
        type(ch: string) {
            const { from, to } = state.selection.main
            const handlers = [autoIndentOnType, closeBracketsInput, indentOnInput]
            if (!handlers.some(h => h(view as never, from, to, ch)))
                view.dispatch(state.update({ changes: { from, to, insert: ch }, selection: EditorSelection.cursor(from + ch.length), userEvent: 'input.type' }))
            return this
        },
    }
}

describe('autoIndent full:回车按 indentationRules(Monaco getIndentForEnter)', () => {
    const cases: [string, string, string][] = [
        ['if 后多缩一级(indentNextLine)', 'if (a)|', 'if (a)\n    |'],
        ['if 体后回到 if 那层', 'if (a)\n    b()|', 'if (a)\n    b()\n|'],
        ['箭头后多缩一级', 'const f = () =>|', 'const f = () =>\n    |'],
        ['普通行保持', 'function f() {\n    return 1;|', 'function f() {\n    return 1;\n    |'],
        ['开括号走括号规则', '    foo(|', '    foo(\n        |'],
        ['光标后是 ) 回缩', 'foo(\n    a|)', 'foo(\n    a\n|)'],
        ['光标后是 ] 回缩', 'x = [\n    1|]', 'x = [\n    1\n|]'],
        ['光标在缩进里:后面的缩进换掉,光标留在原视觉列', 'if (a) {\n    b()\n  |  c()', 'if (a) {\n    b()\n  \n  |  c()'],
        ['光标在行首:后面 8 格换成推出来的 4 格', 'if (a) {\n    b()\n|        c()', 'if (a) {\n    b()\n\n|    c()'],
        ['光标后有空白', 'if (a) {\n    b()|    \n}', 'if (a) {\n    b()\n    |    \n}'],
        ['块注释结尾后', 'function f() {\n    /**\n     * x\n     */|', 'function f() {\n    /**\n     * x\n     */\n    |'],
        ['上面只有空行', '\n\nfoo|', '\n\nfoo\n|'],
        ['两层 if 后回到顶', 'if (a)\n    if (b)\n        c()|', 'if (a)\n    if (b)\n        c()\n|'],
        ['{ 和正文之间回车', 'function f() {|return 1', 'function f() {\n    |return 1'],
        ['} 后', 'function f() {\n    a()\n}|', 'function f() {\n    a()\n}\n|'],
        ['空白行上回车', 'function f() {\n    a()\n    |', 'function f() {\n    a()\n    \n    |'],
    ]
    for (const [name, doc, want] of cases) {
        it(name, () => {
            expect(ruled(doc).run(insertNewlineAndIndent).text()).toBe(want)
        })
    }

    it('autoIndent advanced(默认)/ 没配规则:回车不看规则', () => {
        expect(ruled('if (a)|', 'advanced').run(insertNewlineAndIndent).text()).toBe('if (a)\n|')
        expect(ruled('foo(\n    a|)', 'advanced').run(insertNewlineAndIndent).text()).toBe('foo(\n    a\n    |)')
        expect(ruled('if (a)|', 'none').run(insertNewlineAndIndent).text()).toBe('if (a)\n|')
    })

    it('Tab 键在空白行上补到规则推出的缩进(Monaco _goodIndentForLine)', () => {
        expect(ruled('if (a)\n|').run(insertTab).text()).toBe('if (a)\n    |')
        expect(ruled('if (a)\n    b()\n|').run(insertTab).text()).toBe('if (a)\n    b()\n    |')
        expect(ruled('if (a)\n    b()\n|', 'advanced').run(insertTab).text()).toBe('if (a)\n    b()\n    |')
    })
})

describe('autoIndent full:打字按 indentationRules(Monaco getIndentActionForType)', () => {
    const cases: [string, string, string, string][] = [
        ['} 回缩', 'function f() {\n    a()\n    |', '}', 'function f() {\n    a()\n}|'],
        ['] 回缩', 'x = [\n    1,\n    |', ']', 'x = [\n    1,\n]|'],
        [') 回缩', 'foo(\n    a,\n    |', ')', 'foo(\n    a,\n)|'],
        ['if 下一行打 { 回到 if 那层并自动配对', 'if (a)\n    |', '{', 'if (a)\n{|}'],
        ['if 下一行打 { 后面有字:不配对也不回缩', 'if (a)\n    |x', '{', 'if (a)\n    {|x'],
        ['} 没有配对的开括号也按规则回缩', '    a\n    |', '}', '    a\n}|'],
        ['if 体里打 }', 'if (a)\n    b()\n    |', '}', 'if (a)\n    b()\n}|'],
        ['嵌套', 'function f() {\n    if (a) {\n        b()\n        |', '}', 'function f() {\n    if (a) {\n        b()\n    }|'],
        ['已对齐', 'function f() {\n    a()\n|', '}', 'function f() {\n    a()\n}|'],
        ['光标在缩进中间(Monaco substring 两端对调)', 'function f() {\n    a()\n  |  x', '}', 'function f() {\n    a()\n  }|  x'],
        ['行首有字不动', 'function f() {\n    a()\n    x|', '}', 'function f() {\n    a()\n    x}|'],
        ['普通字母不动', 'function f() {\n    a()\n        |', 'b', 'function f() {\n    a()\n        b|'],
    ]
    for (const [name, doc, ch, want] of cases) {
        it(name, () => {
            expect(ruled(doc).type(ch).text()).toBe(want)
        })
    }

    it('autoIndent advanced(默认):if 下一行打 { / 无配对的 } 不看规则', () => {
        expect(ruled('if (a)\n    |', 'advanced').type('{').text()).toBe('if (a)\n    {|}')
        expect(ruled('    a\n    |', 'advanced').type('}').text()).toBe('    a\n    }|')
        expect(ruled('if (a)\n    b()\n    |', 'advanced').type('}').text()).toBe('if (a)\n    b()\n    }|')
    })

    it('自动配对的闭符照常登记:接着打 } 过键', () => {
        expect(ruled('if (a)\n    |').type('{').type('}').text()).toBe('if (a)\n{}|')
    })
})

// 对照页实测:/tmp/lc-hunt/r6/I/autoindent.ts --no-rules --advanced
describe('行首闭括号回缩(Monaco electric char,不看规则)', () => {
    it('光标在缩进中间:光标到第一个非空白之间的空白留在闭符前(Monaco substring 两端对调)', () => {
        expect(ruled('function f() {\n    a()\n  |  x', 'none').type('}').text()).toBe('function f() {\n    a()\n  }|  x')
        expect(ruled('function f() {\n    a()\n|  x', 'none').type('}').text()).toBe('function f() {\n    a()\n  }|  x')
    })
    it('开符行的缩进按当前选项规范化(Tab 缩进、insertSpaces 时换成空格)', () => {
        expect(ruled('function f() {\n\tif (a) {\n\t\tb()\n\t\t|', 'none').type('}').text()).toBe('function f() {\n\tif (a) {\n\t\tb()\n    }|')
    })
})
