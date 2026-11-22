// 补全控制器(移植自 VS Code editor/contrib/suggest/browser/suggestController.ts + suggestAlternatives / suggestOvertypingCapturer)。
//
// 无头:不画下拉(画下拉是 core/feature/suggestwidget 的事,经 lang/suggestlive 接上),只管「选中一项 → 怎么落到文档里」这一整套语义:
//   · 焦点项 = SuggestModel.onDidSuggest 时由记忆服务挑出的那一项(selectionMode 决定自动触发时给不给焦点),上下键移动
//   · 接受 = 先把 additionalTextEdits 同步施加(没有且 provider 能 resolve 时,异步施加,期间有人打字 / 在前面改了就放弃),
//     再用 SnippetController2.insert 写主文本(overwriteBefore/After 按光标偏移 + 行尾哨兵修正)
//   · 撤销栈:接受前后各一个 stop(异步附加编辑并进同一步);alternatives 在「再接受下一项」时撤回上一项
//   · 覆盖输入捕获:选区被打字覆盖时记下被盖掉的文本,供片段插入时把 overtype 掉的闭合字符补回
// 编辑器只用公开 API。不依赖 DOM,SnippetController2 由宿主 / 调用方给(没给就现建一个,同一编辑器复用)。
import type { IDisposable, LiteMonacoEditor } from '../api/types'
import type { IPosition } from '../api/position'
import { Position, Range } from '../api/position'
import { SnippetController2 } from '../api/snippetcontroller'
import { Emitter } from '../api/context'
import { getContextKeyService } from '../api/contextkeys'
import { SnippetParser } from '../core/feature/snippetparser'
import { CompletionItemInsertTextRule, CompletionTriggerKind } from './providers'
import { CancellationTokenSource } from './async'
import type { CompletionItem, SuggestProvider } from './suggest'
import type { CompletionModel } from './completionmodel'
import { State, SuggestModel, type SuggestModelServices } from './suggestmodel'

/** 控件里选中的那一项(Monaco ISelectedSuggestion) */
export interface ISelectedSuggestion { item: CompletionItem, index: number, model: CompletionModel }

/** 记忆服务里控制器用到的两个方法(完整的在 suggestmemory.ts) */
export interface SuggestMemoryLike {
    select(model: unknown, pos: IPosition, items: CompletionItem[]): number
    memorize(model: unknown, pos: IPosition, item: CompletionItem): void
}

export interface SuggestControllerServices extends SuggestModelServices {
    memory?: SuggestMemoryLike
    /** 片段插入;没给就按编辑器现建一个 SnippetController2 */
    snippets?: () => Pick<SnippetController2, 'insert' | 'isInSnippet'> | null | undefined
    commands?: { executeCommand(id: string, ...args: unknown[]): Promise<unknown> | unknown }
    log?: { warn(message: string, ...args: unknown[]): void, trace?(message: string, ...args: unknown[]): void }
}

// ───────────── 覆盖输入捕获 ─────────────
export class OvertypingCapturer implements IDisposable {
    private static readonly _maxSelectionLength = 51200
    private readonly _disposables: IDisposable[] = []
    private _lastOvertyped: { value: string, multiline: boolean }[] = []
    private _locked = false

    constructor(editor: LiteMonacoEditor, suggestModel: SuggestModel) {
        this._disposables.push(editor.onWillType(() => {
            if (this._locked || !editor.hasModel()) return
            const selections = editor.getSelections()!
            // 有没有选区会被打字覆盖
            if (!selections.some(s => !(s.selectionStartLineNumber === s.positionLineNumber && s.selectionStartColumn === s.positionColumn))) {
                if (this._lastOvertyped.length !== 0) this._lastOvertyped.length = 0
                return
            }
            this._lastOvertyped = []
            const model = editor.getModel()!
            for (let i = 0; i < selections.length; i++) {
                const s = selections[i]
                const range = new Range(s.selectionStartLineNumber, s.selectionStartColumn, s.positionLineNumber, s.positionColumn)
                if (model.getValueLengthInRange(range) > OvertypingCapturer._maxSelectionLength) return
                this._lastOvertyped[i] = { value: model.getValueInRange(range), multiline: range.startLineNumber !== range.endLineNumber }
            }
        }))
        this._disposables.push(suggestModel.onDidTrigger(() => { this._locked = true }))
        this._disposables.push(suggestModel.onDidCancel(() => { this._locked = false }))
    }

    getLastOvertypedInfo(idx: number): { value: string, multiline: boolean } | undefined {
        return idx >= 0 && idx < this._lastOvertyped.length ? this._lastOvertyped[idx] : undefined
    }
    dispose(): void { for (const d of this._disposables.splice(0)) d.dispose() }
}

// ───────────── 备选项(「接受后再按一次换下一项」) ─────────────
export class SuggestAlternatives {
    private _index = 0
    private _model: CompletionModel | undefined
    private _acceptNext: ((selected: ISelectedSuggestion) => unknown) | undefined
    private _listener: IDisposable | undefined
    private _ignore: boolean | undefined
    private readonly _ck: { set(v: boolean): void, reset(): void }

    constructor(private readonly _editor: LiteMonacoEditor) {
        this._ck = getContextKeyService(_editor).createKey('hasOtherSuggestions', false)
    }
    dispose(): void { this.reset() }
    reset(): void {
        this._ck.reset()
        this._listener?.dispose()
        this._model = undefined
        this._acceptNext = undefined
        this._ignore = false
    }
    set({ model, index }: ISelectedSuggestion, acceptNext: (selected: ISelectedSuggestion) => unknown): void {
        if (model.items.length === 0) { this.reset(); return }
        if (SuggestAlternatives._moveIndex(true, model, index) === index) { this.reset(); return }
        this._acceptNext = acceptNext
        this._model = model
        this._index = index
        this._listener = this._editor.onDidChangeCursorPosition(() => { if (!this._ignore) this.reset() })
        this._ck.set(true)
    }
    private static _moveIndex(fwd: boolean, model: CompletionModel, index: number): number {
        let newIndex = index
        for (let rounds = model.items.length; rounds > 0; rounds--) {
            newIndex = (newIndex + model.items.length + (fwd ? +1 : -1)) % model.items.length
            if (newIndex === index) break
            if (!model.items[newIndex].completion.additionalTextEdits) break
        }
        return newIndex
    }
    next(): void { this._move(true) }
    prev(): void { this._move(false) }
    private _move(fwd: boolean): void {
        if (!this._model) return
        try {
            this._ignore = true
            this._index = SuggestAlternatives._moveIndex(fwd, this._model, this._index)
            this._acceptNext!({ index: this._index, item: this._model.items[this._index], model: this._model })
        } finally { this._ignore = false }
    }
}

// ───────────── 光标右侧哨兵:接受时算 overwriteAfter 的修正 ─────────────
class LineSuffix implements IDisposable {
    private _marker: string | undefined
    constructor(private readonly _model: NonNullable<ReturnType<LiteMonacoEditor['getModel']>>, private readonly _position: IPosition) {
        // 光标右侧情形:行尾 → 之后只需看是否仍是行尾;行中 → 放一个标记算位移
        const maxColumn = _model.getLineMaxColumn(_position.lineNumber)
        if (maxColumn !== _position.column) {
            const offset = _model.getOffsetAt(_position)
            const end = _model.getPositionAt(offset + 1)
            _model.changeDecorations(accessor => {
                if (this._marker) accessor.removeDecoration(this._marker)
                this._marker = accessor.addDecoration(Range.fromPositions(_position, end), { description: 'suggest-line-suffix', stickiness: 1 /* NeverGrowsWhenTypingAtEdges */ })
            })
        }
    }
    dispose(): void {
        if (this._marker && !this._model.isDisposed()) {
            this._model.changeDecorations(accessor => { accessor.removeDecoration(this._marker!); this._marker = undefined })
        }
    }
    delta(position: IPosition): number {
        if (this._model.isDisposed() || this._position.lineNumber !== position.lineNumber) return 0
        if (this._marker) {
            const range = this._model.getDecorationRange(this._marker)
            return this._model.getOffsetAt(range!.getStartPosition()) - this._model.getOffsetAt(position)
        }
        return this._model.getLineMaxColumn(position.lineNumber) - position.column
    }
}

export const enum InsertFlags {
    None = 0,
    NoBeforeUndoStop = 1,
    NoAfterUndoStop = 2,
    KeepAlternativeSuggestions = 4,
    AlternativeOverwriteConfig = 8,
}

/** Monaco CommitCharacterController:焦点项带 commitCharacters 时,打出其中一个字符就先接受该项 */
class CommitCharacterController implements IDisposable {
    private readonly disposables: IDisposable[] = []
    private active: { chars: Set<string>, item: ISelectedSuggestion } | undefined
    private frozen = false

    constructor(controller: SuggestController, accept: (selected: ISelectedSuggestion) => void) {
        const editor = controller.editor
        const model = controller.model
        this.disposables.push(model.onDidSuggest(e => {
            this.frozen = e.isFrozen
            if (e.completionModel.items.length === 0) this.reset()
        }))
        this.disposables.push(model.onDidCancel(() => this.reset()))
        this.disposables.push(controller.onDidFocus(sel => this.onItem(sel)))
        this.disposables.push(controller.onDidShowWidget(() => this.onItem(controller.getFocusedItem())))
        this.disposables.push(controller.onDidHideWidget(() => this.reset()))
        this.disposables.push(editor.onWillType(text => {
            if (!this.active || this.frozen || model.state === State.Idle) return
            // 末尾一个码元(Monaco 同:commitCharacters 只认单个 UTF-16 码元)
            const ch = text.charAt(text.length - 1)
            if (this.active.chars.has(ch) && editor.getOption('acceptSuggestionOnCommitCharacter')) accept(this.active.item)
        }))
    }

    private onItem(selected: ISelectedSuggestion | undefined): void {
        const cc = selected?.item.completion.commitCharacters
        if (!selected || !cc?.length) { this.reset(); return }
        if (this.active && this.active.item.item === selected.item) return
        const chars = new Set<string>()
        for (const ch of cc) if (ch.length > 0) chars.add(ch.charAt(0))
        this.active = { chars, item: selected }
    }
    private reset(): void { this.active = undefined }
    dispose(): void { for (const d of this.disposables.splice(0)) d.dispose() }
}

const SLOT = Symbol.for('lite-monaco.suggestController')

export class SuggestController implements IDisposable {
    static readonly ID = 'editor.contrib.suggestController'

    static get(editor: LiteMonacoEditor): SuggestController | null {
        return (editor as unknown as Record<symbol, SuggestController | undefined>)[SLOT] ?? null
    }

    readonly editor: LiteMonacoEditor
    readonly model: SuggestModel

    private readonly _alternatives: SuggestAlternatives
    private _lineSuffix: LineSuffix | undefined
    private readonly _toDispose: IDisposable[] = []
    private readonly _overtypingCapturer: OvertypingCapturer
    private readonly _selectors: { priority: number, select(model: unknown, pos: IPosition, items: CompletionItem[]): number }[] = []
    private _focused: ISelectedSuggestion | undefined
    private _current: CompletionModel | undefined
    private _selectionIndex = 0
    private _snippets: SnippetController2 | undefined

    private readonly _onWillInsertSuggestItem = new Emitter<{ item: CompletionItem }>()
    readonly onWillInsertSuggestItem = this._onWillInsertSuggestItem.event
    private readonly _onDidFocus = new Emitter<ISelectedSuggestion>()
    /** 焦点项变了(控件据此高亮 / 更新上下文键) */
    readonly onDidFocus = this._onDidFocus.event
    private readonly _onDidShow = new Emitter<void>()
    private readonly _onDidHide = new Emitter<void>()
    /** 控件显隐(Monaco SuggestWidget.onDidShow / onDidHide;由挂控件的宿主经 notifyWidget 驱动) */
    readonly onDidShowWidget = this._onDidShow.event
    readonly onDidHideWidget = this._onDidHide.event
    notifyWidget(shown: boolean): void { (shown ? this._onDidShow : this._onDidHide).fire() }

    /** 注册一个选择器(Monaco registerSelector):补全结果出来时按 priority 从高到低问,返回 -1 = 没意见 */
    registerSelector(selector: { priority: number, select(model: unknown, pos: IPosition, items: CompletionItem[]): number }): IDisposable {
        this._selectors.push(selector)
        return { dispose: () => { const i = this._selectors.indexOf(selector); if (i >= 0) this._selectors.splice(i, 1) } }
    }

    constructor(editor: LiteMonacoEditor, private readonly _services: SuggestControllerServices = {}) {
        const prev = SuggestController.get(editor)
        if (prev) prev.dispose()
        ;(editor as unknown as Record<symbol, unknown>)[SLOT] = this

        this.editor = editor
        this.model = new SuggestModel(editor, _services)

        // 默认选择器:记忆服务
        const memory = _services.memory
        if (memory) this._selectors.push({ priority: 0, select: (m, pos, items) => memory.select(m, pos, items) })

        this._overtypingCapturer = new OvertypingCapturer(editor, this.model)
        this._toDispose.push(new CommitCharacterController(this, sel => this._insertSuggestion(sel, InsertFlags.NoAfterUndoStop)))
        this._alternatives = new SuggestAlternatives(editor)
        this._toDispose.push(this._overtypingCapturer, this._alternatives)

        this._toDispose.push(this.model.onDidTrigger(e => {
            this._lineSuffix?.dispose()
            this._lineSuffix = new LineSuffix(this.editor.getModel()!, e.position)
        }))
        this._toDispose.push(this.model.onDidSuggest(e => {
            if (e.triggerOptions.shy) return
            let index = -1
            for (const selector of [...this._selectors].sort((a, b) => b.priority - a.priority)) {
                index = selector.select(this.editor.getModel(), this.editor.getPosition()!, e.completionModel.items)
                if (index !== -1) break
            }
            if (index === -1) index = 0
            // 选中项这一步可能「泵出」光标事件把会话取消了:再查一次
            if (this.model.state === State.Idle) return
            let noFocus = false
            if (e.triggerOptions.auto) {
                // 配置了就不给焦点
                const mode = this.editor.getOption('suggest').selectionMode
                if (mode === 'never' || mode === 'always') noFocus = mode === 'never'
                else if (mode === 'whenTriggerCharacter') noFocus = e.triggerOptions.triggerKind !== CompletionTriggerKind.TriggerCharacter
                else if (mode === 'whenQuickSuggestion') noFocus = e.triggerOptions.triggerKind === CompletionTriggerKind.TriggerCharacter && !e.triggerOptions.refilter
            }
            this._current = e.completionModel
            this._selectionIndex = Math.min(index, Math.max(0, e.completionModel.items.length - 1))
            this._setFocus(noFocus || e.completionModel.items.length === 0 ? undefined : { index, item: e.completionModel.items[Math.min(index, e.completionModel.items.length - 1)], model: e.completionModel })
        }))
        this._toDispose.push(this.model.onDidCancel(e => {
            if (!e.retrigger) { this._focused = undefined; this._current = undefined }
        }))
        this._toDispose.push(this.editor.onDidBlurEditorWidget(() => {
            this.model.cancel()
            this.model.clear()
        }))
    }

    dispose(): void {
        this._alternatives.dispose()
        for (const d of this._toDispose.splice(0)) d.dispose()
        this.model.dispose()
        this._lineSuffix?.dispose()
        this._onWillInsertSuggestItem.dispose()
        this._onDidFocus.dispose()
        this._onDidShow.dispose()
        this._onDidHide.dispose()
        if (SuggestController.get(this.editor) === this) (this.editor as unknown as Record<symbol, unknown>)[SLOT] = undefined
    }

    /** 记忆服务 / selectionMode 挑出的那一项的序号(没给焦点时控件也要滚到它) */
    get selectionIndex(): number { return this._selectionIndex }

    /** 直接接受某一项(点选 / 提交符):flags 同 Monaco _insertSuggestion */
    acceptSuggestion(selected: ISelectedSuggestion, flags: InsertFlags = InsertFlags.None): void { this._insertSuggestion(selected, flags) }

    /** 当前焦点项(没有 = 没焦点 / 没会话) */
    getFocusedItem(): ISelectedSuggestion | undefined { return this._focused }

    private _setFocus(sel: ISelectedSuggestion | undefined): void {
        this._focused = sel
        if (sel) this._onDidFocus.fire(sel)
    }

    snippetController(): Pick<SnippetController2, 'insert' | 'isInSnippet'> | undefined {
        const given = this._services.snippets?.()
        if (given) return given
        return this._snippets ??= new SnippetController2(this.editor, undefined, undefined, getContextKeyService(this.editor) as never)
    }

    protected _insertSuggestion(event: ISelectedSuggestion | undefined, flags: InsertFlags): void {
        if (!event || !event.item) {
            this._alternatives.reset()
            this.model.cancel()
            this.model.clear()
            return
        }
        if (!this.editor.hasModel()) return
        const snippetController = this.snippetController()
        if (!snippetController) return

        this._onWillInsertSuggestItem.fire({ item: event.item })

        const editor = this.editor
        const model = editor.getModel()!
        const modelVersionNow = model.getAlternativeVersionId()
        const { item } = event

        const tasks: Promise<unknown>[] = []
        const cts = new CancellationTokenSource()

        // 附加编辑之前、主编辑之后各一个撤销 stop
        if (!(flags & InsertFlags.NoBeforeUndoStop)) editor.pushUndoStop()

        // 附加编辑施加之前先算 overwrite[Before|After]
        const info = this.getOverwriteInfo(item, Boolean(flags & InsertFlags.AlternativeOverwriteConfig))

        // 记进记忆
        this._services.memory?.memorize(model, editor.getPosition()!, item)

        const isResolved = item.isResolved

        if (Array.isArray(item.completion.additionalTextEdits)) {
            // 取消会话:停掉所有监听、关控件
            this.model.cancel()

            // 同步施加附加编辑
            editor.executeEdits('suggestController.additionalTextEdits.sync', item.completion.additionalTextEdits.map(edit => {
                let range = Range.lift(edit.range)!
                if (range.startLineNumber === item.position.lineNumber && range.startColumn > item.position.column) {
                    // 附加编辑落在补全位置「之后」:随光标位移
                    const columnDelta = editor.getPosition()!.column - item.position.column
                    const endColumnDelta = range.startLineNumber !== range.endLineNumber ? 0 : columnDelta
                    range = new Range(range.startLineNumber, range.startColumn + columnDelta, range.endLineNumber, range.endColumn + endColumnDelta)
                }
                return { range, text: edit.text, forceMoveMarkers: true }
            }))
        } else if (!isResolved) {
            // 异步附加编辑
            let position: IPosition | undefined

            const docListener = model.onDidChangeContent(e => {
                if (e.isFlush) { cts.cancel(); docListener.dispose(); return }
                for (const change of e.changes) {
                    const thisPosition = Range.getEndPosition(change.range)
                    if (!position || Position.isBefore(thisPosition, position)) position = thisPosition
                }
            })

            const oldFlags = flags
            flags |= InsertFlags.NoAfterUndoStop
            let didType = false
            const typeListener = editor.onWillType(() => {
                typeListener.dispose()
                didType = true
                if (!(oldFlags & InsertFlags.NoAfterUndoStop)) editor.pushUndoStop()
            })

            tasks.push(item.resolve(cts.token).then(() => {
                if (!item.completion.additionalTextEdits || cts.token.isCancellationRequested) return undefined
                if (position && item.completion.additionalTextEdits.some(edit => Position.isBefore(position!, Range.getStartPosition(edit.range)))) return false
                if (didType) editor.pushUndoStop()
                editor.executeEdits('suggestController.additionalTextEdits.async', item.completion.additionalTextEdits.map(edit => ({ range: Range.lift(edit.range)!, text: edit.text, forceMoveMarkers: true })))
                if (didType || !(oldFlags & InsertFlags.NoAfterUndoStop)) editor.pushUndoStop()
                return true
            }).then(applied => {
                this._services.log?.trace?.('[suggest] async resolving of edits DONE (applied?)', applied)
            }).finally(() => {
                docListener.dispose()
                typeListener.dispose()
            }))
        }

        let { insertText } = item.completion
        if (!(item.completion.insertTextRules! & CompletionItemInsertTextRule.InsertAsSnippet)) insertText = SnippetParser.escape(insertText)

        // 取消会话:停掉所有监听、关控件
        this.model.cancel()

        snippetController.insert(insertText, {
            overwriteBefore: info.overwriteBefore,
            overwriteAfter: info.overwriteAfter,
            undoStopBefore: false,
            undoStopAfter: false,
            adjustWhitespace: !(item.completion.insertTextRules! & CompletionItemInsertTextRule.KeepWhitespace),
            clipboardText: event.model.clipboardText,
            overtypingCapturer: this._overtypingCapturer,
        })

        if (!(flags & InsertFlags.NoAfterUndoStop)) editor.pushUndoStop()

        if (item.completion.command) {
            if (item.completion.command.id === 'editor.action.triggerSuggest') {
                // 重新触发
                this.model.trigger({ auto: true, retrigger: true })
            } else {
                // 执行命令,完事
                const args = item.completion.command.arguments ? [...item.completion.command.arguments] : []
                const run = this._services.commands
                    ? Promise.resolve(this._services.commands.executeCommand(item.completion.command.id, ...args))
                    : Promise.resolve((editor as unknown as { trigger(source: string, id: string, payload: unknown): unknown }).trigger('suggest', item.completion.command.id, args[0]))
                tasks.push(run.catch(e => console.error(e)))
            }
        }

        if (flags & InsertFlags.KeepAlternativeSuggestions) {
            this._alternatives.set(event, next => {
                // 取消还在 resolve 的附加编辑
                cts.cancel()
                // 插「下一项」前先撤销到接受上一项之前的状态
                while (model.canUndo()) {
                    if (modelVersionNow !== model.getAlternativeVersionId()) model.undo()
                    this._insertSuggestion(next, InsertFlags.NoBeforeUndoStop | InsertFlags.NoAfterUndoStop | (flags & InsertFlags.AlternativeOverwriteConfig ? InsertFlags.AlternativeOverwriteConfig : 0))
                    break
                }
            })
        }

        // 所有任务完成之后才清理
        Promise.all(tasks).finally(() => {
            this.model.clear()
            cts.dispose()
        })
    }

    getOverwriteInfo(item: CompletionItem, toggleMode: boolean): { overwriteBefore: number, overwriteAfter: number } {
        if (!this.editor.hasModel()) throw new Error('Assertion Failed')
        let replace = this.editor.getOption('suggest').insertMode === 'replace'
        if (toggleMode) replace = !replace
        const overwriteBefore = item.position.column - item.editStart.column
        const overwriteAfter = (replace ? item.editReplaceEnd.column : item.editInsertEnd.column) - item.position.column
        const columnDelta = this.editor.getPosition()!.column - item.position.column
        const suffixDelta = this._lineSuffix ? this._lineSuffix.delta(this.editor.getPosition()!) : 0
        return { overwriteBefore: overwriteBefore + columnDelta, overwriteAfter: overwriteAfter + suffixDelta }
    }

    triggerSuggest(onlyFrom?: Set<SuggestProvider>, auto?: boolean, noFilter?: boolean): void {
        if (this.editor.hasModel()) {
            this.model.trigger({ auto: auto ?? false, completionOptions: { providerFilter: onlyFrom, kindFilter: noFilter ? new Set() : undefined } })
            this.editor.revealPosition(this.editor.getPosition()!)
            this.editor.focus()
        }
    }

    /** 触发并直接接受最佳项;没有会改文本的候选就走 fallback 命令 */
    triggerSuggestAndAcceptBest(arg: { fallback: string }): void {
        if (!this.editor.hasModel()) return
        const editor = this.editor
        const positionNow = editor.getPosition()!
        const memory = this._services.memory

        const fallback = () => {
            if (Position.equals(positionNow, editor.getPosition()!)) {
                void this._services.commands?.executeCommand(arg.fallback)
            }
        }

        const makesTextEdit = (item: CompletionItem): boolean => {
            if (item.completion.insertTextRules! & CompletionItemInsertTextRule.InsertAsSnippet || item.completion.additionalTextEdits) return true // 片段 / 带附加编辑:必改文本
            const position = editor.getPosition()!
            const startColumn = item.editStart.column
            const endColumn = position.column
            if (endColumn - startColumn !== item.completion.insertText.length) return true // 长度不等
            const textNow = editor.getModel()!.getValueInRange({ startLineNumber: position.lineNumber, startColumn, endLineNumber: position.lineNumber, endColumn })
            return textNow !== item.completion.insertText // 文本不等
        }

        const once = this.model.onDidTrigger(() => {
            once.dispose()
            // 等到触发之后,cancel 事件才可信
            const listener: IDisposable[] = []
            const dispose = () => { for (const l of listener.splice(0)) l.dispose() }
            const onTrigOrCancel = () => { dispose(); fallback() }
            listener.push(this.model.onDidTrigger(onTrigOrCancel), this.model.onDidCancel(onTrigOrCancel))
            listener.push(this.model.onDidSuggest(({ completionModel }) => {
                dispose()
                if (completionModel.items.length === 0) { fallback(); return }
                const index = memory ? memory.select(editor.getModel(), editor.getPosition()!, completionModel.items) : 0
                const item = completionModel.items[index]
                if (!makesTextEdit(item)) { fallback(); return }
                editor.pushUndoStop()
                this._insertSuggestion({ index, item, model: completionModel }, InsertFlags.KeepAlternativeSuggestions | InsertFlags.NoBeforeUndoStop | InsertFlags.NoAfterUndoStop)
            }))
        })

        this.model.trigger({ auto: false, shy: true })
        editor.revealPosition(positionNow)
        editor.focus()
    }

    acceptSelectedSuggestion(keepAlternativeSuggestions: boolean, alternativeOverwriteConfig: boolean): void {
        let flags = 0
        if (keepAlternativeSuggestions) flags |= InsertFlags.KeepAlternativeSuggestions
        if (alternativeOverwriteConfig) flags |= InsertFlags.AlternativeOverwriteConfig
        this._insertSuggestion(this._focused, flags)
    }

    acceptNextSuggestion(): void { this._alternatives.next() }
    acceptPrevSuggestion(): void { this._alternatives.prev() }

    cancelSuggestWidget(): void {
        this.model.cancel()
        this.model.clear()
    }

    // 焦点移动:在当前补全列表里按序号走(到头回绕,同 Monaco 列表控件)
    private _move(to: (i: number, n: number) => number): void {
        const m = this._current
        if (!m || m.items.length === 0) return
        const i = this._focused?.index ?? -1
        const next = to(i, m.items.length)
        this._setFocus({ index: next, item: m.items[next], model: m })
    }
    focusSuggestion(): void { if (!this._focused) this._move(() => 0) }
    /** 控件里直接点选 / 翻页落点:焦点移到第 index 项(越界夹住) */
    setFocusIndex(index: number): void { this._move((_i, n) => Math.max(0, Math.min(n - 1, index))) }
    selectNextSuggestion(): void { this._move((i, n) => (i + 1) % n) }
    selectPrevSuggestion(): void { this._move((i, n) => (i <= 0 ? n - 1 : i - 1)) }
    selectFirstSuggestion(): void { this._move(() => 0) }
    selectLastSuggestion(): void { this._move((_i, n) => n - 1) }
}
