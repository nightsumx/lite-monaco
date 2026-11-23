import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
    // src/react 按包名 import 'lite-monaco':指回源码,和测试里 import 的 src/index 是同一个模块
    resolve: { alias: [{ find: /^lite-monaco$/, replacement: fileURLToPath(new URL('./src/index.ts', import.meta.url)) }] },
    test: {
        include: ['__tests__/**/*.test.{ts,tsx}'],
        environment: 'jsdom',
        // 全量并行时机器负载高(16 核上平均负载到过 69),单跑 0.5–3s 的重用例(打字 / 括号 / 键位 / 2 万行视图)会被抢占拉过默认 5s;
        // 行为断言不看耗时,只有个别 wall-clock 用例自己取多次最小值。同 vitest.parity.config.ts 的做法。
        testTimeout: 30_000,
    },
})
