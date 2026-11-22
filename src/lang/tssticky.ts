// TS navigation tree → sticky scroll 作用域(Monaco stickyScroll.defaultModel = 'outlineModel')。
//
// Monaco 链路:OutlineAdapter.provideDocumentSymbols(getNavigationTree,range = selectionRange = spans[0],
// 不按 kind 过滤)→ OutlineModel → StickyModelFromCandidateOutlineProvider:
//   - 顶层元素全收(单行的也收,它参与候选二分和去重,只是不上榜);
//   - 子元素只收跨行的;子元素起始行和父相同(`const x = {` 里的对象字面量、`export default class` 等)
//     时不另起一层,直接把它的子元素挂到父下;
//   - 范围 = [起始行, 末行],sticky 体末 = 末行 - 1(收尾 `}` 不算体);同层按 (起始行升, 末行降) 排序。
// 语言服务没就绪 / navigation tree 为空 → publish(null),overlay 退回折叠范围(Monaco 的 foldingProviderModel)。

import type { EditorView } from '../core/view/editorview'
import type { StickyNode, StickyOutlineSource } from '../core/feature/stickyscroll'
import { getTSService, type TSServiceOptions } from './tsservice'
import { materializeDoc, budgetForState } from '../core/perf'

/** navigation tree 节点里用到的字段(ts.NavigationTree 的子集) */
export interface NavItem {
    spans: readonly { start: number, length: number }[]
    childItems?: readonly NavItem[]
}

const cmp = (a: StickyNode, b: StickyNode) => a.start - b.start || b.end - a.end

/**
 * 顶层 nav 条目 → sticky 作用域树(StickyNode.end = 体末行,即 Monaco range.endLineNumber - 1)。
 * 没有条目 → null(Monaco isModelValid:outline 为空时换下一个 provider)。
 */
export function navTreeToSticky(items: readonly NavItem[], lineAt: (pos: number) => number): StickyNode[] | null {
    if (!items.length) return null
    const range = (it: NavItem) => {
        const s = it.spans[0]
        return s ? { start: lineAt(s.start), end: lineAt(s.start + s.length) } : null
    }
    const build = (it: NavItem, r: { start: number, end: number }, prevStart: number): StickyNode => {
        const children: StickyNode[] = []
        for (const c of it.childItems ?? []) {
            const cr = range(c)
            if (!cr || cr.start === cr.end) continue
            if (cr.start !== prevStart) children.push(build(c, cr, cr.start))
            else for (const sub of c.childItems ?? []) {
                const sr = range(sub)
                if (sr) children.push(build(sub, sr, cr.start))
            }
        }
        children.sort(cmp)
        return { start: r.start, end: r.end - 1, children }
    }
    const roots: StickyNode[] = []
    for (const it of items) {
        const r = range(it)
        if (r) roots.push(build(it, r, r.start))
    }
    roots.sort(cmp)
    return roots
}

// Monaco:内容变化 → RunOnceScheduler 50ms → Delayer 300ms → 取 outline。Monaco 在 worker 里算,这里在主线程:
// getNavigationTree 约 4ms / 千行(同名声明多时 TS 合并近二次方,5 万行重复块实测 10s+),所以
//   - XL 文档不取 outline,退回折叠范围;L 文档防抖放长;
//   - 上次耗时 × 8 做防抖下限,连续编辑时主线程占用不超过约 1/8。
const debounceFor = (view: EditorView, lastCost: number) => {
    const c = budgetForState(view.state).docClass
    return Math.max(c === 'L' ? 800 : 350, lastCost * 8)
}

/** stickyScrollOverlay 的 outline 来源:TS 语言服务的 getNavigationTree,异步、防抖,滚动时不碰 TS */
export function tsStickyOutline(opts: TSServiceOptions): StickyOutlineSource {
    return (view, publish) => {
        const session = getTSService(opts)
        let timer: ReturnType<typeof setTimeout> | null = null
        let seq = 0
        let disposed = false
        let lastCost = 0
        let published = false

        const run = async () => {
            const my = ++seq
            if (budgetForState(view.state).docClass === 'XL') {
                if (published) { published = false; publish(null) }
                return
            }
            const state = view.state
            session.update(materializeDoc(state))
            let items: readonly NavItem[] = []
            const t0 = Date.now()
            try { items = (await session.service().getNavigationTree(session.fileName))?.childItems ?? [] }
            catch { return }
            lastCost = Date.now() - t0
            // 回来时文档又变了:行号按旧文本算的,丢掉(onTransaction 已排下一轮)
            if (disposed || my !== seq || view.state.doc !== state.doc) return
            const roots = navTreeToSticky(items, pos => state.doc.lineAt(Math.min(pos, state.doc.length)).number)
            published = !!roots
            publish(roots)
        }

        const schedule = (ms: number) => {
            if (timer) clearTimeout(timer)
            timer = setTimeout(() => { timer = null; void run() }, ms)
        }
        const off = view.onTransaction(tr => {
            if (tr.docChanged) schedule(debounceFor(view, lastCost))
        })
        schedule(300)
        return () => {
            disposed = true
            if (timer) clearTimeout(timer)
            off()
        }
    }
}
