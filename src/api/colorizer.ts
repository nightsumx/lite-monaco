// monaco.editor.colorize / colorizeElement / colorizeModelLine / tokenize
// (standalone/browser/colorizer.ts + standaloneEditor.ts,MIT,microsoft/vscode,= monaco-editor 0.55.1)。
// 逐行跑分词器(带行间状态)→ LineTokens → renderColorizedLine。颜色走 `.mtkN` 类:这里负责把当前主题的颜色表写成一张样式表
// (Monaco 的 StandaloneThemeService 干的事),主题 / 颜色表变了跟着更新。

import { ColorId, FontStyle, LineTokens, MetadataConsts, NullState, getTokenizationRegistry, nullTokenize, type ITokenizationSupport, type Token } from './tokenization'
import { getLanguageService } from './languagesregistry'
import { getTheme, onDidColorThemeChange, setTheme } from './themes'
import { effectiveColorMap, generateTokensCSSForColorMap, onColorMapOverrideChange } from './tokentheme'
import { renderColorizedLine } from './viewlinerenderer'
import { MonarchTokenizer } from '../lang/monarch/monarchLexer'
import type { TextModel } from './model'

export interface IColorizerOptions { tabSize?: number }
export interface IColorizerElementOptions extends IColorizerOptions { theme?: string, mimeType?: string }

/** base/common/strings.ts splitLines:\r\n、\r、\n 都是换行 */
const splitLines = (text: string): string[] => text.split(/\r\n|\r|\n/)

// ───────────── .mtkN 样式表 ─────────────

const styles = new Map<Document, HTMLStyleElement>()
let watching = false

function writeTokenCSS(doc: Document): void {
    let el = styles.get(doc)
    if (!el || !el.isConnected) {
        el = doc.createElement('style')
        el.setAttribute('data-lite-monaco', 'token-colors')
        doc.head.appendChild(el)
        styles.set(doc, el)
    }
    el.textContent = generateTokensCSSForColorMap(effectiveColorMap(getTheme()))
}

/** 保证文档里有当前主题的 .mtkN 样式,并在主题 / 颜色表变化时更新 */
function ensureTokenCSS(doc: Document): void {
    writeTokenCSS(doc)
    if (watching) return
    watching = true
    const refresh = () => { for (const d of styles.keys()) writeTokenCSS(d) }
    onDidColorThemeChange(refresh)
    onColorMapOverrideChange(refresh)
}

// ───────────── 渲染 ─────────────

const DEFAULT_METADATA = ((FontStyle.None << MetadataConsts.FONT_STYLE_OFFSET)
    | (ColorId.DefaultForeground << MetadataConsts.FOREGROUND_OFFSET)
    | (ColorId.DefaultBackground << MetadataConsts.BACKGROUND_OFFSET)) >>> 0

function fakeColorize(lines: string[], tabSize: number): string {
    const codec = getLanguageService().languageIdCodec
    const html: string[] = []
    for (const line of lines) {
        const tokens = new Uint32Array([line.length, DEFAULT_METADATA])
        html.push(renderColorizedLine(line, new LineTokens(tokens, line, codec), tabSize), '<br/>')
    }
    return html.join('')
}

function actualColorize(lines: string[], tabSize: number, support: ITokenizationSupport): string {
    const codec = getLanguageService().languageIdCodec
    const html: string[] = []
    let state = support.getInitialState()
    for (const line of lines) {
        const r = support.tokenizeEncoded(line, true, state)
        LineTokens.convertToEndOffset(r.tokens, line.length)
        html.push(renderColorizedLine(line, new LineTokens(r.tokens, line, codec), tabSize), '<br/>')
        state = r.endState
    }
    return html.join('')
}

/** Monarch 嵌入语言还在加载:等它们到齐再重跑一遍(同 Monaco _colorize) */
function colorizeWith(lines: string[], tabSize: number, support: ITokenizationSupport): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        const execute = (): void => {
            const result = actualColorize(lines, tabSize, support)
            if (support instanceof MonarchTokenizer) {
                const status = support.getLoadStatus()
                if (status.loaded === false) { status.promise.then(execute, reject); return }
            }
            resolve(result)
        }
        execute()
    })
}

// ───────────── 公开 API ─────────────

export async function colorize(text: string, languageId: string, options?: IColorizerOptions | null): Promise<string> {
    if (typeof document !== 'undefined') ensureTokenCSS(document)
    const tabSize = options && typeof options.tabSize === 'number' ? options.tabSize : 4
    if (text.charCodeAt(0) === 0xFEFF) text = text.substring(1)
    const lines = splitLines(text)
    if (!getLanguageService().isRegisteredLanguageId(languageId)) return fakeColorize(lines, tabSize)
    const reg = getTokenizationRegistry()
    const support = reg.getOrCreate ? await reg.getOrCreate(languageId) : reg.get(languageId)
    return support ? colorizeWith(lines, tabSize, support) : fakeColorize(lines, tabSize)
}

export function colorizeElement(domNode: HTMLElement, options?: IColorizerElementOptions): Promise<void> {
    options = options || {}
    const theme = options.theme || 'vs'
    const mimeType = options.mimeType || domNode.getAttribute('lang') || domNode.getAttribute('data-lang')
    if (!mimeType) {
        console.error('Mode not detected')
        return Promise.resolve()
    }
    const languageId = getLanguageService().getLanguageIdByMimeType(mimeType) || mimeType
    setTheme(theme)
    const text = domNode.firstChild ? domNode.firstChild.nodeValue : ''
    domNode.className += ' ' + theme
    return colorize(text || '', languageId, options).then(
        html => { domNode.innerHTML = html },
        err => { console.error(err) },
    )
}

export function colorizeModelLine(model: TextModel, lineNumber: number, tabSize = 4): string {
    if (typeof document !== 'undefined') ensureTokenCSS(document)
    const content = model.getLineContent(lineNumber)
    model.tokenization.forceTokenization(lineNumber)
    const tokens = model.tokenization.getLineTokens(lineNumber)
    return renderColorizedLine(content, tokens.inflate(), tabSize, model.mightContainNonBasicASCII(), model.mightContainRTL())
}

/** 分词器缺席时的兜底:整行一个空类型 token(Monaco getSafeTokenizationSupport) */
const NULL_SUPPORT = (languageId: string) => ({
    getInitialState: () => NullState,
    tokenize: (_line: string, _hasEOL: boolean, state: typeof NullState) => nullTokenize(languageId, state),
})

export function tokenize(text: string, languageId: string): Token[][] {
    const reg = getTokenizationRegistry()
    // 先触发一次懒创建(同步取不到,但之后的查找能用上)
    void reg.getOrCreate?.(languageId)
    const support: Pick<ITokenizationSupport, 'getInitialState' | 'tokenize'> = reg.get(languageId) ?? NULL_SUPPORT(languageId)
    const lines = splitLines(text)
    const result: Token[][] = []
    let state = support.getInitialState()
    for (let i = 0; i < lines.length; i++) {
        if (!support.tokenize) throw new Error('Not supported!')
        const r = support.tokenize(lines[i], true, state)
        result[i] = r.tokens
        state = r.endState
    }
    return result
}
