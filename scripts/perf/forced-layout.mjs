// 强制布局探针:把读几何的 API(getBoundingClientRect、getClientRects、clientWidth/Height、offsetX、scrollTop/Left/Width/Height)
// 包一层计时,每次调用超过阈值就记下耗时和调用栈(耗时 ≈ 这次读触发的同步排版)。用来回答「一次操作里强制排了几次、谁触发的」。
// 用法:PERF_OUT=out-x node scripts/perf/forced-layout.mjs <step...>  步骤:wrap_on wrap_off selectAll hscroll insert_mid reveal_mid
//       环境变量 LEN(长行字符数,默认 1e6)、MIN(记录阈值 ms,默认 0.5)、ENGINE(lite|monaco)
import { chromium } from '../browser-diff/node_modules/playwright-core/index.mjs'
import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, extname } from 'node:path'
const out = resolve(dirname(fileURLToPath(import.meta.url)), process.env.PERF_OUT || 'out')
const steps = process.argv.slice(2)
const engine = process.env.ENGINE || 'lite', LEN = Number(process.env.LEN || 1e6), MIN = Number(process.env.MIN || 0.5)
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.ttf': 'font/ttf' }
const srv = createServer((q, r) => { const p = resolve(out, '.' + q.url.split('?')[0]); if (!existsSync(p)) { r.writeHead(404).end(); return } r.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }).end(readFileSync(p)) })
await new Promise(r => srv.listen(0, '127.0.0.1', r))
const browser = await chromium.launch({ channel: 'chrome' })
const ctx = await browser.newContext({ viewport: { width: 1000, height: 600 } }); const page = await ctx.newPage()
const cdp = await ctx.newCDPSession(page); await cdp.send('Performance.enable')
const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x => [x.name, x.value]))
page.on('pageerror', e => console.log('pageerror', String(e).slice(0, 300)))
await page.goto(`http://127.0.0.1:${srv.address().port}/${engine}.html`); await page.waitForFunction(() => window.monaco)
await page.evaluate(({ LEN, MIN, DEPTH }) => {
    Error.stackTraceLimit = 60; const log = window.__flog = []
    window.__frec = false
    const wrap = (proto, name, kind) => {
        const d = Object.getOwnPropertyDescriptor(proto, name); if (!d) return
        const orig = kind === 'fn' ? d.value : d.get
        const timed = function (...a) {
            if (!window.__frec) return orig.apply(this, a)
            const t = performance.now(); const r = orig.apply(this, a); const dt = performance.now() - t
            if (dt >= MIN) log.push({ api: name, ms: +dt.toFixed(2), cls: (this.className || this.nodeName || '').toString().slice(0, 40), stack: new Error().stack.split('\n').slice(2, DEPTH).map(s => s.trim().replace(/^at /, '').replace(/\(?https?:\/\/[^/]+\//, '').replace(/\)$/, '')).join(' < ') })
            return r
        }
        Object.defineProperty(proto, name, kind === 'fn' ? { ...d, value: timed } : { ...d, get: timed })
    }
    for (const n of ['getBoundingClientRect', 'getClientRects']) { wrap(Element.prototype, n, 'fn'); wrap(Range.prototype, n, 'fn') }
    for (const n of ['clientWidth', 'clientHeight', 'scrollTop', 'scrollLeft', 'scrollWidth', 'scrollHeight']) wrap(Element.prototype, n, 'get')
    for (const n of ['offsetWidth', 'offsetHeight', 'offsetTop', 'offsetLeft']) wrap(HTMLElement.prototype, n, 'get')
    const el = document.getElementById('e')
    const unit = 'abcdefghij '
    const value = unit.repeat(Math.ceil(LEN / unit.length)).slice(0, LEN)
    window.__ed = monaco.editor.create(el, { value, language: 'typescript', automaticLayout: false, minimap: { enabled: true }, scrollBeyondLastLine: true, fontSize: 14 })
}, { LEN, MIN, DEPTH: Number(process.env.DEPTH || 9) })
await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))
const acts = {
    wrap_on: 'ed.updateOptions({ wordWrap: "on" })',
    wrap_off: 'ed.updateOptions({ wordWrap: "off" })',
    selectAll: 'ed.trigger("kb", "selectAll")',
    collapse: 'ed.setPosition({ lineNumber: 1, column: 1 })',
    reveal_mid: 'ed.setPosition({ lineNumber: 1, column: 500000 }); ed.revealPositionInCenter({ lineNumber: 1, column: 500000 })',
    insert_mid: 'ed.executeEdits("p", [{ range: new monaco.Range(1, 500000, 1, 500000), text: "x" }])',
    hscroll: 'ed.setScrollLeft(ed.getScrollLeft() + 800)',
}
const PROF = (process.env.PROFILE || '').split(',')
for (const s of steps) {
    if (PROF.includes(s)) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 50 }); await cdp.send('Profiler.start') }
    const a = await metrics()
    const res = await page.evaluate(async code => {
        const ed = window.__ed; window.__flog.length = 0; window.__frec = true
        const t = performance.now(); new Function('ed', code)(ed); const sync = performance.now() - t
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
        window.__frec = false
        return { sync: +sync.toFixed(1), frame: +(performance.now() - t).toFixed(1), log: window.__flog.slice() }
    }, acts[s] || s)
    const b = await metrics()
    console.log(`\n== ${s}: sync ${res.sync} ms, to 2nd frame ${res.frame} ms; layouts ${b.LayoutCount - a.LayoutCount} (${((b.LayoutDuration - a.LayoutDuration) * 1000).toFixed(1)} ms), recalc ${b.RecalcStyleCount - a.RecalcStyleCount} (${((b.RecalcStyleDuration - a.RecalcStyleDuration) * 1000).toFixed(1)} ms), task ${((b.TaskDuration - a.TaskDuration) * 1000).toFixed(1)} ms`)
    for (const e of res.log) console.log(`  ${String(e.ms).padStart(7)} ${e.api} [${e.cls}]  ${e.stack}`)
    if (PROF.includes(s)) {
        const { profile } = await cdp.send('Profiler.stop')
        const byId = new Map(profile.nodes.map(n => [n.id, n])), self = new Map()
        profile.samples.forEach((id, i) => self.set(id, (self.get(id) || 0) + (profile.timeDeltas[i] || 0)))
        // 含子调用的总时间(inclusive),按函数聚合;父链去重
        const parent = new Map(); for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id)
        const incl = new Map(), selfAgg = new Map()
        const key = n => `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber + 1}`
        for (const [id, t] of self) {
            const seen = new Set(); let cur = id
            selfAgg.set(key(byId.get(id)), (selfAgg.get(key(byId.get(id))) || 0) + t)
            while (cur != null) { const k = key(byId.get(cur)); if (!seen.has(k)) { seen.add(k); incl.set(k, (incl.get(k) || 0) + t) } cur = parent.get(cur) }
        }
        console.log('  -- inclusive')
        ;[...incl].sort((a, b) => b[1] - a[1]).slice(0, Number(process.env.TOP || 30)).forEach(([k, t]) => console.log('  ' + (t / 1000).toFixed(2).padStart(8), k))
        console.log('  -- self')
        ;[...selfAgg].sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([k, t]) => console.log('  ' + (t / 1000).toFixed(2).padStart(8), k))
    }
}
await browser.close(); srv.close()
