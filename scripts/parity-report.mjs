// 生成 PARITY.md:Monaco 原版单测 → lite-monaco 的逐文件进度表。
// 用法: MONACO_SRC=~/Documents/reference/_vscode-src node scripts/parity-report.mjs
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { existsSync, readdirSync } from 'node:fs'

const SRC = process.env.MONACO_SRC ?? `${homedir()}/Documents/reference/_vscode-src`
const OUT = '/tmp/parity.json'
try { execSync(`MONACO_SRC=${SRC} npx vitest run --config vitest.parity.config.ts --reporter=json --outputFile=${OUT}`, { stdio: 'ignore' }) } catch { /* 有失败用例时退出码非 0,照常读结果 */ }
const res = JSON.parse(readFileSync(OUT, 'utf8')).testResults
const ver = execSync(`git -C ${SRC} log -1 --format=%h`).toString().trim()

// 分档(按路径,先匹配先得)。N/A 不在这里按路径一刀切,只来自 __parity__/na/*.json(每条必须写具体理由),不计入分母。
const TIERS = [
    ['A 编辑行为', /controller\/cursor|wordOperations|wordPartOperations|linesOperations|copyLinesCommand|moveLinesCommand|sortLinesCommand|\/comment\/|indentation|shiftCommand|trimTrailing|snippet|multicursor|lineSelection|cursorUndo|caretOperations|smartSelect|linkedEditing|bracketMatching|textAreaState/],
    ['B 查找/折叠/提示', /\/find\/|\/folding\/|hover|parameterHints|suggest|stickyScroll|gotoLine|gotoSymbol|wordDistance/],
    ['C 纯算法/配置', /./],
]
// 个案声明不做:__parity__/na/*.json = [{ "file": "路径子串", "reason": "为什么 lite-monaco 架构上没有对应物" }],各区域各写各的文件。
// 带 "test" 字段(用例标题,精确匹配)的是用例级 N/A:只划掉文件里的这几条,同文件其余用例照常算分。写在 na/cases.json。
const NA_DIR = `${process.cwd()}/__parity__/na`
const NA_ALL = existsSync(NA_DIR) ? readdirSync(NA_DIR).filter(f => f.endsWith('.json')).flatMap(f => JSON.parse(readFileSync(`${NA_DIR}/${f}`, 'utf8'))) : []
const NA_EXTRA = NA_ALL.filter(e => !e.test)
const NA_CASES = NA_ALL.filter(e => e.test)
const naReason = p => NA_EXTRA.find(e => p.includes(e.file))?.reason
const naCase = (p, title) => NA_CASES.find(e => p.includes(e.file) && e.test === title)
const tier = p => naReason(p) ? 'N/A' : TIERS.find(([, re]) => re.test(p))[0]
// 只有经过 lite-monaco 编辑器/模型的垫片才算"真接入"。只借用 Range/Position 值类型的文件测的是 Monaco 自己的代码,全绿不说明任何事。
const VALUE_SHIMS = new Set(['range', 'position', 'selection', 'utils'])
// 例外:被测对象本身就是值类型的文件(range.test 测 Range、selection.test 测 Selection)——垫片转到 lite-monaco 的真实实现,算接入。
const shimExists = (base, p) => existsSync(`${process.cwd()}/__parity__/shims/${base}.ts`) || existsSync(`${process.cwd()}/__parity__/shims/for/${p.replace(/^.*\//, '').replace(/\.ts$/, '')}/${base}.ts`)
const importsOf = src => [...src.matchAll(/from '(\.[^']*\/([\w.-]+)\.js)'/g)].map(([, spec, base]) => ({ spec, base }))
// 直接 import 了非值类型垫片 = 接入;测试文件借同目录/上层的夹具文件(utils / editableTextModelTestUtils)间接走到垫片,也算(只跟一层本地夹具,夹具不是 *.test)
const isWired = (src, p, file) => importsOf(src).some(({ spec, base }) => {
    if ((!VALUE_SHIMS.has(base) || p.endsWith(`/${base}.test.ts`)) && shimExists(base, p)) return true
    if (base.endsWith('.test')) return false
    const fixture = `${file.replace(/\/[^/]*$/, '')}/${spec.replace(/\.js$/, '.ts')}`
    if (!existsSync(fixture)) return false
    return importsOf(readFileSync(fixture, 'utf8')).some(i => !VALUE_SHIMS.has(i.base) && shimExists(i.base, p))
})

const rows = res.map(f => {
    const p = f.name.split('src/vs/editor/')[1]
    const naCases = f.assertionResults.filter(a => naCase(p, a.title))
    const cases = f.assertionResults.filter(a => !naCase(p, a.title))
    const t = cases.filter(a => a.status !== 'skipped' && a.status !== 'pending').length, ok = cases.filter(a => a.status === 'passed').length
    const loaded = f.assertionResults.length > 0
    const src = readFileSync(f.name, 'utf8')
        // 已加载的文件以实际执行的用例数为准(正则数不到 test.skip / 循环生成的用例);原版自己 test.skip 的不进分母
    const total = loaded ? t : (src.match(/^\s*(?:test|it)\(/gm) ?? []).length
    const wired = loaded && isWired(src, p, f.name)
    const tr = tier(p)
    const state = tr === 'N/A' ? '不适用' : wired ? (ok === t ? '✅ 全过' : '◐ 部分') : loaded ? '⚠ 虚绿(未经垫片)' : '❌ 未接入'
    return { p, tr, total, t, ok, state, naCases: tr === 'N/A' ? 0 : naCases.length }
}).sort((a, b) => a.tr.localeCompare(b.tr) || a.p.localeCompare(b.p))

const scope = rows.filter(r => r.tr !== 'N/A')
const sum = (a, k) => a.reduce((s, r) => s + r[k], 0)
const real = scope.filter(r => r.state.startsWith('✅') || r.state.startsWith('◐'))
const lines = []
lines.push(`# Monaco 单测对齐进度\n`)
lines.push(`> 自动生成,别手改:\`node scripts/parity-report.mjs\`。对标 monaco-editor 0.55.1(VS Code \`${ver}\`)。\n`)
lines.push(`## 总览\n`)
lines.push(`| | 文件 | 用例 |\n|---|---|---|`)
lines.push(`| Monaco 编辑器单测全集 | ${rows.length} | ${sum(rows, 'total') + sum(scope, 'naCases')} |`)
lines.push(`| 不适用(Monaco 内部实现,声明不做) | ${rows.length - scope.length} | ${sum(rows.filter(r => r.tr === 'N/A'), 'total')} |`)
lines.push(`| 不适用用例(同文件里单划几条,见文末) | | ${sum(scope, 'naCases')} |`)
lines.push(`| **范围内(分母)** | **${scope.length}** | **${sum(scope, 'total')}** |`)
lines.push(`| 已接入并真跑 lite-monaco | ${real.length} | ${sum(real, 't')} |`)
lines.push(`| **其中通过** | | **${sum(real, 'ok')}** (${(sum(real, 'ok') / sum(scope, 'total') * 100).toFixed(1)}% of 分母) |\n`)
for (const tr of ['A 编辑行为', 'B 查找/折叠/提示', 'C 纯算法/配置']) {
    const g = scope.filter(r => r.tr === tr)
    lines.push(`## ${tr}  (${sum(g.filter(r => r.state.match(/^[✅◐]/)), 'ok')}/${sum(g, 'total')})\n`)
    lines.push(`| 状态 | 通过/总数 | 文件 |\n|---|---|---|`)
    for (const r of g) lines.push(`| ${r.state} | ${r.state.match(/^[✅◐]/) ? `${r.ok}/${r.t}` : `-/${r.total}`} | ${r.p} |`)
    lines.push('')
}
lines.push(`## 不适用清单\n\n<details><summary>${rows.length - scope.length} 个文件</summary>\n`)
for (const r of rows.filter(r => r.tr === 'N/A')) lines.push(`- ${r.p} (${r.total})${naReason(r.p) ? ` —— ${naReason(r.p)}` : ''}`)
lines.push(`\n</details>`)
lines.push(`\n## 不适用用例\n`)
for (const e of NA_CASES) lines.push(`- ${e.file} :: ${e.test} —— ${e.reason}`)
writeFileSync('PARITY.md', lines.join('\n') + '\n')
console.log(lines.slice(0, 14).join('\n'))
