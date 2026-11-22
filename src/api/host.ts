// setValue / getValue / trigger(Monaco 编辑器实例上的几个核心方法),H1。
//
// setValue / getValue —— 编辑器版就是 model 的同名方法(codeEditorWidget.setValue = model.setValue),这里委托给 H3 的 TextModel,
//   语义(对照 TextModel.setValue → _setValueFromTextBuffer 源码核实):整篇换掉;版本号 +1;撤销栈清空;光标回 (1,1);
//   发 isFlush:true 的内容事件;换行符按新文本重新认;只读编辑器照样能 setValue。
// setModel / getModel —— 对照 codeEditorWidget.setModel:同一个 model 不动;onWillChangeModel → 换 → onDidChangeModel(null 也行)。
//   lite-monaco 里 model 就是 state.doc 的薄视图,"换"= 在同一个 EditorView 上整篇替换成新 model 的文档,并带上它自己的:
//   换行符、撤销栈(restoreHistory)、选区、折叠、缩进选项、语言。旧 model 收回快照(_detach),所以切回去时这些原样回来。
//   视图状态(滚动)Monaco 也不替宿主存,宿主自己 saveViewState / restoreViewState。
// trigger —— 对照 codeEditorWidget.trigger:先走核心编辑命令(下面的表),没命中再交给动作注册表(H2 的 getAction(id).run)。
import type { EditorContext } from './context'
import * as core from '../core/index'
import { cutCommand, pasteCommand, pasteText, rememberCopied } from '../core/input/clipboard'
import { clearHistory, historyField, restoreHistory } from '../core/edit/history'
import { indentConfig } from '../core/edit/enter'
import { getFoldState, setFoldState } from '../core/feature/foldstate'
import { eolSlot, hasEolSlot, modelForView, onWillDisposeModel, peekViewModel, setViewModel, EndOfLinePreference, type TextModel } from './model'
import type { Uri } from './uri'
import type { IModelChangedEvent } from './types'
import { flushAnnotation } from './context'
import { typedViaTrigger } from './events'
import { flushSearch } from '../core/feature/search'
import { inputHandler } from '../core/view/editorview'
import { EditorSelection } from '../core/model/selection'
import { CURSOR_HANDLERS } from './cursorcmds'
import { InputMode, overtypeRange } from '../core/edit/inputmode'
import { executeCommandById } from './commands'
import { EditorType } from './editorregistry'

type Cmd = (target: core.EditorView) => boolean | void | Promise<boolean>

/**
 * Monaco 核心 handler id → lite-monaco 命令(core 里的导出名)。同一个 Monaco id 有 Select 版的一并列出。
 * 名字找不到(core 没导出)时按没命中处理,交给动作注册表。
 */
export const TRIGGER_COMMANDS: Readonly<Record<string, string>> = {
    // 移动 / 选择
    cursorLeft: 'cursorCharLeft', cursorLeftSelect: 'selectCharLeft',
    cursorRight: 'cursorCharRight', cursorRightSelect: 'selectCharRight',
    cursorUp: 'cursorLineUp', cursorUpSelect: 'selectLineUp',
    cursorDown: 'cursorLineDown', cursorDownSelect: 'selectLineDown',
    cursorPageUp: 'cursorPageUp', cursorPageUpSelect: 'selectPageUp',
    cursorPageDown: 'cursorPageDown', cursorPageDownSelect: 'selectPageDown',
    cursorHome: 'cursorLineBoundaryBackward', cursorHomeSelect: 'selectLineBoundaryBackward',
    cursorEnd: 'cursorLineBoundaryForward', cursorEndSelect: 'selectLineBoundaryForward',
    cursorTop: 'cursorDocStart', cursorTopSelect: 'selectDocStart',
    cursorBottom: 'cursorDocEnd', cursorBottomSelect: 'selectDocEnd',
    cursorWordLeft: 'cursorWordLeft', cursorWordLeftSelect: 'selectWordLeft',
    cursorWordStartLeft: 'cursorWordStartLeft', cursorWordStartLeftSelect: 'selectWordStartLeft',
    cursorWordEndLeft: 'cursorWordEndLeft', cursorWordEndLeftSelect: 'selectWordEndLeft',
    cursorWordRight: 'cursorWordEndRight', cursorWordRightSelect: 'selectWordEndRight',
    cursorWordStartRight: 'cursorWordStartRight', cursorWordStartRightSelect: 'selectWordStartRight',
    cursorWordEndRight: 'cursorWordEndRight', cursorWordEndRightSelect: 'selectWordEndRight',
    cursorWordAccessibilityLeft: 'cursorWordAccessibilityLeft', cursorWordAccessibilityLeftSelect: 'selectWordAccessibilityLeft',
    cursorWordAccessibilityRight: 'cursorWordAccessibilityRight', cursorWordAccessibilityRightSelect: 'selectWordAccessibilityRight',
    cursorWordPartLeft: 'cursorSubwordBackward', cursorWordPartLeftSelect: 'selectSubwordBackward',
    cursorWordPartRight: 'cursorSubwordForward', cursorWordPartRightSelect: 'selectSubwordForward',
    cursorColumnSelectLeft: 'cursorColumnSelectLeft', cursorColumnSelectRight: 'cursorColumnSelectRight',
    cursorColumnSelectUp: 'cursorColumnSelectUp', cursorColumnSelectDown: 'cursorColumnSelectDown',
    cursorColumnSelectPageUp: 'cursorColumnSelectPageUp', cursorColumnSelectPageDown: 'cursorColumnSelectPageDown',
    selectAll: 'selectAll', expandLineSelection: 'selectLine',
    removeSecondaryCursors: 'simplifySelection', cancelSelection: 'simplifySelection',
    cursorUndo: 'cursorUndo', cursorRedo: 'cursorRedo',
    'editor.action.jumpToBracket': 'cursorMatchingBracket',
    scrollLineUp: 'scrollLineUp', scrollLineDown: 'scrollLineDown',
    scrollPageUp: 'scrollPageUp', scrollPageDown: 'scrollPageDown',
    // 编辑
    deleteLeft: 'deleteCharBackward', deleteRight: 'deleteCharForward',
    deleteWordLeft: 'deleteGroupBackward', deleteWordStartLeft: 'deleteWordStartLeft', deleteWordEndLeft: 'deleteWordEndLeft',
    deleteWordRight: 'deleteGroupForward', deleteWordStartRight: 'deleteWordStartRight', deleteWordEndRight: 'deleteWordEndRight',
    deleteInsideWord: 'deleteInsideWord',
    deleteWordPartLeft: 'deleteWordPartBackward', deleteWordPartRight: 'deleteWordPartForward',
    deleteAllLeft: 'deleteAllLeft', deleteAllRight: 'deleteAllRight',
    tab: 'insertTab', outdent: 'indentLess',
    'editor.action.indentLines': 'indentMore', 'editor.action.outdentLines': 'indentLess',
    undo: 'undo', redo: 'redo',
    lineBreakInsert: 'insertNewline',
}

interface TypePayload { text?: string }
interface CompositionPayload { text?: string, replacePrevCharCnt?: number, replaceNextCharCnt?: number, positionDelta?: number }
interface PastePayload { text?: string, pasteOnNewLine?: boolean, multicursorText?: string[] | null }

/** 打字:逐个字符走 inputHandler(自动补括号 / indentOnInput),都不认领就替换选区。单选区才问 handler(同键盘输入) */
function typeText(view: core.EditorView, text: string, overtype = false): void {
    if (view.state.readOnly) { view.attemptReadOnlyEdit?.(); return }
    // 多个字符(整段)Monaco 当一次打字,不拆
    const { state } = view
    const sel = state.selection.main
    if (state.selection.ranges.length === 1) {
        for (const h of state.facet(inputHandler)) if (h(view, sel.from, sel.to, text)) return
    } else if (state.facet(inputHandler).includes(core.closeBracketsInput) && core.closeBracketsInput(view, sel.from, sel.to, text)) {
        // 自动配对 / 过键 / 包裹对所有光标一起做(Monaco 每个光标都做同一件事)
        return
    }
    insertAtSelections(view, text, overtype)
}

/** 把每个选区换成 text;overtype 且全局输入模式是 overtype 时,同时吃掉光标后面等长的文本(Monaco ReplaceOvertypeCommand) */
function insertAtSelections(view: core.EditorView, text: string, overtype: boolean): void {
    const { state } = view
    // Monaco trimAutoWhitespace:上次回车 / Tab 自动留下的纯空白行,这次打字没碰它就清掉
    const trims = core.autoWhitespaceTrims(state, state.selection.ranges.map(r => ({ from: r.from, to: r.to, insert: text })))
    if (!(overtype && InputMode.getInputMode() === 'overtype')) {
        if (!trims.length) { view.dispatch(state.update(state.replaceSelection(text), { scrollIntoView: true, userEvent: 'input.type' })); return }
        const changes = state.changes([...trims, ...state.selection.ranges.map(r => ({ from: r.from, to: r.to, insert: text }))])
        const sel = state.selection.ranges.map(r => EditorSelection.cursor(changes.mapPos(r.from, -1) + text.length))
        view.dispatch(state.update({ changes, selection: EditorSelection.create(sel, state.selection.mainIndex), scrollIntoView: true, userEvent: 'input.type' }))
        return
    }
    const tr = state.changeByRange(r => {
        const o = overtypeRange(state, r.from, r.to, text.length)
        return { changes: { from: o.from, to: o.to, insert: text }, range: EditorSelection.cursor(r.from + text.length) }
    })
    view.dispatch(state.update(tr, { scrollIntoView: true, userEvent: 'input.type' }))
}

// ── 组合输入(IME / Mac 重音键):Monaco Cursor._compositionState + compositionEndWithInterceptors ──
interface CompLine { text: string, line: number, start: number, end: number }
interface CompOutcome { deleted: string, delStart: number, delEnd: number, inserted: string, insStart: number, insEnd: number, insFrom: number, insTo: number }
const compositions = new WeakMap<core.EditorView, CompLine[] | null>()

function captureComposition(state: core.EditorState): CompLine[] | null {
    const out: CompLine[] = []
    for (const r of state.selection.ranges) {
        const a = state.doc.lineAt(r.from), b = state.doc.lineAt(r.to)
        if (a.number !== b.number) return null
        out.push({ text: a.text, line: a.number, start: r.from - a.from, end: r.to - a.from })
    }
    return out
}

function commonPrefixLen(a: string, b: string): number { let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return i }
function commonSuffixLen(a: string, b: string): number { let i = 0; while (i < a.length && i < b.length && a[a.length - 1 - i] === b[b.length - 1 - i]) i++; return i }

function deduceComposition(orig: CompLine[] | null, state: core.EditorState): CompOutcome[] | null {
    if (!orig) return null
    const cur = captureComposition(state)
    if (!cur || cur.length !== orig.length) return null
    return orig.map((o, i) => {
        const c = cur[i]
        const prefix = Math.min(o.start, c.start, commonPrefixLen(o.text, c.text))
        const suffix = Math.min(o.text.length - o.end, c.text.length - c.end, commonSuffixLen(o.text, c.text))
        const insStart = prefix, insEnd = c.text.length - suffix
        const lineFrom = state.doc.line(c.line).from
        return {
            deleted: o.text.substring(prefix, o.text.length - suffix), delStart: o.start - prefix, delEnd: o.end - prefix,
            inserted: c.text.substring(insStart, insEnd), insStart: c.start - prefix, insEnd: c.end - prefix,
            insFrom: lineFrom + insStart, insTo: lineFrom + insEnd,
        }
    })
}

const isQuoteChar = (ch: string) => ch === '"' || ch === '\'' || ch === '`'

/** 组合中打字:自动补的闭符照常过键,其余当普通字符插入(不补闭、不包裹、不缩进、不电传) */
function typeInComposition(view: core.EditorView, text: string): void {
    if (view.state.readOnly) { view.attemptReadOnlyEdit?.(); return }
    if (core.typeInCompositionOvertype(view, text)) return
    insertAtSelections(view, text, false)
}

/** 组合结束(Monaco compositionEndWithInterceptors):单字符组合补做过键 / 包裹 / 补闭;overtype 模式吃掉后面等长文本 */
function endComposition(view: core.EditorView, source: string | null | undefined): void {
    const orig = compositions.get(view) ?? null
    compositions.delete(view)
    if (source !== 'keyboard' || view.state.readOnly) return
    const { state } = view
    const outs = deduceComposition(orig, state)
    if (!outs) return
    const inserted = outs[0].inserted
    if (outs.some(o => o.inserted !== inserted)) return
    const overtypeEnd = () => {
        if (InputMode.getInputMode() !== 'overtype') return
        const changes = outs.map(o => { const l = state.doc.lineAt(o.insTo); return { from: o.insTo, to: Math.min(l.to, o.insTo + (o.insTo - o.insFrom)), insert: '' } })
        view.dispatch(state.update({
            changes, selection: EditorSelection.create(state.selection.ranges.map(r => EditorSelection.cursor(r.head)), state.selection.mainIndex),
            userEvent: 'input.type', scrollIntoView: true,
        }))
    }
    if (!inserted || inserted.length !== 1) return overtypeEnd()
    const ch = inserted
    if (outs.some(o => o.deleted.length !== 0)) {
        // 看看是不是「选区 + 重音键」的包裹
        const close = core.surroundCloseFor(state, ch)
        if (close === null) return
        for (const o of outs) {
            if (o.delStart !== 0 || o.delEnd !== o.deleted.length) return
            if (/^[ \t]+$/.test(o.deleted)) return
            if (isQuoteChar(ch) && isQuoteChar(o.deleted)) return
        }
        const ranges = state.selection.ranges
        if (ranges.some(r => !r.empty) || ranges.length !== outs.length) return
        let shift = 0
        const changes: { from: number, insert: string }[] = [], sel: ReturnType<typeof EditorSelection.range>[] = []
        ranges.forEach((r, i) => {
            const text = outs[i].deleted + close
            changes.push({ from: r.head, insert: text })
            sel.push(EditorSelection.range(r.head + shift, r.head + shift + outs[i].deleted.length))
            shift += text.length
        })
        view.dispatch(state.update({ changes, selection: EditorSelection.create(sel, state.selection.mainIndex), userEvent: 'input.type.surround', scrollIntoView: true }))
        return
    }
    const over = core.compositionEndOvertype(state, ch)
    if (over) { view.dispatch(over); return }
    const open = core.compositionEndAutoClose(state, ch, view)
    if (open) { view.dispatch(open); return }
    overtypeEnd()
}

/** 下一个字素簇的 UTF-16 长度(Monaco strings.nextCharLength:代理对 / 组合符 / ZWJ 序列算一个) */
function nextCharLength(text: string, at: number): number {
    const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text.slice(at))[Symbol.iterator]().next()
    return seg.done ? 1 : seg.value.segment.length
}

/**
 * source === 'keyboard' 的打字(Monaco Cursor.type):逐字素解释 —— 回车走完整的回车命令(缩进规则 / onEnter),
 * 其余字符走 typeText(inputHandler:自动配对 / 电传字符)。别的 source 整段当普通插入,不解释。
 */
function typeKeyboard(view: core.EditorView, text: string): void {
    const composing = compositions.has(view)
    for (let i = 0; i < text.length;) {
        const n = nextCharLength(text, i)
        const ch = text.slice(i, i + n)
        if (composing) typeInComposition(view, ch)
        else if (ch === '\n' || ch === '\r') core.insertNewlineAndIndent(view)
        else typeText(view, ch, true)
        i += n
    }
}

function compositionType(view: core.EditorView, p: CompositionPayload): void {
    if (view.state.readOnly) { view.attemptReadOnlyEdit?.(); return }
    const { state } = view
    const text = p.text ?? ''
    const prev = Math.max(0, p.replacePrevCharCnt ?? 0), next = Math.max(0, p.replaceNextCharCnt ?? 0)
    if (!text.length && !prev && !next) {
        // 空操作:只按 positionDelta 挪光标
        if (p.positionDelta) view.dispatch(state.update({ selection: EditorSelection.create(state.selection.ranges.map(r => EditorSelection.cursor(Math.max(0, Math.min(state.doc.length, r.head + (p.positionDelta ?? 0))))), state.selection.mainIndex) }))
        return
    }
    const tr = state.changeByRange(r => {
        // 非空选区:组合被取消前先有了光标操作(Monaco #2773),忽略这次组合
        if (!r.empty) return { range: r }
        const line = state.doc.lineAt(r.head)
        const from = Math.max(line.from, r.from - prev), to = Math.min(line.to, r.to + next)
        const head = from + text.length + (p.positionDelta ?? 0)
        return { changes: { from, to, insert: text }, range: EditorSelection.cursor(Math.max(from, Math.min(head, from + text.length))) }
    })
    view.dispatch(state.update(tr, { scrollIntoView: true, userEvent: 'input.type.compose' }))
}

let editorCounter = 0

export function installHost(ctx: EditorContext): void {
    const { view, api, host } = ctx
    const model = (): TextModel => modelForView(view, host, fn => ctx.onDispose(fn))

    api.setValue = (value: string): void => {
        if (value === null || value === undefined) return
        model().setValue(String(value))
    }

    api.getValue = (options?: { preserveBOM?: boolean, lineEnding?: string }): string => {
        const le = options?.lineEnding
        const eol = le === '\n' ? EndOfLinePreference.LF : le === '\r\n' ? EndOfLinePreference.CRLF : EndOfLinePreference.TextDefined
        return model().getValue(eol, !!options?.preserveBOM)
    }

    // ── 生命周期 / 身份 ──
    const onDisposeEm = ctx.events.emitter<void>()
    ctx.onDispose(() => onDisposeEm.fire())
    api.onDidDispose = onDisposeEm.event
    api.dispose = (): void => { view.destroy() }
    const id = `editor#${++editorCounter}`
    api.getId = (): string => id
    api.getEditorType = (): string => EditorType.ICodeEditor
    // Monaco getContribution(id) 返回 contribution 实例;lite-monaco 的功能不是 contribution 对象,统一返回 null(调用方按"没有"处理)
    api.getContribution = (): null => null
    api.handleInitialized = (): void => {}

    // ── setModel / getModel ──
    const onWill = ctx.events.emitter<IModelChangedEvent>()
    const onDid = ctx.events.emitter<IModelChangedEvent>()
    let noModel = false
    api.onWillChangeModel = onWill.event
    api.onDidChangeModel = onDid.event
    api.getModel = (): TextModel | null => (noModel ? null : model())
    api.hasModel = (): boolean => !noModel

    api.setModel = (next: TextModel | null): void => {
        const old: TextModel | null = noModel ? null : peekViewModel(view) ?? null
        if (next === old) return
        if (next === null && noModel) return
        if (next && next.isDisposed()) throw new Error('Model is disposed!')
        const urlOf = (m: TextModel | null): Uri | null => (m ? m.uri : null)
        const oldForEvent = noModel ? null : old ?? model()
        const ev: IModelChangedEvent = { oldModelUrl: urlOf(oldForEvent), newModelUrl: urlOf(next) }
        onWill.fire(ev)

        // 1. 旧 model 收回快照(附着时它读写的就是 view.state;之后它自己握着)
        oldForEvent?._release(view)
        // 另一个编辑器正用着的 model:那边降成镜像继续跟着改(同一个 model 可被多个编辑器显示),本视图接任主视图
        next?._demote()

        // 2. 新内容整篇进来:换行符、撤销栈、选区一个事务
        const snap = next ? next.getState() : null
        // 直接把 model 的文档树当插入内容(树不可变、可共享):不 toString 成几十 MB 的字符串再切行重建
        const text = snap ? snap.doc : ''
        const effects = []
        const eol = snap ? snap.lineBreak : view.state.lineBreak
        if (hasEolSlot(view.state) && eol !== view.state.lineBreak) effects.push(eolSlot.reconfigure(core.EditorState.lineSeparator.of(eol)))
        const hist = snap?.field(historyField, false)
        const sel = snap ? snap.selection : null
        view.dispatch(view.state.update({
            changes: { from: 0, to: view.state.doc.length, insert: text },
            selection: sel ?? { anchor: 0 },
            effects,
            annotations: [flushAnnotation.of(true), flushSearch.of(true), ...(hist ? [restoreHistory.of(hist)] : [clearHistory.of(true)])],
            userEvent: 'setmodel',
        }))
        // 3. 折叠:先全展开(旧文档的折叠行号不属于新文档),再还原新 model 自己的
        core.unfoldAll(view)
        if (snap) {
            const tr = setFoldState(view.state, getFoldState(snap))
            if (tr) view.dispatch(tr)
        }
        // 4. 缩进选项、语言
        if (snap) host.setModelOptions(indentConfig(snap))
        noModel = next === null
        if (next) {
            setViewModel(view, next)
            next._attach(view, host)
        } else setViewModel(view, null)
        ctx.modelSwitched.fire()
        // 编辑器自己建的临时 model(没人 createModel 过)换走就销毁,Monaco 里编辑器拥有它
        if (oldForEvent && (oldForEvent as unknown as { _implicit?: boolean })._implicit && !oldForEvent.isDisposed()) oldForEvent.dispose()
        onDid.fire(ev)
    }

    // Monaco codeEditorWidget._attachModel:model.onWillDispose(() => this.setModel(null))。显示中的 model 被销毁,编辑器先放下它(getModel() 变 null、发 onDidChangeModel),之后 setModel 别的 model 照常
    // 编辑器销毁时它的隐式 model 跟着销毁,那时不该再 setModel(null)(会再造一个隐式 model)
    const offWillDispose = onWillDisposeModel(m => {
        if (!view.isDestroyed && !noModel && peekViewModel(view) === m) (api.setModel as (m: TextModel | null) => void)(null)
    })
    ctx.onDispose(() => offWillDispose.dispose())

    api.trigger = (source: string | null | undefined, handlerId: string, payload?: unknown): void => {
        const id = handlerId.startsWith('default:') ? handlerId.slice('default:'.length) : handlerId
        switch (id) {
            case 'type': {
                const text = (payload as TypePayload | undefined)?.text ?? ''
                if (source === 'keyboard') typedViaTrigger(view, text, () => view.batchEvents(() => typeKeyboard(view, text))); else typeText(view, text)
                return
            }
            case 'compositionStart': compositions.set(view, captureComposition(view.state)); return
            case 'compositionEnd': endComposition(view, source); return
            case 'compositionType': compositionType(view, (payload ?? {}) as CompositionPayload); return
            case 'replacePreviousChar': compositionType(view, { text: (payload as TypePayload | undefined)?.text ?? '', replacePrevCharCnt: Math.max(0, (payload as { replaceCharCnt?: number } | undefined)?.replaceCharCnt ?? 0) }); return
            case 'cut': cutCommand(view); return
            case 'paste': {
                const p = (payload ?? {}) as PastePayload
                if (typeof p.text === 'string') {
                    // Monaco viewModel.paste(text, pasteOnNewLine, multicursorText):后两个就是复制时记下的元数据,等价于先 rememberCopied 再粘贴
                    if (p.pasteOnNewLine || p.multicursorText) rememberCopied(p.text, { isFromEmptySelection: !!p.pasteOnNewLine, multicursorText: p.multicursorText ?? null })
                    pasteText(view, p.text)
                }
                else pasteCommand(view)
                return
            }
        }
        const handler = CURSOR_HANDLERS[id]
        if (handler && handler(view, payload)) return
        const name = TRIGGER_COMMANDS[id]
        const fn = name ? (core as unknown as Record<string, unknown>)[name] : undefined
        if (typeof fn === 'function') { (fn as Cmd)(view); return }
        // 没命中核心 handler:动作注册表(H2 的 getAction)。再没有就和 Monaco 一样什么都不做
        const getAction = (view as unknown as { getAction?: (id: string) => { run(args?: unknown): unknown } | null }).getAction
        const action = typeof getAction === 'function' ? getAction.call(view, handlerId) : null
        if (action) { void action.run(payload); return }
        // 再没有:交给命令表(Monaco `_commandService.executeCommand(handlerId, payload)`),全局 registerCommand / addCommand 的命令在这里被打到
        executeCommandById(view, handlerId, payload ?? {})
    }

    // Monaco codeEditorWidget:setValue / setModel / trigger 各括进一次更新(onBeginUpdate / onEndUpdate),嵌套只发最外层
    const bracket = <F extends (...a: never[]) => unknown>(f: F): F => ((...a: Parameters<F>) => view.runUpdate(() => f(...a))) as F
    api.setValue = bracket(api.setValue as (v: string) => void) as typeof api.setValue
    api.setModel = bracket(api.setModel as (m: TextModel | null) => void) as typeof api.setModel
    // trigger 的视图更新合并到微任务里一次画(Monaco 的视图也是攒到下一帧才 render):同步循环里连着 trigger 只画一次
    const trigger = bracket(api.trigger as (s: string | null | undefined, h: string, p?: unknown) => void)
    api.trigger = ((s: string | null | undefined, h: string, p?: unknown) => view.deferView(() => trigger(s, h, p))) as typeof api.trigger
}
