import type { RangeComparator, SpanIterator } from '../../src/core/model/rangeset'
import { describe, expect, it } from 'vitest'
import { ChangeSet } from '../../src/core/model/change'
import { Range, RangeSet, RangeSetBuilder, RangeValue } from '../../src/core/model/rangeset'

// CM7 RangeSet —— 把「值」关联到文档区间的不可变集合(装饰/标记/有状态区间的底座)。
// 数据结构 = 分块(Chunk,相对偏移)+ 分层(nextLayer,重叠区间下沉),map/update O(变更量)。
// 算法逐行移植 CM6 rangeset.ts 的 chunk/layer 核心(被装饰系统验证过的硬核)。
//
// 砍:CM6 底部 ~350 行 compare/spans/eq/SpanCursor 是纯视图层装饰 diff(算最小 DOM 更新),
// 阶段1 无渲染器→无消费者→不搬,阶段2 装饰落地时再回来(元真理)。
//
// 可监测:值是不透明用户对象,双射不走 toJSON,而走枚举——between/iter 必须吐出每个区间;
// 结构双射 = of(collect(set)) 复现等价集合(between 结果相同)。

// 测试用具体 RangeValue:带 tag,eq 按 tag 比。
class Mark extends RangeValue {
    constructor(readonly tag: string) { super() }
    eq(other: RangeValue) { return other instanceof Mark && other.tag === this.tag }
}
const mark = (tag: string) => new Mark(tag)

// 点装饰:point=true(原子,空区间也有意义)
class Pt extends RangeValue {
    point = true
    constructor(readonly tag: string) { super() }
    eq(other: RangeValue) { return other instanceof Pt && other.tag === this.tag }
}

function collect<T extends RangeValue>(set: RangeSet<T>) {
    const out: { from: number, to: number, tag: string }[] = []
    set.between(0, set.length, (from, to, v) => {
        out.push({ from, to, tag: (v as unknown as Mark).tag })
    })
    return out
}

describe('rangeSet.of + between —— 构造与枚举', () => {
    it('单区间', () => {
        const set = RangeSet.of([mark('a').range(1, 3)])
        expect(set.size).toBe(1)
        expect(collect(set)).toEqual([{ from: 1, to: 3, tag: 'a' }])
    })
    it('多区间(已排序)', () => {
        const set = RangeSet.of([mark('a').range(0, 2), mark('b').range(4, 6), mark('c').range(8, 9)])
        expect(set.size).toBe(3)
        expect(collect(set).map(r => r.tag)).toEqual(['a', 'b', 'c'])
    })
    it('sort=true 自动排序', () => {
        const set = RangeSet.of([mark('c').range(8, 9), mark('a').range(0, 2), mark('b').range(4, 6)], true)
        expect(collect(set).map(r => r.tag)).toEqual(['a', 'b', 'c'])
    })
    it('未排序输入抛错', () => {
        expect(() => RangeSet.of([mark('c').range(8, 9), mark('a').range(0, 2)])).toThrow()
    })
    it('between 子区间过滤', () => {
        const set = RangeSet.of([mark('a').range(0, 2), mark('b').range(4, 6), mark('c').range(8, 9)])
        expect(collect2(set, 3, 7).map(r => r.tag)).toEqual(['b'])
    })
})

function collect2<T extends RangeValue>(set: RangeSet<T>, from: number, to: number) {
    const out: { tag: string }[] = []
    set.between(from, to, (_f, _t, v) => {
        out.push({ tag: (v as unknown as Mark).tag })
    })
    return out
}

describe('rangeSet 重叠区间分层', () => {
    it('重叠区间 size 全计入,between 全枚举', () => {
        const set = RangeSet.of([mark('a').range(0, 5), mark('b').range(2, 8)])
        expect(set.size).toBe(2)
        const tags = collect(set).map(r => r.tag).sort()
        expect(tags).toEqual(['a', 'b'])
    })
})

describe('rangeSet.iter —— 游标', () => {
    it('从头遍历 from/to/value', () => {
        const set = RangeSet.of([mark('a').range(1, 3), mark('b').range(5, 7)])
        const cur = set.iter()
        expect([cur.from, cur.to, (cur.value as Mark).tag]).toEqual([1, 3, 'a'])
        cur.next()
        expect([cur.from, cur.to, (cur.value as Mark).tag]).toEqual([5, 7, 'b'])
        cur.next()
        expect(cur.value).toBe(null)
    })
    it('goto 跳到 from 之后', () => {
        const set = RangeSet.of([mark('a').range(1, 3), mark('b').range(5, 7)])
        const cur = set.iter(4)
        expect((cur.value as Mark).tag).toBe('b')
    })
})

describe('rangeSet.map —— 经文档变更', () => {
    it('区间随插入右移', () => {
        const set = RangeSet.of([mark('a').range(4, 6)])
        const mapped = set.map(ChangeSet.of({ from: 0, to: 0, insert: 'XX' }, 10))
        expect(collect(mapped)).toEqual([{ from: 6, to: 8, tag: 'a' }])
    })
    it('被删除区间随删除收缩', () => {
        const set = RangeSet.of([mark('a').range(2, 8)])
        const mapped = set.map(ChangeSet.of({ from: 3, to: 5 }, 10)) // 删 [3,5)
        expect(collect(mapped)).toEqual([{ from: 2, to: 6, tag: 'a' }])
    })
    it('整段被删的非点区间消失', () => {
        const set = RangeSet.of([mark('a').range(3, 5)])
        const mapped = set.map(ChangeSet.of({ from: 2, to: 6 }, 10)) // 删覆盖 [3,5)
        expect(set.size).toBe(1)
        expect(mapped.size).toBe(0)
    })
    it('空变更恒等', () => {
        const set = RangeSet.of([mark('a').range(2, 4)])
        expect(set.map(ChangeSet.empty(10))).toBe(set)
    })
})

describe('rangeSet.update —— 增删', () => {
    it('add 新区间(排序合入)', () => {
        const set = RangeSet.of([mark('a').range(0, 2), mark('c').range(8, 9)])
        const next = set.update({ add: [mark('b').range(4, 6)] })
        expect(collect(next).map(r => r.tag)).toEqual(['a', 'b', 'c'])
    })
    it('filter 剔除区间', () => {
        const set = RangeSet.of([mark('a').range(0, 2), mark('b').range(4, 6), mark('c').range(8, 9)])
        const next = set.update({ filter: (_f, _t, v) => (v as Mark).tag !== 'b' })
        expect(collect(next).map(r => r.tag)).toEqual(['a', 'c'])
    })
    it('add 未排序 + sort=true', () => {
        const set = RangeSet.empty
        const next = set.update({ add: [mark('c').range(8, 9), mark('a').range(0, 2)], sort: true })
        expect(collect(next).map(r => r.tag)).toEqual(['a', 'c'])
    })
})

describe('rangeSet 点区间(point)', () => {
    it('空点区间 between 可枚举', () => {
        const set = RangeSet.of([new Pt('p').range(3, 3)])
        expect(set.size).toBe(1)
        const out: string[] = []
        set.between(0, 10, (_f, _t, v) => {
            out.push((v as Pt).tag)
        })
        expect(out).toEqual(['p'])
    })
})

describe('rangeSet 可监测:结构双射 of(collect(set))', () => {
    it('收集再重建,between 结果一致', () => {
        const set = RangeSet.of([mark('a').range(0, 2), mark('b').range(4, 6), mark('c').range(8, 9)])
        const rebuilt = RangeSet.of(collect(set).map(r => mark(r.tag).range(r.from, r.to)))
        expect(collect(rebuilt)).toEqual(collect(set))
    })
})

describe('rangeSetBuilder', () => {
    it('builder 顺序 add 等价于 of', () => {
        const b = new RangeSetBuilder<Mark>()
        b.add(0, 2, mark('a'))
        b.add(4, 6, mark('b'))
        const set = b.finish()
        expect(collect(set).map(r => r.tag)).toEqual(['a', 'b'])
    })
    it('range/RangeValue 导出存在', () => {
        expect(mark('a').range(0, 1) instanceof Range).toBe(true)
        expect(mark('a') instanceof RangeValue).toBe(true)
    })
})

// ── 阶段2 恢复:spans/compare/eq(装饰投影 + 视图 diff 引擎)──

describe('rangeSet.spans —— 跨度枚举(heightmap 投影底座)', () => {
    it('整段非点区间逐段 span,覆盖 [from,to) 全程', () => {
        const set = RangeSet.of([mark('a').range(2, 5)])
        const segs: { kind: string, from: number, to: number, tags: string[] }[] = []
        const it: SpanIterator<Mark> = {
            span: (from, to, active) => segs.push({ kind: 'span', from, to, tags: active.map(v => v.tag) }),
            point: (from, to, value) => segs.push({ kind: 'point', from, to, tags: [value.tag] }),
        }
        RangeSet.spans([set], 0, 8, it)
        // 全程被切成 [0,2)空 / [2,5)覆盖a / [5,8)空
        expect(segs).toEqual([
            { kind: 'span', from: 0, to: 2, tags: [] },
            { kind: 'span', from: 2, to: 5, tags: ['a'] },
            { kind: 'span', from: 5, to: 8, tags: [] },
        ])
    })
    it('点装饰走 point 回调', () => {
        const set = RangeSet.of([new Pt('p').range(4, 4)])
        const hits: string[] = []
        RangeSet.spans([set], 0, 8, {
            span: () => {},
            point: (_f, _t, v) => hits.push(v.tag),
        })
        expect(hits).toEqual(['p'])
    })
    it('重叠区间 active 同时列出', () => {
        const set = RangeSet.of([mark('a').range(0, 6), mark('b').range(2, 4)])
        let mid: string[] = []
        RangeSet.spans([set], 0, 6, {
            span: (from, _t, active) => {
                if (from === 2)
                    mid = active.map(v => v.tag).sort()
            },
            point: () => {},
        })
        expect(mid).toEqual(['a', 'b'])
    })
})

describe('rangeSet.compare —— 视图 diff 回调', () => {
    it('新增区间触发 compareRange,标出差异段', () => {
        const oldSet = RangeSet.empty
        const newSet = RangeSet.of([mark('a').range(2, 5)])
        const changed: { from: number, to: number }[] = []
        const cmp: RangeComparator<Mark> = {
            compareRange: (from, to) => changed.push({ from, to }),
            comparePoint: () => {},
        }
        RangeSet.compare([oldSet], [newSet], ChangeSet.empty(8).desc, cmp)
        expect(changed).toEqual([{ from: 2, to: 5 }])
    })
    it('相同区间集无差异回调', () => {
        const set = RangeSet.of([mark('a').range(2, 5)])
        let calls = 0
        RangeSet.compare([set], [set], ChangeSet.empty(8).desc, {
            compareRange: () => calls++,
            comparePoint: () => calls++,
        })
        expect(calls).toBe(0)
    })
    it('点装饰变化触发 comparePoint', () => {
        const oldSet = RangeSet.of([new Pt('p').range(4, 4)])
        const newSet = RangeSet.of([new Pt('q').range(4, 4)])
        const pts: { from: number, to: number }[] = []
        RangeSet.compare([oldSet], [newSet], ChangeSet.empty(8).desc, {
            compareRange: () => {},
            comparePoint: (from, to) => pts.push({ from, to }),
        })
        expect(pts).toEqual([{ from: 4, to: 4 }])
    })
})

describe('RangeSet 可监测:toJSON 分层 dump', () => {
    class V extends RangeValue {
        constructor(readonly tag: string) { super() }
        eq(other: V) { return this.tag === other.tag }
    }
    V.prototype.startSide = V.prototype.endSide = 0

    it('空集 toJSON 产空 layers', () => {
        expect(RangeSet.empty.toJSON()).toEqual({ layers: [] })
    })

    it('单层区间:toJSON 产 1 层,含所有区间 from/to', () => {
        const set = RangeSet.of([new V('a').range(0, 3), new V('b').range(5, 8)])
        const json = set.toJSON()
        expect(json.layers.length).toBe(1)
        expect(json.layers[0].ranges).toContainEqual({ from: 0, to: 3 })
        expect(json.layers[0].ranges).toContainEqual({ from: 5, to: 8 })
    })

    it('重叠区间:toJSON 产多层(下沉)', () => {
        // [0,5) 和 [2,7) 重叠 → 一个在 layer0,另一个下沉到 layer1
        const set = RangeSet.of([new V('a').range(0, 5), new V('b').range(2, 7)])
        const json = set.toJSON()
        expect(json.layers.length).toBe(2)
    })

    it('toJSON 与 between 枚举一致(区间数相等)', () => {
        const set = RangeSet.of([new V('a').range(0, 3), new V('b').range(2, 7), new V('c').range(10, 12)])
        const json = set.toJSON()
        let count = 0
        set.between(0, 15, () => { count++ })
        const jsonCount = json.layers.reduce((n, l) => n + l.ranges.length, 0)
        expect(jsonCount).toBe(count)
    })
})
