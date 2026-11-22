// monaco.languages 的分词那一族(standalone/browser/standaloneLanguages.ts,MIT,microsoft/vscode,= monaco-editor 0.55.1):
// setTokensProvider / registerTokensProviderFactory / setMonarchTokensProvider / setColorMap / onLanguage / onLanguageEncountered,
// 以及两个适配器(TokensProvider → ITokenizationSupport)。适配器逻辑照搬,服务依赖换成 lite-monaco 自己的。
// 登记进 TokenizationRegistry 之后,渲染由 tokenbridge 接手(见 litemonaco.ts 的 onDidChange 订阅)。

import { EncodedTokenizationResult, MetadataConsts, Token, TokenizationResult, getTokenizationRegistry, tokenizationRegistry, type ILazyTokenizationSupport, type IState, type ITokenizationSupport } from './tokenization'
import { TokenColor, setColorMapOverride, tokenThemeOf } from './tokentheme'
import { getLanguageService } from './languagesregistry'
import { getTheme } from './themes'
import type { IDisposable } from './types'
import { MonarchTokenizer } from '../lang/monarch/monarchLexer'
import { compile } from '../lang/monarch/monarchCompile'
import type { IMonarchLanguage } from '../lang/monarch/monarchTypes'

export interface IToken { startIndex: number, scopes: string }
export interface ILineTokens { tokens: IToken[], endState: IState }
export interface IEncodedLineTokens { tokens: Uint32Array, endState: IState }
export interface TokensProvider {
    getInitialState(): IState
    tokenize(line: string, state: IState): ILineTokens
}
export interface EncodedTokensProvider {
    getInitialState(): IState
    tokenizeEncoded(line: string, state: IState): IEncodedLineTokens
    tokenize?(line: string, state: IState): ILineTokens
}
export interface TokensProviderFactory {
    create(): TokensProvider | EncodedTokensProvider | IMonarchLanguage | null | undefined | PromiseLike<TokensProvider | EncodedTokensProvider | IMonarchLanguage | null | undefined>
}

// ───────────── 适配器 ─────────────

/** Monaco EncodedTokenizationSupportAdapter */
export class EncodedTokenizationSupportAdapter implements ITokenizationSupport, IDisposable {
    constructor(private readonly _languageId: string, private readonly _actual: EncodedTokensProvider) { }
    dispose(): void { /* NOOP */ }
    getInitialState(): IState { return this._actual.getInitialState() }
    tokenize(_line: string, _hasEOL: boolean, state: IState): TokenizationResult {
        if (typeof this._actual.tokenize === 'function') {
            return TokenizationSupportAdapter.adaptTokenize(this._languageId, this._actual as { tokenize(line: string, state: IState): ILineTokens }, _line, state)
        }
        throw new Error('Not supported!')
    }
    tokenizeEncoded(line: string, _hasEOL: boolean, state: IState): EncodedTokenizationResult {
        const result = this._actual.tokenizeEncoded(line, state)
        return new EncodedTokenizationResult(result.tokens, result.endState)
    }
}

interface ThemeServiceLike { getColorTheme(): { readonly tokenTheme: { match(languageId: number, token: string): number } } }
interface LanguageServiceLike { readonly languageIdCodec: { encodeLanguageId(languageId: string): number } }

/** Monaco TokenizationSupportAdapter */
export class TokenizationSupportAdapter implements ITokenizationSupport, IDisposable {
    constructor(
        private readonly _languageId: string,
        private readonly _actual: TokensProvider,
        private readonly _languageService: LanguageServiceLike,
        private readonly _standaloneThemeService: ThemeServiceLike,
    ) { }

    dispose(): void { /* NOOP */ }

    getInitialState(): IState { return this._actual.getInitialState() }

    private static _toClassicTokens(tokens: IToken[], language: string): Token[] {
        const result: Token[] = []
        let previousStartIndex = 0
        for (let i = 0, len = tokens.length; i < len; i++) {
            const t = tokens[i]
            let startIndex = t.startIndex
            // 外部分词器有 bug 时的兜底:第一个 token 必须从 0 起,后面的不得倒退
            if (i === 0) startIndex = 0
            else if (startIndex < previousStartIndex) startIndex = previousStartIndex
            result[i] = new Token(startIndex, t.scopes, language)
            previousStartIndex = startIndex
        }
        return result
    }

    static adaptTokenize(language: string, actual: { tokenize(line: string, state: IState): ILineTokens }, line: string, state: IState): TokenizationResult {
        const actualResult = actual.tokenize(line, state)
        const tokens = TokenizationSupportAdapter._toClassicTokens(actualResult.tokens, language)
        // 能省一个对象就省
        const endState = actualResult.endState.equals(state) ? state : actualResult.endState
        return new TokenizationResult(tokens, endState)
    }

    tokenize(line: string, _hasEOL: boolean, state: IState): TokenizationResult {
        return TokenizationSupportAdapter.adaptTokenize(this._languageId, this._actual, line, state)
    }

    private _toBinaryTokens(languageIdCodec: { encodeLanguageId(languageId: string): number }, tokens: IToken[]): Uint32Array {
        const languageId = languageIdCodec.encodeLanguageId(this._languageId)
        const tokenTheme = this._standaloneThemeService.getColorTheme().tokenTheme
        const result: number[] = []
        let resultLen = 0
        let previousStartIndex = 0
        for (let i = 0, len = tokens.length; i < len; i++) {
            const t = tokens[i]
            const metadata = (tokenTheme.match(languageId, t.scopes) | MetadataConsts.BALANCED_BRACKETS_MASK) >>> 0
            if (resultLen > 0 && result[resultLen - 1] === metadata) continue // 同 metadata 合并
            let startIndex = t.startIndex
            if (i === 0) startIndex = 0
            else if (startIndex < previousStartIndex) startIndex = previousStartIndex
            result[resultLen++] = startIndex
            result[resultLen++] = metadata
            previousStartIndex = startIndex
        }
        const actualResult = new Uint32Array(resultLen)
        for (let i = 0; i < resultLen; i++) actualResult[i] = result[i]
        return actualResult
    }

    tokenizeEncoded(line: string, _hasEOL: boolean, state: IState): EncodedTokenizationResult {
        const actualResult = this._actual.tokenize(line, state)
        const tokens = this._toBinaryTokens(this._languageService.languageIdCodec, actualResult.tokens)
        const endState = actualResult.endState.equals(state) ? state : actualResult.endState
        return new EncodedTokenizationResult(tokens, endState)
    }
}

/** Monaco languages.LazyTokenizationSupport:第一次 getOrCreate 才跑 factory */
export class LazyTokenizationSupport implements ILazyTokenizationSupport, IDisposable {
    private _tokenizationSupport: Promise<ITokenizationSupport | null> | null = null
    constructor(private readonly _createSupport: () => Promise<ITokenizationSupport | null>) { }
    dispose(): void {
        if (this._tokenizationSupport) void this._tokenizationSupport.then(s => { if (s && typeof (s as { dispose?: unknown }).dispose === 'function') (s as unknown as IDisposable).dispose() })
    }
    get tokenizationSupport(): Promise<ITokenizationSupport | null> {
        return this._tokenizationSupport ??= this._createSupport()
    }
}

// ───────────── 服务垫片 ─────────────

const themeService = { getColorTheme: () => ({ tokenTheme: tokenThemeOf(getTheme()) }) }

function isATokensProvider(p: TokensProvider | EncodedTokensProvider | IMonarchLanguage): p is TokensProvider | EncodedTokensProvider {
    return typeof (p as { getInitialState?: unknown }).getInitialState === 'function'
}
function isEncodedTokensProvider(p: TokensProvider | EncodedTokensProvider): p is EncodedTokensProvider {
    return 'tokenizeEncoded' in p
}
function isThenable<T>(obj: unknown): obj is PromiseLike<T> {
    return !!obj && typeof (obj as { then?: unknown }).then === 'function'
}

function createTokenizationSupportAdapter(languageId: string, provider: TokensProvider | EncodedTokensProvider): ITokenizationSupport {
    if (isEncodedTokensProvider(provider)) return new EncodedTokenizationSupportAdapter(languageId, provider)
    return new TokenizationSupportAdapter(languageId, provider, getLanguageService(), themeService)
}

function createMonarch(languageId: string, def: IMonarchLanguage): MonarchTokenizer {
    return new MonarchTokenizer(getLanguageService(), themeService, languageId, compile(languageId, def))
}

// ───────────── 公开 API ─────────────

/** languages.onLanguage:语言第一次被某 model 用上时调一次回调(之后自动退订) */
export function onLanguage(languageId: string, callback: () => void): IDisposable {
    const service = getLanguageService()
    const sub = service.onDidRequestRichLanguageFeatures(id => {
        if (id !== languageId) return
        sub.dispose()
        callback()
    })
    return sub
}

/** languages.onLanguageEncountered:同上,另外别的语言分词时遇到它(内嵌语言)也算 */
export function onLanguageEncountered(languageId: string, callback: () => void): IDisposable {
    const service = getLanguageService()
    const sub = service.onDidRequestBasicLanguageFeatures(id => {
        if (id !== languageId) return
        sub.dispose()
        callback()
    })
    return sub
}

/** languages.setColorMap:覆盖 token 颜色表(下标 0 占位;null = 撤销覆盖) */
export function setColorMap(colorMap: string[] | null): void {
    if (colorMap) {
        const result: TokenColor[] = [null as unknown as TokenColor]
        for (let i = 1, len = colorMap.length; i < len; i++) result[i] = TokenColor.fromHex(colorMap[i])
        setColorMapOverride(result)
    } else {
        setColorMapOverride(null)
    }
    // 颜色表是全局的:所有语言的渲染都要重来(Monaco 里是 ThemeService 触发 TokenizationRegistry.handleChange({changedColorMap}))
    tokenizationRegistry.handleColorMapChange()
}

export function registerTokensProviderFactory(languageId: string, factory: TokensProviderFactory): IDisposable {
    const adapted = new LazyTokenizationSupport(async () => {
        const result = await Promise.resolve(factory.create())
        if (!result) return null
        if (isATokensProvider(result)) return createTokenizationSupportAdapter(languageId, result)
        return createMonarch(languageId, result)
    })
    const reg = getTokenizationRegistry()
    if (!reg.registerFactory) throw new Error('registerTokensProviderFactory: 当前分词器注册表不支持懒工厂')
    const d = reg.registerFactory(languageId, adapted)
    // 语言已经被 model 用过了就不会再有「第一次」:立刻解析,否则已打开的编辑器永远等不到这个分词器
    if (getLanguageService().isRegisteredLanguageId(languageId)) void reg.getOrCreate?.(languageId)
    return d
}

export function setTokensProvider(languageId: string, provider: TokensProvider | EncodedTokensProvider | PromiseLike<TokensProvider | EncodedTokensProvider>): IDisposable {
    if (!getLanguageService().isRegisteredLanguageId(languageId)) throw new Error(`Cannot set tokens provider for unknown language ${languageId}`)
    if (isThenable<TokensProvider | EncodedTokensProvider>(provider)) return registerTokensProviderFactory(languageId, { create: () => provider })
    return registerSupport(languageId, createTokenizationSupportAdapter(languageId, provider))
}

export function setMonarchTokensProvider(languageId: string, languageDef: IMonarchLanguage | PromiseLike<IMonarchLanguage>): IDisposable {
    if (isThenable<IMonarchLanguage>(languageDef)) return registerTokensProviderFactory(languageId, { create: () => languageDef })
    return registerSupport(languageId, createMonarch(languageId, languageDef))
}

function registerSupport(languageId: string, support: ITokenizationSupport): IDisposable {
    const reg = getTokenizationRegistry() as { register?(id: string, s: ITokenizationSupport): IDisposable }
    if (!reg.register) throw new Error('setTokensProvider: 当前分词器注册表不支持 register')
    return reg.register(languageId, support)
}
