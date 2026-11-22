// 智能扩选 / 缩选对齐 Monaco smartSelect(WordSelectionRangeProvider + BracketSelectionRangeProvider + 整行块)。
// 期望值来自 /tmp/lc-hunt/h-edit/m9-smart.ts、m13-misc.ts 的 Monaco 实测。
import { describe, expect, it } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'
import { EditorView } from '../../src/core/view/editorview'
import { selectionRangesAt, smartSelect, wordAtColumn } from '../../src/lang/tssmart'

const at = (doc: string) => {
    const pos = doc.indexOf('‸')
    return { doc: doc.slice(0, pos) + doc.slice(pos + 1), pos }
}
const chain = (src: string, dollar = true) => {
    const { doc, pos } = at(src)
    const state = EditorState.create({ doc })
    return selectionRangesAt(state, pos, undefined, dollar).map(r => doc.slice(r.from, r.to))
}

describe('selectionRangesAt(Monaco provideSelectionRanges)', () => {
    it('括号内 → 括号 → 整行 → 全文', () => {
        expect(chain('foo(a, ba‸r, c)\n')).toEqual(['bar', 'a, bar, c', '(a, bar, c)', 'foo(a, bar, c)', 'foo(a, bar, c)\n'])
    })
    it('字符串里先选单词', () => {
        expect(chain('const s = "hel‸lo world"\n')).toEqual(['hello', 'const s = "hello world"', 'const s = "hello world"\n'])
    })
    it('注释里选单词,再整行', () => {
        expect(chain('// some com‸ment here\nx\n')).toEqual(['comment', '// some comment here', '// some comment here\nx\n'])
    })
    it('块:不含首尾空白的整行 → 括号内 → 括号 → 带行首的块', () => {
        expect(chain('function f() {\n    const x = 1\n    retu‸rn x\n}\n')).toEqual([
            'return', 'return x', '    return x',
            '\n    const x = 1\n    return x\n', '{\n    const x = 1\n    return x\n}',
            'function f() {\n    const x = 1\n    return x\n}',
            'function f() {\n    const x = 1\n    return x\n}\n',
        ])
    })
    it('对象成员:先不含换行的整行', () => {
        expect(chain('const o = {\n    a: 1,\n    b: ‸2,\n}\n').slice(0, 3)).toEqual(['2', 'b: 2,', '    b: 2,'])
    })
    it('子词', () => {
        expect(chain('fooB‸arBaz\n')).toEqual(['Bar', 'fooBarBaz', 'fooBarBaz\n'])
        expect(chain('foo_b‸ar\n')).toEqual(['bar', 'foo_bar', 'foo_bar\n'])
    })
    it('词法版 wordPattern:数字、`$`', () => {
        expect(wordAtColumn('x = -1.5e3;', 7, true)).toEqual({ start: 4, end: 10 })
        expect(wordAtColumn('a.$b', 3, true)).toEqual({ start: 2, end: 4 })
        expect(wordAtColumn('a.$b', 3, false)).toEqual({ start: 3, end: 4 })
        expect(wordAtColumn('a  b', 2, true)).toBeNull()
    })
})

describe('smartSelect(SmartSelectController)', () => {
    const mk = (doc: string, sel: EditorSelection) => {
        const host = document.createElement('div')
        document.body.appendChild(host)
        const view = new EditorView({
            state: EditorState.create({ doc, selection: sel, extensions: EditorState.allowMultipleSelections.of(true) }),
            parent: host,
        })
        const text = () => view.state.selection.ranges.map(r => view.state.sliceDoc(r.from, r.to))
        return { view, text, done: () => { view.destroy(); host.remove() } }
    }

    it('缩选沿历史原路退回到光标', () => {
        const { doc, pos } = at('foo(a, ba‸r, c)\n')
        const { view, text, done } = mk(doc, EditorSelection.single(pos))
        for (let i = 0; i < 3; i++) smartSelect(view, true, true)
        expect(text()).toEqual(['(a, bar, c)'])
        smartSelect(view, false, true)
        expect(text()).toEqual(['a, bar, c'])
        smartSelect(view, false, true)
        expect(text()).toEqual(['bar'])
        smartSelect(view, false, true)
        expect(view.state.selection.main.empty && view.state.selection.main.head === pos).toBe(true)
        done()
    })

    it('每个光标各自扩选', () => {
        const doc = 'foo(aa)\nbar(bb)\n'
        const { view, text, done } = mk(doc, EditorSelection.create([EditorSelection.cursor(5), EditorSelection.cursor(13)]))
        smartSelect(view, true, true)
        expect(text()).toEqual(['aa', 'bb'])
        smartSelect(view, true, true)
        expect(text()).toEqual(['(aa)', '(bb)'])
        smartSelect(view, true, true)
        expect(text()).toEqual(['foo(aa)', 'bar(bb)'])
        done()
    })

    it('选区被别处改了就丢掉历史', () => {
        const { doc, pos } = at('foo(a, ba‸r, c)\n')
        const { view, text, done } = mk(doc, EditorSelection.single(pos))
        smartSelect(view, true, true)
        smartSelect(view, true, true)
        view.dispatch(view.state.update({ selection: EditorSelection.single(1) }))
        smartSelect(view, true, true)
        expect(text()).toEqual(['foo'])
        smartSelect(view, false, true)
        expect(view.state.selection.main.head).toBe(1)
        done()
    })

    it('从已有选区扩:只留包住它的', () => {
        const doc = 'line 40 abcdefghij klmnop\n'
        const { view, text, done } = mk(doc, EditorSelection.single(8, 18))
        smartSelect(view, true, true)
        expect(text()).toEqual(['line 40 abcdefghij klmnop'])
        smartSelect(view, true, true)
        expect(text()).toEqual([doc])
        done()
    })
})
