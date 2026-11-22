// 视图层的 Monaco API 形态:枚举、事件对象、IViewZone / IMouseTarget 等结构化类型,以及两个纯算法
//(揭示行时的 scrollTop 计算 = viewLines._computeScrollTopToRevealRange、平滑滚动 = base/common/scrollable 的 SmoothScrollingOperation)。
// 枚举数值与 Monaco 一致。Position / Range 一律用 {lineNumber, column} / {startLineNumber…} 结构化形态,不依赖别的类。

import type { EditorLayoutInfo } from '../options/types'
import { Position, Range, Selection, type IPosition as IPos, type IRange as IRan } from '../model/position'

export type { EditorLayoutInfo }

// ---- 枚举(与 monaco.editor 同名同值) ----

export enum ScrollType {
    Smooth = 0,
    Immediate = 1,
}

export enum MouseTargetType {
    UNKNOWN = 0,
    TEXTAREA = 1,
    GUTTER_GLYPH_MARGIN = 2,
    GUTTER_LINE_NUMBERS = 3,
    GUTTER_LINE_DECORATIONS = 4,
    GUTTER_VIEW_ZONE = 5,
    CONTENT_TEXT = 6,
    CONTENT_EMPTY = 7,
    CONTENT_VIEW_ZONE = 8,
    CONTENT_WIDGET = 9,
    OVERVIEW_RULER = 10,
    SCROLLBAR = 11,
    OVERLAY_WIDGET = 12,
    OUTSIDE_EDITOR = 13,
}

export enum CursorChangeReason {
    NotSet = 0,
    ContentFlush = 1,
    RecoverFromMarkers = 2,
    Explicit = 3,
    Paste = 4,
    Undo = 5,
    Redo = 6,
}

/** Monaco viewEvents.VerticalRevealType(内部枚举,reveal* 方法用) */
export enum VerticalRevealType {
    Simple = 0,
    Center = 1,
    CenterIfOutsideViewport = 2,
    Top = 3,
    Bottom = 4,
    NearTop = 5,
    NearTopIfOutsideViewport = 6,
}

// ---- 结构化的 Position / Range / Selection ----

export type IPosition = IPos
export type IRange = IRan
export interface ISelection {
    selectionStartLineNumber: number
    selectionStartColumn: number
    positionLineNumber: number
    positionColumn: number
}
/** getSelection 返回:Monaco 的 Selection 类实例 */
export type ISelectionResult = Selection

// ---- 事件 ----

export interface IDisposable { dispose(): void }
export type IEvent<T> = (listener: (e: T) => any, thisArgs?: any) => IDisposable

/** 最小的事件源:fire 时按注册顺序同步调用,监听器里抛错不影响其余 */
export class Emitter<T> {
    private listeners: ((e: T) => unknown)[] = []
    readonly event: IEvent<T> = (listener, thisArgs) => {
        const fn = thisArgs ? (e: T) => listener.call(thisArgs, e) : listener
        this.listeners.push(fn)
        return { dispose: () => { const i = this.listeners.indexOf(fn); if (i >= 0) this.listeners.splice(i, 1) } }
    }
    get hasListeners(): boolean { return this.listeners.length > 0 }
    fire(e: T): void {
        let failed = false
        let error: unknown
        for (const fn of this.listeners.slice()) {
            try { fn(e) }
            catch (err) { if (!failed) { failed = true; error = err } }
        }
        if (failed) throw error
    }
    dispose(): void { this.listeners = [] }
}

export interface IScrollEvent {
    readonly scrollTop: number
    readonly scrollLeft: number
    readonly scrollWidth: number
    readonly scrollHeight: number
    readonly scrollTopChanged: boolean
    readonly scrollLeftChanged: boolean
    readonly scrollWidthChanged: boolean
    readonly scrollHeightChanged: boolean
}

export interface IContentSizeChangedEvent {
    readonly contentWidth: number
    readonly contentHeight: number
    readonly contentWidthChanged: boolean
    readonly contentHeightChanged: boolean
}

export interface ICursorPositionChangedEvent {
    readonly position: Position
    readonly secondaryPositions: Position[]
    readonly reason: CursorChangeReason
    readonly source: string
}

export interface ICursorSelectionChangedEvent {
    readonly selection: ISelectionResult
    readonly secondarySelections: ISelectionResult[]
    readonly modelVersionId: number
    readonly oldSelections: ISelectionResult[] | null
    readonly oldModelVersionId: number
    readonly source: string
    readonly reason: CursorChangeReason
}

// ---- View zone ----

export interface IViewZone {
    afterLineNumber: number
    afterColumn?: number
    afterColumnAffinity?: number
    ordinal?: number
    heightInLines?: number
    heightInPx?: number
    minWidthInPx?: number
    domNode: HTMLElement
    marginDomNode?: HTMLElement | null
    suppressMouseDown?: boolean
    showInHiddenAreas?: boolean
    onDomNodeTop?: (top: number) => void
    onComputedHeight?: (height: number) => void
}

export interface IViewZoneChangeAccessor {
    addZone(zone: IViewZone): string
    removeZone(id: string): void
    layoutZone(id: string): void
}

// ---- 鼠标命中 ----

export interface IMouseTargetPosition { lineNumber: number, column: number }

/** Monaco 的 IMouseTarget:按 type 判别的联合(字段形态与 monaco.d.ts 一致) */
export interface IBaseMouseTarget {
    readonly element: HTMLElement | null
    readonly position: Position | null
    readonly mouseColumn: number
    readonly range: Range | null
}
export interface IMouseTargetUnknown extends IBaseMouseTarget { readonly type: MouseTargetType.UNKNOWN }
export interface IMouseTargetTextarea extends IBaseMouseTarget { readonly type: MouseTargetType.TEXTAREA, readonly position: null, readonly range: null }
export interface IMouseTargetMarginData {
    readonly isAfterLines: boolean
    readonly glyphMarginLeft: number
    readonly glyphMarginWidth: number
    readonly glyphMarginLane?: 1 | 2 | 3
    readonly lineNumbersWidth: number
    readonly offsetX: number
}
export interface IMouseTargetMargin extends IBaseMouseTarget {
    readonly type: MouseTargetType.GUTTER_GLYPH_MARGIN | MouseTargetType.GUTTER_LINE_NUMBERS | MouseTargetType.GUTTER_LINE_DECORATIONS
    readonly position: Position
    readonly range: Range
    readonly detail: IMouseTargetMarginData
}
export interface IMouseTargetViewZoneData {
    readonly viewZoneId: string
    readonly positionBefore: Position | null
    readonly positionAfter: Position | null
    readonly position: Position
    readonly afterLineNumber: number
}
export interface IMouseTargetViewZone extends IBaseMouseTarget {
    readonly type: MouseTargetType.GUTTER_VIEW_ZONE | MouseTargetType.CONTENT_VIEW_ZONE
    readonly position: Position
    readonly range: Range
    readonly detail: IMouseTargetViewZoneData
}
export interface IMouseTargetContentTextData { readonly mightBeForeignElement: boolean }
export interface IMouseTargetContentText extends IBaseMouseTarget {
    readonly type: MouseTargetType.CONTENT_TEXT
    readonly position: Position
    readonly range: Range
    readonly detail: IMouseTargetContentTextData
}
export interface IMouseTargetContentEmptyData { readonly isAfterLines: boolean, readonly horizontalDistanceToText?: number }
export interface IMouseTargetContentEmpty extends IBaseMouseTarget {
    readonly type: MouseTargetType.CONTENT_EMPTY
    readonly position: Position
    readonly range: Range
    readonly detail: IMouseTargetContentEmptyData
}
export interface IMouseTargetContentWidget extends IBaseMouseTarget { readonly type: MouseTargetType.CONTENT_WIDGET, readonly position: null, readonly range: null, readonly detail: string }
export interface IMouseTargetOverlayWidget extends IBaseMouseTarget { readonly type: MouseTargetType.OVERLAY_WIDGET, readonly position: null, readonly range: null, readonly detail: string }
export interface IMouseTargetScrollbar extends IBaseMouseTarget { readonly type: MouseTargetType.SCROLLBAR, readonly position: Position, readonly range: Range }
export interface IMouseTargetOverviewRuler extends IBaseMouseTarget { readonly type: MouseTargetType.OVERVIEW_RULER }
export interface IMouseTargetOutsideEditor extends IBaseMouseTarget {
    readonly type: MouseTargetType.OUTSIDE_EDITOR
    readonly outsidePosition: 'above' | 'below' | 'left' | 'right'
    readonly outsideDistance: number
}
export type IMouseTarget = IMouseTargetUnknown | IMouseTargetTextarea | IMouseTargetMargin | IMouseTargetViewZone | IMouseTargetContentText | IMouseTargetContentEmpty
    | IMouseTargetContentWidget | IMouseTargetOverlayWidget | IMouseTargetScrollbar | IMouseTargetOverviewRuler | IMouseTargetOutsideEditor

// ---- 揭示行:scrollTop 计算(viewLines._computeScrollTopToRevealRange / _computeMinimumScrolling) ----

/** 最小滚动:盒放得下就让它进视口(上方 → 对齐顶,下方 → 对齐底),放不下对齐盒顶。revealAtStart / revealAtEnd 强制贴边 */
export function computeMinimumScrolling(viewportStart: number, viewportEnd: number, boxStart: number, boxEnd: number, revealAtStart = false, revealAtEnd = false): number {
    viewportStart |= 0
    viewportEnd |= 0
    boxStart |= 0
    boxEnd |= 0
    const viewportLength = viewportEnd - viewportStart
    const boxLength = boxEnd - boxStart
    if (boxLength < viewportLength) {
        if (revealAtStart) return boxStart
        if (revealAtEnd) return Math.max(0, boxEnd - viewportLength)
        if (boxStart < viewportStart) return boxStart
        else if (boxEnd > viewportEnd) return Math.max(0, boxEnd - viewportLength)
    } else {
        return boxStart
    }
    return viewportStart
}

export interface RevealTopInput {
    viewportTop: number
    viewportHeight: number
    lineHeight: number
    /** 盒的竖向区间(内容坐标;boxEnd 已含最后一行的行高) */
    boxStartY: number
    boxEndY: number
    /** 单个范围(true)还是多光标(false):多光标盒比视口高时放弃 */
    boxIsSingleRange: boolean
    /** max(cursorSurroundingLines, sticky maxLineCount) */
    surroundingLines: number
    surroundingLinesStyle: 'default' | 'all'
    source: string
    minimalReveal: boolean
    verticalType: VerticalRevealType
}

/** 目标 scrollTop;-1 = 放弃(多光标放不下) */
export function computeScrollTopToReveal(i: RevealTopInput): number {
    const viewportStartY = i.viewportTop
    const viewportEndY = viewportStartY + i.viewportHeight
    let { boxStartY, boxEndY } = i
    const lh = i.lineHeight
    const shouldIgnoreScrollOff = (i.source === 'mouse' || i.minimalReveal) && i.surroundingLinesStyle === 'default'
    let paddingTop = 0
    let paddingBottom = 0
    if (!shouldIgnoreScrollOff) {
        const maxLinesInViewport = i.viewportHeight / lh
        const context = Math.min(maxLinesInViewport / 2, i.surroundingLines)
        paddingTop = context * lh
        paddingBottom = Math.max(0, context - 1) * lh
    } else if (!i.minimalReveal) {
        paddingTop = lh // 拖选时多露一行
    }
    if (!i.minimalReveal) {
        // 末行会被横向滚动条盖住:Simple / Bottom 再多露一行
        if (i.verticalType === VerticalRevealType.Simple || i.verticalType === VerticalRevealType.Bottom) paddingBottom += lh
    }
    boxStartY -= paddingTop
    boxEndY += paddingBottom
    const t = i.verticalType
    if (boxEndY - boxStartY > i.viewportHeight) {
        if (!i.boxIsSingleRange) return -1
        return boxStartY
    }
    if (t === VerticalRevealType.NearTop || t === VerticalRevealType.NearTopIfOutsideViewport) {
        if (t === VerticalRevealType.NearTopIfOutsideViewport && viewportStartY <= boxStartY && boxEndY <= viewportEndY) return viewportStartY
        // 上方留视口的 20%,至少 5 行;但盒不能被推出视口
        const desiredGapAbove = Math.max(5 * lh, i.viewportHeight * 0.2)
        return Math.max(boxEndY - i.viewportHeight, boxStartY - desiredGapAbove)
    }
    if (t === VerticalRevealType.Center || t === VerticalRevealType.CenterIfOutsideViewport) {
        if (t === VerticalRevealType.CenterIfOutsideViewport && viewportStartY <= boxStartY && boxEndY <= viewportEndY) return viewportStartY
        return Math.max(0, (boxStartY + boxEndY) / 2 - i.viewportHeight / 2)
    }
    return computeMinimumScrolling(viewportStartY, viewportEndY, boxStartY, boxEndY, t === VerticalRevealType.Top, t === VerticalRevealType.Bottom)
}

// ---- 平滑滚动(base/common/scrollable.js SmoothScrollingOperation) ----

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)
type Curve = (t: number) => number
const cubicFrom = (from: number, to: number): Curve => { const d = to - from; return t => from + d * easeOutCubic(t) }
const composed = (a: Curve, b: Curve, cut: number): Curve => t => (t < cut ? a(t / cut) : b((t - cut) / (1 - cut)))

function animation(from: number, to: number, viewportSize: number): Curve {
    // 跳得远(> 2.5 屏):先快滚 0.75 屏,中间直接跳过去,最后 0.75 屏缓停
    if (Math.abs(from - to) > 2.5 * viewportSize) {
        const [stop1, stop2] = from < to ? [from + 0.75 * viewportSize, to - 0.75 * viewportSize] : [from - 0.75 * viewportSize, to + 0.75 * viewportSize]
        return composed(cubicFrom(from, stop1), cubicFrom(stop2, to), 0.33)
    }
    return cubicFrom(from, to)
}

export interface ScrollPos { top: number, left: number }

export class SmoothScrolling {
    private readonly top: Curve
    private readonly left: Curve
    private readonly startTime: number
    readonly duration: number
    constructor(readonly from: ScrollPos, readonly to: ScrollPos, viewport: { width: number, height: number }, duration: number, now: number) {
        // +10 / -10:假装动画已经开始一点,响应更快(同 Monaco)
        this.duration = duration + 10
        this.startTime = now - 10
        this.top = animation(from.top, to.top, viewport.height)
        this.left = animation(from.left, to.left, viewport.width)
    }
    at(now: number): ScrollPos & { done: boolean } {
        const c = (now - this.startTime) / this.duration
        if (c < 1) return { top: this.top(c), left: this.left(c), done: false }
        return { top: this.to.top, left: this.to.left, done: true }
    }
}

// ---- EditorZoom(common/config/editorZoom.js):全页共享的字号缩放级别,每级 10% ----

class EditorZoomImpl {
    private level = 0
    private readonly emitter = new Emitter<number>()
    readonly onDidChangeZoomLevel: IEvent<number> = this.emitter.event
    getZoomLevel(): number { return this.level }
    setZoomLevel(zoomLevel: number): void {
        zoomLevel = Math.min(Math.max(-5, zoomLevel), 20)
        if (this.level === zoomLevel) return
        this.level = zoomLevel
        this.emitter.fire(zoomLevel)
    }
}
export const EditorZoom: { getZoomLevel(): number, setZoomLevel(zoomLevel: number): void, readonly onDidChangeZoomLevel: IEvent<number> } = new EditorZoomImpl()
