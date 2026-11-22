// 首开路径的几处推迟:首帧画完之后再做的事(afterNextPaint)、大文档第一次算折叠范围、原生 split 的切行。
import { describe, expect, it, vi } from 'vitest'
import { afterNextPaint } from '../../src/core/view/afterpaint'
import { EditorState } from '../../src/core/model/state'
import { foldGutterSpec, foldable, isIndentRangesCached } from '../../src/core/edit/fold'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

describe('afterNextPaint', () => {
    it('跑一次,且在 rAF 之后', async () => {
        const order: string[] = []
        requestAnimationFrame(() => order.push('raf'))
        afterNextPaint(() => order.push('after'))
        order.push('sync')
        await sleep(300)
        expect(order[0]).toBe('sync')
        expect(order.filter(x => x === 'after')).toHaveLength(1)
        expect(order.indexOf('raf')).toBeLessThan(order.indexOf('after'))
    })
    it('取消后不跑', async () => {
        const fn = vi.fn()
        afterNextPaint(fn)()
        await sleep(300)
        expect(fn).not.toHaveBeenCalled()
    })
})

describe('切行(没有 \\r 走原生 split)', () => {
    const big = (sep: string, n = 3000) => Array.from({ length: n }, (_, i) => `line ${i} ${'x'.repeat(i % 7)}`).join(sep)
    it('\\n:行数、内容、长度', () => {
        const text = big('\n')
        const s = EditorState.create({ doc: text })
        expect(s.doc.lines).toBe(3000)
        expect(s.doc.line(1500).text).toBe(`line 1499 ${'x'.repeat(1499 % 7)}`)
        expect(s.doc.length).toBe(text.length)
        expect(s.doc.toString()).toBe(text)
    })
    it('带 \\r\\n 和单独的 \\r 照旧当换行', () => {
        const text = big('\r\n') + '\rtail'
        expect(text.length).toBeGreaterThan(4096)
        const s = EditorState.create({ doc: text })
        expect(s.doc.lines).toBe(3001 + 0)
        expect(s.doc.line(3001).text).toBe('tail')
        expect(s.doc.line(1).text).toBe('line 0 ')
    })
    it('尾部换行、空行、空文档', () => {
        const text = big('\n') + '\n\n'
        const s = EditorState.create({ doc: text })
        expect(s.doc.lines).toBe(3002)
        expect(s.doc.line(3002).text).toBe('')
        expect(EditorState.create({ doc: '' }).doc.lines).toBe(1)
    })
})

describe('折叠箭头:大文档第一次算折叠范围放到首帧之后', () => {
    const block = (n: number) => Array.from({ length: n }, (_, i) => `function f${i}() {\n    return ${i}\n}`).join('\n')
    it('小文档同步有箭头', () => {
        const spec = foldGutterSpec(() => {})
        const state = EditorState.create({ doc: block(50) })
        expect(spec.foldableAt(state, 0)).toBe(true)
    })
    it('2 万行以上:先给近似答案并排程,算好后通知,之后同步', async () => {
        const spec = foldGutterSpec(() => {})
        const ready = vi.fn()
        spec.onReady(ready)
        const state = EditorState.create({ doc: block(8000) }) // 24000 行
        expect(state.doc.lines).toBeGreaterThanOrEqual(20000)
        // 近似:函数头(下一行缩进更深)可折,收尾的 } 和函数体里的行不可折;此刻没算折叠范围
        expect(spec.foldableAt(state, 0)).toBe(true)
        expect(spec.foldableAt(state, state.doc.line(2).from)).toBe(false)
        expect(spec.foldableAt(state, state.doc.line(3).from)).toBe(false)
        expect(isIndentRangesCached(state)).toBe(false)
        expect(ready).not.toHaveBeenCalled()
        await sleep(300)
        expect(ready).toHaveBeenCalledTimes(1)
        expect(isIndentRangesCached(state)).toBe(true)
        expect(spec.foldableAt(state, 0)).toBe(true)
    })
    it('2 万行以上编辑之后:按键同步路径不算折叠范围,合并成一次精确重算再通知', async () => {
        const spec = foldGutterSpec(() => {})
        const ready = vi.fn()
        spec.onReady(ready)
        let state = EditorState.create({ doc: block(8000) })
        spec.foldableAt(state, 0)
        await sleep(300)
        expect(ready).toHaveBeenCalledTimes(1)
        // 连着三次 Enter,每次画 gutter 的几行
        for (let k = 0; k < 3; k++) {
            state = state.update({ changes: { from: state.doc.line(10).to, insert: '\n' } }).apply()
            for (let n = 8; n <= 14; n++) spec.foldableAt(state, state.doc.line(n).from)
            expect(isIndentRangesCached(state)).toBe(false)
        }
        expect(ready).toHaveBeenCalledTimes(1)
        await sleep(400)
        expect(ready).toHaveBeenCalledTimes(2)
        expect(isIndentRangesCached(state)).toBe(true)
    })
    it('近似答案与精确答案:普通缩进代码逐行一致', () => {
        const state = EditorState.create({ doc: block(8000) })
        const approx = foldGutterSpec(() => {})
        const exact = Array.from({ length: 60 }, (_, i) => foldable(state, state.doc.line(i + 1).from) !== null)
        const got = Array.from({ length: 60 }, (_, i) => approx.foldableAt(state, state.doc.line(i + 1).from))
        expect(got).toEqual(exact)
    })
})

describe('region 标记的预筛(首个非空白字符要是标记字面量的首字符)', async () => {
    const { regionMarker, markerPrefilter } = await import('../../src/core/edit/fold')
    const ts = { start: [['//', { ws: 0 }, { opt: '#' }, { word: 'region' }]], end: [['//', { ws: 0 }, { opt: '#' }, { word: 'endregion' }]] } as never
    const html = { start: [['<!--', { ws: 0 }, { opt: '#' }, { word: 'region' }], ['#pragma', { ws: 1 }, { word: 'region' }]], end: [['<!--', { ws: 0 }, { opt: '#' }, { word: 'endregion' }]] } as never
    it('结果和不预筛时一样', () => {
        const cases: [unknown, string, 'open' | 'close' | null][] = [
            [ts, '// #region foo', 'open'], [ts, '  //region', 'open'], [ts, '// #endregion', 'close'], [ts, '// regional', null],
            [ts, 'const a = 1', null], [ts, '', null], [ts, 'x // #region', null],
            [html, '<!-- #region x -->', 'open'], [html, '  #pragma region', 'open'], [html, '<!-- #endregion -->', 'close'], [html, '<div>', null],
        ]
        for (const [m, text, want] of cases) expect(regionMarker(m as never, text), text).toBe(want)
    })
    it('没有字面量或是 regex 标记时不预筛', () => {
        expect(markerPrefilter({ start: [[{ ws: 0 }]], end: [] } as never)).toBeNull()
        expect(markerPrefilter({ start: [], end: [], regex: { start: /a/, end: /b/ } } as never)).toBeNull()
        expect(markerPrefilter({ start: [[{ opt: '#' }, 'x']], end: [] } as never)).toBeNull()
        expect(markerPrefilter(ts)!('no marker here')).toBe(false)
        expect(markerPrefilter(ts)!('   \t// #endregion')).toBe(true)
        expect(markerPrefilter(ts)!('')).toBe(false)
    })
})
