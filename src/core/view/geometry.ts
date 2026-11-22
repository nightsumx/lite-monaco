// CM7 几何查询 —— 屏上坐标 ↔ doc 位置、视觉行（折行）边界、文本度量探针。纯函数,吃 EditorView。
//
// 坐标系约定（几何真源定律）:
//   竖向:heightMap 是真源。屏上 y → 内容坐标 = y − contentDOM 盒顶(盒顶已随 scrollTop 上移,padding-top 就是
//     虚拟化的顶部占位,属于内容坐标的一部分,**不能再减一次**)→ scaler.fromDOM → heightMap 高度。
//   横向:行内列由 caret 几何二分;视口外的行(无 DOM)按 charWidth 估。落点一律对齐字素簇边界(emoji/组合字符)。
//   折行:同一逻辑行跨多个视觉行,caret 序列按 (视觉行, x) 单调,二分要先比行再比 x。
//
// 文本度量(lineHeight/charWidth/textHeight/行左 padding)由 measureTextMetrics 一次可靠量出(对齐 CM6
// measureTextSize / Monaco FontInfo):临时塞一个绝对定位的 .cm-line 进 contentDOM 量完即删,与视口里渲染了
// 哪些行无关;字体/字号变化时由 EditorView 重新调用。

import type { EditorView } from './editorview'
import { findClusterBreak } from '../model/char'
import { QueryType } from './heightmap'
import { containsRTL, wrapIndentOfText } from './materialize'

export interface TextMetrics {
    /** 一行的盒高(小数,如 13px×1.5 = 19.5) */
    lineHeight: number
    /** 半角字符平均宽(Monaco typicalHalfwidthCharacterWidth) */
    charWidth: number
    /** 字形高(光标高的退化值) */
    textHeight: number
    /** .cm-line 左 padding(行文本起点相对 contentDOM 左缘) */
    padLeft: number
    /** .cm-line 右 padding */
    padRight: number
}

const PROBE_TEXT = 'abc def ghi jkl mno pqr stu vwx yz0 123 456 789'

// 量一次文本度量。jsdom(无布局)返回 null,调用方保留 oracle 现值。
export function measureTextMetrics(view: EditorView): TextMetrics | null {
    const content = view.contentDOM
    if (!content.isConnected) return null
    const doc = content.ownerDocument
    const dummy = doc.createElement('div')
    dummy.className = 'cm-line'
    dummy.setAttribute('aria-hidden', 'true')
    const s = dummy.style
    s.position = 'absolute'
    s.visibility = 'hidden'
    s.whiteSpace = 'pre'
    s.width = 'max-content'
    s.top = '0'
    s.left = '0'
    dummy.textContent = PROBE_TEXT
    let out: TextMetrics | null = null
    const run = () => {
        content.appendChild(dummy)
        try {
            const box = dummy.getBoundingClientRect()
            if (!box.height) return
            const r = doc.createRange()
            r.selectNodeContents(dummy.firstChild!)
            const text = typeof r.getBoundingClientRect === 'function' ? r.getBoundingClientRect() : null
            const win = doc.defaultView
            const cs = win ? win.getComputedStyle(dummy) : null
            const padLeft = cs ? parseFloat(cs.paddingLeft) || 0 : 0
            const padRight = cs ? parseFloat(cs.paddingRight) || 0 : 0
            out = {
                lineHeight: box.height,
                charWidth: text && text.width ? text.width / PROBE_TEXT.length : 0,
                textHeight: text && text.height ? text.height : box.height,
                padLeft,
                padRight,
            }
        }
        finally {
            dummy.remove()
        }
    }
    if (view.observer) view.observer.ignore(run)
    else run()
    return out
}

// 字素簇对齐:pos 落在簇中间时返回 [簇首, 簇尾],否则 null。行尾/行首恒为边界。
function clusterAround(view: EditorView, pos: number): [number, number] | null {
    const line = view.state.doc.lineAt(pos)
    const off = pos - line.from
    if (off <= 0 || off >= line.length) return null
    const start = findClusterBreak(line.text, off, false)
    const end = findClusterBreak(line.text, start, true)
    if (end === off || start === off) return null
    return [line.from + start, line.from + end]
}

/** pos 若在字素簇中间,按 forward 推到簇尾/簇首。 */
export function snapToCluster(view: EditorView, pos: number, forward: boolean): number {
    const c = clusterAround(view, pos)
    return c ? (forward ? c[1] : c[0]) : pos
}

type Caret = { left: number, top: number, height: number, bottom: number }

// caret 所在视觉行相对 y 的方位:-1 在 y 之上的行,1 在 y 之下的行,0 同行。非折行恒 0。
function rowSide(view: EditorView, c: Caret, y: number): number {
    if (!view.lineWrapping) return 0
    const lh = view.oracle.lineHeight
    const mid = c.top + c.height / 2
    if (mid + lh / 2 <= y) return -1
    if (mid - lh / 2 > y) return 1
    return 0
}

// 屏上坐标 → doc 位置(真实布局路径)。EditorView.posAtCoords 在有布局时调用。
export function posAtCoordsLayout(view: EditorView, coords: { x: number, y: number }, precise: boolean): number {
    const doc = view.state.doc
    const hm = view.heightMap
    const contentRect = view.contentDOM.getBoundingClientRect()
    const yDOM = coords.y - contentRect.top
    const yDoc = view.scaler.fromDOM(yDOM)
    // 末行下方(内容盒底部垫高、短文档下的空白、拖选拖出末行):对齐 Monaco,一律落到文档末尾,不按 x 取列。
    if (yDoc >= hm.height) return doc.length
    const block = hm.lineAt(Math.max(0, Math.min(hm.height - 0.01, yDoc)), QueryType.ByHeight, view.oracle, 0, 0)
    const from = Math.min(block.from, doc.length)
    const to = Math.min(block.to, doc.length)
    const vp = view.viewport
    if (precise && from >= vp.from && to <= vp.to) {
        // 折行时把 y 钳进该块的屏上竖向区间(点在块的上/下 padding 里也落到首/末视觉行)。
        const blockTop = contentRect.top + view.scaler.toDOM(block.top)
        const blockBottom = contentRect.top + view.scaler.toDOM(block.bottom)
        const y = Math.max(blockTop + 0.5, Math.min(blockBottom - 0.5, coords.y))
        const x = coords.x
        // 被 replace 替换的区间(折叠 ⋯):内部位置不是可见落点,一律按区间起点算(caret = ⋯ 左缘),
        // 保证二分时坐标单调;区间一直延伸到块尾的(折叠 = 整行隐藏,⋯ 后面没东西),末端也归起点 ——
        // 对齐 Monaco:点折叠行 ⋯ 右边 → 折叠首行行尾,光标永不落进隐藏行。
        const hidden = view.replacedRangesIn(from, to)
        const vis = (p: number): number => {
            for (const r of hidden) if (p > r.from && (p < r.to || (p === r.to && r.to >= to))) return r.from
            return p
        }
        // before(p):p 的 caret 是否在点击点之前(上一视觉行,或同行且在 x 左侧)。
        const before = (p: number): boolean | null => {
            const c = view.caretCoords(vis(p))
            if (!c) return null
            const side = rowSide(view, c, y)
            return side < 0 || (side === 0 && c.left < x)
        }
        // 含 RTL 的行:caret.left 对位置不单调(RTL 段里随位置递减),二分会跑偏到行尾。
        // 改成逐簇边界取最近的 caret(同一视觉行内)。行长有上限,超了仍走二分(拖选/点击才调用)。
        if (to - from <= 4000 && containsRTL(doc.sliceString(from, to))) {
            let best = -1, bestD = Infinity
            for (let p = from; p <= to; p++) {
                if (p !== from && p !== to && snapToCluster(view, p, true) !== p) continue
                const c = view.caretCoords(vis(p))
                if (!c || rowSide(view, c, y) !== 0) continue
                const d = Math.abs(c.left - x)
                if (d < bestD) { bestD = d; best = p }
            }
            if (best >= 0) return vis(best)
        }
        let lo = from, hi = to + 1
        let ok = true
        while (lo < hi) {
            const mid = (lo + hi) >> 1
            const b = before(mid)
            if (b === null) { ok = false; break }
            if (b) lo = mid + 1
            else hi = mid
        }
        if (ok) {
            // lo = 第一个不在点击点之前的位置(to+1 = 全在之前)。推到簇尾,前一候选 = 上一个簇边界。
            if (lo > to) return vis(snapToCluster(view, to, false))
            const cur = vis(snapToCluster(view, lo, true))
            if (cur <= from) return from
            const prev = vis(snapToCluster(view, cur - 1, false))
            const pc = view.caretCoords(prev)
            const cc = view.caretCoords(cur)
            if (!pc) return cur
            if (!cc || rowSide(view, cc, y) > 0) {
                // cur 是软折行点且默认画在下一视觉行:它的上游侧就是本视觉行末尾,与 prev 比远近
                const cu = cc && view.caretCoords(cur, -1)
                if (!cu || rowSide(view, cu, y) !== 0) return prev
                return x - pc.left <= cu.left - x ? prev : cur
            }
            if (rowSide(view, pc, y) < 0) {
                // prev 是软折行点:它的下游侧就是本视觉行行首,与 cur 比远近
                const ps = view.caretCoords(prev, 1)
                if (!ps || rowSide(view, ps, y) !== 0) return cur
                return x - ps.left <= cc.left - x ? prev : cur
            }
            return x - pc.left <= cc.left - x ? prev : cur
        }
    }
    // 视口外(无 DOM):按 charWidth 估列,行左 = contentDOM 左缘 + 行 padding。
    const line = doc.lineAt(from)
    const left = contentRect.left + view.textPadLeft
    const col = Math.max(0, Math.min(line.length,
        Math.round((coords.x - left) / Math.max(1, view.oracle.charWidth))))
    return snapToCluster(view, line.from + col, false)
}

// 视觉行序号(相对所在块顶):折行时第几行。
function rowIndex(view: EditorView, c: Caret, blockTopScreen: number): number {
    const lh = view.oracle.lineHeight || 1
    return Math.floor((c.top + c.height / 2 - blockTopScreen) / lh)
}

/**
 * 视觉行边界(对齐 CM6 moveToLineBoundary / Monaco 视觉行 Home/End)。
 * 非折行或无布局时 = 逻辑行首/尾。折行时返回 pos 所在视觉行的首/尾;尾部落在软折行点时 assoc=-1
 * (光标画在上一视觉行末尾,而非下一行开头)。
 */
export function moveToLineBoundary(view: EditorView, pos: number, forward: boolean, assoc = 0): { pos: number, assoc: -1 | 0 | 1 } {
    const line = view.state.doc.lineAt(pos)
    const logical = { pos: forward ? line.to : line.from, assoc: 0 as const }
    if (!view.lineWrapping) return logical
    const c = view.caretCoords(pos, assoc)
    if (!c) return logical
    const contentTop = view.contentDOM.getBoundingClientRect().top
    const block = view.heightMap.lineAt(pos, QueryType.ByPos, view.oracle, 0, 0)
    const blockTop = contentTop + view.scaler.toDOM(block.top)
    const row = rowIndex(view, c, blockTop)
    if (!forward) {
        // 第一个 caret(下游侧)行号 ≥ row 的位置
        let lo = line.from, hi = pos
        while (lo < hi) {
            const mid = (lo + hi) >> 1
            const m = view.caretCoords(mid, 1)
            if (!m) return logical
            if (rowIndex(view, m, blockTop) >= row) hi = mid
            else lo = mid + 1
        }
        return { pos: snapToCluster(view, lo, true), assoc: lo === line.from ? 0 : 1 }
    }
    // 最后一个 caret(上游侧)行号 ≤ row 的位置
    let lo = pos, hi = line.to
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1
        const m = view.caretCoords(mid, -1)
        if (!m) return logical
        if (rowIndex(view, m, blockTop) <= row) lo = mid
        else hi = mid - 1
    }
    const end = snapToCluster(view, lo, false)
    return { pos: end, assoc: end === line.to ? 0 : -1 }
}

/**
 * pos 在软折行点上时,屏上 y 落在哪一侧:-1 = 上一视觉行末尾,1 = 下一视觉行行首。不是折行点 / 无布局 → 0。
 * (同一个 doc 位置在折行点有两个视觉位置,selection 的 assoc 记住是哪个,Monaco 的 viewState 同理。)
 */
export function assocAtY(view: EditorView, pos: number, y: number): -1 | 0 | 1 {
    if (!view.lineWrapping) return 0
    const up = view.caretCoords(pos, -1), down = view.caretCoords(pos, 1)
    if (!up || !down || Math.abs(up.top - down.top) < 1) return 0
    return rowSide(view, down, y) === 0 ? 1 : -1
}

// 视口外(无 DOM)的折行:临时塞一个隐形 .cm-line(同宽、同续行缩进、纯文本)进 contentDOM 量折行点,
// 量完即删(同 measureTextMetrics)。返回 null = 量不出(无布局 / 没有可参照的渲染行)。
// rowOf(off, assoc):off 在第几个视觉行(折行点上 assoc<0 算上一行);xOf:内容坐标 x;posAt(row, x):
// 第 row 视觉行上离 x 最近的字素边界(+ 折行点上的 assoc)。
interface LineProbe {
    rows: number
    rowOf: (off: number, assoc: number) => number
    xOf: (off: number, assoc: number) => number
    posAt: (row: number, x: number) => { off: number, assoc: -1 | 0 | 1 }
}

function probeLine<T>(view: EditorView, text: string, use: (p: LineProbe) => T): T | null {
    const content = view.contentDOM
    const ref = content.querySelector('.cm-line:not([aria-hidden])') as HTMLElement | null
    if (!ref || !content.isConnected) return null
    const refBox = ref.getBoundingClientRect()
    const contentLeft = content.getBoundingClientRect().left
    if (!refBox.width) return null
    const doc = content.ownerDocument
    const el = doc.createElement('div')
    el.className = 'cm-line'
    el.setAttribute('aria-hidden', 'true')
    const s = el.style
    s.position = 'absolute'
    s.visibility = 'hidden'
    s.top = '0'
    s.left = '0'
    s.boxSizing = 'border-box'
    s.width = `${ref.offsetWidth || refBox.width}px`
    const indent = wrapIndentOfText(text)
    if (indent) s.setProperty('--cm-wrap-indent', indent)
    el.textContent = text
    let out: T | null = null
    const run = () => {
        content.appendChild(el)
        try {
            const node = el.firstChild
            if (!(node instanceof Text) || !text.length) return
            const box = el.getBoundingClientRect()
            const lh = view.oracle.lineHeight || 1
            const r = doc.createRange()
            // 字符 o 的字形矩形(取第一个有宽度的 rect,避开折行点上的零宽 rect)
            const glyph = (o: number) => {
                r.setStart(node, o)
                r.setEnd(node, o + 1)
                const rs = r.getClientRects()
                for (let i = 0; i < rs.length; i++) if (rs[i].width > 0) return rs[i]
                return rs.length ? rs[0] : null
            }
            const top0 = glyph(0)?.top ?? box.top
            const rowOfChar = (o: number) => { const g = glyph(o); return g ? Math.round((g.top - top0) / lh) : 0 }
            const n = text.length
            const rows = rowOfChar(n - 1) + 1
            // 第 k 视觉行首字符的 offset
            const rowStart = (k: number) => {
                let lo = 0, hi = n
                while (lo < hi) {
                    const mid = (lo + hi) >> 1
                    if (rowOfChar(mid) >= k) hi = mid
                    else lo = mid + 1
                }
                return lo
            }
            // 内容坐标:探针左缘对齐渲染行左缘
            const toX = (screen: number) => screen - box.left + (refBox.left - contentLeft)
            out = use({
                rows,
                rowOf: (off, assoc) => off >= n ? rowOfChar(n - 1) : off > 0 && assoc < 0 && rowOfChar(off - 1) < rowOfChar(off) ? rowOfChar(off - 1) : rowOfChar(off),
                xOf: (off, assoc) => {
                    if (off >= n || (assoc < 0 && off > 0 && rowOfChar(off - 1) < rowOfChar(off))) {
                        const g = glyph(off - 1)
                        return g ? toX(g.right) : 0
                    }
                    const g = glyph(off)
                    return g ? toX(g.left) : 0
                },
                posAt: (row, x) => {
                    const k = Math.max(0, Math.min(rows - 1, row))
                    const s = rowStart(k), e = k + 1 < rows ? rowStart(k + 1) : n
                    // 第一个中线在 x 右侧的字符 → 光标落在它前面;都在左侧 → 行尾
                    let lo = s, hi = e
                    while (lo < hi) {
                        const mid = (lo + hi) >> 1
                        const g = glyph(mid)
                        if (g && toX((g.left + g.right) / 2) < x) lo = mid + 1
                        else hi = mid
                    }
                    const assoc = lo === e && k + 1 < rows ? -1 : lo === s && k > 0 ? 1 : 0
                    return { off: lo, assoc }
                },
            })
        }
        finally {
            el.remove()
        }
    }
    if (view.observer) view.observer.ignore(run)
    else run()
    return out
}

/**
 * 按视觉行上/下移 rows 行(对齐 Monaco 折行下 ↑/↓/PageUp/PageDown、CM6 moveVertically)。goalX = 内容坐标系的
 * 目标 x(相对 contentDOM 左缘,与滚动无关,可跨多次移动保持);缺省取当前光标 x。越过文档首/尾 → 0 / doc 末。
 * 返回的 assoc 标出落点在软折行点时画在哪侧(x 超出视觉行宽 → 钳到行尾,assoc=-1)。
 *
 * 按块数视觉行(Monaco 在 view line 上数),不按 y 像素跳:视口外的块高是估的,PageDown 一次跨几十行时
 * 估错一行就落错行。每块的视觉行数:渲染中的块 = 实测高 / 行高;视口外的块用隐形探针行量(probeLine)。
 * 无布局(jsdom)返回 null,调用方退回逻辑行移动。
 */
export function moveVertically(view: EditorView, pos: number, forward: boolean, goalX?: number, assoc = 0, rows = 1): { pos: number, goalX: number, assoc: -1 | 0 | 1 } | null {
    const contentRect = view.contentDOM.getBoundingClientRect()
    const doc = view.state.doc
    const lh = view.oracle.lineHeight
    if (!lh || !contentRect.width) return null
    const vp = view.viewport
    const blockAt = (p: number) => view.heightMap.lineAt(p, QueryType.ByPos, view.oracle, 0, 0)
    const rendered = (b: { from: number, to: number }) => b.from >= vp.from && b.to <= vp.to
    const screenTop = (b: { top: number }) => contentRect.top + view.scaler.toDOM(b.top)
    // 块的视觉行数(折叠块整块算一行高的倍数)
    const rowsOf = (b: { from: number, to: number, height: number }): number | null => {
        if (rendered(b) || doc.lineAt(b.from).to < b.to) return Math.max(1, Math.round(b.height / lh))
        const text = doc.lineAt(b.from).text
        return text.length ? probeLine(view, text, p => p.rows) : 1
    }
    // 起点:块 + 块内第几视觉行 + x
    let block = blockAt(pos)
    let row: number, x: number
    const c = view.caretCoords(pos, assoc)
    if (c) {
        row = Math.max(0, Math.floor((c.top + c.height / 2 - screenTop(block)) / lh))
        x = goalX ?? (c.left - contentRect.left)
    }
    else {
        const line = doc.lineAt(pos)
        const at = probeLine(view, line.text, p => ({ row: p.rowOf(pos - line.from, assoc), x: p.xOf(pos - line.from, assoc) }))
        if (!at) return null
        row = at.row
        x = goalX ?? at.x
    }
    // 逐块数 rows 个视觉行
    let left = rows
    if (forward) {
        let n = rowsOf(block)
        if (n == null) return null
        while (row + left >= n) {
            left -= n - row
            if (block.to >= doc.length) return { pos: doc.length, goalX: x, assoc: 0 }
            block = blockAt(block.to + 1)
            row = 0
            const m = rowsOf(block)
            if (m == null) return null
            n = m
        }
        row += left
    }
    else {
        while (row - left < 0) {
            left -= row + 1
            if (block.from <= 0) return { pos: 0, goalX: x, assoc: 0 }
            block = blockAt(block.from - 1)
            const m = rowsOf(block)
            if (m == null) return null
            row = m - 1
        }
        row -= left
    }
    if (rendered(block)) {
        const y = screenTop(block) + row * lh + lh / 2
        const p = posAtCoordsLayout(view, { x: contentRect.left + x, y }, true)
        return { pos: p, goalX: x, assoc: assocAtY(view, p, y) }
    }
    // 目标行无 DOM:探针量出第 row 视觉行上离 x 最近的位置
    const line = doc.lineAt(block.from)
    const hit = line.length ? probeLine(view, line.text, p => p.posAt(row, x)) : { off: 0, assoc: 0 as const }
    if (!hit) return null
    return { pos: snapToCluster(view, line.from + hit.off, false), goalX: x, assoc: hit.assoc }
}
