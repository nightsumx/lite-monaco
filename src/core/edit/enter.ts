// 回车 / ⌘Enter / ⌘⇧Enter,逐条对齐 Monaco 0.52(cursorTypeEditOperations 的 _enter、
// languages/enterAction、onEnter 与 textModel 的 trimAutoWhitespace),语言配置取 Monaco 的 TS 配置:
//
//   1. onEnterRules(C 系语言,块注释为 /* */ 时启用):
//        `/** ‸ */`  → IndentOutdent + " * "      `/** …‸`  → " * "
//        ` * …‸`     → "* "(续行)                  ` */‸`    → 去掉 1 个空白
//   2. 括号:光标前(去尾空白)是开括号且光标后(去首空白)是对应闭括号 → 展开成三行;只有开括号 → 多缩一级。
//   3. 其余:新行缩进 = 本行前导空白截到光标列(光标在缩进里回车,不会多出缩进)。
//   缩进统一经 normalizeIndentation(按 indentSize / insertSpaces 重写前导空白)。
//
// trimAutoWhitespace:回车自动插入的纯空白行记下来;下一次回车如果没有改到那一行(只在它行尾/行首插
// 换行),先把那行的空白删掉。Monaco 在「任何编辑」时都会做这一步,这里只在回车类命令里做(见 FIX 报告)。
// 记录挂在这次产出的 EditorSelection 对象上:选区一变(移动光标、输入)记录就失效。

import type { ChangeSpec } from '../model/change'
import type { Rope } from '../model/rope'
import type { SelectionRange } from '../model/selection'
import type { StateCommand, Transaction } from '../model/state'
import { EditorSelection } from '../model/selection'
import { EditorState, Facet, StateEffect, StateField } from '../model/state'
import { getCommentTokens } from './commenttokens'
import { bracketSkip, stripSkippedBrackets, type BracketSkip } from './brackets'
import { AutoIndent, autoIndentLevel, boolOption } from './editoptions'
import { fullIndentRules, indentForEnter, type IndentationRules, type RuleModel } from './autoindent'
import { indentRuleLines } from './indent'

// —— 缩进配置 / 规范化 ——

export interface IndentConfig { tabSize: number, indentSize: number, insertSpaces: boolean }

// 显式的 indentSize(Monaco updateOptions({ indentSize: N }),Indent Using Spaces / Tabs、Detect Indentation 写进来)。
// 'tabSize' = 跟着 tabSize 走(Monaco 默认 indentSize: 'tabSize',_indentSizeIsTabSize)。
// 没配:空格缩进取 indentUnit 长度(indentUnit 没配时本身就是 tabSize 个空格 = 跟着 tabSize),Tab 缩进取 tabSize。
export const indentSizeFacet = Facet.define<number | 'tabSize', number | 'tabSize' | undefined>({ combine: vs => vs[0] })

export function indentConfig(state: EditorState): IndentConfig {
    const unit = state.indentUnit
    const insertSpaces = !unit.includes('\t')
    const opt = state.facet(indentSizeFacet)
    const indentSize = typeof opt === 'number' ? opt
        : opt === 'tabSize' || !insertSpaces ? state.tabSize
            : (unit.length || state.tabSize)
    return { tabSize: state.tabSize, indentSize, insertSpaces }
}

/** indentSize 是否跟着 tabSize 走(Monaco originalIndentSize === 'tabSize')。宿主显式配了空格 indentUnit 算显式。 */
export function indentSizeFollowsTabSize(state: EditorState): boolean {
    const opt = state.facet(indentSizeFacet)
    if (opt !== undefined) return opt === 'tabSize'
    const unit = state.facet(EditorState.indentUnit)
    return unit == null || unit.includes('\t')
}

function isWs(c: number) { return c === 32 || c === 9 }

export function leadingWhitespaceOf(text: string): string {
    let i = 0
    while (i < text.length && isWs(text.charCodeAt(i))) i++
    return text.slice(0, i)
}

export function isBlank(text: string): boolean {
    for (let i = 0; i < text.length; i++) if (!isWs(text.charCodeAt(i))) return false
    return true
}

// Monaco normalizeIndentation:前导空白按 indentSize 折算成列,再按 insertSpaces 重写。
export function normalizeIndentation(str: string, cfg: IndentConfig): string {
    const lead = leadingWhitespaceOf(str)
    let spaces = 0
    for (let i = 0; i < lead.length; i++) {
        if (lead.charCodeAt(i) === 9) spaces = spaces + cfg.indentSize - (spaces % cfg.indentSize)
        else spaces++
    }
    let out = ''
    if (!cfg.insertSpaces) {
        out = '\t'.repeat(Math.floor(spaces / cfg.indentSize))
        spaces %= cfg.indentSize
    }
    return out + ' '.repeat(spaces) + str.slice(lead.length)
}

// —— onEnter ——

export const enum IndentAction { None = 0, Indent = 1, IndentOutdent = 2, Outdent = 3 }

interface OnEnterResult { indentAction: IndentAction, appendText?: string, removeText?: number }

// `^\s*\/\*\*(?!\/)([^\*]|\*(?!\/))*$`
function isDocCommentOpen(text: string): boolean {
    const t = text.slice(leadingWhitespaceOf(text).length)
    if (!t.startsWith('/**') || t.charCodeAt(3) === 47) return false
    return !t.slice(3).includes('*/')
}

// `(\t|(\ \ ))*\ ` 开头:前导空白以单个空格结尾,其余由 Tab 和成对空格组成。返回 `*` 的下标,不符合返 -1。
function starLineStart(text: string): number {
    const lead = leadingWhitespaceOf(text)
    if (!lead.endsWith(' ') || text.charCodeAt(lead.length) !== 42) return -1
    let run = 0
    for (let i = 0; i < lead.length - 1; i++) {
        if (lead.charCodeAt(i) === 32) run++
        else { if (run % 2) return -1; run = 0 }
    }
    return run % 2 ? -1 : lead.length
}

// ── 语言配置(setLanguageConfiguration 的 onEnterRules / brackets)──
// 装了就整体替换下面写死的 C 系规则和 {} [] () 括号逻辑(Monaco:一种语言只有一份配置,给了就以它为准)。
export interface OnEnterRuleConfig {
    beforeText: RegExp
    afterText?: RegExp
    previousLineText?: RegExp
    action: { indentAction: IndentAction, appendText?: string, removeText?: number }
}
export interface OnEnterConfig { rules: readonly OnEnterRuleConfig[], brackets: readonly (readonly [string, string])[] }
export const onEnterConfig = Facet.define<OnEnterConfig, OnEnterConfig | null>({ combine: v => v[v.length - 1] ?? null })

const escapeRe = (s: string) => s.replace(/[-\\\/{}()*+?.,^$|#\s[\]]/g, '\\$&')
const isWordCh = (c: string) => /\w/.test(c)
// Monaco OnEnterSupport._createOpenBracketRegExp / _createCloseBracketRegExp
const bracketReCache = new WeakMap<object, { open: RegExp, close: RegExp }[]>()
function bracketRegExps(c: OnEnterConfig): { open: RegExp, close: RegExp }[] {
    let r = bracketReCache.get(c)
    if (!r) {
        r = c.brackets.map(([o, cl]) => {
            let open = escapeRe(o)
            if (isWordCh(o[0] ?? '')) open = '\\b' + open
            let close = escapeRe(cl)
            if (isWordCh(cl[cl.length - 1] ?? '')) close += '\\b'
            return { open: new RegExp(open + '\\s*$'), close: new RegExp('^\\s*' + close) }
        })
        bracketReCache.set(c, r)
    }
    return r
}

// 带 g / y 标志的正则 test 有 lastIndex 状态,不重置会隔次失灵(Monaco issue #121125)
function ruleTest(re: RegExp, text: string): boolean {
    re.lastIndex = 0
    return re.test(text)
}

function configuredOnEnter(state: EditorState, c: OnEnterConfig, before: string, after: string, previousLine: string): OnEnterResult | null {
    const level = autoIndentLevel(state)
    if (level >= AutoIndent.Advanced) {
        for (const rule of c.rules) {
            if (!ruleTest(rule.beforeText, before)) continue
            if (rule.afterText && !ruleTest(rule.afterText, after)) continue
            if (rule.previousLineText && !ruleTest(rule.previousLineText, previousLine)) continue
            return rule.action
        }
    }
    if (level < AutoIndent.Brackets) return null
    const res = bracketRegExps(c)
    if (before.length > 0 && after.length > 0)
        for (const b of res) if (b.open.test(before) && b.close.test(after)) return { indentAction: IndentAction.IndentOutdent }
    if (before.length > 0)
        for (const b of res) if (b.open.test(before)) return { indentAction: IndentAction.Indent }
    return null
}

function onEnterRules(state: EditorState, before: string, after: string): OnEnterResult | null {
    if (getCommentTokens(state).block?.open !== '/*') return null
    if (isDocCommentOpen(before)) {
        const a = after.slice(leadingWhitespaceOf(after).length)
        if (a === '*/') return { indentAction: IndentAction.IndentOutdent, appendText: ' * ' }
        return { indentAction: IndentAction.None, appendText: ' * ' }
    }
    const star = starLineStart(before)
    if (star >= 0) {
        const rest = before.slice(star + 1)
        // ` * …`:`*` 后为空,或空格开头且不含 `*/`
        if (rest === '' || (rest.charCodeAt(0) === 32 && !rest.includes('*/')))
            return { indentAction: IndentAction.None, appendText: '* ' }
        // ` */` + 空白
        if (rest.startsWith('/') && isBlank(rest.slice(1)))
            return { indentAction: IndentAction.None, removeText: 1 }
    }
    return null
}

const BRACKETS: [string, string][] = [['{', '}'], ['[', ']'], ['(', ')']]

function lastNonWs(text: string): string {
    let i = text.length
    while (i > 0 && isWs(text.charCodeAt(i - 1))) i--
    return i ? text[i - 1] : ''
}

function firstNonWs(text: string): string {
    return text.slice(leadingWhitespaceOf(text).length, leadingWhitespaceOf(text).length + 1)
}

export function onEnter(state: EditorState, before: string, after: string, previousLine = ''): OnEnterResult | null {
    const configured = state.facet(onEnterConfig)
    if (configured) return configuredOnEnter(state, configured, before, after, previousLine)
    // Monaco OnEnterSupport.onEnter:onEnterRules 要 Advanced 以上,括号逻辑要 Brackets 以上
    const level = autoIndentLevel(state)
    const rule = level >= AutoIndent.Advanced ? onEnterRules(state, before, after) : null
    if (rule) return rule
    if (level < AutoIndent.Brackets) return null
    const open = lastNonWs(before)
    if (before.length > 0 && after.length > 0) {
        const close = firstNonWs(after)
        for (const [o, c] of BRACKETS) if (open === o && close === c) return { indentAction: IndentAction.IndentOutdent }
    }
    if (before.length > 0) for (const [o] of BRACKETS) if (open === o) return { indentAction: IndentAction.Indent }
    return null
}

export interface EnterAction { indentAction: IndentAction, appendText: string, removeText: number, indentation: string }

// Monaco IndentationContextProcessor.getProcessedTokenContextAroundRange:[from, to] 前后(同行)和上一行,
// 字符串/注释/正则里的括号先去掉(skip)。选区非空时「后」取 to 所在行 to 之后;首行的「上一行」是空串。
export function enterContext(doc: Rope, from: number, to: number, skip?: BracketSkip): { before: string, after: string, previousLine: string } {
    const startLine = doc.lineAt(from)
    const endLine = doc.lineAt(to)
    const prev = startLine.number > 1 ? doc.line(startLine.number - 1) : null
    return {
        before: stripSkippedBrackets(startLine.text.slice(0, from - startLine.from), startLine.from, skip),
        after: stripSkippedBrackets(endLine.text.slice(to - endLine.from), to, skip),
        previousLine: prev ? stripSkippedBrackets(prev.text, prev.from, skip) : '',
    }
}

// Monaco getEnterAction:range = [from, to](可跨行);缩进取 from 所在行前导空白、截到 from 的列。
// skip:字符串/注释/正则里的括号先去掉再套规则(Monaco IndentationContextProcessor 同)。
export function getEnterAction(state: EditorState, from: number, to: number, skip?: BracketSkip): EnterAction | null {
    const startLine = state.doc.lineAt(from)
    const { before, after, previousLine } = enterContext(state.doc, from, to, skip)
    const r = onEnter(state, before, after, previousLine)
    if (!r) return null
    let appendText = r.appendText ?? ''
    if (!r.appendText) {
        appendText = r.indentAction === IndentAction.Indent || r.indentAction === IndentAction.IndentOutdent ? '\t' : ''
    }
    else if (r.indentAction === IndentAction.Indent) appendText = '\t' + appendText
    const removeText = r.removeText ?? 0
    let indentation = leadingWhitespaceOf(startLine.text).slice(0, from - startLine.from)
    if (removeText) indentation = indentation.slice(0, Math.max(0, indentation.length - removeText))
    return { indentAction: r.indentAction, appendText, removeText, indentation }
}

// Monaco TypeOperations.unshiftIndent(对一段纯缩进)
function unshiftIndentation(indent: string, cfg: IndentConfig): string {
    let col = 0
    for (let i = 0; i < indent.length; i++) col = indent.charCodeAt(i) === 9 ? col + cfg.tabSize - (col % cfg.tabSize) : col + 1
    const size = cfg.insertSpaces ? cfg.indentSize : cfg.tabSize
    const stop = Math.max(0, Math.ceil(col / size) - 1) * size
    return cfg.insertSpaces ? ' '.repeat(stop) : '\t'.repeat(stop / size)
}

// —— 一次回车的编辑 ——

interface EnterEdit {
    from: number
    to: number
    insert: string
    cursor: number // 插入文本内的光标偏移;-1 = 光标落在 from(不随插入移动)
    autoWhitespace: boolean
}

// autoIndent = 'full' 且配了 indentationRules 时的规则上下文(Monaco getIndentForEnter 要的 model)
interface EnterRules { rules: IndentationRules, model: RuleModel }

function enterRules(target: { state: EditorState }): EnterRules | null {
    const rules = fullIndentRules(target.state)
    if (!rules) return null
    const doc = target.state.doc
    const lines = indentRuleLines(target, doc)
    return { rules, model: { raw: n => doc.line(n).text, processed: n => lines.text(n) } }
}

function enterEdit(state: EditorState, from: number, to: number, skip?: BracketSkip, rules?: EnterRules | null): EnterEdit {
    const cfg = indentConfig(state)
    // Monaco _enter:autoIndent = None 只插换行;Keep 只带上当前行的缩进(截到光标列)
    const level = autoIndentLevel(state)
    if (level === AutoIndent.None) return { from, to, insert: '\n', cursor: 1, autoWhitespace: false }
    if (level === AutoIndent.Keep) {
        const l = state.doc.lineAt(from)
        const text = '\n' + normalizeIndentation(leadingWhitespaceOf(l.text).slice(0, from - l.from), cfg)
        return { from, to, insert: text, cursor: text.length, autoWhitespace: true }
    }
    const r = getEnterAction(state, from, to, skip)
    if (r) {
        if (r.indentAction === IndentAction.IndentOutdent) {
            const normal = normalizeIndentation(r.indentation, cfg)
            const increased = normalizeIndentation(r.indentation + r.appendText, cfg)
            return { from, to, insert: '\n' + increased + '\n' + normal, cursor: 1 + increased.length, autoWhitespace: true }
        }
        const base = r.indentAction === IndentAction.Outdent ? unshiftIndentation(r.indentation, cfg) : r.indentation
        const text = '\n' + normalizeIndentation(base + r.appendText, cfg)
        return { from, to, insert: text, cursor: text.length, autoWhitespace: true }
    }
    const line = state.doc.lineAt(from)
    if (rules) {
        // Monaco _enter 的 autoIndent >= Full 分支:新行缩进按 indentationRules 推(getIndentForEnter)。
        // 选区末尾落在那行的前导空白里时,把它后面的前导空白一起换掉(整行是空白就换到行尾);
        // 光标停在原来的视觉列(偏移 = min(原视觉列 - 新缩进长度, 0),Tab 缩进时视觉列先按 indentSize 折成级数)。
        const endLine = state.doc.lineAt(to)
        const before = stripSkippedBrackets(line.text.slice(0, from - line.from), line.from, skip)
        const after = stripSkippedBrackets(endLine.text.slice(to - endLine.from), to, skip)
        const ir = indentForEnter(rules.rules, rules.model, line.number, before, after, cfg)
        const fnw = leadingWhitespaceOf(endLine.text).length
        const blank = fnw === endLine.length
        const end = blank ? endLine.to : Math.max(to, endLine.from + fnw)
        const indent = normalizeIndentation(ir.afterEnter, cfg)
        let offset = 0
        if (!blank && to - endLine.from <= fnw) {
            let vcol = 0
            for (let i = endLine.from; i < to; i++) vcol = state.doc.sliceString(i, i + 1) === '\t' ? vcol + cfg.tabSize - (vcol % cfg.tabSize) : vcol + 1
            if (!cfg.insertSpaces) vcol = Math.ceil(vcol / cfg.indentSize)
            offset = Math.min(vcol - indent.length, 0)
        }
        const text = '\n' + indent
        return { from, to: end, insert: text, cursor: text.length + offset, autoWhitespace: true }
    }
    const indentation = leadingWhitespaceOf(line.text).slice(0, from - line.from)
    const text = '\n' + normalizeIndentation(indentation, cfg)
    return { from, to, insert: text, cursor: text.length, autoWhitespace: true }
}

// 上一次回车 / Tab 留下的自动空白行(行号,1 基)。同 Monaco 记在 model 上:光标怎么动都不影响,下一次改文档才清。
// 字段随 history() 装进去(setAutoWhitespace 效果由命令在同一事务里带上);没装字段时退化成不 trim。
const setAutoWhitespace = StateEffect.define<number[]>()
export const autoWhitespaceField = StateField.define<number[]>({
    create: () => [],
    update(value, tr) {
        for (const e of tr.effects) if (e.is(setAutoWhitespace)) return e.value
        return tr.docChanged ? [] : value
    },
})

interface RawEdit { from: number, to: number, insert: string }

/**
 * Monaco textModel._pushEditOperations 的 trimAutoWhitespace:上一次自动插入空白的行,只要这次编辑没有改到它
 * (或只是在它行尾 / 行首插换行),就把那行的空白删掉。返回要追加的删除改动。
 */
export function autoWhitespaceTrims(state: EditorState, edits: readonly RawEdit[]): ChangeSpec[] {
    if (!boolOption(state, 'trimAutoWhitespace', true)) return []
    const pending = state.field(autoWhitespaceField, false)
    if (!pending) return []
    const doc = state.doc
    const out: ChangeSpec[] = []
    for (const n of pending) {
        if (n > doc.lines) continue
        const line = doc.line(n)
        if (line.length === 0 || !isBlank(line.text)) continue
        const allowed = edits.every((e) => {
            const sl = doc.lineAt(e.from).number, el = doc.lineAt(e.to).number
            if (n < sl || n > el) return true
            if (n === sl && e.from === e.to && e.from === line.to && e.insert.startsWith('\n')) return true
            if (n === sl && e.from === e.to && e.from === line.from && e.insert.endsWith('\n')) return true
            return false
        })
        if (allowed) out.push({ from: line.from, to: line.to })
    }
    return out
}

/** 记下这次编辑新插入的纯空白行(插入前那行已有非空白内容的不算),下一次编辑时由 autoWhitespaceTrims 清理。 */
export function recordAutoWhitespace(state: EditorState,
    changeSet: ReturnType<EditorState['changes']>, edits: readonly (RawEdit & { autoWhitespace: boolean })[]): StateEffect<number[]>[] {
    if (!boolOption(state, 'trimAutoWhitespace', true)) return []
    const doc = state.doc
    const newDoc = changeSet.apply(doc)
    const record: number[] = []
    for (const e of edits) {
        if (!e.autoWhitespace || e.from !== e.to) continue
        const oldLine = doc.lineAt(e.from)
        const start = changeSet.mapPos(e.from, -1)
        const end = start + e.insert.length
        const first = newDoc.lineAt(start).number, last = newDoc.lineAt(end).number
        for (let n = first; n <= last; n++) {
            const text = newDoc.line(n).text
            const old = n === first ? oldLine.text : ''
            if (n === first && !isBlank(old)) continue
            if (text.length === 0 || text === old || !isBlank(text)) continue
            if (!record.includes(n)) record.push(n)
        }
    }
    return record.length ? [setAutoWhitespace.of(record)] : []
}

// userEvent:回车 'input.newline'(并进后面的输入);⌘Enter / ⌘⇧Enter 'input.insertLine'(前后各切一次撤销组,Monaco pushUndoStop)
function applyEnterEdits(state: EditorState, dispatch: (tr: Transaction) => void,
    edits: EnterEdit[], mainIndex: number, userEvent = 'input.newline'): void {
    const changes: ChangeSpec[] = [...autoWhitespaceTrims(state, edits)]
    for (const e of edits) changes.push({ from: e.from, to: e.to, insert: e.insert })
    const changeSet = state.changes(changes)
    const ranges: SelectionRange[] = edits.map((e) => {
        // 插入文本在新文档里从 mapPos(from, -1) 开始(同位置的 trim 删除不占位置)
        const start = changeSet.mapPos(e.from, -1)
        return EditorSelection.cursor(e.cursor < 0 ? start : start + e.cursor)
    })
    const selection = EditorSelection.create(ranges, Math.min(mainIndex, ranges.length - 1))
    dispatch(state.update({ changes: changeSet, selection, effects: recordAutoWhitespace(state, changeSet, edits), scrollIntoView: true, userEvent }))
}

function rangeOrder(state: EditorState): { ranges: readonly SelectionRange[], mainIndex: number } {
    return { ranges: state.selection.ranges, mainIndex: state.selection.mainIndex }
}

// target 通常是 EditorView:借它的 token 缓存认出字符串/注释里的括号
export const insertNewlineAndIndent: StateCommand = (target) => {
    const { state, dispatch } = target
    if (state.readOnly) return false
    const { ranges, mainIndex } = rangeOrder(state)
    const skip = bracketSkip(target, state.doc)
    const rules = enterRules(target)
    applyEnterEdits(state, dispatch, ranges.map(r => enterEdit(state, r.from, r.to, skip, rules)), mainIndex)
    return true
}

// ⌘Enter(Monaco lineInsertAfter):在本行行尾回车(套用回车的缩进规则)。
export const insertLineAfter: StateCommand = (target) => {
    const { state, dispatch } = target
    if (state.readOnly) return false
    const { ranges, mainIndex } = rangeOrder(state)
    const skip = bracketSkip(target, state.doc)
    const rules = enterRules(target)
    applyEnterEdits(state, dispatch, ranges.map((r) => {
        const end = state.doc.lineAt(r.head).to
        return enterEdit(state, end, end, skip, rules)
    }), mainIndex, 'input.insertLine')
    return true
}

// ⌘⇧Enter(Monaco lineInsertBefore):首行 → 行首插换行、光标留在新空行;否则在上一行行尾回车。
export const insertLineBefore: StateCommand = (target) => {
    const { state, dispatch } = target
    if (state.readOnly) return false
    const { ranges, mainIndex } = rangeOrder(state)
    const skip = bracketSkip(target, state.doc)
    const rules = enterRules(target)
    applyEnterEdits(state, dispatch, ranges.map((r): EnterEdit => {
        const line = state.doc.lineAt(r.head)
        if (line.number === 1) return { from: 0, to: 0, insert: state.lineBreak, cursor: -1, autoWhitespace: false }
        const end = line.from - 1
        return enterEdit(state, end, end, skip, rules)
    }), mainIndex, 'input.insertLine')
    return true
}
