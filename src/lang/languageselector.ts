// Monaco languageSelector.score 的完整语义(移植自 vscode editor/common/languageSelector.ts)。
//   · 字符串选择器:'*' = 5,语言 id 相等 = 10;未同步的 model 一律 0
//   · filter:scheme / language / notebookType / pattern 各自命中 = 10(通配 = 5),任何一项不符 = 0
//   · pattern 对 uri.fsPath 做 glob;IRelativePattern {base, pattern} 先要求 fsPath 落在 base 之下
//   · 数组取最大值,碰到 10 直接返回
// glob 只支持选择器用得到的子集:* ** ? [..] {a,b}。

export interface RelativePattern { readonly base: string, readonly pattern: string }

export interface LanguageFilter {
    readonly language?: string
    readonly scheme?: string
    readonly pattern?: string | RelativePattern
    readonly notebookType?: string
    /** provider 跑在 UI 线程,看得到所有 model(包括未同步的) */
    readonly hasAccessToAllModels?: boolean
    readonly exclusive?: boolean
    readonly isBuiltin?: boolean
}
export type LanguageSelector = string | LanguageFilter | ReadonlyArray<string | LanguageFilter>

/** score 要的 uri 形态(URI 的子集) */
export interface SelectorUri { readonly scheme: string, readonly fsPath: string }

// ───────────── glob(对 uri.fsPath):* ** ? [..] {a,b} ─────────────
const globCache = new Map<string, RegExp>()
function globToRegExp(glob: string): RegExp {
    let re = globCache.get(glob)
    if (re) return re
    let out = ''
    let braces = 0
    for (let i = 0; i < glob.length; i++) {
        const c = glob[i]
        if (c === '*') {
            if (glob[i + 1] === '*') {
                // `**/` 匹配零或多层目录;末尾的 `**` 匹配任意
                if (glob[i + 2] === '/') { out += '(?:.*/)?'; i += 2 } else { out += '.*'; i += 1 }
            } else out += '[^/]*'
        }
        else if (c === '?') out += '[^/]'
        else if (c === '{') { out += '(?:'; braces++ }
        else if (c === '}' && braces) { out += ')'; braces-- }
        else if (c === ',' && braces) out += '|'
        else if (c === '[') {
            const end = glob.indexOf(']', i + 1)
            if (end < 0) out += '\\['
            else { out += '[' + glob.slice(i + 1, end).replace(/^!/, '^').replace(/\\/g, '\\\\') + ']'; i = end }
        }
        else out += c.replace(/[.+^$()|\\\]]/g, '\\$&')
    }
    re = new RegExp('^' + out + '$')
    globCache.set(glob, re)
    return re
}

const slashes = (s: string) => s.replace(/\\/g, '/')
const trimTrailingSlash = (s: string) => (s.length > 1 && s.endsWith('/') ? s.slice(0, -1) : s)

/** pattern 可以是 glob 字符串,或 {base, pattern}(path 须在 base 之下,glob 对 base 的相对路径) */
export function matchGlob(pattern: string | RelativePattern, path: string): boolean {
    const p = slashes(path)
    if (typeof pattern === 'string') return globToRegExp(slashes(pattern)).test(p)
    const base = trimTrailingSlash(slashes(pattern.base))
    const prefix = base === '/' ? '/' : base + '/'
    if (!p.startsWith(prefix)) return false
    return globToRegExp(slashes(pattern.pattern)).test(p.slice(prefix.length))
}

export function score(
    selector: LanguageSelector | undefined | null,
    uri: SelectorUri,
    language: string,
    isSynchronized: boolean,
    notebookUri?: SelectorUri,
    notebookType?: string,
): number {
    if (Array.isArray(selector)) {
        let ret = 0
        for (const f of selector) {
            const v = score(f, uri, language, isSynchronized, notebookUri, notebookType)
            if (v === 10) return v
            if (v > ret) ret = v
        }
        return ret
    }
    if (typeof selector === 'string') {
        if (!isSynchronized) return 0
        if (selector === '*') return 5
        return selector === language ? 10 : 0
    }
    if (!selector) return 0
    const f = selector as LanguageFilter
    if (!isSynchronized && !f.hasAccessToAllModels) return 0
    // 选择器指向 notebook 时用 notebook 的 uri 代替 cell 的 uri
    if (f.notebookType && notebookUri) uri = notebookUri

    let ret = 0
    if (f.scheme) {
        if (f.scheme === uri.scheme) ret = 10
        else if (f.scheme === '*') ret = 5
        else return 0
    }
    if (f.language) {
        if (f.language === language) ret = 10
        else if (f.language === '*') ret = Math.max(ret, 5)
        else return 0
    }
    if (f.notebookType) {
        if (f.notebookType === notebookType) ret = 10
        else if (f.notebookType === '*' && notebookType !== undefined) ret = Math.max(ret, 5)
        else return 0
    }
    if (f.pattern) {
        if (f.pattern === uri.fsPath || matchGlob(f.pattern, uri.fsPath)) ret = 10
        else return 0
    }
    return ret
}

export function targetsNotebooks(selector: LanguageSelector): boolean {
    if (typeof selector === 'string') return false
    if (Array.isArray(selector)) return selector.some(targetsNotebooks)
    return !!(selector as LanguageFilter).notebookType
}

// lite-monaco 对语言别名宽松('ts' / 'typescriptreact' / 'js' …):补全等 provider 注册表两边都过这个规范化再比
const ALIAS: Record<string, string> = {
    ts: 'typescript', typescriptreact: 'typescript', tsx: 'typescript', js: 'javascript', javascriptreact: 'javascript', jsx: 'javascript',
    htm: 'html', xhtml: 'html', jsonc: 'json', json5: 'json', md: 'markdown', py: 'python',
}
export const canonLanguage = (l: string): string => { const x = l.toLowerCase(); return ALIAS[x] ?? x }
