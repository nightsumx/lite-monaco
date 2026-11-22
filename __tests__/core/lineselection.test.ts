// lineSelectionRange 契约 —— 行号 gutter 点击选整行(含行尾换行,对齐 Monaco)。
// 纯函数,view 只接线 onmousedown;jsdom gutter 句柄不稳,真鼠标走真页 aihand 验证。

import { describe, it, expect } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { EditorView } from '../../src/core/view/editorview'
import { lineSelectionRange } from '../../src/core/edit/commands'
import { foldDecorations, foldField, foldGutterSpec } from '../../src/core/edit/fold'

const st = (doc: string) => EditorState.create({ doc })

describe('lineSelectionRange', () => {
    it('中间行:含行尾换行(anchor=行首, head=下一行首)', () => {
        const state = st('aaa\nbbb\nccc')
        const line = state.doc.line(2) // 'bbb',from=4 to=7
        const r = lineSelectionRange(state, 2)
        expect(r.anchor).toBe(line.from)
        expect(r.head).toBe(line.to + 1) // 吃换行 → 下一行首
    })

    it('末行(无换行):到 doc 尾', () => {
        const state = st('aaa\nbbb\nccc')
        const r = lineSelectionRange(state, 3) // 'ccc',doc 尾
        expect(r.anchor).toBe(8)
        expect(r.head).toBe(state.doc.length)
    })

    it('空行:anchor=head=行首+换行(选中那个空行的换行符)', () => {
        const state = st('aaa\n\nccc')
        const line = state.doc.line(2) // 空行,from=to=4
        const r = lineSelectionRange(state, 2)
        expect(r.anchor).toBe(line.from)
        expect(r.head).toBe(line.from + 1)
    })

    it('单行文档(无换行):整行到尾', () => {
        const state = st('only')
        const r = lineSelectionRange(state, 1)
        expect(r.anchor).toBe(0)
        expect(r.head).toBe(4)
    })
})

describe('gutter 点击', () => {
    it('点第 2 行号选整行含换行', () => {
        const host = document.createElement('div')
        document.body.appendChild(host)
        const view = new EditorView({
            state: EditorState.create({ doc: 'aaa\nbbb\nccc' }),
            parent: host,
            lineNumbers: true,
        })
        const nums = [...view.dom.querySelectorAll('.cm-lineNumber')]
        expect(nums.length).toBeGreaterThanOrEqual(2)
        const row = nums[1].closest('.cm-gutterElement') as HTMLElement
        row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
        expect(view.state.selection.main.anchor).toBe(4)
        expect(view.state.selection.main.head).toBe(8)
        view.destroy()
        host.remove()
    })

    it('点折叠箭头折起函数体', () => {
        const host = document.createElement('div')
        document.body.appendChild(host)
        const doc = 'function f() {\n  return 1\n}\n'
        let view: EditorView
        view = new EditorView({
            state: EditorState.create({
                doc,
                extensions: [foldField],
            }),
            parent: host,
            lineNumbers: true,
            foldGutter: foldGutterSpec(tr => view.dispatch(tr)),
            decorationProviders: [foldDecorations],
        })
        const marker = view.dom.querySelector('.cm-foldMarker-active') as HTMLElement
        expect(marker).not.toBeNull()
        marker.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
        expect((view.state.field(foldField) as Set<number>).has(1)).toBe(true)
        view.destroy()
        host.remove()
    })
})
