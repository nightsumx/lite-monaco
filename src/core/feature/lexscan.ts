// 词法扫的装饰(不可见字符 / #hex 色块 / 行尾空白)共用的壳:只扫视口里的整行,按 doc + 视口缓存。
//
// 这几种装饰只取决于文本,不看选区和字段。旧做法每个新 state 都整篇扫一遍(2 万行文档里扩选一次约 15ms):
// decorations facet 每个新 state 都要重新求值,只动选区的事务也一样。现在文档没变、视口没变 → 原样返回上次的
// 集合(同一个对象,视图的装饰对比也直接跳过);文档或视口变了 → 只重扫视口那几十行。
// 没有 view(单测 / 无挂载)扫全文,按 doc 缓存。

import type { DecorationSet } from '../model/decoration'
import type { Decoration } from '../model/decoration'
import type { EditorState } from '../model/state'
import type { Rope } from '../model/rope'
import { RangeSetBuilder } from '../model/rangeset'
import { pieceText, scanPieces, type ScanWindow } from '../view/scanwindow'

/** text 是 [offset, offset + text.length) 的文档片段,起止都在行边界。 */
export type LexScan = (text: string, offset: number, out: RangeSetBuilder<Decoration>) => void

export function lexicalDecorations(scan: LexScan) {
    const whole = new WeakMap<Rope, DecorationSet>()
    const byView = new WeakMap<object, { doc: Rope, from: number, to: number, win: ScanWindow | undefined, set: DecorationSet }>()
    const build = (doc: Rope, from: number, to: number, win?: ScanWindow) => {
        const b = new RangeSetBuilder<Decoration>()
        // 超长行只扫窗口里那一截(scanwindow.ts);普通行连成一整段
        for (const p of scanPieces(doc, from, to, win)) scan(pieceText(doc, p).text, p.from, b)
        return b.finish()
    }
    return (state: EditorState, view?: { viewport: { from: number, to: number }, scanWindow?: ScanWindow }): DecorationSet => {
        const doc = state.doc
        if (!view) {
            let set = whole.get(doc)
            if (!set) whole.set(doc, set = build(doc, 0, doc.length))
            return set
        }
        const vp = view.viewport
        const from = doc.lineAt(Math.max(0, Math.min(doc.length, vp.from))).from
        const to = doc.lineAt(Math.max(0, Math.min(doc.length, vp.to))).to
        const hit = byView.get(view)
        const win = view.scanWindow
        if (hit && hit.doc === doc && hit.from === from && hit.to === to && hit.win === win) return hit.set
        const set = build(doc, from, to, win)
        byView.set(view, { doc, from, to, win, set })
        return set
    }
}
