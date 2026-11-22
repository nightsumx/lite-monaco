// 语言服务一侧:项目状态 + typescript LanguageService + 请求分发。
//
// 对齐 Monaco「同一个 worker 里所有 model 互相可见」:同一语言族(TS:typescript/ts/tsx;JS:javascript/js/jsx)
// 的所有编辑器共用一个项目 = 一个虚拟文件系统 + 一个 LanguageService。
//
// 虚拟 FS:
//   打开的文件       编辑器缓冲(主线程以补丁同步过来)
//   宿主文件         setTsFiles / updateTsFile / 编辑器的 tsFiles 选项(Monaco extraLibs 的对应物)
//   lib.es* / dom*   标准库(第一次请求时注入)
// 同路径时打开的缓冲优先于宿主文件。
//
// 模块解析:Bundler(Monaco 未设 module 时落 Classic;Bundler 对 `./b`、`pkg` 的行为与打包器/编辑器直觉一致)
// + 自写 resolveModuleNames 把相对/裸路径落到 VFS。
//
// 版本号取全局递增序号:一个语言族只有一个 LanguageService,同一路径的版本号不会撞。
//
// 这个文件不依赖编辑器:Worker 的入口(tsworker.ts)和同线程回环(tsbackend.ts)都用它。

import type * as TS from 'typescript'
import { loadTsLibs, readLib } from './tslibs'
import { textChange } from './tsbudget'
import { computeTsDiagnostics } from './tsdiagcore'
import { skipRangesIn, tsSkipTree, type TsSkipTree } from './tsskip'
import {
    DIAG_METHODS, FORMAT_ARG, TS_CANCELED, TS_DESYNC,
    type SlimDiagnostic, type TsFamily, type TsOp, type TsRequest, type TsResponse,
} from './tsprotocol'

export function normPath(p: string): string {
    let s = p.replace(/\\/g, '/')
    if (!s.startsWith('/')) s = '/' + s
    return s
}

let versionSeq = 0
const nextVersion = () => `v${++versionSeq}`

interface FileEntry { text: string, version: string }

/** Monaco 默认 lib = lib.esnext.full.d.ts:es* + dom* + webworker.importscripts + scripthost(webworker 本身和 dom 冲突,不进) */
export function isProgramLib(name: string): boolean {
    if (!name.startsWith('lib.') || !name.endsWith('.d.ts')) return false
    if (name.startsWith('lib.webworker') && name !== 'lib.webworker.importscripts.d.ts') return false
    if (name.endsWith('.full.d.ts')) return false
    if (name === 'lib.d.ts') return false
    return true
}

export class TsProject {
    open = new Map<string, FileEntry>()
    host = new Map<string, FileEntry>()
    options: TS.CompilerOptions = {}
    /** 宿主指定的解析结果:包含它的文件 → (import 写法 → 文件) */
    resolutions = new Map<string, Map<string, string>>()
    /** 解析结果变了、文本没变的文件:下次取快照时不给改动区,让 TS 重新 parse 出新的 SourceFile */
    reparse = new Set<string>()
    /** 主线程的项目版本号;语义诊断算完时随结果带回去 */
    epoch = 0
    /** 请求的截止时间(Date.now);0 = 不限 */
    deadlineAt = 0
    service: TS.LanguageService | null = null
    tsMod: typeof TS | null = null
    libs: Map<string, string> | null = null
    libRoots: string[] = []
    loading: Promise<TS.LanguageService> | null = null
    skipTrees = new Map<string, TsSkipTree>()
    dropTimer: ReturnType<typeof setTimeout> | null = null
    /** 补丁套不上、正等主线程重发整篇的文件;有一个在这里,请求就先打回去(TsDesync),不拿旧文本回答 */
    desynced = new Set<string>()

    constructor(readonly family: TsFamily, private readonly emit: (res: TsResponse) => void) {}

    readUser(path: string): string | undefined {
        const k = normPath(path)
        return this.open.get(k)?.text ?? this.host.get(k)?.text
    }

    apply(ops: readonly TsOp[], epoch: number): void {
        for (const op of ops) {
            switch (op.k) {
                case 'open': {
                    const cur = this.open.get(op.path)
                    this.desynced.delete(op.path)
                    if (cur && cur.text === op.text) break
                    this.open.set(op.path, { text: op.text, version: nextVersion() })
                    break
                }
                case 'patch': {
                    const cur = this.open.get(op.path)
                    if (!cur || cur.text.length !== op.oldLen) {
                        // 补丁套不上去。不猜:丢掉这份,请主线程整篇重发(消息有序,重发的 open 排在后面的请求前面)
                        console.error(`[lite-monaco] ts project out of sync: ${op.path} (${cur?.text.length} vs ${op.oldLen}), asking for the whole text`)
                        this.open.delete(op.path)
                        this.skipTrees.delete(op.path)
                        this.desynced.add(op.path)
                        this.emit({ t: 'desync', family: this.family, path: op.path })
                        break
                    }
                    cur.text = cur.text.slice(0, op.start) + op.insert + cur.text.slice(op.end)
                    cur.version = nextVersion()
                    break
                }
                case 'close':
                    this.desynced.delete(op.path)
                    this.open.delete(op.path)
                    this.skipTrees.delete(op.path)
                    if (!this.open.size) this.dropSyntaxTrees()
                    break
                case 'host':
                    for (const p of op.del) this.host.delete(p)
                    for (const [p, text] of Object.entries(op.set)) this.host.set(p, { text, version: nextVersion() })
                    break
                case 'options':
                    this.options = { ...op.options }
                    break
                case 'resolutions': {
                    const next = new Map<string, Map<string, string>>()
                    for (const [from, map] of Object.entries(op.table)) next.set(from, new Map(Object.entries(map)))
                    // TS 只看文件版本判断要不要重新解析 import:解析结果变了的文件版本 +1
                    for (const from of new Set([...next.keys(), ...this.resolutions.keys()])) {
                        const was = JSON.stringify([...(this.resolutions.get(from) ?? [])])
                        if (was === JSON.stringify([...(next.get(from) ?? [])])) continue
                        const entry = this.open.get(from) ?? this.host.get(from)
                        if (entry) {
                            entry.version = nextVersion()
                            this.reparse.add(from)
                        }
                    }
                    this.resolutions = next
                    break
                }
            }
        }
        if (epoch > this.epoch) this.epoch = epoch
    }

    // 项目里没有打开的文件了:让语言服务放下这个文件的语法树(program 和语法树缓存各一棵,2 万行约 30MB)。
    // 重建 program(lib 从 registry 复用,几 ms),语法树缓存换成默认 lib 那个只有几行引用的文件。
    // 放到下一轮:切 tab 时关掉后马上重开同一个文件就不做
    private dropSyntaxTrees(): void {
        if (this.dropTimer) clearTimeout(this.dropTimer)
        this.dropTimer = setTimeout(() => {
            this.dropTimer = null
            const svc = this.service
            if (this.open.size || !svc) return
            try {
                svc.getProgram()
                svc.getOutliningSpans('/lib.esnext.d.ts')
            } catch { /* */ }
        }, 0)
    }

    // 宿主给了 lib(如 ['lib.es2020.d.ts', 'lib.dom.d.ts'])就只装这些和它们 /// <reference lib> 的(和 tsc 一样:项目用 es2020 就不该有 replaceAll);没给就是 isProgramLib 的全部
    private libRootsFor(): string[] {
        const want = this.options.lib
        if (!Array.isArray(want) || !want.length || !this.libs) return this.libRoots
        const roots: string[] = []
        const take = (n: string) => {
            const base = String(n).toLowerCase()
            const root = '/' + (base.startsWith('lib.') && base.endsWith('.d.ts') ? base : `lib.${base}.d.ts`)
            const text = this.libs!.get(root)
            if (text == null || roots.includes(root)) return
            roots.push(root)
            for (const m of text.matchAll(/\/\/\/\s*<reference\s+lib\s*=\s*["']([^"']+)["']/g)) take(m[1])
        }
        for (const n of want) take(n)
        return roots.length ? roots : this.libRoots
    }

    ensure(): Promise<TS.LanguageService> {
        if (this.service) return Promise.resolve(this.service)
        if (this.loading) return this.loading
        this.loading = (async () => {
            const ts = await import('typescript')
            const loaded = await loadTsLibs(ts.version)
            const libs = new Map<string, string>()
            const libRoots: string[] = []
            for (const [name, text] of loaded) {
                const base = name.startsWith('/') ? name.slice(1) : name
                if (!base.startsWith('lib.')) continue
                if (!libs.has(base)) libs.set(base, text)
                if (!libs.has('/' + base)) libs.set('/' + base, text)
                if (isProgramLib(base)) {
                    const root = '/' + base
                    if (!libRoots.includes(root)) libRoots.push(root)
                }
            }
            this.tsMod = ts
            this.libs = libs
            this.libRoots = libRoots
            const service = ts.createLanguageService(this.buildHost(ts), ts.createDocumentRegistry())
            // 记下哪个文件在哪一版上算过语义诊断(主线程的 semanticReady / onSemanticChecked);单线程,调用期间 epoch 不会变
            const semantic = service.getSemanticDiagnostics.bind(service)
            service.getSemanticDiagnostics = (fileName) => {
                const at = this.epoch
                const r = semantic(fileName)
                this.emit({ t: 'semantic', family: this.family, path: normPath(fileName), epoch: at })
                return r
            }
            this.service = service
            this.loading = null
            return service
        })()
        return this.loading
    }

    private buildHost(ts: typeof TS): TS.LanguageServiceHost {
        const p = this
        const resolvePath = (fn: string): string | undefined => {
            const text = p.readUser(fn)
            if (text != null) return text
            if (!p.libs) return undefined
            return readLib(p.libs, fn) ?? readLib(p.libs, normPath(fn))
        }
        const userRoots = (): string[] => [...new Set([...p.open.keys(), ...p.host.keys()])]
        const ext = (c: string) => c.endsWith('.d.ts') ? ts.Extension.Dts
            : c.endsWith('.tsx') ? ts.Extension.Tsx
                : c.endsWith('.ts') ? ts.Extension.Ts
                    : c.endsWith('.jsx') ? ts.Extension.Jsx
                        : c.endsWith('.js') ? ts.Extension.Js
                            : ts.Extension.Ts

        return {
            // Monaco typescriptDefaults / javascriptDefaults 只给 allowNonTsExtensions + target Latest(JS 再加 allowJs):
            // 不开 strict、不写 checkJs(写了 false,纯 JS 的 suggestion 诊断就没了)。module / moduleResolution 是有意的例外(见文件头);
            // skipLibCheck / noEmit 不影响本文件的诊断
            getCompilationSettings: () => ({
                target: ts.ScriptTarget.Latest,
                module: ts.ModuleKind.ESNext,
                moduleResolution: ts.ModuleResolutionKind.Bundler,
                allowJs: true,
                skipLibCheck: true,
                noEmit: true,
                allowNonTsExtensions: true,
                baseUrl: '/',
                // 只影响 .tsx/.jsx;同项目里的 .ts 不受影响
                jsx: ts.JsxEmit.ReactJSX,
                ...p.options,
                noLib: true,
            }),
            // lib 在前:同名全局声明(var MessageChannel 之类)合并时以 lib 的为准,和 tsc 的顺序一致
            getScriptFileNames: () => [...p.libRootsFor(), ...userRoots()],
            getScriptVersion: (fn) => {
                const k = normPath(fn)
                return p.open.get(k)?.version ?? p.host.get(k)?.version ?? 'lib-1'
            },
            // 带改动区的快照:TS 拿新旧快照的公共前后缀做增量重解析(语法树缓存和 program 都走 getChangeRange),
            // 不再每次编辑全文 createSourceFile(2 万行约 40–80ms)
            getScriptSnapshot: (fn) => {
                const text = resolvePath(fn)
                if (text == null) return undefined
                const snap = ts.ScriptSnapshot.fromString(text)
                if (p.reparse.delete(normPath(fn))) snap.getChangeRange = () => undefined
                else snap.getChangeRange = old => textChange(old.getText(0, old.getLength()), text) ?? ts.unchangedTextChangeRange
                return snap
            },
            getCurrentDirectory: () => '/',
            // 语言服务创建时取一次,之后每次检查读 p.deadlineAt(见 call 的 deadlineAt)
            getCancellationToken: () => ({ isCancellationRequested: () => p.deadlineAt > 0 && Date.now() > p.deadlineAt }),
            getDefaultLibFileName: () => '/lib.esnext.d.ts',
            readFile: (fn) => resolvePath(fn),
            fileExists: (fn) => resolvePath(fn) != null,
            directoryExists: (dir) => {
                // 允许 /node_modules/@types 存在感,其它 node_modules 挡掉避免乱扫
                if (dir.includes('node_modules') && !dir.includes('@types')) return false
                return true
            },
            getDirectories: () => [],
            realpath: (path) => normPath(path),
            getNewLine: () => '\n',
            useCaseSensitiveFileNames: () => true,
            // 相对 import 解析到 VFS
            resolveModuleNames: (moduleNames, containingFile) => {
                return moduleNames.map(raw => {
                    // `from '.'` / `from '..'` 是目录 import(落到 index),和 './' '../' 同一条路
                    const name = raw === '.' ? './' : raw === '..' ? '../' : raw
                    // 宿主指定了这个文件里这个写法落在哪
                    const given = p.resolutions.get(normPath(containingFile))?.get(raw)
                    if (given && p.readUser(given) != null) {
                        return { resolvedFileName: given, extension: given.endsWith('.d.ts') ? ts.Extension.Dts : given.endsWith('.tsx') ? ts.Extension.Tsx : ts.Extension.Ts, isExternalLibraryImport: given.includes('node_modules') }
                    }
                    // 相对
                    if (name.startsWith('./') || name.startsWith('../')) {
                        const cont = containingFile.replace(/\\/g, '/')
                        const slash = cont.lastIndexOf('/')
                        const baseDir = slash <= 0 ? '/' : cont.slice(0, slash)
                        let resolved = name.startsWith('./')
                            ? (baseDir === '/' ? '/' + name.slice(2) : baseDir + '/' + name.slice(2))
                            : baseDir + '/' + name
                        // normalize . / ..
                        const parts = resolved.split('/')
                        const stack: string[] = []
                        for (const part of parts) {
                            if (!part || part === '.') continue
                            if (part === '..') stack.pop()
                            else stack.push(part)
                        }
                        resolved = '/' + stack.join('/')
                        // `./b.js` 指向 `./b.ts`(TS 的 ESM 写法)
                        const noJs = resolved.replace(/\.(m|c)?jsx?$/, '')
                        const candidates = [
                            resolved,
                            resolved + '.ts',
                            resolved + '.tsx',
                            resolved + '.d.ts',
                            resolved + '.js',
                            resolved + '.jsx',
                            noJs + '.ts',
                            noJs + '.tsx',
                            noJs + '.d.ts',
                            resolved + '/index.ts',
                            resolved + '/index.tsx',
                            resolved + '/index.d.ts',
                            resolved + '/index.js',
                        ]
                        for (const c of candidates) {
                            if (p.readUser(c) != null)
                                return { resolvedFileName: normPath(c), extension: ext(c), isExternalLibraryImport: false }
                        }
                        return undefined
                    }
                    // bare: 试 /node_modules/@types/X 与 /node_modules/X
                    const bareTries = [
                        `/node_modules/@types/${name}/index.d.ts`,
                        `/node_modules/@types/${name}.d.ts`,
                        `/node_modules/${name}/index.d.ts`,
                        `/node_modules/${name}/index.ts`,
                        `/${name}.d.ts`,
                        `/${name}.ts`,
                    ]
                    for (const c of bareTries) {
                        if (p.readUser(c) != null) {
                            const e = c.endsWith('.d.ts') ? ts.Extension.Dts : ts.Extension.Ts
                            return { resolvedFileName: c, extension: e, isExternalLibraryImport: c.includes('node_modules') }
                        }
                    }
                    return undefined
                })
            },
        }
    }

    // —— 请求 ——

    async call(method: string, args: unknown[], deadlineAt: number): Promise<unknown> {
        if (this.desynced.size) throw Object.assign(new Error('ts project out of sync'), { name: TS_DESYNC })
        const svc = await this.ensure()
        const ts = this.tsMod!
        this.deadlineAt = deadlineAt
        try {
            if (method.startsWith('$')) return this.custom(method, args, svc, ts)
            const fn = (svc as unknown as Record<string, unknown>)[method]
            if (typeof fn !== 'function') throw new Error(`unknown language service method: ${method}`)
            const at = FORMAT_ARG[method]
            if (at !== undefined && args[at] && typeof args[at] === 'object')
                args[at] = { ...ts.getDefaultFormatCodeSettings('\n'), ...(args[at] as object) }
            const out = (fn as (...a: unknown[]) => unknown).apply(svc, args)
            return DIAG_METHODS.has(method) ? (out as TS.Diagnostic[] | undefined)?.map(d => slimDiagnostic(ts, d)) : out
        } finally {
            this.deadlineAt = 0
        }
    }

    private custom(method: string, args: unknown[], svc: TS.LanguageService, ts: typeof TS): unknown {
        switch (method) {
            case '$ensure': return { version: ts.version }
            case '$warm': svc.getProgram(); return undefined
            case '$supportedCodeFixes': return [...ts.getSupportedCodeFixes()]
            case '$diagnostics': {
                const [fileName, docLen, syntaxOnly, wantTags, dopts] = args as [string, number, boolean, boolean, never]
                return computeTsDiagnostics(svc, ts, fileName, docLen, syntaxOnly, wantTags, dopts)
            }
            case '$skipRanges': {
                const fileName = normPath(args[0] as string)
                const text = this.open.get(fileName)?.text
                if (text == null) return []
                const prev = this.skipTrees.get(fileName)
                const tree = tsSkipTree(ts, fileName, text, prev)
                this.skipTrees.set(fileName, tree)
                return skipRangesIn(ts, tree.sf, 0, text.length)
            }
            case '$programInfo': {
                const program = svc.getProgram()
                return { options: { ...program?.getCompilerOptions() }, roots: [...(program?.getRootFileNames() ?? [])] }
            }
            case '$sourceText': return svc.getProgram()?.getSourceFile(args[0] as string)?.text ?? null
            case '$typeAnnotation': {
                const [fileName, pos] = args as [string, number]
                const program = svc.getProgram()
                const sf = program?.getSourceFile(fileName)
                if (!program || !sf) return null
                const checker = program.getTypeChecker()
                const findIdent = (node: TS.Node): TS.Identifier | undefined => {
                    if (pos < node.getStart() || pos > node.getEnd()) return undefined
                    if (ts.isIdentifier(node)) return node
                    return node.forEachChild(findIdent)
                }
                const id = findIdent(sf)
                if (!id) return null
                const text = sf.getFullText()
                let i = id.getEnd()
                while (text[i] === ' ' || text[i] === '\t') i++
                if (text[i] === '?') {
                    i++
                    while (text[i] === ' ' || text[i] === '\t') i++
                }
                if (text[i] === ':') return null
                const type = checker.getBaseTypeOfLiteralType(checker.getTypeAtLocation(id))
                const name = checker.typeToString(type)
                if (!name) return null
                return { from: id.getEnd(), insert: ': ' + name }
            }
            default:
                throw new Error(`unknown ts op: ${method}`)
        }
    }

    dispose(): void {
        if (this.dropTimer) clearTimeout(this.dropTimer)
        try { this.service?.dispose() } catch { /* */ }
        this.service = null
        this.skipTrees.clear()
    }
}

/** Diagnostic → 能结构化克隆的壳:file 只留文件名(原对象带整棵 SourceFile) */
export function slimDiagnostic(ts: typeof TS, d: TS.Diagnostic): SlimDiagnostic {
    const out: SlimDiagnostic = {
        start: d.start,
        length: d.length,
        code: d.code,
        category: d.category,
        messageText: d.messageText,
    }
    if (d.file) out.file = { fileName: d.file.fileName }
    if (d.reportsUnnecessary) out.reportsUnnecessary = true
    if (d.reportsDeprecated) out.reportsDeprecated = true
    if (d.source) out.source = d.source
    if (d.relatedInformation?.length) {
        out.relatedInformation = d.relatedInformation.map((r) => {
            const s = slimDiagnostic(ts, r)
            // 相关信息要显示行列:带上它所在文件的行列,主线程拿不到 SourceFile
            if (r.file && r.start != null) {
                const lc = r.file.getLineAndCharacterOfPosition(Math.max(0, Math.min(r.start, r.file.text.length)))
                ;(s as SlimDiagnostic & { line?: number, character?: number }).line = lc.line
                ;(s as SlimDiagnostic & { line?: number, character?: number }).character = lc.character
            }
            return s
        })
    }
    return out
}

/**
 * 请求处理器:按到达顺序一条条处理(改动和请求保序,请求看到的就是它之前所有改动之后的项目)。
 * Worker 入口和同线程回环共用。
 */
export function createTsEndpoint(send: (res: TsResponse) => void): { receive(req: TsRequest): void, dispose(): void } {
    const projects = new Map<TsFamily, TsProject>()
    const projectFor = (family: TsFamily) => {
        let p = projects.get(family)
        if (!p) projects.set(family, p = new TsProject(family, send))
        return p
    }
    let chain: Promise<void> = Promise.resolve()
    return {
        receive(req) {
            chain = chain.then(async () => {
                if (req.t === 'reset') {
                    for (const p of projects.values()) p.dispose()
                    projects.clear()
                    return
                }
                if (req.t === 'mut') {
                    // 改动出错不能让后面的请求跟着断链
                    try { projectFor(req.family).apply(req.ops, req.epoch) }
                    catch (e) { console.error('[lite-monaco] ts project:', e) }
                    return
                }
                try {
                    const value = await projectFor(req.family).call(req.method, req.args, req.deadlineAt ?? 0)
                    send({ t: 'res', id: req.id, ok: true, value })
                } catch (e) {
                    const err = e as { name?: string, message?: string }
                    const Cancel = projectFor(req.family).tsMod?.OperationCanceledException
                    const name = Cancel && e instanceof Cancel ? TS_CANCELED : (err?.name ?? 'Error')
                    send({ t: 'res', id: req.id, ok: false, name, message: String(err?.message ?? e) })
                }
            })
        },
        dispose() {
            for (const p of projects.values()) p.dispose()
            projects.clear()
        },
    }
}
