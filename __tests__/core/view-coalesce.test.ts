// 一个同步任务里的多笔 trigger:state / 模型 / 事件同步更新,视图(DOM、选区层、overlay)合成一次,在微任务里画。
// 读几何的 API、浏览器的输入事件进来之前,攒着的先画掉。
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from './h1-helpers'
import { StateEffect } from '../../src/core/index'

const mark = StateEffect.define<number>()

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

describe('一帧内合并视图更新', () => {
    it('N 次 trigger(type):state 和内容事件同步,视图只画一次(微任务里)', async () => {
        const { ed, render, text } = rig()
        ed.setPosition({ lineNumber: 1, column: 1 })
        const evs: number[] = []
        ed.onDidChangeModelContent((e: any) => evs.push(e.versionId))
        const views: number[] = []
        ed.onViewUpdate(() => views.push(1))
        render.mockClear()
        for (let i = 0; i < 50; i++) ed.trigger('kb', 'type', { text: 'x' })
        // 同步可见:文档、光标、内容事件都已到位
        expect(ed.getValue().startsWith('x'.repeat(50) + 'one')).toBe(true)
        expect(ed.getPosition()).toMatchObject({ lineNumber: 1, column: 51 })
        expect(evs.length).toBe(50)
        // 视图还没画
        expect(render).toHaveBeenCalledTimes(0)
        expect(views.length).toBe(0)
        await tick()
        expect(render).toHaveBeenCalledTimes(1)
        expect(views.length).toBe(1)
        expect(text()).toContain('x'.repeat(50) + 'one')
    })

    it('trigger 之间夹着 pushStackElement(纯注解事务)不打断合并,撤销边界照旧', async () => {
        const { ed, render } = rig()
        ed.setPosition({ lineNumber: 1, column: 1 })
        render.mockClear()
        for (let i = 0; i < 6; i++) { ed.trigger('kb', 'type', { text: 'y' }); if (i % 2 === 1) ed.getModel().pushStackElement() }
        expect(render).toHaveBeenCalledTimes(0)
        await tick()
        expect(render).toHaveBeenCalledTimes(1)
        ed.trigger('kb', 'undo')
        expect(ed.getValue().startsWith('yyyyone')).toBe(true)
    })

    it('trigger 之后马上读几何:先同步画掉,读到的是新状态', () => {
        const { ed, render, text } = rig()
        ed.setPosition({ lineNumber: 4, column: 5 })
        const h0 = ed.getScrollHeight()
        render.mockClear()
        ed.trigger('kb', 'type', { text: '\nfive\nsix' })
        expect(render).toHaveBeenCalledTimes(0)
        // 几何 API 先把攒着的画掉
        expect(ed.getScrollHeight()).toBeGreaterThanOrEqual(h0)
        expect(render).toHaveBeenCalledTimes(1)
        expect(text()).toContain('six')
        expect(ed.getTopForLineNumber(6)).toBeGreaterThan(ed.getTopForLineNumber(5))
        expect(ed.getScrolledVisiblePosition({ lineNumber: 6, column: 4 })).toBeTruthy()
    })

    it('攒着时来了原生输入事件:处理器之前已画好(DOM 与 state 一致)', () => {
        const { ed, render, text } = rig()
        ed.setPosition({ lineNumber: 1, column: 1 })
        render.mockClear()
        ed.trigger('kb', 'type', { text: 'abc' })
        expect(render).toHaveBeenCalledTimes(0)
        let seen = ''
        const cd = ed.contentDOM as HTMLElement
        const probe = () => { seen = cd.textContent || '' }
        cd.addEventListener('keydown', probe, true)
        cd.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift', bubbles: true }))
        cd.removeEventListener('keydown', probe, true)
        expect(render).toHaveBeenCalledTimes(1)
        expect(seen).toContain('abcone')
        // 浏览器自己改了 DOM(原生输入)再 flush:从已画好的 DOM 读出差异,接在合并之后
        ed.observer.flush()
        expect(text()).toContain('abcone')
        expect(ed.getValue().startsWith('abcone')).toBe(true)
    })

    it('不在 deferView 里的事务照旧同步画;带 effects 的事务先把攒着的画掉再画自己', async () => {
        const { ed, render } = rig()
        ed.setPosition({ lineNumber: 1, column: 1 })
        render.mockClear()
        // 直接 dispatch(不经 trigger / executeEdits / model 编辑这些合并入口)照旧同步画
        ed.dispatch(ed.state.update({ changes: { from: 0, insert: 'Q' } }))
        expect(render).toHaveBeenCalledTimes(1)
        render.mockClear()
        ed.trigger('kb', 'type', { text: 'z' })
        expect(render).toHaveBeenCalledTimes(0)
        ed.deferView(() => ed.dispatch(ed.state.update({ effects: mark.of(1) })))
        // 攒着的一次 + effects 自己一次;攒着的那次先画(effects 的消费者读的是已画好的视图)
        expect(render).toHaveBeenCalledTimes(2)
        expect(render.mock.calls[0][1]).toBe(true)
        expect(ed.viewPending).toBeNull()
        await tick()
        expect(render).toHaveBeenCalledTimes(2)
    })

    it('组字中的事务不合并', () => {
        const { ed, render } = rig()
        ed.setPosition({ lineNumber: 1, column: 1 })
        const cd = ed.contentDOM as HTMLElement
        cd.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
        render.mockClear()
        expect(ed.observer.composing).toBe(true)
        ed.trigger('kb', 'type', { text: 'k' })
        expect(render).toHaveBeenCalledTimes(1)
        cd.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' }))
    })
})
