// 命令与键位(Monaco 的 addCommand / addKeybindingRule / executeEdits / executeCommand(s) / pushUndoStop)。H2。
//
// - 数字键位(`KeyMod.CtrlCmd | KeyCode.KeyS`,和弦 `KeyMod.chord(a, b)`)→ lite-monaco 的字符串键位("Mod-s"、"Mod-k Mod-c"),
//   然后复用 `core.keymapHandler`。动态键位挂在 view.dom 的捕获阶段,先于内置 keymap(同 Monaco:用户的动态键位压过默认键位)。
// - `when` 用 contextkeys.ts 求值,每次按键现算。
// - `executeEdits` / `executeCommand(s)` 都落成一个事务(`apiEdit` 注解):两次调用之间没有 pushUndoStop 就是同一个撤销步。
// - ICommand 拿到的 model 是一个**只读快照适配器**(`ICommandModel`,ITextModel 的常用子集),不是 H3 的活 model:
//   getEditOperations 看到编辑前的文档,computeCursorState 看到编辑后的文档。
import type { EditorContext } from './context'
import type { IDisposable, IPosition, IRange, ISelection } from './types'
import type * as core from '../core/index'
import type { Rope } from '../core/model/rope'
import { KeyCode } from './keycodes'
import { Position, Range, Selection, SelectionDirection } from './position'
import { getContextKeyService } from './contextkeys'
import { apiEdit, forceMoveMarkers, undoStop } from '../core/edit/history'
import { mapSelectionByMarkers } from '../core/edit/tracked'
import { snippetAutoClosedEffects } from '../core/edit/closebrackets'
import { keymapHandler, type KeyBinding } from '../core/edit/keymap'
import { EditorSelection } from '../core/model/selection'
import { Transaction } from '../core/model/state'
import { ChangeSet } from '../core/model/change'
import { keyOS } from '../core/keyos'

// ───────────── 文档偏移 ↔ (行, 列) ─────────────

/** (行, 列) → 文档偏移;越界按 Monaco validatePosition 夹取 */
export function docOffset(doc: Rope, lineNumber: number, column: number): number {
    const ln = Math.min(Math.max(1, Math.floor(lineNumber) || 1), doc.lines)
    const line = doc.line(ln)
    return line.from + Math.min(Math.max(1, Math.floor(column) || 1), line.length + 1) - 1
}

export function docPosition(doc: Rope, offset: number): Position {
    const o = Math.min(Math.max(0, offset), doc.length)
    const line = doc.lineAt(o)
    return new Position(line.number, o - line.from + 1)
}

/** IRange → [from, to] 偏移(from <= to) */
export function docRangeOffsets(doc: Rope, r: IRange): [number, number] {
    const a = docOffset(doc, r.startLineNumber, r.startColumn)
    const b = docOffset(doc, r.endLineNumber, r.endColumn)
    return a <= b ? [a, b] : [b, a]
}

export function docRange(doc: Rope, from: number, to: number): Range {
    const a = docPosition(doc, from)
    const b = docPosition(doc, to)
    return new Range(a.lineNumber, a.column, b.lineNumber, b.column)
}

function toSelection(doc: Rope, anchor: number, head: number): Selection {
    const a = docPosition(doc, anchor)
    const h = docPosition(doc, head)
    return new Selection(a.lineNumber, a.column, h.lineNumber, h.column)
}

function offsetsOfSelection(doc: Rope, s: ISelection): { anchor: number, head: number } {
    return {
        anchor: docOffset(doc, s.selectionStartLineNumber, s.selectionStartColumn),
        head: docOffset(doc, s.positionLineNumber, s.positionColumn),
    }
}

// ───────────── ICommand ─────────────

/** Monaco ITextModel 的只读子集(命令里常用的那些) */
export interface ICommandModel {
    getValue(eol?: unknown): string
    getValueInRange(range: IRange): string
    getValueLength(): number
    getLineCount(): number
    getLineContent(lineNumber: number): string
    getLineLength(lineNumber: number): number
    getLineMinColumn(lineNumber: number): number
    getLineMaxColumn(lineNumber: number): number
    getLineFirstNonWhitespaceColumn(lineNumber: number): number
    getLineLastNonWhitespaceColumn(lineNumber: number): number
    getLinesContent(): string[]
    getFullModelRange(): Range
    getOffsetAt(position: IPosition): number
    getPositionAt(offset: number): Position
    validatePosition(position: IPosition): Position
    validateRange(range: IRange): Range
    getEOL(): string
    getLanguageId(): string
}

export interface IIdentifiedSingleEditOperation {
    range: IRange
    text: string | null
    forceMoveMarkers?: boolean
    /** 其余字段(identifier / isAutoWhitespaceEdit…)原样忽略 */
    [key: string]: unknown
}

export interface IValidEditOperation {
    range: Range
    text: string
    /** 原编辑上的 identifier(Monaco 逆操作原样带回);没标的是 null */
    identifier?: { major: number, minor: number } | null
    /** 偏移是 model 偏移(换行按 model EOL 的长度算,CRLF 占 2) */
    textChange?: { oldPosition: number, oldText: string, newPosition: number, newText: string }
}

export interface IEditOperationBuilder {
    addEditOperation(range: IRange, text: string | null, forceMoveMarkers?: boolean): void
    addTrackedEditOperation(range: IRange, text: string | null, forceMoveMarkers?: boolean): void
    trackSelection(selection: ISelection, trackPreviousOnEmpty?: boolean): string
}

export interface ICursorStateComputerData {
    getInverseEditOperations(): IValidEditOperation[]
    getTrackedSelection(id: string): Selection
}

export interface ICommand {
    getEditOperations(model: ICommandModel, builder: IEditOperationBuilder): void
    computeCursorState(model: ICommandModel, helper: ICursorStateComputerData): Selection
}

export type ICursorStateComputer = (inverseEditOperations: IValidEditOperation[]) => Selection[] | null

function createCommandModel(doc: Rope, languageId: () => string): ICommandModel {
    const line = (n: number) => doc.line(Math.min(Math.max(1, n), doc.lines))
    const firstNonWs = (text: string) => {
        let i = 0
        while (i < text.length && (text[i] === ' ' || text[i] === '\t')) i++
        return i
    }
    const lastNonWs = (text: string) => {
        let i = text.length - 1
        while (i >= 0 && (text[i] === ' ' || text[i] === '\t')) i--
        return i
    }
    return {
        getValue: () => doc.toString(),
        getValueInRange: r => { const [a, b] = docRangeOffsets(doc, r); return doc.sliceString(a, b) },
        getValueLength: () => doc.length,
        getLineCount: () => doc.lines,
        getLineContent: n => line(n).text,
        getLineLength: n => line(n).length,
        getLineMinColumn: () => 1,
        getLineMaxColumn: n => line(n).length + 1,
        getLineFirstNonWhitespaceColumn: (n) => {
            const t = line(n).text
            const i = firstNonWs(t)
            return i === t.length ? 0 : i + 1
        },
        getLineLastNonWhitespaceColumn: (n) => {
            const t = line(n).text
            const i = lastNonWs(t)
            return i < 0 ? 0 : i + 2
        },
        getLinesContent: () => doc.toJSON(),
        getFullModelRange: () => docRange(doc, 0, doc.length),
        getOffsetAt: p => docOffset(doc, p.lineNumber, p.column),
        getPositionAt: o => docPosition(doc, o),
        validatePosition: p => docPosition(doc, docOffset(doc, p.lineNumber, p.column)),
        validateRange: r => { const [a, b] = docRangeOffsets(doc, r); return docRange(doc, a, b) },
        getEOL: () => '\n',
        getLanguageId: languageId,
    }
}

// ───────────── 键位:数字 ↔ 字符串 ─────────────

const NAMED: Partial<Record<number, string>> = {
    [KeyCode.Backspace]: 'Backspace', [KeyCode.Tab]: 'Tab', [KeyCode.Enter]: 'Enter', [KeyCode.Escape]: 'Escape',
    [KeyCode.Space]: 'Space', [KeyCode.PageUp]: 'PageUp', [KeyCode.PageDown]: 'PageDown', [KeyCode.End]: 'End',
    [KeyCode.Home]: 'Home', [KeyCode.LeftArrow]: 'ArrowLeft', [KeyCode.UpArrow]: 'ArrowUp', [KeyCode.RightArrow]: 'ArrowRight',
    [KeyCode.DownArrow]: 'ArrowDown', [KeyCode.Insert]: 'Insert', [KeyCode.Delete]: 'Delete', [KeyCode.ContextMenu]: 'ContextMenu',
    [KeyCode.PauseBreak]: 'Pause', [KeyCode.CapsLock]: 'CapsLock', [KeyCode.NumLock]: 'NumLock', [KeyCode.ScrollLock]: 'ScrollLock',
    [KeyCode.Semicolon]: ';', [KeyCode.Equal]: '=', [KeyCode.Comma]: ',', [KeyCode.Minus]: '-', [KeyCode.Period]: '.',
    [KeyCode.Slash]: '/', [KeyCode.Backquote]: '`', [KeyCode.BracketLeft]: '[', [KeyCode.Backslash]: '\\',
    [KeyCode.BracketRight]: ']', [KeyCode.Quote]: '\'',
}

/** KeyCode → 键位字符串里的键名;不认识返回 null */
function keyName(code: number): string | null {
    if (NAMED[code]) return NAMED[code]!
    if (code >= KeyCode.Digit0 && code <= KeyCode.Digit9) return String(code - KeyCode.Digit0)
    if (code >= KeyCode.KeyA && code <= KeyCode.KeyZ) return String.fromCharCode(97 + code - KeyCode.KeyA)
    if (code >= KeyCode.F1 && code <= KeyCode.F24) return `F${code - KeyCode.F1 + 1}`
    return null
}

const MOD_CTRLCMD = 1 << 11
const MOD_SHIFT = 1 << 10
const MOD_ALT = 1 << 9
const MOD_WINCTRL = 1 << 8

/** 一个数字键位的各段(和弦拆成 1~2 段;0 段 = 没有键位) */
function chordParts(keybinding: number): number[] {
    if (!keybinding) return []
    const first = keybinding & 0xFFFF
    const second = (keybinding >>> 16) & 0xFFFF
    return second ? [first, second] : [first]
}

/**
 * Monaco 数字键位 → lite-monaco 键位字符串("Mod-Shift-k"、"Mod-k Mod-c")。
 * CtrlCmd = Mod;WinCtrl:Mac 上是 Ctrl,其余平台是 Meta。键码不认识返回 null。
 */
export function keybindingToKey(keybinding: number): string | null {
    const parts = chordParts(keybinding)
    if (!parts.length) return null
    const mac = keyOS === 'mac'
    const out: string[] = []
    for (const part of parts) {
        const name = keyName(part & 0xFF)
        if (!name) return null
        const mods: string[] = []
        if (part & MOD_CTRLCMD) mods.push('Mod')
        if (part & MOD_WINCTRL) mods.push(mac ? 'Ctrl' : 'Meta')
        if (part & MOD_ALT) mods.push('Alt')
        if (part & MOD_SHIFT) mods.push('Shift')
        out.push([...mods, name].join('-'))
    }
    return out.join(' ')
}

const ARROWS_MAC: Record<string, string> = { ArrowLeft: '←', ArrowUp: '↑', ArrowRight: '→', ArrowDown: '↓' }
const ARROWS_WIN: Record<string, string> = { ArrowLeft: 'LeftArrow', ArrowUp: 'UpArrow', ArrowRight: 'RightArrow', ArrowDown: 'DownArrow' }

/** 键位显示文字:Mac 是 ⌃⌥⇧⌘ + 键,其余是 Ctrl+Shift+Alt+Windows+键(和弦用空格隔开),同命令面板的写法 */
export function keybindingLabel(keybinding: number): string | undefined {
    const parts = chordParts(keybinding)
    if (!parts.length) return undefined
    const mac = keyOS === 'mac'
    const out: string[] = []
    for (const part of parts) {
        const name = keyName(part & 0xFF)
        if (!name) return undefined
        const cmd = !!(part & MOD_CTRLCMD)
        const win = !!(part & MOD_WINCTRL)
        const alt = !!(part & MOD_ALT)
        const shift = !!(part & MOD_SHIFT)
        const key = name.length === 1 ? name.toUpperCase() : (mac ? ARROWS_MAC[name] : ARROWS_WIN[name]) ?? name
        if (mac) out.push(`${win ? '⌃' : ''}${alt ? '⌥' : ''}${shift ? '⇧' : ''}${cmd ? '⌘' : ''}${key}`)
        else out.push([cmd ? 'Ctrl' : '', shift ? 'Shift' : '', alt ? 'Alt' : '', win ? 'Windows' : '', key].filter(Boolean).join('+'))
    }
    return out.join(' ')
}

// ───────────── 键位注册表(实例 + 全局规则) ─────────────

export interface IKeybindingRule {
    keybinding: number
    /** 命令 id(addAction 的 id、addCommand 返回的 id、editor.action.* 等已登记的命令)。null 或 '-' 开头 = 取消这个键位 */
    command?: string | null
    commandArgs?: unknown
    when?: string | null
}

interface KeyEntry {
    seq: number
    key: string
    when?: string | null
    /** 返回 false = 没处理(落到下一条);其余算已处理 */
    run(view: core.EditorView): unknown
}

let seqCounter = 0
const globalRules: KeyEntry[] = []
let globalVersion = 0

type CommandResolver = (view: core.EditorView, id: string, args: unknown[]) => unknown | undefined
const NOT_FOUND = Symbol('not-found')
const resolvers: CommandResolver[] = []

/** 登记命令解析器:返回 NOT_FOUND 表示这个 id 不归它管 */
export function registerCommandResolver(fn: (view: core.EditorView, id: string, args: unknown[]) => unknown): IDisposable {
    resolvers.push(fn)
    return { dispose() { const i = resolvers.indexOf(fn); if (i >= 0) resolvers.splice(i, 1) } }
}
export { NOT_FOUND as COMMAND_NOT_FOUND }

/** 按 id 执行命令(addCommand / addAction / 内置命令表);找不到返回 false */
export function executeCommandById(view: core.EditorView, id: string, ...args: unknown[]): boolean | Promise<unknown> {
    for (const r of resolvers.slice().reverse()) {
        const res = r(view, id, args)
        if (res !== NOT_FOUND) return res instanceof Promise ? res : true
    }
    return false
}

/** editor.addKeybindingRule:全局键位规则(所有实例) */
export function addKeybindingRule(rule: IKeybindingRule): IDisposable {
    return addKeybindingRules([rule])
}

export function addKeybindingRules(rules: IKeybindingRule[]): IDisposable {
    const added: KeyEntry[] = []
    for (const rule of rules) {
        const key = keybindingToKey(rule.keybinding)
        if (!key) continue
        const unbind = rule.command == null || rule.command.startsWith('-')
        const command = rule.command
        const entry: KeyEntry = {
            seq: ++seqCounter,
            key,
            when: rule.when,
            run: unbind
                ? () => true
                : (view) => {
                    const r = executeCommandById(view, command!, ...(rule.commandArgs === undefined ? [] : [rule.commandArgs]))
                    return r === false ? false : r
                },
        }
        globalRules.push(entry)
        added.push(entry)
    }
    globalVersion++
    return {
        dispose() {
            for (const e of added) { const i = globalRules.indexOf(e); if (i >= 0) globalRules.splice(i, 1) }
            globalVersion++
        },
    }
}

interface Dispatcher {
    entries: KeyEntry[]
    commands: Map<string, (...args: unknown[]) => unknown>
    handler: { sig: string, keymap: readonly KeyBinding[], inEditor: ReturnType<typeof keymapHandler>, inOverlay: ReturnType<typeof keymapHandler> } | null
}

const dispatchers = new WeakMap<core.EditorView, Dispatcher>()

function dispatcherOf(view: core.EditorView): Dispatcher {
    let d = dispatchers.get(view)
    if (!d) {
        d = { entries: [], commands: new Map(), handler: null }
        dispatchers.set(view, d)
    }
    return d
}

/** 给实例加一条动态键位(addAction / addCommand 用)。keybinding 是 Monaco 数字键位 */
export function addViewKeybinding(view: core.EditorView, keybinding: number, when: string | null | undefined, run: (view: core.EditorView) => unknown): IDisposable | null {
    const key = keybindingToKey(keybinding)
    if (!key) return null
    const d = dispatcherOf(view)
    const entry: KeyEntry = { seq: ++seqCounter, key, when, run }
    d.entries.push(entry)
    d.handler = null
    return {
        dispose() {
            const i = d.entries.indexOf(entry)
            if (i >= 0) d.entries.splice(i, 1)
            d.handler = null
        },
    }
}

/** 实例级命令表(addCommand 的无键位触发、addAction 的 id) */
export function setViewCommand(view: core.EditorView, id: string, fn: (...args: unknown[]) => unknown): IDisposable {
    const d = dispatcherOf(view)
    d.commands.set(id, fn)
    return { dispose() { if (d.commands.get(id) === fn) d.commands.delete(id) } }
}

// 实例命令表是最早的解析器(addCommand / addAction 的 id 优先)
registerCommandResolver((view, id, args) => {
    const fn = dispatchers.get(view)?.commands.get(id)
    if (!fn) return NOT_FOUND
    return fn(...args)
})

function installKeyDispatch(ctx: EditorContext): void {
    const view = ctx.view
    const d = dispatcherOf(view)
    const keys = getContextKeyService(view)
    let globalSeen = -1
    const onKeyDown = (e: KeyboardEvent) => {
        if (e.isComposing || !(d.entries.length || globalRules.length)) return
        const active = [...d.entries, ...globalRules]
            .filter(en => keys.contextMatchesRules(en.when))
            .sort((a, b) => b.seq - a.seq)
        if (!active.length) return
        const sig = active.map(a => a.seq).join(',')
        const keymap = view.keymap
        if (!d.handler || d.handler.sig !== sig || d.handler.keymap !== keymap || globalSeen !== globalVersion) {
            globalSeen = globalVersion
            const dynamic: KeyBinding[] = active.map(en => ({
                key: en.key,
                run: () => {
                    const r = en.run(view)
                    if (r instanceof Promise) r.catch(err => console.error(err))
                    return r !== false
                },
            }))
            // 正文里:动态键位在前(后注册的优先)、内置键位在后,合进同一台和弦状态机。
            // 分开两台的话,动态表里的 ⌘K ⌘F 会把 ⌘K 当前缀吞掉,内置的 ⌘K ⌘L / ⌘K ⌘0 全部失灵(Monaco 只有一个键位解析器)。
            // 浮层输入框里只认动态的单键:内置的 ⌘A / ⌘Z / 方向键在框里是输入框自己的行为;
            // 和弦不在这里接管,否则 ⌘K 被当前缀吞掉(capture + stopPropagation),宿主 keymap 自己的 ⌘K ⌘X 就收不到了。
            d.handler = {
                sig, keymap,
                inEditor: keymapHandler([...dynamic, ...keymap], { claim: false }),
                inOverlay: keymapHandler(dynamic.filter(b => !b.key.includes(' ')), { claim: false }),
            }
        }
        const t = e.target as Node | null
        const fn = t && view.contentDOM.contains(t) ? d.handler.inEditor : d.handler.inOverlay
        if (fn(e, view)) e.stopPropagation()
    }
    view.dom.addEventListener('keydown', onKeyDown, true)
    ctx.onDispose(() => {
        view.dom.removeEventListener('keydown', onKeyDown, true)
        dispatchers.delete(view)
    })
}

// ───────────── 编辑 ─────────────

interface Op {
    from: number
    to: number
    text: string
    major: number
    minor: number
    identifier?: { major: number, minor: number } | null
    /** Monaco forceMoveMarkers:落在这笔编辑边缘的装饰边界被推到插入文本之后 */
    force?: boolean
}

/** 事务注解:把 ops 里带 forceMoveMarkers 的编辑告诉装饰映射 */
function forceAnn(ops: readonly Op[]): core.Annotation<unknown>[] {
    const f = ops.filter(o => o.force).map(o => [o.from, o.to] as const)
    return f.length ? [forceMoveMarkers.of(f) as core.Annotation<unknown>] : []
}

function uniqueOps(ops: Op[]): Op[] {
    return ops.slice().sort((a, b) => a.from - b.from || a.to - b.to || a.major - b.major || a.minor - b.minor)
}

function assertNoOverlap(sorted: Op[]): void {
    for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].from < sorted[i - 1].to) throw new Error('Overlapping ranges are not allowed!')
    }
}

/** 文本插进 doc 后占的长度:任何换行(\r\n / \r / \n)在 doc 里都只占 1 个字符 */
function docLen(text: string): number {
    return text.indexOf('\r') < 0 && text.indexOf('\n') < 0 ? text.length : text.replace(/\r\n|\r|\n/g, '\n').length
}

/** doc 偏移 → model 偏移(model 的 EOL 是 \r\n 时每个换行多占 1) */
function modelOffset(doc: Rope, offset: number, eolLen: number): number {
    return eolLen === 1 ? offset : offset + (doc.lineAt(offset).number - 1) * (eolLen - 1)
}

/** 升序且互不重叠的 ops → 编辑后坐标系里的逆操作(range 是插入文本在新文档里的范围,text 是被替换掉的原文) */
function inverseOps(oldDoc: Rope, newDoc: Rope, sorted: Op[], eolLen = 1): (IValidEditOperation & { major: number, minor: number })[] {
    const out: (IValidEditOperation & { major: number, minor: number })[] = []
    let delta = 0
    for (const op of sorted) {
        const fromB = op.from + delta
        const toB = fromB + docLen(op.text)
        const oldText = oldDoc.sliceString(op.from, op.to)
        out.push({
            range: docRange(newDoc, fromB, toB), text: oldText, major: op.major, minor: op.minor,
            identifier: op.identifier ?? null,
            textChange: { oldPosition: modelOffset(oldDoc, op.from, eolLen), oldText, newPosition: modelOffset(newDoc, fromB, eolLen), newText: op.text },
        })
        delta += docLen(op.text) - (op.to - op.from)
    }
    return out
}

function toSpecs(sorted: Op[]) {
    return sorted.map(o => ({ from: o.from, to: o.to, insert: o.text }))
}

/**
 * Monaco 没给 endCursorState 时的光标:选区是 AlwaysGrowsWhenTypingAtEdges 的 tracked range,随编辑按 nodeAcceptEdit 搬
 * (和 model.applyEdits 同一份,见 tracked.ts):forceMoveMarkers 的编辑把落在边缘的光标推到插入文本之后,
 * 所以整篇替换(@monaco-editor/react 改 value 就是这样)光标落在新文本末尾。原本空选区不因此变成选中
 */
function mapSelectionLikeMonaco(sel: EditorSelection, changes: ChangeSet, ops: readonly Op[]): EditorSelection {
    return mapSelectionByMarkers(sel, changes, ops.filter(o => o.force).map(o => [o.from, o.to] as const))
}

function languageIdOf(view: core.EditorView): () => string {
    return () => {
        const fn = (view as unknown as { getLanguageId?: () => string }).getLanguageId
        try { return typeof fn === 'function' ? fn.call(view) : '' } catch { return '' }
    }
}

function dispatchApiEdit(view: core.EditorView, tr: core.Transaction): void {
    view.dispatch(tr)
}

/** Monaco editor.executeEdits */
export function executeEdits(view: core.EditorView, source: string | null | undefined, edits: IIdentifiedSingleEditOperation[], endCursorState?: ICursorStateComputer | ISelection[]): boolean {
    if (view.state.readOnly) return false
    const state = view.state
    const doc = state.doc
    const ops: Op[] = []
    edits.forEach((e, i) => {
        const [from, to] = docRangeOffsets(doc, e.range)
        const text = e.text ?? ''
        ops.push({ from, to, text, major: 0, minor: i, identifier: e.identifier as Op['identifier'], force: !!e.forceMoveMarkers })
    })
    const sortedAll = uniqueOps(ops) // 含空操作:逆操作要按编辑一一对应(snippet 靠 identifier 找回每个光标的那一条)
    const sorted = sortedAll.filter(o => o.from !== o.to || o.text !== '')
    assertNoOverlap(sorted)
    if (!sorted.length) {
        // 没有实际编辑:Monaco 仍会按 endCursorState 设光标(函数形态也照样回调,逆操作都是空操作)
        const chosenNoop = typeof endCursorState === 'function'
            ? endCursorState(inverseOps(doc, doc, sortedAll, state.lineBreak.length).sort((a, b) => a.minor - b.minor).map(({ range, text, identifier, textChange }) => ({ range, text, identifier, textChange })))
            : endCursorState
        if (chosenNoop && chosenNoop.length) {
            const ranges = chosenNoop.map((s) => { const { anchor, head } = offsetsOfSelection(doc, s); return EditorSelection.range(anchor, head) })
            dispatchApiEdit(view, state.update({ selection: EditorSelection.create(ranges, 0), annotations: [apiEdit.of(true)] }))
        }
        return true
    }
    const probe = state.update({ changes: toSpecs(sorted) })
    const changes = probe.changes
    const newDoc = probe.newDoc
    // snippet 来源:插入文本里带的「开 .. 闭」算自动补的,之后打闭符过键
    const effects = source === 'snippet' ? snippetAutoClosedEffects(state, sorted.map(o => ({ from: o.from, to: o.to, text: o.text })), changes) : []
    if (typeof endCursorState === 'function') {
        // Monaco pushEditOperations:先改 model,再调 cursorStateComputer(回调里读 model / 装饰看到的是编辑之后的样子,
        // snippet 会话就在回调里建装饰),最后才设光标。所以分两步:先落改动(光标随编辑搬),回调算出来的光标再单独落一次。
        dispatchApiEdit(view, state.update({ changes, selection: mapSelectionLikeMonaco(state.selection, changes, sorted), annotations: [apiEdit.of(true), ...forceAnn(sorted)] }))
        const inverse = inverseOps(doc, newDoc, sortedAll, state.lineBreak.length)
        // Monaco:相邻(touching)时按位置序给逆操作,否则按传入顺序
        if (!sortedAll.some((o, i) => i > 0 && o.from <= sortedAll[i - 1].to)) inverse.sort((a, b) => a.minor - b.minor)
        const picked = endCursorState(inverse.map(({ range, text, identifier, textChange }) => ({ range, text, identifier, textChange })))
        if (picked && picked.length) {
            const cur = view.state.doc
            const sel = EditorSelection.create(picked.map((s) => {
                const { anchor, head } = offsetsOfSelection(cur, s)
                return EditorSelection.range(anchor, head)
            }), 0)
            // 不进撤销历史:这一步只是把光标放到回调算出的位置,撤销栈里仍是「一次编辑」
            // 自动补的闭符记录跟着这一步登记:此时光标已在开 .. 闭之间(先落改动那一步光标被搬到插入文本末尾,在 enclosing 之外会被当场作废)
            dispatchApiEdit(view, view.state.update({ selection: sel, effects, annotations: [Transaction.addToHistory.of(false)] }))
        }
        return true
    }
    const chosen = endCursorState
    const selection = chosen && chosen.length
        ? EditorSelection.create(chosen.map((s) => {
            const { anchor, head } = offsetsOfSelection(newDoc, s)
            return EditorSelection.range(anchor, head)
        }), 0)
        : mapSelectionLikeMonaco(state.selection, changes, sorted)
    dispatchApiEdit(view, state.update({ changes, selection, effects, annotations: [apiEdit.of(true), ...forceAnn(sorted)] }))
    return true
}

interface Tracked { from: number, to: number, direction: SelectionDirection, stickiness: number }

/** TrackedRangeStickiness → mapPos 的 assoc。起点向前粘:Always / OnlyBefore;终点向前粘:Never / OnlyBefore */
export function stickinessAssoc(stickiness: number): { start: -1 | 1, end: -1 | 1 } {
    return {
        start: stickiness === 0 || stickiness === 2 ? -1 : 1,
        end: stickiness === 1 || stickiness === 2 ? -1 : 1,
    }
}

/** Monaco Cursor 里 CommandExecutor 的移植:收集编辑 → 去冲突 → 一次应用 → computeCursorState */
function runCommands(view: core.EditorView, commands: (ICommand | null | undefined)[], selectionsBefore: EditorSelection): boolean {
    const state = view.state
    const doc = state.doc
    if (!commands.some(Boolean)) return false
    const preModel = createCommandModel(doc, languageIdOf(view))
    const tracked: Tracked[] = []
    let ops: Op[] = []
    commands.forEach((command, major) => {
        if (!command) return
        const local: Op[] = []
        let minor = 0
        const add = (range: IRange, text: string | null, force?: boolean) => {
            const [from, to] = docRangeOffsets(doc, range)
            const t = text ?? ''
            if (from === to && t === '') return
            local.push({ from, to, text: t, major, minor: minor++, force: !!force })
        }
        const builder: IEditOperationBuilder = {
            addEditOperation: (range, text, force) => add(range, text, force),
            addTrackedEditOperation: (range, text, force) => add(range, text, force),
            trackSelection: (s, trackPreviousOnEmpty) => {
                const { anchor, head } = offsetsOfSelection(doc, s)
                const from = Math.min(anchor, head)
                const to = Math.max(anchor, head)
                let stickiness: number
                if (from === to) {
                    if (typeof trackPreviousOnEmpty === 'boolean') stickiness = trackPreviousOnEmpty ? 2 : 3
                    else {
                        const line = doc.lineAt(from)
                        stickiness = from === line.to ? 2 : 3
                    }
                } else stickiness = 1
                tracked.push({ from, to, direction: anchor <= head ? SelectionDirection.LTR : SelectionDirection.RTL, stickiness })
                return String(tracked.length - 1)
            },
        }
        try {
            command.getEditOperations(preModel, builder)
            ops = ops.concat(local)
        } catch (e) {
            console.error(e)
        }
    })
    if (!ops.length) return false

    // 重叠:后者(major 大的)输,整条命令的编辑都丢掉(同 Monaco _getLoserCursorMap)
    const losers = new Set<number>()
    let work = ops.slice().sort((a, b) => (b.to - a.to) || (b.from - a.from))
    for (let i = 1; i < work.length; i++) {
        const prev = work[i - 1]
        const cur = work[i]
        if (prev.from < cur.to) {
            const loser = prev.major > cur.major ? prev.major : cur.major
            losers.add(loser)
            for (let j = 0; j < work.length; j++) {
                if (work[j].major === loser) {
                    work.splice(j, 1)
                    if (j < i) i--
                    j--
                }
            }
            if (i > 0) i--
        }
    }
    if (losers.has(0) && commands[0]) {
        console.warn('Ignoring commands')
        return false
    }
    work = uniqueOps(work)
    if (!work.length) return false

    const probe = state.update({ changes: toSpecs(work) })
    const newDoc = probe.newDoc
    const postModel = createCommandModel(newDoc, languageIdOf(view))
    const inverse = inverseOps(doc, newDoc, work, state.lineBreak.length)
    const byMajor = new Map<number, (IValidEditOperation & { major: number, minor: number })[]>()
    for (const op of inverse) {
        const list = byMajor.get(op.major) ?? []
        list.push(op)
        byMajor.set(op.major, list)
    }
    const after: Selection[] = []
    commands.forEach((command, i) => {
        if (!command || losers.has(i)) return
        const mine = (byMajor.get(i) ?? []).sort((a, b) => a.minor - b.minor)
        if (!mine.length) {
            const before = selectionsBefore.ranges[Math.min(i, selectionsBefore.ranges.length - 1)]
            after.push(toSelection(doc, before.anchor, before.head))
            return
        }
        const helper: ICursorStateComputerData = {
            getInverseEditOperations: () => mine.map(({ range, text }) => ({ range, text })),
            getTrackedSelection: (id) => {
                const t = tracked[parseInt(id, 10)]
                const a = stickinessAssoc(t.stickiness)
                const from = probe.changes.mapPos(t.from, a.start)
                const to = Math.max(from, probe.changes.mapPos(t.to, a.end))
                return t.direction === SelectionDirection.LTR ? toSelection(newDoc, from, to) : toSelection(newDoc, to, from)
            },
        }
        let result: Selection | null | undefined
        try { result = command.computeCursorState(postModel, helper) } catch (e) { console.error(e) }
        if (result) after.push(Selection.liftSelection(result))
    })
    const ranges = after.map((s) => { const { anchor, head } = offsetsOfSelection(newDoc, s); return EditorSelection.range(anchor, head) })
    const selection = ranges.length ? EditorSelection.create(ranges, 0) : mapSelectionLikeMonaco(selectionsBefore, probe.changes, work)
    dispatchApiEdit(view, state.update({ changes: probe.changes, selection, annotations: [apiEdit.of(true), ...forceAnn(work)] }))
    return true
}

/** Monaco editor.executeCommand:先收成单光标,再跑一个命令 */
export function executeCommand(view: core.EditorView, _source: string | null | undefined, command: ICommand): void {
    if (view.state.readOnly) return
    const main = view.state.selection.main
    runCommands(view, [command], EditorSelection.create([main], 0))
}

/** Monaco editor.executeCommands:命令按光标一一对应(commands[i] 对应第 i 个光标) */
export function executeCommands(view: core.EditorView, _source: string | null | undefined, commands: (ICommand | null)[]): void {
    if (view.state.readOnly) return
    runCommands(view, commands, view.state.selection)
}

export function pushUndoStop(view: core.EditorView): boolean {
    if (view.state.readOnly) return false
    view.dispatch(view.state.update({ annotations: [undoStop.of('push')] }))
    return true
}

export function popUndoStop(view: core.EditorView): boolean {
    if (view.state.readOnly) return false
    view.dispatch(view.state.update({ annotations: [undoStop.of('pop')] }))
    return true
}

// ───────────── 实例 API ─────────────

/** `addCommand` 的处理函数:第一个参数是 Monaco 的 ServicesAccessor(这里只有占位的 get) */
export type ICommandHandler = (accessor: { get(id: unknown): unknown }, ...args: unknown[]) => void

export interface ICommandsApi {
    addCommand(keybinding: number, handler: ICommandHandler, context?: string): string | null
    executeEdits(source: string | null | undefined, edits: IIdentifiedSingleEditOperation[], endCursorState?: ICursorStateComputer | Selection[]): boolean
    executeCommand(source: string | null | undefined, command: ICommand): void
    executeCommands(source: string | null | undefined, commands: (ICommand | null)[]): void
    pushUndoStop(): boolean
    popUndoStop(): boolean
}

const accessor = { get(): unknown { return undefined } }
let commandCounter = 0

export function installCommands(ctx: EditorContext): void {
    const view = ctx.view
    installKeyDispatch(ctx)
    const api = ctx.api as unknown as ICommandsApi
    api.addCommand = (keybinding, handler, context) => {
        const id = `__lite_monaco_command_${++commandCounter}`
        const run = (...args: unknown[]) => handler(accessor, ...args)
        const cmd = setViewCommand(view, id, run)
        const key = keybinding ? addViewKeybinding(view, keybinding, context, () => run()) : null
        ctx.onDispose(() => { cmd.dispose(); key?.dispose() })
        return id
    }
    // 视图更新合并到微任务里一次画(同 trigger;Monaco 的视图也是攒到下一帧才 render),state / model / 事件仍同步
    api.executeEdits = (source, edits, endCursorState) => view.deferView(() => executeEdits(view, source, edits, endCursorState as ICursorStateComputer | ISelection[] | undefined))
    api.executeCommand = (source, command) => view.deferView(() => executeCommand(view, source, command))
    api.executeCommands = (source, commands) => view.deferView(() => executeCommands(view, source, commands))
    api.pushUndoStop = () => pushUndoStop(view)
    api.popUndoStop = () => popUndoStop(view)
}
