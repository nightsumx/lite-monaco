// 未聚焦不抢焦点 —— 宿主(Filo)在用户往聊天框打字时合并外部文件改动,编辑器不能把原生选区/焦点拿走。
// 对齐 Monaco:没焦点的编辑器 setValue / executeEdits 后焦点不动、document 选区不进编辑器。
// jsdom 不会因写选区自动聚焦 contenteditable,所以判据是「document 选区没进 contentDOM」(真 Chrome
// 里写进去就会聚焦)。浏览器里的同款验证见 /tmp/lc-hunt/r3/fix-V/focus.ts。

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { browser } from '../../src/core/browser'
import { EditorView } from '../../src/core/view/editorview'
import { EditorState } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'

let chrome: boolean
beforeEach(() => { chrome = browser.chrome; browser.chrome = true }) // L1 分支只在 Chrome/IE 走
afterEach(() => { browser.chrome = chrome; document.body.innerHTML = ''; document.getSelection()?.removeAllRanges() })

function setup(doc: string) {
    const view = new EditorView({ state: EditorState.create({ doc }) })
    document.body.appendChild(view.dom)
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    document.getSelection()?.removeAllRanges()
    return { view, input }
}
const selInEditor = (view: EditorView) => {
    const s = document.getSelection()
    return !!s && s.rangeCount > 0 && !!s.anchorNode && view.contentDOM.contains(s.anchorNode)
}
const raf = () => new Promise(r => setTimeout(r, 50))

describe('未聚焦时不写原生选区', () => {
    it('改行数的整篇替换后焦点留在外部 input、选区不进编辑器', async () => {
        const { view, input } = setup('a\nb\nc\nd\n')
        view.dispatch(view.state.update({ changes: { from: 0, to: view.state.doc.length, insert: 'x\n' } }))
        expect(document.activeElement).toBe(input)
        expect(selInEditor(view)).toBe(false)
        await raf()
        expect(document.activeElement).toBe(input)
        expect(selInEditor(view)).toBe(false)
    })

    it('改行数后再来一个纯 effect / 选区事务(诊断到达、延迟回调)也不写选区', async () => {
        const { view, input } = setup('a\nb\n')
        view.dispatch(view.state.update({ changes: { from: 0, insert: 'x\ny\n' } }))
        view.dispatch(view.state.update({ selection: EditorSelection.cursor(1) }))
        view.dispatch(view.state.update({ changes: { from: 0, insert: 'p' } }))
        await raf()
        expect(document.activeElement).toBe(input)
        expect(selInEditor(view)).toBe(false)
    })

    it('改行数后紧跟一次同行数的编辑(外部合并分两步到达)也不写选区', async () => {
        const { view, input } = setup('a\nb\n')
        view.dispatch(view.state.update({ changes: { from: 0, insert: 'x\n' } }))
        view.dispatch(view.state.update({ changes: { from: 0, insert: 'q' } }))
        expect(selInEditor(view)).toBe(false)
        expect(document.activeElement).toBe(input)
    })

    it('有焦点时行为不变:改行数后原生选区跟着 state 走', () => {
        const { view } = setup('a\nb\nc\n')
        view.focus()
        view.dispatch(view.state.update({ changes: { from: 0, insert: 'x\ny\n' }, selection: EditorSelection.cursor(2) }))
        expect(selInEditor(view)).toBe(true)
    })
})
