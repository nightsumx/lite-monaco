// F3 修复回归:TS 语言智能(诊断越界 / 折叠性能 / 粘贴格式化 / inlay 映射 / 跨文件 / 签名 / hover …)
import { describe, expect, it } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'
import { EditorView, inputHandler } from '../../src/core/view/editorview'
import { diagnosticsField, setDiagnostics } from '../../src/core/feature/diagnostics'
import { tsDiagnosticsSession, tsTagDecorations, tsTagField, tsTagHoverMarkers } from '../../src/lang/tsdiagnostics'
import { clearTSServiceCache, getTSService } from '../../src/lang/tsservice'
import { defaultsFor } from '../../src/lang/tsapi'
import { formatOnPasteInput, formatOnTypeInput } from '../../src/lang/tsformaton'
import { history, undo } from '../../src/core/edit/history'
import { pasteText } from '../../src/core/input/clipboard'
import { typeText } from './input-harness'
import { liteMonaco, type ShikiLike } from '../../src/litemonaco'
import { diagnosticHoverActions, diagnosticHoverSource, hoverSources, hoverTooltip, showHover } from '../../src/core/feature/hover'
import { renderQuickInfo, tsQuickInfoSource } from '../../src/lang/tsquickinfo'
import { codeActionsLightbulb, lightbulbPlacement, tsDiagnosticHoverActions } from '../../src/lang/tscodeactions'
import { renderMarkdown } from '../../src/lang/tsmarkdown'
import { createTSActions, navHighlightField, pickList } from '../../src/lang/tsactions'
import { peekOpen, showPeek } from '../../src/lang/tspeek'

function fakeHl(): ShikiLike {
    return {
        codeToTokens: () => ({ tokens: [[]], fg: '#fff', bg: '#000' }),
        getTheme: () => ({ bg: '#1e1e1e', fg: '#d4d4d4', type: 'dark' as const }),
    } as unknown as ShikiLike
}

const SLOW = 60_000

function mountView(doc: string, extensions: import('../../src/core/model/state').Extension[] = []) {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const view = new EditorView({
        state: EditorState.create({ doc, selection: EditorSelection.single(doc.length), extensions }),
        parent: host,
    })
    return { view, done: () => { view.destroy(); host.remove() } }
}

async function until(pred: () => boolean, ms = 20_000) {
    const deadline = Date.now() + ms
    while (Date.now() < deadline) {
        if (pred()) return true
        await new Promise(r => setTimeout(r, 20))
    }
    return false
}

describe('#1 文末零长度诊断不锁死编辑器', () => {
    it('越界诊断(to = len+1)之后照常打字', () => {
        let state = EditorState.create({ doc: 'abc', extensions: [diagnosticsField] })
        state = state.applyTransaction(state.update({
            effects: setDiagnostics.of([{ from: 3, to: 4, severity: 'error', message: 'eof' }]),
        }))
        expect(() => {
            state = state.applyTransaction(state.update({ changes: { from: 0, insert: 'X' } }))
        }).not.toThrow()
        expect(state.sliceDoc()).toBe('Xabc')
        const d = state.field(diagnosticsField)
        expect(d.every(x => x.to <= state.doc.length)).toBe(true)
    })

    it('tsDiagnosticToLit 钳到文档长度,文末取最后一个字符', async () => {
        clearTSServiceCache()
        for (const doc of ['function f() {\n    foo()\n', 'const b =', 'foo.', '/* open']) {
            const s = getTSService({ lang: 'typescript', fileName: `/eof-${doc.length}.ts` })
            s.update(doc)
            const svc = await s.ensure()
            // 诊断在服务一侧转成 lite-monaco 格式(tsDiagnosticToLit 钳到文档长度);主线程拿到的就是转好的
            const res = await svc.$diagnostics(s.fileName, doc.length, false, false, defaultsFor('typescript').getDiagnosticsOptions()) as { diagnostics: { from: number, to: number }[] } | null
            expect(res!.diagnostics.length).toBeGreaterThan(0)
            for (const lit of res!.diagnostics) {
                expect(lit.to).toBeLessThanOrEqual(doc.length)
                expect(lit.from).toBeLessThan(lit.to)
            }
        }
    }, SLOW)

    it('真 LS:`const b =` 在文末,诊断到达后继续打字/撤销不抛', async () => {
        clearTSServiceCache()
        const { view, done } = mountView('const a = 1\nconst b =', [diagnosticsField])
        const off = tsDiagnosticsSession(view, { lang: 'typescript', fileName: '/eof-live.ts', debounceMs: 1 })
        expect(await until(() => view.state.field(diagnosticsField).some(d => d.source === 'ts'))).toBe(true)
        expect(() => {
            view.dispatch(view.state.update({ changes: { from: view.state.doc.length, insert: ' 2' }, userEvent: 'input.type' }))
            view.dispatch(view.state.update({ changes: { from: 0, insert: 'X' }, userEvent: 'input.type' }))
        }).not.toThrow()
        expect(view.state.sliceDoc()).toBe('Xconst a = 1\nconst b = 2')
        off()
        done()
    }, SLOW)
})

describe('#1b 诊断交给宿主算(remote)', () => {
    const wrong = (from: number, to: number) => ({ from, to, severity: 'error' as const, message: 'host says no', source: 'ts' })

    it('宿主拿到文件名、全文、模式;返回的结果落到编辑器上,不走本编辑器的语言服务', async () => {
        clearTSServiceCache()
        const { view, done } = mountView('const a: string = 1', [diagnosticsField, tsTagField])
        const reqs: { fileName: string, text: string, mode: string }[] = []
        const off = tsDiagnosticsSession(view, {
            lang: 'typescript', fileName: '/remote-a.ts', debounceMs: 1,
            remote: async (req) => { reqs.push(req); return { diagnostics: [wrong(0, 5)], tags: [{ from: 6, to: 7, tag: 'unnecessary', message: 'unused' }] } },
        })
        expect(await until(() => view.state.field(diagnosticsField).some(d => d.message === 'host says no'))).toBe(true)
        // 语言服务自己的结果(`string` 不能赋 1)没有出现:诊断全来自宿主
        expect(view.state.field(diagnosticsField).every(d => d.message === 'host says no')).toBe(true)
        expect(reqs[0]).toMatchObject({ fileName: '/remote-a.ts', text: 'const a: string = 1', mode: 'full' })
        expect(view.state.field(tsTagField)).toHaveLength(1)
        off()
        done()
    }, SLOW)

    it('返回 null = 这次不更新:已有的诊断原样留着;下一次有结果再换', async () => {
        clearTSServiceCache()
        const { view, done } = mountView('let x = 1', [diagnosticsField, tsTagField])
        let answer: { diagnostics: ReturnType<typeof wrong>[], tags: [] } | null = { diagnostics: [wrong(0, 3)], tags: [] }
        let calls = 0
        const off = tsDiagnosticsSession(view, { lang: 'typescript', fileName: '/remote-b.ts', debounceMs: 1, remote: async () => { calls++; return answer } })
        expect(await until(() => view.state.field(diagnosticsField).length === 1)).toBe(true)
        answer = null
        const before = calls
        view.dispatch(view.state.update({ changes: { from: 9, insert: '0' }, userEvent: 'input.type' }))
        expect(await until(() => calls > before)).toBe(true)
        await new Promise(r => setTimeout(r, 50))
        expect(view.state.field(diagnosticsField)).toHaveLength(1)
        answer = { diagnostics: [], tags: [] }
        view.dispatch(view.state.update({ changes: { from: 9, insert: '0' }, userEvent: 'input.type' }))
        expect(await until(() => view.state.field(diagnosticsField).length === 0)).toBe(true)
        off()
        done()
    }, SLOW)

    it('宿主抛错:不更新、不抛到外面', async () => {
        clearTSServiceCache()
        const { view, done } = mountView('let y = 1', [diagnosticsField])
        let calls = 0
        const off = tsDiagnosticsSession(view, { lang: 'typescript', fileName: '/remote-c.ts', debounceMs: 1, remote: async () => { calls++; throw new Error('worker gone') } })
        expect(await until(() => calls > 0)).toBe(true)
        await new Promise(r => setTimeout(r, 30))
        expect(view.state.field(diagnosticsField)).toHaveLength(0)
        off()
        done()
    }, SLOW)
})

describe('#2 大文档 TS 结果转换不是二次方', () => {
    it('outliningToFolds:3 万行、1 万个 span 在 300ms 内', async () => {
        const { outliningToFolds } = await import('../../src/lang/tsfold')
        const lines: string[] = []
        const spans: { start: number, length: number }[] = []
        let pos = 0
        for (let i = 0; i < 10_000; i++) {
            const block = [`function f${i}() {`, `    return ${i}`, '}']
            const text = block.join('\n') + '\n'
            spans.push({ start: pos + block[0].length - 1, length: text.length - block[0].length })
            lines.push(...block)
            pos += text.length
        }
        const text = lines.join('\n') + '\n'
        const t0 = performance.now()
        const folds = outliningToFolds(text, spans)
        const ms = performance.now() - t0
        expect(folds.length).toBe(10_000)
        expect(folds[1]).toMatchObject({ line: 4 })
        expect(ms).toBeLessThan(300)
    })

    it('linePreviewAt:1 万次查询在 300ms 内且结果正确', async () => {
        const { linePreviewAt } = await import('../../src/lang/tsbudget')
        const text = Array.from({ length: 30_000 }, (_, i) => `line ${i + 1}`).join('\n')
        const t0 = performance.now()
        let last = { line: 0, preview: '', lineStart: 0 }
        for (let i = 0; i < 10_000; i++) last = linePreviewAt(text, text.length - 1 - i)
        expect(performance.now() - t0).toBeLessThan(300)
        expect(linePreviewAt(text, 0)).toEqual({ line: 1, preview: 'line 1', lineStart: 0 })
        expect(linePreviewAt(text, text.indexOf('line 2\n'))).toMatchObject({ line: 2, preview: 'line 2' })
        expect(last.line).toBeGreaterThan(29_000)
    })
})

describe('#3/#4/#5 format on paste / type', () => {
    async function ready(fileName: string, doc: string) {
        const opts = { lang: 'typescript', fileName }
        const s = getTSService(opts)
        s.update(doc)
        await s.ensure()
        return opts
    }

    it('#3 CRLF 粘贴:不抛、内容全进文档、光标落在粘贴末尾', async () => {
        clearTSServiceCache()
        const doc = 'function f() {\n\n}'
        const opts = await ready('/fop-crlf.ts', doc)
        const { view, done } = mountView(doc, [inputHandler.of(formatOnPasteInput(opts))])
        view.dispatch(view.state.update({ selection: EditorSelection.cursor(15) }))
        const text = 'const a = 1\r\nconst b = 2\r\n'
        expect(() => pasteText(view, text)).not.toThrow()
        // 格式化编辑是异步到的(语言服务在 Worker 里):等它落地再断言位置映射
        await getTSService(opts).service().getSyntacticDiagnostics(opts.fileName)
        await Promise.resolve()
        const out = view.state.sliceDoc()
        expect(out).toContain('const a = 1')
        expect(out).toContain('const b = 2')
        expect(out).not.toContain('\r')
        // 光标在第二行粘贴内容之后(下一行行首),不因 \r 多偏
        const head = view.state.selection.main.head
        expect(out.slice(0, head).endsWith('const b = 2\n')).toBe(true)
        done()
    }, SLOW)

    it('#4 多选区不认领(落默认路径,每个光标都粘上)', async () => {
        clearTSServiceCache()
        const doc = 'a\nb'
        const opts = await ready('/fop-multi.ts', doc)
        const { view, done } = mountView(doc, [EditorState.allowMultipleSelections.of(true), inputHandler.of(formatOnPasteInput(opts))])
        view.dispatch(view.state.update({
            selection: EditorSelection.create([EditorSelection.cursor(1), EditorSelection.cursor(3)]),
        }))
        // 3 行粘到 2 个光标(行数≠光标数,不按行分发,对齐 Monaco multiCursorPaste 'spread')
        expect(formatOnPasteInput(opts)(view, 1, 1, 'x\ny\nz')).toBe(false)
        pasteText(view, 'x\ny\nz')
        expect(view.state.sliceDoc().split('x\ny\nz').length - 1).toBe(2)
        expect(view.state.selection.ranges.length).toBe(2)
        done()
    }, SLOW)

    it('#5 formatOnType 开着时:格式化与原输入同一个撤销步', async () => {
        clearTSServiceCache()
        const doc = 'const a=1'
        const opts = await ready('/fot-undo.ts', doc)
        const { view, done } = mountView(doc, [history(), inputHandler.of(formatOnTypeInput(opts))])
        typeText(view, doc.length, ';')
        expect(view.state.sliceDoc()).toBe('const a=1;')
        await getTSService(opts).service().getSyntacticDiagnostics(opts.fileName)
        await Promise.resolve()
        expect(view.state.sliceDoc()).toBe('const a = 1;')
        expect(view.state.selection.main.head).toBe('const a = 1;'.length)
        undo(view)
        expect(view.state.sliceDoc()).toBe('const a=1')
        done()
    }, SLOW)

    it('#5 formatOnPaste 开着时:粘贴与格式化同一个撤销步', async () => {
        clearTSServiceCache()
        const doc = 'function f() {\n}'
        const opts = await ready('/fop-undo.ts', doc)
        const { view, done } = mountView(doc, [history(), inputHandler.of(formatOnPasteInput(opts))])
        view.dispatch(view.state.update({ selection: EditorSelection.cursor(15) }))
        pasteText(view, 'const x=1\n')
        await getTSService(opts).service().getSyntacticDiagnostics(opts.fileName)
        await Promise.resolve()
        expect(view.state.sliceDoc()).toMatch(/const x = 1/)
        undo(view)
        expect(view.state.sliceDoc()).toBe(doc)
        done()
    }, SLOW)

    it('#5 liteMonaco() 默认不格式化:打 ; 与粘贴原样落地(对齐 Monaco formatOnType/OnPaste:false)', async () => {
        clearTSServiceCache()
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const doc = 'function f() {\n\tconst a=1\n}'
        const view = liteMonaco({ parent, highlighter: fakeHl(), doc, fileName: '/fmt-default.ts' })
        await getTSService({ lang: 'typescript', fileName: '/fmt-default.ts' }).ensure()
        const at = doc.indexOf('1') + 1
        view.dispatch(view.state.update({ selection: EditorSelection.cursor(at) }))
        for (const h of view.state.facet(inputHandler)) if (h(view, at, at, ';')) break
        // 异步格式化要是装了,等它落地后文档会变:等一轮请求再断言
        await getTSService({ lang: 'typescript', fileName: '/fmt-default.ts' }).service().getSyntacticDiagnostics('/fmt-default.ts')
        await Promise.resolve()
        expect(view.state.sliceDoc()).toContain('\tconst a=1')
        pasteText(view, '\n\tlet b=2\n')
        expect(view.state.sliceDoc()).toContain('\tlet b=2')
        view.destroy()
        parent.remove()
    }, SLOW)
})

describe('#6 inlay hint 默认关 + 随编辑映射', () => {
    it('提示前打字:提示跟着参数走,不停在原 offset', async () => {
        const { inlayField, setInlayHints } = await import('../../src/lang/tsinlay')
        let state = EditorState.create({ doc: 'add(1, 2)', extensions: [inlayField] })
        state = state.applyTransaction(state.update({ effects: setInlayHints.of([{ pos: 4, text: 'a:' }, { pos: 7, text: 'b:' }]) }))
        state = state.applyTransaction(state.update({ changes: { from: 0, insert: 'xx' } }))
        expect(state.field(inlayField).map(m => m.pos)).toEqual([6, 9])
        // 在提示处打字:提示留在新字符之前
        state = state.applyTransaction(state.update({ changes: { from: 6, insert: '9' } }))
        expect(state.field(inlayField).map(m => m.pos)).toEqual([6, 10])
        // 删掉跨过提示的区间:提示丢弃
        state = state.applyTransaction(state.update({ changes: { from: 8, to: 11 } }))
        expect(state.field(inlayField).map(m => m.text)).toEqual(['a:'])
    })

    it('liteMonaco() 的 TS 编辑器总装 inlay field(运行时 setInlayHintsOptions 随时生效);默认不出 hint(Monaco TS 选项为空)', async () => {
        const { inlayField } = await import('../../src/lang/tsinlay')
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const off = liteMonaco({ parent, highlighter: fakeHl(), doc: 'x', fileName: '/inlay-off.ts' })
        expect(off.state.field(inlayField, false)).toEqual([])
        off.destroy()
        const on = liteMonaco({ parent, highlighter: fakeHl(), doc: 'x', fileName: '/inlay-on.ts', features: { inlayHints: true } })
        expect(on.state.field(inlayField, false)).toEqual([])
        on.destroy()
        parent.remove()
    })
})

describe('#7 同语言族的编辑器共用一个 TS 项目', () => {
    const QUIET = { minimap: false, autocomplete: false, hover: false, signatureHelp: false, codeActions: false, stickyScroll: false, foldGutter: false } as const
    const codes = (v: EditorView) => v.state.field(diagnosticsField).filter(d => d.source === 'ts').map(d => d.code)

    it('a.ts 的 import "./b" 看得见另一个编辑器里的 b.ts;b 销毁后又看不见', async () => {
        clearTSServiceCache()
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const a = liteMonaco({ parent, highlighter: fakeHl(), fileName: '/proj/a.ts', features: QUIET,
            doc: "import { b } from './b'\nexport const a: number = b\n" })
        const b = liteMonaco({ parent, highlighter: fakeHl(), fileName: '/proj/b.ts', features: QUIET,
            doc: 'export const b = 1\n' })
        await getTSService({ lang: 'typescript', fileName: '/proj/a.ts' }).ensure()
        expect(await until(() => a.state.field(diagnosticsField).length === 0 && !codes(a).includes('(2792)')
            && getTSService({ lang: 'typescript', fileName: '/proj/a.ts' }).listUserFiles().includes('/proj/b.ts'), 5000)).toBe(true)
        // b 里改类型 → a 的诊断跟着重算(不用动 a)
        b.dispatch(b.state.update({ changes: { from: 17, to: 18, insert: '"s"' } }))
        expect(await until(() => codes(a).includes('(2322)'), 5000)).toBe(true)
        b.destroy()
        expect(await until(() => codes(a).includes('(2307)') || codes(a).includes('(2792)'), 5000)).toBe(true)
        a.destroy()
        parent.remove()
    }, SLOW)

    it('宿主 API:setTsFiles / updateTsFile / setTsCompilerOptions;moduleResolution 是 Bundler', async () => {
        clearTSServiceCache()
        const { setTsFiles, updateTsFile, setTsCompilerOptions, listTsFiles } = await import('../../src/lang/tsservice')
        const s = getTSService({ lang: 'typescript', fileName: '/host/main.ts' })
        s.update("import { u } from './util'\nconst n: number = u\nlet unused = 1\n")
        setTsFiles({ '/host/util.ts': 'export const u = 1\n' })
        const svc = await s.ensure()
        const ts = await import('typescript')
        expect((await svc.$programInfo()).options.moduleResolution).toBe(ts.ModuleResolutionKind.Bundler)
        expect((await svc.getSemanticDiagnostics(s.fileName)).map(d => d.code)).toEqual([])
        updateTsFile('/host/util.ts', 'export const u = "x"\n')
        expect((await svc.getSemanticDiagnostics(s.fileName)).map(d => d.code)).toEqual([2322])
        updateTsFile('/host/util.ts', null)
        expect((await svc.getSemanticDiagnostics(s.fileName)).map(d => d.code)).toContain(2307)
        expect(listTsFiles()).not.toContain('/host/util.ts')
        setTsCompilerOptions({ noUnusedLocals: true })
        expect((await svc.getSemanticDiagnostics(s.fileName)).map(d => d.code)).toContain(6133)
    }, SLOW)

    it("`from '.'` / `from '..'` 按目录 import 落到 index", async () => {
        clearTSServiceCache()
        const { setTsFiles } = await import('../../src/lang/tsservice')
        setTsFiles({
            '/dir/index.ts': 'export const a = 1\n',
            '/dir/sub/index.ts': 'export const b = 2\n',
            '/dir/sub/x.ts': "import { a } from '..'\nimport { b } from '.'\nexport const n: number = a + b\n",
        })
        const s = getTSService({ lang: 'typescript', fileName: '/dir/sub/x.ts' })
        s.update("import { a } from '..'\nimport { b } from '.'\nexport const n: number = a + b\n")
        const svc = await s.ensure()
        expect((await svc.getSemanticDiagnostics(s.fileName)).map(d => d.code)).toEqual([])
    }, SLOW)

    it('宿主给的 lib 只装这些(连同 /// <reference lib>);不给就是全部;lib 在用户文件之前', async () => {
        clearTSServiceCache()
        const { setTsCompilerOptions } = await import('../../src/lang/tsservice')
        const s = getTSService({ lang: 'typescript', fileName: '/lib/main.ts' })
        s.update('export const a = "x".replaceAll("x", "y")\nexport const b = [1].map(n => n * 2)\nexport const c = new Map<string, number>().size\n')
        const svc = await s.ensure()
        expect((await svc.getSemanticDiagnostics(s.fileName)).map(d => d.code)).toEqual([])
        // es2020 没有 replaceAll(es2021);Array.map / Map 在 es2015+ 里,经 reference lib 链进来
        setTsCompilerOptions({ lib: ['lib.es2020.d.ts'] })
        expect((await svc.getSemanticDiagnostics(s.fileName)).map(d => d.code)).toEqual([2550])
        setTsCompilerOptions({ lib: ['lib.es2021.d.ts'] })
        expect((await svc.getSemanticDiagnostics(s.fileName)).map(d => d.code)).toEqual([])
        // 大小写和不带 lib./.d.ts 的写法也认
        setTsCompilerOptions({ lib: ['ES2020', 'DOM'] as never })
        expect((await svc.getSemanticDiagnostics(s.fileName)).map(d => d.code)).toEqual([2550])
        // 撤销(undefined)回到全部
        setTsCompilerOptions({ lib: undefined })
        expect((await svc.getSemanticDiagnostics(s.fileName)).map(d => d.code)).toEqual([])
        // 用户文件的全局声明排在 lib 之后:同名 var 以 lib 的类型为准
        const roots = (await svc.$programInfo()).roots
        expect(roots.findIndex(f => f.startsWith('/lib.'))).toBeLessThan(roots.indexOf('/lib/main.ts'))
    }, SLOW)

    it('setTsResolutions:同一个包名在不同文件里落在不同版本', async () => {
        clearTSServiceCache()
        const { setTsFiles, setTsResolutions } = await import('../../src/lang/tsservice')
        setTsFiles({
            '/node_modules/pkg/index.d.ts': 'export declare const v: 1\n',
            '/node_modules/pkg/__v2/index.d.ts': 'export declare const v: 2\n',
        })
        const main = "import { v } from 'pkg'\nexport const x: 1 = v\n"
        const other = "import { v } from 'pkg'\nexport const x: 2 = v\n"
        setTsFiles({
            '/node_modules/pkg/index.d.ts': 'export declare const v: 1\n',
            '/node_modules/pkg/__v2/index.d.ts': 'export declare const v: 2\n',
            '/app/a.ts': main,
            '/other/b.ts': other,
        })
        const a = getTSService({ lang: 'typescript', fileName: '/app/a.ts' })
        const b = getTSService({ lang: 'typescript', fileName: '/other/b.ts' })
        const svc = await a.ensure()
        expect((await svc.getSemanticDiagnostics('/app/a.ts')).map(d => d.code)).toEqual([])
        expect((await svc.getSemanticDiagnostics('/other/b.ts')).map(d => d.code)).toEqual([2322])
        setTsResolutions({ '/other/b.ts': { pkg: '/node_modules/pkg/__v2/index.d.ts' } })
        expect((await svc.getSemanticDiagnostics('/app/a.ts')).map(d => d.code)).toEqual([])
        expect((await svc.getSemanticDiagnostics('/other/b.ts')).map(d => d.code)).toEqual([])
        // 指到不存在的文件:不理它,走内置解析
        setTsResolutions({ '/other/b.ts': { pkg: '/nowhere.d.ts' } })
        expect((await svc.getSemanticDiagnostics('/other/b.ts')).map(d => d.code)).toEqual([2322])
        // 清空
        setTsResolutions({})
        expect((await svc.getSemanticDiagnostics('/other/b.ts')).map(d => d.code)).toEqual([2322])
        void b
    }, SLOW)

    it('没给 fileName 的两个编辑器不抢同一个文件', async () => {
        clearTSServiceCache()
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const { listTsFiles } = await import('../../src/lang/tsservice')
        const QUIET2 = { ...QUIET, tsDiagnostics: false }
        const a = liteMonaco({ parent, highlighter: fakeHl(), doc: 'const a = 1', features: QUIET2 })
        const b = liteMonaco({ parent, highlighter: fakeHl(), doc: 'const b = 2', features: QUIET2 })
        expect(listTsFiles()).toEqual(['/main.ts', '/main-2.ts'])
        a.destroy()
        b.destroy()
        expect(listTsFiles()).toEqual([])
        parent.remove()
    })

    it('同名文件在两个项目里各有内容时不串 AST(旧版共享 DocumentRegistry 的根因:版本号相撞)', async () => {
        clearTSServiceCache()
        const t = getTSService({ lang: 'typescript', fileName: '/same.ts' })
        const j = getTSService({ lang: 'javascript', fileName: '/same.ts' })
        t.update('export const fromTs = 1\n')
        j.update('export const fromJs = 1\n')
        const ts = await t.ensure()
        const js = await j.ensure()
        expect(await ts.$sourceText('/same.ts')).toContain('fromTs')
        expect(await js.$sourceText('/same.ts')).toContain('fromJs')
    }, SLOW)
})

describe('#8 签名提示对齐 Monaco', () => {
    const DOC = 'function add(a: number, b: number) { return a + b }\n'
        + 'function over(x: string): void\nfunction over(x: number, y: number): void\nfunction over(x: any, y?: any) {}\n'
    const sig = (v: EditorView) => v.dom.querySelector('.cm-signature-help') as HTMLElement | null
    const type = (v: EditorView, text: string) => {
        for (const ch of text) {
            const at = v.state.selection.main.head
            v.dispatch(v.state.update({ changes: { from: at, insert: ch }, selection: { anchor: at + 1 }, userEvent: 'input.type' }))
        }
    }
    async function mount(name: string) {
        clearTSServiceCache()
        const { signatureHelpSession } = await import('../../src/lang/tssignature')
        const m = mountView(DOC)
        const off = signatureHelpSession(m.view, { lang: 'typescript', fileName: name })
        await getTSService({ lang: 'typescript', fileName: name }).ensure()
        return { ...m, off }
    }

    it('add(1, 2 —— 打第二个参数时卡片保持,高亮 b', async () => {
        const { view, done, off } = await mount('/sig-keep.ts')
        type(view, 'add(')
        expect(await until(() => !!sig(view), 5000)).toBe(true)
        type(view, '1, ')
        expect(await until(() => sig(view)?.querySelector('.cm-signature-param-active')?.textContent?.startsWith('b') === true, 5000)).toBe(true)
        type(view, '2')
        await new Promise(r => setTimeout(r, 200))
        expect(sig(view)).not.toBeNull()
        expect(sig(view)!.querySelector('.cm-signature-param-active')?.textContent).toMatch(/^b/)
        type(view, ')')
        expect(await until(() => !sig(view), 5000)).toBe(true)
        off(); done()
    }, SLOW)

    it('多重载:↓/↑ 切换重载(循环),单重载不显示 1/1', async () => {
        const { view, done, off } = await mount('/sig-over.ts')
        type(view, 'over(')
        expect(await until(() => !!sig(view)?.querySelector('.cm-signature-meta'), 5000)).toBe(true)
        expect(sig(view)!.querySelector('.cm-signature-meta')!.textContent).toBe('1/2')
        const head = view.state.selection.main.head
        view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
        expect(sig(view)).not.toBeNull()
        expect(sig(view)!.querySelector('.cm-signature-meta')!.textContent).toBe('2/2')
        view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
        expect(sig(view)!.querySelector('.cm-signature-meta')!.textContent).toBe('1/2')
        view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }))
        expect(sig(view)!.querySelector('.cm-signature-meta')!.textContent).toBe('2/2')
        expect(view.state.selection.main.head).toBe(head)
        type(view, ');add(')
        expect(await until(() => !!sig(view) && sig(view)!.textContent!.includes('a: number'), 5000)).toBe(true)
        expect(sig(view)!.querySelector('.cm-signature-meta')).toBeNull()
        off(); done()
    }, SLOW)

    it('失焦关闭', async () => {
        const { view, done, off } = await mount('/sig-blur.ts')
        type(view, 'add(')
        expect(await until(() => !!sig(view), 5000)).toBe(true)
        view.contentDOM.dispatchEvent(new FocusEvent('blur'))
        expect(sig(view)).toBeNull()
        off(); done()
    }, SLOW)
})

describe('#9 hover 合卡:诊断 + 类型信息一张卡,底部 View Problem / Quick Fix', () => {
    const hoverExt = (fileName: string) => {
        const o = { lang: 'typescript', fileName }
        return [diagnosticsField, hoverSources.of(diagnosticHoverSource), hoverSources.of(tsQuickInfoSource(o)), diagnosticHoverActions.of(tsDiagnosticHoverActions(o))]
    }

    it('诊断与类型同时命中 → 一张卡,诊断在上,类型在下;没有 fix 显示 No quick fixes available', async () => {
        clearTSServiceCache()
        const doc = 'const s: number = "x"\n'
        const { view, done } = mountView(doc, hoverExt('/hover-merge.ts'))
        view.dispatch(view.state.update({
            selection: EditorSelection.single(7),
            effects: setDiagnostics.of([{ from: 6, to: 7, severity: 'error', message: "Type 'string' is not assignable to type 'number'.", code: 'ts(2322)', source: 'ts' }]),
        }))
        expect(await showHover(view)).toBe(true)
        expect(await until(() => !!view.dom.querySelector('.cm-tooltip-hover .cm-quickinfo'))).toBe(true)
        const cards = view.dom.querySelectorAll('.cm-tooltip-hover')
        expect(cards.length).toBe(1)
        const rows = [...cards[0].querySelectorAll(':scope > .cm-hover-row')]
        expect(rows.length).toBe(2)
        expect(rows[0].querySelector('.cm-diagnostic-msg')).not.toBeNull()
        expect(rows[1].querySelector('.cm-quickinfo-sig')!.textContent).toBe('const s: number')
        expect(await until(() => /No quick fixes available/.test(cards[0].querySelector('.cm-hover-status')?.textContent ?? ''))).toBe(true)
        expect(cards[0].querySelector('.cm-hover-status')!.textContent).toContain('View Problem')
        done()
    }, SLOW)

    it('有 fix:Quick Fix... 打开列表,选中后改文档;View Problem 选中诊断区间', async () => {
        clearTSServiceCache()
        const doc = 'const helloWorld = 1\nhelloWorl\n'
        const at = doc.lastIndexOf('helloWorl')
        const { view, done } = mountView(doc, hoverExt('/hover-fix.ts'))
        view.dispatch(view.state.update({
            selection: EditorSelection.single(at + 2),
            effects: setDiagnostics.of([{ from: at, to: at + 9, severity: 'error', message: "Cannot find name 'helloWorl'. Did you mean 'helloWorld'?", code: 'ts(2552)', source: 'ts' }]),
        }))
        await showHover(view)
        const qf = () => [...view.dom.querySelectorAll<HTMLElement>('.cm-hover-status a.cm-hover-action')].find(a => a.textContent!.startsWith('Quick Fix'))
        expect(await until(() => !!qf())).toBe(true)
        qf()!.click()
        expect(view.dom.querySelector('.cm-tooltip-hover')).toBeNull() // 点操作先关卡
        // r5 O 组:Quick Fix 是贴着链接的 action widget(Monaco),点击应用
        expect(await until(() => !!document.querySelector('.cm-action-item'))).toBe(true)
        const item = [...document.querySelectorAll<HTMLElement>('.cm-action-item')].find(r => /helloWorld/.test(r.textContent!))!
        item.click()
        expect(await until(() => view.state.sliceDoc() === 'const helloWorld = 1\nhelloWorld\n')).toBe(true)

        view.dispatch(view.state.update({
            selection: EditorSelection.single(at + 2),
            effects: setDiagnostics.of([{ from: at, to: at + 4, severity: 'warning', message: 'w' }]),
        }))
        await showHover(view)
        const vp = [...view.dom.querySelectorAll<HTMLElement>('.cm-hover-status a.cm-hover-action')].find(a => a.textContent!.startsWith('View Problem'))!
        vp.click()
        expect(view.state.selection.main.from).toBe(at)
        expect(view.state.selection.main.to).toBe(at + 4)
        done()
    }, SLOW)
})

describe('#10 JSDoc markdown 子集安全渲染', () => {
    it('粗体 / 斜体 / 行内代码 / 链接 / 列表 / 段落 / 代码块', () => {
        const md = renderMarkdown('Hello **bold** and *it* and `x()`.\nsame para\n\n- one\n- two [site](https://example.com)\n\n```ts\nconst a = 1\n```\n\n1. first\n2. second')
        const ps = md.querySelectorAll(':scope > p')
        expect(ps.length).toBe(1)
        expect(ps[0].textContent).toBe('Hello bold and it and x(). same para')
        expect(md.querySelector('strong')!.textContent).toBe('bold')
        expect(md.querySelector('em')!.textContent).toBe('it')
        expect(md.querySelector('p code')!.textContent).toBe('x()')
        const ul = md.querySelector('ul')!
        expect(ul.querySelectorAll('li').length).toBe(2)
        const a = ul.querySelector('a')!
        expect(a.getAttribute('href')).toBe('https://example.com')
        expect(a.textContent).toBe('site')
        expect(a.rel).toContain('noopener')
        expect(md.querySelector('pre code')!.textContent).toBe('const a = 1')
        expect(md.querySelectorAll('ol li').length).toBe(2)
    })

    it('防 XSS:HTML 原样当文本,javascript: 链接不生成 <a>', () => {
        const md = renderMarkdown('<img src=x onerror=alert(1)> [x](javascript:alert(1)) <script>alert(1)</script>')
        expect(md.querySelector('img, script')).toBeNull()
        expect(md.querySelector('a')).toBeNull()
        expect(md.textContent).toContain('<img src=x onerror=alert(1)>')
        expect(md.textContent).toContain('x')
    })

    it('snake_case 不被当成斜体;转义字符原样', () => {
        const md = renderMarkdown('use foo_bar_baz and \\*not em\\*')
        expect(md.querySelector('em')).toBeNull()
        expect(md.textContent).toBe('use foo_bar_baz and *not em*')
    })

    it('代码块交给 highlight 回调上色', () => {
        const md = renderMarkdown('```ts\nlet a\n```', {
            highlight: (code, lang) => { const s = document.createElement('span'); s.className = `hl-${lang}`; s.textContent = code; return s },
        })
        expect(md.querySelector('pre code .hl-ts')!.textContent).toBe('let a')
    })

    it('真 LS:JSDoc 粗体 / 列表进 DOM,@param 名字成行内代码,@deprecated 签名删除线', async () => {
        clearTSServiceCache()
        const doc = '/**\n * Adds **two** numbers.\n *\n * - fast\n * - pure\n * @param a the `first`\n * @deprecated use plus\n */\nfunction add(a: number) { return a }\nadd\n'
        const src = tsQuickInfoSource({ lang: 'typescript', fileName: '/md-live.ts' })
        const r = await src(EditorState.create({ doc }), doc.lastIndexOf('add'), 1)
        const el = r!.create()
        expect(el.querySelector('.cm-quickinfo-doc strong')!.textContent).toBe('two')
        expect(el.querySelectorAll('.cm-quickinfo-doc li').length).toBe(2)
        const param = [...el.querySelectorAll('.cm-quickinfo-tag')].find(t => t.querySelector('.cm-qi-tagname')!.textContent === '@param')!
        expect(param.querySelector('code.cm-qi-paramname')!.textContent).toBe('a')
        // 第六轮 H:标签段落照 Monaco 一份 markdown 渲染,不再有 .cm-qi-tagtext 外壳;说明里的 `first` 仍是行内代码
        expect(param.querySelector('code:not(.cm-qi-paramname)')!.textContent).toBe('first')
        expect(el.querySelector('.cm-quickinfo-sig')!.classList.contains('cm-quickinfo-deprecated')).toBe(true)
    }, SLOW)

    it('renderQuickInfo 无 deprecated 时签名不加删除线', () => {
        const el = renderQuickInfo({ displayParts: [{ text: 'let x', kind: 'text' }] } as unknown as import('typescript').QuickInfo)
        expect(el.querySelector('.cm-quickinfo-sig')!.classList.contains('cm-quickinfo-deprecated')).toBe(false)
    })
})

describe('#11 键盘唤起的 hover:Esc / 打字 / 点外面 / 失焦关闭', () => {
    const open = async () => {
        const doc = 'const x = foo()'
        const m = mountView(doc, [diagnosticsField, hoverSources.of(diagnosticHoverSource)])
        m.view.dispatch(m.view.state.update({
            selection: EditorSelection.single(11),
            effects: setDiagnostics.of([{ from: 10, to: 13, severity: 'error', message: 'bad' }]),
        }))
        const off = hoverTooltip(m.view)
        expect(await showHover(m.view)).toBe(true)
        expect(m.view.dom.querySelector('[data-cm-kb-hover]')).not.toBeNull()
        return { ...m, done: () => { off(); m.done() } }
    }

    it('Esc 关闭', async () => {
        const { view, done } = await open()
        const e = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
        view.contentDOM.dispatchEvent(e)
        expect(view.dom.querySelector('.cm-tooltip-hover')).toBeNull()
        expect(e.defaultPrevented).toBe(true)
        done()
    })

    it('打字关闭(文档变化)', async () => {
        const { view, done } = await open()
        view.dispatch(view.state.update({ changes: { from: 0, insert: 'a' }, userEvent: 'input.type' }))
        expect(view.dom.querySelector('.cm-tooltip-hover')).toBeNull()
        done()
    })

    it('在编辑器里按下关闭;点卡片里面、点编辑器外面不关(Monaco 只听 editor.onMouseDown)', async () => {
        const { view, done } = await open()
        const card = view.dom.querySelector('.cm-tooltip-hover')!
        card.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        expect(view.dom.querySelector('.cm-tooltip-hover')).not.toBeNull()
        document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        expect(view.dom.querySelector('.cm-tooltip-hover')).not.toBeNull()
        view.contentDOM.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        expect(view.dom.querySelector('.cm-tooltip-hover')).toBeNull()
        done()
    })

    it('失焦不关(Monaco content hover 不听失焦)', async () => {
        const { view, done } = await open()
        view.contentDOM.dispatchEvent(new FocusEvent('blur'))
        expect(view.dom.querySelector('.cm-tooltip-hover')).not.toBeNull()
        done()
    })

    it('没装鼠标挂载器也能关(Esc)', async () => {
        const doc = 'const x = foo()'
        const { view, done } = mountView(doc, [diagnosticsField, hoverSources.of(diagnosticHoverSource)])
        view.dispatch(view.state.update({
            selection: EditorSelection.single(11),
            effects: setDiagnostics.of([{ from: 10, to: 13, severity: 'error', message: 'bad' }]),
        }))
        await showHover(view)
        view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        expect(view.dom.querySelector('.cm-tooltip-hover')).toBeNull()
        done()
    })
})

describe('#12 F2 重命名用内嵌输入框(Monaco RenameWidget)', () => {
    const inputOf = (view: EditorView) => view.dom.querySelector<HTMLInputElement>('.cm-rename-input')
    const key = (el: HTMLElement, k: string, extra: KeyboardEventInit = {}) =>
        el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra }))

    it('不调 window.prompt;框里是旧名且全选,Enter 提交,一个撤销步', async () => {
        clearTSServiceCache()
        const doc = 'const foo = 1\nfoo + foo\n'
        const { view, done } = mountView(doc, [history()])
        view.dispatch(view.state.update({ selection: EditorSelection.single(doc.indexOf('foo') + 1) }))
        const prompt = window.prompt
        let prompted = false
        window.prompt = () => { prompted = true; return 'bar' }
        try {
            const actions = createTSActions({ lang: 'typescript', fileName: '/rn-1.ts' })
            const p = actions.renameSymbol(view)
            expect(await until(() => !!inputOf(view))).toBe(true)
            const input = inputOf(view)!
            expect(input.value).toBe('foo')
            expect(document.activeElement).toBe(input)
            expect([input.selectionStart, input.selectionEnd]).toEqual([0, 3])
            expect(input.getAttribute('aria-label')).toMatch(/Rename input/)
            input.value = 'bar'
            key(input, 'Enter')
            expect(await p).toBe(true)
            expect(prompted).toBe(false)
            expect(inputOf(view)).toBeNull()
            expect(view.state.sliceDoc()).toBe('const bar = 1\nbar + bar\n')
            expect(view.state.selection.main.empty).toBe(true)
            undo(view)
            expect(view.state.sliceDoc()).toBe(doc)
        } finally {
            window.prompt = prompt
            done()
        }
    }, SLOW)

    it('Escape 取消;同名 / 空白当取消;编辑器里选了一部分就只选那部分', async () => {
        clearTSServiceCache()
        const doc = 'const fooBar = 1\nfooBar\n'
        const { view, done } = mountView(doc)
        const actions = createTSActions({ lang: 'typescript', fileName: '/rn-2.ts' })
        // 选中 "Bar"
        view.dispatch(view.state.update({ selection: EditorSelection.range(9, 12) }))
        let p = actions.renameSymbol(view)
        expect(await until(() => !!inputOf(view))).toBe(true)
        expect([inputOf(view)!.selectionStart, inputOf(view)!.selectionEnd]).toEqual([3, 6])
        key(inputOf(view)!, 'Escape')
        expect(await p).toBe(false)
        expect(inputOf(view)).toBeNull()

        view.dispatch(view.state.update({ selection: EditorSelection.single(8) }))
        p = actions.renameSymbol(view)
        expect(await until(() => !!inputOf(view))).toBe(true)
        inputOf(view)!.value = '   '
        key(inputOf(view)!, 'Enter')
        expect(await p).toBe(false)
        expect(view.state.sliceDoc()).toBe(doc)
        done()
    }, SLOW)

    it('框里按键不漏给编辑器;失焦 / 文档变化 / 销毁都关框', async () => {
        clearTSServiceCache()
        const doc = 'let a = 1\na\n'
        const { view, done } = mountView(doc)
        const actions = createTSActions({ lang: 'typescript', fileName: '/rn-3.ts' })
        view.dispatch(view.state.update({ selection: EditorSelection.single(4) }))
        let seen = 0
        view.dom.addEventListener('keydown', () => { seen++ })
        let p = actions.renameSymbol(view)
        expect(await until(() => !!inputOf(view))).toBe(true)
        key(inputOf(view)!, 'x')
        expect(seen).toBe(0)
        const other = document.createElement('button')
        document.body.appendChild(other)
        other.focus()
        expect(await p).toBe(false)
        expect(inputOf(view)).toBeNull()
        other.remove()

        p = actions.renameSymbol(view)
        expect(await until(() => !!inputOf(view))).toBe(true)
        view.dispatch(view.state.update({ changes: { from: 0, insert: ' ' } }))
        expect(await p).toBe(false)
        expect(inputOf(view)).toBeNull()

        view.dispatch(view.state.update({ selection: EditorSelection.single(5) }))
        p = actions.renameSymbol(view)
        expect(await until(() => !!inputOf(view))).toBe(true)
        done()
        expect(await p).toBe(false)
        expect(document.querySelector('.cm-rename-box')).toBeNull()
    }, SLOW)

    it('不能重命名的位置:照样用光标下的词开框,提交时 TS 拒绝 → 静默关掉,不改文档(standalone Monaco 实测)', async () => {
        clearTSServiceCache()
        const doc = 'const a = 1\n'
        const { view, done } = mountView(doc)
        view.dispatch(view.state.update({ selection: EditorSelection.single(10) })) // 数字字面量
        const actions = createTSActions({ lang: 'typescript', fileName: '/rn-4.ts' })
        const p = actions.renameSymbol(view)
        expect(await until(() => !!inputOf(view))).toBe(true)
        expect(inputOf(view)!.value).toBe('1')
        inputOf(view)!.value = '2'
        key(inputOf(view)!, 'Enter')
        expect(await p).toBe(false)
        expect(inputOf(view)).toBeNull()
        expect(view.state.sliceDoc()).toBe(doc)
        expect(view.dom.querySelector('.cm-editor-message')).toBeNull()
        done()
    }, SLOW)

    it('跨文件:另一个打开的编辑器里的引用一起改(Monaco 改所有 model)', async () => {
        clearTSServiceCache()
        const hl = fakeHl()
        const hostA = document.createElement('div')
        const hostB = document.createElement('div')
        document.body.append(hostA, hostB)
        const b = liteMonaco({ parent: hostB, highlighter: hl, lang: 'typescript', fileName: '/x-b.ts', doc: 'export const shared = 1\n' })
        const a = liteMonaco({ parent: hostA, highlighter: hl, lang: 'typescript', fileName: '/x-a.ts', doc: "import { shared } from './x-b'\nshared\n" })
        const view = b
        view.dispatch(view.state.update({ selection: EditorSelection.single(15) }))
        const actions = createTSActions({ lang: 'typescript', fileName: '/x-b.ts' })
        const p = actions.renameSymbol(view)
        expect(await until(() => !!inputOf(view))).toBe(true)
        inputOf(view)!.value = 'common'
        key(inputOf(view)!, 'Enter')
        expect(await p).toBe(true)
        expect(view.state.sliceDoc()).toBe('export const common = 1\n')
        expect(a.state.sliceDoc()).toBe("import { common } from './x-b'\ncommon\n")
        a.destroy(); b.destroy(); hostA.remove(); hostB.remove()
    }, SLOW)
})

describe('#13 src/lang 浮层绑编辑器生命周期,destroy 不留 DOM / 全局监听', () => {
    // 记下 window / document 上净增的监听(加了没摘的)
    function trackGlobalListeners() {
        const live = new Set<string>()
        const restore: (() => void)[] = []
        let n = 0
        const ids = new WeakMap<object, number>()
        const idOf = (f: object) => { if (!ids.has(f)) ids.set(f, ++n); return ids.get(f)! }
        for (const [name, target] of [['window', window], ['document', document]] as const) {
            const add = target.addEventListener
            const rm = target.removeEventListener
            target.addEventListener = function (this: EventTarget, type: string, fn: EventListenerOrEventListenerObject | null, o?: boolean | AddEventListenerOptions) {
                if (fn) live.add(`${name}:${type}:${idOf(fn)}:${typeof o === 'boolean' ? o : !!o?.capture}`)
                return add.call(this, type, fn as EventListenerOrEventListenerObject, o)
            } as typeof add
            target.removeEventListener = function (this: EventTarget, type: string, fn: EventListenerOrEventListenerObject | null, o?: boolean | EventListenerOptions) {
                if (fn) live.delete(`${name}:${type}:${idOf(fn)}:${typeof o === 'boolean' ? o : !!o?.capture}`)
                return rm.call(this, type, fn as EventListenerOrEventListenerObject, o)
            } as typeof rm
            restore.push(() => { target.addEventListener = add; target.removeEventListener = rm })
        }
        return { live, restore: () => restore.forEach(f => f()) }
    }
    const loc = (start: number, text: string) => ({ file: '/x.ts', line: 1, start, length: 1, preview: '', local: true, text })

    it('peek 不挂 window keydown;另一个编辑器的方向键不动它;destroy 关掉', () => {
        const t = trackGlobalListeners()
        const a = mountView('a\nb\n')
        const b = mountView('zzz')
        try {
            showPeek(a.view, { title: 'Refs', locations: [loc(0, 'a\nb'), loc(2, 'a\nb')] })
            expect([...t.live].filter(k => k.includes('keydown'))).toEqual([])
            b.view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
            a.view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
            const sel = () => [...a.view.dom.querySelectorAll('.cm-peek-ref')].findIndex(r => r.classList.contains('cm-peek-ref-selected'))
            expect(sel()).toBe(1) // 光标在末行:最近的是第 2 行那处;编辑器里的 ↓ 归光标
            a.view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'F4', bubbles: true }))
            expect(sel()).toBe(0) // Monaco F4 下一处(绕回)
            expect(a.view.state.selection.main.head).toBe(0)
            // 两个编辑器各开一个 peek 互不顶掉
            showPeek(b.view, { title: 'B', locations: [loc(0, 'zzz')] })
            expect(peekOpen(a.view) && peekOpen(b.view)).toBe(true)
            const el = a.view.dom.querySelector('.cm-peek')!
            a.done()
            expect(peekOpen(a.view)).toBe(false)
            expect(el.isConnected).toBe(false)
            expect(peekOpen(b.view)).toBe(true)
        } finally {
            b.done()
            t.restore()
        }
        expect(document.querySelector('.cm-peek')).toBeNull()
    })

    it('pickList:destroy 时遮罩摘掉、promise 结 null、window 监听摘掉', async () => {
        const t = trackGlobalListeners()
        const { view, done } = mountView('x')
        try {
            const p = pickList(view, 'Pick', [{ label: 'one', value: 1 }])
            expect(document.querySelector('.cm-picker')).not.toBeNull()
            expect(t.live.size).toBeGreaterThan(0)
            done()
            expect(await p).toBeNull()
            expect(document.querySelector('.cm-picker')).toBeNull()
            expect([...t.live]).toEqual([])
        } finally { t.restore() }
    })

    it('键盘 hover / 重命名框 / 提示条 / 签名卡:destroy 后全局监听归零', async () => {
        clearTSServiceCache()
        const t = trackGlobalListeners()
        try {
            const hl = fakeHl()
            const parent = document.createElement('div')
            document.body.appendChild(parent)
            const doc = 'function add(a: number, b: number) { return a }\nconst v = 1\nadd(\n'
            const view = liteMonaco({ parent, highlighter: hl, doc, fileName: '/life.ts' })
            view.dispatch(view.state.update({ effects: setDiagnostics.of([{ from: 0, to: 8, severity: 'error', message: 'x' }]), selection: EditorSelection.single(2) }))
            expect(await showHover(view)).toBe(true)
            const actions = createTSActions({ lang: 'typescript', fileName: '/life.ts' })
            view.dispatch(view.state.update({ selection: EditorSelection.single(doc.indexOf('v =')) }))
            const rn = actions.renameSymbol(view)
            expect(await until(() => !!view.dom.querySelector('.cm-rename-input'))).toBe(true)
            const pk = pickList(view, 'P', [{ label: 'a', value: 1 }])
            view.destroy()
            expect(await rn).toBe(false)
            expect(await pk).toBeNull()
            parent.remove()
            expect([...t.live]).toEqual([])
            expect(document.querySelector('.cm-tooltip-hover, .cm-rename-box, .cm-picker, .cm-peek, .cm-editor-message')).toBeNull()
        } finally { t.restore() }
    }, SLOW)
})

describe('#14 F12 跳转:光标在名字开头不选中,名字闪 350ms;找不到时提示', () => {
    it('单个本地定义:光标收到开头,symbolHighlight 闪一下后消失', async () => {
        clearTSServiceCache()
        const doc = 'function foo() { return 1 }\nfoo()\n'
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const view = liteMonaco({ parent, highlighter: fakeHl(), doc, fileName: '/f12-a.ts' })
        view.dispatch(view.state.update({ selection: EditorSelection.single(doc.lastIndexOf('foo') + 1) }))
        const actions = createTSActions({ lang: 'typescript', fileName: '/f12-a.ts' })
        expect(await actions.goToDefinition(view)).toBe(true)
        const sel = view.state.selection.main
        expect(sel.empty).toBe(true)
        expect(sel.head).toBe(doc.indexOf('foo'))
        expect(view.state.field(navHighlightField)).toEqual({ from: 9, to: 12 })
        expect(await until(() => view.state.field(navHighlightField) == null, 2000)).toBe(true)
        view.destroy()
        parent.remove()
    }, SLOW)

    it('没有定义:不动光标,光标处提示 "No definition found for \'x\'"', async () => {
        clearTSServiceCache()
        const doc = 'const a = 1 + 2\n'
        const { view, done } = mountView(doc)
        view.dispatch(view.state.update({ selection: EditorSelection.single(10) }))
        const actions = createTSActions({ lang: 'typescript', fileName: '/f12-b.ts' })
        expect(await actions.goToDefinition(view)).toBe(false)
        expect(view.dom.querySelector('.cm-editor-message')!.textContent).toBe("No definition found for '1'")
        done()
    }, SLOW)

    it('已经站在唯一定义上:改跑 Go to References(Monaco alternativeDefinitionCommand)', async () => {
        clearTSServiceCache()
        const doc = 'function foo() { return 1 }\nfoo()\nfoo()\n'
        const { view, done } = mountView(doc)
        view.dispatch(view.state.update({ selection: EditorSelection.single(doc.indexOf('foo') + 1) }))
        const actions = createTSActions({ lang: 'typescript', fileName: '/f12-c.ts' })
        expect(await actions.goToDefinition(view)).toBe(true)
        expect(view.dom.querySelector('.cm-peek-title')!.textContent).toMatch(/References \(3\)/)
        done()
    }, SLOW)
})

describe('#15 灯泡:位置对齐 Monaco、codicon、跟随滚动、没焦点不显示', () => {
    const linesOf = (doc: string) => {
        const ls = doc.split('\n')
        return { text: (n: number) => ls[n - 1], count: ls.length }
    }

    it('lightbulbPlacement:缩进够宽放本行行首;上一行空放上一行;上下都是代码放 gutter', () => {
        // 缩进 4 格 × 8px = 32 > 22
        expect(lightbulbPlacement(linesOf('function f() {\n    let x: number = "s"\n}'), 2, 5, 32, 8)).toEqual({ kind: 'inline', line: 2, column: 1 })
        expect(lightbulbPlacement(linesOf('\nlet x: number = "s"\nfoo()'), 2, 1, 0, 8)).toEqual({ kind: 'inline', line: 1, column: 1 })
        expect(lightbulbPlacement(linesOf('a()\nlet x: number = "s"\n\n'), 2, 1, 0, 8)).toEqual({ kind: 'inline', line: 3, column: 1 })
        expect(lightbulbPlacement(linesOf('a()\nlet x: number = "s"\nb()'), 2, 1, 0, 8)).toEqual({ kind: 'gutter', line: 2 })
        expect(lightbulbPlacement(linesOf('let x: number = "s"'), 1, 1, 0, 8)).toEqual({ kind: 'gutter', line: 1 })
        // 第一行、下一行空 → 放到第 2 行
        expect(lightbulbPlacement(linesOf('let x: number = "s"\n\nb()'), 1, 1, 0, 8)).toEqual({ kind: 'inline', line: 2, column: 1 })
        // 目标行只有一个字符 → 第 2 列
        expect(lightbulbPlacement(linesOf('a()\nlet x: number = "s"\n}'), 2, 1, 0, 8)).toEqual({ kind: 'inline', line: 3, column: 2 })
    })

    it('真编辑器:没焦点不显示;聚焦后出 codicon 灯泡在缩进里(行盒顶);滚动跟着走;失焦保持,失焦后选区变了才藏', async () => {
        clearTSServiceCache()
        const doc = 'function f() {\n    const helloWorld = 1\n    helloWorl\n}\n'
        const { view, done } = mountView(doc, [diagnosticsField])
        // jsdom 没布局:按 行 × 18px、列 × 8px 造几何,scrollTop 参与
        let scrollTop = 0
        view.caretCoords = (pos: number) => {
            const l = view.state.doc.lineAt(pos)
            const top = (l.number - 1) * 18 - scrollTop + 100
            const left = 50 + (pos - l.from) * 8
            return { left, top: top + 2, bottom: top + 16, height: 14 }
        }
        view.lineBlockAt = (pos: number) => {
            const top = (view.state.doc.lineAt(pos).number - 1) * 18 + 100
            return { from: pos, to: pos, top, bottom: top + 18, height: 18 } as ReturnType<typeof view.lineBlockAt>
        }
        Object.defineProperty(view.scrollDOM, 'scrollTop', { configurable: true, get: () => scrollTop })
        view.dom.getBoundingClientRect = () => ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0, toJSON() {} }) as DOMRect
        view.scrollDOM.getBoundingClientRect = () => ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0, toJSON() {} }) as DOMRect
        const at = doc.lastIndexOf('helloWorl')
        view.dispatch(view.state.update({
            selection: EditorSelection.single(at + 3),
            effects: setDiagnostics.of([{ from: at, to: at + 9, severity: 'error', message: "Cannot find name 'helloWorl'.", code: 'ts(2552)', source: 'ts' }]),
        }))
        view.contentDOM.blur()
        const off = codeActionsLightbulb(view, { lang: 'typescript', fileName: '/bulb.ts' })
        const bulb = view.dom.querySelector<HTMLElement>('.cm-lightbulb')!
        expect(bulb.classList.contains('codicon')).toBe(true)
        expect(bulb.classList.contains('codicon-light-bulb')).toBe(true)
        expect(bulb.tagName).not.toBe('BUTTON')
        expect(bulb.textContent).not.toContain('💡')
        await new Promise(r => setTimeout(r, 800))
        expect(bulb.style.display).toBe('none') // 没焦点
        view.contentDOM.focus()
        view.contentDOM.dispatchEvent(new FocusEvent('focus'))
        expect(await until(() => bulb.style.display !== 'none', 20_000)).toBe(true)
        // 缩进里:第 3 行第 1 列
        expect(bulb.style.left).toBe('50px')
        expect(bulb.style.top).toBe('136px')
        scrollTop = 18
        view.scrollDOM.dispatchEvent(new Event('scroll'))
        expect(bulb.style.top).toBe('118px')
        view.contentDOM.blur()
        view.contentDOM.dispatchEvent(new FocusEvent('blur'))
        await new Promise(r => setTimeout(r, 400))
        expect(bulb.style.display).toBe('')
        view.dispatch(view.state.update({ selection: EditorSelection.single(1) }))
        expect(bulb.style.display).toBe('none')
        off()
        expect(view.dom.querySelector('.cm-lightbulb')).toBeNull()
        done()
    }, SLOW)
})

describe('#16 未使用淡显 / 废弃删除线(Monaco MarkerTag)', () => {
    const classesAt = (state: EditorState) => {
        const out: { from: number, to: number, cls: string }[] = []
        tsTagDecorations(state).between(0, state.doc.length, (from, to, v) => {
            out.push({ from, to, cls: (v as unknown as { attrs: { class: string } }).attrs.class })
        })
        return out
    }

    it('6133 未使用 → cm-unnecessary;@deprecated 调用 → cm-deprecated;编辑后跟着走', async () => {
        clearTSServiceCache()
        const doc = 'const unused = 1\n/** @deprecated use b */\nfunction old() {}\nold()\nexport {}\n'
        const { view, done } = mountView(doc, [diagnosticsField, tsTagField])
        const off = tsDiagnosticsSession(view, { lang: 'typescript', fileName: '/tags.ts', debounceMs: 1 })
        expect(await until(() => view.state.field(tsTagField).length >= 2)).toBe(true)
        const cls = classesAt(view.state)
        const u = cls.find(c => c.cls === 'cm-unnecessary')!
        expect(view.state.sliceDoc(u.from, u.to)).toBe('unused')
        const d = cls.find(c => c.cls === 'cm-deprecated')!
        expect(view.state.sliceDoc(d.from, d.to)).toBe('old')
        expect(d.from).toBe(doc.lastIndexOf('old'))
        // 未使用不是 error/warning/info:不进诊断表(不上 ruler)
        expect(view.state.field(diagnosticsField).some(x => x.code === '(6133)')).toBe(false)
        // 前面插字:标记跟着平移,不等 TS 重算
        view.dispatch(view.state.update({ changes: { from: 0, insert: '\n\n' } }))
        const u2 = classesAt(view.state).find(c => c.cls === 'cm-unnecessary')!
        expect(view.state.sliceDoc(u2.from, u2.to)).toBe('unused')
        off()
        done()
    }, SLOW)

    it('hover 未使用的符号:显示 TS 消息 + 代码(和类型信息合一张卡)', async () => {
        clearTSServiceCache()
        const doc = 'function f() { const unused = 1 }\nexport {}\n'
        const fileName = '/tags-hover.ts'
        const { view, done } = mountView(doc, [diagnosticsField, tsTagField, hoverSources.of(diagnosticHoverSource), tsTagHoverMarkers, hoverSources.of(tsQuickInfoSource({ lang: 'typescript', fileName }))])
        const off = tsDiagnosticsSession(view, { lang: 'typescript', fileName, debounceMs: 1 })
        expect(await until(() => view.state.field(tsTagField).length > 0)).toBe(true)
        view.dispatch(view.state.update({ selection: EditorSelection.single(doc.indexOf('unused') + 2) }))
        expect(await showHover(view)).toBe(true)
        expect(await until(() => !!view.dom.querySelector('.cm-tooltip-hover .cm-quickinfo'))).toBe(true)
        const card = view.dom.querySelector('.cm-tooltip-hover')!
        expect(card.querySelector('.cm-diagnostic-hint .cm-diagnostic-msg')!.textContent).toMatch(/declared but its value is never read/)
        // 第六轮 H:Monaco TS marker 不带 source,marker hover 显示 `(6133)`(见 tshover-r6-fix.test.ts 开头)
        expect(card.querySelector('.cm-diagnostic-hint .cm-diagnostic-code')!.textContent).toBe('(6133)')
        off()
        done()
    }, SLOW)

    it('lite-monaco 默认装;features.tsUnusedFade:false 不装', () => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const on = liteMonaco({ parent, highlighter: fakeHl(), doc: 'x', fileName: '/fade-on.ts' })
        expect(on.state.field(tsTagField, false)).toEqual([])
        const offv = liteMonaco({ parent, highlighter: fakeHl(), doc: 'x', fileName: '/fade-off.ts', features: { tsUnusedFade: false } })
        expect(offv.state.field(tsTagField, false)).toBeUndefined()
        on.destroy(); offv.destroy(); parent.remove()
    })
})
