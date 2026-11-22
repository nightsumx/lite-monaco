// ⌘/ 行注释、⇧⌥A 块注释,逐条对齐 Monaco 0.52(contrib/comment 的 LineCommentCommand / BlockCommentCommand,
// 选项 comments.insertSpace / comments.ignoreEmptyLines 读自 getOption(默认都是 true,见 editoptions.ts commentsOptions):
//
//   ⌘/:选区覆盖的行(止于行首的末行不算)。所有非空行都以注释符开头 → 去掉注释符(及其后一个空格);
//        否则逐行加 `// `。加的时候插入列对齐:取各行缩进的最小可见列,向下取整到 indentSize 的倍数。
//        多行时空行跳过;只有空白行时(单行空行)也加。光标在行尾时落到注释符之后。
//   ⌘K ⌘C / ⌘K ⌘U(ForceAdd / ForceRemove):加时不看已有注释(再套一层),删时只删以注释符开头的行;
//        两者都跳过空行,只有空白行时什么也不做。
//   ⇧⌥A:选区两侧(或光标所在处)已有 /* */ → 去掉;否则在选区两侧加 `/* ` ` */`,空光标插 `/*  */` 且光标落中间。

import type { ChangeSet, ChangeSpec } from '../model/change'
import type { SelectionRange } from '../model/selection'
import type { EditorState, StateCommand } from '../model/state'
import { EditorSelection } from '../model/selection'
import { commentTokensAt, getCommentTokens } from './commenttokens'
import { indentConfig } from './enter'
import { commentsOptions } from './editoptions'


function firstNonWs(text: string): number {
    for (let i = 0; i < text.length; i++) {
        const c = text.charCodeAt(i)
        if (c !== 32 && c !== 9) return i
    }
    return -1
}

// Monaco _haystackHasNeedleAtOffset:ASCII 字母不分大小写
function hasNeedleAt(hay: string, needle: string, offset: number): boolean {
    if (offset < 0 || offset + needle.length > hay.length) return false
    for (let i = 0; i < needle.length; i++) {
        const a = hay.charCodeAt(offset + i), b = needle.charCodeAt(i)
        if (a === b) continue
        if (a >= 65 && a <= 90 && a + 32 === b) continue
        if (b >= 65 && b <= 90 && b + 32 === a) continue
        return false
    }
    return true
}

export interface LinePreflight { ignore: boolean, commentStr: string, commentStrOffset: number, commentStrLength: number }
export interface LineSource { getLineContent(lineNumber: number): string }

/**
 * Monaco LineCommentCommand._analyzeLines:逐行定「这行算不算 / 注释符在哪 / 删多长」,以及整体是删还是加。
 * lines 由调用方按行预填 commentStr(Monaco 允许每行不同);noIndent = 注释符一律贴行首(lineComment: { comment, noIndent: true })。
 */
export function analyzeLines(type: LineCommentType, insertSpace: boolean, model: LineSource, lines: LinePreflight[], startLineNumber: number,
    ignoreEmptyLines: boolean, ignoreFirstLine: boolean, noIndent = false): { supported: true, shouldRemoveComments: boolean, lines: LinePreflight[] } {
    let onlyWhitespaceLines = true
    // ForceAdd 一开始就是加;Toggle / ForceRemove 先假设删,没注释的行在下面翻案或跳过
    let shouldRemove = type !== 'add'
    for (let i = 0; i < lines.length; i++) {
        const d = lines[i]
        const lineNumber = startLineNumber + i
        if (i === 0 && ignoreFirstLine) { d.ignore = true; continue }
        const text = model.getLineContent(lineNumber)
        const off = firstNonWs(text)
        if (off === -1) { d.ignore = ignoreEmptyLines; d.commentStrOffset = noIndent ? 0 : text.length; continue }
        onlyWhitespaceLines = false
        d.ignore = false
        d.commentStrOffset = noIndent ? 0 : off
        if (shouldRemove && !hasNeedleAt(text, d.commentStr, d.commentStrOffset)) {
            if (type === 'toggle') shouldRemove = false
            else d.ignore = true
        }
        if (shouldRemove && insertSpace) {
            const end = off + d.commentStrLength
            if (end < text.length && text.charCodeAt(end) === 32) d.commentStrLength++
        }
    }
    // 只有空白行:Toggle 照样加(且不再跳过);ForceAdd / ForceRemove 不变
    if (type === 'toggle' && onlyWhitespaceLines) {
        shouldRemove = false
        for (const d of lines) d.ignore = false
    }
    return { supported: true, shouldRemoveComments: shouldRemove, lines }
}

/** Monaco LineCommentCommand._normalizeInsertionPoint:加注释符时按各行最小可见列(向下取整到 indentSize 的倍数)对齐插入点 */
export function normalizeInsertionPoint(model: LineSource, lines: { ignore: boolean, commentStrOffset: number }[], startLineNumber: number, indentSize: number): void {
    let minVis = Infinity
    lines.forEach((d, i) => {
        if (d.ignore) return
        const text = model.getLineContent(startLineNumber + i)
        let v = 0
        for (let j = 0; v < minVis && j < d.commentStrOffset; j++) v = text.charCodeAt(j) === 9 ? v + indentSize - (v % indentSize) : v + 1
        if (v < minVis) minVis = v
    })
    minVis = Math.floor(minVis / indentSize) * indentSize
    lines.forEach((d, i) => {
        if (d.ignore) return
        const text = model.getLineContent(startLineNumber + i)
        let v = 0, j = 0
        for (; v < minVis && j < d.commentStrOffset; j++) v = text.charCodeAt(j) === 9 ? v + indentSize - (v % indentSize) : v + 1
        d.commentStrOffset = v > minVis ? j - 1 : j
    })
}

interface CommandResult { changes: ChangeSpec[], finish: (all: ChangeSet, newDoc: EditorState['doc']) => SelectionRange }

// Monaco LineCommentCommand 的 Type:Toggle / ForceAdd(⌘K ⌘C)/ ForceRemove(⌘K ⌘U)
export type LineCommentType = 'toggle' | 'add' | 'remove'

// 多行选区止于行首:末行不算;选区终点先收到上一行行尾,结束后再放回下一行行首
function trimTrailingLineStart(doc: EditorState['doc'], orig: SelectionRange) {
    const startLine = doc.lineAt(orig.from).number
    let endLine = doc.lineAt(orig.to).number
    let moveEndDown = false
    let sel = orig
    if (startLine < endLine && orig.to === doc.line(endLine).from) {
        moveEndDown = true
        endLine--
        const end = doc.line(endLine).to
        sel = orig.anchor <= orig.head ? EditorSelection.range(orig.from, end) : EditorSelection.range(end, orig.from)
    }
    return { sel, startLine, endLine, moveEndDown }
}

function lineCommentFor(state: EditorState, orig: SelectionRange, token: string, type: LineCommentType = 'toggle', noIndent = false): CommandResult | null {
    const doc = state.doc
    const indentSize = indentConfig(state).indentSize
    const { sel, startLine, endLine, moveEndDown } = trimTrailingLineStart(doc, orig)
    const { insertSpace, ignoreEmptyLines: ignoreEmpty } = commentsOptions(state)
    const lines: LinePreflight[] = []
    for (let n = startLine; n <= endLine; n++) lines.push({ ignore: false, commentStr: token, commentStrOffset: 0, commentStrLength: token.length })
    const lineOf: LineSource = { getLineContent: n => doc.line(n).text }
    const { shouldRemoveComments: remove } = analyzeLines(type, insertSpace, lineOf, lines, startLine, ignoreEmpty, false, noIndent)
    const changes: ChangeSpec[] = []
    if (remove) {
        lines.forEach((d, i) => {
            if (d.ignore) return
            const line = doc.line(startLine + i)
            const from = line.from + d.commentStrOffset
            // 空行(ignoreEmptyLines=false 时也在列表里)没有注释符可删,Monaco 的范围被夹回行尾,等于不动
            const to = Math.min(from + d.commentStrLength, line.to)
            if (to > from) changes.push({ from, to })
        })
    }
    else {
        normalizeInsertionPoint(lineOf, lines, startLine, indentSize)
        lines.forEach((d, i) => {
            if (d.ignore) return
            changes.push({ from: doc.line(startLine + i).from + d.commentStrOffset, insert: insertSpace ? token + ' ' : token })
        })
    }
    if (!changes.length) return null
    // 光标在行尾、插入点就是光标 → 光标跟到注释符之后
    let delta = 0
    const headLine = doc.lineAt(sel.head)
    for (const c of changes as { from: number, to?: number, insert?: string }[]) {
        if (c.to == null && c.from === sel.head && sel.head === headLine.to) delta = c.insert!.length
    }
    return {
        changes,
        finish(all, newDoc) {
            let anchor: number, head: number
            if (sel.empty) {
                anchor = head = all.mapPos(sel.head, sel.head === headLine.to ? -1 : 1)
            }
            else {
                const from = all.mapPos(sel.from, 1), to = all.mapPos(sel.to, -1)
                ;[anchor, head] = sel.anchor <= sel.head ? [from, to] : [to, from]
            }
            anchor += delta
            head += delta
            if (moveEndDown) {
                const endPos = Math.max(anchor, head)
                const line = newDoc.lineAt(endPos)
                const down = line.number < newDoc.lines ? newDoc.line(line.number + 1).from : line.to
                if (head >= anchor) head = down
                else anchor = down
            }
            return EditorSelection.range(anchor, head)
        },
    }
}

// Monaco LineCommentCommand._executeBlockComment:语言没有行注释符时 ⌘/ 退到块注释。
// 与 BlockCommentCommand 不同:选区总是扩到行首非空白 → 末行行尾(空光标则本行),且先尝试去掉已有的块注释。
function attemptRemoveBlock(doc: EditorState['doc'], from: number, to: number, startToken: string, endToken: string): ChangeSpec[] | null {
    const sL = doc.lineAt(from), eL = doc.lineAt(to)
    let startLine = sL, endLine = eL
    const startCol = from - sL.from + 1, endCol = to - eL.from + 1
    const fnw = firstNonWs(sL.text) + 1 // Monaco getLineFirstNonWhitespaceColumn:全空白行是 0
    const allowed = endToken.length + Math.max(fnw, startCol)
    let si = startLine.text.lastIndexOf(startToken, allowed - 1)
    let ei = endLine.text.indexOf(endToken, endCol - 1 - startToken.length)
    if (si !== -1 && ei === -1) { ei = startLine.text.indexOf(endToken, si + startToken.length); endLine = startLine }
    if (si === -1 && ei !== -1) { si = endLine.text.lastIndexOf(startToken, ei); startLine = endLine }
    if (from === to && (si === -1 || ei === -1)) {
        si = sL.text.indexOf(startToken)
        if (si !== -1) ei = sL.text.indexOf(endToken, si + startToken.length)
        startLine = endLine = sL
    }
    if (si !== -1 && startLine.text.charCodeAt(si + startToken.length) === 32) startToken += ' '
    if (ei !== -1 && endLine.text.charCodeAt(ei - 1) === 32) { endToken = ' ' + endToken; ei-- }
    if (si === -1 || ei === -1) return null
    const rs = startLine.from + si + startToken.length, re = endLine.from + ei
    return rs !== re
        ? [{ from: rs - startToken.length, to: rs }, { from: re, to: re + endToken.length }]
        : [{ from: rs - startToken.length, to: re + endToken.length }]
}

function blockViaLineFor(state: EditorState, orig: SelectionRange, open: string, close: string): CommandResult | null {
    const doc = state.doc
    const { sel, moveEndDown } = trimTrailingLineStart(doc, orig)
    const { insertSpace } = commentsOptions(state)
    let changes = attemptRemoveBlock(doc, sel.from, sel.to, open, close)
    let delta = 0
    if (!changes) {
        const sL = doc.lineAt(sel.from), eL = doc.lineAt(sel.to)
        let from: number, to: number
        if (sel.empty) {
            const f = firstNonWs(sL.text)
            from = sL.from + (f === -1 ? sL.text.length : f)
            to = sL.to
        }
        else {
            const f = firstNonWs(sL.text)
            from = sL.from + Math.max(f, 0)
            to = eL.to
        }
        const sp = insertSpace ? ' ' : ''
        changes = from === to
            ? [{ from, insert: open + '  ' + close }]
            : [{ from, insert: open + sp }, { from: to, insert: sp + close }]
        if (changes.length === 1) delta = open.length + 1
    }
    const single = changes.length === 1
    return {
        changes,
        finish(all, newDoc) {
            let anchor: number, head: number
            if (sel.empty) anchor = head = all.mapPos(sel.head, single ? -1 : 1)
            else {
                const a = all.mapPos(sel.from, -1), b = all.mapPos(sel.to, 1)
                ;[anchor, head] = sel.anchor <= sel.head ? [a, b] : [b, a]
            }
            anchor += delta
            head += delta
            if (moveEndDown) {
                const line = newDoc.lineAt(Math.max(anchor, head))
                const down = line.number < newDoc.lines ? newDoc.line(line.number + 1).from : line.to
                if (head >= anchor) head = down
                else anchor = down
            }
            return EditorSelection.range(anchor, head)
        },
    }
}

function runAll(state: EditorState, dispatch: (tr: import('../model/state').Transaction) => void,
    each: (r: SelectionRange) => CommandResult | null, userEvent: string): boolean {
    if (state.readOnly) return false
    const results: { r: SelectionRange, res: CommandResult | null }[] = state.selection.ranges.map(r => ({ r, res: each(r) }))
    const seen = new Set<string>()
    const changes: ChangeSpec[] = []
    for (const { res } of results) for (const c of res?.changes ?? []) {
        const k = JSON.stringify(c)
        if (!seen.has(k)) { seen.add(k); changes.push(c) }
    }
    if (!changes.length) return false
    const all = state.changes(changes)
    const newDoc = all.apply(state.doc)
    const ranges = results.map(({ r, res }) => res ? res.finish(all, newDoc) : r.map(all))
    dispatch(state.update({ changes: all, selection: EditorSelection.create(ranges, state.selection.mainIndex), scrollIntoView: true, userEvent }))
    return true
}

export function toggleLineComment(token: string, noIndent = false): StateCommand {
    return ({ state, dispatch }) => runAll(state, dispatch, r => lineCommentFor(state, r, token, 'toggle', noIndent), 'input.comment')
}

// 每个选区按起始行行首的语言取注释符(内嵌语言见 commenttokens.ts);没有行注释符:退到块注释(Monaco LineCommentCommand 的 fallback)
type Target = { state: EditorState, dispatch: (tr: import('../model/state').Transaction) => void }
const lineStart = (state: EditorState, r: SelectionRange) => state.doc.lineAt(r.from).from

function lineOrBlock(target: Target, type: LineCommentType): StateCommand {
    return () => {
        const { state, dispatch } = target
        return runAll(state, dispatch, (r) => {
            const t = commentTokensAt(target, lineStart(state, r))
            if (t.line) return lineCommentFor(state, r, t.line, type, t.noIndent)
            return t.block ? blockViaLineFor(state, r, t.block.open, t.block.close) : null
        }, 'input.comment')
    }
}

function forcedLineComment(type: 'add' | 'remove'): StateCommand {
    return (target) => lineOrBlock(target, type)(target)
}

/** Add Line Comment(⌘K ⌘C):每个非空行都加注释符,已注释的也再加一层 */
export const addLineComment: StateCommand = forcedLineComment('add')

/** Remove Line Comment(⌘K ⌘U):以注释符开头的行去掉注释符(及其后一个空格),其余行不动 */
export const removeLineComment: StateCommand = forcedLineComment('remove')

function blockCommentFor(state: EditorState, sel: SelectionRange, open: string, close: string): CommandResult | null {
    const doc = state.doc
    const sLine = doc.lineAt(sel.from), eLine = doc.lineAt(sel.to)
    const startText = sLine.text, endText = eLine.text
    const { insertSpace } = commentsOptions(state)
    const startCol = sel.from - sLine.from, endCol = sel.to - eLine.from
    let si = startText.lastIndexOf(open, startCol + open.length)
    let ei = endText.indexOf(close, Math.max(0, endCol - close.length))
    if (endCol - close.length < 0) ei = endText.indexOf(close, endCol - close.length)
    if (si !== -1 && ei !== -1) {
        if (sLine.number === eLine.number) {
            if (startText.substring(si + open.length, ei).includes(close)) si = ei = -1
        }
        else if (startText.substring(si + open.length).includes(close) || endText.substring(0, ei).includes(close)) si = ei = -1
    }
    if (si !== -1 && ei !== -1) {
        let o = open, c = close
        if (insertSpace && si + o.length < startText.length && startText.charCodeAt(si + o.length) === 32) o += ' '
        if (insertSpace && ei > 0 && endText.charCodeAt(ei - 1) === 32) { c = ' ' + c; ei-- }
        const innerFrom = sLine.from + si + o.length, innerTo = eLine.from + ei
        const changes: ChangeSpec[] = innerFrom < innerTo
            ? [{ from: innerFrom - o.length, to: innerFrom }, { from: innerTo, to: innerTo + c.length }]
            : [{ from: innerFrom - o.length, to: innerTo + c.length }]
        return {
            changes,
            finish: all => innerFrom < innerTo
                ? EditorSelection.range(all.mapPos(innerFrom, 1), all.mapPos(innerTo, -1))
                : EditorSelection.cursor(all.mapPos(innerFrom - o.length, -1)),
        }
    }
    if (sel.empty) {
        const text = open + '  ' + close
        return { changes: [{ from: sel.from, insert: text }], finish: all => EditorSelection.cursor(all.mapPos(sel.from, -1) + open.length + 1) }
    }
    const from = sel.from, to = sel.to
    return {
        changes: [{ from, insert: insertSpace ? open + ' ' : open }, { from: to, insert: insertSpace ? ' ' + close : close }],
        // 插入的注释符不进选区:起点贴后、终点贴前;Monaco 结果总是正向选区
        finish: all => EditorSelection.range(all.mapPos(from, 1), all.mapPos(to, -1)),
    }
}

export const toggleBlockComment: StateCommand = ({ state, dispatch }) => {
    const block = getCommentTokens(state).block
    if (!block) return false
    return runAll(state, dispatch, r => blockCommentFor(state, r, block.open, block.close), 'input.comment')
}

/** 行注释优先,否则块注释(Monaco:语言没有行注释符时 ⌘/ 退化成块注释) */
export const toggleComment: StateCommand = (target) => lineOrBlock(target, 'toggle')(target)
