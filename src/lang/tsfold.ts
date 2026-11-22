// TS outlining → 可折行。缩进看不到的块（import 组等）走 extraFoldField。

import type { EditorView } from '../core/view/editorview'
import { extraFoldField, setExtraFolds } from '../core/edit/fold'
import { getTSService, type TSServiceOptions } from './tsservice'
import { materializeDoc } from '../core/perf'
import { lineNumberAt, lineStartsOf } from './tsbudget'

export function outliningToFolds(
    text: string,
    spans: { start: number, length: number }[],
): { line: number, from: number, to: number }[] {
    if (!text || !spans.length) return []
    // 行首表一次建好,每个 span 二分取行(旧实现每 span 从头扫,大文件 O(span×长度) 冻主线程)
    const starts = lineStartsOf(text)
    const lineAt = (pos: number) => {
        const p = Math.max(0, Math.min(text.length, pos))
        const line = lineNumberAt(starts, p)
        const to = line < starts.length ? starts[line] - 1 : text.length
        return { line, from: starts[line - 1], to }
    }
    const out: { line: number, from: number, to: number }[] = []
    const seen = new Set<number>()
    for (const s of spans) {
        if (s.length <= 0) continue
        const start = lineAt(s.start)
        const end = lineAt(s.start + s.length)
        if (end.line <= start.line) continue
        if (seen.has(start.line)) continue
        seen.add(start.line)
        out.push({ line: start.line, from: start.to, to: end.to })
    }
    return out
}

export function tsFoldSession(view: EditorView, opts: TSServiceOptions): () => void {
    const session = getTSService(opts)
    let timer: ReturnType<typeof setTimeout> | null = null
    let seq = 0
    let disposed = false

    const run = async () => {
        const my = ++seq
        const sentDoc = view.state.doc
        const text = materializeDoc(view.state)
        session.update(text)
        let spans: { textSpan: { start: number, length: number }, kind: string }[] = []
        try { spans = await session.service().getOutliningSpans(session.fileName) ?? [] }
        catch { return }
        // 注释块(连续 // 行、/* */)不要:Monaco 的 TS 没有折叠 provider,注释只按缩进折(缩进的 JSDoc 能折,
        // 平齐的 // 组和 /* */ 不能)。import 组、对象字面量、模板串等其余 outlining 照旧补上
        spans = spans.filter(s => s.kind !== 'comment')
        // 回来时文档又变了:这份折叠按旧文本算的,位置不对应,丢掉(下一轮防抖已排)
        if (disposed || my !== seq || view.state.doc !== sentDoc) return
        const folds = outliningToFolds(text, spans.map(s => ({
            start: s.textSpan.start,
            length: s.textSpan.length,
        })))
        const cur = view.state.field(extraFoldField, false) ?? []
        if (sameFolds(cur, folds)) return
        view.dispatch(view.state.update({ effects: setExtraFolds.of(folds) }))
    }

    const schedule = () => {
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => { void run() }, 280)
    }

    const off = view.onTransaction(tr => {
        if (tr.docChanged) schedule()
    })
    schedule()
    return () => {
        disposed = true
        if (timer) clearTimeout(timer)
        off()
    }
}

function sameFolds(
    a: readonly { line: number, from: number, to: number }[],
    b: readonly { line: number, from: number, to: number }[],
): boolean {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++)
        if (a[i].line !== b[i].line || a[i].from !== b[i].from || a[i].to !== b[i].to)
            return false
    return true
}
