// 第一条可见行的 padding-left(参考线 / 标尺 / 占位符把自己对齐到正文左缘用)。
// getComputedStyle 要强制样式重算,这几个层每个事务都画;所以按「会影响这个值的东西」做签名,没变就复用上一次的读数
// (视图根 / 正文的 class 与 style 变量、这条行自己的 class 与 style —— 折行缩进是逐行内联变量)。
import type { EditorView } from './editorview'

const cache = new WeakMap<EditorView, { sig: string, value: number }>()

export function linePadLeft(view: EditorView): number {
    const line = view.contentDOM.querySelector('.cm-line') as HTMLElement | null
    if (!line) return 0
    const sig = `${view.dom.className}|${view.dom.style.cssText}|${view.contentDOM.className}|${line.className}|${line.getAttribute('style') ?? ''}`
    const hit = cache.get(view)
    if (hit && hit.sig === sig) return hit.value
    const value = parseFloat(getComputedStyle(line).paddingLeft) || 0
    cache.set(view, { sig, value })
    return value
}
