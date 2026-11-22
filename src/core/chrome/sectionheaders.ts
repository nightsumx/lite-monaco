// minimap 的区段标题(Monaco findSectionHeaders + minimap _renderSectionHeaders 的文字适配)。
//   showRegionSectionHeaders:折叠标记 `#region 名字` 这一行,标题 = 标记后面的文字;
//   showMarkSectionHeaders:注释里的 `MARK: 名字`,标题 = MARK: 后面的文字。
// 标题去首尾空白;以 `-` 开头的有分隔线(hasSeparatorLine),然后去掉首尾的 `-`;标题和分隔线都没有的不算。
// MARK 标题必须落在注释里(Monaco 查 token 是注释),region 标题不查。

import { markerPrefilter, type FoldMarkers, type MarkerStep } from '../edit/fold'
import { isMultilineRegexSource } from '../edit/find'

export interface SectionHeader {
    line: number // 1 起,标题起始行
    startColumn: number // 1 起;region = 标题文字起列,MARK = 整个匹配的起列(Monaco 同)
    endLine: number // 多行 MARK 正则才会 > line
    endColumn: number // endLine 上的结束列
    text: string
    hasSeparatorLine: boolean
    shouldBeInComments: boolean
}

/** Monaco minimap.markSectionHeaderRegex 的默认值:必须带命名组 label,可选 separator;含 \n 的正则可匹配多行标题 */
export const DEFAULT_MARK_SECTION_HEADER_REGEX = '\\bMARK:\\s*(?<separator>\\-?)\\s*(?<label>.*)$'

export interface SectionHeaderOptions {
    region: boolean
    mark: boolean
    markers: FoldMarkers | null
    /** 默认 DEFAULT_MARK_SECTION_HEADER_REGEX;空串 / 会死循环的正则 = 不找 MARK 标题 */
    markRegex?: string
}

const TRIM_DASHES = /^-+|-+$/g
const CHUNK_SIZE = 100 // 多行正则按 100 行一块扫,块与块重叠 MAX_SECTION_LINES 行,免得标题被块边界切开
const MAX_SECTION_LINES = 5

const isSpace = (c: string | undefined) => c === ' ' || c === '\t'
const isWordChar = (c: string | undefined) => !!c && /[A-Za-z0-9_]/.test(c)

/** fold.ts matchMarker 的同款步骤,但返回吃掉了多少字符(Monaco 用 match[0].length);不匹配返回 -1。markers.regex(语言配置里的 RegExp)优先 */
function markerLength(text: string, markers: FoldMarkers, steps: MarkerStep[] | null): number {
    if (markers.regex) return text.match(markers.regex.start)?.[0].length ?? -1
    let i = 0
    while (isSpace(text[i])) i++
    for (const step of steps!) {
        if (typeof step === 'string') {
            if (!text.startsWith(step, i)) return -1
            i += step.length
        } else if ('ws' in step) {
            const s = i
            while (isSpace(text[i])) i++
            if (i - s < step.ws) return -1
        } else if ('opt' in step) {
            if (text.startsWith(step.opt, i)) i += step.opt.length
        } else if ('word' in step) {
            if (!text.startsWith(step.word, i) || isWordChar(text[i + step.word.length])) return -1
            i += step.word.length
        } else if (text.indexOf(step.then, i) < 0) return -1
    }
    return i
}

function headerText(raw: string): { text: string, hasSeparatorLine: boolean } {
    const t = raw.trim()
    return { text: t.replace(TRIM_DASHES, ''), hasSeparatorLine: t.startsWith('-') }
}

/** Monaco regExpLeadsToEndlessLoop:能匹配空串且 lastIndex 不前进的正则 */
function leadsToEndlessLoop(re: RegExp): boolean {
    if (re.source === '^' || re.source === '^$' || re.source === '$' || re.source === '^\\s*$') return false
    const m = re.exec('')
    return !!m && re.lastIndex === 0
}

function collectRegionHeaders(lines: readonly string[], markers: FoldMarkers, out: SectionHeader[]): void {
    const pre = markerPrefilter(markers)
    const starts: (MarkerStep[] | null)[] = markers.regex ? [null] : markers.start
    for (let n = 1; n <= lines.length; n++) {
        const text = lines[n - 1]
        if (pre && !pre(text)) continue
        for (const steps of starts) {
            const len = markerLength(text, markers, steps)
            if (len < 0) continue
            if (text.length > len) {
                const h = headerText(text.substring(len))
                if (h.text || h.hasSeparatorLine) out.push({ line: n, startColumn: len + 1, endLine: n, endColumn: text.length + 1, ...h, shouldBeInComments: false })
            }
            break
        }
    }
}

/** 标题正则:空串 / 非法 / 会死循环的不找 MARK 标题;含 \n 的源码(isMultilineRegexSource)可匹配多行标题 */
function markRegexOf(source: string): RegExp | null {
    if (!source || source.trim() === '') return null
    let re: RegExp
    try { re = new RegExp(source, `gdm${isMultilineRegexSource(source) ? 's' : ''}`) } catch { return null }
    return leadsToEndlessLoop(re) ? null : re
}

/**
 * Monaco collectMarkHeaders:命名组 label = 标题,separator 非空 = 有分隔线;已有标题盖住的行不再出第二个。
 * 多行正则(源码含 \n / \r / \W)分 100 行一块拼成整段文本匹配,块间重叠 5 行免得标题被块边界切开;
 * 其余正则一行一行匹配(同 Monaco 查找:非多行正则不跨行,`\s*` 不会吃掉换行把下一行当标题)——
 * 这样每行互相独立,minimap 打字时可以只重扫变了的行(updateSectionHeaders)。
 */
function collectMarkHeaders(lines: readonly string[], markRegex: string, out: SectionHeader[]): void {
    const re = markRegexOf(markRegex)
    if (!re) return
    let prevEnd = 0
    const scan = (text: string, firstLine: number) => {
        re.lastIndex = 0
        let m: RegExpExecArray | null
        while ((m = re.exec(text)) !== null) {
            const before = text.substring(0, m.index)
            const startLine = firstLine + (before.match(/\n/g)?.length ?? 0)
            const mLines = m[0].split('\n')
            const startColumn = m.index - (before.lastIndexOf('\n') + 1) + 1
            const endColumn = mLines.length === 1 ? startColumn + m[0].length : mLines[mLines.length - 1].length + 1
            const label = m.groups?.label ?? ''
            const hasSeparatorLine = (m.groups?.separator ?? '') !== ''
            if ((label || hasSeparatorLine) && prevEnd < startLine) {
                prevEnd = startLine + mLines.length - 1
                out.push({ line: startLine, startColumn, endLine: prevEnd, endColumn, text: label, hasSeparatorLine, shouldBeInComments: true })
            }
            re.lastIndex = m.index + Math.max(1, m[0].length) // 空匹配也要前进
        }
    }
    if (isMultilineRegexSource(markRegex)) {
        for (let start = 1; start <= lines.length; start += CHUNK_SIZE - MAX_SECTION_LINES)
            scan(lines.slice(start - 1, Math.min(start + CHUNK_SIZE - 1, lines.length)).join('\n'), start)
        return
    }
    // 默认正则必含字面量 MARK:,绝大多数行没有,indexOf 比正则快得多
    const needle = markRegex === DEFAULT_MARK_SECTION_HEADER_REGEX ? 'MARK:' : ''
    for (let n = 1; n <= lines.length; n++) if (!needle || lines[n - 1].includes(needle)) scan(lines[n - 1], n)
}

/** minimap 区段标题(Monaco findSectionHeaders):先 region 后 MARK,各自按行号序;行表 = 每行文本 */
export function findSectionHeaders(lines: readonly string[], opts: SectionHeaderOptions): SectionHeader[] {
    const out: SectionHeader[] = []
    if (opts.region && opts.markers) collectRegionHeaders(lines, opts.markers, out)
    if (opts.mark) collectMarkHeaders(lines, opts.markRegex ?? DEFAULT_MARK_SECTION_HEADER_REGEX, out)
    return out.sort((a, b) => a.line - b.line) // region 与 MARK 各自有序,合并成行号序(同行 region 在前)
}

/**
 * 编辑后的区段标题:上一次的行表和结果,加上新行表,只重扫变了的那一段,其余沿用(下面挪行号)。
 * 行表是 doc.toJSON():没动的行是同一个字符串对象,头尾各比一遍 === 就知道变了哪一段(10 万行 ~0.5ms,
 * 整篇重扫 ~6ms,minimap 每次打字都要)。结果与 findSectionHeaders(lines, opts) 逐项相同。
 */
export function updateSectionHeaders(
    prev: { lines: readonly string[], headers: SectionHeader[] } | null,
    lines: readonly string[],
    opts: SectionHeaderOptions,
): SectionHeader[] {
    // 多行 MARK 正则的标题可以跨过改动边界(还要对齐 100 行分块),不增量
    if (!prev || (opts.mark && isMultilineRegexSource(opts.markRegex ?? DEFAULT_MARK_SECTION_HEADER_REGEX))) return findSectionHeaders(lines, opts)
    const old = prev.lines
    const max = Math.min(old.length, lines.length)
    let head = 0
    while (head < max && old[head] === lines[head]) head++
    let tail = 0
    while (tail < max - head && old[old.length - 1 - tail] === lines[lines.length - 1 - tail]) tail++
    if (head === old.length && head === lines.length) return prev.headers
    const delta = lines.length - old.length
    const out: SectionHeader[] = []
    for (const h of prev.headers) if (h.line <= head) out.push(h)
    // 变了的那段:新行表的 [head, lines.length - tail)
    const mid = findSectionHeaders(lines.slice(head, lines.length - tail), opts)
    for (const h of mid) out.push({ ...h, line: h.line + head, endLine: h.endLine + head })
    for (const h of prev.headers) if (h.line > old.length - tail) out.push({ ...h, line: h.line + delta, endLine: h.endLine + delta })
    return out
}

/**
 * 标题太宽放不下时的截断(Monaco InnerMinimap._fitSectionHeader):取头尾两段,中间放省略号。
 * measure 是 canvas measureText(宽度),maxWidth 是画布宽 − 8。
 */
export function fitSectionHeader(measure: (s: string) => number, maxWidth: number, headerText: string): string {
    if (!headerText) return headerText
    const ellipsis = '…'
    const width = measure(headerText)
    const ellipsisWidth = measure(ellipsis)
    if (width <= maxWidth || width <= ellipsisWidth) return headerText
    const len = headerText.length
    const averageCharWidth = width / headerText.length
    const maxCharCount = Math.floor((maxWidth - ellipsisWidth) / averageCharWidth) - 1
    let half = Math.ceil(maxCharCount / 2)
    while (half > 0 && /\s/.test(headerText[half - 1])) --half
    return headerText.substring(0, half) + ellipsis + headerText.substring(len - (maxCharCount - half))
}
