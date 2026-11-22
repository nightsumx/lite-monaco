// 超长行的横向虚拟化(linegap.ts):不折行时,窗口外的文字换成等宽占位,DOM 里只有视口附近那一段,不截断。
//
// jsdom 无布局:按等宽网格桩出几何——字符 col 的 x = 内容左缘 + col × CW(不随 DOM 变,真浏览器里同一字符的 x
// 也不因换窗而变,这正是占位宽要保证的);占位的盒 = 它覆盖的起点列 × CW 起、style.width 宽。
// 所以「占位里的位置量出的 x」和「换窗后真文字量出的 x」一致,只在 caretCoords 走对了占位分支时成立。
// 真浏览器的对拍见 scripts/browser-diff/scenarios(长行、选区、横向滚动)。

import { afterEach, describe, expect, it } from 'vitest'
import { EditorView } from '../../src/core/view/editorview'
import { EditorState } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'
import { highlightLayer } from '../../src/core/feature/selectionlayer'
import { cutOrCopy } from '../../src/core/input/clipboard'
import { checkBijection } from '../../src/core/view/invariants'
import { GAP_MIN, GAP_STEP, lineGaps, type GapConfig } from '../../src/core/view/linegap'
import { LONG_LINE_SCAN } from '../../src/core/view/scanwindow'

const LH = 20
const CW = 8
const LEFT = 30
const TOP = 50
const W = 600
const H = 400

const restores: (() => void)[] = []
afterEach(() => {
    while (restores.length) restores.pop()!()
    document.body.innerHTML = ''
})
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
const list = (rs: DOMRect[]) => Object.assign([...rs], { item: (i: number) => rs[i] ?? null }) as unknown as DOMRectList

// 网格几何(不折行)。scrollLeft 不进坐标(各处一致即可)
function installGrid() {
    const geo = { view: null as EditorView | null, scrollLeft: 0 }
    const lineTop = (n: number) => TOP + (n - 1) * LH
    const xOf = (v: EditorView, pos: number) => LEFT + (pos - v.state.doc.lineAt(pos).from) * CW
    const P = HTMLElement.prototype
    const origBox = P.getBoundingClientRect
    patch(P, 'getBoundingClientRect', function (this: HTMLElement) {
        const v = geo.view
        if (this.classList.contains('cm-lineGap') && v) {
            const from = Number(this.getAttribute('data-cm-widget-from'))
            return rect(xOf(v, from), lineTop(v.state.doc.lineAt(from).number) + 5, parseFloat(this.style.width), 0) // 空 inline-block:盒在基线上
        }
        if (this.classList.contains('cm-line')) {
            if (this.getAttribute('aria-hidden') === 'true') return rect(0, 0, 300, LH)
            if (!v) return rect(0, 0, 0, 0)
            const i = Array.from(v.contentDOM.children).indexOf(this)
            if (i < 0) return rect(0, 0, 0, 0)
            return rect(LEFT, lineTop(v.viewportStartLine + i), W, LH)
        }
        if (this.classList.contains('cm-scroller')) return rect(LEFT, TOP, W, H)
        if (this.classList.contains('cm-content')) return rect(LEFT, TOP, W, v ? v.heightMap.height : 0)
        return origBox.call(this)
    } as typeof P.getBoundingClientRect)
    const R = Range.prototype as Range & Record<string, unknown>
    patch(R, 'getBoundingClientRect', function (this: Range) {
        // 编辑器里的行按位置算(jsdom 的 Range.toString 在几千个节点上很慢);探针等其余按文字数
        // 量整行(行宽表):按 doc 行长(占位撑满了隐藏文字的宽,真浏览器量到的就是整行宽)。jsdom 的 Range.toString 在几千个节点上很慢
        // (构造期间 geo.view 还没挂上:用 textContent 长度,够用)
        const v = geo.view, c = this.startContainer as HTMLElement
        if (c.nodeType === 1 && c.classList.contains('cm-line') && c.getAttribute('aria-hidden') !== 'true') {
            const i = v ? Array.prototype.indexOf.call(v.contentDOM.children, c) : -1
            return rect(0, 0, (i >= 0 ? v!.state.doc.line(v!.viewportStartLine + i).length : c.textContent!.length) * CW, 15)
        }
        return rect(0, 0, this.toString().length * CW, 15)
    } as Range['getBoundingClientRect'])
    patch(R, 'getClientRects', function (this: Range) {
        const v = geo.view
        if (!v) return list([])
        const a = v.posFromDOM(this.startContainer, this.startOffset)
        const top = lineTop(v.state.doc.lineAt(a).number) + 2.5
        if (this.collapsed) return list([rect(xOf(v, a), top, 0, 15)])
        const b = v.posFromDOM(this.endContainer, this.endOffset)
        return list([rect(xOf(v, a), top, xOf(v, b) - xOf(v, a), 15)])
    } as Range['getClientRects'])
    const scroller = (el: HTMLElement) => el.classList.contains('cm-scroller')
    override(P, 'clientHeight', { get(this: HTMLElement) { return scroller(this) ? H : 0 } })
    override(P, 'clientWidth', { get(this: HTMLElement) { return scroller(this) ? W : 0 } })
    override(P, 'scrollLeft', {
        get(this: HTMLElement) { return scroller(this) ? geo.scrollLeft : 0 },
        set(this: HTMLElement, x: number) { if (scroller(this)) geo.scrollLeft = Math.max(0, x) },
    })
    const mount = (doc: string, sel: EditorSelection = EditorSelection.single(0), extra: Partial<ConstructorParameters<typeof EditorView>[0]> = {}) => {
        const host = document.body.appendChild(document.createElement('div'))
        geo.view = new EditorView({
            state: EditorState.create({ doc, selection: sel, extensions: EditorState.allowMultipleSelections.of(true) }),
            parent: host,
            ...extra,
        })
        geo.view.remeasure()
        return geo.view
    }
    const scrollTo = (v: EditorView, col: number) => {
        geo.scrollLeft = col * CW
        v.scrollDOM.dispatchEvent(new Event('scroll'))
    }
    return { geo, mount, scrollTo, xOf }
}

// 非周期的 ASCII 文本:每个位置的字不同,读回错位一定看得出来
const ascii = (n: number) => { let s = ''; for (let i = 0; s.length < n; i++) s += (i % 997).toString(36) + ' '; return s.slice(0, n) }
const LONG = 200_000
const gapsOf = (v: EditorView) => Array.from(v.contentDOM.querySelectorAll<HTMLElement>('.cm-lineGap'))
    .map(g => ({ from: Number(g.getAttribute('data-cm-widget-from')), len: Number(g.getAttribute('data-cm-widget')), width: parseFloat(g.style.width) }))

describe('lineGaps:窗口外的文字按视觉列换成占位', () => {
    const cfg = (over: Partial<GapConfig> = {}): GapConfig => ({ win: { start: 0, end: 8192 }, keep: [], points: [], advance: 8, wideAdvance: 14, tabSize: 4, ...over })
    const line = (text: string, from = 0) => ({ from, to: from + text.length, text })

    it('不长于 LONG_LINE_SCAN 的行、比例字体(advance 0):不出占位', () => {
        expect(lineGaps(line('a'.repeat(LONG_LINE_SCAN)), cfg())).toEqual([])
        expect(lineGaps(line('a'.repeat(LONG)), cfg({ advance: 0 }))).toEqual([])
    })
    it('纯 ASCII:窗口右侧一整段,宽 = 字符数 × 字宽', () => {
        expect(lineGaps(line('a'.repeat(LONG), 10), cfg())).toEqual([{ from: 10 + 8192, to: 10 + LONG, width: (LONG - 8192) * 8 }])
    })
    it('选区两端附近按 GAP_STEP 量化留在 DOM 里;窗口左侧也出占位', () => {
        const g = lineGaps(line('a'.repeat(LONG)), cfg({ win: { start: 40960, end: 57344 }, keep: [100_000] }))
        const k = Math.floor(100_000 / GAP_STEP)
        expect(g.map(x => [x.from, x.to])).toEqual([[0, 40960], [57344, (k - 1) * GAP_STEP], [(k + 2) * GAP_STEP, LONG]])
    })
    it('行内 point 装饰(折叠、inlay)两侧留 64 字符,不被占位盖住', () => {
        const g = lineGaps(line('a'.repeat(LONG)), cfg({ points: [{ from: 100_000, to: 100_010 }] }))
        expect(g.map(x => [x.from, x.to])).toEqual([[8192, 100_000 - 64], [100_010 + 64, LONG]])
    })
    it('tab 到下一个 tab stop、全角两列(按全角字宽)、组合字符 0 列', () => {
        // 窗口 [0, 列 8192):前面是 a,窗口外依次 1 个 tab(从列 8193 到 8196)、全角、组合字符
        const head = 'a'.repeat(8193)
        const tail = '\t' + '中'.repeat(3000) + 'é'.repeat(3000) + 'b'.repeat(LONG)
        const g = lineGaps(line(head + tail), cfg())
        expect(g.length).toBe(1)
        expect(g[0].from).toBe(8192)
        // 列宽:1 个 a + tab(列 8193→8196 = 3 列) + 3000 个全角 + 3000 个 e + LONG 个 b
        expect(g[0].width).toBe((1 + 3 + 3000 + LONG) * 8 + 3000 * 14)
    })
    it('窗口边界落在代理对 / 组合字符中间:往后挪到整个字素之后', () => {
        const text = 'a'.repeat(8191) + '😀' + 'b'.repeat(LONG) // 😀 占码元 8191-8192
        expect(lineGaps(line(text), cfg())[0].from).toBe(8193)
        const comb = 'a'.repeat(8192) + '́́' + 'b'.repeat(LONG)
        expect(lineGaps(line(comb), cfg())[0].from).toBe(8194)
    })
    it('含 RTL 的行不出占位(视觉顺序 ≠ 逻辑顺序)', () => {
        expect(lineGaps(line('a'.repeat(LONG) + 'שלום'), cfg())).toEqual([])
    })
    it('隐藏段不到 GAP_MIN 不值得换', () => {
        const n = LONG_LINE_SCAN + 10_000
        expect(lineGaps(line('a'.repeat(n)), cfg({ win: { start: 0, end: n - GAP_MIN + 1 } }))).toEqual([])
        expect(lineGaps(line('a'.repeat(n)), cfg({ win: { start: 0, end: n - GAP_MIN } })).length).toBe(1)
    })
})

describe('DOM:超长行只放窗口那一段,映射按占位长度走', () => {
    it('20 万字符的行:DOM 文字只有几千字,两侧占位;DOM ↔ pos 跨占位一致,双射成立', () => {
        const { mount } = installGrid()
        const text = ascii(LONG)
        const v = mount('first\n' + text + '\nlast')
        const g = gapsOf(v)
        expect(g.length).toBe(1)
        const lineFrom = 6
        expect(g[0]).toEqual({ from: lineFrom + 8192, len: LONG - 8192, width: (LONG - 8192) * CW })
        expect((v.contentDOM.children[1] as HTMLElement).textContent!.length).toBe(8192)
        // 占位之后(行尾) / 之前 / 下一行
        const lineEl = v.contentDOM.children[1]
        expect(v.posFromDOM(lineEl, lineEl.childNodes.length)).toBe(lineFrom + LONG)
        const at = v.domAtPos(lineFrom + 100_000) // 占位里的位置:贴到占位前
        expect(at.node.childNodes[at.offset]).toBe(v.contentDOM.querySelector('.cm-lineGap'))
        expect(v.domAtPos(v.state.doc.line(3).from + 2).node.nodeType).toBe(3)
        expect(checkBijection(v)).toBeNull()
    })

    it('复制 / 全选复制给全文(复制读 state,不读 DOM)', () => {
        const { mount } = installGrid()
        const text = ascii(LONG)
        const v = mount(text + '\nb')
        expect(gapsOf(v).length).toBe(1)
        v.dispatch(v.state.update({ selection: EditorSelection.single(0, v.state.doc.length) }))
        const sink: Record<string, string> = {}
        cutOrCopy(v, { clearData() {}, setData(t, s) { sink[t] = s } }, false)
        expect(sink['text/plain']).toBe(text + '\nb')
    })

    it('窗口里打字(浏览器改文本节点 → 读回):模型是全文 + 新字,双射不破', () => {
        const { mount } = installGrid()
        const text = ascii(LONG)
        const v = mount(text, EditorSelection.single(100))
        const tn = v.domAtPos(100).node as Text
        const off = v.domAtPos(100).offset
        tn.insertData(off, 'Z')
        const s = document.getSelection()!; s.removeAllRanges(); const r = document.createRange(); r.setStart(tn, off + 1); s.addRange(r)
        v.observer.flush()
        expect(v.state.doc.toString()).toBe(text.slice(0, 100) + 'Z' + text.slice(100))
        expect(gapsOf(v).length).toBe(1)
        expect(checkBijection(v)).toBeNull()
    })

    it('程序在长行窗口里插字:行节点和改动前的文本节点都不换(占位按列不动,只换占位那一个节点),双射成立', () => {
        const { mount } = installGrid()
        const text = ascii(LONG)
        const v = mount(text, EditorSelection.single(100))
        const el = v.contentDOM.children[0]
        const head = v.domAtPos(50).node
        v.dispatch(v.state.update({ changes: { from: 100, insert: 'Z' }, selection: EditorSelection.single(101), userEvent: 'input.type' }))
        expect(v.contentDOM.children[0]).toBe(el)
        expect(v.domAtPos(50).node).toBe(head)
        // 窗口按列定:占位左缘还在第 8192 列(x 不跳),窗口末尾那个字挤进了占位
        expect(gapsOf(v)[0]).toEqual({ from: 8192, len: LONG + 1 - 8192, width: (LONG + 1 - 8192) * CW })
        expect(checkBijection(v)).toBeNull()
    })

    it('别的行改了、长行没重画:占位记的起点跟着平移,之后在长行里打字读回的隐藏原文不错位', () => {
        const { mount } = installGrid()
        const text = ascii(LONG)
        const v = mount('ab\n' + text, EditorSelection.single(1))
        const longEl = v.contentDOM.children[1]
        v.dispatch(v.state.update({ changes: { from: 1, insert: 'XYZ' }, selection: EditorSelection.single(4), userEvent: 'input.type' }))
        expect(v.contentDOM.children[1]).toBe(longEl) // 长行没被重画(打字热路径)
        expect(gapsOf(v)[0].from).toBe(v.state.doc.line(2).from + 8192)
        // 浏览器在长行窗口里插一个字
        const p = v.state.doc.line(2).from + 50
        const { node, offset } = v.domAtPos(p)
        ;(node as Text).insertData(offset, 'Q')
        const s = document.getSelection()!; s.removeAllRanges(); const r = document.createRange(); r.setStart(node, offset + 1); s.addRange(r)
        v.observer.flush()
        expect(v.state.doc.toString()).toBe('aXYZb\n' + text.slice(0, 50) + 'Q' + text.slice(50))
    })
})

describe('几何:占位里的位置按同一把尺估 x,换窗前后同一字符不跳', () => {
    it('caretCoords(占位里) = 真文字时的 x;横向滚过去换窗后,那个字符进了 DOM,x 不变', () => {
        const { mount, scrollTo, xOf } = installGrid()
        const v = mount(ascii(LONG))
        const pos = 100_000
        expect(v.domAtPos(pos).node.nodeType).toBe(1) // 在占位里
        const before = v.caretCoords(pos)!
        expect(before.left).toBe(xOf(v, pos))
        expect(before.top).toBe(TOP + (LH - before.height) / 2) // 竖向居中在行盒里,不取占位盒(它在基线上)
        scrollTo(v, pos - 50)
        expect(v.domAtPos(pos).node.nodeType).toBe(3) // 换窗了,现在是真文字
        expect(v.caretCoords(pos)!.left).toBe(before.left)
        // 行尾(占位右缘)
        expect(v.caretCoords(LONG)!.left).toBe(xOf(v, LONG))
    })

    it('点占位处 → posAtCoords 落到那个字符(二分在占位里也单调)', () => {
        const { mount } = installGrid()
        const v = mount(ascii(LONG))
        expect(v.posAtCoords({ x: LEFT + 123_456 * CW + 1, y: TOP + LH / 2 })).toBe(123_456)
        expect(v.posAtCoords({ x: LEFT + LONG * CW + 50, y: TOP + LH / 2 })).toBe(LONG)
    })

    it('程序把光标放进占位(⌘→ 到 20 万字符行尾 / setSelection):那一段换进 DOM,原生选区落在真文字上', () => {
        const { mount } = installGrid()
        const v = mount(ascii(LONG) + '\nx')
        v.dispatch(v.state.update({ selection: EditorSelection.single(150_000) }))
        expect(v.domAtPos(150_000).node.nodeType).toBe(3)
        expect(gapsOf(v).some(g => g.from < 150_000 && 150_000 < g.from + g.len)).toBe(false)
        v.dispatch(v.state.update({ selection: EditorSelection.single(10, LONG) }))
        expect(v.domAtPos(LONG - 1).node.nodeType).toBe(3) // 行尾前面是真文字(不是紧贴占位右缘)
        expect(checkBijection(v)).toBeNull()
    })
})

describe('选区层:跨占位 / 落在占位里的选区照样画', () => {
    it('副选区整个在占位里:按估出的 x 画;主选区跨过占位:一整块', () => {
        const { mount } = installGrid()
        const sel = EditorSelection.create([EditorSelection.range(100, 120_000), EditorSelection.range(150_000, 160_000)], 0)
        const v = mount(ascii(LONG), sel, { drawSelection: true, overlays: [view => highlightLayer(view)] })
        v.dispatch(v.state.update({ selection: sel }))
        expect(v.domAtPos(155_000).node.nodeType).toBe(1) // 副选区在占位里
        const boxes = Array.from(v.dom.querySelectorAll<HTMLElement>('.cm-selectedText'))
            .filter(e => !e.className.includes('cm-selInner'))
            .map(e => ({ left: parseFloat(e.style.left), width: parseFloat(e.style.width) }))
            .sort((a, b) => a.left - b.left)
        expect(boxes.map(b => b.width)).toEqual([(120_000 - 100) * CW, 10_000 * CW])
        expect(boxes[1].left - boxes[0].left).toBe((150_000 - 100) * CW)
    })
})

describe('组字:组字行里有占位', () => {
    it('组字中远端在同一行窗口里(占位之后)插字:组字行不换节点,组字结束读回全文', async () => {
        const { mount } = installGrid()
        const text = ascii(LONG)
        const at = 100_000
        const v = mount(text, EditorSelection.single(at))
        expect(gapsOf(v).length).toBe(2) // 窗口 + 光标附近,两侧和中间是占位
        const el = v.contentDOM.children[0]
        const { node, offset } = v.domAtPos(at)
        const tn = node as Text
        const caret = (n: Node, o: number) => { const s = document.getSelection()!; s.removeAllRanges(); const r = document.createRange(); r.setStart(n, o); s.addRange(r) }
        caret(tn, offset)
        v.contentDOM.dispatchEvent(new CompositionEvent('compositionstart'))
        tn.insertData(offset, 'NI') // 大写:ascii() 只有小写和数字
        caret(tn, offset + 2)
        v.observer.flush()
        // 远端在组字点前 500 字(同一行、在中间那个占位之后的真文字里)插 R
        v.dispatch(v.state.update({ changes: { from: at - 500, insert: 'R' }, userEvent: 'remote' }))
        expect(v.contentDOM.children[0]).toBe(el)
        expect(tn.isConnected).toBe(true)
        const ci = tn.data.indexOf('NI')
        tn.replaceData(ci, 2, '你')
        caret(tn, ci + 1)
        v.contentDOM.dispatchEvent(new CompositionEvent('compositionend'))
        await Promise.resolve(); await Promise.resolve()
        v.observer.flush()
        expect(v.state.doc.toString()).toBe(text.slice(0, at - 500) + 'R' + text.slice(at - 500, at) + '你' + text.slice(at))
    })
})
