// 补全 → 行内建议(ghost text)桥(移植自 VS Code editor/contrib/suggest/browser/suggestInlineCompletions.ts)。
//
// 把 provideSuggestionItems 的结果包成 InlineCompletionsProvider:光标在词尾(或刚敲了触发字符)且该 token 类型的
// quickSuggestions 配成 'inline' 时,才出结果;同一词里继续往右敲只重新过滤上一次的结果(不重问 provider)。
// 结果按 SuggestMemory 选中的下标分两段重排(记忆项排最前,其余保持相对序),没有字面重叠的项(score 是默认值)丢掉。
//
// 不画 UI、不绑编辑器:注册到 inlineCompletionsProvider('*'),编辑器由 services.listEditors() 按 model 找。
import type { IDisposable, LiteMonacoEditor } from '../api/types'
import { Range } from '../api/position'
import type { IPosition } from '../api/position'
import { tokenTypeBefore, normalizeQuickSuggestions, quickSuggestionFor } from '../core/feature/tokentype'
import { FUZZY_DEFAULT } from '../core/feature/fuzzy'
import { CompletionTriggerKind } from './providers'
import { languageFeatures, type LanguageFeaturesService } from './languagefeatures'
import { CancellationNone, type CancellationToken } from './async'
import { CompletionModel, LineContext } from './completionmodel'
import { CompletionOptions, provideSuggestionItems, type CompletionItem, type CompletionItemModel, type SuggestProvider } from './suggest'
import type { ISuggestMemoryService } from './suggestmemory'
import { SuggestModel } from './suggestmodel'
import { WordDistance } from './worddistance'

/** 行内建议的一项(Monaco SuggestInlineCompletion) */
export interface SuggestInlineCompletion {
    readonly range: Range
    readonly insertText: string | { snippet: string }
    readonly filterText: string
    readonly additionalTextEdits: unknown[] | undefined
    readonly command: unknown
    readonly gutterMenuLinkAction: unknown
    readonly completion: CompletionItem
}

export interface InlineCompletionContextLike { readonly selectedSuggestionInfo?: unknown }

interface WordInfo { word: string, startColumn: number, endColumn: number }
interface InlineModel {
    getWordAtPosition(p: IPosition): WordInfo | null
    getWordUntilPosition(p: IPosition): WordInfo
    getValueInRange(r: Range): string
}

/** 引用计数的结果:最后一个持有者放手时才释放底下的 provider 容器 */
export class InlineCompletionResults {
    private _refs = 1
    constructor(
        readonly model: InlineModel,
        readonly line: number,
        readonly word: WordInfo,
        readonly completionModel: CompletionModel,
        private readonly _completions: CompletionItemModel,
        private readonly _memory: ISuggestMemoryService,
    ) { }

    acquire(): void { this._refs++ }
    release(): void { if (--this._refs === 0) this._completions.disposable.dispose() }

    canBeReused(model: InlineModel, line: number, word: WordInfo): boolean {
        return this.model === model
            && this.line === line
            && this.word.word.length > 0
            && this.word.startColumn === word.startColumn && this.word.endColumn < word.endColumn
            && this.completionModel.getIncompleteProvider().size === 0
    }

    get items(): SuggestInlineCompletion[] {
        const result: SuggestInlineCompletion[] = []
        // 记忆选中的那项排最前,其前的(排名更高的)接在最后
        const { items } = this.completionModel
        const selected = this._memory.select(this.model as never, { lineNumber: this.line, column: this.word.endColumn + this.completionModel.lineContext.characterCountDelta }, items)
        const first = items.slice(selected)
        const second = items.slice(0, selected)

        let resolveCount = 5
        for (const item of [...first, ...second]) {
            if (item.score === FUZZY_DEFAULT) continue // 没有任何重叠
            const range = new Range(
                item.editStart.lineNumber, item.editStart.column,
                item.editInsertEnd.lineNumber, item.editInsertEnd.column + this.completionModel.lineContext.characterCountDelta, // 终点加上字符增量
            )
            // CompletionItemInsertTextRule.InsertAsSnippet = 4
            const insertText = item.completion.insertTextRules && (item.completion.insertTextRules & 4)
                ? { snippet: item.completion.insertText }
                : item.completion.insertText
            result.push({
                range, insertText,
                filterText: item.filterTextLow ?? item.labelLow,
                additionalTextEdits: item.completion.additionalTextEdits as unknown[] | undefined,
                command: item.completion.command,
                gutterMenuLinkAction: (item.completion as { action?: unknown }).action,
                completion: item,
            })
            // 前几项先解析好
            if (resolveCount-- >= 0) void item.resolve(CancellationNone)
        }
        return result
    }
}

export interface SuggestInlineCompletionsServices {
    languageFeatures?: Pick<LanguageFeaturesService, 'completionProvider' | 'inlineCompletionsProvider'>
    clipboard?: { readText(): Promise<string> }
    memory: ISuggestMemoryService
    /** 找 model 当前挂在哪个编辑器上 */
    listEditors(): ReadonlyArray<LiteMonacoEditor>
}

export class SuggestInlineCompletions implements IDisposable {
    private _lastResult?: InlineCompletionResults
    private readonly _reg: IDisposable
    private readonly _features: Pick<LanguageFeaturesService, 'completionProvider' | 'inlineCompletionsProvider'>

    constructor(private readonly _services: SuggestInlineCompletionsServices) {
        this._features = _services.languageFeatures ?? languageFeatures
        this._reg = this._features.inlineCompletionsProvider.register('*', this)
    }

    dispose(): void { this._reg.dispose() }

    async provideInlineCompletions(model: InlineModel, position: IPosition & { column: number, lineNumber: number }, context: InlineCompletionContextLike, token: CancellationToken): Promise<InlineCompletionResults | undefined> {
        if (context.selectedSuggestionInfo) return

        const editor = this._services.listEditors().find(e => e.getModel() === (model as unknown))
        if (!editor) return

        const config = normalizeQuickSuggestions(editor.getOption('quickSuggestions'))
        if (config.other === 'off' && config.comments === 'off' && config.strings === 'off') return // 整个都关了

        // 当前 token(光标前一个字符)的类型决定走不走 inline
        const view = editor as unknown as { state?: { doc: unknown } }
        const offset = (model as unknown as { getOffsetAt(p: IPosition): number }).getOffsetAt(position)
        const tokenType = view.state ? tokenTypeBefore(editor, view.state as never, offset) : 0
        if (quickSuggestionFor(config, tokenType) !== 'inline') return

        // 在词尾,或刚敲完触发字符(词优先于触发字符)
        let wordInfo = model.getWordAtPosition(position)
        let triggerCharacterInfo: { ch: string, providers: Set<SuggestProvider> } | undefined
        if (!wordInfo?.word) triggerCharacterInfo = this._getTriggerCharacterInfo(model, position)
        if (!wordInfo?.word && !triggerCharacterInfo) return

        // 不在词尾就不弹(不在词中间做快速建议)
        if (!wordInfo) wordInfo = model.getWordUntilPosition(position)
        if (wordInfo.endColumn !== position.column) return

        let result: InlineCompletionResults
        const leadingLineContents = model.getValueInRange(new Range(position.lineNumber, 1, position.lineNumber, position.column))
        if (!triggerCharacterInfo && this._lastResult?.canBeReused(model, position.lineNumber, wordInfo)) {
            // 能复用上次的结果:只重新过滤
            this._lastResult.completionModel.lineContext = new LineContext(leadingLineContents, position.column - this._lastResult.word.endColumn)
            this._lastResult.acquire()
            result = this._lastResult
        } else {
            const completions = await provideSuggestionItems(
                this._features.completionProvider as never,
                model as never, position as never,
                new CompletionOptions(undefined, SuggestModel.createSuggestFilter(editor).itemKind, triggerCharacterInfo?.providers),
                triggerCharacterInfo && { triggerKind: CompletionTriggerKind.TriggerCharacter, triggerCharacter: triggerCharacterInfo.ch },
                token,
            )
            const clipboardText = completions.needsClipboard ? await this._services.clipboard?.readText() : undefined
            const completionModel = new CompletionModel(
                completions.items,
                position.column,
                new LineContext(leadingLineContents, 0),
                WordDistance.None,
                editor.getOption('suggest'),
                editor.getOption('snippetSuggestions'),
                { boostFullMatch: false, firstMatchCanBeWeak: false },
                clipboardText,
            )
            result = new InlineCompletionResults(model, position.lineNumber, wordInfo, completionModel, completions, this._services.memory)
        }

        this._lastResult = result
        return result
    }

    handleItemDidShow(_completions: InlineCompletionResults, item: SuggestInlineCompletion): void {
        void item.completion.resolve(CancellationNone)
    }

    disposeInlineCompletions(result: InlineCompletionResults): void { result.release() }

    private _getTriggerCharacterInfo(model: InlineModel, position: IPosition & { column: number, lineNumber: number }) {
        const ch = model.getValueInRange(Range.fromPositions({ lineNumber: position.lineNumber, column: position.column - 1 }, position))
        const providers = new Set<SuggestProvider>()
        for (const provider of this._features.completionProvider.all(model as never)) {
            if ((provider as { triggerCharacters?: string[] }).triggerCharacters?.includes(ch)) providers.add(provider as SuggestProvider)
        }
        if (providers.size === 0) return undefined
        return { providers, ch }
    }
}
