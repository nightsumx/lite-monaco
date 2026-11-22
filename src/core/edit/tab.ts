// Tab / ⇧Tab / ⌘] / ⌘[,逐条对齐 Monaco 0.52(TypeOperations.tab / indent / outdent + ShiftCommand):
//
//   Tab,空光标:插空格到下一个 tab stop(insertSpaces=false 时插 \t);纯空白行先补到「合适缩进」。
//   Tab,单行且没选满整行:用到下一个 tab stop 的空格替换选区。
//   Tab,多行或整行选区 / ⌘]:逐行缩进一级(前导空白重写到下一个 tab stop)。多行时跳过空行;
//        选区止于某行行首时不缩那一行;选区起点在缩进里时保持原列(新缩进被选进来)。
//   ⇧Tab / ⌘[:逐行回退到上一个 tab stop(6 空格 → 4)。
//
// JSDoc 续行(` * foo`)的奇数列对齐:上一行回车会追加 ` * ` 时,那 1 个空格算正文,不参与缩进计算。

import type { ChangeSet, ChangeSpec } from '../model/change'
import type { Rope } from '../model/rope'
import type { SelectionRange } from '../model/selection'
import type { EditorState, StateCommand, Transaction } from '../model/state'
import { EditorSelection } from '../model/selection'
import type { IndentConfig } from './enter'
import { autoWhitespaceTrims, getEnterAction, indentConfig, isBlank, leadingWhitespaceOf, normalizeIndentation, recordAutoWhitespace } from './enter'
import { visibleColumn } from './vcol'
import { fullIndentRules, inheritIndentForLine, shiftIndentation } from './autoindent'
import { indentRuleLines } from './indent'
import { boolOption } from './editoptions'

function nextStop(col: number, size: number) { return col + size - (col % size) }
function prevStop(col: number, size: number) { return Math.max(0, Math.ceil(col / size) - 1) * size }

function shiftIndent(line: string, contentIndex: number, cfg: IndentConfig, unshift: boolean): string {
    const col = visibleColumn(line, contentIndex, cfg.tabSize)
    if (cfg.insertSpaces) {
        const stop = unshift ? prevStop(col, cfg.indentSize) : nextStop(col, cfg.indentSize)
        return ' '.repeat(stop)
    }
    const stop = unshift ? prevStop(col, cfg.tabSize) : nextStop(col, cfg.tabSize)
    return '\t'.repeat(stop / cfg.tabSize)
}

// 只改动和旧缩进不同的部分(公共前缀不动),这样光标/选区的映射和 Monaco 的追踪范围一致。
function replaceIndent(from: number, oldIndent: string, newIndent: string): ChangeSpec | null {
    let p = 0
    while (p < oldIndent.length && p < newIndent.length && oldIndent[p] === newIndent[p]) p++
    if (p === oldIndent.length && p === newIndent.length) return null
    return { from: from + p, to: from + oldIndent.length, insert: newIndent.slice(p) }
}

// changes 是原文坐标;finish 用整个事务的 ChangeSet(含其它选区的改动)算出该选区的新位置。
interface ShiftResult { changes: ChangeSpec[], finish: (all: ChangeSet, newDoc: Rope) => SelectionRange }

// Monaco ShiftCommand(useTabStops)。
function shiftRange(state: EditorState, range: SelectionRange, unshift: boolean): ShiftResult {
    const doc = state.doc
    const cfg = indentConfig(state)
    const startLine = doc.lineAt(range.from).number
    let endLine = doc.lineAt(range.to).number
    if (startLine !== endLine && range.to === doc.line(endLine).from) endLine--
    const indentEmpty = startLine === endLine
    const changes: ChangeSpec[] = []
    let startStaysPut = false
    let prevExtra = 0, extra = 0
    // 选项 useTabStops(默认 true)。false 时走 ShiftCommand 的另一支:整行加 / 减一级缩进,不对齐 tab stop
    const useTabStops = boolOption(state, 'useTabStops', true)
    for (let n = startLine; n <= endLine; n++, prevExtra = extra) {
        extra = 0
        const line = doc.line(n)
        const text = line.text
        let contentIndex = leadingWhitespaceOf(text).length
        if (unshift && (text.length === 0 || contentIndex === 0)) continue
        if (!indentEmpty && !unshift && text.length === 0) continue
        if (!useTabStops) {
            if (unshift) {
                // 最多删 indentSize 个空白,遇到 Tab 删到 Tab 为止
                let end = Math.min(contentIndex, cfg.indentSize)
                for (let i = 0; i < end; i++) if (text.charCodeAt(i) === 9) { end = i + 1; break }
                changes.push({ from: line.from, to: line.from + end })
            }
            else {
                changes.push({ from: line.from, insert: cfg.insertSpaces ? ' '.repeat(cfg.indentSize) : '\t' })
                if (n === startLine && !range.empty) startStaysPut = range.from - line.from === 0
            }
            continue
        }
        if (n > 1 && visibleColumn(text, contentIndex, cfg.tabSize) % cfg.indentSize !== 0) {
            const prev = doc.line(n - 1)
            const act = getEnterAction(state, prev.to, prev.to)
            if (act) {
                extra = prevExtra
                for (let j = 0; j < act.appendText.length && extra < cfg.indentSize; j++) {
                    if (act.appendText.charCodeAt(j) === 32) extra++
                    else break
                }
                if (act.removeText) extra = Math.max(0, extra - act.removeText)
                for (let j = 0; j < extra; j++) {
                    if (contentIndex === 0 || text.charCodeAt(contentIndex - 1) !== 32) break
                    contentIndex--
                }
            }
        }
        if (unshift && contentIndex === 0) continue
        const desired = shiftIndent(text, contentIndex, cfg, unshift)
        const ch = replaceIndent(line.from, text.slice(0, contentIndex), desired)
        if (ch) changes.push(ch)
        if (n === startLine && !range.empty) startStaysPut = range.from - line.from <= contentIndex
    }
    return {
        changes,
        finish(all, newDoc) {
            if (range.empty) {
                const line = doc.lineAt(range.head)
                // 纯空白行(含空行)上的空光标:落到这次改出来的缩进末尾 = 新行尾(Monaco _useLastEditRangeForCursorEndPosition)
                if (changes.length && (useTabStops ? leadingWhitespaceOf(line.text).length === line.length : !unshift && line.length === 0))
                    return EditorSelection.cursor(newDoc.lineAt(all.mapPos(line.from, -1)).to)
                // 空光标:在行尾时贴前(插入在前不动),否则贴后(Monaco trackSelection 的 stickiness)
                return EditorSelection.cursor(all.mapPos(range.head, range.head === line.to ? -1 : 1))
            }
            // 非空:两端都不随边界插入扩张(from 贴后、to 贴前)
            const from = all.mapPos(range.from, 1), to = all.mapPos(range.to, -1)
            let start = from
            if (startStaysPut) {
                const initialCol = range.from - doc.lineAt(range.from).from
                const newLine = newDoc.lineAt(from)
                if (from - newLine.from > initialCol) start = newLine.from + initialCol
            }
            return range.anchor <= range.head ? EditorSelection.range(start, to) : EditorSelection.range(to, start)
        },
    }
}

function runShift(state: EditorState, dispatch: (tr: Transaction) => void,
    each: (range: SelectionRange) => ShiftResult, userEvent: string, autoWhitespace = false): boolean {
    if (state.readOnly) return false
    const results = state.selection.ranges.map(each)
    // 多个选区落在同一行时只改一次(Monaco 各命令的改动按行去重)
    const seen = new Set<string>()
    const changes: ChangeSpec[] = []
    for (const r of results) for (const c of r.changes) {
        const k = JSON.stringify(c)
        if (!seen.has(k)) { seen.add(k); changes.push(c) }
    }
    if (!changes.length) return false
    // Tab 插的空白算「自动空白」(Monaco ReplaceCommand insertsAutoWhitespace):先清上次留的,再记这次的
    const edits = changes.map(c => c as { from: number, to: number, insert: string })
    const all = state.changes(autoWhitespace ? [...autoWhitespaceTrims(state, edits), ...changes] : changes)
    const newDoc = all.apply(state.doc)
    const ranges = results.map(r => r.finish(all, newDoc))
    const selection = EditorSelection.create(ranges, state.selection.mainIndex)
    const effects = autoWhitespace ? recordAutoWhitespace(state, all, edits.map(e => ({ ...e, autoWhitespace: true }))) : []
    dispatch(state.update({ changes: all, selection, effects, scrollIntoView: true, userEvent }))
    return true
}

// Tab 的「合适缩进」(Monaco TypeOperations._goodIndentForLine):autoIndent = 'full' 且配了 indentationRules 时
// 按规则推(getInheritIndentForLine,不尊重临时缩进);否则上一个非空行的缩进,上一行以开括号结尾再多一级(近似)。
function goodIndentForLine(state: EditorState, lineNumber: number, owner?: object): string {
    const rules = fullIndentRules(state)
    if (rules) {
        const doc = state.doc
        const lines = indentRuleLines(owner, doc)
        const r = inheritIndentForLine(rules, { raw: n => doc.line(n).text, processed: n => lines.text(n) }, lineNumber, false)
        if (r) return r.indent ? shiftIndentation(r.indentation, indentConfig(state)) : r.indentation
    }
    for (let n = lineNumber - 1; n >= 1; n--) {
        const text = state.doc.line(n).text
        if (isBlank(text)) continue
        // Monaco _goodIndentForLine:上一个非空行行尾按回车会得到的缩进(那行缩进 + 追加文本);语言没有回车规则就取不到 → 调用方退回一个 Tab
        const act = getEnterAction(state, state.doc.line(n).to, state.doc.line(n).to)
        return act ? act.indentation + act.appendText : ''
    }
    return ''
}

function jumpToNextIndent(state: EditorState, range: SelectionRange): ShiftResult {
    const cfg = indentConfig(state)
    const line = state.doc.lineAt(range.from)
    let text = '\t'
    if (cfg.insertSpaces) {
        const col = visibleColumn(line.text, range.from - line.from, cfg.tabSize)
        text = ' '.repeat(cfg.indentSize - (col % cfg.indentSize))
    }
    return { changes: [{ from: range.from, to: range.to, insert: text }], finish: all => EditorSelection.cursor(all.mapPos(range.to, 1)) }
}

export const insertTab: StateCommand = (target) => {
    const { state, dispatch } = target
    const cfg = indentConfig(state)
    return runShift(state, dispatch, (range) => {
        const line = state.doc.lineAt(range.from)
        if (range.empty) {
            if (isBlank(line.text)) {
                const good = normalizeIndentation(goodIndentForLine(state, line.number, target) || '\t', cfg)
                if (!line.text.startsWith(good))
                    return { changes: [{ from: line.from, to: line.to, insert: good }], finish: all => EditorSelection.cursor(all.mapPos(line.to, 1)) }
            }
            return jumpToNextIndent(state, range)
        }
        if (line.number === state.doc.lineAt(range.to).number && (range.from !== line.from || range.to !== line.to))
            return jumpToNextIndent(state, range)
        return shiftRange(state, range, false)
    }, 'input.indent', true)
}

export const indentMore: StateCommand = ({ state, dispatch }) =>
    runShift(state, dispatch, r => shiftRange(state, r, false), 'input.indent')

export const indentLess: StateCommand = ({ state, dispatch }) =>
    runShift(state, dispatch, r => shiftRange(state, r, true), 'delete.dedent')
