// 排序 + 过滤后的补全视图模型(移植自 VS Code editor/contrib/suggest/browser/completionModel.ts)。
//
// 一组 CompletionItem + 当前行上下文(leadingLineContent / characterCountDelta)→ 过滤、打分、排序后的 items。
// 每个 item 自带自己的替换区间,所以「当前词」逐项推算(overwriteBefore + 行上下文的字符增量),相同长度共用一份缓存。
// 行上下文只多不少(用户继续打字)时只在上一轮的结果里再筛;变短 / 内容变了就全量重筛。
import { FUZZY_DEFAULT, anyScore, fuzzyScore, fuzzyScoreGracefulAggressive, FUZZY_OPTIONS_DEFAULT, type FuzzyScore, type FuzzyScoreOptions } from '../core/feature/fuzzy'
import { CompletionItemKind } from './providers'
import type { CompletionItem, SuggestProvider } from './suggest'

type StrictCompletionItem = Required<CompletionItem>
type FuzzyScorer = (pattern: string, lowPattern: string, patternPos: number, word: string, lowWord: string, wordPos: number, options?: FuzzyScoreOptions) => FuzzyScore | undefined

/** WordDistance 的最小形态(完整实现在 worddistance.ts) */
export interface WordDistanceLike { distance(anchor: { lineNumber: number, column: number }, suggestion: { kind: number, label: string | { label: string } }): number }

/** suggest 选项里 CompletionModel 用到的那一项 */
export interface CompletionModelOptions { readonly filterGraceful: boolean }

export interface ICompletionStats { pLabelLen: number }

export class LineContext {
    constructor(readonly leadingLineContent: string, readonly characterCountDelta: number) { }
}

const enum Refilter { Nothing = 0, All = 1, Incr = 2 }

/** Monaco base/common/arrays quickSelect:第 k 小(k 可为小数,向下取整并夹到范围内) */
function quickSelect<T>(nth: number, data: T[], compare: (a: T, b: T) => number): T {
    nth = nth | 0
    if (nth >= data.length) throw new TypeError('invalid index')
    const pivotValue = data[Math.floor(data.length * Math.random())]
    const lower: T[] = [], higher: T[] = [], pivots: T[] = []
    for (const value of data) {
        const val = compare(value, pivotValue)
        if (val < 0) lower.push(value)
        else if (val > 0) higher.push(value)
        else pivots.push(value)
    }
    if (nth < lower.length) return quickSelect(nth, lower, compare)
    if (nth < lower.length + pivots.length) return pivots[0]
    return quickSelect(nth - (lower.length + pivots.length), higher, compare)
}

const compareIgnoreCase = (a: string, b: string): number => {
    const la = a.toLowerCase(), lb = b.toLowerCase()
    return la < lb ? -1 : la > lb ? 1 : 0
}

export class CompletionModel {
    private readonly _items: CompletionItem[]
    private readonly _column: number
    private readonly _wordDistance: WordDistanceLike
    private readonly _options: CompletionModelOptions
    private _snippetCompareFn = CompletionModel._compareCompletionItems
    private readonly _fuzzyScoreOptions: FuzzyScoreOptions

    private _lineContext: LineContext
    private _refilterKind: Refilter
    private _filteredItems?: StrictCompletionItem[]

    private _itemsByProvider?: Map<SuggestProvider, CompletionItem[]>
    private _stats?: ICompletionStats

    constructor(
        items: CompletionItem[],
        column: number,
        lineContext: LineContext,
        wordDistance: WordDistanceLike,
        options: CompletionModelOptions,
        snippetSuggestions: 'top' | 'bottom' | 'inline' | 'none',
        fuzzyScoreOptions: FuzzyScoreOptions | undefined = FUZZY_OPTIONS_DEFAULT,
        readonly clipboardText: string | undefined = undefined,
    ) {
        this._items = items
        this._column = column
        this._wordDistance = wordDistance
        this._options = options
        this._refilterKind = Refilter.All
        this._lineContext = lineContext
        this._fuzzyScoreOptions = fuzzyScoreOptions

        if (snippetSuggestions === 'top') this._snippetCompareFn = CompletionModel._compareCompletionItemsSnippetsUp
        else if (snippetSuggestions === 'bottom') this._snippetCompareFn = CompletionModel._compareCompletionItemsSnippetsDown
    }

    get lineContext(): LineContext { return this._lineContext }

    set lineContext(value: LineContext) {
        if (this._lineContext.leadingLineContent !== value.leadingLineContent || this._lineContext.characterCountDelta !== value.characterCountDelta) {
            this._refilterKind = this._lineContext.characterCountDelta < value.characterCountDelta && this._filteredItems ? Refilter.Incr : Refilter.All
            this._lineContext = value
        }
    }

    get items(): CompletionItem[] {
        this._ensureCachedState()
        return this._filteredItems!
    }

    getItemsByProvider(): ReadonlyMap<SuggestProvider, CompletionItem[]> {
        this._ensureCachedState()
        return this._itemsByProvider!
    }

    getIncompleteProvider(): Set<SuggestProvider> {
        this._ensureCachedState()
        const result = new Set<SuggestProvider>()
        for (const [provider, items] of this.getItemsByProvider()) {
            if (items.length > 0 && items[0].container.incomplete) result.add(provider)
        }
        return result
    }

    get stats(): ICompletionStats {
        this._ensureCachedState()
        return this._stats!
    }

    private _ensureCachedState(): void {
        if (this._refilterKind !== Refilter.Nothing) this._createCachedState()
    }

    private _createCachedState(): void {
        this._itemsByProvider = new Map()
        const labelLengths: number[] = []
        const { leadingLineContent, characterCountDelta } = this._lineContext
        let word = ''
        let wordLow = ''

        // 增量:只在上一轮的结果里再筛
        const source = this._refilterKind === Refilter.All ? this._items : this._filteredItems!
        const target: StrictCompletionItem[] = []

        // 候选多于 2000 或关了 filterGraceful:用不带换位容错的打分
        const scoreFn: FuzzyScorer = (!this._options.filterGraceful || source.length > 2000) ? fuzzyScore : fuzzyScoreGracefulAggressive

        for (let i = 0; i < source.length; i++) {
            const item = source[i]
            if (item.isInvalid) continue // 无效项直接跳过

            // 按 provider 归档
            const arr = this._itemsByProvider.get(item.provider)
            if (arr) arr.push(item)
            else this._itemsByProvider.set(item.provider, [item])

            // 「当前词」:当前行里要过滤、打分的那一段。理论上每项不同,实践中几乎都一样 → 缓存
            const overwriteBefore = item.position.column - item.editStart.column
            const wordLen = overwriteBefore + characterCountDelta - (item.position.column - this._column)
            if (word.length !== wordLen) {
                word = wordLen === 0 ? '' : leadingLineContent.slice(-wordLen)
                wordLow = word.toLowerCase()
            }
            item.word = word

            if (wordLen === 0) {
                // 没有可打分的词:给常量分(-100,超出 fuzzyScore 的取值范围),靠初始顺序稳定排序
                item.score = FUZZY_DEFAULT
            } else {
                // 词里开头的空白(落在 overwriteBefore 内)不参与打分
                let wordPos = 0
                while (wordPos < overwriteBefore) {
                    const ch = word.charCodeAt(wordPos)
                    if (ch === 32 || ch === 9) wordPos += 1
                    else break
                }

                if (wordPos >= wordLen) {
                    // 打分起点已是整个词:等同于没有词
                    item.score = FUZZY_DEFAULT
                } else if (typeof item.completion.filterText === 'string') {
                    // 有 filterText:它必须匹配 word;匹配了再拿 label 算高亮,label 没结果就没有高亮
                    const match = scoreFn(word, wordLow, wordPos, item.completion.filterText, item.filterTextLow!, 0, this._fuzzyScoreOptions)
                    if (!match) continue // 不匹配
                    if (compareIgnoreCase(item.completion.filterText, item.textLabel) === 0) {
                        // filterText 与 label 相同:高亮就是这次匹配
                        item.score = match
                    } else {
                        // 在 label 上重新找高亮,但排名用 filterText 的分
                        item.score = anyScore(word, wordLow, wordPos, item.textLabel, item.labelLow, 0)
                        item.score[0] = match[0]
                    }
                } else {
                    // 默认拿 word 匹配 label
                    const match = scoreFn(word, wordLow, wordPos, item.textLabel, item.labelLow, 0, this._fuzzyScoreOptions)
                    if (!match) continue // 不匹配
                    item.score = match
                }
            }

            item.idx = i
            item.distance = this._wordDistance.distance(item.position, item.completion)
            target.push(item as StrictCompletionItem)
            labelLengths.push(item.textLabel.length)
        }

        this._filteredItems = target.sort(this._snippetCompareFn)
        this._refilterKind = Refilter.Nothing
        this._stats = {
            pLabelLen: labelLengths.length ? quickSelect(labelLengths.length - .85, labelLengths, (a, b) => a - b) : 0,
        }
    }

    private static _compareCompletionItems(a: StrictCompletionItem, b: StrictCompletionItem): number {
        if (a.score[0] > b.score[0]) return -1
        if (a.score[0] < b.score[0]) return 1
        if (a.distance < b.distance) return -1
        if (a.distance > b.distance) return 1
        if (a.idx < b.idx) return -1
        if (a.idx > b.idx) return 1
        return 0
    }

    private static _compareCompletionItemsSnippetsDown(a: StrictCompletionItem, b: StrictCompletionItem): number {
        if (a.completion.kind !== b.completion.kind) {
            if (a.completion.kind === CompletionItemKind.Snippet) return 1
            if (b.completion.kind === CompletionItemKind.Snippet) return -1
        }
        return CompletionModel._compareCompletionItems(a, b)
    }

    private static _compareCompletionItemsSnippetsUp(a: StrictCompletionItem, b: StrictCompletionItem): number {
        if (a.completion.kind !== b.completion.kind) {
            if (a.completion.kind === CompletionItemKind.Snippet) return -1
            if (b.completion.kind === CompletionItemKind.Snippet) return 1
        }
        return CompletionModel._compareCompletionItems(a, b)
    }
}
