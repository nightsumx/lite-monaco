import { describe, expect, it } from 'vitest'
import { CharCategory, makeCategorizer } from '../../src/core/model/charcategory'

const cat = makeCategorizer('')

describe('charcategory', () => {
    it('ASCII: letter/digit/_ 是 Word', () => {
        expect(cat('a')).toBe(CharCategory.Word)
        expect(cat('Z')).toBe(CharCategory.Word)
        expect(cat('0')).toBe(CharCategory.Word)
        expect(cat('_')).toBe(CharCategory.Word)
    })

    it('ASCII: 空白是 Space', () => {
        expect(cat(' ')).toBe(CharCategory.Space)
        expect(cat('\t')).toBe(CharCategory.Space)
        expect(cat('\n')).toBe(CharCategory.Space)
    })

    it('ASCII: 标点是 Other', () => {
        expect(cat('.')).toBe(CharCategory.Other)
        expect(cat('(')).toBe(CharCategory.Other)
        expect(cat('=')).toBe(CharCategory.Other)
        expect(cat('-')).toBe(CharCategory.Other)
    })

    it('CJK 是 Word', () => {
        expect(cat('中')).toBe(CharCategory.Word)
        expect(cat('文')).toBe(CharCategory.Word)
        expect(cat('字')).toBe(CharCategory.Word)
        expect(cat('犬')).toBe(CharCategory.Word)
    })

    it('全角空格是 Space', () => {
        expect(cat('\u3000')).toBe(CharCategory.Space)
    })

    it('带重音字母是 Word', () => {
        expect(cat('é')).toBe(CharCategory.Word)
        expect(cat('ü')).toBe(CharCategory.Word)
    })

    it('全角数字是 Word', () => {
        expect(cat('０')).toBe(CharCategory.Word)
    })

    it('假名/谚文是 Word', () => {
        expect(cat('あ')).toBe(CharCategory.Word)
        expect(cat('カ')).toBe(CharCategory.Word)
        expect(cat('한')).toBe(CharCategory.Word)
    })

    it('extraWordChars 扩展', () => {
        const c2 = makeCategorizer('-')
        expect(c2('-')).toBe(CharCategory.Word)
        expect(cat('-')).toBe(CharCategory.Other)
    })

    it('emoji(代理对)是 Other,非 Word', () => {
        // 分类器走 codePointAt 读完整码点;emoji 不在字母范围 → Other。
        expect(cat('😀')).toBe(CharCategory.Other)
        expect(cat('🎉')).toBe(CharCategory.Other)
    })
})
