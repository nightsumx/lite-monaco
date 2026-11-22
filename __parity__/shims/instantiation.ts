// Monaco platform/instantiation:服务标识(参数装饰器,记下「第几个构造参数要哪个服务」)+ createInstance(静态参数在前,装饰过的服务按位置补上,同 Monaco InstantiationService)。
export function createDecorator(): any {
    const id: any = function (target: any, _key: unknown, index: number) { (Object.prototype.hasOwnProperty.call(target, '$di') ? target.$di : (target.$di = (target.$di ?? []).slice())).push({ id, index }) }
    return id
}
export const IInstantiationService: any = createDecorator()
export type ServicesAccessor = { get<T = any>(id: unknown): T }
export type IInstantiationService = { createInstance<T>(ctor: new (...a: any[]) => T, ...args: any[]): T }

/** 用 accessor 当服务来源的 createInstance */
export function makeInstantiationService(get: (id: unknown) => unknown): IInstantiationService {
    const svc: any = {
        createInstance(ctor: any, ...args: any[]) {
            const deps: { id: unknown, index: number }[] = (ctor.$di ?? []).slice().sort((a: any, b: any) => a.index - b.index)
            const all = args.slice()
            for (const d of deps) all[d.index] = get(d.id)
            return new ctor(...all)
        },
    }
    return svc
}
