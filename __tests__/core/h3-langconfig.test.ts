// H3:languages.setLanguageConfiguration 接进装配层 —— 注释切换 / 回车 / 自动配对 / 括号匹配 / 折叠标记 / 词定义,改了热生效、dispose 还原。
import { describe, expect, it } from 'vitest'
import { IndentAction, setLanguageConfiguration, onDidChangeLanguageConfiguration } from '../../src/api/languages'
import { createModel } from '../../src/api/model'
import { toggleComment, insertNewlineAndIndent, EditorSelection } from '../../src/core/index'
import { closeBracketChange } from '../../src/core/edit/closebrackets'
import { bracketTable, colorizedBracketTable, matchBracketAt, bracketSpans } from '../../src/core/edit/brackets'
import { foldingMarkers, regionMarker } from '../../src/core/edit/fold'
import { indentRulesFacet } from '../../src/core/edit/autoindent'
import { mount } from './h1-helpers'

const LANG = 'h3lang'
const put = (ed: any, doc: string, head = doc.length) => {
    ed.dispatch(ed.state.update({ changes: { from: 0, to: ed.state.doc.length, insert: doc }, selection: EditorSelection.cursor(head) }))
}

describe('H3 languageConfiguration 热生效', () => {
    it('comments:⌘/ 用配置的注释符;改了立刻生效,dispose 回到内置', () => {
        const { ed, done } = mount({ lang: LANG, doc: 'a' })
        toggleComment(ed)
        expect(ed.getValue()).toBe('// a')
        put(ed, 'a')
        const events: string[] = []
        const sub = onDidChangeLanguageConfiguration(e => events.push(e.languageId))
        const d = setLanguageConfiguration(LANG, { comments: { lineComment: '#' } })
        expect(events).toEqual([LANG])
        toggleComment(ed)
        expect(ed.getValue()).toBe('# a')
        const d2 = setLanguageConfiguration(LANG, { comments: { lineComment: ';' } })
        put(ed, 'a')
        toggleComment(ed)
        expect(ed.getValue()).toBe('; a')
        d2.dispose() // 回到上一份
        put(ed, 'a')
        toggleComment(ed)
        expect(ed.getValue()).toBe('# a')
        d.dispose()
        put(ed, 'a')
        toggleComment(ed)
        expect(ed.getValue()).toBe('// a')
        // 配置里没有 comments = 没有注释符,命令不动作(Monaco 同)
        const d3 = setLanguageConfiguration(LANG, {})
        put(ed, 'a')
        toggleComment(ed)
        expect(ed.getValue()).toBe('a')
        d3.dispose(); sub.dispose(); done()
    })

    it('onEnterRules + brackets:回车按配置的规则缩进 / 展开', () => {
        const { ed, done } = mount({ lang: LANG, doc: '' })
        put(ed, 'if x:')
        insertNewlineAndIndent(ed)
        expect(ed.getValue()).toBe('if x:\n') // 没配置:不缩进
        const d = setLanguageConfiguration(LANG, {
            onEnterRules: [
                { beforeText: /^\s*if .*:$/, action: { indentAction: IndentAction.Indent } },
                { beforeText: /^\s*#\s*$/, previousLineText: /^\s*#/, action: { indentAction: IndentAction.None, appendText: '# ' } },
            ],
            brackets: [['begin', 'end']],
        })
        put(ed, 'if x:')
        insertNewlineAndIndent(ed)
        expect(ed.getValue()).toBe('if x:\n    ')
        // previousLineText:上一行是 # 才续注释
        put(ed, '# a\n#')
        insertNewlineAndIndent(ed)
        expect(ed.getValue()).toBe('# a\n#\n# ')
        put(ed, 'x\n#')
        insertNewlineAndIndent(ed)
        expect(ed.getValue()).toBe('x\n#\n')
        // 多字符括号:begin|end → 三行
        put(ed, 'beginend', 5)
        insertNewlineAndIndent(ed)
        expect(ed.getValue()).toBe('begin\n    \nend')
        // 配了 brackets 之后 {} 不再展开(整份替换)
        put(ed, '{}', 1)
        insertNewlineAndIndent(ed)
        expect(ed.getValue()).toBe('{\n}')
        d.dispose(); done()
    })

    it('autoClosingPairs / surroundingPairs / autoCloseBefore:自动补闭按配置', () => {
        const { ed, done } = mount({ lang: LANG, doc: '' })
        put(ed, '')
        expect(closeBracketChange(ed.state, { from: 0, to: 0, insert: '(' }, true)?.insert).toBe('()')
        expect(closeBracketChange(ed.state, { from: 0, to: 0, insert: '<' }, true)).toBeNull()
        const d = setLanguageConfiguration(LANG, {
            autoClosingPairs: [{ open: '<', close: '>' }, { open: '"', close: '"', notIn: ['string'] }, { open: 'begin', close: ' end' }],
            surroundingPairs: [{ open: '[', close: ']' }],
            autoCloseBefore: ';',
        })
        expect(closeBracketChange(ed.state, { from: 0, to: 0, insert: '<' }, true)?.insert).toBe('<>')
        expect(closeBracketChange(ed.state, { from: 0, to: 0, insert: '(' }, true)).toBeNull()
        // 包裹用 surroundingPairs:[ 可以,< 不行
        put(ed, 'abc')
        expect(closeBracketChange(ed.state, { from: 0, to: 3, insert: '[' }, false)?.insert).toBe('[abc]')
        expect(closeBracketChange(ed.state, { from: 0, to: 3, insert: '<' }, false)).toBeNull()
        // autoCloseBefore:光标后是 a 不在集合里 → 不补;是 ; 才补
        put(ed, 'a', 0)
        expect(closeBracketChange(ed.state, { from: 0, to: 0, insert: '<' }, true)).toBeNull()
        put(ed, ';', 0)
        expect(closeBracketChange(ed.state, { from: 0, to: 0, insert: '<' }, true)?.insert).toBe('<>')
        // 多字符开符:begi| 打 n → 补 " end"
        put(ed, 'begi')
        expect(closeBracketChange(ed.state, { from: 4, to: 4, insert: 'n' }, true)?.insert).toBe('n end')
        d.dispose()
        put(ed, '')
        expect(closeBracketChange(ed.state, { from: 0, to: 0, insert: '<' }, true)).toBeNull()
        done()
    })

    it('brackets / colorizedBracketPairs:匹配与彩虹括号按配置的表', () => {
        const { ed, done } = mount({ lang: LANG, doc: '<a>(b)' })
        expect(matchBracketAt('<a>(b)', 0, 0, undefined, bracketTable(ed.state))).toBeNull()
        const d = setLanguageConfiguration(LANG, { brackets: [['<', '>']], colorizedBracketPairs: [['<', '>'], ['(', ')']] })
        expect(matchBracketAt('<a>(b)', 0, 0, undefined, bracketTable(ed.state))).toEqual([0, 2])
        expect(matchBracketAt('<a>(b)', 0, 4, undefined, bracketTable(ed.state))).toBeNull() // ( 不在 brackets 里
        const spans = bracketSpans('<a>(b)', 0, undefined, false, colorizedBracketTable(ed.state))
        expect(spans.map(s => s.from)).toEqual([0, 2, 3, 5])
        d.dispose()
        expect(bracketTable(ed.state).custom).toBe(false)
        done()
    })

    it('folding.markers / indentationRules / wordPattern', () => {
        const { ed, done } = mount({ lang: LANG, doc: '' })
        const model = createModel('foo-bar baz', LANG)
        expect(model.getWordAtPosition({ lineNumber: 1, column: 2 })?.word).toBe('foo')
        const d = setLanguageConfiguration(LANG, {
            folding: { markers: { start: /^\s*#pragma region/, end: /^\s*#pragma endregion/ } },
            indentationRules: { increaseIndentPattern: /\{$/, decreaseIndentPattern: /^\s*\}/ },
            wordPattern: /[\w-]+/g,
        })
        const markers = ed.state.facet(foldingMarkers)
        expect(regionMarker(markers, '  #pragma region a')).toBe('open')
        expect(regionMarker(markers, '#pragma endregion')).toBe('close')
        expect(regionMarker(markers, '// #region a')).toBeNull()
        expect(ed.state.facet(indentRulesFacet)?.increaseIndentPattern?.source).toBe('\\{$')
        expect(model.getWordAtPosition({ lineNumber: 1, column: 2 })?.word).toBe('foo-bar')
        d.dispose()
        expect(model.getWordAtPosition({ lineNumber: 1, column: 2 })?.word).toBe('foo')
        model.dispose(); done()
    })
})
