// 行内补全控制器(移植自 inlineCompletions/browser/controller/inlineCompletionsController.ts 的编辑器接线部分)。
//
// 只做三件事:
//   1. 把编辑器事件翻成模型的「记账」调用,用 onBeginUpdate / onEndUpdate 括成一批(批内只 commit 一次)
//   2. 按 Monaco 的规则决定何时 trigger / stop:打字、粘贴、删除类命令 trigger;显式移动光标 stop;失焦 stop
//   3. 把模型状态同步到 context key(inlineSuggestionVisible 等)
// 不画任何 UI(ghost text 的 overlay 在 view.ts,挂 view.dom,绝不进 contenteditable)。
import { Emitter } from '../../api/context'
import { getContextKeyService } from '../../api/contextkeys'
import { executeCommandById } from '../../api/commands'
import { SnippetController2 } from '../../api/snippetcontroller'
import type { IContextKey } from '../../api/contextkeys'
import type { IDisposable, LiteMonacoEditor } from '../../api/types'
import { CursorChangeReason } from '../../core/view/viewapi'
import { languageFeatures, type LanguageFeatureRegistry } from '../languagefeatures'
import { SuggestController } from '../suggestcontroller'
import { InlineCompletionsModel } from './model'
import { SuggestWidgetAdaptor } from './suggestadapter'
import type { InlineCompletionsProvider } from './types'

const SLOT = Symbol.for('lite-monaco.inlineCompletionsController')

export interface InlineCompletionsControllerServices {
    /** 行内补全 provider 注册表;缺省走全局 languageFeatures */
    languageFeatures?: { inlineCompletionsProvider: LanguageFeatureRegistry<InlineCompletionsProvider> }
    /** 片段控制器;缺省取补全控制器的,再缺省现建一个 */
    snippets?: () => Pick<SnippetController2, 'insert' | 'isInSnippet'> | null | undefined
    /** 去抖毫秒。Monaco 的 LanguageFeatureDebounce 配成 {min:50,max:50},恒 50 */
    debounce?: () => number
}

export class InlineCompletionsController implements IDisposable {
    static readonly ID = 'editor.contrib.inlineCompletionsController'

    static get(editor: LiteMonacoEditor): InlineCompletionsController | null {
        return (editor as unknown as Record<symbol, InlineCompletionsController | undefined>)[SLOT] ?? null
    }

    private readonly _subs: IDisposable[] = []
    private readonly _registry: LanguageFeatureRegistry<InlineCompletionsProvider>
    private readonly _adaptor: SuggestWidgetAdaptor
    private readonly _onDidChangeModel = new Emitter<void>()
    private readonly _onDidChangeProviders = new Emitter<void>()
    /** model 换了(readonly 切换 / setModel) */
    readonly onDidChangeModel = this._onDidChangeModel.event
    private _model: InlineCompletionsModel | undefined
    private _modelSubs: IDisposable[] = []
    private _snippets: SnippetController2 | undefined
    private _composing = false
    private _uiDisabled = false
    private _keyVisible: IContextKey<boolean> | undefined
    private _keySuppress: IContextKey<boolean> | undefined
    private _disposed = false

    constructor(readonly editor: LiteMonacoEditor, private readonly services: InlineCompletionsControllerServices = {}) {
        const prev = InlineCompletionsController.get(editor)
        if (prev) prev.dispose()
        ;(editor as unknown as Record<symbol, unknown>)[SLOT] = this
        this._registry = (services.languageFeatures ?? languageFeatures).inlineCompletionsProvider

        const ctx = getContextKeyService(editor as never)
        this._keyVisible = ctx.createKey('inlineSuggestionVisible', false)
        this._keySuppress = ctx.createKey('inlineSuggestionSuppressSuggestions', false)

        this._adaptor = new SuggestWidgetAdaptor(
            editor,
            () => this._model?.selectedInlineCompletion?.getSingleTextEdit(),
            item => this._model?.handleSuggestAccepted(item),
        )
        this._subs.push(this._adaptor, this._adaptor.onDidSelectedItemChange(() => this._model?.invalidate({ react: true, flush: true })))
        this._subs.push(this._registry.onDidChange(() => this._onDidChangeProviders.fire()))

        const e = editor
        // 批:最外层 update 结束时才 commit
        this._subs.push(e.onBeginUpdate(() => this._model?.beginBatch()))
        this._subs.push(e.onEndUpdate(() => this._model?.endBatch()))
        this._subs.push(e.onDidChangeModelContent(ev => {
            const m = this._model
            if (!m) return
            m.onTextChange(ev)
            // 删除 / Tab / 插入行这类命令不发 onDidType:Monaco 靠 onDidExecuteCommand,这里认「既不是打字也不是 API 编辑」的内容变更
            const reason = ev.detailedReasons?.[0]?.metadata
            const byCommand = reason?.source === 'unknown' && !ev.isUndoing && !ev.isRedoing
            if (byCommand && this._enabled && e.hasTextFocus()) void m.trigger()
        }))
        this._subs.push(e.onDidType(() => { if (this._enabled) void this._model?.trigger() }))
        this._subs.push(e.onDidPaste(() => { if (this._enabled) void this._model?.trigger() }))
        this._subs.push(e.onDidChangeCursorSelection(ev => {
            const m = this._model
            if (!m) return
            m.invalidate()
            if ((ev.reason === CursorChangeReason.Explicit || ev.source === 'api') && m.state?.kind === 'ghostText') m.stop()
        }))
        this._subs.push(e.onDidChangeConfiguration(() => { this._syncModel(); this._model?.invalidate({ react: true }) }))
        this._subs.push(e.onDidChangeModel(() => this._syncModel(true)))
        this._subs.push(e.onDidCompositionStart(() => { this._composing = true; this._model?.invalidate() }))
        this._subs.push(e.onDidCompositionEnd(() => { this._composing = false; this._model?.invalidate() }))
        this._subs.push(e.onDidBlurEditorWidget(() => {
            const m = this._model
            if (!m || (e.getOption('inlineSuggest') as { keepOnBlur?: boolean }).keepOnBlur) return
            m.stop('automatic')
        }))
        this._syncModel()
    }

    private get _enabled(): boolean { return !!(this.editor.getOption('inlineSuggest') as { enabled?: boolean }).enabled }

    /** 当前模型(只读编辑器 / 无 model 时为 undefined) */
    get model(): InlineCompletionsModel | undefined { return this._model }

    /** 只关 UI(画 ghost text),模型照常算;测试用 */
    testOnlyDisableUi(): void { this._uiDisabled = true }
    get uiDisabled(): boolean { return this._uiDisabled }

    private _snippetController(): Pick<SnippetController2, 'insert' | 'isInSnippet'> | undefined {
        const given = this.services.snippets?.()
        if (given) return given
        const fromSuggest = SuggestController.get(this.editor)?.snippetController()
        if (fromSuggest) return fromSuggest
        return this._snippets ??= new SnippetController2(this.editor, undefined, undefined, getContextKeyService(this.editor as never) as never)
    }

    private _syncModel(force = false): void {
        const textModel = this.editor.getModel()
        const readOnly = !!(this.editor.getOption('readOnly') as boolean)
        const want = textModel && !readOnly ? textModel : undefined
        if (!force && want === this._model?.textModel) return
        if (!force && !want && !this._model) return
        for (const s of this._modelSubs.splice(0)) s.dispose()
        this._model?.dispose()
        this._model = undefined
        if (want) {
            const model = new InlineCompletionsModel({
                editor: this.editor,
                textModel: want,
                suggestItem: () => this._adaptor.selectedItem,
                enabled: () => this._enabled,
                inComposition: () => this._composing,
                providers: () => this._registry.all(want),
                onDidChangeProviders: l => this._onDidChangeProviders.event(l),
                snippets: () => this._snippetController(),
                executeCommand: (id, args) => executeCommandById(this.editor as never, id, ...args),
                debounce: () => this.services.debounce?.() ?? 50,
            })
            this._model = model
            this._modelSubs.push(model.onDidChange(() => this._syncKeys()))
        }
        this._syncKeys()
        this._onDidChangeModel.fire()
    }

    private _syncKeys(): void {
        const s = this._model?.state
        this._keyVisible?.set(!!s)
        const suppress = s?.kind === 'ghostText' && !!s.inlineCompletion?.source.inlineSuggestions.suppressSuggestions
        this._keySuppress?.set(suppress)
    }

    dispose(): void {
        if (this._disposed) return
        this._disposed = true
        for (const s of this._modelSubs.splice(0)) s.dispose()
        for (const s of this._subs.splice(0)) s.dispose()
        this._model?.dispose()
        this._model = undefined
        this._onDidChangeModel.dispose()
        this._onDidChangeProviders.dispose()
        this._keyVisible?.reset()
        this._keySuppress?.reset()
        if (InlineCompletionsController.get(this.editor) === this) (this.editor as unknown as Record<symbol, unknown>)[SLOT] = undefined
    }
}
