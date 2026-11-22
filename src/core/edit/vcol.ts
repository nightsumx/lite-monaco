// Monaco 可见列(CursorColumns.visibleColumnFromColumn / columnFromVisibleColumn)。
// 按字素簇步进;Tab 展到下一个 tab stop,全角字符(CJK 等)与 emoji 记 2 列,其余 1 列。
// 上下移动、Tab 跳 tab stop、缩进对齐都按这个列算(对齐 Monaco),和 model/column.ts 的
// countColumn(每簇 1 列,矩形选区等沿用)分开,免得改动外溢。

import { codePointAt, findClusterBreak } from '../model/char'

function isFullWidth(c: number): boolean {
    return (c >= 0x2E80 && c <= 0xD7AF) || (c >= 0xF900 && c <= 0xFAFF) || (c >= 0xFF01 && c <= 0xFF5E)
}

export function isEmojiImprecise(x: number): boolean {
    return (x >= 0x1F1E6 && x <= 0x1F1FF) || x === 8986 || x === 8987 || x === 9200
        || x === 9203 || (x >= 9728 && x <= 10175) || x === 11088 || x === 11093
        || (x >= 127744 && x <= 128591) || (x >= 128640 && x <= 128764)
        || (x >= 128992 && x <= 129008) || (x >= 129280 && x <= 129535)
        || (x >= 129648 && x <= 129782)
}

/** Monaco CursorColumns.nextRenderTabStop(0 起的可见列) */
export function nextRenderTabStop(visibleColumn: number, tabSize: number): number {
    return visibleColumn + tabSize - visibleColumn % tabSize
}

/** Monaco CursorColumns.prevRenderTabStop:注意参数是 1 起的列(同 Monaco 的怪癖),返回 0 起的可见列 */
export function prevRenderTabStop(column: number, tabSize: number): number {
    return Math.max(0, column - 1 - (column - 1) % tabSize)
}

export function nextVisible(code: number, v: number, tabSize: number): number {
    if (code === 9) return nextRenderTabStop(v, tabSize)
    if (isFullWidth(code) || isEmojiImprecise(code)) return v + 2
    return v + 1
}

/** 行内 offset → 可见列。 */
export function visibleColumn(text: string, offset: number, tabSize: number): number {
    const end = Math.min(offset, text.length)
    // offset 落在代理对中间:Monaco 先截断再数,半个代理对是一个普通字符(1 列),不是整个 emoji(2 列)
    if (end > 0 && end < text.length && (text.charCodeAt(end - 1) & 0xFC00) === 0xD800) text = text.slice(0, end)
    let v = 0
    for (let i = 0; i < end;) {
        const code = codePointAt(text, i)
        i = findClusterBreak(text, i)
        v = nextVisible(code, v, tabSize)
    }
    return v
}

/** 状态栏显示的 Col(Monaco CursorColumns.toStatusbarColumn):逐码点数,Tab 展到 tab stop,全角 / emoji 只算 1;1 起 */
export function toStatusbarColumn(text: string, offset: number, tabSize: number): number {
    const end = Math.min(offset, text.length)
    let v = 0
    for (let i = 0; i < end;) {
        const code = codePointAt(text, i)
        i += code > 0xFFFF ? 2 : 1
        v = code === 9 ? nextRenderTabStop(v, tabSize) : v + 1
    }
    return v + 1
}

/** 可见列 → 行内 offset(落在字素边界,取更近的一侧;超出行尾返回行长)。 */
export function columnFromVisible(text: string, visible: number, tabSize: number): number {
    if (visible <= 0) return 0
    let before = 0, beforeCol = 0
    for (let i = 0; i < text.length;) {
        const code = codePointAt(text, i)
        i = findClusterBreak(text, i)
        const after = nextVisible(code, before, tabSize)
        if (after >= visible) return (after - visible < visible - before) ? i : beforeCol
        before = after
        beforeCol = i
    }
    return text.length
}

// 退格删到哪(Monaco strings.getLeftDeleteOffset):先试「删掉最后一个 emoji 组件」——跳过肤色修饰、
// FE0F、20E3,再删一个 emoji 基字,前面紧跟 ZWJ 就连 ZWJ 一起删(👨‍👩‍👧 退格剩 👨‍👩);否则只删一个码点
// (é = e + U+0301 退格只删重音)。offset 为行内偏移。
export function leftDeleteOffset(text: string, offset: number): number {
    if (offset <= 0) return 0
    const prev = (i: number): [number, number] => {
        const lo = text.charCodeAt(i - 1)
        if (i >= 2 && lo >= 0xDC00 && lo <= 0xDFFF) {
            const hi = text.charCodeAt(i - 2)
            if (hi >= 0xD800 && hi <= 0xDBFF) return [((hi - 0xD800) << 10) + (lo - 0xDC00) + 0x10000, i - 2]
        }
        return [lo, i - 1]
    }
    let [cp, i] = prev(offset)
    let emoji = true
    while ((cp >= 0x1F3FB && cp <= 0x1F3FF) || cp === 0xFE0F || cp === 0x20E3) {
        if (i === 0) { emoji = false; break }
        ;[cp, i] = prev(i)
    }
    if (emoji && isEmojiImprecise(cp)) {
        if (i > 0) {
            const [z, j] = prev(i)
            if (z === 0x200D) return j
        }
        return i
    }
    return prev(offset)[1]
}
