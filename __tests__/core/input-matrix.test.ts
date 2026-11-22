// CM7 输入管线组合矩阵补测 —— 见 INPUT-TEST-MATRIX.md。
// 每个 it 对应表格一格(编号 = 表格 #)。区外精确双射,折叠区内贴边界(expectInvariants 全断言)。
import { describe, expect, it } from 'vitest'
import { EditorSelection } from '../../src/core/model/selection'
import { undo } from '../../src/core/edit/history'
import { Decoration, WidgetType } from '../../src/core/model/decoration'
import { RangeSet, RangeSetBuilder } from '../../src/core/model/rangeset'
import { domAtPos } from '../../src/core/view/dombridge'
import type { EditorState } from '../../src/core/model/state'
import type { DecorationSet } from '../../src/core/model/decoration'
import type { EditorView } from '../../src/core/view/editorview'
import {
    make,
    makeWith,
    setCaret,
    setSelection,
    typeText,
    deleteText,
    replaceSelection,
    replaceSelectionCrossLine,
    pressEnter,
    pressBackspaceLineStart,
    pasteMultiline,
    imeCompose,
    expectInvariants,
} from './input-harness'

// 每 3 字符一个 mark:把行切成多 span(模拟 shiki 高亮)。
function markEvery3(doc: string) {
    return (_s: EditorState): DecorationSet => {
        const b = new RangeSetBuilder<Decoration>()
        for (let i = 0; i + 3 <= doc.length; i += 3) b.add(i, i + 3, Decoration.mark({ class: 's' }))
        return b.finish()
    }
}

// 折叠占位 widget(⋯):替换 [from,to) 隐藏区。
class FoldW extends WidgetType {
    eq() { return true }
    toDOM() { const s = document.createElement('span'); s.textContent = '⋯'; return s }
}

// 折叠 provider:隐藏行内 [from,to)。测「折叠区旁输入」时用。
function replaceRange(from: number, to: number) {
    return (_s: EditorState): DecorationSet => {
        const b = new RangeSetBuilder<Decoration>()
        b.add(from, to, Decoration.replace({ widget: new FoldW() }))
        return b.finish()
    }
}

describe('矩阵:insert 插入', () => {
    it('line 装饰下行内输入，行 class 仍在', () => {
        const view = makeWith('hello', [() =>
            RangeSet.of([Decoration.line({ class: 'qa-line' }).range(0)], true)])
        typeText(view, 2, 'X')
        expect(view.state.doc.toString()).toBe('heXllo')
        expect(view.contentDOM.querySelector('.cm-line')?.classList.contains('qa-line')).toBe(true)
        expectInvariants(view)
        view.destroy()
    })

    it('I10 mid × mark:span 行内插入', () => {
        const view = makeWith('foobarbaz', [markEvery3('foobarbaz')])
        setCaret(view, 4)
        typeText(view, 4, 'X')
        expect(view.state.doc.toString()).toBe('foobXarbaz')
        expectInvariants(view)
    })
    it('I15 mid × cjk × mark:CJK 落进 span', () => {
        const view = makeWith('foobarbaz', [markEvery3('foobarbaz')])
        setCaret(view, 4)
        typeText(view, 4, '你')
        expect(view.state.doc.toString()).toBe('foob你arbaz')
        expectInvariants(view)
    })
    it('I16 mid × emoji × mark:emoji 落进 span', () => {
        const view = makeWith('foobarbaz', [markEvery3('foobarbaz')])
        setCaret(view, 4)
        typeText(view, 4, '😀')
        expect(view.state.doc.toString()).toBe('foob😀arbaz')
        expectInvariants(view)
    })
    // 折叠区旁输入:harness typeText 非 widget-aware(按可见文本节点走,会把 pos 映过 widget 错位)。
    // 忠实做法:用 domAtPos(widget-aware)定位落点文本节点,直接改 nodeValue 再 flush。
    const typeNearFold = (view: EditorView, pos: number, ch: string) => {
        const { node, offset } = domAtPos(view.contentDOM, view.state.doc, pos)
        const tn = node.nodeType === 3 ? node as Text : null
        expect(tn, `pos=${pos} 应落在文本节点`).not.toBeNull()
        const v = tn!.nodeValue ?? ''
        tn!.nodeValue = v.slice(0, offset) + ch + v.slice(offset)
        const sel = view.contentDOM.ownerDocument.getSelection()!
        sel.removeAllRanges()
        const r = view.contentDOM.ownerDocument.createRange()
        r.setStart(tn!, offset + ch.length); r.collapse(true); sel.addRange(r)
        view.observer.setSelectionRange({ node: tn!, offset: offset + ch.length }, { node: tn!, offset: offset + ch.length })
        view.observer.flush()
    }

    // I11/I12 折叠区旁输入 —— DOMReader/domchange 现 widget-aware:撞折叠 ⋯ widget 从 doc 切隐藏原文,
    // 不把占位当 doc 文本。邻近折叠输入不再损坏 doc。
    it('I11 replace:折叠区【后】插入', () => {
        const view = makeWith('abcdefghi', [replaceRange(3, 6)])  // 隐藏 [3,6)=def
        typeNearFold(view, 7, 'X')
        expect(view.state.doc.toString()).toBe('abcdefgXhi')
    })
    it('I12 replace:折叠区【前】插入', () => {
        const view = makeWith('abcdefghi', [replaceRange(3, 6)])
        typeNearFold(view, 1, 'X')
        expect(view.state.doc.toString()).toBe('aXbcdefghi')
    })
    it('I19 replace:折叠区【后】删字符', () => {
        // 删折叠区后的可见字符,同样走 widget-aware 读路径(隐藏原文不被误删)。
        const view = makeWith('abcdefghi', [replaceRange(3, 6)])
        const { node, offset } = domAtPos(view.contentDOM, view.state.doc, 8)  // g|hi 之后
        const tn = node as Text
        const v = tn.nodeValue ?? ''
        tn.nodeValue = v.slice(0, offset - 1) + v.slice(offset)  // 删 h
        const sel = view.contentDOM.ownerDocument.getSelection()!
        sel.removeAllRanges()
        const r = view.contentDOM.ownerDocument.createRange()
        r.setStart(tn, offset - 1); r.collapse(true); sel.addRange(r)
        view.observer.setSelectionRange({ node: tn, offset: offset - 1 }, { node: tn, offset: offset - 1 })
        view.observer.flush()
        expect(view.state.doc.toString()).toBe('abcdefgi')
    })
    it('I18 multi × undo:多光标插入后 undo 全撤', () => {
        const view = make('foo\nbar\nbaz')
        view.dispatch(view.state.update({
            selection: EditorSelection.create([
                EditorSelection.cursor(3),
                EditorSelection.cursor(7),
                EditorSelection.cursor(11),
            ]),
        }))
        typeText(view, 3, '!')
        expect(view.state.doc.toString()).toBe('foo!\nbar!\nbaz!')
        undo(view)
        expect(view.state.doc.toString()).toBe('foo\nbar\nbaz')
        expectInvariants(view)
    })
})

describe('矩阵:delete 删除', () => {
    it('D3 emoji:退格删整代理对', () => {
        const view = make('a😀b')
        setCaret(view, 3)
        deleteText(view, 1, 2)  // pos=1 删 2 个 UTF-16(整 😀)
        expect(view.state.doc.toString()).toBe('ab')
        expectInvariants(view)
    })
    it('D4 cjk:删 CJK 字', () => {
        const view = make('你好世界')
        setCaret(view, 2)
        deleteText(view, 1, 1)  // pos=1 删 1 个(「好」)
        expect(view.state.doc.toString()).toBe('你世界')
        expectInvariants(view)
    })
    it('D7 docEnd:文档末删字符', () => {
        const view = make('abc')
        setCaret(view, 3)
        deleteText(view, 2, 1)
        expect(view.state.doc.toString()).toBe('ab')
        expectInvariants(view)
    })
    it('D8 undo:删字后 undo 复原', () => {
        const view = make('abcdef')
        setCaret(view, 3)
        deleteText(view, 2, 1)
        expect(view.state.doc.toString()).toBe('abdef')
        undo(view)
        expect(view.state.doc.toString()).toBe('abcdef')
        expectInvariants(view)
    })
})

describe('矩阵:enter 回车', () => {
    it('E6 mid × mark:span 行中回车拆行', () => {
        const view = makeWith('foobarbaz', [markEvery3('foobarbaz')])
        setCaret(view, 4)
        pressEnter(view, 4)
        expect(view.state.doc.toString()).toBe('foob\narbaz')
        expect(view.state.doc.lines).toBe(2)
        expectInvariants(view)
    })
    it('E8 mid × emoji:emoji 中间回车', () => {
        const view = make('a😀b')
        setCaret(view, 1)
        pressEnter(view, 1)
        expect(view.state.doc.toString()).toBe('a\n😀b')
        expectInvariants(view)
    })
    it('E9 multi:多光标同时回车', () => {
        const view = make('ab\ncd')
        view.dispatch(view.state.update({
            selection: EditorSelection.create([
                EditorSelection.cursor(1),
                EditorSelection.cursor(4),
            ]),
        }))
        pressEnter(view, 1)
        expect(view.state.doc.toString()).toBe('a\nb\nc\nd')
        expectInvariants(view)
    })
})

describe('矩阵:bksp 退格合并', () => {
    it('B5 mark:span 行首退格合并', () => {
        const view = makeWith('foo\nbarbaz', [markEvery3('foo\nbarbaz')])
        setCaret(view, 4)
        pressBackspaceLineStart(view, 2)  // 第 2 行行首退格,并入第 1 行
        expect(view.state.doc.toString()).toBe('foobarbaz')
        expect(view.state.doc.lines).toBe(1)
        expectInvariants(view)
    })
    it('B6 cjk:CJK 行退格合并', () => {
        const view = make('你好\n世界')
        setCaret(view, 3)
        pressBackspaceLineStart(view, 2)  // 第 2 行行首退格,并入第 1 行
        expect(view.state.doc.toString()).toBe('你好世界')
        expectInvariants(view)
    })
    it('B7 docStart:首行首退格 → 无上行,不变', () => {
        const view = make('abc')
        setCaret(view, 0)
        // 首行首退格无上行可并:浏览器不产生变异,doc 不变
        expect(view.state.doc.toString()).toBe('abc')
        expectInvariants(view)
    })
})

describe('矩阵:replace 选区替换', () => {
    it('R8 mark:span 内选区替换', () => {
        const view = makeWith('foobarbaz', [markEvery3('foobarbaz')])
        setSelection(view, 3, 6)
        replaceSelection(view, 3, 6, 'XY')
        expect(view.state.doc.toString()).toBe('fooXYbaz')
        expectInvariants(view)
    })
    it('R9 cjk:CJK 选区替换', () => {
        const view = make('你好世界')
        setSelection(view, 1, 3)
        replaceSelection(view, 1, 3, 'AB')
        expect(view.state.doc.toString()).toBe('你AB界')
        expectInvariants(view)
    })
    it('R10 emoji:选区含 emoji 替换', () => {
        const view = make('a😀b')
        setSelection(view, 1, 3)
        replaceSelection(view, 1, 3, 'Z')
        expect(view.state.doc.toString()).toBe('aZb')
        expectInvariants(view)
    })
    it('R11 undo:单选区替换后 undo', () => {
        const view = make('abcdef')
        setSelection(view, 2, 4)
        replaceSelection(view, 2, 4, 'XY')
        expect(view.state.doc.toString()).toBe('abXYef')
        undo(view)
        expect(view.state.doc.toString()).toBe('abcdef')
        expectInvariants(view)
    })
})

describe('矩阵:paste 粘贴多行', () => {
    it('P6 sel:选区上粘贴多行(先删后插)', () => {
        const view = make('foobar')
        setSelection(view, 2, 4)
        // 选区 [2,4) 被粘贴内容替换:浏览器 insertFromPaste 到非空选区 = 删选区 + 插多行。
        replaceSelectionCrossLine(view, 2, 4, 'X\nY')
        expect(view.state.doc.toString()).toBe('foX\nYar')
        expectInvariants(view)
    })
    it('P7 mark:span 行内粘贴多行', () => {
        const view = makeWith('foobarbaz', [markEvery3('foobarbaz')])
        setCaret(view, 4)
        pasteMultiline(view, 4, 'X\nY')
        expect(view.state.doc.toString()).toBe('foobX\nYarbaz')
        expectInvariants(view)
    })
    it('P8 cjk:粘贴含 CJK 多行', () => {
        const view = make('abcdef')
        setCaret(view, 3)
        pasteMultiline(view, 3, '你\n好')
        expect(view.state.doc.toString()).toBe('abc你\n好def')
        expectInvariants(view)
    })
})

describe('矩阵:ime 输入法', () => {
    it('M6 mark:span 行内 IME 落字', async () => {
        const view = makeWith('foobarbaz', [markEvery3('foobarbaz')])
        setCaret(view, 4)
        await imeCompose(view, 4, ['ni', '你'], '你')
        expect(view.state.doc.toString()).toBe('foob你arbaz')
        expectInvariants(view)
    })
    it('M7 undo:IME 落定后 undo', async () => {
        const view = make('abc')
        setCaret(view, 3)
        await imeCompose(view, 3, ['ni', '你'], '你')
        expect(view.state.doc.toString()).toBe('abc你')
        undo(view)
        expect(view.state.doc.toString()).toBe('abc')
        expectInvariants(view)
    })
    it('M8 empty:空行上 IME 落字', async () => {
        const view = make('a\n\nb')
        setCaret(view, 2)  // 中间空行
        await imeCompose(view, 2, ['hao', '好'], '好')
        expect(view.state.doc.toString()).toBe('a\n好\nb')
        expectInvariants(view)
    })
})
