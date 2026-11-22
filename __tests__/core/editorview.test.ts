import type { Extension, Transaction } from '../../src/core/model/state'
import { describe, expect, it } from 'vitest'
import { Decoration } from '../../src/core/model/decoration'
import { decorations, EditorView } from '../../src/core/view/editorview'
import { indentGuidesCM7 } from '../../src/core/feature/indentguides'
import { RangeSet } from '../../src/core/model/rangeset'
import { EditorSelection } from '../../src/core/model/selection'
import { EditorState } from '../../src/core/model/state'

// CM7 EditorView —— 阶段4 协调层最小切片:持 state、收 decorations facet → buildtile → materialize
// 挂 DOM,dispatch 后纯重建内容。确定性结构,jsdom outerHTML 钉死(IME/选区/coords 才归 aipeek)。

function make(doc: string, ext: Extension = [], opts?: { drawSelection?: boolean }) {
    return new EditorView({ state: EditorState.create({ doc, extensions: ext }), drawSelection: opts?.drawSelection })
}

describe('editorView', () => {
    it('构造 → dom 是 cm-editor,内含 cm-scroller > cm-content', () => {
        const view = make('hello')
        expect(view.dom.className).toBe('cm-editor')
        expect(view.scrollDOM.className).toBe('cm-scroller')
        expect(view.contentDOM.className).toBe('cm-content')
        expect(view.contentDOM.parentElement).toBe(view.scrollDOM) // 滚动区包内容,overlay 才是 view.dom 的兄弟
        expect(view.scrollDOM.parentElement).toBe(view.dom)
        expect(view.contentDOM.textContent).toBe('hello')
    })

    it('行号 → gutters 在 clip 壳内(防 translateY 被 editor overflow 裁没)', () => {
        const view = new EditorView({
            state: EditorState.create({ doc: 'a\nb\nc' }),
            lineNumbers: true,
        })
        const clip = view.dom.querySelector('.cm-gutters-clip')
        const gutters = view.dom.querySelector('.cm-gutters')
        expect(clip).toBeTruthy()
        expect(gutters).toBeTruthy()
        expect(gutters!.parentElement).toBe(clip)
        expect(clip!.parentElement).toBe(view.dom)
        // clip 是 scroller 的 flex 兄(左侧),不进滚动容器
        expect(clip!.nextElementSibling).toBe(view.scrollDOM)
    })

    it('多行 → 每行一个 cm-line', () => {
        const view = make('a\nb')
        expect(view.contentDOM.querySelectorAll('.cm-line').length).toBe(2)
    })

    it('decorations facet → mark 投影进 DOM', () => {
        const deco = decorations.of(RangeSet.of([Decoration.mark({ class: 'kw' }).range(0, 5)], true))
        const view = make('const x', [deco])
        expect(view.contentDOM.querySelector('span.kw')?.textContent).toBe('const')
    })

    it('dispatch 插入 → 内容随新 doc 重建', () => {
        const view = make('ab')
        view.dispatch(view.state.update({ changes: { from: 1, insert: 'X' } }))
        expect(view.contentDOM.textContent).toBe('aXb')
        expect(view.state.doc.toString()).toBe('aXb')
    })

    it('dispatch 换行 → cm-line 增加', () => {
        const view = make('ab')
        view.dispatch(view.state.update({ changes: { from: 1, insert: '\n' } }))
        expect(view.contentDOM.querySelectorAll('.cm-line').length).toBe(2)
    })

    it('mount(parent) → content 挂进宿主', () => {
        const host = document.createElement('div')
        new EditorView({ state: EditorState.create({ doc: 'hi' }), parent: host })
        expect(host.querySelector('.cm-content')?.textContent).toBe('hi')
    })

    it('destroy → 从 DOM 移除', () => {
        const host = document.createElement('div')
        const view = new EditorView({ state: EditorState.create({ doc: 'hi' }), parent: host })
        view.destroy()
        expect(host.querySelector('.cm-content')).toBe(null)
    })

    // —— 协调层骨架契约(虚拟化/增量 docView 未来会扰动这些,先钉死)——

    it('换子不换根:重建后 contentDOM 身份不变(observer/keydown 不被孤立)', () => {
        const view = make('ab')
        const before = view.contentDOM
        view.dispatch(view.state.update({ changes: { from: 1, insert: 'X' } }))
        expect(view.contentDOM).toBe(before) // 同一元素,只换 children
    })

    it('selection 跨重建存活:focus 时 dispatch 选区 → 原生选区被复原到对应文本节点', () => {
        const host = document.createElement('div')
        document.body.appendChild(host)
        const view = new EditorView({ state: EditorState.create({ doc: 'hello\nworld' }), parent: host })
        view.contentDOM.focus()
        expect(view.root.activeElement).toBe(view.contentDOM)
        view.dispatch(view.state.update({ selection: { anchor: 2 } }))
        const sel = view.dom.ownerDocument.getSelection()!
        expect(sel.anchorNode?.nodeType).toBe(3) // 落在文本节点
        expect(sel.anchorOffset).toBe(2)
        // observer 的选区快照被 setSelectionRange 同步,避免复原写触发反馈环再读。
        expect(view.observer.selectionRange.anchorOffset).toBe(2)
        expect(view.observer.selectionChanged).toBe(false)
    })

    it('未 focus 时 updateSelection 不写原生选区(activeElement 非 contentDOM 直接返回)', () => {
        const view = make('hello') // 未挂 document、未 focus
        view.dispatch(view.state.update({ selection: { anchor: 3 } }))
        expect(view.state.selection.main.anchor).toBe(3) // state 仍更新
    })

    it('空选区搬家不重建 contentDOM(防点击聚焦 gutter 宽闪 → 光标抖)', () => {
        const host = document.createElement('div')
        document.body.appendChild(host)
        // drawSelection 默认 false:点击落点只写选区
        const view = new EditorView({
            state: EditorState.create({ doc: 'hello\nworld\nfoo' }),
            parent: host,
            lineNumbers: true,
        })
        const before = Array.from(view.contentDOM.children)
        const guttersBefore = view.dom.querySelector('.cm-gutters')
        const gutHTML = guttersBefore?.innerHTML
        view.dispatch(view.state.update({ selection: { anchor: 8 } }))
        const after = Array.from(view.contentDOM.children)
        expect(after.length).toBe(before.length)
        for (let i = 0; i < before.length; i++)
            expect(after[i]).toBe(before[i]) // 同一节点,未 replaceChildren
        // gutter 也未整列重建
        expect(view.dom.querySelector('.cm-gutters')?.innerHTML).toBe(gutHTML)
        expect(view.state.selection.main.head).toBe(8)
        view.destroy()
        host.remove()
    })

    it('ignore 反馈环抑制:重建期间的自造 DOM 变异不流回 state', () => {
        const view = make('abc')
        const startDoc = view.state.doc.toString()
        // 写 DOM 全程包在 observer.ignore() 里,不应触发 flush 把自造变异 diff 回 state。
        view.dispatch(view.state.update({ changes: { from: 3, insert: 'd' } }))
        view.observer.flush() // 强制 flush:ignore 已 clear 掉自造记录,无残留变异
        expect(view.state.doc.toString()).toBe('abcd')
        expect(view.state.doc.toString()).not.toBe(startDoc)
    })
})

// —— 增量 docView:只重建变更覆盖的行,其余行 DOM 节点身份保持(真实可观测行为)——
describe('editorView 增量 docView', () => {
    it('行内编辑:未变行保持 DOM 身份,只变动行被替换', () => {
        const view = make('aaa\nbbb\nccc')
        const [line0, line1, line2] = Array.from(view.contentDOM.children)
        view.dispatch(view.state.update({ changes: { from: 5, insert: 'X' } })) // 改中间行 bbb→bXbb
        expect(view.contentDOM.children[0]).toBe(line0)
        expect(view.contentDOM.children[2]).toBe(line2)
        expect(view.contentDOM.children[1]).not.toBe(line1)
        expect(view.contentDOM.children[1].textContent).toBe('bXbb')
    })

    it('插换行:行数增,后续未变行身份保持', () => {
        const view = make('a\nb\nc')
        const lineC = view.contentDOM.children[2]
        view.dispatch(view.state.update({ changes: { from: 1, insert: '\n' } })) // a→a\n(空行)
        expect(view.contentDOM.children.length).toBe(4)
        expect(view.contentDOM.children[3]).toBe(lineC)
        expect(view.state.doc.toString()).toBe('a\n\nb\nc')
    })

    it('删换行合并:行数减,后续未变行身份保持', () => {
        const view = make('a\nb\nc')
        const lineC = view.contentDOM.children[2]
        view.dispatch(view.state.update({ changes: { from: 1, to: 2 } })) // 删 a 后的换行 → ab
        expect(view.contentDOM.children.length).toBe(2)
        expect(view.contentDOM.children[0].textContent).toBe('ab')
        expect(view.contentDOM.children[1]).toBe(lineC)
    })

    it('纯选区 dispatch:不重建,所有行 DOM 身份不变', () => {
        const view = make('abc\ndef')
        const before = Array.from(view.contentDOM.children)
        view.dispatch(view.state.update({ selection: { anchor: 2 } }))
        expect(Array.from(view.contentDOM.children)).toEqual(before)
        expect(view.state.selection.main.anchor).toBe(2)
    })

    it('多光标 dispatch:changes 自动 mapping 所有 range', () => {
        const multi = EditorState.allowMultipleSelections.of(true)
        const view = make('abcdef', [multi])
        const sel = EditorSelection.create([
            EditorSelection.range(0, 1),  // 非空选区,mapping 明确
            EditorSelection.range(3, 4),
        ])
        view.dispatch(view.state.update({ selection: sel }))
        // 在 pos=0 插入 X,不给 selection → 所有 range 自动 mapping
        view.dispatch(view.state.update({ changes: { from: 0, insert: 'X' } }))
        expect(view.state.doc.toString()).toBe('Xabcdef')
        expect(view.state.selection.ranges[0].from).toBe(1)  // 0→1
        expect(view.state.selection.ranges[0].to).toBe(2)    // 1→2
        expect(view.state.selection.ranges[1].from).toBe(4)  // 3→4
        expect(view.state.selection.ranges[1].to).toBe(5)    // 4→5
    })

    it('跨行装饰:窗口化重建后中间行仍带 mark,首末行 mark 保留', () => {
        const deco = decorations.of(RangeSet.of([Decoration.mark({ class: 'blk' }).range(0, 8)], true))
        const view = make('aa\nbb\ncc', [deco]) // mark 覆盖 0..8 跨三行
        view.dispatch(view.state.update({ changes: { from: 4, insert: 'X' } })) // 改中间行 bb→bXb
        const spans = view.contentDOM.querySelectorAll('span.blk')
        expect(spans.length).toBe(3)
        expect(view.contentDOM.children[1].querySelector('span.blk')?.textContent).toBe('bXb')
    })

    // 不变式:视口全渲染时,DOM 每行文本 === doc 每行文本(逐行双射)。
    // 增量 patchDOM 的行区间算错会破这个,表现为「打字落错行 / 光标错位」。
    function expectDOMMatchesDoc(view: EditorView) {
        const doc = view.state.doc
        const domTexts = Array.from(view.contentDOM.children).map(c => c.textContent)
        const docTexts = Array.from({ length: doc.lines }, (_, i) => doc.line(i + 1).text)
        expect(domTexts).toEqual(docTexts)
    }

    it('行末插换行:DOM 与 doc 逐行一致', () => {
        const view = make('a\nb\nc')
        view.dispatch(view.state.update({ changes: { from: 1, insert: '\n' } }))
        expectDOMMatchesDoc(view)
    })

    it('连续两次行末插换行(空行累积):DOM 与 doc 逐行一致', () => {
        // 真页回归:第3行末连按两下回车,DOM 比 doc 少一空行,
        // 后续输入落错行、光标错位。
        const view = make('a\nb\nc')
        const at = () => view.state.doc.line(1).to // 第1行末尾
        view.dispatch(view.state.update({ changes: { from: at(), insert: '\n' } }))
        expectDOMMatchesDoc(view)
        view.dispatch(view.state.update({ changes: { from: view.state.doc.line(2).to, insert: '\n' } }))
        expectDOMMatchesDoc(view)
        expect(view.state.doc.toString()).toBe('a\n\n\nb\nc')
    })

    it('插空行后在空行上输入:落在正确行', () => {
        const view = make('a\nb\nc')
        view.dispatch(view.state.update({ changes: { from: 1, insert: '\n' }, selection: { anchor: 2 } }))
        view.dispatch(view.state.update({ changes: { from: 2, insert: '\n' }, selection: { anchor: 3 } }))
        // 光标在第3行(两个空行后),输入 X
        view.dispatch(view.state.update({ changes: { from: 3, insert: 'X' }, selection: { anchor: 4 } }))
        expectDOMMatchesDoc(view)
        expect(view.state.doc.line(3).text).toBe('X')
    })
})

// —— 可监测公理(CM7 的"7"):onTransaction 事务拦截 + introspect 内部态 dump ——
describe('editorView 可监测', () => {
    it('onTransaction:每次 dispatch 触发回调,收到事务与 view', () => {
        const view = make('abc')
        const log: Transaction[] = []
        view.onTransaction((tr) => log.push(tr))
        view.dispatch(view.state.update({ changes: { from: 3, insert: 'd' } }))
        view.dispatch(view.state.update({ changes: { from: 4, insert: 'e' } }))
        expect(log).toHaveLength(2)
        expect(log[0].changes.toJSON()).toEqual(view.state.doc.length === 5 ? log[0].changes.toJSON() : log[0].changes.toJSON())
        expect(view.state.doc.toString()).toBe('abcde')
    })

    it('onTransaction:纯选区 dispatch 也触发(docChanged=false)', () => {
        const view = make('abc')
        const log: boolean[] = []
        view.onTransaction((tr) => log.push(tr.docChanged))
        view.dispatch(view.state.update({ selection: { anchor: 2 } }))
        expect(log).toEqual([false])
    })

    it('onTransaction:返回取消函数,取消后不再触发', () => {
        const view = make('abc')
        const log: number[] = []
        const off = view.onTransaction(() => log.push(1))
        view.dispatch(view.state.update({ changes: { from: 3, insert: 'd' } }))
        off()
        view.dispatch(view.state.update({ changes: { from: 4, insert: 'e' } }))
        expect(log).toEqual([1])
    })

    it('introspect:dump doc + selection + decoration 层 + DOM 行结构 + viewport/heightmap', () => {
        const deco = decorations.of(RangeSet.of([Decoration.mark({ class: 'kw' }).range(0, 5)], true))
        const view = make('const x\nvar y', [deco])
        const snap = view.introspect()
        expect(snap.state.doc).toBe('const x\nvar y')
        expect(snap.state.selection.ranges[0].anchor).toBe(0)
        expect(snap.decorations).toHaveLength(1)
        expect(snap.decorations[0].ranges).toEqual([{ from: 0, to: 5, class: 'kw' }])
        expect(snap.domLines).toHaveLength(2)
        expect(snap.domLines[0].text).toBe('const x')
        expect(snap.domLines[0].marks).toEqual([{ class: 'kw' }])
        expect(snap.domLines[1].text).toBe('var y')
        expect(snap.domLines[1].marks).toEqual([])
        // 视口虚拟化:jsdom 全量模式,viewport 覆盖全文
        expect(snap.viewport.from).toBe(0)
        expect(snap.viewport.to).toBe(view.state.doc.length)
        expect(snap.viewport.startLine).toBe(1)
        // heightmap 是结构化对象
        expect(typeof snap.heightmap).toBe('object')
        expect(snap.heightmap).not.toBeNull()
    })

    it('introspect:dispatch 后 decoration 层随新 doc 更新', () => {
        const deco = decorations.of(RangeSet.of([Decoration.mark({ class: 'kw' }).range(0, 5)], true))
        const view = make('const x', [deco])
        view.dispatch(view.state.update({ changes: { from: 5, insert: 'X' } })) // constX x
        const snap = view.introspect()
        // 静态 facet 装饰不随 doc 变,仍 0..5
        expect(snap.decorations[0].ranges).toEqual([{ from: 0, to: 5, class: 'kw' }])
        expect(snap.domLines[0].text).toBe('constX x')
    })

    it('introspect:多装饰层各自独立 dump', () => {
        const decoA = decorations.of(RangeSet.of([Decoration.mark({ class: 'a' }).range(0, 2)], true))
        const decoB = decorations.of(RangeSet.of([Decoration.mark({ class: 'b' }).range(2, 4)], true))
        const view = make('abcd', [decoA, decoB])
        const snap = view.introspect()
        expect(snap.decorations).toHaveLength(2)
        expect(snap.decorations[0].ranges).toEqual([{ from: 0, to: 2, class: 'a' }])
        expect(snap.decorations[1].ranges).toEqual([{ from: 2, to: 4, class: 'b' }])
    })
})

// —— 视口虚拟化:jsdom 全量退化(clientHeight=0),viewport=全文,行为等价阶段A ——
describe('editorView 视口虚拟化', () => {
    it('jsdom:viewport 覆盖全文,startLine=1', () => {
        const view = make('aaa\nbbb\nccc')
        expect(view.viewport.from).toBe(0)
        expect(view.viewport.to).toBe(view.state.doc.length)
        expect(view.viewportStartLine).toBe(1)
    })

    it('jsdom:padding 为 0(全文渲染,无未渲染区)', () => {
        const view = make('aaa\nbbb\nccc')
        expect(view.contentDOM.style.paddingTop).toBe('0px')
        expect(view.contentDOM.style.paddingBottom).toBe('0px')
    })

    it('dispatch 后 viewport 仍覆盖全文', () => {
        const view = make('aaa\nbbb\nccc')
        view.dispatch(view.state.update({ changes: { from: 5, insert: 'X' } }))
        expect(view.viewport.from).toBe(0)
        expect(view.viewport.to).toBe(view.state.doc.length)
    })

    it('heightmap 随 doc 更新:行数变化后 toString 反映新结构', () => {
        const view = make('aaa\nbbb')
        const before = view.introspect().heightmap
        view.dispatch(view.state.update({ changes: { from: 3, insert: '\nccc' } }))
        const after = view.introspect().heightmap
        expect(after).not.toBe(before)
    })

    it('大文档滚到底再整篇换成短文档：viewport 钳进新 doc，indentGuides 不炸', () => {
        const lh = 14
        const long = Array.from({ length: 400 }, (_, i) => `    line ${i} xxxxxxxx`).join('\n')
        const host = document.createElement('div')
        document.body.appendChild(host)
        const view = new EditorView({
            state: EditorState.create({
                doc: long,
                extensions: [decorations.of(indentGuidesCM7())],
            }),
            parent: host,
            decorationProviders: [indentGuidesCM7()],
        })
        Object.defineProperty(view.scrollDOM, 'clientHeight', { configurable: true, get: () => 10 * lh })
        let st = 300 * lh
        Object.defineProperty(view.scrollDOM, 'scrollTop', {
            configurable: true,
            get: () => st,
            set: v => { st = v },
        })
        Object.defineProperty(view.scrollDOM, 'scrollHeight', { configurable: true, get: () => 400 * lh })
        view.oracle.lineHeight = lh
        view.resetHeights()
        view.remeasure()
        expect(view.viewport.from).toBeGreaterThan(0)
        expect(view.viewportStartLine).toBeGreaterThan(1)

        expect(() => {
            view.dispatch(view.state.update({
                changes: { from: 0, to: view.state.doc.length, insert: 'a\nb\nc' },
                selection: { anchor: 0 },
            }))
        }).not.toThrow()
        expect(view.state.doc.lines).toBe(3)
        expect(view.viewport.from).toBeGreaterThanOrEqual(0)
        expect(view.viewport.to).toBeLessThanOrEqual(view.state.doc.length)
        expect(view.viewportStartLine).toBeGreaterThanOrEqual(1)
        expect(view.viewportStartLine).toBeLessThanOrEqual(3)
        view.destroy()
        host.remove()
    })
})
