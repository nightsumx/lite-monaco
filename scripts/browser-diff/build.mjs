// 打包两个页面:monaco(真 monaco-editor 0.55.1,来自 lite-monaco 的 devDependency)和 lite(src 源码,改了就生效)。
// 输出到 out/。用法:node build.mjs
import { build } from '../../node_modules/esbuild/lib/main.js'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { mkdirSync, copyFileSync, existsSync } from 'node:fs'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../..')
const out = resolve(here, 'out')
mkdirSync(out, { recursive: true })
const mon = p => resolve(root, 'node_modules/monaco-editor/esm/vs', p)

const common = {
    bundle: true, format: 'iife', target: 'chrome120', logLevel: 'warning', sourcemap: false,
    loader: { '.ttf': 'file', '.woff': 'file', '.woff2': 'file', '.css': 'css', '.svg': 'dataurl', '.png': 'dataurl' },
    assetNames: '[name]-[hash]', absWorkingDir: here,
    define: { 'process.env.NODE_ENV': '"development"' },
}
// 真 Monaco 的 worker(smoke 场景里 css/html/json/ts 要用)
await build({
    ...common,
    entryPoints: {
        'editor.worker': mon('editor/editor.worker.js'),
        'css.worker': mon('language/css/css.worker.js'),
        'html.worker': mon('language/html/html.worker.js'),
        'json.worker': mon('language/json/json.worker.js'),
        'ts.worker': mon('language/typescript/ts.worker.js'),
    },
    outdir: out,
})
await build({ ...common, entryPoints: { monaco: resolve(here, 'page/entry-monaco.ts') }, outdir: out })
await build({ ...common, entryPoints: { lite: resolve(here, 'page/entry-lite.ts') }, outdir: out, external: [] })
for (const n of ['monaco', 'lite']) copyFileSync(resolve(here, 'page/index.html'), resolve(out, `${n}.html`))
console.log('built', out)
