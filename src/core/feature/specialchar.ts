// 特殊字符照 Monaco:控制字符画成看得见的字形(renderControlCharacters,viewLineRenderer),
// 不可见 / 易混字符加框(unicodeHighlight 的 invisibleCharacters + ambiguousCharacters,注释里不画)。词法扫,不解析源码。

import type { DecorationSet } from '../model/decoration'
import type { EditorState } from '../model/state'
import type { Rope } from '../model/rope'
import { Decoration, WidgetType } from '../model/decoration'
import { RangeSetBuilder } from '../model/rangeset'
import { ensureTokenizedRange, lineTokenTypes, selectTokenCache, tokenLinesView, TT_COMMENT, TT_STRING } from '../view/tokens'
import { getOption } from '../options'
import type { HoverSource } from './hover'
import { scanPieces, type ScanWindow } from '../view/scanwindow'

// Monaco strings.InvisibleCharacters(去掉空格、\n、\t)和 AmbiguousCharacters(_common + _default 语言区)的码点,
// 游程编码:[离上一段末尾的距离, 段长] 交替。CONFUSABLE_WITH 按码点顺序给出每个易混字符像的 ASCII 字符
const INVISIBLE_RUNS = [
    11, 3, 113, 1, 32, 1, 12, 1, 673, 1, 716, 1, 2882, 2, 1619, 2, 85, 4, 1196, 2, 835, 16, 26, 6, 47, 17, 1936, 1,
    2047, 1, 355, 1, 52379, 16, 239, 1, 160, 1, 79, 9, 3, 1, 13311, 1, 40310, 8, 798341, 128, 128, 240,
]
const AMBIGUOUS_RUNS = [
    160, 1, 19, 1, 3, 1, 30, 1, 89, 1, 77, 1, 4, 1, 8, 1, 24, 2, 15, 1, 4, 2, 2, 1, 2, 1, 88, 1, 5, 2, 29, 1, 15, 1, 15,
    1, 1, 1, 5, 2, 4, 1, 27, 1, 3, 1, 4, 1, 36, 1, 1, 4, 3, 3, 1, 1, 1, 1, 1, 2, 4, 1, 6, 1, 3, 2, 23, 1, 3, 1, 123, 1,
    5, 1, 3, 2, 4, 1, 12, 2, 2, 3, 1, 2, 1, 2, 1, 1, 1, 1, 2, 2, 1, 1, 9, 1, 1, 1, 5, 1, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1,
    12, 1, 9, 1, 11, 1, 8, 3, 5, 2, 10, 2, 1, 1, 7, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 3, 1, 4, 1, 1, 6, 1, 3, 2, 1, 1, 1, 1,
    8, 1, 1, 2, 1, 1, 1, 1, 15, 2, 1, 1, 8, 1, 18, 2, 56, 2, 11, 1, 1, 1, 2, 1, 14, 1, 16, 1, 32, 1, 10, 1, 14, 3, 47,
    1, 1, 1, 5, 1, 4, 1, 2, 1, 3, 1, 1, 1, 2, 1, 9, 1, 7, 1, 3, 2, 3, 1, 2, 2, 3, 1, 54, 1, 2, 1, 17, 1, 2, 2, 5, 1, 1,
    1, 17, 1, 25, 1, 25, 1, 31, 1, 24, 2, 3, 1, 1, 1, 3, 1, 1, 1, 80, 1, 2, 1, 18, 2, 26, 2, 3, 1, 1, 1, 9, 4, 187, 1,
    9, 1, 41, 2, 4, 1, 264, 1, 98, 1, 22, 1, 104, 1, 3, 1, 2, 1, 120, 2, 2, 1, 24, 1, 98, 1, 28, 1, 28, 1, 69, 1, 1, 1,
    125, 1, 27, 1, 99, 1, 27, 1, 99, 1, 27, 1, 29, 1, 69, 1, 6, 1, 20, 1, 205, 1, 127, 1, 332, 1, 34, 1, 166, 1, 23, 1,
    256, 1, 207, 1, 207, 3, 2, 1, 3, 4, 1, 1, 4, 1, 3, 1, 3, 1, 1, 1, 2, 1, 1, 2, 10, 2, 2, 1, 1, 2, 3, 2, 3, 2, 2, 1,
    3, 2, 6, 1, 4, 2, 11, 1, 46, 1, 3, 1, 4, 1, 17, 1, 1, 1, 32, 1, 1, 1, 2, 1, 26, 1, 28, 1, 20, 1, 129, 1, 58, 2, 9,
    1, 39, 1, 4, 1, 16, 1, 24, 1, 11, 1, 5, 1, 6, 1, 117, 2, 17, 1, 49, 1, 4, 1, 9, 1, 10, 1, 8, 2, 21, 2, 71, 1, 205,
    1, 5, 1, 1274, 1, 10, 1, 1, 1, 10, 1, 3, 3, 3, 1, 92, 1, 8, 1, 272, 1, 97, 1, 189, 4, 46, 1, 13, 2, 1, 11, 5, 4, 4,
    4, 8, 1, 3, 2, 5, 1, 2, 1, 2, 1, 3, 2, 6, 1, 1, 2, 9, 1, 4, 1, 6, 1, 4, 1, 162, 1, 7, 5, 1, 4, 1, 1, 3, 5, 6, 1, 3,
    1, 1, 1, 1, 6, 1, 2, 4, 1, 3, 1, 7, 5, 22, 1, 3, 1, 4, 1, 2, 5, 3, 1, 4, 1, 2, 3, 147, 1, 2, 3, 11, 1, 4, 1, 1, 1,
    11, 1, 5, 1, 103, 1, 28, 1, 1, 1, 59, 1, 115, 2, 5, 1, 130, 1, 371, 1, 1, 1, 500, 2, 4, 2, 2, 4, 31, 2, 52, 1, 1, 1,
    11, 1, 337, 2, 200, 1, 2, 2, 53, 1, 597, 1, 8, 1, 3, 1, 1, 1, 3, 1, 1, 1, 3, 2, 2, 5, 1, 1, 3, 1, 13, 1, 11, 1, 3,
    1, 1, 1, 3, 1, 1, 1, 101, 2, 21, 1, 1, 1, 2, 2, 7, 1, 226, 1, 193, 2, 259, 1, 12, 2, 29, 1, 108, 1, 45, 1, 260, 2,
    7265, 1, 8, 1, 22160, 5, 1, 2, 1, 2, 1, 2, 1, 5, 2, 2, 2, 3, 1, 1, 1, 1, 1, 3, 3, 2, 3, 1, 1, 1, 270, 1, 53, 1, 2,
    1, 151, 1, 11, 1, 3, 1, 65, 1, 40, 1, 15, 1, 3, 1, 9, 1, 16, 1, 2, 1, 11, 2, 5, 1, 11, 1, 6, 3, 893, 1, 2, 1, 7, 1,
    9, 2, 5, 1, 3, 1, 7, 1, 26, 1, 11, 1, 1, 1, 15, 1, 21, 2, 4, 1, 20470, 8, 400, 2, 240, 1, 28, 3, 8, 1, 15, 1, 36, 2,
    90, 4, 20, 94, 137, 1, 665, 1, 3, 2, 2, 1, 5, 1, 1, 1, 2, 3, 3, 1, 4, 3, 2, 1, 5, 1, 4, 3, 1, 1, 26, 1, 37, 1, 11,
    2, 6, 1, 7, 1, 3, 1, 1, 1, 2, 1, 4, 2, 1, 1, 225, 1, 16, 1, 5, 1, 4, 1, 11, 1, 16, 1, 10, 1, 107, 1, 13, 1, 11, 1,
    3, 1, 23, 1, 11, 1, 28, 1, 2, 1, 1, 1, 3, 2, 7, 3, 1320, 1, 2687, 1, 565, 1, 3, 1, 3, 2, 400, 1, 1, 3, 1, 1, 2, 1,
    2, 1, 1, 2, 2, 1, 2, 1, 2, 1, 2, 2, 3, 5, 1, 1, 1, 1, 1, 1, 1, 1, 8, 4, 3, 1, 3, 1, 4, 2, 2, 1, 2, 1, 2, 1, 2, 1,
    22037, 1, 1, 1, 11, 1, 17, 1, 12, 1, 4, 2, 3, 2, 1, 2, 13, 2, 25025, 1, 88, 1, 152, 1, 6, 1, 1, 1, 2, 2, 2, 1, 19,
    1, 11, 2, 2, 2, 452, 85, 1, 4, 1, 51, 1, 14, 1, 2, 2, 1, 2, 2, 2, 4, 1, 12, 1, 1, 1, 5, 1, 1, 1, 49, 1, 15, 1, 4, 2,
    8, 1, 7, 1, 12, 1, 15, 1, 4, 1, 5, 1, 1, 3, 7, 1, 12, 1, 51, 1, 51, 1, 51, 1, 51, 1, 51, 1, 51, 1, 14, 3, 2, 2, 3,
    1, 2, 1, 2, 1, 1, 1, 1, 2, 2, 1, 1, 3, 1, 1, 1, 5, 1, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 9, 1, 1, 2, 2, 3, 1, 2, 1, 2, 1,
    1, 1, 1, 2, 2, 1, 1, 3, 1, 1, 1, 5, 1, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 9, 1, 1, 2, 2, 3, 1, 2, 1, 2, 1, 1, 1, 1, 2, 2,
    1, 1, 3, 1, 1, 1, 5, 1, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 9, 1, 1, 2, 2, 3, 1, 2, 1, 2, 1, 1, 1, 1, 2, 2, 1, 1, 3, 1, 1,
    1, 5, 1, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 9, 1, 1, 2, 2, 3, 1, 2, 1, 2, 1, 1, 1, 1, 2, 2, 1, 1, 3, 1, 1, 1, 5, 1, 3, 1,
    1, 1, 1, 1, 1, 1, 1, 1, 9, 1, 1, 1, 3, 50, 4295, 1, 3, 1, 1332, 1, 35, 1, 63, 1, 27, 1, 3, 1, 2247, 1, 27, 1, 1159,
    10,
]
const CONFUSABLE_WITH =
    ' `,xifbgR235sI!388?agyiiwuy?`````<>^^```:-i~`:`i;J`ABEZHIKMNOPTYXayivopouYF2pcjCMSIJABE3KMHOPCTYXba6reopcyxsij' +
    'wVvYyheIi3dGqWwUSO``wqqhnnugfo:l:lv`lo`,lo.loV,*oo-o.IoV..::Ol``_:o?O89o98:o8OO9oooooooo9oooooyoUODRTiYAJE?WMH' +
    'YGhZ4bRWSVSLCPKd6GB=V><`UPdbJL2xHxRbFADDMBXx <XI`KM:+/::coouvwzrgyfy`i`~```           ----``,`.   ``<>/-/*~: C' +
    'gHHHhIILlNPQRRRZZKBCeeEFMoiyDdeijIVXLCDMivxIcd-/\\*IvU:~TvUEipaI/X()<>(){}+-/\\Txx\\/\\xrHIKMNOoPpCcTYX-/93L6V' +
    'EI!OQX=\\/O()/=//\\\\/BPdDTGKJCZFMNLSRVHWXYAEIOU.,:=.2iV?2s239&:`Ffu3JXBeforruuyirwzvscoooooooo():___-\\lloooo' +
    '!"#$%&`()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~IBEF|XOPST+ABCF' +
    'OMTYXHZBC|MTX8*lXOCLSocsROU7ouNOKCVFLX.OvwwwVFLYEZ9E4LOU5TvsFiz7o3969ouyOZWCXWCVTLIRS3>AUY``{.3V\\7FRL<>/\\ABC' +
    'DEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZabcdefgijklnopqrstuvwxyzABCDEFGHIJK' +
    'LMNOPQRSTUVWXYZabcdefghijklnopqrstuvwxyzACDGJKNOPQSTUVWXYZabcdfhijklnpqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZabcd' +
    'efghijklnopqrstuvwxyzABDEFGJKLMNOPQSTUVWXYabcdefghijkInopqrstuvwxyzABDEFGIJKLMOSTUVWXYabcdefghijkInopqrstuvwxy' +
    'zABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijkInopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijkInopqrstuvwxyzABCDEFG' +
    'HIJKLMNOPQRSTUVWXYZabcdefghijkInopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijkInopqrstuvwxyzABCDEFGHIJKLMNO' +
    'PQRSTUVWXYZabcdefghijkInopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijkInopqrstuvwxyziABEZHIKMNOPTYXayivopou' +
    'pABEZHIKMNOPTYXayivopoupABEZHIKMNOPTYXayivopoupABEZHIKMNOPTYXayivopoupABEZHIKMNOPTYXayivopoupFOI23456789OI2345' +
    '6789OI23456789OI23456789OI23456789l8looloCTOI23456789'

const decodeRuns = (runs: number[]) => {
    const out: number[] = []
    let p = 0
    for (let i = 0; i < runs.length; i += 2) {
        p += runs[i]
        for (let k = 0; k < runs[i + 1]; k++) out.push(p++)
    }
    return out
}
const INVISIBLE = new Set(decodeRuns(INVISIBLE_RUNS))
const AMBIGUOUS = new Map(decodeRuns(AMBIGUOUS_RUNS).map((cp, i) => [cp, CONFUSABLE_WITH.charCodeAt(i)]))

// Monaco AmbiguousCharacters 的语言区:AMBIGUOUS 是 _common + _default,某个语言区(allowedLocales)只是在 _default 里
// 去掉该语言自己用的那几个字符(其余不变,实测 14 个语言区都是 _default 的子集)。多个语言区取交集,即去掉的并起来。
const LOCALE_REMOVED: Record<string, number[]> = {
    cs: [160, 8211, 215], de: [160, 8211, 215], es: [160, 8216, 8217, 921], fr: [160, 8211, 8217, 180], it: [8217],
    ja: [160, 65374, 12494, 65288, 65289, 65311], ko: [160, 8216, 8217], pl: [160, 8211], 'pt-BR': [160, 8211], 'qps-ploc': [1009],
    ru: [160, 8211, 1047, 1073, 1072, 1040, 1068, 1042, 1089, 1057, 1077, 1045, 1053, 1050, 1052, 1086, 1054, 1088, 1056, 1075, 1058, 1093, 1061, 1091, 1059],
    tr: [8216, 8217, 305], 'zh-hans': [160, 8211, 8216, 8217, 65283, 65292, 65307, 65311],
    'zh-hant': [160, 65306, 65281, 8216, 8217, 8245, 65288, 65289, 65292, 65311],
}

/** 解析后的 unicodeHighlight(Monaco resolveOptions:标准环境里工作区受信任,inUntrustedWorkspace 即 false) */
export interface UnicodeOptions {
    nonBasicASCII: boolean
    invisibleCharacters: boolean
    ambiguousCharacters: boolean
    includeComments: boolean
    includeStrings: boolean
    allowedCharacters: ReadonlySet<number>
    /** 已展开 _os / _vscode 的语言区(只有 LOCALE_REMOVED 里有的才有作用) */
    allowedLocales: readonly string[]
    /** renderControlCharacters:false 时控制字符照原样画 */
    renderControlCharacters: boolean
}
export const DEFAULT_UNICODE_OPTIONS: UnicodeOptions = {
    nonBasicASCII: false, invisibleCharacters: true, ambiguousCharacters: true, includeComments: false, includeStrings: true,
    allowedCharacters: new Set(), allowedLocales: [], renderControlCharacters: true,
}
const trusted = (v: unknown, whenUntrusted = true): boolean => v === 'inUntrustedWorkspace' ? !whenUntrusted : !!v

const unicodeCache = new WeakMap<object, UnicodeOptions>()
/** 从 state 读 unicodeHighlight + renderControlCharacters(按选项对象缓存) */
export function unicodeOptionsOf(state: EditorState): UnicodeOptions {
    const raw = getOption(state, 'unicodeHighlight') as Record<string, any> | undefined
    const rc = getOption(state, 'renderControlCharacters') !== false
    if (!raw) return rc ? DEFAULT_UNICODE_OPTIONS : { ...DEFAULT_UNICODE_OPTIONS, renderControlCharacters: false }
    let hit = unicodeCache.get(raw)
    if (hit && hit.renderControlCharacters === rc) return hit
    const chars = new Set<number>()
    for (const k of Object.keys(raw.allowedCharacters ?? {})) { const cp = k.codePointAt(0); if (cp !== undefined) chars.add(cp) }
    // _os 要 new Intl.NumberFormat(首次约 5 ms),而只有文本里真有非 ASCII 字符才会用到语言区:读的时候才算(首屏全 ASCII 的文件不付这笔)
    const localeKeys = Object.keys(raw.allowedLocales ?? {})
    let locales: string[] | null = null
    hit = {
        nonBasicASCII: trusted(raw.nonBasicASCII ?? 'inUntrustedWorkspace'),
        invisibleCharacters: raw.invisibleCharacters !== false,
        ambiguousCharacters: raw.ambiguousCharacters !== false,
        includeComments: trusted(raw.includeComments ?? 'inUntrustedWorkspace'),
        includeStrings: trusted(raw.includeStrings ?? true),
        allowedCharacters: chars,
        get allowedLocales(): readonly string[] {
            if (locales) return locales
            locales = []
            for (const k of localeKeys) {
                if (k === '_os') { try { locales.push(new Intl.NumberFormat().resolvedOptions().locale) } catch { /* 没有 Intl 就跳过 */ } }
                else if (k === '_vscode') { if (typeof navigator !== 'undefined' && navigator.language) locales.push(navigator.language) }
                else locales.push(k)
            }
            return locales
        },
        renderControlCharacters: rc,
    }
    unicodeCache.set(raw, hit)
    return hit
}

/** 当前语言区下哪些 _default 里的字符不算易混(allowedLocales 里有数据的语言区;都没有 = 不去掉) */
function removedByLocales(locales: readonly string[]): ReadonlySet<number> | null {
    const known = locales.filter(l => l in LOCALE_REMOVED)
    if (!known.length) return null
    // 多个语言区取交集:某字符要在每个语言区里都还是易混才算,等于去掉的取并集
    const out = new Set<number>()
    for (const l of known) for (const cp of LOCALE_REMOVED[l]) out.add(cp)
    return out
}

// Monaco isControlCharacter:C0(tab 除外)、DEL、双向格式字符
const isControl = (c: number) => (c < 32 && c !== 9) || c === 0x7F || (c >= 0x202A && c <= 0x202E) || (c >= 0x2066 && c <= 0x2069) || c === 0x200E || c === 0x200F || c === 0x061C
const isBasicAscii = (c: number) => c === 9 || c === 10 || c === 13 || (c >= 32 && c <= 126)
// DEFAULT_WORD_REGEXP:-?\d*\.\d\w* 或者一串既不是分隔符也不是 \s 的字符
const SEPARATORS = '`~!@#$%^&*()-=+[{]}\\|;:\'",.<>/?'
const isSpace = (c: number) => (c >= 9 && c <= 13) || c === 32 || c === 0xA0 || c === 0x1680 || (c >= 0x2000 && c <= 0x200A) || c === 0x2028 || c === 0x2029 || c === 0x202F || c === 0x205F || c === 0x3000 || c === 0xFEFF
const isWordChar = (c: number) => !isSpace(c) && !(c < 128 && SEPARATORS.includes(String.fromCharCode(c)))
const isDigit = (c: number) => c >= 48 && c <= 57
const isW = (c: number) => isDigit(c) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95

function wordEnd(t: string, p: number): number {
    let i = p
    if (t.charCodeAt(i) === 45) i++
    while (isDigit(t.charCodeAt(i))) i++
    if (t.charCodeAt(i) === 46 && isDigit(t.charCodeAt(i + 1))) {
        i += 2
        while (isW(t.charCodeAt(i))) i++
        return i
    }
    i = p
    while (i < t.length && isWordChar(t.charCodeAt(i))) i++
    return i
}

const hex = (cp: number) => `U+${cp.toString(16).padStart(4, '0')}`

// Monaco shouldHighlightNonBasicASCII:所在词里没有基本 ASCII、又有既不易混也不隐形的字符(比如整词是中文)就不标
function reason(cp: number, word: string | null, o: UnicodeOptions, dropped: ReadonlySet<number> | null): string | undefined {
    if (o.allowedCharacters.has(cp)) return undefined
    const ambiguousTo = (c: number) => dropped?.has(c) ? undefined : AMBIGUOUS.get(c)
    if (o.nonBasicASCII) return `The character ${hex(cp)}${INVISIBLE.has(cp) ? '' : ` "${String.fromCodePoint(cp)}"`} is not a basic ASCII character.`
    if (word) {
        let ascii = false, plain = false
        for (const ch of word) {
            const c = ch.codePointAt(0)!
            if (isBasicAscii(c)) ascii = true
            else if (ambiguousTo(c) === undefined && !INVISIBLE.has(c)) plain = true
        }
        if (!ascii && plain) return undefined
    }
    if (o.invisibleCharacters && INVISIBLE.has(cp)) return `The character ${hex(cp)} is invisible.`
    const to = o.ambiguousCharacters ? ambiguousTo(cp) : undefined
    if (to === undefined) return undefined
    return `The character ${hex(cp)} "${String.fromCodePoint(cp)}" could be confused with the ASCII character ${hex(to)} "${String.fromCharCode(to)}", which is more common in source code.`
}

// Monaco 超过 1000 个就一个都不标
const MAX_HIGHLIGHTS = 1000

export interface SpecialChar {
    from: number
    to: number
    /** 画出来的字形;没有就照原字符画 */
    glyph?: string
    /** 控制字符(Monaco .mtkcontrol 的白字红底) */
    control?: boolean
    /** 加框的原因(Monaco 悬停里的那句);没有就不加框 */
    title?: string
}

export function findSpecialChars(text: string, o: UnicodeOptions = DEFAULT_UNICODE_OPTIONS): SpecialChar[] {
    const out: SpecialChar[] = []
    let dropped: ReadonlySet<number> | null | undefined
    let highlights = 0
    // 照 getWordAtText:从左往右找词,第一个起点 <= i 且终点 >= i 的词;终点正好是 i 算没有词
    let ws = 0, we = -1, next = 0
    for (let i = 0; i < text.length; i++) {
        const c = text.charCodeAt(i)
        if (isBasicAscii(c)) continue
        const cp = text.codePointAt(i)!
        const len = cp > 0xFFFF ? 2 : 1
        const control = o.renderControlCharacters && isControl(c)
        const glyph = c === 0xFEFF || c === 0x2028 || c === 0x2029 || c === 0x85 ? '\uFFFD'
            : !control ? undefined
            : c < 32 ? String.fromCharCode(0x2400 + c)
            : c === 0x7F ? '\u2421'
            : `[U+${c.toString(16).toUpperCase().padStart(4, '0')}]`
        let title: string | undefined
        if (o.nonBasicASCII || INVISIBLE.has(cp) || AMBIGUOUS.has(cp)) {
            while (we < i && next < text.length) {
                let p = next
                while (p < text.length && wordEnd(text, p) === p) p++
                ws = p
                we = next = p < text.length ? wordEnd(text, p) : Infinity
            }
            title = reason(cp, ws <= i && i < we ? text.slice(ws, we) : null, o, dropped === undefined ? (dropped = removedByLocales(o.allowedLocales)) : dropped)
            if (title && ++highlights > MAX_HIGHLIGHTS) return out.filter(s => s.glyph).map(s => ({ ...s, title: undefined }))
        }
        if (glyph || title) out.push({ from: i, to: i + len, glyph, control: control || undefined, title })
        i += len - 1
    }
    return out
}

// 框画在 highlightLayer(selectionlayer.ts),和 Monaco 的 cdr overlay 一样满行高、不占字宽。
// 行内文字不包 span:Monaco 的 unicode-highlight 是 className(overlay)装饰,不拆文本节点。包了 span 会把 ZWJ 家庭 emoji
// 拆成三个字形、让 Chrome 在 span 边界上给出不单调的光标列(实测 a😀b👨‍👩‍👧c 之后每一列都错位)。
// 说明文字(Monaco 悬停里那句)走 hover 源 unicodeHoverSource。
interface UnicodeInfo { set: DecorationSet, boxes: { from: number, to: number }[], marks: { from: number, to: number, title: string }[] }
const EMPTY_INFO_BOXES: { from: number, to: number }[] = []

export function unicodeHighlightRanges(state: EditorState, view?: { viewport: { from: number, to: number }, scanWindow?: ScanWindow }): readonly { from: number, to: number }[] {
    return unicodeInfo(state, view).boxes
}

/** 悬停到加框字符上:显示 Monaco 的那句说明(The character U+200b is invisible. …) */
export const unicodeHoverSource: HoverSource = (state, pos, _side, view) => {
    if (!view) return null
    const hits = unicodeInfo(state, view).marks.filter(m => m.from <= pos && pos <= m.to)
    if (!hits.length) return null
    return {
        pos: Math.min(...hits.map(h => h.from)),
        end: Math.max(...hits.map(h => h.to)),
        create: () => {
            const root = document.createElement('div')
            root.className = 'cm-unicode-hover'
            for (const h of hits) {
                const p = document.createElement('div')
                p.textContent = h.title
                root.appendChild(p)
            }
            return root
        },
    }
}

class SpecialCharWidget extends WidgetType {
    constructor(readonly glyph: string, readonly control: boolean, readonly title: string | undefined) { super() }
    eq(other: SpecialCharWidget) { return other.glyph === this.glyph && other.control === this.control && other.title === this.title }
    toDOM(): Node {
        const span = document.createElement('span')
        span.textContent = this.glyph
        if (this.control) span.className = 'cm-controlChar'
        if (this.title) span.title = this.title
        return span
    }
}

function build(doc: Rope, from: number, to: number, owner: object | null, o: UnicodeOptions, win?: ScanWindow): UnicodeInfo {
    // 超长行只扫窗口里那一截(scanwindow.ts);found 的偏移统一成相对 from
    const found: ReturnType<typeof findSpecialChars> = []
    for (const p of scanPieces(doc, from, to, win)) {
        for (const s of findSpecialChars(doc.sliceString(p.from, p.to), o)) found.push({ ...s, from: s.from + p.from - from, to: s.to + p.from - from })
    }
    const b = new RangeSetBuilder<Decoration>()
    if (!found.length) return { set: b.finish(), boxes: EMPTY_INFO_BOXES, marks: [] }
    // 注释里的不加框(Monaco hideInCommentTokens):看这个 view 的 token 缓存,视口行先分好(和高亮是同一段,共用缓存)
    // includeStrings:false 时字符串里的同理(Monaco hideInStringTokens)
    let inComment = (_pos: number) => false
    if (owner && !(o.includeComments && o.includeStrings) && found.some(s => s.title)) {
        selectTokenCache(owner)
        const aligned = () => {
            const v = tokenLinesView()
            return v && v.lines.length === doc.lines && v.lineStart[doc.lines] === doc.length + 1 ? v : null
        }
        if (aligned()) ensureTokenizedRange(doc.lineAt(from).number, doc.lineAt(to).number)
        const v = aligned()
        if (v) inComment = pos => {
            const line = doc.lineAt(pos)
            const types = v.ready[line.number - 1] ? lineTokenTypes(v.rel[line.number - 1]) : undefined
            const k = pos - line.from
            for (let j = 0; types && j < types.length; j += 3)
                if (types[j] <= k && k < types[j + 1]) return (types[j + 2] === TT_COMMENT && !o.includeComments) || (types[j + 2] === TT_STRING && !o.includeStrings)
            return false
        }
    }
    const boxes: { from: number, to: number }[] = []
    const marks: { from: number, to: number, title: string }[] = []
    for (const s of found) {
        const title = s.title && !inComment(from + s.from) ? s.title : undefined
        // 挨着的合成一个框(Monaco 同类名、相接的装饰合并成一块)
        const last = boxes[boxes.length - 1]
        if (title && last?.to === from + s.from) last.to = from + s.to
        else if (title) boxes.push({ from: from + s.from, to: from + s.to })
        if (title) marks.push({ from: from + s.from, to: from + s.to, title })
        if (s.glyph) b.add(from + s.from, from + s.to, Decoration.replace({ widget: new SpecialCharWidget(s.glyph, !!s.control, title) }))
    }
    return { set: b.finish(), boxes, marks }
}

// 有 view 只扫视口里的整行,文档和视口都没变就交回上次的集合(同 lexscan.ts);没有 view 扫全文
const whole = new WeakMap<Rope, { o: UnicodeOptions, info: UnicodeInfo }>()
const byView = new WeakMap<object, { doc: Rope, from: number, to: number, o: UnicodeOptions, win: ScanWindow | undefined, info: UnicodeInfo }>()
export function specialCharDecorations(state: EditorState, view?: { viewport: { from: number, to: number }, scanWindow?: ScanWindow }): DecorationSet {
    return unicodeInfo(state, view).set
}
function unicodeInfo(state: EditorState, view?: { viewport: { from: number, to: number }, scanWindow?: ScanWindow }): UnicodeInfo {
    const doc = state.doc
    const o = unicodeOptionsOf(state)
    if (!view) {
        let hit = whole.get(doc)
        if (!hit || hit.o !== o) whole.set(doc, hit = { o, info: build(doc, 0, doc.length, null, o) })
        return hit.info
    }
    const vp = view.viewport
    const from = doc.lineAt(Math.max(0, Math.min(doc.length, vp.from))).from
    const to = doc.lineAt(Math.max(0, Math.min(doc.length, vp.to))).to
    const hit = byView.get(view)
    const win = view.scanWindow
    if (hit && hit.doc === doc && hit.from === from && hit.to === to && hit.o === o && hit.win === win) return hit.info
    const info = build(doc, from, to, view, o, win)
    byView.set(view, { doc, from, to, o, win, info })
    return info
}
