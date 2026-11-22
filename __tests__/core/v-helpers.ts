// V(视图选项 + Monaco 视图 API)测试的几何桩。jsdom 没有布局,这里装一张「等宽网格」:
//   行盒高 = 编辑器内联 line-height(没设 = 20);字宽 = 内联 font-size × 0.6(没设 = 8);
//   scroller 在屏上 (LEFT, TOP),大小 W×H;行号栏占 LEFT 宽。折行时每行 ceil(len / oracle.lineLength) 个视觉行。
// 必须在 new EditorView 之前 installGrid()。

import { afterEach } from 'vitest'
import { EditorView } from '../../src/core/view/editorview'
import { EditorState, type Extension } from '../../src/core/model/state'

export const GRID = { LEFT: 40, TOP: 100, W: 600, H: 400 }

const restores: (() => void)[] = []
afterEach(() => {
    while (restores.length) restores.pop()!()
    document.body.innerHTML = ''
})

function override(obj: object, key: string, desc: PropertyDescriptor) {
    const prev = Object.getOwnPropertyDescriptor(obj, key)
    Object.defineProperty(obj, key, { configurable: true, ...desc })
    restores.push(() => {
        if (prev) Object.defineProperty(obj, key, prev)
        else delete (obj as Record<string, unknown>)[key]
    })
}

export function rect(left: number, top: number, width: number, height: number): DOMRect {
    return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() { return this } } as DOMRect
}

export interface Geo { view: EditorView | null, scrollTop: number, scrollLeft: number, w: number, h: number }

const px = (v: string | undefined, d: number) => { const n = parseFloat(v ?? ''); return Number.isFinite(n) && n > 0 ? n : d }
export const lineHeightOf = (el: Element | null) => px((el?.closest('.cm-editor') as HTMLElement | null)?.style.lineHeight, 20)
export const charWidthOf = (el: Element | null) => {
    const fs = parseFloat((el?.closest('.cm-editor') as HTMLElement | null)?.style.fontSize ?? '')
    return Number.isFinite(fs) && fs > 0 ? fs * 0.6 : 8
}

export function installGrid(): Geo {
    const geo: Geo = { view: null, scrollTop: 0, scrollLeft: 0, w: GRID.W, h: GRID.H }
    const P = HTMLElement.prototype
    const rowsOf = (len: number) => {
        const v = geo.view
        return v?.lineWrapping && v.oracle.lineLength > 0 ? Math.max(1, Math.ceil(len / v.oracle.lineLength)) : 1
    }
    override(P, 'getBoundingClientRect', {
        writable: true,
        value(this: HTMLElement) {
            const v = geo.view
            const cl = this.classList
            if (cl.contains('cm-line')) {
                const lh = lineHeightOf(this)
                if (this.getAttribute('aria-hidden') === 'true') return rect(0, 0, 300, lh)
                if (!v) return rect(0, 0, 0, 0)
                const i = Array.from(v.contentDOM.children).indexOf(this)
                if (i < 0) return rect(0, 0, 0, 0)
                const n = v.viewportStartLine + i
                return rect(GRID.LEFT - geo.scrollLeft, GRID.TOP - geo.scrollTop + v.heightMap.lineAt(v.state.doc.line(n).from, 0, v.oracle, 0, 0).top, GRID.W, rowsOf(v.state.doc.line(n).length) * lh)
            }
            if (cl.contains('cm-scroller')) return rect(GRID.LEFT, GRID.TOP, geo.w, geo.h)
            if (cl.contains('cm-content')) return rect(GRID.LEFT - geo.scrollLeft, GRID.TOP - geo.scrollTop, geo.w, v ? v.heightMap.height : 0)
            if (cl.contains('cm-editor')) return rect(0, GRID.TOP, GRID.LEFT + geo.w, geo.h)
            if (cl.contains('cm-gutters-clip')) return rect(0, GRID.TOP, GRID.LEFT, geo.h)
            return rect(0, 0, 0, 0)
        },
    })
    const caret = (v: EditorView, pos: number) => {
        const line = v.state.doc.lineAt(pos)
        const lh = lineHeightOf(v.dom), cw = charWidthOf(v.dom)
        const col = pos - line.from
        const wrapLen = v.lineWrapping && v.oracle.lineLength > 0 ? v.oracle.lineLength : Infinity
        const row = Math.floor(col / wrapLen)
        const top = GRID.TOP - geo.scrollTop + v.heightMap.lineAt(line.from, 0, v.oracle, 0, 0).top + row * lh + (lh - 15) / 2
        return rect(GRID.LEFT - geo.scrollLeft + (col - row * (wrapLen === Infinity ? 0 : wrapLen)) * cw, top, 0, 15)
    }
    override(Range.prototype, 'getBoundingClientRect', {
        writable: true,
        value(this: Range) { return rect(0, 0, this.toString().length * charWidthOf(this.startContainer.parentElement), 15) },
    })
    override(Range.prototype, 'getClientRects', {
        writable: true,
        value(this: Range) {
            const v = geo.view
            if (!v) return { length: 0, item: () => null }
            const a = v.posFromDOM(this.startContainer, this.startOffset)
            const s = caret(v, a)
            const b = this.collapsed ? a : v.posFromDOM(this.endContainer, this.endOffset)
            const e = caret(v, b)
            const r = rect(s.left, s.top, Math.max(0, e.left - s.left), 15)
            return { 0: r, length: 1, item: (i: number) => (i === 0 ? r : null) }
        },
    })
    const scroller = (el: HTMLElement) => el.classList.contains('cm-scroller')
    override(P, 'clientHeight', { get(this: HTMLElement) { return scroller(this) ? geo.h : 0 } })
    override(P, 'clientWidth', { get(this: HTMLElement) { return scroller(this) ? geo.w : 0 } })
    override(P, 'offsetWidth', { get(this: HTMLElement) { return this.classList.contains('cm-gutters-clip') ? GRID.LEFT : 0 } })
    override(P, 'scrollTop', {
        get(this: HTMLElement) { return scroller(this) ? geo.scrollTop : 0 },
        set(this: HTMLElement, x: number) { if (scroller(this)) geo.scrollTop = Math.max(0, x) },
    })
    override(P, 'scrollLeft', {
        get(this: HTMLElement) { return scroller(this) ? geo.scrollLeft : 0 },
        set(this: HTMLElement, x: number) { if (scroller(this)) geo.scrollLeft = Math.max(0, x) },
    })
    return geo
}

export const lines = (n: number, f = (i: number) => `const v${i} = ${i}`) => Array.from({ length: n }, (_, i) => f(i + 1)).join('\n')

export function mount(doc: string, extra: Partial<ConstructorParameters<typeof EditorView>[0]> = {}, extensions: Extension[] = [], geo?: Geo) {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const view = new EditorView({ state: EditorState.create({ doc, extensions }), parent: host, ...extra })
    if (geo) { geo.view = view; view.remeasure() }
    return { view, host }
}
