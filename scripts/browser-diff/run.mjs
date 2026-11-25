// 差分跑法:node run.mjs [过滤子串] [--json] [--smoke]
//   场景见 scenarios/*.mjs,已知差异的分类见 known.mjs;结果写 out/result.json 和 REPORT.md
import { readdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve } from 'node:path'
import { serve, launch, openBoth, openKind, ENGINE, LITE_KINDS, PACKS } from './lib.mjs'
import { known } from './known.mjs'
import { axSummary } from './ax-states.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const filter = args.find(a => !a.startsWith('--'))
const sleep = ms => new Promise(r => setTimeout(r, ms))

// ── 步骤 ──
async function runSteps(k, scn) {
    const { page, cdp } = k
    const snaps = {}
    const focus = () => page.evaluate(() => H.focus())
    const settle = () => page.evaluate(() => H.settle(3))
    const where = (l, c) => page.evaluate(([l, c]) => H.where(l, c), [l, c])
    if (scn.diff) await page.evaluate(cfg => H.createDiff(cfg), scn.diff); else await page.evaluate(cfg => H.create(cfg), scn.create ?? {})
    await focus()
    for (const s of scn.steps) {
        switch (s.do) {
            case 'focus': await focus(); break
            case 'keys': await focus(); for (const key of s.keys) { await page.keyboard.press(key); if (s.delay) await sleep(s.delay) } await settle(); break
            case 'type': await focus(); await page.keyboard.type(s.text, { delay: s.delay ?? 0 }); await settle(); break
            case 'insertText': await focus(); await page.keyboard.insertText(s.text); await settle(); break
            case 'eval': { const v = await page.evaluate(code => H.exec(code), s.code); if (s.label) snaps[s.label] = { eval: v } } break
            case 'click': { const p = await where(...s.at); await page.mouse.click(p.x, p.y, { clickCount: s.count ?? 1, modifiers: undefined }); await settle() } break
            case 'drag': { const a = await where(...s.from), b = await where(...s.to); await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 }); await page.mouse.move(b.x, b.y, { steps: 4 }); await page.mouse.up(); await settle() } break
            case 'wheel': { await page.mouse.move(s.x ?? 300, s.y ?? 200); await page.mouse.wheel(s.dx ?? 0, s.dy ?? 0); await sleep(150); await settle() } break
            case 'resize': await page.evaluate(([w, h]) => H.setSize(w, h), [s.w, s.h]); break
            case 'paste': await focus(); await page.evaluate(text => {
                const el = document.activeElement
                const dt = new DataTransfer(); dt.setData('text/plain', text)
                el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
            }, s.text); await settle(); break
            case 'ime': { if (!cdp) throw new Error('ime 步骤需要 CDP(仅 Chromium)') // CDP 组字:steps 逐步 imeSetComposition,最后 insertText 落定
                await focus()
                for (const t of s.steps) { await cdp.send('Input.imeSetComposition', { text: t, selectionStart: t.length, selectionEnd: t.length }); await sleep(30) }
                if (s.snapMid) snaps[s.snapMid] = await page.evaluate(spec => H.snap(spec), s.spec ?? {})
                await cdp.send('Input.insertText', { text: s.commit }); await settle()
            } break
            // 细粒度输入法步骤(CDP 模拟,不是真输入法):imeSet 设组字串(可带组内选区),imeCommit 落定,imeCancel 取消(空串)
            case 'imeSet': { if (!cdp) throw new Error('imeSet 需要 CDP'); await focus(); await cdp.send('Input.imeSetComposition', { text: s.text, selectionStart: s.start ?? s.text.length, selectionEnd: s.end ?? s.text.length, ...(s.replaceStart != null ? { replacementStart: s.replaceStart, replacementEnd: s.replaceEnd } : {}) }); await sleep(40) } break
            case 'imeCommit': { if (!cdp) throw new Error('imeCommit 需要 CDP'); await cdp.send('Input.insertText', { text: s.text }); await settle() } break
            case 'imeCancel': { if (!cdp) throw new Error('imeCancel 需要 CDP'); await cdp.send('Input.imeSetComposition', { text: '', selectionStart: 0, selectionEnd: 0 }); await sleep(40); await settle() } break
            case 'blur': await page.evaluate(() => document.activeElement && document.activeElement.blur()); await sleep(60); await settle(); break
            case 'wait': await sleep(s.ms); break
            case 'snap': snaps[s.label] = await page.evaluate(spec => H.snap(spec), s.spec ?? {}); break
            case 'ax': snaps[s.label] = { ax: await axSummary(k) }; break
            case 'a11y': snaps[s.label] = { a11y: await page.evaluate(() => H.a11y()) }; break
            case 'waitFor': { // 轮询一个页面表达式,返回真(超时算 false),结果记进 snaps[label].eval
                const t0 = Date.now(); let v = null
                while (Date.now() - t0 < (s.timeout ?? 5000)) { v = await page.evaluate(`(() => { ${s.code} })()`).catch(() => null); if (v) break; await sleep(100) }
                snaps[s.label] = { eval: v ? true : false }
            } break
            default: throw new Error('unknown step ' + s.do)
        }
    }
    snaps.__errors = (await page.evaluate(() => H.errors.slice())).filter(e => !/404/.test(e))
    return snaps
}

// ── 比对 ──
function diff(a, b, tol, path = '', out = []) {
    if (a && b && typeof a === 'object' && typeof b === 'object') {
        const keys = new Set([...Object.keys(a), ...Object.keys(b)])
        for (const k of keys) diff(a[k], b[k], tol, path ? `${path}.${k}` : k, out)
    } else if (typeof a === 'number' && typeof b === 'number') {
        if (Math.abs(a - b) > tol) out.push({ path, monaco: a, lite: b })
    } else if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ path, monaco: a, lite: b })
    return out
}
const classify = (scn, d) => {
    const hit = known.find(r => (!r.scenario || new RegExp(r.scenario).test(scn.group + '/' + scn.name)) && new RegExp(r.path).test(d.path))
    return hit ? { cls: hit.class, note: hit.note } : { cls: '未分类', note: '' }
}

const scenarios = []
for (const f of readdirSync(resolve(here, 'scenarios')).filter(f => f.endsWith('.mjs') && !f.startsWith('_')).sort()) {
    const mod = await import(pathToFileURL(resolve(here, 'scenarios', f)).href)
    for (const s of mod.default) scenarios.push({ group: f.replace('.mjs', ''), ...s })
}
const picked = scenarios.filter(s => (!filter || `${s.group}/${s.name}`.includes(filter)) && !(ENGINE !== 'chromium' && s.group === '95-a11y')) // a11y 场景用 CDP AX 树,仅 Chromium

const { srv, base } = await serve()
const browser = await launch()
const results = []
try {
    let both = await openBoth(browser, base)
    for (const scn of picked) {
        const r = { group: scn.group, name: scn.name, diffs: [], err: null }
        const snaps = {}
        for (const kind of ['monaco', ...LITE_KINDS]) {
            if (scn.only && !scn.only.includes(kind.startsWith('pack-') ? 'lite' : kind)) continue
            try { snaps[kind] = await runSteps(both[kind], scn) } catch (e) {
                snaps[kind] = { __fatal: String(e.message).split('\n')[0] }
                // 页面可能被搞坏了,换一个干净的
                await both[kind].ctx.close().catch(() => {})
                both[kind] = await openKind(browser, base, kind)
            }
        }
        // 装出来的包和源码同一场景的结果应当一模一样(同容差);不一样就是打包、安装或用户的打包器把行为改了
        r.pack = {}
        for (const pk of PACKS) if (snaps.lite && snaps[pk]) r.pack[pk] = diff(snaps.lite, snaps[pk], scn.tol ?? 1)
        r.snaps = snaps
        if (snaps.monaco && snaps.lite) {
            const tol = scn.tol ?? 1
            const ds = diff(snaps.monaco, snaps.lite, tol)
            r.diffs = ds.filter(d => !/^__errors/.test(d.path) || true).map(d => ({ ...d, ...classify(scn, d) }))
        }
        results.push(r)
        const bad = r.diffs.filter(d => d.cls === '未分类').length
        const packBad = Object.entries(r.pack).filter(([, d]) => d.length)
        console.log(`${r.diffs.length ? (bad ? '✗' : '~') : '✓'} ${r.group}/${r.name}  diffs=${r.diffs.length}${bad ? ` (未分类 ${bad})` : ''}`
            + packBad.map(([pk, d]) => `\n    ✗ ${pk} ≠ 源码 ${d.length} 处: ` + d.slice(0, 3).map(x => `${x.path} 源码=${JSON.stringify(x.monaco)?.slice(0, 60)} 包=${JSON.stringify(x.lite)?.slice(0, 60)}`).join(' | ')).join(''))
    }
} finally {
    await browser.close(); srv.close()
}
const envTag = [PACKS.join('+'), ENGINE !== 'chromium' ? ENGINE : '', process.env.DPR ? 'dpr' + process.env.DPR : '', process.env.TOUCH ? 'touch' + process.env.TOUCH : ''].filter(Boolean).join('-')
const tag = (filter ? '-' + filter.replace(/[^\w]+/g, '_') : '') + (envTag ? '@' + envTag : '')
writeFileSync(resolve(here, `out/result${tag}.json`), JSON.stringify(results, null, 1))

// ── 报告 ──
const L = []
L.push('# 浏览器差分报告(真 Monaco 0.55.1 vs lite-monaco)\n')
L.push(`> 自动生成:\`node run.mjs\`。Chrome headless,Menlo 14px/行高 20,同一份场景脚本跑两边,比对 Monaco 公共 API 的几何值和少量 DOM 探针。数值默认容差 1px。\n`)
const tot = results.length, clean = results.filter(r => !r.diffs.length).length
L.push(`场景 ${tot},完全一致 ${clean},有差异 ${tot - clean}。\n`)
const byCls = {}
for (const r of results) for (const d of r.diffs) (byCls[d.cls] ??= []).push({ ...d, scn: `${r.group}/${r.name}` })
L.push('| 分类 | 条数 |\n|---|---|')
for (const [c, a] of Object.entries(byCls)) L.push(`| ${c} | ${a.length} |`)
L.push('')
for (const r of results) {
    if (!r.diffs.length) continue
    L.push(`## ${r.group}/${r.name}\n`)
    L.push('| 路径 | Monaco | lite | 分类 |\n|---|---|---|---|')
    for (const d of r.diffs.slice(0, 40)) L.push(`| \`${d.path}\` | \`${JSON.stringify(d.monaco)?.slice(0, 80)}\` | \`${JSON.stringify(d.lite)?.slice(0, 80)}\` | ${d.cls}${d.note ? ': ' + d.note : ''} |`)
    if (r.diffs.length > 40) L.push(`| …还有 ${r.diffs.length - 40} 条 | | | |`)
    L.push('')
}
if (!filter) writeFileSync(resolve(here, envTag ? `REPORT@${envTag}.md` : 'REPORT.md'), L.join('\n'))
console.log(`\n场景 ${tot},一致 ${clean},差异 ${tot - clean};报告 scripts/browser-diff/REPORT.md`)
let packFail = 0
for (const pk of PACKS) {
    const bad = results.filter(r => r.pack?.[pk]?.length)
    packFail += bad.length
    console.log(`${pk}:和源码不一样的场景 ${bad.length} / ${results.length}${bad.length ? ':' + bad.map(r => `${r.group}/${r.name}`).join(', ') : ''}`)
}
if (packFail) process.exitCode = 1
