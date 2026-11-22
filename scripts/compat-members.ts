// 手动排查:npx tsx scripts/compat-members.ts <L表达式> <M表达式> <out|in>  逐成员列出不兼容的签名及原因
// 例: npx tsx scripts/compat-members.ts "L.editor.ITextModel" "M.editor.ITextModel" out
import ts from 'typescript'
import { resolve, join } from 'node:path'
import { writeFileSync, unlinkSync, readFileSync } from 'node:fs'
const [lt, mt, dir = 'out'] = process.argv.slice(2)
const root = resolve(import.meta.dirname, '..')
const probe = join(root, '__tests__/types/_probe.ts')
const head = `import type * as L from '../../src/index'\nimport type * as M from 'monaco-editor'\ntype A = ${dir === 'out' ? lt : mt}\ntype B = ${dir === 'out' ? mt : lt}\n`
writeFileSync(probe, head + `export type Keys = keyof B\n`)
const cfg = ts.readConfigFile(join(root, 'tsconfig.json'), ts.sys.readFile)
const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, root)
let prog = ts.createProgram([probe], parsed.options)
let ck = prog.getTypeChecker()
let sf = prog.getSourceFile(probe)!
const keysT = ck.getTypeAtLocation((sf.statements[sf.statements.length - 1] as ts.TypeAliasDeclaration).name)
const keys = (keysT.isUnion() ? keysT.types : [keysT]).map(t => (t as ts.StringLiteralType).value).filter(Boolean)
const lines = keys.map((k, i) => `export const m${i}: (a: A) => void = null!\nexport const t${i} = (a: A, b: B) => { const x: B[${JSON.stringify(k)}] = a[${JSON.stringify(k)} as keyof A] as never; void x }`)
// 真正的断言: A 的成员赋给 B 的成员
const asserts = keys.map((k, i) => `export const c${i} = (a: A): B[${JSON.stringify(k)}] => (a as any)[${JSON.stringify(k)}] as A[${JSON.stringify(k)} & keyof A]`)
void lines
writeFileSync(probe, head + asserts.join('\n') + '\n')
prog = ts.createProgram([probe], parsed.options)
sf = prog.getSourceFile(probe)!
const clean = (s: string): string => s.replace(/import\("[^"]*?\/(?:src|monaco-editor\/esm\/vs\/editor)\/([^"]*)"\)/g, (_m, p: string) => p.includes('editor.api') ? 'M' : `L:${p}`)
for (const d of ts.getPreEmitDiagnostics(prog, sf)) {
    if (d.start == null) continue
    const text = readFileSync(probe, 'utf8')
    const line = text.slice(text.lastIndexOf('\n', d.start) + 1, text.indexOf('\n', d.start))
    const idx = Number(/export const c(\d+)/.exec(line)?.[1])
    const chain: string[] = []
    let m: ts.DiagnosticMessageChain | undefined = typeof d.messageText === 'string' ? undefined : d.messageText
    if (typeof d.messageText === 'string') chain.push(d.messageText)
    while (m) { chain.push(m.messageText); m = m.next?.[0] }
    console.log(keys[idx], '::', chain.slice(0, 5).map(clean).join('\n      => ').slice(0, 700))
}
unlinkSync(probe)
