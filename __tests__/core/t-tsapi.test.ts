// monaco.languages.typescript.typescriptDefaults / javascriptDefaults 形状 + 诊断选项逐项生效
import { afterEach, describe, expect, it } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { EditorView } from '../../src/core/view/editorview'
import { diagnosticsField } from '../../src/core/feature/diagnostics'
import { tsDiagnosticsSession, tsTagField } from '../../src/lang/tsdiagnostics'
import { clearTSServiceCache, listTsFiles, getTsCompilerOptions } from '../../src/lang/tsservice'
import { typescriptDefaults, javascriptDefaults, defaultsFor } from '../../src/lang/tsapi'
import * as pkg from '../../src/index'

const SLOW = 60_000
const TS_DEFAULT = { noSemanticValidation: false, noSyntaxValidation: false, onlyVisible: false }

afterEach(() => {
    typescriptDefaults.setDiagnosticsOptions({ ...TS_DEFAULT })
    javascriptDefaults.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: false, onlyVisible: false })
    typescriptDefaults.setInlayHintsOptions({})
})

async function until(pred: () => boolean, ms = 20_000) {
    const end = Date.now() + ms
    while (Date.now() < end) {
        if (pred()) return true
        await new Promise(r => setTimeout(r, 20))
    }
    return false
}

function mount(doc: string, fileName: string, lang = 'typescript', clear = true) {
    if (clear) clearTSServiceCache()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const view = new EditorView({ state: EditorState.create({ doc, extensions: [diagnosticsField, tsTagField] }), parent: host })
    const off = tsDiagnosticsSession(view, { lang, fileName, debounceMs: 1 })
    const codes = () => (view.state.field(diagnosticsField)).filter(d => d.source === 'ts').map(d => d.code)
    return { view, codes, done: () => { off(); view.destroy(); host.remove() } }
}

describe('typescriptDefaults / javascriptDefaults 形状', () => {
    it('从 index 导出;默认值照 Monaco', () => {
        expect(pkg.typescriptDefaults).toBe(typescriptDefaults)
        expect(pkg.javascriptDefaults).toBe(javascriptDefaults)
        expect(typescriptDefaults.getDiagnosticsOptions()).toEqual(TS_DEFAULT)
        expect(javascriptDefaults.getDiagnosticsOptions()).toEqual({ noSemanticValidation: true, noSyntaxValidation: false, onlyVisible: false })
        expect(typescriptDefaults.getCompilerOptions()).toEqual({ allowNonTsExtensions: true, target: 99 })
        expect(javascriptDefaults.getCompilerOptions()).toEqual({ allowNonTsExtensions: true, allowJs: true, target: 99 })
        expect(typescriptDefaults.inlayHintsOptions).toEqual({})
        expect(typescriptDefaults.getEagerModelSync()).toBe(false)
        expect(defaultsFor('tsx')).toBe(typescriptDefaults)
        expect(defaultsFor('jsx')).toBe(javascriptDefaults)
    })

    it('onDidChange 在 setDiagnosticsOptions / setCompilerOptions / setInlayHintsOptions 时触发,dispose 后不再触发', () => {
        let n = 0
        const d = typescriptDefaults.onDidChange(e => { expect(e).toBe(typescriptDefaults); n++ })
        typescriptDefaults.setDiagnosticsOptions({ noSyntaxValidation: true })
        expect(typescriptDefaults.getDiagnosticsOptions()).toEqual({ noSyntaxValidation: true })
        typescriptDefaults.setInlayHintsOptions({ includeInlayParameterNameHints: 'all' })
        expect(typescriptDefaults.inlayHintsOptions.includeInlayParameterNameHints).toBe('all')
        expect(n).toBe(2)
        d.dispose()
        typescriptDefaults.setDiagnosticsOptions({ ...TS_DEFAULT })
        expect(n).toBe(2)
    })

    it('addExtraLib / setExtraLibs / getExtraLibs / onDidExtraLibsChange(异步合并)', async () => {
        clearTSServiceCache()
        let fired = 0
        const sub = typescriptDefaults.onDidExtraLibsChange(() => { fired++ })
        const lib = typescriptDefaults.addExtraLib('declare const __t_x: number', 'ts:t-extra/x.d.ts')
        typescriptDefaults.addExtraLib('declare const __t_y: number', 'ts:t-extra/y.d.ts')
        expect(fired).toBe(0)
        await new Promise(r => setTimeout(r, 5))
        expect(fired).toBe(1)
        expect(typescriptDefaults.getExtraLibs()['ts:t-extra/x.d.ts']).toEqual({ content: 'declare const __t_x: number', version: 1 })
        expect(listTsFiles({ lang: 'typescript' })).toContain('/ts:t-extra/x.d.ts')
        // 同内容再加 = 什么都不变
        typescriptDefaults.addExtraLib('declare const __t_x: number', 'ts:t-extra/x.d.ts')
        await new Promise(r => setTimeout(r, 5))
        expect(fired).toBe(1)
        lib.dispose()
        expect(typescriptDefaults.getExtraLibs()['ts:t-extra/x.d.ts']).toBeUndefined()
        expect(listTsFiles({ lang: 'typescript' })).not.toContain('/ts:t-extra/x.d.ts')
        await new Promise(r => setTimeout(r, 5))
        expect(fired).toBe(2)
        typescriptDefaults.setExtraLibs([{ content: 'declare const __t_z: number', filePath: 'ts:t-extra/z.d.ts' }])
        expect(Object.keys(typescriptDefaults.getExtraLibs())).toEqual(['ts:t-extra/z.d.ts'])
        expect(listTsFiles({ lang: 'typescript' })).not.toContain('/ts:t-extra/y.d.ts')
        typescriptDefaults.setExtraLibs([])
        sub.dispose()
    })

    it('没给 filePath:自动取名 ts:extralib-…', () => {
        const d = typescriptDefaults.addExtraLib('declare const __t_auto: 1')
        expect(Object.keys(typescriptDefaults.getExtraLibs()).some(k => k.startsWith('ts:extralib-'))).toBe(true)
        d.dispose()
        expect(Object.keys(typescriptDefaults.getExtraLibs())).toEqual([])
    })

    it('额外库里的声明被诊断用到', async () => {
        clearTSServiceCache()
        typescriptDefaults.setExtraLibs([{ content: 'declare const __t_inject: number', filePath: 'ts:t-inject.d.ts' }])
        const m = mount('const a: string = __t_inject\n', '/t-extra-use.ts', 'typescript', false)
        expect(await until(() => m.codes().includes('(2322)'))).toBe(true)
        expect(m.codes()).not.toContain('(2304)')
        m.done()
        typescriptDefaults.setExtraLibs([])
    }, SLOW)

    it('setCompilerOptions 是替换:上次设的、这次没有的键撤销', () => {
        clearTSServiceCache()
        typescriptDefaults.setCompilerOptions({ strict: true, noImplicitAny: true })
        expect(getTsCompilerOptions({ lang: 'typescript' })).toMatchObject({ strict: true, noImplicitAny: true })
        typescriptDefaults.setCompilerOptions({ strict: false })
        const o = getTsCompilerOptions({ lang: 'typescript' })
        expect(o.strict).toBe(false)
        expect('noImplicitAny' in o).toBe(false)
        typescriptDefaults.setCompilerOptions({ allowNonTsExtensions: true, target: 99 })
    })

    it('setEagerModelSync / setWorkerOptions / setMaximumWorkerIdleTime 不抛', () => {
        typescriptDefaults.setEagerModelSync(true)
        expect(typescriptDefaults.getEagerModelSync()).toBe(true)
        typescriptDefaults.setEagerModelSync(false)
        typescriptDefaults.setWorkerOptions({ customWorkerPath: 'x' })
        expect(typescriptDefaults.workerOptions).toEqual({ customWorkerPath: 'x' })
        typescriptDefaults.setWorkerOptions({})
        expect(() => typescriptDefaults.setMaximumWorkerIdleTime(1)).not.toThrow()
    })
})

describe('setDiagnosticsOptions 逐项生效', () => {
    const DOC = 'const a: number = "x"\nlet = \n' // 语义错 2322 + 语法错
    it('默认:语法 + 语义都有', async () => {
        const m = mount(DOC, '/t-diag-default.ts')
        expect(await until(() => m.codes().includes('(2322)') && m.codes().some(c => c !== '(2322)'))).toBe(true)
        m.done()
    }, SLOW)

    it('noSemanticValidation:只剩语法错误(不重挂也生效:onDidChange 重算)', async () => {
        const m = mount(DOC, '/t-diag-nosem.ts')
        expect(await until(() => m.codes().includes('(2322)'))).toBe(true)
        typescriptDefaults.setDiagnosticsOptions({ noSemanticValidation: true })
        expect(await until(() => !m.codes().includes('(2322)'))).toBe(true)
        expect(m.codes().length).toBeGreaterThan(0)
        m.done()
    }, SLOW)

    it('noSyntaxValidation:只剩语义错误', async () => {
        typescriptDefaults.setDiagnosticsOptions({ noSyntaxValidation: true })
        const m = mount(DOC, '/t-diag-nosyn.ts')
        expect(await until(() => m.codes().includes('(2322)'))).toBe(true)
        await new Promise(r => setTimeout(r, 100))
        // 1xxx = 语法类诊断码:一条都不该有
        expect(m.codes().some(c => /^\(1\d{3}\)$/.test(c ?? ''))).toBe(false)
        m.done()
    }, SLOW)

    it('diagnosticCodesToIgnore:忽略指定码', async () => {
        typescriptDefaults.setDiagnosticsOptions({ diagnosticCodesToIgnore: [2322] })
        const m = mount(DOC, '/t-diag-ignore.ts')
        expect(await until(() => m.codes().length > 0)).toBe(true)
        await new Promise(r => setTimeout(r, 100))
        expect(m.codes()).not.toContain('(2322)')
        m.done()
    }, SLOW)

    it('noSuggestionDiagnostics:未使用淡显不再产生;开关切换时撤掉已有的', async () => {
        const doc = 'function f() { const unused = 1 }\n'
        const m = mount(doc, '/t-diag-sug.ts')
        expect(await until(() => m.view.state.field(tsTagField).length > 0)).toBe(true)
        typescriptDefaults.setDiagnosticsOptions({ noSuggestionDiagnostics: true })
        expect(await until(() => m.view.state.field(tsTagField).length === 0)).toBe(true)
        m.done()
    }, SLOW)

    it('JS 默认不做语义;javascriptDefaults 打开 noSemanticValidation:false 才有(checkJs)', async () => {
        const doc = '// @ts-check\nconst a = 1\na.foo()\n'
        const m = mount(doc, '/t-js-sem.js', 'javascript')
        await new Promise(r => setTimeout(r, 300))
        expect(m.codes()).not.toContain('(2339)')
        javascriptDefaults.setDiagnosticsOptions({ noSemanticValidation: false })
        expect(await until(() => m.codes().includes('(2339)'))).toBe(true)
        m.done()
    }, SLOW)

    it('onlyVisible:没挂在页面上不诊断', async () => {
        typescriptDefaults.setDiagnosticsOptions({ onlyVisible: true })
        clearTSServiceCache()
        const view = new EditorView({ state: EditorState.create({ doc: 'const a: number = "x"\n', extensions: [diagnosticsField, tsTagField] }) })
        const off = tsDiagnosticsSession(view, { lang: 'typescript', fileName: '/t-visible.ts', debounceMs: 1 })
        await new Promise(r => setTimeout(r, 300))
        expect(view.state.field(diagnosticsField).length).toBe(0)
        // 挂上去后,下一次变更 / 选项变更重算
        const host = document.createElement('div')
        document.body.appendChild(host)
        host.appendChild(view.dom)
        typescriptDefaults.setDiagnosticsOptions({ onlyVisible: true, noSuggestionDiagnostics: true })
        expect(await until(() => view.state.field(diagnosticsField).some(d => d.source === 'ts'))).toBe(true)
        // 摘下来:清掉
        view.dom.remove()
        typescriptDefaults.setDiagnosticsOptions({ onlyVisible: true })
        expect(await until(() => !view.state.field(diagnosticsField).some(d => d.source === 'ts'))).toBe(true)
        off(); view.destroy(); host.remove()
    }, SLOW)
})
