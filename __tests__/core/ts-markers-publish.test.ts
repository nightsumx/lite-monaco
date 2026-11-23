// TS 诊断发进 marker 服务(publishViewDiagnostics):形状同 Monaco DiagnosticsAdapter,视图里不画两遍,
// model 销毁 / 换语言时清掉,用户自己 setModelMarkers 同一个 owner 时改由 marker 层画。
// 浏览器里对真 Monaco 的对比见 scripts/browser-diff(react/run.mjs 的 onValidate 场景)。
import { describe, expect, it } from 'vitest'
import { MarkerSeverity, MarkerTag, getModelMarkers, onDidChangeMarkers, publishViewDiagnostics, setModelMarkers } from '../../src/api/markers'
import { setModelLanguage } from '../../src/api/languages'
import { diagnosticsField, setDiagnostics } from '../../src/core/index'
import { mount } from './h1-helpers'

const tick = () => new Promise(r => setTimeout(r, 5))

describe('publishViewDiagnostics', () => {
    it('偏移转成行列,code 去掉括号;只带标签的是 Hint 排在前面;错误带的标签并进同一条;tags 总是数组', async () => {
        const { ed, done } = mount({ doc: 'const n = 1\nfunction f(a) {}' })
        const model = ed.getModel()!
        const fired: string[][] = []
        const sub = onDidChangeMarkers(u => fired.push(u.map(x => x.toString())))
        publishViewDiagnostics(model, 'typescript',
            [{ from: 6, to: 7, severity: 'error', message: 'unused n', code: '(6133)' }, { from: 0, to: 5, severity: 'warning', message: 'w' }],
            [{ from: 6, to: 7, tag: 'unnecessary', message: 'unused n', code: '(6133)' }, { from: 23, to: 24, tag: 'hint', message: 'any a', code: '(7044)' }])
        const mk = getModelMarkers({ resource: model.uri })
        expect(mk.map(m => [m.owner, m.severity, m.code, m.startLineNumber, m.startColumn, m.endLineNumber, m.endColumn, m.tags])).toEqual([
            ['typescript', MarkerSeverity.Hint, '7044', 2, 12, 2, 13, []],
            ['typescript', MarkerSeverity.Error, '6133', 1, 7, 1, 8, [MarkerTag.Unnecessary]],
            ['typescript', MarkerSeverity.Warning, undefined, 1, 1, 1, 6, []],
        ])
        await tick()
        expect(fired).toEqual([[model.uri.toString()]])
        sub.dispose()
        done()
    })

    it('视图里已经画了:不再经 marker 层进 diagnosticsField;别的 owner 照常进', () => {
        const { ed, done } = mount({ doc: 'abc def' })
        const model = ed.getModel()!
        const tsDiag = { from: 0, to: 3, severity: 'error' as const, message: 'ts', source: 'ts' }
        ed.dispatch(ed.state.update({ effects: setDiagnostics.of([tsDiag]) }))
        publishViewDiagnostics(model, 'typescript', [tsDiag], [])
        setModelMarkers(model, 'lint', [{ severity: MarkerSeverity.Warning, message: 'lint', startLineNumber: 1, startColumn: 5, endLineNumber: 1, endColumn: 8 }])
        expect(ed.state.field(diagnosticsField)!.map(d => d.message)).toEqual(['ts', 'lint'])
        // 用户自己设同一个 owner:改由 marker 层画
        setModelMarkers(model, 'typescript', [{ severity: MarkerSeverity.Error, message: 'mine', startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 2 }])
        expect(ed.state.field(diagnosticsField)!.map(d => d.message)).toEqual(['ts', 'mine', 'lint'])
        setModelMarkers(model, 'lint', [])
        setModelMarkers(model, 'typescript', [])
        done()
    })

    it('换语言、model 销毁时清掉自己发的', () => {
        const { ed, done } = mount({ doc: 'x' })
        const model = ed.getModel()!
        const uri = model.uri
        const d = [{ from: 0, to: 1, severity: 'error' as const, message: 'e' }]
        publishViewDiagnostics(model, 'typescript', d, [])
        setModelLanguage(model, 'plaintext')
        expect(getModelMarkers({ resource: uri })).toEqual([])
        publishViewDiagnostics(model, 'javascript', d, [])
        expect(getModelMarkers({ resource: uri }).map(m => m.owner)).toEqual(['javascript'])
        done()
        model.dispose()
        expect(getModelMarkers({ resource: uri })).toEqual([])
    })
})
