// @vitest-environment jsdom
// 超长行的扫描窗口:词法装饰(链接、不可见字符、行尾空白、tab 对齐)只扫可见列附近,随横向滚动移动。
// 切段文本隔一个包 .lc-ck,让浏览器不把相邻文本合成一次排版;就地补丁把壳当透明。
import { afterEach, describe, expect, it } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { EditorView } from '../../src/core/view/editorview'
import { linkDecorations } from '../../src/core/feature/link'
import { unicodeHighlightRanges } from '../../src/core/feature/specialchar'
import { tabStopDecorations, trailingWhitespaceDecorations } from '../../src/core/feature/whitespace'
import { selectionDecorations } from '../../src/core/feature/selectionlayer'
import { LONG_LINE_SCAN, SCAN_PAD, SCAN_STEP, UNLIMITED_SCAN_WINDOW, pieceText, scanPieces, scanWindowFor } from '../../src/core/view/scanwindow'
import type { DecorationSet } from '../../src/core/model/decoration'

const views: EditorView[] = []
afterEach(() => { for (const v of views.splice(0)) { v.destroy(); v.dom.parentElement?.remove() } })

const starts = (set: DecorationSet) => { const out: number[] = []; for (const it = set.iter(); it.value; it.next()) out.push(it.from); return out }

describe('scanWindowFor', () => {
    it('没滚:从 0 起,按 SCAN_STEP 取整,两侧留 SCAN_PAD', () => {
        const w = scanWindowFor(0, 1200, 8)
        expect(w.start).toBe(0)
        expect(w.end).toBe(2 * SCAN_STEP)
    })
    it('滚到 20 万列:窗口跟着走,起止都是 SCAN_STEP 的整数倍', () => {
        const w = scanWindowFor(200000 * 8, 1200, 8)
        expect(w.start % SCAN_STEP).toBe(0)
        expect(w.end % SCAN_STEP).toBe(0)
        expect(w.start).toBeLessThanOrEqual(200000 - SCAN_PAD)
        expect(w.end).toBeGreaterThanOrEqual(200000 + 150 + SCAN_PAD)
    })
    it('滚动小于一格:窗口不变(不会每个像素重画)', () => {
        expect(scanWindowFor(100 * 8, 1200, 8)).toEqual(scanWindowFor(120 * 8, 1200, 8))
    })
})

describe('scanPieces', () => {
    const long = 'x'.repeat(LONG_LINE_SCAN + 5000)
    const doc = EditorState.create({ doc: ['a', 'b', long, 'c', 'd'].join('\n') }).doc
    it('没有窗口:整段', () => {
        expect(scanPieces(doc, 0, doc.length, undefined)).toEqual([{ from: 0, to: doc.length, cutRight: false }])
    })
    it('普通行连成一段,长行只留窗口那截,前后各一段', () => {
        const ps = scanPieces(doc, 0, doc.length, { start: 100, end: 300 })
        expect(ps.length).toBe(3)
        expect(ps[0]).toEqual({ from: 0, to: 3, cutRight: false }) // "a\nb" 到长行前一个换行之前
        expect(ps[1]).toEqual({ from: 4 + 100, to: 4 + 300, cutRight: true })
        expect(ps[2].from).toBe(4 + long.length + 1)
    })
    it('窗口超过行尾:不算切断', () => {
        const ps = scanPieces(doc, 0, doc.length, { start: LONG_LINE_SCAN, end: 1e9 })
        expect(ps[1].cutRight).toBe(false)
        expect(ps[1].to).toBe(4 + long.length)
    })
    it('右端切断的片段去掉切口前的空白(不是行尾空白)', () => {
        const text = 'x'.repeat(LONG_LINE_SCAN) + ' '.repeat(50) + 'y'.repeat(100)
        const d = EditorState.create({ doc: text }).doc
        const [p] = scanPieces(d, 0, d.length, { start: 0, end: LONG_LINE_SCAN + 20 })
        expect(p.cutRight).toBe(true)
        expect(pieceText(d, p).text.endsWith(' ')).toBe(false)
    })
})

describe('词法装饰只扫窗口', () => {
    const FILLER = '.'.repeat(1000)
    // 链接放在第 100、30000、90000 列;行尾有空白
    const line = FILLER.slice(0, 100) + ' https://a.example/1 ' + FILLER.repeat(29) + ' https://b.example/2 ' + FILLER.repeat(60) + ' https://c.example/3 ' + FILLER + '   '
    const state = EditorState.create({ doc: 'short https://s.example/0\n' + line })
    const lineFrom = state.doc.line(2).from
    const view = (scanWindow?: { start: number, end: number }) => ({ viewport: { from: 0, to: state.doc.length }, scanWindow })

    it('没有 view / 没有窗口:全扫(行为不变)', () => {
        expect(starts(linkDecorations(state)).length).toBe(4)
    })
    it('窗口在行首:短行的链接 + 行首那条', () => {
        const got = starts(linkDecorations(state, view({ start: 0, end: 8192 })))
        expect(got).toEqual([6, lineFrom + 101])
    })
    it('窗口挪到 3 万列附近:换成那一条', () => {
        const got = starts(linkDecorations(state, view({ start: 28672, end: 36864 })))
        expect(got.length).toBe(2)
        expect(got[0]).toBe(6)
        expect(got[1] - lineFrom).toBeGreaterThan(28672)
        expect(got[1] - lineFrom).toBeLessThan(36864)
    })
    it('行尾空白:窗口没到行尾不标,到了才标', () => {
        const away = starts(trailingWhitespaceDecorations(state, view({ start: 0, end: 8192 })))
        expect(away.length).toBe(0)
        const end = line.length
        const at = starts(trailingWhitespaceDecorations(state, view({ start: Math.floor((end - 100) / 4096) * 4096, end: Math.ceil((end + 1) / 4096) * 4096 })))
        expect(at).toEqual([lineFrom + end - 3])
    })
    it('不可见字符和 tab 对齐同样只扫窗口', () => {
        const odd = 'a'.repeat(50000) + '\u200b' + 'b'.repeat(50000) + '\u200b'
        const s2 = EditorState.create({ doc: odd })
        const v2 = (w: { start: number, end: number }) => ({ viewport: { from: 0, to: s2.doc.length }, scanWindow: w })
        expect(unicodeHighlightRanges(s2, v2({ start: 0, end: 8192 })).length).toBe(0)
        expect(unicodeHighlightRanges(s2, v2({ start: 49152, end: 53248 })).map(r => r.from)).toEqual([50000])
        expect(unicodeHighlightRanges(s2).length).toBe(2)
        const tabs = 'é\t' + 'a'.repeat(30000) + '\t'
        const s3 = EditorState.create({ doc: tabs })
        const v3 = (w: { start: number, end: number }) => ({ viewport: { from: 0, to: s3.doc.length }, scanWindow: w })
        expect(starts(tabStopDecorations(s3, v3({ start: 0, end: 8192 }))).length).toBe(1)
    })
    it('同一个窗口对象:缓存命中返回同一个集合;换窗口则重算', () => {
        const w1 = { start: 0, end: 8192 }
        const v = view(w1)
        expect(linkDecorations(state, v)).toBe(linkDecorations(state, v))
        const a = linkDecorations(state, view(w1))
        const b = linkDecorations(state, view({ start: 28672, end: 36864 }))
        expect(b).not.toBe(a)
    })
})

describe('EditorView:横向滚动带着窗口走', () => {
    function make(doc: string) {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const view = new EditorView({ state: EditorState.create({ doc, extensions: [] }), parent, decorationProviders: [(s, v) => linkDecorations(s, v)] })
        let left = 0
        Object.defineProperty(view.scrollDOM, 'clientWidth', { configurable: true, get: () => 800 })
        Object.defineProperty(view.scrollDOM, 'clientHeight', { configurable: true, get: () => 400 })
        Object.defineProperty(view.scrollDOM, 'scrollLeft', { configurable: true, get: () => left, set: v => { left = v } })
        views.push(view)
        return { view, scrollTo(x: number) { left = x; view.scrollDOM.dispatchEvent(new Event('scroll')) } }
    }
    const links = (v: EditorView) => Array.from(v.contentDOM.querySelectorAll('.detected-link')).map(e => e.textContent)

    it('窗口外的链接不画;滚过去之后画出来,滚回来又收掉', () => {
        const FILLER = '.'.repeat(1000)
        const text = FILLER.slice(0, 100) + ' https://a.example/1 ' + FILLER.repeat(60) + ' https://z.example/9 ' + FILLER
        const { view, scrollTo } = make(text)
        const cw = view.oracle.charWidth || 8
        expect(links(view)).toEqual(['https://a.example/1'])
        const lineEl = view.contentDOM.children[0]
        scrollTo(61000 * cw)
        expect(links(view)).toEqual(['https://z.example/9'])
        expect(view.contentDOM.children[0]).not.toBe(lineEl) // 重画了那一行
        scrollTo(0)
        expect(links(view)).toEqual(['https://a.example/1'])
    })

    it('滚动小于一格:不重画那一行', () => {
        const text = '.'.repeat(60000) + ' https://a.example/1'
        const { view, scrollTo } = make(text)
        const cw = view.oracle.charWidth || 8
        const lineEl = view.contentDOM.children[0]
        scrollTo(50 * cw)
        expect(view.contentDOM.children[0]).toBe(lineEl)
    })

    it('折行:不限窗口,整条行都扫', () => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const text = '.'.repeat(60000) + ' https://a.example/1 ' + '.'.repeat(100)
        const view = new EditorView({ state: EditorState.create({ doc: text }), parent, lineWrapping: true, decorationProviders: [(s, v) => linkDecorations(s, v)] })
        views.push(view)
        Object.defineProperty(view.scrollDOM, 'clientWidth', { configurable: true, get: () => 800 })
        view.scrollDOM.dispatchEvent(new Event('scroll'))
        expect(links(view)).toEqual(['https://a.example/1'])
    })
})

describe('切段文本的壳 .lc-ck', () => {
    it('长文本被切成多段时隔一个包一层,文字不变', () => {
        const text = 'abcdefghij'.repeat(300) // 3000 字符 = 6 段
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const view = new EditorView({ state: EditorState.create({ doc: text }), parent })
        views.push(view)
        const line = view.contentDOM.children[0]
        expect(line.textContent).toBe(text)
        const wraps = line.querySelectorAll('.lc-ck')
        expect(wraps.length).toBeGreaterThanOrEqual(2)
        // 相邻两段不会都是壳,也不会都是裸文本
        const kinds = Array.from(line.childNodes).map(n => n.nodeType === 3 ? 'T' : (n as Element).className === 'lc-ck' ? 'C' : '?')
        expect(kinds.join('')).not.toMatch(/TT|CC/)
    })
    it('在长行里改一个字:只动一两个文本节点,后面的段边界不跟着挪(Blink 只重排改到的那 512 字符)', async () => {
        const text = 'abcdefghij'.repeat(1900) // 19000 字符 = 38 段(再长就过了 LONG_LINE_SCAN,窗口外换成占位,见 linegap.test.ts)
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const view = new EditorView({ state: EditorState.create({ doc: text }), parent })
        views.push(view)
        const line = view.contentDOM.children[0]
        const mo = new MutationObserver(() => {})
        mo.observe(line, { subtree: true, childList: true, characterData: true, attributes: true })
        view.dispatch(view.state.update({ changes: { from: 5000, insert: 'Z' } }))
        view.dispatch(view.state.update({ changes: { from: 12000, to: 12003 } }))
        const records = mo.takeRecords()
        mo.disconnect()
        expect(view.contentDOM.children[0]).toBe(line)
        expect(line.textContent).toBe(view.state.doc.toString())
        expect(records.length).toBeLessThanOrEqual(4)
    })
    it('短行不加壳', () => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const view = new EditorView({ state: EditorState.create({ doc: 'short line' }), parent })
        views.push(view)
        expect(view.contentDOM.querySelector('.lc-ck')).toBeNull()
    })
    it('在长行里打字:行元素和文本节点不换,壳也留着,文字对', () => {
        const text = 'abcdefghij'.repeat(1000)
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const view = new EditorView({ state: EditorState.create({ doc: text }), parent })
        views.push(view)
        const line = view.contentDOM.children[0]
        const wraps = Array.from(line.querySelectorAll('.lc-ck'))
        const before = Array.from(line.querySelectorAll('.lc-ck'))
        for (let i = 0; i < 5; i++) view.dispatch(view.state.update({ changes: { from: 3000 + i, insert: 'Z' } }))
        view.dispatch(view.state.update({ changes: { from: 100, to: 110 } }))
        expect(view.contentDOM.children[0]).toBe(line)
        expect(line.textContent).toBe(view.state.doc.toString())
        expect(Array.from(line.querySelectorAll('.lc-ck'))).toEqual(before)
        expect(wraps.length).toBe(before.length)
    })
})

describe('选区里的空白 mark 只扫窗口(全选超长行)', () => {
    const word = 'ab '
    const long = word.repeat(40000) // 12 万字符,4 万处空白
    const doc = `short a b\n${long}\nend x`
    const sel = (anchor: number, head: number) => EditorState.create({ doc, selection: { anchor, head } })
    const count = (set: DecorationSet) => { let n = 0; for (const it = set.iter(); it.value; it.next()) n++; return n }
    const vp = { from: 0, to: doc.length }

    it('没有窗口(单测 / 无 view):全扫,行为不变', () => {
        // 1 个选区 mark + 短行 2 处空白 + 长行 4 万处 + 末行 1 处
        expect(count(selectionDecorations(sel(0, doc.length), { viewport: vp }))).toBe(1 + 2 + 40000 + 1)
    })
    it('长行只留窗口里的空白,短行照旧', () => {
        const n = count(selectionDecorations(sel(0, doc.length), { viewport: vp, scanWindow: { start: 0, end: 8192 } }))
        expect(n).toBeGreaterThan(1 + 2 + 1)
        expect(n).toBeLessThan(1 + 2 + 1 + 8192 / 3 + 2)
    })
    it('窗口里的 mark 位置落在窗口内', () => {
        const set = selectionDecorations(sel(0, doc.length), { viewport: vp, scanWindow: { start: 40960, end: 49152 } })
        const lineFrom = 'short a b\n'.length
        for (const it = set.iter(); it.value; it.next()) {
            if (it.from === 0) continue // 选区 mark
            if (it.from < lineFrom || it.from > lineFrom + long.length) continue // 短行 / 末行
            expect(it.from - lineFrom).toBeGreaterThanOrEqual(40960)
            expect(it.from - lineFrom).toBeLessThan(49152)
        }
    })
    it('选区只盖长行中段:窗口与选区取交集', () => {
        const lineFrom = 'short a b\n'.length
        const a = lineFrom + 5000, b = lineFrom + 6000
        const n = count(selectionDecorations(sel(a, b), { viewport: vp, scanWindow: { start: 0, end: 8192 } }))
        expect(n).toBe(1 + 334) // i%3==2 是空格,[5000,6000) 里 334 处
    })
    it('折行(窗口不限)时长行的空白点只画前 LONG_LINE_SCAN 列:整条折行 DOM 里每个空格一个 span 会让每次重排慢一个数量级', () => {
        const lineFrom = 'short a b\n'.length
        const set = selectionDecorations(sel(0, doc.length), { viewport: vp, scanWindow: UNLIMITED_SCAN_WINDOW })
        let inLong = 0
        for (const it = set.iter(); it.value; it.next()) {
            if (it.from === 0 || it.from < lineFrom || it.from > lineFrom + long.length) continue
            expect(it.from - lineFrom).toBeLessThan(LONG_LINE_SCAN)
            inLong++
        }
        expect(inLong).toBeGreaterThan(LONG_LINE_SCAN / 3 - 2)
        // 短行(含末行)的空白照旧都画
        expect(count(set)).toBe(1 + 2 + inLong + 1)
    })
})
