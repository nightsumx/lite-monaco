// Monaco 的 CodeAction 协议 + getCodeActions(移植自 vscode editor/contrib/codeAction/{common/types,browser/codeAction,browser/codeActionKeybindingResolver}.ts)。
//
// 纯逻辑,不碰 DOM / 视图:provider 调度(selector 打分取自注册表)、kind 层级匹配(HierarchicalKind)、
// 过滤(include / excludes / includeSourceActions / onlyIncludePreferredActions)、
// 排序(AI 靠后;带 diagnostics 的在前;preferred 在前;其余保持给定顺序)、disabled 只留在 allActions、
// providedCodeActionKinds 预筛(不调用肯定无关的 provider)、文档项挑选、keybinding 解析(最具体的绑定胜)。
// 公开入口:languages.registerCodeActionProvider(languagefeatures.ts 的注册表)、getCodeActions。
import type { IMarkerData } from '../api/markers'
import type { WorkspaceEdit } from '../monaco/languages-types'
import type { IDisposable } from './providers'
import { CancellationTokenSource, isCancellationError, type CancellationToken } from './async'
import type { LanguageFeatureRegistry, FeatureModel } from './languagefeatures'

// ───────────── HierarchicalKind(Monaco base/common/hierarchicalKind) ─────────────
export class HierarchicalKind {
    static readonly sep = '.'
    /** 什么都不匹配的特殊 kind */
    static readonly None = new HierarchicalKind('@@none@@')
    static readonly Empty = new HierarchicalKind('')
    constructor(readonly value: string) { }
    equals(other: HierarchicalKind): boolean { return this.value === other.value }
    contains(other: HierarchicalKind): boolean { return this.equals(other) || this.value === '' || other.value.startsWith(this.value + HierarchicalKind.sep) }
    intersects(other: HierarchicalKind): boolean { return this.contains(other) || other.contains(this) }
    append(...parts: string[]): HierarchicalKind { return new HierarchicalKind((this.value ? [this.value, ...parts] : parts).join(HierarchicalKind.sep)) }
}

export const CodeActionKind = new class {
    readonly QuickFix = new HierarchicalKind('quickfix')
    readonly Refactor = new HierarchicalKind('refactor')
    readonly RefactorExtract = this.Refactor.append('extract')
    readonly RefactorInline = this.Refactor.append('inline')
    readonly RefactorMove = this.Refactor.append('move')
    readonly RefactorRewrite = this.Refactor.append('rewrite')
    readonly Notebook = new HierarchicalKind('notebook')
    readonly Source = new HierarchicalKind('source')
    readonly SourceOrganizeImports = this.Source.append('organizeImports')
    readonly SourceFixAll = this.Source.append('fixAll')
    readonly SurroundWith = this.Refactor.append('surround')
}

// ───────────── 协议类型(Monaco languages.CodeAction* 同形) ─────────────
export interface CodeActionCommand { id: string, title: string, tooltip?: string, arguments?: unknown[] }
export type CodeActionMarker = IMarkerData
export interface CodeAction {
    title: string
    command?: CodeActionCommand
    edit?: WorkspaceEdit
    diagnostics?: CodeActionMarker[]
    kind?: string
    isPreferred?: boolean
    isAI?: boolean
    disabled?: string
    ranges?: { startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number }[]
}
/** Monaco languages.CodeActionTriggerType(值与 Monaco 一致) */
export enum CodeActionTriggerType { Invoke = 1, Auto = 2 }
export interface CodeActionContext {
    /** Monaco 的 d.ts 声明为必有;运行时 getCodeActions 给空数组(provider 想要 marker 自己去 getModelMarkers) */
    readonly markers: IMarkerData[]
    readonly only?: string
    readonly trigger: CodeActionTriggerType
}
export interface CodeActionList extends IDisposable { readonly actions: ReadonlyArray<CodeAction> }
type MaybePromise<T> = T | null | undefined | PromiseLike<T | null | undefined>
export interface CodeActionProvider {
    displayName?: string
    extensionId?: string
    provideCodeActions(model: any, range: any, context: CodeActionContext, token: CancellationToken): MaybePromise<CodeActionList>
    /** 给 code action 补 edit;只在缺 edit 时调用 */
    resolveCodeAction?(codeAction: CodeAction, token: CancellationToken): MaybePromise<CodeAction>
    /** 这个 provider 会产出的 kind 列表(用来预筛,不调肯定无关的 provider) */
    readonly providedCodeActionKinds?: ReadonlyArray<string>
    readonly documentation?: ReadonlyArray<{ readonly kind: string, readonly command: CodeActionCommand }>
    _getAdditionalMenuItems?(context: CodeActionContext, actions: readonly CodeAction[]): CodeActionCommand[]
}

// ───────────── 触发 / 过滤(common/types) ─────────────
export enum CodeActionAutoApply { IfSingle = 'ifSingle', First = 'first', Never = 'never' }
export enum CodeActionTriggerSource {
    Refactor = 'refactor',
    RefactorPreview = 'refactor preview',
    Lightbulb = 'lightbulb',
    Default = 'other (default)',
    SourceAction = 'source action',
    QuickFix = 'quick fix action',
    FixAll = 'fix all',
    OrganizeImports = 'organize imports',
    AutoFix = 'auto fix',
    QuickFixHover = 'quick fix hover window',
    OnSave = 'save participants',
    ProblemsView = 'problems view',
}
export interface CodeActionFilter {
    readonly include?: HierarchicalKind
    readonly excludes?: readonly HierarchicalKind[]
    readonly includeSourceActions?: boolean
    readonly onlyIncludePreferredActions?: boolean
}
export interface CodeActionTrigger {
    readonly type: CodeActionTriggerType
    readonly triggerAction: CodeActionTriggerSource
    readonly filter?: CodeActionFilter
    readonly autoApply?: CodeActionAutoApply
    readonly context?: { readonly notAvailableMessage: string, readonly position: { lineNumber: number, column: number } }
}

function excludesAction(providedKind: HierarchicalKind, exclude: HierarchicalKind, include: HierarchicalKind | undefined): boolean {
    if (!exclude.contains(providedKind)) return false
    // include 比 exclude 更具体:不排除
    if (include && exclude.contains(include)) return false
    return true
}

/** provider 声明的 kind 可能是 filter 的子集或超集:有交集才值得调 */
export function mayIncludeActionsOfKind(filter: CodeActionFilter, providedKind: HierarchicalKind): boolean {
    if (filter.include && !filter.include.intersects(providedKind)) return false
    if (filter.excludes?.some(exclude => excludesAction(providedKind, exclude, filter.include))) return false
    // source action 只在明确要求时返回
    if (!filter.includeSourceActions && CodeActionKind.Source.contains(providedKind)) return false
    return true
}

export function filtersAction(filter: CodeActionFilter, action: CodeAction): boolean {
    const actionKind = action.kind ? new HierarchicalKind(action.kind) : undefined
    if (filter.include && (!actionKind || !filter.include.contains(actionKind))) return false
    if (filter.excludes && actionKind && filter.excludes.some(exclude => excludesAction(actionKind, exclude, filter.include))) return false
    if (!filter.includeSourceActions && actionKind && CodeActionKind.Source.contains(actionKind)) return false
    if (filter.onlyIncludePreferredActions && !action.isPreferred) return false
    return true
}

export class CodeActionCommandArgs {
    static fromUser(arg: unknown, defaults: { kind: HierarchicalKind, apply: CodeActionAutoApply }): CodeActionCommandArgs {
        if (!arg || typeof arg !== 'object') return new CodeActionCommandArgs(defaults.kind, defaults.apply, false)
        const a = arg as { kind?: unknown, apply?: unknown, preferred?: unknown }
        return new CodeActionCommandArgs(
            typeof a.kind === 'string' ? new HierarchicalKind(a.kind) : defaults.kind,
            CodeActionCommandArgs.apply(a.apply, defaults.apply),
            typeof a.preferred === 'boolean' ? a.preferred : false)
    }
    private static apply(v: unknown, def: CodeActionAutoApply): CodeActionAutoApply {
        switch (typeof v === 'string' ? v.toLowerCase() : '') {
            case 'first': return CodeActionAutoApply.First
            case 'never': return CodeActionAutoApply.Never
            case 'ifsingle': return CodeActionAutoApply.IfSingle
            default: return def
        }
    }
    private constructor(readonly kind: HierarchicalKind, readonly apply: CodeActionAutoApply, readonly preferred: boolean) { }
}

export class CodeActionItem {
    constructor(
        readonly action: CodeAction,
        readonly provider: CodeActionProvider | undefined,
        public highlightRange?: boolean,
    ) { }

    async resolve(token: CancellationToken): Promise<this> {
        if (this.provider?.resolveCodeAction && !this.action.edit) {
            let action: CodeAction | undefined | null
            try { action = await this.provider.resolveCodeAction(this.action, token) } catch (err) { console.error(err) }
            if (action) this.action.edit = action.edit
        }
        return this
    }
}

export interface CodeActionSet extends IDisposable {
    readonly validActions: readonly CodeActionItem[]
    readonly allActions: readonly CodeActionItem[]
    readonly documentation: readonly CodeActionCommand[]
    readonly hasAutoFix: boolean
    readonly hasAIFix: boolean
    readonly allAIFixes: boolean
}

// ───────────── getCodeActions(browser/codeAction) ─────────────
export const codeActionCommandId = 'editor.action.codeAction'
export const quickFixCommandId = 'editor.action.quickFix'
export const autoFixCommandId = 'editor.action.autoFix'
export const refactorCommandId = 'editor.action.refactor'
export const refactorPreviewCommandId = 'editor.action.refactor.preview'
export const sourceActionCommandId = 'editor.action.sourceAction'
export const organizeImportsCommandId = 'editor.action.organizeImports'
export const fixAllCommandId = 'editor.action.fixAll'

const nonEmpty = (a: readonly unknown[] | undefined): boolean => !!a && a.length > 0
const preferredCmp = (a: CodeAction, b: CodeAction): number => a.isPreferred && !b.isPreferred ? -1 : !a.isPreferred && b.isPreferred ? 1 : 0

function codeActionsComparator({ action: a }: CodeActionItem, { action: b }: CodeActionItem): number {
    if (a.isAI && !b.isAI) return 1
    if (!a.isAI && b.isAI) return -1
    if (nonEmpty(a.diagnostics)) return nonEmpty(b.diagnostics) ? preferredCmp(a, b) : -1
    if (nonEmpty(b.diagnostics)) return 1
    return preferredCmp(a, b) // 都没有 diagnostics
}

class ManagedCodeActionSet implements CodeActionSet {
    readonly validActions: readonly CodeActionItem[]
    readonly allActions: readonly CodeActionItem[]
    constructor(actions: readonly CodeActionItem[], readonly documentation: readonly CodeActionCommand[], private readonly disposables: IDisposable[]) {
        this.allActions = [...actions].sort(codeActionsComparator) // Array.prototype.sort 稳定:同级保持给定顺序
        this.validActions = this.allActions.filter(({ action }) => !action.disabled)
    }
    get hasAutoFix() { return this.validActions.some(({ action: fix }) => !!fix.kind && CodeActionKind.QuickFix.contains(new HierarchicalKind(fix.kind)) && !!fix.isPreferred) }
    get hasAIFix() { return this.validActions.some(({ action: fix }) => !!fix.isAI) }
    get allAIFixes() { return this.validActions.every(({ action: fix }) => !!fix.isAI) }
    dispose() { for (const d of this.disposables.splice(0)) d.dispose() }
}

/** model 内容一变 / model 销毁就作废的 token(Monaco TextModelCancellationTokenSource) */
export class TextModelCancellationTokenSource extends CancellationTokenSource {
    private readonly _listeners: IDisposable[]
    constructor(model: { onDidChangeContent(cb: () => void): IDisposable, onWillDispose?(cb: () => void): IDisposable }, parent?: CancellationToken) {
        super(parent)
        this._listeners = [model.onDidChangeContent(() => this.cancel())]
        if (model.onWillDispose) this._listeners.push(model.onWillDispose(() => this.cancel()))
    }
    override dispose(cancel?: boolean) { for (const l of this._listeners) l.dispose(); super.dispose(cancel) }
}

const emptyResponse = { actions: [] as CodeActionItem[], documentation: undefined as CodeActionCommand | undefined }

export async function getCodeActions(
    registry: LanguageFeatureRegistry<CodeActionProvider>,
    model: FeatureModel & { onDidChangeContent(cb: () => void): IDisposable },
    rangeOrSelection: unknown,
    trigger: CodeActionTrigger,
    progress: { report(provider: CodeActionProvider): void },
    token: CancellationToken,
): Promise<CodeActionSet> {
    const filter = trigger.filter || {}
    const notebookFilter: CodeActionFilter = { ...filter, excludes: [...(filter.excludes || []), CodeActionKind.Notebook] }
    const codeActionContext: CodeActionContext = { markers: [], only: filter.include?.value, trigger: trigger.type }

    const cts = new TextModelCancellationTokenSource(model, token)
    // 自动触发(autosave / lightbulb)时排除 notebook 的 code action
    const providers = getCodeActionProviders(registry, model, trigger.type === CodeActionTriggerType.Auto ? notebookFilter : filter)

    const disposables: IDisposable[] = []
    const promises = providers.map(async provider => {
        const handle = setTimeout(() => progress.report(provider), 1250)
        try {
            const provided = await provider.provideCodeActions(model, rangeOrSelection, codeActionContext, cts.token)
            if (cts.token.isCancellationRequested) {
                provided?.dispose()
                return emptyResponse
            }
            if (provided) disposables.push(provided)
            const filtered = (provided?.actions || []).filter(action => action && filtersAction(filter, action))
            return { actions: filtered.map(action => new CodeActionItem(action, provider)), documentation: getDocumentationFromProvider(provider, filtered, filter.include) }
        } catch (err) {
            if (isCancellationError(err)) throw err
            console.error(err)
            return emptyResponse
        } finally {
            clearTimeout(handle)
        }
    })

    const listener = registry.onDidChange(() => {
        const next = registry.all(model)
        if (next.length !== providers.length || next.some((p, i) => p !== providers[i])) cts.cancel()
    })

    try {
        const results = await Promise.all(promises)
        const allActions = results.flatMap(x => x.actions)
        const documentation = [
            ...results.map(x => x.documentation).filter((d): d is CodeActionCommand => !!d),
            ...getAdditionalDocumentationForShowingActions(registry, model, trigger, allActions),
        ]
        return new ManagedCodeActionSet(allActions, documentation, disposables)
    } catch (err) {
        for (const d of disposables) d.dispose()
        throw err
    } finally {
        listener.dispose()
        cts.dispose()
    }
}

function getCodeActionProviders(registry: LanguageFeatureRegistry<CodeActionProvider>, model: FeatureModel, filter: CodeActionFilter): CodeActionProvider[] {
    return registry.all(model).filter(provider => {
        // 不知道它会产出什么 kind:只能调
        if (!provider.providedCodeActionKinds) return true
        return provider.providedCodeActionKinds.some(kind => mayIncludeActionsOfKind(filter, new HierarchicalKind(kind)))
    })
}

function* getAdditionalDocumentationForShowingActions(registry: LanguageFeatureRegistry<CodeActionProvider>, model: FeatureModel, trigger: CodeActionTrigger, actionsToShow: readonly CodeActionItem[]): Iterable<CodeActionCommand> {
    if (!model || !actionsToShow.length) return
    for (const provider of registry.all(model)) {
        if (provider._getAdditionalMenuItems) yield* provider._getAdditionalMenuItems({ markers: [], trigger: trigger.type, only: trigger.filter?.include?.value }, actionsToShow.map(item => item.action))
    }
}

function getDocumentationFromProvider(provider: CodeActionProvider, provided: readonly CodeAction[], only?: HierarchicalKind): CodeActionCommand | undefined {
    if (!provider.documentation) return undefined
    const documentation = provider.documentation.map(entry => ({ kind: new HierarchicalKind(entry.kind), command: entry.command }))
    if (only) {
        let best: { kind: HierarchicalKind, command: CodeActionCommand } | undefined
        for (const entry of documentation) {
            if (!entry.kind.contains(only)) continue
            // 取最具体的匹配
            if (!best || best.kind.contains(entry.kind)) best = entry
        }
        if (best) return best.command
    }
    // 否则看提供出来的 action 有没有命中的文档项
    for (const action of provided) {
        if (!action.kind) continue
        for (const entry of documentation) if (entry.kind.contains(new HierarchicalKind(action.kind))) return entry.command
    }
    return undefined
}

// ───────────── keybinding 解析(browser/codeActionKeybindingResolver) ─────────────
export interface KeybindingItemLike { readonly command?: string | null, readonly commandArgs?: unknown, readonly resolvedKeybinding?: unknown }
export interface KeybindingServiceLike { getKeybindings(): readonly KeybindingItemLike[] }
interface ResolveCodeActionKeybinding { readonly kind: HierarchicalKind, readonly preferred: boolean, readonly resolvedKeybinding: unknown }

export class CodeActionKeybindingResolver {
    private static readonly codeActionCommands: readonly string[] = [refactorCommandId, codeActionCommandId, sourceActionCommandId, organizeImportsCommandId, fixAllCommandId]
    constructor(private readonly keybindingService: KeybindingServiceLike) { }

    getResolver(): (action: CodeAction) => unknown | undefined {
        // 惰性:可能一次都不读
        let bindings: readonly ResolveCodeActionKeybinding[] | undefined
        const all = () => bindings ??= this.keybindingService.getKeybindings()
            .filter(item => CodeActionKeybindingResolver.codeActionCommands.indexOf(item.command!) >= 0)
            .filter(item => item.resolvedKeybinding)
            .map((item): ResolveCodeActionKeybinding => {
                // 这两条是内置命令,没有 commandArgs:按命令补
                let commandArgs = item.commandArgs
                if (item.command === organizeImportsCommandId) commandArgs = { kind: CodeActionKind.SourceOrganizeImports.value }
                else if (item.command === fixAllCommandId) commandArgs = { kind: CodeActionKind.SourceFixAll.value }
                return { resolvedKeybinding: item.resolvedKeybinding, ...CodeActionCommandArgs.fromUser(commandArgs, { kind: HierarchicalKind.None, apply: CodeActionAutoApply.Never }) }
            })
        return action => action.kind ? this.bestKeybindingForCodeAction(action, all())?.resolvedKeybinding : undefined
    }

    private bestKeybindingForCodeAction(action: CodeAction, candidates: readonly ResolveCodeActionKeybinding[]): ResolveCodeActionKeybinding | undefined {
        if (!action.kind) return undefined
        const kind = new HierarchicalKind(action.kind)
        return candidates
            .filter(c => c.kind.contains(kind))
            // 只对 preferred 生效的绑定,action 也得是 preferred
            .filter(c => c.preferred ? action.isPreferred : true)
            .reduceRight((best, c) => !best ? c : best.kind.contains(c.kind) ? c : best, undefined as ResolveCodeActionKeybinding | undefined)
    }
}
