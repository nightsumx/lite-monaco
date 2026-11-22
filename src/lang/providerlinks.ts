// languages.registerLinkProvider(Monaco editor/contrib/links LinkDetector + getLinks)。
//
// 所有 provider(ordered 反过来:优先级最高的最后并入)并发问,错误吞掉(onUnexpectedExternalError);结果按 LinksList._union 合并:
// 相交 / 相接的两条,后一个 provider 的留下。链接写进 core 的 providerLinkField,
// 下划线 / hover / Ctrl(Cmd)+点击 / editor.action.openLink 都走 core 的 linkAt 那一条路(文本识别的链接让位给 provider 的)。
// 时序同 Monaco:装好 / provider 变 / 换 model / 改 links 选项立即算;改文档防抖 1000ms;`links` 关着不算。
// 未实现:languageFeatureDebounceService 的自适应防抖(固定 1000ms)。
import type { LiteMonacoEditor } from '../api/types'
import type { EditorView } from '../core/view/editorview'
import type { ITextModel } from '../api/model'
import type * as T from '../monaco/languages-types'
import { setProviderLinks, providerLinkField, type ProviderLink } from '../core/feature/link'
import { getOption } from '../core/options'
import { EditorOption } from '../core/options/types'
import { languageFeatures } from './languagefeatures'
import { CancellationTokenSource, type CancellationToken } from './async'
import { Range } from '../api/position'

interface RawLink { link: T.ILink, provider: T.LinkProvider }

/** Monaco Link.resolve:有 url 直接用(不合法 → 'invalid');没有就问 provider.resolveLink(没实现 / 还是没 url → 'missing') */
function makeLink(model: ITextModel, raw: RawLink): ProviderLink {
    let link = raw.link
    const urlOf = (l: T.ILink) => l.url === undefined ? undefined : typeof l.url === 'string' ? l.url : l.url.toString(true)
    const range = Range.lift(link.range)
    const resolve = async (): Promise<string> => {
        const url = urlOf(link)
        if (url !== undefined) {
            if (typeof link.url === 'string') { try { new URL(link.url) } catch { if (!/^[a-z][a-z0-9+.-]*:/i.test(link.url)) throw new Error('invalid') } }
            return url
        }
        if (!raw.provider.resolveLink) throw new Error('missing')
        const resolved = await raw.provider.resolveLink(link, new CancellationTokenSource().token)
        link = resolved || link
        if (link.url === undefined) throw new Error('missing')
        return resolve()
    }
    return {
        from: model.getOffsetAt(range.getStartPosition()),
        to: model.getOffsetAt(range.getEndPosition()),
        url: urlOf(link),
        tooltip: link.tooltip,
        resolve,
    }
}

/** Monaco getLinks */
export async function getProviderLinks(model: ITextModel, token: CancellationToken): Promise<ProviderLink[]> {
    const lists = await Promise.all(languageFeatures.linkProvider.ordered(model).reverse().map(async provider => {
        try {
            const result = await provider.provideLinks(model, token)
            return (result?.links ?? []).filter(l => !!l?.range).map((link): RawLink => ({ link, provider }))
        }
        catch (e) { console.error(e); return [] as RawLink[] }
    }))
    let merged: RawLink[] = []
    for (const list of lists) merged = union(merged, list)
    return merged.map(r => makeLink(model, r))
}

/** Monaco LinksList._union:两串各自按起点升序;相交 / 相接时丢旧的留新的 */
function union(olds: RawLink[], news: RawLink[]): RawLink[] {
    const sort = (a: RawLink[]) => [...a].sort((x, y) => Range.compareRangesUsingStarts(x.link.range, y.link.range))
    const a = sort(olds), b = sort(news)
    const out: RawLink[] = []
    let i = 0, j = 0
    while (i < a.length && j < b.length) {
        if (Range.areIntersectingOrTouching(a[i].link.range, b[j].link.range)) { i++; continue }
        if (Range.compareRangesUsingStarts(a[i].link.range, b[j].link.range) < 0) out.push(a[i++])
        else out.push(b[j++])
    }
    return out.concat(a.slice(i), b.slice(j))
}

export function installProviderLinks(editor: LiteMonacoEditor): () => void {
    const view = editor as unknown as EditorView
    let timer: ReturnType<typeof setTimeout> | null = null
    let cts: CancellationTokenSource | null = null
    let disposed = false
    const modelNow = () => editor.getModel() as ITextModel | null
    const current = () => view.state.field(providerLinkField, false) ?? []
    const stop = () => { if (timer) { clearTimeout(timer); timer = null } cts?.cancel(); cts = null }
    const clear = () => { if (current().length) view.dispatch(view.state.update({ effects: setProviderLinks.of([]) })) }
    const compute = async () => {
        const model = modelNow()
        if (disposed || !model) return
        if (!getOption(view.state, 'links') || !languageFeatures.linkProvider.has(model)) { clear(); return }
        cts?.cancel()
        const my = cts = new CancellationTokenSource()
        const doc = view.state.doc
        const links = await getProviderLinks(model, my.token)
        // 取消 / 回来时文档已变(位置不对应):丢掉,改文档那一下已经排了下一轮
        if (disposed || my.token.isCancellationRequested || view.state.doc !== doc) return
        view.dispatch(view.state.update({ effects: setProviderLinks.of(links) }))
    }
    const schedule = (ms: number) => {
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => { timer = null; void compute() }, ms)
    }
    const offs = [
        view.onTransaction(tr => { if (tr.docChanged) schedule(1000) }),
        languageFeatures.linkProvider.onDidChange(() => { stop(); schedule(0) }),
        editor.onDidChangeModel(() => { stop(); clear(); schedule(0) }),
        editor.onDidChangeModelLanguage(() => { stop(); schedule(0) }),
        editor.onDidChangeConfiguration(e => { if (e.hasChanged(EditorOption.links)) { stop(); schedule(0) } }),
    ]
    schedule(0)
    return () => {
        disposed = true
        stop()
        for (const o of offs) { if (typeof o === 'function') o(); else o.dispose() }
    }
}

