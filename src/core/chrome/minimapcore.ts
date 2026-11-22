// Portions of this file are derived from Monaco Editor / VS Code (MIT, Copyright (c) Microsoft Corporation). See THIRD-PARTY-NOTICES.md.
// minimap 的纯逻辑 —— 零编辑器依赖,CM6(src/minimap.ts)与 CM7(src/core/minimap.ts)共用。
// glyph atlas / 色块布局 / 滚动与滑块几何全是纯计算。doc 参数放宽成结构类型,Text(CM6)与 Rope(CM7)都满足。

// doc 只需 lines + line(n).from —— Text 与 Rope 的公共子集。
export interface LineIndex {
    lines: number
    line(n: number): { from: number }
}

export const MINIMAP_ROW_H = 2  // dpr 1 / 2 时每行高(px CSS);一般 dpr 见 minimapLineHeight
// Monaco MINIMAP_GUTTER_WIDTH:宽度公式里加的 8 CSS px;画字时左缘留的 8 canvas px(device px)。
export const MINIMAP_GUTTER = 8
// 字形格(device px)= Monaco fontScale(minimapScale):每字符 fontScale 宽、2·fontScale 高(= 一行,无行间隙)。
const CELL_W = 1 // Monaco Constants.BASE_CHAR_WIDTH(乘 fontScale 得 device px)
const GLYPH_H = 2 // Monaco baseCharHeight(renderCharacters),乘 fontScale 得 device px
const FONT = `'JetBrains Mono','SF Mono',Menlo,Consolas,monospace`
const ASCII_LO = 33 // '!'
const ASCII_HI = 126 // '~'

export interface MinimapBlock {
    x: number // 行内列偏移(字符数)
    text: string // block 字符内容(逐字符按墨水量画,产生字符纹理)
    color: string
}
export interface MinimapRow {
    blocks: MinimapBlock[]
}

export interface GlyphInk {
    ink: Uint8ClampedArray // 长度 = n格 × cw × ch,每元素该像素墨量(0..255);按 [code][y][x] 排
    cw: number // 字格宽(device px)
    ch: number // 字格高(device px)
}
export const GLYPH = { CELL_W, GLYPH_H, ASCII_LO, ASCII_HI, GUTTER: MINIMAP_GUTTER }

/** Monaco strings.isFullWidthCharacter(按 UTF-16 码元的便宜判断):minimap 上画两格、占两列。 */
export function isFullWidthCharacter(code: number): boolean {
    return (code >= 0x2E80 && code <= 0xD7AF) || (code >= 0xF900 && code <= 0xFAFF) || (code >= 0xFF01 && code <= 0xFF5E)
}

/**
 * 字符码元 → GlyphInk 里的格号(-1 = 无墨)。照 Monaco minimapCharSheet.getCharIndex:
 * 表是 ' '..'~' + U+FFFD 共 96 格;表外的码元 fontScale ≤ 2 时随便借一个 ASCII 字形((code − 32) mod 96,
 * CJK、emoji 代理对、组合字符都走这条),更大的 scale 画 U+FFFD。本表从 '!' 起,所以格号 = Monaco 下标 − 1。
 */
export function glyphIndex(code: number, fontScale: number): number {
    let i = code - 32
    if (i < 0 || i > 96) i = fontScale <= 2 ? (i + 96) % 96 : 95
    // 0 = 空格;96 = Monaco 自己也越界读表(U+0080),不画
    return i <= 0 || i > 95 ? -1 : i - 1
}

/**
 * Monaco EditorLayoutInfoComputer:minimapScale = pixelRatio ≥ 2 ? round(minimap.scale × 2) : minimap.scale(scale 1)。
 * 只分两档:dpr < 2 → minimap.scale,dpr ≥ 2(含 3)→ round(minimap.scale × 2)。它就是 minimap.js 的 fontScale。
 * scale 默认 1(= minimap.scale 默认值)。
 */
export function minimapScale(dpr: number, scale = 1): number {
    return dpr >= 2 ? Math.round(scale * 2) : scale
}

/** Monaco minimapLineHeight = baseCharHeight(2)× minimapScale,单位 device px(dpr 1.5 → 2,即 1.33 CSS px;dpr 3 → 4)。 */
// renderCharacters = false(色块模式)时 baseCharHeight 是 3(字高 2 + 1 行距),true 时 2。
export function minimapLineHeight(dpr: number, scale = 1, renderCharacters = true): number {
    return (renderCharacters ? GLYPH_H : GLYPH_H + 1) * minimapScale(dpr, scale)
}

/**
 * Monaco EditorLayoutInfoComputer._computeMinimapLayout 里决定行高 / 字格倍数的那一段(minimap.size):
 *   proportional:行高 = baseCharHeight × minimapScale,字格倍数 = minimapScale(dpr, scale);
 *   fill / fit:按编辑器高度把 minimap 拉到刚好装下全文(fit 只在装不下时才变 fill):
 *     全文行数比 minimap 能放的多(ratio > 1)→ 采样(行高 1、倍数 1;只算出参数,画的时候按行高 1 画,不做隔行抽样);
 *     否则 行高 = min(lineHeight × dpr, max(1, floor(1 / desiredRatio))),倍数 = min(scale + 1, max(1, floor(行高 / baseCharHeight))),
 *     倍数 > 配置倍数时面板宽按 min(2, 倍数 / 配置倍数) 缩(widthMultiplier)。
 * 单位:lineHeight 返回 device px;输入的 lineHeight / outerHeight 是 CSS px。
 */
export interface MinimapSizing {
    lineHeight: number
    scale: number
    widthMultiplier: number
    heightIsEditorHeight: boolean
    isSampling: boolean
}
export function minimapSizing(i: {
    size: 'proportional' | 'fill' | 'fit', scale: number, renderCharacters: boolean, dpr: number
    viewLineCount: number, outerHeight: number, lineHeight: number, scrollBeyondLastLine?: boolean, paddingTop?: number, paddingBottom?: number
}): MinimapSizing {
    const baseCharHeight = i.renderCharacters ? 2 : 3
    let scale = minimapScale(i.dpr, i.scale)
    let lineHeight = baseCharHeight * scale
    let widthMultiplier = 1
    let heightIsEditorHeight = false
    let isSampling = false
    if (i.size === 'fill' || i.size === 'fit') {
        const typicalViewportLineCount = i.outerHeight / i.lineHeight
        const before = Math.floor((i.paddingTop ?? 0) / i.lineHeight)
        let beyond = Math.floor((i.paddingBottom ?? 0) / i.lineHeight)
        if (i.scrollBeyondLastLine) beyond = Math.max(beyond, typicalViewportLineCount - 1)
        const desiredRatio = (before + i.viewLineCount + beyond) / (i.dpr * i.outerHeight)
        const minimapLineCount = Math.floor(i.viewLineCount / desiredRatio)
        const ratio = i.viewLineCount / minimapLineCount
        if (ratio > 1) {
            heightIsEditorHeight = true
            isSampling = true
            scale = 1
            lineHeight = 1
        } else {
            let fitBecomesFill = false
            if (i.size === 'fit') fitBecomesFill = Math.ceil((before + i.viewLineCount + beyond) * lineHeight) > Math.floor(i.dpr * i.outerHeight)
            if (i.size === 'fill' || fitBecomesFill) {
                heightIsEditorHeight = true
                const configured = scale
                lineHeight = Math.min(i.lineHeight * i.dpr, Math.max(1, Math.floor(1 / desiredRatio)))
                scale = Math.min(configured + 1, Math.max(1, Math.floor(lineHeight / baseCharHeight)))
                if (scale > configured) widthMultiplier = Math.min(2, scale / configured)
            }
        }
    }
    return { lineHeight, scale, widthMultiplier, heightIsEditorHeight, isSampling }
}

/** dpr 下的字格(device px):Monaco minimapCharWidth = BASE_CHAR_WIDTH × fontScale,字高 = baseCharHeight × fontScale。 */
// fontScale:最终字格倍数(minimapSizing().scale);不给 = 默认 minimap.scale 1 在这个 dpr 下的值
export function glyphCell(dpr: number, fontScale = minimapScale(dpr)): { cw: number, ch: number } {
    return { cw: CELL_W * fontScale, ch: GLYPH_H * fontScale }
}

/**
 * minimap 面板宽(CSS px)= Monaco EditorLayoutInfoComputer._computeMinimapLayout(size 'proportional'、scale 1、
 * renderCharacters、maxColumn 120、side right):
 *   minimapCharWidth = minimapScale / dpr(CSS px;dpr 1.25 → 0.8,dpr 3 → 2/3)
 *   width = min(floor(120·charW), floor((remainingWidth − 竖滚动条 − 2)·charW / (字宽 + charW)) + 8)
 * remainingWidth = 编辑器外宽 − 行号/折叠 gutter。编辑器宽 766 → 85,516 → 57(字宽 7.83)。
 * 竖滚动条宽 = Monaco verticalScrollbarSize:右边有竖条 / 概览列时 14,什么都没有时 0。
 */
export function minimapLayoutWidth(input: { outerWidth: number, gutterWidth: number, charWidth: number, dpr: number, verticalScrollbarWidth?: number, maxColumn?: number, fontScale?: number, widthMultiplier?: number }): number {
    const charW = (input.fontScale ?? minimapScale(input.dpr)) / input.dpr / (input.widthMultiplier ?? 1)
    const remaining = (input.outerWidth | 0) - input.gutterWidth
    const vsb = input.verticalScrollbarWidth ?? 14
    const maxW = Math.floor((input.maxColumn ?? 120) * charW)
    if (!(input.charWidth > 0)) return maxW
    return Math.min(maxW, Math.max(0, Math.floor(((remaining - vsb - 2) * charW) / (input.charWidth + charW))) + MINIMAP_GUTTER)
}

// Monaco minimapPreBaked.ts(MIT,Copyright (c) Microsoft Corporation):scale 1 / 2 的字形墨量表。
// 字符 32..126 + U+FFFD 共 96 格,每格 scale × 2·scale 字节、按 [y][x] 排。Monaco 在这两档不按字体采样,直接用表。
const PREBAKED: Record<number, string> = {
    1: '0000511D6300CF609C709645A78432005642574171487021003C451900274D35D762755E8B629C5BA856AF57BA649530C167D1512A272A3F6038604460398526BCA2A968DB6F8957C768BE5FBE2FB467CF5D8D5B795DC7625B5DFF50DE64C466DB2FC47CD860A65E9A2EB96CB54CE06DA763AB2EA26860524D3763536601005116008177A8705E53AB738E6A982F88BAA35B5F5B626D9C636B449B737E5B7B678598869A662F6B5B8542706C704C80736A607578685B70594A49715A4522E792',
    2: '000000000000000055394F383D2800008B8B1F210002000081B1CBCBCC820000847AAF6B9AAF2119BE08B8881AD60000A44FD07DCCF107015338130C00000000385972265F390B406E2437634B4B48031B12B8A0847000001E15B29A402F0000000000004B33460B00007A752C2A0000000000004D3900000084394B82013400ABA5CFC7AD9C0302A45A3E5A98AB000089A43382D97900008BA54AA087A70A0248A6A7AE6DBE0000BF6F94987EA40A01A06DCFA7A7A9030496C32F77891D0000A99FB1A0AFA80603B29AB9CA75930D010C0948354D3900000C0948354F37460D0028BE673D8400000000AF9D7B6E00002B007AA8933400007AA642675C2700007984CFB9C3985B768772A8A6B7B20000CAAECAAFC4B700009F94A6009F840009D09F9BA4CA9C0000CC8FC76DC87F0000C991C472A2000000A894A48CA7B501079BA2C9C69BA20000B19A5D3FA89000005CA6009DA2960901B0A7F0669FB200009D009E00B7890000DAD0F5D092820000D294D4C48BD10000B5A7A4A3B1A50402CAB6CBA6A2000000B5A7A4A3B1A8044FCDADD19D9CB00000B7778F7B8AAE0803C9AB5D3F5D3F00009EA09EA0BAB006039EA0989A8C7900009B9EF4D6B7C00000A9A7816CACA80000ABAC84705D3F000096DA635CDC8C00006F486F266F263D4784006124097B00374F6D2D6D2D6D4A3A95872322000000030000000000008D8939130000000000002E22A5C9CBC70600AB25C0B5C9B400061A2DB04CA67001082AA6BEBEBFC606002321DACBC19E03087AA08B6768380000282FBAC0B8CA7A88AD25BBA5A29900004C396C5894A6000040485A6E356E9442A32CD17EADA70000B4237923628600003E2DE9C1D7B500002F25BBA5A2990000231DB6AFB4A804023025C0B5CAB588062B2CBDBEC0C706882435A75CA20000002326BD6A82A908048B4B9A5A668000002423A09CB4BB060025259C9D8A7900001C1FCAB2C7C700002A2A9387ABA200002626A4A47D6E9D14333163A0C87500004B6F9C2D643A257049364936493647358A34438355497F1A0000A24C1D590000D38DFFBDD4CD3126',
}
const decodeHex = (str: string): Uint8ClampedArray => {
    const out = new Uint8ClampedArray(str.length / 2)
    for (let i = 0; i < str.length; i += 2) out[i >> 1] = parseInt(str.slice(i, i + 2), 16)
    return out
}

// Monaco MinimapCharRendererFactory.createSampleData + _downsample(没有预烤表的 scale 走这条):
// 每字符画进 10×16 的 bold 16px 格,再按目标像素覆盖的源像素做带权面积平均(不是 drawImage 点采样,
// 细竖笔画不会丢),最后按最亮像素拉满到 255。
const SAMPLE_W = 10, SAMPLE_H = 16, SAMPLE_N = 96
function sampleGlyphs(scale: number): Uint8ClampedArray | null {
    const canvas = document.createElement('canvas')
    canvas.width = SAMPLE_N * SAMPLE_W
    canvas.height = SAMPLE_H
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#ffffff'
    ctx.font = `bold ${SAMPLE_H}px ${FONT}`
    ctx.textBaseline = 'middle'
    for (let i = 0; i < SAMPLE_N - 1; i++) ctx.fillText(String.fromCharCode(32 + i), i * SAMPLE_W, SAMPLE_H / 2)
    ctx.fillText('\uFFFD', (SAMPLE_N - 1) * SAMPLE_W, SAMPLE_H / 2)
    return downsampleGlyphs(ctx.getImageData(0, 0, canvas.width, SAMPLE_H).data, scale)
}

/** Monaco MinimapCharRendererFactory._downsample:src = 96 格 × 10×16 的 RGBA 采样表(一行排开),输出 scale × 2·scale 的墨量表 */
export function downsampleGlyphs(src: Uint8ClampedArray, scale: number): Uint8ClampedArray {
    const rowW = SAMPLE_N * SAMPLE_W * 4
    const w = scale, h = 2 * scale
    const out = new Uint8ClampedArray(SAMPLE_N * w * h)
    let brightest = 0
    let t = 0
    for (let c = 0; c < SAMPLE_N; c++) {
        const base = c * SAMPLE_W * 4
        for (let y = 0; y < h; y++) {
            const sy1 = (y / h) * SAMPLE_H, sy2 = ((y + 1) / h) * SAMPLE_H
            for (let x = 0; x < w; x++) {
                const sx1 = (x / w) * SAMPLE_W, sx2 = ((x + 1) / w) * SAMPLE_W
                let value = 0, samples = 0
                for (let sy = sy1; sy < sy2; sy++) {
                    const row = base + Math.floor(sy) * rowW
                    const yb = 1 - (sy - Math.floor(sy))
                    for (let sx = sx1; sx < sx2; sx++) {
                        const xb = 1 - (sx - Math.floor(sx))
                        const i = row + Math.floor(sx) * 4
                        const wt = xb * yb
                        samples += wt
                        value += ((src[i] * src[i + 3]) / 255) * wt
                    }
                }
                const v = value / samples
                if (v > brightest) brightest = v
                out[t++] = Math.floor(v) // Monaco toUint8:向零截断(直接赋值给 Uint8ClampedArray 会四舍五入)
            }
        }
    }
    if (brightest > 0) for (let i = 0; i < out.length; i++) out[i] = out[i] * (255 / brightest)
    return out
}

// 字形墨量表:按字格尺寸 + 明暗底缓存。墨量 = Monaco MinimapCharRenderer.soften(暗底 ×12/15,亮底 ×50/60),
// 画的时候墨量即前景不透明度(Monaco renderChar:bg + (fg − bg)·墨量/255)。
/** Monaco MinimapCharRenderer.soften:暗底 ×12/15,亮底 ×50/60,向零取整 */
export function softenInk(raw: Uint8ClampedArray, lightBackground: boolean): Uint8ClampedArray {
    const ratio = lightBackground ? 50 / 60 : 12 / 15
    const out = new Uint8ClampedArray(raw.length)
    for (let i = 0; i < raw.length; i++) out[i] = Math.floor(raw[i] * ratio)
    return out
}
const inkCache = new Map<string, GlyphInk>()
// 色块模式(renderCharacters:false)的墨量:每个非空字符一整块 cw × ch,前景 50% 叠在底色上
// (Monaco MinimapCharRenderer.blockRenderChar:c = 0.5 · foregroundAlpha / 255)
const BLOCK_INK = 128
export function glyphInk(dpr = 1, lightBackground = false, fontScale = minimapScale(dpr), renderCharacters = true): GlyphInk | null {
    const { cw, ch } = glyphCell(dpr, fontScale)
    const key = `${cw}x${ch}${lightBackground ? 'L' : 'D'}${renderCharacters ? '' : 'B'}`
    const hit = inkCache.get(key)
    if (hit) return hit
    if (!renderCharacters) {
        const out = { ink: new Uint8ClampedArray((ASCII_HI - ASCII_LO + 2) * cw * ch).fill(BLOCK_INK), cw, ch }
        inkCache.set(key, out)
        return out
    }
    const raw = PREBAKED[cw] ? decodeHex(PREBAKED[cw]) : sampleGlyphs(cw)
    if (!raw) return null // jsdom/SSR 且没有预烤表的 scale:无墨表,drawTokens 安静跳过
    const out = glyphInkFromRaw(raw, cw, ch, lightBackground)
    inkCache.set(key, out)
    return out
}

/** 96 格原始表(' '..'~' + U+FFFD,下采样后、soften 前)→ 本表(从 '!' 起,去掉空格格,soften) */
function glyphInkFromRaw(raw: Uint8ClampedArray, cw: number, ch: number, lightBackground: boolean): GlyphInk {
    const per = cw * ch
    const n = ASCII_HI - ASCII_LO + 2 // '!'..'~' + U+FFFD
    const off = (ASCII_LO - 32) * per
    return { ink: softenInk(raw.subarray(off, off + n * per), lightBackground), cw, ch }
}

/** 从 96 格 10×16 RGBA 采样表(Monaco createFromSampleData 的输入)直接得墨量表;不进缓存 */
export function glyphInkFromSample(sample: Uint8ClampedArray, scale: number, lightBackground = false): GlyphInk {
    return glyphInkFromRaw(downsampleGlyphs(sample, scale), scale, 2 * scale, lightBackground)
}

/** 前景 (r,g,b,墨量 a) 以 source-over 叠到 RGBA 缓冲 o 处(非预乘;空像素直接写前景色,不把墨量乘两遍)。 */
export function blendInk(buf: Uint8ClampedArray, o: number, r: number, g: number, b: number, a: number) {
    const da = buf[o + 3]
    if (da === 0 || a === 255) {
        buf[o] = r; buf[o + 1] = g; buf[o + 2] = b; buf[o + 3] = a
        return
    }
    const sa = a / 255, dA = da / 255
    const outA = sa + dA * (1 - sa)
    buf[o] = (r * sa + buf[o] * dA * (1 - sa)) / outA
    buf[o + 1] = (g * sa + buf[o + 1] * dA * (1 - sa)) / outA
    buf[o + 2] = (b * sa + buf[o + 2] * dA * (1 - sa)) / outA
    buf[o + 3] = outA * 255
}

/** 一个折行视觉行:doc 行内 [from, to) 列,画在 indent 列起(Monaco wrappingIndent 'same')。 */
export interface WrapSegment { from: number, to: number, indent: number }

/**
 * 行内每个 UTF-16 码元的视觉列(Monaco InnerMinimap._renderLine 的 dx 推进):tab 展开到下一个 tab stop,
 * 全角字符(isFullWidthCharacter)占 2 列,其余(含代理对的每一半、组合字符)占 1 列。
 * Monaco 算 tab stop 用的是 charIndex + tabsCharDelta,全角只算 1 列——这里同样分两本账。
 * 返回长度 len+1(末项 = 行视觉宽);没有 tab 也没有全角时返回 null(列 = 下标)。
 */
// 长行的结果记一下:minimap 一次重画要为选区、装饰的每个端点各问一遍(几十次),53 万字符的行每问扫一遍整行,
// 方向键移一格光标就 50 ms。纯函数,按(文本, tabSize)记;只记长行,短行扫一遍比查表便宜。
const vcMemo = new Map<string, { tabSize: number, v: Int32Array | null }>()
const VC_MEMO_MIN = 2000
const VC_MEMO_MAX = 8
export function visualColumns(text: string, tabSize: number): Int32Array | null {
    if (text.length < VC_MEMO_MIN) return visualColumnsRaw(text, tabSize)
    const hit = vcMemo.get(text)
    if (hit && hit.tabSize === tabSize) return hit.v
    const v = visualColumnsRaw(text, tabSize)
    if (vcMemo.size >= VC_MEMO_MAX) vcMemo.delete(vcMemo.keys().next().value!)
    vcMemo.set(text, { tabSize, v })
    return v
}
function visualColumnsRaw(text: string, tabSize: number): Int32Array | null {
    let plain = true
    for (let i = 0; i < text.length; i++) {
        const c = text.charCodeAt(i)
        if (c === 9 || (c >= 0x2E80 && isFullWidthCharacter(c))) { plain = false; break }
    }
    if (plain) return null
    const out = new Int32Array(text.length + 1)
    let v = 0, t = 0 // v:视觉列;t:Monaco 算 tab stop 的列
    for (let i = 0; i < text.length; i++) {
        out[i] = v
        const c = text.charCodeAt(i)
        if (c === 9) {
            const ins = tabSize - (t % tabSize)
            t += ins
            v += ins
        } else {
            t++
            v += isFullWidthCharacter(c) ? 2 : 1
        }
    }
    out[text.length] = v
    return out
}

/**
 * 折行时一行拆成的视觉行(minimap 按视觉行画,同 Monaco view line)。近似 lite-monaco 正文的 CSS 折行:
 * pre-wrap(行尾空格挂在行外)+ overflow-wrap:anywhere(放不下的长词硬断)、断点在空格串/连字符之后;
 * 续行缩进 = 行首纯空格数 / 纯 tab 数 × tabSize(同 materialize wrapIndent,空格 tab 混排不缩进)。
 * cols = 每视觉行可容列数;宽度按视觉列(tab 展开、全角两列,同 visualColumns)量。段的 from/to 是字符下标,indent 是视觉列。
 */
const wsMemo = new Map<string, { cols: number, tabSize: number, v: WrapSegment[] }>()
export function wrapSegments(text: string, cols: number, tabSize = 4): WrapSegment[] {
    // 长行(压缩 js、日志)一次重画里 lineLayout 会被叫很多次(选区 / 匹配 / 滚动):同一行同一宽度只拆一次
    if (text.length < VC_MEMO_MIN) return wrapSegmentsRaw(text, cols, tabSize)
    const c = Math.max(1, Math.floor(cols))
    const hit = wsMemo.get(text)
    if (hit && hit.cols === c && hit.tabSize === tabSize) return hit.v
    const v = wrapSegmentsRaw(text, c, tabSize)
    if (wsMemo.size >= VC_MEMO_MAX) wsMemo.delete(wsMemo.keys().next().value!)
    wsMemo.set(text, { cols: c, tabSize, v })
    return v
}
function wrapSegmentsRaw(text: string, cols: number, tabSize = 4): WrapSegment[] {
    const len = text.length
    cols = Math.max(1, Math.floor(cols))
    const vis = visualColumns(text, tabSize)
    const vc = (i: number) => vis ? vis[i] : i
    if (vc(len) <= cols) return [{ from: 0, to: len, indent: 0 }]
    let spaces = 0, tabs = 0, lead = 0
    while (lead < len) {
        const c = text.charCodeAt(lead)
        if (c === 32) spaces++
        else if (c === 9) tabs++
        else break
        lead++
    }
    let indent = spaces && tabs ? 0 : spaces + tabs * tabSize
    if (cols - indent < 1) indent = 0
    const out: WrapSegment[] = []
    let from = 0
    while (from < len) {
        const first = out.length === 0
        const width = first ? cols : cols - indent
        // 本段最多放到 end(视觉宽 ≤ width 的最长前缀;至少 1 个字符)
        let end = from + 1
        while (end < len && vc(end + 1) - vc(from) <= width) end++
        if (vc(len) - vc(from) <= width) { out.push({ from, to: len, indent: first ? 0 : indent }); break }
        let brk = -1
        if (text.charCodeAt(end) === 32) {
            // 恰好在边上的空格串挂在本行尾
            brk = end
            while (brk < len && text.charCodeAt(brk) === 32) brk++
        } else {
            for (let k = end; k > from; k--) {
                const c = text.charCodeAt(k - 1)
                if (c === 32 || c === 45 /* - */) { brk = k; break }
            }
            // 首行行首空白不算断点(否则缩进后第一个词放不下时整行只剩空白)
            if (brk !== -1 && first && brk <= lead) brk = -1
        }
        if (brk === -1) brk = end
        out.push({ from, to: brk, indent: first ? 0 : indent })
        from = brk
    }
    return out
}

/** minimap 点击(非滑块)→ 目标 scrollTop:点中的 minimap 行的行顶居中(Monaco revealLineNumber, VerticalRevealType.Center,鼠标来源)。 */
export function minimapClickScrollTop(
    y: number, mmScroll: number, rowH: number, lineCount: number,
    lineTop: (line: number) => { top: number, height: number }, clientHeight: number, maxScroll: number,
): number {
    const line = Math.max(1, Math.min(lineCount, Math.floor((y + mmScroll) / rowH) + 1))
    const b = lineTop(line)
    // Monaco revealRange('mouse', Center):鼠标来源在行上方多留一行 → 盒 [top − 行高, top + 行高],盒中点 = 行顶。
    // 所以是「行顶」居中,不是行中线(对照页实测:点 minimap y=100 → Monaco scrollTop 741 = 1000 − 518/2)
    return Math.max(0, Math.min(maxScroll, b.top - clientHeight / 2))
}

// '#rgb'/'#rrggbb' → [r,g,b]。词法解析非正则。
export function hexRGB(hex: string): [number, number, number] {
    if (hex.charCodeAt(0) === 35) hex = hex.slice(1)
    if (hex.length === 3) return [parseInt(hex[0] + hex[0], 16), parseInt(hex[1] + hex[1], 16), parseInt(hex[2] + hex[2], 16)]
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)]
}

// shiki tokens + doc → 每行的色块布局(保留字符内容供逐字符纹理)。
export function minimapRows(
    tokens: { content: string; offset: number; color?: string }[][],
    doc: LineIndex,
): MinimapRow[] {
    const rows: MinimapRow[] = []
    for (let i = 0; i < tokens.length; i++) {
        const lineStart = i < doc.lines ? doc.line(i + 1).from : 0
        const blocks: MinimapBlock[] = []
        for (const tok of tokens[i]) {
            const x = tok.offset - lineStart
            let end = tok.content.length
            while (end > 0 && (tok.content[end - 1] === ' ' || tok.content[end - 1] === '\t')) end--
            if (tok.color && end > 0) blocks.push({ x, text: tok.content.slice(0, end), color: tok.color })
        }
        rows.push({ blocks })
    }
    return rows
}

/**
 * Monaco MinimapLayout.create(size 'proportional'、padding 0、没有 view zone 空隙)。
 * 单位:minimapLineHeight / canvasInnerHeight 是 device px,其余 CSS px;行号是 view line(折叠藏掉的不算,折行一段算一行),1 起。
 *   sliderHeight = floor(viewportHeight / lineHeight × minimapLineHeight / dpr)
 *   maxSliderTop = min(minimapHeight − sliderHeight, max(0, lineCount × minimapLineHeight / dpr − sliderHeight))
 *   scrollBeyondLastLine 时末行下方多 viewportHeight / lineHeight − 1 行:maxSliderTop = (lineCount − 2) × minimapLineHeight / dpr(拖到底滑块顶是末行)
 *   ratio = maxSliderTop / (scrollHeight − viewportHeight),理想 sliderTop = scrollTop × ratio
 * 全部行放得下:minimap 不滚,sliderTop = 理想值。放不下:minimap 按整行滚 ——
 *   startLineNumber = max(1, floor(起始行 − 理想 sliderTop × dpr / minimapLineHeight))(滚动方向防抖:上滚不增、下滚不减)
 *   sliderTop = (viewportStartLineNumber − startLineNumber + 行内比例) × minimapLineHeight / dpr
 * 所以滑块 top 比 scrollTop × ratio 多出不到一行(minimap 内容整行对齐,滑块补齐零头)。
 */
export interface MinimapLayout {
    sliderNeeded: boolean
    sliderTop: number // CSS px
    sliderHeight: number // CSS px
    ratio: number // 滑块每移 1 CSS px 对应 scrollTop 变化 1/ratio(Monaco computedSliderRatio)
    startLineNumber: number // minimap 顶上第一行(view line,1 起):内容偏移 = (start − 1) × minimapLineHeight device px
    scrollTop: number
    scrollHeight: number
}
export function minimapLayout(input: {
    dpr: number
    minimapLineHeight: number // device px
    canvasInnerHeight: number // device px
    minimapHeight: number // CSS px(= 编辑器高)
    lineHeight: number
    viewportHeight: number
    scrollTop: number
    scrollHeight: number
    lineCount: number // view line 数
    scrollBeyondLastLine?: boolean
    viewportStartLineNumber: number
    viewportStartLineNumberVerticalOffset: number // 该行行顶(CSS px,与 scrollTop 同坐标)
}, previous: MinimapLayout | null = null): MinimapLayout {
    const { dpr, minimapLineHeight: mlh, lineHeight, viewportHeight, scrollTop, scrollHeight, lineCount } = input
    const linesFitting = Math.floor(input.canvasInnerHeight / mlh)
    const sliderHeight = Math.floor(viewportHeight / lineHeight * mlh / dpr)
    const extraBottom = input.scrollBeyondLastLine ? viewportHeight / lineHeight - 1 : 0
    let maxSliderTop = extraBottom > 0
        ? (lineCount + extraBottom - viewportHeight / lineHeight - 1) * mlh / dpr
        : Math.max(0, lineCount * mlh / dpr - sliderHeight)
    maxSliderTop = Math.min(input.minimapHeight - sliderHeight, maxSliderTop)
    const scrollRange = scrollHeight - viewportHeight
    // Monaco 不防 0/0(不滚动时滑块本来就不显示);这里给 0,免得 NaN 写进 style
    const ratio = scrollRange > 0 ? maxSliderTop / scrollRange : 0
    const sliderTop = scrollTop * ratio
    if (linesFitting >= lineCount + extraBottom) {
        return { sliderNeeded: maxSliderTop > 0, sliderTop, sliderHeight, ratio, startLineNumber: 1, scrollTop, scrollHeight }
    }
    const start = input.viewportStartLineNumber
    const considering = start > 1 ? start : Math.max(1, scrollTop / lineHeight)
    let startLineNumber = Math.max(1, Math.floor(considering - sliderTop * dpr / mlh))
    // 防抖:同一 scrollHeight 下,上滚不让起始行变大、下滚不让它变小
    if (previous && previous.scrollHeight === scrollHeight) {
        if (previous.scrollTop > scrollTop) startLineNumber = Math.min(startLineNumber, previous.startLineNumber)
        if (previous.scrollTop < scrollTop) startLineNumber = Math.max(startLineNumber, previous.startLineNumber)
    }
    const partialLine = (scrollTop - input.viewportStartLineNumberVerticalOffset) / lineHeight
    const sliderTopAligned = (start - startLineNumber + partialLine) * mlh / dpr
    return { sliderNeeded: true, sliderTop: sliderTopAligned, sliderHeight, ratio, startLineNumber, scrollTop, scrollHeight }
}

// 旧的连续滚动同步律(mmScroll = scrollTop × maxMm/maxEd),minimap 已改用 minimapLayout;留给 CM6 版和旧单测。
export function minimapScroll(scrollTop: number, docH: number, minimapContentH: number, panelH: number): number {
    const maxMm = minimapContentH - panelH
    const maxEd = docH - panelH
    if (maxMm <= 0 || maxEd <= 0) return 0
    return Math.min(maxMm, Math.max(0, scrollTop) * (maxMm / maxEd))
}

// 滚动位置 → 视口框 {top, height}(px,连续)。旧律:CM7 minimap 的滑块已按 minimapLayout(Monaco 取整 + 整行对齐)算,留给 CM6 版和旧单测。
export function sliderRect(scrollTop: number, clientHeight: number, lineHeight: number, rowH: number, mmScroll = 0): { top: number; height: number } {
    const k = rowH / lineHeight
    return { top: Math.max(0, scrollTop * k - mmScroll), height: Math.max(rowH, clientHeight * k) }
}
