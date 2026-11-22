// updateSectionHeaders(增量)== findSectionHeaders(整篇重扫):任意编辑(改一行、插删多行、头尾、整篇替换)后逐项相同。
import { describe, expect, it } from 'vitest'
import { findSectionHeaders, updateSectionHeaders, type SectionHeader } from '../../src/core/chrome/sectionheaders'
import { foldingMarkers } from '../../src/core/edit/fold'

const markers = {
    start: [['//', { ws: 0 }, { opt: '#' }, { word: 'region' }]],
    end: [['//', { ws: 0 }, { opt: '#' }, { word: 'endregion' }]],
} as never
const opts = { region: true, mark: true, markers }
void foldingMarkers

const rng = (seed: number) => { let s = seed; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32 }
const LINES = ['const a = 1', '// #region Setup', '// MARK: - Helpers', '// #region', '  foo()', '// #endregion', '/* MARK: x */', '// MARK:', 'x // MARK: tail', '', '//#region  -Dashed-']

describe('updateSectionHeaders', () => {
    it('随机编辑序列:每一步都与整篇重扫逐项相同', () => {
        const r = rng(5)
        let lines = Array.from({ length: 300 }, () => LINES[Math.floor(r() * LINES.length)])
        let prev: { lines: string[], headers: SectionHeader[] } | null = null
        for (let step = 0; step < 200; step++) {
            const next = lines.slice()
            const kind = Math.floor(r() * 5)
            const at = Math.floor(r() * (next.length + 1))
            if (kind === 0 && next.length) next[Math.min(at, next.length - 1)] = LINES[Math.floor(r() * LINES.length)]
            else if (kind === 1) next.splice(at, 0, ...Array.from({ length: 1 + Math.floor(r() * 3) }, () => LINES[Math.floor(r() * LINES.length)]))
            else if (kind === 2 && next.length > 5) next.splice(at, 1 + Math.floor(r() * 3))
            else if (kind === 3) next.splice(0, 0, LINES[Math.floor(r() * LINES.length)])
            else if (kind === 4) next.push(LINES[Math.floor(r() * LINES.length)])
            lines = next
            const got = updateSectionHeaders(prev, lines, opts)
            expect(got, `step ${step}`).toEqual(findSectionHeaders(lines, opts))
            prev = { lines, headers: got }
        }
    })
    it('没变 = 同一个结果对象;整篇换成别的也对', () => {
        const lines = [...LINES]
        const h = findSectionHeaders(lines, opts)
        expect(updateSectionHeaders({ lines, headers: h }, [...lines], opts)).toBe(h)
        const other = ['// MARK: only', 'x']
        expect(updateSectionHeaders({ lines, headers: h }, other, opts)).toEqual(findSectionHeaders(other, opts))
    })
})
