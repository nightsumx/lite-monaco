// Go to Symbol in Editor(editor.action.quickOutline,⌘⇧O)—— Monaco AbstractGotoSymbolQuickAccessProvider。
//
// 前缀 `@`:按模糊分数排序,顶上一条分组 "symbols (n)";`@:`:按符号类别分组(每组首行带 "classes (n)" 之类),
// 类别按名字 localeCompare 排,组内按分数。空查询时焦点落在包着光标的最内层符号。
// 查询里有空格:第一段匹配符号名,其余匹配容器名(description)。
// 选中:光标收到符号名开头并居中;取消:位置不动。
// 任何有 outline 的语言都能用:TS / JS(navigation bar)和 json / css / scss / less / html(document symbols)。
import { EditorSelection } from '../core/model/selection'
import type { EditorView } from '../core/view/editorview'
import { showQuickInput, type QuickAccessProvider, type QuickPickItem } from '../core/feature/overlay'
import { materializeDoc } from '../core/perf'
import { documentSymbolsFor, type DocSymbol } from './outline'

/** vscode SymbolKind 数值(Monaco languages.SymbolKind) */
export enum SymbolKind {
    File = 0, Module = 1, Namespace = 2, Package = 3, Class = 4, Method = 5, Property = 6, Field = 7, Constructor = 8, Enum = 9,
    Interface = 10, Function = 11, Variable = 12, Constant = 13, String = 14, Number = 15, Boolean = 16, Array = 17, Object = 18,
    Key = 19, Null = 20, EnumMember = 21, Struct = 22, Event = 23, Operator = 24, TypeParameter = 25,
}

export interface OutlineSymbol {
    name: string
    kind: number
    /** 外层符号名(Monaco containerName);顶层 '' */
    container: string
    /** 符号整体范围 */
    from: number
    to: number
    /** 名字起点(选中后光标落这里) */
    sel: number
}

/** Monaco NLS_SYMBOL_KIND_CACHE(复数 + 数量) */
const KIND_LABEL: Record<number, string> = {
    5: 'methods', 11: 'functions', 8: 'constructors', 12: 'variables', 4: 'classes', 22: 'structs', 23: 'events', 24: 'operators',
    10: 'interfaces', 2: 'namespaces', 3: 'packages', 25: 'type parameters', 1: 'modules', 6: 'properties', 9: 'enumerations',
    21: 'enumeration members', 14: 'strings', 0: 'files', 17: 'arrays', 15: 'numbers', 16: 'booleans', 18: 'objects', 19: 'keys',
    7: 'fields', 13: 'constants',
}
const kindLabel = (k: number, n: number) => `${KIND_LABEL[k] ?? 'properties'} (${n})`

// —— 模糊匹配(scoreFuzzy2 的精简版:子序列、连续 / 词首 / 前缀加分)——
export interface FuzzyHit { score: number, matches: [number, number][] }
export function fuzzyMatch(label: string, query: string): FuzzyHit | undefined {
    if (!query) return { score: 0, matches: [] }
    const l = label.toLowerCase()
    const q = query.toLowerCase()
    // 先试连续子串(分数最高),再退子序列
    const at = l.indexOf(q)
    if (at >= 0) return { score: 100 + (at === 0 ? 50 : 0) - at - (label.length - q.length) / 100, matches: [[at, at + q.length]] }
    let li = 0
    let score = 0
    let prev = -2
    const idx: number[] = []
    for (let qi = 0; qi < q.length; qi++) {
        const j = l.indexOf(q[qi], li)
        if (j < 0) return undefined
        const wordStart = j === 0 || !/[a-z0-9]/i.test(label[j - 1]) || (label[j] !== label[j].toLowerCase() && label[j - 1] === label[j - 1].toLowerCase())
        score += 1 + (j === prev + 1 ? 5 : 0) + (wordStart ? 8 : 0) - (j - li) * 0.1
        idx.push(j); prev = j; li = j + 1
    }
    const matches: [number, number][] = []
    for (const j of idx) {
        const last = matches[matches.length - 1]
        if (last && last[1] === j) last[1] = j + 1
        else matches.push([j, j + 1])
    }
    return { score, matches }
}

export const GOTO_SYMBOL_PREFIX = '@'
export const GOTO_SYMBOL_SCOPE = ':'

interface Pick { sym: OutlineSymbol, index: number, score: number, matches: [number, number][] }

/** Monaco doGetSymbolPicks:查询(去掉 `@` 后的原文)→ 排好序、带分组线的行 */
export function symbolPicks(symbols: readonly OutlineSymbol[], filter: string): { picks: Pick[], items: QuickPickItem[] & { pick?: Pick }[] } {
    const query = filter.trim()
    const byKind = query.startsWith(GOTO_SYMBOL_SCOPE)
    const text = byKind ? query.slice(1).trim() : query
    const pieces = text.split(/\s+/).filter(Boolean)
    const picks: Pick[] = []
    symbols.forEach((sym, index) => {
        const name = sym.name.trim()
        let hit: FuzzyHit | undefined
        let containerHit: FuzzyHit | undefined
        if (text) {
            // 整串(去空格)先当符号名匹配;不行再第一段对符号、其余对容器
            hit = pieces.length > 1 ? fuzzyMatch(name, pieces.join('')) : undefined
            if (!hit) {
                hit = fuzzyMatch(name, pieces[0])
                if (!hit) return
                if (pieces.length > 1) {
                    containerHit = sym.container ? fuzzyMatch(sym.container, pieces.slice(1).join('')) : undefined
                    if (!containerHit) return
                }
            }
        }
        picks.push({ sym, index, score: (hit?.score ?? 0) + (containerHit?.score ?? 0), matches: hit?.matches ?? [] })
    })
    const byScore = (a: Pick, b: Pick) => (b.score - a.score) || (a.index - b.index)
    picks.sort(byKind
        ? (a, b) => (kindLabel(a.sym.kind, 0).localeCompare(kindLabel(b.sym.kind, 0))) || byScore(a, b)
        : byScore)
    const items: (QuickPickItem & { pick?: Pick })[] = []
    let lastKind: number | undefined
    let groupStart = -1
    let count = 0
    const closeGroup = () => { if (groupStart >= 0) items[groupStart].separator = kindLabel(lastKind!, count) }
    for (const p of picks) {
        const item: QuickPickItem & { pick?: Pick } = {
            label: p.sym.name.trim(),
            highlights: p.matches,
            description: p.sym.container || undefined,
            pick: p,
        }
        if (byKind && p.sym.kind !== lastKind) {
            closeGroup()
            lastKind = p.sym.kind; count = 0; groupStart = items.length
        }
        count++
        items.push(item)
    }
    if (byKind) closeGroup()
    else if (items.length) items[0].separator = `symbols (${picks.length})`
    return { picks, items }
}

/** 光标收到符号名开头并居中(Monaco: setSelection(collapseToStart) + revealRangeInCenter) */
export function revealSymbol(view: EditorView, sym: OutlineSymbol): void {
    const pos = Math.max(0, Math.min(view.state.doc.length, sym.sel))
    view.dispatch(view.state.update({ selection: EditorSelection.single(pos), scrollIntoView: true, userEvent: 'select' }))
}

/**
 * 打开 Go to Symbol 面板。resolve:选中 → true,取消 / 没有符号 → false。
 * prefix 默认 '@',传 '@:' 直接按类别分组(editor.action.quickOutline 的 `@:` 变体)
 */
export function openQuickOutline(view: EditorView, symbols: readonly OutlineSymbol[], prefix = GOTO_SYMBOL_PREFIX): Promise<boolean> {
    return new Promise(resolve => {
        const head = view.state.selection.main.head
        let done = false
        const finish = (v: boolean) => { if (!done) { done = true; resolve(v) } }
        const provider: QuickAccessProvider = {
            prefix: GOTO_SYMBOL_PREFIX,
            placeholder: 'Go to symbol in editor',
            items(filter) {
                const { items } = symbolPicks(symbols, filter)
                if (!items.length) {
                    // Monaco provideLabelPick:没有可选项时的提示行(Enter 不关)
                    return [{ label: filter.trim() ? 'No matching editor symbols' : 'No editor symbols' }]
                }
                for (const it of items) {
                    const p = (it as { pick?: Pick }).pick!
                    it.run = () => { revealSymbol(view, p.sym); finish(true) }
                }
                return items
            },
            // 空查询:焦点落在包着光标的最内层(最后一个包住的)符号
            activeIndex(items, filter) {
                if (filter.trim()) return 0
                let at = 0
                items.forEach((it, i) => {
                    const p = (it as { pick?: Pick }).pick
                    if (p && p.sym.from <= head && head <= p.sym.to) at = i
                })
                return at
            },
            onLeave(accepted) { if (!accepted) finish(false) },
        }
        const qi = showQuickInput(view, prefix, [provider])
        qi.input.setSelectionRange(prefix.length, qi.input.value.length)
        if (!symbols.length) finish(false)
    })
}

// —— 非 TS 语言的符号:json / css / scss / less / html ——
const STR_NAME = /^"((?:[^"\\\n]|\\.)*)"/

function jsonName(text: string, sel: number, idx: number): { name: string, kind: number } {
    let name = String(idx)
    let i = sel
    const m = STR_NAME.exec(text.slice(sel, sel + 400))
    let valueAt = sel
    if (m && /^\s*:/.test(text.slice(sel + m[0].length, sel + m[0].length + 40))) {
        name = m[1]
        valueAt = sel + m[0].length
        while (valueAt < text.length && /[\s:]/.test(text[valueAt])) valueAt++
    }
    i = valueAt
    const c = text[i]
    // vscode-json-languageservice getSymbolKind(valueNode.type)
    const kind = c === '{' ? SymbolKind.Module : c === '[' ? SymbolKind.Array : c === '"' ? SymbolKind.String
        : c === 't' || c === 'f' ? SymbolKind.Boolean : c === 'n' ? SymbolKind.Null : SymbolKind.Number
    return { name, kind }
}
function cssName(text: string, sel: number): { name: string, kind: number } {
    const end = text.slice(sel).search(/[{;\n]/)
    const raw = text.slice(sel, end < 0 ? undefined : sel + end).trim()
    if (/^[$@][\w-]+\s*:/.test(raw) || /^--[\w-]+\s*:/.test(raw)) return { name: raw.split(':')[0].trim(), kind: SymbolKind.Variable }
    if (/^@mixin\b/.test(raw)) return { name: raw.replace(/^@mixin\s+/, ''), kind: SymbolKind.Method }
    if (/^@function\b/.test(raw)) return { name: raw.replace(/^@function\s+/, ''), kind: SymbolKind.Function }
    if (raw.startsWith('@')) return { name: raw, kind: SymbolKind.Module }
    return { name: raw || '(anonymous)', kind: SymbolKind.Class }
}
function htmlName(text: string, sel: number): { name: string, kind: number } {
    const tag = /^<([A-Za-z][\w:.-]*)([^>]*)>?/.exec(text.slice(sel, sel + 600))
    if (!tag) return { name: text.slice(sel, sel + 20).trim() || '(element)', kind: SymbolKind.Field }
    let name = tag[1]
    const id = /\bid\s*=\s*["']([^"']+)["']/.exec(tag[2])
    if (id) name += `#${id[1]}`
    const cls = /\bclass\s*=\s*["']([^"']+)["']/.exec(tag[2])
    if (cls) for (const c of cls[1].split(/\s+/).filter(Boolean)) name += `.${c}`
    return { name, kind: SymbolKind.Field }
}

/** json / css / html 的 document symbols → 带名字、类别、容器的列表(树按先序摊平,Monaco asListOfDocumentSymbols) */
export function languageOutlineSymbols(lang: string, text: string): OutlineSymbol[] | null {
    const produce = documentSymbolsFor(lang)
    if (!produce) return null
    const l = lang.toLowerCase()
    const roots = produce(text)
    const out: OutlineSymbol[] = []
    const flat = l !== 'json' && l !== 'jsonc' && l !== 'json5'
    // 先序摊平:json 有 children 树;css / html 本来就是扁平的(只是 html 里元素的嵌套靠 range 包含判断容器)
    const stack: { to: number, name: string }[] = []
    const walk = (list: readonly DocSymbol[], container: string) => {
        list.forEach((s, i) => {
            const n = l.startsWith('json') ? jsonName(text, s.sel, i)
                : l === 'html' || l === 'htm' || l === 'xhtml' ? htmlName(text, s.sel)
                    : cssName(text, s.sel)
            let c = container
            if (flat) {
                while (stack.length && stack[stack.length - 1].to < s.to) stack.pop()
                c = stack.length ? stack[stack.length - 1].name : ''
            }
            out.push({ name: n.name, kind: n.kind, container: c, from: s.from, to: s.to, sel: s.sel })
            if (flat) stack.push({ to: s.to, name: n.name })
            if (s.children?.length) walk(s.children, n.name)
        })
    }
    walk(roots, '')
    return out
}

/** 语言有 outline 吗(TS 之外) */
export const hasLanguageOutline = (lang: string): boolean => documentSymbolsFor(lang) != null

/** editor.action.quickOutline:非 TS 语言入口 */
export function quickOutlineForLanguage(view: EditorView, lang: string, prefix = GOTO_SYMBOL_PREFIX): Promise<boolean> {
    const syms = languageOutlineSymbols(lang, materializeDoc(view.state))
    if (!syms) return Promise.resolve(false)
    return openQuickOutline(view, syms, prefix)
}
