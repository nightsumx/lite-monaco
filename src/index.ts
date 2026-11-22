// lite-monaco 公开 API。
// 稳定面: lite-monaco / DiffEditor / core.* 主路径。
// 引擎 = 自研 CM7(core/,零 @codemirror);高亮 = shiki(peer);TS = typescript(optional peer)。

/** @stable 产品主入口 */
export { liteMonaco, liteMonacoThemeCSS } from './litemonaco'
export type { LiteMonacoOptions, LiteMonacoFeatures, ShikiLike, ShikiHighlightOptions } from './litemonaco'
export { bracketPalette, rulerPalette } from './product/theme'
export { createTSActions, tsActionsAvailable, pickList } from './lang/tsactions'
export { jsxCloseInsert, jsxCloseTagInput, jsxLinkedEditInput, linkRangeChanges } from './lang/tsjsx'
export { applyDocComment, docCommentInput } from './lang/tsdoc'
export { smartSelect } from './lang/tssmart'
export { formatOnTypeInput, formatOnPasteInput } from './lang/tsformaton'
export { hintsToMarks, inlayDecorations, inlayDecorationsFromField, inlayField, tsInlaySession } from './lang/tsinlay'
export { highlightsToMarks, highlightDecorations, highlightField, tsHighlightSession } from './lang/tshighlight'
export type { TSActions, TSActionsOptions } from './lang/tsactions'
export type { ThemeColors, RulerPalette } from './product/theme'
// TS IntelliSense 高级:虚拟工作区 / lib 加载钩子
export {
    getTSService, clearTSServiceCache, restartTSService,
    setTsFiles, updateTsFile, setTsResolutions, setTsCompilerOptions, getTsCompilerOptions, listTsFiles,
} from './lang/tsservice'
export type { TSServiceOptions, TSServiceSession, TsProjectTarget, TsOpenEditor } from './lang/tsservice'
// TS 语言服务跑在哪:Worker(推荐)或同线程回环
export { setTsWorker } from './lang/tsbackend'
export type { TsWorkerSource } from './lang/tsbackend'
export { isTsCanceled, flattenMessage, DiagCategory } from './lang/tsprotocol'
export type { TsAsyncService, TsTransport, TsRequest, TsResponse, SlimDiagnostic } from './lang/tsprotocol'
export { setTsLibLoader, clearTsLibCache } from './lang/tslibs'
export { expandSnippet } from './core/feature/snippet'
export {
    signatureHelpSession, triggerSignatureHelp, renderSignatureHelp, signatureHelpFromItems,
} from './lang/tssignature'
export type { TSSignatureOptions, SignatureHelpModel } from './lang/tssignature'
export {
    tsDiagnosticsSession, mergeDiagnostics, tsDiagnosticToLit, computeTsDiagnostics,
} from './lang/tsdiagnostics'
export type { TsDiagnosticsRequest, TsDiagnosticsResult, TsTagMark } from './lang/tsdiagnostics'
export { tsFoldSession, outliningToFolds } from './lang/tsfold'
export {
    registerCompletionItemProvider, registerDefinitionProvider, registerFoldingRangeProvider, registerInlayHintsProvider, registerSelectionRangeProvider,
    languagesProviders, providerModel,
    CompletionItemKind, CompletionItemTag, CompletionItemInsertTextRule, CompletionTriggerKind,
} from './lang/providers'
export type {
    ProviderModel, CompletionItemProvider, CompletionItemM, CompletionListM, CompletionContextM, DefinitionProvider, DefinitionResult,
    FoldingRangeProvider, FoldingRangeM, InlayHintsProvider, InlayHintM, InlayHintListM, LanguageSelector, CancellationToken,
    SelectionRangeProvider, SelectionRangeM,
} from './lang/providers'
// 通用 provider 注册表(Monaco LanguageFeatureRegistry:selector 支持 {language, scheme, pattern, exclusive})+ 联动编辑
export {
    LanguageFeatureRegistry, LanguageFeaturesService, languageFeatures, scoreSelector, registerLinkedEditingRangeProvider, registerDocumentSymbolProvider, registerSignatureHelpProvider, registerCodeActionProvider, registerInlineCompletionsProvider,
} from './lang/languagefeatures'
export type { LanguageFilter, LanguageFeatureSelector, LinkedEditingRanges, LinkedEditingRangeProvider, DocumentSymbol, DocumentSymbolProvider } from './lang/languagefeatures'
export { InlineCompletionsController } from './lang/inline/controller'
export { InlineCompletionsModel } from './lang/inline/model'
export type { InlineCompletionsProvider } from './lang/inline/types'
export { StickyLineCandidateProvider, StickyLineCandidate, StickyScrollController, StickyScrollWidgetState, documentSymbolSticky, documentSymbolStickyOutline, firstStickyOutline } from './lang/stickymodel'
export { LinkedEditingContribution, getLinkedEditingRanges } from './api/linkedediting'
// Monaco CodeAction 协议:getCodeActions(provider 调度/过滤/排序)、HierarchicalKind、CodeActionModel(自动触发时机)、keybinding 解析
export {
    HierarchicalKind, CodeActionKind, CodeActionTriggerType, CodeActionTriggerSource, CodeActionAutoApply, CodeActionItem as ProviderCodeActionItem, CodeActionCommandArgs,
    CodeActionKeybindingResolver, getCodeActions, filtersAction, mayIncludeActionsOfKind,
} from './lang/codeaction'
export type { CodeAction, CodeActionProvider, CodeActionList, CodeActionContext, CodeActionFilter, CodeActionTrigger, CodeActionSet } from './lang/codeaction'
export { CodeActionModel, CodeActionsState } from './lang/codeactionmodel'
export { ParameterHintsModel, provideSignatureHelp, SignatureHelpTriggerKind } from './lang/signaturehelp'
export type { SignatureHelp, SignatureInformation, ParameterInformation, SignatureHelpResult, SignatureHelpContext, SignatureHelpProvider } from './lang/signaturehelp'
export { CancellationTokenSource, Delayer, TimeoutTimer } from './lang/async'
// 补全会话内核(Monaco suggest 的移植,独立于内置 autocomplete 的 UI 路径):取回 / 过滤排序 / 会话状态机 / 控制器 / 记忆 / 词距 / 行内桥
export { CompletionItem, CompletionItemModel, CompletionOptions, provideSuggestionItems, getSuggestionComparator, setSnippetSuggestSupport, getSnippetSuggestSupport } from './lang/suggest'
export { CompletionModel, LineContext as CompletionLineContext } from './lang/completionmodel'
export { SuggestModel, LineContext as SuggestLineContext } from './lang/suggestmodel'
export type { SuggestModelServices, ISuggestEvent, ITriggerEvent, ICancelEvent, SuggestTriggerOptions } from './lang/suggestmodel'
export { SuggestController } from './lang/suggestcontroller'
export type { SuggestControllerServices, ISelectedSuggestion } from './lang/suggestcontroller'
export { Memory, NoMemory, LRUMemory, PrefixMemory, SuggestMemoryService } from './lang/suggestmemory'
export type { ISuggestMemoryService } from './lang/suggestmemory'
export { WordDistance } from './lang/worddistance'
export type { WordRangeService } from './lang/worddistance'
export { computeWordRanges } from './lang/wordranges'
export { SuggestInlineCompletions } from './lang/suggestinline'
export { provideSelectionRanges, WordSelectionRangeProvider, BracketSelectionRangeProvider } from './lang/selectionranges'
export type { SelectionRangesOptions } from './lang/selectionranges'
// monaco.languages.typescript.typescriptDefaults / javascriptDefaults(诊断 / 内联提示 / 额外库 / 编译选项 / 事件)
export { navigateMarker, showMarkerAt, closeMarkersNavigation, markersNavigationVisible, markerNavigationExtension, listMarkers } from './lang/markernav'
export { openQuickOutline, quickOutlineForLanguage, languageOutlineSymbols, hasLanguageOutline, SymbolKind } from './lang/quickoutline'
export type { OutlineSymbol } from './lang/quickoutline'
export { showDefinitionPreviewHover, clickDefinition, definitionHoverSession } from './lang/defhover'
export { runTsCommand, TS_ACTION_COMMANDS } from './lang/tsactions'
export { typescriptDefaults, javascriptDefaults, defaultsFor as languageServiceDefaultsFor, typescript as languagesTypescript } from './lang/tsapi'
export type { LanguageServiceDefaults, DiagnosticsOptions, InlayHintsOptions, IExtraLibs, IExtraLib, IDisposable, IEvent } from './lang/tsapi'
export { tsStickyOutline, navTreeToSticky } from './lang/tssticky'
export type { TSDiagnosticsOptions } from './lang/tsdiagnostics'
export {
    diagnosticsPolicy, linePreviewAt, getTSBudgetSnapshot, resetTSBudgetSnapshot, BUDGET,
} from './lang/tsbudget'
export type { DiagnosticsPolicy, DiagMode, TSBudgetSnapshot } from './lang/tsbudget'
export {
    budgetFor, budgetForState, classifyDoc, materializeDoc,
} from './core/perf'
export type { EditorBudget, DocClass } from './core/perf'
export { showPeek, closePeek, toPeekLocations } from './lang/tspeek'
export type { PeekLocation, PeekOptions } from './lang/tspeek'
export {
    collectCodeActionsAt, runCodeActionsMenu, codeActionsLightbulb, codeActionsFromFixes,
} from './lang/tscodeactions'
export type { TSCodeActionsOptions, CodeActionItem } from './lang/tscodeactions'
export { stickyScrollOverlay, computeStickyLines, leadingIndent } from './core/feature/stickyscroll'
export type { StickyLine } from './core/feature/stickyscroll'
export { lineDiff, splitLinesDiff, sideBySideRows, charDiff, computeLineRangeMappings } from './core/diff/linediff'
export type { DiffOp, CharPart, LineRangeMapping } from './core/diff/linediff'
/** @stable 并排 Diff */
export { DiffEditor, createDiffEditor, diffEditorDefaultOptions, DIFF_EDITOR_ACTION_IDS } from './diffeditor'
export type { DiffEditorOptions, DiffEditorConstructionOptions, ILineChange, ICharChange, IDocumentDiff } from './diffeditor'
export { a11ySession, applyEditorA11y, announce, alert, status } from './core/feature/a11y'
export type { A11yOptions } from './core/feature/a11y'
// Monaco 编辑器选项层:类型 / EditorOption 枚举 / 解析 / 合并 / 变更事件(完整面在 core.*)
export { EditorOption, resolveEditorOptions, mergeRawOptions, configurationChange, ConfigurationChangedEvent } from './core/options'
export type {
    IEditorOptions, IDiffEditorOptions, ComputedEditorOptions, IComputedEditorOptions,
    IEditorFindOptions, IEditorMinimapOptions, IEditorScrollbarOptions, IEditorHoverOptions, IEditorStickyScrollOptions,
    IGotoLocationOptions, IEditorInlayHintsOptions, ISuggestOptions, IQuickSuggestionsOptions, IUnicodeHighlightOptions, IRulerOption,
} from './core/options'

// ── Monaco 同名公共符号(`monaco.editor.*` / `monaco.languages.*` / 值类型)。实例方法在 `liteMonaco()` 返回的对象上 ──
/** @stable editor.create 的薄封装:`createEditor(container, IStandaloneEditorConstructionOptions)` */
export { createEditor, setDefaultHighlighter } from './api/create'
export type { IStandaloneEditorConstructionOptions, IGlobalEditorOptions } from './api/create'
// 值类型与 URI
export { Position, Range, Selection, SelectionDirection } from './api/position'
export type { IPosition, IRange, ISelection } from './api/position'
export { Uri } from './api/uri'
// 键位
export { KeyCode, KeyMod, keyCodeFromEvent, modifiersFromEvent } from './api/keycodes'
// 视图枚举(editor.ScrollType / MouseTargetType / CursorChangeReason)
export { ScrollType, MouseTargetType, CursorChangeReason, EditorZoom } from './core/view/viewapi'
export { registerLinkOpener, getLinkOpenerService } from './core/feature/link'
export { OpenerService, extractSelection } from './core/feature/openerservice'
export type { IOpener, IValidator, IExternalOpener, IExternalUriResolver, IResolvedExternalUri, OpenOptions as OpenerOptions } from './core/feature/openerservice'
export { ModelService } from './api/modelservice'
// model:createModel / getModel(s) / EndOfLine 枚举 / setModelLanguage / onDidChangeModelLanguage
export { createModel, getModel, getModels, onDidChangeModelLanguage, onDidCreateModel, onWillDisposeModel, EndOfLinePreference, EndOfLineSequence, DefaultEndOfLine, TextModelResolvedOptions, FindMatch } from './api/model'
export type { ITextModel, TextModel, IIdentifiedSingleEditOperation, IValidEditOperation, ITextModelUpdateOptions, IModelLanguageChangedEvent, IWordAtPosition } from './api/model'
export { setModelLanguage } from './api/languages'
// 标记 / 主题 / 语言注册
export { MarkerSeverity, MarkerTag, setModelMarkers, removeAllMarkers, getModelMarkers, onDidChangeMarkers } from './api/markers'
export { defineTheme, setTheme, getTheme, onDidColorThemeChange } from './api/themes'
export { register as registerLanguage, getLanguages, getEncodedLanguageId, setLanguageConfiguration, getLanguageConfiguration, onDidChangeLanguages, onDidChangeLanguageConfiguration, IndentAction } from './api/languages'
export { LanguageService, LanguagesRegistry, getLanguageService, getMimeTypes, getLanguageIds, registerConfiguredLanguageAssociation } from './api/languagesregistry'
export type { ILanguageSelection, ILanguageAssociation } from './api/languagesregistry'
export type { LanguageConfiguration, OnEnterRule, IAutoClosingPairConditional, CharacterPair, CommentRule, IndentationRule, FoldingRules } from './api/languages'
export type { IMarker, IMarkerData, IRelatedInformation } from './api/markers'
export type { IStandaloneThemeData, ITokenThemeRule, IColors, BuiltinTheme } from './api/themes'
// 在别的文件 / model 里打开跳转目标
export { registerEditorOpener } from './api/openers'
export type { ICodeEditorOpener } from './api/openers'
// 动作 / 命令 / 键位规则 / 装饰 / 挂件 / context key
export { addEditorAction } from './api/actions'
export { addKeybindingRule, addKeybindingRules, registerCommandResolver } from './api/commands'
export { TrackedRangeStickiness, OverviewRulerLane, MinimapPosition, MinimapSectionHeaderStyle, GlyphMarginLane } from './api/decorations'
export { ModelDecorationOptions } from './api/decorations'
export type { IModelDecorationsChangeAccessor } from './api/model'
// 折叠模型(Monaco FoldingModel / HiddenRangeModel 等价物)
export { FoldingModel, FoldingRegions, FoldingRegion, HiddenRangeModel, FoldSource, toSelectedLines, foldingRegionsOf, toggleCollapseState, setCollapseStateLevelsDown, setCollapseStateLevelsUp, setCollapseStateUp, setCollapseStateAtLevel, setCollapseStateForRest, setCollapseStateForMatchingLines, setCollapseStateForType, getParentFoldLine, getPreviousFoldLine, getNextFoldLine } from './api/foldingmodel'
export type { FoldRange, IDecorationProvider as IFoldingDecorationProvider, CollapseMemento, SelectedLines, FoldingModelChangeEvent } from './api/foldingmodel'
export { ContentWidgetPositionPreference, OverlayWidgetPositionPreference, PositionAffinity } from './api/widgets'
export { ContextKeyExpr } from './api/contextkeys'
// 事件载荷 / 视图状态
export type {
    IEditorMouseEvent, IPartialEditorMouseEvent, IMouseEvent, IKeyboardEvent, IPasteEvent, IModelChangedEvent,
    IModelContentChange, IModelContentChangedEvent, IModelOptionsChangedEvent, IConfigurationChangedEvent,
    ICodeEditorViewState, ICursorState, IViewState,
} from './api/types'
export type { IScrollEvent, IContentSizeChangedEvent, ICursorPositionChangedEvent, ICursorSelectionChangedEvent } from './core/view/viewapi'
export type { LiteMonacoEditor, IStandaloneCodeEditorApi } from './api/types'
export { Emitter, EventHub } from './api/context'
export type { EditorContext, Installer } from './api/context'

// Monaco 顶层类型(monaco.Thenable / monaco.IMarkdownString 等;lite 已有等价的类型在上面)
export type { Thenable, UriComponents, IMarkdownString, MarkdownStringTrustedOptions, Environment, ITrustedTypePolicy, ITrustedTypePolicyOptions, IWebWorkerOptions } from './monaco/top-types'

/** @stable 内核命名空间。用法见 README。诊断类型: core.Diagnostic */
export * as core from './core/index'

// ── Monaco 同名命名空间:`import * as monaco from 'lite-monaco'` 后 `monaco.editor.create(...)` / `monaco.languages.register(...)` ──
export * as editor from './monaco/editor'
export * as languages from './monaco/languages'
// monaco.Token(顶层的经典分词 token 类,languages.TokenizationResult.tokens 的元素)
export { Token } from './api/tokenization'
