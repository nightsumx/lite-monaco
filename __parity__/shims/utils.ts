// Monaco base/test/common/utils:原版会在每个测试后检查 Disposable 泄漏;这里不查泄漏,但返回同形的 store(add / clear / dispose),测试结束清掉。
export function ensureNoDisposablesAreLeakedInTestSuite(): { add<T extends { dispose(): void }>(x: T): T, clear(): void, dispose(): void } {
    const items: { dispose(): void }[] = []
    const store = {
        add<T extends { dispose(): void }>(x: T): T { items.push(x); return x },
        clear() { for (const d of items.splice(0).reverse()) { try { d.dispose() } catch { /* 已销毁 */ } } },
        dispose() { this.clear() },
    }
    const td = (globalThis as { teardown?: (fn: () => void) => void }).teardown
    td?.(() => store.clear())
    return store
}
