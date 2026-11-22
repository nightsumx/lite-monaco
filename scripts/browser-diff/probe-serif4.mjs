import { serve, launch, openBoth } from './lib.mjs'
const lines = (n, f) => Array.from({ length: n }, (_, i) => f(i + 1)).join('\n')
const { srv, base } = await serve(); const browser = await launch()
try {
  const both = await openBoth(browser, base)
  const p = both.lite.page
  await p.evaluate(c => H.create(c), { value: lines(40, i => 'line ' + i + ' ' + 'x'.repeat(i * 3)), options: { fontFamily: 'Georgia, serif' } })
  console.log(JSON.stringify(await p.evaluate(async () => { await new Promise(r => setTimeout(r, 500)); const e = H.editor; return { lw: e.introspect().linewidth, mono: e.fontInfo().isMonospace, t: e.fontInfo().typicalHalfwidthCharacterWidth, cw: e.oracle?.charWidth, sbc: e.scrollBeyondLastColumn } })))
} finally { await browser.close(); srv.close() }
