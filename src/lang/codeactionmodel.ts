// CodeActionModel:何时该问 code action provider(移植自 vscode editor/contrib/codeAction/browser/codeActionModel.ts)。
//
// 状态机 Empty / Triggered:
//   · 触发源:marker 变了(只认当前 model 的 uri)、光标动了 → 250ms 去抖后自动触发(Auto);或外部 trigger()(Invoke)
//   · 自动触发受 lightbulb.enabled 管:off 不触发;onCode 时光标被空白夹住 / 空行不触发
//   · model / 语言 / provider 注册表 / lightbulb 选项变了、或编辑器只读 → 重置并重新评估
//   · 新状态替换旧状态时取消旧请求;手动 → 自动的状态过渡延后 500ms(别把用户刚打开的菜单冲掉)
//   · includeNearbyQuickFixes(配置)开启时,手动 quickfix 同行的 marker 附近也问一遍
// 无 DI:构造参数与 Monaco 同序 (editor, registry, markerService, contextKeyService, progressService?, configurationService?)。
import type { IDisposable, LiteMonacoEditor } from '../api/types'
import { Emitter } from '../api/context'
import { Position, Selection } from '../api/position'
import { EditorOption, ShowLightbulbIconMode } from '../core/options'
import { createCancelablePromise, isCancellationError, TimeoutTimer, type CancelablePromise } from './async'
import type { LanguageFeatureRegistry } from './languagefeatures'
import {
    CodeActionKind, CodeActionTriggerSource, CodeActionTriggerType, HierarchicalKind, getCodeActions,
    type CodeActionProvider, type CodeActionSet, type CodeActionTrigger,
} from './codeaction'

export const SUPPORTED_CODE_ACTIONS = 'supportedCodeAction'
export const APPLY_FIX_ALL_COMMAND_ID = '_typescript.applyFixAllCodeAction'

/** Monaco IMarkerService 里这里要用的两个口子 */
export interface CodeActionMarkerSource {
    onMarkerChanged(listener: (resources: readonly { toString(): string }[]) => void): IDisposable
    read(filter: { resource: unknown }): ReadonlyArray<{ startLineNumber: number, endLineNumber: number, endColumn: number, relatedInformation?: unknown }>
}
export interface CodeActionContextKeys { createKey(key: string, defaultValue: string): { set(v: string): void, reset(): void } }
export interface CodeActionProgress { showWhile(promise: Promise<unknown>, delay: number): unknown }
export interface CodeActionConfig { getValue(key: string, overrides?: { resource?: unknown }): unknown }

type TriggeredCodeAction = { readonly selection: Selection, readonly trigger: CodeActionTrigger }

class CodeActionOracle implements IDisposable {
    private readonly _autoTriggerTimer = new TimeoutTimer()
    private readonly _subs: IDisposable[]

    constructor(
        private readonly _editor: LiteMonacoEditor,
        markerService: CodeActionMarkerSource,
        private readonly _signalChange: (triggered: TriggeredCodeAction | undefined) => void,
        private readonly _delay: number = 250,
    ) {
        this._subs = [
            markerService.onMarkerChanged(e => this._onMarkerChanges(e)),
            _editor.onDidChangeCursorPosition(() => this._tryAutoTrigger()),
        ]
    }
    dispose() { this._autoTriggerTimer.dispose(); for (const s of this._subs) s.dispose() }

    trigger(trigger: CodeActionTrigger): void {
        const selection = this._getRangeOfSelectionUnlessWhitespaceEnclosed(trigger)
        this._signalChange(selection ? { trigger, selection } : undefined)
    }

    private _onMarkerChanges(resources: readonly { toString(): string }[]): void {
        const model = this._editor.getModel()
        if (model && resources.some(r => r.toString() === model.uri.toString())) this._tryAutoTrigger()
    }

    private _tryAutoTrigger() {
        this._autoTriggerTimer.cancelAndSet(() => this.trigger({ type: CodeActionTriggerType.Auto, triggerAction: CodeActionTriggerSource.Default }), this._delay)
    }

    private _getRangeOfSelectionUnlessWhitespaceEnclosed(trigger: CodeActionTrigger): Selection | undefined {
        if (!this._editor.hasModel()) return undefined
        const selection = this._editor.getSelection()!
        if (trigger.type === CodeActionTriggerType.Invoke) return selection
        const enabled = (this._editor.getOption(EditorOption.lightbulb) as { enabled?: ShowLightbulbIconMode }).enabled
        if (enabled === ShowLightbulbIconMode.Off) return undefined
        if (enabled === ShowLightbulbIconMode.OnCode) {
            if (!selection.isEmpty()) return selection
            const model = this._editor.getModel()!
            const { lineNumber, column } = selection.getPosition()
            const line = model.getLineContent(lineNumber)
            if (line.length === 0) return undefined // 空行
            if (column === 1) { if (/\s/.test(line[0])) return undefined } // 只看右边
            else if (column === model.getLineMaxColumn(lineNumber)) { if (/\s/.test(line[line.length - 1])) return undefined } // 只看左边
            else if (/\s/.test(line[column - 2]) && /\s/.test(line[column - 1])) return undefined // 两边都是空白
        }
        return selection
    }
}

export namespace CodeActionsState {
    export const enum Type { Empty, Triggered }
    export const Empty = { type: Type.Empty } as const

    export class Triggered {
        readonly type = Type.Triggered
        readonly actions: Promise<CodeActionSet>
        constructor(readonly trigger: CodeActionTrigger, readonly position: Position, private readonly _cancellablePromise: CancelablePromise<CodeActionSet>) {
            this.actions = _cancellablePromise.catch((e): CodeActionSet => {
                if (isCancellationError(e)) return emptyCodeActionSet
                throw e
            })
        }
        cancel() { this._cancellablePromise.cancel() }
    }
    export type State = typeof Empty | Triggered
}

const emptyCodeActionSet = Object.freeze<CodeActionSet>({
    allActions: [], validActions: [], dispose: () => { }, documentation: [], hasAutoFix: false, hasAIFix: false, allAIFixes: false,
})

const noProgress = { report() { } }

export class CodeActionModel implements IDisposable {
    private _oracle: CodeActionOracle | undefined
    private _state: CodeActionsState.State = CodeActionsState.Empty
    private readonly _supportedCodeActions: { set(v: string): void, reset(): void }
    private readonly _onDidChangeState = new Emitter<CodeActionsState.State>()
    readonly onDidChangeState = this._onDidChangeState.event
    private _codeActionsDisposable: IDisposable | undefined
    private readonly _subs: IDisposable[]
    private _disposed = false

    constructor(
        private readonly _editor: LiteMonacoEditor,
        private readonly _registry: LanguageFeatureRegistry<CodeActionProvider>,
        private readonly _markerService: CodeActionMarkerSource,
        contextKeyService: CodeActionContextKeys,
        private readonly _progressService?: CodeActionProgress,
        private readonly _configurationService?: CodeActionConfig,
    ) {
        this._supportedCodeActions = contextKeyService.createKey(SUPPORTED_CODE_ACTIONS, '')
        this._subs = [
            _editor.onDidChangeModel(() => this._update()),
            _editor.onDidChangeModelLanguage(() => this._update()),
            _registry.onDidChange(() => this._update()),
            _editor.onDidChangeConfiguration(e => { if (e.hasChanged(EditorOption.lightbulb)) this._update() }),
        ]
        this._update()
    }

    dispose(): void {
        if (this._disposed) return
        this._disposed = true
        for (const s of this._subs) s.dispose()
        this._oracle?.dispose()
        this._oracle = undefined
        this._codeActionsDisposable?.dispose()
        this._codeActionsDisposable = undefined
        this._onDidChangeState.dispose()
        this.setState(CodeActionsState.Empty, true)
    }

    private _setActionsDisposable(d: IDisposable | undefined) {
        if (this._codeActionsDisposable !== d) this._codeActionsDisposable?.dispose()
        this._codeActionsDisposable = d
    }

    private _settingEnabledNearbyQuickfixes(): boolean {
        const model = this._editor.getModel()
        return this._configurationService ? !!this._configurationService.getValue('editor.codeActionWidget.includeNearbyQuickFixes', { resource: model?.uri }) : false
    }

    private _update(): void {
        if (this._disposed) return
        this._oracle?.dispose()
        this._oracle = undefined
        this.setState(CodeActionsState.Empty)

        const model = this._editor.getModel()
        if (!(model && this._registry.has(model) && !this._editor.getOption(EditorOption.readOnly))) {
            this._supportedCodeActions.reset()
            return
        }
        const supported = this._registry.all(model).flatMap(p => p.providedCodeActionKinds ?? [])
        this._supportedCodeActions.set(supported.join(' '))

        this._oracle = new CodeActionOracle(this._editor, this._markerService, trigger => {
            if (!trigger) { this.setState(CodeActionsState.Empty); return }
            const startPosition = trigger.selection.getStartPosition()
            const actions = createCancelablePromise(token => this._request(model as never, trigger, token))
            if (trigger.trigger.type === CodeActionTriggerType.Invoke) this._progressService?.showWhile(actions, 250)
            const newState = new CodeActionsState.Triggered(trigger.trigger, startPosition, actions)

            // 当前是手动、新来的是自动(且位置变了):不立刻顶掉,延后重置
            const manualToAuto = this._state.type === CodeActionsState.Type.Triggered
                && this._state.trigger.type === CodeActionTriggerType.Invoke
                && newState.trigger.type === CodeActionTriggerType.Auto
                && this._state.position !== newState.position
            if (!manualToAuto) this.setState(newState)
            else setTimeout(() => this.setState(newState), 500)
        })
        this._oracle.trigger({ type: CodeActionTriggerType.Auto, triggerAction: CodeActionTriggerSource.Default })
    }

    private async _request(model: Parameters<typeof getCodeActions>[1], trigger: TriggeredCodeAction, token: Parameters<typeof getCodeActions>[5]): Promise<CodeActionSet> {
        const t = trigger.trigger
        if (this._settingEnabledNearbyQuickfixes() && t.type === CodeActionTriggerType.Invoke && (t.triggerAction === CodeActionTriggerSource.QuickFix || t.filter?.include?.contains(CodeActionKind.QuickFix))) {
            const nearby = await this._requestNearbyQuickFixes(model, trigger, token)
            if (nearby) return nearby
        }
        const set = await getCodeActions(this._registry, model, trigger.selection, t, noProgress, token)
        this._setActionsDisposable(set)
        return set
    }

    /** 同行 marker 附近的 quickfix:没找到返回 undefined(退回常规路径) */
    private async _requestNearbyQuickFixes(model: Parameters<typeof getCodeActions>[1], trigger: TriggeredCodeAction, token: Parameters<typeof getCodeActions>[5]): Promise<CodeActionSet | undefined> {
        const t = trigger.trigger
        const set = await getCodeActions(this._registry, model, trigger.selection, t, noProgress, token)
        this._setActionsDisposable(set)
        const allCodeActions = [...set.allActions]
        if (token.isCancellationRequested) { set.dispose(); return emptyCodeActionSet }

        // 现有结果里有非 AI 的 quickfix 就够了;只有 AI 的话继续找同行 marker
        const foundQuickfix = set.validActions.some(a => a.action.kind && CodeActionKind.QuickFix.contains(new HierarchicalKind(a.action.kind)) && !a.action.isAI)
        const allMarkers = this._markerService.read({ resource: model.uri })
        const keepDisposable = () => { this._setActionsDisposable(set) }
        const markFixAll = (items: readonly { action: { command?: { arguments?: unknown[] }, diagnostics?: unknown[] } }[]) => {
            for (const a of items) if (a.action.command?.arguments?.some(arg => typeof arg === 'string' && arg.includes(APPLY_FIX_ALL_COMMAND_ID))) a.action.diagnostics = allMarkers.filter(m => m.relatedInformation) as never
        }
        if (foundQuickfix) {
            markFixAll(set.validActions)
            return { validActions: set.validActions, allActions: allCodeActions as never, documentation: set.documentation, hasAutoFix: set.hasAutoFix, hasAIFix: set.hasAIFix, allAIFixes: set.allAIFixes, dispose: keepDisposable }
        }
        if (allMarkers.length === 0) return undefined

        const curr = trigger.selection.getPosition()
        let distance = Number.MAX_VALUE
        const current = [...set.validActions]
        for (const marker of allMarkers) {
            const col = marker.endColumn, row = marker.endLineNumber, startRow = marker.startLineNumber
            if (row !== curr.lineNumber && startRow !== curr.lineNumber) continue // 同行才算
            const tracked = new Position(row, col)
            const nt: CodeActionTrigger = {
                type: t.type, triggerAction: t.triggerAction,
                filter: { include: t.filter?.include ? t.filter.include : CodeActionKind.QuickFix },
                autoApply: t.autoApply,
                context: { notAvailableMessage: t.context?.notAvailableMessage || '', position: tracked },
            }
            const at = await getCodeActions(this._registry, model, new Selection(tracked.lineNumber, tracked.column, tracked.lineNumber, tracked.column), nt, noProgress, token)
            if (token.isCancellationRequested) { at.dispose(); return emptyCodeActionSet }
            if (at.validActions.length !== 0) {
                markFixAll(at.validActions)
                if (set.allActions.length === 0) allCodeActions.push(...at.allActions)
                // 离光标更近的 marker 的 fix 排前面
                if (Math.abs(curr.column - col) < distance) current.unshift(...at.validActions)
                else current.push(...at.validActions)
            }
            distance = Math.abs(curr.column - col)
        }
        const filtered = current.filter((a, i, self) => self.findIndex(b => b.action.title === a.action.title) === i)
        filtered.sort((a, b) => {
            if (a.action.isPreferred && !b.action.isPreferred) return -1
            if (!a.action.isPreferred && b.action.isPreferred) return 1
            if (a.action.isAI && !b.action.isAI) return 1
            if (!a.action.isAI && b.action.isAI) return -1
            return 0
        })
        return { validActions: filtered, allActions: allCodeActions as never, documentation: set.documentation, hasAutoFix: set.hasAutoFix, hasAIFix: set.hasAIFix, allAIFixes: set.allAIFixes, dispose: keepDisposable }
    }

    trigger(trigger: CodeActionTrigger) {
        this._oracle?.trigger(trigger)
        this._setActionsDisposable(undefined)
    }

    private setState(newState: CodeActionsState.State, skipNotify?: boolean) {
        if (newState === this._state) return
        // 取消旧请求
        if (this._state.type === CodeActionsState.Type.Triggered) this._state.cancel()
        this._state = newState
        if (!skipNotify && !this._disposed) this._onDidChangeState.fire(newState)
    }
}
