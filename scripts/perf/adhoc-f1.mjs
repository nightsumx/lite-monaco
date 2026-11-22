// 对 lite(或 monaco)页面跑一个场景并用 CDP Profiler 采样,按自耗时列前 N 个函数。
// 用法:node scripts/perf/profile.mjs <scenario> [engine=lite] [topN=40]
import { chromium } from '../browser-diff/node_modules/playwright-core/index.mjs'
import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, extname } from 'node:path'
const out = resolve(dirname(fileURLToPath(import.meta.url)), process.env.PERF_OUT || 'out')
const [name, engine = 'lite', topN = '40'] = process.argv.slice(2)
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.ttf': 'font/ttf' }
const srv = createServer((q, r) => { const p = resolve(out, '.' + q.url.split('?')[0]); if (!existsSync(p)) { r.writeHead(404).end(); return } r.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }).end(readFileSync(p)) })
await new Promise(r => srv.listen(0, '127.0.0.1', r))
const browser = await chromium.launch({ channel: 'chrome' })
const ctx = await browser.newContext({ viewport: { width: 1000, height: 600 } }); const page = await ctx.newPage()
const cdp = await ctx.newCDPSession(page); await cdp.send('Performance.enable')
let mark = 0; const task = async () => (await cdp.send('Performance.getMetrics')).metrics.find(m => m.name === 'TaskDuration').value * 1000
await page.exposeFunction('__cpu', async l => { if (l === 'start') { mark = await task(); return 0 } return (await task()) - mark })
page.on('pageerror', e => console.log('pageerror', String(e).slice(0, 200)))
await page.goto(`http://127.0.0.1:${srv.address().port}/${engine}.html`); await page.waitForFunction(() => window.__S)
page.on('console', m => { if (m.text().startsWith('SYNC')) console.log(m.text()) })
const N = Number(process.env.N || 500000), engine2 = engine
await page.evaluate(async n => {
    const raf2 = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
    window.__pre = async () => {
        const text = window.__genTs ? window.__genTs(n) : Array.from({ length: n }, (_, i) => i % 8 === 0 ? `export function task${i}(input: number): number {` : i % 8 === 7 ? '}' : `  const base = input * ${i} + ${i % 97}`).join('\n')
        const ed = monaco.editor.create(document.getElementById('e'), { language: 'typescript', automaticLayout: false, minimap: { enabled: true }, scrollBeyondLastLine: true, fontSize: 14 }); ed.layout(); await raf2()
        const model = monaco.editor.createModel(text, 'typescript')
        window.__ed = ed; window.__model = model
    }
    window.__go = async () => { const t0 = performance.now(); window.__ed.setModel(window.__model); const t1 = performance.now(); if (window.__syncOnly) return; await new Promise(r => requestAnimationFrame(r)); const t2 = performance.now(); await new Promise(r => requestAnimationFrame(r)); const t3 = performance.now(); console.log('SYNC', (t1 - t0).toFixed(1), 'raf1', (t2 - t1).toFixed(1), 'raf2', (t3 - t2).toFixed(1)) }
}, N)
await page.evaluate(() => window.__pre()); if (process.env.SYNC_ONLY) await page.evaluate(() => { window.__syncOnly = true })
await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 100 }); await cdp.send('Profiler.start')
await page.evaluate(() => window.__go())
const { profile } = await cdp.send('Profiler.stop')
const byId = new Map(profile.nodes.map(n => [n.id, n])); const self = new Map()
const dt = profile.timeDeltas; profile.samples.forEach((id, i) => self.set(id, (self.get(id) || 0) + (dt[i] || 0)))
const parent = new Map(); for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id)
const label = id => { const cf = byId.get(id).callFrame; return `${cf.functionName || '(anon)'}@${cf.url.split('/').pop()}:${cf.lineNumber + 1}` }
const stacks = new Map(); let total = 0
for (const [id, v] of self) { total += v; const chain = []; let c = id; for (let i = 0; i < 9 && c; i++) { chain.push(label(c)); c = parent.get(c) } const k = chain.join(' < '); stacks.set(k, (stacks.get(k) || 0) + v) }
console.log('total ms', (total / 1000).toFixed(0))
;[...stacks.entries()].sort((a, b) => b[1] - a[1]).slice(0, Number(process.env.STACKS || 14)).forEach(([k, v]) => console.log((v / 1000).toFixed(1).padStart(8) + ' ms  ' + k.slice(0, 300)))
await browser.close(); srv.close()
