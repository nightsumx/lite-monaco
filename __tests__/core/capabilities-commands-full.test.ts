// 能力表命令全集契约: 每个公开编辑命令至少钉死「doc+选区」终态
import { describe, expect, it } from 'vitest'
import {
    addCursorAbove, addCursorBelow,
    blockComment, blockUncomment, toggleBlockComment, toggleComment, commentTokens,
    copyLineDown, copyLineUp,
    cursorCharBackward, cursorCharForward, cursorCharLeft, cursorCharRight,
    cursorDocEnd, cursorDocStart,
    cursorGroupForward,
    cursorLineBoundaryBackward, cursorLineBoundaryForward,
    cursorLineDown, cursorLineEnd, cursorLineStart, cursorLineUp,
    cursorMatchingBracket,
    cursorPageDown, cursorPageUp,
    cursorSubwordBackward, cursorSubwordForward,
    cursorWordEndRight, cursorWordLeft,
    deleteCharBackward, deleteCharBackwardStrict, deleteCharForward,
    deleteGroupBackward, deleteGroupForward,
    deleteLine, deleteLineContentOrJoin,
    deleteToLineEnd, deleteToLineStart, deleteTrailingWhitespace,
    indentLess, indentMore, indentSelection, insertTab,
    insertBlankLine, insertLineAfter, insertLineBefore,
    insertNewline, insertNewlineAndIndent, insertNewlineKeepIndent,
    moveLineDown, moveLineUp,
    selectAll, selectAllOccurrences, selectCharForward,
    selectDocEnd, selectGroupForward,
    selectLine, selectLineDown,
    selectMatchingBracket, selectNextOccurrence,
    selectSubwordForward,
    simplifySelection, splitLine, transposeChars,
    toggleLineComment, wordAt,
} from '../../src/core/edit/commands'
import { foldAll, unfoldAll, foldCode, unfoldCode, toggleFold, foldField, foldable } from '../../src/core/edit/fold'
import { EditorSelection } from '../../src/core/model/selection'
import { EditorState, type Extension, type Transaction } from '../../src/core/model/state'
import { history, undo, redo, isolateHistory } from '../../src/core/edit/history'

function mk(doc: string, sel: number | { anchor: number, head?: number } | EditorSelection, ext: Extension[] = []) {
    const selection = typeof sel === 'number'
        ? EditorSelection.cursor(sel)
        : sel instanceof EditorSelection
            ? sel
            : EditorSelection.single(sel.anchor, sel.head ?? sel.anchor)
    let state = EditorState.create({
        doc,
        selection,
        extensions: [EditorState.allowMultipleSelections.of(true), EditorState.tabSize.of(4), ...ext],
    })
    const dispatch = (tr: Transaction) => { state = state.applyTransaction(tr) }
    return {
        get state() { return state },
        dispatch,
        run(cmd: (t: { state: EditorState, dispatch: (tr: Transaction) => void }) => boolean) {
            return cmd({ state, dispatch })
        },
    }
}

describe('光标导航', () => {
    it('char forward/backward + 别名 left/right', () => {
        const e = mk('ab', 1)
        expect(e.run(cursorCharForward)).toBe(true)
        expect(e.state.selection.main.head).toBe(2)
        expect(e.run(cursorCharBackward)).toBe(true)
        expect(e.state.selection.main.head).toBe(1)
        e.run(cursorCharLeft)
        expect(e.state.selection.main.head).toBe(0)
        e.run(cursorCharRight)
        expect(e.state.selection.main.head).toBe(1)
    })

    it('line start/end/boundary smart home', () => {
        const e = mk('  hi', 4)
        e.run(cursorLineBoundaryBackward) // smart → indent
        expect(e.state.selection.main.head).toBe(2)
        e.run(cursorLineBoundaryBackward) // → 0
        expect(e.state.selection.main.head).toBe(0)
        e.run(cursorLineEnd)
        expect(e.state.selection.main.head).toBe(4)
        e.run(cursorLineStart)
        expect(e.state.selection.main.head).toBe(0)
        e.run(cursorLineBoundaryForward)
        expect(e.state.selection.main.head).toBe(4)
    })

    it('line up/down 保 goalColumn', () => {
        const e = mk('abcd\nxy\nzzzz', 3)
        e.run(cursorLineDown)
        expect(e.state.selection.main.head).toBe(5 + 2) // line2 from=5, min(3,2)=2 → 7
        e.run(cursorLineUp)
        expect(e.state.selection.main.head).toBe(3)
    })

    it('doc start/end + page', () => {
        const e = mk('a\nb\nc\nd', 3)
        e.run(cursorDocStart)
        expect(e.state.selection.main.head).toBe(0)
        e.run(cursorDocEnd)
        expect(e.state.selection.main.head).toBe(e.state.doc.length)
        e.run(cursorPageUp)
        e.run(cursorPageDown)
    })

    it('word / group / subword', () => {
        const e = mk('foo bar', 0)
        e.run(cursorWordEndRight)
        expect(e.state.selection.main.head).toBe(3)
        e.run(cursorWordEndRight)
        expect(e.state.selection.main.head).toBe(7)
        const e2 = mk('foo bar', 0)
        e2.run(cursorGroupForward)
        expect(e2.state.selection.main.head).toBeGreaterThan(0)
        const e3 = mk('fooBarBaz', 3)
        e3.run(cursorSubwordForward)
        expect(e3.state.selection.main.head).toBeGreaterThan(3)
        e3.run(cursorSubwordBackward)
        expect(e3.state.selection.main.head).toBeLessThanOrEqual(6)
        e3.run(cursorWordLeft)
    })

    it('matching bracket cursor + select', () => {
        const e = mk('a(b)c', 1)
        expect(e.run(cursorMatchingBracket)).toBe(true)
        expect(e.state.selection.main.head).toBe(3) // Monaco jumpToBracket:落在配对闭括号之前
        const e2 = mk('a(b)c', 1)
        expect(e2.run(selectMatchingBracket)).toBe(true)
        expect(e2.state.selection.main.from).toBe(1)
        expect(e2.state.selection.main.to).toBe(4)
    })
})

describe('扩选', () => {
    it('select char/line/doc/group/subword', () => {
        const e = mk('hello', 2)
        e.run(selectCharForward)
        expect(e.state.selection.main.from).toBe(2)
        expect(e.state.selection.main.to).toBe(3)
        const e2 = mk('ab\ncd', 0)
        e2.run(selectLineDown)
        expect(e2.state.selection.main.to).toBeGreaterThan(0)
        e2.run(selectDocEnd)
        expect(e2.state.selection.main.head).toBe(e2.state.doc.length)
        const e3 = mk('fooBar', 0)
        e3.run(selectSubwordForward)
        expect(e3.state.selection.main.to).toBe(3)
        e3.run(selectGroupForward)
    })

    it('selectAll / selectLine / simplify', () => {
        const e = mk('ab\ncd', 0)
        e.run(selectAll)
        expect(e.state.selection.main.from).toBe(0)
        expect(e.state.selection.main.to).toBe(5)
        const e2 = mk('hello', 2)
        e2.run(selectLine)
        expect(e2.state.selection.main.from).toBe(0)
        const e3 = mk('ab', EditorSelection.create([
            EditorSelection.cursor(0), EditorSelection.cursor(1),
        ]))
        e3.run(simplifySelection)
        expect(e3.state.selection.ranges.length).toBe(1)
    })
})

describe('删除', () => {
    it('char / strict / group / line ends', () => {
        const e = mk('hello', 5)
        e.run(deleteCharBackward)
        expect(e.state.doc.toString()).toBe('hell')
        const e2 = mk('    x', 4)
        e2.run(deleteCharBackwardStrict) // 不吃 tab stop 整块
        expect(e2.state.doc.toString().length).toBe(4)
        const e3 = mk('foo bar', 7)
        e3.run(deleteGroupBackward)
        expect(e3.state.doc.toString()).toBe('foo ')
        const e4 = mk('hello world', 5)
        e4.run(deleteToLineEnd)
        expect(e4.state.doc.toString()).toBe('hello')
        e4.run(deleteToLineStart)
        expect(e4.state.doc.toString()).toBe('')
    })

    it('deleteLine / contentOrJoin / trailing ws', () => {
        const e = mk('a\nb\nc', 2)
        e.run(deleteLine)
        expect(e.state.doc.toString()).toBe('a\nc')
        const e2 = mk('hello  \n', 0)
        e2.run(deleteTrailingWhitespace)
        expect(e2.state.doc.toString()).toBe('hello\n')
        const e3 = mk('ab\ncd', 2)
        e3.run(deleteLineContentOrJoin)
    })

    it('deleteCharForward / groupForward', () => {
        const e = mk('hello', 0)
        e.run(deleteCharForward)
        expect(e.state.doc.toString()).toBe('ello')
        const e2 = mk('foo bar', 0)
        e2.run(deleteGroupForward)
        expect(e2.state.doc.toString().startsWith(' ')).toBe(true)
    })
})

describe('插入/缩进/行操作', () => {
    it('newline 族', () => {
        const e = mk('  hi', 4)
        e.run(insertNewline)
        expect(e.state.doc.toString()).toContain('\n')
        const e2 = mk('  hi', 4)
        e2.run(insertNewlineKeepIndent)
        expect(e2.state.doc.toString()).toBe('  hi\n  ')
        const e3 = mk('{x}', 1)
        e3.run(insertNewlineAndIndent)
        expect(e3.state.doc.toString()).toContain('\n')
        const e4 = mk('  hi', 4)
        e4.run(insertBlankLine)
        expect(e4.state.doc.toString().split('\n').length).toBeGreaterThan(2)
    })

    it('insert line after/before + tab/indent', () => {
        const e = mk('a\nb', 0)
        e.run(insertLineAfter)
        expect(e.state.doc.toString().startsWith('a\n')).toBe(true)
        const e2 = mk('a\nb', 2)
        e2.run(insertLineBefore)
        const e3 = mk('x', 0)
        e3.run(insertTab)
        expect(e3.state.doc.toString()).toBe('    x')
        e3.run(indentMore)
        e3.run(indentLess)
        const e4 = mk('ab', { anchor: 0, head: 2 })
        expect(e4.run(indentSelection)).toBe(true)
    })

    it('move/copy line + transpose + split', () => {
        const e = mk('a\nb\nc', 0)
        e.run(moveLineDown)
        expect(e.state.doc.toString()).toBe('b\na\nc')
        e.run(moveLineUp)
        const e2 = mk('a\nb', 0)
        e2.run(copyLineDown)
        expect(e2.state.doc.toString()).toContain('a\na\n')
        e2.run(copyLineUp)
        const e3 = mk('ab', 1)
        e3.run(transposeChars)
        expect(e3.state.doc.toString()).toBe('ba')
        const e4 = mk('ab', 1)
        e4.run(splitLine)
        expect(e4.state.doc.toString()).toBe('a\nb')
    })
})

describe('多光标/出现', () => {
    it('addCursor above/below', () => {
        const e = mk('aaa\nbbb\nccc', 5)
        expect(e.run(addCursorBelow)).toBe(true)
        expect(e.state.selection.ranges.length).toBe(2)
        const e2 = mk('aaa\nbbb\nccc', 5)
        expect(e2.run(addCursorAbove)).toBe(true)
        expect(e2.state.selection.ranges.length).toBe(2)
    })

    it('selectNextOccurrence / selectAllOccurrences / wordAt', () => {
        const e = mk('foo bar foo', 1)
        e.run(selectNextOccurrence)
        expect(e.state.selection.main.from).toBe(0)
        e.run(selectNextOccurrence)
        expect(e.state.selection.ranges.length).toBe(2)
        const e2 = mk('foo bar foo', 1)
        e2.run(selectAllOccurrences)
        expect(e2.state.selection.ranges.length).toBe(2)
        expect(wordAt(e2.state, 1)).toEqual({ from: 0, to: 3 })
    })
})

describe('注释', () => {
    it('line comment toggle', () => {
        const e = mk('hello', 0)
        const cmd = toggleLineComment('//')
        e.run(cmd)
        expect(e.state.doc.toString()).toBe('// hello')
        e.run(cmd)
        expect(e.state.doc.toString()).toBe('hello')
    })

    it('block comment toggle + comment/uncomment', () => {
        const ext = [commentTokens.of({ line: '//', block: { open: '/*', close: '*/' } })]
        const e = mk('hello', { anchor: 0, head: 5 }, ext)
        expect(e.run(toggleBlockComment)).toBe(true)
        expect(e.state.doc.toString()).toBe('/* hello */')
        const e2 = mk(e.state.doc.toString(), { anchor: 0, head: e.state.doc.length }, ext)
        expect(e2.run(toggleBlockComment)).toBe(true)
        expect(e2.state.doc.toString()).toBe('hello')
        const e3 = mk('xy', { anchor: 0, head: 2 }, ext)
        e3.run(blockComment)
        expect(e3.state.doc.toString()).toContain('/*')
        e3.run(blockUncomment)
    })

    it('toggleComment 优先行注释', () => {
        const e = mk('x', 0, [commentTokens.of({ line: '//', block: { open: '/*', close: '*/' } })])
        e.run(toggleComment)
        expect(e.state.doc.toString()).toMatch(/\/\//)
    })
})

describe('折叠', () => {
    it('foldCode / unfold / toggle / all', () => {
        const doc = 'function f() {\n  a\n  b\n}\n'
        const e = mk(doc, 0, [foldField])
        expect(foldable(e.state, 0)).not.toBeNull()
        expect(e.run(foldCode)).toBe(true)
        expect(e.state.field(foldField).size).toBe(1)
        expect(e.run(unfoldCode)).toBe(true)
        e.run(foldCode)
        e.run(toggleFold)
        e.run(foldAll)
        expect(e.state.field(foldField).size).toBeGreaterThan(0)
        e.run(unfoldAll)
        expect(e.state.field(foldField).size).toBe(0)
    })
})

describe('历史', () => {
    it('undo/redo + isolateHistory', () => {
        const e = mk('a', 1, [history()])
        e.dispatch(e.state.update({ changes: { from: 1, insert: 'b' }, userEvent: 'input.type' }))
        expect(e.state.doc.toString()).toBe('ab')
        undo(e)
        expect(e.state.doc.toString()).toBe('a')
        redo(e)
        expect(e.state.doc.toString()).toBe('ab')
        e.dispatch(e.state.update({
            changes: { from: 2, insert: 'c' },
            annotations: isolateHistory.of('full'),
            userEvent: 'input.type',
        }))
        undo(e)
        expect(e.state.doc.toString()).toBe('ab')
    })
})

describe('readOnly 拒编', () => {
    it('readOnly 时插入/删除失败', () => {
        const e = mk('hi', 2, [EditorState.readOnly.of(true)])
        expect(e.run(insertNewline)).toBe(false)
        expect(e.run(deleteCharBackward)).toBe(false)
        expect(e.run(indentMore)).toBe(false)
    })
})
