// 一行文本 + 一行 token → 着色 HTML。
// 照搬 Monaco common/viewLayout/viewLineRenderer.ts 里 `colorizeLine` 实际走到的那一部分(MIT,microsoft/vscode,= monaco-editor 0.55.1):
// transformAndRemoveOverflowing、splitLargeTokens、splitLeadingWhitespaceFromRTL、_renderLine 的非空白分支。
// colorizeLine 固定传:不画空白、不画控制字符、无行内装饰、无 faux indent、不截断(stopRenderingLineAfter = -1),
// 所以这些分支在这里不存在;编辑器自己的渲染不走这里(那是 core 的行渲染),这一层只服务 colorize* 这一族静态 API。

import type { IViewLineTokens } from './tokenization'

const LONG_TOKEN = 50

class LinePart {
    constructor(readonly endIndex: number, readonly type: string, readonly containsRTL: boolean) { }
}

// base/common/strings.ts 的 RTL 判定(Unicode R / AL 类)
const CONTAINS_RTL = /(?:[\u05BE\u05C0\u05C3\u05C6\u05D0-\u05F4\u0608\u060B\u060D\u061B-\u064A\u066D-\u066F\u0671-\u06D5\u06E5\u06E6\u06EE\u06EF\u06FA-\u0710\u0712-\u072F\u074D-\u07A5\u07B1-\u07EA\u07F4\u07F5\u07FA\u07FE-\u0815\u081A\u0824\u0828\u0830-\u0858\u085E-\u088E\u08A0-\u08C9\u200F\uFB1D\uFB1F-\uFB28\uFB2A-\uFD3D\uFD50-\uFDC7\uFDF0-\uFDFC\uFE70-\uFEFC]|\uD802[\uDC00-\uDD1B\uDD20-\uDE00\uDE10-\uDE35\uDE40-\uDEE4\uDEEB-\uDF35\uDF40-\uDFFF]|\uD803[\uDC00-\uDD23\uDE80-\uDEA9\uDEAD-\uDF45\uDF51-\uDF81\uDF86-\uDFF6]|\uD83A[\uDC00-\uDCCF\uDD00-\uDD43\uDD4B-\uDFFF]|\uD83B[\uDC00-\uDEBB])/
const IS_BASIC_ASCII = /^[\t\n\r\x20-\x7E]*$/

export const containsRTL = (s: string): boolean => CONTAINS_RTL.test(s)
export const isBasicASCII = (s: string): boolean => IS_BASIC_ASCII.test(s)
/** base/common/strings.ts isFullWidthCharacter:按两列算的字符 */
export const isFullWidthCharacter = (c: number): boolean =>
    (c >= 0x2E80 && c <= 0xD7AF) || (c >= 0xF900 && c <= 0xFAFF) || (c >= 0xFF01 && c <= 0xFF5E)

function transformAndRemoveOverflowing(lineContent: string, lineContainsRTL: boolean, tokens: IViewLineTokens, len: number): LinePart[] {
    const result: LinePart[] = []
    let startOffset = 0
    for (let i = 0, n = tokens.getCount(); i < n; i++) {
        const endIndex = tokens.getEndOffset(i)
        if (endIndex <= 0) continue
        const type = tokens.getClassName(i)
        if (endIndex >= len) {
            result.push(new LinePart(len, type, lineContainsRTL ? containsRTL(lineContent.substring(startOffset, len)) : false))
            break
        }
        result.push(new LinePart(endIndex, type, lineContainsRTL ? containsRTL(lineContent.substring(startOffset, endIndex)) : false))
        startOffset = endIndex
    }
    return result
}

/** 过长的 span 读字符位置很慢(vscode#6885):按 50 字符断开;非 ASCII / 连字时只在空格处断(不能把字形拆开) */
function splitLargeTokens(lineContent: string, tokens: LinePart[], onlyAtSpaces: boolean): LinePart[] {
    let lastTokenEndIndex = 0
    const result: LinePart[] = []
    if (onlyAtSpaces) {
        for (const token of tokens) {
            const tokenEndIndex = token.endIndex
            if (lastTokenEndIndex + LONG_TOKEN < tokenEndIndex) {
                let lastSpaceOffset = -1
                let currTokenStart = lastTokenEndIndex
                for (let j = lastTokenEndIndex; j < tokenEndIndex; j++) {
                    if (lineContent.charCodeAt(j) === 32) lastSpaceOffset = j
                    if (lastSpaceOffset !== -1 && j - currTokenStart >= LONG_TOKEN) {
                        result.push(new LinePart(lastSpaceOffset + 1, token.type, token.containsRTL))
                        currTokenStart = lastSpaceOffset + 1
                        lastSpaceOffset = -1
                    }
                }
                if (currTokenStart !== tokenEndIndex) result.push(new LinePart(tokenEndIndex, token.type, token.containsRTL))
            } else {
                result.push(token)
            }
            lastTokenEndIndex = tokenEndIndex
        }
    } else {
        for (const token of tokens) {
            const tokenEndIndex = token.endIndex
            const diff = tokenEndIndex - lastTokenEndIndex
            if (diff > LONG_TOKEN) {
                const piecesCount = Math.ceil(diff / LONG_TOKEN)
                for (let j = 1; j < piecesCount; j++) result.push(new LinePart(lastTokenEndIndex + j * LONG_TOKEN, token.type, token.containsRTL))
                result.push(new LinePart(tokenEndIndex, token.type, token.containsRTL))
            } else {
                result.push(token)
            }
            lastTokenEndIndex = tokenEndIndex
        }
    }
    return result
}

/** 第一个 token 既有行首空白又有 RTL 文本:把空白切出来(RTL 的 span 不能带前导空白) */
function splitLeadingWhitespaceFromRTL(lineContent: string, tokens: LinePart[]): LinePart[] {
    if (tokens.length === 0) return tokens
    const first = tokens[0]
    if (!first.containsRTL) return tokens
    let firstNonWhitespaceIndex = 0
    for (let i = 0; i < first.endIndex; i++) {
        const c = lineContent.charCodeAt(i)
        if (c !== 32 && c !== 9) { firstNonWhitespaceIndex = i; break }
    }
    if (firstNonWhitespaceIndex === 0) return tokens
    return [new LinePart(firstNonWhitespaceIndex, first.type, false), new LinePart(first.endIndex, first.type, first.containsRTL), ...tokens.slice(1)]
}

/**
 * Monaco `Colorizer.colorizeLine` 的渲染:`<span>` 里一串 `<span class="mtkN …">`,空格 / tab 一律 U+00A0,
 * `< > &` 转义,NUL → `&#00;`,BOM / LS / PS / NEL → U+FFFD,全角字符占两列(影响后面 tab 的补齐)。
 * `lineContent` 为空 → `<span><span></span></span>`。
 */
export function renderColorizedLine(lineContent: string, lineTokens: IViewLineTokens, tabSize: number, mightContainNonBasicASCII = true, mightContainRTL = true): string {
    if (lineContent.length === 0) return '<span><span></span></span>'
    const basic = mightContainNonBasicASCII ? isBasicASCII(lineContent) : true
    const rtl = !basic && mightContainRTL ? containsRTL(lineContent) : false
    const len = lineContent.length
    let parts = transformAndRemoveOverflowing(lineContent, rtl, lineTokens, len)
    parts = rtl ? splitLeadingWhitespaceFromRTL(lineContent, parts) : splitLargeTokens(lineContent, parts, !basic)

    const out: string[] = ['<span>']
    let charIndex = 0
    let visibleColumn = 0
    for (const part of parts) {
        out.push('<span ', part.containsRTL ? 'dir="rtl" style="unicode-bidi:isolate" ' : '', 'class="', part.type, '">')
        let text = ''
        for (; charIndex < part.endIndex; charIndex++) {
            const c = lineContent.charCodeAt(charIndex)
            let width = 1
            switch (c) {
                case 9: { // Tab:补到下一个 tab 位
                    const n = tabSize - (visibleColumn % tabSize)
                    text += ' '.repeat(n)
                    width = n
                    break
                }
                case 32: text += ' '; break
                case 60: text += '&lt;'; break
                case 62: text += '&gt;'; break
                case 38: text += '&amp;'; break
                case 0: text += '&#00;'; break
                case 0xFEFF: case 0x2028: case 0x2029: case 0x85: text += '\uFFFD'; break
                default:
                    if (isFullWidthCharacter(c)) width++
                    text += lineContent.charAt(charIndex)
            }
            visibleColumn += width
        }
        out.push(text, '</span>')
    }
    out.push('</span>')
    return out.join('')
}
