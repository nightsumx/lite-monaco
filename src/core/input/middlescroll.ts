// scrollOnMiddleClick —— 照 Monaco contrib/middleScroll/MiddleScrollController:
//   选项开着时,中键按下 = 在按下处立一个点,开始"自动滚动会话"(stopPropagation + preventDefault:不再列选 / 粘贴选区)。
//   会话里每帧按鼠标离起点的偏移滚动:偏移先去掉 5px 死区(withThreshold),再 × (帧间隔 / 32ms) 加到 scrollLeft / scrollTop。
//   结束:再按任意鼠标键;任意按键;中键松开且这一轮真滚动过(没动过就是"点一下进入、移动鼠标控制速度"的模式)。
//   会话期间 view.dom 带 data-scroll-direction(n/s/w/e 的组合)和 cm-middleScrolling(CSS 里 cursor: all-scroll)。
// 每次事件现读选项,运行时 updateOptions 换了立即生效;关闭时不拦中键。
import type { EditorView } from '../view/editorview'
import { getOption } from '../options'

const THRESHOLD = 5
const FRAME_MS = 32

function withThreshold(v: number): number {
    return v > THRESHOLD ? v - THRESHOLD : v < -THRESHOLD ? v + THRESHOLD : 0
}

export function middleScrollSession(view: EditorView): () => void {
    const dom = view.dom
    const doc = dom.ownerDocument
    const win = doc.defaultView
    let session: { x0: number, y0: number, x: number, y: number, didScroll: boolean, dot: HTMLElement, raf: number, last: number } | null = null

    const stop = () => {
        if (!session) return
        const s = session
        session = null
        if (s.raf) (win?.cancelAnimationFrame ?? clearTimeout)(s.raf)
        s.dot.remove()
        dom.classList.remove('cm-middleScrolling')
        dom.removeAttribute('data-scroll-direction')
        win?.removeEventListener('mousemove', onMove, true)
    }
    const onMove = (e: MouseEvent) => {
        if (!session) return
        session.x = e.pageX
        session.y = e.pageY
        const dx = withThreshold(session.x - session.x0), dy = withThreshold(session.y - session.y0)
        dom.setAttribute('data-scroll-direction', (dy < 0 ? 'n' : dy > 0 ? 's' : '') + (dx < 0 ? 'w' : dx > 0 ? 'e' : ''))
    }
    const frame = () => {
        const s = session
        if (!s) return
        const now = Date.now()
        const k = (now - s.last) / FRAME_MS
        s.last = now
        const dx = withThreshold(s.x - s.x0) * k, dy = withThreshold(s.y - s.y0) * k
        if (dx || dy) {
            view.scrollDOM.scrollLeft += dx
            view.scrollDOM.scrollTop += dy
            s.didScroll = true
        }
        s.raf = schedule()
    }
    const schedule = (): number => (win?.requestAnimationFrame ? win.requestAnimationFrame(frame) : setTimeout(frame, 16) as unknown as number)

    const onDown = (e: MouseEvent) => {
        if (!getOption(view.state, 'scrollOnMiddleClick')) { stop(); return }
        if (session) { stop(); return } // 会话中再按任意键 = 结束(这一下照常交给编辑器)
        if (e.button !== 1) return
        e.stopPropagation()
        e.preventDefault()
        const r = dom.getBoundingClientRect()
        const dot = doc.createElement('div')
        dot.className = 'cm-middleScrollDot'
        dot.setAttribute('aria-hidden', 'true')
        dot.style.cssText = `left:${e.clientX - r.left}px;top:${e.clientY - r.top}px`
        dom.appendChild(dot)
        session = { x0: e.pageX, y0: e.pageY, x: e.pageX, y: e.pageY, didScroll: false, dot, raf: 0, last: Date.now() }
        dom.classList.add('cm-middleScrolling')
        dom.setAttribute('data-scroll-direction', '')
        win?.addEventListener('mousemove', onMove, true)
        session.raf = schedule()
    }
    const onUp = (e: MouseEvent) => { if (session?.didScroll && e.button === 1) stop() }
    const onKey = () => stop()
    dom.addEventListener('mousedown', onDown, true)
    doc.addEventListener('mouseup', onUp, true)
    dom.addEventListener('keydown', onKey, true)
    return () => {
        stop()
        dom.removeEventListener('mousedown', onDown, true)
        doc.removeEventListener('mouseup', onUp, true)
        dom.removeEventListener('keydown', onKey, true)
    }
}
