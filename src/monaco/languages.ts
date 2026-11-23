// monaco.languages 命名空间(对位 monaco.d.ts 的 `declare namespace languages`)。只做名字映射/再导出。
export { register, getLanguages, getEncodedLanguageId, setLanguageConfiguration, IndentAction } from '../api/languages'
export {
    registerCompletionItemProvider, registerDefinitionProvider, registerFoldingRangeProvider, registerInlayHintsProvider, registerSelectionRangeProvider,
    CompletionItemKind, CompletionItemTag, CompletionItemInsertTextRule, CompletionTriggerKind,
} from '../lang/providers'
export {
    registerLinkedEditingRangeProvider, registerDocumentSymbolProvider, registerSignatureHelpProvider, registerCodeActionProvider, registerInlineCompletionsProvider,
} from '../lang/languagefeatures'
export {
    registerHoverProvider, registerRenameProvider, registerNewSymbolNameProvider, registerReferenceProvider, registerDocumentHighlightProvider,
    registerImplementationProvider, registerTypeDefinitionProvider, registerDeclarationProvider, registerCodeLensProvider,
    registerDocumentFormattingEditProvider, registerDocumentRangeFormattingEditProvider, registerOnTypeFormattingEditProvider,
    registerLinkProvider, registerColorProvider, registerDocumentSemanticTokensProvider, registerDocumentRangeSemanticTokensProvider,
} from '../lang/providerfeatures'
export { CodeActionTriggerType } from '../lang/codeaction'
export { SignatureHelpTriggerKind } from '../lang/signaturehelp'
export { SymbolKind } from '../lang/quickoutline'
export { typescriptDefaults, javascriptDefaults } from '../lang/tsapi'
// monaco.languages.typescript:0.55 的官方声明里只剩 { deprecated: true },真东西挪到了顶层 monaco.typescript。
// 这里给同一个对象,老代码照用(不破坏已有用户)
export * as typescript from './typescript'
export { DocumentHighlightKind, HoverVerbosityAction, InlayHintKind, NewSymbolNameTag, NewSymbolNameTriggerKind, SymbolTag } from './enums'
export { InlineCompletionTriggerKind, PartialAcceptTriggerKind, InlineCompletionHintStyle, InlineCompletionEndOfLifeReasonKind } from '../lang/inline/types'
export {
    onLanguage, onLanguageEncountered, setColorMap, setTokensProvider, registerTokensProviderFactory, setMonarchTokensProvider,
} from '../api/standalonelanguages'
export { EditDeltaInfo, FoldingRangeKind } from '../api/editdelta'
export { SelectedSuggestionInfo } from '../lang/inline/types'
// 类型出口(由 scripts/gen-monaco-types.ts 生成)
export type * from './languages-types'
// monaco.languages.css / html / json:各语言服务的 defaults 与配置类型。语言服务本体(vscode-*-languageservice,可选 peer)首次用到该语言才动态加载
export * as css from '../lang/lsp/css/register'
export * as html from '../lang/lsp/html/register'
export * as json from '../lang/lsp/json/register'
