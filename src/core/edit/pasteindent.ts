// 粘贴后自动缩进(Monaco AutoIndentOnPaste.trigger + AutoIndentOnPasteCommand):对 [from, to](粘贴出来的区间)
//   · 只有空白 / 多选区 → 不动;
//   · 区间起点在字符串里且 autoIndentOnPasteWithinString 关 → 不动;
//   · 区间首行行首只有空白:按规则推第一行该有的缩进,改它;
//   · 第二个非空行按「第一行改完之后」的虚拟文档推缩进,算出的偏移平移之后每一行。
// 一次编辑,前后各一个撤销断点。autoIndent < Full / 没配 indentationRules → 不做。
// 不自动挂在粘贴事务上:Monaco standalone 里它按 BeforeFirstInteraction 懒建,建编辑器时给 'full' 也不会生效(见 autoindent.ts 开头),
// 宿主要的话在 onDidPaste 里调它。

import type { EditorState } from '../model/state'
import { EditorSelection } from '../model/selection'
import type { ChangeSpec } from '../model/change'
import { getOption } from '../options'
import { fullIndentRules, testRule } from './autoindent'
import { isCheapToTokenize, standardTokenTypeAt } from './brackets'
import { indentConfig, leadingWhitespaceOf } from './enter'
import { undoStop } from './history'
import { generateIndent, goodIndentFor, spaceCount } from './moveindent'

type Target = { state: EditorState, dispatch(tr: ReturnType<EditorState['update']>): void }

const TOKEN_STRING = 2

/** 选项 autoIndentOnPasteWithinString(默认 true:字符串里粘贴也照常缩进)读自 state 的选项表 */
export function autoIndentOnPaste(target: Target, from: number, to: number): boolean {
    const { state } = target
    if (state.readOnly || state.selection.ranges.length > 1) return false
    const rules = fullIndentRules(state)
    if (!rules) return false
    const doc = state.doc
    if (from > to) [from, to] = [to, from]
    if (/^\s*$/.test(state.sliceDoc(from, to))) return false
    if (getOption(state, 'autoIndentOnPasteWithinString') === false && (standardTokenTypeAt(target, doc, from) === TOKEN_STRING || standardTokenTypeAt(target, doc, to) === TOKEN_STRING)) return false

    if (!isCheapToTokenize(target, doc, doc.lineAt(from).number)) return false
    const { tabSize, insertSpaces } = indentConfig(state)
    const edits: { from: number, to: number, insert: string }[] = []
    const startLine = doc.lineAt(from)
    const endLine = doc.lineAt(to).number
    let firstNumber = startLine.number
    let firstText = startLine.text

    if (!/\S/.test(firstText.slice(0, from - startLine.from))) {
        const good = goodIndentFor(state, target, firstNumber)
        if (good !== null) {
            const old = leadingWhitespaceOf(firstText)
            const newCount = spaceCount(good, tabSize)
            if (newCount !== spaceCount(old, tabSize)) {
                const indent = generateIndent(newCount, tabSize, insertSpaces)
                edits.push({ from: startLine.from, to: startLine.from + old.length, insert: indent })
                firstText = indent + firstText.slice(old.length)
            }
            else {
                // 只缩进规则 getIndentMetadata:这行不命中 increase / decrease / indentNextLine(unIndentedLine 可有)→ 第一行已经对了,整个不动
                const hit = testRule(rules.increaseIndentPattern, firstText) || testRule(rules.decreaseIndentPattern, firstText) || testRule(rules.indentNextLinePattern, firstText)
                if (!hit) return false
            }
        }
    }

    // 跳过紧跟的空行
    let n = firstNumber
    while (n < endLine && !/\S/.test(doc.line(n + 1).text)) n++
    if (n !== endLine) {
        const good = goodIndentFor(state, target, n + 1, k => k === firstNumber ? { src: firstNumber, text: firstText, keepProcessed: true } : null)
        if (good !== null) {
            const next = doc.line(n + 1).text
            const offset = spaceCount(good, tabSize) - spaceCount(leadingWhitespaceOf(next), tabSize)
            if (offset !== 0) {
                for (let i = n + 1; i <= endLine; i++) {
                    const line = doc.line(i)
                    const old = leadingWhitespaceOf(line.text)
                    const indent = generateIndent(spaceCount(old, tabSize) + offset, tabSize, insertSpaces)
                    if (indent !== old) edits.push({ from: line.from, to: line.from + old.length, insert: indent })
                }
            }
        }
    }
    if (!edits.length) return false

    // 选区跟踪(AutoIndentOnPasteCommand):单个编辑 + 空选区且编辑贴着光标 → 光标留在编辑那一侧;否则选区两端各自向外长
    const changes = state.changes(edits as ChangeSpec)
    const sel = state.selection.main
    let ranges: EditorSelection
    if (edits.length === 1 && sel.empty && edits[0].from === sel.head) ranges = EditorSelection.single(changes.mapPos(sel.head, 1))
    else if (edits.length === 1 && sel.empty && edits[0].to === sel.head) ranges = EditorSelection.single(changes.mapPos(sel.head, -1))
    else {
        const lo = changes.mapPos(sel.from, -1), hi = changes.mapPos(sel.to, 1)
        ranges = EditorSelection.single(sel.anchor <= sel.head ? lo : hi, sel.anchor <= sel.head ? hi : lo)
    }
    const push = () => target.dispatch(target.state.update({ annotations: [undoStop.of('push')] }))
    push()
    target.dispatch(target.state.update({ changes, selection: ranges, userEvent: 'input.autoIndentOnPaste', scrollIntoView: true }))
    push()
    return true
}
