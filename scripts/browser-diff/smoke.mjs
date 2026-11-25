// monaco-editor test/smoke/smoke.test.ts 的思路,跑在 lite-monaco(和真 Monaco 对照)上:node smoke.mjs
import { serve, launch, openBoth, LITE_KINDS, PACKS } from './lib.mjs'
const { srv, base } = await serve(); const b = await launch(); const both = await openBoth(b, base); for (const k of LITE_KINDS) both[k].page.__kind = 'lite'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const waitSel = async (p, sel, t = 8000) => {
    // lite 的类名带 cm- 前缀(.cm-diagnostic-warning / .cm-diagnostic-error,链接 .cm-link),两边各取自己的
    if (p.__kind === 'lite') sel = sel.replace('.squiggly-warning', '.cm-diagnostic-warning').replace('.squiggly-error', '.cm-diagnostic-error').replace('.detected-link', '.cm-link, .detected-link')
    try { await p.waitForSelector(sel, { timeout: t, state: 'attached' }); return true } catch { return false } }
const cases = {
    plaintext: async p => { await p.evaluate(() => H.create({ value: 'hello world', language: 'plaintext' })); await p.evaluate(() => { editor.setPosition({ lineNumber: 1, column: 12 }); editor.trigger(null, 'type', { text: '\nhttps://www.microsoft.com' }) }).catch(() => p.evaluate(() => H.exec("editor.setPosition({lineNumber:1,column:12}); editor.trigger(null,'type',{text:'\\nhttps://www.microsoft.com'})"))); return waitSel(p, '.detected-link') },
    css: async p => { await p.evaluate(() => H.create({ value: '.sel1 { background: red; }\n.sel2 {}', language: 'css' })); return waitSel(p, '.squiggly-warning') },
    html: async p => { await p.evaluate(() => H.create({ value: '<title>hi</title>', language: 'html' })); for (let i = 0; i < 2; i++) { await p.evaluate(() => H.exec("editor.focus(); editor.setPosition({lineNumber:1,column:3})")); await p.keyboard.press('F1'); await p.keyboard.type('Show Hover'); await p.keyboard.press('Enter'); if (await waitSel(p, "text=The title element represents the document's title or name", 5000)) return true } return false },
    json: async p => { await p.evaluate(() => H.create({ value: '{}', language: 'json' })); for (let i = 0; i < 2; i++) { await p.evaluate(() => H.exec("editor.focus(); editor.setPosition({lineNumber:1,column:2}); editor.trigger(null,'editor.action.triggerSuggest')")); if (await waitSel(p, 'text=$schema', 5000)) return true } return false },
    typescript: async p => { await p.evaluate(() => H.create({ value: 'window.add', language: 'typescript' })); if (!await waitSel(p, '.squiggly-error', 15000)) return false; await p.evaluate(() => H.exec("editor.focus(); editor.setPosition({lineNumber:1,column:11}); editor.trigger(null,'editor.action.triggerSuggest')")); return waitSel(p, 'text=addEventListener', 8000) },
}
const filter = process.argv[2]
for (const [name, fn] of Object.entries(cases)) {
    if (filter && !name.includes(filter)) continue
    const row = [], got = {}
    for (const k of ['monaco', ...LITE_KINDS]) {
        let ok = false, err = ''
        try { ok = await fn(both[k].page) } catch (e) { err = String(e.message).split('\n')[0].slice(0, 80) }
        got[k] = ok
        row.push(`${k}:${ok ? 'PASS' : 'FAIL' + (err ? ' ' + err : '')}`)
    }
    // 装出来的包和源码结果不同 = 打包把这门语言弄坏(或弄好)了
    const packOff = PACKS.filter(pk => got[pk] !== got.lite)
    if (packOff.length) process.exitCode = 1
    console.log(name.padEnd(11), row.join('  '), packOff.length ? `  ✗ ${packOff.join(',')} ≠ 源码` : '')
}
await b.close(); srv.close()
