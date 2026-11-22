// 第五轮 R 组:装饰残留。改文档的事务只重画改到的行(patchDOM),同一事务里 StateField / decorations facet
// 在别的行上的装饰变化要一起画出来,不能等下一次整窗重画(修前要靠 tshighlight 在微任务里补一个空 effect 事务)。
// 视图层根治:patchDOM 之后按 RangeSet.compare 对比画在 DOM 上的旧装饰和新装饰(视口内),变了的行也重画。
import { describe, expect, it } from 'vitest'
import { EditorState, StateEffect, StateField } from '../../src/core/model/state'
import { EditorView, decorations } from '../../src/core/view/editorview'
import { Decoration } from '../../src/core/model/decoration'
import { RangeSetBuilder } from '../../src/core/model/rangeset'
import { EditorSelection } from '../../src/core/model/selection'
import { findNext, searchDecorations, searchField, setSearchQuery, openSearch } from '../../src/core/feature/search'
import { highlightDecorations, highlightField, setHighlights } from '../../src/lang/tshighlight'
import { indentGuidesCM7 } from '../../src/core/feature/indentguides'
import { foldCode, foldDecorations, foldField } from '../../src/core/edit/fold'

const DOC = ['alpha', 'beta foo', 'gamma', 'delta foo', 'eps'].join('\n')

function mount(extensions: unknown[], doc = DOC) {
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    const view = new EditorView({ state: EditorState.create({ doc, extensions: extensions as never }), parent })
    const lineHas = (n: number, sel: string) => !!(view.contentDOM.children[n - 1] as HTMLElement).querySelector(sel)
    const linesWith = (sel: string) => Array.from(view.contentDOM.children)
        .map((el, i) => (el as HTMLElement).querySelector(sel) ? i + 1 : 0).filter(Boolean)
    const type = (pos: number, text: string) =>
        view.dispatch(view.state.update({ changes: { from: pos, insert: text }, selection: EditorSelection.cursor(pos + text.length), userEvent: 'input.type' }))
    const done = () => { view.destroy(); parent.remove() }
    return { view, lineHas, linesWith, type, done }
}

// 一个「打字就挪」的字段:值 = 被标记的行号,改文档时挪到 (行号 % 5) + 1。没有 effect,纯随 docChanged 变。
const bump = StateEffect.define<number>()
const markedLine = StateField.define<number>({
    create: () => 3,
    update: (v, tr) => {
        for (const e of tr.effects) if (e.is(bump)) return e.value
        return tr.docChanged ? (v % 5) + 1 : v
    },
})
const xMark = Decoration.mark({ class: 'cm-x' })
const markedDecos = (state: EditorState) => {
    const b = new RangeSetBuilder<Decoration>()
    const line = state.doc.line(Math.min(state.field(markedLine), state.doc.lines))
    if (line.length) b.add(line.from, line.to, xMark)
    return b.finish()
}

// 跟着光标走的字段装饰(只有选区事务、字段值变了)
const headLine = StateField.define<number>({
    create: () => 1,
    update: (v, tr) => tr.selection ? tr.newDoc.lineAt(tr.newSelection.main.head).number : v,
})
const headDecos = (state: EditorState) => {
    const b = new RangeSetBuilder<Decoration>()
    const line = state.doc.line(state.field(headLine))
    if (line.length) b.add(line.from, line.to, Decoration.mark({ class: 'cm-head' }))
    return b.finish()
}

describe('装饰残留:改文档的事务里别的行上的装饰变化', () => {
    it('字段装饰在同一事务里从第 3 行挪到第 4 行:第 3 行不残留,第 4 行当场画出', () => {
        const { lineHas, linesWith, type, done } = mount([markedLine, decorations.of(markedDecos)])
        expect(linesWith('.cm-x')).toEqual([3])
        type(0, 'Z') // 改第 1 行
        expect(lineHas(3, '.cm-x')).toBe(false)
        expect(linesWith('.cm-x')).toEqual([4])
        type(0, 'Z')
        expect(linesWith('.cm-x')).toEqual([5])
        done()
    })

    it('tshighlight 同符号高亮:打字清掉字段,别的行上的高亮 DOM 当场清掉(不靠补发事务)', () => {
        const { view, linesWith, type, done } = mount([highlightField, decorations.of(highlightDecorations)])
        const d = view.state.doc
        view.dispatch(view.state.update({ effects: setHighlights.of([
            { from: d.line(2).from + 5, to: d.line(2).from + 8 },
            { from: d.line(4).from + 6, to: d.line(4).from + 9 },
        ]) }))
        expect(linesWith('.cm-wordHighlightText')).toEqual([2, 4])
        type(d.line(1).to, 'x') // 第 1 行打字
        // 同步断言:不等微任务
        expect(linesWith('.cm-wordHighlightText')).toEqual([])
        done()
    })

    it('查找:当前命中在第 4 行,在第 1 行打字后高亮态取消(Monaco 改文档后 matchesPosition 重算),第 4 行不残留 selected', () => {
        const { view, linesWith, type, done } = mount([searchField, decorations.of(searchDecorations)])
        openSearch(view)
        setSearchQuery('foo')(view)
        view.dispatch(view.state.update({ selection: EditorSelection.cursor(view.state.doc.line(3).from) }))
        findNext(view)
        expect(view.state.field(searchField).highlighted).toBe(true)
        expect(linesWith('.cm-searchMatch-selected')).toEqual([4])
        type(0, 'Z')
        expect(view.state.field(searchField).highlighted).toBe(false)
        expect(linesWith('.cm-searchMatch-selected')).toEqual([])
        expect(linesWith('.cm-searchMatch')).toEqual([2, 4])
        done()
    })

    it('只动选区、字段装饰跟着光标换行:旧行清掉、新行画出', () => {
        const { view, linesWith, done } = mount([headLine, decorations.of(headDecos)])
        expect(linesWith('.cm-head')).toEqual([1])
        view.dispatch(view.state.update({ selection: EditorSelection.cursor(view.state.doc.line(4).from + 1) }))
        expect(linesWith('.cm-head')).toEqual([4])
        done()
    })

    it('没变的行不重画(行节点保持同一个对象)', () => {
        const { view, type, done } = mount([markedLine, decorations.of(markedDecos)])
        const before = Array.from(view.contentDOM.children)
        type(0, 'Z')
        const after = Array.from(view.contentDOM.children)
        // 第 1 行(改了)、第 3 行(去掉)、第 4 行(加上)换新;第 2、5 行原样
        expect(after[1]).toBe(before[1])
        expect(after[4]).toBe(before[4])
        expect(after[2]).not.toBe(before[2])
        expect(after[3]).not.toBe(before[3])
        done()
    })

    it('缩进参考线:改第 5 行的缩进,上面空行(第 4 行)的参考线条数跟着变', () => {
        const doc = ['if (a) {', '    if (b) {', '        x()', '', '        y()', '    }', '}'].join('\n')
        const { view, done } = mount([decorations.of(indentGuidesCM7())], doc)
        const depth = (n: number) => (view.contentDOM.children[n - 1] as HTMLElement).getAttribute('style')?.match(/--indent-depth:\s*(\d+)/)?.[1] ?? '0'
        expect(depth(4)).toBe('2')
        const l5 = view.state.doc.line(5)
        view.dispatch(view.state.update({ changes: { from: l5.from, to: l5.from + 8 }, userEvent: 'delete' }))
        expect(depth(5)).toBe('0')
        expect(depth(4)).toBe('1')
        done()
    })

    it('有折叠时(块序列 ≠ 行序列)只动选区的字段装饰按块重画', () => {
        const doc = ['function f() {', '    a', '    b', '}', 'x', 'y'].join('\n')
        const { view, done } = mount([foldField, decorations.of(foldDecorations), headLine, decorations.of(headDecos)], doc)
        foldCode(view) // 光标在第 1 行:折掉 2–3(Monaco 留着闭括号行)
        const blocks = () => Array.from(view.contentDOM.children).map(el => (el as HTMLElement).querySelector('.cm-head') ? 'H' : '.').join('')
        expect(view.contentDOM.children.length).toBe(4) // 'function f() {⋯' / '}' / x / y
        view.dispatch(view.state.update({ selection: EditorSelection.cursor(view.state.doc.line(6).from) }))
        expect(blocks()).toBe('...H')
        view.dispatch(view.state.update({ selection: EditorSelection.cursor(view.state.doc.line(5).from) }))
        expect(blocks()).toBe('..H.')
        done()
    })

    it('组字中:装饰变到组字行上也不换掉组字行节点,组字结束提交后再画', async () => {
        // 只认远端修改的字段:远端改文档 → 标到第 2 行
        const remoteLine = StateField.define<number>({
            create: () => 3,
            update: (v, tr) => tr.docChanged && tr.isUserEvent('remote') ? 2 : v,
        })
        const decos = (state: EditorState) => {
            const b = new RangeSetBuilder<Decoration>()
            const line = state.doc.line(state.field(remoteLine))
            if (line.length) b.add(line.from, line.to, xMark)
            return b.finish()
        }
        const { view, linesWith, done } = mount([remoteLine, decorations.of(decos)], 'abc\nxyz\nqqq')
        const el = view.contentDOM.children[1] as HTMLElement
        const tn = el.querySelector('span')?.firstChild as Text ?? el.firstChild as Text
        view.dispatch(view.state.update({ selection: { anchor: view.state.doc.line(2).to } }))
        const caret = (node: Node, off: number) => { const s = document.getSelection()!; s.removeAllRanges(); const r = document.createRange(); r.setStart(node, off); s.addRange(r) }
        caret(tn, 3)
        view.contentDOM.dispatchEvent(new CompositionEvent('compositionstart'))
        tn.nodeValue = 'xyzni'
        caret(tn, 5)
        view.observer.flush()
        view.dispatch(view.state.update({ changes: { from: 0, insert: 'R' }, userEvent: 'remote' }))
        expect(view.contentDOM.children[1]).toBe(el)
        expect(el.textContent).toBe('xyzni')
        expect(linesWith('.cm-x')).toEqual([]) // 第 3 行的旧标记已清;第 2 行(组字行)暂不画
        tn.nodeValue = 'xyz你'
        caret(tn, 4)
        view.contentDOM.dispatchEvent(new CompositionEvent('compositionend'))
        await Promise.resolve(); await Promise.resolve()
        expect(view.state.doc.toString()).toBe('Rabc\nxyz你\nqqq')
        expect(linesWith('.cm-x')).toEqual([2])
        done()
    })
})
