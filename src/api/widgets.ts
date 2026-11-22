// 内容挂件 / 浮层挂件(Monaco 的 addContentWidget / layoutContentWidget / removeContentWidget 和 addOverlayWidget …)。H2。
//
// 挂件的 DOM 由调用方给(getDomNode),这里只负责摆:
// - 内容挂件跟着文档位置走:用 view.caretCoords 取视口坐标,换算到容器坐标;滚动(onGeometry)、事务(编辑 / 选区)、布局变化时重算。
//   preference 数组按序试(ABOVE:挂件底边贴行顶;BELOW:挂件顶边贴行底;EXACT:挂件左上角就在光标处),第一个放得下的赢,都放不下取第一个。
//   getPosition() 返回 null 或位置在视口外 → 隐藏(visibility:hidden,不摘 DOM)。
// - allowEditorOverflow 的内容挂件挂到编辑器外面,不被 view.dom 的 overflow:hidden 裁掉:
//   构造选项 `overflowWidgetsDomNode` 给了就挂它(fixedOverflowWidgets 为 false 时相对该节点绝对定位,为 true 时 fixed),
//   没给就挂到 body / ShadowRoot 下自建的容器里,一律 fixed + 视口坐标。fixedOverflowWidgets 选项经 core.getOption 读。
// - 浮层挂件挂在 view.dom 的一层铺满的容器里(pointer-events:none,挂件本身 auto):TOP_RIGHT_CORNER / BOTTOM_RIGHT_CORNER 贴右边让出滚动条宽度,
//   TOP_CENTER 水平居中;getPosition() 返回 null = 挂件自己管位置(只放进容器)。
// - remove 时摘 DOM,并清掉我们加的定位样式;实例销毁时全部清掉。
import type { EditorContext } from './context'
import type { IPosition, IRange } from './types'
import { GlyphMarginLane } from './decorations'
import type * as core from '../core/index'
import { getOption } from '../core/options'
import { docOffset } from './commands'

// ───────────── 枚举(数值同 monaco.d.ts) ─────────────

export enum ContentWidgetPositionPreference {
    EXACT = 0,
    ABOVE = 1,
    BELOW = 2,
}

export enum OverlayWidgetPositionPreference {
    TOP_RIGHT_CORNER = 0,
    BOTTOM_RIGHT_CORNER = 1,
    TOP_CENTER = 2,
}

export enum PositionAffinity {
    Left = 0,
    Right = 1,
    None = 2,
    LeftOfInjectedText = 3,
    RightOfInjectedText = 4,
}

// ───────────── 类型 ─────────────

export interface IContentWidgetPosition {
    position: IPosition | null
    secondaryPosition?: IPosition | null
    preference: ContentWidgetPositionPreference[]
    positionAffinity?: PositionAffinity
}

export interface IContentWidget {
    allowEditorOverflow?: boolean
    suppressMouseDown?: boolean
    getId(): string
    getDomNode(): HTMLElement
    getPosition(): IContentWidgetPosition | null
    beforeRender?(): { width: number, height: number } | null
    /** position = 最终选中的摆放偏好(放不下任何位置时为 null);coordinate = 相对编辑器的 top/left */
    afterRender?(position: ContentWidgetPositionPreference | null, coordinate: { readonly top: number, readonly left: number } | null): void
}

export interface IOverlayWidgetPosition {
    preference: OverlayWidgetPositionPreference | { top: number, left: number } | null
}

export interface IOverlayWidget {
    allowEditorOverflow?: boolean
    getId(): string
    getDomNode(): HTMLElement
    getPosition(): IOverlayWidgetPosition | null
    getMinContentWidthInPx?(): number
}

export interface IGlyphMarginWidgetPosition {
    /** 字形边距里的车道 */
    lane: GlyphMarginLane
    /** 同车道同行有多个挂件时,zIndex 大的画在上面 */
    zIndex: number
    /** 挂件跟着这个范围的起始行 */
    range: IRange
}

export interface IGlyphMarginWidget {
    getId(): string
    getDomNode(): HTMLElement
    getPosition(): IGlyphMarginWidgetPosition
}

export interface IWidgetsApi {
    addGlyphMarginWidget(widget: IGlyphMarginWidget): void
    layoutGlyphMarginWidget(widget: IGlyphMarginWidget): void
    removeGlyphMarginWidget(widget: IGlyphMarginWidget): void
    addContentWidget(widget: IContentWidget): void
    layoutContentWidget(widget: IContentWidget): void
    removeContentWidget(widget: IContentWidget): void
    addOverlayWidget(widget: IOverlayWidget): void
    layoutOverlayWidget(widget: IOverlayWidget): void
    removeOverlayWidget(widget: IOverlayWidget): void
}

// ───────────── 实现 ─────────────

const POSITION_STYLES = ['position', 'top', 'left', 'right', 'bottom', 'transform', 'visibility', 'max-width', 'z-index'] as const

function clearStyles(el: HTMLElement): void {
    for (const p of POSITION_STYLES) el.style.removeProperty(p)
}

function rootFor(view: core.EditorView): HTMLElement {
    const root = view.dom.getRootNode()
    // ShadowRoot 里挂到 root 的第一层容器:样式作用域一致;普通文档挂 body
    return root instanceof ShadowRoot ? (root.firstElementChild as HTMLElement | null ?? view.dom) : view.dom.ownerDocument.body
}

interface ContentEntry {
    widget: IContentWidget
    node: HTMLElement
    overflow: boolean
    mouseDown: ((e: MouseEvent) => void) | null
}

export function installWidgets(ctx: EditorContext): void {
    const view = ctx.view
    const api = ctx.api as unknown as IWidgetsApi
    const content = new Map<string, ContentEntry>()
    const overlays = new Map<string, { widget: IOverlayWidget, node: HTMLElement }>()

    let contentLayer: HTMLElement | null = null
    let overlayLayer: HTMLElement | null = null
    let overflowLayer: HTMLElement | null = null

    const layerBase = (cls: string, z: string): HTMLElement => {
        const el = view.dom.ownerDocument.createElement('div')
        el.className = cls
        el.setAttribute('role', 'presentation')
        el.style.cssText = `position:absolute;left:0;top:0;right:0;bottom:0;pointer-events:none;overflow:hidden;z-index:${z}`
        return el
    }
    const ensureContentLayer = () => contentLayer ??= (() => { const l = layerBase('cm-contentWidgets', '10'); view.dom.appendChild(l); return l })()
    const ensureOverlayLayer = () => overlayLayer ??= (() => { const l = layerBase('cm-overlayWidgets', '11'); view.dom.appendChild(l); return l })()
    const hostOverflowNode = (): HTMLElement | null => {
        const n = (ctx.host.getUserOptions() as { overflowWidgetsDomNode?: HTMLElement }).overflowWidgetsDomNode
        return n instanceof HTMLElement ? n : null
    }
    const fixedOverflow = () => getOption(view.state, 'fixedOverflowWidgets') === true
    const ensureOverflowLayer = (): HTMLElement => {
        const given = hostOverflowNode()
        if (given) return given
        if (!overflowLayer) {
            overflowLayer = view.dom.ownerDocument.createElement('div')
            overflowLayer.className = 'cm-overflowWidgets monaco-editor'
            overflowLayer.style.cssText = 'position:static'
            rootFor(view).appendChild(overflowLayer)
        }
        return overflowLayer
    }

    // ── 内容挂件 ──

    const affinitySide = (a: PositionAffinity | undefined): number => a === PositionAffinity.Left || a === PositionAffinity.LeftOfInjectedText ? -1 : a === PositionAffinity.Right || a === PositionAffinity.RightOfInjectedText ? 1 : 0

    /** 文档位置 → 视口坐标;视口外退回按行块几何估(垂直近似、水平取正文左缘) */
    const coordsOf = (pos: IPosition, side: number): { left: number, top: number, bottom: number } | null => {
        const doc = view.state.doc
        const offset = docOffset(doc, pos.lineNumber, pos.column)
        const c = view.caretCoords(offset, side)
        if (c) return { left: c.left, top: c.top, bottom: c.bottom }
        return null
    }

    const layoutContent = (e: ContentEntry): void => {
        const node = e.node
        const p = e.widget.getPosition()
        if (!p || !p.position) {
            node.style.visibility = 'hidden'
            e.widget.afterRender?.(null, null)
            return
        }
        const c = coordsOf(p.position, affinitySide(p.positionAffinity))
        if (!c) {
            node.style.visibility = 'hidden'
            e.widget.afterRender?.(null, null)
            return
        }
        const editorRect = view.dom.getBoundingClientRect()
        const w = node.getBoundingClientRect()
        const width = w.width
        const height = w.height
        const prefs = p.preference && p.preference.length ? p.preference : [ContentWidgetPositionPreference.EXACT]
        let chosen = prefs[0]
        let top = 0
        const topFor = (pref: ContentWidgetPositionPreference) => pref === ContentWidgetPositionPreference.ABOVE ? c.top - height
            : pref === ContentWidgetPositionPreference.BELOW ? c.bottom : c.top
        const fits = (t: number) => e.overflow || (t >= editorRect.top && t + height <= editorRect.bottom)
        let found = false
        for (const pref of prefs) {
            const t = topFor(pref)
            if (fits(t)) { chosen = pref; top = t; found = true; break }
        }
        if (!found) top = topFor(chosen)
        let left = c.left
        if (!e.overflow && width > 0) {
            // 右边放不下就往左挪,但不越过编辑器左缘
            if (left + width > editorRect.right) left = Math.max(editorRect.left, editorRect.right - width)
        }
        if (e.overflow) {
            const given = hostOverflowNode()
            if (given && !fixedOverflow()) {
                const r = given.getBoundingClientRect()
                node.style.position = 'absolute'
                node.style.left = `${left - r.left}px`
                node.style.top = `${top - r.top}px`
            } else {
                node.style.position = 'fixed'
                node.style.left = `${left}px`
                node.style.top = `${top}px`
            }
            node.style.zIndex = '50'
        } else {
            node.style.position = 'absolute'
            node.style.left = `${left - editorRect.left}px`
            node.style.top = `${top - editorRect.top}px`
        }
        node.style.visibility = 'visible'
        e.widget.afterRender?.(chosen, { top: top - editorRect.top, left: left - editorRect.left })
    }

    const layoutAllContent = () => { for (const e of content.values()) layoutContent(e) }

    api.addContentWidget = (widget) => {
        const id = widget.getId()
        if (content.has(id)) api.removeContentWidget(content.get(id)!.widget)
        const node = widget.getDomNode()
        // allowOverflow(默认 true)是总闸:关了 allowEditorOverflow 不生效,挂件留在编辑器内容层、被编辑器框裁掉(Monaco ContentViewOverlay:allowEditorOverflow && allowOverflow)
        const overflow = !!widget.allowEditorOverflow && getOption(view.state, 'allowOverflow') !== false
        const parent = overflow ? ensureOverflowLayer() : ensureContentLayer()
        node.setAttribute('widgetid', id)
        node.style.pointerEvents = 'auto'
        node.style.visibility = 'hidden'
        node.style.position = overflow ? 'fixed' : 'absolute'
        parent.appendChild(node)
        let mouseDown: ((e: MouseEvent) => void) | null = null
        if (widget.suppressMouseDown) {
            // 不让编辑器的 mousedown 处理(选区、拖拽)看到这次点击
            mouseDown = (ev) => ev.stopPropagation()
            node.addEventListener('mousedown', mouseDown)
        }
        const entry: ContentEntry = { widget, node, overflow, mouseDown }
        content.set(id, entry)
        layoutContent(entry)
    }

    api.layoutContentWidget = (widget) => {
        const e = content.get(widget.getId())
        if (e) layoutContent(e)
    }

    api.removeContentWidget = (widget) => {
        const id = widget.getId()
        const e = content.get(id)
        if (!e) return
        content.delete(id)
        if (e.mouseDown) e.node.removeEventListener('mousedown', e.mouseDown)
        e.node.removeAttribute('widgetid')
        clearStyles(e.node)
        e.node.style.removeProperty('pointer-events')
        e.node.remove()
    }

    // ── 浮层挂件 ──

    const layoutOverlay = (o: { widget: IOverlayWidget, node: HTMLElement }): void => {
        const node = o.node
        clearStyles(node)
        node.style.pointerEvents = 'auto'
        node.style.position = 'absolute'
        const p = o.widget.getPosition()
        const pref = p?.preference
        if (pref === null || pref === undefined) return // 挂件自己管位置
        // Monaco overlayWidgets._renderWidget:右角挂件离右缘 2×竖条宽 + minimap 宽,底角离底 2×横条高(真 Chromium 实测 712 = 800−28−60)
        const lay = (view as unknown as { getLayoutInfo?(): { verticalScrollbarWidth: number, horizontalScrollbarHeight: number, minimap?: { minimapWidth?: number } } }).getLayoutInfo?.()
        const sb = (getOption(view.state, 'scrollbar') ?? {}) as { verticalScrollbarSize?: number, horizontalScrollbarSize?: number }
        const vsb = lay ? lay.verticalScrollbarWidth : (sb.verticalScrollbarSize ?? 14)
        const hsb = lay ? lay.horizontalScrollbarHeight : (sb.horizontalScrollbarSize ?? 12)
        const right = `${2 * vsb + (lay?.minimap?.minimapWidth ?? 0)}px`
        if (typeof pref === 'object') {
            node.style.top = `${pref.top}px`
            node.style.left = `${pref.left}px`
        } else if (pref === OverlayWidgetPositionPreference.TOP_RIGHT_CORNER) {
            node.style.top = '0px'
            node.style.right = right
        } else if (pref === OverlayWidgetPositionPreference.BOTTOM_RIGHT_CORNER) {
            node.style.bottom = `${2 * hsb}px`
            node.style.right = right
        } else if (pref === OverlayWidgetPositionPreference.TOP_CENTER) {
            node.style.top = '0px'
            node.style.left = '50%'
            node.style.transform = 'translateX(-50%)'
        }
    }

    api.addOverlayWidget = (widget) => {
        const id = widget.getId()
        if (overlays.has(id)) api.removeOverlayWidget(overlays.get(id)!.widget)
        const node = widget.getDomNode()
        node.setAttribute('widgetid', id)
        ensureOverlayLayer().appendChild(node)
        const entry = { widget, node }
        overlays.set(id, entry)
        layoutOverlay(entry)
    }

    api.layoutOverlayWidget = (widget) => {
        const e = overlays.get(widget.getId())
        if (e) layoutOverlay(e)
    }

    api.removeOverlayWidget = (widget) => {
        const id = widget.getId()
        const e = overlays.get(id)
        if (!e) return
        overlays.delete(id)
        e.node.removeAttribute('widgetid')
        clearStyles(e.node)
        e.node.style.removeProperty('pointer-events')
        e.node.remove()
    }

    // ── 字形边距挂件:挂在 view.dom 的一层里,按所在行的视口坐标摆(随滚动 / 布局重算),车道向 core 登记(撑出那一列) ──
    const glyphs = new Map<string, { widget: IGlyphMarginWidget, node: HTMLElement }>()
    let glyphLayer: HTMLElement | null = null
    const ensureGlyphLayer = () => glyphLayer ??= (() => { const l = layerBase('cm-glyphMarginWidgets', '9'); view.dom.appendChild(l); return l })()
    const layoutGlyph = (g: { widget: IGlyphMarginWidget, node: HTMLElement }): void => {
        const p = g.widget.getPosition()
        const { index, count } = view.reserveGlyphLane(p.lane)
        const lh = view.getLineHeightForPosition({ lineNumber: p.range.startLineNumber, column: 1 })
        const info = view.getLayoutInfo()
        const top = view.getTopForPosition(p.range.startLineNumber, 1) - view.getScrollTop()
        const s = g.node.style
        s.position = 'absolute'
        s.pointerEvents = 'auto'
        s.zIndex = String(p.zIndex)
        s.top = `${top}px`
        s.height = `${lh}px`
        s.width = `${Math.max(lh, info.glyphMarginWidth / Math.max(1, count))}px`
        s.left = `${info.glyphMarginLeft + index * (info.glyphMarginWidth / Math.max(1, count))}px`
        s.visibility = lh > 0 ? 'visible' : 'hidden' // 折叠隐藏的行 lh=0
    }
    const layoutAllGlyphs = () => { for (const g of glyphs.values()) layoutGlyph(g) }
    api.addGlyphMarginWidget = (widget) => {
        const id = widget.getId()
        if (glyphs.has(id)) { console.warn('Overwriting a glyph margin widget with the same id.'); api.removeGlyphMarginWidget(glyphs.get(id)!.widget) }
        const node = widget.getDomNode()
        node.setAttribute('widgetid', id)
        ensureGlyphLayer().appendChild(node)
        const entry = { widget, node }
        glyphs.set(id, entry)
        layoutGlyph(entry)
    }
    api.layoutGlyphMarginWidget = (widget) => {
        const e = glyphs.get(widget.getId())
        if (e) layoutGlyph(e)
    }
    api.removeGlyphMarginWidget = (widget) => {
        const id = widget.getId()
        const e = glyphs.get(id)
        if (!e) return
        glyphs.delete(id)
        e.node.removeAttribute('widgetid')
        clearStyles(e.node)
        for (const p of ['pointer-events', 'height', 'width']) e.node.style.removeProperty(p)
        e.node.remove()
    }

    // ── 重新摆放的时机:滚动 / 布局(onGeometry)和每笔事务(编辑、选区、折叠) ──
    const offGeo = view.onGeometry(() => { layoutAllContent(); layoutAllGlyphs(); for (const o of overlays.values()) layoutOverlay(o) })
    const offTr = view.onViewUpdate(() => { if (content.size) layoutAllContent(); if (glyphs.size) layoutAllGlyphs() })
    ctx.onDispose(() => {
        offGeo()
        offTr()
        for (const e of [...content.values()]) api.removeContentWidget(e.widget)
        for (const o of [...overlays.values()]) api.removeOverlayWidget(o.widget)
        for (const g of [...glyphs.values()]) api.removeGlyphMarginWidget(g.widget)
        glyphLayer?.remove(); glyphLayer = null
        contentLayer?.remove()
        overlayLayer?.remove()
        overflowLayer?.remove()
        contentLayer = overlayLayer = overflowLayer = null
    })
}
