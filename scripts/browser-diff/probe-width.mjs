// 探针:不折行时 scrollWidth/contentWidth 随「渲染过哪些行」的变化,Monaco vs lite。node probe-width.mjs
import { serve, launch, openBoth } from './lib.mjs'
const lines = (n, f) => Array.from({ length: n }, (_, i) => f(i + 1)).join('\n')
const CASES = [
    ['40 行递增(默认)', { value: lines(40, i => 'line ' + i + ' ' + 'x'.repeat(i * 3)) }],
    ['40 行 tabSize-8', { value: 'a\tb  c   \n\t\tindented\t\n    spaces  trailing   \n nbsp​zwsp\u0001ctl\n', options: { tabSize: 8 } }],
    ['40 行 fontSize-8', { value: lines(40, i => 'line ' + i + ' ' + 'x'.repeat(i * 3)), options: { fontSize: 8, lineHeight: 0 } }],
    ['40 行 fontSize-30', { value: lines(40, i => 'line ' + i + ' ' + 'x'.repeat(i * 3)), options: { fontSize: 30, lineHeight: 0 } }],
    ['3000 行,最宽在末尾', { value: lines(3000, i => 'l' + i + (i === 2900 ? ' ' + 'y'.repeat(500) : '')) }],
    ['3000 行,最宽在中间 1500', { value: lines(3000, i => 'l' + i + (i === 1500 ? ' ' + 'y'.repeat(500) : '')) }],
]
const { srv, base } = await serve()
const browser = await launch()
try {
    const both = await openBoth(browser, base)
    const snap = k => both[k].page.evaluate(() => { const e = H.editor; return { sw: e.getScrollWidth(), cw: e.getContentWidth(), st: Math.round(e.getScrollTop()), vr: JSON.stringify(e.getVisibleRanges().map(r => [r.startLineNumber, r.endLineNumber])) } })
    for (const [name, cfg] of CASES) {
        console.log('\n## ' + name)
        const rows = {}
        for (const k of ['monaco', 'lite']) {
            const p = both[k].page
            await p.evaluate(c => H.create(c), cfg)
            const o = []
            o.push(['init', await snap(k)])
            for (const top of [0, 400, 4000, 30000, 49000, 0]) {
                await p.evaluate(t => { H.editor.setScrollTop(t) }, top); await p.evaluate(() => H.settle(3))
                o.push(['top=' + top, await snap(k)])
            }
            rows[k] = o
        }
        for (let i = 0; i < rows.monaco.length; i++) {
            const m = rows.monaco[i][1], l = rows.lite[i][1]
            console.log(rows.monaco[i][0].padEnd(10), 'monaco sw/cw', m.sw, m.cw, m.vr, ' | lite', l.sw, l.cw, l.vr, m.sw === l.sw && m.cw === l.cw ? '' : '  ← DIFF')
        }
    }
} finally { await browser.close(); srv.close() }
