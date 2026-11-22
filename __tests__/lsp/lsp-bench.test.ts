// 主线程语言服务的大文件基准(评估要不要做 worker 版)。
// 跑法:LSP_BENCH=1 npx vitest run __tests__/lsp/lsp-bench.test.ts(默认只做小规模冒烟,不计时断言,免得负载高时误报)。
// 补全:CSS 在 10k 行文档里光标处的属性名补全;JSON 光标在数组元素对象里(补全项可为 0,不断言条数)。
// 阈值取「单次同步占主线程 > 100ms 就能感觉到卡」:超过则列入 worker 方案评估,见文件末尾的结论注释。
import { afterEach, describe, expect, it } from 'vitest'
import { editor, Uri, Position } from '../../src/index'
import { languageFeatures } from '../../src/lang/languagefeatures'
import { foldingProvidersFor } from '../../src/lang/providers'
import { CSSWorker } from '../../src/lang/lsp/css/cssWorker'
import { JSONWorker } from '../../src/lang/lsp/json/jsonWorker'
import { cssDefaults } from '../../src/lang/lsp/css/register'
import { jsonDefaults } from '../../src/lang/lsp/json/register'

const FULL = !!process.env.LSP_BENCH
const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms))
const TOKEN = { isCancellationRequested: false, onCancellationRequested: () => ({ dispose() { } }) } as never
let n = 0
const models: { dispose(): void }[] = []
afterEach(() => { while (models.length) models.pop()!.dispose() })

const LINES = Number(process.env.LSP_BENCH_LINES) || (FULL ? 10_000 : 300)
const cssDoc = (k: number) => Array.from({ length: k }, (_, i) => i % 5 === 0 ? `.c${i} {` : i % 5 === 4 ? '}' : `  ${['color: #ff0000', 'margin: 0 auto', 'padding: 4px 8px', 'unknownprop: 1'][i % 4]};`).join('\n')
const jsonDoc = (k: number) => '[\n' + Array.from({ length: Math.floor(k / 4) }, (_, i) => `  { "id": ${i}, "name": "n${i}", "tags": ["a", "b"] }`).join(',\n') + '\n]'

async function bench(lang: string, text: string, probeLine: number) {
    const m = editor.createModel(text, lang, Uri.parse(`file:///bench${n++}.${lang}`)); models.push(m)
    for (let i = 0; i < 400 && !languageFeatures.completionProvider.ordered(m as never).length; i++) await wait(15)
    const prov: any = languageFeatures.completionProvider.ordered(m as never)[0]
    const t0 = performance.now()
    const list = await prov.provideCompletionItems(m, new Position(probeLine, 3), { triggerKind: 1 }, TOKEN)
    const complete = performance.now() - t0
    // 诊断:等 marker 出现(CSS 有未知属性必出;JSON 数组整齐则无 marker,改为量 provider 调用)
    if (lang === 'json') m.applyEdits([{ range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }, text: ',,' }]) // 制造一个语法错误,量「改一下到 marker 出现」的耗时
    const t1 = performance.now()
    let diag = -1
    for (let i = 0; i < 600; i++) { if (editor.getModelMarkers({ resource: m.uri }).length) { diag = performance.now() - t1; break } await wait(10) }
    const t2 = performance.now()
    for (let i = 0; i < 200 && !foldingProvidersFor(lang).length; i++) await wait(15)
    const fold = await foldingProvidersFor(lang)[0].provideFoldingRanges(m as never, {} as never, TOKEN)
    const foldMs = performance.now() - t2
    return { complete, diag, foldMs, items: list?.suggestions?.length ?? 0, folds: fold?.length ?? 0 }
}

/** 直接量语言服务的同步计算耗时(不含防抖 / 调度):这才是占主线程、会卡输入的那一段 */
function pure(lang: 'css' | 'json', text: string) {
    const uri = `file:///pure${n++}.${lang}`
    const ctx = { getMirrorModels: () => [{ uri: { toString: () => uri } as never, version: 1, getValue: () => text }] }
    const w: any = lang === 'css'
        ? new CSSWorker(ctx as never, { languageId: 'css', options: cssDefaults.options } as never)
        : new JSONWorker(ctx as never, { languageId: 'json', languageSettings: jsonDefaults.diagnosticsOptions, enableSchemaRequest: false })
    return { uri, w }
}
async function timed<T>(f: () => Promise<T>): Promise<[T, number]> { const t = performance.now(); const r = await f(); return [r, performance.now() - t] }

describe(`语言服务主线程基准(${LINES} 行)`, () => {
    it('CSS:补全 / 诊断 / 折叠都能在大文件上返回', { timeout: 60_000 }, async () => {
        const r = await bench('css', cssDoc(LINES), Math.floor(LINES / 2))
        console.log('[bench css]', LINES, JSON.stringify(r))
        expect(r.items).toBeGreaterThan(0)
        expect(r.folds).toBeGreaterThan(0)
        expect(r.diag).toBeGreaterThanOrEqual(0)
        if (FULL) { expect(r.complete).toBeLessThan(2000); expect(r.foldMs).toBeLessThan(2000) }
    })
    it('JSON:补全 / 折叠都能在大文件上返回', { timeout: 60_000 }, async () => {
        const r = await bench('json', jsonDoc(LINES), Math.floor(LINES / 8))
        expect(r.diag).toBeGreaterThanOrEqual(0)
        console.log('[bench json]', LINES, JSON.stringify(r))
        expect(r.folds).toBeGreaterThan(0)
        if (FULL) { expect(r.complete).toBeLessThan(2000); expect(r.foldMs).toBeLessThan(2000) }
    })
})

describe(`纯计算耗时(${LINES} 行;不含防抖 / 调度)`, () => {
    it('CSS / JSON 整篇诊断、整篇格式化、符号大纲', { timeout: 60_000 }, async () => {
        const out: Record<string, number> = {}
        for (const [lang, text] of [['css', cssDoc(LINES)], ['json', jsonDoc(LINES)]] as const) {
            const { uri, w } = pure(lang, text)
            const [diag, dMs] = await timed(() => w.doValidation(uri))
            const [syms, sMs] = await timed(() => w.findDocumentSymbols(uri))
            const [edits, fMs] = await timed(() => w.format(uri, null, { tabSize: 2, insertSpaces: true }))
            out[`${lang}.diagnostics`] = Math.round(dMs); out[`${lang}.symbols`] = Math.round(sMs); out[`${lang}.format`] = Math.round(fMs)
            expect(Array.isArray(diag)).toBe(true); expect(Array.isArray(syms)).toBe(true); expect(Array.isArray(edits)).toBe(true)
            if (FULL) for (const ms of [dMs, sMs, fMs]) expect(ms).toBeLessThan(1500)
        }
        console.log('[bench pure ms]', JSON.stringify(out))
    })
})

// 结论(2026-11-22,16 核 Mac,Node + jsdom,10k 行):见 docs 汇报;补全 / 折叠都在 30ms 内;诊断 / 格式化 / 大纲的纯计算数字由上面的 [bench pure ms] 打印。
