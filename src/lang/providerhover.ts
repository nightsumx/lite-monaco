// registerHoverProvider 的悬停源(Monaco MarkdownHoverParticipant 对 HoverProvider 那一支)。
//
// 注册表 languageFeatures.hoverProvider → 按 selector 打分取 provider(同时问),结果合成一张卡;
// 结果无效(没 range / 内容全空)丢弃,range 不含光标的也丢弃(Monaco 只收盖住锚点的 hover)。
// 走 core 的 hoverSources facet:和诊断卡、TS quickInfo 卡并在同一张卡里,不另开 tooltip。
import type { HoverSource } from '../core/feature/hover'
import type { EditorView } from '../core/view/editorview'
import { languageFeatures } from './languagefeatures'
import { CancellationTokenSource } from './async'
import { renderMarkdown } from './tsmarkdown'
import { Position, Range } from '../api/position'
import type { ITextModel } from '../api/model'
import type { IMarkdownString } from '../monaco/top-types'

const viewModel = (view: EditorView): ITextModel | null => (view as unknown as { getModel?: () => ITextModel | null }).getModel?.() ?? null
const isEmptyMd = (m: IMarkdownString | undefined): boolean => !m || (typeof m === 'string' ? !m : !m.value)

export const providerHoverSource: HoverSource = (_state, pos, _side, view) => {
    const model = view ? viewModel(view) : null
    if (!view || !model || !languageFeatures.hoverProvider.has(model)) return null
    const position = model.getPositionAt(pos)
    const cts = new CancellationTokenSource()
    return (async () => {
        const hovers = (await Promise.all(languageFeatures.hoverProvider.ordered(model).map(async p => {
            try { return await p.provideHover(model, position, cts.token) } catch (e) { console.error(e); return undefined }
        }))).flatMap(h => {
            if (!h || h.range === undefined || !h.contents?.some(c => !isEmptyMd(c))) return []
            return Range.lift(h.range).containsPosition(position) ? [h] : []
        })
        if (!hovers.length) return null
        const spans = hovers.map(h => {
            const r = Range.lift(h.range!)
            return { from: model.getOffsetAt(r.getStartPosition()), to: model.getOffsetAt(r.getEndPosition()) }
        })
        return {
            pos: Math.min(...spans.map(s => s.from)),
            end: Math.max(...spans.map(s => s.to)),
            create: () => {
                const root = document.createElement('div')
                root.className = 'cm-provider-hover'
                for (const h of hovers) for (const c of h.contents) if (!isEmptyMd(c)) root.appendChild(renderMarkdown(typeof c === 'string' ? c : c.value))
                return root
            },
        }
    })()
}
export type { Position }
