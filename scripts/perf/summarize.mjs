// 列出 lite 比 monaco 慢的项(按比值倒序)和出错项。用法:node scripts/perf/summarize.mjs [阈值=1.25]
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
const r = JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), process.env.PERF_OUT || '.', 'results.json'), 'utf8'))
const th = Number(process.argv[2] || 1.25), rows = []
for (const [n, v] of Object.entries(r)) {
    const L = v.lite || {}, M = v.monaco || {}
    if (L.__error || M.__error) { rows.push([n, 'ERROR', L.__error || '', M.__error || '', 1e9]); continue }
    for (const k of Object.keys(L)) {
        if (k.startsWith('__') || k.endsWith('.count') || k === 'matches' || k === 'changes') continue
        const a = L[k], b = M[k]; if (typeof b !== 'number') continue
        const quant = !k.endsWith('.cpu') && !k.includes('cpu_per') && !k.includes('.max')
        if (quant && a < 17 && b < 17) continue; if (a < 0.5 && b < 0.5) continue
        if (a / b > th) rows.push([n, k, a, b, a / b])
    }
}
rows.sort((x, y) => y[4] - x[4]).forEach(x => console.log(x[0].padEnd(26), String(x[1]).padEnd(34), String(x[2]).padStart(10), String(x[3]).padStart(10), x[4] >= 1e9 ? '' : x[4].toFixed(2)))
