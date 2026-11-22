// @vitest-environment node
// 类型层平替验收(权威 = monaco-editor 0.55.1 的 monaco.d.ts):
//   1) d.ts 里 editor / languages 命名空间的每个 interface / type / enum 都能从 lite-monaco 的 `editor.*` / `languages.*` 取到;
//      顶层(`monaco.X`)的类型出口也齐。类 / 函数 / 常量是值,归 monaco-api-conformance.test.ts,这里只记账。
//   2) __tests__/types/monaco-compat.test-d.ts(由 scripts/gen-monaco-types.ts 生成)里逐名字的结构兼容断言全部通过;
//      例外只能写在 PENDING_VALUES(类型引用的值还没落地)或 monaco-types-gen.ts 的 UNSUPPORTED(带具体理由)。
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import { UNSUPPORTED, compatDiagnostics, readDecls, rootDir } from './monaco-types-gen'

/**
 * 生成的类型引用到、但运行时值还没导出的类(由 editor / languages 值导出那一侧补齐,见 monaco-api-conformance.test.ts)。
 * 值一落地对应断言自然变绿;这里只是容许「值还没来」那一类失败,不容许别的失败。
 */
const PENDING_VALUES = new Set([
    'out_editor_ApplyUpdateResult', 'out_editor_FontInfo', 'out_editor_BareFontInfo',
    'out_languages_EditDeltaInfo', 'out_languages_SelectedSuggestionInfo', 'out_languages_FoldingRangeKind',
])

function program() {
    const cfg = ts.readConfigFile(resolve(rootDir, 'tsconfig.json'), ts.sys.readFile)
    const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, rootDir)
    const entry = resolve(rootDir, 'src/index.ts')
    const p = ts.createProgram([entry], parsed.options)
    const checker = p.getTypeChecker()
    const exps = checker.getExportsOfModule(checker.getSymbolAtLocation(p.getSourceFile(entry)!)!)
    const members = (name: string): Set<string> => {
        const sym = exps.find(e => e.name === name)!
        return new Set(checker.getExportsOfModule(sym.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(sym) : sym).map(x => x.name))
    }
    return { top: new Set(exps.map(e => e.name)), editor: members('editor'), languages: members('languages') }
}

/** monaco.d.ts 顶层里属于 monaco 本体的类型(其余是 monaco-json / css / html / typescript 贡献包的声明,不在 `import * as monaco` 的 API 里) */
const TOP_TYPES = ['Thenable', 'UriComponents', 'IMarkdownString', 'MarkdownStringTrustedOptions', 'Environment', 'ITrustedTypePolicy', 'ITrustedTypePolicyOptions',
    'IDisposable', 'IEvent', 'CancellationToken', 'IPosition', 'IRange', 'ISelection', 'IKeyboardEvent', 'IMouseEvent', 'IScrollEvent']

describe('monaco 类型出口', () => {
    const { decls } = readDecls()
    const exported = program()
    const typeKinds = new Set(['interface', 'alias', 'enum'])

    it('editor / languages 命名空间:每个 interface / type / enum 都导出', () => {
        const missing = decls.filter(d => typeKinds.has(d.kind) && !exported[d.ns].has(d.name)).map(d => `${d.ns}.${d.name}`)
        expect(missing).toEqual([])
    })

    it('顶层类型出口齐', () => {
        expect(TOP_TYPES.filter(n => !exported.top.has(n))).toEqual([])
    })

    it('账目:类型总数', () => {
        const types = decls.filter(d => typeKinds.has(d.kind))
        expect(types.length).toBeGreaterThan(300) // 257 interface + 36 alias + 44 enum
    })
}, 120_000)

describe('lite ↔ Monaco 结构兼容(生成的断言,tsc 编译)', () => {
    const diags = compatDiagnostics()

    it('除 PENDING_VALUES 外零失败', () => {
        const unexpected = diags.filter(d => !PENDING_VALUES.has(d.id))
        expect(unexpected).toEqual([])
    })

    it('PENDING_VALUES 只容许是「缺值」类失败', () => {
        for (const d of diags.filter(x => PENDING_VALUES.has(x.id))) expect(d.msg).toMatch(/has no exported member/)
    })

    it('UNSUPPORTED 每条都有具体理由', () => {
        for (const [k, u] of Object.entries(UNSUPPORTED)) expect(u.reason.length, k).toBeGreaterThan(20)
    })
}, 120_000)
