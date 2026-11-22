// placeholder 选项(Monaco PlaceholderContentWidget):文档为空时在第一行显示一行灰字。
// Monaco 只在模型完全为空(长度 0)时显示,不挡鼠标,字体跟编辑器;选项运行时可换。
import type { EditorView } from '../view/editorview'
import { linePadLeft } from '../view/linepad'
import { getOption } from '../options'

export function placeholderLayer(view: EditorView): () => void {
    const doc = view.dom.ownerDocument
    const el = doc.createElement('div')
    el.className = 'cm-placeholder'
    el.setAttribute('aria-hidden', 'true')
    el.style.display = 'none'
    view.scrollDOM.appendChild(el)
    const draw = () => {
        const text = getOption(view.state, 'placeholder') as string | undefined
        if (!text || view.state.doc.length > 0) { el.style.display = 'none'; return }
        if (el.textContent !== text) el.textContent = text
        const sr = view.scrollDOM.getBoundingClientRect()
        const cr = view.contentDOM.getBoundingClientRect()
        const padL = linePadLeft(view)
        const left = cr.left - sr.left + view.scrollDOM.scrollLeft + padL
        const top = cr.top - sr.top + view.scrollDOM.scrollTop + view.lineBlockAt(0).top
        el.style.cssText = `display:block;left:${left}px;top:${top}px;max-width:calc(100% - ${left}px)`
    }
    const offTr = view.onViewUpdate(() => draw())
    const offGeo = view.onGeometry(() => draw())
    draw()
    return () => { offTr(); offGeo(); el.remove() }
}
