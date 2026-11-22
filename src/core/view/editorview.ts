// CM7 EditorView —— 协调层 + 输入接入 + 视口虚拟化。
//
// 职责:持 EditorState、拥有 DOM(.cm-editor > .cm-content)、把 state 经 decorations facet →
// buildtile → materialize 投影进 contenteditable;DOMObserver 观测用户在 contenteditable 里的真实
// 编辑,经 applyDOMChange diff → dispatch 回 state。
//
// 渲染策略:**视口虚拟化**。只物化可见窗口 ± margin 内的行,contentDOM 用 padding 撑出未渲染区域
// 的总高度(滚动条正确)。contentDOM.children[i] ≡ 文档第 (viewportStartLine + i) 行。
// dispatch 走增量 patchDOM(只重建变动行区间与视口的交集);滚动时 viewportIsAppropriate 失败则重算
// 视口并换子。rebuild 后用 domAtPos 复原原生选区,所有 DOM 写包进 observer.ignore() 抑制反馈环。
//
// measure 循环:scroll 事件 → setTimeout → onScroll → computeViewport → 必要时换窗口。
// jsdom 无布局(clientHeight=0),viewport 退化为全文覆盖,行为等价阶段A(测试兼容)。

import type { DecorationSet } from '../model/decoration'
import { StateEffect, Transaction, type EditorState } from '../model/state'
import { buildTileTree, CHUNK_CLASS } from './buildtile'
import { DEFAULT_SCAN_WINDOW, LONG_LINE_SCAN, UNLIMITED_SCAN_WINDOW, sameScanWindow, scanWindowFor, type ScanWindow } from './scanwindow'
import { GAP_STEP, gapOffset, isLineGap, lineGapSet } from './linegap'
import { lineSelectionRange, tabFocusMoves } from '../edit/commands'
import { keepOverlappingCursors } from '../edit/editoptions'
import { InputMode } from '../edit/inputmode'
import { Decoration, LineDecoration, MarkDecoration, ZoneWidget } from '../model/decoration'
import { RangeSet } from '../model/rangeset'
import { disposeLineIndex, domAtPos as bridgeDomAtPos, domLineDocLen, posFromDOM as bridgePosFromDOM } from './dombridge'
import { checkBijection, invariantGate, lineText } from './invariants'
import { applyDOMChangeInner, findDiff } from '../input/domchange'
import { EditorSelection, selectionCreationOrder, type SelectionRange } from '../model/selection'
import { HeightOracle, HeightMap, MeasuredHeights, clearHeightChangeFlag, heightChangeFlag, QueryType, wrapLayout } from './heightmap'
import type { Rope } from '../model/rope'
import { LineWidthMap, LineWidthOracle, clearWidthChangeFlag, widthChangeFlag } from './linewidthmap'
import { SoftWrapModel, assocAffinity, wrapConfig, type Injection } from './softwrap'
import { measureTextMetrics, posAtCoordsLayout, snapToCluster, moveToLineBoundary as geoMoveToLineBoundary, moveVertically as geoMoveVertically, assocAtY as geoAssocAtY, type TextMetrics } from './geometry'
import type { KeyBinding } from '../edit/keymap'
import { DOMObserver } from '../input/domobserver'
import { handleCopy, handleCut, handleDragOver, handleDrop, handlePaste } from '../input/clipboard'
import { defaultKeymap, keymapHandler, shouldBlockNative } from '../edit/keymap'
import { materialize } from './materialize'
import { planLinePatch, planViewportShift, type ViewportShiftPlan } from './linepatch'
import { Facet } from '../model/state'
import { findClusterBreak } from '../model/char'
import { browser } from '../browser'
import {
    InputState, PENDING_IOS_KEYS, EMACSY_PENDING_KEYS, modifierCodes, firefoxCopyCutHack,
} from '../input/inputstate'
import { handleMouseDown } from '../input/mouseselection'
import { handleWheel } from '../input/wheel'
import { ComputeOptionsMemory, computeLayout, editorOptions, estimateFontInfo, resolveEditorOptions, type ComputedEditorOptions, type ResolveEnv } from '../options'
import { TextEditorCursorBlinkingStyle, TextEditorCursorStyle, WrappingIndent, type BareFontInfo, type EditorLayoutInfo, type FontInfo } from '../options/types'
import { keyOS } from '../keyos'
import { Position, Range, Selection } from '../model/position'
import { applyFontStyle, measureFontInfo } from './fontinfo'
import { FontInfo as FontClass, massagedFontFamily } from '../options/fontclasses'
import { countColumn } from '../model/column'
import {
    CursorChangeReason, Emitter, EditorZoom, MouseTargetType, ScrollType, SmoothScrolling, VerticalRevealType,
    computeMinimumScrolling, computeScrollTopToReveal,
    type IContentSizeChangedEvent, type ICursorPositionChangedEvent, type ICursorSelectionChangedEvent, type IEvent,
    type IMouseTarget, type IMouseTargetMarginData, type IMouseTargetViewZoneData, type IPosition, type IRange, type IScrollEvent, type ISelection, type ISelectionResult,
    type IViewZone, type IViewZoneChangeAccessor,
} from './viewapi'
import { applyDOMSelection, focusPreventScroll, getSelection, scratchRange } from './domutil'
import { focusNextTabbable, installReadOnlyMessage, showReadOnlyMessage } from '../feature/readonlymessage'
import { prepareLinesFromTransaction, releaseTokenCache, selectTokenCache, subscribeTokens } from './tokens'
import { hiddenLineRanges, hiddenRanges, transactionChangesFold } from '../edit/fold'
import { revealPos } from '../edit/vertical'
import { undo as historyUndo, redo as historyRedo } from '../edit/history'
import {
    computeViewport,
    mapViewport,
    viewportIsAppropriate,
    Viewport,
    type YScaler,
    IdScaler,
} from './viewport'

export type DecoSource = (state: EditorState, view?: EditorView) => DecorationSet
export const decorations = Facet.define<DecorationSet | DecoSource>()

// 输入拦截 facet(对齐 CM6 inputHandler)。文本输入落定前逐个咨询,任一返 true 即认领
// (跳过默认插入)。产品层(自动配对、indentOnInput、autocorrect)经此注入,统一注入点,
// 不再硬编码进 applyDOMChange。签名:(view, from, to, insert)->bool。
export type InputHandler = (view: EditorView, from: number, to: number, insert: string) => boolean
export const inputHandler = Facet.define<InputHandler>()

// 内置装饰:选区背景 + 光标(widget)。随 state.selection 变化重建。
import { selectionDecorations } from '../feature/selectionlayer'

export interface EditorViewConfig {
    state: EditorState
    parent?: Element
    dispatch?: (tr: Transaction, view: EditorView) => void
    keymap?: readonly KeyBinding[]
    // 第二参 view 可选:shiki 等用 viewport 做视口邻域装饰;旧 provider 可忽略。
    decorationProviders?: readonly ((state: EditorState, view?: EditorView) => DecorationSet)[]
    overlays?: readonly ((view: EditorView) => () => void)[]
    // 是否自绘选区/光标(脱离原生高亮)。默认 true——多光标可见的前提。
    drawSelection?: boolean
    // 是否显示行号 gutter。默认 false。
    lineNumbers?: boolean
    // 折叠箭头列（可选，解耦 fold.ts）：可折叠判定 + 已折叠判定 + 点击切换。传入才渲染箭头。
    foldGutter?: FoldGutterSpec
    /** 视觉换行(word wrap)。默认 false。开后 .cm-content 用 pre-wrap,heightMap 吃实测多行高 */
    lineWrapping?: boolean
    /** 末行之后还能滚一屏减一行(Monaco scrollBeyondLastLine)。默认 false */
    scrollBeyondLastLine?: boolean
    /** 跟随容器尺寸变化自动重排(ResizeObserver)。内核默认 true;liteMonaco()/createEditor 按 Monaco 默认 false 传入。运行时用 setAutomaticLayout 切 */
    automaticLayout?: boolean
}

/**
 * 运行时重配置(Monaco updateOptions 里影响视图结构的那部分)。只处理出现的字段;值没变的字段无副作用。
 * 同一个 EditorView 不重建:文档 / 选区 / 历史 / 折叠 / 滚动位置 / 焦点都保留。
 */
export interface ViewReconfigure {
    lineNumbers?: boolean
    /** null = 去掉折叠列 */
    foldGutter?: FoldGutterSpec | null
    lineWrapping?: boolean
    scrollBeyondLastLine?: boolean
    /** 整体替换;立即生效 */
    keymap?: readonly KeyBinding[]
    /**
     * 整体替换:先按挂载的逆序 dispose 旧的,再按给定顺序挂新的(挂载顺序决定布局:minimap 先、竖条后)。
     * 依赖 .cm-gutters 等结构 DOM 的 overlay 应随 lineNumbers 变化一起重挂(本方法先改结构、后挂 overlay)。
     */
    overlays?: readonly ((view: EditorView) => () => void)[]
}

// 折叠箭头的注入契约（EditorView 不硬依赖 fold.ts，装配层传入）。EditorView 调用时喂当前 state。
export interface FoldGutterSpec {
    foldableAt(state: EditorState, lineFrom: number): boolean
    isFolded(state: EditorState, lineNumber: number): boolean
    toggle(state: EditorState, lineNumber: number): void
    /** 可选:大文档首次算折叠范围是异步的,算好后调这个回调(view 用它重画 gutter) */
    onReady?(cb: () => void): void
}

export class EditorView {
    state: EditorState
    readonly dom: HTMLElement
    // 滚动容器(唯一真源):view.dom 是非滚动外壳,scrollDOM(.cm-scroller)承接 overflow:auto。
    // 所有 scrollTop/clientHeight 读写都走这里;overlay 挂 view.dom 作 flex 兄弟,天然不随滚动。
    readonly scrollDOM: HTMLElement
    contentDOM: HTMLElement
    observer: DOMObserver
    /** @deprecated 用 inputState.lastKeyCode；保留兼容测试/旧调用 */
    lastKeyCode = 0
    lastKeyTime = 0
    /** 输入侧状态（composition / tabFocus / beforeinput / mouse） */
    readonly inputState = new InputState()
    private _lineWrapping = false
    private _scrollBeyondLastLine = false
    private _automaticLayout = true
    private destroyed = false
    // layout(dimension) 固定容器尺寸前,view.dom 上原有的内联 width / height(layout() 无参时还原)
    private layoutRestore: { width: string, height: string } | null = null
    private readonly _dispatch: (tr: Transaction, view: EditorView) => void
    private readonly decorationProviders: readonly ((state: EditorState, view?: EditorView) => DecorationSet)[]
    private readonly overlayDisposers: (() => void)[] = []
    private overlayFactories: readonly ((view: EditorView) => () => void)[] = []
    private keymapBindings: readonly KeyBinding[] = []
    /** 当前内置键位表。动态键位(addCommand / addAction / addKeybindingRule)据此和它合成同一台和弦状态机 */
    get keymap(): readonly KeyBinding[] { return this.keymapBindings }
    private runKeys: ReturnType<typeof keymapHandler>
    // 同 state + 同 viewport 内 decos() 会被 heightMap/render/patch 连打多次;缓存避免重复建 RangeSet。
    private decoCache: { state: EditorState, vpFrom: number, vpTo: number, win: ScanWindow, sets: DecorationSet[] } | null = null
    /** 超长行里词法装饰只扫这段列(随横向滚动按格移动,见 scanwindow.ts);折行时不限 */
    scanWindow: ScanWindow = DEFAULT_SCAN_WINDOW
    // 视口里的行 DOM 是按哪一份装饰画的(doc = 那份装饰的坐标系)。增量路径据此对比出装饰变了的行再重画。
    private drawn: { doc: EditorState['doc'], sets: DecorationSet[] } | null = null
    // view zone(Monaco changeViewZones)的真源:随文档变更映射,heightmap 的 spaceAbove 和行 DOM 的 margin-top 由它投出
    private zones: DecorationSet = RangeSet.empty
    private readonly transactionListeners: ((tr: Transaction, view: EditorView) => void)[] = []
    // 视图画完之后的监听(选区层、sticky、overlay 这类「按视图画东西」的):合并时一帧一次,拿到的是合成的那笔事务
    private readonly frameListeners: ((tr: Transaction, view: EditorView) => void)[] = []
    // 一帧内合并视图更新(Monaco ViewModel 事件攒到 rAF 才 render):嵌套深度 + 攒下的事务(纯数据,state 已同步生效)
    private viewDefer = 0
    private viewPending: { trs: Transaction[], from: EditorState, vp: Viewport, startLine: number } | null = null
    private viewRaf = 0 // 1 = 已排了微任务
    private viewFlushing = false
    private readonly settledListeners: ((tr: Transaction, view: EditorView) => void)[] = []
    // 事件批(Monaco viewModel._withViewEventsCollector):批里每笔事务的编辑器级事件先攒着,批尾按「内容事件 -> 光标事件 -> settled」一次发,
    // 监听器读到的都是整批结束后的光标。典型:键盘敲 ' a' 是两笔事务,'Z' 之后的会话在第一个内容事件里就已看到 'Z a'。
    private evBatchDepth = 0
    private evBatch: { contentFns: (() => void)[], trs: Transaction[], meta: { reason: CursorChangeReason, source: string } | null, oldVersion: number } | null = null
    // 待发的编辑器级事件队列(Monaco ViewModelEventDispatcher._outgoingEvents):监听器里再触发事务时,嵌套的发送先把队首的旧事件按序发完,再发新的
    private readonly outQ: (() => void)[] = []
    private outDepth = 0
    // 几何监听:scroll/resize(RO)汇合于 onScroll 末尾无条件触发,通知 overlay 重算尺寸(canvas/slider/panelH)。
    private readonly geometryListeners: (() => void)[] = []
    // 销毁监听:按需打开的浮层(命令面板/Go to Line/右键菜单)随 view.destroy 一起关(F7)。
    private readonly destroyListeners: (() => void)[] = []
    private gutters: HTMLElement | null = null
    // 裁剪壳:height 贴 editor,overflow hidden。transform 打在内层 gutters 上,
    // 避免 translateY(-scrollTop) 把整列移出 .cm-editor{overflow:hidden} 后行号被裁没。
    private guttersClip: HTMLElement | null = null
    private lineNumbers: boolean
    private foldGutter: FoldGutterSpec | null
    // 光标 overlay 层(仅 drawSelection 时):absolute 定位,按坐标画竖线,不进可编辑内容流。
    private readonly cursorLayer: HTMLElement | null = null
    /** 只读提示卸载(对齐 Monaco ReadOnlyMessageController) */
    private readonly disposeReadOnlyMessage: (() => void) | null = null

    // 视口虚拟化状态
    viewport: Viewport = new Viewport(0, 0)
    viewportStartLine = 1
    // 视觉块区间表(对齐 CM6 tile.length / Monaco viewLine↔modelLine):
    // viewBlockStarts[i]/viewBlockEnds[i] = contentDOM.children[i] 对应的旧 doc [from,to)。
    // 折叠 replace 把多 doc 行塌进一块 → ends[i]-starts[i] > 单行长;DOMChange 直接查,不走 vsl+i。
    viewBlockStarts: number[] = []
    viewBlockEnds: number[] = []
    readonly oracle: HeightOracle
    heightMap: HeightMap
    readonly lineWidthOracle: LineWidthOracle
    lineWidthMap: LineWidthMap
    scaler: YScaler = IdScaler
    private lastScrollTop = 0
    private lastClientH = -1
    private lastClientW = -1
    // 末行后留白按它算。不复用 lastClientH:那个会被置 -1 强发几何通知,半途算 padding 会把底部垫空、钳掉 scrollTop
    private viewportH = 0
    // layout(dimension) 给的固定尺寸:容器没有真实布局(clientHeight 为 0,如 jsdom / 容器未挂载)时,视口高 / 总高按它算。
    // 有真实布局时恒不用(clientHeight 优先)。
    private layoutSize: { width: number, height: number } | null = null
    private viewH(): number { return this.viewportH || this.layoutSize?.height || 0 }
    private _resizeObserver: ResizeObserver | null = null
    // 文本度量探针(字体/字号变化检测)+ fonts 监听卸载 + 几何重测调度句柄。
    private textProbe: HTMLElement | null = null
    private disposeFonts: (() => void) | null = null
    private geometryTimer = 0
    // 后台分词(tokens.ts subscribeTokens)的退订 + 合到下一帧的重画
    private disposeTokens: (() => void) | null = null
    private tokenRepaint = 0
    private hScrollbarH = 0
    /** .cm-line 左 padding(实测;jsdom 保留默认 8)。视口外行按 charWidth 估列时的行文本起点。 */
    textPadLeft = 8
    private textPadRight = 8
    // measureLineHeights 量过的行元素 → 高度
    private lineHeightCache = new WeakMap<Element, number>()
    // 是否已用探针量到真实文本度量(有布局)。量到后 lineHeight 只听探针,不再拿视口行高众数覆盖
    // (折行时众数可能是 2× 行高)。
    private textMetricsMeasured = false
    // 打字时光标恒亮不闪(对齐 Monaco):挂 .cm-typing 停 CSS blink 动画,停手 ~530ms 后移除恢复闪。
    private typingTimer = 0
    // 最近一次真实 glyph caret 的高度(getClientRects 命中):空行 caret 无 glyph 时复用它,
    // 保证空行光标与有字行光标等高(而非退回整行盒高 → 突然变大)。
    private lastCaretHeight = 0
    // 光标 reveal 上下留几行(Monaco viewLines._computeScrollTopToRevealRange 的 max(cursorSurroundingLines,
    // stickyScroll.enabled ? maxLineCount : 0))。sticky scroll 挂上时设成它的行数,0 = 最小滚动。
    private stickyReveal = 0
    // 自绘光标:复用元素(smooth caret animation 要同一个元素的 left/top 变),最近一次光标变化的原因,layer 上当前的类名
    private readonly cursorEls: HTMLElement[] = []
    private lastCursorReason: CursorChangeReason = CursorChangeReason.NotSet
    private cursorClassKey = ''
    // 显式聚焦(focus() / focus 事件)那一次写原生选区不看 activeElement。只在 syncSelectionToDOM 里同步置位并当场消费,
    // 不许跨事务残留:没焦点时任何路径写选区,Chrome 都会顺手聚焦 contenteditable(抢宿主输入框的焦点)。
    private forceSelection = false
    // 组字行在 doc 里的起点(-1 = 不保护)。见 keepCompositionLine
    private compositionLineFrom = -1

    // ---- 视图选项(applyViewOptions)----
    // opts = 当前生效的 computed 选项;appliedOpts = DOM 现在反映的那一份(初始是 Monaco 默认值:只有和默认不同的选项才会去动 DOM,
    // 所以裸 EditorView 的旧行为不变)。构造时从 state 的 editorOptions facet 起步。
    private opts: ComputedEditorOptions
    private appliedOpts: ComputedEditorOptions = DEFAULT_OPTIONS
    // getResolveEnv 最近一次交给选项层的 zoom 级别:opts.fontInfo 里已经吃进去的那一级
    private disposeZoom: (() => void) | null = null
    private disposeInputMode: (() => void) | null = null
    private paddingBottom = 0
    private scrollBeyondLastColumn = 4
    private wrapColumn = -1
    private wrapBound = -1
    // 字形边距:槽位只在出现过 glyphClass 装饰(且 glyphMargin 为 true)后才占宽,默认不改 gutter 几何
    private glyphLanes = 1
    private glyphSlot = false
    private glyphLaneSeen = 0 // 出现过的字形边距车道(1 左 / 2 中 / 4 右)的位集
    private appliedFontSig = fontSig(DEFAULT_OPTIONS.fontInfo)
    // CSS tab-size 现在的值(--lm-tab-size)。0 = 还没写过。tabSize 一变,所有已量的行宽都作废(制表符占的列变了)
    private appliedTabSize = 0
    private appliedWrapSig = 'false|-1|-1'
    private wrapStyled = false
    private marginLayer: HTMLElement | null = null
    private readonly optionMemory = new ComputeOptionsMemory()
    private docVersion = 0
    private trListenerDepth = 0
    private lastSelectionSnapshot: ISelectionResult[] = []
    private apiCursorMeta: { source: string, reason: CursorChangeReason } | null = null
    private zoomGestureStart = 0
    private zoomGestureDelta = 0
    private zoomGestureTime = 0
    private zoomGestureModifier = false
    // 视图 zone 登记(Monaco changeViewZones):id → 登记项
    private readonly viewZoneRecords = new Map<string, ViewZoneRecord>()
    private viewZoneSeq = 0
    private zoneLayer: HTMLElement | null = null
    // 平滑滚动(smoothScrolling 或 ScrollType.Smooth):进行中的动画 + rAF 句柄
    private smooth: SmoothScrolling | null = null
    private smoothRaf = 0
    private smoothLast: { top: number, left: number } | null = null
    // 事件快照:对比出变化再发
    private lastScrollEvt = { top: -1, left: -1, width: -1, height: -1 }
    private lastContentEvt = { width: -1, height: -1 }
    private lastLayoutKey = ''
    private flushingEvents = false
    private readonly scrollEmitter = new Emitter<IScrollEvent>()
    private readonly layoutEmitter = new Emitter<EditorLayoutInfo>()
    private readonly contentSizeEmitter = new Emitter<IContentSizeChangedEvent>()
    private readonly cursorPositionEmitter = new Emitter<ICursorPositionChangedEvent>()
    private readonly cursorSelectionEmitter = new Emitter<ICursorSelectionChangedEvent>()
    /** Monaco onDidScrollChange */
    readonly onDidScrollChange: IEvent<IScrollEvent> = this.scrollEmitter.event
    /** Monaco onDidLayoutChange */
    readonly onDidLayoutChange: IEvent<EditorLayoutInfo> = this.layoutEmitter.event
    /** Monaco onDidContentSizeChange */
    readonly onDidContentSizeChange: IEvent<IContentSizeChangedEvent> = this.contentSizeEmitter.event
    /** Monaco onDidChangeCursorPosition */
    readonly onDidChangeCursorPosition: IEvent<ICursorPositionChangedEvent> = this.cursorPositionEmitter.event
    /** Monaco onDidChangeCursorSelection */
    readonly onDidChangeCursorSelection: IEvent<ICursorSelectionChangedEvent> = this.cursorSelectionEmitter.event

    constructor(config: EditorViewConfig) {
        this.state = config.state
        this.opts = this.state.facet(editorOptions)
        this._dispatch = config.dispatch || ((tr, view) => view.update(tr))
        const drawSel = config.drawSelection === true
        const providers = [...(config.decorationProviders || [])]
        if (drawSel)
            providers.push(selectionDecorations)
        this.decorationProviders = providers
        this.lineNumbers = config.lineNumbers === true
        this.foldGutter = config.foldGutter ?? null
        this.bindFoldGutter()
        this._lineWrapping = config.lineWrapping === true
        this._scrollBeyondLastLine = config.scrollBeyondLastLine === true
        this._automaticLayout = config.automaticLayout !== false
        this.dom = document.createElement('div')
        this.dom.className = 'cm-editor' + (this._lineWrapping ? ' cm-lineWrapping' : '')
        // 字体样式要在第一次量字宽 / 行高之前就位:晚到 applyViewOptions 才写的话,首屏按默认字体量并渲染一遍,
        // 样式一改又整个重测一遍(多一轮强制布局)
        if (fontSig(this.fontInfo()) !== this.appliedFontSig) this.applyFontStyles()
        // tab-size 同理:第一次量行宽之前就得是 state.tabSize,不然首屏的 \t 行按默认 4 列量,之后再也不重量
        this.applyTabSize()
        // 非滚动外壳(view.dom)内嵌滚动容器(scrollDOM);content/cursorLayer 在 scrollDOM 内随滚动。
        // gutters 挂 view.dom（非滚），与 scrollDOM 的横向 scrollWidth 完全隔离——定律 §7 限制①。
        // 竖向同步：内层 gutters transform translateY(-scrollTop);外层 clip 固定视口高防裁切。
        this.scrollDOM = document.createElement('div')
        this.scrollDOM.className = 'cm-scroller'
        // 关掉浏览器滚动锚定:视口重渲染先改 paddingTop 再换行节点,Chrome 会把 padding 增量当成锚点位移
        // 「补偿」回去,一次跳远的 scrollTop(恢复标签页滚动、拖滚动条)被拉回顶部附近。CM6 同样关掉。
        this.scrollDOM.style.overflowAnchor = 'none'
        if (this.lineNumbers) this.createGutters()
        this.contentDOM = document.createElement('div')
        this.contentDOM.className = 'cm-content' + (this._lineWrapping ? ' cm-lineWrapping' : '')
        this.contentDOM.setAttribute('contenteditable', 'true')
        // 默认 ARIA 同 Monaco screenReaderSupport._updateDomAttributes(a11ySession / syncEditorAria 随选项更新)
        this.contentDOM.setAttribute('role', 'textbox')
        this.contentDOM.setAttribute('aria-required', 'false')
        this.contentDOM.setAttribute('aria-multiline', 'true')
        this.contentDOM.setAttribute('aria-autocomplete', 'both')
        this.contentDOM.setAttribute('aria-label', 'Editor content')
        this.contentDOM.setAttribute('aria-roledescription', 'editor')
        this.contentDOM.setAttribute('autocomplete', 'off')
        // 对齐 Monaco textarea:代码不做拼写检查/自动更正/自动大写
        this.contentDOM.setAttribute('spellcheck', 'false')
        this.contentDOM.setAttribute('autocorrect', 'off')
        this.contentDOM.setAttribute('autocapitalize', 'off')
        // Monaco view.ts:外层 role=code(vscode#93438)
        this.dom.setAttribute('role', 'code')
        if (drawSel) {
            // 隐藏原生光标,改由 cursorLayer 按坐标自绘(原生选区高亮由 CSS ::selection 隐藏)。
            this.contentDOM.style.caretColor = 'transparent'
        }
        this.scrollDOM.appendChild(this.contentDOM)
        if (drawSel) {
            this.cursorLayer = document.createElement('div')
            this.cursorLayer.className = 'cm-cursorLayer'
            this.scrollDOM.appendChild(this.cursorLayer)
        }
        // gutters-clip 在 scrollDOM 之前（左侧），是 view.dom 的 flex 兄弟。
        if (this.guttersClip) {
            this.dom.appendChild(this.guttersClip)
        }
        this.dom.appendChild(this.scrollDOM)
        if (config.parent)
            config.parent.appendChild(this.dom)

        this.oracle = new HeightOracle(this._lineWrapping)
        this.oracle.setDoc(this.state.doc)
        // 建 heightMap 前先量真实行高/字宽:否则全文档按默认 14px 估,未测块永远低估(滚到底只到 70%)。
        const metrics = measureTextMetrics(this)
        if (metrics) this.applyOracleMetrics(metrics)
        this.heightMap = this.buildHeightMap()

        this.lineWidthOracle = new LineWidthOracle(this._lineWrapping)
        this.lineWidthOracle.setDoc(this.state.doc)
        this.lineWidthOracle.canEstimate = () => this.fontInfo().isMonospace
        if (metrics?.charWidth) this.lineWidthOracle.charWidth = metrics.charWidth
        if (metrics) this.lineWidthOracle.linePadding = metrics.padLeft
        this.lineWidthMap = new LineWidthMap(this.lineWidthOracle)
        if (metrics?.charWidth) this.lineWidthMap.extraWidth = this.extraHorizontalSpace()
        // 全文档估算下界（对齐 Monaco）：最宽行在视口外时 contentWidth 也正确，横向条初始不缩水。
        this.lineWidthMap.seedEstimate()

        this.observer = new DOMObserver(this)
        this.keymapBindings = config.keymap || defaultKeymap
        this.runKeys = keymapHandler(this.keymapBindings)

        // 攒着的视图更新在微任务里画,浏览器的下一个事件本来就在它之后;这里再兜一道:
        // 任何输入/指针/焦点事件进来前(捕获阶段,先于所有处理器)DOM 和原生选区一定是画好的
        for (const t of ['keydown', 'beforeinput', 'compositionstart', 'mousedown', 'focus', 'paste', 'copy', 'cut'])
            this.dom.addEventListener(t, () => this.syncView(), true)

        // H6: Safari 空 input 监听，防止 composition 按 Enter 消失
        if (browser.safari) this.contentDOM.addEventListener('input', () => null)
        // H7: Firefox 空选区 copy/cut 不派发
        if (browser.gecko) firefoxCopyCutHack(this.contentDOM.ownerDocument)

        this.contentDOM.addEventListener('keydown', (e) => {
            // 组字卡死兜底:不在组字中的真实按键(浏览器已放弃组字却没发 compositionend)
            if (this.observer.composing && !e.isComposing && e.keyCode !== 229 &&
                !(e as KeyboardEvent & { synthetic?: boolean }).synthetic &&
                modifierCodes.indexOf(e.keyCode) < 0)
                this.observer.forceEndComposition()
            if (this.inputState.ignoreDuringComposition(e)) return
            this.lastKeyCode = e.keyCode
            this.lastKeyTime = Date.now()
            this.inputState.lastKeyCode = e.keyCode
            this.inputState.lastKeyTime = Date.now()
            this.inputState.setSelectionOrigin('select')

            // H12: Tab 焦点模式。永久开关是全页单例(Monaco TabFocus);Esc 的 2s 临时仍记在本实例。
            // 自己把焦点交到下一个可聚焦元素:contenteditable 没进 tab 序时,浏览器会把焦点丢到 body。
            const tabMoves = tabFocusMoves() || (this.inputState.tabFocusMode > 0 && Date.now() <= this.inputState.tabFocusMode)
            if (e.keyCode === 9 && tabMoves && !e.altKey && !e.ctrlKey && !e.metaKey) {
                e.preventDefault()
                focusNextTabbable(this.contentDOM, e.shiftKey)
                return
            }
            if (this.inputState.tabFocusMode > 0 && e.keyCode !== 27 &&
                modifierCodes.indexOf(e.keyCode) < 0)
                this.inputState.tabFocusMode = -1
            // Esc 开 2s 临时 tab focus（未处理时）
            if (e.keyCode === 27 && this.inputState.tabFocusMode !== 0)
                this.inputState.tabFocusMode = Date.now() + 2000

            // §5: Chrome Android Enter/Backspace
            if (browser.android && browser.chrome && !(e as KeyboardEvent & { synthetic?: boolean }).synthetic &&
                (e.keyCode === 13 || e.keyCode === 8)) {
                this.observer.delayAndroidKey(e.key, e.keyCode)
                e.preventDefault()
                return
            }
            // §5: iOS pending key 250ms
            if (browser.ios && !(e as KeyboardEvent & { synthetic?: boolean }).synthetic &&
                !e.altKey && !e.metaKey && !e.shiftKey) {
                const pending = PENDING_IOS_KEYS.find(k => k.keyCode === e.keyCode)
                if ((pending && !e.ctrlKey) || (EMACSY_PENDING_KEYS.indexOf(e.key) > -1 && e.ctrlKey)) {
                    this.inputState.pendingIOSKey = pending || e
                    this.dom.ownerDocument.defaultView!.setTimeout(() => this.flushIOSKey(), 250)
                    return
                }
            }
            if (e.keyCode !== 229) this.observer.forceFlush()
            if (!this.runKeys(e, this) && shouldBlockNative(e)) e.preventDefault()
            // I11:只读时 Tab / Shift+Tab 不缩进,焦点移到下一个 / 上一个可聚焦元素
            if (e.keyCode === 9 && this.state.readOnly && !e.defaultPrevented && !e.altKey && !e.ctrlKey && !e.metaKey) {
                e.preventDefault()
                focusNextTabbable(this.contentDOM, e.shiftKey)
            }
        })

        this.contentDOM.addEventListener('compositionstart', () => {
            if (!this.observer.composing) this.prepareCompositionOutsideRender()
            this.observer.startComposition()
            this.noteCompositionStart()
        })
        this.contentDOM.addEventListener('compositionupdate', () => {
            if (!this.observer.editContext) this.inputState.startComposition()
        })
        this.contentDOM.addEventListener('compositionend', () => {
            this.compositionLineFrom = -1
            this.observer.endComposition()
        })
        // 组字中 state 不动,没有事务来重画光标:每次组字输入后让自绘光标跟上原生光标
        this.contentDOM.addEventListener('input', () => {
            if (this.observer.composing) this.drawCursors()
        })

        // H8: beforeinput —— insertingText 缓存 / Android key / iOS flush / Safari dead-key
        this.contentDOM.addEventListener('beforeinput', (e: InputEvent) => {
            // 组字卡死兜底:组字中却来了非组字输入 → 浏览器已放弃组字,先结束组字,让这次输入照常 flush
            if (this.observer.composing && !e.isComposing && !compositionInputTypes.has(e.inputType))
                this.observer.forceEndComposition()
            // 选区端点不在已渲染行里(全选长文档、光标在视口外):浏览器只能改到已渲染的 DOM,
            // 原生插入会错位。改为直接按 state 选区落字(Monaco 的 textarea 语义)。
            if (!this.composing && this.handleInputOutsideRender(e)) return
            // 菜单「编辑 → 撤销/重做」(Electron role:'undo'、execCommand('undo'))走浏览器原生 DOM 撤销,
            // 会和 state 脱节;拦下来改走编辑器自己的历史(Monaco 的 textarea 也是落到模型的 undo)。
            if (e.inputType === 'historyUndo' || e.inputType === 'historyRedo') {
                e.preventDefault()
                const cmd = e.inputType === 'historyUndo' ? historyUndo : historyRedo
                cmd({ state: this.state, dispatch: tr => this.dispatch(tr) })
                return
            }
            if (e.inputType === 'insertText' || e.inputType === 'insertCompositionText') {
                this.inputState.insertingText = e.data || ''
                this.inputState.insertingTextAt = Date.now()
            }
            // EditContext 拼写更正
            if (e.inputType === 'insertReplacementText' && this.observer.editContext) {
                const text = e.dataTransfer?.getData('text/plain')
                const ranges = e.getTargetRanges?.()
                if (text && ranges?.length) {
                    const r = ranges[0]
                    const from = this.posFromDOM(r.startContainer, r.startOffset)
                    const to = this.posFromDOM(r.endContainer, r.endOffset)
                    this.dispatch(this.state.update({
                        changes: { from, to, insert: text },
                        selection: { anchor: from + text.length },
                        userEvent: 'input.type',
                        scrollIntoView: true,
                    }))
                    e.preventDefault()
                    return
                }
            }
            const pending = PENDING_IOS_KEYS.find(k => k.inputType === e.inputType)
            if (browser.chrome && browser.android && pending) {
                this.observer.delayAndroidKey(pending.key, pending.keyCode)
                if (pending.key === 'Backspace' || pending.key === 'Delete') {
                    const startH = this.dom.ownerDocument.defaultView?.visualViewport?.height || 0
                    this.dom.ownerDocument.defaultView!.setTimeout(() => {
                        const h = this.dom.ownerDocument.defaultView?.visualViewport?.height || 0
                        if (h > startH + 10 && this.root.activeElement === this.contentDOM) {
                            this.contentDOM.blur()
                            this.contentDOM.focus()
                        }
                    }, 100)
                }
            }
            if (browser.ios && e.inputType === 'deleteContentForward')
                this.observer.flushSoon()
            // Safari dead-key 偶发漏 compositionend
            if (browser.safari && e.inputType === 'insertText' && this.inputState.composing >= 0)
                this.dom.ownerDocument.defaultView!.setTimeout(() => this.observer.endComposition(), 20)
        })

        // H11: 鼠标选区 / 矩形列选
        this.contentDOM.addEventListener('mousedown', (e) => {
            // 组字中点鼠标:mouseselection 会 preventDefault,浏览器不再提交组字也不发 compositionend。
            // 这里先把组字文本按现状提交进 state,再走选区逻辑。
            this.endComposition()
            if (handleMouseDown(this, e)) e.preventDefault()
        })
        // 点内容盒下面的空白(短文档时 .cm-content 没撑满 .cm-scroller,点到的是 scroller 自己):对齐 Monaco,
        // 光标到文档末尾、聚焦,也能从那里拖选(posAtCoords 末行下方 → doc.length)。原生滚动条区域不管。
        this.scrollDOM.addEventListener('mousedown', (e) => {
            if (e.target !== this.scrollDOM) return
            const r = this.scrollDOM.getBoundingClientRect()
            if (e.clientX - r.left >= this.scrollDOM.clientWidth || e.clientY - r.top >= this.scrollDOM.clientHeight) return
            if (e.clientY < this.contentDOM.getBoundingClientRect().bottom) return
            this.endComposition()
            if (handleMouseDown(this, e)) e.preventDefault()
        })
        // 聚焦时把 state 选区写回 DOM:浏览器聚焦 contenteditable 会把原生光标放到开头,
        // 随后的 selectionchange 会把模型选区读成 0(关浮层后 / 宿主 focus() / 失焦再聚焦后打字跑到开头)。
        this.contentDOM.addEventListener('focus', () => {
            this.inputState.lastFocusTime = Date.now()
            this.syncSelectionToDOM()
        })
        // 组字中失焦:没收到 compositionend 也要把组字文本提交进 state
        this.contentDOM.addEventListener('blur', () => this.endComposition())
        this.contentDOM.addEventListener('touchstart', (e) => {
            const t = e.targetTouches[0]
            this.inputState.lastTouchTime = Date.now()
            if (t) {
                this.inputState.lastTouchX = t.clientX
                this.inputState.lastTouchY = t.clientY
            }
            this.inputState.setSelectionOrigin('select.pointer')
        })

        this.contentDOM.addEventListener('paste', e => { handlePaste(this, e) })
        this.contentDOM.addEventListener('copy', e => { handleCopy(this, e) })
        this.contentDOM.addEventListener('cut', e => { handleCut(this, e) })
        this.contentDOM.addEventListener('drop', e => { handleDrop(this, e) })
        this.contentDOM.addEventListener('dragover', e => { handleDragOver(this, e) })
        // 列选时 Alt 按下显示 crosshair
        this.contentDOM.addEventListener('mousemove', (e) => {
            this.contentDOM.style.cursor = e.altKey ? 'crosshair' : ''
        })
        this.contentDOM.addEventListener('keyup', (e) => {
            if (e.key === 'Alt') this.contentDOM.style.cursor = ''
        })

        // 滚轮照 Monaco 自己算(一格 50px,⌥ ×5),听整个 view.dom:行号栏、minimap 上滚也滚编辑器
        this.dom.addEventListener('wheel', e => this.onWheel(e), { passive: false })
        // scroll 事件就地换窗:浏览器每帧最多发一次、在绘制之前发,这里换好的行当帧就画出来(Monaco 也是滚动后
        // 同一帧渲染)。推迟到 setTimeout 会先画出一帧没有行的空白,视口边距小的时候快速滚动就看得见。
        this.scrollDOM.addEventListener('scroll', () => this.onScroll())

        // 容器尺寸变化 / 字体字号变化 → 重测几何(requestGeometryMeasure)。
        // 两个观察对象:scrollDOM(容器尺寸,含 display:none→可见)+ 文本探针(继承编辑器字体的隐藏 span,
        // 字号/字体/行高一变它的尺寸就变)。web font 晚到另听 document.fonts loadingdone。
        const win = this.dom.ownerDocument.defaultView!
        const ResizeObs = win.ResizeObserver
        if (ResizeObs) {
            const ro = new ResizeObs(() => this.requestGeometryMeasure())
            if (this._automaticLayout) ro.observe(this.scrollDOM)
            this.textProbe = document.createElement('span')
            this.textProbe.className = 'cm-measureProbe'
            this.textProbe.setAttribute('aria-hidden', 'true')
            this.textProbe.style.cssText = 'position:absolute;top:0;left:0;visibility:hidden;pointer-events:none;white-space:pre'
            this.textProbe.textContent = 'xxxxxxxxxx'
            this.scrollDOM.appendChild(this.textProbe)
            ro.observe(this.textProbe)
            this._resizeObserver = ro
        }
        const fonts = this.dom.ownerDocument.fonts as FontFaceSet | undefined
        if (fonts && typeof fonts.addEventListener === 'function') {
            const onFonts = () => this.requestGeometryMeasure()
            fonts.addEventListener('loadingdone', onFonts)
            this.disposeFonts = () => fonts.removeEventListener('loadingdone', onFonts)
        }

        // 首次渲染必须包进 observer.ignore():observer 构造时已 start(),此处 mutate contentDOM
        // 若不抑制,会被观测成"用户编辑",applyDOMChange 拿首屏 DOM(仅可见行)去 diff 完整 state,
        // 误判为"删掉了首屏之后的所有行" → 初始 doc 被截断到首屏行数(input.type 事务)。
        this.viewportH = this.scrollDOM.clientHeight
        this.observer.ignore(() => this.measureAndRender())
        this.lastClientH = this.scrollDOM.clientHeight
        this.lastClientW = this.scrollDOM.clientWidth

        // 只读拒编提示(Monaco: Cannot edit in read-only editor)
        this.disposeReadOnlyMessage = installReadOnlyMessage(this)

        // 后台分词推进到视口里的行(远跳猜的颜色被纠正):下一帧只重画装饰变了的行(Monaco onDidChangeTokens → 失效行重画)
        this.disposeTokens = subscribeTokens(this, (from, to) => {
            const doc = this.state.doc
            const endLine = doc.lineAt(Math.min(this.viewport.to, doc.length)).number
            if (to < this.viewportStartLine || from + 1 > endLine || this.tokenRepaint) return
            this.tokenRepaint = win.setTimeout(() => {
                this.tokenRepaint = 0
                this.decoCache = null
                const tr = this.state.update({})
                this.observer.ignore(() => this.repaintChangedDecos(tr))
            }, 16)
        })

        this.overlayFactories = config.overlays ?? []
        this.mountOverlays(this.overlayFactories)

        // 选项 → 视图:构造和运行时共用 applyViewOptions 这一个入口(对 Monaco 默认值是空操作)
        this.lastSelectionSnapshot = this.state.selection.ranges.map(r => this.toSelection(r.anchor, r.head))
        this.disposeZoom = EditorZoom.onDidChangeZoomLevel(() => this.applyZoom()).dispose
        // Monaco effectiveCursorStyle:输入模式在 insert / overtype 间切换,光标形状跟着换(overtypeCursorStyle)
        this.disposeInputMode = InputMode.onDidChangeInputMode(() => { if (!this.destroyed) this.observer?.ignore(() => this.drawCursors()) }).dispose
        this.applyViewOptions(this.opts)
        this.updateCursorLayer()
        this.flushViewEvents(true)
    }

    /**
     * 光标 reveal 上下留几行 = max(cursorSurroundingLines 选项, sticky scroll 的行数)(Monaco viewLines 同款)。
     * 写入的是 sticky scroll 那一份(stickyscroll.ts 挂上 / 卸下时设),读到的是两者较大者。
     */
    get revealSurroundingLines(): number {
        return Math.max(this.opts.cursorSurroundingLines, this.stickyReveal)
    }

    set revealSurroundingLines(n: number) {
        this.stickyReveal = n
    }

    /** 是否视觉换行(影响 Chrome 行首空格特例)。运行时用 reconfigure({ lineWrapping }) 改 */
    get lineWrapping(): boolean {
        return this._lineWrapping
    }

    /** 末行之后是否还能滚。运行时用 reconfigure({ scrollBeyondLastLine }) 改 */
    get scrollBeyondLastLine(): boolean {
        return this._scrollBeyondLastLine
    }

    /** 是否跟随容器尺寸自动重排。用 setAutomaticLayout 切 */
    get automaticLayout(): boolean {
        return this._automaticLayout
    }

    // 折叠范围第一次是异步算的(大文档):算好后整列重画,箭头才出来
    private bindFoldGutter() {
        this.foldGutter?.onReady?.(() => {
            if (this.destroyed || !this.gutters) return
            this.observer.ignore(() => this.syncGutters())
        })
    }

    private createGutters() {
        this.guttersClip = document.createElement('div')
        this.guttersClip.className = 'cm-gutters-clip'
        this.guttersClip.setAttribute('aria-hidden', 'true')
        this.gutters = document.createElement('div')
        this.gutters.className = 'cm-gutters'
        this.guttersClip.appendChild(this.gutters)
    }

    // 逐个挂载:每挂一个就登记它的 disposer,中途抛错时已挂的仍归 destroy / 下次 reconfigure 清理。
    private mountOverlays(list: readonly ((view: EditorView) => () => void)[]) {
        for (const attach of list)
            this.overlayDisposers.push(attach(this))
    }

    // 按挂载的逆序清掉所有 overlay。先摘空登记表再调,所以重入 / destroy 之后再调都是 no-op(每个 disposer 只跑一次)。
    // 某个 disposer 抛错不影响其余,全部跑完后把第一个错误抛出。
    private disposeOverlays() {
        const list = this.overlayDisposers.splice(0)
        let failed = false
        let error: unknown
        for (let i = list.length - 1; i >= 0; i--) {
            try { list[i]() }
            catch (e) {
                if (!failed) { failed = true; error = e }
            }
        }
        if (failed) throw error
    }

    /**
     * 运行时改视图配置(见 ViewReconfigure)。同一个 view 不重建:文档、选区、历史、折叠、焦点、滚动位置(按文档位置锚定)都保留。
     * 只处理 patch 里出现且值真的变了的字段;没变的字段不碰 DOM、不拆装 overlay。
     * 顺序:dispose 旧 overlay → 换 keymap → 改结构(gutter / 折行 / 末行留白)并重算几何 → 挂新 overlay。
     * overlay 的 dispose / 挂载抛错不会中断其余步骤,最后抛出第一个错误。
     */
    reconfigure(patch: ViewReconfigure): void {
        this.syncView()
        if (this.destroyed) return
        let failed = false
        let error: unknown
        const guard = (f: () => void) => {
            try { f() }
            catch (e) {
                if (!failed) { failed = true; error = e }
            }
        }
        const overlays = patch.overlays !== undefined && !sameList(patch.overlays, this.overlayFactories) ? patch.overlays : null
        if (overlays) guard(() => this.disposeOverlays())
        if (patch.keymap !== undefined && patch.keymap !== this.keymapBindings) {
            this.keymapBindings = patch.keymap
            this.runKeys = keymapHandler(patch.keymap)
        }
        const lineNumbers = patch.lineNumbers ?? this.lineNumbers
        const foldGutter = patch.foldGutter !== undefined ? patch.foldGutter : this.foldGutter
        const wrap = patch.lineWrapping ?? this._lineWrapping
        const beyond = patch.scrollBeyondLastLine ?? this._scrollBeyondLastLine
        const gutterToggled = lineNumbers !== this.lineNumbers
        const foldChanged = foldGutter !== this.foldGutter
        const wrapChanged = wrap !== this._lineWrapping
        const beyondChanged = beyond !== this._scrollBeyondLastLine
        if (gutterToggled || foldChanged || wrapChanged || beyondChanged)
            guard(() => this.applyViewConfig({ lineNumbers, foldGutter, wrap, beyond, gutterToggled, foldChanged, wrapChanged }))
        if (overlays) {
            this.overlayFactories = overlays
            guard(() => this.mountOverlays(overlays))
        }
        if (failed) throw error
    }

    private applyViewConfig(c: {
        lineNumbers: boolean, foldGutter: FoldGutterSpec | null, wrap: boolean, beyond: boolean
        gutterToggled: boolean, foldChanged: boolean, wrapChanged: boolean
    }) {
        // 滚动锚点:改配置前记下视口顶部的文档位置,结构 / 高度变完再滚回同一个位置。
        const anchor = this.captureScrollAnchor()
        this.foldGutter = c.foldGutter
        this.bindFoldGutter()
        this._scrollBeyondLastLine = c.beyond
        this.observer.ignore(() => {
            if (c.gutterToggled) {
                this.lineNumbers = c.lineNumbers
                if (c.lineNumbers) {
                    this.createGutters()
                    this.dom.insertBefore(this.guttersClip!, this.scrollDOM)
                } else {
                    this.guttersClip?.remove()
                    this.guttersClip = null
                    this.gutters = null
                }
            }
            if (c.wrapChanged) {
                this._lineWrapping = c.wrap
                this.dom.classList.toggle('cm-lineWrapping', c.wrap)
                this.contentDOM.classList.toggle('cm-lineWrapping', c.wrap)
            }
        })
        if (c.wrapChanged) {
            // 折行改变:估高口径(oracle)、行宽表(折行时不记行宽,切回要重来)、已测行高缓存全部失效。
            this.oracle.lineWrapping = c.wrap
            this.lineWidthOracle.lineWrapping = c.wrap
            // 超长行的 DOM 先换成新折行状态该有的那一份(折行→不折行:缩回扫描窗口),再读任何布局:
            // 否则每次读布局都在整条几十万字的 DOM 上重排两遍(折行时 scrollLeft 恒为 0,不折行的窗口就是默认窗口,不用读布局)。
            // 光标 / 选区层不在这里画(此时高度表还是旧的),下面量完统一 updateSelection。
            // 每视觉行字符数也要在换 DOM 之前量:它读 clientWidth,换成整条折行的 DOM 之后再读就是一次整行排版(1M 字 30~50ms)。
            // 正文宽不随折行开关变(竖条是自绘的);真变了,下面的 measureGeometry 按新宽度再算
            this.oracle.heightSamples = {}
            this.lineHeightCache = new WeakMap()
            this.updateWrapLineLength()
            // 写 scrollLeft 会同步排版(浏览器要按内容宽钳位):也在换成整条折行的 DOM 之前写
            if (c.wrap) {
                this.scrollDOM.scrollLeft = 0 // 折行永不横滚
                this.contentDOM.style.removeProperty('min-width') // 不折行时横条撑开的宽;留着会把内容钉在老宽度,下面量出来的就是不折行的行高(横条下次重画再按 contentWidth=0 写回)
            }
            const win = c.wrap ? UNLIMITED_SCAN_WINDOW : DEFAULT_SCAN_WINDOW
            if (!sameScanWindow(win, this.scanWindow)) { this.scanWindow = win; this.repaintLongLines(false) }
            this.lineWidthOracle.setDoc(this.state.doc)
            this.lineWidthMap.flush()
            this.lineWidthMap.extraWidth = this.extraHorizontalSpace()
            this.lineWidthMap.seedEstimate()
            // 全部块按新口径重估(已测的视口外行实测高也不再成立)
            this.heightMap = this.heightMap.updateHeight(this.oracle, 0, true)
        }
        if (c.wrapChanged || c.gutterToggled || c.foldChanged) {
            this.observer.ignore(() => {
                this.updatePadding() // 总高先对上,下面设 scrollTop 才不会被钳
                this.restoreScrollAnchor(anchor)
                this.measureAndRender()
                this.updatePadding()
                this.syncGutters() // 新建 / 去掉折叠列、折行块的行号对齐:整列按新配置重画
                this.updateSelection()
            })
            if (this.gutters) this.gutters.style.transform = `translateY(${-this.scrollDOM.scrollTop}px)`
            // gutter 开关 / 宽度变了 → 内容区宽变了:折行的每行字符数、横向条随之重算(无布局时空操作)
            this.measureGeometry()
        } else {
            this.observer.ignore(() => this.updatePadding()) // 只有末行留白变了
        }
        this.restoreScrollAnchor(anchor)
        this.lastClientH = -1 // 让 onScroll 末尾必发几何通知:overlay 按新 contentWidth / 总高 / gutter 宽重画
        this.onScroll()
    }

    // 视口顶部的文档位置 + 块内偏移 + 块高。没有布局 / 在顶部 → null(不用锚)。
    private captureScrollAnchor(): { pos: number, delta: number, height: number } | null {
        const top = this.scrollDOM.scrollTop
        if (top <= 0 || !this.scrollDOM.clientHeight) return null
        const y = this.scaler.fromDOM(top)
        const b = this.heightMap.lineAt(y, QueryType.ByHeight, this.oracle, 0, 0)
        return { pos: b.from, delta: y - b.top, height: b.height }
    }

    // 滚回锚点:块顶 + 偏移。块变矮(折行 → 不折行)时偏移是旧视觉行数,作废;块不矮于原来则保留。
    private restoreScrollAnchor(a: { pos: number, delta: number, height: number } | null) {
        if (!a) return
        const b = this.heightMap.lineAt(a.pos, QueryType.ByPos, this.oracle, 0, 0)
        const delta = b.height >= a.height - 0.5 && a.delta < b.height ? a.delta : 0
        const target = Math.max(0, this.scaler.toDOM(b.top) + delta)
        if (Math.abs(target - this.scrollDOM.scrollTop) > 0.5) this.scrollDOM.scrollTop = target
    }

    /**
     * Monaco ICodeEditor.layout。不带参数:重新量容器尺寸并重排(同时撤销之前的固定尺寸)。
     * 带 dimension:把容器(view.dom)固定成这个尺寸,不再读宿主给的容器(Monaco 里传了 dimension 就不读容器)。
     */
    layout(dimension?: { width: number, height: number }): void {
        this.syncView()
        if (this.destroyed) return
        const st = this.dom.style
        this.layoutSize = dimension ? { width: dimension.width, height: dimension.height } : null
        if (dimension) {
            if (!this.layoutRestore) this.layoutRestore = { width: st.width, height: st.height }
            st.width = `${dimension.width}px`
            st.height = `${dimension.height}px`
        } else if (this.layoutRestore) {
            st.width = this.layoutRestore.width
            st.height = this.layoutRestore.height
            this.layoutRestore = null
        }
        const h0 = this.lastClientH, w0 = this.lastClientW
        this.measureGeometry()
        // 尺寸没变时 measureGeometry 不会通知;显式 layout() 总要让 overlay 重画一次(Monaco layout → render)
        if (this.lastClientH === h0 && this.lastClientW === w0)
            for (const fn of this.geometryListeners.slice()) fn()
        this.flushViewEvents(true)
    }

    /**
     * Monaco automaticLayout:开 = ResizeObserver 跟随容器尺寸,关 = 只在手动 layout() 时重排。
     * 字体 / 字号变化(文本探针)与此无关,始终跟随。构造默认开(config.automaticLayout)。
     */
    setAutomaticLayout(on: boolean): void {
        if (this.destroyed || on === this._automaticLayout) return
        this._automaticLayout = on
        const ro = this._resizeObserver
        if (on) {
            ro?.observe(this.scrollDOM)
            this.requestGeometryMeasure() // 关着的这段时间容器可能变过
        } else ro?.unobserve(this.scrollDOM)
    }

    // height = 可滚动内容高(Monaco scrollHeight):含末行下方那一截,竖条/minimap 按它算最大滚动。
    get metrics(): { height: number, contentWidth: number } {
        this.syncView()
        return { height: this.heightMap.height + this.bottomSpace(), contentWidth: this.lineWidthMap.contentWidth() }
    }

    // Monaco ViewLayout._getTotalHeight:scrollBeyondLastLine 时末行下方留「编辑器高 − 行高」,否则垫一条横向滚动条高。
    // 文末的 zone 没有下一行可挂,也算在这里。
    private bottomSpace(): number {
        const end = this.state.doc.length
        let zone = 0
        this.zones.between(end, end, (_f, _t, d) => { if (d.startSide > 0) zone += (d.widget as ZoneWidget).height })
        // Monaco ViewLayout._getTotalHeight:padding.bottom 一定有;scrollBeyondLastLine 再加「视口高 − 行高 − padding.bottom」,
        // 否则垫横向滚动条高(scrollbar.ignoreHorizontalScrollbarInContentHeight 时不垫)
        const pb = this.paddingBottom
        return zone + pb + (this.scrollBeyondLastLine
            ? Math.max(0, this.viewH() - this.oracle.lineHeight - pb)
            : this.opts.scrollbar.ignoreHorizontalScrollbarInContentHeight ? 0 : this.horizontalScrollbarHeight())
    }

    /** pos 处那一行上方(含)所有 view zone 的总高:heightMap 坐标减掉它 = 只按 view line 排的坐标(minimap 用,Monaco minimap 不画 zone)。 */
    zoneHeightAbove(pos: number): number {
        this.syncView()
        let h = 0
        if (this.zones.size) this.zones.between(0, pos, (f, _t, d) => { if (f < pos || d.startSide < 0) h += (d.widget as ZoneWidget).height })
        return h
    }

    /**
     * 设 / 改 / 删一个 view zone(Monaco changeViewZones):afterLine 行下方留 height px 空白,后面的行往下推。
     * afterLine 0 = 第一行上方,≥ 末行 = 文末。null 或 height 0 删掉。scrollTop 不动(要保持画面的调用方自己补)。
     */
    setViewZone(id: string, zone: { afterLine: number, height: number } | null) {
        this.syncView()
        this.setViewZones([{ id, zone }])
    }

    /** 一次改多个 view zone,只重排一次(diff 编辑器的对齐空白一次几十上百个) */
    setViewZones(list: { id: string, zone: { afterLine: number, height: number } | null }[]) {
        this.syncView()
        const doc = this.state.doc
        const touched: number[] = []
        const ids = new Set(list.map(z => z.id))
        let zones = this.zones.update({
            filter: (from: number, _to: number, d: Decoration) => {
                if (!ids.has((d.widget as ZoneWidget).id)) return true
                touched.push(from)
                return false
            },
        })
        const add = []
        for (const { id, zone } of list) {
            if (!zone || zone.height <= 0) continue
            const end = zone.afterLine >= doc.lines
            const pos = end ? doc.length : doc.line(Math.max(0, zone.afterLine) + 1).from
            add.push(Decoration.widget({ widget: new ZoneWidget(zone.height, id), block: true, side: end ? 1 : -1 }).range(pos))
            touched.push(pos)
        }
        if (add.length) zones = zones.update({ add, sort: true })
        if (!touched.length) return
        this.zones = zones
        this.decoCache = null
        this.heightMap = this.heightMap.applyChanges(this.decos(), doc, this.oracle, [...new Set(touched)].sort((a, b) => a - b).map(p => ({ fromA: p, toA: p, fromB: p, toB: p })))
        this.observer.ignore(() => {
            this.renderViewportContent()
            this.measureLineHeights()
            this.updatePadding()
            this.updateSelection()
        })
        this.layoutZoneNodes()
        this.onScroll()
        for (const fn of this.geometryListeners) fn()
    }

    /** 主动弹出只读提示(外部命令拒编时可调) */
    attemptReadOnlyEdit(message?: string) {
        showReadOnlyMessage(this, message)
    }

    // 编辑器所在的根:挂在 shadow DOM 里就是那个 ShadowRoot(activeElement / getSelection 要在它上面取,
    // document 上只看得到宿主),否则是 document。window / Range / fonts 一律走 ownerDocument。
    get root(): Document | ShadowRoot {
        const r = this.contentDOM.getRootNode()
        return r.nodeType === 11 ? r as ShadowRoot : this.contentDOM.ownerDocument
    }

    /** 是否在 IME 组字中 */
    get composing(): boolean {
        return this.inputState.composing >= 0
    }

    get hasFocus(): boolean {
        return this.root.activeElement === this.contentDOM
    }

    /**
     * 屏上坐标 → doc 位置。heightmap 定行 + charWidth/二分 caret 定列。
     * 无布局时回退估算。
     */
    posAtCoords(coords: { x: number, y: number }, precise = true): number | null {
        this.syncView()
        const scrollRect = this.scrollDOM.getBoundingClientRect()
        if (scrollRect.height || scrollRect.width)
            return posAtCoordsLayout(this, coords, precise)
        {
            // jsdom：按行高估算
            const y = coords.y
            const lh = this.oracle.lineHeight || 14
            const lineN = Math.max(1, Math.min(this.state.doc.lines, Math.floor(y / lh) + 1))
            const line = this.state.doc.line(lineN)
            const col = Math.max(0, Math.min(line.length, Math.floor(coords.x / Math.max(1, this.oracle.charWidth))))
            return line.from + col
        }
    }

    /** 视觉行首/尾(折行时按视觉行,否则逻辑行)。见 geometry.moveToLineBoundary。供 Home/End 命令用。 */
    moveToLineBoundary(pos: number, forward: boolean, assoc = 0): { pos: number, assoc: -1 | 0 | 1 } {
        this.syncView()
        return geoMoveToLineBoundary(this, pos, forward, assoc)
    }

    /**
     * pos 所在视觉行的起点(doc 位置)。无折行 = 逻辑行首;有布局按屏上视觉行;
     * 没布局但是 wordWrapColumn(折点完全由文本 + 列数决定)按文本侧折行模型(softwrap.ts);其余(bounded / 视口宽)无从得知,退回逻辑行首。
     */
    visualRowStart(pos: number): number {
        this.syncView()
        const line = this.state.doc.lineAt(pos)
        if (!this._lineWrapping) return line.from
        if (this.caretCoords(pos)) return this.moveToLineBoundary(pos, false).pos
        const m = this.softWrapModel()
        if (!m) return line.from
        const v = m.toView(line.number, pos - line.from)
        return line.from + m.toModel({ line: v.line, row: v.row, col: m.minColumn(v.line, v.row) })
    }

    /**
     * 固定列折行(wordWrap:'wordWrapColumn')的文本侧折行模型,折点只由文本 + 选项决定,不依赖布局(softwrap.ts)。
     * 没开折行 / bounded / 视口宽(折点取决于真实宽度)返回 null。行内 widget 的纯文本(WidgetType.inlineText)按注入文字算宽;折叠的行不占视图行。
     * 模型是一次性快照:文档、选项、装饰一换就重取。
     */
    softWrapModel(): SoftWrapModel | null {
        this.syncView()
        if (!this._lineWrapping || this.wrapColumn <= 0) return null
        const state = this.state, doc = state.doc, o = this.opts
        const hidden = hiddenRanges(state)
        const sets = state.facet(decorations).map(d => typeof d === 'function' ? d(state, this) : d)
        return new SoftWrapModel({
            lines: doc.lines,
            text: n => doc.line(n).text,
            hidden: hidden.length ? n => { const f = doc.line(n).from; return hidden.some(h => (h.head ? f <= h.to : f > h.from && f <= h.to)) } : undefined,
            injections: n => {
                const l = doc.line(n), found: { at: number, side: number, text: string }[] = []
                for (const set of sets) set.between(l.from, l.to, (from, to, v) => {
                    const text = from === to ? v.widget?.inlineText : null
                    if (text) found.push({ at: from - l.from, side: v.startSide, text })
                })
                if (!found.length) return null
                found.sort((a, b) => a.at - b.at || a.side - b.side)
                return found.map((f): Injection => ({ offset: f.at, options: { content: f.text } }))
            },
        }, wrapConfig({
            column: this.wrapColumn, tabSize: state.tabSize, indent: o.wrappingIndent, wordBreak: o.wordBreak,
            breakBefore: o.wordWrapBreakBeforeCharacters, breakAfter: o.wordWrapBreakAfterCharacters,
            escapedLineFeeds: o.wrapOnEscapedLineFeeds,
        }))
    }

    /**
     * 按视觉行上/下移 rows 行,goalX 为内容坐标 x(相对 contentDOM 左缘)。assoc = 落点在软折行点时画在哪侧。
     * 无布局返回 null。供 ↑/↓/PageUp/PageDown 命令用。
     */
    moveVertically(pos: number, forward: boolean, goalX?: number, assoc = 0, rows = 1): { pos: number, goalX: number, assoc: -1 | 0 | 1 } | null {
        this.syncView()
        return geoMoveVertically(this, pos, forward, goalX, assoc, rows)
    }

    /** 屏上坐标 → doc 位置 + 侧(软折行点上 -1 = 上一视觉行末尾、1 = 下一视觉行行首;其余 0)。 */
    posAndAssocAtCoords(coords: { x: number, y: number }): { pos: number, assoc: -1 | 0 | 1 } | null {
        this.syncView()
        const pos = this.posAtCoords(coords)
        return pos == null ? null : { pos, assoc: geoAssocAtY(this, pos, coords.y) }
    }

    /** pos 所在视觉块在 scrollDOM 内容坐标里的竖向区间(heightMap 真源,与是否渲染无关)。 */
    lineBlockAt(pos: number): { from: number, to: number, top: number, bottom: number, height: number } {
        this.syncView()
        const b = this.heightMap.lineAt(pos, QueryType.ByPos, this.oracle, 0, 0)
        const top = this.scaler.toDOM(b.top)
        const bottom = this.scaler.toDOM(b.bottom)
        return { from: b.from, to: b.to, top, bottom, height: bottom - top }
    }

    // 重新测量可见窗口 + 重算视口 + 换子。等价构造时的首次 measure。滚动/尺寸变化外,
    // 也是测试驱动虚拟化视口(jsdom 无布局,须先桩 clientHeight/scrollTop/offsetHeight)的入口。
    remeasure() {
        this.syncView()
        this.viewportH = this.scrollDOM.clientHeight
        this.lineHeightCache = new WeakMap()
        this.observer.ignore(() => this.measureAndRender())
        this.lastClientH = this.scrollDOM.clientHeight
        this.lastClientW = this.scrollDOM.clientWidth
    }

    // 探针度量 → oracle。返回行高 / 字宽是否变了(变了调用方要重估 heightMap / 重置行宽表)。
    private applyOracleMetrics(m: TextMetrics): { heightChanged: boolean, widthChanged: boolean } {
        const o = this.oracle
        const heightChanged = Math.abs(o.lineHeight - m.lineHeight) > 0.01
        const widthChanged = m.charWidth > 0 && Math.abs(o.charWidth - m.charWidth) > 0.01
        if (heightChanged) {
            o.lineHeight = m.lineHeight
            o.heightSamples = {}
        }
        if (m.charWidth > 0) o.charWidth = m.charWidth
        o.textHeight = m.textHeight
        // className 装饰框:字体框(textHeight)上下各补 (行高 - 字高)/2 = Monaco 的行盒高
        this.scrollDOM.style.setProperty('--lm-deco-pad', `${Math.max(0, (o.lineHeight - m.textHeight) / 2)}px`)
        this.textPadLeft = m.padLeft
        this.textPadRight = m.padRight
        this.textMetricsMeasured = true
        this.updateWrapLineLength()
        this.applyWrapWidth()
        return { heightChanged, widthChanged }
    }

    // 折行估高用的「每视觉行字符数」(CM6 oracle.lineLength):内容区宽 ÷ 字宽。返回是否变了。
    private updateWrapLineLength(): boolean {
        if (!this.lineWrapping) return false
        const w = this.scrollDOM.clientWidth - this.textPadLeft - this.textPadRight
        if (!this.oracle.charWidth) return false
        let len: number
        const wi = this.oracle.wrapIndent, mode = this.opts.wrappingIndent, tab = this.state.tabSize
        const wiChanged = wi.mode !== mode || wi.tab !== tab
        if (wiChanged) this.oracle.wrapIndent = { mode, tab } // 折行估高要按续行缩进算(换了就让估高缓存失效)
        const col = this.wrapColumns()
        if (col > 0 && this.wrapBound <= 0) len = col // 固定列 / 视口折行的 wrappingColumn(bounded 仍取 min(视口, 列))
        else {
            if (w <= 0) return false
            len = Math.max(5, Math.floor(w / this.oracle.charWidth))
            if (this.wrapBound > 0) len = Math.min(len, this.wrapBound) // bounded:min(视口, 列)
        }
        if (len === this.oracle.lineLength && !wiChanged) return false
        this.oracle.lineLength = len
        return true
    }

    // ResizeObserver(容器 + 文本探针)/ fonts.loadingdone 的汇合点:下一 tick 跑一次 measureGeometry。
    private requestGeometryMeasure() {
        if (this.geometryTimer) return
        const win = this.dom.ownerDocument.defaultView
        if (!win) return
        this.geometryTimer = win.setTimeout(() => {
            this.geometryTimer = 0
            this.measureGeometry()
        }, 0)
    }

    /**
     * 重测文本度量与容器尺寸,必要时重估整张 heightMap、重置行宽表并重画视口/gutter/光标。
     * 触发:容器 resize(含 display:none → 可见)、字号/字体变化(探针 resize)、web font 到达。
     * 宿主改了影响排版的样式也可手动调。
     */
    measureGeometry() {
        this.syncView()
        if (!this.dom.isConnected) return
        if (this.composing) {
            // 组字中换子会打断 IME:推迟到组字结束后。
            const win = this.dom.ownerDocument.defaultView
            if (win && !this.geometryTimer)
                this.geometryTimer = win.setTimeout(() => { this.geometryTimer = 0; this.measureGeometry() }, 100)
            return
        }
        const h = this.scrollDOM.clientHeight
        const w = this.scrollDOM.clientWidth
        if (!h) return // 仍不可见
        const heightResized = h !== this.viewportH
        this.viewportH = h
        this.refreshHScrollbarHeight()
        const wasHidden = this.lastClientH <= 0
        const widthResized = w !== this.lastClientW
        const m = measureTextMetrics(this)
        const lenBefore = this.oracle.lineLength
        const { heightChanged, widthChanged } = m ? this.applyOracleMetrics(m) : { heightChanged: false, widthChanged: false }
        // 留白宽取决于 fontInfo(比例字体)和字宽:构造时 / 选项晚到时写的值可能已过期,每次重测都按当前的重算(不动缓存)
        if (m) this.lineWidthMap.extraWidth = this.extraHorizontalSpace()
        // applyOracleMetrics 里已按新宽度更新了每行字符数:它变了估高就作废(宿主先建在 0 宽、之后才有宽度,如 diff 的两侧)
        const reflow = this.lineWrapping && (widthResized || widthChanged || this.oracle.lineLength !== lenBefore)
        if (reflow) this.updateWrapLineLength()
        if (widthChanged) {
            this.lineWidthOracle.refresh(this.oracle.charWidth, this.lineWidthOracle.fastRender)
            if (m) this.lineWidthOracle.linePadding = m.padLeft
            this.lineWidthMap.flush()
            this.lineWidthMap.extraWidth = this.extraHorizontalSpace()
            this.lineWidthMap.seedEstimate()
        }
        if (heightChanged || widthChanged || wasHidden || reflow) {
            this.lineHeightCache = new WeakMap()
            // 全部块按新度量重估(已测的视口外行也失效:字号变了它们的实测高已不成立),再量视口。
            this.heightMap = this.heightMap.updateHeight(this.oracle, 0, true)
            this.observer.ignore(() => {
                this.measureAndRender()
                this.updatePadding()
                this.syncGutters()
                this.updateSelection()
            })
            if (this.gutters)
                this.gutters.style.transform = `translateY(${-this.scrollDOM.scrollTop}px)`
            this.lastClientH = -1 // 强制下面 onScroll 发几何通知(overlay 按新 contentWidth/行高重画)
        }
        else if (heightResized && this.scrollBeyondLastLine) this.observer.ignore(() => this.updatePadding())
        this.onScroll()
        this.flushViewEvents(true)
    }

    /**
     * 只回写 heightMap(不换子 / 不重建 tile)。
     * Diff diagonal-fill 等在 render 之后挂上的行外高度用这个,避免 remeasure 全量物化把 DOM 补丁冲掉。
     */
    remeasureHeights() {
        this.syncView()
        this.lineHeightCache = new WeakMap() // 调用方就地改了行高(diff 填充块),缓存不作数
        this.observer.ignore(() => {
            if (this.measureLineHeights()) {
                this.updatePadding()
                this.syncGutters()
            }
        })
    }

    // 按当前 oracle.lineHeight 估算重建 heightmap。行高变更(如缩放)时用;测试里也用来抹掉
    // jsdom 首次 measure 提交的 0 高度(无布局伪影),让虚拟化视口计算拿到真实行高估算。
    resetHeights() {
        this.syncView()
        this.heightMap = this.buildHeightMap()
        this.rebuildBlockStarts()
    }

    /**
     * 高度相关的装饰变了(行高装饰增删改):按当前装饰重建 heightMap 并整窗重画 + 重新实测。
     * 普通装饰 effect 不动 heightMap(只涂色),行高装饰要走这里。
     */
    refreshHeights() {
        this.syncView()
        this.heightMap = this.buildHeightMap()
        this.rerenderViewport()
    }

    // 一页可容纳的行数(视口高度 / 行高),供 PageUp/PageDown 命令用。jsdom 无布局(clientHeight=0)
    // 退化为 0,命令侧兜底成默认页大小,保持测试确定性。
    linesPerPage(): number {
        this.syncView()
        const h = this.scrollDOM.clientHeight
        const lh = this.oracle.lineHeight
        if (!h || !lh) return 0
        return Math.max(1, Math.floor(h / lh))
    }

    posFromDOM(node: Node, offset: number): number {
        this.syncView()
        return bridgePosFromDOM(this.contentDOM, this.state.doc, node, offset, this.viewportStartLine)
    }

    domAtPos(pos: number): { node: Node, offset: number } {
        this.syncView()
        return bridgeDomAtPos(this.contentDOM, this.state.doc, pos, this.viewportStartLine)
    }

    // doc pos → caret 屏上矩形(getBoundingClientRect 坐标系)。无几何可算时(视口外 / jsdom 无布局)返 null。
    // 这里是「pos → caret 几何」的**唯一权威**:空行/元素节点退化、glyph 高缓存、padding-left 全在这处理一次。
    // drawCursors / hover / autocomplete 都走它,边界只处理一处(旧代码各自内联,漂移出巨光标/丢锚点)。
    // side 仅对折行的软换行点有意义:<0 取上游(前一字符右缘,即上一视觉行末尾),>0 取下游(后一字符左缘)。
    caretCoords(pos: number, side = 0): { left: number, top: number, height: number, bottom: number } | null {
        this.syncView()
        if (pos < this.viewport.from || pos > this.viewport.to) return null // 视口外无 DOM
        const { node, offset } = this.domAtPos(pos)
        // 超长行的占位里(窗口外的文字不在 DOM):x = 占位左缘 + 隐藏文字到 pos 的宽(和占位宽同一把尺,换窗前后同一字符的 x 不变)
        // 紧贴占位左右缘的位置也按占位算(空的 inline-block 没有字形,盒顶在基线上,不能拿它定竖向)
        if (node.nodeType === 1) {
            const next = node.childNodes[offset], prev = offset > 0 ? node.childNodes[offset - 1] : null
            if (isLineGap(next)) return this.gapCaret(next, pos)
            if (isLineGap(prev)) return this.gapCaret(prev, pos)
        }
        if (side) {
            const s = this.sideCaret(pos, side)
            if (s) return s
        }
        const r = scratchRange(this.dom.ownerDocument)
        r.setStart(node, offset)
        r.collapse(true)
        // jsdom 无 getClientRects 布局 → 无坐标(callers 跳过,与旧行为逐字节等价)。
        const rects = typeof r.getClientRects === 'function' ? r.getClientRects() : null
        const glyph = rects && rects.length ? rects[0] : null
        // glyph caret 命中:缓存其高度,供空行 caret 复用(等高)。
        if (glyph && glyph.height) this.lastCaretHeight = glyph.height
        if (glyph) return { left: glyph.left, top: glyph.top, height: glyph.height, bottom: glyph.bottom }
        // WebKit:双向文本(unicode-bidi:isolate 里)文本节点末尾 / 紧贴行内元素处的 collapsed range 没有 rect
        // (Chromium、Firefox 有)。用相邻字符的字形矩形按它的方向取边,别掉到下面的「行盒左缘」(光标会跳到行首)。
        const adj = rects && node.nodeType === 3 ? adjacentGlyphCaret(this.dom.ownerDocument, node as Text, offset) : null
        if (adj) {
            if (adj.height) this.lastCaretHeight = adj.height
            return adj
        }
        // 元素边界紧贴 widget(折叠 ⋯ 等原子块):隐藏区内的位置 domAtPos 贴到 widget 前,隐藏区末端贴到 widget 后。
        // 用 widget 自己的盒定 x(前 = 左缘、后 = 右缘)。退回行首的话坐标不单调,posAtCoords 二分一路右移到隐藏行行尾。
        if (node.nodeType === 1) {
            const isWidget = (n: Node | undefined): n is Element => !!n && n.nodeType === 1 && (n as Element).getAttribute('data-cm-widget') != null
            const next = node.childNodes[offset], prev = offset > 0 ? node.childNodes[offset - 1] : undefined
            const w = isWidget(next) ? { el: next, after: false } : isWidget(prev) ? { el: prev, after: true } : null
            const rs = w ? w.el.getClientRects() : null
            const g = w && rs && rs.length ? rs[w.after ? rs.length - 1 : 0] : null
            if (w && g && (g.width || g.height)) {
                const h = this.lastCaretHeight || this.oracle.textHeight || g.height
                const top = g.top + (g.height - h) / 2 // 居中于 widget 盒(同行字形中线)
                return { left: w.after ? g.right : g.left, top, height: h, bottom: top + h }
            }
        }
        // 空行 / 元素边界 caret:collapsed range 在元素上 getClientRects 返 []。**绝不**退回
        // node.getBoundingClientRect()——那是整行盒(乃至 contentDOM 整块 6920px),会画出巨大光标
        // (退格到第 0 列光标突变很大的真根因)。改为定位承载行 el:取其屏上 top/left,高度用最近
        // glyph 高(退化到 textHeight),竖直居中在行盒内,left 落到行文本起始处(padding 后)。
        const el = node.nodeType === 1 ? (node as HTMLElement) : node.parentElement
        const lineEl = el && this.contentDOM.contains(el) ? el.closest('.cm-line') as HTMLElement | null : null
        if (!lineEl) return null
        const b = lineEl.getBoundingClientRect()
        if (!b.height && !b.width) return null // jsdom 无布局
        const win = this.dom.ownerDocument.defaultView
        const padLeft = win ? parseFloat(win.getComputedStyle(lineEl).paddingLeft) || 0 : 0
        const h = this.lastCaretHeight || this.oracle.textHeight
        const top = b.top + Math.max(0, (b.height - h) / 2) // 居中于行盒
        const left = b.left + padLeft
        return { left, top, height: h, bottom: top + h }
    }

    private gapCaret(gap: HTMLElement, pos: number): { left: number, top: number, height: number, bottom: number } | null {
        const g = gap.getBoundingClientRect()
        const lineEl = gap.closest('.cm-line')
        const b = lineEl ? lineEl.getBoundingClientRect() : g
        if (!b.height && !b.width && !g.width) return null // jsdom 无布局
        const f = this.fontInfo()
        const adv = this.gapAdvance()
        const end = Number(gap.getAttribute('data-cm-widget-from')) + Number(gap.getAttribute('data-cm-widget'))
        const left = pos >= end ? g.right : g.left + gapOffset(this.state.doc, gap, pos, this.state.tabSize, adv, f.typicalFullwidthCharacterWidth || 2 * adv)
        const h = this.lastCaretHeight || this.oracle.textHeight
        const top = b.top + Math.max(0, (b.height - h) / 2)
        return { left, top, height: h, bottom: top + h }
    }

    // 用相邻字素簇的字形矩形定 caret:side<0 取前一簇的右缘(最后一个 rect),side>0 取后一簇的左缘。
    // 软换行点上同一个 pos 有两个视觉位置,靠它区分。无相邻字符(行首/行尾)或无布局 → null。
    private sideCaret(pos: number, side: number): { left: number, top: number, height: number, bottom: number } | null {
        const line = this.state.doc.lineAt(pos)
        if (side < 0 ? pos <= line.from : pos >= line.to) return null
        const other = side < 0 ? snapToCluster(this, pos - 1, false) : snapToCluster(this, pos + 1, true)
        const a = this.domAtPos(Math.min(pos, other))
        const b = this.domAtPos(Math.max(pos, other))
        const r = scratchRange(this.dom.ownerDocument)
        try {
            r.setStart(a.node, a.offset)
            r.setEnd(b.node, b.offset)
        }
        catch { return null }
        const rects = typeof r.getClientRects === 'function' ? r.getClientRects() : null
        if (!rects || !rects.length) return null
        // Chrome:range 起点落在上一文本节点末尾(软折行点)时,会先吐一个上一视觉行末尾的零宽 rect。
        // 取朝 side 方向第一个有宽度的 rect,全零宽才退回首/末个。
        let g = side < 0 ? rects[rects.length - 1] : rects[0]
        for (let i = 0; i < rects.length; i++) {
            const c = rects[side < 0 ? rects.length - 1 - i : i]
            if (c.width > 0) { g = c; break }
        }
        if (!g.height) return null
        return { left: side < 0 ? g.right : g.left, top: g.top, height: g.height, bottom: g.bottom }
    }

    private decos(): DecorationSet[] {
        const vp = this.viewport
        const hit = this.decoCache
        if (hit && hit.state === this.state && hit.vpFrom === vp.from && hit.vpTo === vp.to && hit.win === this.scanWindow)
            return hit.sets
        const sets = [
            ...this.state.facet(decorations).map(d => typeof d === 'function' ? d(this.state, this) : d),
            ...this.decorationProviders.map(p => p(this.state, this)),
            ...(this.zones.size ? [this.zones] : []),
        ]
        this.decoCache = { state: this.state, vpFrom: vp.from, vpTo: vp.to, win: this.scanWindow, sets }
        return sets
    }

    // 画进 DOM 的装饰 = decos() + 超长行的横向占位(linegap.ts)。占位只管画,不进 decos():
    // heightMap、折叠判断(viewportHasCollapse / replacedRangesIn)、行号栏都看不见它。
    private paintCache: { base: DecorationSet[], vpFrom: number, vpTo: number, keep: string, adv: number, wide: number, tab: number, sets: DecorationSet[] } | null = null
    private paintSets(): DecorationSet[] {
        const base = this.decos()
        if (this._lineWrapping) return base
        const vp = this.viewport
        const main = this.state.selection.main
        const keep = `${Math.floor(main.anchor / GAP_STEP)}:${Math.floor(main.head / GAP_STEP)}`
        const f = this.fontInfo()
        const adv = f.isMonospace ? this.gapAdvance() : 0
        const wide = f.typicalFullwidthCharacterWidth || 2 * adv
        const c = this.paintCache
        const tab = this.state.tabSize
        if (c && c.base === base && c.vpFrom === vp.from && c.vpTo === vp.to && c.keep === keep && c.adv === adv && c.wide === wide && c.tab === tab) return c.sets
        const doc = this.state.doc
        const to = Math.min(vp.to, doc.length)
        let sets = base
        if (adv > 0 && to - vp.from > LONG_LINE_SCAN) {
            // 行内的 widget / 折叠起止留在窗口里(占位不能和别的 point 装饰重叠,widget 的宽也估不出来)
            const points: { from: number, to: number }[] = []
            for (const set of base) {
                if (set.maxPoint < 0) continue
                set.between(vp.from, to, (a, b, v) => {
                    if ((v as { point?: boolean }).point && !(v instanceof LineDecoration) && !((v as { widget?: unknown }).widget instanceof ZoneWidget))
                        points.push({ from: a, to: b })
                })
            }
            const gaps = lineGapSet(doc, vp.from, to, { win: this.scanWindow, keep: [main.anchor, main.head], points, advance: adv, wideAdvance: wide, tabSize: tab })
            if (gaps) sets = [...base, gaps]
        }
        this.paintCache = { base, vpFrom: vp.from, vpTo: vp.to, keep, adv, wide, tab, sets }
        return sets
    }

    // 占位用的半角字宽。不用 oracle.charWidth:那是 47 个字符量的,Blink 的盒宽按 1/64 px 取整,
    // 每字差到万分之几像素,窗口一挪 4096 列,窗口里的字就会横跳零点几像素。这里按真行的样子(512 字一个文本节点、
    // 隔一个包 .lc-ck)排 8192 个字符量一次,字体 / 字宽变了才重量。量不到(jsdom)用 oracle.charWidth。
    private gapAdv: { key: string, adv: number } | null = null
    private gapAdvance(): number {
        const key = fontSig(this.fontInfo()) + '|' + this.oracle.charWidth
        if (this.gapAdv?.key === key) return this.gapAdv.adv
        let adv = 0
        const content = this.contentDOM
        if (content.isConnected && typeof document.createRange === 'function') {
            const probe = document.createElement('div')
            probe.className = 'cm-line'
            probe.setAttribute('aria-hidden', 'true')
            probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;width:max-content;top:0;left:0'
            const chunk = 'abc def ghi jkl mno pqr stu vwx yz0 123 456 789 '.repeat(11).slice(0, 512)
            for (let i = 0; i < 16; i++) {
                if (i & 1) { const w = document.createElement('span'); w.className = CHUNK_CLASS; w.textContent = chunk; probe.appendChild(w) }
                else probe.appendChild(document.createTextNode(chunk))
            }
            const run = () => {
                content.appendChild(probe)
                try {
                    const r = document.createRange()
                    r.selectNodeContents(probe)
                    const w = typeof r.getBoundingClientRect === 'function' ? r.getBoundingClientRect().width : 0
                    if (w > 0) adv = w / (16 * 512)
                } finally { probe.remove() }
            }
            if (this.observer) this.observer.ignore(run)
            else run()
        }
        if (!(adv > 0)) adv = this.oracle.charWidth
        this.gapAdv = { key, adv }
        return adv
    }

    // 文档变了:没被重画的行里,占位记的起点(data-cm-widget-from,读回 DOM 时按它从 doc 切隐藏原文)跟着变更平移。
    // 折叠不需要这一步(有折叠时每次编辑整窗重画),占位所在的长行多半不重画(在别的行打字、组字时保住的行)。
    // 被变更碰到的行接着就按新文档重画,映射成什么都无所谓。改属性不触发行索引作废(它只听子树和文字)。
    private gapEls: HTMLCollectionOf<Element> | null = null
    private mapLineGaps(tr: Transaction) {
        const els = this.gapEls ??= this.contentDOM.getElementsByClassName('cm-lineGap')
        for (let i = 0; i < els.length; i++) {
            const el = els[i]
            const from = Number(el.getAttribute('data-cm-widget-from'))
            if (from >= 0) el.setAttribute('data-cm-widget-from', String(tr.changes.mapPos(from, 1)))
        }
    }

    // 主选区的一端落在了占位里(⌘→ 跳到 100 万字符的行尾、程序设选区):原生选区和输入法只能落在真文字上,把那条行按新窗口重画
    private selectionInGap(): boolean {
        if (this._lineWrapping) return false
        const doc = this.state.doc
        const main = this.state.selection.main
        for (const p of main.empty ? [main.head] : [main.anchor, main.head]) {
            if (!this.rendered(p)) continue
            const line = doc.lineAt(p)
            if (line.to - line.from <= LONG_LINE_SCAN) continue
            const { node, offset } = this.domAtPos(p)
            if (node.nodeType !== 1) continue
            const w = node.childNodes[offset]
            if (isLineGap(w) && p > Number(w.getAttribute('data-cm-widget-from'))) return true
            if (isLineGap(node.childNodes[offset - 1])) return true // 紧贴占位右缘(行尾):前面没有真文字,输入法 / 原生选区也落不稳
        }
        return false
    }

    private buildHeightMap(): HeightMap {
        const full = { fromA: 0, toA: 0, fromB: 0, toB: this.state.doc.length }
        return HeightMap.empty().applyChanges(this.decos(), this.oracle.doc, this.oracle, [full])
    }

    // 视口内是否存在「塌行」装饰(replace,from<to,跨位置的折叠区)。存在则 patchDOM 的
    // 「children[i] ≡ doc 行 viewportStartLine+i」不变量被塌陷块打破(DOM 行数 < doc 行数),
    // 增量行索引算术全错 → doc 变更须走全视口重建(重算 heightMap + 全量物化)。折叠区被编辑触碰
    // 更会改其 extent,更须重建。折叠罕见,不进普通打字热路径。
    private viewportHasCollapse(): boolean {
        // decos() 同一帧 patchDOM 本来就要(同 state 同视口,缓存命中);贵的是提供者里同步分词,那边已只分视口行。
        // 没有跨位置 point 的集合(maxPoint <= 0:高亮、括号色、诊断…)不用逐个扫
        const vp = this.viewport
        for (const set of this.decos()) {
            if (set.maxPoint <= 0) continue
            let hit = false
            set.between(vp.from, vp.to, (dFrom, dTo, value) => {
                // 塌行 = point 装饰(replace/widget)且跨位置(from<to);mark 高亮 point=false 不算。
                if (dTo > dFrom && (value as { point?: boolean }).point) { hit = true; return false }
            })
            if (hit) return true
        }
        return false
    }

    /** [from, to] 内被 replace 装饰替换掉的区间(折叠 ⋯ 等,from<to),按 from 升序。posAtCoords 跳过隐藏位置用。 */
    replacedRangesIn(from: number, to: number): { from: number, to: number }[] {
        const out: { from: number, to: number }[] = []
        for (const set of this.decos()) {
            set.between(from, to, (dFrom, dTo, value) => {
                if (dTo > dFrom && (value as { point?: boolean }).point) out.push({ from: dFrom, to: dTo })
            })
        }
        return out.sort((a, b) => a.from - b.from)
    }

    // 测量可见窗口 + 计算视口 + 渲染 + DOM 实测行高 → 回写 heightmap。
    // jsdom: clientHeight=0 → 全量渲染,offsetHeight=0 → 不触发重排。
    private measureAndRender() {
        const top = this.scrollDOM.scrollTop
        const bottom = top + this.scrollDOM.clientHeight

        if (bottom === 0 || this.scrollDOM.clientHeight === 0) {
            // 无布局:jsdom,或真浏览器里挂在 display:none / 0 高容器下。全量渲染(测试兼容),
            // 但大文档只画开头一段:隐藏标签页里的 5 万行文件不该整份物化;显示后 RO → measureGeometry 正常虚拟化。
            const doc = this.state.doc
            const to = doc.lines > HIDDEN_RENDER_LINES ? doc.line(HIDDEN_RENDER_LINES).to : doc.length
            this.setViewport(new Viewport(0, to), 1)
            this.renderViewportContent()
            this.measureLineHeights()
            this.measureLineWidths()
            return
        }

        // 重测不是滚动:margin 上下均分(bias 0),记下当前 scrollTop,下一次 scroll 的方向从这里算。
        // 以前拿 onScroll 留下的旧 lastScrollTop 算 bias,程序设 scrollTop 后首测被当成往下滚,上方 margin 归零。
        const bias = 0
        this.lastScrollTop = top
        const vp = computeViewport(this.heightMap, this.oracle, top, bottom, bias)
        const startLine = this.state.doc.lineAt(vp.from).number
        const oldStart = this.viewportStartLine
        const oldCount = this.contentDOM.childElementCount
        this.setViewport(vp, startLine)
        const shift = this.applyViewportShift(oldStart, oldCount)

        // DOM 实测行高 → 回写 heightmap。高度变化时重算视口(行数/位置可能偏移)。
        if (this.measureLineHeights()) {
            const newVp = computeViewport(this.heightMap, this.oracle, top, bottom, bias)
            const newStart = this.state.doc.lineAt(newVp.from).number
            const s0 = this.viewportStartLine
            const c0 = this.contentDOM.childElementCount
            this.setViewport(newVp, newStart)
            this.applyViewportShift(s0, c0)
            this.measureLineHeights()
        }
        this.measureLineWidths(shift)
    }

    private setViewport(vp: Viewport, startLine: number) {
        this.viewport = vp
        this.viewportStartLine = startLine
        this.rebuildBlockStarts()
    }

    // 新 state 已生效、heightMap/DOM 还是旧的：先把 viewport 钳进新 doc。
    // 否则 decos()/indentGuides/viewportHasCollapse 会拿旧 from（大文档滚到底的绝对偏移）去 lineAt 新 doc → 越界。
    private clampViewportToDoc(tr: Transaction) {
        const len = this.state.doc.length
        const from = Math.max(0, Math.min(len, tr.changes.mapPos(this.viewport.from, -1)))
        let to = Math.max(from, Math.min(len, tr.changes.mapPos(this.viewport.to, 1)))
        // 长粘贴(2 万行插在视口里):映射后的 to 会把整段插入包进视口,接着 decos() / viewportHasCollapse
        // 就按这个视口去分词(shiki 逐行,整段 600ms+)。这种变更 patchDOM 反正整窗重画、按滚动位置重算视口,
        // 所以这里把行数钉在「旧视口行数 + max(64, 旧行数)」(与 patchDOM 整窗重画的门槛同一口径),
        // 小改动(打字 / 回车 / 短粘贴)碰不到上限。
        const oldDoc = tr.startState.doc
        const oldLines = oldDoc.lineAt(Math.min(this.viewport.to, oldDoc.length)).number - oldDoc.lineAt(Math.min(this.viewport.from, oldDoc.length)).number + 1
        const doc = this.state.doc
        const fromLine = doc.lineAt(from).number
        const maxLine = fromLine + oldLines + Math.max(64, oldLines)
        if (maxLine < doc.lines && to > doc.line(maxLine).to) to = doc.line(maxLine).to
        if (from === this.viewport.from && to === this.viewport.to)
            return
        this.viewport = new Viewport(from, to)
        this.viewportStartLine = fromLine
    }

    // 重建视觉块 [from,to) 表。setViewport/heightMap 变更后调用;
    // DOMChange 直接读 starts/ends(CM6 用 tile.length 同源信息)。
    rebuildBlockStarts() {
        const starts: number[] = []
        const ends: number[] = []
        this.heightMap.forEachLine(this.viewport.from, Math.min(this.viewport.to, this.state.doc.length), this.oracle, 0, 0, b => {
            starts.push(b.from)
            ends.push(b.to)
        })
        this.viewBlockStarts = starts
        this.viewBlockEnds = ends
    }

    // DOM 实测行高 → MeasuredHeights → heightMap.updateHeight。返回高度是否变化。
    // contentDOM.children[i] 的文档位置 = viewportStartLine + i 行的 from。
    private measureLineHeights(): boolean {
        const children = this.contentDOM.children
        if (!children.length) return false

        const vp = this.viewport
        // 每个 DOM child = 一个视觉块(折叠区已塌成一个 cm-line)→ 逐 child 取实测高,
        // heightMap.updateHeight 按块序位置消费(非按 doc 行),折叠块与其塌陷高一一对应。
        // 取小数真高(getBoundingClientRect):offsetHeight 取整,19.5px 行每行累计 0.5px,第 40 行错一整行。
        // jsdom 无布局 rect 恒 0 → 退回 offsetHeight(测试桩在它上面)。
        // 行上方的 zone 是这一行的 margin-top(rect 不含):负数标记 spaceAbove,块高 = zone + 正文高。
        // 量过的行元素记下高度(行内容一变,行元素就整个换掉),只读新出现的;组字行就地改字(折行时会变高)每次都量。
        // 宽度、字体变了由 measureGeometry 清空。
        const heights: number[] = []
        const samples: number[] = []
        const cache = this.lineHeightCache
        const comp = this.observer?.composing ? this.observer.compositionLine : null
        let any = false
        for (let i = 0; i < children.length; i++) {
            const el = children[i] as HTMLElement
            let h = el === comp ? undefined : cache.get(el)
            if (h === undefined) {
                h = el.getBoundingClientRect().height || el.offsetHeight
                if (h > 0) cache.set(el, h)
            }
            const space = parseFloat(el.style.marginTop) || 0
            if (h > 0) { any = true; samples.push(h) }
            if (space) heights.push(-space)
            heights.push(h + space)
        }
        // 全 0 = 无布局(display:none 容器 / jsdom 未桩):不写进 heightMap,保留估高,显示后再测。
        if (!any) return false

        // 行高样本 → oracle 刷新(仅无探针度量时:探针量到的是真行高,折行下视口众数可能是 2× 行高)。
        // 用众数而非 max:view-zone / 折叠撑高行会把 max 拉飞,污染整表估算(diff diagonal-fill 即踩过此坑)。
        // 行高变了 → force 重估全部未测块(否则已按旧行高估的块一直低估,滚到底只到 70%)。
        let refresh = false
        if (!this.textMetricsMeasured && samples.length && this.oracle.mustRefreshForHeights(samples)) {
            const counts = new Map<number, number>()
            for (const h of samples) {
                const k = Math.round(h * 64) / 64
                counts.set(k, (counts.get(k) ?? 0) + 1)
            }
            let dominant = samples[0], best = 0
            for (const [h, c] of counts) {
                if (c > best) { best = c; dominant = h }
            }
            if (Math.abs(dominant - this.oracle.lineHeight) > 0.01) {
                this.oracle.lineHeight = dominant
                refresh = true
            }
        }

        const measured = new MeasuredHeights(vp.from, heights)
        clearHeightChangeFlag()
        this.heightMap = this.heightMap.updateHeight(this.oracle, 0, refresh, measured)

        // 实测改高后 gutter 须跟 heightMap 重画(render 时 sync 的是估高)
        if (heightChangeFlag) this.syncGutters()

        return heightChangeFlag
    }

    // DOM 实测视口内行宽 → lineWidthMap。返回 maxLineWidth 是否变化（widthChangeFlag）。
    // contentDOM.children[i] 的文档行号 = viewportStartLine + i。对齐 Monaco ViewLines._updateLineWidths。
    // 量宽用 Range 量行内 inline 内容真实宽（对齐 Monaco RenderedViewLine 读 firstChild.offsetWidth），
    // 不读 .cm-line block 的 offsetWidth——block 填满父容器，被 contentDOM min-width 撑开后拿不到真实文字宽。
    // 已有宽的行不再读 DOM(Monaco 的 _cachedWidth):编辑只作废改到的行,打字时只量那一行。
    // shift 有进出行时只量新行（重叠行缓存仍在）。折行不记行宽,不量。
    private measureLineWidths(shift?: ViewportShiftPlan): boolean {
        const children = this.contentDOM.children
        if (!children.length || this.lineWrapping) return false
        const doc = this.state.doc
        const startLine = this.viewportStartLine
        clearWidthChangeFlag()
        const entries: { lineNumber: number, width: number }[] = []
        const root = this.dom.ownerDocument
        const padLeft = this.textPadLeft
        const measureChild = (i: number) => {
            const lineNumber = startLine + i
            if (lineNumber > doc.lines || this.lineWidthMap.has(lineNumber)) return
            entries.push({ lineNumber, width: contentInlineWidth(children[i] as HTMLElement, root, padLeft) })
        }
        if (shift && !shift.full) {
            const pre = shift.prependTo - shift.prependFrom
            const app = shift.appendTo - shift.appendFrom
            for (let i = 0; i < pre; i++) measureChild(i)
            for (let i = children.length - app; i < children.length; i++)
                if (i >= 0) measureChild(i)
        } else {
            for (let i = 0; i < children.length; i++) measureChild(i)
        }
        this.lineWidthOracle.setDoc(doc)
        // charWidth 不在这里反推:旧做法拿视口里一条 ASCII 行的宽(含 16px 行 padding)÷ 字数,得 8.48 且随滚动
        // 换行抖 8.16–9.67,contentWidth 只涨不落。改为 measureTextMetrics 一次可靠量(字体变化时重量)。
        this.lineWidthMap.measureViewport(entries)
        return widthChangeFlag
    }

    private materializeLineRange(fromLine: number, toLine: number): Node[] {
        if (fromLine >= toLine) return []
        const doc = this.state.doc
        const from = doc.line(fromLine).from
        const to = doc.line(toLine - 1).to
        return Array.from(materialize(buildTileTree(doc, this.paintSets(), from, to)).childNodes)
    }

    // 滚动换窗：复用重叠 .cm-line，只物化进出行。折叠塌行时退回整窗重画。
    private applyViewportShift(oldStart: number, oldCount: number): ViewportShiftPlan {
        const doc = this.state.doc
        const startLine = this.viewportStartLine
        const endLine = doc.lineAt(Math.min(this.viewport.to, doc.length)).number
        const newCount = Math.max(0, endLine - startLine + 1)
        const plan = planViewportShift(oldStart, oldCount, startLine, newCount)
        if (plan.full || this.viewportHasCollapse()) {
            this.renderViewportContent()
            return { ...plan, full: true }
        }
        // 顺序:先物化、插新行,再设新 padding,最后删出窗的行。每一步内容总高都 ≥ 最终总高,
        // 途中若有回流(扩展读布局、量宽)浏览器也不会因内容变矮去钳 scrollTop(滚到底时视口回跳)。
        const parent = this.contentDOM
        const head = this.materializeLineRange(plan.prependFrom, plan.prependTo)
        const tail = this.materializeLineRange(plan.appendFrom, plan.appendTo)
        const oldFirst = parent.firstChild
        const oldLast = parent.lastChild
        const before = document.createDocumentFragment()
        for (const n of head) before.appendChild(n)
        parent.insertBefore(before, oldFirst)
        const after = document.createDocumentFragment()
        for (const n of tail) after.appendChild(n)
        parent.appendChild(after)
        this.updatePadding()
        // 删的是原来那批行的头 / 尾(新插的在它们外侧)
        let drop = oldFirst
        for (let i = 0; i < plan.dropHead && drop; i++) { const next = drop.nextSibling; (drop as ChildNode).remove(); drop = next }
        drop = oldLast
        for (let i = 0; i < plan.dropTail && drop; i++) { const prev = drop.previousSibling; (drop as ChildNode).remove(); drop = prev }
        this.applyGutterShift(plan)
        // 留下的行是同一 state 的装饰画的(换窗不改 state),进窗的行用当前装饰
        this.drawn = { doc, sets: this.paintSets() }
        return plan
    }

    // 物化视口区间行 + 设 padding 撑出未渲染区高度。
    private renderViewportContent() {
        const doc = this.state.doc
        const vp = this.viewport
        const sets = this.paintSets()
        const tree = buildTileTree(doc, sets, vp.from, vp.to)
        const nodes = Array.from(materialize(tree).childNodes)
        const kept = this.keepCompositionLine(nodes)
        this.drawn = { doc, sets }

        const { topPad, bottomPad } = this.viewportPadding()
        this.contentDOM.style.paddingTop = `${topPad}px`
        this.contentDOM.style.paddingBottom = `${bottomPad}px`
        if (kept < 0) {
            const fragment = document.createDocumentFragment()
            for (const child of nodes)
                fragment.appendChild(child)
            this.contentDOM.replaceChildren(fragment)
        } else {
            // 组字行节点一次都不能离开 DOM(摘下再插回,原生选区/组字范围就丢了):只换它两侧
            const el = nodes[kept] as HTMLElement
            while (el.previousSibling) el.previousSibling.remove()
            while (el.nextSibling) el.nextSibling.remove()
            const before = document.createDocumentFragment()
            for (let i = 0; i < kept; i++) before.appendChild(nodes[i])
            const after = document.createDocumentFragment()
            for (let i = kept + 1; i < nodes.length; i++) after.appendChild(nodes[i])
            this.contentDOM.insertBefore(before, el)
            this.contentDOM.appendChild(after)
        }
        this.syncGutters()
    }

    // 组字中重绘:组字所在行原样保留旧节点。换掉它 Chrome 会静默放弃组字(不发 compositionend),
    // 提交的字只进 DOM 不进 state(对齐 CM6 compositionView 保护)。仅当这一行没被本次变更碰过时成立
    // (compositionLineFrom 在 update 里随变更映射,碰到了就置 -1,那一行照常重画)。
    // 返回保住的下标(-1 = 没保)。
    private keepCompositionLine(nodes: Node[]): number {
        const el = this.observer?.compositionLine
        if (!el || !this.observer.composing || el.parentNode !== this.contentDOM) return -1
        const from = this.compositionLineFrom
        if (from < 0) return -1
        const i = this.viewBlockStarts.indexOf(from)
        if (i < 0 || i >= nodes.length) return -1
        nodes[i] = el
        return i
    }

    // compositionstart 时记下组字行在 doc 里的起点(observer 记的是行节点)。
    private noteCompositionStart() {
        const el = this.observer.compositionLine
        const i = el ? Array.prototype.indexOf.call(this.contentDOM.children, el) : -1
        this.compositionLineFrom = i >= 0 && i < this.viewBlockStarts.length ? this.viewBlockStarts[i] : -1
    }

    // pos 是否落在已渲染的行里(DOM 选区能精确表达)。
    private rendered(pos: number): boolean {
        return pos >= this.viewport.from && pos <= this.viewport.to && this.contentDOM.childElementCount > 0
    }

    // 主选区 head 不在渲染范围:按当前滚动位置重算视口再渲染(⌘↓ 到文档末等跳转,scrollPosIntoView 刚
    // 改了 scrollTop,异步 onScroll 还没来)。调用方负责 observer.ignore。
    private ensureSelectionRendered() {
        if (this.rendered(this.state.selection.main.head)) return
        this.measureAndRender()
    }

    // 选区端点不在渲染范围时的输入:浏览器只能改已渲染的 DOM,原生插入会错位/改坏文档开头。
    // 直接按 state 选区落字,走与 DOM 变更相同的输入处理器链。返回是否已接管。
    private handleInputOutsideRender(e: InputEvent): boolean {
        const main = this.state.selection.main
        if (this.rendered(main.from) && this.rendered(main.to)) return false
        let insert: string
        let from = main.from, to = main.to
        switch (e.inputType) {
            case 'insertText':
            case 'insertReplacementText':
                insert = e.data ?? e.dataTransfer?.getData('text/plain') ?? ''
                break
            case 'insertParagraph':
            case 'insertLineBreak':
                insert = '\n'
                break
            case 'deleteContentBackward':
            case 'deleteContentForward':
            case 'deleteByCut':
                insert = ''
                if (main.empty) {
                    const doc = this.state.doc
                    if (e.inputType === 'deleteContentForward') {
                        if (to >= doc.length) { e.preventDefault(); return true }
                        to += isSurrogatePair(doc.sliceString(to, to + 2)) ? 2 : 1
                    } else {
                        if (from <= 0) { e.preventDefault(); return true }
                        from -= isSurrogatePair(doc.sliceString(Math.max(0, from - 2), from)) ? 2 : 1
                    }
                }
                break
            default:
                return false
        }
        e.preventDefault()
        applyDOMChangeInner(this, { from, to, insert }, EditorSelection.single(from + insert.length))
        return true
    }

    // 组字开始时选区端点不在渲染范围(全选长文档后用输入法):组字只能替换 DOM 里渲染出来的那段。
    // 先按 state 删掉选区、把光标行渲染出来,组字从光标处开始(组字事件不能 preventDefault)。
    // 跨行选区同理:Chrome 组字首字合并行,state 跟着重画会换掉组字节点 → 首个拼音字母被静默提交。
    private prepareCompositionOutsideRender() {
        const main = this.state.selection.main
        const multiLine = !main.empty && this.state.doc.lineAt(main.from).number !== this.state.doc.lineAt(main.to).number
        if (!multiLine && this.rendered(main.from) && this.rendered(main.to)) return
        this.dispatch(this.state.update({
            changes: main.empty ? undefined : { from: main.from, to: main.to },
            selection: { anchor: main.from },
            scrollIntoView: true,
            userEvent: main.empty ? 'select' : 'delete.selection',
        }))
    }

    // DOM 变更被处理后:视口内 DOM 行文本 ≠ state 的行就重画这些行(原生插入没被 state 采纳——闭括号过键
    // 只移光标、输入处理器改写了插入——留下的幽灵字符,下次编辑会被当成用户输入写进文档)。返回是否动过 DOM。
    repairDOM(): boolean {
        this.syncView()
        if (this.observer.composing) return false
        const children = this.contentDOM.children
        const starts = this.viewBlockStarts, ends = this.viewBlockEnds
        if (children.length !== starts.length) {
            if (!checkBijection(this)) return false
            this.resetDOM()
            return true
        }
        const doc = this.state.doc
        const bad: number[] = []
        for (let i = 0; i < children.length; i++) {
            const el = children[i] as HTMLElement
            if (el.classList.contains('cm-blockWidget')) continue
            const text = lineText(el)
            const docLen = domLineDocLen(el)
            // 含 widget 的行(折叠):只校长度
            if (text.length !== docLen ? docLen !== ends[i] - starts[i] : text !== doc.sliceString(starts[i], ends[i]))
                bad.push(i)
        }
        if (!bad.length) return false
        this.observer.ignore(() => {
            const decos = this.paintSets()
            for (const i of bad) {
                const fresh = Array.from(materialize(buildTileTree(doc, decos, starts[i], ends[i])).childNodes)
                if (fresh.length !== 1) { this.measureAndRender(); break }
                children[i].replaceWith(fresh[0])
            }
            this.updateSelection()
        })
        return true
    }

    // 大变更 / 跨视口边界的变更:不在旧 DOM 上缝补,按新文档 + 当前滚动位置重算视口整窗重画。
    // 成本 ∝ 视口大小(长文本粘贴不再把整段物化进 DOM 再逐个删)。heightMap 已更新到新文档。
    private rerenderViewport() {
        const clientH = this.scrollDOM.clientHeight
        const doc = this.state.doc
        let vp: Viewport
        if (!clientH) {
            vp = new Viewport(0, doc.length)
        } else {
            const top = this.scrollDOM.scrollTop
            vp = computeViewport(this.heightMap, this.oracle, top, top + clientH, 0)
        }
        this.setViewport(vp, doc.lineAt(vp.from).number)
        this.renderViewportContent()
        this.measureLineHeights()
        this.updatePadding()
        this.measureLineWidths()
        this.updateSelection()
    }

    // 增量路径(patchDOM / 只动选区 / 不整窗重画的 effect)之后:拿画在 DOM 上的那份装饰(drawn,旧 doc 坐标)
    // 跟当前装饰经 RangeSet.compare 对比(只比文档没改的缝,对齐 CM6 DocView.updateDeco / findChangedDeco),
    // 视口内装饰变了的块就地重画。[skipFrom, skipTo] 是 patchDOM 刚按新装饰重画过的变更行。
    // 组字行不动(换掉它 Chrome 会静默放弃组字,同 keepCompositionLine);块序列对不上就整窗重画。
    private repaintChangedDecos(tr: Transaction, skipFrom = -1, skipTo = -1) {
        const drawn = this.drawn
        const sets = this.paintSets()
        if (!drawn || drawn.doc !== tr.startState.doc) { this.renderViewportContent(); return }
        const doc = this.state.doc
        this.drawn = { doc, sets }
        let oldSets = drawn.sets, newSets = sets
        if (!tr.docChanged && oldSets.length === newSets.length) {
            // 文档没变:同一个对象的集合(按 doc + 视口缓存的提供者)不用比
            oldSets = oldSets.filter((s, i) => s !== sets[i])
            newSets = sets.filter((s, i) => s !== drawn.sets[i])
            if (!newSets.length) return
        }
        const vpFrom = this.viewport.from, vpTo = this.viewport.to
        const hits: [number, number][] = []
        const add = (from: number, to: number) => { if (to >= vpFrom && from <= vpTo) hits.push([from, to]) }
        RangeSet.compare(oldSets, newSets, tr.changes, { compareRange: add, comparePoint: add })
        if (!hits.length) return
        hits.sort((a, b) => a[0] - b[0])
        const children = this.contentDOM.children
        const starts = this.viewBlockStarts, ends = this.viewBlockEnds
        if (children.length !== starts.length) { this.renderViewportContent(); return }
        const comp = this.observer?.composing ? this.observer.compositionLine : null
        let r = 0, reach = -1 // 起点 ≤ 当前块末的命中里最远的终点
        for (let i = 0; i < starts.length; i++) {
            const s = starts[i], e = ends[i]
            while (r < hits.length && hits[r][0] <= e) reach = Math.max(reach, hits[r++][1])
            if (reach < s) { if (r >= hits.length) break; continue }
            if (s >= skipFrom && e <= skipTo) continue
            const el = children[i] as HTMLElement
            if (el === comp || el.classList.contains('cm-blockWidget')) continue
            const fresh = materialize(buildTileTree(doc, sets, s, e)).childNodes
            if (fresh.length !== 1) { this.renderViewportContent(); return }
            el.replaceWith(fresh[0])
        }
    }

    // 横向滚动 / 换宽度 / 换折行之后重算超长行的扫描窗口。变了返回 true(窗口按格量化,滚动时多数事件不变)。
    private updateScanWindow(): boolean {
        const next = this._lineWrapping
            ? UNLIMITED_SCAN_WINDOW
            : scanWindowFor(this.scrollDOM.scrollLeft, this.scrollDOM.clientWidth, this.oracle.charWidth)
        if (sameScanWindow(next, this.scanWindow)) return false
        this.scanWindow = next
        return true
    }

    // 窗口移动后,视口里的超长行按新窗口重画装饰(其余行不受窗口影响,不动)。组字行不动。
    private repaintLongLines(redrawSelection = true) {
        const starts = this.viewBlockStarts, ends = this.viewBlockEnds, children = this.contentDOM.children
        if (children.length !== starts.length) return
        let long = false
        for (let i = 0; i < starts.length && !long; i++) long = ends[i] - starts[i] > LONG_LINE_SCAN
        if (!long) return
        const doc = this.state.doc
        const sets = this.paintSets()
        this.drawn = { doc, sets }
        const comp = this.observer?.composing ? this.observer.compositionLine : null
        this.observer.ignore(() => {
            for (let i = 0; i < starts.length; i++) {
                if (ends[i] - starts[i] <= LONG_LINE_SCAN) continue
                const el = children[i] as HTMLElement
                if (el === comp || el.classList.contains('cm-blockWidget')) continue
                const fresh = materialize(buildTileTree(doc, sets, starts[i], ends[i])).childNodes
                if (fresh.length === 1) el.replaceWith(fresh[0])
            }
            if (redrawSelection) this.updateSelection()
        })
    }

    // scroll 回调:检查视口是否仍恰当,不恰当则重算 + 换子 + 实测行高。
    private onScroll() {
        // 用户拖滚动条 / 外部写 scrollTop:不是动画自己写的位置 → 取消平滑滚动
        if (this.smooth && this.smoothLast
            && (Math.abs(this.scrollDOM.scrollTop - this.smoothLast.top) > 1.5 || Math.abs(this.scrollDOM.scrollLeft - this.smoothLast.left) > 1.5)) this.cancelSmooth()
        const top = this.scrollDOM.scrollTop
        const bottom = top + this.scrollDOM.clientHeight
        const bias = top - this.lastScrollTop
        this.lastScrollTop = top
        const windowMoved = this.updateScanWindow()

        // Option A:视口重算包进 if(视口不恰当时才换子),几何通知放末尾无条件触发。
        // resize 时视口常仍恰当会跳过重算,但 overlay 尺寸(clientHeight)已变必须通知。
        if (!viewportIsAppropriate(this.viewport, this.heightMap, this.oracle, top, bottom, this.state.doc.length, bias)) {
            const vp = computeViewport(this.heightMap, this.oracle, top, bottom, bias)
            const startLine = this.state.doc.lineAt(vp.from).number
            if (vp.from !== this.viewport.from || vp.to !== this.viewport.to) {
                const oldStart = this.viewportStartLine
                const oldCount = this.contentDOM.childElementCount
                this.setViewport(vp, startLine)
                this.observer.ignore(() => {
                    const shift = this.applyViewportShift(oldStart, oldCount)
                    this.measureLineHeights()
                    this.measureLineWidths(shift)
                    this.updatePadding()
                    this.updateSelection()
                })
            }
        }
        if (windowMoved) this.repaintLongLines()
        this.emitGeometryIfResized()
        if (this.gutters) {
            this.gutters.style.transform = `translateY(${-this.scrollDOM.scrollTop}px)`
        }
        if (this.marginLayer) this.marginLayer.style.transform = `translateY(${-this.scrollDOM.scrollTop}px)`
        this.flushViewEvents()
    }

    private emitGeometryIfResized() {
        const h = this.scrollDOM.clientHeight
        const w = this.scrollDOM.clientWidth
        if (h === this.lastClientH && w === this.lastClientW) return
        this.lastClientH = h
        this.lastClientW = w
        for (const fn of this.geometryListeners) fn()
    }

    // 箭头字段而非方法:解构 `{ state, dispatch }` 当 StateCommand target 后仍绑定到本 view。
    dispatch = (tr: Transaction) => {
        this._dispatch(tr, this)
    }

    // Monaco codeEditorWidget._beginUpdate/_endUpdate:一次更新(事务 / 事件批 / setValue / setModel / trigger)前后各发一次,嵌套只发最外层。
    // onEndUpdate 在这次更新的内容事件、光标事件、settled 监听都发完之后才发(外层 drainOut 之后)。
    private updateCounter = 0
    private readonly beginUpdateEmitter = new Emitter<void>()
    private readonly endUpdateEmitter = new Emitter<void>()
    /** Monaco onBeginUpdate:一次编辑更新开始(嵌套只发最外层) */
    readonly onBeginUpdate: IEvent<void> = this.beginUpdateEmitter.event
    /** Monaco onEndUpdate:这次更新的所有编辑器级事件都发完之后 */
    readonly onEndUpdate: IEvent<void> = this.endUpdateEmitter.event
    /** 把 fn 括进一次「更新」:fn 抛错也照样发 onEndUpdate */
    runUpdate<T>(fn: () => T): T {
        if (this.updateCounter++ === 0) this.beginUpdateEmitter.fire()
        try { return fn() } finally { if (--this.updateCounter === 0) this.endUpdateEmitter.fire() }
    }

    // 应用事务产新 state,更新 heightmap + 增量重建变动行区间(与视口取交集)+ 复原选区。
    update(tr: Transaction) { this.runUpdate(() => this.updateInner(tr)) }

    private updateInner(tr: Transaction) {
        // 先增量维护 token 行表(O(脏段)),decoration/minimap 的 ensureTokenCache 免 toJSON 全文。
        // 每个 view 一份 token 缓存(多 tab/分屏互不覆盖)。
        selectTokenCache(this)
        if (tr.docChanged) prepareLinesFromTransaction(tr)
        // 合并(deferView 里、普通事务):state / 事件 / 监听同步,视图(DOM、heightMap、选区层、overlay)攒到 flushView。
        // 不合并的事务先把攒着的画掉:它的视图更新要从「已画的」状态接着走
        // 什么都不画的事务(只带注解,如 pushStackElement)跟着攒:它没有视图更新,不必先把攒着的画掉
        const defer = (this.viewDefer > 0 || (this.viewPending !== null && isInert(tr))) && this.canDeferView(tr)
        if (this.viewPending && !defer) this.flushView()
        const before = this.state
        this.state = this.state.applyTransaction(tr)
        const cursorMeta = this.cursorMetaOf(tr)
        if (tr.selection || tr.docChanged) this.lastCursorReason = cursorMeta.reason
        if (tr.docChanged) this.zones = this.zones.map(tr.changes)
        if (defer) {
            if (this.viewPending) this.viewPending.trs.push(tr)
            else { this.viewPending = { trs: [tr], from: before, vp: this.viewport, startLine: this.viewportStartLine }; this.scheduleViewFlush() }
            // 视口(文档偏移)先钳进新文档:攒着的这段时间里监听器读 view.viewport / decos() 不越界。画的时候还原成画过的那个
            if (tr.docChanged) this.clampViewportToDoc(tr)
            if (tr.docChanged || tr.selection) this.resetBlink()
            this.observer?.afterTransaction(tr.docChanged, !!tr.selection)
            if (tr.docChanged || tr.selection) this.inputState.lastKeyCode = 0
            this.notifyTransaction(tr, cursorMeta, false)
            return
        }
        this.renderTransaction(tr)
        this.notifyTransaction(tr, cursorMeta, true)
    }

    // 合并只收「普通」事务:不折叠、不碰组字、不带 effects(effects 的消费者会同步读视图)、不在应用 DOM 变更
    private canDeferView(tr: Transaction): boolean {
        if (!this.observer || this.observer.composing || this.observer.applyingDOMChange || this.compositionLineFrom >= 0) return false
        if (tr.effects.length) return false
        return true
    }

    // 微任务里画:同一个同步任务里的事务(trigger 循环、宏、一次 API 调用里的多步)合成一次;
    // 浏览器的下一个事件(按键、输入、鼠标)和下一帧都在微任务之后,所以它们看到的 DOM 总是已画好的。
    private scheduleViewFlush() {
        if (this.viewRaf) return
        this.viewRaf = 1
        queueMicrotask(() => { this.viewRaf = 0; this.flushView() })
    }

    /** 把攒着的视图更新一次画掉(读几何 / 浏览器输入 / 下一帧之前)。没有就什么都不做 */
    flushView(): void {
        const p = this.viewPending
        if (!p || this.viewFlushing || this.destroyed) return
        this.viewPending = null
        this.viewFlushing = true
        try {
            // 多笔合成一笔:startState = 攒之前的 state,changes 依次 compose,选区取末态,scrollIntoView 取或
            this.viewport = p.vp
            this.viewportStartLine = p.startLine
            let tr = p.trs[0]
            if (p.trs.length > 1 || tr.startState !== p.from) {
                let changes = tr.changes, scroll = tr.scrollIntoView, selected = !!tr.selection
                for (let i = 1; i < p.trs.length; i++) {
                    const t = p.trs[i]
                    changes = changes.compose(t.changes)
                    scroll ||= t.scrollIntoView
                    selected ||= !!t.selection
                }
                // 注解取最后一笔(isUserEvent 之类看的是「这一帧最后是什么操作」)
                const last = p.trs[p.trs.length - 1]
                tr = new Transaction(p.from, changes, selected ? this.state.selection : undefined, [], last.annotations, scroll)
            }
            this.renderTransaction(tr, true)
        } finally { this.viewFlushing = false }
    }

    /** 读几何 / 写原生选区之前:攒着的视图更新先画掉(没有就是空操作) */
    syncView(): void { if (this.viewPending) this.flushView() }

    /** 把 fn 里的事务的视图更新合并成一次(嵌套只认最外层;出 fn 不立刻画,等下一帧或下一次读几何) */
    deferView<T>(fn: () => T): T {
        this.viewDefer++
        try { return fn() } finally { this.viewDefer-- }
    }

    private renderTransaction(tr: Transaction, merged = false) {
        const tabSizeChanged = this.applyTabSize()
        // 占位记的起点是「已画的」文档里的偏移:跟着真正画的这一笔(合并时是合成的那笔)映射
        if (tr.docChanged) this.mapLineGaps(tr)
        const oldVp = this.viewport
        const oldStartLine = this.viewportStartLine
        // 组字行随变更映射;变更碰到组字行 → 那一行照常重画,不再保护
        if (tr.docChanged && this.compositionLineFrom >= 0) {
            const line = tr.startState.doc.lineAt(this.compositionLineFrom)
            this.compositionLineFrom = tr.changes.touchesRange(line.from, line.to)
                ? -1 : tr.changes.mapPos(line.from, 1)
        }
        if (tr.docChanged)
            this.clampViewportToDoc(tr)
        // 折叠(replace 装饰塌多行成一块)的覆盖范围由 foldable 从当前 doc 现算 —— 编辑会改其 extent
        // (在折叠行插 \n 使范围 +1)。patchDOM 只重建 doc 变更的窄行窗,不知装饰塌了不同行集 → 残留脏
        // 折叠行破双射(真页 51→464 行 bug)。折叠区被编辑触碰时改走全视口重建(=effect 路径),重算
        // heightMap + 全量物化,让塌陷块与 doc 重新对齐。折叠罕见,不进普通打字热路径。
        const run = tr.docChanged
            ? this.viewportHasCollapse()
                // 全视口重建 + **重算视口**:doc 长变了(插/删字),旧 this.viewport.to 会落在新末行中间,
                // 直接拿旧 vp 渲染会截断末行(折叠下方打字后 last→las 的真 bug)。measureAndRender 按新
                // heightMap 重算视口(jsdom 退化=全文,真浏览器=computeViewport),再物化,才与新 doc 对齐。
                ? () => { this.oracle.setDoc(this.state.doc); this.lineWidthOracle.setDoc(this.state.doc); this.heightMap = this.buildHeightMap(); this.measureAndRender(); this.updateSelection() }
                : () => this.patchDOM(tr, oldVp, oldStartLine)
            : transactionChangesFold(tr)
                // 折叠塌行/展开改块序列 → 重建 heightMap。查找/诊断/补全等 mark effect 不走这里。
                // 视口按新块序列和当前滚动位置重算再整窗重画:展开全部时旧视口的 [from,to] 会包住整篇展开的行
                //(2 万行全物化、全量测高)。旧 DOM 是旧块序列,不能增量换窗。
                ? () => { this.heightMap = this.buildHeightMap(); this.rerenderViewport() }
                : tr.effects.length
                // 涂色 effect(搜索命中/当前项/诊断波浪):height 不变,禁止整表 heightMap。
                // 即将滚出视口时交给后面的 scrollPosIntoView → onScroll 换窗,避免铺两次。
                ? () => {
                    // 只换配置(updateOptions 的选项槽、重装配):DOM 只取决于文档和装饰,文档没变 → 只重画装饰变了的块。
                    // 整窗重画会在切折行前先把整条超长行按旧折行状态重排一遍,紧接着 drawCursors 读布局又排一遍
                    if (tr.effects.every(e => e.is(StateEffect.reconfigure))) this.repaintChangedDecos(tr)
                    else if (!tr.scrollIntoView || this.posInClientView(this.state.selection.main.head)) {
                        this.renderViewportContent()
                    } else {
                        // 换窗交给 onScroll,但那里只物化进窗的行:留在窗里的行要先按新装饰补画
                        //(查找跳到渲染边距里的下一处,旧当前项 / 新当前项都在窗里)
                        this.repaintChangedDecos(tr)
                    }
                    this.updateSelection()
                }
                : tr.selection
                    ? () => {
                        // 点击落点 = 空选区搬家:只需写原生选区/光标。
                        // 旧逻辑无条件 renderViewportContent → syncGutters 整列重建,
                        // gutter 宽闪一下(± 号被 wipe 再画)→ 内容区横移 →「一点击必抖」。
                        // 仅 drawSelection 且涉及非空选区背景装饰时才重画 content,且只重画选区装饰变了的行
                        //(拖选每帧多选一行,整窗重画在 2 万行拖选自动滚里占三成 CPU)。
                        const hadRange = !tr.startState.selection.main.empty
                        const hasRange = !this.state.selection.main.empty
                        if (this.cursorLayer && (hadRange || hasRange))
                            this.repaintChangedDecos(tr)
                        // 字段随选区换了值(装饰可能跟着变):只重画装饰变了的行。字段都没动就不算装饰
                        else if (fieldsChanged(tr.startState, this.state))
                            this.repaintChangedDecos(tr)
                        this.updateSelection()
                    }
                    : () => {
                        if (fieldsChanged(tr.startState, this.state)) this.repaintChangedDecos(tr)
                        this.updateSelection()
                    }
        if (this.observer) this.observer.ignore(run)
        else run()
        if (tabSizeChanged) this.onTabSizeChanged()
        // DOM≡doc 双射闸门:投影跑完后当场校验,dev/test throw、prod 常量守卫 no-op(DCE)。
        // 一整类「编辑边界破双射」bug 在这里被钉死,而非逐个复现修补。
        // 组字中组字行的 DOM 文本本来就领先于 state(flush 挂起),不校验;正在应用 DOM 变更时
        // (输入处理器在 flush 里 dispatch)推迟到 observer 修完 DOM 后再校验。
        if (!this.observer?.applyingDOMChange) this.checkInvariants()
        // L1(行数变化时 Chrome/IE 原生选区可能与显示不一致):有焦点时上面的 updateSelection 已按 state 写回;
        // 没焦点时绝不写 —— 旧做法在这里置 forceSelection,下一次任意 updateSelection(诊断到达、measure)
        // 绕过焦点检查写选区,Chrome 随之聚焦编辑器,宿主输入框里正在打的字进了编辑器。对齐 Monaco:焦点不动。

        if (tr.scrollIntoView) {
            let pos = this.state.selection.main.head
            for (const e of tr.effects) if (e.is(revealPos)) pos = e.value
            this.scrollPosIntoView(pos)
        }
        // 光标跳到渲染范围外(⌘↓、全选后 →):scrollPosIntoView 刚改了 scrollTop,按新位置把光标行渲染出来,
        // 再写 DOM 选区。否则 domAtPos 落到错误节点,接着打字插到视口第一行。
        if ((tr.scrollIntoView || tr.selection || tr.docChanged) && this.hasFocus && this.observer &&
            !this.observer.composing && !this.rendered(this.state.selection.main.head)) {
            this.observer.ignore(() => {
                this.ensureSelectionRendered()
                this.updateSelection()
            })
        }
        // 打字/删改/移动光标(按住方向键、点击)→ 光标恒亮一段,停手再闪,同 Monaco(含 IME:走 update 而非 keydown)
        if (!merged) {
            if (tr.docChanged || tr.selection) this.resetBlink()
            this.observer?.afterTransaction(tr.docChanged, !!tr.selection)
        }
        this.inputState.mouseSelection?.update?.(tr.docChanged)
        if (!merged && (tr.docChanged || tr.selection)) {
            this.inputState.lastKeyCode = 0
            // 不清除 lastSelectionTime：指针选区 origin 窗仍要
        }
        this.flushViewEvents()
        // 合并画完:按视图画东西的监听(选区层、minimap、sticky…)按合成的事务补画一次。不合并的在 notifyTransaction 里随事务监听一起调
        if (merged) this.fireViewUpdate(tr)
    }

    private fireViewUpdate(tr: Transaction) {
        for (const fn of this.frameListeners.slice()) fn(tr, this)
    }

    private notifyTransaction(tr: Transaction, cursorMeta: { reason: CursorChangeReason, source: string }, rendered: boolean) {
        // Monaco 顺序:内容变更事件先于光标事件(监听器在内容事件里读到的已是新选区)。
        // 监听器里再发事务(如改装饰)是嵌套的:它不单独发光标事件,由最外层等所有监听器都收完内容事件后统一发(按快照比对,嵌套里的选区变化也在内)。
        if (tr.docChanged) this.docVersion++
        const outer = this.trListenerDepth++ === 0
        const oldVersion = this.docVersion - (tr.docChanged ? 1 : 0)
        try {
            for (const fn of this.transactionListeners) fn(tr, this)
            if (rendered) this.fireViewUpdate(tr)
        } finally { this.trListenerDepth-- }
        if (outer) {
            const b = this.evBatch
            if (b) {
                b.trs.push(tr)
                b.meta = cursorMeta
                if (b.trs.length === 1) b.oldVersion = oldVersion
            } else {
                this.outQ.push(() => this.emitCursorEvents(cursorMeta, oldVersion), () => { for (const fn of this.settledListeners.slice()) fn(tr, this) })
                this.drainOut()
            }
        }
    }

    private drainOut(): void {
        this.outDepth++
        try { while (this.outQ.length) this.outQ.shift()!() } finally { this.outDepth-- }
    }

    /** 批内攒事件(见 evBatch);嵌套只认最外层。fn 抛错也照样把攒下的发完 */
    batchEvents(fn: () => void): void { this.runUpdate(() => this.batchEventsInner(fn)) }

    private batchEventsInner(fn: () => void): void {
        if (this.evBatchDepth++ === 0) this.evBatch = { contentFns: [], trs: [], meta: null, oldVersion: 0 }
        try { fn() } finally {
            if (--this.evBatchDepth === 0) {
                const b = this.evBatch!
                this.evBatch = null
                this.outQ.push(...b.contentFns)
                if (b.meta) { const meta = b.meta, ov = b.oldVersion; this.outQ.push(() => this.emitCursorEvents(meta, ov)) }
                for (const t of b.trs) this.outQ.push(() => { for (const fn of this.settledListeners.slice()) fn(t, this) })
                this.drainOut()
            }
        }
    }

    /** 编辑器级内容事件的投递:批内攒到批尾,批外立刻 */
    deferEditorEvent(fn: () => void): void {
        if (this.evBatch) this.evBatch.contentFns.push(fn)
        else if (this.outDepth > 0) this.outQ.push(fn)
        else fn()
    }

    /** DOM≡doc 双射闸门:dev/test throw、prod 常量守卫 no-op。组字中跳过(组字行本来就领先于 state)。 */
    checkInvariants() {
        if (invariantGate && !this.observer?.composing) {
            const v = checkBijection(this)
            if (v) throw new Error(`[invariant] update broke DOM≡doc: ${v}`)
        }
    }

    // 光标恒亮复位:加 .cm-typing 停 blink 动画,debounce 530ms(= CSS blink 半周期)后移除恢复闪。
    // 幂等加类(不每键重排),只重置定时器。
    private resetBlink() {
        if (!this.cursorLayer) return
        this.cursorLayer.classList.add('cm-typing')
        const win = this.dom.ownerDocument.defaultView
        if (!win) return
        if (this.typingTimer) win.clearTimeout(this.typingTimer)
        this.typingTimer = win.setTimeout(() => {
            this.typingTimer = 0
            this.cursorLayer?.classList.remove('cm-typing')
        }, 530)
    }

    private posInClientView(pos: number): boolean {
        const clientH = this.scrollDOM.clientHeight
        if (!clientH) return true
        const block = this.heightMap.lineAt(pos, QueryType.ByPos, this.oracle, 0, 0)
        const top = this.scaler.toDOM(block.top)
        const bottom = this.scaler.toDOM(block.bottom)
        const scrollTop = this.scrollDOM.scrollTop
        return top >= scrollTop && bottom <= scrollTop + clientH
    }

    // 消费 tr.scrollIntoView:把主光标所在行滚进视口(对齐 Monaco/CM6 —— 方向键下翻、末行输入、
    // 搜索跳转后编辑器自动跟随)。坐标系同 viewportPadding:heightMap.lineAt 给文档绝对像素,
    // scaler.toDOM 映射到 scrollDOM 空间(超大文档缩放),scrollTop 就在这个空间里。
    private scrollPosIntoView(pos: number) {
        const clientH = this.scrollDOM.clientHeight
        if (!clientH) return // jsdom 无布局 / 未挂载:不滚(测走注入几何)
        const block = this.heightMap.lineAt(pos, QueryType.ByPos, this.oracle, 0, 0)
        const top = this.scaler.toDOM(block.top)
        const bottom = this.scaler.toDOM(block.bottom)
        const scrollTop = this.scrollDOM.scrollTop
        const lh = this.oracle.lineHeight
        if (this.revealSurroundingLines > 0 && lh > 0) {
            // Monaco(非鼠标来源、VerticalRevealType.Simple):上留 context 行、下留 context-1 行再 +1 行(盖住横条),
            // 视口高不扣横条;盒在视口内不动,否则最小滚动。
            const context = Math.min(clientH / lh / 2, this.revealSurroundingLines)
            const boxStart = top - context * lh
            const boxEnd = bottom + Math.max(0, context - 1) * lh + lh
            let next = scrollTop
            if (boxEnd - boxStart > clientH || boxStart < scrollTop) next = boxStart
            else if (boxEnd > scrollTop + clientH) next = boxEnd - clientH
            if (next !== scrollTop) this.scrollDOM.scrollTop = Math.max(0, next)
        } else {
            // 可视高扣掉横向滚动条(对齐 Monaco:末行停在横条上方,不被压住)。
            if (!this.hScrollbarH) this.refreshHScrollbarHeight() // 横条晚于首次 measureGeometry 挂上
            const visibleH = Math.max(0, clientH - this.horizontalScrollbarHeight())
            // 已在视口内:绝不滚(严格边界,防每次 selection 更新微滚抖动)。行在视口上方 → 顶对齐;下方 → 底对齐(露出整行)。
            if (top < scrollTop || bottom > scrollTop + visibleH)
                this.scrollDOM.scrollTop = top < scrollTop ? top : bottom - visibleH
        }
        this.maybeVisualViewportScroll(pos)

        // 横向(Monaco revealAll → ViewLines._computeScrollLeftToReveal,非 minimal):单光标看 head,多光标看各选区两端,
        // 有跨行选区就不横滚;盒左留 HORIZONTAL_EXTRA_PX = 30、右留 revealHorizontalRightPadding = 15,
        // 盒在可见宽内不动,否则最小滚动(盒比视口宽时左对齐;多光标盒比视口宽时不滚)。折行不横滚。
        // 竖向刚滚走的话光标行可能还没渲染(onScroll 是异步的),先按新位置渲染,Monaco 也是等行进了 DOM 再算。
        const sd = this.scrollDOM
        const width = sd.clientWidth
        if (this.lineWrapping || !width) return
        const doc = this.state.doc
        const ranges = this.state.selection.ranges
        if (ranges.length > 1 && ranges.some(r => r.from < doc.lineAt(r.to).from)) return
        if (!this.rendered(pos)) {
            if (this.observer.composing) return
            // 换窗会拆掉原生选区所在的行,当场按 state 写回;否则随后的 selectionchange 把拆剩的位置读成用户选区
            this.observer.ignore(() => { this.ensureSelectionRendered(); this.updateSelection() })
        }
        const contentLeft = this.contentDOM.getBoundingClientRect().left
        let boxStart = Infinity, boxEnd = 0
        for (const p of ranges.length > 1 ? ranges.flatMap(r => [r.from, r.to]) : [pos]) {
            const c = this.caretCoords(p)
            if (!c) return
            const x = Math.round(c.left - contentLeft)
            boxStart = Math.min(boxStart, x)
            boxEnd = Math.max(boxEnd, x)
        }
        boxStart = Math.max(0, boxStart - 30)
        boxEnd += 15
        if (ranges.length > 1 && boxEnd - boxStart > width) return
        const left = sd.scrollLeft | 0
        let next = left
        if (boxEnd - boxStart >= width || boxStart < left) next = boxStart
        else if (boxEnd > left + width) next = Math.max(0, boxEnd - width)
        if (next === left) return
        // 要滚到的位置得在 scrollWidth 里(Monaco _ensureMaxLineWidth(boxEnd)),横条 redraw 晚于这里,先撑开
        const cw = this.lineWidthMap.contentWidth()
        this.lineWidthMap.ensureMaxLineWidth(boxEnd)
        if (this.contentDOM.style.minWidth && this.lineWidthMap.contentWidth() !== cw)
            this.contentDOM.style.minWidth = `${this.lineWidthMap.contentWidth()}px`
        sd.scrollLeft = next
    }

    // L5: 移动端 visualViewport 小于 layout 视口时 scrollTop 不够，补 line.scrollIntoView
    private maybeVisualViewportScroll(pos: number) {
        const win = this.dom.ownerDocument.defaultView
        if (!win?.visualViewport) return
        const vv = win.visualViewport
        if (win.innerHeight - vv.height <= 1) return
        const c = this.caretCoords(pos)
        if (!c) return
        const vvTop = win.pageYOffset + vv.offsetTop
        const vvBottom = vvTop + vv.height
        if (c.top > vvBottom || c.bottom < vvTop) {
            try {
                const { node } = this.domAtPos(pos)
                const el = (node.nodeType === 1 ? node as HTMLElement : node.parentElement)?.closest?.('.cm-line')
                el?.scrollIntoView?.({ block: 'nearest' })
            } catch { /* */ }
        }
    }

    /** 对外：无滚动聚焦（L6）。聚焦后 state 选区写回原生选区 */
    focus() {
        this.syncView()
        focusPreventScroll(this.contentDOM)
        this.syncSelectionToDOM()
    }

    /**
     * 强制结束输入法组字:把 DOM 里当前的组字文本按现状提交进 state。浏览器放弃组字却不发
     * compositionend 的场合用(组字中点鼠标并 preventDefault、失焦等)。不在组字中则无操作。
     */
    endComposition() {
        this.observer.forceEndComposition()
    }

    // state 选区强制写进原生选区(忽略由此引起的 selectionchange:setSelectionRange 已记下写入点)。
    private syncSelectionToDOM() {
        if (this.observer.composing) return
        this.observer.ignore(() => {
            this.ensureSelectionRendered()
            this.forceSelection = true
            this.updateSelection()
        })
    }

    // 全量重投影 + 复原选区。无事务上下文的重同步路径(domobserver:DOM/选区变了但 state 没动)。
    resetDOM() {
        this.syncView()
        const run = () => {
            this.measureAndRender()
            this.updateSelection()
        }
        if (this.observer) this.observer.ignore(run)
        else run()
    }

    // 只替换本次变更覆盖的行 DOM(与当前视口取交集),保留其余行节点不动。
    // contentDOM 当前持有旧视口的行(startLine = this.viewportStartLine);patch 用旧行号定位 children,
    // 替换后更新视口到新文档。
    private patchDOM(tr: Transaction, oldVp: Viewport, oldStartLine: number) {
        const oldDoc = tr.startState.doc
        const newDoc = this.state.doc

        // 收集变更区间
        const changedRanges: { fromA: number, toA: number, fromB: number, toB: number }[] = []
        tr.changes.iterChangedRanges((fromA, toA, fromB, toB) => {
            changedRanges.push({ fromA, toA, fromB, toB })
        })

        // 更新 heightmap
        this.oracle.setDoc(newDoc)
        clearHeightChangeFlag()
        this.heightMap = this.heightMap.applyChanges(this.decos(), oldDoc, this.oracle, changedRanges)

        // 更新 linewidthmap（行数变化重置 maxLineWidth，否则标脏变更行）
        clearWidthChangeFlag()
        this.lineWidthMap.applyChanges(tr.changes, oldDoc, newDoc)
        // 宽度下界：仅脏行估算 bump（勿再全文扫 estimateMaxWidth）。
        {
            let lo = Infinity, hi = 0
            for (const { fromB, toB } of changedRanges) {
                lo = Math.min(lo, newDoc.lineAt(fromB).number)
                hi = Math.max(hi, newDoc.lineAt(toB).number)
            }
            if (lo !== Infinity) this.lineWidthMap.seedEstimate(lo, hi)
            else this.lineWidthMap.seedEstimate()
        }

        // 旧文档侧:受影响行区间
        let oldFrom = oldDoc.length, oldTo = 0
        for (const { fromA, toA } of changedRanges) {
            oldFrom = Math.min(oldFrom, fromA)
            oldTo = Math.max(oldTo, toA)
        }
        const oldFromLine = oldDoc.lineAt(oldFrom).number
        const oldToLine = oldDoc.lineAt(oldTo).number

        // 新文档侧:受影响行区间
        let newFrom = newDoc.length, newTo = 0
        for (const { fromB, toB } of changedRanges) {
            newFrom = Math.min(newFrom, fromB)
            newTo = Math.max(newTo, toB)
        }
        const spanFrom = newDoc.lineAt(newFrom).from
        const spanTo = newDoc.lineAt(newTo).to

        // 变更行区间 → 视口相对删除子节点区间(前锚定 + 钳视口窗口)。纯算术抽在 planLinePatch:
        // 老版用「视口子节点数 - 全文档尾行数」两坐标系相减,大文档时 removeEnd 变负 → 删除不跑、脏行残留。
        const total = this.contentDOM.children.length
        // 编辑前视口末行(1-based):稳定尾部据此算。jsdom 退化模式 viewport.to = 全文末,== oldDoc.lines。
        const oldEndLine = oldDoc.lineAt(Math.min(oldVp.to, oldDoc.length)).number
        const plan = planLinePatch({ oldStartLine, oldEndLine, childCount: total, oldFromLine, oldToLine })
        // 跨视口边界(⌘A 后粘贴/回车、选区延伸到视口外)或新行数远超视口(长文本粘贴):旧 DOM 上缝补
        // 要么物化错行数(只剩新文档第一行),要么把整段插入物化进 DOM 再逐个删。改为按新文档整窗重画。
        const newSpanLines = newDoc.lineAt(newTo).number - newDoc.lineAt(newFrom).number + 1
        if (plan.intersects && (oldFromLine < oldStartLine || oldToLine > oldEndLine ||
            newSpanLines > Math.max(64, oldEndLine - oldStartLine + 1))) {
            this.rerenderViewport()
            if (heightChangeFlag || widthChangeFlag) this.onScroll()
            return
        }
        let repaintedFrom = -1, repaintedTo = -1
        if (plan.intersects && this.patchCompositionLine(tr, oldFromLine, oldToLine, oldStartLine)) {
            // 组字行就地改完,不重物化
        } else if (plan.intersects) {
            // 相交:物化新行 splice 进 contentDOM。删除区 [childStart, childEnd) 两端已钳在 [0, total]。
            // 浏览器观测阶段可能已把变更行改成不同数量的子节点(回车拆行、退格并行),childEnd 由 oldToLine
            //(patch 前 children 仍持有的旧行)导出,故这片区间覆盖浏览器留下的全部脏节点,不管拆成几个。
            // 物化跨度须与删除区对齐:变更全在视口内(B1)时 = spanFrom/spanTo;跨视口顶/底(B4/B5)时
            // 把跨度钳到「渲染到的变更行」映射进新文档的区间,免物化出视口外的行导致节点数错配。
            const renderFromLine = Math.max(oldFromLine, oldStartLine)
            const renderToLine = Math.min(oldToLine, oldEndLine)
            const clampedFrom = renderFromLine === oldFromLine
                ? spanFrom
                : newDoc.lineAt(tr.changes.mapPos(oldDoc.line(renderFromLine).from, 1)).from
            const clampedTo = renderToLine === oldToLine
                ? spanTo
                : newDoc.lineAt(tr.changes.mapPos(oldDoc.line(renderToLine).to, -1)).to
            const nodes = Array.from(
                materialize(buildTileTree(newDoc, this.paintSets(), clampedFrom, clampedTo)).childNodes,
            )
            repaintedFrom = clampedFrom
            repaintedTo = clampedTo
            const ref = plan.childEnd < total ? this.contentDOM.children[plan.childEnd] : null
            // 超长行:浏览器刚在原来的文本节点里就地改过字符,换掉整行 = 几十万字符重新排版,每个键十几毫秒。
            // 新旧同一行的子节点(token span)数一样时,只换内容真的不一样的那几个,其余留着,Blink 只重排改动处。
            // 只对长行做(其余行换掉的成本可以忽略)。
            const sameCount = nodes.length === plan.childEnd - plan.childStart
            if (sameCount && clampedTo - clampedFrom > LONG_LINE_KEEP_DOM) {
                for (let k = 0; k < nodes.length; k++) {
                    const old = this.contentDOM.children[plan.childStart + k]
                    const fresh = nodes[k]
                    if (!old) { this.contentDOM.insertBefore(fresh, ref); continue }
                    if (!(fresh instanceof Element) || !patchNodeInPlace(old, fresh)) old.replaceWith(fresh)
                }
            } else {
                for (let i = plan.childEnd - 1; i >= plan.childStart; i--)
                    this.contentDOM.children[i]?.remove()
                for (const node of nodes)
                    this.contentDOM.insertBefore(node, ref)
            }
        }
        // 变更完全在视口外(!intersects):不碰 children(下次 scroll 进视口时 renderViewportContent 物化新行)

        // 映射视口到新文档 + 更新 padding(高度可能变化)
        const mappedVp = mapViewport(oldVp, tr.changes, this.heightMap, this.oracle)
        const mappedStartLine = newDoc.lineAt(mappedVp.from).number
        this.setViewport(mappedVp, mappedStartLine)
        // 变更行以外:同一事务里字段装饰在别的行上变了(同符号高亮被清、查找当前项取消、空行参考线变深),那些行也重画
        this.repaintChangedDecos(tr, repaintedFrom, repaintedTo)
        this.updatePadding()
        if (oldDoc.lines !== newDoc.lines || heightChangeFlag)
            this.syncGutters()
        this.updateSelection()
        this.measureLineWidths()

        if (heightChangeFlag || widthChangeFlag)
            this.onScroll()
    }

    // 组字中的变更只落在组字那一行、且不碰组字文本本身(远端/协同在同一行别处插删):就地改这一行的
    // 文本节点,组字节点不离开 DOM(Chrome 的组字范围是活 Range,随 DOM 修改平移)。行内高亮等组字结束、
    // 那一行重读时再重画。条件不满足返回 false,走普通重画(组字文本可能被冲掉,由兜底收尾)。
    private patchCompositionLine(tr: Transaction, oldFromLine: number, oldToLine: number, oldStartLine: number): boolean {
        const el = this.observer?.compositionLine
        if (!el || !this.observer.composing || el.parentNode !== this.contentDOM || oldFromLine !== oldToLine) return false
        const idx = Array.prototype.indexOf.call(this.contentDOM.children, el)
        if (oldStartLine + idx !== oldFromLine) return false
        const line = tr.startState.doc.line(oldFromLine)
        // 行里有超长行的占位:DOM 文字只是窗口那一段。占位按它覆盖的原文补全(起点已由 mapLineGaps 映射到新文档),
        // 下面在整行坐标里找组字、对位变更,落到 DOM 时扣掉前面占位的长度;变更碰到占位就不就地改
        const gaps = this.gapEls && this.gapEls.length ? Array.from(el.getElementsByClassName('cm-lineGap')) : []
        const holes: { at: number, len: number }[] = []
        let domText: string
        if (gaps.length) {
            domText = ''
            const walker = el.ownerDocument.createTreeWalker(el, 5 /* SHOW_ELEMENT | SHOW_TEXT */)
            for (let n = walker.nextNode(); n; n = walker.nextNode()) {
                if (n.nodeType === 3) domText += (n as Text).data
                else if (isLineGap(n)) {
                    const from = Number(n.getAttribute('data-cm-widget-from')), len = Number(n.getAttribute('data-cm-widget'))
                    holes.push({ at: domText.length, len })
                    domText += this.state.doc.sliceString(from, from + len)
                }
            }
        }
        else domText = lineText(el)
        // DOM 行 = doc 行 + 组字文本:findDiff 找出组字在 doc 行里的落点 [compFrom, compToA) 和 DOM 里多出的长度
        const d = findDiff(line.text, domText, line.text.length, null)
        const compFrom = d ? d.from : line.text.length
        const compToA = d ? d.toA : line.text.length
        const delta = d ? d.toB - d.toA : 0
        const edits: { a: number, b: number, text: string }[] = []
        let ok = true
        tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
            const text = inserted.toString()
            let a = fromA - line.from, b = toA - line.from
            if (text.indexOf('\n') >= 0 || a < 0 || b > line.length) { ok = false; return }
            if (b <= compFrom && !(a === compFrom && b === compFrom && delta)) { /* 组字之前 */ }
            else if (a >= compToA) { a += delta; b += delta }
            else { ok = false; return }
            edits.push({ a, b, text })
        })
        if (!ok || !edits.length) return false
        if (holes.length) for (const e of edits) {
            let shift = 0
            for (const h of holes) {
                if (h.at + h.len <= e.a) shift += h.len
                else if (h.at < e.b || (h.at < e.a && e.a < h.at + h.len)) return false
            }
            e.a -= shift
            e.b -= shift
        }
        for (let i = edits.length - 1; i >= 0; i--)
            if (!replaceLineText(el, edits[i].a, edits[i].b, edits[i].text)) return false
        this.compositionLineFrom = this.state.doc.lineAt(tr.changes.mapPos(line.from, -1)).from
        return true
    }

    private viewportPadding(): { topPad: number, bottomPad: number } {
        const vp = this.viewport
        // 首行上方的 zone 是它自己的 margin-top,不进 padding
        const first = this.heightMap.lineAt(vp.from, QueryType.ByPos, this.oracle, 0, 0)
        const topPad = this.scaler.toDOM(first.top - first.spaceAbove)
        const bottomFrom = this.heightMap.lineAt(vp.to, QueryType.ByPos, this.oracle, 0, 0).bottom
        const totalHeight = this.scaler.toDOM(this.heightMap.height)
        return { topPad, bottomPad: Math.max(0, totalHeight - this.scaler.toDOM(bottomFrom)) + this.bottomSpace() }
    }

    // 横向滚动条当前占的底部高度:自绘横条(hscrollbar overlay,挂 view.dom)存在 + 内容横向溢出 + 非折行。
    // 用 contentWidth(行宽表真源)判溢出,不读横条的 display(它在 redraw 里才更新,会滞后一拍)。
    // 不许读布局:viewportPadding 在 applyViewportShift 删/插行的半途调用,此时强制回流会让浏览器按
    // 「少了一截行」的临时 scrollHeight 钳 scrollTop(实测 7000 → 5265)。视口宽用滚动/测量时缓存的
    // lastClientW,横条高在 measureGeometry 里量好(refreshHScrollbarHeight)。
    private horizontalScrollbarHeight(): number {
        if (this.lineWrapping || !this.hScrollbarH) return 0
        const vw = this.lastClientW
        if (vw <= 0 || this.lineWidthMap.contentWidth() <= vw) return 0
        return this.hScrollbarH
    }

    private refreshHScrollbarHeight() {
        const bar = this.dom.querySelector(':scope > .cm-hscrollbar') as HTMLElement | null
        const win = this.dom.ownerDocument.defaultView
        this.hScrollbarH = bar ? ((win ? parseFloat(win.getComputedStyle(bar).height) : 0) || bar.offsetHeight) : 0
    }

    private makeGutterRow(n: number): HTMLElement {
        const doc = this.state.doc
        const line = doc.line(n)
        const block = this.heightMap.lineAt(line.from, QueryType.ByPos, this.oracle, 0, 0)
        // Monaco lineNumbersWidth = round(max(位数, lineNumbersMinChars 5) × maxDigitWidth):整数像素,正文起点不带小数
        const gm = this.gutterMetrics()
        const numW = gm.numW
        const el = document.createElement('div')
        el.className = 'cm-gutterElement'
        el.style.height = `${this.scaler.toDOM(block.height)}px`
        if (block.spaceAbove) el.style.marginTop = `${block.spaceAbove}px`
        const num = document.createElement('span')
        num.className = 'cm-lineNumber'
        num.style.width = `${numW}px`
        num.textContent = String(n)
        // renderFinalNewline:末行是空行(文件以换行结尾)时 off 不画号、dimmed 淡显
        if (n === doc.lines && line.length === 0) {
            const rfn = this.opts.renderFinalNewline
            if (rfn === 'off') num.textContent = ''
            else if (rfn === 'dimmed') num.classList.add('dimmed-line-number')
        }
        // 行号点击选整行(含行尾换行,对齐 Monaco)。区间由 commands.lineSelectionRange 纯算。
        el.onmousedown = (e) => {
            e.preventDefault()
            this.dispatch(this.state.update({
                selection: lineSelectionRange(this.state, n),
                scrollIntoView: true,
                userEvent: 'select',
            }))
        }
        el.appendChild(num)
        // line 装饰的 gutterClass / gutterMarker = Monaco 的 marginClassName / linesDecorationsClassName
        let rowH = this.oracle.lineHeight // 一个视觉行的高:默认行高,被 lineHeight 装饰撑高时取装饰的(多条取最大,同 heightmap)
        for (const set of this.decos()) {
            set.between(line.from, line.from, (from, _to, value) => {
                if (from !== line.from || !(value instanceof LineDecoration)) return
                const spec = value.spec
                if (spec.lineHeight && spec.lineHeight > rowH) rowH = spec.lineHeight
                if (spec.gutterClass) el.classList.add(...spec.gutterClass.split(' '))
                if (spec.glyphClass && this.opts.glyphMargin) this.addGlyphItem(el, spec.glyphClass, spec.glyphLane)
                if (spec.gutterMarker) {
                    const marker = document.createElement('span')
                    marker.className = `cm-lineDecoration ${spec.gutterMarker}`
                    num.appendChild(marker)
                }
            })
        }
        if (this.foldGutter) {
            const foldable = this.foldGutter.foldableAt(this.state, line.from)
            // 对齐 Monaco folding decorations:codicon chevronDown=展开可折 / chevronRight=已折叠
            // 占位始终保留列宽,不可折行为空槽。
            const marker = document.createElement('span')
            marker.className = 'cm-foldMarker'
            if (gm.markerW !== 26) marker.style.width = `${gm.markerW}px`
            if (foldable) {
                const folded = this.foldGutter.isFolded(this.state, n)
                marker.classList.add(
                    'cm-foldMarker-active',
                    'codicon',
                    folded ? 'codicon-chevron-right' : 'codicon-chevron-down',
                )
                if (folded) marker.classList.add('cm-foldMarker-collapsed')
                marker.title = folded ? 'Expand' : 'Collapse'
                marker.onmousedown = (e) => {
                    e.preventDefault()
                    e.stopPropagation() // 勿触发行号选整行
                    this.foldGutter!.toggle(this.state, n)
                }
            }
            el.appendChild(marker)
        } else {
            // 没有折叠也留 Monaco lineDecorationsWidth 的 10px
            const pad = document.createElement('span')
            pad.className = 'cm-lineDecorations'
            if (gm.decoW !== 10) pad.style.width = `${gm.decoW}px`
            el.appendChild(pad)
        }
        this.alignWrappedGutterRow(el, block.height, rowH)
        return el
    }

    // 字形边距里的一项(Monaco glyphMarginClassName):绝对定位在 gutter 左 padding 里,车道 1 左 / 2 中 / 4 右按出现的车道数排
    /**
     * 保证字形边距里有 lane 这条车道(Left=1 / Center=2 / Right=3),返回它从左数第几条。
     * 装饰的 glyphMarginClassName 与 glyph margin widget 共用:没有车道就没有这一列。
     */
    reserveGlyphLane(lane: number): { index: number, count: number } {
        const bit = lane === 3 || lane === 4 ? 4 : lane === 2 ? 2 : 1
        if (!(this.glyphLaneSeen & bit)) {
            this.glyphLaneSeen |= bit
            this.glyphLanes = [1, 2, 4].filter(b => this.glyphLaneSeen & b).length
        }
        if (!this.glyphSlot) {
            this.glyphSlot = true
            this.applyGlyphPadding()
            this.requestGeometryMeasure() // 行号栏变宽 → 正文左移,折行重排
        } else if (this.gutters && !this.gutters.style.paddingLeft) this.applyGlyphPadding()
        else this.applyGlyphPadding()
        return { index: [1, 2, 4].filter(b => this.glyphLaneSeen & b).indexOf(bit), count: this.glyphLanes }
    }

    private addGlyphItem(row: HTMLElement, cls: string, lane = 1) {
        const { index: laneIdx } = this.reserveGlyphLane(lane)
        const lh = this.oracle.lineHeight || this.fontInfo().lineHeight
        const g = document.createElement('div')
        g.className = `cm-glyphMargin-item ${cls}`
        g.style.cssText = `position:absolute;top:0;height:${lh}px;width:${lh}px;left:${-(this.glyphLanes - laneIdx) * lh}px`
        row.appendChild(g)
    }

    // 折行块(多视觉行)的行号/折叠箭头放在首视觉行,不在整块里垂直居中(对齐 Monaco)。
    private alignWrappedGutterRow(el: HTMLElement, blockHeight: number, lh: number) {
        if (!this.lineWrapping || blockHeight <= lh * 1.5) return
        el.style.alignItems = 'flex-start'
        for (const child of Array.from(el.children) as HTMLElement[]) {
            child.style.height = `${lh}px`
            child.style.lineHeight = `${lh}px`
        }
    }

    private applyGutterShift(plan: ViewportShiftPlan) {
        if (!this.gutters || plan.full) {
            this.syncGutters()
            return
        }
        const g = this.gutters
        if (!g.childElementCount) {
            this.syncGutters()
            return
        }
        for (let i = 0; i < plan.dropTail; i++) g.lastChild?.remove()
        for (let i = 0; i < plan.dropHead; i++) g.firstChild?.remove()
        const first = g.firstChild
        for (let n = plan.prependFrom; n < plan.prependTo; n++)
            g.insertBefore(this.makeGutterRow(n), first)
        for (let n = plan.appendFrom; n < plan.appendTo; n++)
            g.appendChild(this.makeGutterRow(n))
        const { topPad, bottomPad } = this.viewportPadding()
        g.style.paddingTop = `${topPad}px`
        g.style.paddingBottom = `${bottomPad}px`
    }

    // 行号 gutter 与 contentDOM 同步:逐**视觉块**(heightMap.forEachLine),不逐 doc 行。
    // 折叠区在 heightMap 已塌成一个块 → 与 content 的 cm-line 一一对应,gutter 不再为隐藏行多出行号。
    // 每个行号行高 = 该视觉块的 DOM 高(塌陷块更矮),保证与内容逐行对齐。
    private syncGutters() {
        if (!this.gutters) return
        const doc = this.state.doc
        const vp = this.viewport
        const { topPad, bottomPad } = this.viewportPadding()
        this.gutters.style.paddingTop = `${topPad}px`
        this.gutters.style.paddingBottom = `${bottomPad}px`
        const frag = document.createDocumentFragment()
        this.heightMap.forEachLine(vp.from, vp.to, this.oracle, 0, 0, (block) => {
            frag.appendChild(this.makeGutterRow(doc.lineAt(block.from).number))
        })
        this.gutters.replaceChildren(frag)
    }

    // 只更新 padding(不换行 DOM),用于高度变化但视口内行不变时。
    private updatePadding() {
        const { topPad, bottomPad } = this.viewportPadding()
        this.contentDOM.style.paddingTop = `${topPad}px`
        this.contentDOM.style.paddingBottom = `${bottomPad}px`
        if (this.gutters) {
            this.gutters.style.paddingTop = `${topPad}px`
            this.gutters.style.paddingBottom = `${bottomPad}px`
        }
        this.layoutZoneNodes()
    }

    // state.selection.main → 原生选区(rebuild 毁了 DOM 选区,这里复原)+ 重画光标层。
    private updateSelection() {
        if (!this.observer?.composing && this.selectionInGap()) this.repaintLongLines(false)
        this.drawCursors()
        const force = this.forceSelection
        this.forceSelection = false
        // 组字中且组字行还在:不动原生选区(改写选区会让浏览器提交/放弃组字)
        if (this.observer?.composing && this.observer.compositionAlive()) return
        if (!force && this.root.activeElement !== this.contentDOM) return
        const main = this.state.selection.main
        const anchor = this.domAtPos(main.anchor)
        const head = this.domAtPos(main.head)
        applyDOMSelection(this.root, this.contentDOM, anchor, head, main.empty)
        this.observer.setSelectionRange(anchor, head)
    }

    // 每个选区 head 按坐标画一个光标到 overlay 层(不进可编辑内容流)。形状 / 宽度 / 闪烁照 Monaco ViewCursor:
    // cursorStyle(line / block / underline / *-thin / block-outline)、cursorWidth、cursorBlinking(类名在 layer 上,CSS 管动画)、
    // cursorSmoothCaretAnimation(复用光标元素,left/top 走 CSS transition)。用 Range.getClientRects() 拿 head 处几何,相对 .cm-content 定位。
    // Monaco effectiveCursorStyle:overtype 输入模式下取 overtypeCursorStyle,否则 cursorStyle
    private effectiveCursorStyle(): TextEditorCursorStyle {
        return InputMode.getInputMode() === 'overtype' ? this.opts.overtypeCursorStyle : this.opts.cursorStyle
    }

    private drawCursors() {
        const layer = this.cursorLayer
        if (!layer) return
        this.updateCursorLayer()
        const contentRect = this.contentDOM.getBoundingClientRect()
        const o = this.opts
        const style = this.effectiveCursorStyle()
        const typical = this.typicalCharWidth()
        const lineCursorWidth = Math.min(o.cursorWidth, typical)
        // 组字中 state 还没有组字文本:主光标跟原生光标(组字文本末尾)走,对齐 Monaco
        const compCaret = this.observer?.composing ? this.nativeCaretCoords() : null
        // cursorSmoothCaretAnimation 'explicit':只有显式移动(点击、方向键)才动画,打字不动画
        const pause = o.cursorSmoothCaretAnimation === 'explicit' && this.lastCursorReason !== CursorChangeReason.Explicit
        const els = this.cursorEls
        let n = 0
        const lh = this.oracle.lineHeight
        for (const range of this.state.selection.ranges) {
            const isMain = range === this.state.selection.main
            const c = (isMain && compCaret) || this.caretCoords(range.head, this.lineWrapping ? range.assoc : 0) // 视口外 / jsdom 无布局 → null,跳过
            if (!c) continue
            const cursor = els[n] ?? (els[n] = document.createElement('div'))
            n++
            cursor.className = isMain ? 'cm-cursor cm-cursor-primary' : 'cm-cursor cm-cursor-secondary'
            cursor.style.transitionProperty = pause ? 'none' : ''
            // 光标高 = 行高,顶 = 所在视觉行的行盒顶(对齐 Monaco:20px 行高光标 20px,不是字形高 15px)。
            // 字形矩形在行盒里上下等分 half-leading,字形中线 = 行盒中线;折行时也落在正确的视觉行。
            // 中线只用来定「第几个视觉行」,顶取 heightMap 块顶 + 行号×行高:Chrome 的 caret rect 顶会取整
            // (15px 字形在 20px 行里顶 +2 而不是 +2.5),直接反推会高出半像素(和当前行框、选区块错开)。
            let top = (c.height ? c.top + c.height / 2 : c.top + lh / 2) - lh / 2 - contentRect.top
            if (lh > 0 && c !== compCaret) { // 组字中 heightMap 还没算进组字文本,跟原生光标走
                const blk = this.lineBlockAt(range.head)
                const row = Math.max(0, Math.min(Math.round(blk.height / lh) - 1, Math.round((top - blk.top) / lh)))
                top = blk.top + row * lh
            }
            let left = c.left - contentRect.left
            let width: number
            let height = lh
            let text = ''
            if (style === TextEditorCursorStyle.Line || style === TextEditorCursorStyle.LineThin || c === compCaret) {
                // Monaco:Line 宽 cursorWidth(没设 = 2),LineThin 宽 1;横坐标取整,宽 ≥ 2 的竖线离行首 ≥ 1px 时左移 1px 落在两字之间
                width = style === TextEditorCursorStyle.LineThin ? 1 : lineCursorWidth > 0 ? lineCursorWidth : 2
                // Monaco cursorHeight:竖线光标的高(0 = 整行高),不超过行高,在行内垂直居中
                if (o.cursorHeight > 0) { height = Math.min(lh, o.cursorHeight); top += (lh - height) / 2 }
                left = Math.round(left)
                if (width >= 2 && left >= 1) left -= 1
            } else {
                // block / underline / block-outline:盖住 head 后面那个字素,宽 = 它的宽(tab / 行尾 = 半角字宽)
                const g = this.graphemeAt(range.head)
                width = g && g !== '\t' ? this.graphemeWidth(range.head, g.length) || typical : typical
                if (style === TextEditorCursorStyle.Block) text = g
                if (style === TextEditorCursorStyle.Underline || style === TextEditorCursorStyle.UnderlineThin) {
                    const t = style === TextEditorCursorStyle.Underline ? 2 : 1
                    top += lh - t
                    height = t
                }
            }
            cursor.style.left = `${left}px`
            cursor.style.top = `${top}px`
            cursor.style.width = `${width}px`
            cursor.style.height = `${height}px`
            cursor.style.lineHeight = `${height}px`
            if (cursor.textContent !== text) cursor.textContent = text
        }
        while (els.length > n) els.pop()!.remove()
        for (const el of els) if (el.parentNode !== layer) layer.appendChild(el)
    }

    // head 后面那个字素(代理对 / 组合字符整体);行尾 = ''
    private graphemeAt(pos: number): string {
        const line = this.state.doc.lineAt(pos)
        const off = pos - line.from
        if (off >= line.length) return ''
        return line.text.slice(off, findClusterBreak(line.text, off, true))
    }

    // [pos, pos+len) 在屏上的宽(无布局 / 视口外 → 0)
    private graphemeWidth(pos: number, len: number): number {
        if (pos < this.viewport.from || pos + len > this.viewport.to) return 0
        const a = this.domAtPos(pos), b = this.domAtPos(pos + len)
        const r = scratchRange(this.dom.ownerDocument)
        try { r.setStart(a.node, a.offset); r.setEnd(b.node, b.offset) } catch { return 0 }
        const rects = typeof r.getClientRects === 'function' ? r.getClientRects() : null
        return rects && rects.length ? rects[0].width : 0
    }

    // Monaco typicalHalfwidthCharacterWidth:量到真实字体就用量的,否则 oracle 的字宽
    private typicalCharWidth(): number {
        return this.oracle.charWidth || this.fontInfo().typicalHalfwidthCharacterWidth
    }

    // 光标层的类名(Monaco ViewCursors._getClassName):形状 + 闪烁方式 + 平滑移动
    private updateCursorLayer() {
        const layer = this.cursorLayer
        if (!layer) return
        const o = this.opts
        const shape = ['', 'cursor-line-style', 'cursor-block-style', 'cursor-underline-style', 'cursor-line-thin-style', 'cursor-block-outline-style', 'cursor-underline-thin-style'][this.effectiveCursorStyle()] ?? 'cursor-line-style'
        // 只读 = 常亮;组字中 = 隐藏(自绘光标不盖输入法的下划线)
        const blinking = this.composing ? TextEditorCursorBlinkingStyle.Hidden : this.state.readOnly ? TextEditorCursorBlinkingStyle.Solid : o.cursorBlinking
        const blink = ['cursor-hidden', 'cursor-blink', 'cursor-smooth', 'cursor-phase', 'cursor-expand', 'cursor-solid'][blinking] ?? 'cursor-solid'
        const key = `${shape} ${blink}${o.cursorSmoothCaretAnimation !== 'off' ? ' cursor-smooth-caret-animation' : ''}`
        if (key === this.cursorClassKey) return
        for (const c of this.cursorClassKey.split(' ')) if (c) layer.classList.remove(c)
        this.cursorClassKey = key
        for (const c of key.split(' ')) layer.classList.add(c)
    }

    // 原生(折叠)选区焦点处的光标矩形。不在内容里 / 无布局 → null。
    private nativeCaretCoords(): { left: number, top: number, height: number, bottom: number } | null {
        const sel = getSelection(this.root)
        if (!sel || !sel.focusNode || !this.contentDOM.contains(sel.focusNode)) return null
        const r = scratchRange(this.dom.ownerDocument)
        try { r.setStart(sel.focusNode, sel.focusOffset) } catch { return null }
        r.collapse(true)
        const rects = typeof r.getClientRects === 'function' ? r.getClientRects() : null
        const g = rects && rects.length ? rects[0] : null
        return g && g.height ? { left: g.left, top: g.top, height: g.height, bottom: g.bottom } : null
    }

    // ======================================================================
    // 视图选项(Monaco updateOptions 的视图一半):所有「选项变化 → 视图更新」收口在 applyViewOptions
    // ======================================================================

    /** 当前生效的字体信息(吃了 EditorZoom) */
    fontInfo(): FontInfo {
        const fi = this.opts.fontInfo
        const r = (1 + EditorZoom.getZoomLevel() * 0.1) / (1 + (bakedZoomOf.get(fi) ?? 0) * 0.1)
        if (r === 1) return fi
        return new FontClass({
            ...fi,
            fontSize: fi.fontSize * r,
            lineHeight: (fi.lineHeight * r) | 0,
            typicalHalfwidthCharacterWidth: fi.typicalHalfwidthCharacterWidth * r,
            typicalFullwidthCharacterWidth: fi.typicalFullwidthCharacterWidth * r,
            spaceWidth: fi.spaceWidth * r,
            middotWidth: fi.middotWidth * r,
            wsmiddotWidth: fi.wsmiddotWidth * r,
            maxDigitWidth: fi.maxDigitWidth * r,
        }, fi.isTrusted)
    }

    // 容器外框尺寸(Monaco 的 outerWidth/outerHeight):view.dom,量不到时(无布局)退到 scrollDOM + 行号栏
    private outerSize(): { width: number, height: number } {
        const w = this.dom.clientWidth || (this.scrollDOM.clientWidth + (this.guttersClip?.offsetWidth ?? 0)) || this.layoutSize?.width || 0
        const h = (this.dom.clientHeight ? this.dom.clientHeight - this.bannerHeight : 0) || this.scrollDOM.clientHeight || this.layoutSize?.height || 0
        return { width: w, height: h }
    }

    /**
     * 选项层的 DOM 相关输入(fontInfo 的度量、容器尺寸、pixelRatio、zoom 级别、行数)。
     * H1 的 updateOptions:`resolveEditorOptions(raw, view.getResolveEnv())` 再 `view.applyViewOptions(computed)`。
     */
    getResolveEnv(): ResolveEnv {
        const zoom = EditorZoom.getZoomLevel()
        const size = this.outerSize()
        const digits = String(this.state.doc.lines).length
        return {
            memory: this.optionMemory,
            outerWidth: size.width,
            outerHeight: size.height,
            measureFont: (bare: BareFontInfo) => {
                const measured = measureFontInfo(bare, this.dom) ?? estimateFontInfo(bare)
                const info: FontInfo = new FontClass(measured, measured.isTrusted)
                bakedZoomOf.set(info, zoom)
                return info
            },
            viewLineCount: this.lineWrapping && this.oracle.lineHeight ? Math.max(1, Math.round(this.heightMap.height / this.oracle.lineHeight)) : this.state.doc.lines,
            lineNumbersDigitCount: digits,
            pixelRatio: this.dom.ownerDocument.defaultView?.devicePixelRatio || 1,
            zoomLevel: zoom,
            inputMode: InputMode.getInputMode(),
            glyphMarginDecorationLaneCount: this.glyphLanes,
        }
    }

    /** Monaco EditorLayoutInfo:选项 + 实测的容器尺寸 / 字宽 / 行数,用 O 层 computeLayout 算(行号栏、字形边距按 DOM 实际有没有算) */
    getLayoutInfo(): EditorLayoutInfo {
        const o = this.opts
        const f = this.fontInfo()
        const size = this.outerSize()
        const cw = this.oracle.charWidth || f.typicalHalfwidthCharacterWidth
        const eff = {
            ...o,
            glyphMargin: o.glyphMargin && this.glyphSlot,
            lineNumbers: this.lineNumbers ? o.lineNumbers : { ...o.lineNumbers, renderType: 0 },
            folding: o.folding && !!this.foldGutter,
        }
        return computeLayout(eff, {
            memory: this.optionMemory,
            outerWidth: size.width,
            outerHeight: size.height,
            isDominatedByLongLines: false,
            lineHeight: this.oracle.lineHeight && !this.fontOverridden() ? this.oracle.lineHeight : f.lineHeight,
            viewLineCount: this.lineWrapping && this.oracle.lineHeight ? Math.max(1, Math.round(this.heightMap.height / this.oracle.lineHeight)) : this.state.doc.lines,
            lineNumbersDigitCount: String(this.state.doc.lines).length,
            typicalHalfwidthCharacterWidth: cw,
            maxDigitWidth: this.oracle.charWidth || f.maxDigitWidth,
            pixelRatio: this.dom.ownerDocument.defaultView?.devicePixelRatio || 1,
            glyphMarginDecorationLaneCount: this.glyphLanes,
        })
    }

    // 字体是不是被选项 / zoom 改过(改过 → 行高以选项为准;没改 → 以实测为准,宿主 CSS 可能用别的行高)
    private fontOverridden(): boolean {
        return this.appliedFontSig !== fontSig(DEFAULT_OPTIONS.fontInfo)
    }

    private applyFontStyles() {
        const f = this.fontInfo(), d = DEFAULT_OPTIONS.fontInfo
        const s = this.dom.style
        const set = (prop: string, val: string, def: string) => { if (val === def) s.removeProperty(prop); else s.setProperty(prop, val) }
        const ls = (x: number) => (x ? `${x}px` : 'normal')
        set('font-family', massagedFontFamily(f.fontFamily), massagedFontFamily(d.fontFamily))
        set('font-weight', f.fontWeight, d.fontWeight)
        set('font-size', `${f.fontSize}px`, `${d.fontSize}px`)
        set('font-feature-settings', f.fontFeatureSettings, d.fontFeatureSettings)
        set('font-variation-settings', f.fontVariationSettings, d.fontVariationSettings)
        set('line-height', `${f.lineHeight}px`, `${d.lineHeight}px`)
        set('letter-spacing', ls(f.letterSpacing), ls(d.letterSpacing))
        this.appliedFontSig = fontSig(f)
    }

    private applyZoom() {
        if (this.destroyed) return
        this.applyViewOptions(this.opts, true)
    }

    /** 折行的列数:固定列 / Monaco 的 wrappingColumn(视口折行) / bounded 的上限;0 = 没有列数(没折行,或还量不到) */
    private wrapColumns(): number {
        if (!this.lineWrapping || !this.oracle.charWidth) return 0
        if (this.wrapColumn > 0) return this.wrapColumn
        const li = this.heightMap ? this.getLayoutInfo() : null
        return li?.isViewportWrapping && li.wrappingColumn > 0 ? li.wrappingColumn : this.wrapBound
    }

    // 选项里的换行三件套 → 'mode|column|bound'
    private wrapModeOf(o: ComputedEditorOptions): { on: boolean, column: number, bound: number } {
        const ww = o.wordWrapOverride2 !== 'inherit' ? o.wordWrapOverride2
            : o.wordWrapOverride1 !== 'inherit' ? o.wordWrapOverride1 : o.wordWrap
        return { on: ww !== 'off', column: ww === 'wordWrapColumn' ? o.wordWrapColumn : -1, bound: ww === 'bounded' ? o.wordWrapColumn : -1 }
    }

    // wordWrapColumn / bounded:按列数钉住正文宽度(固定列 = 宽;bounded = 最大宽),窄于视口的 bounded、宽于视口的固定列都靠 CSS 自然折
    private applyWrapWidth(): boolean {
        const cs = this.contentDOM.style
        const before = cs.cssText
        const cw = this.oracle.charWidth
        // 视口折行(wordWrap on / bounded)的折点由 Monaco 的 wrappingColumn(= floor((内容宽 − 竖条 − 2) ÷ 半角字宽))决定,
        // 不是浏览器按像素自然折:把正文宽钉成这么多列(固定列模式仍用 wordWrapColumn),折点才和 Monaco 逐行一致
        const col = this.wrapColumns()
        if (!this.lineWrapping || col <= 0 || !cw) {
            if (this.wrapStyled) {
                cs.removeProperty('width'); cs.removeProperty('max-width'); cs.removeProperty('flex')
                this.dom.classList.remove('cm-wrapColumn')
                this.wrapStyled = false
            }
            return cs.cssText !== before
        }
        // 向上取整:col 列恰好放得下(Math.round 可能少 0.03px 把最后一列挤到下一行),不足 1px 不会多放一列
        const w = Math.ceil(col * cw) + Math.round(this.textPadLeft + this.textPadRight)
        this.wrapStyled = true
        if (this.wrapColumn > 0) {
            cs.setProperty('width', `${w}px`); cs.setProperty('max-width', 'none'); cs.setProperty('flex', 'none')
            this.dom.classList.add('cm-wrapColumn')
        } else {
            cs.setProperty('max-width', `${w}px`)
        }
        return cs.cssText !== before
    }

    // 行号栏 / 折叠列 / 字形边距的几何(Monaco computeLayout 同一套算式)
    private gutterMetrics(): GutterMetrics {
        const o = this.opts
        const digits = String(this.state.doc.lines).length
        const numW = Math.round(Math.max(digits, o.lineNumbersMinChars) * this.oracle.charWidth)
        const decoW = o.lineDecorationsWidth
        const markerW = decoW + (o.showFoldingControls !== 'never' ? 16 : 0)
        const glyphW = o.glyphMargin && this.glyphSlot ? (this.oracle.lineHeight || this.fontInfo().lineHeight) * this.glyphLanes : 0
        return { numW, decoW, markerW, glyphW }
    }

    private applyGlyphPadding() {
        if (!this.gutters) return
        const w = this.gutterMetrics().glyphW
        this.gutters.style.paddingLeft = w ? `${w}px` : ''
    }

    /**
     * 选项 → 视图的唯一入口(构造时、H1 的 updateOptions、EditorZoom 变化都走这里)。
     * 只处理和上一次应用的值不同的项;默认值不碰 DOM,所以不设选项的 EditorView 和以前一样。
     * computed 通常是 `resolveEditorOptions(raw, view.getResolveEnv())` 的结果。
     */
    applyViewOptions(computed: ComputedEditorOptions, zoomOnly = false): void {
        if (this.destroyed) return
        const prev = this.appliedOpts
        this.opts = computed
        this.appliedOpts = computed
        const changed = (...keys: (keyof ComputedEditorOptions)[]) => keys.some(k => !deepEqual(prev[k], computed[k]))
        const anchor = this.captureScrollAnchor()
        let remeasure = false

        // 1. 字体 / 行高 / zoom
        const fontChanged = fontSig(this.fontInfo()) !== this.appliedFontSig
        if (fontChanged) { this.applyFontStyles(); this.lineWidthMap.extraWidth = this.extraHorizontalSpace(); remeasure = true }

        // 2. 类名钩子(CSS 在 themecss)
        const cl = this.dom.classList
        cl.toggle('cm-noRoundedSelection', !computed.roundedSelection)
        for (const c of Array.from(cl)) if (c.startsWith('cm-wrapIndent-') || c.startsWith('cm-wordBreak-')) cl.remove(c)
        const wi = computed.wrappingIndent
        // 默认值不加类名(裸 EditorView 的 className 仍是 'cm-editor')
        if (wi !== WrappingIndent.Same) cl.add(`cm-wrapIndent-${['none', 'same', 'indent', 'deepIndent'][wi] ?? 'same'}`)
        if (computed.wordBreak !== 'normal') cl.add(`cm-wordBreak-${computed.wordBreak}`)
        cl.toggle('cm-glyphMargin-off', !computed.glyphMargin)
        // indent / deepIndent 在原行缩进之上多缩 1 / 2 个缩进单位(Monaco wrappedTextIndentLength)
        const extra = wi === WrappingIndent.Indent ? 1 : wi === WrappingIndent.DeepIndent ? 2 : 0
        if (extra) this.dom.style.setProperty('--cm-wrap-extra', `calc(var(--lm-tab-size, 4) * ${extra}ch)`)
        else this.dom.style.removeProperty('--cm-wrap-extra')

        // 3. 换行:开关 / 列 / bounded
        const wm = this.wrapModeOf(computed)
        const wrapSig = `${wm.on}|${wm.column}|${wm.bound}`
        if (wrapSig !== this.appliedWrapSig) {
            this.appliedWrapSig = wrapSig
            this.wrapColumn = wm.column
            this.wrapBound = wm.bound
            const toggled = wm.on !== this._lineWrapping
            if (toggled) this.reconfigure({ lineWrapping: wm.on })
            else if (this.updateWrapLineLength()) this.relayoutHeights()
            // 开关折行 / 换行列:先前量行高时正文宽还没按换行列设好(applyWrapWidth 在后),量出来的行数不对;宽变了就再量一遍
            if (this.applyWrapWidth() || toggled) this.relayoutHeights()
        }

        // 4. 滚动范围 / 内边距 / 行号开关
        if (changed('scrollBeyondLastLine') && computed.scrollBeyondLastLine !== this._scrollBeyondLastLine)
            this.reconfigure({ scrollBeyondLastLine: computed.scrollBeyondLastLine })
        if (changed('scrollBeyondLastColumn')) {
            this.scrollBeyondLastColumn = computed.scrollBeyondLastColumn
            this.lineWidthMap.extraWidth = this.extraHorizontalSpace()
        }
        if (changed('lineNumbers')) {
            const on = computed.lineNumbers.renderType !== 0
            if (on !== !!this.lineNumbers && !(on && prev.lineNumbers.renderType === computed.lineNumbers.renderType))
                this.reconfigure({ lineNumbers: on })
        }
        if (changed('padding')) {
            this.paddingBottom = computed.padding.bottom
            this.setViewZone(PADDING_ZONE_ID, computed.padding.top > 0 ? { afterLine: 0, height: computed.padding.top } : null)
            this.observer.ignore(() => this.updatePadding())
        }

        // 5. gutter 几何 / 终止换行符 / 字形边距
        if (changed('lineNumbersMinChars', 'lineDecorationsWidth', 'glyphMargin', 'renderFinalNewline', 'showFoldingControls')) {
            this.observer.ignore(() => { this.applyGlyphPadding(); this.syncGutters() })
            remeasure = true
        }

        // 6. 光标
        if (changed('cursorStyle', 'overtypeCursorStyle', 'cursorWidth', 'cursorHeight', 'cursorBlinking', 'cursorSmoothCaretAnimation')) {
            this.observer.ignore(() => this.drawCursors())
        }

        // 7. 滚动:smoothScrolling 关掉时立刻落到终点
        if (changed('smoothScrolling') && !computed.smoothScrolling) this.finishSmooth()

        // 8. automaticLayout
        if (changed('automaticLayout')) this.setAutomaticLayout(computed.automaticLayout)

        if (remeasure) {
            this.measureGeometry()
            this.restoreScrollAnchor(anchor)
        }
        if (!zoomOnly || remeasure) for (const fn of this.geometryListeners.slice()) fn()
        this.flushViewEvents(true)
    }

    // 折行列变了 / 字宽变了之后按新口径重估整张 heightMap 并重画
    // 末列之后的留白(Monaco viewLayout._computeContentWidth:scrollBeyondLastColumn × fontInfo.typicalHalfwidthCharacterWidth)。
    // 比例字体用 fontInfo 的典型半角宽,不是探针文本量出来的 oracle.charWidth:两者不同(Georgia 8.27 对 6.3);等宽字体下相等,用量出来的
    private extraHorizontalSpace(): number {
        const f = this.fontInfo()
        return this.scrollBeyondLastColumn * (f.isMonospace ? this.oracle.charWidth : (f.typicalHalfwidthCharacterWidth || this.oracle.charWidth))
    }

    /** 把 state.tabSize 写进 CSS(--lm-tab-size)。返回是不是「已经有旧值、现在变了」 */
    private applyTabSize(): boolean {
        const t = this.state.tabSize
        if (t === this.appliedTabSize) return false
        const had = this.appliedTabSize !== 0
        this.appliedTabSize = t
        // 4 是 CSS 里 var(--lm-tab-size, 4) 的默认值:不设选项时不动 view.dom 的内联样式
        if (t === 4) this.dom.style.removeProperty('--lm-tab-size')
        else this.dom.style.setProperty('--lm-tab-size', String(t))
        return had
    }

    // 制表符占的列数变了:已量的行宽、折行行数、行高全部作废(Monaco 里 tabSize 变是 model 选项事件 → 重折行 + 重渲染,
    // maxLineWidth 随 onFlushed 清零)
    private onTabSizeChanged() {
        this.lineWidthOracle.setDoc(this.state.doc)
        this.lineWidthMap.flush()
        this.lineWidthMap.seedEstimate()
        this.updateWrapLineLength()
        this.relayoutHeights()
    }

    private relayoutHeights() {
        this.lineHeightCache = new WeakMap()
        this.heightMap = this.heightMap.updateHeight(this.oracle, 0, true)
        this.observer.ignore(() => {
            this.measureAndRender()
            this.updatePadding()
            this.syncGutters()
            this.updateSelection()
        })
    }

    // ======================================================================
    // Monaco 视图 API(ICodeEditor 的位置 / 滚动 / reveal / 命中 / view zone / 事件部分)
    // ======================================================================

    getDomNode(): HTMLElement { return this.dom }
    getContainerDomNode(): HTMLElement { return this.dom.parentElement ?? this.dom }

    private toPos(p: IPosition): number {
        const doc = this.state.doc
        const n = Math.floor(p.lineNumber) || 1
        // Monaco validatePosition:行号越界 → 文档头 / 文档尾(不是首 / 末行的第 1 列)
        if (n < 1) return 0
        if (n > doc.lines) return doc.length
        const line = doc.line(n)
        return line.from + Math.min(Math.max(1, Math.floor(p.column) || 1) - 1, line.length)
    }

    private fromPos(pos: number): Position {
        const line = this.state.doc.lineAt(pos)
        return new Position(line.number, pos - line.from + 1)
    }

    private toSelection(anchor: number, head: number): Selection {
        const a = this.fromPos(anchor), h = this.fromPos(head)
        return new Selection(a.lineNumber, a.column, h.lineNumber, h.column)
    }

    getPosition(): Position { return this.fromPos(this.state.selection.main.head) }
    getSelection(): Selection {
        const m = this.state.selection.main
        return this.toSelection(m.anchor, m.head)
    }

    /** Monaco 顺序:主选区在最前,其余按文档序(CM 内部的 ranges 是文档序,mainIndex 另记) */
    getSelections(): Selection[] {
        return this.orderedRanges().map(r => this.toSelection(r.anchor, r.head))
    }

    private orderedRanges(): SelectionRange[] {
        const sel = this.state.selection
        const order = selectionCreationOrder.get(sel)
        if (order && order.length === sel.ranges.length && order.every(r => sel.ranges.includes(r))) {
            const main = sel.main
            return [main, ...order.filter(r => r !== main)]
        }
        return [sel.main, ...sel.ranges.filter((_, i) => i !== sel.mainIndex)]
    }

    /**
     * 各选区(getSelections 同序)两端的视图位置 {lineNumber, column}:视图行号数折行后的行,column 含续行缩进(Monaco cursorState.viewState)。
     * 折点上按 assoc 取前一行尾 / 后一行首。没有文本侧折行模型(没开固定列折行)返回 null,此时视图位置 = 模型位置。
     */
    viewSelections(): { anchor: { lineNumber: number, column: number }, head: { lineNumber: number, column: number } }[] | null {
        this.syncView()
        const m = this.softWrapModel()
        if (!m) return null
        const doc = this.state.doc
        const at = (pos: number, assoc: number) => {
            const l = doc.lineAt(pos)
            const v = m.toView(l.number, pos - l.from, assocAffinity(assoc))
            return { lineNumber: m.viewLineNumber(v.line, v.row), column: v.col }
        }
        return this.orderedRanges().map(r => ({ anchor: at(r.anchor, r.assoc), head: at(r.head, r.assoc) }))
    }

    setPosition(position: IPosition, source = 'api'): void {
        const pos = this.toPos(position)
        this.setSelectionRanges([{ anchor: pos, head: pos }], source, CursorChangeReason.NotSet)
    }

    /** 参数可以是 IRange(anchor = start、head = end)或 ISelection(anchor = selectionStart、head = position) */
    setSelection(sel: IRange | ISelection, source = 'api'): void {
        this.setSelections([sel], source)
    }

    setSelections(sels: readonly (IRange | ISelection)[], source = 'api', reason = CursorChangeReason.NotSet): void {
        if (!sels || !sels.length) throw new Error('Invalid arguments')
        this.setSelectionRanges(sels.map(sel => {
            if ('selectionStartLineNumber' in sel)
                return { anchor: this.toPos({ lineNumber: sel.selectionStartLineNumber, column: sel.selectionStartColumn }), head: this.toPos({ lineNumber: sel.positionLineNumber, column: sel.positionColumn }) }
            return { anchor: this.toPos({ lineNumber: sel.startLineNumber, column: sel.startColumn }), head: this.toPos({ lineNumber: sel.endLineNumber, column: sel.endColumn }) }
        }), source, reason)
    }

    private setSelectionRanges(rs: { anchor: number, head: number }[], source: string, reason: CursorChangeReason) {
        this.apiCursorMeta = { source, reason }
        try {
            this.dispatch(this.state.update({
                selection: EditorSelection.create(rs.map(r => EditorSelection.range(r.anchor, r.head)), 0, keepOverlappingCursors(this.state)),
                userEvent: 'select.api',
            }))
        } finally { this.apiCursorMeta = null }
    }

    // ---- 滚动 ----
    getScrollTop(): number { this.syncView(); return this.scrollDOM.scrollTop }
    getScrollLeft(): number { this.syncView(); return this.scrollDOM.scrollLeft }
    getScrollHeight(): number { this.syncView(); return this.metrics.height }
    // Monaco 的宽度含竖向滚动条(viewLayout._computeContentWidth:maxLineWidth + 末列留白 + verticalScrollbarWidth);
    // lite 的竖条是自绘的、不占 scrollDOM 的宽,这里按布局的 verticalScrollbarWidth 补回,公共 API 才和 Monaco 同值
    private vScrollbarWidth(): number { return this.getLayoutInfo().verticalScrollbarWidth }
    getScrollWidth(): number {
        this.syncView()
        return Math.max(this.getContentWidth(), this.getLayoutInfo().contentWidth)
    }
    getContentHeight(): number { return this.metrics.height }
    getContentWidth(): number {
        this.syncView()
        if (this.lineWrapping) return this.wrappedContentWidth()
        const cw = this.lineWidthMap.contentWidth()
        return cw > 0 ? cw + this.vScrollbarWidth() : cw
    }

    /** 一行折成的视觉行的起点(UTF-16 下标,第一项 0);估算,和渲染一致才可用(调用方比行数) */
    wrapStarts(text: string): number[] {
        this.syncView()
        const starts = [0]
        const col = this.wrapColumns()
        if (col > 0) wrapLayout(text, col, this.oracle.wrapIndent, starts)
        return starts
    }

    private wrapWidthCache: { doc: Rope, wi: unknown, start: number, n: number, col: number, cw: number, px: number } | null = null

    /**
     * 折行时的内容宽(Monaco viewLayout._computeContentWidth):渲染出来的视觉行里最宽那行的宽。
     * 固定列(wordWrapColumn)再加末列留白 + 竖条;视口折行只在最宽行超出内容区时才加竖条。
     * 等宽字体按列算(wrapLayout:和浏览器 break-spaces / Monaco 按列折同一个断点),不读 DOM。
     */
    private wrappedContentWidth(): number {
        const col = this.wrapColumns(), cw = this.oracle.charWidth
        if (!col || !cw) return 0
        const doc = this.state.doc
        const start = this.viewportStartLine
        const n = Math.min(this.contentDOM.children.length, doc.lines - start + 1)
        let c = this.wrapWidthCache
        if (!c || c.doc !== doc || c.start !== start || c.n !== n || c.col !== col || c.cw !== cw || c.wi !== this.oracle.wrapIndent) {
            let cols = 0
            for (let i = 0; i < n && i < 400; i++) {
                const line = doc.line(start + i)
                if (line.length * 2 <= cols) continue
                const w = line.length > 20000 ? col : wrapLayout(line.text, col, this.oracle.wrapIndent).width
                if (w > cols) cols = w
            }
            c = this.wrapWidthCache = { doc, wi: this.oracle.wrapIndent, start, n, col, cw, px: Math.ceil(cols * cw) }
        }
        if (this.wrapColumn > 0) return c.px + Math.floor(this.lineWidthMap.extraWidth) + this.vScrollbarWidth()
        return c.px > this.getLayoutInfo().contentWidth ? c.px + this.vScrollbarWidth() : c.px
    }

    setScrollTop(newScrollTop: number, scrollType: ScrollType = ScrollType.Immediate): void {
        this.syncView()
        if (typeof newScrollTop !== 'number') throw new Error('Invalid arguments')
        this.scrollToPosition(newScrollTop, undefined, scrollType)
    }

    setScrollLeft(newScrollLeft: number, scrollType: ScrollType = ScrollType.Immediate): void {
        this.syncView()
        if (typeof newScrollLeft !== 'number') throw new Error('Invalid arguments')
        this.scrollToPosition(undefined, newScrollLeft, scrollType)
    }

    setScrollPosition(position: { scrollTop?: number, scrollLeft?: number }, scrollType: ScrollType = ScrollType.Immediate): void {
        this.syncView()
        this.scrollToPosition(position.scrollTop, position.scrollLeft, scrollType)
    }

    /** 动画进行中的终点,没有动画就是当前位置(滚轮连续滚动在终点上累加) */
    private futureScroll(): { top: number, left: number } {
        return this.smooth ? { top: this.smooth.to.top, left: this.smooth.to.left } : { top: this.scrollDOM.scrollTop, left: this.scrollDOM.scrollLeft }
    }

    private scrollToPosition(top: number | undefined, left: number | undefined, type: ScrollType) {
        const sd = this.scrollDOM
        const h = sd.clientHeight || this.viewH()
        const maxTop = Math.max(0, this.metrics.height - h)
        const maxLeft = Math.max(0, this.lineWidthMap.contentWidth() - sd.clientWidth)
        const fut = this.futureScroll()
        const to = {
            top: top === undefined ? fut.top : Math.min(Math.max(0, top), maxTop),
            left: left === undefined ? fut.left : Math.min(Math.max(0, left), maxLeft),
        }
        // Smooth 只有 smoothScrolling 开着才动画(时长 125ms),否则等同 Immediate
        if (type !== ScrollType.Smooth || !this.opts.smoothScrolling) {
            this.cancelSmooth()
            if (top !== undefined) sd.scrollTop = to.top
            if (left !== undefined) sd.scrollLeft = to.left
            this.onScroll()
            return
        }
        const now = this.now()
        const from = { top: sd.scrollTop, left: sd.scrollLeft }
        if (from.top === to.top && from.left === to.left) { this.cancelSmooth(); return }
        this.smooth = new SmoothScrolling(from, to, { width: sd.clientWidth, height: h }, 125, now)
        this.smoothLast = null
        this.stepSmooth()
    }

    private now(): number {
        return this.dom.ownerDocument.defaultView?.performance?.now() ?? Date.now()
    }

    private stepSmooth() {
        const sm = this.smooth
        if (!sm || this.destroyed) return
        const r = sm.at(this.now())
        const sd = this.scrollDOM
        this.smoothLast = { top: r.top, left: r.left }
        sd.scrollTop = r.top
        sd.scrollLeft = r.left
        this.onScroll()
        if (r.done) { this.smooth = null; this.smoothRaf = 0; this.smoothLast = null; return }
        const win = this.dom.ownerDocument.defaultView
        if (!win) return
        this.smoothRaf = typeof win.requestAnimationFrame === 'function'
            ? win.requestAnimationFrame(() => this.stepSmooth())
            : win.setTimeout(() => this.stepSmooth(), 16)
    }

    private cancelSmooth() {
        if (this.smoothRaf) {
            const win = this.dom.ownerDocument.defaultView
            if (typeof win?.cancelAnimationFrame === 'function') win.cancelAnimationFrame(this.smoothRaf)
            win?.clearTimeout(this.smoothRaf)
        }
        this.smoothRaf = 0
        this.smooth = null
        this.smoothLast = null
    }

    private finishSmooth() {
        const sm = this.smooth
        if (!sm) return
        this.cancelSmooth()
        this.scrollDOM.scrollTop = sm.to.top
        this.scrollDOM.scrollLeft = sm.to.left
        this.onScroll()
    }

    // ---- 位置 → 坐标 ----
    // 位置所在视觉行的顶(折行时按光标落在第几个视觉行)
    private posTop(pos: number): number {
        const blk = this.lineBlockAt(pos)
        const lh = this.oracle.lineHeight
        if (!this.lineWrapping || !lh || blk.height <= lh * 1.5) return blk.top
        const c = this.caretCoords(pos)
        if (!c) return blk.top
        const row = Math.max(0, Math.min(Math.round(blk.height / lh) - 1, Math.round((c.top + c.height / 2 - this.contentDOM.getBoundingClientRect().top - blk.top - lh / 2) / lh)))
        return blk.top + row * lh
    }

    /** 行的顶(内容坐标)。includeViewZones:连上方的 view zone 一起算(Monaco 默认不含) */
    getTopForLineNumber(lineNumber: number, includeViewZones = false): number {
        this.syncView()
        const doc = this.state.doc
        const pos = doc.line(Math.min(Math.max(1, lineNumber), doc.lines)).from
        const b = this.heightMap.lineAt(pos, QueryType.ByPos, this.oracle, 0, 0)
        return this.scaler.toDOM(b.top) - (includeViewZones ? b.spaceAbove : 0)
    }

    /** 行的底(内容坐标,含折行后的全部视觉行)。includeViewZones:连下方的 view zone 一起算(Monaco getBottomForLineNumber) */
    getBottomForLineNumber(lineNumber: number, includeViewZones = false): number {
        this.syncView()
        const doc = this.state.doc
        const line = doc.line(Math.min(Math.max(1, lineNumber), doc.lines))
        const b = this.heightMap.lineAt(line.from, QueryType.ByPos, this.oracle, 0, 0)
        let bottom = this.scaler.toDOM(b.top + b.height)
        if (includeViewZones && line.number < doc.lines) {
            // 下一行上方的空白就是挂在本行之后的 zone
            bottom += this.heightMap.lineAt(doc.line(line.number + 1).from, QueryType.ByPos, this.oracle, 0, 0).spaceAbove
        }
        return bottom
    }

    getTopForPosition(lineNumber: number, column: number): number {
        this.syncView()
        return this.posTop(this.toPos({ lineNumber, column }))
    }

    // 位置的横坐标(相对正文左缘);没布局时按字宽估
    private xOfPos(pos: number): number | null {
        const c = this.caretCoords(pos)
        if (c) return Math.round(c.left - this.contentDOM.getBoundingClientRect().left)
        const r = this.contentDOM.getBoundingClientRect()
        if (r.width || r.height) return null // 有布局但位置不在渲染范围
        return this.textPadLeft + (pos - this.state.doc.lineAt(pos).from) * this.oracle.charWidth
    }

    /** 列的横向偏移(相对正文左缘);不在渲染范围内 -1 */
    getOffsetForColumn(lineNumber: number, column: number): number {
        this.syncView()
        return this.xOfPos(this.toPos({ lineNumber, column })) ?? -1
    }

    /** Monaco getLineHeightForPosition:该位置所在视觉行的行高;被折叠隐藏的行 0(Monaco 同) */
    getLineHeightForPosition(position: IPosition): number {
        this.syncView()
        const line = this.state.doc.lineAt(this.toPos(position))
        if (this.lineBlockAt(line.from).from < line.from) return 0 // 折叠块只有首行可见
        let rowH = this.oracle.lineHeight || this.fontInfo().lineHeight
        // lineHeight 装饰撑高的行取装饰的(多条取最大,同 heightmap);视口外的行没有装饰集,取默认行高
        for (const set of this.decos()) {
            set.between(line.from, line.from, (from, _to, value) => {
                if (from === line.from && value instanceof LineDecoration && value.spec.lineHeight && value.spec.lineHeight > rowH) rowH = value.spec.lineHeight
            })
        }
        return rowH
    }

    /** Monaco getScrolledVisiblePosition:位置相对编辑器左上角的 top / left(扣掉滚动,加上边距 + 行号 + 装饰栏宽)与行高 */
    getScrolledVisiblePosition(position: IPosition): { top: number, left: number, height: number } {
        this.syncView()
        const p = this.fromPos(this.toPos(position))
        const info = this.getLayoutInfo()
        const x = this.getOffsetForColumn(p.lineNumber, p.column)
        const line = this.state.doc.line(p.lineNumber).text
        // 不在渲染范围(视口外)取不到 DOM 坐标:按字宽估
        const left = (x >= 0 ? x : this.textPadLeft + countColumn(line, this.state.tabSize, p.column - 1) * this.oracle.charWidth)
            + info.glyphMarginWidth + info.lineNumbersWidth + info.decorationsWidth - this.getScrollLeft()
        return { top: this.getTopForPosition(p.lineNumber, p.column) - this.getScrollTop(), left, height: this.getLineHeightForPosition(p) }
    }

    /** Monaco getVisibleColumnFromPosition:tab 展开后的 1 起列号 */
    getVisibleColumnFromPosition(position: IPosition): number {
        this.syncView()
        const p = this.fromPos(this.toPos(position))
        return countColumn(this.state.doc.line(p.lineNumber).text, this.state.tabSize, p.column - 1) + 1
    }

    /** Monaco inComposition:IME 组字中 */
    get inComposition(): boolean { return this.composing }

    /**
     * Monaco setBanner:编辑器顶上预留 height 高的位置放 domNode(null = 撤掉)。
     * 实现:view.dom 顶部 padding 让出这块,banner 绝对定位在里面;outerSize 扣掉它,布局信息仍是编辑面自己的尺寸。
     */
    setBanner(bannerDomNode: HTMLElement | null, height: number): void {
        this.syncView()
        if (this.bannerNode) this.bannerNode.remove()
        this.bannerNode = bannerDomNode
        this.bannerHeight = bannerDomNode ? Math.max(0, height) : 0
        this.dom.style.paddingTop = this.bannerHeight ? `${this.bannerHeight}px` : ''
        if (bannerDomNode) {
            const s = bannerDomNode.style
            s.position = 'absolute'; s.top = '0'; s.left = '0'; s.right = '0'; s.height = `${this.bannerHeight}px`
            this.dom.prepend(bannerDomNode)
        }
        this.requestGeometryMeasure()
    }
    private bannerNode: HTMLElement | null = null
    private bannerHeight = 0

    /** Monaco hasPendingScrollAnimation:平滑滚动还没到终点 */
    hasPendingScrollAnimation(): boolean { return this.smooth !== null }

    /** Monaco applyFontInfo:把编辑器当前字体写成 target 的内联样式(用户做和编辑器同字体的自绘 DOM 用) */
    applyFontInfo(target: HTMLElement): void { applyFontStyle(target, this.fontInfo()) }

    /** Monaco render:立刻重量一次视口并重绘(平时由 rAF 合并调度) */
    render(_forceRedraw = false): void { if (!this.destroyed) this.remeasure() }

    /**
     * Monaco writeScreenReaderContent:Monaco 把选区周围文本抄进一个隐藏 textarea 给读屏器读;
     * 这里编辑面本身就是真实 contenteditable DOM(= 读屏器直接读的内容),没有要同步的第二份,所以没有可写的东西。
     */
    writeScreenReaderContent(_reason: string): void {}

    // ---- 可见范围 ----
    /**
     * 视口里**完整可见**的行区间(Monaco getVisibleRanges = getCompletelyVisibleViewRange:首行顶被卷掉一点就从下一行算,
     * 末行底露不全就退一行,只剩一行时不动);折叠隐藏的行把它拆成多段(列 1..行末)
     */
    getVisibleRanges(): Range[] {
        this.syncView()
        const sd = this.scrollDOM
        const h = sd.clientHeight || this.viewH()
        const doc = this.state.doc
        const top = sd.scrollTop
        const first = this.heightMap.lineAt(Math.max(0, top), QueryType.ByHeight, this.oracle, 0, 0)
        const last = this.heightMap.lineAt(Math.max(0, top + h - 1), QueryType.ByHeight, this.oracle, 0, 0)
        let from = first.from, to = last.to
        // 折行:按视觉行算(Monaco 的可见区是视觉行区间,折回模型位置:首行起列 = 第一个完整可见视觉行的起点,末行止列 = 最后一个视觉行的末尾)
        let startCol = 1, endCol = 0
        const lh = this.oracle.lineHeight
        if (this.lineWrapping && lh) {
            const rowsOf = (b: { from: number }) => this.wrapStarts(doc.lineAt(b.from).text)
            const topY = this.scaler.toDOM(first.top)
            const hidden = topY < top - 0.5 ? Math.ceil((top - topY - 0.5) / lh) : 0
            const fs = rowsOf(first)
            if (first.from < last.from || hidden > 0) {
                if (hidden >= fs.length) { if (first.from < last.from) from = this.heightMap.lineAt(first.to + 1, QueryType.ByPos, this.oracle, 0, 0).from }
                else if (hidden > 0 && fs.length === Math.round(first.height / lh)) startCol = fs[hidden] + 1
            }
            const lastY = this.scaler.toDOM(last.top)
            const shown = Math.floor((top + h + 0.5 - lastY) / lh)
            const ls = rowsOf(last)
            if (shown < ls.length && ls.length === Math.round(last.height / lh)) {
                if (shown <= 0) { if (from < last.from) to = this.heightMap.lineAt(last.from - 1, QueryType.ByPos, this.oracle, 0, 0).to }
                else endCol = ls[shown] + 1
            }
        } else {
            // 0.5px 容差:scrollTop 来自 DOM,带亚像素误差;Monaco 的 scrollTop 是整数
            if (first.from < last.from && this.scaler.toDOM(first.top) < top - 0.5) from = this.heightMap.lineAt(first.to + 1, QueryType.ByPos, this.oracle, 0, 0).from
            if (from < last.from && this.scaler.toDOM(last.bottom) > top + h + 0.5) to = this.heightMap.lineAt(last.from - 1, QueryType.ByPos, this.oracle, 0, 0).to
        }
        const out: Range[] = []
        // 一个 heightmap 块可以包着好几段隐藏行(两段隐藏区夹一行可见行时合成一块),所以按隐藏的整行段切,不按块切
        const hidden = hiddenLineRanges(this.state)
        const firstLine = doc.lineAt(from).number, lastLine = doc.lineAt(to).number
        const push = (a: number, b: number) => {
            const prev = out[out.length - 1]
            const bLen = doc.line(b).length + 1
            const eCol = b === lastLine && endCol > 0 ? Math.min(endCol, bLen) : bLen // 折行:末行只到最后一个完整可见的视觉行
            const sCol = a === firstLine ? Math.min(startCol, doc.line(a).length + 1) : 1 // 首行从第一个完整可见的视觉行起
            if (prev && prev.endLineNumber + 1 === a) out[out.length - 1] = new Range(prev.startLineNumber, prev.startColumn, b, eCol)
            else out.push(new Range(a, sCol, b, eCol))
        }
        this.heightMap.forEachLine(from, to, this.oracle, 0, 0, (b) => {
            let a = doc.lineAt(b.from).number
            const end = doc.lineAt(b.to).number
            for (const [hs, he] of hidden) {
                if (he < a || hs > end) continue
                if (hs > a) push(a, hs - 1)
                a = Math.max(a, he + 1)
            }
            if (a <= end) push(a, end)
        })
        return out
    }

    /**
     * Monaco getVisibleRangesPlusViewportAboveBelow:完整可见区上下各扩 max(20, 一屏行数) 行(语义着色按这块取局部 token);
     * 折叠隐藏的行同样把结果拆成多段
     */
    getVisibleRangesPlusViewportAboveBelow(): Range[] {
        this.syncView()
        const vis = this.getVisibleRanges()
        if (vis.length === 0) return []
        const doc = this.state.doc
        const lh = this.oracle.lineHeight || this.fontInfo().lineHeight || 14
        const linesAround = Math.max(20, Math.round((this.scrollDOM.clientHeight || this.viewH()) / lh))
        const startLine = Math.max(1, vis[0].startLineNumber - linesAround)
        const endLine = Math.min(doc.lines, vis[vis.length - 1].endLineNumber + linesAround)
        const out: Range[] = []
        this.heightMap.forEachLine(doc.line(startLine).from, doc.line(endLine).to, this.oracle, 0, 0, (b) => {
            const s = doc.lineAt(b.from)
            const prev = out[out.length - 1]
            const endL = doc.lineAt(b.to).number
            const seg = b.to > s.to ? s.number : endL
            const segLine = doc.line(seg)
            if (prev && prev.endLineNumber + 1 === s.number) out[out.length - 1] = new Range(prev.startLineNumber, prev.startColumn, seg, segLine.length + 1)
            else out.push(new Range(s.number, 1, seg, segLine.length + 1))
        })
        return out
    }

    // ---- reveal ----
    private revealBox(start: number, end: number, vt: VerticalRevealType, horizontal: boolean, type: ScrollType, minimal = false, source = 'api') {
        this.syncView()
        const sd = this.scrollDOM
        const lh = this.oracle.lineHeight || this.fontInfo().lineHeight
        const vh = sd.clientHeight || this.viewH()
        if (!vh || !lh) return
        const startY = this.posTop(start)
        const endY = this.posTop(end) + lh
        const nextTop = computeScrollTopToReveal({
            viewportTop: this.futureScroll().top, viewportHeight: vh, lineHeight: lh, boxStartY: startY, boxEndY: endY,
            boxIsSingleRange: true, surroundingLines: this.revealSurroundingLines, surroundingLinesStyle: this.opts.cursorSurroundingLinesStyle,
            source, minimalReveal: minimal, verticalType: vt,
        })
        let nextLeft: number | undefined
        if (horizontal && !this.lineWrapping && sd.clientWidth) {
            const doc = this.state.doc
            const sameLine = doc.lineAt(start).number === doc.lineAt(end).number
            const x0 = this.xOfPos(start)
            const x1 = sameLine ? this.xOfPos(end) : x0
            if (x0 != null && x1 != null) {
                let bs = Math.min(x0, x1), be = Math.max(x0, x1)
                if (!minimal) { bs = Math.max(0, bs - 30); be += this.opts.revealHorizontalRightPadding }
                const cur = this.futureScroll().left
                const next = computeMinimumScrolling(cur, cur + sd.clientWidth, bs, be)
                if (next !== cur) {
                    // 要滚到的位置得在 scrollWidth 里(Monaco _ensureMaxLineWidth)
                    this.lineWidthMap.ensureMaxLineWidth(be)
                    nextLeft = next
                }
            }
        }
        this.scrollToPosition(nextTop >= 0 ? Math.max(0, nextTop) : undefined, nextLeft, type)
    }

    private lineStart(n: number): number {
        const doc = this.state.doc
        return doc.line(Math.min(Math.max(1, Math.floor(n)), doc.lines)).from
    }

    revealLine(lineNumber: number, scrollType = ScrollType.Smooth): void { this.revealLinesImpl(lineNumber, lineNumber, VerticalRevealType.Simple, scrollType) }
    revealLineInCenter(lineNumber: number, scrollType = ScrollType.Smooth): void { this.revealLinesImpl(lineNumber, lineNumber, VerticalRevealType.Center, scrollType) }
    revealLineInCenterIfOutsideViewport(lineNumber: number, scrollType = ScrollType.Smooth): void { this.revealLinesImpl(lineNumber, lineNumber, VerticalRevealType.CenterIfOutsideViewport, scrollType) }
    revealLineNearTop(lineNumber: number, scrollType = ScrollType.Smooth): void { this.revealLinesImpl(lineNumber, lineNumber, VerticalRevealType.NearTop, scrollType) }
    revealLines(a: number, b: number, scrollType = ScrollType.Smooth): void { this.revealLinesImpl(a, b, VerticalRevealType.Simple, scrollType) }
    revealLinesInCenter(a: number, b: number, scrollType = ScrollType.Smooth): void { this.revealLinesImpl(a, b, VerticalRevealType.Center, scrollType) }
    revealLinesInCenterIfOutsideViewport(a: number, b: number, scrollType = ScrollType.Smooth): void { this.revealLinesImpl(a, b, VerticalRevealType.CenterIfOutsideViewport, scrollType) }
    revealLinesNearTop(a: number, b: number, scrollType = ScrollType.Smooth): void { this.revealLinesImpl(a, b, VerticalRevealType.NearTop, scrollType) }
    private revealLinesImpl(a: number, b: number, vt: VerticalRevealType, t: ScrollType) {
        if (typeof a !== 'number' || typeof b !== 'number') throw new Error('Invalid arguments')
        this.revealBox(this.lineStart(a), this.lineStart(b), vt, false, t)
    }

    revealPosition(position: IPosition, scrollType = ScrollType.Smooth): void { this.revealPositionImpl(position, VerticalRevealType.Simple, scrollType) }
    revealPositionInCenter(position: IPosition, scrollType = ScrollType.Smooth): void { this.revealPositionImpl(position, VerticalRevealType.Center, scrollType) }
    revealPositionInCenterIfOutsideViewport(position: IPosition, scrollType = ScrollType.Smooth): void { this.revealPositionImpl(position, VerticalRevealType.CenterIfOutsideViewport, scrollType) }
    revealPositionNearTop(position: IPosition, scrollType = ScrollType.Smooth): void { this.revealPositionImpl(position, VerticalRevealType.NearTop, scrollType) }
    private revealPositionImpl(position: IPosition, vt: VerticalRevealType, t: ScrollType) {
        if (!position || typeof position.lineNumber !== 'number' || typeof position.column !== 'number') throw new Error('Invalid arguments')
        const p = this.toPos(position)
        this.revealBox(p, p, vt, true, t)
    }

    revealRange(range: IRange, scrollType = ScrollType.Smooth, revealVerticalInCenter = false, revealHorizontal = true): void {
        this.syncView()
        this.revealRangeImpl(range, revealVerticalInCenter ? VerticalRevealType.Center : VerticalRevealType.Simple, revealHorizontal, scrollType)
    }

    revealRangeInCenter(range: IRange, scrollType = ScrollType.Smooth): void { this.revealRangeImpl(range, VerticalRevealType.Center, true, scrollType) }
    revealRangeInCenterIfOutsideViewport(range: IRange, scrollType = ScrollType.Smooth): void { this.revealRangeImpl(range, VerticalRevealType.CenterIfOutsideViewport, true, scrollType) }
    revealRangeNearTop(range: IRange, scrollType = ScrollType.Smooth): void { this.revealRangeImpl(range, VerticalRevealType.NearTop, true, scrollType) }
    revealRangeNearTopIfOutsideViewport(range: IRange, scrollType = ScrollType.Smooth): void { this.revealRangeImpl(range, VerticalRevealType.NearTopIfOutsideViewport, true, scrollType) }
    revealRangeAtTop(range: IRange, scrollType = ScrollType.Smooth): void { this.revealRangeImpl(range, VerticalRevealType.Top, true, scrollType) }
    private revealRangeImpl(range: IRange, vt: VerticalRevealType, horizontal: boolean, t: ScrollType) {
        if (!range || typeof range.startLineNumber !== 'number') throw new Error('Invalid arguments')
        this.revealBox(this.toPos({ lineNumber: range.startLineNumber, column: range.startColumn }), this.toPos({ lineNumber: range.endLineNumber, column: range.endColumn }), vt, horizontal, t)
    }

    // ---- 鼠标命中 ----
    /** 屏上坐标 → Monaco IMouseTarget(区域按 DOM 外框几何分,位置走 posAtCoords) */
    getTargetAtClientPoint(clientX: number, clientY: number): IMouseTarget | null {
        this.syncView()
        const inside = (el: Element | null | undefined) => {
            if (!el) return false
            const r = el.getBoundingClientRect()
            return (r.width > 0 || r.height > 0) && clientX >= r.left && clientX < r.right && clientY >= r.top && clientY < r.bottom
        }
        const make = (type: MouseTargetType, element: Element | null, position: Position | null, detail: unknown = null, mouseColumn = position?.column ?? 0): IMouseTarget => ({
            element: element as HTMLElement | null, type, position, mouseColumn,
            range: position ? new Range(position.lineNumber, position.column, position.lineNumber, position.column) : null,
            detail,
        }) as IMouseTarget
        if (!inside(this.dom)) {
            const r = this.dom.getBoundingClientRect()
            const outsidePosition = clientY < r.top ? 'above' : clientY >= r.bottom ? 'below' : clientX < r.left ? 'left' : 'right'
            const outsideDistance = outsidePosition === 'above' ? r.top - clientY : outsidePosition === 'below' ? clientY - r.bottom + 1 : outsidePosition === 'left' ? r.left - clientX : clientX - r.right + 1
            return { ...make(MouseTargetType.OUTSIDE_EDITOR, null, null), outsidePosition, outsideDistance } as IMouseTarget
        }
        // view zone(正文里 / 行号栏里)
        for (const rec of this.viewZoneRecords.values()) {
            const zdetail = (): IMouseTargetViewZoneData => {
                const position = this.fromPos(this.zonePos(rec.id))
                const afterLineNumber = this.zoneAfterLine(rec.id)
                const doc = this.state.doc
                return {
                    viewZoneId: rec.id, position, afterLineNumber,
                    positionBefore: afterLineNumber >= 1 ? new Position(afterLineNumber, doc.line(afterLineNumber).length + 1) : null,
                    positionAfter: afterLineNumber < doc.lines ? new Position(afterLineNumber + 1, 1) : null,
                }
            }
            if (inside(rec.node)) return make(MouseTargetType.CONTENT_VIEW_ZONE, rec.zone.domNode, this.fromPos(this.zonePos(rec.id)), zdetail())
            if (rec.margin && inside(rec.margin)) return make(MouseTargetType.GUTTER_VIEW_ZONE, rec.margin, this.fromPos(this.zonePos(rec.id)), zdetail())
        }
        const hit = (sel: string) => Array.from(this.dom.querySelectorAll(sel)).find(inside) ?? null
        const bar = hit('.cm-scrollbar, .cm-hscrollbar, .cm-minimap')
        if (bar) return make(MouseTargetType.SCROLLBAR, bar, this.fromPos(this.posAtCoords({ x: clientX, y: clientY }) ?? 0))
        const ruler = hit('.cm-overviewRuler')
        if (ruler) return make(MouseTargetType.OVERVIEW_RULER, ruler, null)
        const cw = hit('.cm-contentWidget')
        if (cw) return make(MouseTargetType.CONTENT_WIDGET, cw, null, cw.getAttribute('widgetid') ?? '')
        const ow = hit('.cm-overlayWidget, .cm-overflowWidgets > *')
        if (ow) return make(MouseTargetType.OVERLAY_WIDGET, ow, null, ow.getAttribute('widgetid') ?? '')

        const doc = this.state.doc
        const sr = this.scrollDOM.getBoundingClientRect()
        const docY = clientY - sr.top + this.scrollDOM.scrollTop
        const lineAtY = () => {
            const b = this.heightMap.lineAt(Math.max(0, Math.min(docY, this.heightMap.height - 1)), QueryType.ByHeight, this.oracle, 0, 0)
            return doc.lineAt(b.from).number
        }
        const afterLines = docY >= this.heightMap.height
        // 行号栏
        if (this.guttersClip && inside(this.guttersClip)) {
            const gx = clientX - this.guttersClip.getBoundingClientRect().left
            const g = this.gutterMetrics()
            const n = afterLines ? doc.lines : lineAtY()
            const pos = new Position(n, 1)
            const detail: IMouseTargetMarginData = { isAfterLines: afterLines, glyphMarginLeft: 0, glyphMarginWidth: g.glyphW, lineNumbersWidth: g.numW, offsetX: gx }
            if (gx < g.glyphW) return make(MouseTargetType.GUTTER_GLYPH_MARGIN, this.guttersClip, pos, { ...detail, glyphMarginLane: 1 })
            if (gx < g.glyphW + g.numW) return make(MouseTargetType.GUTTER_LINE_NUMBERS, this.guttersClip, pos, detail)
            return make(MouseTargetType.GUTTER_LINE_DECORATIONS, this.guttersClip, pos, detail)
        }
        // 正文
        const raw = this.posAtCoords({ x: clientX, y: clientY })
        if (raw == null) return make(MouseTargetType.UNKNOWN, this.contentDOM, null)
        const pos = afterLines ? doc.length : raw
        const p = this.fromPos(pos)
        if (afterLines) return make(MouseTargetType.CONTENT_EMPTY, this.contentDOM, p, { isAfterLines: true })
        const line = doc.lineAt(pos)
        const endX = this.xOfPos(line.to)
        const cl = this.contentDOM.getBoundingClientRect().left
        const localX = clientX - cl
        if (endX != null && localX > endX + 1 && pos === line.to) {
            const dist = localX - endX
            const typical = this.typicalCharWidth() || 1
            return make(MouseTargetType.CONTENT_EMPTY, this.contentDOM, p, { isAfterLines: false, horizontalDistanceToText: dist }, p.column + Math.floor(dist / typical))
        }
        return make(MouseTargetType.CONTENT_TEXT, this.contentDOM, p, { mightBeForeignElement: false })
    }

    // ---- view zone(Monaco changeViewZones,建在 setViewZones 的 zone 机制上)----
    private zonePos(id: string): number {
        let pos = 0
        this.zones.between(0, this.state.doc.length, (from, _t, d) => { if ((d.widget as ZoneWidget).id === VZ_PREFIX + id) pos = from })
        return pos
    }

    private zoneAfterLine(id: string): number {
        const doc = this.state.doc
        let side = -1, pos = 0, found = false
        this.zones.between(0, doc.length, (from, _t, d) => {
            if ((d.widget as ZoneWidget).id === VZ_PREFIX + id) { pos = from; side = d.startSide; found = true }
        })
        if (!found) return 0
        return side > 0 ? doc.lines : doc.lineAt(pos).number - 1
    }

    private zoneHeightOf(z: IViewZone): number {
        if (typeof z.heightInPx === 'number') return Math.max(0, z.heightInPx)
        return Math.max(0, (typeof z.heightInLines === 'number' ? z.heightInLines : 1) * (this.oracle.lineHeight || this.fontInfo().lineHeight))
    }

    /**
     * Monaco changeViewZones:在回调里增 / 删 / 重排 view zone,回调结束一次性生效。
     * zone 在行 afterLineNumber 下方留 heightInLines / heightInPx 的空白,domNode 放进空白里。
     * afterColumn(折行中间插)不支持,按整行处理。
     */
    changeViewZones(callback: (accessor: IViewZoneChangeAccessor) => void): void {
        this.syncView()
        const batch = new Map<string, { id: string, zone: { afterLine: number, height: number } | null }>()
        let live = true
        const accessor: IViewZoneChangeAccessor = {
            addZone: (zone) => {
                if (!live) throw new Error('accessor is no longer valid')
                const id = String(++this.viewZoneSeq)
                const node = this.dom.ownerDocument.createElement('div')
                node.className = 'cm-viewZone'
                node.style.cssText = 'position:absolute;left:0;width:100%;pointer-events:auto;overflow:visible'
                // Monaco 给 zone 的 domNode 设 position:absolute / width:100% / height(= zone 高):domNode 自己的盒子就是 zone 占的那块空白
                zone.domNode.style.position = 'absolute'
                zone.domNode.style.top = '0'
                zone.domNode.style.width = '100%'
                zone.domNode.style.height = `${this.zoneHeightOf(zone)}px`
                node.appendChild(zone.domNode)
                let margin: HTMLElement | null = null
                if (zone.marginDomNode) {
                    margin = this.dom.ownerDocument.createElement('div')
                    margin.className = 'cm-viewZoneMargin'
                    margin.style.cssText = 'position:absolute;left:0;width:100%;pointer-events:auto;overflow:hidden'
                    margin.appendChild(zone.marginDomNode)
                }
                node.addEventListener('mousedown', (e) => {
                    if (zone.suppressMouseDown) e.stopPropagation()
                    else this.focus()
                })
                const rec: ViewZoneRecord = { id, zone, height: this.zoneHeightOf(zone), node, margin, lastTop: NaN, lastHeight: NaN }
                this.viewZoneRecords.set(id, rec)
                batch.set(id, { id: VZ_PREFIX + id, zone: { afterLine: zone.afterLineNumber, height: rec.height } })
                return id
            },
            removeZone: (id) => {
                const rec = this.viewZoneRecords.get(id)
                if (!live || !rec) return
                this.viewZoneRecords.delete(id)
                rec.node.remove()
                rec.margin?.remove()
                batch.set(id, { id: VZ_PREFIX + id, zone: null })
            },
            layoutZone: (id) => {
                const rec = this.viewZoneRecords.get(id)
                if (!live || !rec) return
                rec.height = this.zoneHeightOf(rec.zone)
                const prev = batch.get(id)
                batch.set(id, { id: VZ_PREFIX + id, zone: { afterLine: prev?.zone?.afterLine ?? (this.zoneAfterLine(id) || rec.zone.afterLineNumber), height: rec.height } })
            },
        }
        try { callback(accessor) }
        finally {
            live = false
            if (batch.size) this.setViewZones([...batch.values()])
        }
    }

    // zone 节点和 margin 节点的位置:按 zones 装饰里的位置 + 同一位置前面 zone 的累计高度
    private layoutZoneNodes() {
        if (!this.viewZoneRecords.size || this.destroyed) return
        const doc = this.state.doc
        const win = this.dom.ownerDocument
        if (!this.zoneLayer) {
            this.zoneLayer = win.createElement('div')
            this.zoneLayer.className = 'cm-viewZones'
            this.zoneLayer.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:0;pointer-events:none;z-index:1'
        }
        if (this.zoneLayer.parentNode !== this.scrollDOM) this.scrollDOM.appendChild(this.zoneLayer)
        if (this.guttersClip) {
            if (!this.marginLayer) {
                this.marginLayer = win.createElement('div')
                this.marginLayer.className = 'cm-viewZones-margin'
                this.marginLayer.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:0;pointer-events:none;z-index:1'
            }
            if (this.marginLayer.parentNode !== this.guttersClip) this.guttersClip.appendChild(this.marginLayer)
            this.marginLayer.style.transform = `translateY(${-this.scrollDOM.scrollTop}px)`
        }
        const acc = new Map<string, number>()
        const seen = new Set<string>()
        this.zones.between(0, doc.length, (from, _t, d) => {
            const w = d.widget as ZoneWidget
            const side = d.startSide > 0 ? 1 : -1
            const key = `${from}:${side}`
            const base = side > 0 ? this.heightMap.height : (() => { const b = this.heightMap.lineAt(from, QueryType.ByPos, this.oracle, 0, 0); return b.top - b.spaceAbove })()
            const off = acc.get(key) ?? (side < 0 && from === 0 ? this.zoneStartPad() : 0)
            acc.set(key, off + w.height)
            if (!w.id.startsWith(VZ_PREFIX)) return
            const rec = this.viewZoneRecords.get(w.id.slice(VZ_PREFIX.length))
            if (!rec) return
            seen.add(rec.id)
            const top = base + off
            const rel = (n: HTMLElement | null, layer: HTMLElement | null) => {
                if (!n || !layer) return
                n.style.top = `${top}px`
                n.style.height = `${w.height}px`
                if (n.parentNode !== layer) layer.appendChild(n)
            }
            rel(rec.node, this.zoneLayer)
            rel(rec.margin, this.marginLayer)
            rec.zone.domNode.style.height = `${w.height}px`
            if (rec.zone.minWidthInPx) rec.node.style.minWidth = `${rec.zone.minWidthInPx}px`
            if (rec.height !== w.height) rec.height = w.height
            if (rec.lastHeight !== w.height) { rec.lastHeight = w.height; rec.zone.onComputedHeight?.(w.height) }
            const vtop = top - this.scrollDOM.scrollTop
            if (rec.lastTop !== vtop) { rec.lastTop = vtop; rec.zone.onDomNodeTop?.(vtop) }
        })
        for (const rec of this.viewZoneRecords.values()) {
            if (seen.has(rec.id)) continue
            rec.node.remove() // 高度 0 的 zone:不占位,也不画
            rec.margin?.remove()
        }
    }

    // 首行上方 zone 的起点 = padding.top(它自己是第一个 zone,不在 viewZoneRecords 里,累计时要先算上)
    private zoneStartPad(): number {
        let h = 0
        this.zones.between(0, 0, (_f, _t, d) => { if (d.startSide < 0 && (d.widget as ZoneWidget).id === PADDING_ZONE_ID) h = (d.widget as ZoneWidget).height })
        return h
    }

    // ---- 事件 ----
    // 事务 → Monaco 的光标变化原因 / 来源(update() 一开始就算,自绘光标的 explicit 动画要用)
    private cursorMetaOf(tr: Transaction): { reason: CursorChangeReason, source: string } {
        const meta = this.apiCursorMeta
        if (meta) return meta
        if (tr.isUserEvent('undo')) return { reason: CursorChangeReason.Undo, source: 'undo' }
        if (tr.isUserEvent('redo')) return { reason: CursorChangeReason.Redo, source: 'redo' }
        if (tr.isUserEvent('input.paste')) return { reason: CursorChangeReason.Paste, source: 'keyboard' }
        if (tr.isUserEvent('select.pointer')) return { reason: CursorChangeReason.Explicit, source: 'mouse' }
        if (tr.isUserEvent('select')) return { reason: CursorChangeReason.Explicit, source: 'keyboard' }
        if (tr.isUserEvent('input') || tr.isUserEvent('delete') || tr.isUserEvent('move')) return { reason: CursorChangeReason.NotSet, source: 'keyboard' }
        return { reason: CursorChangeReason.NotSet, source: 'modelChange' }
    }

    private emitCursorEvents(meta: { reason: CursorChangeReason, source: string }, oldVersion: number) {
        const sel = this.state.selection
        const prevSnap = this.lastSelectionSnapshot
        const snap = sel.ranges.map(r => this.toSelection(r.anchor, r.head))
        const same = prevSnap.length === snap.length && snap.every((s, i) => sameSel(s, prevSnap[i]))
        if (same) return
        const { reason, source } = meta
        this.lastSelectionSnapshot = snap
        const mi = sel.mainIndex
        const posOf = (s: Selection): Position => s.getPosition()
        const others = <T,>(list: T[]) => list.filter((_, i) => i !== mi)
        const posChanged = !prevSnap.length || prevSnap.length !== snap.length
            || prevSnap.some((s, i) => s.positionLineNumber !== snap[i].positionLineNumber || s.positionColumn !== snap[i].positionColumn)
        if (posChanged && this.cursorPositionEmitter.hasListeners)
            this.cursorPositionEmitter.fire({ position: posOf(snap[mi]), secondaryPositions: others(snap.map(posOf)), reason, source })
        if (this.cursorSelectionEmitter.hasListeners)
            this.cursorSelectionEmitter.fire({
                selection: snap[mi], secondarySelections: others(snap), modelVersionId: this.docVersion,
                oldSelections: prevSnap.length ? prevSnap : null, oldModelVersionId: oldVersion, source, reason,
            })
    }

    /** scroll / contentSize / layout 三类事件:对比快照,有变化才发(快照始终更新,晚挂的监听不会收到旧变化) */
    private flushViewEvents(checkLayout = false) {
        if (this.flushingEvents || this.destroyed) return
        this.flushingEvents = true
        try {
            const sd = this.scrollDOM
            const m = this.metrics
            const cur = { top: sd.scrollTop, left: sd.scrollLeft, width: Math.max(sd.scrollWidth, this.lineWidthMap.contentWidth()), height: m.height }
            const l = this.lastScrollEvt
            if (l.top !== cur.top || l.left !== cur.left || l.width !== cur.width || l.height !== cur.height) {
                this.lastScrollEvt = cur
                if (l.top >= 0 && this.scrollEmitter.hasListeners)
                    this.scrollEmitter.fire({
                        scrollTop: cur.top, scrollLeft: cur.left, scrollWidth: cur.width, scrollHeight: cur.height,
                        scrollTopChanged: l.top !== cur.top, scrollLeftChanged: l.left !== cur.left,
                        scrollWidthChanged: l.width !== cur.width, scrollHeightChanged: l.height !== cur.height,
                    })
            }
            const c = this.lastContentEvt
            const cw = m.contentWidth
            if (c.width !== cw || c.height !== m.height) {
                this.lastContentEvt = { width: cw, height: m.height }
                if (c.width >= 0 && this.contentSizeEmitter.hasListeners)
                    this.contentSizeEmitter.fire({ contentWidth: cw, contentHeight: m.height, contentWidthChanged: c.width !== cw, contentHeightChanged: c.height !== m.height })
            }
            if (checkLayout) {
                const info = this.getLayoutInfo()
                const key = JSON.stringify(info)
                if (key !== this.lastLayoutKey) {
                    const first = !this.lastLayoutKey
                    this.lastLayoutKey = key
                    if (!first && this.layoutEmitter.hasListeners) this.layoutEmitter.fire(info)
                }
            }
        } finally { this.flushingEvents = false }
    }

    // ---- 滚轮 ----
    private onWheel(e: WheelEvent) {
        const o = this.opts
        if (o.mouseWheelZoom && this.wheelZoom(e)) return
        handleWheel(this.dom, this.scrollDOM, e, undefined, {
            sensitivity: o.mouseWheelScrollSensitivity,
            fastSensitivity: o.fastScrollSensitivity,
            predominantAxis: o.scrollPredominantAxis,
            ...(o.smoothScrolling ? {
                scrollTo: (top: number, left: number) => this.scrollToPosition(top, left, ScrollType.Smooth),
                futurePosition: () => this.futureScroll(),
            } : {}),
        })
    }

    // Monaco mouseWheelZoom:⌘/Ctrl + 滚轮改 EditorZoom。物理滚轮一格 ±1,触控板按 50ms 内的手势累加(÷5)
    private wheelZoom(e: WheelEvent): boolean {
        const mac = keyOS === 'mac'
        const mod = (mac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey) && !e.altKey && !e.shiftKey
        const std = -e.deltaY / (e.deltaMode === 1 ? 1 : 40) // StandardWheelEvent.deltaY:往上滚为正
        const physical = e.deltaMode === 1 || (Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 50)
        if (physical) {
            if (!mod) return false
            EditorZoom.setZoomLevel(EditorZoom.getZoomLevel() + (std > 0 ? 1 : -1))
        } else {
            const t = Date.now()
            if (t - this.zoomGestureTime > 50) {
                this.zoomGestureStart = EditorZoom.getZoomLevel()
                this.zoomGestureModifier = mod
                this.zoomGestureDelta = 0
            }
            this.zoomGestureTime = t
            this.zoomGestureDelta += std
            if (!this.zoomGestureModifier) return false
            EditorZoom.setZoomLevel(this.zoomGestureStart + this.zoomGestureDelta / 5)
        }
        e.preventDefault()
        e.stopPropagation()
        return true
    }

    /**
     * 跑 fn 期间让 view.state 带着 sel(文档仍是新的)。对齐 Monaco:光标命令执行编辑时模型内容事件先发,
     * 此刻光标还没跟上(stopTrackingSelections),监听器读到的是旧选区。fn 里若又发了事务(嵌套打字),
     * 结果态以嵌套的为准;否则复原成真实态。
     */
    withStaleSelection(sel: EditorSelection, fn: () => void): void {
        const real = this.state
        const fake = real.withSelection(sel)
        this.state = fake
        try { fn() } finally { if (this.state === fake) this.state = real }
    }

    onTransaction(fn: (tr: Transaction, view: EditorView) => void): () => void {
        this.transactionListeners.push(fn)
        return () => {
            const i = this.transactionListeners.indexOf(fn)
            if (i >= 0) this.transactionListeners.splice(i, 1)
        }
    }

    /**
     * 视图按这笔事务画完之后调(DOM、heightMap、视口都已是新的)。和 onTransaction 的区别:deferView 里的多笔事务
     * 合成一笔、一帧只调一次;所以只适合「按视图画东西」的监听(读几何、画 overlay),不适合要逐笔看事务的逻辑。
     * 合成的事务:startState = 合并前的 state,changes 依次 compose,selection = 末态(有选区变化时),没有 effects / 注解。
     */
    onViewUpdate(fn: (tr: Transaction, view: EditorView) => void): () => void {
        this.frameListeners.push(fn)
        return () => {
            const i = this.frameListeners.indexOf(fn)
            if (i >= 0) this.frameListeners.splice(i, 1)
        }
    }

    /** 一笔事务的内容事件、光标事件都发完之后(最外层事务)才调:Monaco onDidType 的时点 */
    onTransactionSettled(fn: (tr: Transaction, view: EditorView) => void): () => void {
        this.settledListeners.push(fn)
        return () => {
            const i = this.settledListeners.indexOf(fn)
            if (i >= 0) this.settledListeners.splice(i, 1)
        }
    }

    onGeometry(fn: () => void): () => void {
        this.geometryListeners.push(fn)
        return () => {
            const i = this.geometryListeners.indexOf(fn)
            if (i >= 0) this.geometryListeners.splice(i, 1)
        }
    }

    // 销毁钩子:destroy() 最先调(此时 DOM 和 state 都还在),返回退订。
    /** destroy() 一开始就置位:销毁过程中跑的监听者据此跳过还以为编辑器活着的动作 */
    get isDestroyed(): boolean { return this.destroyed }

    onDestroy(fn: () => void): () => void {
        this.destroyListeners.push(fn)
        return () => {
            const i = this.destroyListeners.indexOf(fn)
            if (i >= 0) this.destroyListeners.splice(i, 1)
        }
    }

    introspect(): {
        state: ReturnType<EditorState['snapshot']>
        decorations: { ranges: { from: number, to: number, class?: string }[] }[]
        domLines: { text: string, marks: { class?: string }[] }[]
        heightmap: unknown
        linewidth: { maxLineWidth: number, contentWidth: number, extraWidth: number, cached: number }
        viewport: { from: number, to: number, startLine: number }
    } {
        this.syncView()
        const decos = this.decos()
        return {
            state: this.state.snapshot(),
            decorations: decos.map(ds => {
                const ranges: { from: number, to: number, class?: string }[] = []
                ds.between(0, this.state.doc.length, (from, to, value) => {
                    if (value instanceof MarkDecoration)
                        ranges.push({ from, to, class: value.attrs.class })
                })
                return { ranges }
            }),
            domLines: Array.from(this.contentDOM.children).map(lineEl => {
                const el = lineEl as HTMLElement
                const marks: { class?: string }[] = []
                for (const span of Array.from(el.querySelectorAll('span'))) {
                    const cls = span.className || undefined
                    if (cls) marks.push({ class: cls })
                }
                return { text: el.textContent ?? '', marks }
            }),
            heightmap: this.heightMap.toJSON(),
            linewidth: this.lineWidthMap.toJSON(),
            viewport: { from: this.viewport.from, to: this.viewport.to, startLine: this.viewportStartLine },
        }
    }

    destroy() {
        if (this.destroyed) return
        this.destroyed = true
        for (const fn of this.destroyListeners.splice(0)) fn()
        let overlayError: unknown
        let overlayFailed = false
        try { this.disposeOverlays() }
        catch (e) { overlayFailed = true; overlayError = e }
        this.disposeReadOnlyMessage?.()
        this.inputState.destroy()
        this.observer?.destroy()
        this._resizeObserver?.disconnect()
        this.disposeFonts?.()
        this.disposeTokens?.()
        releaseTokenCache(this)
        this.disposeZoom?.()
        this.disposeInputMode?.()
        this.cancelSmooth()
        for (const e of [this.scrollEmitter, this.layoutEmitter, this.contentSizeEmitter, this.cursorPositionEmitter, this.cursorSelectionEmitter, this.beginUpdateEmitter, this.endUpdateEmitter]) e.dispose()
        this.zoneLayer?.remove()
        this.marginLayer?.remove()
        if (this.tokenRepaint) this.dom.ownerDocument.defaultView?.clearTimeout(this.tokenRepaint)
        if (this.geometryTimer) this.dom.ownerDocument.defaultView?.clearTimeout(this.geometryTimer)
        this.geometryTimer = 0
        this.dom.remove()
        disposeLineIndex(this.contentDOM)
        if (overlayFailed) throw overlayError
    }

    // §5:iOS 延迟键落定
    flushIOSKey(change?: { from: number, to: number, insert: string }): boolean {
        const key = this.inputState.pendingIOSKey
        if (!key) return false
        const keyName = 'key' in key ? key.key : (key as KeyboardEvent).key
        const keyCode = 'keyCode' in key ? key.keyCode : (key as KeyboardEvent).keyCode
        if (keyName === 'Enter' && change && change.from < change.to && /^\S+$/.test(change.insert))
            return false
        this.inputState.pendingIOSKey = null
        const ev = new KeyboardEvent('keydown', {
            key: keyName, keyCode, bubbles: true, cancelable: true,
        })
        ;(ev as KeyboardEvent & { synthetic?: boolean }).synthetic = true
        this.contentDOM.dispatchEvent(ev)
        return true
    }
}

// 量一行文字末尾离 contentDOM 左缘多远(不受 block 被父 min-width 撑开影响):Range 圈行内全部 inline 子节点量宽,
// 加行左 padding(探针量好的 textPadLeft,不逐行 getComputedStyle)。右 padding 不算:Monaco maxLineWidth 就是
// 内层 span 的 offsetWidth,行尾留白只有 scrollBeyondLastColumn。
// jsdom 无布局 → 返回 0（纯逻辑核走 measureLineFast）。
function contentInlineWidth(el: HTMLElement, root: Document, padLeft: number): number {
    const r = scratchRange(root)
    r.selectNodeContents(el)
    if (typeof r.getBoundingClientRect !== 'function') return 0
    const rect = r.getBoundingClientRect()
    if (!rect.width) return 0
    return Math.ceil(rect.width + padLeft)
}

function sameList<T>(a: readonly T[], b: readonly T[]): boolean {
    return a === b || (a.length === b.length && a.every((x, i) => x === b[i]))
}

// 视图选项的 Monaco 默认值:appliedOpts 的初值,applyViewOptions 只处理和它不同的项
const DEFAULT_OPTIONS: ComputedEditorOptions = resolveEditorOptions({})
const PADDING_ZONE_ID = '\u0000padding-top'
const VZ_PREFIX = 'vz:'
// computed.fontInfo → 它烤进去的 EditorZoom 级别(getResolveEnv().measureFont 登记)。视图的有效字号 = 烤好的 × 当前级别 / 烤时级别
const bakedZoomOf = new WeakMap<object, number>()
const fontSig = (f: BareFontInfo) =>
    [f.fontFamily, f.fontWeight, f.fontSize, f.fontFeatureSettings, f.fontVariationSettings, f.lineHeight, f.letterSpacing].join('|')
const deepEqual = (a: unknown, b: unknown): boolean => {
    if (a === b) return true
    if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false
    const ka = Object.keys(a), kb = Object.keys(b)
    return ka.length === kb.length && ka.every(k => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
}

const sameSel = (a: ISelectionResult, b: ISelectionResult) =>
    a.selectionStartLineNumber === b.selectionStartLineNumber && a.selectionStartColumn === b.selectionStartColumn
    && a.positionLineNumber === b.positionLineNumber && a.positionColumn === b.positionColumn

interface GutterMetrics { numW: number, decoW: number, markerW: number, glyphW: number }
interface ViewZoneRecord {
    id: string
    zone: IViewZone
    height: number
    node: HTMLElement
    margin: HTMLElement | null
    lastTop: number
    lastHeight: number
}
// 无布局(隐藏 / jsdom)时最多物化的行数。
/**
 * 把 old 就地改成和 fresh 一样:同标签同属性的元素递归比子节点,文本节点只改 data,不一样到没法就地改时返回 false(调用方整个换掉)。
 * 浏览器对「改一个文本节点的 data」只重排那一小段,「换掉一个 span」却要重建整行的 inline items:
 * 53 万字符一行(1045 个 span)实测 13.6 ms vs 0.4 ms。
 */
interface Slot { el: Element | null, texts: Text[], str: string }
// 子节点按「一个元素 / 一段连续文本节点」切成槽位:文本被切成 512 字符一段,在行里插一个字符,
// 后面每一段的边界都跟着挪一位;只看拼起来的文字,边界挪了不算不一样
function slotsOf(nodes: NodeListOf<ChildNode>): Slot[] {
    const out: Slot[] = []
    const addText = (t: Text) => {
        const last = out[out.length - 1]
        if (last && !last.el) { last.texts.push(t); last.str += t.data }
        else out.push({ el: null, texts: [t], str: t.data })
    }
    for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i]
        if (n.nodeType === 3) addText(n as Text)
        else if (n.nodeType === 1) {
            // 切段文本隔一个包的壳对补丁是透明的:里面只有文本,当作文本槽的一部分
            const el = n as Element
            if (el.className === CHUNK_CLASS && el.childNodes.length === 1 && el.firstChild!.nodeType === 3) addText(el.firstChild as Text)
            else out.push({ el, texts: [], str: '' })
        }
        else return []
    }
    return out
}
// 一个文本槽里的文字变了:只改变的那一段(去掉公共前后缀),落在哪个文本节点就在哪个节点上 replaceData。
// 整槽重写(逐节点赋 data)在 53 万字符行里会让每个后面的节点都被重排;这里最多动两三个节点,
// 节点长度会和重新切的不一样(513 对 512),没关系:只要拼起来的文字对。
function patchTexts(texts: Text[], oldStr: string, newStr: string): void {
    const max = Math.min(oldStr.length, newStr.length)
    let p = 0
    while (p < max && oldStr.charCodeAt(p) === newStr.charCodeAt(p)) p++
    let q = 0
    while (q < max - p && oldStr.charCodeAt(oldStr.length - 1 - q) === newStr.charCodeAt(newStr.length - 1 - q)) q++
    // 别把一个代理对劈成两半
    const hi = (c: number) => c >= 0xd800 && c < 0xdc00
    if (p > 0 && hi(oldStr.charCodeAt(p - 1))) p--
    const a = p, b = oldStr.length - q, ins = newStr.slice(p, newStr.length - q)
    let acc = 0, done = false
    for (let i = 0; i < texts.length; i++) {
        const t = texts[i]
        const end = acc + t.length
        if (!done) {
            if (a < end || i === texts.length - 1) {
                t.replaceData(a - acc, Math.max(0, Math.min(b, end) - a), ins)
                done = true
                if (b <= end) return
            }
        }
        else {
            const del = Math.min(b, end) - acc
            if (del > 0) t.deleteData(0, del)
            if (b <= end) return
        }
        acc = end
    }
}
function patchNodeInPlace(old: Element, fresh: Element): boolean {
    // 超长行的占位:宽 / 长度 / 起点变了就换掉这一个节点(不改属性:行索引只听子树和文字的变动),两侧的文字节点不动
    if (isLineGap(old) && isLineGap(fresh)) {
        if (old.getAttribute('data-cm-widget') !== fresh.getAttribute('data-cm-widget') || old.getAttribute('data-cm-widget-from') !== fresh.getAttribute('data-cm-widget-from')
            || (old as HTMLElement).style.width !== (fresh as HTMLElement).style.width) old.replaceWith(fresh)
        return true
    }
    if (old.nodeName !== fresh.nodeName || old.attributes.length !== fresh.attributes.length) return false
    for (let i = 0; i < fresh.attributes.length; i++) {
        const at = fresh.attributes[i]
        if (old.getAttribute(at.name) !== at.value) return false
    }
    const a = slotsOf(old.childNodes), b = slotsOf(fresh.childNodes)
    if (a.length !== b.length || (a.length === 0 && old.childNodes.length !== fresh.childNodes.length)) return false
    for (let i = 0; i < a.length; i++) {
        const x = a[i], y = b[i]
        if (!!x.el !== !!y.el) return false
        if (x.el) { if (!patchNodeInPlace(x.el, y.el!)) return false }
        else if (x.str !== y.str) {
            if (!x.texts.length || !y.texts.length) return false
            patchTexts(x.texts, x.str, y.str)
        }
    }
    return true
}

/** 一次编辑涉及的文本超过这么多字符时,patchDOM 先比旧节点,一样就不换 */
const LONG_LINE_KEEP_DOM = 2000
const HIDDEN_RENDER_LINES = 2000

// 把行元素里可见文本 [a,b) 换成 text,只改文本节点内容(节点本身不换,组字范围跟着平移)。无文本节点返回 false。
function replaceLineText(lineEl: HTMLElement, a: number, b: number, text: string): boolean {
    const walker = lineEl.ownerDocument.createTreeWalker(lineEl, 4 /* SHOW_TEXT */)
    let acc = 0
    let start: { node: Text, off: number } | null = null
    let pending = text
    for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
        const len = n.length
        if (!start && a <= acc + len) {
            start = { node: n, off: a - acc }
            const del = Math.min(b, acc + len) - a
            n.replaceData(a - acc, del, pending)
            pending = ''
            if (b <= acc + len) return true
            acc += len
            continue
        }
        if (start) {
            const del = Math.min(b, acc + len) - acc
            if (del > 0) n.deleteData(0, del)
            if (b <= acc + len) return true
        }
        acc += len
    }
    return start != null
}

// 两个 state 是否有字段换了值(或重配了)。装饰只从字段和文档来:只动选区、字段都没动 → 装饰不用重算。
// (选区本身画的东西——选区背景、当前行、括号匹配、同词——不走装饰或单独处理,见 update 的选区路径。)
function fieldsChanged(a: EditorState, b: EditorState): boolean {
    if (a.config !== b.config) return true
    for (const [id, v] of b.fieldValues) if (a.fieldValues.get(id) !== v) return true
    return false
}

// 两个 UTF-16 单元组成一个代理对(删字时按码点删)。
function isSurrogatePair(s: string): boolean {
    if (s.length < 2) return false
    const a = s.charCodeAt(0), b = s.charCodeAt(1)
    return a >= 0xd800 && a <= 0xdbff && b >= 0xdc00 && b <= 0xdfff
}

// beforeinput 里属于组字过程本身的 inputType(其余输入出现在组字中 = 浏览器已放弃组字)
const compositionInputTypes = new Set([
    'insertCompositionText', 'deleteCompositionText', 'insertFromComposition', 'deleteByComposition',
])

const STRONG_RTL = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/
const STRONG_LTR = /[\p{L}\p{N}]/u

/**
 * collapsed range 取不到 rect 时(WebKit 的双向文本边界),用相邻字符的字形矩形还原 caret 位置:
 * 前一个字符的「后缘」,没有前一个字符就取后一个字符的「前缘」。后缘 = 该字符是 RTL 时取左边,否则右边;
 * 中性字符(空格、标点)跟所在容器的 direction。
 */
function adjacentGlyphCaret(doc: Document, node: Text, offset: number): { left: number, top: number, height: number, bottom: number } | null {
    const data = node.data
    const dirOf = (ch: string): boolean => {
        if (STRONG_RTL.test(ch)) return true
        if (STRONG_LTR.test(ch)) return false
        const el = node.parentElement
        const win = doc.defaultView
        return !!el && !!win && win.getComputedStyle(el).direction === 'rtl'
    }
    const glyph = (a: number, b: number) => {
        const r = doc.createRange()
        r.setStart(node, a)
        r.setEnd(node, b)
        const rs = r.getClientRects()
        for (let i = 0; i < rs.length; i++) if (rs[i].width > 0) return rs[i]
        return null
    }
    if (offset > 0) {
        // 代理对 / 组合符:取到前一个码元起点(只取最后一个码元的矩形够定边:同一簇各码元同宽或零宽)
        const g = glyph(offset - 1, offset)
        if (g) return { left: dirOf(data[offset - 1]) ? g.left : g.right, top: g.top, height: g.height, bottom: g.bottom }
    }
    if (offset < data.length) {
        const g = glyph(offset, offset + 1)
        if (g) return { left: dirOf(data[offset]) ? g.right : g.left, top: g.top, height: g.height, bottom: g.bottom }
    }
    return null
}

// 不改文档、不动选区、不带 effects 的事务(撤销边界之类的纯注解):视图上没有要画的
const isInert = (tr: Transaction) => !tr.docChanged && !tr.selection && tr.effects.length === 0 && !tr.scrollIntoView
