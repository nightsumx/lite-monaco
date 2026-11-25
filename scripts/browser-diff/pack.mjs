// 用户的整条链路跑一遍:npm pack 出的 tarball → monorepo 外的干净目录安装 → 用户的打包器生产构建 → 真 Chrome 里跑全部差分场景。
//
// 源码打的页面(build.mjs)测的是 src/;用户拿到的是 dist/ 经过 npm pack(files、exports)、npm install(peer、去重)、
// 他自己的打包器(Vite 8 的 Rolldown、esbuild,压缩、tree-shaking、分块)以后的东西。0.4.0、0.4.1 的默认键位就坏在这中间,源码测试全绿。
// 这里把这段链路原样走一遍,判据只有一条:装出来的包和源码在同一个场景里结果一模一样(另外照旧和真 Monaco 比)。
//
//   node pack.mjs                     构建 + 打包 + 安装 + 打页面 + 跑 run / smoke / clipboard / react 四套,再跑模板和最少依赖的消费者
//   node pack.mjs --no-build          不重跑 npm run build(dist 已是最新)
//   node pack.mjs --bundlers=vite     只用一种打包器(默认 vite,esbuild)
//   node pack.mjs --pages-only        只打页面不跑(之后可以 PACK=vite node run.mjs 50-keys 单跑)
//   node pack.mjs --skip=react,clipboard   跳过某几套
//
// 安装目录默认 ~/.cache/lite-monaco-consumer(LM_CONSUMER 可改):必须在 monorepo 外,不然 node 往上找到 monorepo 的
// node_modules,缺的依赖会被悄悄补上,用户那边的「装不上 / 找不到」就测不出来。
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { homedir } from 'node:os'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../..')
const args = process.argv.slice(2)
const flag = (n) => args.includes('--' + n)
const opt = (n, d) => args.find(a => a.startsWith(`--${n}=`))?.split('=')[1] ?? d
const bundlers = opt('bundlers', 'vite,esbuild').split(',').filter(Boolean)
const skip = new Set(opt('skip', '').split(',').filter(Boolean))
const home = process.env.LM_CONSUMER ?? join(homedir(), '.cache/lite-monaco-consumer')
if (home.startsWith(resolve(root, '..'))) throw new Error(`安装目录 ${home} 在 monorepo 里,会借到 monorepo 的 node_modules`)

const sh = (cmd, argv, cwd, env = {}) => {
    const r = spawnSync(cmd, argv, { cwd, stdio: 'inherit', env: { ...process.env, ...env } })
    if (r.status !== 0) throw new Error(`${cmd} ${argv.join(' ')} 失败(${cwd})`)
}
const out = (cmd, argv, cwd) => execFileSync(cmd, argv, { cwd, encoding: 'utf8' }).trim()
const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex').slice(0, 16)
const version = (p) => JSON.parse(readFileSync(join(root, 'node_modules', p, 'package.json'), 'utf8')).version
const failures = []
const step = (s) => console.log(`\n━━ ${s}`)

// ── 1. 构建、打包 ──
// LM_TGZ=<tarball>:不构建不打包,测这个现成的包(比如 npm 上已发布的版本,看这套测试能不能把它的问题测出来)
const given = process.env.LM_TGZ && resolve(process.env.LM_TGZ)
if (!given && !flag('no-build')) { step('npm run build(含 dist 检查)'); sh('npm', ['run', 'build'], root) }
mkdirSync(home, { recursive: true })
let tgz = given
if (!tgz) {
    step('npm pack')
    tgz = join(home, out('npm', ['pack', '--silent', '--pack-destination', home], root).split('\n').pop())
}
console.log(tgz)

/**
 * 一个消费者目录:写 package.json,依赖变了才全量安装;lite-monaco 每次都从这次的 tarball 重装,并核对装上的就是这次构建的
 * (npm 见版本号没变会跳过 file: 依赖,不核对就可能测到上一次的包)
 */
function consumer(name, deps) {
    const dir = join(home, name)
    mkdirSync(dir, { recursive: true })
    const pkg = { name: `lite-monaco-consumer-${name}`, private: true, type: 'module', dependencies: deps }
    const want = JSON.stringify(pkg, null, 2) + '\n'
    const pkgFile = join(dir, 'package.json')
    if (!existsSync(pkgFile) || readFileSync(pkgFile, 'utf8') !== want || !existsSync(join(dir, 'node_modules'))) {
        writeFileSync(pkgFile, want)
        rmSync(join(dir, 'node_modules'), { recursive: true, force: true })
        rmSync(join(dir, 'package-lock.json'), { force: true })
        sh('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], dir)
    }
    rmSync(join(dir, 'node_modules/lite-monaco'), { recursive: true, force: true })
    sh('npm', ['install', '--no-save', '--no-package-lock', '--no-audit', '--no-fund', '--loglevel=error', tgz], dir)
    const got = join(dir, 'node_modules/lite-monaco/dist/index.js')
    if (!given && sha(got) !== sha(join(root, 'dist/index.js'))) throw new Error(`${name}:装上的 lite-monaco 不是这次构建的`)
    return dir
}

// ── 2. 差分页面:和源码页同一份 harness、同一个入口,只是 import 'lite-monaco' 走装好的包 ──
// peer 的版本和源码页用的(lite-monaco 的 devDependencies 实际装的)一致,这样两边不同只可能来自打包和安装
const peers = ['shiki', 'typescript', 'vscode-css-languageservice', 'vscode-html-languageservice', 'vscode-json-languageservice',
    'vscode-languageserver-textdocument', 'vscode-languageserver-types', 'vscode-uri']
const bdPkg = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8')).dependencies
const diffDir = consumer('diff', {
    ...Object.fromEntries(peers.map(p => [p, version(p)])),
    react: bdPkg.react, 'react-dom': bdPkg['react-dom'], '@monaco-editor/react': bdPkg['@monaco-editor/react'],
    vite: version('vite'), esbuild: version('esbuild'),
})

step('写页面入口')
const srcDir = join(diffDir, 'src')
rmSync(srcDir, { recursive: true, force: true })
mkdirSync(srcDir, { recursive: true })
const toPackage = (code) => code
    .replaceAll(`'../../../src/react/index'`, `'lite-monaco/react'`)
    .replaceAll(`'../../../src/index'`, `'lite-monaco'`)
const entries = { lite: 'page/entry-lite.ts', 'react-b': 'react/entry-b.tsx', 'react-c': 'react/entry-c.tsx' }
cpSync(join(here, 'page/harness.ts'), join(srcDir, 'harness.ts'))
for (const [name, f] of Object.entries(entries)) {
    const code = toPackage(readFileSync(join(here, f), 'utf8'))
    if (code.includes('../src')) throw new Error(`${f} 里还有指向源码的 import`)
    // react 入口的 harness 是 react/harness.tsx:各放一份,保持相对路径 './harness'
    const dir = name === 'lite' ? srcDir : join(srcDir, 'react')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, `${name}${extname(f)}`), code)
}
cpSync(join(here, 'react/harness.tsx'), join(srcDir, 'react/harness.tsx'))
const entryOf = (name) => name === 'lite' ? `src/lite.ts` : `src/react/${name}.tsx`
// 页面就是源码页那份 html(page/index.html、react/index.html),只把按文件名取脚本的那段换成用户打包器产出的 ES 模块:
// 结构、空白都一样(失焦后 activeElement 是 body,场景会读它的 textContent)
const html = (name, src) => {
    const tpl = readFileSync(join(here, name === 'lite' ? 'page/index.html' : 'react/index.html'), 'utf8')
    const out = tpl.replace(/<script>[\s\S]*?<\/script>/, `<script type="module" src="${src}"></script>`)
    if (out === tpl) throw new Error('源码页的 html 里没找到取脚本的 <script>')
    return out
}

for (const b of bundlers) {
    const dest = join(here, 'out', `pack-${b}`)
    rmSync(dest, { recursive: true, force: true })
    step(`${b} 生产构建 → ${dest}`)
    if (b === 'vite') {
        for (const name of Object.keys(entries)) writeFileSync(join(diffDir, `${name}.html`), html(name, `./${entryOf(name)}`))
        writeFileSync(join(diffDir, 'vite.config.mjs'), `export default {
    base: './',
    logLevel: 'warn',
    build: { outDir: ${JSON.stringify(dest)}, emptyOutDir: true, rollupOptions: { input: ${JSON.stringify(Object.fromEntries(Object.keys(entries).map(n => [n, n + '.html'])))} } },
}\n`)
        sh('npx', ['vite', 'build', '--config', 'vite.config.mjs'], diffDir)
    }
    else if (b === 'esbuild') {
        const { build } = await import(pathToFileURL(join(diffDir, 'node_modules/esbuild/lib/main.js')).href)
        await build({
            absWorkingDir: diffDir, bundle: true, format: 'esm', splitting: true, minify: true, target: 'chrome120', platform: 'browser',
            logLevel: 'warning', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' },
            loader: { '.ttf': 'file', '.woff': 'file', '.woff2': 'file', '.wasm': 'file', '.svg': 'dataurl', '.png': 'dataurl' },
            assetNames: '[name]-[hash]', chunkNames: 'chunks/[name]-[hash]',
            entryPoints: Object.fromEntries(Object.keys(entries).map(n => [n, join(diffDir, entryOf(n))])), outdir: dest,
        })
        for (const name of Object.keys(entries)) writeFileSync(join(dest, `${name}.html`), html(name, `./${name}.js`))
    }
    else throw new Error('不认识的打包器 ' + b)
}

if (flag('pages-only')) { console.log(`\n页面打好了。单跑:PACK=${bundlers.join(',')} node run.mjs [过滤]`); process.exit(0) }

// ── 3. 四套差分,源码页现打,和装出来的包同场景同时跑 ──
step('源码页(对照)')
sh('node', ['build.mjs'], here)
sh('node', ['react/build.mjs'], here)
const PACK = bundlers.join(',')
for (const [name, script] of [['run', 'run.mjs'], ['smoke', 'smoke.mjs'], ['clipboard', 'clipboard.mjs'], ['react', 'react/run.mjs']]) {
    if (skip.has(name)) continue
    step(`${name}(PACK=${PACK})`)
    const r = spawnSync('node', [script], { cwd: here, stdio: 'inherit', env: { ...process.env, PACK } })
    if (r.status !== 0) failures.push(`${name}:装出来的包和源码不一样(或脚本出错),见上面的 ✗`)
}

// ── 4. 黑盒:官方模板、只装必需依赖的消费者,用户真的会这样起项目 ──
let pw
async function blackBox(label, dist, { diagnostics, expectErrors = [] }) {
    pw ??= await import(pathToFileURL(join(here, 'node_modules/playwright-core/index.mjs')).href)
    const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.json': 'application/json' }
    const srv = createServer((req, res) => {
        const p = join(dist, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html'))
        if (!p.startsWith(dist) || !existsSync(p)) { res.writeHead(404).end(); return }
        res.writeHead(200, { 'content-type': MIME[extname(p)] ?? 'application/octet-stream' }).end(readFileSync(p))
    })
    await new Promise(r => srv.listen(0, '127.0.0.1', r))
    const browser = await pw.chromium.launch({ channel: 'chrome' })
    const problems = []
    try {
        const page = await browser.newPage({ viewport: { width: 1000, height: 700 } })
        const errs = []
        page.on('pageerror', e => errs.push(String(e)))
        // 「Failed to load resource」不带地址,和下面的 response 重复;浏览器自己要的 /favicon.ico 不发 response,不算
        page.on('console', m => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errs.push('console: ' + m.text()) })
        page.on('response', r => { if (r.status() >= 400) errs.push(`${r.status()} ${r.url()}`) })
        await page.goto(`http://127.0.0.1:${srv.address().port}/`)
        await page.waitForSelector('.cm-content', { timeout: 20000 })
        const lines = () => page.$$eval('.cm-line', ls => ls.map(l => l.textContent))
        const before = await lines()
        // 用户的操作:点第一行行首,往下两行,行尾,打字;再上一行、行首,打字;撤销一次
        const first = await page.$('.cm-line')
        const box = await first.boundingBox()
        await page.mouse.click(box.x + 2, box.y + box.height / 2)
        for (const k of ['Home', 'ArrowDown', 'ArrowDown', 'End']) await page.keyboard.press(k)
        await page.keyboard.type('X1')
        for (const k of ['ArrowUp', 'Home']) await page.keyboard.press(k)
        await page.keyboard.type('Y2')
        await page.waitForTimeout(300)
        const after = await lines()
        if (after[2] !== before[2] + 'X1') problems.push(`第 3 行行尾打字:期望 ${JSON.stringify(before[2] + 'X1')},是 ${JSON.stringify(after[2])}`)
        if (after[1] !== 'Y2' + before[1]) problems.push(`第 2 行行首打字:期望 ${JSON.stringify('Y2' + before[1])},是 ${JSON.stringify(after[1])}`)
        await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z')
        await page.waitForTimeout(300)
        const undone = await lines()
        if (undone[1] !== before[1]) problems.push(`撤销:第 2 行期望 ${JSON.stringify(before[1])},是 ${JSON.stringify(undone[1])}`)
        if (diagnostics) {
            const ok = await page.waitForSelector('.cm-diagnostic-error', { timeout: 20000, state: 'attached' }).then(() => true, () => false)
            if (!ok) problems.push('TS 类型错误没有标出来(模板里故意写了 age: \'36\')')
        }
        // 页面背景色来自编辑器主题:没上主题时是透明
        const bg = await page.$eval('.cm-editor', e => getComputedStyle(e).backgroundColor)
        if (bg === 'rgba(0, 0, 0, 0)') problems.push('编辑器没有主题底色')
        for (const re of expectErrors) if (!errs.some(e => re.test(e))) problems.push(`应有的报错没出现:${re}`)
        problems.push(...errs.filter(e => !expectErrors.some(re => re.test(e))).map(e => '页面错误 ' + e.slice(0, 200)))
    } finally {
        await browser.close(); srv.close()
    }
    console.log(problems.length ? `✗ ${label}\n   ` + problems.join('\n   ') : `✓ ${label}:打字、方向键、Home/End、撤销${diagnostics ? '、TS 诊断' : ''},无页面错误`)
    if (problems.length) failures.push(`${label}:${problems.length} 个问题`)
}

if (!skip.has('templates')) {
    // 官方模板(StackBlitz 用的那个)原样:它自己的依赖、它自己的 build(tsc && vite build),只把 lite-monaco 换成这次的 tarball
    step('官方模板 templates/vite')
    const tplPkg = JSON.parse(readFileSync(join(root, 'templates/vite/package.json'), 'utf8'))
    const tplDeps = { ...tplPkg.dependencies, ...tplPkg.devDependencies }
    delete tplDeps['lite-monaco']
    const tpl = consumer('template-vite', tplDeps)
    for (const f of readdirSync(join(root, 'templates/vite'))) {
        if (['node_modules', 'package.json', 'package-lock.json', 'dist'].includes(f)) continue
        cpSync(join(root, 'templates/vite', f), join(tpl, f), { recursive: true })
    }
    try {
        sh('npx', ['tsc'], tpl) // 模板的 build 第一步:用户的 tsc 读 dist 的 .d.ts
        sh('npx', ['vite', 'build', '--base', './'], tpl)
        await blackBox('官方模板(tsc + vite build)', join(tpl, 'dist'), { diagnostics: true })
    } catch (e) { failures.push(`官方模板:${e.message}`) }

    // README 的最少安装:npm i lite-monaco shiki,可选的 peer 一个不装(typescript、vscode-*)。构建要过、编辑要能用
    step('最少依赖的消费者(npm i lite-monaco shiki + vite)')
    const min = consumer('minimal', { shiki: tplDeps.shiki, vite: tplDeps.vite })
    cpSync(join(root, 'templates/vite/index.html'), join(min, 'index.html'))
    cpSync(join(root, 'templates/vite/src'), join(min, 'src'), { recursive: true })
    try {
        sh('npx', ['vite', 'build', '--base', './'], min)
        // 模板打开的是 TS 文件:没装 typescript 就该是一条说清楚的报错,编辑照常
        await blackBox('最少依赖(没装 typescript、vscode-*)', join(min, 'dist'), { diagnostics: false, expectErrors: [/Could not resolve "typescript"/] })
    } catch (e) { failures.push(`最少依赖:${e.message}`) }
}

console.log('\n━━ 结果')
if (failures.length) { console.log('✗ ' + failures.join('\n✗ ')); process.exit(1) }
console.log('✓ 装出来的包在每个场景里和源码一样;模板和最少依赖的消费者能构建、能编辑')
