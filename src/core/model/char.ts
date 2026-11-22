// Portions of this file are derived from CodeMirror 6 (MIT, Copyright (C) Marijn Haverbeke and others). See THIRD-PARTY-NOTICES.md.
// CM7 字符原语 —— 码点 / 字素簇边界。
//
// 字素簇边界(Unicode UAX#29)的表数据是「永不自推」级坑知识(emoji ZWJ 序列、区域指示符旗、
// 组合记号),CM6 自己也是委托 @marijn/find-cluster-break。CM7 同样直接用,不重抄表。
// 码点读写(surrogate pair 拼合)是纯算法,逐行移植。

import { findClusterBreak as find } from '@marijn/find-cluster-break'

// pos 之后(forward)或之前的下一个字素簇边界;无更多边界时返回 pos 自身。
// 跨 surrogate pair、组合字符(includeExtending 时)、ZWJ 连接字符、旗帜 emoji。
export function findClusterBreak(str: string, pos: number, forward = true, includeExtending = true) {
    let b = find(str, pos, forward, includeExtending)
    if (!includeExtending) return b
    // UAX#29 GB6–GB8:韩文 jamo(L+V+T)和 LV/LVT 音节连成一簇。@marijn/find-cluster-break 没有这几条,Monaco 有(一次 ← / → 走过整个音节)。
    b = joinHangul(str, b, forward)
    // UAX#29 GB9a:SpacingMark(Mc,如泰米尔 பு 的元音符)并入前一簇。@marijn/find-cluster-break 不收这类,Monaco 收 ——
    // 光标一次走过整个字素。Mc 都 >= U+0903,先用码值挡掉绝大多数调用。
    if (forward) {
        let e = b
        while (e < str.length && str.charCodeAt(e) >= 0x0903 && isSpacingMark(codePointAt(str, e))) {
            const n = find(str, e, true, includeExtending)
            if (n === e) break
            e = n
        }
        return e
    }
    let e = b
    while (e > 0 && e < str.length && str.charCodeAt(e) >= 0x0903 && isSpacingMark(codePointAt(str, e))) {
        const n = find(str, e, false, includeExtending)
        if (n === e) break
        e = n
    }
    return e
}

// 0 = 非韩文;1 L,2 V,3 T,4 LV,5 LVT
function hangulType(c: number): number {
    if (c < 0x1100) return 0
    if (c <= 0x115F || (c >= 0xA960 && c <= 0xA97C)) return 1
    if (c <= 0x11A7 || (c >= 0xD7B0 && c <= 0xD7C6)) return 2
    if (c <= 0x11FF || (c >= 0xD7CB && c <= 0xD7FB)) return 3
    if (c >= 0xAC00 && c <= 0xD7A3) return (c - 0xAC00) % 28 === 0 ? 4 : 5
    return 0
}
function hangulJoins(a: number, b: number): boolean {
    if (!a || !b) return false
    if (a === 1) return b === 1 || b === 2 || b === 4 || b === 5   // L × (L|V|LV|LVT)
    if (a === 4 || a === 2) return b === 2 || b === 3              // (LV|V) × (V|T)
    return (a === 5 || a === 3) && b === 3                         // (LVT|T) × T
}
function joinHangul(str: string, b: number, forward: boolean): number {
    const prevCp = (i: number) => { const lo = str.charCodeAt(i - 1); return surrogateLow(lo) && i >= 2 ? codePointAt(str, i - 2) : lo }
    while (b > 0 && b < str.length) {
        if (str.charCodeAt(b) < 0x1100 && str.charCodeAt(b - 1) < 0x1100) break
        if (!hangulJoins(hangulType(prevCp(b)), hangulType(codePointAt(str, b)))) break
        const n = find(str, b, forward, true)
        if (n === b) break
        b = n
    }
    return b
}

const SPACING_MARK = /^\p{Mc}$/u
function isSpacingMark(code: number): boolean {
    return SPACING_MARK.test(String.fromCodePoint(code))
}

function surrogateLow(ch: number) {
    return ch >= 0xDC00 && ch < 0xE000
}
function surrogateHigh(ch: number) {
    return ch >= 0xD800 && ch < 0xDC00
}

// 给定位置的码点(同 String.prototype.codePointAt)。
export function codePointAt(str: string, pos: number) {
    const code0 = str.charCodeAt(pos)
    if (!surrogateHigh(code0) || pos + 1 === str.length)
        return code0
    const code1 = str.charCodeAt(pos + 1)
    if (!surrogateLow(code1))
        return code0
    return ((code0 - 0xD800) << 10) + (code1 - 0xDC00) + 0x10000
}

// 码点 → JS 字符串(同 String.fromCodePoint)。
export function fromCodePoint(code: number) {
    if (code <= 0xFFFF)
        return String.fromCharCode(code)
    code -= 0x10000
    return String.fromCharCode((code >> 10) + 0xD800, (code & 1023) + 0xDC00)
}

// 一个码点在 JS 字符串里占的位置数。
export function codePointSize(code: number): 1 | 2 {
    return code < 0x10000 ? 1 : 2
}
