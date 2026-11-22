// lang/minimaledits.ts:Monaco EditorWorker 的 computeMoreMinimalEdits / computeHumanReadableDiff / textualSuggest
// (原版用例在 __parity__ 的 editorWebWorker.test.ts 里整文件跑;这里补原版没覆盖的:eol、不改调用方对象、provider 接入、上限)。
import { describe, expect, it } from 'vitest'
import { createModel } from '../../src/api/model'
import { computeHumanReadableDiff, computeMoreMinimalEdits, textualSuggest, wordsOf } from '../../src/lang/minimaledits'
import { minimalEdits } from '../../src/lang/providerformat'

const R = (a: number, b: number, c: number, d: number) => ({ startLineNumber: a, startColumn: b, endLineNumber: c, endColumn: d })
const model = (text: string) => createModel(text)

describe('computeMoreMinimalEdits', () => {
    it('整行替换只剩真变了的字符', () => {
        const m = model('This is line one')
        const r = computeMoreMinimalEdits(m, [{ range: R(1, 1, 1, 17), text: 'This is line One' }])
        expect(r).toEqual([{ text: 'O', range: R(1, 14, 1, 15) }])
    })
    it('相邻编辑先合并;不改调用方的对象', () => {
        const m = model('one\ntwo\nthree\nfour\nfive')
        const input = [
            { range: R(1, 1, 2, 1), text: 'one\ntwo\nthree\n' },
            { range: R(2, 1, 3, 1), text: '' },
            { range: R(3, 1, 4, 1), text: '' },
            { range: R(4, 2, 4, 3), text: '4' },
            { range: R(5, 3, 5, 5), text: '5' },
        ]
        const snapshot = JSON.stringify(input)
        const r = computeMoreMinimalEdits(m, input)
        expect(r.map(e => e.text)).toEqual(['4', '5'])
        expect(JSON.stringify(input)).toBe(snapshot)
    })
    it('空编辑 / 无变化的编辑被丢掉', () => {
        const m = model('abc')
        expect(computeMoreMinimalEdits(m, [{ range: R(1, 2, 1, 2), text: '' }, { range: R(1, 1, 1, 4), text: 'abc' }])).toEqual([])
    })
    it('CRLF model:编辑里的 \\n 被换成 model 的 EOL 再比,newline-only 变化不产生编辑', () => {
        const m = model('{\r\n\t"a":1\r\n}')
        expect(m.getEOL()).toBe('\r\n')
        expect(computeMoreMinimalEdits(m, [{ range: R(1, 1, 3, 2), text: '{\n\t"a":1\n}' }])).toEqual([])
        const r = computeMoreMinimalEdits(m, [{ range: R(1, 1, 3, 2), text: '{\n\t"b":1\n}' }])
        expect(r).toEqual([{ text: 'b', range: R(2, 3, 2, 4) }])
    })
    it('eol 编辑:原样排到最后,范围是 0,0,0,0', () => {
        const m = model('a\nb')
        const r = computeMoreMinimalEdits(m, [{ eol: 1, text: '', range: R(0, 0, 0, 0) }, { range: R(1, 1, 1, 2), text: 'x' }])
        expect(r[0]).toMatchObject({ text: 'x' })
        expect(r[r.length - 1]).toEqual({ eol: 1, text: '', range: R(0, 0, 0, 0) })
    })
    it('超过 diff 上限:整段替换,不跑 diff', () => {
        const big = 'x'.repeat(100_001)
        const m = model(big)
        const r = computeMoreMinimalEdits(m, [{ range: R(1, 1, 1, big.length + 1), text: big + 'y' }])
        expect(r.length).toBe(1)
        expect(r[0].range).toEqual(R(1, 1, 1, big.length + 1))
    })
    it('接入 formatting:minimalEdits 校验范围 + 不再要求 range 在文档内', () => {
        const m = model('const a=1')
        const r = minimalEdits(m as never, [{ range: R(1, 1, 99, 99), text: 'const a = 1' }])
        // 范围被夹到文档末尾,结果只补空格
        expect(r.map(e => e.text).join('|')).toMatch(/ /)
        expect(r.every(e => e.range.startLineNumber === 1)).toBe(true)
        expect(minimalEdits(m as never, null)).toEqual([])
        expect(minimalEdits(m as never, [{ text: 'junk' } as never])).toEqual([])
    })
})

describe('computeHumanReadableDiff', () => {
    it('应用最小编辑得到和原编辑相同的文本', () => {
        const text = 'function test() {}'
        const m = model(text)
        const edits = [{ range: R(1, 1, 1, Number.MAX_SAFE_INTEGER), text: 'function test(myParam: number) { console.log(myParam); }' }]
        const r = computeHumanReadableDiff(m, edits, { ignoreTrimWhitespace: false, maxComputationTimeMs: 0 })
        expect(r.length).toBeGreaterThan(0)
        for (const e of r) expect(e.range.startLineNumber).toBe(1)
    })
    it('eol 编辑原样排到最后', () => {
        const m = model('a')
        const r = computeHumanReadableDiff(m, [{ range: R(1, 1, 1, 2), text: 'b' }, { eol: 0, text: '', range: R(0, 0, 0, 0) }])
        expect(r[r.length - 1].eol).toBe(0)
    })
})

describe('textualSuggest / words', () => {
    it('词、去重、去掉前导词和纯数字词', () => {
        const r = textualSuggest([['foo bar 123', 'foo baz']], 'bar', /[a-z0-9]+/g)
        expect(r.words).toEqual(['foo', 'baz'])
        expect(typeof r.duration).toBe('number')
    })
    it('多个 model 合并;空匹配停止这一行', () => {
        expect(textualSuggest([['a b'], ['b c']], undefined, /[a-z]+/g).words).toEqual(['a', 'b', 'c'])
        expect([...wordsOf(['x y', 'z'], /[a-z]*/g)]).toEqual(['x', 'z'])
    })
    it('单字母词也给(Monaco 不限词长)', () => {
        expect(textualSuggest([['f f']], 'f', /[a-z]+/g).words).toEqual([])
        expect(textualSuggest([['f g']], 'f', /[a-z]+/g).words).toEqual(['g'])
    })
})
