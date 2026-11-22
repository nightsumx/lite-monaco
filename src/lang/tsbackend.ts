// 主线程到 TS 语言服务的通道。
//
// 宿主把 Worker 交给 setTsWorker(推荐:语言服务的 CPU 和堆都不占主线程);不交就走同线程回环 ——
// 同一份服务代码跑在主线程里,请求仍然异步,行为一样,只是没有隔离(测试、不想配 Worker 的小页面用)。
// 库不自己 new Worker:各家打包器认的写法不同(`new Worker(new URL(...))` 之类),交给宿主。

import { createTsEndpoint } from './tsproject'
import type { TsResponse, TsTransport } from './tsprotocol'

export type TsWorkerSource = Worker | TsTransport | (() => Worker | TsTransport)

let source: TsWorkerSource | null = null
let current: TsTransport | null = null
const resetListeners = new Set<() => void>()

function isWorker(x: unknown): x is Worker {
    const w = x as Worker
    return !!w && typeof w.postMessage === 'function' && typeof w.addEventListener === 'function'
}

function fromWorker(w: Worker): TsTransport {
    return {
        post: req => w.postMessage(req),
        onMessage: fn => w.addEventListener('message', (e: MessageEvent) => fn(e.data as TsResponse)),
        terminate: () => w.terminate(),
    }
}

// 开发 / 测试里模拟 postMessage 的结构化克隆,服务那边漏了不可克隆的东西当场就炸,不用等到真 Worker 里才发现
const cloneMessages = typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production'
    && typeof structuredClone === 'function'

function loopback(): TsTransport {
    let listener: ((res: TsResponse) => void) | null = null
    const endpoint = createTsEndpoint((res) => {
        const out = cloneMessages ? structuredClone(res) : res
        queueMicrotask(() => listener?.(out))
    })
    return {
        post: req => endpoint.receive(cloneMessages ? structuredClone(req) : req),
        onMessage: fn => { listener = fn },
        terminate: () => endpoint.dispose(),
    }
}

/**
 * 指定语言服务跑在哪:一个 Worker(入口见 `lite-monaco/ts-worker`)、一个自定义通道,或返回它们的函数(第一次用到才创建)。
 * 传 null 回到同线程回环。已经在用的通道会被关掉,项目状态自动重新同步过去。
 */
export function setTsWorker(next: TsWorkerSource | null): void {
    source = next
    resetTsTransport()
}

/** 当前通道;没有就按 setTsWorker 给的来源创建 */
export function tsTransport(): TsTransport {
    if (current) return current
    const made = typeof source === 'function' ? source() : source
    current = made ? (isWorker(made) ? fromWorker(made) : made) : loopback()
    return current
}

/** 关掉当前通道(下次用到重建);tsservice.ts 据此把整个项目重新发一遍 */
export function resetTsTransport(): void {
    const old = current
    current = null
    old?.terminate?.()
    for (const fn of resetListeners) fn()
}

export function onTsTransportReset(fn: () => void): () => void {
    resetListeners.add(fn)
    return () => { resetListeners.delete(fn) }
}

