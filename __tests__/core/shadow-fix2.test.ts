// FIX2 H1:挂在 shadow DOM 里。Monaco 0.52 在 shadow root 里能正常编辑(宿主把样式放进 shadow root)。
// lite-monaco:view.root 要是那个 ShadowRoot(activeElement / getSelection 在它上面取,document 上只看得到宿主),
// 结构 CSS 要注入到 shadow root 里(外面的样式进不去),浮层挂 document.body,所以 document 也要一份。
// 选区读写的真行为(点击打字落点)jsdom 测不了,见 /tmp/lc-hunt/h-host/h04c-shadow-css.ts。
import { describe, expect, it } from 'vitest'
import { EditorView } from '../../src/core/view/editorview'
import { EditorState } from '../../src/core/model/state'
import { getSelection } from '../../src/core/view/domutil'
import { ensureBaseCSS } from '../../src/product/themecss'

describe('shadow DOM', () => {
    it('view.root 是所在的 ShadowRoot;不在 shadow 里是 document', () => {
        const host = document.createElement('div')
        document.body.appendChild(host)
        const sr = host.attachShadow({ mode: 'open' })
        const inner = document.createElement('div')
        sr.appendChild(inner)
        const view = new EditorView({ state: EditorState.create({ doc: 'abc' }), parent: inner })
        expect(view.root).toBe(sr)
        view.focus()
        expect(view.hasFocus).toBe(true)
        view.destroy()
        const plain = new EditorView({ state: EditorState.create({ doc: 'abc' }), parent: document.body })
        expect(plain.root).toBe(document)
        plain.destroy()
        host.remove()
    })

    it('getSelection 优先用根自己的 getSelection(Chromium 的 ShadowRoot),没有才退回 document', () => {
        const own = {} as Selection
        const fake = { nodeType: 11, getSelection: () => own, ownerDocument: document } as unknown as ShadowRoot
        expect(getSelection(fake)).toBe(own)
        const bare = { nodeType: 11, ownerDocument: document } as unknown as ShadowRoot
        expect(getSelection(bare)).toBe(document.getSelection())
    })

    it('ensureBaseCSS(shadowRoot):shadow 根里一份,document 里一份,重复调用不重复插', () => {
        const host = document.createElement('div')
        document.body.appendChild(host)
        const sr = host.attachShadow({ mode: 'open' })
        ensureBaseCSS(sr)
        ensureBaseCSS(sr)
        expect(sr.querySelectorAll('style#lite-monaco-base').length).toBe(1)
        expect(sr.firstChild).toBe(sr.querySelector('style#lite-monaco-base'))
        expect(document.head.querySelectorAll('style#lite-monaco-base').length).toBe(1)
        host.remove()
    })
})

// FIX2 H25:view 销毁后 dombridge 行索引的 MutationObserver 要断开(DiffEditor 两侧 view 销毁也走这里)
describe('销毁', () => {
    it('destroy 后 dombridge 的 MutationObserver 断开', () => {
        const Real = globalThis.MutationObserver
        const live = new Set<object>()
        globalThis.MutationObserver = class extends Real {
            observe(t: Node, o?: MutationObserverInit) { live.add(this); super.observe(t, o) }
            disconnect() { live.delete(this); super.disconnect() }
        }
        try {
            const view = new EditorView({ state: EditorState.create({ doc: 'a\nb' }), parent: document.body })
            view.posFromDOM(view.contentDOM.firstChild!, 0)
            const before = live.size
            expect(before).toBeGreaterThan(0)
            view.destroy()
            expect(live.size).toBe(0)
        } finally {
            globalThis.MutationObserver = Real
        }
    })
})
