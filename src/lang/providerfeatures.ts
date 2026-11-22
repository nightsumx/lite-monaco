// languages.register{Hover,Rename,NewSymbolName,Reference,DocumentHighlight,Implementation,TypeDefinition,Declaration,CodeLens,
// DocumentFormattingEdit,DocumentRangeFormattingEdit,OnTypeFormattingEdit,Link,Color,DocumentSemanticTokens,DocumentRangeSemanticTokens}Provider。
//
// 注册 = 进 languageFeatures 的同名注册表(Monaco standaloneLanguages.ts 一一对应);provider / 结果类型沿用 monaco.d.ts 同名接口
// (src/monaco/languages-types.ts)。编辑器怎么用这些 provider 在 lang/provider*.ts(悬停 / 导航 / 重命名 / 高亮 / 格式化 / 链接 / 颜色 / CodeLens / 语义着色),
// 都从同一份注册表取,没有第二份状态。
import type { IDisposable } from './providers'
import type { LanguageFeatureSelector } from './languagefeatures'
import { languageFeatures } from './languagefeatures'
import type * as T from '../monaco/languages-types'
import { Position, Range } from '../api/position'
import type { ITextModel } from '../api/model'
import type { DocumentSemanticTokensProvider, DocumentRangeSemanticTokensProvider } from './semantictokens'

type Selector = LanguageFeatureSelector

/** Monaco registerHoverProvider:包一层补 range(缺 range → 光标处的词范围;没有词 → 光标处的空范围),provider 自己给的 range 原样保留 */
export function registerHoverProvider(selector: Selector, provider: T.HoverProvider): IDisposable {
    return languageFeatures.hoverProvider.register(selector, {
        provideHover: async (model, position, token, context) => {
            const word = model.getWordAtPosition(position)
            const value = await Promise.resolve(provider.provideHover(model, position, token, context))
            if (!value) return undefined
            if (!value.range && word) value.range = new Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn)
            if (!value.range) value.range = new Range(position.lineNumber, position.column, position.lineNumber, position.column)
            return value
        },
    })
}

export const registerRenameProvider = (selector: Selector, provider: T.RenameProvider): IDisposable => languageFeatures.renameProvider.register(selector, provider)
export const registerNewSymbolNameProvider = (selector: Selector, provider: T.NewSymbolNamesProvider): IDisposable => languageFeatures.newSymbolNamesProvider.register(selector, provider)
export const registerReferenceProvider = (selector: Selector, provider: T.ReferenceProvider): IDisposable => languageFeatures.referenceProvider.register(selector, provider)
export const registerDocumentHighlightProvider = (selector: Selector, provider: T.DocumentHighlightProvider): IDisposable => languageFeatures.documentHighlightProvider.register(selector, provider)
export const registerImplementationProvider = (selector: Selector, provider: T.ImplementationProvider): IDisposable => languageFeatures.implementationProvider.register(selector, provider)
export const registerTypeDefinitionProvider = (selector: Selector, provider: T.TypeDefinitionProvider): IDisposable => languageFeatures.typeDefinitionProvider.register(selector, provider)
export const registerDeclarationProvider = (selector: Selector, provider: T.DeclarationProvider): IDisposable => languageFeatures.declarationProvider.register(selector, provider)
export const registerCodeLensProvider = (selector: Selector, provider: T.CodeLensProvider): IDisposable => languageFeatures.codeLensProvider.register(selector, provider)
export const registerDocumentFormattingEditProvider = (selector: Selector, provider: T.DocumentFormattingEditProvider): IDisposable => languageFeatures.documentFormattingEditProvider.register(selector, provider)
export const registerDocumentRangeFormattingEditProvider = (selector: Selector, provider: T.DocumentRangeFormattingEditProvider): IDisposable => languageFeatures.documentRangeFormattingEditProvider.register(selector, provider)
export const registerOnTypeFormattingEditProvider = (selector: Selector, provider: T.OnTypeFormattingEditProvider): IDisposable => languageFeatures.onTypeFormattingEditProvider.register(selector, provider)
export const registerLinkProvider = (selector: Selector, provider: T.LinkProvider): IDisposable => languageFeatures.linkProvider.register(selector, provider)
export const registerColorProvider = (selector: Selector, provider: T.DocumentColorProvider): IDisposable => languageFeatures.colorProvider.register(selector, provider)
export const registerDocumentSemanticTokensProvider = (selector: Selector, provider: DocumentSemanticTokensProvider): IDisposable => languageFeatures.documentSemanticTokensProvider.register(selector, provider)
export const registerDocumentRangeSemanticTokensProvider = (selector: Selector, provider: DocumentRangeSemanticTokensProvider): IDisposable => languageFeatures.documentRangeSemanticTokensProvider.register(selector, provider)

export type { ITextModel, Position }
