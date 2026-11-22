// languages.registerCodeLensProvider(Monaco editor/contrib/codelens:CodeLensContribution + CodeLensWidget)。
//
// 所有 provider(ordered)并发问 provideCodeLenses,没 range 的丢掉,按 行 / provider 优先级 / 列 排序;
// 同一行的归一组 = 一个 view zone(行上方,afterLineNumber = 行 - 1),组里每个 lens 一个 <a>(有 command.id)或 <span>,中间 " | "。
// 没 command 的 lens 在视口内才 resolveCodeLens(滚动 / 布局变了重算,防抖 250ms);点击 → executeCommand(id, ...arguments)。
// 时序同 Monaco:装好 / provider 或其 onDidChange 变 / 获得焦点 → 防抖 250ms 重新问;改文档同样 250ms,期间 zone 随编辑移动。
// 选项:codeLens(默认开)、codeLensFontFamily / codeLensFontSize(<5 或 0 → fontSize * 0.9)。
// 未实现:CodeLens 缓存(CodeLensCache,换 model 来回切不闪)、`$(icon)` 标题里的 codicon(整段去掉)、disposal 的 oldModels 延迟回收。
import type { LiteMonacoEditor } from '../api/types'
import type { EditorView } from '../core/view/editorview'
import type { ITextModel } from '../api/model'
import type * as T from '../monaco/languages-types'
import { languageFeatures } from './languagefeatures'
import { CancellationTokenSource, type CancellationToken } from './async'
import { executeCommandById } from '../api/commands'
import { getOption } from '../core/options'
import { EditorOption } from '../core/options/types'

/** symbol = provider 给的;lens = 现在显示的(resolve 之后可能换掉,resolve 回空就是 null) */
interface LensItem { symbol: T.CodeLens, provider: T.CodeLensProvider, lens: T.CodeLens | null }
interface LensGroup { line: number, items: LensItem[], node: HTMLElement, zoneId: string, resolved: boolean }

/** Monaco getCodeLensModel:全部 provider 并发问,按 行 → provider 优先级 → 列 排序 */
export async function getCodeLensItems(model: ITextModel, token: CancellationToken): Promise<{ items: LensItem[], lists: T.CodeLensList[] }> {
    const providers = languageFeatures.codeLensProvider.ordered(model)
    const rank = new Map(providers.map((p, i) => [p, i]))
    const items: LensItem[] = []
    const lists: T.CodeLensList[] = []
    await Promise.all(providers.map(async provider => {
        try {
            const list = await provider.provideCodeLenses(model, token)
            if (!list) return
            lists.push(list)
            for (const symbol of list.lenses) if (symbol.range) items.push({ symbol, provider, lens: symbol })
        }
        catch (e) { console.error(e) }
    }))
    items.sort((a, b) =>
        a.symbol.range.startLineNumber - b.symbol.range.startLineNumber
        || rank.get(a.provider)! - rank.get(b.provider)!
        || a.symbol.range.startColumn - b.symbol.range.startColumn)
    return { items, lists }
}

/** Monaco renderLabelWithIcons 的无 codicon 版:`$(name)` 整段去掉 */
const plainTitle = (title: string): string => title.replace(/\$\([a-z0-9~-]+\)/gi, '').trim()

export function installProviderCodeLens(editor: LiteMonacoEditor): () => void {
    const view = editor as unknown as EditorView
    let disposed = false
    let groups: LensGroup[] = []
    let current: LensItem[] = []
    let lists: T.CodeLensList[] = []
    let provideTimer: ReturnType<typeof setTimeout> | null = null
    let resolveTimer: ReturnType<typeof setTimeout> | null = null
    let provideCts: CancellationTokenSource | null = null
    let resolveCts: CancellationTokenSource | null = null
    let attached: { dispose(): void }[] = []
    const modelNow = () => editor.getModel() as ITextModel | null

    const layoutInfo = () => {
        const lineHeight = editor.getOption(EditorOption.lineHeight) as number
        const baseSize = editor.getOption(EditorOption.fontSize) as number
        const factor = Math.max(1.3, lineHeight / baseSize)
        let fontSize = editor.getOption(EditorOption.codeLensFontSize) as number
        if (!fontSize || fontSize < 5) fontSize = (baseSize * 0.9) | 0
        return { fontSize, height: (fontSize * factor) | 0 }
    }

    const clearZones = () => {
        if (!groups.length) return
        const old = groups
        groups = []
        editor.changeViewZones(acc => { for (const g of old) acc.removeZone(g.zoneId) })
    }
    const disposeLists = () => { for (const l of lists) { try { l.dispose?.() } catch (e) { console.error(e) } } lists = [] }

    const paint = (g: LensGroup, model: ITextModel) => {
        const { fontSize } = layoutInfo()
        const family = editor.getOption(EditorOption.codeLensFontFamily) as string
        g.node.style.fontSize = `${fontSize}px`
        g.node.style.lineHeight = `${layoutInfo().height}px`
        if (family) g.node.style.fontFamily = family
        // 对齐这一行的缩进(Monaco CodeLensContentWidget 把 lens 放在行首非空白处)
        const text = model.getLineContent(g.line)
        const tabSize = model.getOptions().tabSize
        let col = 0
        for (const ch of text) { if (ch === ' ') col++; else if (ch === '\t') col += tabSize - (col % tabSize); else break }
        const fi = editor.getOption(EditorOption.fontInfo) as { spaceWidth?: number } | undefined
        g.node.style.paddingLeft = `${col * (fi?.spaceWidth ?? 0)}px`
        // Monaco CodeLensContentWidget.withCommands:没 command 的(还没 resolve)什么都不出;分隔符跟在有 command 且不是最后一个的 lens 后面;
        // 一个 lens 都没有(resolve 全回了空)才写 "no commands"
        const doc = g.node.ownerDocument
        const children: HTMLElement[] = []
        let hasSymbol = false
        g.items.forEach((it, i) => {
            const lens = it.lens
            if (!lens) return
            hasSymbol = true
            const cmd = lens.command
            if (!cmd) return
            const title = plainTitle(cmd.title)
            if (cmd.id) {
                const a = doc.createElement('a')
                a.setAttribute('role', 'button')
                if (cmd.tooltip) a.title = cmd.tooltip
                a.textContent = title
                a.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation() })
                a.addEventListener('click', e => {
                    e.preventDefault()
                    void Promise.resolve(executeCommandById(view, cmd.id, ...(cmd.arguments ?? []))).catch(err => console.warn(String(err)))
                })
                children.push(a)
            }
            else {
                const sp = doc.createElement('span')
                if (cmd.tooltip) sp.title = cmd.tooltip
                sp.textContent = title
                children.push(sp)
            }
            if (i + 1 < g.items.length) { const sep = doc.createElement('span'); sep.textContent = '\u00a0|\u00a0'; children.push(sep) }
        })
        if (!hasSymbol) {
            const sp = doc.createElement('span')
            sp.textContent = 'no commands'
            g.node.replaceChildren(sp)
        }
        else g.node.replaceChildren(...children)
    }

    const render = (items: LensItem[], model: ITextModel) => {
        current = items
        clearZones()
        const byLine = new Map<number, LensItem[]>()
        for (const it of items) {
            const l = it.symbol.range.startLineNumber
            if (l < 1 || l > model.getLineCount()) continue
            ;(byLine.get(l) ?? byLine.set(l, []).get(l)!).push(it)
        }
        const { height } = layoutInfo()
        editor.changeViewZones(acc => {
            for (const [line, its] of byLine) {
                const node = document.createElement('div')
                node.className = 'codelens-decoration'
                const g: LensGroup = { line, items: its, node, zoneId: '', resolved: false }
                g.zoneId = acc.addZone({ afterLineNumber: line - 1, heightInPx: height, domNode: node, suppressMouseDown: true })
                groups.push(g)
            }
        })
        for (const g of groups) paint(g, model)
    }

    const inViewport = (g: LensGroup, model: ITextModel): boolean => {
        const off = model.getOffsetAt({ lineNumber: g.line, column: 1 } as never)
        return off >= view.viewport.from - 1 && off <= view.viewport.to + 1
    }
    const resolveViewport = async () => {
        const model = modelNow()
        if (disposed || !model || !groups.length) return
        resolveCts?.cancel()
        const my = resolveCts = new CancellationTokenSource()
        await Promise.all(groups.filter(g => !g.resolved && inViewport(g, model)).map(async g => {
            await Promise.all(g.items.map(async it => {
                if (it.symbol.command || typeof it.provider.resolveCodeLens !== 'function') return
                try { it.lens = (await it.provider.resolveCodeLens(model, it.symbol, my.token)) ?? null }
                catch (e) { console.error(e) }
            }))
            if (my.token.isCancellationRequested || disposed || !groups.includes(g)) return
            g.resolved = true
            paint(g, model)
        }))
    }
    const resolveSoon = () => {
        if (resolveTimer) clearTimeout(resolveTimer)
        resolveTimer = setTimeout(() => { resolveTimer = null; void resolveViewport() }, 250)
    }

    const provide = async () => {
        const model = modelNow()
        if (disposed || !model) return
        if (!getOption(view.state, 'codeLens') || !languageFeatures.codeLensProvider.has(model)) { reset(); return }
        provideCts?.cancel()
        const my = provideCts = new CancellationTokenSource()
        const doc = view.state.doc
        const { items, lists: ls } = await getCodeLensItems(model, my.token)
        if (disposed || my.token.isCancellationRequested || view.state.doc !== doc) { for (const l of ls) l.dispose?.(); return }
        disposeLists()
        lists = ls
        render(items, model)
        resolveSoon()
    }
    const scheduleProvide = (ms = 250) => {
        if (provideTimer) clearTimeout(provideTimer)
        provideTimer = setTimeout(() => { provideTimer = null; void provide() }, ms)
    }
    const stop = () => {
        if (provideTimer) { clearTimeout(provideTimer); provideTimer = null }
        if (resolveTimer) { clearTimeout(resolveTimer); resolveTimer = null }
        provideCts?.cancel(); resolveCts?.cancel()
    }
    const reset = () => { stop(); clearZones(); disposeLists() }

    // provider 自己的 onDidChange(Monaco:每个 provider 订一次,provider 集合变了重订)
    const rewire = () => {
        for (const d of attached) d.dispose()
        attached = []
        const model = modelNow()
        if (!model) return
        for (const p of languageFeatures.codeLensProvider.all(model))
            if (typeof p.onDidChange === 'function') attached.push(p.onDidChange(() => scheduleProvide()))
    }
    const restart = () => { stop(); rewire(); scheduleProvide() }

    const offs = [
        view.onTransaction(tr => { if (tr.docChanged) { resolveCts?.cancel(); scheduleProvide() } }),
        languageFeatures.codeLensProvider.onDidChange(() => restart()),
        editor.onDidChangeModel(() => { reset(); restart() }),
        editor.onDidChangeModelLanguage(() => restart()),
        editor.onDidFocusEditorText(() => scheduleProvide()),
        editor.onDidScrollChange(e => { if (e.scrollTopChanged && groups.length) resolveSoon() }),
        editor.onDidLayoutChange(() => resolveSoon()),
        editor.onDidChangeConfiguration(e => {
            if (e.hasChanged(EditorOption.codeLens)) { reset(); restart() }
            else if (e.hasChanged(EditorOption.codeLensFontFamily) || e.hasChanged(EditorOption.codeLensFontSize) || e.hasChanged(EditorOption.fontInfo)) {
                const model = modelNow()
                if (model && groups.length) render(current, model)
            }
        }),
    ]
    restart()
    return () => {
        disposed = true
        stop()
        for (const d of attached) d.dispose()
        for (const o of offs) { if (typeof o === 'function') o(); else o.dispose() }
        clearZones()
        disposeLists()
    }
}
