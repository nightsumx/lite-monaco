// Portions of this file are derived from CodeMirror 6 (MIT, Copyright (C) Marijn Haverbeke and others). See THIRD-PARTY-NOTICES.md.
// CM7 history —— 撤销/重做。纯状态机:HistoryState 在 ChangeSet + EditorSelection 之上的代数,
// 挂成 StateField(阶段1 state.ts 的一等扩展),零 DOM。这是 §4「commands 抄思路自己写,95% 纯逻辑」
// 的头一块:undo/redo 的全部语义是「事务流 → 可逆事件分支」,与浏览器无关。
//
// 移植自 CM6 commands/history.ts,适配 CM7:
//   - Transaction.time:调用方可显式注;未注时 history 消费 Date.now() 作分组时钟
//     (time≡0 会使 delay 条件恒真,所有可并事件粘成一坨)。
//   - invertedEffects facet:H3 恢复,给 setEOL 这类「只有 effect 没有文本改动」的事务进撤销栈用。
//   - 砍 joinToEvent 配置点:那是给插件覆盖合并逻辑的钩子,默认 isAdjacent 合并够用,无消费者。
//   - 砍 filter:false:阶段1 已无 change/transaction filter,无可绕过。
//   - 砍 history()/historyKeymap 的 EditorView.domEventHandlers + KeyBinding:视图接线,落阶段4 接入。
//   - 禁正则:joinableUserEvent / /^select/ 改成词法前缀判定。
//
// 可监测:HistoryState.toJSON/fromJSON 双射(=可监测公理);pop() 产纯 Transaction spec,可重放。

import type { ChangeDesc, ChangeSet } from '../model/change'
import type { EditorSelection } from '../model/selection'
import type { EditorState, Extension, StateEffect, Transaction, TransactionSpec } from '../model/state'
import { ChangeDesc as ChangeDescClass, ChangeSet as ChangeSetClass } from '../model/change'
import { EditorSelection as Sel } from '../model/selection'
import { Annotation, StateEffect as Effect, Facet, StateField, Transaction as Tr } from '../model/state'
import { cursorHistoryField } from './cursorundo'
import { autoWhitespaceField } from './enter'

export { cursorRedo, cursorUndo } from './cursorundo'

enum BranchName { Done, Undone }

// 历史内部回写注解:pop 出的事务带着「这是从哪个分支弹出、剩余分支、目标选区」回流给 update。
const fromHistory = Annotation.define<{ side: BranchName, rest: Branch, selection: EditorSelection, endSelection?: EditorSelection }>()

// 阻止某事务并入相邻撤销组。"before" 不与前并,"after" 不与后并,"full" 两侧隔离。
export const isolateHistory = Annotation.define<'before' | 'after' | 'full'>()

// 撤销栈分隔(Monaco pushStackElement / popStackElement,即 pushUndoStop / popUndoStop)。
// 'push':关闭当前撤销组,后面的 API 编辑另起一组;'pop':重新打开(后面的 API 编辑并回上一组)。
// 挂在不带变更的空事务上即可。
export const undoStop = Annotation.define<'push' | 'pop'>()

// 编辑器 API 的编辑(executeEdits / executeCommand):不按 userEvent 分类打字/删除,
// 只要上一组没被 undoStop 关闭、光标也没动过,就并进上一组(Monaco:两次 executeEdits 之间没有 pushUndoStop 就是同一步)。
export const apiEdit = Annotation.define<boolean>()

// Monaco forceMoveMarkers:这笔事务里哪些编辑(旧文档偏移 [from, to])要把落在编辑边缘的装饰边界强制推到插入文本之后。
// 只影响装饰/追踪范围的映射,不影响光标和文本。
export const forceMoveMarkers = Annotation.define<readonly (readonly [number, number])[]>()

// 反向 effect 钩子(= CM6 invertedEffects):给一笔事务,返回「撤销它要发的 effect」。
// 没有文本改动、只有 effect 的事务(比如换行符 setEOL)靠它进撤销栈。
export const invertedEffects = Facet.define<(tr: Transaction) => readonly StateEffect<unknown>[]>()

// 清空撤销栈的事务(Monaco TextModel.setValue / setModel 的语义:整篇替换后旧历史作废)。带这个注解的事务不入栈,栈直接清空。
export const clearHistory = Annotation.define<boolean>()
// 把撤销栈整个换成另一份(setModel:每个 model 各有自己的栈,切回来时接着用)。值是别的 state 里 historyField 的值,不透明。
export const restoreHistory = Annotation.define<unknown>()

interface HistoryConfig {
    minDepth?: number
    newGroupDelay?: number
}

const historyConfig = Facet.define<HistoryConfig, Required<HistoryConfig>>({
    combine(configs) {
        let minDepth = 100
        // Monaco 不按时间分组(停顿不切组),默认不限;显式配置 newGroupDelay 时仍按时间切。
        let newGroupDelay = Infinity
        for (const c of configs) {
            if (c.minDepth != null)
                minDepth = Math.max(minDepth, c.minDepth)
            if (c.newGroupDelay != null)
                newGroupDelay = Math.min(newGroupDelay, c.newGroupDelay)
        }
        return { minDepth, newGroupDelay }
    },
})

const historyField_ = StateField.define<HistoryState>({
    create() {
        return HistoryState.empty
    },

    update(state: HistoryState, tr: Transaction): HistoryState {
        const restored = tr.annotation(restoreHistory)
        if (restored) return restored as HistoryState
        if (tr.annotation(clearHistory)) return HistoryState.empty
        const config = tr.startState.facet(historyConfig)

        const fromHist = tr.annotation(fromHistory)
        if (fromHist) {
            const item = HistEvent.fromTransaction(tr, fromHist.selection, fromHist.endSelection)
            const from = fromHist.side
            let other = from === BranchName.Done ? state.undone : state.done
            if (item)
                other = updateBranch(other, other.length, config.minDepth, item)
            else other = addSelection(other, tr.startState.selection)
            return new HistoryState(
                from === BranchName.Done ? fromHist.rest : other,
                from === BranchName.Done ? other : fromHist.rest,
                0, undefined, EditOp.None, true,
            )
        }

        const isolate = tr.annotation(isolateHistory)
        if (isolate === 'full' || isolate === 'before')
            state = state.isolate()

        if (tr.annotation(Tr.addToHistory) === false)
            return tr.changes.empty ? state : state.addMapping(tr.changes.desc)

        const event = HistEvent.fromTransaction(tr)
        const api = tr.annotation(apiEdit) === true
        // 无显式 time 时用墙钟(视图层通常不注 time)。测试可传 Transaction.time 钉死。
        // 旧行为 time≡0 会使 delay 条件恒真 → 所有可并事件被粘成一大坨。
        const time = tr.annotation(Tr.time) ?? Date.now()
        const userEvent = tr.annotation(Tr.userEvent)
        if (event)
            state = state.addChanges(event, time, userEvent, config, api ? apiClass : classifyEdit(tr, state.prevOp), api)
        else if (tr.selection)
            state = state.addSelection(tr.startState.selection, time, userEvent, config.newGroupDelay)

        const stop = tr.annotation(undoStop)
        if (stop === 'push')
            state = state.isolate().withClosed(true)
        else if (stop === 'pop')
            state = state.withClosed(false)
        if (isolate === 'full' || isolate === 'after')
            state = state.isolate()
        // 语法断点:敲完 // / # / /* 后切断后续合并 → undo 可回到「仅注释符」
        // (// 123 → 一次 undo 剩 //,再 undo 才去注释符)
        else if (completedSyntaxStop(tr))
            state = state.isolate()
        return state
    },

    toJSON(value) {
        return { done: value.done.map(e => e.toJSON()), undone: value.undone.map(e => e.toJSON()) }
    },

    fromJSON(json) {
        const j = json as { done: unknown[], undone: unknown[] }
        return new HistoryState(j.done.map(HistEvent.fromJSON), j.undone.map(HistEvent.fromJSON))
    },
})

// 历史扩展:撤销栈 + 光标撤销栈(⌘U,见 cursorundo.ts)+ 配置。
export function history(config: HistoryConfig = {}): Extension {
    return [historyField_, cursorHistoryField, autoWhitespaceField, historyConfig.of(config)]
}

// 历史状态字段。序列化/反序列化保留历史时引用它(EditorState.toJSON({history: historyField}))。
export const historyField = historyField_

function cmd(side: BranchName, selection: boolean) {
    return function ({ state, dispatch }: { state: EditorState, dispatch: (tr: Transaction) => void }): boolean {
        if (!selection && state.readOnly)
            return false
        const historyState = state.field(historyField_, false)
        if (!historyState)
            return false
        const tr = historyState.pop(side, state, selection)
        if (!tr)
            return false
        dispatch(tr)
        return true
    }
}

export const undo = cmd(BranchName.Done, false)
export const redo = cmd(BranchName.Undone, false)
export const undoSelection = cmd(BranchName.Done, true)
export const redoSelection = cmd(BranchName.Undone, true)

function depth(side: BranchName) {
    return function (state: EditorState): number {
        const histState = state.field(historyField_, false)
        if (!histState)
            return 0
        const branch = side === BranchName.Done ? histState.done : histState.undone
        return branch.length - (branch.length && !branch[0].changes ? 1 : 0)
    }
}

export const undoDepth = depth(BranchName.Done)
export const redoDepth = depth(BranchName.Undone)

const none: readonly never[] = []

const MaxSelectionsPerEvent = 200

// 历史事件:一组要一起撤销/重做的变更或选区。changes==startSelection==undefined 表示纯选区事件。
class HistEvent {
    constructor(
        readonly changes: ChangeSet | undefined,
        readonly effects: readonly StateEffect<unknown>[],
        readonly mapped: ChangeDesc | undefined,
        readonly startSelection: EditorSelection | undefined,
        readonly selectionsAfter: readonly EditorSelection[],
        // 这次编辑完成后的选区(撤销后再重做时恢复它,对齐 Monaco:重做落「编辑后的光标」而非把新文本选中)
        readonly endSelection?: EditorSelection,
    ) {}

    setSelAfter(after: readonly EditorSelection[]) {
        return new HistEvent(this.changes, this.effects, this.mapped, this.startSelection, after, this.endSelection)
    }

    toJSON(): unknown {
        return {
            changes: this.changes?.toJSON(),
            mapped: this.mapped?.toJSON(),
            startSelection: this.startSelection?.toJSON(),
            selectionsAfter: this.selectionsAfter.map(s => s.toJSON()),
            ...(this.endSelection ? { endSelection: this.endSelection.toJSON() } : {}),
        }
    }

    static fromJSON(json: unknown): HistEvent {
        const j = json as {
            changes?: unknown
            mapped?: unknown
            startSelection?: unknown
            selectionsAfter: unknown[]
            endSelection?: unknown
        }
        return new HistEvent(
            j.changes ? ChangeSetClass.fromJSON(j.changes) : undefined,
            [],
            j.mapped ? ChangeDescClass.fromJSON(j.mapped) : undefined,
            j.startSelection ? Sel.fromJSON(j.startSelection) : undefined,
            j.selectionsAfter.map(s => Sel.fromJSON(s)),
            j.endSelection ? Sel.fromJSON(j.endSelection) : undefined,
        )
    }

    // 不检查 addToHistory,假定事务确实要转事件。无变更无 effect 时返 null。
    static fromTransaction(tr: Transaction, selection?: EditorSelection, endSelection?: EditorSelection): HistEvent | null {
        let effects: readonly StateEffect<unknown>[] = none
        for (const f of tr.startState.facet(invertedEffects)) effects = effects.concat(f(tr))
        if (!effects.length && tr.changes.empty)
            return null
        return new HistEvent(
            tr.changes.invert(tr.startState.doc),
            effects,
            undefined,
            selection || tr.startState.selection,
            none,
            endSelection || tr.newSelection,
        )
    }

    static selection(selections: readonly EditorSelection[]): HistEvent {
        return new HistEvent(undefined, none, undefined, undefined, selections)
    }
}

type Branch = readonly HistEvent[]

function updateBranch(branch: Branch, to: number, maxLen: number, newEvent: HistEvent): Branch {
    const start = to + 1 > maxLen + 20 ? to - maxLen - 1 : 0
    const newBranch = branch.slice(start, to)
    newBranch.push(newEvent)
    return newBranch
}

function isAdjacent(a: ChangeDesc, b: ChangeDesc): boolean {
    const ranges: number[] = []
    let adjacent = false
    a.iterChangedRanges((f, t) => ranges.push(f, t))
    b.iterChangedRanges((_f, _t, f, t) => {
        for (let i = 0; i < ranges.length;) {
            const from = ranges[i++]
            const to = ranges[i++]
            if (t >= from && f <= to)
                adjacent = true
        }
    })
    return adjacent
}

function eqSelectionShape(a: EditorSelection, b: EditorSelection): boolean {
    return a.ranges.length === b.ranges.length
        && a.ranges.filter((r, i) => r.empty !== b.ranges[i].empty).length === 0
}

function conc<T>(a: readonly T[], b: readonly T[]): readonly T[] {
    return !a.length ? b : !b.length ? a : a.concat(b)
}

function addSelection(branch: Branch, selection: EditorSelection): Branch {
    if (!branch.length)
        return [HistEvent.selection([selection])]
    const lastEvent = branch[branch.length - 1]
    const sels = lastEvent.selectionsAfter.slice(Math.max(0, lastEvent.selectionsAfter.length - MaxSelectionsPerEvent))
    if (sels.length && sels[sels.length - 1].eq(selection))
        return branch
    sels.push(selection)
    return updateBranch(branch, branch.length - 1, 1e9, lastEvent.setSelAfter(sels))
}

// 假定顶层事件有至少一个 selectionAfter
function popSelection(branch: Branch): Branch {
    const last = branch[branch.length - 1]
    const newBranch = branch.slice()
    newBranch[branch.length - 1] = last.setSelAfter(last.selectionsAfter.slice(0, last.selectionsAfter.length - 1))
    return newBranch
}

// 给分支顶层事件加映射。若映射抹掉该事件的全部变更/effect,丢弃它并把映射下传给下一个事件。
function addMappingToBranch(branch: Branch, mapping: ChangeDesc): Branch {
    if (!branch.length)
        return branch
    let length = branch.length
    let selections: readonly EditorSelection[] = none
    while (length) {
        const event = mapEvent(branch[length - 1], mapping, selections)
        if ((event.changes && !event.changes.empty) || event.effects.length) {
            const result = branch.slice(0, length)
            result[length - 1] = event
            return result
        }
        mapping = event.mapped!
        length--
        selections = event.selectionsAfter
    }
    return selections.length ? [HistEvent.selection(selections)] : none
}

function mapEvent(event: HistEvent, mapping: ChangeDesc, extraSelections: readonly EditorSelection[]): HistEvent {
    const selections = conc(
        event.selectionsAfter.length ? event.selectionsAfter.map(s => s.map(mapping)) : none,
        extraSelections,
    )
    // 无变更事件不存映射(它们总是分支末尾事件)
    if (!event.changes)
        return HistEvent.selection(selections)

    const mappedChanges = event.changes.map(mapping)
    const before = mapping.mapDesc(event.changes, true)
    const fullMapping = event.mapped ? event.mapped.composeDesc(before) : before
    return new HistEvent(
        mappedChanges,
        Effect.mapEffects(event.effects, mapping),
        fullMapping,
        event.startSelection!.map(before),
        selections,
        event.endSelection?.map(mapping),
    )
}

// 撤销分组,对齐 Monaco(cursor.js 的 EditOperationType 与 shouldPushStackElementBetween):
//   - 打字:空格分 FirstSpace / ConsecutiveSpace,其余为 TypingOther。不同类之间切组,但 FirstSpace
//     之后不切(`hello world` → 两组:`hello`、` world`)。停顿不切组。
//   - Enter(input.newline)、自动闭合(input.type.autoclose)前切组,后面的打字并进来。
//   - 包裹选区(input.type.surround)、粘贴、行操作、Tab、删词等命令:前后都切。
//   - 连续退格(delete.backward)/ 连续删除(delete.forward)各自并组;跨行删除前切组。
//   - 光标移动后的编辑一律另起一组(selectionsAfter 非空)。
//   - IME 组字(input.type.compose)沿用旧规则:总并入上一组;之后的打字按 TypingOther 接着并。
export const enum EditOp { None, TypingOther, FirstSpace, ConsecutiveSpace, DeletingLeft, DeletingRight, Compose, Other }

interface Classified { op: EditOp, stopBefore: boolean, stopAfter: boolean }
// API 编辑的分类:不切组(并不并由 addChanges 的 api 分支按 closed 决定),之后的打字不并进来
const apiClass: Classified = { op: EditOp.Other, stopBefore: false, stopAfter: false }

function insertedText(tr: Transaction): string | null {
    let text: string | null = null
    let same = true
    tr.changes.iterChanges((_fa, _ta, _fb, _tb, inserted) => {
        const t = inserted.toString()
        if (text === null) text = t
        else if (text !== t) same = false
    })
    return same ? text : null
}

function deletesLineBreak(tr: Transaction): boolean {
    let multi = false
    tr.changes.iterChanges((fromA, toA) => {
        if (!multi && toA > fromA && tr.startState.sliceDoc(fromA, toA).includes('\n')) multi = true
    })
    return multi
}

function isEvent(e: string | undefined, name: string): boolean {
    return !!e && (e === name || e.startsWith(name + '.'))
}

export function classifyEdit(tr: Transaction, prevOp: EditOp): Classified {
    const e = tr.annotation(Tr.userEvent)
    if (isEvent(e, 'input.type.compose')) return { op: EditOp.Compose, stopBefore: false, stopAfter: false }
    if (isEvent(e, 'input.type.surround')) return { op: EditOp.Other, stopBefore: true, stopAfter: true }
    if (isEvent(e, 'input.type.autoclose') || isEvent(e, 'input.newline'))
        return { op: EditOp.TypingOther, stopBefore: true, stopAfter: false }
    if (isEvent(e, 'input.type')) {
        const text = insertedText(tr)
        if (text === ' ')
            return { op: prevOp === EditOp.FirstSpace || prevOp === EditOp.ConsecutiveSpace ? EditOp.ConsecutiveSpace : EditOp.FirstSpace, stopBefore: false, stopAfter: false }
        return { op: EditOp.TypingOther, stopBefore: false, stopAfter: false }
    }
    if (e === 'delete.backward') return { op: EditOp.DeletingLeft, stopBefore: deletesLineBreak(tr), stopAfter: false }
    if (e === 'delete.forward') return { op: EditOp.DeletingRight, stopBefore: deletesLineBreak(tr), stopAfter: false }
    return { op: EditOp.Other, stopBefore: true, stopAfter: true }
}

const normalizeOp = (op: EditOp) => op === EditOp.FirstSpace || op === EditOp.ConsecutiveSpace ? EditOp.ConsecutiveSpace : op
const isTypingOp = (op: EditOp) => op === EditOp.TypingOther || op === EditOp.FirstSpace || op === EditOp.ConsecutiveSpace

function canJoinOps(prevOp: EditOp, cur: Classified): boolean {
    if (cur.op === EditOp.Compose) return true
    // 组字提交在 Monaco 里就是 TypingOther:之后接着打字并进同一组
    const prev = prevOp === EditOp.Compose ? EditOp.TypingOther : prevOp
    if (prev === EditOp.None || prev === EditOp.Other || cur.stopBefore) return false
    if (isTypingOp(prev) && !isTypingOp(cur.op)) return false
    if (prev === EditOp.FirstSpace) return true
    return normalizeOp(prev) === normalizeOp(cur.op)
}

/**
 * 打字事务是否刚完成「语法引入符」,应对后续输入断组。
 * 行首(可有空白)的 //、#、/* —— 对齐 Monaco:undo 先回到注释符,再撤注释符本身。
 */
export function completedSyntaxStop(tr: Transaction): boolean {
    if (!tr.docChanged || !tr.isUserEvent('input.type')) return false
    const sel = tr.newSelection.main
    if (!sel.empty) return false
    const head = sel.head
    if (head < 1) return false
    const doc = tr.newDoc
    const line = doc.lineAt(head)
    // 行首空白后到光标的片段
    let i = line.from
    while (i < head) {
        const ch = doc.sliceString(i, i + 1)
        if (ch !== ' ' && ch !== '\t') break
        i++
    }
    const token = doc.sliceString(i, head)
    return token === '//' || token === '#' || token === '/*'
}

// select / select.xxx 前缀(禁正则)。
function isSelectUserEvent(e: string): boolean {
    return e === 'select' || e.startsWith('select.')
}

class HistoryState {
    constructor(
        readonly done: Branch,
        readonly undone: Branch,
        private readonly prevTime: number = 0,
        private readonly prevUserEvent: string | undefined = undefined,
        readonly prevOp: EditOp = EditOp.None,
        // 撤销组被 pushUndoStop 关闭(任何新编辑都会重开)
        readonly closed: boolean = false,
    ) {}

    isolate(): HistoryState {
        return new HistoryState(this.done, this.undone, this.prevTime, 'history.isolate', EditOp.None, this.closed)
    }

    withClosed(closed: boolean): HistoryState {
        return closed === this.closed ? this : new HistoryState(this.done, this.undone, this.prevTime, this.prevUserEvent, this.prevOp, closed)
    }

    addChanges(event: HistEvent, time: number, userEvent: string | undefined, config: Required<HistoryConfig>, cls: Classified, api = false): HistoryState {
        let done = this.done
        const lastEvent = done[done.length - 1]
        // 合并:操作类可并(canJoinOps)+ 期间没有光标移动 + 变更相邻(+ 显式配置的时间窗);组字例外总并。
        // API 编辑(executeEdits / executeCommand)不看相邻和操作类:没被 pushUndoStop 关闭、光标没动就并(同 Monaco)。
        if (lastEvent && lastEvent.changes && !lastEvent.changes.empty && event.changes
            && (api
                ? !this.closed && !lastEvent.selectionsAfter.length
                : canJoinOps(this.prevOp, cls)
                    && ((!lastEvent.selectionsAfter.length
                        && time - this.prevTime < config.newGroupDelay
                        && isAdjacent(lastEvent.changes, event.changes))
                    || cls.op === EditOp.Compose))) {
            done = updateBranch(done, done.length - 1, config.minDepth, new HistEvent(
                event.changes.compose(lastEvent.changes),
                conc(Effect.mapEffects(event.effects, lastEvent.changes), lastEvent.effects),
                lastEvent.mapped,
                lastEvent.startSelection,
                none,
                event.endSelection,
            ))
        }
        else {
            done = updateBranch(done, done.length, config.minDepth, event)
        }
        return new HistoryState(done, none, time, userEvent, cls.stopAfter ? EditOp.None : cls.op)
    }

    addSelection(selection: EditorSelection, time: number, userEvent: string | undefined, newGroupDelay: number): HistoryState {
        const last = this.done.length ? this.done[this.done.length - 1].selectionsAfter : none
        if (last.length > 0
            && time - this.prevTime < newGroupDelay
            && userEvent === this.prevUserEvent && userEvent && isSelectUserEvent(userEvent)
            && eqSelectionShape(last[last.length - 1], selection)) {
            return this
        }
        return new HistoryState(addSelection(this.done, selection), this.undone, time, userEvent, EditOp.None, this.closed)
    }

    addMapping(mapping: ChangeDesc): HistoryState {
        return new HistoryState(
            addMappingToBranch(this.done, mapping),
            addMappingToBranch(this.undone, mapping),
            this.prevTime,
            this.prevUserEvent,
            this.prevOp,
            this.closed,
        )
    }

    pop(side: BranchName, state: EditorState, onlySelection: boolean): Transaction | null {
        const branch = side === BranchName.Done ? this.done : this.undone
        if (branch.length === 0)
            return null
        const event = branch[branch.length - 1]
        const selection = event.selectionsAfter[0]
            || event.endSelection
            || (event.startSelection ? event.startSelection.map(event.changes!.invertedDesc, 1) : state.selection)
        if (onlySelection && event.selectionsAfter.length) {
            const spec: TransactionSpec = {
                selection: event.selectionsAfter[event.selectionsAfter.length - 1],
                annotations: fromHistory.of({ side, rest: popSelection(branch), selection }),
                userEvent: side === BranchName.Done ? 'select.undo' : 'select.redo',
                scrollIntoView: true,
            }
            return state.update(spec)
        }
        else if (!event.changes) {
            return null
        }
        else {
            let rest: Branch = branch.length === 1 ? none : branch.slice(0, branch.length - 1)
            if (event.mapped)
                rest = addMappingToBranch(rest, event.mapped)
            const spec: TransactionSpec = {
                changes: event.changes,
                selection: event.startSelection,
                effects: event.effects,
                annotations: fromHistory.of({ side, rest, selection, endSelection: event.startSelection }),
                userEvent: side === BranchName.Done ? 'undo' : 'redo',
                scrollIntoView: true,
            }
            return state.update(spec)
        }
    }

    static empty: HistoryState = new HistoryState(none, none)
}
