// scrollIntoView 消费契约 —— 钉死「光标移出视口编辑器不跟随」这个基础缺口。
//
// commands/autocomplete/closebrackets 里 ~20 处 state.update({ scrollIntoView:true }),但 view.update()
// 曾从不消费该 flag → 方向键下翻/末行输入/搜索跳转后光标出视口、编辑器纹丝不动(Monaco/任何编辑器都自动跟随)。
// 修复:update() 末尾 tr.scrollIntoView → scrollPosIntoView(main.head),heightMap 查行像素区间,与 scrollTop
// /clientHeight 比,出视口才滚,已在内绝不滚(防每次 selection 更新微滚抖动)。
//
// 钉法:makeScrolled 注入 clientHeight/scrollTop/行高(jsdom 无布局),dispatch 带 scrollIntoView 的 selection
// 更新,断言 scrollDOM.scrollTop 的变化(跟随/不动)。lineHeight=14,故行 n(从 0)顶像素 = n×14。

import { describe, it, expect } from 'vitest'
import { EditorSelection } from '../../src/core/model/selection'
import { EditorState } from '../../src/core/model/state'
import { EditorView } from '../../src/core/view/editorview'
import { foldCode, foldDecorations, foldField } from '../../src/core/edit/fold'
import { makeScrolled } from './input-harness'

// 40 行文档,视口高 140px(=10 行),从顶开始。
const doc40 = Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n')
const LH = 14

describe('scrollPosIntoView:消费 tr.scrollIntoView', () => {
    it('光标在视口下方外 → scrollTop 增到该行底可见', () => {
        const view = makeScrolled(doc40, { clientHeight: 10 * LH, scrollTop: 0, lineHeight: LH })
        // 第 30 行(0-based 29,顶=29×14=406,底=420),视口 [0,140) → 在下方外。
        const pos = view.state.doc.line(30).from
        view.dispatch(view.state.update({ selection: EditorSelection.single(pos), scrollIntoView: true }))
        // 底对齐:scrollTop = bottom - clientHeight = 420 - 140 = 280
        expect(view.scrollDOM.scrollTop).toBe(30 * LH - 10 * LH)
    })

    it('光标在视口上方外 → scrollTop 减到该行顶可见', () => {
        const view = makeScrolled(doc40, { clientHeight: 10 * LH, scrollTop: 300, lineHeight: LH })
        // 第 3 行(0-based 2,顶=28),视口 [300,440) → 在上方外。
        const pos = view.state.doc.line(3).from
        view.dispatch(view.state.update({ selection: EditorSelection.single(pos), scrollIntoView: true }))
        // 顶对齐:scrollTop = top = 2×14 = 28
        expect(view.scrollDOM.scrollTop).toBe(2 * LH)
    })

    it('光标已在视口内 → scrollTop 不变(防抖:绝不无谓滚动)', () => {
        const view = makeScrolled(doc40, { clientHeight: 10 * LH, scrollTop: 70, lineHeight: LH })
        // 视口 [70,210) 覆盖第 6~15 行;把光标放第 8 行(0-based 7,顶=98,底=112)——完全在视口内。
        const pos = view.state.doc.line(8).from
        view.dispatch(view.state.update({ selection: EditorSelection.single(pos), scrollIntoView: true }))
        expect(view.scrollDOM.scrollTop).toBe(70)
    })

    it('scrollIntoView 未置位 → 绝不滚(即使光标出视口)', () => {
        const view = makeScrolled(doc40, { clientHeight: 10 * LH, scrollTop: 0, lineHeight: LH })
        const pos = view.state.doc.line(35).from // 远在视口下方外
        view.dispatch(view.state.update({ selection: EditorSelection.single(pos) })) // 无 scrollIntoView
        expect(view.scrollDOM.scrollTop).toBe(0)
    })

    it('末行输入(doc 追加 + scrollIntoView)→ 滚到底部露出新行', () => {
        const view = makeScrolled(doc40, { clientHeight: 10 * LH, scrollTop: 0, lineHeight: LH })
        const end = view.state.doc.length
        view.dispatch(view.state.update({
            changes: { from: end, insert: '\nnew tail' },
            selection: EditorSelection.single(end + 9), // 落在新末行
            scrollIntoView: true,
        }))
        // 新末行是第 41 行(0-based 40,底=41×14=574),视口高 140 → scrollTop = 574 - 140 = 434
        expect(view.scrollDOM.scrollTop).toBe(41 * LH - 10 * LH)
    })

    it('折叠后 height 变矮，scrollIntoView 末行不到未折那么远', () => {
        const body = Array.from({ length: 30 }, () => '  x').join('\n')
        const doc = `function f() {\n${body}\n}\ntail`
        const open = makeScrolled(doc, { clientHeight: 10 * LH, scrollTop: 0, lineHeight: LH })
        const tail = open.state.doc.line(open.state.doc.lines).from
        open.dispatch(open.state.update({
            selection: EditorSelection.single(tail),
            scrollIntoView: true,
        }))
        const far = open.scrollDOM.scrollTop
        expect(far).toBeGreaterThan(10 * LH)
        open.destroy()

        const host = document.createElement('div')
        document.body.appendChild(host)
        const view = new EditorView({
            state: EditorState.create({ doc, extensions: [foldField] }),
            parent: host,
            decorationProviders: [foldDecorations],
        })
        let scrollTop = 0
        Object.defineProperty(view.scrollDOM, 'clientHeight', { configurable: true, get: () => 10 * LH })
        Object.defineProperty(view.scrollDOM, 'scrollTop', {
            configurable: true,
            get: () => scrollTop,
            set: v => { scrollTop = v },
        })
        view.oracle.lineHeight = LH
        view.resetHeights()
        expect(foldCode({ state: view.state, dispatch: tr => view.dispatch(tr) })).toBe(true)
        expect(view.heightMap.height).toBeLessThan(10 * LH)
        view.dispatch(view.state.update({
            selection: EditorSelection.single(view.state.doc.line(view.state.doc.lines).from),
            scrollIntoView: true,
        }))
        expect(scrollTop).toBeLessThan(far)
        view.destroy()
        host.remove()
    })
})
