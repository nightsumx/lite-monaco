import { serve, launch, openBoth } from './lib.mjs'
const lines = (n, f) => Array.from({ length: n }, (_, i) => f(i + 1)).join('\n')
const { srv, base } = await serve(); const browser = await launch()
const walk = `async () => {
  const raf = () => new Promise(r => requestAnimationFrame(() => r())).then(() => new Promise(r => setTimeout(r, 300)))
  const editor = H.editor
  const sh = editor.getScrollHeight(), vh = editor.getLayoutInfo().height
  for (let t = 0; t < sh; t += Math.max(20, vh - 40)) { editor.setScrollTop(t); await raf(); await raf() }
  editor.setScrollTop(sh); await raf(); await raf()
  editor.setScrollTop(0); await raf(); await raf()
  return { sw: editor.getScrollWidth(), cw: editor.getContentWidth(), vh, sh }
}`
try {
  const both = await openBoth(browser, base)
  for (const k of ['monaco', 'lite']) {
    const p = both[k].page
    await p.evaluate(c => H.create(c), { value: lines(40, i => 'line ' + i + ' ' + 'x'.repeat(i * 3)), options: { fontFamily: 'Georgia, serif' } })
    console.log(k, JSON.stringify(await p.evaluate(`(${walk})()`)))
    console.log(k, JSON.stringify(await p.evaluate(() => { const o = []; for (const el of document.querySelectorAll('.view-line, .cm-line')) { const r = document.createRange(); r.selectNodeContents(el); const t = el.textContent; o.push(t.length + ':' + r.getBoundingClientRect().width.toFixed(1)) } return o })))
    if (k === 'lite') console.log(JSON.stringify(await p.evaluate(() => H.editor.introspect?.().linewidth)))
  }
} finally { await browser.close(); srv.close() }
