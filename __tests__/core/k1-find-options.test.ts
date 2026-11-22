// K1:IEditorFindOptions 每个字段 + Monaco 查找命令的行为测试(非默认值改变行为,默认值不变)。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StateCommand } from '../../src/core/model/state'
import { EditorState } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'
import { EditorView } from '../../src/core/view/editorview'
import { editorOptions } from '../../src/core/options'
import {
    searchField, searchPanel, openSearch, openSearchReplace, findNext, findPrev, findNextSelection,
    findPrevSelection, findWithSelection, setSearchQuery, replaceNext, rememberedFlags, FIND_COMMANDS,
    findToggleBindings,
} from '../../src/core/feature/search'

beforeEach(() => { Object.assign(rememberedFlags, { caseSensitive: false, wholeWord: false, regex: false, preserveCase: false }) })
afterEach(() => { document.body.replaceChildren() })

type Find = Record<string, unknown>
function setup(doc: string, sel: number | [number, number], find: Find = {}, panel = false) {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const view = new EditorView({
        state: EditorState.create({
            doc,
            selection: typeof sel === 'number' ? EditorSelection.cursor(sel) : EditorSelection.range(sel[0], sel[1]),
            extensions: [searchField, editorOptions.of({ find } as never)],
        }),
        parent: host,
    })
    const stop = panel ? searchPanel(view) : () => {}
    const run = (cmd: StateCommand) => cmd({ state: view.state, dispatch: tr => view.dispatch(tr) })
    return {
        view, run, sf: () => view.state.field(searchField),
        sel: () => `${view.state.selection.main.from}-${view.state.selection.main.to}`,
        done: () => { stop(); view.destroy() },
    }
}

describe('find.seedSearchStringFromSelection', () => {
    it("默认 'always':光标词与选区都 seed", () => {
        const a = setup('foo bar foo', 1)
        a.run(openSearch)
        expect(a.sf().query).toBe('foo')
        const b = setup('foo bar foo', [4, 7])
        b.run(openSearch)
        expect(b.sf().query).toBe('bar')
    })
    it("'never':不 seed", () => {
        const a = setup('foo bar foo', [4, 7], { seedSearchStringFromSelection: 'never' })
        a.run(openSearch)
        expect(a.sf().query).toBe('')
        a.run(openSearchReplace)
        expect(a.sf().query).toBe('')
    })
    it("'selection':只从非空选区 seed,不取光标词", () => {
        const a = setup('foo bar foo', 1, { seedSearchStringFromSelection: 'selection' })
        a.run(openSearch)
        expect(a.sf().query).toBe('')
        const b = setup('foo bar foo', [4, 7], { seedSearchStringFromSelection: 'selection' })
        b.run(openSearch)
        expect(b.sf().query).toBe('bar')
    })
    it('⌘E(findWithSelection)不看这个选项', () => {
        const a = setup('foo bar foo', [4, 7], { seedSearchStringFromSelection: 'never' })
        a.run(findWithSelection)
        expect(a.sf().query).toBe('bar')
    })
})

describe('find.autoFindInSelection', () => {
    const DOC = 'a\nb\nc a'
    it("默认 'never':多行选区也不进选区查找", () => {
        const a = setup(DOC, [0, 3])
        a.run(openSearch)
        expect(a.sf().findInSelection).toBe(false)
    })
    it("'always':选区非空就进选区查找", () => {
        const a = setup(DOC, [0, 1], { autoFindInSelection: 'always' })
        a.run(openSearch)
        expect(a.sf().findInSelection).toBe(true)
    })
    it("'multiline':仅多行选区进;单行不进", () => {
        const multi = setup(DOC, [0, 3], { autoFindInSelection: 'multiline' })
        multi.run(openSearch)
        expect(multi.sf().findInSelection).toBe(true)
        expect(multi.sf().scopes[0].from).toBe(0)
        expect(multi.sf().scopes[0].to).toBe(3)
        const single = setup(DOC, [0, 1], { autoFindInSelection: 'multiline' })
        single.run(openSearch)
        expect(single.sf().findInSelection).toBe(false)
    })
})

describe('find.cursorMoveOnType', () => {
    it('默认 true:打字时选区跳到命中', () => {
        const a = setup('xx foo', 0)
        a.run(setSearchQuery('foo'))
        expect(a.sel()).toBe('3-6')
    })
    it('false:选区不动,命中数照算', () => {
        const a = setup('xx foo', 0, { cursorMoveOnType: false })
        a.run(setSearchQuery('foo'))
        expect(a.sel()).toBe('0-0')
        expect(a.sf().matches.length).toBe(1)
    })
})

describe('find.loop', () => {
    const DOC = 'x x x'
    it('默认 true:最后一个命中往后环绕到第一个,第一个往前到最后一个', () => {
        const a = setup(DOC, [4, 5])
        a.run(setSearchQuery('x', { moveCursor: false }))
        a.run(findNext)
        expect(a.sel()).toBe('0-1')
        a.run(findPrev)
        expect(a.sel()).toBe('4-5')
    })
    it('false:到头不环绕(重选最后 / 第一个)', () => {
        const a = setup(DOC, [4, 5], { loop: false })
        a.run(setSearchQuery('x', { moveCursor: false }))
        a.run(findNext)
        expect(a.sel()).toBe('4-5')
        const b = setup(DOC, [0, 1], { loop: false })
        b.run(setSearchQuery('x', { moveCursor: false }))
        b.run(findPrev)
        expect(b.sel()).toBe('0-1')
    })
    it('false:中间的命中照常前进', () => {
        const a = setup(DOC, [0, 1], { loop: false })
        a.run(setSearchQuery('x', { moveCursor: false }))
        a.run(findNext)
        expect(a.sel()).toBe('2-3')
    })
    it('false:上一个 / 下一个按钮到头变灰', () => {
        const a = setup(DOC, [4, 5], { loop: false }, true)
        a.run(openSearch)
        a.run(setSearchQuery('x', { moveCursor: false }))
        const next = a.view.dom.querySelector('.cm-find-btn.next') as HTMLElement
        const prev = a.view.dom.querySelector('.cm-find-btn.prev') as HTMLElement
        expect(next.classList.contains('disabled')).toBe(true)
        expect(prev.classList.contains('disabled')).toBe(false)
        a.done()
        const b = setup(DOC, [4, 5], {}, true)
        b.run(openSearch)
        b.run(setSearchQuery('x', { moveCursor: false }))
        expect((b.view.dom.querySelector('.cm-find-btn.next') as HTMLElement).classList.contains('disabled')).toBe(false)
        b.done()
    })
    it('false:替换最后一个后不绕回开头', () => {
        const a = setup('x x', [2, 3], { loop: false })
        a.run(setSearchQuery('x', { moveCursor: false }))
        a.run(setReplacementFor('y'))
        a.run(replaceNext)
        expect(a.view.state.doc.toString()).toBe('x y')
        const b = setup('x x', [2, 3], {})
        b.run(setSearchQuery('x', { moveCursor: false }))
        b.run(setReplacementFor('y'))
        b.run(replaceNext)
        expect(b.sel()).toBe('0-1') // 默认环绕回开头
    })
})
import { setReplacement } from '../../src/core/feature/search'
const setReplacementFor = setReplacement

describe('find.addExtraSpaceOnTop', () => {
    const zoneHeights = (find: Find) => {
        const a = setup('foo', 0, find)
        const spy = vi.spyOn(a.view, 'setViewZone')
        const stop = searchPanel(a.view)
        a.run(openSearch)
        const calls = spy.mock.calls.filter(c => c[0] === 'find').map(c => c[1])
        stop()
        a.view.destroy()
        return calls
    }
    it('默认 true:查找框上方留出 view zone', () => {
        const calls = zoneHeights({})
        expect(calls.some(z => z && (z as { height: number }).height > 0)).toBe(true)
    })
    it('false:不留顶部空位', () => {
        const calls = zoneHeights({ addExtraSpaceOnTop: false })
        expect(calls.every(z => !z || (z as { height: number }).height === 0)).toBe(true)
        expect(calls.some(z => z && (z as { height: number }).height > 0)).toBe(false)
    })
})

describe('find.globalFindClipboard', () => {
    it('选项存在且默认 false;macOS 系统查找剪贴板在浏览器里读不到,没有可测的行为', () => {
        const a = setup('foo', 0)
        expect((a.view.state.facet(editorOptions) as Record<string, any>).find.globalFindClipboard).toBe(false)
    })
})

describe('Monaco 查找命令', () => {
    it('Find Next/Previous Selection:按当前选区(忽略查找框内容)往后 / 往前找', () => {
        const a = setup('foo bar foo bar foo', [0, 3])
        a.run(findNextSelection)
        expect(a.sel()).toBe('8-11')
        a.run(findNextSelection)
        expect(a.sel()).toBe('16-19')
        a.run(findPrevSelection)
        expect(a.sel()).toBe('8-11')
    })
    it('FIND_COMMANDS 用 Monaco 命令 id', () => {
        for (const id of [
            'actions.find', 'editor.action.startFindReplace', 'actions.findWithSelection',
            'editor.action.nextMatchFindAction', 'editor.action.previousMatchFindAction',
            'editor.action.nextSelectionMatchFindAction', 'editor.action.previousSelectionMatchFindAction',
            'editor.action.selectAllMatches', 'closeFindWidget',
        ]) expect(typeof FIND_COMMANDS[id]).toBe('function')
    })
})

describe('匹配计数上限 19999', () => {
    it('命中数 ≥ 19999 显示 "19999+",title 说明', () => {
        const a = setup('x\n'.repeat(20000), 0, {}, true)
        a.run(openSearch)
        a.run(setSearchQuery('x', { moveCursor: false }))
        const c = a.view.dom.querySelector('.cm-matches-count') as HTMLElement
        expect(c.textContent).toMatch(/of 19999\+$/)
        expect(c.title).toContain('19999')
        a.done()
    }, 60_000)
    it('不到上限显示真实数字', () => {
        const a = setup('x\nx\nx', 0, {}, true)
        a.run(openSearch)
        a.run(setSearchQuery('x', { moveCursor: false }))
        expect((a.view.dom.querySelector('.cm-matches-count') as HTMLElement).textContent).toBe('1 of 3')
        a.done()
    })
})

describe('查找框宽度 sash', () => {
    it('往左拖加宽;不窄于初始宽', () => {
        const a = setup('foo', 0, {}, true)
        a.run(openSearch)
        const root = a.view.dom.querySelector('.cm-find-widget') as HTMLElement
        Object.defineProperty(root, 'offsetWidth', { configurable: true, value: 419 })
        root.style.maxWidth = '800px'
        const sash = root.querySelector('.cm-find-sash') as HTMLElement
        sash.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: 500, bubbles: true, cancelable: true }))
        document.dispatchEvent(new MouseEvent('mousemove', { clientX: 400, bubbles: true }))
        expect(root.style.width).toBe('519px')
        document.dispatchEvent(new MouseEvent('mousemove', { clientX: 700, bubbles: true })) // 比初始宽窄 → 忽略
        expect(root.style.width).toBe('519px')
        document.dispatchEvent(new MouseEvent('mousemove', { clientX: -500, bubbles: true })) // 超 max-width → 忽略
        expect(root.style.width).toBe('519px')
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
        a.done()
    })
})

describe('键位', () => {
    it('Find Next / Previous Selection 绑 ⌘F3 / ⌘⇧F3(Monaco)', () => {
        const b = findToggleBindings(true)
        expect(b.find(k => k.key === 'Mod-F3')?.run).toBe(findNextSelection)
        expect(b.find(k => k.key === 'Mod-Shift-F3')?.run).toBe(findPrevSelection)
    })
})
