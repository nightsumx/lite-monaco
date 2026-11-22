// Portions of this file are derived from CodeMirror 6 (MIT, Copyright (C) Marijn Haverbeke and others). See THIRD-PARTY-NOTICES.md.
// 列宽计算 —— 对齐 codeSrc/state/src/column.ts。矩形选 / goalColumn 精确列依赖。

import { findClusterBreak } from './char'

/** 字符串 offset → 显示列（含 tab 展开、cluster）。 */
export function countColumn(string: string, tabSize: number, to = string.length): number {
    let n = 0
    for (let i = 0; i < to && i < string.length;) {
        if (string.charCodeAt(i) === 9) {
            n += tabSize - (n % tabSize)
            i++
        } else {
            n++
            i = findClusterBreak(string, i)
        }
    }
    return n
}

/**
 * 显示列 → offset。字符串不够长时默认返 length；strict 时返 -1。
 */
export function findColumn(string: string, col: number, tabSize: number, strict?: boolean): number {
    for (let i = 0, n = 0;;) {
        if (n >= col) return i
        if (i === string.length) break
        n += string.charCodeAt(i) === 9 ? tabSize - (n % tabSize) : 1
        i = findClusterBreak(string, i)
    }
    return strict === true ? -1 : string.length
}
