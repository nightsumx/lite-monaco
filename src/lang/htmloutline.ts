// HTML document symbols:照 vscode-html-languageservice(Monaco 0.52 html worker)。
//
// worker 的 findDocumentSymbols 先建元素树(findDocumentSymbols2),再按先序摊平成 SymbolInformation,
// 交给 Monaco 时不带层级 —— 所以 outline 是扁平的,每个元素一条,范围 = 元素起点 … 元素末尾。
// 解析照它的 scanner(emitPseudoCloseTags)+ parser:不做 HTML5 的隐式闭合,只认 void 元素表;
// 结束标签往上找同名祖先,中间没闭合的都结束在这个结束标签前;<script>/<style> 内容是原始文本
// (type 是 text/html、text/x-handlebars-template 的 <script> 例外,当 HTML 解析)。

import type { DocSymbol } from './outline'

// html5 数据里 void: true 的标签
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'])
const SCRIPT_AS_HTML = new Set(['text/x-handlebars-template', 'text/html'])

interface HNode { start: number, end: number, tag?: string, children: HNode[], parent?: HNode }

const enum S { Content, Comment, Doctype, AfterOpenStart, AfterOpenEnd, WithinStartTag, WithinEndTag, AfterAttrName, BeforeAttrValue, Script, Style }

const ELEMENT_NAME = /[_:\w][_:\w\-.\d]*/y
const ATTR_NAME = /[^\s"'></=\x00-\x0F\x7F\x80-\x9F]*/y
const ATTR_VALUE = /[^\s"'`=<>]+/y
const SCRIPT_SCAN = /<!--|-->|<\/?script\s*\/?>?/gi
const STYLE_END = /<\/style/gi
const isWs = (c: number) => c === 32 || c === 9 || c === 10 || c === 12 || c === 13

export function parseHtmlTree(text: string): HNode[] {
    const len = text.length
    let pos = 0
    let state = S.Content
    let lastTag = '', lastAttr: string | undefined, lastType: string | undefined, spaceAfterTag = false
    const sticky = (re: RegExp) => { re.lastIndex = pos; const m = re.exec(text); if (m) pos = re.lastIndex; return m ? m[0] : '' }
    const skipWs = () => { const p = pos; while (pos < len && isWs(text.charCodeAt(pos))) pos++; return pos > p }
    const untilChar = (ch: string) => { const i = text.indexOf(ch, pos); pos = i < 0 ? len : i; return i >= 0 }
    const untilStr = (s: string) => { const i = text.indexOf(s, pos); pos = i < 0 ? len : i }

    const root: HNode = { start: 0, end: len, children: [] }
    let curr = root
    let endTagStart = -1
    let endTagName: string | undefined

    // 一个 token;返回 [类型, 起点];类型用字符串,只处理 parser 关心的几种
    let tokOff = 0
    const scan = (): string => {
        for (;;) {
            tokOff = pos
            if (pos >= len) return 'eos'
            const t = inner()
            if (t === 'again') continue
            // 没前进(伪闭合除外)→ 吞一个字符
            if (pos === tokOff && t !== 'startTagClose' && t !== 'endTagClose') { pos++; return 'unknown' }
            return t
        }
    }
    const inner = (): string => {
        switch (state) {
            case S.Comment:
                if (text.startsWith('-->', pos)) { pos += 3; state = S.Content; return 'x' }
                untilStr('-->')
                return 'x'
            case S.Doctype:
                if (text[pos] === '>') { pos++; state = S.Content; return 'x' }
                untilChar('>')
                return 'x'
            case S.Content:
                if (text[pos] === '<') {
                    pos++
                    if (pos < len && text[pos] === '!') {
                        if (text.startsWith('!--', pos)) { pos += 3; state = S.Comment; return 'x' }
                        if (/^!doctype/i.test(text.slice(pos, pos + 8))) { pos += 8; state = S.Doctype; return 'x' }
                    }
                    if (text[pos] === '/') { pos++; state = S.AfterOpenEnd; return 'endTagOpen' }
                    state = S.AfterOpenStart
                    return 'startTagOpen'
                }
                untilChar('<')
                return 'x'
            case S.AfterOpenEnd: {
                const name = sticky(ELEMENT_NAME)
                if (name) { state = S.WithinEndTag; endTagName = name.toLowerCase(); return 'endTag' }
                if (skipWs()) return 'x'
                state = S.WithinEndTag
                untilChar('>')
                return pos > tokOff ? 'x' : 'again'
            }
            case S.WithinEndTag:
                if (skipWs()) return 'x'
                if (text[pos] === '>') { pos++; state = S.Content; return 'endTagClose' }
                if (text[pos] === '<') { state = S.Content; return 'endTagClose' }
                break
            case S.AfterOpenStart: {
                lastTag = sticky(ELEMENT_NAME).toLowerCase()
                lastType = undefined
                lastAttr = undefined
                if (lastTag) { spaceAfterTag = false; state = S.WithinStartTag; curr.tag = lastTag; return 'startTag' }
                if (skipWs()) return 'x'
                state = S.WithinStartTag
                untilChar('>')
                return pos > tokOff ? 'x' : 'again'
            }
            case S.WithinStartTag:
                if (skipWs()) { spaceAfterTag = true; return 'x' }
                if (spaceAfterTag) {
                    const a = sticky(ATTR_NAME)
                    if (a) { lastAttr = a.toLowerCase(); state = S.AfterAttrName; spaceAfterTag = false; return 'x' }
                }
                if (text.startsWith('/>', pos)) { pos += 2; state = S.Content; return 'selfClose' }
                if (text[pos] === '>') {
                    pos++
                    if (lastTag === 'script') state = lastType && SCRIPT_AS_HTML.has(lastType) ? S.Content : S.Script
                    else if (lastTag === 'style') state = S.Style
                    else state = S.Content
                    return 'startTagClose'
                }
                if (text[pos] === '<') { state = S.Content; return 'startTagClose' }
                pos++
                return 'x'
            case S.AfterAttrName:
                if (skipWs()) { spaceAfterTag = true; return 'x' }
                if (text[pos] === '=') { pos++; state = S.BeforeAttrValue; return 'x' }
                state = S.WithinStartTag
                return 'again'
            case S.BeforeAttrValue: {
                if (skipWs()) return 'x'
                let v = sticky(ATTR_VALUE)
                if (v) {
                    if (text[pos] === '>' && text[pos - 1] === '/') { pos--; v = v.slice(0, -1) }
                    if (lastAttr === 'type') lastType = v
                    if (v) { state = S.WithinStartTag; spaceAfterTag = false; return 'x' }
                }
                const ch = text[pos]
                if (ch === '"' || ch === "'") {
                    pos++
                    if (untilChar(ch)) pos++
                    if (lastAttr === 'type') lastType = text.slice(tokOff + 1, pos - 1)
                    state = S.WithinStartTag
                    spaceAfterTag = false
                    return 'x'
                }
                state = S.WithinStartTag
                spaceAfterTag = false
                return 'again'
            }
            case S.Script: {
                let st = 1
                while (pos < len) {
                    SCRIPT_SCAN.lastIndex = pos
                    const m = SCRIPT_SCAN.exec(text)
                    if (!m) { pos = len; return 'x' }
                    pos = SCRIPT_SCAN.lastIndex
                    const s = m[0]
                    if (s === '<!--') { if (st === 1) st = 2 }
                    else if (s === '-->') st = 1
                    else if (s[1] !== '/') { if (st === 2) st = 3 }
                    else if (st === 3) st = 2
                    else { pos -= s.length; break }
                }
                state = S.Content
                return pos > tokOff ? 'x' : 'again'
            }
            case S.Style: {
                STYLE_END.lastIndex = pos
                const m = STYLE_END.exec(text)
                pos = m ? m.index : len
                state = S.Content
                return pos > tokOff ? 'x' : 'again'
            }
        }
        pos++
        state = S.Content
        return 'x'
    }

    for (let tok = scan(); tok !== 'eos'; tok = scan()) {
        switch (tok) {
            case 'startTagOpen': {
                const child: HNode = { start: tokOff, end: len, children: [], parent: curr }
                curr.children.push(child)
                curr = child
                break
            }
            case 'startTagClose':
                if (curr.parent) {
                    curr.end = pos
                    if (pos > tokOff) {
                        if (curr.tag && VOID.has(curr.tag)) curr = curr.parent
                    }
                    else curr = curr.parent
                }
                break
            case 'selfClose':
                if (curr.parent) { curr.end = pos; curr = curr.parent }
                break
            case 'endTagOpen':
                endTagStart = tokOff
                endTagName = undefined
                break
            case 'endTagClose': {
                let node = curr
                while (node.tag !== endTagName && node.parent) node = node.parent
                // isSameTag:tag 未定义时只和「没有名字的结束标签」相等
                if (node.parent) {
                    while (curr !== node) { curr.end = endTagStart; curr = curr.parent! }
                    curr.end = pos
                    curr = curr.parent!
                }
                break
            }
        }
    }
    while (curr.parent) { curr.end = len; curr = curr.parent }
    return root.children
}

/** 元素树按先序摊平:每个元素一条 */
export function htmlSymbols(text: string): DocSymbol[] {
    const out: DocSymbol[] = []
    const walk = (nodes: HNode[]) => {
        for (const n of nodes) {
            out.push({ from: n.start, to: n.end, sel: n.start })
            walk(n.children)
        }
    }
    walk(parseHtmlTree(text))
    return out
}
