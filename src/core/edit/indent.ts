// 缩进代数：前导空白 → 列 / 深度。fold / guides / sticky 共用。

import type { Rope } from '../model/rope'
import { selectTokenCache, tokenLinesView } from '../view/tokens'
import { bracketSkip, stripSkippedBrackets } from './brackets'

export function leadingCols(text: string, tabSize: number): number {
    let cols = 0
    for (let i = 0; i < text.length; i++) {
        const c = text.charCodeAt(i)
        if (c === 32) cols += 1
        else if (c === 9) cols += tabSize - (cols % tabSize)
        else break
    }
    return cols
}

export function indentDepth(text: string, unit: number): number {
    return Math.floor(leadingCols(text, unit) / unit)
}

// 缩进单位探测 = VS Code guessIndentation 的 tabSize 部分(textModel/indentationGuesser.ts):
// 相邻两条非空行前导空白之差计票(2/4/6/8/3/5/7 里票最多的胜),4 胜但 2 的票 ≥ 4 的一半时取 2。
// 只算「差」而不是「最小缩进」:JSDoc 的 ` * `(差 1)、续行对齐不会把单位拉成 1。
// 用 tab 缩进的行多于空格行 → 单位 = tabSize;没有证据 → tabSize。
const GUESSES = [2, 4, 6, 8, 3, 5, 7]

function spacesDiff(a: string, b: string): number {
    // 公共前缀之后,各自剩下的前导空白里数空格/tab;两边都混用就不算
    let i = 0
    const aw = leadingWs(a), bw = leadingWs(b)
    while (i < aw && i < bw && a.charCodeAt(i) === b.charCodeAt(i)) i++
    let aS = 0, aT = 0, bS = 0, bT = 0
    for (let j = i; j < aw; j++) a.charCodeAt(j) === 32 ? aS++ : aT++
    for (let j = i; j < bw; j++) b.charCodeAt(j) === 32 ? bS++ : bT++
    if ((aS > 0 && aT > 0) || (bS > 0 && bT > 0)) return 0
    const tabsDiff = Math.abs(aT - bT)
    const sp = Math.abs(aS - bS)
    if (tabsDiff === 0) return sp
    return sp % tabsDiff === 0 ? sp / tabsDiff : 0
}

export function detectIndentWidth(lines: string[], tabSize: number, sampleLines = 10000): number {
    const votes = new Array<number>(9).fill(0)
    let prev = ''
    let tabLines = 0, spaceLines = 0
    const n = Math.min(lines.length, sampleLines)
    for (let i = 0; i < n; i++) {
        const text = lines[i]
        const ws = leadingWs(text)
        if (ws === text.length) continue // 空行/纯空白行不参与
        if (ws > 0) text.charCodeAt(0) === 9 ? tabLines++ : spaceLines++
        const d = spacesDiff(prev, text)
        if (d <= 8) votes[d]++
        prev = text
    }
    if (tabLines > spaceLines) return tabSize
    let best = tabSize, score = 0
    for (const g of GUESSES) if (votes[g] > score) { score = votes[g]; best = g }
    if (best === 4 && votes[4] > 0 && votes[2] > 0 && votes[2] >= votes[4] / 2) best = 2
    return best
}

export function indentOf(text: string, tabSize = 4): number {
    // 折叠范围对每一行都问一遍:先在缩进后第一个字符上定「不是空白行」(ASCII 可见字符,绝大多数),不分配 trim() 的新串
    const n = text.length
    let cols = 0, i = 0
    for (; i < n; i++) {
        const c = text.charCodeAt(i)
        if (c === 32) cols += 1
        else if (c === 9) cols += tabSize - (cols % tabSize)
        else break
    }
    if (i === n) return -1
    const c = text.charCodeAt(i)
    if (c > 32 && c < 127) return cols
    return text.trim() === '' ? -1 : cols
}

export function leadingIndent(text: string, tabSize = 4): number {
    return leadingCols(text, tabSize)
}

export function leadingWs(text: string): number {
    let n = 0
    while (n < text.length && (text.charCodeAt(n) === 32 || text.charCodeAt(n) === 9)) n++
    return n
}

// Monaco guessIndentation(textModel/indentationGuesser.ts)整段:除 tabSize 外还猜 insertSpaces。
// Detect Indentation from Content 用;defaultTabSize / defaultInsertSpaces 是没被命令改过的配置。
function spacesDiffFull(a: string, aLen: number, b: string, bLen: number): { diff: number, alignment: boolean } {
    let i = 0
    while (i < aLen && i < bLen && a.charCodeAt(i) === b.charCodeAt(i)) i++
    let aS = 0, aT = 0, bS = 0, bT = 0
    for (let j = i; j < aLen; j++) a.charCodeAt(j) === 32 ? aS++ : aT++
    for (let j = i; j < bLen; j++) b.charCodeAt(j) === 32 ? bS++ : bT++
    if ((aS > 0 && aT > 0) || (bS > 0 && bT > 0)) return { diff: 0, alignment: false }
    const tabsDiff = Math.abs(aT - bT)
    const sp = Math.abs(aS - bS)
    if (tabsDiff === 0) {
        // 上一行以 `,` 结尾、这一行对齐到上一行某个词 → 像是续行对齐,不当缩进
        let alignment = false
        if (sp > 0 && 0 <= bS - 1 && bS - 1 < a.length && bS < b.length
            && b.charCodeAt(bS) !== 32 && a.charCodeAt(bS - 1) === 32 && a.charCodeAt(a.length - 1) === 44)
            alignment = true
        return { diff: sp, alignment }
    }
    return { diff: sp % tabsDiff === 0 ? sp / tabsDiff : 0, alignment: false }
}

/**
 * guessIndentation 的「只报告有把握的部分」版本(宿主可能已经通过别的途径配了 tabSize / indentUnit,
 * 内容里没有缩进线索时不该拿默认值去盖它):没把握的字段是 undefined。
 */
export function detectIndentationHints(lines: string[]): { tabSize?: number, insertSpaces?: boolean } {
    const a = guessIndentation(lines, -1, true), b = guessIndentation(lines, -1, false)
    const out: { tabSize?: number, insertSpaces?: boolean } = {}
    if (a.insertSpaces === b.insertSpaces) out.insertSpaces = a.insertSpaces
    // 只有空格缩进才投票得出 tabSize;没票时原样返回默认值(-1)
    const ts = a.insertSpaces ? a.tabSize : b.insertSpaces ? b.tabSize : -1
    if (out.insertSpaces && ts > 0) out.tabSize = ts
    return out
}

export function guessIndentation(lines: string[], defaultTabSize: number, defaultInsertSpaces: boolean): { tabSize: number, insertSpaces: boolean } {
    const n = Math.min(lines.length, 10000)
    let tabLines = 0, spaceLines = 0
    let prevText = '', prevIndent = 0
    const votes = new Array<number>(9).fill(0)
    for (let i = 0; i < n; i++) {
        const text = lines[i]
        let indent = 0, spaces = 0, tabs = 0, content = false
        for (let j = 0; j < text.length; j++) {
            const c = text.charCodeAt(j)
            if (c === 9) tabs++
            else if (c === 32) spaces++
            else { content = true; indent = j; break }
        }
        if (!content) continue
        if (tabs > 0) tabLines++
        else if (spaces > 1) spaceLines++
        const d = spacesDiffFull(prevText, prevIndent, text, indent)
        if (d.alignment && !(defaultInsertSpaces && defaultTabSize === d.diff)) continue
        if (d.diff <= 8) votes[d.diff]++
        prevText = text
        prevIndent = indent
    }
    let insertSpaces = defaultInsertSpaces
    if (tabLines !== spaceLines) insertSpaces = tabLines < spaceLines
    let tabSize = defaultTabSize
    if (insertSpaces) {
        let score = 0
        for (const g of GUESSES) if (votes[g] > score) { score = votes[g]; tabSize = g }
        if (tabSize === 4 && votes[4] > 0 && votes[2] > 0 && votes[2] >= votes[4] / 2) tabSize = 2
    }
    return { tabSize, insertSpaces }
}

// —— 缩进规则要看的 token(Monaco IndentationLineProcessor / ProcessedIndentRulesSupport)——
// Reindent 套 indentationRules 前把字符串 / 注释 / 正则里的括号删掉(括号跳过表,见 brackets.ts);
// 行首 token 是字符串的行(模板串续行、`"…"` 开头)整行不动(getReindentEditOperations 的 doesLineStartWithString)。
// owner 通常是 EditorView(它的 token 缓存);没 token 信息时照纯文本。

const SCOPE_TYPE_RE = /\b(comment|string|regex|meta\.embedded)\b/
const TEMPLATE_EXPR_SCOPE = /\bmeta\.template\.expression\b/

// scope 栈(根 → 叶)的 StandardTokenType,同 brackets.ts isSkipScopes 的读法
function scopeType(scopes: readonly string[]): 'comment' | 'string' | 'regex' | null {
    let t: 'comment' | 'string' | 'regex' | null = null
    for (const s of scopes) {
        const m = SCOPE_TYPE_RE.exec(s)
        if (m) t = m[1] === 'meta.embedded' ? null : m[1] as 'comment' | 'string' | 'regex'
        else if (TEMPLATE_EXPR_SCOPE.test(s)) t = null
    }
    return t
}

export interface IndentRuleLines {
    /** 第 n 行(1 起)去掉不算的括号;indent 给了就换掉前导空白(getProcessedLine(n, newIndentation))。 */
    text(n: number, indent?: string): string
    /** 第 n 行行首 token 是字符串。 */
    startsWithString(n: number): boolean
}

export function indentRuleLines(owner: object | null | undefined, doc: Rope): IndentRuleLines {
    const skip = bracketSkip(owner, doc)
    selectTokenCache(owner)
    let v = tokenLinesView()
    if (v && (v.lines.length !== doc.lines || v.lineStart[doc.lines] !== doc.length + 1)) v = null
    return {
        text(n, indent) {
            const line = doc.line(n)
            const t = stripSkippedBrackets(line.text, line.from, skip)
            return indent === undefined ? t : indent + t.slice(leadingWs(t))
        },
        startsWithString(n) {
            if (!v || !v.ready[n - 1]) return false
            const text = doc.line(n).text
            if (!text) return false
            const st = v.statesIn[n - 1]
            const entry = st ? scopeType(st.getInternalStack?.()?.contentNameScopesList?.getScopeNames?.() ?? st.getScopes() ?? []) : null
            // 接着上一行的字符串(模板串续行):除非一上来就是 `${`
            if (entry === 'string') return !text.startsWith('${')
            if (entry) return false
            // 代码里:第一个字符就起一个字符串
            const c = text[0]
            return (c === '"' || c === '\'' || c === '`') && !!skip?.(doc.line(n).from)
        },
    }
}
