// Monaco platform/contextkey:服务标识 + RawContextKey。真正的 context key 服务是 lite-monaco 的 getContextKeyService(view)(src/api/contextkeys.ts),
// 这里只把 RawContextKey.bindTo / getValue 翻译成它的 createKey / getContextKeyValue。
import { createDecorator } from './instantiation'
export const IContextKeyService: any = createDecorator()
export type IContextKeyService = any
export interface IContextKey<T> { set(value: T): void, reset(): void, get(): T | undefined }
export class RawContextKey<T> {
    constructor(readonly key: string, readonly defaultValue: T) {}
    bindTo(service: any): IContextKey<T> { return service.createKey(this.key, this.defaultValue) }
    getValue(service: any): T | undefined { return service.getContextKeyValue(this.key) }
}
