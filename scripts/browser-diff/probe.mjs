// 临时探针:node probe.mjs '<create-cfg JSON>' '<页面里跑的 async 代码,可用 editor/monaco/H>' —— 在真 Monaco 和 lite 上各跑一遍并并排打印
import { serve, launch, openBoth } from './lib.mjs'
const [cfg, code] = [JSON.parse(process.argv[2] || '{}'), process.argv[3]]
const { srv, base } = await serve(); const browser = await launch()
try {
    const both = await openBoth(browser, base); const out = {}
    for (const k of ['monaco', 'lite']) {
        await both[k].page.evaluate(c => H.create(c), cfg); await both[k].page.evaluate(() => H.focus())
        out[k] = await both[k].page.evaluate(c => H.exec(c), code)
    }
    console.log('monaco', JSON.stringify(out.monaco)); console.log('lite  ', JSON.stringify(out.lite))
} finally { await browser.close(); srv.close() }
