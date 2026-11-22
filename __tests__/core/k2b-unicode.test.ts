// unicodeHighlight.* / renderControlCharacters 选项:非默认值要真的生效,默认行为不变(期望值照 Monaco unicodeTextModelHighlighter)
import { describe, expect, it } from 'vitest'
import { Compartment, EditorState } from '../../src/core/model/state'
import { editorOptions, type IEditorOptions } from '../../src/core/options'
import { findSpecialChars, specialCharDecorations, unicodeHighlightRanges, unicodeOptionsOf, DEFAULT_UNICODE_OPTIONS, unicodeHoverSource } from '../../src/core/feature/specialchar'

const stateOf = (doc: string, options: IEditorOptions = {}) => EditorState.create({ doc, extensions: [editorOptions.of(options)] })
const opts = (options: IEditorOptions) => unicodeOptionsOf(stateOf('', options))
const boxes = (text: string, options: IEditorOptions = {}) => findSpecialChars(text, opts(options)).filter(s => s.title).map(s => [s.from, s.to])

describe('unicodeHighlight 选项', () => {
    it('默认值:不可见 + 易混开,nonBasicASCII / includeComments 在受信任环境里等于关,includeStrings 开', () => {
        const o = opts({})
        expect(o).toMatchObject({ nonBasicASCII: false, invisibleCharacters: true, ambiguousCharacters: true, includeComments: false, includeStrings: true })
        expect(boxes('a\u00A0b\u0430c')).toEqual([[1, 2], [3, 4]])
        expect(findSpecialChars('a\u00A0b')).toEqual(findSpecialChars('a\u00A0b', DEFAULT_UNICODE_OPTIONS))
    })

    it('invisibleCharacters:false 不再框不可见字符,易混字符照框', () => {
        expect(boxes('a\u200Bb\u0430c', { unicodeHighlight: { invisibleCharacters: false } })).toEqual([[3, 4]])
    })

    it('ambiguousCharacters:false 不再框易混字符,不可见字符照框', () => {
        expect(boxes('a\u200Bb\u0430c', { unicodeHighlight: { ambiguousCharacters: false } })).toEqual([[1, 2]])
    })

    it('nonBasicASCII:true 所有非基本 ASCII 字符都框(中文也框),提示语照 Monaco', () => {
        const o = { unicodeHighlight: { nonBasicASCII: true } }
        expect(boxes('中文a', o)).toEqual([[0, 1], [1, 2]])
        expect(findSpecialChars('x\u4e2d', opts(o))[0].title).toBe('The character U+4e2d "\u4e2d" is not a basic ASCII character.')
        expect(findSpecialChars('x\u200B', opts(o))[0].title).toBe('The character U+200b is not a basic ASCII character.')
        // 默认值不框中文
        expect(boxes('中文a')).toEqual([])
    })

    it('allowedCharacters:列在里面的字符不框(哪怕它是易混 / 不可见 / nonBasic)', () => {
        expect(boxes('a\u0430b\u200B', { unicodeHighlight: { allowedCharacters: { '\u0430': true } } })).toEqual([[3, 4]])
        expect(boxes('中a', { unicodeHighlight: { nonBasicASCII: true, allowedCharacters: { '中': true } } })).toEqual([])
    })

    it('allowedLocales:语言区里把自己用的字符从易混里去掉(zh-hans 放行全角逗号;未知语言区不起作用)', () => {
        expect(boxes('a\uFF0Cb')).toEqual([[1, 2]])
        expect(boxes('a\uFF0Cb', { unicodeHighlight: { allowedLocales: { 'zh-hans': true } } })).toEqual([])
        expect(boxes('a\uFF0Cb', { unicodeHighlight: { allowedLocales: { 'xx-yy': true } } })).toEqual([[1, 2]])
        // 俄语区放行西里尔字母,_common 里的(如 U+0430 以外的)不受影响
        expect(boxes('a\u0430b', { unicodeHighlight: { allowedLocales: { ru: true } } })).toEqual([])
        expect(boxes('a\u200Bb', { unicodeHighlight: { allowedLocales: { ru: true } } })).toEqual([[1, 2]])
    })

    it('allowedLocales 多个语言区取交集(要在每一个里都还是易混才框)', () => {
        const both: IEditorOptions = { unicodeHighlight: { allowedLocales: { 'zh-hans': true, ja: true } } }
        expect(boxes('a\uFF0Cb', both)).toEqual([])
        expect(boxes('a\uFF08b', both)).toEqual([])
    })

    it('includeComments / includeStrings 只影响有 token 缓存的装饰路径;选项值被解析出来', () => {
        expect(opts({ unicodeHighlight: { includeComments: true } }).includeComments).toBe(true)
        expect(opts({ unicodeHighlight: { includeStrings: false } }).includeStrings).toBe(false)
        expect(opts({ unicodeHighlight: { nonBasicASCII: 'inUntrustedWorkspace' } }).nonBasicASCII).toBe(false)
    })
})

describe('renderControlCharacters', () => {
    it('默认:控制字符画成 U+2400 字形', () => {
        expect(findSpecialChars('a\u0001b', opts({}))).toEqual([{ from: 1, to: 2, glyph: '\u2401', control: true }])
    })
    it('false:控制字符照原样,不再画字形;BOM / LS 的 U+FFFD 不受影响', () => {
        const o = opts({ renderControlCharacters: false })
        expect(findSpecialChars('a\u0001b', o)).toEqual([])
        expect(findSpecialChars('\uFEFFx', o)[0]).toMatchObject({ glyph: '\uFFFD' })
    })
})

describe('specialCharDecorations 读 state 里的选项', () => {
    const count = (state: EditorState) => { let n = 0; for (const it = specialCharDecorations(state).iter(); it.value; it.next()) n++; return n }
    it('控制字符装饰随 renderControlCharacters 开关', () => {
        expect(count(stateOf('a\u0001b'))).toBe(1)
        expect(count(stateOf('a\u0001b', { renderControlCharacters: false }))).toBe(0)
    })
    it('加框范围随 unicodeHighlight 开关', () => {
        const view = { viewport: { from: 0, to: 4 } }
        expect(unicodeHighlightRanges(stateOf('a\u200Bb\u0430'), view)).toEqual([{ from: 1, to: 2 }, { from: 3, to: 4 }])
        expect(unicodeHighlightRanges(stateOf('a\u200Bb\u0430', { unicodeHighlight: { invisibleCharacters: false, ambiguousCharacters: false } }), view)).toEqual([])
    })
    it('同一文档换选项后不用旧缓存', () => {
        const comp = new Compartment()
        const a = EditorState.create({ doc: 'a\u200B', extensions: [comp.of(editorOptions.of({}))] })
        const b = a.applyTransaction(a.update({ effects: [comp.reconfigure(editorOptions.of({ unicodeHighlight: { invisibleCharacters: false } }))] }))
        expect(b.doc).toBe(a.doc)
        expect(unicodeHighlightRanges(a)).toHaveLength(1)
        expect(unicodeHighlightRanges(b)).toHaveLength(0)
    })
})

describe('第四轮·块B:不可见字符 / 易混字符不再劈开文本', () => {
    it('unicodeInfo 只产出盒(类名)和 hover 区间,不产出 inline mark:ZWJ 家庭 emoji 保持一个文本节点', () => {
        const doc = 'a\u{1F468}‍\u{1F469}‍\u{1F467}b'
        const st = stateOf(doc)
        const deco = specialCharDecorations(st)
        const spec: any[] = []
        deco.between?.(0, doc.length, (f: number, t: number, v: any) => { spec.push([f, t, v.spec?.attributes?.title]) })
        expect(spec.some(s => s[2])).toBe(false)
        expect(unicodeHighlightRanges(st).length).toBe(2)
    })

    it('悬停说明走 hover 源:框住的字符命中、普通字符不命中', async () => {
        const { mountEditor } = await import('./h2-helpers')
        const ed: any = mountEditor('a\u200Bb')
        const view = ed.view ?? ed._view ?? ed
        const st = view.state
        const hit: any = unicodeHoverSource(st, 1, 1, view)
        expect(hit).toBeTruthy()
        expect(hit.create().textContent).toContain('invisible')
        expect(unicodeHoverSource(st, 3, 1, view)).toBeNull()
    })
})
