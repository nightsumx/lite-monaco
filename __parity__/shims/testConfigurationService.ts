// Monaco TestConfigurationService 的测试替身:按 section 存用户配置,可按资源根(文件夹)覆盖;getValue 取资源所在的最深根的值,没有就取用户级。
// 只是配置夹具(ModelService 的 files.eol 从这里读),不实现任何被测行为。
export class TestConfigurationService {
    private readonly _user = new Map<string, unknown>()
    private readonly _folders: { root: string, section: string, value: unknown }[] = []
    private readonly _listeners = new Set<(e: { affectsConfiguration(id: string): boolean }) => unknown>()
    /** Monaco 的构造入参 = 初始用户配置(顶层 section → 值) */
    constructor(initial?: Record<string, unknown>) { if (initial) for (const [k, v] of Object.entries(initial)) this._user.set(k, v) }
    setUserConfiguration(section: string, value: unknown, root?: { path: string }): void {
        if (root) this._folders.push({ root: root.path.replace(/\/+$/, ''), section, value })
        else this._user.set(section, value)
        for (const l of [...this._listeners]) l({ affectsConfiguration: id => id === section || id.startsWith(section + '.') || section.startsWith(id + '.') })
    }
    getValue(section?: string, overrides?: { resource?: { path: string } }): any {
        if (!section) return undefined
        const path = overrides?.resource?.path
        const [head, ...rest] = section.split('.')
        const pick = (v: any) => rest.reduce((o, k) => (o == null ? undefined : o[k]), v)
        if (path) {
            let best: { root: string, value: any } | undefined
            for (const f of this._folders) {
                if (f.section === head && (path === f.root || path.startsWith(f.root + '/')) && (!best || f.root.length > best.root.length)) best = f
            }
            if (best) return pick(best.value)
        }
        return pick(this._user.get(head))
    }
    inspect() { return {} }
    updateValue() { return Promise.resolve() }
    onDidChangeConfiguration(l: (e: { affectsConfiguration(id: string): boolean }) => unknown) { this._listeners.add(l); return { dispose: () => { this._listeners.delete(l) } } }
}
