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
await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 100 }); await cdp.send('Profiler.start')
const res = await page.evaluate(n => window.__S[n](), name)
const { profile } = await cdp.send('Profiler.stop')
console.log(JSON.stringify(res))
const byId = new Map(profile.nodes.map(n => [n.id, n])); const self = new Map()
const dt = profile.timeDeltas; profile.samples.forEach((id, i) => self.set(id, (self.get(id) || 0) + (dt[i] || 0)))
const agg = new Map(); let total = 0
for (const [id, t] of self) { const n = byId.get(id), cf = n.callFrame; const k = `${cf.functionName || '(anon)'} ${cf.url.split('/').pop()}:${cf.lineNumber + 1}:${cf.columnNumber + 1}`; agg.set(k, (agg.get(k) || 0) + t); total += t }
console.log('total ms', (total / 1000).toFixed(0))
;[...agg].sort((a, b) => b[1] - a[1]).slice(0, Number(topN)).forEach(([k, t]) => console.log((t / 1000).toFixed(1).padStart(8), k))
// 自耗时最大的几个调用栈(沿父链向上 8 层),看是谁调的
const parent = new Map(); for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id)
const label = id => { const cf = byId.get(id).callFrame; return `${cf.functionName || '(anon)'}@${cf.url.split('/').pop()}:${cf.lineNumber + 1}` }
const stacks = new Map(); for (const [id, v] of self) { const chain = []; let c = id; for (let i = 0; i < 9 && c; i++) { chain.push(label(c)); c = parent.get(c) } const k = chain.join(' < '); stacks.set(k, (stacks.get(k) || 0) + v) }
console.log('--- stacks'); ;[...stacks.entries()].sort((a, b) => b[1] - a[1]).slice(0, Number(process.env.STACKS || 8)).forEach(([k, v]) => console.log((v / 1000).toFixed(1).padStart(8) + ' ms  ' + k))
// INCL=1:按函数名的包含时间(一个样本对同一函数在栈上出现多次只算一次),看哪一段整体最贵
if (process.env.INCL) {
    const incl = new Map()
    for (const [id, v] of self) { const seen = new Set(); let c = id; while (c) { const cf = byId.get(c).callFrame; const k = `${cf.functionName || '(anon)'} ${cf.url.split('/').pop()}:${cf.lineNumber + 1}`; if (!seen.has(k)) { seen.add(k); incl.set(k, (incl.get(k) || 0) + v) } c = parent.get(c) } }
    console.log('--- inclusive'); ;[...incl].sort((a, b) => b[1] - a[1]).slice(0, Number(process.env.INCL) > 1 ? Number(process.env.INCL) : 60).forEach(([k, v]) => console.log((v / 1000).toFixed(1).padStart(8), k))
}
// UNDER=fnName:fnName(最外层那次)下面直接子调用的包含时间,看它的时间花在哪几块
if (process.env.UNDER) {
    const name = process.env.UNDER, kids = new Map(); let tot = 0
    for (const [id, v] of self) {
        const chain = []; let c = id; while (c) { chain.push(c); c = parent.get(c) }
        const i = chain.findLastIndex(x => byId.get(x).callFrame.functionName === name); if (i < 0) continue
        tot += v; const kid = i > 0 ? label(chain[i - 1]) : '(self)'; kids.set(kid, (kids.get(kid) || 0) + v)
    }
    console.log(`--- under ${name}: ${(tot / 1000).toFixed(1)} ms`); ;[...kids].sort((a, b) => b[1] - a[1]).slice(0, 30).forEach(([k, v]) => console.log((v / 1000).toFixed(1).padStart(8), k))
}
await browser.close(); srv.close()
