// 期望值来自 Monaco 0.52:加框照 UnicodeTextModelHighlighter.computeUnicodeHighlights(/tmp/lc-hunt/fix2/f1/v3-parity.ts
// 拿它本身对拍,样例 + 2 万条随机串无差异),字形照 viewLineRenderer 的 renderControlCharacters
import { describe, expect, it } from 'vitest'
import { findSpecialChars } from '../../src/core/feature/specialchar'

const boxes = (text: string) => findSpecialChars(text).filter(s => s.title).map(s => [s.from, s.to])

describe('findSpecialChars', () => {
    it('不可见字符加框;nbsp 是 \\s 不进词,zwsp 和两边的 ASCII 同词', () => {
        expect(findSpecialChars('a\u00A0b\u200Bc')).toEqual([
            { from: 1, to: 2, title: 'The character U+00a0 is invisible.' },
            { from: 3, to: 4, title: 'The character U+200b is invisible.' },
        ])
        expect(findSpecialChars('abc')).toEqual([])
    })

    it('易混字符写明像哪个 ASCII', () => {
        expect(findSpecialChars('\u0430bc')).toEqual([{
            from: 0, to: 1,
            title: 'The character U+0430 "\u0430" could be confused with the ASCII character U+0061 "a", which is more common in source code.',
        }])
    })

    it('词里没有 ASCII、又有不易混的字符就不标(中文里的全角标点)', () => {
        expect(boxes('中文\uFF0C测试')).toEqual([])
        expect(boxes('a\uFF0Cb')).toEqual([[1, 2]])
        expect(boxes('\uFF08中\uFF09')).toEqual([])
        expect(boxes('\u0431\u0436')).toEqual([])
        expect(boxes('\u0431x')).toEqual([[0, 1]])
        // 词紧挨着在它前面结束也算没有词(getWordAtText 先找到 .5)
        expect(boxes('.5\u0431\u0436')).toEqual([[2, 3]])
    })

    it('代理对按整个码点', () => {
        expect(boxes('x\u{1D400}')).toEqual([[1, 3]])
    })

    it('控制字符:C0 → U+2400 起的字形,DEL → U+2421,双向格式字符 → [U+XXXX];BOM / LS / PS / NEL → U+FFFD', () => {
        expect(findSpecialChars('a\u0001b')).toEqual([{ from: 1, to: 2, glyph: '\u2401', control: true }])
        expect(findSpecialChars('\u007F')[0]).toMatchObject({ glyph: '\u2421', control: true })
        expect(findSpecialChars('x\u202Ey')[0]).toMatchObject({ glyph: '[U+202E]', control: true, title: 'The character U+202e is invisible.' })
        expect(findSpecialChars('\uFEFFx')[0]).toMatchObject({ glyph: '\uFFFD', control: undefined, title: 'The character U+feff is invisible.' })
        expect(findSpecialChars('a\u0085b')).toEqual([{ from: 1, to: 2, glyph: '\uFFFD', control: undefined, title: undefined }])
        expect(findSpecialChars('a\u2028b')[0]).toMatchObject({ glyph: '\uFFFD', title: 'The character U+2028 "\u2028" could be confused with the ASCII character U+0020 " ", which is more common in source code.' })
        expect(findSpecialChars('a\tb')).toEqual([])
    })

    it('超过 1000 个一个都不框,控制字符照画', () => {
        expect(boxes('\u0430 '.repeat(1000)).length).toBe(1000)
        expect(findSpecialChars('\u0001 ' + '\u0430 '.repeat(1001))).toEqual([{ from: 0, to: 1, glyph: '\u2401', control: true, title: undefined }])
    })
})
