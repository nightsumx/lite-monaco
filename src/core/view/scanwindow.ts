// 超长行的“扫描窗口”:词法扫描类装饰(链接、不可见字符、#hex 色块、行尾空白、tab 对齐)
// 对很长的行(默认 2 万字符以上,和 maxTokenizationLineLength 同一个量级)只扫可见列附近的一段。
//
// 为什么:这些装饰以前每个键都把整条行扫一遍。53 万字符的单行(压缩过的 JS / JSON)里打一个字,
// 光扫描就 ~17 ms;屏幕上最多看到一百多列,别处的装饰没人看得见。成本该只取决于看得见什么,不取决于行多长。
// 做法照 Monaco 对长行的态度(不分词、不装饰),但不砍文字,只是窗口外不加装饰;窗口随横向滚动移动,
// 按 SCAN_STEP 量化,所以滚动时只在跨过一格时重画那条长行,不是每个像素。
//
// 折行时整条行都可能在视口里(竖向滚),窗口不限(Infinity)。

import type { Rope } from '../model/rope'

/** 行长超过它才用窗口;更短的行整行扫(扫一次不到 0.5 ms) */
export const LONG_LINE_SCAN = 20000
/** 窗口起止列量化到这个步长 */
export const SCAN_STEP = 4096
/** 可见列两侧再多扫这么多列 */
export const SCAN_PAD = 4096

/** [start, end) 列(字符数,不是像素);Infinity 表示不限 */
export interface ScanWindow { start: number, end: number }

// 横向没滚、窗口宽度不到 4096 列时 scanWindowFor 给的就是这个,所以首次 onScroll 不会因窗口“变了”重画长行
export const DEFAULT_SCAN_WINDOW: ScanWindow = { start: 0, end: 2 * SCAN_STEP }
export const UNLIMITED_SCAN_WINDOW: ScanWindow = { start: 0, end: Infinity }

/** 由横向滚动位置算窗口(像素 → 列;列按等宽估,全角字符会让可见字符更少,窗口只会偏大) */
export function scanWindowFor(scrollLeft: number, clientWidth: number, charWidth: number): ScanWindow {
    const cw = Math.max(1, charWidth)
    const visStart = Math.floor(scrollLeft / cw)
    const visEnd = Math.ceil((scrollLeft + (clientWidth || 1200)) / cw)
    return {
        start: Math.max(0, Math.floor((visStart - SCAN_PAD) / SCAN_STEP) * SCAN_STEP),
        end: Math.ceil((visEnd + SCAN_PAD) / SCAN_STEP) * SCAN_STEP,
    }
}

export const sameScanWindow = (a: ScanWindow, b: ScanWindow) => a.start === b.start && a.end === b.end

export interface ScanPiece {
    from: number
    to: number
    /** 右端是窗口切的,不是行尾(行尾空白之类“行尾才算”的扫描要把切口前的空白去掉) */
    cutRight: boolean
}

/**
 * 把 [from, to](整行边界)切成要扫描的片段:普通行连成一整段,超长行只留窗口里的那一截。
 * 没有窗口(无 view / 单测)就是整段。
 */
export function scanPieces(doc: Rope, from: number, to: number, win: ScanWindow | undefined): ScanPiece[] {
    if (!win || (win.start === 0 && win.end === Infinity)) return [{ from, to, cutRight: false }]
    const out: ScanPiece[] = []
    let cur: ScanPiece | null = null
    for (let pos = from; pos <= to;) {
        const line = doc.lineAt(pos)
        const len = line.to - line.from
        if (len <= LONG_LINE_SCAN) {
            if (cur) cur.to = line.to
            else out.push(cur = { from: line.from, to: line.to, cutRight: false })
        }
        else {
            cur = null
            const a = line.from + Math.min(len, win.start)
            const b = line.from + Math.min(len, win.end)
            if (b > a) out.push({ from: a, to: b, cutRight: b < line.to })
        }
        pos = line.to + 1
    }
    return out
}

/** 取片段文字;右端被窗口切断的片段去掉切口前的空白(它不是行尾空白) */
export function pieceText(doc: Rope, p: ScanPiece): { text: string, to: number } {
    let text = doc.sliceString(p.from, p.to)
    if (p.cutRight) {
        let e = text.length
        while (e > 0 && (text.charCodeAt(e - 1) === 32 || text.charCodeAt(e - 1) === 9)) e--
        text = text.slice(0, e)
    }
    return { text, to: p.from + text.length }
}
