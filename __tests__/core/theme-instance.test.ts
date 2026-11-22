import { describe, expect, it } from 'vitest'
import { themeColor, resolveThemeColors, lineHighlight, tokenColorFor, type ThemeColors } from '../../src/product/theme'
import { liteMonacoBaseCSS, themeVars, ensureBaseCSS } from '../../src/product/themecss'
import { inheritThemeVars } from '../../src/core/chrome/themevars'

// 主题按实例(P0-1)+ 浮层/外壳色从 VS Code 主题 colors 读(P1-12)+ 当前行(P2-13)。
// 期望值 = Monaco 0.52 实测 `--vscode-*`(/tmp/lc-hunt/f6/mvars.ts:vs-dark / vs / github-dark / github-light)。

const dark: ThemeColors = { bg: '#1e1e1e', fg: '#d4d4d4', dark: true }
const light: ThemeColors = { bg: '#ffffff', fg: '#000000', dark: false }
// shiki github-dark 的 colors 子集(原表)
const ghd: ThemeColors = {
    bg: '#24292e', fg: '#e1e4e8', dark: true,
    vscode: {
        'editorWidget.background': '#1f2428',
        'editor.lineHighlightBackground': '#2b3036',
        'editorLineNumber.activeForeground': '#e1e4e8',
        'focusBorder': '#005cc5',
        'list.hoverBackground': '#282e34',
        'dropdown.background': '#2f363d',
        'dropdown.foreground': '#e1e4e8',
        'editorCursor.foreground': '#c8e1ff',
        'list.activeSelectionBackground': '#39414a',
    },
}

describe('themeColor:宿主 → 主题 colors → 回退链 → registry 默认', () => {
    it('Dark+/Light+ 默认值(主题没给 colors 时)', () => {
        expect(themeColor(dark, 'editorWidget.background')).toBe('#252526')
        expect(themeColor(light, 'editorWidget.background')).toBe('#f3f3f3')
        expect(themeColor(dark, 'editorSuggestWidget.selectedBackground')).toBe('#04395e')
        expect(themeColor(light, 'menu.background')).toBe('#ffffff')
        expect(themeColor(dark, 'menu.background')).toBe('#3c3c3c')
        expect(themeColor(dark, 'editorLineNumber.activeForeground')).toBe('#c6c6c6')
        expect(themeColor(light, 'editorLineNumber.foreground')).toBe('#237893')
    })
    it('主题 colors 生效,并沿 VS Code 回退链派生(suggest ← editorWidget,menu ← dropdown)', () => {
        expect(themeColor(ghd, 'editorWidget.background')).toBe('#1f2428')
        expect(themeColor(ghd, 'editorSuggestWidget.background')).toBe('#1f2428')
        expect(themeColor(ghd, 'editorHoverWidget.background')).toBe('#1f2428')
        expect(themeColor(ghd, 'menu.background')).toBe('#2f363d')
        expect(themeColor(ghd, 'menu.foreground')).toBe('#e1e4e8')
        expect(themeColor(ghd, 'editorSuggestWidget.selectedBackground')).toBe('#39414a')
        expect(themeColor(ghd, 'menu.selectionBackground')).toBe('#39414a')
        expect(themeColor(ghd, 'editorCursor.foreground')).toBe('#c8e1ff')
        expect(themeColor(ghd, 'editorSuggestWidget.foreground')).toBe('#e1e4e8') // ← editor.foreground
    })
    it('宿主 shell/bg 优先于主题 colors', () => {
        const c: ThemeColors = { ...ghd, bg: '#000000', shell: { cursor: '#ff0000' } }
        expect(themeColor(c, 'editorCursor.foreground')).toBe('#ff0000')
        expect(themeColor(c, 'editor.background')).toBe('#000000')
        expect(themeColor(c, 'minimap.background')).toBe('#000000')
    })
    it('resolveThemeColors:宿主 colors 覆盖逐项合并,主题 colors 表保留', () => {
        const hl = { getTheme: () => ({ bg: '#24292e', fg: '#e1e4e8', type: 'dark' as const, colors: { 'editorWidget.background': '#1f2428' }, settings: [{ scope: ['keyword'], settings: { foreground: '#f97583' } }] }) }
        const c = resolveThemeColors(hl, 'github-dark', { bg: '#101010', fg: '#eeeeee', dark: true, vscode: { 'focusBorder': '#123456' } })
        expect(c.bg).toBe('#101010')
        expect(themeColor(c, 'editorWidget.background')).toBe('#1f2428')
        expect(themeColor(c, 'focusBorder')).toBe('#123456')
        expect(c.tokens?.keyword).toBe('#f97583')
    })
    it('tokenColorFor:点边界前缀,取最长', () => {
        const rules = [{ scope: 'entity', settings: { foreground: '#1' } }, { scope: ['entity.name.function'], settings: { foreground: '#2' } }, { scope: 'entity.name.functionx', settings: { foreground: '#3' } }]
        expect(tokenColorFor(rules, 'entity.name.function')).toBe('#2')
        expect(tokenColorFor(rules, 'entity.other')).toBe('#1')
    })
})

describe('当前行(Monaco renderLineHighlight line)', () => {
    it('主题没给背景 → 2px 边框 lineHighlightBorder(#282828 / #eeeeee)', () => {
        expect(lineHighlight(dark)).toEqual({ background: 'transparent', border: '#282828' })
        expect(lineHighlight(light)).toEqual({ background: 'transparent', border: '#eeeeee' })
    })
    it('主题给了背景 → 填背景,不画边框', () => {
        expect(lineHighlight(ghd)).toEqual({ background: '#2b3036', border: 'transparent' })
    })
    it('结构 CSS 有当前行、活动行号、活动缩进线规则', () => {
        const css = liteMonacoBaseCSS()
        // 底色铺每个视觉行,边框只在光标所在视觉行(Monaco current-line-exact)
        expect(css).toContain('.cm-currentLine { background: var(--lm-line-highlight-bg); }')
        expect(css).toContain('.cm-currentLine-exact { border: 2px solid var(--lm-line-highlight-border); }')
        expect(css).toContain('.cm-gutterElement.cm-activeLineGutter { color: var(--lm-editorLineNumber-activeForeground); }')
        expect(css).toContain('.cm-activeIndentGuide {')
    })
})

describe('结构 CSS 与颜色分离(同页多实例不串色)', () => {
    it('结构 CSS 不含任何主题色字面值(全走变量)', () => {
        const css = liteMonacoBaseCSS()
        for (const hex of ['#252526', '#264f78', '#aeafad', '#858585', '#3c3c3c', '#04395e', '#454545', '#c8c8c8', '#f3f3f3'])
            expect(css.includes(hex), hex).toBe(false)
    })
    it('暗/亮两份变量各自成立,互不依赖', () => {
        const a = themeVars(dark), b = themeVars(light)
        expect(a['--lm-editorWidget-background']).toBe('#252526')
        expect(b['--lm-editorWidget-background']).toBe('#f3f3f3')
        expect(a['--lm-editor-background']).toBe('#1e1e1e')
        expect(b['--lm-editor-background']).toBe('#ffffff')
    })
    it('.cm-editor 填满容器(height:100%;min-height:0)', () => {
        const css = liteMonacoBaseCSS()
        const at = css.indexOf('.cm-editor {')
        const body = css.slice(at, css.indexOf('}', at))
        expect(body).toContain('height: 100%')
        expect(body).toContain('min-height: 0')
    })
    it('tab-size 走 --lm-tab-size', () => {
        const css = liteMonacoBaseCSS()
        const at = css.indexOf('.cm-content {')
        expect(css.slice(at, css.indexOf('}', at))).toContain('tab-size: var(--lm-tab-size, 4)')
    })
    it('ensureBaseCSS 只注入一份;inheritThemeVars 把实例变量抄给浮层', () => {
        ensureBaseCSS(document)
        ensureBaseCSS(document)
        expect(document.querySelectorAll('#lite-monaco-base').length).toBe(1)
        const dom = document.createElement('div')
        dom.style.setProperty('--lm-menu-background', '#3c3c3c')
        dom.style.setProperty('color', 'red')
        const menu = document.createElement('div')
        inheritThemeVars({ dom }, menu)
        expect(menu.style.getPropertyValue('--lm-menu-background')).toBe('#3c3c3c')
        expect(menu.style.color).toBe('')
    })
})

// P2-18:行号区 / sticky 字号跟编辑器走(原先 .cm-gutterElement 写死 13px)。浏览器见 /tmp/lc-hunt/f6/gfont.ts
describe('gutter / sticky 字号', () => {
    const rule = (css: string, sel: string) => {
        const i = css.indexOf(sel + ' {')
        return i < 0 ? '' : css.slice(i, css.indexOf('}', i))
    }
    it('.cm-gutterElement 继承字体,不钉字号', () => {
        const r = rule(liteMonacoBaseCSS(), '.cm-gutterElement')
        expect(r).toMatch(/font:\s*inherit/)
        expect(r).not.toMatch(/font-size:\s*\d/)
    })
    it('sticky 行不钉字号', () => {
        const css = liteMonacoBaseCSS()
        for (const sel of ['.cm-sticky-scroll', '.cm-sticky-ln', '.cm-sticky-code']) expect(rule(css, sel)).not.toMatch(/font-size:\s*\d/)
    })
})

// G1:浮层新键的 registry 默认值 = Monaco 0.52 实测 --vscode-*(/tmp/lc-hunt/g1/mv.ts,vs-dark / vs / github-dark)
describe('浮层颜色键(keybindingLabel / rangeHighlight / 灯泡 / markdown / hover 状态栏)', () => {
    it('keybindingLabel.* 暗/亮', () => {
        expect(themeColor(dark, 'keybindingLabel.background')).toBe('rgba(128,128,128,0.17)')
        expect(themeColor(dark, 'keybindingLabel.foreground')).toBe('#cccccc')
        expect(themeColor(dark, 'keybindingLabel.border')).toBe('rgba(51,51,51,0.6)')
        expect(themeColor(dark, 'keybindingLabel.bottomBorder')).toBe('rgba(68,68,68,0.6)')
        expect(themeColor(light, 'keybindingLabel.background')).toBe('rgba(221,221,221,0.4)')
        expect(themeColor(light, 'keybindingLabel.foreground')).toBe('#555555')
        expect(themeColor(light, 'keybindingLabel.border')).toBe('rgba(204,204,204,0.4)')
        expect(themeColor(light, 'keybindingLabel.bottomBorder')).toBe('rgba(187,187,187,0.4)')
    })
    it('rangeHighlight / symbolHighlight(← findMatchHighlight)', () => {
        expect(themeColor(dark, 'editor.rangeHighlightBackground')).toBe('rgba(255,255,255,0.043)')
        expect(themeColor(light, 'editor.rangeHighlightBackground')).toBe('rgba(253,255,0,0.2)')
        expect(themeColor(dark, 'editor.symbolHighlightBackground')).toBe(themeColor(dark, 'editor.findMatchHighlightBackground'))
        const c: ThemeColors = { ...ghd, vscode: { ...ghd.vscode, 'editor.findMatchHighlightBackground': '#ffd33d22' } }
        expect(themeColor(c, 'editor.symbolHighlightBackground')).toBe('#ffd33d22')
    })
    it('灯泡、链接、代码块底色', () => {
        expect(themeColor(dark, 'editorLightBulb.foreground')).toBe('#ffcc00')
        expect(themeColor(light, 'editorLightBulb.foreground')).toBe('#ddb100')
        expect(themeColor(dark, 'editorLightBulbAutoFix.foreground')).toBe('#75beff')
        expect(themeColor(light, 'editorLightBulbAutoFix.foreground')).toBe('#007acc')
        expect(themeColor(dark, 'textLink.foreground')).toBe('#3794ff')
        expect(themeColor(light, 'textLink.activeForeground')).toBe('#006ab1')
        expect(themeColor(dark, 'textCodeBlock.background')).toBe('rgba(10,10,10,0.4)')
        expect(themeColor(light, 'textCodeBlock.background')).toBe('rgba(220,220,220,0.4)')
    })
    it('hover 状态栏 = hover 背景 lighten(0.2) / darken(0.05),取整同 Monaco', () => {
        expect(themeColor(dark, 'editorHoverWidget.statusBarBackground')).toBe('#2c2c2d')
        expect(themeColor(light, 'editorHoverWidget.statusBarBackground')).toBe('#e7e7e7')
        expect(themeColor(ghd, 'editorHoverWidget.statusBarBackground')).toBe('#252b30')
    })
    it('themeVars 带出新键和 hover 分隔线,暗/亮各自成立', () => {
        const a = themeVars(dark), b = themeVars(light)
        expect(a['--lm-keybindingLabel-background']).toBe('rgba(128,128,128,0.17)')
        expect(b['--lm-editor-rangeHighlightBackground']).toBe('rgba(253,255,0,0.2)')
        expect(a['--lm-hover-separator']).toBe('rgba(69,69,69,0.5)')
        expect(b['--lm-hover-separator']).toBe('rgba(200,200,200,0.5)')
    })
    it('结构 CSS 里的浮层规则不含主题色字面值', () => {
        const css = liteMonacoBaseCSS()
        for (const hex of ['#ffcc00', '#ddb100', '#3794ff', '#2aaaff', '#001f33', '#ff8f00', '#007acc', '#cccccc', 'rgba(0,0,0,0.25)', 'rgba(128,128,128'])
            expect(css.includes(hex), hex).toBe(false)
    })
})
