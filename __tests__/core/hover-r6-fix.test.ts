// 第六轮 H 组:hover 卡按「行盒」定位,不按光标字形盒。
// Monaco content widget 的锚点是视觉行 [行顶, 行顶+行高]:上方卡底 = 行顶、下方卡顶 = 行底。
// lite-monaco 原先拿 caretCoords(15px 字形盒,Chrome 里顶在行顶 +2):下方卡顶 = 行顶 +15(Monaco +20),上方卡底低 2px。
// 实测 /tmp/lc-hunt/r6/H/hover-place.ts(20px 行高):第 13 行 M 卡 [250,422] 行 [422,442];修前 L 卡 [252,424]。
import { describe, expect, it } from 'vitest'
import { showHover, hoverSources } from '../../src/core/feature/hover'
import { EditorState } from '../../src/core/model/state'
import { EditorView } from '../../src/core/view/editorview'

function rect(left: number, top: number, width: number, height: number) {
    return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() {} } as DOMRect
}

async function cardTop(glyph: { top: number, bottom: number }, blockTop: number) {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const view = new EditorView({
        state: EditorState.create({ doc: 'foo bar', extensions: [hoverSources.of(() => ({ pos: 0, end: 3, create: () => document.createElement('div') }))] }),
        parent: host,
    })
    view.oracle.lineHeight = 20
    ;(view as unknown as { caretCoords: () => unknown }).caretCoords = () => ({ left: 100, top: glyph.top, bottom: glyph.bottom, height: glyph.bottom - glyph.top })
    ;(view as unknown as { lineBlockAt: () => unknown }).lineBlockAt = () => ({ from: 0, to: 7, top: blockTop, bottom: blockTop + 20, height: 20 })
    view.dom.getBoundingClientRect = () => rect(0, 182, 800, 518)
    view.contentDOM.getBoundingClientRect = () => rect(0, 182, 800, 2000)
    const orig = HTMLElement.prototype.getBoundingClientRect
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
        if (this.classList.contains('cm-tooltip-hover')) return rect(0, 0, 300, 172)
        return orig.call(this)
    }
    Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true })
    try {
        await showHover(view)
        const root = view.dom.querySelector('.cm-tooltip-hover') as HTMLElement
        return { top: root.style.top, fixed: root.style.position === 'fixed' }
    }
    finally {
        HTMLElement.prototype.getBoundingClientRect = orig
        view.destroy()
        host.remove()
    }
}

describe('hover 卡按行盒定位(Monaco)', () => {
    it('下方:卡顶 = 行底(行顶 +20),不是字形底(+15)', async () => {
        // 行 [182,202],字形 [184,199];上方 152 放不下 172 → 下方
        const r = await cardTop({ top: 184, bottom: 199 }, 0)
        expect(r.fixed).toBe(false)
        expect(r.top).toBe('20px')
    })
    it('上方:卡底 = 行顶,不是字形顶(低 2px)', async () => {
        // 行 [422,442](块顶 240,内容盒顶 182),字形 [424,439]
        const r = await cardTop({ top: 424, bottom: 439 }, 240)
        expect(r.top).toBe(`${422 - 172 - 182}px`)
    })
})
