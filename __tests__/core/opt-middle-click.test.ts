import { afterEach, describe, expect, it, vi } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'
import { EditorView } from '../../src/core/view/editorview'
import { editorOptions } from '../../src/core/options'
import { activeLinkField, linkDetector, registerLinkOpener } from '../../src/core/feature/link'
import { clickDefinitionHandler, handleMouseDown, isRectangleMouseEvent } from '../../src/core/input/mouseselection'
import { middleScrollSession } from '../../src/core/input/middlescroll'

// mouseMiddleClickAction(Monaco ClickLinkMouseEvent / links.isEnabled):
//   'default' 中键什么都不做;'openLink' 中键松开直接开链接(不需修饰键);'ctrlLeftClick' 中键当 Ctrl/Cmd+左键(链接 + 跳定义)
// scrollOnMiddleClick(Monaco MiddleScrollController):开着时中键 = 自动滚动会话,不再列选
const views: EditorView[] = []
afterEach(() => { for (const v of views.splice(0)) { v.dom.parentElement?.remove(); v.destroy() } document.body.replaceChildren(); vi.useRealTimers() })

function mount(doc: string, options: Record<string, unknown>, extra: unknown[] = []) {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const view = new EditorView({
        state: EditorState.create({ doc, selection: EditorSelection.cursor(0), extensions: [editorOptions.of(options as never), ...(extra as never[])] }),
        parent: host,
    })
    views.push(view)
    ;(view as unknown as { posAtCoords: () => number }).posAtCoords = () => 5
    return view
}
const DOC = 'go http://a.com/x end'
const mid = (type: string) => new MouseEvent(type, { button: 1, bubbles: true, clientX: 10, clientY: 10 })

describe('mouseMiddleClickAction × 链接', () => {
    const tryOpen = async (action: string | undefined) => {
        const open = vi.fn()
        const d = registerLinkOpener({ open: (u) => { open(u.toString()); return true } })
        const v = mount(DOC, action ? { mouseMiddleClickAction: action } : {}, [activeLinkField])
        const off = linkDetector(v)
        v.contentDOM.dispatchEvent(mid('mouseup'))
        await new Promise(r => setTimeout(r, 0))
        off(); d.dispose()
        return open.mock.calls.length
    }
    it("默认 'default':中键不开链接", async () => { expect(await tryOpen(undefined)).toBe(0) })
    it("'openLink':中键直接开链接", async () => { expect(await tryOpen('openLink')).toBe(1) })
    it("'ctrlLeftClick':中键等同 Ctrl/Cmd+左键 → 开链接", async () => { expect(await tryOpen('ctrlLeftClick')).toBe(1) })
    it('links:false 时都不开', async () => {
        const open = vi.fn()
        const d = registerLinkOpener({ open: (u) => { open(u.toString()); return true } })
        const v = mount(DOC, { mouseMiddleClickAction: 'openLink', links: false }, [activeLinkField])
        const off = linkDetector(v)
        v.contentDOM.dispatchEvent(mid('mouseup'))
        await new Promise(r => setTimeout(r, 0))
        expect(open).not.toHaveBeenCalled()
        off(); d.dispose()
    })
})

describe('mouseMiddleClickAction × 跳定义', () => {
    const jumps = (action: string | undefined, button: number) => {
        const h = vi.fn(() => true)
        const v = mount(DOC, action ? { mouseMiddleClickAction: action } : {}, [clickDefinitionHandler.of(h)])
        const down = new MouseEvent('mousedown', { button, bubbles: true, clientX: 10, clientY: 10 })
        Object.defineProperty(down, 'target', { value: v.contentDOM })
        handleMouseDown(v, down)
        document.dispatchEvent(new MouseEvent('mouseup', { button, bubbles: true, clientX: 10, clientY: 10 }))
        return h.mock.calls.length
    }
    it("'ctrlLeftClick':中键点击跳定义", () => { expect(jumps('ctrlLeftClick', 1)).toBe(1) })
    it("'default' / 'openLink':中键不跳定义", () => {
        expect(jumps('default', 1)).toBe(0)
        expect(jumps('openLink', 1)).toBe(0)
    })
})

describe('scrollOnMiddleClick', () => {
    it('默认 false:中键仍是列选(非 Linux)', () => {
        const v = mount(DOC, {})
        expect(isRectangleMouseEvent(new MouseEvent('mousedown', { button: 1 }), v)).toBe(true)
    })
    it('true:中键不再列选', () => {
        const v = mount(DOC, { scrollOnMiddleClick: true })
        expect(isRectangleMouseEvent(new MouseEvent('mousedown', { button: 1 }), v)).toBe(false)
    })
    it('true:中键按下开会话(圆点 + data-scroll-direction),随鼠标偏移滚动,按键结束', () => {
        vi.useFakeTimers()
        const v = mount(DOC, { scrollOnMiddleClick: true })
        const off = middleScrollSession(v)
        const down = new MouseEvent('mousedown', { button: 1, bubbles: true, cancelable: true, clientX: 100, clientY: 100 })
        v.contentDOM.dispatchEvent(down)
        expect(down.defaultPrevented).toBe(true)
        expect(v.dom.querySelector('.cm-middleScrollDot')).not.toBeNull()
        expect(v.dom.classList.contains('cm-middleScrolling')).toBe(true)
        // 偏移 30(去掉 5px 死区 = 25):每 32ms 滚 25
        Object.defineProperty(v.scrollDOM, 'clientHeight', { value: 100, configurable: true })
        window.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: 130 }))
        expect(v.dom.getAttribute('data-scroll-direction')).toBe('s')
        vi.advanceTimersByTime(100)
        expect(v.scrollDOM.scrollTop).toBeGreaterThan(0)
        v.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }))
        expect(v.dom.querySelector('.cm-middleScrollDot')).toBeNull()
        expect(v.dom.classList.contains('cm-middleScrolling')).toBe(false)
        off()
    })
    it('false:会话不启动(无圆点、无方向属性),中键仍走原来的列选', () => {
        const v = mount(DOC, {})
        const off = middleScrollSession(v)
        const down = new MouseEvent('mousedown', { button: 1, bubbles: true, cancelable: true })
        v.contentDOM.dispatchEvent(down)
        expect(v.dom.querySelector('.cm-middleScrollDot')).toBeNull()
        expect(v.dom.hasAttribute('data-scroll-direction')).toBe(false)
        off()
    })
})
