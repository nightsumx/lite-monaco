// 行内补全的「大脑」:什么时候问 provider、哪一项显示成 ghost text、接受时怎么落到文档(移植自 inlineCompletionsModel.ts)。
//
// 命令式。Monaco 那边是一整张 observable 图;这里砍成:
//   · 输入事件只「记账」(onTextChange / onSelectionChange / setActive / signal),不立刻算
//   · commit() 把一批输入落地:先平移旧建议、作废在途请求,再按这一批的 ChangeSummary 决定是否发新请求,最后通知
//   · 派生量(state / primaryGhostText / ghostTexts …)是纯 getter,按 rev 缓存
// 批边界由控制器给:编辑器的 onBeginUpdate / onEndUpdate 括起来的所有事件(内容、光标、onDidType)算同一批,只 commit 一次。
//
// 与 Monaco 的有意差别(都不影响协议):没有 TypingInterval / 遥测 / FadeoutDecoration / peek 抑制 / 多编辑器协调 / 无障碍信号 / NES 跨文件。
import { Emitter } from '../../api/context'
import { Position, Range, Selection } from '../../api/position'
import type { IDisposable, IEvent, IModelContentChangedEvent, LiteMonacoEditor } from '../../api/types'
import type { ITextModel } from '../../api/model'
import { getWordDefinition } from '../../api/languages'
import { GhostText, computeGhostText, ghostTextOrReplacementEquals, ghostTextsOrReplacementsEqual, singleTextEditAugments, singleTextRemoveCommonPrefix } from './ghosttext'
import type { GhostTextOrReplacement } from './ghosttext'
import { Doc, type InlineCompletionItem, type InlineEditItem, type InlineSuggestionIdentity, type InlineSuggestionItem } from './items'
import { InlineCompletionsSource } from './source'
import { offsetEditFromContentChanges } from './stringedit'
import { TextEdit, TextLength, TextReplacement } from './textedit'
import {
    InlineCompletionEndOfLifeReasonKind, InlineCompletionTriggerKind, PartialAcceptTriggerKind,
} from './types'
import type { InlineCompletionCommand, InlineCompletionContextWithoutUuid, InlineCompletionsProvider, InlineModel, InlineSuggestRequestInfo } from './types'
import { getEndPositionsAfterApplying, removeTextReplacementCommonSuffixPrefix } from './utils'
import type { SuggestItemInfo } from './suggestadapter'

const PREVIEW_MODES = ['prefix', 'subword', 'subwordSmart'] as const
type PreviewMode = typeof PREVIEW_MODES[number]

/** 一个 inline edit(NES)的展示单元:主替换 + 命令 + 来源项 */
export class InlineEdit {
    constructor(readonly edit: TextReplacement, readonly commands: readonly InlineCompletionCommand[], readonly inlineCompletion: InlineSuggestionItem) { }
    get range(): Range { return this.edit.range }
    get text(): string { return this.edit.text }
    equals(other: InlineEdit): boolean { return this.edit.equals(other.edit) && this.inlineCompletion === other.inlineCompletion }
}

export type GhostTextState = {
        readonly kind: 'ghostText'
        readonly edits: readonly TextReplacement[]
        readonly primaryGhostText: GhostTextOrReplacement
        readonly ghostTexts: readonly GhostTextOrReplacement[]
        readonly suggestItem: SuggestItemInfo | undefined
        readonly inlineCompletion: InlineCompletionItem | undefined
}
export type InlineEditState = {
        readonly kind: 'inlineEdit'
        readonly edits: readonly TextReplacement[]
        readonly inlineEdit: InlineEdit
        readonly inlineCompletion: InlineEditItem
        readonly cursorAtInlineEdit: boolean
}
export type InlineCompletionsState = GhostTextState | InlineEditState

/** 模型要的外部世界(控制器给) */
export interface InlineCompletionsModelDeps {
    readonly editor: LiteMonacoEditor
    readonly textModel: ITextModel
    /** 补全小部件当前选中项(没有 = undefined) */
    suggestItem(): SuggestItemInfo | undefined
    enabled(): boolean
    inComposition(): boolean
    providers(): InlineCompletionsProvider[]
    onDidChangeProviders(listener: () => void): IDisposable
    snippets(): { insert(template: string, opts?: { undoStopBefore?: boolean }): void, isInSnippet(): boolean } | undefined
    executeCommand(id: string, args: unknown[]): Promise<unknown> | boolean
    /** 默认去抖毫秒(Monaco LanguageFeatureDebounce {min:50,max:50} = 恒 50) */
    debounce(): number
}

/** 一批输入累积出来的「为什么要重算」 */
interface ChangeSummary {
    dontRefetch: boolean
    preserveCurrentCompletion: boolean
    inlineCompletionTriggerKind: InlineCompletionTriggerKind
    onlyRequestInlineEdits: boolean
    shouldDebounce: boolean
    provider: InlineCompletionsProvider | undefined
    textChange: boolean
    changeReason: string
}
const freshSummary = (): ChangeSummary => ({
    dontRefetch: false, preserveCurrentCompletion: false, inlineCompletionTriggerKind: InlineCompletionTriggerKind.Automatic,
    onlyRequestInlineEdits: false, shouldDebounce: true, provider: undefined, textChange: false, changeReason: '',
})

function stateEquals(a: InlineCompletionsState | undefined, b: InlineCompletionsState | undefined): boolean {
    if (!a || !b) return a === b
    if (a.kind === 'ghostText' && b.kind === 'ghostText') {
        return ghostTextsOrReplacementsEqual(a.ghostTexts, b.ghostTexts) && a.inlineCompletion === b.inlineCompletion && a.suggestItem === b.suggestItem
    }
    if (a.kind === 'inlineEdit' && b.kind === 'inlineEdit') return a.inlineEdit.equals(b.inlineEdit)
    return false
}

export interface TriggerOptions { onlyFetchInlineEdits?: boolean, noDelay?: boolean, provider?: InlineCompletionsProvider, explicit?: boolean }

export class InlineCompletionsModel implements IDisposable {
    private readonly _source: InlineCompletionsSource
    private readonly _onDidChange = new Emitter<void>()
    /** 任何会让 state / ghost text / status 变的事 */
    readonly onDidChange: IEvent<void> = this._onDidChange.event
    private readonly _onDidAccept = new Emitter<void>()
    readonly onDidAccept: IEvent<void> = this._onDidAccept.event

    private readonly _subs: IDisposable[] = []
    private _disposed = false
    private _rev = 0
    private _committedRev = -1
    private _committing = false

    private _isActive = false
    private _inAcceptFlow = false
    private _isAcceptingPartially = false
    private _selectedInlineCompletionId: string | undefined
    private _jumpedToId: string | undefined
    private _summary = freshSummary()
    private _reactDirty = false
    private _batch = 0
    private _textVersionChanged = false
    private _lastEvent: IModelContentChangedEvent | undefined
    private _didUndoCached = false
    private _lastFetch: Promise<boolean> | undefined
    private _lastShown: { alternateTextModelVersionId: number, inlineCompletion: InlineSuggestionItem } | undefined
    private _lastAccepted: { textModelVersionIdAfter: number, inlineCompletion: InlineSuggestionItem } | undefined
    private _lastInlineEditId: string | undefined

    constructor(private readonly deps: InlineCompletionsModelDeps) {
        this._source = new InlineCompletionsSource({
            textModel: deps.textModel as unknown as InlineModel,
            cursorPosition: () => this.primaryPosition,
            debounce: () => deps.debounce(),
        })
        this._subs.push(this._source.onDidChange(() => this._fire()))
        this._subs.push(deps.onDidChangeProviders(() => this._resubscribeProviders()))
        this._resubscribeProviders()
    }

    get textModel(): ITextModel { return this.deps.textModel }
    private get editor(): LiteMonacoEditor { return this.deps.editor }
    get isAcceptingPartially(): boolean { return this._isAcceptingPartially }
    get inAcceptFlow(): boolean { return this._inAcceptFlow }
    get isActive(): boolean { return this._isActive }
    debugSelectedSuggestItem(): SuggestItemInfo | undefined { return this.deps.suggestItem() }
    /** 单调递增的版本号:任何输入 / 状态变化都会加。外部(观察者适配层)靠它判断「变了没」 */
    get version(): number { return this._rev }

    dispose(): void {
        if (this._disposed) return
        this._disposed = true
        for (const s of this._subs.splice(0)) s.dispose()
        for (const s of this._providerSubs.splice(0)) s.dispose()
        this._source.dispose()
        this._onDidChange.dispose()
        this._onDidAccept.dispose()
    }

    // ───────────── 输入口 ─────────────

    private _bump(): void { this._rev++ }
    private _fire(): void {
        this._bump()
        // 批内 / 提交中只记账:中间态(内容已变、光标还没变)不能被外界看到,commit 收尾时统一通知一次
        if (this._committing || this._batch > 0) return
        if (!this._disposed) this._onDidChange.fire()
    }

    /** 模型内容变了(Monaco versionId 的 change)。只记账,commit 时落地 */
    onTextChange(e: IModelContentChangedEvent): void {
        this._lastEvent = e
        // 建议先吸收这次编辑、在途请求作废:派生量(state)随时可能被读,不能等批结束
        this._source.applyEdit(offsetEditFromContentChanges(e.changes))
        this._source.clearOperationOnTextModelChange()
        this._didUndoCached = this._computeDidUndo()
        this._textVersionChanged = true
        const s = this._summary
        if (e.isUndoing || e.isRedoing || this._isAcceptingPartially) s.preserveCurrentCompletion = true
        const r = e.detailedReasons?.[0]?.metadata
        s.changeReason = r ? (r.source === 'cursor' ? `cursor:${r.kind}` : r.source) : ''
        s.textChange = true
        this._reactDirty = true
        this._bump()
        if (this._batch === 0) this.commit()
    }
    /** 一批输入开始 / 结束:批内只记账,最外层结束时 commit 一次 */
    beginBatch(): void { this._batch++ }
    endBatch(): void { if (--this._batch === 0) this.commit() }
    /** 光标 / 选区 / 补全小部件选中项 / 选项 / 组合态变了:只影响派生量(选中项和 enabled 还会重新评估请求) */
    invalidate(opts: { react?: boolean, flush?: boolean } = {}): void {
        if (opts.react) this._reactDirty = true
        this._bump()
        // flush:补全菜单选中项变了,观察者立刻看到(不等外层更新批结束)。Monaco 的 observableFromEvent 就是这么走的
        if (this._batch === 0 || opts.flush) this.commit()
    }
    private setActive(v: boolean): void {
        if (this._isActive === v) return
        this._isActive = v
        this._reactDirty = true
        this._bump()
    }

    /** 把这一批输入落地。批内重复调用安全(没有脏就只通知) */
    commit(): void {
        if (this._disposed || this._committing || this._committedRev === this._rev) return
        this._committing = true
        try {
            const textChanged = this._textVersionChanged
            this._textVersionChanged = false
            if (this._reactDirty) {
                this._reactDirty = false
                const cs = this._summary
                this._summary = freshSummary()
                const p = this._react(cs)
                if (p) this._lastFetch = p
            }
            if (textChanged) this._inAcceptFlow = false
            this._runSideEffects()
        } finally {
            this._committing = false
        }
        this._rev++
        this._committedRev = this._rev
        if (!this._disposed) this._onDidChange.fire()
    }

    private _computeDidUndo(): boolean {
        const v = this.textModel.getVersionId()
        const last = this._lastAccepted
        const ev = this._lastEvent
        if (last && last.textModelVersionIdAfter === v - 1 && last.inlineCompletion.isInlineEdit && ev?.isUndoing) {
            this._lastAccepted = undefined
            return true
        }
        return false
    }

    /** Monaco 里挂在 state 上的几个 autorun */
    private _runSideEffects(): void {
        const s = this.state
        // 跳转标记:没状态,或 inline edit 但光标不在它旁边,就清掉
        if (!s || (s.kind === 'inlineEdit' && !s.cursorAtInlineEdit)) this._jumpedToId = undefined
        // inline edit 一出现就推一个撤销点,并记下「这个版本上展示过它」(撤销回来时还显示 edit 而不是补全)
        const editState = s?.kind === 'inlineEdit' ? s : undefined
        const id = editState?.inlineCompletion.semanticId
        if (id !== this._lastInlineEditId) {
            this._lastInlineEditId = id
            if (id && editState) {
                this.editor.pushUndoStop()
                this._lastShown = { alternateTextModelVersionId: this.textModel.getAlternativeVersionId(), inlineCompletion: editState.inlineCompletion }
            }
        }
    }

    // ───────────── 请求 ─────────────

    /** Monaco _fetchInlineCompletionsPromise 的 derived 体 */
    private _react(cs: ChangeSummary): Promise<boolean> | undefined {
        const suggestRaw = this.deps.suggestItem()
        const shouldUpdate = (this.deps.enabled() && suggestRaw) || this._isActive
        if (!shouldUpdate) { this._source.cancelUpdate(); return undefined }

        let suggestItem = suggestRaw
        if (this._shouldShowOnSuggestConflict()) suggestItem = undefined
        if (!suggestItem) this._source.seedInlineCompletionsWithSuggestWidget()

        if (cs.dontRefetch) return Promise.resolve(true)

        if (this._didUndoCached && cs.inlineCompletionTriggerKind !== InlineCompletionTriggerKind.Explicit) {
            this._source.clear()
            return undefined
        }

        let reason = ''
        if (cs.provider) reason += 'providerOnDidChange'
        else if (cs.inlineCompletionTriggerKind === InlineCompletionTriggerKind.Explicit) reason += 'explicit'
        if (cs.changeReason) reason += reason.length > 0 ? `:${cs.changeReason}` : cs.changeReason

        const requestInfo: InlineSuggestRequestInfo = {
            editorType: 'textEditor', startTime: Date.now(), languageId: this.textModel.getLanguageId(), reason,
            typingInterval: 0, typingIntervalCharacterCount: 0, availableProviders: [],
        }
        let context: InlineCompletionContextWithoutUuid = {
            triggerKind: cs.inlineCompletionTriggerKind,
            selectedSuggestionInfo: suggestItem?.toSelectedSuggestionInfo(),
            includeInlineCompletions: !cs.onlyRequestInlineEdits,
            includeInlineEdits: this._inlineEditsEnabled,
            requestIssuedDateTime: requestInfo.startTime,
            earliestShownDateTime: requestInfo.startTime
                + (cs.inlineCompletionTriggerKind === InlineCompletionTriggerKind.Explicit || this._inAcceptFlow ? 0 : this._minShowDelay),
        }
        // 自动触发 + 文本变了:撤销回到「展示过 edit/补全」的版本,就照原样再展示同一种
        if (context.triggerKind === InlineCompletionTriggerKind.Automatic && cs.textChange
            && this.textModel.getAlternativeVersionId() === this._lastShown?.alternateTextModelVersionId) {
            const wasEdit = this._lastShown.inlineCompletion.isInlineEdit
            context = { ...context, includeInlineCompletions: !wasEdit, includeInlineEdits: wasEdit }
        }

        const candidate = this.selectedInlineCompletion ?? this._items().inlineEdit
        const toPreserve = cs.preserveCurrentCompletion || candidate?.forwardStable ? candidate : undefined
        const userJumped = () => !!this._jumpedToId && this._jumpedToId === this._items().inlineEdit?.semanticId

        const providers = cs.provider ? [cs.provider] : this.deps.providers()
        const available = this.getAvailableProviders(providers)
        requestInfo.availableProviders = available.map(p => p.providerId).filter((p): p is NonNullable<typeof p> => !!p)
        return this._source.fetch(available, context, toPreserve?.identity as InlineSuggestionIdentity | undefined, cs.shouldDebounce, userJumped, requestInfo)
    }

    // 选项:Monaco 里有、lite-monaco 选项表里没有的,取 Monaco 缺省值
    private get _inlineEditsEnabled(): boolean { return true }
    private get _minShowDelay(): number { return 0 }
    private get _suppressInSnippetMode(): boolean { return true }
    private get _inlineSuggestMode(): PreviewMode { return this._mode((this.editor.getOption('inlineSuggest') as { mode?: string }).mode) }
    private get _suggestPreviewEnabled(): boolean { return !!(this.editor.getOption('suggest') as { preview?: boolean }).preview }
    private get _suggestPreviewMode(): PreviewMode { return this._mode((this.editor.getOption('suggest') as { previewMode?: string }).previewMode) }
    private _mode(m: string | undefined): PreviewMode { return (PREVIEW_MODES as readonly string[]).includes(m ?? '') ? m as PreviewMode : 'subwordSmart' }

    /** excludesGroupIds:有 provider 排除某组,那组的 provider 都不问 */
    getAvailableProviders(providers: InlineCompletionsProvider[]): InlineCompletionsProvider[] {
        const excluded = new Set<string>()
        for (const p of providers) p.excludesGroupIds?.forEach(g => excluded.add(g))
        return providers.filter(p => !(p.groupId && excluded.has(p.groupId)))
    }

    private _providerSubs: IDisposable[] = []
    private _resubscribeProviders(): void {
        for (const s of this._providerSubs.splice(0)) s.dispose()
        for (const provider of this.deps.providers()) {
            if (!provider.onDidChangeInlineCompletions) continue
            this._providerSubs.push(provider.onDidChangeInlineCompletions(() => {
                if (!this.deps.enabled()) return
                // 当前建议来自别的 provider:忽略这次通知
                const active = this.state
                if (active && active.inlineCompletion && active.inlineCompletion.source.provider !== provider) return
                this._summary.provider = provider
                void this.trigger()
            }))
        }
    }

    async trigger(options: TriggerOptions = {}): Promise<void> {
        if (this._disposed) return
        if (options.onlyFetchInlineEdits) { this._summary.onlyRequestInlineEdits = true; this._reactDirty = true }
        if (options.noDelay) this._reactDirty = true
        this.setActive(true)
        if (options.explicit) {
            this._inAcceptFlow = true
            const s = this._summary
            s.preserveCurrentCompletion = true
            s.inlineCompletionTriggerKind = InlineCompletionTriggerKind.Explicit
            this._reactDirty = true
        }
        if (options.provider) { this._summary.provider = options.provider; this._reactDirty = true }
        this._bump()
        if (this._batch === 0) this.commit()
        await this._lastFetch
    }

    triggerExplicitly(onlyFetchInlineEdits = false): Promise<void> { return this.trigger({ onlyFetchInlineEdits, explicit: true }) }

    stop(stopReason: 'explicitCancel' | 'automatic' = 'automatic'): void {
        if (stopReason === 'explicitCancel') this.state?.inlineCompletion?.reportEndOfLife({ kind: InlineCompletionEndOfLifeReasonKind.Rejected })
        this.setActive(false)
        this._source.clear()
        this._reactDirty = true
        this._bump()
        if (this._batch === 0) this.commit()
    }

    // ───────────── 派生量 ─────────────

    get primaryPosition(): Position { return this.positions[0] ?? new Position(1, 1) }
    /** 各选区的终点(Monaco positions = selections.map(s => s.getEndPosition())) */
    get positions(): readonly Position[] {
        const sels = this.editor.getSelections()
        return sels && sels.length > 0 ? sels.map(s => Range.getEndPosition(s)) : [new Position(1, 1)]
    }

    private _items(): { inlineCompletions: InlineCompletionItem[], inlineEdit: InlineEditItem | undefined } {
        const c = this._source.inlineCompletions
        const cursor = this.primaryPosition
        let inlineEdit: InlineEditItem | undefined
        const visible: InlineCompletionItem[] = []
        for (const item of c.inlineCompletions) {
            if (!item.isInlineEdit) { if (item.isVisible(this.textModel as unknown as InlineModel, cursor)) visible.push(item) }
            else inlineEdit = item
        }
        // 有可见的补全就不显示 edit
        return { inlineCompletions: visible, inlineEdit: visible.length !== 0 ? undefined : inlineEdit }
    }

    /** 可见的补全项(按 provider 给的顺序) */
    get inlineCompletionItems(): readonly InlineCompletionItem[] { return this._items().inlineCompletions }

    get selectedInlineCompletionIndex(): number {
        const items = this._items().inlineCompletions
        const idx = this._selectedInlineCompletionId === undefined ? -1 : items.findIndex(v => v.semanticId === this._selectedInlineCompletionId)
        if (idx === -1) { this._selectedInlineCompletionId = undefined; return 0 } // 选中项消失:复位,免得它再出现时选择跳回去
        return idx
    }
    get selectedInlineCompletion(): InlineCompletionItem | undefined {
        return this._items().inlineCompletions[this.selectedInlineCompletionIndex]
    }
    get activeCommands() { return this.selectedInlineCompletion?.source.inlineSuggestions.commands ?? [] }
    get lastTriggerKind(): InlineCompletionTriggerKind | undefined { return this._source.inlineCompletions.request?.context.triggerKind }
    get inlineCompletionsCount(): number | undefined {
        return this.lastTriggerKind === InlineCompletionTriggerKind.Explicit ? this._items().inlineCompletions.length : undefined
    }

    private _shouldShowOnSuggestConflict(): boolean { return false } // showOnSuggestConflict 缺省 'never'

    private _stateCache: { rev: number, value: InlineCompletionsState | undefined } | undefined
    get state(): InlineCompletionsState | undefined {
        if (this._stateCache?.rev === this._rev) return this._stateCache.value
        let value = this._computeState()
        if (stateEquals(this._stateCache?.value, value)) value = this._stateCache?.value // 等价就复用旧对象:订阅方靠引用判变化
        this._stateCache = { rev: this._rev, value }
        return value
    }

    private _computeState(): InlineCompletionsState | undefined {
        const model = this.textModel
        const snippets = this.deps.snippets()
        if (this._suppressInSnippetMode && snippets?.isInSnippet()) return undefined

        const item = this._items()
        const inlineEditResult = item.inlineEdit
        if (inlineEditResult) {
            let edit = inlineEditResult.getSingleTextEdit()
            edit = singleTextRemoveCommonPrefix(edit, model)
            const target = inlineEditResult.targetRange
            const line = this.primaryPosition.lineNumber
            const cursorAtInlineEdit = target.startLineNumber - 1 <= line && line <= target.endLineNumber + 1
            const inlineEdit = new InlineEdit(edit, inlineEditResult.source.inlineSuggestions.commands ?? [], inlineEditResult)
            const doc = new Doc(model as unknown as InlineModel)
            const edits = new TextEdit(inlineEditResult.updatedEdit.replacements.map(r => doc.textRepl(r))).replacements
            return { kind: 'inlineEdit', inlineEdit, inlineCompletion: inlineEditResult, edits, cursorAtInlineEdit }
        }

        const suggestItem = this.deps.suggestItem()
        if (!this._shouldShowOnSuggestConflict() && suggestItem) {
            const suggestEdit = singleTextRemoveCommonPrefix(suggestItem.getSingleTextEdit(), model)
            const augmentation = this._computeAugmentation(suggestEdit)
            if (!this._suggestPreviewEnabled && !augmentation) return undefined

            const fullEdit = augmentation?.edit ?? suggestEdit
            const previewLength = augmentation ? augmentation.edit.text.length - suggestEdit.text.length : 0
            return this._ghostState([fullEdit, ...this._secondary(fullEdit)], this._suggestPreviewMode, previewLength, augmentation?.completion, suggestItem, fullEdit)
        }

        if (!this._isActive) return undefined
        const inlineCompletion = this.selectedInlineCompletion
        if (!inlineCompletion) return undefined
        const replacement = inlineCompletion.getSingleTextEdit()
        const s = this._ghostState([replacement, ...this._secondary(replacement)], this._inlineSuggestMode, 0, inlineCompletion, undefined, undefined)
        return s?.primaryGhostText ? s : undefined
    }

    private _secondary(primary: TextReplacement): TextReplacement[] {
        return getSecondaryEdits(this.textModel, this.positions, primary)
    }

    /** 各光标位置各算一个 ghost,算不出的(上下文对不上 / 跨行不是公共前缀)略去 */
    private _ghostState(
        allEdits: TextReplacement[], mode: PreviewMode, previewLength: number,
        inlineCompletion: InlineCompletionItem | undefined, suggestItem: SuggestItemInfo | undefined, fallbackEdit: TextReplacement | undefined,
    ): GhostTextState | undefined {
        const positions = this.positions
        const valid = allEdits
            .map((edit, i) => ({ edit, ghostText: computeGhostText(edit, this.textModel, mode, positions[i], previewLength) }))
            .filter((x): x is { edit: TextReplacement, ghostText: GhostText } => x.ghostText !== undefined)
        const edits = valid.map(x => x.edit)
        const ghostTexts = valid.map(x => x.ghostText)
        // 补全菜单预览:算不出 ghost 也要有一个空 ghost,状态才成立
        const primary = ghostTexts[0] ?? (fallbackEdit ? new GhostText(fallbackEdit.range.endLineNumber, []) : undefined)
        if (!primary) return undefined
        return { kind: 'ghostText', edits, primaryGhostText: primary, ghostTexts, inlineCompletion, suggestItem }
    }

    /** 补全菜单选中项能被某个行内补全「增强」(行内补全以它为前缀并更长)时,把两者合并展示 */
    private _computeAugmentation(suggestCompletion: TextReplacement): { completion: InlineCompletionItem, edit: TextReplacement } | undefined {
        const widget = this._source.suggestWidgetInlineCompletions
        const candidates = widget.request || widget.inlineCompletions.length > 0
            ? widget.inlineCompletions.filter((c): c is InlineCompletionItem => !c.isInlineEdit)
            : [this.selectedInlineCompletion].filter((c): c is InlineCompletionItem => !!c)
        for (const completion of candidates) {
            let r = completion.getSingleTextEdit()
            r = singleTextRemoveCommonPrefix(r, this.textModel, Range.fromPositions(r.range.getStartPosition(), suggestCompletion.range.getEndPosition()))
            if (singleTextEditAugments(r, suggestCompletion)) return { completion, edit: r }
        }
        return undefined
    }

    get warning() { return this.inlineCompletionState?.inlineCompletion?.warning }
    get status(): 'loading' | 'ghostText' | 'inlineEdit' | 'noSuggestion' {
        if (this._source.loading) return 'loading'
        const s = this.state
        return s?.kind === 'ghostText' ? 'ghostText' : s?.kind === 'inlineEdit' ? 'inlineEdit' : 'noSuggestion'
    }
    /** 组合输入中不画 ghost */
    get inlineCompletionState(): GhostTextState | undefined {
        const s = this.state
        if (!s || s.kind !== 'ghostText' || this.deps.inComposition()) return undefined
        return s
    }
    get inlineEditState(): InlineEditState | undefined {
        const s = this.state
        return s && s.kind === 'inlineEdit' ? s : undefined
    }
    get inlineEditAvailable(): boolean { return !!this.inlineEditState }
    get ghostTexts(): readonly GhostTextOrReplacement[] | undefined { return this.inlineCompletionState?.ghostTexts }
    get primaryGhostText(): GhostTextOrReplacement | undefined { return this.inlineCompletionState?.primaryGhostText }
    static ghostTextEquals = ghostTextOrReplacementEquals

    // ───────────── next / previous ─────────────

    private async _deltaSelectedInlineCompletionIndex(delta: 1 | -1): Promise<void> {
        await this.triggerExplicitly()
        const completions = this._items().inlineCompletions
        if (completions.length > 0) {
            const idx = (this.selectedInlineCompletionIndex + delta + completions.length) % completions.length
            this._selectedInlineCompletionId = completions[idx].semanticId
        } else this._selectedInlineCompletionId = undefined
        this._fire()
    }
    next(): Promise<void> { return this._deltaSelectedInlineCompletionIndex(1) }
    previous(): Promise<void> { return this._deltaSelectedInlineCompletionIndex(-1) }

    // ───────────── 接受 ─────────────

    async accept(editor: LiteMonacoEditor = this.editor): Promise<void> {
        const state = this.state
        let completion: InlineSuggestionItem
        if (state?.kind === 'ghostText') {
            if (state.primaryGhostText.isEmpty() || !state.inlineCompletion) return
            completion = state.inlineCompletion
        } else if (state?.kind === 'inlineEdit') completion = state.inlineCompletion
        else return

        completion.addRef() // 文本变更发出去之前,别让这批结果被释放
        try {
            editor.pushUndoStop()
            const additional = completion.additionalTextEdits.map(e => new TextReplacement(Range.lift(e.range), e.text ?? ''))
            if (completion.snippetInfo) {
                // 片段:先删掉替换范围,光标放到片段起点,再交给片段会话展开(tabstop / 变量)
                const edit = TextEdit.fromParallelReplacementsUnsorted([TextReplacement.delete(completion.editRange), ...additional])
                const info = completion.snippetInfo
                editor.runUpdate(() => {
                    editor.executeEdits('inlineSuggestion.accept', edit.replacements.map(r => r.toSingleEditOperation()))
                    editor.setPosition(info.range.getStartPosition(), 'inlineCompletionAccept')
                    this.deps.snippets()?.insert(info.snippet, { undoStopBefore: false })
                })
            } else {
                const edits = state.edits
                // 光标落在「真正新增文本」的末尾:补全带的公共后缀不算(inline edit 已经是 diff 过的)
                const minimal = state.kind === 'ghostText' ? removeTextReplacementCommonSuffixPrefix(edits, this.textModel.getValue()) : edits
                const selections = getEndPositionsAfterApplying(minimal).map(p => Selection.fromPositions(p))
                const edit = TextEdit.fromParallelReplacementsUnsorted([...edits, ...additional])
                editor.runUpdate(() => {
                    editor.executeEdits('inlineSuggestion.accept', edit.replacements.map(r => r.toSingleEditOperation()))
                    if (completion.hint === undefined) editor.setSelections(state.kind === 'inlineEdit' ? selections.slice(-1) : selections, 'inlineCompletionAccept')
                })
            }
            this._onDidAccept.fire()

            // 先复位再跑命令:命令可能引起新的触发,那个不该被复位掉
            this.stop()
            if (completion.command) {
                try { await this.deps.executeCommand(completion.command.id, [...(completion.command.arguments ?? [])]) } catch (e) { console.error(e) }
            }
            completion.reportEndOfLife({ kind: InlineCompletionEndOfLifeReasonKind.Accepted })
        } finally {
            completion.removeRef()
            this._inAcceptFlow = true
            this._lastAccepted = { textModelVersionIdAfter: this.textModel.getVersionId(), inlineCompletion: completion }
            this._fire()
        }
    }

    acceptNextWord(): Promise<void> {
        return this._acceptNext('word', (pos, text) => {
            const langId = this.textModel.getLanguageIdAtPosition(pos.lineNumber, pos.column)
            const def = getWordDefinition(langId)
            const wordRegExp = new RegExp(def.source, def.flags.replace('g', ''))
            const m1 = text.match(wordRegExp)
            let until = 0
            if (m1 && m1.index !== undefined) until = m1.index === 0 ? m1[0].length : m1.index
            else until = text.length
            const m2 = /\s+/g.exec(text)
            if (m2 && m2.index + m2[0].length < until) until = m2.index + m2[0].length
            return until
        }, PartialAcceptTriggerKind.Word)
    }

    acceptNextLine(): Promise<void> {
        return this._acceptNext('line', (_pos, text) => {
            const m = text.match(/\n/)
            return m && m.index !== undefined ? m.index + 1 : text.length
        }, PartialAcceptTriggerKind.Line)
    }

    private async _acceptNext(_type: 'word' | 'line', getUntil: (position: Position, text: string) => number, kind: PartialAcceptTriggerKind): Promise<void> {
        const state = this.inlineCompletionState
        if (!state || state.primaryGhostText.isEmpty() || !state.inlineCompletion) return
        const ghost = state.primaryGhostText
        const completion = state.inlineCompletion
        // 片段不支持局部接受(所见非所得)
        if (completion.snippetInfo) { await this.accept(); return }

        const first = ghost.parts[0]
        const ghostPos = new Position(ghost.lineNumber, first.column)
        const ghostVal = first.text
        const until = getUntil(ghostPos, ghostVal)
        if (until === ghostVal.length && ghost.parts.length === 1) { await this.accept(); return }
        const partial = ghostVal.substring(0, until)

        const positions = this.positions
        const cursor = positions[0]
        completion.addRef() // 执行编辑可能释放这批结果
        try {
            this._isAcceptingPartially = true
            try {
                const editor = this.editor
                editor.pushUndoStop()
                editor.runUpdate(() => {
                    const replaceRange = Range.fromPositions(cursor, ghostPos)
                    const primary = new TextReplacement(replaceRange, editor.getModel()!.getValueInRange(replaceRange) + partial)
                    const edits = [primary, ...getSecondaryEdits(this.textModel, positions, primary)]
                    const selections = getEndPositionsAfterApplying(edits).map(p => Selection.fromPositions(p))
                    editor.executeEdits('inlineSuggestion.acceptPartial', TextEdit.fromParallelReplacementsUnsorted(edits).replacements.map(r => r.toSingleEditOperation()))
                    editor.setSelections(selections, 'inlineCompletionPartialAccept')
                    editor.revealPositionInCenterIfOutsideViewport(editor.getPosition()!, 1 /* ScrollType.Immediate */)
                })
            } finally {
                this._isAcceptingPartially = false
            }
            const accepted = Range.fromPositions(completion.editRange.getStartPosition(), TextLength.ofText(partial).addToPosition(ghostPos))
            const acceptedLength = this.textModel.getValueInRange(accepted, 1 /* LF */).length
            completion.reportPartialAccept(acceptedLength, { kind, acceptedLength }, { characters: until, ratio: until / ghostVal.length, count: 1 })
        } finally {
            completion.removeRef()
        }
    }

    /** 补全菜单项被接受:它若在增强某个行内补全,算那个补全被「建议式」部分接受 */
    handleSuggestAccepted(item: SuggestItemInfo): void {
        const itemEdit = singleTextRemoveCommonPrefix(item.getSingleTextEdit(), this.textModel)
        const aug = this._computeAugmentation(itemEdit)
        if (!aug) return
        const already = this.textModel.getValueInRange(aug.completion.editRange, 1 /* LF */).length
        aug.completion.reportPartialAccept(itemEdit.text.length, { kind: PartialAcceptTriggerKind.Suggest, acceptedLength: already + itemEdit.text.length },
            { characters: itemEdit.text.length, count: 1, ratio: 1 })
    }

    /** 光标跳到 inline edit 的目标处;跳过去就不再重取 */
    jump(): void {
        const s = this.inlineEditState
        if (!s) return
        const editor = this.editor
        this._jumpedToId = s.inlineCompletion.semanticId
        this._summary.dontRefetch = true
        this._reactDirty = true
        const target = s.inlineCompletion.targetRange
        const pos = target.getStartPosition()
        editor.setPosition(pos, 'inlineCompletions.jump')
        const single = target.startLineNumber === target.endLineNumber && (s.inlineCompletion.hint || !s.inlineCompletion.insertText.includes('\n'))
        if (single) editor.revealPosition(pos)
        else editor.revealRange(new Range(Math.max(1, target.startLineNumber - 1), 1, target.endLineNumber + 1, 1), 1 /* ScrollType.Immediate */)
        s.inlineCompletion.identity.setJumpTo()
        editor.focus()
        this.commit()
    }

    /** 用户上次 Tab 要不要缩进而不是接受:行首空白 / 空行 / 多行选区 */
    get tabShouldIndent(): boolean {
        if (this._inAcceptFlow) return false
        const m = this.textModel
        return (this.editor.getSelections() ?? []).some(s => {
            if (s.startLineNumber === s.endLineNumber && s.startColumn === s.endColumn) return m.getLineLength(s.startLineNumber) === 0
            if (s.startLineNumber !== s.endLineNumber) return true
            const colStart = this._indentColumn(s.startLineNumber)
            const colEnd = Math.max(m.getLineLastNonWhitespaceColumn(s.startLineNumber), colStart)
            return new Range(s.startLineNumber, colStart, s.startLineNumber, colEnd).containsRange(Range.lift(s))
        })
    }
    private _indentColumn(line: number): number {
        const text = this.textModel.getLineContent(line)
        let i = 0
        while (i < text.length && (text.charCodeAt(i) === 32 || text.charCodeAt(i) === 9)) i++
        return i + 1
    }

    /** 光标在 ghost 前缩进里、且 ghost 以缩进开头(Tab 该补缩进还是接受) */
    getIndentationInfo(): { startsWithIndentation: boolean, startsWithIndentationLessThanTabSize: boolean } {
        let startsWithIndentation = false
        let lessThanTab = true
        const ghost = this.primaryGhostText
        if (this.deps.suggestItem() && ghost && ghost.parts.length > 0) {
            const { column, lines } = ghost.parts[0]
            const first = lines[0].line
            if (column <= this._indentColumn(ghost.lineNumber)) {
                let idx = first.search(/\S/)
                if (idx === -1) idx = first.length - 1
                startsWithIndentation = idx > 0
                const tabSize = this.textModel.getOptions().tabSize
                let visible = 0
                for (let i = 0; i < idx; i++) visible = first.charCodeAt(i) === 9 ? visible + tabSize - (visible % tabSize) : visible + 1
                lessThanTab = visible < tabSize
            }
        }
        return { startsWithIndentation, startsWithIndentationLessThanTabSize: lessThanTab }
    }
}

// 局部引用(避免 import 的类型被摇掉)

/** 多光标:主光标上的补全编辑,平移到「上下文相同」的其他光标上(见 secondary.ts) */
import { getSecondaryEdits } from './secondary'
