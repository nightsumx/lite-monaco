// smartSelect.selectLeadingAndTrailingWhitespace / selectSubwords 选项(Monaco 默认都是 true)
import { describe, expect, it } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { editorOptions } from '../../src/core/options'
import { selectionRangesAt } from '../../src/lang/tssmart'

const chain = (src: string, smartSelect?: { selectLeadingAndTrailingWhitespace?: boolean, selectSubwords?: boolean }) => {
    const pos = src.indexOf('‸')
    const doc = src.slice(0, pos) + src.slice(pos + 1)
    const state = EditorState.create({ doc, extensions: smartSelect ? [editorOptions.of({ smartSelect })] : [] })
    return selectionRangesAt(state, pos, undefined, true).map(r => doc.slice(r.from, r.to))
}

describe('smartSelect 选项', () => {
    it('默认:子词 + 含前后空白的整行块', () => {
        expect(chain('fooB‸arBaz\n')).toEqual(['Bar', 'fooBarBaz', 'fooBarBaz\n'])
        expect(chain('function f() {\n    ret‸urn x\n}\n')).toContain('    return x')
    })
    it('selectSubwords=false:不先选子词', () => {
        expect(chain('fooB‸arBaz\n', { selectSubwords: false })).toEqual(['fooBarBaz', 'fooBarBaz\n'])
        expect(chain('foo_b‸ar\n', { selectSubwords: false })).toEqual(['foo_bar', 'foo_bar\n'])
    })
    it('selectLeadingAndTrailingWhitespace=false:不补不含首尾空白的块 / 整行块', () => {
        const src = 'function f() {\n    const x = 1\n    retu‸rn x\n}\n'
        const on = chain(src)
        const off = chain(src, { selectLeadingAndTrailingWhitespace: false })
        expect(on).toContain('    return x')
        expect(off).not.toContain('    return x')
        expect(off).not.toContain('return x')
        // 只剩词、括号内、括号、带行首的括号块、全文(Monaco provideSelectionRanges 在该选项为 false 时直接返回排序去重后的链)
        expect(off).toEqual(['return', '\n    const x = 1\n    return x\n', '{\n    const x = 1\n    return x\n}',
            'function f() {\n    const x = 1\n    return x\n}', 'function f() {\n    const x = 1\n    return x\n}\n'])
        expect(off.length).toBeLessThan(on.length)
    })
})
