// Monaco contrib/find/browser/findController 的翻译层。
// 行为在 core(src/core/feature/search.ts):查找会话 searchField + startFind / startReplace / findNext / findWithSelection / toggle* …
// 这里只做:Monaco 的 FindReplaceState(数据容器) ↔ 会话 的双向镜像、IStorageService 读写四个开关、Action 类 → core 命令。
import { queryFromSelection, searchField, setSearchOpen, startFind, startReplace, setSearchQuery, escapeRegExp, toggleFindInSelection } from '../../src/core/feature/search'
import { Selection } from '../../src/api/position'
import { FindReplaceState } from './findState'
import { FindModelBoundToEditorModel, CONTEXT_FIND_INPUT_FOCUSED, loopOf, mirroring, pushing, pushState, run, toOffset } from './findModel'
import { IContextKeyService } from './contextkey'
import { IStorageService, StorageScope, StorageTarget } from './storage'
import { IClipboardService } from './clipboardService'
import { INotificationService } from './notification'
import { IHoverService } from './hover'

export function getSelectionSearchString(editor: any, seed: 'single' | 'multiple' = 'single', nonEmptyOnly = false): string | null {
    return queryFromSelection(editor.state, seed === 'multiple', nonEmptyOnly)
}

export const enum FindStartFocusAction { NoFocusChange, FocusFindInput, FocusReplaceInput }
export interface IFindStartOptions {
    forceRevealReplace: boolean
    seedSearchStringFromSelection: 'none' | 'single' | 'multiple'
    seedSearchStringFromNonEmptySelection: boolean
    seedSearchStringFromGlobalClipboard: boolean
    shouldFocus: FindStartFocusAction
    shouldAnimate: boolean
    updateSearchScope: boolean
    loop: boolean
}

const FOCUS = ['none', 'find', 'replace'] as const

export class CommonFindController {
    static readonly ID = 'editor.contrib.findController'
    static get(editor: any): CommonFindController | null { return editor.getContribution?.(CommonFindController.ID) ?? null }
    static $di = [
        { id: IContextKeyService, index: 1 }, { id: IStorageService, index: 2 }, { id: IClipboardService, index: 3 },
        { id: INotificationService, index: 4 }, { id: IHoverService, index: 5 },
    ]

    protected _editor: any
    protected _state: FindReplaceState
    protected _updateHistoryDelayer: any
    protected readonly _storageService: any
    protected readonly _contextKeyService: any
    private _model: FindModelBoundToEditorModel | null = null
    private _busy = 0
    private readonly _off: () => void

    constructor(editor: any, contextKeyService?: any, storageService?: any, _clipboardService?: any, _notificationService?: any, _hoverService?: any) {
        this._editor = editor
        this._contextKeyService = contextKeyService
        this._storageService = storageService
        this._state = new FindReplaceState()
        this.loadQueryState()
        this._state.onFindReplaceStateChange(e => this._onStateChanged(e))
        // 会话是真身:动作 / 命令把它打开或关掉时,把它镜像进 state、建 / 拆 FindModel
        this._off = editor.onTransaction(() => this._adopt())
        pushState(editor, this._state, false, false) // 存储里的开关是 controller 的真相,覆盖 core 的跨实例记忆
    }

    get editor() { return this._editor }
    dispose(): void {
        this._off()
        this.disposeModel()
        this._state.dispose()
    }
    private disposeModel(): void {
        const m = this._model
        this._model = null
        m?.dispose()
    }

    private _session() { return this._editor.state.field(searchField, false) }

    private _adopt(): void {
        if (this._busy || pushing.n) return
        const sf = this._session()
        if (!sf) return
        this._busy++
        try {
            if (sf.open && !this._model) {
                this._mirror(sf, true)
                this._model = new FindModelBoundToEditorModel(this._editor, this._state)
            } else if (!sf.open && this._model) {
                this.disposeModel()
                this._state.change({ isRevealed: false, searchScope: null }, false)
            } else if (sf.open) this._mirror(sf, false)
        } finally { this._busy-- }
    }

    // 会话 → state(只写有差异的字段,避免多余事件)
    private _mirror(sf: any, reveal: boolean): void {
        const s = this._state
        const doc = this._editor.state.doc
        const next: any = {}
        if (reveal) next.isRevealed = true
        if (sf.query !== s.searchString) next.searchString = sf.query
        if (sf.replacement !== s.replaceString) next.replaceString = sf.replacement
        if (sf.replaceOpen !== s.isReplaceRevealed) next.isReplaceRevealed = sf.replaceOpen
        if (sf.regex !== s.isRegex) next.isRegex = sf.regex
        if (sf.wholeWord !== s.wholeWord) next.wholeWord = sf.wholeWord
        if (sf.caseSensitive !== s.matchCase) next.matchCase = sf.caseSensitive
        if (sf.preserveCase !== s.preserveCase) next.preserveCase = sf.preserveCase
        if (sf.loop !== null && sf.loop !== loopOf(s)) next.loop = sf.loop
        const same = (s.searchScope?.length ?? 0) === sf.scopes.length && sf.scopes.every((r: any, i: number) => {
            const x = s.searchScope![i]
            return toOffset(doc, x.startLineNumber, x.startColumn) === r.from && toOffset(doc, x.endLineNumber, x.endColumn) === r.to
        })
        if (!same && sf.findInSelection) {
            const sels = this._editor.getSelections().filter((x: Selection) => !x.isEmpty())
            next.searchScope = sels.length === sf.scopes.length ? sels : sf.scopes.map((r: any) => {
                const a = doc.lineAt(r.from), b = doc.lineAt(r.to)
                return new Selection(a.number, r.from - a.from + 1, b.number, r.to - b.from + 1)
            })
        } else if (!same && !sf.findInSelection) next.searchScope = null
        if (Object.keys(next).length) { mirroring.add(s); try { s.change(next, false) } finally { mirroring.delete(s) } }
    }

    private _onStateChanged(e: any): void {
        this.saveQueryState(e)
        if (e.isRevealed && !this._busy) {
            this._busy++
            try {
                if (this._state.isRevealed) {
                    // state 被直接改成「显示」(multicursor 测试这么用):会话打开并带上当前查询,FindModel 随会话建起来
                    pushState(this._editor, this._state, false, false)
                    run(this._editor, setSearchOpen(true))
                } else { this.disposeModel(); run(this._editor, setSearchOpen(false)) }
            } finally { this._busy-- }
            this._adopt()
            return
        }
        // 没有 FindModel 时 state 的开关 / 查询仍要落到会话,后续动作(seed 转义、跳转)才读得到
        if (!this._model && (e.isRegex || e.wholeWord || e.matchCase || e.preserveCase || e.searchString || e.replaceString)) pushState(this._editor, this._state, false, false)
    }
    private saveQueryState(e: any): void {
        const st = this._storageService
        if (!st) return
        if (e.isRegex) st.store('editor.isRegex', this._state.actualIsRegex, StorageScope.WORKSPACE, StorageTarget.MACHINE)
        if (e.wholeWord) st.store('editor.wholeWord', this._state.actualWholeWord, StorageScope.WORKSPACE, StorageTarget.MACHINE)
        if (e.matchCase) st.store('editor.matchCase', this._state.actualMatchCase, StorageScope.WORKSPACE, StorageTarget.MACHINE)
        if (e.preserveCase) st.store('editor.preserveCase', this._state.actualPreserveCase, StorageScope.WORKSPACE, StorageTarget.MACHINE)
    }
    private loadQueryState(): void {
        const st = this._storageService
        if (!st) return
        const s = this._state
        s.change({
            matchCase: st.getBoolean('editor.matchCase', StorageScope.WORKSPACE, s.matchCase),
            wholeWord: st.getBoolean('editor.wholeWord', StorageScope.WORKSPACE, s.wholeWord),
            isRegex: st.getBoolean('editor.isRegex', StorageScope.WORKSPACE, s.isRegex),
            preserveCase: st.getBoolean('editor.preserveCase', StorageScope.WORKSPACE, s.preserveCase),
        }, false)
    }

    isFindInputFocused(): boolean { return !!CONTEXT_FIND_INPUT_FOCUSED.getValue(this._contextKeyService) }
    getState(): FindReplaceState { return this._state }
    closeFindWidget(): void { this._state.change({ isRevealed: false, searchScope: null }, false); this._editor.focus() }
    toggleCaseSensitive(): void { this._state.change({ matchCase: !this._state.matchCase }, false) }
    toggleWholeWords(): void { this._state.change({ wholeWord: !this._state.wholeWord }, false) }
    toggleRegex(): void { this._state.change({ isRegex: !this._state.isRegex }, false) }
    togglePreserveCase(): void { this._state.change({ preserveCase: !this._state.preserveCase }, false) }
    toggleSearchScope(): void { run(this._editor, toggleFindInSelection) }
    setSearchString(searchString: string): void {
        this._state.change({ searchString: this._state.isRegex ? escapeRegExp(searchString) : searchString }, false)
    }
    highlightFindOptions(_ignoreWhenVisible = false): void { /* overwritten in subclass */ }

    protected async _start(opts: IFindStartOptions, newState?: any): Promise<void> {
        this.disposeModel()
        if (newState) this._state.change({ ...newState, isRevealed: undefined }, false)
        pushState(this._editor, this._state, false, false)
        // 所有"怎么 seed / 范围 / 替换栏 / loop"的决定在 core startFind;adopt 把结果镜像回 state 并建 FindModel
        run(this._editor, startFind({
            forceRevealReplace: opts.forceRevealReplace,
            seedSearchStringFromSelection: opts.seedSearchStringFromSelection,
            seedSearchStringFromNonEmptySelection: opts.seedSearchStringFromNonEmptySelection,
            focus: FOCUS[opts.shouldFocus],
            updateSearchScope: opts.updateSearchScope,
            loop: opts.loop,
        }))
        this._adopt()
    }
    start(opts: IFindStartOptions, newState?: any): Promise<void> { return this._start(opts, newState) }
    moveToNextMatch(): boolean { if (!this._model) return false; this._model.moveToNextMatch(); return true }
    moveToPrevMatch(): boolean { if (!this._model) return false; this._model.moveToPrevMatch(); return true }
    replace(): boolean { if (!this._model) return false; this._model.replace(); return true }
    replaceAll(): boolean { if (!this._model) return false; this._model.replaceAll(); return true }
    selectAllMatches(): boolean { if (!this._model) return false; this._model.selectAllMatches(); return true }
    async getGlobalBufferTerm(): Promise<string> { return '' }
    setGlobalBufferTerm(_text: string): void { /* lite-monaco 没有全局查找剪贴板(find.globalFindClipboard 是 macOS 专属) */ }
}

// —— Action 类:按 Monaco action id 调 editor.getAction(id).run(),动作的行为在 core(FIND_COMMANDS)——
class FindAction {
    constructor(private readonly id: string) {}
    run(_accessor: unknown, editor: any, args?: unknown) {
        const a = editor.getAction(this.id)
        if (!a) throw new Error(`lite-monaco 缺动作: ${this.id}`)
        return a.run(args)
    }
    runEditorCommand(accessor: unknown, editor: any, args?: unknown) { return this.run(accessor, editor, args) }
}
const act = (id: string) => class extends FindAction { constructor() { super(id) } }
export const StartFindAction = new FindAction('actions.find')
export const NextMatchFindAction = new FindAction('editor.action.nextMatchFindAction')
export const PreviousMatchFindAction = new FindAction('editor.action.previousMatchFindAction')
export class StartFindWithSelectionAction extends act('actions.findWithSelection') {}
export class NextSelectionMatchFindAction extends act('editor.action.nextSelectionMatchFindAction') {}
export class PreviousSelectionMatchFindAction extends act('editor.action.previousSelectionMatchFindAction') {}
// Monaco StartFindReplaceAction 看「查找框输入是否有焦点」(context key,测试夹具会设),这个没法从 getAction 传,所以直接调 core 的 startReplace(findInputFocused)
export const StartFindReplaceAction = {
    run(_accessor: unknown, editor: any) {
        const c = CommonFindController.get(editor)
        return run(editor, startReplace(!!c?.isFindInputFocused()))
    },
    runEditorCommand(accessor: unknown, editor: any) { return this.run(accessor, editor) },
}
export { setSearchOpen, setSearchQuery }
