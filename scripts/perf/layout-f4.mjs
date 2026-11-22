// F4:场景期间的布局/样式重算次数与耗时(CDP Performance.getMetrics 差值):node layout-f4.mjs <scenario> [engine]
import { chromium } from '../browser-diff/node_modules/playwright-core/index.mjs'
import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, extname } from 'node:path'
const out = resolve(dirname(fileURLToPath(import.meta.url)), process.env.PERF_OUT || 'out')
const [name, engine = 'lite'] = process.argv.slice(2)
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.ttf': 'font/ttf' }
const srv = createServer((q, r) => { const p = resolve(out, '.' + q.url.split('?')[0]); if (!existsSync(p)) { r.writeHead(404).end(); return } r.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }).end(readFileSync(p)) })
await new Promise(r => srv.listen(0, '127.0.0.1', r))
const browser = await chromium.launch({ channel: 'chrome' })
const ctx = await browser.newContext({ viewport: { width: 1000, height: 600 } }); const page = await ctx.newPage()
const cdp = await ctx.newCDPSession(page); await cdp.send('Performance.enable')
const m = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x => [x.name, x.value]))
let mark = 0; const task = async () => (await m()).TaskDuration * 1000
await page.exposeFunction('__cpu', async l => { if (l === 'start') { mark = await task(); return 0 } return (await task()) - mark })
await page.goto(`http://127.0.0.1:${srv.address().port}/${engine}.html`); await page.waitForFunction(() => window.__S)
await page.addInitScript('window.__OPTS=' + JSON.stringify(process.env.OPTS || '{}')); await page.reload(); await page.waitForFunction(() => window.__S)
const a = await m()
name.endsWith('.js') ? await page.evaluate(readFileSync(name, 'utf8')) : await page.evaluate(n => window.__S[n](), name)
const b = await m()
const d = k => (b[k] - a[k])
console.log(engine.padEnd(7), 'layouts', d('LayoutCount'), 'layoutMs', (d('LayoutDuration') * 1000).toFixed(0), 'recalcs', d('RecalcStyleCount'), 'recalcMs', (d('RecalcStyleDuration') * 1000).toFixed(0), 'taskMs', (d('TaskDuration') * 1000).toFixed(0), 'scriptMs', (d('ScriptDuration') * 1000).toFixed(0))
await browser.close(); srv.close()
