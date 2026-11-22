// Portions of this file are derived from CodeMirror 6 (MIT, Copyright (C) Marijn Haverbeke and others). See THIRD-PARTY-NOTICES.md.
// CM7 Viewport —— 视口几何:从 heightmap 算出「该渲染哪段文档」+ 超长文档的高度缩放。纯逻辑零 DOM。
//   heightmap 给「位置↔像素」,viewport 在其上加两件事:① 可见窗口 ± margin → 渲染区间(虚拟化);
//   ② 文档高 > 浏览器 DOM 上限(7e6px,定点数精度崩)时,把视口外的区域压扁(BigScaler)。
//
// 数据结构(从 CM6 viewstate.ts 抽出纯几何部分,逐行港接):
//   Viewport —— {from,to} 渲染区间(文档位置)。
//   YScaler(IdScaler/BigScaler)—— heightmap 高度 ↔ DOM 高度的双向缩放。scaleBlock 把 BlockInfo 缩放。
//   computeViewport/mapViewport/viewportIsAppropriate —— 纯函数,吃 heightMap+oracle+可见窗口,出 Viewport。
//
// 砍(阶段2 无消费者,落 docview/editorview 时恢复):
//   ViewState 整个类(DOM 耦合:measureVisibleLineHeights/pixelViewport/scrollAnchor/EditorView)、
//   scrollTarget 分支(滚动到某位置,要 ScrollTarget@extension.ts)、line-gap 虚拟化(lineStructure/
//   findPosition/findFraction + mapLineGaps,独立特性)、Direction/bidi。
//
// 可监测:scaler 双向(toDOM∘fromDOM 在视口内恒等)是它的双射验收;BigScaler.viewports 全公开可 dump。
//
// 接线状态:已完整移植 + 测试绿,**当前无产品消费者**(未在 core/index.ts 导出)。与 heightmap.ts
// 同为视口虚拟化预备件,刻意暂不接 EditorView——computeViewport 需要来自真 DOM scroll 的 visibleTop/
// Bottom,接它=复活 measure 循环 + 打破 dombridge 行索引不变量,jsdom 测不了几何。触发条件见
// [[litcode-cm7-stage3-deferred]](需:真大文档消费者 + 实测 jank + 增量 docView 先行)。

import type { ChangeDesc } from '../model/change'
import type { HeightMap, HeightOracle } from './heightmap'
import { BlockInfo, QueryType } from './heightmap'

// 视口边距与 DOM 高度上限。CM6 VP 常量的纯几何子集。
export const VP = {
    Margin: 300,
    MinCoverMargin: 10,
    MaxCoverMargin: 75, // Margin / 4
    MaxDOMHeight: 7e6,
}

export class Viewport {
    constructor(readonly from: number, readonly to: number) {}
}

// heightmap 高度 ↔ DOM 高度。文档不超 MaxDOMHeight 时用 IdScaler(恒等)。
export interface YScaler {
    toDOM: (n: number) => number
    fromDOM: (n: number) => number
    scale: number
    eq: (other: YScaler) => boolean
}

export const IdScaler: YScaler = {
    toDOM(n: number) { return n },
    fromDOM(n: number) { return n },
    scale: 1,
    eq(other: YScaler): boolean { return other === this },
}

// 文档高 > MaxDOMHeight 时,把视口外区域压扁,使总高恰为 MaxDOMHeight。视口内 1:1。
export class BigScaler implements YScaler {
    scale: number
    viewports: { from: number, to: number, top: number, bottom: number, domTop: number, domBottom: number }[]

    constructor(oracle: HeightOracle, heightMap: HeightMap, viewports: readonly Viewport[]) {
        let vpHeight = 0
        let base = 0
        let domBase = 0
        this.viewports = viewports.map(({ from, to }) => {
            const top = heightMap.lineAt(from, QueryType.ByPos, oracle, 0, 0).top
            const bottom = heightMap.lineAt(to, QueryType.ByPos, oracle, 0, 0).bottom
            vpHeight += bottom - top
            return { from, to, top, bottom, domTop: 0, domBottom: 0 }
        })
        this.scale = (VP.MaxDOMHeight - vpHeight) / (heightMap.height - vpHeight)
        for (const obj of this.viewports) {
            obj.domTop = domBase + (obj.top - base) * this.scale
            domBase = obj.domBottom = obj.domTop + (obj.bottom - obj.top)
            base = obj.bottom
        }
    }

    toDOM(n: number) {
        for (let i = 0, base = 0, domBase = 0; ; i++) {
            const vp = i < this.viewports.length ? this.viewports[i] : null
            if (!vp || n < vp.top)
                return domBase + (n - base) * this.scale
            if (n <= vp.bottom)
                return vp.domTop + (n - vp.top)
            base = vp.bottom
            domBase = vp.domBottom
        }
    }

    fromDOM(n: number) {
        for (let i = 0, base = 0, domBase = 0; ; i++) {
            const vp = i < this.viewports.length ? this.viewports[i] : null
            if (!vp || n < vp.domTop)
                return base + (n - domBase) / this.scale
            if (n <= vp.domBottom)
                return vp.top + (n - vp.domTop)
            base = vp.bottom
            domBase = vp.domBottom
        }
    }

    eq(other: YScaler): boolean {
        if (!(other instanceof BigScaler))
            return false
        return this.scale === other.scale && this.viewports.length === other.viewports.length
            && this.viewports.every((vp, i) => vp.from === other.viewports[i].from && vp.to === other.viewports[i].to)
    }
}

// 用 scaler 把一个块的 top/height 从 heightmap 高度缩到 DOM 高度。复合块递归缩子块。
export function scaleBlock(block: BlockInfo, scaler: YScaler): BlockInfo {
    if (scaler.scale === 1)
        return block
    const bTop = scaler.toDOM(block.top)
    const bBottom = scaler.toDOM(block.bottom)
    return new BlockInfo(block.from, block.length, bTop, bBottom - bTop, Array.isArray(block._content) ? block._content.map(b => scaleBlock(b, scaler)) : block._content)
}

// 选 scaler:文档高在 DOM 能力内 → 恒等;超了 → BigScaler 压扁视口外。
export function makeScaler(oracle: HeightOracle, heightMap: HeightMap, viewports: readonly Viewport[]): YScaler {
    return heightMap.height <= VP.MaxDOMHeight ? IdScaler : new BigScaler(oracle, heightMap, viewports)
}

// 从可见窗口(visibleTop/Bottom,heightmap 高度)算渲染区间:上下各扩 margin(按 bias 分配),
// 再吸附到完整行边界。bias = 自上次更新以来视口位移,用于把更多 margin 放在滚动方向一侧。
// (CM6 getViewport 的纯几何核;scrollTarget 分支留给 docview。)
export function computeViewport(
    heightMap: HeightMap,
    oracle: HeightOracle,
    visibleTop: number,
    visibleBottom: number,
    bias: number,
): Viewport {
    const marginTop = 0.5 - Math.max(-0.5, Math.min(0.5, bias / VP.Margin / 2))
    return new Viewport(
        heightMap.lineAt(visibleTop - marginTop * VP.Margin, QueryType.ByHeight, oracle, 0, 0).from,
        heightMap.lineAt(visibleBottom + (1 - marginTop) * VP.Margin, QueryType.ByHeight, oracle, 0, 0).to,
    )
}

// 文档变更后把旧视口区间平移到新文档,再吸附到行边界。
export function mapViewport(viewport: Viewport, changes: ChangeDesc, heightMap: HeightMap, oracle: HeightOracle): Viewport {
    const from = changes.mapPos(viewport.from, -1)
    const to = changes.mapPos(viewport.to, 1)
    return new Viewport(
        heightMap.lineAt(from, QueryType.ByPos, oracle, 0, 0).from,
        heightMap.lineAt(to, QueryType.ByPos, oracle, 0, 0).to,
    )
}

// 判断一个视口是否「恰好」覆盖可见区:既盖住可见窗口(留足 cover margin),又没超出 2×margin 太多。
export function viewportIsAppropriate(
    viewport: Viewport,
    heightMap: HeightMap,
    oracle: HeightOracle,
    visibleTop: number,
    visibleBottom: number,
    docLength: number,
    bias = 0,
): boolean {
    const { top } = heightMap.lineAt(viewport.from, QueryType.ByPos, oracle, 0, 0)
    const { bottom } = heightMap.lineAt(viewport.to, QueryType.ByPos, oracle, 0, 0)
    return (viewport.from === 0 || top <= visibleTop - Math.max(VP.MinCoverMargin, Math.min(-bias, VP.MaxCoverMargin)))
        && (viewport.to === docLength
            || bottom >= visibleBottom + Math.max(VP.MinCoverMargin, Math.min(bias, VP.MaxCoverMargin)))
        && (top > visibleTop - 2 * VP.Margin && bottom < visibleBottom + 2 * VP.Margin)
}
