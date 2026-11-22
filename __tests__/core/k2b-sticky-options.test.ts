// stickyScroll.{enabled,maxLineCount,defaultModel,scrollWithEditor}:非默认值要生效,默认行为不变
import { describe, it, expect } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { EditorView } from '../../src/core/view/editorview'
import { foldScopes, stickyScrollOverlay, type StickyOutlineSource } from '../../src/core/feature/stickyscroll'
import { foldField, manualFoldField, extraFoldField, setExtraFolds } from '../../src/core/edit/fold'
import { editorOptions, type IEditorOptions } from '../../src/core/options'

const body = (n: number, ind: string) => Array.from({ length: n }, (_, i) => `${ind}x${i}`)
const DOC = ['function a() {', '    function b() {', '        function c() {', ...body(30, '            '), '        }', '    }', '}'].join('\n')

function mount(options: IEditorOptions, outline?: StickyOutlineSource, stLines = 10.5) {
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    const view = new EditorView({ state: EditorState.create({ doc: DOC, extensions: [foldField, manualFoldField, extraFoldField, editorOptions.of(options)] }), parent })
    const lh = view.oracle.lineHeight || 20
    const st = lh * stLines
    view.scrollDOM.getBoundingClientRect = () => ({ top: 0, left: 0, right: 600, bottom: 400, width: 600, height: 400, x: 0, y: 0, toJSON() {} }) as DOMRect
    view.contentDOM.getBoundingClientRect = () => ({ top: -st, left: 0, right: 600, bottom: 400, width: 600, height: 400, x: 0, y: -st, toJSON() {} }) as DOMRect
    const off = stickyScrollOverlay(view, outline ? { outline } : undefined)
    view.scrollDOM.dispatchEvent(new Event('scroll'))
    const sticky = () => [...view.dom.querySelectorAll<HTMLElement>('.cm-sticky-line')].map(r => r.querySelector('.cm-sticky-ln')!.textContent)
    return { view, sticky, done: () => { off(); view.destroy(); parent.remove() } }
}
const outlineOf = (start: number, end: number): StickyOutlineSource => (_v, publish) => { publish([{ start, end, children: [] }]); return () => {} }

describe('stickyScroll 选项', () => {
    it('默认:enabled、最多 5 行、outlineModel(没有大纲就用折叠块)', () => {
        const { sticky, done } = mount({})
        expect(sticky()).toEqual(['1', '2', '3'])
        done()
    })
    it('enabled:false 不显示', () => {
        const { view, sticky, done } = mount({ stickyScroll: { enabled: false } })
        expect(sticky()).toEqual([])
        expect((view.dom.querySelector('.cm-sticky-scroll') as HTMLElement).style.display).toBe('none')
        done()
    })
    it('maxLineCount 限制行数(1 → 只有最外层;值夹在 1..10)', () => {
        const a = mount({ stickyScroll: { maxLineCount: 1 } })
        expect(a.sticky()).toEqual(['1'])
        a.done()
        const b = mount({ stickyScroll: { maxLineCount: 2 } })
        expect(b.sticky()).toEqual(['1', '2'])
        b.done()
        const c = mount({ stickyScroll: { maxLineCount: 0 } }) // 夹到 1
        expect(c.sticky()).toEqual(['1'])
        c.done()
    })
    it('defaultModel:outlineModel 用大纲;foldingProviderModel / indentationModel 不用大纲', () => {
        const o = mount({}, outlineOf(1, 36))
        expect(o.sticky()).toEqual(['1'])
        o.done()
        const o2 = mount({ stickyScroll: { defaultModel: 'outlineModel' } }, outlineOf(1, 36))
        expect(o2.sticky()).toEqual(['1'])
        o2.done()
        const f = mount({ stickyScroll: { defaultModel: 'foldingProviderModel' } }, outlineOf(1, 36))
        expect(f.sticky()).toEqual(['1', '2', '3'])
        f.done()
        const i = mount({ stickyScroll: { defaultModel: 'indentationModel' } }, outlineOf(1, 36))
        expect(i.sticky()).toEqual(['1', '2', '3'])
        i.done()
    })
    it('indentationModel 不用 TS outlining 补的块,foldingProviderModel 用', () => {
        const flat = EditorState.create({ doc: Array.from({ length: 20 }, (_, i) => `l${i}`).join('\n'), extensions: [foldField, manualFoldField, extraFoldField] })
        const d = flat.doc
        const withExtra = flat.applyTransaction(flat.update({ effects: setExtraFolds.of([{ line: 3, from: d.line(3).to, to: d.line(12).to }]) }))
        expect(foldScopes(withExtra).map(n => [n.start, n.end])).toEqual([[3, 12]])
        expect(foldScopes(withExtra, true)).toEqual([])
    })
    it('scrollWithEditor:默认横向滚动时 sticky 行跟着走;false 钉在原位', () => {
        const tr = (opts: IEditorOptions) => {
            const m = mount(opts)
            m.view.scrollDOM.scrollLeft = 40
            m.view.scrollDOM.dispatchEvent(new Event('scroll'))
            const t = (m.view.dom.querySelector('.cm-sticky-text') as HTMLElement).style.transform
            m.done()
            return t
        }
        expect(tr({})).toBe('translateX(-40px)')
        expect(tr({ stickyScroll: { scrollWithEditor: false } })).toBe('')
    })
})
