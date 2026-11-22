// indentOnInput(对齐 Monaco/VSCode):在行首打闭括号 } ) ] 时,自动把该行缩进拉到匹配开括号所在行,
// 使闭符与其块对齐。纯决策:命中产出改写(替换行首空白 + 插入闭符 + 光标),否则 null(走默认插入)。
//
// 建模:仅当闭符是当前行「从行首到光标」的首个非空白(即光标前全空白)时触发——正在起一行敲 }。
// 光标在字符串 / 注释 / 正则里(块注释、模板串的续行)不触发。
// 反向括号深度扫找匹配开符,取其行缩进为目标。已对齐则返 null(不产生空变更)。

import type { EditorState } from '../model/state'
import type { InputHandler } from '../view/editorview'
import { EditorSelection } from '../model/selection'

import type { ChangeSpec } from '../model/change'
import { bracketSkip, CLOSE_OPEN, DEFAULT_BRACKETS, electricAction, matchBackward, stripSkippedBrackets, type BracketSkip } from './brackets'
import { indentRuleLines, leadingWs } from './indent'
import { fullIndentRules, indentActionForType, type RuleModel } from './autoindent'
import { indentConfig, leadingWhitespaceOf, normalizeIndentation } from './enter'
import { autoClosedEffect, autoClosedField, closeBracketChange } from './closebrackets'

export interface IndentChange {
    from: number
    to: number
    insert: string
    cursor: number // 绝对光标位置
}

export function indentOnCloseBracket(
    state: EditorState,
    at: number,
    insert: string,
    skip?: BracketSkip, // 字符串/注释里的括号不算(Monaco 同),见 brackets.ts
): IndentChange | null {
    if (!CLOSE_OPEN[insert])
        return null

    const line = state.doc.lineAt(at)
    const before = line.text.slice(0, at - line.from)
    // 光标处的 token 是字符串 / 注释 / 正则(块注释、模板串里的行)就不回缩(Monaco BracketElectricCharacterSupport:
    // findTokenIndexAtOffset(列 - 1),行尾取最后一个字符所在的 token;空行问不到,照旧)。
    // 光标前必须全空白(正在行首敲闭符)—— 两条都在 electricAction 里。
    const probe = at < line.to ? at : at - 1
    const inToken = skip && probe >= line.from && skip(probe)
    if (!electricAction(DEFAULT_BRACKETS, before, insert, inToken ? 2 : 0))
        return null

    const openPos = matchBackward(state.sliceDoc(0, line.from) + insert, insert, line.from, skip)
    if (openPos < 0)
        return null

    const openLine = state.doc.lineAt(openPos)
    if (openLine.number === line.number)
        return null // 同一行不调

    // Monaco _typeInterceptorElectricChar:typeText = normalizeIndentation(开符行缩进) + prefix + 闭符,替换行首到光标。
    // prefix = lineText.substring(第一个非空白, 光标);光标在前导空白里时 substring 两端对调,取的是光标到第一个
    // 非空白之间那段空白(`  |  x` 打 } 得 `  }  x`)。整行空白时第一个非空白列取光标列,prefix 为空。
    const target = normalizeIndentation(openLine.text.slice(0, leadingWs(openLine.text)), indentConfig(state))
    const fnw = leadingWs(line.text)
    const prefix = fnw < line.length ? line.text.substring(fnw, at - line.from) : ''
    if (target + prefix === before)
        return null // 已对齐,走默认插入(避免空变更)

    return {
        from: line.from,
        to: at,
        insert: target + prefix + insert,
        cursor: line.from + target.length + prefix.length + insert.length,
    }
}

// indentOnInput 的 inputHandler(注入 inputHandler facet)。单光标、纯插入才处理;命中则改写行首
// 缩进 + 插入闭符并 dispatch,返回 true 认领。auto-close 的过键在此之前咨询,不冲突。
export const indentOnInput: InputHandler = (view, from, to, insert) => {
    const { state } = view
    if (state.selection.ranges.length !== 1 || from !== to)
        return false
    const r = CLOSE_OPEN[insert] ? indentOnCloseBracket(state, from, insert, bracketSkip(view, state.doc)) : null
    if (!r)
        return false
    view.dispatch(state.update({
        changes: { from: r.from, to: r.to, insert: r.insert },
        selection: EditorSelection.cursor(r.cursor),
        userEvent: 'input.type',
        scrollIntoView: true,
    }))
    return true
}

// —— autoIndent = 'full' 时打字按 indentationRules 调缩进(Monaco AutoIndentOperation,排在自动配对 / 过键之前)——
// 每个选区都要有结果(getIndentActionForType 非 null 且和现在的缩进不同),否则整个不管,交给后面的拦截。
// 要调时:行首到选区末尾换成 新缩进 + 原来行首非空白到光标那段 + 字符;那段照 Monaco 用 substring,
// 光标在前导空白里时两端会对调(取的是光标到第一个非空白之间的空白)。
// 同时该自动配对的(Monaco getAutoClosingPairClose,按打字前的文档判断)把闭符一起插上并登记。
const AUTO_CLOSE_OPEN = new Set(['{', '[', '(', '"', '\'', '`'])

export const autoIndentOnType: InputHandler = (view, from, to, insert) => {
    const { state } = view
    if (state.readOnly || insert.length !== 1) return false
    const main = state.selection.main
    if (from !== main.from || to !== main.to) return false
    const rules = fullIndentRules(state)
    if (!rules) return false
    const doc = state.doc
    const cfg = indentConfig(state)
    const skip = bracketSkip(view, doc)
    const lines = indentRuleLines(view, doc)
    const model: RuleModel = { raw: n => doc.line(n).text, processed: n => lines.text(n) }
    const isOpen = AUTO_CLOSE_OPEN.has(insert)
    const ranges = state.selection.ranges
    const seenLines = new Set<number>()
    const edits: { from: number, to: number, text: string }[] = []
    for (const r of ranges) {
        const line = doc.lineAt(r.from)
        if (seenLines.has(line.number)) return false
        seenLines.add(line.number)
        const afterPos = r.empty ? r.from : r.to
        const afterLine = doc.lineAt(afterPos)
        const before = stripSkippedBrackets(line.text.slice(0, r.from - line.from), line.from, skip)
        const after = stripSkippedBrackets(afterLine.text.slice(afterPos - afterLine.from), afterPos, skip)
        const indent = indentActionForType(rules, model, line.number, before, after, insert, cfg, isOpen)
        if (indent === null) return false
        const current = leadingWhitespaceOf(line.text).slice(0, r.from - line.from)
        if (indent === normalizeIndentation(current, cfg)) return false
        const fnw = leadingWs(line.text)
        const prefix = fnw < line.length ? line.text.substring(fnw, r.from - line.from) : ''
        edits.push({ from: line.from, to: r.to, text: normalizeIndentation(indent, cfg) + prefix })
    }
    // 自动配对:装了 closeBrackets 才补;所有选区都得能补
    let close = ''
    if (state.field(autoClosedField, false) !== undefined) {
        for (const r of ranges) {
            const c = closeBracketChange(state, { from: r.from, to: r.to, insert }, r.empty, view)
            const pair = c && c.anchor === undefined && c.from === c.to && c.insert.length > insert.length ? c.insert.slice(insert.length) : ''
            if (!pair || (close && pair !== close)) { close = ''; break }
            close = pair
        }
    }
    const changes: ChangeSpec[] = edits.map(e => ({ from: e.from, to: e.to, insert: e.text + insert + close }))
    const set = state.changes(changes)
    const cursors = edits.map(e => set.mapPos(e.from, -1) + e.text.length + insert.length)
    view.dispatch(state.update({
        changes: set,
        selection: EditorSelection.create(cursors.map(p => EditorSelection.cursor(p)), state.selection.mainIndex),
        effects: close ? autoClosedEffect(cursors, cursors.map(p => [p - insert.length, p + close.length] as const)) : [],
        // Monaco:这次编辑前切撤销组(shouldPushStackElementBefore),之后的打字并进来
        userEvent: 'input.type.autoclose',
        scrollIntoView: true,
    }))
    return true
}
