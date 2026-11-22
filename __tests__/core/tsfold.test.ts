import { describe, expect, it } from 'vitest'
import { outliningToFolds } from '../../src/lang/tsfold'
import { clearTSServiceCache, createTSService } from '../../src/lang/tsservice'

describe('outliningToFolds', () => {
    it('跨行 span 落在首行，藏到末行末', () => {
        const text = 'import a\nimport b\n'
        const folds = outliningToFolds(text, [{ start: 0, length: text.length - 1 }])
        expect(folds).toEqual([
            { line: 1, from: 'import a'.length, to: 'import a\nimport b'.length },
        ])
    })

    it('单行 span 不折', () => {
        expect(outliningToFolds('const a = 1', [{ start: 0, length: 11 }])).toEqual([])
    })
})

describe('TS getOutliningSpans', () => {
    it('函数体给出 outlining，能映成折行', async () => {
        clearTSServiceCache()
        const session = createTSService({ lang: 'typescript', fileName: '/main.ts' })
        const doc = 'function f() {\n  return 1\n}\n'
        session.update(doc)
        const svc = await session.ensure()
        const spans = (await svc.getOutliningSpans(session.fileName)) ?? []
        expect(spans.length).toBeGreaterThan(0)
        const folds = outliningToFolds(doc, spans.map(s => ({
            start: s.textSpan.start,
            length: s.textSpan.length,
        })))
        expect(folds.some(f => f.line === 1)).toBe(true)
    }, 60_000)
})
