// #rgb / #rrggbb / #rrggbbaa 色块。词法扫，不解析源码。

import { Decoration } from '../model/decoration'
import { lexicalDecorations } from './lexscan'
import { computeDefaultDocumentColors } from './doccolors'

export interface HexColor { from: number, to: number, color: string }

function isHexChar(ch: string): boolean {
    const o = ch.charCodeAt(0)
    return (o >= 48 && o <= 57) || (o >= 65 && o <= 70) || (o >= 97 && o <= 102)
}

function isWordChar(ch: string): boolean {
    const o = ch.charCodeAt(0)
    return (o >= 48 && o <= 57) || (o >= 65 && o <= 90) || (o >= 97 && o <= 122) || o === 95
}

function expandShort(hex: string): string {
    if (hex.length === 4) {
        return '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3]
    }
    if (hex.length === 5) {
        return '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3] + hex[4] + hex[4]
    }
    return hex
}

export function findHexColors(text: string): HexColor[] {
    const out: HexColor[] = []
    for (let i = 0; i < text.length; i++) {
        if (text[i] !== '#') continue
        if (i > 0 && isWordChar(text[i - 1])) continue
        let n = 0
        while (i + 1 + n < text.length && isHexChar(text[i + 1 + n])) n++
        if (n !== 3 && n !== 4 && n !== 6 && n !== 8) continue
        const next = text[i + 1 + n]
        if (next && isHexChar(next)) continue
        const raw = text.slice(i, i + 1 + n)
        out.push({ from: i, to: i + 1 + n, color: expandShort(raw) })
        i += n
    }
    return out
}

// 有 view 只扫视口(按整行切,行首 # 的前一字符判断不受影响),文档和视口都没变就返回上次的集合(见 lexscan.ts)
export const hexColorDecorations = lexicalDecorations((text, offset, b) => {
    // hex 用 lite 自己的口径(findHexColors);rgb() / rgba() / hsl() / hsla() 取 Monaco 默认文档颜色里的函数式写法
    // (源码片段本身就是合法 CSS 颜色)。RangeSetBuilder 要按起点升序加,所以两类先合并排序
    const found: { from: number, to: number, color: string }[] = findHexColors(text)
    for (const c of computeDefaultDocumentColors(text))
        if (text[c.from] !== '#') found.push({ from: c.from, to: c.to, color: text.slice(c.from, c.to) })
    found.sort((x, y) => x.from - y.from)
    for (const h of found)
        b.add(offset + h.from, offset + h.to, Decoration.mark({
            class: 'cm-hexColor',
            attributes: { style: `border-bottom: 2px solid ${h.color}` },
        }))
})
