import { describe, expect, it } from 'vitest'
import { HeightMap, HeightOracle, QueryType, wrapLayout, type ChangedRange } from '../../src/core/view/heightmap'
import { Rope } from '../../src/core/model/rope'

// 折行估算 = 没渲染过的行的高度、折行时的 getContentWidth、折行时的 getVisibleRanges 的共同依据。
// 浏览器对照(真 Chromium 里 Monaco 与 lite 逐项比):scripts/browser-diff,`node build.mjs && node run.mjs 10-wrap`
// (jsdom 没有排版,断点和行宽只能用这个纯函数钉死;对照页里 10-wrap 全部场景的 lines / rows / content.width / visibleRanges / domBreaks 都是 Monaco 的实测值)。

const NONE = { mode: 0, tab: 4 }

describe('wrapLayout —— 按列折行(Monaco wrappingColumn 同一套断点)', () => {
    it('空格之后可断,空格挂在行尾,行宽含行尾空格', () => {
        // "aaa bbb ccc" 在 8 列:"aaa bbb " 是 8 列放得下;ccc 另起一行
        const starts: number[] = []
        const r = wrapLayout('aaa bbb ccc', 8, NONE, starts)
        expect(r.rows).toBe(2)
        expect(starts).toEqual([8])
        expect(r.width).toBe(8)
    })

    it('放不下的长词按列硬断', () => {
        const starts: number[] = []
        expect(wrapLayout('x'.repeat(25), 10, NONE, starts).rows).toBe(3)
        expect(starts).toEqual([10, 20])
    })

    it('一行放得下时就是一行,宽 = 字符数', () => {
        expect(wrapLayout('hello', 10, NONE)).toEqual({ rows: 1, width: 5 })
    })

    it('全角字占 2 列,字后可断', () => {
        expect(wrapLayout('中'.repeat(10), 10, NONE).rows).toBe(2)
    })

    it('横线之后可断,斜线之后不可断(Chrome 的断行规则,不是 Monaco 的 wordWrapBreakAfterCharacters)', () => {
        const a: number[] = [], b: number[] = []
        wrapLayout('aaaa-bbbb', 6, NONE, a)
        wrapLayout('aaaa/bbbb', 6, NONE, b)
        expect(a).toEqual([5])
        expect(b).toEqual([6])
    })

    it('续行缩进:same 取行首缩进,indent 再加 1 个缩进单位,none 不缩', () => {
        const text = '  ' + 'abcde '.repeat(6)
        const rows = (mode: number) => wrapLayout(text, 14, { mode, tab: 4 }).rows
        expect([rows(0), rows(1), rows(2)]).toEqual([3, 3, 5])
    })

    it('缩进占掉半个列宽以上就不缩', () => {
        const text = '  ' + 'abcde '.repeat(6)
        expect(wrapLayout(text, 14, { mode: 3, tab: 4 }).rows).toBe(wrapLayout(text, 14, NONE).rows)
    })
})

describe('HeightOracle.rowsOfLine —— 估高用文本感知的行数,不是按长度线性估', () => {
    // 线性公式 1 + ceil((len − L) / (L − 5)) 对 "整词多、行尾留空" 的文本偏大 1–2 行
    const o = new HeightOracle(true)
    o.lineHeight = 20
    o.lineLength = 40
    const words = Array.from({ length: 122 }, (_, i) => ['lorem', 'ipsum', 'dolor', 'sit', 'amet'][i % 5]).join(' ')
    it('122 个词在 40 列里是 18 行(Monaco 实测),线性估是 19', () => {
        o.setDoc(Rope.of([words]))
        expect(o.rowsOfLine(0, words.length)).toBe(18)
        expect(o.heightForLine(words.length)).toBe(19 * 20)
    })
    it('没开折行恒为 1 行;短行不扫描', () => {
        const off = new HeightOracle(false)
        off.setDoc(Rope.of([words]))
        expect(off.rowsOfLine(0, words.length)).toBe(1)
        o.setDoc(Rope.of(['ab']))
        expect(o.rowsOfLine(0, 2)).toBe(1)
    })
    it('超长行(> 2 万字符)退回线性估,不做 O(n) 扫描', () => {
        const long = 'a '.repeat(15000)
        o.setDoc(Rope.of([long]))
        expect(o.rowsOfLine(0, long.length)).toBe(1 + Math.ceil((long.length - 40) / 35))
    })
})

describe('HeightMap gap —— 没渲染的区段按每行的估计行数分高度', () => {
    const words = (n: number) => Array.from({ length: n }, (_, i) => ['lorem', 'ipsum', 'dolor', 'sit', 'amet'][i % 5]).join(' ')
    const o = new HeightOracle(true)
    o.lineHeight = 20
    o.lineLength = 40
    const text = [words(30), words(122), words(10)].join('\n')
    const doc = Rope.of(text.split('\n'))
    o.setDoc(doc)
    const full: ChangedRange = { fromA: 0, toA: 0, fromB: 0, toB: doc.length }
    const map = HeightMap.empty().applyChanges([], Rope.empty, o, [full])
    const rows = (s: string) => wrapLayout(s, 40, NONE).rows

    it('总高 = 每行估计行数 × 行高', () => {
        expect(map.height).toBe((rows(words(30)) + rows(words(122)) + rows(words(10))) * 20)
    })
    it('第二行的顶 = 第一行的估计高,高 = 它自己的估计高(不按字符数线性摊)', () => {
        const l2 = map.lineAt(doc.line(2).from, QueryType.ByPos, o, 0, 0)
        expect(l2.top).toBe(rows(words(30)) * 20)
        expect(l2.height).toBe(rows(words(122)) * 20)
    })
    it('按高度反查落在正确的行上', () => {
        const y = rows(words(30)) * 20 + 5
        expect(map.lineAt(y, QueryType.ByHeight, o, 0, 0).from).toBe(doc.line(2).from)
    })
    it('forEachLine 给出和 lineAt 一样的块', () => {
        const got: [number, number][] = []
        map.forEachLine(0, doc.length, o, 0, 0, b => got.push([b.top, b.height]))
        expect(got).toEqual([1, 2, 3].map(n => { const b = map.lineAt(doc.line(n).from, QueryType.ByPos, o, 0, 0); return [b.top, b.height] }))
    })
})
