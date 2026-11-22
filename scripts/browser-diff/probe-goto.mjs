import { serve, launch, openBoth } from './lib.mjs'
const lines = (n, f) => Array.from({ length: n }, (_, i) => f(i + 1)).join('\n')
const { srv, base } = await serve(); const browser = await launch()
try {
  const both = await openBoth(browser, base)
  for (const k of ['monaco','lite']) {
    const p = both[k].page
    await p.evaluate(c => H.create(c), { value: lines(30, i => 'l' + i) })
    const g = () => p.evaluate(() => ({ sw: H.editor.getScrollWidth(), cw: H.editor.getContentWidth(), top: H.editor.getScrollTop(), vr: JSON.stringify(H.editor.getVisibleRanges().map(r => [r.startLineNumber, r.endLineNumber])) }))
    const out = [['init', await g()]]
    await p.evaluate(() => H.focus())
    await p.keyboard.press('Control+g'); await p.evaluate(() => H.settle(2)); out.push(['dialog', await g()])
    await p.keyboard.type('12'); await p.evaluate(() => H.settle(2)); out.push(['typed', await g()])
    await p.keyboard.press('Enter'); await p.evaluate(() => H.settle(3)); out.push(['enter', await g()])
    console.log(k, JSON.stringify(out))
  }
} finally { await browser.close(); srv.close() }
