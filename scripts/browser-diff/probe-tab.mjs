import { serve, launch, openBoth } from './lib.mjs'
const { srv, base } = await serve(); const browser = await launch()
try {
  const both = await openBoth(browser, base)
  const v = 'a\tb  c   \n\t\tindented\t\n    spaces  trailing   \n nbsp​zwsp\u0001ctl\n'
  for (const k of ['monaco','lite']) {
    const p = both[k].page
    await p.evaluate(c => H.create(c), { value: v, options: { tabSize: 8 } })
    const r = await p.evaluate(() => {
      const sel = H.__kind === 'monaco' ? '.view-line' : '.cm-line'
      const out = []
      for (const el of document.querySelectorAll(sel)) {
        const rg = document.createRange(); rg.selectNodeContents(el)
        out.push([JSON.stringify(el.textContent), Math.round(rg.getBoundingClientRect().width*100)/100, el.getBoundingClientRect().width, el.firstElementChild?.getBoundingClientRect().width])
      }
      return { out, sw: H.editor.getScrollWidth(), cw: H.editor.getContentWidth(), kind: H.kind }
    })
    console.log(k, JSON.stringify(r, null, 1))
  }
} finally { await browser.close(); srv.close() }
