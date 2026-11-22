// TS 语言操作 —— 接 LanguageService 到右键菜单 / 快捷键。
// Go to Definition / References / Rename / Format / Go to Symbol。
// 本文件可跳转;跨文件(tsFiles VFS)展示路径+行预览,单 editor 不打开新 tab(M1.7)。

import type { EditorView } from '../core/view/editorview'
import { EditorSelection } from '../core/model/selection'
import { StateEffect, StateField, type EditorState } from '../core/model/state'
import { Decoration, type DecorationSet } from '../core/model/decoration'
import { RangeSet } from '../core/model/rangeset'
import { getTSService, type TSServiceOptions } from './tsservice'
import { linePreviewAt } from './tsbudget'
import { showPeek, toPeekLocations } from './tspeek'
import { materializeDoc } from '../core/perf'
import { smartSelect } from './tssmart'
import { inheritThemeVars } from '../core/chrome/themevars'
import { renameInput, showEditorMessage } from './tsrename'
import { wordAtPosition } from '../core/edit/words'
import { tsFormatOptions } from './tsformatopts'
import type { TsAsyncService } from './tsprotocol'
import { hasEditorOpener, openCodeEditorViaOpeners } from '../api/openers'
import { Uri } from '../api/uri'
import type { IRange } from '../api/position'
import { getOption } from '../core/options'
import { PositionOffsetTransformer } from '../core/model/posoffset'
import { openQuickOutline, SymbolKind, type OutlineSymbol } from './quickoutline'

export type TSActionsOptions = TSServiceOptions & {
    /** 本编辑器的文件名是自动取的(Monaco inmemory model):peek 标题不显示它的路径 */
    inMemory?: boolean
}

export function norm(p: string): string {
    let s = p.replace(/\\/g, '/')
    if (!s.startsWith('/')) s = '/' + s
    return s
}

function isIdentChar(ch: string): boolean {
    const o = ch.charCodeAt(0)
    return (o >= 48 && o <= 57) || (o >= 65 && o <= 90) || (o >= 97 && o <= 122) || o === 95 || o === 36
}

/** LS 常把类型定义 span 落在 `{ n: number }`。往回取 `type Alias =` / `interface Foo` 的名字。 */
function preferTypeName(text: string, start: number, length: number): { start: number, length: number } {
    const ch = text[start]
    if (ch !== '{' && ch !== '(' && ch !== '[') return { start, length }
    const ws = (c: string) => c === ' ' || c === '\t' || c === '\n' || c === '\r'
    let i = start - 1
    while (i >= 0 && ws(text[i])) i--
    if (i >= 0 && text[i] === '=') {
        i--
        while (i >= 0 && ws(text[i])) i--
    }
    if (i < 0 || !isIdentChar(text[i])) return { start, length }
    const end = i + 1
    while (i >= 0 && isIdentChar(text[i])) i--
    return { start: i + 1, length: end - (i + 1) }
}

function jumpTo(view: EditorView, from: number, to = from): void {
    const len = view.state.doc.length
    const a = Math.max(0, Math.min(len, from))
    const b = Math.max(0, Math.min(len, to))
    view.dispatch(view.state.update({
        selection: EditorSelection.range(a, b),
        scrollIntoView: true,
        userEvent: 'select',
    }))
}

// —— 符号跳转(F12 / ⌘F12 / Shift+F12 单结果)——
// 对齐 Monaco SymbolNavigationAction._openReference:光标收到名字开头(Range.collapseToStart),
// 名字区间闪一下 symbolHighlight(350ms 后清掉)。
export const setNavHighlight = StateEffect.define<{ from: number, to: number } | null>()
export const navHighlightField = StateField.define<{ from: number, to: number } | null>({
    create: () => null,
    update: (v, tr) => {
        for (const e of tr.effects) if (e.is(setNavHighlight)) return e.value
        if (!v || !tr.docChanged) return v
        const from = tr.changes.mapPos(v.from, 1)
        const to = tr.changes.mapPos(v.to, -1)
        return from < to ? { from, to } : null
    },
})
const navMark = Decoration.mark({ class: 'cm-symbol-highlight' })
export function navHighlightDecorations(state: EditorState): DecorationSet {
    const v = state.field(navHighlightField, false)
    if (!v || v.to > state.doc.length) return RangeSet.empty as DecorationSet
    return RangeSet.of([navMark.range(v.from, v.to)])
}

export function jumpToSymbol(view: EditorView, from: number, to: number): void {
    const len = view.state.doc.length
    const a = Math.max(0, Math.min(len, from))
    const b = Math.max(a, Math.min(len, to))
    const hasField = view.state.field(navHighlightField, false) !== undefined
    view.dispatch(view.state.update({
        selection: EditorSelection.single(a),
        scrollIntoView: true,
        userEvent: 'select',
        effects: hasField && b > a ? setNavHighlight.of({ from: a, to: b }) : [],
    }))
    if (hasField && b > a) {
        setTimeout(() => {
            if (!view.dom.isConnected) return
            const cur = view.state.field(navHighlightField, false)
            if (cur) view.dispatch(view.state.update({ effects: setNavHighlight.of(null) }))
        }, 350)
    }
}

/** Monaco _getNoResultFoundMessage:"No definition found for 'foo'" / "No definition found" */
export function noResult(view: EditorView, pos: number, what: string): void {
    const state = view.state
    let a = pos
    let b = pos
    while (a > 0 && isIdentChar(state.sliceDoc(a - 1, a))) a--
    while (b < state.doc.length && isIdentChar(state.sliceDoc(b, b + 1))) b++
    const word = state.sliceDoc(a, b)
    showEditorMessage(view, pos, word ? `No ${what} found for '${word}'` : `No ${what} found`)
}

function applyTextChanges(
    view: EditorView,
    edits: { span: { start: number, length: number }, newText: string }[],
    userEvent: string,
): boolean {
    if (!edits.length) return false
    // 从后往前改,避免 offset 漂移
    const sorted = [...edits].sort((a, b) => b.span.start - a.span.start)
    const changes = sorted.map(e => ({
        from: e.span.start,
        to: e.span.start + e.span.length,
        insert: e.newText,
    }))
    view.dispatch(view.state.update({ changes, userEvent }))
    return true
}

export interface LocRow {
    start: number
    length: number
    line: number
    preview: string
    file: string
    local: boolean
    /** provider 给的原始 Monaco 范围(别的文件的目标交给 opener 时原样带上;TS 导航不填) */
    range?: IRange
}

/** 从 span + 可选全文建列表行(本文件用 view doc,跨文件用 VFS text) */
export function buildLocRow(
    file: string,
    main: string,
    start: number,
    length: number,
    localText: string | null,
): LocRow {
    const local = norm(file) === norm(main)
    if (localText != null) {
        const { line, preview } = linePreviewAt(localText, start)
        return { start, length, line, preview, file: norm(file), local }
    }
    return {
        start, length, line: 0,
        preview: norm(file),
        file: norm(file),
        local,
    }
}

export function locRowLabel(r: LocRow): string {
    if (r.local) return `L${r.line}  ${r.preview || '(empty)'}`
    return `${r.file}:${r.line || '?'}  ${r.preview || ''}`
}

/** Ctrl/⌘ 悬停(GotoDefinitionAtPosition)和 showDefinitionPreviewHover 用:光标下的词、定义数、第一处定义的预览 */
export interface DefinitionPreview {
    /** 鼠标 / 光标下的词 */
    from: number
    to: number
    /** 定义的个数(多于一个时提示 "Click to show N definitions.") */
    count: number
    /** 第一处定义的预览代码(按缩进取几行,去掉公共缩进) */
    text: string
    file: string
    line: number
    local: boolean
}

/**
 * Monaco getPreviewRangeBasedOnIndentation + getPreviewValue:从定义所在行起,到(最多 8 行内)下一行同缩进的行为止,去掉公共缩进。
 * start 是定义名字的偏移
 */
export function definitionPreviewText(text: string, start: number): string {
    const lines = text.split(/\r\n|\r|\n/)
    let n = 0
    let off = 0
    while (n < lines.length - 1 && off + lines[n].length + 1 <= start) { off += lines[n].length + (text[off + lines[n].length] === '\r' && text[off + lines[n].length + 1] === '\n' ? 2 : 1); n++ }
    const indentOf = (l: string) => { const m = /^[ \t]*/.exec(l)![0].length; return m === l.length ? -1 : m }
    const startIndent = indentOf(lines[n])
    const max = Math.min(lines.length, n + 8)
    let end = n + 1
    for (; end < max; end++) if (indentOf(lines[end]) === startIndent) break
    const picked = lines.slice(n, Math.min(end + 1, lines.length))
    const common = Math.min(...picked.filter(l => indentOf(l) >= 0).map(indentOf))
    return picked.map(l => l.slice(Number.isFinite(common) ? common : 0)).join('\n').replace(/\s+$/, '')
}

export interface TSActions {
    /** 词下面的定义预览;没有定义 → null。不改选区、不弹消息 */
    definitionPreviewAt(view: EditorView, pos: number): Promise<DefinitionPreview | null>
    /** muteMessage:没有结果时不弹 "No definition found"(Ctrl+点击走这条,同 Monaco muteMessage) */
    goToDefinition(view: EditorView, opts?: { muteMessage?: boolean }): Promise<boolean>
    goToReferences(view: EditorView): Promise<boolean>
    /** Peek Definition(内嵌预览,不强制跳转) */
    peekDefinition(view: EditorView, opts?: { muteMessage?: boolean }): Promise<boolean>
    /** Peek References */
    peekReferences(view: EditorView): Promise<boolean>
    renameSymbol(view: EditorView): Promise<boolean>
    formatDocument(view: EditorView): Promise<boolean>
    formatSelection(view: EditorView): Promise<boolean>
    organizeImports(view: EditorView): Promise<boolean>
    addMissingImports(view: EditorView): Promise<boolean>
    removeUnusedImports(view: EditorView): Promise<boolean>
    /** 文件内符号(Monaco documentSymbols 扁平列表,带 containerName) */
    outlineSymbols(view: EditorView): Promise<OutlineSymbol[]>
    /** editor.action.quickOutline:prefix '@'(默认)或 '@:'(按类别分组) */
    goToSymbol(view: EditorView, prefix?: string): Promise<boolean>
    goToWorkspaceSymbol(view: EditorView): Promise<boolean>
    listWorkspaceSymbols(view: EditorView, query: string): Promise<{ name: string, kind: string, start: number, length: number }[]>
    expandSmartSelection(view: EditorView): Promise<boolean>
    shrinkSmartSelection(view: EditorView): Promise<boolean>
    goToImplementation(view: EditorView): Promise<boolean>
    peekImplementation(view: EditorView): Promise<boolean>
    goToTypeDefinition(view: EditorView): Promise<boolean>
    peekTypeDefinition(view: EditorView): Promise<boolean>
    addTypeAnnotation(view: EditorView): Promise<boolean>
    addMissingMembers(view: EditorView): Promise<boolean>
    removeUnusedLocals(view: EditorView): Promise<boolean>
    /** 当前文件内是否有定义(用于菜单 enabled) */
    hasDefinitionSync(view: EditorView): boolean
}

// —— gotoLocation.* ——
export type GotoKind = 'definition' | 'declaration' | 'typeDefinition' | 'implementation' | 'reference'
const GOTO_OPTION: Record<GotoKind, 'multipleDefinitions' | 'multipleDeclarations' | 'multipleTypeDefinitions' | 'multipleImplementations' | 'multipleReferences'> = {
    definition: 'multipleDefinitions',
    declaration: 'multipleDeclarations',
    typeDefinition: 'multipleTypeDefinitions',
    implementation: 'multipleImplementations',
    reference: 'multipleReferences',
}
/** Monaco _getGoToPreference:读 gotoLocation.multipleXxx(默认 'peek') */
export function gotoPreference(state: EditorState, kind: GotoKind): 'peek' | 'gotoAndPeek' | 'goto' {
    const v = (getOption(state, 'gotoLocation') as Record<string, unknown> | undefined)?.[GOTO_OPTION[kind]]
    return v === 'gotoAndPeek' || v === 'goto' ? v : 'peek'
}
// goto 模式下剩下的位置(Monaco SymbolNavigationService.put)
const gotoSessions = new WeakMap<EditorView, { rows: LocRow[], index: number }>()

export interface NavigateOptions {
    title: string
    /** openInPeek:peek 命令总开 peek */
    peekMode: boolean
    kind?: GotoKind
    /** 本编辑器的文件(LocRow.file 与它相等的行 local=true) */
    file: string
    inMemory?: boolean
    /** 取文件全文(本文件 / 别的文件);拿不到 null */
    textFor(file: string): string | null
}

/**
 * Monaco SymbolNavigationAction._onResult:peek 命令(openInPeek)总开 peek;跳转命令按 gotoLocation.multipleXxx ——
 * 多于一处时 peek(默认)= 开 peek,gotoAndPeek = 先跳到第一处再开 peek,goto = 只跳第一处(F12 依次走剩下的);
 * 只有一处就跳,那一处不在本文件 → 问 editor.registerEditorOpener 注册的 opener(没人接管就什么都不做)。
 * TS 导航和 provider 导航(registerImplementationProvider 等)共用这一份。
 */
export function navigateLocations(view: EditorView, rows: LocRow[], o: NavigateOptions): void {
    const kind = o.kind ?? 'definition'
    const open = () => showPeek(view, {
        title: o.title, peekMode: o.peekMode,
        locations: toPeekLocations(rows, f => o.textFor(f)),
        file: o.file,
        inMemory: o.inMemory,
    })
    const pref = gotoPreference(view.state, kind)
    if (o.peekMode || (pref === 'peek' && rows.length > 1)) { open(); return }
    const first = rows[0]
    const multi = rows.length > 1
    // 目标不在本文件:问 editor.registerEditorOpener 注册的 opener(没人接管就保持原样什么都不做)
    if (!first.local && hasEditorOpener()) {
        const r = first.range ?? new PositionOffsetTransformer(o.textFor(first.file) ?? '').getRange(first.start, first.start + first.length)
        void openCodeEditorViaOpeners(view as never, first.file.includes(':') ? Uri.parse(first.file) : Uri.file(first.file), r)
        return
    }
    if (first.local) jumpToSymbol(view, first.start, first.start + (multi && pref === 'gotoAndPeek' ? 0 : first.length))
    if (multi && pref === 'gotoAndPeek') { if (first.local) open() }
    else if (multi && pref === 'goto') gotoSessions.set(view, { rows, index: 0 })
}

/** Monaco SymbolNavigationService(goto 模式):F12 继续走到剩下的位置,光标被挪开就作废 */
export function stepGotoLocations(view: EditorView): boolean {
    const ses = gotoSessions.get(view)
    if (!ses) return false
    const cur = ses.rows[ses.index]
    const head = view.state.selection.main.head
    if (!cur.local || head !== cur.start) { gotoSessions.delete(view); return false }
    ses.index = (ses.index + 1) % ses.rows.length
    const next = ses.rows[ses.index]
    if (!next.local) { gotoSessions.delete(view); return false }
    jumpToSymbol(view, next.start, next.start + next.length)
    return true
}

/** Monaco 命令 id → TSActions 方法;gotoLocation.alternativeXxxCommand 和宿主按 id 触发都走它 */
export const TS_ACTION_COMMANDS: Record<string, keyof TSActions> = {
    'editor.action.revealDefinition': 'goToDefinition',
    'editor.action.peekDefinition': 'peekDefinition',
    'editor.action.goToTypeDefinition': 'goToTypeDefinition',
    'editor.action.peekTypeDefinition': 'peekTypeDefinition',
    'editor.action.goToImplementation': 'goToImplementation',
    'editor.action.peekImplementation': 'peekImplementation',
    'editor.action.goToReferences': 'goToReferences',
    'editor.action.referenceSearch.trigger': 'peekReferences',
    'editor.action.rename': 'renameSymbol',
    'editor.action.formatDocument': 'formatDocument',
    'editor.action.formatSelection': 'formatSelection',
    'editor.action.organizeImports': 'organizeImports',
    'editor.action.quickOutline': 'goToSymbol',
}
function altCommands(a: TSActions): Record<string, (view: EditorView) => Promise<boolean>> {
    const out: Record<string, (view: EditorView) => Promise<boolean>> = {}
    for (const [id, m] of Object.entries(TS_ACTION_COMMANDS)) out[id] = view => (a[m] as (v: EditorView) => Promise<boolean>)(view)
    return out
}
/** 按 Monaco 命令 id 跑 TS 动作(id 不认识 → false) */
export function runTsCommand(actions: TSActions, id: string, view: EditorView): Promise<boolean> {
    const m = TS_ACTION_COMMANDS[id]
    return m ? (actions[m] as (v: EditorView) => Promise<boolean>)(view) : Promise.resolve(false)
}

export function createTSActions(opts: TSActionsOptions): TSActions {
    const session = getTSService(opts)

    /**
     * 先把最新全文推给语言服务再发请求。结果异步回来:这期间文档变了(位置对不上)→ 返回 null,
     * 调用方当「没有结果」处理,不要拿旧位置去改新文档
     */
    const withSvc = async <T>(
        view: EditorView,
        fn: (svc: TsAsyncService) => Promise<T>,
    ): Promise<T | null> => {
        session.syncOpenEditors()
        const docAt = view.state.doc
        session.update(materializeDoc(view.state))
        const out = await fn(session.service())
        return view.state.doc === docAt ? out : null
    }

    const textFor = (file: string, view: EditorView): string | null => {
        const main = norm(session.fileName)
        if (norm(file) === main) return materializeDoc(view.state)
        return session.getFileText(file)
    }

    // Monaco SymbolNavigationAction._onResult(逻辑在模块级 navigateLocations,provider 驱动的导航共用)
    const navigate = (view: EditorView, rows: LocRow[], title: string, peekMode: boolean, kind: GotoKind = 'definition') =>
        navigateLocations(view, rows, { title, peekMode, kind, file: norm(session.fileName), inMemory: opts.inMemory, textFor: f => textFor(f, view) })

    const stepGotoSession = stepGotoLocations

    // 备选命令(gotoLocation.alternativeXxxCommand):站在唯一结果上再按一次时改跑它。防递归同 Monaco _activeAlternativeCommands
    const altActive = new Set<string>()
    const runAlternative = (view: EditorView, rows: LocRow[], pos: number, id: string, self: string): Promise<boolean> | null => {
        if (rows.length !== 1 || !rows.some(r => r.local && pos >= r.start && pos <= r.start + r.length)) return null
        const alt = id && id !== self && !altActive.has(id) ? altCommands(actions)[id] : undefined
        if (!alt) return null
        altActive.add(self)
        return alt(view).finally(() => altActive.delete(self))
    }

    const collectDefs = async (view: EditorView, pos: number): Promise<LocRow[] | null> => {
        return (await withSvc(view, async (svc) => {
            const defs = (await svc.getDefinitionAtPosition(session.fileName, pos))
                ?? (await svc.getTypeDefinitionAtPosition(session.fileName, pos))
            if (!defs?.length) return [] as LocRow[]
            const main = norm(session.fileName)
            const out: LocRow[] = []
            const seen = new Set<string>()
            for (const d of defs) {
                const file = norm(d.fileName)
                const key = `${file}:${d.textSpan.start}:${d.textSpan.length}`
                if (seen.has(key)) continue
                seen.add(key)
                out.push(buildLocRow(
                    file, main, d.textSpan.start, d.textSpan.length,
                    textFor(file, view),
                ))
            }
            out.sort((a, b) => (a.local === b.local ? 0 : a.local ? -1 : 1) || a.start - b.start)
            return out
        }))
    }

    const definitionPreviewAt = async (view: EditorView, pos: number): Promise<DefinitionPreview | null> => {
        const word = wordAtPosition(view.state, pos)
        if (!word) return null
        const rows = await collectDefs(view, pos)
        if (!rows?.length) return null
        const r = rows[0]
        const text = r.local ? materializeDoc(view.state) : textFor(r.file, view)
        return {
            from: word.from, to: word.to, count: rows.length,
            text: text == null ? r.preview : definitionPreviewText(text, r.start),
            file: r.file, line: r.line, local: r.local,
        }
    }

    const collectTypeDefs = async (view: EditorView, pos: number): Promise<LocRow[] | null> => {
        return (await withSvc(view, async (svc) => {
            const defs = await svc.getTypeDefinitionAtPosition(session.fileName, pos)
            if (!defs?.length) return [] as LocRow[]
            const main = norm(session.fileName)
            const out: LocRow[] = []
            const seen = new Set<string>()
            for (const d of defs) {
                const file = norm(d.fileName)
                const localText = textFor(file, view)
                const named = localText
                    ? preferTypeName(localText, d.textSpan.start, d.textSpan.length)
                    : { start: d.textSpan.start, length: d.textSpan.length }
                const key = `${file}:${named.start}:${named.length}`
                if (seen.has(key)) continue
                seen.add(key)
                out.push(buildLocRow(file, main, named.start, named.length, localText))
            }
            out.sort((a, b) => (a.local === b.local ? 0 : a.local ? -1 : 1) || a.start - b.start)
            return out
        }))
    }

    const collectImpls = async (view: EditorView, pos: number): Promise<LocRow[] | null> => {
        return (await withSvc(view, async (svc) => {
            const impls = await svc.getImplementationAtPosition(session.fileName, pos)
            if (!impls?.length) return [] as LocRow[]
            const main = norm(session.fileName)
            const out: LocRow[] = []
            const seen = new Set<string>()
            for (const d of impls) {
                const file = norm(d.fileName)
                const key = `${file}:${d.textSpan.start}:${d.textSpan.length}`
                if (seen.has(key)) continue
                seen.add(key)
                out.push(buildLocRow(
                    file, main, d.textSpan.start, d.textSpan.length,
                    textFor(file, view),
                ))
            }
            out.sort((a, b) => (a.local === b.local ? 0 : a.local ? -1 : 1) || a.start - b.start)
            return out
        }))
    }

    const collectRefs = async (view: EditorView, pos: number): Promise<LocRow[] | null> => {
        return (await withSvc(view, async (svc) => {
            const refs = await svc.getReferencesAtPosition(session.fileName, pos)
            if (!refs?.length) return [] as LocRow[]
            const main = norm(session.fileName)
            const out: LocRow[] = []
            for (const r of refs) {
                const file = norm(r.fileName)
                out.push(buildLocRow(
                    file, main, r.textSpan.start, r.textSpan.length,
                    textFor(file, view),
                ))
            }
            out.sort((a, b) => (a.local === b.local ? 0 : a.local ? -1 : 1) || a.start - b.start)
            return out
        }))
    }

    // hasDefinitionSync 的缓存:某份文档、某个位置上有没有定义
    const defCache = new WeakMap<EditorView, { doc: unknown, pos: number, has: boolean }>()

    const actions: TSActions = {
        definitionPreviewAt,
        hasDefinitionSync(view) {
            // 同步接口,答案是异步的:有这份文档、这个位置的缓存答案就用它,否则先当「有」(与以前服务未就绪时一致),并在后台问
            const pos = view.state.selection.main.head
            const c = defCache.get(view)
            if (c && c.doc === view.state.doc && c.pos === pos) return c.has
            void (async () => {
                try {
                    const rows = await withSvc(view, svc => svc.getDefinitionAtPosition(session.fileName, pos))
                    if (rows) defCache.set(view, { doc: view.state.doc, pos, has: !!rows.length })
                } catch { /* */ }
            })()
            return true
        },

        async goToDefinition(view, o) {
            if (stepGotoSession(view)) return true
            const pos = view.state.selection.main.head
            const rows = await collectDefs(view, pos)
            if (!rows) return false // 等结果期间文档变了
            if (!rows.length) { if (!o?.muteMessage) noResult(view, pos, 'definition'); return false }
            // 已经站在唯一的定义上 → 改跑备选命令(Monaco referenceAt + alternativeDefinitionCommand,默认 Go to References)
            const alt = runAlternative(view, rows, pos, getOption(view.state, 'gotoLocation').alternativeDefinitionCommand, 'editor.action.revealDefinition')
            if (alt) return alt
            navigate(view, rows, 'Definitions', false, 'definition')
            return true
        },

        async goToReferences(view) {
            const pos = view.state.selection.main.head
            const rows = await collectRefs(view, pos)
            if (!rows) return false // 等结果期间文档变了
            if (!rows.length) { noResult(view, pos, 'references'); return false }
            navigate(view, rows, 'References', false, 'reference')
            return true
        },

        async peekDefinition(view, o) {
            const pos = view.state.selection.main.head
            const rows = await collectDefs(view, pos)
            if (!rows) return false // 等结果期间文档变了
            if (!rows.length) { if (!o?.muteMessage) noResult(view, pos, 'definition'); return false }
            navigate(view, rows, 'Definitions', true, 'definition')
            return true
        },

        async peekReferences(view) {
            const pos = view.state.selection.main.head
            const rows = await collectRefs(view, pos)
            if (!rows) return false // 等结果期间文档变了
            if (!rows.length) { noResult(view, pos, 'references'); return false }
            navigate(view, rows, 'References', true, 'reference')
            return true
        },

        async renameSymbol(view) {
            if (view.state.readOnly) return false
            const pos = view.state.selection.main.head
            // Monaco resolveRenameLocation(TS 没实现):先用光标下的词开框,没有词就是空框;能不能改到提交时才问 TS
            const w = wordAtPosition(view.state, pos) ?? { from: pos, to: pos }
            const docAt = view.state.doc
            const next = await renameInput(view, { from: w.from, to: w.to, name: view.state.sliceDoc(w.from, w.to) })
            if (next == null || view.state.doc !== docAt) return false
            const groups = await withSvc(view, async (svc) => {
                // 拒绝(关键字、字面量…):standalone Monaco 的 notificationService 不显示,静默放弃
                if (!(await svc.getRenameInfo(session.fileName, pos, { allowRenameOfImportPath: false })).canRename) return null
                const locs = (await svc.findRenameLocations(session.fileName, pos, false, false, false)) ?? []
                const byFile = new Map<string, { start: number, length: number, newText: string }[]>()
                for (const l of locs) {
                    const f = norm(l.fileName)
                    const list = byFile.get(f) ?? []
                    list.push({
                        start: l.textSpan.start,
                        length: l.textSpan.length,
                        newText: (l.prefixText ?? '') + next + (l.suffixText ?? ''),
                    })
                    byFile.set(f, list)
                }
                return byFile
            })
            if (!groups?.size) return false
            const main = norm(session.fileName)
            // Monaco:先把选区收到光标处,再一次性应用(本文件一个撤销步)
            const head = view.state.selection.main.head
            view.dispatch(view.state.update({ selection: EditorSelection.single(head), userEvent: 'select' }))
            let changed = false
            for (const [file, edits] of groups) {
                if (file === main) {
                    changed = applyTextChanges(view, edits.map(e => ({ span: { start: e.start, length: e.length }, newText: e.newText })), 'input.rename') || changed
                    continue
                }
                // 别的打开着的编辑器 → 写进那个编辑器;宿主文件 → 改项目里的副本(宿主用 listTsFiles / getFileText 读回)
                const other = session.editorFor(file)
                if (other) { other.applyTextChanges(edits, 'input.rename'); changed = true; continue }
                const text = session.getFileText(file)
                if (text == null) continue
                let out = text
                for (const e of [...edits].sort((a, b) => b.start - a.start))
                    out = out.slice(0, e.start) + e.newText + out.slice(e.start + e.length)
                session.updateFile(file, out)
                changed = true
            }
            return changed
        },

        async formatDocument(view) {
            if (view.state.readOnly) return false
            const edits = await withSvc(view, async (svc) => {
                const opts: import('typescript').FormatCodeSettings = {
                    ...tsFormatOptions(view.state, 'format'),
                    insertSpaceAfterCommaDelimiter: true,
                    insertSpaceAfterKeywordsInControlFlowStatements: true,
                    insertSpaceAfterFunctionKeywordForAnonymousFunctions: true,
                    placeOpenBraceOnNewLineForFunctions: false,
                    placeOpenBraceOnNewLineForControlBlocks: false,
                }
                return (await svc.getFormattingEditsForDocument(session.fileName, opts)) ?? []
            })
            if (!edits?.length) return false
            return applyTextChanges(
                view,
                edits.map(e => ({ span: e.span, newText: e.newText })),
                'input.format',
            )
        },

        async formatSelection(view) {
            if (view.state.readOnly) return false
            // Monaco FormatSelectionAction:每个选区各算;空选区 = 它所在的整行;相交/相接的范围先合并
            const doc = view.state.doc
            const sorted = view.state.selection.ranges
                .map(r => r.empty ? { from: doc.lineAt(r.head).from, to: doc.lineAt(r.head).to } : { from: r.from, to: r.to })
                .sort((a, b) => a.from - b.from || a.to - b.to)
            const ranges: { from: number, to: number }[] = []
            for (const r of sorted) {
                const last = ranges[ranges.length - 1]
                if (last && r.from <= last.to) last.to = Math.max(last.to, r.to)
                else ranges.push({ ...r })
            }
            const edits = await withSvc(view, async (svc) => {
                const fopts: import('typescript').FormatCodeSettings = {
                    ...tsFormatOptions(view.state, 'format'),
                    insertSpaceAfterCommaDelimiter: true,
                    insertSpaceAfterKeywordsInControlFlowStatements: true,
                    insertSpaceAfterFunctionKeywordForAnonymousFunctions: true,
                    placeOpenBraceOnNewLineForFunctions: false,
                    placeOpenBraceOnNewLineForControlBlocks: false,
                }
                type TextChange = import('typescript').TextChange
                const compute = async (r: { from: number, to: number }): Promise<TextChange[]> =>
                    [...((await svc.getFormattingEditsForRange(session.fileName, r.from, r.to, fopts)) ?? [])]
                const touch = (a: TextChange, b: TextChange) =>
                    a.span.start <= b.span.start + b.span.length && b.span.start <= a.span.start + a.span.length
                const hasIntersect = (a: TextChange[], b: TextChange[]) => a.some(x => b.some(y => touch(x, y)))
                // 不同范围算出的编辑相交 → 合并两个范围重算(Monaco formatDocumentRangesWithProvider)
                const lists: TextChange[][] = []
                for (const r of ranges) lists.push(await compute(r))
                for (let i = 0; i < ranges.length; i++) {
                    for (let j = i + 1; j < ranges.length; j++) {
                        if (!hasIntersect(lists[i], lists[j])) continue
                        ranges[i] = { from: Math.min(ranges[i].from, ranges[j].from), to: Math.max(ranges[i].to, ranges[j].to) }
                        lists[i] = await compute(ranges[i])
                        ranges.splice(j, 1)
                        lists.splice(j, 1)
                        j = i
                    }
                }
                return lists.flat()
            })
            if (!edits?.length) return false
            return applyTextChanges(
                view,
                edits.map(e => ({ span: e.span, newText: e.newText })),
                'input.format',
            )
        },

        async organizeImports(view) {
            if (view.state.readOnly) return false
            const packs = await withSvc(view, async (svc) => {
                const opts = tsFormatOptions(view.state, 'codefix')
                return (await svc.organizeImports(
                    { type: 'file', fileName: session.fileName },
                    opts,
                    { includePackageJsonAutoImports: 'off' },
                )) ?? []
            })
            if (!packs?.length) return false
            const main = norm(session.fileName)
            const edits = packs
                .filter(p => norm(p.fileName) === main)
                .flatMap(p => p.textChanges)
            if (!edits.length) return false
            return applyTextChanges(
                view,
                edits.map(e => ({ span: e.span, newText: e.newText })),
                'input.organize',
            )
        },

        async addMissingImports(view) {
            if (view.state.readOnly) return false
            const packs = await withSvc(view, async (svc) => {
                const opts = tsFormatOptions(view.state, 'codefix')
                return await svc.getCombinedCodeFix(
                    { type: 'file', fileName: session.fileName },
                    'fixMissingImport',
                    opts,
                    {},
                )
            })
            const changes = packs?.changes
            if (!changes?.length) return false
            const main = norm(session.fileName)
            const edits = changes
                .filter(p => norm(p.fileName) === main)
                .flatMap(p => p.textChanges)
            if (!edits.length) return false
            return applyTextChanges(
                view,
                edits.map(e => ({ span: e.span, newText: e.newText })),
                'input.fix',
            )
        },

        async removeUnusedImports(view) {
            if (view.state.readOnly) return false
            const packs = await withSvc(view, async (svc) => {
                const opts = tsFormatOptions(view.state, 'codefix')
                const combined = await svc.getCombinedCodeFix(
                    { type: 'file', fileName: session.fileName },
                    'unusedIdentifier_deleteImports',
                    opts,
                    {},
                )
                if (combined?.changes?.length) return combined.changes
                const diags = [
                    ...((await svc.getSemanticDiagnostics(session.fileName)) ?? []),
                    ...((await svc.getSyntacticDiagnostics(session.fileName)) ?? []),
                ]
                const edits: { fileName: string, textChanges: { span: { start: number, length: number }, newText: string }[] }[] = []
                const seen = new Set<string>()
                for (const d of diags) {
                    if (d.start == null) continue
                    if (d.code !== 6133 && d.code !== 6192 && d.code !== 6196) continue
                    let fixes: readonly import('typescript').CodeFixAction[] = []
                    try {
                        fixes = (await svc.getCodeFixesAtPosition(
                            session.fileName,
                            d.start,
                            d.start + (d.length ?? 1),
                            [d.code],
                            opts,
                            {},
                        )) ?? []
                    }
                    catch { continue }
                    for (const f of fixes) {
                        const desc = f.description.toLowerCase()
                        if (!desc.includes('import') && f.fixName !== 'unusedIdentifier') continue
                        if (f.fixName === 'unusedIdentifier' && !desc.includes('import')) continue
                        for (const fc of f.changes ?? []) {
                            for (const tc of fc.textChanges) {
                                const key = `${fc.fileName}:${tc.span.start}:${tc.span.length}:${tc.newText}`
                                if (seen.has(key)) continue
                                seen.add(key)
                                edits.push({ fileName: fc.fileName, textChanges: [tc] })
                            }
                        }
                    }
                }
                return edits
            })
            if (!packs?.length) return false
            const main = norm(session.fileName)
            const edits = packs
                .filter(p => norm(p.fileName) === main)
                .flatMap(p => p.textChanges)
            if (!edits.length) return false
            return applyTextChanges(
                view,
                edits.map(e => ({ span: e.span, newText: e.newText })),
                'input.fix',
            )
        },

        async outlineSymbols(view) {
            // Monaco tsMode outlineTypeTable;根 script 条目是透明的,顶层符号的 containerName 为空
            const KIND: Record<string, number> = {
                module: SymbolKind.Module, class: SymbolKind.Class, enum: SymbolKind.Enum, interface: SymbolKind.Interface,
                method: SymbolKind.Method, property: SymbolKind.Property, getter: SymbolKind.Property, setter: SymbolKind.Property,
                var: SymbolKind.Variable, let: SymbolKind.Variable, const: SymbolKind.Variable, 'local var': SymbolKind.Variable,
                function: SymbolKind.Function, 'local function': SymbolKind.Function,
            }
            const rows = await withSvc(view, async (svc) => {
                const items = await svc.getNavigationBarItems(session.fileName)
                const out: OutlineSymbol[] = []
                const walk = (list: import('typescript').NavigationBarItem[], container: string) => {
                    for (const it of list) {
                        const span = it.spans[0]
                        if (it.kind === 'script') { if (it.childItems?.length) walk(it.childItems, ''); continue }
                        if (span && it.text) {
                            out.push({
                                name: it.text, kind: KIND[it.kind] ?? SymbolKind.Variable, container,
                                from: span.start, to: span.start + span.length, sel: span.start,
                            })
                        }
                        if (it.childItems?.length) walk(it.childItems, it.text || container)
                    }
                }
                walk(items, '')
                return out
            })
            return rows ?? []
        },

        async goToSymbol(view, prefix) {
            const symbols = await actions.outlineSymbols(view)
            if (!symbols.length) return false
            return openQuickOutline(view, symbols, prefix)
        },

        async listWorkspaceSymbols(view, query) {
            const rows = await withSvc(view, async (svc) => {
                const items = (await svc.getNavigateToItems(query, 80)) ?? []
                const main = norm(session.fileName)
                return items
                    .filter(i => norm(i.fileName) === main)
                    .map(i => ({
                        name: i.name,
                        kind: String(i.kind),
                        start: i.textSpan.start,
                        length: i.textSpan.length,
                    }))
            })
            return rows ?? []
        },

        async goToWorkspaceSymbol(view) {
            const rows = await actions.listWorkspaceSymbols(view, '')
            if (!rows.length) return false
            const picked = await pickList(
                view,
                'Go to Symbol in Workspace',
                rows.map(r => ({ label: r.name, detail: r.kind, value: r })),
            )
            if (!picked) return false
            jumpTo(view, picked.start, picked.start + picked.length)
            return true
        },

        // Monaco 的 TS 模式没有 SelectionRangeProvider:扩缩选只有词和括号(见 tssmart)
        async expandSmartSelection(view) {
            return smartSelect(view, true, true)
        },

        async shrinkSmartSelection(view) {
            return smartSelect(view, false, true)
        },

        async goToImplementation(view) {
            const pos = view.state.selection.main.head
            const rows = await collectImpls(view, pos)
            if (!rows) return false // 等结果期间文档变了
            if (!rows.length) { noResult(view, pos, 'implementation'); return false }
            const alt = runAlternative(view, rows, pos, getOption(view.state, 'gotoLocation').alternativeImplementationCommand, 'editor.action.goToImplementation')
            if (alt) return alt
            navigate(view, rows, 'Implementations', false, 'implementation')
            return true
        },

        async peekImplementation(view) {
            const pos = view.state.selection.main.head
            const rows = await collectImpls(view, pos)
            if (!rows) return false // 等结果期间文档变了
            if (!rows.length) { noResult(view, pos, 'implementation'); return false }
            navigate(view, rows, 'Implementations', true, 'implementation')
            return true
        },

        async goToTypeDefinition(view) {
            const pos = view.state.selection.main.head
            const rows = await collectTypeDefs(view, pos)
            if (!rows) return false // 等结果期间文档变了
            if (!rows.length) { noResult(view, pos, 'type definition'); return false }
            // 同 Go to Definition:alternativeTypeDefinitionCommand 默认也是 Go to References
            const alt = runAlternative(view, rows, pos, getOption(view.state, 'gotoLocation').alternativeTypeDefinitionCommand, 'editor.action.goToTypeDefinition')
            if (alt) return alt
            navigate(view, rows, 'Type Definitions', false, 'typeDefinition')
            return true
        },

        async peekTypeDefinition(view) {
            const pos = view.state.selection.main.head
            const rows = await collectTypeDefs(view, pos)
            if (!rows) return false // 等结果期间文档变了
            if (!rows.length) { noResult(view, pos, 'type definition'); return false }
            navigate(view, rows, 'Type Definitions', true, 'typeDefinition')
            return true
        },

        async addTypeAnnotation(view) {
            if (view.state.readOnly) return false
            const pos = view.state.selection.main.head
            // Program / 检查器过不了线程:在语言服务一侧算好插入点和类型文本
            const edit = await withSvc(view, svc => svc.$typeAnnotation(session.fileName, pos))
            if (!edit) return false
            view.dispatch(view.state.update({
                changes: { from: edit.from, insert: edit.insert },
                userEvent: 'input.fix',
            }))
            return true
        },

        async addMissingMembers(view) {
            if (view.state.readOnly) return false
            const pos = view.state.selection.main.head
            const packs = await withSvc(view, async (svc) => {
                const opts = tsFormatOptions(view.state, 'codefix')
                const ids = [
                    'fixClassIncorrectlyImplementsInterface',
                    'fixClassDoesntImplementInheritedAbstractMember',
                ]
                for (const id of ids) {
                    try {
                        const pack = await svc.getCombinedCodeFix(
                            { type: 'file', fileName: session.fileName },
                            id,
                            opts,
                            {},
                        )
                        if (pack?.changes?.length) return pack.changes
                    }
                    catch { /* */ }
                }
                const codes = [2420, 2654, 2515, 2564]
                let fixes: readonly import('typescript').CodeFixAction[] = []
                try {
                    fixes = (await svc.getCodeFixesAtPosition(
                        session.fileName, pos, pos, codes, opts, {},
                    )) ?? []
                }
                catch { fixes = [] }
                if (!fixes.length) {
                    const diags = (await svc.getSemanticDiagnostics(session.fileName)) ?? []
                    const extra: import('typescript').CodeFixAction[] = []
                    for (const d of diags) {
                        if (d.start == null || !codes.includes(d.code)) continue
                        try {
                            extra.push(...((await svc.getCodeFixesAtPosition(
                                session.fileName,
                                d.start,
                                d.start + (d.length ?? 1),
                                [d.code],
                                opts,
                                {},
                            )) ?? []))
                        }
                        catch { /* */ }
                    }
                    fixes = extra
                }
                const out: { fileName: string, textChanges: { span: { start: number, length: number }, newText: string }[] }[] = []
                for (const f of fixes) {
                    for (const fc of f.changes ?? [])
                        out.push({ fileName: fc.fileName, textChanges: [...fc.textChanges] })
                }
                return out
            })
            if (!packs?.length) return false
            const main = norm(session.fileName)
            const edits = packs
                .filter(p => norm(p.fileName) === main)
                .flatMap(p => p.textChanges)
            if (!edits.length) return false
            return applyTextChanges(
                view,
                edits.map(e => ({ span: e.span, newText: e.newText })),
                'input.fix',
            )
        },

        async removeUnusedLocals(view) {
            if (view.state.readOnly) return false
            const edits = await withSvc(view, async (svc) => {
                const opts = tsFormatOptions(view.state, 'codefix')
                const text = materializeDoc(view.state)
                const isImportLine = (start: number) => {
                    let i = start
                    while (i > 0 && text[i - 1] !== '\n') i--
                    while (i < text.length && (text[i] === ' ' || text[i] === '\t')) i++
                    return text[i] === 'i' && text[i + 1] === 'm' && text[i + 2] === 'p'
                        && text[i + 3] === 'o' && text[i + 4] === 'r' && text[i + 5] === 't'
                        && (i + 6 >= text.length || text[i + 6] === ' ' || text[i + 6] === '\t' || text[i + 6] === '{')
                }
                const out: { span: { start: number, length: number }, newText: string }[] = []
                const seen = new Set<string>()
                const take = (span: { start: number, length: number }, newText: string) => {
                    if (isImportLine(span.start)) return
                    const key = `${span.start}:${span.length}:${newText}`
                    if (seen.has(key)) return
                    seen.add(key)
                    out.push({ span, newText })
                }
                try {
                    const pack = await svc.getCombinedCodeFix(
                        { type: 'file', fileName: session.fileName },
                        'unusedIdentifier',
                        opts,
                        {},
                    )
                    for (const fc of pack?.changes ?? []) {
                        if (norm(fc.fileName) !== norm(session.fileName)) continue
                        for (const tc of fc.textChanges) take(tc.span, tc.newText)
                    }
                }
                catch { /* */ }
                if (!out.length) {
                    const diags = (await svc.getSemanticDiagnostics(session.fileName)) ?? []
                    for (const d of diags) {
                        if (d.start == null || d.code !== 6133) continue
                        if (isImportLine(d.start)) continue
                        let fixes: readonly import('typescript').CodeFixAction[] = []
                        try {
                            fixes = (await svc.getCodeFixesAtPosition(
                                session.fileName,
                                d.start,
                                d.start + (d.length ?? 1),
                                [6133],
                                opts,
                                {},
                            )) ?? []
                        }
                        catch { fixes = [] }
                        for (const f of fixes) {
                            for (const fc of f.changes ?? []) {
                                if (norm(fc.fileName) !== norm(session.fileName)) continue
                                for (const tc of fc.textChanges) take(tc.span, tc.newText)
                            }
                        }
                        if (!fixes.length) {
                            let from = d.start
                            while (from > 0 && text[from - 1] !== '\n') from--
                            let to = d.start + (d.length ?? 1)
                            while (to < text.length && text[to] !== '\n') to++
                            if (to < text.length && text[to] === '\n') to++
                            take({ start: from, length: to - from }, '')
                        }
                    }
                }
                return out
            })
            if (!edits?.length) return false
            return applyTextChanges(view, edits, 'input.fix')
        },
    }
    return actions
}

// 简易列表选择(Go to Symbol / Command Palette 共用)
export function pickList<T>(
    view: EditorView,
    title: string,
    entries: { label: string, detail?: string, value: T }[],
): Promise<T | null> {
    return new Promise(resolve => {
        const root = document.createElement('div')
        root.className = 'cm-picker'
        const box = document.createElement('div')
        box.className = 'cm-picker-box'
        const head = document.createElement('div')
        head.className = 'cm-picker-title'
        head.textContent = title
        const input = document.createElement('input')
        input.className = 'cm-picker-input'
        input.placeholder = 'Filter…'
        input.spellcheck = false
        const list = document.createElement('div')
        list.className = 'cm-picker-list'
        box.append(head, input, list)
        root.appendChild(box)
        inheritThemeVars(view, root)
        // 全屏遮罩挂在编辑器所在文档的 body(FLOATING_ROOTS);生命周期绑编辑器:view 销毁即关
        const doc = view.dom.ownerDocument
        const win = doc.defaultView ?? window
        doc.body.appendChild(root)

        let filtered = entries
        let active = 0
        let closed = false

        const finish = (v: T | null) => {
            if (closed) return
            closed = true
            root.remove()
            win.removeEventListener('keydown', onWinKey, true)
            offDestroy()
            if (view.dom.isConnected) view.contentDOM.focus()
            resolve(v)
        }
        const offDestroy = view.onDestroy(() => finish(null))

        const paint = () => {
            list.textContent = ''
            filtered.forEach((e, i) => {
                const row = document.createElement('div')
                row.className = 'cm-picker-item' + (i === active ? ' active' : '')
                const lab = document.createElement('span')
                lab.className = 'cm-picker-label'
                lab.textContent = e.label
                row.appendChild(lab)
                if (e.detail) {
                    const d = document.createElement('span')
                    d.className = 'cm-picker-detail'
                    d.textContent = e.detail
                    row.appendChild(d)
                }
                row.addEventListener('mousedown', ev => {
                    ev.preventDefault()
                    finish(e.value)
                })
                list.appendChild(row)
            })
            const act = list.children[active] as HTMLElement | undefined
            act?.scrollIntoView?.({ block: 'nearest' })
        }

        const refilter = () => {
            const q = input.value.trim().toLowerCase()
            filtered = !q ? entries : entries.filter(e =>
                e.label.toLowerCase().includes(q) || (e.detail?.toLowerCase().includes(q) ?? false))
            active = 0
            paint()
        }

        const onWinKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault()
                finish(null)
            }
        }
        win.addEventListener('keydown', onWinKey, true)

        input.addEventListener('input', refilter)
        input.addEventListener('keydown', e => {
            if (e.key === 'ArrowDown') {
                e.preventDefault()
                active = Math.min(filtered.length - 1, active + 1)
                paint()
            } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                active = Math.max(0, active - 1)
                paint()
            } else if (e.key === 'Enter') {
                e.preventDefault()
                if (filtered[active]) finish(filtered[active].value)
                else finish(null)
            } else if (e.key === 'Escape') {
                e.preventDefault()
                finish(null)
            }
        })
        root.addEventListener('mousedown', e => {
            if (e.target === root) finish(null)
        })

        refilter()
        requestAnimationFrame(() => input.focus())
    })
}

export function tsActionsAvailable(lang: string): boolean {
    const l = lang.toLowerCase()
    return l === 'typescript' || l === 'ts' || l === 'tsx' || l === 'javascript' || l === 'js' || l === 'jsx'
}
