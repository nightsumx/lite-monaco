import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Transaction } from '../../src/core/model/state'
import { EditorState } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'
import { MarkDecoration } from '../../src/core/model/decoration'
import { EditorView } from '../../src/core/view/editorview'
import {
    searchField,
    searchDecorations,
    searchPanel,
    openSearch,
    openSearchReplace,
    closeSearch,
    findNext,
    findPrev,
    setSearchQuery,
    setReplacement,
    replaceNext,
    replaceAll,
    findMatches,
    toggleFindCaseSensitive,
    toggleFindWholeWord,
    toggleFindInSelection,
    toggleFindRegex,
    toggleSearchReplace,
    selectAllSearchMatches,
    rememberedFlags,
    clearFindHistory,
} from '../../src/core/feature/search'
import { findInText } from '../../src/core/edit/find'

// 查找开关跨实例记在模块里(Monaco storage),每个用例从默认开始
// find.history 默认 'workspace' = 同页共享(Monaco),用例之间要清,免得上一个用例的历史漏进来
beforeEach(() => { clearFindHistory(); Object.assign(rememberedFlags, { caseSensitive: false, wholeWord: false, regex: false, preserveCase: false }) })

function editor2(doc: string, pos = 0) {
    let state = EditorState.create({
        doc,
        selection: EditorSelection.single(pos),
        extensions: [searchField],
    })
    const dispatch = (tr: Transaction) => { state = tr.apply() }
    return {
        get state() { return state },
        run(cmd: (t: { state: EditorState, dispatch: (tr: Transaction) => void }) => boolean) {
            return cmd({ state, dispatch })
        },
        sf() { return state.field(searchField) },
        sel(from: number, to = from) {
            dispatch(state.update({
                selection: from === to
                    ? EditorSelection.cursor(from)
                    : EditorSelection.range(from, to),
            }))
        },
    }
}

describe('findMatches', () => {
    it('大小写不敏感:找到所有出现', () => {
        const s = EditorState.create({ doc: 'foo Foo FOO bar', extensions: searchField })
        const hits = findMatches(s, { query: 'foo', caseSensitive: false, wholeWord: false })
        expect(hits.length).toBe(3)
        expect(hits[0]).toEqual({ from: 0, to: 3 })
        expect(hits[1]).toEqual({ from: 4, to: 7 })
        expect(hits[2]).toEqual({ from: 8, to: 11 })
    })

    it('大小写敏感:只匹配精确大小写', () => {
        const s = EditorState.create({ doc: 'foo Foo FOO bar', extensions: searchField })
        const hits = findMatches(s, { query: 'Foo', caseSensitive: true, wholeWord: false })
        expect(hits.length).toBe(1)
        expect(hits[0]).toEqual({ from: 4, to: 7 })
    })

    it('整词匹配:只匹配前后非word字符的', () => {
        const s = EditorState.create({ doc: 'foo foobar foo bar foo!', extensions: searchField })
        const hits = findMatches(s, { query: 'foo', caseSensitive: false, wholeWord: true })
        expect(hits.length).toBe(3)
        expect(hits[0]).toEqual({ from: 0, to: 3 })
        expect(hits[2].from).toBe(19)
    })

    it('空query:返回空', () => {
        const s = EditorState.create({ doc: 'hello world', extensions: searchField })
        const hits = findMatches(s, { query: '', caseSensitive: false, wholeWord: false })
        expect(hits).toEqual([])
    })

    it('无匹配:返回空', () => {
        const s = EditorState.create({ doc: 'hello world', extensions: searchField })
        const hits = findMatches(s, { query: 'xyz', caseSensitive: false, wholeWord: false })
        expect(hits).toEqual([])
    })

    it('findInText 只扫 from..to', () => {
        expect(findInText('foo bar foo', { query: 'foo', from: 4 })).toEqual([{ from: 8, to: 11 }])
        expect(findInText('foo bar foo', { query: 'foo', from: 0, to: 4 })).toEqual([{ from: 0, to: 3 }])
    })

    it('findInText regex：. 通配；非法式空', () => {
        expect(findInText('axb a.b', { query: 'a.b', regex: true })).toEqual([
            { from: 0, to: 3 },
            { from: 4, to: 7 },
        ])
        expect(findInText('abc', { query: '[', regex: true })).toEqual([])
    })
})

describe('searchField state', () => {
    it('初始:closed 无query', () => {
        const e = editor2('hello')
        expect(e.sf().open).toBe(false)
        expect(e.sf().query).toBe('')
    })

    it('openSearch:打开面板', () => {
        const e = editor2('hello')
        expect(e.run(openSearch)).toBe(true)
        expect(e.sf().open).toBe(true)
        expect(e.run(openSearch)).toBe(true)
        expect(e.sf().open).toBe(true)
    })

    it('closeSearch:关闭面板', () => {
        const e = editor2('hello')
        e.run(openSearch)
        e.run(closeSearch)
        expect(e.sf().open).toBe(false)
    })

    it('closeSearch:已关时返回 false', () => {
        const e = editor2('hello')
        expect(e.run(closeSearch)).toBe(false)
    })

    it('setSearchQuery:更新query', () => {
        const e = editor2('foo foo bar')
        e.run(setSearchQuery('foo'))
        expect(e.sf().query).toBe('foo')
    })

    it('关面板再开:无词 seed 时保留上次 query', () => {
        const e = editor2('aaa  bbb')
        e.run(setSearchQuery('bbb'))
        e.run(openSearch)
        e.run(closeSearch)
        e.sel(4) // 两个空格中间,前后都不是词 → 不 seed,保留 bbb(词尾 3 会 seed aaa,同 Monaco getWordAtPosition)
        e.run(openSearch)
        expect(e.sf().query).toBe('bbb')
        expect(e.sf().open).toBe(true)
    })

    it('关面板再开:光标在词上则 seed 新词', () => {
        const e = editor2('aaa bbb')
        e.run(setSearchQuery('bbb'))
        e.run(closeSearch)
        e.sel(0)
        e.run(openSearch)
        expect(e.sf().query).toBe('aaa')
    })

    it('空选区 openSearch:seed 光标下词', () => {
        const e = editor2('hello world', 0)
        e.run(openSearch)
        expect(e.sf().query).toBe('hello')
        expect(e.sf().matches.length).toBe(1)
    })

    // Monaco 0.52 默认 autoFindInSelection: 'never'(实测 m-find findInSelBtn:scope=undefined)
    it('多行选区 openSearch:不 seed、不自动选区内查找、选区不动', () => {
        const e = editor2('foo\nbar\nfoo')
        e.sel(0, 7) // foo\nbar
        e.run(openSearch)
        expect(e.sf().findInSelection).toBe(false)
        expect(e.sf().query).toBe('')
        expect(e.state.selection.main.from).toBe(0)
        expect(e.state.selection.main.to).toBe(7)
    })
})

describe('findNext / findPrev', () => {
    it('setSearchQuery:选中光标后首命中整段', () => {
        const e = editor2('foo bar foo', 0)
        e.run(setSearchQuery('foo'))
        const sel = e.state.selection.main
        expect(sel.from).toBe(0)
        expect(sel.to).toBe(3)
        expect(sel.empty).toBe(false)
        expect(e.sf().currentMatch).toBe(0)
    })

    it('findNext:已选中命中时进下一个', () => {
        const e = editor2('foo bar foo', 0)
        e.run(setSearchQuery('foo'))
        e.run(findNext)
        const sel = e.state.selection.main
        expect(sel.from).toBe(8)
        expect(sel.to).toBe(11)
        expect(e.sf().currentMatch).toBe(1)
    })

    it('findNext:末尾后环绕到开头', () => {
        const e = editor2('foo bar foo', 11)
        e.run(setSearchQuery('foo'))
        // 光标在末命中上 → 已选第二;再 next 环绕
        e.run(findNext)
        expect(e.state.selection.main.from).toBe(0)
        expect(e.state.selection.main.to).toBe(3)
    })

    it('findPrev:已选中时进上一个', () => {
        const e = editor2('foo bar foo', 11)
        e.run(setSearchQuery('foo'))
        e.run(findPrev)
        expect(e.state.selection.main.from).toBe(0)
        expect(e.state.selection.main.to).toBe(3)
    })

    it('findPrev:开头前环绕到末尾', () => {
        const e = editor2('foo bar foo', 0)
        e.run(setSearchQuery('foo'))
        e.run(findPrev)
        expect(e.state.selection.main.from).toBe(8)
        expect(e.state.selection.main.to).toBe(11)
    })

    it('关面板后 findNext 仍跳下一处', () => {
        const e = editor2('foo bar foo', 0)
        e.run(openSearch)
        e.run(setSearchQuery('foo'))
        expect(e.state.selection.main.from).toBe(0)
        expect(e.run(closeSearch)).toBe(true)
        expect(e.sf().open).toBe(false)
        expect(e.run(findNext)).toBe(true)
        expect(e.state.selection.main.from).toBe(8)
        expect(e.run(findPrev)).toBe(true)
        expect(e.state.selection.main.from).toBe(0)
    })

    it('无命中:findNext 不动选区(关着时只打开查找框,开着返回 false)', () => {
        const e = editor2('hello world', 0)
        e.run(setSearchQuery('xyz'))
        expect(e.run(findNext)).toBe(true)
        expect(e.sf().open).toBe(true)
        expect(e.run(findNext)).toBe(false)
        expect(e.state.selection.main.head).toBe(0)
    })

    it('光标在中部:setSearchQuery 选中后方首命中', () => {
        const e = editor2('foo bar foo', 5)
        e.run(setSearchQuery('foo'))
        expect(e.state.selection.main.from).toBe(8)
        expect(e.state.selection.main.to).toBe(11)
        expect(e.sf().currentMatch).toBe(1)
    })
})

describe('replaceNext / replaceAll', () => {
    it('replaceNext:替换当前命中并选中下一个', () => {
        const e = editor2('foo bar foo', 0)
        e.run(setSearchQuery('foo'))
        e.run(setReplacement('baz'))
        e.run(replaceNext)
        expect(e.state.doc.toString()).toBe('baz bar foo')
        // 下一命中仍是 foo(长度同,位置 8)
        expect(e.state.selection.main.from).toBe(8)
        expect(e.state.selection.main.to).toBe(11)
        expect(e.state.sliceDoc(8, 11)).toBe('foo')
    })

    it('replaceAll:替换所有命中', () => {
        const e = editor2('foo bar foo foo', 0)
        e.run(setSearchQuery('foo'))
        e.run(setReplacement('baz'))
        e.run(replaceAll)
        expect(e.state.doc.toString()).toBe('baz bar baz baz')
    })

    it('replaceNext 无命中:返回 false', () => {
        const e = editor2('hello', 0)
        e.run(setSearchQuery('xyz'))
        e.run(setReplacement('abc'))
        expect(e.run(replaceNext)).toBe(false)
    })

    it('replaceNext 最后一处：换完光标落替换末，不再选中', () => {
        const e = editor2('foo', 0)
        e.run(setSearchQuery('foo'))
        e.run(setReplacement('bar'))
        expect(e.run(replaceNext)).toBe(true)
        expect(e.state.doc.toString()).toBe('bar')
        expect(e.state.selection.main.empty).toBe(true)
        expect(e.state.selection.main.head).toBe(3)
    })

    it('regex 替换 $1 取捕获组；$& 整段；$$ 字面 $', () => {
        const e = editor2('afoo abar', 0)
        e.run(setSearchQuery('a(\\w+)', { regex: true }))
        e.run(setReplacement('$1'))
        expect(e.run(replaceAll)).toBe(true)
        expect(e.state.doc.toString()).toBe('foo bar')
        const e2 = editor2('ab', 0)
        e2.run(setSearchQuery('a(b)', { regex: true }))
        e2.run(setReplacement('$$ $& $1'))
        e2.run(replaceAll)
        expect(e2.state.doc.toString()).toBe('$ ab b')
    })
})

describe('toggles / selectAll', () => {
    it('toggleFindCaseSensitive', () => {
        const e = editor2('Foo foo', 0)
        e.run(setSearchQuery('Foo'))
        expect(e.sf().matches.length).toBe(2)
        e.run(toggleFindCaseSensitive)
        expect(e.sf().caseSensitive).toBe(true)
        expect(e.sf().matches.length).toBe(1)
    })

    it('toggleFindRegex 后按正则命中', () => {
        const e = editor2('axb a.b', 0)
        e.run(setSearchQuery('a.b'))
        expect(e.sf().matches).toEqual([{ from: 4, to: 7 }])
        expect(e.run(toggleFindRegex)).toBe(true)
        expect(e.sf().regex).toBe(true)
        expect(e.sf().matches).toEqual([{ from: 0, to: 3 }, { from: 4, to: 7 }])
    })

    it('非法正则不炸，命中为空', () => {
        const e = editor2('abc', 0)
        e.run(setSearchQuery('[', { regex: true }))
        expect(e.sf().regex).toBe(true)
        expect(e.sf().matches).toEqual([])
    })

    it('toggleSearchReplace 面板关着返 false', () => {
        const e = editor2('foo', 0)
        expect(e.sf().open).toBe(false)
        expect(e.run(toggleSearchReplace)).toBe(false)
        expect(e.sf().replaceOpen).toBe(false)
    })

    it('toggleSearchReplace 打开替换栏', () => {
        const e = editor2('foo', 0)
        e.run(openSearch)
        expect(e.sf().replaceOpen).toBe(false)
        expect(e.run(toggleSearchReplace)).toBe(true)
        expect(e.sf().replaceOpen).toBe(true)
        expect(e.run(toggleSearchReplace)).toBe(true)
        expect(e.sf().replaceOpen).toBe(false)
    })

    it('toggleFindWholeWord', () => {
        const e = editor2('foo foobar foo', 0)
        e.run(setSearchQuery('foo'))
        expect(e.sf().matches.length).toBe(3)
        e.run(toggleFindWholeWord)
        expect(e.sf().wholeWord).toBe(true)
        expect(e.sf().matches.length).toBe(2)
    })

    it('toggleFindInSelection 空选区返 false', () => {
        const e = editor2('foo bar foo', 0)
        e.run(openSearch)
        e.sel(1)
        expect(e.run(toggleFindInSelection)).toBe(false)
        expect(e.sf().findInSelection).toBe(false)
    })

    it('toggleFindInSelection', () => {
        const e = editor2('foo bar foo', 0)
        e.run(setSearchQuery('foo'))
        expect(e.sf().matches.length).toBe(2)
        e.sel(4, 11)
        e.run(toggleFindInSelection)
        expect(e.sf().findInSelection).toBe(true)
        expect(e.sf().matches).toEqual([{ from: 8, to: 11 }])
        e.run(toggleFindInSelection)
        expect(e.sf().findInSelection).toBe(false)
        expect(e.sf().matches.length).toBe(2)
    })

    it('selectAllSearchMatches 无命中返 false', () => {
        const e = editor2('hello', 0)
        e.run(setSearchQuery('zzz'))
        expect(e.run(selectAllSearchMatches)).toBe(false)
        expect(e.state.selection.ranges.length).toBe(1)
    })

    it('selectAllSearchMatches:多选区', () => {
        let state = EditorState.create({
            doc: 'foo bar foo',
            selection: EditorSelection.single(0),
            extensions: [searchField, EditorState.allowMultipleSelections.of(true)],
        })
        const dispatch = (tr: Transaction) => { state = tr.apply() }
        setSearchQuery('foo')({ state, dispatch })
        selectAllSearchMatches({ state, dispatch })
        expect(state.selection.ranges.length).toBe(2)
        expect(state.selection.ranges[0].from).toBe(0)
        expect(state.selection.ranges[1].from).toBe(8)
    })
})

describe('searchDecorations', () => {
    it('面板打开 + 有命中:产出 mark decoration 覆盖每个命中', () => {
        let s = EditorState.create({
            doc: 'foo bar foo',
            selection: EditorSelection.single(0),
            extensions: searchField,
        })
        const dispatch = (tr: Transaction) => { s = tr.apply() }
        openSearch({ state: s, dispatch })
        setSearchQuery('foo')({ state: s, dispatch })
        const ds = searchDecorations(s)
        let count = 0
        ds.between(0, 11, () => { count++ })
        expect(count).toBe(2)
    })

    it('面板关闭:有 query 也不画高亮(对齐 CM6)', () => {
        let s = EditorState.create({
            doc: 'foo bar foo',
            selection: EditorSelection.single(0),
            extensions: searchField,
        })
        const dispatch = (tr: Transaction) => { s = tr.apply() }
        setSearchQuery('foo')({ state: s, dispatch })
        let count = 0
        searchDecorations(s).between(0, 11, () => { count++ })
        expect(count).toBe(0)
        expect(s.field(searchField).matches.length).toBe(2)
    })

    it('无命中:返回空', () => {
        let s = EditorState.create({
            doc: 'hello',
            selection: EditorSelection.single(0),
            extensions: searchField,
        })
        const dispatch = (tr: Transaction) => { s = tr.apply() }
        openSearch({ state: s, dispatch })
        setSearchQuery('xyz')({ state: s, dispatch })
        const ds = searchDecorations(s)
        let count = 0
        ds.between(0, 5, () => { count++ })
        expect(count).toBe(0)
    })

    it('当前命中:有 cm-searchMatch-selected class', () => {
        let s = EditorState.create({
            doc: 'foo bar foo',
            selection: EditorSelection.single(0),
            extensions: searchField,
        })
        const dispatch = (tr: Transaction) => { s = tr.apply() }
        openSearch({ state: s, dispatch })
        setSearchQuery('foo')({ state: s, dispatch })
        findNext({ state: s, dispatch })
        const ds = searchDecorations(s)
        const marks: { class?: string }[] = []
        ds.between(0, 11, (_from, _to, value) => {
            if (value instanceof MarkDecoration)
                marks.push({ class: value.attrs.class })
        })
        expect(marks.some(m => m.class?.includes('cm-searchMatch-selected'))).toBe(true)
    })
})

describe('查找涂色不重建 heightMap', () => {
    it('toggleFindCaseSensitive 保持 heightMap 引用', () => {
        const host = document.createElement('div')
        document.body.appendChild(host)
        const view = new EditorView({
            state: EditorState.create({
                doc: 'foo bar foo\n',
                extensions: [searchField],
            }),
            parent: host,
            decorationProviders: [searchDecorations],
        })
        openSearch({ state: view.state, dispatch: tr => view.dispatch(tr) })
        setSearchQuery('foo')({ state: view.state, dispatch: tr => view.dispatch(tr) })
        const hm = view.heightMap
        toggleFindCaseSensitive({ state: view.state, dispatch: tr => view.dispatch(tr) })
        expect(view.heightMap).toBe(hm)
        host.remove()
    })

    it('findNext 保持 heightMap 引用', () => {
        const host = document.createElement('div')
        document.body.appendChild(host)
        const view = new EditorView({
            state: EditorState.create({
                doc: 'foo bar foo bar foo\n',
                extensions: [searchField],
            }),
            parent: host,
            decorationProviders: [searchDecorations],
        })
        openSearch({ state: view.state, dispatch: tr => view.dispatch(tr) })
        setSearchQuery('foo')({ state: view.state, dispatch: tr => view.dispatch(tr) })
        const hm = view.heightMap
        findNext({ state: view.state, dispatch: tr => view.dispatch(tr) })
        expect(view.heightMap).toBe(hm)
        host.remove()
    })
})

describe('searchPanel overlay (Monaco find-widget 同构)', () => {
    function panelView(doc: string, sel?: { from: number, to: number }) {
        const host = document.createElement('div')
        document.body.appendChild(host)
        const view = new EditorView({
            state: EditorState.create({
                doc,
                selection: sel
                    ? EditorSelection.range(sel.from, sel.to)
                    : EditorSelection.single(0),
                extensions: [searchField],
            }),
            parent: host,
            decorationProviders: [searchDecorations],
        })
        const stop = searchPanel(view)
        return { view, stop, host }
    }

    it('openSearch 挂 .cm-find-widget,含 find-part / 输入 / actions,关则卸', () => {
        const { view, stop } = panelView('foo bar foo')
        expect(view.dom.querySelector('.cm-find-widget')).toBeNull()
        openSearch({ state: view.state, dispatch: tr => view.dispatch(tr) })
        const panel = view.dom.querySelector('.cm-find-widget')!
        expect(panel).toBeTruthy()
        expect(panel.querySelector('.cm-find-part')).toBeTruthy()
        expect(panel.querySelector('textarea[main-field]')).toBeTruthy()
        expect(panel.querySelector('.cm-find-actions')).toBeTruthy()
        expect(panel.querySelector('.cm-find-close')).toBeTruthy()
        expect(panel.classList.contains('replaceToggled')).toBe(false)
        ;(panel.querySelector('.cm-find-close') as HTMLElement).click()
        expect(view.state.field(searchField).open).toBe(false)
        stop()
        view.destroy()
    })

    it('openSearchReplace 展开 replace-part', () => {
        const { view, stop } = panelView('foo')
        openSearchReplace({ state: view.state, dispatch: tr => view.dispatch(tr) })
        const panel = view.dom.querySelector('.cm-find-widget')!
        expect(panel.classList.contains('replaceToggled')).toBe(true)
        expect(panel.querySelector('.cm-replace-part')).toBeTruthy()
        expect(view.state.field(searchField).replaceOpen).toBe(true)
        stop()
        view.destroy()
    })

    it('输入 query 后 count 显示命中,Next 跳到下一命中并选中整段', () => {
        const { view, stop } = panelView('foo bar foo')
        openSearch({ state: view.state, dispatch: tr => view.dispatch(tr) })
        // open 会 seed 词 foo(光标在 0),选区不动,光标贴着第 1 个命中
        expect(view.state.field(searchField).query).toBe('foo')
        const count = view.dom.querySelector('.cm-matches-count')!
        expect(count.textContent).toBe('1 of 2')
        // Monaco:从选区终点(0)找起 → 先选中 0-3,再到 8-11
        findNext({ state: view.state, dispatch: tr => view.dispatch(tr) })
        expect(view.state.selection.main.from).toBe(0)
        expect(view.state.selection.main.to).toBe(3)
        findNext({ state: view.state, dispatch: tr => view.dispatch(tr) })
        expect(view.state.selection.main.from).toBe(8)
        expect(view.state.selection.main.to).toBe(11)
        ;(view.dom.querySelector('.cm-find-btn.prev') as HTMLElement).click()
        expect(view.state.selection.main.from).toBe(0)
        stop()
        view.destroy()
    })

    it('case/word toggle 按钮切 checked 并写 state', () => {
        const { view, stop } = panelView('Foo foo')
        openSearch({ state: view.state, dispatch: tr => view.dispatch(tr) })
        const input = view.dom.querySelector('textarea[main-field]') as HTMLInputElement
        input.value = 'Foo'
        input.dispatchEvent(new Event('input', { bubbles: true }))
        expect(view.state.field(searchField).matches.length).toBe(2)
        const caseBtn = view.dom.querySelector('.cm-find-toggle-opt[name=case]') as HTMLElement
        caseBtn.click()
        expect(view.state.field(searchField).caseSensitive).toBe(true)
        expect(view.state.field(searchField).matches.length).toBe(1)
        stop()
        view.destroy()
    })

    it('Monaco 同款控件齐:regex / selection / preserve-case / replace 图标', () => {
        const { view, stop } = panelView('hello')
        openSearchReplace({ state: view.state, dispatch: tr => view.dispatch(tr) })
        const panel = view.dom.querySelector('.cm-find-widget')!
        expect(panel.querySelector('.codicon-case-sensitive')).toBeTruthy()
        expect(panel.querySelector('.codicon-whole-word')).toBeTruthy()
        expect(panel.querySelector('.codicon-regex')).toBeTruthy()
        expect(panel.querySelector('.codicon-selection')).toBeTruthy()
        expect(panel.querySelector('.codicon-arrow-up')).toBeTruthy()
        expect(panel.querySelector('.codicon-arrow-down')).toBeTruthy()
        expect(panel.querySelector('.codicon-close')).toBeTruthy()
        expect(panel.querySelector('.codicon-preserve-case')).toBeTruthy()
        expect(panel.querySelector('.codicon-replace')).toBeTruthy()
        expect(panel.querySelector('.codicon-replace-all')).toBeTruthy()
        stop()
        view.destroy()
    })

    it('find in selection:只命中选区内', () => {
        const { view, stop } = panelView('foo bar foo')
        openSearch({ state: view.state, dispatch: tr => view.dispatch(tr) })
        const input = view.dom.querySelector('textarea[main-field]') as HTMLInputElement
        input.value = 'foo'
        input.dispatchEvent(new Event('input', { bubbles: true }))
        expect(view.state.field(searchField).matches.length).toBe(2)
        view.dispatch(view.state.update({ selection: EditorSelection.range(4, 11) }))
        const selBtn = view.dom.querySelector('.cm-find-toggle-opt[name=selection]') as HTMLElement
        selBtn.click()
        expect(view.state.field(searchField).findInSelection).toBe(true)
        expect(view.state.field(searchField).matches).toEqual([{ from: 8, to: 11 }])
        stop()
        view.destroy()
    })

    it('有选区 openSearch:以选区文本作初始 query 且写入 input', () => {
        const { view, stop } = panelView('hello foo world', { from: 6, to: 9 })
        openSearch({ state: view.state, dispatch: tr => view.dispatch(tr) })
        expect(view.state.field(searchField).query).toBe('foo')
        expect(view.state.field(searchField).matches.length).toBe(1)
        const input = view.dom.querySelector('textarea[main-field]') as HTMLInputElement
        expect(input.value).toBe('foo')
        stop()
        view.destroy()
    })

    it('选区 seed 后 input 显示搜索词并可全选(Cmd+F 核心路径)', () => {
        const host = document.createElement('div')
        document.body.appendChild(host)
        const view = new EditorView({
            state: EditorState.create({
                doc: 'hello function world function',
                selection: EditorSelection.range(6, 14),
                extensions: [searchField],
            }),
            parent: host,
            decorationProviders: [searchDecorations],
        })
        const stop = searchPanel(view)
        openSearch({ state: view.state, dispatch: tr => view.dispatch(tr) })
        const sf = view.state.field(searchField)
        expect(sf.query).toBe('function')
        expect(sf.matches.length).toBe(2)
        const input = view.dom.querySelector('textarea[main-field]') as HTMLInputElement
        expect(input.value).toBe('function')
        stop()
        view.destroy()
    })

    it('跨行选区不 seed query,也不自动开 find-in-selection(Monaco autoFindInSelection never)', () => {
        const { view, stop } = panelView('foo\nbar')
        view.dispatch(view.state.update({ selection: EditorSelection.range(0, 7) }))
        openSearch({ state: view.state, dispatch: tr => view.dispatch(tr) })
        expect(view.state.field(searchField).query.includes('\n')).toBe(false)
        expect(view.state.field(searchField).findInSelection).toBe(false)
        stop()
        view.destroy()
    })

    it('空选区再开:保留已有 query 不清空', () => {
        const { view, stop } = panelView('abc abc')
        openSearch({ state: view.state, dispatch: tr => view.dispatch(tr) })
        const input = view.dom.querySelector('textarea[main-field]') as HTMLInputElement
        // seed 可能是 abc
        input.value = 'abc'
        input.dispatchEvent(new Event('input', { bubbles: true }))
        expect(view.state.field(searchField).query).toBe('abc')
        view.dispatch(view.state.update({ selection: EditorSelection.cursor(3) }))
        openSearch({ state: view.state, dispatch: tr => view.dispatch(tr) })
        // 空选在空白/词间:可能 seed 新词;cursor(3) 在 "abc abc" 中间空格
        // 空格上 wordAt 返回 null → 保留 query
        expect(view.state.field(searchField).query).toBe('abc')
        expect(input.value).toBe('abc')
        stop()
        view.destroy()
    })

    it('关再开保留 query(面板路径)', () => {
        const { view, stop } = panelView('zzz  yyy')
        openSearch({ state: view.state, dispatch: tr => view.dispatch(tr) })
        const input = view.dom.querySelector('textarea[main-field]') as HTMLInputElement
        input.value = 'yyy'
        input.dispatchEvent(new Event('input', { bubbles: true }))
        closeSearch({ state: view.state, dispatch: tr => view.dispatch(tr) })
        // 两个空格中间:前后都不是词,不 seed
        view.dispatch(view.state.update({ selection: EditorSelection.cursor(4) }))
        openSearch({ state: view.state, dispatch: tr => view.dispatch(tr) })
        expect(view.state.field(searchField).query).toBe('yyy')
        stop()
        view.destroy()
    })

    it('无结果时 no-results class(有 query)', () => {
        const { view, stop } = panelView('hello')
        openSearch({ state: view.state, dispatch: tr => view.dispatch(tr) })
        const input = view.dom.querySelector('textarea[main-field]') as HTMLInputElement
        input.value = 'xyz'
        input.dispatchEvent(new Event('input', { bubbles: true }))
        const panel = view.dom.querySelector('.cm-find-widget')!
        expect(panel.classList.contains('no-results')).toBe(true)
        expect(panel.querySelector('.cm-matches-count')!.textContent).toBe('No results')
        input.value = ''
        input.dispatchEvent(new Event('input', { bubbles: true }))
        expect(panel.classList.contains('no-results')).toBe(false)
        stop()
        view.destroy()
    })

    // Monaco HistoryInputBox:改完停 500ms 才进历史(findWidget._delayedUpdateHistory),Enter 不额外记
    it('替换历史 ArrowUp 回到上次替换词', () => {
        vi.useFakeTimers()
        const { view, stop } = panelView('foo bar foo')
        openSearchReplace({ state: view.state, dispatch: tr => view.dispatch(tr) })
        const find = view.dom.querySelector('textarea[main-field]') as HTMLInputElement
        const repl = view.dom.querySelector('textarea[aria-label="Replace"]') as HTMLInputElement
        find.value = 'foo'
        find.dispatchEvent(new Event('input', { bubbles: true }))
        repl.value = 'alpha'
        repl.dispatchEvent(new Event('input', { bubbles: true }))
        vi.advanceTimersByTime(500)
        repl.value = 'beta'
        repl.dispatchEvent(new Event('input', { bubbles: true }))
        repl.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
        expect(repl.value).toBe('alpha')
        expect(view.state.field(searchField).replacement).toBe('alpha')
        stop()
        view.destroy()
        vi.useRealTimers()
    })

    it('历史:停 500ms 记下,↑ 回到先前 query,↓ 回来,越过最新清空', () => {
        vi.useFakeTimers()
        const { view, stop } = panelView('alpha beta alpha')
        openSearch({ state: view.state, dispatch: tr => view.dispatch(tr) })
        const input = view.dom.querySelector('textarea[main-field]') as HTMLInputElement
        input.value = 'alpha'
        input.dispatchEvent(new Event('input', { bubbles: true }))
        vi.advanceTimersByTime(499)
        input.value = 'beta'
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
        // alpha 没停够 500ms,不在历史里;↑ 把 beta 记下,自己就是唯一一条
        expect(input.value).toBe('beta')
        input.value = 'alpha'
        input.dispatchEvent(new Event('input', { bubbles: true }))
        vi.advanceTimersByTime(500)
        input.value = 'gamma'
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
        expect(input.value).toBe('alpha')
        expect(view.state.field(searchField).query).toBe('alpha')
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
        expect(input.value).toBe('beta')
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
        expect(input.value).toBe('beta')
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
        expect(input.value).toBe('gamma')
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
        expect(input.value).toBe('')
        stop()
        view.destroy()
        vi.useRealTimers()
    })

    it('替换栏 Mod+Enter 一次换完全部(Mac ⌘Enter;Win/Linux Ctrl+Alt+Enter;Ctrl+Enter 在框里插换行)', () => {
        const { view, stop } = panelView('foo bar foo')
        openSearchReplace({ state: view.state, dispatch: tr => view.dispatch(tr) })
        // ⌥⌘F 空选区不从光标词 seed(Monaco StartFindReplaceAction),查询自己填;不挪选区
        setSearchQuery('foo', { moveCursor: false })({ state: view.state, dispatch: tr => view.dispatch(tr) })
        const repl = view.dom.querySelector('textarea[aria-label="Replace"]') as HTMLInputElement
        repl.value = 'z'
        repl.dispatchEvent(new Event('input', { bubbles: true }))
        // jsdom 的 navigator.platform 是 '' → 按 Monaco 算 Linux:Replace All = Ctrl+Alt+Enter
        repl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }))
        expect(view.state.doc.toString()).toBe('foo bar foo')
        expect(view.state.field(searchField).replacement).toBe('z\n')
        repl.value = 'z'
        repl.dispatchEvent(new Event('input', { bubbles: true }))
        repl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, altKey: true, bubbles: true }))
        expect(view.state.doc.toString()).toBe('z bar z')
        stop()
        view.destroy()
    })

    it('Shift+Enter 走 findPrev；Tab 从查找跳到替换', () => {
        const { view, stop } = panelView('foo bar foo')
        openSearchReplace({ state: view.state, dispatch: tr => view.dispatch(tr) })
        const find = view.dom.querySelector('textarea[main-field]') as HTMLInputElement
        const repl = view.dom.querySelector('textarea[aria-label="Replace"]') as HTMLInputElement
        // ⌥⌘F 空选区不 seed(Monaco StartFindReplaceAction)
        setSearchQuery('foo', { moveCursor: false })({ state: view.state, dispatch: tr => view.dispatch(tr) })
        expect(view.state.selection.main.from).toBe(0)
        find.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }))
        expect(view.state.selection.main.from).toBe(8)
        find.focus()
        find.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
        expect(document.activeElement).toBe(repl)
        stop()
        view.destroy()
    })

    it('替换栏 Enter 换当前命中', () => {
        const { view, stop } = panelView('foo bar foo')
        openSearchReplace({ state: view.state, dispatch: tr => view.dispatch(tr) })
        // ⌥⌘F 空选区不从光标词 seed(Monaco StartFindReplaceAction),查询自己填;不挪选区
        setSearchQuery('foo', { moveCursor: false })({ state: view.state, dispatch: tr => view.dispatch(tr) })
        const repl = view.dom.querySelector('textarea[aria-label="Replace"]') as HTMLInputElement
        repl.value = 'baz'
        repl.dispatchEvent(new Event('input', { bubbles: true }))
        // Monaco:选区(0-0)不正好是命中 → 第一下只选中 0-3
        repl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        expect(view.state.doc.toString()).toBe('foo bar foo')
        expect([view.state.selection.main.from, view.state.selection.main.to]).toEqual([0, 3])
        repl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        expect(view.state.doc.toString()).toBe('baz bar foo')
        stop()
        view.destroy()
    })

    it('preserve-case：Hello 换成 World，hello 换成 world', () => {
        const { view, stop } = panelView('Hello hello')
        openSearchReplace({ state: view.state, dispatch: tr => view.dispatch(tr) })
        const find = view.dom.querySelector('textarea[main-field]') as HTMLInputElement
        const repl = view.dom.querySelector('textarea[aria-label="Replace"]') as HTMLInputElement
        find.value = 'hello'
        find.dispatchEvent(new Event('input', { bubbles: true }))
        repl.value = 'world'
        repl.dispatchEvent(new Event('input', { bubbles: true }))
        const preserve = view.dom.querySelector('.cm-find-toggle-opt[name=preserve-case]') as HTMLElement
        preserve.click()
        expect(view.state.field(searchField).preserveCase).toBe(true)
        expect(replaceAll({ state: view.state, dispatch: tr => view.dispatch(tr) })).toBe(true)
        expect(view.state.doc.toString()).toBe('World world')
        stop()
        view.destroy()
    })
})
