import { describe, expect, it } from 'vitest'
import { budgetFor, budgetForState, classifyDoc, materializeDoc } from '../../src/core/perf'
import { EditorState } from '../../src/core/model/state'
import { bracketMatchingDecorations } from '../../src/core/feature/selectionlayer'
import { EditorSelection } from '../../src/core/model/selection'

describe('perf budget', () => {
    it('分级 S/M/L/XL', () => {
        expect(classifyDoc(100, 1000)).toBe('S')
        expect(classifyDoc(3000, 10_000)).toBe('M')
        expect(classifyDoc(10_000, 10_000)).toBe('L')
        expect(classifyDoc(25_000, 10_000)).toBe('XL')
    })

    it('按字符阈值也能升档', () => {
        expect(classifyDoc(10, 100_000)).toBe('M')
        expect(classifyDoc(10, 400_000)).toBe('L')
        expect(classifyDoc(10, 1_500_000)).toBe('XL')
    })

    it('L 照样 full 诊断 + 灯泡；budgetForState 跟行数走', () => {
        expect(budgetFor(8_000, 10).diagMode).toBe('full')
        expect(budgetFor(8_000, 10).lightbulbDebounceMs).toBeGreaterThan(0)
        const state = EditorState.create({ doc: 'x\n'.repeat(100) })
        expect(budgetForState(state).docClass).toBe('S')
    })

    it('XL 只语法诊断、关灯泡', () => {
        const b = budgetFor(25_000, 2_000_000)
        expect(b.diagMode).toBe('syntax')
        expect(b.lightbulbDebounceMs).toBe(0)
        expect(b.completionDebounceMs).toBeGreaterThan(100)
    })

    it('materializeDoc 同 state 只 slice 一次', () => {
        const state = EditorState.create({ doc: 'hello\nworld\n'.repeat(100) })
        const a = materializeDoc(state)
        const b = materializeDoc(state)
        expect(a).toBe(b) // 同一字符串引用
        expect(a.length).toBeGreaterThan(100)
    })
})

describe('bracketMatching 有界', () => {
    it('匹配近邻括号', () => {
        const doc = 'foo(bar)'
        const state = EditorState.create({
            doc,
            selection: EditorSelection.cursor(4), // after (
        })
        const set = bracketMatchingDecorations(state)
        let n = 0
        set.between(0, doc.length, () => { n++ })
        expect(n).toBe(2)
    })

    it('大文档不卡', () => {
        const pad = 'x'.repeat(1000) + '\n'
        const doc = pad.repeat(5_000) + 'fn(\n' + pad.repeat(10) + ')\n'
        const openPos = doc.indexOf('(')
        const state = EditorState.create({
            doc,
            selection: EditorSelection.cursor(openPos + 1),
        })
        const t0 = performance.now()
        bracketMatchingDecorations(state)
        expect(performance.now() - t0).toBeLessThan(50)
    })
})
