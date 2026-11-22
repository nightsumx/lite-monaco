import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

// 把 monaco-editor 仓库的 Monarch 分词测试(src/languages/definitions/*/*.test.ts)拿来跑 lite-monaco。
// 源码不进仓库:MONACO_EDITOR_SRC 指向 microsoft/monaco-editor 的检出(默认 ~/Documents/reference/monaco-editor)。
//   MONACO_EDITOR_SRC=$HOME/Documents/reference/monaco-editor npx vitest run --config vitest.monarch.config.ts
// 测试文件原样用,只有 test/testRunner 换成 __parity__/monarch/testRunner.ts(见该文件头)。
const SRC = process.env.MONACO_EDITOR_SRC ?? resolve(process.env.HOME ?? '', 'Documents/reference/monaco-editor')
export default defineConfig({
    plugins: [{
        name: 'monarch-parity-alias',
        enforce: 'pre',
        resolveId(id, importer) {
            if (importer?.startsWith(SRC) && /\/test\/testRunner$/.test(id)) return resolve(__dirname, '__parity__/monarch/testRunner.ts')
            // 个别测试文件(elixir)自己直接 import 编辑器入口、_.contribution 和 node:test:同样指到 lite-monaco 的对应物
            if (importer?.startsWith(SRC) && importer.includes('/languages/definitions/')) {
                if (id === '../../../editor') return resolve(__dirname, 'src/basic-languages/_monaco.ts')
                if (id === '../_.contribution') return resolve(__dirname, 'src/basic-languages/_.contribution.ts')
                if (id === 'node:test') return resolve(__dirname, '__parity__/monarch/node-test.ts')
            }
            return null
        },
    }],
    test: {
        include: [`${SRC}/src/languages/definitions/*/*.test.ts`],
        environment: 'jsdom',
        testTimeout: 30_000,
        server: { deps: { inline: [/monaco-editor/] } },
    },
    server: { fs: { strict: false } },
})
