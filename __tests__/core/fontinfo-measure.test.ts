// 字体度量对齐 Monaco(真 Chromium 实测:10k 长行 lite 比 Monaco 差 2px,根因不是 stopRenderingLineAfter,
// 而是 ① 量字宽读的是小数的 getBoundingClientRect,Monaco 读整数的 offsetWidth/256;② 创建时没布局的估算值挂进文档后一直没换成实测值)。
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as monaco from '../../src/index'
import { measureFontInfo, clearFontCache } from '../../src/core/view/fontinfo'
import { fakeHl, QUIET } from './h1-helpers'

const cleanups: (() => void)[] = []
afterEach(() => { for (const c of cleanups.splice(0)) c(); clearFontCache() })

const bare = { pixelRatio: 1, fontFamily: 'monospace', fontWeight: 'normal', fontSize: 14, fontFeatureSettings: '', fontVariationSettings: '', lineHeight: 20, letterSpacing: 0 } as never

describe('measureFontInfo 读法与 Monaco charWidthReader 一致', () => {
    it('宽度 = offsetWidth(取整)/ 256,而不是小数的 getBoundingClientRect', () => {
        // 256 个 n:真实宽 2157.9(小数),offsetWidth 取整 2158 → 8.4296875
        const ow = vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(2158)
        const bc = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ width: 2157.9, height: 20, top: 0, left: 0, right: 2157.9, bottom: 20, x: 0, y: 0, toJSON() {} } as DOMRect)
        cleanups.push(() => { ow.mockRestore(); bc.mockRestore() })
        const host = document.createElement('div'); document.body.appendChild(host); cleanups.push(() => host.remove())
        const fi = measureFontInfo(bare, host)!
        expect(fi.typicalHalfwidthCharacterWidth).toBe(2158 / 256)
        expect(fi.typicalHalfwidthCharacterWidth).toBe(8.4296875)
    })
    it('offsetWidth 为 0(没有布局,jsdom)退回矩形宽', () => {
        const bc = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ width: 2048, height: 20, top: 0, left: 0, right: 2048, bottom: 20, x: 0, y: 0, toJSON() {} } as DOMRect)
        cleanups.push(() => bc.mockRestore())
        const host = document.createElement('div'); document.body.appendChild(host); cleanups.push(() => host.remove())
        expect(measureFontInfo(bare, host)!.typicalHalfwidthCharacterWidth).toBe(8)
    })
})

describe('创建时没布局的估算字体,有布局后自动换成实测值(getOption(fontInfo).isTrusted)', () => {
    it('下一帧有了布局 → fontInfo 变成 trusted 且是实测宽', async () => {
        const host = document.createElement('div'); document.body.appendChild(host); cleanups.push(() => host.remove())
        // 创建那一刻没有布局:offsetWidth 全 0
        let laid = false
        const ow = vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
            return laid ? (this.firstChild?.nodeType === 3 && (this.textContent ?? '').length === 256 ? 2158 : 800) : 0
        })
        cleanups.push(() => ow.mockRestore())
        const ed = monaco.editor.create(host, { highlighter: fakeHl(), value: 'abc', language: 'text', features: QUIET })
        cleanups.push(() => { try { ed.dispose() } catch { /* */ } })
        const fi = () => ed.getOption(monaco.editor.EditorOption.fontInfo) as { isTrusted: boolean, typicalHalfwidthCharacterWidth: number }
        expect(fi().isTrusted).toBe(false)
        laid = true
        await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())))
        expect(fi().isTrusted).toBe(true)
        expect(fi().typicalHalfwidthCharacterWidth).toBe(8.4296875)
    })
})
