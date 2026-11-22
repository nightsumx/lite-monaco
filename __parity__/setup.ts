// Monaco 测试用 mocha 的 TDD 接口(suite / test / setup / teardown),vitest 里映射过去。
import { describe, it, beforeEach, afterEach, beforeAll, afterAll } from 'vitest'
const g = globalThis as Record<string, unknown>
g.suite = describe
// mocha 容许在 test 体里再调 test(edit.test 的 inverse 就这么写,mocha 里内层用例其实是空转);vitest 直接抛错。
// 这里让嵌套的 test 就地同步执行,失败算外层 test 的失败,比 mocha 更严。只包无参(非 done 回调)的 test,其余原样透传。
let running = 0
const enter = (fn: (this: unknown) => unknown) => function (this: unknown) {
    running++
    let r: unknown
    try { r = fn.call(this) } catch (e) { running--; throw e }
    if (r && typeof (r as Promise<unknown>).then === 'function') return (r as Promise<unknown>).finally(() => { running-- })
    running--
    return r
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const wrapTest = (real: (...a: any[]) => unknown) => (name: unknown, fn?: unknown, ...rest: unknown[]) => {
    if (running > 0) return typeof fn === 'function' && fn.length === 0 ? fn() : undefined
    return real(name, typeof fn === 'function' && fn.length === 0 ? enter(fn as () => unknown) : fn, ...rest)
}
const testFn = Object.assign(wrapTest(it as never), it)
testFn.only = wrapTest(it.only as never) as never
testFn.skip = ((...a: unknown[]) => (running > 0 ? undefined : (it.skip as (...x: unknown[]) => unknown)(...a))) as never
g.test = testFn
g.setup = beforeEach
g.teardown = afterEach
g.suiteSetup = beforeAll
g.suiteTeardown = afterAll

// 原版 platform.setTimeout0 在有 postMessage 的环境里走 postMessage + message 事件;jsdom 的 postMessage 要求 this===window,
// 被当成 globalThis 的方法调用时消息被静默丢掉,runWithFakedTimers 的调度器就永远不转。去掉它,原版自己回落到 setTimeout(0)。
delete (globalThis as Record<string, unknown>).postMessage
