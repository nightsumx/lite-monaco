import { serve, launch, openBoth } from './lib.mjs'
const lines = (n, f) => Array.from({ length: n }, (_, i) => f(i + 1)).join('\n')
const { srv, base } = await serve(); const browser = await launch()
try {
  const both = await openBoth(browser, base)
  for (const k of ['monaco','lite']) {
    const p = both[k].page
    await p.evaluate(c => H.create(c), { value: lines(60, i => 'line ' + i) })
    await p.evaluate(() => { H.editor.createDecorationsCollection([{ range: new monacoAPI.Range(2,1,3,1), options: { isWholeLine: true, className: 'd-whole' } }]) ; })
    await p.evaluate(() => H.settle(2))
    console.log(k, JSON.stringify(await p.evaluate(() => {
      const r = e => { const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)] }
      const host = document.getElementById('editor-container')
      const d = [...document.querySelectorAll('.d-whole')].map(e => [e.className, r(e)])
      const sc = document.querySelector('.cm-scroller, .monaco-scrollable-element.editor-scrollable')
      const vs = document.querySelector('.scrollbar.vertical, .cm-vscroll, [class*=vscroll], [class*=scrollbar][class*=vertical]')
      return { host: r(host), d, sc: sc && [sc.className, r(sc)], vs: vs && [vs.className, r(vs)] }
    })))
  }
} finally { await browser.close(); srv.close() }
