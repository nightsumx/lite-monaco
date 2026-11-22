// CM7 minimap —— 右侧代码缩略图(对标 VS Code minimap),移植自 src/minimap.ts 的 CM6 ViewPlugin。
//
// canvas 管线(glyph atlas / ImageData blit / drawTokens / blit / drawMatches / position)照抄 CM6 版,
// 纯逻辑从 minimapcore.ts import;三处 CM7 替换:
//   view.scrollDOM → view.dom(即滚动容器);paddingRight 设在 view.contentDOM
//   view.defaultLineHeight → view.oracle.lineHeight
//   ViewPlugin(constructor/update/destroy)→ attachOverlay(mount/redraw/reposition),丢弃 guardLayout/measureOnce
//   SearchCursor/CharCategory(matchBands)→ 逐行 indexOf + charCategorizer + wordAt,按 (doc, 词) 缓存(见 wordBands)

import { afterNextPaint } from '../view/afterpaint'
import type { EditorView } from '../view/editorview'
import type { EditorState } from '../model/state'
import type { RulerPalette } from './ruler'
import { CharCategory } from '../model/charcategory'
import { cachedLines, ensureTokenCache, cachedRelTokens, rowTokens, selectTokenCache, subscribeTokens, lineTokenTypes, TT_COMMENT, type ScopedShiki, type ScopedToken, type TokenRow } from '../view/tokens'
import { minimapRows, minimapLayout, minimapSizing, hexRGB, glyphInk, glyphCell, minimapClickScrollTop, minimapLayoutWidth, wrapSegments, visualColumns, blendInk, glyphIndex, isFullWidthCharacter, GLYPH, type GlyphInk, type MinimapLayout, type MinimapRow, type WrapSegment } from './minimapcore'
import { wordAt } from '../edit/commands'
import { searchField } from '../feature/search'
import { attachOverlay } from '../feature/overlay'
import { transactionChangesFold, foldingMarkers } from '../edit/fold'
import { diagnosticsField } from '../feature/diagnostics'
import { getOption } from '../options'
import { fitSectionHeader, updateSectionHeaders, type SectionHeader } from './sectionheaders'
import { QueryType } from '../view/heightmap'

const BUF_CHUNK = 2048
// Monaco 查找命中超过这么多条就不进 minimap(FindDecorations _FIND_MATCH_NO_OVERVIEW_DECORATION)
const FIND_MATCH_MINIMAP_CAP = 1000
// Monaco minimap.findMatchHighlight 默认色(dark / light 同色)
const FIND_MATCH_COLOR = '#d18616'
// 超过此行:禁止为全文建 ImageData(50k×2px×dpr 会爆内存/主线程);只画视口窗。
const LARGE_DOC_LINES = 4000
const { GUTTER } = GLYPH
// 语言还没装进 highlighter(宿主 mount 后才 loadLanguage):隔这么久再试一次画字形
const LANG_RETRY_MS = 120

// 同词高亮(Monaco WordHighlighter + TextualDocumentHighlightProvider,没有语义源时用)→ 行内色带:
// 取主选区起点处的词(wordAt);选区要单行且落在这个词里(可以是词的一部分,或正好包住它);
// 全文找整词、区分大小写(同 Monaco findMatches(word, …, matchCase true, USUAL_WORD_SEPARATORS)),见 wordBands。
interface MatchBand { line: number; from: number; to: number }
function computeMatchBands(state: EditorState): { kind: 'word' | 'selection', bands: MatchBand[] } {
    const range = state.selection.main
    const doc = state.doc
    const cat = state.charCategorizer(0)
    const isWord = (ch: string) => cat(ch) === CharCategory.Word
    const kind: 'word' | 'selection' = range.empty ? 'word' : 'selection'
    if (doc.lineAt(range.from).number !== doc.lineAt(range.to).number) return { kind, bands: [] }
    // Monaco getWordAtPosition:位置贴着词尾(foo|) 也算这个词
    let word = wordAt(state, range.from)
    if ((!word || !isWord(state.sliceDoc(word.from, word.from + 1))) && range.from > doc.lineAt(range.from).from && isWord(state.sliceDoc(range.from - 1, range.from)))
        word = wordAt(state, range.from - 1)
    if (!word || word.from > range.from || word.to < range.to) return { kind, bands: [] }
    const query = state.sliceDoc(word.from, word.to)
    // 只对真词做同词高亮(Monaco getWordAtPosition 的词不含标点/括号)。否则光标停在 { ( . 等
    // 或行尾(wordAt 取到 {)时,全文每个同字符都染带 → minimap 密密麻麻(用户实测 bug)。
    if (!query) return { kind, bands: [] }
    for (const ch of query) if (!isWord(ch)) return { kind, bands: [] }
    return { kind, bands: wordBands(doc, query, isWord) }
}

// 一个词在全文的命中只随 (doc, 词) 变:按 doc 记最近几个词的结果,选区在同一个词的各处之间挪、
// 选中 / 取消选中整词都不再扫(旧做法每个选区事务 sliceDoc 全文 + findMatches 全文,2 万行挪光标占四成)。
// 换词才扫:逐行 indexOf(词不跨行,行首行尾的邻字算非词,同整篇搜),凑够 MATCH_BAND_CAP 条就停。
const MATCH_BAND_CAP = 101
const MATCH_WORDS_PER_DOC = 16
const wordBandCache = new WeakMap<EditorState['doc'], Map<string, MatchBand[]>>()
function wordBands(doc: EditorState['doc'], query: string, isWord: (ch: string) => boolean): MatchBand[] {
    let byWord = wordBandCache.get(doc)
    if (!byWord) wordBandCache.set(doc, byWord = new Map())
    const hit = byWord.get(query)
    if (hit) return hit
    const bands: MatchBand[] = []
    const lines = doc.toJSON()
    for (let n = 0; n < lines.length && bands.length < MATCH_BAND_CAP; n++) {
        const text = lines[n]
        let idx = 0
        while (bands.length < MATCH_BAND_CAP && (idx = text.indexOf(query, idx)) !== -1) {
            const end = idx + query.length
            if (!(idx > 0 && isWord(text[idx - 1])) && !(end < text.length && isWord(text[end])))
                bands.push({ line: n + 1, from: idx, to: end })
            idx = end
        }
    }
    if (byWord.size >= MATCH_WORDS_PER_DOC) byWord.clear()
    byWord.set(query, bands)
    return bands
}

const bandCache = new WeakMap<EditorState, { kind: 'word' | 'selection', bands: MatchBand[] }>()
export function matchBands(state: EditorState): { kind: 'word' | 'selection', bands: MatchBand[] } {
    const hit = bandCache.get(state)
    if (hit) return hit
    const next = computeMatchBands(state)
    bandCache.set(state, next)
    return next
}

// overlay 工厂:绑定 hl/opts/palette,返回 (view) => 卸载函数(供 EditorView.overlays)。
// layout.verticalScrollbarWidth:minimap 右边那一列(竖条 / 概览列)的宽,= Monaco verticalScrollbarSize;没有那一列时 0。
// layout.wordHighlights:编辑器自己的同词高亮装饰(如 TS 语义高亮 highlightField);返回数组时 minimap 只画它,
// 不再自己按文本扫(Monaco minimap 画的就是 WordHighlighter 的装饰,TS 时是语义引用,不含同名的别的符号)。
// 每次变化要换新数组(按引用比对决定重画)。不给 / 返回 null:按 Monaco 文本同词(TextualDocumentHighlightProvider)自己算。
export interface MinimapLayoutOptions {
    verticalScrollbarWidth?: number
    wordHighlights?: (state: EditorState) => readonly { from: number, to: number }[] | null
}
export function minimapCM7(hl: ScopedShiki, opts: { lang: string; theme: string }, palette: RulerPalette, layout: MinimapLayoutOptions = {}): (view: EditorView) => () => void {
    // 右边有竖条 / 概览列时,宽 = scrollbar.verticalScrollbarSize(Monaco 默认 14),没有那一列时 0
    const hasRightColumn = (layout.verticalScrollbarWidth ?? 14) > 0
    const wordSource = layout.wordHighlights
    return (view: EditorView) => {
        const vsbWidth = hasRightColumn ? getOption(view.state, 'scrollbar').verticalScrollbarSize : 0
        let wrap: HTMLElement
        let hlCanvas: HTMLCanvasElement
        let canvas: HTMLCanvasElement
        let slider: HTMLElement
        // 上一次的 Monaco MinimapLayout(滑块几何 + minimap 起始行;防抖要用上一次的)
        let mmLayout: MinimapLayout | null = null
        let mmScrollDev = 0 // minimap 内容偏移(device px)= (startLineNumber − 1) × minimapLineHeight
        let dragging = false
        let panelH = 0
        let panelW = 0 // 面板宽 CSS px(Monaco layoutInfo.minimap.minimapWidth)
        let panelDpr = 0
        let firstDraw = true
        let imgData: ImageData | null = null
        let imgW = 0
        let imgH = 0
        // 同词高亮(Monaco wordHighlighter)是否在:只在编辑器有焦点时由用户挪光标 / 获得焦点触发,
        // 失焦保留;改文档、程序设选区(非 Explicit)清掉。没聚焦过的编辑器不显示。
        let wordLive = view.hasFocus
        let light: boolean | null = null
        let wrapKey = ''
        let shadow: HTMLElement
        let shadowOn = false
        // —— minimap.* 选项(每次 redraw / position 前现读,运行时换选项立即生效)——
        let mm = getOption(view.state, 'minimap')
        let optKey = ''
        // minimapSizing 的结果:行高(device px)/ 字格倍数 / 面板宽倍率(minimap.size fill|fit 会改)
        let rowDev = 2
        let fontScale = 1
        let widthMul = 1
        let sizeKey = ''
        const mlhNow = () => rowDev

        // 面板宽 = Monaco EditorLayoutInfoComputer(编辑器外宽、gutter、字宽、dpr)。未布局(宽 0)时沿用上次 / 上限。
        const layoutWidth = (dpr: number): number => {
            const extra = { verticalScrollbarWidth: vsbWidth, maxColumn: mm.maxColumn, fontScale, widthMultiplier: widthMul }
            const outer = view.dom.clientWidth
            if (!outer) return panelW || minimapLayoutWidth({ outerWidth: 1e6, gutterWidth: 0, charWidth: 1, dpr, ...extra })
            // minimap 在左边时它自己的宽也在 scroller 左边(Monaco 的 remainingWidth 不含 minimap)
            const own = mm.side === 'left' ? panelW : 0
            const gutter = Math.max(0, view.scrollDOM.getBoundingClientRect().left - view.dom.getBoundingClientRect().left - view.dom.clientLeft - own)
            return minimapLayoutWidth({ outerWidth: outer, gutterWidth: gutter, charWidth: view.oracle.charWidth, dpr, ...extra })
        }

        // 面板尺寸变才重设 canvas(赋 width 即清空 backing store,同值也挡掉)。返回 true = 已清空需立即重画。
        // relayout:重算面板宽(读 gutter 几何)——只在几何事件 / 事务 / dpr 变时做,滚动热路径沿用上次的宽
        const applyPanelH = (ph: number, relayout = false): boolean => {
            const dpr = window.devicePixelRatio || 1
            const pw = relayout || !panelW || dpr !== panelDpr ? layoutWidth(dpr) : panelW
            // dpr 也比:matchMedia change 不是每个环境都发(无头 CDP 模拟就不发),position 时顺带自愈
            if (ph === panelH && dpr === panelDpr && pw === panelW) return false
            if ((dpr !== panelDpr && panelDpr !== 0) || pw !== panelW) { imgData = null; mmScrollDev = -1 }
            if (!mm.enabled) { panelH = ph; panelW = pw; panelDpr = dpr; return false }
            if (pw !== panelW) {
                wrap.style.width = `${pw}px`
                // 查找框等右上角浮层按 minimap 宽让位(Monaco overlayWidgets:right = 2 × 竖条宽 + minimapWidth)
                view.dom.style.setProperty('--cm-minimap-w', mm.enabled && mm.side === 'right' ? `${pw}px` : '0px')
            }
            panelH = ph
            panelW = pw
            panelDpr = dpr
            for (const cv of [hlCanvas, canvas]) {
                // Monaco minimapCanvasInnerWidth = floor(dpr × minimapWidth)、InnerHeight = floor(dpr × 编辑器高),
                // CSS 尺寸 = inner / dpr(dpr 1.25 时 647 / 1.25 = 517.6px)
                cv.width = Math.floor(pw * dpr)
                cv.height = Math.floor(ph * dpr)
                cv.style.width = `${cv.width / dpr}px`
                cv.style.height = `${cv.height / dpr}px`
            }
            return true
        }

        // Monaco tokensColorTracker.backgroundIsLight(YIQ ≥ 128)→ 亮底用 charDataLight
        const lightBg = (): boolean => {
            if (light !== null) return light
            const bg = getComputedStyle(wrap).backgroundColor || ''
            const nums = bg.slice(bg.indexOf('(') + 1, bg.lastIndexOf(')')).split(',').map(s => parseFloat(s))
            light = nums.length >= 3 && !(nums.length > 3 && nums[3] === 0) && !nums.slice(0, 3).some(isNaN)
                ? (nums[0] * 299 + nums[1] * 587 + nums[2] * 114) / 1000 >= 128
                : false
            return light
        }

        // —— 行 → minimap 视觉行(Monaco 按 view line 画)——
        // 两种模式都从 heightMap 走:行起点 = 所在块行顶 / 行高(与正文滚动几何同源)。折叠藏起来的行
        // 落在从更早行开始的块里 → 不占 minimap 行;折行时行内按 wrapSegments 拆段,段数不超过 heightMap 给的视觉行数。
        // 用未经 scaler 的 heightMap 坐标:超大文档 DOM 坐标被压缩,除以行高就不是行号了。
        // view zone(查找框、peek)不占 minimap 行(Monaco minimap 按 view line 画):行顶先减掉它上方的 zone 高
        const lh = () => view.oracle.lineHeight || 20
        const WHOLE: WrapSegment[] = [{ from: 0, to: Infinity, indent: 0 }]
        const blockAt = (pos: number) => view.heightMap.lineAt(pos, QueryType.ByPos, view.oracle, 0, 0)
        const rowTopOf = (pos: number): number => blockAt(pos).top - view.zoneHeightAbove(pos)
        const totalRows = (): number => {
            const doc = view.state.doc
            if (!doc.lines) return 0
            return Math.max(1, Math.round((blockAt(doc.length).bottom - view.zoneHeightAbove(doc.line(doc.lines).from)) / lh()))
        }
        // 块首行:折叠块里的行归到块的第一行(windowed / 脏区重画从块首画,别漏掉折叠行本身)
        const blockStartLine = (n: number): number => {
            const doc = view.state.doc
            const b = blockAt(doc.line(n).from)
            return b.from < doc.line(n).from ? doc.lineAt(b.from).number : n
        }
        // vis:tab / 全角展开后的视觉列(Monaco minimap 的 dx 推进);都没有为 null
        const lineLayout = (n: number): { row: number, segs: WrapSegment[], vis: Int32Array | null } => {
            const line = view.state.doc.line(n)
            const tabSize = view.state.tabSize
            const vis = visualColumns(line.text, tabSize)
            const b = blockAt(line.from)
            const row = Math.round((b.top - view.zoneHeightAbove(line.from)) / lh())
            // 折叠藏起来的行:块从更早的行开始 → 不占 minimap 行(同 Monaco view line)
            if (b.from < line.from) return { row, segs: [], vis }
            if (!view.lineWrapping) return { row, segs: WHOLE, vis }
            const rows = Math.max(1, Math.round(b.height / lh()))
            const segs = wrapSegments(line.text, view.oracle.lineLength, tabSize)
            return { row, segs: segs.length > rows ? segs.slice(0, rows) : segs, vis }
        }
        // minimap 行 r 落在哪个 doc 行(二分 heightMap 行顶,归到块首行)
        const lineAtRow = (r: number): number => {
            const doc = view.state.doc
            const y = r * lh()
            let lo = 1, hi = doc.lines
            while (lo < hi) {
                const mid = (lo + hi + 1) >> 1
                if (rowTopOf(doc.line(mid).from) <= y + 0.5) lo = mid
                else hi = mid - 1
            }
            return blockStartLine(lo)
        }
        // minimap 行 r(0 起)在 scrollDOM 坐标里的行顶:所在行的块顶(DOM 坐标)+ 折行段偏移
        const rowTop = (r: number): { top: number, height: number } => {
            const n = lineAtRow(r)
            const b = view.lineBlockAt(view.state.doc.line(n).from)
            return { top: b.top + Math.max(0, r - lineLayout(n).row) * lh(), height: lh() }
        }
        // 一行的字形画进 RGBA 缓冲(Monaco InnerMinimap._renderLine):x 从 MINIMAP_GUTTER canvas px 起,
        // 每字 cw;超过 canvas 宽 − cw 就停。yOff = 缓冲顶对应的 device y。
        const paintLine = (buf: Uint8ClampedArray, bw: number, bh: number, blocks: MinimapRow['blocks'], row: number, segs: WrapSegment[], vis: Int32Array | null, yOff: number, ink: GlyphInk, rowHdev: number) => {
            const cw = ink.cw, cellH = ink.ch, inkArr = ink.ink
            const maxDx = bw - cw
            // Monaco innerLinePadding:行比字格高(minimap.size fill)时字格在行里垂直居中
            const baseH = (mm.renderCharacters ? 2 : 3) * fontScale
            const pad = rowHdev > baseH ? Math.floor((rowHdev - baseH) / 2) : 0
            const blocks_ = !mm.renderCharacters
            for (let si = 0; si < segs.length; si++) {
                const seg = segs[si]
                const yTop = Math.round((row + si) * rowHdev) - yOff + pad
                if (yTop + cellH <= 0 || yTop >= bh) continue
                const x0 = GUTTER + (seg.indent - (vis && seg.from < vis.length ? vis[seg.from] : seg.from)) * cw
                for (const b of blocks) {
                    if (b.x >= seg.to) break
                    if (b.x + b.text.length <= seg.from) continue
                    const [r, g, bl] = hexRGB(b.color)
                    const j0 = Math.max(0, seg.from - b.x)
                    const j1 = Math.min(b.text.length, seg.to - b.x)
                    for (let j = j0; j < j1; j++) {
                        let dx = x0 + (vis ? vis[b.x + j] : b.x + j) * cw
                        if (dx > maxDx) break
                        const code = b.text.charCodeAt(j)
                        if (code === 32 || code === 9) continue
                        // Monaco:表外字符借 ASCII 字形(glyphIndex);全角字符同一字形画两格
                        // 色块模式每个非空字符都是一整块,没有「表外不画」
                        const cell = blocks_ ? 0 : glyphIndex(code, cw)
                        const count = isFullWidthCharacter(code) ? 2 : 1
                        for (let k = 0; k < count; k++, dx += cw) {
                            if (dx > maxDx) break
                            if (cell < 0) continue
                            const cellBase = cell * cellH * cw
                            for (let py = 0; py < cellH; py++) {
                                const ry = yTop + py
                                if (ry < 0 || ry >= bh) continue
                                const rowOff = ry * bw
                                const inkRow = cellBase + py * cw
                                for (let px = 0; px < cw; px++) {
                                    const a = inkArr[inkRow + px]
                                    if (a === 0) continue
                                    blendInk(buf, (rowOff + dx + px) * 4, r, g, bl, a)
                                }
                            }
                        }
                    }
                }
            }
        }

        // blit:从内容缓冲取 [mmScrollDev, +chh) 一窗推屏(minimap 自身滚动 = 换窗,不重 tokenize)。
        const blit = () => {
            const ctx = canvas.getContext('2d')
            if (!ctx || !imgData) return
            const cw = canvas.width, chh = canvas.height
            if (cw === 0 || chh === 0) return
            const off = Math.min(mmScrollDev, Math.max(0, imgH - chh))
            ctx.putImageData(imgData, 0, -off, 0, off, cw, chh)
        }

        // 大文档 / 折行:只画 minimap 视窗(同 Monaco 只渲染 minimap 可见行)。折行时改一行会推移下面所有视觉行,
        // 全文缓冲没法局部重画,每次全量 3900 行要 ~33ms;视窗只有几百行。
        const windowed = () => view.state.doc.lines > LARGE_DOC_LINES || view.lineWrapping
        // token 图层。rel token 行内 offset(lineStart=0);脏区只重画附近行,禁止每键扫文末/toJSON。
        const DIRTY_PAD = 8
        // 大文档:只画当前 minimap 视窗对应的行到屏上 canvas,不建全文 ImageData。
        // 只是滚了(scrolledFrom = 上一帧的 mmScrollDev,画布还是那一帧):同 Monaco _renderUntouchedLines,
        // 还在窗里的行整块平移过来,只画新露出的那一条
        let drawnScroll = -1
        // 视窗模式上一次画的行 [first, last)(后台分词推到窗外就不重画)
        let drawnWindow: [number, number] = [0, 0]
        // 默认前景色(Monaco 没分词的行 / 超长行按 nullTokenize 的默认色画),每次画字形层重取一次(主题会换)
        let fg: string | null = null
        const defaultFg = (): string => {
            if (fg !== null) return fg
            const c = getComputedStyle(view.contentDOM).color || ''
            const nums = c.slice(c.indexOf('(') + 1, c.lastIndexOf(')')).split(',').map(x => parseInt(x, 10))
            fg = nums.length >= 3 && !nums.slice(0, 3).some(isNaN)
                ? '#' + nums.slice(0, 3).map(v => v.toString(16).padStart(2, '0')).join('')
                : lightBg() ? '#000000' : '#d4d4d4'
            return fg
        }
        const withDefaultColor = (rel: TokenRow[], lines: string[], from: number, to: number): ScopedToken[][] => {
            const out = rel.slice(from, to).map((r, i) => rowTokens(r, lines[from + i]))
            for (let i = 0; i < out.length; i++) {
                const row = out[i]
                if (!row.length) {
                    if (lines[from + i]) out[i] = [{ content: lines[from + i], offset: 0, color: defaultFg() }]
                } else if (row.some(t => !t.color)) {
                    out[i] = row.map(t => t.color ? t : { content: t.content, offset: t.offset, color: defaultFg() })
                }
            }
            return out
        }
        const drawTokensWindowed = (scrolledFrom = -1) => {
            if (!mm.enabled) return
            selectTokenCache(view)
            const ctx = canvas.getContext('2d')
            if (!ctx) return
            const dpr = window.devicePixelRatio || 1
            const ink = glyphInk(dpr, lightBg(), fontScale, mm.renderCharacters)
            if (!ink) return
            const doc = view.state.doc
            const nRows = doc.lines
            const cw = canvas.width, chh = canvas.height
            if (cw === 0 || chh === 0) return
            const delta = mmScrollDev - scrolledFrom
            let y0 = 0, y1 = chh
            if (scrolledFrom >= 0 && scrolledFrom === drawnScroll && Math.abs(delta) < chh) {
                ctx.globalCompositeOperation = 'copy'
                ctx.drawImage(canvas, 0, -delta)
                ctx.globalCompositeOperation = 'source-over'
                if (delta > 0) y0 = chh - delta
                else y1 = -delta
            } else ctx.clearRect(0, 0, cw, chh)
            drawnScroll = -1
            imgData = null
            imgW = 0
            imgH = 0
            const rowHdev = mlhNow()
            const firstRow = Math.max(0, Math.floor((mmScrollDev + y0) / rowHdev) - 2)
            const lastRow = Math.ceil((mmScrollDev + y1) / rowHdev) + 2
            const first = lineAtRow(firstRow) - 1
            let last = first
            const lastY = lastRow * lh() + 0.5
            while (last < nRows && rowTopOf(doc.line(last + 1).from) <= lastY) last++
            if (last <= first) return
            // 行表:优先缓存(编辑器 shiki 已装);否则一次 toJSON 建骨架(不 tokenize 全文)
            const lines = cachedLines()?.length === nRows ? cachedLines()! : doc.toJSON()
            if (!ensureTokenCache(hl, lines, opts)) { retryWhenLangLoads(); return }
            // 不为 minimap 同步分词(Monaco 同):还没分到的行先按默认前景色画,后台分词推到了再重画
            const pack = cachedRelTokens()
            if (!pack) return
            drawnWindow = [first, last]
            fg = null
            const slice = withDefaultColor(pack.rel, pack.lines, first, last)
            const rows = minimapRows(slice, { lines: slice.length, line: () => ({ from: 0 }) })
            // 直接画到 canvas 的 [y0, y1) 条(y 相对 mmScrollDev)
            const img = ctx.createImageData(cw, y1 - y0)
            for (let ri = 0; ri < rows.length; ri++) {
                const { row, segs, vis } = lineLayout(first + ri + 1)
                paintLine(img.data, cw, y1 - y0, rows[ri].blocks, row, segs, vis, mmScrollDev + y0, ink, rowHdev)
            }
            ctx.putImageData(img, 0, y0)
            drawnScroll = mmScrollDev
        }

        const drawTokens = (dirtyFromLine?: number, lineCountChanged = false) => {
            if (!mm.enabled) return
            selectTokenCache(view)
            const doc = view.state.doc
            if (windowed()) {
                drawTokensWindowed()
                return
            }
            drawnScroll = -1
            const ctx = canvas.getContext('2d')
            if (!ctx) return
            const dpr = window.devicePixelRatio || 1
            const ink = glyphInk(dpr, lightBg(), fontScale, mm.renderCharacters)
            if (!ink) return
            const rowHdev = mlhNow()
            const lines = cachedLines() ?? doc.toJSON()
            if (!ensureTokenCache(hl, lines, opts)) { retryWhenLangLoads(); return }
            const pack = cachedRelTokens()
            if (!pack) return
            const nLines = pack.rel.length
            const cw = canvas.width, chh = canvas.height
            if (cw === 0 || chh === 0) return
            const contentDev = Math.ceil(totalRows() * rowHdev)
            const bufH = Math.max(chh, Math.ceil(contentDev / BUF_CHUNK) * BUF_CHUNK)
            if (!imgData || imgW !== cw || imgH !== bufH) {
                imgData = ctx.createImageData(cw, bufH)
                imgW = cw
                imgH = bufH
            }
            const buf = imgData.data
            const overlap = rowHdev > 0 ? Math.ceil(ink.ch / rowHdev) : 0
            // 脏区按块对齐:从块首行起画(折叠行本身别漏),到块尾行止(清掉的行区间正好由这些行重画)
            const from = rowHdev > 0 && dirtyFromLine && dirtyFromLine > 1 && dirtyFromLine <= nLines
                ? blockStartLine(Math.max(1, dirtyFromLine - overlap)) - 1
                : 0
            let to = nLines
            if (!lineCountChanged && dirtyFromLine && dirtyFromLine > 1) {
                to = Math.min(nLines, dirtyFromLine + DIRTY_PAD)
                if (to < nLines) to = doc.lineAt(blockAt(doc.line(to).from).to).number
            }
            // 只物化 [from,to) 的 minimap 行(禁止每键 minimapRows 扫全文)
            fg = null
            const slice = withDefaultColor(pack.rel, pack.lines, from, to)
            const lineIndex = { lines: slice.length, line: () => ({ from: 0 }) }
            const rows = minimapRows(slice, lineIndex)
            const y0 = from === 0 ? 0 : Math.round(lineLayout(from + 1).row * rowHdev)
            const y1 = to === nLines ? bufH : Math.round(lineLayout(to + 1).row * rowHdev)
            buf.fill(0, y0 * cw * 4, Math.min(buf.length, y1 * cw * 4))
            for (let ri = 0; ri < rows.length; ri++) {
                const { row, segs, vis } = lineLayout(from + ri + 1)
                paintLine(buf, cw, bufH, rows[ri].blocks, row, segs, vis, 0, ink, rowHdev)
            }
            blit()
        }

        // 高亮层 = Monaco InnerMinimap.renderDecorations,四步照抄(device px,y = (view 行 − 起始行) × minimapLineHeight):
        //   1. 选区行底:每个选区 [首行, 末行) 从 x = 8 画 minimap.selectionHighlight 50%,相邻的合并。
        //      空选区和单行选区首尾同行 → 不画(光标行没有整行块);但这些行都算「已有行底」。
        //   2. 装饰行底:同词 / 查找命中(MinimapPosition.Inline)所在行还没有行底的,画各自颜色 50%(zIndex 高的先占)。
        //   3. 选区本身:每个 view 行从起列到止列画不透明 minimap.selectionHighlight(中间行到行尾)。
        //   4. 装饰本身:命中的那几列画不透明色(zIndex 低的先画:同词 0 < 查找 10 < 当前查找 13)。
        // 列 → x 是 Monaco getXOffsetForPosition:从 8 起逐字累加,Tab = tabSize 格(不对齐 tab stop)、全角 2 格,封顶画布宽。
        interface ViewPos { row: number, n: number, seg: number, col: number }
        const viewPos = (pos: number): ViewPos => {
            const line = view.state.doc.lineAt(pos)
            const { row, segs } = lineLayout(line.number)
            const col = pos - line.from
            let seg = 0
            while (seg < segs.length - 1 && col >= segs[seg].to) seg++
            return { row: row + seg, n: line.number, seg, col }
        }
        // 第 n 行第 seg 段里列 col(字符下标;-1 = 段尾)的 x;view 行内容 = 续行缩进空格 + 段内文字
        const xAt = (n: number, seg: number, col: number, cw: number, W: number): number => {
            const text = view.state.doc.line(n).text
            const s = lineLayout(n).segs[seg] ?? WHOLE[0]
            const to = Math.min(text.length, s.to)
            const end = col < 0 ? to : Math.max(s.from, Math.min(col, to))
            if (end === s.from && !s.indent) return GUTTER
            const tab = view.state.tabSize
            let x = GUTTER + s.indent * cw
            for (let i = s.from; i < end && x < W; i++) {
                const c = text.charCodeAt(i)
                x += c === 9 ? tab * cw : isFullWidthCharacter(c) ? 2 * cw : cw
            }
            return Math.min(x, W)
        }
        interface Deco { from: number, to: number, color: string, z: number }
        const decorations = (): Deco[] => {
            const out: Deco[] = []
            const src = wordSource?.(view.state)
            if (src) {
                // 编辑器自己的同词高亮(TS 语义):画的就是那份装饰,何时出现 / 清掉由它定(Monaco minimap 画 WordHighlighter 的装饰)
                const len = view.state.doc.length
                for (const m of src) if (m.from < m.to && m.to <= len) out.push({ from: m.from, to: m.to, color: palette.wordHighlight, z: 0 })
            } else if (wordLive) {
                const doc = view.state.doc
                for (const b of matchBands(view.state).bands) {
                    const from = doc.line(b.line).from
                    out.push({ from: from + b.from, to: from + b.to, color: palette.wordHighlight, z: 0 })
                }
            }
            const sf = view.state.field(searchField, false)
            if (sf && sf.open && sf.matches.length && sf.matches.length <= FIND_MATCH_MINIMAP_CAP) {
                const color = palette.minimapFindMatch || FIND_MATCH_COLOR
                const cur = sf.highlighted ? sf.currentMatch : -1
                sf.matches.forEach((m, i) => { if (m.to > m.from) out.push({ from: m.from, to: m.to, color, z: i === cur ? 13 : 10 }) })
            }
            // 诊断(Monaco 标记装饰的 minimap:{ color: minimapError | minimapWarning | minimapInfo, position: Inline },
            // zIndex 30 / 20 / 10);minimap.errorHighlight 默认 #ff1212 70%,警告 / 提示用 editorWarning / editorInfo 前景
            const len = view.state.doc.length
            for (const d of view.state.field(diagnosticsField, false) ?? []) {
                const from = Math.min(d.from, len), to = Math.min(d.to, len)
                if (to <= from) continue
                out.push(d.severity === 'error' ? { from, to, color: 'rgba(255, 18, 18, 0.7)', z: 30 }
                    : d.severity === 'warning' ? { from, to, color: palette.warning, z: 20 }
                        : { from, to, color: palette.info, z: 10 })
            }
            // 稳定排序:zIndex 升序(Monaco decorations.sort by zIndex)
            return out.map((d, i) => ({ d, i })).sort((a, b) => a.d.z - b.d.z || a.i - b.i).map(x => x.d)
        }
        const drawMatches = () => {
            if (!mm.enabled) return
            const ctx = hlCanvas.getContext('2d')
            if (!ctx) return
            const dpr = window.devicePixelRatio || 1
            const W = hlCanvas.width, H = hlCanvas.height
            if (W === 0 || H === 0) return
            ctx.clearRect(0, 0, W, H)
            const mlh = mlhNow()
            const cw = glyphCell(dpr, fontScale).cw
            const nRows = totalRows()
            if (!nRows) return
            // minimap 可见的 view 行(0 起):Monaco layout.startLineNumber..endLineNumber
            const first = Math.max(0, Math.round(mmScrollDev / mlh))
            const last = Math.min(nRows - 1, first + Math.floor(H / mlh) - 1)
            const yOf = (row: number) => (row - first) * mlh
            const clip = (a: ViewPos, b: ViewPos): [number, number] | null => {
                const r1 = Math.max(first, a.row), r2 = Math.min(last, b.row)
                return r1 > r2 ? null : [r1, r2]
            }
            const sels = view.state.selection.ranges.map(r => ({ a: viewPos(r.from), b: viewPos(r.to) }))
                .sort((p, q) => p.a.row - q.a.row || p.a.col - q.a.col)
            // 折叠藏起来的行上的装饰不画(Monaco 把隐藏区的装饰压成零宽)
            const doc = view.state.doc
            // 先按块的行范围粗筛:不在 minimap 可见行里的装饰后面 clip 一定丢掉,别为它们逐个算 lineLayout / viewPos(1 万条标记时是大头)
            const offscreen = (d: Deco): boolean => {
                const bf = blockAt(d.from)
                if ((bf.top - view.zoneHeightAbove(d.from)) / lh() - 0.5 > last) return true
                const bt = blockAt(d.to)
                return (bt.bottom - view.zoneHeightAbove(d.to)) / lh() - 0.5 < first
            }
            const decos = decorations().filter(d => !offscreen(d) && lineLayout(doc.lineAt(d.from).number).segs.length)
                .map(d => ({ a: viewPos(d.from), b: viewPos(d.to), color: d.color }))
            const lit = new Set<number>()
            // 1. 选区行底
            ctx.fillStyle = palette.minimapSelection
            ctx.globalAlpha = 0.5
            let y1 = 0, y2 = 0
            for (const s of sels) {
                const span = clip(s.a, s.b)
                if (!span) continue
                for (let r = span[0]; r <= span[1]; r++) lit.add(r)
                const yy1 = yOf(span[0]), yy2 = yOf(span[1])
                if (y2 >= yy1) y2 = yy2
                else {
                    if (y2 > y1) ctx.fillRect(GUTTER, y1, W, y2 - y1)
                    y1 = yy1
                    y2 = yy2
                }
            }
            if (y2 > y1) ctx.fillRect(GUTTER, y1, W, y2 - y1)
            // 2. 装饰行底(倒序:zIndex 高的先占行)。Monaco 每行都画在装饰首行的 y 上,照抄
            for (let i = decos.length - 1; i >= 0; i--) {
                const d = decos[i]
                const span = clip(d.a, d.b)
                if (!span) continue
                ctx.fillStyle = d.color
                for (let r = span[0]; r <= span[1]; r++) {
                    if (lit.has(r)) continue
                    lit.add(r)
                    ctx.fillRect(GUTTER, yOf(span[0]), W, mlh)
                }
            }
            ctx.globalAlpha = 1
            // 3 / 4. 选区、装饰本身:每个 view 行一段 [x1, x2)。中间行顺着行顶往下走(不逐行二分)
            const onRows = (a: ViewPos, b: ViewPos, color: string) => {
                const span = clip(a, b)
                if (!span) return
                ctx.fillStyle = color
                let walk = 0
                for (let r = span[0]; r <= span[1]; r++) {
                    if (r !== a.row && r !== b.row) {
                        if (!walk) walk = lineAtRow(r)
                        const y = r * lh() + 0.5
                        while (walk < doc.lines && rowTopOf(doc.line(walk + 1).from) <= y) walk++
                        walk = blockStartLine(walk)
                    }
                    const { n, seg } = r === a.row ? a : r === b.row ? b : { n: walk, seg: Math.max(0, r - lineLayout(walk).row) }
                    const x1 = r === a.row ? xAt(n, seg, a.col, cw, W) : GUTTER
                    const x2 = r === b.row ? xAt(b.n, b.seg, b.col, cw, W) : xAt(n, seg, -1, cw, W)
                    if (x2 > x1) ctx.fillRect(x1, yOf(r), x2 - x1, mlh)
                }
            }
            for (const s of sels) onRows(s.a, s.b, palette.minimapSelection)
            for (const d of decos) onRows(d.a, d.b, d.color)
            drawSectionHeaders(ctx, first, last, dpr)
        }

        // —— 区段标题(minimap.showRegionSectionHeaders / showMarkSectionHeaders)——
        // 照 Monaco _renderSectionHeaders:标题行盖一块 70% 的底色,上面用 sectionHeaderFontSize 的字写标题(letterSpacing
        // sectionHeaderLetterSpacing),有分隔线的画一条 0.2 宽的线。字号 × dpr,字距不乘。
        let headerCache: { doc: unknown, key: string, headers: SectionHeader[], lines: string[], markers: unknown } | null = null
        let headerTimer = 0
        const computeHeaders = (key: string, markers: unknown): SectionHeader[] => {
            const lines = view.state.doc.toJSON()
            // 选项没变就只重扫变了的那一段(打字时整篇重扫 10 万行 ~6ms)
            const headers = updateSectionHeaders(headerCache?.key === key && headerCache.markers === markers ? headerCache : null, lines, { region: mm.showRegionSectionHeaders, mark: mm.showMarkSectionHeaders, markers: markers as never, markRegex: mm.markSectionHeaderRegex })
            headerCache = { doc: view.state.doc, key, headers, lines, markers }
            return headers
        }
        const sectionHeaders = (): SectionHeader[] => {
            if (!mm.showRegionSectionHeaders && !mm.showMarkSectionHeaders) return []
            const markers = view.state.facet(foldingMarkers)
            const key = `${mm.showRegionSectionHeaders}|${mm.showMarkSectionHeaders}|${mm.markSectionHeaderRegex}|${markers ? markers.start.length : -1}`
            if (headerCache && headerCache.doc === view.state.doc && headerCache.key === key) return headerCache.headers
            // 大文档首次(或换了一篇差得很远的文档)要整篇扫一遍,同步做会卡在 setModel / 首帧里。Monaco 的区段标题本来就是后台算完再补画:
            // 这里让出这一帧,下个任务算完重画;小文档和打字(只重扫变了的那段)照旧同步
            const n = view.state.doc.lines
            const prev = headerCache?.key === key && headerCache.markers === markers ? headerCache : null
            const win = view.dom.ownerDocument.defaultView
            if (win && n >= 20000 && (!prev || prev.lines.length * 2 < n || n * 2 < prev.lines.length)) {
                if (!headerTimer) headerTimer = win.setTimeout(() => {
                    headerTimer = 0
                    if (destroyed) return
                    computeHeaders(key, markers)
                    scheduleRedraw()
                }, 0)
                return []
            }
            return computeHeaders(key, markers)
        }
        // MARK 标题必须落在注释 token 里(Monaco 查 StandardTokenType.Comment);还没分词就按注释字符粗判
        const inComment = (h: SectionHeader): boolean => {
            const rel = cachedRelTokens()?.rel[h.line - 1]
            const types = rel ? lineTokenTypes(rel) : undefined
            if (!types) return /(\/\/|\/\*|#|--|;|%|<!--|\*)/.test(view.state.doc.line(h.line).text.slice(0, h.startColumn - 1))
            const col = h.startColumn - 1
            for (let i = 0; i < types.length; i += 3) if (col >= types[i] && col < types[i + 1]) return types[i + 2] === TT_COMMENT
            return false
        }
        const SECTION_FONT = "-apple-system, BlinkMacSystemFont, 'Segoe WPC', 'Segoe UI', system-ui, 'Ubuntu', 'Droid Sans', sans-serif"
        const drawSectionHeaders = (ctx: CanvasRenderingContext2D, first: number, last: number, dpr: number) => {
            const headers = sectionHeaders()
            if (!headers.length) return
            const mlh = mlhNow()
            const fontSize = mm.sectionHeaderFontSize * dpr
            const W = hlCanvas.width
            const bg = getComputedStyle(wrap).backgroundColor
            const nums = bg.slice(bg.indexOf('(') + 1, bg.lastIndexOf(')')).split(/[,/ ]+/).map(x => parseFloat(x)).filter(x => !isNaN(x))
            const fill = nums.length >= 3 ? `rgb(${nums[0]} ${nums[1]} ${nums[2]} / .7)` : 'rgba(0,0,0,.7)'
            const fg = defaultFg()
            const [r, g, b] = fg.startsWith('#') && fg.length >= 7 ? hexRGB(fg) : [212, 212, 212]
            const foreground = `rgb(${r} ${g} ${b} / .8)`
            ctx.save()
            ;(ctx as unknown as { letterSpacing: string }).letterSpacing = `${mm.sectionHeaderLetterSpacing}px`
            ctx.font = `500 ${fontSize}px ${SECTION_FONT}`
            ctx.strokeStyle = foreground
            ctx.lineWidth = 0.2
            const fit = (t: string) => fitSectionHeader(x => ctx.measureText(x).width, W - GUTTER, t)
            // 标题字高占好几个 minimap 行:视窗上方再多看 fontSize / 行高 行
            const lo = Math.max(0, first - Math.ceil(fontSize / mlh))
            for (const h of headers) {
                if (h.shouldBeInComments && !inComment(h)) continue
                const ll = lineLayout(h.line)
                if (!ll.segs.length) continue // 折叠藏起来的行
                if (ll.row < lo || ll.row > last) continue
                const y = (ll.row - first) * mlh + fontSize
                const top = y - fontSize
                const text = fit(h.text)
                if (text) {
                    ctx.fillStyle = fill
                    ctx.fillRect(0, top, W, fontSize * 1.5)
                    ctx.fillStyle = foreground
                    ctx.fillText(text, GUTTER, y)
                }
                if (h.hasSeparatorLine) {
                    ctx.beginPath()
                    ctx.moveTo(0, top + 2)
                    ctx.lineTo(W, top + 2)
                    ctx.closePath()
                    ctx.stroke()
                }
            }
            ctx.restore()
        }

        // 语言晚到(宿主先 mount 再 loadLanguage):ensureTokenCache 返 false 时没有任何事务会再触发重画,
        // 这里轮询到语言装好为止(销毁即停)
        let retryTimer = 0
        let destroyed = false
        // autohide:'scroll' —— 滚动(scrollTop / scrollHeight 变)就亮起,500ms 后若鼠标不在上面就淡出(Monaco _hideSoon / _hideImmediatelyIfMouseIsOutside)
        let hideTimer = 0
        let mouseOver = false
        let lastScrollTop = -1
        let lastScrollHeight = -1
        const hideSoon = () => {
            if (hideTimer) window.clearTimeout(hideTimer)
            hideTimer = window.setTimeout(() => {
                hideTimer = 0
                if (destroyed) return
                if (mouseOver) { hideSoon(); return }
                wrap.classList.remove('cm-minimap-active')
            }, 500)
        }
        const onMouseOver = () => { mouseOver = true }
        const onMouseLeave = () => { mouseOver = false }
        const retryWhenLangLoads = () => {
            if (retryTimer || destroyed) return
            retryTimer = window.setTimeout(() => {
                retryTimer = 0
                if (destroyed) return
                drawTokens()
                drawMatches()
            }, LANG_RETRY_MS)
        }

        // 字形层 debounce 重画(打字热路径 / 折行后行高被实测改写),避免与输入、滚动抢主线程
        let redrawTimer = 0
        const scheduleRedraw = (dirtyFrom?: number, lineCountChanged = false) => {
            const win = view.dom.ownerDocument.defaultView
            if (!win) { drawTokens(dirtyFrom, lineCountChanged); drawMatches(); return }
            if (redrawTimer) win.clearTimeout(redrawTimer)
            redrawTimer = win.setTimeout(() => {
                redrawTimer = 0
                if (destroyed) return
                drawTokens(dirtyFrom, lineCountChanged)
                drawMatches()
            }, 32)
        }

        // 读 minimap 选项,套到 DOM(显示 / 左右 / 滑块 / 自动隐藏),算行高与字格倍数(minimap.size)。
        // 影响布局的变了(返回 true)就作废缓冲、让面板宽 / 画布重算,调用方接着重画。
        const syncOptions = (): boolean => {
            mm = getOption(view.state, 'minimap')
            wrap.style.display = mm.enabled ? '' : 'none'
            wrap.style.order = mm.side === 'left' ? '-1' : ''
            wrap.classList.toggle('cm-minimap-left', mm.side === 'left')
            wrap.classList.toggle('cm-minimap-slider-always', mm.showSlider === 'always')
            // Monaco minimap.autohide:'mouseover' 平时透明、悬停才显;'scroll' 平时透明且不吃指针,只在滚动后短暂显示
            wrap.classList.toggle('cm-minimap-autohide-mouseover', mm.autohide === 'mouseover')
            wrap.classList.toggle('cm-minimap-autohide-scroll', mm.autohide === 'scroll')
            if (mm.autohide !== 'scroll') { wrap.classList.remove('cm-minimap-active'); if (hideTimer) { window.clearTimeout(hideTimer); hideTimer = 0 } }
            const shw = mm.enabled && mm.side === 'right'
            shadow.style.display = shw ? '' : 'none'
            const dpr = window.devicePixelRatio || 1
            const fillish = mm.size !== 'proportional'
            const outerH = fillish ? (wrap.clientHeight || view.scrollDOM.clientHeight) : 0
            const sKey = `${dpr}|${mm.size}|${mm.scale}|${mm.renderCharacters}|${fillish ? `${totalRows()}|${outerH}|${lh()}|${view.scrollBeyondLastLine}` : ''}`
            if (sKey !== sizeKey) {
                sizeKey = sKey
                const sz = minimapSizing({ size: mm.size, scale: mm.scale, renderCharacters: mm.renderCharacters, dpr, viewLineCount: fillish ? totalRows() : 0, outerHeight: outerH, lineHeight: lh(), scrollBeyondLastLine: view.scrollBeyondLastLine })
                rowDev = sz.lineHeight
                fontScale = sz.scale
                widthMul = sz.widthMultiplier
            }
            const key = `${mm.enabled}|${mm.side}|${mm.renderCharacters}|${mm.maxColumn}|${rowDev}|${fontScale}|${widthMul}|${vsbWidth}|${mm.showRegionSectionHeaders}|${mm.showMarkSectionHeaders}|${mm.markSectionHeaderRegex}|${mm.sectionHeaderFontSize}|${mm.sectionHeaderLetterSpacing}`
            if (key === optKey) return false
            optKey = key
            // 面板宽 / 画布 / 字形缓冲全部重来
            panelW = 0
            panelH = 0
            imgData = null
            mmScrollDev = -1
            drawnScroll = -1
            mmLayout = null
            if (!mm.enabled) view.dom.style.setProperty('--cm-minimap-w', '0px')
            return true
        }

        // 视口框 + minimap 自身滚动。读 scrollDOM 的 scrollTop/clientHeight/scrollHeight,纯改 slider top/height + 必要时 blit。
        // wrap 是 view.dom 的 flex 兄弟,不在滚动坐标系,天然固定——无需任何 wrap 几何 pin。
        let firstPaintPending = false
        const position = () => {
            const dpr = window.devicePixelRatio || 1
            const optsChanged = syncOptions()
            if (!mm.enabled) return
            // Monaco 没有超大文档压缩:按 heightMap 坐标算(scrollTop 先还原),写回 DOM 时再 toDOM
            const sTop = view.scaler.fromDOM(view.scrollDOM.scrollTop)
            const clientHeight = view.scrollDOM.clientHeight
            const docH = view.metrics.height
            if (mm.autohide === 'scroll' && (sTop !== lastScrollTop || docH !== lastScrollHeight) && lastScrollTop >= 0) {
                wrap.classList.add('cm-minimap-active')
                hideSoon()
            }
            lastScrollTop = sTop
            lastScrollHeight = docH
            const ph = wrap.clientHeight || clientHeight
            // 自愈:resize 走原生 scroll → 只经 reposition,不经 redraw;panelH/canvas 会陈旧。
            // 先读齐(sTop/clientHeight/docH/ph)再 applyPanelH(只写),避免 write-then-read 回流。变了先重画字形。
            if (applyPanelH(ph) && !firstPaintPending) drawTokens()
            if (optsChanged && !firstPaintPending) drawMatches()
            const nRows = totalRows()
            // 视觉行数变了(折叠 / 展开;折行时还有每视觉行宽或实测折行数)→ 视觉行整体移位,重画
            const key = `${view.lineWrapping ? view.oracle.lineLength : 0}|${nRows}`
            if (key !== wrapKey) {
                if (wrapKey) scheduleRedraw()
                wrapKey = key
            }
            const mlh = mlhNow()
            const lineH = lh()
            // 视口第一个(部分可见的)view 行和它的行顶(含上方 zone,与 scrollTop 同坐标):
            // scrollTop 落在 zone 里时是 zone 下面那一行(Monaco viewportStartLineNumber)
            const doc = view.state.doc
            const topLine = doc.lineAt(Math.min(doc.length, view.heightMap.lineAt(sTop, QueryType.ByHeight, view.oracle, 0, 0).from))
            const tb = blockAt(topLine.from)
            const topRow = lineLayout(topLine.number).row
            const inRow = sTop > tb.top ? Math.min(Math.max(0, Math.round(tb.height / lineH) - 1), Math.floor((sTop - tb.top) / lineH + 1e-6)) : 0
            const startRow = Math.max(0, Math.min(Math.max(0, nRows - 1), topRow + inRow))
            mmLayout = minimapLayout({
                dpr, minimapLineHeight: mlh, canvasInnerHeight: canvas.height, minimapHeight: panelH, lineHeight: lineH,
                viewportHeight: clientHeight, scrollTop: sTop, scrollHeight: docH, lineCount: nRows,
                scrollBeyondLastLine: view.scrollBeyondLastLine,
                viewportStartLineNumber: startRow + 1, viewportStartLineNumberVerticalOffset: tb.top + inRow * lineH,
            }, mmLayout)
            const offDev = (mmLayout.startLineNumber - 1) * mlh
            if (offDev !== mmScrollDev) {
                const prev = mmScrollDev
                mmScrollDev = offDev
                // 首帧还没画字形(redraw 里排了 paintAfterFirstFrame):字形和命中层都等那一次一起画
                if (!firstPaintPending) {
                    if (windowed()) drawTokensWindowed(prev)
                    else blit()
                    drawMatches()
                }
            }
            // Monaco:不需要滑块(整篇不滚或 minimap 放得下且滑块没地方动)时 display none
            // Monaco minimap-shadow:正文右边还有没露出来的内容(scrollLeft + 视口宽 < scrollWidth)时 minimap 左缘外画阴影
            const sh = !view.lineWrapping && view.scrollDOM.scrollLeft + view.scrollDOM.clientWidth < view.lineWidthMap.contentWidth()
            if (sh !== shadowOn) shadow.classList.toggle('cm-visible', shadowOn = sh)
            slider.style.display = mmLayout.sliderNeeded ? '' : 'none'
            slider.style.top = `${mmLayout.sliderTop}px`
            slider.style.height = `${mmLayout.sliderHeight}px`
        }

        let cancelFirstPaint: (() => void) | null = null
        const paintAfterFirstFrame = () => {
            firstPaintPending = true
            cancelFirstPaint = afterNextPaint(() => {
                firstPaintPending = false
                cancelFirstPaint = null
                if (destroyed) return
                drawTokens()
                drawMatches()
            })
        }

        const detach = attachOverlay(view, {
            mount(v) {
                v.dom.querySelectorAll(':scope > .cm-minimap, :scope > .cm-minimap-shadow').forEach(n => n.remove())
                // 阴影在 minimap 左缘外,wrap 是 overflow hidden 盖不住,挂在 view.dom 上按 minimap 宽定位
                shadow = document.createElement('div')
                shadow.className = 'cm-minimap-shadow'
                shadow.style.right = `calc(var(--cm-minimap-w, 0px) + ${vsbWidth}px)`
                shadow.setAttribute('aria-hidden', 'true')
                v.dom.appendChild(shadow)
                wrap = document.createElement('div')
                wrap.addEventListener('mouseover', onMouseOver) // 随 wrap 一起销毁,无需解绑
                wrap.addEventListener('mouseleave', onMouseLeave)
                wrap.className = 'cm-minimap'
                hlCanvas = document.createElement('canvas')
                hlCanvas.className = 'cm-minimap-hl'
                canvas = document.createElement('canvas')
                slider = document.createElement('div')
                slider.className = 'cm-minimap-slider'
                wrap.append(canvas, hlCanvas, slider)
                // minimap 是 view.dom 的 flex 兄弟,自占一列(宽按 Monaco 布局公式算,写在 wrap.style.width)——正文无需 paddingRight 让位。
                v.dom.appendChild(wrap)

                // 拖动:直接写 scrollDOM.scrollTop(原生滚动,不 dispatch)。Monaco getDesiredScrollTopFromDelta:
                // scrollTop = round(起始 scrollTop + Δy / computedSliderRatio)
                let dragStartY = 0
                let dragStartScroll = 0
                let dragRatio = 0
                const onMove = (e: PointerEvent) => {
                    if (dragging && dragRatio > 0) v.scrollDOM.scrollTop = v.scaler.toDOM(Math.round(dragStartScroll + (e.clientY - dragStartY) / dragRatio))
                }
                const onUp = () => {
                    dragging = false
                    slider.classList.remove('active')
                    window.removeEventListener('pointermove', onMove)
                    window.removeEventListener('pointerup', onUp)
                }
                wrap.addEventListener('pointerdown', e => {
                    dragging = true
                    slider.classList.add('active')
                    const y = e.clientY - wrap.getBoundingClientRect().top
                    const top = slider.offsetTop
                    // 点在滑块外:点中的那一(视觉)行滚到视口中间(Monaco revealLineNumber Center)，再接着拖。
                    // 行号 = floor(offsetY × dpr / minimapLineHeight) + startLineNumber(device px 里算,同 Monaco internalOffsetY)
                    if (y < top || y > top + slider.offsetHeight) {
                        const sd = v.scrollDOM
                        const dpr = window.devicePixelRatio || 1
                        v.scrollDOM.scrollTop = minimapClickScrollTop(y * dpr, mmScrollDev, mlhNow(), totalRows(), n => rowTop(n - 1), sd.clientHeight, sd.scrollHeight - sd.clientHeight)
                    }
                    dragStartY = e.clientY
                    dragStartScroll = v.scaler.fromDOM(v.scrollDOM.scrollTop)
                    dragRatio = mmLayout?.ratio ?? 0
                    window.addEventListener('pointermove', onMove)
                    window.addEventListener('pointerup', onUp)
                })
                return wrap
            },
            redraw(v, tr) {
                // 初始(tr=null)全量;之后 docChanged → drawTokens(脏区),doc/selection 变 → drawMatches。
                const ph = wrap.clientHeight || v.scrollDOM.clientHeight
                if (!tr) light = null // 几何/主题变了:重新判明暗底
                const optsChanged = syncOptions()
                if (!mm.enabled) return
                const resized = applyPanelH(ph, !tr)
                if (firstDraw && !tr) {
                    // 首帧不画字形:面板尺寸已经定了(没有布局抖动),canvas 上的字形等首帧画出来之后再补。
                    // 10 万行的文件这一画要 10 多 ms,放在 create 里就是首屏晚出这么多。
                    firstDraw = false
                    paintAfterFirstFrame()
                    return
                }
                if (resized) drawTokens()
                if (optsChanged) drawMatches()

                if (!tr) {
                    // scroll/resize:禁止 drawMatches(内含全文 findMatches,大文件每帧数百 ms)。
                    // 仅首帧/resize 重画字形;match 层只在 doc/selection 事务里刷。
                    if (firstDraw || resized) {
                        drawTokens()
                        drawMatches()
                        firstDraw = false
                    }
                    return
                }
                if (transactionChangesFold(tr)) {
                    // 折叠 / 展开:可见行整体移位,全量重画(不走脏区)
                    scheduleRedraw()
                    drawMatches()
                } else if (!tr.changes.empty) {
                    // 打字热路径:minimap 字形层 debounce,避免与输入抢主线程(对齐 Monaco 缩略图可略滞后)。
                    let minFromB = Infinity
                    tr.changes.iterChangedRanges((_fA, _tA, fromB) => { if (fromB < minFromB) minFromB = fromB })
                    const dirtyFrom = minFromB !== Infinity ? v.state.doc.lineAt(minFromB).number : undefined
                    const lineCountChanged = tr.startState.doc.lines !== v.state.doc.lines
                    // Monaco wordHighlighter:改文档即 _stopAll,下一次用户挪光标才回来
                    wordLive = false
                    scheduleRedraw(dirtyFrom, lineCountChanged)
                } else if (tr.selection) {
                    // 用户挪光标(CursorChangeReason.Explicit)且有焦点 → 算;程序设选区 → 清
                    wordLive = v.hasFocus && tr.isUserEvent('select')
                    drawMatches()
                } else if (tr.startState.field(searchField, false) !== v.state.field(searchField, false)
                    || (wordSource && wordSource(tr.startState) !== wordSource(v.state))) {
                    // 查找框开关 / 改查询,或编辑器的同词高亮到了 / 清了:命中装饰变了
                    drawMatches()
                }
            },
            reposition() {
                position()
            },
        })

        // 运行时 dpr 变(拖到另一块屏、浏览器缩放):canvas backing store 和字格都按新 dpr 重建
        let mq: MediaQueryList | null = null
        const onDpr = () => {
            panelH = 0
            mmScrollDev = -1
            imgData = null
            watchDpr()
            position()
            drawTokens()
            drawMatches()
        }
        const watchDpr = () => {
            mq?.removeEventListener('change', onDpr)
            mq = typeof window.matchMedia === 'function' ? window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`) : null
            mq?.addEventListener('change', onDpr)
        }
        watchDpr()

        // Monaco onDidFocusEditorText → wordHighlighter._run:获得焦点就按当前光标算同词高亮(失焦不清)
        const onFocus = () => {
            if (wordLive) return
            wordLive = true
            drawMatches()
        }
        view.contentDOM.addEventListener('focus', onFocus)

        // 后台分词推进(Monaco minimap onTokensChanged):节流重画推到的那段;视窗模式推到窗外不画
        let tokTimer = 0
        let tokFrom = Infinity
        const offTokens = subscribeTokens(view, (from, to) => {
            if (windowed() && (to <= drawnWindow[0] || from >= drawnWindow[1])) return
            tokFrom = Math.min(tokFrom, from)
            if (tokTimer) return
            tokTimer = window.setTimeout(() => {
                tokTimer = 0
                const f = tokFrom
                tokFrom = Infinity
                if (destroyed) return
                drawTokens(f + 1, true)
            }, 100)
        })

        return () => {
            destroyed = true
            if (hideTimer) window.clearTimeout(hideTimer)
            offTokens()
            if (tokTimer) window.clearTimeout(tokTimer)
            view.contentDOM.removeEventListener('focus', onFocus)
            if (retryTimer) window.clearTimeout(retryTimer)
            if (redrawTimer) window.clearTimeout(redrawTimer)
            cancelFirstPaint?.()
            mq?.removeEventListener('change', onDpr)
            view.dom.style.removeProperty('--cm-minimap-w')
            shadow.remove()
            detach()
        }
    }
}
