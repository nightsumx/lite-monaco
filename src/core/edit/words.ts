// Monaco 词操作(cursorWordOperations.js 的 WordOperations / WordPartOperations)逐行移植。
//
// 字符三分类(WordCharacterClassifier,按 UTF-16 码元):空格/Tab = Whitespace,
// wordSeparators 里的 = WordSeparator(选项 `wordSeparators`,默认 USUAL_WORD_SEPARATORS),其余一律 Regular
// (含 CJK、emoji 代理对)。一个「词」= 同类(Regular 或 Separator)的连续段;Whitespace 不成词。
// 选项 `wordSegmenterLocales` 非空时,Regular 段里再按 Intl.Segmenter(word)切(CJK 分词),同 Monaco。
//
// 用到的导航类型(Monaco macOS 默认键位):
//   ⌥←  cursorWordLeft      = moveWordLeft(WordStartFast)
//   ⌥→  cursorWordEndRight  = moveWordRight(WordEnd)
//   ⌥⌫  deleteWordLeft      = deleteWordLeft(WordStart, whitespaceHeuristics)
//   ⌥⌦  deleteWordRight     = deleteWordRight(WordEnd, whitespaceHeuristics)
//   ⌃⌥←/→/⌫/⌦  wordPart*   = 三个候选(WordStart、WordEnd、camelCase/下划线分段)取最近
// 位置一律是文档 offset;行内列是 0 基(Monaco 的 column-1)。

import type { EditorState } from '../model/state'
import { getOption } from '../options'

export const USUAL_WORD_SEPARATORS = '`~!@#$%^&*()-=+[{]}\\|;:\'",.<>/?'

const enum Cls { Regular = 0, Whitespace = 1, Separator = 2 }
const enum WType { None = 0, Regular = 1, Separator = 2 }
export const enum WordNav { WordStart = 0, WordStartFast = 1, WordEnd = 2, WordAccessibility = 3 }

interface IntlSegment { index: number, segment: string }

/** Monaco WordCharacterClassifier:字符三分类 + 可选的 Intl.Segmenter 词段 */
export interface WordClassifier {
    readonly separators: string
    get(code: number): Cls
    findPrevIntlWordBeforeOrAtOffset(line: string, offset: number): IntlSegment | null
    findNextIntlWordAtOrAfterOffset(line: string, offset: number): IntlSegment | null
}

function makeClassifier(separators: string, locales: readonly string[]): WordClassifier {
    const sep = new Set<number>()
    for (let i = 0; i < separators.length; i++) sep.add(separators.charCodeAt(i))
    let segmenter: { segment(s: string): Iterable<{ index: number, segment: string, isWordLike?: boolean }> } | null = null
    if (locales.length > 0 && typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
        try { segmenter = new (Intl as unknown as { Segmenter: new (l: readonly string[], o: object) => NonNullable<typeof segmenter> }).Segmenter(locales, { granularity: 'word' }) }
        catch { segmenter = null }
    }
    let cachedLine: string | null = null
    let cachedSegments: IntlSegment[] = []
    const words = (line: string): IntlSegment[] => {
        if (!segmenter) return []
        if (cachedLine === line) return cachedSegments
        cachedLine = line
        const out: IntlSegment[] = []
        for (const s of segmenter.segment(line)) if (s.isWordLike) out.push({ index: s.index, segment: s.segment })
        return cachedSegments = out
    }
    return {
        separators,
        get(code) {
            if (code === 32 || code === 9) return Cls.Whitespace
            return sep.has(code) ? Cls.Separator : Cls.Regular
        },
        findPrevIntlWordBeforeOrAtOffset(line, offset) {
            let candidate: IntlSegment | null = null
            for (const s of words(line)) {
                if (s.index > offset) break
                candidate = s
            }
            return candidate
        },
        findNextIntlWordAtOrAfterOffset(line, offset) {
            for (const s of words(line)) if (s.index >= offset) return s
            return null
        },
    }
}

// Monaco wordClassifierCache(LRU 10):按 分隔符/语言 缓存
const classifierCache = new Map<string, WordClassifier>()
export function wordClassifier(separators: string = USUAL_WORD_SEPARATORS, locales: readonly string[] = []): WordClassifier {
    const key = `${separators}/${locales.join(',')}`
    let c = classifierCache.get(key)
    if (c) { classifierCache.delete(key); classifierCache.set(key, c); return c }
    c = makeClassifier(separators, locales)
    classifierCache.set(key, c)
    if (classifierCache.size > 10) classifierCache.delete(classifierCache.keys().next().value as string)
    return c
}

const DEFAULT_WC = wordClassifier()

/** 当前 state 的词分类器:读选项 `wordSeparators`、`wordSegmenterLocales`(没有 liteMonaco() 时就是 Monaco 默认) */
export function stateWordClassifier(state: EditorState, defaultSeparators = false): WordClassifier {
    const sep = defaultSeparators ? USUAL_WORD_SEPARATORS : getOption(state, 'wordSeparators')
    const loc = getOption(state, 'wordSegmenterLocales')
    const locales = typeof loc === 'string' ? (loc ? [loc] : []) : Array.isArray(loc) ? loc.filter((x): x is string => typeof x === 'string' && !!x) : []
    return typeof sep === 'string' && sep === USUAL_WORD_SEPARATORS && !locales.length ? DEFAULT_WC : wordClassifier(typeof sep === 'string' ? sep : USUAL_WORD_SEPARATORS, locales)
}

export interface LineWord { start: number, end: number, type: WType, nextCharClass: Cls }

function intlWord(w: IntlSegment, nextCharClass: Cls): LineWord {
    return { start: w.index, end: w.index + w.segment.length, type: WType.Regular, nextCharClass }
}

function findEndOfWord(text: string, wc: WordClassifier, type: WType, startIndex: number): number {
    const nextIntl = wc.findNextIntlWordAtOrAfterOffset(text, startIndex)
    for (let i = startIndex; i < text.length; i++) {
        const c = wc.get(text.charCodeAt(i))
        if (nextIntl && i === nextIntl.index + nextIntl.segment.length) return i
        if (c === Cls.Whitespace) return i
        if (type === WType.Regular && c === Cls.Separator) return i
        if (type === WType.Separator && c === Cls.Regular) return i
    }
    return text.length
}

function findStartOfWord(text: string, wc: WordClassifier, type: WType, startIndex: number): number {
    const prevIntl = wc.findPrevIntlWordBeforeOrAtOffset(text, startIndex)
    for (let i = startIndex; i >= 0; i--) {
        const c = wc.get(text.charCodeAt(i))
        if (prevIntl && i === prevIntl.index) return i
        if (c === Cls.Whitespace) return i + 1
        if (type === WType.Regular && c === Cls.Separator) return i + 1
        if (type === WType.Separator && c === Cls.Regular) return i + 1
    }
    return 0
}

// 光标列 col(0 基)之前的最近一个词。
export function findPrevWordOnLine(text: string, col: number, wc: WordClassifier = DEFAULT_WC): LineWord | null {
    let type = WType.None
    const prevIntl = wc.findPrevIntlWordBeforeOrAtOffset(text, col - 1)
    for (let i = col - 1; i >= 0; i--) {
        const c = wc.get(text.charCodeAt(i))
        if (prevIntl && i === prevIntl.index) return intlWord(prevIntl, c)
        if (c === Cls.Regular) {
            if (type === WType.Separator) return { start: i + 1, end: findEndOfWord(text, wc, type, i + 1), type, nextCharClass: c }
            type = WType.Regular
        }
        else if (c === Cls.Separator) {
            if (type === WType.Regular) return { start: i + 1, end: findEndOfWord(text, wc, type, i + 1), type, nextCharClass: c }
            type = WType.Separator
        }
        else if (type !== WType.None) {
            return { start: i + 1, end: findEndOfWord(text, wc, type, i + 1), type, nextCharClass: c }
        }
    }
    if (type !== WType.None) return { start: 0, end: findEndOfWord(text, wc, type, 0), type, nextCharClass: Cls.Whitespace }
    return null
}

// 光标列 col(0 基)及之后的最近一个词。
export function findNextWordOnLine(text: string, col: number, wc: WordClassifier = DEFAULT_WC): LineWord | null {
    let type = WType.None
    const nextIntl = wc.findNextIntlWordAtOrAfterOffset(text, col)
    for (let i = col; i < text.length; i++) {
        const c = wc.get(text.charCodeAt(i))
        if (nextIntl && i === nextIntl.index) return intlWord(nextIntl, c)
        if (c === Cls.Regular) {
            if (type === WType.Separator) return { start: findStartOfWord(text, wc, type, i - 1), end: i, type, nextCharClass: c }
            type = WType.Regular
        }
        else if (c === Cls.Separator) {
            if (type === WType.Regular) return { start: findStartOfWord(text, wc, type, i - 1), end: i, type, nextCharClass: c }
            type = WType.Separator
        }
        else if (type !== WType.None) {
            return { start: findStartOfWord(text, wc, type, i - 1), end: i, type, nextCharClass: c }
        }
    }
    if (type !== WType.None) return { start: findStartOfWord(text, wc, type, text.length - 1), end: text.length, type, nextCharClass: Cls.Whitespace }
    return null
}

export function moveWordLeft(state: EditorState, pos: number, nav: WordNav, multi = false): number {
    // WordAccessibility(屏幕阅读器按词移动):无视 wordSeparators 选项,恒用默认分隔符(Monaco CursorWordAccessibility*)
    const wc = stateWordClassifier(state, nav === WordNav.WordAccessibility)
    let line = state.doc.lineAt(pos)
    let col = pos - line.from
    if (col === 0 && line.number > 1) {
        line = state.doc.line(line.number - 1)
        col = line.length
    }
    const text = line.text
    let prev = findPrevWordOnLine(text, col, wc)
    if (nav === WordNav.WordStart) return line.from + (prev ? prev.start : 0)
    if (nav === WordNav.WordAccessibility) {
        while (prev && prev.type === WType.Separator) prev = findPrevWordOnLine(text, prev.start, wc)
        return line.from + (prev ? prev.start : 0)
    }
    if (nav === WordNav.WordStartFast) {
        if (!multi && prev && prev.type === WType.Separator && prev.end - prev.start === 1 && prev.nextCharClass === Cls.Regular)
            prev = findPrevWordOnLine(text, prev.start, wc)
        return line.from + (prev ? prev.start : 0)
    }
    if (prev && col <= prev.end) prev = findPrevWordOnLine(text, prev.start, wc)
    return line.from + (prev ? prev.end : 0)
}

export function moveWordRight(state: EditorState, pos: number, nav: WordNav): number {
    const wc = stateWordClassifier(state, nav === WordNav.WordAccessibility)
    let line = state.doc.lineAt(pos)
    let col = pos - line.from
    let movedDown = false
    if (col === line.length && line.number < state.doc.lines) {
        movedDown = true
        line = state.doc.line(line.number + 1)
        col = 0
    }
    const text = line.text
    let next = findNextWordOnLine(text, col, wc)
    if (nav === WordNav.WordEnd) {
        if (next && next.type === WType.Separator && next.end - next.start === 1 && next.nextCharClass === Cls.Regular)
            next = findNextWordOnLine(text, next.end, wc)
        return line.from + (next ? next.end : text.length)
    }
    if (nav === WordNav.WordAccessibility) {
        // 换行后假装光标在首字符之前,免得漏掉贴着行首的词;已开始于光标之前的词也跳过,保证至少前进一格
        const lim = movedDown ? -1 : col
        while (next && (next.type === WType.Separator || next.start <= lim)) next = findNextWordOnLine(text, next.end, wc)
        return line.from + (next ? next.start : text.length)
    }
    if (next && !movedDown && col >= next.start) next = findNextWordOnLine(text, next.end, wc)
    return line.from + (next ? next.start : text.length)
}

// camelCase / snake_case / kebab-case 分段(Monaco _moveWordPartLeft/Right,只认 ASCII 大小写)。
const isLower = (c: number) => c >= 97 && c <= 122
const isUpper = (c: number) => c >= 65 && c <= 90
const isDigit = (c: number) => c >= 48 && c <= 57

function wordPartLeftRaw(state: EditorState, pos: number): number {
    const line = state.doc.lineAt(pos)
    const col = pos - line.from
    if (col === 0) return line.number > 1 ? line.from - 1 : pos
    const text = line.text
    const max = text.length
    for (let c = col - 1; c > 0; c--) {
        const left = text.charCodeAt(c - 1), right = text.charCodeAt(c)
        if (left === 95 && right !== 95) return line.from + c
        if (left === 45 && right !== 45) return line.from + c
        if ((isLower(left) || isDigit(left)) && isUpper(right)) return line.from + c
        if (isUpper(left) && isUpper(right) && c + 1 < max) {
            const rr = text.charCodeAt(c + 1)
            if (isLower(rr) || isDigit(rr)) return line.from + c
        }
    }
    return line.from
}

function wordPartRightRaw(state: EditorState, pos: number): number {
    const line = state.doc.lineAt(pos)
    const col = pos - line.from
    const text = line.text
    const max = text.length
    if (col === max) return line.number < state.doc.lines ? line.to + 1 : pos
    for (let c = col + 1; c < max; c++) {
        const left = text.charCodeAt(c - 1), right = text.charCodeAt(c)
        if (left !== 95 && right === 95) return line.from + c
        if (left !== 45 && right === 45) return line.from + c
        if ((isLower(left) || isDigit(left)) && isUpper(right)) return line.from + c
        if (isUpper(left) && isUpper(right) && c + 1 < max) {
            const rr = text.charCodeAt(c + 1)
            if (isLower(rr) || isDigit(rr)) return line.from + c
        }
    }
    return line.from + max
}

export function moveWordPartLeft(state: EditorState, pos: number, multi = false): number {
    return Math.max(
        moveWordLeft(state, pos, WordNav.WordStart, multi),
        moveWordLeft(state, pos, WordNav.WordEnd, multi),
        wordPartLeftRaw(state, pos),
    )
}

export function moveWordPartRight(state: EditorState, pos: number): number {
    return Math.min(
        moveWordRight(state, pos, WordNav.WordStart),
        moveWordRight(state, pos, WordNav.WordEnd),
        wordPartRightRaw(state, pos),
    )
}

// 删词左界(空光标)。null = 无可删(文档首)。
export function deleteWordLeftTarget(state: EditorState, pos: number, nav: WordNav, whitespaceHeuristics: boolean): number | null {
    const wc = stateWordClassifier(state)
    if (pos === 0) return null
    const line = state.doc.lineAt(pos)
    const col = pos - line.from
    const text = line.text
    if (whitespaceHeuristics) {
        // 光标前至少两个空白 → 只删这段空白
        let last = col - 1
        while (last >= 0 && (text.charCodeAt(last) === 32 || text.charCodeAt(last) === 9)) last--
        if (last + 1 < col - 1) return line.from + last + 1
    }
    let prev = findPrevWordOnLine(text, col, wc)
    if (nav === WordNav.WordStart) {
        if (prev) return line.from + prev.start
        return col > 0 ? line.from : line.from - 1
    }
    if (prev && col <= prev.end) prev = findPrevWordOnLine(text, prev.start, wc)
    if (prev) return line.from + prev.end
    return col > 0 ? line.from : line.from - 1
}

// 删词右界(空光标)。null = 无可删(文档尾)。
export function deleteWordRightTarget(state: EditorState, pos: number, nav: WordNav, whitespaceHeuristics: boolean): number | null {
    const wc = stateWordClassifier(state)
    if (pos === state.doc.length) return null
    const line = state.doc.lineAt(pos)
    const col = pos - line.from
    const text = line.text
    if (whitespaceHeuristics) {
        let first = col
        while (first < text.length && (text.charCodeAt(first) === 32 || text.charCodeAt(first) === 9)) first++
        if (col + 1 < first) return line.from + first
    }
    let next = findNextWordOnLine(text, col, wc)
    const toNextLine = () => {
        const nl = state.doc.line(line.number + 1)
        const w = findNextWordOnLine(nl.text, 0, wc)
        return nl.from + (w ? w.start : nl.length)
    }
    if (nav === WordNav.WordEnd) {
        if (next) return line.from + next.end
        if (col < text.length || line.number === state.doc.lines) return line.to
        return toNextLine()
    }
    if (next && col >= next.start) next = findNextWordOnLine(text, next.end, wc)
    if (next) return line.from + next.start
    if (col < text.length || line.number === state.doc.lines) return line.to
    return toNextLine()
}

export function deleteWordPartLeftTarget(state: EditorState, pos: number): number | null {
    if (pos === 0) return null
    const a = deleteWordLeftTarget(state, pos, WordNav.WordStart, true)
    const b = deleteWordLeftTarget(state, pos, WordNav.WordEnd, true)
    const c = wordPartLeftRaw(state, pos)
    return Math.max(a ?? 0, b ?? 0, c)
}

export function deleteWordPartRightTarget(state: EditorState, pos: number): number | null {
    if (pos === state.doc.length) return null
    const a = deleteWordRightTarget(state, pos, WordNav.WordStart, true)
    const b = deleteWordRightTarget(state, pos, WordNav.WordEnd, true)
    const c = wordPartRightRaw(state, pos)
    return Math.min(a ?? state.doc.length, b ?? state.doc.length, c)
}

// Monaco getWordAtPosition:光标贴着(前或后)的 Regular 词。⌘D 从空光标起选这个词。
export function wordAtPosition(state: EditorState, pos: number): { from: number, to: number } | null {
    const wc = stateWordClassifier(state)
    const line = state.doc.lineAt(pos)
    const col = pos - line.from
    const prev = findPrevWordOnLine(line.text, col, wc)
    if (prev && prev.type === WType.Regular && prev.start <= col && col <= prev.end)
        return { from: line.from + prev.start, to: line.from + prev.end }
    const next = findNextWordOnLine(line.text, col, wc)
    if (next && next.type === WType.Regular && next.start <= col && col <= next.end)
        return { from: line.from + next.start, to: line.from + next.end }
    return null
}

// 双击选词(Monaco WordOperations.word,非 inSelectionMode 分支):贴着词就选词;贴着分隔符串(标点)选这串,
// 且右边界不含(光标在串尾不算贴着:`hello:|` 不选 `:`);都不贴(在空白里)选前一个词尾到后一个词头之间的整段
// (行首 / 行尾为界)。受 wordSeparators / wordSegmenterLocales 影响。
export function wordSelectAt(state: EditorState, pos: number): { from: number, to: number } {
    const wc = stateWordClassifier(state)
    const line = state.doc.lineAt(pos)
    const col = pos - line.from
    const prev = findPrevWordOnLine(line.text, col, wc)
    const touches = (w: LineWord | null) => !!w && (w.type === WType.Regular ? w.start <= col && col <= w.end : w.type === WType.Separator && w.start <= col && col < w.end)
    if (prev && touches(prev)) return { from: line.from + prev.start, to: line.from + prev.end }
    const next = findNextWordOnLine(line.text, col, wc)
    if (next && touches(next)) return { from: line.from + next.start, to: line.from + next.end }
    return { from: line.from + (prev ? prev.end : 0), to: line.from + (next ? next.start : line.length) }
}

// 双击后拖动(Monaco WordOperations.word,inSelectionMode 分支)的「当前位置所在词」:严格落在词内(不含两端)才扩成整词,
// 否则就是该位置本身(空区间)。
export function wordDragAt(state: EditorState, pos: number): { from: number, to: number } {
    const wc = stateWordClassifier(state)
    const line = state.doc.lineAt(pos)
    const col = pos - line.from
    const prev = findPrevWordOnLine(line.text, col, wc)
    if (prev && prev.type === WType.Regular && prev.start < col && col < prev.end) return { from: line.from + prev.start, to: line.from + prev.end }
    const next = findNextWordOnLine(line.text, col, wc)
    if (next && next.type === WType.Regular && next.start < col && col < next.end) return { from: line.from + next.start, to: line.from + next.end }
    return { from: pos, to: pos }
}

// 整词判定(Monaco 查找 wholeWord 用的 isValidMatch 简化:两侧都是 Separator/Whitespace/行界)。
export function isWholeWordAt(text: string, from: number, to: number, wc: WordClassifier = DEFAULT_WC): boolean {
    const before = from > 0 ? text.charCodeAt(from - 1) : -1
    const after = to < text.length ? text.charCodeAt(to) : -1
    const boundary = (c: number) => c < 0 || c === 10 || c === 13 || wc.get(c) !== Cls.Regular
    const firstIn = text.charCodeAt(from), lastIn = text.charCodeAt(to - 1)
    return (boundary(before) || wc.get(firstIn) !== Cls.Regular) && (boundary(after) || wc.get(lastIn) !== Cls.Regular)
}

// Monaco WordOperations.deleteInsideWord(空光标):返回要删的 doc 区间。
//   光标两侧都紧贴空白(空格/Tab)→ 删这一整段空白;
//   空行 → 删上一行换行(首行则删本行换行);
//   光标贴着词 → 删词连同一侧空白(右侧有空白删右侧,否则吃左侧);
//   落在词间的符号/空白里 → 删前词尾到后词首之间;其余退化到整行。
export function deleteInsideWordSpan(state: EditorState, pos: number): { from: number, to: number } {
    const wc = stateWordClassifier(state)
    const doc = state.doc
    const line = doc.lineAt(pos)
    const text = line.text
    const len = text.length
    const col = pos - line.from
    const isWs = (i: number) => { const c = text.charCodeAt(i); return c === 32 || c === 9 }

    if (len > 0) {
        let left = Math.max(col - 1, 0)
        let right = Math.min(col, len - 1)
        if (isWs(left) && isWs(right)) {
            while (left > 0 && isWs(left - 1)) left--
            while (right + 1 < len && isWs(right + 1)) right++
            return { from: line.from + left, to: line.from + right + 1 }
        }
    } else {
        if (line.number > 1) return { from: line.from - 1, to: line.from }
        if (line.number < doc.lines) return { from: line.from, to: line.from + 1 }
        return { from: pos, to: pos }
    }

    const withPos = (a: number, b: number) => ({ from: line.from + Math.min(a, col), to: line.from + Math.max(b, col) })
    const wordAndSpace = (w: LineWord) => {
        let start = w.start, end = w.end, right = false
        while (end < len && isWs(end)) { right = true; end++ }
        if (!right) while (start > 0 && isWs(start - 1)) start--
        return withPos(start, end)
    }
    const touches = (w: LineWord) => w.start <= col && col <= w.end
    const prev = findPrevWordOnLine(text, col, wc)
    if (prev && touches(prev)) return wordAndSpace(prev)
    const next = findNextWordOnLine(text, col, wc)
    if (next && touches(next)) return wordAndSpace(next)
    if (prev && next) return withPos(prev.end, next.start)
    if (prev) return withPos(prev.start, prev.end)
    if (next) return withPos(next.start, next.end)
    return withPos(0, len)
}
