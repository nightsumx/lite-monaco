// 分词器注册表 → 渲染一侧的桥。
//
// 渲染(shiki 装饰 / 小地图 / 括号着色 / 括号跳过)全都吃 ScopedShiki 形状的高亮器。语言在 TokenizationRegistry 里登记过分词器
// (setTokensProvider / setMonarchTokensProvider / registerTokensProviderFactory)时,装配器把原高亮器包一层:
// 这一层按 Monaco 的方式分词(tokenizeEncoded:行 + 入口状态 → [起点, metadata] 对 + 行尾状态),颜色按 token 主题的颜色编号取,
// 行尾状态包成 GrammarState 交回 TokenCache(增量重扫、状态收敛都靠它,和 shiki 的 grammarState 同一个槽)。
// 没有登记分词器的语言完全不经过这里,走 shiki,行为不变。一份真源:token 的 metadata 只由分词器算,这里只翻译。

import type { GrammarState, ScopedShiki, ScopedToken } from '../core/view/tokens'
import { getTokenizationRegistry, TokenMetadata, FontStyle, ColorId, type IState, type ITokenizationSupport } from './tokenization'
import { effectiveColorMap, getColorMapOverride, tokenThemeOf, type TokenColor, type TokenTheme } from './tokentheme'
import { monacoThemeOfShikiName } from './themes'

const TYPE_SCOPE: Record<number, string> = { 1: 'comment', 2: 'string', 3: 'regex' }

/** 一行结束时的分词状态:包着分词器自己的 IState,并带上「行尾落在哪种 token 里」供括号跳过判断 */
class BridgeState implements GrammarState {
    constructor(readonly inner: IState, readonly lastType: number) { }
    getScopes(): string[] | undefined { return this.lastType ? [TYPE_SCOPE[this.lastType]] : [] }
    // 括号 / 缩进 / token 类型读者都走 getInternalStack():这里自己就是那个栈
    getInternalStack(): BridgeState { return this }
    get contentNameScopesList(): { getScopeNames(): string[] } { return { getScopeNames: () => this.getScopes() ?? [] } }
    equals(other: unknown): boolean { return other instanceof BridgeState && (this.inner === other.inner || this.inner.equals(other.inner)) }
}

// 颜色编号 → CSS 颜色。TokenTheme.getColorMap 每次都新切一份数组,按 (主题对象, 覆盖) 记一份
const colorMemo = new Map<string, { theme: TokenTheme, override: readonly TokenColor[] | null, colors: string[] }>()
function colorStrings(monacoTheme: string): string[] {
    const theme = tokenThemeOf(monacoTheme)
    const ov = getColorMapOverride()
    const hit = colorMemo.get(monacoTheme)
    if (hit && hit.theme === theme && hit.override === ov) return hit.colors
    const colors = effectiveColorMap(monacoTheme).map(c => c ? c.toString() : '')
    colorMemo.set(monacoTheme, { theme, override: ov, colors })
    return colors
}

/** shiki 主题名 → Monaco 主题名;认不出的按明暗挑 vs / vs-dark */
function monacoThemeFor(hl: ScopedShiki, shikiName: string | object | undefined): string {
    if (typeof shikiName !== 'string') return 'vs-dark'
    const m = monacoThemeOfShikiName(shikiName)
    if (m) return m
    const t = (hl as { getTheme?(n: string): { type?: string } }).getTheme?.(shikiName)
    return t?.type === 'light' ? 'vs' : 'vs-dark'
}

function lastTypeOf(tokens: Uint32Array): number {
    return tokens.length ? TokenMetadata.getTokenType(tokens[tokens.length - 1]) : 0
}

const FONT_BITS = FontStyle.Italic | FontStyle.Bold | FontStyle.Underline | FontStyle.Strikethrough

/** 给一个语言造 ScopedShiki 外壳:token / 状态来自 support,其余成员(getTheme 等)透传给原高亮器 */
function createBridge(hl: ScopedShiki, lang: string, support: ITokenizationSupport): ScopedShiki {
    const last = new WeakMap<ScopedToken[][], BridgeState>()

    const grammar = {
        tokenizeLine2(line: string, stack: unknown): { tokens: Uint32Array, ruleStack: BridgeState } {
            const from = stack instanceof BridgeState ? stack.inner : support.getInitialState()
            const r = support.tokenizeEncoded(line, true, from)
            return { tokens: r.tokens, ruleStack: new BridgeState(r.endState, lastTypeOf(r.tokens)) }
        },
        // 括号 / token 类型读者要 scope 名:没有真 scope,按 metadata 的 StandardTokenType 给 comment / string / regex
        tokenizeLine(line: string, stack: unknown): { tokens: { startIndex: number, endIndex: number, scopes: string[] }[], ruleStack: BridgeState } {
            const r = grammar.tokenizeLine2(line, stack)
            const t = r.tokens
            const out: { startIndex: number, endIndex: number, scopes: string[] }[] = []
            for (let i = 0; i < t.length; i += 2) {
                const ty = TokenMetadata.getTokenType(t[i + 1])
                out.push({ startIndex: t[i], endIndex: i + 2 < t.length ? t[i + 2] : line.length, scopes: ty ? [TYPE_SCOPE[ty]] : [] })
            }
            return { tokens: out, ruleStack: r.ruleStack }
        },
    }

    const overrides: Record<string, unknown> = {
        getLoadedLanguages: () => [lang],
        getLanguage: () => grammar,
        codeToTokens(code: string, o: { theme?: string | object, includeExplanation?: boolean | string, grammarState?: GrammarState }): { tokens: ScopedToken[][] } {
            // 经 grammar.tokenizeLine2 调:tokens.ts 在这个方法上挂了钩子,接 token 类型
            const r = grammar.tokenizeLine2(code, o.grammarState)
            const t = r.tokens
            const colors = colorStrings(monacoThemeFor(hl, o.theme))
            const overridden = getColorMapOverride() !== null
            const row: ScopedToken[] = []
            for (let i = 0; i < t.length; i += 2) {
                const start = t[i]
                const end = i + 2 < t.length ? t[i + 2] : code.length
                if (end < start) continue
                const meta = t[i + 1]
                const fg = TokenMetadata.getForeground(meta)
                const tok: ScopedToken = { content: code.slice(start, end), offset: start }
                // 默认前景(编号 1)不上色,沿用编辑器外壳的前景;setColorMap 覆盖过就照覆盖表走
                if (fg > ColorId.DefaultForeground || (overridden && fg === ColorId.DefaultForeground)) {
                    const c = colors[fg]
                    if (c) tok.color = c
                }
                const fs = TokenMetadata.getFontStyle(meta) & FONT_BITS
                if (fs) tok.fontStyle = fs
                if (o.includeExplanation) {
                    const ty = TokenMetadata.getTokenType(meta)
                    tok.explanation = [{ content: tok.content, scopes: ty ? [{ scopeName: TYPE_SCOPE[ty] }] : [] }]
                }
                row.push(tok)
            }
            const tokens = [row]
            last.set(tokens, r.ruleStack)
            return { tokens }
        },
        getLastGrammarState: (tokens: ScopedToken[][]) => last.get(tokens),
    }
    return new Proxy(hl, {
        get(target, prop, receiver) {
            if (typeof prop === 'string' && prop in overrides) return overrides[prop]
            const v = Reflect.get(target, prop, receiver)
            return typeof v === 'function' ? v.bind(target) : v
        },
    })
}

const bridges = new WeakMap<object, Map<string, { support: ITokenizationSupport, override: unknown, bridge: ScopedShiki }>>()

/**
 * lang 在分词器注册表里有登记(且已解析)→ 返回包过的高亮器;否则原样返回。
 * 同一 (高亮器, 语言, 分词器) 恒返回同一个对象:TokenCache 按高亮器身份判重装,身份稳定才不白重扫。
 */
export function bridgeForLanguage(hl: ScopedShiki, lang: string): ScopedShiki {
    const support = getTokenizationRegistry().get(lang)
    if (!support) return hl
    let m = bridges.get(hl)
    if (!m) bridges.set(hl, m = new Map())
    // setColorMap 换了覆盖表,颜色就变了:身份跟着换,TokenCache 才会重扫
    const override = getColorMapOverride()
    const hit = m.get(lang)
    if (hit && hit.support === support && hit.override === override) return hit.bridge
    const bridge = createBridge(hl, lang, support)
    m.set(lang, { support, override, bridge })
    return bridge
}
