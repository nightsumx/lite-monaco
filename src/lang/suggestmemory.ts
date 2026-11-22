// 补全选中记忆(移植自 VS Code editor/contrib/suggest/browser/suggestMemory.ts)。
//
// editor.suggestSelection 三种策略,决定补全列表打开时默认选中哪一项:
//   first                 NoMemory      选第一个(preselect 在同分里优先)
//   recentlyUsed          LRUMemory     最近用过的(语言 + label 为键,LRU 300 条)
//   recentlyUsedByPrefix  PrefixMemory  按已键入的前缀记(最长前缀匹配)
// 持久化走注入的 storage(宿主给 localStorage 之类;没有就只活在内存里)。
import { CompletionItemKind } from './providers'
import type { CompletionItem } from './suggest'

export interface MemoryModel {
    getLanguageId(): string
    getLineContent(lineNumber: number): string
    getWordUntilPosition(position: { lineNumber: number, column: number }): { word: string, startColumn: number, endColumn: number }
    getLanguageIdAtPosition?(lineNumber: number, column: number): string
    readonly uri?: unknown
}
type Pos = { lineNumber: number, column: number }

/** Monaco CompletionItemKinds.fromString:kind 名(不分大小写)→ 枚举值,未知回 Property */
function kindFromString(value: string): number {
    const k = (CompletionItemKind as unknown as Record<string, number | string>)
    for (const name of Object.keys(k)) {
        if (typeof k[name] === 'number' && name.toLowerCase() === value.toLowerCase()) return k[name] as number
    }
    return CompletionItemKind.Property
}

/** Monaco LRUCache(limit, ratio):超过 limit 时按最久未用裁到 limit*ratio;get 刷新,peek 不刷新 */
class LRUCache<K, V> {
    private readonly map = new Map<K, V>()
    constructor(private limit: number, private ratio = 1) { }
    get size(): number { return this.map.size }
    set(key: K, value: V): void {
        this.map.delete(key)
        this.map.set(key, value)
        if (this.map.size > this.limit) {
            const target = Math.round(this.limit * this.ratio)
            for (const k of this.map.keys()) { if (this.map.size <= target) break; this.map.delete(k) }
        }
    }
    peek(key: K): V | undefined { return this.map.get(key) }
    clear(): void { this.map.clear() }
    toJSON(): [K, V][] { return [...this.map.entries()] }
}

export type MemMode = 'first' | 'recentlyUsed' | 'recentlyUsedByPrefix'

export abstract class Memory {
    constructor(readonly name: MemMode) { }

    select(_model: MemoryModel, _pos: Pos, items: CompletionItem[]): number {
        if (items.length === 0) return 0
        const topScore = items[0].score[0]
        for (let i = 0; i < items.length; i++) {
            const { score, completion: suggestion } = items[i]
            if (score[0] !== topScore) break // 离开最高分那一组
            if (suggestion.preselect) return i // 同分里有 preselect 就选它
        }
        return 0
    }

    abstract memorize(model: MemoryModel, pos: Pos, item: CompletionItem): void
    abstract toJSON(): object | undefined
    abstract fromJSON(data: object): void
}

export class NoMemory extends Memory {
    constructor() { super('first') }
    memorize(): void { /* no-op */ }
    toJSON() { return undefined }
    fromJSON(): void { /* no-op */ }
}

export interface MemItem { type: string | number, insertText: string, touch: number }

export class LRUMemory extends Memory {
    constructor() { super('recentlyUsed') }

    private _cache = new LRUCache<string, MemItem>(300, 0.66)
    private _seq = 0

    memorize(model: MemoryModel, _pos: Pos, item: CompletionItem): void {
        const key = `${model.getLanguageId()}/${item.textLabel}`
        this._cache.set(key, { touch: this._seq++, type: item.completion.kind, insertText: item.completion.insertText })
    }

    override select(model: MemoryModel, pos: Pos, items: CompletionItem[]): number {
        if (items.length === 0) return 0
        // 光标前是空白:不用最近项(#78571)
        const lineSuffix = model.getLineContent(pos.lineNumber).substr(pos.column - 10, pos.column - 1)
        if (/\s$/.test(lineSuffix)) return super.select(model, pos, items)

        const topScore = items[0].score[0]
        let indexPreselect = -1
        let indexRecency = -1
        let seq = -1
        for (let i = 0; i < items.length; i++) {
            if (items[i].score[0] !== topScore) break // 只看最高分那一组
            const key = `${model.getLanguageId()}/${items[i].textLabel}`
            const item = this._cache.peek(key)
            if (item && item.touch > seq && item.type === items[i].completion.kind && item.insertText === items[i].completion.insertText) {
                seq = item.touch
                indexRecency = i
            }
            if (items[i].completion.preselect && indexPreselect === -1) return indexPreselect = i
        }
        if (indexRecency !== -1) return indexRecency
        if (indexPreselect !== -1) return indexPreselect
        return 0
    }

    toJSON(): object { return this._cache.toJSON() }

    fromJSON(data: [string, MemItem][]): void {
        this._cache.clear()
        for (const [key, value] of data) {
            value.touch = 0
            value.type = typeof value.type === 'number' ? value.type : kindFromString(value.type)
            this._cache.set(key, value)
        }
        this._seq = this._cache.size
    }
}

export class PrefixMemory extends Memory {
    constructor() { super('recentlyUsedByPrefix') }

    // 键 → 记忆项;「最长前缀」查询(Monaco 的 TernarySearchTree.findSubstr)直接按前缀从长到短试
    private _map = new Map<string, MemItem>()
    private _seq = 0

    memorize(model: MemoryModel, pos: Pos, item: CompletionItem): void {
        const { word } = model.getWordUntilPosition(pos)
        const key = `${model.getLanguageId()}/${word}`
        this._map.set(key, { type: item.completion.kind, insertText: item.completion.insertText, touch: this._seq++ })
    }

    private findLongestPrefix(key: string): MemItem | undefined {
        for (let n = key.length; n > 0; n--) {
            const hit = this._map.get(key.slice(0, n))
            if (hit) return hit
        }
        return undefined
    }

    override select(model: MemoryModel, pos: Pos, items: CompletionItem[]): number {
        const { word } = model.getWordUntilPosition(pos)
        if (!word) return super.select(model, pos, items)
        const key = `${model.getLanguageId()}/${word}`
        const item = this._map.get(key) ?? this.findLongestPrefix(key)
        if (item) {
            for (let i = 0; i < items.length; i++) {
                const { kind, insertText } = items[i].completion
                if (kind === item.type && insertText === item.insertText) return i
            }
        }
        return super.select(model, pos, items)
    }

    toJSON(): object {
        const entries: [string, MemItem][] = [...this._map.entries()]
        // 按最近使用排序,取前 200,并把 touch 规整成名次
        entries.sort((a, b) => -(a[1].touch - b[1].touch)).forEach((value, i) => { value[1].touch = i })
        return entries.slice(0, 200)
    }

    fromJSON(data: [string, MemItem][]): void {
        this._map.clear()
        if (data.length > 0) {
            this._seq = data[0][1].touch + 1
            for (const [key, value] of data) {
                value.type = typeof value.type === 'number' ? value.type : kindFromString(value.type)
                this._map.set(key, value)
            }
        }
    }
}

/** 持久化后端(宿主提供;键值都是字符串) */
export interface SuggestMemoryStorage {
    get(key: string): string | undefined
    store(key: string, value: string): void
}

export interface SuggestMemoryServiceOptions {
    storage?: SuggestMemoryStorage
    /** editor.suggestSelection 的当前值 */
    getMode(model: MemoryModel, pos: Pos): MemMode
}

export interface ISuggestMemoryService {
    memorize(model: MemoryModel, pos: Pos, item: CompletionItem): void
    select(model: MemoryModel, pos: Pos, items: CompletionItem[]): number
}

export class SuggestMemoryService implements ISuggestMemoryService {
    private static readonly strategyCtors = new Map<MemMode, { new(): Memory }>([
        ['recentlyUsedByPrefix', PrefixMemory],
        ['recentlyUsed', LRUMemory],
        ['first', NoMemory],
    ])
    private static readonly storagePrefix = 'suggest/memories'

    private persistTimer: ReturnType<typeof setTimeout> | undefined
    private strategy?: Memory

    constructor(private readonly opts: SuggestMemoryServiceOptions) { }

    dispose(): void {
        if (this.persistTimer !== undefined) { clearTimeout(this.persistTimer); this.persistTimer = undefined }
    }

    memorize(model: MemoryModel, pos: Pos, item: CompletionItem): void {
        this.withStrategy(model, pos).memorize(model, pos, item)
        if (this.persistTimer !== undefined) clearTimeout(this.persistTimer)
        this.persistTimer = setTimeout(() => { this.persistTimer = undefined; this.saveState() }, 500)
    }

    select(model: MemoryModel, pos: Pos, items: CompletionItem[]): number {
        return this.withStrategy(model, pos).select(model, pos, items)
    }

    private withStrategy(model: MemoryModel, pos: Pos): Memory {
        const mode = this.opts.getMode(model, pos)
        if (this.strategy?.name !== mode) {
            this.saveState()
            const ctor = SuggestMemoryService.strategyCtors.get(mode) || NoMemory
            this.strategy = new ctor()
            try {
                const raw = this.opts.storage?.get(`${SuggestMemoryService.storagePrefix}/${mode}`)
                if (raw) this.strategy.fromJSON(JSON.parse(raw))
            } catch { /* JSON 坏了就当没有 */ }
        }
        return this.strategy
    }

    private saveState(): void {
        if (this.strategy) this.opts.storage?.store(`${SuggestMemoryService.storagePrefix}/${this.strategy.name}`, JSON.stringify(this.strategy))
    }
}
