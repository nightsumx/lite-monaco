// planLinePatch 纯算术矩阵 —— 钉死「变更行区间 → 视口相对删除子节点区间」的换算。
//
// 为什么存在:patchDOM 的删除边界曾用「total(视口子节点数) - oldTailLines(全文档尾行数)」,
// 两坐标系相减,大文档(doc.lines >> 视口行数)时 removeEnd 变负 → 删除循环不跑 → 脏 .cm-line
// 残留、DOM≡doc 双射断裂(真页「随便回车都出 bug」)。jsdom 无布局视口退化为全文,此路径唯纯 fixture 可测。
//
// 稳定尾部改按「编辑前视口末行 oldEndLine」算(视口相对),而非全文档尾行数。
// buggy 版复刻老算术作对照:同一虚拟化 fixture 老版给出负 removeEnd,新版给正确视口相对区间。
//
// childCount 是浏览器变异后的当前子节点数:
//   · 程序 dispatch(无浏览器变异):childCount == 编辑前行数
//   · 浏览器输入(回车拆 div / 退格并 div):childCount == 变异后行数

import { describe, it, expect } from 'vitest'
import { planLinePatch, planViewportShift } from '../../src/core/view/linepatch'

// 老算术复刻(bug 版):total - 全文档尾。docLines 是全文档行数。
function planLinePatchBuggy(i: {
    oldStartLine: number
    childCount: number
    oldFromLine: number
    oldToLine: number
    docLines: number
}) {
    const childStart = i.oldFromLine - i.oldStartLine
    const oldTailLines = i.docLines - i.oldToLine
    const removeEnd = i.childCount - oldTailLines
    return { childStart, removeEnd }
}

describe('planLinePatch — 变更行区间 → 视口相对删除子节点区间', () => {
    // L1 A0/B0:全文视口(startLine=1, oldEndLine==docLines),单行原地变更。退化回归守卫。
    it('L1 A0/B0 全文视口单行变更:childStart=oldFromLine-1, childEnd=oldToLine', () => {
        const p = planLinePatch({ oldStartLine: 1, oldEndLine: 5, childCount: 5, oldFromLine: 3, oldToLine: 3 })
        expect(p).toEqual({ intersects: true, childStart: 2, childEnd: 3 })
        // 老版在全文视口下恰好正确(bug 不显形)——这正是测试没抓到 bug 的原因。
        const b = planLinePatchBuggy({ oldStartLine: 1, childCount: 5, oldFromLine: 3, oldToLine: 3, docLines: 5 })
        expect(b).toEqual({ childStart: 2, removeEnd: 3 })
    })

    // A0/B0 回车拆行(浏览器已把 1 行拆成 2 行,childCount 变 6):删 [2,3) 一个旧行,插 2 个新行。
    it('L1b A+1/B0 全文视口回车(浏览器已拆行,childCount+1):childEnd 挖掉变更行', () => {
        // 编辑前 5 行,第 3 行末回车;浏览器把第 3 行 div 拆成 2 → childCount=6。稳定尾部 = 5-3 = 2。
        const p = planLinePatch({ oldStartLine: 1, oldEndLine: 5, childCount: 6, oldFromLine: 3, oldToLine: 3 })
        expect(p).toEqual({ intersects: true, childStart: 2, childEnd: 4 }) // 删 [2,4)=旧第3行拆出的2个脏div
    })

    // L2 A0/B1:滚动视口内单行变更。childStart/childEnd 都视口相对。
    it('L2 A0/B1 滚动视口单行变更:视口相对区间', () => {
        // 视口 startLine=20 渲染 30 行(20..49);变更第 25 行,无行数变化。
        const p = planLinePatch({ oldStartLine: 20, oldEndLine: 49, childCount: 30, oldFromLine: 25, oldToLine: 25 })
        expect(p).toEqual({ intersects: true, childStart: 5, childEnd: 6 })
    })

    // L3 A+1/B1:主 bug 场景。大文档、视口只渲染一小片,视口内插一行(回车,浏览器已拆)。
    it('L3 A+1/B1 大文档视口内回车:childEnd 非负且钳在视口内(老版给负 removeEnd)', () => {
        // 真页实况:doc 469 行,视口 startLine=1 渲染 61 行(1..61),第 10 行回车,浏览器拆 → childCount=62。
        const p = planLinePatch({ oldStartLine: 1, oldEndLine: 61, childCount: 62, oldFromLine: 10, oldToLine: 10 })
        expect(p.intersects).toBe(true)
        expect(p.childStart).toBe(9)
        expect(p.childEnd).toBe(11) // 稳定尾部 = 61-10 = 51;childEnd = 62-51 = 11(删旧第10行拆出的2个 div)
        expect(p.childEnd).toBeGreaterThanOrEqual(0)
        // 老版:removeEnd = 62 - (469-10) = -397,负数 → 删除循环不跑 → 脏行残留。
        const b = planLinePatchBuggy({ oldStartLine: 1, childCount: 62, oldFromLine: 10, oldToLine: 10, docLines: 469 })
        expect(b.removeEnd).toBeLessThan(0)
    })

    // L4 A+N/B1:视口内多行粘贴,末行仍在视口内(浏览器把 1 行拆成 N+1 行)。
    it('L4 A+N/B1 视口内多行粘贴:childEnd 钳视口尾', () => {
        // doc 200 行,视口 startLine=5 渲染 40 行(5..44);第 10 行粘贴 3 行 → 浏览器 1 行变 3 行,childCount=42。
        const p = planLinePatch({ oldStartLine: 5, oldEndLine: 44, childCount: 42, oldFromLine: 10, oldToLine: 10 })
        expect(p).toEqual({ intersects: true, childStart: 5, childEnd: 8 }) // 稳定尾部 34;childEnd=42-34=8
        const b = planLinePatchBuggy({ oldStartLine: 5, childCount: 42, oldFromLine: 10, oldToLine: 10, docLines: 200 })
        expect(b.removeEnd).toBeLessThan(0)
    })

    // L5 A-1/B1:行首退格合并(删一行),浏览器把 2 行并成 1 行,childCount-1。
    it('L5 A-1/B1 视口内合并行:childEnd 覆盖旧两行并出的单 div', () => {
        // doc 300 行,视口 startLine=50 渲染 40 行(50..89);第 61 行首退格并入 60 行,变更覆盖 60..61,childCount=39。
        const p = planLinePatch({ oldStartLine: 50, oldEndLine: 89, childCount: 39, oldFromLine: 60, oldToLine: 61 })
        expect(p).toEqual({ intersects: true, childStart: 10, childEnd: 11 }) // 稳定尾部 89-61=28;childEnd=39-28=11
    })

    // L7 A?/B2:变更完全在视口上方 → 不相交,不碰 children。
    it('L7 B2 变更在视口上方:intersects=false', () => {
        const p = planLinePatch({ oldStartLine: 100, oldEndLine: 139, childCount: 40, oldFromLine: 10, oldToLine: 12 })
        expect(p.intersects).toBe(false)
    })

    // L8 A?/B3:变更完全在视口下方 → 不相交。
    it('L8 B3 变更在视口下方:intersects=false', () => {
        const p = planLinePatch({ oldStartLine: 1, oldEndLine: 40, childCount: 40, oldFromLine: 100, oldToLine: 102 })
        expect(p.intersects).toBe(false)
    })

    // L9 A+1/B4:变更跨越视口顶(起点在视口上方,终点入视口)。childStart 钳到 0。
    it('L9 B4 变更跨视口顶:intersects=true, childStart 钳到 0', () => {
        // 视口 startLine=20 渲染 30 行(20..49);变更第 18..22 行(跨顶),无行数变化 childCount=30。
        const p = planLinePatch({ oldStartLine: 20, oldEndLine: 49, childCount: 30, oldFromLine: 18, oldToLine: 22 })
        expect(p.intersects).toBe(true)
        expect(p.childStart).toBe(0) // renderFromLine 钳到 20 → 0
        expect(p.childEnd).toBe(3) // 稳定尾部 49-22=27;childEnd=30-27=3
    })

    // L10 A/B5:变更跨越视口底(起点入视口,终点在视口下方)。childEnd 钳到 childCount。
    it('L10 B5 变更跨视口底:intersects=true, childEnd 钳到 childCount', () => {
        // 视口 startLine=20 渲染 30 行(20..49);变更第 47..60 行(跨底),childCount=30。
        const p = planLinePatch({ oldStartLine: 20, oldEndLine: 49, childCount: 30, oldFromLine: 47, oldToLine: 60 })
        expect(p.intersects).toBe(true)
        expect(p.childStart).toBe(27) // 47-20
        expect(p.childEnd).toBe(30) // renderToLine 钳到 49;稳定尾部 49-49=0;childEnd=30-0=30 == childCount
    })

    // L11 A+1 ×3 连续/B1:模拟连按 3 次回车(3 个独立事务),每次 childEnd 恒非负。
    // 「随便回车都出 bug」的实况:每次 patchDOM 独立算,老版每次都给负 removeEnd。
    it('L11 连续 3 次视口内回车:每次 childEnd 恒非负,老版每次负', () => {
        // 大文档,视口 startLine=1;三次分别在第 10、11、12 行(空行累积后光标下移),浏览器每次拆 1→2。
        for (const { docLines, oldEndLine, childCountAfter, line } of [
            { docLines: 469, oldEndLine: 61, childCountAfter: 62, line: 10 },
            { docLines: 470, oldEndLine: 62, childCountAfter: 63, line: 11 },
            { docLines: 471, oldEndLine: 63, childCountAfter: 64, line: 12 },
        ]) {
            const p = planLinePatch({ oldStartLine: 1, oldEndLine, childCount: childCountAfter, oldFromLine: line, oldToLine: line })
            expect(p.intersects).toBe(true)
            expect(p.childEnd).toBeGreaterThanOrEqual(0)
            const b = planLinePatchBuggy({ oldStartLine: 1, childCount: childCountAfter, oldFromLine: line, oldToLine: line, docLines })
            expect(b.removeEnd).toBeLessThan(0)
        }
    })
})

describe('planViewportShift — 滚动换窗复用重叠行', () => {
    it('下滚 10 行：丢头 10、补尾 10', () => {
        expect(planViewportShift(100, 50, 110, 50)).toEqual({
            full: false, dropHead: 10, dropTail: 0,
            prependFrom: 110, prependTo: 110, appendFrom: 150, appendTo: 160,
        })
    })

    it('上滚 10 行：补头 10、丢尾 10', () => {
        expect(planViewportShift(100, 50, 90, 50)).toEqual({
            full: false, dropHead: 0, dropTail: 10,
            prependFrom: 90, prependTo: 100, appendFrom: 140, appendTo: 140,
        })
    })

    it('无重叠 → full', () => {
        expect(planViewportShift(100, 50, 200, 50).full).toBe(true)
    })

    it('完全相同 → 零操作', () => {
        expect(planViewportShift(100, 50, 100, 50)).toEqual({
            full: false, dropHead: 0, dropTail: 0,
            prependFrom: 100, prependTo: 100, appendFrom: 150, appendTo: 150,
        })
    })

    it('窗变长：只补尾', () => {
        expect(planViewportShift(100, 50, 100, 60)).toEqual({
            full: false, dropHead: 0, dropTail: 0,
            prependFrom: 100, prependTo: 100, appendFrom: 150, appendTo: 160,
        })
    })

    it('空窗 → full', () => {
        expect(planViewportShift(100, 0, 100, 50).full).toBe(true)
    })
})
