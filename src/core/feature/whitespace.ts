// 行尾空白、tab 对齐。词法扫，不解析源码。

import type { DecorationSet } from '../model/decoration'
import type { EditorState } from '../model/state'
import type { Rope } from '../model/rope'
import { Decoration } from '../model/decoration'
import { RangeSetBuilder } from '../model/rangeset'
import { isFullWidthCharacter } from '../chrome/minimapcore'
import { lexicalDecorations } from './lexscan'
import { pieceText, scanPieces, type ScanWindow } from '../view/scanwindow'

export interface WsHit { from: number, to: number }

export function findTrailingWhitespace(text: string): WsHit[] {
    const out: WsHit[] = []
    let lineFrom = 0
    for (let i = 0; i <= text.length; i++) {
        if (i === text.length || text[i] === '\n') {
            let end = i
            while (end > lineFrom && (text.charCodeAt(end - 1) === 32 || text.charCodeAt(end - 1) === 9))
                end--
            if (end < i) out.push({ from: end, to: i })
            lineFrom = i + 1
        }
    }
    return out
}

const trailingMark = Decoration.mark({ class: 'cm-trailingSpace' })

// 只看文本,不看光标行(Monaco 没有光标行相关的行尾空白渲染:renderWhitespace 默认 selection 只在选区里画点,
// trimAutoWhitespace 是编辑行为)。有 view 只扫视口,文档和视口都没变就返回上次的集合(见 lexscan.ts)
export const trailingWhitespaceDecorations = lexicalDecorations((text, offset, b) => {
    for (const h of findTrailingWhitespace(text))
        b.add(offset + h.from, offset + h.to, trailingMark)
})

// tab 照 Monaco 按可见列对齐:渲染器逐 UTF-16 码元数列,全角字符 2 列,双向格式字符画成 [U+XXXX] 占 8 列,
// tab 补到下一个 tabSize 的倍数。CSS 的 tab 按像素对齐,前面全是 ASCII 时两边一样;前面有别的字符(中文 12px,
// 不是两列的 14.4px)时,把 tab 包成 inline-block,里面的 tab-size 就是它该占的列数(块里的 tab 从 0 起算)。
export function findTabStops(text: string, tabSize: number): { at: number, cols: number }[] {
    const out: { at: number, cols: number }[] = []
    let col = 0, plain = true
    for (let i = 0; i < text.length; i++) {
        const c = text.charCodeAt(i)
        if (c === 10) { col = 0; plain = true; continue }
        if (c === 9) {
            const cols = tabSize - (col % tabSize)
            if (!plain) out.push({ at: i, cols })
            col += cols
            continue
        }
        if (c < 32 || c > 126) plain = false
        col += isFullWidthCharacter(c) ? 2 : (c >= 0x202A && c <= 0x202E) || (c >= 0x2066 && c <= 0x2069) || c === 0x200E || c === 0x200F || c === 0x061C ? 8 : 1
    }
    return out
}

const tabMarks = new Map<number, Decoration>()
const byView = new WeakMap<object, { doc: Rope, from: number, to: number, tabSize: number, win: ScanWindow | undefined, set: DecorationSet }>()
export function tabStopDecorations(state: EditorState, view?: { viewport: { from: number, to: number }, scanWindow?: ScanWindow }): DecorationSet {
    const doc = state.doc
    const vp = view?.viewport ?? { from: 0, to: doc.length }
    const from = doc.lineAt(Math.max(0, Math.min(doc.length, vp.from))).from
    const to = doc.lineAt(Math.max(0, Math.min(doc.length, vp.to))).to
    const tabSize = state.tabSize
    const hit = view && byView.get(view)
    const win = view?.scanWindow
    if (hit && hit.doc === doc && hit.from === from && hit.to === to && hit.tabSize === tabSize && hit.win === win) return hit.set
    const b = new RangeSetBuilder<Decoration>()
    // 超长行只扫窗口里那一截;片段不从行首起时,列数从片段起点重算(窗口里的 tab 对齐按片段内的列,窗口前的内容不在扫描范围)
    for (const piece of scanPieces(doc, from, to, win)) {
        for (const t of findTabStops(pieceText(doc, piece).text, tabSize)) {
            let mark = tabMarks.get(t.cols)
            if (!mark) tabMarks.set(t.cols, mark = Decoration.mark({ class: 'cm-tabStop', attributes: { style: `tab-size:${t.cols}` } }))
            b.add(piece.from + t.at, piece.from + t.at + 1, mark)
        }
    }
    const set = b.finish()
    if (view) byView.set(view, { doc, from, to, tabSize, win, set })
    return set
}
