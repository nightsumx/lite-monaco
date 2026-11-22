// CM7 竖向滚动条 —— Monaco 模型:最右 14px 列 = overview 标记铺底 + 方角 thumb 浮其上。
//
// 布局(flex 兄弟):content | minimap | scrollbar。原生条藏掉(宽 0),交互走本列 pointer。
// 为何自绘:原生条贴在 .cm-scroller 右缘,minimap 作 flex 兄弟时条会被夹在正文与缩略图之间。

import type { EditorView } from '../view/editorview'
import type { Transaction } from '../model/state'
import type { RulerPalette } from './ruler'
import { QueryType } from '../view/heightmap'
import { rulerLayout } from './ruler'
import { collectMarks } from './overviewruler'
import { attachOverlay } from '../feature/overlay'
import { drawOverview, trackTextualWords, type OverviewSourceOptions } from './overviewpaint'
import { getOption } from '../options'
import { ScrollbarVisibility } from '../options/types'

export const BAR_W = 14
const THUMB_MIN = 20
const MARK_H = 2

// Monaco ScrollableElement 的 visibility auto(竖条横条共用一份状态):鼠标在编辑器上、滚动、拖动时显示;
// 滚动后鼠标不在编辑器上就 500ms 后藏(HIDE_TIMEOUT),鼠标离开立刻藏;藏 = 800ms 线性淡出(.invisible.fade)。
// 显示晚一个 setTimeout 0 才换类(Monaco:不然 CSS 过渡不播)。
const HIDE_TIMEOUT = 500
interface AutoHide { els: Set<HTMLElement>, over: boolean, dragging: boolean, visible: boolean, reveal(): void, hide(): void, dispose(): void }
const autoHides = new WeakMap<EditorView, AutoHide>()
export function scrollbarAutoHide(view: EditorView, el: HTMLElement): { drag(on: boolean): void, dispose(): void } {
    let s = autoHides.get(view)
    if (!s) {
        const win = view.dom.ownerDocument.defaultView ?? window
        let revealTimer = 0, hideTimer = 0
        const paint = (visible: boolean, fade: boolean) => {
            for (const e of st.els) {
                e.classList.toggle('cm-sb-visible', visible)
                e.classList.toggle('cm-sb-invisible', !visible)
                e.classList.toggle('cm-sb-fade', fade)
            }
        }
        const st: AutoHide = {
            els: new Set(), over: false, dragging: false, visible: false,
            reveal() {
                if (!st.visible) {
                    st.visible = true
                    if (!revealTimer) revealTimer = win.setTimeout(() => { revealTimer = 0; paint(true, false) }, 0)
                }
                if (st.over || st.dragging) return
                win.clearTimeout(hideTimer)
                hideTimer = win.setTimeout(() => st.hide(), HIDE_TIMEOUT)
            },
            hide() {
                if (st.over || st.dragging) return
                win.clearTimeout(revealTimer)
                revealTimer = 0
                if (!st.visible) return
                st.visible = false
                paint(false, true)
            },
            dispose() {
                win.clearTimeout(revealTimer)
                win.clearTimeout(hideTimer)
                view.dom.removeEventListener('mouseover', onOver)
                view.dom.removeEventListener('mouseleave', onLeave)
                view.scrollDOM.removeEventListener('scroll', onScroll)
                autoHides.delete(view)
            },
        }
        const onOver = () => { st.over = true; st.reveal() }
        const onLeave = () => { st.over = false; st.hide() }
        const onScroll = () => st.reveal()
        view.dom.addEventListener('mouseover', onOver)
        view.dom.addEventListener('mouseleave', onLeave)
        view.scrollDOM.addEventListener('scroll', onScroll, { passive: true })
        autoHides.set(view, s = st)
    }
    const st = s
    st.els.add(el)
    el.classList.add(st.visible ? 'cm-sb-visible' : 'cm-sb-invisible')
    return {
        drag(on) {
            st.dragging = on
            if (on) st.reveal()
            else st.hide()
        },
        dispose() {
            st.els.delete(el)
            if (!st.els.size) st.dispose()
        },
    }
}

// 点箭头一下滚多少:Monaco 的箭头 onMouseWheel(deltaY ±1),SCROLL_WHEEL_SENSITIVITY 50 × mouseWheelScrollSensitivity
export const ARROW_SCROLL_STEP = 50

/** scrollbar 选项(computed,Monaco 形态);没有 liteMonaco() 时是 Monaco 默认值 */
export function scrollbarOf(state: import('../model/state').EditorState) {
    return getOption(state, 'scrollbar')
}

export interface VScrollGeometry {
    hidden: boolean
    thumbHeight: number
    thumbTop: number
}

// thumb 高 = 可视²/内容,与 scrollTop 正交;top = 滚程占比 × 轨道余量。
// arrow:两端箭头各占的高(Monaco ScrollbarState arrowSize,verticalHasArrows 时 = scrollbar.arrowSize,否则 0):
// 滑块只在中间 vh − 2·arrow 里活动,位置整体下移 arrow。
export function vScrollGeometry(vh: number, ch: number, st: number, arrow = 0): VScrollGeometry {
    if (ch <= vh) return { hidden: true, thumbHeight: 0, thumbTop: 0 }
    const track = Math.max(0, vh - 2 * arrow)
    // Monaco ScrollbarState:滑块高取整,位置四舍五入
    const thumbHeight = Math.round(Math.max(THUMB_MIN, Math.floor((track * vh) / ch)))
    const thumbTop = arrow + Math.round((st * (track - thumbHeight)) / (ch - vh))
    return { hidden: false, thumbHeight, thumbTop }
}

export interface VScrollbarOptions {
    marks?: boolean // overview 标记(光标/搜索/诊断/同词/选中串/括号);默认 true
    /** 概览尺的标记来源(palette.overview 给了时照 Monaco decorationsOverviewRuler 画,见 overviewpaint.ts) */
    overview?: Omit<OverviewSourceOptions, 'textualWordsLive' | 'bracketOwner'> & { textualWords?: boolean }
}

export function vScrollbarCM7(
    palette: RulerPalette,
    opts: VScrollbarOptions = {},
): (view: EditorView) => () => void {
    const showMarks = opts.marks !== false
    return (view: EditorView) => {
        let wrap: HTMLElement
        let thumb: HTMLElement
        let canvas: HTMLCanvasElement | null = null
        let words: ReturnType<typeof trackTextualWords> | null = null
        let dragging = false
        let dragStartY = 0
        let dragStartScroll = 0
        let autoHide: ReturnType<typeof scrollbarAutoHide>
        // Monaco ScrollDecorationViewPart:scrollTop > 0 时编辑器顶部的内阴影(宽 = 编辑器宽 − 竖条宽)
        let shadow: HTMLElement
        let shadowOn = false
        let arrowUp: HTMLElement
        let arrowDown: HTMLElement
        // 当前生效的 scrollbar 选项(每次 redraw 前读一遍,运行时换选项下一帧就生效)
        let arrow = 0 // 两端箭头各占的高(verticalHasArrows 时 arrowSize,否则 0)
        let size = BAR_W
        let byPage = false
        const applyOptions = (v: EditorView) => {
            const sb = scrollbarOf(v.state)
            size = sb.verticalScrollbarSize
            arrow = sb.verticalHasArrows ? sb.arrowSize : 0
            byPage = sb.scrollByPage
            const slider = Math.min(sb.verticalSliderSize, size)
            wrap.style.width = `${size}px`
            shadow.style.right = `${size}px`
            // Monaco:滑块在条里居中(left = floor((scrollbarSize − sliderSize) / 2))
            thumb.style.width = `${slider}px`
            thumb.style.right = 'auto'
            thumb.style.left = `${Math.floor((size - slider) / 2)}px`
            // vertical: auto = 缺省(鼠标在编辑器上才显,淡出);visible = 一直显;hidden = 不画滑块和箭头
            wrap.classList.toggle('cm-sb-hidden', sb.vertical === ScrollbarVisibility.Hidden)
            thumb.classList.toggle('cm-sb-always', sb.vertical === ScrollbarVisibility.Visible)
            wrap.classList.toggle('cm-sb-has-arrows', !!arrow)
            for (const a of [arrowUp, arrowDown]) {
                a.style.display = arrow ? '' : 'none'
                a.style.width = `${size}px`
                a.style.height = `${arrow}px`
            }
            for (const m of wrap.querySelectorAll<HTMLElement>(':scope > .cm-scrollbar-mark')) m.style.width = `${size}px`
        }

        const applyThumb = (v: EditorView) => {
            const vh = v.scrollDOM.clientHeight
            const ch = v.metrics.height
            const st = v.scrollDOM.scrollTop
            // Monaco ScrollDecorationViewPart:scrollbar.useShadows && scrollTop > 0
            const wantShadow = st > 0 && scrollbarOf(v.state).useShadows
            if (wantShadow !== shadowOn) shadow.classList.toggle('cm-visible', shadowOn = wantShadow)
            const g = vScrollGeometry(vh, ch, st, arrow)
            if (g.hidden) {
                thumb.style.display = 'none'
                return
            }
            thumb.style.display = 'block'
            thumb.style.height = `${g.thumbHeight}px`
            thumb.style.top = `${g.thumbTop}px`
        }

        const drawMarks = (v: EditorView) => {
            if (!showMarks) return
            const trackH = v.scrollDOM.clientHeight
            if (!trackH) return
            if (canvas) {
                const o = opts.overview ?? {}
                drawOverview(v, canvas, size, trackH, palette, {
                    ...o, textualWordsLive: o.textualWords !== false && !!words?.live(), bracketOwner: v,
                })
                return
            }
            const total = v.metrics.height || 1
            const lineTop = (line: number) => {
                const pos = v.state.doc.line(Math.min(line, v.state.doc.lines)).from
                const block = v.heightMap.lineAt(pos, QueryType.ByPos, v.oracle, 0, 0)
                return (block.top / total) * trackH
            }
            const points = rulerLayout(collectMarks(v.state), lineTop, palette)
            wrap.querySelectorAll(':scope > .cm-scrollbar-mark').forEach(n => n.remove())
            for (const p of points) {
                const m = document.createElement('div')
                m.className = 'cm-scrollbar-mark'
                m.style.top = `${p.top}px`
                m.style.height = `${MARK_H}px`
                m.style.width = `${size}px`
                m.style.backgroundColor = p.color
                wrap.appendChild(m)
            }
        }

        // y 在轨道内 → scrollTop,使 thumb 中心对准 y。
        const scrollToY = (v: EditorView, y: number) => {
            const vh = v.scrollDOM.clientHeight
            const ch = v.metrics.height
            if (ch <= vh) return
            const g = vScrollGeometry(vh, ch, 0, arrow)
            const maxTop = vh - 2 * arrow - g.thumbHeight
            const maxScroll = ch - vh
            const t = Math.max(0, Math.min(maxTop, y - arrow - g.thumbHeight / 2))
            v.scrollDOM.scrollTop = maxTop <= 0 ? 0 : (t / maxTop) * maxScroll
        }

        const off = attachOverlay(view, {
            mount(v) {
                v.dom.querySelectorAll(':scope > .cm-scrollbar, :scope > .cm-scroll-decoration').forEach(n => n.remove())
                shadow = document.createElement('div')
                shadow.className = 'cm-scroll-decoration'
                shadow.setAttribute('aria-hidden', 'true')
                v.dom.appendChild(shadow)
                wrap = document.createElement('div')
                wrap.className = 'cm-scrollbar'
                thumb = document.createElement('div')
                thumb.className = 'cm-scrollbar-thumb'
                autoHide = scrollbarAutoHide(v, thumb)
                if (showMarks && palette.overview) {
                    // 标记画在 thumb 下面(Monaco:概览尺 canvas 在滚动条 slider 之下)
                    canvas = document.createElement('canvas')
                    canvas.className = 'cm-scrollbar-overview'
                    canvas.setAttribute('aria-hidden', 'true')
                    wrap.appendChild(canvas)
                    words = trackTextualWords(v, () => drawMarks(v))
                }
                wrap.appendChild(thumb)
                // 箭头(verticalHasArrows):点一下滚 50px,按住 200ms 后每 1000/24ms 重复(Monaco ScrollbarArrow)
                const mkArrow = (cls: string, dir: 1 | -1) => {
                    const a = document.createElement('div')
                    a.className = `cm-sb-arrow ${cls}`
                    a.setAttribute('aria-hidden', 'true')
                    let t1 = 0, t2 = 0
                    const stop = () => { clearTimeout(t1); clearInterval(t2); window.removeEventListener('pointerup', stop) }
                    a.addEventListener('pointerdown', e => {
                        e.preventDefault()
                        e.stopPropagation()
                        const step = () => { v.scrollDOM.scrollTop += dir * ARROW_SCROLL_STEP * getOption(v.state, 'mouseWheelScrollSensitivity') }
                        step()
                        t1 = window.setTimeout(() => { t2 = window.setInterval(step, 1000 / 24) }, 200)
                        window.addEventListener('pointerup', stop)
                    })
                    return a
                }
                arrowUp = mkArrow('cm-sb-arrow-up', -1)
                arrowDown = mkArrow('cm-sb-arrow-down', 1)
                wrap.append(arrowUp, arrowDown)
                applyOptions(v)
                // 挂 view.dom 末尾 → flex 最右列(minimap 已先挂时在其右)。
                v.dom.appendChild(wrap)

                const onMove = (e: PointerEvent) => {
                    if (!dragging) return
                    const vh = v.scrollDOM.clientHeight
                    const ch = v.metrics.height
                    if (ch <= vh) return
                    const g = vScrollGeometry(vh, ch, 0, arrow)
                    const maxTop = vh - 2 * arrow - g.thumbHeight
                    const maxScroll = ch - vh
                    if (maxTop <= 0) return
                    const dy = e.clientY - dragStartY
                    v.scrollDOM.scrollTop = Math.max(0, Math.min(maxScroll, dragStartScroll + (dy / maxTop) * maxScroll))
                }
                const onUp = () => {
                    dragging = false
                    autoHide.drag(false)
                    thumb.classList.remove('active')
                    window.removeEventListener('pointermove', onMove)
                    window.removeEventListener('pointerup', onUp)
                }
                wrap.addEventListener('pointerdown', e => {
                    e.preventDefault()
                    const y = e.clientY - wrap.getBoundingClientRect().top
                    const top = thumb.offsetTop
                    const th = thumb.offsetHeight
                    if (y < top || y > top + th) {
                        // scrollByPage:点轨道翻一页(Monaco getDesiredScrollPositionFromOffsetPaged),否则直接跳到点的位置
                        if (byPage) v.scrollDOM.scrollTop += (y < top ? -1 : 1) * v.scrollDOM.clientHeight
                        else scrollToY(v, y)
                    }
                    dragging = true
                    autoHide.drag(true)
                    thumb.classList.add('active')
                    dragStartY = e.clientY
                    dragStartScroll = v.scrollDOM.scrollTop
                    window.addEventListener('pointermove', onMove)
                    window.addEventListener('pointerup', onUp)
                })
                return wrap
            },
            redraw(v, tr: Transaction | null) {
                if (tr) words?.update(tr)
                applyOptions(v)
                applyThumb(v)
                drawMarks(v)
            },
            reposition(v) {
                applyThumb(v)
            },
        })
        return () => { off(); words?.dispose(); autoHide.dispose(); shadow.remove() }
    }
}

export { THUMB_MIN, MARK_H }
