// 共享 + 增量 tokenize —— 三个消费者(highlight / minimap / brackets)同一篇文档只 tokenize 一次,
// 且一次只重扫被改的那几行,不是全文。
//
// 热路径约束(大文件打字):
//   - 禁止每键 toJSON/split 全文
//   - 禁止每键 new Array(lines) 拷整表 rel/statesIn
//   - 行数不变时原地改 dirty 段;行数变时 splice
//   - 视口装饰只 tokensInLineRange,不全文 rebase
//   - 大文档禁止冷启动全文 tokenize(只按视口 ensureTokenizedRange)

import { afterNextPaint } from './afterpaint'
import type { ChangeSet } from '../model/change'
import type { Rope } from '../model/rope'

export interface ScopedToken {
    content: string
    offset: number
    color?: string
    /** FontStyle 位(1 斜体 / 2 粗体 / 4 下划线 / 8 删除线);只有 Monarch / TokensProvider 的桥会给,shiki 路径恒无 */
    fontStyle?: number
    explanation?: { content: string; scopes: { scopeName: string }[] }[]
}
export interface GrammarState {
    getScopes(): string[] | undefined
    // shiki 的内部栈:contentName 也在里面(getScopes 只给 name,模板串里会漏 string.template)
    getInternalStack?(): {
        contentNameScopesList?: { getScopeNames?(): string[] }
        // vscode-textmate StateStack.equals:逐帧比 ruleId / endRule(反向引用的结束串,heredoc、r#""#)/ depth,
        // 再比 contentName 栈。Monaco 判行状态收敛用的就是它
        equals?(other: unknown): boolean
    } | undefined
}
// 结构上要能直接收 shiki 4 的 Highlighter(createHighlighter 的返回值,宿主不用强转):方法参数按双向比较,
// options 写成 shiki CodeToTokensOptions 的超集(lang 可省、theme 可以是主题对象、includeExplanation 还有 'tokenType');
// getLastGrammarState 在 shiki 里可能返回 undefined(空 token 表)
export interface ScopedShiki {
    codeToTokens(
        code: string,
        options: {
            lang?: string
            theme?: string | object
            includeExplanation?: boolean | 'scopeName' | 'tokenType'
            grammarState?: GrammarState
        },
    ): { tokens: ScopedToken[][] }
    getLastGrammarState(tokens: ScopedToken[][]): GrammarState | undefined
    getLoadedLanguages?(): string[]
}

// 超过此行数:冷启动只建骨架,tokenize 按需(视口)。小文档仍全文,语义不变。
const EAGER_MAX_LINES = 400
// 编辑后最多重扫行数(对齐 Monaco:从脏行往下,state 哈希对齐即停;不齐也截断,避免连锁到文末)。
// 以前小文档无上限 → 中间打字 state 微变时重扫数千行,主因之一。
export const EDIT_RETOKENIZE_MAX = 48
// 视口索取时,最多向前回填找 seed 的行数;再远就用 undefined seed(色可能偏,但不卡)
const RANGE_BACKFILL_MAX = 80

const EMPTY_REL: TokenRow = []

// 缓存里每行存成紧凑的行(TokenRow):[起点, 样式号, 起点, 样式号, …](小整数数组),
// content 是行文本里相邻两个起点之间的那段,color / fontStyle 查全局样式表。
// 一个 token 从一个对象 + 一个字符串(约 90 字节)降到两个 SMI(8 字节):10 万行文档的 token 缓存从几十 MB 降到几 MB。
// Monaco 的视图 token 也是每行一个 Uint32Array [结束位置, metadata]。
// grammar 给的 token 不是首尾相接地覆盖行文本(测试替身、宿主自己的 TokensProvider 有可能)时原样存对象数组,读的时候照抄。
export type TokenRow = readonly number[] | readonly ScopedToken[]
const styleColor: (string | undefined)[] = []
const styleFont: (number | undefined)[] = []
const styleIds = new Map<string, number>()
function styleId(color: string | undefined, font: number | undefined): number {
    const key = font ? `${color ?? ''}\u0000${font}` : (color ?? '')
    let id = styleIds.get(key)
    if (id === undefined) {
        id = styleColor.length
        styleColor.push(color)
        styleFont.push(font || undefined)
        styleIds.set(key, id)
    }
    return id
}
function packRow(toks: ScopedToken[], line: string): TokenRow {
    const out: number[] = new Array(toks.length * 2)
    for (let j = 0; j < toks.length; j++) {
        const t = toks[j]
        const end = j + 1 < toks.length ? toks[j + 1].offset : line.length
        if (t.explanation || t.offset + t.content.length !== end || !line.startsWith(t.content, t.offset)) return toks
        out[j * 2] = t.offset
        out[j * 2 + 1] = styleId(t.color, t.fontStyle)
    }
    return out
}
const isPacked = (row: TokenRow): row is readonly number[] => typeof row[0] === 'number'
/** 一行缓存的 token(相对行首的 offset,加上 base);每次给新对象,调用方可以改 */
export function rowTokens(row: TokenRow, line: string, base = 0): ScopedToken[] {
    const out: ScopedToken[] = new Array(isPacked(row) ? row.length >> 1 : row.length)
    if (isPacked(row)) {
        for (let j = 0, k = 0; j < row.length; j += 2, k++) {
            const off = row[j], end = j + 2 < row.length ? row[j + 2] : line.length, sid = row[j + 1]
            const t: ScopedToken = { content: line.slice(off, end), offset: base + off, color: styleColor[sid] }
            if (styleFont[sid]) t.fontStyle = styleFont[sid]
            out[k] = t
        }
        return out
    }
    for (let j = 0; j < row.length; j++) {
        const t = row[j]
        out[j] = { content: t.content, offset: base + t.offset, color: t.color, fontStyle: t.fontStyle, explanation: t.explanation }
    }
    return out
}
const READY = 1
const GUESSED = 2

// 一篇文档一份缓存。三个消费者(highlight / minimap / brackets)同一 view 共用一份;
// 不同 view(多 tab、分屏、diff 两侧)各自一份,互不覆盖。消费者入口先 selectTokenCache(view)
// 再调下面的函数;无 view(单测/SSR)落到默认缓存,语义同旧的模块级单例。
class TokenCache {
    cacheHl: ScopedShiki | undefined
    cacheLang: string | undefined
    cacheTheme: string | undefined
    cacheLines: string[] = []
    cacheRel: TokenRow[] = []
    cacheStatesIn: (GrammarState | undefined)[] = []
    cacheLineStart: number[] = [0]
    // 0 = 没 tokenize;READY = 已 tokenize 且入口 state 可信;GUESSED = 大跳跃时按猜的 seed 算的。大文档稀疏,小文档全 READY
    tokenReady: Uint8Array = new Uint8Array(0)
    // prepare 产出的新行表(ensure 前不覆盖 cacheLines,以便算 shift)
    pendingLines: string[] | null = null
    // pending 相对 cacheLines 的脏区:[dirtyStartHint, 行数 - dirtyTailHint)。两笔事务之间没人取 token 时取并集
    dirtyStartHint = -1
    dirtyTailHint = -1
    // cacheRel 任何一行变了就 +1:消费者按 (doc, 范围, version) 缓存装饰
    version = 0
    // 后台分词(Monaco DefaultBackgroundTokenizer):[0, bgFrom) 全是 READY。有订阅者(挂着的 view / minimap)才跑
    bgFrom = 0
    bgScheduled = false
    /** 后台分词的第一次排程要等首帧画完(见 afterpaint.ts):否则几十毫秒的分词会挤在首帧前面 */
    bgStarted = false
    // 首帧后再启后台分词的待办(afterNextPaint 的取消函数);最后一个订阅者走了就撤掉,不留悬空的 rAF / 定时器
    cancelFirstPaint: (() => void) | null = null
    // 选项 maxTokenizationLineLength(默认 20000):这么长的行不交给 grammar
    maxLineLength = 20000
    listeners = new Set<(from: number, to: number) => void>()
}

const defaultCache = new TokenCache()
const cacheByOwner = new WeakMap<object, TokenCache>()
let c = defaultCache

/** 切到 owner(通常是 EditorView)的缓存;owner 缺省 → 默认缓存。WeakMap 持有,view 回收即释放。 */
export function selectTokenCache(owner?: object | null): void {
    if (!owner) {
        c = defaultCache
        return
    }
    let cache = cacheByOwner.get(owner)
    if (!cache) {
        cache = new TokenCache()
        cacheByOwner.set(owner, cache)
    }
    c = cache
}

/**
 * 编辑器销毁时放掉它的缓存。WeakMap 只管“owner 回收了就放”,但模块级的当前缓存指针 c 是强引用,
 * 会让最后用过的那份(10 万行约 40 MB)一直挂着,直到别的编辑器选了别的缓存。
 */
export function releaseTokenCache(owner: object): void {
    const cache = cacheByOwner.get(owner)
    if (!cache) return
    cacheByOwner.delete(owner)
    cache.listeners.clear()
    if (c === cache) c = defaultCache
}

// 高亮只靠 color;不要 scopeName 解释(贵,且非装饰路径需要)。
const TOKEN_OPTS = { includeExplanation: false as const }

// Monaco 式 line-state 对齐(TokenizationStateStore:state.equals)。只比 getScopes() 不够:它只给每帧的 name,
// 漏了 contentName(string.template)、规则 id(块 { 和模板串 ` 的帧 name 都是外层的 meta.block)和反向引用的
// endRule(heredoc 的 EOF/END),两个不同的状态会被当成一样而提前停扫,下面几行留着旧 token。
// 拿不到内部栈(测试替身)才退回比 scope 数组;禁止 JSON.stringify(热路径每行一次会卡)。
function stateEq(a: GrammarState | undefined, b: GrammarState | undefined): boolean {
    if (a === b) return true
    if (!a || !b) return false
    const ka = a.getInternalStack?.()
    const kb = b.getInternalStack?.()
    if (ka && kb && typeof ka.equals === 'function') return ka === kb || ka.equals(kb)
    const sa = a.getScopes()
    const sb = b.getScopes()
    if (sa === sb) return true
    if (!sa || !sb || sa.length !== sb.length) return false
    for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return false
    return true
}

function rebuildLineStarts(lines: string[]): number[] {
    const starts = new Array(lines.length + 1)
    let pos = 0
    for (let i = 0; i < lines.length; i++) {
        starts[i] = pos
        pos += lines[i].length + 1
    }
    starts[lines.length] = pos
    return starts
}

// 行数没变、[start, end) 这几行的文字变了(多行选区换成同样行数的文字也会):重算这几行的起点,end 之后整体平移。
// 以前只当 start 一行变了,多行替换后 end 之前、之后的起点都错(括号跳过的偏移跟着错)。
function fixLineStartsFrom(start: number, end = start + 1) {
    const n = c.cacheLines.length
    if (start <= 0 || c.cacheLineStart.length !== n + 1) {
        c.cacheLineStart = rebuildLineStarts(c.cacheLines)
        return
    }
    const starts = c.cacheLineStart
    const stop = Math.min(n, Math.max(end, start + 1))
    let p = starts[start]
    for (let k = start; k < stop; k++) {
        starts[k] = p
        p += c.cacheLines[k].length + 1
    }
    const delta = p - starts[stop]
    if (stop === n) starts[n] = p
    else if (delta !== 0) for (let k = stop; k <= n; k++) starts[k] += delta
}

function clearPending() {
    c.pendingLines = null
    c.dirtyStartHint = -1
    c.dirtyTailHint = -1
}

function markReady(from: number, toExclusive: number) {
    c.tokenReady.fill(READY, from, toExclusive)
}

function clearReadyFrom(from: number) {
    if (from <= 0) c.tokenReady.fill(0)
    else c.tokenReady.fill(0, from)
}

// —— 顺手留下 token 类型(brackets.ts 跳字符串/注释用)——
// shiki 的 codeToTokens 每行调一次 grammar.tokenizeLine2,metadata 里本来就有 vscode-textmate 的 StandardTokenType
// (Other / Comment / String / RegEx,按 scope 名里最靠叶子的 comment|string|regex|meta.embedded 定,
// 和 brackets.isSkipScopes 同一条规则),shiki 只取颜色就丢了。在 grammar 上挂一层把这次结果接住,按行存非 Other
// 的区段:括号查询不用再为这一行 tokenize 一遍带 scope 的(冷查找主要花在这)。
// 拿不到(测试替身、grammar 换了对象、空行)就不存,brackets.ts 照旧自己算。
export const TT_COMMENT = 1
export const TT_STRING = 2
export const TT_REGEX = 3
interface TypeCapture { line: string | null, tokens: Uint32Array | null }
const HOOKED = Symbol('lite-monaco.tokenTypes')
const captures = new WeakMap<object, Map<string, TypeCapture | null>>()
// 行 token 数组 → [起, 止, 类型, …](只有非 Other 的段,相邻同类合并);没有非 Other 段的是 NO_TYPES
const lineTypes = new WeakMap<TokenRow, readonly number[]>()
const NO_TYPES: readonly number[] = Object.freeze([])

type Grammar2 = { tokenizeLine2(line: string, stack: unknown, limit?: number): { tokens: Uint32Array }, [HOOKED]?: TypeCapture }

function captureFor(hl: ScopedShiki, lang: string, refresh = false): TypeCapture | null {
    let m = captures.get(hl)
    if (!m) captures.set(hl, m = new Map())
    if (!refresh && m.has(lang)) return m.get(lang)!
    let cap: TypeCapture | null = null
    try {
        const g = (hl as { getLanguage?(l: string): unknown }).getLanguage?.(lang) as Grammar2 | undefined
        if (g && typeof g.tokenizeLine2 === 'function') {
            cap = g[HOOKED] ?? null
            if (!cap) {
                const box: TypeCapture = { line: null, tokens: null }
                const orig = g.tokenizeLine2
                g.tokenizeLine2 = function (this: unknown, line: string, stack: unknown, limit?: number) {
                    const r = orig.call(this, line, stack, limit)
                    box.line = line
                    box.tokens = r.tokens
                    return r
                }
                g[HOOKED] = cap = box
            }
        }
    } catch { cap = null }
    m.set(lang, cap)
    return cap
}

function typesOf(line: string, t: Uint32Array): readonly number[] {
    let out: number[] | null = null
    for (let j = 0; j < t.length; j += 2) {
        const ty = (t[j + 1] & 768) >>> 8 // EncodedTokenMetadata TOKEN_TYPE_MASK / OFFSET
        if (!ty) continue
        const from = t[j], to = j + 2 < t.length ? t[j + 2] : line.length
        if (from >= to) continue
        out ??= []
        const k = out.length
        if (k && out[k - 1] === ty && out[k - 2] === from) out[k - 2] = to
        else out.push(from, to, ty)
    }
    return out ?? NO_TYPES
}

/** 这一行(token 数组身份)高亮时 grammar 给的 token 类型:[起, 止, 类型, …];undefined = 没留下 */
export function lineTokenTypes(rel: TokenRow): readonly number[] | undefined {
    return lineTypes.get(rel)
}

// Monaco editor.maxTokenizationLineLength:这么长的行不交给 grammar(monarch / textmate 同为 nullTokenize):
// 一个不带颜色的 token,入口 state 原样当出口往下传
export const MAX_TOKENIZATION_LINE_LENGTH = 20000

/** 设 owner(通常是 EditorView)的 maxTokenizationLineLength;值变了就丢掉已算的 token,下次取时按新上限重算 */
export function setMaxTokenizationLineLength(owner: object | null | undefined, n: number): void {
    const prev = c
    selectTokenCache(owner)
    if (c.maxLineLength !== n) {
        c.maxLineLength = n
        c.cacheHl = undefined
        c.version++
    }
    c = prev
}

/** 当前选中的缓存的 maxTokenizationLineLength(先 selectTokenCache(owner)) */
export function maxTokenizationLineLength(): number {
    return c.maxLineLength
}

function tokenizeLine(
    hl: ScopedShiki,
    line: string,
    opts: { lang: string; theme: string },
    seed: GrammarState | undefined,
): { rel: TokenRow, state: GrammarState | undefined } {
    if (line.length >= c.maxLineLength) return { rel: [0, styleId(undefined, undefined)], state: seed }
    const cap = line ? captureFor(hl, opts.lang) : null
    if (cap) cap.line = null
    const r = hl.codeToTokens(line, { ...opts, ...TOKEN_OPTS, grammarState: seed })
    const toks = r.tokens[0]
    const rel = toks ? packRow(toks, line) : []
    if (cap && toks) {
        if (cap.line === line && cap.tokens) lineTypes.set(rel, typesOf(line, cap.tokens))
        // 没接到:shiki 重载语言会换 grammar 对象,下次重挂
        else captureFor(hl, opts.lang, true)
        cap.line = null
        cap.tokens = null
    }
    return { rel, state: hl.getLastGrammarState(r.tokens) }
}

function tokenizeFrom(
    hl: ScopedShiki,
    lines: string[],
    rel: TokenRow[],
    statesIn: (GrammarState | undefined)[],
    start: number,
    opts: { lang: string; theme: string },
    endExclusive = lines.length,
) {
    let seed = statesIn[start]
    const end = Math.min(endExclusive, lines.length)
    for (let i = start; i < end; i++) {
        statesIn[i] = seed
        const r = tokenizeLine(hl, lines[i], opts, seed)
        rel[i] = r.rel
        seed = r.state
        statesIn[i + 1] = seed
    }
    if (end >= lines.length) statesIn[lines.length] = seed
}

function installSkeleton(hl: ScopedShiki, lines: string[], opts: { lang: string; theme: string }) {
    const n = lines.length
    const rel: TokenRow[] = new Array(n)
    for (let i = 0; i < n; i++) rel[i] = EMPTY_REL
    c.cacheHl = hl
    c.cacheLang = opts.lang
    c.cacheTheme = opts.theme
    c.cacheLines = lines
    c.cacheRel = rel
    c.version++
    c.cacheStatesIn = new Array(n + 1)
    c.cacheLineStart = rebuildLineStarts(lines)
    c.tokenReady = new Uint8Array(n)
    c.bgFrom = 0
    clearPending()
    scheduleBackground(c)
}

function installFull(hl: ScopedShiki, lines: string[], opts: { lang: string; theme: string }) {
    const rel: TokenRow[] = new Array(lines.length)
    const statesIn: (GrammarState | undefined)[] = new Array(lines.length + 1)
    tokenizeFrom(hl, lines, rel, statesIn, 0, opts)
    c.cacheHl = hl
    c.cacheLang = opts.lang
    c.cacheTheme = opts.theme
    c.cacheLines = lines
    c.cacheRel = rel
    c.version++
    c.cacheStatesIn = statesIn
    c.cacheLineStart = rebuildLineStarts(lines)
    c.tokenReady = new Uint8Array(lines.length)
    markReady(0, lines.length)
    c.bgFrom = lines.length
    clearPending()
}

// 视口/minimap 索取 [fromLine,toLine](1-based 含)前调用:只补齐缺行,绝不扫全文。
export function ensureTokenizedRange(fromLine: number, toLine: number): void {
    if (!c.cacheHl || !c.cacheLang || !c.cacheTheme || !c.cacheLines.length) return
    const n = c.cacheLines.length
    if (!n || c.cacheRel.length !== n) return
    const a = Math.max(0, Math.min(n - 1, fromLine - 1))
    const b = Math.max(a + 1, Math.min(n, toLine)) // exclusive
    // 已全齐
    let allReady = true
    for (let i = a; i < b; i++) if (!c.tokenReady[i]) { allReady = false; break }
    if (allReady) return

    const hl = c.cacheHl
    const opts = { lang: c.cacheLang, theme: c.cacheTheme }
    // 找 seed:向前找最近已 tokenize 行
    let start = a
    let seed: GrammarState | undefined
    const backLimit = Math.max(0, a - RANGE_BACKFILL_MAX)
    let found = -1
    for (let i = a - 1; i >= backLimit; i--) {
        if (c.tokenReady[i]) { found = i; break }
    }
    if (found >= 0) {
        start = found + 1
        seed = c.cacheStatesIn[found + 1]
    } else if (a === 0) {
        start = 0
        seed = undefined
    } else {
        // 大跳跃:不回填几千行,本段用 undefined seed(色相位可能偏)
        start = a
        seed = undefined
    }

    // 入口 state 从第 0 行一路接下来的才可信(READY);大跳跃猜的 seed 和它往下算出来的是 GUESSED。
    // 已有的行入口要跟这一轮刚算出来的 seed 比:对不上说明它是按别的(猜的)seed 算的,重算 —— Monaco 同样
    // 一直往下扫到 state.equals 为止。可信的链接上猜的那段且 state 相同,那段整段升成可信。
    let trust = found >= 0 ? c.tokenReady[found] : a === 0 ? READY : GUESSED
    let fresh = false
    for (let i = start; i < b; i++) {
        const r0 = c.tokenReady[i]
        if (r0 && (!fresh || stateEq(seed, c.cacheStatesIn[i]))) {
            if (fresh && trust === READY && r0 === GUESSED) promoteRun(i)
            trust = c.tokenReady[i]
            seed = c.cacheStatesIn[i + 1]
            fresh = false
            continue
        }
        seed = tokenizeAt(hl, i, opts, seed, trust)
        fresh = true
    }
    if (fresh) {
        reconcileFrom(hl, b, opts, seed, trust)
        c.bgFrom = Math.min(c.bgFrom, start)
        scheduleBackground(c)
    }
}

// 刚算到 k 之前一行,出口是 seed:k 往下已有的行入口对不上就接着重算,直到对上(限 EDIT_RETOKENIZE_MAX 行,
// 超了把这一段作废,视口再补)。保持「相邻两行都已 tokenize ⇒ 上一行出口 = 下一行入口」。
function reconcileFrom(hl: ScopedShiki, k: number, opts: { lang: string; theme: string }, seed: GrammarState | undefined, trust: number) {
    const n = c.cacheLines.length
    for (let budget = EDIT_RETOKENIZE_MAX; k < n && c.tokenReady[k]; k++) {
        if (stateEq(seed, c.cacheStatesIn[k])) {
            if (trust === READY && c.tokenReady[k] === GUESSED) promoteRun(k)
            return
        }
        if (budget-- <= 0) {
            c.cacheStatesIn[k] = seed
            while (k < n && c.tokenReady[k]) c.tokenReady[k++] = 0
            return
        }
        seed = tokenizeAt(hl, k, opts, seed, trust)
    }
    c.cacheStatesIn[k] = seed
}

// 只写本行入口;出口留给调用方 —— 下一行已 tokenize 时 statesIn[i+1] 是它的入口,要先拿来比,不能先盖掉
function tokenizeAt(hl: ScopedShiki, i: number, opts: { lang: string; theme: string }, seed: GrammarState | undefined, trust: number) {
    c.cacheStatesIn[i] = seed
    const r = tokenizeLine(hl, c.cacheLines[i], opts, seed)
    c.cacheRel[i] = r.rel
    c.version++
    c.tokenReady[i] = trust
    return r.state
}

function promoteRun(i: number) {
    for (const n = c.cacheLines.length; i < n && c.tokenReady[i] === GUESSED; i++) c.tokenReady[i] = READY
}

// —— 后台分词(Monaco DefaultBackgroundTokenizer)——
// 空闲时从第一行不是 READY 的行起往下推(它上一行的出口可信),每片 >1ms 就让出;deadline 内用 setTimeout0 接着推,
// 到点重新约空闲回调。推到猜着算的(GUESSED)行:state 对上整段升 READY,对不上重算(颜色就此纠正)。
// 真重算过的行区间 [from, to) 通知订阅者(view 重画视口里变了的行,minimap 重画)。没有订阅者(没挂着的 view)不跑。
const BG_SLICE_MS = 1

type IdleDeadline = { timeRemaining(): number }
const idleWindow = typeof window !== 'undefined' ? window as unknown as {
    requestIdleCallback?(cb: (d: IdleDeadline) => void): number
    MessageChannel?: typeof MessageChannel
} : undefined
let channel: { port: MessagePort, queue: (() => void)[] } | null = null
// Monaco setTimeout0:嵌套 setTimeout 会被钳到 4ms,浏览器里改走 postMessage
function setTimeout0(fn: () => void) {
    if (!idleWindow?.requestIdleCallback || !idleWindow.MessageChannel) { setTimeout(fn, 0); return }
    if (!channel) {
        const ch = new idleWindow.MessageChannel()
        const queue: (() => void)[] = []
        ch.port1.onmessage = () => queue.shift()?.()
        channel = { port: ch.port2, queue }
    }
    channel.queue.push(fn)
    channel.port.postMessage(0)
}

function runWhenIdle(fn: (endTime: number) => void) {
    if (idleWindow?.requestIdleCallback) idleWindow.requestIdleCallback(d => fn(Date.now() + d.timeRemaining()))
    else setTimeout(() => fn(Date.now() + 15), 0)
}

function scheduleBackground(cache: TokenCache) {
    if (cache.bgScheduled || !cache.listeners.size || cache.bgFrom >= cache.cacheLines.length) return
    cache.bgScheduled = true
    if (!cache.bgStarted) {
        cache.bgStarted = true
        cache.cancelFirstPaint = afterNextPaint(() => { cache.cancelFirstPaint = null; cache.bgScheduled = false; scheduleBackground(cache) })
        return
    }
    runWhenIdle(endTime => {
        cache.bgScheduled = false
        const execute = () => {
            if (!cache.listeners.size || cache.bgFrom >= cache.cacheLines.length) return
            const done = backgroundSlice(cache)
            if (done) return
            if (Date.now() < endTime) setTimeout0(execute)
            else scheduleBackground(cache)
        }
        execute()
    })
}

// 推一片;返回 true = 全文都 READY 了(或推不动)
function backgroundSlice(cache: TokenCache): boolean {
    const prev = c
    c = cache
    let lo = Infinity, hi = -1
    try {
        if (c.pendingLines && c.cacheHl && c.cacheLang && c.cacheTheme)
            ensureTokenCache(c.cacheHl, c.pendingLines, { lang: c.cacheLang, theme: c.cacheTheme })
        const hl = c.cacheHl
        const n = c.cacheLines.length
        if (!hl || !c.cacheLang || !c.cacheTheme || c.pendingLines || c.cacheRel.length !== n) return true
        const opts = { lang: c.cacheLang, theme: c.cacheTheme }
        let i = c.bgFrom
        while (i < n && c.tokenReady[i] === READY) i++
        if (i >= n) { c.bgFrom = n; return true }
        // 上一行 READY:入口可信,重算它一遍拿出口(statesIn[i] 可能是猜的那段的入口,不能当出口用)
        let seed = i > 0 ? tokenizeLine(hl, c.cacheLines[i - 1], opts, c.cacheStatesIn[i - 1]).state : undefined
        const t0 = performance.now()
        while (i < n) {
            // 已 tokenize 且入口对得上:猜的那段整段升 READY,跳到下一处不可信的行
            if (c.tokenReady[i] && stateEq(seed, c.cacheStatesIn[i])) {
                promoteRun(i)
                while (i < n && c.tokenReady[i] === READY) i++
                if (i < n) seed = i > 0 ? tokenizeLine(hl, c.cacheLines[i - 1], opts, c.cacheStatesIn[i - 1]).state : undefined
                continue
            }
            if (performance.now() - t0 > BG_SLICE_MS) break
            // 猜的视口入口不对:这段正在被画,颜色都是错的。整段重算完再让出,一次通知盖住它。
            // 切在中间的话,后半段通知会被 view 的 16ms 合帧丢掉,屏幕留着一半旧色。
            const guessed = c.tokenReady[i] === GUESSED
            seed = tokenizeAt(hl, i, opts, seed, READY)
            if (i < lo) lo = i
            hi = i + 1
            i++
            if (guessed) {
                while (i < n && c.tokenReady[i] === GUESSED && !stateEq(seed, c.cacheStatesIn[i])) {
                    seed = tokenizeAt(hl, i, opts, seed, READY)
                    hi = i + 1
                    i++
                }
            }
        }
        if (i >= n) c.cacheStatesIn[n] = seed
        c.bgFrom = i
        if (hi > lo) for (const fn of c.listeners) fn(lo, hi)
        return i >= n
    } catch {
        return true
    } finally {
        c = prev
    }
}

/** 订阅 owner 缓存的后台分词进度:fn(from, to) 是刚重算过的行下标 [from, to)(0 起)。返回退订。订阅即开始后台分词。 */
export function subscribeTokens(owner: object, fn: (from: number, to: number) => void): () => void {
    let cache = cacheByOwner.get(owner)
    if (!cache) {
        cache = new TokenCache()
        cacheByOwner.set(owner, cache)
    }
    const target = cache
    target.listeners.add(fn)
    scheduleBackground(target)
    return () => {
        target.listeners.delete(fn)
        if (!target.listeners.size && target.cancelFirstPaint) {
            target.cancelFirstPaint()
            target.cancelFirstPaint = null
            target.bgStarted = false
            target.bgScheduled = false
        }
    }
}

function rebase(rel: TokenRow[], lines: string[]): ScopedToken[][] {
    const out: ScopedToken[][] = new Array(rel.length)
    let pos = 0
    for (let i = 0; i < rel.length; i++) {
        out[i] = rowTokens(rel[i], lines[i], pos)
        pos += lines[i].length + 1
    }
    return out
}

// 用 ChangeSet 把旧行表增量改成新行表(O(脏段+拼接),非 O(全文 toJSON))。
export function linesAfterChanges(oldLines: string[], oldDoc: Rope, newDoc: Rope, changes: ChangeSet): string[] {
    if (changes.empty) return oldLines
    // 改动区间按位置升序:只有第一段的起点和最后一段的终点决定脏行范围(5 万处改动不必 20 万次 lineAt)
    let first = -1, lastToA = 0, firstB = 0, lastToB = 0
    changes.iterChangedRanges((fromA, toA, fromB, toB) => {
        if (first < 0) { first = fromA; firstB = fromB }
        lastToA = toA; lastToB = toB
    })
    if (first < 0) return oldLines
    const minOld = oldDoc.lineAt(first).number
    const maxOld = oldDoc.lineAt(Math.min(lastToA, oldDoc.length)).number
    const minNew = newDoc.lineAt(firstB).number
    const maxNew = newDoc.lineAt(Math.min(lastToB, newDoc.length)).number
    const head = oldLines.slice(0, minOld - 1)
    const mid = newDoc.lineTexts(minNew, maxNew)
    const tail = oldLines.slice(maxOld)
    // head+mid+tail 仍拷指针 O(行数);比 toJSON 建字符串便宜一个数量级
    if (head.length === 0) return mid.concat(tail)
    if (tail.length === 0) return head.concat(mid)
    return head.concat(mid, tail)
}

// 热路径:EditorView.update 在 decoration 前调用 → c.pendingLines。
// 单行无换行编辑:原地改行表(O(1)),避免 20 万行数组拼接。
// 上一笔还没被消费(两笔事务之间没人取 token)就接着 pending 改,脏区取并集 —— 否则上一笔原地改过的行
// 跟 cacheLines 已经"一样",比文本找不出它脏了。
export function prepareLinesFromTransaction(tr: { docChanged: boolean, startState: { doc: Rope }, newDoc: Rope, changes: ChangeSet }): void {
    if (!tr.docChanged || !c.cacheLines.length) return
    const base = c.pendingLines ?? c.cacheLines
    if (base.length !== tr.startState.doc.lines) {
        // 对不上(外面换了 state):cacheLines 若已被原地改过就不再可信,下次整篇重建
        if (c.pendingLines === c.cacheLines) { c.cacheRel = []; c.version++ }
        clearPending()
        return
    }
    const prevStart = c.pendingLines ? c.dirtyStartHint : Infinity
    const prevTail = c.pendingLines ? c.dirtyTailHint : Infinity
    const oldDoc = tr.startState.doc
    const newDoc = tr.newDoc
    let ranges = 0
    let fromA = 0, toA = 0, fromB = 0, toB = 0
    tr.changes.iterChangedRanges((a, b, c, d) => {
        ranges++
        fromA = a; toA = b; fromB = c; toB = d
    })
    let start = Infinity, tail = Infinity
    if (ranges === 1) {
        const ol = oldDoc.lineAt(fromA)
        const ol2 = oldDoc.lineAt(Math.min(toA, oldDoc.length))
        const nl = newDoc.lineAt(fromB)
        const nl2 = newDoc.lineAt(Math.min(toB, newDoc.length))
        if (ol.number === ol2.number && nl.number === nl2.number && ol.number === nl.number) {
            base[ol.number - 1] = nl.text
            c.pendingLines = base
            start = ol.number - 1
            tail = newDoc.lines - nl.number
        }
    }
    if (start === Infinity) {
        // 升序:第一段定起点,最后一段定终点
        let firstA = -1, lastB = 0
        tr.changes.iterChangedRanges((a, _b, _c, d) => { if (firstA < 0) firstA = a; lastB = d })
        if (firstA >= 0) start = oldDoc.lineAt(firstA).number - 1
        const maxNew = firstA >= 0 ? newDoc.lineAt(Math.min(lastB, newDoc.length)).number : 0
        c.pendingLines = linesAfterChanges(base, oldDoc, newDoc, tr.changes)
        if (start === Infinity) start = 0
        tail = maxNew ? newDoc.lines - maxNew : 0
    }
    c.dirtyStartHint = Math.min(prevStart, start)
    c.dirtyTailHint = Math.min(prevTail, tail)
}

export function ensureTokenCache(hl: ScopedShiki, lines: string[], opts: { lang: string; theme: string }): boolean {
    if (hl.getLoadedLanguages && !hl.getLoadedLanguages().includes(opts.lang)) return false

    // 干净命中
    if (!c.pendingLines && hl === c.cacheHl && opts.lang === c.cacheLang && opts.theme === c.cacheTheme
        && lines === c.cacheLines && c.cacheRel.length === lines.length)
        return true

    try {
        if (hl !== c.cacheHl || opts.lang !== c.cacheLang || opts.theme !== c.cacheTheme || !c.cacheRel.length) {
            if (lines.length <= EAGER_MAX_LINES) installFull(hl, lines, opts)
            else installSkeleton(hl, lines, opts)
            return true
        }

        const oldLines = c.cacheLines
        const minLen = Math.min(lines.length, oldLines.length)
        // 有 pending 时用它记的脏区夹住文本对比(原地改过的行比不出来);同一份行表就不用逐行比
        const hinted = !!c.pendingLines && c.dirtyStartHint >= 0
        const headCap = hinted ? c.dirtyStartHint : Infinity
        const tailCap = hinted ? c.dirtyTailHint : Infinity
        let start = 0
        if (hinted && lines === c.pendingLines) {
            start = Math.min(headCap, minLen)
        } else {
            while (start < minLen && start < headCap && lines[start] === oldLines[start]) start++
        }
        if (start === lines.length && lines.length === oldLines.length) {
            c.cacheLines = lines
            clearPending()
            return true
        }

        let tailLen = 0
        while (tailLen < minLen - start && tailLen < tailCap && lines[lines.length - 1 - tailLen] === oldLines[oldLines.length - 1 - tailLen]) tailLen++
        const shift = lines.length - oldLines.length
        // [start, dirtyEnd) 的文本改了:收敛只能在这之后算(整篇替换、多光标、多行粘贴时首行可能没变)
        const dirtyEnd = Math.max(start + 1, lines.length - tailLen)
        // 改动行上一行的出口可信,重算出来的才可信(见 ensureTokenizedRange)
        const trust = start === 0 || c.tokenReady[start - 1] === READY ? READY : GUESSED
        c.bgFrom = Math.min(c.bgFrom, start)

        if (shift === 0) {
            // 只备份脏窗口的旧 state/ready(禁止 c.cacheStatesIn.slice() 全文 O(n))
            const limit = Math.min(lines.length, start + EDIT_RETOKENIZE_MAX)
            const win = limit - start + 1
            const oldStatesWin = c.cacheStatesIn.slice(start, start + win + 1)
            const oldReadyWin = c.tokenReady.slice(start, Math.min(c.tokenReady.length, start + win + 1))
            const oldStateAt = (abs: number) => {
                const j = abs - start
                return j >= 0 && j < oldStatesWin.length ? oldStatesWin[j] : undefined
            }
            const oldReadyAt = (abs: number) => {
                const j = abs - start
                return j >= 0 && j < oldReadyWin.length ? oldReadyWin[j] : 0
            }

            let seed = oldStatesWin[0]
            let i = start
            let converged = false
            for (; i < limit; i++) {
                c.cacheStatesIn[i] = seed
                const r = tokenizeLine(hl, lines[i], opts, seed)
                c.cacheRel[i] = r.rel
                c.version++
                seed = r.state
                c.cacheStatesIn[i + 1] = seed
                c.tokenReady[i] = trust
                // 下游已 tokenize 且 line-state 对齐 → 隔离成功,后面不用动(Monaco isolation)
                if (i + 1 >= dirtyEnd && i + 1 < lines.length && oldReadyAt(i + 1) && stateEq(seed, oldStateAt(i + 1))) {
                    converged = true
                    if (trust === READY) promoteRun(i + 1)
                    break
                }
            }
            if (i >= lines.length - 1) c.cacheStatesIn[lines.length] = seed
            // 未收敛:作废窗口外 ready,视口再补;绝不全文连锁。i 是第一行没重算的(它的入口刚被盖掉,旧 token 不能留)
            if (!converged && i < lines.length) clearReadyFrom(i)
            c.cacheLines = lines
            fixLineStartsFrom(start, dirtyEnd)
            clearPending()
            scheduleBackground(c)
            return true
        }

        // 行数变化
        if (Math.abs(shift) > EDIT_RETOKENIZE_MAX) {
            // 大块换行/整篇替换:骨架重建,视口再补
            installSkeleton(hl, lines, opts)
            return true
        }

        // 窗口 [start, i) 重新分词,i 之后(收敛了)整段沿用旧的、只是挪了 shift 个位置。
        // 整段沿用用原生 slice/concat/set(内存拷贝),不逐行 JS 赋值:10 万行 Enter 时 ~0.2 ms,以前 ~1.5 ms 外加三个 10 万项的稀疏数组
        const segRel: TokenRow[] = []
        const segStates: (GrammarState | undefined)[] = []
        let seed = c.cacheStatesIn[start]
        let i = start
        let convergedAt = -1
        const limit = Math.min(lines.length, start + EDIT_RETOKENIZE_MAX)
        for (; i < limit; i++) {
            const oldIdx = i - shift
            if (i >= lines.length - tailLen && oldIdx >= 0 && oldIdx < oldLines.length
                && c.tokenReady[oldIdx] && stateEq(seed, c.cacheStatesIn[oldIdx])) {
                convergedAt = i
                break
            }
            segStates.push(seed)
            const r = tokenizeLine(hl, lines[i], opts, seed)
            segRel.push(r.rel)
            seed = r.state
        }
        const n = lines.length
        const oldStarts = c.cacheLineStart
        let newRel: TokenRow[]
        let newStates: (GrammarState | undefined)[]
        const newReady = new Uint8Array(n)
        if (convergedAt >= 0) {
            const j0 = convergedAt - shift
            newRel = c.cacheRel.slice(0, start).concat(segRel, c.cacheRel.slice(j0))
            // 状态表比行表多一项(末行之后):旧的尾项原样带过来
            newStates = c.cacheStatesIn.slice(0, start).concat(segStates, c.cacheStatesIn.slice(j0))
            newReady.set(c.tokenReady.subarray(0, start), 0)
            newReady.fill(trust, start, convergedAt)
            newReady.set(c.tokenReady.subarray(j0), convergedAt)
        }
        else {
            newRel = new Array(n)
            newStates = new Array(n + 1)
            for (let k = 0; k < start; k++) {
                newRel[k] = c.cacheRel[k]
                newStates[k] = c.cacheStatesIn[k]
                newReady[k] = c.tokenReady[k]
            }
            for (let k = 0; k < segRel.length; k++) {
                newRel[start + k] = segRel[k]
                newStates[start + k] = segStates[k]
                newReady[start + k] = trust
            }
            newStates[i] = seed
            for (let k = 0; k < n; k++) {
                if (!newRel[k]) newRel[k] = EMPTY_REL
            }
        }
        c.cacheLines = lines
        c.cacheRel = newRel
        c.version++
        c.cacheStatesIn = newStates
        c.tokenReady = newReady
        if (trust === READY && i < n && newReady[i] === GUESSED) promoteRun(i)
        if (start > 0 && start < oldStarts.length) {
            const starts = new Array(n + 1)
            for (let k = 0; k <= start; k++) starts[k] = oldStarts[k]
            const end = convergedAt >= 0 ? convergedAt : n
            let p = starts[start]
            for (let k = start; k < end; k++) {
                starts[k] = p
                p += lines[k].length + 1
            }
            if (convergedAt >= 0 && oldStarts.length === oldLines.length + 1) {
                // 沿用的那段只是整体平移了 p - 它原来的起点 个字符
                const j0 = convergedAt - shift
                const d = p - oldStarts[j0]
                for (let k = convergedAt; k <= n; k++) starts[k] = oldStarts[k - shift] + d
            }
            else {
                for (let k = end; k < n; k++) {
                    starts[k] = p
                    p += lines[k].length + 1
                }
                starts[n] = p
            }
            c.cacheLineStart = starts
        }
        else {
            c.cacheLineStart = rebuildLineStarts(lines)
        }
        clearPending()
        scheduleBackground(c)
        return true
    } catch {
        return false
    }
}

// ensure = false:只读已有的 token(没分过词的行是空数组,画成默认色,等后台分词补上再重画)
export function tokensInLineRange(fromLine: number, toLine: number, ensure = true): ScopedToken[][] {
    const n = c.cacheLines.length
    if (!n || c.cacheRel.length !== n) return []
    if (ensure) ensureTokenizedRange(fromLine, toLine)
    const a = Math.max(0, Math.min(n - 1, fromLine - 1))
    const b = Math.max(a, Math.min(n - 1, toLine - 1))
    const out: ScopedToken[][] = new Array(b - a + 1)
    for (let i = a; i <= b; i++) {
        const base = c.cacheLineStart[i] ?? 0
        out[i - a] = rowTokens(c.cacheRel[i] ?? EMPTY_REL, c.cacheLines[i], base)
    }
    return out
}

export function tokenVersion(): number {
    return c.version
}

// 给 minimap 等需要「相对 token 行表」的消费者(不 rebase 绝对 offset)。
export function cachedRelTokens(): { lines: string[], rel: TokenRow[] } | null {
    if (!c.cacheRel.length) return null
    return { lines: c.cacheLines, rel: c.cacheRel }
}

export function sharedTokens(hl: ScopedShiki, code: string, opts: { lang: string; theme: string }): ScopedToken[][] | null {
    if (hl.getLoadedLanguages && !hl.getLoadedLanguages().includes(opts.lang)) return null
    if (hl === c.cacheHl && opts.lang === c.cacheLang && opts.theme === c.cacheTheme
        && c.cacheLines.length && code === c.cacheLines.join('\n'))
        return rebase(c.cacheRel, c.cacheLines)
    const lines = code.split('\n')
    if (!ensureTokenCache(hl, lines, opts)) return null
    return rebase(c.cacheRel, c.cacheLines)
}

export function sharedTokensLines(hl: ScopedShiki, lines: string[], opts: { lang: string; theme: string }): ScopedToken[][] | null {
    if (!ensureTokenCache(hl, lines, opts)) return null
    return rebase(c.cacheRel, c.cacheLines)
}

// 当前已 commit 的缓存行表。
export function cachedLines(): string[] | null {
    return c.cacheLines.length ? c.cacheLines : null
}

// 括号跳字符串/注释用(brackets.ts):当前缓存的只读视图。有挂起的编辑先并进来(同高亮装饰的做法)。
export function tokenLinesView(): {
    hl: ScopedShiki, lang: string, theme: string, lines: string[], rel: TokenRow[],
    statesIn: (GrammarState | undefined)[], ready: Uint8Array, lineStart: number[], maxLineLength: number,
} | null {
    if (c.pendingLines && c.cacheHl && c.cacheLang && c.cacheTheme)
        ensureTokenCache(c.cacheHl, c.pendingLines, { lang: c.cacheLang, theme: c.cacheTheme })
    if (!c.cacheHl || !c.cacheLang || !c.cacheTheme || c.pendingLines || !c.cacheLines.length || c.cacheRel.length !== c.cacheLines.length) return null
    return { hl: c.cacheHl, lang: c.cacheLang, theme: c.cacheTheme, lines: c.cacheLines, rel: c.cacheRel, statesIn: c.cacheStatesIn, ready: c.tokenReady, lineStart: c.cacheLineStart, maxLineLength: c.maxLineLength }
}

// decoration 用:优先 pending(与 doc.lines 对齐),再 cache,再 null(调用方 toJSON)。
export function linesForDoc(docLines: number): string[] | null {
    if (c.pendingLines && c.pendingLines.length === docLines) return c.pendingLines
    if (c.cacheLines.length === docLines) return c.cacheLines
    return null
}
