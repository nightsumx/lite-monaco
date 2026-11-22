import { serve, launch, openBoth } from './lib.mjs'
const lines = (n, f) => Array.from({ length: n }, (_, i) => f(i + 1)).join('\n')
const { srv, base } = await serve(); const browser = await launch()
try {
  const both = await openBoth(browser, base)
  for (const k of ['monaco','lite']) {
    const p = both[k].page
    await p.evaluate(c => H.create(c), { value: lines(40, i => 'line ' + i + ' ' + 'x'.repeat(i * 3)), options: { fontFamily: 'Georgia, serif' } })
    console.log(k, JSON.stringify(await p.evaluate(() => { const E = monacoAPI.editor.EditorOption; const f = H.editor.getOption(E.fontInfo); return { mono: f.isMonospace, fam: f.fontFamily, cw: f.typicalHalfwidthCharacterWidth, sw: H.editor.getScrollWidth(), cw2: H.editor.getContentWidth() } })))
  }
} finally { await browser.close(); srv.close() }
