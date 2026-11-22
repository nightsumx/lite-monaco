// CM7 代码折叠 —— 缩进级折叠(无 AST 依赖)。
//
// 设计(§4:保留 Facet,砍 NodeProp;实现从 AST-based 改 token-based):
//   foldState = StateField<Set<number>>: 存「被折叠的起始行号」。
//   foldable(state, lineStart): 缩进判断 —— 某行可折 ⟺ 其后存在缩进更深的行;范围到下一缩进≤行。
//   fold/unfold: StateCommand,操作 foldState。
//   foldDecorations: decoration provider → Decoration.replace 隐藏折叠区域。
//
// 无 Lezer / 无语法树:纯缩进判断,全语言通用(等价 Monaco 无语言折叠时的 indentation 策略)。

import { afterNextPaint } from '../view/afterpaint'
import type { DecorationSet } from '../model/decoration'
import type { EditorState, StateCommand, Transaction, TransactionSpec } from '../model/state'
import type { SelectionRange } from '../model/selection'
import { EditorSelection } from '../model/selection'
import { getCommentTokens } from './commenttokens'
import { Decoration, WidgetType } from '../model/decoration'
import { RangeSet, RangeSetBuilder } from '../model/rangeset'
import { MapMode } from '../model/change'
import { Facet, StateEffect, StateField } from '../model/state'
import { indentOf } from './indent'

// fold effect: value = 行号(折叠起始)
export const foldEffect = StateEffect.define<number>()
export const unfoldEffect = StateEffect.define<number>()

/**
 * 宿主直接指定的隐藏区(Monaco editor.setHiddenAreas):整行 [startLine, endLine](1-based)被藏掉,不带折叠占位。
 * 和折叠(foldField)分开存:折叠是「起始行集合」块范围每次现算,这里是宿主给的固定行段,随编辑映射。
 */
export const setHiddenAreasEffect = StateEffect.define<{ startLine: number, endLine: number }[]>()
export interface HiddenArea { from: number, to: number, head?: boolean }

function hiddenSpans(doc: { lines: number, line: (n: number) => { from: number, to: number } }, areas: readonly { startLine: number, endLine: number }[]): HiddenArea[] {
    const out: HiddenArea[] = []
    for (const a of areas) {
        const s = Math.max(1, Math.min(a.startLine, doc.lines)), e = Math.max(s, Math.min(a.endLine, doc.lines))
        if (a.endLine < a.startLine) continue
        // 约定同 hiddenRanges:(上一行行尾, 末行行尾];首行起的区间没有上一行,from = 0 并记 head
        out.push(s === 1 ? { from: 0, to: doc.line(e).to, head: true } : { from: doc.line(s - 1).to, to: doc.line(e).to })
    }
    return out.sort((a, b) => a.from - b.from)
}

export const hiddenAreasField = StateField.define<HiddenArea[]>({
    create: () => [],
    update: (val, tr) => {
        for (const e of tr.effects)
            if (e.is(setHiddenAreasEffect)) return hiddenSpans(tr.newDoc, e.value)
        if (!tr.docChanged || !val.length) return val
        const out: HiddenArea[] = []
        for (const h of val) {
            const from = h.head ? 0 : tr.changes.mapPos(h.from, -1)
            const to = tr.changes.mapPos(h.to, 1)
            if (to > from) out.push({ from, to, head: h.head })
        }
        return out
    },
})

/** 事务是否改折叠块(改 heightMap)。查找/诊断等 mark effect 不是。 */
export function transactionChangesFold(tr: Transaction): boolean {
    for (const e of tr.effects)
        if (e.is(foldEffect) || e.is(unfoldEffect) || e.is(setHiddenAreasEffect)) return true
    return false
}

// 块随编辑映射(Monaco 折叠装饰:首行行尾 → 末行行尾,两头 AlwaysGrowsWhenTypingAtEdges),
// 落点收回所在行的行尾(Monaco 每次 update 都在首行行尾重建装饰);并成一行的丢掉。
function mapFold(tr: Transaction, from: number, to: number): { line: number, end: number, from: number, to: number } | null {
    const doc = tr.newDoc
    const line = doc.lineAt(tr.changes.mapPos(from, -1))
    const end = doc.lineAt(tr.changes.mapPos(to, 1))
    if (end.number <= line.number) return null
    return { line: line.number, end: end.number, from: line.to, to: end.to }
}

// Monaco toSelectedLines(...).startsInside:有选区的起始行落在 [from, to] 行段里
function selectionStartsIn(tr: Transaction, from: number, to: number): boolean {
    for (const r of tr.newSelection.ranges) {
        const n = tr.newDoc.lineAt(r.from).number
        if (n >= from && n <= to) return true
    }
    return false
}

function foldStateField() {
    return StateField.define<Set<number>>({
        create: () => new Set<number>(),
        update: (folded, tr, state) => {
            if (!tr.docChanged && !tr.effects.length) return folded
            let next = folded
            for (const eff of tr.effects) {
                if (eff.is(foldEffect)) {
                    if (next === folded) next = new Set(folded)
                    next.add(eff.value)
                }
                else if (eff.is(unfoldEffect)) {
                    if (next === folded) next = new Set(folded)
                    next.delete(eff.value)
                }
            }
            if (!tr.docChanged || !next.size) return next
            // 编辑后照 Monaco FoldingModel.update:块按位置映射,映射后的首行还起块就接着收起
            // (首行不再起 provider 块的,manualFoldField 把它留成 recovered 块)。
            // 选区起始行落在藏起的行上,或块的行数变了、选区起始行落进新块,就展开。
            const old = tr.startState, doc = tr.newDoc
            const mapped = new Set<number>()
            for (const n of next) {
                if (n > old.doc.lines) continue
                const f = foldable(old, old.doc.line(n).from)
                const m = f && mapFold(tr, f.from, f.to)
                if (!m || selectionStartsIn(tr, m.line + 1, m.end)) continue
                const p = foldable(state, doc.line(m.line).from)
                if (!p) continue
                const end = doc.lineAt(p.to).number
                if (end === m.end || !selectionStartsIn(tr, m.line + 1, end + 1)) mapped.add(m.line)
            }
            return mapped
        },
    })
}

export const foldField = foldStateField()

export const setExtraFolds = StateEffect.define<{ line: number, from: number, to: number }[]>()

// recovered:收起的 provider 块编辑后首行不再起块,按原范围留下来的块(Monaco FoldSource.recovered)
type LineRange = { line: number, from: number, to: number, recovered?: boolean }
// 一次派发的折叠 effect(fold/unfold 是 number,手建块表是 LineRange[];输入位同 TransactionSpec.effects 用 any)
type FoldEffects = StateEffect<any>[]

// 编辑把条目映射过去:端点落在删除区间里、或块并成一行 → 丢弃。
// 起点、终点各排一次序和 changes 一起扫(条目数千、批量编辑上万段时逐条 mapPos 是 O(条目×段))。
function mapLineRanges(val: LineRange[], tr: Transaction): LineRange[] {
    if (!tr.docChanged || !val.length) return val
    const doc = tr.newDoc
    const byFrom = val.map((_, i) => i).sort((a, b) => val[a].from - val[b].from)
    const byTo = val.map((_, i) => i).sort((a, b) => val[a].to - val[b].to)
    const froms = tr.changes.mapSorted(byFrom.map(i => val[i].from), -1, MapMode.TrackDel)
    const tos = tr.changes.mapSorted(byTo.map(i => val[i].to), 1, MapMode.TrackDel)
    const from: (number | null)[] = []
    const to: (number | null)[] = []
    byFrom.forEach((i, k) => { from[i] = froms[k] })
    byTo.forEach((i, k) => { to[i] = tos[k] })
    const out: LineRange[] = []
    for (let i = 0; i < val.length; i++) {
        const f = from[i], t = to[i]
        if (f == null || t == null || f >= t || t > doc.length) continue
        const line = doc.lineAt(f)
        if (t <= line.to) continue
        out.push({ line: line.number, from: f, to: t })
    }
    return out
}

/** TS outlining 等补上的可折行（缩进/region 看不到的）。
 *  表是异步补的(tsfold 防抖 280ms),中间的编辑把条目映射过去。 */
export const extraFoldField = StateField.define<LineRange[]>({
    create: () => [],
    update: (val, tr) => {
        for (const e of tr.effects)
            if (e.is(setExtraFolds)) return e.value
        return mapLineRanges(val, tr)
    },
})

export const setManualFolds = StateEffect.define<LineRange[]>()

/**
 * 手建的块(Monaco FoldSource.userDefined:Create Folding Range from Selection 建,Remove Manual Folding Ranges 删)
 * 和 recovered 块。和 TS outlining 的表分开存:outlining 整表替换时不冲掉;和别的块照 Monaco sanitizeAndMerge 合并(见 foldable 上面那段)。
 * recovered 块首行又起 provider 块时让给 provider,也不挤掉和它交叉的 provider 块;Remove Manual 一起删。
 */
export const manualFoldField = StateField.define<LineRange[]>({
    create: () => [],
    update: (val, tr, state) => {
        for (const e of tr.effects)
            if (e.is(setManualFolds)) return e.value
        if (!tr.docChanged) return val
        const out: LineRange[] = []
        for (const r of val) {
            const m = mapFold(tr, r.from, r.to)
            if (m && !(r.recovered && providerRange(state, m.from))) out.push({ line: m.line, from: m.from, to: m.to, recovered: r.recovered })
        }
        const folded = tr.startState.field(foldField, false)
        if (folded?.size) {
            const old = tr.startState
            const own = new Set(val.map(r => r.line))
            const taken = new Set(out.map(r => r.line))
            for (const n of folded) {
                if (n > old.doc.lines || own.has(n)) continue
                const f = foldable(old, old.doc.line(n).from)
                const m = f && mapFold(tr, f.from, f.to)
                if (!m || taken.has(m.line) || selectionStartsIn(tr, m.line + 1, m.end) || providerRange(state, m.from)) continue
                out.push({ line: m.line, from: m.from, to: m.to, recovered: true })
                taken.add(m.line)
            }
        }
        return out.length || val.length ? out : val
    },
})

const extraByLine = new WeakMap<LineRange[], Map<number, LineRange>>()

function extraRange(state: EditorState, lineStart: number): { from: number, to: number } | null {
    const extra = state.field(extraFoldField, false)
    if (!extra?.length) return null
    const line = state.doc.lineAt(lineStart).number
    const allowed = allowedExtraLines(state)
    if (allowed && !allowed.has(line)) return null
    let byLine = extraByLine.get(extra)
    if (!byLine) {
        byLine = new Map()
        for (const r of extra) if (!byLine.has(r.line)) byLine.set(r.line, r)
        extraByLine.set(extra, byLine)
    }
    const hit = byLine.get(line)
    if (!hit) return null
    // F6:TS outlining 的块范围收在 `}` 上,折起来会把 `}` 行也藏掉。对齐 VS Code(TS 折叠止于收尾括号前一行):
    // 末行去掉空白后以收尾字符开头 → 止于前一行行尾;只剩起始行就不可折。
    // 收尾字符照 VS Code typescript-language-features 的 foldEndPairCharacters:} ] ) ` >(模板串、JSX 也留收尾行)
    const doc = state.doc
    const end = doc.lineAt(hit.to)
    const t = end.text.trimStart()
    if (end.number > line && t && ')]}`>'.includes(t[0])) {
        if (end.number - 1 <= line) return null
        return { from: hit.from, to: doc.line(end.number - 1).to }
    }
    return { from: hit.from, to: hit.to }
}

/**
 * 语言的 region 标记(Monaco 各语言 conf 的 folding.markers),每条是从行首空白后起的一串步骤:
 * 字符串 = 字面量;ws = \s*(1 = \s+);opt = 可有可无的字面量;word = 字面量 + \b;then = 后面某处出现。
 */
export type MarkerStep = string | { ws: 0 | 1 } | { opt: string } | { word: string } | { then: string }
/** regex:setLanguageConfiguration 的 folding.markers({start, end} 两个 RegExp,对整行文本 test,和 Monaco 一样);有它就不看 start / end 步骤 */
export type FoldMarkers = { start: MarkerStep[][], end: MarkerStep[][], regex?: { start: RegExp, end: RegExp } }

/** 没配语言时用 TS/JS 的 `// #region`(同 commentTokens 未配置时按 C 系);liteMonaco() 按语言配,没有标记的语言配 null。 */
export const foldingMarkers = Facet.define<FoldMarkers | null, FoldMarkers | null>({
    combine: vs => vs.length ? vs[vs.length - 1] : {
        start: [['//', { ws: 0 }, { opt: '#' }, { word: 'region' }]],
        end: [['//', { ws: 0 }, { opt: '#' }, { word: 'endregion' }]],
    },
})

const isSpace = (c: string | undefined) => c === ' ' || c === '\t'
const isWordChar = (c: string | undefined) => !!c && ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c === '_')

function matchMarker(text: string, steps: MarkerStep[]): boolean {
    let i = 0
    while (isSpace(text[i])) i++
    for (const step of steps) {
        if (typeof step === 'string') {
            if (!text.startsWith(step, i)) return false
            i += step.length
        }
        else if ('ws' in step) {
            const s = i
            while (isSpace(text[i])) i++
            if (i - s < step.ws) return false
        }
        else if ('opt' in step) {
            if (text.startsWith(step.opt, i)) i += step.opt.length
        }
        else if ('word' in step) {
            if (!text.startsWith(step.word, i) || isWordChar(text[i + step.word.length])) return false
            i += step.word.length
        }
        else if (text.indexOf(step.then, i) < 0) return false
    }
    return true
}

/**
 * 标记都是从行首空白后的一个字面量开始的(`//`、`<!--`、`#pragma`、`#`、`--`…):行的第一个非空白字符不是这些字面量的首字符,
 * 这一行就不可能是标记,不用逐步匹配。绝大多数代码行一眼筛掉(10 万行扫一遍:11 ms → 不到 2 ms)。
 * regex 标记、或有一条标记不是以字面量开头时没法筛,返回 null。
 */
const prefilterCache = new WeakMap<FoldMarkers, ((text: string) => boolean) | null>()
export function markerPrefilter(markers: FoldMarkers): ((text: string) => boolean) | null {
    const hit = prefilterCache.get(markers)
    if (hit !== undefined) return hit
    let result: ((text: string) => boolean) | null = null
    if (!markers.regex) {
        const first = new Uint8Array(128)
        let ok = true
        let any = false
        for (const steps of [...markers.start, ...markers.end]) {
            const head = steps[0]
            const c = typeof head === 'string' && head.length ? head.charCodeAt(0) : -1
            if (c < 0 || c >= 128 || c === 32 || c === 9) { ok = false; break }
            first[c] = 1
            any = true
        }
        if (ok && any) {
            result = (text: string) => {
                let i = 0
                let c = text.charCodeAt(i)
                while (c === 32 || c === 9) c = text.charCodeAt(++i)
                return c < 128 && first[c] === 1
            }
        }
    }
    prefilterCache.set(markers, result)
    return result
}

export function regionMarker(markers: FoldMarkers | null, text: string): 'open' | 'close' | null {
    if (!markers) return null
    const pre = markerPrefilter(markers)
    if (pre && !pre(text)) return null
    if (markers.regex) return markers.regex.start.test(text) ? 'open' : markers.regex.end.test(text) ? 'close' : null
    if (markers.start.some(m => matchMarker(text, m))) return 'open'
    if (markers.end.some(m => matchMarker(text, m))) return 'close'
    return null
}

// —— 缩进块 + region 标记(Monaco indentRangeProvider.computeRanges,offSide = false)——
// 自下而上一遍:#endregion 压一个 indent = -2 的哨兵;#region 往栈里找最近的哨兵,找到就把它上面的缩进块全丢掉、
// 出一个 region 块(含 #endregion 行),哨兵原地变成 region 起始行的普通缩进项(参与外层缩进块);找不到当普通行。
// 所以 region 和缩进块交叉时,缩进块会伸到 #endregion 那一行或被多余的 #endregion 截断。
// 缩进块的末行是上一个「缩进不更深的行」前一行;只到文末的块连文末空行也算进去(栈底哨兵在 行数 + 1)。
// 按文档(Rope 不可变)和 tabSize 缓存:gutter / 命令逐行问,编辑后第一次问时重算。

/**
 * editor.foldingMaximumRegions(Monaco 默认 5000,最小 10、最大 65000)。超出时缩进 provider 按缩进层从浅到深整层收,
 * 收不下整层的那一层从文档顶往下收满为止(indentRangeProvider RangesCollector.toIndentRanges)。
 * TS outlining 补的块(Monaco 的 TS 没有折叠 provider,是 lite-monaco 多给的)只占剩下的名额。
 */
export const foldingMaximumRegions = Facet.define<number, number>({
    combine: vs => Math.min(65000, Math.max(10, Math.floor(vs[0] ?? 5000) || 5000)),
})

type IndentRanges = { tabSize: number, limit: number, markers: FoldMarkers | null, limited: boolean, lines: number[], end: Map<number, number> }
const indentRangeCache = new WeakMap<object, IndentRanges>()

/** RangesCollector.toIndentRanges 超限那支:found 自下而上,indents 是各块起始行的缩进 */
function limitByIndent(found: [number, number][], indents: number[], limit: number): [number, number][] {
    const occ: number[] = []
    for (const i of indents) if (i < 1000) occ[i] = (occ[i] ?? 0) + 1
    let entries = 0
    let maxIndent = occ.length
    for (let i = 0; i < occ.length; i++) {
        const n = occ[i]
        if (!n) continue
        if (n + entries > limit) { maxIndent = i; break }
        entries += n
    }
    const kept: [number, number][] = []
    for (let i = found.length - 1; i >= 0; i--) {
        const indent = indents[i]
        if (indent < maxIndent || (indent === maxIndent && entries++ < limit)) kept.push(found[i])
    }
    return kept.reverse()
}

export function isIndentRangesCached(state: EditorState): boolean {
    const hit = indentRangeCache.get(state.doc)
    return !!hit && hit.tabSize === state.tabSize && hit.limit === state.facet(foldingMaximumRegions) && hit.markers === state.facet(foldingMarkers)
}

/**
 * 每行的缩进和 region 标记(0 无 / 1 open / 2 close)。每次编辑后整篇重算一遍要 5 ms(10 万行),
 * 而一次编辑只动几行:rope 的 toJSON 对没动过的行给同一个字符串,和上一份逐个比引用,头尾相同的行直接抄上一份的结果,
 * 只有中间变了的那段重算。上一份的 tabSize / 标记集不同就整篇重算。
 */
let lastFacts: { texts: string[], lineIndent: Int32Array, lineMarker: Uint8Array, tabSize: number, markers: FoldMarkers | null } | null = null
function lineFacts(texts: string[], tabSize: number, markers: FoldMarkers | null): { lineIndent: Int32Array, lineMarker: Uint8Array } {
    const n = texts.length
    const lineIndent = new Int32Array(n)
    const lineMarker = new Uint8Array(n)
    const prev = lastFacts && lastFacts.tabSize === tabSize && lastFacts.markers === markers ? lastFacts : null
    let head = 0, tail = 0
    if (prev) {
        const pt = prev.texts, m = Math.min(n, pt.length)
        while (head < m && texts[head] === pt[head]) head++
        while (tail < m - head && texts[n - 1 - tail] === pt[pt.length - 1 - tail]) tail++
        lineIndent.set(prev.lineIndent.subarray(0, head), 0)
        lineMarker.set(prev.lineMarker.subarray(0, head), 0)
        if (tail) {
            lineIndent.set(prev.lineIndent.subarray(pt.length - tail), n - tail)
            lineMarker.set(prev.lineMarker.subarray(pt.length - tail), n - tail)
        }
    }
    for (let i = head; i < n - tail; i++) {
        const text = texts[i]
        const indent = indentOf(text, tabSize)
        lineIndent[i] = indent
        if (indent !== -1) {
            const mk = regionMarker(markers, text)
            lineMarker[i] = mk === 'open' ? 1 : mk === 'close' ? 2 : 0
        }
    }
    lastFacts = { texts, lineIndent, lineMarker, tabSize, markers }
    return { lineIndent, lineMarker }
}

function indentRanges(state: EditorState): IndentRanges {
    const doc = state.doc
    const tabSize = state.tabSize
    const limit = state.facet(foldingMaximumRegions)
    const markers = state.facet(foldingMarkers)
    const hit = indentRangeCache.get(doc)
    if (hit && hit.tabSize === tabSize && hit.limit === limit && hit.markers === markers) return hit
    const count = doc.lines
    type Prev = { indent: number, endAbove: number, line: number }
    const previous: Prev[] = [{ indent: -1, endAbove: count + 1, line: count + 1 }]
    let found: [number, number][] = []
    const indents: number[] = []
    // 一次摊平成行数组:逐行 doc.line(n) 是每行一次树查找 + 一个 Line 对象,10 万行时占这一遍的一半
    const texts = doc.toJSON()
    const { lineIndent, lineMarker } = lineFacts(texts, tabSize, markers)
    for (let line = count; line > 0; line--) {
        const indent = lineIndent[line - 1]
        let prev = previous[previous.length - 1]
        if (indent === -1) continue
        const marker = lineMarker[line - 1] === 1 ? 'open' : lineMarker[line - 1] === 2 ? 'close' : null
        if (marker === 'open') {
            let i = previous.length - 1
            while (i > 0 && previous[i].indent !== -2) i--
            if (i > 0) {
                previous.length = i + 1
                prev = previous[i]
                found.push([line, prev.line])
                indents.push(indent)
                prev.line = line
                prev.indent = indent
                prev.endAbove = line
                continue
            }
        }
        else if (marker === 'close') {
            previous.push({ indent: -2, endAbove: line, line })
            continue
        }
        if (prev.indent > indent) {
            do {
                previous.pop()
                prev = previous[previous.length - 1]
            } while (prev.indent > indent)
            const endLine = prev.endAbove - 1
            if (endLine - line >= 1) { found.push([line, endLine]); indents.push(indent) }
        }
        if (prev.indent === indent) prev.endAbove = line
        else previous.push({ indent, endAbove: line, line })
    }
    const limited = found.length > limit
    if (limited) found = limitByIndent(found, indents, limit)
    const end = new Map<number, number>()
    const lines: number[] = []
    for (let i = found.length - 1; i >= 0; i--) {
        const [l, e] = found[i]
        if (end.has(l)) continue
        end.set(l, e)
        lines.push(l)
    }
    const entry = { tabSize, limit, markers, limited, lines, end }
    indentRangeCache.set(doc, entry)
    return entry
}

export function indentMarkerRange(state: EditorState, lineStart: number): { from: number, to: number } | null {
    const doc = state.doc
    const line = doc.lineAt(lineStart)
    const e = indentRanges(state).end.get(line.number)
    if (e === undefined || e > doc.lines) return null
    return { from: line.to, to: doc.line(e).to }
}

// provider 块(Monaco 的 range provider 那一份):缩进块 / region 标记(一遍算),同起始行没有时才用 TS outlining 补的。
// 和 syntaxRangeProvider.sanitizeRanges 一样:同起始行先来的赢,交叉的块照样留着(区域按起始行排、父块按包含算)。
export function providerRange(state: EditorState, lineStart: number): { from: number, to: number } | null {
    return indentMarkerRange(state, lineStart) ?? extraRange(state, lineStart)
}

// —— 和手建块合并(Monaco FoldingRegions.sanitizeAndMerge)——
// 同起始行:手建的赢;provider 块和手建块交叉(行段相交、谁也不包含谁,起在别人末行上也算):provider 块丢掉;
// 建新块时新块和旧手建块交叉:新的赢。手建表本身总是嵌套好的(只在建块时用整套 sanitizeAndMerge 合并)。
// 之后逐行判定:provider 块彼此嵌套时,「不和任何手建块交叉」和整套合并的结果一样,不用每次编辑全文重算。
// provider 块之间的交叉(region 标记 / TS outlining 和缩进块)照旧不处理,有没有手建块都一样。

type Span = { line: number, end: number, from: number, to: number, user: boolean, recovered?: boolean }

/** 整套 sanitizeAndMerge(建块时用)。a 是当前区域集,b 是新建的手建块(FoldSource.userDefined),都按起始行排。 */
function sanitizeAndMerge(a: Span[], b: Span[], maxLine: number): Span[] {
    let ia = 0, ib = 0, prev = 0
    let top: Span | undefined
    const stack: Span[] = []
    const out: Span[] = []
    while (ia < a.length || ib < b.length) {
        const na = a[ia], nb = b[ib]
        let use: Span | undefined
        if (nb && (!na || na.line >= nb.line)) {
            if (na && na.line === nb.line) ia++
            use = nb
            ib++
        }
        else {
            // a 先来:往后看 b 里起在 a 块内、伸出 a 末行的手建块 —— 有就丢掉 a(哪怕那个手建块自己后面也没留下)
            use = na
            for (let k = ib; k < b.length && b[k].line <= na.end; k++)
                if (b[k].user && b[k].end > na.end) { use = undefined; break }
            ia++
        }
        if (!use) continue
        while (top && top.end < use.line) top = stack.pop()
        if (use.end > use.line && use.line > prev && use.end <= maxLine && (!top || top.end >= use.end)) {
            out.push(use)
            prev = use.line
            if (top) stack.push(top)
            top = use
        }
    }
    return out
}

// 手建块(带末行号),按手建表的身份缓存 —— 编辑时表跟着映射成新数组,缓存自然失效
const manualSpanCache = new WeakMap<LineRange[], { doc: object, spans: Span[], byLine: Map<number, Span> }>()

function manualSpans(state: EditorState): { spans: Span[], byLine: Map<number, Span> } | null {
    const manual = state.field(manualFoldField, false)
    if (!manual?.length) return null
    const hit = manualSpanCache.get(manual)
    if (hit && hit.doc === state.doc) return hit
    const doc = state.doc
    const spans = manual.filter(r => r.to <= doc.length)
        .map(r => ({ line: r.line, end: doc.lineAt(r.to).number, from: r.from, to: r.to, user: !r.recovered, recovered: r.recovered }))
        .sort((x, y) => x.line - y.line)
    const entry = { doc, spans, byLine: new Map(spans.map(r => [r.line, r])) }
    manualSpanCache.set(manual, entry)
    return entry
}

// Monaco 建手建块时只拿当前区域集合并,provider 块要等下一次内容变更(或 Remove Manual)重算才回来:
// 被新块挤掉的 provider 块(哪怕挤它的新块自己也没留下)在那之前不出现。按那次建块产出的手建表记下来,
// 编辑(手建表跟着映射成新数组)/ 删手建块后自然失效。键 = `起始行:末行`。
const suppressedByManual = new WeakMap<LineRange[], Set<string>>()
const spanKey = (s: { line: number, end: number }) => `${s.line}:${s.end}`

const crosses = (line: number, end: number, m: Span) =>
    m.line <= end && m.end >= line && !(m.line <= line && m.end >= end) && !(line <= m.line && end >= m.end)

// 判断某行是否可折叠:手建块 → provider 块(region → 缩进级 → TS outlining 补的),和手建块交叉的不算。
export function foldable(state: EditorState, lineStart: number): { from: number, to: number } | null {
    const manual = manualSpans(state)
    if (!manual) return providerRange(state, lineStart)
    const doc = state.doc
    const line = doc.lineAt(lineStart).number
    const own = manual.byLine.get(line)
    if (own?.user) return { from: own.from, to: own.to }
    const p = providerRange(state, lineStart)
    if (!p) return own ? { from: own.from, to: own.to } : null
    const end = doc.lineAt(p.to).number
    if (suppressedByManual.get(state.field(manualFoldField))?.has(spanKey({ line, end }))) return null
    for (const m of manual.spans) {
        if (m.line > end) break
        if (m.user && crosses(line, end, m)) return null
    }
    return p
}

/** 当前区域集(按起始行排,带来源)。 */
function regionSpans(state: EditorState): Span[] {
    const doc = state.doc
    const manual = manualSpans(state)
    const out: Span[] = []
    for (const n of [...new Set(collectFoldableLines(state))].sort((x, y) => x - y)) {
        const f = foldable(state, doc.line(n).from)
        const own = manual?.byLine.get(n)
        if (f) out.push({ line: n, end: doc.lineAt(f.to).number, from: f.from, to: f.to, user: !!own?.user, recovered: own?.recovered && own.to === f.to })
    }
    return out
}

/**
 * 包含第 `line` 行的所有可折块的起始行,由内到外(Monaco foldingModel.getAllRegionsAtLine:块含起始行到末行,
 * 起始行靠后的在里面)。缩进块可能被 region 标记撑到别的缩进上,所以按区域集核对范围,不按缩进往上走。
 */
export function foldRegionsAtLine(state: EditorState, line: number): number[] {
    const doc = state.doc
    const out: number[] = []
    for (const h of new Set(collectFoldableLines(state))) {
        if (h > line) continue
        const f = foldable(state, doc.line(h).from)
        if (f && doc.lineAt(f.to).number >= line) out.push(h)
    }
    return out.sort((a, b) => b - a)
}

/** 每个选区的起始行(去重;Monaco FoldingAction.getSelectedLines 取 startLineNumber)。 */
function selectionLines(state: EditorState): number[] {
    const lines = new Set<number>()
    for (const r of state.selection.ranges) lines.add(state.doc.lineAt(r.from).number)
    return [...lines]
}

/**
 * 折起来藏掉的区间,按位置排、嵌套和交叉的并成一段(Monaco HiddenRangeModel):(块首行行尾, 块末行行尾]。
 * 块首行本身可见,所以藏掉的是首行之后到末行的整行。
 */
export function hiddenRanges(state: EditorState): { from: number, to: number, head?: boolean }[] {
    const folded = state.field(foldField, false)
    const areas = state.field(hiddenAreasField, false)
    if (!folded?.size && !areas?.length) return []
    const doc = state.doc
    const ranges: { from: number, to: number, head?: boolean }[] = []
    for (const n of folded ?? []) {
        if (n > doc.lines) continue
        const f = foldable(state, doc.line(n).from)
        if (f) ranges.push(f)
    }
    for (const a of areas ?? []) if (a.to <= doc.length) ranges.push(a)
    ranges.sort((a, b) => a.from - b.from)
    const hidden: { from: number, to: number, head?: boolean }[] = []
    for (const r of ranges) {
        const last = hidden[hidden.length - 1]
        if (last && (r.from > last.from || (r.head && last.head)) && r.from <= last.to) { last.to = Math.max(last.to, r.to); continue }
        hidden.push({ ...r })
    }
    return hidden
}

/** 藏掉的整行段 [startLine, endLine](Monaco getHiddenAreas:折叠和 setHiddenAreas 的并集) */
export function hiddenLineRanges(state: EditorState): [number, number][] {
    const doc = state.doc
    return hiddenRanges(state).map(h => [h.head ? 1 : doc.lineAt(h.from).number + 1, doc.lineAt(h.to).number])
}

/**
 * 折叠后落进隐藏区的选区端点挪到块首行行尾(Monaco hiddenRangeModel.adjustSelections:隐藏行上的端点 →
 * 块起始行的最大列)。嵌套块只认最外层可见的那块。没有要挪的返回 null。
 */
export function selectionOutOfFolds(state: EditorState): EditorSelection | null {
    const hidden = hiddenRanges(state)
    if (!hidden.length) return null
    const out = (p: number) => {
        for (const h of hidden) if (p > h.from && p <= h.to) return h.from
        return p
    }
    let changed = false
    const next = state.selection.ranges.map((r: SelectionRange) => {
        const a = out(r.anchor), h = out(r.head)
        if (a === r.anchor && h === r.head) return r
        changed = true
        return EditorSelection.range(a, h)
    })
    return changed ? EditorSelection.create(next, state.selection.mainIndex) : null
}

/** 派发折叠 effect:折完把被藏的选区端点挪出来,并把选区滚进视口(Monaco FoldingAction 末尾 reveal)。 */
export function foldTransaction(state: EditorState, spec: TransactionSpec, scrollIntoView = true): Transaction {
    const moved = selectionOutOfFolds(state.update(spec).apply())
    return state.update(moved ? { ...spec, selection: moved } : spec, { scrollIntoView })
}

function dispatchFolds(state: EditorState, dispatch: (tr: Transaction) => void, effects: FoldEffects, selection?: EditorSelection): boolean {
    if (!effects.length) return false
    dispatch(foldTransaction(state, selection ? { effects, selection } : { effects }))
    return true
}

// Fold(Monaco ⌘⌥[):折光标处最内层未折的块;已折就往外找第一个未折的父块(setCollapseStateUp)。
export const foldCode: StateCommand = ({ state, dispatch }) => {
    const folded = state.field(foldField, false)
    const effects = []
    for (const line of selectionLines(state)) {
        const target = foldRegionsAtLine(state, line).find(h => !folded?.has(h))
        if (target != null) effects.push(foldEffect.of(target))
    }
    if (!effects.length) return false
    dispatch(foldTransaction(state, { effects }))
    return true
}

// Unfold(Monaco ⌘⌥]):光标处最内层的块若折着就展开(setCollapseStateLevelsDown levels=1)。
export const unfoldCode: StateCommand = ({ state, dispatch }) => {
    const folded = state.field(foldField, false)
    if (!folded?.size) return false
    const effects = []
    for (const line of selectionLines(state)) {
        const inner = foldRegionsAtLine(state, line)[0]
        if (inner != null && folded.has(inner)) effects.push(unfoldEffect.of(inner))
    }
    if (!effects.length) return false
    dispatch(foldTransaction(state, { effects }))
    return true
}

// Toggle Fold(Monaco ⌘K ⌘L):光标处最内层的块折↔展。
export const toggleFold: StateCommand = ({ state, dispatch }) => {
    const folded = state.field(foldField, false)
    const effects = []
    for (const line of selectionLines(state)) {
        const inner = foldRegionsAtLine(state, line)[0]
        if (inner == null) continue
        effects.push(folded?.has(inner) ? unfoldEffect.of(inner) : foldEffect.of(inner))
    }
    if (!effects.length) return false
    dispatch(foldTransaction(state, { effects }))
    return true
}

/** 一遍扫描收集可折行，语义与逐行 foldable 相同(有手建块时去掉和它交叉的 provider 块)。 */
export function collectFoldableLines(state: EditorState): number[] {
    const lines = providerFoldLines(state)
    const manual = manualSpans(state)
    if (!manual) return lines
    const doc = state.doc
    const out = lines.filter(n => !manual.byLine.has(n) && foldable(state, doc.line(n).from))
    for (const m of manual.spans) out.push(m.line)
    return out
}

// TS 补行占 foldingMaximumRegions 剩下的名额(按列表顺序);没超时返回 null = 都可用
const extraAllowedCache = new WeakMap<LineRange[], { ranges: IndentRanges, set: Set<number> | null }>()
function allowedExtraLines(state: EditorState): Set<number> | null {
    const listed = state.field(extraFoldField, false) ?? []
    if (!listed.length) return null
    const ranges = indentRanges(state)
    const hit = extraAllowedCache.get(listed)
    if (hit && hit.ranges === ranges) return hit.set
    let set: Set<number> | null = null
    const extra = new Set<number>()
    for (const r of listed) if (!ranges.end.has(r.line)) extra.add(r.line)
    if (ranges.limited || ranges.lines.length + extra.size > ranges.limit) {
        set = new Set()
        // 缩进块被截掉的行不让 TS 补回来:超限时整个 TS 补充都不给(Monaco 只有缩进那一份)
        if (!ranges.limited) {
            let room = ranges.limit - ranges.lines.length
            for (const l of extra) { if (room-- <= 0) break; set.add(l) }
        }
    }
    extraAllowedCache.set(listed, { ranges, set })
    return set
}

/** 只算缩进 / region 标记的块起始行(不含 TS outlining 补的):sticky scroll 的 indentationModel 用 */
export function indentFoldLines(state: EditorState): number[] {
    return indentRanges(state).lines.slice()
}

// provider 块的起始行(可能有 providerRange 为 null 的 TS 补行,调用方核对)
export function providerFoldLines(state: EditorState): number[] {
    const ranges = indentRanges(state)
    const out = ranges.lines.slice()
    const listed = state.field(extraFoldField, false) ?? []
    if (listed.length) {
        const allowed = allowedExtraLines(state)
        const seen = new Set(out)
        for (const r of listed)
            if (!seen.has(r.line) && (!allowed || allowed.has(r.line))) { seen.add(r.line); out.push(r.line) }
    }
    return out
}

/** 折叠所有可折行 */
export const foldAll: StateCommand = ({ state, dispatch }) => {
    const lines = collectFoldableLines(state)
    if (!lines.length) return false
    dispatch(foldTransaction(state, { effects: lines.map(n => foldEffect.of(n)) }))
    return true
}

/** 展开全部 */
export const unfoldAll: StateCommand = ({ state, dispatch }) => {
    const folded = state.field(foldField, false)
    if (!folded?.size) return false
    const effects = [...folded].map(n => unfoldEffect.of(n))
    dispatch(foldTransaction(state, { effects }))
    return true
}

/**
 * 选区锚点所在行被折起时要展开的块(Monaco FoldingController.revealCursor:取 selectionStartLineNumber,
 * 这行被藏就展开所有包含它、起始行在它之上的已折块)。只动头不动锚(Shift+↓ 扩进折叠块)不展开。
 */
export function revealSelectionFolds(state: EditorState): { effects: StateEffect<number>[] } | null {
    const hidden = hiddenRanges(state)
    if (!hidden.length) return null
    const doc = state.doc
    const folded = state.field(foldField)
    const lines = new Set<number>()
    for (const r of state.selection.ranges) {
        const line = doc.lineAt(r.anchor)
        if (hidden.some(h => line.from > h.from && line.from <= h.to)) lines.add(line.number)
    }
    const effects: StateEffect<number>[] = []
    for (const h of folded) {
        if (h > doc.lines) continue
        const f = foldable(state, doc.line(h).from)
        if (!f) continue
        const end = doc.lineAt(f.to).number
        for (const n of lines) if (n > h && n <= end) { effects.push(unfoldEffect.of(h)); break }
    }
    return effects.length ? { effects } : null
}

/** 块的行区间 [起始行, 末行](Monaco FoldingRegion.startLineNumber..endLineNumber)。 */
function regionLines(state: EditorState, line: number): [number, number] | null {
    const f = foldable(state, state.doc.line(line).from)
    return f ? [line, state.doc.lineAt(f.to).number] : null
}

/** 各选区所在行的最内层块,加上严格包在它里面的块(Monaco setCollapseStateLevelsDown,levels = ∞)。 */
function regionsDown(state: EditorState): number[] {
    const out = new Set<number>()
    const all = collectFoldableLines(state)
    for (const line of selectionLines(state)) {
        const inner = foldRegionsAtLine(state, line)[0]
        if (inner == null) continue
        const r = regionLines(state, inner)
        if (!r) continue
        out.add(inner)
        for (const n of all) {
            if (n <= r[0] || n > r[1]) continue
            const o = regionLines(state, n)
            if (o && o[1] <= r[1]) out.add(n)
        }
    }
    return [...out]
}

/** Fold Recursively(⌘K ⌘[):包住光标的最内层块和它里面的所有块。 */
export const foldRecursively: StateCommand = ({ state, dispatch }) => {
    const already = state.field(foldField, false)
    const effects = regionsDown(state).filter(n => !already?.has(n)).map(n => foldEffect.of(n))
    if (!effects.length) return false
    dispatch(foldTransaction(state, { effects }))
    return true
}

/**
 * Create Folding Range from Selection(⌘K ⌘,):每个选区建一个手建块并折上(末行列 1 不算,至少两行),
 * 光标回到起始行行首(Monaco 在循环里逐个 setSelection,最后只剩最后一个)。缩进看不到的也折。
 * 新块和现有区域(含旧的手建块)照 sanitizeAndMerge 合并:新块赢,和它交叉的块丢掉,丢掉的块折叠状态也没了
 * (删掉手建块后回来的缩进块是展开的);新块之间交叉,起始行靠前的赢。
 */
export const foldFromSelection: StateCommand = ({ state, dispatch }) => {
    const manual = state.field(manualFoldField, false)
    if (manual === undefined) return false
    const doc = state.doc
    const added: Span[] = []
    let cursor = -1
    for (const r of state.selection.ranges) {
        const fromLine = doc.lineAt(r.from)
        let end = doc.lineAt(r.to).number
        if (r.to === doc.line(end).from) end--
        if (end <= fromLine.number) continue
        added.push({ line: fromLine.number, end, from: fromLine.to, to: doc.line(end).to, user: true })
        cursor = fromLine.from
    }
    if (!added.length) return false
    added.sort((a, b) => a.line - b.line)
    const current = regionSpans(state)
    const result = sanitizeAndMerge(current, added, doc.lines)
    const kept = new Set(result.map(s => s.line))
    const next = result.filter(s => s.user || s.recovered).map(s => ({ line: s.line, from: s.from, to: s.to, recovered: s.recovered }))
    const survived = new Set(result.filter(s => !s.user).map(spanKey))
    // 这一刻被挤掉的 provider 块(含之前就被挤掉的)记下来,下一次编辑前不回来
    const gone = new Set<string>()
    for (const n of providerFoldLines(state)) {
        const f = providerRange(state, doc.line(n).from)
        const key = f && spanKey({ line: n, end: doc.lineAt(f.to).number })
        if (key && !survived.has(key)) gone.add(key)
    }
    suppressedByManual.set(next, gone)
    const already = state.field(foldField, false)
    const effects: FoldEffects = [setManualFolds.of(next)]
    if (already) for (const n of already) if (!kept.has(n)) effects.push(unfoldEffect.of(n))
    for (const r of added) if (result.includes(r) && !already?.has(r.line)) effects.push(foldEffect.of(r.line))
    return dispatchFolds(state, dispatch, effects, EditorSelection.single(cursor))
}

/**
 * Remove Manual Folding Ranges(⌘K ⌘.):删掉和任一选区行段相交的手建块(Monaco removeManualRanges);
 * 折着的展开,这一行的缩进 / region 块回来。
 */
export const removeManualFoldingRanges: StateCommand = ({ state, dispatch }) => {
    const manual = state.field(manualFoldField, false)
    if (!manual?.length) return false
    const doc = state.doc
    const spans = state.selection.ranges.map(r => [doc.lineAt(r.from).number, doc.lineAt(r.to).number])
    const removed = manual.filter(m => {
        const end = doc.lineAt(m.to).number
        return spans.some(([s, e]) => !(s > end || m.line > e))
    })
    if (!removed.length) return false
    const folded = state.field(foldField, false)
    const effects: FoldEffects = [setManualFolds.of(manual.filter(m => !removed.includes(m)))]
    for (const m of removed) if (folded?.has(m.line)) effects.push(unfoldEffect.of(m.line))
    return dispatchFolds(state, dispatch, effects)
}

/** 全部块的行区间,按起始行排。 */
function allRegions(state: EditorState): { line: number, end: number }[] {
    const out: { line: number, end: number }[] = []
    for (const n of collectFoldableLines(state)) {
        const r = regionLines(state, n)
        if (r) out.push({ line: r[0], end: r[1] })
    }
    return out.sort((a, b) => a.line - b.line)
}

/** 起始行文本命中 test 的块折上 / 展开(Monaco setCollapseStateForMatchingLines)。 */
function setForMatchingLines(test: (state: EditorState, text: string) => boolean, collapse: boolean): StateCommand {
    return ({ state, dispatch }) => {
        const folded = state.field(foldField, false)
        if (!folded) return false
        const effects: FoldEffects = []
        for (const r of allRegions(state)) {
            if (folded.has(r.line) === collapse || !test(state, state.doc.line(r.line).text)) continue
            effects.push((collapse ? foldEffect : unfoldEffect).of(r.line))
        }
        return dispatchFolds(state, dispatch, effects)
    }
}

/** Fold All Block Comments(⌘K ⌘/):起始行以块注释开头的块(Monaco 无类型时用 `^\s*` + blockCommentStartToken)。 */
export const foldAllBlockComments: StateCommand = (target) => {
    const open = getCommentTokens(target.state).block?.open
    if (!open) return false
    return setForMatchingLines((_, text) => text.trimStart().startsWith(open), true)(target)
}

/** Fold All Regions(⌘K ⌘8):起始行是本语言 region 起始标记的块。 */
export const foldAllMarkerRegions: StateCommand = setForMatchingLines((state, text) => regionMarker(state.facet(foldingMarkers), text) === 'open', true)

/** Unfold All Regions(⌘K ⌘9)。 */
export const unfoldAllMarkerRegions: StateCommand = setForMatchingLines((state, text) => regionMarker(state.facet(foldingMarkers), text) === 'open', false)

/**
 * Fold / Unfold All Except Selected(⌘K ⌘- / ⌘K ⌘=):每个选区起始行的最内层块,它的祖先、它自己和它里面的块不动,
 * 其余全折 / 全展(Monaco setCollapseStateForRest)。
 */
function setForRest(collapse: boolean): StateCommand {
    return ({ state, dispatch }) => {
        const folded = state.field(foldField, false)
        if (!folded) return false
        const keep: { line: number, end: number }[] = []
        for (const line of selectionLines(state)) {
            const inner = foldRegionsAtLine(state, line)[0]
            const r = inner == null ? null : regionLines(state, inner)
            if (r) keep.push({ line: r[0], end: r[1] })
        }
        const inside = (a: { line: number, end: number }, b: { line: number, end: number }) => b.line <= a.line && b.end >= a.end
        const effects: FoldEffects = []
        for (const r of allRegions(state)) {
            if (folded.has(r.line) === collapse) continue
            if (keep.some(k => inside(k, r) || inside(r, k))) continue
            effects.push((collapse ? foldEffect : unfoldEffect).of(r.line))
        }
        return dispatchFolds(state, dispatch, effects)
    }
}

export const foldAllExcept: StateCommand = setForRest(true)
export const unfoldAllExcept: StateCommand = setForRest(false)

/**
 * Toggle Fold Recursively(⌘K ⌘⇧L):选区起始行的最内层块没折 → 连里面的一起折;折着 → 连里面的一起展
 * (Monaco toggleCollapseState,levels = ∞)。
 */
export const toggleFoldRecursively: StateCommand = ({ state, dispatch }) => {
    const folded = state.field(foldField, false)
    if (!folded) return false
    const want = new Map<number, boolean>()
    const all = allRegions(state)
    for (const line of selectionLines(state)) {
        const inner = foldRegionsAtLine(state, line)[0]
        const r = inner == null ? null : regionLines(state, inner)
        if (!r) continue
        const collapse = !folded.has(inner)
        want.set(inner, collapse)
        for (const o of all)
            if (o.line > r[0] && o.line <= r[1] && o.end <= r[1] && folded.has(o.line) !== collapse) want.set(o.line, collapse)
    }
    const effects: FoldEffects = []
    for (const [line, collapse] of want) effects.push((collapse ? foldEffect : unfoldEffect).of(line))
    return dispatchFolds(state, dispatch, effects)
}

/**
 * Fold Level N(⌘K ⌘N):折恰好第 N 层的块(1 = 顶层),包含任一选区所在行的块不折
 * (Monaco setCollapseStateAtLevel + FoldLevelAction 的 selectedLines)。
 */
export function foldLevel(level: number): StateCommand {
    return ({ state, dispatch }) => {
        if (level < 1) return false
        const lines = collectFoldableLines(state)
        if (!lines.length) return false
        const ranges: { line: number, end: number }[] = []
        for (const n of lines) {
            const r = regionLines(state, n)
            if (r) ranges.push({ line: r[0], end: r[1] })
        }
        const blocked = selectionLines(state)
        const already = state.field(foldField, false)
        const effects = []
        for (const r of ranges) {
            let depth = 1
            for (const o of ranges)
                if (o.line < r.line && o.end >= r.end) depth++
            if (depth !== level || already?.has(r.line)) continue
            if (blocked.some(b => b >= r.line && b <= r.end)) continue
            effects.push(foldEffect.of(r.line))
        }
        if (!effects.length) return false
        dispatch(foldTransaction(state, { effects }))
        return true
    }
}

/** 光标跳到下一可折行。 */
export const gotoNextFold: StateCommand = ({ state, dispatch }) => {
    const lines = collectFoldableLines(state).sort((a, b) => a - b)
    if (!lines.length) return false
    const cur = state.doc.lineAt(state.selection.main.head).number
    const next = lines.find(n => n > cur)
    if (next == null) return false
    dispatch(state.update({
        selection: EditorSelection.cursor(state.doc.line(next).from),
        scrollIntoView: true,
        userEvent: 'select',
    }))
    return true
}

/** 光标跳到上一可折行。 */
export const gotoPrevFold: StateCommand = ({ state, dispatch }) => {
    const lines = collectFoldableLines(state).sort((a, b) => a - b)
    if (!lines.length) return false
    const cur = state.doc.lineAt(state.selection.main.head).number
    let prev: number | undefined
    for (const n of lines) {
        if (n >= cur) break
        prev = n
    }
    if (prev == null) return false
    dispatch(state.update({
        selection: EditorSelection.cursor(state.doc.line(prev).from),
        scrollIntoView: true,
        userEvent: 'select',
    }))
    return true
}

/** 光标跳到包住当前行的最紧外层可折行。 */
export const gotoParentFold: StateCommand = ({ state, dispatch }) => {
    const doc = state.doc
    const cur = doc.lineAt(state.selection.main.head)
    let best: { line: number, span: number } | null = null
    for (const n of collectFoldableLines(state)) {
        if (n === cur.number) continue
        const start = doc.line(n)
        const f = foldable(state, start.from)
        if (!f || start.from >= cur.from || f.to < cur.from) continue
        const span = f.to - start.from
        if (!best || span < best.span) best = { line: n, span }
    }
    if (!best) return false
    dispatch(state.update({
        selection: EditorSelection.cursor(doc.line(best.line).from),
        scrollIntoView: true,
        userEvent: 'select',
    }))
    return true
}

/** 展开当前块 + 块内已折行。 */
export const unfoldRecursively: StateCommand = ({ state, dispatch }) => {
    const folded = state.field(foldField, false)
    if (!folded?.size) return false
    const effects = regionsDown(state).filter(n => folded.has(n)).map(n => unfoldEffect.of(n))
    if (!effects.length) return false
    dispatch(foldTransaction(state, { effects }))
    return true
}

// foldGutter 箭头用的注入契约实现：按行号切换（非当前选区行）。装配层绑定 view.dispatch 后传给 EditorView.foldGutter。
/**
 * 超过这么多行的文档,gutter 的折叠箭头不在按键/首屏的同步路径里整篇算折叠范围(10 万行 3~4 ms,
 * 按一次 Enter 同步路径总共才十来毫秒):先按本行和下一个非空行的缩进给近似答案,精确的放到之后算好再重画 gutter。
 * Monaco 的折叠模型也是改文档后防抖重算、期间沿用旧装饰。近似和精确只在 region 标记、超出区域上限(5000)被裁掉的层上不同,
 * 箭头默认只在鼠标移到 gutter 上才显示(showFoldingControls: mouseover),那一两帧看不出来;折叠命令和展开一律用精确结果。
 */
const COLD_DEFER_LINES = 20000
/** 编辑之后精确折叠范围的重算间隔(连续打字时最多每隔这么久算一次) */
const EDIT_SETTLE_MS = 120

/** 本行是折叠块的头:缩进比下一个非空行浅(往下最多看 64 行) */
function approxFoldable(state: EditorState, lineFrom: number): boolean {
    const doc = state.doc
    const line = doc.lineAt(lineFrom)
    const tabSize = state.tabSize
    const indent = indentOf(line.text, tabSize)
    if (indent < 0) return false
    const last = Math.min(doc.lines, line.number + 64)
    for (let n = line.number + 1; n <= last; n++) {
        const i = indentOf(doc.line(n).text, tabSize)
        if (i >= 0) return i > indent
    }
    return false
}

export function foldGutterSpec(dispatch: (tr: Transaction) => void) {
    let warmed = false
    let scheduled = false
    let latest: EditorState | null = null
    let ready: (() => void) | null = null
    const settle = () => {
        scheduled = false
        warmed = true
        const st = latest
        latest = null
        if (st) indentRanges(st)
        ready?.()
    }
    return {
        foldableAt: (state: EditorState, lineFrom: number) => {
            if (state.doc.lines >= COLD_DEFER_LINES && !isIndentRangesCached(state)) {
                latest = state
                if (!scheduled) {
                    scheduled = true
                    // 第一次:首帧画完就算(箭头晚 1~2 帧准确);之后每次编辑:合并成每 EDIT_SETTLE_MS 一次
                    if (!warmed) afterNextPaint(settle)
                    else setTimeout(settle, EDIT_SETTLE_MS)
                }
                return approxFoldable(state, lineFrom)
            }
            return foldable(state, lineFrom) !== null
        },
        /** EditorView 登记:折叠范围第一次算好后重画 gutter */
        onReady: (cb: () => void) => { ready = cb },
        isFolded: (state: EditorState, lineNumber: number) => !!state.field(foldField, false)?.has(lineNumber),
        toggle: (state: EditorState, lineNumber: number) => {
            const folded = state.field(foldField, false)
            dispatch(foldTransaction(state, { effects: [(folded?.has(lineNumber) ? unfoldEffect : foldEffect).of(lineNumber)] }, false))
        },
    }
}

/** 点 ⋯ 占位展开:pos 落在哪个已折范围(含占位所在的起始行尾)就展开它。返回要派发的 effect,不在折叠里返 null */
export function unfoldEffectAt(state: EditorState, pos: number): StateEffect<number> | null {
    const folded = state.field(foldField, false)
    if (!folded?.size) return null
    const doc = state.doc
    for (const n of folded) {
        if (n > doc.lines) continue
        const f = foldable(state, doc.line(n).from)
        if (f && pos >= f.from && pos <= f.to) return unfoldEffect.of(n)
    }
    return null
}

// 折叠占位 widget:⋯ 省略号,点击展开(mouseselection 认 .cm-foldPlaceholder)。
class FoldPlaceholderWidget extends WidgetType {
    eq() { return true }
    toDOM(): Node {
        const span = document.createElement('span')
        span.className = 'cm-foldPlaceholder'
        span.textContent = '\u22EF' // Monaco inline-folded: ⋯
        return span
    }
}

// 折叠装饰:把折叠区域替换为 ⋯ 占位 widget。
const foldPlaceholder = Decoration.replace({ widget: new FoldPlaceholderWidget() })
const foldedBackground = Decoration.line({ class: 'cm-foldedBackground' })

class HiddenAreaWidget extends WidgetType {
    eq() { return true }
    toDOM(): Node {
        const span = document.createElement('span')
        span.className = 'cm-hiddenArea'
        return span
    }
}
const hiddenAreaPlaceholder = Decoration.replace({ widget: new HiddenAreaWidget() })

/** setHiddenAreas 的隐藏区:整行藏掉,不留 ⋯ 占位(和折叠不同,宿主自己决定怎么提示) */
export function hiddenAreaDecorations(state: EditorState): DecorationSet {
    const areas = state.field(hiddenAreasField, false)
    if (!areas?.length) return RangeSet.empty as unknown as DecorationSet
    const builder = new RangeSetBuilder<Decoration>()
    const doc = state.doc
    let to = -1
    for (const a of areas) {
        if (a.to > doc.length || a.from < to) continue
        // 首行起的区间连末行行尾的换行一起吞,否则剩一个空行
        const end = a.head && a.to < doc.length ? a.to + 1 : a.to
        builder.add(a.from, end, hiddenAreaPlaceholder)
        to = end
    }
    return builder.finish()
}

export function foldDecorations(state: EditorState): DecorationSet {
    const folded = state.field(foldField, false)
    if (!folded || !folded.size) return RangeSet.empty as unknown as DecorationSet
    const builder = new RangeSetBuilder<Decoration>()
    const doc = state.doc
    const ranges: { from: number, to: number }[] = []
    for (const lineNum of folded) {
        const f = foldable(state, doc.line(lineNum).from)
        if (f) ranges.push(f)
    }
    ranges.sort((a, b) => a.from - b.from)
    // Monaco folded-background:折叠起始行整行铺 editor.foldBackground;藏在外层折叠里的不铺
    let hiddenTo = -1
    for (const f of ranges) {
        if (f.from >= hiddenTo) builder.add(doc.lineAt(f.from).from, doc.lineAt(f.from).from, foldedBackground)
        builder.add(f.from, f.to, foldPlaceholder)
        hiddenTo = Math.max(hiddenTo, f.to)
    }
    return builder.finish()
}
