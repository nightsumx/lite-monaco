// 默认高亮器:Monaco 的 `editor.create(el, { language })` 不需要任何前置配置,lite-monaco 也一样。
// 宿主没给高亮器(也没 setDefaultHighlighter)时,editor.create 用这个:
//   - shiki 是 peer,动态 import,第一次被问到才加载;语法 / 主题按语言 id、主题名按需追加(bundledLanguages / bundledThemes)
//   - 没加载好之前是「无色」高亮器:getLoadedLanguages() 为空,渲染层照 tokens.ts 的既有分支不上色,编辑器照常可用
//   - 加载好一批就让 ensure() 返回 true,调用方(litemonaco.ts)据此 reassemble 一次,颜色补上
// 宿主自己传的高亮器完全不经过这里。一份真源:shiki 实例全页只有一个。
import type { ScopedShiki } from '../core/view/tokens'

type ShikiMod = typeof import('shiki')
type Inner = ScopedShiki & {
    loadLanguage(...l: unknown[]): Promise<void>
    loadTheme(...t: unknown[]): Promise<void>
    getLoadedThemes(): string[]
    getLoadedLanguages(): string[]
}

const LAZY = Symbol('lite-monaco.lazyHighlighter')
let inner: Inner | null = null
let mod: ShikiMod | null = null
let booting: Promise<Inner | null> | null = null
const inflight = new Map<string, Promise<boolean>>()

function boot(): Promise<Inner | null> {
    return booting ??= import('shiki').then(async m => {
        mod = m
        const hl = await m.createHighlighter({ themes: ['light-plus', 'dark-plus'], langs: [] })
        return inner = hl as unknown as Inner
    }, () => null) // 没装 shiki(peer):永远无色,不抛
}

/** 无色阶段的兜底:原样一行一个 token */
const plain = (code: string) => ({ tokens: code.split('\n').map(l => [{ content: l, offset: 0 }]) })

const target = {
    codeToTokens: (code: string, o: never) => inner ? inner.codeToTokens(code, o) : plain(code),
    getLastGrammarState: (t: never) => inner?.getLastGrammarState(t),
    getLoadedLanguages: () => inner ? inner.getLoadedLanguages() : [],
    getLoadedThemes: () => inner ? inner.getLoadedThemes() : [],
    getTheme: (n: string) => inner ? (inner as unknown as { getTheme(n: string): unknown }).getTheme(n) : undefined,
    getLanguage: (n: string) => (inner as unknown as { getLanguage(n: string): unknown } | null)?.getLanguage(n),
    loadTheme: (t: unknown) => inner ? inner.loadTheme(t) : undefined,
    loadThemeSync: (t: unknown) => (inner as unknown as { loadThemeSync?(t: unknown): void } | null)?.loadThemeSync?.(t),
    [LAZY]: true,
}

/** 全页共享的默认高亮器(形状同 ScopedShiki + ThemeCapableHighlighter) */
export const lazyHighlighter = target as unknown as ScopedShiki

export const isLazyHighlighter = (hl: unknown): boolean => !!hl && (hl as Record<symbol, unknown>)[LAZY] === true

/**
 * 保证 lang / theme(shiki 名)装进去了。这次真的装了新东西 = true(调用方该重装配);本来就齐 / 认不出名字 / 没装 shiki = false。
 * lang 是 Monaco 语言 id;shiki 没有对应语法的(plaintext、宿主自己 Monarch 的)直接略过。
 */
export function ensureLazy(lang: string | undefined, theme: string | undefined): Promise<boolean> {
    const key = `${lang ?? ''}\0${theme ?? ''}`
    // 同一批正在装:后来的编辑器拿同一个结果(各自重装配一次),不是返回 false 就此无色 / 停在无色阶段的底色
    const running = inflight.get(key)
    if (running) return running
    if (inner && (!lang || inner.getLoadedLanguages().includes(lang) || !(lang in mod!.bundledLanguages))
        && (!theme || inner.getLoadedThemes().includes(theme) || !(theme in mod!.bundledThemes))) return Promise.resolve(false)
    const p = load(lang, theme).finally(() => inflight.delete(key))
    inflight.set(key, p)
    return p
}

async function load(lang: string | undefined, theme: string | undefined): Promise<boolean> {
    try {
        // 第一次加载 shiki 本身也算「装了新东西」:无色阶段的编辑器靠这个补上主题底色 / 颜色(boot 之后 inner 就有了,要先记下)
        let changed = !inner
        const hl = await boot()
        if (!hl || !mod) return false
        if (lang && lang in mod.bundledLanguages && !hl.getLoadedLanguages().includes(lang)) { await hl.loadLanguage(lang); changed = true }
        if (theme && theme in mod.bundledThemes && !hl.getLoadedThemes().includes(theme)) { await hl.loadTheme(theme); changed = true }
        return changed
    } catch { return false }
}
