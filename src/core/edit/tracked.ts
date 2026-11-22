// Monaco 命令的选区跟踪(IEditOperationBuilder.trackSelection + getTrackedSelection):
// 选区变成一个 tracked range,随命令的每一处编辑按 intervalTree nodeAcceptEdit 搬,不看 CM 的 assoc。
// 粘性(TrackedRangeStickiness,cursor.ts trackSelection 选):非空 = NeverGrowsWhenTypingAtEdges(起点粘后、终点粘前);
// 空光标:显式 trackPreviousOnEmpty → 粘前 / 粘后;没给 → 在行尾粘前,否则粘后。

import type { ChangeSet } from '../model/change'
import type { EditorState } from '../model/state'
import { EditorSelection, type SelectionRange } from '../model/selection'

export interface TrackedEdit { from: number, to: number, n: number }

// Monaco intervalTree nodeAcceptEdit 对一个端点:编辑 [from,to) 换成 n 个字符后它落在哪。
// stickPrev = 端点粘前一个字符(在编辑起点上时不被推走)
export function acceptEdit(p: number, stickPrev: boolean, from: number, to: number, n: number): number {
    const before = (check: number, forceStay: boolean) => p < check || (p === check && (forceStay || stickPrev))
    const del = to - from
    const common = Math.min(del, n)
    if (before(from, del > 0)) return p
    if (common > 0 && before(from + common, del > n)) return p
    if (before(to, false)) return from + n
    return Math.max(0, p + n - del)
}

/** edits 按文档位置升序、互不重叠(原文档坐标);逐个从后往前作用,同 Monaco 把操作倒序交给 model。 */
export function trackPos(p: number, stickPrev: boolean, edits: readonly TrackedEdit[]): number {
    for (let i = edits.length - 1; i >= 0; i--) p = acceptEdit(p, stickPrev, edits[i].from, edits[i].to, edits[i].n)
    return p
}

export function trackSelection(state: EditorState, range: SelectionRange, edits: readonly TrackedEdit[], trackPreviousOnEmpty?: boolean): SelectionRange {
    let startPrev: boolean, endPrev: boolean
    if (range.empty) {
        const prev = trackPreviousOnEmpty ?? range.head === state.doc.lineAt(range.head).to
        startPrev = endPrev = prev
    }
    else { startPrev = false; endPrev = true }
    const from = trackPos(range.from, startPrev, edits)
    const to = Math.max(from, trackPos(range.to, endPrev, edits))
    return range.anchor <= range.head ? EditorSelection.range(from, to) : EditorSelection.range(to, from)
}

/**
 * Monaco intervalTree.nodeAcceptEdit 的逐字移植:一笔编辑(删 [start,end) 再插 insertLen 个字符)对一个装饰区间 [nodeStart,nodeEnd) 的映射。
 * 与 CM 的 mapPos 的区别:
 *   - 「替换」(删和插都非空):公共长度 min(del, ins) 内的标记按位置对位保留(覆写语义),其后的落到插入文本之后;
 *   - forceMoveMarkers:落在编辑边缘的标记一律被推到插入文本之后(无视 stickiness);
 *   - collapseOnReplaceEdit:编辑完整覆盖区间时区间塌成编辑起点。
 */
const enum Move { Defined, Stay, Force }
export function acceptEditOnNode(
    nodeStart: number, nodeEnd: number, stickiness: number, collapse: boolean,
    start: number, end: number, insertLen: number, force: boolean,
): [number, number] {
    const startStickPrev = stickiness === 0 || stickiness === 2
    const endStickPrev = stickiness === 1 || stickiness === 2
    // true = 该标记在 check 之前(或粘在前一个字符上),不再被后面的规则移动
    const before = (marker: number, stickPrev: boolean, check: number, move: Move): boolean =>
        marker < check ? true : marker > check ? false : move === Move.Force ? false : move === Move.Stay ? true : stickPrev
    const del = end - start
    const common = Math.min(del, insertLen)
    let s = nodeStart, e = nodeEnd
    let sDone = false, eDone = false
    if (start <= nodeStart && nodeEnd <= end && collapse) { s = start; e = start; sDone = eDone = true }
    {
        const move = force ? Move.Force : del > 0 ? Move.Stay : Move.Defined
        if (!sDone && before(nodeStart, startStickPrev, start, move)) sDone = true
        if (!eDone && before(nodeEnd, endStickPrev, start, move)) eDone = true
    }
    if (common > 0 && !force) {
        const move = del > insertLen ? Move.Stay : Move.Defined
        if (!sDone && before(nodeStart, startStickPrev, start + common, move)) sDone = true
        if (!eDone && before(nodeEnd, endStickPrev, start + common, move)) eDone = true
    }
    {
        const move = force ? Move.Force : Move.Defined
        if (!sDone && before(nodeStart, startStickPrev, end, move)) { s = start + insertLen; sDone = true }
        if (!eDone && before(nodeEnd, endStickPrev, end, move)) { e = start + insertLen; eDone = true }
    }
    const delta = insertLen - del
    if (!sDone) s = Math.max(0, nodeStart + delta)
    if (!eDone) e = Math.max(0, nodeEnd + delta)
    return [s, Math.max(s, e)]
}

/**
 * Monaco 光标在「别人改文档」(model.applyEdits / pushEditOperations)时的搬法:选区是一个 AlwaysGrowsWhenTypingAtEdges 的 tracked range,
 * 随每笔编辑按 nodeAcceptEdit 搬(forced = 带 forceMoveMarkers 的编辑,旧文档偏移 [from,to]);
 * OneCursor.readSelectionFromMarkers:原来是空光标、搬完变成非空区间 → 塌到终点(不要因为在光标处插字就变成选中)。
 */
export function mapSelectionByMarkers(sel: EditorSelection, changes: ChangeSet, forced?: readonly (readonly [number, number])[]): EditorSelection {
    const list: [number, number, number, boolean][] = []
    changes.iterChanges((fa, ta, fb, tb) => {
        list.push([fa, ta, tb - fb, !!forced && forced.some(([f, t]) => f >= fa && t <= ta)])
    })
    const ranges = sel.ranges.map((r) => {
        let from = r.from, to = r.to
        for (let i = list.length - 1; i >= 0; i--) {
            const [fa, ta, len, force] = list[i]
            ;[from, to] = acceptEditOnNode(from, to, 0, false, fa, ta, len, force)
        }
        if (r.empty && to > from) from = to
        return r.anchor <= r.head ? EditorSelection.range(from, to) : EditorSelection.range(to, from)
    })
    return EditorSelection.create(ranges, sel.mainIndex, sel.keepOverlap)
}
