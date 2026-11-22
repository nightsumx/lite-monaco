import type { PointDecoration } from '../../src/core/model/decoration'
import type { SpanIterator } from '../../src/core/model/rangeset'
import { describe, expect, it } from 'vitest'
import { addRange, BlockType, Decoration, WidgetType } from '../../src/core/model/decoration'
import { RangeSet } from '../../src/core/model/rangeset'
import { HeightMap, HeightOracle } from '../../src/core/view/heightmap'
import { Rope } from '../../src/core/model/rope'

// CM7 Decoration —— 把「怎么画/排版一段内容」关联到区间的值类型(RangeValue 子类)。
// 阶段2 核心消费者是 heightmap:它只经 RangeSet.spans 读 point 装饰的 heightRelevant/widget 估高/
//   block/start-endSide。故只立 point 一支(widget/replace),mark/line/DOM 留给 buildtile。
//
// 可监测:装饰是不透明用户对象,可监测面 = RangeSet.spans 把它投影成跨度;Side 编码全显式常量。
// 这里的「双射」不走 toJSON,而走 spans 投影——和 rangeset 同源(枚举即监测)。

// 测试用具体 widget:带 tag + 可配估高/换行。
class TestWidget extends WidgetType {
    constructor(readonly tag: string, readonly height = -1, readonly breaks = 0) { super() }
    eq(other: WidgetType) { return other instanceof TestWidget && other.tag === this.tag }
    get estimatedHeight() { return this.height }
    get lineBreaks() { return this.breaks }
    toDOM(): Node { return document.createElement('span') }
}

describe('decoration.widget —— 行内/块 widget', () => {
    it('行内 widget:零长区间,point=true', () => {
        const deco = Decoration.widget({ widget: new TestWidget('w') })
        expect(deco.point).toBe(true)
        expect(deco.range(3, 3).from).toBe(3)
    })
    it('widget 装饰非零长区间抛错', () => {
        const deco = Decoration.widget({ widget: new TestWidget('w') })
        expect(() => deco.range(3, 5)).toThrow()
    })
    it('block widget heightRelevant 恒真', () => {
        const deco = Decoration.widget({ widget: new TestWidget('w'), block: true })
        expect((deco as PointDecoration).block).toBe(true)
        expect(deco.heightRelevant).toBe(true)
    })
    it('side 落进 Side 稠密编码:正在 InlineAfter 区、负在 InlineBefore 区', () => {
        const after = Decoration.widget({ widget: new TestWidget('w'), side: 1 })
        const before = Decoration.widget({ widget: new TestWidget('w'), side: -1 })
        expect(after.startSide).toBe(1e8 + 1) // InlineAfter + side
        expect(before.startSide).toBe(-1e8 - 1) // InlineBefore + side
    })
})

describe('decoration.replace —— 替换/隐藏区间', () => {
    it('可跨非零区间(isReplace)', () => {
        const deco = Decoration.replace({})
        expect(deco.range(2, 5).to).toBe(5)
    })
    it('block replace type=WidgetRange(start≠end)', () => {
        const deco = Decoration.replace({ block: true }) as PointDecoration
        expect(deco.type).toBe(BlockType.WidgetRange)
    })
    it('非法 replace 区间抛错', () => {
        const deco = Decoration.replace({}) as PointDecoration
        expect(() => deco.range(5, 2)).toThrow()
    })
})

describe('decoration.heightRelevant —— heightmap 投影判据', () => {
    it('估高 ≥5 的 widget heightRelevant', () => {
        const deco = Decoration.widget({ widget: new TestWidget('w', 20) })
        expect(deco.heightRelevant).toBe(true)
    })
    it('估高 <5 且非块的 widget 不影响高度', () => {
        const deco = Decoration.widget({ widget: new TestWidget('w', 2) })
        expect(deco.heightRelevant).toBe(false)
    })
    it('引入换行的 widget heightRelevant', () => {
        const deco = Decoration.widget({ widget: new TestWidget('w', -1, 2) })
        expect(deco.heightRelevant).toBe(true)
    })
})

describe('decoration.eq —— 重绘判据', () => {
    it('同 widget 同 side 相等', () => {
        const a = Decoration.widget({ widget: new TestWidget('w') })
        const b = Decoration.widget({ widget: new TestWidget('w') })
        expect(a.eq(b)).toBe(true)
    })
    it('不同 widget tag 不等', () => {
        const a = Decoration.widget({ widget: new TestWidget('w') })
        const b = Decoration.widget({ widget: new TestWidget('x') })
        expect(a.eq(b)).toBe(false)
    })
    it('block 与非 block 不等', () => {
        const a = Decoration.widget({ widget: new TestWidget('w'), block: true })
        const b = Decoration.widget({ widget: new TestWidget('w') })
        expect(a.eq(b)).toBe(false)
    })
})

describe('decoration 可监测:经 RangeSet.spans 投影(heightmap 真实消费路径)', () => {
    it('point widget 走 point 回调,带 deco', () => {
        const w = new TestWidget('w', 20)
        const set = RangeSet.of([Decoration.widget({ widget: w }).range(4, 4)])
        const points: { from: number, to: number, height: number }[] = []
        const it: SpanIterator<Decoration> = {
            span: () => {},
            point: (from, to, deco) => points.push({ from, to, height: deco.widget!.estimatedHeight }),
        }
        RangeSet.spans([set], 0, 8, it, 0)
        expect(points).toEqual([{ from: 4, to: 4, height: 20 }])
    })
    it('replace 区间作为 point 覆盖 [from,to)', () => {
        const set = RangeSet.of([Decoration.replace({}).range(2, 5)])
        const points: { from: number, to: number }[] = []
        RangeSet.spans([set], 0, 8, {
            span: () => {},
            point: (from, to) => points.push({ from, to }),
        }, 0)
        expect(points).toEqual([{ from: 2, to: 5 }])
    })
})

describe('addRange —— heightmap 变更区合并', () => {
    it('相邻(margin 内)合并', () => {
        const ranges: number[] = []
        addRange(0, 3, ranges, 5)
        addRange(5, 8, ranges, 5)
        expect(ranges).toEqual([0, 8])
    })
    it('远离则各自成段', () => {
        const ranges: number[] = []
        addRange(0, 3, ranges)
        addRange(10, 12, ranges)
        expect(ranges).toEqual([0, 3, 10, 12])
    })
})

describe('块 widget 高度', () => {
    it('估高 40 的 block widget 把 heightMap 撑高', () => {
        const o = new HeightOracle(false)
        o.lineHeight = 14
        const doc = Rope.of(['a', 'b'])
        o.setDoc(doc)
        const full = { fromA: 0, toA: 0, fromB: 0, toB: doc.length }
        const bare = HeightMap.empty().applyChanges([], Rope.empty, o, [full])
        const set = RangeSet.of([
            Decoration.replace({ widget: new TestWidget('blk', 40), block: true }).range(1, 2),
        ])
        const withW = HeightMap.empty().applyChanges([set], Rope.empty, o, [full])
        expect(withW.height).toBeGreaterThan(bare.height)
        expect(withW.height - bare.height).toBeGreaterThanOrEqual(40)
    })
})
