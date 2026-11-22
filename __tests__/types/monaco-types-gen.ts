// 类型层平替的机器:读 monaco-editor 0.55.1 的 monaco.d.ts(权威),
//   1) 生成 src/monaco/{editor,languages,top}-types.ts —— `monaco.editor.*` / `monaco.languages.*` / 顶层 的类型出口
//      (lite-monaco 已有等价类型的名字映射到它(MAP),其余按官方声明原样移植,引用到的 Range/Uri/IEvent… 落到 lite-monaco 自己的实现);
//   2) 生成 __tests__/types/monaco-compat.test-d.ts —— 逐名字断言 lite 类型与官方类型的结构兼容(由 `tsc --noEmit -p .` 编译)。
// 生成:`npx tsx scripts/gen-monaco-types.ts`。不支持的成员只能写在 UNSUPPORTED 里并给出具体理由,不许放水。
import ts from 'typescript'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// vitest(jsdom 环境)里 import.meta.url 不是 file: URL,而 tsx 直接跑时没有 __dirname(ESM):两种都认
const HERE = typeof __dirname === 'string' ? __dirname : fileURLToPath(new URL('.', import.meta.url))
const ROOT = resolve(HERE, '../..')
export type Ns = 'editor' | 'languages'
export interface Decl { ns: Ns, name: string, kind: 'interface' | 'alias' | 'class' | 'enum' | 'const' | 'function', node: ts.Statement, arity: number }
export interface TopDecl { name: string, node: ts.Statement, kind: Decl['kind'] }

/** lite-monaco 已有的等价类型:Monaco 名 -> [模块(相对 src/monaco), lite 里的导出名]。名字相同不等于结构相同,是否兼容由 compat 断言说了算。 */
export const MANUAL_MAP: Record<string, [string, string]> = {
    'editor.IStandaloneCodeEditor': ['../api/types', 'LiteMonacoEditor'],
}
/** 同名但语义不同、不能自动映射的(名字相撞的内部类型)。 */
export const NO_AUTO_MAP = new Set<string>([])
const PRIO = ['api/model', 'api/commands', 'api/types', 'core/options/types', 'api/decorations', 'lang/languageselector', 'core/diff/options']

/** 自动映射:src 里(不含 src/monaco)有同名导出的接口/类型,就用它;多处定义按 PRIO 取。 */
export function buildAutoMap(names: { ns: Ns, name: string }[]): Record<string, [string, string]> {
    const defs = new Map<string, string[]>()
    const walk = (d: string): void => {
        for (const e of readdirSync(d)) {
            const p = join(d, e)
            if (statSync(p).isDirectory()) { if (e !== 'monaco') walk(p); continue }
            if (!p.endsWith('.ts') || p.endsWith('.d.ts')) continue
            const t = readFileSync(p, 'utf8')
            for (const m of t.matchAll(/^export (?:declare )?(interface|type) (\w+)/gm)) {
                const mod = p.slice(resolve(ROOT, 'src').length + 1).replace(/\.ts$/, '')
                ;(defs.get(m[2]) ?? defs.set(m[2], []).get(m[2])!).push(mod)
            }
        }
    }
    walk(resolve(ROOT, 'src'))
    const out: Record<string, [string, string]> = {}
    for (const { ns, name } of names) {
        const key = `${ns}.${name}`
        if (NO_AUTO_MAP.has(key)) continue
        const d = defs.get(name)
        if (!d) continue
        d.sort((a, b) => (PRIO.indexOf(a) < 0 ? 99 : PRIO.indexOf(a)) - (PRIO.indexOf(b) < 0 ? 99 : PRIO.indexOf(b)))
        out[key] = ['../' + d[0], name]
    }
    return out
}

/** 兼容方向:both=双向可赋值(数据/选项类);out=lite→官方(lite 产出、用户只读用的对象);in=官方→lite(用户实现、lite 消费的 provider 类) */
export const DIRECTION: Record<string, 'both' | 'out' | 'in'> = {}
/** lite 产出、用户只读的对象:编辑器 / 模型 / 视图模型 / 事件载荷。方向只有 lite→官方(用户不会造一个 ITextModel 塞给 lite)。 */
const OUT_ONLY = new Set(['ITextModel', 'IReadOnlyModel', 'IModel', 'IEditorModel', 'ICodeEditor', 'IStandaloneCodeEditor', 'IStandaloneDiffEditor', 'IDiffEditor', 'IEditor',
    'IDiffEditorModel', 'IDiffEditorViewModel', 'IEditorAction', 'IContextKey', 'IModelDecoration', 'IEditorDecorationsCollection', 'IComputedEditorOptions', 'IEditorOption',
    'EditorLayoutInfo', 'EditorMinimapLayoutInfo', 'EditorWrappingInfo', 'OverviewRulerPosition', 'IEditorZoom', 'ICursorState', 'MonacoWebWorker', 'ISerializedModelContentChangedEvent'])
/** 用户实现 / 构造后交给 lite 消费的对象:方向只有 官方→lite(用户手里是 Monaco 类型,传进 lite 的 API)。 */
const IN_ONLY = new Set(['IActionDescriptor', 'ICodeEditorOpener', 'ILinkOpener', 'IContentWidget', 'IOverlayWidget', 'IGlyphMarginWidget', 'IViewZone', 'ICommand', 'IEditorContribution',
    'IStandaloneEditorConstructionOptions', 'IStandaloneDiffEditorConstructionOptions', 'IEditorConstructionOptions', 'IDiffEditorConstructionOptions', 'IKeybindingRule', 'IEditorOverrideServices',
    'ICommandHandler', 'ICursorStateComputer', 'IEditOperationBuilder'])
export function directionOf(ns: string, name: string, kind: string): 'both' | 'out' | 'in' {
    const key = `${ns}.${name}`
    if (DIRECTION[key]) return DIRECTION[key]
    if (kind === 'class') return 'out'
    if (ns === 'editor' && IN_ONLY.has(name)) return 'in'
    if (ns === 'editor' && OUT_ONLY.has(name)) return 'out'
    if (/Event$/.test(name) || /^IMouseTarget/.test(name) || name === 'IBaseMouseTarget') return 'out'
    // 用户实现、lite 消费:各种 provider
    if (ns === 'languages' && /Provider$/.test(name)) return 'in'
    return 'both'
}

/** 确实没实现的:整型跳过 {skip} 或某些成员排除 {omit},必须写具体理由。 */
export const UNSUPPORTED: Record<string, { omit?: string[], skip?: boolean, reason: string }> = {
    // 这两条不是「没实现」,而是 TS 的限制:getOption<T> 的返回是未实例化 T 上的延迟条件类型(FindComputedEditorOptionValueById<T>),
    // 两份独立声明的同构类型在泛型参数未定时 TS 不会判兼容。等价的检查换成 __tests__/types/monaco-options-compat.test-d.ts:
    // 对每个具体选项键断言 EditorOptions[key].defaultValue 的类型与官方双向兼容(即 getOption(id) 对每个具体 id 的返回类型一致)。
    'editor.ICodeEditor': { omit: ['getOption'], reason: '泛型 getOption 的延迟条件类型无法跨声明比较;逐键检查见 monaco-options-compat.test-d.ts' },
    'editor.IDiffEditor': { omit: ['getOriginalEditor', 'getModifiedEditor'], reason: '同上:两侧是 ICodeEditor,其 getOption 的泛型比较;ICodeEditor 本身仍按其余成员逐项检查' },
}

/** 顶层(`monaco.X`)类型:lite 已有的从 index 取;lite 没有的按官方声明原样移植。 */
const TOP_FROM_INDEX = ['IDisposable', 'IEvent', 'CancellationToken', 'IPosition', 'IRange', 'ISelection', 'IKeyboardEvent', 'IMouseEvent', 'IScrollEvent',
    'Uri', 'Position', 'Range', 'Selection', 'MarkerSeverity', 'MarkerTag', 'Token']
const TOP_VENDORED = ['Thenable', 'UriComponents', 'IMarkdownString', 'MarkdownStringTrustedOptions', 'Environment', 'ITrustedTypePolicyOptions', 'ITrustedTypePolicy', 'IWebWorkerOptions']
const ALIAS_FIX: Record<string, string> = { 'IDisposable$2': 'IDisposable', 'IEvent$1': 'IEvent' }

export function loadDts(): ts.SourceFile {
    const file = resolve(ROOT, 'node_modules/monaco-editor/monaco.d.ts')
    return ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
}

function kindOf(n: ts.Statement): Decl['kind'] | null {
    if (ts.isInterfaceDeclaration(n)) return 'interface'
    if (ts.isTypeAliasDeclaration(n)) return 'alias'
    if (ts.isClassDeclaration(n)) return 'class'
    if (ts.isEnumDeclaration(n)) return 'enum'
    if (ts.isFunctionDeclaration(n)) return 'function'
    if (ts.isVariableStatement(n)) return 'const'
    return null
}

export function readDecls(sf = loadDts()): { decls: Decl[], top: TopDecl[] } {
    const decls: Decl[] = []
    const top: TopDecl[] = []
    let seenLangs = false
    for (const st of sf.statements) {
        if (ts.isModuleDeclaration(st) && (st.name.text === 'editor' || st.name.text === 'languages') && st.body && ts.isModuleBlock(st.body)) {
            if (st.name.text === 'languages') { if (seenLangs) continue; seenLangs = true }
            for (const s of st.body.statements) {
                const kind = kindOf(s)
                if (!kind) continue
                if (ts.isVariableStatement(s)) { for (const d of s.declarationList.declarations) decls.push({ ns: st.name.text as Ns, name: (d.name as ts.Identifier).text, kind, node: s, arity: 0 }); continue }
                const name = (s as ts.Statement & { name: ts.Identifier }).name.text
                const arity = (s as ts.InterfaceDeclaration).typeParameters?.length ?? 0
                decls.push({ ns: st.name.text as Ns, name, kind, node: s, arity })
            }
        } else if (!ts.isModuleDeclaration(st)) {
            const kind = kindOf(st)
            const nm = (st as ts.Statement & { name?: ts.Identifier }).name?.text
            if (kind && nm) top.push({ name: ALIAS_FIX[nm] ?? nm, node: st, kind })
        }
    }
    return { decls, top }
}

/** 官方声明里 `editor` 的类型出口里 IMouseEvent 等引用的顶层名字(经 top-types 取到 lite 的实现)。 */
const TOP_NAMES = new Set([...TOP_FROM_INDEX, ...TOP_VENDORED])

interface Rewritten { text: string, topUsed: Set<string>, ed: boolean, lg: boolean }

/** 把声明文本里的名字重写成在 lite-monaco 里可解析的形式。 */
function rewrite(node: ts.Statement, ns: Ns, localTypes: Set<string>, nsOther: Set<string>, sf: ts.SourceFile, exportIt: boolean): Rewritten {
    const edits: { pos: number, end: number, text: string }[] = []
    const topUsed = new Set<string>()
    const out: Rewritten = { text: '', topUsed, ed: false, lg: false }
    const tparams = new Set<string>()
    const collect = (n: ts.Node): void => { if (ts.isTypeParameterDeclaration(n)) tparams.add(n.name.text); ts.forEachChild(n, collect) }
    collect(node)
    const self = ns === 'editor' ? 'ED' : 'LG'
    const fixHead = (id: ts.Identifier): void => {
        const t = id.text
        if (tparams.has(t)) return
        const fixed = ALIAS_FIX[t] ?? t
        if (fixed !== t) { edits.push({ pos: id.getStart(sf), end: id.end, text: fixed }); topUsed.add(fixed); return }
        if (localTypes.has(t)) return
        if (nsOther.has(t)) { edits.push({ pos: id.getStart(sf), end: id.end, text: `${self}.${t}` }); if (ns === 'editor') out.ed = true; else out.lg = true; return }
        if (t === 'editor' || t === 'languages') {
            edits.push({ pos: id.getStart(sf), end: id.end, text: t === 'editor' ? 'ED' : 'LG' })
            if (t === 'editor') out.ed = true; else out.lg = true
            return
        }
        if (TOP_NAMES.has(t)) topUsed.add(t)
    }
    const head = (e: ts.EntityName | ts.Expression): ts.Identifier | null => {
        let c: ts.Node = e
        while (ts.isQualifiedName(c) || ts.isPropertyAccessExpression(c)) c = ts.isQualifiedName(c) ? c.left : c.expression
        return ts.isIdentifier(c) ? c : null
    }
    const visit = (n: ts.Node): void => {
        let h: ts.Identifier | null = null
        if (ts.isTypeReferenceNode(n)) h = head(n.typeName)
        else if (ts.isExpressionWithTypeArguments(n)) h = head(n.expression)
        else if (ts.isTypeQueryNode(n)) h = head(n.exprName)
        if (h) fixHead(h)
        ts.forEachChild(n, visit)
    }
    visit(node)
    const start = node.getStart(sf)
    if (exportIt && !(ts.getCombinedModifierFlags(node as unknown as ts.Declaration) & ts.ModifierFlags.Export)) edits.push({ pos: start, end: start, text: 'export ' })
    // 保留前导 JSDoc:从 fullStart 起(去掉前导空白)
    const full = node.getFullStart()
    const raw = sf.text
    let text = raw.slice(full, node.end)
    edits.sort((a, b) => b.pos - a.pos)
    for (const e of edits) text = text.slice(0, e.pos - full) + e.text + text.slice(e.end - full)
    // 官方用 tab;统一成 4 空格
    out.text = text.replace(/^\s*\n/, '').replace(/\t/g, '    ').replace(/^\n+/, '').replace(/\.\.\.arguments\b/g, '...args')
    return out
}

const HEADER = (what: string): string => `// 由 scripts/gen-monaco-types.ts 生成,勿手改(改 __tests__/types/monaco-types-gen.ts 的 MAP/生成逻辑)。
// ${what}
// 声明移植自 monaco-editor 0.55.1 的 monaco.d.ts(Microsoft, MIT);已有 lite-monaco 等价类型的名字直接映射到它。
`

function importLines(imports: Map<string, Set<string>>): string {
    return [...imports].map(([m, names]) => `import type { ${[...names].sort().join(', ')} } from '${m}'`).join('\n')
}

export interface Generated { editor: string, languages: string, top: string, compat: string }

export function generate(): Generated {
    const sf = loadDts()
    const { decls, top } = readDecls(sf)
    const MAP: Record<string, [string, string]> = { ...buildAutoMap(decls.filter(d => d.kind === 'interface' || d.kind === 'alias')), ...MANUAL_MAP }
    const res: Partial<Generated> = {}
    for (const ns of ['editor', 'languages'] as const) {
        const mine = decls.filter(d => d.ns === ns)
        const types = mine.filter(d => d.kind === 'interface' || d.kind === 'alias')
        const localTypes = new Set(types.map(d => d.name))
        const nsOther = new Set(mine.filter(d => d.kind === 'class' || d.kind === 'enum' || d.kind === 'const').map(d => d.name))
        const imports = new Map<string, Set<string>>()
        const aliasImports: string[] = []
        const exportsOf: string[] = []
        const body: string[] = []
        let needTop = new Set<string>(), ed = false, lg = false
        for (const d of types) {
            const m = MAP[`${ns}.${d.name}`]
            if (m) {
                aliasImports.push(`import type { ${m[1] === d.name ? d.name : `${m[1]} as ${d.name}`} } from '${m[0]}'`)
                exportsOf.push(d.name)
                continue
            }
            const r = rewrite(d.node, ns, localTypes, nsOther, sf, true)
            body.push(r.text)
            r.topUsed.forEach(x => needTop.add(x))
            ed ||= r.ed; lg ||= r.lg
        }
        const parts: string[] = [HEADER(`monaco.${ns} 的类型出口(接口/类型别名;枚举与类是值,由 ./${ns} 导出)。`)]
        const nsImports: string[] = []
        if (ed) nsImports.push(`import type * as ED from './editor'`)
        if (lg) nsImports.push(`import type * as LG from './languages'`)
        if (needTop.size) imports.set('./top-types', needTop)
        parts.push([importLines(imports), ...aliasImports, ...nsImports].filter(Boolean).join('\n'))
        if (exportsOf.length) parts.push(`export type { ${exportsOf.join(', ')} }`)
        parts.push(body.join('\n\n'))
        res[ns] = parts.join('\n\n') + '\n'
        needTop = new Set()
    }
    // top-types
    const tparts: string[] = [HEADER('monaco 顶层类型(`monaco.IDisposable` 等)。lite 已有的取 ../index,没有的按官方声明移植。')]
    tparts.push(`import type { ${TOP_FROM_INDEX.join(', ')} } from '../index'`)
    tparts.push(`export type { ${TOP_FROM_INDEX.join(', ')} }`)
    const vend: string[] = []
    for (const name of TOP_VENDORED) {
        const t = top.find(x => x.name === name)
        if (!t) throw new Error(`monaco.d.ts 顶层没有 ${name}`)
        const r = rewrite(t.node, 'editor', new Set(TOP_VENDORED), new Set(), sf, true)
        vend.push(r.text)
    }
    tparts.push(vend.join('\n\n'))
    res.top = tparts.join('\n\n') + '\n'
    res.compat = genCompat(decls, top)
    return res as Generated
}

function genCompat(decls: Decl[], top: TopDecl[]): string {
    const lines: string[] = [
        '// 由 scripts/gen-monaco-types.ts 生成,勿手改。lite-monaco 的类型 vs 官方 monaco-editor 0.55.1 的类型:逐名字结构兼容断言。',
        '// 出错信息逐成员列出差异;确实没实现的写在 __tests__/types/monaco-types-gen.ts 的 UNSUPPORTED(带理由)。',
        `import type * as L from '../../src/index'`,
        `import type * as M from 'monaco-editor'`,
        '',
    ]
    const omitOf = (key: string, t: string): string => {
        const u = UNSUPPORTED[key]
        return u?.omit?.length ? `Omit<${t}, ${u.omit.map(x => `'${x}'`).join(' | ')}>` : t
    }
    const emit = (key: string, lt: string, mt: string, dir: 'both' | 'out' | 'in'): void => {
        const id = key.replace(/\W/g, '_')
        if (UNSUPPORTED[key]?.skip) return
        const l = omitOf(key, lt), m = omitOf(key, mt)
        if (dir !== 'in') lines.push(`export const out_${id} = (a: ${l}): ${m} => a`)
        if (dir !== 'out') lines.push(`export const in_${id} = (a: ${m}): ${l} => a`)
    }
    const args = (n: number): string => n ? `<${Array(n).fill('any').join(', ')}>` : ''
    for (const d of decls) {
        if (d.kind === 'const' || d.kind === 'function') continue
        const key = `${d.ns}.${d.name}`
        // 类:lite 的实现比官方声明多成员(私有字段、内部方法),所以只要求 lite→官方;接口默认双向
        emit(key, `L.${d.ns}.${d.name}${args(d.arity)}`, `M.${d.ns}.${d.name}${args(d.arity)}`, directionOf(d.ns, d.name, d.kind))
    }
    const seenTop = new Set<string>()
    for (const t of top) {
        if (seenTop.has(t.name)) continue
        seenTop.add(t.name)
        if (!(TOP_FROM_INDEX.includes(t.name) || TOP_VENDORED.includes(t.name))) continue
        const arity = (t.node as ts.InterfaceDeclaration).typeParameters?.length ?? 0
        const key = `top.${t.name}`
        emit(key, `L.${t.name}${args(arity)}`, `M.${t.name}${args(arity)}`, DIRECTION[key] ?? 'both')
    }
    return lines.join('\n') + '\n'
}

export const GENERATED_FILES = {
    editor: 'src/monaco/editor-types.ts',
    languages: 'src/monaco/languages-types.ts',
    top: 'src/monaco/top-types.ts',
    compat: '__tests__/types/monaco-compat.test-d.ts',
} as const
export const rootDir = ROOT

/** 编译 compat 文件,按断言名返回诊断(取诊断链最深的两层,去掉绝对路径)。vitest 与手动排查共用。 */
export function compatDiagnostics(file: string = resolve(ROOT, GENERATED_FILES.compat), depth = 2): { id: string, msg: string }[] {
    const cfg = ts.readConfigFile(resolve(ROOT, 'tsconfig.json'), ts.sys.readFile)
    const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, ROOT)
    const program = ts.createProgram([file], parsed.options)
    const sfile = program.getSourceFile(file)!
    const clean = (s: string): string => s.replace(/import\("[^"]*?\/(?:src|monaco-editor\/esm\/vs\/editor)\/([^"]*)"\)/g, (_m, p: string) => p.includes('editor.api') ? 'M' : `L:${p}`)
    return ts.getPreEmitDiagnostics(program, sfile).map(d => {
        const text = d.file ? d.file.text : ''
        const line = d.file && d.start != null ? text.slice(text.lastIndexOf('\n', d.start) + 1, text.indexOf('\n', d.start)) : ''
        const id = /export const (\w+)/.exec(line)?.[1] ?? `?${d.start}`
        const chain: string[] = []
        let m: ts.DiagnosticMessageChain | undefined = typeof d.messageText === 'string' ? undefined : d.messageText
        if (typeof d.messageText === 'string') chain.push(d.messageText)
        while (m) { chain.push(m.messageText); m = m.next?.[0] }
        const tail = chain.slice(-depth).map(clean).join(' => ')
        return { id, msg: tail }
    })
}
