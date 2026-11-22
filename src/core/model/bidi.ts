// Portions of this file are derived from CodeMirror 6 (MIT, Copyright (C) Marijn Haverbeke and others). See THIRD-PARTY-NOTICES.md.
// CM7 BiDi —— Unicode 双向文本排序(UAX#9)。§4「逐行移植」:UBA 的 W/N/bracket 规则 + isolate
// 递归是十年坑知识的化石,逐行搬运不重撞。owner of Direction;消费者=cursor/decoration/viewstate。
//
// 移植自 CM6 view/bidi.ts。差异:① const enum T/Bracketed → 普通 enum(本仓禁 const enum);
// ② Text/SelectionRange/findClusterBreak 改本仓 core 来源;③ BidiRE 用码点范围词法判定取代正则
// (本仓禁正则);④ movedOver 全局观测点保留(moveVisually 的副产物,光标动了多少字符)。

import type { Line } from './rope'
import type { SelectionRange } from './selection'
import { findClusterBreak } from './char'
import { EditorSelection } from './selection'

// 文本方向。值匹配 bidi 算法里对应方向 span 的基础 level。
export enum Direction {
    LTR = 0,
    RTL = 1,
}

const LTR = Direction.LTR
const RTL = Direction.RTL

// 字符双向类型码(按 log2 编码进字符串表)。
enum T {
    L = 1, // Left-to-Right
    R = 2, // Right-to-Left
    AL = 4, // Right-to-Left Arabic
    EN = 8, // European Number
    AN = 16, // Arabic Number
    ET = 64, // European Number Terminator
    CS = 128, // Common Number Separator
    NI = 256, // Neutral or Isolate (BN, N, WS)
    NSM = 512, // Non-spacing Mark
    Strong = 7, // L | R | AL
    Num = 24, // EN | AN
}

// 解码:每个类型按 log2(type) 存成一位数字。
function dec(str: string): readonly T[] {
    const result: T[] = []
    for (let i = 0; i < str.length; i++)
        result.push(1 << +str[i])
    return result
}

// 码点 0..0xf8 的字符类型
const LowTypes = dec('88888888888888888888888888888888888666888888787833333333337888888000000000000000000000000008888880000000000000000000000000088888888888888888888888888888888888887866668888088888663380888308888800000000000000000000000800000000000000000000000000000008')

// 码点 0x600..0x6f9 的字符类型
const ArabicTypes = dec('4444448826627288999999999992222222222222222222222222222222222222222222222229999999999999999999994444444444644222822222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222999999949999999229989999223333333333')

const Brackets: Record<number, number> = Object.create(null)
const BracketStack: number[] = []
// 完整表见 https://www.unicode.org/Public/UCD/latest/ucd/BidiBrackets.txt,这里只留三对常用括号控体积。
for (const p of ['()', '[]', '{}']) {
    const l = p.charCodeAt(0)
    const r = p.charCodeAt(1)
    Brackets[l] = r
    Brackets[r] = -l
}

// 括号范围内/前的方向追踪。
enum Bracketed {
    OppositeBefore = 1,
    EmbedInside = 2,
    OppositeInside = 4,
    MaxDepth = 189, // 3 * 63
}

function charType(ch: number) {
    return ch <= 0xF7
        ? LowTypes[ch]
        : ch >= 0x590 && ch <= 0x5F4
            ? T.R
            : ch >= 0x600 && ch <= 0x6F9
                ? ArabicTypes[ch - 0x600]
                : ch >= 0x6EE && ch <= 0x8AC
                    ? T.AL
                    : ch >= 0x2000 && ch <= 0x200C
                        ? T.NI
                        : ch >= 0xFB50 && ch <= 0xFDFF ? T.AL : T.L
}

// 一行里是否含任何强 RTL / Arabic 字符(决定是否能走 trivialOrder 捷径)。
// 禁正则,故按码点范围逐字符扫(等价 CM6 的 BidiRE)。
function hasBidiChar(line: string) {
    for (let i = 0; i < line.length; i++) {
        const ch = line.charCodeAt(i)
        if ((ch >= 0x590 && ch <= 0x5F4) || (ch >= 0x600 && ch <= 0x6FF)
            || (ch >= 0x700 && ch <= 0x8AC) || (ch >= 0xFB50 && ch <= 0xFDFF)) {
            return true
        }
    }
    return false
}

// 单方向的连续文本范围(LTR 或 RTL)。
export class BidiSpan {
    get dir(): Direction { return this.level % 2 ? RTL : LTR }

    constructor(
        readonly from: number,
        readonly to: number,
        readonly level: number,
    ) {}

    side(end: boolean, dir: Direction) { return (this.dir === dir) === end ? this.to : this.from }

    forward(forward: boolean, dir: Direction) { return forward === (this.dir === dir) }

    static find(order: readonly BidiSpan[], index: number, level: number, assoc: number) {
        let maybe = -1
        for (let i = 0; i < order.length; i++) {
            const span = order[i]
            if (span.from <= index && span.to >= index) {
                if (span.level === level)
                    return i
                // 多个 span 命中时:assoc != 0 取覆盖该侧的;否则取最小 level。
                if (maybe < 0 || (assoc !== 0 ? (assoc < 0 ? span.from < index : span.to > index) : order[maybe].level > span.level))
                    maybe = i
            }
        }
        if (maybe < 0)
            throw new RangeError('Index out of range')
        return maybe
    }
}

// isolate 数组恒按位置排序、非空、嵌套不越出父级。
export interface Isolate { from: number, to: number, direction: Direction, inner: readonly Isolate[] }

export function isolatesEq(a: readonly Isolate[], b: readonly Isolate[]) {
    if (a.length !== b.length)
        return false
    for (let i = 0; i < a.length; i++) {
        const iA = a[i]
        const iB = b[i]
        if (iA.from !== iB.from || iA.to !== iB.to || iA.direction !== iB.direction || !isolatesEq(iA.inner, iB.inner))
            return false
    }
    return true
}

// 复用的字符类型数组
const types: T[] = []

// 填充 types[from..to] 并应用 W 规范化规则。
function computeCharTypes(line: string, rFrom: number, rTo: number, isolates: readonly Isolate[], outerType: T) {
    for (let iI = 0; iI <= isolates.length; iI++) {
        const from = iI ? isolates[iI - 1].to : rFrom
        const to = iI < isolates.length ? isolates[iI].from : rTo
        const prevType = iI ? T.NI : outerType

        // W1. NSM 取前一字符类型(行首取 sor)。
        // W2. EN 向前找到第一个强类型;遇 AL 则 EN→AN。
        // W3. AL→R。(此后剩:L, R, EN, AN, ET, CS, NI)
        for (let i = from, prev = prevType, prevStrong = prevType; i < to; i++) {
            let type = charType(line.charCodeAt(i))
            if (type === T.NSM)
                type = prev
            else if (type === T.EN && prevStrong === T.AL)
                type = T.AN
            types[i] = type === T.AL ? T.R : type
            if (type & T.Strong)
                prevStrong = type
            prev = type
        }

        // W5. 邻接 EN 的 ET 序列全变 EN。
        // W6. 否则分隔符/终止符变 NI。
        // W7. EN 向前找到第一个强类型;遇 L 则 EN→L。(此后剩:L, R, EN+AN, NI)
        for (let i = from, prev = prevType, prevStrong = prevType; i < to; i++) {
            let type = types[i]
            if (type === T.CS) {
                if (i < to - 1 && prev === types[i + 1] && (prev & T.Num))
                    type = types[i] = prev
                else
                    types[i] = T.NI
            }
            else if (type === T.ET) {
                let end = i + 1
                while (end < to && types[end] === T.ET)
                    end++
                const replace = (i && prev === T.EN) || (end < rTo && types[end] === T.EN) ? (prevStrong === T.L ? T.L : T.EN) : T.NI
                for (let j = i; j < end; j++)
                    types[j] = replace
                i = end - 1
            }
            else if (type === T.EN && prevStrong === T.L) {
                types[i] = T.L
            }
            prev = type
            if (type & T.Strong)
                prevStrong = type
        }
    }
}

// 处理整个 run 序列里的括号对。
function processBracketPairs(line: string, rFrom: number, rTo: number, isolates: readonly Isolate[], outerType: T) {
    const oppositeType = outerType === T.L ? T.R : T.L

    for (let iI = 0, sI = 0, context = 0; iI <= isolates.length; iI++) {
        const from = iI ? isolates[iI - 1].to : rFrom
        const to = iI < isolates.length ? isolates[iI].from : rTo
        // N0. 按开括号的逻辑位置顺序处理括号对。此范围内 EN/AN 当作 R。
        for (let i = from; i < to; i++) {
            // BracketStack 上每个开括号存 [startIndex, char, strongSeen] 三元组。
            const ch = line.charCodeAt(i)
            const br = Brackets[ch]
            if (br) {
                if (br < 0) { // 闭括号
                    for (let sJ = sI - 3; sJ >= 0; sJ -= 3) {
                        if (BracketStack[sJ + 1] === -br) {
                            const flags = BracketStack[sJ + 2]
                            const type = (flags & Bracketed.EmbedInside)
                                ? outerType
                                : !(flags & Bracketed.OppositeInside)
                                        ? 0
                                        : (flags & Bracketed.OppositeBefore) ? oppositeType : outerType
                            if (type)
                                types[i] = types[BracketStack[sJ]] = type
                            sI = sJ
                            break
                        }
                    }
                }
                else if (BracketStack.length === Bracketed.MaxDepth) {
                    break
                }
                else {
                    BracketStack[sI++] = i
                    BracketStack[sI++] = ch
                    BracketStack[sI++] = context
                }
            }
            else {
                const type = types[i]
                if (type === T.R || type === T.L) {
                    const embed = type === outerType
                    context = embed ? 0 : Bracketed.OppositeBefore
                    for (let sJ = sI - 3; sJ >= 0; sJ -= 3) {
                        const cur = BracketStack[sJ + 2]
                        if (cur & Bracketed.EmbedInside)
                            break
                        if (embed) {
                            BracketStack[sJ + 2] |= Bracketed.EmbedInside
                        }
                        else {
                            if (cur & Bracketed.OppositeInside)
                                break
                            BracketStack[sJ + 2] |= Bracketed.OppositeInside
                        }
                    }
                }
            }
        }
    }
}

function processNeutrals(rFrom: number, rTo: number, isolates: readonly Isolate[], outerType: T) {
    for (let iI = 0, prev = outerType; iI <= isolates.length; iI++) {
        const from = iI ? isolates[iI - 1].to : rFrom
        let to = iI < isolates.length ? isolates[iI].from : rTo
        // N1. 中性序列两侧强文本同向时取该向(EN/AN 当 R);N2. 余下中性取嵌入方向。
        for (let i = from; i < to;) {
            const type = types[i]
            if (type === T.NI) {
                let end = i + 1
                for (;;) {
                    if (end === to) {
                        if (iI === isolates.length)
                            break
                        end = isolates[iI++].to
                        to = iI < isolates.length ? isolates[iI].from : rTo
                    }
                    else if (types[end] === T.NI) {
                        end++
                    }
                    else {
                        break
                    }
                }
                const beforeL = prev === T.L
                const afterL = (end < rTo ? types[end] : outerType) === T.L
                const replace = beforeL === afterL ? (beforeL ? T.L : T.R) : outerType
                for (let j = end, jI = iI, fromJ = jI ? isolates[jI - 1].to : rFrom; j > i;) {
                    if (j === fromJ) {
                        j = isolates[--jI].from
                        fromJ = jI ? isolates[jI - 1].to : rFrom
                    }
                    types[--j] = replace
                }
                i = end
            }
            else {
                prev = type
                i++
            }
        }
    }
}

// emitSpans 的「向前/向后探测」内层循环抽成纯谓词,避免标签 break(本仓禁 no-labels)。
// 返回 true = 探测命中边界,外层 run 循环应 break;false = 命中异向普通字符,内层结束、外层继续。
function scanAheadFwd(isolates: readonly Isolate[], iso: Isolate, iI: number, to: number, ourType: T): boolean {
    for (let upto = iso.to, jI = iI + 1; ;) {
        if (upto === to)
            return true
        if (jI < isolates.length && isolates[jI].from === upto)
            upto = isolates[jI++].to
        else if (types[upto] === ourType)
            return true
        else return false
    }
}

function scanAheadBwd(isolates: readonly Isolate[], iso: Isolate, iI: number, from: number, ourType: T): boolean {
    for (let upto = iso.from, jI = iI; ;) {
        if (upto === from)
            return true
        if (jI && isolates[jI - 1].to === upto)
            upto = isolates[--jI].from
        else if (types[upto - 1] === ourType)
            return true
        else return false
    }
}

// 找出给定范围内字符类型的连续段并产出 span。按 level 适当翻转段序,并在恰当处递归算 isolate。
function emitSpans(line: string, from: number, to: number, level: number, baseLevel: number, isolates: readonly Isolate[], order: BidiSpan[]) {
    const ourType = level % 2 ? T.R : T.L

    if ((level % 2) === (baseLevel % 2)) { // 与基础方向同向,不翻转
        for (let iCh = from, iI = 0; iCh < to;) {
            let sameDir = true
            let isNum = false
            if (iI === isolates.length || iCh < isolates[iI].from) {
                const next = types[iCh]
                if (next !== ourType) {
                    sameDir = false
                    isNum = next === T.AN
                }
            }
            const recurse: Isolate[] | null = !sameDir && ourType === T.L ? [] : null
            const localLevel = sameDir ? level : level + 1
            let iScan = iCh
            for (;;) {
                if (iI < isolates.length && iScan === isolates[iI].from) {
                    if (isNum)
                        break
                    const iso = isolates[iI]
                    // 向前确认 isolate 之后这一方向还有字符
                    if (!sameDir && scanAheadFwd(isolates, iso, iI, to, ourType))
                        break
                    iI++
                    if (recurse) {
                        recurse.push(iso)
                    }
                    else {
                        if (iso.from > iCh)
                            order.push(new BidiSpan(iCh, iso.from, localLevel))
                        const dirSwap = (iso.direction === LTR) !== !(localLevel % 2)
                        computeSectionOrder(line, dirSwap ? level + 1 : level, baseLevel, iso.inner, iso.from, iso.to, order)
                        iCh = iso.to
                    }
                    iScan = iso.to
                }
                else if (iScan === to || (sameDir ? types[iScan] !== ourType : types[iScan] === ourType)) {
                    break
                }
                else {
                    iScan++
                }
            }
            if (recurse)
                emitSpans(line, iCh, iScan, level + 1, baseLevel, recurse, order)
            else if (iCh < iScan)
                order.push(new BidiSpan(iCh, iScan, localLevel))
            iCh = iScan
        }
    }
    else {
        // 反向迭代以翻转段序。同样的代码,从段尾走到段首。
        for (let iCh = to, iI = isolates.length; iCh > from;) {
            let sameDir = true
            let isNum = false
            if (!iI || iCh > isolates[iI - 1].to) {
                const next = types[iCh - 1]
                if (next !== ourType) {
                    sameDir = false
                    isNum = next === T.AN
                }
            }
            const recurse: Isolate[] | null = !sameDir && ourType === T.L ? [] : null
            const localLevel = sameDir ? level : level + 1
            let iScan = iCh
            for (;;) {
                if (iI && iScan === isolates[iI - 1].to) {
                    if (isNum)
                        break
                    const iso = isolates[--iI]
                    if (!sameDir && scanAheadBwd(isolates, iso, iI, from, ourType))
                        break
                    if (recurse) {
                        recurse.push(iso)
                    }
                    else {
                        if (iso.to < iCh)
                            order.push(new BidiSpan(iso.to, iCh, localLevel))
                        const dirSwap = (iso.direction === LTR) !== !(localLevel % 2)
                        computeSectionOrder(line, dirSwap ? level + 1 : level, baseLevel, iso.inner, iso.from, iso.to, order)
                        iCh = iso.from
                    }
                    iScan = iso.from
                }
                else if (iScan === from || (sameDir ? types[iScan - 1] !== ourType : types[iScan - 1] === ourType)) {
                    break
                }
                else {
                    iScan--
                }
            }
            if (recurse)
                emitSpans(line, iScan, iCh, level + 1, baseLevel, recurse, order)
            else if (iScan < iCh)
                order.push(new BidiSpan(iScan, iCh, localLevel))
            iCh = iScan
        }
    }
}

function computeSectionOrder(line: string, level: number, baseLevel: number, isolates: readonly Isolate[], from: number, to: number, order: BidiSpan[]) {
    const outerType = level % 2 ? T.R : T.L
    computeCharTypes(line, from, to, isolates, outerType)
    processBracketPairs(line, from, to, isolates, outerType)
    processNeutrals(from, to, isolates, outerType)
    emitSpans(line, from, to, level, baseLevel, isolates, order)
}

export function computeOrder(line: string, direction: Direction, isolates: readonly Isolate[]) {
    if (!line)
        return [new BidiSpan(0, 0, direction === RTL ? 1 : 0)]
    if (direction === LTR && !isolates.length && !hasBidiChar(line))
        return trivialOrder(line.length)

    if (isolates.length) {
        while (line.length > types.length)
            types[types.length] = T.NI // 保证 types 数组无空洞
    }
    const order: BidiSpan[] = []
    const level = direction === LTR ? 0 : 1
    computeSectionOrder(line, level, level, isolates, 0, line.length, order)
    return order
}

export function trivialOrder(length: number) {
    return [new BidiSpan(0, length, 0)]
}

// moveVisually 的副产物:本次移动跨过的文本(全局观测点,保留 CM6 语义)。
// eslint-disable-next-line import/no-mutable-exports
export let movedOver = ''

// 纯视觉移动:不保证遍历每个逻辑位置。简单输入会遍历到;多个同 level isolate 相邻、或行尾逆主向
// 文本会让某些位置不可达。每个可见光标位对应触碰它的最低 level bidi span。
export function moveVisually(line: Line, order: readonly BidiSpan[], dir: Direction, start: SelectionRange, forward: boolean) {
    let startIndex = start.head - line.from
    let spanI = BidiSpan.find(order, startIndex, start.bidiLevel ?? -1, start.assoc)
    let span = order[spanI]
    let spanEnd = span.side(forward, dir)
    // 段末
    if (startIndex === spanEnd) {
        const nextI = spanI += forward ? 1 : -1
        if (nextI < 0 || nextI >= order.length)
            return null
        span = order[spanI = nextI]
        startIndex = span.side(!forward, dir)
        spanEnd = span.side(forward, dir)
    }
    let nextIndex = findClusterBreak(line.text, startIndex, span.forward(forward, dir))
    if (nextIndex < span.from || nextIndex > span.to)
        nextIndex = spanEnd
    movedOver = line.text.slice(Math.min(startIndex, nextIndex), Math.max(startIndex, nextIndex))

    const nextSpan = spanI === (forward ? order.length - 1 : 0) ? null : order[spanI + (forward ? 1 : -1)]
    if (nextSpan && nextIndex === spanEnd && nextSpan.level + (forward ? 0 : 1) < span.level)
        return EditorSelection.cursor(nextSpan.side(!forward, dir) + line.from, nextSpan.forward(forward, dir) ? 1 : -1, nextSpan.level)
    return EditorSelection.cursor(nextIndex + line.from, span.forward(forward, dir) ? -1 : 1, span.level)
}

export function autoDirection(text: string, from: number, to: number) {
    for (let i = from; i < to; i++) {
        const type = charType(text.charCodeAt(i))
        if (type === T.L)
            return LTR
        if (type === T.R || type === T.AL)
            return RTL
    }
    return LTR
}
