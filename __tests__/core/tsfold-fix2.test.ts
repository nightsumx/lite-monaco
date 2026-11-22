// 第 2 轮 F3a(h-perf P1-4 / P2-8 / P2-9):
// - 宿主快照带 getChangeRange,TS 增量重解析(修前每次编辑全文 createSourceFile:2 万行 tsfold 停顿后 60–80ms 长任务);
// - 项目里最后一个打开的文件释放后,LanguageService 不再拿着它的 SourceFile(修前销毁 2 万行后堆留 30MB,直到下次挂载)。
import { describe, expect, it } from 'vitest'
import { setFlagsFromString } from 'node:v8'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { TsProject } from '../../src/lang/tsproject'

setFlagsFromString('--expose-gc')
const gc: () => void = runInNewContext('gc')

const body = (i: number) => `namespace N${i} {\n    export function f${i}(a: number) {\n        return [\n            a,\n        ]\n    }\n}\n`
const big = Array.from({ length: 200 }, (_, i) => body(i)).join('')

const spansOf = (svc: ts.LanguageService, file: string) =>
    svc.getOutliningSpans(file).map(s => [s.kind, s.textSpan.start, s.textSpan.length].join(':'))

// 这两条测的是语言服务一侧(Worker 里)的性质:增量重解析复用节点、最后一个文件关掉后放下语法树。
// 主线程拿不到 LanguageService / SourceFile,所以直接驱动服务一侧的项目(TsProject),和 Worker 里跑的是同一份代码。
const newProject = () => new TsProject('ts', () => {})
let epoch = 0
const open = (p: TsProject, path: string, text: string) => p.apply([{ k: 'open', path, text }], ++epoch)
const edit = (p: TsProject, path: string, text: string) => {
    const old = p.open.get(path)!.text
    // 公共前后缀 → 补丁(主线程 session.update 发的就是这种)
    let s = 0
    while (s < old.length && s < text.length && old[s] === text[s]) s++
    let e = 0
    while (e < old.length - s && e < text.length - s && old[old.length - 1 - e] === text[text.length - 1 - e]) e++
    p.apply([{ k: 'patch', path, start: s, end: old.length - e, insert: text.slice(s, text.length - e), oldLen: old.length }], ++epoch)
}

describe('TS 增量解析', () => {
    it('编辑后语法树复用没改到的节点,outlining 与全量解析一致', async () => {
        const p = newProject()
        open(p, '/fold.ts', big)
        const svc = await p.ensure()
        spansOf(svc, '/fold.ts')
        const nonBound = (svc as unknown as { getNonBoundSourceFile(f: string): ts.SourceFile }).getNonBoundSourceFile
        const first = nonBound('/fold.ts').statements[0]
        let text = big
        for (const [at, ins] of [[big.length - 3, 'x'], [big.length >> 1, '\n  if (a) {\n  }\n'], [big.length - 20, '']] as const) {
            text = ins ? text.slice(0, at) + ins + text.slice(at) : text.slice(0, at) + text.slice(at + 1)
            edit(p, '/fold.ts', text)
            const fresh = ts.createLanguageService({
                getCompilationSettings: () => ({ noLib: true }),
                getScriptFileNames: () => ['/fold.ts'],
                getScriptVersion: () => '1',
                getScriptSnapshot: () => ts.ScriptSnapshot.fromString(text),
                getCurrentDirectory: () => '/',
                getDefaultLibFileName: () => '/lib.d.ts',
                readFile: () => undefined,
                fileExists: f => f === '/fold.ts',
            })
            expect(spansOf(svc, '/fold.ts')).toEqual(spansOf(fresh, '/fold.ts'))
            expect(svc.getSyntacticDiagnostics('/fold.ts').length).toBe(fresh.getSyntacticDiagnostics('/fold.ts').length)
        }
        expect(nonBound('/fold.ts').statements[0]).toBe(first)
        p.apply([{ k: 'close', path: '/fold.ts' }], ++epoch)
    }, 60_000)

    it('最后一个打开的文件释放后,语言服务不再持有它的语法树', async () => {
        const p = newProject()
        open(p, '/big.ts', big)
        const svc = await p.ensure()
        svc.getSemanticDiagnostics('/big.ts')
        spansOf(svc, '/big.ts')
        const inProgram = new WeakRef(svc.getProgram()!.getSourceFile('/big.ts')!)
        const inSyntax = new WeakRef((svc as unknown as { getNonBoundSourceFile(f: string): ts.SourceFile }).getNonBoundSourceFile('/big.ts'))
        p.apply([{ k: 'close', path: '/big.ts' }], ++epoch)
        await new Promise(r => setTimeout(r, 0))
        // GC 对栈上的保守引用不保证一次回收:多轮让出再回收(机器忙时单次 gc 偶尔留着最近用过的节点)
        // (deref() 会把目标留到本轮结束,所以先 gc、让出一轮,再检查)
        for (let i = 0; i < 20; i++) {
            gc()
            await new Promise(r => setTimeout(r, 25))
            if (!inProgram.deref() && !inSyntax.deref()) break
        }
        expect(inProgram.deref()).toBeUndefined()
        expect(inSyntax.deref()).toBeUndefined()
        // 之后照常可用:新开的文件能拿到服务和诊断
        open(p, '/t.ts', 'const n: number = "x"')
        const svc2 = await p.ensure()
        expect(svc2.getSemanticDiagnostics('/t.ts').map(d => d.code)).toEqual([2322])
        p.apply([{ k: 'close', path: '/t.ts' }], ++epoch)
    }, 60_000)
})
