// F2 几何测量修复 —— 坐标 ↔ 位置、行高/字宽度量、heightMap 重估、横条、折行。
//
// jsdom 无布局:按「等宽网格」桩出几何——每个 .cm-line 盒高 LH、每字符宽 CW,行 n(1 起)顶 = 内容顶 + (n-1)×LH,
// 内容顶 = 视口顶 − scrollTop(真浏览器里 contentDOM 盒顶随滚动上移,padding-top 就是虚拟化顶部占位)。
// 折行桩:每 WRAP 个字符折一行(视觉行 r 顶 = 行顶 + r×LH,x 从行首重新起)。
// 浏览器里的同款验证见 /tmp/lc-hunt/f2/*.ts(对照 Monaco)。

import { afterEach, describe, expect, it } from 'vitest'
import { EditorView } from '../../src/core/view/editorview'
import { EditorState } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'
import { LineWidthMap, LineWidthOracle } from '../../src/core/view/linewidthmap'
import { Rope } from '../../src/core/model/rope'
import { buildDefaultKeymap } from '../../src/core/edit/keymap'
import { RangeSet } from '../../src/core/model/rangeset'

const LH = 19.5
const CW = 7.8
const VIEW_TOP = 50
const VIEW_LEFT = 30
const VIEW_H = 400
const VIEW_W = 600

const restores: (() => void)[] = []
afterEach(() => {
    while (restores.length) restores.pop()!()
    document.body.innerHTML = ''
    document.head.querySelectorAll('style[data-f2]').forEach(s => s.remove())
})

// 覆写属性(值或 getter/setter),afterEach 按原描述符还原(原型上没有自有属性的就删掉)。
function override(obj: object, key: string, desc: PropertyDescriptor) {
    const prev = Object.getOwnPropertyDescriptor(obj, key)
    Object.defineProperty(obj, key, { configurable: true, ...desc })
    restores.push(() => {
        if (prev) Object.defineProperty(obj, key, prev)
        else delete (obj as Record<string, unknown>)[key]
    })
}
const patch = (obj: object, key: string, value: unknown) => override(obj, key, { writable: true, value })

function rect(left: number, top: number, width: number, height: number): DOMRect {
    return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() { return this } } as DOMRect
}

interface Geo { view: () => EditorView | null, scrollTop: number, wrap: number, hidden: boolean, chrome: boolean }

// 安装网格几何桩。必须在 new EditorView 之前装(构造时就量文本度量)。
// chrome:模拟 Chrome 在软折行点的两个怪癖——折行点上的折叠 range 画在上一视觉行末尾(上游侧);
// 以折行点起头的非折叠 range 先吐一个上一视觉行末尾的零宽 rect,再是下一视觉行的真 rect。
function installGrid(opts: { wrap?: number, hidden?: boolean, padding?: boolean, chrome?: boolean } = {}): Geo {
    const geo: Geo = { view: () => null, scrollTop: 0, wrap: opts.wrap ?? 0, hidden: opts.hidden ?? false, chrome: opts.chrome ?? false }
    if (opts.padding) {
        const st = document.createElement('style')
        st.setAttribute('data-f2', '')
        st.textContent = '.cm-line { padding: 0 8px; }'
        document.head.appendChild(st)
    }
    const pad = opts.padding ? 8 : 0
    const contentTop = () => VIEW_TOP - geo.scrollTop
    const rowsOf = (len: number) => geo.wrap ? Math.max(1, Math.ceil(len / geo.wrap)) : 1
    // 行 n 的屏上顶(按 heightMap 同样的网格累加:折行时前面行各占 rowsOf 行)
    const lineTop = (v: EditorView, n: number) => {
        let rows = 0
        for (let i = 1; i < n; i++) rows += rowsOf(v.state.doc.line(i).length)
        return contentTop() + rows * LH
    }
    // 位置 → 屏上 caret(side<0:软折行点取上一视觉行末尾)
    const caretAt = (v: EditorView, pos: number, side = 0) => {
        const line = v.state.doc.lineAt(pos)
        const col = pos - line.from
        let row = 0, x = col
        if (geo.wrap) {
            row = Math.floor(col / geo.wrap)
            if (side < 0 && col > 0 && col % geo.wrap === 0) row--
            row = Math.min(row, rowsOf(line.length) - 1)
            x = col - row * geo.wrap
        }
        const left = VIEW_LEFT + pad + x * CW
        const top = lineTop(v, line.number) + row * LH + (LH - 15) / 2
        return rect(left, top, 0, 15)
    }
    const P = HTMLElement.prototype
    const origBox = P.getBoundingClientRect
    patch(P, 'getBoundingClientRect', function (this: HTMLElement) {
        const v = geo.view()
        if (geo.hidden) return rect(0, 0, 0, 0)
        if (this.classList.contains('cm-line')) {
            if (this.getAttribute('aria-hidden') === 'true') return rect(0, 0, 300, LH) // 文本探针
            if (!v) return rect(0, 0, 0, 0)
            const i = Array.from(v.contentDOM.children).indexOf(this)
            if (i < 0) return rect(0, 0, 0, 0)
            const n = v.viewportStartLine + i
            return rect(VIEW_LEFT, lineTop(v, n), VIEW_W, rowsOf(v.state.doc.line(n).length) * LH)
        }
        if (this.classList.contains('cm-scroller')) return rect(VIEW_LEFT, VIEW_TOP, VIEW_W, VIEW_H)
        if (this.classList.contains('cm-content')) return rect(VIEW_LEFT, contentTop(), VIEW_W, v ? v.heightMap.height : 0)
        return origBox.call(this)
    } as typeof P.getBoundingClientRect)
    const R = Range.prototype as Range & Record<string, unknown>
    patch(R, 'getBoundingClientRect', function (this: Range) {
        if (geo.hidden) return rect(0, 0, 0, 0)
        const len = this.toString().length
        return rect(0, 0, len * CW, 15)
    } as Range['getBoundingClientRect'])
    patch(R, 'getClientRects', function (this: Range) {
        const v = geo.view()
        if (!v || geo.hidden) return { length: 0, item: () => null } as unknown as DOMRectList
        const a = v.posFromDOM(this.startContainer, this.startOffset)
        const col = a - v.state.doc.lineAt(a).from
        const atWrap = geo.chrome && geo.wrap > 0 && col > 0 && col % geo.wrap === 0
        let rec: DOMRect
        if (this.collapsed) rec = caretAt(v, a, atWrap ? -1 : 0)
        else if (atWrap) {
            const ghost = caretAt(v, a, -1), b = v.posFromDOM(this.endContainer, this.endOffset)
            const s = caretAt(v, a, 1), e = caretAt(v, b, -1)
            const r1 = rect(s.left, s.top, e.left - s.left, 15)
            return { 0: ghost, 1: r1, length: 2, item: (i: number) => [ghost, r1][i] ?? null } as unknown as DOMRectList
        }
        else {
            const b = v.posFromDOM(this.endContainer, this.endOffset)
            const s = caretAt(v, a, 1), e = caretAt(v, b, -1)
            // 跨软折行点 → 两个 rect(首 rect 在起点行,末 rect 在终点行,right = 终点 x)
            if (s.top === e.top) rec = rect(s.left, s.top, e.left - s.left, 15)
            else {
                const r0 = rect(s.left, s.top, 0, 15), r1 = rect(e.left, e.top, 0, 15)
                return { 0: r0, 1: r1, length: 2, item: (i: number) => [r0, r1][i] ?? null } as unknown as DOMRectList
            }
        }
        return { 0: rec, length: 1, item: (i: number) => i === 0 ? rec : null } as unknown as DOMRectList
    } as Range['getClientRects'])
    const scroller = (el: HTMLElement) => !geo.hidden && el.classList.contains('cm-scroller')
    override(P, 'clientHeight', { get(this: HTMLElement) { return scroller(this) ? VIEW_H : 0 } })
    override(P, 'clientWidth', { get(this: HTMLElement) { return scroller(this) ? VIEW_W : 0 } })
    override(P, 'scrollTop', {
        get(this: HTMLElement) { return this.classList.contains('cm-scroller') ? geo.scrollTop : 0 },
        set(this: HTMLElement, x: number) { if (this.classList.contains('cm-scroller')) geo.scrollTop = Math.max(0, x) },
    })
    return geo
}

function mount(geo: Geo, doc: string, extra: Partial<ConstructorParameters<typeof EditorView>[0]> = {}): EditorView {
    const host = document.createElement('div')
    document.body.appendChild(host)
    let view: EditorView | null = null
    geo.view = () => view
    // 构造期间 geo.view() 还是 null:行盒还量不到(按 children 下标定位);构造完挂上再量一遍视口(等价 RO 首帧)。
    view = new EditorView({ state: EditorState.create({ doc }), parent: host, ...extra })
    view.remeasure()
    return view
}

const lines = (n: number, f = (i: number) => `const v${i} = ${i} // line ${i}`) =>
    Array.from({ length: n }, (_, i) => f(i + 1)).join('\n')

describe('#1 滚动后点击:posAtCoords 不再多减虚拟化 padding-top', () => {
    it('scrollTop=2000 点视口内第 k 行 → 落到那一行', () => {
        const geo = installGrid()
        const view = mount(geo, lines(400))
        view.scrollDOM.scrollTop = 2000
        view.remeasure()
        expect(parseFloat(view.contentDOM.style.paddingTop)).toBeGreaterThan(0) // 确实虚拟化了
        // 屏上 y = VIEW_TOP + 205 → 内容 y = 2205 → 第 floor(2205/19.5)+1 = 114 行
        const pos = view.posAtCoords({ x: VIEW_LEFT + 3 * CW + 1, y: VIEW_TOP + 205 })!
        const want = Math.floor(2205 / LH) + 1
        expect(view.state.doc.lineAt(pos).number).toBe(want)
        expect(pos - view.state.doc.line(want).from).toBe(3)
    })
})

describe('#2 小数行高:heightMap / gutter 按 19.5 累计,不按取整的 20', () => {
    it('探针量出 lineHeight=19.5,heightMap 全文 = 行数×19.5,第 20 行点击不偏', () => {
        const geo = installGrid()
        const view = mount(geo, lines(400), { lineNumbers: true })
        expect(view.oracle.lineHeight).toBeCloseTo(LH, 5)
        expect(view.heightMap.height).toBeCloseTo(400 * LH, 3)
        // 第 20 行(视口 400px 内,顶 = 19×19.5 = 370.5,取整累计会错到 380)
        const g = view.dom.querySelectorAll('.cm-gutterElement')[19] as HTMLElement
        expect(parseFloat(g.style.height)).toBeCloseTo(LH, 5)
        const y = VIEW_TOP + 19 * LH + LH / 2
        expect(view.state.doc.lineAt(view.posAtCoords({ x: VIEW_LEFT + 5, y })!).number).toBe(20)
    })
})

describe('#3 emoji:点击落点对齐字素簇边界', () => {
    it('点 emoji 右半偏左处 → 不落进代理对中间', () => {
        const geo = installGrid()
        const text = "let e = '😀😃 emoji'"
        const view = mount(geo, text)
        const at = (col: number) => VIEW_LEFT + col * CW
        // 😀 占 offset 9..11;offset 10 是代理对中间。点在 10 与 11 之间偏 10 侧(旧二分会落 10)。
        for (const x of [at(9) + 0.2 * CW, at(9) + 0.7 * CW, at(10) + 0.3 * CW, at(10) + 0.6 * CW, at(11) - 0.1]) {
            const pos = view.posAtCoords({ x, y: VIEW_TOP + 5 })!
            expect([9, 11]).toContain(pos)
        }
    })
})

describe('#4 heightMap 重估:量到真实行高后所有未测块按新行高估', () => {
    it('无探针(jsdom 退化)时,视口众数行高变了 → 视口外块也按新高重估', () => {
        const host = document.createElement('div')
        document.body.appendChild(host)
        const view = new EditorView({ state: EditorState.create({ doc: lines(2000) }), parent: host })
        Object.defineProperty(view.scrollDOM, 'clientHeight', { configurable: true, get: () => 400 })
        let lh = 14
        override(HTMLElement.prototype, 'offsetHeight', {
            get(this: HTMLElement) { return this.classList?.contains('cm-line') ? lh : 0 },
        })
        view.resetHeights()
        view.remeasure()
        expect(view.heightMap.height).toBeCloseTo(2000 * 14, 3)
        // 行高 14 → 20(字号变大):视口里实测 20,视口外已按 14 估的块必须跟着重估
        lh = 20
        view.remeasure()
        expect(view.oracle.lineHeight).toBe(20)
        expect(view.heightMap.height).toBeCloseTo(2000 * 20, 3)
    })

    it('有探针:构造时先量行高再建 heightMap,5 万行 scrollTop 到底 = 末行', () => {
        const geo = installGrid()
        const view = mount(geo, lines(50000))
        expect(view.heightMap.height).toBeCloseTo(50000 * LH, 1)
        geo.scrollTop = view.heightMap.height - VIEW_H
        view.remeasure()
        const last = view.posAtCoords({ x: VIEW_LEFT + 2, y: VIEW_TOP + VIEW_H - 2 })!
        expect(view.state.doc.lineAt(last).number).toBe(50000)
    })
})

describe('#5 charWidth 一次可靠测量,contentWidth 来自行宽表、不随滚动漂', () => {
    it('charWidth = 探针字宽(不把 16px 行 padding 算进去),oracle 与 lineWidthOracle 一致', () => {
        const geo = installGrid({ padding: true })
        const view = mount(geo, lines(300))
        expect(view.lineWidthOracle.charWidth).toBeCloseTo(CW, 5)
        expect(view.oracle.charWidth).toBeCloseTo(CW, 5) // 列选拖过行尾(#11)用的就是它
        const cw0 = view.lineWidthMap.contentWidth()
        for (const st of [1500, 3000, 4500, 0]) {
            geo.scrollTop = st
            view.remeasure()
            expect(view.lineWidthOracle.charWidth).toBeCloseTo(CW, 5)
            expect(view.lineWidthMap.contentWidth()).toBe(cw0)
        }
        // 最长行 "const v300 = 300 // line 300"(28 字)+ 左 padding 8(右 padding 不算,Monaco maxLineWidth 只到文字末尾)
        // + Monaco scrollBeyondLastColumn 4 字,取整
        expect(cw0).toBe(Math.floor(Math.ceil(28 * CW + 8) + 4 * CW))
    })
})

describe('#6 display:none 里挂载,显示后恢复', () => {
    it('隐藏时不把 0 高写进 heightMap;显示后 measureGeometry 虚拟化 + 行号 + 行高正确', () => {
        const geo = installGrid({ hidden: true })
        const view = mount(geo, lines(5000), { lineNumbers: true })
        expect(view.heightMap.height).toBeGreaterThan(0)
        // 隐藏时不整份物化 5000 行(真浏览器 clientHeight=0 也走无布局分支)
        expect(view.contentDOM.children.length).toBeLessThanOrEqual(2000)
        geo.hidden = false
        view.measureGeometry()
        expect(view.oracle.lineHeight).toBeCloseTo(LH, 5)
        expect(view.heightMap.height).toBeCloseTo(5000 * LH, 1)
        expect(view.contentDOM.children.length).toBeLessThan(200)
        const g = view.dom.querySelectorAll('.cm-gutterElement')
        expect(g.length).toBe(view.contentDOM.children.length)
        expect(parseFloat((g[0] as HTMLElement).style.height)).toBeCloseTo(LH, 5)
    }, 15_000) // 挂 5000 行,满载时单跑也会过 5s
})

describe('#7 字号变化后重测(不等用户滚动)', () => {
    it('探针行高变了 → measureGeometry 重估 heightMap、gutter 行高跟上', () => {
        const geo = installGrid()
        const view = mount(geo, lines(500), { lineNumbers: true })
        expect(view.heightMap.height).toBeCloseTo(500 * LH, 1)
        // 模拟字号 13→18:行高 19.5→27。改桩里所有 .cm-line 的盒高。
        const P = HTMLElement.prototype
        const cur = P.getBoundingClientRect
        patch(P, 'getBoundingClientRect', function (this: HTMLElement) {
            const r = cur.call(this)
            return this.classList.contains('cm-line') ? rect(r.left, VIEW_TOP + (r.top - VIEW_TOP) / LH * 27, r.width, r.height / LH * 27) : r
        } as typeof P.getBoundingClientRect)
        view.measureGeometry()
        expect(view.oracle.lineHeight).toBeCloseTo(27, 5)
        expect(view.heightMap.height).toBeCloseTo(500 * 27, 1)
        const g = view.dom.querySelector('.cm-gutterElement') as HTMLElement
        expect(parseFloat(g.style.height)).toBeCloseTo(27, 5)
    })
})

describe('#8 scrollIntoView 扣横向滚动条', () => {
    it('横条可见时,⌘↓ 到末行 → 末行底停在横条上方;scrollHeight 多垫横条高', () => {
        const geo = installGrid()
        const long = lines(100, i => i === 50 ? 'x'.repeat(300) : `line ${i}`)
        const view = mount(geo, long)
        const bar = document.createElement('div')
        bar.className = 'cm-hscrollbar'
        bar.style.height = '14px'
        view.dom.appendChild(bar)
        expect(view.lineWidthMap.contentWidth()).toBeGreaterThan(VIEW_W)
        const end = view.state.doc.length
        view.dispatch(view.state.update({ selection: EditorSelection.single(end), scrollIntoView: true }))
        expect(view.scrollDOM.scrollTop).toBeCloseTo(100 * LH - (VIEW_H - 14), 3)
        view.remeasure()
        const padBottom = parseFloat(view.contentDOM.style.paddingBottom)
        const lastChildBottom = view.lineBlockAt(end).bottom
        expect(padBottom - (view.heightMap.height - lastChildBottom)).toBeCloseTo(14, 3)
        // 竖条 / minimap 按 metrics.height 算最大滚动:也得含这 14px,否则拖 thumb 到底差一截
        expect(view.metrics.height).toBeCloseTo(view.heightMap.height + 14, 3)
    })

    it('算底部垫高不读布局(applyViewportShift 删插行半途调用,回流会让浏览器钳 scrollTop)', () => {
        const geo = installGrid()
        const view = mount(geo, lines(100, i => i === 50 ? 'x'.repeat(300) : `line ${i}`))
        const bar = document.createElement('div')
        bar.className = 'cm-hscrollbar'
        bar.style.height = '14px'
        view.dom.appendChild(bar)
        view.measureGeometry()
        let reads = 0
        const P = HTMLElement.prototype
        const cw = Object.getOwnPropertyDescriptor(P, 'clientWidth')!
        override(P, 'clientWidth', { get(this: HTMLElement) { reads++; return cw.get!.call(this) } })
        const { bottomPad } = (view as unknown as { viewportPadding(): { bottomPad: number } }).viewportPadding()
        expect(reads).toBe(0)
        expect(bottomPad).toBeGreaterThanOrEqual(14)
    })
})

// G2 #6:applyViewportShift 以前先删行、最后才 updatePadding。删行那一刻内容总高变矮,
// 中途有任何回流(插行时量宽 / 扩展读布局)浏览器就把 scrollTop 钳下来,滚到底时视口往回跳。
// 现在:先物化新行、插进去、设好新 padding,最后才删出视口的行 —— 每一步内容总高都 ≥ 最终总高。
describe('G2-6 applyViewportShift:换窗途中内容总高不缩水', () => {
    for (const [name, from, to] of [['往下滚(删头补尾)', 2000, 2100], ['往上滚(删尾补头)', 2100, 2000], ['滚到底', 7000, 400 * LH - VIEW_H]] as const) {
        it(name, () => {
            const geo = installGrid()
            const view = mount(geo, lines(400))
            geo.scrollTop = from
            view.remeasure()
            const total = () => parseFloat(view.contentDOM.style.paddingTop || '0') + parseFloat(view.contentDOM.style.paddingBottom || '0')
                + view.contentDOM.querySelectorAll(':scope > .cm-line').length * LH
            const final = view.heightMap.height
            let removed = 0
            let minTotal = Infinity
            const P = Element.prototype
            const rm = P.remove
            override(P, 'remove', {
                value(this: Element) {
                    const mine = this.parentNode === view.contentDOM
                    rm.call(this)
                    if (mine) { removed++; minTotal = Math.min(minTotal, total()) }
                },
            })
            geo.scrollTop = to
            view.remeasure()
            expect(removed).toBeGreaterThan(0) // 确实走了增量换窗(不是整窗重画)
            expect(minTotal).toBeGreaterThanOrEqual(final - 0.5)
            expect(total()).toBeCloseTo(final, 1)
        })
    }
})

// G2 #7:2 万行粘贴进视口,clampViewportToDoc 把旧视口 to 映射到插入末尾 → decos()(shiki 等)按 2 万行的「视口」
// 去分词,真页 600ms+(/tmp/lc-hunt/c-input/paste-prof.ts N=20000)。装饰源只该被要视口邻域。
describe('G2-7 长粘贴:装饰源只拿到视口大小的范围', () => {
    it('第 10 行粘 2 万行:粘贴事务里装饰源见到的视口 ≤ 几百行;粘完视口照常虚拟化', () => {
        const geo = installGrid()
        let widest = 0
        let recording = false
        const spy = (state: EditorState, view?: EditorView) => {
            if (recording && view) {
                const vp = view.viewport
                widest = Math.max(widest, state.doc.lineAt(Math.min(vp.to, state.doc.length)).number - state.doc.lineAt(vp.from).number + 1)
            }
            return RangeSet.empty as never
        }
        const view = mount(geo, lines(200), { decorationProviders: [spy] })
        const at = view.state.doc.line(10).from
        const big = Array.from({ length: 20000 }, (_, i) => `const p${i} = ${i}`).join('\n') + '\n'
        recording = true
        view.dispatch(view.state.update({ changes: { from: at, insert: big }, selection: EditorSelection.cursor(at + big.length), scrollIntoView: true }))
        recording = false
        expect(view.state.doc.lines).toBe(20200)
        expect(widest).toBeGreaterThan(0)
        expect(widest).toBeLessThan(500)
        expect(view.contentDOM.querySelectorAll(':scope > .cm-line').length).toBeLessThan(200)
        // scrollIntoView 改了 scrollTop;jsdom 不发 scroll 事件,手动量一次(等价 onScroll)→ 视口换到光标处
        view.remeasure()
        const head = view.state.selection.main.head
        expect(head >= view.viewport.from && head <= view.viewport.to).toBe(true)
    })

    it('短粘贴(30 行)不受上限影响:变更行在视口里照常增量物化', () => {
        const geo = installGrid()
        const view = mount(geo, lines(200))
        const at = view.state.doc.line(5).from
        view.dispatch(view.state.update({ changes: { from: at, insert: 'x\n'.repeat(30) } }))
        const first = view.contentDOM.querySelector(':scope > .cm-line') as HTMLElement
        expect(first.textContent).toBe('const v1 = 1 // line 1')
        expect(view.state.doc.line(5).text).toBe('x')
        expect(view.viewport.from).toBe(0)
    })
})

describe('#9 折行几何', () => {
    const WRAP = 20
    it('点第 2 个视觉行 → 落在第 2 个视觉行(二分先比行再比 x)', () => {
        const geo = installGrid({ wrap: WRAP })
        const view = mount(geo, 'short\n' + 'abcdefghij'.repeat(5) + '\nend', { lineWrapping: true })
        const l2 = view.state.doc.line(2)
        // 第 2 行顶 = VIEW_TOP + LH;其第 2 视觉行 = +LH;点 x=第 3 列
        const pos = view.posAtCoords({ x: VIEW_LEFT + 3 * CW + 1, y: VIEW_TOP + 2 * LH + LH / 2 })!
        expect(pos - l2.from).toBe(WRAP + 3)
    })

    it('视觉行首/尾 + 按视觉行上下移(给 Home/End/↑/↓ 命令用)', () => {
        const geo = installGrid({ wrap: WRAP })
        const view = mount(geo, 'abcdefghij'.repeat(5) + '\nnext', { lineWrapping: true })
        // 光标在第 1 视觉行第 5 列 → End 到第 1 视觉行末尾(软折行点,assoc=-1),Home 回 0
        expect(view.moveToLineBoundary(5, true)).toEqual({ pos: WRAP, assoc: -1 })
        expect(view.moveToLineBoundary(5, false).pos).toBe(0)
        // 第 2 视觉行 → Home = 视觉行首
        expect(view.moveToLineBoundary(WRAP + 5, false)).toEqual({ pos: WRAP, assoc: 1 })
        // 末视觉行 End = 逻辑行尾
        expect(view.moveToLineBoundary(45, true)).toEqual({ pos: 50, assoc: 0 })
        // ↓:第 1 视觉行第 5 列 → 第 2 视觉行第 5 列(同一逻辑行)
        const d = view.moveVertically(5, true)!
        expect(d.pos).toBe(WRAP + 5)
        const d2 = view.moveVertically(d.pos, true, d.goalX)!
        expect(d2.pos).toBe(2 * WRAP + 5)
        // 再 ↓ 到下一逻辑行同 x
        const d3 = view.moveVertically(d2.pos, true, d2.goalX)!
        expect(d3.pos).toBe(view.state.doc.line(2).from + 4) // "next" 只有 4 字,钳到行尾
        expect(view.moveVertically(d.pos, false, d.goalX)!.pos).toBe(5)
    })

    it('折行时 contentWidth=0:不出横条,contentDOM 不被 min-width 撑宽(容器变窄能重折)', () => {
        const o = new LineWidthOracle(true)
        o.setDoc(Rope.of(['x'.repeat(500)]))
        const m = new LineWidthMap(o)
        m.seedEstimate()
        m.measureViewport([{ lineNumber: 1, width: 900 }])
        expect(m.contentWidth()).toBe(0)
    })

    it('容器变窄 → 重新折行估高(measureGeometry 按新宽重估 heightMap)', () => {
        const geo = installGrid({ wrap: 40 })
        const view = mount(geo, lines(50, () => 'y'.repeat(80)), { lineWrapping: true })
        expect(view.lineBlockAt(0).height).toBeCloseTo(2 * LH, 3)
        const before = view.heightMap.height
        geo.wrap = 20
        Object.defineProperty(view.scrollDOM, 'clientWidth', { configurable: true, get: () => 300 })
        view.measureGeometry()
        // 视口内行实测 4 行高;视口外按新 lineLength 重估(必然比原来 2 行高)
        expect(view.lineBlockAt(0).height).toBeCloseTo(4 * LH, 3)
        expect(view.heightMap.height).toBeGreaterThan(before * 1.4)
    })
})

describe('#9 wrappingIndent same:续行缩进到原行缩进处', () => {
    it('materialize 按行首空白写 --cm-wrap-indent(空格 Nch、tab N×tab-size、混排不设)', () => {
        const view = new EditorView({
            state: EditorState.create({ doc: '    four\n\t\ttwo tabs\n \tmixed\nnone' }),
            parent: document.body.appendChild(document.createElement('div')),
            lineWrapping: true,
        })
        const ind = Array.from(view.contentDOM.children).map(el => (el as HTMLElement).style.getPropertyValue('--cm-wrap-indent'))
        expect(ind).toEqual(['4ch', 'calc(2ch * var(--lm-tab-size, 4))', '', ''])
    })
})

describe('#10 光标高 = 行高(对齐 Monaco)', () => {
    it('字形高 15 / 行高 19.5 → 光标 19.5px,顶在行盒顶', () => {
        const geo = installGrid()
        const view = mount(geo, lines(20), { drawSelection: true })
        view.contentDOM.focus()
        view.dispatch(view.state.update({ selection: EditorSelection.single(view.state.doc.line(3).from + 2) }))
        const c = view.dom.querySelector('.cm-cursor-primary') as HTMLElement
        expect(parseFloat(c.style.height)).toBeCloseTo(LH, 5)
        expect(parseFloat(c.style.top)).toBeCloseTo(2 * LH, 5)
    })
})

describe('#11 折行下按视觉行导航(对齐 Monaco 0.52 wordWrap:on)', () => {
    // 每 20 字折一行:第 1 行 50 字 = 视觉行 [0,20) [20,40) [40,50]
    const WRAP = 20
    const DOC = 'abcdefghij'.repeat(5) + '\nshort'
    const at = (view: EditorView, pos: number, assoc: -1 | 0 | 1 = 0) => view.dispatch(view.state.update({ selection: EditorSelection.create([EditorSelection.cursor(pos, assoc)]) }))
    const head = (view: EditorView) => [view.state.selection.main.head, view.state.selection.main.assoc]
    const km = buildDefaultKeymap(true)
    const key = (view: EditorView, k: string, shift = false) => {
        const b = km.find(x => x.key === k)!
        return (shift ? b.shift! : b.run)(view)
    }

    it('Chrome 怪癖下:折行点两侧 caret 分得清;点第 2 视觉行行首 → 折行点(下游侧)', () => {
        const geo = installGrid({ wrap: WRAP, chrome: true })
        const view = mount(geo, DOC, { lineWrapping: true })
        expect(view.caretCoords(WRAP, 1)!.top).toBeGreaterThan(view.caretCoords(WRAP, -1)!.top)
        expect(view.moveToLineBoundary(25, false)).toEqual({ pos: WRAP, assoc: 1 })
        const row2 = VIEW_TOP + LH + LH / 2
        expect(view.posAndAssocAtCoords({ x: VIEW_LEFT + 1, y: row2 })).toEqual({ pos: WRAP, assoc: 1 })
        expect(view.posAndAssocAtCoords({ x: VIEW_LEFT + 30 * CW, y: VIEW_TOP + LH / 2 })).toEqual({ pos: WRAP, assoc: -1 })
    })

    for (const chrome of [false, true]) {
        it(`End / Home / ⌘→ / ⌘←:先视觉行、再逻辑行(chrome=${chrome})`, () => {
            const geo = installGrid({ wrap: WRAP, chrome })
            const view = mount(geo, DOC, { lineWrapping: true })
            at(view, 5)
            key(view, 'End'); expect(head(view)).toEqual([WRAP, -1])
            key(view, 'End'); expect(head(view)[0]).toBe(50)
            key(view, 'Home'); expect(head(view)).toEqual([40, 1])
            key(view, 'Home'); expect(head(view)[0]).toBe(0)
            at(view, 25)
            key(view, 'Cmd-ArrowLeft'); expect(head(view)).toEqual([WRAP, 1])
            key(view, 'Cmd-ArrowLeft'); expect(head(view)[0]).toBe(0)
            key(view, 'Cmd-ArrowRight'); expect(head(view)).toEqual([WRAP, -1])
            // 折行点下游侧(第 2 视觉行行首)按 End → 第 2 视觉行末尾
            at(view, WRAP, 1)
            key(view, 'End'); expect(head(view)).toEqual([40, -1])
            // ⌃E / ⌃A 仍是逻辑行首尾(Monaco 同)
            at(view, 25)
            key(view, 'Ctrl-e'); expect(head(view)[0]).toBe(50)
            key(view, 'Ctrl-a'); expect(head(view)[0]).toBe(0)
        })

        it(`↑ / ↓ 按视觉行,目标列跨行保留;行尾 ↓ 钳到下一视觉行末尾(chrome=${chrome})`, () => {
            const geo = installGrid({ wrap: WRAP, chrome })
            const view = mount(geo, DOC, { lineWrapping: true })
            at(view, 5)
            key(view, 'ArrowDown'); expect(head(view)[0]).toBe(25)
            key(view, 'ArrowDown'); expect(head(view)[0]).toBe(45)
            key(view, 'ArrowDown'); expect(head(view)[0]).toBe(56) // 'short' 第 5 列 = 行尾
            key(view, 'ArrowUp'); expect(head(view)[0]).toBe(45)
            key(view, 'Ctrl-p'); expect(head(view)[0]).toBe(25)
            key(view, 'Ctrl-n'); expect(head(view)[0]).toBe(45)
            at(view, 5)
            key(view, 'End')
            key(view, 'ArrowDown'); expect(head(view)).toEqual([40, -1])
            key(view, 'ArrowDown'); expect(head(view)[0]).toBe(50)
            key(view, 'ArrowUp'); expect(head(view)).toEqual([40, -1])
            key(view, 'ArrowUp'); expect(head(view)).toEqual([WRAP, -1])
            key(view, 'ArrowUp'); expect(head(view)[0]).toBe(0) // 首视觉行 ↑ → 文档头
        })
    }

    it('⇧End / ⇧↓:锚不动,头按视觉行', () => {
        const geo = installGrid({ wrap: WRAP })
        const view = mount(geo, DOC, { lineWrapping: true })
        at(view, 5)
        key(view, 'End', true)
        expect([view.state.selection.main.anchor, view.state.selection.main.head]).toEqual([5, WRAP])
        key(view, 'End', true)
        expect(view.state.selection.main.head).toBe(50)
        at(view, 5)
        key(view, 'ArrowDown', true)
        expect([view.state.selection.main.anchor, view.state.selection.main.head]).toEqual([5, 25])
        key(view, 'Home', true)
        expect(view.state.selection.main.head).toBe(WRAP)
    })

    it('PageDown / PageUp 跨视觉行数 = 一页 - 2', () => {
        const geo = installGrid({ wrap: WRAP })
        // 10 行 × 3 个视觉行;一页 floor(400/19.5)=20 → 翻 18 个视觉行 = 第 7 行首视觉行
        const view = mount(geo, Array.from({ length: 10 }, () => 'abcdefghij'.repeat(5)).join('\n'), { lineWrapping: true })
        at(view, 5)
        key(view, 'PageDown')
        expect(head(view)[0]).toBe(view.state.doc.line(7).from + 5)
        key(view, 'PageUp')
        expect(head(view)[0]).toBe(5)
        key(view, 'PageDown', true)
        expect([view.state.selection.main.anchor, view.state.selection.main.head]).toEqual([5, view.state.doc.line(7).from + 5])
    })

    it('不折行时照旧按逻辑行(End = 行尾,↓ = 下一行)', () => {
        const geo = installGrid({ wrap: WRAP })
        const view = mount(geo, DOC)
        at(view, 5)
        key(view, 'End'); expect(head(view)[0]).toBe(50)
        at(view, 5)
        key(view, 'ArrowDown'); expect(head(view)[0]).toBe(56)
    })
})
