// 第五轮 O 组:hover 卡上下位置照 Monaco ResizableContentWidget._findPositionPreference(editor.hover.above 默认 true)。
// 上方空间 = 行顶(页面坐标)- 30,下方 = 窗口高 - 行底 - 24;卡高放得进上方就放上方,否则下方。
// 空间按整个窗口算,不按编辑器:编辑器第 3 行的卡可以伸出编辑器顶(实测 /tmp/lc-hunt/r5/O/hover-top.ts:
// 编辑器 top=182、第 3 行 top=222、卡高 172 → Monaco 卡在 [50,222],lite-monaco 原先因放不进编辑器而放下方)。
import { describe, expect, it } from 'vitest'
import { placeHoverCard, showHover, hoverSources } from '../../src/core/feature/hover'
import { EditorState } from '../../src/core/model/state'
import { EditorView } from '../../src/core/view/editorview'

describe('placeHoverCard', () => {
    const editor = { left: 0, top: 182, width: 800, height: 518 }
    it('上方(按窗口算)放得下 → 上方,可以伸出编辑器顶', () => {
        const r = placeHoverCard({ left: 100, top: 222, bottom: 242 }, { w: 300, h: 172 }, editor, 900)
        expect(r.above).toBe(true)
        expect(r.top).toBe(222 - 172 - 182) // 相对编辑器 = -132
    })
    it('上方不够(行顶 - 30 < 卡高)→ 下方', () => {
        const r = placeHoverCard({ left: 100, top: 182, bottom: 202 }, { w: 300, h: 172 }, editor, 900)
        expect(r.above).toBe(false)
        expect(r.top).toBe(202 - 182)
    })
    it('上下都不够整张:取空间大的一边(Monaco 截高后比较)', () => {
        // 上方 70,下方 900-260-24=616 → 截成 min(400, 616)=400 > 70 → 下方
        const r = placeHoverCard({ left: 100, top: 100, bottom: 120 }, { w: 300, h: 400 }, { left: 0, top: 0, width: 800, height: 900 }, 900)
        expect(r.above).toBe(false)
    })
    it('水平照旧夹在编辑器内', () => {
        const r = placeHoverCard({ left: 700, top: 400, bottom: 420 }, { w: 300, h: 50 }, editor, 900)
        expect(r.left).toBe(800 - 300 - 4)
    })
})

describe('hover 卡渲染位置', () => {
    it('伸出编辑器的卡用 fixed 定位(.cm-editor overflow:hidden 不裁它)', async () => {
        const host = document.createElement('div')
        document.body.appendChild(host)
        const card = () => { const d = document.createElement('div'); d.className = 'card'; d.textContent = 'x'; return d }
        const view = new EditorView({
            state: EditorState.create({ doc: 'foo bar', extensions: [hoverSources.of(() => ({ pos: 0, end: 3, create: card }))] }),
            parent: host,
        })
        // jsdom 无布局:给出对照页量到的几何
        ;(view as unknown as { caretCoords: () => unknown }).caretCoords = () => ({ left: 100, right: 100, top: 222, bottom: 242 })
        view.dom.getBoundingClientRect = () => ({ left: 0, top: 182, width: 800, height: 518, right: 800, bottom: 700, x: 0, y: 182, toJSON() {} }) as DOMRect
        const orig = HTMLElement.prototype.getBoundingClientRect
        HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
            if (this.classList.contains('cm-tooltip-hover')) return { left: 0, top: 0, width: 300, height: 172, right: 300, bottom: 172, x: 0, y: 0, toJSON() {} } as DOMRect
            return orig.call(this)
        }
        Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true })
        try {
            await showHover(view)
            const root = view.dom.querySelector('.cm-tooltip-hover') as HTMLElement
            expect(root).toBeTruthy()
            expect(root.style.position).toBe('fixed')
            expect(root.style.top).toBe('50px')
            expect(root.style.left).toBe('100px')
        }
        finally {
            HTMLElement.prototype.getBoundingClientRect = orig
            view.destroy()
            host.remove()
        }
    })

    it('放得进编辑器的卡仍按编辑器内 absolute 定位', async () => {
        const host = document.createElement('div')
        document.body.appendChild(host)
        const view = new EditorView({
            state: EditorState.create({ doc: 'foo bar', extensions: [hoverSources.of(() => ({ pos: 0, end: 3, create: () => document.createElement('div') }))] }),
            parent: host,
        })
        ;(view as unknown as { caretCoords: () => unknown }).caretCoords = () => ({ left: 100, right: 100, top: 562, bottom: 582 })
        view.dom.getBoundingClientRect = () => ({ left: 0, top: 182, width: 800, height: 518, right: 800, bottom: 700, x: 0, y: 182, toJSON() {} }) as DOMRect
        const orig = HTMLElement.prototype.getBoundingClientRect
        HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
            if (this.classList.contains('cm-tooltip-hover')) return { left: 0, top: 0, width: 300, height: 172, right: 300, bottom: 172, x: 0, y: 0, toJSON() {} } as DOMRect
            return orig.call(this)
        }
        Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true })
        try {
            await showHover(view)
            const root = view.dom.querySelector('.cm-tooltip-hover') as HTMLElement
            expect(root.style.position).not.toBe('fixed')
            expect(root.style.top).toBe(`${562 - 172 - 182}px`)
        }
        finally {
            HTMLElement.prototype.getBoundingClientRect = orig
            view.destroy()
            host.remove()
        }
    })
})
