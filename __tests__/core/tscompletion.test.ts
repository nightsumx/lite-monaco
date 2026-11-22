import { afterEach, describe, expect, it } from 'vitest'
import { fuzzyScore, matchIndices } from '../../src/core/feature/fuzzy'
import { entriesToCompletions, mapTSKind } from '../../src/lang/tscompletion'
import { clearTSServiceCache } from '../../src/lang/tsservice'
import { registerCompletionItemProvider } from '../../src/lang/providers'
import { cleanupSuggest, mountSuggest, provideTs, until } from './_suggest-harness'

afterEach(cleanupSuggest)

// Monaco fuzzyScore + matchIndices(旧 fuzzyMatch 的位置:补全过滤打分就是这一套)
const fuzzyMatch = (label: string, prefix: string) => {
    const s = fuzzyScore(prefix, prefix.toLowerCase(), 0, label, label.toLowerCase(), 0)
    return s ? { score: s[0], indices: matchIndices(s).sort((a, b) => a - b) } : null
}

describe('fuzzyMatch', () => {
    it('前缀硬匹配', () => {
        const m = fuzzyMatch('observerStack', 'ob')
        expect(m).not.toBeNull()
        expect(m!.indices).toEqual([0, 1])
        // 前缀命中分高于词中命中(VS Code fuzzyScore)
        expect(m!.score).toBeGreaterThan(fuzzyMatch('onbeforeinput', 'ob')!.score)
    })

    it('子序列:ob → onbeforeinput(对齐 Monaco)', () => {
        const m = fuzzyMatch('onbeforeinput', 'ob')
        expect(m).not.toBeNull()
        expect(m!.indices[0]).toBe(0) // o
        expect(m!.indices[1]).toBe(2) // b in before
    })

    it('不匹配返回 null', () => {
        expect(fuzzyMatch('hello', 'xyz')).toBeNull()
    })
})

describe('mapTSKind / entriesToCompletions', () => {
    it('kind 映射照 Monaco SuggestAdapter.convertKind(const/let → Property,method → Function)', () => {
        expect(mapTSKind('const')).toBe('property')
        expect(mapTSKind('let')).toBe('property')
        expect(mapTSKind('var')).toBe('variable')
        expect(mapTSKind('local var')).toBe('variable')
        expect(mapTSKind('function')).toBe('function')
        expect(mapTSKind('method')).toBe('function')
        expect(mapTSKind('property')).toBe('field')
        expect(mapTSKind('class')).toBe('class')
        expect(mapTSKind('interface')).toBe('interface')
        expect(mapTSKind('keyword')).toBe('keyword')
        expect(mapTSKind('primitive type')).toBe('keyword')
        expect(mapTSKind('type')).toBe('property')
    })

    it('entries → Completion 带 detail/sortText', () => {
        const list = entriesToCompletions([
            { name: 'observerStack', kind: 'const', sortText: '11', isRecommended: true },
            { name: 'Object', kind: 'var', sortText: '15' },
            { name: 'popObserver', kind: 'function', sortText: '12' },
        ], new Map([['observerStack', 'const observerStack: Computation[]']]))
        expect(list[0].label).toBe('observerStack')
        expect(list[0].kind).toBe('property')
        expect(list[0].detail).toBe('const observerStack: Computation[]')
        expect(list[0].sortText).toBe('11')
        expect(list.find(c => c.label === 'Object')!.sortText).toBe('15')
        expect(list.find(c => c.label === 'popObserver')?.kind).toBe('function')
    })
})

describe('provider 取回 + 模糊收窄(旧 gatherAsync + 同步源)', () => {
    it('文档词模糊收窄', async () => {
        const d = registerCompletionItemProvider('plaintext', {
            provideCompletionItems: (_m, p) => ({
                suggestions: ['observerStack', 'popObserver', 'Object'].map(label => ({
                    label, kind: 4, insertText: label,
                    range: { startLineNumber: p.lineNumber, startColumn: p.column - 2, endLineNumber: p.lineNumber, endColumn: p.column },
                })),
            }),
        })
        try {
            const r = mountSuggest({ doc: 'observerStack popObserver\nob' })
            r.trigger()
            await r.waitOpen()
            await until(() => r.labels.length > 0)
            expect(r.labels.length).toBeGreaterThan(0)
            expect(r.labels).toContain('observerStack')
            expect(r.labels[0]).toBe('observerStack') // 前缀硬匹配优先
        } finally { d.dispose() }
    })
})

describe('TS 补全 provider', () => {
    it('XL 文档:非显式、非成员访问 → 不进 LanguageService', async () => {
        const doc = 'ab\n'.repeat(21_000)
        expect(await provideTs(doc, { lang: 'ts' }, { pos: 1, explicit: false })).toBeNull()
    })

    it('冷启动 explicit 走 ensure 后给出本地符号', async () => {
        clearTSServiceCache()
        const doc = 'const hello = 1\nhel'
        const list = await provideTs(doc, { lang: 'typescript', fileName: '/cold-ensure.ts' }, { explicit: true })
        expect(list?.some(c => (typeof c.label === 'string' ? c.label : c.label.label) === 'hello')).toBe(true)
    }, 60_000)

    it('explicit 后 overlay 列表含本地符号', async () => {
        clearTSServiceCache()
        const r = mountSuggest({ doc: 'const hello = 1\nhel', lang: 'typescript', fileName: '/ts-list.ts' })
        r.trigger()
        await until(() => r.listed, 20_000)
        await until(() => document.body.querySelector('.cm-completionList') != null, 5000)
        const list = document.body.querySelector('.cm-completionList')
        expect(list).not.toBeNull()
        expect(list!.textContent ?? '').toMatch(/hello/)
        expect(r.v.contentDOM.contains(list)).toBe(false)
    }, 60_000)
})
