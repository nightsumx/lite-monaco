// 第四轮 M 组:minimap 非 ASCII 字形 / 不折行时按可见行画 / 查找框右偏移跟 minimap 宽,对齐 Monaco 0.52。
// jsdom 无 canvas:桩一个记录型 2D context(putImageData 落进每块 canvas 的「屏幕」缓冲,fillRect 记下来),
// 再给一个整行一个 token 的假 shiki,就能逐像素比 Monaco InnerMinimap._renderLine。
// 浏览器侧截图与查找框实测:/tmp/lc-hunt/r4/M/{cjk.ts,fold.ts,findpos.ts}。
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { glyphInk, visualColumns, isFullWidthCharacter, GLYPH } from '../../src/core/chrome/minimapcore'
import { minimapCM7 } from '../../src/core/chrome/minimap'
import { EditorView } from '../../src/core/view/editorview'
import { EditorState } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'
import { foldCode, foldDecorations, foldField } from '../../src/core/edit/fold'
import { liteMonacoBaseCSS } from '../../src/product/themecss'
import { rulerPalette } from '../../src/product/theme'
import type { ScopedShiki } from '../../src/core/view/tokens'

// —— 记录型 canvas 桩 ——
interface FakeCtx {
    screen: Uint8ClampedArray
    rects: { x: number, y: number, w: number, h: number, style: string, alpha: number }[]
}
const ctxs = new WeakMap<HTMLCanvasElement, FakeCtx & Record<string, unknown>>()
const origGetContext = HTMLCanvasElement.prototype.getContext
beforeAll(() => {
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) {
        let c = ctxs.get(this)
        const cv = this
        const ensure = () => {
            if (!c!.screen || c!.screen.length !== cv.width * cv.height * 4) c!.screen = new Uint8ClampedArray(cv.width * cv.height * 4)
        }
        if (!c) {
            c = {
                screen: new Uint8ClampedArray(0), rects: [], fillStyle: '', globalAlpha: 1,
                createImageData: (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
                clearRect() { ensure(); c!.screen.fill(0); c!.rects = [] },
                fillRect(x: number, y: number, w: number, h: number) { c!.rects.push({ x, y, w, h, style: String(c!.fillStyle), alpha: Number(c!.globalAlpha) }) },
                // putImageData(img, dx, dy, sx, sy, sw, sh):把 img 的 [sx,sy,sw,sh] 贴到屏幕 (dx+sx, dy+sy)
                putImageData(img: ImageData, dx: number, dy: number, sx = 0, sy = 0, sw = img.width, sh = img.height) {
                    ensure()
                    for (let y = sy; y < sy + sh; y++) {
                        const ty = dy + y
                        if (y < 0 || y >= img.height || ty < 0 || ty >= cv.height) continue
                        for (let x = sx; x < sx + sw; x++) {
                            const tx = dx + x
                            if (x < 0 || x >= img.width || tx < 0 || tx >= cv.width) continue
                            for (let k = 0; k < 4; k++) c!.screen[(ty * cv.width + tx) * 4 + k] = img.data[(y * img.width + x) * 4 + k]
                        }
                    }
                },
            }
            ctxs.set(this, c)
        }
        return c as unknown as CanvasRenderingContext2D
    } as unknown as typeof HTMLCanvasElement.prototype.getContext
})
afterAll(() => { HTMLCanvasElement.prototype.getContext = origGetContext })

// 整行一个白色 token 的假 shiki(minimap 只看 color + content)
const hl: ScopedShiki = {
    codeToTokens: (code: string) => ({ tokens: code.split('\n').map(l => [{ content: l, offset: 0, color: '#ffffff' }]) }),
    getLastGrammarState: () => ({ getScopes: () => [] }),
}
const palette = rulerPalette({ bg: '#1e1e1e', fg: '#d4d4d4', dark: true })
const LH = 20

function make(doc: string, opts: { clientHeight?: number, fold?: boolean, setup?: (view: EditorView) => void } = {}) {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const view = new EditorView({
        state: EditorState.create({ doc, extensions: opts.fold ? [foldField] : [] }),
        parent: host,
        decorationProviders: opts.fold ? [foldDecorations] : [],
    })
    const ch = opts.clientHeight ?? 400
    Object.defineProperty(view.scrollDOM, 'clientHeight', { configurable: true, get: () => ch })
    let scrollTop = 0
    Object.defineProperty(view.scrollDOM, 'scrollTop', { configurable: true, get: () => scrollTop, set: v => { scrollTop = v } })
    Object.defineProperty(view.scrollDOM, 'scrollHeight', { configurable: true, get: () => view.metrics.height })
    Object.defineProperty(view.contentDOM.ownerDocument.defaultView!.HTMLElement.prototype, 'offsetHeight', {
        configurable: true,
        get() { return (this as HTMLElement).classList?.contains('cm-line') ? LH : 0 },
    })
    view.oracle.lineHeight = LH
    view.resetHeights()
    view.remeasure()
    opts.setup?.(view)
    const off = minimapCM7(hl, { lang: 'typescript', theme: 'dark-plus' }, palette)(view)
    const wrap = view.dom.querySelector('.cm-minimap') as HTMLElement
    const canvas = wrap.querySelector('canvas:not(.cm-minimap-hl)') as HTMLCanvasElement
    const hlCanvas = wrap.querySelector('canvas.cm-minimap-hl') as HTMLCanvasElement
    const done = () => { off(); view.destroy(); host.remove() }
    return { view, wrap, canvas, hlCanvas, done }
}
const screenOf = (cv: HTMLCanvasElement) => ctxs.get(cv)!.screen
const rectsOf = (cv: HTMLCanvasElement) => ctxs.get(cv)!.rects
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// —— Monaco 0.52 参考实现(抄自 minimap.js InnerMinimap._renderLine + minimapCharSheet.getCharIndex
//    + strings.isFullWidthCharacter),只算 alpha:dpr 1 → 字宽 1、字高 2 device px,左缘 MINIMAP_GUTTER ——
const monacoFullWidth = (c: number) => (c >= 0x2E80 && c <= 0xD7AF) || (c >= 0xF900 && c <= 0xFAFF) || (c >= 0xFF01 && c <= 0xFF5E)
const monacoCharIndex = (code: number, fontScale: number) => {
    code -= 32
    if (code < 0 || code > 96) return fontScale <= 2 ? (code + 96) % 96 : 95
    return code
}
/** 一行在 minimap 上的 alpha 图(高 2、宽 canvasW),按 Monaco 规则画 */
function monacoRow(text: string, canvasW: number, tabSize = 4): Uint8ClampedArray {
    const g = glyphInk(1)!
    const per = g.cw * g.ch
    const out = new Uint8ClampedArray(canvasW * g.ch)
    // 本实现的墨量表从 '!'(33)起:Monaco 下标 i(从 ' ' 32 起)→ 格 i − 1;i = 0 是空格(无墨)
    const put = (dx: number, idx: number) => {
        if (idx <= 0 || idx > 95) return
        for (let y = 0; y < g.ch; y++) for (let x = 0; x < g.cw; x++) out[y * canvasW + dx + x] = g.ink[(idx - 1) * per + y * g.cw + x]
    }
    const maxDx = canvasW - g.cw
    let dx = GLYPH.GUTTER, tabsCharDelta = 0
    for (let i = 0; i < text.length; i++) {
        if (dx > maxDx) break
        const code = text.charCodeAt(i)
        if (code === 9) {
            const ins = tabSize - (i + tabsCharDelta) % tabSize
            tabsCharDelta += ins - 1
            dx += ins * g.cw
        } else if (code === 32) dx += g.cw
        else {
            const count = monacoFullWidth(code) ? 2 : 1
            let stop = false
            for (let k = 0; k < count; k++) {
                put(dx, monacoCharIndex(code, 1))
                dx += g.cw
                if (dx > maxDx) { stop = true; break }
            }
            if (stop) break
        }
    }
    return out
}
/** lite-monaco 画出来的第 row 个 minimap 行(dpr 1:device y = 2·row, 2·row+1)的 alpha 图 */
function litRow(cv: HTMLCanvasElement, row: number): Uint8ClampedArray {
    const s = screenOf(cv), w = cv.width
    const out = new Uint8ClampedArray(w * 2)
    for (let y = 0; y < 2; y++) for (let x = 0; x < w; x++) out[y * w + x] = s[((row * 2 + y) * w + x) * 4 + 3]
    return out
}

describe('minimap 非 ASCII 字形(Monaco renderChar + isFullWidthCharacter)', () => {
    it('isFullWidthCharacter 同 Monaco 的三段区间', () => {
        for (const c of [0x2E80, 0x4E2D, 0x3042, 0xAC00, 0xD7AF, 0xF900, 0xFAFF, 0xFF01, 0xFF5E]) expect(isFullWidthCharacter(c), c.toString(16)).toBe(true)
        for (const c of [0x41, 0xE9, 0x2E7F, 0xD7B0, 0xD83D, 0xDE00, 0xE000, 0xFE0F, 0xFF5F, 0xFF65]) expect(isFullWidthCharacter(c), c.toString(16)).toBe(false)
    })
    it('visualColumns:全角占 2 列;tab stop 按 Monaco(全角只算 1 列)', () => {
        expect([...visualColumns('中a', 4)!]).toEqual([0, 2, 3])
        // '\t中\tX':tab→4,中 4..6,第二个 tab:Monaco (charIndex 2 + delta 3) % 4 = 1 → 补 3 → X 在 9
        expect([...visualColumns('\t中\tX', 4)!]).toEqual([0, 4, 6, 9, 10])
        expect(visualColumns('😀é', 4)).toBeNull() // 代理对 / 组合字符:每个 UTF-16 码元 1 列,不需要映射
    })
    const lines = [
        'const a = "中文字符" + XX',
        'let e = "😀😀" + XX',
        'let c = "e\u0301e\u0301" + XX',
        '\t中\tXX',
        'let f = "ＡＢＣ" + XX',
        'let k = "한국어" + XX',
        'let z = "\u0001\u007f\u0080" + XX',
        'plain ascii line + XX',
        '中'.repeat(70),
    ]
    it('逐像素等于 Monaco _renderLine:CJK 两格、emoji 每码元一格、组合字符一格、tab 后列、截断', async () => {
        const { canvas, done } = make(lines.join('\n'))
        await sleep(250) // 首帧不画字形(create 里省掉这笔),首帧之后补上
        expect(canvas.width).toBeGreaterThan(0)
        for (let i = 0; i < lines.length; i++) {
            const want = monacoRow(lines[i], canvas.width)
            expect([...litRow(canvas, i)], `第 ${i + 1} 行 ${JSON.stringify(lines[i])}`).toEqual([...want])
        }
        done()
    })
    it('同词带的 x 按全角两格算', () => {
        const { view, hlCanvas, done } = make('中文 foo\nfoo')
        // Monaco WordHighlighter 只认有焦点时用户挤光标(CursorChangeReason.Explicit);程序设选区不亮(第五轮改)
        view.contentDOM.focus()
        view.dispatch(view.state.update({ selection: EditorSelection.cursor(view.state.doc.line(2).from + 1), userEvent: 'select' }))
        // 不透明的那一段 = 命中的列(另有一条 50% 的整行行底,从 x = 8 起,同 Monaco renderDecorations 第 2 步)
        const band = rectsOf(hlCanvas).find(r => r.style === palette.wordHighlight && r.y === 0 && r.alpha === 1)!
        expect(band, '第 1 行的同词带').toBeTruthy()
        // '中文 ' = 2×2 + 1 = 5 列
        expect(band.x).toBe(GLYPH.GUTTER + 5)
        done()
    })
})

describe('不折行时 minimap 按可见行画(Monaco 按 view line)', () => {
    // 1 行头 + 100 行缩进体(折叠藏掉)+ 99 行尾
    const doc = ['function f() {', ...Array.from({ length: 100 }, (_, i) => `    body${i}`), ...Array.from({ length: 99 }, (_, i) => `tail${i}`)].join('\n')
    const fold = (view: EditorView) => {
        view.dispatch(view.state.update({ selection: EditorSelection.cursor(0) }))
        expect(foldCode({ state: view.state, dispatch: tr => view.dispatch(tr) })).toBe(true)
    }
    it('折叠后折叠体不画,后面的行上移', async () => {
        const { view, canvas, done } = make(doc, { fold: true, clientHeight: 400 })
        expect(ctxs.get(canvas)?.rects.length ?? 0, '首帧之前不画字形').toBe(0)
        expect(ctxs.get(canvas)?.screen?.some(v => v !== 0) ?? false, '首帧之前不画字形').toBe(false)
        await sleep(250)
        expect([...litRow(canvas, 1)]).toEqual([...monacoRow('    body0', canvas.width)])
        fold(view)
        await sleep(80)
        // 可见行:第 1 行、tail0..(body 全藏)
        const visible = Math.round(view.heightMap.height / LH)
        expect(visible).toBe(100)
        expect([...litRow(canvas, 0)]).toEqual([...monacoRow('function f() {', canvas.width)])
        expect([...litRow(canvas, 1)], '第 2 个 minimap 行 = tail0').toEqual([...monacoRow('tail0', canvas.width)])
        expect([...litRow(canvas, 5)]).toEqual([...monacoRow('tail4', canvas.width)])
        done()
    })
    it('选区 / 同词带落在可见行号上', async () => {
        const { view, hlCanvas, done } = make(doc, { fold: true, clientHeight: 400 })
        fold(view)
        await sleep(80)
        // 选中 tail3(doc 第 105 行)→ minimap 第 5 行(y = 4×2 = 8)。Monaco 空选区不画选区块(renderDecorations 只画
        // [首行, 末行) 的行底 + 选中的列),所以这里用非空选区;同词带要有焦点 + 用户选择(第五轮改)
        const l105 = view.state.doc.line(105).from
        view.contentDOM.focus()
        view.dispatch(view.state.update({ selection: EditorSelection.range(l105, l105 + 5), userEvent: 'select' }))
        const sel = rectsOf(hlCanvas).find(r => r.style === palette.minimapSelection && r.alpha === 1)!
        expect(sel.y).toBe(8)
        const band = rectsOf(hlCanvas).find(r => r.style === palette.wordHighlight && r.alpha === 1)!
        expect(band.y).toBe(8)
        done()
    })
    it('点击 minimap:点中的可见行滚到视口中间;滑块按折叠后的行数算 minimap 滚动', async () => {
        const { view, wrap, done } = make(doc, { fold: true, clientHeight: 100 })
        fold(view)
        await sleep(80)
        // 点 y=21 → minimap 第 10 行 = tail9(doc 第 111 行),行顶 = 10×20 = 200 → scrollTop = 200 − 50
        wrap.dispatchEvent(new PointerEvent('pointerdown', { clientY: 21, bubbles: true }))
        window.dispatchEvent(new PointerEvent('pointerup', {}))
        expect(view.scrollDOM.scrollTop).toBe(150)
        // 滑块 = Monaco MinimapLayout(可见行 100,minimap 放得下 50 行 → 按整行滚):
        //   sliderHeight = floor(100 / 20 × 2) = 10,maxSliderTop = min(100 − 10, 200 − 10) = 90,
        //   理想 top = 150 × 90 / (2000 − 100) = 7.105;视口首行 8(行内 0.5),minimap 首行 = floor(8 − 7.105 / 2) = 4
        //   → top = (8 − 4 + 0.5) × 2 = 9(旧断言 7.105 是连续律,不是 Monaco;实测见 /tmp/lc-hunt/r5/N/slider.ts 折叠用例)
        view.scrollDOM.dispatchEvent(new Event('scroll'))
        const slider = wrap.querySelector('.cm-minimap-slider') as HTMLElement
        expect(view.metrics.height).toBe(2000)
        expect(slider.style.height).toBe('10px')
        expect(slider.style.top).toBe('9px')
        done()
    })
})

describe('查找框右偏移跟 minimap 宽(Monaco overlayWidgets:right = 2 × 竖条宽 + minimapWidth)', () => {
    it('minimap 把算出的面板宽写成 .cm-editor 上的 --cm-minimap-w,各实例互不影响,卸载即清', () => {
        const a = make('a')
        const b = make('b', {
            setup: v => {
                Object.defineProperty(v.dom, 'clientWidth', { configurable: true, get: () => 516 })
                v.oracle.charWidth = 7.8267952127659575
                v.dom.getBoundingClientRect = () => ({ left: 0, top: 0, right: 516, bottom: 400, width: 516, height: 400, x: 0, y: 0, toJSON() {} }) as DOMRect
                v.scrollDOM.getBoundingClientRect = () => ({ left: 65, top: 0, right: 445, bottom: 400, width: 380, height: 400, x: 65, y: 0, toJSON() {} }) as DOMRect
            },
        })
        expect(b.wrap.style.width).toBe('57px')
        expect(b.view.dom.style.getPropertyValue('--cm-minimap-w')).toBe('57px')
        const wa = a.view.dom.style.getPropertyValue('--cm-minimap-w')
        expect(wa).toBe(a.wrap.style.width)
        expect(a.wrap.style.width).toBeTruthy()
        a.done()
        expect(a.view.dom.style.getPropertyValue('--cm-minimap-w')).toBe('')
        expect(b.view.dom.style.getPropertyValue('--cm-minimap-w')).toBe(b.wrap.style.width)
        b.done()
    })
    it('CSS:right 用 calc(--cm-minimap-w + 28px),不再写死 112 / 32', () => {
        const css = liteMonacoBaseCSS()
        expect(css).not.toMatch(/\.cm-find-widget \{ right: 112px; \}/)
        expect(css).not.toMatch(/\.cm-find-widget \{ right: 32px; \}/)
        expect(css).toMatch(/\.cm-editor:has\(> \.cm-scrollbar\) \.cm-find-widget \{ right: calc\(var\(--cm-minimap-w, 0px\) \+ 28px\); \}/)
    })
})
