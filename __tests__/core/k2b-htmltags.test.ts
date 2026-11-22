// HTML 配对标签名高亮(Monaco documentHighlight ← html language service findDocumentHighlights)
import { describe, expect, it } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'
import { tagNameHighlight } from '../../src/core/feature/tags'
import { liteMonaco } from '../../src/litemonaco'
import type { ShikiLike } from '../../src/litemonaco'

const doc = '<div class="a">\n  <span>hi</span>\n  <br>\n</div>'
const at = (pos: number, d = doc) => tagNameHighlight(EditorState.create({ doc: d, selection: EditorSelection.single(pos) }))
const txt = (r: { from: number, to: number }[] | null, d = doc) => r?.map(x => d.slice(x.from, x.to))

describe('tagNameHighlight', () => {
    it('光标在开标签名里:开、闭两处标签名都高亮', () => {
        const r = at(doc.indexOf('div') + 1)
        expect(txt(r)).toEqual(['div', 'div'])
        expect(r![0].from).toBe(1)
        expect(r![1].from).toBe(doc.lastIndexOf('div'))
    })
    it('光标在闭标签名里 / 标签名两端(含 `<|div`、`div|`)也算', () => {
        expect(txt(at(doc.lastIndexOf('div') + 2))).toEqual(['div', 'div'])
        expect(txt(at(1))).toEqual(['div', 'div'])        // <|div
        expect(txt(at(4))).toEqual(['div', 'div'])        // div|
    })
    it('嵌套:内层 span 只配自己的一对', () => {
        const r = at(doc.indexOf('span') + 2)
        expect(txt(r)).toEqual(['span', 'span'])
        expect(r![0].from).toBe(doc.indexOf('span'))
    })
    it('空元素(没有闭标签):只高亮它自己', () => {
        expect(txt(at(doc.indexOf('br') + 1))).toEqual(['br'])
    })
    it('光标不在标签名里(属性、文本、标签外)→ null,退回文本同词', () => {
        expect(at(doc.indexOf('class') + 2)).toBeNull()
        expect(at(doc.indexOf('hi') + 1)).toBeNull()
        expect(at(doc.indexOf('>') + 1)).toBeNull()
    })
    it('有非空选区不触发', () => {
        const s = EditorState.create({ doc, selection: EditorSelection.single(1, 4) })
        expect(tagNameHighlight(s)).toBeNull()
    })
})

describe('HTML 编辑器里的标签高亮层', () => {
    const hl = () => ({
        codeToTokens: () => ({ tokens: [[]], fg: '#fff', bg: '#000' }),
        getTheme: () => ({ bg: '#1e1e1e', fg: '#d4d4d4', type: 'dark' as const }),
    }) as unknown as ShikiLike
    const QUIET = { minimap: false, overviewRuler: false, vScrollbar: false, hScrollbar: false, stickyScroll: false } as const
    const mk = (lang: string) => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const view = liteMonaco({ parent, highlighter: hl(), doc, lang, features: QUIET })
        const line = (pos: number) => view.state.doc.lineAt(pos)
        ;(view as unknown as { caretCoords: unknown }).caretCoords = (pos: number) => {
            const top = (line(pos).number - 1) * 18
            return { left: (pos - line(pos).from) * 7, right: (pos - line(pos).from) * 7, top, bottom: top + 18, height: 18 }
        }
        view.focus()
        view.dispatch(view.state.update({ selection: EditorSelection.single(2), userEvent: 'select' }))
        return view
    }
    it('html:光标在 div 里 → 两个 .cm-wordHighlightBox;非 html 不画这类框', () => {
        const h = mk('html')
        expect(h.dom.querySelectorAll('.cm-wordHighlightBox').length).toBe(2)
        h.destroy()
        const t = mk('text')
        expect(t.dom.querySelectorAll('.cm-wordHighlightBox').length).toBe(0)
        t.destroy()
    })
})
