// 第六轮 H 组:滚轮一格 Monaco 滚 50px,lite-monaco 走原生滚 100px。
// 依据:monaco-editor 0.52 StandardWheelEvent(wheelDeltaY/120 → 格)+ scrollableElement._onMouseWheel(格 × 50,⌥ ×5,
// 只滚主轴,Win/Linux ⇧ 转横向,Mac 不转)。实测 /tmp/lc-hunt/r6/H/wheel-probe.ts(headless Chrome,同一事件两边量):
// real dy=100(wheelDeltaY=-120)M 50 / 原 L 100;⌥ M 250;dx=30 dy=40 M 只滚竖向 50;deltaMode=1 dy=3 无 wheelDeltaY 时 → 3 格。
import { describe, expect, it } from 'vitest'
import { wheelScrollDelta, handleWheel } from '../../src/core/input/wheel'
import { EditorState } from '../../src/core/model/state'
import { EditorView } from '../../src/core/view/editorview'

// Chrome 的 WheelEvent 带老的 wheelDeltaX/Y(一格 ±120);jsdom 没有,按需补上
function wheel(init: WheelEventInit & { wheelDeltaY?: number, wheelDeltaX?: number }) {
    const e = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init })
    if (init.wheelDeltaY !== undefined) Object.defineProperty(e, 'wheelDeltaY', { value: init.wheelDeltaY })
    if (init.wheelDeltaX !== undefined) Object.defineProperty(e, 'wheelDeltaX', { value: init.wheelDeltaX })
    return e
}

describe('wheelScrollDelta(Monaco 公式)', () => {
    it('鼠标一格(Chrome wheelDeltaY=-120)→ 50px', () => {
        expect(wheelScrollDelta(wheel({ deltaY: 100, wheelDeltaY: -120, wheelDeltaX: 0 }), true)).toEqual({ x: 0, y: 50 })
        expect(wheelScrollDelta(wheel({ deltaY: -100, wheelDeltaY: 120, wheelDeltaX: 0 }), true)).toEqual({ x: 0, y: -50 })
    })
    it('触控板小 delta(wheelDeltaY≈3×deltaY)不比原生慢:deltaY=4 → 5px;再小也至少 1px', () => {
        expect(wheelScrollDelta(wheel({ deltaY: 4, wheelDeltaY: -12, wheelDeltaX: 0 }), true).y).toBe(5)
        expect(wheelScrollDelta(wheel({ deltaY: 0.3, wheelDeltaY: -1, wheelDeltaX: 0 }), true).y).toBe(1)
    })
    it('没有 wheelDeltaY(Firefox):像素模式 /40,行模式按格', () => {
        expect(wheelScrollDelta(wheel({ deltaY: 100, deltaMode: 0 }), true).y).toBe(125)
        expect(wheelScrollDelta(wheel({ deltaY: 3, deltaMode: 1 }), true).y).toBe(150)
    })
    it('⌥ 快速滚动 ×5', () => {
        expect(wheelScrollDelta(wheel({ deltaY: 100, wheelDeltaY: -120, wheelDeltaX: 0, altKey: true }), true).y).toBe(250)
    })
    it('斜着滑只滚主轴', () => {
        expect(wheelScrollDelta(wheel({ deltaY: 40, deltaX: 30, wheelDeltaY: -120, wheelDeltaX: -90 }), true)).toEqual({ x: 0, y: 50 })
        expect(wheelScrollDelta(wheel({ deltaX: 100, wheelDeltaY: 0, wheelDeltaX: -120 }), true)).toEqual({ x: 50, y: 0 })
    })
    it('⇧:Win/Linux 竖转横,Mac 不转', () => {
        const e = () => wheel({ deltaY: 100, wheelDeltaY: -120, wheelDeltaX: 0, shiftKey: true })
        expect(wheelScrollDelta(e(), false)).toEqual({ x: 50, y: 0 })
        expect(wheelScrollDelta(e(), true)).toEqual({ x: 0, y: 50 })
    })
})

describe('EditorView 滚轮', () => {
    function make() {
        const host = document.createElement('div')
        document.body.appendChild(host)
        const view = new EditorView({ state: EditorState.create({ doc: Array.from({ length: 200 }, (_, i) => `line ${i}`).join('\n') }), parent: host })
        // jsdom 无布局:给滚动容器一个可滚的几何,scrollTop 夹在 [0, 3000]
        const s = view.scrollDOM
        let top = 0
        Object.defineProperty(s, 'clientHeight', { value: 400, configurable: true })
        Object.defineProperty(s, 'scrollHeight', { value: 3400, configurable: true })
        Object.defineProperty(s, 'scrollTop', { get: () => top, set: (v: number) => { top = Math.max(0, Math.min(3000, v)) }, configurable: true })
        return view
    }
    it('内容上滚一格 → scrollTop +50,吞掉事件', () => {
        const view = make()
        const e = wheel({ deltaY: 100, wheelDeltaY: -120, wheelDeltaX: 0 })
        view.contentDOM.dispatchEvent(e)
        expect(view.scrollDOM.scrollTop).toBe(50)
        expect(e.defaultPrevented).toBe(true)
        view.destroy()
    })
    it('滚到顶再往上:不动,也不吞(外层页面接着滚)', () => {
        const view = make()
        const e = wheel({ deltaY: -100, wheelDeltaY: 120, wheelDeltaX: 0 })
        view.contentDOM.dispatchEvent(e)
        expect(view.scrollDOM.scrollTop).toBe(0)
        expect(e.defaultPrevented).toBe(false)
        view.destroy()
    })
    it('别人已 preventDefault(嵌套编辑器处理过)→ 不再滚', () => {
        const view = make()
        const e = wheel({ deltaY: 100, wheelDeltaY: -120, wheelDeltaX: 0 })
        e.preventDefault()
        view.contentDOM.dispatchEvent(e)
        expect(view.scrollDOM.scrollTop).toBe(0)
        view.destroy()
    })
    it('编辑器里自带滚动条的浮层:能滚归它(原生),到头吞掉不传给编辑器', () => {
        const view = make()
        const card = document.createElement('div')
        card.style.overflowY = 'auto'
        let ct = 0
        Object.defineProperty(card, 'clientHeight', { value: 100 })
        Object.defineProperty(card, 'scrollHeight', { value: 300 })
        Object.defineProperty(card, 'scrollTop', { get: () => ct, set: (v: number) => { ct = v } })
        view.dom.appendChild(card)
        const e1 = wheel({ deltaY: 100, wheelDeltaY: -120, wheelDeltaX: 0 })
        card.dispatchEvent(e1)
        expect(e1.defaultPrevented).toBe(false)
        expect(view.scrollDOM.scrollTop).toBe(0)
        ct = 200
        const e2 = wheel({ deltaY: 100, wheelDeltaY: -120, wheelDeltaX: 0 })
        card.dispatchEvent(e2)
        expect(e2.defaultPrevented).toBe(true)
        expect(view.scrollDOM.scrollTop).toBe(0)
        view.destroy()
    })
    it('行号栏上滚也滚编辑器(Monaco 听整个 viewDomNode)', () => {
        const host = document.createElement('div')
        document.body.appendChild(host)
        const view = new EditorView({ state: EditorState.create({ doc: 'a\nb' }), parent: host, lineNumbers: true })
        let top = 0
        Object.defineProperty(view.scrollDOM, 'scrollTop', { get: () => top, set: (v: number) => { top = Math.max(0, Math.min(3000, v)) }, configurable: true })
        const g = view.dom.querySelector('.cm-gutters') as HTMLElement
        g.dispatchEvent(wheel({ deltaY: 100, wheelDeltaY: -120, wheelDeltaX: 0 }))
        expect(top).toBe(50)
        view.destroy()
    })
    it('handleWheel 直接调用:⌥ 一格 250', () => {
        const root = document.createElement('div'); const sc = document.createElement('div'); root.appendChild(sc)
        let top = 0
        Object.defineProperty(sc, 'scrollTop', { get: () => top, set: (v: number) => { top = v } })
        handleWheel(root, sc, wheel({ deltaY: 100, wheelDeltaY: -120, wheelDeltaX: 0, altKey: true }), true)
        expect(top).toBe(250)
    })
})
