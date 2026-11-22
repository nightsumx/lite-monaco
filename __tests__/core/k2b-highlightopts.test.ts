// renderLineHighlight / renderLineHighlightOnlyWhenFocus / matchBrackets / selectionHighlight / occurrencesHighlight / foldingHighlight
import { describe, expect, it } from 'vitest'
import { liteMonaco } from '../../src/litemonaco'
import type { ShikiLike } from '../../src/litemonaco'
import type { IEditorOptions } from '../../src/core/options'

const hl = () => ({
    codeToTokens: () => ({ tokens: [[]], fg: '#fff', bg: '#000' }),
    getTheme: () => ({ bg: '#1e1e1e', fg: '#d4d4d4', type: 'dark' as const }),
}) as unknown as ShikiLike
const QUIET = { minimap: false, overviewRuler: false, vScrollbar: false, hScrollbar: false, stickyScroll: false } as const

function mk(doc: string, options: IEditorOptions = {}) {
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    const view = liteMonaco({ parent, highlighter: hl(), doc, lang: 'text', features: QUIET, options })
    // jsdom 没有几何:caretCoords 换成按字符等宽的假坐标,框才画得出来
    const line = (pos: number) => view.state.doc.lineAt(pos)
    ;(view as unknown as { caretCoords: unknown }).caretCoords = (pos: number) => {
        const top = (line(pos).number - 1) * 18
        return { left: (pos - line(pos).from) * 7, right: (pos - line(pos).from) * 7, top, bottom: top + 18, height: 18 }
    }
    return { view, done: () => { view.destroy(); parent.remove() } }
}
const q = (v: { dom: HTMLElement }, sel: string) => v.dom.querySelectorAll(sel).length

describe('renderLineHighlight', () => {
    it('默认 line:画正文当前行,不加行号区高亮类', () => {
        const { view, done } = mk('a\nb')
        expect(q(view, '.cm-currentLine')).toBe(1)
        expect(view.dom.classList.contains('cm-hl-margin')).toBe(false)
        done()
    })
    it('none:正文和行号区都不画', () => {
        const { view, done } = mk('a\nb', { renderLineHighlight: 'none' })
        expect(q(view, '.cm-currentLine')).toBe(0)
        expect(view.dom.classList.contains('cm-hl-margin')).toBe(false)
        done()
    })
    it('gutter:只有行号区高亮;all:两个都有', () => {
        const g = mk('a\nb', { renderLineHighlight: 'gutter' })
        expect(q(g.view, '.cm-currentLine')).toBe(0)
        expect(g.view.dom.classList.contains('cm-hl-margin')).toBe(true)
        g.done()
        const a = mk('a\nb', { renderLineHighlight: 'all' })
        expect(q(a.view, '.cm-currentLine')).toBe(1)
        expect(a.view.dom.classList.contains('cm-hl-margin')).toBe(true)
        a.done()
    })
    it('renderLineHighlightOnlyWhenFocus:失焦不画,聚焦才画', () => {
        const { view, done } = mk('a\nb', { renderLineHighlightOnlyWhenFocus: true })
        expect(q(view, '.cm-currentLine')).toBe(0)
        view.contentDOM.focus()
        expect(q(view, '.cm-currentLine')).toBe(1)
        view.contentDOM.blur()
        expect(q(view, '.cm-currentLine')).toBe(0)
        done()
    })
})

describe('matchBrackets / selectionHighlight / occurrencesHighlight', () => {
    const sel = (view: ReturnType<typeof mk>['view'], a: number, b = a) => view.dispatch(view.state.update({ selection: { anchor: a, head: b }, userEvent: 'select' }))
    it('matchBrackets: always 画包住光标的一对,near 只画贴着的,never 不画', () => {
        const doc = '(a b)'
        const run = (opt: IEditorOptions['matchBrackets']) => {
            const { view, done } = mk(doc, opt ? { matchBrackets: opt } : {})
            view.contentDOM.focus()
            sel(view, 2) // 括号里面,不贴着括号
            const n = q(view, '.cm-bracketBox')
            done()
            return n
        }
        expect(run(undefined)).toBe(2)
        expect(run('always')).toBe(2)
        expect(run('near')).toBe(0)
        expect(run('never')).toBe(0)
        const { view, done } = mk(doc, { matchBrackets: 'near' })
        view.contentDOM.focus()
        sel(view, 1) // 贴着 (
        expect(q(view, '.cm-bracketBox')).toBe(2)
        done()
    })
    it('selectionHighlight:false 不画选中串的其它命中', () => {
        const on = mk('foo bar foo')
        sel(on.view, 0, 3)
        expect(q(on.view, '.cm-selectionMatchBox')).toBe(1)
        on.done()
        const off = mk('foo bar foo', { selectionHighlight: false })
        sel(off.view, 0, 3)
        expect(q(off.view, '.cm-selectionMatchBox')).toBe(0)
        off.done()
    })
    it('occurrencesHighlight:off 不画同词', () => {
        const on = mk('foo bar foo')
        on.view.contentDOM.focus()
        sel(on.view, 1)
        expect(q(on.view, '.cm-wordHighlightTextBox')).toBe(2)
        on.done()
        const off = mk('foo bar foo', { occurrencesHighlight: 'off' })
        off.view.contentDOM.focus()
        sel(off.view, 1)
        expect(q(off.view, '.cm-wordHighlightTextBox')).toBe(0)
        off.done()
    })
})

describe('foldingHighlight', () => {
    it('默认不加类;false 加 cm-no-foldHighlight(CSS 去掉折叠起始行底色)', () => {
        const a = mk('a')
        expect(a.view.dom.classList.contains('cm-no-foldHighlight')).toBe(false)
        a.done()
        const b = mk('a', { foldingHighlight: false })
        expect(b.view.dom.classList.contains('cm-no-foldHighlight')).toBe(true)
        b.done()
    })
})
