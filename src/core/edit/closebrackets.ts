// 括号/引号自动配对,对齐 Monaco 0.52 默认(autoClosingBrackets/Quotes 'languageDefined'、
// autoClosingOvertype/Delete 'auto'、autoSurround 'languageDefined'),配对表按 TS/JS 语言配置:
//   {} [] () 任何地方都配对;" 不在字符串里;' 和 ` 不在字符串和注释里。
//
// 打一个字符时依次判断(cursorTypeEditOperations.typeWithInterceptors 的顺序):
//   1. 过键:所有光标都是空的、后面正是这个闭符、而且这个闭符是编辑器自动补的(autoClosedField 记着)→ 覆盖它。
//      引号前面是反斜杠时不过键。
//   2. 自动补闭:所有光标都是空的;后面是行尾、autoCloseBefore 里的字符或别的闭符;' 和 " 前面不是单词字符;
//      光标前一个字符和光标处都不在 notIn 的字符串/注释里 → 插入开+闭,光标落中间,记下补的闭符。
//   3. 包裹:所有选区都非空、不全是空白(引号盖在单个引号上不算)→ 两侧加开闭符,选区留在原内容上。
// 都不命中就返回 false,走普通输入(多光标由 domchange 扇出)。
//
// autoClosedField:一次自动补闭记一组(每个光标一个闭符 + 一个「开..闭」包围区间)。区间变成多行、
// 光标数多于区间数、或任一光标不再严格落在对应区间里,整组作废——光标离开再回来就不算了。
// 没装这个 field(只装了 closeBracketsInput)时,过键和退格删对按 Monaco 'always' 处理(不问是不是自动补的)。
//
// 选项(都从 getOption 读,见 editoptions.ts):autoClosingBrackets / autoClosingQuotes / autoClosingComments
// ('always' 任何位置都补并允许单词后补引号;'languageDefined' 默认;'beforeWhitespace' 只在空白前补;'never' 不补)、
// autoClosingOvertype / autoClosingDelete('always' 不问是不是自动补的;'auto' 默认;'never' 关)、
// autoSurround('languageDefined' / 'quotes' / 'brackets' / 'never')。

import type { ChangeSpec } from '../model/change'
import type { EditorSelection, SelectionRange } from '../model/selection'
import type { EditorState, Extension, StateCommand, Transaction } from '../model/state'
import type { InputHandler } from '../view/editorview'
import { EditorSelection as Sel } from '../model/selection'
import { Facet, StateEffect, StateField } from '../model/state'
import { inputHandler } from '../view/editorview'
import { externalTokenType } from './brackets'
import { getCommentTokens } from './commenttokens'
import { autoClosingBehavior, autoClosingMode, autoSurroundMode, type AutoClosingMode } from './editoptions'
import { stateWordClassifier } from './words'

interface Pair { open: string, close: string, notInString: boolean, notInComment: boolean, notInRegex?: boolean }

const PAIRS: Pair[] = [
    { open: '{', close: '}', notInString: false, notInComment: false },
    { open: '[', close: ']', notInString: false, notInComment: false },
    { open: '(', close: ')', notInString: false, notInComment: false },
    { open: '"', close: '"', notInString: true, notInComment: false },
    { open: '\'', close: '\'', notInString: true, notInComment: true },
    { open: '`', close: '`', notInString: true, notInComment: true },
]
const OPEN_MAP = new Map(PAIRS.map(p => [p.open, p]))
const CLOSERS = new Set(PAIRS.map(p => p.close))
const OPENERS = new Set(PAIRS.map(p => p.open))
const isQuote = (ch: string) => ch === '"' || ch === '\'' || ch === '`'

// ── 语言配置(setLanguageConfiguration 的 autoClosingPairs / surroundingPairs / autoCloseBefore)──
// 装了就整套替换上面的 TS/JS 默认表(Monaco:语言配置整体由 setLanguageConfiguration 给的为准)。
export interface ClosingPairConfig { open: string, close: string, notIn?: readonly ('string' | 'comment' | 'regex')[] }
export interface ClosingConfig {
    pairs: readonly ClosingPairConfig[]
    surround?: readonly { open: string, close: string }[]
    autoCloseBefore?: string
}
export const closingConfig = Facet.define<ClosingConfig, ClosingConfig | null>({ combine: v => v[v.length - 1] ?? null })

interface PairTables { all: readonly Pair[], openMap: Map<string, Pair>, closers: Set<string>, openers: Set<string>, multi: Pair[], surround: Map<string, Pair>, before: string | null }
const DEFAULT_TABLES: PairTables = {
    all: [], openMap: OPEN_MAP, closers: CLOSERS, openers: OPENERS, multi: [],
    surround: OPEN_MAP, before: null,
}
const tableCache = new WeakMap<ClosingConfig, PairTables>()
function pairTables(state: EditorState): PairTables {
    const c = state.facet(closingConfig)
    if (!c) return DEFAULT_TABLES
    let t = tableCache.get(c)
    if (!t) {
        const mk = closingPair
        const pairs = c.pairs.map(mk)
        const single = new Map<string, Pair>()
        const multi: Pair[] = []
        for (const p of pairs) {
            if (!p.open) continue
            if (p.open.length === 1) { if (!single.has(p.open)) single.set(p.open, p) } else multi.push(p)
        }
        const surround = new Map<string, Pair>()
        for (const p of (c.surround ?? c.pairs)) if (p.open.length === 1 && !surround.has(p.open)) surround.set(p.open, mk(p))
        t = {
            all: pairs,
            openMap: single,
            closers: new Set(pairs.filter(p => p.close.length === 1).map(p => p.close)),
            openers: new Set(pairs.filter(p => p.open.length === 1).map(p => p.open)),
            multi: multi.sort((a, b) => b.open.length - a.open.length),
            surround,
            before: c.autoCloseBefore ?? null,
        }
        tableCache.set(c, t)
    }
    return t
}

// Monaco CharacterPairSupport 的默认 autoCloseBefore(语言没配时)
const AUTOCLOSE_BEFORE_QUOTES = ';:.,=}])> \n\t'
const AUTOCLOSE_BEFORE_BRACKETS = '\'"`;:.,=}])> \n\t'

// ── 自动补的闭符记录 ──

interface AutoClosed { closers: readonly number[], enclosing: readonly (readonly [number, number])[] }

const addAutoClosed = StateEffect.define<AutoClosed>()

function validAction(a: AutoClosed, doc: EditorState['doc'], sel: EditorSelection): boolean {
    for (const [from, to] of a.enclosing)
        if (doc.lineAt(from).number !== doc.lineAt(to).number) return false
    const enc = a.enclosing.slice().sort((x, y) => x[0] - y[0])
    const ranges = sel.ranges
    if (ranges.length > enc.length) return false
    for (let i = 0; i < ranges.length; i++) {
        const r = ranges[i]
        if (!(r.from > enc[i][0] && r.to < enc[i][1])) return false
    }
    return true
}

export const autoClosedField = StateField.define<readonly AutoClosed[]>({
    create: () => [],
    update(value, tr: Transaction) {
        let next = value
        if (tr.docChanged && next.length) {
            next = next.map(a => ({
                // 闭符区间 NeverGrowsWhenTypingAtEdges:起点贴后、终点贴前,被删(变空)就丢掉
                closers: a.closers.flatMap(p => {
                    const from = tr.changes.mapPos(p, 1), to = tr.changes.mapPos(p + 1, -1)
                    return to - from === 1 ? [from] : []
                }),
                enclosing: a.enclosing.map(([f, t]) => [tr.changes.mapPos(f, 1), tr.changes.mapPos(t, -1)] as const),
            }))
        }
        const added = tr.effects.filter(e => e.is(addAutoClosed)).map(e => e.value as AutoClosed)
        if (added.length) next = [...next, ...added]
        if (!next.length) return next
        if (!tr.docChanged && !tr.selection) return next
        const doc = tr.docChanged ? tr.newDoc : tr.startState.doc
        const sel = tr.newSelection
        const kept = next.filter(a => validAction(a, doc, sel))
        return kept.length === next.length && next === value ? value : kept
    },
})

/** 别的输入拦截自己插了「开符 + 闭符」时(autoindent.ts 的打字回缩)登记自动补的闭符,过键 / 退格删对才认它。 */
export function autoClosedEffect(closers: readonly number[], enclosing: readonly (readonly [number, number])[]) {
    return addAutoClosed.of({ closers, enclosing })
}

/**
 * snippet 来源的 executeEdits:插入文本里「开符 .. 闭符」(闭符是唯一一对单字符配对的闭符)也算自动补的,
 * 之后打闭符能过键(Monaco Cursor._findAutoClosingPairs)。edits 是改动前文档里的区间 + 文本,changes 是它们合成的变更。
 */
export function snippetAutoClosedEffects(state: EditorState, edits: readonly { from: number, to: number, text: string }[], changes: { mapPos(pos: number, assoc?: number): number }): StateEffect<AutoClosed>[] {
    const t = pairTables(state)
    const closers: number[] = [], enclosing: (readonly [number, number])[] = []
    for (const e of edits) {
        const m = /([)\]}>'"`])([^)\]}>'"`]*)$/.exec(e.text)
        if (!m) return []
        const close = m[1]
        const cands = [...t.openMap.values()].filter(p => p.close === close && p.close.length === 1)
        if (cands.length !== 1) return []
        const closeIdx = e.text.length - m[2].length - 1
        const openIdx = e.text.lastIndexOf(cands[0].open, closeIdx - 1)
        if (openIdx === -1) return []
        const start = changes.mapPos(e.from, -1)
        closers.push(start + closeIdx)
        enclosing.push([start + openIdx, start + closeIdx + 1])
    }
    return closers.length ? [addAutoClosed.of({ closers, enclosing })] : []
}

/** pos 处是不是编辑器自动补的闭符;没装 field 时按 'always' 处理(总是 true)。 */
function isAutoClosedAt(state: EditorState, pos: number): boolean {
    const actions = state.field(autoClosedField, false)
    if (!actions) return true
    return actions.some(a => a.closers.includes(pos))
}

// ── 词法:光标附近是不是在字符串/注释里(core 不依赖 shiki,按 C 系语法扫一遍) ──

// 与 Monaco StandardTokenType 数值一致(Other 0 / Comment 1 / String 2 / RegEx 3)。内置词法器不产 Regex,外部 token 源可以
const enum Tok { Other = 0, Comment = 1, String = 2, Regex = 3 }
const SCAN_LIMIT = 200_000

interface Lex { before: Tok, at: Tok, probe?: (ch: string) => Tok }

// 按 C 系语法顺序扫 text 的词法器:advance(to) 扫到 to,mode 是 to 处字符所在的 token(0 代码,1 行注释,2 块注释,
// 3 字符串,4 模板串),prevTok 是 to 前一个字符的 token 类型。tpl 栈记 ${ 嵌套深度。
function lexer(state: EditorState, text: string) {
    const tokens = getCommentTokens(state)
    const lineTok = tokens.line ?? ''
    const blockOpen = tokens.block?.open ?? '', blockClose = tokens.block?.close ?? ''
    const lx = { mode: 0, prevTok: Tok.Other, advance }
    let q = '', i = 0, braceDepth = 0
    const tpl: number[] = []
    function advance(to: number): void {
        let mode = lx.mode, prevTok = lx.prevTok
        while (i < to) {
            const c = text[i]
            if (mode === 0) {
                if (c === '\n') { prevTok = Tok.Other; i++; continue }
                if (lineTok && text.startsWith(lineTok, i)) { mode = 1; prevTok = Tok.Comment; i += lineTok.length; continue }
                if (blockOpen && text.startsWith(blockOpen, i)) { mode = 2; prevTok = Tok.Comment; i += blockOpen.length; continue }
                if (c === '"' || c === '\'') { mode = 3; q = c; prevTok = Tok.String; i++; continue }
                if (c === '`') { mode = 4; prevTok = Tok.String; i++; continue }
                if (c === '{') braceDepth++
                else if (c === '}') {
                    if (tpl.length && tpl[tpl.length - 1] === braceDepth) { tpl.pop(); mode = 4; prevTok = Tok.String; i++; continue }
                    braceDepth--
                }
                prevTok = Tok.Other
                i++
            }
            else if (mode === 1) {
                if (c === '\n') { mode = 0; prevTok = Tok.Other } else prevTok = Tok.Comment
                i++
            }
            else if (mode === 2) {
                prevTok = Tok.Comment
                if (blockClose && text.startsWith(blockClose, i)) { mode = 0; i += blockClose.length; continue }
                i++
            }
            else if (mode === 3) {
                prevTok = Tok.String
                if (c === '\\') { i += 2; continue }
                if (c === q) mode = 0
                else if (c === '\n') { mode = 0; prevTok = Tok.Other }
                i++
            }
            else {
                prevTok = Tok.String
                if (c === '\\') { i += 2; continue }
                if (c === '`') { mode = 0; i++; continue }
                // ${ 是模板表达式的标点(Monaco 里不算字符串 token),之后回到代码
                if (c === '$' && text[i + 1] === '{') { tpl.push(++braceDepth); mode = 0; prevTok = Tok.Other; i += 2; continue }
                i++
            }
        }
        lx.mode = mode
        lx.prevTok = prevTok
    }
    return lx
}

const modeTok = (mode: number) => mode === 1 || mode === 2 ? Tok.Comment : mode === 3 || mode === 4 ? Tok.String : Tok.Other

/** before:光标前一个字符的 token 类型(行首时取 Other);at:在光标处插一个普通字符会落进的 token 类型。 */
function lexAt(state: EditorState, pos: number, owner?: object | null): Lex {
    const line = state.doc.lineAt(pos)
    // 外部 token 来源(宿主给的 tokenizer)优先:光标前字符的 token 类型 / 光标处(行尾取前一个字符)的 token 类型
    const ext = externalTokenType(owner, state.doc)
    if (ext) {
        const t = (v: number): Tok => v === 1 ? Tok.Comment : v === 2 ? Tok.String : v === 3 ? Tok.Regex : Tok.Other
        return {
            before: pos === line.from ? Tok.Other : t(ext.typeAt(pos - 1)),
            at: pos === line.from ? Tok.Other : t(ext.typeAt(pos < line.to ? pos : pos - 1)),
            probe: ext.typeIfInserting ? (ch: string) => t(ext.typeIfInserting!(pos, ch)) : undefined,
        }
    }
    // 文档太大时从当前行起扫(当作行首在代码里)
    const start = line.from > SCAN_LIMIT ? line.from : 0
    const text = state.sliceDoc(start, pos)
    const lx = lexer(state, text)
    lx.advance(text.length)
    return { before: pos === line.from ? Tok.Other : lx.prevTok, at: modeTok(lx.mode) }
}

/** 每个位置(升序)上的字符是不是在字符串 / 模板串里:trim trailing whitespace 跳过这些行尾(Monaco trimInRegexesAndStrings 默认关)。 */
export function inStringAt(state: EditorState, positions: readonly number[]): boolean[] {
    const text = state.sliceDoc()
    const lx = lexer(state, text)
    return positions.map((p) => {
        lx.advance(p)
        return modeTok(lx.mode) === Tok.String
    })
}

function neutralChar(p: Pair): string | null {
    for (const range of ['0123456789', 'abcdefghijklmnopqrstuvwxyz', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'])
        for (const c of range) if (!p.open.includes(c) && !p.close.includes(c)) return c
    return null
}

function tokOK(p: Pair, t: Tok): boolean {
    return t === Tok.String ? !p.notInString : t === Tok.Comment ? !p.notInComment : t === Tok.Regex ? !p.notInRegex : true
}

/** 一条 autoClosingPairs 配置 → 内部配对(notIn 记成三个禁区标志) */
export function closingPair(p: ClosingPairConfig): Pair {
    const n = p.notIn
    return { open: p.open, close: p.close, notInString: !!n?.includes('string'), notInComment: !!n?.includes('comment'), notInRegex: !!n?.includes('regex') }
}

/**
 * 在 column(1 起)处打开符,这对要不要自动补闭(Monaco StandardAutoClosingPairConditional.shouldAutoClose):
 * 空行(没有 token)总补;否则看光标前一个字符(偏移 column-2,取不到就夹到首个 token)所在 token 的类型。
 */
export function pairShouldAutoClose(pair: { notInString: boolean, notInComment: boolean, notInRegex?: boolean }, tokenCount: number, tokenTypeAt: (offset: number) => number, column: number): boolean {
    if (tokenCount === 0) return true
    return pairAllowedIn(pair, tokenTypeAt(column - 2))
}

/** 这对括号能不能在这种 token 里自动补闭(Monaco StandardAutoClosingPairConditional.isOK;token 数值同 StandardTokenType) */
export function pairAllowedIn(pair: { notInString: boolean, notInComment: boolean, notInRegex?: boolean }, tokenType: number): boolean {
    return tokOK(pair as Pair, tokenType as Tok)
}

// Monaco wordSeparators 判定的「普通单词字符」:不是分隔符、不是空格/Tab
function isRegularWordChar(state: EditorState, ch: string): boolean {
    return !!ch && stateWordClassifier(state).get(ch.charCodeAt(0)) === 0
}

// 后面紧跟的是不是一个闭符(而不是同样能当开符用的字符,比如引号)。多字符开 / 闭符也算(Monaco _isBeforeClosingBrace)
function isBeforeClosingBrace(state: EditorState, after: string): boolean {
    const t = pairTables(state)
    if (!t.all.length) { const c = after.charAt(0); return t.closers.has(c) && !t.openers.has(c) }
    return !t.all.some(p => p.open && after.startsWith(p.open)) && t.all.some(p => p.close && after.startsWith(p.close))
}

// ── 三种改写 ──

interface Plan { changes: ChangeSpec[], ranges: SelectionRange[], userEvent: string, autoClosed?: AutoClosed }

function planOvertype(state: EditorState, ranges: readonly SelectionRange[], ch: string): Plan | null {
    if (!pairTables(state).closers.has(ch)) return null
    const overtype = autoClosingBehavior(state, 'autoClosingOvertype')
    if (overtype === 'never') return null
    for (const r of ranges) {
        if (!r.empty) return null
        if (state.sliceDoc(r.head, r.head + 1) !== ch) return null
        if (r.head === state.doc.lineAt(r.head).to) return null
        if (isQuote(ch) && r.head > 0 && state.sliceDoc(r.head - 1, r.head) === '\\') return null
        if (overtype === 'auto' && !isAutoClosedAt(state, r.head)) return null
    }
    // Monaco 用同一个字符替换掉闭符(进撤销栈,和前后的输入并成一组)
    return {
        changes: ranges.map(r => ({ from: r.head, to: r.head + 1, insert: ch })),
        ranges: ranges.map(r => Sel.cursor(r.head + 1)),
        userEvent: 'input.type',
    }
}

// 多字符开符 /**(Monaco TS/JS 配置 { open: '/**', close: ' */', notIn: ['string'] }):打 * 时前面正是 /*
const DOC_COMMENT: Pair = { open: '/**', close: ' */', notInString: true, notInComment: false }

// Monaco CursorConfiguration._getShouldAutoClose
function shouldAutoCloseBefore(mode: AutoClosingMode, languageSet: string, ch: string): boolean {
    if (mode === 'always') return true
    if (mode === 'beforeWhitespace') return ch === ' ' || ch === '\t'
    return languageSet.includes(ch)
}

// typed = true:字符已经在文档里(组合输入结束时补闭,Monaco chIsAlreadyTyped),光标在它后面;只补闭符,开符判定看它之前
function planAutoClose(state: EditorState, ranges: readonly SelectionRange[], ch: string, typed = false, owner?: object | null): Plan | null {
    for (const r of ranges) if (!r.empty) return null
    const back = typed ? ch.length : 0
    const tables = pairTables(state)
    const configured = !!state.facet(closingConfig)
    const doc = !configured && ch === '*' && getCommentTokens(state).block?.open === '/*'
        && ranges.every(r => r.head - state.doc.lineAt(r.head).from >= 2 && state.sliceDoc(r.head - 2, r.head) === '/*')
    // 多字符开符(配置里的 '/**'、'begin' 等):光标前正是开符去掉最后一个字符、而且打的是最后一个字符
    const multi = configured && !doc
        ? tables.multi.find(p => p.open.endsWith(ch) && ranges.every(r => {
            const n = p.open.length - ch.length
            const at = r.head - back
            return at >= n && state.sliceDoc(at - n, at) === p.open.slice(0, n)
        }))
        : undefined
    const pair = doc ? DOC_COMMENT : multi ?? tables.openMap.get(ch)
    if (!pair) return null
    const quote = isQuote(ch)
    // Monaco:引号看 autoClosingQuotes,块注释开符(开符里含块注释起始符,如 /**)看 autoClosingComments,其余看 autoClosingBrackets
    const blockOpen = getCommentTokens(state).block?.open
    const forComment = doc || (!!blockOpen && pair.open.includes(blockOpen))
    const mode = quote ? autoClosingMode(state, 'autoClosingQuotes') : forComment ? autoClosingMode(state, 'autoClosingComments') : autoClosingMode(state, 'autoClosingBrackets')
    // 包含关系:既有 ( ) 又有 (* *) 时,打 * 后面已是 ) 就只补 *(Monaco _findContainedAutoClosingPair)
    let contained = ''
    if (configured && pair.open.length > 1) {
        const last = pair.close.slice(-1)
        let best: Pair | undefined
        for (const c of tables.all) {
            if (c.open !== pair.open && c.close.length && pair.open.includes(c.open) && pair.close.endsWith(c.close) && c.close.slice(-1) === last && (!best || c.open.length > best.open.length)) best = c
        }
        contained = best?.close ?? ''
    }
    let containedPresent = !!contained
    if (mode === 'never') return null
    const before = tables.before ?? (quote ? AUTOCLOSE_BEFORE_QUOTES : AUTOCLOSE_BEFORE_BRACKETS)
    for (const r of ranges) {
        const line = state.doc.lineAt(r.head)
        const after = state.sliceDoc(r.head, line.to)
        const at = r.head - back
        if (contained && !after.startsWith(contained)) containedPresent = false
        if (after.length && !isBeforeClosingBrace(state, after) && !shouldAutoCloseBefore(mode, before, after.charAt(0))) return null
        if (mode !== 'always' && (ch === '\'' || ch === '"') && at > line.from && isRegularWordChar(state, state.sliceDoc(at - 1, at))) return null
        const lex = lexAt(state, at, owner)
        if (!tokOK(pair, lex.before)) return null
        if (quote && !tokOK(pair, lex.at)) return null
        // Monaco:拿一个中性字符(不在开 / 闭符里的数字或字母)假装打进去,看 tokenizer 把它放进哪种 token(引号是开串还是收串)
        if (lex.probe) {
            const neutral = neutralChar(pair)
            if (neutral && !tokOK(pair, lex.probe(neutral))) return null
        }
    }
    const changes: ChangeSpec[] = []
    const out: SelectionRange[] = []
    const closers: number[] = [], enclosing: (readonly [number, number])[] = []
    let shift = 0
    // 多字符开符前面几个字已经在文档里,只插打的这个字 + 闭符
    const head = pair.open.length - ch.length
    const close = containedPresent ? pair.close.slice(0, pair.close.length - contained.length) : pair.close
    for (const r of ranges) {
        const at = r.head - back + shift
        changes.push({ from: r.head, insert: typed ? close : ch + close })
        out.push(Sel.cursor(at + ch.length))
        closers.push(at + ch.length)
        enclosing.push([at - head, at + ch.length + close.length])
        shift += typed ? close.length : ch.length + close.length
    }
    return { changes, ranges: out, userEvent: 'input.type.autoclose', autoClosed: { closers, enclosing } }
}

function planSurround(state: EditorState, ranges: readonly SelectionRange[], ch: string): Plan | null {
    const pair = pairTables(state).surround.get(ch)
    if (!pair) return null
    // Monaco shouldSurroundChar:autoSurround 决定引号 / 括号哪类可以包裹选区
    const surround = autoSurroundMode(state)
    if (surround === 'never' || (isQuote(ch) ? surround === 'brackets' : surround === 'quotes')) return null
    for (const r of ranges) {
        if (r.empty) return null
        const text = state.sliceDoc(r.from, r.to)
        let onlyWs = true
        for (let i = 0; i < text.length; i++) {
            const c = text[i]
            if (c !== ' ' && c !== '\t' && c !== '\n') { onlyWs = false; break }
        }
        if (onlyWs) return null
        if (isQuote(ch) && r.to - r.from === 1 && isQuote(text)) return null
    }
    const changes: ChangeSpec[] = []
    const out: SelectionRange[] = []
    let shift = 0
    for (const r of ranges) {
        changes.push({ from: r.from, insert: pair.open }, { from: r.to, insert: pair.close })
        // 选区留在原内容上,方向总是正向(Monaco SurroundSelectionCommand)
        out.push(Sel.range(r.from + shift + pair.open.length, r.to + shift + pair.open.length))
        shift += pair.open.length + pair.close.length
    }
    return { changes, ranges: out, userEvent: 'input.type.surround' }
}

function planTyping(state: EditorState, ch: string, owner?: object | null): Plan | null {
    const ranges = state.selection.ranges
    return planOvertype(state, ranges, ch) ?? planAutoClose(state, ranges, ch, false, owner) ?? planSurround(state, ranges, ch)
}

function applyPlan(state: EditorState, plan: Plan): Transaction {
    return state.update({
        changes: plan.changes,
        selection: Sel.create(plan.ranges, state.selection.mainIndex),
        effects: plan.autoClosed ? addAutoClosed.of(plan.autoClosed) : [],
        userEvent: plan.userEvent,
        scrollIntoView: true,
    })
}

// ── 组合输入(IME / Mac 重音键)用的入口:Monaco 里 isDoingComposition 时只剩过键,组合结束再补闭 / 包裹 ──

/** 组合中打字:只认过键(自动补的闭符),其余当普通字符;返回 true = 已处理 */
export function typeInCompositionOvertype(view: { state: EditorState, dispatch: (tr: Transaction) => void }, ch: string): boolean {
    const plan = planOvertype(view.state, view.state.selection.ranges, ch)
    if (!plan) return false
    view.dispatch(applyPlan(view.state, plan))
    return true
}

/** 组合结束,单字符已在文档里(光标在它后面):后面正是自动补的同一闭符 → 删掉重复的那个(Monaco AutoClosingOvertypeWithInterceptors) */
export function compositionEndOvertype(state: EditorState, ch: string): Transaction | null {
    const plan = planOvertype(state, state.selection.ranges, ch)
    if (!plan) return null
    return state.update({
        changes: state.selection.ranges.map(r => ({ from: r.head, to: r.head + 1, insert: '' })),
        selection: Sel.create(state.selection.ranges.map(r => Sel.cursor(r.head)), state.selection.mainIndex),
        userEvent: 'input.type',
        scrollIntoView: true,
    })
}

/** 组合结束,单字符已在文档里:补闭(Monaco AutoClosingOpenCharTypeOperation chIsAlreadyTyped) */
export function compositionEndAutoClose(state: EditorState, ch: string, owner?: object | null): Transaction | null {
    const plan = planAutoClose(state, state.selection.ranges, ch, true, owner)
    return plan ? applyPlan(state, plan) : null
}

/** 这个字符能不能用来包裹(autoSurround + 语言配置里有这对);返回闭符 */
export function surroundCloseFor(state: EditorState, ch: string): string | null {
    const pair = pairTables(state).surround.get(ch)
    if (!pair) return null
    const surround = autoSurroundMode(state)
    if (surround === 'never' || (isQuote(ch) ? surround === 'brackets' : surround === 'quotes')) return null
    return pair.close
}

/** 输入拦截(inputHandler facet):变更必须正好落在主选区上、插入单个字符,才按上面三条改写。 */
export const closeBracketsInput: InputHandler = (view, from, to, insert) => {
    const { state } = view
    if (state.readOnly || insert.length !== 1) return false
    const main = state.selection.main
    if (from !== main.from || to !== main.to) return false
    const plan = planTyping(state, insert, view)
    if (!plan) return false
    view.dispatch(applyPlan(state, plan))
    return true
}

/** 自动配对整套:输入拦截 + 自动补闭记录(过键、退格删对只认编辑器补的闭符)。 */
export function closeBrackets(): Extension {
    return [autoClosedField, inputHandler.of(closeBracketsInput)]
}

/** 单个光标夹在自动配对 开|闭 之间时,删对要删的区间(Monaco isAutoClosingPairDelete 的单光标版);不符合返回 null */
export function autoClosingPairSpan(state: EditorState, r: SelectionRange): [number, number] | null {
    const brackets = autoClosingMode(state, 'autoClosingBrackets'), quotes = autoClosingMode(state, 'autoClosingQuotes')
    const del = autoClosingBehavior(state, 'autoClosingDelete')
    if ((brackets === 'never' && quotes === 'never') || del === 'never') return null
    if (!r.empty) return null
    const line = state.doc.lineAt(r.head)
    if (r.head === line.from || r.head === line.to) return null
    const open = state.sliceDoc(r.head - 1, r.head)
    const pair = pairTables(state).openMap.get(open)
    if (!pair || state.sliceDoc(r.head, r.head + 1) !== pair.close) return null
    if ((isQuote(open) ? quotes : brackets) === 'never') return null
    if (del === 'auto' && !isAutoClosedAt(state, r.head)) return null
    return [r.head - 1, r.head + 1]
}

/**
 * 退格删对(Monaco isAutoClosingPairDelete):所有光标都是空的、夹在一对 开|闭 中间(不在行首行尾),
 * 且闭符是自动补的(没装 autoClosedField 时不问)→ 每个光标同删两边。否则返回 false 走普通退格。
 */
export const deleteBracketPair: StateCommand = ({ state, dispatch }) => {
    if (state.readOnly) return false
    const ranges = state.selection.ranges
    // Monaco isAutoClosingPairDelete:括号和引号都 never、或 autoClosingDelete = never 时不删对
    for (const r of ranges) if (!autoClosingPairSpan(state, r)) return false
    let shift = 0
    const out = ranges.map(r => { const c = Sel.cursor(r.head - 1 - shift); shift += 2; return c })
    dispatch(state.update({
        changes: ranges.map(r => ({ from: r.head - 1, to: r.head + 1 })),
        selection: Sel.create(out, state.selection.mainIndex),
        scrollIntoView: true,
        userEvent: 'delete.backward',
    }))
    return true
}

// ── 旧的单光标决策接口(保留给已有调用方):只看主选区 ──

export interface BracketInsert {
    from: number
    to: number
    insert: string
    // 相对 from 的光标偏移(改写后主光标落点)
    cursor: number
    // 包裹时选区锚点(相对 from);缺省 = 空光标
    anchor?: number
}

export function closeBracketChange(
    state: EditorState,
    change: { from: number, to: number, insert: string },
    selEmpty: boolean,
    owner?: object | null,
): BracketInsert | null {
    const { from, to, insert } = change
    if (insert.length !== 1) return null
    if (selEmpty !== (from === to)) return null
    const range = from === to ? Sel.cursor(from) : Sel.range(from, to)
    const plan = planOvertype(state, [range], insert) ?? planAutoClose(state, [range], insert, false, owner) ?? planSurround(state, [range], insert)
    if (!plan) return null
    if (plan.userEvent === 'input.type.surround') {
        const inner = state.sliceDoc(from, to)
        return { from, to, insert: insert + inner + pairTables(state).surround.get(insert)!.close, cursor: 1 + inner.length, anchor: 1 }
    }
    if (plan.userEvent === 'input.type') return { from, to: from, insert: '', cursor: 1 }
    return { from, to, insert: (plan.changes[0] as { insert: string }).insert, cursor: 1 }
}
