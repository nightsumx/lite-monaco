// CM7 搜索替换 —— 纯状态机,零正则依赖 + 顶部面板 overlay。
//
// 设计:
//   searchState = StateField<{open, query, replacement, flags, matches, currentMatch, history}>
//   findMatches: indexOf；regex 开时走 RegExp（非法式空命中）
//   searchDecorations: 仅 open 时 mark 命中
//   commands: open/close/findNext/Prev/replace/toggle flags/selectAll
//
// 交互对齐 Monaco 0.52 find-widget(逐项实测见 /tmp/lc-hunt/f7/m-find.txt):
//   打开:选区/光标词 seed 查询,不动选区(Cmd+F 后仍 7-7);多行选区不 seed、不自动选区内查找;
//         regex 开着时 seed 先转义。reopen 无 seed 保留 query。
//   计数(FindModel.research):打开、改条件、改文档时按选区重算 —— 与某命中相交(含贴边)→ 它的序号;
//         否则光标前最近一个的序号,都在后面才「?」。只挪光标不重算;跳转才高亮当前命中,重算清掉高亮。
//   ⌥⌘F(StartFindReplaceAction):只从单行非空选区 seed;seed 了或焦点本在查找框 → 焦点进替换框,否则进查找框。
//   Enter/⌘G:选区终点之后第一个;Shift+Enter/⌘⇧G:选区起点之前最后一个;首尾环绕。
//   查找框关着时 findNext/findPrev 先打开(不抢焦点)再跳,查询空则从光标词 seed。
//   替换:选区不正好是命中 → 只选中下一个,不替换;是 → 换掉并选中其后的下一个。
//   ⌥⌘C/W/R 快捷键只改条件不移光标;点按钮才移。关闭清掉选区内查找范围。

import type { DecorationSet } from '../model/decoration'
import type { EditorView } from '../view/editorview'
import type { EditorState, StateCommand, Transaction } from '../model/state'
import { Decoration } from '../model/decoration'
import { RangeSet, RangeSetBuilder } from '../model/rangeset'
import { Annotation, StateEffect, StateField } from '../model/state'
import { CharCategory } from '../model/charcategory'
import { EditorSelection } from '../model/selection'
import { wordAt } from '../edit/commands'
import { acceptEdit } from '../edit/tracked'
import { setFindStateReader } from '../edit/multicursor'
import { expandRegexReplacement, findInText, replaceWithCasePreserved } from '../edit/find'
import { openGotoLine } from './commandpalette'
import { alert } from './a11y'
import { detectKeyOS } from '../keyos'
import { getOption } from '../options'

export interface SearchQuery {
    query: string
    caseSensitive: boolean
    wholeWord: boolean
    regex?: boolean
}

export interface SearchState {
    open: boolean
    replaceOpen: boolean
    query: string
    replacement: string
    caseSensitive: boolean
    wholeWord: boolean
    regex: boolean
    findInSelection: boolean
    preserveCase: boolean
    // 本次查找会话的 find.loop(Monaco FindReplaceState.loop,每次 start 传入);null = 用 find.loop 选项
    loop: boolean | null
    // 选区内查找的范围(多光标 = 多段;Monaco searchScope: Range[])。已规整成整行(多行段)/原样(单行段),互不保证不重叠
    scopes: { from: number, to: number }[]
    matches: { from: number, to: number }[]
    currentMatch: number
    // currentMatch 是否画成当前命中:跳转(setCurrentMatch)置上,重算清掉(Monaco setCurrentFindMatch / research)
    highlighted: boolean
    // 每次 openSearch 递增;面板 focus+全选 focusTarget 那个输入框
    focusSeq: number
    focusTarget: 'find' | 'replace'
    // 边打字边找的起点(Monaco FindDecorations.startPosition):打开查找框、用户自己动光标、改文档时
    // 记下光标;查找命令自己挪的选区不算。-1 = 没记(按当前选区)
    typeAnchor: number
}

const EMPTY: SearchState = {
    open: false, replaceOpen: false, query: '', replacement: '',
    caseSensitive: false, wholeWord: false, regex: false,
    findInSelection: false, preserveCase: false, loop: null,
    scopes: [],
    matches: [], currentMatch: -1, highlighted: false, focusSeq: 0, focusTarget: 'find',
    typeAnchor: -1,
}

const setQueryEffect = StateEffect.define<{
    query: string
    caseSensitive?: boolean
    wholeWord?: boolean
    regex?: boolean
}>()
const setReplacementEffect = StateEffect.define<string>()
const setOpenEffect = StateEffect.define<boolean>()
const setReplaceOpenEffect = StateEffect.define<boolean>()
const setFindInSelectionEffect = StateEffect.define<{ on: boolean, scopes: { from: number, to: number }[] }>()
const setPreserveCaseEffect = StateEffect.define<boolean>()
const setLoopEffect = StateEffect.define<boolean | null>()
const setCurrentMatch = StateEffect.define<number>()
// 整篇换掉(model.setValue / setModel):Monaco 的 FindModel 收到 isFlush 先清掉全部命中装饰,100ms 后才重搜。
// 事务打这个标记 → 命中表清空;面板的定时器随后发 refreshSearchEffect 重搜
export const flushSearch = Annotation.define<boolean>()
const refreshSearchEffect = StateEffect.define<null>()
export const SEARCH_REFRESH_DELAY = 100
const setFocusFindEffect = StateEffect.define<'find' | 'replace'>()
// 新编辑器实例接手别人的 state(分屏 / 销毁重建恢复)时清掉查找会话
const resetSearchEffect = StateEffect.define<null>()
// 查找命令挪了选区:面板在 view zone 生效后按 Monaco revealRangeInCenterIfOutsideViewport 滚到它
const revealMatchEffect = StateEffect.define<null>()

function matchIndexAt(matches: { from: number, to: number }[], sel: { from: number, to: number, head: number, empty: boolean }): number {
    if (!matches.length) return -1
    if (!sel.empty) {
        const exact = matches.findIndex(m => m.from === sel.from && m.to === sel.to)
        if (exact >= 0) return exact
    }
    // 空选区上的空命中算「原地不动」,跳过(Monaco _getNextMatch:Looks like we're stuck at this position)
    const head = sel.head
    const stuck = (m: { from: number, to: number }) => m.from === head && m.to === head
    for (let i = 0; i < matches.length; i++) {
        const m = matches[i]
        if (m.from <= head && head <= m.to && !stuck(m)) return i
    }
    const after = matches.findIndex(m => m.from >= head && !stuck(m))
    return after >= 0 ? after : 0
}

// Monaco research 的计数:与选区相交(含贴边)的第一个命中(getCurrentMatchesPosition);
// 没有 → 选区前最近一个(lo 之前的都整个在选区前);都在后面 → -1(显示「?」)
function matchPosition(matches: { from: number, to: number }[], sel: { from: number, to: number }): number {
    let lo = 0
    let hi = matches.length
    while (lo < hi) {
        const mid = (lo + hi) >> 1
        if (matches[mid].to < sel.from) lo = mid + 1
        else hi = mid
    }
    return lo < matches.length && matches[lo].from <= sel.to ? lo : lo - 1
}

// Monaco _getNextMatch(selection end):起点 ≥ pos 的第一个,跳过与选区完全相同的空命中;环绕
function nextMatchIndex(matches: { from: number, to: number }[], sel: { from: number, to: number }): number {
    if (!matches.length) return -1
    for (let i = 0; i < matches.length; i++) {
        const m = matches[i]
        if (m.from >= sel.to && !(m.from === sel.from && m.to === sel.to)) return i
    }
    return 0
}

// Monaco _getPreviousMatch(selection start):终点 ≤ pos 的最后一个,跳过与选区完全相同的;环绕
function prevMatchIndex(matches: { from: number, to: number }[], sel: { from: number, to: number }): number {
    if (!matches.length) return -1
    for (let i = matches.length - 1; i >= 0; i--) {
        const m = matches[i]
        if (m.to <= sel.from && !(m.from === sel.from && m.to === sel.to)) return i
    }
    return matches.length - 1
}

export const searchField = StateField.define<SearchState>({
    create: () => EMPTY,
    update: (val, tr) => {
        if (!tr.effects.length && !tr.docChanged && !tr.selection) return val
        // 重置后同一事务里的其余 effect(新实例载入记住的开关)照常作用
        const next0 = updateSearch(tr.effects.some(e => e.is(resetSearchEffect)) ? EMPTY : val, tr)
        // 起点(只在查找框开着时维护,同 Monaco FindModel 的生命周期):查找命令挪的选区(带 setCurrentMatch)
        // 不动它;打开、用户挪光标、改文档 → 记光标
        const moved = tr.effects.some(e => e.is(setCurrentMatch))
        const opened = !val.open && next0.open
        if (next0.open && !moved && (opened || tr.docChanged || tr.selection)) {
            const head = tr.newSelection.main.head
            if (next0.typeAnchor !== head) return { ...next0, typeAnchor: head }
        }
        return next0
    },
})

setFindStateReader(state => state.field(searchField, false) ?? null)

function updateSearch(val: SearchState, tr: Transaction): SearchState {
    // 只动了选区:计数和高亮都不动(Monaco 只在 research / 跳转时改 matchesPosition)
    if (!tr.effects.length && !tr.docChanged) return val
    {
        let next = val
        let queryChanged = false
        let explicitCurrent: number | null = null
        for (const eff of tr.effects) {
            if (eff.is(setQueryEffect)) {
                next = {
                    ...next,
                    query: eff.value.query,
                    caseSensitive: eff.value.caseSensitive ?? next.caseSensitive,
                    wholeWord: eff.value.wholeWord ?? next.wholeWord,
                    regex: eff.value.regex ?? next.regex,
                }
                queryChanged = true
            }
            else if (eff.is(setReplacementEffect))
                next = { ...next, replacement: eff.value }
            else if (eff.is(setOpenEffect))
                next = { ...next, open: eff.value, replaceOpen: eff.value ? next.replaceOpen : false }
            else if (eff.is(setReplaceOpenEffect))
                next = { ...next, replaceOpen: eff.value }
            else if (eff.is(setFindInSelectionEffect)) {
                next = {
                    ...next,
                    findInSelection: eff.value.on,
                    scopes: eff.value.scopes,
                }
                queryChanged = true
            }
            else if (eff.is(setPreserveCaseEffect))
                next = { ...next, preserveCase: eff.value }
            else if (eff.is(setLoopEffect))
                next = { ...next, loop: eff.value }
            else if (eff.is(setCurrentMatch))
                explicitCurrent = eff.value
            else if (eff.is(setFocusFindEffect))
                next = { ...next, focusSeq: next.focusSeq + 1, focusTarget: eff.value }
        }
        const flushed = tr.docChanged && tr.annotation(flushSearch) === true
        if (tr.effects.some(e => e.is(refreshSearchEffect))) queryChanged = true
        if (tr.docChanged && next.findInSelection) {
            next = {
                ...next,
                scopes: next.scopes.map(r => {
                    const from = tr.changes.mapPos(r.from, 1)
                    return { from, to: Math.max(from, tr.changes.mapPos(r.to, -1)) }
                }),
            }
            queryChanged = true
        }
        // research:打开、展开/收起替换、改条件、改文档(Monaco _onStateChanged / onDidChangeModelContent)
        const research = queryChanged || tr.docChanged || (next.open && !val.open) || next.replaceOpen !== val.replaceOpen
        if (research) {
            // 空查询没有命中:不为它把整篇文档切成字符串(10 万行每次编辑 2~3 ms)
            const matches = flushed || ((tr.docChanged || queryChanged) && !next.query) ? []
                : tr.docChanged || queryChanged
                // 分词表只取决于语言数据,startState 的就是新 state 的(之前改文档时传 null,整词判断被跳过)
                ? computeMatches((tr.docChanged ? tr.newDoc : tr.startState.doc).sliceString(0), next, tr.startState)
                : next.matches
            let currentMatch = matchPosition(matches, tr.newSelection.main)
            let highlighted = false
            if (explicitCurrent != null && matches.length) {
                // 跳转:选区就是目标命中;替换后命中可能多出来,按选区重新定位
                const s = tr.newSelection.main
                const at = matches[explicitCurrent]?.from === s.from && matches[explicitCurrent]?.to === s.to
                    ? explicitCurrent
                    : matches.findIndex(m => m.from === s.from && m.to === s.to)
                if (at >= 0) { currentMatch = at; highlighted = true }
            }
            next = { ...next, matches, currentMatch, highlighted }
        }
        else if (explicitCurrent != null) {
            next = {
                ...next,
                currentMatch: next.matches.length
                    ? Math.max(0, Math.min(explicitCurrent, next.matches.length - 1))
                    : -1,
                highlighted: next.matches.length > 0,
            }
        }
        return next
    }
}

export function findMatches(state: EditorState, spec: SearchQuery): { from: number, to: number }[] {
    return findInText(state.sliceDoc(), spec, spec.wholeWord ? state.charCategorizer(0) : null)
}

function computeMatches(
    text: string,
    spec: {
        query: string
        caseSensitive: boolean
        wholeWord: boolean
        regex?: boolean
        findInSelection?: boolean
        scopes?: { from: number, to: number }[]
    },
    state: EditorState | null,
): { from: number, to: number }[] {
    const cat = spec.wholeWord && state ? state.charCategorizer(0) : null
    const one = (from: number, to: number | undefined) => findInText(text, {
        query: spec.query,
        caseSensitive: spec.caseSensitive,
        wholeWord: spec.wholeWord,
        regex: spec.regex,
        from,
        to,
    }, cat)
    if (!spec.findInSelection || !spec.scopes?.length) return one(0, undefined)
    const ranges = spec.scopes.map(r => searchRangeOf(text, r))
    if (ranges.length === 1) return one(ranges[0].from, ranges[0].to)
    // 多段范围:各段各搜一遍,按位置排序、重叠段里重复的命中只留一个(Monaco TextModel.findMatches 多 searchRanges)
    const all = ranges.flatMap(r => one(r.from, r.to)).sort((a, b) => a.from - b.from || a.to - b.to)
    return all.filter((m, i) => i === 0 || m.from !== all[i - 1].from || m.to !== all[i - 1].to)
}

// Monaco toggleSearchScope:多行段止于下一行行首 → 收到上一行末(存进状态的就是这个)
function tweakScopes(doc: EditorState['doc'], ranges: readonly { from: number, to: number }[]): { from: number, to: number }[] {
    return ranges.map(r => {
        const b = doc.lineAt(r.to)
        return r.to === b.from && b.number > doc.lineAt(r.from).number ? { from: r.from, to: b.from - 1 } : { from: r.from, to: r.to }
    })
}

// 非空选区 → 查找范围(Monaco start({updateSearchScope}):原样存,搜索时才规整)
function selectionScopes(state: EditorState): { from: number, to: number }[] {
    return state.selection.ranges.filter(r => !r.empty).map(r => ({ from: r.from, to: r.to }))
}

// Monaco FindModel.research 搜索时对范围的规整:多行段扩成整行(止于下一行行首的算到上一行末),单行段原样
function searchRangeOf(text: string, r: { from: number, to: number }): { from: number, to: number } {
    const nl = text.indexOf('\n', r.from)
    if (nl < 0 || nl >= r.to) return r
    const end = r.to > 0 && text[r.to - 1] === '\n' ? r.to - 1 : text.indexOf('\n', r.to)
    return { from: text.lastIndexOf('\n', r.from - 1) + 1, to: end < 0 ? text.length : end }
}

// —— find 选项(IEditorFindOptions;默认值 = Monaco,经 core.getOption 读,运行时 updateOptions 换了立刻生效)——
interface FindOptions {
    cursorMoveOnType: boolean
    seedSearchStringFromSelection: 'never' | 'always' | 'selection'
    autoFindInSelection: 'never' | 'always' | 'multiline'
    addExtraSpaceOnTop: boolean
    loop: boolean
    findOnType: boolean
    history: 'never' | 'workspace'
    replaceHistory: 'never' | 'workspace'
}
function findOpts(state: EditorState): FindOptions {
    return (getOption(state, 'find') ?? {}) as FindOptions
}

// Monaco FindController._start 的 autoFindInSelection:'always' 每次打开 / 重开都把非空选区设成查找范围;
// 'multiline' 只有当前选区跨行才设;'never'(默认)不设。范围 = 所有非空选区(多光标 → 多段)
function autoScopeEffects(state: EditorState): StateEffect<any>[] {
    const mode = findOpts(state).autoFindInSelection
    if (mode !== 'always' && mode !== 'multiline') return []
    const main = state.selection.main
    if (mode === 'multiline' && state.doc.lineAt(main.from).number === state.doc.lineAt(main.to).number) return []
    const scopes = selectionScopes(state)
    return scopes.length ? [setFindInSelectionEffect.of({ on: true, scopes })] : []
}

// Monaco FindState.canNavigateForward / Back:loop 关着时,序号在最后 / 第一个就不能再往前 / 后走
// (命中数到 MATCHES_LIMIT 也照样环绕)。position 与 Monaco matchesPosition 同义(1 起,0 = 不在任何命中上)
function loopOf(state: EditorState, sf: SearchState): boolean {
    return sf.loop ?? findOpts(state).loop !== false
}

function canNavigate(state: EditorState, sf: SearchState, dir: 1 | -1): boolean {
    if (loopOf(state, sf) || sf.matches.length >= MATCHES_LIMIT) return true
    const position = sf.currentMatch + 1
    return dir > 0 ? position < sf.matches.length : position !== 1
}

/** Monaco FindReplaceState.canNavigateForward / canNavigateBack:当前查找会话还能不能往后 / 往前跳(find.loop 关着时看序号) */
export function canNavigateFind(state: EditorState, dir: 1 | -1): boolean {
    const sf = state.field(searchField, false)
    return !sf || canNavigate(state, sf, dir)
}

// Monaco getSelectionSearchString:非空选区短于 524288 → 选区文本;空选区 → 光标处的词(getWordAtPosition:
// 光标后不是词就看光标前,所以词尾也取得到)。'single' 时多行选区不取(多行走 find-in-selection),'multiple'(⌘E)照取
/** Monaco FindWidget._getAriaLabel:读屏听到的查找结果 */
function findAriaLabel(view: EditorView, label: string, sf: { query: string, matches: readonly { from: number }[], currentMatch: number }): string {
    if (label === 'No results') return sf.query === '' ? `${label} found` : `${label} found for '${sf.query}'`
    const m = sf.currentMatch >= 0 ? sf.matches[sf.currentMatch] : null
    if (!m) return `${label} found for '${sf.query}'`
    const line = view.state.doc.lineAt(m.from)
    return `${line.text}, ${label} found for '${sf.query}', at ${line.number}:${m.from - line.from + 1}`
}

const SEARCH_STRING_MAX_LENGTH = 524288

export function queryFromSelection(state: EditorState, multiple = false, nonEmptyOnly = false): string | null {
    const sel = state.selection.main
    if (!sel.empty) {
        if (sel.to - sel.from >= SEARCH_STRING_MAX_LENGTH) return null
        const text = state.sliceDoc(sel.from, sel.to)
        return !multiple && text.includes('\n') ? null : text
    }
    // seedSearchStringFromSelection: 'selection':空选区不取光标词(seedSearchStringFromNonEmptySelection)
    if (nonEmptyOnly) return null
    const line = state.doc.lineAt(sel.head)
    for (const pos of [sel.head, sel.head - 1]) {
        if (pos < line.from || pos >= line.to) continue
        const word = wordAt(state, pos)
        if (word && state.charCategorizer(word.from)(state.sliceDoc(word.from, word.from + 1)) === CharCategory.Word)
            return state.sliceDoc(word.from, word.to)
    }
    return null
}

function selectMatchSpec(m: { from: number, to: number }, idx: number) {
    return {
        selection: EditorSelection.range(m.from, m.to),
        effects: [setCurrentMatch.of(idx), revealMatchEffect.of(null)],
    }
}

// Monaco escapeRegExpCharacters
export function escapeRegExp(text: string): string {
    let out = ''
    for (const ch of text) out += '\\{}*+?|^$.[]()'.includes(ch) ? `\\${ch}` : ch
    return out
}

// seed 查询:regex 开着时转义(Monaco 'x.y' → 'x\.y')
// honorOption:按 find.seedSearchStringFromSelection('never' 不 seed;'selection' 只从非空选区 seed)。
// ⌘E(StartFindWithSelection)和 ⌘F3(SelectionMatchFind)在 Monaco 里不看这个选项
function seedQuery(state: EditorState, regex: boolean, multiple = false, honorOption = true): string | null {
    const mode = honorOption ? findOpts(state).seedSearchStringFromSelection : 'always'
    if (mode === 'never') return null
    const q = queryFromSelection(state, multiple, mode === 'selection')
    return q !== null && regex ? escapeRegExp(q) : q
}

// 打开不动选区(Monaco moveCursor=false);已开着替换则保持。reopen 无 seed:保留上次 query,绝不强制清空
export const openSearch: StateCommand = ({ state, dispatch }) => {
    const sf = state.field(searchField, false)
    const seeded = seedQuery(state, sf?.regex ?? false)
    dispatch(state.update({
        effects: [
            setOpenEffect.of(true),
            setFocusFindEffect.of('find'),
            ...(seeded !== null ? [setQueryEffect.of({ query: seeded })] : []),
            ...autoScopeEffects(state),
        ],
    }))
    return true
}

/** Monaco StartFindWithSelectionAction(Mac ⌘E):按选区 seed(多行选区也取),打开但焦点不动 */
export const findWithSelection: StateCommand = ({ state, dispatch }) => {
    const sf = state.field(searchField, false)
    if (!sf) return false
    const seeded = seedQuery(state, sf.regex, true, false)
    dispatch(state.update({
        effects: [setOpenEffect.of(true), ...(seeded !== null ? [setQueryEffect.of({ query: seeded })] : []), ...autoScopeEffects(state)],
    }))
    return true
}

// Monaco StartFindReplaceAction:只读编辑器不开;只从单行非空选区 seed(空选区不取光标词);
// seed 了或焦点本在查找框 → 焦点进替换框,否则进查找框(查询还空着,先填它)
export function startReplace(findInputFocused: boolean): StateCommand {
    return ({ state, dispatch }) => {
        if (state.readOnly) return false
        const sf = state.field(searchField, false)
        const sel = state.selection.main
        const fromSelection = !findInputFocused && !sel.empty && !state.sliceDoc(sel.from, sel.to).includes('\n')
            && findOpts(state).seedSearchStringFromSelection !== 'never'
        const seeded = fromSelection ? seedQuery(state, sf?.regex ?? false) : null
        dispatch(state.update({
            effects: [
                setOpenEffect.of(true),
                setReplaceOpenEffect.of(true),
                setFocusFindEffect.of(findInputFocused || fromSelection ? 'replace' : 'find'),
                ...(seeded !== null ? [setQueryEffect.of({ query: seeded })] : []),
                ...autoScopeEffects(state),
            ],
        }))
        return true
    }
}

export const openSearchReplace: StateCommand = startReplace(false)

// Monaco closeFindWidget:同时清掉选区内查找范围
export const closeSearch: StateCommand = ({ state, dispatch }) => {
    const sf = state.field(searchField, false)
    if (!sf?.open) return false
    dispatch(state.update({
        effects: [
            setOpenEffect.of(false),
            ...(sf.findInSelection ? [setFindInSelectionEffect.of({ on: false, scopes: [] })] : []),
        ],
    }))
    return true
}

export const toggleSearchReplace: StateCommand = ({ state, dispatch }) => {
    const sf = state.field(searchField, false)
    if (!sf?.open || state.readOnly) return false
    dispatch(state.update({ effects: setReplaceOpenEffect.of(!sf.replaceOpen) }))
    return true
}

export function setSearchQuery(query: string, opts?: {
    caseSensitive?: boolean
    wholeWord?: boolean
    regex?: boolean
    /** false:只改条件、重算计数,不移选区(Monaco 快捷键切开关)。默认 true(并受 find.cursorMoveOnType 约束) */
    moveCursor?: boolean
}): StateCommand {
    return ({ state, dispatch }) => {
        const sf = state.field(searchField, false)
        const caseSensitive = opts?.caseSensitive ?? sf?.caseSensitive ?? false
        const wholeWord = opts?.wholeWord ?? sf?.wholeWord ?? false
        const regex = opts?.regex ?? sf?.regex ?? false
        const findInSelection = sf?.findInSelection ?? false
        const matches = computeMatches(state.sliceDoc(), {
            query, caseSensitive, wholeWord, regex, findInSelection, scopes: sf?.scopes,
        }, state)
        const effects = [setQueryEffect.of({ query, caseSensitive, wholeWord, regex })]
        // find.cursorMoveOnType(默认 true):false 时边打字边找不挪光标(Monaco research:moveCursor && cursorMoveOnType)
        if (matches.length && opts?.moveCursor !== false && findOpts(state).cursorMoveOnType !== false) {
            // 从起点找(Monaco research → _moveToNextMatch(startPosition)):打 ^ 跳到 14 后再打 c,^c 回到 0
            const anchor = sf && sf.typeAnchor >= 0 && sf.typeAnchor <= state.doc.length ? sf.typeAnchor : -1
            const idx = matchIndexAt(matches, anchor >= 0 && anchor !== state.selection.main.head
                ? EditorSelection.cursor(anchor) : state.selection.main)
            dispatch(state.update({
                effects: [...effects, setCurrentMatch.of(idx), revealMatchEffect.of(null)],
                selection: EditorSelection.range(matches[idx].from, matches[idx].to),
            }))
        }
        else {
            dispatch(state.update({ effects }))
        }
        return true
    }
}

// —— 低层会话控制(Monaco FindReplaceState / FindModelBoundToEditorModel 对应的原子操作;宿主和兼容层用,
// 不 seed、不聚焦、不挪选区)——

/** 只开 / 关查找会话。关 = 面板收起并清掉选区内查找范围(同 closeFindWidget) */
export function setSearchOpen(open: boolean): StateCommand {
    return ({ state, dispatch }) => {
        const sf = state.field(searchField, false)
        if (!sf || sf.open === open) return !!sf
        dispatch(state.update({
            effects: [
                setOpenEffect.of(open),
                ...(!open && sf.findInSelection ? [setFindInSelectionEffect.of({ on: false, scopes: [] })] : []),
            ],
        }))
        return true
    }
}

/** 设 / 清选区内查找范围(Monaco searchScope)。多段;多行段按整行算(止于下一行行首的收到上一行末),单行段原样 */
export function setSearchScope(ranges: readonly { from: number, to: number }[] | null): StateCommand {
    return ({ state, dispatch }) => {
        if (!state.field(searchField, false)) return false
        dispatch(state.update({
            effects: setFindInSelectionEffect.of(ranges?.length
                ? { on: true, scopes: ranges.map(r => ({ from: r.from, to: r.to })) }
                : { on: false, scopes: [] }),
        }))
        return true
    }
}

/** Monaco IFindStartOptions(去掉剪贴板 / 动画:lite-monaco 没有对应物) */
export interface FindStartOptions {
    forceRevealReplace: boolean
    seedSearchStringFromSelection: 'none' | 'single' | 'multiple'
    seedSearchStringFromNonEmptySelection: boolean
    /** 打开后聚焦哪个输入框;'none' 不改焦点 */
    focus: 'none' | 'find' | 'replace'
    updateSearchScope: boolean
    loop: boolean
}

/**
 * Monaco CommonFindController._start:打开查找会话。
 *   seed 'single':选区(单行)/ 光标词 → 查询,regex 开着先转义;'multiple'(且不更新范围):多行选区也取,不转义;'none' 不动查询
 *   替换栏:forceRevealReplace 展开;否则查找框本来没开就收起,开着的保持
 *   updateSearchScope:有非空选区时,所有非空选区成为范围;全是空光标则范围不动
 *   loop:本会话的 find.loop
 */
export function startFind(opts: FindStartOptions): StateCommand {
    return ({ state, dispatch }) => {
        const sf = state.field(searchField, false)
        if (!sf) return false
        let seeded: string | null = null
        if (opts.seedSearchStringFromSelection === 'single') {
            seeded = queryFromSelection(state, false, opts.seedSearchStringFromNonEmptySelection)
            if (seeded !== null && seeded !== '' && sf.regex) seeded = escapeRegExp(seeded)
        } else if (opts.seedSearchStringFromSelection === 'multiple' && !opts.updateSearchScope) {
            seeded = queryFromSelection(state, true)
        }
        const scopes = opts.updateSearchScope ? selectionScopes(state) : []
        dispatch(state.update({
            effects: [
                setOpenEffect.of(true),
                setReplaceOpenEffect.of(opts.forceRevealReplace || (sf.open && sf.replaceOpen)),
                setLoopEffect.of(opts.loop),
                ...(seeded ? [setQueryEffect.of({ query: seeded })] : []),
                ...(scopes.length ? [setFindInSelectionEffect.of({ on: true, scopes })] : []),
                ...(opts.focus !== 'none' ? [setFocusFindEffect.of(opts.focus)] : []),
            ],
        }))
        return true
    }
}

/** 本会话的 find.loop(Monaco FindReplaceState.loop);null = 回到 find.loop 选项 */
export function setSearchLoop(loop: boolean | null): StateCommand {
    return ({ state, dispatch }) => {
        if (!state.field(searchField, false)) return false
        dispatch(state.update({ effects: setLoopEffect.of(loop) }))
        return true
    }
}

/** 直接设 preserveCase(toggleFindPreserveCase 只能翻) */
export function setSearchPreserveCase(on: boolean): StateCommand {
    return ({ state, dispatch }) => {
        if (!state.field(searchField, false)) return false
        dispatch(state.update({ effects: setPreserveCaseEffect.of(on) }))
        return true
    }
}

export function setReplacement(replacement: string): StateCommand {
    return ({ state, dispatch }) => {
        dispatch(state.update({ effects: setReplacementEffect.of(replacement) }))
        return true
    }
}

// Monaco MatchFindAction:查找框开着就只跳(查询空则什么都不做);关着 → 打开(不抢焦点),查询空则从光标词 seed。
// fromSelection = SelectionMatchFindAction(⌘F3 / ⇧⌘F3):先拿选区 / 光标词当查询(单行),再跳
function moveToMatch(dir: 1 | -1, fromSelection = false): StateCommand {
    return ({ state, dispatch }) => {
        const sf = state.field(searchField, false)
        if (!sf) return false
        let query = sf.query
        if (fromSelection) query = seedQuery(state, sf.regex) || query
        else if (!query && !sf.open) query = seedQuery(state, sf.regex) ?? ''
        if (!query) {
            if (sf.open) return true
            // 没词可 seed(空行 / 多行选区):Monaco 只把空查找框打开,不抢焦点、不动光标(g2/mfind4.ts)
            dispatch(state.update({ effects: setOpenEffect.of(true) }))
            return true
        }
        const effects = [
            ...(sf.open ? [] : [setOpenEffect.of(true), ...autoScopeEffects(state)]),
            ...(query !== sf.query ? [setQueryEffect.of({ query })] : []),
        ]
        const matches = query === sf.query ? sf.matches : computeMatches(state.sliceDoc(), { ...sf, query }, state)
        // 没命中:打开了查找框算处理过;什么都没变返 false(按键穿透)
        if (!matches.length) {
            if (!effects.length) return false
            dispatch(state.update({ effects }))
            return true
        }
        const sel = state.selection.main
        let go = dir > 0 ? nextMatchIndex(matches, sel) : prevMatchIndex(matches, sel)
        // find.loop 关着且已在最后 / 第一个:不环绕,重新选中最后 / 第一个(Monaco _moveToNextMatch 的 !canNavigateForward 分支)
        if (query === sf.query && !canNavigate(state, sf, dir)) go = dir > 0 ? matches.length - 1 : 0
        const spec = selectMatchSpec(matches[go], go)
        dispatch(state.update({ ...spec, effects: [...effects, ...spec.effects] }))
        return true
    }
}

export const findNext: StateCommand = moveToMatch(1)
export const findPrev: StateCommand = moveToMatch(-1)
/** Monaco editor.action.previousMatchFindAction(⌘⇧G / Shift+F3) */
export const findPrevious: StateCommand = findPrev
/** Monaco editor.action.nextSelectionMatchFindAction / previousSelectionMatchFindAction(⌘F3 / ⇧⌘F3) */
export const findNextSelection: StateCommand = moveToMatch(1, true)
export const findPrevSelection: StateCommand = moveToMatch(-1, true)

// Monaco _getReplacePattern:正则时解析替换串(\n、$1、\u…),否则字面;preserveCase 只对字面串生效
function replacementFor(sf: SearchState, text: string, from: number, to: number): string {
    if (sf.regex)
        return expandRegexReplacement(text, sf.query, sf.caseSensitive, from, to, sf.replacement, sf.preserveCase)
    return sf.preserveCase ? replaceWithCasePreserved(text.slice(from, to), sf.replacement) : sf.replacement
}

// Monaco FindModel.replace:从选区起点找下一个命中;选区正好是它才替换,否则只选中它
export const replaceNext: StateCommand = ({ state, dispatch }) => {
    const sf = state.field(searchField, false)
    if (!sf || !sf.matches.length || state.readOnly) return false
    const sel = state.selection.main
    const cur = nextMatchIndex(sf.matches, { from: sel.from, to: sel.from })
    const atStart = sf.matches.findIndex(m => m.from === sel.from && m.to === sel.to)
    if (atStart < 0) {
        dispatch(state.update(selectMatchSpec(sf.matches[cur], cur)))
        return true
    }
    const m = sf.matches[atStart]
    const insert = replacementFor(sf, state.sliceDoc(), m.from, m.to)
    const delta = insert.length - (m.to - m.from)
    const after = m.from + insert.length
    // 替换后剩余命中(位置平移),从替换段末尾找下一个
    const rest = sf.matches
        .filter((_, i) => i !== atStart)
        .map(h => h.from >= m.to ? { from: h.from + delta, to: h.to + delta } : h)
    // find.loop 关着:替换完后面已没有命中就不绕回开头(Monaco research(true) → canNavigateForward 为假)
    const noWrap = !loopOf(state, sf) && sf.matches.length < MATCHES_LIMIT && !rest.some(h => h.from >= after)
    if (rest.length && !noWrap) {
        const ni = nextMatchIndex(rest, { from: after, to: after })
        const nm = rest[ni]
        // 选中并高亮下一个(Monaco research(true) → _moveToNextMatch);序号由 field 按选区重新定位
        dispatch(state.update({
            changes: { from: m.from, to: m.to, insert },
            selection: EditorSelection.range(nm.from, nm.to),
            effects: [setCurrentMatch.of(ni), revealMatchEffect.of(null)],
            userEvent: 'input.replace',
        }))
    }
    else {
        dispatch(state.update({
            changes: { from: m.from, to: m.to, insert },
            selection: EditorSelection.cursor(after),
            userEvent: 'input.replace',
            scrollIntoView: true,
        }))
    }
    return true
}

export const replaceAll: StateCommand = ({ state, dispatch }) => {
    const sf = state.field(searchField, false)
    if (!sf || !sf.matches.length || state.readOnly) return false
    const text = state.sliceDoc()
    const changes = sf.matches.map(m => ({
        from: m.from,
        to: m.to,
        insert: replacementFor(sf, text, m.from, m.to),
    }))
    // Monaco ReplaceAllCommand:相接的改动并成一个,只跟踪主选区(多光标收成一个)。非空选区 NeverGrowsWhenTypingAtEdges
    // (起点粘后、终点粘前:aa→aaa 后选区仍是 0–2);空光标在行尾粘前,否则粘后。改动从后往前逐个作用
    const ops: { from: number, to: number, n: number }[] = []
    for (const c of changes) {
        const last = ops[ops.length - 1]
        if (last && last.to === c.from) { last.to = c.to; last.n += c.insert.length }
        else ops.push({ from: c.from, to: c.to, n: c.insert.length })
    }
    const main = state.selection.main
    const track = (p: number, stickPrev: boolean) => {
        for (let i = ops.length - 1; i >= 0; i--) p = acceptEdit(p, stickPrev, ops[i].from, ops[i].to, ops[i].n)
        return p
    }
    const atEol = main.empty && main.head === state.doc.lineAt(main.head).to
    const from = track(main.from, main.empty && atEol)
    const to = Math.max(from, track(main.to, main.empty ? atEol : true))
    dispatch(state.update({
        changes,
        selection: main.anchor <= main.head ? EditorSelection.range(from, to) : EditorSelection.range(to, from),
        userEvent: 'input.replace.all',
    }))
    return true
}

export const toggleFindCaseSensitive: StateCommand = ({ state, dispatch }) => {
    const sf = state.field(searchField, false)
    if (!sf) return false
    return setSearchQuery(sf.query, {
        caseSensitive: !sf.caseSensitive,
        wholeWord: sf.wholeWord,
        regex: sf.regex,
        moveCursor: false,
    })({ state, dispatch })
}

export const toggleFindWholeWord: StateCommand = ({ state, dispatch }) => {
    const sf = state.field(searchField, false)
    if (!sf) return false
    return setSearchQuery(sf.query, {
        caseSensitive: sf.caseSensitive,
        wholeWord: !sf.wholeWord,
        regex: sf.regex,
        moveCursor: false,
    })({ state, dispatch })
}

export const toggleFindRegex: StateCommand = ({ state, dispatch }) => {
    const sf = state.field(searchField, false)
    if (!sf) return false
    return setSearchQuery(sf.query, {
        caseSensitive: sf.caseSensitive,
        wholeWord: sf.wholeWord,
        regex: !sf.regex,
        moveCursor: false,
    })({ state, dispatch })
}

export const toggleFindInSelection: StateCommand = ({ state, dispatch }) => {
    const sf = state.field(searchField, false)
    if (!sf) return false
    if (sf.findInSelection) {
        dispatch(state.update({ effects: setFindInSelectionEffect.of({ on: false, scopes: [] }) }))
        return true
    }
    // Monaco toggleSearchScope:所有非空选区都是范围;多行段止于行首 → 收到上一行末
    const scopes = tweakScopes(state.doc, selectionScopes(state))
    if (!scopes.length) return false
    dispatch(state.update({ effects: setFindInSelectionEffect.of({ on: true, scopes }) }))
    return true
}

// Monaco togglePreserveCase(⌥⌘P / Alt+P):只翻开关,和点按钮一样
export const toggleFindPreserveCase: StateCommand = ({ state, dispatch }) => {
    const sf = state.field(searchField, false)
    if (!sf) return false
    dispatch(state.update({ effects: setPreserveCaseEffect.of(!sf.preserveCase) }))
    return true
}

// 查找相关的编辑器键位(Monaco find contrib kbOpts):开关 Mac ⌥⌘C/W/R/L/P、Win/Linux Alt+C/W/R/L/P(when editorFocus);
// 查找框开着时 Replace All = ⌥⌘Enter / Ctrl+Alt+Enter,Replace One = ⇧⌘1 / Ctrl+Shift+1(when findWidgetVisible)。
export function findToggleBindings(mac: boolean): { key: string, run: StateCommand }[] {
    const m = mac ? 'Mod-Alt-' : 'Alt-'
    const ifOpen = (cmd: StateCommand): StateCommand => t => t.state.field(searchField, false)?.open ? cmd(t) : false
    return [
        { key: `${m}c`, run: toggleFindCaseSensitive },
        { key: `${m}w`, run: toggleFindWholeWord },
        { key: `${m}r`, run: toggleFindRegex },
        { key: `${m}l`, run: toggleFindInSelection },
        { key: `${m}p`, run: toggleFindPreserveCase },
        { key: mac ? 'Mod-Alt-Enter' : 'Ctrl-Alt-Enter', run: ifOpen(replaceAll) },
        { key: 'Mod-Shift-1', run: ifOpen(replaceNext) },
        // Monaco CloseFindWidgetCommand 的 secondary(when findWidgetVisible)
        { key: 'Shift-Escape', run: closeSearch },
        { key: 'Mod-F3', run: findNextSelection },
        { key: 'Mod-Shift-F3', run: findPrevSelection },
        ...(mac ? [{ key: 'Mod-e', run: findWithSelection }] : []),
    ]
}

export const selectAllSearchMatches: StateCommand = ({ state, dispatch }) => {
    const sf = state.field(searchField, false)
    if (!sf || !sf.matches.length) return false
    const ranges = sf.matches.map(m => EditorSelection.range(m.from, m.to))
    // Monaco selectAllMatches:选区正好是某个命中时它保持主选区(Cmd+Shift+L 不换主光标)
    const sel = state.selection.main
    const main = Math.max(0, sf.matches.findIndex(m => m.from === sel.from && m.to === sel.to))
    dispatch(state.update({
        selection: EditorSelection.create(ranges, main),
        scrollIntoView: true,
    }))
    return true
}

// —— decorations ——

const searchMatchMark = Decoration.mark({ class: 'cm-searchMatch' })
const searchMatchSelectedMark = Decoration.mark({ class: 'cm-searchMatch cm-searchMatch-selected' })

export function searchDecorations(state: EditorState, view?: EditorView): DecorationSet {
    const sf = state.field(searchField, false)
    if (!sf || !sf.open || !sf.matches.length) return RangeSet.empty as unknown as DecorationSet
    const builder = new RangeSetBuilder<Decoration>()
    const lo = view ? Math.max(0, view.viewport.from) : 0
    const hi = view ? Math.min(state.doc.length, view.viewport.to) : state.doc.length
    const sorted = view
        ? sf.matches.filter(m => m.to >= lo && m.from <= hi).sort((a, b) => a.from - b.from || a.to - b.to)
        : [...sf.matches].sort((a, b) => a.from - b.from || a.to - b.to)
    const cur = sf.highlighted ? sf.currentMatch : -1
    const curHit = cur >= 0 ? sf.matches[cur] : null
    for (const m of sorted) {
        if (m.from === m.to) continue // 空匹配(^ $ \b …)没有可画的宽度;Monaco 同样不显示
        const selected = curHit != null && m.from === curHit.from && m.to === curHit.to
        builder.add(m.from, m.to, selected ? searchMatchSelectedMark : searchMatchMark)
    }
    return builder.finish()
}

// —— Monaco 风格查找控件 ——

const FIND_WIDGET_WIDTH = 419
const MATCHES_COUNT_WIDTH = 69
// Monaco MATCHES_LIMIT:计数显示到 19999+
export const MATCHES_LIMIT = 19999
// Monaco FindController 把四个开关存进 storage(StorageScope.WORKSPACE),新建的编辑器读回来;这里存在模块内存
export const rememberedFlags = { caseSensitive: false, wholeWord: false, regex: false, preserveCase: false }

function el<K extends keyof HTMLElementTagNameMap>(
    doc: Document, tag: K, cls?: string, attrs?: Record<string, string>,
): HTMLElementTagNameMap[K] {
    const n = doc.createElement(tag)
    if (cls) n.className = cls
    if (attrs) for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v)
    return n
}

// find.history / find.replaceHistory = 'workspace' 的共享历史(同页所有编辑器一份)
const SHARED_FIND_HISTORY = { items: [] as string[] }
const SHARED_REPLACE_HISTORY = { items: [] as string[] }
/** 清掉共享的查找 / 替换历史(同 Monaco 清 workspace storage;主要给测试隔离用) */
export function clearFindHistory(): void {
    SHARED_FIND_HISTORY.items = []
    SHARED_REPLACE_HISTORY.items = []
}

export function searchPanel(view: EditorView): () => void {
    let root: HTMLElement | null = null
    let findInput: HTMLTextAreaElement | null = null
    let replaceInput: HTMLTextAreaElement | null = null
    let findBox: HTMLElement | null = null
    let replaceBox: HTMLElement | null = null
    let message: HTMLElement | null = null
    let caseBtn: HTMLElement | null = null
    let wordBtn: HTMLElement | null = null
    let regexBtn: HTMLElement | null = null
    let selectionBtn: HTMLElement | null = null
    let preserveBtn: HTMLElement | null = null
    let countEl: HTMLElement | null = null
    let prevBtn: HTMLElement | null = null
    let nextBtn: HTMLElement | null = null
    let replaceBtn: HTMLElement | null = null
    let replaceAllBtn: HTMLElement | null = null
    let toggleBtn: HTMLElement | null = null
    let lastSpoken = ''
    let replacePart: HTMLElement | null = null
    let syncing = false
    // 跨 remove 保留:关掉再由 ⌘G 重建时不能把旧的 focusSeq 当成新的聚焦请求
    let lastFocusSeq = view.state.field(searchField, false)?.focusSeq ?? 0
    // 正在淡出(去了 visible、200ms 后才删):窗口期内重开要把 visible 加回来
    let closing = false
    // Monaco HistoryInputBox + HistoryNavigator(上限 100):按加入顺序去重,重复的挪到最新;加入后游标回到最新之后。
    // 历史属于查找框(跟着编辑器实例,关了再开还在),不进 state
    // store:历史条目;find.history / find.replaceHistory 为 'workspace' 时所有编辑器共用一份(Monaco 存 workspace storage,
    // standalone 里是进程内存储 → 同页共享、不落盘),'never' 时这个查找框自己一份。游标(index)各框自己的
    const inputHistory = (store: { items: string[] }) => {
        let index = 0
        const current = () => index >= 0 && index < store.items.length ? store.items[index] : null
        const next = () => { index = Math.min(index + 1, store.items.length); return current() }
        const previous = () => {
            if (index === 0) return null
            index = Math.max(index - 1, -1)
            return current()
        }
        const first = () => { index = 0; return current() }
        const add = (value: string) => {
            if (!value) return
            let cur = current()
            if (!cur) { index = store.items.length - 1; cur = current(); next() }
            if (value === cur) return
            store.items = store.items.filter(x => x !== value)
            store.items.push(value)
            if (store.items.length > 100) store.items = store.items.slice(store.items.length - 100)
            index = store.items.length
        }
        return {
            add,
            // ↓:越过最新一条清空
            next: (value: string) => {
                if (!store.items.includes(value)) add(value)
                let n = next()
                if (n && n === value) n = next()
                return n ?? ''
            },
            // ↑:到最早一条停住
            previous: (value: string) => {
                if (!store.items.includes(value)) add(value)
                let p = previous() || first()
                if (p && p === value) p = previous() || first()
                return p || value
            },
        }
    }
    const localHistory = { find: inputHistory({ items: [] }), replace: inputHistory({ items: [] }) }
    const sharedHistory = { find: inputHistory(SHARED_FIND_HISTORY), replace: inputHistory(SHARED_REPLACE_HISTORY) }
    const findHistoryFor = (kind: 'find' | 'replace') => {
        const o = findOpts(view.state)
        return (kind === 'find' ? o.history : o.replaceHistory) === 'never' ? localHistory[kind] : sharedHistory[kind]
    }
    // find.findOnType(默认 true):false 时打字不搜,回车才把查找框的文字提交(Monaco findWidget:input onDidChange / Enter keydown)
    const findOnType = () => findOpts(view.state).findOnType !== false
    // Monaco findWidget._delayedUpdateHistory:查询或选项变了停 500ms 才记,查找框和替换框各记各的非空值
    let historyTimer = 0
    const delayedUpdateHistory = () => {
        window.clearTimeout(historyTimer)
        historyTimer = window.setTimeout(() => {
            const sf = view.state.field(searchField, false)
            if (sf?.query) findHistoryFor('find').add(sf.query)
            if (sf?.replacement) findHistoryFor('replace').add(sf.replacement)
        }, 500)
    }

    // Monaco findWidget 顶部 view zone:高 = 查找框高(33 / 展开替换 62),出现 / 变高时 scrollTop 跟着加,
    // 收起时减回,所以打开查找框时可见的行不动
    // 刚出现时选区在框底下(Monaco _reveal):选区起止有一端在框左缘右边 → 不加 scrollTop,让内容整体下移露出来。
    // Monaco 源码里多行选区也不加,但对照页实测多行照样加(fix2/f7/probe-zone.ts),按实测
    let zone = 0
    const layoutZone = (height: number) => {
        // find.addExtraSpaceOnTop(默认 true):false 时不留顶部空位,查找框盖在第一行上(Monaco _layoutViewZone/_showViewZone 直接返回)
        const h = getOption(view.state, 'find')?.addExtraSpaceOnTop === false ? 0 : height
        if (h === zone) return
        let adjust = true
        const sel = view.state.selection.main
        if (!zone && h && root) {
            const top = view.scrollDOM.getBoundingClientRect().top
            const a = view.caretCoords(sel.from)
            if (a && a.top - top < h) {
                const left = root.getBoundingClientRect().left
                const b = view.caretCoords(sel.to)
                if (a.left > left || (b && b.left > left)) adjust = false
            }
        }
        view.setViewZone('find', h ? { afterLine: 0, height: h } : null)
        if (adjust) view.scrollDOM.scrollTop += h - zone
        zone = h
    }
    // Monaco HistoryInputBox flexibleHeight:内容行数 × 19 + 上下 2,最高 118
    const inputHeight = (value: string) => {
        let lines = 1
        for (let i = value.indexOf('\n'); i >= 0; i = value.indexOf('\n', i + 1)) lines++
        return Math.min(118, 4 + 19 * lines)
    }
    // 宽度拖过 sash(Monaco _resized):比初始宽时窄编辑器的三档收缩不再生效
    let resized = false

    const remove = () => {
        if (root) { root.remove(); root = null }
        message?.remove()
        findInput = replaceInput = findBox = replaceBox = message = null
        resized = false
        caseBtn = wordBtn = regexBtn = selectionBtn = preserveBtn = null
        countEl = prevBtn = nextBtn = replaceBtn = replaceAllBtn = toggleBtn = replacePart = null
        closing = false
    }

    const run = (cmd: StateCommand) => {
        cmd({ state: view.state, dispatch: tr => view.dispatch(tr) })
    }

    // withText:false = 只提交三个开关(查询串沿用 state 里的,findOnType 关着时输入框里还没回车的文字不算)
    const commitQuery = (withText = true) => {
        if (!findInput || !caseBtn || !wordBtn || !regexBtn) return
        const sf = view.state.field(searchField, false)
        const q = withText || !sf ? findInput.value : sf.query
        const caseSensitive = caseBtn.classList.contains('checked')
        const wholeWord = wordBtn.classList.contains('checked')
        const regex = regexBtn.classList.contains('checked')
        if (sf && sf.query === q && sf.caseSensitive === caseSensitive
            && sf.wholeWord === wholeWord && sf.regex === regex) return
        setSearchQuery(q, { caseSensitive, wholeWord, regex })({
            state: view.state, dispatch: tr => view.dispatch(tr),
        })
        delayedUpdateHistory()
    }

    const commitReplace = () => {
        if (!replaceInput) return
        const sf = view.state.field(searchField, false)
        if (sf && sf.replacement === replaceInput.value) return
        setReplacement(replaceInput.value)({ state: view.state, dispatch: tr => view.dispatch(tr) })
    }

    const showHistory = (input: HTMLTextAreaElement, up: boolean) => {
        const h = findHistoryFor(input === findInput ? 'find' : 'replace')
        input.value = up ? h.previous(input.value) : h.next(input.value)
        if (input === findInput) { if (findOnType()) commitQuery() }
        else commitReplace()
    }

    const mkIconBtn = (doc: Document, cls: string, codicon: string, aria: string, name: string, onClick: () => void) => {
        const b = el(doc, 'div', `${cls} codicon codicon-${codicon}`, {
            role: 'button', 'aria-label': aria, name, tabindex: '0',
        })
        b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); onClick() })
        b.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() }
        })
        return b
    }

    const mkToggle = (
        doc: Document, codicon: string, aria: string, name: string,
        onFlip: (checked: boolean) => void,
    ) => {
        const b = el(doc, 'div', `cm-find-toggle-opt codicon codicon-${codicon}`, {
            role: 'checkbox', 'aria-label': aria, 'aria-checked': 'false', name, tabindex: '0',
        })
        const flip = () => {
            b.classList.toggle('checked')
            const on = b.classList.contains('checked')
            b.setAttribute('aria-checked', on ? 'true' : 'false')
            onFlip(on)
        }
        // Monaco Toggle:aria-disabled 时点击无效,键盘 Space / Enter 照样翻
        b.addEventListener('click', e => { if (b.getAttribute('aria-disabled') !== 'true') { e.preventDefault(); flip() } })
        b.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip() }
        })
        return b
    }

    const setChecked = (node: HTMLElement | null, on: boolean) => {
        if (!node) return
        node.classList.toggle('checked', on)
        node.setAttribute('aria-checked', on ? 'true' : 'false')
    }

    const setToggleIcon = (node: HTMLElement, codicon: string) => {
        for (const c of [...node.classList])
            if (c.startsWith('codicon-') && c !== 'codicon') node.classList.remove(c)
        node.classList.add(`codicon-${codicon}`)
    }

    const mount = () => {
        if (root) {
            if (closing) { closing = false; root.classList.add('visible') }
            return
        }
        const doc = view.dom.ownerDocument
        root = el(doc, 'div', 'cm-find-widget', { role: 'dialog', 'aria-label': 'Find / Replace' })

        toggleBtn = mkIconBtn(doc, 'cm-find-toggle-replace', 'chevron-right', 'Toggle Replace', 'toggle-replace', () => {
            run(toggleSearchReplace)
        })
        toggleBtn.setAttribute('aria-expanded', 'false')

        const findPart = el(doc, 'div', 'cm-find-part')
        // Monaco 的查找 / 替换框是自动增高的 textarea(flexibleHeight + flexibleWidth:不折行)
        const textAttrs = { rows: '1', wrap: 'off', autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false' }
        findBox = el(doc, 'div', 'cm-find-input-box')
        findInput = el(doc, 'textarea', 'cm-find-input', {
            ...textAttrs, placeholder: 'Find', 'aria-label': 'Find', 'main-field': 'true',
        })
        findInput.addEventListener('input', () => {
            if (syncing || !findOnType()) return
            commitQuery()
        })
        // 非法正则的提示只在查找框有焦点时显示(Monaco InputBox onFocus / onBlur)
        findInput.addEventListener('focus', () => showMessage())
        findInput.addEventListener('blur', () => showMessage())
        const findToggles = el(doc, 'div', 'cm-find-input-toggles')
        // 按钮名里的键位照 Monaco findWidget(_keybindingLabelFor):Mac ⌥⌘C,Win/Linux Alt+C
        const kbMac = detectKeyOS(doc.defaultView?.navigator.platform ?? '') === 'mac'
        const tk = (k: string) => kbMac ? `⌥⌘${k}` : `Alt+${k}`
        caseBtn = mkToggle(doc, 'case-sensitive', `Match Case (${tk('C')})`, 'case', () => commitQuery(findOnType()))
        wordBtn = mkToggle(doc, 'whole-word', `Match Whole Word (${tk('W')})`, 'word', () => commitQuery(findOnType()))
        regexBtn = mkToggle(doc, 'regex', `Use Regular Expression (${tk('R')})`, 'regex', () => commitQuery(findOnType()))
        findToggles.append(caseBtn, wordBtn, regexBtn)
        findBox.append(findInput, findToggles)

        const findActions = el(doc, 'div', 'cm-find-actions')
        countEl = el(doc, 'div', 'cm-matches-count')
        prevBtn = mkIconBtn(doc, 'cm-find-btn prev', 'arrow-up', kbMac ? 'Previous Match (⇧Enter)' : 'Previous Match (Shift+Enter)', 'prev', () => {
            run(findPrev)
        })
        nextBtn = mkIconBtn(doc, 'cm-find-btn next', 'arrow-down', 'Next Match (Enter)', 'next', () => {
            run(findNext)
        })
        // 空选区开不了(toggleFindInSelection 返 false)→ 按 state 复原勾选
        selectionBtn = mkToggle(doc, 'selection', `Find in Selection (${tk('L')})`, 'selection', () => {
            run(toggleFindInSelection)
            setChecked(selectionBtn, !!view.state.field(searchField, false)?.findInSelection)
            delayedUpdateHistory()
        })
        selectionBtn.classList.add('cm-find-selection')
        findActions.append(countEl, prevBtn, nextBtn, selectionBtn)
        findPart.append(findBox, findActions)

        const closeBtn = mkIconBtn(doc, 'cm-find-close', 'close', 'Close (Escape)', 'close', () => {
            run(closeSearch)
            view.focus()
        })

        replacePart = el(doc, 'div', 'cm-replace-part')
        replaceBox = el(doc, 'div', 'cm-find-input-box cm-replace-input-box')
        replaceInput = el(doc, 'textarea', 'cm-find-input', { ...textAttrs, placeholder: 'Replace', 'aria-label': 'Replace' })
        replaceInput.addEventListener('input', () => {
            if (syncing) return
            commitReplace()
        })
        const replaceToggles = el(doc, 'div', 'cm-find-input-toggles')
        preserveBtn = mkToggle(doc, 'preserve-case', `Preserve Case (${tk('P')})`, 'preserve-case', (on) => {
            view.dispatch(view.state.update({ effects: setPreserveCaseEffect.of(on) }))
            delayedUpdateHistory()
        })
        replaceToggles.append(preserveBtn)
        replaceBox.append(replaceInput, replaceToggles)
        const replaceActions = el(doc, 'div', 'cm-replace-actions')
        replaceBtn = mkIconBtn(doc, 'cm-find-btn replace', 'replace', 'Replace (Enter)', 'replace', () => run(replaceNext))
        replaceAllBtn = mkIconBtn(doc, 'cm-find-btn replace-all', 'replace-all', kbMac ? 'Replace All (⌘Enter)' : 'Replace All (Ctrl+Alt+Enter)', 'replaceAll', () => run(replaceAll))
        replaceActions.append(replaceBtn, replaceAllBtn)
        replacePart.append(replaceBox, replaceActions)

        // Monaco 的宽度 sash(左缘 2px):往左拖加宽,不窄于初始宽、不超过 max-width;双击在最大化和初始宽之间切
        const sash = el(doc, 'div', 'cm-find-sash')
        sash.addEventListener('mousedown', e => {
            if (e.button !== 0 || !root) return
            e.preventDefault()
            const node = root
            const startX = e.clientX
            const original = node.offsetWidth
            const move = (ev: MouseEvent) => {
                resized = true
                const width = original + startX - ev.clientX
                if (width < FIND_WIDGET_WIDTH) return
                const max = Number.parseFloat(doc.defaultView?.getComputedStyle(node).maxWidth ?? '') || 0
                if (width > max) return
                node.style.width = `${width}px`
            }
            const up = () => {
                doc.removeEventListener('mousemove', move)
                doc.removeEventListener('mouseup', up)
            }
            doc.addEventListener('mousemove', move)
            doc.addEventListener('mouseup', up)
        })
        sash.addEventListener('dblclick', () => {
            if (!root) return
            const current = root.offsetWidth
            if (current < FIND_WIDGET_WIDTH) return
            let width = FIND_WIDGET_WIDTH
            if (!resized || current === FIND_WIDGET_WIDTH) {
                const right = Number.parseFloat(doc.defaultView?.getComputedStyle(root).right ?? '') || 0
                width = view.dom.clientWidth - right - 15
                resized = true
            }
            root.style.width = `${width}px`
        })

        root.append(toggleBtn, findPart, closeBtn, replacePart, sash)

        // Tab 次序(Monaco 实测):查找 → 替换 → 三个开关 → 上/下/选区内/关闭 → 替换栏按钮 → 展开按钮,首尾循环。
        // 只走看得见、没禁用的;焦点不出框。
        const tabOrder = (): HTMLElement[] => {
            const open = !!view.state.field(searchField, false)?.replaceOpen
            const list = [findInput, open ? replaceInput : null, caseBtn, wordBtn, regexBtn, prevBtn, nextBtn,
                selectionBtn, closeBtn, open ? preserveBtn : null, open ? replaceBtn : null, open ? replaceAllBtn : null, toggleBtn]
            return list.filter((n): n is HTMLElement => !!n && !n.classList.contains('disabled'))
        }

        root.addEventListener('keydown', e => {
            if (e.isComposing) return
            if (e.key === 'Escape') {
                e.preventDefault()
                e.stopPropagation()
                run(closeSearch)
                view.focus()
                return
            }
            // Replace All(Monaco editor.action.replaceAll,查找框 / 替换框里都生效):Mac ⌥⌘Enter,Win/Linux Ctrl+Alt+Enter
            if (e.key === 'Enter' && e.altKey && !e.shiftKey && (kbMac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey)) {
                e.preventDefault()
                e.stopPropagation()
                run(replaceAll)
                return
            }
            // Alt+Enter: 全选命中,焦点回编辑器
            if (e.key === 'Enter' && e.altKey && !e.ctrlKey && !e.metaKey) {
                e.preventDefault()
                e.stopPropagation()
                run(selectAllSearchMatches)
                view.focus()
                return
            }
            // ⌥⌘C/W/R/L/P(Win/Linux Alt+C/W/R/L/P):走命令(只改条件,不移光标 —— 与点按钮不同)
            if (e.altKey && !e.shiftKey && (kbMac ? e.metaKey && !e.ctrlKey : !e.metaKey && !e.ctrlKey)) {
                const cmd = ({ c: toggleFindCaseSensitive, w: toggleFindWholeWord, r: toggleFindRegex, l: toggleFindInSelection, p: toggleFindPreserveCase } as Record<string, StateCommand>)[e.code.startsWith('Key') ? e.code.slice(3).toLowerCase() : '']
                if (cmd) {
                    e.preventDefault()
                    e.stopPropagation()
                    run(cmd)
                    return
                }
            }
            // 框内 ⌥⌘F(Mac)/ Ctrl+H(Win/Linux):展开替换,焦点进替换框(Monaco findInputFocused 分支)
            if (kbMac ? e.metaKey && e.altKey && !e.ctrlKey && !e.shiftKey && e.code === 'KeyF'
                : e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && e.code === 'KeyH') {
                e.preventDefault()
                e.stopPropagation()
                run(startReplace(e.target === findInput))
                return
            }
            // 框内 ⌘F / Ctrl+F:同编辑器里一样按选区重新 seed 并全选查找框(Monaco StartFindAction 不看焦点)
            if ((kbMac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey) && !e.altKey && !e.shiftKey && e.code === 'KeyF') {
                e.preventDefault()
                e.stopPropagation()
                run(openSearch)
                return
            }
            // 框内 ⌃G(Mac)/ Ctrl+G(Win/Linux):Go to Line,同 Monaco(gotoLine 的 when 是 editorFocus,含查找框)
            const mod = e.metaKey || e.ctrlKey
            if (e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && e.code === 'KeyG') {
                e.preventDefault()
                e.stopPropagation()
                openGotoLine(view)
                return
            }
            // 框内 ⌘G / ⌘⇧G / F3 / ⇧F3 同样跳(焦点留在框里)
            if (e.key === 'F3' || (e.metaKey && !e.altKey && e.code === 'KeyG')) {
                e.preventDefault()
                e.stopPropagation()
                    run(e.shiftKey ? findPrev : findNext)
                return
            }
            if (e.key === 'Tab' && !mod && !e.altKey) {
                const order = tabOrder()
                const at = order.indexOf(e.target as HTMLElement)
                if (order.length && at >= 0) {
                    e.preventDefault()
                    e.stopPropagation()
                    // Monaco 在两个输入框间只 focus() 不 select():光标留在上次的位置
                    order[(at + (e.shiftKey ? -1 : 1) + order.length) % order.length].focus()
                }
                return
            }
            // ↑↓ / ⌥↑⌥↓ 历史(Monaco history.showPrevious / showNext)
            const historyInput = e.target === findInput ? findInput : e.target === replaceInput ? replaceInput : null
            // ⌘↓(Win/Linux Ctrl+↓):焦点回编辑器,这一键接着冒泡到编辑器的键位(Monaco:Mac 到文末,Win/Linux 下滚一行)
            if (e.key === 'ArrowDown' && historyInput && (kbMac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey) && !e.altKey && !e.shiftKey) {
                e.preventDefault()
                view.focus()
                view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', e))
                return
            }
            // ⌃Enter(Win/Linux Ctrl+Enter):框里插换行,查询变多行
            if (e.key === 'Enter' && historyInput && e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
                e.preventDefault()
                historyInput.setRangeText('\n', historyInput.selectionStart, historyInput.selectionEnd, 'end')
                if (historyInput === findInput) { if (findOnType()) commitQuery() }
                else commitReplace()
                return
            }
            if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.metaKey && !e.ctrlKey && !e.shiftKey && historyInput) {
                // 多行内容里光标不在首 / 末端:原生上下移(Monaco stopPropagationForMultiLineUpwards / Downwards)
                const up = e.key === 'ArrowUp'
                if (historyInput.value.includes('\n') && (up ? historyInput.selectionStart > 0 : historyInput.selectionEnd < historyInput.value.length)) return
                e.preventDefault()
                showHistory(historyInput, up)
                return
            }
            if (e.key === 'Enter' && e.target === findInput) {
                e.preventDefault()
                // findOnType 关着:回车先把框里的文字提交成查询(Monaco:state.change({searchString}, true) 再走 _onFindInputKeyDown 的下一处)
                if (!findOnType()) commitQuery()
                run(e.shiftKey ? findPrev : findNext)
                return
            }
            // 替换框:Enter 替换一个;Replace All 是 Mac ⌘Enter / ⌥⌘Enter、Win/Linux Ctrl+Alt+Enter
            if (e.key === 'Enter' && e.target === replaceInput) {
                e.preventDefault()
                if (kbMac ? e.metaKey : e.ctrlKey && e.altKey) run(replaceAll)
                else if (!e.metaKey && !e.ctrlKey) run(replaceNext)
            }
        })

        view.dom.appendChild(root)
        layout()
        requestAnimationFrame(() => { root?.classList.add('visible') })
    }

    // 窄编辑器(Monaco findWidget._onEditorLayout,实测见 /tmp/lc-hunt/f7/m-narrow.ts):
    //   right = 右侧让出的宽(minimap + 滚动条 + 边距);左边至少留 15px → maxWidth = W - right - 15
    //   419 + right ≥ W       → reduced(藏计数)
    //   419 + right - 69 ≥ W  → narrow(最宽 257)
    //   再窄 50               → collapsed(最宽 170,藏查找框里的三个开关)
    const layout = () => {
        if (!root) return
        const W = view.dom.clientWidth
        if (!W) return
        const win = view.dom.ownerDocument.defaultView
        const right = Number.parseFloat(win?.getComputedStyle(root).right ?? '') || 0
        if (resized && root.offsetWidth > FIND_WIDGET_WIDTH) {
            root.style.maxWidth = `${Math.max(0, W - right - 15)}px`
            return
        }
        const reduced = FIND_WIDGET_WIDTH + right >= W
        const narrow = FIND_WIDGET_WIDTH + right - MATCHES_COUNT_WIDTH >= W
        const collapsed = FIND_WIDGET_WIDTH + right - MATCHES_COUNT_WIDTH >= W + 50
        root.classList.toggle('reduced-find-widget', reduced)
        root.classList.toggle('narrow-find-widget', narrow)
        root.classList.toggle('collapsed-find-widget', collapsed)
        if (!narrow && !collapsed) root.style.maxWidth = `${Math.max(0, W - right - 15)}px`
    }

    // 非法正则(Monaco findInput validation:new RegExp(value, 'gu') 抛错)→ 框红边 + 框下提示
    let invalidFor = ''
    let invalidMsg: string | null = null
    const regexError = (q: string) => {
        if (q !== invalidFor) {
            invalidFor = q
            try { new RegExp(q, 'gu'); invalidMsg = null }
            catch (err) { invalidMsg = err instanceof Error ? err.message : String(err) }
        }
        return invalidMsg
    }
    const showMessage = () => {
        const sf = view.state.field(searchField, false)
        const text = sf?.open && sf.regex && sf.query ? regexError(sf.query) : null
        const doc = view.dom.ownerDocument
        if (!text || !findBox || doc.activeElement !== findInput) { message?.remove(); message = null; return }
        if (!message) message = el(doc, 'div', 'cm-find-message', { role: 'alert' })
        message.textContent = text
        const br = findBox.getBoundingClientRect()
        const dr = view.dom.getBoundingClientRect()
        message.style.cssText = `left:${br.left - dr.left}px;top:${br.bottom - dr.top}px;width:${br.width}px`
        if (!message.isConnected) view.dom.appendChild(message)
    }

    const syncFromState = () => {
        const sf = view.state.field(searchField, false)
        if (sf) {
            rememberedFlags.caseSensitive = sf.caseSensitive
            rememberedFlags.wholeWord = sf.wholeWord
            rememberedFlags.regex = sf.regex
            rememberedFlags.preserveCase = sf.preserveCase
        }
        if (!sf?.open) {
            layoutZone(0)
            if (root && !closing) {
                closing = true
                root.classList.remove('visible')
                const node = root
                window.setTimeout(() => {
                    if (root === node && !view.state.field(searchField, false)?.open) remove()
                }, 200)
            }
            return
        }
        mount()
        if (!root || !findInput || !replaceInput || !caseBtn || !wordBtn || !countEl) return
        syncing = true
        if (findInput.value !== sf.query) findInput.value = sf.query
        if (replaceInput.value !== sf.replacement) replaceInput.value = sf.replacement
        setChecked(caseBtn, sf.caseSensitive)
        setChecked(wordBtn, sf.wholeWord)
        setChecked(regexBtn, sf.regex)
        setChecked(selectionBtn, sf.findInSelection)
        setChecked(preserveBtn, sf.preserveCase)

        root.classList.toggle('replaceToggled', sf.replaceOpen)
        const fh = inputHeight(sf.query)
        const rh = inputHeight(sf.replacement)
        if (findBox) findBox.style.height = `${fh + 2}px`
        if (replaceBox) replaceBox.style.height = `${rh + 2}px`
        const height = 4 + fh + 2 + (sf.replaceOpen ? 4 + rh + 2 : 0) + 4
        root.style.height = `${height}px`
        layoutZone(height)
        const invalid = sf.regex && !!sf.query && regexError(sf.query) !== null
        findBox?.classList.toggle('cm-find-invalid', invalid)
        if (invalid) findInput.setAttribute('aria-invalid', 'true')
        else findInput.removeAttribute('aria-invalid')
        showMessage()
        // 有 query 且无命中 → no-results 红字/红边
        const noResults = !!sf.query && !sf.matches.length
        root.classList.toggle('no-results', noResults)
        if (toggleBtn) {
            setToggleIcon(toggleBtn, sf.replaceOpen ? 'chevron-down' : 'chevron-right')
            toggleBtn.setAttribute('aria-expanded', sf.replaceOpen ? 'true' : 'false')
        }

        // 选区不在任何命中上 → 「? of N」(Monaco)
        const limited = sf.matches.length >= MATCHES_LIMIT
        countEl.title = limited ? `Only the first ${MATCHES_LIMIT} results are highlighted, but all find operations work on the entire text.` : ''
        if (!sf.query || !sf.matches.length) countEl.textContent = 'No results'
        else countEl.textContent = `${sf.currentMatch >= 0 ? sf.currentMatch + 1 : '?'} of ${limited ? `${MATCHES_LIMIT}+` : sf.matches.length}`
        // Monaco findWidget._updateMatchesCount:每次计数变化都 aria.alert(「行内容, N of M found for 'q', at 行:列」)
        const spoken = findAriaLabel(view, countEl.textContent, sf)
        if (spoken !== lastSpoken) { lastSpoken = spoken; alert(view, spoken) }

        // Monaco _updateButtons:上下跳要有查询且有命中;替换要展开替换栏且有查询(没命中也可点);
        // 只读编辑器藏起展开按钮(SimpleButton.setEnabled:disabled 类 + 移出 Tab 次序)。
        // 选区内查找要已勾上或有非空选区(Toggle.disable:只标 aria-disabled,外观不变)
        const disable = (node: HTMLElement | null, off: boolean) => {
            if (!node) return
            node.classList.toggle('disabled', off)
            node.setAttribute('aria-disabled', off ? 'true' : 'false')
            node.tabIndex = off ? -1 : 0
        }
        const navigable = !!sf.query && sf.matches.length > 0
        const st = view.state
        disable(prevBtn, !navigable || !canNavigate(st, sf, -1))
        disable(nextBtn, !navigable || !canNavigate(st, sf, 1))
        disable(replaceBtn, !sf.replaceOpen || !sf.query)
        disable(replaceAllBtn, !sf.replaceOpen || !sf.query)
        disable(toggleBtn, view.state.readOnly)
        selectionBtn?.setAttribute('aria-disabled', !sf.findInSelection && view.state.selection.main.empty ? 'true' : 'false')

        syncing = false
        if (sf.focusSeq !== lastFocusSeq) {
            lastFocusSeq = sf.focusSeq
            // Monaco focusFindInput / focusReplaceInput:先 select 再 focus
            const target = sf.focusTarget === 'replace' && sf.replaceOpen ? replaceInput : findInput
            target.focus()
            target.select()
        }
    }

    // 查找状态属于编辑器实例(Monaco FindController,不随 model 走,也不进 saveViewState):
    // 用别的实例的 state 新建(分屏 / 换标签重建)时,不继承它开着的查找框、查询词和历史,也不抢焦点(g2/multi2.ts)
    const inherited = view.state.field(searchField, false)
    if (inherited) {
        const f = rememberedFlags
        const remembered = f.caseSensitive || f.wholeWord || f.regex || f.preserveCase
        if (inherited !== EMPTY || remembered) view.dispatch(view.state.update({
            effects: [
                resetSearchEffect.of(null),
                ...(remembered ? [
                    setQueryEffect.of({ query: '', caseSensitive: f.caseSensitive, wholeWord: f.wholeWord, regex: f.regex }),
                    setPreserveCaseEffect.of(f.preserveCase),
                ] : []),
            ],
        }))
    }
    // Monaco revealRangeInCenterIfOutsideViewport:zone 已生效(查找框关着时 ⌘G 先加 zone、scrollTop += 高,再 reveal)。
    // 盒 = 命中各行上留 context 行、下留 context-1 行(context = sticky scroll 行数,同 viewLines);盒在视口内不动,
    // 否则把盒中线放到视口中间。横向交给 scrollIntoView,它要是又动了竖向就改回来
    const reveal = () => {
        const sd = view.scrollDOM
        const h = sd.clientHeight
        if (!h) return
        const sel = view.state.selection.main
        const lh = view.oracle.lineHeight
        const context = Math.min(h / lh / 2, view.revealSurroundingLines)
        const boxStart = view.lineBlockAt(sel.from).top - context * lh
        const boxEnd = view.lineBlockAt(sel.to).bottom + Math.max(0, context - 1) * lh
        const top = sd.scrollTop
        const next = boxEnd - boxStart > h ? boxStart
            : top <= boxStart && boxEnd <= top + h ? top
            : Math.max(0, (boxStart + boxEnd) / 2 - h / 2)
        sd.scrollTop = next
        const before = zone
        const want = sd.scrollTop
        view.dispatch(view.state.update({ scrollIntoView: true }))
        // 嵌套的这次 dispatch 会重排查找框,框变高时 zone 已经把 scrollTop 加了差值,保留它
        const settled = want + zone - before
        if (sd.scrollTop !== settled) sd.scrollTop = settled
    }
    // 命中框层(Monaco findMatch / currentFindMatch 是 className 装饰:满行高的框,画在正文下、选区上),
    // 加当前命中所在行的整行 rangeHighlight 和选区内查找的整行 findScope。只画视口内。mark 只留类钩子
    const sd = view.scrollDOM
    const deco = sd.ownerDocument.createElement('div')
    deco.className = 'cm-findLayer'
    deco.setAttribute('aria-hidden', 'true')
    const hlLayer = sd.querySelector(':scope > .cm-highlightLayer')
    sd.insertBefore(deco, hlLayer ? hlLayer.nextSibling : sd.firstChild)
    let drawnVp: { from: number, to: number } | null = null
    const paint = () => {
        const sf = view.state.field(searchField, false)
        const vp = view.viewport
        drawnVp = vp
        if (!sf?.open || !sd.clientHeight) { deco.replaceChildren(); return }
        const doc = view.state.doc
        const lh = view.oracle.lineHeight
        const lr = deco.getBoundingClientRect()
        const cr = view.contentDOM.getBoundingClientRect()
        const dx = cr.left - lr.left
        const dy = cr.top - lr.top
        const width = Math.max(sd.scrollWidth, sd.clientWidth) - dx
        const frag = sd.ownerDocument.createDocumentFragment()
        const box = (cls: string, left: number, top: number, w: number, h: number) => {
            const n = sd.ownerDocument.createElement('div')
            n.className = cls
            n.style.cssText = `left:${left}px;top:${top}px;width:${w}px;height:${h}px`
            frag.appendChild(n)
        }
        const wholeLines = (cls: string, from: number, to: number) => {
            for (let n = doc.lineAt(Math.max(from, vp.from)).number, last = doc.lineAt(Math.min(to, vp.to)).number; n <= last; n++) {
                const blk = view.lineBlockAt(doc.line(n).from)
                box(cls, dx, dy + blk.top, width, blk.height)
            }
        }
        if (sf.findInSelection) for (const r of sf.scopes) if (r.to >= vp.from && r.from <= vp.to) wholeLines('cm-findScope', r.from, r.to)
        const cur = sf.highlighted && sf.currentMatch >= 0 ? sf.matches[sf.currentMatch] : null
        if (cur && cur.to >= vp.from && cur.from <= vp.to) {
            const endLine = doc.lineAt(cur.to)
            wholeLines('cm-rangeHighlight', cur.from, cur.to > cur.from && cur.to === endLine.from ? cur.to - 1 : cur.to)
        }
        const range = sd.ownerDocument.createRange()
        // 一行上命中成千上万(压缩过的单行文件)时 view.domAtPos 每次都从行首走:按行把文本节点和起点收一次,二分落点
        let leafLine = -1
        let leaves: { node: Text, at: number }[] = []
        const domAt = (pos: number, lineFrom: number) => {
            if (leafLine !== lineFrom) {
                leafLine = lineFrom
                leaves = []
                let el: Node | null = view.domAtPos(lineFrom).node
                while (el && el.parentNode !== view.contentDOM) el = el.parentNode
                let at = lineFrom
                const walk = (n: Node) => {
                    if (n.nodeType === 3) { leaves.push({ node: n as Text, at }); at += (n as Text).length; return }
                    const wl = (n as Element).getAttribute?.('data-cm-widget')
                    if (wl != null) { at += Number(wl); return }
                    for (let c = n.firstChild; c; c = c.nextSibling) walk(c)
                }
                if (el) for (let c = el.firstChild; c; c = c.nextSibling) walk(c)
            }
            let lo = 0, hi = leaves.length - 1
            while (lo < hi) {
                const mid = (lo + hi + 1) >> 1
                if (leaves[mid].at <= pos) lo = mid
                else hi = mid - 1
            }
            const leaf = leaves[lo]
            return leaf && leaf.at <= pos && pos <= leaf.at + leaf.node.length ? { node: leaf.node, offset: pos - leaf.at } : view.domAtPos(pos)
        }
        // Monaco 只给前 MATCHES_LIMIT 个命中上装饰
        for (let i = 0; i < sf.matches.length && i < MATCHES_LIMIT; i++) {
            const m = sf.matches[i]
            if (m.to < vp.from || m.from > vp.to || m.from === m.to) continue
            const cls = m === cur ? 'cm-currentFindMatch' : 'cm-findMatch'
            for (let pos = Math.max(m.from, vp.from), end = Math.min(m.to, vp.to); pos < end;) {
                const line = doc.lineAt(pos)
                const a = pos, b = Math.min(end, line.to)
                pos = line.to + 1
                if (b <= a) continue
                const blk = view.lineBlockAt(a)
                const s0 = domAt(a, line.from), s1 = domAt(b, line.from)
                try { range.setStart(s0.node, s0.offset); range.setEnd(s1.node, s1.offset) } catch { continue }
                // jsdom 没有 Range.getClientRects(editorview 的坐标路径同样先判断)。没布局就跳过,不抛。
                const rects = typeof range.getClientRects === 'function' ? range.getClientRects() : []
                for (const rc of Array.from(rects)) {
                    if (!rc.width) continue
                    const top = blk.height < lh * 1.5 ? dy + blk.top : rc.top + rc.height / 2 - lh / 2 - lr.top
                    box(cls, rc.left - lr.left, top, rc.width, lh)
                }
            }
        }
        deco.replaceChildren(frag)
    }
    let scrollTimer = 0
    const onScroll = () => {
        if (scrollTimer) return
        scrollTimer = window.setTimeout(() => {
            scrollTimer = 0
            const vp = view.viewport
            if (!drawnVp || vp.from !== drawnVp.from || vp.to !== drawnVp.to) paint()
        }, 0)
    }
    sd.addEventListener('scroll', onScroll, { passive: true })

    // 框已开着时先滚到命中、再按新高度调 zone(Monaco:查询变了先 reveal,框随后变高再 setScrollTop += 差值);
    // 刚打开时先放 zone 再滚
    let refreshTimer = 0
    const unsub = view.onTransaction(tr => {
        // 整篇换掉后命中表先清空,SEARCH_REFRESH_DELAY 后重搜(Monaco FindModel isFlush → decorations.reset + _updateDecorationsScheduler)
        if (tr.docChanged && tr.annotation(flushSearch) === true && view.state.field(searchField, false)?.open) {
            window.clearTimeout(refreshTimer)
            refreshTimer = window.setTimeout(() => {
                if (view.state.field(searchField, false)?.open) view.dispatch(view.state.update({ effects: refreshSearchEffect.of(null) }))
            }, SEARCH_REFRESH_DELAY)
        }
        const revealing = tr.effects.some(e => e.is(revealMatchEffect))
        const shown = zone > 0
        if (revealing && shown) reveal()
        syncFromState()
        if (revealing && !shown) reveal()
        paint()
    })
    const unGeom = view.onGeometry(() => { layout(); paint() })
    syncFromState()
    paint()
    return () => {
        unsub(); unGeom(); layoutZone(0); remove()
        window.clearTimeout(refreshTimer)
        window.clearTimeout(historyTimer)
        sd.removeEventListener('scroll', onScroll)
        if (scrollTimer) window.clearTimeout(scrollTimer)
        deco.remove()
    }
}

/** Monaco 命令 id → 状态命令(宿主按 id 触发 / 命令面板用;键位见 findToggleBindings 和 litemonaco.ts) */
export const FIND_COMMANDS: Record<string, StateCommand> = {
    'actions.find': openSearch,
    'editor.action.startFindReplace': openSearchReplace,
    'actions.findWithSelection': findWithSelection,
    'editor.action.nextMatchFindAction': findNext,
    'editor.action.previousMatchFindAction': findPrev,
    'editor.action.nextSelectionMatchFindAction': findNextSelection,
    'editor.action.previousSelectionMatchFindAction': findPrevSelection,
    'editor.action.selectAllMatches': selectAllSearchMatches,
    'closeFindWidget': closeSearch,
    'editor.action.replaceOne': replaceNext,
    'editor.action.replaceAll': replaceAll,
    'toggleFindCaseSensitive': toggleFindCaseSensitive,
    'toggleFindWholeWord': toggleFindWholeWord,
    'toggleFindRegex': toggleFindRegex,
    'toggleFindInSelection': toggleFindInSelection,
    'togglePreserveCase': toggleFindPreserveCase,
}
