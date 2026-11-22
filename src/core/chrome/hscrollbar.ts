// CM7 横向滚动条 —— 几何真源定律的实现出口。
//
// contentWidth 来自 lineWidthMap（模型层度量表，全文档行宽 max），不读 DOM scrollWidth。
// 滚动区域宽度 = lineWidthMap.contentWidth()，设到 contentDOM min-width 撑开 .cm-scroller 的横向 scrollWidth。
// 原生条已藏（宽 0）；自绘 thumb：12px 高（Monaco horizontalScrollbarSize）、方角、Monaco scrollbarSlider 色。
// thumb 几何恒定（contentWidth 不随 scrollTop/scrollLeft 漂移）——定律钉死的那条。
// 对偶 vscrollbar.ts（竖向）。

import type { EditorView } from '../view/editorview'
import type { Transaction } from '../model/state'
import { attachOverlay, type OverlaySpec } from '../feature/overlay'
import { scrollbarAutoHide, scrollbarOf, ARROW_SCROLL_STEP } from './vscrollbar'
import { getOption } from '../options'
import { ScrollbarVisibility } from '../options/types'

const THUMB_MIN = 20 // thumb 最小宽（同 Monaco minSize）
const BAR_H = 12 // 横向条高（px），Monaco horizontalScrollbarSize 默认 12

// §7 横向滚动条几何（纯函数，无 DOM）——定律钉死的那条：thumbWidth 只随 vw/cw 变，与 sl 正交。
//   hidden：内容不溢出（cw ≤ vw）→ 无横向滚动，隐藏。
//   Monaco ScrollbarState(oppositeScrollbarSize = 竖条宽 V):Monaco 的可视宽 / 滚动宽都比我们多一条竖条宽
//   (竖条那 14px 算在 contentWidth 里、scrollWidth 再补 V),track 宽 = vw。
//   thumbWidth = round(max(THUMB_MIN, floor((vw+V)·vw/(cw+V))));thumbLeft = round(sl·(vw−thumbWidth)/(cw−vw))。
//   railRight = editorW − vw：track 只盖 scroller 可视宽，排除右侧 minimap/vscrollbar 列。
//   railLeft = editorW − vw − railRight 的对偶：= gutters 宽（editor 左缘到 scroller 左缘）。
export interface HScrollGeometry {
    hidden: boolean
    thumbWidth: number
    thumbLeft: number
    railRight: number
    railLeft: number
}

export function hScrollGeometry(
    vw: number,
    cw: number,
    sl: number,
    editorW: number,
    railLeft = 0,
    opposite = 0,
    arrow = 0, // horizontalHasArrows 时两端箭头各占的宽(scrollbar.arrowSize)
): HScrollGeometry {
    if (cw <= vw) return { hidden: true, thumbWidth: 0, thumbLeft: 0, railRight: 0, railLeft }
    const track = Math.max(0, vw - 2 * arrow)
    const thumbWidth = Math.round(Math.max(THUMB_MIN, Math.floor(((vw + opposite) * track) / (cw + opposite))))
    const thumbLeft = arrow + Math.round((sl * (track - thumbWidth)) / (cw - vw))
    const railRight = editorW - vw - railLeft
    return { hidden: false, thumbWidth, thumbLeft, railRight, railLeft }
}

// opposite:右侧竖条 / 概览列的宽(Monaco verticalScrollbarSize),没有那一列时 0
export function hScrollbarCM7(opposite = 14): (view: EditorView) => () => void {
    return (view: EditorView) => {
        let wrap: HTMLElement
        let thumb: HTMLElement
        let dragging = false
        let dragStartX = 0
        let dragStartScroll = 0
        let minW = ''
        let arrow = 0
        let byPage = false
        let arrowL: HTMLElement
        let arrowR: HTMLElement
        let opp = opposite
        // 当前 scrollbar 选项(每次 redraw 读):条高 / 滑块高 / 箭头 / 可见性 / 翻页 / 右侧竖条宽
        const applyOptions = (v: EditorView) => {
            const sb = scrollbarOf(v.state)
            const size = sb.horizontalScrollbarSize
            const slider = Math.min(sb.horizontalSliderSize, size)
            arrow = sb.horizontalHasArrows ? sb.arrowSize : 0
            byPage = sb.scrollByPage
            opp = opposite > 0 ? sb.verticalScrollbarSize : 0
            wrap.style.height = `${size}px`
            thumb.style.height = `${slider}px`
            // Monaco:滑块在条里居中(top = floor((scrollbarSize − sliderSize) / 2))
            thumb.style.bottom = 'auto'
            thumb.style.top = `${Math.floor((size - slider) / 2)}px`
            wrap.classList.toggle('cm-sb-hidden', sb.horizontal === ScrollbarVisibility.Hidden)
            thumb.classList.toggle('cm-sb-always', sb.horizontal === ScrollbarVisibility.Visible)
            for (const a of [arrowL, arrowR]) {
                a.style.display = arrow ? '' : 'none'
                a.style.width = `${arrow}px`
                a.style.height = `${size}px`
            }
        }
        let autoHide: ReturnType<typeof scrollbarAutoHide>
        // 版面量只在几何事件(初次 / resize,redraw(null))时读视口宽、编辑器宽、gutter 宽,滚动时只读 scrollLeft,
        // 编辑事务一个都不读:旧做法每个事务先写 contentDOM.minWidth 再 getBoundingClientRect,每次编辑多一次强制回流
        // (实测 32ms / 次)。gutter 变宽 → scrollDOM 变窄 → ResizeObserver → 几何事件
        let vw = 0, ew = 0, rl = 0, sl = 0
        let txn = false
        const measure = (v: EditorView) => {
            vw = v.scrollDOM.clientWidth
            ew = v.dom.clientWidth
            rl = v.scrollDOM.offsetLeft
            sl = v.scrollDOM.scrollLeft
        }

        const apply = (g: HScrollGeometry) => {
            if (g.hidden) {
                wrap.style.display = 'none'
                return
            }
            wrap.style.display = 'block'
            wrap.style.left = `${g.railLeft}px`
            wrap.style.right = `${g.railRight}px`
            thumb.style.width = `${g.thumbWidth}px`
            thumb.style.left = `${g.thumbLeft}px`
        }

        // x 在轨道内 → scrollLeft，使 thumb 中心对准 x。
        const scrollToX = (v: EditorView, x: number) => {
            const vw = v.scrollDOM.clientWidth
            const cw = v.lineWidthMap.contentWidth()
            if (cw <= vw) return
            const thumbW = hScrollGeometry(vw, cw, 0, vw, 0, opp, arrow).thumbWidth
            const maxLeft = vw - 2 * arrow - thumbW
            const maxScroll = cw - vw
            const t = Math.max(0, Math.min(maxLeft, x - arrow - thumbW / 2))
            v.scrollDOM.scrollLeft = maxLeft <= 0 ? 0 : (t / maxLeft) * maxScroll
        }

        const spec: OverlaySpec = {
            mount(v: EditorView) {
                wrap = document.createElement('div')
                wrap.className = 'cm-hscrollbar'
                thumb = document.createElement('div')
                thumb.className = 'cm-hscrollbar-thumb'
                wrap.appendChild(thumb)
                autoHide = scrollbarAutoHide(v, thumb)
                const mkArrow = (cls: string, dir: 1 | -1) => {
                    const a = document.createElement('div')
                    a.className = `cm-sb-arrow ${cls}`
                    a.setAttribute('aria-hidden', 'true')
                    let t1 = 0, t2 = 0
                    const stop = () => { clearTimeout(t1); clearInterval(t2); window.removeEventListener('pointerup', stop) }
                    a.addEventListener('pointerdown', e => {
                        e.preventDefault()
                        e.stopPropagation()
                        const step = () => { v.scrollDOM.scrollLeft += dir * ARROW_SCROLL_STEP * getOption(v.state, 'mouseWheelScrollSensitivity') }
                        step()
                        t1 = window.setTimeout(() => { t2 = window.setInterval(step, 1000 / 24) }, 200)
                        window.addEventListener('pointerup', stop)
                    })
                    return a
                }
                arrowL = mkArrow('cm-sb-arrow-left', -1)
                arrowR = mkArrow('cm-sb-arrow-right', 1)
                wrap.append(arrowL, arrowR)
                applyOptions(v)
                // 挂 view.dom（editor 外壳，不滚）而非 scrollDOM：横向条固定可视底部。
                v.dom.appendChild(wrap)

                const onMove = (e: PointerEvent) => {
                    if (!dragging) return
                    const vw = v.scrollDOM.clientWidth
                    const cw = v.lineWidthMap.contentWidth()
                    if (cw <= vw) return
                    const thumbW = hScrollGeometry(vw, cw, 0, vw, 0, opp, arrow).thumbWidth
                    const maxLeft = vw - 2 * arrow - thumbW
                    const maxScroll = cw - vw
                    if (maxLeft <= 0) return
                    const dx = e.clientX - dragStartX
                    v.scrollDOM.scrollLeft = Math.max(0, Math.min(maxScroll, dragStartScroll + (dx / maxLeft) * maxScroll))
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
                    const x = e.clientX - wrap.getBoundingClientRect().left
                    const left = thumb.offsetLeft
                    const tw = thumb.offsetWidth
                    if (x < left || x > left + tw) {
                        // scrollByPage:点轨道翻一页,否则跳到点的位置
                        if (byPage) v.scrollDOM.scrollLeft += (x < left ? -1 : 1) * v.scrollDOM.clientWidth
                        else scrollToX(v, x)
                    }
                    dragging = true
                    autoHide.drag(true)
                    thumb.classList.add('active')
                    dragStartX = e.clientX
                    dragStartScroll = v.scrollDOM.scrollLeft
                    window.addEventListener('pointermove', onMove)
                    window.addEventListener('pointerup', onUp)
                })
                return wrap
            },
            redraw(v, tr: Transaction | null) {
                applyOptions(v)
                if (!tr) measure(v)
                // 撑开滚动区域：contentDOM min-width = contentWidth（真源）。没变不写
                const cw = v.lineWidthMap.contentWidth()
                const w = `${cw}px`
                if (w !== minW || v.contentDOM.style.minWidth !== w) v.contentDOM.style.minWidth = minW = w
                apply(hScrollGeometry(vw, cw, sl, ew, rl, opp, arrow))
                txn = !!tr
            },
            reposition(v: EditorView) {
                // 事务后紧跟的这一次已在 redraw 里按缓存画过
                if (txn) { txn = false; return }
                sl = v.scrollDOM.scrollLeft
                apply(hScrollGeometry(vw, v.lineWidthMap.contentWidth(), sl, ew, rl, opp, arrow))
            },
        }
        const off = attachOverlay(view, spec)
        return () => { off(); autoHide.dispose() }
    }
}

export { BAR_H, THUMB_MIN }
