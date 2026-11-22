import { describe, expect, it } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'
import { concatToTemplate, convertConcatToTemplate, templateToConcat, convertTemplateToConcat } from '../../src/core/feature/concat'

describe('concatToTemplate', () => {
    it('"a" + x + "b" 收成模板', () => {
        const text = '"a" + x + "b"'
        const hit = concatToTemplate(text, 5)
        expect(hit).not.toBeNull()
        expect(text.slice(0, hit!.from) + hit!.insert + text.slice(hit!.to)).toBe('`a${x}b`')
        expect(concatToTemplate('plain', 1)).toBeNull()
    })
})

describe('convertConcatToTemplate', () => {
    it('改文档', () => {
        let state = EditorState.create({
            doc: 'const s = "a" + x + "b"',
            selection: EditorSelection.single(14),
        })
        expect(convertConcatToTemplate({ state, dispatch: tr => { state = tr.apply() } })).toBe(true)
        expect(state.doc.toString()).toBe('const s = `a${x}b`')
        expect(convertConcatToTemplate({ state, dispatch: tr => { state = tr.apply() } })).toBe(false)
    })
})

describe('templateToConcat', () => {
    it('`a${x}b` 拆回拼接，再收成原式', () => {
        const text = '`a${x}b`'
        const hit = templateToConcat(text, 1)
        expect(hit).not.toBeNull()
        const next = text.slice(0, hit!.from) + hit!.insert + text.slice(hit!.to)
        expect(next).toBe('"a" + x + "b"')
        const back = concatToTemplate(next, 5)
        expect(back).not.toBeNull()
        expect(next.slice(0, back!.from) + back!.insert + next.slice(back!.to)).toBe('`a${x}b`')
        expect(templateToConcat('plain', 1)).toBeNull()
    })
})

describe('convertTemplateToConcat', () => {
    it('改文档', () => {
        let state = EditorState.create({
            doc: 'const s = `a${x}b`',
            selection: EditorSelection.single(12),
        })
        expect(convertTemplateToConcat({ state, dispatch: tr => { state = tr.apply() } })).toBe(true)
        expect(state.doc.toString()).toBe('const s = "a" + x + "b"')
        expect(convertTemplateToConcat({ state, dispatch: tr => { state = tr.apply() } })).toBe(false)
    })
})
