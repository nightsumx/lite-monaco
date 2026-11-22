import { describe, expect, it } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { editorOptions, type IEditorOptions } from '../../src/core/options'
import { inlayDecorations, inlayField, inlayPressedField, type InlayMark } from '../../src/lang/tsinlay'
import type { WidgetType } from '../../src/core/model/decoration'

// inlayHints.maximumLength(默认 43,0 = 不截断):Monaco InlayHintsController._updateHintsDecorators ——
// 同一行的提示文字长度累计;累计已超限的后续提示整个丢弃;越线的那一条砍到限长再补 '…'
function texts(doc: string, marks: InlayMark[], inlayHints?: IEditorOptions['inlayHints']) {
    const state = EditorState.create({ doc, extensions: [inlayField, inlayPressedField, editorOptions.of(inlayHints ? { inlayHints } : {})] })
    const out: string[] = []
    inlayDecorations(state, marks).between(0, doc.length, (_f, _t, d) => {
        const w = (d as unknown as { spec: { widget: WidgetType & { toDOM(): HTMLElement } } }).spec.widget
        out.push(w.toDOM().textContent ?? '')
    })
    return out
}
const m = (pos: number, text: string): InlayMark => ({ pos, text })

describe('inlayHints.maximumLength', () => {
    const doc = 'aaaa bbbb cccc\ndddd'
    it('默认 43:短提示原样', () => { expect(texts(doc, [m(0, 'x:'), m(5, 'y:')])).toEqual(['x:', 'y:']) })
    it('单条越线:保留限长个字符再补 …(Monaco slice(0, -over) + 省略号)', () => {
        expect(texts(doc, [m(0, '0123456789')], { maximumLength: 6 })).toEqual(['012345…'])
    })
    it('同一行累计:越线那条被砍,之后的整条丢弃', () => {
        expect(texts(doc, [m(0, 'abcd'), m(5, 'efgh'), m(10, 'ijkl')], { maximumLength: 6 })).toEqual(['abcd', 'ef…'])
    })
    it('累计恰好等于上限的下一条仍会渲染再被截(Monaco 判 totalLen > maxLength 才跳过)', () => {
        expect(texts(doc, [m(0, 'abc'), m(5, 'def'), m(10, 'ghi')], { maximumLength: 6 })).toEqual(['abc', 'def', '…'])
    })
    it('换行重新累计', () => {
        expect(texts(doc, [m(0, 'abcdef'), m(15, 'abcdef')], { maximumLength: 6 })).toEqual(['abcdef', 'abcdef'])
    })
    it('0 = 不截断', () => {
        const long = 'x'.repeat(100)
        expect(texts(doc, [m(0, long), m(5, long)], { maximumLength: 0 })).toEqual([long, long])
    })
    it('默认值 43 生效:一条 60 字的提示保留 43 字 + …', () => {
        const r = texts(doc, [m(0, 'x'.repeat(60))])
        expect(r[0].length).toBe(44)
        expect(r[0].endsWith('…')).toBe(true)
    })
})
