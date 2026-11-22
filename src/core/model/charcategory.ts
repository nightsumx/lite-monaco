// CM7 字符分类 —— 词级移动/删词的原语。映射 _cmsrc/state/src/charcategory.ts。
//
// CM6 用正则 \p{Alphabetic}\p{Number}_ 判 word、\S 判 space。CM7 禁正则，
// 改码点范围分类：ASCII 快路径 + Unicode 区间 + 大小写启发（有大小写差异=字母）。
// 语义等价 CM6：Word（字母/数字/_/$）、Space（空白）、Other（标点等）。

export enum CharCategory {
    Word,
    Space,
    Other,
}

// ASCII 快路径：0-127 直接分类，零区间查找。
function categorizeASCII(code: number): CharCategory {
    if (code === 32 || code === 9 || code === 10 || code === 13 || code === 11 || code === 12)
        return CharCategory.Space
    if ((code >= 48 && code <= 57)   // 0-9
        || (code >= 65 && code <= 90)  // A-Z
        || (code >= 97 && code <= 122) // a-z
        || code === 95)               // _
        return CharCategory.Word
    return CharCategory.Other
}

// Unicode 空白码点区间（White_Space 属性的主要范围，不含 ASCII 已处理的）。
const SPACE_RANGES: readonly [number, number][] = [
    [0x00A0, 0x00A0],   // NBSP
    [0x1680, 0x1680],
    [0x2000, 0x200A],
    [0x2028, 0x2029],
    [0x202F, 0x202F],
    [0x205F, 0x205F],
    [0x3000, 0x3000],   // 全角空格
]

// 无大小写的文字区间（CJK/假名/谚文等，toUpperCase===toLowerCase 故需显式列出）。
const LETTER_RANGES: readonly [number, number][] = [
    [0x00C0, 0x00FF],   // Latin-1 补充（含带重音字母，部分有大小写但保险起见）
    [0x0100, 0x017F],   // Latin Extended-A
    [0x0180, 0x024F],   // Latin Extended-B
    [0x0250, 0x02AF],   // IPA
    [0x0370, 0x03FF],   // Greek
    [0x0400, 0x04FF],   // Cyrillic
    [0x0530, 0x058F],   // Armenian
    [0x0590, 0x05FF],   // Hebrew
    [0x0600, 0x06FF],   // Arabic
    [0x0700, 0x074F],   // Syriac
    [0x0750, 0x077F],   // Arabic Supplement
    [0x0780, 0x07BF],   // Thaana
    [0x0900, 0x097F],   // Devanagari
    [0x0980, 0x09FF],   // Bengali
    [0x0A00, 0x0A7F],   // Gurmukhi
    [0x0A80, 0x0AFF],   // Gujarati
    [0x0B00, 0x0B7F],   // Oriya
    [0x0B80, 0x0BFF],   // Tamil
    [0x0C00, 0x0C7F],   // Telugu
    [0x0C80, 0x0CFF],   // Kannada
    [0x0D00, 0x0D7F],   // Malayalam
    [0x0E00, 0x0E7F],   // Thai
    [0x0E80, 0x0EFF],   // Lao
    [0x0F00, 0x0FFF],   // Tibetan
    [0x1000, 0x109F],   // Myanmar
    [0x10A0, 0x10FF],   // Georgian
    [0x3040, 0x309F],   // Hiragana
    [0x30A0, 0x30FF],   // Katakana
    [0x3400, 0x4DBF],   // CJK Ext A
    [0x4E00, 0x9FFF],   // CJK 基本
    [0xA000, 0xA48F],   // Yi
    [0xAC00, 0xD7AF],   // Hangul 音节
    [0xF900, 0xFAFF],   // CJK 兼容
    [0xFB00, 0xFB4F],   // Alphabetic Presentation Forms
    [0x10000, 0x1EFFF], // SMP 字母/古文字（线性B、古文字等）。排除 0x1F000+ 的 emoji/符号/麻将平面——那些非字母，否则词级移动会把 emoji 并进词。
    [0x20000, 0x2A6DF], // CJK Ext B
    [0x2A700, 0x2B73F], // CJK Ext C
    [0x2B740, 0x2B81F], // CJK Ext D
]

// 十进制数字区间（Nd 属性，除 ASCII 0-9 已处理外）。
const NUMBER_RANGES: readonly [number, number][] = [
    [0x0660, 0x0669],   // Arabic-Indic
    [0x06F0, 0x06F9],   // Extended Arabic-Indic
    [0x07C0, 0x07C9],   // NKo
    [0x0966, 0x096F],   // Devanagari
    [0x09E6, 0x09EF],   // Bengali
    [0x0A66, 0x0A6F],   // Gurmukhi
    [0x0AE6, 0x0AEF],   // Gujarati
    [0x0B66, 0x0B6F],   // Oriya
    [0x0BE6, 0x0BEF],   // Tamil
    [0x0C66, 0x0C6F],   // Telugu
    [0x0CE6, 0x0CEF],   // Kannada
    [0x0D66, 0x0D6F],   // Malayalam
    [0x0DE6, 0x0DEF],   // Sinhala Lith
    [0x0E50, 0x0E59],   // Thai
    [0x0ED0, 0x0ED9],   // Lao
    [0x0F20, 0x0F29],   // Tibetan
    [0x1040, 0x1049],   // Myanmar
    [0x1090, 0x1099],   // Myanmar Shan
    [0xFF10, 0xFF19],   // 全角数字
]

function inRanges(code: number, ranges: readonly [number, number][]): boolean {
    let lo = 0, hi = ranges.length - 1
    while (lo <= hi) {
        const mid = (lo + hi) >> 1
        const [start, end] = ranges[mid]
        if (code < start) hi = mid - 1
        else if (code > end) lo = mid + 1
        else return true
    }
    return false
}

// 有大小写差异 → 字母（覆盖 Latin/Greek/Cyrillic 等有大小写的文字）。
function hasCase(ch: string): boolean {
    return ch.toUpperCase() !== ch.toLowerCase()
}

export function categorizeCodePoint(code: number, ch: string, extraWordChars?: ReadonlySet<string>): CharCategory {
    if (code < 0x80) {
        const base = categorizeASCII(code)
        // ASCII 标点可能是 extraWordChars（如 -），需在 Other 时回查。
        if (base === CharCategory.Other && extraWordChars && extraWordChars.has(ch))
            return CharCategory.Word
        return base
    }
    if (inRanges(code, SPACE_RANGES))
        return CharCategory.Space
    if (inRanges(code, NUMBER_RANGES) || inRanges(code, LETTER_RANGES) || hasCase(ch))
        return CharCategory.Word
    if (extraWordChars && extraWordChars.has(ch))
        return CharCategory.Word
    return CharCategory.Other
}

export type CharCategorizer = (char: string) => CharCategory

export function makeCategorizer(wordChars: string): CharCategorizer {
    const extra = wordChars.length ? new Set(wordChars) : undefined
    return (char: string) => {
        const code = char.codePointAt(0) ?? 0
        return categorizeCodePoint(code, char, extra)
    }
}
