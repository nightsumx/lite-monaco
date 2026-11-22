// 内置补全 provider:文档词 + 静态关键字(Monaco WordBasedCompletionItemProvider 的位置:'*',最低分组),
// 以及 TS 语义补全(languageService,含 auto-import / snippet / 详情 JSDoc)。
//
// 都是普通 provider(SuggestProvider 协议),由 suggestlive 注册进每个编辑器自己的表里;语言 provider 一组、'*' 一组,
// provideSuggestionItems 先问高分组,有结果就停——所以「语言源有结果,文档词 / 关键字不混入」是注册表语义,不是特判。
import type { EditorState } from '../core/model/state'
import { CharCategory } from '../core/model/charcategory'
import { getOption } from '../core/options'
import { budgetForState, materializeDoc } from '../core/perf'
import { fuzzyScore } from '../core/feature/fuzzy'
import { normalizeQuickSuggestions } from '../core/feature/tokentype'
import { CompletionItemInsertTextRule, CompletionItemKind, CompletionItemTag, CompletionTriggerKind } from './providers'
import type { CompletionContextM, CompletionItemM, CompletionListM } from './providers'
import type { SuggestProvider } from './suggest'
import type { CancellationToken } from './async'
import { getTSService } from './tsservice'
import type { TSServiceOptions } from './tsservice'
import type { TsAsyncService } from './tsprotocol'
import { tsFormatOptions } from './tsformatopts'
import { docPartsToMarkdown, tagToMarkdown } from './tsquickinfo'
import { renderMarkdown, type MarkdownOptions } from './tsmarkdown'
import { codeActionsToChanges, mapTSKindNum, partsToString, PREFS } from './tscompletion'

type ModelLike = {
    getWordUntilPosition(p: { lineNumber: number, column: number }): { word: string, startColumn: number, endColumn: number }
    getOffsetAt(p: { lineNumber: number, column: number }): number
    getPositionAt(o: number): { lineNumber: number, column: number }
    getLanguageId(): string
}
type Pos = { lineNumber: number, column: number }

const rangeUntil = (m: ModelLike, p: Pos) => {
    const w = m.getWordUntilPosition(p)
    return { startLineNumber: p.lineNumber, startColumn: w.startColumn, endLineNumber: p.lineNumber, endColumn: p.column }
}

// ───────────── 文档词 + 关键字 ─────────────

const JS_KEYWORDS = [
    'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete',
    'do', 'else', 'export', 'extends', 'false', 'finally', 'for', 'function', 'if', 'import',
    'in', 'instanceof', 'let', 'new', 'null', 'return', 'super', 'switch', 'this', 'throw',
    'true', 'try', 'typeof', 'undefined', 'var', 'void', 'while', 'with', 'yield', 'async',
    'await', 'of', 'static', 'get', 'set', 'from', 'as', 'enum', 'implements', 'interface',
    'package', 'private', 'protected', 'public', 'readonly', 'type', 'namespace',
]
const TS_KEYWORDS = [
    ...JS_KEYWORDS,
    'abstract', 'any', 'boolean', 'declare', 'infer', 'is', 'keyof', 'module', 'never',
    'number', 'object', 'satisfies', 'string', 'symbol', 'unique', 'unknown', 'override',
]
const PY_KEYWORDS = [
    'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue', 'def', 'del',
    'elif', 'else', 'except', 'False', 'finally', 'for', 'from', 'global', 'if', 'import',
    'in', 'is', 'lambda', 'None', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return',
    'True', 'try', 'while', 'with', 'yield', 'match', 'case', 'type',
]
const KEYWORDS: Record<string, string[]> = {
    javascript: JS_KEYWORDS, js: JS_KEYWORDS, jsx: JS_KEYWORDS,
    typescript: TS_KEYWORDS, ts: TS_KEYWORDS, tsx: TS_KEYWORDS,
    python: PY_KEYWORDS, py: PY_KEYWORDS,
}

/** 文档词扫描预算:禁止每键全量扫 3 万行 */
const WORD_MAX_WORDS = 1_200
const WORD_RESULT_CAP = 80

const isWordChar = (cat: (ch: string) => CharCategory, ch: string | undefined): boolean => !!ch && cat(ch) === CharCategory.Word

function scanWordsInLineRange(
    state: EditorState, fromLine: number, toLine: number, cat: (ch: string) => CharCategory,
    onWord: (w: string, from: number) => boolean, // 返回 false 停
): void {
    const lo = Math.max(1, fromLine)
    const hi = Math.min(state.doc.lines, toLine)
    let count = 0
    for (let n = lo; n <= hi; n++) {
        const line = state.doc.line(n)
        const text = line.text
        let i = 0
        while (i < text.length) {
            if (isWordChar(cat, text[i])) {
                let j = i + 1
                while (j < text.length && isWordChar(cat, text[j])) j++
                // Monaco $textualSuggest 不限词长(单字母词也给)
                if (!onWord(text.slice(i, j), line.from + i)) return
                if (++count >= WORD_MAX_WORDS) return
                i = j
            } else i++
        }
    }
}

/** 光标所在整词(含右侧部分) */
function wordAround(state: EditorState, pos: number): { from: number, to: number, text: string } | null {
    const line = state.doc.lineAt(pos)
    const cat = state.charCategorizer(pos)
    const off = pos - line.from
    let a = off
    let b = off
    while (a > 0 && isWordChar(cat, line.text[a - 1])) a--
    while (b < line.text.length && isWordChar(cat, line.text[b])) b++
    if (a === b) return null
    return { from: line.from + a, to: line.from + b, text: line.text.slice(a, b) }
}

function documentWords(state: EditorState, pos: number, explicit: boolean): { words: string[], capped: boolean } {
    const cat = state.charCategorizer(pos)
    const line = state.doc.lineAt(pos)
    const offset = pos - line.from
    let prefixStart = offset
    while (prefixStart > 0 && isWordChar(cat, line.text[prefixStart - 1])) prefixStart--
    const prefix = line.text.slice(prefixStart, offset)
    if (!explicit && prefix.length < 1) return { words: [], capped: false }
    const cur = wordAround(state, pos)
    const skip = (w: string, from: number) =>
        (cur && from === cur.from) || (cur && w === cur.text) || !Number.isNaN(Number(w))

    const near = budgetForState(state).wordNearLines
    const curLine = line.number
    const total = state.doc.lines
    const nearFrom = Math.max(1, curLine - near)
    const nearTo = Math.min(total, curLine + near)
    const words = new Set<string>()
    const cap = prefix ? WORD_RESULT_CAP : 50
    const pl = prefix.toLowerCase()
    const take = (w: string, from: number) => {
        if (skip(w, from)) return true
        if (prefix && !fuzzyScore(prefix, pl, 0, w, w.toLowerCase(), 0)) return true
        words.add(w)
        return words.size < cap
    }
    scanWordsInLineRange(state, nearFrom, nearTo, cat, take)
    if (words.size < (prefix ? 20 : 50) && nearFrom > 1)
        scanWordsInLineRange(state, 1, Math.min(prefix ? 300 : 200, nearFrom - 1), cat, take)
    return { words: Array.from(words), capped: words.size >= cap }
}

/**
 * 文档词 + 静态关键字(无语言服务的语言兜底;注册了语言 provider 且有结果时它不参与——分组语义)。
 * wordBasedSuggestions 'off' 关掉整个 provider。
 */
export function textCompletionProvider(getState: () => EditorState, isExplicit: () => boolean): SuggestProvider {
    return {
        _debugDisplayName: 'wordbased',
        provideCompletionItems(model: ModelLike, position: Pos, _ctx: CompletionContextM): CompletionListM | null {
            const state = getState()
            if (getOption(state, 'wordBasedSuggestions') === 'off') return null
            const explicit = isExplicit()
            const pos = model.getOffsetAt(position)
            const range = rangeUntil(model, position)
            const prefix = state.sliceDoc(state.doc.lineAt(pos).from + range.startColumn - 1, pos)
            const out: CompletionItemM[] = []
            const kw = KEYWORDS[model.getLanguageId().toLowerCase()]
            const left = pos > 0 ? state.sliceDoc(pos - 1, pos) : ''
            if (kw && left !== '.') {
                const pl = prefix.toLowerCase()
                for (const label of kw) {
                    if (prefix && !fuzzyScore(prefix, pl, 0, label, label.toLowerCase(), 0)) continue
                    out.push({ label, kind: CompletionItemKind.Keyword, detail: 'keyword', insertText: label, range })
                }
            }
            // 关键字优先于同名文档词(旧排序:keyword 源在前,boost 2)
            const named = new Set(out.map(i => labelOf(i)))
            const dw = documentWords(state, pos, explicit)
            for (const w of dw.words) {
                if (named.has(w)) continue
                out.push({ label: w, kind: CompletionItemKind.Text, insertText: w, range })
            }
            // 词数撞了上限:标 incomplete,往右再打字时只重问本 provider(Monaco 对不完整结果的处理)
            return out.length ? { suggestions: out, incomplete: dw.capped } : null
        },
    }
}
const labelOf = (i: CompletionItemM) => typeof i.label === 'string' ? i.label : i.label.label

// ───────────── TS 语义 ─────────────

interface TsMeta { pos: number, name: string, source?: string, data?: unknown }
const META = Symbol('tsMeta')

export interface TsProviderOptions {
    /** 取当前的 TS 服务选项(语言 / 文件名会随重装配变,每次问时现取) */
    ts: () => TSServiceOptions | null
    render: () => MarkdownOptions
    getState: () => EditorState
    /** 当前这次触发是不是用户显式要的(⌃Space):显式时注释 / 字符串里也给,XL 文档也给 */
    isExplicit: () => boolean
}

export function tsCompletionProvider(o: TsProviderOptions): SuggestProvider {
    const sessionOf = () => { const t = o.ts(); return t ? getTSService(t) : null }

    // 光标前一字符在注释/字符串里?(Monaco quickSuggestions:comments/strings 默认 off)
    const inCommentOrString = async (session: NonNullable<ReturnType<typeof sessionOf>>, svc: TsAsyncService, pos: number): Promise<'comments' | 'strings' | null> => {
        if (pos <= 0) return null
        try {
            const enc = await svc.getEncodedSyntacticClassifications(session.fileName, { start: pos - 1, length: 1 })
            const sp = enc.spans
            for (let i = 0; i + 2 < sp.length; i += 3) {
                const start = sp[i]
                const end = start + sp[i + 1]
                const type = sp[i + 2]
                // ClassificationType.comment = 1, stringLiteral = 6(含模板串字面部分)
                if (start <= pos - 1 && pos - 1 < end && (type === 1 || type === 6)) return type === 1 ? 'comments' : 'strings'
            }
        }
        catch { /* ignore */ }
        return null
    }

    return {
        _debugDisplayName: 'typescript',
        // Monaco tsMode:triggerCharacters = ['.']
        triggerCharacters: ['.'],
        async provideCompletionItems(model: ModelLike, position: Pos, ctx: CompletionContextM, _token: CancellationToken): Promise<CompletionListM | null> {
            const session = sessionOf()
            if (!session) return null
            const state = o.getState()
            const explicit = o.isExplicit()
            const pos = model.getOffsetAt(position)
            const left = pos > 0 ? state.sliceDoc(pos - 1, pos) : ''
            if (!explicit && left !== '.' && budgetForState(state).docClass === 'XL') return null
            session.update(materializeDoc(state))
            const member = left === '.'
            if (!explicit && !member) {
                const line = state.doc.lineAt(pos)
                const off = pos - line.from
                if (off === 0) return null
                const ch = /[\udc00-\udfff]/.test(line.text[off - 1] ?? '') ? line.text.slice(Math.max(0, off - 2), off) : line.text[off - 1]
                // 标识符字符按 Unicode 判(TS 认 ID_Continue:中文、带重音的字母都算),否则 CJK 前缀会掉进文档词兜底
                if (!ch || !/[\p{ID_Continue}$‌‍]/u.test(ch)) return null
            }
            const svc = session.service()
            // 触发字符(`.`)打出来的:注释 / 字符串里不弹(quickSuggestions comments / strings 默认 off;设成 'on' 才给)
            if (!explicit && ctx.triggerKind === CompletionTriggerKind.TriggerCharacter) {
                const where = await inCommentOrString(session, svc, pos)
                if (where && normalizeQuickSuggestions(getOption(state, 'quickSuggestions'))[where] !== 'on') return null
            }
            const info = await svc.getCompletionsAtPosition(session.fileName, pos, PREFS)
            if (!info?.entries?.length) return null
            const range = rangeUntil(model, position)
            const out: CompletionItemM[] = []
            for (const e of info.entries) {
                if (!e.name) continue
                const item: CompletionItemM = {
                    label: e.name,
                    kind: mapTSKindNum(e.kind),
                    detail: e.labelDetails?.description || undefined,
                    insertText: e.insertText || e.name,
                    insertTextRules: e.isSnippet ? CompletionItemInsertTextRule.InsertAsSnippet : CompletionItemInsertTextRule.None,
                    sortText: e.sortText ?? '',
                    filterText: e.filterText || undefined,
                    // Monaco tsMode:kindModifiers 含 deprecated → CompletionItemTag.Deprecated
                    tags: e.kindModifiers?.includes('deprecated') ? [CompletionItemTag.Deprecated] : undefined,
                    range,
                }
                ;(item as unknown as Record<symbol, TsMeta>)[META] = { pos, name: e.name, source: e.source, data: e.data as never }
                out.push(item)
            }
            return out.length ? { suggestions: out } : null
        },

        // Monaco resolveCompletionItem:签名 / 文档 / auto-import 编辑,聚焦或接受时才取
        async resolveCompletionItem(item: CompletionItemM): Promise<CompletionItemM | null> {
            const meta = (item as unknown as Record<symbol, TsMeta | undefined>)[META]
            const session = sessionOf()
            if (!meta || !session) return null
            const state = o.getState()
            // 细节必须带格式选项:auto-import 的 codeActions 靠 ChangeTracker 生成,没有格式选项 TS 直接抛错
            const format = tsFormatOptions(state, 'editor')
            try {
                const d = await session.service().getCompletionEntryDetails(session.fileName, meta.pos, meta.name, format, meta.source, PREFS, meta.data as never)
                if (!d) return null
                let detail = partsToString(d.displayParts)
                if (!detail && d.sourceDisplay?.length) detail = partsToString(d.sourceDisplay)
                // Monaco tsMode resolveCompletionItem:documentation + 每个 tag 前 '\n\n' + tagToString,按 markdown 渲
                let md = docPartsToMarkdown(d.documentation)
                for (const tag of d.tags ?? []) md += `\n\n${tagToMarkdown(tag)}`
                const out: CompletionItemM & { renderDocumentation?: () => HTMLElement } = { ...item, detail: detail || item.detail }
                if (md) {
                    out.documentation = { value: md }
                    out.renderDocumentation = () => renderMarkdown(md, o.render())
                }
                if (d.codeActions?.length) {
                    const model = { getPositionAt: (n: number) => positionAt(state, n) }
                    out.additionalTextEdits = codeActionsToChanges(d.codeActions, session.fileName).map(c => {
                        const a = model.getPositionAt(c.from)
                        const b = model.getPositionAt(c.to)
                        return { range: { startLineNumber: a.lineNumber, startColumn: a.column, endLineNumber: b.lineNumber, endColumn: b.column }, text: c.insert }
                    })
                    // codeActionsToChanges 从后往前排;编辑接口按给定顺序同批施加,保持原序
                }
                return out
            }
            catch { return null }
        },
    }
}

function positionAt(state: EditorState, offset: number): Pos {
    const line = state.doc.lineAt(Math.max(0, Math.min(state.doc.length, offset)))
    return { lineNumber: line.number, column: offset - line.from + 1 }
}
