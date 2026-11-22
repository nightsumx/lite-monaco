import type { RulerPalette } from '../core/chrome/ruler'
export type { RulerPalette }

// 默认主题 —— lite-monaco 补上 CM6 最大的洞(默认像 textarea)。
//
// Shiki 负责 token 颜色(VS Code 同源 TextMate);这里负责「编辑器外壳」:
// 选区/光标/行号槽/当前行/浮层 的颜色。两者拼起来 = Monaco 级观感。
//
// 颜色的真源是 VS Code 主题的 `colors` 表(shiki getTheme().colors):键名、缺省回退链、默认值
// 全照 VS Code colorRegistry(Monaco 0.52 实测 `--vscode-*` 变量校准,见 REGISTRY)。
// 宿主传的 colors 优先:bg/fg/shell 盖过主题,再缺才落到主题 colors,最后落 registry 默认。

// 宿主可单独覆盖的外壳色(老接口,键名对应 VS Code colors 见 SHELL_KEYS)。
export interface ThemeShell {
    lineNumber?: string       // editorLineNumber.foreground
    activeLineNumber?: string // editorLineNumber.activeForeground
    lineHighlight?: string    // editor.lineHighlightBackground
    selection?: string        // editor.selectionBackground
    selectionMatch?: string   // editor.selectionHighlightBackground
    cursor?: string           // editorCursor.foreground
    bracket1?: string         // editorBracketHighlight.foreground1
    bracket2?: string         // editorBracketHighlight.foreground2
    bracket3?: string         // editorBracketHighlight.foreground3
    rulerError?: string       // editorOverviewRuler.errorForeground
    rulerWarning?: string     // editorOverviewRuler.warningForeground
    rulerInfo?: string        // editorOverviewRuler.infoForeground
}

/** 浮层代码片段(hover 签名等)用的 TextMate token 色,从主题 tokenColors 按 scope 取。 */
export interface ThemeTokenColors {
    keyword?: string
    type?: string
    function?: string
    variable?: string
    string?: string
    number?: string
}

export interface ThemeColors {
    bg: string        // 编辑器背景(取 shiki theme bg)
    fg: string        // 默认前景(取 shiki theme fg)
    dark: boolean     // 暗色主题?决定 registry 默认值取暗/亮哪一列
    shell?: ThemeShell // 宿主/主题的精确外壳色;缺项走 vscode → registry
    /** VS Code 主题的完整 `colors` 表(键如 `editorWidget.background`)。liteMonaco() 自动从 shiki 主题填 */
    vscode?: Record<string, string>
    /** 浮层代码片段的 token 色;liteMonaco() 自动从 shiki 主题 tokenColors 取 */
    tokens?: ThemeTokenColors
}

const SHELL_KEYS: Record<keyof ThemeShell, string> = {
    lineNumber: 'editorLineNumber.foreground',
    activeLineNumber: 'editorLineNumber.activeForeground',
    lineHighlight: 'editor.lineHighlightBackground',
    selection: 'editor.selectionBackground',
    selectionMatch: 'editor.selectionHighlightBackground',
    cursor: 'editorCursor.foreground',
    bracket1: 'editorBracketHighlight.foreground1',
    bracket2: 'editorBracketHighlight.foreground2',
    bracket3: 'editorBracketHighlight.foreground3',
    rulerError: 'editorOverviewRuler.errorForeground',
    rulerWarning: 'editorOverviewRuler.warningForeground',
    rulerInfo: 'editorOverviewRuler.infoForeground',
}

// —— 颜色代数(词法解析,不用正则) ——

/** '#rgb' / '#rgba' / '#rrggbb' / '#rrggbbaa' / 'rgb(a)(…)' → [r,g,b,a];认不出返回 null。 */
export function parseColor(c: string): [number, number, number, number] | null {
    const s = c.trim()
    if (s.charCodeAt(0) === 35) {
        let h = s.slice(1)
        if (h.length === 3 || h.length === 4) h = [...h].map(ch => ch + ch).join('')
        if (h.length !== 6 && h.length !== 8) return null
        const n = (i: number) => parseInt(h.slice(i, i + 2), 16)
        const out: [number, number, number, number] = [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1]
        for (const v of out) if (Number.isNaN(v)) return null
        return out
    }
    const open = s.indexOf('(')
    if (open < 0 || !s.startsWith('rgb')) return null
    const parts = s.slice(open + 1, s.lastIndexOf(')')).split(',').map(p => parseFloat(p))
    if (parts.length < 3 || parts.some(Number.isNaN)) return null
    return [parts[0], parts[1], parts[2], parts.length > 3 ? parts[3] : 1]
}

/** 透明度乘 factor(= VS Code `transparent(color, factor)`)。 */
export function withAlpha(c: string, factor: number): string {
    const p = parseColor(c)
    if (!p) return c
    return `rgba(${p[0]},${p[1]},${p[2]},${Math.round(p[3] * factor * 1000) / 1000})`
}

/** HSL 亮度按比例增减(= VS Code `Color.lighten(f)` / `darken(f)`:l ± l×f;取整同 Monaco HSLA:色相取整度,s/l 保留 3 位)。认不出原样返回。 */
export function shiftLightness(c: string, factor: number): string {
    const p = parseColor(c)
    if (!p) return c
    const [r, g, b] = [p[0] / 255, p[1] / 255, p[2] / 255]
    const max = Math.max(r, g, b), min = Math.min(r, g, b)
    const l0 = (max + min) / 2
    const d = max - min
    let h = 0, s = 0
    if (d > 0) {
        s = l0 > 0.5 ? d / (2 - max - min) : d / (max + min)
        h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
        h = Math.round(h * 60) / 360
    }
    const r3 = (x: number) => Math.round(Math.min(1, Math.max(0, x)) * 1000) / 1000
    s = r3(s)
    const l = r3(r3(l0) + r3(l0) * factor)
    const hue = (t: number, q: number, pp: number) => {
        if (t < 0) t += 1
        if (t > 1) t -= 1
        if (t < 1 / 6) return pp + (q - pp) * 6 * t
        if (t < 1 / 2) return q
        if (t < 2 / 3) return pp + (q - pp) * (2 / 3 - t) * 6
        return pp
    }
    let rgb: number[]
    if (s === 0) rgb = [l, l, l]
    else {
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s
        const pp = 2 * l - q
        rgb = [hue(h + 1 / 3, q, pp), hue(h, q, pp), hue(h - 1 / 3, q, pp)]
    }
    const [R, G, B] = rgb.map(x => Math.round(x * 255))
    if (p[3] < 1) return `rgba(${R},${G},${B},${p[3]})`
    return '#' + [R, G, B].map(x => x.toString(16).padStart(2, '0')).join('')
}

function isTransparent(c: string | undefined): boolean {
    if (!c || c.trim() === 'transparent') return true
    const p = parseColor(c)
    return !!p && p[3] === 0
}

// —— VS Code colorRegistry 子集 ——
// 每项:[回退键链, 暗默认, 亮默认]。默认值可以是函数(从别的键派生,如 transparent();defines = 主题自己写了这个键,
// 同 Monaco ifDefinedThenElse 的 theme.defines)。
// 值来源:Monaco 0.52 vs-dark / vs 实测 `--vscode-*`(/tmp/lc-hunt/f6/mvars.ts),
// Monaco 自带主题私有的 base 色(vs-dark 的 editorIndentGuide.background1 等)按 VS Code 语义改成走主题。
type Def = string | ((get: (key: string) => string, defines: (key: string) => boolean) => string)
const REGISTRY: Record<string, [string[], Def, Def]> = {
    'foreground': [[], '#cccccc', '#616161'],
    'widget.shadow': [[], 'rgba(0,0,0,0.36)', 'rgba(0,0,0,0.16)'],
    'widget.border': [[], 'transparent', 'transparent'],
    'focusBorder': [[], '#007fd4', '#0090f1'],
    'icon.foreground': [[], '#c5c5c5', '#424242'],
    'descriptionForeground': [[], g => withAlpha(g('foreground'), 0.7), '#717171'],
    'errorForeground': [[], '#f48771', '#a1260d'],
    'disabledForeground': [[], 'rgba(204,204,204,0.5)', 'rgba(97,97,97,0.5)'],
    'toolbar.hoverBackground': [[], 'rgba(90,93,94,0.31)', 'rgba(184,184,184,0.31)'],
    'list.hoverBackground': [[], '#2a2d2e', '#f0f0f0'],
    'list.activeSelectionBackground': [[], '#04395e', '#0060c0'],
    'list.activeSelectionForeground': [[], '#ffffff', '#ffffff'],
    'list.highlightForeground': [[], '#2aaaff', '#0066bf'],
    // Monaco listColors:light = ifDefinedThenElse(list.activeSelectionBackground, list.highlightForeground, '#BBE7FF')
    'list.focusHighlightForeground': [[], g => g('list.highlightForeground'), (g, defines) => defines('list.activeSelectionBackground') ? g('list.highlightForeground') : '#bbe7ff'],
    'input.background': [[], '#3c3c3c', '#ffffff'],
    'input.foreground': [['foreground'], '#cccccc', '#616161'],
    'input.border': [[], 'transparent', 'transparent'],
    'input.placeholderForeground': [[], g => withAlpha(g('foreground'), 0.5), g => withAlpha(g('foreground'), 0.5)],
    'inputOption.activeBackground': [[], g => withAlpha(g('focusBorder'), 0.4), g => withAlpha(g('focusBorder'), 0.2)],
    'inputOption.activeBorder': [[], '#007acc', '#007acc'],
    'inputOption.activeForeground': [[], '#ffffff', '#000000'],
    'dropdown.background': [[], '#3c3c3c', '#ffffff'],
    'dropdown.foreground': [[], '#f0f0f0', g => g('foreground')],
    // 编辑器本体
    'editor.background': [[], '#1e1e1e', '#fffffe'],
    'editor.foreground': [[], '#d4d4d4', '#000000'],
    'editorLineNumber.foreground': [[], '#858585', '#237893'],
    'editorLineNumber.activeForeground': [[], '#c6c6c6', '#0b216f'],
    'editor.lineHighlightBackground': [[], 'transparent', 'transparent'],
    'editor.lineHighlightBorder': [[], '#282828', '#eeeeee'],
    'editor.selectionBackground': [[], '#264f78', '#add6ff'],
    'editor.inactiveSelectionBackground': [[], '#3a3d41', '#e5ebf1'],
    'editor.selectionHighlightBackground': [[], 'rgba(173,214,255,0.15)', 'rgba(173,214,255,0.3)'],
    'editor.selectionHighlightBorder': [[], 'transparent', 'transparent'],
    'editor.wordHighlightBackground': [[], 'rgba(87,87,87,0.72)', 'rgba(87,87,87,0.25)'],
    'editor.wordHighlightBorder': [[], 'transparent', 'transparent'],
    'editor.wordHighlightStrongBackground': [[], 'rgba(0,73,114,0.72)', 'rgba(14,99,156,0.25)'],
    'editor.wordHighlightStrongBorder': [[], 'transparent', 'transparent'],
    // 文本同词(Monaco wordHighlightText,TextualDocumentHighlightProvider):默认跟 wordHighlight 同色
    'editor.wordHighlightTextBackground': [[], g => g('editor.wordHighlightBackground'), g => g('editor.wordHighlightBackground')],
    'editor.wordHighlightTextBorder': [[], g => g('editor.wordHighlightBorder'), g => g('editor.wordHighlightBorder')],
    'editorCursor.foreground': [[], '#aeafad', '#000000'],
    'editorIndentGuide.background1': [['editorIndentGuide.background'], '#404040', '#d3d3d3'],
    // Monaco editor.placeholder.foreground ← ghostTextForeground(dark rgba(255,255,255,0.34) / light rgba(0,0,0,0.47))
    'editor.placeholder.foreground': [['editorGhostText.foreground'], 'rgba(255, 255, 255, 0.34)', 'rgba(0, 0, 0, 0.47)'],
    // Monaco editorRuler.foreground:dark #5A5A5A / light #D3D3D3(rulers 选项没给 color 时用)
    'editorRuler.foreground': [[], '#5A5A5A', '#D3D3D3'],
    'editorIndentGuide.activeBackground1': [['editorIndentGuide.activeBackground'], '#707070', '#939393'],
    'editorBracketMatch.background': [[], 'rgba(0,100,0,0.1)', 'rgba(0,100,0,0.1)'],
    'editorBracketMatch.border': [[], '#888888', '#b9b9b9'],
    'editor.findMatchBackground': [[], '#515c6a', '#a8ac94'],
    'editor.findMatchHighlightBackground': [[], 'rgba(234,92,0,0.33)', 'rgba(234,92,0,0.33)'],
    'editor.findMatchBorder': [[], 'transparent', 'transparent'],
    'editor.findMatchHighlightBorder': [[], 'transparent', 'transparent'],
    'editorWhitespace.foreground': [[], 'rgba(227,228,226,0.16)', 'rgba(51,51,51,0.2)'],
    'editorError.foreground': [[], '#f14c4c', '#e51400'],
    'editorWarning.foreground': [[], '#cca700', '#bf8803'],
    'editorUnicodeHighlight.border': [['editorWarning.foreground'], '#cca700', '#bf8803'],
    'editorUnicodeHighlight.background': [['editorWarning.background'], 'transparent', 'transparent'],
    'editorInfo.foreground': [[], '#3794ff', '#1a85ff'],
    'editorHint.foreground': [[], 'rgba(238,238,238,0.7)', '#6c6c6c'],
    'editorUnnecessaryCode.opacity': [[], '#000000aa', '#00000077'],
    'editorGutter.background': [['editor.background'], '#1e1e1e', '#fffffe'],
    'editorGutter.foldingControlForeground': [['icon.foreground'], '#c5c5c5', '#424242'],
    'editor.foldBackground': [[], g => withAlpha(g('editor.selectionBackground'), 0.3), g => withAlpha(g('editor.selectionBackground'), 0.3)],
    'editor.foldPlaceholderForeground': [[], '#808080', '#808080'],
    'editorStickyScroll.background': [['editor.background'], '#1e1e1e', '#fffffe'],
    'editorStickyScrollHover.background': [[], '#2a2d2e', '#f0f0f0'],
    'editorStickyScroll.shadow': [['scrollbar.shadow'], '#000000', '#dddddd'],
    'scrollbar.shadow': [[], '#000000', '#dddddd'],
    'scrollbarSlider.background': [[], 'rgba(121,121,121,0.4)', 'rgba(100,100,100,0.4)'],
    'scrollbarSlider.hoverBackground': [[], 'rgba(100,100,100,0.7)', 'rgba(100,100,100,0.7)'],
    'scrollbarSlider.activeBackground': [[], 'rgba(191,191,191,0.4)', 'rgba(0,0,0,0.6)'],
    'minimap.background': [['editor.background'], '#1e1e1e', '#fffffe'],
    'minimapSlider.background': [[], g => withAlpha(g('scrollbarSlider.background'), 0.5), g => withAlpha(g('scrollbarSlider.background'), 0.5)],
    'minimapSlider.hoverBackground': [[], g => withAlpha(g('scrollbarSlider.hoverBackground'), 0.5), g => withAlpha(g('scrollbarSlider.hoverBackground'), 0.5)],
    'minimapSlider.activeBackground': [[], g => withAlpha(g('scrollbarSlider.activeBackground'), 0.5), g => withAlpha(g('scrollbarSlider.activeBackground'), 0.5)],
    'editorOverviewRuler.errorForeground': [[], 'rgba(255,18,18,0.7)', 'rgba(255,18,18,0.7)'],
    'editorOverviewRuler.warningForeground': [['editorWarning.foreground'], '#cca700', '#bf8803'],
    'editorOverviewRuler.infoForeground': [['editorInfo.foreground'], '#3794ff', '#1a85ff'],
    'editorOverviewRuler.border': [[], 'rgba(127,127,127,0.3)', 'rgba(127,127,127,0.3)'],
    // 概览尺其余标记色(Monaco colorRegistry / highlightDecorations / bracketMatching 默认,vs 与 vs-dark 相同)
    'editorOverviewRuler.findMatchForeground': [[], 'rgba(209,134,22,0.49)', 'rgba(209,134,22,0.49)'],
    'editorOverviewRuler.selectionHighlightForeground': [[], 'rgba(160,160,160,0.8)', 'rgba(160,160,160,0.8)'],
    'editorOverviewRuler.wordHighlightForeground': [[], 'rgba(160,160,160,0.8)', 'rgba(160,160,160,0.8)'],
    'editorOverviewRuler.wordHighlightStrongForeground': [[], 'rgba(192,160,192,0.8)', 'rgba(192,160,192,0.8)'],
    'editorOverviewRuler.wordHighlightTextForeground': [[], g => g('editorOverviewRuler.selectionHighlightForeground'), g => g('editorOverviewRuler.selectionHighlightForeground')],
    'editorOverviewRuler.bracketMatchForeground': [[], '#a0a0a0', '#a0a0a0'],
    'editorOverviewRuler.rangeHighlightForeground': [[], 'rgba(0,122,204,0.6)', 'rgba(0,122,204,0.6)'],
    'editorMultiCursor.primary.foreground': [[], g => g('editorCursor.foreground'), g => g('editorCursor.foreground')],
    'editorMultiCursor.secondary.foreground': [[], g => g('editorCursor.foreground'), g => g('editorCursor.foreground')],
    // 浮层
    'editorWidget.background': [[], '#252526', '#f3f3f3'],
    'editorWidget.foreground': [['foreground'], '#cccccc', '#616161'],
    'editorWidget.border': [[], '#454545', '#c8c8c8'],
    'editorWidget.resizeBorder': [[], g => g('editorWidget.border'), g => g('editorWidget.border')],
    'editorSuggestWidget.background': [['editorWidget.background'], '#252526', '#f3f3f3'],
    'editorSuggestWidget.border': [['editorWidget.border'], '#454545', '#c8c8c8'],
    'editorSuggestWidget.foreground': [['editor.foreground'], '#d4d4d4', '#000000'],
    'editorSuggestWidget.selectedBackground': [['quickInputList.focusBackground', 'list.activeSelectionBackground'], '#04395e', '#0060c0'],
    'editorSuggestWidget.selectedForeground': [['quickInputList.focusForeground', 'list.activeSelectionForeground'], '#ffffff', '#ffffff'],
    'editorSuggestWidget.highlightForeground': [['list.highlightForeground'], '#2aaaff', '#0066bf'],
    'editorSuggestWidget.focusHighlightForeground': [[], g => g('list.focusHighlightForeground'), g => g('list.focusHighlightForeground')],
    // Monaco 没有默认值(null):主题不给时 .focused .codicon 的 color 无效 → 继承行色(selectedForeground)
    'editorSuggestWidget.selectedIconForeground': [['quickInputList.focusIconForeground', 'list.activeSelectionIconForeground'], g => g('editorSuggestWidget.selectedForeground'), g => g('editorSuggestWidget.selectedForeground')],
    'editorHoverWidget.background': [['editorWidget.background'], '#252526', '#f3f3f3'],
    'editorHoverWidget.foreground': [['editorWidget.foreground', 'foreground'], '#cccccc', '#616161'],
    'editorHoverWidget.border': [['editorWidget.border'], '#454545', '#c8c8c8'],
    'editorHoverWidget.highlightForeground': [['list.highlightForeground'], '#2aaaff', '#0066bf'],
    'editorHoverWidget.statusBarBackground': [[], g => shiftLightness(g('editorHoverWidget.background'), 0.2), g => shiftLightness(g('editorHoverWidget.background'), -0.05)],
    // hover / 签名 / JSDoc 的 markdown(Monaco renderedMarkdown + hoverWidget.css)
    'textLink.foreground': [[], '#3794ff', '#006ab1'],
    'textLink.activeForeground': [[], '#3794ff', '#006ab1'],
    // 链接识别(detected-link-active):Monaco editorLink.activeForeground 默认 dark #4E94CE / light #0000FF
    'editorLink.activeForeground': [[], '#4e94ce', '#0000ff'],
    'textCodeBlock.background': [[], 'rgba(10,10,10,0.4)', 'rgba(220,220,220,0.4)'],
    'textBlockQuote.background': [[], '#222222', '#f2f2f2'],
    'textBlockQuote.border': [[], 'rgba(0,122,204,0.5)', 'rgba(0,122,204,0.5)'],
    'textSeparator.foreground': [[], 'rgba(255,255,255,0.18)', 'rgba(0,0,0,0.18)'],
    // 键帽(quick input / 命令面板)
    'keybindingLabel.background': [[], 'rgba(128,128,128,0.17)', 'rgba(221,221,221,0.4)'],
    'keybindingLabel.foreground': [[], '#cccccc', '#555555'],
    'keybindingLabel.border': [[], 'rgba(51,51,51,0.6)', 'rgba(204,204,204,0.4)'],
    'keybindingLabel.bottomBorder': [[], 'rgba(68,68,68,0.6)', 'rgba(187,187,187,0.4)'],
    // Go to Line 预览整行(rangeHighlight)、F12 落点闪烁(symbolHighlight ← findMatchHighlight)
    'editor.rangeHighlightBackground': [[], 'rgba(255,255,255,0.043)', 'rgba(253,255,0,0.2)'],
    // 选区内查找的范围底色(Monaco editorColors findRangeHighlight #3a3d4166 / #b4b4b44d)
    'editor.findRangeHighlightBackground': [[], 'rgba(58,61,65,0.4)', 'rgba(180,180,180,0.3)'],
    'editor.rangeHighlightBorder': [[], 'transparent', 'transparent'],
    'editor.symbolHighlightBackground': [[], g => g('editor.findMatchHighlightBackground'), g => g('editor.findMatchHighlightBackground')],
    'editor.symbolHighlightBorder': [[], 'transparent', 'transparent'],
    // 片段占位符(SnippetController2 的 .snippet-placeholder;VS Code colorRegistry 默认 dark #ffffff33 / light #0a326433,边框无)
    'editor.snippetTabstopHighlightBackground': [[], 'rgba(255,255,255,0.2)', 'rgba(10,50,100,0.2)'],
    'editor.snippetTabstopHighlightBorder': [[], 'transparent', 'transparent'],
    // 终止点($0):VS Code 无底色,边框 dark #525252 / light #0a326433
    'editor.snippetFinalTabstopHighlightBackground': [[], 'transparent', 'transparent'],
    'editor.snippetFinalTabstopHighlightBorder': [[], '#525252', 'rgba(10,50,100,0.2)'],
    // 灯泡
    'editorLightBulb.foreground': [[], '#ffcc00', '#ddb100'],
    'editorLightBulbAutoFix.foreground': [[], '#75beff', '#007acc'],
    'inputValidation.infoBorder': [[], '#007acc', '#007acc'],
    'inputValidation.errorBorder': [[], '#be1100', '#be1100'],
    'inputValidation.errorBackground': [[], '#5a1d1d', '#f2dede'],
    'inputValidation.errorForeground': [[], g => g('editorWidget.foreground'), g => g('editorWidget.foreground')],
    'menu.background': [['dropdown.background'], '#3c3c3c', '#ffffff'],
    'menu.foreground': [['dropdown.foreground'], '#f0f0f0', '#616161'],
    'menu.border': [[], 'transparent', 'transparent'],
    // diff 编辑器。gutter / overview 在 Monaco 里没有默认值:gutter 透明,overview = 字级色透明度 ×2
    'diffEditor.insertedTextBackground': [[], '#9ccc2c33', '#9ccc2c40'],
    'diffEditor.removedTextBackground': [[], '#ff000033', '#ff000033'],
    'diffEditor.insertedLineBackground': [[], 'rgba(155,185,85,0.2)', 'rgba(155,185,85,0.2)'],
    'diffEditor.removedLineBackground': [[], 'rgba(255,0,0,0.2)', 'rgba(255,0,0,0.2)'],
    'diffEditorGutter.insertedLineBackground': [[], 'transparent', 'transparent'],
    'diffEditorGutter.removedLineBackground': [[], 'transparent', 'transparent'],
    'diffEditor.diagonalFill': [[], '#cccccc33', '#22222233'],
    // 折叠未改区域 / 移动块(Monaco diffEditor.* 默认值)
    'diffEditor.unchangedRegionBackground': [[], '#252526', '#f3f3f3'],
    'diffEditor.unchangedRegionForeground': [[], g => g('foreground'), g => g('foreground')],
    'diffEditor.unchangedRegionShadow': [[], g => g('widget.shadow'), g => g('widget.shadow')],
    'diffEditor.unchangedCodeBackground': [[], '#74747429', '#b8b8b829'],
    'diffEditor.move.border': [[], '#8b8b8b9c', '#8b8b8b9c'],
    'diffEditor.moveActive.border': [[], '#ffa500', '#ffa500'],
    'editorCodeLens.foreground': [[], '#999999', '#919191'],
    'diffEditorOverview.insertedForeground': [[], g => withAlpha(g('diffEditor.insertedTextBackground'), 2), g => withAlpha(g('diffEditor.insertedTextBackground'), 2)],
    'diffEditorOverview.removedForeground': [[], g => withAlpha(g('diffEditor.removedTextBackground'), 2), g => withAlpha(g('diffEditor.removedTextBackground'), 2)],
    'menu.selectionBackground': [['list.activeSelectionBackground'], '#04395e', '#0060c0'],
    'menu.selectionForeground': [['list.activeSelectionForeground'], '#ffffff', '#ffffff'],
    'menu.separatorBackground': [[], '#606060', '#d4d4d4'],
    'quickInput.background': [['editorWidget.background'], '#252526', '#f3f3f3'],
    'quickInput.foreground': [['editorWidget.foreground', 'foreground'], '#cccccc', '#616161'],
    'quickInputList.focusBackground': [['list.activeSelectionBackground'], '#04395e', '#0060c0'],
    'quickInputList.focusForeground': [['list.activeSelectionForeground'], '#ffffff', '#ffffff'],
    'pickerGroup.foreground': [[], '#3794ff', '#0066bf'],
    'pickerGroup.border': [[], '#3f3f46', '#cccedb'],
    'peekView.border': [['editorInfo.foreground'], '#3794ff', '#1a85ff'],
    'peekViewTitle.background': [[], '#252526', '#f3f3f3'],
    'peekViewTitleLabel.foreground': [[], '#ffffff', '#000000'],
    'peekViewTitleDescription.foreground': [[], 'rgba(204,204,204,0.7)', '#616161'],
    'peekViewEditor.background': [[], '#001f33', '#f2f8fc'],
    'peekViewEditorGutter.background': [['peekViewEditor.background'], '#001f33', '#f2f8fc'],
    'peekViewEditor.matchHighlightBackground': [[], 'rgba(255,143,0,0.6)', 'rgba(245,216,2,0.87)'],
    'peekViewResult.background': [[], '#252526', '#f3f3f3'],
    'peekViewResult.lineForeground': [[], '#bbbbbb', '#646465'],
    'peekViewResult.fileForeground': [[], '#ffffff', '#1e1e1e'],
    'peekViewResult.selectionBackground': [[], 'rgba(51,153,255,0.2)', 'rgba(51,153,255,0.2)'],
    'peekViewResult.selectionForeground': [[], '#ffffff', '#6c6c6c'],
    'peekViewResult.matchHighlightBackground': [[], 'rgba(234,92,0,0.3)', 'rgba(234,92,0,0.3)'],
    'badge.background': [[], '#4d4d4d', '#c4c4c4'],
    'badge.foreground': [[], '#ffffff', '#333333'],
    // 补全图标(Monaco suggest 用 symbolIcon.*)
    'symbolIcon.variableForeground': [[], '#75beff', '#007acc'],
    'symbolIcon.fieldForeground': [[], '#75beff', '#007acc'],
    'symbolIcon.functionForeground': [[], '#b180d7', '#652d90'],
    'symbolIcon.methodForeground': [[], '#b180d7', '#652d90'],
    'symbolIcon.classForeground': [[], '#ee9d28', '#d67e00'],
    'symbolIcon.enumeratorForeground': [[], '#ee9d28', '#d67e00'],
    'symbolIcon.interfaceForeground': [[], '#75beff', '#007acc'],
    'symbolIcon.propertyForeground': [['foreground'], '#cccccc', '#616161'],
    'symbolIcon.keywordForeground': [['foreground'], '#cccccc', '#616161'],
    'symbolIcon.moduleForeground': [['foreground'], '#cccccc', '#616161'],
    'symbolIcon.snippetForeground': [['foreground'], '#cccccc', '#616161'],
    'symbolIcon.typeParameterForeground': [['foreground'], '#cccccc', '#616161'],
}

/** 所有可解析的 VS Code 颜色键(themecss 为每个键出一个 CSS 变量)。 */
export const THEME_COLOR_KEYS: readonly string[] = Object.keys(REGISTRY)

/**
 * 解析一个 VS Code 颜色键:宿主 bg/fg/shell → colors.vscode(主题) → 回退键链 → registry 默认。
 * 未登记的键只查 shell/vscode,查不到返回 undefined。
 */
export function themeColor(c: ThemeColors, key: string): string | undefined {
    const cache = new Map<string, string | undefined>()
    const get = (k: string): string | undefined => {
        if (cache.has(k)) return cache.get(k)
        cache.set(k, undefined) // 防环
        const v = lookup(k)
        cache.set(k, v)
        return v
    }
    const own = (k: string): string | undefined => {
        if (k === 'editor.background') return c.bg
        if (k === 'editor.foreground') return c.fg
        const s = c.shell
        if (s) for (const f of Object.keys(SHELL_KEYS) as (keyof ThemeShell)[])
            if (SHELL_KEYS[f] === k && s[f]) return s[f]
        return c.vscode?.[k] || undefined
    }
    const lookup = (k: string): string | undefined => {
        const hit = own(k)
        // 同词底色全透明时(GitHub Dark 把颜色放在边框上),边不画,底色退回默认,高亮还在。
        const wordFill = k === 'editor.wordHighlightBackground' || k === 'editor.wordHighlightStrongBackground' || k === 'editor.wordHighlightTextBackground'
        if (hit && !(wordFill && isTransparent(hit))) return hit
        const def = REGISTRY[k]
        if (!def) return undefined
        for (const alt of def[0]) {
            const v = own(alt)
            if (v) return v
        }
        const d = c.dark ? def[1] : def[2]
        return typeof d === 'function' ? d(x => get(x) ?? '', x => !!own(x)) : d
    }
    return get(key)
}

/** 当前行高亮(Monaco renderLineHighlight 'line'):主题定义了不透明背景就填背景,否则画 2px 边框。 */
export function lineHighlight(c: ThemeColors): { background: string, border: string } {
    const bg = themeColor(c, 'editor.lineHighlightBackground')
    const themeBorder = c.vscode?.['editor.lineHighlightBorder']
    if (bg && !isTransparent(bg))
        return { background: bg, border: themeBorder ?? 'transparent' }
    return { background: 'transparent', border: themeColor(c, 'editor.lineHighlightBorder') ?? 'transparent' }
}

// hover/签名代码片段的 token 色缺省(主题 tokenColors 里没找到时):dark/light-plus 语义色。
const TOKEN_DEFAULTS: Record<'dark' | 'light', Required<ThemeTokenColors>> = {
    dark: { keyword: '#569cd6', type: '#4ec9b0', function: '#dcdcaa', variable: '#9cdcfe', string: '#ce9178', number: '#b5cea8' },
    light: { keyword: '#0000ff', type: '#267f99', function: '#795e26', variable: '#001080', string: '#a31515', number: '#098658' },
}

/** 浮层代码片段的 token 色:主题 tokenColors 取到的优先,缺的走 dark/light-plus。 */
export function floatingTokenColors(c: ThemeColors): Required<ThemeTokenColors> {
    const d = c.dark ? TOKEN_DEFAULTS.dark : TOKEN_DEFAULTS.light
    const t = c.tokens ?? {}
    const out = { ...d }
    for (const k of Object.keys(d) as (keyof ThemeTokenColors)[]) if (t[k]) out[k] = t[k]!
    return out
}

/** 行尾空白底色(lite-monaco 自有,VS Code 无对应键):淡红。 */
export function trailingSpaceColor(c: ThemeColors): string {
    return c.dark ? 'rgba(244,135,113,0.2)' : 'rgba(205,49,49,0.2)'
}

/** Monaco editorUnnecessaryCode.opacity 是颜色,取其 alpha 当不透明度。 */
export function unnecessaryOpacity(c: ThemeColors): number {
    const p = parseColor(themeColor(c, 'editorUnnecessaryCode.opacity') ?? '')
    return p ? Math.round(p[3] * 1000) / 1000 : 0.667
}

// —— 从 shiki 主题取色 ——

interface TokenRule { scope?: string | string[], settings?: { foreground?: string } }
interface ShikiThemeLike {
    bg: string
    fg: string
    type: 'light' | 'dark'
    colors?: Record<string, string>
    settings?: TokenRule[]
    tokenColors?: TokenRule[]
}

/** TextMate 规则里最贴近 scope 的前景色(规则 scope 是目标 scope 的点边界前缀,取最长)。 */
export function tokenColorFor(rules: readonly TokenRule[], scope: string): string | undefined {
    let best: string | undefined
    let bestLen = -1
    for (const r of rules) {
        const fg = r.settings?.foreground
        if (!fg || !r.scope) continue
        const sels = typeof r.scope === 'string' ? r.scope.split(',') : r.scope
        for (const raw of sels) {
            const sel = raw.trim()
            if (!sel || sel.includes(' ')) continue // 只认单段选择器,后代选择器不参与
            const hit = scope === sel || (scope.startsWith(sel) && scope.charCodeAt(sel.length) === 46)
            if (hit && sel.length > bestLen) {
                best = fg
                bestLen = sel.length
            }
        }
    }
    return best
}

/** shiki 主题 → ThemeColors。override(宿主 colors)逐项优先,缺的从主题补。 */
/**
 * 高亮器认得的主题名。Monaco 的 setTheme 对没定义过的名字回落 'vs'(@monaco-editor/react 默认传的 'light' 就是这种);
 * 这里同理:高亮器已经装了主题、却不认识这个名字,就用 vs 对应的 light-plus。高亮器还没起来(懒加载阶段)时原样返回。
 */
export function usableTheme(hl: object, theme: string): string {
    const loaded = (hl as { getLoadedThemes?(): string[] }).getLoadedThemes?.()
    if (!loaded?.length || loaded.includes(theme) || !loaded.includes('light-plus')) return theme
    return 'light-plus'
}

export function resolveThemeColors(
    hl: { getTheme?(name: string): ShikiThemeLike },
    theme: string,
    override?: ThemeColors,
): ThemeColors {
    let t: ShikiThemeLike | undefined
    try { t = hl.getTheme?.(theme) } catch { t = undefined }
    if (!t) return override ?? { bg: '#1e1e1e', fg: '#d4d4d4', dark: true }
    const rules = t.settings ?? t.tokenColors ?? []
    const tok = (...scopes: string[]) => {
        for (const s of scopes) {
            const v = tokenColorFor(rules, s)
            if (v) return v
        }
        return undefined
    }
    const tokens: ThemeTokenColors = {
        keyword: tok('storage.type', 'keyword'),
        type: tok('entity.name.type', 'support.type', 'entity.name.class'),
        function: tok('entity.name.function', 'support.function'),
        variable: tok('variable.other.readwrite', 'variable', 'meta.definition.variable'),
        string: tok('string.quoted', 'string'),
        number: tok('constant.numeric', 'constant'),
    }
    const base: ThemeColors = { bg: t.bg, fg: t.fg, dark: t.type === 'dark', vscode: t.colors ?? {}, tokens }
    if (!override) return base
    return {
        ...base,
        ...override,
        vscode: { ...base.vscode, ...override.vscode },
        tokens: { ...tokens, ...override.tokens },
    }
}

// 括号对着色调色板:主题精确值优先,缺项回退 VS Code 默认(暗 #FFD700/#DA70D6/#179FFF,亮三色)。
// 按嵌套深度 depth % 3 循环 —— 同 VS Code 默认只定义 3 色再循环。
export function bracketPalette(c: ThemeColors): string[] {
    const v = (k: string) => themeColor(c, k)
    return c.dark
        ? [v('editorBracketHighlight.foreground1') ?? '#FFD700', v('editorBracketHighlight.foreground2') ?? '#DA70D6', v('editorBracketHighlight.foreground3') ?? '#179FFF']
        : [v('editorBracketHighlight.foreground1') ?? '#0431FA', v('editorBracketHighlight.foreground2') ?? '#319331', v('editorBracketHighlight.foreground3') ?? '#7B3814']
}

// overview ruler / minimap 调色板(canvas 用,JS 色值)。诊断三色走 editorOverviewRuler.*,其余同前。
export function rulerPalette(c: ThemeColors): RulerPalette {
    const v = (k: string) => themeColor(c, k) ?? ''
    return {
        error: v('editorOverviewRuler.errorForeground'),
        warning: v('editorOverviewRuler.warningForeground'),
        info: v('editorOverviewRuler.infoForeground'),
        cursor: v('editorCursor.foreground'),
        // 滚动条搜索命中:暖金橙,与灰系的 cursor/wordHighlight 拉开色相一眼可分。Monaco 原值 rgba(209,134,22,.49)
        // 带 0.49 透明压暗轨上发土发棕,改实色干净金橙(明度更高、不掺底噪)。
        match: c.dark ? '#e6a23c' : '#e07c00',
        // minimap 同词高亮投影:用 Monaco 缩略图**专用**色 minimap.selectionOccurrenceHighlight(#676767 不透明实灰)。
        wordHighlight: c.vscode?.['minimap.selectionOccurrenceHighlight'] ?? (c.dark ? '#676767' : '#c9c9c9'),
        // minimap 选中文本同串高亮:Monaco minimap.selectionHighlight(#264f78 钢蓝)。
        minimapSelection: c.vscode?.['minimap.selectionHighlight'] ?? (c.dark ? '#264f78' : '#add6ff'),
        // minimap 当前行横条。
        currentLine: c.dark ? '#ffffff' : '#000000',
        // minimap 查找命中:Monaco minimap.findMatchHighlight(明暗都是 #d18616)。
        minimapFindMatch: c.vscode?.['minimap.findMatchHighlight'] ?? '#d18616',
        // 概览尺(Monaco decorationsOverviewRuler):光标 editorCursor × 0.7,其余 editorOverviewRuler.*
        overview: {
            cursor: withAlpha(v('editorCursor.foreground'), 0.7),
            cursorPrimary: withAlpha(v('editorMultiCursor.primary.foreground'), 0.7),
            cursorSecondary: withAlpha(v('editorMultiCursor.secondary.foreground'), 0.7),
            findMatch: v('editorOverviewRuler.findMatchForeground'),
            wordHighlight: v('editorOverviewRuler.wordHighlightForeground'),
            wordHighlightStrong: v('editorOverviewRuler.wordHighlightStrongForeground'),
            wordHighlightText: v('editorOverviewRuler.wordHighlightTextForeground'),
            selectionHighlight: v('editorOverviewRuler.selectionHighlightForeground'),
            bracketMatch: v('editorOverviewRuler.bracketMatchForeground'),
            rangeHighlight: v('editorOverviewRuler.rangeHighlightForeground'),
            error: v('editorOverviewRuler.errorForeground'),
            warning: v('editorOverviewRuler.warningForeground'),
            info: v('editorOverviewRuler.infoForeground'),
            border: v('editorOverviewRuler.border'),
            background: c.vscode?.['editorOverviewRuler.background'],
        },
    }
}
