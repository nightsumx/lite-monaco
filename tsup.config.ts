import { defineConfig } from 'tsup'
import { stripCssCommentsPlugin } from './scripts/build/strip-css-comments.mjs'

export default defineConfig({
    entry: {
        index: 'src/index.ts',
        // TS 语言服务的 Worker 入口(宿主自己的 worker 文件 import 它)
        tsworker: 'src/tsworker.ts',
        // 基础语言(81 个 Monarch 定义,= monaco-editor 的 basic-languages)。副作用入口,按需 import,不进主包
        'basic-languages': 'src/basic-languages/register.all.ts',
    },
    format: ['esm', 'cjs'],
    dts: { entry: { index: 'src/index.ts', tsworker: 'src/tsworker.ts', 'basic-languages': 'src/basic-languages/register.all.ts' } },
    splitting: true,
    clean: true,
    // peers 不进主包：shiki 高亮、typescript 语言服务（按需 dynamic import）、react 可选。
    // lite-monaco 自身只打包产品层 + 自研 CM7 内核（零 @codemirror 运行时依赖）。
    external: ['shiki', 'react', 'react-dom', 'typescript', 'vscode-css-languageservice', 'vscode-html-languageservice', 'vscode-json-languageservice', 'vscode-languageserver-textdocument', 'vscode-languageserver-types', 'vscode-uri', 'jsonc-parser'],
    shims: true,
    // CSS 模板串里的注释不进包(scripts/build/strip-css-comments.mjs)
    esbuildPlugins: [stripCssCommentsPlugin],
})
