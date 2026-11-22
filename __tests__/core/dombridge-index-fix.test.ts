// 第六轮 V 组:拖选大范围时选区层每个视觉行调一次 caretCoords → domAtPos,而 domAtPos 每次从视口第一行
// 逐行数到目标行(每行再走一遍子节点求 doc 长)→ 一帧 O(行数²)。浏览器实测 2 万行拖选自动滚:mousemove
// 170–250ms、10fps,剖面里 domLineDocLen 占 70%(/tmp/lc-hunt/r6/V/drag.ts)。
// 修后:dombridge 给每个 contentDOM 记一张「第 i 个子 → 起始 doc 位置」表,doc / 视口首行 / DOM 变了才重建
// (MutationObserver.takeRecords 同步查脏),domAtPos / posFromDOM 二分定位到行。
import { describe, expect, it } from 'vitest'
import { buildTileTree } from '../../src/core/view/buildtile'
import { domAtPos, posFromDOM } from '../../src/core/view/dombridge'
import { materialize } from '../../src/core/view/materialize'
import { Decoration } from '../../src/core/model/decoration'
import { RangeSet } from '../../src/core/model/rangeset'
import { Rope } from '../../src/core/model/rope'
import type { DecorationSet } from '../../src/core/model/decoration'

const doc = (s: string) => Rope.of(s.split('\n'))
const LINES = 300
const TEXT = Array.from({ length: LINES }, (_, i) => `const v${i} = ${i} // line ${i}`).join('\n')
const marks = (d: Rope) => [RangeSet.of(Array.from({ length: d.lines }, (_, i) => Decoration.mark({ class: 'kw' }).range(d.line(i + 1).from, d.line(i + 1).from + 5)), true) as DecorationSet]

describe('dombridge 行索引:domAtPos / posFromDOM 不再按行数线性', () => {
    it(`${LINES} 行逐行 domAtPos + posFromDOM 往返:结果不变,总耗时 < 150ms(修前 O(n²),jsdom 里约 4s)`, () => {
        const d = doc(TEXT)
        const dom = materialize(buildTileTree(d, marks(d)))
        // 取 5 次里最快的一次:机器被别的任务占满时单次会被抢占拉长,但 O(n²) 回退是每一次都慢(约 4s),最小值抓得住回退、不被抢占误报
        let best = Infinity
        for (let round = 0; round < 5; round++) {
            const t0 = performance.now()
            for (let n = 1; n <= LINES; n++) {
                const line = d.line(n)
                for (const pos of [line.from, line.from + 7, line.to]) {
                    const { node, offset } = domAtPos(dom, d, pos)
                    expect(posFromDOM(dom, d, node, offset)).toBe(pos)
                }
            }
            best = Math.min(best, performance.now() - t0)
        }
        expect(best).toBeLessThan(150)
    })

    it('DOM 改了 doc 没变(输入法 / 浏览器原生输入先改 DOM):不吃旧表', () => {
        const d = doc('aa\nbb\ncc')
        const dom = materialize(buildTileTree(d, []))
        expect(posFromDOM(dom, d, dom.children[2].firstChild!, 1)).toBe(7)
        // 浏览器往第 1 行插了一个字,state 还没更新:第 3 行的 DOM 起点按新 DOM 算(与无缓存时同一走法)
        ;(dom.children[0].firstChild as Text).data = 'aXa'
        expect(posFromDOM(dom, d, dom.children[2].firstChild!, 1)).toBe(8)
        // 删一行 DOM
        dom.children[1].remove()
        expect(posFromDOM(dom, d, dom.children[1].firstChild!, 0)).toBe(4)
        expect(domAtPos(dom, d, 4)).toEqual({ node: dom.children[1].firstChild, offset: 0 })
    })

    it('行按元素缓存 doc 长:换掉行元素 / 改行内子节点后按新 DOM 算', () => {
        const d = doc('aa\nbb\ncc')
        const dom = materialize(buildTileTree(d, []))
        expect(posFromDOM(dom, d, dom.children[2].firstChild!, 0)).toBe(6)
        const line = dom.children[0].cloneNode() as HTMLElement
        line.textContent = 'aaaa'
        dom.children[0].replaceWith(line)
        expect(posFromDOM(dom, d, dom.children[2].firstChild!, 0)).toBe(8)
        dom.children[1].replaceChildren(document.createTextNode('b'))
        expect(posFromDOM(dom, d, dom.children[2].firstChild!, 0)).toBe(7)
    })

    it('换文档 / 换视口首行:重建索引', () => {
        const d1 = doc('aa\nbb\ncc')
        const dom = materialize(buildTileTree(d1, []))
        expect(domAtPos(dom, d1, 3)).toEqual({ node: dom.children[1].firstChild, offset: 0 })
        // 同一份 DOM 当成 2..4 行的窗口(视口首行 = 2)
        const d2 = doc('zzzz\naa\nbb\ncc')
        expect(domAtPos(dom, d2, 8, 2)).toEqual({ node: dom.children[1].firstChild, offset: 0 })
        expect(posFromDOM(dom, d2, dom.children[2].firstChild!, 2, 2)).toBe(13)
        // 视口首行 = 1:DOM 三行盖 [0,8],12 在视口后 → 贴到最后一个渲染行行尾
        expect(domAtPos(dom, d2, 12, 1)).toEqual({ node: dom.children[2].firstChild, offset: 2 })
        expect(domAtPos(dom, d2, 4, 1)).toEqual({ node: dom.children[1].firstChild, offset: 1 })
    })
})
