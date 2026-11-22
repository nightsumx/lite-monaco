// Monaco IStorageService / InMemoryStorageService:服务标识 + 内存实现(测试替身)。
// 查找开关的持久化(editor.isRegex 等)由 findController 垫片经它读写;lite-monaco 自己的跨实例记忆是 core 的 rememberedFlags。
import { createDecorator } from './instantiation'
export const IStorageService: any = createDecorator()
export type IStorageService = any
export enum StorageScope { APPLICATION = -1, PROFILE = 0, WORKSPACE = 1 }
export enum StorageTarget { USER = 0, MACHINE = 1 }
export class InMemoryStorageService {
    private readonly _m = new Map<string, string>()
    get(key: string, _scope?: unknown, fallback?: string) { return this._m.get(key) ?? fallback }
    getBoolean(key: string, _scope?: unknown, fallback?: boolean) { const v = this._m.get(key); return v === undefined ? fallback : v === 'true' }
    store(key: string, value: unknown, _scope?: unknown, _target?: unknown) { this._m.set(key, String(value)) }
    dispose() {}
}
