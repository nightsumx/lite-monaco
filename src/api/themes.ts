// editor.defineTheme / editor.setTheme(Monaco StandaloneThemeService)。
//
// Monaco 的主题是全局的:setTheme 之后所有编辑器实例一起换;defineTheme 重定义当前主题会立刻生效。
// lite-monaco 的主题 = 一个 shiki 主题名(token 色 + `colors` 表)。这一层把 Monaco 的 IStandaloneThemeData 翻成 shiki 的主题对象:
//
//   IStandaloneThemeData                      shiki ThemeRegistration
//   ─────────────────────                     ──────────────────────────────
//   base 'vs' | 'vs-dark' | 'hc-black'|'hc-light'   type light/dark;inherit 时拿内置主题当底(下表)
//   inherit                                   true:底主题的 settings(token 规则)和 colors 先放进来,再叠 rules / colors
//   rules[{token,foreground,background,fontStyle}]  settings[{scope,settings:{foreground,background,fontStyle}}]
//        token ''                              全局默认前景 / 背景(settings 里无 scope 的首条;Monaco 里 token '' = 默认)
//        token 'keyword.ts' 等                  scope = [按下表映射出的 TextMate scope…, token 本身]
//        foreground / background 无 '#'          补 '#'(Monaco 的 rules 写 'FF0000',TextMate 写 '#FF0000')
//   colors{'editor.background',…}              colors(键名 = VS Code colorRegistry 的键,和 Monaco 一致,原样)
//   encodedTokensColors                        不支持(它是 Monaco 内部 tokenizer 的调色板索引表,和 TextMate 规则无关);写进来被忽略
//
// 内置底:vs → light-plus、vs-dark → dark-plus、hc-black → github-dark-high-contrast、hc-light → github-light-high-contrast
// (shiki 自带的最接近的主题。Monaco 的 vs / vs-dark 就是 VS Code 的 Light+ / Dark+;两个 hc 主题 shiki 没有同款,取最接近的高对比)。
//
// ── Monaco color key ↔ lite-monaco ThemeColors 对照 ──
// `ThemeColors.vscode` 就是 VS Code `colors` 表,所以 Monaco 的颜色键**同名直通**,不用换名字:
//   editor.background            → ThemeColors.bg(整个编辑器底色)
//   editor.foreground            → ThemeColors.fg(默认文字色)
//   editor.selectionBackground   → shell.selection(选区底色)
//   editor.selectionHighlightBackground → shell.selectionMatch(同词高亮)
//   editor.lineHighlightBackground → shell.lineHighlight(当前行)
//   editorCursor.foreground      → shell.cursor
//   editorLineNumber.foreground / editorLineNumber.activeForeground → shell.lineNumber / activeLineNumber
//   editorBracketHighlight.foreground1..3 → shell.bracket1..3(彩虹括号)
//   editorOverviewRuler.errorForeground / warningForeground / infoForeground → shell.rulerError / rulerWarning / rulerInfo
//   editorWidget.* / editorHoverWidget.* / editorSuggestWidget.* / editorIndentGuide.* / editorWhitespace.foreground /
//   editorError.foreground / editorWarning.foreground / editorInfo.foreground / editorUnnecessaryCode.opacity / minimap.* /
//   scrollbarSlider.* / input.* / list.* / peekView* … → 没有 shell 别名,直接在 vscode 表里(themeColor() 按键查,缺了走 registry 默认)
// 没写的键:inherit 的从底主题来,否则走 lite-monaco 的 VS Code registry 默认(按明暗)。

import { Emitter } from './context'
import type { IEvent } from './types'
import type { EditorHost } from './context'
import type { Installer } from './context'

export type BuiltinTheme = 'vs' | 'vs-dark' | 'hc-black' | 'hc-light'

export interface ITokenThemeRule {
    token: string
    foreground?: string
    background?: string
    fontStyle?: string
}
export interface IColors { [colorId: string]: string }
export interface IStandaloneThemeData {
    base: BuiltinTheme
    inherit: boolean
    rules: ITokenThemeRule[]
    encodedTokensColors?: string[]
    colors: IColors
}

/** monaco.editor.IStandaloneThemeService 的 onDidColorThemeChange 载荷(精简) */
export interface IColorThemeChangedEvent { readonly themeName: string }

const BUILTIN_SHIKI: Record<BuiltinTheme, string> = {
    'vs': 'light-plus',
    'vs-dark': 'dark-plus',
    'hc-black': 'github-dark-high-contrast',
    'hc-light': 'github-light-high-contrast',
}
const BUILTIN_DARK: Record<BuiltinTheme, boolean> = { 'vs': false, 'vs-dark': true, 'hc-black': true, 'hc-light': false }
const isBuiltin = (n: string): n is BuiltinTheme => n in BUILTIN_SHIKI

// ───────────── Monaco token → TextMate scope ─────────────
// Monaco 的 token 是 Monarch 的简化名(`keyword`、`string.escape`、`comment.doc`…),shiki 的 grammar 吐的是 TextMate scope。
// 每条规则的 scope 取「映射出的 scope + token 本身」:TextMate 选择器按点边界前缀匹配,和 Monaco 的最长前缀匹配同构。
const TOKEN_SCOPES: Record<string, string[]> = {
    'comment': ['comment'],
    'comment.doc': ['comment.block.documentation', 'comment.block.javadoc'],
    'string': ['string'],
    'string.escape': ['constant.character.escape'],
    'string.invalid': ['invalid.illegal'],
    'string.sql': ['string.quoted.sql'],
    'keyword': ['keyword', 'storage', 'storage.type', 'storage.modifier'],
    'keyword.control': ['keyword.control'],
    'keyword.operator': ['keyword.operator'],
    'operator': ['keyword.operator'],
    'number': ['constant.numeric'],
    'number.float': ['constant.numeric.float'],
    'number.hex': ['constant.numeric.hex'],
    'number.octal': ['constant.numeric.octal'],
    'number.binary': ['constant.numeric.binary'],
    'regexp': ['string.regexp'],
    'regexp.escape': ['constant.character.escape.regexp'],
    'type': ['entity.name.type', 'support.type'],
    'type.identifier': ['entity.name.type', 'entity.name.class'],
    'identifier': ['variable', 'meta.definition.variable'],
    'variable': ['variable'],
    'variable.predefined': ['variable.language'],
    'constant': ['constant', 'variable.other.constant'],
    'predefined': ['support.function', 'support.constant'],
    'function': ['entity.name.function', 'support.function'],
    'delimiter': ['punctuation'],
    'delimiter.bracket': ['punctuation.definition.block', 'punctuation.definition.parameters'],
    'delimiter.parenthesis': ['punctuation.definition.parameters'],
    'delimiter.square': ['punctuation.definition.array'],
    'delimiter.curly': ['punctuation.definition.block'],
    'tag': ['entity.name.tag'],
    'tag.id.pug': ['entity.name.tag'],
    'attribute.name': ['entity.other.attribute-name'],
    'attribute.value': ['string.quoted', 'meta.attribute-with-value'],
    'metatag': ['meta.tag', 'punctuation.definition.tag'],
    'annotation': ['meta.decorator', 'storage.type.annotation'],
    'invalid': ['invalid'],
    'namespace': ['entity.name.namespace'],
    'class': ['entity.name.class'],
    'interface': ['entity.name.type.interface'],
    'enum': ['entity.name.type.enum'],
    'property': ['variable.other.property', 'support.type.property-name'],
    'parameter': ['variable.parameter'],
    'label': ['entity.name.label'],
}

function scopesFor(token: string): string[] {
    const out: string[] = []
    // Monaco 的 token 带语言后缀(`keyword.ts`);去后缀也试一次
    const parts = token.split('.')
    for (let n = parts.length; n >= 1; n--) {
        const hit = TOKEN_SCOPES[parts.slice(0, n).join('.')]
        if (hit) { out.push(...hit); break }
    }
    out.push(token)
    return [...new Set(out)]
}

const withHash = (c?: string): string | undefined => c ? (c.startsWith('#') ? c : '#' + c) : undefined

// ───────────── 转成 shiki 主题 ─────────────

interface ShikiThemeLike {
    name?: string
    type?: 'light' | 'dark'
    bg?: string
    fg?: string
    colors?: Record<string, string>
    settings?: unknown[]
    tokenColors?: unknown[]
}
export interface ShikiThemeRegistration {
    name: string
    type: 'light' | 'dark'
    fg: string
    bg: string
    colors: Record<string, string>
    settings: { name?: string, scope?: string | string[], settings: { foreground?: string, background?: string, fontStyle?: string } }[]
}

/** 高亮器里和主题有关的那部分(shiki Highlighter 的子集) */
export interface ThemeCapableHighlighter {
    getTheme?(name: string): ShikiThemeLike
    loadTheme?(theme: ShikiThemeRegistration): Promise<void> | void
    loadThemeSync?(theme: ShikiThemeRegistration): void
    getLoadedThemes?(): string[]
}

/** IStandaloneThemeData → shiki 主题对象;base 的内置主题从 hl 里取(取不到就当没有) */
export function toShikiTheme(name: string, data: IStandaloneThemeData, hl?: ThemeCapableHighlighter): ShikiThemeRegistration {
    const dark = BUILTIN_DARK[data.base] ?? true
    let baseSettings: ShikiThemeRegistration['settings'] = []
    let baseColors: Record<string, string> = {}
    let bg = dark ? '#1e1e1e' : '#ffffff'
    let fg = dark ? '#d4d4d4' : '#000000'
    if (data.inherit) {
        let b: ShikiThemeLike | undefined
        try { b = hl?.getTheme?.(BUILTIN_SHIKI[data.base]) } catch { b = undefined }
        if (b) {
            baseSettings = (b.settings ?? b.tokenColors ?? []) as ShikiThemeRegistration['settings']
            baseColors = b.colors ?? {}
            bg = b.bg ?? bg
            fg = b.fg ?? fg
        }
    }
    const colors: Record<string, string> = { ...baseColors, ...data.colors }
    const settings: ShikiThemeRegistration['settings'] = [...baseSettings]
    for (const r of data.rules ?? []) {
        const s: { foreground?: string, background?: string, fontStyle?: string } = {}
        const f = withHash(r.foreground), b = withHash(r.background)
        if (f) s.foreground = f
        if (b) s.background = b
        if (r.fontStyle !== undefined) s.fontStyle = r.fontStyle
        if (r.token === '' || r.token === undefined) {
            // token '' = 默认前景 / 背景
            if (f) fg = f
            if (b) bg = b
            continue
        }
        settings.push({ scope: scopesFor(r.token), settings: s })
    }
    // editor.background / editor.foreground 盖过 token '' 的默认(Monaco:colors 里的编辑器前景 / 背景优先)
    if (colors['editor.background']) bg = colors['editor.background']
    if (colors['editor.foreground']) fg = colors['editor.foreground']
    colors['editor.background'] ??= bg
    colors['editor.foreground'] ??= fg
    // TextMate 主题的首条无 scope 设置 = 全局默认色
    settings.unshift({ settings: { foreground: fg, background: bg } })
    return { name, type: dark ? 'dark' : 'light', fg, bg, colors, settings }
}

// ───────────── 注册表 / 全局当前主题 ─────────────

interface Defined { data: IStandaloneThemeData, version: number }
const defined = new Map<string, Defined>()
let currentName = 'vs'
const emitTheme = new Emitter<IColorThemeChangedEvent>()
/** monaco.editor.onDidChangeTheme 的等价(IStandaloneThemeService.onDidColorThemeChange) */
export const onDidColorThemeChange: IEvent<IColorThemeChangedEvent> = emitTheme.event

const shikiNameOf = (name: string): string => {
    const d = defined.get(name)
    if (d) return d.version ? `${name}~${d.version}` : name
    if (isBuiltin(name)) return BUILTIN_SHIKI[name]
    return name // 不是 Monaco 名:当它是 shiki 内置主题名直接用(lite-monaco 原有用法 theme: 'github-dark')
}

/** @internal token 规则层(tokentheme.ts)读 defineTheme 过的主题数据;没定义过 = undefined */
export function getDefinedThemeData(name: string): { readonly data: IStandaloneThemeData, readonly version: number } | undefined { return defined.get(name) }

/**
 * @internal shiki 主题名 → Monaco 主题名(shikiNameOf 的反向):给渲染一侧按「这个编辑器正在用的主题」取 token 规则。
 * 认不出来的(宿主直接给 shiki 内置名)= undefined,由调用方按明暗挑 vs / vs-dark。
 */
export function monacoThemeOfShikiName(shikiName: string): string | undefined {
    for (const name of defined.keys()) if (shikiNameOf(name) === shikiName) return name
    for (const b of Object.keys(BUILTIN_SHIKI) as BuiltinTheme[]) if (BUILTIN_SHIKI[b] === shikiName) return b
    return undefined
}

/** 当前全局主题名(Monaco 名;setTheme 之前是 'vs',和 Monaco 的默认一致) */
export function getTheme(): string { return currentName }

/** 这个名字对应的 shiki 主题名;内置 vs/vs-dark/hc-* 和 defineTheme 过的会翻译,其余原样 */
export function resolveShikiThemeName(name: string): string { return shikiNameOf(name) }

/** defineTheme 过的主题的明暗(给没有 getTheme 的高亮器兜底) */
export function themeIsDark(name: string): boolean | undefined {
    const d = defined.get(name)
    if (d) return BUILTIN_DARK[d.data.base]
    if (isBuiltin(name)) return BUILTIN_DARK[name]
    return undefined
}

// 已知的活实例:setTheme 对它们全部 reassemble
interface Instance { host: EditorHost, hl: () => ThemeCapableHighlighter | undefined }
const instances = new Set<Instance>()

/** 把 name 对应的主题装进某个高亮器;同步装得上返回 true,只有异步 loadTheme 时返回 Promise */
function ensureLoaded(name: string, hl: ThemeCapableHighlighter | undefined): true | Promise<void> {
    const d = defined.get(name)
    if (!d || !hl) return true
    const shikiName = shikiNameOf(name)
    if (hl.getLoadedThemes?.().includes(shikiName)) return true
    const reg = toShikiTheme(shikiName, d.data, hl)
    if (hl.loadThemeSync) { hl.loadThemeSync(reg); return true }
    if (hl.loadTheme) {
        const r = hl.loadTheme(reg)
        return r instanceof Promise ? r : true
    }
    return true
}

/**
 * liteMonaco() 构造时用:把 opts.theme(可能是 'vs-dark' 或 defineTheme 过的名字)变成能直接给 shiki 的名字。
 * 异步才装得上的主题,先用底主题顶着,`ready` 完成后给出真正的名字(调用方再 reassemble)
 */
export function resolveInitialTheme(name: string, hl: ThemeCapableHighlighter | undefined): { theme: string, ready?: Promise<string> } {
    const loaded = ensureLoaded(name, hl)
    const shikiName = shikiNameOf(name)
    if (loaded === true) return { theme: shikiName }
    const d = defined.get(name)!
    return { theme: BUILTIN_SHIKI[d.data.base] ?? 'dark-plus', ready: loaded.then(() => shikiName) }
}

function applyTo(inst: Instance, name: string): void {
    const loaded = ensureLoaded(name, inst.hl())
    const go = () => {
        if (currentName !== name) return // 期间又换了
        // 主题决定颜色:宿主 colors 覆盖在 setTheme 后清掉
        inst.host.reassemble({ theme: shikiNameOf(name), colors: undefined })
    }
    if (loaded === true) go()
    else void loaded.then(go)
}

/**
 * monaco.editor.defineTheme(themeName, themeData)。
 * 名字只能是字母数字和 '-'(Monaco 校验 /^[a-z0-9\-]+$/i,不合法抛错);不能覆盖内置的 vs / vs-dark / hc-black / hc-light。
 * 重定义的是当前主题 → 立刻生效。
 */
export function defineTheme(themeName: string, themeData: IStandaloneThemeData): void {
    if (!/^[a-z0-9\-]+$/i.test(themeName)) throw new Error('Illegal theme name!')
    if (!isBuiltin(themeData.base) && !defined.has(themeData.base)) throw new Error('Illegal theme base!')
    if (isBuiltin(themeName)) throw new Error('Illegal theme name!')
    const prev = defined.get(themeName)
    defined.set(themeName, { data: themeData, version: prev ? prev.version + 1 : 0 })
    if (currentName === themeName) {
        for (const inst of instances) applyTo(inst, themeName)
        emitTheme.fire({ themeName })
    }
}

/** monaco.editor.setTheme(themeName):全局,所有实例。名字没定义过 → 当 shiki 内置主题名(lite-monaco 的老用法) */
export function setTheme(themeName: string): void {
    currentName = themeName
    for (const inst of instances) applyTo(inst, themeName)
    emitTheme.fire({ themeName })
}

/** 每个实例装配时登记:setTheme / defineTheme 才找得到它(destroy 时自动摘掉) */
export const installTheme: Installer = (ctx) => {
    const host = ctx.host as EditorHost & { getHighlighter?: () => ThemeCapableHighlighter | undefined }
    const inst: Instance = { host, hl: () => host.getHighlighter?.() }
    instances.add(inst)
    ctx.onDispose(() => { instances.delete(inst) })
}
