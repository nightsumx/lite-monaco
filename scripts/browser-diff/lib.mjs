// 静态服务 + 无头 Chrome(不抢焦点:headless、不 bringToFront、结束时关掉自己起的浏览器)
import { chromium, firefox, webkit } from 'playwright-core'
import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, extname } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2',
    '.wasm': 'application/wasm', '.json': 'application/json', '.svg': 'image/svg+xml', '.map': 'application/json' }

/**
 * 装出来的包:PACK=vite,esbuild 时,lite 之外再开 pack-vite、pack-esbuild 页(out/pack-<名>/,pack.mjs 打的:
 * npm pack 出的 tarball 装进 monorepo 外的干净目录,用户的打包器生产构建)。它们和 lite(源码)同场景同时跑,结果应当一模一样。
 */
export const PACKS = (process.env.PACK ?? '').split(',').map(s => s.trim()).filter(Boolean).map(s => 'pack-' + s)
/** lite 一侧的全部页:源码 + 每种装出来的包 */
export const LITE_KINDS = ['lite', ...PACKS]
// 页面地址:monaco、lite 在 out 下,pack-<名> 在 out/pack-<名> 下(同名页)
export const pageUrl = (base, kind, page) => kind.startsWith('pack-') ? `${base}/${kind}/${page}.html` : `${base}/${page}.html`

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

/** 每个实现一个 page,返回 {monaco, lite, pack-*…} */
export async function openBoth(browser, base) {
    const out = {}
    for (const kind of ['monaco', ...LITE_KINDS]) out[kind] = await openKind(browser, base, kind)
    return out
}

/** 开一个实现的页(场景把页面搞坏时换一个干净的) */
export async function openKind(browser, base, kind) {
    const dpr = Number(process.env.DPR || 1)
    const ctxOpts = { viewport: { width: 1000, height: 600 }, deviceScaleFactor: dpr }
    if (ENGINE === 'chromium' && !process.env.NOPERM) ctxOpts.permissions = ['clipboard-read', 'clipboard-write']
    if (process.env.TOUCH) { ctxOpts.hasTouch = true; ctxOpts.isMobile = process.env.TOUCH === 'mobile' }
    const ctx = await browser.newContext(ctxOpts)
    const page = await ctx.newPage()
    const errs = []
    page.on('pageerror', e => errs.push(String(e)))
    page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()) })
    await page.goto(pageUrl(base, kind, kind === 'monaco' ? 'monaco' : 'lite'))
    await page.waitForFunction(() => !!window.H, null, { timeout: 30000 })
    return { page, ctx, errs, cdp: ENGINE === 'chromium' ? await ctx.newCDPSession(page) : null }
}

