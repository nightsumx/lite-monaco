import { describe, expect, it } from 'vitest'
import { ChangeSet } from '../../src/core/model/change'
import { HeightMap, HeightOracle, QueryType } from '../../src/core/view/heightmap'
import { Rope } from '../../src/core/model/rope'
import {
    BigScaler,
    computeViewport,
    IdScaler,
    makeScaler,
    mapViewport,
    scaleBlock,
    Viewport,
    viewportIsAppropriate,
    VP,
} from '../../src/core/view/viewport'

// CM7 Viewport —— heightmap 之上的视口几何:渲染区间(虚拟化)+ 超长文档高度缩放。纯逻辑零 DOM。
//
// 可监测(本测核心):YScaler 双向 fromDOM∘toDOM 在视口内恒等 = 缩放的双射验收;
//   computeViewport/viewportIsAppropriate 是纯函数,合成 heightMap+oracle+可见窗口即钉死几何律。

function oracle(lineHeight = 10) {
    const o = new HeightOracle(false)
    o.lineHeight = lineHeight
    return o
}

// 建一棵 n 行、每行 lineHeight 高的 heightmap(纯文本,无装饰)。
function mapOf(lines: number, o: HeightOracle) {
    const doc = Rope.of(Array.from({ length: lines }, (_, i) => `line${i}`))
    o.setDoc(doc)
    const full = { fromA: 0, toA: 0, fromB: 0, toB: doc.length }
    return { map: HeightMap.empty().applyChanges([], Rope.empty, o, [full]), doc }
}

describe('idScaler —— 文档不超 DOM 上限时恒等', () => {
    it('toDOM/fromDOM 原样返回', () => {
        expect(IdScaler.toDOM(123)).toBe(123)
        expect(IdScaler.fromDOM(123)).toBe(123)
        expect(IdScaler.scale).toBe(1)
    })

    it('makeScaler 在矮文档上选 IdScaler', () => {
        const o = oracle()
        const { map } = mapOf(100, o)
        const scaler = makeScaler(o, map, [new Viewport(0, 10)])
        expect(scaler).toBe(IdScaler)
    })
})

describe('bigScaler —— 超 DOM 上限时压扁视口外,视口内 1:1', () => {
    // lineHeight 拉到 1e6,10 行 → 总高 1e7 > MaxDOMHeight(7e6),触发 BigScaler。
    // 视口只盖前 3 行,留出视口外区域可压扁。
    function tallMap() {
        const o = oracle(1e6)
        const { map, doc } = mapOf(10, o)
        const vp = new Viewport(doc.line(1).from, doc.line(3).to)
        return { o, map, doc, scaler: makeScaler(o, map, [vp]), vp }
    }

    it('选中 BigScaler 且总高被压到 MaxDOMHeight', () => {
        const { map, scaler } = tallMap()
        expect(scaler instanceof BigScaler).toBe(true)
        expect(map.height).toBe(1e7)
        // 文档总高经 toDOM 后 = MaxDOMHeight。
        expect(Math.round(scaler.toDOM(map.height))).toBe(VP.MaxDOMHeight)
    })

    it('可监测:视口内 fromDOM∘toDOM 恒等(缩放双射)', () => {
        const { scaler, vp, map, o } = tallMap()
        const top = map.lineAt(vp.from, QueryType.ByPos, o, 0, 0).top
        const bottom = map.lineAt(vp.to, QueryType.ByPos, o, 0, 0).bottom
        // top/mid/bottom 都落在 1:1 区,无缩放 → 严格相等(非近似)。
        for (const h of [top, (top + bottom) / 2, bottom]) {
            expect(scaler.fromDOM(scaler.toDOM(h))).toBe(h)
        }
    })

    it('视口外的高度被压缩(scale = (MaxDOM-vp)/(total-vp))', () => {
        const { scaler } = tallMap()
        // 3 行视口 = 3e6,总高 1e7,MaxDOM 7e6 → scale = 4e6/7e6。
        expect(scaler.scale).toBe((VP.MaxDOMHeight - 3e6) / (1e7 - 3e6))
    })

    it('eq:同 viewports 相等,异则否', () => {
        const a = tallMap().scaler
        const b = tallMap().scaler
        expect(a.eq(b)).toBe(true)
        expect(a.eq(IdScaler)).toBe(false)
    })
})

describe('scaleBlock —— 块几何随 scaler 缩放', () => {
    it('idScaler 原样返回同一对象', () => {
        const o = oracle()
        const { map } = mapOf(100, o)
        const block = map.lineAt(5, QueryType.ByPos, o, 0, 0)
        expect(scaleBlock(block, IdScaler)).toBe(block)
    })
})

describe('computeViewport —— 可见窗口 ± margin → 渲染区间', () => {
    it('视口吸附到完整行,且 margin 按 bias=0 上下均分', () => {
        const o = oracle()
        const { map } = mapOf(1000, o)
        const vp = computeViewport(map, o, 5000, 5100, 0)
        // bias=0 → marginTop=0.5,上下各扩 Margin/2;边界 = 对应高度所在行的 from/to。
        expect(vp.from).toBe(map.lineAt(5000 - VP.Margin / 2, QueryType.ByHeight, o, 0, 0).from)
        expect(vp.to).toBe(map.lineAt(5100 + VP.Margin / 2, QueryType.ByHeight, o, 0, 0).to)
        // 且吸附在行边界上(from 自身所在行的 from 即自身)。
        expect(vp.from).toBe(map.lineAt(vp.from, QueryType.ByPos, o, 0, 0).from)
        expect(vp.to).toBe(map.lineAt(vp.to, QueryType.ByPos, o, 0, 0).to)
    })

    it('viewportIsAppropriate:刚算出的视口对自己的可见窗口成立', () => {
        const o = oracle()
        const { map, doc } = mapOf(1000, o)
        const vp = computeViewport(map, o, 5000, 5100, 0)
        expect(viewportIsAppropriate(vp, map, o, 5000, 5100, doc.length, 0)).toBe(true)
    })

    it('viewportIsAppropriate:可见窗口跑远后不再成立', () => {
        const o = oracle()
        const { map, doc } = mapOf(1000, o)
        const vp = computeViewport(map, o, 0, 100, 0)
        expect(viewportIsAppropriate(vp, map, o, 8000, 8100, doc.length, 0)).toBe(false)
    })
})

describe('mapViewport —— 文档变更后平移视口', () => {
    it('空变更:视口区间不变(吸附后等价)', () => {
        const o = oracle()
        const { map, doc } = mapOf(1000, o)
        const vp = computeViewport(map, o, 5000, 5100, 0)
        const mapped = mapViewport(vp, ChangeSet.empty(doc.length), map, o)
        expect(mapped.from).toBe(vp.from)
        expect(mapped.to).toBe(vp.to)
    })
})
