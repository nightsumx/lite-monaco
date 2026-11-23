// 打包三个 React 页面到 ../out/react-{a,b,c}[18].{html,js}。先跑 ../build.mjs(要它打的 Monaco worker)。
// REACT=18 时 react / react-dom 换成 18.3.1(别名包 react18、react-dom18),输出名带 18。
import { build } from '../../../node_modules/esbuild/lib/main.js'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { copyFileSync, existsSync } from 'node:fs'

const here = dirname(fileURLToPath(import.meta.url))
const out = resolve(here, '../out')
if (!existsSync(resolve(out, 'ts.worker.js'))) throw new Error('先跑 node ../build.mjs(Monaco worker)')
const nm = p => resolve(here, '../node_modules', p)
for (const v of ['19', '18']) {
    const s = v === '18' ? '18' : ''
    // 三个页面只用一份 React:src/react 从 lite-monaco 往上找会找到另一份,别名钉住
    // src/react 按包名 import 'lite-monaco',指回源码(C 页)
    const alias = { 'lite-monaco': resolve(here, '../../../src/index.ts'), react: nm('react' + s), 'react-dom': nm('react-dom' + s), scheduler: v === '18' ? nm('react-dom18/node_modules/scheduler') : nm('scheduler') }
    for (const k of ['a', 'b', 'c']) {
        await build({
            bundle: true, format: 'iife', target: 'chrome120', logLevel: 'warning', jsx: 'automatic',
            loader: { '.ttf': 'file', '.woff': 'file', '.woff2': 'file', '.css': 'css', '.svg': 'dataurl', '.png': 'dataurl' },
            assetNames: '[name]-[hash]', absWorkingDir: here, alias, nodePaths: [nm('.')],
            define: { 'process.env.NODE_ENV': '"development"' },
            entryPoints: { [`react-${k}${s}`]: resolve(here, `entry-${k}.tsx`) }, outdir: out,
        })
        copyFileSync(resolve(here, 'index.html'), resolve(out, `react-${k}${s}.html`))
    }
}
console.log('built react pages', out)
