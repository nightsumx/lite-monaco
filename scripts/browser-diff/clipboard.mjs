// 系统剪贴板差分(Chromium,grantPermissions clipboard-read/write):真 ⌘C/⌘X/⌘V 走系统剪贴板,
// 读回 text/plain、text/html,再粘到另一处,Monaco 与 lite 两边同场景比对。用法:node clipboard.mjs [过滤]
import { serve, launch, openBoth, ENGINE, LITE_KINDS, PACKS } from './lib.mjs'
const CR = ENGINE === 'chromium' && !process.env.NOPERM // 其余引擎没有 clipboard-read/write 权限名:只跑「⌘C/⌘X → ⌘V 往返」(读不了剪贴板内容本身),要预置剪贴板的 case 跳过
const mod = process.platform === 'darwin' ? 'Meta' : 'Control'
const sleep = ms => new Promise(r => setTimeout(r, ms))

const sel = (l1, c1, l2, c2) => `editor.setSelection(new monaco.Selection(${l1},${c1},${l2},${c2}))`
const read = p => !CR ? Promise.resolve({ skipped: 'no clipboard-read' }) : p.evaluate(async () => {
    const out = {}
    try { out.text = await navigator.clipboard.readText() } catch (e) { out.text = '<err ' + e.message + '>' }
    try {
        const items = await navigator.clipboard.read()
        out.types = items.flatMap(i => i.types).sort()
        const h = items.find(i => i.types.includes('text/html'))
        if (h) {
            const html = await (await h.getType('text/html')).text()
            out.htmlLen = html.length > 0
            // 高亮样式:有没有逐 token 的 color,而不看具体 DOM(两边的 span 层次不同)
            out.htmlHasColor = /color\s*:/i.test(html)
            out.htmlHasMonospace = /monospace|Menlo|Consolas/i.test(html)
            out.htmlTextEquals = (new DOMParser().parseFromString(html, 'text/html').body.textContent || '').replace(/ /g, ' ')
        }
    } catch (e) { out.readErr = e.message }
    return out
})
const setClip = (p, o) => { if (!CR) throw new Error('SKIP no clipboard-write'); return setClip0(p, o) }
const setClip0 = (p, o) => p.evaluate(async o => {
    const parts = {}
    for (const [k, v] of Object.entries(o)) parts[k] = new Blob([v], { type: k })
    await navigator.clipboard.write([new ClipboardItem(parts)])
}, o)

// 每个 case:setup(创建编辑器) → 动作 → 读结果
const cases = {
    'copy-selection': async (p, k) => {
        await p.evaluate(() => H.create({ value: 'alpha beta\ngamma delta', language: 'typescript' })); await p.evaluate(() => H.focus())
        await p.evaluate(`H.exec(${JSON.stringify(sel(1, 7, 2, 6))})`)
        await p.keyboard.press(`${mod}+c`); await sleep(200)
        return { clip: await read(p) }
    },
    'copy-empty-selection-line': async p => {
        await p.evaluate(() => H.create({ value: 'one\ntwo\nthree' })); await p.evaluate(() => H.focus())
        await p.evaluate(`H.exec("editor.setPosition({lineNumber:2,column:2})")`)
        await p.keyboard.press(`${mod}+c`); await sleep(200)
        const clip = await read(p)
        await p.evaluate(`H.exec("editor.setPosition({lineNumber:3,column:3})")`)
        await p.keyboard.press(`${mod}+v`); await sleep(300); await p.evaluate(() => H.settle(2))
        return { clip, value: await p.evaluate(() => ed.getModel().getValue()), sel: await p.evaluate(() => ed.getSelections().map(s => [s.selectionStartLineNumber, s.selectionStartColumn, s.positionLineNumber, s.positionColumn])) }
    },
    'cut-selection': async p => {
        await p.evaluate(() => H.create({ value: 'abcdef\nghijkl' })); await p.evaluate(() => H.focus())
        await p.evaluate(`H.exec(${JSON.stringify(sel(1, 3, 2, 3))})`)
        await p.keyboard.press(`${mod}+x`); await sleep(200)
        return { clip: await read(p), value: await p.evaluate(() => ed.getModel().getValue()) }
    },
    'cut-empty-selection-line': async p => {
        await p.evaluate(() => H.create({ value: 'one\ntwo\nthree' })); await p.evaluate(() => H.focus())
        await p.evaluate(`H.exec("editor.setPosition({lineNumber:2,column:2})")`)
        await p.keyboard.press(`${mod}+x`); await sleep(200)
        return { clip: await read(p), value: await p.evaluate(() => ed.getModel().getValue()), pos: await p.evaluate(() => { const s = ed.getSelection(); return [s.positionLineNumber, s.positionColumn] }) }
    },
    'multicursor-copy': async p => {
        await p.evaluate(() => H.create({ value: 'a1 x\nb2 y\nc3 z' })); await p.evaluate(() => H.focus())
        await p.evaluate(`H.exec("editor.setSelections([new monaco.Selection(1,1,1,3), new monaco.Selection(2,1,2,3), new monaco.Selection(3,1,3,3)])")`)
        await p.keyboard.press(`${mod}+c`); await sleep(200)
        const clip = await read(p)
        // 同样三个光标粘回:每个光标拿到自己那一行
        await p.evaluate(`H.exec("editor.setSelections([new monaco.Selection(1,5,1,5), new monaco.Selection(2,5,2,5), new monaco.Selection(3,5,3,5)])")`)
        await p.keyboard.press(`${mod}+v`); await sleep(300); await p.evaluate(() => H.settle(2))
        return { clip, value: await p.evaluate(() => ed.getModel().getValue()) }
    },
    'multicursor-paste-mismatch': async p => { // 剪贴板 2 行、光标 3 个:整段粘到每个光标
        await p.evaluate(() => H.create({ value: 'x\ny\nz' })); await p.evaluate(() => H.focus())
        await setClip(p, { 'text/plain': 'P\nQ' })
        await p.evaluate(`H.exec("editor.setSelections([new monaco.Selection(1,2,1,2), new monaco.Selection(2,2,2,2), new monaco.Selection(3,2,3,2)])")`)
        await p.keyboard.press(`${mod}+v`); await sleep(300); await p.evaluate(() => H.settle(2))
        return { value: await p.evaluate(() => ed.getModel().getValue()) }
    },
    'paste-crlf': async p => {
        await p.evaluate(() => H.create({ value: '' })); await p.evaluate(() => H.focus())
        await setClip(p, { 'text/plain': 'a\r\nb\r\nc' })
        await p.keyboard.press(`${mod}+v`); await sleep(300); await p.evaluate(() => H.settle(2))
        return { value: await p.evaluate(() => ed.getModel().getValue()), eol: await p.evaluate(() => ed.getModel().getEOL() === '\r\n' ? 'crlf' : 'lf'), lines: await p.evaluate(() => ed.getModel().getLineCount()) }
    },
    'paste-keeps-indent': async p => {
        await p.evaluate(() => H.create({ value: 'function f() {\n    a()\n}', language: 'typescript' })); await p.evaluate(() => H.focus())
        await setClip(p, { 'text/plain': 'if (x) {\n    y()\n}' })
        await p.evaluate(`H.exec("editor.setPosition({lineNumber:2,column:8})")`)
        await p.keyboard.press(`${mod}+v`); await sleep(300); await p.evaluate(() => H.settle(2))
        return { value: await p.evaluate(() => ed.getModel().getValue()) }
    },
    'paste-over-selection': async p => {
        await p.evaluate(() => H.create({ value: 'hello world' })); await p.evaluate(() => H.focus())
        await setClip(p, { 'text/plain': 'THERE' })
        await p.evaluate(`H.exec(${JSON.stringify(sel(1, 7, 1, 12))})`)
        await p.keyboard.press(`${mod}+v`); await sleep(300); await p.evaluate(() => H.settle(2))
        return { value: await p.evaluate(() => ed.getModel().getValue()), sel: await p.evaluate(() => { const s = ed.getSelection(); return [s.selectionStartColumn, s.positionColumn] }) }
    },
    'paste-html-only': async p => { // 只有 text/html 的剪贴板:Monaco 不读 html,textarea/EditContext 只取 text/plain → 应当什么都不粘
        await p.evaluate(() => H.create({ value: 'x' })); await p.evaluate(() => H.focus())
        await setClip(p, { 'text/html': '<b>bold</b>' })
        await p.evaluate(`H.exec("editor.setPosition({lineNumber:1,column:2})")`)
        await p.keyboard.press(`${mod}+v`); await sleep(300); await p.evaluate(() => H.settle(2))
        return { value: await p.evaluate(() => ed.getModel().getValue()) }
    },
    'paste-html-and-plain': async p => { // 富文本来源(浏览器网页)同时带两种:只取 plain
        await p.evaluate(() => H.create({ value: 'x' })); await p.evaluate(() => H.focus())
        await setClip(p, { 'text/html': '<b>bold</b> and <i>it</i>', 'text/plain': 'bold and it' })
        await p.evaluate(`H.exec("editor.setPosition({lineNumber:1,column:2})")`)
        await p.keyboard.press(`${mod}+v`); await sleep(300); await p.evaluate(() => H.settle(2))
        return { value: await p.evaluate(() => ed.getModel().getValue()) }
    },
    'copyWithSyntaxHighlighting-off': async p => {
        await p.evaluate(() => H.create({ value: 'const a = 1 // c', language: 'typescript', options: { copyWithSyntaxHighlighting: false } })); await p.evaluate(() => H.focus())
        await p.evaluate(`H.exec(${JSON.stringify(sel(1, 1, 1, 17))})`)
        await p.keyboard.press(`${mod}+c`); await sleep(200)
        return { clip: await read(p) }
    },
    'emptySelectionClipboard-off': async p => {
        await p.evaluate(() => H.create({ value: 'one\ntwo', options: { emptySelectionClipboard: false } })); await p.evaluate(() => H.focus())
        await setClip(p, { 'text/plain': 'SENTINEL' })
        await p.evaluate(`H.exec("editor.setPosition({lineNumber:1,column:2})")`)
        await p.keyboard.press(`${mod}+c`); await sleep(200)
        const clip = await read(p)
        await p.keyboard.press(`${mod}+x`); await sleep(200)
        return { clip, after: await read(p), value: await p.evaluate(() => ed.getModel().getValue()) }
    },
    'readonly-cut-paste': async p => {
        await p.evaluate(() => H.create({ value: 'abc', options: { readOnly: true } })); await p.evaluate(() => H.focus())
        await p.evaluate(`H.exec(${JSON.stringify(sel(1, 1, 1, 3))})`)
        await setClip(p, { 'text/plain': 'ZZ' })
        await p.keyboard.press(`${mod}+x`); await sleep(200)
        const afterCut = await read(p)
        await p.keyboard.press(`${mod}+v`); await sleep(200)
        return { afterCut: afterCut.text, value: await p.evaluate(() => ed.getModel().getValue()) }
    },
    'api-trigger-clipboard': async p => { // editor.action.clipboardCopyAction 经命令面板/API,不走键盘
        await p.evaluate(() => H.create({ value: 'api copy' })); await p.evaluate(() => H.focus())
        await p.evaluate(`H.exec(${JSON.stringify(sel(1, 1, 1, 4))})`)
        await p.evaluate(`H.exec("editor.trigger('test','editor.action.clipboardCopyAction',null)")`).catch(() => {})
        await sleep(200)
        return { clip: (await read(p)).text }
    },
    'context-menu-copy-items': async p => { // 右键菜单里 剪切/复制/粘贴 三项在不在(标签不比,只比有无)
        await p.evaluate(() => H.create({ value: 'ctx' })); await p.evaluate(() => H.focus())
        const pos = await p.evaluate(() => H.where(1, 2))
        await p.mouse.click(pos.x, pos.y, { button: 'right' }); await sleep(500)
        const labels = await p.evaluate(() => [...document.querySelectorAll('*')].flatMap(h => h.shadowRoot ? [...h.shadowRoot.querySelectorAll('.monaco-menu .action-label')] : []).concat([...document.querySelectorAll('.monaco-menu .action-label, [role=menuitem]')]).map(e => (e.textContent || '').trim()).filter(Boolean))
        const has = w => labels.some(l => l.toLowerCase().replace(/\s/g, '').startsWith(w))
        await p.keyboard.press('Escape')
        return { cut: has('cut'), copy: has('copy'), paste: has('paste') }
    },
}

const filter = process.argv[2]
const { srv, base } = await serve(); const b = await launch(); const both = await openBoth(b, base)
let bad = 0
for (const [name, fn] of Object.entries(cases)) {
    if (filter && !name.includes(filter)) continue
    const r = {}
    for (const k of ['monaco', ...LITE_KINDS]) {
        try { r[k] = await fn(both[k].page, k.startsWith('pack-') ? 'lite' : k) } catch (e) { r[k] = /^SKIP/.test(e.message) ? { __skip: e.message } : { __fatal: String(e.message).split('\n')[0] } }
    }
    if (r.monaco.__skip) { console.log('- 跳过', name, r.monaco.__skip); continue }
    const a = JSON.stringify(r.monaco), c = JSON.stringify(r.lite)
    if (/__fatal/.test(a + c)) { bad++; console.log('✗ (脚本错)', name, a.slice(0, 200), c.slice(0, 200)); continue }
    if (process.env.VERBOSE) console.log('  ·', name, c.slice(0, 300))
    // 装出来的包必须和源码一模一样
    for (const pk of PACKS) if (JSON.stringify(r[pk]) !== c) { bad++; console.log(`✗ ${pk} ≠ 源码`, name); console.log('   源码:', c.slice(0, 400)); console.log('   包  :', JSON.stringify(r[pk]).slice(0, 400)) }
    if (a === c) console.log('✓', name)
    else { bad++; console.log('✗', name); console.log('   monaco:', a.slice(0, 600)); console.log('   lite  :', c.slice(0, 600)) }
}
await b.close(); srv.close()
console.log(bad ? `\n${bad} 个有差异` : '\n全部一致')
