// Monaco 的 LanguageFeatureRegistry / LanguageSelector.score / LanguageFeaturesService(移植自 vscode editor/common)。
//
// 与 providers.ts 里只按语言 id 匹配的 Registry 不同,这里是 Monaco 的完整语义:
//   · selector = 'lang' | '*' | { language, scheme, pattern(glob,对 uri.fsPath), exclusive, isBuiltin } | 数组
//   · score:scheme/language 命中 = 10,'*' = 5,pattern 命中 = 10,任何一项不符 = 0;数组取最大
//   · ordered(model):按 score 降序、非内置优先、后注册优先;exclusive 的 selector 命中时独占
// 新的 provider 类特性(联动编辑 / 参数提示 / 补全取回)都挂在这套注册表上;
// 公开的 registerXxxProvider 注册到模块级的 languageFeatures 单例。
import type { IDisposable, CancellationToken } from './providers'
import { score, matchGlob, canonLanguage } from './languageselector'
import type { LanguageFilter } from './languageselector'
export { matchGlob }
export type { LanguageFilter }

export type LanguageFeatureSelector = string | LanguageFilter | ReadonlyArray<string | LanguageFilter>

/** 注册表要的 model 形态(ITextModel 的子集) */
export interface FeatureModel {
    readonly uri: { readonly scheme: string, readonly fsPath: string, toString(): string }
    getLanguageId(): string
}

/** Monaco languageSelector.score(完整语义在 languageselector.ts) */
export function scoreSelector(selector: LanguageFeatureSelector | undefined, model: FeatureModel): number {
    return score(selector, model.uri, model.getLanguageId(), true)
}

const isExclusive = (s: LanguageFeatureSelector): boolean =>
    typeof s === 'string' ? false : Array.isArray(s) ? s.every(isExclusive) : !!(s as LanguageFilter).exclusive
const isBuiltin = (s: LanguageFeatureSelector): boolean =>
    typeof s === 'string' ? false : Array.isArray(s) ? s.some(isBuiltin) : !!(s as LanguageFilter).isBuiltin

interface Entry<T> { readonly selector: LanguageFeatureSelector, readonly provider: T, score: number, readonly time: number }

export interface LanguageFeatureRegistryOptions<T = any> {
    /** 语言 id 规范化(两边都过一遍):lite-monaco 对 'ts' / 'typescriptreact' 这类别名宽松,Monaco 本身是精确匹配 */
    readonly canonLanguage?: (id: string) => string
    /** 父表:本表看得到父表的全部注册(按本表的 model 重新打分),再叠上自己的。编辑器级 provider 用(不污染全局) */
    readonly parent?: LanguageFeatureRegistry<T>
}

function mapSelectorLanguages(s: LanguageFeatureSelector, canon: (id: string) => string): LanguageFeatureSelector {
    if (typeof s === 'string') return s === '*' ? s : canon(s)
    if (Array.isArray(s)) return (s as ReadonlyArray<string | LanguageFilter>).map(x => mapSelectorLanguages(x, canon) as string | LanguageFilter)
    const f = s as LanguageFilter
    return f.language && f.language !== '*' ? { ...f, language: canon(f.language) } : f
}

export class LanguageFeatureRegistry<T> {
    constructor(private readonly options: LanguageFeatureRegistryOptions<T> = {}) {
        this.parentOff = options.parent?.onDidChange(() => this.fire())
    }
    private clock = 0
    private readonly entries: Entry<T>[] = []
    /** 打分 / 排序的对象:无父表时就是 entries;有父表时是「父表条目副本 + 自己的」 */
    private merged: Entry<T>[] = this.entries
    private readonly parentOff: IDisposable | undefined
    dispose(): void { this.parentOff?.dispose(); this.listeners.clear() }
    /** 本表(含父表)的全部条目副本,给子表合并用 */
    private snapshot(): Entry<T>[] {
        const base = this.options.parent ? this.options.parent.snapshot() : []
        return [...base, ...this.entries.map(e => ({ ...e, score: -1 }))]
    }
    private readonly listeners = new Set<(n: number) => void>()
    private lastKey: string | undefined

    onDidChange(listener: (n: number) => unknown): IDisposable {
        this.listeners.add(listener)
        return { dispose: () => { this.listeners.delete(listener) } }
    }
    private fire() { this.lastKey = undefined; for (const l of [...this.listeners]) l(this.entries.length) }

    register(selector: LanguageFeatureSelector, provider: T): IDisposable {
        const canon = this.options.canonLanguage
        let entry: Entry<T> | undefined = { selector: canon ? mapSelectorLanguages(selector, canon) : selector, provider, score: -1, time: this.clock++ }
        this.entries.push(entry)
        this.fire()
        return {
            dispose: () => {
                if (!entry) return
                const i = this.entries.indexOf(entry)
                if (i >= 0) { this.entries.splice(i, 1); this.fire(); entry = undefined }
            },
        }
    }

    has(model: FeatureModel): boolean { return this.all(model).length > 0 }
    all(model: FeatureModel): T[] {
        if (!model) return []
        this.update(model)
        return this.merged.filter(e => e.score > 0).map(e => e.provider)
    }
    allNoModel(): T[] { return this.merged.map(e => e.provider) }
    ordered(model: FeatureModel): T[] {
        this.update(model)
        return this.merged.filter(e => e.score > 0).map(e => e.provider)
    }
    orderedGroups(model: FeatureModel): T[][] {
        this.update(model)
        const out: T[][] = []
        let last: T[] | undefined
        let lastScore = 0
        for (const e of this.merged) {
            if (e.score <= 0) continue
            if (last && lastScore === e.score) last.push(e.provider)
            else { lastScore = e.score; last = [e.provider]; out.push(last) }
        }
        return out
    }

    private update(model: FeatureModel): void {
        const key = `${model.uri.toString()}\0${model.getLanguageId()}`
        if (this.lastKey === key) return
        this.lastKey = key
        const canon = this.options.canonLanguage
        const scored: FeatureModel = canon ? { uri: model.uri, getLanguageId: () => canon(model.getLanguageId()) } : model
        if (this.options.parent) this.merged = [...this.options.parent.snapshot(), ...this.entries]
        for (const e of this.merged) {
            e.score = scoreSelector(e.selector, scored)
            if (isExclusive(e.selector) && e.score > 0) {
                for (const o of this.merged) o.score = 0
                e.score = 1000
                break
            }
        }
        this.merged.sort((a, b) => {
            if (a.score !== b.score) return b.score - a.score
            const ba = isBuiltin(a.selector), bb = isBuiltin(b.selector)
            if (ba !== bb) return ba ? 1 : -1
            return b.time - a.time
        })
    }
}

// ───────────── Monaco languages.ts 里的 provider 形状(只要用到的) ─────────────
export type FeatureToken = CancellationToken

/** Monaco languages.LinkedEditingRanges */
export interface LinkedEditingRanges {
    ranges: { startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number }[]
    wordPattern?: RegExp
}
/** Monaco languages.LinkedEditingRangeProvider */
export interface LinkedEditingRangeProvider {
    provideLinkedEditingRanges(model: unknown, position: { lineNumber: number, column: number }, token: FeatureToken): LinkedEditingRanges | null | undefined | PromiseLike<LinkedEditingRanges | null | undefined>
}

/** Monaco languages.DocumentSymbol(sticky scroll 的 outline 来源;quick outline 同一份协议) */
export interface DocumentSymbol {
    name: string
    detail: string
    kind: number
    tags: readonly number[]
    containerName?: string
    range: { startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number }
    selectionRange: { startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number }
    children?: DocumentSymbol[]
}
/** Monaco languages.DocumentSymbolProvider */
export interface DocumentSymbolProvider {
    displayName?: string
    provideDocumentSymbols(model: unknown, token: FeatureToken): DocumentSymbol[] | null | undefined | PromiseLike<DocumentSymbol[] | null | undefined>
}

/** Monaco ILanguageFeaturesService 里 lite-monaco 实现了的那部分 */
export class LanguageFeaturesService {
    readonly documentSymbolProvider = new LanguageFeatureRegistry<DocumentSymbolProvider>()
    readonly linkedEditingRangeProvider = new LanguageFeatureRegistry<LinkedEditingRangeProvider>()
    readonly completionProvider = new LanguageFeatureRegistry<any>({ canonLanguage })
    readonly signatureHelpProvider = new LanguageFeatureRegistry<import('./signaturehelp').SignatureHelpProvider>()
    readonly inlineCompletionsProvider = new LanguageFeatureRegistry<any>()
    readonly codeActionProvider = new LanguageFeatureRegistry<import('./codeaction').CodeActionProvider>()
    readonly documentSemanticTokensProvider = new LanguageFeatureRegistry<import('./semantictokens').DocumentSemanticTokensProvider>()
    readonly documentRangeSemanticTokensProvider = new LanguageFeatureRegistry<import('./semantictokens').DocumentRangeSemanticTokensProvider>()
    // 下面这批的 provider 协议 = monaco.d.ts 同名接口(类型取自 monaco/languages-types);editor 行为在 lang/provider*.ts
    readonly hoverProvider = new LanguageFeatureRegistry<import('../monaco/languages-types').HoverProvider>()
    readonly renameProvider = new LanguageFeatureRegistry<import('../monaco/languages-types').RenameProvider>()
    readonly newSymbolNamesProvider = new LanguageFeatureRegistry<import('../monaco/languages-types').NewSymbolNamesProvider>()
    readonly referenceProvider = new LanguageFeatureRegistry<import('../monaco/languages-types').ReferenceProvider>()
    readonly documentHighlightProvider = new LanguageFeatureRegistry<import('../monaco/languages-types').DocumentHighlightProvider>()
    readonly implementationProvider = new LanguageFeatureRegistry<import('../monaco/languages-types').ImplementationProvider>()
    readonly typeDefinitionProvider = new LanguageFeatureRegistry<import('../monaco/languages-types').TypeDefinitionProvider>()
    readonly declarationProvider = new LanguageFeatureRegistry<import('../monaco/languages-types').DeclarationProvider>()
    readonly codeLensProvider = new LanguageFeatureRegistry<import('../monaco/languages-types').CodeLensProvider>()
    readonly documentFormattingEditProvider = new LanguageFeatureRegistry<import('../monaco/languages-types').DocumentFormattingEditProvider>()
    readonly documentRangeFormattingEditProvider = new LanguageFeatureRegistry<import('../monaco/languages-types').DocumentRangeFormattingEditProvider>()
    readonly onTypeFormattingEditProvider = new LanguageFeatureRegistry<import('../monaco/languages-types').OnTypeFormattingEditProvider>()
    readonly linkProvider = new LanguageFeatureRegistry<import('../monaco/languages-types').LinkProvider>()
    readonly colorProvider = new LanguageFeatureRegistry<import('../monaco/languages-types').DocumentColorProvider>()
}

/** 全局单例:languages.registerXxxProvider 都注册到这里;编辑器贡献缺省从这里取 */
export const languageFeatures = new LanguageFeaturesService()

/** Monaco languages.registerLinkedEditingRangeProvider */
export const registerLinkedEditingRangeProvider = (selector: LanguageFeatureSelector, provider: LinkedEditingRangeProvider): IDisposable =>
    languageFeatures.linkedEditingRangeProvider.register(selector, provider)

/** Monaco languages.registerDocumentSymbolProvider:sticky scroll 的大纲(outlineModel)按它取作用域,没有结果退回折叠范围 / 缩进 */
export const registerDocumentSymbolProvider = (selector: LanguageFeatureSelector, provider: DocumentSymbolProvider): IDisposable =>
    languageFeatures.documentSymbolProvider.register(selector, provider)

/** Monaco languages.registerSignatureHelpProvider:参数提示(非 TS 语言走这条;打字命中 signatureHelpTriggerCharacters 自动弹) */
export const registerSignatureHelpProvider = (selector: LanguageFeatureSelector, provider: import('./signaturehelp').SignatureHelpProvider): IDisposable =>
    languageFeatures.signatureHelpProvider.register(selector, provider)

/** Monaco languages.registerInlineCompletionsProvider:行内补全(ghost text)。注册后命中该 selector 的编辑器惰性装上控制器 */
export const registerInlineCompletionsProvider = (selector: LanguageFeatureSelector, provider: import('./inline/types').InlineCompletionsProvider): IDisposable =>
    languageFeatures.inlineCompletionsProvider.register(selector, provider)

/** Monaco languages.registerCodeActionProvider(selector, provider, metadata?):provider 的 providedCodeActionKinds / documentation 合并 metadata 的同名字段 */
export const registerCodeActionProvider = (
    selector: LanguageFeatureSelector,
    provider: import('./codeaction').CodeActionProvider,
    metadata?: { readonly providedCodeActionKinds?: readonly string[], readonly documentation?: ReadonlyArray<{ readonly kind: string, readonly command: { id: string, title: string, arguments?: unknown[] } }> },
): IDisposable => languageFeatures.codeActionProvider.register(selector, {
    providedCodeActionKinds: metadata?.providedCodeActionKinds ?? provider.providedCodeActionKinds,
    documentation: metadata?.documentation ?? provider.documentation,
    displayName: provider.displayName,
    extensionId: provider.extensionId,
    provideCodeActions: (m, r, c, t) => provider.provideCodeActions(m, r, c, t),
    resolveCodeAction: provider.resolveCodeAction?.bind(provider),
    _getAdditionalMenuItems: provider._getAdditionalMenuItems?.bind(provider),
})
