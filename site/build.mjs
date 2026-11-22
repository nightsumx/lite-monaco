// 官网构建:esbuild 把 site/main.ts(连同 ../src 的 lite-monaco 源码)打成 site/dist/。
// 用法:node site/build.mjs [--watch];本地预览:python3 -m http.server -d site 5311。
import { build, context } from '../node_modules/esbuild/lib/main.js'
import { stripCssCommentsPlugin } from '../scripts/build/strip-css-comments.mjs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

// 单测点阵的数据:从 PARITY.md(scripts/parity-report.mjs 生成)逐文件读出。页面上写死的总数和这里对不上就不让构建过。
function parityData() {
    const md = readFileSync(resolve(here, '../PARITY.md'), 'utf8')
    const files = []
    let group = null
    for (const line of md.split('\n')) {
        const g = /^## ([ABC]) /.exec(line)
        if (g) { group = g[1]; continue }
        if (/^## /.test(line)) group = null
        const row = group && /^\| [^|]+ \| (\d+)\/(\d+) \| (\S+) \|$/.exec(line)
        if (row) { files.push({ group, file: row[3], pass: +row[1], total: +row[2], reason: '' }); continue }
        const na = /^- (\S+\.test\.ts) \((\d+)\) —— (.*)$/.exec(line)
        if (na) files.push({ group: 'NA', file: na[1], pass: 0, total: +na[2], reason: na[3] })
        const naCase = /^- (\S+\.test\.ts) :: (.*?) —— (.*)$/.exec(line)
        if (naCase) files.push({ group: 'NA', file: `${naCase[1]} :: ${naCase[2]}`, pass: 0, total: 1, reason: naCase[3] })
    }
    const sum = (f) => files.filter(f).reduce((a, x) => a + x.total, 0)
    const inScope = sum(x => x.group !== 'NA'), passed = files.filter(x => x.group !== 'NA').reduce((a, x) => a + x.pass, 0), na = sum(x => x.group === 'NA')
    const expect = { total: 3863, inScope: 3279, passed: 3279, na: 584 }
    const got = { total: inScope + na, inScope, passed, na }
    if (JSON.stringify(got) !== JSON.stringify(expect)) throw new Error(`PARITY.md 和页面上的数字对不上:页面 ${JSON.stringify(expect)},PARITY.md ${JSON.stringify(got)}。改 site/index.html 和这里的 expect。`)
    // 点阵按组排:A、B、C 在前,不适用的放最后
    const order = { A: 0, B: 1, C: 2, NA: 3 }
    files.sort((a, b) => order[a.group] - order[b.group])
    return { files }
}

const opts = {
    entryPoints: { main: resolve(here, 'main.ts') },
    outdir: resolve(here, 'dist'),
    bundle: true, format: 'esm', splitting: true, minify: true, target: 'es2022', logLevel: 'info',
    // shiki 只用 core + 引擎 + 3 个语法 + 1 个主题,由 main.ts 显式注入;默认的懒加载 shiki 路径在这里走不到,留作外部依赖免得把全部语法打进来
    external: ['typescript', 'react', 'react/*'],
    plugins: [
        stripCssCommentsPlugin,
        { name: 'shiki-bare-external', setup(b) { b.onResolve({ filter: /^shiki$/ }, a => ({ path: a.path, external: true })) } },
        { name: 'virtual-parity', setup(b) {
            b.onResolve({ filter: /^virtual:parity$/ }, () => ({ path: 'parity', namespace: 'virtual' }))
            b.onLoad({ filter: /.*/, namespace: 'virtual' }, () => ({ contents: JSON.stringify(parityData()), loader: 'json', watchFiles: [resolve(here, '../PARITY.md')] }))
        } },
    ],
    loader: { '.ttf': 'file', '.woff': 'file', '.woff2': 'file', '.css': 'css', '.svg': 'dataurl', '.png': 'dataurl' },
    assetNames: '[name]-[hash]',
    define: { 'process.env.NODE_ENV': '"production"' },
    absWorkingDir: here,
}
if (process.argv.includes('--watch')) { const c = await context(opts); await c.watch(); console.log('watching…') }
else await build(opts)
