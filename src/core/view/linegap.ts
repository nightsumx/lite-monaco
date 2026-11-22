// 超长行的横向虚拟化(不折行时):只把视口附近的一段文字放进 DOM,两侧换成等宽的占位(line gap)。
//
// 为什么:100 万字符的单行(压缩过的 JS、日志、JSON)整行进 DOM,Blink 每次重排都要排这 100 万个字符:
// 首次渲染、横向滚动换窗、全选、切折行都是几十到几百毫秒。屏幕上最多看到一两百列。
// Monaco 的办法是 stopRenderingLineAfter(默认 1 万字符后直接不画,文字被截断);这里不截断:
// 窗口外的文字换成一个 inline-block 占位,宽 = 隐藏文字的视觉列数 × 字宽,窗口随横向滚动移动(CM6 LineGap 同理)。
//
// 占位是普通的原子 widget(data-cm-widget = 隐藏的 doc 字符数,data-cm-widget-from = 起点):
// dombridge 按它换算 DOM ↔ pos,domreader 从 doc 切回隐藏原文,复制走 state,所以模型永远是全文。
// 它不进 decos():不是折叠,heightmap / viewportHasCollapse / replacedRangesIn 都看不见它。
//
// 窗口 = 扫描窗口(视口列 ± SCAN_PAD,按 SCAN_STEP 量化,横向滚动时才动)∪ 主选区 anchor / head 附近
// (按 GAP_STEP 量化:原生选区和输入法只能落在真文字里)∪ 行内的 point 装饰(折叠、inlay:宽度没法估)。
// 列宽按等宽字体算(tab 到下一个 tab stop、全角 / emoji 两列、组合字符 0 列);比例字体和含 RTL 的行不用占位(照旧整行)。
//
// 折行时不做(仍整行进 DOM):竖向占位要知道每个视觉行从哪个字符折,softwrap.ts 是 Monaco 的折行规则(Kinsoku、wordBreak),
// 和浏览器 CSS 折行(UAX #14)对不上,折点一错,占位上下的文字就和整行排版时的位置不同。2026-11-22 实测 100 万字符一行
// 打开折行 ~180 ms:一次 ~35–60 ms 的整行重排(updateWrapLineLength 读 clientWidth,~2950 个对象全脏,不可避免的那一次),
// 之后 measureAndRender / 选区层 redraw / reposition / relayoutHeights 各读一次布局,每次 7–14 ms(只脏几个对象,
// 但 Blink 要在 100 万字符的折行块里重新定位)。Monaco 31 ms 是因为它在 1 万字符后截断(stopRenderingLineAfter)。
// 把这几次读布局并成一次是下一步(和视图更新合批一起做),没做。

import type { Rope } from '../model/rope'
import type { DecorationSet } from '../model/decoration'
import { Decoration, WidgetType } from '../model/decoration'
import { RangeSet } from '../model/rangeset'
import { isEmojiImprecise } from '../edit/vcol'
import { containsRTL } from './materialize'
import { LONG_LINE_SCAN, type ScanWindow } from './scanwindow'

export const GAP_CLASS = 'cm-lineGap'
/** 选区两端保留的窗口按这个步长量化(绝对位置) */
export const GAP_STEP = 1024
/** 比这短的隐藏段不值得换成占位 */
export const GAP_MIN = 2048

export class LineGapWidget extends WidgetType {
    constructor(readonly width: number) { super() }
    eq(other: WidgetType): boolean { return other instanceof LineGapWidget && other.width === this.width }
    toDOM(): Node {
        const el = document.createElement('span')
        el.className = GAP_CLASS
        el.style.cssText = `display:inline-block;width:${this.width}px`
        return el
    }
}

export function isLineGap(node: Node | null | undefined): node is HTMLElement {
    return !!node && node.nodeType === 1 && (node as Element).classList.contains(GAP_CLASS)
}

// —— 视觉列 ——
// 一行的视觉列前缀表(cols[i] = 第 i 个码元之前的列;cols[n] = 行宽)。纯 ASCII 一类(列 = 下标)返回 null。
// 长行按文本记几份:posAtCoords 二分一次要问十几次 caretCoords,每次都扫 100 万字符就太慢。
const NON_PLAIN = /[\t\u0300-\u036f\u200b-\u200f\u2e80-\ud7af\ud800-\udfff\uf900-\ufaff\ufe00-\ufe0f\uff01-\uff5e]/
// cols:视觉列前缀;wide:两列字符(全角 / emoji)个数前缀。像素宽 = (列 − 2×两列字符) × 半角宽 + 两列字符 × 全角宽
// (CJK 多半落到后备字体,宽度不一定正好是两个半角)
interface LineInfo { tabSize: number, cols: Int32Array | null, wide: Int32Array | null, rtl: boolean }
// 先用正则粗筛(比逐码元循环快几倍),命中了再按 Monaco 的表细判
const MAYBE_RTL = /[\u05be-\u08ff\u200f\ufb1d-\ufefc\ud802\ud803\ud83a\ud83b]/
const memo = new Map<string, LineInfo>()
const MEMO_MAX = 6

function isFullWidth(c: number): boolean {
    return (c >= 0x2E80 && c <= 0xD7AF) || (c >= 0xF900 && c <= 0xFAFF) || (c >= 0xFF01 && c <= 0xFF5E)
}

function columnsOf(text: string, tabSize: number): { cols: Int32Array, wide: Int32Array } {
    const n = text.length
    const cols = new Int32Array(n + 1), wide = new Int32Array(n + 1)
    let v = 0, w = 0
    for (let i = 0; i < n; i++) {
        cols[i] = v
        wide[i] = w
        const c = text.charCodeAt(i)
        if (c === 9) v += tabSize - v % tabSize
        else if (c >= 0xD800 && c < 0xDC00 && i + 1 < n && (text.charCodeAt(i + 1) & 0xFC00) === 0xDC00) {
            const two = isEmojiImprecise(((c - 0xD800) << 10) + (text.charCodeAt(i + 1) - 0xDC00) + 0x10000)
            v += two ? 2 : 1
            if (two) w++
            i++
            cols[i] = v // 代理对中间不是落点,记成整对之后
            wide[i] = w
        }
        else if ((c >= 0x300 && c <= 0x36F) || (c >= 0x200B && c <= 0x200F) || (c >= 0xFE00 && c <= 0xFE0F)) { /* 0 列 */ }
        else if (isFullWidth(c)) { v += 2; w++ }
        else v++
    }
    cols[n] = v
    wide[n] = w
    return { cols, wide }
}

export function lineInfo(text: string, tabSize: number): LineInfo {
    const hit = memo.get(text)
    if (hit && hit.tabSize === tabSize) return hit
    const t = NON_PLAIN.test(text) ? columnsOf(text, tabSize) : null
    const info: LineInfo = { tabSize, cols: t && t.cols, wide: t && t.wide, rtl: MAYBE_RTL.test(text) && containsRTL(text) }
    if (memo.size >= MEMO_MAX) memo.delete(memo.keys().next().value!)
    memo.set(text, info)
    return info
}

/** 行内偏移 → 视觉列 */
export function colAt(info: LineInfo, off: number): number {
    return info.cols ? info.cols[off] : off
}

/** 行内 [a, b) 的像素宽 */
export function pxBetween(info: LineInfo, a: number, b: number, advance: number, wideAdvance: number): number {
    if (!info.cols || !info.wide) return (b - a) * advance
    const w = info.wide[b] - info.wide[a]
    return (info.cols[b] - info.cols[a] - 2 * w) * advance + w * wideAdvance
}

/** 视觉列 → 第一个列 ≥ col 的行内偏移 */
function offAtCol(info: LineInfo, col: number, len: number): number {
    if (!info.cols) return Math.min(len, Math.max(0, col))
    const cols = info.cols
    let lo = 0, hi = len
    while (lo < hi) {
        const mid = (lo + hi) >> 1
        if (cols[mid] < col) lo = mid + 1
        else hi = mid
    }
    return lo
}

// 占位的边界不能劈开一个字素:落在低代理项 / 组合字符 / 变体选择符 / ZWJ 上就往后挪到它们之后
function extendsCluster(c: number): boolean {
    return (c >= 0xDC00 && c < 0xE000) || (c >= 0x300 && c <= 0x36F) || c === 0x200D || (c >= 0xFE00 && c <= 0xFE0F)
}
function snapForward(text: string, off: number): number {
    while (off < text.length && extendsCluster(text.charCodeAt(off))) off++
    return off
}

export interface GapConfig {
    /** 扫描窗口(列) */
    win: ScanWindow
    /** 要留在 DOM 里的位置(绝对):主选区 anchor / head */
    keep: readonly number[]
    /** 行内 point 装饰(绝对区间):折叠、inlay 等 widget,宽度估不出来,留在窗口里 */
    points: readonly { from: number, to: number }[]
    /** 一个半角列的像素宽;0 = 不用占位(比例字体) */
    advance: number
    /** 一个全角字符的像素宽 */
    wideAdvance: number
    tabSize: number
}

export interface LineGap { from: number, to: number, width: number }

/** 一条超长行(line)的占位段,绝对位置、升序。不需要占位返回 [] */
export function lineGaps(line: { from: number, to: number, text: string }, cfg: GapConfig): LineGap[] {
    const len = line.to - line.from
    if (len <= LONG_LINE_SCAN || !(cfg.advance > 0)) return []
    const info = lineInfo(line.text, cfg.tabSize)
    if (info.rtl) return [] // 双向文本:视觉顺序 ≠ 逻辑顺序,占位会打乱重排
    const keep: [number, number][] = []
    keep.push([offAtCol(info, cfg.win.start, len), cfg.win.end === Infinity ? len : offAtCol(info, cfg.win.end, len)])
    for (const p of cfg.keep) {
        if (p < line.from || p > line.to) continue
        const k = Math.floor(p / GAP_STEP)
        keep.push([Math.max(0, (k - 1) * GAP_STEP - line.from), Math.min(len, (k + 2) * GAP_STEP - line.from)])
    }
    for (const r of cfg.points) {
        if (r.to < line.from || r.from > line.to) continue
        keep.push([Math.max(0, r.from - line.from - 64), Math.min(len, r.to - line.from + 64)])
    }
    keep.sort((a, b) => a[0] - b[0])
    const out: LineGap[] = []
    let at = 0
    const gap = (a: number, b: number) => {
        a = snapForward(line.text, a)
        b = snapForward(line.text, b)
        if (b - a < GAP_MIN) return
        out.push({ from: line.from + a, to: line.from + b, width: pxBetween(info, a, b, cfg.advance, cfg.wideAdvance) })
    }
    for (const [a, b] of keep) {
        if (a > at) gap(at, a)
        at = Math.max(at, b)
    }
    if (at < len) gap(at, len)
    return out
}

/** [from, to](整行边界)里所有超长行的占位,做成一层 replace 装饰;没有返回 null */
export function lineGapSet(doc: Rope, from: number, to: number, cfg: GapConfig): DecorationSet | null {
    if (to - from <= LONG_LINE_SCAN) return null
    const ranges = []
    for (let pos = from; pos <= to;) {
        const line = doc.lineAt(pos)
        if (line.to - line.from > LONG_LINE_SCAN) {
            for (const g of lineGaps(line, cfg)) {
                const a = Math.max(g.from, from), b = Math.min(g.to, to)
                if (b - a >= GAP_MIN) ranges.push(Decoration.replace({ widget: new LineGapWidget(g.width) }).range(a, b))
            }
        }
        pos = line.to + 1
    }
    return ranges.length ? RangeSet.of(ranges) as DecorationSet : null
}

/** 占位 el 里的位置 pos 离占位左缘的像素(和算占位宽同一把尺,所以换窗前后同一个字符的 x 不变) */
export function gapOffset(doc: Rope, el: Element, pos: number, tabSize: number, advance: number, wideAdvance: number): number {
    const from = Number(el.getAttribute('data-cm-widget-from'))
    const len = Number(el.getAttribute('data-cm-widget'))
    if (!(len > 0) || !(from >= 0) || from + len > doc.length || pos <= from) return 0
    const line = doc.lineAt(from)
    const info = lineInfo(line.text, tabSize)
    return pxBetween(info, from - line.from, Math.min(pos, from + len) - line.from, advance, wideAdvance)
}
