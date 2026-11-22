// saveViewState / restoreViewState(Monaco ICodeEditorViewState),H1。
//
// 形态逐字段对照 codeEditorWidget.saveViewState / restoreViewState + viewModelImpl.saveState / reduceRestoreState:
//   cursorState        每个选区一项 { inSelectionMode, selectionStart, position },主选区在最前
//   viewState          { scrollLeft, firstPosition, firstPositionDeltaTop }:
//                      firstPosition = scrollTop 处第一条可见行的行首,firstPositionDeltaTop = 该行顶 - scrollTop
//                      (所以折叠、换行、view zone 变了之后恢复出来的还是同一行贴在同一位置;旧格式只有 scrollTop 也认)
//   contributionsState { 'editor.contrib.folding': <K2b 的 getFoldState> }
// restore 的顺序同 Monaco:先光标,再各 contribution(折叠),最后滚动。
import type { EditorContext } from './context'
import type { ICodeEditorViewState, ICursorState, IPosition, IViewState } from './types'
import type { Rope } from '../core/model/rope'
import { EditorSelection } from '../core/model/selection'
import { EditorState } from '../core/model/state'
import { getFoldState, setFoldState } from '../core/feature/foldstate'

export const FOLDING_CONTRIB_ID = 'editor.contrib.folding'

/** (行, 列) → 偏移;越界按 Monaco validatePosition 夹取 */
function offsetAt(doc: Rope, p: IPosition): number {
    const ln = Math.min(Math.max(1, Math.floor(p?.lineNumber) || 1), doc.lines)
    const line = doc.line(ln)
    return line.from + Math.min(Math.max(1, Math.floor(p?.column) || 1), line.length + 1) - 1
}
function positionAt(doc: Rope, offset: number): IPosition {
    const line = doc.lineAt(Math.min(Math.max(0, offset), doc.length))
    return { lineNumber: line.number, column: offset - line.from + 1 }
}

/** 纵向偏移 → 该处第一条可见行的行号(隐藏行高度为 0,不会被选中) */
function lineNumberAtOffset(ctx: EditorContext, top: number): number {
    const { view } = ctx
    const doc = view.state.doc
    let lo = 1, hi = doc.lines
    while (lo < hi) {
        const mid = (lo + hi) >> 1
        const b = view.lineBlockAt(doc.line(mid).from)
        if (b.bottom > top) hi = mid
        else lo = mid + 1
    }
    return lo
}

export function installViewState(ctx: EditorContext): void {
    const { view, api } = ctx

    api.saveViewState = (): ICodeEditorViewState | null => {
        const state = view.state
        const doc = state.doc
        const sel = state.selection
        // 主选区放最前(Monaco getSelections() 的顺序)
        const order = [sel.mainIndex, ...sel.ranges.map((_, i) => i).filter(i => i !== sel.mainIndex)]
        const cursorState: ICursorState[] = order.map(i => {
            const r = sel.ranges[i]
            return { inSelectionMode: !r.empty, selectionStart: positionAt(doc, r.anchor), position: positionAt(doc, r.head) }
        })
        const scrollTop = view.scrollDOM.scrollTop
        const first = lineNumberAtOffset(ctx, scrollTop)
        const viewState: IViewState = {
            scrollLeft: view.scrollDOM.scrollLeft,
            firstPosition: { lineNumber: first, column: 1 },
            firstPositionDeltaTop: view.lineBlockAt(doc.line(first).from).top - scrollTop,
        }
        return { cursorState, viewState, contributionsState: { [FOLDING_CONTRIB_ID]: getFoldState(state) } }
    }

    api.restoreViewState = (saved: ICodeEditorViewState | null): void => {
        // Monaco:没有 cursorState 或 viewState 就什么都不做
        if (!saved || !saved.cursorState || !saved.viewState) return
        // 1. 光标
        const cursors = saved.cursorState
        if (Array.isArray(cursors) && cursors.length > 0) {
            const doc = view.state.doc
            const multi = view.state.facet(EditorState.allowMultipleSelections)
            const ranges = (multi ? cursors : cursors.slice(0, 1)).map(c =>
                EditorSelection.range(offsetAt(doc, c.selectionStart), offsetAt(doc, c.position)))
            view.dispatch(view.state.update({ selection: EditorSelection.create(ranges, 0) }))
        }
        // 2. 各 contribution(目前只有折叠)
        const fold = saved.contributionsState?.[FOLDING_CONTRIB_ID]
        if (fold) {
            const tr = setFoldState(view.state, fold as Parameters<typeof setFoldState>[1])
            if (tr) view.dispatch(tr)
        }
        // 3. 滚动
        const vs = saved.viewState
        let scrollTop: number | undefined
        if (vs.firstPosition) {
            const doc = view.state.doc
            const ln = Math.min(Math.max(1, Math.floor(vs.firstPosition.lineNumber) || 1), doc.lines)
            scrollTop = view.lineBlockAt(doc.line(ln).from).top - (vs.firstPositionDeltaTop || 0)
        } else if (typeof vs.scrollTop === 'number') scrollTop = vs.scrollTop
        const v = view as unknown as { setScrollPosition?: (p: { scrollTop?: number, scrollLeft?: number }, type?: number) => void }
        const pos = { ...(scrollTop === undefined ? {} : { scrollTop: Math.max(0, scrollTop) }), scrollLeft: vs.scrollLeft || 0 }
        if (typeof v.setScrollPosition === 'function') v.setScrollPosition(pos, 1 /* ScrollType.Immediate */)
        else {
            if (pos.scrollTop !== undefined) view.scrollDOM.scrollTop = pos.scrollTop
            view.scrollDOM.scrollLeft = pos.scrollLeft
        }
    }
}
