// getFoldState / setFoldState:Monaco FoldingController.saveViewState / restoreViewState 的 memento
import { describe, it, expect } from 'vitest'
// @ts-expect-error monaco 的 esm 没有类型声明路径
import { hash as monacoHash } from '../../node_modules/monaco-editor/esm/vs/base/common/hash.js'
import { EditorState } from '../../src/core/model/state'
import { foldField, manualFoldField, extraFoldField, setManualFolds, foldEffect } from '../../src/core/edit/fold'
import { getFoldState, setFoldState } from '../../src/core/feature/foldstate'

const block = (k: number) => [`function f${k}() {`, '    a()', '    b()', '}'].join('\n')
const DOC = [block(0), block(1), block(2)].join('\n')
const mk = (doc = DOC) => EditorState.create({ doc, extensions: [foldField, manualFoldField, extraFoldField] })
const apply = (s: EditorState, ...lines: number[]) => s.applyTransaction(s.update({ effects: lines.map(n => foldEffect.of(n)) }))

describe('getFoldState', () => {
    it('没有折叠:collapsedRegions 是 undefined,带 lineCount / provider', () => {
        expect(getFoldState(mk())).toEqual({ collapsedRegions: undefined, lineCount: 12, provider: 'indent', foldedImports: false })
    })
    it('折了第 1、9 行的块:memento 带范围 / source 0 / checksum', () => {
        const vs = getFoldState(apply(mk(), 1, 9))
        expect(vs.collapsedRegions!.map(r => [r.startLineNumber, r.endLineNumber, r.isCollapsed, r.source])).toEqual([[1, 3, true, 0], [9, 11, true, 0]])
        // checksum = stringHash(第 2 行 + 第 3 行内容) % 1000000(Monaco hash.ts 同算法)
        expect(vs.collapsedRegions![0].checksum).toBe(monacoHash('    a()' + '    b()') % 1000000)
    })
    it('手建块不管折没折都存(source 1)', () => {
        const s0 = mk('l1\nl2\nl3\nl4\nl5')
        const d = s0.doc
        const s1 = s0.applyTransaction(s0.update({ effects: setManualFolds.of([{ line: 2, from: d.line(2).to, to: d.line(4).to }]) }))
        const vs = getFoldState(s1)
        expect(vs.collapsedRegions!.map(r => [r.startLineNumber, r.endLineNumber, r.isCollapsed, r.source])).toEqual([[2, 4, false, 1]])
    })
})

describe('setFoldState', () => {
    it('往返:保存再恢复到新状态,折叠的行一致', () => {
        const saved = getFoldState(apply(mk(), 1, 5))
        const fresh = mk()
        const tr = setFoldState(fresh, saved)!
        const restored = fresh.applyTransaction(tr)
        expect([...restored.field(foldField)].sort()).toEqual([1, 5])
        expect(getFoldState(restored).collapsedRegions).toEqual(saved.collapsedRegions)
    })
    it('接受裸数组;空 / undefined / 不是数组 返回 null', () => {
        const saved = getFoldState(apply(mk(), 1))
        expect(setFoldState(mk(), saved.collapsedRegions!)).not.toBeNull()
        expect(setFoldState(mk(), {})).toBeNull()
        expect(setFoldState(mk(), undefined)).toBeNull()
    })
    it('checksum 对不上(内容变了)或范围越界的跳过', () => {
        const saved = getFoldState(apply(mk(), 1))
        const changed = mk(DOC.replace('    a()', '    zzz()'))
        expect(setFoldState(changed, saved)).toBeNull()
        expect(setFoldState(mk(), [{ startLineNumber: 5, endLineNumber: 99, isCollapsed: true }])).toBeNull()
        expect(setFoldState(mk(), [{ startLineNumber: 3, endLineNumber: 3, isCollapsed: true }])).toBeNull()
    })
    it('没有 checksum 就不校验;isCollapsed 缺省当 true;已折的不重复折', () => {
        const s = mk()
        const tr = setFoldState(s, [{ startLineNumber: 1, endLineNumber: 3 }])!
        const folded = s.applyTransaction(tr)
        expect([...folded.field(foldField)]).toEqual([1])
        expect(setFoldState(folded, [{ startLineNumber: 1, endLineNumber: 3 }])).toBeNull()
    })
    it('手建块恢复:放进手建表并折起', () => {
        const s0 = mk('l1\nl2\nl3\nl4\nl5')
        const tr = setFoldState(s0, [{ startLineNumber: 2, endLineNumber: 4, isCollapsed: true, source: 1 }])!
        const s1 = s0.applyTransaction(tr)
        expect(s1.field(manualFoldField).map(r => r.line)).toEqual([2])
        expect([...s1.field(foldField)]).toEqual([2])
    })
})
