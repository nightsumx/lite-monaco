import { describe, expect, it } from 'vitest'
import { EditorSelection } from '../../src/core/model/selection'
import { undo, redo } from '../../src/core/edit/history'
import {
    make, flush, setCaret, setSelection, typeText, deleteText,
    replaceSelection, replaceSelectionCrossLine, pressEnter,
    pressBackspaceLineStart, pasteMultiline, imeCompose,
    expectInvariants,
} from './input-harness'

// 边界 fuzz:把每类输入推到极限,断言 DOM≡doc 逐行双射 + pos 往返恒等。
// 目标:逼出隐藏 bug。红的就是 bug。

describe('边界:空文档', () => {
    it('空文档输入', () => {
        const view = make('')
        setCaret(view, 0)
        typeText(view, 0, 'a')
        expect(view.state.doc.toString()).toBe('a')
        expectInvariants(view)
    })
    it('空文档回车', () => {
        const view = make('')
        setCaret(view, 0)
        pressEnter(view, 0)
        expect(view.state.doc.toString()).toBe('\n')
        expect(view.state.doc.lines).toBe(2)
        expectInvariants(view)
    })
    it('空文档粘贴多行', () => {
        const view = make('')
        setCaret(view, 0)
        pasteMultiline(view, 0, 'a\nb\nc')
        expect(view.state.doc.toString()).toBe('a\nb\nc')
        expectInvariants(view)
    })
})

describe('边界:文档首尾', () => {
    it('文档最开头插入', () => {
        const view = make('abc')
        setCaret(view, 0)
        typeText(view, 0, 'X')
        expect(view.state.doc.toString()).toBe('Xabc')
        expectInvariants(view)
    })
    it('文档最末尾插入', () => {
        const view = make('abc')
        setCaret(view, 3)
        typeText(view, 3, 'X')
        expect(view.state.doc.toString()).toBe('abcX')
        expectInvariants(view)
    })
    it('文档开头回车', () => {
        const view = make('abc')
        setCaret(view, 0)
        pressEnter(view, 0)
        expect(view.state.doc.toString()).toBe('\nabc')
        expectInvariants(view)
    })
    it('删空整个文档', () => {
        const view = make('abc')
        setSelection(view, 0, 3)
        replaceSelection(view, 0, 3, '')
        expect(view.state.doc.toString()).toBe('')
        expectInvariants(view)
    })
})

describe('边界:连续快打', () => {
    it('逐字符打 10 个字', () => {
        const view = make('')
        for (let i = 0; i < 10; i++) {
            setCaret(view, i)
            typeText(view, i, String.fromCharCode(97 + i))
            expectInvariants(view)
        }
        expect(view.state.doc.toString()).toBe('abcdefghij')
    })
    it('连打 5 个回车', () => {
        const view = make('x')
        for (let i = 0; i < 5; i++) {
            setCaret(view, view.state.doc.length)
            pressEnter(view, view.state.doc.length)
            expectInvariants(view)
        }
        expect(view.state.doc.lines).toBe(6)
    })
    it('打字再逐个退格删回', () => {
        const view = make('abc')
        setCaret(view, 3); typeText(view, 3, 'de')
        expect(view.state.doc.toString()).toBe('abcde')
        setCaret(view, 5); deleteText(view, 4, 1)
        setCaret(view, 4); deleteText(view, 3, 1)
        expect(view.state.doc.toString()).toBe('abc')
        expectInvariants(view)
    })
})

describe('边界:Unicode / emoji / 宽字符', () => {
    it('输入 emoji(代理对)', () => {
        const view = make('a')
        setCaret(view, 1)
        typeText(view, 1, '😀')
        expect(view.state.doc.toString()).toBe('a😀')
        expectInvariants(view)
    })
    it('CJK 混合行内插入', () => {
        const view = make('你好')
        setCaret(view, 1)
        typeText(view, 1, '世界')
        expect(view.state.doc.toString()).toBe('你世界好')
        expectInvariants(view)
    })
    it('emoji 之间回车', () => {
        const view = make('😀😀')
        setCaret(view, 2)  // 两个 emoji 各占 2 UTF-16
        pressEnter(view, 2)
        expect(view.state.doc.toString()).toBe('😀\n😀')
        expectInvariants(view)
    })
})

describe('边界:多光标极限', () => {
    it('多光标删除各处', () => {
        const view = make('a.b.c')
        view.dispatch(view.state.update({
            selection: EditorSelection.create([
                EditorSelection.cursor(1),
                EditorSelection.cursor(3),
            ]),
        }))
        typeText(view, 1, 'X')
        expect(view.state.doc.toString()).toBe('aX.bX.c')
        expectInvariants(view)
    })
    it('多光标在文档末尾附近', () => {
        const view = make('ab\ncd')
        view.dispatch(view.state.update({
            selection: EditorSelection.create([
                EditorSelection.cursor(2),
                EditorSelection.cursor(5),
            ]),
        }))
        typeText(view, 2, '!')
        expect(view.state.doc.toString()).toBe('ab!\ncd!')
        expectInvariants(view)
    })
})

describe('边界:undo/redo 深链', () => {
    it('多步输入连续 undo 到底再 redo 到顶', () => {
        const view = make('')
        setCaret(view, 0); typeText(view, 0, 'a')
        setCaret(view, 1); typeText(view, 1, 'b')
        setCaret(view, 2); typeText(view, 2, 'c')
        expect(view.state.doc.toString()).toBe('abc')
        undo(view); undo(view); undo(view)
        expect(view.state.doc.toString()).toBe('')
        redo(view); redo(view); redo(view)
        expect(view.state.doc.toString()).toBe('abc')
        expectInvariants(view)
    })
})

describe('边界:特殊字符', () => {
    it('输入 tab 字符', () => {
        const view = make('ab')
        setCaret(view, 1)
        typeText(view, 1, '\t')
        expect(view.state.doc.toString()).toBe('a\tb')
        expectInvariants(view)
    })
    it('输入多个空格', () => {
        const view = make('ab')
        setCaret(view, 1)
        typeText(view, 1, '   ')
        expect(view.state.doc.toString()).toBe('a   b')
        expectInvariants(view)
    })
    it('超长行输入', () => {
        const long = 'x'.repeat(500)
        const view = make(long)
        setCaret(view, 250)
        typeText(view, 250, 'Z')
        expect(view.state.doc.toString()).toBe('x'.repeat(250) + 'Z' + 'x'.repeat(250))
        expectInvariants(view)
    })
})

describe('边界:空行密集', () => {
    it('全空行文档中间输入', () => {
        const view = make('\n\n\n\n')  // 5 空行
        setCaret(view, 2)  // 第3行
        typeText(view, 2, 'X')
        expect(view.state.doc.toString()).toBe('\n\nX\n\n')
        expectInvariants(view)
    })
    it('空行上回车再回车', () => {
        const view = make('a\n\nb')
        setCaret(view, 2)  // 空行
        pressEnter(view, 2)
        expect(view.state.doc.toString()).toBe('a\n\n\nb')
        expectInvariants(view)
    })
    it('连续空行逐个退格删除', () => {
        const view = make('a\n\n\nb')
        setCaret(view, 3); pressBackspaceLineStart(view, 3)  // 删第3行(空)
        expect(view.state.doc.toString()).toBe('a\n\nb')
        expectInvariants(view)
        setCaret(view, 2); pressBackspaceLineStart(view, 2)
        expect(view.state.doc.toString()).toBe('a\nb')
        expectInvariants(view)
    })
})

describe('边界:跨行选区含空行', () => {
    it('选区跨越空行删除', () => {
        const view = make('aa\n\nbb')
        setSelection(view, 1, 5)  // a|a\n\nb|b
        replaceSelectionCrossLine(view, 1, 5, '')
        expect(view.state.doc.toString()).toBe('ab')
        expectInvariants(view)
    })
    it('选区从行首跨到行首', () => {
        const view = make('one\ntwo\nthree')
        setSelection(view, 0, 8)  // 整个前两行 + \n
        replaceSelectionCrossLine(view, 0, 8, '')
        expect(view.state.doc.toString()).toBe('three')
        expectInvariants(view)
    })
    it('选区替换含首尾行完整内容', () => {
        const view = make('aaa\nbbb\nccc')
        setSelection(view, 0, 11)  // 全选
        replaceSelectionCrossLine(view, 0, 11, 'X')
        expect(view.state.doc.toString()).toBe('X')
        expect(view.state.doc.lines).toBe(1)
        expectInvariants(view)
    })
})

describe('边界:IME 打断 / 取消', () => {
    it('IME 输入后紧接普通输入', async () => {
        const view = make('')
        await imeCompose(view, 0, ['ni'], '你')
        expect(view.state.doc.toString()).toBe('你')
        setCaret(view, 1)
        typeText(view, 1, '!')
        expect(view.state.doc.toString()).toBe('你!')
        expectInvariants(view)
    })
    it('IME 落定空(取消组合)不改文档', async () => {
        const view = make('ab')
        // compositionstart 后中间态,最终落定回原文(用户取消)
        const tn = view.contentDOM.children[0].firstChild as Text
        view.contentDOM.dispatchEvent(new CompositionEvent('compositionstart'))
        tn.nodeValue = 'anb'; flush(view)
        tn.nodeValue = 'ab'  // 取消,回原
        view.contentDOM.dispatchEvent(new CompositionEvent('compositionend'))
        await Promise.resolve()
        expect(view.state.doc.toString()).toBe('ab')
        expectInvariants(view)
    })
})

describe('边界:undo × 选区/多光标', () => {
    it('多光标输入后 undo 一次全撤', () => {
        const view = make('a.b')
        view.dispatch(view.state.update({
            selection: EditorSelection.create([
                EditorSelection.cursor(1),
                EditorSelection.cursor(3),
            ]),
        }))
        typeText(view, 1, 'X')
        expect(view.state.doc.toString()).toBe('aX.bX')
        undo(view)
        expect(view.state.doc.toString()).toBe('a.b')
        expectInvariants(view)
    })
    it('跨行选区替换后 undo', () => {
        const view = make('one\ntwo\nthree')
        setSelection(view, 2, 9)
        replaceSelectionCrossLine(view, 2, 9, 'X')
        undo(view)
        expect(view.state.doc.toString()).toBe('one\ntwo\nthree')
        expect(view.state.doc.lines).toBe(3)
        expectInvariants(view)
    })
    it('粘贴多行后 undo 行数复原', () => {
        const view = make('ab')
        setCaret(view, 1)
        pasteMultiline(view, 1, 'X\nY\nZ')
        expect(view.state.doc.lines).toBe(3)
        undo(view)
        expect(view.state.doc.toString()).toBe('ab')
        expect(view.state.doc.lines).toBe(1)
        expectInvariants(view)
    })
})

describe('边界:混合操作长序列', () => {
    it('输入-回车-退格-粘贴-undo 混合', () => {
        const view = make('start')
        setCaret(view, 5); typeText(view, 5, '!')          // start!
        setCaret(view, 6); pressEnter(view, 6)              // start!\n
        setCaret(view, 7); typeText(view, 7, 'next')        // start!\nnext
        expect(view.state.doc.toString()).toBe('start!\nnext')
        expectInvariants(view)
        setCaret(view, 7); pressBackspaceLineStart(view, 2) // start!next
        expect(view.state.doc.toString()).toBe('start!next')
        expectInvariants(view)
        setCaret(view, 6); pasteMultiline(view, 6, 'A\nB')  // start!A\nBnext
        expect(view.state.doc.toString()).toBe('start!A\nBnext')
        expectInvariants(view)
    })
})
