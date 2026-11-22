// 虚拟化视口下的输入 —— 真页「大文档随便回车都出 bug、状态不更新」的单测复现。
//
// 根因:patchDOM 删除边界曾用「视口子节点数 - 全文档尾行数」两坐标系相减,大文档时 removeEnd 变负,
// 删除循环不跑 → 脏 .cm-line 残留、DOM≡doc 双射断裂。现有测试全跑 jsdom 退化模式(clientHeight=0,
// 视口=全文,startLine 恒为 1),从不触发虚拟化路径,故 bug 逃逸。这里用 makeScrolled 桩几何强制
// viewportStartLine>1、children 只覆盖窗口,走真正的增量 patch,断言 expectDOMMatchesViewport。

import { describe, it, expect } from 'vitest'
import { EditorView } from '../../src/core/view/editorview'
import { EditorState } from '../../src/core/model/state'
import {
    makeScrolled, pressEnter, pressBackspaceLineStart, pasteMultiline, setCaret,
    expectDOMMatchesViewport,
} from './input-harness'

// 200 行、每行有内容的文档;makeScrolled 后视口只渲染中段一片。
const bigDoc = () => Array.from({ length: 200 }, (_, i) => `const v${i + 1} = compute(${i + 1})`).join('\n')

// 视口内某行的 doc 位置(行首)。startLine..endLine 是渲染窗口。
function lineStart(view: ReturnType<typeof makeScrolled>, lineNo: number) {
    return view.state.doc.line(lineNo).from
}

describe('虚拟化视口输入:DOM≡doc 双射(真页大文档 bug 回归)', () => {
    it('G1 视口内回车(B1):行数 +1,视口逐行双射不破', () => {
        const view = makeScrolled(bigDoc(), { clientHeight: 200, scrollTop: 400, lineHeight: 14 })
        const startLine = view.viewportStartLine
        expect(startLine).toBeGreaterThan(1) // 确认真在虚拟化
        expectDOMMatchesViewport(view)

        const target = startLine + 3 // 视口内一行
        const pos = lineStart(view, target)
        setCaret(view, pos)
        pressEnter(view, pos)

        expect(view.state.doc.lines).toBe(201)
        expectDOMMatchesViewport(view)
    })

    it('G2 视口内连按 3 次回车(B1,L11 实况):每次后双射不破,无脏行', () => {
        const view = makeScrolled(bigDoc(), { clientHeight: 200, scrollTop: 400, lineHeight: 14 })
        const startLine = view.viewportStartLine
        expect(startLine).toBeGreaterThan(1)

        let pos = lineStart(view, startLine + 3)
        for (let i = 0; i < 3; i++) {
            setCaret(view, pos)
            pressEnter(view, pos)
            expectDOMMatchesViewport(view) // 每次后视口逐行 DOM==doc
            pos = pos + 1 // 光标随空行下移
        }
        expect(view.state.doc.lines).toBe(203)
    })

    it('G3 视口内行首退格合并(A-1,B1):行数 -1,双射不破', () => {
        const view = makeScrolled(bigDoc(), { clientHeight: 200, scrollTop: 400, lineHeight: 14 })
        const startLine = view.viewportStartLine
        expect(startLine).toBeGreaterThan(1)

        const target = startLine + 4
        pressBackspaceLineStart(view, target) // 把 target 行并入上一行
        expect(view.state.doc.lines).toBe(199)
        expectDOMMatchesViewport(view)
    })

    it('G4 视口内粘贴多行(A+N,B1):行数重算,双射不破', () => {
        const view = makeScrolled(bigDoc(), { clientHeight: 200, scrollTop: 400, lineHeight: 14 })
        const startLine = view.viewportStartLine
        expect(startLine).toBeGreaterThan(1)

        const pos = lineStart(view, startLine + 2)
        setCaret(view, pos)
        pasteMultiline(view, pos, 'X1\nX2\nX3') // 插 2 个换行 → +2 行
        expect(view.state.doc.lines).toBe(202)
        expectDOMMatchesViewport(view)
    })

    it('G5 视口上方编辑(B2):不碰视口 children,startLine 随之下移,doc 正确', () => {
        const view = makeScrolled(bigDoc(), { clientHeight: 200, scrollTop: 400, lineHeight: 14 })
        const startLine = view.viewportStartLine
        expect(startLine).toBeGreaterThan(2)
        const beforeChildCount = view.contentDOM.children.length

        // 在视口上方第 1 行末插换行(程序 dispatch,变更完全在视口外)。
        view.dispatch(view.state.update({ changes: { from: view.state.doc.line(1).to, insert: '\n' } }))

        expect(view.state.doc.lines).toBe(201)
        // 视口外编辑:children 数不变(未重物化),startLine 因上方多一行而 +1。
        expect(view.contentDOM.children.length).toBe(beforeChildCount)
        expect(view.viewportStartLine).toBe(startLine + 1)
        expectDOMMatchesViewport(view)
    })

    it('滚动换窗复用重叠 .cm-line（对标 Monaco ViewLines）', () => {
        const view = makeScrolled(bigDoc(), { clientHeight: 200, scrollTop: 400, lineHeight: 14 })
        const start = view.viewportStartLine
        expect(start).toBeGreaterThan(1)
        const count = view.contentDOM.childElementCount
        expect(count).toBeGreaterThan(5)
        const byLine = new Map<number, Element>()
        for (let i = 0; i < count; i++) byLine.set(start + i, view.contentDOM.children[i])

        view.scrollDOM.scrollTop = 400 + 8 * 14
        view.remeasure()

        const next = view.viewportStartLine
        expect(next).not.toBe(start)
        if (next >= start && next < start + count)
            expect(view.contentDOM.children[0]).toBe(byLine.get(next))
        else {
            const end = next + view.contentDOM.childElementCount
            const keep = [...byLine.keys()].find(n => n >= next && n < end)
            expect(keep).toBeDefined()
            expect(view.contentDOM.children[keep! - next]).toBe(byLine.get(keep!))
        }
        expectDOMMatchesViewport(view)
    })

    it('同行插入不重建 gutter 节点', () => {
        const host = document.createElement('div')
        document.body.appendChild(host)
        const view = new EditorView({
            state: EditorState.create({
                doc: Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n'),
            }),
            parent: host,
            lineNumbers: true,
        })
        const g0 = view.dom.querySelector('.cm-gutterElement')
        expect(g0).toBeTruthy()
        view.dispatch(view.state.update({ changes: { from: 0, insert: 'x' } }))
        expect(view.dom.querySelector('.cm-gutterElement')).toBe(g0)
        view.destroy()
        host.remove()
    })
})
