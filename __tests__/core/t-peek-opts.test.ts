// peekWidgetDefaultFocus + 预览 / 引用树分栏 sash(Monaco SplitView)
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { showPeek, closePeek } from '../../src/lang/tspeek'
import { EditorState } from '../../src/core/model/state'
import { editorOptions, type IEditorOptions } from '../../src/core/options'
import { EditorView } from '../../src/core/view/editorview'

const doc = 'const a = 1\nconst b = a\nconst c = a\n'
const locs = [
    { file: '/main.ts', line: 2, start: doc.indexOf('a\n'), length: 1, local: true, preview: 'const b = a', text: doc },
    { file: '/main.ts', line: 3, start: doc.lastIndexOf('a'), length: 1, local: true, preview: 'const c = a', text: doc },
]
const realRect = HTMLElement.prototype.getBoundingClientRect
beforeEach(() => {
    // jsdom 没有布局:给所有元素一个 1000 宽的盒,sash 拖动才有基准
    HTMLElement.prototype.getBoundingClientRect = function () {
        return { left: 0, right: 1000, top: 0, bottom: 360, width: 1000, height: 360, x: 0, y: 0, toJSON() {} } as DOMRect
    }
})
afterEach(() => { HTMLElement.prototype.getBoundingClientRect = realRect })

function open(options: IEditorOptions = {}) {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const view = new EditorView({ state: EditorState.create({ doc, extensions: [editorOptions.of(options)] }), parent: host })
    showPeek(view, { title: 'References', locations: locs })
    return { view, host, done: () => { closePeek(view); view.destroy(); host.remove() } }
}

describe('peekWidgetDefaultFocus', () => {
    it("tree(默认):焦点在引用列表", () => {
        const p = open()
        expect(document.activeElement).toBe(p.view.dom.querySelector('.cm-peek-tree'))
        p.done()
    })
    it("editor:焦点在预览编辑器", () => {
        const p = open({ peekWidgetDefaultFocus: 'editor' })
        const prev = p.view.dom.querySelector('.cm-peek-preview')!
        expect(prev.contains(document.activeElement)).toBe(true)
        expect(document.activeElement).not.toBe(p.view.dom.querySelector('.cm-peek-tree'))
        p.done()
    })
})

describe('peek sash:拖动调预览 / 列表比例', () => {
    const previewW = (v: EditorView) => parseInt((v.dom.querySelector('.cm-peek-preview') as HTMLElement).style.width, 10)
    const drag = (v: EditorView, dx: number) => {
        const sash = v.dom.querySelector('.cm-peek-sash') as HTMLElement
        sash.dispatchEvent(new MouseEvent('mousedown', { clientX: 700, bubbles: true, cancelable: true }))
        document.dispatchEvent(new MouseEvent('mousemove', { clientX: 700 + dx }))
        document.dispatchEvent(new MouseEvent('mouseup'))
    }
    it('默认 7:3;向左拖 200 → 预览 500;比例跨 peek 沿用;夹在 [200, 宽-100]', () => {
        let p = open()
        expect(previewW(p.view)).toBe(700)
        drag(p.view, -200)
        expect(previewW(p.view)).toBe(500)
        drag(p.view, -5000)
        expect(previewW(p.view)).toBe(200)
        drag(p.view, 5000)
        expect(previewW(p.view)).toBe(900)
        p.done()
        p = open()
        expect(previewW(p.view)).toBe(900) // 上一次的比例
        // 还原默认,免得影响其它用例
        drag(p.view, -200 + 0)
        p.done()
    })
    it('mouseup 后不再跟随鼠标', () => {
        const p = open()
        drag(p.view, -100)
        const w = previewW(p.view)
        document.dispatchEvent(new MouseEvent('mousemove', { clientX: 100 }))
        expect(previewW(p.view)).toBe(w)
        p.done()
    })
})
