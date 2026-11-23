// 三方对比:A(官方 @monaco-editor/react + 真 Monaco)是基准,B(官方 + lite-monaco)、C(lite-monaco/react)逐场景和它比。
// 用法:node react/run.mjs [场景名的一部分]   REACT=18 用 React 18.3.1 的页面
import { serve, launch } from '../lib.mjs'
import { scenarios } from './scenarios.mjs'

const V = process.env.REACT === '18' ? '18' : ''
const only = process.argv[2]
const { srv, base } = await serve()
const browser = await launch()
const ctx = await browser.newContext({ viewport: { width: 1000, height: 600 } })

async function runOne(kind, sc) {
    const page = await ctx.newPage()
    const errs = []
    page.on('pageerror', e => errs.push(String(e)))
    page.on('console', m => { if (m.type() === 'error' && !/Download the React DevTools/.test(m.text())) errs.push('console: ' + m.text().slice(0, 300)) })
    await page.goto(`${base}/react-${kind}${V}.html`)
    await page.waitForFunction(() => !!window.R, null, { timeout: 30000 })
    await page.evaluate(L => { window.R.loader = window.__loader }, null)
    const obs = []
    let first = null
    for (const [op, arg] of sc.steps) {
        try {
            if (op === 'mount') { first = await page.evaluate(s => window.R.mount(s), arg); obs.push(['ready', await page.evaluate(() => window.R.ready())]) }
            else if (op === 'update') await page.evaluate(p => window.R.update(p), arg)
            else if (op === 'unmount') await page.evaluate(() => window.R.unmount())
            else if (op === 'type' || op === 'key') {
                await page.evaluate(() => { const e = window.R.editor; (e.getModifiedEditor ? e.getModifiedEditor() : e).focus() })
                if (op === 'type') await page.keyboard.type(arg); else await page.keyboard.press(arg)
                await page.evaluate(() => window.R.settle())
            }
            else if (op === 'run') obs.push(['run', await page.evaluate(c => window.R.run(c), arg)])
            else if (op === 'state') obs.push(['state', await page.evaluate(() => window.R.state())])
            else if (op === 'log') obs.push(['log', await page.evaluate(() => window.R.log.splice(0))])
            else if (op === 'wait') await page.waitForTimeout(arg)
        } catch (e) { obs.push(['threw', op, String(e.message).split('\n')[0]]) }
    }
    errs.push(...await page.evaluate(() => window.R.errors))
    await page.close()
    return { obs, first, errs }
}

// 两份 JSON 的差别,列路径
function diff(a, b, path = '', out = []) {
    if (JSON.stringify(a) === JSON.stringify(b)) return out
    if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
        for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diff(a[k], b[k], path + '/' + k, out)
        return out
    }
    out.push({ path, a, b, toString() { return `${path || '/'}: A=${JSON.stringify(a)?.slice(0, 160)}  ≠  ${JSON.stringify(b)?.slice(0, 160)}` } })
    return out
}

// 有意不同、或不在 React 层的已知差别:比的时候跳过,结尾数一下各跳过了几处(ALL=1 全列)。
// 每条写清为什么不跟:
const ACCEPTED = [
    // lite 不把没登记的语言 id 换成 plaintext:默认只登记 28 种,其余靠 shiki 直接高亮(src/api/model.ts resolveLanguageId)。
    // @monaco-editor/react 的 DiffEditor 默认语言是 'text',所以 Diff 场景里处处是这一条
    { why: "语言 id 'text' 保留,不换成 plaintext", test: (a, b) => a === 'plaintext' && (b === 'text' || b === 'nope') },
    // vs 主题:Monaco 内置主题底色 #FFFFFE,lite 的 vs 用 shiki light-plus(#FFFFFF),主题层的已知项,不在 React 层
    { why: 'vs 主题底色 #FFFFFE / #FFFFFF', test: (a, b, path) => /\/bg$/.test(path) && a === 'rgb(255, 255, 254)' && b === 'rgb(255, 255, 255)' },
    // Monaco 的 DiffEditor dispose 以后 getModel() 还返回那一对 model(两边编辑器的已是 null);读已销毁的编辑器是调用方的错,不跟
    { why: '已销毁的 DiffEditor.getModel() 给 null', test: (a, b, path) => /\/ed$/.test(path) && b === null && a?.original?.model === null && a?.modified?.model === null },
    // Monaco 内部的 DOM:CodeLens 往编辑器容器的 style 上写 --vscode-editorCodeLens-* 变量,右键菜单的宿主 .context-view 挂在容器里。
    // lite 的右键菜单挂在 .cm-editor 里、没有 CodeLens 变量;外层 <section> 和容器本身(宽高、class、data-*)照样比
    { why: '容器里 Monaco 内部的 CodeLens 变量和 .context-view', test: (a, b, path) =>
        (/\/dom\/kids\/0\/attrs\/style$/.test(path) && typeof a === 'string' && a.includes('--vscode-editorCodeLens') && a.startsWith(b?.replace(/;$/, '') ?? '\0'))
        || (/\/dom\/kids\/0\/kids$/.test(path) && a === b + 1) },
]
const skipped = new Map()
function real(lines, a, b) {
    return lines.filter(l => {
        const hit = ACCEPTED.find(x => x.test(l.a, l.b, l.path))
        if (hit) skipped.set(hit.why, (skipped.get(hit.why) ?? 0) + 1)
        return !hit || process.env.ALL
    })
}

let bad = { B: 0, C: 0 }
for (const sc of scenarios) {
    if (only && !sc.name.includes(only)) continue
    const r = {}
    for (const k of ['a', 'b', 'c']) r[k] = await runOne(k, sc)
    const lines = []
    for (const [k, K] of [['b', 'B'], ['c', 'C']]) {
        const d = real(diff(r.a.obs, r[k].obs)).map(String)
        const e = r[k].errs.filter(x => !r.a.errs.includes(x))
        if (d.length || e.length) { bad[K]++; lines.push(`  ${K}: ` + [...d, ...e.map(x => 'error ' + x)].join('\n     ')) }
    }
    const firsts = ['a', 'b', 'c'].map(k => `${k.toUpperCase()}${r[k].first?.ready ? '建好' : r[k].first?.loading ? 'Loading' : '?'}`).join(' ')
    console.log(`${lines.length ? '✗' : '✓'} ${sc.name}  [挂上那一刻: ${firsts}]${r.a.errs.length ? '  (A 自己报错: ' + r.a.errs.join(' | ').slice(0, 200) + ')' : ''}`)
    if (lines.length) console.log(lines.join('\n'))
    if (process.env.SHOW) console.log(JSON.stringify(r.a.obs).slice(0, 2000))
}
for (const [why, n] of skipped) console.log(`  跳过 ${n} 处:${why}`)
console.log(`\nReact ${V || '19'}: B 不一样 ${bad.B} 个,C 不一样 ${bad.C} 个,共 ${scenarios.filter(s => !only || s.name.includes(only)).length} 个场景`)
await browser.close(); srv.close()
