import type { ChangedRange } from '../../src/core/view/heightmap'
import { describe, expect, it } from 'vitest'
import { ChangeSet } from '../../src/core/model/change'
import { Decoration, ZoneWidget } from '../../src/core/model/decoration'
import {
    BlockInfo,
    clearHeightChangeFlag,
    heightChangeFlag,
    HeightMap,
    HeightOracle,
    heightRelevantDecoChanges,
    MeasuredHeights,
    QueryType,
} from '../../src/core/view/heightmap'
import { RangeSet } from '../../src/core/model/rangeset'
import { Rope } from '../../src/core/model/rope'

// CM7 HeightMap —— 文档的垂直几何模型:位置↔像素双向查询的平衡树。逐行港接 CM6 heightmap.ts。
//
// 可监测(本测核心):toString() 把树序列化成 line(N)/gap(N)/block(N)/branch(-或空格) 字面,
//   合成 oracle(纯参数,无 DOM)即可钉死高度代数;build→query 的往返是 spans 投影的双射验收。
//   heightChangeFlag 暴露「这次 updateHeight 是否真的改了高度」——重排观测点。

// 从纯文本建一棵已估高的 heightmap:空装饰 → 全是 gap → updateHeight 估高。
function mapFor(text: string, oracle: HeightOracle, decos: RangeSet<Decoration>[] = []) {
    const doc = Rope.of(text.split('\n'))
    oracle.setDoc(doc)
    const full: ChangedRange = { fromA: 0, toA: 0, fromB: 0, toB: doc.length }
    return HeightMap.empty().applyChanges(decos, Rope.empty, oracle, [full])
}

function oracle(lineWrapping = false) {
    const o = new HeightOracle(lineWrapping)
    o.lineHeight = 10
    return o
}

describe('heightOracle —— 长度→高度估算', () => {
    it('不换行时每行恒为 lineHeight', () => {
        const o = oracle()
        o.setDoc(Rope.of(['a', 'bb', 'ccc']))
        expect(o.heightForLine(3)).toBe(10)
        expect(o.heightForGap(0, 7)).toBe(30)
    })

    it('换行时长行按 lineLength 折算多行高', () => {
        const o = oracle(true)
        o.lineLength = 10
        expect(o.heightForLine(5)).toBe(10)
        expect(o.heightForLine(15)).toBe(20)
    })
})

describe('heightMap.applyChanges —— 纯文本建树 + 估高', () => {
    it('三行文档:总高 = 行数 × lineHeight', () => {
        const map = mapFor('a\nbb\nccc', oracle())
        expect(map.length).toBe(8)
        expect(map.height).toBe(30)
    })

    it('空文档:单行高', () => {
        const map = mapFor('', oracle())
        expect(map.length).toBe(0)
        expect(map.height).toBe(10)
    })
})

describe('heightMap.lineAt/blockAt —— 位置↔像素双向查询', () => {
    it('lineAt(ByPos) 命中所在行并给出 top', () => {
        const o = oracle()
        const map = mapFor('a\nbb\nccc', o)
        const l0 = map.lineAt(0, QueryType.ByPos, o, 0, 0)
        const l1 = map.lineAt(2, QueryType.ByPos, o, 0, 0)
        const l2 = map.lineAt(5, QueryType.ByPos, o, 0, 0)
        expect(l0.from).toBe(0)
        expect(l0.top).toBe(0)
        expect(l1.from).toBe(2)
        expect(l1.top).toBe(10)
        expect(l2.from).toBe(5)
        expect(l2.top).toBe(20)
    })

    it('blockAt(像素) 反查回同一行 —— 与 lineAt 互逆', () => {
        const o = oracle()
        const map = mapFor('a\nbb\nccc', o)
        expect(map.blockAt(5, o, 0, 0).from).toBe(0)
        expect(map.blockAt(15, o, 0, 0).from).toBe(2)
        expect(map.blockAt(25, o, 0, 0).from).toBe(5)
    })

    it('forEachLine 枚举区间内每一行', () => {
        const o = oracle()
        const map = mapFor('a\nbb\nccc', o)
        const seen: number[] = []
        map.forEachLine(0, 7, o, 0, 0, l => seen.push(l.from))
        expect(seen).toEqual([0, 2, 5])
    })
})

describe('heightMap 可监测:实测高度回填', () => {
    it('measuredHeights 覆盖估高,总高随实测变 + 置 flag', () => {
        const o = oracle()
        const map = mapFor('a\nbb\nccc', o)
        clearHeightChangeFlag()
        const measured = new MeasuredHeights(0, [20, 20, 20])
        const updated = map.updateHeight(o, 0, false, measured)
        expect(updated.height).toBe(60)
        expect(heightChangeFlag).toBe(true)
    })

    it('实测后再以相同高度复测 → 不置 flag', () => {
        const o = oracle()
        const map = mapFor('a\nbb\nccc', o)
        const materialized = map.updateHeight(o, 0, false, new MeasuredHeights(0, [20, 20, 20]))
        clearHeightChangeFlag()
        materialized.updateHeight(o, 0, false, new MeasuredHeights(0, [20, 20, 20]))
        expect(heightChangeFlag).toBe(false)
    })
})

describe('heightMap 消费装饰:block widget 投影成块高', () => {
    it('block widget 装饰把所在处撑出额外块', () => {
        const o = oracle()
        const doc = Rope.of(['a', 'bb', 'ccc'])
        o.setDoc(doc)
        const block = Decoration.replace({ widget: undefined, block: true })
        const set = RangeSet.of([block.range(2, 4)])
        const full: ChangedRange = { fromA: 0, toA: 0, fromB: 0, toB: doc.length }
        const map = HeightMap.empty().applyChanges([set], Rope.empty, o, [full])
        expect(map.length).toBe(8)
    })

    // Monaco view zone:行前的空白记成该行的 spaceAbove,lineAt 只给文本行:top / height 是文本那一段,空白在 top 之上
    it('ZoneWidget(side -1)= 所在行的 spaceAbove,后续行整体下推', () => {
        const o = oracle()
        const zone = Decoration.widget({ widget: new ZoneWidget(30), block: true, side: -1 })
        const map = mapFor('a\nbb\nccc', o, [RangeSet.of([zone.range(2)])])
        const l1 = map.lineAt(2, QueryType.ByPos, o, 0, 0)
        expect([l1.top, l1.height, l1.spaceAbove]).toEqual([40, 10, 30])
        expect(map.lineAt(5, QueryType.ByPos, o, 0, 0).top).toBe(50)
        expect(map.height).toBe(60)
    })
})

describe('heightRelevantDecoChanges —— 视图 diff 只收高度相关变更', () => {
    it('点装饰新增触发变更区间', () => {
        const a = RangeSet.empty as RangeSet<Decoration>
        const block = Decoration.replace({ block: true })
        const b = RangeSet.of([block.range(2, 4)])
        const diff = ChangeSet.empty(7)
        const changes = heightRelevantDecoChanges([a], [b], diff)
        expect(changes).toEqual([2, 4])
    })

    it('两侧相同 → 无变更', () => {
        const block = Decoration.replace({ block: true })
        const a = RangeSet.of([block.range(2, 4)])
        const b = RangeSet.of([block.range(2, 4)])
        const diff = ChangeSet.empty(7)
        const changes = heightRelevantDecoChanges([a], [b], diff)
        expect(changes).toEqual([])
    })
})

describe('HeightMap 可监测:toJSON', () => {
    it('纯文本树:toJSON 产出结构化 JSON', () => {
        const oracle = new HeightOracle(false)
        oracle.setDoc(Rope.of(['hello', 'world']))
        const hm = HeightMap.empty().applyChanges([], oracle.doc, oracle, [{ fromA: 0, toA: 0, fromB: 0, toB: 11 }])
        const updated = hm.updateHeight(oracle, 0, true, new MeasuredHeights(0, [14, 14]))
        const json = updated.toJSON() as { type: string, length: number, height: number }
        expect(['line', 'branch', 'gap']).toContain(json.type)
        expect(json.length).toBe(11)
        expect(json.height).toBeGreaterThan(0)
    })

    it('toString 与 toJSON 语义一致', () => {
        const oracle = new HeightOracle(false)
        oracle.setDoc(Rope.of(['ab', 'cd']))
        const hm = HeightMap.empty().applyChanges([], oracle.doc, oracle, [{ fromA: 0, toA: 0, fromB: 0, toB: 5 }])
        const updated = hm.updateHeight(oracle, 0, true, new MeasuredHeights(0, [14, 14]))
        const str = updated.toString()
        const json = updated.toJSON() as { type: string }
        expect(typeof str).toBe('string')
        expect(typeof json.type).toBe('string')
    })

    it('BlockInfo.toJSON 产出 {from,length,top,height}', () => {
        const bi = new BlockInfo(0, 10, 0, 14, 0)
        expect(bi.toJSON()).toEqual({ from: 0, length: 10, top: 0, height: 14 })
    })

    it('HeightOracle.heightSamples 可枚举', () => {
        const oracle = new HeightOracle(false)
        oracle.lineHeight = 20
        oracle.setDoc(Rope.of(['x']))
        const hm = HeightMap.empty().applyChanges([], oracle.doc, oracle, [{ fromA: 0, toA: 0, fromB: 0, toB: 1 }])
        hm.updateHeight(oracle, 0, true, new MeasuredHeights(0, [20]))
        expect(typeof oracle.heightSamples).toBe('object')
    })
})

void (BlockInfo)
