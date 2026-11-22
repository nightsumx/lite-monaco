// executeEdits / executeCommand(s) / model.applyEdits / pushEditOperations / model.undo/redo 的视图更新同 trigger 合并:
// 一个同步任务里的多笔编辑,state / model / 事件同步更新,DOM 只在微任务里画一次;读几何的 API 先把攒着的画掉。
// setValue 之类整体替换照旧同步画。
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from './h1-helpers'

const tick = () => new Promise<void>(r => queueMicrotask(r))
let done: (() => void) | null = null
afterEach(() => { done?.(); done = null })

function rig(doc = 'one\ntwo\nthree\nfour') {
    const m = mount({ doc })
    done = m.done
    const ed = m.ed as any
    const render = vi.spyOn(ed, 'renderTransaction')
    const text = () => (ed.contentDOM as HTMLElement).textContent
    return { ed, render, text }
}
const at = (line: number, col: number) => ({ startLineNumber: line, startColumn: col, endLineNumber: line, endColumn: col })

describe('API 编辑的视图更新合并', () => {
    it('N 次 executeEdits:内容事件、getValue 同步,视图只画一次', async () => {
        const { ed, render, text } = rig()
        const evs: number[] = []
        ed.onDidChangeModelContent((e: any) => evs.push(e.versionId))
        render.mockClear()
        for (let i = 0; i < 40; i++) ed.executeEdits('t', [{ range: at(2, 1), text: 'z' }])
        expect(ed.getModel().getLineContent(2)).toBe('z'.repeat(40) + 'two')
        expect(evs.length).toBe(40)
        expect(render).toHaveBeenCalledTimes(0)
        await tick()
        expect(render).toHaveBeenCalledTimes(1)
        expect(text()).toContain('z'.repeat(40) + 'two')
    })

    it('model.applyEdits / pushEditOperations / undo / redo 同样合并', async () => {
        const { ed, render, text } = rig()
        const model = ed.getModel()
        render.mockClear()
        for (let i = 0; i < 10; i++) model.applyEdits([{ range: at(1, 1), text: 'a' }])
        model.pushEditOperations([], [{ range: at(3, 1), text: 'P' }], () => null)
        expect(render).toHaveBeenCalledTimes(0)
        await tick()
        expect(render).toHaveBeenCalledTimes(1)
        expect(text()).toContain('aaaaaaaaaaone')
        expect(text()).toContain('Pthree')
        render.mockClear()
        model.undo()
        expect(model.getLineContent(3)).toBe('three')
        expect(render).toHaveBeenCalledTimes(0)
        model.redo()
        await tick()
        expect(render).toHaveBeenCalledTimes(1)
        expect(text()).toContain('Pthree')
    })

    it('executeEdits 之后马上读几何:先同步画掉,读到新状态', () => {
        const { ed, render, text } = rig()
        const h0 = ed.getScrollHeight()
        render.mockClear()
        ed.executeEdits('t', [{ range: at(4, 5), text: '\nfive\nsix\nseven' }])
        expect(render).toHaveBeenCalledTimes(0)
        expect(ed.getTopForLineNumber(7)).toBeGreaterThan(ed.getTopForLineNumber(6))
        expect(render).toHaveBeenCalledTimes(1)
        expect(ed.getScrollHeight()).toBeGreaterThanOrEqual(h0)
        expect(text()).toContain('seven')
    })

    it('setValue 照旧同步画', () => {
        const { ed, text } = rig()
        ed.getModel().setValue('alpha\nbeta')
        expect(text()).toContain('beta')
    })

    it('trigger 与 executeEdits 混在一个任务里:仍只画一次,撤销边界不变', async () => {
        const { ed, render, text } = rig()
        ed.setPosition({ lineNumber: 1, column: 1 })
        render.mockClear()
        ed.trigger('kb', 'type', { text: 'k' })
        ed.executeEdits('t', [{ range: at(2, 1), text: 'e' }])
        ed.trigger('kb', 'type', { text: 'k' })
        expect(render).toHaveBeenCalledTimes(0)
        await tick()
        expect(render).toHaveBeenCalledTimes(1)
        expect(text()).toContain('kkone')
        expect(text()).toContain('etwo')
    })
})
