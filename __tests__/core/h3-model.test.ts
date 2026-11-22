// H3:ITextModel 对拍 Monaco 真 TextModel。随机文本(LF/CRLF/混合、tab、emoji、空行)+ 随机读取 / 编辑 / EOL 操作序列,
// 同一份场景在 Monaco(子进程)和 lite-monaco 的 createModel 上跑,逐步比较返回值和 onDidChangeContent 事件。
import { describe, expect, it } from 'vitest'
// @ts-expect-error 纯 JS 的共用执行器
import { runScenario } from './h3-monaco/scenario.mjs'
import { runMonacoScenarios, type Scenario } from './h3-monaco/ref'
import { genScenarios } from './h3-monaco/gen'
import { createModel, getModel, getModels, Uri } from '../../src/api/model'

function mineRun(sc: Scenario) {
    const m = createModel(sc.text, 'plaintext')
    try { return runScenario(m, sc.steps) } finally { m.dispose() }
}

describe('H3 ITextModel 对拍 Monaco TextModel', () => {
    it('随机读取 / 编辑 / EOL 序列逐步一致', () => {
        const scenarios = genScenarios(20260102, 200)
        const ref = runMonacoScenarios(scenarios)
        let steps = 0
        const bad: string[] = []
        scenarios.forEach((sc, i) => {
            const mine = mineRun(sc)
            sc.steps.forEach((st, j) => {
                steps++
                const a = JSON.stringify(mine[j]), b = JSON.stringify(ref[i][j])
                if (a !== b && bad.length < 8) bad.push(`#${i}/${j} ${st.m}(${JSON.stringify(st.a).slice(0, 200)}) text=${JSON.stringify(sc.text).slice(0, 120)}\n  mine=${a.slice(0, 400)}\n  ref =${b.slice(0, 400)}`)
            })
        })
        expect(steps).toBeGreaterThan(5000)
        expect(bad.join('\n')).toBe('')
    }, 30_000)

    it('setValue / updateOptions / detectIndentation / pushEditOperations / 版本号 / getLineDecorations 对拍', () => {
        const R = (a: number, b: number, c: number, d: number) => ({ startLineNumber: a, startColumn: b, endLineNumber: c, endColumn: d })
        const E = (r: any, text: string) => ({ range: r, text })
        const scs: Scenario[] = [
            { text: 'a\n\tb\n\t\tc', steps: [
                { m: '@options', a: [] }, { m: 'detectIndentation', a: [true, 2] }, { m: '@options', a: [] },
                { m: 'updateOptions', a: [{ tabSize: 8 }] }, { m: '@options', a: [] },
                { m: 'updateOptions', a: [{ indentSize: 3, insertSpaces: false, trimAutoWhitespace: false }] }, { m: '@options', a: [] },
                { m: 'updateOptions', a: [{ indentSize: 'tabSize' }] }, { m: '@options', a: [] },
                { m: 'normalizeIndentation', a: ['\t  \t'] },
            ] },
            { text: 'function f() {\n    if (x) {\n        y()\n    }\n}', steps: [
                { m: 'detectIndentation', a: [false, 4] }, { m: '@options', a: [] },
                { m: 'detectIndentation', a: [true, 4] }, { m: '@options', a: [] },
            ] },
            { text: 'one\ntwo', steps: [
                { m: 'getVersionId', a: [] }, { m: 'getAlternativeVersionId', a: [] },
                { m: 'setValue', a: ['x\r\ny'] }, { m: '@state', a: [] }, { m: 'getAlternativeVersionId', a: [] },
                { m: 'setValue', a: ['\uFEFFbom\ny'] }, { m: '@state', a: [] },
                { m: 'setValue', a: ['q\ny\n'] }, { m: '@state', a: [] }, { m: 'getEndOfLineSequence', a: [] },
                { m: 'setEOL', a: [1] }, { m: '@state', a: [] }, { m: 'getAlternativeVersionId', a: [] },
                { m: 'applyEdits', a: [[E(R(1, 1, 1, 1), 'A\nB')]] }, { m: '@state', a: [] }, { m: 'getAlternativeVersionId', a: [] },
                { m: 'applyEdits', a: [[E(R(1, 1, 1, 2), 'Z'), E(R(2, 1, 2, 1), 'W')]] }, { m: '@state', a: [] },
            ] },
            { text: 'aaa\nbbb\nccc', steps: [
                { m: 'pushEditOperations', a: [null, [E(R(1, 2, 1, 3), 'X'), E(R(3, 1, 3, 1), '>>')], null] },
                { m: '@state', a: [] }, { m: 'getAlternativeVersionId', a: [] },
                { m: 'pushEditOperations', a: [null, [E(R(2, 1, 2, 4), '')], null] },
                { m: '@state', a: [] },
                { m: 'applyEdits', a: [[E(R(9, 9, 9, 9), 'tail')], true] },
                { m: 'getValue', a: [] },
                { m: 'getValue', a: [1] }, { m: 'getValue', a: [2] }, { m: 'getValue', a: [1, true] },
                { m: 'getLinesContent', a: [] },
                { m: 'getLineDecorations', a: [1] }, { m: 'getAllDecorations', a: [] },
            ] },
        ]
        const ref = runMonacoScenarios(scs)
        const bad: string[] = []
        scs.forEach((sc, i) => {
            const mine = mineRun(sc)
            sc.steps.forEach((st, j) => {
                const a = JSON.stringify(mine[j]), b = JSON.stringify(ref[i][j])
                if (a !== b) bad.push(`#${i}/${j} ${st.m}(${JSON.stringify(st.a).slice(0, 160)})\n  mine=${a.slice(0, 500)}\n  ref =${b.slice(0, 500)}`)
            })
        })
        expect(bad.join('\n')).toBe('')
    }, 30_000)

    it('createModel / getModel(uri) / getModels / dispose', () => {
        const uri = Uri.parse('inmemory://model/h3-test-1')
        const m = createModel('hello', 'typescript', uri)
        expect(getModel(uri)).toBe(m)
        expect(getModels()).toContain(m)
        expect(() => createModel('x', 'typescript', uri)).toThrow(/already exists/)
        expect(m.getLanguageId()).toBe('typescript')
        let willDispose = 0
        m.onWillDispose(() => willDispose++)
        m.dispose()
        expect(willDispose).toBe(1)
        expect(m.isDisposed()).toBe(true)
        expect(getModel(uri)).toBeNull()
        expect(() => m.getValue()).toThrow(/disposed/)
    })

    it('createModel 按 uri 扩展名推断语言', () => {
        const m = createModel('x', undefined, Uri.parse('file:///a/b/foo.py'))
        expect(m.getLanguageId()).toBe('python')
        m.dispose()
        const m2 = createModel('x', undefined, Uri.parse('file:///a/b/foo.unknownext'))
        expect(m2.getLanguageId()).toBe('plaintext')
        m2.dispose()
    })
})
