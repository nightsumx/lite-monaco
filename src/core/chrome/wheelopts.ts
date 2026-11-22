// scrollbar.handleMouseWheel / scrollbar.alwaysConsumeMouseWheel —— 照 Monaco ScrollableElement._onMouseWheel:
//   handleMouseWheel = false:编辑器根本不听滚轮(不滚,也不吞事件),页面照常滚;
//   alwaysConsumeMouseWheel = true(默认):滚轮落在编辑器上就吞(preventDefault + stopPropagation),
//     哪怕已经滚到头;false:只在这次真滚动了才吞,滚到头放行给外层页面。
// 实际的滚动在 input/wheel.ts(editorview 挂的),这里在 view.dom 上夹它的两头:捕获阶段先挡(handleMouseWheel),
// 冒泡阶段补吞(alwaysConsume)。每次事件现读选项,运行时换选项立即生效。

import type { EditorView } from '../view/editorview'
import { getOption } from '../options'

/** 编辑器自己的滚动面(正文、行号栏、minimap、滚动条);浮层里的列表(补全、查找框)自己滚,不算 */
function onScrollSurface(view: EditorView, t: EventTarget | null): boolean {
    if (!(t instanceof Element)) return false
    if (t === view.dom || view.scrollDOM.contains(t)) return true
    return !!t.closest('.cm-minimap, .cm-scrollbar, .cm-hscrollbar, .cm-gutters')
}

/** 把滚轮增量让给外层:找最近的能滚的祖先,没有就滚窗口 */
function scrollOuter(view: EditorView, e: WheelEvent) {
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? view.scrollDOM.clientHeight : 1
    const dx = e.deltaX * unit, dy = e.deltaY * unit
    for (let n = view.dom.parentElement; n; n = n.parentElement) {
        const cs = getComputedStyle(n)
        const canY = dy && /auto|scroll/.test(cs.overflowY) && n.scrollHeight > n.clientHeight
        const canX = dx && /auto|scroll/.test(cs.overflowX) && n.scrollWidth > n.clientWidth
        if (canY || canX) { n.scrollTop += canY ? dy : 0; n.scrollLeft += canX ? dx : 0; return }
    }
    view.dom.ownerDocument.defaultView?.scrollBy(dx, dy)
}

export function scrollbarWheelOptions(view: EditorView): () => void {
    const onCapture = (e: WheelEvent) => {
        if (e.defaultPrevented || !onScrollSurface(view, e.target)) return
        if (getOption(view.state, 'scrollbar').handleMouseWheel) return
        // 编辑器不处理滚轮:拦下(editorview 的处理见 defaultPrevented 就退),滚动让给外层页面
        e.preventDefault()
        scrollOuter(view, e)
    }
    const onBubble = (e: WheelEvent) => {
        if (e.defaultPrevented || !(e.deltaX || e.deltaY) || !onScrollSurface(view, e.target)) return
        const sb = getOption(view.state, 'scrollbar')
        if (sb.handleMouseWheel && sb.alwaysConsumeMouseWheel) e.preventDefault()
    }
    view.dom.addEventListener('wheel', onCapture, { capture: true, passive: false })
    view.dom.addEventListener('wheel', onBubble, { passive: false })
    return () => {
        view.dom.removeEventListener('wheel', onCapture, { capture: true })
        view.dom.removeEventListener('wheel', onBubble)
    }
}
