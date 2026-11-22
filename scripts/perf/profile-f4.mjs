// F4 剖析:node profile-f4.mjs <scenario> [engine=lite-dev] [topN] [--callers=fnName]
import { chromium } from '../browser-diff/node_modules/playwright-core/index.mjs'
import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, extname } from 'node:path'
const out = resolve(dirname(fileURLToPath(import.meta.url)), process.env.PERF_OUT || 'out')
const args = process.argv.slice(2).filter(a => !a.startsWith('--'))
const callers = (process.argv.find(a => a.startsWith('--callers=')) || '').split('=')[1]
const [name, engine = 'lite-dev', topN = '30'] = args
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.ttf': 'font/ttf' }
const srv = createServer((q, r) => { const p = resolve(out, '.' + q.url.split('?')[0]); if (!existsSync(p)) { r.writeHead(404).end(); return } r.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }).end(readFileSync(p)) })
await new Promise(r => srv.listen(0, '127.0.0.1', r))
const browser = await chromium.launch({ channel: 'chrome' })
const ctx = await browser.newContext({ viewport: { width: 1000, height: 600 } }); const page = await ctx.newPage()
const cdp = await ctx.newCDPSession(page); await cdp.send('Performance.enable')
let mark = 0; const task = async () => (await cdp.send('Performance.getMetrics')).metrics.find(m => m.name === 'TaskDuration').value * 1000
await page.exposeFunction('__cpu', async l => { if (l === 'start') { mark = await task(); return 0 } return (await task()) - mark })
page.on('pageerror', e => console.log('pageerror', String(e).slice(0, 200)))
if (process.env.PRE) await page.addInitScript(process.env.PRE)
await page.goto(`http://127.0.0.1:${srv.address().port}/${engine}.html`); await page.waitForFunction(() => window.__S)
await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 100 }); await cdp.send('Profiler.start')
const res = name.endsWith('.js') ? await page.evaluate(readFileSync(name, 'utf8')) : await page.evaluate(n => window.__S[n](), name)
const { profile } = await cdp.send('Profiler.stop')
console.log(JSON.stringify(res))
const byId = new Map(profile.nodes.map(n => [n.id, n])); const parent = new Map()
for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id)
const lab = id => { const cf = byId.get(id).callFrame; return `${cf.functionName || '(anon)'} ${cf.url.split('/').pop()}:${cf.lineNumber + 1}` }
const self = new Map(); const dt = profile.timeDeltas; profile.samples.forEach((id, i) => self.set(id, (self.get(id) || 0) + (dt[i] || 0)))
const agg = new Map(), incl = new Map(); let total = 0; const st = new Map()
for (const [id, t] of self) {
    const k = lab(id); agg.set(k, (agg.get(k) || 0) + t); total += t
    const seen = new Set(); for (let c = id; c; c = parent.get(c)) { const l = lab(c); if (!seen.has(l)) { seen.add(l); incl.set(l, (incl.get(l) || 0) + t) } }
    if (callers && byId.get(id).callFrame.functionName === callers) { const ch = []; let c = id; for (let i = 0; i < 6 && c; i++) { ch.push(lab(c)); c = parent.get(c) } const key = ch.slice(1).join(' < '); st.set(key, (st.get(key) || 0) + t) }
}
console.log('total ms', (total / 1000).toFixed(0)); console.log('--- self')
;[...agg].sort((a, b) => b[1] - a[1]).slice(0, Number(topN)).forEach(([k, t]) => console.log((t / 1000).toFixed(1).padStart(8), k))
console.log('--- inclusive')
;[...incl].sort((a, b) => b[1] - a[1]).slice(0, Number(topN)).forEach(([k, t]) => console.log((t / 1000).toFixed(1).padStart(8), k))
if (callers) { console.log('--- callers of', callers); [...st].sort((a, b) => b[1] - a[1]).slice(0, 12).forEach(([k, t]) => console.log((t / 1000).toFixed(1).padStart(8), k)) }
await browser.close(); srv.close()
