// 行内补全的「数据源」:向 provider 发请求、保存结果、把用户编辑作用到还没接受的建议上(移植自 inlineCompletionsSource.ts)。
// 命令式:变更通过 onDidChange 通知(Monaco 那边是 observable)。
//   · state = { inlineCompletions, suggestWidgetInlineCompletions },两份各自引用计数;替换时先建新再放旧
//   · 同一时刻只有一个 UpdateOperation:新请求被旧请求「满足」就复用旧的;文本版本一变,在途请求作废
//   · fetch:去抖 → 版本检查 → 问 provider(出第一个可见的自动补全就早停)→ lostRace → 等 earliestShownDateTime → 版本/jump 检查 → 落 state
import { Emitter } from '../../api/context'
import type { Position } from '../../api/position'
import { CancellationTokenSource } from '../async'
import { InlineSuggestionIdentity, InlineSuggestionItem } from './items'
import { provideInlineCompletions, runWhenCancelled } from './provide'
import { StringEdit } from './stringedit'
import { InlineCompletionEndOfLifeReasonKind, InlineCompletionTriggerKind } from './types'
import type { InlineCompletionContextWithoutUuid, InlineCompletionsProvider, InlineModel, InlineSuggestRequestInfo, SelectedSuggestionInfo } from './types'
import { distinctByKey, moveToFront, wait } from './utils'

export class UpdateRequest {
    constructor(
        readonly position: Position,
        readonly context: InlineCompletionContextWithoutUuid,
        readonly versionId: number,
        readonly providers: Set<InlineCompletionsProvider>,
    ) { }

    /** this 的结果能不能直接当 other 的结果用 */
    satisfies(other: UpdateRequest): boolean {
        return this.position.equals(other.position)
            && sameSuggestInfo(this.context.selectedSuggestionInfo, other.context.selectedSuggestionInfo)
            && (other.context.triggerKind === InlineCompletionTriggerKind.Automatic || this.context.triggerKind === InlineCompletionTriggerKind.Explicit)
            && this.versionId === other.versionId
            && [...other.providers].every(p => this.providers.has(p))
    }
}

function sameSuggestInfo(a: SelectedSuggestionInfo | undefined, b: SelectedSuggestionInfo | undefined): boolean {
    return a === b || (!!a && !!b && a.equals(b))
}

/** 一份引用计数的建议列表 */
export class InlineCompletionsState {
    static createEmpty(): InlineCompletionsState { return new InlineCompletionsState([], undefined) }
    private _disposed = false

    constructor(readonly inlineCompletions: readonly InlineSuggestionItem[], readonly request: UpdateRequest | undefined) {
        for (const c of inlineCompletions) c.addRef()
    }
    dispose(): void {
        if (this._disposed) return
        this._disposed = true
        for (const c of this.inlineCompletions) c.removeRef()
    }
    clone(): InlineCompletionsState { return new InlineCompletionsState(this.inlineCompletions, this.request) }

    private findById(id: InlineSuggestionIdentity) { return this.inlineCompletions.find(i => i.identity === id) }
    private findByHash(hash: string) { return this.inlineCompletions.find(i => i.hash === hash) }

    createStateWithAppliedEdit(edit: StringEdit, textModel: InlineModel): InlineCompletionsState {
        const items = this.inlineCompletions.map(i => i.withEdit(edit, textModel)).filter((i): i is InlineSuggestionItem => i !== undefined)
        return new InlineCompletionsState(items, this.request)
    }

    createStateWithAppliedResults(
        updated: InlineSuggestionItem[], request: UpdateRequest, textModel: InlineModel, cursorPosition: Position, itemIdToPreserveAtTop: InlineSuggestionIdentity | undefined,
    ): InlineCompletionsState {
        let itemToPreserve: InlineSuggestionItem | undefined
        if (itemIdToPreserveAtTop) {
            const candidate = this.findById(itemIdToPreserveAtTop)
            if (candidate && candidate.canBeReused(textModel, request.position)) {
                itemToPreserve = candidate
                const again = updated.find(i => i.hash === candidate.hash)
                updated = again ? moveToFront(again, updated) : [candidate, ...updated]
            }
        }

        // 有要保留的项时它说了算;否则有「可见的」行内补全就偏向补全而不是 edit
        const preferInlineCompletions = itemToPreserve
            ? !itemToPreserve.isInlineEdit
            : updated.some(i => !i.isInlineEdit && i.isVisible(textModel, cursorPosition))

        let items: InlineSuggestionItem[] = []
        for (const i of updated) {
            const old = this.findByHash(i.hash)
            let item: InlineSuggestionItem
            if (old && old !== i) {
                item = i.withIdentity(old.identity)
                i.setIsPreceeded(old)
                old.setEndOfLifeReason({ kind: InlineCompletionEndOfLifeReasonKind.Ignored, userTypingDisagreed: false, supersededBy: i.getSourceCompletion() })
            } else item = i
            if (preferInlineCompletions !== item.isInlineEdit) items.push(item)
        }
        // showInlineEditMenu 的排后面(false < true),sort 稳定
        items = items.slice().sort((a, b) => Number(a.showInlineEditMenu) - Number(b.showInlineEditMenu))
        items = distinctByKey(items, i => i.semanticId)
        return new InlineCompletionsState(items, request)
    }
}

class UpdateOperation {
    constructor(readonly request: UpdateRequest, readonly cts: CancellationTokenSource, readonly promise: Promise<boolean>) { }
    dispose(): void { this.cts.cancel() }
}

export interface SourceHost {
    readonly textModel: InlineModel
    cursorPosition(): Position
    /** 默认去抖毫秒(Monaco 这里是 LanguageFeatureDebounce,{min:50,max:50} = 恒 50) */
    debounce(): number
}

export class InlineCompletionsSource {
    private _op: UpdateOperation | undefined
    private _disposed = false
    private _loading = 0
    private _inlineCompletions = InlineCompletionsState.createEmpty()
    private _suggestWidget = InlineCompletionsState.createEmpty()
    private readonly _onDidChange = new Emitter<void>()
    readonly onDidChange = this._onDidChange.event

    constructor(private readonly host: SourceHost) { }

    get inlineCompletions(): InlineCompletionsState { return this._inlineCompletions }
    get suggestWidgetInlineCompletions(): InlineCompletionsState { return this._suggestWidget }
    get loading(): boolean { return this._loading > 0 }

    dispose(): void {
        if (this._disposed) return
        this._disposed = true
        this.clearOperation()
        this._inlineCompletions.dispose()
        this._suggestWidget.dispose()
        this._onDidChange.dispose()
    }

    private clearOperation(): void { const op = this._op; this._op = undefined; op?.dispose() }
    private setState(a: InlineCompletionsState, b: InlineCompletionsState): void {
        const old1 = this._inlineCompletions, old2 = this._suggestWidget
        this._inlineCompletions = a
        this._suggestWidget = b
        old1.dispose()
        old2.dispose()
        this._onDidChange.fire()
    }

    /** 文本版本变了:在途请求作废(Monaco clearOperationOnTextModelChange) */
    clearOperationOnTextModelChange(): void { this.clearOperation() }

    /** 用户的一次编辑:把还没接受的建议平移/吸收/丢弃 */
    applyEdit(edit: StringEdit): void {
        if (edit.isEmpty()) return
        this.setState(
            this._inlineCompletions.createStateWithAppliedEdit(edit, this.host.textModel),
            this._suggestWidget.createStateWithAppliedEdit(edit, this.host.textModel),
        )
    }

    fetch(
        providers: InlineCompletionsProvider[],
        context: InlineCompletionContextWithoutUuid,
        activeInlineCompletion: InlineSuggestionIdentity | undefined,
        withDebounce: boolean,
        userJumpedToActiveCompletion: () => boolean,
        requestInfo: InlineSuggestRequestInfo,
    ): Promise<boolean> {
        const { textModel } = this.host
        const position = this.host.cursorPosition()
        const request = new UpdateRequest(position, context, textModel.getVersionId(), new Set(providers))
        const target = context.selectedSuggestionInfo ? this._suggestWidget : this._inlineCompletions

        if (this._op?.request.satisfies(request)) return this._op.promise
        if (target.request?.satisfies(request)) return Promise.resolve(true)

        const updateOngoing = !!this._op
        this.clearOperation()
        const cts = new CancellationTokenSource()
        const stale = () => cts.token.isCancellationRequested || this._disposed || textModel.getVersionId() !== request.versionId

        const promise = (async (): Promise<boolean> => {
            const releases: (() => void)[] = []
            this._loading++
            this._onDidChange.fire()
            let decreased = false
            const decrease = () => { if (!decreased) { decreased = true; this._loading--; this._onDidChange.fire() } }
            const loadingReset = setTimeout(decrease, 10_000)

            try {
                const debounce = Math.max(-1, ...providers.map(p => p.debounceDelayMs ?? -1))
                const debounceValue = debounce >= 0 ? debounce : this.host.debounce()
                if (updateOngoing || (withDebounce && context.triggerKind === InlineCompletionTriggerKind.Automatic)) await wait(debounceValue, cts.token)
                if (stale()) return false

                const providerResult = provideInlineCompletions(providers, this.host.cursorPosition(), textModel, context, requestInfo)
                runWhenCancelled(cts.token, () => providerResult.cancelAndDispose({ kind: 'tokenCancellation' }))

                let stopEarly = false
                const suggestions: InlineSuggestionItem[] = []
                for await (const list of providerResult.lists) {
                    list.addRef()
                    releases.push(() => list.removeRef(list.inlineSuggestionsData.length === 0 ? { kind: 'empty' } : { kind: 'notTaken' }))
                    for (const item of list.inlineSuggestionsData) {
                        if (!context.includeInlineEdits && (item.isInlineEdit || item.showInlineEditMenu)) { item.setNotShownReason('notInlineEditRequested'); continue }
                        if (!context.includeInlineCompletions && !(item.isInlineEdit || item.showInlineEditMenu)) { item.setNotShownReason('notInlineCompletionRequested'); continue }
                        const i = InlineSuggestionItem.create(item, textModel)
                        suggestions.push(i)
                        // 自动触发时,出了第一个可见的行内补全就不再等别的 provider
                        if (!i.isInlineEdit && !i.showInlineEditMenu && context.triggerKind === InlineCompletionTriggerKind.Automatic && i.isVisible(textModel, this.host.cursorPosition())) stopEarly = true
                    }
                    if (stopEarly) break
                }
                providerResult.cancelAndDispose({ kind: 'lostRace' })

                const remaining = context.earliestShownDateTime - Date.now()
                if (remaining > 0) await wait(remaining, cts.token)

                if (stale() || userJumpedToActiveCompletion()) {
                    const reason = cts.token.isCancellationRequested ? 'canceled:afterMinShowDelay' : this._disposed ? 'canceled:disposed'
                        : textModel.getVersionId() !== request.versionId ? 'canceled:documentChanged' : 'canceled:userJumped'
                    for (const s of suggestions) s.setNotShownReasonIfNotSet(reason)
                    return false
                }

                const cursor = this.host.cursorPosition()
                this.clearOperation()
                if (context.selectedSuggestionInfo) {
                    this.setState(InlineCompletionsState.createEmpty(),
                        this._suggestWidget.createStateWithAppliedResults(suggestions, request, textModel, cursor, activeInlineCompletion))
                } else {
                    this.setState(this._inlineCompletions.createStateWithAppliedResults(suggestions, request, textModel, cursor, activeInlineCompletion),
                        InlineCompletionsState.createEmpty())
                }
                return true
            } finally {
                clearTimeout(loadingReset)
                for (const r of releases) r()
                decrease()
            }
        })()

        this._op = new UpdateOperation(request, cts, promise)
        return promise
    }

    clear(): void {
        this.clearOperation()
        this.setState(InlineCompletionsState.createEmpty(), InlineCompletionsState.createEmpty())
    }

    /** 补全菜单没了,但它带出的行内补全比现有的新:接管过来 */
    seedInlineCompletionsWithSuggestWidget(): void {
        const widget = this._suggestWidget
        if ((widget.request?.versionId ?? -1) > (this._inlineCompletions.request?.versionId ?? -1)) {
            this.setState(widget.clone(), InlineCompletionsState.createEmpty())
        }
        this.clearSuggestWidgetInlineCompletions()
    }

    clearSuggestWidgetInlineCompletions(): void {
        if (this._op?.request.context.selectedSuggestionInfo) this.clearOperation()
    }

    cancelUpdate(): void { this.clearOperation() }
}
