// shiki → CM7 decorations:增量 tokenize + 视口邻域 Decoration.mark。
// 热路径禁止全文 RangeSet / 全文 toJSON。

import type { Rope } from '../model/rope'
import type { DecorationSet } from '../model/decoration'
import type { EditorState } from '../model/state'
import type { EditorView } from './editorview'
import { numOption } from '../edit/editoptions'
import { setMaxTokenizationLineLength, ensureTokenCache, ensureTokenizedRange, linesForDoc, selectTokenCache, tokensInLineRange, tokenVersion, type ScopedShiki } from './tokens'
import { Decoration } from '../model/decoration'
import { RangeSet, RangeSetBuilder } from '../model/rangeset'

export interface ShikiOptions {
    lang: string
    theme: string
}

const VIEW_PAD_LINES = 80

const markByColor = new Map<string, Decoration>()
function colorMark(color: string | undefined, fontStyle = 0): Decoration {
    const key = (color ?? '') + '|' + fontStyle
    let mark = markByColor.get(key)
    if (!mark) {
        const parts: string[] = []
        if (color) parts.push(`color:${color}`)
        if (fontStyle & 1) parts.push('font-style:italic')
        if (fontStyle & 2) parts.push('font-weight:bold')
        if (fontStyle & 12) parts.push('text-decoration:' + [fontStyle & 4 ? 'underline' : '', fontStyle & 8 ? 'line-through' : ''].filter(Boolean).join(' '))
        const style = parts.join(';')
        mark = Decoration.mark({ attributes: { style } })
        markByColor.set(key, mark)
    }
    return mark
}

function linesOf(doc: Rope): string[] {
    return linesForDoc(doc.lines) ?? doc.toJSON()
}

function buildDecosForLines(docLen: number, fromLine: number, toLine: number, ensure = true): DecorationSet {
    const rows = tokensInLineRange(fromLine, toLine, ensure)
    if (!rows.length) return RangeSet.empty
    const builder = new RangeSetBuilder<Decoration>()
    let lastFrom = -1
    for (const lineTokens of rows) {
        for (const tok of lineTokens) {
            if ((tok.color || tok.fontStyle) && tok.content.length) {
                const from = tok.offset
                if (from < lastFrom) continue
                const to = from + tok.content.length
                if (to <= docLen) {
                    builder.add(from, to, colorMark(tok.color, tok.fontStyle))
                    lastFrom = from
                }
            }
        }
    }
    return builder.finish()
}

export function shikiDecorations(hl: ScopedShiki, doc: Rope, opts: ShikiOptions): DecorationSet {
    const lines = linesOf(doc)
    if (!ensureTokenCache(hl, lines, opts)) return RangeSet.empty
    return buildDecosForLines(doc.length, 1, lines.length)
}

export function shikiDecorationsViewport(
    hl: ScopedShiki,
    doc: Rope,
    opts: ShikiOptions,
    vpFrom: number,
    vpTo: number,
): DecorationSet {
    const lines = linesOf(doc)
    if (!ensureTokenCache(hl, lines, opts)) return RangeSet.empty
    const n = lines.length
    if (!n) return RangeSet.empty
    const vpFromLine = doc.lineAt(Math.max(0, Math.min(vpFrom, doc.length))).number
    const vpToLine = doc.lineAt(Math.max(0, Math.min(vpTo, doc.length))).number
    // 同步只分视口(渲染出来的)行(Monaco tokenizeViewport);两侧邻域只读已有的,其余交给后台分词
    ensureTokenizedRange(vpFromLine, vpToLine)
    return buildDecosForLines(doc.length, Math.max(1, vpFromLine - VIEW_PAD_LINES), Math.min(n, vpToLine + VIEW_PAD_LINES), false)
}

export function shikiHighlightCM7(hl: ScopedShiki, opts: ShikiOptions) {
    // 只动选区的事务:doc、视口、token 都没变就交回同一个对象,视图比装饰时按对象相等直接跳过
    let memo: { view: EditorView, doc: Rope, from: number, to: number, version: number, set: DecorationSet } | null = null
    return (state: EditorState, view?: EditorView): DecorationSet => {
        if (view) setMaxTokenizationLineLength(view, numOption(state, 'maxTokenizationLineLength', 20000))
        selectTokenCache(view)
        if (view) {
            const vp = view.viewport
            const from = Math.min(state.doc.length, Math.max(0, vp.from))
            const to = Math.min(state.doc.length, Math.max(from, vp.to))
            if (memo && memo.view === view && memo.doc === state.doc && memo.from === from && memo.to === to && memo.version === tokenVersion()) return memo.set
            const set = shikiDecorationsViewport(hl, state.doc, opts, from, to)
            memo = { view, doc: state.doc, from, to, version: tokenVersion(), set }
            return set
        }
        return shikiDecorations(hl, state.doc, opts)
    }
}
