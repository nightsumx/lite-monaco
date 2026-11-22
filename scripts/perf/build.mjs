// 打两个压缩后的生产页面(lite-monaco 源码 / monaco-editor 0.55.1),输出到 out/。用法:node scripts/perf/build.mjs
import { build } from '../../node_modules/esbuild/lib/main.js'
import { stripCssCommentsPlugin } from '../build/strip-css-comments.mjs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '../..'), out = resolve(here, process.env.PERF_OUT || 'out')
mkdirSync(out, { recursive: true })
const mon = p => resolve(root, 'node_modules/monaco-editor/esm/vs', p)
const common = { bundle: true, format: 'iife', minify: !process.env.PERF_NOMIN, keepNames: !!process.env.PERF_NOMIN, target: 'chrome120', logLevel: 'error', outdir: out, absWorkingDir: root, plugins: [stripCssCommentsPlugin],
    loader: { '.ttf': 'file', '.woff': 'file', '.woff2': 'file', '.css': 'css', '.svg': 'dataurl', '.png': 'dataurl' }, assetNames: '[name]-[hash]', define: { 'process.env.NODE_ENV': '"production"' } }
await build({ ...common, entryPoints: { 'editor.worker': mon('editor/editor.worker.js'), 'ts.worker': mon('language/typescript/ts.worker.js'), 'json.worker': mon('language/json/json.worker.js'), 'css.worker': mon('language/css/css.worker.js'), 'html.worker': mon('language/html/html.worker.js') } })
await build({ ...common, entryPoints: { lite: resolve(here, 'entry-lite.js') }, external: ['typescript', 'shiki', 'shiki/*', 'react', 'vscode-*'] })
// 剖析用:不压缩标识符,函数名可读(profile.mjs lite-dev)
await build({ ...common, minify: false, keepNames: true, entryPoints: { 'lite-dev': resolve(here, 'entry-lite.js') }, external: ['typescript', 'shiki', 'shiki/*', 'react', 'vscode-*'] })
await build({ ...common, entryPoints: { monaco: resolve(here, 'entry-monaco.js') } })
for (const k of ['lite', 'lite-dev', 'monaco'])
    writeFileSync(resolve(out, `${k}.html`), `<!doctype html><html><head><meta charset=utf-8>${k === 'monaco' ? '<link rel=stylesheet href=monaco.css>' : ''}<style>html,body{margin:0}#e{width:1000px;height:600px}.perf-d{background:#fc0}.perf-line{background:#eef}</style></head><body><div id=e></div><script src=${k}.js></script></body></html>`)
console.log('built', out)
