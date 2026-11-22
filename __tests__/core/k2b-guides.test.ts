// guides.* 选项:indentation / highlightActiveIndentation / bracketPairs / bracketPairsHorizontal / highlightActiveBracketPair。
// 括号线的几何(像素)jsdom 测不了,测"算出哪些线"(照 Monaco getLinesBracketGuides)和 DOM 里画不画。
import { describe, it, expect, afterEach } from 'vitest'
import { EditorView } from '../../src/core/view/editorview'
import { EditorState, Compartment } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'
import { editorOptions } from '../../src/core/options'
import type { IEditorOptions } from '../../src/core/options/types'
import { indentGuidesCM7, activeIndentGuideLayer } from '../../src/core/feature/indentguides'
import { computeBracketGuides, bracketPairGuideLayer } from '../../src/core/feature/bracketguides'

const src = ['function f() {', '    if (x) {', '        y()', '    }', '}'].join('\n')
const mkState = (opts: IEditorOptions, doc = src, head = 0) =>
    EditorState.create({ doc, selection: EditorSelection.single(head), extensions: [editorOptions.of(opts)] })
const compute = (s: EditorState) => computeBracketGuides(s, { fromLine: 1, toLine: s.doc.lines }, undefined)
afterEach(() => { document.body.innerHTML = '' })

describe('guides.indentation', () => {
    const count = (opts: IEditorOptions) => {
        const set = indentGuidesCM7()(mkState(opts))
        let n = 0
        set.between(0, 1e6, () => { n++ })
        return n
    }
    it('默认画缩进线;false 一条都不画', () => {
        expect(count({})).toBeGreaterThan(0)
        expect(count({ guides: { indentation: false } })).toBe(0)
    })
})

describe('guides.bracketPairs 算出的线', () => {
    it('默认(false)不出任何括号线', () => {
        expect(compute(mkState({}))).toEqual([])
        expect(compute(mkState({ guides: { bracketPairsHorizontal: true } }))).toEqual([])
    })
    it('true:每个多行括号对一条竖线,列 = min(开括号列, 闭括号列, 对内最小缩进 + 1),不含闭括号行', () => {
        const g = compute(mkState({ guides: { bracketPairs: true, bracketPairsHorizontal: false } })).filter(x => x.kind === 'vertical')
        // 外层 { ... }:第 1~4 行,列 1(闭括号在第 5 行首);
        // 内层 { ... }:开括号在第 2 行 col 13,对内最小缩进 4 → min(13, 5, 5) = 5,第 2~3 行
        // ( ) 在同一行不是多行
        const byLevel = g.map(x => [x.fromLine, x.toLine, x.col, x.level]).sort()
        expect(byLevel).toEqual([[1, 4, 1, 0], [2, 3, 5, 1]].sort())
    })
    it("'active':只画包住光标的最内层一对;光标挪走换一对", () => {
        const at = (pos: number) => compute(mkState({ guides: { bracketPairs: 'active', bracketPairsHorizontal: false } }, src, pos)).filter(x => x.kind === 'vertical')
        const inner = at(src.indexOf('y()') + 1)
        expect(inner).toHaveLength(1)
        expect(inner[0]).toMatchObject({ fromLine: 2, toLine: 3, active: true })
        const outer = at(src.indexOf('}') - 1) // 第 4 行首的空白里 → 仍在外层,不在内层(内层在第 4 行 } 之前结束? 在 } 之前 = 内层里)
        expect(outer).toHaveLength(1)
        const top = at(0) // 光标在第 1 行行首:不在任何括号对里
        expect(top).toHaveLength(0)
    })
    it('highlightActiveBracketPair:false 时活动对不标 active', () => {
        const pos = src.indexOf('y()') + 1
        const on = compute(mkState({ guides: { bracketPairs: true, bracketPairsHorizontal: false } }, src, pos))
        const off = compute(mkState({ guides: { bracketPairs: true, bracketPairsHorizontal: false, highlightActiveBracketPair: false } }, src, pos))
        expect(on.some(x => x.active)).toBe(true)
        expect(off.some(x => x.active)).toBe(false)
    })
    it("bracketPairsHorizontal:true 对所有对画横线;'active'(默认)只对活动对;false 不画", () => {
        const pos = src.indexOf('y()') + 1
        const h = (v: boolean | 'active') => compute(mkState({ guides: { bracketPairs: true, bracketPairsHorizontal: v } }, src, pos)).filter(x => x.kind !== 'vertical')
        expect(h(false)).toEqual([])
        const act = h('active')
        expect(act.every(x => x.active)).toBe(true)
        expect(act.length).toBeGreaterThan(0)
        expect(h(true).length).toBeGreaterThan(act.length)
        // 单行对 (x):横线在开括号后到闭括号
        const single = h(true).find(x => x.kind === 'horizontal-bottom' && x.fromLine === 2 && x.col === 9 && x.endCol === 10)
        expect(single).toBeDefined()
    })
    it('闭括号前面有文字:竖线多画一行,横线落在底部', () => {
        const d = 'a({\n    b\n    c })'
        const g = compute(mkState({ guides: { bracketPairs: true, bracketPairsHorizontal: true } }, d))
        const v = g.filter(x => x.kind === 'vertical' && x.toLine === 3)
        expect(v.length).toBeGreaterThan(0)
        expect(g.some(x => x.kind === 'horizontal-bottom' && x.fromLine === 3)).toBe(true)
    })
    it('独立配色池 independentColorPoolPerBracketType:层数按同类括号数', () => {
        const d = '[\n  {\n    (\n    )\n  }\n]'
        const lv = (opts: IEditorOptions) => compute(mkState({ guides: { bracketPairs: true, bracketPairsHorizontal: false }, ...opts }, d)).filter(x => x.kind === 'vertical').map(x => x.level).sort()
        expect(lv({})).toEqual([0, 1, 2])
        expect(lv({ bracketPairColorization: { enabled: true, independentColorPoolPerBracketType: true } })).toEqual([0, 0, 0])
    })
})

describe('括号线层 + 活动缩进线(DOM)', () => {
    const comp = new Compartment()
    const mk = (opts: IEditorOptions, head = src.indexOf('y()') + 1) => {
        const host = document.createElement('div')
        document.body.appendChild(host)
        const view = new EditorView({
            state: EditorState.create({ doc: src, selection: EditorSelection.single(head), extensions: [comp.of(editorOptions.of(opts))] }),
            parent: host,
        })
        return view
    }
    const set = (v: EditorView, o: IEditorOptions) => v.dispatch(v.state.update({ effects: comp.reconfigure(editorOptions.of(o)) }))
    it('默认不画;打开 bracketPairs 才有 div;运行时关掉清空', () => {
        const view = mk({})
        const off = bracketPairGuideLayer(view, ['#ffd700', '#da70d6', '#179fff'])
        const n = () => view.dom.querySelectorAll('.cm-bracketPairGuide').length
        expect(n()).toBe(0)
        set(view, { guides: { bracketPairs: true } })
        expect(n()).toBeGreaterThan(0)
        expect(view.dom.querySelector('.cm-bpg-active')).not.toBeNull()
        set(view, { guides: { bracketPairs: 'active' } })
        expect(view.dom.querySelectorAll('.cm-bpg-vertical')).toHaveLength(1)
        set(view, {})
        expect(n()).toBe(0)
        off()
    })
    it('highlightActiveIndentation:默认显示(对照),false 不显示', () => {
        const ctl = mk({})
        const offC = activeIndentGuideLayer(ctl)
        ctl.dispatch(ctl.state.update({ selection: EditorSelection.single(src.indexOf('y()') + 2) }))
        expect((ctl.dom.querySelector('.cm-activeIndentGuide') as HTMLElement).style.display).toBe('block')
        offC()
        const view = mk({ guides: { highlightActiveIndentation: false } })
        const off = activeIndentGuideLayer(view)
        view.dispatch(view.state.update({ selection: EditorSelection.single(src.indexOf('y()') + 2) }))
        const el = view.dom.querySelector('.cm-activeIndentGuide') as HTMLElement
        expect(el.style.display).toBe('none')
        off()
    })
})
