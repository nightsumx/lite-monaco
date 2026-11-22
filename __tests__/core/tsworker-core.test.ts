import { afterEach, describe, expect, it } from 'vitest'
import {
    clearTSServiceCache, getTSService, setTsCompilerOptions, setTsFiles, updateTsFile,
} from '../../src/lang/tsservice'
import { isTsCanceled } from '../../src/lang/tsprotocol'
import { tsTransport } from '../../src/lang/tsbackend'

const SLOW = 60_000
afterEach(() => clearTSServiceCache())

describe('TS 语言服务(通道另一侧)', () => {
    it('请求前自动带上最新文本,补丁按公共前后缀同步', async () => {
        const s = getTSService({ lang: 'typescript', fileName: '/a.ts' })
        const svc = s.service()
        s.update('const abc = 1\nabc.')
        let info = await svc.getCompletionsAtPosition('/a.ts', 'const abc = 1\nabc.'.length, undefined)
        expect(info?.entries.some(e => e.name === 'toFixed')).toBe(true)
        // 多次小改动之后再问:服务那边的文本必须和主线程一致
        let text = 'const abc = 1\nabc.'
        for (const ch of ['t', 'o', 'F']) {
            text += ch
            s.update(text)
        }
        info = await svc.getCompletionsAtPosition('/a.ts', text.length, undefined)
        expect(info?.entries.map(e => e.name)).toContain('toFixed')
        s.update('let q: number = "x"')
        const d = await svc.getSemanticDiagnostics('/a.ts')
        expect(d.length).toBe(1)
        expect(d[0].file).toEqual({ fileName: '/a.ts' })
    }, SLOW)

    it('宿主文件和 compilerOptions 同步过去', async () => {
        setTsFiles({ '/lib/b.ts': 'export const bee = 1' })
        const s = getTSService({ lang: 'typescript', fileName: '/main.ts' })
        s.update('import { bee } from "./lib/b"\nconst n: string = bee')
        let d = await s.service().getSemanticDiagnostics('/main.ts')
        expect(d.map(x => x.code)).toContain(2322)
        updateTsFile('/lib/b.ts', 'export const bee = "s"')
        d = await s.service().getSemanticDiagnostics('/main.ts')
        expect(d.length).toBe(0)
        setTsCompilerOptions({ noUnusedLocals: true })
        s.update('function f() { const unused = 1 }')
        d = await s.service().getSemanticDiagnostics('/main.ts')
        expect(d.map(x => x.code)).toContain(6133)
    }, SLOW)

    it('语义诊断:算完才 semanticReady,再改一个字又不 ready', async () => {
        const s = getTSService({ lang: 'typescript', fileName: '/s.ts' })
        s.update('const a: number = 1')
        expect(s.semanticReady()).toBe(false)
        let fired = 0
        s.onSemanticChecked(() => { fired++ })
        await s.service().getSemanticDiagnostics('/s.ts')
        // semantic 事件在回包之后(微任务)到
        await new Promise(r => setTimeout(r, 0))
        expect(s.semanticReady()).toBe(true)
        expect(fired).toBe(1)
        s.update('const a: number = 12')
        expect(s.semanticReady()).toBe(false)
    }, SLOW)

    it('deadline 到点:返回 undefined,不抛', async () => {
        const s = getTSService({ lang: 'typescript', fileName: '/d.ts' })
        // TS 的取消检查有 20ms 节流:检查工作量要够大才会真的被打断
        s.update(Array.from({ length: 4000 }, (_, i) => `export function f${i}(a: number[]) { return a.map(x => x + ${i}).filter(Boolean).reduce((p, c) => p + c, 0) }`).join('\n'))
        await s.ensure()
        const r = await s.withDeadline(-1, svc => svc.getSemanticDiagnostics('/d.ts'))
        expect(r).toBeUndefined()
        // 之后照常
        expect((await s.service().getSemanticDiagnostics('/d.ts')).length).toBe(0)
        expect(isTsCanceled(Object.assign(new Error('x'), { name: 'OperationCanceledException' }))).toBe(true)
    }, SLOW)

    it('括号跳过范围、类型标注在服务那一侧算', async () => {
        const s = getTSService({ lang: 'typescript', fileName: '/k.ts' })
        const text = 'const r = /a(b/g; const s = "(x)" // (c\n'
        const rel = s.acquire()
        s.update(text)
        const ranges = await s.service().$skipRanges('/k.ts')
        expect(ranges.length % 2).toBe(0)
        expect(ranges.length).toBeGreaterThan(0)
        s.update('let v = 5')
        const ann = await s.service().$typeAnnotation('/k.ts', 5)
        expect(ann).toEqual({ from: 5, insert: ': number' })
        rel()
    }, SLOW)

    it('文件关掉后服务那边也放掉(同路径重开拿到新内容)', async () => {
        const s = getTSService({ lang: 'typescript', fileName: '/c.ts' })
        const rel = s.acquire({ getText: () => 'const x = 1', applyTextChanges: () => {} })
        expect((await s.service().getSyntacticDiagnostics('/c.ts')).length).toBe(0)
        rel()
        await new Promise(r => setTimeout(r, 5))
        const s2 = getTSService({ lang: 'typescript', fileName: '/c.ts' })
        const rel2 = s2.acquire({ getText: () => 'const x = (', applyTextChanges: () => {} })
        expect((await s2.service().getSyntacticDiagnostics('/c.ts')).length).toBeGreaterThan(0)
        rel2()
    }, SLOW)

    it('两边的文本对不上(补丁长度不符):服务那边要求整篇重发,之后恢复正常', async () => {
        const s = getTSService({ lang: 'typescript', fileName: '/d.ts' })
        const svc = s.service()
        s.update('const a: number = 1')
        expect((await svc.getSemanticDiagnostics('/d.ts')).length).toBe(0)
        // 服务那边的文本被别的什么弄成了另一个样子(主线程不知道)
        tsTransport().post({ t: 'mut', family: 'ts', epoch: 99, ops: [{ k: 'open', path: '/d.ts', text: 'zz' }] } as never)
        // 主线程发的下一个补丁是按它自己记的上一版算的:长度对不上
        s.update('const a: number = 12 as string')
        await svc.getSemanticDiagnostics('/d.ts')
        s.update('const a: string = 12')
        const d = await svc.getSemanticDiagnostics('/d.ts')
        expect(d.map(x => x.code)).toContain(2322)
        expect(await svc.$sourceText('/d.ts')).toBe('const a: string = 12')
    }, SLOW)
})
