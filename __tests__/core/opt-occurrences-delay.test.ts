import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'
import { EditorView } from '../../src/core/view/editorview'
import { editorOptions } from '../../src/core/options'
import { highlightLayer } from '../../src/core/feature/selectionlayer'

// occurrencesHighlightDelay(默认 0):Monaco WordHighlighter._beginRenderDecorations —— 光标一挪,新同词高亮至少等 delay 毫秒才出
let host: HTMLElement
beforeEach(() => { vi.useFakeTimers(); host = document.createElement('div'); document.body.appendChild(host) })
afterEach(() => { vi.useRealTimers(); document.body.replaceChildren() })

function setup(delay?: number) {
    const view = new EditorView({
        state: EditorState.create({
            doc: 'foo bar foo\nbaz',
            selection: EditorSelection.cursor(0),
            extensions: [editorOptions.of(delay == null ? {} : { occurrencesHighlightDelay: delay } as never)],
        }),
        parent: host,
    })
    const off = highlightLayer(view)
    const boxes = () => view.dom.querySelectorAll('.cm-wordHighlightTextBox').length
    const move = (pos: number) => {
        view.focus()
        view.dispatch(view.state.update({ selection: EditorSelection.cursor(pos), userEvent: 'select.pointer' }))
    }
    return { view, boxes, move, off }
}

// jsdom 没有字形坐标 → caretCoords 为 null、box 不会画出来;改看 highlightLayer 内部算出的结果太绕,
// 这里桩 caretCoords,让每个范围画一个盒子
function stubCoords(view: EditorView) {
    ;(view as unknown as { caretCoords: unknown }).caretCoords = (pos: number) => ({ left: pos * 7, top: 0, bottom: 18, height: 18 })
}

describe('occurrencesHighlightDelay', () => {
    it('默认 0:挪光标同步出同词高亮', () => {
        const t = setup()
        stubCoords(t.view)
        t.move(8)
        expect(t.boxes()).toBe(2)
    })
    it('delay=300:挪光标后先没有,到点才出', () => {
        const t = setup(300)
        stubCoords(t.view)
        t.move(8)
        expect(t.boxes()).toBe(0)
        vi.advanceTimersByTime(299)
        expect(t.boxes()).toBe(0)
        vi.advanceTimersByTime(2)
        expect(t.boxes()).toBe(2)
    })
    it('delay 内再挪光标:重新计时,只出最后那个词', () => {
        const t = setup(300)
        stubCoords(t.view)
        t.move(8)
        vi.advanceTimersByTime(200)
        t.move(13) // baz
        vi.advanceTimersByTime(200)
        expect(t.boxes()).toBe(0)
        vi.advanceTimersByTime(101)
        expect(t.boxes()).toBe(1)
    })
})
