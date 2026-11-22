// 滚轮 —— 照 Monaco 0.52 自己算滚动量,不走浏览器原生滚动。
// 公式:base/browser/mouseEvent.js StandardWheelEvent(事件 → 「格」)+
// base/browser/ui/scrollbar/scrollableElement.js _onMouseWheel(格 × 50px,⌥ ×5,主轴,Win/Linux ⇧ 转横向)。
// 实测(/tmp/lc-hunt/r6/H/wheel-probe.ts,headless Chrome):鼠标一格 deltaY=100/wheelDeltaY=-120 → Monaco 50px、
// 原生 100px;触控板连续小 delta(wheelDeltaY≈3×deltaY)→ Monaco 约 1.25×原生,不会变慢。
// 平滑滚动 Monaco 默认关(smoothScrolling:false → 滚动时长 0),这里直接写 scrollTop。

export interface WheelDelta { x: number, y: number }

/** 读自编辑器选项(mouseWheelScrollSensitivity / fastScrollSensitivity / scrollPredominantAxis / smoothScrolling),缺省 = Monaco 默认 */
export interface WheelOptions {
    /** mouseWheelScrollSensitivity,默认 1 */
    sensitivity?: number
    /** fastScrollSensitivity(⌥ 加速倍率),默认 5 */
    fastSensitivity?: number
    /** scrollPredominantAxis,默认 true */
    predominantAxis?: boolean
    /** smoothScrolling:给了就由它写滚动位置(动画),没给直接写 scrollTop / scrollLeft */
    scrollTo?: (top: number, left: number) => void
    /** 动画进行中时的「终点」(Monaco getFutureScrollPosition),连续滚轮在终点上累加;没给就用当前位置 */
    futurePosition?: () => { top: number, left: number }
}

type LegacyWheel = WheelEvent & { wheelDeltaX?: number, wheelDeltaY?: number, wheelDelta?: number }

const SCROLL_WHEEL_SENSITIVITY = 50
const FAST_SCROLL_SENSITIVITY = 5

const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
const isFirefox = ua.indexOf('Firefox') >= 0
const isChrome = ua.indexOf('Chrome') >= 0
const isSafari = !isChrome && ua.indexOf('Safari') >= 0
const platform = typeof navigator !== 'undefined' ? navigator.platform : ''
const isMac = /Mac|iPhone|iPad/.test(platform)
const isWindows = /Win/.test(platform)
// Chrome ≤122 的 wheelDelta 没乘 devicePixelRatio(Monaco 同款判断)
const chromeMajor = isChrome ? Number((/Chrome\/(\d+)/.exec(ua) || [0, 123])[1]) : 123
const factorDPR = isChrome && chromeMajor <= 122

/** StandardWheelEvent:事件 → 「格」(向下滚为负,和 Monaco 一样)。优先读老的 wheelDeltaX/Y(Chrome/Safari 有)。 */
export function wheelDelta(e: WheelEvent, mac = isMac): WheelDelta {
    const ev = e as LegacyWheel
    const dpr = (e.view as Window | null)?.devicePixelRatio || 1
    const tick = factorDPR ? 120 * dpr : 120
    let x = 0
    let y = 0
    if (typeof ev.wheelDeltaY !== 'undefined') y = ev.wheelDeltaY / tick
    else if (e.type === 'wheel') y = e.deltaMode === 1 ? (isFirefox && !mac ? -e.deltaY / 3 : -e.deltaY) : -e.deltaY / 40
    if (typeof ev.wheelDeltaX !== 'undefined') x = isSafari && isWindows ? -(ev.wheelDeltaX / 120) : ev.wheelDeltaX / tick
    else if (e.type === 'wheel') x = e.deltaMode === 1 ? (isFirefox && !mac ? -e.deltaX / 3 : -e.deltaX) : -e.deltaX / 40
    if (y === 0 && x === 0 && ev.wheelDelta) y = ev.wheelDelta / tick
    return { x, y }
}

/** _onMouseWheel 的位移部分:格 → 像素位移(正 = 往下/往右滚)。 */
export function wheelScrollDelta(e: WheelEvent, mac = isMac, opts: WheelOptions = {}): WheelDelta {
    let { x: dx, y: dy } = wheelDelta(e, mac)
    const sensitivity = opts.sensitivity ?? 1
    dx *= sensitivity
    dy *= sensitivity
    // scrollPredominantAxis(默认 true):只滚主轴,斜着滑不会两边一起动
    if (opts.predominantAxis !== false) {
        if (Math.abs(dy) >= Math.abs(dx)) dx = 0
        else dy = 0
    }
    // Win/Linux 按 ⇧ 竖转横;Mac 由系统转好了(Monaco 注释:handled at a higher level on Mac)
    if (!mac && e.shiftKey && !dx) { dx = dy; dy = 0 }
    // ⌥ 快速滚动(fastScrollSensitivity 默认 5)
    if (e.altKey) { const f = opts.fastSensitivity ?? FAST_SCROLL_SENSITIVITY; dx *= f; dy *= f }
    // -0.3 → -1、0.3 → 1:慢速触控板也至少滚 1px
    const px = (d: number) => { const v = SCROLL_WHEEL_SENSITIVITY * d; return d ? -(v < 0 ? Math.floor(v) : Math.ceil(v)) : 0 }
    return { x: px(dx), y: px(dy) }
}

function scrollableInside(el: Element, root: Element, skip: Element, d: WheelDelta): 'none' | 'native' | 'edge' {
    // 编辑器里自带滚动条的浮层(hover 卡、补全详情、peek 列表…):需要滚动条的就归它自己,
    // 到头了也吞掉,不传给编辑器(Monaco hover 的 consumeMouseWheelIfScrollbarIsNeeded)。
    for (let n: Element | null = el; n && n !== root; n = (n as Element).parentElement) {
        if (n === skip) continue
        const h = n as HTMLElement
        const needY = d.y !== 0 && h.scrollHeight > h.clientHeight
        const needX = d.x !== 0 && h.scrollWidth > h.clientWidth
        if (!needY && !needX) continue
        const cs = getComputedStyle(h)
        const okY = needY && /auto|scroll/.test(cs.overflowY)
        const okX = needX && /auto|scroll/.test(cs.overflowX)
        if (!okY && !okX) continue
        const canY = okY && (d.y > 0 ? h.scrollTop + h.clientHeight < h.scrollHeight - 0.5 : h.scrollTop > 0)
        const canX = okX && (d.x > 0 ? h.scrollLeft + h.clientWidth < h.scrollWidth - 0.5 : h.scrollLeft > 0)
        return canY || canX ? 'native' : 'edge'
    }
    return 'none'
}

/** 挂在 view.dom 上(Monaco 听 viewDomNode:行号栏、minimap 上滚也滚编辑器)。 */
export function handleWheel(root: HTMLElement, scroller: HTMLElement, e: WheelEvent, mac = isMac, opts: WheelOptions = {}): void {
    // 嵌套编辑器(peek 里的)已经处理过
    if (e.defaultPrevented) return
    const d = wheelScrollDelta(e, mac, opts)
    if (!d.x && !d.y) return
    const inner = e.target instanceof Element ? scrollableInside(e.target, root, scroller, d) : 'none'
    if (inner === 'native') return
    if (inner === 'edge') { e.preventDefault(); return }
    if (opts.scrollTo) {
        // smoothScrolling:在动画终点上累加,夹进可滚范围;终点没动 = 滚到头了,放行
        const f = opts.futurePosition?.() ?? { top: scroller.scrollTop, left: scroller.scrollLeft }
        const maxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight)
        const maxLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth)
        const top = Math.min(maxTop, Math.max(0, f.top + d.y))
        const left = Math.min(maxLeft, Math.max(0, f.left + d.x))
        if (top !== f.top || left !== f.left) {
            opts.scrollTo(top, left)
            e.preventDefault()
            e.stopPropagation()
        }
        return
    }
    const top0 = scroller.scrollTop
    const left0 = scroller.scrollLeft
    if (d.y) scroller.scrollTop = top0 + d.y
    if (d.x) scroller.scrollLeft = left0 + d.x
    // 真滚动了才吞事件;滚到头放行,让外层页面接着滚(Monaco alwaysConsumeMouseWheel 默认 false)
    if (scroller.scrollTop !== top0 || scroller.scrollLeft !== left0) {
        e.preventDefault()
        e.stopPropagation()
    }
}
