// 补全的「活」接线:把无头的 SuggestModel / SuggestController(Monaco 移植)接到 core 的补全控件(suggestwidget.ts)上。
//
// 这里只做胶水,不含补全语义:
//   · 每个编辑器一张自己的 provider 注册表(父表 = 全局 languageFeatures.completionProvider):内置的文档词 / 关键字('*',最低分组)
//     和 TS 语义补全放在子表里,宿主 registerCompletionItemProvider 注册的 provider 在父表里,两边在同一次取回里按分组竞争
//   · 控制器负责「选中 → 怎么落到文档」,模型负责「何时问 / 怎么过滤」;这里把它们的事件翻成 SuggestUi 的状态,
//     把 SuggestUi 的键位命令(Tab / Enter / Esc / ⌃Space …)翻成控制器的调用
//   · 提交字符(commitCharacters)= Monaco CommitCharacterController
// 控件本身(画下拉 / 详情 / 定位)是 core 的 overlay,挂 document.body,绝不进 contenteditable。
import type { IDisposable, LiteMonacoEditor } from '../api/types'
import type { EditorView } from '../core/view/editorview'
import { SnippetController2 } from '../api/snippetcontroller'
import { getContextKeyService } from '../api/contextkeys'
import { executeCommandById, setViewCommand } from '../api/commands'
import { getWordDefinition } from '../api/languages'
import { insertTab } from '../core/edit/commands'
import { matchIndices } from '../core/feature/fuzzy'
import { suggestUi, type SuggestCommandName, type SuggestHost, type SuggestInfo, type SuggestRow } from '../core/feature/suggestwidget'
import { CompletionItemInsertTextRule, CompletionItemTag } from './providers'
import { KIND_NAME } from './providers'
import { canonLanguage } from './languageselector'
import { LanguageFeatureRegistry, languageFeatures } from './languagefeatures'
import { CancellationNone } from './async'
import type { CompletionItem, SuggestProvider } from './suggest'
import type { CompletionModel } from './completionmodel'
import { SuggestMemoryService, type MemMode } from './suggestmemory'
import { InsertFlags, SuggestController, type ISelectedSuggestion } from './suggestcontroller'
import { State } from './suggestmodel'
import { computeWordRanges } from './wordranges'
import type { WordRangeService } from './worddistance'
import { textCompletionProvider, tsCompletionProvider } from './suggestproviders'
import type { TSServiceOptions } from './tsservice'
import { renderMarkdown, type MarkdownOptions } from './tsmarkdown'

/** 宿主(litemonaco.ts 的装配结果)给的、会随重装配变的东西 */
export interface SuggestLiveConfig {
    /** TS / JS 语义补全的服务选项;非 TS 语言 / peek 预览为 null */
    ts: TSServiceOptions | null
    /** 详情里 markdown 代码块的高亮 */
    render: MarkdownOptions
}

export interface SuggestLive {
    /** features.autocomplete 开关:关掉后控件永不弹、键位命令全部穿透 */
    setEnabled(on: boolean): void
    dispose(): void
}

const noop = () => { /* */ }

export function installSuggest(view: EditorView, getConfig: () => SuggestLiveConfig): SuggestLive {
    const editor = view as unknown as LiteMonacoEditor
    const ui = suggestUi(view)
    const ctxKeys = getContextKeyService(editor)

    // —— 本编辑器的 provider 表 ——
    let explicit = false
    const registry = new LanguageFeatureRegistry<SuggestProvider>({ canonLanguage, parent: languageFeatures.completionProvider as LanguageFeatureRegistry<SuggestProvider> })
    const disabledRegistry = new LanguageFeatureRegistry<SuggestProvider>({ canonLanguage })
    registry.register('*', textCompletionProvider(() => view.state, () => explicit))
    registry.register(['typescript', 'javascript'], tsCompletionProvider({
        ts: () => getConfig().ts,
        render: () => getConfig().render,
        getState: () => view.state,
        isExplicit: () => explicit,
    }))
    let enabled = true
    // SuggestModel 每次都从 languageFeatures.completionProvider 读:关掉时指向空表,模型就当没有 provider
    const features = { get completionProvider() { return enabled ? registry : disabledRegistry } }

    const wordRanges: WordRangeService = {
        canComputeWordRanges: () => true,
        computeWordRanges: async (_resource, range) => {
            const m = editor.getModel()
            return m ? computeWordRanges(n => m.getLineContent(n), range, getWordDefinition(m.getLanguageId())) : null
        },
    }
    const memory = new SuggestMemoryService({ getMode: () => (editor.getOption('suggestSelection') as MemMode) })
    const snippets = new SnippetController2(editor, { error: (...a: unknown[]) => console.error(...a) }, features as never, ctxKeys as never)
    const run = (id: string, ...args: unknown[]): Promise<unknown> | unknown => {
        if (id === 'tab') return insertTab(view)
        const r = executeCommandById(view, id, ...args)
        if (r !== false) return r
        return (editor as unknown as { trigger(s: string, h: string, p?: unknown): void }).trigger('suggest', id, args[0])
    }
    const controller = new SuggestController(editor, {
        wordRanges,
        clipboard: { readText: async () => { try { return (await navigator.clipboard?.readText()) ?? '' } catch { return '' } } },
        log: { warn: (m, ...a) => console.warn(m, ...a), trace: noop },
        languageFeatures: features as never,
        env: { isBuilt: true },
        memory,
        snippets: () => snippets,
        commands: { executeCommand: run },
    })
    const model = controller.model
    const disposables: IDisposable[] = [controller, memory, snippets as unknown as IDisposable]
    // snippet choice 补全项的 command
    disposables.push(setViewCommand(view, 'jumpToNextSnippetPlaceholder', () => { snippets.next() }))

    // —— 控件的数据口 ——
    let items: CompletionItem[] = []
    let completionModel: CompletionModel | undefined
    // 每项的 resolve 只发一次;等它的人(overlay 的行 / 详情面板 / 外部)各留一个回调,到了一起通知
    const pendingResolve = new WeakMap<CompletionItem, Set<() => void>>()
    // resolve 失败的项(CompletionItem 不记失败):当作没有细节,不再重发,否则 onReady → 重画 → info → 再发 会死循环
    const resolveSettled = new WeakSet<CompletionItem>()
    const docOf = (d: unknown): string | undefined => d == null ? undefined : typeof d === 'string' ? d : (d as { value?: string }).value
    const host: SuggestHost = {
        rowAt(i): SuggestRow {
            const it = items[i]
            const c = it.completion
            const label = c.label
            return {
                label: it.textLabel,
                kind: KIND_NAME[c.kind] ?? 'text',
                deprecated: !!c.tags?.includes(CompletionItemTag.Deprecated),
                matches: matchIndices(it.score),
                detail: c.detail || undefined,
                labelDetail: typeof label === 'object' ? label.detail : undefined,
                labelDescription: typeof label === 'object' ? label.description : undefined,
            }
        },
        info(i, onReady): SuggestInfo | null {
            const it = items[i]
            if (!it) return null
            if (!it.isResolved && !resolveSettled.has(it)) {
                let waiters = pendingResolve.get(it)
                if (!waiters) {
                    const set = waiters = new Set<() => void>()
                    pendingResolve.set(it, set)
                    void it.resolve(CancellationNone).then(() => { resolveSettled.add(it); pendingResolve.delete(it); for (const fn of set) fn() })
                }
                waiters.add(onReady)
            }
            const c = it.completion as typeof it.completion & { renderDocumentation?: () => HTMLElement }
            const doc = docOf(c.documentation)
            const isMd = typeof c.documentation === 'object' && c.documentation != null
            return {
                detail: c.detail || undefined,
                documentation: doc,
                renderDocumentation: c.renderDocumentation ?? (isMd && doc ? () => renderMarkdown(doc, getConfig().render) : undefined),
            }
        },
        accept(i) {
            const item = items[i]
            if (item && completionModel) controller.acceptSuggestion({ item, index: i, model: completionModel }, InsertFlags.None)
        },
        focus(i) { controller.setFocusIndex(i) },
        close() { controller.cancelSuggestWidget() },
    }

    // —— 模型事件 → 控件状态 ——
    const offsetOf = (p: { lineNumber: number, column: number }): number => editor.getModel()!.getOffsetAt(p)
    const wordSpan = (): { from: number, to: number } => {
        const m = editor.getModel()!
        const pos = editor.getPosition()!
        const w = m.getWordUntilPosition(pos)
        return { from: offsetOf({ lineNumber: pos.lineNumber, column: w.startColumn }), to: offsetOf(pos) }
    }
    let loadingTimer: ReturnType<typeof setTimeout> | undefined
    const clearLoading = () => { if (loadingTimer !== undefined) { clearTimeout(loadingTimer); loadingTimer = undefined } }

    const ctxInsertMode = ctxKeys.createKey<string | undefined>('suggestionInsertMode', undefined)
    const ctxMakesTextEdit = ctxKeys.createKey<boolean>('suggestionMakesTextEdit', true)
    const ctxHasInsertAndReplace = ctxKeys.createKey<boolean>('suggestionHasInsertAndReplaceRange', false)
    const ctxCanResolve = ctxKeys.createKey<boolean>('suggestionCanResolve', false)
    const ctxDetails = ctxKeys.createKey<boolean>('suggestWidgetDetailsVisible', false)
    const ctxOnEnter = ctxKeys.createKey<boolean>('acceptSuggestionOnEnter', true)

    const makesTextEdit = (item: CompletionItem): boolean => {
        const position = editor.getPosition()!
        const startColumn = item.editStart.column
        const endColumn = position.column
        if (editor.getOption('acceptSuggestionOnEnter') === 'smart'
            && model.state === State.Auto
            && !item.completion.additionalTextEdits
            && !(item.completion.insertTextRules! & CompletionItemInsertTextRule.InsertAsSnippet)
            && endColumn - startColumn === item.completion.insertText.length) {
            const old = editor.getModel()!.getValueInRange({ startLineNumber: position.lineNumber, startColumn, endLineNumber: position.lineNumber, endColumn })
            return old !== item.completion.insertText
        }
        return true
    }
    const syncItemKeys = (sel: ISelectedSuggestion | undefined) => {
        if (!sel) return
        const { item } = sel
        ctxMakesTextEdit.set(makesTextEdit(item))
        ctxHasInsertAndReplace.set(item.editInsertEnd.column !== item.editReplaceEnd.column || item.editInsertEnd.lineNumber !== item.editReplaceEnd.lineNumber)
        ctxCanResolve.set(Boolean(item.provider.resolveCompletionItem) || Boolean(item.completion.documentation) || item.completion.detail !== item.completion.label)
    }

    disposables.push(model.onDidTrigger(e => {
        explicit = !e.auto
        ctxInsertMode.set(editor.getOption('suggest').insertMode)
        ctxOnEnter.set(editor.getOption('acceptSuggestionOnEnter') !== 'off')
        // Monaco showTriggered:控件已显示就不动;手动触发的 50ms(shy 250ms)后还没结果 → Loading...
        if (e.auto || ui.state.open) return
        clearLoading()
        const { from, to } = wordSpan()
        loadingTimer = setTimeout(() => {
            loadingTimer = undefined
            if (model.state !== State.Idle && !ui.state.open) ui.showMessage('loading', from, to)
        }, e.shy ? 250 : 50)
    }))
    disposables.push(model.onDidSuggest(e => {
        if (e.triggerOptions.shy) return
        clearLoading()
        // 冻结(手动触发后又打字、旧结果原样留着):控件不动
        if (e.isFrozen && ui.state.open && !ui.state.message) return
        completionModel = e.completionModel
        items = e.completionModel.items
        const { from, to } = wordSpan()
        if (items.length === 0) {
            if (e.triggerOptions.auto) ui.hide()
            else ui.showMessage('empty', from, to)
            return
        }
        const focused = controller.getFocusedItem()
        ui.show({ host, count: items.length, selected: controller.selectionIndex, focused: !!focused, from, to })
        syncItemKeys(focused)
    }))
    disposables.push(model.onDidCancel(e => {
        clearLoading()
        if (!e.retrigger) { ui.hide(); items = []; completionModel = undefined }
    }))
    disposables.push(controller.onDidFocus(sel => {
        ui.setSelected(sel.index)
        syncItemKeys(sel)
    }))
    disposables.push({ dispose: ui.onDidShow(() => controller.notifyWidget(true)) }, { dispose: ui.onDidHide(() => controller.notifyWidget(false)) })
    disposables.push({ dispose: ui.subscribe(() => ctxDetails.set(ui.state.open && !ui.state.message && ui.state.details)) })

    // —— 键位命令 ——
    const key = <T,>(k: string) => ctxKeys.getContextKeyValue<T>(k)
    const visibleFocused = () => ui.state.open && !ui.state.message && ui.state.focused && !!controller.getFocusedItem()
    const atWordEnd = (): boolean => {
        const m = editor.getModel()
        const pos = editor.getPosition()
        if (!m || !pos) return false
        const w = m.getWordAtPosition(pos)
        return !!w && (w.endColumn === pos.column || w.startColumn + 1 === pos.column)
    }
    const tabCompletionOn = () => editor.getOption('tabCompletion') === 'on'
    const inSnippet = () => snippets.isInSnippet()
    const nextTab = () => inSnippet() && !!key<boolean>('hasNextTabstop') && (snippets.next(), true)
    const prevTab = () => inSnippet() && !!key<boolean>('hasPrevTabstop') && (snippets.prev(), true)
    const writable = () => !editor.getOption('readOnly')

    const trigger = (auto?: boolean): boolean => {
        if (!enabled || !writable() || !editor.hasModel()) return false
        if (ui.state.open) return false
        controller.triggerSuggest(undefined, auto)
        return true
    }

    ui.command = (name: SuggestCommandName, arg?: unknown): boolean => {
        if (!enabled) return false
        switch (name) {
            case 'accept':
                if (!visibleFocused()) return false
                controller.acceptSelectedSuggestion(true, false)
                return true
            case 'acceptAlt':
                if (!visibleFocused()) return false
                controller.acceptSelectedSuggestion(false, true)
                return true
            case 'enter': {
                if (!visibleFocused() || editor.getOption('acceptSuggestionOnEnter') === 'off') return false
                if (!makesTextEdit(controller.getFocusedItem()!.item)) return false
                controller.acceptSelectedSuggestion(true, false)
                return true
            }
            case 'tab': {
                if (visibleFocused()) { controller.acceptSelectedSuggestion(true, false); return true }
                if (nextTab()) return true
                if (tabCompletionOn() && !ui.state.open && !inSnippet() && editor.hasModel() && writable()) {
                    if (key<boolean>('hasOtherSuggestions')) { controller.acceptNextSuggestion(); return true }
                    if (atWordEnd()) { controller.triggerSuggestAndAcceptBest({ fallback: 'tab' }); return true }
                }
                return false
            }
            case 'shiftTab': {
                if (visibleFocused()) { controller.acceptSelectedSuggestion(false, true); return true }
                if (tabCompletionOn() && !ui.state.open && !inSnippet() && key<boolean>('hasOtherSuggestions')) { controller.acceptPrevSuggestion(); return true }
                return prevTab()
            }
            case 'trigger': {
                if (!enabled || !editor.hasModel()) return false
                if (ui.state.open) {
                    // 第二次按:有焦点项切详情,没有就先聚焦(Monaco toggleSuggestionDetails / focusSuggestion)
                    if (ui.state.message) return false
                    if (visibleFocused()) ui.setDetails(!ui.state.details)
                    else controller.focusSuggestion()
                    return true
                }
                return trigger()
            }
            case 'triggerAction':
                return trigger((arg as { auto?: boolean } | undefined)?.auto === true ? true : undefined)
            case 'close':
                if (!ui.state.open) return false
                controller.cancelSuggestWidget()
                return true
            case 'leaveSnippet':
                if (!inSnippet()) return false
                snippets.cancel(true)
                return true
        }
    }
    disposables.push({ dispose() { ui.command = null } })

    const live: SuggestLive = {
        setEnabled(on) {
            if (enabled === on) return
            enabled = on
            model.cancel()
            model.clear()
            ui.hide()
        },
        dispose() {
            clearLoading()
            for (const d of disposables.splice(0).reverse()) d.dispose()
            ui.hide()
        },
    }
    editor.onDidDispose(() => live.dispose())
    return live
}
