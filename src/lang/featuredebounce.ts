// 语言特性的自适应防抖(Monaco common/services/languageFeatureDebounce):按「model + 当前命中的 provider 组合」记最近 6 次耗时的滑动平均,
// 下次防抖时长 = 这个平均夹在 [min, max]。没有记录时用全局均值 / min*1.5。开发模式(未打包 / 扩展开发)恒返回默认值,免得调试时抖动。
import type { LanguageFeatureRegistry, FeatureModel } from './languagefeatures'

export interface IFeatureDebounceInformation {
    get(model: DebounceModel): number
    update(model: DebounceModel, value: number): number
    default(): number
}
export interface DebounceModel extends FeatureModel { readonly id: string }
export interface DebounceLog { trace(msg: string): void, debug(msg: string): void }
export interface DebounceEnv { readonly isBuilt?: boolean, readonly isExtensionDevelopment?: boolean }

const clamp = (v: number, min: number, max: number): number => Math.min(Math.max(v, min), max)

class SlidingWindowAverage {
    private readonly values: number[] = []
    private sum = 0
    constructor(private readonly size: number) { }
    update(v: number): number {
        this.values.push(v)
        this.sum += v
        if (this.values.length > this.size) this.sum -= this.values.shift()!
        return this.value
    }
    get value(): number { return this.values.length ? this.sum / this.values.length : 0 }
}
class MovingAverage {
    private n = 0
    private v = 0
    update(x: number): number { this.n++; this.v = this.v + (x - this.v) / this.n; return this.v }
    get value(): number { return this.v }
}

// provider 对象的身份 → 自增号(同一个 provider 恒得同一个号);用来区分「命中了哪几个 provider」
const identity = new WeakMap<object, number>()
let pool = 0
const identityOf = (o: object): number => { let v = identity.get(o); if (v === undefined) identity.set(o, v = ++pool); return v }

class NullDebounceInformation implements IFeatureDebounceInformation {
    constructor(private readonly _default: number) { }
    get(): number { return this._default }
    update(): number { return this._default }
    default(): number { return this._default }
}

class FeatureDebounceInformation implements IFeatureDebounceInformation {
    private readonly cache = new Map<string, SlidingWindowAverage>() // 最多 50 个 key,最久未用的先丢
    constructor(
        private readonly log: DebounceLog, private readonly name: string, private readonly registry: LanguageFeatureRegistry<object>,
        private readonly _default: number, private readonly min: number, private readonly max: number,
    ) { }

    private key(model: DebounceModel): string {
        let h = 0
        for (const p of this.registry.all(model)) h = (h * 31 + identityOf(p)) | 0
        return model.id + h
    }
    private touch(key: string): SlidingWindowAverage | undefined {
        const avg = this.cache.get(key)
        if (avg) { this.cache.delete(key); this.cache.set(key, avg) }
        return avg
    }
    get(model: DebounceModel): number {
        const avg = this.touch(this.key(model))
        return avg ? clamp(avg.value, this.min, this.max) : this.default()
    }
    update(model: DebounceModel, value: number): number {
        const key = this.key(model)
        let avg = this.touch(key)
        if (!avg) {
            avg = new SlidingWindowAverage(6)
            this.cache.set(key, avg)
            if (this.cache.size > 50) this.cache.delete(this.cache.keys().next().value!)
        }
        const next = clamp(avg.update(value), this.min, this.max)
        if (model.uri.scheme !== 'output') this.log.trace(`[DEBOUNCE: ${this.name}] for ${model.uri.toString()} is ${next}ms`)
        return next
    }
    default(): number {
        const overall = new MovingAverage()
        for (const avg of this.cache.values()) overall.update(avg.value)
        return clamp((overall.value | 0) || this._default, this.min, this.max)
    }
}

const NO_LOG: DebounceLog = { trace() { }, debug() { } }

export class LanguageFeatureDebounceService {
    private readonly data = new Map<string, IFeatureDebounceInformation>()
    private readonly isDev: boolean
    constructor(private readonly log: DebounceLog = NO_LOG, env: DebounceEnv = {}) {
        this.isDev = !!env.isExtensionDevelopment || !env.isBuilt
    }

    for(feature: LanguageFeatureRegistry<object>, name: string, config?: { min?: number, max?: number, key?: string }): IFeatureDebounceInformation {
        const min = config?.min ?? 50
        const max = config?.max ?? min ** 2
        const key = `${identityOf(feature)},${min}${config?.key ? ',' + config.key : ''}`
        let info = this.data.get(key)
        if (!info) {
            if (this.isDev) {
                this.log.debug(`[DEBOUNCE: ${name}] is disabled in developed mode`)
                info = new NullDebounceInformation(min * 1.5)
            } else {
                info = new FeatureDebounceInformation(this.log, name, feature, (this.overall() | 0) || min * 1.5, min, max)
            }
            this.data.set(key, info)
        }
        return info
    }

    private overall(): number {
        const r = new MovingAverage()
        for (const info of this.data.values()) r.update(info.default())
        return r.value
    }
}
