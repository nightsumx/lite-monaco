// ⌥↑/↓ 搬行时的自动缩进,逐条对齐 Monaco MoveLinesCommand(autoIndent = Full 且语言配了 indentationRules 才生效):
//   · 先看 onEnter 规则(matchEnterRule:被搬的行跟着上面那行的回车缩进走);
//   · 没命中再看 indentationRules(getGoodIndentForLine,在「搬完之后」的虚拟文档上推);
//   · 搬的是整块,块内每行同时平移一个缩进偏移(getIndentEditsOfMovingBlock)。
// 返回「被挪过去那一行的新文本」(仅向下搬时可能改缩进)和「选中块的缩进偏移(空格数)」。纯计算,不落编辑。

import type { EditorState } from '../model/state'
import { fullIndentRules, inheritIndentForLine, shiftIndentation, testRule, unshiftIndentation, type IndentationRules, type RuleModel } from './autoindent'
import { bracketSkip } from './brackets'
import { getEnterAction, IndentAction, indentConfig, leadingWhitespaceOf, onEnter, type EnterAction, type IndentConfig } from './enter'
import { indentRuleLines, type IndentRuleLines } from './indent'

export function spaceCount(indent: string, tabSize: number): number {
    let n = 0
    for (let i = 0; i < indent.length; i++) n += indent.charCodeAt(i) === 9 ? tabSize : 1
    return n
}

export function generateIndent(spaces: number, tabSize: number, insertSpaces: boolean): string {
    spaces = spaces < 0 ? 0 : spaces
    let out = ''
    if (!insertSpaces) {
        out = '\t'.repeat(Math.floor(spaces / tabSize))
        spaces %= tabSize
    }
    return out + ' '.repeat(spaces)
}

const trimStart = (s: string) => s.replace(/^\s+/, '')
const hasNonWs = (s: string) => /\S/.test(s)

interface Ctx {
    state: EditorState
    rules: IndentationRules
    cfg: IndentConfig
    lines: IndentRuleLines
    skip: ReturnType<typeof bracketSkip>
}

/** 虚拟文档:override(n) 给出第 n 行换成「原文第 src 行 + 新文本」;其余行照原文。 */
type Override = (n: number) => { src: number, text: string, keepProcessed?: boolean } | null

function virtualModel(c: Ctx, override: Override): RuleModel {
    const doc = c.state.doc
    return {
        raw: n => override(n)?.text ?? doc.line(n).text,
        processed: n => {
            const o = override(n)
            // keepProcessed:token 还是原行的(Monaco 虚拟文档只换 getLineContent,getProcessedLine 读 token 文本,缩进没跟着换)
            return o ? (o.keepProcessed ? c.lines.text(o.src) : c.lines.text(o.src, leadingWhitespaceOf(o.text))) : c.lines.text(n)
        },
    }
}

// Monaco getGoodIndentForLine:按虚拟文档第 lineNumber 行之上的内容推它该有的缩进;推不出 null
function goodIndentForLine(c: Ctx, vm: RuleModel, lineNumber: number): string | null {
    const indent = inheritIndentForLine(c.rules, vm, lineNumber, true)
    if (!indent) return null
    const decrease = testRule(c.rules.decreaseIndentPattern, vm.processed(lineNumber))
    if (indent.line !== undefined) {
        let apply = true
        for (let n = indent.line; n < lineNumber - 1; n++) {
            if (!/^\s*$/.test(vm.raw(n))) { apply = false; break }
        }
        if (apply) {
            const r = onEnter(c.state, vm.raw(indent.line), '', '')
            if (r) {
                let ind = leadingWhitespaceOf(vm.raw(indent.line))
                if (r.removeText) ind = ind.slice(0, ind.length - r.removeText)
                if (r.indentAction === IndentAction.Indent || r.indentAction === IndentAction.IndentOutdent) ind = shiftIndentation(ind, c.cfg)
                else if (r.indentAction === IndentAction.Outdent) ind = unshiftIndentation(ind, c.cfg)
                if (decrease) ind = unshiftIndentation(ind, c.cfg)
                if (r.appendText) ind += r.appendText
                return leadingWhitespaceOf(ind)
            }
        }
    }
    if (decrease) return indent.indent ? indent.indentation : unshiftIndentation(indent.indentation, c.cfg)
    return indent.indent ? shiftIndentation(indent.indentation, c.cfg) : indent.indentation
}

// Monaco parseEnterResult:回车动作要求的缩进 与 被搬行现有缩进 之差(空格数);行文本不以回车前缀开头 → null
function parseEnterResult(c: Ctx, line: number, enter: EnterAction | null): number | null {
    if (!enter) return null
    let prefix = enter.indentation
    if (enter.indentAction === IndentAction.None || enter.indentAction === IndentAction.Indent) prefix = enter.indentation + enter.appendText
    else if (enter.indentAction === IndentAction.Outdent) prefix = unshiftIndentation(enter.indentation, c.cfg) + enter.appendText
    const text = c.state.doc.line(line).text
    if (trimStart(text).indexOf(trimStart(prefix)) < 0) return null
    let newIndent = leadingWhitespaceOf(prefix)
    if (testRule(c.rules.decreaseIndentPattern, text)) newIndent = unshiftIndentation(newIndent, c.cfg)
    return spaceCount(newIndent, c.cfg.tabSize) - spaceCount(leadingWhitespaceOf(text), c.cfg.tabSize)
}

function enterAtEnd(c: Ctx, line: number): EnterAction | null {
    const end = c.state.doc.line(line).to
    return getEnterAction(c.state, end, end, c.skip)
}

function matchEnterRule(c: Ctx, line: number, oneLineAbove: number): number | null {
    const doc = c.state.doc
    let valid = oneLineAbove
    while (valid >= 1 && !hasNonWs(doc.line(valid).text)) valid--
    if (valid < 1 || line > doc.lines) return null
    return parseEnterResult(c, line, enterAtEnd(c, valid))
}

function matchEnterRuleMovingDown(c: Ctx, line: number, futureAbove: number, futureAboveText: string): number | null {
    const doc = c.state.doc
    if (hasNonWs(futureAboveText)) return parseEnterResult(c, line, enterAtEnd(c, futureAbove))
    let valid = line - 1
    while (valid >= 1 && !hasNonWs(doc.line(valid).text)) valid--
    if (valid < 1 || line > doc.lines) return null
    return parseEnterResult(c, line, enterAtEnd(c, valid))
}

/**
 * Monaco getGoodIndentForLine 对外口:按 override 给的虚拟行推第 lineNumber 行该有的缩进(没配规则 / autoIndent < Full → null)。
 * 粘贴自动缩进(pasteindent.ts)用。
 */
export function goodIndentFor(state: EditorState, owner: object | null, lineNumber: number, override: Override = () => null): string | null {
    const rules = fullIndentRules(state)
    if (!rules) return null
    const doc = state.doc
    const c: Ctx = { state, rules, cfg: indentConfig(state), lines: indentRuleLines(owner, doc), skip: bracketSkip(owner, doc) }
    return goodIndentForLine(c, virtualModel(c, override), lineNumber)
}

export interface MoveIndent {
    /** 向下搬时被挪到选块上方那一行的新文本(缩进可能被改);没改 = null */
    movedText: string | null
    /** 选中块每行缩进平移的空格数 */
    offset: number
}

/**
 * 搬 [startLine, endLine] 这块。无自动缩进(autoIndent < Full / 没配 indentationRules)→ null。
 * owner = EditorView(借它的 token 缓存剥字符串/注释里的括号)。
 */
export function moveLinesIndent(state: EditorState, owner: object | null, startLine: number, endLine: number, forward: boolean): MoveIndent | null {
    const rules = fullIndentRules(state)
    if (!rules) return null
    const doc = state.doc
    const c: Ctx = { state, rules, cfg: indentConfig(state), lines: indentRuleLines(owner, doc), skip: bracketSkip(owner, doc) }
    const { tabSize, insertSpaces } = c.cfg
    const ws = (n: number) => leadingWhitespaceOf(doc.line(n).text)
    const diff = (target: string, cur: string) => spaceCount(target, tabSize) - spaceCount(cur, tabSize)
    let movedText: string | null = null
    let offset = 0
    if (forward) {
        const moving = endLine + 1
        const movingText = doc.line(moving).text
        let inserting = movingText
        const r = matchEnterRule(c, moving, startLine - 1)
        if (r !== null) {
            inserting = generateIndent(r + spaceCount(ws(moving), tabSize), tabSize, insertSpaces) + trimStart(movingText)
        }
        else {
            const vm = virtualModel(c, n => n === startLine ? { src: moving, text: movingText } : null)
            const good = goodIndentForLine(c, vm, startLine)
            if (good !== null) {
                const n1 = spaceCount(good, tabSize)
                if (n1 !== spaceCount(ws(moving), tabSize)) inserting = generateIndent(n1, tabSize, insertSpaces) + trimStart(movingText)
            }
        }
        if (inserting !== movingText) movedText = inserting
        const ret = matchEnterRuleMovingDown(c, startLine, moving, inserting)
        if (ret !== null) offset = ret
        else {
            const vm = virtualModel(c, n => n === startLine ? { src: moving, text: inserting }
                : n > startLine && n <= endLine + 1 ? { src: n - 1, text: doc.line(n - 1).text } : null)
            const good = goodIndentForLine(c, vm, startLine + 1)
            if (good !== null) offset = diff(good, ws(startLine))
        }
    }
    else {
        const moving = startLine - 1
        const ret = matchEnterRule(c, startLine, startLine - 2)
        if (ret !== null) offset = ret
        else {
            const vm = virtualModel(c, n => n === moving ? { src: startLine, text: doc.line(startLine).text } : null)
            const good = goodIndentForLine(c, vm, moving)
            if (good !== null) offset = diff(good, ws(startLine))
        }
    }
    return { movedText, offset }
}
