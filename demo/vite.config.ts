import type { Plugin } from 'vite'
import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import { aihandPlugin } from 'aihand/ui'

// demo root 在 packages/lite-monaco/demo,但 aihand client 源码在 packages/aidev/src
// (仓库根下),默认 fs 沙箱拦在 demo root 外 → client.ts 403 → WS 不连。放开到仓库根。
const repoRoot = resolve(__dirname, '../../..')

// client.ts 动态 import('virtual:aihand-knobs')(旋钮态射表,由完整 aihand() 的 knobSchema 提供)。
// demo 无旋钮组件,只挂运行时探针 → 给空 stub 满足 vite import-analysis,不引 tree-sitter 引擎。
const emptyKnobs = (): Plugin => {
    const V = 'virtual:aihand-knobs'
    const R = '\0' + V
    return {
        name: 'lab-empty-knobs',
        resolveId: id => (id === V ? R : null),
        load: id => (id === R ? 'export const knobs = []' : null),
    }
}

export default defineConfig({
    root: __dirname,
    server: { port: 5199, fs: { allow: [repoRoot] } },
    plugins: [emptyKnobs(), ...aihandPlugin()],
    // Monaco editor worker 配置
    optimizeDeps: {
        include: ['monaco-editor'],
    },
    build: {
        rollupOptions: {
            output: {
                manualChunks: {
                    monaco: ['monaco-editor'],
                },
            },
        },
    },
})
