// 第 2 轮 F6b 主题映射(Monaco 0.52 colorRegistry / listColors,同一份主题 JSON 喂给 Monaco 实测,见 /tmp/lc-hunt/fix2/f6b/themejson.ts)
import { describe, it, expect } from 'vitest'
import { themeColor, unnecessaryOpacity } from '../../src/product/theme'
import { liteMonacoBaseCSS } from '../../src/product/themecss'

const dark = { bg: '#1e1e1e', fg: '#d4d4d4', dark: true }
const light = { bg: '#ffffff', fg: '#000000', dark: false }

describe('主题键', () => {
    it('focusHighlightForeground:ifDefinedThenElse(activeSelectionBackground 定义了 → highlightForeground,否则 #bbe7ff)', () => {
        expect(themeColor(light, 'editorSuggestWidget.focusHighlightForeground')?.toLowerCase()).toBe('#bbe7ff')
        expect(themeColor({ ...light, vscode: { 'list.activeSelectionBackground': '#0060c0' } }, 'editorSuggestWidget.focusHighlightForeground')?.toLowerCase())
            .toBe(themeColor(light, 'list.highlightForeground')?.toLowerCase())
        expect(themeColor(dark, 'list.focusHighlightForeground')?.toLowerCase()).toBe('#2aaaff')
    })
    it('selectedIconForeground:回退 selectedForeground,聚焦行图标用它', () => {
        expect(themeColor({ ...light, vscode: { 'editorSuggestWidget.selectedForeground': '#ffffff' } }, 'editorSuggestWidget.selectedIconForeground')).toBe('#ffffff')
        expect(liteMonacoBaseCSS('mac')).toContain('.cm-completionSelected .cm-completionIcon { color: var(')
    })
    it('findRangeHighlightBackground 默认值;unnecessary 透明度 #000000aa / #00000077', () => {
        expect(themeColor(dark, 'editor.findRangeHighlightBackground')).toBe('rgba(58,61,65,0.4)')
        expect(themeColor(light, 'editor.findRangeHighlightBackground')).toBe('rgba(180,180,180,0.3)')
        expect(unnecessaryOpacity(dark)).toBeCloseTo(0xaa / 255, 3)
        expect(unnecessaryOpacity(light)).toBeCloseTo(0x77 / 255, 3)
    })
})
