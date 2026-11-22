import { describe, expect, it } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { EditorView } from '../../src/core/view/editorview'
import { indentOptions, setIndentOptions } from '../../src/core/edit/commands'

// browser-diff 30-whitespace/tabSize-8:`\t\tindented\t` 在 tabSize 8 下 32 列,lite 却按 4 列量一次就不再重量
//(CSS --lm-tab-size 在 EditorView 建好、第一次量宽之后才由外层写)→ content.width 317 对 241。
// jsdom 没排版,这里钉的是因果链:CSS 变量在第一次量行宽之前就位;tabSize 变了 → 已量行宽作废、重新量。
describe('tabSize 与行宽', () => {
    const mk = (tabSize?: number) => {
        const host = document.createElement('div')
        document.body.appendChild(host)
        const ext = tabSize === undefined ? [] : [EditorState.tabSize.of(tabSize)]
        return new EditorView({ state: EditorState.create({ doc: '\tx\n\t\ty\nplain', extensions: ext }), parent: host })
    }

    it('建好时 --lm-tab-size 就是 state.tabSize(不等外层补写)', () => {
        const v = mk(8)
        expect(v.dom.style.getPropertyValue('--lm-tab-size')).toBe('8')
        v.destroy()
    })

    it('tabSize 变了:--lm-tab-size 跟着变,已量的行宽作废', () => {
        const host = document.createElement('div')
        document.body.appendChild(host)
        const st = EditorState.create({ doc: '\tx\n\t\ty\nplain', extensions: [indentOptions.of([EditorState.tabSize.of(4)])] })
        const v = new EditorView({ state: st, parent: host })
        expect(v.dom.style.getPropertyValue('--lm-tab-size')).toBe('') // 4 = CSS 默认,不写内联样式
        v.lineWidthMap.measureWidth(1, 123)
        v.lineWidthMap.measureWidth(2, 456)
        expect(v.lineWidthMap.has(1)).toBe(true)
        v.dispatch(v.state.update({ effects: setIndentOptions(v.state, { tabSize: 8 }) }))
        expect(v.state.tabSize).toBe(8)
        expect(v.dom.style.getPropertyValue('--lm-tab-size')).toBe('8')
        // 老的 123/456 是按 4 列量的,不能留着
        expect(v.lineWidthMap.maxLineWidth).not.toBe(456)
        v.destroy()
    })

    it('tabSize 从 8 改回 4:去掉内联变量', () => {
        const host = document.createElement('div')
        document.body.appendChild(host)
        const st = EditorState.create({ doc: 'a', extensions: [indentOptions.of([EditorState.tabSize.of(8)])] })
        const v = new EditorView({ state: st, parent: host })
        expect(v.dom.style.getPropertyValue('--lm-tab-size')).toBe('8')
        v.dispatch(v.state.update({ effects: setIndentOptions(v.state, { tabSize: 4 }) }))
        expect(v.dom.style.getPropertyValue('--lm-tab-size')).toBe('')
        v.destroy()
    })

    it('tabSize 没变的事务不动行宽缓存', () => {
        const v = mk(4)
        v.lineWidthMap.measureWidth(1, 123)
        v.dispatch(v.state.update({ selection: { anchor: 1 } }))
        expect(v.lineWidthMap.has(1)).toBe(true)
        v.destroy()
    })
})
