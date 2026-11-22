// monaco.languages.typescript.typescriptDefaults / javascriptDefaults 的形状 —— 照 monaco-editor 0.52.2
// language/typescript/monaco.contribution.js 的 LanguageServiceDefaultsImpl。
//
// 区别:没有 worker,所以 setWorkerOptions / setMaximumWorkerIdleTime 只存值;
// 额外库、编译选项落在 tsservice 的项目里(setTsFiles 同一份),诊断 / 内联提示选项由 tsdiagnostics / tsinlay 每次运行时读。

import { familyOf, setTsCompilerOptions, updateTsFile } from './tsservice'

export interface IDisposable { dispose(): void }
export type Listener<T> = (e: T) => unknown
/** Monaco IEvent:订阅返回 IDisposable */
export type IEvent<T> = (listener: Listener<T>) => IDisposable

class Emitter<T> {
    private readonly ls = new Set<Listener<T>>()
    readonly event: IEvent<T> = (l) => {
        this.ls.add(l)
        return { dispose: () => { this.ls.delete(l) } }
    }
    fire(e: T): void {
        for (const l of [...this.ls]) {
            try { l(e) } catch (err) { console.error(err) }
        }
    }
}

export interface DiagnosticsOptions {
    noSemanticValidation?: boolean
    noSyntaxValidation?: boolean
    noSuggestionDiagnostics?: boolean
    /** 要忽略的 TS 诊断码(如 [2307]) */
    diagnosticCodesToIgnore?: number[]
    /** 只在编辑器挂在页面上时诊断,摘下来就清掉 */
    onlyVisible?: boolean
}

/** TS UserPreferences 里与 inlay hint 有关的 7 项(monaco.d.ts InlayHintsOptions) */
export interface InlayHintsOptions {
    readonly includeInlayParameterNameHints?: 'none' | 'literals' | 'all'
    readonly includeInlayParameterNameHintsWhenArgumentMatchesName?: boolean
    readonly includeInlayFunctionParameterTypeHints?: boolean
    readonly includeInlayVariableTypeHints?: boolean
    readonly includeInlayVariableTypeHintsWhenTypeMatchesName?: boolean
    readonly includeInlayPropertyDeclarationTypeHints?: boolean
    readonly includeInlayFunctionLikeReturnTypeHints?: boolean
    readonly includeInlayEnumMemberValueHints?: boolean
}

export interface IExtraLib { content: string, version: number }
export type IExtraLibs = Record<string, IExtraLib>
export type CompilerOptions = import('typescript').CompilerOptions

export interface LanguageServiceDefaults {
    readonly languageId: string
    readonly onDidChange: IEvent<LanguageServiceDefaults>
    readonly onDidExtraLibsChange: IEvent<undefined>
    readonly workerOptions: { customWorkerPath?: string }
    readonly inlayHintsOptions: InlayHintsOptions
    addExtraLib(content: string, filePath?: string): IDisposable
    setExtraLibs(libs: { content: string, filePath?: string }[]): void
    getExtraLibs(): IExtraLibs
    getCompilerOptions(): CompilerOptions
    setCompilerOptions(options: CompilerOptions): void
    getDiagnosticsOptions(): DiagnosticsOptions
    setDiagnosticsOptions(options: DiagnosticsOptions): void
    setWorkerOptions(options: { customWorkerPath?: string }): void
    setInlayHintsOptions(options: InlayHintsOptions): void
    setMaximumWorkerIdleTime(value: number): void
    setEagerModelSync(value: boolean): void
    getEagerModelSync(): boolean
}

const SCRIPT_EXT = /\.(d\.)?[cm]?[tj]sx?$/i
/** 额外库在项目文件表里的路径:Monaco 的 filePath 随便写(`ts:filename/x.d.ts`、`file:///node_modules/…`);没扩展名的补 .d.ts */
function libPath(filePath: string): string {
    return SCRIPT_EXT.test(filePath) ? filePath : `${filePath}.d.ts`
}
const rand = () => Math.random().toString(36).substring(2, 15)

class LanguageServiceDefaultsImpl implements LanguageServiceDefaults {
    private readonly _onDidChange = new Emitter<LanguageServiceDefaults>()
    private readonly _onDidExtraLibsChange = new Emitter<undefined>()
    private _extraLibs: IExtraLibs = Object.create(null)
    private _removedExtraLibs: Record<string, number> = Object.create(null)
    private _eagerModelSync = false
    private _compilerOptions: CompilerOptions
    private _diagnosticsOptions: DiagnosticsOptions
    private _workerOptions: { customWorkerPath?: string }
    private _inlayHintsOptions: InlayHintsOptions
    private _extraLibsTimer: ReturnType<typeof setTimeout> | null = null
    // 已经推给项目的编译选项键:setCompilerOptions 是「替换」,上一次设过、这次没有的键要撤销
    private _pushedKeys = new Set<string>()

    constructor(
        readonly languageId: string,
        compilerOptions: CompilerOptions,
        diagnosticsOptions: DiagnosticsOptions,
    ) {
        this._compilerOptions = compilerOptions
        this._diagnosticsOptions = diagnosticsOptions
        this._workerOptions = {}
        this._inlayHintsOptions = {}
    }

    get onDidChange(): IEvent<LanguageServiceDefaults> { return this._onDidChange.event }
    get onDidExtraLibsChange(): IEvent<undefined> { return this._onDidExtraLibsChange.event }
    get workerOptions() { return this._workerOptions }
    get inlayHintsOptions() { return this._inlayHintsOptions }

    getExtraLibs(): IExtraLibs { return this._extraLibs }

    addExtraLib(content: string, _filePath?: string): IDisposable {
        const filePath = _filePath === undefined ? `ts:extralib-${rand()}` : _filePath
        if (this._extraLibs[filePath] && this._extraLibs[filePath].content === content) return { dispose: () => { /* 同内容:什么都没变 */ } }
        let myVersion = 1
        if (this._removedExtraLibs[filePath]) myVersion = this._removedExtraLibs[filePath] + 1
        if (this._extraLibs[filePath]) myVersion = this._extraLibs[filePath].version + 1
        this._extraLibs[filePath] = { content, version: myVersion }
        updateTsFile(libPath(filePath), content, { lang: this.languageId })
        this._fireExtraLibsSoon()
        return {
            dispose: () => {
                const lib = this._extraLibs[filePath]
                if (!lib || lib.version !== myVersion) return
                delete this._extraLibs[filePath]
                this._removedExtraLibs[filePath] = myVersion
                updateTsFile(libPath(filePath), null, { lang: this.languageId })
                this._fireExtraLibsSoon()
            },
        }
    }

    setExtraLibs(libs: { content: string, filePath?: string }[]): void {
        for (const filePath in this._extraLibs) {
            this._removedExtraLibs[filePath] = this._extraLibs[filePath].version
            updateTsFile(libPath(filePath), null, { lang: this.languageId })
        }
        this._extraLibs = Object.create(null)
        for (const lib of libs ?? []) {
            const filePath = lib.filePath || `ts:extralib-${rand()}`
            const myVersion = this._removedExtraLibs[filePath] ? this._removedExtraLibs[filePath] + 1 : 1
            this._extraLibs[filePath] = { content: lib.content, version: myVersion }
            updateTsFile(libPath(filePath), lib.content, { lang: this.languageId })
        }
        this._fireExtraLibsSoon()
    }

    // 对齐 Monaco _fireOnDidExtraLibsChangeSoon:同一拍内多次改动只发一次,异步发
    private _fireExtraLibsSoon(): void {
        if (this._extraLibsTimer != null) return
        this._extraLibsTimer = setTimeout(() => {
            this._extraLibsTimer = null
            this._onDidExtraLibsChange.fire(undefined)
        }, 0)
    }

    getCompilerOptions(): CompilerOptions { return this._compilerOptions }

    setCompilerOptions(options: CompilerOptions): void {
        this._compilerOptions = options || Object.create(null)
        // 只把宿主设的推给项目(Monaco 默认的 allowNonTsExtensions / target 不去覆盖 lite-monaco 的项目默认)
        const patch: Record<string, unknown> = {}
        for (const k of this._pushedKeys) patch[k] = undefined
        for (const [k, v] of Object.entries(this._compilerOptions)) patch[k] = v
        this._pushedKeys = new Set(Object.keys(this._compilerOptions))
        setTsCompilerOptions(patch as CompilerOptions, { lang: this.languageId })
        this._onDidChange.fire(this)
    }

    getDiagnosticsOptions(): DiagnosticsOptions { return this._diagnosticsOptions }

    setDiagnosticsOptions(options: DiagnosticsOptions): void {
        this._diagnosticsOptions = options || Object.create(null)
        this._onDidChange.fire(this)
    }

    setWorkerOptions(options: { customWorkerPath?: string }): void {
        this._workerOptions = options || Object.create(null)
        this._onDidChange.fire(this)
    }

    setInlayHintsOptions(options: InlayHintsOptions): void {
        this._inlayHintsOptions = options || Object.create(null)
        this._onDidChange.fire(this)
    }

    /** 没有 worker,没有空闲回收 */
    setMaximumWorkerIdleTime(_value: number): void { /* 主线程服务,无 worker */ }

    setEagerModelSync(value: boolean): void { this._eagerModelSync = value }
    getEagerModelSync(): boolean { return this._eagerModelSync }
}

/** Monaco: typescriptDefaults(默认 { noSemanticValidation:false, noSyntaxValidation:false, onlyVisible:false }) */
export const typescriptDefaults: LanguageServiceDefaults = new LanguageServiceDefaultsImpl(
    'typescript',
    { allowNonTsExtensions: true, target: 99 },
    { noSemanticValidation: false, noSyntaxValidation: false, onlyVisible: false },
)
/** Monaco: javascriptDefaults(JS 默认不做语义诊断) */
export const javascriptDefaults: LanguageServiceDefaults = new LanguageServiceDefaultsImpl(
    'javascript',
    { allowNonTsExtensions: true, allowJs: true, target: 99 },
    { noSemanticValidation: true, noSyntaxValidation: false, onlyVisible: false },
)

/** 某个语言(typescript / tsx / javascript / jsx…)对应的 defaults */
export function defaultsFor(lang: string | undefined): LanguageServiceDefaults {
    return familyOf(lang) === 'js' ? javascriptDefaults : typescriptDefaults
}

/** monaco.languages.typescript 命名空间的形状(只含本实现有的成员) */
export const typescript = { typescriptDefaults, javascriptDefaults }
