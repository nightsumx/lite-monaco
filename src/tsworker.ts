// TS 语言服务的 Worker 入口(`lite-monaco/ts-worker`)。宿主自己写一个很薄的 worker 文件:
//
//     import { setTsLibLoader, startTsWorker } from 'lite-monaco/ts-worker'
//     setTsLibLoader(async () => new Map([['lib.d.ts', '…']]))   // 可选:不走 jsDelivr 时自己给标准库
//     startTsWorker()
//
// 主线程那边:`setTsWorker(new Worker(new URL('./ts.worker.ts', import.meta.url), { type: 'module' }))`。
// typescript 是 peer 依赖,由宿主的打包器在 Worker 的包里解析。

import { createTsEndpoint } from './lang/tsproject'
import type { TsRequest, TsResponse } from './lang/tsprotocol'

export { setTsLibLoader } from './lang/tslibs'

interface WorkerScope {
    postMessage(msg: unknown): void
    addEventListener(type: 'message', fn: (e: { data: TsRequest }) => void): void
}

/** 在 Worker 全局里开始接收请求 */
export function startTsWorker(scope: WorkerScope = globalThis as unknown as WorkerScope): void {
    const endpoint = createTsEndpoint((res: TsResponse) => scope.postMessage(res))
    scope.addEventListener('message', e => endpoint.receive(e.data))
}
