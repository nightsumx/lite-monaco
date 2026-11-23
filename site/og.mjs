// 截分享图 site/og.png（1200×630）：用 Playwright 的 headless Chromium 画一张和首页同风格的卡片。
// 用法：node site/og.mjs。标语或数字变了就重截。
// playwright-core 装在 scripts/browser-diff 里（跑浏览器差分用的那份），这里借用
import { chromium } from '../scripts/browser-diff/node_modules/playwright-core/index.mjs'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
// 字体以 data URL 嵌进去：setContent 的页面是 about:blank，读不到 file:// 的字体
const font = f => `url(data:font/woff2;base64,${readFileSync(resolve(here, 'fonts', f)).toString('base64')})`
const html = `<!DOCTYPE html><html><head><style>
@font-face { font-family: S; src: ${font('instrument-serif.woff2')}; }
@font-face { font-family: G; src: ${font('geist-400.woff2')}; }
@font-face { font-family: M; src: ${font('geist-mono.woff2')}; }
* { margin: 0; box-sizing: border-box; }
body { width: 1200px; height: 630px; background: #0a0a0a; color: #ece7dd; font-family: G; position: relative; overflow: hidden;
  background-image: linear-gradient(rgba(236,231,221,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(236,231,221,.05) 1px, transparent 1px);
  background-size: 60px 60px; }
.pad { position: absolute; inset: 64px 72px; display: flex; flex-direction: column; }
.mark { font: 500 26px M; display: flex; align-items: center; gap: 14px; }
.caret { width: 4px; height: 30px; background: #ff5a1f; box-shadow: 0 0 18px rgba(255,90,31,.7); }
h1 { font: 400 92px/1.02 S; margin-top: 54px; letter-spacing: -.01em; }
h1 em { font-style: normal; color: #ff5a1f; }
.code { margin-top: 40px; font: 400 26px M; color: #8d887e; }
.code b { color: #ffc799; font-weight: 400; }
.stats { margin-top: auto; display: flex; gap: 0; border-top: 1px solid rgba(236,231,221,.16); }
.stats div { flex: 1; padding-top: 20px; }
.stats dt { font: 400 15px M; color: #5a564f; text-transform: uppercase; letter-spacing: .12em; }
.stats dd { font: 400 40px M; margin-top: 8px; }
.stats small { font-size: 18px; color: #8d887e; margin-left: 6px; }
.tick { position: absolute; width: 22px; height: 22px; }
.tick::before, .tick::after { content: ''; position: absolute; background: #ff5a1f; }
.tick::before { width: 22px; height: 2px; top: 10px; } .tick::after { width: 2px; height: 22px; left: 10px; }
</style></head><body>
<span class="tick" style="top:28px;left:28px"></span><span class="tick" style="top:28px;right:28px"></span>
<span class="tick" style="bottom:28px;left:28px"></span><span class="tick" style="bottom:28px;right:28px"></span>
<div class="pad">
  <div class="mark"><span class="caret"></span>lite-monaco</div>
  <h1>Monaco's feel,<br>at <em>under half</em> the size.</h1>
  <div class="code">import * as monaco from <b>'lite-monaco'</b></div>
  <dl class="stats">
    <div><dt>gzip core</dt><dd>523<small>KB</small></dd></div>
    <div><dt>Monaco unit tests</dt><dd>3279<small>/ 3279</small></dd></div>
    <div><dt>workers to configure</dt><dd>0</dd></div>
  </dl>
</div></body></html>`

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
await page.setContent(html)
await page.evaluate(() => document.fonts.ready)
await page.screenshot({ path: resolve(here, 'og.png') })
await browser.close()
console.log('wrote', resolve(here, 'og.png'))
