// F1 输入同步修复:focus 写回选区 / 幽灵字符重画 / 视口外选区与大变更 / 组字保护与兜底。
// 每条对应猎虫阶段的浏览器复现(/tmp/lc-hunt/c-input、a-edit、d-smart、e-host),这里在 jsdom 里钉住状态机那一半。

import { afterEach, describe, expect, it } from 'vitest'
import { EditorView, inputHandler } from '../../src/core/view/editorview'
import { EditorState, StateEffect } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'
import { history } from '../../src/core/edit/history'
import { checkBijection } from '../../src/core/view/invariants'
import { make, makeScrolled, setCaret, typeText, expectInvariants } from './input-harness'

afterEach(() => { document.body.innerHTML = '' })

function lines(n: number) {
    return Array.from({ length: n }, (_, i) => `line ${i + 1}`).join('\n')
}

// 原生选区在 contentDOM 里的 doc 位置(head)
function domHead(view: EditorView): number {
    const s = document.getSelection()!
    return view.posFromDOM(s.focusNode!, s.focusOffset)
}

function firstTextOf(el: Element): Text {
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    return w.nextNode() as Text
}

function caretAt(node: Node, offset: number) {
    const s = document.getSelection()!
    s.removeAllRanges()
    const r = document.createRange()
    r.setStart(node, offset)
    r.collapse(true)
    s.addRange(r)
}

function beforeinput(view: EditorView, inputType: string, data: string | null = null) {
    const e = new InputEvent('beforeinput', { inputType, data, cancelable: true, bubbles: true })
    view.contentDOM.dispatchEvent(e)
    return e
}

describe('#8 focus() / 聚焦时把 state 选区写回 DOM', () => {
    it('view.focus():浏览器把原生光标放在开头,读回后模型选区不变', () => {
        const view = make('hello\nworld')
        view.dispatch(view.state.update({ selection: { anchor: 8 } }))
        // 浏览器聚焦 contenteditable 时把原生光标放到内容开头
        caretAt(firstTextOf(view.contentDOM), 0)
        view.focus()
        expect(domHead(view)).toBe(8)
        view.observer.flush()
        expect(view.state.selection.main.head).toBe(8)
    })

    it('contentDOM focus 事件(宿主直接 contentDOM.focus / 关浮层 / Tab 回来)同样写回', () => {
        const view = make('hello\nworld')
        view.dispatch(view.state.update({ selection: { anchor: 3 } }))
        caretAt(firstTextOf(view.contentDOM), 0)
        view.contentDOM.dispatchEvent(new FocusEvent('focus'))
        expect(domHead(view)).toBe(3)
        view.observer.flush()
        expect(view.state.selection.main.head).toBe(3)
    })
})

describe('#4 原生插入没被 state 采纳 → 重画该行,不留幽灵字符', () => {
    // 模拟闭括号过键:输入的 ")" 与光标后的 ")" 相同 → 只移光标,不改文档
    const overtype = inputHandler.of((view, from, to, insert) => {
        if (insert !== ')' || from !== to || view.state.sliceDoc(from, from + 1) !== ')') return false
        view.dispatch(view.state.update({ selection: { anchor: from + 1 } }))
        return true
    })

    it('foo() 里过键 ) 再打 ; → foo();', () => {
        const host = document.createElement('div')
        document.body.appendChild(host)
        const view = new EditorView({
            state: EditorState.create({ doc: 'foo()', selection: { anchor: 4 }, extensions: [overtype, history()] }),
            parent: host,
        })
        setCaret(view, 4)
        typeText(view, 4, ')')
        expect(view.state.doc.toString()).toBe('foo()')
        expect(view.state.selection.main.head).toBe(5)
        // DOM 必须回到 state:不能残留 "foo())"
        expect(checkBijection(view)).toBeNull()
        expect(view.contentDOM.textContent).toBe('foo()')
        typeText(view, 5, ';')
        expect(view.state.doc.toString()).toBe('foo();')
        expectInvariants(view)
    })
})

describe('#5/#6/#7/#9/#15 视口外选区与大变更', () => {
    const geo = { clientHeight: 200, scrollTop: 0 }

    it('#5 全选后整篇替换成多行:DOM 渲染全部新行(不是只剩第一行)', () => {
        const view = makeScrolled(lines(300), geo)
        expect(view.contentDOM.children.length).toBeLessThan(300)
        view.dispatch(view.state.update({
            changes: { from: 0, to: view.state.doc.length, insert: 'a\nb\nc' },
            selection: { anchor: 5 },
        }))
        expect(checkBijection(view)).toBeNull()
        expect(Array.from(view.contentDOM.children).map(e => e.textContent)).toEqual(['a', 'b', 'c'])
    })

    it('#15 长文档整篇替换成短文本(删除跨出视口底)', () => {
        const view = makeScrolled(lines(300), geo)
        view.dispatch(view.state.update({ changes: { from: 0, to: view.state.doc.length, insert: 'x\ny' } }))
        expect(Array.from(view.contentDOM.children).map(e => e.textContent)).toEqual(['x', 'y'])
    })

    it('#5 全选后回车(替换跨出视口)', () => {
        const view = makeScrolled(lines(300), geo)
        view.dispatch(view.state.update({ changes: { from: 0, to: view.state.doc.length, insert: '\n' }, selection: { anchor: 1 } }))
        expect(checkBijection(view)).toBeNull()
        expect(view.contentDOM.children.length).toBe(2)
    })

    it('#6 选区延伸到视口外时打字:按 state 选区替换,不改坏文档开头', () => {
        const view = makeScrolled(lines(300), geo)
        const doc = view.state.doc.toString()
        expect(view.viewport.to).toBeLessThan(2200)
        view.dispatch(view.state.update({ selection: { anchor: 30, head: 2200 } }))
        const e = beforeinput(view, 'insertText', 'Z')
        expect(e.defaultPrevented).toBe(true)
        expect(view.state.doc.toString()).toBe(doc.slice(0, 30) + 'Z' + doc.slice(2200))
        expect(view.state.selection.main.head).toBe(31)
        // 落字后光标回到渲染范围内:后续输入走原生路径
        setCaret(view, 31)
        typeText(view, 31, 'Q')
        expect(view.state.doc.toString()).toBe(doc.slice(0, 30) + 'ZQ' + doc.slice(2200))
        expect(view.state.doc.line(1).text).toBe('line 1')
        expect(checkBijection(view)).toBeNull()
    })

    it('#6 视口外选区上退格 = 删除选区', () => {
        const view = makeScrolled(lines(300), geo)
        const doc = view.state.doc.toString()
        view.dispatch(view.state.update({ selection: { anchor: 0, head: doc.length } }))
        beforeinput(view, 'deleteContentBackward')
        expect(view.state.doc.toString()).toBe('')
        expect(checkBijection(view)).toBeNull()
    })

    it('#7 光标跳到视口外的文档末尾(scrollIntoView):光标行被渲染,DOM 选区落在末尾', () => {
        const view = makeScrolled(lines(300), geo)
        view.contentDOM.focus()
        expect(view.hasFocus).toBe(true)
        const end = view.state.doc.length
        expect(view.viewport.to).toBeLessThan(end)
        view.dispatch(view.state.update({ selection: { anchor: end }, scrollIntoView: true }))
        expect(view.viewport.to).toBe(end)
        expect(domHead(view)).toBe(end)
        expect(checkBijection(view)).toBeNull()
    })

    it('#9 长文本粘贴只物化视口(成本 ∝ 视口,不是 ∝ 粘贴行数)', () => {
        const view = makeScrolled(lines(300), geo)
        const big = lines(20000)
        const t0 = performance.now()
        view.dispatch(view.state.update({ changes: { from: 0, insert: big + '\n' }, selection: { anchor: big.length + 1 } }))
        const ms = performance.now() - t0
        expect(view.state.doc.lines).toBe(20300)
        expect(view.contentDOM.children.length).toBeLessThan(400)
        expect(checkBijection(view)).toBeNull()
        expect(ms).toBeLessThan(1500)
    })

    it('视口内的小编辑仍走增量补丁(未变行的节点保留)', () => {
        const view = makeScrolled(lines(300), geo)
        const keep = view.contentDOM.children[5]
        view.dispatch(view.state.update({ changes: { from: 0, insert: 'X' } }))
        expect(view.contentDOM.children[5]).toBe(keep)
        expect(checkBijection(view)).toBeNull()
    })
})

describe('#1/#2/#3/#11/#12 组字保护与卡死兜底', () => {
    const fx = StateEffect.define<number>()

    // 在 line 行(1-based)末尾开始组字,DOM 里写入组字文本(flush 挂起,state 不动)
    function startCompose(view: EditorView, lineNo: number, text: string) {
        const el = view.contentDOM.children[lineNo - 1] as HTMLElement
        const tn = firstTextOf(el)
        const base = tn.nodeValue!.length
        view.dispatch(view.state.update({ selection: { anchor: view.state.doc.line(lineNo).to } }))
        caretAt(tn, base)
        view.contentDOM.dispatchEvent(new CompositionEvent('compositionstart'))
        tn.nodeValue = tn.nodeValue + text
        caretAt(tn, base + text.length)
        view.observer.flush()
        return { el, tn }
    }

    it('#1 组字中来了纯 effect 事务:组字行节点原样保留,提交进 state', async () => {
        const view = make('function f() {\n    x\n}')
        const { el } = startCompose(view, 2, 'ni hao')
        view.dispatch(view.state.update({ effects: fx.of(1) }))
        expect(view.contentDOM.children[1]).toBe(el)
        expect(el.textContent).toBe('    xni hao')
        // 提交 = 浏览器把组字文本换成最终字
        firstTextOf(el).nodeValue = '    x你好'
        caretAt(firstTextOf(el), 7)
        view.contentDOM.dispatchEvent(new CompositionEvent('compositionend'))
        await Promise.resolve(); await Promise.resolve()
        expect(view.composing).toBe(false)
        expect(view.state.doc.toString()).toBe('function f() {\n    x你好\n}')
        expectInvariants(view)
    })

    it('#3 组字中有空事务,提交文本 == 最后组字文本(无新变异)也不丢', async () => {
        const view = make('abc')
        startCompose(view, 1, 'nihao')
        view.dispatch(view.state.update({}))
        view.contentDOM.dispatchEvent(new CompositionEvent('compositionend'))
        await Promise.resolve(); await Promise.resolve()
        expect(view.state.doc.toString()).toBe('abcnihao')
        expect(view.state.selection.main.head).toBe(8)
        expectInvariants(view)
    })

    it('#3 组字中别的行有远端修改,提交文本 == 组字文本也不丢', async () => {
        const view = make('abc\nxyz')
        startCompose(view, 1, 'nihao')
        view.dispatch(view.state.update({ changes: { from: 5, insert: 'R' } }))
        view.contentDOM.dispatchEvent(new CompositionEvent('compositionend'))
        await Promise.resolve(); await Promise.resolve()
        expect(view.state.doc.toString()).toBe('abcnihao\nxRyz')
        expectInvariants(view)
    })

    it('#11 组字中同一行有远端修改:组字行就地改,组字文本不从 DOM 消失', async () => {
        const view = make('abc xyz')
        const el = view.contentDOM.children[0] as HTMLElement
        const tn = firstTextOf(el)
        view.dispatch(view.state.update({ selection: { anchor: 3 } }))
        caretAt(tn, 3)
        view.contentDOM.dispatchEvent(new CompositionEvent('compositionstart'))
        tn.nodeValue = 'abcni xyz'
        caretAt(tn, 5)
        // 组字前、组字后各来一次远端修改
        view.dispatch(view.state.update({ changes: { from: 0, insert: 'R' } }))
        view.dispatch(view.state.update({ changes: { from: 6, to: 7, insert: 'Y' } }))
        expect(view.contentDOM.children[0]).toBe(el)
        expect(el.textContent).toBe('Rabcni xYz')
        expect(document.getSelection()!.focusNode).toBe(tn)
        tn.nodeValue = 'Rabc你 xYz'
        caretAt(tn, 5)
        view.contentDOM.dispatchEvent(new CompositionEvent('compositionend'))
        await Promise.resolve(); await Promise.resolve()
        expect(view.state.doc.toString()).toBe('Rabc你 xYz')
        expectInvariants(view)
    })

    it('#2 组字中 mousedown:先把组字文本提交进 state', () => {
        const view = make('abc\ndef')
        startCompose(view, 1, 'ni hao')
        view.contentDOM.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 2 }))
        expect(view.composing).toBe(false)
        expect(view.observer.composing).toBe(false)
        expect(view.state.doc.toString()).toBe('abcni hao\ndef')
    })

    it('#2 editorview.endComposition() 对外可调(F6 等需要时)', () => {
        const view = make('abc')
        startCompose(view, 1, 'xy')
        view.endComposition()
        expect(view.state.doc.toString()).toBe('abcxy')
        view.endComposition() // 不在组字中:无操作
        expect(view.state.doc.toString()).toBe('abcxy')
    })

    it('#12 组字中失焦:提交组字,光标落在组字末尾(不是起点)', () => {
        const view = make('abc')
        startCompose(view, 1, 'ni hao')
        document.getSelection()!.removeAllRanges()
        view.contentDOM.dispatchEvent(new FocusEvent('blur'))
        expect(view.composing).toBe(false)
        expect(view.state.doc.toString()).toBe('abcni hao')
        expect(view.state.selection.main.head).toBe(9)
    })

    it('卡死兜底:组字中来了不带 isComposing 的普通输入 → 结束组字', () => {
        const view = make('abc')
        startCompose(view, 1, 'ni')
        beforeinput(view, 'insertText', 'x')
        expect(view.observer.composing).toBe(false)
        expect(view.state.doc.toString()).toBe('abcni')
    })

    it('卡死兜底:组字行被换掉后 selectionchange → 结束组字', () => {
        const view = make('abc\ndef')
        const { el } = startCompose(view, 1, 'ni')
        el.remove()
        document.dispatchEvent(new Event('selectionchange'))
        expect(view.observer.composing).toBe(false)
    })

    it('组字中 update 不改写原生选区', () => {
        const view = make('abc')
        view.contentDOM.focus()
        const { tn } = startCompose(view, 1, 'ni')
        view.dispatch(view.state.update({ effects: fx.of(1) }))
        const s = document.getSelection()!
        expect(s.focusNode).toBe(tn)
        expect(s.focusOffset).toBe(5)
    })
})

describe('#13 contentDOM 属性对齐 Monaco textarea', () => {
    it('spellcheck/autocorrect/autocapitalize 关闭', () => {
        const view = make('a')
        expect(view.contentDOM.getAttribute('spellcheck')).toBe('false')
        expect(view.contentDOM.getAttribute('autocorrect')).toBe('off')
        expect(view.contentDOM.getAttribute('autocapitalize')).toBe('off')
    })
})

// 多光标插入在视口外选区上也扇出(走同一条输入处理链)
describe('视口外多光标', () => {
    it('主选区在视口外、多 range 时按 range 扇出', () => {
        const view = makeScrolled(lines(300), { clientHeight: 200, scrollTop: 0 })
        const end = view.state.doc.length
        view.dispatch(view.state.update({ selection: EditorSelection.create([EditorSelection.cursor(0), EditorSelection.cursor(end)], 1) }))
        beforeinput(view, 'insertText', 'Z')
        expect(view.state.doc.sliceString(0, 1)).toBe('Z')
        expect(view.state.doc.sliceString(view.state.doc.length - 1)).toBe('Z')
    })
})

describe('R3 跨行选区上开始组字', () => {
    // Chrome:组字首字把跨行选区删掉、合并行,state 跟着重画会换掉组字节点 → Chrome 静默提交首字母、另起组字,
    // 最终多出一个拼音字母(/tmp/lc-hunt/c-input/ime1.ts「replace multiline sel」:an你好cc,Monaco a你好cc)。
    // 对策同视口外选区:compositionstart 时先按 state 删掉选区,组字从折叠的光标处开始。
    it('compositionstart 时跨行选区先删掉,光标落在起点', () => {
        const view = make('aaa\nbbb\nccc')
        view.dispatch(view.state.update({ selection: EditorSelection.single(1, 9) }))
        view.contentDOM.dispatchEvent(new CompositionEvent('compositionstart'))
        expect(view.state.doc.toString()).toBe('acc')
        expect(view.state.selection.main.empty).toBe(true)
        expect(view.state.selection.main.head).toBe(1)
        expectInvariants(view)
    })
    it('同一行内的选区不动(浏览器原生替换就对)', () => {
        const view = make('hello world')
        view.dispatch(view.state.update({ selection: EditorSelection.single(6, 11) }))
        view.contentDOM.dispatchEvent(new CompositionEvent('compositionstart'))
        expect(view.state.doc.toString()).toBe('hello world')
    })
    it('删选区和后面的组字同一个 undo 组', () => {
        const view = make('aaa\nbbb\nccc')
        view.dispatch(view.state.update({ selection: EditorSelection.single(1, 9) }))
        view.contentDOM.dispatchEvent(new CompositionEvent('compositionstart'))
        view.dispatch(view.state.update({ changes: { from: 1, insert: '你好' }, selection: { anchor: 3 }, userEvent: 'input.type.compose' }))
        view.contentDOM.dispatchEvent(new CompositionEvent('compositionend'))
        return import('../../src/core/edit/history').then(({ undo }) => {
            undo({ state: view.state, dispatch: tr => view.dispatch(tr) })
            expect(view.state.doc.toString()).toBe('aaa\nbbb\nccc')
        })
    })
})

describe('R3 菜单撤销/重做(beforeinput historyUndo/historyRedo)', () => {
    it('走编辑器历史,不让浏览器做 DOM 撤销', () => {
        const view = make('abc')
        view.dispatch(view.state.update({ changes: { from: 3, insert: 'xyz' }, selection: { anchor: 6 }, userEvent: 'input.type' }))
        const e1 = beforeinput(view, 'historyUndo')
        expect(e1.defaultPrevented).toBe(true)
        expect(view.state.doc.toString()).toBe('abc')
        const e2 = beforeinput(view, 'historyRedo')
        expect(e2.defaultPrevented).toBe(true)
        expect(view.state.doc.toString()).toBe('abcxyz')
        expectInvariants(view)
    })
})
