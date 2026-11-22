// 第 2 轮 F6b:minimap 行号按 view line 排,不含 view zone(V15:查找框的顶部 zone 让 minimap 内容下移 4px)。
// Monaco minimap 画的是 view line,zone 不占 minimap 行。jsdom 无 canvas:桩一个只记 fillRect 的 2D context。
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { minimapCM7 } from '../../src/core/chrome/minimap'
import { EditorView } from '../../src/core/view/editorview'
import { EditorState } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'
import { rulerPalette } from '../../src/product/theme'
import type { ScopedShiki } from '../../src/core/view/tokens'

interface Rect { x: number, y: number, w: number, h: number, style: string, alpha: number }
const rects = new WeakMap<HTMLCanvasElement, Rect[]>()
const origGetContext = HTMLCanvasElement.prototype.getContext
beforeAll(() => {
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) {
        const cv = this
        if (!rects.has(cv)) rects.set(cv, [])
        const c = {
            fillStyle: '', globalAlpha: 1,
            createImageData: (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
            clearRect() { rects.set(cv, []) },
            fillRect(x: number, y: number, w: number, h: number) { rects.get(cv)!.push({ x, y, w, h, style: String(c.fillStyle), alpha: Number(c.globalAlpha) }) },
            putImageData() {},
        }
        return c as unknown as CanvasRenderingContext2D
    } as unknown as typeof HTMLCanvasElement.prototype.getContext
})
afterAll(() => { HTMLCanvasElement.prototype.getContext = origGetContext })

const hl: ScopedShiki = {
    codeToTokens: (code: string) => ({ tokens: code.split('\n').map(l => [{ content: l, offset: 0, color: '#ffffff' }]) }),
    getLastGrammarState: () => ({ getScopes: () => [] }),
}
const palette = rulerPalette({ bg: '#1e1e1e', fg: '#d4d4d4', dark: true })

describe('minimap 行 = view line(zone 不占行,V15)', () => {
    it('第一行上方有 33px zone(查找框):选区块仍从 minimap 第 0 行画起;第 3 行后的 zone 只推后面的行', () => {
        const host = document.createElement('div')
        document.body.appendChild(host)
        const doc = Array.from({ length: 10 }, (_, i) => `line ${i}`).join('\n')
        const view = new EditorView({ state: EditorState.create({ doc }), parent: host })
        Object.defineProperty(view.scrollDOM, 'clientHeight', { configurable: true, get: () => 400 })
        view.oracle.lineHeight = 18
        view.resetHeights()
        view.remeasure()
        const off = minimapCM7(hl, { lang: 'typescript', theme: 'dark-plus' }, palette)(view)
        const hlCanvas = view.dom.querySelector('canvas.cm-minimap-hl') as HTMLCanvasElement
        const selRows = () => (rects.get(hlCanvas) ?? []).filter(r => r.style === palette.minimapSelection && r.alpha === 1).map(r => r.y / 2)
        view.setViewZone('find', { afterLine: 0, height: 33 })
        view.dispatch(view.state.update({ selection: EditorSelection.single(0, view.state.doc.line(2).to) }))
        expect(selRows()).toEqual([0, 1])
        view.setViewZone('peek', { afterLine: 3, height: 100 })
        const l5 = view.state.doc.line(5)
        view.dispatch(view.state.update({ selection: EditorSelection.single(l5.from, l5.to) }))
        expect(selRows()).toEqual([4])
        off(); view.destroy(); host.remove()
    })
})
