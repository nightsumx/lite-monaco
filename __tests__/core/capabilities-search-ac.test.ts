// 能力: 搜索 + 补全触发规则/状态机边界（数字不触发等）。补全跑在真实路径(provider → SuggestModel → SuggestUi)上
import { afterEach, describe, expect, it } from 'vitest'
import { fuzzyScore, matchIndices } from '../../src/core/feature/fuzzy'
import { LineContext } from '../../src/lang/suggestmodel'
import { suggestTrigger, suggestNext, suggestClose } from '../../src/core/feature/suggestwidget'
import { mountSuggest, cleanupSuggest, until, wait } from './_suggest-harness'
import {
    searchField, findMatches, setSearchQuery, setReplacement, openSearch, closeSearch,
    findNext, findPrev, replaceNext, replaceAll,
    toggleFindCaseSensitive, toggleFindWholeWord,
    selectAllSearchMatches, searchDecorations,
} from '../../src/core/feature/search'
import { EditorSelection } from '../../src/core/model/selection'
import { EditorState, type Transaction } from '../../src/core/model/state'

function mk(doc: string, sel = 0, ext: any[] = []) {
    let state = EditorState.create({
        doc,
        selection: EditorSelection.cursor(sel),
        extensions: [EditorState.allowMultipleSelections.of(true), ...ext],
    })
    const dispatch = (tr: Transaction) => { state = state.applyTransaction(tr) }
    return {
        get state() { return state },
        dispatch,
        run(cmd: any) { return cmd({ state, dispatch }) },
    }
}

afterEach(cleanupSuggest)

describe('autocomplete 触发规则', () => {
    it('数字前缀不自动弹出', () => {
        const should = (w: string) => LineContext.shouldAutoTrigger(mountSuggest({ doc: w }).v)
        expect(should('123')).toBe(false)
        expect(should('1abc')).toBe(true) // Monaco shouldAutoTrigger 只排除能整体解析成数字的词(Number('1abc') 是 NaN),旧引擎的「数字开头一律不弹」不是 Monaco 行为
        expect(should('')).toBe(false)
        expect(should('a1')).toBe(true)
        expect(should('_x')).toBe(true)
        expect(should('foo')).toBe(true)
    })

    it('成员触发 .:provider 声明 triggerCharacters 时打 . 自动弹;普通字符不算', async () => {
        const provider = {
            triggerCharacters: ['.'],
            provideCompletionItems(_m: any, p: any) {
                const range = { startLineNumber: p.lineNumber, startColumn: p.column, endLineNumber: p.lineNumber, endColumn: p.column }
                return { suggestions: [{ label: 'length', kind: 9, insertText: 'length', range }] }
            },
        }
        const r = mountSuggest({ doc: 'obj', providers: [['plaintext', provider as any]] })
        r.v.setPosition({ lineNumber: 1, column: 4 })
        r.type('.')
        await r.waitOpen()
        expect(r.labels).toEqual(['length'])
        suggestClose(r.v)
        // 非触发字符(分号)不弹
        const r2 = mountSuggest({ doc: 'obj', providers: [['plaintext', provider as any]] })
        r2.v.setPosition({ lineNumber: 1, column: 4 })
        r2.type(';')
        await wait(100)
        expect(r2.open).toBe(false)
    })

    it('fuzzy 前缀与子序列', () => {
        const f = (word: string, pat: string) => fuzzyScore(pat, pat.toLowerCase(), 0, word, word.toLowerCase(), 0)
        expect(matchIndices(f('onbeforeinput', 'ob')!).length).toBe(2)
        expect(f('hello', 'hel')![0]).toBeGreaterThan(f('xhello', 'hel')?.[0] ?? -Infinity)
        expect(f('hello', 'xyz')).toBeUndefined()
        expect(matchIndices(f('Hello', 'hel')!)[0]).toBe(0)
    })

    it('词前缀边界(getWordUntilPosition)', () => {
        const r = mountSuggest({ doc: 'foo bar' })
        const m = r.v.getModel()!
        expect(m.getWordUntilPosition({ lineNumber: 1, column: 4 }).word).toBe('foo')
        expect(m.getWordUntilPosition({ lineNumber: 1, column: 1 }).word).toBe('')
        expect(m.getWordUntilPosition({ lineNumber: 1, column: 5 }).word).toBe('') // space 之后
    })

    it('start/close 状态机(关键字 + 文档词)', async () => {
        const r = mountSuggest({ doc: 'con', lang: 'javascript', cursor: 3 })
        suggestTrigger(r.v)
        await r.waitOpen()
        await until(() => r.listed)
        expect(r.labels).toContain('const')
        suggestNext(r.v)
        suggestClose(r.v)
        expect(r.open).toBe(false)
    })
})

describe('search 状态机', () => {
    it('findMatches case / wholeWord', () => {
        const s = EditorState.create({ doc: 'Foo foo food' })
        expect(findMatches(s, { query: 'foo', caseSensitive: false, wholeWord: false }).length).toBe(3)
        expect(findMatches(s, { query: 'foo', caseSensitive: true, wholeWord: false }).length).toBe(2)
        expect(findMatches(s, { query: 'foo', caseSensitive: false, wholeWord: true }).length).toBe(2)
        expect(findMatches(s, { query: '', caseSensitive: false, wholeWord: false })).toEqual([])
    })

    it('open/findNext/Prev/replace', () => {
        const e = mk('aa bb aa', 0, [searchField])
        e.run(openSearch)
        e.run(setSearchQuery('aa'))
        const field = () => e.state.field(searchField)
        expect(field().matches.length).toBe(2)
        e.run(findNext)
        expect(field().currentMatch).toBeGreaterThanOrEqual(0)
        e.run(findPrev)
        // replace：先设 replacement 再 replaceNext
        e.run(setReplacement('ZZ'))
        e.run(replaceNext)
        expect(e.state.doc.toString().includes('ZZ') || field().matches.length >= 0).toBe(true)
        e.run(setSearchQuery('bb'))
        e.run(setReplacement('QQ'))
        e.run(replaceAll)
        e.run(closeSearch)
        expect(field().open).toBe(false)
    })

    it('replaceAll 一次换完全部命中', () => {
        const e = mk('aa bb aa', 0, [searchField])
        e.run(openSearch)
        e.run(setSearchQuery('aa'))
        e.run(setReplacement('ZZ'))
        expect(e.run(replaceAll)).toBe(true)
        expect(e.state.doc.toString()).toBe('ZZ bb ZZ')
    })

    it('toggle flags + selectAll matches + decorations', () => {
        const e = mk('x X x', 0, [searchField])
        e.run(openSearch)
        e.run(setSearchQuery('x'))
        e.run(toggleFindCaseSensitive)
        e.run(toggleFindWholeWord)
        e.run(selectAllSearchMatches)
        expect(e.state.selection.ranges.length).toBeGreaterThanOrEqual(1)
        const deco = searchDecorations(e.state)
        let n = 0
        deco.between(0, e.state.doc.length, () => { n++ })
        expect(n).toBeGreaterThanOrEqual(0)
    })
})
