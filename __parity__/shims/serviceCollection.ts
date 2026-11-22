// Monaco ServiceCollection:只是 (标识 → 实例) 的表;lite-monaco 没有 DI,withTestCodeEditor 忽略 serviceCollection 选项。
export class ServiceCollection {
    private readonly _m = new Map<unknown, unknown>()
    constructor(...entries: [unknown, unknown][]) { for (const [k, v] of entries) this._m.set(k, v) }
    set(id: unknown, instance: unknown) { this._m.set(id, instance); return instance }
    get(id: unknown) { return this._m.get(id) }
    has(id: unknown) { return this._m.has(id) }
    entries() { return this._m.entries() }
}
