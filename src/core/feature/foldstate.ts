// 折叠状态的导出 / 导入 —— Monaco FoldingController.saveViewState / restoreViewState 的 memento 形态。
//
// getFoldState(state) 对应 saveViewState():{ collapsedRegions, lineCount, provider, foldedImports },
// collapsedRegions 是 FoldingModel.getMemento():每个已折或手建的块一项
// { startLineNumber, endLineNumber, isCollapsed, source, checksum },source 0 = provider、1 = userDefined、2 = recovered,
// checksum = hash(起始行下一行的内容 + 末行内容) % 1000000(用来确认内容没变)。没有可存的块时 collapsedRegions 是 undefined。
// setFoldState(state, vs) 对应 restoreViewState():照 applyMemento 校验(范围越界跳过、有 checksum 且对不上跳过),
// 返回要派发的事务(没东西可恢复返回 null)。恢复是叠加的:已经折着的不动。

import type { EditorState, StateEffect, Transaction } from '../model/state'
import { foldField, foldable, manualFoldField, extraFoldField, setManualFolds, foldEffect, foldTransaction } from '../edit/fold'

/** Monaco FoldSource */
export const enum FoldSource { provider = 0, userDefined = 1, recovered = 2 }

/** Monaco FoldingModel.getMemento() 的一项 */
export interface FoldMemento {
    startLineNumber: number
    endLineNumber: number
    isCollapsed?: boolean
    source?: FoldSource
    checksum?: number
}

/** Monaco FoldingController.saveViewState() 的返回值 */
export interface FoldViewState {
    collapsedRegions?: FoldMemento[]
    lineCount?: number
    provider?: string
    foldedImports?: boolean
}

// Monaco base/common/hash.ts 的字符串哈希(hashVal * 31 + ch,int32)
const numberHash = (val: number, h: number) => (((h << 5) - h) + val) | 0
function stringHash(s: string, h = 0): number {
    h = numberHash(149417, h)
    for (let i = 0; i < s.length; i++) h = numberHash(s.charCodeAt(i), h)
    return h
}

function checksum(state: EditorState, startLine: number, endLine: number): number {
    const doc = state.doc
    return stringHash(doc.line(startLine + 1).text + doc.line(endLine).text) % 1000000
}

/** 导出折叠状态(Monaco saveViewState)。 */
export function getFoldState(state: EditorState): FoldViewState {
    const doc = state.doc
    const folded = state.field(foldField, false)
    const manual = state.field(manualFoldField, false) ?? []
    const manualByLine = new Map(manual.filter(r => r.to <= doc.length).map(r => [r.line, r]))
    const regions = new Map<number, FoldMemento>()
    const add = (line: number, source: FoldSource, collapsed: boolean) => {
        const f = foldable(state, doc.line(line).from)
        if (!f) return
        const end = doc.lineAt(f.to).number
        if (line >= end || line < 1 || end > doc.lines) return
        regions.set(line, { startLineNumber: line, endLineNumber: end, isCollapsed: collapsed, source, checksum: checksum(state, line, end) })
    }
    // 已折叠的(provider 块或手建块);手建块不管折没折都要存
    for (const r of manualByLine.values()) if (r.line <= doc.lines) add(r.line, r.recovered ? FoldSource.recovered : FoldSource.userDefined, !!folded?.has(r.line))
    if (folded) for (const n of folded) if (n <= doc.lines && !regions.has(n)) add(n, FoldSource.provider, true)
    const list = [...regions.values()].sort((a, b) => a.startLineNumber - b.startLineNumber)
    const hasExtra = (state.field(extraFoldField, false) ?? []).length > 0
    return {
        collapsedRegions: list.length ? list : undefined,
        lineCount: doc.lines,
        provider: hasExtra ? 'syntax' : 'indent',
        foldedImports: false,
    }
}

/**
 * 导入折叠状态(Monaco restoreViewState → applyMemento),返回要派发的事务;没有可恢复的返回 null。
 * 参数可以是 getFoldState 的整个返回值,也可以只是 collapsedRegions 数组。
 */
export function setFoldState(state: EditorState, memento: FoldViewState | readonly FoldMemento[] | null | undefined): Transaction | null {
    const list = Array.isArray(memento) ? memento as readonly FoldMemento[] : (memento as FoldViewState | null | undefined)?.collapsedRegions
    if (!Array.isArray(list) || !list.length) return null
    const doc = state.doc
    const manual = new Map((state.field(manualFoldField, false) ?? []).map(r => [r.line, r]))
    let manualChanged = false
    const folds: number[] = []
    for (const r of list as readonly FoldMemento[]) {
        const a = r.startLineNumber, b = r.endLineNumber
        if (!(a < b) || a < 1 || b > doc.lines) continue
        if (r.checksum && checksum(state, a, b) !== r.checksum) continue
        const source = r.source ?? FoldSource.provider
        if (source !== FoldSource.provider) {
            // 手建块 / 恢复块:按记下的范围放进手建表
            manual.set(a, { line: a, from: doc.line(a).to, to: doc.line(b).to, ...(source === FoldSource.recovered ? { recovered: true } : {}) })
            manualChanged = true
        } else if (!foldable(state, doc.line(a).from)) continue
        if (r.isCollapsed ?? true) folds.push(a)
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out: StateEffect<any>[] = []
    if (manualChanged) out.push(setManualFolds.of([...manual.values()].sort((x, y) => x.line - y.line)))
    const already = state.field(foldField, false)
    for (const n of folds) if (!already?.has(n)) out.push(foldEffect.of(n))
    if (!out.length) return null
    return foldTransaction(state, { effects: out }, false)
}
