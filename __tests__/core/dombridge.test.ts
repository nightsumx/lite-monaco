import type { DecorationSet } from '../../src/core/model/decoration'
import { describe, expect, it } from 'vitest'
import { buildTileTree } from '../../src/core/view/buildtile'
import { Decoration, WidgetType } from '../../src/core/model/decoration'
import { domAtPos, lineElAt, posFromDOM } from '../../src/core/view/dombridge'
import { materialize } from '../../src/core/view/materialize'
import { RangeSet } from '../../src/core/model/rangeset'
import { Rope } from '../../src/core/model/rope'

// CM7 DOM↔pos 桥 —— 阶段3 地基。核心律 = 双射:对每个 doc 位置,domAtPos 产的 (node,offset) 经
// posFromDOM 必还原回该位置。这是可监测公理(可读写的内部表示往返不丢信息)的桥版本。
// 确定性结构(非 IME 沼泽),走 jsdom 真节点 + 往返断言,无快照。

const doc = (s: string) => Rope.of(s.split('\n'))
const content = (s: string, decos: readonly DecorationSet[] = []) =>
    materialize(buildTileTree(doc(s), decos))

class BlockW extends WidgetType {
    constructor(readonly label: string) { super() }
    eq(other: WidgetType) { return other instanceof BlockW && other.label === this.label }
    toDOM() {
        const el = document.createElement('div')
        el.className = 'qa-block'
        if (this.label) el.textContent = this.label
        return el
    }
}

describe('dombridge 双射律:posFromDOM(domAtPos(pos)) === pos', () => {
    const cases: Array<[string, string, readonly DecorationSet[]]> = [
        ['单行纯文本', 'hello', []],
        ['多行', 'a\nbb\nccc', []],
        ['空行夹中间', 'a\n\nb', []],
        ['带 mark span', 'const x', [RangeSet.of([Decoration.mark({ class: 'kw' }).range(0, 5)], true) as DecorationSet]],
        ['嵌套 mark', 'abcde', [
            RangeSet.of([Decoration.mark({ class: 'i' }).range(1, 3)], true) as DecorationSet,
            RangeSet.of([Decoration.mark({ class: 'o' }).range(0, 4)], true) as DecorationSet,
        ]],
        ['行首 block widget', 'a\nb', [
            RangeSet.of([Decoration.widget({ widget: new BlockW(''), block: true }).range(0)], true) as DecorationSet,
        ]],
    ]
    for (const [name, text, decos] of cases) {
        it(name, () => {
            const d = doc(text)
            const dom = content(text, decos)
            for (let pos = 0; pos <= d.length; pos++) {
                const { node, offset } = domAtPos(dom, d, pos)
                expect(posFromDOM(dom, d, node, offset)).toBe(pos)
            }
        })
    }
})

describe('lineElAt', () => {
    it('文本节点 → 所在行 div + 下标', () => {
        const dom = content('a\nb\nc')
        const textNode = dom.children[1].firstChild! // 'b' 行的文本
        expect(lineElAt(dom, textNode)).toEqual({ el: dom.children[1], index: 1 })
    })

    it('span 内文本 → 仍归到行 div', () => {
        const decos = [RangeSet.of([Decoration.mark({ class: 'm' }).range(0, 2)], true) as DecorationSet]
        const dom = content('hi there', decos)
        const inSpan = dom.querySelector('.m')!.firstChild!
        expect(lineElAt(dom, inSpan)).toEqual({ el: dom.children[0], index: 0 })
    })

    it('不在内容内 → null', () => {
        const dom = content('x')
        const outside = document.createElement('div')
        expect(lineElAt(dom, outside)).toBeNull()
    })
})

describe('posFromDOM 边界', () => {
    it('node === contentDOM,offset 当行号', () => {
        const d = doc('a\nbb\nccc')
        const dom = content('a\nbb\nccc')
        expect(posFromDOM(dom, d, dom, 0)).toBe(d.line(1).from)
        expect(posFromDOM(dom, d, dom, 2)).toBe(d.line(3).from)
    })

    it('行尾位置', () => {
        const d = doc('hello')
        const dom = content('hello')
        const t = dom.children[0].firstChild!
        expect(posFromDOM(dom, d, t, 5)).toBe(5)
    })

    // 真页回归:contenteditable 往空行输入时,原生选区落在行 <div> 自身(offset 0),
    // 不是文本节点。posFromDOM 必须还原为该行开头;曾误退回「整行文本长」→ 输入落错行。
    it('选区落在空行 div 自身(offset 0)→ 行开头', () => {
        const d = doc('a\n\nb')
        const dom = content('a\n\nb')
        const emptyLine = dom.children[1] as HTMLElement
        expect(posFromDOM(dom, d, emptyLine, 0)).toBe(d.line(2).from)
    })

    it('选区落在非空行 div 自身:offset 0 → 行开头,offset=子节点数 → 行末', () => {
        const d = doc('abc\ndef')
        const dom = content('abc\ndef')
        const line1 = dom.children[1] as HTMLElement
        expect(posFromDOM(dom, d, line1, 0)).toBe(d.line(2).from)
        expect(posFromDOM(dom, d, line1, line1.childNodes.length)).toBe(d.line(2).to)
    })
})

describe('domAtPos 空行', () => {
    it('空行 → 行 div 自身 offset 0', () => {
        const d = doc('a\n\nb')
        const dom = content('a\n\nb')
        const emptyLineFrom = d.line(2).from
        const { node, offset } = domAtPos(dom, d, emptyLineFrom)
        expect(node).toBe(dom.children[1])
        expect(offset).toBe(0)
    })
})

// —— 视口虚拟化:窗口映射下双射律 ——
// contentDOM 只持有视口内行,viewportStartLine 偏移子→行号换算。
describe('dombridge 窗口映射:viewportStartLine > 1', () => {
    // doc = 'a\nbb\nccc\ndddd\neeeee' (5 行)
    // 视口只渲染行 3..5(下标 0..2),viewportStartLine=3
    function windowedContent() {
        const d = doc('a\nbb\nccc\ndddd\neeeee')
        const dom = document.createElement('div')
        dom.className = 'cm-content'
        // 只物化行 3..5
        const tree = buildTileTree(d, [], d.line(3).from, d.line(5).to)
        for (const child of Array.from(materialize(tree).childNodes))
            dom.appendChild(child)
        return { d, dom }
    }

    it('视口内位置:双射律成立', () => {
        const { d, dom } = windowedContent()
        const vsl = 3
        // 行 3 的 [0..3), 行 4 的 [0..4), 行 5 的 [0..5)
        for (let pos = d.line(3).from; pos <= d.line(5).to; pos++) {
            const { node, offset } = domAtPos(dom, d, pos, vsl)
            expect(posFromDOM(dom, d, node, offset, vsl)).toBe(pos)
        }
    })

    it('视口外位置:domAtPos 落到 contentDOM offset 0', () => {
        const { d, dom } = windowedContent()
        // 行 1 的位置(视口前)
        const { node, offset } = domAtPos(dom, d, d.line(1).from, 3)
        expect(node).toBe(dom)
        expect(offset).toBe(0)
    })

    it('node===contentDOM:offset 映射到视口内行', () => {
        const { d, dom } = windowedContent()
        // offset 0 → 视口第一行 = 行 3
        expect(posFromDOM(dom, d, dom, 0, 3)).toBe(d.line(3).from)
        // offset 2 → 视口第三行 = 行 5
        expect(posFromDOM(dom, d, dom, 2, 3)).toBe(d.line(5).from)
    })
})
