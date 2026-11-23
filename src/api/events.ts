// 实例事件与焦点(Monaco ICodeEditor 的 onDid* / onMouse* / onKey*),H1。
//
// 都是挂在 view.dom / contentDOM 上的旁听监听 + 事务监听,不改任何已有行为。
//   焦点        onDidFocus/BlurEditorText(contentDOM)、onDidFocus/BlurEditorWidget(view.dom 内任意元素有焦点)、hasWidgetFocus
//   输入法      onDidCompositionStart/End
//   只读拒编    onDidAttemptReadOnlyEdit(readonlymessage.ts 的 onReadOnlyAttempt;一次按键只发一次)
//   粘贴        onDidPaste(任何路径落成 input.paste 的事务;clipboardEvent 只有 DOM paste 事件那条路径有)
//   鼠标        onMouseDown/Up/Move/Leave/ContextMenu/Drop(目标取 V 的 getTargetAtClientPoint,没有就按 DOM 粗分类)
//   键盘        onKeyDown/Up(contentDOM 捕获阶段,先于键位表)
//   内容/选项   onDidChangeModelContent / onDidChangeModelOptions 转发当前 model(H3 的 TextModel,事件形态由它保证);onDidChangeHiddenAreas 自己比折叠
import type { EditorContext } from './context'
import type {
    IDisposable, IEditorMouseEvent, IKeyboardEvent, IModelContentChangedEvent, IModelOptionsChangedEvent,
    IMouseEvent, IMouseTarget, IPasteEvent, IPartialEditorMouseEvent,
} from './types'
import { modelForView, type IModelLanguageChangedEvent, type IModelLanguageConfigurationChangedEvent } from './model'
import { MouseTargetType } from '../core/view/viewapi'
import { Range, Position, Selection } from './position'
import { keyCodeFromEvent, modifiersFromEvent } from './keycodes'
import { onReadOnlyAttempt } from '../core/feature/readonlymessage'
import { hiddenRanges, foldField, hiddenAreasField, setHiddenAreasEffect } from '../core/edit/fold'
import type { EditorState, Transaction } from '../core/model/state'

function toMouseEvent(e: MouseEvent): IMouseEvent {
    return {
        browserEvent: e,
        leftButton: e.button === 0,
        middleButton: e.button === 1,
        rightButton: e.button === 2,
        buttons: e.buttons,
        target: e.target as HTMLElement,
        detail: e.detail,
        posx: e.pageX,
        posy: e.pageY,
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        metaKey: e.metaKey,
        timestamp: e.timeStamp,
        get defaultPrevented() { return e.defaultPrevented },
        preventDefault: () => e.preventDefault(),
        stopPropagation: () => e.stopPropagation(),
    }
}

function toKeyboardEvent(e: KeyboardEvent): IKeyboardEvent {
    const keyCode = keyCodeFromEvent(e)
    return {
        _standardKeyboardEventBrand: true,
        browserEvent: e,
        target: e.target as HTMLElement,
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        metaKey: e.metaKey,
        altGraphKey: typeof e.getModifierState === 'function' && e.getModifierState('AltGraph'),
        keyCode,
        code: e.code,
        // 单段键位:修饰键位 | KeyCode(和弦只比第一段,同 Monaco StandardKeyboardEvent.equals)
        equals: (keybinding: number) => ((keybinding & 0xFFFF) >>> 0) === ((modifiersFromEvent(e) | keyCode) >>> 0),
        preventDefault: () => e.preventDefault(),
        stopPropagation: () => e.stopPropagation(),
    }
}

/** 没有 V 的 getTargetAtClientPoint 时的粗分类:按 DOM 位置给 type / element / position */
function fallbackTarget(ctx: EditorContext, e: MouseEvent): IMouseTarget {
    const { view } = ctx
    const el = e.target as Element | null
    let type = MouseTargetType.UNKNOWN
    let position: Position | null = null
    let range: Range | null = null
    const inside = (sel: string) => !!el && !!(el as Element).closest?.(sel)
    if (!el || !view.dom.contains(el)) type = MouseTargetType.OUTSIDE_EDITOR
    else if (inside('.cm-gutters')) type = inside('.cm-lineNumbers, .cm-gutterElement') ? MouseTargetType.GUTTER_LINE_NUMBERS : MouseTargetType.GUTTER_LINE_DECORATIONS
    else if (inside('.cm-minimap, .cm-vscrollbar, .cm-hscrollbar, .cm-scrollbar, [class*="scrollbar"]')) type = MouseTargetType.SCROLLBAR
    else if (inside('.cm-content')) {
        const pos = view.posAtCoords({ x: e.clientX, y: e.clientY }, false)
        if (pos != null) {
            const line = view.state.doc.lineAt(pos)
            position = new Position(line.number, pos - line.from + 1)
            range = new Range(line.number, pos - line.from + 1, line.number, pos - line.from + 1)
            type = pos === line.to && e.clientX > (view.contentDOM.getBoundingClientRect().left || 0) + 1 && line.length === 0 ? MouseTargetType.CONTENT_EMPTY : MouseTargetType.CONTENT_TEXT
        } else type = MouseTargetType.CONTENT_EMPTY
    } else if (inside('.cm-scroller')) type = MouseTargetType.CONTENT_EMPTY
    else type = MouseTargetType.OVERLAY_WIDGET
    return { element: el as HTMLElement | null, type, position, mouseColumn: position ? position.column : 0, range, detail: null } as unknown as IMouseTarget
}

/**
 * 一笔 input.type 事务对应「用户敲了什么」(Monaco onDidType 的文本):
 * 有插入 = 插入的文本(自动配对把「(」写成「()」且光标落在中间时,只算敲的那个「(」);
 * 无改动但光标向右挪了一格 = 越过了已有的闭合字符(Monaco 同样把它当一次打字)。
 */
function typedText(tr: Transaction, after: EditorState): string {
    let text = ''
    let at = -1
    tr.changes.iterChanges((_fa, _ta, fb, _tb, ins) => { if (at < 0) at = fb; text += ins.toString() })
    const head = after.selection.main.head
    if (text) return text.length === 2 && after.selection.main.empty && head === at + 1 ? text[0] : text
    if (tr.docChanged) return ''
    const before = tr.startState.selection.main
    if (before.empty && after.selection.main.empty && head === before.head + 1) return after.doc.sliceString(before.head, head)
    return ''
}

// trigger('keyboard', 'type', { text }) 的 onDidType:Monaco 在整段 type 命令跑完后只发一次、文本 = 整段 payload(不是逐字符)。
// installEvents 登记 sink;typedViaTrigger 期间 settled 监听不再按事务逐笔发,跑完再一次性发。
const typeSinks = new WeakMap<object, { suppress: number, fire(text: string): void }>()
export function typedViaTrigger(view: object, text: string, run: () => void): void {
    const sink = typeSinks.get(view)
    if (!sink) { run(); return }
    sink.suppress++
    try { run() } finally { sink.suppress-- }
    if (text) sink.fire(text)
}

const mapEvent = <T, U>(ev: (l: (e: T) => unknown, thisArg?: unknown) => IDisposable, f: (e: T) => U) =>
    (l: (e: U) => unknown, thisArg?: unknown): IDisposable => ev(e => l.call(thisArg, f(e)))

export function installEvents(ctx: EditorContext): void {
    const { view, api } = ctx
    const hub = ctx.events
    const dom = view.dom
    const content = view.contentDOM
    const listen = <K extends keyof HTMLElementEventMap>(el: HTMLElement, type: K, fn: (e: HTMLElementEventMap[K]) => void, capture = false) => {
        el.addEventListener(type, fn as EventListener, capture)
        ctx.onDispose(() => el.removeEventListener(type, fn as EventListener, capture))
    }

    // ── 焦点 ──
    const onFocusText = hub.emitter<void>()
    const onBlurText = hub.emitter<void>()
    const onFocusWidget = hub.emitter<void>()
    const onBlurWidget = hub.emitter<void>()
    let textFocused = false
    let widgetFocused = false
    const setWidget = (on: boolean) => {
        if (widgetFocused === on) return
        widgetFocused = on
        ;(on ? onFocusWidget : onBlurWidget).fire()
    }
    const setText = (on: boolean) => {
        if (textFocused === on) return
        textFocused = on
        ;(on ? onFocusText : onBlurText).fire()
    }
    listen(content, 'focus', () => { setText(true); setWidget(true) })
    listen(content, 'blur', () => setText(false))
    listen(dom, 'focusin', () => setWidget(true))
    listen(dom, 'focusout', e => {
        const next = e.relatedTarget as Node | null
        if (next && dom.contains(next)) return
        setText(false)
        setWidget(false)
    })
    // 构造时已经有焦点(宿主先聚焦了 parent 里的东西)
    if (view.hasFocus) { textFocused = true; widgetFocused = true }
    api.hasWidgetFocus = (): boolean => widgetFocused
    api.hasTextFocus = (): boolean => textFocused

    // ── 输入法 ──
    const onCompStart = hub.emitter<void>()
    const onCompEnd = hub.emitter<void>()
    listen(content, 'compositionstart', () => onCompStart.fire())
    // 失焦等路径下 compositionend 先到、DOM 里的组字文本还没读进 model:先 flush 再通知,
    // 订阅者(suggest 等)在 onDidCompositionEnd 里看到的 model 已经含提交文本(同 Monaco:内容变更先于 end)。
    listen(content, 'compositionend', () => { try { view.observer.forceFlush() } catch { /* 观察者不可用时照常通知 */ } onCompEnd.fire() })

    // ── 只读拒编:同一次按键里 keydown + beforeinput 各来一次,合并成一次 ──
    const onReadOnly = hub.emitter<void>()
    let readOnlyPending = false
    ctx.onDispose(onReadOnlyAttempt(view, () => {
        if (readOnlyPending) return
        readOnlyPending = true
        setTimeout(() => { readOnlyPending = false }, 0)
        onReadOnly.fire()
    }))

    // ── 粘贴 ──
    const onPaste = hub.emitter<IPasteEvent>()
    const onType = hub.emitter<string>()
    // onWillType:input.type 事务落地之前发(此时 getSelections() 还是打字前的;Monaco 在光标命令执行前发)。文本取事务里插入的字
    const onWillType = hub.emitter<string>()
    const dispatchOrig = view.dispatch
    view.dispatch = (tr: Transaction) => {
        if (onWillType.hasListeners && tr.isUserEvent('input.type') && !tr.isUserEvent('input.type.compose')) {
            let text = ''
            tr.changes.iterChanges((_fa, _ta, _fb, _tb, ins) => { text += ins.toString() })
            onWillType.fire(text)
            // 监听者(提交符接受补全等)改了文档:这笔输入是按旧状态算的,不能再套到新状态上,按新状态重算(Monaco 在光标命令执行前发事件,打字永远落在最新文本上)
            if (view.state !== tr.startState) {
                dispatchOrig(view.state.update(view.state.replaceSelection(text), { scrollIntoView: true, userEvent: 'input.type' }))
                return
            }
        }
        dispatchOrig(tr)
    }
    ctx.onDispose(() => { view.dispatch = dispatchOrig })
    let lastPasteEvent: ClipboardEvent | undefined
    listen(content, 'paste', e => {
        lastPasteEvent = e
        setTimeout(() => { if (lastPasteEvent === e) lastPasteEvent = undefined }, 0)
    }, true)

    // ── 鼠标 ──
    const down = hub.emitter<IEditorMouseEvent>()
    const up = hub.emitter<IEditorMouseEvent>()
    const move = hub.emitter<IEditorMouseEvent>()
    const menu = hub.emitter<IEditorMouseEvent>()
    const drop = hub.emitter<IEditorMouseEvent>()
    const leave = hub.emitter<IPartialEditorMouseEvent>()
    const targetOf = (e: MouseEvent): IMouseTarget => {
        const v = view as unknown as { getTargetAtClientPoint?: (x: number, y: number) => IMouseTarget | null }
        const t = typeof v.getTargetAtClientPoint === 'function' ? v.getTargetAtClientPoint(e.clientX, e.clientY) : null
        return t ?? fallbackTarget(ctx, e)
    }
    const mouse = (em: { hasListeners: boolean, fire(e: IEditorMouseEvent): void }) => (e: MouseEvent) => {
        if (em.hasListeners) em.fire({ event: toMouseEvent(e), target: targetOf(e) })
    }
    listen(dom, 'mousedown', mouse(down), true)
    listen(dom, 'mouseup', mouse(up), true)
    listen(dom, 'mousemove', mouse(move), true)
    listen(dom, 'contextmenu', mouse(menu), true)
    listen(dom, 'drop', mouse(drop), true)
    listen(dom, 'mouseleave', e => {
        if (leave.hasListeners) leave.fire({ event: toMouseEvent(e), target: null })
    })

    // ── 键盘 ──
    const keyDown = hub.emitter<IKeyboardEvent>()
    const keyUp = hub.emitter<IKeyboardEvent>()
    listen(content, 'keydown', e => { if (keyDown.hasListeners) keyDown.fire(toKeyboardEvent(e)) }, true)
    listen(content, 'keyup', e => { if (keyUp.hasListeners) keyUp.fire(toKeyboardEvent(e)) }, true)

    // ── 内容 / 模型选项:转发当前 model(H3 的 TextModel)的事件,换 model 时重新订阅。没人订阅就不去建 model ──
    const hooks = { onFirstListener: () => bindModel(), onLastListener: () => bindModel() }
    const onContent = hub.emitter<IModelContentChangedEvent>(hooks)
    const onModelOptions = hub.emitter<IModelOptionsChangedEvent>(hooks)
    const onModelLanguage = hub.emitter<IModelLanguageChangedEvent>(hooks)
    const onModelLanguageConfig = hub.emitter<IModelLanguageConfigurationChangedEvent>(hooks)
    let modelSubs: IDisposable[] = []
    const unbindModel = () => { for (const d of modelSubs.splice(0)) d.dispose() }
    const bindModel = () => {
        unbindModel()
        if (!onContent.hasListeners && !onModelOptions.hasListeners && !onModelLanguage.hasListeners && !onModelLanguageConfig.hasListeners) return
        // 没有 model(还没 setModel、setModel(null)、已销毁):不绑,也不为了绑去建一个;换上 model 时 modelSwitched 会再叫
        if (ctx.noModel || view.isDestroyed) return
        const m = modelForView(view, ctx.host, fn => ctx.onDispose(fn))
        modelSubs = [
            m.onDidChangeContentSettled(e => onContent.fire(e)),
            m.onDidChangeOptions(e => onModelOptions.fire(e)),
            m.onDidChangeLanguage(e => onModelLanguage.fire(e)),
            m.onDidChangeLanguageConfiguration(e => onModelLanguageConfig.fire(e)),
        ]
    }
    ctx.onDispose(unbindModel)
    ctx.onDispose(ctx.modelSwitched.event(() => bindModel()).dispose)

    const typeSink = { suppress: 0, fire: (text: string) => onType.fire(text) }
    typeSinks.set(view, typeSink)
    // onDidType:内容事件、光标事件都发完之后(Monaco 在 type 命令跑完才发)
    ctx.onDispose(view.onTransactionSettled((tr, v) => {
        if (tr.isUserEvent('input.type') && !tr.isUserEvent('input.type.compose') && onType.hasListeners && !typeSink.suppress) {
            const typed = typedText(tr, v.state)
            if (typed) onType.fire(typed)
        }
    }))

    // ── 折叠区:每笔事务比一下隐藏的行范围,只在有人订阅时算 ──
    const onHidden = hub.emitter<void>()
    let lastFolds = view.state.field(foldField, false)
    let lastAreas = view.state.field(hiddenAreasField, false)
    const hiddenKey = (s: EditorState) => hiddenRanges(s).map(r => `${s.doc.lineAt(r.from).number}-${s.doc.lineAt(r.to).number}`).join(',')
    let hidden = hiddenKey(view.state)
    view.onTransaction(tr => {
        const state = view.state
        const folds = state.field(foldField, false)
        const areas = state.field(hiddenAreasField, false)
        if ((tr.docChanged || folds !== lastFolds || areas !== lastAreas) && onHidden.hasListeners) {
            const k = hiddenKey(state)
            if (k !== hidden) { hidden = k; onHidden.fire() }
        }
        lastFolds = folds
        lastAreas = areas
        if (tr.isUserEvent('input.paste') && tr.docChanged && onPaste.hasListeners) {
            const start = tr.startState.selection.main.from
            const end = state.selection.main.from
            const startLine = tr.startState.doc.lineAt(start)
            const endLine = state.doc.lineAt(end)
            // Monaco:起点 = 粘贴前主选区起点,终点 = 粘贴后主选区起点(粘贴后光标落在插入文本尾)
            const range = new Range(startLine.number, start - startLine.from + 1, endLine.number, end - endLine.from + 1)
            onPaste.fire({ range, languageId: ctx.host.getLanguageId(), clipboardEvent: lastPasteEvent })
        }
    })

    // Monaco 的光标事件带 Selection / Position 实例(core 内部是同形状的普通对象;这里提升成类实例,字段是它的超集)。
    // applyApi 不覆盖 view 上已有的成员,所以直接在实例上改写这两个事件属性。
    const coreSel = view.onDidChangeCursorSelection
    const corePos = view.onDidChangeCursorPosition
    Object.defineProperties(view, {
        onDidChangeCursorSelection: {
            configurable: true, writable: true, enumerable: false,
            value: mapEvent(coreSel, e => ({
                ...e, selection: Selection.liftSelection(e.selection), secondarySelections: e.secondarySelections.map(s => Selection.liftSelection(s)),
                oldSelections: e.oldSelections && e.oldSelections.map(s => Selection.liftSelection(s)),
            })),
        },
        onDidChangeCursorPosition: {
            configurable: true, writable: true, enumerable: false,
            value: mapEvent(corePos, e => ({
                ...e, position: new Position(e.position.lineNumber, e.position.column), secondaryPositions: e.secondaryPositions.map(p => new Position(p.lineNumber, p.column)),
            })),
        },
    })

    Object.assign(api, {
        onDidFocusEditorText: onFocusText.event,
        onDidBlurEditorText: onBlurText.event,
        onDidFocusEditorWidget: onFocusWidget.event,
        onDidBlurEditorWidget: onBlurWidget.event,
        onDidCompositionStart: onCompStart.event,
        onDidCompositionEnd: onCompEnd.event,
        onDidAttemptReadOnlyEdit: onReadOnly.event,
        onDidPaste: onPaste.event,
        onDidType: onType.event,
        onBeginUpdate: view.onBeginUpdate,
        onEndUpdate: view.onEndUpdate,
        onWillType: onWillType.event,
        onMouseDown: down.event,
        onMouseUp: up.event,
        onMouseMove: move.event,
        onMouseLeave: leave.event,
        onContextMenu: menu.event,
        onMouseDrop: drop.event,
        onKeyDown: keyDown.event,
        onKeyUp: keyUp.event,
        onDidChangeModelContent: onContent.event,
        onDidChangeModelOptions: onModelOptions.event,
        onDidChangeModelLanguage: onModelLanguage.event,
        onDidChangeModelLanguageConfiguration: onModelLanguageConfig.event,
        onDidChangeHiddenAreas: onHidden.event,
        // Monaco editor.setHiddenAreas:整行段藏掉(行号保留,几何随之收拢),不带折叠占位
        setHiddenAreas(ranges: readonly { startLineNumber: number, endLineNumber: number }[]) {
            view.dispatch(view.state.update({ effects: setHiddenAreasEffect.of(ranges.map(r => ({ startLine: r.startLineNumber, endLine: r.endLineNumber }))) }))
        },
    })
}
