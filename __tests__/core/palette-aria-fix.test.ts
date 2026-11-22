// 第五轮 O 组:命令面板行的 aria-label 里快捷键用 Monaco AriaLabelProvider 的写法
// (Mac:Control / Shift / Option / Command,'+' 连接,方向键 UpArrow…;和弦空格分隔),键帽仍画符号(UILabelProvider)。
// 期望值来自对照页实测 /tmp/lc-hunt/r5/O/m-aria.ts。
import { describe, expect, it } from 'vitest'
import { setMacPlatform } from './f5-replay'

setMacPlatform()
const { liteMonaco } = await import('../../src/litemonaco')
const { keybindingAriaLabel } = await import('../../src/core/feature/overlay')
const { openCommandPalette } = await import('../../src/core/feature/commandpalette')

const hl = {
    codeToTokens: (code: string) => ({ tokens: code.split('\n').map(l => [{ content: l, offset: 0 }]) }),
    getLastGrammarState: () => ({ getScopes: () => undefined }),
    getLoadedLanguages: () => ['typescript', 'text'],
    getTheme: () => ({ bg: '#1e1e1e', fg: '#d4d4d4', type: 'dark' as const }),
}

describe('命令面板快捷键 aria 写法', () => {
    it('Mac 符号 → Monaco aria 长写', () => {
        expect(keybindingAriaLabel('⌘K ⌘,')).toBe('Command+K Command+,')
        expect(keybindingAriaLabel('⌥⌘[')).toBe('Option+Command+[')
        expect(keybindingAriaLabel('⌃G')).toBe('Control+G')
        expect(keybindingAriaLabel('⇧⌥↑')).toBe('Shift+Option+UpArrow')
        expect(keybindingAriaLabel('⌃⇧⌘→')).toBe('Control+Shift+Command+RightArrow')
        expect(keybindingAriaLabel('⌘Backspace')).toBe('Command+Backspace')
        expect(keybindingAriaLabel('⇧⌘\\')).toBe('Shift+Command+\\')
        expect(keybindingAriaLabel('⌘K ⇧⌘L')).toBe('Command+K Shift+Command+L')
        expect(keybindingAriaLabel('F1')).toBe('F1')
        expect(keybindingAriaLabel('⌘.')).toBe('Command+.')
    })

    it('Win/Linux 写法:Ctrl → Control,方向键换名字', () => {
        expect(keybindingAriaLabel('Ctrl+Shift+O')).toBe('Control+Shift+O')
        expect(keybindingAriaLabel('Shift+Alt+↓')).toBe('Shift+Alt+DownArrow')
        expect(keybindingAriaLabel('Ctrl+K Ctrl+L')).toBe('Control+K Control+L')
        expect(keybindingAriaLabel('Ctrl++')).toBe('Control++')
    })

    it('面板行:aria-label = 「名字, 快捷键 aria」,键帽仍是符号', () => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const view = liteMonaco({ parent, highlighter: hl as never, doc: 'x', lang: 'text', features: { minimap: false, autocomplete: false, hover: false, stickyScroll: false } })
        openCommandPalette(view, [{ id: 'h', label: 'Show or Focus Hover', keybinding: '⌘K ⌘I', run: () => {} }])
        const row = view.dom.querySelector('.cm-quick-input-row')!
        expect(row.getAttribute('aria-label')).toBe('Show or Focus Hover, Command+K Command+I')
        expect([...row.querySelectorAll('.cm-keybinding-key')].map(k => k.textContent)).toEqual(['⌘', 'K', '⌘', 'I'])
        view.destroy()
        parent.remove()
    })
})
