// 最终补测 2:取装饰的其余几个 getter / IMarkerData 形状与枚举值 / BOM(getValue preserveBOM)/ setValue 与 getValue。
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, mountEditor } from './h2-helpers'
import { createModel } from '../../src/api/model'
import { MarkerSeverity, MarkerTag, setModelMarkers, getModelMarkers, removeAllMarkers, onDidChangeMarkers, type IMarkerData } from '../../src/api/markers'
import { Uri } from '../../src/api/uri'
import { findSpecialChars } from '../../src/core/feature/specialchar'
import * as pub from '../../src/index'

afterEach(cleanup)
const R = (a: number, b: number, c: number, d: number) => ({ startLineNumber: a, startColumn: b, endLineNumber: c, endColumn: d })

describe('取装饰:getLinesDecorations / getAllMarginDecorations / getOverviewRulerDecorations / getInjectedTextDecorations', () => {
    const setup = () => {
        const ed = mountEditor('line1\nline2\nline3\nline4')
        const m = ed.getModel()
        const ids: string[] = m.deltaDecorations([], [
            { range: R(1, 1, 1, 3), options: { description: 'a', className: 'plain' } },
            { range: R(2, 1, 2, 3), options: { description: 'b', glyphMarginClassName: 'glyph' } },
            { range: R(3, 1, 3, 3), options: { description: 'c', overviewRuler: { color: 'red', position: 4 } } },
            { range: R(4, 1, 4, 3), options: { description: 'd', after: { content: 'x' } } },
            { range: R(2, 3, 3, 2), options: { description: 'e', linesDecorationsClassName: 'lines', overviewRuler: { color: 'blue', position: 1 } } },
        ])
        return { m, ids }
    }
    it('getLinesDecorations:行范围内(含相交)的,按位置排序;越界夹取', () => {
        const { m, ids } = setup()
        expect(m.getLinesDecorations(2, 3).map((d: { id: string }) => d.id)).toEqual([ids[1], ids[4], ids[2]])
        expect(m.getLinesDecorations(1, 1).map((d: { id: string }) => d.id)).toEqual([ids[0]])
        expect(m.getLinesDecorations(0, 99).length).toBe(5)
    })
    it('getAllMarginDecorations:只含带边栏类的(glyph / linesDecorations / lineNumber / margin)', () => {
        const { m, ids } = setup()
        expect(m.getAllMarginDecorations().map((d: { id: string }) => d.id).sort()).toEqual([ids[1], ids[4]].sort())
    })
    it('getOverviewRulerDecorations:只含设了概览尺颜色的', () => {
        const { m, ids } = setup()
        expect(m.getOverviewRulerDecorations().map((d: { id: string }) => d.id).sort()).toEqual([ids[2], ids[4]].sort())
    })
    it('getInjectedTextDecorations:只含 before / after 注入文字的', () => {
        const { m, ids } = setup()
        expect(m.getInjectedTextDecorations().map((d: { id: string }) => d.id)).toEqual([ids[3]])
    })
    it('ownerId 过滤:非 0 的 owner 只看到自己的', () => {
        const { m } = setup()
        const mine: string[] = m.deltaDecorations([], [{ range: R(1, 1, 1, 2), options: { description: 'o', glyphMarginClassName: 'g' } }], 7)
        expect(m.getAllDecorations(7).map((d: { id: string }) => d.id)).toEqual(mine)
        expect(m.getAllMarginDecorations(7).length).toBe(1)
        expect(m.getAllDecorations(0).length).toBe(6)
    })
})

describe('IMarkerData / MarkerSeverity / MarkerTag', () => {
    it('枚举数值同 Monaco', async () => {
        // @ts-ignore 0.52 的 esm 子路径没有 d.ts
        const e = await import('monaco-editor/esm/vs/editor/common/standalone/standaloneEnums.js') as unknown as Record<string, Record<string, number>>
        for (const [k, v] of Object.entries(e.MarkerSeverity)) if (typeof v === 'number') expect((MarkerSeverity as unknown as Record<string, number>)[k], `MarkerSeverity.${k}`).toBe(v)
        for (const [k, v] of Object.entries(e.MarkerTag)) if (typeof v === 'number') expect((MarkerTag as unknown as Record<string, number>)[k], `MarkerTag.${k}`).toBe(v)
        expect(pub.MarkerSeverity).toBe(MarkerSeverity)
        expect(pub.MarkerTag).toBe(MarkerTag)
    })
    it('set / get 往返:code(含 {value,target})、source、relatedInformation、tags 原样;resource / owner 补上', async () => {
        const model = createModel('hello\nworld', 'plaintext', Uri.parse('inmemory://m/markers-1'))
        const target = Uri.parse('https://example.com/rule')
        const rel = { resource: model.uri, message: 'see', startLineNumber: 2, startColumn: 1, endLineNumber: 2, endColumn: 3 }
        const data: IMarkerData[] = [
            { severity: MarkerSeverity.Error, message: 'bad', startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 3, code: { value: 'E1', target }, source: 'lint', relatedInformation: [rel] },
            { severity: MarkerSeverity.Hint, message: 'unused', startLineNumber: 2, startColumn: 1, endLineNumber: 2, endColumn: 6, tags: [MarkerTag.Unnecessary, MarkerTag.Deprecated], code: 'W2' },
        ]
        const seen: string[] = []
        const d = onDidChangeMarkers(uris => { for (const u of uris) seen.push(u.toString()) })
        setModelMarkers(model, 'final-test', data)
        await new Promise(r => setTimeout(r, 5)) // Monaco 的事件是 DebounceEmitter(delay 0),同轮改动合并成一次
        expect(seen).toContain(model.uri.toString())
        const got = getModelMarkers({ owner: 'final-test', resource: model.uri })
        expect(got.length).toBe(2)
        expect(got[0]).toMatchObject({ ...data[0], owner: 'final-test' })
        expect(got[0].resource.toString()).toBe(model.uri.toString())
        expect(got[1].tags).toEqual([1, 2])
        // 按严重度过滤(位掩码,同 Monaco)与 take
        expect(getModelMarkers({ owner: 'final-test', take: 1 }).length).toBe(1)
        // 整体替换
        setModelMarkers(model, 'final-test', [])
        expect(getModelMarkers({ owner: 'final-test' })).toEqual([])
        setModelMarkers(model, 'final-test', data)
        removeAllMarkers('final-test')
        expect(getModelMarkers({ owner: 'final-test' })).toEqual([])
        d.dispose()
    })
})

describe('BOM 与 getValue / setValue', () => {
    it('createModel 带 BOM:getValue 默认不含,preserveBOM=true 补回;getValueLength 同理', () => {
        const m = createModel('\uFEFFabc\ndef', 'plaintext', Uri.parse('inmemory://m/bom-1'))
        expect(m.getValue()).toBe('abc\ndef')
        expect(m.getValue(undefined, true)).toBe('\uFEFFabc\ndef')
        expect(m.getValueLength()).toBe(7)
        expect(m.getValueLength(undefined, true)).toBe(8)
        expect(m.createSnapshot(true).read()).toBe('\uFEFFabc\ndef')
        // 没 BOM 的,preserveBOM 无影响
        const n = createModel('abc', 'plaintext', Uri.parse('inmemory://m/bom-2'))
        expect(n.getValue(undefined, true)).toBe('abc')
    })
    it('编辑器 doc 选项里的 BOM 留在文档里,画成 U+FFFD 字形(同 renderControlCharacters 的 BOM 规则);createModel 才拆出 BOM', () => {
        const found = findSpecialChars('\uFEFFabc')
        expect(found).toMatchObject([{ from: 0, to: 1, glyph: '\uFFFD', title: 'The character U+feff is invisible.' }])
        const ed = mountEditor('\uFEFFabc')
        expect(ed.getValue().startsWith('\uFEFF')).toBe(true)
    })
    it('编辑器 getValue / setValue(H1 有完整语义测试:h1-host.test.ts)', () => {
        const ed = mountEditor('abc')
        expect(ed.getValue()).toBe('abc')
        ed.setValue('xyz\nw')
        expect(ed.getValue()).toBe('xyz\nw')
        expect(ed.getModel().getLineCount()).toBe(2)
    })
})
