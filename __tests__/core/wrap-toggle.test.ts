// @vitest-environment jsdom
// 切折行 / 改选项不该把整条超长行多排几遍:
//  1. wordWrap 是视图层的开关,不重装配:overlay(查找框、minimap、滚动条)不拆装,查找框开着就还开着(Monaco 同)
//  2. 只换配置的事务(选项槽 / 重装配)文档没变,只重画装饰变了的行,不整窗重画
//  3. 切折行时先量正文宽、先写 scrollLeft,再把超长行换成整条折行的 DOM(之后再读宽 / 写横滚都是整行排版)
import { afterEach, describe, expect, it } from 'vitest'
import { EditorState, type Transaction } from '../../src/core/model/state'
import { EditorView } from '../../src/core/view/editorview'
import { openSearch, setSearchQuery, searchField } from '../../src/core/feature/search'
import { LONG_LINE_SCAN } from '../../src/core/view/scanwindow'
import { mount } from './h1-helpers'

const cleanup: (() => void)[] = []
afterEach(() => { while (cleanup.length) cleanup.pop()!() })

describe('updateOptions({ wordWrap }) 不重装配', () => {
    it('查找框开着、查询词还在,minimap 还是同一个节点', () => {
        const { ed, parent, done } = mount({ doc: 'alpha beta\ngamma alpha\n', features: { minimap: true } })
        cleanup.push(done)
        const run = () => ({ state: ed.state, dispatch: (tr: Transaction) => ed.dispatch(tr) })
        setSearchQuery('alpha')(run())
        openSearch(run())
        expect(ed.state.field(searchField, false)?.open).toBe(true)
        const minimap = parent.querySelector('.cm-minimap')
        expect(minimap).not.toBeNull()
        ed.updateOptions({ wordWrap: 'on' } as never)
        expect(ed.state.field(searchField, false)?.open).toBe(true)
        expect(ed.state.field(searchField, false)?.query).toBe('alpha')
        expect(parent.querySelector('.cm-minimap')).toBe(minimap)
        expect(ed.dom.classList.contains('cm-lineWrapping')).toBe(true)
        ed.updateOptions({ wordWrap: 'off' } as never)
        expect(ed.state.field(searchField, false)?.open).toBe(true)
        expect(parent.querySelector('.cm-minimap')).toBe(minimap)
        expect(ed.dom.classList.contains('cm-lineWrapping')).toBe(false)
    })

    it('scrollBeyondLastLine 同样不重装配', () => {
        const { ed, parent, done } = mount({ features: { minimap: true } })
        cleanup.push(done)
        const minimap = parent.querySelector('.cm-minimap')
        ed.updateOptions({ scrollBeyondLastLine: false } as never)
        expect(parent.querySelector('.cm-minimap')).toBe(minimap)
        expect(ed.scrollBeyondLastLine).toBe(false)
    })
})

describe('只换配置的事务', () => {
    it('文档和装饰都没变:行元素原样保留', () => {
        const { ed, done } = mount({ doc: 'one\ntwo\nthree' })
        cleanup.push(done)
        const before = Array.from(ed.contentDOM.children)
        ed.updateOptions({ cursorStyle: 'block' } as never) // 只换选项槽
        expect(Array.from(ed.contentDOM.children)).toEqual(before)
        expect(Array.from(ed.contentDOM.children).every((el, i) => el === before[i])).toBe(true)
    })
})

describe('切折行的读写顺序', () => {
    it('读正文宽、写 scrollLeft 都发生在超长行换成整条折行的 DOM 之前', () => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const long = 'abcdefghij '.repeat(Math.ceil((LONG_LINE_SCAN * 3) / 11))
        const view = new EditorView({ state: EditorState.create({ doc: `short\n${long}\ntail` }), parent })
        cleanup.push(() => { view.destroy(); parent.remove() })
        const unlimited = () => (view as unknown as { scanWindow: { end: number } }).scanWindow.end === Infinity
        const log: string[] = []
        const sd = view.scrollDOM
        let left = 0
        Object.defineProperty(sd, 'clientWidth', { configurable: true, get: () => { log.push(`read:${unlimited()}`); return 600 } })
        Object.defineProperty(sd, 'scrollLeft', { configurable: true, get: () => left, set: (v: number) => { log.push(`write:${unlimited()}`); left = v } })
        view.reconfigure({ lineWrapping: true })
        expect(unlimited()).toBe(true)
        // 第一次读宽(每视觉行字符数)和横滚归零都在换 DOM 之前
        expect(log[0]).toBe('read:false')
        expect(log.find(e => e.startsWith('write:'))).toBe('write:false')
    })
})
