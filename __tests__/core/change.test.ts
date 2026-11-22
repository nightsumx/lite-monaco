import { describe, expect, it } from 'vitest'
import { checkInvariant, roundtrip } from '../helpers/laws'
import { ChangeSet, MapMode } from '../../src/core/model/change'
import { Rope } from '../../src/core/model/rope'

// CM7 ChangeSet —— 编辑的代数对象。建模:文档变更 = 段序列(每段「旧长:新长」)。
// 代数结构 = 幺半群(monoid):compose 结合 + empty 为单位元(无逆元,故非群)。
// 算法逐行移植 CM6 change.ts(compose/map 是被协同编辑验证过的 OT 核心,不重推);
// 可监测面 = toJSON/fromJSON(序列化双射律钉死)。
//
// 律分两类(CM7-DESIGN §6.5):
//   代数律 —— apply 正确性、monoid(结合/单位)、mapPos、invert 自逆
//   序列化双射 —— toJSON/fromJSON 无损往返(=可监测公理)

const doc = (s: string) => Rope.of(s.split('\n'))
const applied = (cs: ChangeSet, d: Rope) => cs.apply(d).toString()

describe('ChangeSet.of + apply —— 编辑原语', () => {
    const d = doc('abc')
    it('插入', () => {
        expect(applied(ChangeSet.of({ from: 1, to: 1, insert: 'X' }, 3), d)).toBe('aXbc')
    })
    it('删除', () => {
        expect(applied(ChangeSet.of({ from: 1, to: 2 }, 3), d)).toBe('ac')
    })
    it('替换', () => {
        expect(applied(ChangeSet.of({ from: 1, to: 2, insert: 'XY' }, 3), d)).toBe('aXYc')
    })
    it('多段一次性', () => {
        expect(applied(ChangeSet.of([{ from: 0, to: 1, insert: 'A' }, { from: 2, to: 3, insert: 'C' }], 3), d)).toBe('AbC')
    })
    it('跨行插入换行', () => {
        expect(applied(ChangeSet.of({ from: 1, to: 1, insert: '\n' }, 3), d)).toBe('a\nbc')
    })
    it('应用到长度不符的文档抛错', () => {
        expect(() => ChangeSet.of({ from: 0, to: 1 }, 3).apply(doc('abcd'))).toThrow()
    })
})

describe('ChangeSet 长度与空判', () => {
    it('length / newLength', () => {
        const cs = ChangeSet.of({ from: 1, to: 2, insert: 'XY' }, 3)
        expect(cs.length).toBe(3)
        expect(cs.newLength).toBe(4)
    })
    it('empty(n) 是恒等', () => {
        expect(ChangeSet.empty(3).empty).toBe(true)
        expect(applied(ChangeSet.empty(3), doc('abc'))).toBe('abc')
    })
})

describe('ChangeSet monoid 律', () => {
    // 结合律:三次连续编辑,(c1∘c2)∘c3 与 c1∘(c2∘c3) 应用结果同
    it('compose 结合', () => {
        const c1 = ChangeSet.of({ from: 0, to: 0, insert: 'X' }, 3) // abc → Xabc (len4)
        const c2 = ChangeSet.of({ from: 4, to: 4, insert: 'Y' }, 4) // Xabc → XabcY (len5)
        const c3 = ChangeSet.of({ from: 0, to: 1, insert: 'Z' }, 5) // XabcY → ZabcY
        const left = c1.compose(c2).compose(c3)
        const right = c1.compose(c2.compose(c3))
        expect(applied(left, doc('abc'))).toBe('ZabcY')
        expect(applied(right, doc('abc'))).toBe('ZabcY')
    })
    it('单位元:c∘empty(c.newLength) ≡ c,empty(c.length)∘c ≡ c', () => {
        const c = ChangeSet.of({ from: 1, to: 2, insert: 'XY' }, 3)
        const d = doc('abc')
        expect(applied(c.compose(ChangeSet.empty(c.newLength)), d)).toBe(applied(c, d))
        expect(applied(ChangeSet.empty(c.length).compose(c), d)).toBe(applied(c, d))
    })
})

describe('ChangeSet.mapPos —— 位置映射', () => {
    // 在 pos 2 插入 2 字符:<2 不变,2 视 assoc 落 2 或 4,>2 平移 +2
    const cs = ChangeSet.of({ from: 2, to: 2, insert: 'XX' }, 5)
    it('插入点前不变', () => expect(cs.mapPos(1)).toBe(1))
    it('插入点 assoc<0 留前', () => expect(cs.mapPos(2, -1)).toBe(2))
    it('插入点 assoc>0 移后', () => expect(cs.mapPos(2, 1)).toBe(4))
    it('插入点后平移', () => expect(cs.mapPos(3)).toBe(5))
})

describe('ChangeSet.mapPos —— MapMode 追踪(位置落进被删段时返 null)', () => {
    // 删除 [2,5):被覆盖段。pos=3 落在段内。Simple 钳位,三种 Track 模式各按条件返 null。
    const del = ChangeSet.of({ from: 2, to: 5 }, 7) // abcdefg → abfg
    it('Simple:段内位置钳到段起点', () => {
        expect(del.mapPos(3, -1, MapMode.Simple)).toBe(2)
    })
    it('TrackDel:位置严格落在删除段内 → null', () => {
        expect(del.mapPos(3, -1, MapMode.TrackDel)).toBeNull()
    })
    it('TrackBefore:删除段起点在 pos 前 → null', () => {
        expect(del.mapPos(3, -1, MapMode.TrackBefore)).toBeNull()
    })
    it('TrackAfter:删除段终点在 pos 后 → null', () => {
        expect(del.mapPos(3, -1, MapMode.TrackAfter)).toBeNull()
    })
    it('段外位置:各 mode 一致返回映射值(不 null)', () => {
        // pos=6(删除段后)→ 平移 -3 = 3
        for (const m of [MapMode.Simple, MapMode.TrackDel, MapMode.TrackBefore, MapMode.TrackAfter])
            expect(del.mapPos(6, -1, m)).toBe(3)
    })
    it('删除段边界:pos=2(起点)TrackBefore 不 null(posA<pos 不成立)', () => {
        expect(del.mapPos(2, -1, MapMode.TrackBefore)).toBe(2)
    })
})

describe('ChangeSet.invert —— 自逆', () => {
    it('invert(doc) 撤销原变更', () => {
        const d = doc('hello world')
        const cs = ChangeSet.of({ from: 0, to: 5, insert: 'HI' }, 11) // hello world → HI world
        const after = cs.apply(d)
        expect(after.toString()).toBe('HI world')
        expect(cs.invert(d).apply(after).toString()).toBe('hello world')
    })
    it('invert 对所有单段编辑自逆', () => {
        expect(checkInvariant(
            (s: string, from: number, to: number, ins: string) => {
                const d = Rope.of([s])
                const cs = ChangeSet.of({ from, to, insert: ins }, s.length)
                return cs.invert(d).apply(cs.apply(d)).toString()
            },
            (out, s) => out === s,
            ['hello world', 2, 7, 'XY'],
        )).toBe(true)
    })
})

describe('ChangeSet 可监测公理:序列化双射', () => {
    // toJSON/fromJSON 必须无损往返。比对两端 JSON(规范形),不碰内部 sections 表示。
    it('insert/delete/replace 往返一致', () => {
        for (const spec of [
            { from: 1, to: 1, insert: 'X' },
            { from: 1, to: 2 },
            { from: 1, to: 2, insert: 'XY' },
            { from: 0, to: 0, insert: 'multi\nline' },
        ]) {
            const cs = ChangeSet.of(spec, 3)
            const round = ChangeSet.fromJSON(JSON.parse(JSON.stringify(cs.toJSON())))
            expect(round.toJSON()).toEqual(cs.toJSON())
            expect(applied(round, doc('abc'))).toBe(applied(cs, doc('abc')))
        }
    })

    roundtrip<[number[]], ChangeSet>(
        'changeset-json',
        json => ChangeSet.fromJSON(json),
        cs => cs.toJSON() as number[],
        {
            inputs: [
                [ChangeSet.of({ from: 1, to: 1, insert: 'X' }, 3).toJSON() as number[]],
                [ChangeSet.of({ from: 1, to: 2 }, 3).toJSON() as number[]],
                [ChangeSet.of({ from: 0, to: 0, insert: 'multi\nline' }, 3).toJSON() as number[]],
            ],
        },
    )
})

describe('mapSorted:一串升序位置一次映射,等于逐个 mapPos', () => {
    it('删除、插入、替换,各模式各方向', () => {
        const cs = ChangeSet.of([{ from: 2, to: 5 }, { from: 7, insert: 'xy' }, { from: 9, to: 11, insert: 'z' }, { from: 14, insert: 'q' }], 14)
        const ps = Array.from({ length: 15 }, (_, i) => i)
        for (const mode of [MapMode.Simple, MapMode.TrackDel, MapMode.TrackBefore, MapMode.TrackAfter])
            for (const assoc of [-1, 1])
                expect(cs.mapSorted(ps, assoc, mode)).toEqual(ps.map(p => cs.mapPos(p, assoc, mode)))
    })
})
