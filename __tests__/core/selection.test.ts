import { describe, expect, it } from 'vitest'
import { roundtrip } from '../helpers/laws'
import { ChangeSet } from '../../src/core/model/change'
import { EditorSelection, SelectionRange, checkSelection } from '../../src/core/model/selection'

// CM7 Selection —— 重新设计点(CM6 把 bidi/assoc/inverted/goalColumn 打包进单个 flags 整数,
// 正是「位打包」坏味道)。CM7 用显式字段 {anchor, head, assoc},inverted/from/to/empty 全是 getter;
// bidiLevel/goalColumn 是纯视图(渲染/竖向移动)关注点,从核心剔除,阶段2 在视图层重新引入。
// 核心 selection 只管:位置 + 经 ChangeSet 映射的语义。
//
// 律:anchor/head 对偶、多 range 归一化(排序+合并重叠)、map 经变更、序列化双射。

describe('SelectionRange 构造与 anchor/head 对偶', () => {
    it('cursor:anchor===head,empty', () => {
        const r = EditorSelection.cursor(3)
        expect(r.anchor).toBe(3)
        expect(r.head).toBe(3)
        expect(r.from).toBe(3)
        expect(r.to).toBe(3)
        expect(r.empty).toBe(true)
    })
    it('正向 range:anchor<head', () => {
        const r = EditorSelection.range(2, 5)
        expect(r.anchor).toBe(2)
        expect(r.head).toBe(5)
        expect(r.from).toBe(2)
        expect(r.to).toBe(5)
        expect(r.empty).toBe(false)
        expect(r.inverted).toBe(false)
    })
    it('反向 range:head<anchor → inverted,from/to 仍归一', () => {
        const r = EditorSelection.range(5, 2)
        expect(r.anchor).toBe(5)
        expect(r.head).toBe(2)
        expect(r.from).toBe(2)
        expect(r.to).toBe(5)
        expect(r.inverted).toBe(true)
    })
    it('cursor assoc 显式保留', () => {
        expect(EditorSelection.cursor(3, -1).assoc).toBe(-1)
        expect(EditorSelection.cursor(3, 1).assoc).toBe(1)
        expect(EditorSelection.cursor(3).assoc).toBe(0)
    })
})

describe('EditorSelection 归一化(排序+合并)', () => {
    it('single 单 range', () => {
        const s = EditorSelection.single(2, 5)
        expect(s.ranges.length).toBe(1)
        expect(s.main.from).toBe(2)
        expect(s.mainIndex).toBe(0)
    })
    it('create 乱序 range 按 from 排序', () => {
        const s = EditorSelection.create([EditorSelection.range(8, 10), EditorSelection.range(1, 3)])
        expect(s.ranges.map(r => r.from)).toEqual([1, 8])
    })
    it('重叠 range 合并', () => {
        const s = EditorSelection.create([EditorSelection.range(1, 5), EditorSelection.range(3, 8)])
        expect(s.ranges.length).toBe(1)
        expect(s.ranges[0].from).toBe(1)
        expect(s.ranges[0].to).toBe(8)
    })
    it('相邻非空 range 不合并(仅相触)', () => {
        const s = EditorSelection.create([EditorSelection.range(1, 3), EditorSelection.range(3, 5)])
        expect(s.ranges.length).toBe(2)
    })
    it('main 索引跟随合并迁移', () => {
        const s = EditorSelection.create([EditorSelection.range(1, 5), EditorSelection.range(3, 8)], 1)
        expect(s.ranges.length).toBe(1)
        expect(s.mainIndex).toBe(0)
    })
    it('空 range 列表抛错', () => {
        expect(() => EditorSelection.create([])).toThrow()
    })

    it('千级乱序 cursor 排序且插入后整体右移', () => {
        const ranges = Array.from({ length: 1000 }, (_, i) => EditorSelection.cursor(999 - i))
        const s = EditorSelection.create(ranges)
        expect(s.ranges.length).toBe(1000)
        expect(s.ranges[0].from).toBe(0)
        expect(s.ranges[999].from).toBe(999)
        const mapped = s.map(ChangeSet.of([{ from: 0, insert: 'x' }], 1000))
        expect(mapped.ranges.length).toBe(1000)
        expect(mapped.ranges[0].from).toBe(0)
        expect(mapped.ranges[999].from).toBe(1000)
    })
})

describe('SelectionRange.map 经变更', () => {
    it('cursor 经前插入右移', () => {
        const cs = ChangeSet.of({ from: 0, to: 0, insert: 'XX' }, 5)
        expect(EditorSelection.cursor(3).map(cs).head).toBe(5)
    })
    it('range 经内部删除收缩', () => {
        const cs = ChangeSet.of({ from: 1, to: 3 }, 5) // 删 [1,3)
        const r = EditorSelection.range(0, 5).map(cs)
        expect(r.from).toBe(0)
        expect(r.to).toBe(3)
    })
    it('map 保方向', () => {
        const cs = ChangeSet.of({ from: 0, to: 0, insert: 'X' }, 5)
        const r = EditorSelection.range(5, 2).map(cs)
        expect(r.inverted).toBe(true)
        expect(r.anchor).toBe(6)
        expect(r.head).toBe(3)
    })
    it('整 selection map 空变更恒等', () => {
        const s = EditorSelection.single(2, 5)
        expect(s.map(ChangeSet.empty(5))).toBe(s)
    })
})

describe('SelectionRange.eq', () => {
    it('同 anchor/head 相等', () => {
        expect(EditorSelection.range(2, 5).eq(EditorSelection.range(2, 5))).toBe(true)
        expect(EditorSelection.range(2, 5).eq(EditorSelection.range(5, 2))).toBe(false)
    })
})

describe('Selection 可监测公理:序列化双射', () => {
    it('range/cursor/multi 往返一致', () => {
        const sels = [
            EditorSelection.single(3),
            EditorSelection.single(2, 5),
            EditorSelection.create([EditorSelection.range(1, 3), EditorSelection.range(8, 5)], 1),
            new EditorSelection([EditorSelection.cursor(4, -1)], 0),
        ]
        for (const s of sels) {
            const round = EditorSelection.fromJSON(JSON.parse(JSON.stringify(s.toJSON())))
            expect(round.toJSON()).toEqual(s.toJSON())
            expect(round.eq(s)).toBe(true)
            expect(round.mainIndex).toBe(s.mainIndex)
        }
    })

    it('assoc/bidiLevel/goalColumn 序列化双射', () => {
        const r = EditorSelection.cursor(5, -1, 2, 12)
        const json = r.toJSON()
        expect(json.assoc).toBe(-1)
        expect(json.bidiLevel).toBe(2)
        expect(json.goalColumn).toBe(12)
        const round = SelectionRange.fromJSON(JSON.parse(JSON.stringify(json)))
        expect(round.assoc).toBe(-1)
        expect(round.bidiLevel).toBe(2)
        expect(round.goalColumn).toBe(12)
        expect(round.toJSON()).toEqual(json)
    })

    it('空 assoc/bidi/goal 不进 JSON(向后兼容)', () => {
        const r = EditorSelection.cursor(0)
        const json = r.toJSON()
        expect(json.assoc).toBeUndefined()
        expect(json.bidiLevel).toBeUndefined()
        expect(json.goalColumn).toBeUndefined()
    })
})

describe('checkSelection', () => {
    it('越界 range 抛错', () => {
        expect(() => checkSelection(EditorSelection.single(2, 8), 5)).toThrow()
        expect(() => checkSelection(EditorSelection.single(2, 5), 5)).not.toThrow()
    })
})

// 类型出口存在性(SelectionRange 被显式 import)
it('SelectionRange 导出', () => {
    expect(EditorSelection.cursor(0)).toBeInstanceOf(SelectionRange)
})

describe('Selection 可监测公理:序列化双射', () => {
    roundtrip<[unknown], SelectionRange>(
        'selectionrange-json',
        json => SelectionRange.fromJSON(json),
        r => r.toJSON(),
        {
            inputs: [
                [EditorSelection.single(0).main.toJSON()],
                [EditorSelection.single(2, 5).main.toJSON()],
                [EditorSelection.cursor(5, -1, 2, 12).toJSON()],
            ],
        },
    )

    roundtrip<[unknown], EditorSelection>(
        'editorselection-json',
        json => EditorSelection.fromJSON(json),
        s => s.toJSON(),
        {
            inputs: [
                [EditorSelection.single(3).toJSON()],
                [EditorSelection.create([EditorSelection.range(1, 3), EditorSelection.range(8, 5)], 1).toJSON()],
            ],
        },
    )
})

// extend(from,to):Shift+点击/拖选时以 anchor 为轴扩选。两分支:新区间包住 anchor → 整段取之;
// 否则 head 落在离 anchor 更远的那端(方向由此确定)。公开方法,单独钉。
describe('SelectionRange.extend', () => {
    it('新区间包住 anchor:返回整段', () => {
        const r = EditorSelection.cursor(5).extend(3, 8)
        expect(r.from).toBe(3)
        expect(r.to).toBe(8)
    })
    it('新区间在 anchor 右侧:head 取更远端(右扩)', () => {
        const r = EditorSelection.cursor(2).extend(5, 8)
        expect(r.anchor).toBe(2)
        expect(r.head).toBe(8) // |8-2|=6 > |5-2|=3
    })
    it('新区间在 anchor 左侧:head 取更远端(左扩,反向)', () => {
        const r = EditorSelection.cursor(8).extend(2, 5)
        expect(r.anchor).toBe(8)
        expect(r.head).toBe(2) // |2-8|=6 > |5-8|=3,反向
        expect(r.inverted).toBe(true)
    })
    it('单点 to 默认=from', () => {
        const r = EditorSelection.cursor(5).extend(2)
        expect(r.anchor).toBe(5)
        expect(r.head).toBe(2)
    })
    it('assoc 透传', () => {
        expect(EditorSelection.cursor(2).extend(5, 8, 1).assoc).toBe(1)
    })
})
