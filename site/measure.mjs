// 官网上体积数字的出处:同一个打包器、同一组参数,分别打 lite-monaco 和 monaco-editor,量 raw 和 gzip -9。
// 用法:node site/measure.mjs(要先 npm i,monaco-editor 是 devDependency)。输出 JSON(1 KB = 1000 字节,和官网一致)。
import { build } from '../node_modules/esbuild/lib/main.js'
import { gzipSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { readFileSync, mkdtempSync } from 'node:fs'
import { stripCssCommentsPlugin } from '../scripts/build/strip-css-comments.mjs'
import { tmpdir } from 'node:os'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = mkdtempSync(resolve(tmpdir(), 'lm-size-'))
const mon = p => resolve(root, 'node_modules/monaco-editor/esm/vs', p)
const common = { bundle: true, minify: true, target: 'chrome120', logLevel: 'error', absWorkingDir: root, define: { 'process.env.NODE_ENV': '"production"' },
    loader: { '.ttf': 'file', '.woff': 'file', '.woff2': 'file', '.css': 'css', '.svg': 'dataurl', '.png': 'dataurl' } }
const jobs = {
    // 和 npm 包一样分块(splitting):主包 a.js 之外,codicon 字体是挂载时才加载的单独一块,分开报
    'lite-monaco (不含 shiki / typescript)': { format: 'esm', splitting: true, plugins: [stripCssCommentsPlugin], entryPoints: { a: resolve(root, 'src/index.ts') }, external: ['typescript', 'shiki', 'shiki/*', 'react', 'vscode-*'] },
    'monaco-editor editor.main': { format: 'esm', entryPoints: { a: mon('editor/editor.main.js') } },
    'monaco-editor editor.worker': { format: 'iife', entryPoints: { a: mon('editor/editor.worker.js') } },
    'monaco-editor ts.worker': { format: 'iife', entryPoints: { a: mon('language/typescript/ts.worker.js') } },
}
const res = {}
for (const [name, j] of Object.entries(jobs)) {
    const dir = resolve(out, String(Object.keys(res).length))
    const { metafile } = await build({ ...common, ...j, outdir: dir, metafile: true })
    const outs = metafile.outputs, key = f => Object.keys(outs).find(k => k.endsWith('/' + f))
    const size = k => { const buf = readFileSync(resolve(root, k)); return [buf.length, gzipSync(buf, { level: 9 }).length] }
    const kb = ([raw, gz]) => ({ raw_KB: Math.round(raw / 1000), gzip_KB: Math.round(gz / 1000) })
    // 首屏 = 入口 + 它静态 import 的全部块(打开编辑器就要的);动态 import 的(字体、语言模式)是之后按需加载的,另列
    const initial = new Set(), walk = k => { if (initial.has(k)) return; initial.add(k); for (const im of outs[k].imports) if (im.kind === 'import-statement' && outs[im.path]) walk(im.path) }
    walk(key('a.js'))
    const sum = ks => ks.map(size).reduce((a, b) => [a[0] + b[0], a[1] + b[1]], [0, 0])
    res[name] = kb(sum([...initial]))
    const lazy = Object.keys(outs).filter(k => k.endsWith('.js') && !initial.has(k))
    if (lazy.length) res[name].lazy = Object.fromEntries(lazy.map(k => [k.replace(/^.*\//, '').replace(/-[A-Z0-9]+\.js$/, ''), kb(size(k))]))
}
console.log(JSON.stringify(res, null, 2))
