// rulers 选项(Monaco IEditorOptions.rulers):在第 N 列画竖标尺线,可带自己的颜色。
// 位置 = 正文左缘 + 列 × 字宽,随横向滚动一起走;列 0 不画(Monaco:column 0 的标尺不渲染)。
import type { EditorView } from '../view/editorview'
import { linePadLeft } from '../view/linepad'
import { getOption } from '../options'

export function rulersLayer(view: EditorView): () => void {
    const doc = view.dom.ownerDocument
    const host = doc.createElement('div')
    host.className = 'cm-rulers'
    host.setAttribute('aria-hidden', 'true')
    host.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0'
    view.scrollDOM.appendChild(host)
    const probe = doc.createElement('span')
    probe.textContent = '0'.repeat(10)
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;font:inherit'
    let chW = 0
    let key = ''
    const draw = () => {
        const rulers = (getOption(view.state, 'rulers') ?? []) as { column: number, color: unknown }[]
        // 没有标尺(默认):什么都不画,也不读布局。每次事务读两次 getBoundingClientRect 会逼出强制重排,打字一字符多花 ~0.15ms
        if (!rulers.some(r => r.column)) {
            if (key !== 'none') { key = 'none'; host.textContent = '' }
            return
        }
        if (!chW) {
            // 量字宽的探针挂进正文再摘掉:不包 ignore 的话 DOM 观察者当成用户改了正文,下一次 flush 就读一遍整行
            view.observer.ignore(() => {
                view.contentDOM.appendChild(probe)
                chW = probe.getBoundingClientRect().width / 10
                probe.remove()
            })
        }
        const cw = chW || view.oracle.charWidth
        const sr = view.scrollDOM.getBoundingClientRect()
        const cr = view.contentDOM.getBoundingClientRect()
        const padL = linePadLeft(view)
        const x0 = cr.left - sr.left + view.scrollDOM.scrollLeft + padL
        const h = Math.max(view.scrollDOM.scrollHeight, view.scrollDOM.clientHeight)
        const next = JSON.stringify([rulers, cw, x0, h])
        if (next === key) return
        key = next
        host.textContent = ''
        for (const r of rulers) {
            if (!r.column) continue
            const el = doc.createElement('div')
            el.className = 'cm-ruler'
            el.style.left = `${Math.round(x0 + r.column * cw)}px`
            el.style.height = `${h}px`
            if (typeof r.color === 'string' && r.color) el.style.background = r.color
            host.appendChild(el)
        }
    }
    const offTr = view.onViewUpdate(() => draw())
    const offGeo = view.onGeometry(() => { chW = 0; key = ''; draw() })
    const onScroll = () => draw()
    view.scrollDOM.addEventListener('scroll', onScroll, { passive: true })
    draw()
    return () => { offTr(); offGeo(); view.scrollDOM.removeEventListener('scroll', onScroll); host.remove() }
}
