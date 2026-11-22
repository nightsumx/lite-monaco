// Monaco 光标类命令里「带参数」的那批(editor.trigger 的 handler id):_moveTo / _moveToSelect / cursorMove / columnSelect /
// _wordSelect(Drag) / _lineSelect(Drag) / lastCursorLineSelect(Drag) / createCursor / setSelection 等。
// 不带参数的移动(cursorLeft 等)走 host.ts 的 TRIGGER_COMMANDS 表,直接复用 core 命令;这里只放需要解析 payload 的。
// 语义逐条对照 vscode editor/browser/coreCommands.ts + common/cursor/cursorMoveCommands.ts。
import type * as core from '../core/index'
import type { IPosition } from './types'
import { docOffset } from './commands'
import { EditorSelection, selectionStartInfo, type SelectionRange } from '../core/model/selection'
import { wordDragAt, wordSelectAt } from '../core/edit/words'
import { findClusterBreak } from '../core/model/char'
import { columnSelectTo, verticalPos } from '../core/edit/vertical'
import * as coreCmds from '../core/index'

type Handler = (view: core.EditorView, payload: any) => boolean

const posOf = (view: core.EditorView, p: IPosition): number => docOffset(view.state.doc, p.lineNumber, p.column)

// ---- 鼠标选择:点 / 双击词 / 三击行 / 拖动 / Shift+点(Monaco CursorMoveCommands.moveTo / word / line)----
// 选区起点(selectionStart + kind)挂在 EditorSelection 上(selectionStartInfo):继续拖或 Shift+点时按起点那一段(词 / 行)扩。

type StartInfo = { from: number, to: number, kind: 'simple' | 'word' | 'line' }

function startInfo(view: core.EditorView): StartInfo {
    const sel = view.state.selection
    const known = sel.ranges.length === 1 ? selectionStartInfo.get(sel) : undefined
    return known ?? { from: sel.main.anchor, to: sel.main.anchor, kind: 'simple' }
}

// head 落在起点段内或其后 → 锚在段首;落在段首及之前 → 锚在段尾(Monaco SingleCursorState 由 selectionStart + position 推 selection)。
function extend(view: core.EditorView, info: StartInfo, head: number): boolean {
    const anchor = head <= info.from && info.to > info.from ? info.to : info.from
    const sel = EditorSelection.single(anchor, head)
    selectionStartInfo.set(sel, info)
    view.dispatch(view.state.update({ selection: sel, scrollIntoView: true, userEvent: 'select' }))
    return true
}

function wordAt(view: core.EditorView, pos: number, select: boolean): boolean {
    if (!select) {
        const w = wordSelectAt(view.state, pos)
        const sel = EditorSelection.single(w.from, w.to)
        selectionStartInfo.set(sel, { from: w.from, to: w.to, kind: 'word' })
        view.dispatch(view.state.update({ selection: sel, scrollIntoView: true, userEvent: 'select' }))
        return true
    }
    const info = startInfo(view)
    const drag = wordDragAt(view.state, pos)
    const inside = (p: number) => info.from <= p && p <= info.to
    let head: number
    if (inside(pos)) head = info.to
    else if (pos <= info.from) head = inside(drag.from) ? info.to : drag.from
    else head = inside(drag.to) ? info.from : drag.to
    return extend(view, info, head)
}

function lineAt(view: core.EditorView, pos: number, select: boolean): boolean {
    const doc = view.state.doc
    const lineEnd = (n: number) => n < doc.lines ? doc.line(n + 1).from : doc.length
    const n = doc.lineAt(pos).number
    if (!select) {
        const sel = EditorSelection.single(doc.line(n).from, lineEnd(n))
        selectionStartInfo.set(sel, { from: doc.line(n).from, to: lineEnd(n), kind: 'line' })
        view.dispatch(view.state.update({ selection: sel, scrollIntoView: true, userEvent: 'select' }))
        return true
    }
    const info = startInfo(view)
    const entering = doc.lineAt(info.from).number
    const head = n < entering ? doc.line(n).from : n > entering ? lineEnd(n) : info.to
    return extend(view, info, head)
}

function moveTo(select: boolean): Handler {
    return (view, payload) => {
        if (!payload?.position) return true
        const pos = posOf(view, payload.position)
        if (select) {
            const info = startInfo(view)
            if (info.kind === 'word') return wordAt(view, pos, true)
            if (info.kind === 'line') return lineAt(view, pos, true)
            return extend(view, info, pos)
        }
        view.dispatch(view.state.update({ selection: EditorSelection.single(pos), scrollIntoView: true, userEvent: 'select' }))
        return true
    }
}

const posHandler = (fn: (view: core.EditorView, pos: number, select: boolean) => boolean, select: boolean): Handler =>
    (view, payload) => payload?.position ? fn(view, posOf(view, payload.position), select) : true

// ---- cursorMove(Monaco CursorMoveCommands.simpleMove / viewportMove)----
// payload: { to, by, value, select, visibleRange? };visibleRange 是 Monaco viewModel.getCompletelyVisibleViewRange 的等价物
// (视口里完整可见的行区间;缺省取 view.getVisibleRanges 的首尾)。

type Doc = core.EditorView['state']['doc']

const lineOf = (doc: Doc, pos: number) => doc.lineAt(pos)
const firstNonWs = (text: string): number => { const m = /\S/.exec(text); return m ? m.index + 1 : 0 }
const lastNonWs = (text: string): number => { for (let i = text.length - 1; i >= 0; i--) if (text[i] !== ' ' && text[i] !== '\t') return i + 2; return 0 }
const isBlank = (doc: Doc, n: number) => firstNonWs(doc.line(n).text) === 0

/** 向左 n 个字符:先把位置左移 n-1 列(夹在行内),再走一格(行首跨到上行行尾) */
function leftBy(doc: Doc, pos: number, n: number): number {
    const line = lineOf(doc, pos)
    let p = Math.max(line.from, pos - (n - 1))
    if (p > line.from) return line.from + findClusterBreak(line.text, p - line.from, false)
    return p > 0 ? p - 1 : 0
}
function rightBy(doc: Doc, pos: number, n: number): number {
    const line = lineOf(doc, pos)
    const p = Math.min(line.to, pos + (n - 1))
    if (p < line.to) return line.from + findClusterBreak(line.text, p - line.from, true)
    return p < doc.length ? p + 1 : p
}

function cursorMove(view: core.EditorView, payload: any): boolean {
    const to = payload?.to
    if (!to) return true
    const by = payload.by
    const select = !!payload.select
    const value = payload.value || 1
    const state = view.state
    const doc = state.doc
    const sel = state.selection
    const wrapped = by === 'wrappedLine'
    const mk = (r: SelectionRange, head: number, goal: number | null = null) =>
        select ? EditorSelection.range(r.anchor, head, 0, goal) : EditorSelection.cursor(head, 0, null, goal)
    const each = (f: (r: SelectionRange) => SelectionRange): SelectionRange[] => sel.ranges.map(f)
    let ranges: SelectionRange[] | null = null
    const lineCol = (r: SelectionRange, f: (text: string, line: { from: number, to: number, text: string }) => number) => {
        const l = lineOf(doc, r.head)
        const c = f(l.text, l)
        return mk(r, l.from + Math.min(Math.max(c, 1), l.length + 1) - 1)
    }
    switch (to) {
        case 'left':
            ranges = each(r => by === 'halfLine'
                ? mk(r, leftBy(doc, r.head, Math.round(lineOf(doc, r.head).length / 2)))
                : (!select && !r.empty ? EditorSelection.cursor(r.from) : mk(r, leftBy(doc, r.head, value))))
            break
        case 'right':
            ranges = each(r => by === 'halfLine'
                ? mk(r, rightBy(doc, r.head, Math.round(lineOf(doc, r.head).length / 2)))
                : (!select && !r.empty ? EditorSelection.cursor(r.to) : mk(r, rightBy(doc, r.head, value))))
            break
        case 'up':
        case 'down': {
            const dir = to === 'up' ? -1 : 1
            if (wrapped && (view as any).lineWrapping) {
                for (let i = 0; i < value; i++) (dir < 0 ? (select ? coreCmds.selectLineUp : coreCmds.cursorLineUp) : (select ? coreCmds.selectLineDown : coreCmds.cursorLineDown))(view)
                return true
            }
            ranges = each(r => {
                const start = !select && !r.empty ? (dir < 0 ? r.from : r.to) : r.head
                const fromHead = start === r.head
                const t = verticalPos(state, start, fromHead ? r.goalColumn : null, dir * value, true)
                return select ? EditorSelection.range(r.anchor, t.head, 0, t.goalColumn) : EditorSelection.cursor(t.head, 0, null, t.goalColumn)
            })
            break
        }
        case 'prevBlankLine':
        case 'nextBlankLine': {
            const dir = to === 'prevBlankLine' ? -1 : 1
            ranges = each(r => {
                let n = lineOf(doc, r.head).number
                const stop = dir < 0 ? 1 : doc.lines
                while (n !== stop && isBlank(doc, n)) n += dir
                while (n !== stop && !isBlank(doc, n)) n += dir
                return mk(r, doc.line(n).from)
            })
            break
        }
        case 'wrappedLineStart': ranges = each(r => lineCol(r, () => 1)); break
        case 'wrappedLineFirstNonWhitespaceCharacter': ranges = each(r => lineCol(r, t => firstNonWs(t) || 1)); break
        case 'wrappedLineColumnCenter': ranges = each(r => lineCol(r, t => Math.round((t.length + 2) / 2))); break
        case 'wrappedLineEnd': ranges = each(r => lineCol(r, t => t.length + 1)); break
        case 'wrappedLineLastNonWhitespaceCharacter': ranges = each(r => lineCol(r, t => lastNonWs(t) || 1)); break
        case 'viewPortTop':
        case 'viewPortBottom':
        case 'viewPortCenter':
        case 'viewPortIfOutside': {
            let vr = payload.visibleRange as { startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number } | undefined
            if (!vr) {
                const vs = view.getVisibleRanges()
                if (!vs.length) return true
                vr = { startLineNumber: vs[0].startLineNumber, startColumn: 1, endLineNumber: vs[vs.length - 1].endLineNumber, endColumn: 1 }
            }
            if (to === 'viewPortIfOutside') {
                ranges = each(r => {
                    const n = lineOf(doc, r.head).number
                    if (vr!.startLineNumber <= n && n <= vr!.endLineNumber - 1) return r
                    const target = n > vr!.endLineNumber - 1 ? vr!.endLineNumber - 1 : vr!.startLineNumber
                    const t = verticalPos(state, r.head, r.goalColumn, target - n, false)
                    return select ? EditorSelection.range(r.anchor, t.head, 0, t.goalColumn) : EditorSelection.cursor(t.head, 0, null, t.goalColumn)
                })
                break
            }
            const first = vr.startColumn !== 1 ? vr.startLineNumber + 1 : vr.startLineNumber
            const ln = to === 'viewPortTop' ? Math.min(vr.endLineNumber, first + value - 1)
                : to === 'viewPortBottom' ? Math.max(first, vr.endLineNumber - value + 1)
                    : Math.round((vr.startLineNumber + vr.endLineNumber) / 2)
            const line = doc.line(Math.min(Math.max(ln, 1), doc.lines))
            const col = firstNonWs(line.text) || 1
            ranges = [mk(sel.main, line.from + col - 1)]
            break
        }
        default:
            return true
    }
    if (!ranges) return true
    const mainIndex = ranges.length === sel.ranges.length ? sel.mainIndex : 0
    view.dispatch(state.update({ selection: EditorSelection.create(ranges, mainIndex), scrollIntoView: true, userEvent: 'select' }))
    return true
}

// Monaco ColumnSelect:position 是鼠标落点(行),mouseColumn-1 是鼠标的可见列;doColumnSelect=接着上一次的框拉
function columnSelect(view: core.EditorView, payload: any): boolean {
    if (!payload?.position || typeof payload.mouseColumn !== 'number') return true
    const line = Math.min(Math.max(1, payload.position.lineNumber), view.state.doc.lines)
    return columnSelectTo(view as never, line, payload.mouseColumn - 1, !payload.doColumnSelect), true
}

export const CURSOR_HANDLERS: Readonly<Record<string, Handler>> = {
    _moveTo: moveTo(false),
    _moveToSelect: moveTo(true),
    _wordSelect: posHandler(wordAt, false),
    _wordSelectDrag: posHandler(wordAt, true),
    _lineSelect: posHandler(lineAt, false),
    _lineSelectDrag: posHandler(lineAt, true),
    cursorMove,
    columnSelect,
}
