// 全面性能对比:lite-monaco vs monaco-editor 0.55.1,同一份场景、同一个 Chrome(无头,不抢焦点)。
// 用法:node scripts/perf/build.mjs && node scripts/perf/bench.mjs [--runs=3] [--only=regex] [--engines=lite,monaco] [--quick]
// 输出 scripts/perf/RESULTS.md 和 results.json。cpu 后缀 = 主线程任务时间(CDP),其余是墙钟(受 16.7ms 帧量化)。
import { chromium } from '../browser-diff/node_modules/playwright-core/index.mjs'
import { createServer } from 'node:http'
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, extname } from 'node:path'
const here = dirname(fileURLToPath(import.meta.url)), out = resolve(here, process.env.PERF_OUT || 'out')
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : d }
const RUNS = Number(arg('runs', 3)), ONLY = arg('only') ? new RegExp(arg('only')) : null
const ENGINES = arg('engines', 'lite,monaco').split(','), TIMEOUT = Number(arg('timeout', 120)) * 1000
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.ttf': 'font/ttf' }
const srv = createServer((q, r) => { const p = resolve(out, '.' + q.url.split('?')[0]); if (!p.startsWith(out) || !existsSync(p)) { r.writeHead(404).end(); return } r.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }).end(readFileSync(p)) })
await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${srv.address().port}`
const browser = await chromium.launch({ channel: 'chrome', args: ['--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--js-flags=--expose-gc'] })

const med = a => { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1] }
const pct = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))] }
const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, rj) => setTimeout(() => rj(new Error('TIMEOUT ' + what)), ms))])

const inPage = Object.fromEntries((await (async () => {
    const ctx = await browser.newContext(); const pg = await ctx.newPage(); await pg.goto(`${base}/lite.html`); await pg.waitForFunction(() => window.__S)
    const names = await pg.evaluate(() => Object.keys(window.__S)); await ctx.close(); return names.map(n => [n, 'page'])
})()))
const driven = ['typing_small', 'typing_100k', 'typing_wrap', 'typing_longline', 'nav_100k', 'wheel_100k']
const all = [...Object.keys(inPage), ...driven].filter(n => !ONLY || ONLY.test(n))

async function runOne(engine, name) {
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 600 } }); const page = await ctx.newPage()
    const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0, 200)))
    const cdp = await ctx.newCDPSession(page); await cdp.send('Performance.enable')
    let mark = 0
    const task = async () => (await cdp.send('Performance.getMetrics')).metrics.find(m => m.name === 'TaskDuration').value * 1000
    await page.exposeFunction('__cpu', async l => { if (l === 'start') { mark = await task(); return 0 } return (await task()) - mark })
    await page.goto(`${base}/${engine}.html`); await page.waitForFunction(() => window.__S, null, { timeout: 30000 })
    let res = {}
    try {
        if (inPage[name]) res = await withTimeout(page.evaluate(n => window.__S[n](), name), TIMEOUT, name)
        else res = await withTimeout(drive(page, name), TIMEOUT, name)
        await cdp.send('HeapProfiler.enable'); await cdp.send('HeapProfiler.collectGarbage'); await new Promise(r => setTimeout(r, 100)); await cdp.send('HeapProfiler.collectGarbage')
        res.heapMB = (await cdp.send('Runtime.getHeapUsage')).usedSize / 1e6
    } catch (e) { res = { __error: String(e.message || e).slice(0, 160) } }
    if (errs.length) res.__pageerrors = errs.length
    await ctx.close(); return res
}

async function drive(page, name) {
    const pos = await page.evaluate(k => window.__setup(k), name)
    const o = {}
    const rec = async (types, body) => {
        await page.evaluate(t => window.__rec.start(t), types); await page.evaluate(() => window.__cpu('start')); await body(); await page.evaluate(() => window.__drain())
        const cpu = await page.evaluate(() => window.__cpu('end')); const r = await page.evaluate(() => window.__rec.stop()); r.cpu = cpu; r.n = r.lat.length || 1; return r
    }
    const sum = (key, r) => { o[key + '.p50'] = med(r.lat); o[key + '.p95'] = pct(r.lat, 0.95); o[key + '.max'] = Math.max(...r.lat); o[key + '.longtask'] = r.long; o[key + '.cpu_per_event'] = r.cpu / r.n }
    if (name.startsWith('typing')) {
        const text = 'const value = compute(a, b) + 1;'.repeat(2)
        await page.mouse.click(pos.x, pos.y)  // 真点击聚焦
        await page.evaluate(() => { const { ed } = window.__keep; ed.setPosition(ed.getPosition()) })
        const r = await rec(['keydown'], async () => { for (const ch of text) { await page.keyboard.type(ch); await page.evaluate(() => window.__drain()) } })
        sum('key_to_paint', r)
        const r2 = await rec(['keydown'], async () => { for (let i = 0; i < 20; i++) { await page.keyboard.press('Backspace'); await page.evaluate(() => window.__drain()) } })
        sum('backspace_to_paint', r2)
        const r3 = await rec(['keydown'], async () => { for (let i = 0; i < 10; i++) { await page.keyboard.press('Enter'); await page.evaluate(() => window.__drain()) } })
        sum('enter_to_paint', r3)
    } else if (name === 'nav_100k') {
        await page.mouse.click(pos.x, pos.y); await page.evaluate(() => { window.__keep.ed.setPosition({ lineNumber: 1, column: 1 }) })
        const r = await rec(['keydown'], async () => { for (let i = 0; i < 40; i++) { await page.keyboard.press('PageDown'); await page.evaluate(() => window.__drain()) } })
        sum('pagedown_x40', r)
        const r2 = await rec(['keydown'], async () => { for (let i = 0; i < 100; i++) { await page.keyboard.press('ArrowDown'); await page.evaluate(() => window.__drain()) } })
        sum('arrowdown_x100', r2)
        const r3 = await rec(['keydown'], async () => { await page.keyboard.press('Control+End'); await page.evaluate(() => window.__drain()); await page.keyboard.press('Control+Home'); await page.evaluate(() => window.__drain()) })
        sum('ctrl_end_home', r3)
        const r4 = await rec(['keydown'], async () => { await page.keyboard.press('Control+a'); await page.evaluate(() => window.__drain()) })
        sum('ctrl_a_100k', r4)
        const r5 = await rec(['keydown'], async () => { await page.keyboard.down('Shift'); for (let i = 0; i < 40; i++) { await page.keyboard.press('PageDown'); await page.evaluate(() => window.__drain()) } await page.keyboard.up('Shift') })
        sum('shift_pagedown_x40', r5)
    } else if (name === 'wheel_100k') {
        await page.mouse.move(pos.x, pos.y)
        const r = await rec(['wheel'], async () => { for (let i = 0; i < 120; i++) { await page.mouse.wheel(0, 240); await page.evaluate(() => window.__drain()) } })
        sum('wheel_to_paint', r)
        const r2 = await rec(['wheel'], async () => { for (let i = 0; i < 40; i++) { await page.mouse.wheel(0, 2400); await page.evaluate(() => window.__drain()) } })
        sum('wheel_fast_to_paint', r2)
    }
    return o
}

const results = {}
for (const name of all) {
    results[name] = {}
    for (const engine of ENGINES) {
        const runs = []
        for (let i = 0; i < RUNS; i++) { process.stderr.write(`\r${name} ${engine} ${i + 1}/${RUNS}        `); runs.push(await runOne(engine, name)) }
        const ok = runs.filter(r => !r.__error)
        if (!ok.length) { results[name][engine] = { __error: runs[0].__error }; continue }
        const keys = [...new Set(ok.flatMap(r => Object.keys(r)))].filter(k => typeof ok[0][k] === 'number' || ok.some(r => typeof r[k] === 'number'))
        results[name][engine] = Object.fromEntries(keys.map(k => [k, +med(ok.map(r => r[k]).filter(v => typeof v === 'number')).toFixed(2)]))
        if (ok.length < runs.length) results[name][engine].__failed_runs = runs.length - ok.length
    }
}
process.stderr.write('\n')
writeFileSync(resolve(process.env.PERF_OUT ? out : here, 'results.json'), JSON.stringify(results, null, 1))

// ── 报告 ──
const f = v => v === undefined ? '—' : v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)
let md = `# 性能对比:lite-monaco vs monaco-editor 0.55.1\n\n`
md += `生成于 ${new Date().toISOString().slice(0, 16)},Chrome 无头,每项 ${RUNS} 次取中位数。数字是毫秒(heapMB 为 MB),越小越好。\`.cpu\` = 主线程任务时间(不受 16.7 ms 帧量化),其余为墙钟。比值 = lite / monaco,<1 是 lite 更快,**加粗**是 lite 慢于 1.25×。\n\n`
let wins = 0, losses = 0, ties = 0, errs = 0
for (const [name, r] of Object.entries(results)) {
    md += `## ${name}\n\n| 指标 | lite | monaco | 比值 |\n|---|---:|---:|---:|\n`
    const L = r.lite || {}, M = r.monaco || {}
    if (L.__error || M.__error) { md += `| __error | ${L.__error ?? ''} | ${M.__error ?? ''} | |\n\n`; errs++; continue }
    for (const k of [...new Set([...Object.keys(L), ...Object.keys(M)])]) {
        if (k.startsWith('__') || k === 'matches' || k.endsWith('.count') || k === 'changes' || k === 'typed_chars') { md += `| ${k} | ${f(L[k])} | ${f(M[k])} | |\n`; continue }
        const ratio = L[k] / M[k]; const floor = (L[k] < 0.3 && M[k] < 0.3) || (L[k] < 17 && M[k] < 17 && !k.endsWith('.cpu') && !k.includes('.max'))
        const tag = !isFinite(ratio) ? '' : floor ? '≈' : ratio > 1.25 ? `**${ratio.toFixed(2)}**` : ratio.toFixed(2)
        if (isFinite(ratio) && !floor) { if (ratio > 1.25) losses++; else if (ratio < 0.8) wins++; else ties++ } else if (floor) ties++
        md += `| ${k} | ${f(L[k])} | ${f(M[k])} | ${tag} |\n`
    }
    md += '\n'
}
md = md.replace('\n\n## ', `\n\n**汇总:lite 更快(<0.8×) ${wins} 项,持平 ${ties} 项,lite 更慢(>1.25×) ${losses} 项,出错/超时 ${errs} 项。**(≈ 表示两边都在帧量化或测量噪声以内,算持平)\n\n## `)
writeFileSync(resolve(here, 'RESULTS.md'), md)
console.log(md.split('\n').slice(0, 8).join('\n')); console.log(`wins ${wins} ties ${ties} losses ${losses} errors ${errs}`)
await browser.close(); srv.close()
