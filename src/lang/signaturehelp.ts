// 参数提示的 provider 协议 + ParameterHintsModel(移植自 VS Code editor/contrib/parameterHints/browser)。
//
// 数据:provider 注册表(languageFeatures.signatureHelpProvider)→ provideSignatureHelp 按优先级问到第一个有结果的 →
// ParameterHintsModel 是 Default / Pending / Active 三态机:打字命中触发字符、已开着时命中重触发字符、内容或光标变化(已开着)、
// 显式 trigger 都进 120ms 的节流 Delayer,合并成一次请求;回来时 triggerId 对不上就丢弃(又触发了新的)。
// 渲染不在这里:模型只发 onChangedHints(SignatureHelp | undefined),卡片由 api/parameterhints.ts 画。
import type { IDisposable } from './providers'
import type { LiteMonacoEditor } from '../api/types'
import { Position } from '../api/position'
import type { IPosition } from '../api/position'
import { CharacterSet } from '../core/model/characterclassifier'
import { languageFeatures, type FeatureModel, type LanguageFeatureRegistry } from './languagefeatures'
import { CancellationNone, createCancelablePromise, Delayer, isCancellationError, type CancelablePromise, type CancellationToken } from './async'

/** Monaco languages.SignatureHelpTriggerKind(数值与 Monaco 一致) */
export enum SignatureHelpTriggerKind { Invoke = 1, TriggerCharacter = 2, ContentChange = 3 }

export interface ParameterInformation { label: string | [number, number], documentation?: string | { value: string } }
export interface SignatureInformation {
    label: string
    documentation?: string | { value: string }
    parameters: ParameterInformation[]
    activeParameter?: number
}
export interface SignatureHelp { signatures: SignatureInformation[], activeSignature: number, activeParameter: number }
export interface SignatureHelpResult extends IDisposable { value: SignatureHelp }
export interface SignatureHelpContext {
    readonly triggerKind: SignatureHelpTriggerKind
    readonly triggerCharacter?: string
    readonly isRetrigger: boolean
    readonly activeSignatureHelp?: SignatureHelp
}
export interface SignatureHelpProvider {
    readonly signatureHelpTriggerCharacters?: ReadonlyArray<string>
    readonly signatureHelpRetriggerCharacters?: ReadonlyArray<string>
    provideSignatureHelp(model: unknown, position: Position, token: CancellationToken, context: SignatureHelpContext): SignatureHelpResult | undefined | null | PromiseLike<SignatureHelpResult | undefined | null>
}

/** 按优先级问 provider,第一个给出结果的算数;provider 抛错只记日志,继续问下一个 */
export async function provideSignatureHelp(
    registry: LanguageFeatureRegistry<SignatureHelpProvider>, model: FeatureModel, position: IPosition,
    context: SignatureHelpContext, token: CancellationToken = CancellationNone,
): Promise<SignatureHelpResult | undefined> {
    const pos = position instanceof Position ? position : new Position(position.lineNumber, position.column)
    for (const support of registry.ordered(model)) {
        try {
            const result = await support.provideSignatureHelp(model, pos, token, context)
            if (result) return result
        } catch (err) { console.error(err) }
    }
    return undefined
}

export interface TriggerContext { readonly triggerKind: SignatureHelpTriggerKind, readonly triggerCharacter?: string }

const enum StateType { Default, Active, Pending }
type State =
    | { readonly type: StateType.Default }
    | { readonly type: StateType.Pending, readonly request: CancelablePromise<SignatureHelpResult | undefined | null>, readonly previouslyActiveHints: SignatureHelp | undefined }
    | { readonly type: StateType.Active, readonly hints: SignatureHelp }
const DEFAULT_STATE: State = { type: StateType.Default }

type Listener<T> = (e: T) => void

export class ParameterHintsModel implements IDisposable {
    static readonly DEFAULT_DELAY = 120 // ms

    private readonly listeners = new Set<Listener<SignatureHelp | undefined>>()
    readonly onChangedHints = (fn: Listener<SignatureHelp | undefined>): IDisposable => {
        this.listeners.add(fn)
        return { dispose: () => { this.listeners.delete(fn) } }
    }

    private triggerOnType = false
    private _state: State = DEFAULT_STATE
    private _pendingTriggers: TriggerContext[] = []
    private lastResult: SignatureHelpResult | undefined
    private readonly triggerChars = new CharacterSet()
    private readonly retriggerChars = new CharacterSet()
    private readonly throttledDelayer: Delayer<boolean>
    private triggerId = 0
    private readonly subs: IDisposable[] = []

    constructor(
        private readonly editor: LiteMonacoEditor,
        private readonly providers: LanguageFeatureRegistry<SignatureHelpProvider> = languageFeatures.signatureHelpProvider,
        delay: number = ParameterHintsModel.DEFAULT_DELAY,
    ) {
        this.throttledDelayer = new Delayer(delay)
        const e = editor
        this.subs.push(
            e.onDidBlurEditorWidget(() => this.cancel()),
            e.onDidChangeConfiguration(() => this.onEditorConfigurationChange()),
            e.onDidChangeModel(() => this.onModelChanged()),
            e.onDidChangeModelLanguage(() => this.onModelChanged()),
            e.onDidChangeCursorSelection(ev => this.onCursorChange(ev)),
            e.onDidChangeModelContent(() => this.onModelContentChange()),
            providers.onDidChange(() => this.onModelChanged()),
            e.onDidType(text => this.onDidType(text)),
        )
        this.onEditorConfigurationChange()
        this.onModelChanged()
    }

    private get state(): State { return this._state }
    private set state(value: State) {
        if (this._state.type === StateType.Pending) this._state.request.cancel()
        this._state = value
    }

    private fire(h: SignatureHelp | undefined): void { for (const l of [...this.listeners]) l(h) }

    cancel(silent = false): void {
        this.state = DEFAULT_STATE
        this.throttledDelayer.cancel()
        if (!silent) this.fire(undefined)
    }

    trigger(context: TriggerContext, delay?: number): void {
        const model = this.editor.getModel()
        if (!model || !this.providers.has(model)) return
        const triggerId = ++this.triggerId
        this._pendingTriggers.push(context)
        this.throttledDelayer.trigger(() => this.doTrigger(triggerId), delay).catch(err => { if (!isCancellationError(err)) console.error(err) })
    }

    next(): void {
        if (this.state.type !== StateType.Active) return
        const length = this.state.hints.signatures.length
        const activeSignature = this.state.hints.activeSignature
        const last = (activeSignature % length) === (length - 1)
        const cycle = this.editor.getOption('parameterHints').cycle
        // 只有一个签名、或已在最后一个且不循环 → 关
        if ((length < 2 || last) && !cycle) { this.cancel(); return }
        this.updateActiveSignature(last && cycle ? 0 : activeSignature + 1)
    }

    previous(): void {
        if (this.state.type !== StateType.Active) return
        const length = this.state.hints.signatures.length
        const activeSignature = this.state.hints.activeSignature
        const first = activeSignature === 0
        const cycle = this.editor.getOption('parameterHints').cycle
        if ((length < 2 || first) && !cycle) { this.cancel(); return }
        this.updateActiveSignature(first && cycle ? length - 1 : activeSignature - 1)
    }

    private updateActiveSignature(activeSignature: number): void {
        if (this.state.type !== StateType.Active) return
        const active: State = { type: StateType.Active, hints: { ...this.state.hints, activeSignature } }
        this.state = active
        this.fire(active.hints)
    }

    private async doTrigger(triggerId: number): Promise<boolean> {
        const isRetrigger = this.state.type === StateType.Active || this.state.type === StateType.Pending
        const activeSignatureHelp = this.getLastActiveHints()
        this.cancel(true)
        if (this._pendingTriggers.length === 0) return false
        const context = this._pendingTriggers.reduce(mergeTriggerContexts)
        this._pendingTriggers = []
        const triggerContext: SignatureHelpContext = {
            triggerKind: context.triggerKind, triggerCharacter: context.triggerCharacter, isRetrigger, activeSignatureHelp,
        }
        if (!this.editor.hasModel()) return false
        const model = this.editor.getModel()!
        const position = this.editor.getPosition()!
        const request = createCancelablePromise(token => provideSignatureHelp(this.providers, model, position, triggerContext, token))
        this.state = { type: StateType.Pending, request, previouslyActiveHints: activeSignatureHelp }
        try {
            const result = await request
            // 回来时已经有更新的触发:这个结果作废
            if (triggerId !== this.triggerId) { result?.dispose(); return false }
            if (!result || !result.value.signatures || result.value.signatures.length === 0) {
                result?.dispose()
                this.clearLast()
                this.cancel()
                return false
            }
            this.state = { type: StateType.Active, hints: result.value }
            this.clearLast()
            this.lastResult = result
            this.fire(result.value)
            return true
        } catch (error) {
            if (triggerId === this.triggerId) this.state = DEFAULT_STATE
            if (!isCancellationError(error)) console.error(error)
            return false
        }
    }

    private clearLast(): void { const r = this.lastResult; this.lastResult = undefined; r?.dispose() }

    private getLastActiveHints(): SignatureHelp | undefined {
        switch (this.state.type) {
            case StateType.Active: return this.state.hints
            case StateType.Pending: return this.state.previouslyActiveHints
            default: return undefined
        }
    }

    private get isTriggered(): boolean {
        return this.state.type === StateType.Active || this.state.type === StateType.Pending || this.throttledDelayer.isTriggered()
    }

    private onModelChanged(): void {
        this.cancel()
        this.triggerChars.clear()
        this.retriggerChars.clear()
        const model = this.editor.getModel()
        if (!model) return
        for (const support of this.providers.ordered(model)) {
            for (const ch of support.signatureHelpTriggerCharacters || []) {
                if (ch.length) {
                    const code = ch.charCodeAt(0)
                    this.triggerChars.add(code)
                    // 所有触发字符同时也是重触发字符
                    this.retriggerChars.add(code)
                }
            }
            for (const ch of support.signatureHelpRetriggerCharacters || []) if (ch.length) this.retriggerChars.add(ch.charCodeAt(0))
        }
    }

    private onDidType(text: string): void {
        if (!this.triggerOnType || !text) return
        const last = text.length - 1
        const code = text.charCodeAt(last)
        if (this.triggerChars.has(code) || this.isTriggered && this.retriggerChars.has(code)) {
            this.trigger({ triggerKind: SignatureHelpTriggerKind.TriggerCharacter, triggerCharacter: text.charAt(last) })
        }
    }

    private onCursorChange(e: { source: string }): void {
        if (e.source === 'mouse') this.cancel()
        else if (this.isTriggered) this.trigger({ triggerKind: SignatureHelpTriggerKind.ContentChange })
    }

    private onModelContentChange(): void {
        if (this.isTriggered) this.trigger({ triggerKind: SignatureHelpTriggerKind.ContentChange })
    }

    private onEditorConfigurationChange(): void {
        this.triggerOnType = this.editor.getOption('parameterHints').enabled
        if (!this.triggerOnType) this.cancel()
    }

    dispose(): void {
        this.cancel(true)
        this.clearLast()
        this.throttledDelayer.dispose()
        for (const s of this.subs.splice(0)) s.dispose()
    }
}

function mergeTriggerContexts(previous: TriggerContext, current: TriggerContext): TriggerContext {
    // Invoke 压过之前的触发;内容变化不改变已有触发;字符触发取最新
    return current.triggerKind === SignatureHelpTriggerKind.ContentChange ? previous : current
}
