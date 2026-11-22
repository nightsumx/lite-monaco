import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'
import { existsSync } from 'node:fs'

// 把 VS Code 原版 editor 单测拿来跑 lite-monaco。
// 源码不进仓库:MONACO_SRC 指向 microsoft/vscode 的稀疏检出(见 __parity__/README.md)。
const SRC = process.env.MONACO_SRC ?? resolve(__dirname, '../../../reference/_vscode-src')
const P = (f: string) => resolve(__dirname, '__parity__/shims', f)

// 约定:原版测试 import 的 Monaco 内部模块,只要 __parity__/shims/<模块文件名>.ts 存在就映射过去(按 basename,不含 .js)。
// 新增垫片 = 新增一个文件,不用改这里。utils 太泛,单独按路径匹配。
const VALUE_SHIMS = new Set(['range', 'position', 'selection', 'utils']) // 只是值类型/空桩,不算"真接入"
const shimOf = (id: string, importer?: string): string | null => {
    if (!importer || !importer.startsWith(SRC) || !id.startsWith('.') || !id.endsWith('.js')) return null
    if (/base\/test\/common\/utils\.js$/.test(id)) return P('utils.ts')
    if (/common\/services\/model\.js$/.test(id)) return P('modelService.ts') // basename 'model' 会撞 common/model.js
    const base = id.replace(/^.*\//, '').replace(/\.js$/, '')
    if (base === 'utils') return null
    // 只给某一个测试文件用的垫片:shims/for/<测试文件名(不含 .ts)>/<模块名>.ts,优先于全局垫片。
    // 模块名撞了别处也在用的真实 Monaco 模块(如 rangeMapping 被 diffEditorWidget 的真实代码引用)时用它,免得全局映射把别人带坏。
    const scoped = P(`for/${importer.replace(/^.*\//, '').replace(/\.ts$/, '')}/${base}.ts`)
    if (existsSync(scoped)) return scoped
    const f = P(base + '.ts')
    return existsSync(f) ? f : null
}

export { VALUE_SHIMS }
export default defineConfig({
    plugins: [{
        name: 'monaco-parity-alias',
        enforce: 'pre',
        resolveId(id, importer) { return id === 'sinon' ? P('sinon.ts') : shimOf(id, importer) },
    }],
    test: {
        include: [`${SRC}/src/vs/editor/**/*.test.ts`],
        environment: 'jsdom',
        globals: true,
        testTimeout: 30_000, // 全量并行时机器负载高,重用例(如 1000+ 次替换)会超过默认 5s;单跑都在 2s 内,不是行为差异
        setupFiles: [resolve(__dirname, '__parity__/setup.ts')],
        server: { deps: { inline: [/_vscode-src/] } },
    },
    server: { fs: { strict: false } },
})
