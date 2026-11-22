// 静态服务 + 无头 Chrome(不抢焦点:headless、不 bringToFront、结束时关掉自己起的浏览器)
import { chromium, firefox, webkit } from 'playwright-core'
import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, extname } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.ttf': 'font/ttf', '.map': 'application/json' }

export function serve() {
    const srv = createServer((req, res) => {
        const p = resolve(here, 'out', '.' + decodeURIComponent(new URL(req.url, 'http://x').pathname))
        if (!p.startsWith(resolve(here, 'out')) || !existsSync(p)) { res.writeHead(404).end(); return }
        res.writeHead(200, { 'content-type': MIME[extname(p)] ?? 'application/octet-stream' }).end(readFileSync(p))
    })
    return new Promise(r => srv.listen(0, '127.0.0.1', () => r({ srv, base: `http://127.0.0.1:${srv.address().port}` })))
}

/** 引擎:ENGINE=firefox|webkit 在对应无头浏览器里跑(默认 chromium=系统 Chrome)。只有 Chromium 有 CDP(IME 组字、AX 树) */
export const ENGINE = process.env.ENGINE || 'chromium'
export async function launch() {
    if (ENGINE === 'firefox') return firefox.launch({ headless: true })
    if (ENGINE === 'webkit') return webkit.launch({ headless: true })
    return chromium.launch({ channel: 'chrome', args: ['--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--font-render-hinting=none'] })
}

/** 每个实现一个 page,返回 {monaco, lite} */
export async function openBoth(browser, base) {
    const out = {}
    for (const kind of ['monaco', 'lite']) {
        const dpr = Number(process.env.DPR || 1)
        const ctxOpts = { viewport: { width: 1000, height: 600 }, deviceScaleFactor: dpr }
        if (ENGINE === 'chromium' && !process.env.NOPERM) ctxOpts.permissions = ['clipboard-read', 'clipboard-write']
        if (process.env.TOUCH) { ctxOpts.hasTouch = true; ctxOpts.isMobile = process.env.TOUCH === 'mobile' }
        const ctx = await browser.newContext(ctxOpts)
        const page = await ctx.newPage()
        const errs = []
        page.on('pageerror', e => errs.push(String(e)))
        page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()) })
        await page.goto(`${base}/${kind}.html`)
        await page.waitForFunction(() => !!window.H, null, { timeout: 30000 })
        out[kind] = { page, ctx, errs, cdp: ENGINE === 'chromium' ? await ctx.newCDPSession(page) : null }
    }
    return out
}
