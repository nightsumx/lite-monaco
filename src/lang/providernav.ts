// languages.registerImplementationProvider / registerTypeDefinitionProvider / registerDeclarationProvider /
// registerReferenceProvider 背后的跳转与 Peek(Monaco gotoSymbol/browser/goToCommands.ts + goToSymbol.ts)。
//
// 取结果 = Monaco getLocationLinks:对 registry.ordered(model) 里每个 provider 并发提问,抛错的当没结果,
// 按 scheme 过滤(同 scheme 一律放行,内部 scheme 过滤掉),打平成 LocationLink[];排序 / 去重 / 分组交给 ReferencesModel。
// 命中后的处理(peek / 跳转 / gotoAndPeek / goto / opener / 备选命令)和 TS 导航共用 tsactions.navigateLocations。
// 同一份动作表也给 TS 编辑器用:有 provider 注册时 provider 优先,否则落回 TS 语言服务。
import type { EditorView } from '../core/view/editorview'
import type { ViewAction } from '../api/actions'
import type { ITextModel } from '../api/model'
import type * as T from '../monaco/languages-types'
import { languageFeatures, type LanguageFeatureRegistry } from './languagefeatures'
import { CancellationTokenSource } from './async'
import type { CancellationToken } from './providers'
import { ReferencesModel } from './referencesmodel'
import { navigateLocations, noResult, type GotoKind, type LocRow } from './tsactions'
import type { Position, IRange } from '../api/position'
import { Uri } from '../api/uri'
import { docOffset } from '../api/commands'
import { getModel as getModelByUri } from '../api/model'
import { executeCommandById } from '../api/commands'
import { getOption } from '../core/options'
import { PositionOffsetTransformer } from '../core/model/posoffset'

type Link = T.LocationLink | T.Location
interface NavKind {
    goId: string
    peekId: string
    goLabel: string
    peekLabel: string
    title: string
    noun: string
    kind: GotoKind
    registry: () => LanguageFeatureRegistry<unknown>
    alt: 'alternativeDeclarationCommand' | 'alternativeTypeDefinitionCommand' | 'alternativeImplementationCommand' | 'alternativeReferenceCommand'
    provide: (p: never, model: ITextModel, pos: Position, token: CancellationToken, compact: boolean) => Promise<Link[] | Link | null | undefined>
}

const asArray = <X>(v: X | X[] | null | undefined): X[] => v == null ? [] : Array.isArray(v) ? v : [v]

/** Monaco getReferencesAtPosition 的 compact:恰好两条且去掉声明后只剩一条时,用去掉声明那一条 */
async function provideReferences(p: T.ReferenceProvider, model: ITextModel, pos: Position, token: CancellationToken, compact: boolean): Promise<T.Location[] | undefined> {
    const keep = (xs: T.Location[] | null | undefined) => xs?.filter(r => keepScheme(model, r)) ?? undefined
    const result = keep(await p.provideReferences(model, pos, { includeDeclaration: true }, token))
    if (!compact || !result || result.length !== 2) return result
    const without = keep(await p.provideReferences(model, pos, { includeDeclaration: false }, token))
    return without && without.length === 1 ? without : result
}

// Monaco shouldIncludeLocationLink:同 scheme 一律放行;其余滤掉内部 scheme
const INTERNAL_SCHEMES = new Set(['walkThroughSnippet', 'vscode-chat-code-block', 'vscode-chat-code-compare-block'])
function keepScheme(model: ITextModel, loc: Link): boolean {
    const scheme = loc.uri.scheme
    return scheme === model.uri.scheme || !INTERNAL_SCHEMES.has(scheme)
}

const KINDS: NavKind[] = [
    {
        goId: 'editor.action.revealDeclaration', peekId: 'editor.action.peekDeclaration', goLabel: 'Go to Declaration', peekLabel: 'Peek Declaration',
        title: 'Declarations', noun: 'declaration', kind: 'declaration', alt: 'alternativeDeclarationCommand',
        registry: () => languageFeatures.declarationProvider as LanguageFeatureRegistry<unknown>,
        provide: (p: T.DeclarationProvider, m, pos, t) => Promise.resolve(p.provideDeclaration(m, pos, t)) as never,
    },
    {
        goId: 'editor.action.goToTypeDefinition', peekId: 'editor.action.peekTypeDefinition', goLabel: 'Go to Type Definition', peekLabel: 'Peek Type Definition',
        title: 'Type Definitions', noun: 'type definition', kind: 'typeDefinition', alt: 'alternativeTypeDefinitionCommand',
        registry: () => languageFeatures.typeDefinitionProvider as LanguageFeatureRegistry<unknown>,
        provide: (p: T.TypeDefinitionProvider, m, pos, t) => Promise.resolve(p.provideTypeDefinition(m, pos, t)) as never,
    },
    {
        goId: 'editor.action.goToImplementation', peekId: 'editor.action.peekImplementation', goLabel: 'Go to Implementations', peekLabel: 'Peek Implementations',
        title: 'Implementations', noun: 'implementation', kind: 'implementation', alt: 'alternativeImplementationCommand',
        registry: () => languageFeatures.implementationProvider as LanguageFeatureRegistry<unknown>,
        provide: (p: T.ImplementationProvider, m, pos, t) => Promise.resolve(p.provideImplementation(m, pos, t)) as never,
    },
    {
        goId: 'editor.action.goToReferences', peekId: 'editor.action.referenceSearch.trigger', goLabel: 'Go to References', peekLabel: 'Peek References',
        title: 'References', noun: 'references', kind: 'reference', alt: 'alternativeReferenceCommand',
        registry: () => languageFeatures.referenceProvider as LanguageFeatureRegistry<unknown>,
        // Monaco:Go to References 用 compact,Peek References 不用 —— 由调用点传
        provide: (p: T.ReferenceProvider, m, pos, t, compact) => provideReferences(p, m, pos, t, compact),
    },
]

const modelOf = (view: EditorView): ITextModel | null => (view as unknown as { getModel?: () => ITextModel | null }).getModel?.() ?? null

/** 此 model 上这一类有没有 provider(动作的 precondition / context key 都看它) */
export function hasNavProvider(view: EditorView, goId: string): boolean {
    const model = modelOf(view)
    const k = KINDS.find(x => x.goId === goId || x.peekId === goId)
    return !!model && !!k && k.registry().has(model)
}

/** Monaco getLocationLinks:全部 provider 并发问,出错 / 无结果丢掉,按 scheme 过滤 */
async function collectLinks(k: NavKind, model: ITextModel, pos: Position, token: CancellationToken, compact: boolean): Promise<Link[]> {
    const providers = k.registry().ordered(model)
    const values = await Promise.all(providers.map(async p => {
        try { return asArray(await k.provide(p as never, model, pos, token, compact)) } catch (e) { console.error(e); return [] as Link[] }
    }))
    return values.flat().filter(l => l && keepScheme(model, l))
}

const rangeOf = (l: Link): IRange => ('targetSelectionRange' in l && l.targetSelectionRange) || l.range

/** 结果集 → LocRow:本文件用 doc 偏移,别的文件有已建 model 就用它的文本(预览 / peek),没有就只留 uri + 范围 */
function toRows(view: EditorView, model: ITextModel, links: Link[]): { rows: LocRow[], refs: ReferencesModel<{ uri: Uri, range: IRange }> } {
    const refs = new ReferencesModel(links.map(l => ({ uri: l.uri, range: rangeOf(l) })), '')
    const self = model.uri.toString()
    const rows: LocRow[] = refs.references.map(o => {
        const r = o.range
        const file = String(o.uri)
        const local = file === self
        if (local) {
            const doc = view.state.doc
            const start = docOffset(doc, r.startLineNumber, r.startColumn)
            const end = docOffset(doc, r.endLineNumber, r.endColumn)
            return { start, length: Math.max(0, end - start), line: r.startLineNumber, preview: doc.line(Math.min(r.startLineNumber, doc.lines)).text.trim(), file, local, range: r }
        }
        const text = textOfUri(file)
        if (text == null) return { start: 0, length: 0, line: r.startLineNumber, preview: file, file, local, range: r }
        const tr = new PositionOffsetTransformer(text)
        const start = tr.getOffset({ lineNumber: r.startLineNumber, column: r.startColumn })
        const end = tr.getOffset({ lineNumber: r.endLineNumber, column: r.endColumn })
        const lineText = text.split(/\r?\n/)[r.startLineNumber - 1] ?? ''
        return { start, length: Math.max(0, end - start), line: r.startLineNumber, preview: lineText.trim(), file, local, range: r }
    })
    return { rows, refs }
}

const textOfUri = (file: string): string | null => {
    try { return getModelByUri(Uri.parse(file))?.getValue() ?? null } catch { return null }
}

const active = new Set<string>()

async function run(view: EditorView, k: NavKind, peek: boolean, muteMessage = false): Promise<boolean> {
    const model = modelOf(view)
    if (!model) return false
    const sel = view.state.selection.main
    const pos = sel.head
    const position = model.getPositionAt(view.state.doc.length === 0 ? 0 : modelOffsetOf(view, pos))
    const doc = view.state.doc
    const cts = new CancellationTokenSource()
    const links = await collectLinks(k, model, position, cts.token, !peek)
    // 文档在等待期间变了:位置对不上,放弃(Monaco EditorStateCancellationTokenSource)
    if (view.state.doc !== doc || view.state.selection.main.head !== pos) return false
    const { rows, refs } = toRows(view, model, links)
    const selfId = peek ? k.peekId : k.goId
    if (!rows.length) {
        if (!muteMessage) noResult(view, pos, k.noun)
        return false
    }
    // 已经站在唯一结果上 → 备选命令(gotoLocation.alternativeXxxCommand;防递归同 Monaco _activeAlternativeCommands)
    const here = refs.referenceAt(model.uri, position)
    const altId = (getOption(view.state, 'gotoLocation') as Record<string, string> | undefined)?.[k.alt]
    if (here && rows.length === 1 && altId && altId !== selfId && !active.has(altId)) {
        const alt = executeCommandById(view, altId)
        if (alt !== false) {
            active.add(selfId)
            try { await alt } finally { active.delete(selfId) }
            return true
        }
    }
    navigateLocations(view, rows, {
        title: k.title, peekMode: peek, kind: k.kind,
        file: model.uri.toString(), inMemory: model.uri.scheme === 'inmemory',
        textFor: f => f === model.uri.toString() ? model.getValue() : textOfUri(f),
    })
    return true
}

// model 位置按 model 的 EOL 数偏移,doc 里换行恒占 1;ITextModel.getPositionAt 吃 model 偏移
function modelOffsetOf(view: EditorView, docPos: number): number {
    const m = modelOf(view)!
    const line = view.state.doc.lineAt(docPos)
    return m.getOffsetAt({ lineNumber: line.number, column: docPos - line.from + 1 })
}

/**
 * 实例动作表里的导航动作。fallback:同 Monaco 动作 id 的内置实现(TS 语言服务);没 provider 注册时走它,
 * 没有 fallback 也没 provider → 动作 unsupported(precondition hasXxxProvider)。
 */
export function providerNavActions(fallback: Record<string, (view: EditorView) => Promise<boolean> | boolean> = {}): Record<string, ViewAction> {
    const out: Record<string, ViewAction> = {}
    for (const k of KINDS) {
        for (const peek of [false, true]) {
            const id = peek ? k.peekId : k.goId
            out[id] = {
                label: peek ? k.peekLabel : k.goLabel,
                supported: v => hasNavProvider(v, id) || !!fallback[id],
                run: v => hasNavProvider(v, id) ? run(v, k, peek) : fallback[id]?.(v),
            }
        }
    }
    return out
}
