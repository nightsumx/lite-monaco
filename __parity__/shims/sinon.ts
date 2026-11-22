// sinon 的 useFakeTimers / stub 最小子集 → vitest 假计时器(测试里只用 tick / restore)。
import { vi } from 'vitest'
export function useFakeTimers() {
    vi.useFakeTimers()
    return {
        tick: (ms: number) => { vi.advanceTimersByTime(ms) },
        restore: () => { vi.useRealTimers() },
    }
}
export const stub = () => vi.fn()
