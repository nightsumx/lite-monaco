// 语义着色的两条取数路径(Monaco contrib/semanticTokens/browser/documentSemanticTokens + viewportSemanticTokens):
//   - DocumentSemanticTokensFeature:盯着每个启用了语义着色的 model,挂在编辑器上(isAttachedToEditor)才向 documentSemanticTokensProvider 要整篇 token;
//     内容变了防抖后重取;请求期间又改了 / provider 说变了,请求回来后补一次;返回 edits(增量)就在上一份数据上打补丁;
//     请求没回来时的编辑,把回来的 token 按这些编辑平移后再用(不闪)。
//   - ViewportSemanticTokensContribution:没有整篇 provider 时,按「可视区 + 上下各一屏」向 documentRangeSemanticTokensProvider 要局部 token。
// 结果经 model.tokenization.setSemanticTokens / setPartialSemanticTokens 叠到 getLineTokens 的结果上。
import { RunOnceScheduler, CancellationTokenSource, createCancelablePromise, isCancellationError, type CancelablePromise } from './async'
import type { IDisposable, IEvent } from '../api/types'
import { Range, type IRange } from '../api/position'
import type { LanguageFeatureRegistry, FeatureModel } from './languagefeatures'
import type { IFeatureDebounceInformation, DebounceModel, LanguageFeatureDebounceService } from './featuredebounce'
import {
    getDocumentSemanticTokens, getDocumentRangeSemanticTokens, hasDocumentSemanticTokensProvider, hasDocumentRangeSemanticTokensProvider,
    isSemanticTokens, isSemanticTokensEdits, toMultilineTokens2,
    type DocumentSemanticTokensProvider, type DocumentRangeSemanticTokensProvider, type SemanticTokens, type SemanticTokensEdits,
    type SemanticTokensProviderStyling, type SemanticTokensStylingService,
} from './semantictokens'
import type { SparseMultilineTokens } from '../api/sparsetokens'

export const SEMANTIC_HIGHLIGHTING_SETTING_ID = 'editor.semanticHighlighting'

export interface SemanticTheme {
    getColorTheme(): { readonly semanticHighlighting: boolean }
    readonly onDidColorThemeChange: IEvent<unknown>
}
export interface SemanticConfig {
    getValue(section: string, overrides?: { overrideIdentifier?: string, resource?: unknown }): unknown
    onDidChangeConfiguration(listener: (e: { affectsConfiguration(id: string): boolean }) => unknown): IDisposable
}

/** model 要有的形态(ITextModel 的子集) */
export interface SemanticModel extends DebounceModel {
    readonly onDidChangeContent: IEvent<ContentEvent>
    readonly onDidChangeAttached: IEvent<void>
    readonly onDidChangeLanguage: IEvent<unknown>
    isAttachedToEditor(): boolean
    getVersionId(): number
    getLanguageId(): string
    isDisposed(): boolean
    readonly tokenization: {
        setSemanticTokens(tokens: SparseMultilineTokens[] | null, isComplete: boolean): void
        setPartialSemanticTokens(range: Range, tokens: SparseMultilineTokens[] | null): void
        hasCompleteSemanticTokens(): boolean
        hasSomeSemanticTokens(): boolean
    }
}
interface ContentEvent { readonly changes: readonly { readonly range: IRange, readonly text: string }[] }

/** 语义着色是否对这个 model 开着:设置里明说 true/false 就听设置,否则看主题(configuredByTheme) */
export function isSemanticColoringEnabled(model: { getLanguageId(): string, uri: unknown }, themeService: SemanticTheme, configurationService: SemanticConfig): boolean {
    const v = configurationService.getValue(SEMANTIC_HIGHLIGHTING_SETTING_ID, { overrideIdentifier: model.getLanguageId(), resource: model.uri }) as { enabled?: boolean | 'configuredByTheme' } | undefined
    const setting = v?.enabled
    if (typeof setting === 'boolean') return setting
    return themeService.getColorTheme().semanticHighlighting
}

const disposeAll = (ds: IDisposable[]): void => { for (const d of ds.splice(0)) d.dispose() }

export class DocumentSemanticTokensFeature implements IDisposable {
    private readonly _watchers = new Map<string, ModelSemanticColoring>()
    private readonly _subs: IDisposable[] = []

    constructor(
        stylingService: SemanticTokensStylingService,
        modelService: { getModels(): SemanticModel[], onModelAdded(l: (m: SemanticModel) => unknown): IDisposable, onModelRemoved(l: (m: SemanticModel) => unknown): IDisposable },
        themeService: SemanticTheme,
        configurationService: SemanticConfig,
        debounceService: Pick<LanguageFeatureDebounceService, 'for'>,
        languageFeaturesService: { documentSemanticTokensProvider: LanguageFeatureRegistry<DocumentSemanticTokensProvider> },
    ) {
        const key = (m: SemanticModel) => m.uri.toString()
        const register = (model: SemanticModel) => {
            this._watchers.get(key(model))?.dispose()
            this._watchers.set(key(model), new ModelSemanticColoring(model, stylingService, themeService, debounceService, languageFeaturesService))
        }
        const deregister = (model: SemanticModel, w: ModelSemanticColoring) => { w.dispose(); this._watchers.delete(key(model)) }
        const handleSettingOrThemeChange = () => {
            for (const model of modelService.getModels()) {
                const curr = this._watchers.get(key(model))
                if (isSemanticColoringEnabled(model, themeService, configurationService)) { if (!curr) register(model) }
                else if (curr) deregister(model, curr)
            }
        }
        for (const model of modelService.getModels()) if (isSemanticColoringEnabled(model, themeService, configurationService)) register(model)
        this._subs.push(
            modelService.onModelAdded(model => { if (isSemanticColoringEnabled(model, themeService, configurationService)) register(model) }),
            modelService.onModelRemoved(model => { const c = this._watchers.get(key(model)); if (c) deregister(model, c) }),
            configurationService.onDidChangeConfiguration(e => { if (e.affectsConfiguration(SEMANTIC_HIGHLIGHTING_SETTING_ID)) handleSettingOrThemeChange() }),
            themeService.onDidColorThemeChange(handleSettingOrThemeChange),
        )
    }

    dispose(): void {
        for (const w of this._watchers.values()) w.dispose()
        this._watchers.clear()
        disposeAll(this._subs)
    }
}

class SemanticTokensResponse {
    constructor(readonly provider: DocumentSemanticTokensProvider, readonly resultId: string | undefined, readonly data: Uint32Array) { }
    dispose(): void { this.provider.releaseDocumentSemanticTokens(this.resultId) }
}

class ModelSemanticColoring implements IDisposable {
    static REQUEST_MIN_DELAY = 300
    static REQUEST_MAX_DELAY = 2000

    private _isDisposed = false
    private readonly _provider: LanguageFeatureRegistry<DocumentSemanticTokensProvider>
    private readonly _debounceInformation: IFeatureDebounceInformation
    private readonly _fetchDocumentSemanticTokens: RunOnceScheduler
    private _currentDocumentResponse: SemanticTokensResponse | null = null
    private _currentDocumentRequestCancellationTokenSource: CancellationTokenSource | null = null
    private _documentProvidersChangeListeners: IDisposable[] = []
    private _providersChangedDuringRequest = false
    private readonly _subs: IDisposable[] = []

    constructor(
        private readonly _model: SemanticModel,
        private readonly _stylingService: SemanticTokensStylingService,
        themeService: SemanticTheme,
        debounceService: Pick<LanguageFeatureDebounceService, 'for'>,
        languageFeaturesService: { documentSemanticTokensProvider: LanguageFeatureRegistry<DocumentSemanticTokensProvider> },
    ) {
        this._provider = languageFeaturesService.documentSemanticTokensProvider
        this._debounceInformation = debounceService.for(this._provider as LanguageFeatureRegistry<object>, 'DocumentSemanticTokens', { min: ModelSemanticColoring.REQUEST_MIN_DELAY, max: ModelSemanticColoring.REQUEST_MAX_DELAY })
        this._fetchDocumentSemanticTokens = new RunOnceScheduler(() => this._fetchDocumentSemanticTokensNow(), ModelSemanticColoring.REQUEST_MIN_DELAY)
        const scheduleDebounced = () => { if (!this._fetchDocumentSemanticTokens.isScheduled()) this._fetchDocumentSemanticTokens.schedule(this._debounceInformation.get(this._model)) }

        this._subs.push(
            this._model.onDidChangeContent(scheduleDebounced),
            this._model.onDidChangeAttached(scheduleDebounced),
            this._model.onDidChangeLanguage(() => {
                // 语言换了:上一轮的状态全作废
                this._currentDocumentResponse?.dispose()
                this._currentDocumentResponse = null
                this._currentDocumentRequestCancellationTokenSource?.cancel()
                this._currentDocumentRequestCancellationTokenSource = null
                this._setDocumentSemanticTokens(null, null, null, [])
                this._fetchDocumentSemanticTokens.schedule(0)
            }),
        )

        const bindDocumentChangeListeners = () => {
            disposeAll(this._documentProvidersChangeListeners)
            for (const provider of this._provider.all(_model)) {
                if (typeof provider.onDidChange === 'function') {
                    this._documentProvidersChangeListeners.push(provider.onDidChange(() => {
                        if (this._currentDocumentRequestCancellationTokenSource) { this._providersChangedDuringRequest = true; return } // 有请求在飞,回来后补一次
                        this._fetchDocumentSemanticTokens.schedule(0)
                    }))
                }
            }
        }
        bindDocumentChangeListeners()
        this._subs.push(
            this._provider.onDidChange(() => { bindDocumentChangeListeners(); this._fetchDocumentSemanticTokens.schedule(this._debounceInformation.get(this._model)) }),
            themeService.onDidColorThemeChange(() => {
                this._setDocumentSemanticTokens(null, null, null, []) // 先清掉旧主题的
                this._fetchDocumentSemanticTokens.schedule(this._debounceInformation.get(this._model))
            }),
        )
        this._fetchDocumentSemanticTokens.schedule(0)
    }

    dispose(): void {
        this._currentDocumentResponse?.dispose()
        this._currentDocumentResponse = null
        this._currentDocumentRequestCancellationTokenSource?.cancel()
        this._currentDocumentRequestCancellationTokenSource = null
        disposeAll(this._documentProvidersChangeListeners)
        this._setDocumentSemanticTokens(null, null, null, [])
        this._isDisposed = true
        this._fetchDocumentSemanticTokens.dispose()
        disposeAll(this._subs)
    }

    private _fetchDocumentSemanticTokensNow(): void {
        if (this._currentDocumentRequestCancellationTokenSource) return // 有请求在飞,让它跑完

        if (!hasDocumentSemanticTokensProvider(this._provider, this._model)) {
            if (this._currentDocumentResponse) this._model.tokenization.setSemanticTokens(null, false) // 没 provider 了:清掉
            return
        }
        if (!this._model.isAttachedToEditor()) return // 没人看这个文档,不用算

        const cts = new CancellationTokenSource()
        const lastProvider = this._currentDocumentResponse ? this._currentDocumentResponse.provider : null
        const lastResultId = this._currentDocumentResponse ? this._currentDocumentResponse.resultId || null : null
        const request = getDocumentSemanticTokens(this._provider, this._model, lastProvider, lastResultId, cts.token)
        this._currentDocumentRequestCancellationTokenSource = cts
        this._providersChangedDuringRequest = false

        const pendingChanges: ContentEvent[] = []
        const contentChangeListener = this._model.onDidChangeContent(e => { pendingChanges.push(e) })

        const t0 = Date.now()
        request.then(res => {
            this._debounceInformation.update(this._model, Date.now() - t0)
            this._currentDocumentRequestCancellationTokenSource = null
            contentChangeListener.dispose()
            if (!res) this._setDocumentSemanticTokens(null, null, null, pendingChanges)
            else this._setDocumentSemanticTokens(res.provider, res.tokens || null, this._stylingService.getStyling(res.provider), pendingChanges)
        }, err => {
            // 语义 token 吞掉所有错误,当「暂时没有」(API 没有专门的错误种类)
            const expected = err && (isCancellationError(err) || (typeof err.message === 'string' && err.message.indexOf('busy') !== -1))
            if (!expected) console.error(err)
            this._currentDocumentRequestCancellationTokenSource = null
            contentChangeListener.dispose()
            if (pendingChanges.length > 0 || this._providersChangedDuringRequest) {
                if (!this._fetchDocumentSemanticTokens.isScheduled()) this._fetchDocumentSemanticTokens.schedule(this._debounceInformation.get(this._model))
            }
        })
    }

    private static _copy(src: Uint32Array, srcOffset: number, dest: Uint32Array, destOffset: number, length: number): void {
        length = Math.min(length, dest.length - destOffset, src.length - srcOffset) // 防越界
        for (let i = 0; i < length; i++) dest[destOffset + i] = src[srcOffset + i]
    }

    private _setDocumentSemanticTokens(provider: DocumentSemanticTokensProvider | null, tokens: SemanticTokens | SemanticTokensEdits | null, styling: SemanticTokensProviderStyling | null, pendingChanges: ContentEvent[]): void {
        const currentResponse = this._currentDocumentResponse
        const rescheduleIfNeeded = () => {
            if ((pendingChanges.length > 0 || this._providersChangedDuringRequest) && !this._fetchDocumentSemanticTokens.isScheduled()) {
                this._fetchDocumentSemanticTokens.schedule(this._debounceInformation.get(this._model))
            }
        }
        this._currentDocumentResponse?.dispose()
        this._currentDocumentResponse = null
        if (this._isDisposed) {
            if (provider && tokens) provider.releaseDocumentSemanticTokens(tokens.resultId)
            return
        }
        if (!provider || !styling) { this._model.tokenization.setSemanticTokens(null, false); return }
        if (!tokens) { this._model.tokenization.setSemanticTokens(null, true); rescheduleIfNeeded(); return }

        if (isSemanticTokensEdits(tokens)) {
            if (!currentResponse) { this._model.tokenization.setSemanticTokens(null, true); return } // 没有基线,edits 无从打起
            if (tokens.edits.length === 0) {
                tokens = { resultId: tokens.resultId, data: currentResponse.data }
            } else {
                let deltaLength = 0
                for (const edit of tokens.edits) deltaLength += (edit.data ? edit.data.length : 0) - edit.deleteCount
                const srcData = currentResponse.data
                const destData = new Uint32Array(srcData.length + deltaLength)
                let srcLastStart = srcData.length
                let destLastStart = destData.length
                for (let i = tokens.edits.length - 1; i >= 0; i--) {
                    const edit = tokens.edits[i]
                    if (edit.start > srcData.length) {
                        styling.warnInvalidEditStart(currentResponse.resultId, tokens.resultId, i, edit.start, srcData.length)
                        this._model.tokenization.setSemanticTokens(null, true) // edits 非法,无法恢复
                        return
                    }
                    const copyCount = srcLastStart - (edit.start + edit.deleteCount)
                    if (copyCount > 0) {
                        ModelSemanticColoring._copy(srcData, srcLastStart - copyCount, destData, destLastStart - copyCount, copyCount)
                        destLastStart -= copyCount
                    }
                    if (edit.data) {
                        ModelSemanticColoring._copy(edit.data, 0, destData, destLastStart - edit.data.length, edit.data.length)
                        destLastStart -= edit.data.length
                    }
                    srcLastStart = edit.start
                }
                if (srcLastStart > 0) ModelSemanticColoring._copy(srcData, 0, destData, 0, srcLastStart)
                tokens = { resultId: tokens.resultId, data: destData }
            }
        }

        if (isSemanticTokens(tokens)) {
            this._currentDocumentResponse = new SemanticTokensResponse(provider, tokens.resultId, tokens.data)
            const result = toMultilineTokens2(tokens, styling, this._model.getLanguageId())
            // 请求期间又有编辑:把回来的 token 按这些编辑平移(之后会再请求一次)
            for (const change of pendingChanges) for (const area of result) for (const c of change.changes) area.applyEdit(c.range, c.text)
            this._model.tokenization.setSemanticTokens(result, true)
        } else {
            this._model.tokenization.setSemanticTokens(null, true)
        }
        rescheduleIfNeeded()
    }
}

/** ViewportSemanticTokensContribution 要的编辑器子集 */
export interface ViewportEditor {
    hasModel(): boolean
    getModel(): SemanticModel & FeatureModel
    getVisibleRangesPlusViewportAboveBelow(): IRange[]
    readonly onDidScrollChange: IEvent<unknown>
    readonly onDidChangeModel: IEvent<unknown>
    readonly onDidChangeModelLanguage: IEvent<unknown>
    readonly onDidChangeModelContent: IEvent<unknown>
}

export class ViewportSemanticTokensContribution implements IDisposable {
    static readonly ID = 'editor.contrib.viewportSemanticTokens'

    private readonly _provider: LanguageFeatureRegistry<DocumentRangeSemanticTokensProvider>
    private readonly _debounceInformation: IFeatureDebounceInformation
    private readonly _tokenizeViewport: RunOnceScheduler
    private _outstandingRequests: CancelablePromise<unknown>[] = []
    private _rangeProvidersChangeListeners: IDisposable[] = []
    private readonly _subs: IDisposable[] = []

    constructor(
        private readonly _editor: ViewportEditor,
        private readonly _stylingService: SemanticTokensStylingService,
        private readonly _themeService: SemanticTheme,
        private readonly _configurationService: SemanticConfig,
        debounceService: Pick<LanguageFeatureDebounceService, 'for'>,
        languageFeaturesService: { documentRangeSemanticTokensProvider: LanguageFeatureRegistry<DocumentRangeSemanticTokensProvider> },
    ) {
        this._provider = languageFeaturesService.documentRangeSemanticTokensProvider
        this._debounceInformation = debounceService.for(this._provider as LanguageFeatureRegistry<object>, 'DocumentRangeSemanticTokens', { min: 100, max: 500 })
        this._tokenizeViewport = new RunOnceScheduler(() => this._tokenizeViewportNow(), 100)
        const scheduleTokenizeViewport = () => { if (this._editor.hasModel()) this._tokenizeViewport.schedule(this._debounceInformation.get(this._editor.getModel())) }
        const bindRangeProvidersChangeListeners = () => {
            this._cleanupProviderListeners()
            if (!this._editor.hasModel()) return
            for (const provider of this._provider.all(this._editor.getModel())) {
                const d = provider.onDidChange?.(() => { this._cancelAll(); scheduleTokenizeViewport() })
                if (d) this._rangeProvidersChangeListeners.push(d)
            }
        }
        const refresh = () => { this._cancelAll(); scheduleTokenizeViewport() }
        this._subs.push(
            this._editor.onDidScrollChange(scheduleTokenizeViewport),
            this._editor.onDidChangeModel(() => { bindRangeProvidersChangeListeners(); refresh() }),
            // model 的语义 token 清理在 DocumentSemanticTokensFeature 里做
            this._editor.onDidChangeModelLanguage(() => { bindRangeProvidersChangeListeners(); refresh() }),
            this._editor.onDidChangeModelContent(refresh),
        )
        bindRangeProvidersChangeListeners()
        this._subs.push(
            this._provider.onDidChange(() => { bindRangeProvidersChangeListeners(); refresh() }),
            this._configurationService.onDidChangeConfiguration(e => { if (e.affectsConfiguration(SEMANTIC_HIGHLIGHTING_SETTING_ID)) refresh() }),
            this._themeService.onDidColorThemeChange(refresh),
        )
        scheduleTokenizeViewport()
    }

    dispose(): void {
        this._cleanupProviderListeners()
        this._tokenizeViewport.dispose()
        disposeAll(this._subs)
    }

    private _cleanupProviderListeners(): void { disposeAll(this._rangeProvidersChangeListeners) }

    private _cancelAll(): void {
        for (const r of this._outstandingRequests) r.cancel()
        this._outstandingRequests = []
    }

    private _removeOutstandingRequest(req: CancelablePromise<unknown>): void {
        const i = this._outstandingRequests.indexOf(req)
        if (i >= 0) this._outstandingRequests.splice(i, 1)
    }

    private _tokenizeViewportNow(): void {
        if (!this._editor.hasModel()) return
        const model = this._editor.getModel()
        if (model.tokenization.hasCompleteSemanticTokens()) return // 整篇的已经有了
        if (!isSemanticColoringEnabled(model, this._themeService, this._configurationService) || !hasDocumentRangeSemanticTokensProvider(this._provider, model)) {
            if (model.tokenization.hasSomeSemanticTokens()) model.tokenization.setSemanticTokens(null, false)
            return
        }
        this._outstandingRequests = this._outstandingRequests.concat(this._editor.getVisibleRangesPlusViewportAboveBelow().map(range => this._requestRange(model, Range.lift(range))))
    }

    private _requestRange(model: SemanticModel & FeatureModel, range: Range): CancelablePromise<unknown> {
        const requestVersionId = model.getVersionId()
        const request = createCancelablePromise(token => Promise.resolve(getDocumentRangeSemanticTokens(this._provider, model, range, token)))
        const t0 = Date.now()
        request.then(r => {
            this._debounceInformation.update(model, Date.now() - t0)
            if (!r || !r.tokens || model.isDisposed() || model.getVersionId() !== requestVersionId) return // 回来时文档变了:作废
            const styling = this._stylingService.getStyling(r.provider)
            model.tokenization.setPartialSemanticTokens(range, toMultilineTokens2(r.tokens, styling, model.getLanguageId()))
        }).then(() => this._removeOutstandingRequest(request), () => this._removeOutstandingRequest(request))
        return request
    }
}
