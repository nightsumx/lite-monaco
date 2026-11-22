// Go to Line —— Monaco GotoLineQuickAccessProvider(':' 前缀)。
//
// 输入 `:40`、`:40:5`、`:40,5`、`:-1`(倒数第 1 行)。合法行号:列表给「Go to line N.」,编辑器把该行
// 滚到中间并整行高亮、概览尺画一条(预览,不动选区);非法(abc / 0 / 超范围):列表给「Current Line: X, Character: Y.
// Type a line number between 1 and N to navigate to.」,Enter 不关、不跳。取消复原最后一次光标变化时的滚动位置。
// 打开入口在 commandpalette.ts(openGotoLine,和命令面板共用一套 provider)。

import type { EditorView } from '../view/editorview'
import type { EditorState } from '../model/state'
import { StateEffect, StateField } from '../model/state'
import { EditorSelection } from '../model/selection'
import type { QuickAccessProvider, QuickPickItem } from './overlay'

export const GOTO_LINE_PREFIX = ':'

const setRangeHighlight = StateEffect.define<number | null>()

/** 预览行(Monaco quick-access-range-highlight 的 overviewRuler 部分):概览尺读它画 Full 条 */
export const rangeHighlightField = StateField.define<number | null>({
    create: () => null,
    update(value, tr) {
        for (const e of tr.effects) if (e.is(setRangeHighlight)) return e.value
        return value === null || !tr.docChanged ? value : tr.changes.mapPos(value)
    },
})

export interface GotoParse {
    /** `::offset` 模式(输入以 ':' 开头) */
    inOffsetMode?: boolean
    /** 有值才是可跳转;缺了只提示 */
    line?: number
    column?: number
    label: string
}

/**
 * Monaco AbstractGotoLineQuickAccessProvider.parsePosition(0.55):
 * - `::N` 按字符偏移(1 基;zeroBased 为 0 基;负数从文末倒数),落到偏移所在的行列
 * - `行[,:#]列` 行列都可负(倒数),行 / 列都 clamp 进合法范围(0 → 1,超范围 → 末行 / 行尾)
 * - 行号不是数 → 无 line,只给提示
 */
export function parseGotoPosition(state: EditorState, value: string, zeroBased = false): GotoParse {
    const doc = state.doc
    if (value.startsWith(':')) {
        let offset = Number.parseInt(value.slice(1), 10)
        const max = doc.length
        if (Number.isNaN(offset)) {
            return {
                inOffsetMode: true,
                label: zeroBased
                    ? `Type a character position to go to (from 0 to ${max - 1}).`
                    : `Type a character position to go to (from 1 to ${max}).`,
            }
        }
        const reverse = offset < 0
        if (!zeroBased) offset -= Math.sign(offset)
        if (reverse) offset += max
        const l = doc.lineAt(Math.min(Math.max(offset, 0), max))
        const line = l.number
        const column = Math.min(Math.max(offset, 0), max) - l.from + 1
        return { inOffsetMode: true, line, column, label: `Press 'Enter' to go to line ${line} at column ${column}.` }
    }
    const parts = value.split(/,|:|#/)
    const maxLine = doc.lines
    let line = Number.parseInt(parts[0]?.trim(), 10)
    if (Number.isNaN(line)) return { label: `Type a line number to go to (from 1 to ${maxLine}).` }
    line = Math.min(Math.max(1, line >= 0 ? line : maxLine + 1 + line), maxLine)
    const maxColumn = doc.line(line).length + 1
    let column = Number.parseInt(parts[1]?.trim(), 10)
    if (parts.length < 2 || Number.isNaN(column)) {
        return {
            line, column: 1,
            label: parts.length < 2
                ? `Press 'Enter' to go to line ${line} or enter : to add a column number.`
                : `Press 'Enter' to go to line ${line} or enter a column number (from 1 to ${maxColumn}).`,
        }
    }
    column = Math.min(Math.max(1, column >= 0 ? column : maxColumn + column), maxColumn)
    return { line, column, label: `Press 'Enter' to go to line ${line} at column ${column}.` }
}

// Monaco revealRangeInCenter(viewLines._computeScrollTopToRevealRange,Center):盒上留 context 行、下留 context-1 行
// (context = min(半屏行数, sticky scroll 行数),同 scrollPosIntoView),盒的中点对齐视口中点
function revealLineInCenter(view: EditorView, pos: number) {
    const clientH = view.scrollDOM.clientHeight
    if (!clientH) return
    // lineBlockAt:scrollDOM 内容坐标,heightMap 全文度量(行不在视口也能算)
    const { top, bottom } = view.lineBlockAt(pos)
    const lh = view.oracle.lineHeight
    const context = lh > 0 ? Math.min(clientH / lh / 2, view.revealSurroundingLines) : 0
    const boxStart = top - context * lh
    const boxEnd = bottom + Math.max(0, context - 1) * lh
    view.scrollDOM.scrollTop = Math.max(0, (boxStart + boxEnd) / 2 - clientH / 2)
}

/** ':' provider:每次打开新建(保存的滚动位置、预览高亮都是这一次的)。 */
export function gotoLineProvider(view: EditorView, opts: { zeroBased?: boolean } = {}): QuickAccessProvider {
    const parse = (filter: string) => parseGotoPosition(view.state, filter, opts.zeroBased)
    let saved: { top: number, left: number } | null = null
    let offSelection: (() => void) | null = null
    let highlight: HTMLElement | null = null

    // Monaco 每次光标变化都重存 view state,取消时复原的是最后一次的(预览中点进编辑器再离开 = 留在点的地方)
    const snapshot = () => { saved = { top: view.scrollDOM.scrollTop, left: view.scrollDOM.scrollLeft } }

    const clearHighlight = () => {
        highlight?.remove()
        highlight = null
        if (view.state.field(rangeHighlightField, false) != null) view.dispatch(view.state.update({ effects: setRangeHighlight.of(null) }))
    }

    // Monaco rangeHighlight(isWholeLine):放进 scrollDOM(与光标层同一坐标系),跟着内容滚
    const showHighlight = (pos: number) => {
        const sd = view.scrollDOM
        if (!highlight) {
            highlight = sd.ownerDocument.createElement('div')
            highlight.className = 'cm-rangeHighlight'
            highlight.setAttribute('aria-hidden', 'true')
            sd.insertBefore(highlight, sd.firstChild)
        }
        const { top, height } = view.lineBlockAt(pos)
        highlight.style.top = `${top}px`
        highlight.style.height = `${height}px`
        highlight.style.width = `${Math.max(sd.scrollWidth, sd.clientWidth)}px`
        if (view.state.field(rangeHighlightField, false) !== undefined) view.dispatch(view.state.update({ effects: setRangeHighlight.of(pos) }))
    }

    // 列号照 Monaco setSelection 的 validatePosition 截到 1..行长+1(`:40:999` 落行尾)
    const go = (pos: { line: number, column?: number }) => {
        const line = view.state.doc.line(pos.line)
        const at = line.from + Math.min(Math.max(pos.column ?? 1, 1), line.length + 1) - 1
        view.dispatch(view.state.update({ selection: EditorSelection.cursor(at), userEvent: 'select' }))
        revealLineInCenter(view, at)
    }

    return {
        prefix: GOTO_LINE_PREFIX,
        items(filter): QuickPickItem[] {
            const r = parse(filter)
            const line = r.line
            return [{ label: r.label, run: line ? () => go({ line, column: r.column }) : undefined }]
        },
        onChange(filter) {
            if (!offSelection) {
                snapshot()
                offSelection = view.onTransaction(tr => { if (tr.selection) snapshot() })
            }
            const pos = parse(filter)
            if (!pos.line) { clearHighlight(); return }
            const at = view.state.doc.line(pos.line).from
            revealLineInCenter(view, at)
            showHighlight(at)
        },
        onLeave(accepted) {
            offSelection?.()
            offSelection = null
            clearHighlight()
            if (!accepted && saved) {
                view.scrollDOM.scrollTop = saved.top
                view.scrollDOM.scrollLeft = saved.left
            }
            saved = null
        },
    }
}
