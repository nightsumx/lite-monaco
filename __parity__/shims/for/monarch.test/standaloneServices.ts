// monarch.test 专用:测试只拿 StandaloneConfigurationService 当「editor.maxTokenizationLineLength 的来源」传给分词器。
// lite-monaco 没有配置服务,分词器吃的是 IMonarchConfigurationService 形状(getValue / onDidChangeConfiguration)。
// 这里是一个键值表 + 变更通知(配置服务本身的职责),「超长行不分词」的判断仍在 src 的 MonarchTokenizer 里。
type Listener = (e: { affectsConfiguration(section: string): boolean }) => unknown
export class StandaloneConfigurationService {
    private readonly values = new Map<string, unknown>([['editor.maxTokenizationLineLength', 20000]])
    private readonly listeners = new Set<Listener>()
    constructor(_logService?: unknown) { }
    getValue<T>(section: string): T { return this.values.get(section) as T }
    async updateValue(section: string, value: unknown): Promise<void> {
        this.values.set(section, value)
        for (const l of [...this.listeners]) l({ affectsConfiguration: s => s === section })
    }
    onDidChangeConfiguration(listener: Listener) {
        this.listeners.add(listener)
        return { dispose: () => { this.listeners.delete(listener) } }
    }
}
