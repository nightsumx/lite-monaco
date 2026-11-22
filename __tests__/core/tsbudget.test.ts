import { describe, expect, it } from 'vitest'
import {
    diagnosticsPolicy,
    linePreviewAt,
    BUDGET,
    resetTSBudgetSnapshot,
    recordDiagPolicy,
    recordDiagRun,
    recordDiagSkipped,
    getTSBudgetSnapshot,
} from '../../src/lang/tsbudget'
import { buildLocRow, locRowLabel } from '../../src/lang/tsactions'

describe('diagnosticsPolicy M1.6', () => {
    it('小文档 full + 防抖 500(Monaco DiagnosticsAdapter)', () => {
        const p = diagnosticsPolicy(1000, 50)
        expect(p.mode).toBe('full')
        expect(p.debounceMs).toBe(500)
    })

    it('中档拉长防抖', () => {
        const p = diagnosticsPolicy(BUDGET.midChars, BUDGET.midLines)
        expect(p.mode).toBe('full')
        expect(p.debounceMs).toBe(500)
    })

    it('大文档(L)照样 full,防抖拉到 800', () => {
        const p = diagnosticsPolicy(BUDGET.largeChars, BUDGET.largeLines)
        expect(p.mode).toBe('full')
        expect(p.debounceMs).toBe(800)
    })

    it('超大(XL)只 syntax', () => {
        const p = diagnosticsPolicy(BUDGET.syntaxChars, BUDGET.syntaxLines)
        expect(p.mode).toBe('syntax')
        expect(p.debounceMs).toBe(1500)
    })

    it('snapshot 可记录', () => {
        resetTSBudgetSnapshot()
        const p = diagnosticsPolicy(10, 1)
        recordDiagPolicy(p, 10, 1)
        recordDiagRun('full')
        recordDiagSkipped()
        const s = getTSBudgetSnapshot()
        expect(s.diagRuns).toBe(1)
        expect(s.diagSkipped).toBe(1)
        expect(s.lastDiagMode).toBe('full')
        expect(s.lastDocLen).toBe(10)
    })
})

describe('linePreviewAt', () => {
    it('多行取正确行号与预览', () => {
        const text = 'aaa\nbbb\nccc'
        // offset at 'b' of bbb
        const r = linePreviewAt(text, 5)
        expect(r.line).toBe(2)
        expect(r.preview).toBe('bbb')
    })

    it('截断长行', () => {
        const long = 'x'.repeat(100)
        const r = linePreviewAt(long, 0, 20)
        expect(r.preview.length).toBeLessThanOrEqual(20)
        expect(r.preview.endsWith('…')).toBe(true)
    })
})

describe('buildLocRow M1.7', () => {
    it('本文件带行预览', () => {
        const row = buildLocRow('/main.ts', '/main.ts', 5, 3, 'one\ntwo three\nfour')
        expect(row.local).toBe(true)
        expect(row.line).toBe(2)
        expect(row.preview).toContain('two')
        expect(locRowLabel(row)).toMatch(/^L2/)
    })

    it('跨文件用 VFS 文本预览', () => {
        const row = buildLocRow('/utils.ts', '/main.ts', 0, 3, 'export const x = 1')
        expect(row.local).toBe(false)
        expect(row.line).toBe(1)
        expect(row.preview).toContain('export')
        expect(locRowLabel(row)).toContain('/utils.ts')
    })

    it('无文本时退回路径', () => {
        const row = buildLocRow('/a.ts', '/main.ts', 10, 1, null)
        expect(row.preview).toBe('/a.ts')
        expect(row.line).toBe(0)
        expect(locRowLabel({ ...row, preview: '' })).toMatch(/\/a.ts:\?/)
        expect(locRowLabel({
            local: true, line: 3, preview: '', file: '/m.ts', start: 0, length: 0,
        })).toBe('L3  (empty)')
    })
})
