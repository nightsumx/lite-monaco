// 光标 blink 复位契约 —— 打字、移动光标(按住方向键)时光标恒亮不闪(对齐 Monaco),停手 530ms 后恢复闪。
//
// .cm-cursor 是常驻 CSS blink 动画;打字途中光标可能正好在「灭」相 → 视觉丢失。修复:docChanged 时
// 给 cursorLayer 挂 .cm-typing(docChanged 或选区变化都算)(CSS 下停动画恒亮),debounce 530ms 移除恢复。视觉(CSS 动画)jsdom 测不了,
// 只钉类切换的行为契约:打字后有 .cm-typing、超时移除、连打只重置定时器不重排。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'
import { EditorView } from '../../src/core/view/editorview'

function drawView(doc: string) {
    const host = document.createElement('div')
    document.body.appendChild(host)
    return new EditorView({
        state: EditorState.create({ doc, extensions: [EditorState.allowMultipleSelections.of(true)] }),
        parent: host,
        drawSelection: true,
    })
}

describe('光标 blink 复位 on type', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it('docChanged → cursorLayer 挂 .cm-typing', () => {
        const view = drawView('abc')
        const layer = view.dom.querySelector('.cm-cursorLayer')!
        expect(layer.classList.contains('cm-typing')).toBe(false)
        view.dispatch(view.state.update({ changes: { from: 3, insert: 'd' }, selection: EditorSelection.single(4) }))
        expect(layer.classList.contains('cm-typing')).toBe(true)
        view.destroy()
    })

    it('停手 530ms 后移除 .cm-typing 恢复闪', () => {
        const view = drawView('abc')
        const layer = view.dom.querySelector('.cm-cursorLayer')!
        view.dispatch(view.state.update({ changes: { from: 3, insert: 'd' }, selection: EditorSelection.single(4) }))
        expect(layer.classList.contains('cm-typing')).toBe(true)
        vi.advanceTimersByTime(530 + 10)
        expect(layer.classList.contains('cm-typing')).toBe(false)
        view.destroy()
    })

    it('连打:途中定时器不断重置,530ms 内不会提前恢复闪', () => {
        const view = drawView('abc')
        const layer = view.dom.querySelector('.cm-cursorLayer')!
        for (let i = 0; i < 5; i++) {
            const len = view.state.doc.length
            view.dispatch(view.state.update({ changes: { from: len, insert: 'x' }, selection: EditorSelection.single(len + 1) }))
            vi.advanceTimersByTime(400) // < 530,每键都续命
        }
        expect(layer.classList.contains('cm-typing')).toBe(true) // 连打途中恒亮
        vi.advanceTimersByTime(530 + 10) // 停手足够久
        expect(layer.classList.contains('cm-typing')).toBe(false)
        view.destroy()
    })

    it('纯选区移动(无 docChanged)也恒亮 —— 按住方向键光标不闪,同 Monaco', () => {
        const view = drawView('abcdef')
        const layer = view.dom.querySelector('.cm-cursorLayer')!
        expect(layer.classList.contains('cm-typing')).toBe(false)
        for (let i = 1; i <= 5; i++) {
            view.dispatch(view.state.update({ selection: EditorSelection.single(i) }))
            vi.advanceTimersByTime(35) // 按键重复间隔
            expect(layer.classList.contains('cm-typing')).toBe(true)
        }
        vi.advanceTimersByTime(530 + 10) // 松手后恢复闪
        expect(layer.classList.contains('cm-typing')).toBe(false)
        view.destroy()
    })

    it('没有选区变化的事务(只改 effects)不影响闪烁', () => {
        const view = drawView('abc')
        const layer = view.dom.querySelector('.cm-cursorLayer')!
        view.dispatch(view.state.update({}))
        expect(layer.classList.contains('cm-typing')).toBe(false)
        view.destroy()
    })
})
