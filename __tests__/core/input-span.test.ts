import { describe, expect, it } from 'vitest'
import { EditorView } from '../../src/core/view/editorview'
import { EditorState } from '../../src/core/model/state'
import { Decoration } from '../../src/core/model/decoration'
import { RangeSetBuilder } from '../../src/core/model/rangeset'
import { domAtPos, posFromDOM } from '../../src/core/view/dombridge'

// 攻击带装饰 span 的 DOM 结构:shiki 高亮把行拆成多个 <span>,
// harness 只用裸文本节点从没测过。posFromDOM/domAtPos 在多 span、嵌套 span 下必须仍双射。

function makeWithMarks(doc: string, marks: { from: number, to: number, cls: string }[]) {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const provider = (_state: EditorState) => {
        const b = new RangeSetBuilder<Decoration>()
        for (const m of marks) b.add(m.from, m.to, Decoration.mark({ class: m.cls }))
        return b.finish()
    }
    return new EditorView({
        state: EditorState.create({ doc }),
        parent: host,
        decorationProviders: [provider],
    })
}

function roundtripAll(view: EditorView) {
    const doc = view.state.doc
    for (let pos = 0; pos <= doc.length; pos++) {
        const { node, offset } = domAtPos(view.contentDOM, doc, pos)
        const back = posFromDOM(view.contentDOM, doc, node, offset)
        expect(back, `pos=${pos}`).toBe(pos)
    }
}

describe('装饰 span 下的 pos 映射', () => {
    it('单行多 span:每段一个 mark', () => {
        const view = makeWithMarks('foobarbaz', [
            { from: 0, to: 3, cls: 'a' },
            { from: 3, to: 6, cls: 'b' },
            { from: 6, to: 9, cls: 'c' },
        ])
        roundtripAll(view)
    })
    it('span 之间有裸文本', () => {
        const view = makeWithMarks('foo bar baz', [
            { from: 0, to: 3, cls: 'a' },
            { from: 8, to: 11, cls: 'c' },
        ])
        roundtripAll(view)
    })
    it('多行各带 span', () => {
        const view = makeWithMarks('abc\ndef\nghi', [
            { from: 0, to: 2, cls: 'a' },
            { from: 4, to: 6, cls: 'b' },
            { from: 8, to: 10, cls: 'c' },
        ])
        roundtripAll(view)
    })
    it('span 覆盖整行', () => {
        const view = makeWithMarks('hello\nworld', [
            { from: 0, to: 5, cls: 'a' },
            { from: 6, to: 11, cls: 'b' },
        ])
        roundtripAll(view)
    })
    it('CJK 带 span', () => {
        const view = makeWithMarks('你好世界', [
            { from: 0, to: 2, cls: 'a' },
            { from: 2, to: 4, cls: 'b' },
        ])
        roundtripAll(view)
    })
    it('emoji 带 span', () => {
        const view = makeWithMarks('a😀b', [{ from: 1, to: 3, cls: 'a' }])
        roundtripAll(view)
    })

    it('嵌套重叠 mark 下每个 pos 仍双射', () => {
        const view = makeWithMarks('abcde', [
            { from: 0, to: 5, cls: 'o' },
            { from: 1, to: 4, cls: 'm' },
            { from: 2, to: 3, cls: 'i' },
        ])
        expect(view.contentDOM.querySelector('.o')).not.toBeNull()
        expect(view.contentDOM.querySelector('.i')).not.toBeNull()
        roundtripAll(view)
        view.destroy()
    })
})
