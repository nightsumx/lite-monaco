// F4 堆账:node heap-f4.mjs <steps.js> [engine=lite]  steps.js 是 async 表达式,可调用 await window.__heap(label) 记一次(先 GC)
import { chromium } from '../browser-diff/node_modules/playwright-core/index.mjs'
import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, extname } from 'node:path'
const out = resolve(dirname(fileURLToPath(import.meta.url)), process.env.PERF_OUT || 'out')
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.ttf': 'font/ttf' }
const srv = createServer((q, r) => { const p = resolve(out, '.' + q.url.split('?')[0]); if (!existsSync(p)) { r.writeHead(404).end(); return } r.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }).end(readFileSync(p)) })
await new Promise(r => srv.listen(0, '127.0.0.1', r))
const browser = await chromium.launch({ channel: 'chrome', args: ['--js-flags=--expose-gc'] })
const ctx = await browser.newContext({ viewport: { width: 1000, height: 600 } }); const page = await ctx.newPage()
const cdp = await ctx.newCDPSession(page)
await page.exposeFunction('__cpu', async () => 0)
await page.exposeFunction('__heap', async l => { await cdp.send('HeapProfiler.collectGarbage'); await cdp.send('HeapProfiler.collectGarbage'); const u = await cdp.send('Runtime.getHeapUsage'); console.log(l.padEnd(28), (u.usedSize / 1e6).toFixed(1), 'MB') })
await page.goto(`http://127.0.0.1:${srv.address().port}/${process.argv[3] || 'lite'}.html`); await page.waitForFunction(() => window.__S)
if (process.env.SAMPLE) { await cdp.send('HeapProfiler.enable'); await cdp.send('HeapProfiler.startSampling', { samplingInterval: 8192 }) }
console.log(JSON.stringify(await page.evaluate(readFileSync(process.argv[2], 'utf8'))).slice(0, 300))
if (process.env.SAMPLE) {
  await cdp.send('HeapProfiler.collectGarbage'); await cdp.send('HeapProfiler.collectGarbage')
  const { profile } = await cdp.send('HeapProfiler.stopSampling'); const rows = []
  const walk = (n, path) => { const cf = n.callFrame; const here = `${cf.functionName || '(anon)'}:${cf.lineNumber + 1}`; const p = [...path, here].slice(-4); if (n.selfSize) rows.push([n.selfSize, [...p].reverse().join(' < ')]); for (const c of n.children) walk(c, path.concat(here)) }
  walk(profile.head, []); const m = new Map(); for (const [sz, k] of rows) m.set(k, (m.get(k) || 0) + sz)
  console.log('live total MB', (rows.reduce((a, r) => a + r[0], 0) / 1e6).toFixed(1))
  ;[...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, Number(process.env.SAMPLE)).forEach(([k, v]) => console.log((v / 1e6).toFixed(1).padStart(7), 'MB', k))
}
await browser.close(); srv.close()
