import { describe, expect, it } from 'vitest'
import { EditorView } from '../../src/core/view/editorview'
import { EditorState } from '../../src/core/model/state'
import { Decoration, WidgetType } from '../../src/core/model/decoration'
import { RangeSetBuilder } from '../../src/core/model/rangeset'
import { domAtPos, posFromDOM } from '../../src/core/view/dombridge'
import { foldCode, foldDecorations, foldField } from '../../src/core/edit/fold'
import { history } from '../../src/core/edit/history'
import { deleteText, expectDOMMatchesDoc, pressEnter, setCaret, typeText } from './input-harness'

// 攻击 Decoration.replace(折叠/隐藏区):widget 用 1 个可见字符(⋯)替换 N 个 doc 字符。
// dombridge 老假设「DOM textContent 长 === doc 行长」在此崩(header 自注:widget 落地需同步改)。
// fold.ts 已真用 replace-widget,所以桥必须把 widget 当「占 length 个 doc 字符的原子块」。

class FoldW extends WidgetType {
    constructor(readonly text = '⋯') { super() }
    eq(o: FoldW) { return o.text === this.text }
    toDOM(): Node {
        const span = document.createElement('span')
        span.className = 'cm-foldPlaceholder'
        span.textContent = this.text
        return span
    }
}

function makeWithReplace(doc: string, ranges: { from: number, to: number }[]) {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const provider = (_state: EditorState) => {
        const b = new RangeSetBuilder<Decoration>()
        for (const r of ranges) b.add(r.from, r.to, Decoration.replace({ widget: new FoldW() }))
        return b.finish()
    }
    return new EditorView({ state: EditorState.create({ doc }), parent: host, decorationProviders: [provider] })
}

// 折叠区 [from,to) 内部的 doc 位置无独立 DOM 落点(widget 原子),浏览器只能贴到边界。
// 契约:隐藏区【外】的每个位置精确往返;隐藏区【内】的位置合法贴到某端边界(from 或 to)。
function roundtripOutsideFolds(view: EditorView, folds: { from: number, to: number }[]) {
    const doc = view.state.doc
    const inside = (pos: number) => folds.some(f => pos > f.from && pos < f.to)
    for (let pos = 0; pos <= doc.length; pos++) {
        const { node, offset } = domAtPos(view.contentDOM, doc, pos)
        const back = posFromDOM(view.contentDOM, doc, node, offset)
        if (inside(pos))
            expect(folds.some(f => f.from === back || f.to === back), `pos=${pos} 内部应贴边界,得 ${back}`).toBe(true)
        else
            expect(back, `pos=${pos}`).toBe(pos)
    }
}

describe('折叠 replace-widget 下的 pos 映射', () => {
    it('行内隐藏一段:def 折成 ⋯', () => {
        // 'abcdefghi' 隐藏 [3,6) → DOM: abc<span>⋯</span>ghi;fold 后 ghi 仍要映回 6..9。
        const folds = [{ from: 3, to: 6 }]
        const view = makeWithReplace('abcdefghi', folds)
        roundtripOutsideFolds(view, folds)
    })

    it('隐藏区在行首', () => {
        const folds = [{ from: 0, to: 3 }]
        const view = makeWithReplace('abcdefghi', folds)
        roundtripOutsideFolds(view, folds)
    })

    it('隐藏区在行尾', () => {
        const folds = [{ from: 6, to: 9 }]
        const view = makeWithReplace('abcdefghi', folds)
        roundtripOutsideFolds(view, folds)
    })

    it('隐藏整行内容', () => {
        const folds = [{ from: 0, to: 6 }]
        const view = makeWithReplace('abcdef', folds)
        roundtripOutsideFolds(view, folds)
    })

    it('两段隐藏', () => {
        const folds = [{ from: 2, to: 4 }, { from: 8, to: 10 }]
        const view = makeWithReplace('abcdefghijkl', folds)
        roundtripOutsideFolds(view, folds)
    })

    it('跨行折叠:隐藏区含换行', () => {
        // fold.ts 的真实形态:from=行1末,to=末行末,替换区跨多行 → DOM 只剩 1 行。
        const folds = [{ from: 3, to: 11 }]
        const view = makeWithReplace('foo\nbar\nbaz', folds)
        roundtripOutsideFolds(view, folds)
    })
})

function foldedView(doc: string, foldAt: number) {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const view = new EditorView({
        state: EditorState.create({
            doc,
            extensions: [foldField, EditorState.allowMultipleSelections.of(true), history()],
        }),
        parent: host,
        decorationProviders: [foldDecorations],
    })
    setCaret(view, foldAt)
    foldCode({ state: view.state, dispatch: tr => view.dispatch(tr) })
    return view
}

// 真实折叠(foldField/foldCode)+ 输入:一折叠再回车,doc 不得爆炸(真页 51→464 行的 bug)。
// 根因假设:DOMReader 读回折叠区旁行时把 ⋯ 当字面文本 / 跨行 diff 混了隐藏行数。
describe('折叠后输入(回车)—— DOM≡doc 不破', () => {
    it('折叠函数体后,在折叠区外的行按回车 → doc 只 +1 行', () => {
        const doc = 'function f() {\n  a\n  b\n}\nafter\n'
        const view = foldedView(doc, 5) // caret 在 line1(可折叠)
        expect(view.state.field(foldField).has(1)).toBe(true)
        const before = view.state.doc.lines
        // 在 'after' 行末回车(折叠区外)
        const pos = view.state.doc.line(5).to
        setCaret(view, pos)
        pressEnter(view, pos)
        expect(view.state.doc.lines).toBe(before + 1)
        expectDOMMatchesDoc(view)
    })

    it('折叠后在折叠占位行(起始行)末回车 → 不吞隐藏行', () => {
        const doc = 'function f() {\n  a\n  b\n}\nafter\n'
        const view = foldedView(doc, 5)
        const beforeLines = view.state.doc.lines
        // 折叠起始行(line1)在 DOM 里是 'function f() {⋯',其 DOM 末尾=doc line1 末(widget 前边界)
        const pos = view.state.doc.line(1).to
        setCaret(view, pos)
        pressEnter(view, pos)
        // 隐藏的 a/b 行必须仍在 doc 里,不因读回丢失;回车只 +1 行
        expect(view.state.doc.toString()).toContain('  a\n  b')
        expect(view.state.doc.lines).toBe(beforeLines + 1)
        expectDOMMatchesDoc(view)
    })

    // 用户实测流程:折叠 → 在折叠【下方】行回车 → 打字。真页「一堆 bug」。
    it('折叠后在折叠区下方行回车再打字 → DOM≡doc 不破', () => {
        const doc = 'function f() {\n  a\n  b\n}\nafter\nlast\n'
        const view = foldedView(doc, 5) // 折叠 line1(函数体 a/b)
        expect(view.state.field(foldField).has(1)).toBe(true)
        // 光标到折叠区【下方】的 'after' 行末回车
        const pos = view.state.doc.line(5).to
        setCaret(view, pos)
        pressEnter(view, pos)
        expectDOMMatchesDoc(view)
        // 回车后新行 = 原 'after' 行的下一行(line6),行首落点打字
        const typePos = view.state.doc.line(6).from
        setCaret(view, typePos)
        typeText(view, typePos, 'X')
        expect(view.state.doc.toString()).toContain('after\nX')
        expectDOMMatchesDoc(view)
    })

    it('内外层都折后在下方回车不丢隐藏体', () => {
        const doc = 'function outer() {\n  function inner() {\n    x\n  }\n  y\n}\nafter\n'
        const host = document.createElement('div')
        document.body.appendChild(host)
        const view = new EditorView({
            state: EditorState.create({
                doc,
                extensions: [foldField, EditorState.allowMultipleSelections.of(true), history()],
            }),
            parent: host,
            decorationProviders: [foldDecorations],
        })
        view.dispatch(view.state.update({ selection: { anchor: view.state.doc.line(2).from } }))
        expect(foldCode({ state: view.state, dispatch: tr => view.dispatch(tr) })).toBe(true)
        view.dispatch(view.state.update({ selection: { anchor: view.state.doc.line(1).from } }))
        expect(foldCode({ state: view.state, dispatch: tr => view.dispatch(tr) })).toBe(true)
        const folds = view.state.field(foldField) as Set<number>
        expect(folds.has(1)).toBe(true)
        expect(folds.has(2)).toBe(true)
        const pos = view.state.doc.line(7).to
        setCaret(view, pos)
        pressEnter(view, pos)
        expect(view.state.doc.toString()).toContain('    x')
        expect(view.state.doc.toString()).toContain('  y')
        expectDOMMatchesDoc(view)
        view.destroy()
        host.remove()
    })
})

// 常驻视觉块 [starts,ends) 表(对齐 CM6 tile.length)的不变式:
// 任何时刻必须 === 当前视口 forEachLine 逐块 from/to。DOMChange 直接读它。
// 若表与 heightMap 失同步,或 ends 退回「行末」而非块末,折叠 header 编辑会复制隐藏体。
describe('viewBlockStarts/Ends 常驻表 ≡ 即席 forEachLine', () => {
    function liveBlocks(view: EditorView): { starts: number[], ends: number[] } {
        const starts: number[] = []
        const ends: number[] = []
        view.heightMap.forEachLine(view.viewport.from, Math.min(view.viewport.to, view.state.doc.length), view.oracle, 0, 0, b => {
            starts.push(b.from)
            ends.push(b.to)
        })
        return { starts, ends }
    }

    it('无折叠:表 === child 数 === doc 行起点/末', () => {
        const view = makeWithReplace('a\nb\nc\nd', [])
        const live = liveBlocks(view)
        expect(view.viewBlockStarts).toEqual(live.starts)
        expect(view.viewBlockEnds).toEqual(live.ends)
        expect(view.viewBlockStarts.length).toBe(view.contentDOM.children.length)
    })

    it('折叠塌行后:表块数 < doc 行数,ends 盖住隐藏体', () => {
        const view = foldedView('function f() {\n  a\n  b\n}\nafter\n', 5)
        const live = liveBlocks(view)
        expect(view.viewBlockStarts).toEqual(live.starts)
        expect(view.viewBlockEnds).toEqual(live.ends)
        expect(view.viewBlockStarts.length).toBeLessThan(view.state.doc.lines)
        // 首块 ends > 首行 .to(header 行末)——多出来的是折叠隐藏区间
        expect(view.viewBlockEnds[0]).toBeGreaterThan(view.state.doc.line(1).to)
    })

    it('折叠区下方回车后:表随 heightMap 重建保持同步', () => {
        const view = foldedView('function f() {\n  a\n  b\n}\nafter\n', 5)
        const pos = view.state.doc.line(5).to
        setCaret(view, pos)
        pressEnter(view, pos)
        const live = liveBlocks(view)
        expect(view.viewBlockStarts).toEqual(live.starts)
        expect(view.viewBlockEnds).toEqual(live.ends)
    })

    it('resetHeights 后表同步刷新', () => {
        const view = makeWithReplace('a\nb\nc', [])
        view.resetHeights()
        const live = liveBlocks(view)
        expect(view.viewBlockStarts).toEqual(live.starts)
        expect(view.viewBlockEnds).toEqual(live.ends)
    })
})

// 折叠 header 行上编辑:bounds 必须盖整块(含隐藏体),否则 DOMReader 吐出的隐藏原文被 diff 当插入 → 正文复制。
describe('折叠 header 行编辑 —— 不复制隐藏体', () => {
    it('行首插字:body 只出现一次', () => {
        const view = foldedView('function f() {\n  a\n  b\n}\nafter\n', 5)
        setCaret(view, 0)
        typeText(view, 0, 'X')
        expectDOMMatchesDoc(view)
        expect(view.state.doc.toString()).toBe('Xfunction f() {\n  a\n  b\n}\nafter\n')
    })

    it('删 header 前缀:body 只出现一次', () => {
        const view = foldedView('function f() {\n  a\n  b\n}\nafter\n', 5)
        setCaret(view, 3)
        deleteText(view, 0, 3)
        expectDOMMatchesDoc(view)
        expect(view.state.doc.toString()).toBe('ction f() {\n  a\n  b\n}\nafter\n')
    })

    it('header 中部插字:body 只出现一次', () => {
        const view = foldedView('function f() {\n  a\n  b\n}\nafter\n', 5)
        setCaret(view, 8)
        typeText(view, 8, 'Z')
        expectDOMMatchesDoc(view)
        expect(view.state.doc.toString().split('  a\n').length - 1).toBe(1)
        expect(view.state.doc.toString()).toContain('functionZ')
    })
})
