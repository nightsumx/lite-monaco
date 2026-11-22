// Monaco contrib/find/browser/findModel:FindModelBoundToEditorModel 的翻译层。
// 查找会话的真身是 core 的 searchField(命中表 / 当前命中 / 范围 / 替换 / 循环),行为全在 src/core/feature/search.ts;
// 这里只做两件事:FindReplaceState(Monaco 的数据容器) → 会话命令;会话变化 → state.changeMatchInfo。
import { RawContextKey } from './contextkey'
import {
    MATCHES_LIMIT, searchField, setSearchOpen, setSearchScope, setSearchQuery, setSearchLoop, setSearchPreserveCase, setReplacement,
    findNext, findPrev, replaceNext, replaceAll, selectAllSearchMatches,
} from '../../src/core/feature/search'
import { Range } from '../../src/api/position'

export { MATCHES_LIMIT }
// Keep ContextKey use of 'Focussed' to not break when clauses(同 Monaco)
export const CONTEXT_FIND_INPUT_FOCUSED = new RawContextKey<boolean>('findInputFocussed', false)
export const CONTEXT_REPLACE_INPUT_FOCUSED = new RawContextKey<boolean>('replaceInputFocussed', false)

// FindReplaceState 没有公开 loop 读取器(只有 canNavigateForward),私有字段 _loop 是它的真值
export const loopOf = (state: any): boolean => state._loop
export const run = (editor: any, cmd: any): boolean => cmd({ state: editor.state, dispatch: (tr: unknown) => editor.dispatch(tr) })
/** 正在把 state 推进会话:这期间会话事务触发的"会话 → state 镜像"必须跳过,否则读到推了一半的会话把 state 改回去 */
export const pushing = { n: 0 }
/** 镜像(会话 → state)改 state 时,模型不要再把它推回会话 */
export const mirroring = new WeakSet<object>()

// core 偏移(换行占 1)↔ Monaco 行列
export function toOffset(doc: any, lineNumber: number, column: number): number {
    const l = doc.line(Math.min(Math.max(lineNumber, 1), doc.lines))
    return Math.min(l.from + Math.max(column, 1) - 1, l.to)
}
export function toRange(doc: any, from: number, to: number, Cls: new (a: number, b: number, c: number, d: number) => any = Range): any {
    const a = doc.lineAt(from), b = doc.lineAt(to)
    return new Cls(a.number, from - a.from + 1, b.number, to - b.from + 1)
}

/** state → 会话。scope=false 时不动范围(会话没开着时) */
export function pushState(editor: any, state: any, moveCursor: boolean, scope = true): void {
    pushing.n++
    try {
        const doc = () => editor.state.doc
        run(editor, setSearchLoop(loopOf(state)))
        run(editor, setReplacement(state.replaceString))
        run(editor, setSearchPreserveCase(state.preserveCase))
        if (scope) {
            const ranges = state.searchScope?.map((r: any) => ({ from: toOffset(doc(), r.startLineNumber, r.startColumn), to: toOffset(doc(), r.endLineNumber, r.endColumn) }))
            run(editor, setSearchScope(ranges ?? null))
        }
        run(editor, setSearchQuery(state.searchString, { regex: state.isRegex, wholeWord: state.wholeWord, caseSensitive: state.matchCase, moveCursor }))
    } finally { pushing.n-- }
}

export class FindModelBoundToEditorModel {
    private disposed = false
    private readonly offs: (() => void)[] = []
    constructor(private readonly editor: any, private readonly state: any) {
        run(editor, setSearchOpen(true))
        pushState(editor, state, false)
        this.offs.push(editor.onTransaction(() => this.syncInfo()))
        const sub = state.onFindReplaceStateChange((e: any) => this.onStateChanged(e))
        this.offs.push(() => sub.dispose())
        this.syncInfo()
    }
    private syncInfo(): void {
        if (this.disposed) return
        const sf = this.editor.state.field(searchField, false)
        if (!sf) return
        const count = Math.min(sf.matches.length, MATCHES_LIMIT)
        const cur = sf.highlighted ? sf.matches[sf.currentMatch] : undefined
        this.state.changeMatchInfo(count ? sf.currentMatch + 1 : 0, count, cur ? toRange(this.editor.state.doc, cur.from, cur.to) : undefined)
    }
    private onStateChanged(e: any): void {
        if (this.disposed || mirroring.has(this.state)) return
        const research = e.searchString || e.isReplaceRevealed || e.isRegex || e.wholeWord || e.matchCase || e.searchScope
        if (research || e.replaceString || e.preserveCase || e.loop) pushState(this.editor, this.state, !!(e.moveCursor && research))
        this.syncInfo()
    }
    dispose(): void {
        if (this.disposed) return
        this.disposed = true
        for (const f of this.offs) f()
        try { run(this.editor, setSearchOpen(false)) } catch { /* 编辑器已销毁 */ }
    }
    moveToNextMatch(): void { run(this.editor, findNext) }
    moveToPrevMatch(): void { run(this.editor, findPrev) }
    replace(): void { run(this.editor, replaceNext) }
    replaceAll(): void { run(this.editor, replaceAll) }
    selectAllMatches(): void { run(this.editor, selectAllSearchMatches) }
}
