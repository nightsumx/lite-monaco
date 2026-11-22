// 第六轮 H 组:命令面板键帽在 Win/Linux 上照 Monaco UILabelProvider 写方向键。
// usLayoutResolvedKeybinding._keyCodeToUILabel:只有 Mac 把方向键画成 ←↑→↓,别的平台用 KeyCodeUtils.toString
// → 'UpArrow' / 'DownArrow';修饰键 Ctrl / Shift / Alt,'+' 连接。所以 Copy Line Up 在 Windows 是 'Shift+Alt+UpArrow'。
// 平台开关:改 navigator.platform 后重新加载模块(commandpalette 在加载时读平台)。
import { afterAll, describe, expect, it, vi } from 'vitest'

const orig = window.navigator.platform

async function keysOn(platform: string) {
    Object.defineProperty(window.navigator, 'platform', { value: platform, configurable: true })
    vi.resetModules()
    const { defaultPaletteCommands } = await import('../../src/core/feature/commandpalette')
    const { keybindingAriaLabel } = await import('../../src/core/feature/overlay')
    const map = new Map(defaultPaletteCommands().map(c => [c.id, c.keybinding]))
    return { map, keybindingAriaLabel }
}

afterAll(() => {
    Object.defineProperty(window.navigator, 'platform', { value: orig, configurable: true })
    vi.resetModules()
})

describe('命令面板方向键键帽(Monaco UILabelProvider)', () => {
    for (const platform of ['Win32', 'Linux x86_64']) {
        it(`${platform}:方向键写成 UpArrow / DownArrow`, async () => {
            const { map, keybindingAriaLabel } = await keysOn(platform)
            // 第七轮:Linux 的 Copy Line 是 Ctrl+Shift+Alt+↑↓、Add Cursor 是 Shift+Alt+↑↓(Monaco kbOpts.linux)
            const linux = platform.startsWith('Linux')
            expect(map.get('copyLineUp')).toBe(linux ? 'Ctrl+Shift+Alt+UpArrow' : 'Shift+Alt+UpArrow')
            expect(map.get('copyLineDown')).toBe(linux ? 'Ctrl+Shift+Alt+DownArrow' : 'Shift+Alt+DownArrow')
            expect(map.get('moveLineUp')).toBe('Alt+UpArrow')
            expect(map.get('moveLineDown')).toBe('Alt+DownArrow')
            expect(map.get('cursorAbove')).toBe(linux ? 'Shift+Alt+UpArrow' : 'Ctrl+Alt+UpArrow')
            expect(map.get('cursorBelow')).toBe(linux ? 'Shift+Alt+DownArrow' : 'Ctrl+Alt+DownArrow')
            for (const k of map.values()) expect(k ?? '').not.toMatch(/[←↑→↓]/)
            // 读屏写法(AriaLabelProvider):Ctrl → Control,其余照旧
            expect(keybindingAriaLabel('Shift+Alt+UpArrow')).toBe('Shift+Alt+UpArrow')
            expect(keybindingAriaLabel('Ctrl+Alt+DownArrow')).toBe('Control+Alt+DownArrow')
        })
    }
    it('Mac:照旧画符号 ⇧⌥↑', async () => {
        const { map } = await keysOn('MacIntel')
        expect(map.get('copyLineUp')).toBe('⇧⌥↑')
        expect(map.get('moveLineDown')).toBe('⌥↓')
        expect(map.get('cursorAbove')).toBe('⌥⌘↑')
    })
})
