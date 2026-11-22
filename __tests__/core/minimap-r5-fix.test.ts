// 第五轮 N 组:minimap 同词高亮 = 编辑器 WordHighlighter 的装饰 / 查找框右偏移按右侧列宽 / 缩进参考线跟缩进选项走。
// 对齐 Monaco 0.52(对照页实测脚本:/tmp/lc-hunt/r5/N/{hl4.ts,findpos.ts,guides.ts})。
// jsdom 无 canvas:桩一个只记 fillRect 的 2D context(同 minimap-r4-fix),看高亮层画了哪些块。
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { minimapCM7 } from '../../src/core/chrome/minimap'
import { EditorView } from '../../src/core/view/editorview'
import { EditorState } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'
import { highlightField, setHighlights } from '../../src/lang/tshighlight'
import { liteMonacoBaseCSS } from '../../src/product/themecss'
import { rulerPalette } from '../../src/product/theme'
import { indentGuidesCM7, indentUnit } from '../../src/core/feature/indentguides'
import { indentOptions, setIndentOptions } from '../../src/core/edit/commands'
import type { ScopedShiki } from '../../src/core/view/tokens'

interface Rect { x: number, y: number, w: number, h: number, style: string, alpha: number }
const rects = new WeakMap<HTMLCanvasElement, Rect[]>()
const origGetContext = HTMLCanvasElement.prototype.getContext
beforeAll(() => {
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) {
        const cv = this
        if (!rects.has(cv)) rects.set(cv, [])
        const c = {
            fillStyle: '', globalAlpha: 1,
            createImageData: (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
            clearRect() { rects.set(cv, []) },
            fillRect(x: number, y: number, w: number, h: number) { rects.get(cv)!.push({ x, y, w, h, style: String(c.fillStyle), alpha: Number(c.globalAlpha) }) },
            putImageData() {},
        }
        return c as unknown as CanvasRenderingContext2D
    } as unknown as typeof HTMLCanvasElement.prototype.getContext
})
afterAll(() => { HTMLCanvasElement.prototype.getContext = origGetContext })

const hl: ScopedShiki = {
    codeToTokens: (code: string) => ({ tokens: code.split('\n').map(l => [{ content: l, offset: 0, color: '#ffffff' }]) }),
    getLastGrammarState: () => ({ getScopes: () => [] }),
}
const palette = rulerPalette({ bg: '#1e1e1e', fg: '#d4d4d4', dark: true })
const LH = 20

function make(doc: string, opts: { extensions?: unknown[], layout?: Parameters<typeof minimapCM7>[3] } = {}) {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const view = new EditorView({ state: EditorState.create({ doc, extensions: (opts.extensions ?? []) as never }), parent: host })
    Object.defineProperty(view.scrollDOM, 'clientHeight', { configurable: true, get: () => 400 })
    view.oracle.lineHeight = LH
    view.resetHeights()
    view.remeasure()
    const off = minimapCM7(hl, { lang: 'typescript', theme: 'dark-plus' }, palette, opts.layout)(view)
    const wrap = view.dom.querySelector('.cm-minimap') as HTMLElement
    const hlCanvas = wrap.querySelector('canvas.cm-minimap-hl') as HTMLCanvasElement
    // 同词装饰本身(不透明的那几列;另有一条 50% 的整行行底):按 minimap 行(dpr 1 每行 2px)记 [行, x]
    const words = () => (rects.get(hlCanvas) ?? []).filter(r => r.style === palette.wordHighlight && r.alpha === 1).map(r => [r.y / 2, r.x])
    const select = (sel: EditorSelection | { anchor: number, head?: number }, userEvent?: string) =>
        view.dispatch(view.state.update({ selection: sel, userEvent }))
    const done = () => { off(); view.destroy(); host.remove() }
    return { view, wrap, hlCanvas, words, select, done }
}

describe('minimap 同词高亮 = Monaco WordHighlighter(只认有焦点时的用户光标移动,失焦保留)', () => {
    const doc = 'const foo = 1\nlet bar = foo\nfoo'
    it('没聚焦 / 程序设光标:不亮;聚焦后用户挪光标:亮;失焦:保留;改文档:清', () => {
        const m = make(doc)
        m.select({ anchor: 7 })
        expect(m.words()).toEqual([])
        m.view.contentDOM.focus()
        m.select({ anchor: 7 }, 'select.pointer')
        expect(m.words()).toEqual([[0, 14], [1, 18], [2, 8]])
        m.view.contentDOM.blur()
        expect(m.words()).toHaveLength(3)
        m.view.dispatch(m.view.state.update({ changes: { from: doc.length, insert: ' ' }, userEvent: 'input.type' }))
        // 改文档后字形层 debounce 重画;高亮层在 drawMatches 里同步清
        return new Promise<void>(r => setTimeout(() => { expect(m.words()).toEqual([]); m.done(); r() }, 60))
    })
    it('聚焦时程序设选区(Monaco 非 Explicit)→ 清掉', () => {
        const m = make(doc)
        m.view.contentDOM.focus()
        m.select({ anchor: 7 }, 'select')
        expect(m.words()).toHaveLength(3)
        m.select({ anchor: 8 })
        expect(m.words()).toEqual([])
        m.done()
    })
    it('空选区不画选区块(Monaco 没有 minimap 当前行块)', () => {
        const m = make(doc)
        m.view.contentDOM.focus()
        m.select({ anchor: 2 }, 'select')
        expect((rects.get(m.hlCanvas) ?? []).filter(r => r.style === palette.minimapSelection)).toEqual([])
        m.done()
    })
    it('文本同词区分大小写(Monaco TextualDocumentHighlightProvider:findMatches matchCase true)', () => {
        const m = make('foo Foo FOO foo')
        m.view.contentDOM.focus()
        m.select({ anchor: 1 }, 'select')
        expect(m.words()).toEqual([[0, 8], [0, 20]])
        m.done()
    })
    it('选区在一个词里面(不必是整词)也按这个词亮(Monaco _run:word.startColumn ≤ 选区起、word.endColumn ≥ 选区止)', () => {
        const m = make('foo x foo')
        m.view.contentDOM.focus()
        m.select(EditorSelection.single(1, 3), 'select')
        expect(m.words().length).toBe(2)
        // 跨出词:不亮
        m.select(EditorSelection.single(1, 5), 'select')
        expect(m.words()).toEqual([])
        m.done()
    })
})

describe('minimap 同词高亮跟编辑器的 TS 语义高亮走(wordHighlights 源)', () => {
    // foo 的语义引用只有第 1、4 行;o.foo、'foo' 是文本同词但不是同一个符号(对照页实测 Monaco minimap 只画语义的两处)
    const doc = ['const foo = 1', 'const o = { foo: 2 }', '', 'o.foo + foo', "let s = 'foo'"].join('\n')
    const marksOf = (state: EditorState) => state.field(highlightField, false) ?? null
    it('有源时只画源给的区间,不再自己按文本扫;源变化(纯 effect 事务)即重画;源清空即清', () => {
        const m = make(doc, { extensions: [highlightField], layout: { wordHighlights: marksOf } })
        m.view.contentDOM.focus()
        m.select({ anchor: 7 }, 'select.pointer')
        // 语义高亮还没到:不画文本同词
        expect(m.words()).toEqual([])
        const l4 = m.view.state.doc.line(4).from
        m.view.dispatch(m.view.state.update({ effects: setHighlights.of([{ from: 6, to: 9 }, { from: l4 + 8, to: l4 + 11 }]) }))
        expect(m.words()).toEqual([[0, 14], [3, 16]])
        // 失焦:源(tsHighlightSession)保留就保留
        m.view.contentDOM.blur()
        expect(m.words()).toHaveLength(2)
        m.view.dispatch(m.view.state.update({ effects: setHighlights.of([]) }))
        expect(m.words()).toEqual([])
        m.done()
    })
})

describe('查找框右偏移(Monaco overlayWidgets TOP_RIGHT_CORNER:right = 2 × verticalScrollbarWidth + minimapWidth)', () => {
    const css = liteMonacoBaseCSS()
    it('右侧没有竖条 / 概览列(Monaco verticalScrollbarSize 0):right = minimap 宽,不留 18px', () => {
        expect(css).toMatch(/\.cm-find-widget \{\s*position: absolute; top: 0; right: var\(--cm-minimap-w, 0px\);/)
    })
    it('右侧有概览列(没有自绘竖条,Monaco 竖条 hidden 仍算 14):right = minimap 宽 + 28', () => {
        expect(css).toMatch(/\.cm-editor:has\(> \.cm-overviewRuler\) \.cm-find-widget \{ right: calc\(var\(--cm-minimap-w, 0px\) \+ 28px\); \}/)
    })
    it('minimap 面板宽按右侧列宽算:没有列时 verticalScrollbarWidth 0(编辑器 766 → 87,有列 85)', () => {
        const setup = (v: EditorView) => {
            Object.defineProperty(v.dom, 'clientWidth', { configurable: true, get: () => 766 })
            v.oracle.charWidth = 7.8267952127659575
            v.dom.getBoundingClientRect = () => ({ left: 0, top: 0, right: 766, bottom: 400, width: 766, height: 400, x: 0, y: 0, toJSON() {} }) as DOMRect
            v.scrollDOM.getBoundingClientRect = () => ({ left: 65, top: 0, right: 600, bottom: 400, width: 535, height: 400, x: 65, y: 0, toJSON() {} }) as DOMRect
        }
        for (const [vsb, want] of [[14, '85px'], [0, '87px']] as const) {
            const host = document.createElement('div')
            document.body.appendChild(host)
            const view = new EditorView({ state: EditorState.create({ doc: 'a' }), parent: host })
            setup(view)
            const off = minimapCM7(hl, { lang: 'typescript', theme: 'dark-plus' }, palette, { verticalScrollbarWidth: vsb })(view)
            expect((view.dom.querySelector('.cm-minimap') as HTMLElement).style.width, `vsb ${vsb}`).toBe(want)
            off(); view.destroy(); host.remove()
        }
    })
})

describe('缩进参考线间距跟缩进选项走(Monaco guides 用 model.getOptions().indentSize)', () => {
    const style = (state: EditorState) => {
        const out: string[] = []
        const cur = indentGuidesCM7()(state).iter()
        while (cur.value) { out.push((cur.value.spec as { attributes: { style: string } }).attributes.style); cur.next() }
        return out
    }
    it('没设过缩进选项:仍按内容推断(4 空格文档 → 4)', () => {
        const state = EditorState.create({ doc: 'a\n    b\n        c', extensions: [indentOptions.of([])] })
        expect(indentUnit(state)).toBe(4)
        expect(style(state)).toEqual(['--indent-depth:1;--indent-width:4', '--indent-depth:2;--indent-width:4'])
    })
    it('命令设成 2 空格(Indent Using Spaces / Detect Indentation)→ 间距 2,深度按 indentSize 重算', () => {
        let state = EditorState.create({ doc: 'a\n    b\n        c', extensions: [indentOptions.of([])] })
        state = state.update({ effects: setIndentOptions(state, { insertSpaces: true, indentSize: 2, tabSize: 2 }) }).apply()
        expect(indentUnit(state)).toBe(2)
        expect(style(state)).toEqual(['--indent-depth:2;--indent-width:2', '--indent-depth:4;--indent-width:2'])
    })
    it('Tab 文档改 Tab 显示宽(Change Tab Display Size)→ 间距 = 新 tabSize,立即生效(按 doc 缓存的推断值不粘住)', () => {
        let state = EditorState.create({ doc: 'a\n\tb\n\t\tc', extensions: [indentOptions.of([])] })
        expect(indentUnit(state)).toBe(4)
        state = state.update({ effects: setIndentOptions(state, { tabSize: 2, insertSpaces: false }) }).apply()
        expect(indentUnit(state)).toBe(2)
        expect(style(state)).toEqual(['--indent-depth:1;--indent-width:2', '--indent-depth:2;--indent-width:2'])
    })
    it('没有选项槽、只改宿主 tabSize:推断值按新 tabSize 重算(不按 doc 缓存粘住旧值)', () => {
        const a = EditorState.create({ doc: 'a\n\tb' })
        expect(indentUnit(a)).toBe(4)
        const b = a.update({ effects: [] }).apply()
        expect(indentUnit(b)).toBe(4)
        const c = EditorState.create({ doc: a.doc, extensions: [EditorState.tabSize.of(8)] })
        expect(c.doc).toBe(a.doc)
        expect(indentUnit(c)).toBe(8)
    })
    it('视图里改 Tab 宽后参考线 DOM 立即跟着变(装饰变化的行重画)', () => {
        const host = document.createElement('div')
        document.body.appendChild(host)
        const view = new EditorView({
            state: EditorState.create({ doc: 'a\n\tb\n\t\tc', extensions: [indentOptions.of([])] }),
            parent: host,
            decorationProviders: [indentGuidesCM7()],
        })
        const styles = () => Array.from(view.contentDOM.querySelectorAll('.cm-indentGuide')).map(el => (el as HTMLElement).style.getPropertyValue('--indent-width').trim())
        expect(styles()).toEqual(['4', '4'])
        view.dispatch(view.state.update({ effects: setIndentOptions(view.state, { tabSize: 2, insertSpaces: false }) }))
        expect(styles()).toEqual(['2', '2'])
        view.destroy(); host.remove()
    })
})
