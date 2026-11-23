 // 主题 CSS：结构样式只注入一次(全页共享),颜色全部走 CSS 变量,每个编辑器实例在自己的 .cm-editor
// (以及挂到 body 的浮层根元素)上设变量值 —— 同页多实例、一暗一亮、同主题不同 bg 互不覆盖。
// token 颜色是 Shiki 内联的,不经这里。

import { THEME_COLOR_KEYS, themeColor, lineHighlight, unnecessaryOpacity, withAlpha, floatingTokenColors, trailingSpaceColor, type ThemeColors } from './theme'
import { CODICON_ICON_CSS, ensureCodiconFont } from '../core/chrome/codicon-font'
import { keyOS, type KeyOS } from '../core/keyos'
import { diffExtraCSS } from '../core/diff/diffcss'

/** VS Code 颜色键 → CSS 变量名(`editorWidget.background` → `--lm-editorWidget-background`)。 */
export function themeVarName(key: string): string {
    return '--lm-' + key.split('.').join('-')
}
const v = (key: string) => `var(${themeVarName(key)})`

// Monaco 0.52 深浅主题这四条边色默认 null(highlightDecorations.js / editorColors.js)。
// standaloneThemeService 只在 getColor 有值时写 CSS 变量。主题自己写了(含 transparent)就原样写出。
// wordHighlightTextBorder 默认引用 wordHighlightBorder。
const NULL_BORDER_KEYS = ['editor.selectionHighlightBorder', 'editor.wordHighlightBorder', 'editor.wordHighlightStrongBorder', 'editor.wordHighlightTextBorder']

/** 一个实例的全部主题变量(名 → 值)。设在 .cm-editor 和浮层根元素的 inline style 上。 */
export function themeVars(colors: ThemeColors): Record<string, string> {
    const out: Record<string, string> = {}
    for (const k of THEME_COLOR_KEYS) {
        const color = themeColor(colors, k) ?? 'transparent'
        const own = colors.vscode?.[k] || (k === 'editor.wordHighlightTextBorder' ? colors.vscode?.['editor.wordHighlightBorder'] : '')
        if (NULL_BORDER_KEYS.includes(k) && !own) continue
        out[themeVarName(k)] = color
    }
    const lh = lineHighlight(colors)
    out['--lm-line-highlight-bg'] = lh.background
    out['--lm-line-highlight-border'] = lh.border
    out['--lm-unnecessary-opacity'] = String(unnecessaryOpacity(colors))
    out['--lm-color-scheme'] = colors.dark ? 'dark' : 'light'
    out['--lm-trailing-space'] = trailingSpaceColor(colors)
    // Monaco hover 行间分隔线 / hr = editorHoverWidget.border.transparent(0.5)
    out['--lm-hover-separator'] = withAlpha(themeColor(colors, 'editorHoverWidget.border') ?? 'transparent', 0.5)
    const tok = floatingTokenColors(colors)
    for (const k of Object.keys(tok) as (keyof typeof tok)[]) out[`--lm-tok-${k}`] = tok[k]
    return out
}

/** 变量表 → `a: b; c: d` 声明串。 */
export function themeVarsDecl(vars: Record<string, string>): string {
    return Object.keys(vars).map(k => `${k}: ${vars[k]};`).join(' ')
}

// Monaco squiggly(editor/contrib/... ERROR squiggle 的 6×3 多边形波),这里当 mask 用,色由变量给。
const SQUIGGLE = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 6 3' height='3' width='6'><g fill='#000'><polygon points='5.5,0 2.5,3 1.1,3 4.1,0'/><polygon points='4,0 6,2 6,0.6 5.4,0'/><polygon points='0,2 1,3 2.4,3 0,0.6'/></g></svg>`)}")`

// Monaco hint 级 marker:范围起点下方三个小点(codeEditorWidget getDotDotDotSVGData,12×3),同样当 mask 用
const DOTDOTDOT = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' height='3' width='12'><g fill='#000'><circle cx='1' cy='1' r='1'/><circle cx='5' cy='1' r='1'/><circle cx='9' cy='1' r='1'/></g></svg>`)}")`

// 浮层字体(Monaco):界面字 = standalone 的 UI 字体栈;行内 code = --monaco-monospace-font。
// 代码类内容(签名、marker 消息、代码块、重命名框)不写字体,继承 .cm-editor 的编辑器字体(= Monaco applyFontInfo)。
const UI_FONT = `-apple-system, BlinkMacSystemFont, "Segoe WPC", "Segoe UI", "HelveticaNeue-Light", system-ui, "Ubuntu", "Droid Sans", sans-serif`
const MONO_FONT = `"SF Mono", Monaco, Menlo, Consolas, "Ubuntu Mono", "Liberation Mono", "DejaVu Sans Mono", "Courier New", monospace`

/** 挂到 body 的浮层根元素(继承不到 .cm-editor 的变量,需各自带一份)。 */
export const FLOATING_ROOTS = ['.cm-completionList', '.cm-context-menu', '.cm-picker', '.cm-action-widget']

// 结构 CSS:与颜色无关,全页注入一次。
export function liteMonacoBaseCSS(os: KeyOS = keyOS): string {
    // Monaco EDITOR_FONT_DEFAULTS 按平台分字体/字号;行高 = round(fontSize × GOLDEN_LINE_HEIGHT_RATIO)(mac 1.5,其余 1.35)
    const font = os === 'mac' ? `Menlo, Monaco, "Courier New", monospace; font-size: 12px; line-height: 1.5; line-height: round(1.5em, 1px)`
        : os === 'win' ? `Consolas, "Courier New", monospace; font-size: 14px; line-height: 1.35; line-height: round(1.35em, 1px)`
        : `"Droid Sans Mono", "monospace", monospace; font-size: 14px; line-height: 1.35; line-height: round(1.35em, 1px)`
    return `
${CODICON_ICON_CSS}
/* 填满宿主容器(同 Monaco:容器须有尺寸);min-height:0 让它在 flex 列里可被压缩而不是撑开。
   字体照 Monaco 平台默认(mac Menlo 12px / 18px),行高取整到像素;不支持 CSS round() 的浏览器退回比例。
   连字关掉(Monaco fontLigatures 默认 false → "liga" 0, "calt" 0) */
.cm-editor { height: 100%; min-height: 0; box-sizing: border-box; background: var(--lm-editor-background); color: var(--lm-editor-foreground); color-scheme: var(--lm-color-scheme); font-family: ${font}; font-feature-settings: "liga" 0, "calt" 0; overflow: hidden; position: relative; display: flex; }
/* wrapOnEscapedLineFeeds:字面 \\n 之后强制折行(伪元素换行,不进 DOM 文本) */
.cm-escapedLF::after { content: '\\A'; white-space: pre; }
/* scrollOnMiddleClick 会话:起点小圆点 + all-scroll 光标(Monaco middleScroll.css) */
.cm-middleScrollDot { cursor: all-scroll; position: absolute; z-index: 1; background-color: var(--lm-editor-foreground, white); border: 1px solid var(--lm-editor-background, black); opacity: 0.5; width: 5px; height: 5px; border-radius: 50%; transform: translate(-50%, -50%); pointer-events: none; }
.cm-editor.cm-middleScrolling * { cursor: all-scroll; }
/* isolation:让 .cm-highlightLayer 的 z-index:-1 落在正文下、编辑器背景上 */
.cm-scroller { overflow: auto; flex: 1; min-width: 0; display: flex; position: relative; isolation: isolate; scrollbar-width: none; }
.cm-scroller::-webkit-scrollbar { width: 0; height: 0; }
/* clip 固定贴 editor 高;内层 gutters 可超高 + translateY,裁在 clip 内(修滚到底行号被 overflow 裁没) */
.cm-gutters-clip { flex-shrink: 0; align-self: stretch; overflow: hidden; position: relative; z-index: 3; }
.cm-gutters { background: var(--lm-editorGutter-background); padding: 8px 0; box-sizing: border-box; user-select: none; position: relative; }
/* gutter 几何照 Monaco:行号列 = max(5, 位数) 个数字宽(lineNumbersMinChars=5),
   折叠列 26px(lineDecorationsWidth 10 + folding 16),正文从 margin 右缘起 */
.cm-gutterElement {
  padding: 0; color: var(--lm-editorLineNumber-foreground);
  font: inherit;
  display: flex; align-items: center; justify-content: flex-start; gap: 0;
  box-sizing: border-box; cursor: default;
}
.cm-lineNumber { text-align: right; flex: 0 0 auto; width: 5ch; box-sizing: content-box; }
.cm-gutterElement.cm-activeLineGutter { color: var(--lm-editorLineNumber-activeForeground); }
/* Monaco folding:codicon chevron,默认透明,鼠标在 gutter 上才显;已折叠常显 */
.cm-foldMarker {
  width: 26px; height: 100%; flex-shrink: 0; padding-left: 4px;
  box-sizing: border-box; cursor: default;
  color: var(--lm-editorGutter-foldingControlForeground);
  opacity: 0; transition: opacity 0.5s;
  line-height: 1;
}
/* 压过 .codicon{display:inline-block},强制列内居中;字号 140% 同 Monaco .cldr */
.cm-foldMarker.codicon {
  display: inline-flex !important; align-items: center; justify-content: center;
  font-size: 140% !important;
}
.cm-foldMarker-active { cursor: pointer; }
/* showFoldingControls:'always' 折叠箭头常显;'never' 连已折叠的箭头也不画(Monaco NO_CONTROLS_* 装饰没有字形) */
.cm-fold-always .cm-foldMarker-active { opacity: 1; }
.cm-fold-never .cm-foldMarker-active { visibility: hidden; pointer-events: none; }
.cm-gutterElement { position: relative; }
.cm-lineDecorations { width: 10px; flex-shrink: 0; }
.cm-lineNumber { position: relative; }
.cm-lineDecoration { position: absolute; top: 0; left: 100%; width: 10px; height: 100%; }
/* Monaco folding.css:悬停行号区淡入(0.5s,同淡出);折起的常显 */
.cm-foldMarker-collapsed,
.cm-gutters:hover .cm-foldMarker-active { opacity: 1; }
.cm-content { padding: 8px 0; outline: none; white-space: pre; flex: 1; min-width: 0; box-sizing: content-box; align-self: start; tab-size: var(--lm-tab-size, 4); }
/* M1.8 word wrap:pre-wrap + 吃满 scroller 宽,heightMap 用实测行高 */
.cm-content.cm-lineWrapping {
  white-space: break-spaces; overflow-wrap: anywhere; word-break: normal;
  width: 100%; max-width: 100%; min-width: 0; box-sizing: border-box; align-self: stretch;
}
.cm-editor.cm-lineWrapping .cm-scroller { overflow-x: hidden; }
/* wrappingIndent 'same'(Monaco 默认):续行缩进到原行缩进处。--cm-wrap-indent 由 materialize 按行首空白写入 */
/* wrappingIndent indent / deepIndent:在原行缩进之上多缩 1 / 2 个缩进单位(--cm-wrap-extra 由 EditorView.applyViewOptions 写);none:续行顶格 */
.cm-content.cm-lineWrapping .cm-line { padding-right: 2px; padding-left: calc(var(--cm-wrap-indent, 0px) + var(--cm-wrap-extra, 0px)); text-indent: calc(-1 * (var(--cm-wrap-indent, 0px) + var(--cm-wrap-extra, 0px))); }
.cm-wrapIndent-none .cm-content.cm-lineWrapping .cm-line { padding-left: 0; text-indent: 0; }
/* wordBreak keepAll:CJK 不在字间折行 */
.cm-wordBreak-keepAll .cm-content.cm-lineWrapping { word-break: keep-all; overflow-wrap: break-word; }
/* wordWrap wordWrapColumn:正文钉在 N 列宽,窄视口里横向可滚 */
.cm-editor.cm-lineWrapping.cm-wrapColumn .cm-scroller { overflow-x: auto; }
/* 正文紧贴 gutter(Monaco 无左内边距),右侧留 8px */
.cm-line { padding: 0 8px 0 0; }
/* 含 RTL 隔离的行末放一个零宽 LRM:隔离里尾随的空格不再是「行尾空白」(UAX#9 L1 会把它重置回 LTR 的右端),
   和 Monaco 把空格写成 nbsp 的效果一致——敲完希伯来词按下空格,空格留在文字左边,光标不跳到右端 */
.cm-line:has(> [dir=rtl])::after { content: "\\200E"; }
/* 超长文本里隔一个包的壳(buildtile.ts 的 CHUNK_CLASS):只为让 Blink 不把相邻文本节点合成一次排版,看不出区别 */
.lc-ck { font-kerning: normal; }
/* 选区相关的行/框高亮层(当前行、括号匹配、同词):Monaco view-overlays,画在正文下面 */
/* className 装饰(Monaco .cdr 行盒):行内 span 的内容区是字体框,竖向 padding 补到行高,不影响行布局 */
.cm-decoBox { padding: var(--lm-deco-pad, 0) 0; }
.cm-highlightLayer { position: absolute; top: 0; left: 0; width: 100%; height: 0; z-index: -1; pointer-events: none; overflow: visible; }
.cm-highlightLayer > div { position: absolute; box-sizing: border-box; }
/* 当前行(Monaco current-line):折行时每个视觉行铺底色,边框只在光标所在的视觉行(current-line-exact) */
.cm-currentLine { background: var(--lm-line-highlight-bg); }
.cm-hl-margin .cm-gutterElement.cm-activeLineGutter { background: var(--lm-line-highlight-bg); }
.cm-no-foldHighlight .cm-foldedBackground { background: none !important; }
.cm-currentLine-exact { border: 2px solid var(--lm-line-highlight-border); }
.cm-bracketBox { background: var(--lm-editorBracketMatch-background); border: 1px solid var(--lm-editorBracketMatch-border); }
/* 选中串(Monaco .focused .selectionHighlight):底色常在,边只在聚焦时写。边色默认 null,变量缺席则这条 border 整条失效 */
.cm-selectionMatchBox { background-color: var(--lm-editor-selectionHighlightBackground); box-sizing: border-box; }
.cm-editor.cm-focused .cm-selectionMatchBox { border: 1px solid var(--lm-editor-selectionHighlightBorder); }
.cm-unicodeHighlight { border: 1px solid ${v('editorUnicodeHighlight.border')}; background-color: ${v('editorUnicodeHighlight.background')}; }
/* 失焦后选中串高亮还在,颜色减半(Monaco 非 .focused 时 selectionHighlight 取 transparent(0.5)、不画边框) */
.cm-editor:not(.cm-focused) .cm-selectionMatchBox { opacity: 0.5; }
/* 文本同词:只铺底色。边会在词上画出一圈框,不写。 */
.cm-wordHighlightTextBox { background-color: var(--lm-editor-wordHighlightTextBackground); box-sizing: border-box; }
/* HTML 配对标签名(documentHighlight Read = wordHighlight) */
.cm-wordHighlightBox { background-color: var(--lm-editor-wordHighlightBackground); box-sizing: border-box; }
/* M2.1 Peek(Monaco ReferenceWidget):zone 里箭头 + 上下 1px 边框的盒子,标题栏 13px 界面字,正文左预览右列表 */
.cm-peek { position: absolute; left: 0; z-index: 40; }
.cm-peek-arrow { position: absolute; width: 0; height: 0; border-style: solid; border-color: transparent; border-bottom-color: ${v('peekView.border')}; }
.cm-peek-box {
  position: absolute; left: 0; right: 0; overflow: hidden;
  border-top: 1px solid ${v('peekView.border')}; border-bottom: 1px solid ${v('peekView.border')};
  color: var(--lm-editor-foreground);
}
.cm-peek-head { display: flex; box-sizing: border-box; background: ${v('peekViewTitle.background')}; font-family: ${UI_FONT}; }
.cm-peek-title { display: flex; align-items: baseline; font-size: 13px; margin-left: 20px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cm-peek-filename { color: ${v('peekViewTitleLabel.foreground')}; }
.cm-peek-dirname { color: ${v('peekViewTitleDescription.foreground')}; font-size: 0.9em; margin-left: 0.5em; }
.cm-peek-dirname:empty, .cm-peek-meta:empty { display: none; }
.cm-peek-meta::before { content: '-'; padding: 0 0.3em; }
.cm-peek-actions { flex: 1; display: flex; align-items: center; justify-content: flex-end; padding-right: 2px; }
.cm-peek-actions a.cm-peek-close { display: flex; align-items: center; width: 16px; height: 16px; padding: 3px; border-radius: 5px; font-size: 16px; line-height: 16px; cursor: pointer; color: inherit; }
.cm-peek-close:hover { background: ${v('toolbar.hoverBackground')}; }
.cm-peek-body { position: relative; display: flex; border-top: 1px solid ${v('peekView.border')}; }
/* 预览:嵌套编辑器换 peek 的底色和行号区底色;主题给半透明色时底下垫编辑器底色 */
.cm-peek-preview { flex: none; height: 100%; }
.cm-peek-preview > .cm-editor { background: linear-gradient(${v('peekViewEditor.background')}, ${v('peekViewEditor.background')}) ${v('editor.background')}; }
.cm-peek-preview .cm-gutters { background: ${v('peekViewEditorGutter.background')}; }
.cm-peek-match { display: inline-block; background-color: ${v('peekViewEditor.matchHighlightBackground')}; }
.cm-peek-sash { position: absolute; top: 0; bottom: 0; width: 4px; z-index: 1; cursor: col-resize; }
/* 列表:Monaco list 行高 23,界面字;选中 = peekViewResult.selection*,有焦点时焦点行 1px focusBorder 内描边 */
.cm-peek-tree {
  flex: 1; min-width: 0; height: 100%; overflow: auto; outline: none;
  background: ${v('peekViewResult.background')}; color: ${v('peekViewResult.lineForeground')};
  font-family: ${UI_FONT}; line-height: 23px; cursor: pointer; user-select: none;
}
.cm-peek-ref, .cm-peek-file { height: 23px; box-sizing: border-box; white-space: pre; overflow: hidden; padding-left: 16px; }
.cm-peek-ref-child { padding-left: 30px; }
.cm-peek-file { display: flex; align-items: center; padding-left: 8px; color: ${v('peekViewResult.fileForeground')}; }
.cm-peek-twistie { flex: none; width: 16px; margin-right: 6px; text-align: center; }
.cm-peek-file-dir { margin-left: 0.5em; font-size: 0.9em; opacity: 0.7; overflow: hidden; text-overflow: ellipsis; }
.cm-peek-count {
  margin: 0 12px 0 auto; padding: 3px 6px; min-width: 18px; min-height: 18px; box-sizing: border-box; border-radius: 11px;
  font-size: 11px; line-height: 11px; text-align: center; background: ${v('badge.background')}; color: ${v('badge.foreground')};
}
.cm-peek-hl { background: ${v('peekViewResult.matchHighlightBackground')}; }
.cm-peek-tree > :hover:not(.cm-peek-ref-selected) { background: ${v('list.hoverBackground')}; }
.cm-peek-ref-selected { background: ${v('peekViewResult.selectionBackground')}; color: ${v('peekViewResult.selectionForeground')}; }
.cm-peek-tree:focus .cm-peek-ref-focused { outline: 1px solid ${v('focusBorder')}; outline-offset: -1px; }
/* M2.3 sticky scroll(Monaco stickyScroll:行号 + 语法色,底部阴影) */
.cm-sticky-scroll {
  position: absolute; top: 0; left: 0; right: 0; z-index: 25;
  pointer-events: none; display: none; overflow: hidden;
  background: ${v('editorStickyScroll.background')};
  box-shadow: ${v('editorStickyScroll.shadow')} 0 4px 2px -2px;
  font: inherit;
}
.cm-sticky-line {
  position: absolute; left: 0; right: 0;
  pointer-events: auto; cursor: pointer;
  white-space: pre; overflow: hidden; tab-size: var(--lm-tab-size, 4);
  background: ${v('editorStickyScroll.background')};
  color: var(--lm-editor-foreground);
}
.cm-sticky-line:hover .cm-sticky-code { background: ${v('editorStickyScrollHover.background')}; }
.cm-sticky-ln { position: absolute; left: 0; top: 0; bottom: 0; z-index: 1; box-sizing: border-box; text-align: left; color: ${v('editorLineNumber.foreground')}; background: ${v('editorStickyScroll.background')}; }
.cm-sticky-ln > span { display: inline-block; width: 5ch; text-align: right; }
.cm-sticky-code { position: absolute; top: 0; bottom: 0; right: 0; overflow: hidden; }
.cm-sticky-text { white-space: pre; }
/* M2.2 lightbulb(Monaco lightBulbWidget.css):div,字形在 textContent(\\uea61),字体来自 .codicon[class*="codicon-"]。
   display 不加 !important:显隐靠 JS 写的 inline display:none。
   选择器带 div:和 .codicon[class*="codicon-"](display:inline-block)同为 (0,2,0),宿主的 codicon.css 后加载会盖掉 flex。
   ::before 清空:宿主页若另带 codicon.css(它给灯泡类定义了 :before 字形),不会叠出第二个灯泡 */
div.cm-lightbulb.codicon {
  position: absolute; z-index: 30; width: 16px; height: 16px; padding: 0; box-sizing: border-box;
  display: flex; align-items: center; justify-content: center;
  border: none; background: transparent; cursor: pointer;
  color: ${v('editorLightBulb.foreground')};
}
div.cm-lightbulb.codicon::before { content: none; }
/* 放不进行内时挂在 gutter 最左(Monaco glyph-margin 里的 gutter-lightbulb,同色) */
div.cm-lightbulb.codicon.cm-lightbulb-gutter { width: 20px; height: 20px; }
/* 当前行改由 .cm-highlightLayer 画(.cm-activeLine 只留作类钩子,不上色,免得盖掉缩进线背景) */
.cm-selectionMatch { background-color: ${v('editor.selectionHighlightBackground')}; }
/* Monaco .mtkcontrol;.unicode-highlight 的框在 .cm-highlightLayer 里 */
.cm-controlChar { color: rgb(255, 255, 255) !important; background: rgb(150, 0, 0) !important; }
.cm-trailingSpace { background-color: var(--lm-trailing-space); }
/* 语义同词高亮(TS documentHighlights):读 = wordHighlightText,写 = wordHighlightStrong;只铺底色,不画边。
   wordHighlight(Read)TS 不出,留给宿主。selectionlayer 的文本同词另画 .cm-wordHighlightTextBox,mark 本身不进 DOM */
.cm-wordHighlightText { background-color: ${v('editor.wordHighlightTextBackground')}; box-sizing: border-box; }
.cm-wordHighlight { background-color: ${v('editor.wordHighlightBackground')}; box-sizing: border-box; }
.cm-wordHighlightStrong { background-color: ${v('editor.wordHighlightStrongBackground')}; box-sizing: border-box; }
/* CodeLens(languages.registerCodeLensProvider):行上方 view zone 里的一行命令链接 */
.codelens-decoration { color: ${v('editorCodeLens.foreground')}; white-space: nowrap; overflow: hidden; box-sizing: border-box; }
.codelens-decoration a { color: inherit; cursor: pointer; text-decoration: none; }
.codelens-decoration a:hover { color: ${v('editorLink.activeForeground')}; text-decoration: underline; }
.cm-unnecessary { opacity: var(--lm-unnecessary-opacity); }
.cm-deprecated { text-decoration: line-through; }
.cm-inlayHint { color: ${v('editorHint.foreground')}; font-style: italic; opacity: 0.85; user-select: none; }
/* SnippetController2 的占位符装饰(Monaco snippetSession.ts 的 className;色取 editor.snippetTabstop* 的默认值) */
.snippet-placeholder { background-color: ${v('editor.snippetTabstopHighlightBackground')}; outline: ${v('editor.snippetTabstopHighlightBorder')} solid 1px; min-width: 2px; }
.finish-snippet-placeholder { background-color: ${v('editor.snippetFinalTabstopHighlightBackground')}; outline: ${v('editor.snippetFinalTabstopHighlightBorder')} solid 1px; }
/* 查找命中改由 .cm-findLayer 画(Monaco findMatch / currentFindMatch / findScope 是满行高的 className 装饰,在正文下);
   cm-searchMatch mark 只留类钩子 */
.cm-findLayer { position: absolute; top: 0; left: 0; width: 100%; height: 0; z-index: -1; pointer-events: none; overflow: visible; }
.cm-findLayer > div { position: absolute; box-sizing: border-box; }
.cm-findScope { background-color: ${v('editor.findRangeHighlightBackground')}; }
.cm-findMatch { background-color: ${v('editor.findMatchHighlightBackground')}; border: 1px solid ${v('editor.findMatchHighlightBorder')}; }
.cm-currentFindMatch { background-color: ${v('editor.findMatchBackground')}; border: 2px solid ${v('editor.findMatchBorder')}; padding: 1px; }
/* Monaco find-widget 1:1(结构/几何/色,见 findWidget.css) */
.cm-find-widget {
  position: absolute; top: 0; right: var(--cm-minimap-w, 0px); z-index: 35;
  width: 419px; max-width: calc(100% - 36px); height: 33px; overflow: hidden;
  line-height: 19px; padding: 0 4px; box-sizing: border-box;
  transform: translateY(calc(-100% - 10px)); transition: transform 200ms linear, height 0s;
  /* widget.border 用内阴影画:Monaco 主题没给这个键时边框不存在、不占宽(透明 1px 边框会把里面全推右 1px) */
  box-shadow: 0 0 8px 2px ${v('widget.shadow')}, inset 1px 0 0 ${v('widget.border')}, inset -1px 0 0 ${v('widget.border')}, inset 0 -1px 0 ${v('widget.border')};
  color: ${v('editorWidget.foreground')};
  border-bottom-left-radius: 4px; border-bottom-right-radius: 4px;
  background: ${v('editorWidget.background')};
  font-family: -apple-system, system-ui, "Segoe WPC", "Segoe UI", sans-serif; font-size: 12px;
}
/* find-widget 让出右侧:Monaco overlayWidgets TOP_RIGHT_CORNER right = 2 × verticalScrollbarWidth + minimapWidth,
   与竖条此刻是否可见无关(vertical:'hidden' 仍算 14)。minimap 宽随编辑器宽变(EditorLayoutInfoComputer),由 minimap.ts 写到本 .cm-editor
   的 --cm-minimap-w(各实例各自一份;关掉 minimap 即无此变量 → 0)。右边有自绘竖条或概览列(14px)→ +28;
   都没有 = Monaco verticalScrollbarSize 0 → 贴 minimap(没 minimap 就贴右缘),对照页实测见 /tmp/lc-hunt/r5/N/findpos.ts。 */
.cm-editor:has(> .cm-scrollbar) .cm-find-widget { right: calc(var(--cm-minimap-w, 0px) + 28px); }
.cm-editor:has(> .cm-overviewRuler) .cm-find-widget { right: calc(var(--cm-minimap-w, 0px) + 28px); }
.cm-find-widget.visible { transform: translateY(0); }
/* 高度随查找 / 替换框的行数变(Monaco _getHeight),由 search.ts 写到 style.height */
.cm-find-widget > .cm-find-part,
.cm-find-widget > .cm-replace-part {
  margin: 3px 25px 0 17px; font-size: 12px; display: flex; align-items: flex-start;
}
.cm-find-widget > .cm-replace-part { display: none; }
.cm-find-widget.replaceToggled > .cm-replace-part { display: flex; }
/* 左侧 chevron:高度撑满 widget;codicon 全局 display:inline-block 会盖掉 flex,须更高选择器强制居中 */
.cm-find-widget .cm-find-toggle-replace.codicon {
  position: absolute; top: 0; left: 3px; width: 18px; height: 100%;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; border-radius: 0; color: inherit; box-sizing: border-box;
  line-height: 1; font-size: 16px; padding: 0;
}
.cm-find-widget .cm-find-toggle-replace.codicon::before {
  display: block; line-height: 16px; width: 16px; height: 16px;
}
.cm-find-toggle-replace:hover { background: ${v('toolbar.hoverBackground')}; }
.cm-find-close {
  position: absolute; top: 5px; right: 4px; width: 16px; height: 16px; padding: 3px;
  border-radius: 5px; display: flex; align-items: center; justify-content: center;
  cursor: pointer; color: inherit; box-sizing: content-box;
}
.cm-find-close:hover { background: ${v('toolbar.hoverBackground')}; }
.cm-find-input-box {
  position: relative; display: flex; flex: 1; min-width: 0; height: 25px; box-sizing: border-box;
  background: ${v('input.background')};
  border: 1px solid ${v('input.border')}; border-radius: 2px;
}
.cm-find-input-box:focus-within { border-color: ${v('focusBorder')}; }
.cm-find-input {
  flex: 1; min-width: 0; height: 100%; border: 0; outline: none; background: transparent;
  color: ${v('input.foreground')}; font-size: 13px; line-height: 19px;
  font-family: -apple-system, system-ui, "Segoe WPC", "Segoe UI", sans-serif;
  padding: 2px 66px 2px 6px; box-sizing: border-box;
  resize: none; overflow: hidden; white-space: pre; margin: 0; display: block;
}
.cm-replace-input-box .cm-find-input { padding-right: 26px; }
.cm-find-input::placeholder { color: ${v('input.placeholderForeground')}; }
.cm-find-input-toggles {
  position: absolute; top: 2px; right: 1px; display: flex; align-items: center; gap: 2px;
}
.cm-find-toggle-opt {
  width: 20px; height: 20px; padding: 1px; border-radius: 3px; border: 1px solid transparent;
  display: flex; align-items: center; justify-content: center; cursor: pointer;
  color: inherit; box-sizing: border-box;
}
.cm-find-toggle-opt:hover { background: ${v('toolbar.hoverBackground')}; }
.cm-find-toggle-opt.checked {
  color: ${v('inputOption.activeForeground')};
  background: ${v('inputOption.activeBackground')};
  border-color: ${v('inputOption.activeBorder')};
}
/* find-in-selection 在 actions 列,Monaco 同款略宽 22px */
.cm-find-selection {
  width: 22px; height: 22px; padding: 3px; border-radius: 5px; margin-left: 2px;
  box-sizing: border-box;
}
.cm-find-actions, .cm-replace-actions {
  height: 25px; display: flex; align-items: center; flex-shrink: 0;
}
.cm-matches-count {
  display: flex; margin: 0 0 0 3px; padding: 2px 0 0 2px; height: 25px;
  box-sizing: border-box; text-align: center; line-height: 23px;
  min-width: 69px; color: inherit; white-space: nowrap; font-size: 12px;
}
.cm-find-widget.no-results .cm-matches-count { color: ${v('errorForeground')}; }
/* 非法正则(Monaco InputBox validation error):框红边 + 框下提示,提示挂在 .cm-editor 上不被 widget 的 overflow 裁掉 */
.cm-find-input-box.cm-find-invalid, .cm-find-input-box.cm-find-invalid:focus-within { border-color: ${v('inputValidation.errorBorder')}; }
.cm-find-message {
  position: absolute; z-index: 36; box-sizing: border-box; padding: 0.4em; margin-top: -1px;
  font-size: 12px; line-height: 17px; overflow: hidden; word-wrap: break-word; text-align: left;
  font-family: -apple-system, system-ui, "Segoe WPC", "Segoe UI", sans-serif;
  color: ${v('inputValidation.errorForeground')}; background: ${v('inputValidation.errorBackground')};
  border: 1px solid ${v('inputValidation.errorBorder')};
}
/* Monaco find-widget 的 sash:左缘 2px,拖宽 / 双击最大化 */
.cm-find-sash {
  position: absolute; top: 0; left: 0; width: 2px; height: 100%; cursor: col-resize;
  background: ${v('editorWidget.resizeBorder')};
}
.cm-find-btn {
  width: 16px; height: 16px; padding: 3px; border-radius: 5px; margin-left: 3px;
  display: flex; align-items: center; justify-content: center; cursor: pointer;
  color: inherit; flex-shrink: 0;
  /* Monaco .button 是 content-box:16 + 2×3 = 22。显式写,宿主页的全局 border-box(Tailwind preflight)会把它压回 16 */
  box-sizing: content-box;
}
.cm-find-btn:hover:not(.disabled) { background: ${v('toolbar.hoverBackground')}; }
.cm-find-btn.disabled {
  color: ${v('disabledForeground')}; cursor: default; pointer-events: none;
}
.cm-find-widget .cm-find-toggle-replace.codicon.disabled { display: none; }
.cm-find-part .cm-find-input-box { flex: 1; min-width: 0; }
.cm-replace-part .cm-find-input-box { flex: 1; min-width: 0; }
/* Monaco replaceInput.width = 查找框总宽:替换栏按钮区占和查找栏按钮区一样宽(计数 3+69、上下 2×(3+22)、选区内 2+22) */
.cm-replace-actions { min-width: 146px; }
.cm-find-widget.reduced-find-widget .cm-replace-actions { min-width: 74px; }
/* F7:窄编辑器(Monaco reduced/narrow/collapsed-find-widget,类名和阈值由 search.ts 按编辑器宽算) */
.cm-find-widget.reduced-find-widget .cm-matches-count { display: none; }
.cm-find-widget.narrow-find-widget { max-width: 257px !important; }
.cm-find-widget.collapsed-find-widget { max-width: 170px !important; }
.cm-find-widget.collapsed-find-widget .cm-find-part .cm-find-input-toggles { display: none; }
.cm-find-widget.collapsed-find-widget .cm-find-part .cm-find-input { padding-right: 6px; }
/* F7:Go to Line 预览整行高亮(Monaco rangeHighlight) */
.cm-rangeHighlight { position: absolute; left: 0; z-index: -1; pointer-events: none; box-sizing: border-box; background: ${v('editor.rangeHighlightBackground')}; border: 1px solid ${v('editor.rangeHighlightBorder')}; }
/* F12 落点闪一下(Monaco symbolHighlight,色 = editor.symbolHighlightBackground ← findMatchHighlight);边框用 outline 不占行内宽 */
.cm-symbol-highlight { background-color: ${v('editor.symbolHighlightBackground')}; outline: 1px solid ${v('editor.symbolHighlightBorder')}; outline-offset: -1px; }
/* 括号匹配框改由 .cm-highlightLayer 画(.cm-bracketBox);mark 只留类钩子 */
.cm-matchingBracket { }
/* 缩进线:Monaco editorIndentGuide.background1;活动缩进线 activeBackground1(按行内单独一段) */
.cm-indentGuide {
  background-image: repeating-linear-gradient(90deg, ${v('editorIndentGuide.background1')} 0 1px, transparent 1px calc(var(--indent-width, 4) * 1ch));
  background-size: calc(var(--indent-depth, 0) * var(--indent-width, 4) * 1ch) 100%;
  background-repeat: no-repeat;
  /* 从 padding 边起画:折行时 padding-left 是续行缩进(--cm-wrap-indent),参考线仍按原行缩进列 */
  background-origin: padding-box;
  background-clip: padding-box;
}
.cm-activeIndentGuide { position: absolute; width: 1px; z-index: 1; pointer-events: none; display: none; background: ${v('editorIndentGuide.activeBackground1')}; }
/* placeholder 选项(Monaco .editorPlaceholder):空文档时第一行的灰字,不挡鼠标 */
.cm-placeholder { position: absolute; z-index: 0; pointer-events: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: ${v('editor.placeholder.foreground')}; }
/* rulers 选项:竖标尺线(Monaco .view-ruler,色 = editorRuler.foreground,选项里的 color 优先) */
.cm-ruler { position: absolute; top: 0; width: 1px; z-index: 0; pointer-events: none; background: ${v('editorRuler.foreground')}; }
/* guides.bracketPairs:括号对参考线(Monaco .vertical / .horizontal-top / .horizontal-bottom,色 = --bpg-color) */
.cm-bracketPairGuides { position: absolute; left: 0; top: 0; width: 0; height: 0; pointer-events: none; z-index: 1; }
.cm-bracketPairGuide { position: absolute; box-sizing: border-box; pointer-events: none; }
.cm-bracketPairGuide.cm-bpg-vertical { box-shadow: 1px 0 0 0 var(--bpg-color) inset; }
.cm-bracketPairGuide.cm-bpg-horizontal-top { border-top: 1px solid var(--bpg-color); }
.cm-bracketPairGuide.cm-bpg-horizontal-bottom { border-bottom: 1px solid var(--bpg-color); }
/* 诊断:Monaco 波浪线(squiggly SVG),色走变量 —— SVG 当 mask,底色 = editorError/Warning/Info.foreground */
.cm-diagnostic { position: relative; }
.cm-diagnostic::after {
  content: ''; position: absolute; left: 0; right: 0; bottom: -2px; height: 3px; pointer-events: none;
  -webkit-mask: ${SQUIGGLE} repeat-x left bottom / 6px 3px; mask: ${SQUIGGLE} repeat-x left bottom / 6px 3px;
}
.cm-diagnostic-error::after { background-color: ${v('editorError.foreground')}; }
.cm-diagnostic-warning::after { background-color: ${v('editorWarning.foreground')}; }
.cm-diagnostic-info::after { background-color: ${v('editorInfo.foreground')}; }
/* hint 级(TS suggestion):范围起点三个小点,不重复(Monaco squiggly-hint no-repeat bottom left) */
.cm-squiggly-hint { position: relative; }
.cm-squiggly-hint::after {
  content: ''; position: absolute; left: 0; bottom: -2px; width: 12px; height: 3px; pointer-events: none;
  background-color: ${v('editorHint.foreground')};
  -webkit-mask: ${DOTDOTDOT} no-repeat left bottom / 12px 3px; mask: ${DOTDOTDOT} no-repeat left bottom / 12px 3px;
}
/* 选区内空白(Monaco renderWhitespace 'selection'):空格画中点,tab 画箭头 */
.cm-selWs { background-image: radial-gradient(circle at center, ${v('editorWhitespace.foreground')} 0 1.1px, transparent 1.4px); background-size: 1ch 100%; background-repeat: repeat-x; }
/* 前面有非 ASCII 的 tab 按可见列对齐(whitespace.ts tabStopDecorations,tab-size 写在行内) */
.cm-tabStop { display: inline-block; }
.cm-selTab { position: relative; }
.cm-selTab::before { content: '\\2192'; position: absolute; left: 0; color: ${v('editorWhitespace.foreground')}; pointer-events: none; }
.cm-overviewRuler { width: 14px; flex-shrink: 0; z-index: 3; pointer-events: none; }
.cm-overviewRuler canvas { display: block; }
/* flex 序:scroller | minimap | scrollbar —— 缩略图在滚动条左,滚动条最右(Monaco) */
.cm-minimap { width: 94px; flex-shrink: 0; position: relative; z-index: 1; cursor: pointer; background: ${v('minimap.background')}; user-select: none; -webkit-user-select: none; overflow: hidden; }
.cm-minimap canvas { display: block; position: absolute; top: 0; left: 0; }
.cm-minimap-slider { position: absolute; left: 0; width: 100%; background: transparent; transition: background-color 0.1s; transform: translateZ(0); contain: strict; will-change: top; }
/* minimap.showSlider = 'always':滑块不用鼠标悬停就显示;minimap.autohide:'mouseover' 平时透明、悬停才显;'scroll' 滚动后才显(0.5s 淡入淡出) */
.cm-minimap.cm-minimap-slider-always .cm-minimap-slider { background: ${v('minimapSlider.background')}; }
.cm-minimap.cm-minimap-autohide-mouseover, .cm-minimap.cm-minimap-autohide-scroll { opacity: 0; transition: opacity 0.5s; }
.cm-minimap.cm-minimap-autohide-scroll { pointer-events: none; }
.cm-minimap.cm-minimap-autohide-mouseover:hover, .cm-minimap.cm-minimap-autohide-scroll.cm-minimap-active { opacity: 1; pointer-events: auto; }
.cm-minimap:hover .cm-minimap-slider { background: ${v('minimapSlider.background')}; }
.cm-minimap .cm-minimap-slider:hover { background: ${v('minimapSlider.hoverBackground')}; }
/* Monaco minimap-shadow-visible:正文右边还有没露出来的内容时,minimap 左缘外 6px 内阴影 */
.cm-minimap-shadow { position: absolute; top: 0; bottom: 0; width: 6px; z-index: 1; pointer-events: none; display: none; box-shadow: ${v('scrollbar.shadow')} -6px 0 6px -6px inset; }
.cm-minimap-shadow.cm-visible { display: block; }
.cm-minimap-slider.active, .cm-minimap:hover .cm-minimap-slider.active { background: ${v('minimapSlider.activeBackground')}; }
/* 竖向滚动条列:14px 方角 thumb + overview 标记(字面 Monaco scrollbarSlider) */
.cm-scrollbar { width: 14px; flex-shrink: 0; position: relative; z-index: 3; align-self: stretch; cursor: default; }
.cm-scrollbar-thumb {
  position: absolute; right: 0; width: 14px;
  background: ${v('scrollbarSlider.background')};
  transform: translateZ(0); will-change: top;
}
.cm-scrollbar-thumb:hover { background: ${v('scrollbarSlider.hoverBackground')}; }
.cm-scrollbar-thumb.active {
  background: ${v('scrollbarSlider.activeBackground')};
}
.cm-scrollbar-mark { position: absolute; right: 0; width: 14px; height: 2px; pointer-events: none; }
/* scrollbar 选项:vertical/horizontal = hidden 不画滑块和箭头(标记照画);= visible 一直显(不淡出);verticalHasArrows 两端箭头 */
.cm-sb-hidden > .cm-scrollbar-thumb, .cm-sb-hidden > .cm-sb-arrow, .cm-sb-hidden > .cm-hscrollbar-thumb { display: none !important; }
.cm-sb-hidden { pointer-events: none; }
.cm-sb-always.cm-sb-invisible, .cm-sb-always.cm-sb-visible { opacity: 1 !important; transition: none !important; pointer-events: auto; }
.cm-sb-arrow { position: absolute; left: 0; display: flex; align-items: center; justify-content: center; z-index: 1; }
.cm-sb-arrow-up { top: 0; }
.cm-sb-arrow-down { bottom: 0; }
.cm-sb-arrow::after { content: ''; border: 4px solid transparent; opacity: 0.8; }
.cm-sb-arrow-up::after { border-bottom-color: ${v('scrollbarSlider.background')}; border-top-width: 0; }
.cm-sb-arrow-down::after { border-top-color: ${v('scrollbarSlider.background')}; border-bottom-width: 0; }
.cm-sb-arrow:hover::after { opacity: 1; }
.cm-sb-arrow-left { left: 0; top: 0; }
.cm-sb-arrow-right { right: 0; top: 0; left: auto; }
.cm-sb-arrow-left::after { border-right-color: ${v('scrollbarSlider.background')}; border-left-width: 0; }
.cm-sb-arrow-right::after { border-left-color: ${v('scrollbarSlider.background')}; border-right-width: 0; }
.cm-scrollbar-overview { position: absolute; top: 0; left: 0; display: block; pointer-events: none; }
/* 选区(Monaco SelectionsOverlay):.cm-highlightLayer 里每个视觉行一块满行高的 .cm-selectedText,聚焦
   editor.selectionBackground、失焦 inactiveSelectionBackground;圆角 3px,凹角用编辑器背景色的反圆角块。
   原生 ::selection 透明:它只有字形高、和自绘块叠色(半透明选区色的主题会变深)。
   cm-selectionBackground mark 只在没挂 highlightLayer(无 cm-focusTracked)时上色兜底。 */
.cm-selectedText { background-color: ${v('editor.inactiveSelectionBackground')}; }
.cm-editor.cm-focused .cm-selectedText { background-color: ${v('editor.selectionBackground')}; }
.cm-selCorner { background-color: var(--lm-editor-background); }
/* roundedSelection: false —— 选区不画圆角,也不画凹角小块 */
.cm-noRoundedSelection .cm-highlightLayer > .cm-selectedText { border-radius: 0; }
.cm-noRoundedSelection .cm-highlightLayer > .cm-selInner { display: none; }
.cm-highlightLayer > .cm-tl { border-top-left-radius: 3px; }
.cm-highlightLayer > .cm-tr { border-top-right-radius: 3px; }
.cm-highlightLayer > .cm-bl { border-bottom-left-radius: 3px; }
.cm-highlightLayer > .cm-br { border-bottom-right-radius: 3px; }
.cm-editor:not(.cm-focusTracked) .cm-selectionBackground { background-color: ${v('editor.selectionBackground')}; }
.cm-content ::selection { background: transparent; }
.cm-cursorLayer { position: absolute; inset: 0; pointer-events: none; z-index: 2; contain: layout style; }
.cm-cursor { position: absolute; width: 2px; background: ${v('editorCursor.foreground')}; animation: cm-blink 1s steps(1) infinite; }
/* 失焦不画光标(Monaco 只在 focused 时显示 cursor) */
.cm-editor:not(.cm-focused) .cm-cursorLayer { visibility: hidden; }
.cm-cursorLayer.cm-typing .cm-cursor { animation: none; opacity: 1; }
.cm-cursor-secondary { opacity: 0.5; }
/* cursorStyle / cursorBlinking / cursorSmoothCaretAnimation(Monaco viewCursors.css;类名挂在 .cm-cursorLayer 上) */
.cm-cursorLayer.cursor-smooth-caret-animation > .cm-cursor { transition: all 80ms; }
.cm-cursorLayer.cursor-block-style > .cm-cursor { color: var(--lm-editor-background); white-space: pre; overflow: hidden; }
.cm-cursorLayer.cursor-block-outline-style > .cm-cursor { background: transparent !important; border: 1px solid ${v('editorCursor.foreground')}; box-sizing: border-box; }
.cm-cursorLayer.cursor-solid > .cm-cursor { animation: none; opacity: 1; }
.cm-cursorLayer.cursor-hidden > .cm-cursor { animation: none; visibility: hidden; }
.cm-cursorLayer.cursor-smooth { animation: monaco-cursor-smooth 0.5s ease-in-out 0s 20 alternate; }
.cm-cursorLayer.cursor-phase { animation: monaco-cursor-phase 0.5s ease-in-out 0s 20 alternate; }
.cm-cursorLayer.cursor-expand > .cm-cursor { animation: monaco-cursor-expand 0.5s ease-in-out 0s 20 alternate; }
.cm-cursorLayer.cursor-smooth > .cm-cursor, .cm-cursorLayer.cursor-phase > .cm-cursor { animation: none; }
.cm-cursorLayer.cm-typing.cursor-smooth, .cm-cursorLayer.cm-typing.cursor-phase { animation: none; opacity: 1; }
@keyframes monaco-cursor-smooth { 0%, 20% { opacity: 1; } 60%, 100% { opacity: 0; } }
@keyframes monaco-cursor-phase { 0%, 20% { opacity: 1; } 90%, 100% { opacity: 0; } }
@keyframes monaco-cursor-expand { 0%, 20% { transform: scaleY(1); } 80%, 100% { transform: scaleY(0); } }
/* renderFinalNewline: 'dimmed' —— 末行空行的行号淡显(Monaco 取 editorLineNumber.dimmedForeground,缺省行号色 40% 透明度) */
.cm-lineNumber.dimmed-line-number { opacity: 0.4; }
/* 横向条：12px 方角 thumb(Monaco horizontalScrollbarSize 12)，色/hover/active 与竖条同一套 Monaco scrollbarSlider */
.cm-hscrollbar { position: absolute; bottom: 0; left: 0; right: 0; height: 12px; z-index: 4; cursor: default; background: transparent; }
.cm-hscrollbar-thumb {
  position: absolute; bottom: 0; height: 12px;
  background: ${v('scrollbarSlider.background')};
  transform: translateZ(0); will-change: left;
}
.cm-hscrollbar-thumb:hover { background: ${v('scrollbarSlider.hoverBackground')}; }
.cm-hscrollbar-thumb.active {
  background: ${v('scrollbarSlider.activeBackground')};
}
/* Monaco visibility auto:鼠标进编辑器 / 滚动时显(100ms 淡入),离开 500ms 后 800ms 线性淡出;藏起来时不接鼠标 */
.cm-sb-visible { opacity: 1; transition: opacity 100ms linear; }
.cm-sb-invisible { opacity: 0; pointer-events: none; }
.cm-sb-invisible.cm-sb-fade { transition: opacity 800ms linear; }
/* Monaco scroll-decoration:scrollTop > 0 时顶部 6px 内阴影 */
.cm-scroll-decoration { position: absolute; top: 0; left: 0; height: 6px; z-index: 5; pointer-events: none; display: none; box-shadow: ${v('scrollbar.shadow')} 0 6px 6px -6px inset; }
.cm-scroll-decoration.cm-visible { display: block; }
@keyframes cm-blink { 0%, 50% { opacity: 1; } 50.01%, 100% { opacity: 0; } }
/* Monaco inline-folded: ⋯ 占位,点击展开 */
.cm-foldedBackground { background-color: ${v('editor.foldBackground')}; }
.cm-foldPlaceholder {
  color: ${v('editor.foldPlaceholderForeground')};
  background: transparent; border: none;
  margin: 0.1em 0.2em 0 0.2em; padding: 0; cursor: pointer;
  font-family: inherit; font-size: inherit; line-height: 1;
  vertical-align: baseline;
}
/* 拖放选区的落点(Monaco .dnd-target:2px 点线,光标色) */
.cm-dropCursor { position: absolute; z-index: 30; width: 0; pointer-events: none; border-left: 2px dotted var(--lm-editorCursor-foreground); }
.cm-foldPlaceholder { cursor: pointer; }
.cm-foldPlaceholder:hover { color: var(--lm-editor-foreground); }
.cm-completionList {
  /* fixed + 屏上坐标(JS 设 left/top);不进 editor 含块,避免 flex/滚动偏移 */
  position: fixed; background: ${v('editorSuggestWidget.background')};
  color: ${v('editorSuggestWidget.foreground')};
  border: 1px solid ${v('editorSuggestWidget.border')}; border-radius: 3px;
  padding: 0; font-family: -apple-system, system-ui, "Segoe WPC", "Segoe UI", sans-serif;
  font-size: 13px; max-height: 280px; overflow-y: auto; z-index: 1000;
  min-width: 220px; max-width: min(480px, 90%);
}
/* 浮层挂 body、用原生滚动条:color-scheme 跟主题明暗走,否则暗色主题下滚动条是白的 */
${FLOATING_ROOTS.join(', ')}, .cm-completionDetails { color-scheme: var(--lm-color-scheme); }
.cm-completionItem {
  padding: 1px 8px 1px 4px; cursor: pointer; white-space: nowrap; color: inherit;
  display: flex; gap: 6px; align-items: center; line-height: 22px; min-height: 22px;
}
.cm-completionItem:hover { background: ${v('list.hoverBackground')}; }
.cm-completionSelected { background: ${v('editorSuggestWidget.selectedBackground')} !important; color: ${v('editorSuggestWidget.selectedForeground')}; }
.cm-completionSelected .cm-completionMatched { color: ${v('editorSuggestWidget.focusHighlightForeground')}; }
.cm-completionIcon {
  flex: none; width: 16px; height: 16px; font-size: 16px !important; line-height: 16px !important;
  text-align: center; display: inline-flex !important; align-items: center; justify-content: center;
}
.cm-completionIcon-variable { color: ${v('symbolIcon.variableForeground')}; }
.cm-completionIcon-field { color: ${v('symbolIcon.fieldForeground')}; }
.cm-completionIcon-function { color: ${v('symbolIcon.functionForeground')}; }
.cm-completionIcon-method { color: ${v('symbolIcon.methodForeground')}; }
.cm-completionIcon-class { color: ${v('symbolIcon.classForeground')}; }
.cm-completionIcon-interface, .cm-completionIcon-type { color: ${v('symbolIcon.interfaceForeground')}; }
.cm-completionIcon-property { color: ${v('symbolIcon.propertyForeground')}; }
.cm-completionIcon-keyword { color: ${v('symbolIcon.keywordForeground')}; }
.cm-completionIcon-module { color: ${v('symbolIcon.moduleForeground')}; }
.cm-completionIcon-enum { color: ${v('symbolIcon.enumeratorForeground')}; }
.cm-completionIcon-snippet { color: ${v('symbolIcon.snippetForeground')}; }
.cm-completionSelected .cm-completionIcon { color: ${v('editorSuggestWidget.selectedIconForeground')}; }
.cm-completionLabel {
  flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis;
  font-family: 'SF Mono', Menlo, monospace; font-size: 13px;
}
.cm-completionMatched { color: ${v('editorSuggestWidget.highlightForeground')}; font-weight: bold; }
.cm-completionDetail {
  flex: none; max-width: 220px; overflow: hidden; text-overflow: ellipsis;
  opacity: 0.7; font-size: 12px;
  font-family: 'SF Mono', Menlo, monospace; margin-left: 12px;
}
.cm-completionSelected .cm-completionDetail { opacity: 0.85; }
/* hover 卡(Monaco hoverWidget.css + contrib/hover/hover.css,0.52 实测):
   字号/行高跟编辑器(Monaco 把 fontSize/lineHeight 写到 hover-content 上);字体只给界面文字,
   签名、marker 消息、代码块继承编辑器字体。Monaco 的 content hover 没有阴影。
   单段卡 = hover-content(右/下 2px)+ hover-contents(4px 8px);合卡每段一行,行间半透明分隔线。 */
.cm-tooltip-hover {
  position: absolute; max-width: 500px; max-height: 250px; overflow: auto; box-sizing: border-box; z-index: 20;
  background: ${v('editorHoverWidget.background')}; color: ${v('editorHoverWidget.foreground')};
  border: 1px solid ${v('editorHoverWidget.border')}; border-radius: 3px;
  padding: 4px 10px 6px 8px; font-size: inherit; line-height: inherit; white-space: normal;
  cursor: default; user-select: text; -webkit-user-select: text; overflow-wrap: break-word;
}
.cm-tooltip-hover.cm-hover-card { padding: 0 2px 2px 0; }
.cm-hover-row { padding: 4px 8px; min-width: 0; }
.cm-hover-row:empty { display: none; }
.cm-hover-row + .cm-hover-row, .cm-hover-row + .cm-hover-status { border-top: 1px solid var(--lm-hover-separator); }
/* 状态栏(Monaco hover-row.status-bar > .actions) */
.cm-hover-status {
  display: flex; align-items: center; gap: 16px; padding: 0 8px; white-space: nowrap;
  font-family: ${UI_FONT}; font-size: 12px; line-height: 22px;
  background: ${v('editorHoverWidget.statusBarBackground')};
}
.cm-hover-action { color: ${v('textLink.foreground')}; text-decoration: none; cursor: pointer; user-select: none; -webkit-user-select: none; }
.cm-hover-action:hover { color: ${v('textLink.activeForeground')}; }
.cm-hover-action:focus-visible { outline: 1px solid ${v('focusBorder')}; outline-offset: -1px; }
/* Monaco 的 "No quick fixes available" 是状态栏里的普通文字(不是链接),前景色同卡片 */
.cm-hover-action.cm-hover-action-disabled { color: inherit; cursor: default; }
.cm-hover-action.cm-hover-action-disabled:hover { color: inherit; }
/* 快捷键是链接文字的一部分(Monaco "View Problem (⌥F8)" 整段链接色) */
.cm-hover-keybinding { color: inherit; }
/* 异步操作到之前占一个不换行空格的位置,状态栏不塌(Monaco quickfix placeholder 写 &nbsp;) */
.cm-hover-action-slot { display: inline-block; }
.cm-hover-action-slot:empty::before { content: '\\00a0'; }
/* marker 行(Monaco marker hover,实测是编辑器字体):消息 pre-wrap,码 0.6 不透明度、左 6px,和消息同一行流;没有图标 */
.cm-diagnostic-tooltip, .cm-diagnostic-hint { display: block; color: inherit; }
.cm-diagnostic-tooltip > [class*="cm-hover-icon-"] { display: none; }
.cm-diagnostic-tooltip .cm-diagnostic-msg { color: inherit; white-space: pre-wrap; }
.cm-diagnostic-tooltip .cm-diagnostic-code { color: inherit; opacity: 0.6; padding-left: 6px; }
/* Monaco hover-copy-button:行右上角复制按钮,悬停 / 聚焦行时才显形 */
.hover-row-with-copy { position: relative; padding-right: 20px; }
.hover-copy-button {
  position: absolute; top: 4px; right: 4px; padding: 2px 4px; border-radius: 3px;
  display: flex; align-items: center; justify-content: center; opacity: 0; cursor: pointer;
}
.hover-row-with-copy:hover .hover-copy-button, .hover-row-with-copy:focus-within .hover-copy-button { opacity: 1; }
.hover-copy-button:hover { background: ${v('toolbar.hoverBackground')}; }
.hover-copy-button:focus { outline: 1px solid ${v('focusBorder')}; outline-offset: -1px; }
.hover-copy-button.codicon { font-size: 16px; color: ${v('foreground')}; }
/* related information 行的「文件(行, 列): 」链接(Monaco .monaco-hover a 用 textLink 色) */
.cm-diagnostic-related a { color: ${v('textLink.foreground')}; text-decoration: none; }
.cm-diagnostic-related a:hover { color: ${v('textLink.activeForeground')}; }
/* 同一处多条诊断:Monaco 每条一行,行间同一条分隔线(负边距让线贯穿到卡边) */
.cm-diagnostic-rows > .cm-diagnostic-tooltip + .cm-diagnostic-tooltip {
  margin: 4px -8px 0; padding: 4px 8px 0; border-top: 1px solid var(--lm-hover-separator);
}
.cm-hover-icon-error { color: ${v('editorError.foreground')}; flex: none; margin-top: 2px; }
.cm-hover-icon-warning { color: ${v('editorWarning.foreground')}; flex: none; margin-top: 2px; }
.cm-hover-icon-info { color: ${v('editorInfo.foreground')}; flex: none; margin-top: 2px; }
/* TS quick info:签名(编辑器字体,pre-wrap)+ JSDoc markdown + 标签行 */
.cm-marker-nav { --cm-mn-color: ${v('editorError.foreground')}; }
.cm-marker-nav.cm-marker-nav-warning { --cm-mn-color: ${v('editorWarning.foreground')}; }
.cm-marker-nav.cm-marker-nav-info { --cm-mn-color: ${v('editorInfo.foreground')}; }
.cm-marker-nav .cm-peek-arrow { border-bottom-color: var(--cm-mn-color); }
.cm-marker-nav .cm-peek-box { border-color: var(--cm-mn-color); background: ${v('editor.background')}; }
.cm-marker-nav .cm-peek-head { background: color-mix(in srgb, var(--cm-mn-color) 10%, transparent); }
.cm-marker-nav .cm-peek-body { border-top-color: var(--cm-mn-color); background: ${v('editor.background')}; outline: none; overflow: hidden; }
.cm-marker-nav-icon { margin-right: 6px; align-self: center; color: var(--cm-mn-color); }
.cm-marker-nav-container { position: relative; overflow: auto; width: 100%; padding: 0 4px; box-sizing: border-box; white-space: pre; color: var(--lm-editor-foreground); font-family: inherit; }
.cm-marker-nav-container.stale, .cm-marker-nav.stale .cm-marker-nav-container { opacity: .4; }
.cm-marker-nav-details { opacity: .6; padding-left: 6px; }
.cm-marker-nav-source { margin-right: 4px; }
.cm-marker-nav-related-list { padding-top: 6px; }
.cm-marker-nav-filename { color: ${v('textLink.foreground')}; cursor: pointer; }
.cm-marker-nav-filename:hover { color: ${v('textLink.activeForeground')}; text-decoration: underline; }
.cm-marker-nav .cm-peek-action { display: flex; align-items: center; width: 16px; height: 16px; padding: 3px; border-radius: 5px; font-size: 16px; line-height: 16px; cursor: pointer; color: inherit; }
.cm-marker-nav .cm-peek-action:hover { background: ${v('toolbar.hoverBackground')}; }
.cm-marker-nav-notitle { display: none; }
.cm-definition-link { text-decoration: underline; color: ${v('textLink.activeForeground')} !important; }
.cm-definition-link-active, .cm-definition-link-active .cm-line { cursor: pointer; }
.detected-link, .detected-link-active { text-decoration: underline; text-underline-position: under; }
.detected-link-active { cursor: pointer; color: ${v('editorLink.activeForeground')} !important; }
.cm-definition-preview-code { margin: 0; white-space: pre; font-family: inherit; color: var(--lm-editor-foreground); }
.cm-definition-preview-foot { margin-top: 4px; opacity: .7; }
.cm-quickinfo-sig { white-space: pre-wrap; color: var(--lm-editor-foreground); }
/* @deprecated:Monaco 只在编辑器正文里划线(editor.deprecated 装饰),hover 签名不划;这里同样不划,只留钩子 */
.cm-quickinfo-sig.cm-quickinfo-deprecated { text-decoration: none; }
/* 签名和文档是两段 hover-contents(各 4px 上下内边距):中间 8px,没有分隔线 */
.cm-quickinfo-doc { margin-top: 8px; white-space: normal; color: inherit; }
.cm-quickinfo-tag { margin-top: 8px; white-space: normal; color: inherit; font-family: ${UI_FONT}; }
/* Monaco tagToString:*@param* 斜体、不另上色 */
.cm-qi-tagname { color: inherit; font-style: italic; }
.cm-qi-tagtext { color: inherit; }
.cm-md.cm-qi-tagtext { display: block; margin-top: 4px; }
/* hover 签名逐 part 上色:TS displayPart.kind → 当前主题 tokenColors 里对应 scope 的色 */
.cm-qi-keyword { color: var(--lm-tok-keyword); }
.cm-qi-aliasName, .cm-qi-interfaceName, .cm-qi-className, .cm-qi-enumName, .cm-qi-typeParameterName, .cm-qi-typeAliasName { color: var(--lm-tok-type); }
.cm-qi-functionName, .cm-qi-methodName { color: var(--lm-tok-function); }
.cm-qi-propertyName, .cm-qi-parameterName, .cm-qi-localName, .cm-qi-fieldName { color: var(--lm-tok-variable); }
.cm-qi-stringLiteral { color: var(--lm-tok-string); }
.cm-qi-numericLiteral { color: var(--lm-tok-number); }
/* markdown(Monaco .monaco-hover 的 MarkupContent 排版;显式写出 UA 默认值,宿主的 CSS reset 打不掉) */
.cm-md { color: inherit; white-space: normal; }
.cm-md :is(p, li, h1, h2, h3, h4, h5, h6, blockquote) { font-family: ${UI_FONT}; }
.cm-md :is(p, ul, ol, h1, h2, h3, h4, h5, h6, pre.cm-md-code) { margin: 8px 0; }
/* :is(*, pre.cm-md-code) 只为把优先级抬到上一条之上(那条 :is 按最高的 pre.cm-md-code 算),否则首尾段的 8px 去不掉 */
.cm-md > :is(*, pre.cm-md-code):first-child { margin-top: 0; }
.cm-md > :is(*, pre.cm-md-code):last-child { margin-bottom: 0; }
.cm-md :is(h1, h2, h3, h4, h5, h6) { line-height: 1.1; font-weight: bold; }
.cm-md h1 { font-size: 2em; }
.cm-md h2 { font-size: 1.5em; }
.cm-md h3 { font-size: 1.17em; }
.cm-md h4 { font-size: 1em; }
.cm-md h5 { font-size: 0.83em; }
.cm-md h6 { font-size: 0.67em; }
.cm-md :is(ul, ol) { padding-left: 20px; }
.cm-md ul { list-style: disc outside; }
.cm-md ol { list-style: decimal outside; }
.cm-md li { display: list-item; }
.cm-md li > p { margin-bottom: 0; }
.cm-md li > :is(ul, ol) { margin-top: 0; }
.cm-md blockquote { margin: 1em 40px; }
.cm-md hr {
  box-sizing: border-box; height: 1px; min-width: 100%; margin: 4px -8px -4px;
  border: 0; border-top: 1px solid var(--lm-hover-separator);
}
.cm-md a { color: ${v('textLink.foreground')}; }
.cm-md a:hover { color: ${v('textLink.activeForeground')}; cursor: pointer; }
.cm-md strong { font-weight: bold; }
.cm-md em { font-style: italic; }
/* 行内 code + @param 名(Monaco hover code:等宽、3px 圆角、0 0.4em、textCodeBlock.background) */
.cm-md code, .cm-qi-paramname {
  font-family: ${MONO_FONT}; font-size: inherit; border-radius: 3px; padding: 0 0.4em;
  background-color: ${v('textCodeBlock.background')}; color: inherit;
}
/* 围栏代码块:Monaco 渲成 tokenized 源码 div —— 编辑器字体、pre-wrap、无底色无内边距 */
.cm-md pre.cm-md-code { padding: 0; font-family: inherit; font-size: inherit; line-height: inherit; white-space: pre-wrap; background: none; tab-size: var(--lm-tab-size, 4); }
.cm-md pre.cm-md-code code { font: inherit; padding: 0; border-radius: 0; background: none; white-space: inherit; }
/* 参数提示(Monaco parameterHints.css):无圆角无阴影;签名 4px 5px,文档 0 10px 0 5px;中间半透明线(不占高,同 Monaco ::after)。
   多重载:左边一列(min-width 22px,padding 0 2px)上 chevron / 计数 / 下 chevron,底对齐,卡最小高 3.3em,正文左侧半透明竖线 */
.cm-tooltip-hover.cm-signature-help { padding: 0; border-radius: 0; max-width: none; min-width: 120px; overflow: hidden; display: flex; flex-direction: column; }
.cm-signature-help.cm-signature-multiple { min-height: 3.3em; }
.cm-signature-wrapper { display: flex; flex-direction: row; max-width: 440px; min-height: 0; flex: 1; }
.cm-signature-body { display: flex; flex-direction: column; flex: 1; min-width: 0; overflow: auto; }
.cm-signature-multiple .cm-signature-body { box-shadow: inset 1px 0 0 var(--lm-hover-separator); }
.cm-signature-controls { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; min-width: 22px; padding: 0 2px; }
.cm-signature-button { width: 16px; height: 16px; cursor: pointer; font: normal normal normal 16px/1 codicon; text-align: center; user-select: none; -webkit-user-select: none; }
.cm-signature-sig { padding: 4px 5px; white-space: pre-wrap; color: inherit; }
.cm-signature-param-active { color: ${v('editorHoverWidget.highlightForeground')}; font-weight: bold; }
.cm-signature-doc {
  margin: 0; padding: 8px 10px 8px 5px; box-shadow: inset 0 1px 0 var(--lm-hover-separator);
  color: inherit; font-family: ${UI_FONT};
}
.cm-signature-doc > .cm-md + .cm-md { margin-top: 8px; }
.cm-signature-meta { height: 12px; font-size: inherit; line-height: 12px; text-align: center; font-family: ${MONO_FONT}; color: inherit; }
/* F2 内嵌重命名框(Monaco renameWidget.css:框 editorWidget 底 + widget.shadow,至少 200 宽;里面一层 input.background、
   padding 3、宽 100% - 8px;输入框不另画描边,宽由 size 撑) */
.cm-rename-box {
  min-width: 200px; border-radius: 4px;
  background: ${v('editorWidget.background')}; color: ${v('input.foreground')};
  box-shadow: 0 0 8px 2px ${v('widget.shadow')};
}
.cm-rename-field {
  display: flex; width: calc(100% - 8px); padding: 3px; border-radius: 2px;
  background: ${v('input.background')}; box-shadow: inset 0 0 0 1px ${v('input.border')};
}
.cm-rename-box:focus-within { outline: 1px solid ${v('focusBorder')}; outline-offset: -1px; }
.cm-rename-field:focus-within { outline: 1px solid ${v('focusBorder')}; outline-offset: -1px; }
.cm-rename-input {
  display: block; width: calc(100% - 8px); margin: 0; padding: 0; border: 0; outline: none; color-scheme: normal;
  background: ${v('input.background')}; color: ${v('input.foreground')};
  font-family: inherit; font-size: inherit; line-height: inherit; height: auto;
}
/* 编辑器内一行提示(Monaco MessageController,和只读提示同一套) */
.cm-editor-message {
  padding: 2px 4px; border-radius: 3px; white-space: nowrap; pointer-events: none;
  color: ${v('editorHoverWidget.foreground')}; background: ${v('editorHoverWidget.background')};
  border: 1px solid ${v('inputValidation.infoBorder')};
  font-family: ${UI_FONT}; font-size: 12px; line-height: 18px;
  animation: cm-message-fadeIn 150ms ease-out;
}
@keyframes cm-message-fadeIn { from { opacity: 0; } to { opacity: 1; } }
/* Monaco editor context menu(menu.*;几何照 base/browser/ui/menu getMenuWidgetCSS:宽随内容,项 margin 0 4px、
   圆角 4、高 2em,标签 / 键位 padding 0 2em,分隔线 margin 5px 0 + 1px) */
.cm-context-menu {
  min-width: 160px; padding: 4px 0;
  background: ${v('menu.background')};
  color: ${v('menu.foreground')};
  border: 1px solid ${v('menu.border')};
  border-radius: 5px;
  box-shadow: 0 2px 8px ${v('widget.shadow')};
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  font-size: 13px; line-height: 22px; z-index: 10000;
  user-select: none; -webkit-user-select: none;
}
.cm-context-item {
  display: flex; align-items: center;
  margin: 0 4px; border-radius: 4px; height: 2em; box-sizing: border-box;
  cursor: default; position: relative; white-space: nowrap;
}
/* F7:键盘聚焦项(.focused)与悬停同色;菜单和项获得焦点不画浏览器焦点框 */
.cm-context-menu, .cm-context-item { outline: none; }
.cm-context-item:not(.disabled):hover, .cm-context-item.focused:not(.disabled) {
  background: ${v('menu.selectionBackground')};
  color: ${v('menu.selectionForeground')};
}
.cm-context-item.focused:not(.disabled) .cm-context-keybinding,
.cm-context-item:not(.disabled):hover .cm-context-keybinding { color: inherit; }
.cm-context-item.disabled { opacity: 0.4; cursor: default; }
.cm-context-label { flex: 1 1 auto; padding: 0 2em; line-height: 1; }
.cm-context-keybinding { flex: 2 1 auto; padding: 0 2em; text-align: right; line-height: 1; color: inherit; }
.cm-context-chevron { flex: 2 1 auto; height: 100%; display: flex !important; align-items: center; padding: 0 1.8em; font-size: 16px !important; }
.cm-context-chevron::before { margin-left: auto; margin-right: -20px; }
.cm-context-sep {
  height: 0; margin: 5px 0;
  border-bottom: 1px solid ${v('menu.separatorBackground')};
}
.cm-context-submenu {
  display: none; position: absolute; left: 100%; top: -4px; margin-left: 0;
}
.cm-context-submenu.open-left { left: auto; right: 100%; margin-left: 0; margin-right: 0; }
.cm-context-submenu.visible { display: block; }
/* Quick Fix 下拉(Monaco actionWidget.css;贴光标/灯泡,挂 body + fixed) */
.cm-action-widget {
  min-width: 160px; max-width: 80vw; width: max-content; box-sizing: border-box; padding: 4px; z-index: 10000;
  /* editorActionList.background / foreground 默认取 editorWidget.* */
  background: ${v('editorWidget.background')}; color: ${v('editorWidget.foreground')};
  border: 1px solid ${v('editorWidget.border')}; border-radius: 5px; box-shadow: 0 2px 8px ${v('widget.shadow')};
  font-family: ${UI_FONT}; font-size: 13px; user-select: none; -webkit-user-select: none;
}
.cm-action-list { outline: none; max-height: 70vh; overflow-y: auto; }
.cm-action-header {
  height: 26px; line-height: 26px; padding: 0 10px; font-size: 12px; font-weight: 600;
  color: ${v('descriptionForeground')}; white-space: nowrap;
}
.cm-action-item {
  display: flex; align-items: center; gap: 8px; height: 24px; line-height: 24px; padding: 0 10px;
  border-radius: 4px; cursor: pointer; white-space: nowrap;
}
.cm-action-item.focused {
  background: ${v('quickInputList.focusBackground')}; color: ${v('quickInputList.focusForeground')};
}
.cm-action-item .codicon { flex: none; font-size: 16px; }
.cm-action-item .codicon-light-bulb { color: ${v('editorLightBulb.foreground')}; }
.cm-action-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
/* F7:Quick Input(命令面板 '>' / Go to Line ':'),挂在 .cm-editor 里、顶部居中(Monaco quick-input-widget 实测几何) */
.cm-quick-input {
  position: absolute; top: 0; left: 50%; transform: translateX(-50%); z-index: 2550;
  width: 62%; max-width: 600px; box-sizing: border-box;
  background: ${v('quickInput.background')}; color: ${v('quickInput.foreground')};
  border-radius: 6px; box-shadow: 0 0 8px 2px ${v('widget.shadow')};
  font-family: ${UI_FONT}; font-size: 13px; line-height: 22px;
  -webkit-app-region: no-drag;
}
.cm-quick-input-header { padding: 8px 6px 2px; }
/* Monaco header 里输入框右边还有一个空的 inline action bar(margin-left 5px),下方 2px 进度条 */
.cm-quick-input-header::after { content: ''; flex: none; width: 5px; }
.cm-quick-input-header { display: flex; margin-bottom: 2px; }
.cm-quick-input-box { flex: 1; min-width: 0; }
.cm-quick-input-box { display: flex; height: 26px; box-sizing: border-box; border-radius: 2px; border: 1px solid ${v('input.border')}; background: ${v('input.background')}; }
/* Monaco InputBox 聚焦给盒子加 synthetic-focus,描边用 focusBorder(editor.main.css input:focus / find synthetic-focus),不是浏览器默认环 */
.cm-quick-input-box:focus-within { border-color: ${v('focusBorder')}; }
.cm-quick-input-input:focus { outline: none; }
.cm-quick-input-input {
  flex: 1; min-width: 0; border: 0; background: transparent; padding: 0 6px;
  color: ${v('input.foreground')}; font: inherit; line-height: 24px;
}
.cm-quick-input-list { overflow-y: auto; overflow-x: hidden; padding-bottom: 5px; box-sizing: border-box; }
.cm-quick-input-row {
  display: flex; align-items: center; height: 22px; margin: 0 5px; padding: 0 6px 0 11px;
  border-radius: 3px; cursor: pointer; white-space: nowrap; overflow: hidden;
}
.cm-quick-input-row:hover { background: ${v('list.hoverBackground')}; }
.cm-quick-input-row.focused, .cm-quick-input-row.focused:hover {
  background: ${v('quickInputList.focusBackground')}; color: ${v('quickInputList.focusForeground')};
}
.cm-quick-input-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.cm-quick-input-highlight { font-weight: bold; color: ${v('list.highlightForeground')}; }
.cm-quick-input-row.focused .cm-quick-input-highlight { color: ${v('list.focusHighlightForeground')}; }
/* 分组(Monaco quick-input-list-separator):文字在键帽右边 8px,pickerGroup.foreground;行顶 1px pickerGroup.border,首行不描 */
.cm-quick-input-separator-border { border-top: 1px solid ${v('pickerGroup.border')}; box-sizing: border-box; }
.cm-quick-input-separator { flex: none; margin-left: auto; padding-left: 8px; color: ${v('pickerGroup.foreground')}; }
.cm-quick-input-kb + .cm-quick-input-separator { margin-left: 0; }
.cm-quick-input-row.focused .cm-quick-input-separator { color: inherit; }
.cm-quick-input-desc { margin-left: 0.5em; opacity: 0.7; overflow: hidden; text-overflow: ellipsis; }
.cm-quick-input-kb { margin-left: auto; padding-left: 12px; display: flex; align-items: center; flex: none; line-height: 10px; }
/* 键帽(Monaco keybindingLabel.css + keybindingLabel.* 色,阴影 = widget.shadow) */
.cm-keybinding-key {
  display: inline-block; margin: 0 2px; padding: 3px 5px; border-radius: 3px; font-size: 11px; vertical-align: middle;
  background: ${v('keybindingLabel.background')};
  color: ${v('keybindingLabel.foreground')};
  border: 1px solid ${v('keybindingLabel.border')};
  border-bottom-color: ${v('keybindingLabel.bottomBorder')};
  box-shadow: inset 0 -1px 0 ${v('widget.shadow')};
}
.cm-keybinding-key:first-child { margin-left: 0; }
.cm-keybinding-key:last-child { margin-right: 0; }
/* Command Palette / Go to Symbol 列表(quickInput.*) */
.cm-picker {
  /* 全屏透明层只为点外面关闭;Monaco quick input 没有压暗遮罩 */
  position: fixed; inset: 0; z-index: 10001;
  background: transparent;
  display: flex; justify-content: center; padding-top: 12vh;
}
.cm-picker-box {
  width: min(520px, 92vw); max-height: 60vh;
  display: flex; flex-direction: column;
  background: ${v('quickInput.background')};
  color: ${v('quickInput.foreground')};
  border: 1px solid ${v('widget.border')};
  border-radius: 6px;
  box-shadow: 0 0 8px 2px ${v('widget.shadow')};
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  font-size: 13px;
}
.cm-picker-title {
  padding: 8px 12px 0; font-size: 11px; text-transform: uppercase;
  letter-spacing: 0.04em; color: ${v('descriptionForeground')};
}
.cm-picker-input {
  margin: 8px 12px; padding: 6px 8px; border-radius: 3px;
  border: 1px solid ${v('focusBorder')};
  background: ${v('input.background')};
  color: ${v('input.foreground')}; outline: none; font: inherit;
}
.cm-picker-list { overflow: auto; flex: 1; padding-bottom: 6px; }
.cm-picker-item {
  display: flex; align-items: center; gap: 12px;
  padding: 4px 12px; cursor: default;
}
.cm-picker-item:hover { background: ${v('list.hoverBackground')}; }
.cm-picker-item.active, .cm-picker-item.active:hover {
  background: ${v('quickInputList.focusBackground')}; color: ${v('quickInputList.focusForeground')};
}
.cm-picker-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cm-picker-detail { flex: none; opacity: 0.7; font-size: 12px; }
/* Monaco diffEditor style.css(并排)。整行 char-* 和 line-* 同在一个 .cm-line 上,char 层用 background-image 叠在 line 层上 */
.monaco-diff-editor { position: relative; overflow: hidden; height: 100%; }
.monaco-diff-editor > .editor { position: absolute; top: 0; height: 100%; }
.monaco-diff-editor.side-by-side > .editor.modified { box-shadow: -6px 0 5px -5px ${v('scrollbar.shadow')}; }
.monaco-diff-editor.side-by-side > .editor.original { box-shadow: 6px 0 5px -5px ${v('scrollbar.shadow')}; }
.cm-line.line-insert { background-color: ${v('diffEditor.insertedLineBackground')}; }
.cm-line.line-delete { background-color: ${v('diffEditor.removedLineBackground')}; }
.cm-line.char-insert { background-image: linear-gradient(${v('diffEditor.insertedTextBackground')}, ${v('diffEditor.insertedTextBackground')}); }
.cm-line.char-delete { background-image: linear-gradient(${v('diffEditor.removedTextBackground')}, ${v('diffEditor.removedTextBackground')}); }
.cm-diffFillLayer > .char-insert { position: absolute; background-color: ${v('diffEditor.insertedTextBackground')}; }
.cm-diffFillLayer > .char-delete { position: absolute; background-color: ${v('diffEditor.removedTextBackground')}; }
/* 空范围:3px 竖条,不占宽(Monaco 画在正文下的装饰层,不推字) */
.diff-range-empty { display: inline-block; width: 0; height: 1lh; vertical-align: top; }
.char-insert.diff-range-empty { border-left: 3px solid ${v('diffEditor.insertedTextBackground')}; margin-right: -3px; }
.char-delete.diff-range-empty { border-left: 3px solid ${v('diffEditor.removedTextBackground')}; margin-left: -1px; margin-right: -2px; }
.cm-gutterElement.gutter-insert { background-color: ${v('diffEditorGutter.insertedLineBackground')}; }
.cm-gutterElement.gutter-delete { background-color: ${v('diffEditorGutter.removedLineBackground')}; }
.cm-lineDecoration.insert-sign, .cm-lineDecoration.delete-sign { font-size: 11px !important; opacity: 0.7; display: flex !important; align-items: center; color: ${v('editor.foreground')}; }
.cm-diffFillLayer { position: absolute; top: 0; left: 0; width: 100%; height: 0; z-index: -1; pointer-events: none; overflow: visible; }
.cm-diffFillLayer > .diagonal-fill {
  position: absolute;
  background-image: linear-gradient(-45deg, ${v('diffEditor.diagonalFill')} 12.5%, transparent 12.5%, transparent 50%, ${v('diffEditor.diagonalFill')} 50%, ${v('diffEditor.diagonalFill')} 62.5%, transparent 62.5%, transparent 100%);
  background-size: 8px 8px;
}
.monaco-diff-editor > .gutter { position: absolute; top: 0; height: 100%; overflow: hidden; background: ${v('editor.background')}; }
.monaco-diff-editor > .gutter > div { position: absolute; }
.monaco-diff-editor .gutterItem { opacity: 0; transition: opacity 0.7s; }
.monaco-diff-editor .gutterItem.showAlways { opacity: 1; transition: none; }
.monaco-diff-editor > .gutter:hover .gutterItem { opacity: 1; transition: opacity 0.1s ease-in-out; }
.monaco-diff-editor .gutterItem .background { position: absolute; height: 100%; left: 50%; width: 1px; border-left: 2px ${v('menu.border')} solid; }
.monaco-diff-editor .gutterItem .buttons { position: absolute; width: 100%; display: flex; justify-content: center; align-items: center; }
.monaco-diff-editor .gutterItem .actions-container { width: fit-content; border-radius: 4px; line-height: 1; display: flex; flex-direction: column; }
.monaco-diff-editor .gutterItem .action-item { display: block; cursor: pointer; border-radius: 5px; }
.monaco-diff-editor .gutterItem .action-item:hover { background: ${v('toolbar.hoverBackground')}; }
.monaco-diff-editor .gutterItem .action-label { display: flex; align-items: center; width: 16px; height: 16px; padding: 1px 2px; border-radius: 5px; color: ${v('icon.foreground')}; font-size: 16px; }
.monaco-diff-editor > .gutter > .cm-scroll-decoration { width: 100%; }
.monaco-diff-editor > .diffOverview { position: absolute; top: 0; height: 100%; z-index: 9; }
.monaco-diff-editor .diffOverviewRuler { position: absolute; top: 0; width: 15px; height: 100%; }
.monaco-diff-editor .diffOverviewRuler > div { position: absolute; left: 0; width: 100%; }
.monaco-diff-editor .diffViewport { position: absolute; left: 0; width: 30px; z-index: 10; background: ${v('scrollbarSlider.background')}; }
.monaco-diff-editor .diffViewport:hover { background: ${v('scrollbarSlider.hoverBackground')}; }
.monaco-diff-editor .diffViewport:active { background: ${v('scrollbarSlider.activeBackground')}; }
.monaco-diff-editor > .diff-sash { position: absolute; top: 0; width: 4px; height: 100%; cursor: ew-resize; z-index: 35; touch-action: none; }
.monaco-diff-editor > .diff-sash::before { content: ''; position: absolute; inset: 0; pointer-events: none; transition: background-color 0.1s ease-out; }
.monaco-diff-editor > .diff-sash:hover::before { background: ${v('focusBorder')}; transition-delay: 0.3s; }
.monaco-diff-editor > .diff-sash.active::before { background: ${v('focusBorder')}; transition-delay: 0s; }
${diffExtraCSS(v)}`
}

/**
 * 兼容接口:结构 CSS + 这组颜色的变量(全局生效,作用在所有 .cm-editor 和浮层上)。
 * liteMonaco() 不再用它 —— 改为结构 CSS 注入一次 + 每实例 inline 变量(见 applyThemeVars)。
 */
export function liteMonacoThemeCSS(colors: ThemeColors): string {
    // 图标字体不在这串 CSS 里(单独的块,见 ensureCodiconFont):在浏览器里调用时顺手装上,和以前一样拿到就能用
    if (typeof document !== 'undefined') ensureCodiconFont(document)
    return `${liteMonacoBaseCSS()}
.cm-editor, ${FLOATING_ROOTS.join(', ')} { ${themeVarsDecl(themeVars(colors))} }
`
}

const BASE_ID = 'lite-monaco-base'

/** 结构 CSS 注入一次(同一个根里所有实例共享)。内容变了(热更新/新版本)才重写。
 *  root 是编辑器所在的根:挂在 shadow DOM 里时 shadow 根自己要一份(外面的样式进不来),
 *  浮层(补全、右键菜单、命令面板…)挂在 document.body,所以 document 也注入一份。 */
export function ensureBaseCSS(root: Document | ShadowRoot = document): void {
    if (root.nodeType === 11) ensureBaseCSS(root.ownerDocument!)
    let el = root.getElementById(BASE_ID) as HTMLStyleElement | null
    const css = liteMonacoBaseCSS()
    if (!el) {
        el = (root.nodeType === 11 ? root.ownerDocument! : root as Document).createElement('style')
        el.id = BASE_ID
        // 排在最前:宿主自己的 .cm-editor 覆盖(字号、高度等)同特异度下后写者胜
        const parent = root.nodeType === 11 ? root : (root as Document).head
        parent.insertBefore(el, parent.firstChild)
    }
    if (el.textContent !== css) el.textContent = css
    ensureCodiconFont(root.nodeType === 11 ? root.ownerDocument! : root as Document)
}

/** 把一组主题变量写到元素 inline style 上(实例根或浮层根)。 */
export function applyThemeVars(el: HTMLElement, vars: Record<string, string>): void {
    for (const k of Object.keys(vars)) el.style.setProperty(k, vars[k])
}
