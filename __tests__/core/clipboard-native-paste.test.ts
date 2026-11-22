// ⌘V / ⇧Insert 走浏览器原生 paste 事件,不在 keydown 里读 navigator.clipboard.readText()。
// 真浏览器里的证据(scripts/browser-diff/clipboard.mjs,NOPERM=1 = Chromium 不授权剪贴板,即普通网页的默认状态):
// 旧实现 ⌘V 什么都不粘(readText 被拒),Monaco 能粘;Safari/Firefox 的 readText 还会弹「粘贴」气泡。
import { describe, expect, it, vi } from 'vitest'
import { mount, setMacPlatform } from './f5-replay'

setMacPlatform()
const lm = await import('../../src/litemonaco')
const core = await import('../../src/core/index')
const { buildDefaultKeymap } = await import('../../src/core/edit/keymap')

describe('粘贴键不在 keymap 里认领', () => {
    for (const plat of ['mac', 'win', 'linux'] as const) {
        it(`${plat}:没有 Mod-v / Shift-Insert 绑定;复制和剪切(写剪贴板不要权限)仍在`, () => {
            const keys = buildDefaultKeymap(plat).map(b => b.key)
            expect(keys).not.toContain('Mod-v')
            expect(keys).not.toContain('Shift-Insert')
            expect(keys).toContain('Mod-c')
            expect(keys).toContain('Mod-x')
        })
    }
})

describe('⌘V 的 keydown 不被拦、不读剪贴板', () => {
    it('keydown 未 preventDefault(浏览器随后发原生 paste 事件);readText 一次都没调', () => {
        const readText = vi.fn(async () => 'X')
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText, writeText: async () => {} } })
        const r = mount({ lm, core }, { doc: 'a‸b' })
        try {
            const e = r.press('Meta+v')
            expect(e.defaultPrevented).toBe(false)
        } finally { r.destroy() }
        // f5-replay 会替浏览器补发 paste 事件,它读的是同一个替身;这里只断言 lite 自己没有在 keydown 里同步读
        expect(readText).toHaveBeenCalledTimes(1) // 仅 f5-replay 的补发那一次
    })

    it('原生 paste 事件:clipboardData 的文本进文档,不需要任何异步读取', () => {
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
        const r = mount({ lm, core }, { doc: 'a‸b' })
        try {
            const pe = new Event('paste', { bubbles: true, cancelable: true })
            Object.defineProperty(pe, 'clipboardData', { value: { types: ['text/plain'], getData: (t: string) => (t === 'text/plain' ? 'XYZ' : '') } })
            r.view.contentDOM.dispatchEvent(pe)
            expect(pe.defaultPrevented).toBe(true)
            expect(r.result()).toBe('aXYZ‸b')
        } finally { r.destroy() }
    })

    it('只读:原生 paste 被拦并弹 Cannot edit in read-only editor', () => {
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
        const r = mount({ lm, core }, { doc: 'a‸b', readOnly: true })
        try {
            document.querySelectorAll('.cm-readonly-message').forEach(el => el.remove())
            const pe = new Event('paste', { bubbles: true, cancelable: true })
            Object.defineProperty(pe, 'clipboardData', { value: { types: ['text/plain'], getData: () => 'ZZ' } })
            r.view.contentDOM.dispatchEvent(pe)
            expect(pe.defaultPrevented).toBe(true)
            expect(document.querySelector('.cm-readonly-message')?.textContent).toContain('Cannot edit in read-only editor')
            expect(r.result()).toBe('a‸b')
        } finally { r.destroy() }
    })
})
