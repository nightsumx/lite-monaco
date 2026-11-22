// 补全会话状态机(移植自 VS Code editor/contrib/suggest/browser/suggestModel.ts)。
//
// 数据:一个 triggerState(Idle / Manual / Auto)+ 触发时的 LineContext + 当前的 CompletionModel。
// 流程:打字落在词尾 → quickSuggestions 去抖后 trigger;trigger 问 provider(provideSuggestionItems)+ 词距(WordDistance),
// 拿到后建 CompletionModel,onNewContext 按当前行内容再过滤并发 onDidSuggest;之后每次内容 / 光标变化都 refilter:
// 换行 / 缩进变 / 光标左移越过起点 → 取消或重触发;进了新词 → 复用旧结果重触发;不完整结果再往右打 → 只重问不完整的 provider。
// 触发字符(supportsByTriggerCharacter)只重问声明了它的 provider,其余 provider 的旧结果原样复用。
//
// 不画任何 UI:只发 onDidTrigger / onDidSuggest / onDidCancel,控件(或测试)订阅。编辑器只用公开 API(onDidType、
// onDidChangeCursorSelection 的 reason/source、getOption…),所以任何 liteMonaco() 实例都能挂一个。
import type { IDisposable, LiteMonacoEditor } from '../api/types'
import { Emitter } from '../api/context'
import { Position, Selection } from '../api/position'
import type { IPosition } from '../api/position'
import { getContextKeyService } from '../api/contextkeys'
import { CursorChangeReason } from '../core/view/viewapi'
import { normalizeQuickSuggestions, quickSuggestionFor, tokenTypeBefore } from '../core/feature/tokentype'
import { FUZZY_OPTIONS_DEFAULT } from '../core/feature/fuzzy'
import { CompletionItemKind, CompletionTriggerKind } from './providers'
import type { CompletionContextM } from './providers'
import { languageFeatures, type LanguageFeaturesService } from './languagefeatures'
import { CancellationTokenSource, TimeoutTimer, isCancellationError } from './async'
import { CompletionModel } from './completionmodel'
import { CompletionOptions, getSnippetSuggestSupport, provideSuggestionItems, SnippetSortOrder } from './suggest'
import type { CompletionItem, SuggestProvider, SuggestTextModel } from './suggest'
import { WordDistance, type WordRangeService } from './worddistance'

export interface ICancelEvent { readonly retrigger: boolean }
export interface ITriggerEvent { readonly auto: boolean, readonly shy: boolean, readonly position: IPosition }
export interface ISuggestEvent { readonly completionModel: CompletionModel, readonly isFrozen: boolean, readonly triggerOptions: SuggestTriggerOptions }

export interface SuggestTriggerOptions {
    readonly auto: boolean
    readonly shy?: boolean
    readonly refilter?: boolean
    readonly retrigger?: boolean
    readonly triggerKind?: CompletionTriggerKind
    readonly triggerCharacter?: string
    readonly clipboardText?: string
    completionOptions?: Partial<CompletionOptions>
}

const isHighSurrogate = (c: number) => c >= 0xD800 && c <= 0xDBFF
const isLowSurrogate = (c: number) => c >= 0xDC00 && c <= 0xDFFF
const leadingWhitespace = (s: string): string => /^[ \t]*/.exec(s)![0]

/** SuggestModel 要的编辑器形态:任何 LiteMonacoEditor,模型要有取词 */
type Editor = LiteMonacoEditor

export class LineContext {

    static shouldAutoTrigger(editor: Editor): boolean {
        if (!editor.hasModel()) return false
        const model = editor.getModel()!
        const pos = editor.getPosition()!
        const word = model.getWordAtPosition(pos)
        if (!word) return false
        if (word.endColumn !== pos.column && word.startColumn + 1 !== pos.column /* 在词前打了单个字符 */) return false
        if (!isNaN(Number(word.word))) return false
        return true
    }

    readonly lineNumber: number
    readonly column: number
    readonly leadingLineContent: string
    readonly leadingWord: { word: string, startColumn: number, endColumn: number }
    readonly triggerOptions: SuggestTriggerOptions

    constructor(model: SuggestTextModel & { getLineContent(n: number): string }, position: IPosition, triggerOptions: SuggestTriggerOptions) {
        this.leadingLineContent = model.getLineContent(position.lineNumber).substr(0, position.column - 1)
        this.leadingWord = model.getWordUntilPosition(position)
        this.lineNumber = position.lineNumber
        this.column = position.column
        this.triggerOptions = triggerOptions
    }
}

export const enum State { Idle = 0, Manual = 1, Auto = 2 }

/** SuggestModel 可注入的外部服务(全部可缺省:没有就走 lite-monaco 自带的) */
export interface SuggestModelServices {
    /** 词距的取词服务;没有 = 不算词距 */
    wordRanges?: WordRangeService
    clipboard?: { readText(): Promise<string> }
    log?: { warn(message: string, ...args: unknown[]): void }
    languageFeatures?: Pick<LanguageFeaturesService, 'completionProvider'>
    /** 宿主不是 built / 是扩展开发时,无效补全项会被记一条 warn */
    env?: { isBuilt?: boolean, isExtensionDevelopment?: boolean }
}

export class SuggestModel implements IDisposable {

    private readonly _toDispose: IDisposable[] = []
    private _triggerCharacterListener: IDisposable[] = []
    private readonly _triggerQuickSuggest = new TimeoutTimer()

    private _triggerState: SuggestTriggerOptions | undefined = undefined
    private _requestToken?: CancellationTokenSource
    private _context?: LineContext
    private _currentSelection: Selection

    private _completionModel: CompletionModel | undefined
    private _completionDisposables: IDisposable[] = []
    private readonly _onDidCancel = new Emitter<ICancelEvent>()
    private readonly _onDidTrigger = new Emitter<ITriggerEvent>()
    private readonly _onDidSuggest = new Emitter<ISuggestEvent>()

    readonly onDidCancel = this._onDidCancel.event
    readonly onDidTrigger = this._onDidTrigger.event
    readonly onDidSuggest = this._onDidSuggest.event

    private readonly _services: Required<Pick<SuggestModelServices, 'languageFeatures'>> & SuggestModelServices

    constructor(private readonly _editor: Editor, services: SuggestModelServices = {}) {
        this._services = { ...services, languageFeatures: services.languageFeatures ?? languageFeatures }
        const sel = this._editor.getSelection()
        this._currentSelection = sel ? new Selection(sel.selectionStartLineNumber, sel.selectionStartColumn, sel.positionLineNumber, sel.positionColumn) : new Selection(1, 1, 1, 1)

        this._toDispose.push(this._editor.onDidChangeModel(() => { this._updateTriggerCharacters(); this.cancel() }))
        this._toDispose.push(this._editor.onDidChangeModelLanguage(() => { this._updateTriggerCharacters(); this.cancel() }))
        this._toDispose.push(this._editor.onDidChangeConfiguration(() => { this._updateTriggerCharacters() }))
        this._toDispose.push(this._services.languageFeatures.completionProvider.onDidChange(() => {
            this._updateTriggerCharacters()
            this._updateActiveSuggestSession()
        }))

        let editorIsComposing = false
        this._toDispose.push(this._editor.onDidCompositionStart(() => { editorIsComposing = true }))
        this._toDispose.push(this._editor.onDidCompositionEnd(() => { editorIsComposing = false; this._onCompositionEnd() }))
        this._toDispose.push(this._editor.onDidChangeCursorSelection(e => {
            // 组字期间不触发
            if (!editorIsComposing) this._onCursorChange(e)
        }))
        this._toDispose.push(this._editor.onDidChangeModelContent(() => {
            // 组字期间不过滤(¨ + u = ü:单独的 ¨ 不能拿来过滤)
            if (!editorIsComposing && this._triggerState !== undefined) this._refilterCompletionItems()
        }))

        this._updateTriggerCharacters()
    }

    dispose(): void {
        for (const d of this._triggerCharacterListener.splice(0)) d.dispose()
        this._onDidCancel.dispose(); this._onDidSuggest.dispose(); this._onDidTrigger.dispose(); this._triggerQuickSuggest.dispose()
        for (const d of this._toDispose.splice(0)) d.dispose()
        this.clear()
        this.cancel()
    }

    private _updateTriggerCharacters(): void {
        for (const d of this._triggerCharacterListener.splice(0)) d.dispose()

        if (this._editor.getOption('readOnly') || !this._editor.hasModel() || !this._editor.getOption('suggestOnTriggerCharacters')) return

        const supportsByTriggerCharacter = new Map<string, Set<SuggestProvider>>()
        for (const support of this._services.languageFeatures.completionProvider.all(this._editor.getModel()! as never) as SuggestProvider[]) {
            for (const ch of support.triggerCharacters || []) {
                let set = supportsByTriggerCharacter.get(ch)
                if (!set) {
                    set = new Set()
                    const suggestSupport = getSnippetSuggestSupport()
                    if (suggestSupport) set.add(suggestSupport)
                    supportsByTriggerCharacter.set(ch, set)
                }
                set.add(support)
            }
        }

        const checkTriggerCharacter = (text?: string) => {
            if (!this._canShowSuggestOnTriggerCharacters()) return
            // 词尾打字归 quick suggest 管,触发字符不抢
            if (LineContext.shouldAutoTrigger(this._editor)) return

            if (!text) {
                // 来自 compositionEnd
                const position = this._editor.getPosition()!
                const model = this._editor.getModel()!
                text = model.getLineContent(position.lineNumber).substr(0, position.column - 1)
            }

            let lastChar = ''
            if (isLowSurrogate(text.charCodeAt(text.length - 1))) {
                if (isHighSurrogate(text.charCodeAt(text.length - 2))) lastChar = text.substr(text.length - 2)
            } else {
                lastChar = text.charAt(text.length - 1)
            }

            const supports = supportsByTriggerCharacter.get(lastChar)
            if (supports) {
                // 没被这次触发的 provider 的旧结果原样留着
                const providerItemsToReuse = new Map<SuggestProvider, CompletionItem[]>()
                if (this._completionModel) {
                    for (const [provider, items] of this._completionModel.getItemsByProvider()) {
                        if (!supports.has(provider)) providerItemsToReuse.set(provider, items)
                    }
                }
                this.trigger({
                    auto: true,
                    triggerKind: CompletionTriggerKind.TriggerCharacter,
                    triggerCharacter: lastChar,
                    retrigger: Boolean(this._completionModel),
                    clipboardText: this._completionModel?.clipboardText,
                    completionOptions: { providerFilter: supports, providerItemsToReuse },
                })
            }
        }

        this._triggerCharacterListener.push(this._editor.onDidType(t => checkTriggerCharacter(t)))
        this._triggerCharacterListener.push(this._editor.onDidCompositionEnd(() => checkTriggerCharacter()))
    }

    // --- trigger / retrigger / cancel

    get state(): State {
        if (!this._triggerState) return State.Idle
        return this._triggerState.auto ? State.Auto : State.Manual
    }

    cancel(retrigger: boolean = false): void {
        if (this._triggerState !== undefined) {
            this._triggerQuickSuggest.cancel()
            this._requestToken?.cancel()
            this._requestToken = undefined
            this._triggerState = undefined
            this._completionModel = undefined
            this._context = undefined
            this._onDidCancel.fire({ retrigger })
        }
    }

    clear(): void {
        for (const d of this._completionDisposables.splice(0)) d.dispose()
    }

    private _updateActiveSuggestSession(): void {
        if (this._triggerState !== undefined) {
            if (!this._editor.hasModel() || !this._services.languageFeatures.completionProvider.has(this._editor.getModel()! as never)) this.cancel()
            else this.trigger({ auto: this._triggerState.auto, retrigger: true })
        }
    }

    private _onCursorChange(e: { selection: { selectionStartLineNumber: number, selectionStartColumn: number, positionLineNumber: number, positionColumn: number }, reason: CursorChangeReason, source: string }): void {
        if (!this._editor.hasModel()) return

        const prevSelection = this._currentSelection
        const cur = this._editor.getSelection()!
        this._currentSelection = new Selection(cur.selectionStartLineNumber, cur.selectionStartColumn, cur.positionLineNumber, cur.positionColumn)

        const s = e.selection
        const selectionEmpty = s.selectionStartLineNumber === s.positionLineNumber && s.selectionStartColumn === s.positionColumn
        if (!selectionEmpty
            || (e.reason !== CursorChangeReason.NotSet && e.reason !== CursorChangeReason.Explicit)
            || (e.source !== 'keyboard' && e.source !== 'deleteLeft')) {
            // 没什么可做的:取消
            this.cancel()
            return
        }

        if (this._triggerState === undefined && e.reason === CursorChangeReason.NotSet) {
            if (prevSelection.containsRange(this._currentSelection) || prevSelection.getEndPosition().isBeforeOrEqual(this._currentSelection.getPosition())) {
                // 因打字光标右移 → quick suggest
                this._doTriggerQuickSuggest()
            }
        } else if (this._triggerState !== undefined && e.reason === CursorChangeReason.Explicit) {
            // 已开着,用方向键等挪光标:在新位置再过滤
            this._refilterCompletionItems()
        }
    }

    private _onCompositionEnd(): void {
        if (this._triggerState === undefined) this._doTriggerQuickSuggest()
        else this._refilterCompletionItems()
    }

    private _contextKey<T>(key: string): T | undefined {
        return getContextKeyService(this._editor).getContextKeyValue<T>(key)
    }

    private _canShowQuickSuggest(): boolean {
        if (!this._contextKey<boolean>('inlineSuggestionVisible')) return true // 没有行内建议
        const suppress = this._contextKey<boolean | undefined>('inlineSuggestionSuppressSuggestions')
        if (suppress !== undefined) return !suppress
        return !(this._editor.getOption('inlineSuggest') as { suppressSuggestions?: boolean }).suppressSuggestions
    }

    private _canShowSuggestOnTriggerCharacters(): boolean { return this._canShowQuickSuggest() }

    private _doTriggerQuickSuggest(): void {
        const config = normalizeQuickSuggestions(this._editor.getOption('quickSuggestions'))
        const allOff = (c: typeof config) => c.other === 'off' && c.comments === 'off' && c.strings === 'off'
        const allOn = (c: typeof config) => c.other === 'on' && c.comments === 'on' && c.strings === 'on'
        if (allOff(config)) return

        if (this._editor.getOption('suggest').snippetsPreventQuickSuggestions && this._contextKey<boolean>('inSnippetMode')) return // 片段里不弹

        this.cancel()

        this._triggerQuickSuggest.cancelAndSet(() => {
            if (this._triggerState !== undefined) return
            if (!LineContext.shouldAutoTrigger(this._editor)) return
            if (!this._editor.hasModel() || !this._editor.hasWidgetFocus()) return
            const model = this._editor.getModel()!
            const pos = this._editor.getPosition()!
            // 此刻再校验一次
            const cfg = normalizeQuickSuggestions(this._editor.getOption('quickSuggestions'))
            if (allOff(cfg)) return

            if (!allOn(cfg)) {
                // 看触发它的那个 token 的类型
                const view = this._editor as unknown as { state?: { doc: unknown } }
                const offset = model.getOffsetAt(pos)
                const type = view.state ? tokenTypeBefore(this._editor, view.state as never, offset) : 0
                if (quickSuggestionFor(cfg, type) !== 'on') return
            }

            if (!this._canShowQuickSuggest()) return // 行内建议显示着,不弹
            if (!this._services.languageFeatures.completionProvider.has(model as never)) return

            this.trigger({ auto: true })
        }, this._editor.getOption('quickSuggestionsDelay'))
    }

    private _refilterCompletionItems(): void {
        if (!this._editor.hasModel() || this._triggerState === undefined) throw new Error('Assertion Failed')
        const ctx = new LineContext(this._editor.getModel()! as never, this._editor.getPosition()!, { ...this._triggerState, refilter: true })
        this._onNewContext(ctx)
    }

    trigger(options: SuggestTriggerOptions): void {
        if (!this._editor.hasModel()) return

        const model = this._editor.getModel()!
        const ctx = new LineContext(model as never, this._editor.getPosition()!, options)

        // 取消上一次请求、改状态、通知 UI
        this.cancel(options.retrigger)
        this._triggerState = options
        this._onDidTrigger.fire({ auto: options.auto, shy: options.shy ?? false, position: this._editor.getPosition()! })

        // 记下发请求时的上下文
        this._context = ctx

        let suggestCtx: CompletionContextM = { triggerKind: options.triggerKind ?? CompletionTriggerKind.Invoke }
        if (options.triggerCharacter) suggestCtx = { triggerKind: CompletionTriggerKind.TriggerCharacter, triggerCharacter: options.triggerCharacter }

        this._requestToken = new CancellationTokenSource()

        // 种类过滤与 snippet 排序
        const snippetSuggestions = this._editor.getOption('snippetSuggestions')
        let snippetSortOrder = SnippetSortOrder.Inline
        switch (snippetSuggestions) {
            case 'top': snippetSortOrder = SnippetSortOrder.Top; break
            case 'bottom': snippetSortOrder = SnippetSortOrder.Bottom; break
        }

        const { itemKind: itemKindFilter, showDeprecated } = SuggestModel.createSuggestFilter(this._editor)
        const completionOptions = new CompletionOptions(snippetSortOrder, options.completionOptions?.kindFilter ?? itemKindFilter, options.completionOptions?.providerFilter, options.completionOptions?.providerItemsToReuse, showDeprecated)
        const wordDistance = this._services.wordRanges ? WordDistance.create(this._services.wordRanges, this._editor) : Promise.resolve(WordDistance.None)

        const completions = provideSuggestionItems(
            this._services.languageFeatures.completionProvider as never,
            model as never,
            this._editor.getPosition()! as Position,
            completionOptions,
            suggestCtx,
            this._requestToken.token,
        )

        Promise.all([completions, wordDistance]).then(async ([completions, wordDistance]) => {
            this._requestToken?.dispose()

            if (!this._editor.hasModel()) { completions.disposable.dispose(); return }

            let clipboardText = options?.clipboardText
            if (!clipboardText && completions.needsClipboard) clipboardText = await this._services.clipboard?.readText()

            if (this._triggerState === undefined) { completions.disposable.dispose(); return }

            const model = this._editor.getModel()!
            const ctx = new LineContext(model as never, this._editor.getPosition()!, options)
            const fuzzySearchOptions = { ...FUZZY_OPTIONS_DEFAULT, firstMatchCanBeWeak: !this._editor.getOption('suggest').matchOnWordStartOnly }
            this._completionModel = new CompletionModel(completions.items, this._context!.column, {
                leadingLineContent: ctx.leadingLineContent,
                characterCountDelta: ctx.column - this._context!.column,
            },
            wordDistance,
            this._editor.getOption('suggest'),
            this._editor.getOption('snippetSuggestions'),
            fuzzySearchOptions,
            clipboardText)

            // 容器留着,稍后一起 dispose
            this._completionDisposables.push(completions.disposable)

            this._onNewContext(ctx)

            // 开发态:无效补全项记一条 warn
            const env = this._services.env
            if (env && (!env.isBuilt || env.isExtensionDevelopment)) {
                for (const item of completions.items) {
                    if (item.isInvalid) this._services.log?.warn(`[suggest] did IGNORE invalid completion item from ${item.provider._debugDisplayName}`, item.completion)
                }
            }
        }).catch(err => { if (!isCancellationError(err)) console.error(err) })
    }

    static createSuggestFilter(editor: Editor): { itemKind: Set<CompletionItemKind>, showDeprecated: boolean } {
        const result = new Set<CompletionItemKind>()

        if (editor.getOption('snippetSuggestions') === 'none') result.add(CompletionItemKind.Snippet)

        const o = editor.getOption('suggest')
        const K = CompletionItemKind
        const table: [boolean, CompletionItemKind][] = [
            [o.showMethods, K.Method], [o.showFunctions, K.Function], [o.showConstructors, K.Constructor], [o.showFields, K.Field],
            [o.showVariables, K.Variable], [o.showClasses, K.Class], [o.showStructs, K.Struct], [o.showInterfaces, K.Interface],
            [o.showModules, K.Module], [o.showProperties, K.Property], [o.showEvents, K.Event], [o.showOperators, K.Operator],
            [o.showUnits, K.Unit], [o.showValues, K.Value], [o.showConstants, K.Constant], [o.showEnums, K.Enum],
            [o.showEnumMembers, K.EnumMember], [o.showKeywords, K.Keyword], [o.showWords, K.Text], [o.showColors, K.Color],
            [o.showFiles, K.File], [o.showReferences, K.Reference], [o.showColors, K.Customcolor], [o.showFolders, K.Folder],
            [o.showTypeParameters, K.TypeParameter], [o.showSnippets, K.Snippet], [o.showUsers, K.User], [o.showIssues, K.Issue],
        ]
        for (const [show, kind] of table) if (!show) result.add(kind)

        return { itemKind: result, showDeprecated: o.showDeprecated }
    }

    private _onNewContext(ctx: LineContext): void {
        if (!this._context) return // 24x7 提示还在延迟里

        if (ctx.lineNumber !== this._context.lineNumber) {
            // 例如计算期间按了回车
            this.cancel()
            return
        }

        if (leadingWhitespace(ctx.leadingLineContent) !== leadingWhitespace(this._context.leadingLineContent)) {
            // 行首缩进变了(当前词被反缩进)
            this.cancel()
            return
        }

        if (ctx.column < this._context.column) {
            // 光标左移:还在词上就重触发
            if (ctx.leadingWord.word) this.trigger({ auto: this._context.triggerOptions.auto, retrigger: true })
            else this.cancel()
            return
        }

        if (!this._completionModel) return // 还没算出来

        if (ctx.leadingWord.word.length !== 0 && ctx.leadingWord.startColumn > this._context.leadingWord.startColumn) {
            // 开着时进了新词:复用手上全部结果重触发
            const shouldAutoTrigger = LineContext.shouldAutoTrigger(this._editor)
            if (shouldAutoTrigger && this._context) {
                const map = this._completionModel.getItemsByProvider()
                this.trigger({
                    auto: this._context.triggerOptions.auto,
                    retrigger: true,
                    clipboardText: this._completionModel.clipboardText,
                    completionOptions: { providerItemsToReuse: map },
                })
            }
            return
        }

        if (ctx.column > this._context.column && this._completionModel.getIncompleteProvider().size > 0 && ctx.leadingWord.word.length !== 0) {
            // 光标右移 + 结果不完整 + 还在词上:只重问不完整的 provider
            const providerItemsToReuse = new Map<SuggestProvider, CompletionItem[]>()
            const providerFilter = new Set<SuggestProvider>()
            for (const [provider, items] of this._completionModel.getItemsByProvider()) {
                if (items.length > 0 && items[0].container.incomplete) providerFilter.add(provider)
                else providerItemsToReuse.set(provider, items)
            }
            this.trigger({
                auto: this._context.triggerOptions.auto,
                triggerKind: CompletionTriggerKind.TriggerForIncompleteCompletions,
                retrigger: true,
                clipboardText: this._completionModel.clipboardText,
                completionOptions: { providerFilter, providerItemsToReuse },
            })
        } else {
            // 光标右移:更新 UI
            const oldLineContext = this._completionModel.lineContext
            let isFrozen = false

            this._completionModel.lineContext = {
                leadingLineContent: ctx.leadingLineContent,
                characterCountDelta: ctx.column - this._context.column,
            }

            if (this._completionModel.items.length === 0) {
                const shouldAutoTrigger = LineContext.shouldAutoTrigger(this._editor)
                if (!this._context) { this.cancel(); return }

                if (shouldAutoTrigger && this._context.leadingWord.endColumn < ctx.leadingWord.startColumn) {
                    // 走进新词:重触发
                    this.trigger({ auto: this._context.triggerOptions.auto, retrigger: true })
                    return
                }

                if (!this._context.triggerOptions.auto) {
                    // 手动请求的:冻结
                    this._completionModel.lineContext = oldLineContext
                    isFrozen = this._completionModel.items.length > 0
                    if (isFrozen && ctx.leadingWord.word.length === 0) {
                        // 之前有结果现在没有、也不在词上:取消
                        this.cancel()
                        return
                    }
                } else {
                    // 没东西了
                    this.cancel()
                    return
                }
            }

            this._onDidSuggest.fire({ completionModel: this._completionModel, triggerOptions: ctx.triggerOptions, isFrozen })
        }
    }
}
