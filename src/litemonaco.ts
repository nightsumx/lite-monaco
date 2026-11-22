// liteMonaco() —— 一行挂上编辑器。装配 + 注 CSS + 建 View，调用方只给 parent / highlighter / doc。

import { firstStickyOutline, documentSymbolStickyOutline } from './lang/stickymodel'
import { bracketPalette, rulerPalette, resolveThemeColors, usableTheme, type ThemeColors } from './product/theme'
import { tsQuickInfoSource } from './lang/tsquickinfo'
import { markerNavigationExtension } from './lang/markernav'
import { hasLanguageOutline, quickOutlineForLanguage } from './lang/quickoutline'
import { clickDefinition, showDefinitionPreviewHover, definitionHoverSession, definitionLinkDecorations, definitionLinkField, definitionPreviewHoverSource } from './lang/defhover'
import { shikiCodeHighlighter } from './lang/tsmarkdown'
import { materializeDoc } from './core/perf'
import { installInlineCompletions } from './lang/inline/install'
import { installSuggest, type SuggestLive, type SuggestLiveConfig } from './lang/suggestlive'
import { createTSActions, tsActionsAvailable, navHighlightField, navHighlightDecorations } from './lang/tsactions'
import { peekPreview } from './lang/tspeek'
import { signatureHelpSession, triggerSignatureHelp } from './lang/tssignature'
import { tsDiagnosticsSession, tsTagDecorations, tsTagField, tsTagHoverMarkers, type TSDiagnosticsOptions } from './lang/tsdiagnostics'
import { jsxCloseTagInput, jsxLinkedEditInput } from './lang/tsjsx'
import { docCommentInput } from './lang/tsdoc'
import { formatOnTypeInput, formatOnPasteInput } from './lang/tsformaton'
import { inlayField, inlayPressedField, inlayDecorationsFromField, tsInlaySession } from './lang/tsinlay'
import { highlightField, highlightDecorations, tsHighlightSession } from './lang/tshighlight'
import { providerHighlightSession, hasHighlightProvider } from './lang/providerhighlight'
import { semanticField, semanticDecorations } from './lang/providersemantic'
import { providerColorField, providerColorDecorations, providerColorHoverSource } from './lang/providercolors'
import { tsFoldSession } from './lang/tsfold'
import { providerDefinitionActions, hasDefinitionProvider, providerFoldingSession, providerInlaySession } from './lang/providers'
import { tsStickyOutline } from './lang/tssticky'
import { languageStickyOutline } from './lang/outline'
import { tsBracketSkipSession, tsBracketSkipField } from './lang/tsbrackets'
import { smartSelect } from './lang/tssmart'
import { freeTsFileName, getTSService } from './lang/tsservice'
import { codeActionsLightbulb, runCodeActionsMenu, tsDiagnosticHoverActions, cursorMenuAnchor } from './lang/tscodeactions'
import { showActionList } from './core/feature/actionlist'
import type { ScopedShiki } from './core/view/tokens'
import * as core from './core/index'
import { stickyScrollOverlay } from './core/feature/stickyscroll'
import { overlayInputKeymap } from './core/feature/overlay'
import { a11ySession } from './core/feature/a11y'
import { setCopyLanguage } from './core/input/clipboard'
import { registerCodeEditor } from './api/editorregistry'
import { liteMonacoThemeCSS, themeVars, ensureBaseCSS, applyThemeVars } from './product/themecss'
import { createContext, applyApi, type Installer, type EditorHost } from './api/context'
import type { LiteMonacoEditor } from './api/types'
import { featuresToOptions, featuresFromOptions, mergeHostOptions, touchesIndentOptions, installOptions } from './api/options'
import { installContextKeys } from './api/contextkeys'
import { installCommands, executeCommandById } from './api/commands'
import { installActions, setViewPaletteExtras, withViewActionMenu } from './api/actions'
import { installDecorations, decorationsExtension } from './api/decorations'
import { installWidgets } from './api/widgets'
import { installEvents } from './api/events'
import { installViewState } from './api/viewstate'
import { installHost } from './api/host'
import { installLinkedEditing } from './api/linkedediting'
import { installProviderContributions } from './lang/providercontrib'
import { providerHoverSource } from './lang/providerhover'
import { installParameterHints } from './api/parameterhints'
import { eolExtension, _registerModelBase } from './api/model'
import { markerExtensions } from './api/markers'
import { languageConfigExtensions, installLanguageConfig } from './lang/langconfig'
import { installTheme, resolveInitialTheme, type ThemeCapableHighlighter } from './api/themes'
import { bridgeForLanguage } from './api/tokenbridge'
import { getTokenizationRegistry } from './api/tokenization'
import { ensureLazy, isLazyHighlighter } from './api/lazyhighlighter'

// 高亮器契约:shiki 的 codeToTokens + grammarState + getTheme(取主题外壳色)。
export type ShikiLike = ScopedShiki
export interface ShikiHighlightOptions { lang: string; theme: string }

// 特性开关(全部默认开;传 false 关某项)。liteMonaco() 按此 gate 各 decoration/extension/keymap。
export interface LiteMonacoFeatures {
    lineNumbers?: boolean        // 行号
    foldGutter?: boolean         // 折叠槽 + 折叠
    activeLine?: boolean         // 当前行高亮(Monaco 默认有)
    multiCursor?: boolean        // 多光标 / 列选(Alt+drag)
    bracketMatch?: boolean       // 括号匹配高亮
    closeBrackets?: boolean      // 括号/引号自动配对(开括号补闭符/过键/包裹选区)
    indentOnInput?: boolean      // 行首打闭括号自动 dedent 对齐开括号行(对齐 Monaco/VSCode)
    bracketColors?: boolean      // 括号对着色(按嵌套深度循环上色,VS Code 默认开)
    overviewRuler?: boolean      // 概览标记(光标/搜索/诊断)画在最右滚动条列;与竖条同 14px
    minimap?: boolean            // 右侧代码缩略图;布局 content | minimap | scrollbar
    selectionMatch?: boolean     // 选中词的同词高亮(Monaco 标志性体验)
    indentGuide?: boolean        // 缩进参考线(竖线看嵌套层级,VS Code 默认有)
    search?: boolean             // 搜索替换(Ctrl+F)
    autocomplete?: boolean       // 静态补全框架(关键字/片段,非语义)
    hover?: boolean              // 鼠标悬停 tooltip(诊断卡 + TS/JS 类型签名/JSDoc,懒加载 typescript)
    history?: boolean            // 撤销/重做
    tabIndent?: boolean          // Tab 缩进(而非移焦点)
    hScrollbar?: boolean         // 横向滚动条(几何真源定律:contentWidth 走模型层行宽度量表)
    vScrollbar?: boolean         // 竖向滚动条(最右 14px 自绘,Monaco 方角 thumb;默认开)
    contextMenu?: boolean        // Monaco 风格右键菜单(Cut/Copy/Paste + 占位 LSP 项;默认开)
    /** TS/JS 参数提示(输入 `(` / `,` 或 Mod-Shift-Space);默认开 */
    signatureHelp?: boolean
    /** TS/JS 防抖自动诊断波浪线(source:'ts');默认开。宿主手工诊断用其它 source */
    tsDiagnostics?: boolean
    /** 视觉换行 word wrap;默认关(对齐 Monaco wordWrap:off) */
    lineWrapping?: boolean
    /** 末行之后还能往下滚一屏减一行;默认开(对齐 Monaco scrollBeyondLastLine) */
    scrollBeyondLastLine?: boolean
    /** 视口顶粘性作用域行(缩进启发式);默认开 */
    stickyScroll?: boolean
    /** TS Quick Fix lightbulb + Mod-.;默认开(仅 TS/JS) */
    codeActions?: boolean
    /** 无障碍 live region + 选区/诊断播报;默认开 */
    a11y?: boolean
    /** TS/JS 打 `;` / `}` 后格式化本行;默认关(对齐 Monaco formatOnType:false)。开着时与原输入同一个撤销步 */
    formatOnType?: boolean
    /** TS/JS 粘贴多行后格式化粘贴区;默认关(对齐 Monaco formatOnPaste:false)。多选区粘贴不格式化 */
    formatOnPaste?: boolean
    /** TS/JS 参数名 inlay hint;默认关(对齐 Monaco/TS 默认不显示) */
    inlayHints?: boolean
    /** TS 未使用符号淡显(cm-unnecessary)、废弃符号删除线(cm-deprecated);默认开(对齐 Monaco showUnused/showDeprecated) */
    tsUnusedFade?: boolean
}

// 从 shiki highlighter 取某主题的 bg/fg/明暗 + 精确外壳色(colors 字段),喂给外壳主题。
// shiki 的 getTheme 返回 { bg, fg, type, colors }，colors 是 VS Code 主题的完整色表。
interface ShikiWithTheme extends ShikiLike {
    getTheme?(name: string): { bg: string; fg: string; type: 'light' | 'dark'; colors?: Record<string, string> }
}

export interface LiteMonacoOptions {
    parent: Element
    highlighter: ShikiLike
    doc?: string
    lang?: string
    theme?: string
    features?: LiteMonacoFeatures
    /**
     * Monaco 的编辑器选项(IStandaloneEditorConstructionOptions 里的那一份):名字、取值、默认值都和 Monaco 一致。
     * 特性模块从 state 读(`core.getOption(state, 'find')`),所以运行时换选项不用重建 state。
     */
    options?: core.IEditorOptions
    colors?: ThemeColors
    diagnostics?: core.Diagnostic[]
    /** 往共享 TS 项目里加的宿主文件(path → 内容;只增改)。整表替换/删除用 setTsFiles / updateTsFile */
    tsFiles?: Record<string, string>
    /**
     * 诊断(波浪线、未使用淡显)由宿主算,不走本编辑器的语言服务(比如宿主另有一个按整个工程、按 tsconfig 检查的 Worker)。
     * 宿主在自己那边用 computeTsDiagnostics 算。补全、悬停、跳转等仍用语言服务
     */
    tsDiagnosticsRemote?: TSDiagnosticsOptions['remote']
    /**
     * 当前文件路径(如 `/repo/src/a.ts`)。同语言族(TS / JS)的编辑器共用一个 TS 项目,按路径区分文件,
     * 互相 import 可见(对齐 Monaco 同 worker 的 model);`.js` 按 JS 检查(不报 TS 类型错)。
     * 不传 → 取一个没被占用的 `/main.ts`、`/main-2.ts`…
     */
    fileName?: string
    readOnly?: boolean
    /**
     * 文档变了(Monaco onDidChangeModelContent):这笔事务的各处改动,from / to 是改前文档里的偏移,text 是插入的文本,
     * 按位置升序。不拼整篇文档,要全文自己取 view.state.sliceDoc()
     */
    onChange?: (changes: { from: number, to: number, text: string }[], view: core.EditorView) => void
    /**
     * 光标 / 选区变了(Monaco onDidChangeCursorSelection):事务设了选区,或文档变了(选区随改动映射,
     * Monaco 改内容也总发一次,含程序整篇替换)。每笔事务至多一次;只带 effect 的事务(诊断、折叠范围到了)不发
     */
    onSelectionChange?: (selection: core.EditorSelection, view: core.EditorView) => void
    dispatch?: (tr: core.Transaction, view: core.EditorView) => void
    extensions?: core.Extension[]
    /**
     * 宿主按键,排在内置 keymap 之前(先命中先得;run 返回 false 落到内置)。例:Mod-s 保存。
     */
    keymap?: readonly core.KeyBinding[]
    /**
     * 恢复一个以前由 liteMonaco() 建出的 state(`view.state`):撤销历史、选区、折叠都保留。
     * 给了 state 就忽略 doc。lite-monaco 自身的扩展按本次的 lang/theme/features 重装(换主题/语言用它)。
     * 多 tab 宿主:切走时存 view.state + destroy,切回时 liteMonaco({ state })。
     */
    state?: core.EditorState
}

/**
 * liteMonaco() 装的扩展都放在这一个槽里。state 复用时 reconfigure 这个槽:字段值(history/fold…)
 * 按 field 身份保留,decoration/keymap 这类带 theme/lang 闭包的东西换成新的。
 */
const liteMonacoSlot = new core.Compartment()
/**
 * 运行时选项槽(editorOptions facet + 文本模型选项 + readOnly)。嵌套在 liteMonacoSlot 里:
 * 嵌套槽在外层 reconfigure 时沿用旧内容,所以换选项/换装配时两个槽要在同一个事务里一起 reconfigure。
 */
const optionsSlot = new core.Compartment()
// H3 的 createModel 出来的 state 带上装配槽,liteMonaco({ state: model.getState() }) 才认它是自己的 state 并沿用历史 / 选区 / 折叠
_registerModelBase(liteMonacoSlot.of([]))

/** state 是否出自 liteMonaco()(带 liteMonacoSlot)。不是的话只取它的 doc/selection 重建。 */
function hasLiteMonacoSlot(state: core.EditorState): boolean {
    return state.config.compartments.has(liteMonacoSlot)
}

/** 本次装配的扩展装进 state:新建,或把旧 state 的槽换成新扩展。 */
function stateFor(opts: LiteMonacoOptions, extensions: core.Extension[], optionsExt: core.Extension): core.EditorState {
    const prior = opts.state
    // 换行符照 Monaco 打开文件时认(TextModel EOL):按首个换行定 \r\n 或 \n,之后插入的换行都用它,sliceDoc 原样拼回
    const doc = opts.doc ?? ''
    let eol = '\n'
    for (let i = 0; i < doc.length; i++) {
        const c = doc.charCodeAt(i)
        if (c === 10) break
        if (c === 13) { if (doc.charCodeAt(i + 1) === 10) eol = '\r\n'; break }
    }
    const base = prior && hasLiteMonacoSlot(prior)
        ? prior
        : core.EditorState.create({
            doc: prior ? prior.doc : doc,
            selection: prior?.selection,
            extensions: [liteMonacoSlot, eolExtension(prior ? '\n' : eol)],
        })
    // 带 liteMonacoSlot 但还没有 optionsSlot 的 state(createModel 出来的):optionsSlot 随 liteMonacoSlot 的新内容一起建,不能单独 reconfigure
    const effects = [liteMonacoSlot.reconfigure(extensions), ...(base.config.compartments.has(optionsSlot) ? [optionsSlot.reconfigure(optionsExt)] : [])]
    return base.applyTransaction(base.update({ effects }))
}

// 宿主 colors 逐项优先,缺的从 shiki 主题(bg/fg/colors 全表/tokenColors)补,再缺走 VS Code registry 默认
function resolveColors(hl: ShikiWithTheme, theme: string, override?: ThemeColors): ThemeColors {
    return resolveThemeColors(hl, theme, override)
}

export { liteMonacoThemeCSS }

interface Assembled {
    extensions: core.Extension[]
    drawSelection: boolean
    lineNumbers: boolean
    lineWrapping: boolean
    scrollBeyondLastLine: boolean
    keymap: readonly core.KeyBinding[]
    /** 本实例的主题 CSS 变量(挂 .cm-editor inline;结构 CSS 全页共享一份) */
    themeVars: Record<string, string>
    overlays: ((view: core.EditorView) => () => void)[]
    makeFoldGutter: ((dispatch: (tr: core.Transaction) => void) => core.FoldGutterSpec) | null
    /** 本实例专属的 F1 命令(TS 动作、Show Definition Preview Hover、Trigger Parameter Hints…);getAction 也按 Monaco id 认其中几个 */
    paletteExtra: core.PaletteCommand[]
    /** 补全的运行时配置(TS 服务选项 / 代码块高亮);autocomplete 关着时为 null */
    suggest: SuggestLiveConfig | null
}

interface AssembleOpts {
    lang: string
    theme: string
    features?: LiteMonacoFeatures
    colors?: ThemeColors
    diagnostics?: core.Diagnostic[]
    tsFiles?: Record<string, string>
    tsDiagnosticsRemote?: TSDiagnosticsOptions['remote']
    fileName?: string
    /** 本编辑器在共享 TS 项目里的文件名(构造时定一次,重装配沿用;没给时 assemble 自己取一个空闲名) */
    tsFile?: string
    /** 没有宿主给的 fileName(peek 预览、诊断消息的文件名等据此判断);默认看 fileName 是否为空 */
    inMemory?: boolean
    /** 进共享 TS 项目(peek 的预览编辑器不进:只是只读地看一份文本) */
    ts: boolean
}

// 语言→行注释符。绝大多数 C 系用 '//';少数例外单列。未知语言默认 '//'。
const LINE_COMMENT: Record<string, string> = {
    python: '#', py: '#', ruby: '#', rb: '#', shell: '#', bash: '#', sh: '#', yaml: '#', yml: '#', toml: '#', ini: '#', perl: '#', r: '#',
    lua: '--', sql: '--', haskell: '--',
    lisp: ';', clojure: ';',
    vim: '"',
}
function lineCommentToken(lang: string): string {
    return LINE_COMMENT[lang.toLowerCase()] ?? '//'
}

// 块注释：HTML/XML 特殊；其余 C 系 /* */；python 无标准块注释 → null
function blockCommentToken(lang: string): { open: string, close: string } | undefined {
    const l = lang.toLowerCase()
    if (l === 'html' || l === 'xml' || l === 'svg') return { open: '<!--', close: '-->' }
    if (l === 'python' || l === 'py' || l === 'ruby' || l === 'rb' || l === 'shell' || l === 'bash')
        return undefined
    if (l === 'css' || l === 'scss' || l === 'less') return { open: '/*', close: '*/' }
    return { open: '/*', close: '*/' }
}

// region 标记:照 Monaco 各语言 conf 的 folding.markers;表里没有的语言(含纯文本)没有标记,同 Monaco
const S: core.MarkerStep = { ws: 0 }
const S1: core.MarkerStep = { ws: 1 }
const SLASH: core.FoldMarkers = { start: [['//', S, { opt: '#' }, { word: 'region' }]], end: [['//', S, { opt: '#' }, { word: 'endregion' }]] }
const HASH: core.FoldMarkers = { start: [[{ word: '#region' }]], end: [[{ word: '#endregion' }]] }
const CSS: core.FoldMarkers = { start: [['/*', S, { word: '#region' }, { then: '*/' }]], end: [['/*', S, { word: '#endregion' }, { then: '*/' }]] }
const PRAGMA: core.FoldMarkers = { start: [['#pragma', S1, { word: 'region' }]], end: [['#pragma', S1, { word: 'endregion' }]] }
const JVM: core.FoldMarkers = { start: [['//', S, { opt: '#' }, { word: 'region' }], ['//', S, { word: '<editor-fold' }]], end: [['//', S, { opt: '#' }, { word: 'endregion' }], ['//', S, '</editor-fold>']] }
const HTML_MARKERS: core.FoldMarkers = { start: [['<!--', S, { word: '#region' }, { then: '-->' }]], end: [['<!--', S, { word: '#endregion' }, { then: '-->' }]] }
const MD: core.FoldMarkers = { start: [['<!--', S, { opt: '#' }, { word: 'region' }, { then: '-->' }]], end: [['<!--', S, { opt: '#' }, { word: 'endregion' }, { then: '-->' }]] }
const FOLD_MARKERS: Record<string, core.FoldMarkers> = {
    typescript: SLASH, ts: SLASH, tsx: SLASH, mts: SLASH, cts: SLASH, javascript: SLASH, js: SLASH, jsx: SLASH, mjs: SLASH, cjs: SLASH,
    python: HASH, py: HASH, coffee: HASH, coffeescript: HASH, csharp: HASH, cs: HASH, 'c#': HASH, powershell: HASH, ps1: HASH, ps: HASH, mips: HASH,
    css: CSS, less: CSS, scss: CSS,
    c: PRAGMA, cpp: PRAGMA, 'c++': PRAGMA, rust: PRAGMA, rs: PRAGMA,
    java: JVM, kotlin: JVM, kt: JVM, kts: JVM, scala: JVM, apex: JVM,
    html: HTML_MARKERS, markdown: MD, md: MD, rst: MD,
    php: { start: [['#', { word: 'region' }], ['//', { word: 'region' }]], end: [['#', { word: 'endregion' }], ['//', { word: 'endregion' }]] },
    bat: { start: [['::', S, '#region'], ['REM', S1, '#region']], end: [['::', S, '#endregion'], ['REM', S1, '#endregion']] },
    vb: { start: [[{ word: '#Region' }]], end: [[{ word: '#End Region' }]] },
    pascal: { start: [['{$REGION}'], ["{$REGION '", { then: "'}" }]], end: [['{$ENDREGION}']] },
    fsharp: { start: [['//', S, { word: '#region' }], ['(*', S, '#region', { then: '*)' }]], end: [['//', S, { word: '#endregion' }], ['(*', S, '#endregion', S, '*)']] },
    dart: { start: [[{ opt: '#' }, { word: 'region' }]], end: [[{ opt: '#' }, { word: 'endregion' }]] },
}

function assemble(hl: ShikiWithTheme, opts: AssembleOpts): Assembled {
    opts = { ...opts, theme: usableTheme(hl, opts.theme) }
    const colors = resolveColors(hl, opts.theme, opts.colors)
    // 所有 TS 源共用一份选项。同语言族的编辑器共用一个 TS 项目(互相 import 可见,对齐 Monaco),
    // 每个编辑器是项目里的一个文件;没给 fileName 时取一个没被占用的 /main.ts、/main-2.ts…
    const tsLangHere = opts.ts && tsActionsAvailable(opts.lang)
    const tsOpts = {
        lang: opts.lang,
        files: opts.tsFiles,
        fileName: opts.tsFile ?? opts.fileName ?? (tsLangHere ? freeTsFileName(opts.lang) : undefined),
    }
    const shikiOpts = { lang: opts.lang, theme: opts.theme }
    // 这个语言在 TokenizationRegistry 里登记过分词器(setTokensProvider / Monarch):渲染吃分词器的 token,否则照旧走 shiki
    const tokHl = bridgeForLanguage(hl, opts.lang)
    const f = opts.features ?? {}
    const deco: core.Extension[] = []
    // Monaco plaintext 没有 language configuration 的 brackets,不上彩虹括号(对照页实测)。text 是同一档。
    const plain = opts.lang === 'plaintext' || opts.lang === 'text'
    if (f.bracketColors !== false && !plain) deco.push(core.decorations.of(core.bracketColorizeCM7(tokHl, shikiOpts, bracketPalette(colors))))
    deco.push(core.decorations.of(core.shikiHighlightCM7(tokHl, shikiOpts)))
    if (f.indentGuide !== false) deco.push(core.decorations.of(core.indentGuidesCM7()))
    // 当前行 / 同词 / 括号匹配不走装饰:画在 highlightLayer(与光标同帧更新,见 selectionlayer.ts)
    if (f.overviewRuler !== false) deco.push(core.decorations.of(core.diagnosticSquiggles))
    if (f.foldGutter !== false) deco.push(core.decorations.of(core.foldDecorations))
    // setHiddenAreas(宿主直接藏行)与折叠开关无关,恒开
    deco.push(core.decorations.of(core.hiddenAreaDecorations), core.hiddenAreasField)
    if (f.search !== false) deco.push(core.decorations.of(core.searchDecorations))
    deco.push(core.decorations.of(core.hexColorDecorations))
    // languages.registerColorProvider:provider 给的颜色(没 provider 时 field 恒空)
    deco.push(core.decorations.of(providerColorDecorations), providerColorField)
    deco.push(core.decorations.of(semanticDecorations), semanticField) // 语义着色盖在语法着色 / 括号着色之后
    // 链接识别(`links` 选项,默认开):detected-link 下划线;按住修饰键悬停 detected-link-active
    deco.push(core.decorations.of(core.linkDecorations), core.decorations.of(core.activeLinkDecorations))
    // languages.registerLinkProvider:provider 的链接(没 provider 时 field 恒空;field 在下面和 activeLinkField 一起装)
    deco.push(core.decorations.of(core.providerLinkDecorations))
    deco.push(core.decorations.of(core.specialCharDecorations))
    deco.push(core.decorations.of(core.trailingWhitespaceDecorations))
    deco.push(core.decorations.of(core.tabStopDecorations))
    deco.push(core.decorations.of(core.escapedLineFeedDecorations)) // wrapOnEscapedLineFeeds

    // setLanguageConfiguration 设过的语言:配置整份替换内置表(见 lang/langconfig.ts)
    const langCfg = languageConfigExtensions(opts.lang)
    const extensions: core.Extension[] = [
        ...(langCfg?.pre ?? []),
        // 缩进选项槽放最前:tabSize / indentUnit facet 取首个值,命令(Indent Using Spaces 等)写进来的值盖过后面的配置
        core.indentOptions.of([]),
        ...deco,
        ...(f.history !== false ? [core.history()] : []),
        core.EditorState.allowMultipleSelections.of(f.multiCursor !== false),
        core.commentTokens.of({
            line: lineCommentToken(opts.lang),
            block: blockCommentToken(opts.lang),
        }),
        core.foldingMarkers.of(FOLD_MARKERS[opts.lang.toLowerCase()] ?? null),
        ...(langCfg?.post ?? []),
        // plaintext 没设语言配置时只自动补三种括号,不补引号 / 反引号(Monaco 注册表里 plaintext 的 brackets;浏览器差分实测)
        ...(plain && !langCfg ? [core.closingConfig.of({ pairs: [{ open: '(', close: ')' }, { open: '[', close: ']' }, { open: '{', close: '}' }] })] : []),
    ]
    if (f.foldGutter !== false) {
        extensions.push(core.foldField)
        extensions.push(core.extraFoldField)
        extensions.push(core.manualFoldField)
    }
    // searchField:搜索面板 + 命中装饰;overview ruler 也读 matches,二者任一开都装 field(只装一次)。
    if (f.search !== false || f.overviewRuler !== false) extensions.push(core.searchField)
    extensions.push(core.activeLinkField) // 链接激活态(按住修饰键悬停)
    extensions.push(core.providerLinkField)
    if (f.overviewRuler !== false) extensions.push(core.rangeHighlightField)
    // 波浪线读 diagnosticsField;hover 诊断卡源也依赖它。
    if (f.overviewRuler !== false) extensions.push(core.diagnosticsField)
    // hover:诊断卡源(读 diagnosticsField)对任意语言;TS/JS 再叠类型签名源(懒加载 typescript,首次 hover 才拉)。
    if (f.hover !== false) {
        if (f.overviewRuler === false) extensions.push(core.diagnosticsField) // 诊断卡源依赖它,ruler 关时补上
        extensions.push(core.hoverSources.of(core.diagnosticHoverSource))
        extensions.push(core.hoverSources.of(core.linkHoverSource))
        extensions.push(core.hoverSources.of(core.unicodeHoverSource)) // 不可见 / 易混字符的说明(行内不再包 span,见 specialchar.ts)
        // languages.registerHoverProvider:任何语言都问,和诊断 / quickInfo 并进同一张卡
        extensions.push(core.hoverSources.of(providerHoverSource))
        extensions.push(core.hoverSources.of(providerColorHoverSource))
        // 颜色卡(Monaco ColorHoverParticipant):Monaco 只有 CSS 系语言带颜色提供器
        if (/^(css|scss|less)$/.test(opts.lang)) extensions.push(core.hoverSources.of(core.colorHoverSource))
        if (tsLangHere) {
            // hint 级(未使用 / 废弃 / suggestion)并进诊断卡,和诊断一起排序(Monaco marker participant)
            if (f.tsDiagnostics !== false && f.tsUnusedFade !== false) extensions.push(tsTagHoverMarkers)
            // JSDoc 代码块用同一个 shiki/主题上色
            extensions.push(core.hoverSources.of(tsQuickInfoSource(tsOpts, { highlight: shikiCodeHighlighter(hl, opts.theme) })))
            // 诊断卡底部 Quick Fix…(对齐 Monaco marker hover 状态栏)
            if (f.codeActions !== false) extensions.push(core.diagnosticHoverActions.of(tsDiagnosticHoverActions(tsOpts)))
        }
    }
    // autoIndent = 'full' 时打字按 indentationRules 调缩进(Monaco AutoIndentOperation 排在自动配对之前);默认 'advanced' 不动
    if (f.indentOnInput !== false) extensions.push(core.inputHandler.of(core.autoIndentOnType))
    // 自动配对:经 inputHandler facet 注入(统一输入拦截点,不再是 EditorView 硬开关)。
    if (f.closeBrackets !== false) extensions.push(core.closeBrackets())
    const jsxLang = opts.ts && (opts.lang.toLowerCase() === 'tsx' || opts.lang.toLowerCase() === 'jsx')
    if (jsxLang) {
        extensions.push(core.inputHandler.of(jsxCloseTagInput(tsOpts)))
        extensions.push(core.inputHandler.of(jsxLinkedEditInput(tsOpts)))
    }
    const tsLangInput = tsLangHere
    if (tsLangInput) {
        extensions.push(core.inputHandler.of(docCommentInput(tsOpts)))
        if (f.formatOnType === true) extensions.push(core.inputHandler.of(formatOnTypeInput(tsOpts)))
        if (f.formatOnPaste === true) extensions.push(core.inputHandler.of(formatOnPasteInput(tsOpts)))
        // 内联提示(Monaco inlayHints.*):field 总是装,这样运行时 setInlayHintsOptions / updateOptions 随时生效;
        // 没人配 TS 选项、也没开旧开关 features.inlayHints 时不请求任何 hint(Monaco 默认 TS 选项为空 = 无 hint)
        extensions.push(inlayField)
        extensions.push(inlayPressedField)
        extensions.push(core.decorations.of(inlayDecorationsFromField))
        extensions.push(highlightField)
        // deco 已在上面展开进 extensions,这里直接进 extensions(旧代码 push 进 deco → 从不生效)
        extensions.push(core.decorations.of(highlightDecorations))
        // F12 跳转后名字闪一下(Monaco symbolHighlight,350ms)
        extensions.push(navHighlightField)
        extensions.push(core.decorations.of(navHighlightDecorations))
    }
    else {
        // languages.registerDocumentHighlightProvider:非 TS 语言也有同符号高亮(provider 才写,没 provider 时 field 恒空)
        extensions.push(highlightField)
        extensions.push(core.decorations.of(highlightDecorations))
    }
    // indentOnInput:行首打闭括号自动 dedent 对齐开括号行(对齐 Monaco/VSCode)。同经 inputHandler facet。
    if (f.indentOnInput !== false) extensions.push(core.inputHandler.of(core.indentOnInput))

    // 补全键位对齐 Monaco:Tab/Enter 接受,↑↓ 移动,PgUp/Dn 翻页,Esc 关;显式触发 = Monaco editor.action.triggerSuggest
    // (Mac ⌃Space / ⌥Esc / ⌘I,Win/Linux Ctrl+Space / Ctrl+I)。⌘Space 在 Monaco 不是 triggerSuggest,不绑。
    // Tab/Enter 须先于 defaultKeymap 的 insertTab/insertNewline;未打开时返 false 穿透。
    // 平台照 Monaco 三分(core/keyos.ts):kbOpts 的 mac / win / linux 字段
    const os = core.keyOS
    const isMacKeys = os === 'mac'
    const completionBindings: core.KeyBinding[] = f.autocomplete === false ? [] : [
        // Tab:snippet 跳位 → 接受补全 → (穿透) insertTab
        { key: 'Tab', run: core.suggestTab },
        // Shift+Tab / Shift+Enter:列表开着时用相反的 insertMode 接受(Monaco acceptAlternativeSelectedSuggestion);否则回上一个占位
        { key: 'Shift-Tab', run: (target) => core.suggestShiftTab(target) },
        { key: 'Shift-Enter', run: core.suggestAcceptAlternative },
        // Enter:受 acceptSuggestionOnEnter(on / smart / off)约束
        { key: 'Enter', run: core.suggestAcceptOnEnter },
        // Monaco selectNext/PrevSuggestion:↑↓ + ⌘↑↓(Mac 另有 ⌃N / ⌃P);只剩一项时返 false 穿透成光标移动
        { key: 'ArrowDown', run: core.suggestNext },
        { key: 'ArrowUp', run: core.suggestPrev },
        { key: 'Mod-ArrowDown', run: core.suggestNext },
        { key: 'Mod-ArrowUp', run: core.suggestPrev },
        ...(isMacKeys ? [{ key: 'Ctrl-n', run: core.suggestNext }, { key: 'Ctrl-p', run: core.suggestPrev }] : []),
        { key: 'PageDown', run: core.suggestPageNext },
        { key: 'PageUp', run: core.suggestPagePrev },
        { key: 'Mod-PageDown', run: core.suggestPageNext },
        { key: 'Mod-PageUp', run: core.suggestPagePrev },
        { key: 'Ctrl-Space', run: core.suggestTrigger },
        { key: 'Mod-i', run: core.suggestTrigger },
        ...(isMacKeys ? [{ key: 'Alt-Escape', run: core.suggestTrigger }] : []),
        { key: 'Escape', run: core.suggestClose },
        { key: 'Shift-Escape', run: core.suggestClose },
        // leaveSnippet(Esc / Shift+Esc):补全列表之后、查找框之前退出片段会话
        { key: 'Escape', run: core.suggestLeaveSnippet },
        { key: 'Shift-Escape', run: core.suggestLeaveSnippet },
    ]
    // 搜索快捷键对齐 Monaco:Mod-f 查找,替换 Mac ⌥⌘F(⌘H 是系统的隐藏应用)/ Win·Linux Ctrl+H,F3 下上,Esc 关
    const searchBindings: core.KeyBinding[] = f.search === false ? [] : [
        { key: 'Mod-f', run: core.openSearch },
        { key: isMacKeys ? 'Mod-Alt-f' : 'Mod-h', run: core.openSearchReplace },
        { key: 'F3', run: core.findNext },
        { key: 'Shift-F3', run: core.findPrev },
        { key: 'Escape', run: core.closeSearch },
        // 查找开关(Monaco ToggleCaseSensitiveKeybinding 等):Mac ⌥⌘C/W/R/L/P,Win/Linux Alt+C/W/R/L/P
        ...core.findToggleBindings(isMacKeys),
        { key: 'Alt-Enter', run: core.selectAllSearchMatches },
    ]
    // Go to Line(Monaco):Mac ⌃G(⌘G / ⇧⌘G 是查找下一个/上一个,和 F3 / ⇧F3 同);Win/Linux Ctrl+G。
    // 带上 paletteExtra(下面定义,按键时才读):删掉 ':' 回帮助列表有 '@',框里按 F1 有 TS 命令。
    const gotoBindings: core.KeyBinding[] = isMacKeys
        ? [
            { key: 'Ctrl-g', run: (target) => core.openGotoLine(target as core.EditorView, core.defaultPaletteCommands(paletteExtra)) },
            ...(f.search === false ? [] : [
                { key: 'Mod-g', run: core.findNext },
                { key: 'Mod-Shift-g', run: core.findPrev },
            ]),
        ]
        : [{ key: 'Mod-g', run: (target) => core.openGotoLine(target as core.EditorView, core.defaultPaletteCommands(paletteExtra)) }]
    // 折叠键位照 Monaco folding.js:Fold/Unfold 在 Mac 是 ⌘⌥[ ⌘⌥],Win/Linux 是 Ctrl+Shift+[ ];其余走 ⌘K 和弦。
    // Mac 上 ⌘⇧[ ⌘⇧] 不是编辑器键(宿主拿来切标签页),不认领。
    const foldBindings: core.KeyBinding[] = f.foldGutter === false ? [] : [
        { key: isMacKeys ? 'Mod-Alt-[' : 'Mod-Shift-[', run: core.foldCode },
        { key: isMacKeys ? 'Mod-Alt-]' : 'Mod-Shift-]', run: core.unfoldCode },
        { key: 'Mod-k Mod-l', run: core.toggleFold },
        { key: 'Mod-k Mod-0', run: core.foldAll },
        { key: 'Mod-k Mod-j', run: core.unfoldAll },
        { key: 'Mod-k Mod-[', run: core.foldRecursively },
        { key: 'Mod-k Mod-]', run: core.unfoldRecursively },
        ...[1, 2, 3, 4, 5, 6, 7].map(n => ({ key: `Mod-k Mod-${n}`, run: core.foldLevel(n) })),
        { key: 'Mod-k Mod-Shift-l', run: core.toggleFoldRecursively },
        { key: 'Mod-k Mod-/', run: core.foldAllBlockComments },
        { key: 'Mod-k Mod-8', run: core.foldAllMarkerRegions },
        { key: 'Mod-k Mod-9', run: core.unfoldAllMarkerRegions },
        { key: 'Mod-k Mod--', run: core.foldAllExcept },
        { key: 'Mod-k Mod-=', run: core.unfoldAllExcept },
        { key: 'Mod-k Mod-,', run: core.foldFromSelection },
        { key: 'Mod-k Mod-.', run: core.removeManualFoldingRanges },
    ]
    // ⌘K ⌘I:Monaco editor.action.showHover(光标处弹 hover 卡,键盘唤起)
    const hoverBindings: core.KeyBinding[] = f.hover === false ? [] : [
        { key: 'Mod-k Mod-i', run: (target) => { void core.showHover(target as core.EditorView); return true } },
    ]
    // F8 / ⇧F8 = marker.nextInFiles / prevInFiles,⌥F8 / ⇧⌥F8 = marker.next / prev(单文件里是同一件事)
    const problemBindings: core.KeyBinding[] = [
        { key: 'F8', run: core.goToNextProblem },
        { key: 'Shift-F8', run: core.goToPrevProblem },
        { key: 'Alt-F8', run: core.goToNextProblem },
        { key: 'Shift-Alt-F8', run: core.goToPrevProblem },
    ]
    const commentBindings: core.KeyBinding[] = [
        { key: 'Mod-/', run: core.toggleComment },
        // Monaco addCommentLine / removeCommentLine:⌘K ⌘C / ⌘K ⌘U
        { key: 'Mod-k Mod-c', run: core.addLineComment },
        { key: 'Mod-k Mod-u', run: core.removeLineComment },
        // Monaco blockComment:⇧⌥A(Linux 只有 Ctrl+Shift+A)
        { key: os === 'linux' ? 'Ctrl-Shift-a' : 'Shift-Alt-a', run: core.toggleBlockComment },
        // Monaco trimTrailingWhitespace:⌘K ⌘X
        { key: 'Mod-k Mod-x', run: core.deleteTrailingWhitespace },
    ]
    // Monaco toggleTabFocusMode:Mac ⌃⇧M,Win/Linux Ctrl+M
    const tabFocusBindings: core.KeyBinding[] = [
        { key: isMacKeys ? 'Ctrl-Shift-m' : 'Ctrl-m', run: target => core.toggleTabFocusModeAnnounced(target as core.EditorView) },
    ]
    // 自动配对开时:退格优先删配对(夹在括号中间同删两个),不成对则返 false 落普通退格。
    const closeBracketBindings: core.KeyBinding[] = f.closeBrackets === false ? [] : [
        { key: 'Backspace', run: core.deleteBracketPair },
    ]
    // Monaco editor.action.removeBrackets:⌥⌘⌫ / Ctrl+Alt+Backspace
    const bracketBindings: core.KeyBinding[] = [{ key: 'Mod-Alt-Backspace', run: core.removeBrackets }]
    const editKeys = f.tabIndent === false
        ? core.defaultKeymap.filter(b => b.key !== 'Tab' && b.key !== 'Shift-Tab')
        : core.defaultKeymap
    const keymap: core.KeyBinding[] = [
        ...completionBindings, ...searchBindings, ...gotoBindings, ...foldBindings,
        ...commentBindings, ...tabFocusBindings, ...hoverBindings, ...problemBindings, ...bracketBindings, ...closeBracketBindings, ...editKeys,
    ]

    const overlays: ((view: core.EditorView) => () => void)[] = []
    // 本编辑器的文件挂进共享 TS 项目;destroy 时移出(别的编辑器不再看到它)
    // 编辑器占一个项目文件;跨文件重命名经 applyTextChanges 写回本编辑器(一个撤销步)
    // 括号跳过表(字符串/注释/正则/模板串)改用 TS 语法树,比 shiki TextMate 准(lang/tsbrackets)
    // tsBracketSkipField 在事务里记「区间表 → 当前文档」的累积改动,按键那一版渲染时就能查到映射后的临时表
    if (tsLangHere) extensions.push(tsBracketSkipField)
    if (tsLangHere) overlays.push(view => tsBracketSkipSession(view, tsOpts))
    if (tsLangHere) overlays.push(view => getTSService(tsOpts).acquire({
        getText: () => materializeDoc(view.state),
        applyTextChanges: (changes, userEvent) => {
            const len = view.state.doc.length
            view.dispatch(view.state.update({
                changes: changes
                    .filter(c => c.start + c.length <= len)
                    .map(c => ({ from: c.start, to: c.start + c.length, insert: c.newText })),
                userEvent,
            }))
        },
    }))
    // 种子诊断(CM7 无 StateField.init):构造后 dispatch setDiagnostics。
    if (opts.diagnostics?.length) {
        const seed = opts.diagnostics
        overlays.push((view) => {
            view.dispatch(view.state.update({ effects: core.setDiagnostics.of(seed) }))
            return () => {}
        })
    }
    // 布局顺序 = 挂载顺序:minimap 先、竖条后 → flex 为 content | minimap | scrollbar。
    // 右边没有竖条 / 概览列时 minimap 贴右缘 = Monaco verticalScrollbarSize 0(面板宽公式里不减 14)。
    // TS 有语义同词高亮(tsHighlightSession 写 highlightField)时,minimap 画的就是那份装饰(Monaco minimap 画 WordHighlighter 的装饰)。
    if (f.minimap !== false) overlays.push(core.minimapCM7(tokHl, shikiOpts, rulerPalette(colors), {
        verticalScrollbarWidth: f.vScrollbar !== false || f.overviewRuler !== false ? 14 : 0,
        wordHighlights: tsLangInput && f.tsDiagnostics !== false ? state => state.field(highlightField, false) ?? null : providerWordMarks,
    }))
    // 竖条最右 14px:自绘 thumb + overview 标记(不再单独出 overview 列,避免夹在正文/minimap 间)。
    // 概览尺的同词 / 选中串 / 括号标记跟正文同源(Monaco 画的是同一批装饰)
    const tsWords = tsLangInput && f.tsDiagnostics !== false
    const overview = {
        wordHighlights: tsWords ? (state: core.EditorState) => state.field(highlightField, false) ?? null : providerWordMarks,
        wordHighlightsFallback: !tsWords,
        textualWords: !tsWords && f.selectionMatch !== false,
        selectionHighlight: f.selectionMatch !== false,
        bracketMatch: f.bracketMatch !== false,
        // Monaco:minimap 开在右边时概览尺铺编辑器底色(Settings.backgroundColor)
        background: f.minimap !== false ? colors.bg : undefined,
    }
    if (f.vScrollbar !== false) {
        overlays.push(core.vScrollbarCM7(rulerPalette(colors), { marks: f.overviewRuler !== false, overview }))
    } else if (f.overviewRuler !== false) {
        overlays.push(core.overviewRulerCM7(rulerPalette(colors), { overview }))
    }
    if (f.hScrollbar !== false) overlays.push(core.hScrollbarCM7(f.vScrollbar !== false || f.overviewRuler !== false ? 14 : 0))
    overlays.push(view => core.scrollbarWheelOptions(view))
    if (f.indentGuide !== false) overlays.push(view => core.activeIndentGuideLayer(view))
    // guides.bracketPairs(默认 false):括号对参考线层,选项关着时什么都不画
    if (!plain) overlays.push(view => core.bracketPairGuideLayer(view, bracketPalette(colors)))
    overlays.push(view => core.rulersLayer(view)) // rulers 选项,默认 [] 什么都不画
    // TS 有语义同词高亮(tsHighlightSession)时不画文本同词:Monaco 有 documentHighlightProvider 就不用文本的
    overlays.push(view => core.highlightLayer(view, { activeLine: f.activeLine, bracketMatch: f.bracketMatch, selectionMatch: f.selectionMatch, wordHighlight: () => !(tsLangInput && f.tsDiagnostics !== false) && !hasHighlightProvider(view), tagHighlight: opts.lang === 'html' }))
    // 输入即自动弹补全(对齐 CM6/Monaco);挂载器范式同 overlays,消费端零改动。
    // 下拉本身是绝对定位 overlay(挂 view.dom,不进内容流),不再是内容 widget 装饰。
    if (f.autocomplete !== false) {
        overlays.push(view => core.suggestOverlay(view))
    }
    if (f.search !== false) overlays.push(view => core.searchPanel(view))
    // 悬停 tooltip 挂载器(mousemove 命中 + 遍历 hoverSources + 定位显隐);挂载器范式同上。
    if (f.hover !== false) overlays.push(view => core.hoverTooltip(view))
    // 修饰键 + 点击链接打开(editor.action.openLink / registerLinkOpener 见 core/feature/link.ts)
    overlays.push(view => core.linkDetector(view))
    // scrollOnMiddleClick(默认 false):中键自动滚动会话,选项关着时不拦中键
    overlays.push(view => core.middleScrollSession(view))
    // TS 语言动作 + 右键菜单 / 命令面板
    const tsActions = tsLangHere ? createTSActions({ ...tsOpts, inMemory: opts.inMemory ?? opts.fileName == null }) : null
    const tsLang = tsLangHere
    // M1.2 自动诊断:需 diagnosticsField(ruler/hover 已装时已有;否则补)
    if (tsLang && f.tsDiagnostics !== false) {
        if (f.overviewRuler === false && f.hover === false)
            extensions.push(core.diagnosticsField)
        if (f.overviewRuler === false)
            extensions.push(core.decorations.of(core.diagnosticSquiggles))
        overlays.push(view => tsDiagnosticsSession(view, { ...tsOpts, remote: opts.tsDiagnosticsRemote }))
        // 未使用淡显 / 废弃删除线 / hint 小点(Monaco 默认 noSuggestionDiagnostics:false)
        if (f.tsUnusedFade !== false) {
            extensions.push(tsTagField)
            extensions.push(core.decorations.of(tsTagDecorations))
        }
        if (f.foldGutter !== false)
            overlays.push(view => tsFoldSession(view, tsOpts))
        overlays.push(view => tsInlaySession(view, f.inlayHints === true ? { ...tsOpts, fallback: { includeInlayParameterNameHints: 'literals' } } : tsOpts))
        overlays.push(view => tsHighlightSession(view, tsOpts))
    }
    // languages.registerFoldingRangeProvider / registerInlayHintsProvider(非 TS 语言;TS 保留内置)
    if (!tsLang) {
        if (f.foldGutter !== false) overlays.push(view => providerFoldingSession(view, opts.lang ?? '', () => opts.fileName ?? 'inmemory://model/1'))
        overlays.push(view => providerInlaySession(view, opts.lang ?? '', () => opts.fileName ?? 'inmemory://model/1'))
        overlays.push(view => providerHighlightSession(view))
    }
    // M1.3 参数提示
    if (tsLang && f.signatureHelp !== false)
        overlays.push(view => signatureHelpSession(view, tsOpts))
    // M2.3 sticky scroll(TS:navigation tree outline;json/css/scss/less/html:语言服务的 document symbols,
    // 对齐 Monaco defaultModel 'outlineModel';否则折叠范围)
    if (f.stickyScroll !== false) {
        // registerDocumentSymbolProvider 注册的 provider 优先(Monaco outlineModel),其次内置的 TS / json / css / html outline,再退折叠范围
        const outline = firstStickyOutline(documentSymbolStickyOutline(), tsLang ? tsStickyOutline(tsOpts) : languageStickyOutline(opts.lang ?? ''))
        const brackets = f.bracketColors !== false ? bracketPalette(colors) : undefined
        overlays.push(view => stickyScrollOverlay(view, { outline: outline ?? undefined, brackets }))
    }
    // F8 / Alt+F8 等:标记导航浮窗(Monaco MarkerNavigationWidget),标题栏显示文件名
    extensions.push(markerNavigationExtension({ title: () => (opts.fileName ?? '').split('/').pop() ?? '' }))
    // F6:行号区拖选多行 / Shift+点扩选;Cmd(mac)/Ctrl+点跳定义(Monaco multiCursorModifier 默认 alt)
    if (f.lineNumbers !== false) overlays.push(view => core.gutterMouseSelection(view))
    if (tsActions) {
        // Ctrl/⌘+点击(multiCursorModifier=ctrlCmd 时 Alt+点击):definitionLinkOpensInPeek 选 Peek 还是跳;悬停时词下划线 + 手型 + 定义预览
        extensions.push(core.clickDefinitionHandler.of(clickDefinition(tsActions)))
        extensions.push(definitionLinkField, core.decorations.of(definitionLinkDecorations), core.hoverSources.of(definitionPreviewHoverSource))
        overlays.push(view => definitionHoverSession(view, tsActions))
    }
    // 非 TS 语言:languages.registerDefinitionProvider(F12 / Alt+F12 / Ctrl+点击 / 悬停预览;没注册 provider 时都不动作)
    const provActions = tsActions ? null : providerDefinitionActions(opts.lang ?? '', () => opts.fileName ?? 'inmemory://model/1')
    if (provActions) {
        extensions.push(core.clickDefinitionHandler.of(view => {
            if (!hasDefinitionProvider(opts.lang ?? '')) return false
            return clickDefinition(provActions)(view)
        }))
        extensions.push(definitionLinkField, core.decorations.of(definitionLinkDecorations), core.hoverSources.of(definitionPreviewHoverSource))
        overlays.push(view => definitionHoverSession(view, provActions))
    }
    if (!tsLangHere) extensions.push(inlayField, inlayPressedField, core.decorations.of(inlayDecorationsFromField))
    // M2.2 code actions lightbulb
    if (tsLang && f.codeActions !== false)
        overlays.push(view => codeActionsLightbulb(view, tsOpts))
    // M2.5 a11y
    if (f.a11y !== false)
        overlays.push(view => a11ySession(view))
    overlays.push(view => core.tabFocusModeSync(view)) // tabFocusMode 选项(默认 false 什么都不做)
    overlays.push(view => core.placeholderLayer(view)) // placeholder 选项(默认不画)
    // 键帽照 Monaco lookupKeybinding(/tmp/lc-hunt/r7/monaco-lookup.ts 三平台实测),和下面 langBindings 一致
    const isMacPlat = isMacKeys
    const L = (mac: string, win: string, linux: string = win) => os === 'mac' ? mac : os === 'win' ? win : linux
    const paletteExtra: core.PaletteCommand[] = tsActions ? [
        { id: 'gotoDef', label: 'Go to Definition', keybinding: 'F12', run: v => { void tsActions.goToDefinition(v) } },
        { id: 'gotoImpl', label: 'Go to Implementation', keybinding: L('⌘F12', 'Ctrl+F12'), run: v => { void tsActions.goToImplementation(v) } },
        { id: 'gotoType', label: 'Go to Type Definition', run: v => { void tsActions.goToTypeDefinition(v) } },
        { id: 'peekType', label: 'Peek Type Definition', run: v => { void tsActions.peekTypeDefinition(v) } },
        { id: 'peekImpl', label: 'Peek Implementation', keybinding: L('⇧⌘F12', 'Ctrl+Shift+F12'), run: v => { void tsActions.peekImplementation(v) } },
        { id: 'peekDef', label: 'Peek Definition', keybinding: L('⌥F12', 'Alt+F12', 'Ctrl+Shift+F10'), run: v => { void tsActions.peekDefinition(v) } },
        { id: 'gotoRef', label: 'Go to References', keybinding: isMacPlat ? '⇧F12' : 'Shift+F12', run: v => { void tsActions.goToReferences(v) } },
        { id: 'peekRef', label: 'Peek References', run: v => { void tsActions.peekReferences(v) } },
        { id: 'gotoSym', label: 'Go to Symbol...', keybinding: isMacPlat ? '⇧⌘O' : 'Ctrl+Shift+O', run: v => { void tsActions.goToSymbol(v) } },
        { id: 'gotoWs', label: 'Go to Symbol in Workspace...', run: v => { void tsActions.goToWorkspaceSymbol(v) } },
        { id: 'rename', label: 'Rename Symbol', keybinding: 'F2', run: v => { void tsActions.renameSymbol(v) } },
        { id: 'format', label: 'Format Document', keybinding: L('⇧⌥F', 'Shift+Alt+F', 'Ctrl+Shift+I'), run: v => { void tsActions.formatDocument(v) } },
        { id: 'formatSel', label: 'Format Selection', keybinding: L('⌘K ⌘F', 'Ctrl+K Ctrl+F'), run: v => { void tsActions.formatSelection(v) } },
        { id: 'organize', label: 'Organize Imports', keybinding: isMacPlat ? '⇧⌥O' : 'Shift+Alt+O', run: v => { void tsActions.organizeImports(v) } },
        { id: 'addImports', label: 'Add Missing Imports', run: v => { void tsActions.addMissingImports(v) } },
        { id: 'rmUnused', label: 'Remove Unused Imports', run: v => { void tsActions.removeUnusedImports(v) } },
        { id: 'addType', label: 'Add Type Annotation', run: v => { void tsActions.addTypeAnnotation(v) } },
        { id: 'addMembers', label: 'Add Missing Members', run: v => { void tsActions.addMissingMembers(v) } },
        { id: 'rmLocals', label: 'Remove Unused Locals', run: v => { void tsActions.removeUnusedLocals(v) } },
        ...(f.codeActions !== false
            ? [{
                id: 'quickFix',
                label: 'Quick Fix...',
                keybinding: isMacPlat ? '⌘.' : 'Ctrl+.',
                run: (v: core.EditorView) => { void runCodeActionsMenu(v, tsOpts) },
            }]
            : []),
    ] : []
    // 扩/缩选区(Monaco smartSelect)任何语言都有:按词和括号(TS 模式也只有这两家)
    // F7 / ⇧F7(Monaco WordHighlighter moveNext / moveBack):同词高亮按位置排好,从光标所在那处跳到下一处 / 上一处,首尾相接;
    // 光标落到起点,在视口外就滚到中间。没有同词高亮时不动(precondition hasWordHighlights)
    const moveHighlight = (v: core.EditorView, next: boolean): boolean => {
        const state = v.state
        const marks = tsWords || hasHighlightProvider(v) ? state.field(highlightField, false) ?? [] : f.selectionMatch !== false ? core.wordHighlightRanges(state) : []
        if (!marks.length) return false
        const hs = [...marks].sort((a, b) => a.from - b.from || a.to - b.to)
        const head = state.selection.main.head
        const i = hs.findIndex(h => h.from <= head && head <= h.to)
        const k = next ? (i + 1) % hs.length : (i - 1 + hs.length) % hs.length
        const dest = hs[k]
        // 已经在这一处的开头:没有下一处可去(全文就这一个词)。不消费按键,diff 里 F7 仍是未绑定键。
        if (dest.from === head) return false
        v.dispatch(state.update({ selection: core.EditorSelection.cursor(dest.from), userEvent: 'select' }))
        const sd = v.scrollDOM
        const h = sd.clientHeight
        if (h) {
            const lh = v.oracle.lineHeight
            const context = Math.min(h / lh / 2, v.revealSurroundingLines)
            const boxStart = v.lineBlockAt(dest.from).top - context * lh
            const boxEnd = v.lineBlockAt(dest.to).bottom + Math.max(0, context - 1) * lh
            const top = sd.scrollTop
            if (!(top <= boxStart && boxEnd <= top + h)) sd.scrollTop = boxEnd - boxStart > h ? boxStart : Math.max(0, (boxStart + boxEnd) / 2 - h / 2)
        }
        const line = v.state.doc.lineAt(dest.from)
        core.alert(v, `${line.text}, ${k + 1} of ${hs.length} for '${v.state.sliceDoc(dest.from, dest.to)}'`)
        return true
    }
    paletteExtra.push(
        { id: 'nextHighlight', label: 'Go to Next Symbol Highlight', keybinding: 'F7', run: v => moveHighlight(v, true) },
        { id: 'prevHighlight', label: 'Go to Previous Symbol Highlight', keybinding: isMacPlat ? '⇧F7' : 'Shift+F7', run: v => moveHighlight(v, false) },
    )
    paletteExtra.push(
        { id: 'expandSel', label: 'Expand Selection', keybinding: L('⌃⇧⌘→', 'Shift+Alt+RightArrow'), run: v => { smartSelect(v, true, tsLang) } },
        { id: 'shrinkSel', label: 'Shrink Selection', keybinding: L('⌃⇧⌘←', 'Shift+Alt+LeftArrow'), run: v => { smartSelect(v, false, tsLang) } },
    )
    // Refactor... / Source Action...(editor.action.refactor / sourceAction):TS 有重构和 source 操作才出现(只读时菜单自己藏)
    const codeActionProviders = tsActions && f.codeActions !== false
        ? {
            refactor: (v: core.EditorView) => runCodeActionsMenu(v, tsOpts, undefined, 'refactor'),
            source: async (v: core.EditorView) => {
                if (v.state.readOnly) return false
                const items = [
                    { label: 'Organize Imports', value: () => tsActions.organizeImports(v), group: 'Source Action' },
                    { label: 'Add Missing Imports', value: () => tsActions.addMissingImports(v), group: 'Source Action' },
                    { label: 'Remove Unused Imports', value: () => tsActions.removeUnusedImports(v), group: 'Source Action' },
                ]
                const picked = await showActionList(v, cursorMenuAnchor(v, v.state.selection.main.head), { items })
                if (!picked) return false
                return picked()
            },
        }
        : undefined
    // Go to / Peek Declaration:菜单项恒在,显隐由实例动作表(有没有 declaration provider)决定
    const declarationMenu = { go: (v: core.EditorView) => !!executeCommandById(v, 'editor.action.revealDeclaration'), peek: (v: core.EditorView) => !!executeCommandById(v, 'editor.action.peekDeclaration') }
    if (f.contextMenu !== false) {
        overlays.push(core.contextMenuCM7({
            providers: { ts: tsActions ?? undefined, paletteExtra, codeActions: codeActionProviders, declaration: declarationMenu },
            // palette 菜单项用带 TS 命令的完整列表
            items: () => {
                const items = withViewActionMenu(core.defaultContextMenuItems({ ts: tsActions ?? undefined, paletteExtra, codeActions: codeActionProviders, declaration: declarationMenu }))
                return items.map(it => it.id === 'palette'
                    ? {
                        ...it,
                        run: (v) => core.openCommandPalette(v, core.defaultPaletteCommands(paletteExtra)),
                    }
                    : it)
            },
        }))
    }

    // 语言/面板快捷键(对齐 Monaco)
    const langBindings: core.KeyBinding[] = []
    if (tsActions) {
        const wrap = (fn: (v: core.EditorView) => Promise<boolean> | boolean): core.StateCommand =>
            (target) => {
                void Promise.resolve(fn(target as core.EditorView))
                return true
            }
        langBindings.push(
            // Monaco:F12 revealDefinition;⌘F12 / Ctrl+F12 也挂在 revealDefinition 上,但 goToImplementation 后注册、
            // 同键优先(有实现 provider 时按 ⌘F12 走实现)。Peek Definition Linux 是 Ctrl+Shift+F10。
            { key: 'F12', run: wrap(v => tsActions.goToDefinition(v)) },
            { key: 'Mod-F12', run: wrap(v => tsActions.goToImplementation(v)) },
            { key: 'Mod-Shift-F12', run: wrap(v => tsActions.peekImplementation(v)) },
            { key: os === 'linux' ? 'Ctrl-Shift-F10' : 'Alt-F12', run: wrap(v => tsActions.peekDefinition(v)) },
            { key: 'Shift-F12', run: wrap(v => tsActions.goToReferences(v)) },
            { key: 'F2', run: wrap(v => tsActions.renameSymbol(v)) },
            // Format Document:Mac / Win ⇧⌥F,Linux Ctrl+Shift+I;Format Selection ⌘K ⌘F
            { key: os === 'linux' ? 'Ctrl-Shift-i' : 'Shift-Alt-f', run: wrap(v => tsActions.formatDocument(v)) },
            { key: 'Mod-k Mod-f', run: wrap(v => tsActions.formatSelection(v)) },
            { key: 'Shift-Alt-o', run: wrap(v => tsActions.organizeImports(v)) },
            // Refactor...(Mac ⌃⇧R,Win/Linux Ctrl+Shift+R);只读不响应
            ...(f.codeActions !== false ? [{ key: 'Ctrl-Shift-r', run: wrap(v => v.state.readOnly ? false : runCodeActionsMenu(v, tsOpts, undefined, 'refactor')) }] : []),
            { key: 'Mod-Shift-o', run: wrap(v => tsActions.goToSymbol(v)) },
        )
        if (f.signatureHelp !== false) {
            langBindings.push({
                key: 'Mod-Shift-Space',
                run: (target) => triggerSignatureHelp(target as core.EditorView),
            })
            paletteExtra.push({ id: 'triggerParamHints', label: 'Trigger Parameter Hints', keybinding: L('⇧⌘Space', 'Ctrl+Shift+Space'), run: v => { triggerSignatureHelp(v) } })
        }
        if (f.codeActions !== false) {
            langBindings.push({
                key: 'Mod-.',
                run: wrap(v => runCodeActionsMenu(v, tsOpts)),
            })
        }
    }
    // 扩/缩选区(Monaco smartSelect):Mac 主键 ⌃⇧⌘→/←、副键 ⌃⇧→/←(⇧⌥←→ 在 Mac 是按词扩选);Win/Linux ⇧⌥→/←
    const smart = (forward: boolean): core.StateCommand => target => smartSelect(target as core.EditorView, forward, tsLang)
    langBindings.push(...(isMacKeys ? [
        { key: 'Ctrl-Shift-ArrowRight', run: smart(true) },
        { key: 'Ctrl-Shift-ArrowLeft', run: smart(false) },
        { key: 'Ctrl-Shift-Cmd-ArrowRight', run: smart(true) },
        { key: 'Ctrl-Shift-Cmd-ArrowLeft', run: smart(false) },
    ] : [
        { key: 'Shift-Alt-ArrowRight', run: smart(true) },
        { key: 'Shift-Alt-ArrowLeft', run: smart(false) },
    ]))
    langBindings.push(
        { key: 'F7', run: target => moveHighlight(target as core.EditorView, true) },
        { key: 'Shift-F7', run: target => moveHighlight(target as core.EditorView, false) },
    )
    // Go to Symbol in Editor(⇧⌘O,前缀 @ / @:):TS 走语言服务(上面),json / css / scss / less / html 走 document symbols
    if (!tsActions && hasLanguageOutline(opts.lang ?? '')) {
        const lang = opts.lang ?? ''
        paletteExtra.push({ id: 'gotoSym', label: 'Go to Symbol...', keybinding: isMacPlat ? '⇧⌘O' : 'Ctrl+Shift+O', run: v => { void quickOutlineForLanguage(v, lang) } })
        langBindings.push({ key: 'Mod-Shift-o', run: target => { void quickOutlineForLanguage(target as core.EditorView, lang); return true } })
    }
    if (provActions) {
        const has = () => hasDefinitionProvider(opts.lang ?? '')
        const run = (fn: (v: core.EditorView) => Promise<boolean>): core.StateCommand => target => {
            if (!has()) return false
            void fn(target as core.EditorView)
            return true
        }
        langBindings.push(
            { key: 'F12', run: run(v => provActions.goToDefinition(v)) },
            { key: os === 'linux' ? 'Ctrl-Shift-F10' : 'Alt-F12', run: run(v => provActions.peekDefinition(v)) },
        )
        paletteExtra.push(
            { id: 'gotoDef', label: 'Go to Definition', keybinding: 'F12', run: v => { void provActions.goToDefinition(v) } },
            { id: 'peekDef', label: 'Peek Definition', keybinding: L('⌥F12', 'Alt+F12', 'Ctrl+Shift+F10'), run: v => { void provActions.peekDefinition(v) } },
            { id: 'showDefPreview', label: 'Show Definition Preview Hover', run: v => { void showDefinitionPreviewHover(v, provActions) } },
        )
    }
    if (tsActions) paletteExtra.push({ id: 'showDefPreview', label: 'Show Definition Preview Hover', run: v => { void showDefinitionPreviewHover(v, tsActions) } })
    langBindings.push({
        key: 'F1',
        run: (target) => core.openCommandPalette(target as core.EditorView, core.defaultPaletteCommands(paletteExtra)),
    })

    return {
        extensions,
        drawSelection: true,
        lineNumbers: f.lineNumbers !== false,
        lineWrapping: f.lineWrapping === true,
        scrollBeyondLastLine: f.scrollBeyondLastLine !== false,
        keymap: [...langBindings, ...keymap],
        themeVars: themeVars(colors),
        overlays,
        makeFoldGutter: f.foldGutter === false ? null : core.foldGutterSpec,
        paletteExtra,
        suggest: f.autocomplete === false ? null : { ts: tsLangHere ? tsOpts : null, render: { highlight: shikiCodeHighlighter(hl, opts.theme) } },
    }
}

/**
 * 实例上的 Monaco API 装配函数列表(顺序 = 登记顺序;EditorView 已有的同名成员优先,先登记的优先于后登记的)。
 * 各代号把自己的 `install<Group>(ctx)` 加在这里(见 src/api/context.ts)。
 */
const INSTALLERS: Installer[] = [installOptions, installContextKeys, installCommands, installActions, installDecorations, installWidgets, installTheme, installLanguageConfig, installEvents, installViewState, installHost]

/** 非 TS 编辑器的 minimap / 概览尺同词来源:documentHighlightProvider 写了 highlightField 才用它,否则退回文本同词 */
const providerWordMarks = (state: core.EditorState) => {
    const m = state.field(highlightField, false)
    return m && m.length ? m : null
}

/** monaco-editor 0.55.1 editor.api2.js 里对核心默认值的覆盖(wrappingIndent / autoIndent 与核心默认等价,不用列) */
const STANDALONE_DEFAULTS: core.IEditorOptions = { glyphMargin: false, overviewRulerLanes: 2 }

export function liteMonaco(opts: LiteMonacoOptions): LiteMonacoEditor {
    return mount(opts, true)
}

function mount(opts: LiteMonacoOptions, ts: boolean): LiteMonacoEditor {
    let lang = opts.lang ?? 'typescript'
    // 主题名可以是 shiki 名,也可以是 Monaco 的 'vs' / 'vs-dark' / defineTheme 过的名字(H3 的 themes.ts 解析;异步才装得上的先用底主题顶着)
    const initialTheme = resolveInitialTheme(opts.theme ?? 'dark-plus', opts.highlighter as unknown as ThemeCapableHighlighter)
    let theme = initialTheme.theme
    let colors = opts.colors
    // 选项分三层(低 → 高):features 映射 < 构造时的 options < 之后的 updateOptions(见 api/options.ts 的映射表)
    // 最低一层 = monaco.editor.create 的默认(editor.api2 在核心默认之上覆盖的几项:字形边距默认关、概览尺 2 条车道),
    // 用 liteMonaco() 建的编辑器和 Monaco standalone 一样;要字形边距就像在 Monaco 里一样传 glyphMargin: true
    const featureRaw = mergeHostOptions(STANDALONE_DEFAULTS, featuresToOptions(opts.features, opts.readOnly))
    let userRaw: core.IEditorOptions = mergeHostOptions({}, opts.options ?? {})
    const effectiveRaw = () => mergeHostOptions(featureRaw, userRaw)
    // 本编辑器在共享 TS 项目里的文件名:构造时定一次;重装配时再取会拿到"下一个空闲名"(旧的还占着)
    const tsFile = opts.fileName ?? (ts && tsActionsAvailable(lang) ? freeTsFileName(lang) : undefined)

    const featuresNow = () => featuresFromOptions(opts.features, core.resolveEditorOptions(effectiveRaw()))
    const build = (features: LiteMonacoFeatures, first: boolean) => assemble(opts.highlighter, {
        lang,
        theme,
        features,
        colors,
        // 诊断种子、宿主 TS 文件只在第一次装配时给(重装配再给会覆盖掉已有的诊断 / 宿主文件的新内容)
        diagnostics: first ? opts.diagnostics : undefined,
        tsFiles: first ? opts.tsFiles : undefined,
        tsDiagnosticsRemote: opts.tsDiagnosticsRemote,
        fileName: opts.fileName,
        tsFile,
        inMemory: opts.fileName == null,
        ts,
    })
    // 折行、末行留白是视图层的开关(applyViewOptions 按选项解析结果开关,含 wordWrapOverride1/2),装配里不用它们:
    // 不进签名,切换时不重装配(重装配会拆装全部 overlay,查找框重置、minimap / 滚动条在整条折好的超长行上各读一遍布局)
    const signature = (features: LiteMonacoFeatures) => JSON.stringify([lang, theme, { ...features, lineWrapping: undefined, scrollBeyondLastLine: undefined }])

    const features0 = featuresNow()
    let cfg = build(features0, true)
    let sig = signature(features0)
    const parentRoot = opts.parent.getRootNode()
    ensureBaseCSS(parentRoot.nodeType === 11 ? parentRoot as ShadowRoot : opts.parent.ownerDocument ?? document)
    // tabSize / indentSize / insertSpaces / detectIndentation:Monaco 的文本模型选项,按内容猜缩进(detectIndentation 默认 true)
    let modelExt: core.Extension = core.modelOptionsExtension(effectiveRaw() as never, opts.doc ?? '')
    const optionsExt = (): core.Extension => {
        const raw = effectiveRaw()
        return [
            core.editorOptions.of(raw),
            modelExt,
            ...(core.resolveEditorOptions(raw).readOnly ? [core.EditorState.readOnly.of(true)] : []),
        ]
    }
    // peek 预览(Monaco EmbeddedCodeEditorWidget):继承本编辑器的选项,不要 minimap、末行后不留白,只读看文本
    const peekExt: core.Extension[] = []
    if (ts && tsActionsAvailable(lang)) peekExt.push(peekPreview.of((parent, doc, ext) => mount({
        parent, doc, lang, theme, highlighter: opts.highlighter, colors, readOnly: true, extensions: ext,
        features: { ...opts.features, minimap: false, scrollBeyondLastLine: false },
        options: userRaw,
    }, false)))
    const extensionsFor = (c: Assembled): core.Extension[] => [
        ...c.extensions, decorationsExtension, ...markerExtensions(), optionsSlot.of(optionsExt()), ...(opts.extensions ?? []), ...peekExt,
    ]
    const overlaysFor = (c: Assembled) => opts.keymap?.length ? [...c.overlays, (v: core.EditorView) => overlayInputKeymap(v, opts.keymap!)] : c.overlays
    const keymapFor = (c: Assembled) => opts.keymap?.length ? [...opts.keymap, ...c.keymap] : c.keymap
    // 照 Monaco:默认 false,宿主要么自己调 layout(),要么传 automaticLayout: true
    const automaticLayout = () => userRaw.automaticLayout === true

    // 折叠栏规格对同一个 makeFoldGutter 是同一个对象:重装配时沿用,view.reconfigure 按引用比较就不用重建槽
    let foldGutterFor: unknown = null
    let foldGutterSpec: core.FoldGutterSpec | null = null
    const foldGutterOf = (c: Assembled): core.FoldGutterSpec | null => {
        if (!c.makeFoldGutter) return null
        if (foldGutterFor !== c.makeFoldGutter) { foldGutterFor = c.makeFoldGutter; foldGutterSpec = c.makeFoldGutter(tr => view.dispatch(tr)) }
        return foldGutterSpec
    }
    let suggestSync: (on: boolean) => void = () => { /* 装好之前没有可开关的 */ }
    let view: core.EditorView
    view = new core.EditorView({
        state: stateFor(opts, extensionsFor(cfg), optionsExt()),
        parent: opts.parent,
        // 宿主键在查找框 / rename / quick input 里也生效(Monaco addCommand 的 when 是 editorFocus)
        overlays: overlaysFor(cfg),
        keymap: keymapFor(cfg),
        drawSelection: cfg.drawSelection,
        lineNumbers: cfg.lineNumbers,
        lineWrapping: cfg.lineWrapping,
        scrollBeyondLastLine: cfg.scrollBeyondLastLine,
        foldGutter: foldGutterOf(cfg) ?? undefined,
        dispatch: opts.dispatch,
        automaticLayout: automaticLayout(),
    })
    setViewPaletteExtras(view, () => cfg.paletteExtra)
    // 颜色按实例:变量挂本实例 .cm-editor(同页多主题互不覆盖);tab-size 跟 state.tabSize 走
    applyThemeVars(view.dom, cfg.themeVars)
    setCopyLanguage(view, lang)
    let tabSize = view.state.tabSize
    view.dom.style.setProperty('--lm-tab-size', String(tabSize))
    view.onTransaction(() => {
        if (view.state.tabSize === tabSize) return
        tabSize = view.state.tabSize
        view.dom.style.setProperty('--lm-tab-size', String(tabSize))
    })
    // 选区进了折叠隐藏区(程序设选区、查找跳转、撤销)→ 展开那一块(Monaco revealCursor)
    view.onTransaction(tr => {
        if (!cfg.makeFoldGutter) return
        if (!tr.selection && !tr.docChanged) return
        const spec = core.revealSelectionFolds(view.state)
        if (!spec) return
        const at = view.state
        queueMicrotask(() => {
            if (view.state !== at) return
            const again = core.revealSelectionFolds(view.state)
            if (again) view.dispatch(view.state.update(again))
        })
    })
    if (opts.onChange) {
        const onChange = opts.onChange
        view.onTransaction(tr => {
            if (!tr.docChanged) return
            const changes: { from: number, to: number, text: string }[] = []
            tr.changes.iterChanges((from, to, _fromB, _toB, text) => changes.push({ from, to, text: text.toString() }))
            onChange(changes, view)
        })
    }
    if (opts.onSelectionChange) {
        const onSelectionChange = opts.onSelectionChange
        view.onTransaction(tr => {
            if (tr.docChanged || (tr.selection && !tr.selection.eq(tr.startState.selection))) onSelectionChange(view.state.selection, view)
        })
    }

    // ── 运行时:选项 / 语言 / 主题变了,state 和视图跟上(不丢 doc / 选区 / 历史 / 折叠) ──
    const host: EditorHost = {
        getUserOptions: () => userRaw,
        setUserOptions: (next, patch) => {
            userRaw = next
            if (patch && touchesIndentOptions(patch)) modelExt = core.modelOptionsExtension(effectiveRaw() as never, view.state.sliceDoc())
            refresh(false)
            if (patch && 'automaticLayout' in patch) view.setAutomaticLayout(automaticLayout())
        },
        getEffectiveOptions: effectiveRaw,
        getLanguageId: () => lang,
        getHighlighter: () => opts.highlighter as unknown as ThemeCapableHighlighter,
        setModelOptions: o => {
            modelExt = core.modelOptionsExtension({ ...o, detectIndentation: false } as never, '')
            refresh(false)
        },
        reassemble: (patch) => {
            if (patch?.lang !== undefined) lang = patch.lang
            if (patch?.theme !== undefined) theme = patch.theme
            if (patch && 'colors' in patch) colors = patch.colors
            refresh(true)
            lazyEnsure()
        },
    }
    // 默认(懒加载 shiki)高亮器:当前语言 / 主题还没装就异步装,装好重装配一次补上颜色;宿主自己的高亮器不经过
    const lazyEnsure = () => {
        if (!isLazyHighlighter(opts.highlighter)) return
        void ensureLazy(lang, theme).then(changed => {
            if (changed && !(view as unknown as { destroyed?: boolean }).destroyed) host.reassemble()
        })
    }
    const refresh = (force: boolean) => {
        const f = featuresNow()
        const s = signature(f)
        if (!force && s === sig) {
            // 装配没变:只换选项槽
            view.dispatch(view.state.update({ effects: optionsSlot.reconfigure(optionsExt()) }))
            return
        }
        sig = s
        cfg = build(f, false)
        suggestSync(cfg.suggest != null)
        view.dispatch(view.state.update({ effects: [liteMonacoSlot.reconfigure(extensionsFor(cfg)), optionsSlot.reconfigure(optionsExt())] }))
        applyThemeVars(view.dom, cfg.themeVars)
        setCopyLanguage(view, lang)
        // lineWrapping / scrollBeyondLastLine 不在这里给:它们归 applyViewOptions 管(见 signature)
        view.reconfigure({
            lineNumbers: cfg.lineNumbers,
            foldGutter: foldGutterOf(cfg),
            keymap: keymapFor(cfg),
            overlays: overlaysFor(cfg),
        })
    }
    const ctx = createContext(view, { getOptions: () => view.state.facet(core.editorOptions), host })
    for (const install of INSTALLERS) install(ctx)
    // 分词器注册表变了(setTokensProvider / 懒工厂解析完 / setColorMap):本语言受影响就重装配,渲染换成新分词器
    const unsubTokenization = getTokenizationRegistry().onDidChange(e => {
        if (!e.changedColorMap && !e.changedLanguages.includes(lang)) return
        if ((view as unknown as { destroyed?: boolean }).destroyed) return
        host.reassemble({})
    })
    view.onDestroy(() => unsubTokenization.dispose())
    lazyEnsure()
    if (initialTheme.ready) void initialTheme.ready.then(name => { if (!(view as unknown as { destroyed?: boolean }).destroyed) host.reassemble({ theme: name }) })
    const editor = applyApi<LiteMonacoEditor>(view, ctx.api)
    view.onDestroy(registerCodeEditor(editor))
    // 补全:无头的 SuggestModel / SuggestController(Monaco 移植)+ core 的下拉控件;配置跟着重装配走。
    // features.autocomplete 关着时一个字都不装(装上再停用也会订阅内容事件、把文档物化出 TextModel);之后重装配打开时再装。
    let suggestLive: SuggestLive | null = null
    const syncSuggest = (on: boolean) => {
        if (on && !suggestLive) suggestLive = installSuggest(view, () => cfg.suggest ?? { ts: null, render: {} })
        else if (!on && suggestLive) { suggestLive.dispose(); suggestLive = null }
    }
    suggestSync = syncSuggest
    syncSuggest(cfg.suggest != null)
    installLinkedEditing(editor)
    installInlineCompletions(editor)
    installProviderContributions(editor, { ts: ts && tsActionsAvailable(lang), semanticHighlighting: (opts.options as Record<string, unknown> | undefined)?.['semanticHighlighting.enabled'] })
    // TS 编辑器自带参数提示会话;其余语言走 registerSignatureHelpProvider 的 provider 协议
    if (!(ts && tsActionsAvailable(lang) && opts.features?.signatureHelp !== false)) installParameterHints(editor)
    return editor
}
