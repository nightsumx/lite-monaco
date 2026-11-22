// 折行的文本侧模型(Monaco MonospaceLineBreaksComputer + ModelLineProjectionData + 模型行→视图行换算)。折行规则只有这一份。
//
// 布局真源仍是浏览器(CSS 折行):有真实布局时一律走 geometry 读屏上位置。这里服务「没有布局、但折点由文本 + 选项完全决定」的查询
// ——等宽假设下的固定列折行(wordWrap:'wordWrapColumn'),如 jsdom / 离屏 / 服务端算 hover 锚点、竖向移动、视图坐标投影。
//
// 三层:
//   1. computeLineProjection(text, cfg, injections) → LineProjection | null:一条模型行怎么折。
//      规则 = Monaco:Kinsoku 禁则(breakBefore / breakAfter 字符集 + CJK 表意字)、wordBreak(normal / keepAll)、
//      wrappingIndent(none / same / indent / deepIndent 的续行缩进列数)、全角 N 列、Tab 展到 tab stop、代理对不拆、转义 \n 折行。
//      null = 这行不折(也没有注入文字)。
//   2. LineProjection:breakOffsets + 每个断点的可见列 + 续行缩进(Monaco ModelLineProjectionData 语义)
//      + 行内「输出(视图行 index, offset)」↔「输入(模型行 offset)」的互换(含注入文字、光标停靠规则、affinity 归一)。
//   3. SoftWrapModel:一份文档(逐行取文本)上的视图坐标:模型 (line, offset) ↔ 视图 (line, row, col)、视图行内容 / 最小最大列、
//      按视图行平移、绝对视图行号。竖向移动(edit/vertical.ts)与垫片的 viewState 投影都只调它。
//
// 视图列 col 1 起;续行的 minColumn = 缩进长度 + 1(缩进是空格,不属于文本);row 0 起。
// 注入文字 = 行内 widget 画出来的纯文本(WidgetType.inlineText),它占折行宽度、占视图列,但不是文档内容。
import { WrappingIndent } from '../options/types'
import { EDITOR_DEFAULTS } from '../options/generated'

// ───────────── 选项 ─────────────

export interface WrapConfig {
    /** 折行列(可见列数);<= 0 不折 */
    column: number
    tabSize: number
    indent: WrappingIndent
    wordBreak: 'normal' | 'keepAll'
    /** 在这些字符之前可断(Monaco wordWrapBreakBeforeCharacters) */
    breakBefore: string
    /** 在这些字符之后可断(Monaco wordWrapBreakAfterCharacters) */
    breakAfter: string
    /** 全角字符占几列(= typicalFullwidthCharacterWidth / typicalHalfwidthCharacterWidth);等宽假设下 2 */
    fullWidth: number
    /** 字符串里字面的 \n 触发折行(Monaco wrapOnEscapedLineFeeds) */
    escapedLineFeeds: boolean
}

export function wrapConfig(c: Partial<WrapConfig> & { column: number }): WrapConfig {
    return {
        tabSize: 4, indent: WrappingIndent.Same, wordBreak: 'normal', fullWidth: 2, escapedLineFeeds: false,
        breakBefore: EDITOR_DEFAULTS.wordWrapBreakBeforeCharacters, breakAfter: EDITOR_DEFAULTS.wordWrapBreakAfterCharacters,
        ...c,
    }
}

// ───────────── 注入文字 ─────────────

export interface InjectedTextOptions {
    content: string
    /** 光标停靠(Monaco InjectedTextCursorStops);缺省 = 两侧都停 */
    cursorStops?: InjectedTextCursorStops | null
}
export enum InjectedTextCursorStops { Both = 0, Right = 1, Left = 2, None = 3 }

/** 一处注入文字:插在模型行 offset(0 起)之前 */
export interface Injection { offset: number, options: InjectedTextOptions }

/** 把注入文字拼进行文本(injections 按 offset 升序) */
export function applyInjections(text: string, injections: readonly Injection[] | null | undefined): string {
    if (!injections || !injections.length) return text
    let out = '', last = 0
    for (const { offset, options } of injections) {
        out += text.substring(last, offset) + options.content
        last = offset
    }
    return out + text.substring(last)
}

// 位置歧义时偏向哪侧(数值同 Monaco PositionAffinity)
export enum Affinity { Left = 0, Right = 1, None = 2, LeftOfInjectedText = 3, RightOfInjectedText = 4 }

/** 选区的 assoc(-1 画在折点前一行尾 / 0 默认 / 1 后一行首)→ 换算视图位置时的 affinity */
export const assocAffinity = (assoc: number): Affinity => assoc < 0 ? Affinity.Left : assoc > 0 ? Affinity.Right : Affinity.None

// ───────────── 2. LineProjection ─────────────

export class OutputPosition {
    constructor(public outputLineIndex: number, public outputOffset: number) { }
    toString(): string { return `${this.outputLineIndex}:${this.outputOffset}` }
}

const hasRightStop = (s: InjectedTextCursorStops | null | undefined) => s == null || s === InjectedTextCursorStops.Right || s === InjectedTextCursorStops.Both
const hasLeftStop = (s: InjectedTextCursorStops | null | undefined) => s == null || s === InjectedTextCursorStops.Left || s === InjectedTextCursorStops.Both

/**
 * 一条模型行怎么投影成多条视图行(Monaco ModelLineProjectionData)。
 *
 *   input  : xxxxxxxxxxxxxxxxxxxxxxxxxxx
 *   注入后 : xxxxxx[iiiiiiiiii]xxxxxxxxxxxxxxxxx[ii]xxxx
 *   折断后 : xxxxxx[iiiiiii | iii]xxxxxxxxxxx | xxxxxx[ii]xxxx
 *   输出   : 续行前补 wrappedTextIndentLength 个空格
 */
export class LineProjection {
    constructor(
        /** 各注入文字在原行里的 offset;无注入 = null */
        public injectionOffsets: number[] | null,
        public injectionOptions: InjectedTextOptions[] | null,
        /** 折断点,指注入后的文本 offset;最后一项 = 注入后文本总长 */
        public breakOffsets: number[],
        /** 各折断点的可见列(注入后文本) */
        public breakOffsetsVisibleColumn: number[],
        /** 续行缩进列数 */
        public wrappedTextIndentLength: number,
    ) { }

    getOutputLineCount(): number { return this.breakOffsets.length }

    getMinOutputOffset(outputLineIndex: number): number { return outputLineIndex > 0 ? this.wrappedTextIndentLength : 0 }

    getLineLength(outputLineIndex: number): number {
        const start = outputLineIndex > 0 ? this.breakOffsets[outputLineIndex - 1] : 0
        const len = this.breakOffsets[outputLineIndex] - start
        return outputLineIndex > 0 ? len + this.wrappedTextIndentLength : len
    }

    getMaxOutputOffset(outputLineIndex: number): number { return this.getLineLength(outputLineIndex) }

    /** 视图行 outputLineIndex 的 outputOffset → 模型行 offset(落在注入文字里 = 注入点) */
    translateToInputOffset(outputLineIndex: number, outputOffset: number): number {
        if (outputLineIndex > 0) outputOffset = Math.max(0, outputOffset - this.wrappedTextIndentLength)
        let offset = outputLineIndex === 0 ? outputOffset : this.breakOffsets[outputLineIndex - 1] + outputOffset
        if (this.injectionOffsets !== null) {
            for (let i = 0; i < this.injectionOffsets.length; i++) {
                if (offset > this.injectionOffsets[i]) {
                    const len = this.injectionOptions![i].content.length
                    offset = offset < this.injectionOffsets[i] + len ? this.injectionOffsets[i] : offset - len
                } else break
            }
        }
        return offset
    }

    /** 模型行 offset → 视图行 + 行内 offset */
    translateToOutputPosition(inputOffset: number, affinity: Affinity = Affinity.None): OutputPosition {
        let withInjections = inputOffset
        if (this.injectionOffsets !== null) {
            for (let i = 0; i < this.injectionOffsets.length; i++) {
                if (inputOffset < this.injectionOffsets[i]) break
                if (affinity !== Affinity.Right && inputOffset === this.injectionOffsets[i]) break
                withInjections += this.injectionOptions![i].content.length
            }
        }
        return this.offsetWithInjectionsToOutput(withInjections, affinity)
    }

    private offsetWithInjectionsToOutput(offset: number, affinity: Affinity = Affinity.None): OutputPosition {
        let low = 0, high = this.breakOffsets.length - 1, mid = 0, midStart = 0
        while (low <= high) {
            mid = low + ((high - low) / 2) | 0
            const midStop = this.breakOffsets[mid]
            midStart = mid > 0 ? this.breakOffsets[mid - 1] : 0
            if (affinity === Affinity.Left) {
                if (offset <= midStart) high = mid - 1
                else if (offset > midStop) low = mid + 1
                else break
            } else {
                if (offset < midStart) high = mid - 1
                else if (offset >= midStop) low = mid + 1
                else break
            }
        }
        let out = offset - midStart
        if (mid > 0) out += this.wrappedTextIndentLength
        return new OutputPosition(mid, out)
    }

    /** 把视图位置归一:不停在注入文字里面(按 affinity 与 cursorStops),折断点按 Left / Right 偏到前一行尾 / 后一行首 */
    normalizeOutputPosition(outputLineIndex: number, outputOffset: number, affinity: Affinity): OutputPosition {
        if (this.injectionOffsets !== null) {
            const withInjections = this.outputToOffsetWithInjections(outputLineIndex, outputOffset)
            const normalized = this.normalizeAroundInjections(withInjections, affinity)
            if (normalized !== withInjections) return this.offsetWithInjectionsToOutput(normalized, affinity)
        }
        if (affinity === Affinity.Left) {
            if (outputLineIndex > 0 && outputOffset === this.getMinOutputOffset(outputLineIndex))
                return new OutputPosition(outputLineIndex - 1, this.getMaxOutputOffset(outputLineIndex - 1))
        } else if (affinity === Affinity.Right) {
            if (outputLineIndex < this.getOutputLineCount() - 1 && outputOffset === this.getMaxOutputOffset(outputLineIndex))
                return new OutputPosition(outputLineIndex + 1, this.getMinOutputOffset(outputLineIndex + 1))
        }
        return new OutputPosition(outputLineIndex, outputOffset)
    }

    private outputToOffsetWithInjections(outputLineIndex: number, outputOffset: number): number {
        if (outputLineIndex > 0) outputOffset = Math.max(0, outputOffset - this.wrappedTextIndentLength)
        return (outputLineIndex > 0 ? this.breakOffsets[outputLineIndex - 1] : 0) + outputOffset
    }

    private normalizeAroundInjections(offset: number, affinity: Affinity): number {
        const inj = this.injectedTextAt(offset)
        if (!inj) return offset
        const opts = this.injectionOptions!, offs = this.injectionOffsets!
        if (affinity === Affinity.None) {
            if (offset === inj.start + inj.length && hasRightStop(opts[inj.index].cursorStops)) return inj.start + inj.length
            let result = inj.start
            if (hasLeftStop(opts[inj.index].cursorStops)) return result
            for (let i = inj.index - 1; i >= 0 && offs[i] === offs[inj.index]; i--) {
                if (hasRightStop(opts[i].cursorStops)) break
                result -= opts[i].content.length
                if (hasLeftStop(opts[i].cursorStops)) break
            }
            return result
        }
        if (affinity === Affinity.Right || affinity === Affinity.RightOfInjectedText) {
            // 贴在一起的注入文字整体跨过
            let result = inj.start + inj.length
            for (let i = inj.index; i + 1 < offs.length && offs[i + 1] === offs[i]; i++) result += opts[i + 1].content.length
            return result
        }
        // Left / LeftOfInjectedText
        let result = inj.start
        for (let i = inj.index; i - 1 >= 0 && offs[i - 1] === offs[i]; i--) result -= opts[i - 1].content.length
        return result
    }

    /** 视图位置落在哪段注入文字里(含两端);没有 = null */
    getInjectedText(outputLineIndex: number, outputOffset: number): { options: InjectedTextOptions } | null {
        const inj = this.injectedTextAt(this.outputToOffsetWithInjections(outputLineIndex, outputOffset))
        return inj ? { options: this.injectionOptions![inj.index] } : null
    }

    private injectedTextAt(offset: number): { index: number, start: number, length: number } | undefined {
        const offs = this.injectionOffsets, opts = this.injectionOptions
        if (offs === null) return undefined
        let before = 0
        for (let i = 0; i < offs.length; i++) {
            const length = opts![i].content.length
            const start = offs[i] + before
            if (start > offset) break
            if (offset <= start + length) return { index: i, start, length }
            before += length
        }
        return undefined
    }
}

// ───────────── 1. 折行算法 ─────────────

const enum CharClass { None = 0, BreakBefore = 1, BreakAfter = 2, BreakIdeographic = 3 }

// Kinsoku 分类器:ASCII 走数组,其余走 map;假名 / CJK 表意字固定为 BreakIdeographic
class WrapClassifier {
    private readonly ascii = new Uint8Array(256)
    private readonly map = new Map<number, CharClass>()
    constructor(breakBefore: string, breakAfter: string) {
        const set = (code: number, c: CharClass) => { if (code < 256) this.ascii[code] = c; else this.map.set(code, c) }
        for (let i = 0; i < breakBefore.length; i++) set(breakBefore.charCodeAt(i), CharClass.BreakBefore)
        for (let i = 0; i < breakAfter.length; i++) set(breakAfter.charCodeAt(i), CharClass.BreakAfter)
    }
    get(code: number): CharClass {
        if (code >= 0 && code < 256) return this.ascii[code]
        if ((code >= 0x3040 && code <= 0x30FF) || (code >= 0x3400 && code <= 0x4DBF) || (code >= 0x4E00 && code <= 0x9FFF)) return CharClass.BreakIdeographic
        return this.map.get(code) ?? CharClass.None
    }
}
const classifiers = new Map<string, WrapClassifier>()
const classifierFor = (before: string, after: string): WrapClassifier => {
    const key = before + '\u0000' + after
    let c = classifiers.get(key)
    if (!c) { c = new WrapClassifier(before, after); classifiers.set(key, c) }
    return c
}

const isHigh = (c: number) => c >= 0xD800 && c <= 0xDBFF
// Monaco strings.isFullWidthCharacter:按 UTF-16 码元,CJK / 韩文音节 / 全角 ASCII
const isFullWidth = (c: number) => (c >= 0x2E80 && c <= 0xD7AF) || (c >= 0xF900 && c <= 0xFAFF) || (c >= 0xFF01 && c <= 0xFF5E)
const tabWidth = (vcol: number, tab: number) => tab - (vcol % tab)

function charWidth(code: number, vcol: number, tab: number, full: number): number {
    if (code === 9) return tabWidth(vcol, tab)
    if (isFullWidth(code)) return full
    if (code < 32) return full // renderControlCharacters 下替换字形常常很宽
    return 1
}

// 行首空白(空格 / Tab)的结束位置,全空白返回 -1(同 strings.firstNonWhitespaceIndex)
function firstNonBlank(text: string): number {
    for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); if (c !== 32 && c !== 9) return i }
    return -1
}

function wrappedIndentLength(text: string, c: WrapConfig): number {
    if (c.indent === WrappingIndent.None) return 0
    const first = firstNonBlank(text)
    if (first === -1) return 0
    let len = 0
    for (let i = 0; i < first; i++) len += text.charCodeAt(i) === 9 ? tabWidth(len, c.tabSize) : 1
    const extra = c.indent === WrappingIndent.DeepIndent ? 2 : c.indent === WrappingIndent.Indent ? 1 : 0
    for (let i = 0; i < extra; i++) len += tabWidth(len, c.tabSize)
    // 缩进后连一个全角字符都放不下:续行顶格
    return len + c.fullWidth > c.column ? 0 : len
}

// 禁则:不在开括号之后断、不在句号之前断;空格前不断
function canBreak(prevClass: CharClass, code: number, cls: CharClass, keepAll: boolean): boolean {
    return code !== 32 && (
        (prevClass === CharClass.BreakAfter && cls !== CharClass.BreakAfter)
        || (prevClass !== CharClass.BreakBefore && cls === CharClass.BreakBefore)
        || (!keepAll && prevClass === CharClass.BreakIdeographic && cls !== CharClass.BreakAfter)
        || (!keepAll && cls === CharClass.BreakIdeographic && prevClass !== CharClass.BreakBefore))
}

// 字面 \n(奇数个反斜杠转义)
function escapedLineFeedAt(text: string, i: number): boolean {
    if (i >= 2 && text.charAt(i - 1) === 'n') {
        let n = 0
        for (let j = i - 2; j >= 0; j--) {
            if (text.charAt(j) === '\\') n++
            else return n % 2 === 1
        }
    }
    return false
}

/**
 * 算一条模型行的折行(Monaco createLineBreaks)。injections 按 offset 升序;不折且无注入返回 null。
 * 折点宽度按「注入后」的文本算(注入文字占列、可被折断)。
 */
export function computeLineProjection(rawText: string, cfg: WrapConfig, injections?: readonly Injection[] | null): LineProjection | null {
    const text = applyInjections(rawText, injections)
    const hasInj = !!injections && injections.length > 0
    const injOptions = hasInj ? injections!.map(i => i.options) : null
    const injOffsets = hasInj ? injections!.map(i => i.offset) : null
    const len = text.length
    const lineFeeds = cfg.escapedLineFeeds && rawText.includes('"') && rawText.includes('\\n')
    if (!(cfg.column > 0) || len <= 1) return hasInj ? new LineProjection(injOffsets, injOptions, [len], [], 0) : null

    const classifier = classifierFor(cfg.breakBefore, cfg.breakAfter)
    const keepAll = cfg.wordBreak === 'keepAll'
    const { tabSize, fullWidth } = cfg
    const indentLen = wrappedIndentLength(text, cfg)
    const wrappedColumn = cfg.column - indentLen
    const offsets: number[] = [], vcols: number[] = []
    let breakOffset = 0, breakVcol = 0
    let breakingColumn = cfg.column
    const c0 = text.charCodeAt(0)
    let prevClass = classifier.get(c0)
    let vcol = charWidth(c0, 0, tabSize, fullWidth)
    let start = 1
    if (isHigh(c0)) { // 代理对不拆
        vcol += 1
        prevClass = classifier.get(text.charCodeAt(1))
        start++
    }
    for (let i = start; i < len; i++) {
        const at = i
        const code = text.charCodeAt(i)
        let cls: CharClass, w: number
        if (isHigh(code)) { i++; cls = CharClass.None; w = 2 } else { cls = classifier.get(code); w = charWidth(code, vcol, tabSize, fullWidth) }
        let feed = false
        if (lineFeeds && escapedLineFeedAt(text, i)) { breakOffset = at; breakVcol = vcol; feed = true }
        else if (canBreak(prevClass, code, cls, keepAll)) { breakOffset = at; breakVcol = vcol }
        vcol += w
        if (vcol > breakingColumn || feed) {
            // 至少要在 i 之前断
            if (breakOffset === 0 || vcol - breakVcol > wrappedColumn) { breakOffset = at; breakVcol = vcol - w }
            offsets.push(breakOffset)
            vcols.push(breakVcol)
            breakingColumn = breakVcol + wrappedColumn
            breakOffset = 0
        }
        prevClass = cls
    }
    if (offsets.length === 0 && !hasInj) return null
    offsets.push(len)
    vcols.push(vcol)
    return new LineProjection(injOffsets, injOptions, offsets, vcols, indentLen)
}

// ───────────── 3. SoftWrapModel ─────────────

/** 视图位置:模型行 + 该行的第 row 个视图行 + 视图列(1 起,含续行缩进) */
export interface ViewPos { line: number, row: number, col: number }
/** 视图行坐标 */
export interface ViewRow { line: number, row: number }

export interface WrapSource {
    /** 模型行数 */
    lines: number
    /** 第 n 行(1 起)文本 */
    text(line: number): string
    /** 第 n 行的注入文字,按 offset 升序 */
    injections?(line: number): readonly Injection[] | null
    /** 第 n 行被折叠(不占视图行) */
    hidden?(line: number): boolean
}

const spaces = (n: number) => ' '.repeat(n)

/** 一份文档的视图坐标。按行惰性算折行并缓存;文档 / 选项一换就该重建。 */
export class SoftWrapModel {
    private readonly cache = new Map<number, LineProjection | null>()
    constructor(readonly src: WrapSource, readonly cfg: WrapConfig) { }

    projection(line: number): LineProjection | null {
        let p = this.cache.get(line)
        if (p === undefined) {
            p = computeLineProjection(this.src.text(line), this.cfg, this.src.injections?.(line))
            this.cache.set(line, p)
        }
        return p
    }

    /** 这条模型行占几个视图行(折叠的行 0) */
    rowCount(line: number): number {
        if (this.src.hidden?.(line)) return 0
        return this.projection(line)?.getOutputLineCount() ?? 1
    }

    /** 视图行内容:续行前补缩进空格,含注入文字 */
    content(line: number, row: number): string {
        const p = this.projection(line)
        if (!p) return this.src.text(line)
        const full = applyInjections(this.src.text(line), this.src.injections?.(line))
        const r = full.substring(row > 0 ? p.breakOffsets[row - 1] : 0, p.breakOffsets[row])
        return row > 0 ? spaces(p.wrappedTextIndentLength) + r : r
    }

    minColumn(line: number, row: number): number { return (this.projection(line)?.getMinOutputOffset(row) ?? 0) + 1 }
    maxColumn(line: number, row: number): number { return (this.projection(line)?.getMaxOutputOffset(row) ?? this.src.text(line).length) + 1 }

    /** 模型行内 offset → 视图位置 */
    toView(line: number, offset: number, affinity: Affinity = Affinity.None): ViewPos {
        const p = this.projection(line)
        if (!p) return { line, row: 0, col: offset + 1 }
        const o = p.translateToOutputPosition(offset, affinity)
        return { line, row: o.outputLineIndex, col: o.outputOffset + 1 }
    }

    /** 视图位置 → 模型行内 offset(夹在行内) */
    toModel(v: ViewPos): number {
        const p = this.projection(v.line)
        const off = p ? p.translateToInputOffset(v.row, v.col - 1) : v.col - 1
        return Math.max(0, Math.min(off, this.src.text(v.line).length))
    }

    normalize(v: ViewPos, affinity: Affinity): ViewPos {
        const p = this.projection(v.line)
        if (!p) return v
        const o = p.normalizeOutputPosition(v.row, v.col - 1, affinity)
        return { line: v.line, row: o.outputLineIndex, col: o.outputOffset + 1 }
    }

    /** 绝对视图行号(1 起)。O(行数),只给投影用,移动逻辑不依赖它。 */
    viewLineNumber(line: number, row: number): number {
        let n = 0
        for (let l = 1; l < line; l++) n += this.rowCount(l)
        return n + row + 1
    }

    /** 视图行 from 前后平移 delta 个(跳过折叠行);越过首 / 末返回 'before' / 'after' */
    shift(from: ViewRow, delta: number): ViewRow | 'before' | 'after' {
        let { line, row } = from
        while (delta > 0) {
            const n = this.rowCount(line)
            if (row + 1 < n) { row++; delta--; continue }
            do line++; while (line <= this.src.lines && this.rowCount(line) === 0)
            if (line > this.src.lines) return 'after'
            row = 0; delta--
        }
        while (delta < 0) {
            if (row > 0) { row--; delta++; continue }
            do line--; while (line >= 1 && this.rowCount(line) === 0)
            if (line < 1) return 'before'
            row = this.rowCount(line) - 1; delta++
        }
        return { line, row }
    }

    /** 第一个 / 最后一个可见视图行 */
    firstRow(): ViewRow {
        let line = 1
        while (line < this.src.lines && this.rowCount(line) === 0) line++
        return { line, row: 0 }
    }
    lastRow(): ViewRow {
        let line = this.src.lines
        while (line > 1 && this.rowCount(line) === 0) line--
        return { line, row: Math.max(0, this.rowCount(line) - 1) }
    }
}
