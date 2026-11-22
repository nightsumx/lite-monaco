// F7 查找替换修复:逐项对照 Monaco 0.52 实测(/tmp/lc-hunt/f7/m-find.txt、m-narrow.ts)。
import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import { EditorSelection } from '../../src/core/model/selection'
import { EditorState, type StateCommand } from '../../src/core/model/state'
import { EditorView } from '../../src/core/view/editorview'
import {
    closeSearch, findNext, findPrev, findPrevious, openSearch, openSearchReplace, replaceAll, replaceNext,
    searchDecorations, searchField, searchPanel, setReplacement, setSearchQuery,
    toggleFindInSelection, toggleFindRegex, toggleFindWholeWord,
    rememberedFlags,
} from '../../src/core/feature/search'

// 这些用例按 Mac 写(⌥⌘C、⌘Enter…):查找框在打开时读 navigator.platform 定键位(第七轮起 Win/Linux 是 Alt+C、Ctrl+Alt+Enter)
Object.defineProperty(window.navigator, 'platform', { value: 'MacIntel', configurable: true })

// m-find 用的同一份文档
const DOC = "const foo = 1\nlet Foo = foo + 2\nfunction foobar() { return foo }\n// foo foo\nconst bar = 'x.y'"

function setup(doc = DOC, sel: number | [number, number] = 0) {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const view = new EditorView({
        state: EditorState.create({
            doc,
            selection: typeof sel === 'number' ? EditorSelection.cursor(sel) : EditorSelection.range(sel[0], sel[1]),
            extensions: [searchField, EditorState.allowMultipleSelections.of(true)],
        }),
        parent: host,
        decorationProviders: [searchDecorations],
    })
    const stop = searchPanel(view)
    const run = (cmd: StateCommand) => cmd({ state: view.state, dispatch: tr => view.dispatch(tr) })
    const sel_ = () => `${view.state.selection.main.from}-${view.state.selection.main.to}`
    const sf = () => view.state.field(searchField)
    const panel = () => view.dom.querySelector('.cm-find-widget') as HTMLElement
    const count = () => view.dom.querySelector('.cm-matches-count')?.textContent
    const findInput = () => view.dom.querySelector('textarea[main-field]') as HTMLInputElement
    const replInput = () => view.dom.querySelector('textarea[aria-label="Replace"]') as HTMLInputElement
    const type = (input: HTMLInputElement, v: string) => {
        input.value = v
        input.dispatchEvent(new Event('input', { bubbles: true }))
    }
    const key = (t: EventTarget, k: string, init: KeyboardEventInit = {}) => {
        const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })
        t.dispatchEvent(e)
        return e
    }
    const done = () => { stop(); view.destroy() }
    return { view, run, sel: sel_, sf, panel, count, findInput, replInput, type, key, done }
}

afterEach(() => { document.body.replaceChildren() })

// 查找开关跨实例记在模块里(Monaco storage),每个用例从默认开始
beforeEach(() => { Object.assign(rememberedFlags, { caseSensitive: false, wholeWord: false, regex: false, preserveCase: false }) })

describe('P1 Cmd+F 不改选区', () => {
    it('光标在词内:seed 该词,选区仍 7-7,计数 1 of 7', () => {
        const t = setup(DOC, 7)
        t.run(openSearch)
        expect(t.sf().query).toBe('foo')
        expect(t.sel()).toBe('7-7')
        expect(t.count()).toBe('1 of 7')
        t.done()
    })

    it('重开(保留查询)也不移动选区', () => {
        const t = setup(DOC, 7)
        t.run(openSearch)
        t.run(closeSearch)
        t.view.dispatch(t.view.state.update({ selection: EditorSelection.cursor(0) }))
        t.view.dispatch(t.view.state.update({ selection: EditorSelection.cursor(13) }))
        t.run(openSearch)
        expect(t.sel()).toBe('13-13')
        t.done()
    })

    it('选区不在任何命中上:显示「? of N」', () => {
        const t = setup(DOC, 7)
        t.run(openSearch)
        t.run(closeSearch)
        t.view.dispatch(t.view.state.update({ selection: EditorSelection.cursor(1) }))
        // 光标在 const 上 → seed const;再改回 foo 查询,光标 1 不在 foo 上
        t.run(openSearch)
        t.type(t.findInput(), 'foo')
        t.view.dispatch(t.view.state.update({ selection: EditorSelection.cursor(1) }))
        // 只挪光标不重算(Monaco 只在 research / 跳转时改计数);改条件重算时光标在所有命中前 → ?
        expect(t.count()).toBe('1 of 7')
        t.run(toggleFindWholeWord)
        expect(t.count()).toBe('? of 6')
        t.done()
    })

    it('regex 模式下 seed 先转义(x.y → x\\.y)', () => {
        const t = setup(DOC, [DOC.indexOf("'x.y'"), DOC.indexOf("'x.y'") + 5])
        t.run(toggleFindRegex)
        t.run(openSearch)
        expect(t.sf().query).toBe("'x\\.y'")
        expect(t.count()).toBe('1 of 1')
        t.done()
    })

    it('多行选区:不 seed、不自动选区内查找;之后输入跳到选区之后的命中', () => {
        const t = setup(DOC, [14, 65])
        t.run(openSearch)
        expect(t.sf().query).toBe('')
        expect(t.sf().findInSelection).toBe(false)
        expect(t.sel()).toBe('14-65')
        t.done()
    })
})

describe('P2 Enter / Shift+Enter / ⌘G', () => {
    it('7-7 打开后 Enter → 18-21 → 24-27;Shift+Enter 从 7 起 → 最后一个 72-75', () => {
        const t = setup(DOC, 7)
        t.run(openSearch)
        t.key(t.findInput(), 'Enter')
        expect(t.sel()).toBe('18-21')
        t.key(t.findInput(), 'Enter')
        expect(t.sel()).toBe('24-27')
        t.done()
        const u = setup(DOC, 7)
        u.run(openSearch)
        u.key(u.findInput(), 'Enter', { shiftKey: true })
        expect(u.sel()).toBe('72-75')
        expect(u.count()).toBe('7 of 7')
        u.done()
    })

    it('查找框关着、查询为空:findNext 打开(不抢焦点)、seed 光标词并跳', () => {
        const t = setup(DOC, 7)
        t.view.focus()
        expect(t.run(findNext)).toBe(true)
        expect(t.sf().open).toBe(true)
        expect(t.sf().query).toBe('foo')
        expect(t.sel()).toBe('18-21')
        expect(document.activeElement).toBe(t.view.contentDOM)
        t.run(findNext)
        expect(t.sel()).toBe('24-27')
        t.run(findPrevious)
        expect(t.sel()).toBe('18-21')
        t.done()
    })

    it('关着但有旧查询:findPrev 打开并跳上一个', () => {
        const t = setup(DOC, 0)
        t.run(setSearchQuery('foo', { moveCursor: false }))
        t.view.dispatch(t.view.state.update({ selection: EditorSelection.cursor(24) }))
        t.run(findPrev)
        expect(t.sf().open).toBe(true)
        expect(t.sel()).toBe('18-21')
        t.done()
    })

    it('框内 ⌘G / ⌘⇧G / F3 也跳,焦点留在框里', () => {
        const t = setup(DOC, 0)
        t.run(openSearch)
        t.type(t.findInput(), 'foo')
        expect(t.sel()).toBe('6-9')
        t.findInput().focus()
        t.key(t.findInput(), 'g', { code: 'KeyG', metaKey: true })
        expect(t.sel()).toBe('18-21')
        t.key(t.findInput(), 'F3')
        expect(t.sel()).toBe('24-27')
        t.key(t.findInput(), 'g', { code: 'KeyG', metaKey: true, shiftKey: true })
        expect(t.sel()).toBe('18-21')
        expect(document.activeElement).toBe(t.findInput())
        t.done()
    })
})

describe('P2 替换', () => {
    it('替换后计数更新(1 of 7 → 1 of 6 → 1 of 5),选中下一个', () => {
        const t = setup(DOC, 0)
        t.run(openSearchReplace)
        t.type(t.findInput(), 'foo')
        expect(t.count()).toBe('1 of 7')
        t.type(t.replInput(), 'QQ')
        t.key(t.replInput(), 'Enter')
        expect(t.count()).toBe('1 of 6')
        expect(t.sel()).toBe('17-20')
        t.key(t.replInput(), 'Enter')
        expect(t.count()).toBe('1 of 5')
        expect(t.sel()).toBe('22-25')
        t.done()
    })

    it('选区不在命中上:第一下 Enter 只选中,不替换', () => {
        const t = setup(DOC, 0)
        t.run(openSearchReplace)
        t.run(setSearchQuery('foo', { moveCursor: false }))
        t.run(setReplacement('QQ'))
        expect(t.count()).toBe('? of 7')
        t.run(replaceNext)
        expect(t.view.state.doc.toString()).toBe(DOC)
        expect(t.sel()).toBe('6-9')
        expect(t.count()).toBe('1 of 7')
        t.done()
    })

    it('整词模式替换后,计数仍按整词(不把 foobar 算进来)', () => {
        const t = setup(DOC, 2)
        t.run(openSearchReplace)
        t.type(t.findInput(), 'foo')
        t.run(toggleFindWholeWord)
        expect(t.count()).toBe('1 of 6')
        t.type(t.replInput(), 'Q')
        t.key(t.replInput(), 'Enter')
        expect(t.sf().matches.length).toBe(5)
        expect(t.count()).toBe('1 of 5')
        t.done()
    })

    it('Replace All(⌘Enter):整词只换 6 处;选区随改动映射;计数 No results', () => {
        const t = setup(DOC, 2)
        t.run(openSearchReplace)
        t.type(t.findInput(), 'foo')
        t.run(toggleFindWholeWord)
        t.type(t.replInput(), 'Q')
        t.key(t.replInput(), 'Enter', { metaKey: true })
        expect(t.view.state.doc.toString()).toBe("const Q = 1\nlet Q = Q + 2\nfunction foobar() { return Q }\n// Q Q\nconst bar = 'x.y'")
        expect(t.sel()).toBe('6-7')
        expect(t.count()).toBe('No results')
        t.done()
    })

    it('正则特殊字符 + $& / $1 $2 $$ $0', () => {
        const t = setup(DOC, 0)
        t.run(openSearchReplace)
        t.run(toggleFindRegex)
        t.type(t.findInput(), "'x\\.y'")
        expect(t.count()).toBe('1 of 1')
        t.type(t.replInput(), '[$&]')
        t.key(t.replInput(), 'Enter')
        expect(t.view.state.doc.toString().endsWith("const bar = ['x.y']")).toBe(true)
        t.done()

        // 正则开关跨实例记住(Monaco storage):u 打开时已是正则
        const u = setup(DOC, 0)
        u.run(openSearchReplace)
        expect(u.sf().regex).toBe(true)
        u.type(u.findInput(), '(\\w+) = (\\d)')
        u.type(u.replInput(), '$2 = $1 $$ $0')
        u.key(u.replInput(), 'Enter', { metaKey: true })
        expect(u.view.state.doc.toString().startsWith('const 1 = foo $ foo = 1\n')).toBe(true)
        u.done()
    })

    it('非法正则:No results,不炸', () => {
        const t = setup(DOC, 0)
        t.run(openSearch)
        t.run(toggleFindRegex)
        t.type(t.findInput(), 'fo(')
        expect(t.count()).toBe('No results')
        t.done()
    })
})

describe('P2 选区内查找', () => {
    it('⌥⌘L(框内):以当前选区为范围,止于行首的多行选区收到上一行末;关闭清掉范围', () => {
        const t = setup(DOC, [14, 65])
        t.run(openSearch)
        t.findInput().focus()
        t.key(t.findInput(), 'l', { code: 'KeyL', altKey: true, metaKey: true })
        expect(t.sf().findInSelection).toBe(true)
        expect([t.sf().scopes[0].from, t.sf().scopes[0].to]).toEqual([14, 64])
        t.type(t.findInput(), 'foo')
        expect(t.sf().matches.map(m => m.from)).toEqual([18, 24, 41, 59])
        t.key(t.findInput(), 'Escape')
        expect(t.sf().findInSelection).toBe(false)
        t.done()
    })

    it('按钮:空选区开不了,勾选状态跟着 state', () => {
        const t = setup(DOC, 0)
        t.run(openSearch)
        const btn = t.panel().querySelector('.cm-find-selection') as HTMLElement
        btn.click()
        expect(t.sf().findInSelection).toBe(false)
        expect(btn.classList.contains('checked')).toBe(false)
        t.view.dispatch(t.view.state.update({ selection: EditorSelection.range(14, 31) }))
        btn.click()
        expect(t.sf().findInSelection).toBe(true)
        expect(btn.classList.contains('checked')).toBe(true)
        t.done()
    })

    it('查找框关着时 toggleFindInSelection 记下范围,打开后生效', () => {
        const t = setup(DOC, [14, 65])
        t.run(toggleFindInSelection)
        t.run(openSearch)
        expect(t.sf().findInSelection).toBe(true)
        expect([t.sf().scopes[0].from, t.sf().scopes[0].to]).toEqual([14, 64])
        t.done()
    })
})

describe('P2 开关快捷键 ⌥⌘C / ⌥⌘W / ⌥⌘R', () => {
    it('框内快捷键只改条件,不移光标;点按钮才移', () => {
        const t = setup(DOC, 0)
        t.run(openSearch)
        t.type(t.findInput(), 'Foo')
        expect(t.sel()).toBe('6-9')
        t.view.dispatch(t.view.state.update({ selection: EditorSelection.cursor(0) }))
        t.findInput().focus()
        t.key(t.findInput(), 'c', { code: 'KeyC', altKey: true, metaKey: true })
        expect(t.sf().caseSensitive).toBe(true)
        expect(t.sel()).toBe('0-0')
        expect(t.count()).toBe('? of 1')
        t.key(t.findInput(), 'w', { code: 'KeyW', altKey: true, metaKey: true })
        expect(t.sf().wholeWord).toBe(true)
        t.key(t.findInput(), 'r', { code: 'KeyR', altKey: true, metaKey: true })
        expect(t.sf().regex).toBe(true)
        expect(t.sel()).toBe('0-0')
        // 按钮:移到命中
        ;(t.panel().querySelector('[name="regex"]') as HTMLElement).click()
        expect(t.sf().regex).toBe(false)
        expect(t.sel()).toBe('18-21')
        t.done()
    })
})

describe('P2 焦点', () => {
    it('Escape:关闭、焦点回编辑器、选区停在当前命中', () => {
        const t = setup(DOC, 0)
        t.run(openSearch)
        t.type(t.findInput(), 'foo')
        t.key(t.findInput(), 'Enter')
        expect(t.sel()).toBe('18-21')
        t.key(t.findInput(), 'Escape')
        expect(t.sf().open).toBe(false)
        expect(document.activeElement).toBe(t.view.contentDOM)
        expect(t.sel()).toBe('18-21')
        t.done()
    })

    it('Escape 从替换框也回编辑器', () => {
        const t = setup(DOC, 0)
        t.run(openSearchReplace)
        t.type(t.findInput(), 'foo')
        t.replInput().focus()
        t.key(t.replInput(), 'Escape')
        expect(document.activeElement).toBe(t.view.contentDOM)
        expect(t.sel()).toBe('6-9')
        t.done()
    })

    it('Tab 次序(Monaco):查找 → 替换 → 开关…→ 关闭 → 替换栏按钮 → 展开按钮 → 回查找;Shift+Tab 反向', () => {
        const t = setup(DOC, 0)
        t.run(openSearchReplace)
        t.type(t.findInput(), 'foo')
        const p = t.panel()
        t.findInput().focus()
        const seen: string[] = []
        for (let i = 0; i < 14; i++) {
            const a = document.activeElement as HTMLElement
            seen.push(a.getAttribute('aria-label') ?? a.getAttribute('name') ?? a.className)
            t.key(a, 'Tab')
            expect(p.contains(document.activeElement)).toBe(true)
        }
        expect(seen).toEqual([
            'Find', 'Replace', 'Match Case (⌥⌘C)', 'Match Whole Word (⌥⌘W)', 'Use Regular Expression (⌥⌘R)',
            'Previous Match (⇧Enter)', 'Next Match (Enter)', 'Find in Selection (⌥⌘L)', 'Close (Escape)',
            'Preserve Case (⌥⌘P)', 'Replace (Enter)', 'Replace All (⌘Enter)', 'Toggle Replace', 'Find',
        ])
        t.findInput().focus()
        t.key(t.findInput(), 'Tab', { shiftKey: true })
        expect(document.activeElement?.getAttribute('aria-label')).toBe('Toggle Replace')
        t.done()
    })

    it('只开查找时 Tab:查找 → Match Case(跳过隐藏的替换栏)', () => {
        const t = setup(DOC, 0)
        t.run(openSearch)
        t.type(t.findInput(), 'foo')
        t.findInput().focus()
        t.key(t.findInput(), 'Tab')
        expect(document.activeElement?.getAttribute('aria-label')).toBe('Match Case (⌥⌘C)')
        t.done()
    })

    it('Alt+Enter 全选命中后焦点回编辑器', () => {
        const t = setup(DOC, 0)
        t.run(openSearch)
        t.type(t.findInput(), 'foo')
        t.key(t.findInput(), 'Enter', { altKey: true })
        expect(t.view.state.selection.ranges.length).toBe(7)
        expect(document.activeElement).toBe(t.view.contentDOM)
        t.done()
    })
})

describe('P2 窄编辑器', () => {
    // jsdom 无布局:桩 view.dom / scrollDOM 宽度,widget 的 right 用 inline style 给
    async function sized(t: ReturnType<typeof setup>, W: number, right: number) {
        Object.defineProperty(t.view.dom, 'clientWidth', { configurable: true, get: () => W })
        Object.defineProperty(t.view.scrollDOM, 'clientWidth', { configurable: true, get: () => W - 1 })
        Object.defineProperty(t.view.scrollDOM, 'clientHeight', { configurable: true, get: () => 300 })
        t.panel().style.right = `${right}px`
        // 尺寸变化走 onGeometry(scroll / ResizeObserver 汇合点)
        t.view.scrollDOM.dispatchEvent(new Event('scroll'))
        await new Promise(r => setTimeout(r, 5))
    }

    it('Monaco 实测阈值:500/80 正常、450/74 reduced、400/69 narrow、350/64 collapsed;maxWidth = W - right - 15', async () => {
        const t = setup(DOC, 0)
        t.run(openSearch)
        const p = t.panel()
        const cls = () => ['reduced-find-widget', 'narrow-find-widget', 'collapsed-find-widget'].filter(c => p.classList.contains(c))
        await sized(t, 800, 111)
        expect(cls()).toEqual([])
        expect(p.style.maxWidth).toBe('674px')
        await sized(t, 500, 80)
        expect(cls()).toEqual([])
        expect(p.style.maxWidth).toBe('405px')
        await sized(t, 450, 74)
        expect(cls()).toEqual(['reduced-find-widget'])
        expect(p.style.maxWidth).toBe('361px')
        await sized(t, 400, 69)
        expect(cls()).toEqual(['reduced-find-widget', 'narrow-find-widget'])
        await sized(t, 350, 64)
        expect(cls()).toEqual(['reduced-find-widget', 'narrow-find-widget', 'collapsed-find-widget'])
        t.done()
    })
})

// 查找状态按编辑器实例(Monaco FindController 属于 editor):别的实例的 state 拿来新建不继承查找会话。
// 浏览器复现:/tmp/lc-hunt/g2/multi2.ts(修复前 B 一挂上就弹出查找框、高亮 2 处、焦点被抢进 B 的查找框)
describe('#4 搜索状态按实例', () => {
    it('用 A 的 state 新建 B:B 的查找框关着、查询空、焦点不进 B 的查找框;A 不受影响', () => {
        const a = setup('foo bar foo', 0)
        a.run(openSearch)
        a.type(a.findInput(), 'foo')
        expect(a.sf().open).toBe(true)
        const host = document.createElement('div')
        document.body.appendChild(host)
        const b = new EditorView({ state: a.view.state, parent: host, decorationProviders: [searchDecorations] })
        const stop = searchPanel(b)
        const sf = b.state.field(searchField)
        expect(sf.open).toBe(false)
        expect(sf.query).toBe('')
        expect(b.dom.querySelector('.cm-find-widget')).toBeNull()
        expect(document.activeElement).not.toBe(b.dom.querySelector('textarea[main-field]'))
        expect(a.sf().open).toBe(true)
        expect(a.sf().query).toBe('foo')
        // B 里 ⌘G 从自己光标处的词 seed(mfind2.ts:第二个 Monaco 实例 seed 'qux',不用第一个的词)
        b.dispatch(b.state.update({ selection: EditorSelection.cursor(5) }))
        findNext({ state: b.state, dispatch: tr => b.dispatch(tr) })
        expect(b.state.field(searchField).query).toBe('bar')
        stop(); b.destroy(); a.done()
    })

    it('空行上 ⌘G(没词可 seed):打开空查找框,不动光标(Monaco,g2/mfind4.ts)', () => {
        const t = setup('foo  bar\n\nfoo', 9)
        expect(t.run(findNext)).toBe(true)
        expect(t.sf().open).toBe(true)
        expect(t.sf().query).toBe('')
        expect(t.sel()).toBe('9-9')
        t.done()
    })
})

// 正则:对齐 Monaco 0.52 TextModelSearch —— 不含 \n / \r / \W 的正则逐行搜(^ $ 是行首行尾),
// 含的整篇 + m 标志;一律 u 标志;空匹配算命中(Searcher:卡在原地时前进一个码点,行尾后不再找)。
// 期望值:/tmp/lc-hunt/g2/regex.ts(Monaco 侧实测,文档 = m-find 的 DOC + 末尾换行)
describe('#9 正则空匹配 / 行锚点', () => {
    const D = DOC + '\n'
    const ms = (q: string, doc = D) => {
        const t = setup(doc, 0)
        t.run(openSearch)
        t.run(setSearchQuery(q, { regex: true }))
        const r = { all: t.sf().matches.map(m => `${m.from}-${m.to}`), sel: t.sel(), count: t.count() }
        t.done()
        return r
    }
    it('^ → 每行行首(含末尾空行)6 个;光标在 0 时跳过原地的空命中 → 2 of 6,选区 14', () => {
        const r = ms('^')
        expect(r.all).toEqual(['0-0', '14-14', '32-32', '65-65', '76-76', '94-94'])
        expect(r.sel).toBe('14-14')
        expect(r.count).toBe('2 of 6')
    })
    it('$ / ^$ / ^c / o$ 按行锚定', () => {
        expect(ms('$').all).toEqual(['13-13', '31-31', '64-64', '75-75', '93-93', '94-94'])
        expect(ms('$').count).toBe('1 of 6')
        expect(ms('^$').all).toEqual(['94-94'])
        expect(ms('^c').all).toEqual(['0-1', '76-77'])
        expect(ms('o$').all).toEqual(['74-75'])
    })
    it('x* / \\b / (?=f):95 / 34 / 8 个(与 Monaco 计数一致)', () => {
        expect(ms('x*').all.length).toBe(95)
        expect(ms('x*').count).toBe('2 of 95')
        expect(ms('\\b').all.length).toBe(34)
        expect(ms('(?=f)').all.length).toBe(8)
        expect(ms('(?=f)').sel).toBe('6-6')
    })
    it('Monaco Searcher:非空命中顶到行尾后,这一行不再出空命中;\\s 不跨行(逐行搜)', () => {
        expect(ms('x*', 'ax\nb').all).toEqual(['0-0', '1-2', '3-3', '4-4'])
        expect(ms('^\\s*$', 'a\n\n\nb').all).toEqual(['2-2', '3-3'])
        // 含 \n:整篇搜,可以跨行
        expect(ms('a\\n', 'a\na\nb').all).toEqual(['0-2', '2-4'])
    })
    it('Enter 在空命中间前进;全部替换 ^ → 每行前插入', () => {
        const t = setup(D, 0)
        t.run(openSearchReplace)
        t.run(toggleFindRegex)
        t.run(setSearchQuery('^'))
        t.run(findNext)
        expect(t.sel()).toBe('32-32')
        expect(t.count()).toBe('3 of 6')
        t.run(findPrev)
        expect(t.sel()).toBe('14-14')
        t.run(setReplacement('> '))
        t.run(replaceAll)
        expect(t.view.state.doc.toString()).toBe(D.split('\n').map(l => '> ' + l).join('\n'))
        t.done()
    })
    it('全部替换 x*、(?=f)、$:与 Monaco 结果逐字相同', () => {
        const ra = replaceAll
        const run = (q: string) => {
            const t = setup(D, 0)
            t.run(openSearchReplace); t.run(setSearchQuery(q, { regex: true })); t.run(setReplacement('>')); t.run(ra)
            const out = t.view.state.doc.toString()
            t.done()
            return out
        }
        expect(run('x*')).toBe(">c>o>n>s>t> >f>o>o> >=> >1>\n>l>e>t> >F>o>o> >=> >f>o>o> >+> >2>\n>f>u>n>c>t>i>o>n> >f>o>o>b>a>r>(>)> >{> >r>e>t>u>r>n> >f>o>o> >}>\n>/>/> >f>o>o> >f>o>o>\n>c>o>n>s>t> >b>a>r> >=> >'>>.>y>'>\n>")
        expect(run('(?=f)')).toBe("const >foo = 1\nlet >Foo = >foo + 2\n>function >foobar() { return >foo }\n// >foo >foo\nconst bar = 'x.y'\n")
        expect(run('$')).toBe("const foo = 1>\nlet Foo = foo + 2>\nfunction foobar() { return foo }>\n// foo foo>\nconst bar = 'x.y'>\n>")
    })
    it('替换串的 $1 在空匹配 / 前瞻里也按原位重跑正则取捕获组', () => {
        const t = setup('ab ac', 0)
        t.run(openSearchReplace); t.run(toggleFindRegex); t.run(setSearchQuery('a(?=(\\w))')); t.run(setReplacement('[$1]'))
        t.run(replaceAll)
        expect(t.view.state.doc.toString()).toBe('[b]b [c]c')
        t.done()
    })
    it('边打字边找从起点找:打 ^ 跳到 14,再打成 ^c 回到 0(Monaco startPosition);用户挪光标后起点跟着变', () => {
        const t = setup(D, 0)
        t.run(openSearch)
        t.run(toggleFindRegex)
        t.run(setSearchQuery('^'))
        expect(t.sel()).toBe('14-14')
        t.run(setSearchQuery('^c'))
        expect(t.sel()).toBe('0-1')
        t.run(findNext)
        expect(t.sel()).toBe('76-77')
        t.run(setSearchQuery('^'))
        expect(t.sel()).toBe('14-14') // findNext 不改起点
        t.view.dispatch(t.view.state.update({ selection: EditorSelection.cursor(40) }))
        t.run(setSearchQuery('^c'))
        expect(t.sel()).toBe('76-77')
        t.done()
    })
    it('空文档:^ 有 1 个命中', () => {
        expect(ms('^', '').all).toEqual(['0-0'])
    })
})
