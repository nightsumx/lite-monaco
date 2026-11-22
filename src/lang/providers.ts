// Monaco `languages.register*Provider` 的四件:补全 / 定义 / 折叠范围 / 内联提示。
//
// 签名、返回形态跟 Monaco 一致(provider 收 ITextModel 的子集 + IPosition / IRange / CancellationToken),
// 注册返回 IDisposable。注册表是模块级的:任何编辑器(创建前后注册都行)按语言 id 匹配。
//   · 补全:接进 completionSources(range / insertTextRules / triggerCharacters / resolveCompletionItem / CompletionContext)
//   · 定义:Go to Definition(F12)/ Peek Definition(⌥F12)/ ⌘+点击 / ⌘+悬停预览 —— 非 TS 语言;TS 保留内置(见 T.md)
//   · 折叠:provider 拉取,结果推进 setExtraFolds;onDidChange 触发重算。范围只增不减(缩进折叠仍在,见 T.md)
//   · 内联提示:provideInlayHints(model, range, token) → { hints, dispose };onDidChangeInlayHints 触发重算(非 TS 语言)
import type { EditorState } from '../core/model/state'
import type { EditorView } from '../core/view/editorview'
import { EditorSelection } from '../core/model/selection'
import { wordAtPosition } from '../core/edit/words'
import { setExtraFolds } from '../core/edit/fold'
import { getOption } from '../core/options'
import { materializeDoc } from '../core/perf'
import { canonLanguage } from './languageselector'
import { languageFeatures, type LanguageFeatureRegistry } from './languagefeatures'
import type { SuggestProvider } from './suggest'
import { inlayEnabled, inlayField, setInlayHints, type InlayMark } from './tsinlay'
import { showPeek, type PeekLocation } from './tspeek'
import type { DefinitionPreview } from './tsactions'
import { definitionPreviewText } from './tsactions'

// —— Monaco 基本类型(子集)——
export interface IDisposable { dispose(): void }
export interface IPosition { lineNumber: number, column: number }
export interface IRange { startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number }
/** Monaco CancellationToken:`onCancellationRequested(listener, thisArgs?, disposables?)` */
export interface CancellationToken {
    readonly isCancellationRequested: boolean
    readonly onCancellationRequested: (listener: (e: any) => any, thisArgs?: any, disposables?: IDisposable[]) => IDisposable
}
export type LanguageSelector = string | { language?: string, scheme?: string, pattern?: string } | readonly LanguageSelector[]

/** provider 收到的 model(ITextModel 的常用子集,背后是编辑器当前的 state) */
export interface ProviderModel {
    readonly uri: { toString(): string, path: string, scheme: string, fsPath: string }
    getLanguageId(): string
    getValue(): string
    getVersionId(): number
    isDisposed(): boolean
    getLineCount(): number
    getLineContent(lineNumber: number): string
    getLineLength(lineNumber: number): number
    getLineMaxColumn(lineNumber: number): number
    getValueInRange(range: IRange): string
    getOffsetAt(position: IPosition): number
    getPositionAt(offset: number): IPosition
    getWordAtPosition(position: IPosition): { word: string, startColumn: number, endColumn: number } | null
    getWordUntilPosition(position: IPosition): { word: string, startColumn: number, endColumn: number }
    getFullModelRange(): IRange
}

/** 把编辑器当前内容包成 ProviderModel(getState 每次取最新的,provider 异步返回时也读得到) */
export function providerModel(getState: () => EditorState, languageId: string, uri = 'inmemory://model/1'): ProviderModel {
    const st = () => getState()
    const posAt = (o: number): IPosition => {
        const s = st()
        const line = s.doc.lineAt(Math.max(0, Math.min(o, s.doc.length)))
        return { lineNumber: line.number, column: Math.max(0, Math.min(o, s.doc.length)) - line.from + 1 }
    }
    const offAt = (p: IPosition): number => {
        const s = st()
        const line = s.doc.line(Math.max(1, Math.min(p.lineNumber, s.doc.lines)))
        return line.from + Math.max(0, Math.min(p.column - 1, line.length))
    }
    const u = new URL(uri.includes(':') ? uri : `file://${uri}`)
    let version = 1
    let lastDoc = st().doc
    return {
        uri: { toString: () => uri, path: decodeURIComponent(u.pathname), scheme: u.protocol.replace(/:$/, ''), fsPath: decodeURIComponent(u.pathname) },
        getLanguageId: () => languageId,
        getValue: () => materializeDoc(st()),
        getVersionId: () => { if (st().doc !== lastDoc) { lastDoc = st().doc; version++ } return version },
        isDisposed: () => false,
        getLineCount: () => st().doc.lines,
        getLineContent: n => st().doc.line(n).text,
        getLineLength: n => st().doc.line(n).length,
        getLineMaxColumn: n => st().doc.line(n).length + 1,
        getValueInRange: r => st().sliceDoc(offAt({ lineNumber: r.startLineNumber, column: r.startColumn }), offAt({ lineNumber: r.endLineNumber, column: r.endColumn })),
        getOffsetAt: offAt,
        getPositionAt: posAt,
        getWordAtPosition: p => {
            const w = wordAtPosition(st(), offAt(p))
            if (!w) return null
            const a = posAt(w.from), b = posAt(w.to)
            return { word: st().sliceDoc(w.from, w.to), startColumn: a.column, endColumn: b.column }
        },
        getWordUntilPosition: p => {
            const o = offAt(p)
            const w = wordAtPosition(st(), o)
            if (!w || w.from >= o) return { word: '', startColumn: p.column, endColumn: p.column }
            const a = posAt(w.from)
            return { word: st().sliceDoc(w.from, o), startColumn: a.column, endColumn: p.column }
        },
        getFullModelRange: () => { const e = posAt(st().doc.length); return { startLineNumber: 1, startColumn: 1, endLineNumber: e.lineNumber, endColumn: e.column } },
    }
}

// —— 语言选择器 ——
const canon = canonLanguage
function matchesSelector(sel: LanguageSelector, lang: string): boolean {
    if (typeof sel === 'string') return sel === '*' || canon(sel) === canon(lang)
    if (Array.isArray(sel)) return sel.some(s => matchesSelector(s, lang))
    const f = sel as { language?: string }
    return !f.language || f.language === '*' || canon(f.language) === canon(lang)
}

// —— 注册表 ——
interface Entry<P> { selector: LanguageSelector, provider: P }
class Registry<P> {
    private list: Entry<P>[] = []
    private listeners = new Set<() => void>()
    register(selector: LanguageSelector, provider: P): IDisposable {
        const e = { selector, provider }
        this.list.push(e)
        this.fire()
        return { dispose: () => { const i = this.list.indexOf(e); if (i >= 0) { this.list.splice(i, 1); this.fire() } } }
    }
    for(lang: string): P[] { return this.list.filter(e => matchesSelector(e.selector, lang)).map(e => e.provider) }
    onDidChange(cb: () => void): IDisposable { this.listeners.add(cb); return { dispose: () => { this.listeners.delete(cb) } } }
    private fire() { for (const l of [...this.listeners]) l() }
}

function token(): CancellationToken & { cancel(): void } {
    let cancelled = false
    const cbs = new Set<() => void>()
    return {
        get isCancellationRequested() { return cancelled },
        onCancellationRequested: (listener, thisArgs, disposables) => {
            const cb = () => { listener.call(thisArgs, undefined) }
            cbs.add(cb)
            const d = { dispose: () => { cbs.delete(cb) } }
            disposables?.push(d)
            return d
        },
        cancel() { if (!cancelled) { cancelled = true; for (const c of cbs) c() } },
    }
}

// ———————————————— 补全 ————————————————
// Monaco languages.CompletionItemKind / CompletionItemTag / CompletionItemInsertTextRule / CompletionTriggerKind(数值同 monaco-editor 0.55.1:Tool=27、Snippet=28;旧版 d.ts 没有 Tool,Snippet=27)
export enum CompletionItemKind {
    Method = 0, Function = 1, Constructor = 2, Field = 3, Variable = 4, Class = 5, Struct = 6, Interface = 7, Module = 8, Property = 9,
    Event = 10, Operator = 11, Unit = 12, Value = 13, Constant = 14, Enum = 15, EnumMember = 16, Keyword = 17, Text = 18, Color = 19,
    File = 20, Reference = 21, Customcolor = 22, Folder = 23, TypeParameter = 24, User = 25, Issue = 26, Tool = 27, Snippet = 28,
}
export enum CompletionItemTag { Deprecated = 1 }
export enum CompletionItemInsertTextRule { None = 0, KeepWhitespace = 1, InsertAsSnippet = 4 }
export enum CompletionTriggerKind { Invoke = 0, TriggerCharacter = 1, TriggerForIncompleteCompletions = 2 }
export interface CompletionContextM { triggerKind: 0 | 1 | 2, triggerCharacter?: string }
export interface CompletionItemM {
    label: string | { label: string, detail?: string, description?: string }
    kind: number
    tags?: readonly number[]
    detail?: string
    documentation?: string | { value: string }
    sortText?: string
    filterText?: string
    preselect?: boolean
    insertText: string
    /** 4 = InsertAsSnippet,1 = KeepWhitespace */
    insertTextRules?: number
    range?: IRange | { insert: IRange, replace: IRange }
    commitCharacters?: string[]
    additionalTextEdits?: { range: IRange, text: string | null }[]
    /** 接受后执行的命令(id 为 editor.action.triggerSuggest = 重新触发补全) */
    command?: { id: string, title: string, tooltip?: string, arguments?: unknown[] }
}
export interface CompletionListM { suggestions: CompletionItemM[], incomplete?: boolean, dispose?(): void }
export interface CompletionItemProvider {
    triggerCharacters?: string[]
    provideCompletionItems(model: ProviderModel, position: IPosition, context: CompletionContextM, token: CancellationToken): CompletionListM | null | undefined | PromiseLike<CompletionListM | null | undefined>
    resolveCompletionItem?(item: CompletionItemM, token: CancellationToken): CompletionItemM | null | undefined | PromiseLike<CompletionItemM | null | undefined>
}

export interface SelectionRangeM { range: IRange }
/** Monaco languages.SelectionRangeProvider:每个位置返回一串由内到外的区间 */
export interface SelectionRangeProvider {
    provideSelectionRanges(model: ProviderModel, positions: IPosition[], token: CancellationToken): SelectionRangeM[][] | null | undefined | PromiseLike<SelectionRangeM[][] | null | undefined>
}

/** 补全 provider 的唯一注册表:Monaco LanguageFeatureRegistry(selector 支持 {language, scheme, pattern, exclusive},按分组取回) */
const completionProviders = languageFeatures.completionProvider as LanguageFeatureRegistry<SuggestProvider>
const definitionProviders = new Registry<DefinitionProvider>()
const foldingProviders = new Registry<FoldingRangeProvider>()
const inlayProviders = new Registry<InlayHintsProvider>()
const selectionRangeProviders = new Registry<SelectionRangeProvider>()

export const registerCompletionItemProvider = (s: LanguageSelector, p: CompletionItemProvider): IDisposable => completionProviders.register(s as never, p as SuggestProvider)
export const registerDefinitionProvider = (s: LanguageSelector, p: DefinitionProvider) => definitionProviders.register(s, p)
export const registerFoldingRangeProvider = (s: LanguageSelector, p: FoldingRangeProvider) => foldingProviders.register(s, p)
export const registerSelectionRangeProvider = (s: LanguageSelector, p: SelectionRangeProvider) => selectionRangeProviders.register(s, p)
/** 某语言当前注册的 SelectionRangeProvider(扩选 provideSelectionRanges 用) */
export const selectionRangeProvidersFor = (lang: string): SelectionRangeProvider[] => selectionRangeProviders.for(lang)
/** 某语言当前注册的折叠 / 定义 provider(测试和宿主查询用,同上) */
export const foldingProvidersFor = (lang: string): FoldingRangeProvider[] => foldingProviders.for(lang)
export const definitionProvidersFor = (lang: string): DefinitionProvider[] => definitionProviders.for(lang)
export const registerInlayHintsProvider = (s: LanguageSelector, p: InlayHintsProvider) => inlayProviders.register(s, p)

/** CompletionItemKind(数字,Monaco 枚举)→ 补全控件认的 kind 串 */
export const KIND_NAME: Record<number, string> = {
    0: 'method', 1: 'function', 2: 'method', 3: 'field', 4: 'variable', 5: 'class', 6: 'class', 7: 'interface', 8: 'module', 9: 'property',
    10: 'property', 11: 'keyword', 12: 'text', 13: 'variable', 14: 'variable', 15: 'enum', 16: 'enum', 17: 'keyword', 18: 'text', 19: 'text',
    20: 'file', 21: 'text', 22: 'text', 23: 'file', 24: 'type', 25: 'text', 26: 'text', 27: 'text', 28: 'snippet',
}

// ———————————————— 定义 ————————————————
export interface LocationM { uri: { toString(): string }, range: IRange }
export interface LocationLinkM { uri: { toString(): string }, range: IRange, originSelectionRange?: IRange, targetSelectionRange?: IRange }
export type DefinitionResult = LocationM | LocationM[] | LocationLinkM[]
export interface DefinitionProvider {
    provideDefinition(model: ProviderModel, position: IPosition, token: CancellationToken): DefinitionResult | null | undefined | PromiseLike<DefinitionResult | null | undefined>
}

interface DefTarget { local: boolean, uri: string, start: number, length: number, line: number, from: number }

/** 定义 provider 的结果 → 目标(同一个文件用 offset;别的文件只带 uri 和行号) */
export async function provideDefinitions(view: EditorView, lang: string, pos: number, uri: string): Promise<DefTarget[]> {
    const providers = definitionProviders.for(lang)
    if (!providers.length) return []
    const model = providerModel(() => view.state, lang, uri)
    const position = model.getPositionAt(pos)
    const out: DefTarget[] = []
    await Promise.all(providers.map(async p => {
        try {
            const res = await p.provideDefinition(model, position, token())
            if (!res) return
            for (const l of Array.isArray(res) ? res : [res]) {
                const r = (l as LocationLinkM).targetSelectionRange ?? l.range
                const target = l.uri.toString()
                const local = target === uri
                const start = local ? model.getOffsetAt({ lineNumber: r.startLineNumber, column: r.startColumn }) : 0
                const end = local ? model.getOffsetAt({ lineNumber: r.endLineNumber, column: r.endColumn }) : 0
                out.push({ local, uri: target, start, length: Math.max(0, end - start), line: r.startLineNumber, from: start })
            }
        }
        catch { /* 同上 */ }
    }))
    return out
}

export interface DefinitionActionsLike {
    goToDefinition(view: EditorView, opts?: { muteMessage?: boolean }): Promise<boolean>
    peekDefinition(view: EditorView, opts?: { muteMessage?: boolean }): Promise<boolean>
    definitionPreviewAt(view: EditorView, pos: number): Promise<DefinitionPreview | null>
}

/** 非 TS 语言的 F12 / Peek / 预览,背后是已注册的 DefinitionProvider。没有 provider → 全部返回 false / null */
export function providerDefinitionActions(lang: string, uriOf: () => string = () => 'inmemory://model/1'): DefinitionActionsLike {
    const toPeek = (view: EditorView, rows: DefTarget[]): PeekLocation[] => rows.map(r => ({
        start: r.start, length: r.length, line: r.line,
        preview: r.local ? view.state.doc.line(Math.min(r.line, view.state.doc.lines)).text.trim() : r.uri,
        file: r.local ? uriOf() : r.uri, local: r.local, text: r.local ? null : '',
    }))
    const go = (view: EditorView, r: DefTarget) => {
        const pos = Math.max(0, Math.min(view.state.doc.length, r.start))
        view.dispatch(view.state.update({ selection: EditorSelection.single(pos), scrollIntoView: true, userEvent: 'select' }))
    }
    const actions: DefinitionActionsLike = {
        async goToDefinition(view) {
            const rows = await provideDefinitions(view, lang, view.state.selection.main.head, uriOf())
            const local = rows.filter(r => r.local)
            if (!rows.length) return false
            if (rows.length === 1 && local.length === 1) { go(view, local[0]); return true }
            // 多个结果:gotoLocation.multipleDefinitions(peek 默认 / gotoAndPeek / goto)
            const pref = (getOption(view.state, 'gotoLocation') as Record<string, string> | undefined)?.multipleDefinitions ?? 'peek'
            if (pref === 'goto' && local.length) { go(view, local[0]); return true }
            if (pref === 'gotoAndPeek' && local.length) go(view, local[0])
            showPeek(view, { title: 'Definitions', locations: toPeek(view, rows), file: uriOf() })
            return true
        },
        async peekDefinition(view) {
            const rows = await provideDefinitions(view, lang, view.state.selection.main.head, uriOf())
            if (!rows.length) return false
            showPeek(view, { title: 'Definitions', locations: toPeek(view, rows), file: uriOf() })
            return true
        },
        async definitionPreviewAt(view, pos) {
            const w = wordAtPosition(view.state, pos)
            if (!w) return null
            const rows = await provideDefinitions(view, lang, pos, uriOf())
            if (!rows.length) return null
            const r = rows[0]
            return {
                from: w.from, to: w.to, count: rows.length, local: r.local, file: r.local ? uriOf() : r.uri, line: r.line,
                text: r.local ? definitionPreviewText(materializeDoc(view.state), r.start) : r.uri,
            }
        },
    }
    return actions
}

/** 此语言现在有没有定义 provider(F12 等键位:没有就不吃键) */
export const hasDefinitionProvider = (lang: string) => definitionProviders.for(lang).length > 0

// ———————————————— 折叠范围 ————————————————
export interface FoldingRangeM { start: number, end: number, kind?: { value: string } }
export interface FoldingRangeProvider {
    onDidChange?: (listener: (e: unknown) => void) => IDisposable
    provideFoldingRanges(model: ProviderModel, context: object, token: CancellationToken): FoldingRangeM[] | null | undefined | PromiseLike<FoldingRangeM[] | null | undefined>
}

/** 折叠 provider 会话:文档改动防抖(280ms,同 tsFoldSession)和 onDidChange / 注册变化时拉取,结果推进 setExtraFolds */
export function providerFoldingSession(view: EditorView, lang: string, uriOf: () => string = () => 'inmemory://model/1'): () => void {
    let timer: ReturnType<typeof setTimeout> | null = null
    let seq = 0
    let disposed = false
    const subs: IDisposable[] = []
    const watched = new Set<FoldingRangeProvider>()
    const watch = () => {
        for (const p of foldingProviders.for(lang)) {
            if (watched.has(p)) continue
            watched.add(p)
            if (typeof p.onDidChange === 'function') subs.push(p.onDidChange(() => schedule(0)))
        }
    }
    const run = async () => {
        const my = ++seq
        watch()
        const providers = foldingProviders.for(lang)
        if (!providers.length) {
            // 之前推过范围、provider 现在没了 → 清掉
            if (pushed) { pushed = false; view.dispatch(view.state.update({ effects: setExtraFolds.of([]) })) }
            return
        }
        const model = providerModel(() => view.state, lang, uriOf())
        const nLines = view.state.doc.lines
        const seen = new Map<number, { line: number, from: number, to: number }>()
        let any = false
        await Promise.all(providers.map(async p => {
            try {
                const ranges = await p.provideFoldingRanges(model, {}, token())
                if (!Array.isArray(ranges)) return
                any = true
                // Monaco collectSyntaxRanges:start > 0 && end > start && end <= 行数
                for (const r of ranges) {
                    if (!(r.start > 0 && r.end > r.start && r.end <= nLines)) continue
                    if (seen.has(r.start)) continue
                    seen.set(r.start, { line: r.start, from: view.state.doc.line(r.start).to, to: view.state.doc.line(r.end).to })
                }
            }
            catch { /* 同上 */ }
        }))
        if (disposed || my !== seq || !any) return
        pushed = true
        view.dispatch(view.state.update({ effects: setExtraFolds.of([...seen.values()].sort((a, b) => a.line - b.line)) }))
    }
    let pushed = false
    const schedule = (ms = 280) => {
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => { void run() }, ms)
    }
    const off = view.onTransaction(tr => { if (tr.docChanged) schedule() })
    const offReg = foldingProviders.onDidChange(() => schedule(0))
    schedule(0)
    return () => {
        disposed = true
        if (timer) clearTimeout(timer)
        off(); offReg.dispose()
        for (const s of subs) s.dispose()
    }
}
// ———————————————— 内联提示 ————————————————
export interface InlayHintLabelPartM { label: string, tooltip?: string | { value: string }, command?: { id: string, title: string, tooltip?: string, arguments?: unknown[] }, location?: { uri: unknown, range: IRange } }
export interface InlayHintM {
    label: string | InlayHintLabelPartM[]
    position: IPosition
    /** 1 = Type,2 = Parameter */
    kind?: number
    paddingLeft?: boolean
    paddingRight?: boolean
    tooltip?: string | { value: string }
}
export interface InlayHintListM { hints: InlayHintM[], dispose(): void }
export interface InlayHintsProvider {
    displayName?: string
    onDidChangeInlayHints?: (listener: () => void) => IDisposable
    provideInlayHints(model: ProviderModel, range: IRange, token: CancellationToken): InlayHintListM | null | undefined | PromiseLike<InlayHintListM | null | undefined>
}

/** 非 TS 语言的内联提示会话:inlayHints.enabled=off 不请求;改文档(防抖 360ms)/ onDidChangeInlayHints / 注册变化时重取 */
export function providerInlaySession(view: EditorView, lang: string, uriOf: () => string = () => 'inmemory://model/1'): () => void {
    let timer: ReturnType<typeof setTimeout> | null = null
    let seq = 0
    let disposed = false
    let held: InlayHintListM[] = []
    const subs: IDisposable[] = []
    const watched = new Set<InlayHintsProvider>()
    const release = () => { for (const h of held) { try { h.dispose() } catch { /* */ } } held = [] }
    const run = async () => {
        const my = ++seq
        for (const p of inlayProviders.for(lang)) {
            if (watched.has(p)) continue
            watched.add(p)
            if (typeof p.onDidChangeInlayHints === 'function') subs.push(p.onDidChangeInlayHints(() => schedule(0)))
        }
        const providers = inlayProviders.for(lang)
        const clear = () => { if ((view.state.field(inlayField, false) ?? []).length) view.dispatch(view.state.update({ effects: setInlayHints.of([]) })) }
        if (!providers.length || inlayEnabled(view.state) === 'off') { release(); clear(); return }
        const model = providerModel(() => view.state, lang, uriOf())
        const range = model.getFullModelRange()
        const marks: InlayMark[] = []
        const lists: InlayHintListM[] = []
        await Promise.all(providers.map(async p => {
            try {
                const res = await p.provideInlayHints(model, range, token())
                if (!res) return
                lists.push(res)
                for (const h of res.hints ?? []) {
                    const text = typeof h.label === 'string' ? h.label : h.label.map(x => x.label).join('')
                    if (!text) continue
                    marks.push({
                        pos: model.getOffsetAt(h.position), text,
                        kind: h.kind === 1 ? 'Type' : h.kind === 2 ? 'Parameter' : undefined,
                        paddingLeft: h.paddingLeft || undefined, paddingRight: h.paddingRight || undefined,
                    })
                }
            }
            catch { /* 同上 */ }
        }))
        if (disposed || my !== seq) { for (const l of lists) { try { l.dispose() } catch { /* */ } } return }
        release()
        held = lists
        marks.sort((a, b) => a.pos - b.pos)
        view.dispatch(view.state.update({ effects: setInlayHints.of(marks) }))
    }
    const schedule = (ms = 360) => {
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => { void run() }, ms)
    }
    let lastMode = inlayEnabled(view.state)
    const off = view.onTransaction(tr => {
        if (tr.docChanged) schedule()
        const mode = inlayEnabled(view.state)
        if (mode !== lastMode) { const was = lastMode; lastMode = mode; if (mode === 'off' || was === 'off') schedule(0) }
    })
    const offReg = inlayProviders.onDidChange(() => schedule(0))
    schedule(0)
    return () => {
        disposed = true
        if (timer) clearTimeout(timer)
        off(); offReg.dispose()
        for (const s of subs) s.dispose()
        release()
    }
}

/** monaco.languages 里这四个的命名空间对象(从 index 导出) */
export const languagesProviders = {
    registerCompletionItemProvider, registerDefinitionProvider, registerFoldingRangeProvider, registerInlayHintsProvider, registerSelectionRangeProvider,
}
