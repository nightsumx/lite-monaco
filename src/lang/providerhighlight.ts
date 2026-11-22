// registerDocumentHighlightProvider 的同符号高亮(Monaco WordHighlighter 对 DocumentHighlightProvider 那一支)。
//
// 时序壳、highlightField、装饰、F7、minimap / 概览尺全部复用 tshighlight(TS 语义高亮走同一套):
//   这里只换"怎么查" —— 按 selector 打分的 provider 顺序,逐个问,第一个给出非 null / undefined 的就算(空数组也算,
//   Monaco first(...) 的 shouldStop = !!result);全都没有 → 退回文本同词(由壳处理)。
// 没有 provider 时这个 session 什么都不画,同词仍由 highlightLayer 的文本路径负责(行为不变)。
import type { EditorView } from '../core/view/editorview'
import type { ITextModel } from '../api/model'
import { highlightSession } from './tshighlight'
import { languageFeatures } from './languagefeatures'
import { CancellationTokenSource } from './async'
import { Range } from '../api/position'

const modelOf = (view: EditorView): ITextModel | null => (view as unknown as { getModel?: () => ITextModel | null }).getModel?.() ?? null

/** 当前 model 有没有 documentHighlightProvider(有 → 文本同词让位给语义结果) */
export function hasHighlightProvider(view: EditorView): boolean {
    const m = modelOf(view)
    return !!m && languageFeatures.documentHighlightProvider.has(m)
}

export function providerHighlightSession(view: EditorView): () => void {
    let cts: CancellationTokenSource | null = null
    const off = highlightSession(view, async pos => {
        const model = modelOf(view)
        if (!model) return undefined
        cts?.cancel()
        const my = cts = new CancellationTokenSource()
        const position = model.getPositionAt(pos)
        for (const p of languageFeatures.documentHighlightProvider.ordered(model)) {
            let res
            try { res = await p.provideDocumentHighlights(model, position, my.token) }
            catch (e) { console.error(e); continue }
            if (my.token.isCancellationRequested) return undefined
            if (!res) continue
            return res.map(h => {
                const r = Range.lift(h.range)
                const from = model.getOffsetAt(r.getStartPosition())
                // DocumentHighlightKind.Write = 2
                return { start: from, length: model.getOffsetAt(r.getEndPosition()) - from, kind: h.kind === 2 ? 'writtenReference' : undefined }
            })
        }
        return undefined
    }, () => hasHighlightProvider(view))
    return () => { cts?.cancel(); off() }
}
