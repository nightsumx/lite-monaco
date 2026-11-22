// 第五轮 O 组:补全列表随编辑器滚动的行为对齐 Monaco 0.52。
// Monaco 实测(/tmp/lc-hunt/r5/O/m-suggest-scroll.ts,编辑器 top=200 bottom=720):
// - 滚动时列表跟着光标走,上下方向和高度不变(content widget 的 preference 只在 layout 时定,滚动只重放位置),
//   所以上方的列表可以伸出编辑器顶(光标 299 → 列表 top 55),下方的同理伸出编辑器底
// - 光标行整行滚出视口 → 列表 visibility:hidden,会话不关;滚回来原样出现
// - 再打字(新的 layout)才重新挑上下
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { COMPLETION_VISIBLE_ROWS } from '../../src/core/feature/suggestwidget'
import { mountSuggest, cleanupSuggest, fixedProvider, type SuggestRig } from './_suggest-harness'

const frames = () => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())))
const rect = (top: number, bottom: number, left = 16, right = 756) =>
    ({ top, bottom, left, right, width: right - left, height: bottom - top, x: left, y: top, toJSON() {} }) as DOMRect

describe('补全列表随滚动(Monaco content widget)', () => {
    let rig: SuggestRig
    let view: SuggestRig['v']
    let caret: { left: number, top: number, bottom: number, height: number }
    const innerH = Object.getOwnPropertyDescriptor(window, 'innerHeight')

    beforeEach(() => {
        Object.defineProperty(window, 'innerHeight', { value: 760, configurable: true })
        rig = mountSuggest({ doc: 'v', providers: [['plaintext', fixedProvider(Array.from({ length: 20 }, (_, i) => `v${i}`))]] })
        view = rig.v
        view.dom.getBoundingClientRect = () => rect(200, 720)
        view.scrollDOM.getBoundingClientRect = () => rect(200, 720)
        caret = { left: 223, top: 599, bottom: 619, height: 20 }
        view.caretCoords = () => ({ ...caret })
    })
    afterEach(() => {
        cleanupSuggest()
        document.querySelectorAll('.cm-completionList').forEach(n => n.remove())
        if (innerH) Object.defineProperty(window, 'innerHeight', innerH)
    })

    const rowH = () => { const lh = view.oracle?.lineHeight; return lh && lh > 4 ? Math.round(lh) : 20 }
    const list = () => document.querySelector('.cm-completionList') as HTMLElement
    const box = () => ({ top: parseFloat(list().style.top), height: parseFloat(list().style.height), vis: list().style.visibility })
    const scrollTo = async (top: number) => {
        caret = { ...caret, top, bottom: top + 20 }
        view.scrollDOM.dispatchEvent(new Event('scroll'))
        await frames()
    }
    const open = async () => {
        rig.trigger()
        await rig.waitOpen()
        await frames()
    }

    it('上方的列表滚动时留在上方、高度不变,可伸出编辑器顶', async () => {
        await open()
        // 满 12 行(jsdom 行高 14 → 170;Monaco 页面 20 → 242);下方只剩 101 → 放上方:底 = 光标顶 - 2
        const H = COMPLETION_VISIBLE_ROWS * rowH() + 2
        expect(box()).toEqual({ top: 599 - 2 - H, height: H, vis: 'visible' })
        await scrollTo(449)
        expect(box()).toEqual({ top: 449 - 2 - H, height: H, vis: 'visible' })
        await scrollTo(299) // 下方已有 401 放得下,Monaco 仍在上方(伸出编辑器顶 200)
        expect(box()).toEqual({ top: 299 - 2 - H, height: H, vis: 'visible' })
    })

    it('下方的列表滚动时留在下方、高度不变,可伸出编辑器底', async () => {
        caret = { left: 223, top: 301, bottom: 321, height: 20 }
        await open()
        const H = COMPLETION_VISIBLE_ROWS * rowH() + 2
        expect(box()).toEqual({ top: 321, height: H, vis: 'visible' })
        await scrollTo(651) // 下方只剩 49,Monaco 不缩不翻
        expect(box()).toEqual({ top: 671, height: H, vis: 'visible' })
    })

    it('光标行滚出视口 → 隐藏(会话不关);滚回来按原方向出现', async () => {
        await open()
        await scrollTo(151) // 行 151–171 整行在编辑器顶 200 之上
        expect(box().vis).toBe('hidden')
        expect(rig.open).toBe(true)
        await scrollTo(299)
        const H = COMPLETION_VISIBLE_ROWS * rowH() + 2
        expect(box()).toEqual({ top: 299 - 2 - H, height: H, vis: 'visible' })
    })

    it('再打字(新 layout)才重新挑上下', async () => {
        await open()
        await scrollTo(299)
        expect(box().top).toBe(299 - 2 - (COMPLETION_VISIBLE_ROWS * rowH() + 2))
        view.dispatch(view.state.update({ changes: { from: 1, insert: '1' }, selection: { anchor: 2 }, userEvent: 'input.type' }))
        await frames()
        expect(box().top).toBe(319) // 下方放得下 → 回到下方
    })
})
