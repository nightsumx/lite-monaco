// 文档大纲模型(Monaco contrib/documentSymbols/browser/outlineModel):把各 documentSymbolProvider 取回的 DocumentSymbol 树
// 建成 OutlineModel → OutlineGroup(每个 provider 一组)→ OutlineElement(带 marker 汇总);OutlineModelService 按 model 版本缓存、
// 多个调用方共用同一次取回(全部取消才取消 provider 请求)、provider 集合变了就重取。
// sticky scroll / quick outline / breadcrumbs 这类「当前光标在哪个符号里」的特性都吃这份模型。
import { CancellationTokenSource, type CancellationToken } from './async'
import type { IDisposable } from './providers'
import type { DocumentSymbol, DocumentSymbolProvider, LanguageFeatureRegistry } from './languagefeatures'
import type { IFeatureDebounceInformation, DebounceModel, LanguageFeatureDebounceService } from './featuredebounce'

type IRange = { startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number }
type IPosition = { lineNumber: number, column: number }

// ── 位置 / 范围小工具(与 Monaco Range 静态方法同语义) ──
const cmpPos = (l1: number, c1: number, l2: number, c2: number): number => l1 - l2 || c1 - c2
const compareRangesUsingStarts = (a: IRange, b: IRange): number =>
    a.startLineNumber - b.startLineNumber || a.startColumn - b.startColumn || a.endLineNumber - b.endLineNumber || a.endColumn - b.endColumn
const containsPosition = (r: IRange, p: IPosition): boolean =>
    cmpPos(p.lineNumber, p.column, r.startLineNumber, r.startColumn) >= 0 && cmpPos(p.lineNumber, p.column, r.endLineNumber, r.endColumn) <= 0
const areIntersecting = (a: IRange, b: IRange): boolean =>
    !(cmpPos(a.endLineNumber, a.endColumn, b.startLineNumber, b.startColumn) < 0 || cmpPos(b.endLineNumber, b.endColumn, a.startLineNumber, a.startColumn) < 0)

function binarySearch<T>(array: ArrayLike<T>, key: T, comparator: (a: T, b: T) => number): number {
    let low = 0, high = array.length - 1
    while (low <= high) {
        const mid = (low + high) / 2 | 0
        const c = comparator(array[mid], key)
        if (c < 0) low = mid + 1
        else if (c > 0) high = mid - 1
        else return mid
    }
    return -(low + 1)
}
const commonPrefixLength = (a: string, b: string): number => {
    const n = Math.min(a.length, b.length)
    let i = 0
    while (i < n && a.charCodeAt(i) === b.charCodeAt(i)) i++
    return i
}
const sameList = <T>(a: readonly T[], b: readonly T[]): boolean => a.length === b.length && a.every((x, i) => x === b[i])

/** MarkerSeverity 的数值(Hint 1 / Info 2 / Warning 4 / Error 8):大 = 严重 */
export interface IOutlineMarker extends IRange { severity: number }

export abstract class TreeElement {
    abstract id: string
    abstract children: Map<string, TreeElement>
    abstract parent: TreeElement | undefined

    remove(): void { this.parent?.children.delete(this.id) }

    /** id = 容器 id + 名字;同名冲突先带上起点行列,还冲突再加序号 */
    static findId(candidate: DocumentSymbol | string, container: TreeElement): string {
        let candidateId: string
        if (typeof candidate === 'string') candidateId = `${container.id}/${candidate}`
        else {
            candidateId = `${container.id}/${candidate.name}`
            if (container.children.get(candidateId) !== undefined) candidateId = `${container.id}/${candidate.name}_${candidate.range.startLineNumber}_${candidate.range.startColumn}`
        }
        let id = candidateId
        for (let i = 0; container.children.get(id) !== undefined; i++) id = `${candidateId}_${i}`
        return id
    }

    static getElementById(id: string, element: TreeElement): TreeElement | undefined {
        if (!id) return undefined
        const len = commonPrefixLength(id, element.id)
        if (len === id.length) return element
        if (len < element.id.length) return undefined
        for (const [, child] of element.children) {
            const found = TreeElement.getElementById(id, child)
            if (found) return found
        }
        return undefined
    }

    static size(element: TreeElement): number {
        let res = 1
        for (const [, child] of element.children) res += TreeElement.size(child)
        return res
    }

    static empty(element: TreeElement): boolean { return element.children.size === 0 }
}

export class OutlineElement extends TreeElement {
    children = new Map<string, OutlineElement>()
    marker: { count: number, topSev: number } | undefined
    constructor(readonly id: string, public parent: TreeElement | undefined, readonly symbol: DocumentSymbol) { super() }
}

export class OutlineGroup extends TreeElement {
    children = new Map<string, OutlineElement>()
    constructor(readonly id: string, public parent: TreeElement | undefined, readonly label: string, readonly order: number) { super() }

    getItemEnclosingPosition(position: IPosition): OutlineElement | undefined {
        return position ? this.enclosing(position, this.children) : undefined
    }
    private enclosing(position: IPosition, children: Map<string, OutlineElement>): OutlineElement | undefined {
        for (const [, item] of children) {
            if (!item.symbol.range || !containsPosition(item.symbol.range, position)) continue
            return this.enclosing(position, item.children) || item
        }
        return undefined
    }

    /** markers 已按起点排序;被某个元素「认领」的 marker 从数组里拿走(数组就地缩短) */
    updateMarker(marker: IOutlineMarker[]): void {
        for (const [, child] of this.children) this.update(marker, child)
    }
    private update(markers: IOutlineMarker[], item: OutlineElement): void {
        item.marker = undefined
        // 找到可能和该元素相交的第一个 marker
        const idx = binarySearch<IRange>(markers, item.symbol.range, compareRangesUsingStarts)
        let start: number
        if (idx < 0) {
            start = ~idx
            if (start > 0 && areIntersecting(markers[start - 1], item.symbol.range)) start -= 1
        } else start = idx

        const mine: IOutlineMarker[] = []
        let topSev: number | undefined
        for (; start < markers.length && areIntersecting(item.symbol.range, markers[start]); start++) {
            const m = markers[start]
            mine.push(m)
            ;(markers as Array<IOutlineMarker | undefined>)[start] = undefined
            if (!topSev || m.severity > topSev) topSev = m.severity
        }
        // 子元素再从认领到的里面认领;即便子元素把它们都拿走了,本元素也留下「有 marker」的记号(渲染成「子孙里有问题」的小点)
        for (const [, child] of item.children) this.update(mine, child)
        if (topSev) item.marker = { count: mine.length, topSev }
        // 就地去掉被认领的洞
        let w = 0
        for (let r = 0; r < markers.length; r++) if (markers[r] !== undefined) markers[w++] = markers[r]
        markers.length = w
    }
}

export class OutlineModel extends TreeElement {

    static create(registry: LanguageFeatureRegistry<DocumentSymbolProvider>, textModel: OutlineTextModel, token: CancellationToken): Promise<OutlineModel> {
        const cts = new CancellationTokenSource(token)
        const result = new OutlineModel(textModel.uri)
        const providers = registry.ordered(textModel)
        const promises = providers.map((provider, index) => {
            const id = TreeElement.findId(`provider_${index}`, result)
            const group = new OutlineGroup(id, result, provider.displayName ?? 'Unknown Outline Provider', index)
            return Promise.resolve(provider.provideDocumentSymbols(textModel, cts.token)).then(symbols => {
                for (const info of symbols || []) OutlineModel.makeElement(info, group)
                return group
            }, err => {
                console.error(err)
                return group
            }).then(g => {
                if (!TreeElement.empty(g)) result._groups.set(id, g)
                else g.remove()
            })
        })
        // provider 集合变了:取消这一轮,下面递归重取
        const listener = registry.onDidChange(() => {
            if (!sameList(registry.ordered(textModel), providers)) cts.cancel()
        })
        return Promise.all(promises).then(() => {
            if (cts.token.isCancellationRequested && !token.isCancellationRequested) return OutlineModel.create(registry, textModel, token)
            return result.compact()
        }).finally(() => { cts.dispose(); listener.dispose() })
    }

    private static makeElement(info: DocumentSymbol, container: OutlineGroup | OutlineElement): void {
        const id = TreeElement.findId(info, container)
        const res = new OutlineElement(id, container, info)
        for (const child of info.children ?? []) OutlineModel.makeElement(child, res)
        container.children.set(res.id, res)
    }

    static get(element: TreeElement | undefined): OutlineModel | undefined {
        while (element) {
            if (element instanceof OutlineModel) return element
            element = element.parent
        }
        return undefined
    }

    readonly id = 'root'
    readonly parent = undefined
    protected _groups = new Map<string, OutlineGroup>()
    children = new Map<string, OutlineGroup | OutlineElement>()

    protected constructor(readonly uri: { toString(): string }) { super() }

    /** 只剩一个 provider 组时,把它的元素直接提到根上(不显示组这一层) */
    private compact(): this {
        let count = 0
        for (const [key, group] of this._groups) {
            if (group.children.size === 0) this._groups.delete(key)
            else count += 1
        }
        if (count !== 1) this.children = this._groups
        else {
            const group = this._groups.values().next().value!
            for (const [, child] of group.children) {
                child.parent = this
                this.children.set(child.id, child)
            }
        }
        return this
    }

    merge(other: OutlineModel): boolean {
        if (this.uri.toString() !== other.uri.toString()) return false
        if (this._groups.size !== other._groups.size) return false
        this._groups = other._groups
        this.children = other.children
        return true
    }

    getItemEnclosingPosition(position: IPosition, context?: OutlineElement): OutlineElement | undefined {
        let preferredGroup: OutlineGroup | undefined
        if (context) {
            let candidate = context.parent
            while (candidate && !preferredGroup) {
                if (candidate instanceof OutlineGroup) preferredGroup = candidate
                candidate = candidate.parent
            }
        }
        let result: OutlineElement | undefined
        for (const [, group] of this._groups) {
            result = group.getItemEnclosingPosition(position)
            if (result && (!preferredGroup || preferredGroup === group)) break
        }
        return result
    }

    getItemById(id: string): TreeElement | undefined { return TreeElement.getElementById(id, this) }

    /** 会就地排序 marker;每个组各拿一份拷贝去认领 */
    updateMarker(marker: IOutlineMarker[]): void {
        marker.sort(compareRangesUsingStarts)
        for (const [, group] of this._groups) group.updateMarker(marker.slice(0))
    }

    getTopLevelSymbols(): DocumentSymbol[] {
        const roots: DocumentSymbol[] = []
        for (const child of this.children.values()) {
            if (child instanceof OutlineElement) roots.push(child.symbol)
            else for (const c of child.children.values()) roots.push(c.symbol)
        }
        return roots.sort((a, b) => compareRangesUsingStarts(a.range, b.range))
    }

    /** 摊平成按位置排序的符号列表(外层先于内层),containerName 取父符号名 */
    asListOfDocumentSymbols(): DocumentSymbol[] {
        const bucket: DocumentSymbol[] = []
        OutlineModel.flatten(bucket, this.getTopLevelSymbols(), '')
        return bucket.sort((a, b) =>
            cmpPos(a.range.startLineNumber, a.range.startColumn, b.range.startLineNumber, b.range.startColumn) ||
            cmpPos(b.range.endLineNumber, b.range.endColumn, a.range.endLineNumber, a.range.endColumn))
    }
    private static flatten(bucket: DocumentSymbol[], entries: DocumentSymbol[], containerLabel: string): void {
        for (const e of entries) {
            bucket.push({
                kind: e.kind, tags: e.tags, name: e.name, detail: e.detail, containerName: e.containerName || containerLabel,
                range: e.range, selectionRange: e.selectionRange, children: undefined,
            })
            if (e.children) OutlineModel.flatten(bucket, e.children, e.name)
        }
    }
}

/** OutlineModel 要的 model 形态 */
export interface OutlineTextModel extends DebounceModel { getVersionId(): number }

interface CacheEntry {
    versionId: number
    provider: DocumentSymbolProvider[]
    promiseCnt: number
    source: CancellationTokenSource
    promise: Promise<OutlineModel>
    model: OutlineModel | undefined
}

/** OutlineModelService 要的服务:documentSymbol 注册表 + 防抖服务 + model 销毁事件 */
export interface OutlineModelServiceDeps {
    readonly documentSymbolProvider: LanguageFeatureRegistry<DocumentSymbolProvider>
}
export class OutlineModelService {
    private readonly disposables: IDisposable[] = []
    private readonly debounceInformation: IFeatureDebounceInformation
    private readonly cache = new Map<string, CacheEntry>() // 最多 15 项,最久未用的先丢

    constructor(
        private readonly features: OutlineModelServiceDeps,
        debounces: Pick<LanguageFeatureDebounceService, 'for'>,
        models: { onModelRemoved(listener: (m: { id: string }) => unknown): IDisposable },
    ) {
        this.debounceInformation = debounces.for(features.documentSymbolProvider as LanguageFeatureRegistry<object>, 'DocumentSymbols', { min: 350 })
        // outline 缓存不比 text model 活得久
        this.disposables.push(models.onModelRemoved(m => { this.cache.delete(m.id) }))
    }

    dispose(): void { for (const d of this.disposables.splice(0)) d.dispose() }

    private remember(id: string, e: CacheEntry): void {
        this.cache.delete(id)
        this.cache.set(id, e)
        if (this.cache.size > 15) this.cache.delete(this.cache.keys().next().value!)
    }

    async getOrCreate(textModel: OutlineTextModel, token: CancellationToken): Promise<OutlineModel> {
        const registry = this.features.documentSymbolProvider
        const provider = registry.ordered(textModel)

        let data = this.cache.get(textModel.id)
        if (!data || data.versionId !== textModel.getVersionId() || !sameList(data.provider, provider)) {
            const source = new CancellationTokenSource()
            const entry: CacheEntry = {
                versionId: textModel.getVersionId(), provider, promiseCnt: 0, source,
                promise: OutlineModel.create(registry, textModel, source.token), model: undefined,
            }
            data = entry
            this.remember(textModel.id, entry)
            const now = Date.now()
            entry.promise.then(m => {
                entry.model = m
                this.debounceInformation.update(textModel, Date.now() - now)
            }).catch(() => { this.cache.delete(textModel.id) })
        }
        if (data.model) return data.model // 已取回:直接给

        // 各调用方共用同一个 promise;全部取消才取消 provider 请求并丢缓存
        const entry = data
        entry.promiseCnt += 1
        const listener = token.onCancellationRequested(() => {
            if (--entry.promiseCnt === 0) {
                entry.source.cancel()
                this.cache.delete(textModel.id)
            }
        })
        try { return await entry.promise } finally { listener.dispose() }
    }

    getDebounceValue(textModel: OutlineTextModel): number { return this.debounceInformation.get(textModel) }

    getCachedModels(): OutlineModel[] {
        const out: OutlineModel[] = []
        for (const e of this.cache.values()) if (e.model) out.push(e.model)
        return out
    }
}
