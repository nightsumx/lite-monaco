// Portions of this file are derived from CodeMirror 6 (MIT, Copyright (C) Marijn Haverbeke and others). See THIRD-PARTY-NOTICES.md.
// CM7 DOMChange —— DOM 变异 diff → ChangeSet+选区。对齐 codeSrc/view/src/domchange.ts 历史化石。
//
// 结构差：CM7 行级 DOM（非 tile）；findDiff / 浏览器特例 / composition 多光标 / Android 键重合成
// 与 CM6 同语义。

import type { EditorView } from '../view/editorview'
import { posFromDOM } from '../view/dombridge'
import { DOMPoint, DOMReader, LineBreakPlaceholder } from '../view/domreader'
import { EditorSelection } from '../model/selection'
import { browser } from '../browser'
import { inputHandler } from '../view/editorview'

export class DOMChange {
    bounds: { from: number, to: number } | null = null
    text = ''
    newSel: EditorSelection | null = null
    domChanged: boolean

    constructor(view: EditorView, fromLine: number, toLine: number) {
        this.domChanged = fromLine > -1
        const { doc } = view.state
        const content = view.contentDOM
        const vsl = view.viewportStartLine

        if (view.state.readOnly && fromLine > -1) {
            this.newSel = null
        } else if (fromLine > -1) {
            const blockStarts = view.viewBlockStarts
            const blockEnds = view.viewBlockEnds
            const oldBlocks = blockStarts.length
            const lastLine = Math.max(0, oldBlocks - 1)
            const domLineCount = content.children.length
            const deletedLines = Math.max(0, oldBlocks - domLineCount)
            const startEl = content.children[fromLine] as HTMLElement
            const endEl = content.children[toLine] as HTMLElement
            const clamp = (idx: number) => Math.min(Math.max(idx, 0), lastLine)
            const from = blockStarts[clamp(fromLine)] ?? doc.line(vsl).from
            const to = blockEnds[clamp(toLine + deletedLines)] ?? doc.length
            this.bounds = { from, to }
            const selPoints = selectionPoints(view)
            const reader = new DOMReader(selPoints)
            reader.readLines(startEl, endEl, doc, from)
            this.text = reader.text
            this.newSel = selectionFromPoints(selPoints, from)
        } else {
            const sel = view.observer.selectionRange
            const cur = view.state.selection.main
            let head = !content.contains(sel.focusNode) ? cur.head
                : posFromDOM(content, doc, sel.focusNode!, sel.focusOffset, vsl)
            let anchor = !content.contains(sel.anchorNode) ? cur.anchor
                : posFromDOM(content, doc, sel.anchorNode!, sel.anchorOffset, vsl)
            // §5:iOS/Chrome 全选时选区落在视口 block gap → 钳到文档首尾
            if ((browser.ios || browser.chrome) && cur.empty && head !== anchor) {
                const vp = view.viewport
                if ((vp.from > 0 || vp.to < doc.length) &&
                    ((Math.abs(vp.from - Math.min(head, anchor)) <= 1 || Math.min(head, anchor) === 0) &&
                     (Math.abs(vp.to - Math.max(head, anchor)) <= 1 || Math.max(head, anchor) === doc.length))) {
                    head = 0
                    anchor = doc.length
                }
            }
            // composition 多光标：只替换主 range 的选区映射
            if (view.inputState.composing > -1 && view.state.selection.ranges.length > 1)
                this.newSel = view.state.selection.replaceRange(EditorSelection.range(anchor, head))
            else
                this.newSel = EditorSelection.single(anchor, head)
        }
    }
}

export function applyDOMChange(view: EditorView, domChange: DOMChange): boolean {
    // §5:iOS 延迟键
    if (browser.ios && view.inputState.pendingIOSKey && domChange.bounds) {
        const ch = {
            from: domChange.bounds.from,
            to: domChange.bounds.to,
            insert: domChange.text,
        }
        if (view.flushIOSKey(ch)) return true
    }

    let change: { from: number, to: number, insert: string } | undefined
    let { newSel } = domChange
    const { state } = view
    const sel = state.selection.main
    const lastKey = view.inputState.lastKeyTime > Date.now() - 100 ? view.inputState.lastKeyCode : -1

    if (domChange.bounds) {
        const { from, to } = domChange.bounds
        let preferredPos = sel.from
        let preferredSide: string | null = null
        // 退格 / Android 删除 → 锚到 end
        if (lastKey === 8 || (browser.android && domChange.text.length < to - from)) {
            preferredPos = sel.to
            preferredSide = 'end'
        }
        const cmp = state.doc.sliceString(from, to, LineBreakPlaceholder)
        let selEnd: number, diff
        if (!sel.empty && sel.from >= from && sel.to <= to && cmp !== domChange.text &&
            cmp.slice(0, sel.from - from) === domChange.text.slice(0, sel.from - from) &&
            cmp.slice(sel.to - from) === domChange.text.slice(selEnd = domChange.text.length - (cmp.length - (sel.to - from)))) {
            change = { from: sel.from, to: sel.to, insert: ph2nl(domChange.text.slice(sel.from - from, selEnd)) }
        } else if (diff = findDiff(cmp, domChange.text, preferredPos - from, preferredSide)) {
            // §5 H3: Chrome Shift-Enter 在行尾插两个换行 → 吞一个
            if (browser.chrome && lastKey === 13 &&
                diff.toB === diff.from + 2 &&
                domChange.text.slice(diff.from, diff.toB) === LineBreakPlaceholder + LineBreakPlaceholder)
                diff.toB--

            change = {
                from: from + diff.from,
                to: from + diff.toA,
                insert: ph2nl(domChange.text.slice(diff.from, diff.toB)),
            }
        }
    } else if (newSel && sameSelPos(newSel, sel)) {
        newSel = null
    }

    if (!change && !newSel) return false

    // §5: Mac/Android 双空格 → 句号 autocorrect
    if ((browser.mac || browser.android) && change && change.from === change.to &&
        change.from === sel.head - 1 && /^\. ?$/.test(change.insert) &&
        view.contentDOM.getAttribute('autocorrect') === 'off') {
        if (newSel && change.insert.length === 2)
            newSel = EditorSelection.single(newSel.main.anchor - 1, newSel.main.head - 1)
        change = { from: change.from, to: change.to, insert: change.insert.replace('.', ' ') }
    } else if (state.doc.lineAt(sel.from).to < sel.to &&
        view.inputState.insertingTextAt > Date.now() - 50 &&
        view.inputState.insertingText) {
        // Chrome/Safari 跨行插入会扁平化下一行 widget → 用 beforeinput 文本替换
        change = {
            from: sel.from,
            to: sel.to,
            insert: view.inputState.insertingText,
        }
    } else if (browser.chrome && change && change.from === change.to && change.from === sel.head &&
        change.insert === '\n ' && view.lineWrapping) {
        // Chrome 在 wrap 行首插空格时会多插换行（#968）
        if (newSel)
            newSel = EditorSelection.single(newSel.main.anchor - 1, newSel.main.head - 1)
        change = { from: sel.from, to: sel.to, insert: ' ' }
    }

    if (change) {
        return applyDOMChangeInner(view, change, newSel, lastKey)
    } else if (newSel && !sameSelPos(newSel, sel)) {
        let scrollIntoView = false
        let userEvent = 'select'
        if (view.inputState.lastSelectionTime > Date.now() - 50) {
            if (view.inputState.lastSelectionOrigin === 'select') scrollIntoView = true
            userEvent = view.inputState.lastSelectionOrigin || 'select'
        }
        view.dispatch(state.update({ selection: newSel, scrollIntoView, userEvent }))
        return true
    }
    return false
}

export function applyDOMChangeInner(
    view: EditorView,
    change: { from: number, to: number, insert: string },
    newSel: EditorSelection | null,
    lastKey = -1,
): boolean {
    if (browser.ios && view.flushIOSKey(change)) return true

    const sel = view.state.selection.main
    // §5: Android 无合理 key 事件 → 把像 Enter/Backspace/Delete 的 diff 重合成 key
    if (browser.android && (
        (change.to === sel.to &&
            (change.from === sel.from ||
                (change.from === sel.from - 1 && view.state.sliceDoc(change.from, sel.from) === ' ')) &&
            change.insert === '\n' &&
            dispatchSyntheticKey(view, 'Enter', 13)) ||
        ((change.from === sel.from - 1 && change.to === sel.to && change.insert.length === 0 ||
            lastKey === 8 && change.insert.length < change.to - change.from && change.to > sel.head) &&
            dispatchSyntheticKey(view, 'Backspace', 8)) ||
        (change.from === sel.from && change.to === sel.to + 1 && change.insert.length === 0 &&
            dispatchSyntheticKey(view, 'Delete', 46))
    ))
        return true

    view.inputState.noteComposingChange()

    const { state } = view
    for (const handler of state.facet(inputHandler)) {
        if (handler(view, change.from, change.to, change.insert))
            return true
    }

    const tr = applyDefaultInsert(view, change, newSel)
    view.dispatch(tr)
    return true
}

function applyDefaultInsert(
    view: EditorView,
    change: { from: number, to: number, insert: string },
    newSel: EditorSelection | null,
) {
    const startState = view.state
    const sel = startState.selection.main
    const userEvent = view.inputState.userEventForChange(view)

    // 多光标 + 主 range 处纯插入/替换：扇出（非 composition 路径）
    const mainR = sel
    const isAtMain = change.from === mainR.from && change.to === mainR.to
    if (startState.selection.ranges.length > 1 && isAtMain && view.inputState.composing < 0 &&
        !view.inputState.compositionPendingChange) {
        const insert = change.insert
        const tr = startState.changeByRange(range => {
            const from = range.from, to = range.to
            return {
                changes: { from, to, insert },
                range: EditorSelection.cursor(from + insert.length),
            }
        })
        return startState.update(tr, { userEvent, scrollIntoView: true })
    }

    const changes = startState.changes(change)
    let mainSel = newSel && newSel.main.to <= changes.newLength ? newSel.main : undefined
    // 读不到 DOM 选区(失焦时提交的组字等):光标在变更里 → 落到插入末尾,而不是留在插入起点
    if (!mainSel && !newSel && sel.empty && sel.head >= change.from && sel.head <= change.to)
        mainSel = EditorSelection.cursor(change.from + change.insert.length)

    // H2: composition 多光标 —— 把相同替换应用到每个光标（composition 范围内的除外）
    if (startState.selection.ranges.length > 1 &&
        (view.inputState.composing >= 0 || view.inputState.compositionPendingChange) &&
        change.to <= sel.to + 10 && change.to >= sel.to - 10) {
        const replaced = view.state.sliceDoc(change.from, change.to)
        // composition 范围：整行（无 composition 节点 API 时用行兜底）
        const compositionRange = view.state.doc.lineAt(sel.head)
        const offset = sel.to - change.to
        const tr = startState.changeByRange(range => {
            if (range.from === sel.from && range.to === sel.to)
                return { changes, range: mainSel || range.map(changes) }
            const to = range.to - offset
            const from = to - replaced.length
            if (from < 0 || to > view.state.doc.length) return { range }
            if (view.state.sliceDoc(from, to) !== replaced ||
                (to >= compositionRange.from && from <= compositionRange.to))
                return { range }
            const rangeChanges = startState.changes({ from, to, insert: change.insert })
            const selOff = range.to - sel.to
            return {
                changes: rangeChanges,
                range: !mainSel ? range.map(rangeChanges) :
                    EditorSelection.range(
                        Math.max(0, mainSel.anchor + selOff),
                        Math.max(0, mainSel.head + selOff),
                    ),
            }
        })
        return startState.update(tr, { userEvent, scrollIntoView: true })
    }

    // 单点扇出：多光标主 range 内编辑（非 composition 已在上面处理）
    if (startState.selection.ranges.length > 1 && isAtMain) {
        const insert = change.insert
        const tr = startState.changeByRange(range => ({
            changes: { from: range.from, to: range.to, insert },
            range: EditorSelection.cursor(range.from + insert.length),
        }))
        return startState.update(tr, { userEvent, scrollIntoView: true })
    }

    const selection = mainSel
        ? (startState.selection.ranges.length > 1
            ? startState.selection.map(changes).replaceRange(mainSel)
            : startState.selection.replaceRange(mainSel))
        : undefined
    return startState.update({
        changes,
        selection,
        userEvent,
        scrollIntoView: true,
    })
}

function dispatchSyntheticKey(view: EditorView, key: string, keyCode: number): boolean {
    const ev = new KeyboardEvent('keydown', {
        key, keyCode, bubbles: true, cancelable: true,
    })
    ;(ev as KeyboardEvent & { synthetic?: boolean }).synthetic = true
    view.contentDOM.dispatchEvent(ev)
    return true
}

// findDiff —— 逐行照搬 codeSrc/view/src/domchange.ts:298-323
export function findDiff(a: string, b: string, preferredPos: number, preferredSide: string | null):
    { from: number, toA: number, toB: number } | null {
    const minLen = Math.min(a.length, b.length)
    let from = 0
    while (from < minLen && a.charCodeAt(from) === b.charCodeAt(from)) from++
    if (from === minLen && a.length === b.length) return null
    let toA = a.length, toB = b.length
    while (toA > 0 && toB > 0 && a.charCodeAt(toA - 1) === b.charCodeAt(toB - 1)) { toA--; toB-- }

    if (preferredSide === 'end') {
        const adjust = Math.max(0, from - Math.min(toA, toB))
        preferredPos -= toA + adjust - from
    }
    if (toA < from && a.length < b.length) {
        const move = preferredPos <= from && preferredPos >= toA ? from - preferredPos : 0
        from -= move
        toB = from + (toB - toA)
        toA = from
    } else if (toB < from) {
        const move = preferredPos <= from && preferredPos >= toB ? from - preferredPos : 0
        from -= move
        toA = from + (toA - toB)
        toB = from
    }
    return { from, toA, toB }
}

export function sameSelPos(selection: EditorSelection, range: { head: number, anchor: number }) {
    return range.head === selection.main.head && range.anchor === selection.main.anchor
}

function ph2nl(s: string) {
    return s.split(LineBreakPlaceholder).join('\n')
}

function selectionPoints(view: EditorView): DOMPoint[] {
    const result: DOMPoint[] = []
    if (view.root.activeElement !== view.contentDOM) return result
    const { anchorNode, anchorOffset, focusNode, focusOffset } = view.observer.selectionRange
    if (anchorNode) {
        result.push(new DOMPoint(anchorNode, anchorOffset))
        if (focusNode !== anchorNode || focusOffset !== anchorOffset)
            result.push(new DOMPoint(focusNode!, focusOffset))
    }
    return result
}

function selectionFromPoints(points: DOMPoint[], base: number): EditorSelection | null {
    if (points.length === 0) return null
    const anchor = points[0].pos
    const head = points.length === 2 ? points[1].pos : anchor
    return anchor > -1 && head > -1 ? EditorSelection.single(anchor + base, head + base) : null
}
