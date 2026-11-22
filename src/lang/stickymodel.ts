// Sticky Scroll 的作用域模型来源 + 对外的候选 / 控制器类(Monaco stickyScrollModelProvider / stickyScrollProvider / stickyScrollController)。
//
// 作用域来源按 stickyScroll.defaultModel 的回退链:
//   outlineModel(languages.registerDocumentSymbolProvider 注册的 provider)→ 折叠范围(provider 折叠 / 缩进)→ 缩进。
// 没有注册 provider、或 provider 没给符号 = outline 无效(Monaco isModelValid),退回下一级。
// 注册表是 languagefeatures.ts 的 LanguageFeatureRegistry(selector / score / exclusive 同 Monaco)。
//
// 挑选行的规则(stickyCandidates / stickyWidgetState)是 core/feature/stickyscroll.ts 的纯函数,overlay 的 paint 和这里的
// StickyScrollController.findScrollWidgetState 共用同一份,不各算各的。
// 没有 DI:构造参数 (editor, languageFeaturesService?),缺省取全局 languageFeatures。
import type { IDisposable, LiteMonacoEditor } from '../api/types'
import { EditorOption } from '../core/options'
import { budgetForState } from '../core/perf'
import { hiddenLineRanges } from '../core/edit/fold'
import {
    filterHiddenCandidates, foldScopes, stickyCandidates, stickyMaxLines, stickyWidgetState,
    type StickyNode, type StickyOutlineSource, type StickyWidgetState,
} from '../core/feature/stickyscroll'
import { languageFeatures, type DocumentSymbol, type DocumentSymbolProvider, type FeatureModel, type LanguageFeatureRegistry } from './languagefeatures'
import { CancellationTokenSource, type CancellationToken } from './async'
import { lineSymbolsToSticky, type LineSymbol } from './outline'

type SymbolRegistry = { readonly documentSymbolProvider: LanguageFeatureRegistry<DocumentSymbolProvider> }

const toLineSymbol = (s: DocumentSymbol): LineSymbol => ({
    start: s.range.startLineNumber,
    end: s.range.endLineNumber,
    sel: s.selectionRange.startLineNumber,
    children: s.children?.map(toLineSymbol),
})

// Monaco _findSumOfRangesOfGroup:多个 provider 都给了结果时,取「Σ(range 末行 − selection 起始行)」最大的那一组
const sumOfRanges = (s: LineSymbol): number => (s.children ?? []).reduce((n, c) => n + sumOfRanges(c), 0) + s.end - s.sel

export interface OutlineResult {
    roots: StickyNode[]
    /** 用了哪个 provider 的结果(下次优先用它,Monaco outlineProviderId) */
    provider: DocumentSymbolProvider
}

/**
 * 向已注册的 DocumentSymbolProvider 取 outline,转成 sticky 作用域树。没有 provider / 都没给符号 → null。
 * model:`editor.getModel()`(要 uri / getLanguageId,给 registry 打分)。provider 抛错当它没给。
 */
export async function documentSymbolSticky(
    registry: LanguageFeatureRegistry<DocumentSymbolProvider>,
    model: FeatureModel,
    token: CancellationToken,
    preferred?: DocumentSymbolProvider,
): Promise<OutlineResult | null> {
    const providers = registry.ordered(model)
    if (!providers.length) return null
    const groups = await Promise.all(providers.map(async provider => {
        try {
            const syms = await provider.provideDocumentSymbols(model, token)
            return syms?.length ? { provider, syms: syms.map(toLineSymbol) } : null
        }
        catch { return null }
    }))
    if (token.isCancellationRequested) return null
    const valid = groups.filter((g): g is NonNullable<typeof g> => !!g)
    if (!valid.length) return null
    const best = valid.find(g => g.provider === preferred) ?? valid.reduce((a, b) => (b.syms.reduce((n, s) => n + sumOfRanges(s), 0) > a.syms.reduce((n, s) => n + sumOfRanges(s), 0) ? b : a))
    const roots = lineSymbolsToSticky(best.syms)
    return roots ? { roots, provider: best.provider } : null
}

/**
 * stickyScrollOverlay 的 outline 来源:languages.registerDocumentSymbolProvider 注册的 provider。
 * 内容变了 / provider 增减时重取(防抖 50ms,Monaco _updateSoon);没有结果 publish(null),overlay 退回折叠范围。
 */
export function documentSymbolStickyOutline(features?: SymbolRegistry): StickyOutlineSource {
    return (view, publish) => {
        const ed = view as unknown as LiteMonacoEditor
        const registry = (features ?? languageFeatures).documentSymbolProvider
        let timer: ReturnType<typeof setTimeout> | null = null
        let cts: CancellationTokenSource | null = null
        let preferred: DocumentSymbolProvider | undefined
        let published = false
        let gone = false
        const run = async () => {
            cts?.dispose(true)
            const mine = cts = new CancellationTokenSource()
            const model = ed.getModel?.() as FeatureModel | null | undefined
            const state = view.state
            if (!model || budgetForState(state).docClass === 'XL') {
                if (published) { published = false; publish(null) }
                return
            }
            const res = await documentSymbolSticky(registry, model, mine.token, preferred)
            if (gone || mine.token.isCancellationRequested) return
            // 取的过程中文档又变了:树的行号对不上,丢掉重取
            if (view.state.doc !== state.doc) { schedule(); return }
            preferred = res?.provider
            published = !!res
            publish(res?.roots ?? null)
        }
        const schedule = () => {
            if (timer) clearTimeout(timer)
            timer = setTimeout(() => { timer = null; void run() }, 50)
        }
        const offTr = view.onTransaction(tr => { if (tr.docChanged) schedule() })
        const offReg = registry.onDidChange(schedule)
        schedule()
        return () => {
            gone = true
            if (timer) clearTimeout(timer)
            cts?.dispose(true)
            offTr()
            offReg.dispose()
        }
    }
}

/** 多个 outline 来源按优先级合成一个:取第一个给出树的(都没有 → null,overlay 退回折叠范围) */
export function firstStickyOutline(...sources: (StickyOutlineSource | null | undefined)[]): StickyOutlineSource | null {
    const list = sources.filter((s): s is StickyOutlineSource => !!s)
    if (!list.length) return null
    if (list.length === 1) return list[0]
    return (view, publish) => {
        const latest: (StickyNode[] | null)[] = list.map(() => null)
        const offs = list.map((src, i) => src(view, roots => {
            latest[i] = roots
            publish(latest.find(r => r) ?? null)
        }))
        return () => { for (const off of offs) off() }
    }
}

// ———————————————— 候选 / 控制器(Monaco 同名类) ————————————————

/** Monaco StickyLineCandidate:作用域起始行 / 体末行(range 末行 − 1)/ 在 sticky 区里占的格(top / height) */
export class StickyLineCandidate {
    constructor(
        public readonly startLineNumber: number,
        public readonly endLineNumber: number,
        public readonly top: number,
        public readonly height: number,
    ) { }
}

export interface StickyRange { startLineNumber: number, endLineNumber: number }

/** 回调式事件(Monaco Event):订阅返回 IDisposable */
type Listener = () => void

function stickyOptions(editor: LiteMonacoEditor) {
    return editor.getOption(EditorOption.stickyScroll) as { enabled: boolean, maxLineCount: number, defaultModel: string, scrollWithEditor: boolean }
}

/**
 * Monaco StickyLineCandidateProvider:按 defaultModel 的回退链算作用域树,按行区间给候选。
 * update() 异步重算(provider 可能是异步的);内容变化 / 隐藏区变化 / provider 增减 / 换 model 时自己重算(内容变化防抖 50ms)。
 */
export class StickyLineCandidateProvider implements IDisposable {
    static readonly ID = 'store.contrib.stickyScrollController'

    private readonly _listeners = new Set<Listener>()
    private readonly _editor: LiteMonacoEditor
    private readonly _registry: LanguageFeatureRegistry<DocumentSymbolProvider>
    private _roots: StickyNode[] | null = null
    private _version: number | undefined
    private _cts: CancellationTokenSource | null = null
    private _preferred: DocumentSymbolProvider | undefined
    private _soon: ReturnType<typeof setTimeout> | null = null
    private _session: IDisposable[] = []
    private _config: IDisposable
    private _disposed = false

    constructor(editor: LiteMonacoEditor, languageFeaturesService?: SymbolRegistry, _languageConfigurationService?: unknown) {
        this._editor = editor
        this._registry = (languageFeaturesService ?? languageFeatures).documentSymbolProvider
        this._config = editor.onDidChangeConfiguration(e => { if (e.hasChanged(EditorOption.stickyScroll)) this._readConfiguration() })
        this._readConfiguration()
    }

    readonly onDidChangeStickyScroll = (listener: Listener): IDisposable => {
        this._listeners.add(listener)
        return { dispose: () => { this._listeners.delete(listener) } }
    }
    private _fire() { for (const l of [...this._listeners]) l() }

    private _readConfiguration() {
        for (const d of this._session) d.dispose()
        this._session = []
        if (!stickyOptions(this._editor).enabled) return
        const ed = this._editor
        this._session.push(
            ed.onDidChangeModel(() => { this._roots = null; this._fire(); void this.update() }),
            ed.onDidChangeHiddenAreas(() => { void this.update() }),
            ed.onDidChangeModelContent(() => this._updateSoon()),
            { dispose: this._registry.onDidChange(() => { void this.update() }).dispose },
            { dispose: () => { if (this._soon) clearTimeout(this._soon); this._soon = null } },
        )
        void this.update()
    }

    private _updateSoon() {
        if (this._soon) clearTimeout(this._soon)
        this._soon = setTimeout(() => { this._soon = null; void this.update() }, 50)
    }

    /** 当前作用域树对应的文档版本(Monaco getVersionId) */
    getVersionId(): number | undefined { return this._version }

    async update(): Promise<void> {
        if (this._disposed) return
        this._cts?.dispose(true)
        const cts = this._cts = new CancellationTokenSource()
        await this._updateModel(cts.token)
        if (!this._disposed) this._fire()
    }

    private async _updateModel(token: CancellationToken): Promise<void> {
        const ed = this._editor
        const model = ed.getModel() as (FeatureModel & { getVersionId(): number }) | null
        const state = ed.state
        if (!model || budgetForState(state).docClass === 'XL' || !budgetForState(state).stickyScroll) { this._roots = null; return }
        const kind = stickyOptions(ed).defaultModel ?? 'outlineModel'
        let roots: StickyNode[] | null = null
        if (kind === 'outlineModel') {
            const res = await documentSymbolSticky(this._registry, model, token, this._preferred)
            if (token.isCancellationRequested) return
            this._preferred = res?.provider
            roots = res?.roots ?? null
        }
        // 折叠范围(provider 折叠 + 缩进);defaultModel = indentationModel 只看缩进
        if (!roots) roots = foldScopes(ed.state, kind === 'indentationModel')
        if (token.isCancellationRequested) return
        this._roots = roots
        this._version = model.getVersionId()
    }

    /** 与 range 相交的候选行(已去掉整段落在隐藏区里的) */
    getCandidateStickyLinesIntersecting(range: StickyRange): StickyLineCandidate[] {
        if (!this._roots) return []
        const lh = this._editor.getOption(EditorOption.lineHeight) as number
        const cands = stickyCandidates(this._roots, range.startLineNumber, range.endLineNumber, lh)
        return filterHiddenCandidates(cands, hiddenLineRanges(this._editor.state)).map(c => new StickyLineCandidate(c.start, c.end, c.top, c.height))
    }

    dispose(): void {
        this._disposed = true
        this._cts?.dispose(true)
        this._config.dispose()
        for (const d of this._session) d.dispose()
        this._session = []
        this._listeners.clear()
    }
}

/** Monaco StickyScrollWidgetState */
export class StickyScrollWidgetState implements StickyWidgetState {
    constructor(
        readonly startLineNumbers: number[],
        readonly endLineNumbers: number[],
        readonly lastLineRelativePosition: number,
        readonly showEndForLine: number | null = null,
    ) { }
}

/**
 * Monaco StickyScrollController 里「视口位置 → 该粘哪几行」的那部分:findScrollWidgetState。
 * 渲染本身是 core 的 stickyScrollOverlay(同一个 stickyWidgetState),这里是只读的状态查询入口,给宿主 / 测试用。
 */
export class StickyScrollController implements IDisposable {
    static readonly ID = 'store.contrib.stickyScrollController'

    readonly stickyScrollCandidateProvider: StickyLineCandidateProvider

    constructor(private readonly _editor: LiteMonacoEditor, languageFeaturesService?: SymbolRegistry) {
        this.stickyScrollCandidateProvider = new StickyLineCandidateProvider(_editor, languageFeaturesService)
    }

    findScrollWidgetState(): StickyScrollWidgetState {
        const ed = this._editor
        const opts = stickyOptions(ed)
        const lh = ed.getOption(EditorOption.lineHeight) as number
        const maxLines = stickyMaxLines(ed.getLayoutInfo().height, lh, opts.maxLineCount)
        const ranges = ed.getVisibleRanges()
        if (!ranges.length) return new StickyScrollWidgetState([], [], 0)
        const full = { startLineNumber: ranges[0].startLineNumber, endLineNumber: ranges[ranges.length - 1].endLineNumber }
        const cands = this.stickyScrollCandidateProvider.getCandidateStickyLinesIntersecting(full)
        const boxes = cands.map(c => ({ start: c.startLineNumber, end: c.endLineNumber, top: c.top, height: c.height }))
        const st = stickyWidgetState(boxes, ed.getScrollTop(), maxLines, n => ed.getTopForLineNumber(n), n => ed.getBottomForLineNumber(n))
        return new StickyScrollWidgetState(st.startLineNumbers, st.endLineNumbers, st.lastLineRelativePosition)
    }

    dispose(): void { this.stickyScrollCandidateProvider.dispose() }
}
