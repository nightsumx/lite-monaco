import { describe, expect, it } from 'vitest'
import { EditorView } from '../../src/core/view/editorview'
import { EditorState } from '../../src/core/model/state'
import { Decoration } from '../../src/core/model/decoration'
import { RangeSetBuilder } from '../../src/core/model/rangeset'

// 多 span 行内变异:shiki 高亮把行拆成多个 <span>,浏览器在【非首】span 内改文本。
// harness typeText 只碰 firstText,这里直接碰指定 span 的文本节点,钉死「span 结构下 observer diff 正确」。
// RangeSetBuilder 对每 3 字符建一个 mark:'defghi' → span 'def' | 'ghi'。

function makeWithMarks(doc: string) {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const provider = (_state: EditorState) => {
        const b = new RangeSetBuilder<Decoration>()
        for (let i = 0; i + 3 <= doc.length; i += 3) b.add(i, i + 3, Decoration.mark({ class: 's' }))
        return b.finish()
    }
    return new EditorView({ state: EditorState.create({ doc }), parent: host, decorationProviders: [provider] })
}

function nthText(root: Node, n: number): Text {
    const out: Text[] = []
    const walk = (x: Node) => { if (x.nodeType === 3) out.push(x as Text); else for (const c of Array.from(x.childNodes)) walk(c) }
    walk(root)
    return out[n]
}

function setCaretDOM(v: EditorView, node: Node, offset: number) {
    const sel = v.contentDOM.ownerDocument.getSelection()!
    sel.removeAllRanges()
    const r = v.contentDOM.ownerDocument.createRange()
    r.setStart(node, offset); r.collapse(true); sel.addRange(r)
    v.observer.setSelectionRange({ node, offset }, { node, offset })
}

describe('多 span 行内变异', () => {
    it('DOM 结构确实多 span', () => {
        const v = makeWithMarks('defghi')
        expect(v.contentDOM.children[0].querySelectorAll('span').length).toBe(2)
    })

    it('第2个 span 内插字符', () => {
        const v = makeWithMarks('defghi')  // def|ghi
        const tn = nthText(v.contentDOM.children[0], 1)
        expect(tn.nodeValue).toBe('ghi')
        tn.nodeValue = 'gXhi'
        setCaretDOM(v, tn, 2)
        v.observer.flush()
        expect(v.state.doc.toString()).toBe('defgXhi')
    })

    it('第2个 span 段末插字符', () => {
        const v = makeWithMarks('defghi')
        const tn = nthText(v.contentDOM.children[0], 1)
        tn.nodeValue = 'ghiZ'
        setCaretDOM(v, tn, 4)
        v.observer.flush()
        expect(v.state.doc.toString()).toBe('defghiZ')
    })

    it('第1个 span 段末插字符', () => {
        const v = makeWithMarks('defghi')
        const tn = nthText(v.contentDOM.children[0], 0)  // 'def'
        tn.nodeValue = 'defY'
        setCaretDOM(v, tn, 4)
        v.observer.flush()
        expect(v.state.doc.toString()).toBe('defYghi')
    })

    it('跨 span 边界删掉第一段末字', () => {
        const v = makeWithMarks('defghi')
        const t0 = nthText(v.contentDOM.children[0], 0)
        t0.nodeValue = 'de'
        setCaretDOM(v, t0, 2)
        v.observer.flush()
        expect(v.state.doc.toString()).toBe('deghi')
        expect(v.contentDOM.textContent).toBe('deghi')
    })

    it('第2个 span 内删字符', () => {
        const v = makeWithMarks('defghi')
        const tn = nthText(v.contentDOM.children[0], 1)  // 'ghi'
        tn.nodeValue = 'gi'  // 删 h
        setCaretDOM(v, tn, 1)
        v.observer.flush()
        expect(v.state.doc.toString()).toBe('defgi')
    })

    it('多行:第2行末 span 内插入', () => {
        // 行2 'defghi' 因 mark 按 doc 位置切,结构是 de|fgh|i(与单行 def|ghi 不同)。
        // 忠实做法:找承载末字符的文本节点,在其内插入,别假设节点内容。
        const v = makeWithMarks('abc\ndefghi')
        const line2 = v.contentDOM.children[1]
        const texts: Text[] = []
        const w = (x: Node) => { if (x.nodeType === 3) texts.push(x as Text); else for (const c of Array.from(x.childNodes)) w(c) }
        w(line2)
        const last = texts[texts.length - 1]  // 承载末尾 'i'
        last.nodeValue = last.nodeValue + 'Z'  // 在行末插 Z
        setCaretDOM(v, last, last.nodeValue!.length)
        v.observer.flush()
        expect(v.state.doc.toString()).toBe('abc\ndefghiZ')
    })
})
