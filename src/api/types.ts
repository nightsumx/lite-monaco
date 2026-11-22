// Monaco 实例 API 的类型汇总(H1 维护)。
//
// `liteMonaco()` 返回 `LiteMonacoEditor = core.EditorView & IStandaloneCodeEditorApi`。
// 各方法组(H2 actions / commands / decorations / widgets / contextkeys,H3 model / markers / ...,V 的 reveal* / scroll*)
// 把自己的方法定义成接口放在各自文件里,在文末 `IStandaloneCodeEditorApi` 的 extends 里登记。
// EditorView 已有的同名方法(layout / reconfigure / 以及 V 加在 editorview.ts 里的)优先,install 不会覆盖。
import type * as core from '../core/index'
import type { IPosition, IRange, ISelection, Range } from './position'
import type { Uri } from './uri'
import { MouseTargetType, type IMouseTarget } from '../core/view/viewapi'
import type { ITextModel, IModelLanguageChangedEvent, IModelLanguageConfigurationChangedEvent } from './model'
import type { IActionsApi } from './actions'
import type { ICommandsApi } from './commands'
import type { IContextKeysApi } from './contextkeys'
import type { IDecorationsApi } from './decorations'
import type { IWidgetsApi } from './widgets'
import type { ComputedEditorOptions, IComputedEditorOptions, EditorOption, IEditorOptions, ConfigurationChangedEvent } from '../core/options'

// ───────────── 基础类型(Monaco 同名同形) ─────────────

export interface IDisposable { dispose(): void }
/** Monaco IEvent:订阅返回 IDisposable。与 lang/tsapi 的 IEvent 结构兼容 */
export type IEvent<T> = (listener: (e: T) => any, thisArg?: any) => IDisposable

export type { IPosition, IRange, ISelection }

// ───────────── 事件载荷 ─────────────

/** 一处文本改动(Monaco IModelContentChange) */
export interface IModelContentChange {
    readonly range: IRange
    readonly rangeOffset: number
    readonly rangeLength: number
    readonly text: string
}
/** onDidChangeModelContent 的载荷(Monaco IModelContentChangedEvent) */
export interface IModelContentChangedEvent {
    readonly changes: IModelContentChange[]
    readonly eol: string
    readonly versionId: number
    readonly isUndoing: boolean
    readonly isRedoing: boolean
    readonly isFlush: boolean
    readonly isEolChange: boolean
    /** @internal 这次变更的来源(Monaco TextModelEditSource);一笔事务一个,覆盖全部 changes */
    readonly detailedReasons?: import('./editsource').TextModelEditSource[]
    /** @internal 与 detailedReasons 一一对应:每个原因覆盖几个 change */
    readonly detailedReasonsChangeLengths: number[]
}
/** onDidChangeModelOptions(Monaco IModelOptionsChangedEvent) */
export interface IModelOptionsChangedEvent {
    readonly tabSize: boolean
    readonly indentSize: boolean
    readonly insertSpaces: boolean
    readonly trimAutoWhitespace: boolean
}
/** onDidChangeConfiguration 的载荷(Monaco ConfigurationChangedEvent) */
export type IConfigurationChangedEvent = ConfigurationChangedEvent
/** onWillChangeModel / onDidChangeModel(Monaco IModelChangedEvent;模型是 H3 的 ITextModel 视图,这里用 uri 字符串区分) */
export interface IModelChangedEvent {
    readonly oldModelUrl: Uri | null
    readonly newModelUrl: Uri | null
}
/** onDidPaste(Monaco IPasteEvent) */
export interface IPasteEvent {
    readonly range: Range
    readonly languageId: string | null
    readonly clipboardEvent?: ClipboardEvent
}
export type { IMouseTarget }
export { MouseTargetType }

/** onMouseDown / Up / Move / ContextMenu / Drop(Monaco IEditorMouseEvent) */
export interface IEditorMouseEvent {
    readonly event: IMouseEvent
    readonly target: IMouseTarget
}
/** onMouseLeave(Monaco IPartialEditorMouseEvent:鼠标已经离开,命中目标可能没有) */
export interface IPartialEditorMouseEvent {
    readonly event: IMouseEvent
    readonly target: IMouseTarget | null
}
/** Monaco IMouseEvent:原生 MouseEvent 外加几个归一化的字段 */
export interface IMouseEvent {
    readonly browserEvent: MouseEvent
    readonly leftButton: boolean
    readonly middleButton: boolean
    readonly rightButton: boolean
    readonly buttons: number
    readonly target: HTMLElement
    readonly detail: number
    readonly posx: number
    readonly posy: number
    readonly ctrlKey: boolean
    readonly shiftKey: boolean
    readonly altKey: boolean
    readonly metaKey: boolean
    readonly timestamp: number
    readonly defaultPrevented: boolean
    preventDefault(): void
    stopPropagation(): void
}
/** onKeyDown / onKeyUp(Monaco IKeyboardEvent) */
export interface IKeyboardEvent {
    readonly _standardKeyboardEventBrand: true
    readonly browserEvent: KeyboardEvent
    readonly target: HTMLElement
    readonly ctrlKey: boolean
    readonly shiftKey: boolean
    readonly altKey: boolean
    readonly metaKey: boolean
    readonly altGraphKey: boolean
    readonly keyCode: number
    readonly code: string
    equals(keybinding: number): boolean
    preventDefault(): void
    stopPropagation(): void
}

// ───────────── 视图状态(Monaco ICodeEditorViewState) ─────────────

export interface ICursorState {
    inSelectionMode: boolean
    selectionStart: IPosition
    position: IPosition
}
export interface IViewState {
    scrollTop?: number
    scrollTopWithoutViewZones?: number
    scrollLeft: number
    firstPosition: IPosition
    firstPositionDeltaTop: number
}
export interface ICodeEditorViewState {
    cursorState: ICursorState[]
    viewState: IViewState
    contributionsState: { [id: string]: unknown }
}

// ───────────── H1 负责的方法组 ─────────────

/** 选项:updateOptions / getOption / getOptions / getRawOptions / onDidChangeConfiguration */
export interface IOptionsApi {
    updateOptions(newOptions: IEditorOptions): void
    getOption<K extends keyof ComputedEditorOptions>(name: K): ComputedEditorOptions[K]
    getOption(id: EditorOption): unknown
    getOptions(): IComputedEditorOptions
    getRawOptions(): IEditorOptions
    readonly onDidChangeConfiguration: IEvent<IConfigurationChangedEvent>
}

/** 视图状态:saveViewState / restoreViewState */
export interface IViewStateApi {
    saveViewState(): ICodeEditorViewState | null
    restoreViewState(state: ICodeEditorViewState | null): void
}

/** 事件与焦点 */
export interface IEventsApi {
    hasWidgetFocus(): boolean
    readonly onDidFocusEditorText: IEvent<void>
    readonly onDidBlurEditorText: IEvent<void>
    readonly onDidFocusEditorWidget: IEvent<void>
    readonly onDidBlurEditorWidget: IEvent<void>
    readonly onDidCompositionStart: IEvent<void>
    readonly onDidCompositionEnd: IEvent<void>
    readonly onDidAttemptReadOnlyEdit: IEvent<void>
    readonly onDidPaste: IEvent<IPasteEvent>
    /** 用户敲入文本(Monaco onDidType):input.type 事务;越过已有闭合字符也算 */
    readonly onDidType: IEvent<string>
    /** Monaco onBeginUpdate:一次编辑更新(type / 命令 / setSelections / executeEdits / undo / redo / setValue / setModel)开始;嵌套只发最外层 */
    readonly onBeginUpdate: IEvent<void>
    /** Monaco onEndUpdate:这次更新的内容事件、光标事件都发完之后;与 onBeginUpdate 成对 */
    readonly onEndUpdate: IEvent<void>
    /** 用户敲入文本之前(Monaco onWillType):input.type 事务落地前发,此刻选区还是打字前的 */
    readonly onWillType: IEvent<string>
    readonly onMouseDown: IEvent<IEditorMouseEvent>
    readonly onMouseUp: IEvent<IEditorMouseEvent>
    readonly onMouseMove: IEvent<IEditorMouseEvent>
    readonly onMouseLeave: IEvent<IPartialEditorMouseEvent>
    readonly onContextMenu: IEvent<IEditorMouseEvent>
    readonly onMouseDrop: IEvent<IEditorMouseEvent>
    readonly onKeyDown: IEvent<IKeyboardEvent>
    readonly onKeyUp: IEvent<IKeyboardEvent>
    readonly onDidChangeHiddenAreas: IEvent<void>
    /** 把整行段藏掉(Monaco setHiddenAreas;只看起止行号,和折叠独立) */
    setHiddenAreas(ranges: readonly IRange[]): void
    readonly onDidChangeModelOptions: IEvent<IModelOptionsChangedEvent>
    readonly onDidChangeModelContent: IEvent<IModelContentChangedEvent>
    readonly onDidChangeModelLanguage: IEvent<IModelLanguageChangedEvent>
    readonly onDidChangeModelLanguageConfiguration: IEvent<IModelLanguageConfigurationChangedEvent>
    hasTextFocus(): boolean
}

/** 最小的 ICommand 之外的、H1 自己的小方法 */
export interface IHostApi extends IOptionsApi, IViewStateApi, IEventsApi {
    /** 整篇替换文本(Monaco setValue) */
    setValue(newValue: string): void
    getValue(options?: { preserveBOM: boolean, lineEnding: string }): string
    /** 触发编辑器命令(Monaco trigger) */
    trigger(source: string | null | undefined, handlerId: string, payload?: unknown): void
    /** 当前 model(H3 的薄视图;setModel(null) 之后为 null) */
    getModel(): ITextModel | null
    /** Monaco hasModel:当前挂着 model(setModel(null) 之后为 false) */
    hasModel(): boolean
    /** 换 model:onWillChangeModel → 整篇换成新 model(带它的换行符 / 撤销栈 / 选区 / 折叠 / 缩进 / 语言)→ onDidChangeModel */
    setModel(model: ITextModel | null): void
    readonly onWillChangeModel: IEvent<IModelChangedEvent>
    readonly onDidChangeModel: IEvent<IModelChangedEvent>
    readonly onDidDispose: IEvent<void>
    dispose(): void
    getId(): string
    getEditorType(): string
    getContribution(id: string): null
    handleInitialized(): void
}

/**
 * 实例上的 Monaco 方法全集。各代号的方法组在这里登记(`extends`)。
 * 例:H2 `import type { IActionsApi } from './actions'`,然后加进下面的 extends。
 */
export interface IStandaloneCodeEditorApi extends IHostApi, IActionsApi, ICommandsApi, IContextKeysApi, IDecorationsApi, IWidgetsApi {}

/** `liteMonaco()` 的返回值 */
export type LiteMonacoEditor = core.EditorView & IStandaloneCodeEditorApi
