import { describe, expect, it } from 'vitest'
import { EditorState, type Transaction } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'
import { editorOptions } from '../../src/core/options'
import { deleteCharForward } from '../../src/core/edit/commands'

// trimWhitespaceOnDelete(默认 false):Monaco cursorDeleteOperations.getDeleteRightRange ——
// 行尾 Delete 并行时,本行和下一行都有内容 → 顺带删下一行的前导空白
function del(doc: string, at: number, opts: Record<string, unknown> = {}) {
    let state = EditorState.create({ doc, selection: EditorSelection.cursor(at), extensions: [editorOptions.of(opts as never)] })
    deleteCharForward({ state, dispatch: (tr: Transaction) => { state = tr.apply() } })
    return { text: state.doc.toString(), head: state.selection.main.head }
}

describe('trimWhitespaceOnDelete', () => {
    it('默认 false:只删换行,下一行缩进保留', () => {
        expect(del('foo\n    bar', 3)).toEqual({ text: 'foo    bar', head: 3 })
    })
    it('true:行尾 Delete 连下一行前导空白(含 Tab)一起删', () => {
        expect(del('foo\n    bar', 3, { trimWhitespaceOnDelete: true })).toEqual({ text: 'foobar', head: 3 })
        expect(del('foo\n\t \tbar', 3, { trimWhitespaceOnDelete: true })).toEqual({ text: 'foobar', head: 3 })
    })
    it('true:本行纯空白(无内容)不 trim', () => {
        expect(del('   \n    bar', 3, { trimWhitespaceOnDelete: true })).toEqual({ text: '       bar', head: 3 })
    })
    it('true:下一行纯空白 / 空行不 trim,只删换行', () => {
        expect(del('foo\n   ', 3, { trimWhitespaceOnDelete: true })).toEqual({ text: 'foo   ', head: 3 })
        expect(del('foo\n\nbar', 3, { trimWhitespaceOnDelete: true })).toEqual({ text: 'foo\nbar', head: 3 })
    })
    it('true:光标不在行尾时照常删一个字符', () => {
        expect(del('foo\n    bar', 1, { trimWhitespaceOnDelete: true })).toEqual({ text: 'fo\n    bar', head: 1 })
    })
    it('true:文末 Delete 什么都不删', () => {
        expect(del('foo', 3, { trimWhitespaceOnDelete: true })).toEqual({ text: 'foo', head: 3 })
    })
})
