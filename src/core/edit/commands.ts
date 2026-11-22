// CM7 commands —— 纯 StateCommand 子集(§4 commands「抄思路自己写,95% 纯逻辑」)。
//
// 命令在 CM6 分两类:Command(吃 EditorView,要视觉几何 moveVertically/coordsAtPos/lineBlockAt)
// 与 StateCommand(只吃 {state, dispatch})。这里只港**纯 StateCommand 子集**——文档/行级编辑与
// 选区操作,全部经 state.changeByRange / doc.lineAt / sliceDoc 表达,零 DOM、零视觉行(visual line)。
//
// 砍到阶段4(EditorView 接入时港,需视觉几何或 Unicode charCategorizer 正则或 indent facet):
//   - 光标移动 cursorByChar/Line/Page、selectBy* —— 要 view.moveByChar/moveVertically。
//   - deleteCharBackward/Forward、deleteGroup* —— 要 charCategorizer(Unicode 属性正则,禁正则归阶段4)
//     与 indentUnit facet;deleteToLineEnd/LineBoundary 要 view.lineBlockAt(视觉行)。
//   - indentMore/Less/indentSelection、insertNewlineAndIndent —— 要 indentService facet。
//   - addCursorAbove/Below、deleteLine —— 要 view.moveVertically(视觉行)。
//   - selectParentSyntax、cursorMatchingBracket —— 要 syntaxTree(语言层,shiki 不建树)。
//   - keymap(KeyBinding)—— 视图接线,阶段4。
//
// 可监测:命令是纯函数 (target)->bool,dispatch 收纯 Transaction;测经手搭 dispatch 环钉「文档+选区」终态。

import { trackSelection, type TrackedEdit } from './tracked'
import type { ChangeSet, ChangeSpec } from '../model/change'
import type { SelectionRange } from '../model/selection'
import type { StateCommand, Transaction } from '../model/state'
import { Compartment, EditorState } from '../model/state'
import { findClusterBreak } from '../model/char'
import { CharCategory, categorizeCodePoint } from '../model/charcategory'
import { EditorSelection } from '../model/selection'
import { CLOSE_OPEN, matchBackward, matchForward, OPEN_CLOSE } from './brackets'
import { autoClosingPairSpan, inStringAt } from './closebrackets'
import { guessIndentation, indentRuleLines, leadingCols, leadingWs, type IndentRuleLines } from './indent'
import { indentRulesFacet, testRule, type IndentationRules } from './autoindent'
import { moveLinesIndent, generateIndent, spaceCount } from './moveindent'
import { indentConfig, indentSizeFacet, indentSizeFollowsTabSize, leadingWhitespaceOf, normalizeIndentation } from './enter'
import { findQuotedAt } from '../feature/quotes'
import { commentTokensFacet, getCommentTokens } from './commenttokens'
import { leftDeleteOffset } from './vcol'
import { atomicTabPosition, Direction as AtomicDirection } from './atomictabs'
import { hiddenRanges } from './fold'
import { boolOption, capSelection, keepOverlappingCursors } from './editoptions'
import { deleteWordLeftTarget, deleteWordPartLeftTarget, deleteWordPartRightTarget, deleteInsideWordSpan, deleteWordRightTarget, moveWordLeft, moveWordPartLeft, moveWordPartRight, moveWordRight, WordNav, wordAtPosition } from './words'
import { ifToTernaryLine, functionToArrowLine, splitCallArgsAt, joinCallArgsAt, unwrapTernaryLine, toggleBooleanAt, promoteBindingLine, invertComparisonAt, arrowToFunctionLine, toggleArrowBracesLine, extractConstantEdit, flipIfElseLine, negateIfLine, toggleObjectShorthandAt, swapOperandsAt, toggleMemberAccessAt, toggleTrailingCommaAt, splitDeclLine, joinDeclLines, unwrapIfLine, toggleAsyncLine, removeBracesLine, inlineConstantEdit, toggleStrictEqAt, splitArrayAt, joinArrayAt, toggleIncrementAt, splitStringAt, joinStringAt, wrapInIfLine, toggleSemicolonLine, toggleLogAt, toggleHexDecAt, mergeIfLine, splitIfAndLine, toggleArrowParensLine, splitObjectAt, joinObjectAt, toggleAssignOpAt, toggleTypeImportLine, toggleExportDefaultLine } from '../feature/refactor'

function setSel(state: EditorState, selection: EditorSelection | { anchor: number, head?: number }): Transaction {
    return state.update({ selection, scrollIntoView: true, userEvent: 'select' })
}

function updateSel(state: EditorState, by: (range: SelectionRange) => SelectionRange): EditorSelection {
    return EditorSelection.create(state.selection.ranges.map(by), state.selection.mainIndex, keepOverlappingCursors(state))
}

// —— 选区命令 ——

export const cursorDocStart: StateCommand = ({ state, dispatch }) => {
    dispatch(setSel(state, { anchor: 0 }))
    return true
}

export const cursorDocEnd: StateCommand = ({ state, dispatch }) => {
    dispatch(setSel(state, { anchor: state.doc.length }))
    return true
}

export const selectDocStart: StateCommand = ({ state, dispatch }) => {
    dispatch(setSel(state, { anchor: state.selection.main.anchor, head: 0 }))
    return true
}

export const selectDocEnd: StateCommand = ({ state, dispatch }) => {
    dispatch(setSel(state, { anchor: state.selection.main.anchor, head: state.doc.length }))
    return true
}

export const selectAll: StateCommand = ({ state, dispatch }) => {
    dispatch(state.update({ selection: { anchor: 0, head: state.doc.length }, userEvent: 'select' }))
    return true
}

// 行号 gutter 点击选整行(含行尾换行,末行无换行则到 doc 尾)。纯函数,view 只接线。
export function lineSelectionRange(state: EditorState, lineNumber: number): SelectionRange {
    const line = state.doc.line(lineNumber)
    const full = line.to + 1 <= state.doc.length ? line.to + 1 : line.to
    return EditorSelection.range(line.from, full)
}

// Cmd+L,对齐 Monaco expandLineSelection:未覆盖整行 → 吸附到当前行块;已是整行选区 → 向下再吞一行(重复按可逐行扩)。
export const selectLine: StateCommand = ({ state, dispatch }) => {
    const doc = state.doc
    const ranges = selectedLineBlocks(state).map(({ from, to, ranges }) => {
        const full = to + 1 <= doc.length ? to + 1 : to // 行块尾 +1 吃换行符(末行无换行则到 doc 尾)
        const already = ranges.length === 1 && ranges[0].from === from && ranges[0].to === full
        if (already && full < doc.length) {
            const next = doc.lineAt(full) // full 落在下一行行首,吞下整行
            return EditorSelection.range(from, Math.min(next.to + 1, doc.length))
        }
        return EditorSelection.range(from, full)
    })
    dispatch(state.update({ selection: EditorSelection.create(ranges), userEvent: 'select' }))
    return true
}

// 多选区收一:多段→留主段;单段非空→塌成光标。
export const simplifySelection: StateCommand = ({ state, dispatch }) => {
    const cur = state.selection
    let selection: EditorSelection | null = null
    if (cur.ranges.length > 1)
        selection = EditorSelection.create([cur.main])
    else if (!cur.main.empty)
        selection = EditorSelection.create([EditorSelection.cursor(cur.main.head)])
    if (!selection)
        return false
    dispatch(setSel(state, selection))
    return true
}

// —— 行块编辑命令 ——

interface LineBlock { from: number, to: number, ranges: SelectionRange[] }

// 把当前选区聚成「行块」:相邻/重叠的选区合并成一个覆盖整行范围的块,带原选区列表(供位移)。
function selectedLineBlocks(state: EditorState): LineBlock[] {
    const blocks: LineBlock[] = []
    let upto = -1
    for (const range of state.selection.ranges) {
        const startLine = state.doc.lineAt(range.from)
        let endLine = state.doc.lineAt(range.to)
        if (!range.empty && range.to === endLine.from)
            endLine = state.doc.lineAt(range.to - 1)
        if (upto >= startLine.number) {
            const prev = blocks[blocks.length - 1]
            prev.to = endLine.to
            prev.ranges.push(range)
        }
        else {
            blocks.push({ from: startLine.from, to: endLine.to, ranges: [range] })
        }
        upto = endLine.number + 1
    }
    return blocks
}

// ⌥↑/↓,对齐 Monaco MoveLinesCommand:每个选区各挪自己覆盖的行(末端在行首不算那行)。各选区的编辑照
// Cursor._getLoserCursorMap 判冲突(按终点倒排,前一个的起点在后一个终点之前就算重叠),重叠时排在后面的选区
// (主选区排第一)整个作废、连光标一起去掉——所以相邻两行各一个光标时只有第一个挪得动。
//
// autoIndent = 'full' 且语言配了 indentationRules 时,搬完还要重排缩进(Monaco 同):被挪过去的那行按新位置推缩进,
// 搬的整块平移一个偏移(见 moveindent.ts)。单个空行与别行互换不动缩进。
function moveLine(target: { state: EditorState, dispatch: (tr: Transaction) => void }, forward: boolean): boolean {
    const { state, dispatch } = target
    if (state.readOnly)
        return false
    const doc = state.doc
    const { ranges, mainIndex } = state.selection
    const order = [mainIndex, ...ranges.map((_, i) => i).filter(i => i !== mainIndex)]
    const ops: { major: number, from: number, to: number, insert?: string }[] = []
    const size: number[] = []
    const shift: ChangeSet[] = [] // 每个选区块内的缩进平移(原文坐标),用来把光标跟过去
    const reindent: { major: number, from: number, to: number, insert: string }[] = [] // 不参与冲突判定,跟着所属选区的命运走
    const { tabSize, insertSpaces } = indentConfig(state)
    for (const [major, i] of order.entries()) {
        const r = ranges[i]
        const startLine = doc.lineAt(r.from)
        let endLine = doc.lineAt(r.to)
        if (!r.empty && r.to === endLine.from && endLine.number > startLine.number)
            endLine = doc.line(endLine.number - 1)
        size[i] = 0
        if (forward ? endLine.number === doc.lines : startLine.number === 1)
            continue
        const other = doc.line(forward ? endLine.number + 1 : startLine.number - 1)
        const blankSingle = startLine.number === endLine.number && startLine.length === 0
        const mi = blankSingle ? null : moveLinesIndent(state, target, startLine.number, endLine.number, forward)
        const moved = mi?.movedText ?? other.text
        size[i] = forward ? moved.length + 1 : -(other.length + 1)
        if (forward) {
            ops.push({ major, from: endLine.to, to: other.to }, { major, from: startLine.from, to: startLine.from, insert: moved + state.lineBreak })
        }
        else {
            ops.push({ major, from: other.from, to: startLine.from }, { major, from: endLine.to, to: endLine.to, insert: state.lineBreak + other.text })
        }
        if (mi && mi.offset) {
            const edits: ChangeSpec[] = []
            for (let n = startLine.number; n <= endLine.number; n++) {
                const line = doc.line(n)
                const old = leadingWhitespaceOf(line.text)
                const fresh = generateIndent(spaceCount(old, tabSize) + mi.offset, tabSize, insertSpaces)
                if (fresh === old) continue
                reindent.push({ major, from: line.from, to: line.from + old.length, insert: fresh })
                edits.push({ from: line.from, to: line.from + old.length, insert: fresh })
            }
            shift[i] = state.changes(edits)
        }
    }
    const sorted = ops.slice().sort((a, b) => b.to - a.to || b.from - a.from)
    const lost = new Set<number>()
    for (let k = 1; k < sorted.length; k++) {
        const prev = sorted[k - 1], cur = sorted[k]
        if (prev.from < cur.to) {
            const loser = Math.max(prev.major, cur.major)
            lost.add(loser)
            for (let j = 0; j < sorted.length; j++) {
                if (sorted[j].major !== loser) continue
                sorted.splice(j, 1)
                if (j < k) k--
                j--
            }
            if (k > 0) k--
        }
    }
    const kept = [...ops, ...reindent].filter(o => !lost.has(o.major))
    if (!kept.length)
        return false
    const out: SelectionRange[] = []
    let main = 0
    for (const [major, i] of order.entries()) {
        if (lost.has(major)) continue
        const r = ranges[i]
        if (i === mainIndex) main = out.length
        // 缩进平移:空光标落在新缩进之后;非空选区起点贴前、终点贴后
        const sh = shift[i]
        const at = (pos: number, assoc: number) => Math.min(doc.length, (sh ? sh.mapPos(pos, assoc) : pos) + size[i])
        const [aa, ha] = r.empty ? [1, 1] : r.anchor < r.head ? [-1, 1] : [1, -1]
        out.push(EditorSelection.range(at(r.anchor, aa), at(r.head, ha)))
    }
    dispatch(state.update({
        changes: kept.map(o => ({ from: o.from, to: o.to, insert: o.insert })),
        scrollIntoView: true,
        selection: EditorSelection.create(out, main),
        userEvent: 'move.line',
    }))
    return true
}

export const moveLineUp: StateCommand = target => moveLine(target, false)
export const moveLineDown: StateCommand = target => moveLine(target, true)

// ⇧⌥↑/↓ 复制行(对齐 Monaco CopyLinesCommand):每个选区各复制自己覆盖的行(相邻选区也各复制一份);
// 两个选区的首尾落在同一行时只复制一次(先加的那个赢)。多行选区止于行首时末行不算,结束后终点放回下一行行首。
// 向下复制:在首行行首插「这些行 + \n」,光标落在下面那份;向上复制:在末行行尾插「\n + 这些行」,光标留在上面那份。
// dupNonEmpty(Monaco DuplicateSelectionAction):非空选区不复制整行,而是在选区终点后贴一份选区文本并选中副本;空选区照旧复制行。
function copyLine(state: EditorState, dispatch: (tr: Transaction) => void, forward: boolean, dupNonEmpty = false): boolean {
    if (state.readOnly)
        return false
    const doc = state.doc
    const items = state.selection.ranges.map((range, index) => {
        const startLine = doc.lineAt(range.from).number
        let endLine = doc.lineAt(range.to).number
        let endDown = false
        const dup = dupNonEmpty && !range.empty
        if (!dup && startLine < endLine && range.to === doc.line(endLine).from) { endLine--; endDown = true }
        return { range, index, startLine, endLine, endDown, ignore: false, dup }
    })
    const sorted = items.filter(it => !it.dup).sort((a, b) => a.range.from - b.range.from || a.range.to - b.range.to)
    let prev = sorted[0]
    for (let i = 1; i < sorted.length; i++) {
        const cur = sorted[i]
        if (prev.endLine === cur.startLine) {
            if (prev.index < cur.index) cur.ignore = true
            else { prev.ignore = true; prev = cur }
        }
        else prev = cur
    }
    const changes: ChangeSpec[] = []
    for (const it of items) {
        if (it.ignore) continue
        if (it.dup) { changes.push({ from: it.range.to, insert: state.sliceDoc(it.range.from, it.range.to) }); continue }
        const from = doc.line(it.startLine).from, to = doc.line(it.endLine).to
        const text = state.sliceDoc(from, to)
        changes.push(forward ? { from, insert: text + state.lineBreak } : { from: to, insert: state.lineBreak + text })
    }
    const changeSet = state.changes(changes)
    const newDoc = changeSet.apply(doc)
    const ranges = items.map(it => {
        const r = it.range
        if (it.dup) { const f = changeSet.mapPos(r.to, -1); return EditorSelection.range(f, f + r.to - r.from) }
        const end = it.endDown ? doc.line(it.endLine).to : r.to
        let from: number, to: number
        if (r.empty) from = to = changeSet.mapPos(r.head, forward ? 1 : -1)
        else { from = changeSet.mapPos(r.from, 1); to = changeSet.mapPos(end, -1) }
        if (it.endDown) {
            const l = newDoc.lineAt(to)
            to = l.number < newDoc.lines ? l.to + 1 : l.to
        }
        return r.anchor <= r.head || r.empty ? EditorSelection.range(from, to) : EditorSelection.range(to, from)
    })
    dispatch(state.update({
        changes: changeSet,
        selection: EditorSelection.create(ranges, state.selection.mainIndex),
        scrollIntoView: true,
        userEvent: 'input.copyline',
    }))
    return true
}

export const copyLineUp: StateCommand = ({ state, dispatch }) => copyLine(state, dispatch, false)
export const copyLineDown: StateCommand = ({ state, dispatch }) => copyLine(state, dispatch, true)

// 删整行 / ⌘⌫ / ⌘⌦ / ⌃T:对齐 Monaco linesOperations,见 lineedit.ts。
export { deleteAllLeft, deleteAllRight, deleteLine, transposeLetters, transposeCharacters } from './lineedit'

// Mac ⌘⌫ 两段式(对齐系统编辑器手感):
//   1) 当前行有内容 → 清空行内容(保留换行),光标到行首
//   2) 当前行已空且非首行 → 删前导换行,并入上一行末
export const deleteLineContentOrJoin: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly)
        return false
    let changed = false
    const result = state.changeByRange((range) => {
        const line = state.doc.lineAt(range.head)
        if (line.from < line.to) {
            // 有内容:清空本行,光标行首
            changed = true
            return {
                changes: { from: line.from, to: line.to, insert: '' },
                range: EditorSelection.cursor(line.from),
            }
        }
        if (line.from > 0) {
            // 空行:删上一行末的 \n,光标落到上一行末
            changed = true
            return {
                changes: { from: line.from - 1, to: line.from, insert: '' },
                range: EditorSelection.cursor(line.from - 1),
            }
        }
        return { range }
    })
    if (!changed)
        return false
    dispatch(state.update(result, { scrollIntoView: true, userEvent: 'delete.line' }))
    return true
}

// 每个选区处替换成换行,光标留在换行前(split 出新行)。
export const splitLine: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly)
        return false
    const changes = state.changeByRange((range) => {
        return {
            changes: { from: range.from, to: range.to, insert: state.lineBreak },
            range: EditorSelection.cursor(range.from),
        }
    })
    dispatch(state.update(changes, { scrollIntoView: true, userEvent: 'input' }))
    return true
}

// ⌃J,对齐 Monaco JoinLinesAction:选区按起点排序,相邻/重叠的并成一段;每段从首行行首替换到末行行尾。
// 空光标或单行选区拼上下一行(末行只拼自己),多行选区拼到选区末行;后面的行去掉缩进,前面不空时补一个空格,
// 前面以空白结尾则把尾部空白缩成一个空格(不再补)。空光标落在最后拼进来那行之前,单行选区不动,多行选区盖住拼好的原内容。
export const joinLines: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const doc = state.doc
    const lineOf = (pos: number) => doc.lineAt(pos).number
    const sorted = state.selection.ranges.map((r, i) => ({ r, i })).sort((a, b) => a.r.from - b.r.from)
    const main = state.selection.main
    let primary: SelectionRange = main
    const reduced: SelectionRange[] = []
    let prev = sorted[0].r
    for (let k = 1; k < sorted.length; k++) {
        const cur = sorted[k].r
        if (prev.empty) {
            if (lineOf(prev.to) === lineOf(cur.from)) {
                if (primary.eq(prev)) primary = cur
                prev = cur
                continue
            }
            if (lineOf(cur.from) > lineOf(prev.to) + 1) { reduced.push(prev); prev = cur; continue }
        }
        else if (lineOf(cur.from) > lineOf(prev.to)) { reduced.push(prev); prev = cur; continue }
        prev = EditorSelection.range(prev.from, cur.to)
    }
    reduced.push(prev)
    const changes: ChangeSpec[] = []
    const ranges: SelectionRange[] = []
    let mainIndex = 0
    let shift = 0
    for (const sel of reduced) {
        const startLine = doc.lineAt(sel.from)
        const selEnd = doc.lineAt(sel.to)
        const tailOffset = selEnd.to - sel.to
        const endN = sel.empty || startLine.number === selEnd.number
            ? Math.min(startLine.number + 1, doc.lines)
            : selEnd.number
        const endLine = doc.line(endN)
        let text = startLine.text
        let delta = 0
        for (let n = startLine.number + 1; n <= endN; n++) {
            const line = doc.line(n).text
            let fnw = 0
            while (fnw < line.length && (line.charCodeAt(fnw) === 32 || line.charCodeAt(fnw) === 9)) fnw++
            if (fnw === line.length) { delta = 0; continue }
            let space = text !== ''
            const last = text.charCodeAt(text.length - 1)
            if (space && (last === 32 || last === 9)) {
                space = false
                let e = text.length
                while (e > 0 && (text.charCodeAt(e - 1) === 32 || text.charCodeAt(e - 1) === 9 || text.charCodeAt(e - 1) === 0xA0 || text.charCodeAt(e - 1) === 0xFEFF)) e--
                text = text.slice(0, e) + ' '
            }
            const rest = line.slice(fnw)
            text += (space ? ' ' : '') + rest
            delta = rest.length + (space ? 1 : 0)
        }
        if (endLine.to > startLine.from) {
            if (text !== doc.sliceString(startLine.from, endLine.to)) changes.push({ from: startLine.from, to: endLine.to, insert: text })
            const base = startLine.from + shift
            const range = sel.empty
                ? EditorSelection.cursor(base + text.length - delta)
                : startLine.number === selEnd.number
                    ? EditorSelection.range(sel.from + shift, sel.to + shift)
                    : EditorSelection.range(sel.from + shift, base + text.length - tailOffset)
            if (primary.from <= endLine.to && primary.to >= startLine.from) mainIndex = ranges.length
            ranges.push(range)
            shift += text.length - (endLine.to - startLine.from)
        }
    }
    const selection = EditorSelection.create(ranges, mainIndex)
    if (!changes.length && selection.eq(state.selection)) return false
    dispatch(state.update({
        changes,
        selection,
        userEvent: 'input.join',
        scrollIntoView: true,
    }))
    return true
}

// Monaco AbstractCaseAction:非空选区换选区文本;空光标换 getConfiguredWordAtPosition 的词(贴着前或后的 Regular 词,标点不算)。
function transformRange(state: EditorState, range: SelectionRange): { from: number, to: number } | null {
    if (!range.empty) return { from: range.from, to: range.to }
    return wordAtPosition(state, range.head)
}

// Monaco executeEdits 不带 cursorState:光标靠 tracked range(AlwaysGrowsWhenTypingAtEdges)随编辑搬。
// 对替换 [s,e) → 长 n:≤s 不动;词内保持偏移(超出新长度则贴尾);≥e 随长度差平移(intervalTree nodeAcceptEdit)。
function trackInEdit(p: number, s: number, e: number, n: number): number {
    if (p <= s) return p
    if (p >= e) return p + n - (e - s)
    return Math.min(p, s + n)
}

function transformCasing(fn: (s: string) => string): StateCommand {
    return ({ state, dispatch }) => {
        if (state.readOnly) return false
        const changes: ChangeSpec[] = []
        const edits: ({ from: number, to: number, len: number } | null)[] = []
        for (const range of state.selection.ranges) {
            const span = transformRange(state, range)
            if (!span) {
                edits.push(null)
                continue
            }
            const next = fn(state.sliceDoc(span.from, span.to))
            // 同一个词里有两个光标:只换一次
            const dup = edits.some(e => e && e.from === span.from && e.to === span.to)
            if (!dup && next !== state.sliceDoc(span.from, span.to))
                changes.push({ from: span.from, to: span.to, insert: next })
            edits.push({ from: span.from, to: span.to, len: next.length })
        }
        if (!changes.length) return false
        const set = state.changes(changes)
        // 选区方向不变;端点先按自己那次替换算词内偏移,再加上前面别的替换带来的平移
        const ranges = state.selection.ranges.map((range, i) => {
            const ed = edits[i]
            if (!ed) return range.map(set)
            const base = set.mapPos(ed.from, -1)
            const at = (p: number) => base + trackInEdit(p, ed.from, ed.to, ed.len) - ed.from
            return EditorSelection.range(at(range.anchor), at(range.head))
        })
        dispatch(state.update({
            changes: set,
            selection: EditorSelection.create(ranges, state.selection.mainIndex),
            userEvent: 'input',
            scrollIntoView: true,
        }))
        return true
    }
}

export const transformToUppercase = transformCasing(s => s.toLocaleUpperCase())
export const transformToLowercase = transformCasing(s => s.toLocaleLowerCase())

// 下面照 Monaco 各 CaseAction 的 Unicode 正则逐码点扫描(禁正则):Lu = 大写字母,Ll = 小写字母,L = 字母,N = 数字。
function isLu(ch: string): boolean {
    return ch !== ch.toLowerCase() && ch === ch.toUpperCase()
}
function isLl(ch: string): boolean {
    return ch !== ch.toUpperCase() && ch === ch.toLowerCase()
}
function isN(ch: string): boolean {
    const o = ch.charCodeAt(0)
    return o >= 48 && o <= 57 || o >= 0xFF10 && o <= 0xFF19
}
function isL(ch: string): boolean {
    if (ch.toUpperCase() !== ch.toLowerCase()) return true
    const o = ch.codePointAt(0) ?? 0
    return o > 127 && !isN(ch) && categorizeCodePoint(o, ch) === CharCategory.Word
}
const isSpace = (ch: string) => categorizeCodePoint(ch.codePointAt(0) ?? 0, ch) === CharCategory.Space

// Title:先整体小写,再把 (^|[^\p{L}\p{N}']|((^|\P{L})'))\p{L} 里的字母大写——
// 字母前面是行首、非字母数字撇号,或「行首/非字母 + 撇号」。
function titleCase(s: string): string {
    const cs = Array.from(s.toLocaleLowerCase())
    let out = ''
    for (let i = 0; i < cs.length; i++) {
        const ch = cs[i]
        const p = cs[i - 1], pp = cs[i - 2]
        const boundary = i === 0 || p === '\n' || (p !== '\'' && !isL(p) && !isN(p))
            || (p === '\'' && (i === 1 || pp === '\n' || !isL(pp)))
        out += isL(ch) && boundary ? ch.toLocaleUpperCase() : ch
    }
    return out
}

export const transformToTitleCase = transformCasing(titleCase)

// (\p{Ll})(\p{Lu}) → $1 sep $2,再 (\p{Lu}|\p{N})(\p{Lu})(\p{Ll}) → $1 sep $2$3(全局替换不重叠,扫过的不回看)
function splitCaseBoundaries(s: string, sep: string): string {
    let cs = Array.from(s)
    let out: string[] = []
    for (let i = 0; i < cs.length; i++) {
        out.push(cs[i])
        if (i + 1 < cs.length && isLl(cs[i]) && isLu(cs[i + 1])) { out.push(sep, cs[i + 1]); i++ }
    }
    cs = out
    out = []
    for (let i = 0; i < cs.length; i++) {
        out.push(cs[i])
        if (i + 2 < cs.length && (isLu(cs[i]) || isN(cs[i])) && isLu(cs[i + 1]) && isLl(cs[i + 2])) {
            out.push(sep, cs[i + 1], cs[i + 2])
            i += 2
        }
    }
    return out.join('')
}

function toSnakeCase(s: string): string {
    return splitCaseBoundaries(s, '_').toLocaleLowerCase()
}

// Kebab:先 (\S)(_)(\S) → $1-$3,再按大小写边界插 -,最后小写
function toKebabCase(s: string): string {
    const cs = Array.from(s)
    let t = ''
    for (let i = 0; i < cs.length; i++) {
        if (i + 2 < cs.length && !isSpace(cs[i]) && cs[i + 1] === '_' && !isSpace(cs[i + 2])) {
            t += cs[i] + '-' + cs[i + 2]
            i += 2
        }
        else t += cs[i]
    }
    // 大小写边界同 Snake((\p{Lu}|\p{N})(\p{Lu}\p{Ll}) → $1-$2 与 Snake 的三组替换等价)
    return splitCaseBoundaries(t, '-').toLocaleLowerCase()
}

// 按 [_\s-] 切词
const capFirst = (w: string) => w.substring(0, 1).toLocaleUpperCase() + w.substring(1)

// Camel:其余词首字母大写、其余不动;首词按 Monaco validWordStart 小写首字母(FooBar → fooBar,FOO_BAR → FOOBAR)
function toCamelCase(s: string): string {
    // Monaco:多行文本只按 [_-]+ 切词(空白保留),单行按 [_\s-]+
    const words = s.split(/\r\n|\r|\n/.test(s) ? /[_-]+/ : /[_\s-]+/)
    // Monaco 0.53+ validWordStart:首词每行以「大写+非大写」开头时该字母小写(FooBar → fooBar,FOO_BAR 不动)
    const first = words[0].replace(/^(\p{Lu})(?=[^\p{Lu}])/gmu, c => c.toLocaleLowerCase())
    return first + words.slice(1).map(capFirst).join('')
}

// Pascal(Monaco wordBoundary = [_ \t-]):先在每个 . 之后断开(. 留在前一段),再切词、每词首字母大写;换行不是边界,原样保留
function toPascalCase(s: string): string {
    const words = s.split(/(?<=\.)/).flatMap(w => w.split(/[_ \t-]/))
    return words.map((w) => {
        const n = capFirst(w)
        // 全大写词(长度 > 1)只留首字母大写:FOO_BAR → FooBar
        return n.length > 1 && /^\p{Lu}+$/mu.test(n) ? n.charAt(0) + n.slice(1).toLocaleLowerCase() : n
    }).join('')
}

export const transformToSnakeCase = transformCasing(toSnakeCase)
export const transformToCamelCase = transformCasing(toCamelCase)
export const transformToKebabCase = transformCasing(toKebabCase)
export const transformToPascalCase = transformCasing(toPascalCase)

function splitIdent(s: string): string[] {
    const parts: string[] = []
    let cur = ''
    for (let i = 0; i < s.length; i++) {
        const ch = s[i]
        if (ch === '_' || ch === '-' || ch === ' ' || ch === '\t') {
            if (cur) { parts.push(cur); cur = '' }
            continue
        }
        if (isUpper(ch) && cur.length) {
            const prevLower = isLower(cur[cur.length - 1])
            const nextLower = i + 1 < s.length && isLower(s[i + 1])
            if (prevLower || nextLower) {
                parts.push(cur)
                cur = ch
                continue
            }
        }
        cur += ch
    }
    if (cur) parts.push(cur)
    return parts
}

function isUpper(ch: string): boolean {
    const o = ch.charCodeAt(0)
    return o >= 65 && o <= 90
}

function isLower(ch: string): boolean {
    const o = ch.charCodeAt(0)
    return o >= 97 && o <= 122
}

function toConstantCase(s: string): string {
    return splitIdent(s).map(p => p.toUpperCase()).join('_')
}

export const transformToConstantCase = transformCasing(toConstantCase)

// Monaco SortLinesCommand 的排序器(Intl.Collator 默认区域)
let collator: Intl.Collator | null = null

// Monaco AbstractSortLinesAction:单个空光标排整篇;每个选区排它覆盖的行(末端在行首则不含那行),
// 任一选区排不了(不足两行或已有序)就整条命令不做。选区端点照 trackSelection 随替换搬(方向不变)。
function sortSelectedLines(desc: boolean): StateCommand {
    return ({ state, dispatch }) => {
        if (state.readOnly) return false
        const doc = state.doc
        const sel = state.selection
        const whole = sel.ranges.length === 1 && sel.main.empty
        // 整篇时 Monaco 跟踪的是那个合成的全选选区,命令后整篇被选中
        const sels = whole ? [EditorSelection.range(0, doc.length)] : sel.ranges
        const spans = sels.map((r) => {
            const startN = doc.lineAt(r.from).number
            let endN = doc.lineAt(r.to).number
            if (r.to === doc.line(endN).from) endN--
            return { r, startN, endN }
        })
        collator ??= new Intl.Collator()
        const changes: ChangeSpec[] = []
        for (const { startN, endN } of spans) {
            if (startN >= endN) return false
            const before: string[] = []
            for (let n = startN; n <= endN; n++) before.push(doc.line(n).text)
            let after = before.slice().sort(collator.compare)
            if (desc) after = after.reverse()
            if (after.every((t, i) => t === before[i])) return false
            changes.push({ from: doc.line(startN).from, to: doc.line(endN).to, insert: after.join(state.lineBreak) })
        }
        const set = state.changes(changes)
        // tracked range(TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges):替换区里的端点保持偏移,超出新长度贴尾
        const ranges = sels.map((r, i) => {
            const span = spans[i]
            const from = doc.line(span.startN).from, to = doc.line(span.endN).to
            const at = (p: number) => p < from || p > to ? set.mapPos(p) : set.mapPos(from, -1) + Math.min(p - from, to - from)
            return EditorSelection.range(at(r.anchor), at(r.head))
        })
        dispatch(state.update({
            changes: set,
            selection: EditorSelection.create(ranges, whole ? 0 : sel.mainIndex),
            userEvent: 'input.sort',
            scrollIntoView: true,
        }))
        return true
    }
}

/** Sort Lines Ascending / Descending。排不了(不足两行、已有序)返 false。 */
export const sortLines = sortSelectedLines(false)
export const sortLinesDescending = sortSelectedLines(true)

// —— 缩进选项(Monaco model.updateOptions 的 tabSize / indentSize / insertSpaces)——
// lite-monaco 把它们放在 indentOptions 槽里:默认空 → 用宿主配的 EditorState.tabSize / indentUnit(facet 取首个值,
// 槽放在扩展最前面,命令写进来的值盖过宿主的)。insertSpaces = indentUnit 不含 Tab;空格模式 indentSize = unit 长度。
// state 里没有这个槽(纯 core 用法)时,改选项的命令什么也不做。

export const indentOptions = new Compartment()

export interface IndentOptions { tabSize: number, indentSize: number, insertSpaces: boolean }

function hasIndentOptions(state: EditorState): boolean {
    return indentOptions.get(state) !== undefined
}

/**
 * 改缩进选项的 effect(Monaco model.updateOptions):没给的 tabSize / insertSpaces 沿用当前值;没给 indentSize 时
 * 沿用 originalIndentSize —— 跟着 tabSize 走的还跟着走(Change Tab Display Size 改显示宽,空格缩进也跟着变),
 * 显式的(Indent Using Spaces / Tabs、Detect Indentation 设过)保持原值。
 */
export function setIndentOptions(state: EditorState, next: Partial<IndentOptions>) {
    const cur = indentConfig(state)
    const tabSize = next.tabSize ?? cur.tabSize
    const insertSpaces = next.insertSpaces ?? cur.insertSpaces
    const size: number | 'tabSize' = next.indentSize ?? (indentSizeFollowsTabSize(state) ? 'tabSize' : cur.indentSize)
    const indentSize = size === 'tabSize' ? tabSize : size
    return indentOptions.reconfigure([
        EditorState.tabSize.of(tabSize),
        EditorState.indentUnit.of(insertSpaces ? ' '.repeat(indentSize) : '\t'),
        indentSizeFacet.of(size),
    ])
}

/** 没被命令改过时的缩进选项(= Monaco 的 creation options,quick pick 里的 "Configured / Default Tab Size")。 */
export function configuredIndentOptions(state: EditorState): IndentOptions {
    if (!hasIndentOptions(state)) return indentConfig(state)
    return indentConfig(state.update({ effects: indentOptions.reconfigure([]) }).apply())
}

/** 设缩进选项(Indent Using Spaces / Tabs、Change Tab Display Size 的 quick pick 选完调这个)。 */
export function applyIndentOptions(next: Partial<IndentOptions>): StateCommand {
    return ({ state, dispatch }) => {
        if (!hasIndentOptions(state)) return false
        dispatch(state.update({ effects: setIndentOptions(state, next) }))
        return true
    }
}

/**
 * Convert Indentation to Spaces / Tabs(Monaco IndentationToSpacesCommand / IndentationToTabsCommand):
 * 不看选区,整篇每行(纯空白行也算)的前导空白做文本替换 —— 每个 Tab 换成 tabSize 个空格,
 * 或每段连续 tabSize 个空格换成一个 Tab;然后 insertSpaces 设成对应值。
 * 主选区按 Monaco trackSelection 的粘性跟着编辑搬(tracked.ts),其余选区按原行列留在原地。
 */
function convertIndent(toTabs: boolean): StateCommand {
    return ({ state, dispatch }) => {
        if (state.readOnly) return false
        const doc = state.doc
        const tabSize = state.tabSize
        const spaces = ' '.repeat(tabSize)
        const changes: ChangeSpec[] = []
        const tracked: TrackedEdit[] = []
        if (doc.length) {
            for (let n = 1; n <= doc.lines; n++) {
                const line = doc.line(n)
                const ws = leadingWs(line.text)
                if (!ws) continue
                const lead = line.text.slice(0, ws)
                const next = toTabs ? lead.split(spaces).join('\t') : lead.split('\t').join(spaces)
                if (next !== lead) {
                    changes.push({ from: line.from, to: line.from + ws, insert: next })
                    tracked.push({ from: line.from, to: line.from + ws, n: next.length })
                }
            }
        }
        const effects = hasIndentOptions(state) ? [setIndentOptions(state, { insertSpaces: !toTabs })] : []
        if (!changes.length && !effects.length) return false
        if (!changes.length) {
            dispatch(state.update({ effects }))
            return true
        }
        const set = state.changes(changes)
        const newDoc = set.apply(doc)
        const sel = state.selection
        const ranges = sel.ranges.map((r, i) => {
            if (i === sel.mainIndex) return trackSelection(state, r, tracked)
            const keep = (p: number) => {
                const l = doc.lineAt(p)
                const nl = newDoc.line(l.number)
                return nl.from + Math.min(p - l.from, nl.length)
            }
            return EditorSelection.range(keep(r.anchor), keep(r.head))
        })
        dispatch(state.update({ changes: set, selection: EditorSelection.create(ranges, sel.mainIndex), effects, userEvent: 'input', scrollIntoView: true }))
        return true
    }
}

export const indentToSpaces = convertIndent(false)
export const indentToTabs = convertIndent(true)

/** Detect Indentation from Content(Monaco model.detectIndentation,默认值取没改过的配置):tabSize = indentSize = 猜出来的值。 */
export const detectIndentationFromContent: StateCommand = ({ state, dispatch }) => {
    if (!hasIndentOptions(state)) return false
    const def = configuredIndentOptions(state)
    const lines: string[] = []
    const max = Math.min(state.doc.lines, 10000)
    for (let n = 1; n <= max; n++) lines.push(state.doc.line(n).text)
    const g = guessIndentation(lines, def.tabSize, def.insertSpaces)
    dispatch(state.update({ effects: setIndentOptions(state, { tabSize: g.tabSize, indentSize: g.tabSize, insertSpaces: g.insertSpaces }) }))
    return true
}

function wrapWith(open: string, close: string): StateCommand {
    return ({ state, dispatch }) => {
        if (state.readOnly) return false
        const sel = state.selection.main
        let from = sel.from
        let to = sel.to
        if (sel.empty) {
            const w = wordAt(state, sel.head)
            if (!w) return false
            from = w.from
            to = w.to
        }
        const text = state.sliceDoc(from, to)
        dispatch(state.update({
            changes: { from, to, insert: open + text + close },
            selection: EditorSelection.range(from + open.length, from + open.length + text.length),
            userEvent: 'input',
            scrollIntoView: true,
        }))
        return true
    }
}

export const wrapInParens = wrapWith('(', ')')
export const wrapInBrackets = wrapWith('[', ']')
export const wrapInBraces = wrapWith('{', '}')
export const wrapInQuotes = wrapWith('"', '"')

// —— Reindent Lines / Reindent Selected Lines(Monaco contrib/indentation getReindentEditOperations)——
// 规则来自语言的 indentationRules。Monaco standalone 的 TS / JS / JSON / CSS / HTML 都没配,这两条命令在它们上面
// 什么也不做;lite-monaco 自带的语言同样不配(和 Monaco 一致)。宿主想要可以经 indentRulesFacet 给语言配上
// (比如 VS Code typescript-basics 那套)。Monaco 判断前会把字符串 / 注释 / 正则 token 里的括号剥掉、跳过行首是
// 字符串的行;lite-monaco 借 target(view)的 token 缓存做同样的事(indent.ts indentRuleLines),没 token 时照纯文本。

// 规则 facet 和 autoIndent 档位定义在 autoindent.ts(回车 / 打字也要用,那边是叶子模块)
export { autoIndentFacet, indentRulesFacet, type AutoIndentStrategy, type IndentationRules } from './autoindent'

function reindentEdits(state: EditorState, rules: IndentationRules, start: number, end: number, lines: IndentRuleLines): ChangeSpec[] {
    const doc = state.doc
    if (!doc.length) return []
    const cfg = indentConfig(state)
    const textOf = lines.text
    const ignore = (n: number, indent?: string) => testRule(rules.unIndentedLinePattern, textOf(n, indent))
    const increase = (n: number, indent?: string) => testRule(rules.increaseIndentPattern, textOf(n, indent))
    const decrease = (n: number, indent?: string) => testRule(rules.decreaseIndentPattern, textOf(n, indent))
    const indentNext = (n: number, indent?: string) => testRule(rules.indentNextLinePattern, textOf(n, indent))
    // ShiftCommand.shiftIndent / unshiftIndent:按 tab stop 加减一级
    const vcol = (s: string) => leadingCols(s, cfg.tabSize)
    const shift = (s: string) => {
        const v = vcol(s)
        if (cfg.insertSpaces) return ' '.repeat(v + cfg.indentSize - (v % cfg.indentSize))
        return '\t'.repeat((v + cfg.tabSize - (v % cfg.tabSize)) / cfg.tabSize)
    }
    const unshift = (s: string) => {
        const v = vcol(s)
        if (cfg.insertSpaces) return ' '.repeat(Math.max(0, v - 1 - ((v - 1) % cfg.indentSize)))
        return '\t'.repeat(Math.max(0, v - 1 - ((v - 1) % cfg.tabSize)) / cfg.tabSize)
    }
    end = Math.min(end, doc.lines)
    while (start <= end && ignore(start)) start++
    if (start > end - 1) return []
    let globalIndent = leadingWhitespaceOf(doc.line(start).text)
    let ideal = globalIndent
    if (increase(start)) { ideal = shift(ideal); globalIndent = shift(globalIndent) }
    else if (indentNext(start)) ideal = shift(ideal)
    const changes: ChangeSpec[] = []
    for (let n = start + 1; n <= end; n++) {
        if (lines.startsWithString(n)) continue
        const line = doc.line(n)
        const old = leadingWhitespaceOf(line.text)
        const cur = ideal
        if (decrease(n, cur)) { ideal = unshift(ideal); globalIndent = unshift(globalIndent) }
        if (old !== ideal) changes.push({ from: line.from, to: line.from + old.length, insert: normalizeIndentation(ideal, cfg) })
        if (ignore(n)) continue
        else if (increase(n, cur)) { globalIndent = shift(globalIndent); ideal = globalIndent }
        else if (indentNext(n, cur)) ideal = shift(ideal)
        else ideal = globalIndent
    }
    return changes
}

function dispatchReindent(state: EditorState, dispatch: (tr: Transaction) => void, changes: ChangeSpec[]): boolean {
    if (!changes.length) return false
    dispatch(state.update({ changes, userEvent: 'input', scrollIntoView: true }))
    return true
}

/** Reindent Lines:整篇按缩进规则重排。语言没配规则 → 不动(同 Monaco)。 */
export const reindentLines: StateCommand = (target) => {
    const { state, dispatch } = target
    const rules = state.facet(indentRulesFacet)
    if (state.readOnly || !rules) return false
    return dispatchReindent(state, dispatch, reindentEdits(state, rules, 1, state.doc.lines, indentRuleLines(target, state.doc)))
}

/**
 * Reindent Selected Lines:每个选区(止于行首的末行不算)从它上一行起算,第 1 行的单行选区跳过。
 * 语言没配规则 → 不动(同 Monaco)。
 */
export const reindentSelectedLines: StateCommand = (target) => {
    const { state, dispatch } = target
    const rules = state.facet(indentRulesFacet)
    if (state.readOnly || !rules) return false
    const doc = state.doc
    const lines = indentRuleLines(target, doc)
    const changes: ChangeSpec[] = []
    const seen = new Set<number>()
    for (const r of state.selection.ranges) {
        let start = doc.lineAt(r.from).number
        let end = doc.lineAt(r.to).number
        if (start !== end && r.to === doc.line(end).from) end--
        if (start === 1) { if (start === end) continue }
        else start--
        for (const c of reindentEdits(state, rules, start, end, lines) as { from: number, to: number, insert: string }[]) {
            if (seen.has(c.from)) continue
            seen.add(c.from)
            changes.push(c)
        }
    }
    return dispatchReindent(state, dispatch, changes)
}

/** 旧名(= Reindent Selected Lines)。 */
export const reindentSelection = reindentSelectedLines

// Monaco ReverseLinesAction / DeleteDuplicateLinesAction 共用:单个空光标 = 整篇,否则每个选区覆盖的整行。
function linesSpans(state: EditorState, trimEndAtLineStart: boolean): { startN: number, endN: number }[] {
    const doc = state.doc
    const sel = state.selection
    if (sel.ranges.length === 1 && sel.main.empty) return [{ startN: 1, endN: doc.lines }]
    return sel.ranges.map((r) => {
        const startN = doc.lineAt(r.from).number
        let endN = doc.lineAt(r.to).number
        if (trimEndAtLineStart && startN < endN && r.to === doc.line(endN).from) endN--
        return { startN, endN }
    })
}

/** 倒转选中行(Monaco reverseLines):空光标倒转整篇;选区止于行首不含该行;文末空行不动;选区随行搬、列不变。 */
export const reverseLines: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const doc = state.doc
    const spans = linesSpans(state, true)
    const changes: ChangeSpec[] = []
    for (const sp of spans) {
        if (sp.endN === doc.lines && doc.line(sp.endN).text === '' && sp.endN > sp.startN) sp.endN--
        const texts: string[] = []
        for (let n = sp.endN; n >= sp.startN; n--) texts.push(doc.line(n).text)
        changes.push({ from: doc.line(sp.startN).from, to: doc.line(sp.endN).to, insert: texts.join(state.lineBreak) })
    }
    const set = state.changes(changes)
    const next = set.apply(doc)
    const at = (pos: number, sp: { startN: number, endN: number }): number => {
        const line = doc.lineAt(pos)
        const n = line.number <= sp.endN ? sp.endN - line.number + sp.startN : line.number
        const nl = next.line(n)
        return nl.from + Math.min(pos - line.from, nl.length)
    }
    const whole = state.selection.ranges.length === 1 && state.selection.main.empty
    const ranges = state.selection.ranges.map((r, i) => {
        const sp = spans[whole ? 0 : i]
        return EditorSelection.range(at(r.anchor, sp), at(r.head, sp))
    })
    dispatch(state.update({
        changes: set,
        selection: EditorSelection.create(ranges, state.selection.mainIndex),
        userEvent: 'input',
        scrollIntoView: true,
    }))
    return true
}

/** Delete Duplicate Lines(Monaco removeDuplicateLines):空光标去重整篇(选区不变),否则每个选区各自去重并选中结果。 */
export const removeDuplicateLines: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const doc = state.doc
    if (doc.lines === 1 && doc.line(1).length === 0) return false
    const whole = state.selection.ranges.length === 1 && state.selection.main.empty
    const spans = linesSpans(state, false)
    const changes: ChangeSpec[] = []
    const picked: { start: number, count: number, lastLen: number }[] = []
    let deleted = 0
    for (const sp of spans) {
        const seen = new Set<string>()
        const lines: string[] = []
        for (let n = sp.startN; n <= sp.endN; n++) {
            const t = doc.line(n).text
            if (seen.has(t)) continue
            seen.add(t)
            lines.push(t)
        }
        changes.push({ from: doc.line(sp.startN).from, to: doc.line(sp.endN).to, insert: lines.join(state.lineBreak) })
        picked.push({ start: sp.startN - deleted, count: lines.length, lastLen: lines[lines.length - 1].length })
        deleted += sp.endN - sp.startN + 1 - lines.length
    }
    const set = state.changes(changes)
    const spec: { changes: ChangeSet, selection?: EditorSelection, userEvent: string, scrollIntoView: boolean } = {
        changes: set, userEvent: 'input', scrollIntoView: true,
    }
    if (!whole) {
        const next = set.apply(doc)
        spec.selection = EditorSelection.create(picked.map((p) => {
            const from = next.line(p.start).from
            const last = next.line(p.start + p.count - 1)
            // Monaco 的终点列取 lastLen(不是 lastLen+1),即停在末字符之前;测试把这个量钉死了,照搬
            return EditorSelection.range(from, last.from + Math.max(0, p.lastLen - 1))
        }), state.selection.mainIndex)
    }
    dispatch(state.update(spec))
    return true
}

/** 选最小括号对或引号的内部。已在内部返 false。 */
export const selectInside: StateCommand = ({ state, dispatch }) => {
    const sel = state.selection.main
    const text = state.sliceDoc()
    const pair = enclosingPair(text, sel.from, sel.to)
    if (pair && pair.to - pair.from > 2) {
        const from = pair.from + 1
        const to = pair.to - 1
        if (sel.from !== from || sel.to !== to) {
            dispatch(state.update({
                selection: EditorSelection.range(from, to),
                userEvent: 'select',
                scrollIntoView: true,
            }))
            return true
        }
    }
    const q = findQuotedAt(text, sel.empty ? sel.head : sel.from)
    if (q && q.to - q.from > 2) {
        const from = q.from + 1
        const to = q.to - 1
        if (sel.from !== from || sel.to !== to) {
            dispatch(state.update({
                selection: EditorSelection.range(from, to),
                userEvent: 'select',
                scrollIntoView: true,
            }))
            return true
        }
    }
    return false
}

export const deleteInside: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const sel = state.selection.main
    const text = state.sliceDoc()
    let from = -1
    let to = -1
    const pair = enclosingPair(text, sel.from, sel.to)
    if (pair && pair.to - pair.from > 2) {
        from = pair.from + 1
        to = pair.to - 1
    }
    else {
        const q = findQuotedAt(text, sel.empty ? sel.head : sel.from)
        if (q && q.to - q.from > 2) {
            from = q.from + 1
            to = q.to - 1
        }
    }
    if (from < 0 || to <= from) return false
    dispatch(state.update({
        changes: { from, to },
        selection: EditorSelection.cursor(from),
        userEvent: 'delete',
        scrollIntoView: true,
    }))
    return true
}

export const stripLineComments: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const changes: ChangeSpec[] = []
    for (let n = 1; n <= state.doc.lines; n++) {
        const line = state.doc.line(n)
        const t = line.text
        let inQ = ''
        let cut = -1
        for (let i = 0; i < t.length; i++) {
            if (inQ) {
                if (t[i] === '\\') { i++; continue }
                if (t[i] === inQ) inQ = ''
                continue
            }
            if (t[i] === "'" || t[i] === '"') { inQ = t[i]; continue }
            if (t[i] === '/' && t[i + 1] === '/') {
                if (i > 0 && t[i - 1] === ':') continue
                cut = i
                break
            }
        }
        if (cut < 0) continue
        let end = cut
        while (end > 0 && (t[end - 1] === ' ' || t[end - 1] === '\t')) end--
        changes.push({ from: line.from + end, to: line.to })
    }
    if (!changes.length) return false
    dispatch(state.update({ changes, userEvent: 'delete', scrollIntoView: true }))
    return true
}

const SURROUND_NEXT: Record<string, string> = { '(': '[', '[': '{', '{': '(' }
const SURROUND_CLOSE: Record<string, string> = { '[': ']', '{': '}', '(': ')' }

export const cycleSurrounding: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const sel = state.selection.main
    const text = state.sliceDoc()
    const pair = enclosingPair(text, sel.from, sel.to)
        ?? (sel.from < sel.to && OPEN_CLOSE[text[sel.from]] && matchForward(text, text[sel.from], sel.from) === sel.to - 1
            ? { from: sel.from, to: sel.to }
            : null)
    if (!pair) return false
    const nextOpen = SURROUND_NEXT[text[pair.from]]
    if (!nextOpen) return false
    dispatch(state.update({
        changes: [
            { from: pair.to - 1, to: pair.to, insert: SURROUND_CLOSE[nextOpen] },
            { from: pair.from, to: pair.from + 1, insert: nextOpen },
        ],
        userEvent: 'input',
        scrollIntoView: true,
    }))
    return true
}

export const toggleOptionalChain: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const text = state.sliceDoc()
    let i = state.selection.main.head
    if (i > 0 && text[i] !== '.' && text[i] !== '?' && (text[i - 1] === '.' || text[i - 1] === '?'))
        i--
    if (text[i] === '?' && text[i + 1] === '.') {
        dispatch(state.update({
            changes: { from: i, to: i + 1 },
            selection: EditorSelection.cursor(i),
            userEvent: 'delete',
            scrollIntoView: true,
        }))
        return true
    }
    if (text[i] === '.' && i > 0 && text[i - 1] === '?') {
        dispatch(state.update({
            changes: { from: i - 1, to: i },
            selection: EditorSelection.cursor(i - 1),
            userEvent: 'delete',
            scrollIntoView: true,
        }))
        return true
    }
    if (text[i] === '.' && (i === 0 || text[i - 1] !== '?')) {
        dispatch(state.update({
            changes: { from: i, insert: '?' },
            selection: EditorSelection.cursor(i + 1),
            userEvent: 'input',
            scrollIntoView: true,
        }))
        return true
    }
    return false
}

export const toggleNullish: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const text = state.sliceDoc()
    let i = state.selection.main.head
    if (i > 0 && text[i] !== '|' && text[i] !== '?' && (text[i - 1] === '|' || text[i - 1] === '?'))
        i--
    if (i > 0 && ((text[i] === '|' && text[i - 1] === '|') || (text[i] === '?' && text[i - 1] === '?')))
        i--
    if (text[i] === '|' && text[i + 1] === '|') {
        dispatch(state.update({
            changes: { from: i, to: i + 2, insert: '??' },
            selection: EditorSelection.cursor(i + 1),
            userEvent: 'input',
            scrollIntoView: true,
        }))
        return true
    }
    if (text[i] === '?' && text[i + 1] === '?') {
        dispatch(state.update({
            changes: { from: i, to: i + 2, insert: '||' },
            selection: EditorSelection.cursor(i + 1),
            userEvent: 'input',
            scrollIntoView: true,
        }))
        return true
    }
    return false
}

function assignCol(line: string): number {
    for (let i = 0; i < line.length; i++) {
        if (line[i] !== '=') continue
        const prev = i > 0 ? line[i - 1] : ''
        const next = line[i + 1] ?? ''
        if (next === '=' || next === '>') continue
        if (prev === '=' || prev === '!' || prev === '<' || prev === '>') continue
        return i
    }
    return -1
}

export const alignEquals: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const sel = state.selection.main
    if (sel.empty) return false
    const doc = state.doc
    const startN = doc.lineAt(sel.from).number
    const toPos = sel.to === doc.lineAt(sel.to).from && sel.to > sel.from ? sel.to - 1 : sel.to
    const endN = doc.lineAt(toPos).number
    if (endN <= startN) return false
    const cols: { n: number, col: number }[] = []
    let max = -1
    for (let n = startN; n <= endN; n++) {
        const col = assignCol(doc.line(n).text)
        if (col < 0) continue
        cols.push({ n, col })
        if (col > max) max = col
    }
    if (max < 0 || cols.every(c => c.col === max)) return false
    const changes: ChangeSpec[] = []
    for (const c of cols) {
        if (c.col >= max) continue
        const line = doc.line(c.n)
        changes.push({ from: line.from + c.col, insert: ' '.repeat(max - c.col) })
    }
    if (!changes.length) return false
    dispatch(state.update({ changes, userEvent: 'input', scrollIntoView: true }))
    return true
}

export const stripBlockComments: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const text = state.sliceDoc()
    const changes: ChangeSpec[] = []
    let inQ = ''
    for (let i = 0; i < text.length; i++) {
        if (inQ) {
            if (text[i] === '\\') { i++; continue }
            if (text[i] === inQ) inQ = ''
            continue
        }
        if (text[i] === "'" || text[i] === '"') { inQ = text[i]; continue }
        if (text[i] === '/' && text[i + 1] === '*') {
            let j = i + 2
            while (j < text.length && !(text[j] === '*' && text[j + 1] === '/')) j++
            if (j >= text.length) break
            j += 2
            let from = i
            while (from > 0 && (text[from - 1] === ' ' || text[from - 1] === '\t')) from--
            if (j < text.length && text[j] !== '\n' && text[j] !== '\r')
                from = i
            changes.push({ from, to: j })
            i = j - 1
        }
    }
    if (!changes.length) return false
    dispatch(state.update({ changes, userEvent: 'delete', scrollIntoView: true }))
    return true
}

function startsWordAt(s: string, i: number, w: string): boolean {
    for (let k = 0; k < w.length; k++)
        if (s[i + k] !== w[k]) return false
    const after = s[i + w.length]
    if (after && ((after >= 'A' && after <= 'Z') || (after >= 'a' && after <= 'z') || after === '_' || (after >= '0' && after <= '9')))
        return false
    return true
}

export function addBracesToLine(line: string): string | null {
    let i = 0
    while (i < line.length && (line[i] === ' ' || line[i] === '\t')) i++
    const indent = line.slice(0, i)
    if (startsWordAt(line, i, 'else') && !startsWordAt(line, i + 5 + (line[i + 4] === ' ' ? 1 : 0), 'if')) {
        i += 4
    }
    else {
        if (startsWordAt(line, i, 'else')) {
            i += 4
            while (i < line.length && (line[i] === ' ' || line[i] === '\t')) i++
        }
        if (startsWordAt(line, i, 'if') || startsWordAt(line, i, 'for') || startsWordAt(line, i, 'while')) {
            while (i < line.length && line[i] !== '(') i++
            if (line[i] !== '(') return null
            let d = 0
            for (; i < line.length; i++) {
                if (line[i] === '(') d++
                else if (line[i] === ')') {
                    d--
                    if (d === 0) { i++; break }
                }
            }
        }
        else return null
    }
    while (i < line.length && (line[i] === ' ' || line[i] === '\t')) i++
    const body = line.slice(i)
    if (!body || body[0] === '{') return null
    return indent + line.slice(indent.length, i) + '{ ' + body + ' }'
}

export const addBraces: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const line = state.doc.lineAt(state.selection.main.head)
    const next = addBracesToLine(line.text)
    if (!next) return false
    dispatch(state.update({
        changes: { from: line.from, to: line.to, insert: next },
        userEvent: 'input',
        scrollIntoView: true,
    }))
    return true
}

function isIdentCharAt(ch: string): boolean {
    const o = ch.charCodeAt(0)
    return (o >= 48 && o <= 57) || (o >= 65 && o <= 90) || (o >= 97 && o <= 122) || o === 95 || o === 36
}

export const addAwait: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const text = state.sliceDoc()
    let pos = state.selection.main.head
    if (pos > 0 && !isIdentCharAt(text[pos] ?? '') && isIdentCharAt(text[pos - 1] ?? ''))
        pos--
    if (pos >= text.length || !isIdentCharAt(text[pos])) return false
    let from = pos
    while (from > 0 && isIdentCharAt(text[from - 1])) from--
    let i = from
    while (i > 0 && (text[i - 1] === ' ' || text[i - 1] === '\t')) i--
    const alreadyAwait = i >= 5 && text.slice(i - 5, i) === 'await'
        && (i === 5 || !isIdentCharAt(text[i - 6]))
    const changes: ChangeSpec[] = []
    if (!alreadyAwait)
        changes.push({ from, insert: 'await ' })
    let depth = 0
    let fn = -1
    for (let j = from - 1; j >= 0; j--) {
        if (text[j] === '}') depth++
        else if (text[j] === '{') {
            if (depth) depth--
            else {
                let k = j
                while (k > 0 && (text[k - 1] === ' ' || text[k - 1] === '\t' || text[k - 1] === '\n')) k--
                if (k >= 1 && text[k - 1] === ')') {
                    let d = 0
                    let p = k - 1
                    for (; p >= 0; p--) {
                        if (text[p] === ')') d++
                        else if (text[p] === '(') {
                            d--
                            if (d === 0) break
                        }
                    }
                    if (p >= 0) {
                        p--
                        while (p >= 0 && (text[p] === ' ' || text[p] === '\t')) p--
                        if (p >= 0 && isIdentCharAt(text[p])) {
                            while (p >= 0 && isIdentCharAt(text[p])) p--
                            while (p >= 0 && (text[p] === ' ' || text[p] === '\t')) p--
                        }
                        const end = p + 1
                        if (end >= 8 && text.slice(end - 8, end) === 'function')
                            fn = end - 8
                    }
                }
                break
            }
        }
    }
    if (fn >= 0) {
        let a = fn
        while (a > 0 && (text[a - 1] === ' ' || text[a - 1] === '\t' || text[a - 1] === '\n')) a--
        const alreadyAsync = a >= 5 && text.slice(a - 5, a) === 'async' && (a === 5 || !isIdentCharAt(text[a - 6]))
        if (!alreadyAsync)
            changes.push({ from: fn, insert: 'async ' })
    }
    if (!changes.length) return false
    dispatch(state.update({ changes, userEvent: 'input', scrollIntoView: true }))
    return true
}

export const toggleExport: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const line = state.doc.lineAt(state.selection.main.head)
    let i = 0
    const t = line.text
    while (i < t.length && (t[i] === ' ' || t[i] === '\t')) i++
    if (startsWordAt(t, i, 'export')) {
        let j = i + 6
        if (j < t.length && isIdentCharAt(t[j])) return false
        while (j < t.length && (t[j] === ' ' || t[j] === '\t')) j++
        dispatch(state.update({
            changes: { from: line.from + i, to: line.from + j },
            userEvent: 'delete',
            scrollIntoView: true,
        }))
        return true
    }
    if (!startsWordAt(t, i, 'const') && !startsWordAt(t, i, 'let') && !startsWordAt(t, i, 'var')
        && !startsWordAt(t, i, 'function') && !startsWordAt(t, i, 'class') && !startsWordAt(t, i, 'async'))
        return false
    dispatch(state.update({
        changes: { from: line.from + i, insert: 'export ' },
        userEvent: 'input',
        scrollIntoView: true,
    }))
    return true
}

export const ifToTernary: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const line = state.doc.lineAt(state.selection.main.head)
    const next = ifToTernaryLine(line.text)
    if (!next) return false
    dispatch(state.update({
        changes: { from: line.from, to: line.to, insert: next },
        userEvent: 'input',
        scrollIntoView: true,
    }))
    return true
}

export const functionToArrow: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const line = state.doc.lineAt(state.selection.main.head)
    const next = functionToArrowLine(line.text)
    if (!next) return false
    dispatch(state.update({
        changes: { from: line.from, to: line.to, insert: next },
        userEvent: 'input',
        scrollIntoView: true,
    }))
    return true
}

export const splitCallArgs: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const hit = splitCallArgsAt(state.sliceDoc(), state.selection.main.head)
    if (!hit) return false
    dispatch(state.update({
        changes: { from: hit.from, to: hit.to, insert: hit.insert },
        userEvent: 'input',
        scrollIntoView: true,
    }))
    return true
}

export const joinCallArgs: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const hit = joinCallArgsAt(state.sliceDoc(), state.selection.main.head)
    if (!hit) return false
    dispatch(state.update({
        changes: { from: hit.from, to: hit.to, insert: hit.insert },
        userEvent: 'input',
        scrollIntoView: true,
    }))
    return true
}

export const unwrapTernary: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const line = state.doc.lineAt(state.selection.main.head)
    const next = unwrapTernaryLine(line.text)
    if (!next) return false
    dispatch(state.update({
        changes: { from: line.from, to: line.to, insert: next },
        userEvent: 'input',
        scrollIntoView: true,
    }))
    return true
}

export const toggleBoolean: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const hit = toggleBooleanAt(state.sliceDoc(), state.selection.main.head)
    if (!hit) return false
    dispatch(state.update({
        changes: { from: hit.from, to: hit.to, insert: hit.insert },
        userEvent: 'input',
        scrollIntoView: true,
    }))
    return true
}

export const promoteBinding: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const line = state.doc.lineAt(state.selection.main.head)
    const next = promoteBindingLine(line.text)
    if (!next) return false
    dispatch(state.update({
        changes: { from: line.from, to: line.to, insert: next },
        userEvent: 'input',
        scrollIntoView: true,
    }))
    return true
}

export const invertComparison: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const hit = invertComparisonAt(state.sliceDoc(), state.selection.main.head)
    if (!hit) return false
    dispatch(state.update({
        changes: { from: hit.from, to: hit.to, insert: hit.insert },
        userEvent: 'input',
        scrollIntoView: true,
    }))
    return true
}

export const arrowToFunction: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const line = state.doc.lineAt(state.selection.main.head)
    const next = arrowToFunctionLine(line.text)
    if (!next) return false
    dispatch(state.update({
        changes: { from: line.from, to: line.to, insert: next },
        userEvent: 'input',
        scrollIntoView: true,
    }))
    return true
}

export const toggleArrowBraces: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const line = state.doc.lineAt(state.selection.main.head)
    const next = toggleArrowBracesLine(line.text)
    if (!next) return false
    dispatch(state.update({
        changes: { from: line.from, to: line.to, insert: next },
        userEvent: 'input',
        scrollIntoView: true,
    }))
    return true
}

export const extractConstant: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const sel = state.selection.main
    const hit = extractConstantEdit(state.sliceDoc(), sel.from, sel.to, state.lineBreak)
    if (!hit) return false
    const usage = hit.from + hit.insert.length - 1
    dispatch(state.update({
        changes: { from: hit.from, to: hit.to, insert: hit.insert },
        selection: EditorSelection.single(usage, usage + 1),
        userEvent: 'input',
        scrollIntoView: true,
    }))
    return true
}

export const flipIfElse: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const line = state.doc.lineAt(state.selection.main.head)
    const next = flipIfElseLine(line.text)
    if (!next) return false
    dispatch(state.update({
        changes: { from: line.from, to: line.to, insert: next },
        userEvent: 'input',
        scrollIntoView: true,
    }))
    return true
}

export const negateIf: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const line = state.doc.lineAt(state.selection.main.head)
    const next = negateIfLine(line.text)
    if (!next) return false
    dispatch(state.update({
        changes: { from: line.from, to: line.to, insert: next },
        userEvent: 'input',
        scrollIntoView: true,
    }))
    return true
}

export const toggleObjectShorthand: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const hit = toggleObjectShorthandAt(state.sliceDoc(), state.selection.main.head)
    if (!hit) return false
    dispatch(state.update({
        changes: { from: hit.from, to: hit.to, insert: hit.insert },
        userEvent: 'input',
        scrollIntoView: true,
    }))
    return true
}

export const swapOperands: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const hit = swapOperandsAt(state.sliceDoc(), state.selection.main.head)
    if (!hit) return false
    dispatch(state.update({
        changes: { from: hit.from, to: hit.to, insert: hit.insert },
        selection: EditorSelection.single(hit.head),
        userEvent: 'input',
        scrollIntoView: true,
    }))
    return true
}

export const toggleMemberAccess: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const hit = toggleMemberAccessAt(state.sliceDoc(), state.selection.main.head)
    if (!hit) return false
    dispatch(state.update({
        changes: { from: hit.from, to: hit.to, insert: hit.insert },
        userEvent: 'input',
        scrollIntoView: true,
    }))
    return true
}

export const toggleTrailingComma: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const hit = toggleTrailingCommaAt(state.sliceDoc(), state.selection.main.head)
    if (!hit) return false
    dispatch(state.update({
        changes: { from: hit.from, to: hit.to, insert: hit.insert },
        userEvent: 'input',
        scrollIntoView: true,
    }))
    return true
}

export const splitDecl: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const line = state.doc.lineAt(state.selection.main.head)
    const next = splitDeclLine(line.text)
    if (!next) return false
    dispatch(state.update({
        changes: { from: line.from, to: line.to, insert: next },
        userEvent: 'input',
        scrollIntoView: true,
    }))
    return true
}

export const joinDecl: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const line = state.doc.lineAt(state.selection.main.head)
    if (line.number >= state.doc.lines) return false
    const other = state.doc.line(line.number + 1)
    const next = joinDeclLines(line.text, other.text)
    if (!next) return false
    dispatch(state.update({
        changes: { from: line.from, to: other.to, insert: next },
        userEvent: 'input',
        scrollIntoView: true,
    }))
    return true
}

export const unwrapIf: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const line = state.doc.lineAt(state.selection.main.head)
    const next = unwrapIfLine(line.text)
    if (!next) return false
    dispatch(state.update({
        changes: { from: line.from, to: line.to, insert: next },
        userEvent: 'input',
        scrollIntoView: true,
    }))
    return true
}

export const toggleAsync: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const line = state.doc.lineAt(state.selection.main.head)
    const next = toggleAsyncLine(line.text)
    if (!next) return false
    dispatch(state.update({
        changes: { from: line.from, to: line.to, insert: next },
        userEvent: 'input',
        scrollIntoView: true,
    }))
    return true
}

export const removeBraces: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const line = state.doc.lineAt(state.selection.main.head)
    const next = removeBracesLine(line.text)
    if (!next) return false
    dispatch(state.update({
        changes: { from: line.from, to: line.to, insert: next },
        userEvent: 'input',
        scrollIntoView: true,
    }))
    return true
}

export const inlineConstant: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const hit = inlineConstantEdit(state.sliceDoc(), state.selection.main.head)
    if (!hit) return false
    dispatch(state.update({
        changes: { from: hit.from, to: hit.to, insert: hit.insert },
        userEvent: 'input',
        scrollIntoView: true,
    }))
    return true
}

export const toggleStrictEq: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const hit = toggleStrictEqAt(state.sliceDoc(), state.selection.main.head)
    if (!hit) return false
    dispatch(state.update({
        changes: { from: hit.from, to: hit.to, insert: hit.insert },
        selection: EditorSelection.single(hit.from + 1),
        userEvent: 'input',
        scrollIntoView: true,
    }))
    return true
}

export const splitArray: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const hit = splitArrayAt(state.sliceDoc(), state.selection.main.head)
    if (!hit) return false
    dispatch(state.update({
        changes: { from: hit.from, to: hit.to, insert: hit.insert },
        userEvent: 'input',
        scrollIntoView: true,
    }))
    return true
}

export const joinArray: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const hit = joinArrayAt(state.sliceDoc(), state.selection.main.head)
    if (!hit) return false
    dispatch(state.update({
        changes: { from: hit.from, to: hit.to, insert: hit.insert },
        userEvent: 'input',
        scrollIntoView: true,
    }))
    return true
}

export const toggleIncrement: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const hit = toggleIncrementAt(state.sliceDoc(), state.selection.main.head)
    if (!hit) return false
    dispatch(state.update({
        changes: { from: hit.from, to: hit.to, insert: hit.insert },
        userEvent: 'input',
        scrollIntoView: true,
    }))
    return true
}

export const splitString: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const hit = splitStringAt(state.sliceDoc(), state.selection.main.head)
    if (!hit) return false
    dispatch(state.update({
        changes: { from: hit.from, to: hit.to, insert: hit.insert },
        userEvent: 'input',
        scrollIntoView: true,
    }))
    return true
}

export const joinString: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const hit = joinStringAt(state.sliceDoc(), state.selection.main.head)
    if (!hit) return false
    dispatch(state.update({
        changes: { from: hit.from, to: hit.to, insert: hit.insert },
        userEvent: 'input',
        scrollIntoView: true,
    }))
    return true
}

export const wrapInIf: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const line = state.doc.lineAt(state.selection.main.head)
    const next = wrapInIfLine(line.text)
    if (!next) return false
    dispatch(state.update({
        changes: { from: line.from, to: line.to, insert: next },
        userEvent: 'input',
        scrollIntoView: true,
    }))
    return true
}

export const toggleSemicolon: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const line = state.doc.lineAt(state.selection.main.head)
    const next = toggleSemicolonLine(line.text)
    if (!next) return false
    dispatch(state.update({
        changes: { from: line.from, to: line.to, insert: next },
        userEvent: 'input',
        scrollIntoView: true,
    }))
    return true
}

export const toggleLog: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const sel = state.selection.main
    const hit = toggleLogAt(state.sliceDoc(), sel.from, sel.to)
    if (!hit) return false
    dispatch(state.update({
        changes: { from: hit.from, to: hit.to, insert: hit.insert },
        userEvent: 'input',
        scrollIntoView: true,
    }))
    return true
}

export const toggleHexDec: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const hit = toggleHexDecAt(state.sliceDoc(), state.selection.main.head)
    if (!hit) return false
    dispatch(state.update({
        changes: { from: hit.from, to: hit.to, insert: hit.insert },
        userEvent: 'input',
        scrollIntoView: true,
    }))
    return true
}

export const mergeIf: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const line = state.doc.lineAt(state.selection.main.head)
    const next = mergeIfLine(line.text)
    if (!next) return false
    dispatch(state.update({
        changes: { from: line.from, to: line.to, insert: next },
        userEvent: 'input',
        scrollIntoView: true,
    }))
    return true
}

export const splitIfAnd: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const line = state.doc.lineAt(state.selection.main.head)
    const next = splitIfAndLine(line.text)
    if (!next) return false
    dispatch(state.update({
        changes: { from: line.from, to: line.to, insert: next },
        userEvent: 'input',
        scrollIntoView: true,
    }))
    return true
}

export const toggleArrowParens: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const line = state.doc.lineAt(state.selection.main.head)
    const next = toggleArrowParensLine(line.text)
    if (!next) return false
    dispatch(state.update({
        changes: { from: line.from, to: line.to, insert: next },
        userEvent: 'input',
        scrollIntoView: true,
    }))
    return true
}

export const splitObject: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const hit = splitObjectAt(state.sliceDoc(), state.selection.main.head)
    if (!hit) return false
    dispatch(state.update({
        changes: { from: hit.from, to: hit.to, insert: hit.insert },
        userEvent: 'input',
        scrollIntoView: true,
    }))
    return true
}

export const joinObject: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const hit = joinObjectAt(state.sliceDoc(), state.selection.main.head)
    if (!hit) return false
    dispatch(state.update({
        changes: { from: hit.from, to: hit.to, insert: hit.insert },
        userEvent: 'input',
        scrollIntoView: true,
    }))
    return true
}

export const toggleAssignOp: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const hit = toggleAssignOpAt(state.sliceDoc(), state.selection.main.head)
    if (!hit) return false
    dispatch(state.update({
        changes: { from: hit.from, to: hit.to, insert: hit.insert },
        selection: EditorSelection.single(hit.head),
        userEvent: 'input',
        scrollIntoView: true,
    }))
    return true
}

export const toggleTypeImport: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const line = state.doc.lineAt(state.selection.main.head)
    const next = toggleTypeImportLine(line.text)
    if (!next) return false
    dispatch(state.update({
        changes: { from: line.from, to: line.to, insert: next },
        userEvent: 'input',
        scrollIntoView: true,
    }))
    return true
}

export const toggleExportDefault: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const line = state.doc.lineAt(state.selection.main.head)
    const next = toggleExportDefaultLine(line.text)
    if (!next) return false
    dispatch(state.update({
        changes: { from: line.from, to: line.to, insert: next },
        userEvent: 'input',
        scrollIntoView: true,
    }))
    return true
}

export const wrapTryCatch: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const sel = state.selection.main
    const line = state.doc.lineAt(sel.empty ? sel.head : sel.from)
    if (line.text.trimStart().startsWith('try')) return false
    const indent = line.text.slice(0, (() => {
        let n = 0
        while (n < line.text.length && (line.text[n] === ' ' || line.text[n] === '\t')) n++
        return n
    })())
    const body = line.text
    const unit = state.indentUnit
    const insert = `${indent}try {\n${indent}${unit}${body.trim()}\n${indent}} catch (e) {\n${indent}}`
    dispatch(state.update({
        changes: { from: line.from, to: line.to, insert },
        userEvent: 'input',
        scrollIntoView: true,
    }))
    return true
}

export const duplicateAndComment: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const token = (state.facet(commentTokensFacet).line || '//')
    const prefix = token + ' '
    const sel = state.selection.main
    const startN = state.doc.lineAt(sel.from).number
    const toPos = !sel.empty && sel.to === state.doc.lineAt(sel.to).from && sel.to > sel.from
        ? sel.to - 1
        : sel.to
    const endN = state.doc.lineAt(sel.empty ? sel.head : toPos).number
    const inserts: ChangeSpec[] = []
    for (let n = startN; n <= endN; n++) {
        const line = state.doc.line(n)
        if (line.text.trim() === '') continue
        let indent = 0
        while (indent < line.text.length && (line.text[indent] === ' ' || line.text[indent] === '\t'))
            indent++
        const commented = line.text.slice(0, indent) + prefix + line.text.slice(indent)
        inserts.push({ from: line.from, insert: commented + state.lineBreak })
    }
    if (!inserts.length) return false
    dispatch(state.update({ changes: inserts, userEvent: 'input', scrollIntoView: true }))
    return true
}

/** 文档不以换行结尾则补一个。 */
export const insertFinalNewline: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const doc = state.doc
    if (!doc.length) return false
    const last = doc.line(doc.lines)
    if (last.length === 0) return false
    if (doc.lines > 1 && last.from === doc.length) return false
    dispatch(state.update({
        changes: { from: doc.length, insert: state.lineBreak },
        userEvent: 'input',
        scrollIntoView: true,
    }))
    return true
}

/** 非空选区在后面再贴一份并选中副本；空选区走 copyLineDown(多选区各自处理)。 */
export const duplicateSelection: StateCommand = ({ state, dispatch }) => copyLine(state, dispatch, true, true)

/** 包住 [from,to) 的最小 ()[]{}。 */
export function enclosingPair(text: string, from: number, to: number): { from: number, to: number } | null {
    let best: { from: number, to: number } | null = null
    for (let i = 0; i < text.length; i++) {
        const open = text[i]
        if (!OPEN_CLOSE[open]) continue
        const close = matchForward(text, open, i)
        if (close < 0) continue
        const pf = i
        const pt = close + 1
        if (pf <= from && to <= pt && (pf < from || to < pt)) {
            if (!best || pt - pf < best.to - best.from)
                best = { from: pf, to: pt }
        }
    }
    return best
}

/** 删选区里的空行；空选区删光标所在连续空行块。 */
export const deleteBlankLines: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const sel = state.selection.main
    const doc = state.doc
    let startN: number
    let endN: number
    if (sel.empty) {
        const cur = doc.lineAt(sel.head).number
        if (doc.line(cur).text.trim() !== '') return false
        startN = cur
        endN = cur
        while (startN > 1 && doc.line(startN - 1).text.trim() === '') startN--
        while (endN < doc.lines && doc.line(endN + 1).text.trim() === '') endN++
    }
    else {
        startN = doc.lineAt(sel.from).number
        const toPos = sel.to === doc.lineAt(sel.to).from && sel.to > sel.from ? sel.to - 1 : sel.to
        endN = doc.lineAt(toPos).number
    }
    const changes: ChangeSpec[] = []
    for (let n = endN; n >= startN; n--) {
        const line = doc.line(n)
        if (line.text.trim() !== '') continue
        const from = line.from
        const to = n < doc.lines ? doc.line(n + 1).from : line.to
        if (to > from) changes.push({ from, to })
    }
    if (!changes.length) return false
    dispatch(state.update({ changes, userEvent: 'delete', scrollIntoView: true }))
    return true
}

// Monaco DeleteDuplicateLinesAction:单个空光标作用整篇(光标保持偏移,超出贴尾);否则每个选区从首行到末行
// (末端在行首也算那行)留首次出现的行。结果选区盖住剩下的行,末端停在末行长度那一列(Monaco 的 1 基列当 0 基用,差一个字符)。
export const deleteDuplicateLines: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const doc = state.doc
    if (doc.length === 0) return false
    const sel = state.selection
    const whole = sel.ranges.length === 1 && sel.main.empty
    const changes: ChangeSpec[] = []
    const kept: { startN: number, lines: string[] }[] = []
    let removed = 0
    for (const r of whole ? [EditorSelection.range(0, doc.length)] : sel.ranges) {
        const startN = doc.lineAt(r.from).number, endN = doc.lineAt(r.to).number
        const seen = new Set<string>()
        const lines: string[] = []
        for (let n = startN; n <= endN; n++) {
            const t = doc.line(n).text
            if (seen.has(t)) continue
            seen.add(t)
            lines.push(t)
        }
        const from = doc.line(startN).from, to = doc.line(endN).to
        const insert = lines.join(state.lineBreak)
        if (insert !== doc.sliceString(from, to)) changes.push({ from, to, insert })
        kept.push({ startN: startN - removed, lines })
        removed += endN - startN + 1 - lines.length
    }
    if (!changes.length) return false
    const set = state.changes(changes)
    const after = set.apply(doc)
    const selection = whole
        ? EditorSelection.cursor(Math.min(sel.main.head, after.length))
        : EditorSelection.create(kept.map(({ startN, lines }) => {
            const last = after.line(startN + lines.length - 1)
            return EditorSelection.range(after.line(startN).from, last.from + Math.max(0, lines[lines.length - 1].length - 1))
        }), sel.mainIndex)
    dispatch(state.update({ changes: set, selection, userEvent: 'delete.duplicates', scrollIntoView: true }))
    return true
}

// Remove Brackets(⌥⌘⌫):实现在 brackets.ts,和括号匹配高亮共用一套(跳过字符串/注释里的括号,多选区)。
export { removeBrackets } from './brackets'

function isDigit(ch: string): boolean {
    const o = ch.charCodeAt(0)
    return o >= 48 && o <= 57
}

function isIdentChar(ch: string): boolean {
    const o = ch.charCodeAt(0)
    return (o >= 48 && o <= 57) || (o >= 65 && o <= 90) || (o >= 97 && o <= 122) || o === 95 || o === 36
}

export function findNumberAt(text: string, pos: number): { from: number, to: number, raw: string } | null {
    if (!text.length) return null
    let i = pos
    if (i >= text.length) i = text.length - 1
    if (i < 0) return null
    const onNum = isDigit(text[i]) || text[i] === '.'
        || (text[i] === '-' && i + 1 < text.length && isDigit(text[i + 1]))
    if (!onNum) {
        if (i > 0 && (isDigit(text[i - 1]) || text[i - 1] === '.' || text[i - 1] === '-')) i--
        else return null
    }
    let from = i
    while (from > 0 && isDigit(text[from - 1])) from--
    if (from > 0 && text[from - 1] === '.') {
        let j = from - 1
        if (j > 0 && isDigit(text[j - 1])) {
            from = j
            while (from > 0 && isDigit(text[from - 1])) from--
        }
    }
    if (from > 0 && text[from - 1] === '-') {
        const prev = from >= 2 ? text[from - 2] : ''
        if (!prev || (!isIdentChar(prev) && !isDigit(prev))) from--
    }
    let to = from
    if (text[to] === '-') to++
    const startDigits = to
    while (to < text.length && isDigit(text[to])) to++
    if (to < text.length && text[to] === '.') {
        let t = to + 1
        if (t < text.length && isDigit(text[t])) {
            to = t + 1
            while (to < text.length && isDigit(text[to])) to++
        }
    }
    if (to <= startDigits) return null
    return { from, to, raw: text.slice(from, to) }
}

function bumpNumber(raw: string, delta: number): string | null {
    const n = Number(raw)
    if (!Number.isFinite(n)) return null
    const next = n + delta
    if (!Number.isFinite(next)) return null
    const neg = raw[0] === '-'
    const body = neg ? raw.slice(1) : raw
    const dot = body.indexOf('.')
    if (dot < 0) {
        const s = String(Math.trunc(next))
        if (next >= 0 && body.length > 1 && body[0] === '0')
            return s.padStart(body.length, '0')
        return s
    }
    return next.toFixed(body.length - dot - 1)
}

function bumpNumberAtCaret(delta: number): StateCommand {
    return ({ state, dispatch }) => {
        if (state.readOnly) return false
        const text = state.sliceDoc()
        const changes: ChangeSpec[] = []
        const ranges: SelectionRange[] = []
        for (const range of state.selection.ranges) {
            const hit = findNumberAt(text, range.empty ? range.head : range.from)
            if (!hit) {
                ranges.push(range)
                continue
            }
            const next = bumpNumber(hit.raw, delta)
            if (next == null || next === hit.raw) {
                ranges.push(range)
                continue
            }
            changes.push({ from: hit.from, to: hit.to, insert: next })
            ranges.push(EditorSelection.range(hit.from, hit.from + next.length))
        }
        if (!changes.length) return false
        dispatch(state.update({
            changes,
            selection: EditorSelection.create(ranges, state.selection.mainIndex),
            userEvent: 'input',
            scrollIntoView: true,
        }))
        return true
    }
}

export const incrementNumber = bumpNumberAtCaret(1)
export const decrementNumber = bumpNumberAtCaret(-1)

function occurrenceSpan(state: EditorState): { from: number, to: number, query: string } | null {
    const r = state.selection.main
    if (!r.empty) {
        const query = state.sliceDoc(r.from, r.to)
        return query ? { from: r.from, to: r.to, query } : null
    }
    const w = wordAt(state, r.head)
    if (!w) return null
    return { from: w.from, to: w.to, query: state.sliceDoc(w.from, w.to) }
}

export const moveToNextOccurrence: StateCommand = ({ state, dispatch }) => {
    const q = occurrenceSpan(state)
    if (!q) return false
    const text = state.sliceDoc()
    let idx = text.indexOf(q.query, q.to)
    if (idx < 0) idx = text.indexOf(q.query, 0)
    if (idx < 0 || idx === q.from) return false
    dispatch(state.update({
        selection: EditorSelection.range(idx, idx + q.query.length),
        scrollIntoView: true,
        userEvent: 'select',
    }))
    return true
}

export const moveToPrevOccurrence: StateCommand = ({ state, dispatch }) => {
    const q = occurrenceSpan(state)
    if (!q) return false
    const text = state.sliceDoc()
    let idx = q.from > 0 ? text.lastIndexOf(q.query, q.from - 1) : -1
    if (idx < 0) idx = text.lastIndexOf(q.query)
    if (idx < 0 || idx === q.from) return false
    dispatch(state.update({
        selection: EditorSelection.range(idx, idx + q.query.length),
        scrollIntoView: true,
        userEvent: 'select',
    }))
    return true
}

/** 选区覆盖的每行末一个光标,末行落在选区终点(Monaco InsertCursorAtEndOfEachLineSelected)。空选区返 false。 */
export const insertCursorAtEndOfEachLineSelected: StateCommand = ({ state, dispatch }) => {
    const doc = state.doc
    const cursors: SelectionRange[] = []
    const seen = new Set<number>()
    let added = false
    for (const r of state.selection.ranges) {
        if (r.empty) {
            cursors.push(r)
            continue
        }
        const startN = doc.lineAt(r.from).number
        let endN = doc.lineAt(r.to).number
        if (r.to === doc.lineAt(r.to).from && r.to > r.from) endN--
        for (let n = startN; n <= endN; n++) {
            if (seen.has(n)) continue
            seen.add(n)
            // 末行(选区终点不在行首时):Monaco 放在选区终点,不是行末
            const atEnd = n === endN && doc.lineAt(r.to).number === n
            cursors.push(EditorSelection.cursor(atEnd ? r.to : doc.line(n).to))
            added = true
        }
    }
    if (!added) return false
    const next = capSelection(state, EditorSelection.create(cursors))
    const cur = state.selection
    if (next.ranges.length === cur.ranges.length
        && next.ranges.every((r, i) => r.from === cur.ranges[i].from && r.to === cur.ranges[i].to))
        return false
    dispatch(state.update({
        selection: next,
        userEvent: 'select',
        scrollIntoView: true,
    }))
    return true
}

/** 先选括号内，再选含括号；再往外没有则 false。 */
export const selectParentSyntax: StateCommand = ({ state, dispatch }) => {
    const sel = state.selection.main
    const pair = enclosingPair(state.sliceDoc(), sel.from, sel.to)
    if (!pair) return false
    const inner = { from: pair.from + 1, to: pair.to - 1 }
    let next = pair
    if (sel.from !== pair.from || sel.to !== pair.to) {
        if (inner.from < inner.to && (sel.from !== inner.from || sel.to !== inner.to))
            next = inner
        else
            next = pair
    }
    if (next.from === sel.from && next.to === sel.to) return false
    dispatch(state.update({
        selection: EditorSelection.range(next.from, next.to),
        userEvent: 'select',
        scrollIntoView: true,
    }))
    return true
}

// 交换光标两侧的字符(emacs Ctrl-t)。仅对空选区且不在文档首尾的光标生效。
export const transposeChars: StateCommand = ({ state, dispatch }) => {
    const changes = state.changeByRange((range) => {
        if (!range.empty || range.from === 0 || range.from === state.doc.length)
            return { range }
        const pos = range.from
        const line = state.doc.lineAt(pos)
        const from = pos === line.from ? pos - 1 : findClusterBreak(line.text, pos - line.from, false) + line.from
        const to = pos === line.to ? pos + 1 : findClusterBreak(line.text, pos - line.from, true) + line.from
        return {
            changes: { from, to, insert: state.sliceDoc(pos, to) + state.sliceDoc(from, pos) },
            range: EditorSelection.cursor(to),
        }
    })
    if (changes.changes.empty)
        return false
    dispatch(state.update(changes, { scrollIntoView: true, userEvent: 'move.character' }))
    return true
}

// 选区替换成换行(不缩进——缩进版要 indentService,阶段4)。
export const insertNewline: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    dispatch(state.update(state.replaceSelection(state.lineBreak), { scrollIntoView: true, userEvent: 'input' }))
    return true
}

// 删除每行末尾的空白(空格/制表符)。禁正则:逐行词法扫尾部空白。
// Monaco trimInRegexesAndStrings 默认关:尾部空白起点落在字符串 / 模板串里的行不动。
// keepCursors(Monaco 的 reason: 'auto-save'):光标所在行只删光标之后的空白,光标在行尾的行不动;一行多个光标只认最右那个。
export function trimTrailingWhitespaceWith(opts: { keepCursors?: boolean, trimInStrings?: boolean } = {}): StateCommand {
    return ({ state, dispatch }) => {
        if (state.readOnly)
            return false
        const cursorAt = new Map<number, number>()
        if (opts.keepCursors) {
            for (const r of state.selection.ranges) {
                const l = state.doc.lineAt(r.head)
                cursorAt.set(l.number, Math.max(cursorAt.get(l.number) ?? 0, r.head - l.from))
            }
        }
        const spans: { from: number, to: number }[] = []
        for (let n = 1; n <= state.doc.lines; n++) {
            const line = state.doc.line(n)
            const text = line.text
            let end = text.length
            while (end > 0 && (text.charCodeAt(end - 1) === 32 || text.charCodeAt(end - 1) === 9))
                end--
            if (end === text.length)
                continue
            const cur = cursorAt.get(n)
            const from = cur === undefined ? end : Math.max(end, cur)
            if (from < text.length)
                spans.push({ from: line.from + from, to: line.to })
        }
        const inString = opts.trimInStrings ? [] : inStringAt(state, spans.map(s => s.from))
        const changes = spans.filter((_, i) => !inString[i])
        if (!changes.length)
            return false
        dispatch(state.update({ changes, userEvent: 'delete' }))
        return true
    }
}
export const deleteTrailingWhitespace: StateCommand = trimTrailingWhitespaceWith()

// 行注释 ⌘/ 与块注释 ⇧⌥A:对齐 Monaco LineCommentCommand / BlockCommentCommand,见 comment.ts
export { toggleBlockComment, toggleComment, toggleLineComment } from './comment'

// —— 光标移动 ——
// Forward/Backward = 逻辑序。Left/Right = 逻辑列 ±1(同 Monaco)。无视觉换行,行尾跨文档行。

// 收敛模式:整组命令共享「空选区→f(range) 算新光标;非空选区→塌到 from/to」。
function moveCursor(state: EditorState, dispatch: (tr: Transaction) => void,
    by: (range: SelectionRange) => SelectionRange): boolean {
    const selection = updateSel(state, by)
    if (selection.eq(state.selection, true))
        return false
    dispatch(setSel(state, selection))
    return true
}

function rangeEnd(range: SelectionRange, forward: boolean) {
    return EditorSelection.cursor(forward ? range.to : range.from)
}

// 逻辑序前/后一字符(cluster-aware,跨行走换行)。
function byChar(state: EditorState, range: SelectionRange, forward: boolean): SelectionRange {
    if (!range.empty)
        return rangeEnd(range, forward)
    let pos = range.head
    const line = state.doc.lineAt(pos)
    if (pos === (forward ? line.to : line.from))
        pos = forward ? Math.min(state.doc.length, line.to + 1) : Math.max(0, line.from - 1)
    else
        pos = line.from + findClusterBreak(line.text, pos - line.from, forward)
    return EditorSelection.cursor(pos, forward ? -1 : 1)
}

export const cursorCharForward: StateCommand = ({ state, dispatch }) => moveCursor(state, dispatch, r => byChar(state, r, true))
export const cursorCharBackward: StateCommand = ({ state, dispatch }) => moveCursor(state, dispatch, r => byChar(state, r, false))

/**
 * editor.stickyTabStops:光标在行首空白里,左/右一次跳一个缩进单位(Monaco leftPositionAtomicSoftTabs / rightPositionAtomicSoftTabs)。
 * 条件两边不对称照抄 Monaco:左是 列 <= 缩进列,右是 列 < 缩进列(缩进列 = 首个非空白字符的列,全空白行 = 行尾之后)。
 * 返回 null = 不适用,调用方走普通的逐字移动。
 */
function atomicTabMove(state: EditorState, line: { from: number, text: string }, head: number, forward: boolean): SelectionRange | null {
    if (!boolOption(state, 'stickyTabStops', false)) return null
    const col = head - line.from
    const indent = line.text.search(/[^ \t]/)
    const indentCol = indent === -1 ? line.text.length : indent
    if (forward ? col >= indentCol : col > indentCol) return null
    const to = atomicTabPosition(line.text, col, state.tabSize, forward ? AtomicDirection.Right : AtomicDirection.Left)
    return to === -1 ? null : EditorSelection.cursor(line.from + to, forward ? -1 : 1)
}

function byCharVisual(state: EditorState, range: SelectionRange, forward: boolean): SelectionRange {
    if (!range.empty)
        return rangeEnd(range, forward)
    const line = state.doc.lineAt(range.head)
    const atomic = atomicTabMove(state, line, range.head, forward)
    if (atomic) return atomic
    // Monaco 的 ←/→ 恒为逻辑列 ±1(含 RTL 的行也一样,光标在屏上跳不跳由浏览器的 bidi 排版决定)。
    // 以前这里按 LTR 壳做视觉移动;行里的 RTL token 现在和 Monaco 一样整段 dir=rtl 隔离,显示顺序变了,视觉移动对不上。
    if (range.head !== (forward ? line.to : line.from))
        return EditorSelection.cursor(line.from + findClusterBreak(line.text, range.head - line.from, forward), forward ? -1 : 1)
    // 跨行时跳过折起的行:首行行尾 → 块后一行行首,块后一行行首 ← 首行行尾
    const hidden = hiddenRanges(state)
    if (forward) {
        if (line.to >= state.doc.length) return range
        const h = hidden.find(h => h.from === line.to)
        if (h && h.to >= state.doc.length) return range
        return EditorSelection.cursor((h ? h.to : line.to) + 1, -1)
    }
    if (line.from === 0) return range
    const h = hidden.find(h => h.to === line.from - 1)
    return EditorSelection.cursor(h ? h.from : line.from - 1, 1)
}

// 行边界:行首/行尾(文档行,非视觉行)。
function byLineBoundary(state: EditorState, range: SelectionRange, forward: boolean): SelectionRange {
    const line = state.doc.lineAt(range.head)
    return EditorSelection.cursor(forward ? line.to : line.from, forward ? -1 : 1)
}

export const cursorLineStart: StateCommand = ({ state, dispatch }) => moveCursor(state, dispatch, r => byLineBoundary(state, r, false))
export const cursorLineEnd: StateCommand = ({ state, dispatch }) => moveCursor(state, dispatch, r => byLineBoundary(state, r, true))

// 智能行首(Home,对齐 Monaco/VSCode):不在首非空白处→跳首非空白处;已在→跳真行首(列0)。
function byLineStartSmart(state: EditorState, range: SelectionRange): SelectionRange {
    const line = state.doc.lineAt(range.head)
    let indent = 0
    while (indent < line.text.length && (line.text.charCodeAt(indent) === 32 || line.text.charCodeAt(indent) === 9))
        indent++
    // 全空白行没有首非空白列,Monaco 一律回列 1(不在行首/行尾之间来回切)
    const indentPos = indent === line.text.length ? line.from : line.from + indent
    const target = range.head === indentPos ? line.from : indentPos
    return EditorSelection.cursor(target, 1)
}

// 折行几何:EditorView 开 lineWrapping 时有(view.moveToLineBoundary 返回视觉行首/尾)。
interface BoundaryTarget {
    state: EditorState
    dispatch: (tr: Transaction) => void
    lineWrapping?: boolean
    moveToLineBoundary?: (pos: number, forward: boolean, assoc?: number) => { pos: number, assoc: -1 | 0 | 1 }
}

// Home / ⌘←(Monaco CursorMoveCommands._moveToLineStart):折行时不在首视觉行、也不在本视觉行行首 → 本视觉行行首;
// 否则逻辑行智能行首。
function byVisualLineStart(t: BoundaryTarget, range: SelectionRange): SelectionRange {
    if (t.lineWrapping && t.moveToLineBoundary) {
        const line = t.state.doc.lineAt(range.head)
        const b = t.moveToLineBoundary(range.head, false, range.assoc)
        if (b.pos > line.from && b.pos !== range.head) return EditorSelection.cursor(b.pos, 1)
    }
    return byLineStartSmart(t.state, range)
}

// End / ⌘→(Monaco _moveToLineEnd):折行时没到本视觉行末尾 → 视觉行末尾(软折行点画在上一行,assoc=-1);
// 已在视觉行末尾(或本就在末视觉行)→ 逻辑行尾。
function byVisualLineEnd(t: BoundaryTarget, range: SelectionRange): SelectionRange {
    if (t.lineWrapping && t.moveToLineBoundary) {
        const line = t.state.doc.lineAt(range.head)
        const b = t.moveToLineBoundary(range.head, true, range.assoc)
        if (b.pos < line.to && b.pos !== range.head) return EditorSelection.cursor(b.pos, -1)
    }
    return byLineBoundary(t.state, range, true)
}

export const cursorLineBoundaryBackward: StateCommand = (t: BoundaryTarget) => moveCursor(t.state, t.dispatch, r => byVisualLineStart(t, r))
export const selectLineBoundaryBackward: StateCommand = (t: BoundaryTarget) => extendCursor(t.state, t.dispatch, r => byVisualLineStart(t, r))
export const cursorLineBoundaryForward: StateCommand = (t: BoundaryTarget) => moveCursor(t.state, t.dispatch, r => byVisualLineEnd(t, r))
export const selectLineBoundaryForward: StateCommand = (t: BoundaryTarget) => extendCursor(t.state, t.dispatch, r => byVisualLineEnd(t, r))

// ↑↓ / PageUp/PageDown / ⌘⌥↑↓:可见列 + 字素边界 + 末行到行尾,对齐 Monaco MoveOperations,见 vertical.ts。
export { addCursorAbove, addCursorBelow, cursorLineDown, cursorLineUp, cursorPageDown, cursorPageUp, selectLineDown, selectLineUp, selectPageDown, selectPageUp, scrollLineDown, scrollLineUp, scrollPageDown, scrollPageUp, cursorColumnSelectLeft, cursorColumnSelectRight, cursorColumnSelectUp, cursorColumnSelectDown, cursorColumnSelectPageUp, cursorColumnSelectPageDown } from './vertical'

// 扩选版(shift+移动):锚不动,只动 head。
function extendCursor(state: EditorState, dispatch: (tr: Transaction) => void,
    by: (range: SelectionRange) => SelectionRange): boolean {
    const selection = updateSel(state, range => {
        const moved = by(EditorSelection.cursor(range.head, range.assoc, range.bidiLevel, range.goalColumn))
        return EditorSelection.range(range.anchor, moved.head, moved.assoc, moved.goalColumn)
    })
    if (selection.eq(state.selection, true))
        return false
    dispatch(setSel(state, selection))
    return true
}

export const selectCharForward: StateCommand = ({ state, dispatch }) => extendCursor(state, dispatch, r => byChar(state, r, true))
export const selectCharBackward: StateCommand = ({ state, dispatch }) => extendCursor(state, dispatch, r => byChar(state, r, false))
export const selectLineStart: StateCommand = ({ state, dispatch }) => extendCursor(state, dispatch, r => byLineBoundary(state, r, false))
export const selectLineEnd: StateCommand = ({ state, dispatch }) => extendCursor(state, dispatch, r => byLineBoundary(state, r, true))

// —— 删除 ——
//
// CM6 deleteByChar 走 view(atomicRanges/announce),且 byIndentUnit 退格删整缩进单元(要 indentUnit
// facet)。CM7 港**纯 charwise 删除**:空选区删 cluster,非空选区删选区。缩进单元删除归阶段4(indent facet)。

// forceEvent:命令级删除(删词、删到行首尾)固定 userEvent,不当成可连并的逐字退格/删除(Monaco 删词前后各切一次撤销组)。
function deleteBy(state: EditorState, dispatch: (tr: Transaction) => void,
    by: (range: SelectionRange) => number, defaultEvent: string, forceEvent?: string,
    pairSpan?: (range: SelectionRange) => [number, number] | null): boolean {
    if (state.readOnly)
        return false
    let event = 'delete.selection'
    const { ranges, mainIndex } = state.selection
    const spans = ranges.map((range) => {
        let { from, to } = range
        const pair = from === to ? pairSpan?.(range) : null
        if (pair) { event = 'delete.backward'; return { from: pair[0], to: pair[1] } }
        if (from === to) {
            const towards = by(range)
            if (towards < from) { event = 'delete.backward'; from = towards }
            else if (towards > from) { event = 'delete.forward'; to = towards }
        }
        return { from, to }
    })
    // 各光标的删除区间重叠时照 Monaco _getLoserCursorMap:排在后面的光标(主光标排第一)整个作废,连光标一起去掉
    const rank = (i: number) => i === mainIndex ? -1 : i
    const lost = new Set<number>()
    for (let i = 0; i < spans.length; i++) {
        for (let j = i + 1; j < spans.length; j++) {
            if (lost.has(i) || lost.has(j)) continue
            const a = spans[i], b = spans[j]
            if (a.from === a.to || b.from === b.to) continue
            if (a.from < b.to && b.from < a.to) lost.add(rank(i) > rank(j) ? i : j)
        }
    }
    const changes: ChangeSpec[] = []
    const kept: number[] = []
    spans.forEach((sp, i) => {
        if (lost.has(i)) return
        kept.push(i)
        if (sp.from < sp.to) changes.push(sp)
    })
    if (!changes.length)
        return false
    const set = state.changes(changes)
    const out = kept.map((i) => {
        const sp = spans[i], range = ranges[i]
        return sp.from === sp.to ? range.map(set) : EditorSelection.cursor(set.mapPos(sp.from, -1), sp.from < range.head ? -1 : 1)
    })
    dispatch(state.update({
        changes: set,
        selection: EditorSelection.create(out, Math.max(0, kept.indexOf(mainIndex)), keepOverlappingCursors(state)),
        scrollIntoView: true,
        userEvent: forceEvent ?? (event === 'delete.selection' ? defaultEvent : event),
    }))
    return true
}

// 光标在前导空白里 → 退格删到上一个缩进停靠点(Monaco deleteLeft 的 useTabStops 分支):
// 视觉列按 tabSize 算(Tab 跳到下一个 tabSize 倍数),目标 = prevIndentTabStop(视觉列, indentSize),
// 再按 columnFromVisibleColumn 换回字符位置(落在 Tab 中间取更近的一侧,一样近取左边)。行首 / 光标在正文中 → null。
function indentBackspaceTarget(state: EditorState, pos: number): number | null {
    const line = state.doc.lineAt(pos)
    const col = pos - line.from
    const lead = leadingWhitespace(line.text)
    if (col === 0 || col > lead || !boolOption(state, 'useTabStops', true)) return null
    const { tabSize, indentSize } = indentConfig(state)
    const next = (v: number, i: number) => line.text.charCodeAt(i) === 9 ? v + tabSize - (v % tabSize) : v + 1
    let vis = 0
    for (let i = 0; i < col; i++) vis = next(vis, i)
    const want = Math.max(0, vis - 1 - ((vis - 1) % indentSize))
    if (want <= 0) return line.from
    let before = 0
    for (let i = 0; i < col; i++) {
        const after = next(before, i)
        if (after >= want) return line.from + (after - want < want - before ? i + 1 : i)
        before = after
    }
    return null
}

// 前/后一字符的目标位置(cluster-aware,跨行)。退格在纯空格前导缩进里改删到 tab stop(仅 backward)。
function deleteCharTarget(state: EditorState, range: SelectionRange, forward: boolean): number {
    const pos = range.from
    if (!forward) {
        const it = indentBackspaceTarget(state, pos)
        if (it != null) return it
    }
    const line = state.doc.lineAt(pos)
    // trimWhitespaceOnDelete(Monaco deleteRight):行尾 Delete 并行时顺带删下一行的前导空白,
    // 仅当本行与下一行都有内容(非纯空白)才删
    if (forward && pos === line.to && line.number < state.doc.lines && boolOption(state, 'trimWhitespaceOnDelete', false)) {
        const next = state.doc.line(line.number + 1)
        const lead = leadingWhitespace(next.text)
        if (leadingWhitespace(line.text) < line.text.length && lead < next.text.length) return next.from + lead
    }
    // 向前删整个字素簇;退格按 Monaco getLeftDeleteOffset(emoji 删一个组件,其余删一个码点)
    let target = forward
        ? findClusterBreak(line.text, pos - line.from, true, true) + line.from
        : leftDeleteOffset(line.text, pos - line.from) + line.from
    if (target === pos && line.number !== (forward ? state.doc.lines : 1))
        target += forward ? 1 : -1
    return target
}

// 退格删配对:多光标、只删自动补的闭符(对齐 Monaco autoClosingDelete 'auto'),实现在 closebrackets.ts
export { deleteBracketPair } from './closebrackets'

export const deleteCharBackward: StateCommand = ({ state, dispatch }) =>
    deleteBy(state, dispatch, r => deleteCharTarget(state, r, false), 'delete', undefined, r => autoClosingPairSpan(state, r))
export const deleteCharForward: StateCommand = ({ state, dispatch }) =>
    deleteBy(state, dispatch, r => deleteCharTarget(state, r, true), 'delete')

// —— 词级移动（group motion）——
//
// CM6 的 cursorByGroup 走 view.moveByChar(视觉几何 + bidi)。CM7 无 bidi 消费者,
// 逻辑序等价。算法同 CM6 byGroup:从光标处逐 cluster 步进,同类别连续走,跨过空格到下一组,
// 类别变则停。跨行走换行符。

// 从 pos 逐 cluster 步进到下一个词组边界。forward=true 向前,false 向后。
// 同类别连续走,类别变即停(空格也独立成组)。跨行走换行符。
function groupBoundary(state: EditorState, pos: number, forward: boolean): number {
    const categorize = state.charCategorizer(pos)
    let cur = pos

    let line = state.doc.lineAt(cur)
    // forward 在行末 / backward 在行首 → 跨行
    if (cur === (forward ? line.to : line.from)) {
        if (line.number === (forward ? state.doc.lines : 1))
            return cur
        cur += forward ? 1 : -1
        line = state.doc.lineAt(cur)
    }

    let cat: CharCategory | null = null
    for (;;) {
        if (cur === (forward ? line.to : line.from)) {
            if (line.number === (forward ? state.doc.lines : 1))
                return cur
            cur += forward ? 1 : -1
            line = state.doc.lineAt(cur)
            continue
        }
        const next = findClusterBreak(line.text, cur - line.from, forward) + line.from
        const from = Math.min(cur, next) - line.from
        const len = Math.abs(next - cur)
        const ch = line.text.slice(from, from + len)
        const nextCat = categorize(ch)
        if (cat != null && nextCat !== cat)
            return cur
        cat = nextCat
        cur = next
    }
}

function byGroup(state: EditorState, range: SelectionRange, forward: boolean): SelectionRange {
    if (!range.empty)
        return rangeEnd(range, forward)
    return EditorSelection.cursor(groupBoundary(state, range.head, forward), forward ? -1 : 1)
}

export const cursorGroupForward: StateCommand = ({ state, dispatch }) =>
    moveCursor(state, dispatch, r => byGroup(state, r, true))
export const cursorGroupBackward: StateCommand = ({ state, dispatch }) =>
    moveCursor(state, dispatch, r => byGroup(state, r, false))

export const selectGroupForward: StateCommand = ({ state, dispatch }) =>
    extendCursor(state, dispatch, r => byGroup(state, r, true))
export const selectGroupBackward: StateCommand = ({ state, dispatch }) =>
    extendCursor(state, dispatch, r => byGroup(state, r, false))

// L16: Windows 风格 group 前进 —— 落到**下一组起点**（非当前组终点）
// 例: "|foo  bar" → "foo  |bar"（CM6 cursorGroupForwardWin）
function groupStartForward(state: EditorState, pos: number): number {
    let cur = groupBoundary(state, pos, true)
    // 若落在 Space 组内/后，继续跳到下一非 Space 起点
    const cat = state.charCategorizer(cur)
    const line = state.doc.lineAt(cur)
    if (cur < line.to) {
        const ch = line.text[cur - line.from]
        if (ch && cat(ch) === CharCategory.Space)
            cur = groupBoundary(state, cur, true)
    }
    // 再若仍在词中间（从词中部起跳），boundary 已是词尾；Win 要到下一词首：
    // 从词尾再跨过空格到下一词首
    if (cur < state.doc.length) {
        const line2 = state.doc.lineAt(cur)
        if (cur === line2.to && line2.number < state.doc.lines)
            cur = groupBoundary(state, cur, true)
        else if (cur < line2.to) {
            const ch = line2.text[cur - line2.from]
            if (ch && state.charCategorizer(cur)(ch) === CharCategory.Space)
                cur = groupBoundary(state, cur, true)
        }
    }
    return cur
}

function byGroupWin(state: EditorState, range: SelectionRange, forward: boolean): SelectionRange {
    if (!range.empty) return rangeEnd(range, forward)
    if (!forward) return byGroup(state, range, false)
    return EditorSelection.cursor(groupStartForward(state, range.head), -1)
}

export const cursorGroupForwardWin: StateCommand = ({ state, dispatch }) =>
    moveCursor(state, dispatch, r => byGroupWin(state, r, true))
export const selectGroupForwardWin: StateCommand = ({ state, dispatch }) =>
    extendCursor(state, dispatch, r => byGroupWin(state, r, true))
export const deleteGroupForwardWin: StateCommand = ({ state, dispatch }) =>
    deleteBy(state, dispatch, r => groupStartForward(state, r.head), 'delete')

/** Go to Line：1-based 行号，clamp 到 [1, lines] */
export function gotoLineNumber(state: EditorState, lineNumber: number): Transaction {
    const n = Math.max(1, Math.min(state.doc.lines, Math.floor(lineNumber) || 1))
    const line = state.doc.line(n)
    return state.update({
        selection: EditorSelection.cursor(line.from),
        scrollIntoView: true,
        userEvent: 'select',
    })
}

// —— Monaco 词移动 / 删词(cursorWordLeft、cursorWordEndRight、deleteWordLeft/Right、wordPart*)——
//
// 算法逐行移植 Monaco cursorWordOperations(见 words.ts):空格/Tab 为空白、默认 wordSeparators 为
// 分隔符、其余(含 CJK、emoji)为普通字符;同类连续段算一个词,标点自成一词;不跨行(行首/行尾先跨换行
// 再在相邻行内找)。实测 Monaco:`foo.bar(baz)` ⌥→ 停 foo|、bar|、baz|、)|;`a  === b` 停 a|、===|、b|。
// 有选区时 Monaco 从 head 出发移动(不先塌到选区边),扩选模式保持锚点。

function wordTarget(state: EditorState, pos: number, nav: WordNav, forward: boolean, multi: boolean): number {
    return forward ? moveWordRight(state, pos, nav) : moveWordLeft(state, pos, nav, multi)
}

function byWord(state: EditorState, range: SelectionRange, forward: boolean, multi: boolean, nav: WordNav = forward ? WordNav.WordEnd : WordNav.WordStartFast): SelectionRange {
    const target = wordTarget(state, range.head, nav, forward, multi)
    return target === range.head && range.empty ? range : EditorSelection.cursor(target, forward ? -1 : 1)
}

function byWordPart(state: EditorState, range: SelectionRange, forward: boolean, multi: boolean): SelectionRange {
    const target = forward ? moveWordPartRight(state, range.head) : moveWordPartLeft(state, range.head, multi)
    return target === range.head && range.empty ? range : EditorSelection.cursor(target, forward ? -1 : 1)
}

const isMulti = (state: EditorState) => state.selection.ranges.length > 1

// Monaco 词移动命令族(contrib/wordOperations):<Start|End|空><Left|Right>[Select]、WordAccessibility<Left|Right>[Select]。
// 默认(空)版:Left = WordStartFast、Right = WordEnd;Start/End 版固定停词首/词尾。
const wordMoveCommand = (forward: boolean, nav: WordNav, select: boolean): StateCommand => ({ state, dispatch }) =>
    (select ? extendCursor : moveCursor)(state, dispatch, r => byWord(state, r, forward, isMulti(state), nav))

export const cursorWordEndRight: StateCommand = wordMoveCommand(true, WordNav.WordEnd, false)
export const cursorWordLeft: StateCommand = wordMoveCommand(false, WordNav.WordStartFast, false)
export const selectWordEndRight: StateCommand = wordMoveCommand(true, WordNav.WordEnd, true)
export const selectWordLeft: StateCommand = wordMoveCommand(false, WordNav.WordStartFast, true)
export const cursorWordStartLeft: StateCommand = wordMoveCommand(false, WordNav.WordStart, false)
export const selectWordStartLeft: StateCommand = wordMoveCommand(false, WordNav.WordStart, true)
export const cursorWordEndLeft: StateCommand = wordMoveCommand(false, WordNav.WordEnd, false)
export const selectWordEndLeft: StateCommand = wordMoveCommand(false, WordNav.WordEnd, true)
export const cursorWordStartRight: StateCommand = wordMoveCommand(true, WordNav.WordStart, false)
export const selectWordStartRight: StateCommand = wordMoveCommand(true, WordNav.WordStart, true)
export const cursorWordAccessibilityLeft: StateCommand = wordMoveCommand(false, WordNav.WordAccessibility, false)
export const selectWordAccessibilityLeft: StateCommand = wordMoveCommand(false, WordNav.WordAccessibility, true)
export const cursorWordAccessibilityRight: StateCommand = wordMoveCommand(true, WordNav.WordAccessibility, false)
export const selectWordAccessibilityRight: StateCommand = wordMoveCommand(true, WordNav.WordAccessibility, true)

// 删词:⌥⌫ = deleteWordLeft(WordStart + 空白启发:光标前 ≥2 个空白只删空白);
// ⌥⌦ = deleteWordRight(WordEnd + 空白启发;行尾时连同下一行前导空白一起删,对齐 Monaco)。
// Start/End 变体(deleteWord<Start|End><Left|Right>)不带空白启发。向左删时光标夹在自动配对里先删整对(autoClosingDelete)。
const deleteWordCommand = (forward: boolean, nav: WordNav, heuristics: boolean): StateCommand => ({ state, dispatch }) =>
    deleteBy(state, dispatch,
        r => (forward ? deleteWordRightTarget(state, r.head, nav, heuristics) : deleteWordLeftTarget(state, r.head, nav, heuristics)) ?? r.head,
        'delete', 'delete.word', forward ? undefined : r => autoClosingPairSpan(state, r))
export const deleteGroupBackward: StateCommand = deleteWordCommand(false, WordNav.WordStart, true)
export const deleteGroupForward: StateCommand = deleteWordCommand(true, WordNav.WordEnd, true)
export const deleteWordStartLeft: StateCommand = deleteWordCommand(false, WordNav.WordStart, false)
export const deleteWordEndLeft: StateCommand = deleteWordCommand(false, WordNav.WordEnd, false)
export const deleteWordStartRight: StateCommand = deleteWordCommand(true, WordNav.WordStart, false)
export const deleteWordEndRight: StateCommand = deleteWordCommand(true, WordNav.WordEnd, false)
export const deleteWordPartBackward: StateCommand = ({ state, dispatch }) =>
    deleteBy(state, dispatch, r => deleteWordPartLeftTarget(state, r.head) ?? r.head, 'delete', 'delete.word', r => autoClosingPairSpan(state, r))
export const deleteWordPartForward: StateCommand = ({ state, dispatch }) =>
    deleteBy(state, dispatch, r => deleteWordPartRightTarget(state, r.head) ?? r.head, 'delete', 'delete.word')

// Monaco deleteInsideWord:非空选区删选区;空光标:夹在空白里删整段空白,否则删贴着的词(连同一侧空白);
// 空行并入上/下一行。区间算法在 words.ts。
export const deleteInsideWord: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const spans = state.selection.ranges.map(r => r.empty ? deleteInsideWordSpan(state, r.head) : { from: r.from, to: r.to })
    const changes = spans.filter(sp => sp.from < sp.to)
    if (!changes.length) return false
    const set = state.changes(changes)
    dispatch(state.update({
        changes: set,
        selection: EditorSelection.create(spans.map(sp => EditorSelection.cursor(set.mapPos(sp.from, -1))), state.selection.mainIndex),
        scrollIntoView: true,
        userEvent: 'delete.word',
    }))
    return true
}

// —— 多光标:添加下一匹配 (Ctrl+D) ——
//
// 空选区 → 选当前词。非空选区 → 在文档中找下一处相同文本,加为新 range(非主)。
// 纯 StateCommand:用 indexOf 做字符串搜索(禁正则),charCategorizer 判词边界。

// 找光标处的词边界(同类别连续段)。ruler / minimap 的同词标记复用。
export function wordAt(state: EditorState, pos: number): { from: number, to: number } | null {
    if (pos < 0 || pos > state.doc.length)
        return null
    const line = state.doc.lineAt(pos)
    if (!line.text)
        return null
    const categorize = state.charCategorizer(pos)
    const offset = pos - line.from
    // pos 可能在字符之间;取 pos 处字符的类别
    const ch = offset < line.text.length ? line.text[offset] : line.text[offset - 1]
    if (!ch)
        return null
    const cat = categorize(ch)
    if (cat === CharCategory.Space)
        return null
    let from = offset, to = offset
    while (from > 0 && categorize(line.text[from - 1]) === cat)
        from--
    while (to < line.text.length && categorize(line.text[to]) === cat)
        to++
    return { from: line.from + from, to: line.from + to }
}

// ⌘D / ⌘K ⌘D:对齐 Monaco MultiCursorSession,见 multicursor.ts。
export { moveSelectionToNextFindMatch, moveSelectionToPreviousFindMatch, selectNextOccurrence, selectPreviousOccurrence } from './multicursor'

// ⇧⌘L / ⌘F2:实现在 multicursor.ts(和 ⌘D 共用会话语义)。
export { selectAllOccurrences } from './multicursor'

// —— 缩进命令:Tab / ⇧Tab / ⌘] / ⌘[ 对齐 Monaco ShiftCommand,见 tab.ts ——
export { indentLess, indentMore, insertTab } from './tab'
import { indentMore } from './tab'

// 回车 / ⌘Enter / ⌘⇧Enter:对齐 Monaco _enter(onEnterRules、括号展开、trimAutoWhitespace),见 enter.ts。
export { insertLineAfter, insertLineBefore, insertNewlineAndIndent } from './enter'

// 跳到匹配括号 ⌘⇧\(Go to Bracket):实现在 brackets.ts(jumpToBracket),和括号匹配高亮共用一套。
export { jumpToBracket as cursorMatchingBracket } from './brackets'

function leadingWhitespace(text: string): number {
    let n = 0
    for (const ch of text) {
        if (ch === ' ' || ch === '\t') n++
        else break
    }
    return n
}

// —— 缺口补齐：deleteToLine* / subword / addCursor / blankLine / blockComment / indentSelection ——

/** 删到行尾（不含换行） */
export const deleteToLineEnd: StateCommand = ({ state, dispatch }) =>
    deleteBy(state, dispatch, range => {
        const line = state.doc.lineAt(range.head)
        return range.head < line.to ? line.to : Math.min(state.doc.length, line.to + 1)
    }, 'delete')

/** 删到行首 */
export const deleteToLineStart: StateCommand = ({ state, dispatch }) =>
    deleteBy(state, dispatch, range => state.doc.lineAt(range.head).from, 'delete')

export const deleteLineBoundaryForward: StateCommand = deleteToLineEnd
export const deleteLineBoundaryBackward: StateCommand = deleteToLineStart

/** 严格退格：不走 indent tab-stop 合并 */
export const deleteCharBackwardStrict: StateCommand = ({ state, dispatch }) =>
    deleteBy(state, dispatch, range => {
        const pos = range.from
        const line = state.doc.lineAt(pos)
        let target = findClusterBreak(line.text, pos - line.from, false, false) + line.from
        if (target === pos && line.number !== 1) target -= 1
        return target
    }, 'delete')

/** 保持当前行缩进的换行（不继承括号展开） */
export const insertNewlineKeepIndent: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const changes = state.changeByRange(range => {
        const line = state.doc.lineAt(range.from)
        const indent = line.text.slice(0, leadingWhitespace(line.text))
        const insert = '\n' + indent
        return {
            changes: { from: range.from, to: range.to, insert },
            range: EditorSelection.cursor(range.from + insert.length),
        }
    })
    dispatch(state.update(changes, { scrollIntoView: true, userEvent: 'input' }))
    return true
}

/** 在光标处插入空行（换行两次，中间缩进对齐） */
export const insertBlankLine: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const changes = state.changeByRange(range => {
        const line = state.doc.lineAt(range.from)
        const indent = line.text.slice(0, leadingWhitespace(line.text))
        const insert = '\n' + indent + '\n' + indent
        return {
            changes: { from: range.from, to: range.to, insert },
            range: EditorSelection.cursor(range.from + 1 + indent.length),
        }
    })
    dispatch(state.update(changes, { scrollIntoView: true, userEvent: 'input' }))
    return true
}

/** 选区整块按 indentService 风格：有选区 indentMore，否则 false */
export const indentSelection: StateCommand = ({ state, dispatch }) => {
    if (state.selection.ranges.every(r => r.empty)) return false
    return indentMore({ state, dispatch })
}

// 子词移动(⌃⌥←/→,Monaco cursorWordPartLeft/Right):词首、词尾、camelCase/下划线分段三者取最近。
export const cursorSubwordForward: StateCommand = ({ state, dispatch }) =>
    moveCursor(state, dispatch, r => byWordPart(state, r, true, isMulti(state)))
export const cursorSubwordBackward: StateCommand = ({ state, dispatch }) =>
    moveCursor(state, dispatch, r => byWordPart(state, r, false, isMulti(state)))
export const selectSubwordForward: StateCommand = ({ state, dispatch }) =>
    extendCursor(state, dispatch, r => byWordPart(state, r, true, isMulti(state)))
export const selectSubwordBackward: StateCommand = ({ state, dispatch }) =>
    extendCursor(state, dispatch, r => byWordPart(state, r, false, isMulti(state)))

/** 选中匹配括号区间 */
export const selectMatchingBracket: StateCommand = ({ state, dispatch }) => {
    const main = state.selection.main
    const text = state.sliceDoc()
    const at = main.head
    const here = at < text.length ? text[at] : ''
    if (OPEN_CLOSE[here]) {
        const close = matchForward(text, here, at)
        if (close < 0) return false
        dispatch(setSel(state, EditorSelection.range(at, close + 1)))
        return true
    }
    const prev = at > 0 ? text[at - 1] : ''
    const open = CLOSE_OPEN[prev]
    if (open) {
        const openPos = matchBackward(text, prev, at - 1)
        if (openPos < 0) return false
        dispatch(setSel(state, EditorSelection.range(openPos, at)))
        return true
    }
    return false
}

// —— 块注释 ——
// 配置: commentTokens.of({ line: '//', block: { open: '/'+'*', close: '*'+'/' } })
export type { CommentTokens } from './commenttokens'
export { commentTokensFacet as commentTokens } from './commenttokens'

/** 找到块注释边界；删除时用 [openFrom,openTo) + [closeFrom,closeTo) */
function findBlockComment(
    state: EditorState,
    token: { open: string, close: string },
    from: number,
    to: number,
): { openFrom: number, openTo: number, closeFrom: number, closeTo: number } | null {
    const before = state.sliceDoc(Math.max(0, from - 80), from)
    const after = state.sliceDoc(to, Math.min(state.doc.length, to + 80))
    // 外侧：open[space?] + selection + [space?]close
    let i = before.length
    while (i > 0 && (before.charCodeAt(i - 1) === 32 || before.charCodeAt(i - 1) === 9)) i--
    if (i >= token.open.length && before.slice(i - token.open.length, i) === token.open) {
        let j = 0
        while (j < after.length && (after.charCodeAt(j) === 32 || after.charCodeAt(j) === 9)) j++
        if (after.slice(j, j + token.close.length) === token.close) {
            const openFrom = from - (before.length - i) - token.open.length
            const openTo = from // 含 open 后空白
            const closeFrom = to // 含 close 前空白
            const closeTo = to + j + token.close.length
            return { openFrom, openTo, closeFrom, closeTo }
        }
    }
    // 内侧：selection 自身是 open...close
    const inner = state.sliceDoc(from, to)
    if (inner.length >= token.open.length + token.close.length &&
        inner.startsWith(token.open) && inner.endsWith(token.close)) {
        let openTo = from + token.open.length
        while (openTo < to && (state.sliceDoc(openTo, openTo + 1) === ' ' || state.sliceDoc(openTo, openTo + 1) === '\t'))
            openTo++
        let closeFrom = to - token.close.length
        while (closeFrom > from && (state.sliceDoc(closeFrom - 1, closeFrom) === ' ' || state.sliceDoc(closeFrom - 1, closeFrom) === '\t'))
            closeFrom--
        return {
            openFrom: from,
            openTo,
            closeFrom,
            closeTo: to,
        }
    }
    return null
}

function changeBlockComment(
    state: EditorState,
    option: 'toggle' | 'comment' | 'uncomment',
): { changes: ChangeSpec[] } | null {
    const tokens = getCommentTokens(state).block
    if (!tokens) return null
    const ranges = state.selection.ranges
    const found = ranges.map(r => findBlockComment(state, tokens, r.from, r.to))
    const allCommented = found.every(f => f)
    if (option !== 'uncomment' && !allCommented) {
        const changes: ChangeSpec[] = []
        for (let i = 0; i < ranges.length; i++) {
            if (found[i]) continue
            const r = ranges[i]
            changes.push({ from: r.from, insert: tokens.open + ' ' })
            changes.push({ from: r.to, insert: ' ' + tokens.close })
        }
        return changes.length ? { changes } : null
    }
    if (option !== 'comment' && found.some(f => f)) {
        const changes: ChangeSpec[] = []
        for (const c of found) {
            if (!c) continue
            changes.push({ from: c.openFrom, to: c.openTo })
            changes.push({ from: c.closeFrom, to: c.closeTo })
        }
        return changes.length ? { changes } : null
    }
    return null
}

export const blockComment: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const tr = changeBlockComment(state, 'comment')
    if (!tr) return false
    dispatch(state.update({ changes: tr.changes, userEvent: 'input' }))
    return true
}

export const blockUncomment: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const tr = changeBlockComment(state, 'uncomment')
    if (!tr) return false
    dispatch(state.update({ changes: tr.changes, userEvent: 'delete' }))
    return true
}

// 线边界 left/right 别名(LTR)
export const cursorLineBoundaryLeft: StateCommand = cursorLineBoundaryBackward
export const cursorLineBoundaryRight: StateCommand = cursorLineBoundaryForward
export const selectLineBoundaryLeft: StateCommand = selectLineBoundaryBackward
export const selectLineBoundaryRight: StateCommand = selectLineBoundaryForward

export const cursorCharLeft: StateCommand = ({ state, dispatch }) => moveCursor(state, dispatch, r => byCharVisual(state, r, false))
export const cursorCharRight: StateCommand = ({ state, dispatch }) => moveCursor(state, dispatch, r => byCharVisual(state, r, true))
export const selectCharLeft: StateCommand = ({ state, dispatch }) => extendCursor(state, dispatch, r => byCharVisual(state, r, false))
export const selectCharRight: StateCommand = ({ state, dispatch }) => extendCursor(state, dispatch, r => byCharVisual(state, r, true))
export const cursorGroupLeft: StateCommand = cursorGroupBackward
export const cursorGroupRight: StateCommand = cursorGroupForward
export const selectGroupLeft: StateCommand = selectGroupBackward
export const selectGroupRight: StateCommand = selectGroupForward

// Monaco TabFocus:全页一个布尔。哪个编辑器按 ⌃⇧M / Ctrl+M 都翻这一份,新建的实例读到的也是它。
let tabFocusOn = false

export function tabFocusMoves(): boolean { return tabFocusOn }

/** 永久 tab 焦点模式切换（Esc 临时 2s 在 EditorView keydown，仍是这个实例自己的） */
export function toggleTabFocusMode(view: { inputState: { tabFocusMode: number } }): boolean {
    tabFocusOn = !tabFocusOn
    view.inputState.tabFocusMode = tabFocusOn ? 0 : -1
    return true
}

export function temporarilySetTabFocusMode(view: { inputState: { tabFocusMode: number } }): boolean {
    view.inputState.tabFocusMode = Date.now() + 2000
    return true
}
