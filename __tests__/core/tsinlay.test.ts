import { describe, expect, it } from 'vitest'
import { hintsToMarks, inlayDecorations } from '../../src/lang/tsinlay'
import { clearTSServiceCache, getTSService } from '../../src/lang/tsservice'
import { EditorState } from '../../src/core/model/state'
import { RangeSet } from '../../src/core/model/rangeset'

const SLOW = 60_000

describe('hintsToMarks', () => {
    it('参数 hint 落在调用实参前', () => {
        const marks = hintsToMarks([
            { position: 4, text: 'a:' },
            { position: 7, text: 'b:' },
        ])
        expect(marks).toEqual([
            { pos: 4, text: 'a:' },
            { pos: 7, text: 'b:' },
        ])
    })
})

describe('provideInlayHints', () => {
    it('调用处给出参数名 hint', async () => {
        clearTSServiceCache()
        const session = getTSService({ lang: 'typescript', fileName: '/inlay.ts' })
        const doc = 'function foo(count: number) { return count }\nfoo(1)\n'
        session.update(doc)
        const svc = await session.ensure()
        const hints = (await svc.provideInlayHints(session.fileName, { start: 0, length: doc.length }, {
            includeInlayParameterNameHints: 'all',
        })) ?? []
        expect(hints.some(h => h.text.includes('count'))).toBe(true)
        const state = EditorState.create({ doc })
        const set = inlayDecorations(state, hintsToMarks(hints.map(h => ({
            position: h.position,
            text: h.text,
        }))))
        let n = 0
        set.between(0, doc.length, () => { n++ })
        expect(n).toBeGreaterThan(0)
        expect(set).not.toBe(RangeSet.empty)
    }, SLOW)
})
