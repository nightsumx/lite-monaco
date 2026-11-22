// H3:Position / Range / Selection 对拍 Monaco 真实现(node_modules/monaco-editor/esm/vs/editor/common/core/{position,range,selection}.js)。
// 每个静态 / 实例方法都在随机输入上跟 Monaco 比;结果统一成可比较的 JSON(Position/Range/Selection → 字段对象)。
import { describe, expect, it } from 'vitest'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { Position, Range, Selection, SelectionDirection } from '../../src/api/position'

const CORE = path.resolve(__dirname, '../../node_modules/monaco-editor/esm/vs/editor/common/core')
const load = (f: string) => import(/* @vite-ignore */ pathToFileURL(path.join(CORE, f)).href)

// 种子随机数,失败可复现
function rng(seed: number) {
    let s = seed >>> 0
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000 }
}

describe('H3 Position / Range / Selection 对拍 Monaco', async () => {
    const [mp, mr, ms] = await Promise.all([load('position.js'), load('range.js'), load('selection.js')])
    const MP = mp.Position, MR = mr.Range, MS = ms.Selection

    // 鸭子类型:Monaco 的 range.js 内部引的 position.js 和这里动态 import 的不一定是同一份模块实例
    const norm = (v: unknown): unknown => {
        if (Array.isArray(v)) return v.map(norm)
        if (v && typeof v === 'object') {
            const o = v as Record<string, number>
            if ('selectionStartLineNumber' in o) return { sel: [o.selectionStartLineNumber, o.selectionStartColumn, o.positionLineNumber, o.positionColumn] }
            if ('startLineNumber' in o) return { r: [o.startLineNumber, o.startColumn, o.endLineNumber, o.endColumn] }
            if ('lineNumber' in o && 'column' in o) return { p: [o.lineNumber, o.column] }
        }
        return v
    }
    const R = rng(12345)
    const n = (max: number) => 1 + Math.floor(R() * max)
    const pos = (): [number, number] => [n(5), n(6)]
    const rangeArgs = (): [number, number, number, number] => [n(5), n(6), n(5), n(6)]

    it('Position:构造与全部方法(600 组)', () => {
        for (let i = 0; i < 600; i++) {
            const [l1, c1] = pos(), [l2, c2] = pos()
            const a = new Position(l1, c1), b = new Position(l2, c2)
            const ma = new MP(l1, c1), mb = new MP(l2, c2)
            expect(norm(a.with(l2, c2))).toEqual(norm(ma.with(l2, c2)))
            expect(norm(a.with(undefined, c2))).toEqual(norm(ma.with(undefined, c2)))
            expect(norm(a.delta(l2 - 3, c2 - 3))).toEqual(norm(ma.delta(l2 - 3, c2 - 3)))
            expect(a.equals(b)).toBe(ma.equals(mb))
            expect(Position.equals(a, b)).toBe(MP.equals(ma, mb))
            expect(Position.equals(null, a)).toBe(MP.equals(null, ma))
            expect(a.isBefore(b)).toBe(ma.isBefore(mb))
            expect(Position.isBefore(a, b)).toBe(MP.isBefore(ma, mb))
            expect(a.isBeforeOrEqual(b)).toBe(ma.isBeforeOrEqual(mb))
            expect(Position.isBeforeOrEqual(a, b)).toBe(MP.isBeforeOrEqual(ma, mb))
            expect(Position.compare(a, b)).toBe(MP.compare(ma, mb))
            expect(norm(a.clone())).toEqual(norm(ma.clone()))
            expect(a.toString()).toBe(ma.toString())
            expect(norm(Position.lift(b))).toEqual(norm(MP.lift(mb)))
            expect(Position.isIPosition(b)).toBe(MP.isIPosition(mb))
            expect(Position.isIPosition({ lineNumber: 1 })).toBe(MP.isIPosition({ lineNumber: 1 }))
            expect(JSON.stringify(a.toJSON ? a.toJSON() : a)).toBe(JSON.stringify(ma.toJSON ? ma.toJSON() : ma))
        }
    })

    it('Range:构造与全部静态 / 实例方法(800 组)', () => {
        for (let i = 0; i < 800; i++) {
            const A = rangeArgs(), B = rangeArgs()
            const a = new Range(...A), b = new Range(...B)
            const ma = new MR(...A), mb = new MR(...B)
            const [pl, pc] = pos()
            const p = new Position(pl, pc), mpos = new MP(pl, pc)
            expect(norm(a)).toEqual(norm(ma))
            expect(a.isEmpty()).toBe(ma.isEmpty())
            expect(Range.isEmpty(a)).toBe(MR.isEmpty(ma))
            expect(a.containsPosition(p)).toBe(ma.containsPosition(mpos))
            expect(Range.containsPosition(a, p)).toBe(MR.containsPosition(ma, mpos))
            expect(Range.strictContainsPosition(a, p)).toBe(MR.strictContainsPosition(ma, mpos))
            expect(a.strictContainsRange(b)).toBe(ma.strictContainsRange(mb))
            expect(Range.strictContainsRange(a, b)).toBe(MR.strictContainsRange(ma, mb))
            expect(a.containsRange(b)).toBe(ma.containsRange(mb))
            expect(Range.containsRange(a, b)).toBe(MR.containsRange(ma, mb))
            expect(norm(a.plusRange(b))).toEqual(norm(ma.plusRange(mb)))
            expect(norm(Range.plusRange(a, b))).toEqual(norm(MR.plusRange(ma, mb)))
            expect(norm(a.intersectRanges(b))).toEqual(norm(ma.intersectRanges(mb)))
            expect(norm(Range.intersectRanges(a, b))).toEqual(norm(MR.intersectRanges(ma, mb)))
            expect(a.equalsRange(b)).toBe(ma.equalsRange(mb))
            expect(Range.equalsRange(a, b)).toBe(MR.equalsRange(ma, mb))
            expect(Range.equalsRange(null, b)).toBe(MR.equalsRange(null, mb))
            expect(norm(a.getEndPosition())).toEqual(norm(ma.getEndPosition()))
            expect(norm(a.getStartPosition())).toEqual(norm(ma.getStartPosition()))
            expect(norm(Range.getEndPosition(a))).toEqual(norm(MR.getEndPosition(ma)))
            expect(norm(Range.getStartPosition(a))).toEqual(norm(MR.getStartPosition(ma)))
            expect(a.toString()).toBe(ma.toString())
            expect(norm(a.setEndPosition(pl, pc))).toEqual(norm(ma.setEndPosition(pl, pc)))
            expect(norm(a.setStartPosition(pl, pc))).toEqual(norm(ma.setStartPosition(pl, pc)))
            expect(norm(a.collapseToStart())).toEqual(norm(ma.collapseToStart()))
            expect(norm(a.collapseToEnd())).toEqual(norm(ma.collapseToEnd()))
            expect(norm(Range.collapseToStart(a))).toEqual(norm(MR.collapseToStart(ma)))
            expect(norm(Range.collapseToEnd(a))).toEqual(norm(MR.collapseToEnd(ma)))
            expect(norm(a.delta(pl - 3))).toEqual(norm(ma.delta(pl - 3)))
            expect(norm(Range.fromPositions(p, new Position(B[0], B[1])))).toEqual(norm(MR.fromPositions(mpos, new MP(B[0], B[1]))))
            expect(norm(Range.fromPositions(p))).toEqual(norm(MR.fromPositions(mpos)))
            expect(norm(Range.lift(b))).toEqual(norm(MR.lift(mb)))
            expect(Range.lift(null)).toBe(MR.lift(null))
            expect(Range.isIRange(b)).toBe(MR.isIRange(mb))
            expect(Range.areIntersectingOrTouching(a, b)).toBe(MR.areIntersectingOrTouching(ma, mb))
            expect(Range.areIntersecting(a, b)).toBe(MR.areIntersecting(ma, mb))
            expect(Range.compareRangesUsingStarts(a, b)).toBe(MR.compareRangesUsingStarts(ma, mb))
            expect(Range.compareRangesUsingEnds(a, b)).toBe(MR.compareRangesUsingEnds(ma, mb))
            expect(Range.spansMultipleLines(a)).toBe(MR.spansMultipleLines(ma))
            expect(JSON.stringify(a.toJSON())).toBe(JSON.stringify(ma.toJSON()))
            expect(a.getEndPosition().equals(a.getEndPosition())).toBe(true)
        }
    })

    it('Selection:构造 / 方向 / 静态方法(800 组)', () => {
        for (let i = 0; i < 800; i++) {
            const A = rangeArgs(), B = rangeArgs()
            const a = new Selection(...A), b = new Selection(...B)
            const ma = new MS(...A), mb = new MS(...B)
            const [pl, pc] = pos()
            const p = new Position(pl, pc), mpos = new MP(pl, pc)
            expect(norm(a)).toEqual(norm(ma))
            expect(a.getDirection()).toBe(ma.getDirection())
            expect(a.toString()).toBe(ma.toString())
            expect(a.equalsSelection(b)).toBe(ma.equalsSelection(mb))
            expect(Selection.selectionsEqual(a, b)).toBe(MS.selectionsEqual(ma, mb))
            expect(Selection.selectionsArrEqual([a, b], [b, a])).toBe(MS.selectionsArrEqual([ma, mb], [mb, ma]))
            expect(Selection.selectionsArrEqual([a, b], [a, b])).toBe(MS.selectionsArrEqual([ma, mb], [ma, mb]))
            expect(norm(a.getPosition())).toEqual(norm(ma.getPosition()))
            expect(norm(a.getSelectionStart())).toEqual(norm(ma.getSelectionStart()))
            expect(norm(a.setStartPosition(pl, pc))).toEqual(norm(ma.setStartPosition(pl, pc)))
            expect(norm(a.setEndPosition(pl, pc))).toEqual(norm(ma.setEndPosition(pl, pc)))
            expect(norm(Selection.fromPositions(p, new Position(B[0], B[1])))).toEqual(norm(MS.fromPositions(mpos, new MP(B[0], B[1]))))
            expect(norm(Selection.fromPositions(p))).toEqual(norm(MS.fromPositions(mpos)))
            expect(norm(Selection.fromRange(new Range(...B), SelectionDirection.LTR))).toEqual(norm(MS.fromRange(new MR(...B), 0)))
            expect(norm(Selection.fromRange(new Range(...B), SelectionDirection.RTL))).toEqual(norm(MS.fromRange(new MR(...B), 1)))
            expect(norm(Selection.liftSelection(b))).toEqual(norm(MS.liftSelection(mb)))
            expect(Selection.isISelection(b)).toBe(MS.isISelection(mb))
            expect(Selection.isISelection({ a: 1 })).toBe(MS.isISelection({ a: 1 }))
            expect(norm(Selection.createWithDirection(...A, SelectionDirection.RTL))).toEqual(norm(MS.createWithDirection(...A, 1)))
            expect(norm(Selection.createWithDirection(...A, SelectionDirection.LTR))).toEqual(norm(MS.createWithDirection(...A, 0)))
            expect(norm(a.collapseToStart())).toEqual(norm(ma.collapseToStart()))
            expect(norm(a.collapseToEnd())).toEqual(norm(ma.collapseToEnd()))
            expect(norm(a.plusRange(new Range(...B)))).toEqual(norm(ma.plusRange(new MR(...B))))
        }
    })
})

describe('H3 Position / Range / Selection 成员齐全', () => {
    it('实例方法与静态方法名与 Monaco 一致', async () => {
        const [mp, mr, ms] = await Promise.all([load('position.js'), load('range.js'), load('selection.js')])
        const names = (o: object) => Object.getOwnPropertyNames(o).filter(k => !['length', 'name', 'prototype', 'constructor'].includes(k)).sort()
        for (const [mine, theirs] of [[Position, mp.Position], [Range, mr.Range], [Selection, ms.Selection]] as const) {
            expect(names(mine.prototype)).toEqual(names(theirs.prototype))
            expect(names(mine)).toEqual(names(theirs))
        }
    })
})
