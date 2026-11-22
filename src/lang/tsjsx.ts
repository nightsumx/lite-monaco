// JSX 闭合标签 —— 打 `>` 时问 LS getJsxClosingTagAtPosition，在 `>` 后补 `</tag>`，光标停在中间。
// JSX 联动编辑 —— 改开标签名时，闭标签名跟着变。
//
// 语言服务在 Worker 里，请求是异步的：处理器同步返回 false（默认输入照常发生），请求回来后若文档、光标
// 还是默认输入后的样子，再补一笔后续编辑（并进刚才输入的撤销步）；否则丢弃。见 tsinputsync.ts。

import type { EditorView } from '../core/view/editorview'
import type { InputHandler } from '../core/view/editorview'
import { EditorSelection } from '../core/model/selection'
import type { ChangeSet } from '../core/model/change'
import type { Rope } from '../core/model/rope'
import { getTSService, type TSServiceOptions } from './tsservice'
import { followUpGuard, inputSettled, joinPrevious, watchView } from './tsinputsync'
import { materializeDoc } from '../core/perf'

export function linkRangeChanges(
    ranges: { from: number, to: number }[],
    from: number,
    to: number,
    insert: string,
): { changes: { from: number, to: number, insert: string }[], cursor: number } | null {
    if (ranges.length < 2) return null
    const hit = ranges.find(r => from >= r.from && to <= r.to)
    if (!hit) return null
    const relFrom = from - hit.from
    const relTo = to - hit.from
    const changes = ranges
        .map(r => ({ from: r.from + relFrom, to: r.from + relTo, insert }))
        .sort((a, b) => a.from - b.from)
    return { changes, cursor: from + insert.length }
}

/**
 * 一串「默认输入」：每笔 edits[k] 是第 k 笔输入相对它输入前文档的改动，after 是最后一笔输入后的文档。
 * 联动区间只在「开/闭标签名一致」时才问得出来（TS 的要求），所以连打时第二笔的请求问到的是
 * 已经不一致的文本、什么也问不到；第一笔的结果回来时要靠这串改动把区间推到最新文档上，不能因为文档变了就丢。
 */
interface Chain { edits: ChangeSet[], after: Rope }

export function jsxLinkedEditInput(opts: TSServiceOptions): InputHandler {
    const session = getTSService(opts)
    const chains = new WeakMap<EditorView, Chain>()
    return (view, from, to, insert) => {
        if (view.state.readOnly) return false
        if (view.state.selection.ranges.length > 1) return false
        watchView(view)
        // 问的是输入前的文本和位置（和同步版一样）：此时开/闭标签名都还是一致的两个区间
        session.update(materializeDoc(view.state))
        const first = view.state.changes({ from, to, insert })
        // 接得上上一笔输入后的文档就续上这串改动，否则（中间有别的改动）另起一串，旧串的结果作废
        let chain = chains.get(view)
        if (!chain || chain.edits.length >= 200 || !inputSettled(view, chain.after)) {
            chain = { edits: [], after: view.state.doc }
            chains.set(view, chain)
        }
        const k = chain.edits.length
        chain.edits.push(first)
        chain.after = first.apply(view.state.doc)
        const mine = chain
        session.service().getLinkedEditingRangeAtPosition(session.fileName, from).then(info => {
            const ranges = (info?.ranges ?? []).map(r => ({ from: r.start, to: r.start + r.length }))
            // 不在联动区间内 / 不足两处：不处理
            if (!linkRangeChanges(ranges, from, to, insert)) return
            // 文档必须恰好是这串输入之后的样子（别处改过、销毁、多选区都丢弃）
            if (chains.get(view) !== mine || !inputSettled(view, mine.after)) return
            const hit = ranges.find(r => from >= r.from && to <= r.to)!
            // 把区间从第 k 笔输入前推到最新文档
            let map = mine.edits[k]
            for (let n = k + 1; n < mine.edits.length; n++) map = map.compose(mine.edits[n])
            // 命中区间现在的名字，其余区间改成它（而不是照搬这一笔相对偏移：两边总是被重新对齐）
            const name = view.state.sliceDoc(map.mapPos(hit.from, -1), map.mapPos(hit.to, 1))
            const changes = ranges
                .filter(r => r !== hit)
                .map(r => ({ from: map.mapPos(r.from, -1), to: map.mapPos(r.to, 1), insert: name }))
                .filter(c => view.state.sliceDoc(c.from, c.to) !== name)
                .sort((a, b) => a.from - b.from)
            if (!changes.length) return
            view.dispatch(view.state.update({
                changes,
                userEvent: 'input.type',
                scrollIntoView: true,
                annotations: joinPrevious,
            }))
        }, () => {})
        return false
    }
}

export function jsxCloseInsert(insert: string, close: string): { insert: string, cursor: number } | null {
    if (insert !== '>' || !close) return null
    return { insert: '>' + close, cursor: 1 }
}

export function jsxCloseTagInput(opts: TSServiceOptions): InputHandler {
    const session = getTSService(opts)
    const begin = followUpGuard()
    return (view: EditorView, from, to, insert) => {
        if (view.state.readOnly) return false
        if (insert !== '>') return false
        if (view.state.selection.ranges.length > 1) return false
        // 问的是 `>` 已经打进去的文本（默认输入后的样子）
        const next = view.state.changes({ from, to, insert }).apply(view.state.doc)
        session.update(next.toString())
        const valid = begin(view, next, from + 1)
        session.service().getJsxClosingTagAtPosition(session.fileName, from + 1).then(info => {
            const spec = jsxCloseInsert(insert, info?.newText ?? '')
            if (!spec || !valid()) return
            // `>` 已在文档里：只补它后面的闭合标签，光标留在两者之间
            view.dispatch(view.state.update({
                changes: { from: from + 1, insert: spec.insert.slice(1) },
                selection: EditorSelection.cursor(from + spec.cursor),
                userEvent: 'input.type',
                scrollIntoView: true,
                annotations: joinPrevious,
            }))
        }, () => {})
        return false
    }
}
