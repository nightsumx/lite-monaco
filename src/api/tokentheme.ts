// token 主题:Monarch / setTokensProvider 吐出的 token 名(`keyword.ts`、`string.escape`…)怎么变成颜色。
// 照搬 Monaco common/languages/supports/tokenization.ts(TokenTheme / ColorMap / parseTokenTheme / ThemeTrieElement,MIT,
// microsoft/vscode,= monaco-editor 0.55.1)+ standaloneThemeService 的 tokenTheme 取法:
//   rules = (inherit ? 内置主题 rules : []) + [token '' ← colors['editor.foreground' / 'editor.background']] + 主题自己的 rules
//   → 按 token 字典序排,'' 打头的几条当默认值,其余插进以 '.' 分段的前缀树;match 取最长前缀(找不到的段回落到最近的祖先规则)。
//   颜色按 ColorMap 编号(1 = 默认前景,2 = 默认背景,其余按首次出现顺序),metadata 里只存编号。
// 渲染一侧 lite-monaco 走 shiki 的 TextMate 主题;这一层只管「token 名 → 颜色编号 → CSS 颜色」,不碰 shiki 主题。

import { ColorId, FontStyle, MetadataConsts, type StandardTokenType } from './tokenization'
import { BUILTIN_THEME_RULES } from './builtinthemerules'
import { getDefinedThemeData, type ITokenThemeRule } from './themes'

export type { ITokenThemeRule }

// ───────────── 颜色(Monaco base/common/color.ts 里 fromHex / toString 的那一小块) ─────────────

export class TokenColor {
    constructor(readonly r: number, readonly g: number, readonly b: number, readonly a: number = 1) { }

    /** Color.fromHex:`#RGB` `#RGBA` `#RRGGBB` `#RRGGBBAA`;解析不了回 Color.red(同 Monaco) */
    static fromHex(hex: string): TokenColor { return TokenColor.parseHex(hex) ?? new TokenColor(255, 0, 0, 1) }

    static parseHex(hex: string): TokenColor | null {
        if (!hex || hex.charCodeAt(0) !== 35) return null
        const d = (i: number): number => {
            const c = hex.charCodeAt(i)
            if (c >= 48 && c <= 57) return c - 48
            if (c >= 65 && c <= 70) return c - 55
            if (c >= 97 && c <= 102) return c - 87
            return 0
        }
        switch (hex.length) {
            case 7: return new TokenColor(16 * d(1) + d(2), 16 * d(3) + d(4), 16 * d(5) + d(6), 1)
            case 9: return new TokenColor(16 * d(1) + d(2), 16 * d(3) + d(4), 16 * d(5) + d(6), (16 * d(7) + d(8)) / 255)
            case 4: return new TokenColor(16 * d(1) + d(1), 16 * d(2) + d(2), 16 * d(3) + d(3), 1)
            case 5: return new TokenColor(16 * d(1) + d(1), 16 * d(2) + d(2), 16 * d(3) + d(3), (16 * d(4) + d(4)) / 255)
            default: return null
        }
    }

    /** CSS 写法:不透明 `#rrggbb`,否则 `rgba(r, g, b, a)`(Color.Format.CSS.format) */
    toString(): string {
        if (this.a === 1) return '#' + [this.r, this.g, this.b].map(n => n.toString(16).padStart(2, '0')).join('')
        return `rgba(${this.r}, ${this.g}, ${this.b}, ${+this.a.toFixed(2)})`
    }
}

// ───────────── 规则解析 ─────────────

/** fontStyle 未设(区别于显式 'none' = 0) */
const NOT_SET = -1

export class ParsedTokenThemeRule {
    _parsedThemeRuleBrand: void = undefined
    constructor(
        readonly token: string,
        readonly index: number,
        /** -1 = 没设;否则是 FontStyle 的按位或 */
        readonly fontStyle: number,
        readonly foreground: string | null,
        readonly background: string | null,
    ) { }
}

/** 把 ITokenThemeRule[] 解析成带序号的规则(token 空串 = 默认值) */
export function parseTokenTheme(source: ITokenThemeRule[]): ParsedTokenThemeRule[] {
    if (!source || !Array.isArray(source)) return []
    const result: ParsedTokenThemeRule[] = []
    for (let i = 0; i < source.length; i++) {
        const entry = source[i]
        let fontStyle = NOT_SET
        if (typeof entry.fontStyle === 'string') {
            fontStyle = FontStyle.None
            for (const segment of entry.fontStyle.split(' ')) {
                if (segment === 'italic') fontStyle |= FontStyle.Italic
                else if (segment === 'bold') fontStyle |= FontStyle.Bold
                else if (segment === 'underline') fontStyle |= FontStyle.Underline
                else if (segment === 'strikethrough') fontStyle |= FontStyle.Strikethrough
            }
        }
        result.push(new ParsedTokenThemeRule(
            entry.token || '', i, fontStyle,
            typeof entry.foreground === 'string' ? entry.foreground : null,
            typeof entry.background === 'string' ? entry.background : null,
        ))
    }
    return result
}

const colorRegExp = /^#?([0-9A-Fa-f]{6})([0-9A-Fa-f]{2})?$/

/** 颜色 ↔ 编号(从 1 开始;0 = 没颜色) */
export class ColorMap {
    private _last = 0
    private readonly _id2color: TokenColor[] = []
    private readonly _color2id = new Map<string, number>()

    getId(color: string | null): number {
        if (color === null) return 0
        const match = color.match(colorRegExp)
        if (!match) throw new Error('Illegal value for token color: ' + color)
        const key = match[1].toUpperCase()
        let value = this._color2id.get(key)
        if (value) return value
        value = ++this._last
        this._color2id.set(key, value)
        this._id2color[value] = TokenColor.fromHex('#' + key)
        return value
    }

    getColorMap(): TokenColor[] { return this._id2color.slice(0) }
}

export class ThemeTrieElementRule {
    _themeTrieElementRuleBrand: void = undefined
    metadata: number
    constructor(private _fontStyle: number, private _foreground: number, private _background: number) {
        this.metadata = this._pack()
    }
    private _pack(): number {
        return ((this._fontStyle << MetadataConsts.FONT_STYLE_OFFSET) | (this._foreground << MetadataConsts.FOREGROUND_OFFSET) | (this._background << MetadataConsts.BACKGROUND_OFFSET)) >>> 0
    }
    clone(): ThemeTrieElementRule { return new ThemeTrieElementRule(this._fontStyle, this._foreground, this._background) }
    acceptOverwrite(fontStyle: number, foreground: number, background: number): void {
        if (fontStyle !== NOT_SET) this._fontStyle = fontStyle
        if (foreground !== ColorId.None) this._foreground = foreground
        if (background !== ColorId.None) this._background = background
        this.metadata = this._pack()
    }
}

export class ThemeTrieElement {
    _themeTrieElementBrand: void = undefined
    private readonly _children = new Map<string, ThemeTrieElement>()
    constructor(private readonly _mainRule: ThemeTrieElementRule) { }

    match(token: string): ThemeTrieElementRule {
        if (token === '') return this._mainRule
        const dot = token.indexOf('.')
        const head = dot === -1 ? token : token.substring(0, dot)
        const tail = dot === -1 ? '' : token.substring(dot + 1)
        const child = this._children.get(head)
        return child !== undefined ? child.match(tail) : this._mainRule
    }

    insert(token: string, fontStyle: number, foreground: number, background: number): void {
        if (token === '') { this._mainRule.acceptOverwrite(fontStyle, foreground, background); return }
        const dot = token.indexOf('.')
        const head = dot === -1 ? token : token.substring(0, dot)
        const tail = dot === -1 ? '' : token.substring(dot + 1)
        let child = this._children.get(head)
        if (child === undefined) {
            child = new ThemeTrieElement(this._mainRule.clone())
            this._children.set(head, child)
        }
        child.insert(tail, fontStyle, foreground, background)
    }
}

const STANDARD_TOKEN_TYPE_REGEXP = /\b(comment|string|regex|regexp)\b/
/** token 名里出现 comment / string / regex(p) 这个词 → 对应 StandardTokenType;否则 Other */
export function toStandardTokenType(tokenType: string): StandardTokenType {
    const m = tokenType.match(STANDARD_TOKEN_TYPE_REGEXP)
    if (!m) return 0
    return m[1] === 'comment' ? 1 : m[1] === 'string' ? 2 : 3
}

export function strcmp(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0 }

export class TokenTheme {
    static createFromRawTokenTheme(source: ITokenThemeRule[], customTokenColors: string[]): TokenTheme {
        return TokenTheme.createFromParsedTokenTheme(parseTokenTheme(source), customTokenColors)
    }

    static createFromParsedTokenTheme(parsed: ParsedTokenThemeRule[], customTokenColors: string[]): TokenTheme {
        // 字典序,同名按出现顺序(后写的覆盖先写的)
        parsed.sort((a, b) => strcmp(a.token, b.token) || a.index - b.index)
        let defaultFontStyle: number = FontStyle.None
        let defaultForeground = '000000'
        let defaultBackground = 'ffffff'
        while (parsed.length >= 1 && parsed[0].token === '') {
            const d = parsed.shift()!
            if (d.fontStyle !== NOT_SET) defaultFontStyle = d.fontStyle
            if (d.foreground !== null) defaultForeground = d.foreground
            if (d.background !== null) defaultBackground = d.background
        }
        const colorMap = new ColorMap()
        for (const color of customTokenColors) colorMap.getId(color)
        const defaults = new ThemeTrieElementRule(defaultFontStyle, colorMap.getId(defaultForeground), colorMap.getId(defaultBackground))
        const root = new ThemeTrieElement(defaults)
        for (const rule of parsed) root.insert(rule.token, rule.fontStyle, colorMap.getId(rule.foreground), colorMap.getId(rule.background))
        return new TokenTheme(colorMap, root)
    }

    private readonly _cache = new Map<string, number>()
    constructor(private readonly _colorMap: ColorMap, private readonly _root: ThemeTrieElement) { }

    getColorMap(): TokenColor[] { return this._colorMap.getColorMap() }

    _match(token: string): ThemeTrieElementRule { return this._root.match(token) }

    /** token 名 → metadata(语言 id + StandardTokenType + 字体样式 + 前景/背景编号) */
    match(languageId: number, token: string): number {
        // 缓存里的 metadata 不带语言位
        let result = this._cache.get(token)
        if (result === undefined) {
            result = (this._match(token).metadata | (toStandardTokenType(token) << MetadataConsts.TOKEN_TYPE_OFFSET)) >>> 0
            this._cache.set(token, result)
        }
        return (result | (languageId << MetadataConsts.LANGUAGEID_OFFSET)) >>> 0
    }
}

/** 颜色表 → `.mtkN { color }` 样式(Monaco generateTokensCSSForColorMap) */
export function generateTokensCSSForColorMap(colorMap: readonly TokenColor[]): string {
    const rules: string[] = []
    for (let i = 1; i < colorMap.length; i++) rules[i] = `.mtk${i} { color: ${colorMap[i]}; }`
    rules.push('.mtki { font-style: italic; }')
    rules.push('.mtkb { font-weight: bold; }')
    rules.push('.mtku { text-decoration: underline; text-underline-position: under; }')
    rules.push('.mtks { text-decoration: line-through; }')
    rules.push('.mtks.mtku { text-decoration: underline line-through; text-underline-position: under; }')
    return rules.join('\n')
}

// ───────────── 按主题名取 TokenTheme ─────────────

type BuiltinName = 'vs' | 'vs-dark' | 'hc-black' | 'hc-light'
const isBuiltinName = (n: string): n is BuiltinName => n in BUILTIN_THEME_RULES

const themeCache = new Map<string, { version: number, theme: TokenTheme }>()

function builtinTheme(name: BuiltinName): TokenTheme {
    const b = BUILTIN_THEME_RULES[name]
    return TokenTheme.createFromRawTokenTheme([{ token: '', foreground: b.foreground, background: b.background }, ...b.rules], [])
}

/**
 * Monaco 主题名 → TokenTheme。内置四个直接用;defineTheme 过的按 StandaloneTheme.tokenTheme 的取法合成;
 * 不认识的名字回落 'vs'(同 setTheme 对未知名字的处理)。
 */
export function tokenThemeOf(name: string): TokenTheme {
    const def = getDefinedThemeData(name)
    const key = def ? name : isBuiltinName(name) ? name : 'vs'
    const version = def ? def.version : 0
    const hit = themeCache.get(key)
    if (hit && hit.version === version) return hit.theme
    let theme: TokenTheme
    if (def) {
        const base: BuiltinName = isBuiltinName(def.data.base) ? def.data.base : 'vs-dark'
        let rules: ITokenThemeRule[] = []
        let encoded: string[] = []
        if (def.data.inherit) rules = BUILTIN_THEME_RULES[base].rules.slice()
        const fg = def.data.colors?.['editor.foreground']
        const bg = def.data.colors?.['editor.background']
        if (fg || bg) {
            const r: ITokenThemeRule = { token: '' }
            if (fg) r.foreground = fg
            if (bg) r.background = bg
            rules.push(r)
        }
        rules = rules.concat(def.data.rules ?? [])
        if (def.data.encodedTokensColors) encoded = def.data.encodedTokensColors
        try { theme = TokenTheme.createFromRawTokenTheme(rules, encoded) } catch { theme = builtinTheme(base) }
    } else {
        theme = builtinTheme(key as BuiltinName)
    }
    themeCache.set(key, { version, theme })
    return theme
}

// ───────────── setColorMap 的覆盖 ─────────────

let colorMapOverride: TokenColor[] | null = null
const overrideListeners = new Set<() => void>()

/** languages.setColorMap:覆盖 token 颜色表(元素 0 占位;null = 取消覆盖) */
export function setColorMapOverride(map: TokenColor[] | null): void {
    colorMapOverride = map
    for (const l of [...overrideListeners]) l()
}
export function getColorMapOverride(): TokenColor[] | null { return colorMapOverride }
/** 订阅覆盖变化(分词注册表据此发 changedColorMap) */
export function onColorMapOverrideChange(fn: () => void): () => void {
    overrideListeners.add(fn)
    return () => { overrideListeners.delete(fn) }
}
/** 某主题当前生效的颜色表:setColorMap 覆盖优先,否则是主题 TokenTheme 自己的 */
export function effectiveColorMap(themeName: string): readonly TokenColor[] {
    return colorMapOverride ?? tokenThemeOf(themeName).getColorMap()
}
