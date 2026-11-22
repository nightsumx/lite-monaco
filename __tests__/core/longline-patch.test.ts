// @vitest-environment jsdom
// 超长行里打字:patchDOM 不整行换掉,只把真的变了的文本节点就地改(整行换掉 = 53 万字符重新排版,每键十几毫秒)。
import { afterEach, describe, expect, it } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { EditorView } from '../../src/core/view/editorview'

const views: EditorView[] = []
afterEach(() => { for (const v of views.splice(0)) { v.destroy(); v.dom.parentElement?.remove() } })

function make(doc: string) {
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    const view = new EditorView({ state: EditorState.create({ doc }), parent })
    views.push(view)
    return view
}
const lineEls = (v: EditorView) => Array.from(v.contentDOM.children) as HTMLElement[]

describe('超长行打字', () => {
    const long = 'abcdefghij'.repeat(1000) // 10000 字符,切成 20 段文本节点
    const doc = ['short', long, 'tail'].join('\n')

    it('行元素和它的文本节点还是原来那些,文字对', () => {
        const v = make(doc)
        const before = lineEls(v)
        const line = before[1]
        const texts = Array.from(line.childNodes)
        expect(texts.length).toBeGreaterThan(5)
        const at = v.state.doc.line(2).from + 3000
        v.dispatch(v.state.update({ changes: { from: at, insert: 'XY' } }))
        const after = lineEls(v)
        expect(after[1]).toBe(line)
        expect(after[0]).toBe(before[0])
        expect(after[2]).toBe(before[2])
        expect(line.textContent).toBe(v.state.doc.line(2).text)
        expect(line.textContent).toContain('XY')
    })

    it('删字、连续打字也对', () => {
        const v = make(doc)
        const line = lineEls(v)[1]
        let pos = v.state.doc.line(2).from + 100
        for (const ch of 'hello') { v.dispatch(v.state.update({ changes: { from: pos, insert: ch } })); pos++ }
        v.dispatch(v.state.update({ changes: { from: pos - 2, to: pos } }))
        expect(lineEls(v)[1]).toBe(line)
        expect(line.textContent).toBe(v.state.doc.line(2).text)
    })

    it('短行照旧整行重画', () => {
        const v = make('abc\ndef')
        const line = lineEls(v)[0]
        v.dispatch(v.state.update({ changes: { from: 1, insert: 'X' } }))
        expect(lineEls(v)[0].textContent).toBe('aXbc')
        expect(lineEls(v)[0]).not.toBe(line)
    })

    it('换行把长行拆成两行:不走就地改,结果对', () => {
        const v = make(doc)
        const at = v.state.doc.line(2).from + 5000
        v.dispatch(v.state.update({ changes: { from: at, insert: '\n' } }))
        const els = lineEls(v)
        expect(els.length).toBe(4)
        expect(els.map(e => e.textContent).join('\n')).toBe(v.state.doc.toString())
    })
})
