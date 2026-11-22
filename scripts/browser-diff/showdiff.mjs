// node showdiff.mjs <result 文件后缀> [场景子串] [最多条数]:打印差异(调试用)
import { readFileSync } from 'node:fs'
const [f, pat, max] = process.argv.slice(2)
const r = JSON.parse(readFileSync(`out/result${f}.json`, 'utf8'))
for (const s of r) {
    if (pat && !`${s.group}/${s.name}`.includes(pat)) continue
    if (!s.diffs.length) continue
    console.log('##', s.group + '/' + s.name)
    for (const d of s.diffs.slice(0, +max || 12)) console.log('  ', d.path, '\n     M:', JSON.stringify(d.monaco)?.slice(0, 600), '\n     L:', JSON.stringify(d.lite)?.slice(0, 600))
}
