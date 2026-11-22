// 类型层对齐时顺带改的运行时行为(Monaco 权威):Uri 静态方法、CancellationToken 监听参数、位置/选区返回真类实例、
// cursor / mouse 事件载荷、ITextModel 新成员、编辑器新成员(字形边距挂件 / getLineHeightForPosition 等)。
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, mountEditor, rect, stubGeometry } from './h2-helpers'
const { Uri, Position, Range, Selection, createModel, CancellationTokenSource, GlyphMarginLane } = await import('../../src/index')
const { MouseTargetType } = await import('../../src/core/view/viewapi')
const { EditorOption } = await import('../../src/core/options')

afterEach(cleanup)

describe('Uri', () => {
    it('joinPath / revive / with(null)', () => {
        const u = Uri.parse('file:///a/b')
        expect(Uri.joinPath(u, '..', 'c', 'd.ts').path).toBe('/a/c/d.ts')
        const back = Uri.revive(JSON.parse(JSON.stringify(Uri.parse('http://x.com/p?q=1#f'))))
        expect(back).toBeInstanceOf(Uri)
        expect(back.toString()).toBe(Uri.parse('http://x.com/p?q=1#f').toString())
        expect(back.query).toBe('q=1')
        expect(Uri.revive(undefined)).toBeUndefined()
        expect(Uri.revive(null)).toBeNull()
        expect(Uri.parse('http://x.com/p?q=1#f').with({ query: null, fragment: null }).toString()).toBe('http://x.com/p')
    })
})

describe('CancellationToken', () => {
    it('onCancellationRequested 带 thisArgs / disposables', () => {
        const src = new CancellationTokenSource()
        const self = { n: 0 }
        const ds: { dispose(): void }[] = []
        src.token.onCancellationRequested(function (this: typeof self) { this.n++ }, self, ds)
        expect(ds).toHaveLength(1)
        src.cancel()
        expect(self.n).toBe(1)
    })
})

describe('位置 / 选区是真类实例', () => {
    it('getPosition / getSelection / getSelections / getVisibleRanges', () => {
        const ed = mountEditor('abc\ndef')
        ed.setSelection({ startLineNumber: 1, startColumn: 2, endLineNumber: 2, endColumn: 3 })
        expect(ed.getPosition()).toBeInstanceOf(Position)
        expect(ed.getSelection()).toBeInstanceOf(Selection)
        expect(ed.getSelections()[0]).toBeInstanceOf(Selection)
        expect(ed.getSelection().getStartPosition()).toBeInstanceOf(Position)
        for (const r of ed.getVisibleRanges()) expect(r).toBeInstanceOf(Range)
    })

    it('onDidChangeCursorPosition / Selection 的载荷里是真类实例', () => {
        const ed = mountEditor('abc\ndef')
        const pos = vi.fn(), sel = vi.fn()
        ed.onDidChangeCursorPosition(pos)
        ed.onDidChangeCursorSelection(sel)
        ed.setPosition({ lineNumber: 2, column: 2 })
        expect(pos.mock.calls[0][0].position).toBeInstanceOf(Position)
        expect(pos.mock.calls[0][0].secondaryPositions.every((p: unknown) => p instanceof Position)).toBe(true)
        expect(sel.mock.calls[0][0].selection).toBeInstanceOf(Selection)
    })
})

describe('ITextModel 新成员', () => {
    it('isValidRange:Monaco 语义(越界 / 倒置 / 列落在代理对中间都不合法)', () => {
        const m = createModel('ab\n😀x', 'plaintext')
        expect(m.isValidRange({ startLineNumber: 1, startColumn: 1, endLineNumber: 2, endColumn: 4 })).toBe(true)
        expect(m.isValidRange({ startLineNumber: 1, startColumn: 1, endLineNumber: 3, endColumn: 1 })).toBe(false)
        expect(m.isValidRange({ startLineNumber: 1, startColumn: 4, endLineNumber: 1, endColumn: 5 })).toBe(false)
        expect(m.isValidRange({ startLineNumber: 2, startColumn: 2, endLineNumber: 2, endColumn: 3 })).toBe(false) // 😀 中间
        m.dispose()
    })

    it('isAttachedToEditor:挂上编辑器为真,换走为假', () => {
        const ed = mountEditor('x')
        const model = ed.getModel()
        expect(model.isAttachedToEditor()).toBe(true)
        const other = createModel('y', 'plaintext')
        ed.setModel(other)
        expect(model.isAttachedToEditor()).toBe(false)
        other.dispose()
    })

    it('onDidChangeContent.isEolChange 恒为布尔', () => {
        const m = createModel('a', 'plaintext')
        const evs: boolean[] = []
        m.onDidChangeContent(e => evs.push(e.isEolChange))
        m.applyEdits([{ range: { startLineNumber: 1, startColumn: 2, endLineNumber: 1, endColumn: 2 }, text: 'b' }])
        m.pushEOL(1)
        expect(evs.every(v => typeof v === 'boolean')).toBe(true)
        expect(evs[0]).toBe(false)
        m.dispose()
    })

    it('getCustomLineHeightsDecorations:只含带 lineHeight 的装饰', () => {
        const ed = mountEditor('a\nb\nc')
        ed.createDecorationsCollection([
            { range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }, options: { lineHeight: 40 } },
            { range: { startLineNumber: 2, startColumn: 1, endLineNumber: 2, endColumn: 1 }, options: { className: 'x' } },
        ])
        const got = ed.getModel().getCustomLineHeightsDecorations()
        expect(got.map((d: { options: { lineHeight?: number } }) => d.options.lineHeight)).toEqual([40])
    })
})

describe('编辑器新成员', () => {
    it('inComposition / hasPendingScrollAnimation 初值为 false', () => {
        const ed = mountEditor('abc')
        expect(ed.inComposition).toBe(false)
        expect(ed.hasPendingScrollAnimation()).toBe(false)
    })

    it('getVisibleColumnFromPosition:tab 展开(tabSize 4)', () => {
        const ed = mountEditor('\tab')
        ed.getModel().updateOptions({ tabSize: 4 })
        expect(ed.getVisibleColumnFromPosition({ lineNumber: 1, column: 1 })).toBe(1)
        expect(ed.getVisibleColumnFromPosition({ lineNumber: 1, column: 2 })).toBe(5)
        expect(ed.getVisibleColumnFromPosition({ lineNumber: 1, column: 3 })).toBe(6)
    })

    it('getLineHeightForPosition:默认行高;lineHeight 装饰撑高', () => {
        const ed = mountEditor('a\nb')
        const base = ed.getLineHeightForPosition({ lineNumber: 1, column: 1 })
        expect(base).toBeGreaterThan(0)
        ed.createDecorationsCollection([{ range: { startLineNumber: 2, startColumn: 1, endLineNumber: 2, endColumn: 1 }, options: { lineHeight: base * 2 } }])
        expect(ed.getLineHeightForPosition({ lineNumber: 2, column: 1 })).toBe(base * 2)
        expect(ed.getLineHeightForPosition({ lineNumber: 1, column: 1 })).toBe(base)
    })

    it('getFontSizeAtPosition:allowVariableFonts 关 → null;开 → 字体装饰的字号优先', () => {
        const off = mountEditor('a', { options: { allowVariableFonts: false } })
        expect(off.getFontSizeAtPosition({ lineNumber: 1, column: 1 })).toBeNull()
        const ed = mountEditor('a\nb', { options: { allowVariableFonts: true } })
        ed.createDecorationsCollection([{ range: { startLineNumber: 2, startColumn: 1, endLineNumber: 2, endColumn: 2 }, options: { fontSize: '30px' } }])
        expect(ed.getFontSizeAtPosition({ lineNumber: 2, column: 1 })).toBe('30px')
        expect(ed.getFontSizeAtPosition({ lineNumber: 1, column: 1 })).toMatch(/^\d+(\.\d+)?px$/)
    })

    it('applyFontInfo:把编辑器字体写到目标元素', () => {
        const ed = mountEditor('a', { options: { fontFamily: 'Foo', fontSize: 17 } })
        const el = document.createElement('div')
        ed.applyFontInfo(el)
        expect(el.style.fontFamily).toContain('Foo')
        expect(el.style.fontSize).toBe('17px')
    })

    it('getScrolledVisiblePosition:top 扣掉滚动;高度 = 行高', () => {
        const ed = mountEditor('a\nb\nc')
        stubGeometry(ed)
        const p = ed.getScrolledVisiblePosition({ lineNumber: 1, column: 1 })
        expect(p).toEqual(expect.objectContaining({ height: ed.getLineHeightForPosition({ lineNumber: 1, column: 1 }) }))
        expect(typeof p.top).toBe('number')
        expect(typeof p.left).toBe('number')
    })

    it('setBanner:预留高度并挂/摘 DOM', () => {
        const ed = mountEditor('a')
        const b = document.createElement('div')
        ed.setBanner(b, 30)
        expect(ed.dom.contains(b)).toBe(true)
        expect(ed.dom.style.paddingTop).toBe('30px')
        ed.setBanner(null, 0)
        expect(ed.dom.contains(b)).toBe(false)
        expect(ed.dom.style.paddingTop).toBe('')
    })

    it('getOptions().get(EditorOption):按枚举取', () => {
        const ed = mountEditor('a', { options: { wordWrapColumn: 77 } })
        expect(typeof ed.getOptions().get).toBe('function')
        expect(ed.getOptions().get(EditorOption.wordWrapColumn)).toBe(77)
        expect(ed.getOptions().get(EditorOption.wordWrapColumn)).toBe(ed.getOption(EditorOption.wordWrapColumn))
    })

    it('IEditorAction.metadata 存在(恒 undefined)', () => {
        const ed = mountEditor('a')
        const a = ed.getAction('actions.find')
        expect(a).not.toBeNull()
        expect('metadata' in a).toBe(true)
        expect(a.metadata).toBeUndefined()
    })
})

describe('字形边距挂件', () => {
    function glyph(id: string, line: number, lane = GlyphMarginLane.Left, zIndex = 1) {
        const n = document.createElement('div')
        return { n, w: { getId: () => id, getDomNode: () => n, getPosition: () => ({ lane, zIndex, range: { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: 1 } }) } }
    }

    it('add 挂 DOM 并按行定位;remove 摘掉', () => {
        const ed = mountEditor('a\nb\nc', { options: { glyphMargin: true } })
        stubGeometry(ed)
        const { n, w } = glyph('g1', 2)
        ed.addGlyphMarginWidget(w)
        expect(ed.dom.contains(n)).toBe(true)
        expect(n.getAttribute('widgetid')).toBe('g1')
        expect(n.style.position).toBe('absolute')
        const topLine2 = parseFloat(n.style.top)
        const g3 = glyph('g3', 3)
        ed.addGlyphMarginWidget(g3.w)
        expect(parseFloat(g3.n.style.top)).toBeGreaterThan(topLine2)
        ed.removeGlyphMarginWidget(w)
        expect(ed.dom.contains(n)).toBe(false)
        expect(n.getAttribute('widgetid')).toBeNull()
    })

    it('layoutGlyphMarginWidget:getPosition 变了就重摆', () => {
        const ed = mountEditor('a\nb\nc', { options: { glyphMargin: true } })
        stubGeometry(ed)
        let line = 1
        const n = document.createElement('div')
        const w = { getId: () => 'g', getDomNode: () => n, getPosition: () => ({ lane: GlyphMarginLane.Left, zIndex: 1, range: { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: 1 } }) }
        ed.addGlyphMarginWidget(w)
        const t1 = parseFloat(n.style.top)
        line = 3
        ed.layoutGlyphMarginWidget(w)
        expect(parseFloat(n.style.top)).toBeGreaterThan(t1)
    })

    it('同车道不同 lane 拿到不同的 left', () => {
        const ed = mountEditor('a\nb', { options: { glyphMargin: true } })
        stubGeometry(ed)
        const a = glyph('a', 1, GlyphMarginLane.Left), b = glyph('b', 1, GlyphMarginLane.Right)
        ed.addGlyphMarginWidget(a.w)
        ed.addGlyphMarginWidget(b.w)
        expect(parseFloat(a.n.style.left)).not.toBe(parseFloat(b.n.style.left))
    })
})

describe('内容挂件 before/afterRender 签名(Monaco)', () => {
    it('afterRender 收到 (选中的 preference, {top,left});隐藏时 (null, null)', () => {
        const ed = mountEditor('abc\ndef')
        stubGeometry(ed)
        const n = document.createElement('div')
        n.getBoundingClientRect = () => rect(0, 0, 100, 30)
        const after = vi.fn()
        let pos: unknown = { lineNumber: 2, column: 2 }
        const w = { getId: () => 'c', getDomNode: () => n, getPosition: () => pos === null ? null : { position: pos, preference: [0] }, afterRender: after }
        ed.addContentWidget(w)
        const [pref, coord] = after.mock.calls.at(-1)!
        expect(pref).toBe(0)
        expect(coord).toEqual({ top: expect.any(Number), left: expect.any(Number) })
        pos = null
        ed.layoutContentWidget(w)
        expect(after.mock.calls.at(-1)).toEqual([null, null])
    })
})

describe('IMouseTarget 判别联合', () => {
    it('MouseTargetType 枚举值与 Monaco 一致', () => {
        expect(MouseTargetType.CONTENT_TEXT).toBe(6)
        expect(MouseTargetType.GUTTER_LINE_NUMBERS).toBe(3)
    })
})
