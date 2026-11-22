import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

// 对照 monaco-editor 0.55.1(我们对标的版本)的 Monarch 分词测试:用 0.55.1 的原版测试文件,跑 lite-monaco 里的语言定义
// (语言定义本体来自 0.58.0,见 vitest.monarch.config.ts)。两个版本的差异清单见 __parity__/monarch/VERSION-DIFF.md。
//   MONACO_EDITOR_SRC_0551=$HOME/Documents/reference/monaco-editor-0.55.1 npx vitest run --config vitest.monarch-0551.config.ts
// 0.55.1 的测试在 src/basic-languages/<lang>/<lang>.test.ts,import '../test/testRunner'、'../monaco.contribution'。
const SRC = process.env.MONACO_EDITOR_SRC_0551 ?? resolve(process.env.HOME ?? '', 'Documents/reference/monaco-editor-0.55.1')
export default defineConfig({
    plugins: [{
        name: 'monarch-0551-alias',
        enforce: 'pre',
        resolveId(id, importer) {
            if (!importer?.startsWith(SRC)) return null
            if (/\/test\/testRunner$/.test(id)) return resolve(__dirname, '__parity__/monarch/testRunner.ts')
            if (id === '../monaco.contribution') return resolve(__dirname, 'src/basic-languages/register.all.ts')
            if (id === '../_.contribution') return resolve(__dirname, 'src/basic-languages/_.contribution.ts')
            if (id === 'monaco-editor-core') return resolve(__dirname, 'src/basic-languages/_monaco.ts')
            if (id === 'node:test') return resolve(__dirname, '__parity__/monarch/node-test.ts')
            return null
        },
    }],
    test: {
        include: [`${SRC}/src/basic-languages/*/*.test.ts`],
        environment: 'jsdom',
        testTimeout: 30_000,
        server: { deps: { inline: [/monaco-editor/] } },
    },
    server: { fs: { strict: false } },
})
