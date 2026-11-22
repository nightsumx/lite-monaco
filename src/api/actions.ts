// 编辑器动作(Monaco 的 addAction / addEditorAction / getAction / getSupportedActions)。H2。
//
// - `addAction(descriptor)`:实例级。进命令面板(F1)、右键菜单(contextMenuGroupId)、键位(keybindings,when = precondition && keybindingContext),
//   返回 IDisposable。同 Monaco:IEditorAction.id 是 `${编辑器 id}:${descriptor.id}`,getAction 用 descriptor.id 查。
// - `addEditorAction(descriptor)`:全局,所有实例都有(含已创建的)。
// - `getAction(id)` / `getSupportedActions()`:用户动作 + 内置 `editor.action.*` 目录(内置的 run 复用命令面板里的同一份实现)。
// - 菜单项的显隐 = precondition(Monaco 的 EditorContext 菜单:不满足就不出现),F1 里同理。
import type { EditorContext } from './context'
import type { IDisposable, LiteMonacoEditor } from './types'
import type * as core from '../core/index'
import { getContextKeyService } from './contextkeys'
import {
    addViewKeybinding, addKeybindingRules, keybindingLabel, registerCommandResolver, setViewCommand,
    COMMAND_NOT_FOUND,
} from './commands'
import { addPaletteContributor, defaultPaletteCommands, type PaletteCommand } from '../core/feature/commandpalette'
import { addContextMenuContributor, type ContextMenuContribution, type ContextMenuItem } from '../core/feature/contextmenu'
import { FIND_COMMANDS } from '../core/feature/search'
import { runSuggestCommand } from '../core/feature/suggestwidget'
import { HOVER_COMMANDS } from '../core/feature/hover'
import { LINK_COMMANDS } from '../core/feature/link'
import { selectToBracketWith } from '../core/edit/brackets'

// ───────────── 公开类型 ─────────────

export interface IActionDescriptor {
    id: string
    label: string
    precondition?: string
    keybindings?: number[]
    keybindingContext?: string
    contextMenuGroupId?: string
    contextMenuOrder?: number
    run(editor: LiteMonacoEditor, ...args: unknown[]): void | Promise<void>
}

export interface IEditorActionDescriptor extends IActionDescriptor {}

export interface ICommandMetadata { readonly description: { original: string, value: string } | string }

export interface IEditorAction {
    readonly id: string
    readonly label: string
    readonly alias: string
    /** Monaco:动作的命令元数据(描述 / 参数 schema);lite-monaco 内置与用户动作都没有,恒 undefined */
    readonly metadata: ICommandMetadata | undefined
    isSupported(): boolean
    run(args?: unknown): Promise<void>
}

export interface IActionsApi {
    addAction(descriptor: IActionDescriptor): IDisposable
    getAction(id: string): IEditorAction | null
    getSupportedActions(): IEditorAction[]
}

// ───────────── 内置动作目录 ─────────────

interface BuiltinSpec {
    id: string
    /** 命令面板里对应的命令 id(label 和 run 取它的) */
    palette?: string
    label?: string
    /** 不能在只读下用 */
    writable?: boolean
    run?: (view: core.EditorView, args?: unknown) => unknown
}

// Monaco action id → 命令面板 id。只列 lite-monaco 里真有实现的。
const BUILTIN_SPECS: BuiltinSpec[] = [
    { id: 'actions.find', palette: 'find' },
    { id: 'editor.action.startFindReplace', palette: 'replace' },
    { id: 'editor.action.startFindReplaceAction', palette: 'replace' },
    { id: 'editor.action.nextMatchFindAction', palette: 'findNext' },
    { id: 'editor.action.previousMatchFindAction', palette: 'findPrev' },
    { id: 'editor.action.nextSelectionMatchFindAction', palette: 'findNextSel' },
    { id: 'editor.action.previousSelectionMatchFindAction', palette: 'findPrevSel' },
    { id: 'actions.findWithSelection', palette: 'findWithSel' },
    { id: 'editor.action.quickCommand', palette: 'palette' },
    { id: 'editor.action.gotoLine', palette: 'gotoLine' },
    { id: 'editor.action.changeAll', palette: 'changeAll', writable: true },
    { id: 'expandLineSelection', palette: 'selectLine' },
    { id: 'editor.action.indentLines', palette: 'indent', writable: true },
    { id: 'editor.action.outdentLines', palette: 'outdent', writable: true },
    { id: 'editor.action.copyLinesDownAction', palette: 'copyLineDown', writable: true },
    { id: 'editor.action.copyLinesUpAction', palette: 'copyLineUp', writable: true },
    { id: 'editor.action.duplicateSelection', palette: 'dupSel', writable: true },
    { id: 'editor.action.deleteLines', palette: 'deleteLine', writable: true },
    { id: 'editor.action.joinLines', palette: 'joinLines', writable: true },
    { id: 'editor.action.moveLinesUpAction', palette: 'moveLineUp', writable: true },
    { id: 'editor.action.moveLinesDownAction', palette: 'moveLineDown', writable: true },
    { id: 'editor.action.insertCursorAbove', palette: 'cursorAbove' },
    { id: 'editor.action.insertCursorBelow', palette: 'cursorBelow' },
    { id: 'editor.action.insertLineAfter', palette: 'lineBelow', writable: true },
    { id: 'editor.action.insertLineBefore', palette: 'lineAbove', writable: true },
    { id: 'editor.action.jumpToBracket', palette: 'jumpBracket' },
    { id: 'editor.action.selectToBracket', palette: 'selectToBracket', run: (v, args) => selectToBracketWith(v, (args as { selectBrackets?: boolean } | undefined)?.selectBrackets !== false) },
    { id: 'editor.action.removeBrackets', palette: 'unwrap', writable: true },
    { id: 'editor.action.trimTrailingWhitespace', palette: 'trimWs', writable: true },
    { id: 'deleteAllLeft', palette: 'delLeft', writable: true },
    { id: 'deleteAllRight', palette: 'delRight', writable: true },
    { id: 'editor.action.transposeLetters', palette: 'transpose', writable: true },
    { id: 'editor.action.transpose', palette: 'transposeChars', writable: true },
    { id: 'editor.action.inPlaceReplace.up', palette: 'inPlaceUp', writable: true },
    { id: 'editor.action.inPlaceReplace.down', palette: 'inPlaceDown', writable: true },
    { id: 'editor.action.moveCarretLeftAction', palette: 'moveTextLeft', writable: true },
    { id: 'editor.action.moveCarretRightAction', palette: 'moveTextRight', writable: true },
    { id: 'cursorUndo', palette: 'cursorUndo' },
    { id: 'cursorRedo', palette: 'cursorRedo' },
    { id: 'editor.action.addSelectionToNextFindMatch', palette: 'addSelNext' },
    { id: 'editor.action.moveSelectionToNextFindMatch', palette: 'moveSelNext' },
    { id: 'editor.action.addSelectionToPreviousFindMatch', palette: 'addSelPrev' },
    { id: 'editor.action.moveSelectionToPreviousFindMatch', palette: 'moveSelPrev' },
    { id: 'editor.action.addCursorsToBottom', palette: 'cursorsBottom' },
    { id: 'editor.action.addCursorsToTop', palette: 'cursorsTop' },
    { id: 'editor.action.focusNextCursor', palette: 'focusNextCursor' },
    { id: 'editor.action.focusPreviousCursor', palette: 'focusPrevCursor' },
    { id: 'editor.action.insertCursorAtEndOfEachLineSelected', palette: 'cursorsAtEnds' },
    { id: 'editor.action.insertFinalNewLine', palette: 'finalNl', writable: true },
    { id: 'deleteInsideWord', palette: 'deleteWord', writable: true },
    { id: 'editor.action.fontZoomIn', palette: 'fontZoomIn' },
    { id: 'editor.action.fontZoomOut', palette: 'fontZoomOut' },
    { id: 'editor.action.fontZoomReset', palette: 'fontZoomReset' },
    { id: 'editor.action.showContextMenu', palette: 'showContextMenu' },
    { id: 'editor.action.selectHighlights', palette: 'selHighlights' },
    { id: 'editor.action.commentLine', palette: 'lineComment', writable: true },
    { id: 'editor.action.blockComment', palette: 'blockComment', writable: true },
    { id: 'editor.action.addCommentLine', palette: 'addLineComment', writable: true },
    { id: 'editor.action.removeCommentLine', palette: 'removeLineComment', writable: true },
    { id: 'editor.action.transformToUppercase', palette: 'upper', writable: true },
    { id: 'editor.action.transformToLowercase', palette: 'lower', writable: true },
    { id: 'editor.action.transformToTitlecase', palette: 'title', writable: true },
    { id: 'editor.action.transformToSnakecase', palette: 'snake', writable: true },
    { id: 'editor.action.transformToCamelcase', palette: 'camel', writable: true },
    { id: 'editor.action.transformToPascalcase', palette: 'pascal', writable: true },
    { id: 'editor.action.transformToKebabcase', palette: 'kebab', writable: true },
    { id: 'editor.action.sortLinesAscending', palette: 'sortLines', writable: true },
    { id: 'editor.action.sortLinesDescending', palette: 'sortDesc', writable: true },
    { id: 'editor.action.reverseLines', palette: 'revLines', writable: true },
    { id: 'editor.action.removeDuplicateLines', palette: 'delDupLines', writable: true },
    { id: 'editor.action.indentationToSpaces', palette: 'toSpaces', writable: true },
    { id: 'editor.action.indentationToTabs', palette: 'toTabs', writable: true },
    { id: 'editor.action.detectIndentation', palette: 'detectIndent' },
    { id: 'editor.action.indentUsingSpaces', palette: 'indentSpaces' },
    { id: 'editor.action.indentUsingTabs', palette: 'indentTabs' },
    { id: 'editor.action.reindentlines', palette: 'reindentLines', writable: true },
    { id: 'editor.action.showHover', palette: 'showHover' },
    { id: 'editor.action.hideHover', palette: 'hideHover' },
    { id: 'editor.action.triggerSuggest', palette: 'triggerSuggest', writable: true, run: (v, args) => runSuggestCommand(v, 'triggerAction', args) },
    { id: 'editor.action.toggleTabFocusMode', palette: 'toggleTabFocus' },
    { id: 'editor.action.marker.next', palette: 'nextProb' },
    { id: 'editor.action.marker.prev', palette: 'prevProb' },
    { id: 'editor.action.marker.nextInFiles', palette: 'nextProbFiles' },
    { id: 'editor.action.marker.prevInFiles', palette: 'prevProbFiles' },
    { id: 'editor.action.wordHighlight.next', palette: 'nextOcc' },
    { id: 'editor.action.wordHighlight.prev', palette: 'prevOcc' },
    { id: 'editor.fold', palette: 'foldCode' },
    { id: 'editor.unfold', palette: 'unfold' },
    { id: 'editor.toggleFold', palette: 'fold' },
    { id: 'editor.foldAll', palette: 'foldAll' },
    { id: 'editor.unfoldAll', palette: 'unfoldAll' },
    { id: 'editor.foldRecursively', palette: 'foldRec' },
    { id: 'editor.unfoldRecursively', palette: 'unfoldRec' },
    { id: 'editor.gotoNextFold', palette: 'nextFold' },
    // 其余折叠动作(id 同 Monaco folding.ts)
    { id: 'editor.gotoPreviousFold', palette: 'prevFold' },
    { id: 'editor.gotoParentFold', palette: 'parentFold' },
    { id: 'editor.createFoldingRangeFromSelection', palette: 'foldSel' },
    { id: 'editor.removeManualFoldingRanges', palette: 'removeManualFolds' },
    { id: 'editor.foldAllBlockComments', palette: 'foldBlockComments' },
    { id: 'editor.foldAllMarkerRegions', palette: 'foldRegions' },
    { id: 'editor.unfoldAllMarkerRegions', palette: 'unfoldRegions' },
    { id: 'editor.foldAllExcept', palette: 'foldExcept' },
    { id: 'editor.unfoldAllExcept', palette: 'unfoldExcept' },
    { id: 'editor.toggleFoldRecursively', palette: 'toggleFoldRec' },
    ...[1, 2, 3, 4, 5, 6, 7].map(n => ({ id: `editor.foldLevel${n}`, palette: `foldLv${n}` })),
]

// 命令表(Monaco 命令 id → 命令)里还有的:没有面板项,标题从 id 推
const TABLE_SOURCES: Record<string, (view: core.EditorView) => unknown>[] = [
    FIND_COMMANDS as unknown as Record<string, (view: core.EditorView) => unknown>,
    HOVER_COMMANDS,
    LINK_COMMANDS,
]

// 实例专属的 Monaco 动作:命令面板里的条目随实例的语言 / 能力而定(TS 才有参数提示,有定义来源才有定义预览),所以不进全局目录
const VIEW_ACTION_PALETTE: Record<string, string> = {
    'editor.action.triggerParameterHints': 'triggerParamHints',
    'editor.action.showDefinitionPreviewHover': 'showDefPreview',
}
const viewPaletteExtras = new WeakMap<core.EditorView, () => PaletteCommand[]>()

/**
 * 实例专属的 Monaco 动作(provider 驱动的 go to / rename / format 等):id 就是 Monaco 动作 id。
 * supported 对应 Monaco 的 precondition(没有 provider 时不出现 / 不可触发)。
 */
export interface ViewAction {
    label: string
    /** Monaco 数字键位(KeyMod | KeyCode);装配层绑到实例上,run 前先看 supported */
    keybindings?: number[]
    writable?: boolean
    supported(view: core.EditorView): boolean
    run(view: core.EditorView, args?: unknown): unknown
}
const viewActionSources = new WeakMap<core.EditorView, Set<() => Record<string, ViewAction>>>()
/** 登记该实例的专属动作表(取值函数,provider 注册 / 注销后表里的 supported 自己变);返回注销函数 */
export function addViewActions(view: core.EditorView, get: () => Record<string, ViewAction>): () => void {
    let set = viewActionSources.get(view)
    if (!set) viewActionSources.set(view, set = new Set())
    set.add(get)
    return () => { set!.delete(get) }
}
/** 合并后的实例动作表(后登记的盖前面的同 id) */
export function viewActionTable(view: core.EditorView): Record<string, ViewAction> {
    const out: Record<string, ViewAction> = {}
    for (const get of viewActionSources.get(view) ?? []) Object.assign(out, get())
    return out
}
/** 右键菜单项 id → Monaco 动作 id:菜单项的 enabled(= precondition)和 run 改由实例动作表决定 */
const MENU_ACTION: Record<string, string> = {
    gotoDef: 'editor.action.revealDefinition', gotoDecl: 'editor.action.revealDeclaration', gotoRef: 'editor.action.goToReferences',
    gotoImpl: 'editor.action.goToImplementation', gotoType: 'editor.action.goToTypeDefinition',
    peekDef: 'editor.action.peekDefinition', peekDecl: 'editor.action.peekDeclaration', peekRef: 'editor.action.referenceSearch.trigger',
    peekImpl: 'editor.action.peekImplementation', peekType: 'editor.action.peekTypeDefinition',
    rename: 'editor.action.rename', format: 'editor.action.formatDocument', formatSel: 'editor.action.formatSelection',
}
export function withViewActionMenu(items: ContextMenuItem[]): ContextMenuItem[] {
    const wrap = (it: ContextMenuItem): ContextMenuItem => {
        if (it.submenu) return { ...it, submenu: it.submenu.map(wrap) }
        const actionId = MENU_ACTION[it.id]
        if (!actionId) return it
        const orig = (v: core.EditorView) => typeof it.enabled === 'function' ? it.enabled(v) : it.enabled !== false
        return {
            ...it,
            // 实例动作表里有这个动作就以它为准(precondition = 有没有 provider / 内置实现),没有就保持原样
            enabled: v => { const a = viewActionTable(v)[actionId]; return a ? a.supported(v) && !(a.writable && v.state.readOnly) : orig(v) },
            run: v => { const a = viewActionTable(v)[actionId]; if (!a) return it.run?.(v); void Promise.resolve(a.run(v)); return true },
        }
    }
    return items.map(wrap)
}
/** F1 里这些动作的条目(只列 supported 的) */
export function viewActionPaletteCommands(view: core.EditorView): PaletteCommand[] {
    const out: PaletteCommand[] = []
    for (const [id, a] of Object.entries(viewActionTable(view))) {
        if (!a.supported(view) || (a.writable && view.state.readOnly)) continue
        out.push({ id: `action:${id}`, label: a.label, keybinding: a.keybindings?.length ? keybindingLabel(a.keybindings[0]) : undefined, run: v => a.run(v) as boolean | void | Promise<boolean | void> })
    }
    return out
}
/** liteMonaco() 登记:该实例当前的专属 F1 命令(重装配后会变,所以给取值函数) */
export function setViewPaletteExtras(view: core.EditorView, get: () => PaletteCommand[]): void { viewPaletteExtras.set(view, get) }
function viewBuiltin(view: core.EditorView, id: string): BuiltinEntry | null {
    const own = viewActionTable(view)[id]
    if (own) return { id, label: own.label, writable: !!own.writable, supported: () => own.supported(view), run: own.run }
    const pid = VIEW_ACTION_PALETTE[id]
    if (!pid) return null
    const cmd = viewPaletteExtras.get(view)?.().find(c => c.id === pid)
    return cmd ? { id, label: cmd.label, writable: false, run: cmd.run } : null
}

function titleFromId(id: string): string {
    const last = id.split('.').pop() ?? id
    return last.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase())
}

interface BuiltinEntry {
    id: string
    label: string
    writable: boolean
    /** Monaco precondition:不满足时动作不可用(缺省 = 可用) */
    supported?(): boolean
    run(view: core.EditorView, args?: unknown): unknown
}

let builtinCache: Map<string, BuiltinEntry> | null = null

function builtinCatalog(): Map<string, BuiltinEntry> {
    if (builtinCache) return builtinCache
    const out = new Map<string, BuiltinEntry>()
    const palette = new Map<string, PaletteCommand>(defaultPaletteCommands().map(c => [c.id, c]))
    for (const table of TABLE_SOURCES) {
        for (const [id, run] of Object.entries(table)) out.set(id, { id, label: titleFromId(id), writable: false, run })
    }
    for (const spec of BUILTIN_SPECS) {
        const cmd = spec.palette ? palette.get(spec.palette) : undefined
        const run = spec.run ?? cmd?.run
        if (!run) continue
        out.set(spec.id, { id: spec.id, label: spec.label ?? cmd?.label ?? titleFromId(spec.id), writable: !!spec.writable, run })
    }
    builtinCache = out
    return out
}

// ───────────── 用户动作 ─────────────

interface UserAction {
    /** descriptor.id */
    rawId: string
    /** `${编辑器 id}:${id}`(全局动作是 descriptor.id 本身) */
    uniqueId: string
    descriptor: IActionDescriptor
}

const globalActions = new Map<string, UserAction>()

let editorCounter = 0
const editorIds = new WeakMap<core.EditorView, string>()

function editorIdOf(view: core.EditorView): string {
    const fn = (view as unknown as { getId?: () => string }).getId
    if (typeof fn === 'function') {
        try { return fn.call(view) } catch { /* 落到自增 id */ }
    }
    let id = editorIds.get(view)
    if (!id) editorIds.set(view, id = String(++editorCounter))
    return id
}

function checkDescriptor(d: IActionDescriptor): void {
    if (typeof d.id !== 'string' || typeof d.label !== 'string' || typeof d.run !== 'function') {
        throw new Error('Invalid action descriptor, `id`, `label` and `run` are required properties!')
    }
}

/** keybindings 用的 when:precondition && keybindingContext */
function keybindingWhen(d: IActionDescriptor): string | undefined {
    const parts = [d.precondition, d.keybindingContext].filter((s): s is string => !!s && !!s.trim())
    return parts.length ? parts.map(p => (parts.length > 1 ? `(${p})` : p)).join(' && ') : undefined
}

function makeEditorAction(view: core.EditorView, a: UserAction): IEditorAction {
    const keys = getContextKeyService(view)
    const self: IEditorAction = {
        id: a.uniqueId,
        label: a.descriptor.label,
        alias: a.descriptor.label,
        metadata: undefined,
        isSupported: () => keys.contextMatchesRules(a.descriptor.precondition),
        run: (args) => {
            // Monaco InternalEditorAction.run:precondition 不满足就什么也不做
            if (!self.isSupported()) return Promise.resolve()
            return Promise.resolve(a.descriptor.run(view as LiteMonacoEditor, ...(args === undefined ? [] : [args])))
        },
    }
    return self
}

/** Monaco editor.addEditorAction(全局):所有实例(包括已创建的)都有这个动作 */
export function addEditorAction(descriptor: IEditorActionDescriptor): IDisposable {
    checkDescriptor(descriptor)
    const action: UserAction = { rawId: descriptor.id, uniqueId: descriptor.id, descriptor }
    globalActions.set(descriptor.id, action)
    const kbs = (descriptor.keybindings ?? []).filter(Boolean)
    const rules = kbs.length
        ? addKeybindingRules(kbs.map(keybinding => ({ keybinding, command: descriptor.id, when: keybindingWhen(descriptor) })))
        : null
    return {
        dispose() {
            if (globalActions.get(descriptor.id) === action) globalActions.delete(descriptor.id)
            rules?.dispose()
        },
    }
}

// 全局动作:命令 id 解析(实例动作由 installActions 里的 setViewCommand 解析)
registerCommandResolver((view, id, args) => {
    const a = globalActions.get(id)
    if (a) {
        const keys = getContextKeyService(view)
        if (!keys.contextMatchesRules(a.descriptor.precondition)) return undefined
        return Promise.resolve(a.descriptor.run(view as LiteMonacoEditor, ...args))
    }
    const b = builtinCatalog().get(id) ?? viewBuiltin(view, id)
    if (b) {
        if (b.writable && view.state.readOnly) return undefined
        if (b.supported && !b.supported()) return undefined
        return b.run(view)
    }
    return COMMAND_NOT_FOUND
})

// ───────────── 安装 ─────────────

export function installActions(ctx: EditorContext): void {
    const view = ctx.view
    const keys = getContextKeyService(view)
    const mine = new Map<string, UserAction>()
    const api = ctx.api as unknown as IActionsApi

    const supportedUser = (): UserAction[] => {
        const all = new Map<string, UserAction>(globalActions)
        for (const [k, v] of mine) all.set(k, v)
        return [...all.values()].filter(a => keys.contextMatchesRules(a.descriptor.precondition))
    }

    api.addAction = (descriptor) => {
        checkDescriptor(descriptor)
        const uniqueId = `${editorIdOf(view)}:${descriptor.id}`
        const action: UserAction = { rawId: descriptor.id, uniqueId, descriptor }
        const run = (...args: unknown[]) => Promise.resolve(descriptor.run(view as LiteMonacoEditor, ...args))
        const disposables: IDisposable[] = [setViewCommand(view, uniqueId, run)]
        const when = keybindingWhen(descriptor)
        for (const kb of descriptor.keybindings ?? []) {
            const d = kb ? addViewKeybinding(view, kb, when, () => keys.contextMatchesRules(descriptor.precondition) ? run() : false) : null
            if (d) disposables.push(d)
        }
        mine.set(descriptor.id, action)
        return {
            dispose() {
                if (mine.get(descriptor.id) === action) mine.delete(descriptor.id)
                disposables.forEach(d => d.dispose())
            },
        }
    }

    api.getAction = (id) => {
        const user = mine.get(id) ?? globalActions.get(id)
        if (user) return makeEditorAction(view, user)
        const b = builtinCatalog().get(id) ?? viewBuiltin(view, id)
        if (!b) return null
        const self: IEditorAction = {
            id: b.id,
            label: b.label,
            alias: b.label,
            metadata: undefined,
            isSupported: () => !(b.writable && view.state.readOnly) && (b.supported?.() ?? true),
            run: (args?: unknown) => {
                if (!self.isSupported()) return Promise.resolve()
                return Promise.resolve(b.run(view, args)).then(() => undefined)
            },
        }
        return self
    }

    api.getSupportedActions = () => {
        const out: IEditorAction[] = []
        for (const a of supportedUser()) out.push(makeEditorAction(view, a))
        const get = api.getAction
        for (const id of [...builtinCatalog().keys(), ...Object.keys(VIEW_ACTION_PALETTE), ...Object.keys(viewActionTable(view))]) {
            const act = get(id)
            if (act && act.isSupported()) out.push(act)
        }
        return out
    }

    // 命令面板:用户动作(precondition 满足的)并入 F1 列表
    const offViewPalette = addPaletteContributor(view, () => viewActionPaletteCommands(view))
    const offPalette = addPaletteContributor(view, () => supportedUser().map((a): PaletteCommand => ({
        id: a.uniqueId,
        label: a.descriptor.label,
        keybinding: a.descriptor.keybindings?.length ? keybindingLabel(a.descriptor.keybindings[0]) : undefined,
        run: () => { void makeEditorAction(view, a).run() },
    })))

    // 右键菜单:有 contextMenuGroupId 的,precondition 不满足就不出现
    const offMenu = addContextMenuContributor(view, () => {
        const out: ContextMenuContribution[] = []
        const all = new Map<string, UserAction>(globalActions)
        for (const [k, v] of mine) all.set(k, v)
        for (const a of all.values()) {
            const group = a.descriptor.contextMenuGroupId
            if (!group) continue
            out.push({
                id: a.uniqueId,
                label: a.descriptor.label,
                group,
                order: a.descriptor.contextMenuOrder || 0,
                keybinding: a.descriptor.keybindings?.length ? keybindingLabel(a.descriptor.keybindings[0]) : undefined,
                enabled: () => keys.contextMatchesRules(a.descriptor.precondition),
                run: () => { void makeEditorAction(view, a).run() },
            })
        }
        return out
    })
    ctx.onDispose(() => { offPalette(); offViewPalette(); offMenu(); mine.clear() })
}
