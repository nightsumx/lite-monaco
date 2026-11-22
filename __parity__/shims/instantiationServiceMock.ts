// platform/instantiation/test/common/instantiationServiceMock:按标识存服务的容器 + createInstance(静态参数在前,装饰过的服务按位置补)。
import { makeInstantiationService } from './instantiation'

export class TestInstantiationService {
    private readonly _services = new Map<unknown, unknown>()
    private readonly _di = makeInstantiationService(id => this._services.get(id))
    constructor(serviceCollection?: { entries?(): Iterable<[unknown, unknown]> }) {
        if (serviceCollection?.entries) for (const [k, v] of serviceCollection.entries()) this._services.set(k, v)
    }
    set<T>(id: unknown, service: T): T { this._services.set(id, service); return service }
    stub(id: unknown, service: unknown): void { this._services.set(id, service) }
    get<T = any>(id: unknown): T { return this._services.get(id) as T }
    createInstance = <T>(ctor: new (...a: any[]) => T, ...args: any[]): T => this._di.createInstance(ctor, ...args)
    invokeFunction<T>(fn: (a: { get(id: unknown): unknown }, ...r: unknown[]) => T, ...rest: unknown[]): T {
        return fn({ get: id => this._services.get(id) }, ...rest)
    }
    dispose() { }
}
