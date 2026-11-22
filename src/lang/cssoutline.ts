// CSS / SCSS / LESS document symbols:照 vscode-css-languageservice 的 findSymbolInformations
// (Monaco 0.52 css worker 的 findDocumentSymbols 绑的就是它,结果是扁平列表)。
//
// collectDocumentSymbols 收的节点(先序):
//   - RuleSet:每个选择器一条,范围 = 选择器起点 … 规则集末尾;
//   - VariableDeclaration(SCSS `$x: …`、LESS `@x: …`):范围 = 整个声明(不含分号);
//   - MixinDeclaration(SCSS `@mixin`、LESS `.m(…) {`)、FunctionDeclaration(SCSS `@function`);
//   - Keyframe(`@keyframes`)、FontFace(`@font-face`)、Media(`@media`):范围 = 整个 at-rule。
// @supports / @layer / @container / @include / 控制语句 等不收,但体内的规则集照收;
// 未知 at-rule 原样吞掉(语言服务不解析它的体)。只做 outline 用得到的结构,不做完整 CSS 语法。

import type { DocSymbol } from './outline'

type Tok = { t: string, s: number, e: number, v: string }

const PUNCT = new Set(['{', '}', ';', ',', ':', '(', ')', '[', ']'])

function tokenize(text: string, lang: string): Tok[] {
    const out: Tok[] = []
    const len = text.length
    const lineComments = lang !== 'css'
    const interp = lang === 'scss' ? '#' : lang === 'less' ? '@' : ''
    let i = 0
    // `#{…}` / `@{…}` 插值:吃到配对的 `}`
    const skipInterp = (j: number) => {
        let depth = 0
        for (; j < len; j++) {
            const c = text[j]
            if (c === '{') depth++
            else if (c === '}' && --depth === 0) return j + 1
        }
        return len
    }
    const isWordStop = (c: string) => c <= ' ' || PUNCT.has(c) || c === '"' || c === "'"
    while (i < len) {
        const c = text[i]
        if (c <= ' ') { i++; continue }
        if (c === '/' && text[i + 1] === '*') {
            const e = text.indexOf('*/', i + 2)
            i = e < 0 ? len : e + 2
            continue
        }
        if (lineComments && c === '/' && text[i + 1] === '/') {
            while (i < len && text[i] !== '\n') i++
            continue
        }
        if (c === '"' || c === "'") {
            const s = i++
            while (i < len && text[i] !== c && text[i] !== '\n') i += text[i] === '\\' ? 2 : 1
            if (text[i] === c) i++
            out.push({ t: 'str', s, e: Math.min(i, len), v: '' })
            continue
        }
        if (interp && c === interp && text[i + 1] === '{') {
            const s = i
            i = skipInterp(i)
            while (i < len && !isWordStop(text[i])) i = interp && text[i] === interp && text[i + 1] === '{' ? skipInterp(i) : i + 1
            out.push({ t: 'word', s, e: i, v: text.slice(s, i) })
            continue
        }
        if (PUNCT.has(c)) {
            out.push({ t: c, s: i, e: i + 1, v: c })
            i++
            continue
        }
        const s = i
        // url(…) 不带引号时里面的 `//`、`;` 都是值
        if (/^url\(/i.test(text.slice(i, i + 4)) && text[i + 4] !== '"' && text[i + 4] !== "'") {
            const e = text.indexOf(')', i)
            i = e < 0 ? len : e + 1
            out.push({ t: 'word', s, e: i, v: text.slice(s, i) })
            continue
        }
        i++
        while (i < len && !isWordStop(text[i]) && !(text[i] === '/' && (text[i + 1] === '*' || (lineComments && text[i + 1] === '/')))) {
            if (interp && text[i] === interp && text[i + 1] === '{') i = skipInterp(i)
            else i++
        }
        const v = text.slice(s, i)
        out.push({ t: c === '@' && v.length > 1 ? 'at' : 'word', s, e: i, v })
    }
    return out
}

const KEYFRAMES = /^@(-(webkit|ms|moz|o)-)?keyframes$/i
// 体内是规则集 / 声明、自身不进 outline 的 at-rule
const BLOCK_AT = new Set(['@supports', '@layer', '@container', '@document', '@-moz-document', '@page', '@viewport', '@-ms-viewport', '@property', '@starting-style', '@scope'])
const SCSS_BLOCK_AT = new Set(['@include', '@each', '@for', '@if', '@else', '@while', '@content'])
// 到分号为止的语句
const STMT_AT = new Set(['@import', '@import-once', '@charset', '@namespace', '@use', '@forward', '@extend', '@debug', '@warn', '@error', '@return', '@plugin'])

export function cssSymbols(text: string, lang: string): DocSymbol[] {
    const toks = tokenize(text, lang)
    const n = toks.length
    const out: DocSymbol[] = []
    const add = (from: number, to: number) => out.push({ from, to, sel: from })
    const scss = lang === 'scss', less = lang === 'less'

    // 从 i 往后找深度 0 的第一个 stop 之一(圆括号 / 方括号 / 花括号内部不算);找不到 → n
    const findTop = (i: number, stops: string): number => {
        let depth = 0
        for (; i < n; i++) {
            const t = toks[i].t
            if (t === '(' || t === '[') depth++
            else if (t === ')' || t === ']') depth = Math.max(0, depth - 1)
            else if (depth === 0 && stops.includes(t)) return i
        }
        return n
    }
    // i 指向 `{`:返回配对 `}` 之后的下标
    const skipBlock = (i: number): number => {
        let depth = 0
        for (; i < n; i++) {
            if (toks[i].t === '{') depth++
            else if (toks[i].t === '}' && --depth === 0) return i + 1
        }
        return n
    }
    // 下标 i 之前最后一个 token 的末尾(节点范围到这里为止)
    const endOf = (i: number) => toks[Math.min(i, n) - 1]?.e ?? 0
    // 声明 / 变量的值:到深度 0 的 `;` 或 `}` 为止,值里的 `{…}`(LESS detached ruleset、自定义属性)整块跳过
    const valueEnd = (i: number): number => {
        let depth = 0
        for (; i < n; i++) {
            const t = toks[i].t
            if (t === '(' || t === '[') depth++
            else if (t === ')' || t === ']') depth = Math.max(0, depth - 1)
            else if (t === '{') { i = skipBlock(i) - 1 }
            else if (depth === 0 && (t === ';' || t === '}')) return i
        }
        return n
    }
    // `{` 体:i 指向 `{`;返回 `}` 之后的下标
    const body = (i: number, ctx: 'top' | 'rule' | 'keyframes'): number => {
        const j = items(i + 1, ctx)
        return j < n && toks[j].t === '}' ? j + 1 : j
    }
    // 规则集:i 是选择器第一个 token,b 是 `{`
    const ruleset = (i: number, b: number): number => {
        const end = body(b, 'rule')
        const to = endOf(end)
        let s = i, depth = 0
        for (let k = i; k <= b; k++) {
            const t = toks[k].t
            if (t === '(' || t === '[') depth++
            else if (t === ')' || t === ']') depth = Math.max(0, depth - 1)
            else if (k === b || (t === ',' && depth === 0)) {
                if (k > s) add(toks[s].s, to)
                s = k + 1
            }
        }
        return end
    }
    const items = (i: number, ctx: 'top' | 'rule' | 'keyframes'): number => {
        while (i < n) {
            const tok = toks[i]
            if (tok.t === '}') return i
            if (tok.t === ';' || tok.t === ',' || tok.t === ')' || tok.t === ']') { i++; continue }
            if (ctx === 'keyframes') {
                // 关键帧选择器(from / to / 50%)不是规则集;体内照常
                const b = findTop(i, '{;}')
                if (b >= n || toks[b].t !== '{') { i = b < n && toks[b].t === ';' ? b + 1 : b; continue }
                i = body(b, 'rule')
                continue
            }
            if (tok.t === 'at') {
                const name = tok.v.toLowerCase()
                // LESS 变量 `@x: …`
                if (less && toks[i + 1]?.t === ':') {
                    const e = valueEnd(i + 2)
                    add(tok.s, endOf(e))
                    i = e
                    continue
                }
                if (STMT_AT.has(name)) { i = valueEnd(i + 1); continue }
                const b = findTop(i + 1, '{;}')
                const hasBody = b < n && toks[b].t === '{'
                if (scss && name === '@at-root') {
                    if (hasBody) { i = ruleset(i, b); continue }
                }
                const collected = name === '@media' || KEYFRAMES.test(name) || name === '@font-face' ||
                    (scss && (name === '@mixin' || name === '@function'))
                const known = collected || BLOCK_AT.has(name) || (scss && SCSS_BLOCK_AT.has(name))
                if (!known) {
                    // 未知 at-rule:吞到分号或第一个配对的花括号块
                    i = hasBody ? skipBlock(b) : (b < n && toks[b].t === ';' ? b + 1 : b)
                    continue
                }
                if (!hasBody) { i = b < n && toks[b].t === ';' ? b + 1 : b; continue }
                const end = body(b, KEYFRAMES.test(name) ? 'keyframes' : name === '@media' || BLOCK_AT.has(name) ? ctx : 'rule')
                if (collected) add(tok.s, endOf(end))
                i = end
                continue
            }
            // SCSS 变量 `$x: …`
            if (scss && tok.t === 'word' && tok.v.startsWith('$') && toks[i + 1]?.t === ':') {
                const e = valueEnd(i + 2)
                add(tok.s, endOf(e))
                i = e
                continue
            }
            // 自定义属性 `--x: …`:值里可以有花括号
            if (ctx === 'rule' && tok.t === 'word' && tok.v.startsWith('--') && toks[i + 1]?.t === ':') {
                i = valueEnd(i + 2)
                continue
            }
            // SCSS 嵌套属性 `font: { family: x }` / `font: bold { … }`:是声明不是规则集
            // (冒号紧跟属性名、后面是空白或 `{`;`a:hover {` 的冒号后紧跟标识符)
            if (scss && ctx === 'rule' && tok.t === 'word' && toks[i + 1]?.t === ':' && toks[i + 1].s === tok.e &&
                (toks[i + 2]?.t === '{' || (toks[i + 2] && toks[i + 2].s > toks[i + 1].e))) {
                const b = findTop(i + 2, '{;}')
                i = b < n && toks[b].t === '{' ? skipBlock(b) : b < n && toks[b].t === ';' ? b + 1 : b
                continue
            }
            const b = findTop(i, '{;}')
            if (b >= n || toks[b].t !== '{') {
                // 声明 / mixin 调用 / 垃圾:到分号为止
                i = b < n && toks[b].t === ';' ? b + 1 : b
                continue
            }
            // LESS mixin 声明 `.m(…) [when …] {`:整个算一条
            if (less && tok.t === 'word' && /^[.#]/.test(tok.v) && toks[i + 1]?.t === '(' && toks[i + 1].s === tok.e) {
                const end = body(b, 'rule')
                add(tok.s, endOf(end))
                i = end
                continue
            }
            i = ruleset(i, b)
        }
        return i
    }
    let i = 0
    while (i < n) {
        i = items(i, 'top')
        if (i < n && toks[i].t === '}') i++ // 顶层多出来的 `}`:跳过(语言服务按错误恢复吞掉)
    }
    return out
}
