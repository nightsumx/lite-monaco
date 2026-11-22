// languages.registerColorProvider(Monaco editor/contrib/colorPicker 的 ColorDetector + ColorHoverParticipant)。
//
// 所有 provider(ordered 反过来)并发问 provideDocumentColors,结果并起来,按 colorDecoratorsLimit(默认 500)截断;
// 颜色标记沿用 lite-monaco 文本颜色标记的样式(cm-hexColor 下划线,色值取 provider 给的颜色);
// hover 出色卡(色块 + provideColorPresentations 的第一个 label)。时序同 Monaco:装好 / provider 变 / 换 model 立即算,改文档防抖 250ms。
// 未实现:颜色选择器(拖动取色、换 presentation 写回文档)—— hover 里只有展示;colorDecoratorsActivatedOn 'click' 时没有 hover。
import type { LiteMonacoEditor } from '../api/types'
import type { EditorView } from '../core/view/editorview'
import type { EditorState, DecorationSet } from '../core'
import type { HoverSource } from '../core/feature/hover'
import type { ITextModel } from '../api/model'
import type * as T from '../monaco/languages-types'
import { StateEffect, StateField, Decoration, RangeSetBuilder } from '../core'
import { getOption } from '../core/options'
import { languageFeatures } from './languagefeatures'
import { CancellationTokenSource, type CancellationToken } from './async'
import { Range } from '../api/position'

export interface ProviderColor { from: number, to: number, css: string, info: T.IColorInformation, provider: T.DocumentColorProvider }

const setProviderColors = StateEffect.define<ProviderColor[]>()
export const providerColorField = StateField.define<ProviderColor[]>({
    create: () => [],
    update(v, tr) {
        for (const e of tr.effects) if (e.is(setProviderColors)) return e.value
        if (!tr.docChanged || !v.length) return v
        const out: ProviderColor[] = []
        for (const c of v) {
            const from = tr.changes.mapPos(c.from, 1), to = tr.changes.mapPos(c.to, -1)
            if (to > from) out.push({ ...c, from, to })
        }
        return out
    },
})

const enabled = (state: EditorState): boolean => getOption(state, 'colorDecorators') !== false

/** Monaco Color.toString 的 CSS 形式(分量 0-1 → rgba) */
export const cssColor = (c: T.IColor): string => `rgba(${Math.round(c.red * 255)}, ${Math.round(c.green * 255)}, ${Math.round(c.blue * 255)}, ${c.alpha})`

export function providerColorDecorations(state: EditorState): DecorationSet {
    const cs = state.field(providerColorField, false)
    const b = new RangeSetBuilder<Decoration>()
    if (!cs?.length || !enabled(state)) return b.finish()
    for (const c of [...cs].sort((a, d) => a.from - d.from || a.to - d.to))
        if (c.from < c.to && c.to <= state.doc.length)
            b.add(c.from, c.to, Decoration.mark({ class: 'cm-hexColor cm-providerColor', attributes: { style: `border-bottom: 2px solid ${c.css}` } }))
    return b.finish()
}

export const providerColorHoverSource: HoverSource = (state, pos, _side, view) => {
    if (!enabled(state) || getOption(state, 'colorDecoratorsActivatedOn') === 'click') return null
    const hit = state.field(providerColorField, false)?.find(c => c.from <= pos && pos <= c.to)
    const model = view ? ((view as unknown as { getModel?: () => ITextModel | null }).getModel?.() ?? null) : null
    if (!hit || !model) return null
    return (async () => {
        let label = ''
        try {
            const ps = await hit.provider.provideColorPresentations(model, hit.info, new CancellationTokenSource().token)
            label = ps?.[0]?.label ?? ''
        }
        catch (e) { console.error(e) }
        return {
            pos: hit.from,
            end: hit.to,
            create: () => {
                const dom = document.createElement('div')
                dom.className = 'cm-color-hover'
                dom.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 8px;'
                const swatch = document.createElement('span')
                swatch.className = 'cm-color-hover-swatch'
                swatch.style.cssText = `display:inline-block;width:32px;height:18px;border:1px solid rgba(128,128,128,.6);box-sizing:border-box;background:${hit.css};`
                const text = document.createElement('span')
                text.className = 'cm-color-hover-text'
                text.textContent = label || hit.css
                dom.append(swatch, text)
                return dom
            },
        }
    })()
}

/** Monaco getColors */
async function getColors(model: ITextModel, token: CancellationToken): Promise<{ info: T.IColorInformation, provider: T.DocumentColorProvider }[]> {
    const lists = await Promise.all(languageFeatures.colorProvider.ordered(model).reverse().map(async provider => {
        try {
            const r = await provider.provideDocumentColors(model, token)
            return (r ?? []).filter(i => !!i?.range && !!i.color).map(info => ({ info, provider }))
        }
        catch (e) { console.error(e); return [] }
    }))
    return lists.flat()
}

export function installProviderColors(editor: LiteMonacoEditor): () => void {
    const view = editor as unknown as EditorView
    let timer: ReturnType<typeof setTimeout> | null = null
    let cts: CancellationTokenSource | null = null
    let disposed = false
    const set = (cs: ProviderColor[]) => view.dispatch(view.state.update({ effects: setProviderColors.of(cs) }))
    const clear = () => { if (view.state.field(providerColorField, false)?.length) set([]) }
    const stop = () => { if (timer) { clearTimeout(timer); timer = null } cts?.cancel(); cts = null }
    const compute = async () => {
        const model = editor.getModel() as ITextModel | null
        if (disposed || !model) return
        if (!enabled(view.state) || !languageFeatures.colorProvider.has(model)) { clear(); return }
        cts?.cancel()
        const my = cts = new CancellationTokenSource()
        const doc = view.state.doc
        const found = await getColors(model, my.token)
        if (disposed || my.token.isCancellationRequested || view.state.doc !== doc) return
        const limit = getOption(view.state, 'colorDecoratorsLimit') as number
        set(found.slice(0, limit).map(({ info, provider }) => {
            const r = Range.lift(info.range)
            return { from: model.getOffsetAt(r.getStartPosition()), to: model.getOffsetAt(r.getEndPosition()), css: cssColor(info.color), info, provider }
        }))
    }
    const schedule = (ms: number) => {
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => { timer = null; void compute() }, ms)
    }
    const offs = [
        view.onTransaction(tr => { if (tr.docChanged) schedule(250) }),
        languageFeatures.colorProvider.onDidChange(() => { stop(); schedule(0) }),
        editor.onDidChangeModel(() => { stop(); clear(); schedule(0) }),
        editor.onDidChangeModelLanguage(() => { stop(); schedule(0) }),
        editor.onDidChangeConfiguration(() => { schedule(0) }),
    ]
    schedule(0)
    return () => {
        disposed = true
        stop()
        for (const o of offs) { if (typeof o === 'function') o(); else o.dispose() }
    }
}
