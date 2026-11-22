import { describe, expect, it } from 'vitest'
import { liteMonaco } from '../../src/litemonaco'
import type { ShikiLike } from '../../src/litemonaco'
import type { EditorView } from '../../src/core/view/editorview'
import { highlightLayer, selectionMatchDecorations } from '../../src/core/feature/selectionlayer'
import { EditorState } from '../../src/core/model/state'
import { editorOptions } from '../../src/core/options'
import { EditorSelection } from '../../src/core/model/selection'

// 正文同词 / 选中串高亮对齐 Monaco 0.52(plaintext,对照页实测 /tmp/lc-hunt/r6/V/mrules.ts、blur.ts):
//   - 同词(WordHighlighter + TextualDocumentHighlightProvider,class wordHighlightText):只看主选区;
//     主选区单行,且落在主选区起点处的词里(光标贴词首 / 词尾都算);全文整词、区分大小写,含主选区那一处。
//     只在用户挪光标(Explicit)/ 获得焦点时出现,改文档、程序设选区清掉,失焦保留。
//   - 选中串(SelectionHighlighter,class selectionHighlight):主选区非空且单行;多选区要求都非空且文本相同
//     (不分大小写);纯空白、超过 200 字不画;子串匹配、不分大小写(查找框默认 matchCase/wholeWord 都关),
//     不含各选区自己。失焦保留(颜色减半)。

type Hit = [number, number]
function hits(doc: string, ranges: [number, number][]) {
    const state = EditorState.create({
        doc,
        selection: EditorSelection.create(ranges.map(([a, h]) => EditorSelection.range(a, h))),
        extensions: EditorState.allowMultipleSelections.of(true),
    })
    const word: Hit[] = [], sel: Hit[] = []
    selectionMatchDecorations(state).between(0, doc.length, (from, to, d) => {
        const cls = (d.spec as { class?: string }).class
        ;(cls === 'cm-wordHighlightText' ? word : sel).push([from, to])
    })
    const by = (a: Hit, b: Hit) => a[0] - b[0] || a[1] - b[1]
    return { word: word.sort(by), sel: sel.sort(by) }
}

describe('selectionMatchDecorations —— Monaco 同词 / 选中串规则', () => {
    const D = 'foo bar foo\nFoo foox foo'
    const FOO: Hit[] = [[0, 3], [8, 11], [21, 24]]
    it('空光标:词内 / 贴词尾 / 贴词首都取这个词;整词、区分大小写,含自己', () => {
        expect(hits(D, [[1, 1]])).toEqual({ word: FOO, sel: [] })
        expect(hits(D, [[3, 3]])).toEqual({ word: FOO, sel: [] })
        expect(hits(D, [[8, 8]])).toEqual({ word: FOO, sel: [] })
        expect(hits('a.b a.b', [[1, 1]])).toEqual({ word: [[0, 1], [4, 5]], sel: [] })
        expect(hits('foo  bar foo', [[4, 4]])).toEqual({ word: [], sel: [] })
    })

    it('选中整词 / 词内一段 / 单个字:同词照画,选中串按子串、不分大小写,不含选区自己', () => {
        expect(hits(D, [[0, 3]])).toEqual({ word: FOO, sel: [[8, 11], [12, 15], [16, 19], [21, 24]] })
        expect(hits(D, [[0, 2]])).toEqual({ word: FOO, sel: [[8, 10], [12, 14], [16, 18], [21, 23]] })
        expect(hits('foo bar foo', [[1, 2]])).toEqual({ word: [[0, 3], [8, 11]], sel: [[2, 3], [9, 10], [10, 11]] })
    })

    it('跨词 / 标点:没有同词,只有选中串;纯空白、多行什么都没有', () => {
        expect(hits('foo bar foo bar', [[2, 5]])).toEqual({ word: [], sel: [[10, 13]] })
        expect(hits('a.b a.b', [[1, 2]])).toEqual({ word: [], sel: [[5, 6]] })
        expect(hits('a  b  c', [[1, 3]])).toEqual({ word: [], sel: [] })
        expect(hits('foo\nbar\nfoo\nbar', [[0, 7]])).toEqual({ word: [], sel: [] })
    })

    it('多光标:同词只看主选区;选中串要各选区都非空且文本相同(不分大小写)', () => {
        const F2: Hit[] = [[0, 3], [8, 11]]
        expect(hits('foo bar foo bar', [[1, 1], [5, 5]])).toEqual({ word: F2, sel: [] })
        expect(hits('foo bar foo bar', [[1, 1], [9, 9]])).toEqual({ word: F2, sel: [] })
        expect(hits('foo bar foo bar foo', [[0, 3], [8, 11]])).toEqual({ word: [[0, 3], [8, 11], [16, 19]], sel: [[16, 19]] })
        expect(hits('foo bar FOO bar foo', [[0, 3], [8, 11]])).toEqual({ word: [[0, 3], [16, 19]], sel: [[16, 19]] })
        expect(hits('foo bar foo bar', [[0, 3], [4, 7]])).toEqual({ word: F2, sel: [] })
        expect(hits('foo bar foo bar', [[0, 3], [5, 5]])).toEqual({ word: F2, sel: [] })
    })
})

// —— 层上的时机:jsdom 没有几何,caretCoords 换成按字符等宽的假坐标 ——
function fakeHl(): ShikiLike {
    return {
        codeToTokens: () => ({ tokens: [[]], fg: '#fff', bg: '#000' }),
        getTheme: () => ({ bg: '#1e1e1e', fg: '#d4d4d4', type: 'dark' as const }),
    } as unknown as ShikiLike
}
const QUIET = { minimap: false, overviewRuler: false, vScrollbar: false, hScrollbar: false, stickyScroll: false } as const
function mk(doc: string, features: Record<string, unknown> = {}): { view: EditorView, done: () => void } {
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    // features.selectionMatch:false 同时把 selectionHighlight / occurrencesHighlight 选项关掉(见 api/options.ts 的映射表);
    // 这里要的是"内置层不装、但自己挂的 highlightLayer 照样读到默认选项",所以用后加的 editorOptions 把选项开回来
    const view = liteMonaco({
        parent, highlighter: fakeHl(), doc, lang: 'text', features: { ...QUIET, ...features },
        extensions: ({ ...QUIET, ...features } as { selectionMatch?: boolean }).selectionMatch === false ? [editorOptions.of({ selectionHighlight: true, occurrencesHighlight: 'singleFile' })] : [],
    })
    const line = (pos: number) => view.state.doc.lineAt(pos)
    ;(view as unknown as { caretCoords: EditorView['caretCoords'] }).caretCoords = (pos: number) => {
        const top = (line(pos).number - 1) * 18
        return { left: (pos - line(pos).from) * 7, right: (pos - line(pos).from) * 7, top, bottom: top + 18, height: 18 } as ReturnType<EditorView['caretCoords']>
    }
    return { view, done: () => { view.destroy(); parent.remove() } }
}
const count = (view: EditorView, cls: string) => view.dom.querySelectorAll('.' + cls).length

describe('highlightLayer —— 同词高亮的出现 / 清掉 / 失焦(Monaco WordHighlighter)', () => {
    it('挪光标才出;失焦保留;打字清掉;程序设选区清掉;获得焦点按当前光标再算', () => {
        const { view, done } = mk('foo bar foo\nfoo baz')
        view.contentDOM.focus()
        view.dispatch(view.state.update({ selection: { anchor: 1 }, userEvent: 'select' }))
        expect(count(view, 'cm-wordHighlightTextBox')).toBe(3)
        expect(count(view, 'cm-selectionMatchBox')).toBe(0)
        view.contentDOM.blur()
        expect(count(view, 'cm-wordHighlightTextBox')).toBe(3)
        view.contentDOM.focus()
        view.dispatch(view.state.update({ changes: { from: 4, insert: 'x' }, userEvent: 'input.type' }))
        expect(count(view, 'cm-wordHighlightTextBox')).toBe(0)
        view.dispatch(view.state.update({ selection: { anchor: 1 }, userEvent: 'select' }))
        expect(count(view, 'cm-wordHighlightTextBox')).toBe(3)
        view.dispatch(view.state.update({ selection: { anchor: 9 } }))
        expect(count(view, 'cm-wordHighlightTextBox')).toBe(0)
        view.contentDOM.blur()
        view.contentDOM.focus()
        expect(count(view, 'cm-wordHighlightTextBox')).toBe(3)
        done()
    })

    it('选中整词:失焦后同词和选中串都还在', () => {
        const { view, done } = mk('foo bar foo\nfoo baz')
        view.contentDOM.focus()
        view.dispatch(view.state.update({ selection: { anchor: 0, head: 3 }, userEvent: 'select' }))
        expect(count(view, 'cm-wordHighlightTextBox')).toBe(3)
        expect(count(view, 'cm-selectionMatchBox')).toBe(2)
        view.contentDOM.blur()
        expect(count(view, 'cm-wordHighlightTextBox')).toBe(3)
        expect(count(view, 'cm-selectionMatchBox')).toBe(2)
        done()
    })

    it('wordHighlight:false(语义同词另有来源,如 TS):不画文本同词,选中串照画', () => {
        const { view, done } = mk('foo bar foo\nfoo baz', { selectionMatch: false })
        const off = highlightLayer(view, { activeLine: false, bracketMatch: false, wordHighlight: false })
        view.contentDOM.focus()
        view.dispatch(view.state.update({ selection: { anchor: 1 }, userEvent: 'select' }))
        expect(count(view, 'cm-wordHighlightTextBox')).toBe(0)
        view.dispatch(view.state.update({ selection: { anchor: 0, head: 3 }, userEvent: 'select' }))
        expect(count(view, 'cm-wordHighlightTextBox')).toBe(0)
        expect(count(view, 'cm-selectionMatchBox')).toBe(2)
        off()
        done()
    })
})
