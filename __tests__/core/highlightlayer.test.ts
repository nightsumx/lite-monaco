import { describe, expect, it } from 'vitest'
import { liteMonaco } from '../../src/litemonaco'
import type { ShikiLike } from '../../src/litemonaco'
import type { EditorView } from '../../src/core/view/editorview'
import { currentLineNumbers, selectionDecorations } from '../../src/core/feature/selectionlayer'
import { EditorState } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'

// P2-15 括号匹配/当前行延迟:EditorView 对「空选区搬家」不重建内容,装饰式的当前行/括号/同词
// 要等下一次无关重绘(~300ms,↓ 键不更新)。改由 highlightLayer 每个事务同步重画。
// P2-13 当前行:Monaco 有非空选区就不画当前行;行号 activeForeground。P1-6 失焦藏光标/选区换 inactive 色。

function fakeHl(): ShikiLike {
    return {
        codeToTokens: () => ({ tokens: [[]], fg: '#fff', bg: '#000' }),
        getTheme: () => ({ bg: '#1e1e1e', fg: '#d4d4d4', type: 'dark' as const }),
    } as unknown as ShikiLike
}
const QUIET = { minimap: false, overviewRuler: false, vScrollbar: false, hScrollbar: false, stickyScroll: false } as const

function mk(doc: string): { view: EditorView, done: () => void } {
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    const view = liteMonaco({ parent, highlighter: fakeHl(), doc, lang: 'text', features: QUIET })
    return { view, done: () => { view.destroy(); parent.remove() } }
}

describe('highlightLayer —— 当前行与光标同一事务更新', () => {
    it('空选区搬家(↓/点击):当前行框立即跟到新行,不等下次重绘', () => {
        const { view, done } = mk('a\nb\nc\nd')
        const top = () => (view.dom.querySelector('.cm-currentLine') as HTMLElement | null)?.style.top
        view.dispatch(view.state.update({ selection: { anchor: 0 } }))
        const t1 = top()
        expect(t1).toBeDefined()
        view.dispatch(view.state.update({ selection: { anchor: view.state.doc.line(3).from } }))
        const t3 = top()
        expect(t3).not.toBe(t1)
        const b3 = view.lineBlockAt(view.state.doc.line(3).from)
        const b1 = view.lineBlockAt(0)
        expect(parseFloat(t3!) - parseFloat(t1!)).toBeCloseTo(b3.top - b1.top)
        done()
    })

    it('行号:光标所在行加 cm-activeLineGutter,搬家后旧行摘掉', () => {
        const { view, done } = mk('a\nb\nc')
        const active = () => [...view.dom.querySelectorAll('.cm-activeLineGutter .cm-lineNumber')].map(e => e.textContent)
        view.dispatch(view.state.update({ selection: { anchor: 0 } }))
        expect(active()).toEqual(['1'])
        view.dispatch(view.state.update({ selection: { anchor: view.state.doc.line(2).from } }))
        expect(active()).toEqual(['2'])
        done()
    })

    it('非空选区不画当前行(Monaco),多光标每行一条', () => {
        const s = EditorState.create({ doc: 'aa\nbb\ncc', extensions: EditorState.allowMultipleSelections.of(true) })
        const sel = (sel: EditorSelection) => currentLineNumbers(s.applyTransaction(s.update({ selection: sel })))
        expect(sel(EditorSelection.create([EditorSelection.cursor(0), EditorSelection.cursor(7)]))).toEqual([1, 3])
        expect(sel(EditorSelection.create([EditorSelection.range(0, 1)]))).toEqual([])
    })

    it('焦点:cm-focusTracked 常在,聚焦才有 cm-focused(CSS 据此藏光标、换 inactive 选区色)', () => {
        const { view, done } = mk('abc')
        expect(view.dom.classList.contains('cm-focusTracked')).toBe(true)
        expect(view.dom.classList.contains('cm-focused')).toBe(false)
        view.contentDOM.focus()
        expect(view.dom.classList.contains('cm-focused')).toBe(true)
        view.contentDOM.blur()
        expect(view.dom.classList.contains('cm-focused')).toBe(false)
        done()
    })
})

describe('P2-14 选区内空白画点(renderWhitespace selection)', () => {
    it('空格成段一个 cm-selWs,tab 一个 cm-selTab,选区外不画', () => {
        const s0 = EditorState.create({ doc: 'a  b\tc d' })
        const s = s0.applyTransaction(s0.update({ selection: EditorSelection.range(0, 6) }))
        const out: string[] = []
        const it = selectionDecorations(s).iter()
        while (it.value) {
            out.push(`${(it.value as any).spec.class}:${it.from}-${it.to}`)
            it.next()
        }
        expect(out).toContain('cm-selWs:1-3')
        expect(out).toContain('cm-selTab:4-5')
        expect(out.some(x => x.startsWith('cm-selWs:6'))).toBe(false)
    })
})
