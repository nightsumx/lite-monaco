import { serve, launch, openBoth } from './lib.mjs'
const { srv, base } = await serve(); const browser = await launch()
try {
  const both = await openBoth(browser, base)
  for (const k of ['monaco','lite']) {
    const p = both[k].page
    await p.evaluate(c => H.create(c), { value: Array.from({length:60},(_, i)=>'line '+(i+1)).join('\n'), theme: 'vs-dark' })
    await p.evaluate(() => { const s = document.createElement('style'); s.textContent = '.d-whole{background:#2a6}'; document.head.appendChild(s); H.editor.createDecorationsCollection([{ range: new monacoAPI.Range(2,1,4,1), options: { isWholeLine: true, className: 'd-whole' } }]) })
    await p.evaluate(() => H.settle(2))
    await p.screenshot({ path: `/tmp/whole-${k}.png`, clip: { x: 640, y: 0, width: 160, height: 120 } })
  }
} finally { await browser.close(); srv.close() }
