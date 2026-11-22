// 触摸/移动模拟差分(Chromium,hasTouch + isMobile):点按落光标、双击选词、长按、触摸滑动滚动、
// 软键盘相关的输入元素属性(inputmode/enterkeyhint/autocapitalize/autocorrect)。用法:node touch.mjs [过滤]
// 说明:headless 没有真软键盘,也没有系统选区手柄;这里验证的是「事件与属性」层面,不是真机体验。
import { serve, launch, openBoth, ENGINE } from './lib.mjs'
if (ENGINE !== 'chromium') { console.log('touch.mjs 只在 Chromium 跑(要 CDP 的 Input.synthesizeScrollGesture)'); process.exit(0) }
process.env.TOUCH = process.env.TOUCH || 'mobile'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const lines = n => Array.from({ length: n }, (_, i) => `line ${i + 1} some words to select here`).join('\n')
const sel = () => ed.getSelections().map(s => [s.selectionStartLineNumber, s.selectionStartColumn, s.positionLineNumber, s.positionColumn])
const cur = p => p.evaluate(`(${sel.toString()})()`)
const attrs = p => p.evaluate(() => {
    const ae = document.activeElement
    if (!ae || ae === document.body) return null
    const o = {}
    for (const n of ['inputmode', 'enterkeyhint', 'autocapitalize', 'autocorrect', 'autocomplete', 'spellcheck', 'readonly', 'virtualkeyboardpolicy'])
        if (ae.hasAttribute(n)) o[n] = ae.getAttribute(n)
    // lite 的 contenteditable 在 .cm-content,Monaco 的 EditContext 宿主在 .native-edit-context:只看是否能弹软键盘的类型
    o.editable = ae.isContentEditable
    return o
})

const cases = {
    'tap-places-caret': async p => {
        await p.evaluate(v => H.create({ value: v }), lines(10))
        const w = await p.evaluate(() => H.where(3, 8))
        await p.touchscreen.tap(w.x, w.y); await sleep(400)
        return { sel: await cur(p), focused: await p.evaluate(() => ed.hasTextFocus()) }
    },
    'tap-end-of-short-line': async p => {
        await p.evaluate(() => H.create({ value: 'ab\n\ncd' }))
        const w = await p.evaluate(() => H.where(1, 3))
        await p.touchscreen.tap(w.x + 300, w.y); await sleep(400)
        return { sel: await cur(p) }
    },
    'double-tap-selects-word': async p => {
        await p.evaluate(v => H.create({ value: v }), lines(10))
        const w = await p.evaluate(() => H.where(2, 8))
        await p.touchscreen.tap(w.x, w.y); await sleep(60); await p.touchscreen.tap(w.x, w.y); await sleep(400)
        return { sel: await cur(p) }
    },
    'triple-tap-selects-line': async p => {
        await p.evaluate(v => H.create({ value: v }), lines(10))
        const w = await p.evaluate(() => H.where(2, 8))
        for (let i = 0; i < 3; i++) { await p.touchscreen.tap(w.x, w.y); await sleep(60) } await sleep(400)
        return { sel: await cur(p) }
    },
    'swipe-scrolls-content': async (p, k) => {
        await p.evaluate(v => H.create({ value: v }), lines(200))
        const cdp = await p.context().newCDPSession(p)
        const b = await p.evaluate(() => document.getElementById('editor-container').getBoundingClientRect().toJSON())
        await cdp.send('Input.synthesizeScrollGesture', { x: b.left + 400, y: b.top + 300, yDistance: -400, gestureSourceType: 'touch', speed: 800 })
        await sleep(800); await p.evaluate(() => H.settle(2))
        const top = await p.evaluate(() => ed.getScrollTop())
        // 滑动后不应该有选区/焦点副作用
        return { scrolled: top > 100, ratioOk: top >= 380 && top <= 420, sel: await cur(p) }
    },
    'swipe-horizontal-long-line': async p => {
        await p.evaluate(() => H.create({ value: 'x'.repeat(400) + '\nshort' }))
        const cdp = await p.context().newCDPSession(p)
        const b = await p.evaluate(() => document.getElementById('editor-container').getBoundingClientRect().toJSON())
        await cdp.send('Input.synthesizeScrollGesture', { x: b.left + 600, y: b.top + 30, xDistance: -300, gestureSourceType: 'touch', speed: 800 })
        await sleep(800); await p.evaluate(() => H.settle(2))
        return { scrolledX: (await p.evaluate(() => ed.getScrollLeft())) > 150 }
    },
    'tap-then-type-commit': async p => { // 软键盘提交文字的等价物:insertText(无 keydown),看是不是进了光标处
        await p.evaluate(() => H.create({ value: 'abc' }))
        const w = await p.evaluate(() => H.where(1, 2))
        await p.touchscreen.tap(w.x, w.y); await sleep(300)
        const cdp = await p.context().newCDPSession(p)
        await cdp.send('Input.insertText', { text: 'XY' }); await sleep(200); await p.evaluate(() => H.settle(2))
        return { value: await p.evaluate(() => ed.getValue()), sel: await cur(p) }
    },
    'soft-keyboard-attrs': async p => {
        await p.evaluate(() => H.create({ value: 'abc' })); await p.evaluate(() => H.focus()); await sleep(200)
        return await attrs(p)
    },
    'soft-keyboard-attrs-readonly': async p => {
        await p.evaluate(() => H.create({ value: 'abc', options: { readOnly: true } })); await p.evaluate(() => H.focus()); await sleep(200)
        return await attrs(p)
    },
    'soft-keyboard-attrs-domReadOnly': async p => {
        await p.evaluate(() => H.create({ value: 'abc', options: { domReadOnly: true } })); await p.evaluate(() => H.focus()); await sleep(200)
        return await attrs(p)
    },
    'tap-on-gutter-folds-or-selects-line': async p => {
        await p.evaluate(() => H.create({ value: 'function a() {\n  x\n}\nb', language: 'typescript', options: { lineNumbers: 'on' } }))
        const b = await p.evaluate(() => document.getElementById('editor-container').getBoundingClientRect().toJSON())
        await p.touchscreen.tap(b.left + 20, b.top + 10); await sleep(400)
        return { sel: await cur(p) }
    },
    'tap-selection-handle-area-keeps-selection': async p => { // 先选中一词,再点选区内部:不应有任何副作用异常
        await p.evaluate(v => H.create({ value: v }), lines(5))
        await p.evaluate(() => { ed.setSelection(new monacoAPI.Selection(2, 6, 2, 11)); H.focus() })
        await sleep(200)
        return { sel: await cur(p), errs: await p.evaluate(() => H.errors.slice()) }
    },
    'viewport-meta-pinch-zoom-no-layout-break': async p => { // 移动视口下布局宽度稳定
        await p.evaluate(v => H.create({ value: v }), lines(5))
        return await p.evaluate(() => ({ w: ed.getLayoutInfo().width, ch: ed.getLayoutInfo().contentWidth > 0, vv: Math.round(window.visualViewport.scale * 100) / 100 }))
    },
}

const filter = process.argv[2]
const { srv, base } = await serve(); const b = await launch(); const both = await openBoth(b, base)
let bad = 0
for (const [name, fn] of Object.entries(cases)) {
    if (filter && !name.includes(filter)) continue
    const r = {}
    for (const k of ['monaco', 'lite']) {
        try { r[k] = await fn(both[k].page, k) } catch (e) { r[k] = { __fatal: String(e.message).split('\n')[0] } }
    }
    const a = JSON.stringify(r.monaco), c = JSON.stringify(r.lite)
    if (/__fatal/.test(a + c)) { bad++; console.log('✗ (脚本错)', name, a.slice(0, 200), c.slice(0, 200)); continue }
    if (process.env.VERBOSE) console.log('  ·', name, '\n     M', a.slice(0, 300), '\n     L', c.slice(0, 300))
    if (a === c) console.log('✓', name)
    else { bad++; console.log('✗', name); console.log('   monaco:', a.slice(0, 600)); console.log('   lite  :', c.slice(0, 600)) }
}
await b.close(); srv.close()
console.log(bad ? `\n${bad} 个有差异` : '\n全部一致')
