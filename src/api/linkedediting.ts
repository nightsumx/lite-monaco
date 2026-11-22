// 联动编辑(移植自 VS Code editor/contrib/linkedEditing/browser/linkedEditing.ts)。
//
// 光标落在 LinkedEditingRangeProvider 给出的一组区间之一里时,把这组区间挂成装饰(第 0 个 = 参考区间,即光标所在那个);
// 在参考区间里的编辑(输入 / 删除 / 粘贴 / 撤销…)随后同步到其余区间(镜像区间只改与参考值不同的那一段)。
// 参考值不再符合词模式(provider 给的 wordPattern,没有就用语言的 wordPattern)= 打破联动,清掉区间。
//
// 与 tsjsx.ts 的 JSX 标签联动是两条独立路径:那条问 TS 语言服务,这条走通用 provider 协议(任何语言都能 registerLinkedEditingRangeProvider)。
// 没有 DI:构造参数 (editor, contextKeyService?, languageFeaturesService?),缺省取 editor 自己的 context key 服务和全局 languageFeatures。
import type { IDisposable, LiteMonacoEditor } from './types'
import { Position, Range } from './position'
import type { IPosition, IRange } from './position'
import { EditorOption } from '../core/options'
import { getContextKeyService, type IContextKey } from './contextkeys'
import { getWordDefinition } from './languages'
import type { IEditorDecorationsCollection } from './decorations'
import {
    languageFeatures, type LanguageFeatureRegistry, type LinkedEditingRangeProvider, type LinkedEditingRanges, type LanguageFeaturesService,
} from '../lang/languagefeatures'
import { CancellationTokenSource, Delayer, first } from '../lang/async'

export const CONTEXT_ONTYPE_RENAME_INPUT_VISIBLE = 'LinkedEditingInputVisible'
const DECORATION_CLASS_NAME = 'linked-editing-decoration'
/** TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges */
const ALWAYS_GROWS = 0

const commonPrefixLength = (a: string, b: string): number => { let i = 0; const n = Math.min(a.length, b.length); while (i < n && a.charCodeAt(i) === b.charCodeAt(i)) i++; return i }
const commonSuffixLength = (a: string, b: string): number => { let i = 0; const n = Math.min(a.length, b.length); while (i < n && a.charCodeAt(a.length - 1 - i) === b.charCodeAt(b.length - 1 - i)) i++; return i }

/** 按优先级问 provider,第一个给出非空 ranges 的算数(Monaco getLinkedEditingRanges) */
export function getLinkedEditingRanges(
    providers: LanguageFeatureRegistry<LinkedEditingRangeProvider>, model: Parameters<LanguageFeatureRegistry<unknown>['ordered']>[0], position: IPosition, token: CancellationTokenSource['token'],
): Promise<LinkedEditingRanges | undefined | null> {
    const ordered = providers.ordered(model)
    return first<LinkedEditingRanges | undefined | null>(ordered.map(provider => async () => {
        try { return await provider.provideLinkedEditingRanges(model, position, token) }
        catch (e) { console.error(e); return undefined }
    }), r => !!r && Array.isArray(r.ranges) && r.ranges.length > 0)
}

/** 每个编辑器只留一个联动贡献:后建的顶替先建的(宿主自动装配的那份让位给手动实例化的) */
const SLOT = Symbol.for('lite-monaco.linkedEditing')

export class LinkedEditingContribution implements IDisposable {
    static readonly ID = 'editor.contrib.linkedEditing'

    static get(editor: LiteMonacoEditor): LinkedEditingContribution | null {
        return (editor as unknown as Record<symbol, LinkedEditingContribution | undefined>)[SLOT] ?? null
    }

    private _debounceDuration: number | undefined
    private readonly _providers: LanguageFeatureRegistry<LinkedEditingRangeProvider>
    private _enabled = false
    private readonly _visibleContextKey: IContextKey<boolean>
    private _rangeUpdateTriggerPromise: Promise<unknown> | null = null
    private _rangeSyncTriggerPromise: Promise<unknown> | null = null
    private _currentRequestCts: CancellationTokenSource | null = null
    private _currentRequestPosition: Position | null = null
    private _currentRequestModelVersion: number | null = null
    private _currentDecorations: IEditorDecorationsCollection // 下标 0 是参考区间
    private _syncRangesToken = 0
    private _languageWordPattern: RegExp | null = null
    private _currentWordPattern: RegExp | null = null
    private _ignoreChangeEvent = false
    private _local: IDisposable[] = []
    private readonly _subs: IDisposable[] = []
    private _disposed = false

    constructor(
        private readonly _editor: LiteMonacoEditor,
        contextKeyService?: { createKey(key: string, defaultValue: boolean): IContextKey<boolean> },
        languageFeaturesService?: Pick<LanguageFeaturesService, 'linkedEditingRangeProvider'>,
    ) {
        const prev = LinkedEditingContribution.get(_editor)
        if (prev) prev.dispose()
        ;(_editor as unknown as Record<symbol, unknown>)[SLOT] = this

        this._providers = (languageFeaturesService ?? languageFeatures).linkedEditingRangeProvider
        const ctxKeys: { createKey(key: string, defaultValue: boolean): IContextKey<boolean> } = contextKeyService ?? getContextKeyService(_editor)
        this._visibleContextKey = ctxKeys.createKey(CONTEXT_ONTYPE_RENAME_INPUT_VISIBLE, false)
        this._currentDecorations = _editor.createDecorationsCollection()

        this._subs.push(_editor.onDidChangeModel(() => this.reinitialize(true)))
        this._subs.push(_editor.onDidChangeConfiguration(e => {
            if (e.hasChanged(EditorOption.linkedEditing) || e.hasChanged(EditorOption.renameOnType)) this.reinitialize(false)
        }))
        this._subs.push(this._providers.onDidChange(() => this.reinitialize(false)))
        this._subs.push(_editor.onDidChangeModelLanguage(() => this.reinitialize(true)))
        this.reinitialize(true)
    }

    private reinitialize(forceRefresh: boolean): void {
        if (this._disposed) return
        const model = this._editor.getModel()
        const isEnabled = model !== null && !!(this._editor.getOption(EditorOption.linkedEditing) || this._editor.getOption(EditorOption.renameOnType)) && this._providers.has(model)
        if (isEnabled === this._enabled && !forceRefresh) return
        this._enabled = isEnabled
        this.clearRanges()
        this._clearLocal()
        if (!isEnabled || model === null) return

        const readWordPattern = () => { this._languageWordPattern = getWordDefinition(model.getLanguageId()) }
        readWordPattern()
        this._local.push(model.onDidChangeLanguageConfiguration(readWordPattern))

        const rangeUpdateScheduler = new Delayer<unknown>(this._debounceDuration ?? 50)
        const triggerRangeUpdate = () => {
            this._rangeUpdateTriggerPromise = rangeUpdateScheduler.trigger(() => this.updateRanges(), this._debounceDuration ?? 50)
        }
        const rangeSyncScheduler = new Delayer<unknown>(0)
        const triggerRangeSync = (token: number) => {
            this._rangeSyncTriggerPromise = rangeSyncScheduler.trigger(() => this._syncRanges(token))
        }
        this._local.push(this._editor.onDidChangeCursorPosition(() => triggerRangeUpdate()))
        this._local.push(this._editor.onDidChangeModelContent(e => {
            if (!this._ignoreChangeEvent) {
                if (this._currentDecorations.length > 0) {
                    const referenceRange = this._currentDecorations.getRange(0)
                    if (referenceRange && e.changes.every(c => referenceRange.intersectRanges(c.range))) {
                        triggerRangeSync(this._syncRangesToken)
                        return
                    }
                }
            }
            triggerRangeUpdate()
        }))
        this._local.push({ dispose: () => { rangeUpdateScheduler.dispose(); rangeSyncScheduler.dispose() } })
        void this.updateRanges()
    }

    private _clearLocal(): void { for (const d of this._local.splice(0)) d.dispose() }

    private _syncRanges(token: number): void {
        // 延迟执行:确认现场没变
        if (this._disposed || !this._editor.hasModel() || token !== this._syncRangesToken || this._currentDecorations.length === 0) return
        const model = this._editor.getModel()!
        const referenceRange = this._currentDecorations.getRange(0)
        if (!referenceRange || referenceRange.startLineNumber !== referenceRange.endLineNumber) return this.clearRanges()

        const referenceValue = model.getValueInRange(referenceRange)
        if (this._currentWordPattern) {
            const match = referenceValue.match(this._currentWordPattern)
            const matchLength = match ? match[0].length : 0
            if (matchLength !== referenceValue.length) return this.clearRanges()
        }

        const edits: { range: IRange, text: string }[] = []
        for (let i = 1, len = this._currentDecorations.length; i < len; i++) {
            const mirrorRange = this._currentDecorations.getRange(i)
            if (!mirrorRange) continue
            if (mirrorRange.startLineNumber !== mirrorRange.endLineNumber) {
                edits.push({ range: mirrorRange, text: referenceValue })
                continue
            }
            let oldValue = model.getValueInRange(mirrorRange)
            let newValue = referenceValue
            let rangeStartColumn = mirrorRange.startColumn
            let rangeEndColumn = mirrorRange.endColumn

            const prefix = commonPrefixLength(oldValue, newValue)
            rangeStartColumn += prefix
            oldValue = oldValue.substr(prefix)
            newValue = newValue.substr(prefix)

            const suffix = commonSuffixLength(oldValue, newValue)
            rangeEndColumn -= suffix
            oldValue = oldValue.substr(0, oldValue.length - suffix)
            newValue = newValue.substr(0, newValue.length - suffix)

            if (rangeStartColumn !== rangeEndColumn || newValue.length !== 0) {
                edits.push({ range: new Range(mirrorRange.startLineNumber, rangeStartColumn, mirrorRange.endLineNumber, rangeEndColumn), text: newValue })
            }
        }
        if (edits.length === 0) return

        try {
            // 并进刚才那一笔编辑的撤销步:Ctrl+Z 一次撤掉输入和它的联动
            this._editor.popUndoStop()
            this._ignoreChangeEvent = true
            this._editor.executeEdits('linkedEditing', edits)
        } finally {
            this._ignoreChangeEvent = false
        }
    }

    dispose(): void {
        if (this._disposed) return
        this.clearRanges()
        this._disposed = true
        this._clearLocal()
        for (const s of this._subs.splice(0)) s.dispose()
        this._visibleContextKey.reset()
        if (LinkedEditingContribution.get(this._editor) === this) (this._editor as unknown as Record<symbol, unknown>)[SLOT] = undefined
    }

    clearRanges(): void {
        this._visibleContextKey.set(false)
        this._currentDecorations.clear()
        if (this._currentRequestCts) {
            this._currentRequestCts.cancel()
            this._currentRequestCts = null
            this._currentRequestPosition = null
        }
    }

    get currentUpdateTriggerPromise(): Promise<unknown> { return this._rangeUpdateTriggerPromise || Promise.resolve() }
    get currentSyncTriggerPromise(): Promise<unknown> { return this._rangeSyncTriggerPromise || Promise.resolve() }

    async updateRanges(force = false): Promise<void> {
        if (this._disposed) return
        if (!this._editor.hasModel()) { this.clearRanges(); return }
        const position = this._editor.getPosition()!
        if ((!this._enabled && !force) || this._editor.getSelections()!.length > 1) {
            // 没开 / 多光标
            this.clearRanges()
            return
        }

        const model = this._editor.getModel()!
        const modelVersionId = model.getVersionId()
        if (this._currentRequestPosition && this._currentRequestModelVersion === modelVersionId) {
            if (position.equals(this._currentRequestPosition)) return // 同一位置
            if (this._currentDecorations.length > 0) {
                const range = this._currentDecorations.getRange(0)
                if (range && range.containsPosition(position)) return // 只是在参考区间里移动
            }
        }
        if (!this._currentRequestPosition?.equals(position)) {
            const currentRange = this._currentDecorations.getRange(0)
            // 新位置不在参考区间里:算新结果期间先清掉旧装饰
            if (!currentRange?.containsPosition(position)) this.clearRanges()
        }

        this._currentRequestPosition = position
        this._currentRequestModelVersion = modelVersionId

        const currentRequestCts = this._currentRequestCts = new CancellationTokenSource()
        try {
            const response = await getLinkedEditingRanges(this._providers, model, position, currentRequestCts.token)
            if (currentRequestCts !== this._currentRequestCts) return
            this._currentRequestCts = null
            if (modelVersionId !== model.getVersionId()) return

            const ranges: IRange[] = response?.ranges ? [...response.ranges] : []
            this._currentWordPattern = response?.wordPattern || this._languageWordPattern

            let foundReferenceRange = false
            for (let i = 0, len = ranges.length; i < len; i++) {
                if (Range.containsPosition(ranges[i], position)) {
                    foundReferenceRange = true
                    if (i !== 0) { const ref = ranges[i]; ranges.splice(i, 1); ranges.unshift(ref) }
                    break
                }
            }
            if (!foundReferenceRange) {
                // 光标不在任何区间里:联动不成立
                this.clearRanges()
                return
            }

            this._visibleContextKey.set(true)
            this._currentDecorations.set(ranges.map(range => ({ range, options: { description: 'linked-editing', stickiness: ALWAYS_GROWS, className: DECORATION_CLASS_NAME } })))
            this._syncRangesToken++ // 作废还没跑的 syncRanges
        } catch (err) {
            console.error(err)
            if (this._currentRequestCts === currentRequestCts || !this._currentRequestCts) this.clearRanges() // 仍是最新请求才收摊
        }
    }

    /** 测试用:去抖时长 */
    setDebounceDuration(timeInMS: number): void { this._debounceDuration = timeInMS }
}

/** 编辑器级装配:linkedEditing 选项开着且有 provider 时才起作用;每个编辑器一份 */
export function installLinkedEditing(view: LiteMonacoEditor): void {
    // 编辑器 API 此刻还没合并到 view 上(装配最后一步),推迟到下一个微任务
    queueMicrotask(() => {
        if ((view as unknown as { destroyed?: boolean }).destroyed) return
        if (LinkedEditingContribution.get(view)) return
        const c = new LinkedEditingContribution(view)
        view.onDestroy(() => c.dispose())
    })
}
