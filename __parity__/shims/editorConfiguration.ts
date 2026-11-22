// browser/config/editorConfiguration → lite-monaco 选项层(resolveEditorOptions / mergeRawOptions / configurationChange)。
// EditorConfiguration 在这里只是把这三个公开函数按 Monaco 的调用顺序串起来(深拷贝迁移 → 合并 → 带环境解析 → 比对出变更事件),
// 校验 / 迁移 / 合并 / 计算 / 变更判定的行为全部在 src/core/options。
import { configurationChange, EditorOption, mergeRawOptions, OPTION_KEYS, resolveEditorOptions, type ConfigurationChangedEvent, type ResolveEnv } from '../../src/core/options'

export interface IEnvConfiguration {
    extraEditorClassName: string
    outerWidth: number
    outerHeight: number
    emptySelectionClipboard: boolean
    pixelRatio: number
    accessibilitySupport: number
    editContextSupported: boolean
}

/** Monaco ComputedEditorOptions:id → 值 的表。_write 供测试直接写(布局测试用);get 按 EditorOption 取 */
export class ComputedEditorOptions {
    readonly values: Record<string, unknown> = {}
    constructor(values?: Record<string, unknown>) { if (values) Object.assign(this.values, values) }
    _read(id: EditorOption) { return this.values[OPTION_KEYS[id]] }
    get(id: EditorOption): any { return this.values[OPTION_KEYS[id]] }
    _write(id: EditorOption, value: unknown) { this.values[OPTION_KEYS[id]] = value }
}

export class EditorConfiguration {
    private _raw: Record<string, unknown> = {}
    private _listeners = new Set<(e: ConfigurationChangedEvent) => void>()
    options!: ComputedEditorOptions
    private _computed: ReturnType<typeof resolveEditorOptions> | null = null

    constructor(_isSimpleWidget: boolean, _contextMenuId: unknown, options: Readonly<Record<string, unknown>>, _container?: unknown, _accessibilityService?: unknown) {
        this._raw = mergeRawOptions({}, options as never) as Record<string, unknown>
        this._recompute()
    }

    protected _readEnvConfiguration(): IEnvConfiguration { throw new Error('abstract') }
    protected _readFontInfo(_bare: unknown): any { return undefined }

    private _env(): ResolveEnv {
        const e = this._readEnvConfiguration()
        return { ...e, measureFont: bare => this._readFontInfo(bare) ?? undefined as never } as ResolveEnv
    }
    private _recompute() {
        const env = this._env()
        if (!this._readFontInfo({})) delete (env as { measureFont?: unknown }).measureFont
        this._computed = resolveEditorOptions(this._raw as never, env)
        this.options = new ComputedEditorOptions(this._computed as never)
    }

    getRawOptions() { return this._raw }
    onDidChange(l: (e: ConfigurationChangedEvent) => void) {
        this._listeners.add(l)
        return { dispose: () => { this._listeners.delete(l) } }
    }
    updateOptions(newOptions: Readonly<Record<string, unknown>>) {
        const prev = this._computed!
        this._raw = mergeRawOptions(this._raw as never, newOptions as never) as Record<string, unknown>
        this._recompute()
        const ev = configurationChange(prev, this._computed!)
        if (ev) for (const l of [...this._listeners]) l(ev)
    }
    dispose() { this._listeners.clear() }
}
