// SnippetController2(移植自 VS Code editor/contrib/snippet/browser/snippetController2.ts)。
//
// 「片段会话」的编辑器侧控制器:insert / apply 起会话,嵌套 insert 合并,next / prev 跳 tabstop,
// 选区离开占位符 / undo 回到起点 / 走到最后一个占位符就自动结束,并维护 inSnippetMode / hasNextTabstop / hasPrevTabstop 三个 key。
//
// 与补全接受时的 `expandSnippet`(core 的 snippetField)是两套互不干扰的实现;这套是 Monaco 的会话模型。
// 没有 DI:构造参数形态同 Monaco(editor, logService, languageFeaturesService, contextKeyService, languageConfigurationService),
// 服务都按最小结构接口收,宿主传什么都行。
import { Position, Range } from './position'
import type { IDisposable } from './types'
import type { LiteMonacoEditor } from './types'
import { ISnippetEdit, SnippetSession, type ISnippetSessionInsertOptions } from './snippetsession'
import type { Choice } from '../core/feature/snippetparser'
import type { ILanguageConfigurationService, IOvertypingCapturer } from './snippetvariables'
import { defaultLanguageConfigurationService } from './snippetvariables'

// ───────────── 最小服务接口 ─────────────

export interface ISnippetLogService {
    error(...args: unknown[]): void
}

export interface ISnippetContextKey<T> {
    set(value: T): void
    reset(): void
    get(): T | undefined
}

export interface ISnippetContextKeyService {
    createKey<T>(key: string, defaultValue: T | undefined): ISnippetContextKey<T>
    getContextKeyValue<T = unknown>(key: string): T | undefined
}

export interface ISnippetLanguageFeaturesService {
    readonly completionProvider: {
        register(selector: unknown, provider: unknown): IDisposable
    }
}

/** Monaco RawContextKey 的最小形态:key + 缺省值,绑到 context key 服务上 */
export class RawContextKey<T> {
    constructor(readonly key: string, readonly defaultValue: T) { }
    bindTo(service: ISnippetContextKeyService): ISnippetContextKey<T> { return service.createKey<T>(this.key, this.defaultValue) }
    getValue(service: ISnippetContextKeyService): T | undefined { return service.getContextKeyValue<T>(this.key) }
}

export interface ISnippetInsertOptions extends ISnippetSessionInsertOptions {
    undoStopBefore: boolean
    undoStopAfter: boolean
}

const _defaultOptions: ISnippetInsertOptions = {
    overwriteBefore: 0,
    overwriteAfter: 0,
    undoStopBefore: true,
    undoStopAfter: true,
    adjustWhitespace: true,
    clipboardText: undefined,
    overtypingCapturer: undefined as IOvertypingCapturer | undefined,
}

const nullLog: ISnippetLogService = { error() { /* 吞掉 */ } }

export class SnippetController2 {

    static readonly ID = 'snippetController2'

    static readonly InSnippetMode = new RawContextKey('inSnippetMode', false)
    static readonly HasNextTabstop = new RawContextKey('hasNextTabstop', false)
    static readonly HasPrevTabstop = new RawContextKey('hasPrevTabstop', false)

    private readonly _inSnippet: ISnippetContextKey<boolean>
    private readonly _hasNextTabstop: ISnippetContextKey<boolean>
    private readonly _hasPrevTabstop: ISnippetContextKey<boolean>

    private _session?: SnippetSession
    private _listeners: IDisposable[] = []
    private _modelVersionId = -1
    private _currentChoice?: Choice

    private _choiceCompletions?: { provider: unknown, enable(): void, disable(): void }

    constructor(
        private readonly _editor: LiteMonacoEditor,
        private readonly _logService: ISnippetLogService = nullLog,
        private readonly _languageFeaturesService: ISnippetLanguageFeaturesService | undefined,
        contextKeyService: ISnippetContextKeyService,
        private readonly _languageConfigurationService: ILanguageConfigurationService = defaultLanguageConfigurationService,
    ) {
        this._inSnippet = SnippetController2.InSnippetMode.bindTo(contextKeyService)
        this._hasNextTabstop = SnippetController2.HasNextTabstop.bindTo(contextKeyService)
        this._hasPrevTabstop = SnippetController2.HasPrevTabstop.bindTo(contextKeyService)
    }

    private _clearListeners(): void {
        for (const l of this._listeners) l.dispose()
        this._listeners = []
    }

    dispose(): void {
        this._inSnippet.reset()
        this._hasPrevTabstop.reset()
        this._hasNextTabstop.reset()
        this._session?.dispose()
        this._clearListeners()
    }

    apply(edits: ISnippetEdit[], opts?: Partial<ISnippetInsertOptions>): void {
        try {
            this._doInsert(edits, { ..._defaultOptions, ...opts })
        } catch (e) {
            this.cancel()
            this._logService.error(e)
            this._logService.error('snippet_error')
            this._logService.error('insert_edits=', edits)
            this._logService.error('existing_template=', this._session ? this._session._logInfo() : '<no_session>')
        }
    }

    insert(template: string, opts?: Partial<ISnippetInsertOptions>): void {
        try {
            this._doInsert(template, { ..._defaultOptions, ...opts })
        } catch (e) {
            this.cancel()
            this._logService.error(e)
            this._logService.error('snippet_error')
            this._logService.error('insert_template=', template)
            this._logService.error('existing_template=', this._session ? this._session._logInfo() : '<no_session>')
        }
    }

    private _doInsert(template: string | ISnippetEdit[], opts: ISnippetInsertOptions): void {
        const model = this._editor.getModel()
        if (!model) return

        // 插入期间不听事件:那是会触发取消的中间态
        this._clearListeners()

        if (opts.undoStopBefore) model.pushStackElement()

        // 边数组不合并
        if (this._session && typeof template !== 'string') this.cancel()

        if (!this._session) {
            this._modelVersionId = model.getAlternativeVersionId()
            this._session = new SnippetSession(this._editor, template, opts, this._languageConfigurationService)
            this._session.insert()
        } else {
            if (typeof template !== 'string') throw new Error('assertType: template must be a string')
            this._session.merge(template, opts)
        }

        if (opts.undoStopAfter) model.pushStackElement()

        // 有 choice 占位符时,登记一个只服务当前 choice 的补全源
        if (this._session?.hasChoice && this._languageFeaturesService) {
            const provider = {
                _debugDisplayName: 'snippetChoiceCompletions',
                provideCompletionItems: (m: unknown, position: Position) => {
                    const cur = this._editor.getPosition()
                    if (!this._session || m !== this._editor.getModel() || !cur || !Position.equals(cur, position)) return undefined
                    const { activeChoice } = this._session
                    if (!activeChoice || activeChoice.choice.options.length === 0) return undefined

                    const word = model.getValueInRange(activeChoice.range)
                    const isAnyOfOptions = Boolean(activeChoice.choice.options.find(o => o.value === word))
                    const suggestions = activeChoice.choice.options.map((option, i) => ({
                        kind: 11 /* Value */,
                        label: option.value,
                        insertText: option.value,
                        sortText: 'a'.repeat(i + 1),
                        range: activeChoice.range,
                        filterText: isAnyOfOptions ? `${word}_${option.value}` : undefined,
                        command: { id: 'jumpToNextSnippetPlaceholder', title: 'Go to next placeholder...' },
                    }))
                    return { suggestions }
                },
            }

            let registration: IDisposable | undefined
            let isRegistered = false
            const features = this._languageFeaturesService
            const disable = () => {
                registration?.dispose()
                isRegistered = false
            }
            const enable = () => {
                if (!isRegistered) {
                    registration = features.completionProvider.register({
                        language: model.getLanguageId(),
                        pattern: model.uri.fsPath,
                        scheme: model.uri.scheme,
                        exclusive: true,
                    }, provider)
                    this._listeners.push(registration)
                    isRegistered = true
                }
            }
            this._choiceCompletions = { provider, enable, disable }
        }

        this._updateState()

        this._listeners.push(
            this._editor.onDidChangeModelContent(e => { if (e.isFlush) this.cancel() }),
            this._editor.onDidChangeModel(() => this.cancel()),
            this._editor.onDidChangeCursorSelection(() => this._updateState()),
        )
    }

    private _updateState(): void {
        const model = this._editor.getModel()
        if (!this._session || !model) return // 期间被取消了

        if (this._modelVersionId === model.getAlternativeVersionId()) {
            // undo 回到了「之前」的状态:退出片段模式
            return this.cancel()
        }

        if (!this._session.hasPlaceholder) {
            // 纯文本片段:不听选区变化,也不更新 key
            return this.cancel()
        }

        if (this._session.isAtLastPlaceholder || !this._session.isSelectionWithinPlaceholders()) {
            model.pushStackElement()
            return this.cancel()
        }

        this._inSnippet.set(true)
        this._hasPrevTabstop.set(!this._session.isAtFirstPlaceholder)
        this._hasNextTabstop.set(!this._session.isAtLastPlaceholder)

        this._handleChoice()
    }

    private _handleChoice(): void {
        if (!this._session || !this._editor.getModel()) {
            this._currentChoice = undefined
            return
        }

        const { activeChoice } = this._session
        if (!activeChoice || !this._choiceCompletions) {
            this._choiceCompletions?.disable()
            this._currentChoice = undefined
            return
        }

        if (this._currentChoice !== activeChoice.choice) {
            this._currentChoice = activeChoice.choice
            this._choiceCompletions.enable()
            // 下一个微任务触发补全(Monaco 的 showSimpleSuggestions);宿主没有该 action 就只登记不弹
            queueMicrotask(() => {
                const act = (this._editor as { getAction?(id: string): { run(): unknown } | null }).getAction?.('editor.action.triggerSuggest')
                act?.run()
            })
        }
    }

    finish(): void {
        while (this._inSnippet.get()) this.next()
    }

    cancel(resetSelection = false): void {
        this._inSnippet.reset()
        this._hasPrevTabstop.reset()
        this._hasNextTabstop.reset()
        this._clearListeners()

        this._currentChoice = undefined

        this._session?.dispose()
        this._session = undefined
        this._modelVersionId = -1
        if (resetSelection) {
            // 显式取消(如 Esc)时把多选区收成主光标
            this._editor.setSelections([this._editor.getSelection()!])
        }
    }

    prev(): void {
        this._session?.prev()
        this._updateState()
    }

    next(): void {
        this._session?.next()
        this._updateState()
    }

    isInSnippet(): boolean {
        return Boolean(this._inSnippet.get())
    }

    getSessionEnclosingRange(): Range | undefined {
        return this._session?.getEnclosingRange()
    }
}
