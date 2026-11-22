// 补全取回 + 项模型(移植自 VS Code editor/contrib/suggest/browser/suggest.ts)。
//
// 数据:provider 注册表(languageFeatures.completionProvider,selector 支持 {language, scheme, pattern, exclusive})→
// provideSuggestionItems 按「同分一组」问 provider,哪一组先给出结果就停;每个结果包成 CompletionItem(带规范化后的编辑区间、
// 小写缓存、打分槽位),按 sortText → label → kind 排;snippet 按 SnippetSortOrder 上 / 下 / 内联。
// 过滤打分在 completionmodel.ts,记忆在 suggestmemory.ts,词距在 worddistance.ts。
import type { IPosition as IPos } from '../api/position'
import { Position, Range } from '../api/position'
import { SnippetParser } from '../core/feature/snippetparser'
import { FUZZY_DEFAULT, type FuzzyScore } from '../core/feature/fuzzy'
import { CompletionItemKind, CompletionItemTag, CompletionItemInsertTextRule, CompletionTriggerKind } from './providers'
import type { CompletionItemM, CompletionListM, CompletionContextM, CompletionItemProvider as BaseProvider } from './providers'
import { languageFeatures, type FeatureModel, type LanguageFeatureRegistry } from './languagefeatures'
import { CancellationNone, CancellationError, isCancellationError, type CancellationToken } from './async'

/** Monaco languages.CompletionItemProvider 里调试用的名字也算 provider 的一部分 */
export type SuggestProvider = Omit<BaseProvider, 'provideCompletionItems'> & {
    _debugDisplayName?: string
    provideCompletionItems(model: any, position: any, context: CompletionContextM, token: CancellationToken): CompletionListM | null | undefined | Promise<CompletionListM | null | undefined>
}
export type SuggestCompletionItem = CompletionItemM & { extensionId?: unknown }
export type SuggestCompletionList = CompletionListM & { duration?: number }

/** provideSuggestionItems 要的 model 形态(ITextModel 的子集) */
export interface SuggestTextModel extends FeatureModel {
    getWordAtPosition(position: IPos): { word: string, startColumn: number, endColumn: number } | null
    getWordUntilPosition(position: IPos): { word: string, startColumn: number, endColumn: number }
}

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now())

export class CompletionItem {
    _brand!: 'ISuggestionItem'

    readonly editStart: IPos
    readonly editInsertEnd: IPos
    readonly editReplaceEnd: IPos

    readonly textLabel: string

    // 性能:小写缓存
    readonly labelLow: string
    readonly sortTextLow?: string
    readonly filterTextLow?: string

    // 校验
    readonly isInvalid: boolean = false

    // 排序 / 过滤
    score: FuzzyScore = FUZZY_DEFAULT
    distance = 0
    idx?: number
    word?: string

    readonly extensionId?: unknown

    private _resolveDuration?: number
    private _resolveCache?: Promise<void>

    constructor(
        readonly position: IPos,
        readonly completion: SuggestCompletionItem,
        readonly container: SuggestCompletionList,
        readonly provider: SuggestProvider,
    ) {
        this.textLabel = typeof completion.label === 'string' ? completion.label : completion.label?.label
        this.labelLow = this.textLabel.toLowerCase()
        this.isInvalid = !this.textLabel
        this.sortTextLow = completion.sortText && completion.sortText.toLowerCase()
        this.filterTextLow = completion.filterText && completion.filterText.toLowerCase()
        this.extensionId = completion.extensionId

        // 区间规范化:单个 range,或 {insert, replace}
        const range = completion.range as CompletionItemM['range']
        if (Range.isIRange(range)) {
            this.editStart = new Position(range.startLineNumber, range.startColumn)
            this.editInsertEnd = new Position(range.endLineNumber, range.endColumn)
            this.editReplaceEnd = new Position(range.endLineNumber, range.endColumn)
            this.isInvalid = this.isInvalid || Range.spansMultipleLines(range) || range.startLineNumber !== position.lineNumber
        } else {
            const { insert, replace } = range as { insert: Range, replace: Range }
            this.editStart = new Position(insert.startLineNumber, insert.startColumn)
            this.editInsertEnd = new Position(insert.endLineNumber, insert.endColumn)
            this.editReplaceEnd = new Position(replace.endLineNumber, replace.endColumn)
            this.isInvalid = this.isInvalid
                || Range.spansMultipleLines(insert) || Range.spansMultipleLines(replace)
                || insert.startLineNumber !== position.lineNumber || replace.startLineNumber !== position.lineNumber
                || insert.startColumn !== replace.startColumn
        }

        // 没有 resolve 就当已经解析完
        if (typeof provider.resolveCompletionItem !== 'function') {
            this._resolveCache = Promise.resolve()
            this._resolveDuration = 0
        }
    }

    get isResolved(): boolean { return this._resolveDuration !== undefined }
    get resolveDuration(): number { return this._resolveDuration !== undefined ? this._resolveDuration : -1 }

    async resolve(token: CancellationToken): Promise<void> {
        if (!this._resolveCache) {
            const sub = token.onCancellationRequested(() => {
                this._resolveCache = undefined
                this._resolveDuration = undefined
            })
            const t0 = now()
            this._resolveCache = Promise.resolve(this.provider.resolveCompletionItem!(this.completion, token)).then(value => {
                Object.assign(this.completion, value)
                this._resolveDuration = now() - t0
            }, err => {
                // 取消:清缓存,下次重新解析
                if (isCancellationError(err)) {
                    this._resolveCache = undefined
                    this._resolveDuration = undefined
                }
            }).finally(() => { sub.dispose() })
        }
        return this._resolveCache
    }
}

export const enum SnippetSortOrder { Top, Inline, Bottom }

export class CompletionOptions {
    static readonly default = new CompletionOptions()

    constructor(
        readonly snippetSortOrder = SnippetSortOrder.Bottom,
        readonly kindFilter = new Set<number>(),
        readonly providerFilter = new Set<SuggestProvider>(),
        readonly providerItemsToReuse: ReadonlyMap<SuggestProvider, CompletionItem[]> = new Map<SuggestProvider, CompletionItem[]>(),
        readonly showDeprecated = true,
    ) { }
}

let snippetSuggestSupport: SuggestProvider | undefined
export function getSnippetSuggestSupport(): SuggestProvider | undefined { return snippetSuggestSupport }
export function setSnippetSuggestSupport(support: SuggestProvider | undefined): SuggestProvider | undefined {
    const old = snippetSuggestSupport
    snippetSuggestSupport = support
    return old
}

export interface CompletionDurationEntry { readonly providerName: string, readonly elapsedProvider: number, readonly elapsedOverall: number }
export interface CompletionDurations { readonly entries: readonly CompletionDurationEntry[], readonly elapsed: number }

export class CompletionItemModel {
    constructor(
        readonly items: CompletionItem[],
        readonly needsClipboard: boolean,
        readonly durations: CompletionDurations,
        readonly disposable: { dispose(): void },
    ) { }
}

const isDisposable = (o: unknown): o is { dispose(): void } => !!o && typeof (o as { dispose?: unknown }).dispose === 'function'

export async function provideSuggestionItems(
    registry: LanguageFeatureRegistry<SuggestProvider>,
    model: SuggestTextModel,
    position: Position,
    options: CompletionOptions = CompletionOptions.default,
    context: CompletionContextM = { triggerKind: CompletionTriggerKind.Invoke },
    token: CancellationToken = CancellationNone,
): Promise<CompletionItemModel> {
    const t0 = now()
    position = new Position(position.lineNumber, position.column)

    const word = model.getWordAtPosition(position)
    const defaultReplaceRange = word ? new Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn) : Range.fromPositions(position)
    const defaultRange = { replace: defaultReplaceRange, insert: new Range(defaultReplaceRange.startLineNumber, defaultReplaceRange.startColumn, position.lineNumber, position.column) }

    const result: CompletionItem[] = []
    const disposables: Array<{ dispose(): void }> = []
    const durations: CompletionDurationEntry[] = []
    let needsClipboard = false

    const onCompletionList = (provider: SuggestProvider, container: SuggestCompletionList | null | undefined, started: number): boolean => {
        let didAddResult = false
        if (!container) return didAddResult
        for (const suggestion of container.suggestions as SuggestCompletionItem[]) {
            if (!options.kindFilter.has(suggestion.kind)) {
                // 不显示已弃用项
                if (!options.showDeprecated && suggestion?.tags?.includes(CompletionItemTag.Deprecated)) continue
                // 缺 range:补默认(光标所在词)
                if (!suggestion.range) suggestion.range = defaultRange
                // 缺 sortText:用 label
                if (!suggestion.sortText) suggestion.sortText = typeof suggestion.label === 'string' ? suggestion.label : suggestion.label.label
                if (!needsClipboard && suggestion.insertTextRules && suggestion.insertTextRules & CompletionItemInsertTextRule.InsertAsSnippet) {
                    needsClipboard = SnippetParser.guessNeedsClipboard(suggestion.insertText)
                }
                result.push(new CompletionItem(position, suggestion, container, provider))
                didAddResult = true
            }
        }
        if (isDisposable(container)) disposables.push(container)
        durations.push({ providerName: provider._debugDisplayName ?? 'unknown_provider', elapsedProvider: container.duration ?? -1, elapsedOverall: now() - started })
        return didAddResult
    }

    // snippet 源与「真」provider 并行问;没配置 / 被 kindFilter 滤掉 / providerFilter 不含它就不问
    const snippetCompletions = (async () => {
        const support = snippetSuggestSupport
        if (!support || options.kindFilter.has(CompletionItemKind.Snippet)) return
        // 上一轮的项可以复用
        const reuseItems = options.providerItemsToReuse.get(support)
        if (reuseItems) { reuseItems.forEach(item => result.push(item)); return }
        if (options.providerFilter.size > 0 && !options.providerFilter.has(support)) return
        const started = now()
        const list = await support.provideCompletionItems(model, position, context, token)
        onCompletionList(support, list, started)
    })()

    // 同分的 provider 一组;一组里只要有结果,后面分低的组就不问了
    for (const providerGroup of registry.orderedGroups(model)) {
        let didAddResult = false
        await Promise.all(providerGroup.map(async provider => {
            if (options.providerItemsToReuse.has(provider)) {
                const items = options.providerItemsToReuse.get(provider)!
                items.forEach(item => result.push(item))
                didAddResult = didAddResult || items.length > 0
                return
            }
            if (options.providerFilter.size > 0 && !options.providerFilter.has(provider)) return
            try {
                const started = now()
                const list = await provider.provideCompletionItems(model, position, context, token)
                didAddResult = onCompletionList(provider, list, started) || didAddResult
            } catch (err) {
                // provider 抛错 = 没有结果
                console.error(err)
            }
        }))
        if (didAddResult || token.isCancellationRequested) break
    }

    await snippetCompletions

    if (token.isCancellationRequested) {
        for (const d of disposables) d.dispose()
        return Promise.reject(new CancellationError())
    }

    return new CompletionItemModel(
        result.sort(getSuggestionComparator(options.snippetSortOrder)),
        needsClipboard,
        { entries: durations, elapsed: now() - t0 },
        { dispose: () => { for (const d of disposables.splice(0)) d.dispose() } },
    )
}

function defaultComparator(a: CompletionItem, b: CompletionItem): number {
    // sortText
    if (a.sortTextLow && b.sortTextLow) {
        if (a.sortTextLow < b.sortTextLow) return -1
        if (a.sortTextLow > b.sortTextLow) return 1
    }
    // label
    if (a.textLabel < b.textLabel) return -1
    if (a.textLabel > b.textLabel) return 1
    // kind
    return a.completion.kind - b.completion.kind
}

function snippetUpComparator(a: CompletionItem, b: CompletionItem): number {
    if (a.completion.kind !== b.completion.kind) {
        if (a.completion.kind === CompletionItemKind.Snippet) return -1
        if (b.completion.kind === CompletionItemKind.Snippet) return 1
    }
    return defaultComparator(a, b)
}

function snippetDownComparator(a: CompletionItem, b: CompletionItem): number {
    if (a.completion.kind !== b.completion.kind) {
        if (a.completion.kind === CompletionItemKind.Snippet) return 1
        if (b.completion.kind === CompletionItemKind.Snippet) return -1
    }
    return defaultComparator(a, b)
}

const snippetComparators: Record<number, (a: CompletionItem, b: CompletionItem) => number> = {
    [SnippetSortOrder.Top]: snippetUpComparator,
    [SnippetSortOrder.Bottom]: snippetDownComparator,
    [SnippetSortOrder.Inline]: defaultComparator,
}

export function getSuggestionComparator(snippetConfig: SnippetSortOrder): (a: CompletionItem, b: CompletionItem) => number {
    return snippetComparators[snippetConfig]
}

/** 全局补全注册表 */
export const completionRegistry = (): LanguageFeatureRegistry<SuggestProvider> => languageFeatures.completionProvider as LanguageFeatureRegistry<SuggestProvider>
