// 在 lite-dev 页面里执行一段脚本(argv[2] 是文件,导出 async function(page 内 window)),打印返回
import { chromium } from '../browser-diff/node_modules/playwright-core/index.mjs'
import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, extname } from 'node:path'
const out = resolve(dirname(fileURLToPath(import.meta.url)), process.env.PERF_OUT || 'out')
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.ttf': 'font/ttf' }
const srv = createServer((q, r) => { const p = resolve(out, '.' + q.url.split('?')[0]); if (!existsSync(p)) { r.writeHead(404).end(); return } r.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }).end(readFileSync(p)) })
await new Promise(r => srv.listen(0, '127.0.0.1', r))
const browser = await chromium.launch({ channel: 'chrome' })
const ctx = await browser.newContext({ viewport: { width: 1000, height: 600 } }); const page = await ctx.newPage()
let mark = 0
page.on('console', m => console.log('[page]', m.text().slice(0, 300))); page.on('pageerror', e => console.log('pageerror', String(e).slice(0, 300)))
await page.exposeFunction('__cpu', async () => 0)
await page.goto(`http://127.0.0.1:${srv.address().port}/${process.argv[3] || 'lite-dev'}.html`); await page.waitForFunction(() => window.__S)
const code = readFileSync(process.argv[2], 'utf8')
console.log(JSON.stringify(await page.evaluate(code)))
await browser.close(); srv.close()
