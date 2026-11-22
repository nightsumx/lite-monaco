// 全操作时延：一张表覆盖 keymap 去重后的命令 + 产品面板 + 每键装饰。
// 方法：同一 view、同一 10k fixture；mutating 后还原文档；滚动用 sync setTimeout(0)。

import { createHighlighter } from 'shiki'
import { liteMonaco, type ShikiLike } from '../src/index'
import * as core from '../src/core/index'
import { EditorView } from '../src/core/view/editorview'
import { isolateHistory } from '../src/core/edit/history'
import { copyCommand, cutCommand, pasteCommand } from '../src/core/input/clipboard'
import { findMatches } from '../src/core/edit/find'
import { tsQuickInfoSource } from '../src/lang/tsquickinfo'
import { collectCodeActionsAt } from '../src/lang/tscodeactions'
import { createTSActions } from '../src/lang/tsactions'
import { getTSService } from '../src/lang/tsservice'
import { triggerSignatureHelp } from '../src/lang/tssignature'
import { defaultKeymap } from '../src/core/edit/keymap'

export const COVERED_COMMANDS: Array<(...a: never[]) => unknown> = [
    core.cursorCharBackward, core.selectCharBackward,
    core.cursorCharForward, core.selectCharForward,
    core.cursorCharLeft, core.selectCharLeft,
    core.cursorCharRight, core.selectCharRight,
    core.cursorLineUp, core.selectLineUp,
    core.cursorLineDown, core.selectLineDown,
    core.cursorLineBoundaryBackward, core.selectLineBoundaryBackward,
    core.cursorLineBoundaryForward, core.selectLineBoundaryForward,
    core.cursorLineEnd, core.selectLineEnd,
    core.cursorPageUp, core.selectPageUp,
    core.cursorPageDown, core.selectPageDown,
    core.scrollLineUp, core.scrollLineDown, core.scrollPageUp, core.scrollPageDown,
    core.cursorWordLeft, core.selectWordLeft,
    core.cursorWordEndRight, core.selectWordEndRight,
    core.cursorDocStart, core.selectDocStart,
    core.cursorDocEnd, core.selectDocEnd,
    core.selectNextOccurrence, core.selectAllOccurrences, core.moveSelectionToNextFindMatch, core.cursorUndo,
    core.deleteCharBackward, core.deleteCharForward,
    core.deleteLine, core.deleteLineContentOrJoin,
    core.deleteGroupBackward, core.deleteGroupForward,
    core.insertNewlineAndIndent, core.insertLineAfter, core.insertLineBefore,
    core.insertTab, core.indentLess, core.indentMore,
    core.cursorMatchingBracket, core.selectAll, core.selectLine,
    core.undo, core.redo,
    copyCommand, cutCommand, pasteCommand,
    core.moveLineUp, core.moveLineDown, core.copyLineUp, core.copyLineDown,
    core.addCursorAbove, core.addCursorBelow,
    core.insertCursorAtEndOfEachLineSelected,
    core.cursorSubwordBackward, core.selectSubwordBackward,
    core.cursorSubwordForward, core.selectSubwordForward,
    core.deleteToLineStart, core.deleteToLineEnd, core.simplifySelection,
    core.inPlaceReplaceUp, core.inPlaceReplaceDown,
    core.suggestTab, core.suggestAccept, core.suggestNext, core.suggestPrev,
    core.suggestPageNext, core.suggestPagePrev, core.suggestTrigger, core.suggestClose,
    core.openSearch, core.openSearchReplace, core.findNext, core.findPrev, core.closeSearch,
    core.toggleFindCaseSensitive, core.toggleFindWholeWord, core.toggleFindRegex,
    core.toggleFindInSelection, core.selectAllSearchMatches,
    core.openGotoLine, core.toggleFold, core.unfoldCode, core.foldAll, core.unfoldAll,
    core.toggleComment, core.toggleBlockComment, core.deleteBracketPair,
]

export function uncoveredDefaultKeymap(): string[] {
    const covered = new Set(COVERED_COMMANDS)
    const miss: string[] = []
    for (const b of defaultKeymap) {
        for (const fn of [b.run, b.shift]) {
            if (!fn) continue
            if (!covered.has(fn as (typeof COVERED_COMMANDS)[number]))
                miss.push(fn.name || b.key)
        }
    }
    return miss
}

type Row = {
    id: string
    group: string
    n: number
    ok: boolean
    p50: number
    p95: number
    worst: number
    avg: number
    over16: number
    note?: string
}

type Report = {
    phase: string
    fixture: string
    lines: number
    chars: number
    loadMs: number
    when: string
    rows: Row[]
}

const host = document.getElementById('host')
const reportEl = document.getElementById('report')

function setReport(obj: Report | { phase: string, error?: string } | string) {
    if (!reportEl) return
    if (typeof obj === 'string') {
        reportEl.textContent = obj
        return
    }
    ;(window as unknown as { __opsReport: unknown }).__opsReport = obj
    reportEl.textContent = JSON.stringify(obj, null, 2)
}

const yield0 = () => new Promise<void>(r => setTimeout(r, 0))

function pct(xs: number[], p: number) {
    if (!xs.length) return 0
    const s = [...xs].sort((a, b) => a - b)
    return s[Math.min(s.length - 1, Math.floor((s.length - 1) * p))]
}

function withSyncTimeouts<T>(fn: () => T): T {
    const w = window
    const real = w.setTimeout.bind(w)
    const realClear = w.clearTimeout.bind(w)
    w.setTimeout = ((cb: TimerHandler, ms?: number, ...args: unknown[]) => {
        if (!ms) {
            try {
                if (typeof cb === 'function') (cb as (...a: unknown[]) => void)(...args)
            } catch { /* */ }
            return -1 as unknown as number
        }
        return real(cb, ms, ...args)
    }) as typeof setTimeout
    w.clearTimeout = ((id: number) => {
        if (id !== -1) realClear(id)
    }) as typeof clearTimeout
    try {
        return fn()
    } finally {
        w.setTimeout = real
        w.clearTimeout = realClear
    }
}

function flushScroll(v: EditorView) {
    withSyncTimeouts(() => {
        ;(v as unknown as { scrollRAF: number }).scrollRAF = 0
        v.scrollDOM.dispatchEvent(new Event('scroll'))
    })
}

function isWordChar(ch: string) {
    const c = ch.charCodeAt(0)
    return (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c === 36
        || (c >= 48 && c <= 57)
}

function wordOnLine(text: string): { from: number, to: number } | null {
    let i = 0
    while (i < text.length && !isWordChar(text[i]!)) i++
    if (i >= text.length) return null
    let j = i + 1
    while (j < text.length && isWordChar(text[j]!)) j++
    return { from: i, to: j }
}

function goLine(v: EditorView, n: number, col = 0) {
    const line = v.state.doc.line(Math.min(Math.max(1, n), v.state.doc.lines))
    const pos = line.from + Math.min(Math.max(0, col), line.length)
    v.dispatch(v.state.update({ selection: { anchor: pos } }))
}

function goMidWord(v: EditorView) {
    const mid = Math.floor(v.state.doc.lines / 2)
    for (let d = 0; d < 80; d++) {
        for (const n of [mid + d, mid - d]) {
            if (n < 1 || n > v.state.doc.lines) continue
            const line = v.state.doc.line(n)
            const w = wordOnLine(line.text)
            if (!w || w.to - w.from < 3) continue
            v.dispatch(v.state.update({ selection: { anchor: line.from + w.from, head: line.from + w.to } }))
            return line.text.slice(w.from, w.to)
        }
    }
    goLine(v, mid)
    return ''
}

function goOpenParen(v: EditorView) {
    const mid = Math.floor(v.state.doc.lines / 2)
    for (let n = mid; n < Math.min(v.state.doc.lines, mid + 200); n++) {
        const line = v.state.doc.line(n)
        const i = line.text.indexOf('(')
        if (i >= 0) {
            v.dispatch(v.state.update({ selection: { anchor: line.from + i + 1 } }))
            return true
        }
    }
    return false
}

function restore(v: EditorView, text: string) {
    try {
        v.dispatch(v.state.update({
            changes: { from: 0, to: v.state.doc.length, insert: text },
            selection: { anchor: 0 },
            annotations: isolateHistory.of('full'),
        }))
        v.scrollDOM.scrollTop = 0
        flushScroll(v)
    } catch (e) {
        console.warn('restore failed', e)
    }
}

function cmd(v: EditorView, fn: core.StateCommand) {
    return fn(v)
}

function statsOf(id: string, group: string, times: number[], note?: string): Row {
    const n = times.length
    const avg = n ? times.reduce((a, b) => a + b, 0) / n : 0
    return {
        id, group, n, ok: n > 0,
        p50: +pct(times, 0.5).toFixed(2),
        p95: +pct(times, 0.95).toFixed(2),
        worst: +pct(times, 0.99).toFixed(2),
        avg: +avg.toFixed(2),
        over16: times.filter(t => t > 16.7).length,
        note,
    }
}

async function measure(
    id: string,
    group: string,
    n: number,
    fn: () => unknown | Promise<unknown>,
): Promise<Row> {
    try {
        await fn()
    } catch (e) {
        return { id, group, n: 0, ok: false, p50: 0, p95: 0, worst: 0, avg: 0, over16: 0, note: String(e) }
    }
    const times: number[] = []
    for (let i = 0; i < n; i++) {
        const t0 = performance.now()
        try {
            await fn()
        } catch (e) {
            return { id, group, n: times.length, ok: false, p50: 0, p95: 0, worst: 0, avg: 0, over16: 0, note: String(e) }
        }
        times.push(performance.now() - t0)
    }
    return statsOf(id, group, times)
}

async function run() {
    if (!host) throw new Error('no #host')
    const partial: Report = {
        phase: 'init',
        fixture: 'dist/index.js',
        lines: 0, chars: 0, loadMs: 0,
        when: new Date().toISOString(),
        rows: [],
    }
    setReport(partial)
    const hl = await createHighlighter({ themes: ['dark-plus'], langs: ['typescript', 'javascript'] })
    const style = document.createElement('style')
    style.textContent = `#host .cm-editor { height: 100%; font-family: ui-monospace, Menlo, monospace; font-size: 13px; line-height: 20px; }`
    document.head.appendChild(style)
    const v = liteMonaco({
        parent: host,
        options: { automaticLayout: true }, // 容器尺寸变了自动重排(Monaco 默认 false,要自己调 layout())
        highlighter: hl as unknown as ShikiLike,
        doc: '// ops bench\n',
        lang: 'typescript',
        theme: 'dark-plus',
    })
    ;(window as unknown as { __cm7: EditorView }).__cm7 = v

    setReport({ ...partial, phase: 'fetch' })
    const text = await (await fetch('/fixtures/index.js.txt')).text()
    await yield0()
    const tLoad = performance.now()
    try {
        v.dispatch(v.state.update({
            changes: { from: 0, to: v.state.doc.length, insert: text },
            selection: { anchor: 0 },
            annotations: isolateHistory.of('full'),
        }))
        v.scrollDOM.scrollTop = 0
        flushScroll(v)
    } catch (e) {
        partial.phase = 'error'
        partial.rows.push({
            id: 'load.replace', group: 'load', n: 0, ok: false,
            p50: 0, p95: 0, worst: 0, avg: 0, over16: 0,
            note: String(e instanceof Error ? e.message : e),
        })
        setReport(partial)
        throw e
    }
    const loadMs = performance.now() - tLoad
    partial.lines = v.state.doc.lines
    partial.chars = v.state.doc.length
    partial.loadMs = +loadMs.toFixed(1)
    partial.phase = 'bench'
    setReport(partial)
    await yield0()

    const rows = partial.rows
    const push = (r: Row) => {
        rows.push(r)
        setReport({ ...partial, phase: `bench:${r.id}` })
    }

    push(statsOf('load.replace', 'load', [loadMs]))

    const sc = v.scrollDOM
    const maxScroll = Math.max(0, sc.scrollHeight - sc.clientHeight)
    push(await measure('scroll.wheel20', 'scroll', 20, () => {
        withSyncTimeouts(() => {
            ;(v as unknown as { scrollRAF: number }).scrollRAF = 0
            sc.scrollTop = Math.min(maxScroll, sc.scrollTop + 20)
            sc.dispatchEvent(new Event('scroll'))
        })
    }))
    push(await measure('scroll.jump', 'scroll', 8, () => {
        withSyncTimeouts(() => {
            ;(v as unknown as { scrollRAF: number }).scrollRAF = 0
            sc.scrollTop = Math.floor(Math.random() * maxScroll)
            sc.dispatchEvent(new Event('scroll'))
        })
    }))
    let jumpI = 0
    push(await measure('scroll.page', 'scroll', 6, () => {
        withSyncTimeouts(() => {
            ;(v as unknown as { scrollRAF: number }).scrollRAF = 0
            jumpI++
            sc.scrollTop = Math.min(maxScroll, jumpI * sc.clientHeight)
            sc.dispatchEvent(new Event('scroll'))
        })
    }))
    const hm = v.metrics.height
    const sh = sc.scrollHeight
    push({
        id: 'geometry.scrollHeight', group: 'scroll', n: 1, ok: Math.abs(hm - sh) < 2,
        p50: 0, p95: 0, worst: 0, avg: 0, over16: 0,
        note: `heightMap=${hm} scrollHeight=${sh}`,
    })
    sc.scrollTop = 0
    flushScroll(v)
    await yield0()

    const typeAt = (insert: string) => {
        const head = v.state.selection.main.head
        v.dispatch(v.state.update({
            changes: { from: head, insert },
            selection: { anchor: head + insert.length },
            userEvent: 'input.type',
        }))
    }
    goLine(v, Math.floor(v.state.doc.lines / 2), 4)
    flushScroll(v)
    push(await measure('type.char', 'input', 12, () => typeAt('x')))
    push(await measure('type.newline', 'input', 6, () => cmd(v, core.insertNewlineAndIndent)))
    push(await measure('type.tab', 'input', 6, () => cmd(v, core.insertTab)))
    push(await measure('delete.charBackward', 'input', 12, () => cmd(v, core.deleteCharBackward)))
    typeAt('zzzz')
    push(await measure('delete.charForward', 'input', 4, () => {
        const head = v.state.selection.main.head
        v.dispatch(v.state.update({ selection: { anchor: Math.max(0, head - 1) } }))
        cmd(v, core.deleteCharForward)
    }))
    goMidWord(v)
    v.dispatch(v.state.update({ selection: { anchor: v.state.selection.main.to } }))
    push(await measure('delete.groupBackward', 'input', 4, () => cmd(v, core.deleteGroupBackward)))
    goLine(v, Math.floor(v.state.doc.lines / 3), 2)
    push(await measure('delete.line', 'input', 4, () => cmd(v, core.deleteLine)))
    goLine(v, Math.floor(v.state.doc.lines / 3), 8)
    push(await measure('delete.toLineStart', 'input', 3, () => cmd(v, core.deleteToLineStart)))
    goLine(v, Math.floor(v.state.doc.lines / 3), 2)
    push(await measure('delete.toLineEnd', 'input', 3, () => cmd(v, core.deleteToLineEnd)))
    goLine(v, Math.floor(v.state.doc.lines / 3), 0)
    push(await measure('delete.lineContentOrJoin', 'input', 3, () => cmd(v, core.deleteLineContentOrJoin)))
    if (goOpenParen(v)) {
        v.dispatch(v.state.update({
            changes: { from: v.state.selection.main.head, insert: ')' },
            selection: { anchor: v.state.selection.main.head },
        }))
        push(await measure('delete.bracketPair', 'input', 3, () => {
            if (!cmd(v, core.deleteBracketPair)) {
                v.dispatch(v.state.update({
                    changes: { from: v.state.selection.main.head, insert: '()' },
                    selection: { anchor: v.state.selection.main.head + 1 },
                }))
                cmd(v, core.deleteBracketPair)
            }
        }))
    }
    restore(v, text)
    await yield0()

    goLine(v, Math.floor(v.state.doc.lines / 2), 8)
    push(await measure('cursor.char', 'cursor', 30, () => cmd(v, core.cursorCharForward)))
    push(await measure('cursor.line', 'cursor', 20, () => cmd(v, core.cursorLineDown)))
    push(await measure('cursor.word', 'cursor', 16, () => cmd(v, core.cursorWordEndRight)))
    push(await measure('cursor.subword', 'cursor', 16, () => cmd(v, core.cursorSubwordForward)))
    push(await measure('cursor.lineStart', 'cursor', 10, () => cmd(v, core.cursorLineBoundaryBackward)))
    push(await measure('cursor.lineEnd', 'cursor', 10, () => cmd(v, core.cursorLineBoundaryForward)))
    push(await measure('cursor.docStart', 'cursor', 4, () => cmd(v, core.cursorDocStart)))
    push(await measure('cursor.docEnd', 'cursor', 4, () => cmd(v, core.cursorDocEnd)))
    goLine(v, Math.floor(v.state.doc.lines / 4), 0)
    push(await measure('cursor.pageDown', 'cursor', 6, () => cmd(v, core.cursorPageDown)))
    push(await measure('cursor.pageUp', 'cursor', 6, () => cmd(v, core.cursorPageUp)))
    goOpenParen(v)
    push(await measure('cursor.matchingBracket', 'cursor', 8, () => cmd(v, core.cursorMatchingBracket)))
    await yield0()

    goLine(v, 200, 0)
    push(await measure('select.all', 'select', 4, () => cmd(v, core.selectAll)))
    push(await measure('select.line', 'select', 8, () => cmd(v, core.selectLine)))
    goLine(v, 200, 4)
    push(await measure('select.extendChar', 'select', 16, () => cmd(v, core.selectCharForward)))
    push(await measure('select.extendLine', 'select', 10, () => cmd(v, core.selectLineDown)))
    push(await measure('select.page', 'select', 4, () => cmd(v, core.selectPageDown)))
    push(await measure('scroll.lineDown', 'cursor', 4, () => cmd(v, core.scrollLineDown)))
    push(await measure('scroll.pageDown', 'cursor', 6, () => cmd(v, core.scrollPageDown)))
    const word = goMidWord(v)
    push(await measure('select.nextOccurrence', 'select', 8, () => cmd(v, core.selectNextOccurrence)))
    cmd(v, core.simplifySelection)
    if (word) {
        const line = v.state.doc.lineAt(v.state.selection.main.head)
        const i = line.text.indexOf(word)
        if (i >= 0)
            v.dispatch(v.state.update({ selection: { anchor: line.from + i, head: line.from + i + word.length } }))
    }
    push(await measure('select.allOccurrences', 'select', 2, () => cmd(v, core.selectAllOccurrences)))
    push(await measure('select.simplify', 'select', 4, () => cmd(v, core.simplifySelection)))
    restore(v, text)
    await yield0()

    goLine(v, Math.floor(v.state.doc.lines / 2), 0)
    push(await measure('line.moveDown', 'line', 6, () => cmd(v, core.moveLineDown)))
    push(await measure('line.moveUp', 'line', 6, () => cmd(v, core.moveLineUp)))
    push(await measure('line.copyDown', 'line', 4, () => cmd(v, core.copyLineDown)))
    push(await measure('line.copyUp', 'line', 4, () => cmd(v, core.copyLineUp)))
    push(await measure('line.insertAfter', 'line', 4, () => cmd(v, core.insertLineAfter)))
    push(await measure('line.insertBefore', 'line', 4, () => cmd(v, core.insertLineBefore)))
    push(await measure('indent.more', 'line', 6, () => cmd(v, core.indentMore)))
    push(await measure('indent.less', 'line', 6, () => cmd(v, core.indentLess)))
    push(await measure('comment.line', 'line', 6, () => cmd(v, core.toggleComment)))
    push(await measure('comment.block', 'line', 4, () => cmd(v, core.toggleBlockComment)))
    restore(v, text)
    await yield0()

    goLine(v, Math.floor(v.state.doc.lines / 2), 4)
    typeAt('Q')
    push(await measure('history.undo', 'history', 6, () => {
        if (!cmd(v, core.undo)) typeAt('Q')
        cmd(v, core.undo)
    }))
    push(await measure('history.redo', 'history', 6, () => {
        if (!cmd(v, core.redo)) {
            typeAt('Q')
            cmd(v, core.undo)
            cmd(v, core.redo)
        }
    }))
    restore(v, text)
    await yield0()

    const findQ = { query: 'function', caseSensitive: false, wholeWord: false }
    push(await measure('find.matches', 'find', 4, () => findMatches(v.state, findQ)))
    goMidWord(v)
    push(await measure('find.openSearch', 'find', 4, () => cmd(v, core.openSearch)))
    core.setSearchQuery('function')(v)
    push(await measure('find.next', 'find', 8, () => cmd(v, core.findNext)))
    push(await measure('find.prev', 'find', 8, () => cmd(v, core.findPrev)))
    push(await measure('find.toggleFlags', 'find', 6, () => {
        cmd(v, core.toggleFindCaseSensitive)
        cmd(v, core.toggleFindWholeWord)
        cmd(v, core.toggleFindRegex)
    }))
    cmd(v, core.openSearchReplace)
    core.setReplacement('_fn_')(v)
    push(await measure('find.replaceNext', 'find', 4, () => cmd(v, core.replaceNext)))
    restore(v, text)
    cmd(v, core.openSearch)
    core.setSearchQuery('__ops_bench_token__')(v)
    core.setReplacement('x')(v)
    push(await measure('find.replaceAll', 'find', 2, () => cmd(v, core.replaceAll)))
    restore(v, text)
    cmd(v, core.openSearch)
    core.setSearchQuery('function')(v)
    push(await measure('find.selectAllMatches', 'find', 2, () => cmd(v, core.selectAllSearchMatches)))
    cmd(v, core.closeSearch)
    cmd(v, core.simplifySelection)
    restore(v, text)
    await yield0()

    let foldLine = 0
    for (let n = 1; n <= Math.min(v.state.doc.lines, 400); n++) {
        if (core.foldable(v.state, v.state.doc.line(n).from)) { foldLine = n; break }
    }
    if (foldLine) {
        goLine(v, foldLine, 0)
        push(await measure('fold.toggle', 'fold', 6, () => cmd(v, core.toggleFold)))
    }
    push(await measure('fold.all', 'fold', 1, () => cmd(v, core.foldAll)))
    push(await measure('fold.unfoldAll', 'fold', 1, () => cmd(v, core.unfoldAll)))
    restore(v, text)
    await yield0()

    goMidWord(v)
    v.dispatch(v.state.update({ selection: { anchor: v.state.selection.main.to } }))
    push(await measure('complete.start', 'complete', 4, () => cmd(v, core.suggestTrigger)))
    push(await measure('complete.next', 'complete', 6, () => cmd(v, core.suggestNext)))
    push(await measure('complete.prev', 'complete', 4, () => cmd(v, core.suggestPrev)))
    push(await measure('complete.page', 'complete', 2, () => cmd(v, core.suggestPageNext)))
    push(await measure('complete.close', 'complete', 2, () => cmd(v, core.suggestClose)))
    await yield0()

    const tsOpts = { lang: 'typescript' }
    const hoverSrc = tsQuickInfoSource(tsOpts)
    const ts = createTSActions(tsOpts)
    goMidWord(v)
    const pos = v.state.selection.main.from
    push(await measure('ts.ensure', 'ts', 1, async () => {
        await getTSService(tsOpts).ensure()
    }))
    push(await measure('ts.hover', 'ts', 3, async () => {
        await hoverSrc(v.state, pos, 1)
    }))
    goOpenParen(v)
    push(await measure('ts.signature', 'ts', 3, () => triggerSignatureHelp(v)))
    goMidWord(v)
    push(await measure('ts.goToDefinition', 'ts', 2, () => ts.goToDefinition(v)))
    push(await measure('ts.goToReferences', 'ts', 1, () => ts.goToReferences(v)))
    push(await measure('ts.codeActions', 'ts', 2, () => collectCodeActionsAt(v, tsOpts)))
    const svc = getTSService(tsOpts).service()
    push(await measure('ts.completions', 'ts', 2, async () => {
        await svc.getCompletionsAtPosition(getTSService(tsOpts).fileName, v.state.selection.main.head, undefined)
    }))
    push(await measure('ts.diagnostics', 'ts', 1, async () => {
        await svc.getSyntacticDiagnostics(getTSService(tsOpts).fileName)
    }))
    push(await measure('ts.formatDocument', 'ts', 1, () => ts.formatDocument(v)))
    restore(v, text)
    await yield0()

    push(await measure('panel.gotoLine', 'panel', 3, () => core.openGotoLine(v)))
    push(await measure('panel.commandPalette', 'panel', 3, () => core.openCommandPalette(v)))
    push(await measure('panel.contextMenu', 'panel', 3, () => {
        const r = v.contentDOM.getBoundingClientRect()
        v.contentDOM.dispatchEvent(new MouseEvent('contextmenu', {
            bubbles: true, clientX: r.left + 80, clientY: r.top + 40,
        }))
    }))
    await yield0()

    goLine(v, Math.floor(v.state.doc.lines / 2), 4)
    push(await measure('cursor.addBelow', 'multi', 6, () => cmd(v, core.addCursorBelow)))
    cmd(v, core.simplifySelection)
    push(await measure('cursor.addAbove', 'multi', 6, () => cmd(v, core.addCursorAbove)))
    cmd(v, core.simplifySelection)
    {
        const mid = v.state.doc.lineAt(v.state.selection.main.head)
        const end = v.state.doc.line(Math.min(v.state.doc.lines, mid.number + 2))
        v.dispatch(v.state.update({ selection: { anchor: mid.from, head: end.to } }))
    }
    push(await measure('cursor.atLineEnds', 'multi', 4, () => cmd(v, core.insertCursorAtEndOfEachLineSelected)))
    cmd(v, core.simplifySelection)
    restore(v, text)
    await yield0()

    goMidWord(v)
    try {
        push(await measure('clip.copy', 'clip', 3, () => cmd(v, copyCommand)))
    } catch (e) {
        push({ id: 'clip.copy', group: 'clip', n: 0, ok: false, p50: 0, p95: 0, worst: 0, avg: 0, over16: 0, note: String(e) })
    }
    try {
        push(await measure('clip.cut', 'clip', 2, () => cmd(v, cutCommand)))
        restore(v, text)
    } catch (e) {
        push({ id: 'clip.cut', group: 'clip', n: 0, ok: false, p50: 0, p95: 0, worst: 0, avg: 0, over16: 0, note: String(e) })
        restore(v, text)
    }
    try {
        push(await measure('clip.paste', 'clip', 2, () => cmd(v, pasteCommand)))
        restore(v, text)
    } catch (e) {
        push({ id: 'clip.paste', group: 'clip', n: 0, ok: false, p50: 0, p95: 0, worst: 0, avg: 0, over16: 0, note: String(e) })
        restore(v, text)
    }
    await yield0()

    goMidWord(v)
    const indentSrc = core.indentGuidesCM7()
    push(await measure('deco.activeLine', 'deco', 10, () => core.activeLineDecorations(v.state)))
    push(await measure('deco.selectionMatch', 'deco', 6, () => core.selectionMatchDecorations(v.state)))
    push(await measure('deco.bracketMatch', 'deco', 8, () => core.bracketMatchingDecorations(v.state)))
    push(await measure('deco.indentGuides', 'deco', 6, () => indentSrc(v.state, v)))
    push(await measure('deco.stickyScroll', 'deco', 10, () => {
        const start = v.viewportStartLine
        core.computeStickyLines(v.state.doc, start)
    }))
    push(await measure('deco.matchBands', 'deco', 4, () => core.matchBands(v.state)))
    push(await measure('deco.collectMarks', 'deco', 8, () => core.collectMarks(v.state)))
    push(await measure('deco.vScrollGeometry', 'deco', 20, () =>
        core.vScrollGeometry(sc.clientHeight, sc.scrollHeight, sc.scrollTop)))

    restore(v, text)
    partial.phase = 'done'
    partial.when = new Date().toISOString()
    setReport(partial)
}

if (host) {
    void run().catch(e => {
        const prev = (window as unknown as { __opsReport?: Report }).__opsReport
        setReport({
            phase: 'error',
            error: e instanceof Error ? (e.stack || e.message) : String(e),
            ...(prev && prev.rows ? { rows: prev.rows, lines: prev.lines, chars: prev.chars, loadMs: prev.loadMs, fixture: prev.fixture, when: prev.when } : {}),
        } as Report)
    })
}
