// 异步小工具(Monaco base/common/async + cancellation 的最小子集):provider 类特性的共用件。
// 都通过全局 setTimeout 现取现用(不在模块加载时捕获),这样假计时器能接管。
import type { IDisposable, CancellationToken } from './providers'
export type { CancellationToken }

export const CancellationNone: CancellationToken = Object.freeze({
    isCancellationRequested: false,
    onCancellationRequested: () => ({ dispose() { } }),
})

export class CancellationTokenSource implements IDisposable {
    private cancelled = false
    private readonly cbs = new Set<() => void>()
    readonly token: CancellationToken
    constructor(parent?: CancellationToken) {
        const src = this
        this.token = {
            get isCancellationRequested() { return src.cancelled },
            onCancellationRequested: (listener, thisArgs, disposables) => {
                const cb = () => { listener.call(thisArgs, undefined) }
                if (src.cancelled) { queueMicrotask(cb); return { dispose() { } } }
                src.cbs.add(cb)
                const d = { dispose: () => { src.cbs.delete(cb) } }
                disposables?.push(d)
                return d
            },
        }
        parent?.onCancellationRequested(() => this.cancel())
        if (parent?.isCancellationRequested) this.cancelled = true
    }
    cancel(): void {
        if (this.cancelled) return
        this.cancelled = true
        for (const cb of [...this.cbs]) { try { cb() } catch (e) { console.error(e) } }
        this.cbs.clear()
    }
    dispose(cancel = false): void { if (cancel) this.cancel(); this.cbs.clear() }
}

export class CancellationError extends Error { constructor() { super('Canceled'); this.name = 'Canceled' } }
export const isCancellationError = (e: unknown): boolean => e instanceof Error && e.name === 'Canceled' && e.message === 'Canceled'

/**
 * Monaco Delayer:trigger(task, delay) 重新计时,到点只跑最后一次的 task;
 * 所有这一轮的 trigger 共用同一个 promise(task 的结果)。cancel/dispose 以 CancellationError 拒掉未跑的那一轮。
 */
export class Delayer<T> implements IDisposable {
    private timeout: ReturnType<typeof setTimeout> | undefined
    private completionPromise: Promise<T> | null = null
    private doResolve: ((value?: unknown) => void) | null = null
    private doReject: ((err: unknown) => void) | null = null
    private task: (() => T | Promise<T>) | null = null

    constructor(public defaultDelay: number) { }

    trigger(task: () => T | Promise<T>, delay: number = this.defaultDelay): Promise<T> {
        this.task = task
        this.cancelTimeout()
        if (!this.completionPromise) {
            this.completionPromise = new Promise((resolve, reject) => { this.doResolve = resolve; this.doReject = reject }).then(() => {
                this.completionPromise = null
                this.doResolve = null
                if (this.task) { const t = this.task; this.task = null; return t() }
                return undefined as T
            })
        }
        this.timeout = setTimeout(() => { this.timeout = undefined; this.doResolve?.() }, delay)
        return this.completionPromise
    }
    isTriggered(): boolean { return this.timeout !== undefined }
    cancel(): void {
        this.cancelTimeout()
        if (this.completionPromise) {
            this.doReject?.(new CancellationError())
            this.completionPromise.catch(() => { /* 取消不是错误 */ })
            this.completionPromise = null
        }
    }
    private cancelTimeout(): void { if (this.timeout !== undefined) { clearTimeout(this.timeout); this.timeout = undefined } }
    dispose(): void { this.cancel() }
}

/** 依次跑 promise 工厂,第一个 shouldStop(result) 为真的结果就是答案;都不满足给 defaultValue */
export async function first<T>(factories: ReadonlyArray<() => Promise<T>>, shouldStop: (t: T) => boolean = t => !!t, defaultValue: T | null = null): Promise<T | null> {
    for (const f of factories) {
        const r = await f()
        if (shouldStop(r)) return r
    }
    return defaultValue
}

/** Monaco CancelablePromise:createCancelablePromise(token => ...),cancel() 取消 token 并以 CancellationError 拒掉 */
export interface CancelablePromise<T> extends Promise<T> { cancel(): void }
export function createCancelablePromise<T>(callback: (token: CancellationToken) => Promise<T>): CancelablePromise<T> {
    const source = new CancellationTokenSource()
    const thenable = callback(source.token)
    let isCancelled = false
    const promise = new Promise<T>((resolve, reject) => {
        const subscription = source.token.onCancellationRequested(() => {
            isCancelled = true
            subscription.dispose()
            reject(new CancellationError())
        })
        Promise.resolve(thenable).then(value => {
            subscription.dispose()
            source.dispose()
            if (!isCancelled) resolve(value)
        }, err => {
            subscription.dispose()
            source.dispose()
            reject(err)
        })
    }) as CancelablePromise<T>
    promise.cancel = () => { source.cancel(); source.dispose() }
    return promise
}

/** Monaco TimeoutTimer:cancelAndSet 重新计时(旧的作废),到点跑一次;全局 setTimeout 现取现用 */
export class TimeoutTimer implements IDisposable {
    private handle: ReturnType<typeof setTimeout> | undefined
    cancel(): void { if (this.handle !== undefined) { clearTimeout(this.handle); this.handle = undefined } }
    cancelAndSet(runner: () => void, timeout: number): void {
        this.cancel()
        this.handle = setTimeout(() => { this.handle = undefined; runner() }, timeout)
    }
    dispose(): void { this.cancel() }
}

/** Monaco RunOnceScheduler:schedule(delay) 重新计时(旧的作废),到点跑一次 runner;全局 setTimeout 现取现用(假计时器能接管) */
export class RunOnceScheduler implements IDisposable {
    private handle: ReturnType<typeof setTimeout> | undefined
    constructor(private runner: () => void, public delay: number) { }
    cancel(): void { if (this.handle !== undefined) { clearTimeout(this.handle); this.handle = undefined } }
    schedule(delay: number = this.delay): void {
        this.cancel()
        this.handle = setTimeout(() => { this.handle = undefined; this.runner() }, delay)
    }
    isScheduled(): boolean { return this.handle !== undefined }
    dispose(): void { this.cancel() }
}
