// 堆剖析(存活对象按分配点聚合):node scripts/perf/heapprofile.mjs <scenario> [engine=lite] [top=25]
import { chromium } from '../browser-diff/node_modules/playwright-core/index.mjs'
import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, extname } from 'node:path'
const out = resolve(dirname(fileURLToPath(import.meta.url)), process.env.PERF_OUT || 'out')
const [name, engine = 'lite', top = '25'] = process.argv.slice(2)
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.ttf': 'font/ttf' }
const srv = createServer((q, r) => { const p = resolve(out, '.' + q.url.split('?')[0]); if (!existsSync(p)) { r.writeHead(404).end(); return } r.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }).end(readFileSync(p)) })
await new Promise(r => srv.listen(0, '127.0.0.1', r))
const browser = await chromium.launch({ channel: 'chrome', args: ['--js-flags=--expose-gc'] })
const ctx = await browser.newContext({ viewport: { width: 1000, height: 600 } }); const page = await ctx.newPage()
const cdp = await ctx.newCDPSession(page)
await page.exposeFunction('__cpu', async () => 0)
await page.goto(`http://127.0.0.1:${srv.address().port}/${engine}.html`); await page.waitForFunction(() => window.__S)
await cdp.send('HeapProfiler.enable'); await cdp.send('HeapProfiler.startSampling', { samplingInterval: 8192 })
await page.evaluate(n => window.__S[n](), name)
await cdp.send('HeapProfiler.collectGarbage'); await cdp.send('HeapProfiler.collectGarbage')
const { profile } = await cdp.send('HeapProfiler.stopSampling')
const rows = []
const walk = (n, path) => { const cf = n.callFrame; const here = `${cf.functionName || '(anon)'}:${cf.lineNumber + 1}`; const p = [...path, here].slice(-5); if (n.selfSize) rows.push([n.selfSize, p.reverse().join(' < ')]); for (const c of n.children) walk(c, path.concat(here)) }
walk(profile.head, [])
const m = new Map(); for (const [s, k] of rows) m.set(k, (m.get(k) || 0) + s)
const total = rows.reduce((a, r) => a + r[0], 0); console.log('live total MB', (total / 1e6).toFixed(1))
;[...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, Number(top)).forEach(([k, v]) => console.log((v / 1e6).toFixed(1).padStart(7), 'MB', k))
await browser.close(); srv.close()
