// H3:setModelMarkers / getModelMarkers / removeAllMarkers / onDidChangeMarkers,以及落到视图(diagnosticsField / markerTagField)。
import { describe, expect, it } from 'vitest'
import { createModel } from '../../src/api/model'
import { Uri } from '../../src/api/uri'
import { MarkerSeverity, MarkerTag, getModelMarkers, onDidChangeMarkers, removeAllMarkers, setModelMarkers, markerTagField } from '../../src/api/markers'
import { diagnosticsField, setDiagnostics } from '../../src/core/index'
import { mount } from './h1-helpers'

const mk = (over: Record<string, unknown> = {}) => ({
    severity: MarkerSeverity.Error, message: 'boom',
    startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 4, ...over,
}) as any

describe('H3 markers 存取(MarkerService 语义)', () => {
    it('set / get / take / owner / resource 过滤;没有 message 的丢掉;行列夹到合法范围', () => {
        const a = createModel('foo\nbar', 'plaintext', Uri.parse('inmemory://h3/a'))
        const b = createModel('x', 'plaintext', Uri.parse('inmemory://h3/b'))
        setModelMarkers(a, 'o1', [mk(), mk({ message: '' }), mk({ startLineNumber: 0, startColumn: 0, endLineNumber: 0, endColumn: 0, message: 'zero' })])
        setModelMarkers(a, 'o2', [mk({ message: 'second' })])
        setModelMarkers(b, 'o1', [mk({ message: 'on b' })])
        expect(getModelMarkers({ owner: 'o1', resource: a.uri }).map(m => m.message)).toEqual(['boom', 'zero'])
        const z = getModelMarkers({ owner: 'o1', resource: a.uri })[1]
        expect([z.startLineNumber, z.startColumn, z.endLineNumber, z.endColumn]).toEqual([1, 1, 1, 1])
        expect(getModelMarkers({ resource: a.uri }).length).toBe(3)
        expect(getModelMarkers({ owner: 'o1' }).length).toBe(3)
        expect(getModelMarkers({ resource: a.uri, take: 2 }).length).toBe(2)
        const m = getModelMarkers({ owner: 'o2' })[0]
        expect(m.owner).toBe('o2')
        expect(m.resource.toString()).toBe(a.uri.toString())
        // 同 owner 再设 = 整体替换
        setModelMarkers(a, 'o1', [])
        expect(getModelMarkers({ owner: 'o1', resource: a.uri })).toEqual([])
        expect(getModelMarkers({ owner: 'o1' }).map(x => x.message)).toEqual(['on b'])
        removeAllMarkers('o1'); removeAllMarkers('o2')
        expect(getModelMarkers({})).toEqual([])
        a.dispose(); b.dispose()
    })

    it('onDidChangeMarkers:同一轮多次改动合并成一次,带受影响的 uri', async () => {
        await new Promise(r => setTimeout(r, 10)) // 先冲掉上一个用例攒着的事件
        const a = createModel('foo', 'plaintext', Uri.parse('inmemory://h3/ev1'))
        const b = createModel('foo', 'plaintext', Uri.parse('inmemory://h3/ev2'))
        const got: string[][] = []
        const d = onDidChangeMarkers(uris => got.push(uris.map(u => u.toString())))
        setModelMarkers(a, 'ev', [mk()])
        setModelMarkers(b, 'ev', [mk()])
        setModelMarkers(a, 'ev', [mk({ message: 'again' })])
        expect(got.length).toBe(0)
        await new Promise(r => setTimeout(r, 10))
        expect(got.length).toBe(1)
        expect(got[0].sort()).toEqual(['inmemory://h3/ev1', 'inmemory://h3/ev2'])
        removeAllMarkers('ev')
        await new Promise(r => setTimeout(r, 10))
        expect(got.length).toBe(2)
        d.dispose(); a.dispose(); b.dispose()
    })
})

describe('H3 markers 落到视图', () => {
    it('Error / Warning / Info → diagnosticsField(owner、source=owner);随编辑移动;不动 TS 自己的诊断', () => {
        const { ed, done } = mount({ doc: 'foo bar\nbaz' })
        const model = ed.getModel()!
        ed.dispatch(ed.state.update({ effects: setDiagnostics.of([{ from: 0, to: 3, severity: 'info', message: 'ts says', source: 'ts' }]) }))
        setModelMarkers(model, 'lint', [
            mk({ startLineNumber: 1, startColumn: 5, endLineNumber: 1, endColumn: 8, message: 'bar bad', code: { value: 'E1', target: Uri.parse('https://x') }, source: 'eslint' }),
            mk({ severity: MarkerSeverity.Warning, startLineNumber: 2, startColumn: 1, endLineNumber: 2, endColumn: 4, message: 'baz warn' }),
        ])
        let ds = ed.state.field(diagnosticsField)!
        expect(ds.map(d => [d.source, d.severity, d.from, d.to])).toEqual([['ts', 'info', 0, 3], ['lint', 'error', 4, 7], ['lint', 'warning', 8, 11]])
        expect(ds[1].owner).toBe('lint')
        expect(ds[1].code).toBe('eslint(E1)')
        // 在前面插入文字:诊断跟着走(Monaco marker 装饰),getModelMarkers 返回的仍是当初设的行列
        ed.dispatch(ed.state.update({ changes: { from: 0, insert: 'XX' } }))
        ds = ed.state.field(diagnosticsField)!
        expect(ds.filter(d => d.owner).map(d => [d.from, d.to])).toEqual([[6, 9], [10, 13]])
        expect(getModelMarkers({ owner: 'lint', resource: model.uri })[0].startColumn).toBe(5)
        // 同 owner 重设:只换自己的
        setModelMarkers(model, 'lint', [mk({ startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 3, message: 'new' })])
        ds = ed.state.field(diagnosticsField)!
        expect(ds.map(d => d.message)).toEqual(['ts says', 'new'])
        removeAllMarkers('lint')
        expect(ed.state.field(diagnosticsField)!.map(d => d.message)).toEqual(['ts says'])
        done()
    })

    it('Hint / Unnecessary / Deprecated → 单独的 tag 层;Hint 无 tag 只取起点后 2 列', () => {
        const { ed, done } = mount({ doc: 'abcdef\nghijkl' })
        const model = ed.getModel()!
        setModelMarkers(model, 'tags', [
            mk({ severity: MarkerSeverity.Hint, startLineNumber: 1, startColumn: 2, endLineNumber: 1, endColumn: 6, message: 'hint' }),
            mk({ severity: MarkerSeverity.Hint, tags: [MarkerTag.Unnecessary], startLineNumber: 2, startColumn: 1, endLineNumber: 2, endColumn: 4, message: 'unused' }),
            mk({ severity: MarkerSeverity.Warning, tags: [MarkerTag.Deprecated], startLineNumber: 2, startColumn: 4, endLineNumber: 2, endColumn: 7, message: 'old' }),
        ])
        const tags = ed.state.field(markerTagField)!
        expect(tags.map(t => [t.tag, t.from, t.to, t.message])).toEqual([
            ['hint', 1, 3, 'hint'], ['unnecessary', 7, 10, 'unused'], ['deprecated', 10, 13, 'old'],
        ])
        // 带 tag 的 Warning 同时在诊断层;Hint 不进诊断层
        expect(ed.state.field(diagnosticsField)!.map(d => d.message)).toEqual(['old'])
        removeAllMarkers('tags')
        expect(ed.state.field(markerTagField)).toEqual([])
        done()
    })

    it('先设 marker 后挂 model:挂上时同步', () => {
        const model = createModel('hello world', 'plaintext', Uri.parse('inmemory://h3/late'))
        setModelMarkers(model, 'late', [mk({ endColumn: 6, message: 'late' })])
        const { ed, done } = mount({ doc: '' })
        ed.setModel(model)
        expect(ed.state.field(diagnosticsField)!.map(d => [d.message, d.from, d.to])).toEqual([['late', 0, 5]])
        removeAllMarkers('late')
        done()
    })
})
