// Monaco MockContextKeyService:一张 key→value 表 + createKey / getContextKeyValue(夹具自己的最小 context key 服务)。
export class MockContextKeyService {
    private readonly _keys = new Map<string, unknown>()
    createKey<T>(key: string, defaultValue: T | undefined) {
        this._keys.set(key, defaultValue)
        return {
            set: (v: T) => { this._keys.set(key, v) },
            reset: () => { this._keys.set(key, defaultValue) },
            get: () => this._keys.get(key) as T | undefined,
        }
    }
    getContextKeyValue<T = unknown>(key: string): T | undefined { return this._keys.get(key) as T | undefined }
    dispose() { }
}

// Monaco MockKeybindingService:服务占位(测试只把它放进 serviceCollection;lite-monaco 的键位走自己的表)。
export class MockKeybindingService {
    softDispatch() { return { kind: 0 } }
    dispose() { }
}
