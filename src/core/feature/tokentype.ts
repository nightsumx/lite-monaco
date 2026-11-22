// 光标处字符的 StandardTokenType(Monaco quickSuggestions 按它分档:other / comments / strings)。
//
// 数据来源和括号、缩进同一份:高亮时 grammar 留下的 token 类型(view/tokens lineTokenTypes);
// 没留下的行(测试替身、grammar 换了对象)接着该行入口 state 再问一次 grammar 的 scope,
// 按 scope 名里最靠叶子的 comment|string|regex|meta.embedded 定类型(vscode-textmate 同规则,
// meta.template.expression 算代码)。tokens 还没就绪 / 和文档对不上 → Other,不发明信息。

import type { EditorState } from '../model/state'
import { lineTokenTypes, selectTokenCache, tokenLinesView, TT_COMMENT, TT_REGEX, TT_STRING } from '../view/tokens'

export const enum StandardTokenType { Other = 0, Comment = 1, String = 2, RegEx = 3 }

const TOKEN_TYPE_RE = /\b(comment|string|regex|meta\.embedded)\b/
const TEMPLATE_EXPR_RE = /\bmeta\.template\.expression\b/

function scopesType(scopes: readonly string[]): StandardTokenType {
    let t = StandardTokenType.Other
    for (const s of scopes) {
        const m = TOKEN_TYPE_RE.exec(s)
        if (m) t = m[1] === 'comment' ? StandardTokenType.Comment : m[1] === 'string' ? StandardTokenType.String
            : m[1] === 'regex' ? StandardTokenType.RegEx : StandardTokenType.Other
        else if (TEMPLATE_EXPR_RE.test(s)) t = StandardTokenType.Other
    }
    return t
}

interface LineGrammar { tokenizeLine(text: string, stack: unknown): { tokens: { startIndex: number, endIndex: number, scopes: string[] }[] } }

/** owner(通常是 EditorView)的 token 缓存里,pos 前一个字符(Monaco: column - 2,行首取 0)的类型 */
export function tokenTypeBefore(owner: object | null | undefined, state: EditorState, pos: number): StandardTokenType {
    const doc = state.doc
    selectTokenCache(owner)
    const v = tokenLinesView()
    if (!v || v.lines.length !== doc.lines || v.lineStart[doc.lines] !== doc.length + 1) return StandardTokenType.Other
    const line = doc.lineAt(pos)
    const i = line.number - 1
    if (!v.ready[i]) return StandardTokenType.Other
    const off = Math.max(pos - line.from - 1, 0)
    const types = lineTokenTypes(v.rel[i])
    if (types) {
        for (let k = 0; k < types.length; k += 3) {
            if (types[k] <= off && off < types[k + 1])
                return types[k + 2] === TT_COMMENT ? StandardTokenType.Comment
                    : types[k + 2] === TT_STRING ? StandardTokenType.String
                        : types[k + 2] === TT_REGEX ? StandardTokenType.RegEx : StandardTokenType.Other
        }
        return StandardTokenType.Other
    }
    try {
        const g = (v.hl as { getLanguage?: (l: string) => LineGrammar }).getLanguage?.(v.lang)
        if (typeof g?.tokenizeLine !== 'function') return StandardTokenType.Other
        const st = v.statesIn[i]
        const stack = st ? st.getInternalStack?.() : null
        if (stack === undefined) return StandardTokenType.Other
        for (const tok of g.tokenizeLine(v.lines[i], stack ?? null).tokens)
            if (tok.startIndex <= off && off < tok.endIndex) return scopesType(tok.scopes)
    } catch { /* 拿不到就当代码 */ }
    return StandardTokenType.Other
}

export type QuickSuggestionValue = 'on' | 'inline' | 'off'
export interface QuickSuggestions { other: QuickSuggestionValue, comments: QuickSuggestionValue, strings: QuickSuggestionValue }

/** Monaco quickSuggestions 校验:boolean → 三档同值;对象缺的档取默认(other on / comments off / strings off) */
export function normalizeQuickSuggestions(v: unknown): QuickSuggestions {
    const val = (x: unknown, d: QuickSuggestionValue): QuickSuggestionValue =>
        x === true || x === 'on' ? 'on' : x === false || x === 'off' ? 'off' : x === 'inline' ? 'inline' : d
    if (typeof v === 'boolean' || typeof v === 'string') {
        const s = val(v, 'on')
        return { other: s, comments: s, strings: s }
    }
    const o = (v ?? {}) as Record<string, unknown>
    return { other: val(o.other, 'on'), comments: val(o.comments, 'off'), strings: val(o.strings, 'off') }
}

/** Monaco QuickSuggestionsOptions.valueFor:RegEx 归 other */
export function quickSuggestionFor(q: QuickSuggestions, type: StandardTokenType): QuickSuggestionValue {
    return type === StandardTokenType.Comment ? q.comments : type === StandardTokenType.String ? q.strings : q.other
}
