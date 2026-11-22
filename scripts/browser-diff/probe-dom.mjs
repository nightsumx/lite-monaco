import { serve, launch, openBoth } from './lib.mjs'
const { srv, base } = await serve(); const browser = await launch()
try {
  const both = await openBoth(browser, base)
  const p = both.lite.page
  await p.evaluate(c => H.create(c), { value: Array.from({length:60},(_, i)=>'line '+(i+1)).join('\n') })
  console.log(JSON.stringify(await p.evaluate(() => {
    const out = []
    const r = e => { const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)] }
    const walk = (e, d) => { if (d > 3) return; for (const c of e.children) { out.push('  '.repeat(d) + c.tagName + '.' + String(c.className).slice(0, 50) + ' ' + JSON.stringify(r(c)) + ' ' + (c.style.cssText||'').slice(0, 80)); if (!/cm-content|cm-line/.test(c.className)) walk(c, d + 1) } }
    walk(document.querySelector('.cm-editor'), 0)
    return out
  }), null, 1))
} finally { await browser.close(); srv.close() }
