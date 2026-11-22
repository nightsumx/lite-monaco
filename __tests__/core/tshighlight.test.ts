import { describe, expect, it } from 'vitest'
import { highlightsToMarks } from '../../src/lang/tshighlight'
import { clearTSServiceCache, getTSService } from '../../src/lang/tsservice'

const SLOW = 60_000

describe('highlightsToMarks', () => {
    it('去重并按 from 排序', () => {
        const marks = highlightsToMarks([
            { start: 8, length: 3 },
            { start: 0, length: 3 },
            { start: 0, length: 3 },
        ])
        expect(marks).toEqual([
            { from: 0, to: 3 },
            { from: 8, to: 11 },
        ])
    })
})

describe('getDocumentHighlights', () => {
    it('同符号两处都标上', async () => {
        clearTSServiceCache()
        const session = getTSService({ lang: 'typescript', fileName: '/hl.ts' })
        const doc = 'function foo() { return foo }\n'
        session.update(doc)
        const svc = await session.ensure()
        const pos = doc.indexOf('return foo') + 'return '.length
        const hits = (await svc.getDocumentHighlights(session.fileName, pos, [session.fileName])) ?? []
        const spans = hits.flatMap(h => h.highlightSpans.map(s => s.textSpan))
        const marks = highlightsToMarks(spans)
        expect(marks.length).toBeGreaterThanOrEqual(2)
        expect(marks.some(m => doc.slice(m.from, m.to) === 'foo')).toBe(true)
    }, SLOW)
})
