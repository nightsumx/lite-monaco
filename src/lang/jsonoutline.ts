// JSON document symbols:照 vscode-json-languageservice(Monaco 0.52 json worker 的 findDocumentSymbols2)。
//
// 解析照它的 parse(jsonc-parser 扫描器 + 带容错的递归下降,注释、尾逗号都认),只留 outline 要的位置:
// 属性节点 = 键起点 … 值末尾;数组元素 = 值本身。outline:对象的每个有值属性(range = 属性,
// selectionRange = 键)、数组的每个元素(range = selectionRange = 元素),递归到值里;根本身不算。
// keybindings.json 的特例(Monaco 按 URI 判断)不做。

import type { DocSymbol } from './outline'
import { PositionOffsetTransformer } from '../core/model/posoffset'

// 扫描器 token(jsonc-parser SyntaxKind)
const OPEN_BRACE = 1, CLOSE_BRACE = 2, OPEN_BRACKET = 3, CLOSE_BRACKET = 4, COMMA = 5, COLON = 6
const NULL = 7, TRUE = 8, FALSE = 9, STRING = 10, NUMBER = 11, UNKNOWN = 16, EOF = 17

const isWs = (c: number) => c === 32 || c === 9 || c === 11 || c === 12 || c === 160 || c === 5760 || (c >= 8192 && c <= 8203) || c === 8239 || c === 8287 || c === 12288 || c === 65279
const isLb = (c: number) => c === 10 || c === 13 || c === 8232 || c === 8233
const isDigit = (c: number) => c >= 48 && c <= 57

interface JsonNode {
    type: 'object' | 'array' | 'property' | 'value'
    offset: number
    length: number
    items?: JsonNode[]
    properties?: JsonNode[]
    keyNode?: JsonNode
    valueNode?: JsonNode
}

/** jsonc 扫描 + vscode-json-languageservice parse 的容错规则;返回根值(没有 → undefined) */
export function parseJsonTree(text: string): JsonNode | undefined {
    const len = text.length
    let pos = 0, token = UNKNOWN, tokenOffset = 0
    // 一个 token(含 trivia:12/13 注释、14 换行、15 空白)
    const scanRaw = (): number => {
        tokenOffset = pos
        if (pos >= len) { tokenOffset = len; return token = EOF }
        const code = text.charCodeAt(pos)
        if (isWs(code)) { while (isWs(text.charCodeAt(pos))) pos++; return token = 15 }
        if (isLb(code)) { pos++; if (code === 13 && text.charCodeAt(pos) === 10) pos++; return token = 14 }
        switch (code) {
            case 123: pos++; return token = OPEN_BRACE
            case 125: pos++; return token = CLOSE_BRACE
            case 91: pos++; return token = OPEN_BRACKET
            case 93: pos++; return token = CLOSE_BRACKET
            case 58: pos++; return token = COLON
            case 44: pos++; return token = COMMA
            case 34: {
                pos++
                while (pos < len) {
                    const ch = text.charCodeAt(pos)
                    if (ch === 34) { pos++; break }
                    if (ch === 92) { pos += 2; continue }
                    if (isLb(ch)) break
                    pos++
                }
                if (pos > len) pos = len
                return token = STRING
            }
            case 47:
                if (text.charCodeAt(pos + 1) === 47) {
                    pos += 2
                    while (pos < len && !isLb(text.charCodeAt(pos))) pos++
                    return token = 12
                }
                if (text.charCodeAt(pos + 1) === 42) {
                    pos += 2
                    let closed = false
                    while (pos < len - 1) {
                        if (text.charCodeAt(pos) === 42 && text.charCodeAt(pos + 1) === 47) { pos += 2; closed = true; break }
                        pos++
                    }
                    if (!closed) pos++
                    return token = 13
                }
                pos++
                return token = UNKNOWN
            case 45:
                pos++
                if (pos === len || !isDigit(text.charCodeAt(pos))) return token = UNKNOWN
            // falls through
            case 48: case 49: case 50: case 51: case 52: case 53: case 54: case 55: case 56: case 57: {
                if (text.charCodeAt(pos) === 48) pos++
                else { pos++; while (pos < len && isDigit(text.charCodeAt(pos))) pos++ }
                if (pos < len && text.charCodeAt(pos) === 46) {
                    pos++
                    if (pos < len && isDigit(text.charCodeAt(pos))) while (pos < len && isDigit(text.charCodeAt(pos))) pos++
                    else return token = NUMBER
                }
                if (pos < len && (text.charCodeAt(pos) === 69 || text.charCodeAt(pos) === 101)) {
                    const e = pos
                    pos++
                    if (text.charCodeAt(pos) === 43 || text.charCodeAt(pos) === 45) pos++
                    if (pos < len && isDigit(text.charCodeAt(pos))) while (pos < len && isDigit(text.charCodeAt(pos))) pos++
                    else pos = Math.max(e, pos) // 指数残缺:jsonc 停在已扫到的位置
                }
                return token = NUMBER
            }
        }
        // 未知内容:一直吃到分隔符;是 true / false / null 就是字面量
        while (pos < len) {
            const c = text.charCodeAt(pos)
            if (isWs(c) || isLb(c) || c === 125 || c === 93 || c === 123 || c === 91 || c === 34 || c === 58 || c === 44 || c === 47) break
            pos++
        }
        if (tokenOffset !== pos) {
            const v = text.slice(tokenOffset, pos)
            return token = v === 'true' ? TRUE : v === 'false' ? FALSE : v === 'null' ? NULL : UNKNOWN
        }
        pos++
        return token = UNKNOWN
    }
    const next = (): number => {
        for (;;) {
            const t = scanRaw()
            if (t < 12 || t > 15) return t
        }
    }
    const tokenEnd = () => pos
    // 读当前 token 用函数:next() 会改它,直接读变量 TS 会按上一次比较收窄类型
    const tk = (): number => token
    let px: PositionOffsetTransformer | undefined // 只有 key/value 同行判断才用,惰性建
    const lineOf = (off: number) => (px ??= new PositionOffsetTransformer(text)).getPosition(off).lineNumber - 1
    const finalize = (node: JsonNode, scanNext: boolean) => {
        node.length = tokenEnd() - node.offset
        if (scanNext) next()
        return node
    }
    // _error:可选收尾节点,再按 skipUntilAfter / skipUntil 跳 token
    const error = (node: JsonNode | undefined, skipUntilAfter: number[] = [], skipUntil: number[] = []) => {
        if (node) finalize(node, false)
        if (skipUntilAfter.length + skipUntil.length > 0) {
            let t = tk()
            while (t !== EOF) {
                if (skipUntilAfter.includes(t)) { next(); break }
                if (skipUntil.includes(t)) break
                t = next()
            }
        }
        return node
    }
    const parseArray = (): JsonNode | undefined => {
        if (tk() !== OPEN_BRACKET) return undefined
        const node: JsonNode = { type: 'array', offset: tokenOffset, length: 0, items: [] }
        next()
        let needsComma = false
        while (tk() !== CLOSE_BRACKET && tk() !== EOF) {
            if (tk() === COMMA) {
                next()
                if (tk() === CLOSE_BRACKET) continue
            }
            const item = parseValue()
            if (!item) error(undefined, [], [CLOSE_BRACKET, COMMA])
            else node.items!.push(item)
            needsComma = true
        }
        void needsComma
        if (tk() !== CLOSE_BRACKET) return error(node)
        return finalize(node, true)
    }
    const parseString = (): JsonNode | undefined => {
        if (tk() !== STRING) return undefined
        return finalize({ type: 'value', offset: tokenOffset, length: 0 }, true)
    }
    const parseProperty = (): JsonNode | undefined => {
        const node: JsonNode = { type: 'property', offset: tokenOffset, length: 0 }
        let key = parseString()
        if (!key) {
            if (tk() !== UNKNOWN) return undefined
            // 键没加引号:报错但照样当键
            key = { type: 'value', offset: tokenOffset, length: tokenEnd() - tokenOffset }
            next()
        }
        node.keyNode = key
        if (tk() === COLON) next()
        else if (tk() === STRING && lineOf(key.offset + key.length) < lineOf(tokenOffset)) {
            node.length = key.length
            return node
        }
        const value = parseValue()
        if (!value) return error(node, [], [CLOSE_BRACE, COMMA])
        node.valueNode = value
        node.length = value.offset + value.length - node.offset
        return node
    }
    const parseObject = (): JsonNode | undefined => {
        if (tk() !== OPEN_BRACE) return undefined
        const node: JsonNode = { type: 'object', offset: tokenOffset, length: 0, properties: [] }
        next()
        while (tk() !== CLOSE_BRACE && tk() !== EOF) {
            if (tk() === COMMA) {
                next()
                if (tk() === CLOSE_BRACE) continue
            }
            const property = parseProperty()
            if (!property) error(undefined, [], [CLOSE_BRACE, COMMA])
            else node.properties!.push(property)
        }
        if (tk() !== CLOSE_BRACE) return error(node)
        return finalize(node, true)
    }
    const parseValue = (): JsonNode | undefined => {
        const a = parseArray() ?? parseObject() ?? parseString()
        if (a) return a
        if (tk() === NUMBER || tk() === TRUE || tk() === FALSE || tk() === NULL)
            return finalize({ type: 'value', offset: tokenOffset, length: 0 }, true)
        return undefined
    }
    next()
    return tk() !== EOF ? parseValue() : undefined
}

/** findDocumentSymbols2:对象属性 / 数组元素的树 */
export function jsonSymbols(text: string): DocSymbol[] {
    const root = parseJsonTree(text)
    if (!root) return []
    const out: DocSymbol[] = []
    // 广度优先(同原实现;顺序不影响结果,sticky 会重排)
    const toVisit: { node: JsonNode, result: DocSymbol[] }[] = [{ node: root, result: out }]
    for (let i = 0; i < toVisit.length; i++) {
        const { node, result } = toVisit[i]
        if (node.type === 'array') {
            for (const item of node.items!) {
                const sym: DocSymbol = { from: item.offset, to: item.offset + item.length, sel: item.offset, children: [] }
                result.push(sym)
                toVisit.push({ node: item, result: sym.children! })
            }
        }
        else if (node.type === 'object') {
            for (const p of node.properties!) {
                if (!p.valueNode) continue
                const sym: DocSymbol = { from: p.offset, to: p.offset + p.length, sel: p.keyNode!.offset, children: [] }
                result.push(sym)
                toVisit.push({ node: p.valueNode, result: sym.children! })
            }
        }
    }
    return out
}
