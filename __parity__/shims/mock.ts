// Monaco base/test/common/mock:mock<T>() 只是个空构造器基类(原版另 import sinon,这里不需要)。
export function mock<T>(): new () => T {
    return function () { } as any
}
export const upcastPartial = <T>(p: Partial<T>): T => p as T
export const upcastDeepPartial = <T>(p: unknown): T => p as T
