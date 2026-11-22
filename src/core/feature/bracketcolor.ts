// CM7 彩虹括号 —— provider (state, view?)->DecorationSet。
//
// 小文档:全文扫描(原语义)。大文档 + 有 view:只扫视口邻域,避免每键 O(全文) 的 sliceDoc+bracketSpans。
// 视口路径深度从 0 起算(不做前缀播种)——嵌套色可能与全文路径差一个相位,但不再卡死。
// 字符串/注释/正则里的括号不上色也不计深度(Monaco 括号树只收 Other token 里的括号):跳过谓词来自
// 本 view 的 token 缓存(和高亮同一份),这里先把缓存对齐到当前 doc、补齐窗口里的行,再按需逐行算掩码。

import type { DecorationSet } from '../model/decoration'
import type { EditorState } from '../model/state'
import type { EditorView } from '../view/editorview'
import { ensureTokenCache, ensureTokenizedRange, linesForDoc, selectTokenCache, tokenVersion, maxTokenizationLineLength, setMaxTokenizationLineLength, type ScopedShiki } from '../view/tokens'
import { Decoration } from '../model/decoration'
import { RangeSet, RangeSetBuilder } from '../model/rangeset'
import { bracketSkip, bracketSpans, colorizedBracketTable, type BracketTable } from '../edit/brackets'
import { bracketPairColorization, numOption } from '../edit/editoptions'

interface BracketOptions {
    lang: string
    theme: string
}

// 有 view 走视口邻域(大/小文档一致,避免 3k 行边缘全文 sliceDoc)。
const VIEW_PAD = 2000 // 字符,约 100 行量级

// 同色 mark 复用(镜像 shiki.ts 的 colorMark 缓存)。
const markByColor = new Map<string, Decoration>()
function colorMark(color: string): Decoration {
    let mark = markByColor.get(color)
    if (!mark) {
        mark = Decoration.mark({ attributes: { style: `color:${color}` } })
        markByColor.set(color, mark)
    }
    return mark
}

function buildFromText(
    state: EditorState,
    from: number,
    to: number,
    owner: object | null,
    hl: ScopedShiki,
    opts: BracketOptions,
    palette: string[],
    vp?: { from: number, to: number },
): DecorationSet {
    if (!palette.length || from >= to || !bracketPairColorization(state).enabled) return RangeSet.empty
    const independent = bracketPairColorization(state).independentColorPoolPerBracketType
    const tbl = colorizedBracketTable(state)
    const doc = state.doc
    // 缓存对齐到当前 doc(同 shikiDecorations;已对齐是 O(1) 命中),再补齐 [from,to] 的行。
    // view 的行表由 EditorView.update 随事务维护;没 view(纯函数)就只能按全文行比对
    setMaxTokenizationLineLength(owner, numOption(state, 'maxTokenizationLineLength', 20000))
    selectTokenCache(owner)
    const lines = owner ? linesForDoc(doc.lines) ?? doc.toJSON() : doc.toJSON()
    // 超长行不分词(Monaco maxTokenizationLineLength),括号也不着色、不计深度
    const long: { from: number, to: number }[] = []
    const maxLine = maxTokenizationLineLength()
    for (let pos = from; pos <= to;) {
        const line = doc.lineAt(pos)
        if (line.length > maxLine) long.push({ from: line.from, to: line.to })
        pos = line.to + 1
    }
    // 超长行本来就不着色不计深度:连扫都不扫(53 万字符的行每键扫一遍 ~7 ms),只画它前后的普通行
    const paintAll = (skip: ReturnType<typeof bracketSkip>): DecorationSet => {
        if (!long.length) return paint(state.sliceDoc(from, to), from, skip, palette, independent, tbl)
        const parts: DecorationSet[] = []
        let at = from
        for (const r of long) {
            if (r.from > at) parts.push(paint(state.sliceDoc(at, Math.min(r.from, to)), at, skip, palette, independent, tbl))
            at = Math.max(at, r.to)
        }
        if (at < to) parts.push(paint(state.sliceDoc(at, to), at, skip, palette, independent, tbl))
        return parts.length === 1 ? parts[0] : RangeSet.join(parts)
    }
    if (!ensureTokenCache(hl, lines, opts)) return paintAll(undefined)
    // 只同步分视口行(和高亮同一段,共用缓存,谁先到谁算);两侧邻域用已有的 token,没分过的行不跳过
    if (vp) ensureTokenizedRange(doc.lineAt(vp.from).number, doc.lineAt(vp.to).number)
    else ensureTokenizedRange(1, doc.lines)
    const skip = bracketSkip(owner, doc)
    return paintAll(skip)
}

function paint(text: string, base: number, skip: ReturnType<typeof bracketSkip>, palette: string[], independent = false, tbl?: BracketTable): DecorationSet {
    const spans = bracketSpans(text, base, skip, independent, tbl)
    if (!spans.length) return RangeSet.empty
    const builder = new RangeSetBuilder<Decoration>()
    for (const s of spans)
        builder.add(s.from, s.to, colorMark(palette[s.depth % palette.length]))
    return builder.finish()
}

// 纯函数:doc → 彩虹括号 DecorationSet。palette 空 → RangeSet.empty(不着色,不抛)。用默认 token 缓存。
export function bracketColorDecorations(hl: ScopedShiki, state: EditorState, opts: BracketOptions, palette: string[]): DecorationSet {
    return buildFromText(state, 0, state.doc.length, null, hl, opts, palette)
}

// EditorView.decorationProviders 工厂。有 view → 视口邻域;无 view(单测) → 全文。
export function bracketColorizeCM7(hl: ScopedShiki, opts: BracketOptions, palette: string[]) {
    // 同 shikiHighlightCM7:doc、视口、token 没变就交回同一个对象
    let memo: { view: EditorView, doc: EditorState['doc'], from: number, to: number, version: number, set: DecorationSet } | null = null
    return (state: EditorState, view?: EditorView): DecorationSet => {
        if (!palette.length || !bracketPairColorization(state).enabled) return RangeSet.empty
        if (view) {
            const vp = view.viewport
            const from = Math.max(0, Math.min(state.doc.length, vp.from) - VIEW_PAD)
            const to = Math.min(state.doc.length, Math.max(0, vp.to) + VIEW_PAD)
            selectTokenCache(view)
            if (memo && memo.view === view && memo.doc === state.doc && memo.from === from && memo.to === to && memo.version === tokenVersion()) return memo.set
            const set = buildFromText(state, from, to, view, hl, opts, palette, {
                from: Math.min(state.doc.length, Math.max(0, vp.from)),
                to: Math.min(state.doc.length, Math.max(0, vp.to)),
            })
            memo = { view, doc: state.doc, from, to, version: tokenVersion(), set }
            return set
        }
        return bracketColorDecorations(hl, state, opts, palette)
    }
}
