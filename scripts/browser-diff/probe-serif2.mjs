import { serve, launch, openBoth } from './lib.mjs'
const lines = (n, f) => Array.from({ length: n }, (_, i) => f(i + 1)).join('\n')
const { srv, base } = await serve(); const browser = await launch()
try {
  const both = await openBoth(browser, base)
  const p = both.lite.page
  await p.evaluate(c => H.create(c), { value: lines(40, i => 'line ' + i + ' ' + 'x'.repeat(i * 3)), options: { fontFamily: 'Georgia, serif' } })
  console.log(JSON.stringify(await p.evaluate(() => { const out = []; for (const el of document.querySelectorAll('.cm-line')) { const r = document.createRange(); r.selectNodeContents(el); out.push(Math.round(r.getBoundingClientRect().width)) } return { out, ff: getComputedStyle(document.querySelector('.cm-content')).fontFamily, sw: H.editor.getScrollWidth() } })))
} finally { await browser.close(); srv.close() }
