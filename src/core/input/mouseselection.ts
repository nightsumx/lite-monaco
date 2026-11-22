// Portions of this file are derived from CodeMirror 6 (MIT, Copyright (C) Marijn Haverbeke and others). See THIRD-PARTY-NOTICES.md.
// 鼠标选区 + 矩形列选 —— 对齐 codeSrc/view/src/input.ts MouseSelection + rectangular-selection.ts。
// 无 ViewPlugin：直接挂 contentDOM mousedown。

import type { EditorView } from '../view/editorview'
import { EditorSelection, type SelectionRange } from '../model/selection'
import { EditorState, Facet } from '../model/state'
import { countColumn, findColumn } from '../model/column'
import { browser } from '../browser'
import { getSelection } from '../view/domutil'
import { wordSelectAt } from '../edit/words'
import { atomicRanges, skipAtomsForSelection } from '../edit/atomic'
import { unfoldEffectAt } from '../edit/fold'
import { boolOption, capSelection, multiCursorModifierKind } from '../edit/editoptions'
import { getOption } from '../options'

// 修饰键对齐 Monaco multiCursorModifier(默认 'alt'):
//   'alt'     → Alt+点 加/删光标、Alt+拖 加带选区的光标;Cmd(mac)/Ctrl+点 = 跳定义
//   'ctrlCmd' → 反过来
// 两种模式下 Shift+Alt+拖(以及非 Linux 的中键拖)都是列选。
export type MultiCursorModifier = 'alt' | 'ctrlCmd'
// 宿主用 facet 显式给过就用它;没给就读选项 `multiCursorModifier`(altKey / ctrlKey / metaKey,raw 的 alt / ctrlCmd 也认)
export const multiCursorModifier = Facet.define<MultiCursorModifier, MultiCursorModifier | undefined>({ combine: v => (v.length ? v[0] : undefined) })
export function resolvedMultiCursorModifier(state: EditorState): MultiCursorModifier {
    return state.facet(multiCursorModifier) ?? multiCursorModifierKind(state)
}
/** 「跳定义」单击(见上)松开后调用,光标已落在点击处。返回 true = 已处理。宿主/语言层注册(如 TS goToDefinition) */
export const clickDefinitionHandler = Facet.define<(view: EditorView, pos: number) => boolean>()

const ctrlCmdKey = (e: MouseEvent) => (browser.mac ? e.metaKey : e.ctrlKey)
export function hasMultiCursorModifier(view: EditorView, e: MouseEvent): boolean {
    return resolvedMultiCursorModifier(view.state) === 'alt' ? e.altKey : ctrlCmdKey(e)
}
// Monaco _hasNonMulticursorModifier:按着「另一类」修饰键(multiCursorModifier=alt 时是 Ctrl/Cmd,反之是 Alt)
function hasNonMultiCursorModifier(view: EditorView, e: MouseEvent): boolean {
    return resolvedMultiCursorModifier(view.state) === 'alt' ? e.ctrlKey || e.metaKey : e.altKey || (browser.mac ? e.ctrlKey : e.metaKey)
}
function hasDefinitionModifier(view: EditorView, e: MouseEvent): boolean {
    return resolvedMultiCursorModifier(view.state) === 'alt' ? ctrlCmdKey(e) : e.altKey
}

export interface MouseSelectionStyle {
    get: (curEvent: MouseEvent, extend: boolean, multiple: boolean) => EditorSelection
    update: (docChanged: boolean) => boolean | void
    /**
     * 鼠标出了文字区左/右沿时:'edge' = 按行首/行尾取位置(Monaco 普通拖选),'column' = 照常按 x 取列(列选);
     * 两种都横向 reveal 主光标。不设 = 不管(行号区拖选)。
     */
    outsideX?: 'edge' | 'column'
}

const MaxOff = 2000

function dist(a: MouseEvent, b: MouseEvent) {
    return Math.max(Math.abs(a.clientX - b.clientX), Math.abs(a.clientY - b.clientY))
}

/**
 * 竖向自动滚速度(行/秒),照抄 Monaco TopBottomDragScrollingOperation._getScrollSpeed:
 * 只在鼠标出了内容区上/下沿时滚,出界 ≤1.5 行 / ≤3 行 / 更远 三档,都按视口行数放大。
 */
export function dragScrollLinesPerSecond(outside: number, viewportHeight: number, lineHeight: number): number {
    const viewportInLines = viewportHeight / lineHeight
    const d = outside / lineHeight
    if (d <= 1.5) return Math.max(30, viewportInLines * (1 + d))
    if (d <= 3) return Math.max(60, viewportInLines * (2 + d))
    return Math.max(200, viewportInLines * (7 + d))
}

function addsSelectionRange(view: EditorView, event: MouseEvent) {
    if (!view.state.facet(EditorState.allowMultipleSelections)) return false
    return hasMultiCursorModifier(view, event)
}

export class MouseSelection {
    dragging: null | boolean
    extend: boolean
    multiple: boolean
    lastEvent: MouseEvent
    // 自动滚速度 px/s;scrolling = rAF id(-1 = 没在滚)
    scrollSpeed = { x: 0, y: 0 }
    scrolling = -1
    private lastTick = 0
    private virtTop = -1
    private virtLeft = -1
    private dropCursor: HTMLElement | null = null
    private move: (e: MouseEvent) => void
    private up: (e: MouseEvent) => void

    constructor(
        private view: EditorView,
        private startEvent: MouseEvent,
        private style: MouseSelectionStyle,
        private mustSelect: boolean,
        noDrag = false,
    ) {
        this.lastEvent = startEvent
        this.extend = startEvent.shiftKey
        this.multiple = addsSelectionRange(view, startEvent)
        // dragging:null = 按在主选区里、还没动(动了就拖放文本,对齐 Monaco DragAndDropController);
        // 带多光标修饰键 / Shift 时按下去是改选区,不拖
        // Monaco MouseDownOperation.start:dragAndDrop 开、没开 columnSelection、没按 Alt、非只读、单击在选区里才拖放
        const dnd = boolOption(view.state, 'dragAndDrop', true) && !boolOption(view.state, 'columnSelection', false) && !startEvent.altKey
        this.dragging = dnd && !noDrag && !this.multiple && !this.extend
            && isInPrimarySelection(view, startEvent) && getClickType(startEvent) === 1 ? null : false
        const doc = view.contentDOM.ownerDocument
        this.move = (e) => this.onMove(e)
        this.up = (e) => this.onUp(e)
        doc.addEventListener('mousemove', this.move)
        doc.addEventListener('mouseup', this.up)
    }

    start(event: MouseEvent) {
        if (this.dragging === false) this.select(event)
    }

    private onMove(event: MouseEvent) {
        if (event.buttons === 0) return this.destroy()
        if (this.dragging === null) {
            if (dist(this.startEvent, event) < 3) return
            this.dragging = true
        }
        this.lastEvent = event
        // Monaco _onMouseDownThenMove:出了上下沿只开定时滚,选区由滚动帧 dispatch,move 本身不选
        const scrolling = this.autoScroll(event)
        if (this.dragging) this.showDropCursor(event)
        else if (!scrolling) this.select(event)
    }

    private onUp(event: MouseEvent) {
        if (this.dragging == null) this.select(this.lastEvent)
        else if (this.dragging) this.drop(event)
        event.preventDefault()
        this.destroy()
    }

    // 拖放选区:落点在选区外 → 移动(Alt/mac、Ctrl/其他 = 复制),落点在选区里不动。选中落下的文本(Monaco 同)
    private drop(event: MouseEvent) {
        const view = this.view
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
        if (pos == null || view.state.readOnly) return
        const main = view.state.selection.main
        const copy = browser.mac ? event.altKey : event.ctrlKey
        if (pos >= main.from && pos <= main.to) return
        const text = view.state.sliceDoc(main.from, main.to)
        if (copy) {
            view.dispatch(view.state.update({
                changes: { from: pos, insert: text },
                selection: EditorSelection.range(pos, pos + text.length),
                userEvent: 'input.drop',
            }))
            return
        }
        const start = pos > main.to ? pos - text.length : pos
        view.dispatch(view.state.update({
            changes: [{ from: main.from, to: main.to }, { from: pos, insert: text }],
            selection: EditorSelection.range(start, start + text.length),
            userEvent: 'move.drop',
        }))
    }

    // 拖放落点提示(Monaco .dnd-target:光标位置一条竖线)
    private showDropCursor(event: MouseEvent) {
        const view = this.view
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
        const c = pos == null ? null : view.caretCoords(pos)
        if (!c) return
        if (!this.dropCursor) {
            this.dropCursor = view.dom.ownerDocument.createElement('div')
            this.dropCursor.className = 'cm-dropCursor'
            view.dom.appendChild(this.dropCursor)
        }
        const r = view.dom.getBoundingClientRect()
        const st = this.dropCursor.style
        st.left = `${c.left - r.left}px`
        st.top = `${c.top - r.top}px`
        st.height = `${c.height}px`
    }

    // 只有出了上下沿才定时滚(Monaco TopBottomDragScrolling)。左右没有定时器:
    // Monaco 出左右沿只按鼠标移动 dispatch 行首/行尾 + Minimal reveal,见 select / revealHeadX。
    private autoScroll(event: MouseEvent) {
        const rect = this.view.scrollDOM.getBoundingClientRect()
        const lh = this.view.oracle.lineHeight || 20
        const sx = 0
        let sy = 0
        if (event.clientY < rect.top) sy = -dragScrollLinesPerSecond(rect.top - event.clientY, rect.height, lh) * lh
        else if (event.clientY > rect.bottom) sy = dragScrollLinesPerSecond(event.clientY - rect.bottom, rect.height, lh) * lh
        this.setScrollSpeed(sx, sy)
        return sy !== 0
    }

    private setScrollSpeed(sx: number, sy: number) {
        this.scrollSpeed = { x: sx, y: sy }
        const win = this.view.dom.ownerDocument.defaultView!
        if (sx || sy) {
            if (this.scrolling < 0) {
                this.lastTick = win.performance.now()
                this.virtTop = this.view.scrollDOM.scrollTop
                this.virtLeft = this.view.scrollDOM.scrollLeft
                const tick = () => {
                    const now = win.performance.now()
                    const dt = Math.min(100, now - this.lastTick)
                    this.lastTick = now
                    this.scroll(dt)
                    if (this.scrolling > -1) this.scrolling = win.requestAnimationFrame(tick)
                }
                this.scrolling = win.requestAnimationFrame(tick)
            }
        } else if (this.scrolling > -1) {
            win.cancelAnimationFrame(this.scrolling)
            this.scrolling = -1
        }
    }

    // 按帧间隔推进(速度是 px/s);小数部分累在 virtTop/virtLeft 里,不被 scrollTop 取整吃掉
    private scroll(dt: number) {
        const { x, y } = this.scrollSpeed
        const sd = this.view.scrollDOM
        if (x) {
            this.virtLeft += x * dt / 1000
            sd.scrollLeft = this.virtLeft
            if (Math.abs(sd.scrollLeft - this.virtLeft) > 1) this.virtLeft = sd.scrollLeft
        }
        if (y) {
            this.virtTop += y * dt / 1000
            sd.scrollTop = this.virtTop
            if (Math.abs(sd.scrollTop - this.virtTop) > 1) this.virtTop = sd.scrollTop
        }
        if (this.dragging) this.showDropCursor(this.lastEvent)
        else this.select(this.lastEvent, false) // Monaco 竖向定时滚 dispatch 用 reveal None
    }

    // 出了文字区左/右沿:换成该行最左 / 最右的 x(posAtCoords 落到行首 / 行尾),对齐 Monaco
    // _getPositionOutsideEditor 的 left/right 和行号区(列 1)、minimap / 滚动条(行尾)的命中。
    private outsideSide(event: MouseEvent): -1 | 0 | 1 {
        if (!this.style.outsideX) return 0
        const sd = this.view.scrollDOM
        const left = sd.getBoundingClientRect().left
        const right = left + (sd.clientWidth || sd.getBoundingClientRect().width)
        return event.clientX < left ? -1 : event.clientX > right ? 1 : 0
    }

    private edgeEvent(event: MouseEvent, side: -1 | 0 | 1): MouseEvent | null {
        if (!side || this.style.outsideX !== 'edge') return null
        const x = side * 1e7
        return new MouseEvent(event.type, {
            clientX: x, clientY: event.clientY, screenX: event.screenX, screenY: event.screenY,
            button: event.button, buttons: event.buttons, detail: event.detail,
            shiftKey: event.shiftKey, altKey: event.altKey, ctrlKey: event.ctrlKey, metaKey: event.metaKey,
        })
    }

    // Monaco 横向 reveal(ViewLines._computeScrollLeftToReveal):普通拖选是 Minimal,不加边距;
    // 列选不是 Minimal,左留 HORIZONTAL_EXTRA_PX = 30、右留 revealHorizontalRightPadding = 15。
    // 光标在可见宽度左边 → 左对齐,右边 → 右对齐,已可见不动。caretCoords 只有 left(光标 0 宽,Monaco 的位置框也是)。
    private revealHeadX() {
        const sd = this.view.scrollDOM
        const c = this.view.caretCoords(this.view.state.selection.main.head)
        if (!c) return
        const left = sd.getBoundingClientRect().left
        const width = sd.clientWidth
        if (!width) return
        const column = this.style.outsideX === 'column'
        const boxL = c.left - (column ? 30 : 0), boxR = c.left + (column ? 15 : 0)
        if (boxL < left) sd.scrollLeft = Math.max(0, sd.scrollLeft - Math.round(left - boxL))
        else if (boxR > left + width) sd.scrollLeft = sd.scrollLeft + Math.round(boxR - (left + width))
    }

    private select(event: MouseEvent, reveal = true) {
        const atoms = this.view.state.facet(atomicRanges).map(f => f(this.view))
        const side = this.outsideSide(event)
        const edge = this.edgeEvent(event, side)
        const selection = capSelection(this.view.state, skipAtomsForSelection(atoms, this.style.get(edge ?? event, this.extend, this.multiple)))
        if (this.mustSelect || !selection.eq(this.view.state.selection, this.dragging === false))
            this.view.dispatch(this.view.state.update({ selection, userEvent: 'select.pointer' }))
        this.mustSelect = false
        if (side && reveal) this.revealHeadX()
    }

    update(docChanged: boolean) {
        if (docChanged) this.destroy()
        else if (this.style.update(docChanged))
            this.view.dom.ownerDocument.defaultView!.setTimeout(() => this.select(this.lastEvent), 20)
    }

    destroy() {
        this.setScrollSpeed(0, 0)
        this.dropCursor?.remove()
        this.dropCursor = null
        const doc = this.view.contentDOM.ownerDocument
        doc.removeEventListener('mousemove', this.move)
        doc.removeEventListener('mouseup', this.up)
        if (this.view.inputState.mouseSelection === this)
            this.view.inputState.mouseSelection = null
    }
}

function isInPrimarySelection(view: EditorView, event: MouseEvent) {
    const { main } = view.state.selection
    if (main.empty) return false
    const sel = getSelection(view.root)
    if (!sel || sel.rangeCount === 0) return true
    const rects = sel.getRangeAt(0).getClientRects()
    for (let i = 0; i < rects.length; i++) {
        const r = rects[i]
        if (r.left <= event.clientX && r.right >= event.clientX &&
            r.top <= event.clientY && r.bottom >= event.clientY) return true
    }
    return false
}

const BadMouseDetail = browser.ie && browser.ie_version <= 11
let lastMouseDown: MouseEvent | null = null
let lastMouseDownCount = 0
let lastMouseDownTime = 0

function getClickType(event: MouseEvent) {
    if (!BadMouseDetail) return event.detail
    const last = lastMouseDown, lastTime = lastMouseDownTime
    lastMouseDown = event
    lastMouseDownTime = Date.now()
    return lastMouseDownCount = !last || (lastTime > Date.now() - 400 &&
        Math.abs(last.clientX - event.clientX) < 2 &&
        Math.abs(last.clientY - event.clientY) < 2)
        ? (lastMouseDownCount + 1) % 3 : 1
}

function rangeForClick(view: EditorView, pos: number, type: number): SelectionRange {
    if (type === 1)
        return EditorSelection.cursor(pos)
    if (type === 2) {
        // Monaco WordOperations.word:贴着词选词,否则选两词之间的空白 / 分隔符;受 wordSeparators 影响
        const w = wordSelectAt(view.state, pos)
        return EditorSelection.range(w.from, w.to)
    }
    // triple = 整行
    const line = view.state.doc.lineAt(pos)
    const to = line.to < view.state.doc.length ? line.to + 1 : line.to
    return EditorSelection.range(line.from, to)
}

export function basicMouseSelection(view: EditorView, event: MouseEvent): MouseSelectionStyle {
    let startPos = view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.head
    let startSel = view.state.selection
    const type = getClickType(event)
    return {
        outsideX: 'edge',
        update(docChanged) {
            if (docChanged) {
                // map 粗略：保留 offset（事务后由 destroy 更常见）
                startSel = view.state.selection
            }
        },
        get(event, extend, multiple) {
            const hit = view.posAndAssocAtCoords({ x: event.clientX, y: event.clientY })
            const cur = hit ? hit.pos : startPos
            let range = rangeForClick(view, cur, type)
            // 折行:点在软折行点上(上一视觉行末尾右侧 / 下一视觉行行首)→ 光标画在点到的那一侧
            if (range.empty && hit?.assoc) range = EditorSelection.cursor(cur, hit.assoc)
            if (startPos !== cur && !extend) {
                const startRange = rangeForClick(view, startPos, type)
                const from = Math.min(startRange.from, range.from)
                const to = Math.max(startRange.to, range.to)
                range = from < range.from
                    ? EditorSelection.range(from, to)
                    : EditorSelection.range(to, from)
            }
            if (extend)
                return startSel.replaceRange(EditorSelection.range(startSel.main.anchor, range.to === range.from ? range.head : range.head))
            if (multiple && type === 1 && startSel.ranges.length > 1) {
                const removed = removeRangeAround(startSel, cur)
                if (removed) return removed
            }
            if (multiple) return startSel.addRange(range)
            return EditorSelection.create([range])
        },
    }
}

function removeRangeAround(sel: EditorSelection, pos: number) {
    for (let i = 0; i < sel.ranges.length; i++) {
        const { from, to } = sel.ranges[i]
        if (from <= pos && to >= pos)
            return EditorSelection.create(
                sel.ranges.slice(0, i).concat(sel.ranges.slice(i + 1)),
                sel.mainIndex === i ? 0 : sel.mainIndex - (sel.mainIndex > i ? 1 : 0),
            )
    }
    return null
}

type Pos = { line: number, col: number, off: number }

function rectangleFor(state: EditorState, a: Pos, b: Pos) {
    const startLine = Math.min(a.line, b.line), endLine = Math.max(a.line, b.line)
    const ranges: SelectionRange[] = []
    if (a.off > MaxOff || b.off > MaxOff || a.col < 0 || b.col < 0) {
        const startOff = Math.min(a.off, b.off), endOff = Math.max(a.off, b.off)
        for (let i = startLine; i <= endLine; i++) {
            const line = state.doc.line(i)
            ranges.push(EditorSelection.range(
                line.from + Math.min(startOff, line.length),
                line.from + Math.min(endOff, line.length),
            ))
        }
    } else {
        const startCol = Math.min(a.col, b.col), endCol = Math.max(a.col, b.col)
        for (let i = startLine; i <= endLine; i++) {
            const line = state.doc.line(i)
            const start = findColumn(line.text, startCol, state.tabSize, true)
            if (start < 0)
                ranges.push(EditorSelection.cursor(line.to))
            else {
                const end = findColumn(line.text, endCol, state.tabSize)
                ranges.push(EditorSelection.range(line.from + start, line.from + end))
            }
        }
    }
    return ranges
}

function getPos(view: EditorView, event: MouseEvent): Pos | null {
    const offset = view.posAtCoords({ x: event.clientX, y: event.clientY })
    if (offset == null) return null
    const line = view.state.doc.lineAt(offset)
    const off = offset - line.from
    const col = off > MaxOff ? -1
        : off === line.length
            ? Math.round(Math.max(0, (event.clientX - (view.caretCoords(line.from)?.left ?? event.clientX)) / Math.max(1, view.oracle.charWidth)))
            : countColumn(line.text, view.state.tabSize, off)
    return { line: line.number, col, off }
}

function posOfOffset(view: EditorView, offset: number): Pos {
    const line = view.state.doc.lineAt(offset)
    const off = offset - line.from
    return { line: line.number, col: off > MaxOff ? -1 : countColumn(line.text, view.state.tabSize, off), off }
}

export function rectangleSelectionStyle(view: EditorView, event: MouseEvent): MouseSelectionStyle | null {
    // Shift+Alt:列选从当前主选区锚点拉到鼠标处(Monaco columnSelect 同)
    let start = event.shiftKey ? posOfOffset(view, view.state.selection.main.anchor) : getPos(view, event)
    if (!start) return null
    let startSel = view.state.selection
    return {
        // Monaco 列选出了左右沿:按鼠标列(可超出可见区)选,再 reveal,所以每动一下鼠标往外滚一截
        outsideX: 'column',
        update(docChanged) {
            if (docChanged) {
                start = (event.shiftKey ? null : getPos(view, event)) || start
                startSel = view.state.selection
            }
        },
        get(event) {
            const cur = getPos(view, event)
            if (!cur || !start) return startSel
            const ranges = rectangleFor(view.state, start, cur)
            if (!ranges.length) return startSel
            // Monaco 列选总是替换选区(Alt 在这里是列选键的一部分,不是「追加」)
            return EditorSelection.create(ranges)
        },
    }
}

/**
 * 是否列选。对齐 Monaco ViewController.dispatchMouse:非 Linux 中键(Linux 中键是粘贴主选区);
 * multiCursorModifier=alt(默认):Shift+Alt+左键;=ctrlCmd:Shift+Ctrl/Cmd+左键 和 Alt+左键;选项 columnSelection 开着:单击拖选就是列选。
 * 不给 view 时只认默认选项(Shift+Alt+左键)。
 */
export function isRectangleMouseEvent(event: MouseEvent, view?: EditorView): boolean {
    // 中键:scrollOnMiddleClick 开着时归自动滚动(middlescroll.ts),不列选(Monaco dispatchMouse)
    if (event.button === 1) return !browser.linux && !(view && boolOption(view.state, 'scrollOnMiddleClick', false))
    if (event.button !== 0) return false
    if (!view) return !!event.altKey && !!event.shiftKey
    if (event.detail >= 2) return false // 双击 / 三击是选词 / 选行
    // 按着多光标修饰键:单按 = 加光标,加 Shift = 列选;同时按着另一类修饰键什么也不做
    if (hasMultiCursorModifier(view, event)) return !hasNonMultiCursorModifier(view, event) && event.shiftKey
    // multiCursorModifier=ctrlCmd 时 Alt 是列选键
    if (event.altKey) return true
    return boolOption(view.state, 'columnSelection', false)
}

/**
 * 跳定义单击:正常落光标,松开且没拖动时交给注册的处理者。
 * 触发 = 修饰键 + 左键;mouseMiddleClickAction 为 'ctrlLeftClick' 时中键等同 Ctrl/Cmd+左键(Monaco ClickLinkMouseEvent),
 * 'openLink' 只开链接(link.ts),不跳定义(Monaco GotoDefinitionAtPosition 要 isLeftClick)。
 */
function armDefinitionClick(view: EditorView, event: MouseEvent) {
    const defs = view.state.facet(clickDefinitionHandler)
    const asLeft = event.button === 0 ? hasDefinitionModifier(view, event)
        : event.button === 1 && getOption(view.state, 'mouseMiddleClickAction') === 'ctrlLeftClick'
    if (!defs.length || event.detail > 1 || event.shiftKey || !asLeft) return
    const doc = view.contentDOM.ownerDocument
    const onUp = (up: MouseEvent) => {
        doc.removeEventListener('mouseup', onUp, true)
        if (dist(event, up) > 4) return
        const pos = view.posAtCoords({ x: up.clientX, y: up.clientY })
        if (pos == null) return
        for (const h of defs) if (h(view, pos)) break
    }
    doc.addEventListener('mouseup', onUp, true)
}

export function handleMouseDown(view: EditorView, event: MouseEvent): boolean {
    view.observer.forceFlush()
    if (view.inputState.lastTouchTime > Date.now() - 2000) return false
    // 点折叠占位 ⋯:展开(Monaco inline-folded 点击同),光标留在占位处
    const target = event.target as Element | null
    const ph = event.button === 0 && !event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey
        ? target?.closest?.('.cm-foldPlaceholder') : null
    if (ph) {
        const pos = view.posFromDOM(ph, 0)
        const eff = unfoldEffectAt(view.state, pos)
        if (eff) {
            if (view.root.activeElement !== view.contentDOM) view.contentDOM.focus({ preventScroll: true })
            view.dispatch(view.state.update({ effects: eff, selection: EditorSelection.cursor(pos), userEvent: 'select.pointer' }))
            return true
        }
    }
    let style: MouseSelectionStyle | null = null
    if (isRectangleMouseEvent(event, view))
        style = rectangleSelectionStyle(view, event)
    if (!style && event.button === 0)
        style = basicMouseSelection(view, event)
    if (!style) {
        view.inputState.setSelectionOrigin('select.pointer')
        if (event.button === 1) armDefinitionClick(view, event)
        return false
    }
    const mustFocus = view.root.activeElement !== view.contentDOM
    if (mustFocus) view.contentDOM.focus({ preventScroll: true })
    const mouseSel = new MouseSelection(view, event, style, mustFocus)
    view.inputState.mouseSelection = mouseSel
    mouseSel.start(event)
    armDefinitionClick(view, event)
    // 自己管拖放(不走原生 HTML5 拖拽),所以按下总是 preventDefault
    return true
}

// —— 行号区:按下选整行,拖动按整行扩,Shift+点从当前锚点扩到该行(对齐 Monaco lineSelect / lineSelectDrag)——

function lineAtClientY(view: EditorView, y: number): number | null {
    const cr = view.contentDOM.getBoundingClientRect()
    const sr = view.scrollDOM.getBoundingClientRect()
    // 出了上下沿就夹到可见首/末行(自动滚动时鼠标在编辑器外)
    const cy = Math.max(sr.top + 1, Math.min(sr.bottom - 1, y))
    const pos = view.posAtCoords({ x: cr.left + 1, y: cy })
    return pos == null ? null : view.state.doc.lineAt(pos).number
}

export function lineNumberSelectionStyle(view: EditorView, event: MouseEvent): MouseSelectionStyle | null {
    const startLine = lineAtClientY(view, event.clientY)
    if (startLine == null) return null
    let startSel = view.state.selection
    const shiftAnchor = event.shiftKey ? startSel.main.anchor : null
    const lineEnd = (n: number) => {
        const doc = view.state.doc
        return n < doc.lines ? doc.line(n + 1).from : doc.length
    }
    return {
        update(docChanged) {
            if (docChanged) startSel = view.state.selection
        },
        get(ev, _extend, multiple) {
            const doc = view.state.doc
            const cur = Math.min(doc.lines, lineAtClientY(view, ev.clientY) ?? startLine)
            let range: SelectionRange
            if (shiftAnchor != null) {
                const anchorLine = doc.lineAt(shiftAnchor).number
                range = EditorSelection.range(shiftAnchor, cur < anchorLine ? doc.line(cur).from : lineEnd(cur))
            }
            else if (cur >= startLine) range = EditorSelection.range(doc.line(startLine).from, lineEnd(cur))
            else range = EditorSelection.range(lineEnd(startLine), doc.line(cur).from)
            if (multiple) return startSel.addRange(range)
            return EditorSelection.create([range])
        },
    }
}

/** 装行号区鼠标(捕获阶段,先于行号元素自己的 onmousedown)。折叠箭头不拦。返回卸载函数 */
export function gutterMouseSelection(view: EditorView): () => void {
    const onDown = (e: MouseEvent) => {
        if (e.button !== 0) return
        const t = e.target as Element | null
        // 嵌在里面的编辑器(peek 预览)的行号区归它自己
        if (!t?.closest?.('.cm-gutters') || t.closest('.cm-foldMarker-active') || t.closest('.cm-editor') !== view.dom) return
        const style = lineNumberSelectionStyle(view, e)
        if (!style) return
        e.preventDefault()
        e.stopPropagation()
        if (view.root.activeElement !== view.contentDOM) view.contentDOM.focus({ preventScroll: true })
        view.inputState.mouseSelection?.destroy()
        const ms = new MouseSelection(view, e, style, true, true)
        view.inputState.mouseSelection = ms
        ms.start(e)
    }
    view.dom.addEventListener('mousedown', onDown, true)
    return () => view.dom.removeEventListener('mousedown', onDown, true)
}
