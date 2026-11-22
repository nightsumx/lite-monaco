// 写路径性能相关的回归:大段编辑(十几万行)不能因为展开参数溢出调用栈。
// 分词库(TokenStore / StateStore)按行数 splice 时曾用 splice(at, n, ...new Array(k)),k 过十万行就 RangeError。
import { describe, expect, it } from 'vitest'
import { createModel } from '../../src/api/model'
import { spliceNulls, InvalidLines } from '../../src/api/tokenization'

const R = (a: number, b: number, c: number, d: number) => ({ startLineNumber: a, startColumn: b, endLineNumber: c, endColumn: d })
const lines = (n: number) => Array.from({ length: n }, (_, i) => `const v${i} = ${i}`).join('\n')

describe('大段编辑不溢出调用栈', () => {
    it('15 万行:整篇删掉,再整篇插回(model 不挂编辑器,分词库照样收到每次变更)', () => {
        const text = lines(150000)
        const m = createModel(text, 'typescript')
        expect(m.getLineCount()).toBe(150000)
        m.applyEdits([{ range: R(1, 1, 150000, m.getLineMaxColumn(150000)), text: '' }])
        expect(m.getLineCount()).toBe(1)
        m.applyEdits([{ range: R(1, 1, 1, 1), text }])
        expect(m.getLineCount()).toBe(150000)
        expect(m.getValueLength()).toBe(text.length)
    })
    it('一行换成 15 万行', () => {
        const m = createModel('x', 'typescript')
        m.applyEdits([{ range: R(1, 1, 1, 2), text: lines(150000) }])
        expect(m.getLineCount()).toBe(150000)
    })
})

describe('spliceNulls(分词库按行数增删的底层)', () => {
    it('小段原地 splice,大段 concat,结果一致', () => {
        for (const ins of [0, 1, 5, 9999, 10000, 400000]) {
            const a = [1, 2, 3, 4, 5] as (number | null)[]
            const r = spliceNulls(a, 2, 1, ins)
            expect(r.length).toBe(5 - 1 + ins)
            expect(r.slice(0, 2)).toEqual([1, 2])
            expect(r.slice(2 + ins)).toEqual([4, 5])
            expect(r.slice(2, 2 + ins).every(v => v === null)).toBe(true)
        }
    })
})

describe('InvalidLines.replaceMany = 从后往前逐个 replace', () => {
    // 种子随机:同一组改动,批量一次扫完的结果必须和逐个 replace 一模一样
    const rng = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296
    const dump = (x: InvalidLines) => JSON.stringify((x as unknown as { _r: unknown })._r)
    it('随机区间 × 随机批改动(含删行、插行)', () => {
        const rand = rng(7)
        for (let round = 0; round < 400; round++) {
            const a = new InvalidLines(), b = new InvalidLines()
            for (let i = 0, k = Math.floor(rand() * 8); i < k; i++) {
                const s = 1 + Math.floor(rand() * 60), e = s + 1 + Math.floor(rand() * 10)
                a.add(s, e); b.add(s, e)
            }
            // 升序、行段互不相交(共用一行的已经并成一段,和 handleContent 的 _asBatch 一致)
            const ch: [number, number, number][] = []
            let at = 1 + Math.floor(rand() * 5)
            for (let i = 0, k = Math.floor(rand() * 10); i < k; i++) {
                const s = at + Math.floor(rand() * 6), e = s + 1 + Math.floor(rand() * 5), n = Math.floor(rand() * 7)
                ch.push([s, e, n]); at = e + 1
            }
            for (let i = ch.length - 1; i >= 0; i--) a.replace(ch[i][0], ch[i][1], ch[i][2])
            b.replaceMany(ch)
            expect(dump(b)).toBe(dump(a))
        }
    })
})
