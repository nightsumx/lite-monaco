// F7 第 2 轮:查找 / 替换对齐 Monaco 0.52(findController.js、replacePattern.js、findModel.js)。
import { beforeEach, describe, expect, it } from 'vitest'
import type { Transaction } from '../../src/core/model/state'
import { EditorState } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'
import { EditorView } from '../../src/core/view/editorview'
import {
    searchField,
    searchDecorations,
    searchPanel,
    openSearch,
    openSearchReplace,
    findNext,
    findWithSelection,
    setSearchQuery,
    setReplacement,
    replaceNext,
    replaceAll,
    toggleFindRegex,
    rememberedFlags,
} from '../../src/core/feature/search'
import { expandRegexReplacement, replaceWithCasePreserved } from '../../src/core/edit/find'

beforeEach(() => { Object.assign(rememberedFlags, { caseSensitive: false, wholeWord: false, regex: false, preserveCase: false }) })

function editor(doc: string, sel: { from: number, to?: number } = { from: 0 }, readOnly = false) {
    let state = EditorState.create({
        doc,
        selection: sel.to === undefined || sel.to === sel.from ? EditorSelection.cursor(sel.from) : EditorSelection.range(sel.from, sel.to),
        extensions: [searchField, ...(readOnly ? [EditorState.readOnly.of(true)] : [])],
    })
    const dispatch = (tr: Transaction) => { state = tr.apply() }
    return {
        get state() { return state },
        run(cmd: (t: { state: EditorState, dispatch: (tr: Transaction) => void }) => boolean) { return cmd({ state, dispatch }) },
        sf() { return state.field(searchField) },
    }
}

describe('O2 / O7 / O8 种子', () => {
    it('O2 光标在词尾取前一个词(getWordAtPosition)', () => {
        const e = editor('foo bar', { from: 3 })
        e.run(openSearch)
        expect(e.sf().query).toBe('foo')
    })

    it('O7 单行长选区照取;多行选区 ⌘F 不取、⌘E 取', () => {
        const long = 'x'.repeat(1000)
        const e = editor(`${long}\nab\ncd`, { from: 0, to: 1000 })
        e.run(openSearch)
        expect(e.sf().query).toBe(long)
        const m = editor('ab\ncd zz', { from: 0, to: 5 })
        m.run(openSearch)
        expect(m.sf().query).toBe('')
        m.run(findWithSelection)
        expect(m.sf().query).toBe('ab\ncd')
    })

    it('O8 查找框开着且查询为空:⌘G 不重新取词', () => {
        const e = editor('foo bar', { from: 1 })
        e.run(openSearch)
        e.run(setSearchQuery(''))
        e.run(findNext)
        expect(e.sf().query).toBe('')
        expect(e.state.selection.main.empty).toBe(true)
    })
})

describe('O1 只读', () => {
    it('替换栏开不了,替换命令不改文档', () => {
        const e = editor('foo foo', { from: 0 }, true)
        e.run(openSearch)
        expect(e.run(openSearchReplace)).toBe(false)
        expect(e.sf().replaceOpen).toBe(false)
        e.run(setSearchQuery('foo'))
        e.run(setReplacement('bar'))
        expect(e.run(replaceNext)).toBe(false)
        expect(e.run(replaceAll)).toBe(false)
        expect(e.state.doc.toString()).toBe('foo foo')
    })

    it('展开替换的按钮禁用、移出 Tab 次序', () => {
        const host = document.createElement('div')
        document.body.appendChild(host)
        const view = new EditorView({
            state: EditorState.create({ doc: 'foo', extensions: [searchField, EditorState.readOnly.of(true)] }),
            parent: host,
            decorationProviders: [searchDecorations],
        })
        const stop = searchPanel(view)
        openSearch({ state: view.state, dispatch: tr => view.dispatch(tr) })
        const toggle = view.dom.querySelector('.cm-find-widget .cm-find-toggle-replace, .cm-find-widget .button.toggle') as HTMLElement
        expect(toggle.classList.contains('disabled')).toBe(true)
        expect(toggle.tabIndex).toBe(-1)
        stop()
        view.destroy()
        host.remove()
    })
})

describe('O13 正则替换串(Monaco parseReplaceString)', () => {
    const rx = (text: string, pattern: string, replacement: string) => {
        const m = new RegExp(pattern).exec(text)!
        return expandRegexReplacement(text, pattern, true, m.index, m.index + m[0].length, replacement)
    }
    it('\\n \\t \\\\ 转义;未知转义和末尾孤立的 \\ 原样', () => {
        expect(rx('ab', 'a(b)', 'x\\ny\\tz\\\\$1')).toBe('x\ny\tz\\b')
        expect(rx('ab', 'a', '\\q')).toBe('\\q')
        expect(rx('ab', 'a', 'x\\')).toBe('x\\')
    })
    it('\\u \\U \\l \\L 只作用在紧跟的分组上', () => {
        expect(rx('foo bar', '(\\w+) (\\w+)', '\\u$1 \\U$2')).toBe('Foo BAR')
        expect(rx('FOO BAR', '(\\w+) (\\w+)', '\\l$1-\\L$2')).toBe('fOO-bar')
        expect(rx('foo', '(foo)', '\\u\\u$1')).toBe('FOo')
    })
    it('不存在的分组保留字面($12 退成 $1 + "2";$9 无此组 → "$9")', () => {
        expect(rx('ab', '(a)(b)', '$12')).toBe('a2')
        expect(rx('ab', '(a)', '$9')).toBe('$9')
        expect(rx('ab', 'a', '$$ $& $0')).toBe('$ a a')
    })
})

describe('O15 保留大小写按 - _ 分段', () => {
    it('buildReplaceStringWithCasePreserved', () => {
        expect(replaceWithCasePreserved('Foo-Bar', 'baz-qux')).toBe('Baz-Qux')
        expect(replaceWithCasePreserved('FOO_bar', 'baz_qux')).toBe('BAZ_qux')
        // - 和 _ 都能对齐分段时两种都不用,退回整串规则(首字母大写)
        expect(replaceWithCasePreserved('Foo-Bar_x', 'baz-qux_y')).toBe('Baz-qux_y')
        expect(replaceWithCasePreserved('HELLO', 'world')).toBe('WORLD')
        expect(replaceWithCasePreserved('hello', 'World')).toBe('world')
        expect(replaceWithCasePreserved('Hello', 'world')).toBe('World')
    })
})

describe('O55 用更长串全部替换后的选区', () => {
    // 实测 /tmp/lc-hunt/h-overlay/find/stale.ts:aa → aaa 后 sel=0-2(Monaco 跟踪选区,替换后重算命中、选回第 1 处起点那段)
    it('aa aa 换成 aaa:选区 0-2,计数 1 of 2', () => {
        const e = editor('aa aa\n', { from: 0 })
        e.run(openSearchReplace)
        e.run(setSearchQuery('aa'))
        e.run(setReplacement('aaa'))
        e.run(replaceAll)
        expect(e.state.doc.toString()).toBe('aaa aaa\n')
        expect([e.state.selection.main.from, e.state.selection.main.to]).toEqual([0, 2])
        expect(e.sf().matches.length).toBe(2)
    })
})

describe('O48 非法正则', () => {
    it('开着正则时查询不合法:无命中、不炸', () => {
        const e = editor('a(b')
        e.run(openSearch)
        e.run(toggleFindRegex)
        e.run(setSearchQuery('('))
        expect(e.sf().matches).toEqual([])
    })
})
