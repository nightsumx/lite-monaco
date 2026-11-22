// 手动排查:npx tsx scripts/compat-report.ts  列出 compat 断言里不兼容的名字与最深两层原因
import { compatDiagnostics } from '../__tests__/types/monaco-types-gen'
const only = process.argv[2]
const ds = compatDiagnostics(undefined, only ? 99 : 2).filter(d => !only || d.id === only)
if (only) { for (const d of ds) console.log(d.msg.replace(/ => /g, '\n  => ')); process.exit(0) }
const by = new Map<string, string[]>()
for (const d of ds) (by.get(d.id) ?? by.set(d.id, []).get(d.id)!).push(d.msg)
const groups = new Map<string, string[]>()
for (const [id, ms] of by) { const k = ms[0].slice(0, 300); (groups.get(k) ?? groups.set(k, []).get(k)!).push(id) }
for (const [k, ids] of [...groups].sort((a, b) => b[1].length - a[1].length)) console.log(ids.length, k, '\n      ', ids.slice(0, 6).join(' '))
console.log('failing assertions:', by.size)
