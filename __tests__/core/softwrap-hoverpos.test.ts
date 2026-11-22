import { describe, expect, it } from 'vitest'
import { core, createEditor } from '../../src'
import { fakeHl, QUIET } from './h1-helpers'

describe('computeHoverPositions(hover 卡定位)', () => {
    const make = (text: string, opts: Record<string, unknown> = {}) => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const ed = createEditor(parent, { value: text, highlighter: fakeHl(), features: QUIET, ...opts } as never)
        return { ed: ed as never, dispose: () => { ed.dispose(); parent.remove() } }
    }
    const R = (a: number, b: number, c: number, d: number) => ({ startLineNumber: a, startColumn: b, endLineNumber: c, endColumn: d })

    it('part 跨到锚点行之外:secondary 不动(issue #151235)', () => {
        const h = make('just some text')
        const r = core.computeHoverPositions(h.ed, R(5, 5, 5, 5), [{ range: R(4, 1, 5, 6) }])
        expect(r.showAtPosition).toEqual({ lineNumber: 5, column: 5 })
        expect(r.showAtSecondaryPosition).toEqual({ lineNumber: 5, column: 5 })
        h.dispose()
    })
    it('同行 part 起点更靠左:secondary 取它', () => {
        const h = make('just some text')
        const r = core.computeHoverPositions(h.ed, R(1, 8, 1, 8), [{ range: R(1, 3, 1, 15) }])
        expect(r.showAtSecondaryPosition).toEqual({ lineNumber: 1, column: 3 })
        h.dispose()
    })
    it('软折行:secondary 不越过锚点所在视觉行行首(issue #95328)', () => {
        const h = make('just some text', { wordWrap: 'wordWrapColumn', wordWrapColumn: 6 })
        const r = core.computeHoverPositions(h.ed, R(1, 8, 1, 8), [{ range: R(1, 1, 1, 15) }])
        expect(r.showAtSecondaryPosition).toEqual({ lineNumber: 1, column: 6 })
        h.dispose()
    })
    it('forceShowAtRange:两个位置都钉在该 range 起点', () => {
        const h = make('just some text')
        const r = core.computeHoverPositions(h.ed, R(1, 8, 1, 8), [{ range: R(1, 2, 1, 4), forceShowAtRange: true }])
        expect(r.showAtPosition).toEqual({ lineNumber: 1, column: 2 })
        expect(r.showAtSecondaryPosition).toEqual({ lineNumber: 1, column: 2 })
        h.dispose()
    })
})
