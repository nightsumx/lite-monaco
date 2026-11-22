// Monaco OpenerService(editor/browser/services/openerService.ts + platform/opener 的 extractSelection)的内核形态。
//
// 打开一个地址 = 先过 validators(任何一个说 false 就停),再按 openers 链(后注册先问)问谁接管:
//   [自定义 opener…(registerOpener,unshift)] → 外部(openExternal / mailto / http(s) / vsls) → command: → 编辑器(兜底,恒接管)
// 不依赖任何 uri 实现:字符串怎么解析由构造时的 parse 给(只要求 scheme/authority/path/query/fragment/with/toString)。

export interface OpenerUri {
    readonly scheme: string
    readonly authority: string
    readonly path: string
    readonly query: string
    readonly fragment: string
    with(change: { scheme?: string, authority?: string, path?: string, query?: string, fragment?: string }): OpenerUri
    toString(skipEncoding?: boolean): string
}
export type OpenerTarget = OpenerUri | string

export interface OpenOptions {
    /** 来自用户手势(点击)而非 API 调用 */
    fromUserGesture?: boolean
    /** 强制走外部打开(不管 scheme) */
    openExternal?: boolean
    /** 在侧边打开 */
    openToSide?: boolean
    /** 是否允许执行 command: 链接;数组 = 只允许这些命令 id */
    allowCommands?: boolean | string[]
    /** 外部打开时是否问 registerExternalOpener 注册的;字符串 = 优选 opener id */
    allowContributedOpeners?: boolean | string
    skipValidation?: boolean
    editorOptions?: Record<string, unknown>
    /** lite 扩展:默认外部 opener 用哪个 window 打开(Monaco 固定 mainWindow;lite 可有多窗口) */
    window?: Window | null
}
export interface ResolveExternalUriOptions { readonly allowTunneling?: boolean }
export interface IResolvedExternalUri { resolved: OpenerUri, dispose(): void }
export interface IOpener { open(target: OpenerTarget, options?: OpenOptions): boolean | Promise<boolean> }
export interface IValidator { shouldOpen(target: OpenerTarget, options?: OpenOptions): Promise<boolean> | boolean }
export interface IExternalUriResolver { resolveExternalUri(resource: OpenerUri, options?: ResolveExternalUriOptions): Promise<IResolvedExternalUri | undefined> }
export interface IExternalOpener {
    openExternal(href: string, ctx: { sourceUri: OpenerUri, preferredOpenerId?: string, window?: Window | null }, token?: unknown): Promise<boolean>
}
export interface IOpenerDisposable { dispose(): void }

export interface OpenerSelection { startLineNumber: number, startColumn: number, endLineNumber?: number, endColumn?: number }
export interface IOpenerEditorService {
    openCodeEditor(input: { resource: OpenerUri, options?: Record<string, unknown> }, source: unknown, sideBySide?: boolean): unknown | Promise<unknown>
    getFocusedCodeEditor(): unknown
}
export interface IOpenerCommandService { executeCommand(id: string, ...args: unknown[]): unknown | Promise<unknown> }

/** `#L23` / `#L23,45` / `#23` / `#23,45` → 行列;带选区时 fragment 清空 */
export function extractSelection<U extends OpenerUri>(uri: U): { selection: OpenerSelection | undefined, uri: U } {
    let selection: OpenerSelection | undefined
    const match = /^L?(\d+)(?:,(\d+))?/.exec(uri.fragment)
    if (match) {
        selection = { startLineNumber: parseInt(match[1], 10), startColumn: match[2] ? parseInt(match[2], 10) : 1 }
        uri = uri.with({ fragment: '' }) as U
    }
    return { selection, uri }
}

const schemeOf = (t: OpenerTarget): string => {
    if (typeof t !== 'string') return t.scheme.toLowerCase()
    const m = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(t)
    return m ? m[1].toLowerCase() : ''
}
const matchesSomeScheme = (t: OpenerTarget, ...schemes: string[]) => schemes.includes(schemeOf(t))

/** 折掉 . 和 ..(对应 resources.normalizePath 的 posix 部分) */
function normalizePosix(path: string): string {
    const abs = path.startsWith('/')
    const out: string[] = []
    for (const seg of path.split('/')) {
        if (seg === '' || seg === '.') continue
        if (seg === '..') { if (out.length && out[out.length - 1] !== '..') out.pop(); else if (!abs) out.push('..'); continue }
        out.push(seg)
    }
    const r = (abs ? '/' : '') + out.join('/')
    return path.endsWith('/') && r.length > 1 && !r.endsWith('/') ? r + '/' : r
}

export class OpenerService {
    private readonly _openers: IOpener[] = []
    private readonly _validators: IValidator[] = []
    private readonly _resolvers: IExternalUriResolver[] = []
    private readonly _externalOpeners: IExternalOpener[] = []
    /** 解析后的外部 uri → 原 uri(验证时对原 uri 验证);键是去掉 path/query/fragment 的 uri 字符串 */
    private readonly _resolvedUriTargets = new Map<string, OpenerUri>()
    private _defaultExternalOpener: IExternalOpener

    constructor(
        editorService: IOpenerEditorService,
        commandService: IOpenerCommandService,
        private readonly _parse: (value: string) => OpenerUri,
    ) {
        this._defaultExternalOpener = {
            openExternal: async (href, ctx) => {
                const w = ctx.window ?? (typeof window !== 'undefined' ? window : null)
                if (!w) return false
                // http(s) 开新窗口且不带 opener(不触发当前页导航);其它链接直接设 href,避免弹空白窗口
                if (matchesSomeScheme(href, 'http', 'https')) w.open(href, '_blank', 'noopener,noreferrer')
                else w.location.href = href
                return true
            },
        }
        // 默认链:外部 / mailto / http(s) / vsls → command: → 编辑器兜底
        this._openers.push({
            open: async (target, options) => {
                if (options?.openExternal || matchesSomeScheme(target, 'mailto', 'http', 'https', 'vsls')) {
                    await this._doOpenExternal(target, options)
                    return true
                }
                return false
            },
        })
        this._openers.push(this._commandOpener(commandService))
        this._openers.push(this._editorOpener(editorService))
    }

    private _commandOpener(commandService: IOpenerCommandService): IOpener {
        return {
            open: async (target, options) => {
                if (schemeOf(target) !== 'command') return false
                // 没开 allowCommands:静默忽略,并返回 true 挡住后面的 opener
                if (!options?.allowCommands) return true
                const uri = typeof target === 'string' ? this._parse(target) : target
                if (Array.isArray(options.allowCommands) && !options.allowCommands.includes(uri.path)) return true
                let args: unknown = []
                try { args = JSON.parse(decodeURIComponent(uri.query)) } catch {
                    try { args = JSON.parse(uri.query) } catch { /* 没带参数 */ }
                }
                if (!Array.isArray(args)) args = [args]
                await commandService.executeCommand(uri.path, ...(args as unknown[]))
                return true
            },
        }
    }

    private _editorOpener(editorService: IOpenerEditorService): IOpener {
        return {
            open: async (target, options) => {
                let uri = typeof target === 'string' ? this._parse(target) : target
                const ex = extractSelection(uri)
                uri = ex.uri
                if (uri.scheme === 'file') uri = uri.with({ path: normalizePosix(uri.path) })
                const opened = await editorService.openCodeEditor(
                    { resource: uri, options: { selection: ex.selection, source: options?.fromUserGesture ? 'user' : 'api', ...options?.editorOptions } },
                    editorService.getFocusedCodeEditor(),
                    options?.openToSide,
                )
                // Monaco 恒返回 true(editor service 的返回值被忽略)。lite 的 editor service 可以明说「没人接管」(=== false),
                // 这样链路末端的 false 能透出去,调用方(点链接)才知道什么都没发生。
                return opened !== false
            },
        }
    }

    /** 后注册的先问 */
    registerOpener(opener: IOpener): IOpenerDisposable { return add(this._openers, opener, true) }
    registerValidator(validator: IValidator): IOpenerDisposable { return add(this._validators, validator) }
    registerExternalUriResolver(resolver: IExternalUriResolver): IOpenerDisposable { return add(this._resolvers, resolver) }
    registerExternalOpener(opener: IExternalOpener): IOpenerDisposable { return add(this._externalOpeners, opener) }
    setDefaultExternalOpener(opener: IExternalOpener): void { this._defaultExternalOpener = opener }

    async open(target: OpenerTarget, options?: OpenOptions): Promise<boolean> {
        if (!options?.skipValidation) {
            const uri = typeof target === 'string' ? this._parse(target) : target
            const validationTarget = this._resolvedUriTargets.get(resolvedKey(uri)) ?? target
            for (const v of [...this._validators]) {
                if (!(await v.shouldOpen(validationTarget, options))) return false
            }
        }
        for (const o of [...this._openers]) {
            if (await o.open(target, options)) return true
        }
        return false
    }

    async resolveExternalUri(resource: OpenerUri, options?: ResolveExternalUriOptions): Promise<IResolvedExternalUri> {
        for (const r of [...this._resolvers]) {
            try {
                const result = await r.resolveExternalUri(resource, options)
                if (result) {
                    const k = resolvedKey(result.resolved)
                    if (!this._resolvedUriTargets.has(k)) this._resolvedUriTargets.set(k, resource)
                    return result
                }
            } catch { /* 下一个 resolver */ }
        }
        throw new Error('Could not resolve external URI: ' + resource.toString())
    }

    private async _doOpenExternal(resource: OpenerTarget, options: OpenOptions | undefined): Promise<boolean> {
        const uri = typeof resource === 'string' ? this._parse(resource) : resource
        let externalUri: OpenerUri
        try { externalUri = (await this.resolveExternalUri(uri)).resolved } catch { externalUri = uri }
        // 字符串且解析前后一致 → 原样打开;否则 toString(不编码)+encodeURI
        const href = typeof resource === 'string' && uri.toString() === externalUri.toString() ? resource : encodeURI(externalUri.toString(true))
        if (options?.allowContributedOpeners) {
            const preferredOpenerId = typeof options.allowContributedOpeners === 'string' ? options.allowContributedOpeners : undefined
            for (const o of [...this._externalOpeners]) {
                if (await o.openExternal(href, { sourceUri: uri, preferredOpenerId, window: options.window })) return true
            }
        }
        return this._defaultExternalOpener.openExternal(href, { sourceUri: uri, window: options?.window })
    }

    dispose(): void { this._validators.length = 0 }
}

const resolvedKey = (u: OpenerUri) => u.with({ path: '', fragment: '', query: '' }).toString()

function add<T>(list: T[], item: T, front = false): IOpenerDisposable {
    if (front) list.unshift(item); else list.push(item)
    return { dispose() { const i = list.indexOf(item); if (i >= 0) list.splice(i, 1) } }
}
