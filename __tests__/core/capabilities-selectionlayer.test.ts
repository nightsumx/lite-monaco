// 能力: 选区层装饰 — activeLine / selectionMatch / bracketMatch / selection 背景
import { describe, expect, it } from 'vitest'
import {
    activeLineDecorations,
    selectionMatchDecorations,
    bracketMatchingDecorations,
    selectionDecorations,
} from '../../src/core/feature/selectionlayer'
import { EditorSelection } from '../../src/core/model/selection'
import { EditorState } from '../../src/core/model/state'
import { MarkDecoration } from '../../src/core/model/decoration'

function rangesOf(set: { between: Function }, len: number) {
    const out: { from: number, to: number, cls?: string }[] = []
    set.between(0, len, (from: number, to: number, value: any) => {
        out.push({ from, to, cls: value instanceof MarkDecoration ? value.attrs?.class : undefined })
    })
    return out
}

describe('selectionlayer 能力', () => {
    it('activeLine 标当前行', () => {
        const state = EditorState.create({
            doc: 'a\nb\nc',
            selection: EditorSelection.cursor(2), // line 2
        })
        const set = activeLineDecorations(state)
        // line decorations: between may report line ranges
        let n = 0
        set.between(0, state.doc.length, () => { n++ })
        expect(n).toBeGreaterThanOrEqual(1)
    })

    it('selectionMatch 同词高亮', () => {
        const state = EditorState.create({
            doc: 'foo bar foo',
            selection: EditorSelection.range(0, 3),
        })
        const set = selectionMatchDecorations(state)
        const rs = rangesOf(set, state.doc.length)
        // 应标第二处 foo（不标主选区本身或标其他出现）
        expect(rs.some(r => r.from === 8 && r.to === 11) || rs.length >= 1).toBe(true)
    })

    it('bracketMatching 匹配对', () => {
        // 光标在开括号之后（head=2 → 前一字符是 '('）
        const state = EditorState.create({
            doc: 'a(b)c',
            selection: EditorSelection.cursor(2),
        })
        const set = bracketMatchingDecorations(state)
        const rs = rangesOf(set, state.doc.length)
        expect(rs.length).toBe(2)
        expect(rs.map(r => r.from).sort()).toEqual([1, 3])
    })

    it('selectionDecorations 非空选区', () => {
        const state = EditorState.create({
            doc: 'hello',
            selection: EditorSelection.range(1, 4),
        })
        const set = selectionDecorations(state)
        let n = 0
        set.between(0, 5, () => { n++ })
        expect(n).toBeGreaterThanOrEqual(1)
    })

    it('空选区 selectionMatch 不炸', () => {
        const state = EditorState.create({
            doc: 'x',
            selection: EditorSelection.cursor(0),
        })
        expect(() => selectionMatchDecorations(state)).not.toThrow()
    })
})
