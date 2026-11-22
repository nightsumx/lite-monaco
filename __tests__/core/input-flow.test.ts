import { describe, expect, it } from 'vitest'
import { EditorSelection } from '../../src/core/model/selection'
import { undo, redo } from '../../src/core/edit/history'
import {
    make,
    flush,
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
    expectDOMMatchesDoc,
} from './input-harness'

// CM7 输入管线端到端(jsdom):真实 DOM 变异驱动。用 input-harness 忠实复现浏览器
// insertText/回车/退格的稳定 DOM 变异,手动 flush observer → applyDOMChange → dispatch,
// 每步断言 DOM≡doc 逐行双射 + posFromDOM∘domAtPos 恒等。真 IME/选区几何仍归 aipeek。

describe('输入管线:DOM 文本变异 → state', () => {
    it('行内插入单字符', () => {
        const view = make('abc')
        setCaret(view, 2)
        typeText(view, 2, 'X')
        expect(view.state.doc.toString()).toBe('abXc')
        expectInvariants(view)
    })

    it('行尾追加', () => {
        const view = make('hello')
        setCaret(view, 5)
        typeText(view, 5, '!')
        expect(view.state.doc.toString()).toBe('hello!')
        expectInvariants(view)
    })

    it('退格(行内删字)', () => {
        const view = make('abXc')
        setCaret(view, 3)
        deleteText(view, 2, 1)
        expect(view.state.doc.toString()).toBe('abc')
        expectInvariants(view)
    })

    it('多行文档:在第 2 行插入', () => {
        const view = make('foo\nbar\nbaz')
        setCaret(view, 5)
        typeText(view, 5, 'X')
        expect(view.state.doc.toString()).toBe('foo\nbXar\nbaz')
        expectInvariants(view)
    })
})

describe('输入管线:回车拆行', () => {
    it('行末回车 → doc 多一空行', () => {
        const view = make('abc')
        setCaret(view, 3)
        pressEnter(view, 3)
        expect(view.state.doc.toString()).toBe('abc\n')
        expect(view.state.doc.lines).toBe(2)
        expectInvariants(view)
    })

    it('行中回车 → 从光标处拆成两行', () => {
        const view = make('abcdef')
        setCaret(view, 3)
        pressEnter(view, 3)
        expect(view.state.doc.toString()).toBe('abc\ndef')
        expectInvariants(view)
    })

    // 回归(用户实测 bug):回车两下再输入,光标错位、内容落到下面那行。
    // 根因是空行无 <br> 编辑锚点 + 光标做成 inline widget,浏览器往空 div 输入造嵌套 div,
    // observer 归错行。修好后:两次回车产生两个真空行,在末尾空行输入落在正确行。
    it('回车两下再输入:内容落在正确行(用户实测 bug 回归)', () => {
        const view = make('abc')
        setCaret(view, 3)
        pressEnter(view, 3)         // abc\n
        expectDOMMatchesDoc(view)
        pressEnter(view, 4)         // abc\n\n
        expect(view.state.doc.toString()).toBe('abc\n\n')
        expect(view.state.doc.lines).toBe(3)
        expectInvariants(view)
        // 在末尾空行(pos 5,第 3 行开头)输入
        setCaret(view, 5)
        typeText(view, 5, 'Z')
        expect(view.state.doc.toString()).toBe('abc\n\nZ')
        // Z 落在第 3 行,不是第 2 行
        expect(view.state.doc.line(3).text).toBe('Z')
        expect(view.state.doc.line(2).text).toBe('')
        expectInvariants(view)
    })

    it('连续在空行上输入多字符:逐字符累积在同一行', () => {
        const view = make('x\n\ny')  // 中间是空行(pos 2)
        setCaret(view, 2)
        typeText(view, 2, 'a')
        expect(view.state.doc.line(2).text).toBe('a')
        expectInvariants(view)
        typeText(view, 3, 'b')
        expect(view.state.doc.line(2).text).toBe('ab')
        expect(view.state.doc.toString()).toBe('x\nab\ny')
        expectInvariants(view)
    })
})

describe('输入管线:选区替换', () => {
    it('选中一段打字覆盖', () => {
        const view = make('hello world')
        setSelection(view, 6, 11)  // 选中 world
        replaceSelection(view, 6, 11, 'Z')
        expect(view.state.doc.toString()).toBe('hello Z')
        expectInvariants(view)
    })

    it('选中一段打多字符', () => {
        const view = make('abc def ghi')
        setSelection(view, 4, 7)  // 选中 def
        replaceSelection(view, 4, 7, 'XYZ')
        expect(view.state.doc.toString()).toBe('abc XYZ ghi')
        expectInvariants(view)
    })

    it('选中全行打字', () => {
        const view = make('replaceme')
        setSelection(view, 0, 9)
        replaceSelection(view, 0, 9, 'new')
        expect(view.state.doc.toString()).toBe('new')
        expectInvariants(view)
    })
})

describe('输入管线:跨行退格合并', () => {
    // 回归(真页抓出的 bug):hello\nworld 在第2行首退格,曾误得 helloworld\nworld(diff 漏旧次行)。
    it('第2行首退格 → 合并到上一行', () => {
        const view = make('hello\nworld')
        setCaret(view, 6)  // 第2行首
        pressBackspaceLineStart(view, 2)
        expect(view.state.doc.toString()).toBe('helloworld')
        expect(view.state.doc.lines).toBe(1)
        expectInvariants(view)
    })

    it('空行行首退格 → 删掉空行', () => {
        const view = make('abc\n\ndef')  // 第2行是空行
        setCaret(view, 4)  // 第2行(空行)首
        pressBackspaceLineStart(view, 2)
        expect(view.state.doc.toString()).toBe('abc\ndef')
        expectInvariants(view)
    })

    it('第3行首退格 → 只合并第2、3行', () => {
        const view = make('aaa\nbbb\nccc')
        setCaret(view, 8)  // 第3行首
        pressBackspaceLineStart(view, 3)
        expect(view.state.doc.toString()).toBe('aaa\nbbbccc')
        expectInvariants(view)
    })
})

describe('输入管线:多光标输入', () => {
    // 回归(真页抓出的 bug):3 光标打 X 曾只得 1 个 X(diff 单点未扇出到各 range)。
    it('三光标各行首打字 → 每处都插入', () => {
        const view = make('foo\nbar\nbaz')
        setSelection(view, 0, 0)
        view.dispatch(view.state.update({
            selection: EditorSelection.create([
                EditorSelection.cursor(0),
                EditorSelection.cursor(4),
                EditorSelection.cursor(8),
            ]),
        }))
        // 浏览器只在主光标(pos 0)处变异 DOM
        typeText(view, 0, 'X')
        expect(view.state.doc.toString()).toBe('Xfoo\nXbar\nXbaz')
        expect(view.state.selection.ranges.map(r => r.head)).toEqual([1, 6, 11])
        expectInvariants(view)
    })

    it('双光标同行打字 → 两处都插入', () => {
        const view = make('a b c')
        view.dispatch(view.state.update({
            selection: EditorSelection.create([
                EditorSelection.cursor(0),
                EditorSelection.cursor(2),
            ]),
        }))
        typeText(view, 0, '_')
        expect(view.state.doc.toString()).toBe('_a _b c')
        expectInvariants(view)
    })
})

describe('输入管线:粘贴多行', () => {
    it('光标处粘贴两行 → 拆成多行', () => {
        const view = make('foobar')
        setCaret(view, 3)
        pasteMultiline(view, 3, 'X\nY')
        expect(view.state.doc.toString()).toBe('fooX\nYbar')
        expect(view.state.doc.lines).toBe(2)
        expectInvariants(view)
    })

    it('行末粘贴三行', () => {
        const view = make('start')
        setCaret(view, 5)
        pasteMultiline(view, 5, 'a\nb\nc')
        expect(view.state.doc.toString()).toBe('starta\nb\nc')
        expect(view.state.doc.lines).toBe(3)
        expectInvariants(view)
    })

    it('多行文档中间粘贴多行', () => {
        const view = make('one\ntwo\nthree')
        setCaret(view, 5)  // 第2行 t|wo
        pasteMultiline(view, 5, 'A\nB')
        expect(view.state.doc.toString()).toBe('one\ntA\nBwo\nthree')
        expectInvariants(view)
    })
})

describe('输入管线:IME / 重建', () => {
    it('IME composition:中间态不落,compositionend 一次性落定', async () => {
        const view = make('x')
        const tn = view.contentDOM.children[0].firstChild as Text
        view.contentDOM.dispatchEvent(new CompositionEvent('compositionstart'))
        tn.nodeValue = 'xn'; flush(view)
        tn.nodeValue = 'xni'; flush(view)
        expect(view.state.doc.toString()).toBe('x')
        tn.nodeValue = 'x你'
        view.contentDOM.dispatchEvent(new CompositionEvent('compositionend'))
        await Promise.resolve()
        expect(view.state.doc.toString()).toBe('x你')
        expectInvariants(view)
    })

    it('一次 dispatch(重建)之后,DOM 变异仍能流回 state', () => {
        const view = make('abc')
        view.dispatch(view.state.update({ changes: { from: 3, insert: 'd' } }))
        expect(view.state.doc.toString()).toBe('abcd')
        setCaret(view, 2)
        typeText(view, 2, 'X')
        expect(view.state.doc.toString()).toBe('abXcd')
        expectInvariants(view)
    })
})

describe('输入管线:跨行选区替换/删除', () => {
    it('跨行选区打字覆盖 → 合并成一行', () => {
        const view = make('hello\nworld\nfoo')
        setSelection(view, 3, 8)  // "lo\nwo"
        replaceSelectionCrossLine(view, 3, 8, 'Z')
        expect(view.state.doc.toString()).toBe('helZrld\nfoo')
        expectInvariants(view)
    })

    it('跨行选区删除(打空串) → 合并', () => {
        const view = make('hello\nworld\nfoo')
        setSelection(view, 3, 8)
        replaceSelectionCrossLine(view, 3, 8, '')
        expect(view.state.doc.toString()).toBe('helrld\nfoo')
        expectInvariants(view)
    })

    it('跨三行选区删除 → 剩首尾拼接', () => {
        const view = make('aaa\nbbb\nccc\nddd')
        setSelection(view, 1, 13)  // a|aa\nbbb\nccc\nd|dd
        replaceSelectionCrossLine(view, 1, 13, '')
        expect(view.state.doc.toString()).toBe('add')
        expect(view.state.doc.lines).toBe(1)
        expectInvariants(view)
    })

    it('跨行选区替换成多行 → 行数重算', () => {
        const view = make('one\ntwo\nthree')
        setSelection(view, 2, 9)  // on|e\ntwo\nt|hree
        replaceSelectionCrossLine(view, 2, 9, 'X\nY')
        expect(view.state.doc.toString()).toBe('onX\nYhree')
        expect(view.state.doc.lines).toBe(2)
        expectInvariants(view)
    })
})

describe('输入管线:undo/redo × 输入', () => {
    it('输入后 undo 复原,redo 重做', () => {
        const view = make('abc')
        setCaret(view, 3)
        typeText(view, 3, 'X')
        expect(view.state.doc.toString()).toBe('abcX')
        expectInvariants(view)
        undo(view)
        expect(view.state.doc.toString()).toBe('abc')
        expectInvariants(view)
        redo(view)
        expect(view.state.doc.toString()).toBe('abcX')
        expectInvariants(view)
    })

    it('回车后 undo → 行数复原', () => {
        const view = make('abc')
        setCaret(view, 3)
        pressEnter(view, 3)
        expect(view.state.doc.lines).toBe(2)
        undo(view)
        expect(view.state.doc.toString()).toBe('abc')
        expect(view.state.doc.lines).toBe(1)
        expectInvariants(view)
    })

    it('undo 后继续输入 → 新分支正确', () => {
        const view = make('hello')
        setCaret(view, 5)
        typeText(view, 5, '!')
        undo(view)
        expect(view.state.doc.toString()).toBe('hello')
        setCaret(view, 5)
        typeText(view, 5, '?')
        expect(view.state.doc.toString()).toBe('hello?')
        expectInvariants(view)
    })

    it('跨行退格后 undo → 换行复原', () => {
        const view = make('hello\nworld')
        setCaret(view, 6)
        pressBackspaceLineStart(view, 2)
        expect(view.state.doc.toString()).toBe('helloworld')
        undo(view)
        expect(view.state.doc.toString()).toBe('hello\nworld')
        expect(view.state.doc.lines).toBe(2)
        expectInvariants(view)
    })
})

describe('输入管线:IME 多段选词', () => {
    // undo/redo 需要 history 内置;imeCompose 用现有 composition 事件 + 中间态序列。
    it('单段:拼音 ni → 你', async () => {
        const view = make('x')
        await imeCompose(view, 1, ['n', 'ni'], '你')
        expect(view.state.doc.toString()).toBe('x你')
        expectInvariants(view)
    })

    it('多段连续选词:你好世界', async () => {
        const view = make('')
        await imeCompose(view, 0, ['ni', 'nihao'], '你好')
        expect(view.state.doc.toString()).toBe('你好')
        expectInvariants(view)
        await imeCompose(view, 2, ['shi', 'shijie'], '世界')
        expect(view.state.doc.toString()).toBe('你好世界')
        expectInvariants(view)
    })

    it('IME 在已有文本中间落字', async () => {
        const view = make('ab')
        await imeCompose(view, 1, ['zhong'], '中')
        expect(view.state.doc.toString()).toBe('a中b')
        expectInvariants(view)
    })
})
