// H2:装饰 —— deltaDecorations / createDecorationsCollection / 查询 / 事件 / stickiness / options 映射。
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, mountEditor } from './h2-helpers'
const { TrackedRangeStickiness } = await import('../../src/api/decorations')

afterEach(cleanup)

const R = (a: number, b: number, c: number, d: number) => ({ startLineNumber: a, startColumn: b, endLineNumber: c, endColumn: d })
const rng = (r: { startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number } | null) =>
    r && [r.startLineNumber, r.startColumn, r.endLineNumber, r.endColumn]

describe('deltaDecorations', () => {
    it('返回稳定 id,范围能取回,随编辑移动', () => {
        const ed = mountEditor('hello world')
        const [id] = ed.deltaDecorations([], [{ range: R(1, 7, 1, 12), options: { description: 't', className: 'w' } }])
        expect(typeof id).toBe('string')
        expect(rng(ed.getDecorationRange(id))).toEqual([1, 7, 1, 12])
        // 在前面插 3 个字符:整体后移
        ed.dispatch(ed.state.update({ changes: { from: 0, insert: 'abc' } }))
        expect(rng(ed.getDecorationRange(id))).toEqual([1, 10, 1, 15])
        // 再在前面插换行:行号变
        ed.dispatch(ed.state.update({ changes: { from: 0, insert: '\n' } }))
        expect(rng(ed.getDecorationRange(id))).toEqual([2, 10, 2, 15])
        expect(ed.getDecorationOptions(id).className).toBe('w')
    })

    it('旧 id 被替换后查不到;空数组清掉', () => {
        const ed = mountEditor('abc def')
        const [a] = ed.deltaDecorations([], [{ range: R(1, 1, 1, 4), options: { description: 'a' } }])
        const [b] = ed.deltaDecorations([a], [{ range: R(1, 5, 1, 8), options: { description: 'b' } }])
        expect(ed.getDecorationRange(a)).toBeNull()
        expect(rng(ed.getDecorationRange(b))).toEqual([1, 5, 1, 8])
        ed.removeDecorations([b])
        expect(ed.getDecorationRange(b)).toBeNull()
    })

    it('越界范围被夹到文档内', () => {
        const ed = mountEditor('abc')
        const [id] = ed.deltaDecorations([], [{ range: R(1, 1, 99, 99), options: { description: 'x' } }])
        expect(rng(ed.getDecorationRange(id))).toEqual([1, 1, 1, 4])
    })

    it('不进撤销栈:装饰增删之后 undo 仍撤销上一次编辑', () => {
        const ed = mountEditor('a')
        ed.executeEdits('t', [{ range: R(1, 2, 1, 2), text: 'b' }])
        ed.deltaDecorations([], [{ range: R(1, 1, 1, 2), options: { description: 'x' } }])
        expect(ed.state.doc.toString()).toBe('ab')
    })
})

describe('stickiness 四种', () => {
    // 文档 "0123456789",装饰 [3,6),分别在 3 和 6 处插入 'X'
    const run = (stickiness: number, at: number) => {
        const ed = mountEditor('0123456789')
        const [id] = ed.deltaDecorations([], [{ range: R(1, 4, 1, 7), options: { description: 's', stickiness } }])
        ed.dispatch(ed.state.update({ changes: { from: at, insert: 'X' } }))
        return rng(ed.getDecorationRange(id))!.filter((_: number, i: number) => i === 1 || i === 3)
    }

    it('AlwaysGrowsWhenTypingAtEdges:两端插入都被包进来', () => {
        expect(run(TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 3)).toEqual([4, 8])
        expect(run(TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 6)).toEqual([4, 8])
    })
    it('NeverGrowsWhenTypingAtEdges:两端插入都不进来', () => {
        expect(run(TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 3)).toEqual([5, 8])
        expect(run(TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 6)).toEqual([4, 7])
    })
    it('GrowsOnlyWhenTypingBefore:只有起点处插入进来', () => {
        expect(run(TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 3)).toEqual([4, 8])
        expect(run(TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 6)).toEqual([4, 7])
    })
    it('GrowsOnlyWhenTypingAfter:只有终点处插入进来', () => {
        expect(run(TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 3)).toEqual([5, 8])
        expect(run(TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 6)).toEqual([4, 8])
    })

    it('collapseOnReplaceEdit:整段被替换时塌成一点', () => {
        const ed = mountEditor('0123456789')
        const [a, b] = ed.deltaDecorations([], [
            { range: R(1, 4, 1, 7), options: { description: 'c', collapseOnReplaceEdit: true } },
            { range: R(1, 4, 1, 7), options: { description: 'n' } },
        ])
        ed.dispatch(ed.state.update({ changes: { from: 3, to: 6, insert: 'YY' } }))
        expect(rng(ed.getDecorationRange(a))).toEqual([1, 4, 1, 4])
        expect(rng(ed.getDecorationRange(b))).toEqual([1, 4, 1, 6])
    })
})

describe('查询', () => {
    it('getLineDecorations / getDecorationsInRange 按位置排序,只含本编辑器的', () => {
        const ed = mountEditor('aaa\nbbb\nccc')
        const [idLine2, idLine1] = ed.deltaDecorations([], [
            { range: R(2, 1, 2, 3), options: { description: 'y' } },
            { range: R(1, 1, 1, 3), options: { description: 'x' } },
        ])
        const line1 = ed.getLineDecorations(1)
        expect(line1.map((d: { id: string }) => d.id)).toEqual([idLine1])
        expect(ed.getLineDecorations(2).map((d: { id: string }) => d.id)).toEqual([idLine2])
        const inRange = ed.getDecorationsInRange(R(1, 1, 3, 4))
        expect(inRange.map((d: { options: { description: string } }) => d.options.description)).toEqual(['x', 'y'])
        expect(inRange[0].range.startLineNumber).toBe(1)
        expect(ed.getLineDecorations(3)).toEqual([])
        const other = mountEditor('aaa\nbbb')
        expect(other.getDecorationsInRange(R(1, 1, 2, 4))).toEqual([])
    })
})

describe('createDecorationsCollection', () => {
    it('set / append / length / getRange(s) / has / clear', () => {
        const ed = mountEditor('aaa bbb ccc')
        const c = ed.createDecorationsCollection([{ range: R(1, 1, 1, 4), options: { description: 'a' } }])
        expect(c.length).toBe(1)
        c.append([{ range: R(1, 5, 1, 8), options: { description: 'b' } }])
        expect(c.length).toBe(2)
        expect(c.getRanges().map(rng)).toEqual([[1, 1, 1, 4], [1, 5, 1, 8]])
        expect(rng(c.getRange(1))).toEqual([1, 5, 1, 8])
        expect(c.getRange(5)).toBeNull()
        const ours = ed.getLineDecorations(1)[0]
        expect(c.has(ours)).toBe(true)
        c.set([{ range: R(1, 9, 1, 12), options: { description: 'c' } }])
        expect(c.length).toBe(1)
        expect(c.has(ours)).toBe(false)
        c.clear()
        expect(c.length).toBe(0)
        expect(ed.getLineDecorations(1)).toEqual([])
    })

    it('范围随编辑移动(getRanges 取到新位置)', () => {
        const ed = mountEditor('hello')
        const c = ed.createDecorationsCollection([{ range: R(1, 3, 1, 5), options: { description: 'a' } }])
        ed.dispatch(ed.state.update({ changes: { from: 0, insert: '12' } }))
        expect(c.getRanges().map(rng)).toEqual([[1, 5, 1, 7]])
    })

    it('onDidChange:自己的 set 不触发集合事件,别的集合 / deltaDecorations 的变化会', () => {
        const ed = mountEditor('abc')
        const a = ed.createDecorationsCollection()
        let n = 0
        a.onDidChange(() => n++)
        a.set([{ range: R(1, 1, 1, 2), options: { description: 'a' } }])
        expect(n).toBe(0)
        ed.deltaDecorations([], [{ range: R(1, 2, 1, 3), options: { description: 'o' } }])
        expect(n).toBe(1)
    })
})

describe('onDidChangeModelDecorations', () => {
    it('增删装饰触发,带 affectsGlyphMargin / affectsLineNumber', () => {
        const ed = mountEditor('abc')
        const seen: Record<string, boolean>[] = []
        ed.onDidChangeModelDecorations((e: Record<string, boolean>) => seen.push(e))
        const [id] = ed.deltaDecorations([], [{ range: R(1, 1, 1, 2), options: { description: 'g', glyphMarginClassName: 'bp' } }])
        expect(seen.length).toBe(1)
        expect(seen[0].affectsGlyphMargin).toBe(true)
        ed.deltaDecorations([id], [{ range: R(1, 1, 1, 2), options: { description: 'l', lineNumberClassName: 'ln' } }])
        expect(seen[seen.length - 1].affectsLineNumber).toBe(true)
    })
})

describe('options → DOM', () => {
    it('className / inlineClassName 画成 mark;isWholeLine 画成行类', () => {
        const ed = mountEditor('hello world\nsecond')
        ed.deltaDecorations([], [
            { range: R(1, 1, 1, 6), options: { description: 'm', className: 'mk', inlineClassName: 'inl' } },
            { range: R(2, 1, 2, 1), options: { description: 'w', isWholeLine: true, className: 'whole' } },
        ])
        const mark = ed.contentDOM.querySelector('.mk')
        expect(mark?.textContent).toBe('hello')
        // Monaco:className 是行盒块(cm-decoBox,竖向补到行高),inlineClassName 是另一层字体框 span,两层各自带自己的类
        expect(mark?.classList.contains('cm-decoBox')).toBe(true)
        expect(mark?.classList.contains('inl')).toBe(false)
        expect(ed.contentDOM.querySelector('.inl')?.textContent).toBe('hello')
        expect(ed.contentDOM.querySelectorAll('.cm-line')[1].classList.contains('whole')).toBe(true)
    })

    it('before / after 注入文字、before/afterContentClassName', () => {
        const ed = mountEditor('abc')
        ed.deltaDecorations([], [{
            range: R(1, 2, 1, 3),
            options: { description: 'i', before: { content: '<<', inlineClassName: 'b' }, after: { content: '>>', inlineClassName: 'a' }, afterContentClassName: 'after-cls' },
        }])
        expect(ed.contentDOM.querySelector('.b')?.textContent).toBe('<<')
        expect(ed.contentDOM.querySelector('.a')?.textContent).toBe('>>')
        expect(ed.contentDOM.querySelector('.after-cls')).toBeTruthy()
    })

    it('空区间的注入文字:没有 showIfCollapsed 不显示,有才显示(Monaco getInjectedTextInInterval 的过滤,真 Chromium 实测)', () => {
        const ed = mountEditor('abc def')
        const [a] = ed.deltaDecorations([], [{ range: R(1, 4, 1, 4), options: { description: 'e', after: { content: '>>', inlineClassName: 'a' }, before: { content: '<<', inlineClassName: 'b' } } }])
        expect(ed.contentDOM.querySelector('.a')).toBeNull()
        expect(ed.contentDOM.querySelector('.b')).toBeNull()
        ed.deltaDecorations([a], [{ range: R(1, 4, 1, 4), options: { description: 'e', showIfCollapsed: true, after: { content: '>>', inlineClassName: 'a' }, before: { content: '<<', inlineClassName: 'b' } } }])
        expect(ed.contentDOM.querySelector('.a')?.textContent).toBe('>>')
        expect(ed.contentDOM.querySelector('.b')?.textContent).toBe('<<')
    })

    it('marginClassName / linesDecorationsClassName 写进 gutter 行(行号开着时)', () => {
        const ed = mountEditor('a\nb', { features: { lineNumbers: true, minimap: false, autocomplete: false, hover: false, stickyScroll: false } })
        ed.deltaDecorations([], [{ range: R(2, 1, 2, 1), options: { description: 'g', isWholeLine: true, marginClassName: 'mg', linesDecorationsClassName: 'ld' } }])
        const els = ed.dom.querySelectorAll('.cm-gutterElement')
        expect(els[1].classList.contains('mg')).toBe(true)
        expect(els[1].querySelector('.ld')).toBeTruthy()
        expect(els[0].classList.contains('mg')).toBe(false)
    })

    it('glyphMarginClassName 写进行装饰的 glyphClass(槽位由 view 画)', async () => {
        const ed = mountEditor('a\nb')
        ed.deltaDecorations([], [{ range: R(2, 1, 2, 1), options: { description: 'g', glyphMarginClassName: 'bp', glyphMargin: { position: 3 } } }])
        const { activeLineDecorations: _unused } = await import('../../src/core/index')
        const { LineDecoration } = await import('../../src/core/model/decoration')
        const { decorations } = await import('../../src/core/view/editorview')
        const found: unknown[] = []
        for (const d of ed.state.facet(decorations)) {
            const set = typeof d === 'function' ? d(ed.state) : d
            set.between(0, ed.state.doc.length, (_f: number, _t: number, v: unknown) => { if (v instanceof LineDecoration && v.spec.glyphClass) found.push(v.spec) })
        }
        expect(found).toEqual([expect.objectContaining({ glyphClass: 'bp', glyphLane: 3 })])
    })

    it('glyphMargin 选项开着:字形边距里出现 glyphMarginClassName 的元素(V 的槽位)', () => {
        const ed = mountEditor('a\nb', { options: { glyphMargin: true }, features: { lineNumbers: true, minimap: false, autocomplete: false, hover: false, stickyScroll: false } })
        ed.deltaDecorations([], [{ range: R(2, 1, 2, 1), options: { description: 'g', glyphMarginClassName: 'bp-dom' } }])
        expect(ed.dom.querySelector('.cm-glyphMargin-item.bp-dom')).toBeTruthy()
    })

    it('删除装饰后 DOM 类名撤走', () => {
        const ed = mountEditor('hello')
        const [id] = ed.deltaDecorations([], [{ range: R(1, 1, 1, 3), options: { description: 'm', className: 'gone' } }])
        expect(ed.contentDOM.querySelector('.gone')).toBeTruthy()
        ed.removeDecorations([id])
        expect(ed.contentDOM.querySelector('.gone')).toBeNull()
    })
})

describe('hoverMessage', () => {
    it('区间内悬浮时 hover 源给出 markdown 内容;区间外没有', async () => {
        const { hoverSources } = await import('../../src/core/feature/hover')
        const ed = mountEditor('hello world')
        ed.deltaDecorations([], [{ range: R(1, 1, 1, 6), options: { description: 'h', hoverMessage: { value: '**bold** tip' } } }])
        const sources = ed.state.facet(hoverSources) as ((s: unknown, pos: number, side: number) => { pos: number, end?: number, create: () => HTMLElement } | null)[]
        const hit = sources.map(f => f(ed.state, 2, 1)).find(Boolean)!
        expect([hit.pos, hit.end]).toEqual([0, 5])
        expect(hit.create().querySelector('strong')?.textContent).toBe('bold')
        expect(sources.map(f => f(ed.state, 8, 1)).find(Boolean)).toBeUndefined()
    })
})
