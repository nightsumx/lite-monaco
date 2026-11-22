// 第 2 轮 F6b V9:sticky 行的括号同正文 bracket-highlighting 着色,括号拆成独立 span(点击列也随之落到括号处)。
// Monaco 实测(h-view p26-sticky):`class A {` 的 `{` 是 foreground1,`    method() {` 的 `()` `{` 是 foreground2。
import { describe, it, expect } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { EditorView } from '../../src/core/view/editorview'
import { stickyScrollOverlay } from '../../src/core/feature/stickyscroll'
import { foldField } from '../../src/core/edit/fold'

const body = Array.from({ length: 60 }, (_, i) => `        s${i}()`)
const DOC = ['class A {', '    method() {', ...body, '    }', '}'].join('\n')

describe('sticky 括号着色', () => {
    it('深度从文档开头数到行首;括号单独成 span', () => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const view = new EditorView({ state: EditorState.create({ doc: DOC, extensions: [foldField] }), parent })
        const st = (view.oracle.lineHeight || 20) * 20
        view.scrollDOM.getBoundingClientRect = () => ({ top: 0, left: 0, right: 600, bottom: 300, width: 600, height: 300, x: 0, y: 0, toJSON() {} }) as DOMRect
        view.contentDOM.getBoundingClientRect = () => ({ top: -st, left: 0, right: 600, bottom: 300, width: 600, height: 300, x: 0, y: -st, toJSON() {} }) as DOMRect
        const off = stickyScrollOverlay(view, { brackets: ['#ff0001', '#ff0002', '#ff0003'] })
        view.scrollDOM.dispatchEvent(new Event('scroll'))
        const rows = [...view.dom.querySelectorAll<HTMLElement>('.cm-sticky-text')].map(r =>
            [...r.children].map(s => `${s.textContent}${(s as HTMLElement).style.color ? '@' + (s as HTMLElement).style.color : ''}`))
        expect(rows).toEqual([
            ['class A ', '{@rgb(255, 0, 1)'],
            ['    method', '(@rgb(255, 0, 2)', ')@rgb(255, 0, 2)', ' ', '{@rgb(255, 0, 2)'],
        ])
        off(); view.destroy(); parent.remove()
    })
    it('编辑后深度:改动点在行首之前的重数,之后的沿用', () => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const view = new EditorView({ state: EditorState.create({ doc: DOC, extensions: [foldField] }), parent })
        const st = (view.oracle.lineHeight || 20) * 20
        view.scrollDOM.getBoundingClientRect = () => ({ top: 0, left: 0, right: 600, bottom: 300, width: 600, height: 300, x: 0, y: 0, toJSON() {} }) as DOMRect
        view.contentDOM.getBoundingClientRect = () => ({ top: -st, left: 0, right: 600, bottom: 300, width: 600, height: 300, x: 0, y: -st, toJSON() {} }) as DOMRect
        const off = stickyScrollOverlay(view, { brackets: ['#ff0001', '#ff0002', '#ff0003'] })
        const method = () => {
            view.scrollDOM.dispatchEvent(new Event('scroll'))
            const r = view.dom.querySelectorAll<HTMLElement>('.cm-sticky-text')[1]
            return [...r.children].find(s => s.textContent === '{')?.getAttribute('style')
        }
        expect(method()).toContain('255, 0, 2')
        view.dispatch(view.state.update({ changes: { from: view.state.doc.line(30).from, insert: '((' } }))
        expect(method()).toContain('255, 0, 2')
        view.dispatch(view.state.update({ changes: { from: 0, insert: '(' } }))
        expect(method()).toContain('255, 0, 3')
        off(); view.destroy(); parent.remove()
    })
})
