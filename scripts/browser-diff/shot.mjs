// node shot.mjs '<cfg JSON>' <out前缀> ['<页面里先跑的代码>']:两边各截一张编辑器图到 /tmp/<out>-monaco.png / -lite.png
import { serve, launch, openBoth } from './lib.mjs'
const [cfg, name, code] = [JSON.parse(process.argv[2] || '{}'), process.argv[3] || 'shot', process.argv[4]]
const { srv, base } = await serve(); const browser = await launch()
try {
    const both = await openBoth(browser, base)
    for (const k of ['monaco', 'lite']) {
        const p = both[k].page
        await p.evaluate(c => H.create(c), { height: 120, width: 700, ...cfg }); await p.evaluate(() => H.focus())
        if (code) await p.evaluate(c => H.exec(c), code)
        await p.evaluate(() => H.settle(3)); await new Promise(r => setTimeout(r, 900))
        await p.locator('#editor-container').screenshot({ path: `/tmp/${name}-${k}.png` })
    }
} finally { await browser.close(); srv.close() }
