import type { DecorationSet } from '../../src/core/model/decoration'
import { describe, expect, it } from 'vitest'
import { buildTileTree } from '../../src/core/view/buildtile'
import { Decoration, WidgetType } from '../../src/core/model/decoration'
import { materialize } from '../../src/core/view/materialize'
import { RangeSet } from '../../src/core/model/rangeset'
import { Rope } from '../../src/core/model/rope'
import { EditorState } from '../../src/core/model/state'
import { decorations, EditorView } from '../../src/core/view/editorview'

// CM7 materialize —— tile 树 → 真 contenteditable DOM。阶段4 第一刀:把 DOM-free 的 spec 物化成
// 浏览器节点。确定性结构(非 IME 沼泽),故走 jsdom outerHTML 快照钉死,保持 teact 红→绿节律。
//
// 与 buildtile 的分工:buildtile 决定「渲染成什么」(纯), materialize 决定「DOM 长什么样」。
// 砍增量复用(TileCache/sync/track)——全量重建,阶段4 后续优化再港。

const doc = (s: string) => Rope.of(s.split('\n'))

function dom(text: string, decos: readonly DecorationSet[] = []) {
    return materialize(buildTileTree(doc(text), decos)).outerHTML
}

describe('materialize', () => {
    it('单行纯文本 → cm-content 含单个 cm-line', () => {
        expect(dom('hello')).toBe('<div class="cm-content" contenteditable="true"><div class="cm-line">hello</div></div>')
    })

    it('多行 → 每行一个 cm-line', () => {
        expect(dom('a\nb\nc')).toBe('<div class="cm-content" contenteditable="true"><div class="cm-line">a</div><div class="cm-line">b</div><div class="cm-line">c</div></div>')
    })

    it('空行 → cm-line 内含 <br> 编辑锚点', () => {
        expect(dom('a\n\nb')).toBe('<div class="cm-content" contenteditable="true"><div class="cm-line">a</div><div class="cm-line"><br></div><div class="cm-line">b</div></div>')
    })

    it('mark 装饰 → 嵌套 span', () => {
        const decos = RangeSet.of([Decoration.mark({ class: 'tok-kw' }).range(0, 5)], true)
        expect(dom('const x', [decos as DecorationSet])).toBe('<div class="cm-content" contenteditable="true"><div class="cm-line"><span class="tok-kw">const</span> x</div></div>')
    })

    it('mark tagName 自定义 → 对应标签', () => {
        const decos = RangeSet.of([Decoration.mark({ tagName: 'strong', class: 'b' }).range(0, 2)], true)
        expect(dom('hi there', [decos as DecorationSet])).toBe('<div class="cm-content" contenteditable="true"><div class="cm-line"><strong class="b">hi</strong> there</div></div>')
    })

    it('换行切开 mark → 两行各一段 span', () => {
        const decos = RangeSet.of([Decoration.mark({ class: 'm' }).range(0, 3)], true)
        expect(dom('a\nb', [decos as DecorationSet])).toBe('<div class="cm-content" contenteditable="true"><div class="cm-line"><span class="m">a</span></div><div class="cm-line"><span class="m">b</span></div></div>')
    })

    it('line 装饰 → cm-line 加 class', () => {
        const decos = RangeSet.of([Decoration.line({ class: 'active' }).range(0)], true)
        expect(dom('x\ny', [decos as DecorationSet])).toBe('<div class="cm-content" contenteditable="true"><div class="cm-line active">x</div><div class="cm-line">y</div></div>')
    })

    it('嵌套 mark(高优先内层)→ span 套 span', () => {
        const inner = RangeSet.of([Decoration.mark({ class: 'i' }).range(1, 3)], true)
        const outer = RangeSet.of([Decoration.mark({ class: 'o' }).range(0, 4)], true)
        // sets 数组靠前=高优先=内层
        expect(dom('abcde', [inner as DecorationSet, outer as DecorationSet])).toBe('<div class="cm-content" contenteditable="true"><div class="cm-line"><span class="o">a<span class="i">bc</span>d</span>e</div></div>')
    })

    it('三层嵌套 mark 由内到外套 span', () => {
        const c = RangeSet.of([Decoration.mark({ class: 'c' }).range(2, 3)], true)
        const b = RangeSet.of([Decoration.mark({ class: 'b' }).range(1, 4)], true)
        const a = RangeSet.of([Decoration.mark({ class: 'a' }).range(0, 5)], true)
        expect(dom('abcde', [c as DecorationSet, b as DecorationSet, a as DecorationSet])).toBe(
            '<div class="cm-content" contenteditable="true"><div class="cm-line"><span class="a">a<span class="b">b<span class="c">c</span>d</span>e</span></div></div>',
        )
    })

    it('交错 mark 在重叠处套、两侧各一层', () => {
        const left = RangeSet.of([Decoration.mark({ class: 'L' }).range(0, 3)], true)
        const right = RangeSet.of([Decoration.mark({ class: 'R' }).range(2, 5)], true)
        expect(dom('abcde', [right as DecorationSet, left as DecorationSet])).toBe(
            '<div class="cm-content" contenteditable="true"><div class="cm-line"><span class="L">ab<span class="R">c</span></span><span class="R">de</span></div></div>',
        )
    })

    it('mount(parent) 把 content 挂进宿主并返回 content', () => {
        const host = document.createElement('div')
        const content = materialize(buildTileTree(doc('hi'), []))
        host.appendChild(content)
        expect(host.querySelector('.cm-content')?.textContent).toBe('hi')
    })
})

class BlockW extends WidgetType {
    constructor(readonly label: string) { super() }
    eq(other: WidgetType) { return other instanceof BlockW && other.label === this.label }
    get estimatedHeight() { return 40 }
    toDOM() {
        const el = document.createElement('div')
        el.className = 'qa-block'
        el.textContent = this.label
        return el
    }
}

describe('block widget 物化', () => {
    it('block widget 画出 toDOM，不炸', () => {
        const decos = RangeSet.of([
            Decoration.widget({ widget: new BlockW('W'), block: true }).range(0),
        ], true)
        const root = materialize(buildTileTree(doc('a\nb'), [decos as DecorationSet]))
        const w = root.querySelector('.qa-block') as HTMLElement
        expect(w).not.toBeNull()
        expect(w.textContent).toBe('W')
        expect(w.getAttribute('data-cm-widget')).toBe('0')
        expect(w.contentEditable).toBe('false')
    })

    it('block replace 占隐藏区间长度', () => {
        const decos = RangeSet.of([
            Decoration.replace({ widget: new BlockW('HID'), block: true }).range(0, 2),
        ], true)
        const root = materialize(buildTileTree(doc('a\nb'), [decos as DecorationSet]))
        const w = root.querySelector('.qa-block') as HTMLElement
        expect(w.textContent).toBe('HID')
        expect(w.getAttribute('data-cm-widget')).toBe('2')
    })

    it('EditorView 挂 block widget 不炸，DOM 里看得到', () => {
        const host = document.createElement('div')
        document.body.appendChild(host)
        const view = new EditorView({
            state: EditorState.create({
                doc: 'a\nb',
                extensions: [
                    decorations.of(RangeSet.of([
                        Decoration.widget({ widget: new BlockW('V'), block: true }).range(0),
                    ], true)),
                ],
            }),
            parent: host,
        })
        expect(view.contentDOM.querySelector('.qa-block')?.textContent).toBe('V')
        view.dispatch(view.state.update({ changes: { from: 1, insert: 'X' } }))
        expect(view.state.doc.toString()).toBe('aX\nb')
        expect(view.contentDOM.querySelector('.qa-block')?.textContent).toBe('V')
        view.destroy()
        host.remove()
    })
})
