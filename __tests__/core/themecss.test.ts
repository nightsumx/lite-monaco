import { describe, expect, it } from 'vitest'
import { liteMonacoThemeCSS } from '../../src/litemonaco'
import { themeVars } from '../../src/product/themecss'

// 光标层几何契约(回归钉死):
// 真页 bug —— 光标画在 .cm-cursorLayer 内的绝对定位子元素,层若非全高 + overflow:hidden,
// 第 1 行外(top>0)的光标全被裁掉 → 用户「看不见光标」。根因(commit aa6fff7):
// 层从 `inset:0`(全高盒)误改成 `top:0;left:0;width:100%`(无 height → 塌成 0 高)+ 新加 overflow:hidden,
// 把 top:182px 的光标裁没。契约:层必须撑满父容器,且不得裁剪溢出。
//
// 禁正则 —— 用词法扫描抽出 `.cm-cursorLayer { ... }` 的声明块。
function ruleBody(css: string, selector: string): string {
    const at = css.indexOf(selector + ' {')
    if (at < 0) throw new Error(`selector not found: ${selector}`)
    const open = css.indexOf('{', at)
    const close = css.indexOf('}', open)
    return css.slice(open + 1, close).trim()
}

describe('liteMonacoThemeCSS —— 光标层不裁掉视口内光标', () => {
    const css = liteMonacoThemeCSS({ bg: '#1e1e1e', fg: '#d4d4d4', dark: true })
    const layer = ruleBody(css, '.cm-cursorLayer')

    it('层撑满父容器(全高盒,非塌成 0 高)', () => {
        // inset:0 或显式 height:100% 都算全高;绝不能只给 top/left/width 而漏掉高度维度。
        const fullBox = layer.includes('inset: 0') || layer.includes('height: 100%')
        expect(fullBox).toBe(true)
    })

    it('层不裁剪溢出(overflow:hidden 会把第 1 行外的光标裁没)', () => {
        expect(layer.includes('overflow: hidden')).toBe(false)
        // contain:paint 同样建立裁剪盒,与 overflow:hidden 等效裁掉光标 —— 一并禁。
        expect(layer.includes('contain: layout style paint')).toBe(false)
        expect(layer.includes('contain: strict')).toBe(false)
    })

    it('光标本体保留可见宽 + 颜色(走变量,暗主题值 = Monaco editorCursor.foreground)', () => {
        const cursor = ruleBody(css, '.cm-cursor')
        expect(cursor.includes('width: 2px')).toBe(true)
        expect(cursor.includes('var(--lm-editorCursor-foreground)')).toBe(true)
        expect(css.includes('--lm-editorCursor-foreground: #aeafad;')).toBe(true)
    })

    it('选区背景规则存在', () => {
        expect(css.includes('.cm-selectionBackground') || css.includes('::selection')).toBe(true)
    })

    it('诊断波浪线三档:Monaco squiggly SVG 当 mask,色 = editorError/Warning/Info.foreground', () => {
        const base = ruleBody(css, '.cm-diagnostic::after')
        expect(base.includes('data:image/svg+xml')).toBe(true)
        expect(base.includes('repeat-x')).toBe(true)
        expect(base.includes('polygon')).toBe(true) // 波形多边形,不是直线下划线
        expect(ruleBody(css, '.cm-diagnostic-error::after').includes('var(--lm-editorError-foreground)')).toBe(true)
        expect(ruleBody(css, '.cm-diagnostic-warning::after').includes('var(--lm-editorWarning-foreground)')).toBe(true)
        expect(ruleBody(css, '.cm-diagnostic-info::after').includes('var(--lm-editorInfo-foreground)')).toBe(true)
        expect(css.includes('--lm-editorError-foreground: #f14c4c;')).toBe(true)
        expect(css.includes('--lm-editorWarning-foreground: #cca700;')).toBe(true)
        expect(css.includes('--lm-editorInfo-foreground: #3794ff;')).toBe(true)
    })

    it('未使用代码(cm-unnecessary)按 editorUnnecessaryCode.opacity 淡显', () => {
        expect(ruleBody(css, '.cm-unnecessary').includes('opacity: var(--lm-unnecessary-opacity)')).toBe(true)
        expect(css.includes('--lm-unnecessary-opacity: 0.667;')).toBe(true)
    })

    it('含 peek / find / 换行规则', () => {
        expect(css.includes('.cm-peek')).toBe(true)
        expect(css.includes('.cm-find-widget')).toBe(true)
        expect(css.includes('.cm-lineWrapping')).toBe(true)
        expect(css.includes('.cm-qi-keyword')).toBe(true)
    })
})

// G1:浮层与装饰(hover / 诊断 / JSDoc / 重命名 / 灯泡 / peek / 键帽)。期望值 = Monaco 0.52 实测(/tmp/lc-hunt/g1)。
describe('liteMonacoThemeCSS —— 浮层与装饰对齐 Monaco', () => {
    const css = liteMonacoThemeCSS({ bg: '#1e1e1e', fg: '#d4d4d4', dark: true })
    // 选择器必须在行首(避免 `.a + .b {` 被当成 `.b {`)
    const rule = (sel: string) => {
        const at = css.indexOf('\n' + sel + ' {')
        if (at < 0) throw new Error(`rule not found: ${sel}`)
        return ruleBody(css.slice(at + 1), sel)
    }

    it('F3 新类都有规则', () => {
        for (const sel of [
            '.cm-hover-card', '.cm-hover-row', '.cm-hover-status', '.cm-hover-action', '.cm-hover-action.cm-hover-action-disabled',
            '.cm-hover-keybinding', '.cm-hover-action-slot', '.cm-diagnostic-rows > .cm-diagnostic-tooltip + .cm-diagnostic-tooltip',
            '.cm-quickinfo-doc', '.cm-md', '.cm-md pre.cm-md-code', '.cm-qi-paramname', '.cm-qi-tagtext', '.cm-quickinfo-sig.cm-quickinfo-deprecated',
            '.cm-rename-box', '.cm-rename-input', '.cm-editor-message', '.cm-symbol-highlight', '.cm-squiggly-hint', '.cm-squiggly-hint::after',
            'div.cm-lightbulb.codicon', 'div.cm-lightbulb.codicon.cm-lightbulb-gutter',
        ]) expect(css.includes(sel + ' {') || css.includes(sel + ', '), sel).toBe(true)
    })

    it('结构 CSS 没有写死的颜色字面值(data: SVG 里的 mask 填充、Monaco 自己写死的 .mtkcontrol 除外)', () => {
        // 去掉 url(...) 后逐字符扫:不得出现 #hex 或 rgb(/rgba(/hsl(
        let rest = css.slice(0, css.lastIndexOf('.cm-editor, '))
        const ctrl = rest.indexOf('.cm-controlChar {')
        expect(ctrl).toBeGreaterThan(0)
        rest = rest.slice(0, ctrl) + rest.slice(rest.indexOf('}', ctrl) + 1)
        for (;;) {
            const at = rest.indexOf('url(')
            if (at < 0) break
            rest = rest.slice(0, at) + rest.slice(rest.indexOf(')"', at) + 2)
        }
        const hex = '0123456789abcdefABCDEF'
        for (let i = 0; i < rest.length; i++) {
            if (rest[i] !== '#') continue
            let n = 0
            while (hex.includes(rest[i + 1 + n] ?? '')) n++
            expect(n === 3 || n === 4 || n === 6 || n === 8, rest.slice(i - 40, i + 10)).toBe(false)
        }
        for (const fn of ['rgb(', 'rgba(', 'hsl(']) expect(rest.includes(fn), fn).toBe(false)
    })

    it('引用的 --lm-* 变量都由 themeVars 给出(没有空引用,也不靠 var() 回退值兜底)', () => {
        const defined = css.slice(css.lastIndexOf('.cm-editor, '))
        const base = css.slice(0, css.lastIndexOf('.cm-editor, '))
        let i = 0
        while ((i = base.indexOf('var(--lm-', i)) >= 0) {
            const end = Math.min(...[')', ','].map(c => { const j = base.indexOf(c, i); return j < 0 ? Infinity : j }))
            const name = base.slice(i + 4, end)
            // Monaco 0.52:同词/选中串边色默认 null,不写 --vscode-*。CSS 仍引用 var(),缺席时 border 整条失效。
            const nullBorder = name === '--lm-editor-selectionHighlightBorder'
                || name === '--lm-editor-wordHighlightBorder'
                || name === '--lm-editor-wordHighlightStrongBorder'
                || name === '--lm-editor-wordHighlightTextBorder'
            if (name !== '--lm-tab-size' && name !== '--lm-deco-pad' && name !== '--lm-diff-glyph-margin' && !nullBorder) expect(defined.includes(name + ':'), name).toBe(true)
            i = end
        }
    })

    it('hover 卡:无阴影、最高 250px、颜色走 editorHoverWidget.*', () => {
        const card = rule('.cm-tooltip-hover')
        expect(card).not.toContain('box-shadow')
        expect(card).toContain('max-height: 250px')
        expect(card).toContain('var(--lm-editorHoverWidget-background)')
        expect(card).toContain('1px solid var(--lm-editorHoverWidget-border)')
        expect(rule('.cm-hover-status')).toContain('var(--lm-editorHoverWidget-statusBarBackground)')
        expect(rule('.cm-hover-action')).toContain('var(--lm-textLink-foreground)')
        expect(css).toContain('--lm-hover-separator: rgba(69,69,69,0.5);')
    })

    it('hover 诊断行:CSS 藏图标,码 0.6 不透明度跟在消息后', () => {
        expect(rule('.cm-diagnostic-tooltip > [class*="cm-hover-icon-"]')).toContain('display: none')
        expect(rule('.cm-diagnostic-tooltip, .cm-diagnostic-hint')).toContain('display: block')
        expect(rule('.cm-diagnostic-tooltip .cm-diagnostic-code')).toContain('opacity: 0.6')
    })

    it('JSDoc:不再 pre-wrap;markdown 段距 8px;行内 code 底色 = textCodeBlock.background;链接 textLink', () => {
        expect(rule('.cm-quickinfo-doc')).toContain('white-space: normal')
        expect(rule('.cm-md :is(p, ul, ol, h1, h2, h3, h4, h5, h6, pre.cm-md-code)')).toContain('margin: 8px 0')
        expect(rule('.cm-md :is(ul, ol)')).toContain('padding-left: 20px')
        expect(rule('.cm-md code, .cm-qi-paramname')).toContain('var(--lm-textCodeBlock-background)')
        expect(rule('.cm-md a')).toContain('var(--lm-textLink-foreground)')
        expect(rule('.cm-md pre.cm-md-code')).toContain('background: none')
        expect(rule('.cm-qi-tagname')).toContain('font-style: italic')
    })

    it('灯泡:div + flex 居中 + editorLightBulb.foreground;不定义 .codicon-light-bulb:before,::before 清空防双图标', () => {
        const bulb = rule('div.cm-lightbulb.codicon')
        expect(bulb).toContain('display: flex')
        expect(bulb).toContain('align-items: center')
        expect(bulb).toContain('justify-content: center')
        expect(bulb).toContain('var(--lm-editorLightBulb-foreground)')
        expect(css).not.toContain('.codicon-light-bulb:before')
        expect(css).not.toContain('.codicon-light-bulb::before')
        expect(rule('div.cm-lightbulb.codicon::before')).toContain('content: none')
    })

    it('hint 三点 / F12 闪烁 / 重命名框 / 编辑器提示 的颜色键', () => {
        expect(rule('.cm-squiggly-hint::after')).toContain('var(--lm-editorHint-foreground)')
        expect(rule('.cm-symbol-highlight')).toContain('var(--lm-editor-symbolHighlightBackground)')
        const box = rule('.cm-rename-box')
        expect(box).toContain('var(--lm-editorWidget-background)')
        expect(box).toContain('0 0 8px 2px var(--lm-widget-shadow)')
        expect(rule('.cm-rename-box:focus-within')).toContain('var(--lm-focusBorder)')
        expect(rule('.cm-rename-input')).toContain('var(--lm-input-background)')
        expect(rule('.cm-editor-message')).toContain('var(--lm-inputValidation-infoBorder)')
    })

    it('peek 用 peekView* 键:预览换底色,引用处是 matchHighlight', () => {
        expect(rule('.cm-peek-preview > .cm-editor')).toContain('var(--lm-peekViewEditor-background)')
        expect(rule('.cm-peek-match')).toContain('var(--lm-peekViewEditor-matchHighlightBackground)')
        expect(rule('.cm-rangeHighlight')).toContain('var(--lm-editor-rangeHighlightBackground)')
    })

    it('同词只铺底色,不画边;选中串边框对齐 Monaco,默认 null 不写变量', () => {
        // 同词的 border 会在词周围画一圈框。底色留着;边不写。
        // 选中串的 border 只挂在 .focused 上;失焦只有半透明底,没有边。
        const wordRules: [string, string][] = [
            ['.cm-wordHighlightText', '--lm-editor-wordHighlightTextBackground'],
            ['.cm-wordHighlight', '--lm-editor-wordHighlightBackground'],
            ['.cm-wordHighlightStrong', '--lm-editor-wordHighlightStrongBackground'],
            ['.cm-wordHighlightTextBox', '--lm-editor-wordHighlightTextBackground'],
        ]
        for (const [sel, bgVar] of wordRules) {
            const body = rule(sel)
            expect(body, sel).toContain('box-sizing: border-box')
            expect(body, sel).toContain(`background-color: var(${bgVar})`)
            expect(body, sel).not.toContain('border:')
            expect(body, sel).not.toContain('box-shadow')
            expect(body, sel).not.toContain('outline:')
        }
        const selBox = rule('.cm-selectionMatchBox')
        expect(selBox).toContain('background-color: var(--lm-editor-selectionHighlightBackground)')
        expect(selBox).toContain('box-sizing: border-box')
        expect(selBox).not.toContain('border:')
        expect(selBox).not.toContain('box-shadow')
        expect(selBox).not.toContain('outline:')
        expect(rule('.cm-editor.cm-focused .cm-selectionMatchBox')).toBe('border: 1px solid var(--lm-editor-selectionHighlightBorder);')

        const borderKeys = [
            '--lm-editor-selectionHighlightBorder',
            '--lm-editor-wordHighlightBorder',
            '--lm-editor-wordHighlightStrongBorder',
            '--lm-editor-wordHighlightTextBorder',
        ]
        for (const dark of [true, false]) {
            const vars = themeVars({ bg: '#1e1e1e', fg: '#d4d4d4', dark })
            for (const k of borderKeys) expect(vars[k], `${dark ? 'dark' : 'light'} ${k}`).toBeUndefined()
        }
        const painted = themeVars({
            bg: '#1e1e1e', fg: '#d4d4d4', dark: true,
            vscode: { 'editor.wordHighlightTextBorder': '#c0c0c0', 'editor.selectionHighlightBorder': '#888888' },
        })
        expect(painted['--lm-editor-wordHighlightTextBorder']).toBe('#c0c0c0')
        expect(painted['--lm-editor-selectionHighlightBorder']).toBe('#888888')
        expect(painted['--lm-editor-wordHighlightBorder']).toBeUndefined()
        expect(painted['--lm-editor-wordHighlightStrongBorder']).toBeUndefined()
        const inherited = themeVars({
            bg: '#1e1e1e', fg: '#d4d4d4', dark: true,
            vscode: { 'editor.wordHighlightBorder': '#abcabc' },
        })
        expect(inherited['--lm-editor-wordHighlightBorder']).toBe('#abcabc')
        expect(inherited['--lm-editor-wordHighlightTextBorder']).toBe('#abcabc')
        // 主题写了边色就原样输出,哪怕是全透明。Monaco getColor 有 Color 对象就写变量,只有默认 null 才缺席。
        const zero = themeVars({
            bg: '#1e1e1e', fg: '#d4d4d4', dark: true,
            vscode: { 'editor.wordHighlightBorder': '#00000000' },
        })
        expect(zero['--lm-editor-wordHighlightBorder']).toBe('#00000000')
        expect(zero['--lm-editor-wordHighlightTextBorder']).toBe('#00000000')
        const named = themeVars({
            bg: '#1e1e1e', fg: '#d4d4d4', dark: true,
            vscode: { 'editor.selectionHighlightBorder': 'transparent' },
        })
        expect(named['--lm-editor-selectionHighlightBorder']).toBe('transparent')
        // 主题把同词底色写成全透明、颜色放在边上。边不画,底色退回 Monaco 默认,高亮还在。
        const hollow = themeVars({
            bg: '#24292e', fg: '#e1e4e8', dark: true,
            vscode: {
                'editor.wordHighlightBackground': '#17E5E600',
                'editor.wordHighlightBorder': '#17E5E699',
                'editor.wordHighlightStrongBackground': '#17E5E600',
                'editor.wordHighlightStrongBorder': '#17E5E666',
            },
        })
        expect(hollow['--lm-editor-wordHighlightBackground']).toBe('rgba(87,87,87,0.72)')
        expect(hollow['--lm-editor-wordHighlightTextBackground']).toBe('rgba(87,87,87,0.72)')
        expect(hollow['--lm-editor-wordHighlightStrongBackground']).toBe('rgba(0,73,114,0.72)')
        const filled = themeVars({
            bg: '#1e1e1e', fg: '#d4d4d4', dark: true,
            vscode: { 'editor.wordHighlightBackground': '#575757B8' },
        })
        expect(filled['--lm-editor-wordHighlightBackground']).toBe('#575757B8')
        expect(filled['--lm-editor-wordHighlightTextBackground']).toBe('#575757B8')
    })

    it('键帽走 keybindingLabel.*,quick input 聚焦有 focusBorder,遮罩不压暗', () => {
        const key = rule('.cm-keybinding-key')
        for (const k of ['background', 'foreground', 'border', 'bottomBorder']) expect(key, k).toContain(`var(--lm-keybindingLabel-${k})`)
        expect(rule('.cm-quick-input-box:focus-within')).toContain('var(--lm-focusBorder)')
    })
})
