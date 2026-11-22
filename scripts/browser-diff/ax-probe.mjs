// AX 树探针:node ax-probe.mjs <状态名> 。两边各取一次 Accessibility.getFullAXTree,只打印读屏会看到的节点(去掉 generic/StaticText/InlineTextBox)。
import { serve, launch, openBoth } from './lib.mjs'
import { STATES, axTree } from './ax-states.mjs'
const names = process.argv.slice(2).filter(a => !a.startsWith('--'))
const { srv, base } = await serve()
const browser = await launch()
const both = await openBoth(browser, base)
for (const name of names.length ? names : Object.keys(STATES)) {
  const st = STATES[name]
  console.log(`\n######## ${name}`)
  for (const kind of ['monaco', 'lite']) {
    const k = both[kind]
    await k.page.evaluate(c => H.create(c), st.create ?? { value: 'line one\nline two\nline three' })
    await k.page.evaluate(() => H.focus())
    for (const s of st.steps ?? []) {
      if (s.eval) await k.page.evaluate(code => H.exec(code), s.eval)
      if (s.keys) { for (const key of s.keys) await k.page.keyboard.press(key); await k.page.evaluate(() => H.settle(2)) }
      if (s.type) { await k.page.keyboard.type(s.type); await k.page.evaluate(() => H.settle(2)) }
      if (s.wait) await new Promise(r => setTimeout(r, s.wait))
    }
    await k.page.evaluate(() => H.settle(2))
    console.log(`== ${kind}`)
    console.log((await axTree(k)).join('\n'))
  }
}
await browser.close(); srv.close()
