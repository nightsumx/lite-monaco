// 字体度量:Monaco FontMeasurements.readFontInfo 的 DOM 版(browser/config/fontMeasurements.js + charWidthReader.js)。
// 在隐藏容器里用指定字体排一串串重复 256 次的字符,量宽度 ÷ 256。读 'n'(半角)、'ｍ'(全角)、空格、0-9 最大值、→ ￫ · ⸱,
// 并拿一批窄/宽字符比较宽度判 isMonospace。jsdom / display:none 没有布局时量出全 0 → 返回 null(调用方退回无头估算)。

import type { BareFontInfo, FontInfo } from '../options/types'
import { FontInfo as FontClass, massagedFontFamily } from '../options/fontclasses'

const REPEAT = 256
const MONOSPACE_TEST_CHARS = '|/-_ilm%'

let cache = new WeakMap<Document, Map<string, FontInfo>>()

const cacheKey = (b: BareFontInfo) =>
    [b.pixelRatio, b.fontFamily, b.fontWeight, b.fontSize, b.fontFeatureSettings, b.fontVariationSettings, b.lineHeight, b.letterSpacing].join('|')

/** Monaco applyFontInfo:把字体信息写成元素的内联样式 */
export function applyFontStyle(el: HTMLElement, f: BareFontInfo): void {
    const s = el.style
    s.fontFamily = massagedFontFamily(f.fontFamily)
    s.fontWeight = f.fontWeight
    s.fontSize = `${f.fontSize}px`
    s.fontFeatureSettings = f.fontFeatureSettings
    s.fontVariationSettings = f.fontVariationSettings
    s.lineHeight = `${f.lineHeight}px`
    s.letterSpacing = f.letterSpacing === 0 ? 'normal' : `${f.letterSpacing}px`
}

interface Req { chr: string, style: 0 | 1 | 2, width: number }

/** 清掉度量缓存(字体加载完后重量) */
export function clearFontCache(doc?: Document): void {
    if (doc) { cache.delete(doc); return }
    // Monaco FontMeasurements.clearAllFontInfos:不指定文档 = 全清。WeakMap 不能遍历,换一个新的
    cache = new WeakMap()
    for (const fn of [...clearListeners]) fn()
}

const clearListeners = new Set<() => void>()
/** 订阅「全部度量被清」(Monaco FontMeasurements.onDidChange):在世的编辑器据此重新量字体 */
export function onFontCacheCleared(fn: () => void): () => void {
    clearListeners.add(fn)
    return () => { clearListeners.delete(fn) }
}

/**
 * 量字体。host 必须已挂进 DOM(量宽要布局)。没有布局 → null。
 * 结果带 isTrusted:true;量出来太小(≤ 2,Monaco bug 14341)的宽度抬到 5,isTrusted:false。
 */
export function measureFontInfo(bare: BareFontInfo, host: HTMLElement): FontInfo | null {
    const doc = host.ownerDocument
    let perDoc = cache.get(doc)
    if (!perDoc) cache.set(doc, perDoc = new Map())
    const key = cacheKey(bare)
    const hit = perDoc.get(key)
    if (hit) return hit
    if (!host.isConnected) return null

    const all: Req[] = []
    const mono: Req[] = []
    const req = (chr: string, style: 0 | 1 | 2 = 0, monospace = false): Req => {
        const r: Req = { chr, style, width: 0 }
        all.push(r)
        if (monospace) mono.push(r)
        return r
    }
    const n = req('n', 0, true)
    const fullwidth = req('\uff4d')
    const space = req(' ', 0, true)
    const digits = '0123456789'.split('').map(d => req(d, 0, true))
    const arrow = req('→', 0, true)
    const halfArrow = req('￫')
    const middot = req('·', 0, true)
    const wsmiddot = req(String.fromCharCode(0x2E31))
    for (const c of MONOSPACE_TEST_CHARS) { req(c, 0, true); req(c, 1, true); req(c, 2, true) }

    const container = doc.createElement('div')
    container.setAttribute('aria-hidden', 'true')
    applyFontStyle(container, bare)
    const cs = container.style
    cs.position = 'absolute'
    cs.visibility = 'hidden'
    cs.left = '-50000px'
    cs.top = '-50000px'
    cs.width = '50000px'
    cs.whiteSpace = 'pre'
    cs.fontKerning = 'none'
    const spans = all.map(r => {
        const span = doc.createElement('span')
        span.textContent = r.chr.repeat(REPEAT)
        if (r.style === 1) span.style.fontStyle = 'italic'
        else if (r.style === 2) span.style.fontWeight = 'bold'
        container.appendChild(span)
        container.appendChild(doc.createElement('br'))
        return span
    })
    host.appendChild(container)
    try {
        // Monaco charWidthReader:offsetWidth(取整)/ 256,不是小数宽;半角 8.4296875 而非 8.4287…,长行末尾差到 2px
        all.forEach((r, i) => { const el = spans[i]; r.width = (el.offsetWidth || el.getBoundingClientRect().width) / REPEAT }) // offsetWidth 为 0 = 没有布局(jsdom),退回矩形宽
    } finally {
        container.remove()
    }
    if (!all.some(r => r.width > 0)) return null // 没有布局

    const maxDigitWidth = Math.max(...digits.map(d => d.width))
    let isMonospace = bare.fontFeatureSettings === '"liga" off, "calt" off'
    const ref = mono[0].width
    for (let i = 1; isMonospace && i < mono.length; i++) {
        const diff = ref - mono[i].width
        if (diff < -0.001 || diff > 0.001) isMonospace = false
    }
    let canUseHalfwidthRightwardsArrow = true
    if (isMonospace && halfArrow.width !== ref) canUseHalfwidthRightwardsArrow = false
    if (halfArrow.width > arrow.width) canUseHalfwidthRightwardsArrow = false

    const tooSmall = n.width <= 2 || fullwidth.width <= 2 || space.width <= 2 || maxDigitWidth <= 2
    const fix = (w: number) => (tooSmall ? Math.max(w, 5) : w)
    const info: FontInfo = new FontClass({
        ...bare,
        isMonospace,
        typicalHalfwidthCharacterWidth: fix(n.width),
        typicalFullwidthCharacterWidth: fix(fullwidth.width),
        canUseHalfwidthRightwardsArrow,
        spaceWidth: fix(space.width),
        middotWidth: fix(middot.width),
        wsmiddotWidth: fix(wsmiddot.width),
        maxDigitWidth: fix(maxDigitWidth),
    }, !tooSmall)
    perDoc.set(key, info)
    return info
}

/** monaco.editor.remeasureFonts(FontMeasurements.clearAllFontInfos):清全部度量,在世的编辑器重量 */
export function remeasureFonts(): void { clearFontCache() }
