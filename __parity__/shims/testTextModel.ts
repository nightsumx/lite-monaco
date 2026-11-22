import { createModel, getModel } from '../../src/api/model'
import { Uri } from '../../src/api/uri'
import { installRawEvents } from './modelRawEvents'
import { setTokenizationRegistry } from '../../src/api/tokenization'
import { TokenizationRegistry } from '../../../../reference/_vscode-src/src/vs/editor/common/languages'

// 测试往 Monaco 的 TokenizationRegistry 里登记分词器;src 的分词层从它取(同形状:get + onDidChange)
setTokenizationRegistry(TokenizationRegistry as never)
export function stubTokenization(m: any) {
    if (!m.tokenization) m.tokenization = { forceTokenization() {}, tokenizeIfCheap() {}, hasAccurateTokensForLine: () => true, isCheapToTokenize: () => true, getLineTokens: () => ({ getLanguageId: () => 0 }) /* 仅供「调一下促使 tokenize」的测试;lite-monaco 没有惰性 tokenize */ }
    return m
}
// Monaco 的 createTextModel(text, languageId, options):options 是 model.updateOptions 的入参(insertSpaces / tabSize / defaultEOL…)
export function createTextModel(text: string | string[], languageId?: string | null, options?: Record<string, unknown> | null, uri?: unknown) {
    // Monaco 测试传的是 vscode-uri 的 URI;lite-monaco 的 createModel 要自己的 Uri,按 scheme/authority/path/query/fragment 翻译
    const u = uri && !(uri instanceof Uri) ? Uri.from({ scheme: (uri as any).scheme, authority: (uri as any).authority, path: (uri as any).path, query: (uri as any).query, fragment: (uri as any).fragment }) : uri
    // Monaco 的测试 createTextModel 直接 new TextModel(不进 ModelService 注册表),同 URI 可以并存;
    // lite-monaco 的 createModel 会拒绝重复 URI,所以撞了就先用占位 URI 建、再把 uri 指回去。
    const dup = u && getModel(u as never)
    const m = createModel(Array.isArray(text) ? text.join('\n') : text, languageId ?? undefined, (dup ? undefined : u) as never, { history: true })
    if (dup) (m as { uri: unknown }).uri = u
    // lite-monaco 的高亮/语法判定是同步的(没有 Monaco 那种按行惰性 tokenize 的状态),forceTokenization / tokenizeIfCheap 天然是 no-op。
    stubTokenization(m)
    // Monaco 的 createTextModel 缺省 = TextModel.DEFAULT_CREATION_OPTIONS(detectIndentation: false,tabSize 4,insertSpaces true),不按内容猜缩进
    // 显式 detectIndentation: true 才猜(入参 tabSize / insertSpaces 是猜不出来时的缺省),同 Monaco TextModel 构造函数里的 _detectIndentation。
    const { detectIndentation, ...rest } = (options ?? {}) as Record<string, unknown>
    ;(m as { updateOptions(o: unknown): void }).updateOptions({ tabSize: 4, indentSize: 'tabSize', insertSpaces: true, ...rest })
    if (detectIndentation) {
        const o = (m as any).getOptions()
        ;(m as any).detectIndentation(o.insertSpaces, o.tabSize)
    }
    installRawEvents(m)
    return m
}

// —— 服务夹具:createModelServices / instantiateTextModel ——
// TestInstantiationService:get(token) 取服务,invokeFunction(fn) 给 fn 一个 accessor。
// 服务 = 垫片里的 lite-monaco 翻译层(LanguageService / TestLanguageConfigurationService / ModelService),不实现被测行为。
import { ILanguageService } from './language'
import { ILanguageConfigurationService } from './languageConfigurationRegistry'
import { IModelService, ModelService } from './modelService'
import { IConfigurationService } from './configuration'
import { LanguageService } from './languageService'
import { TestLanguageConfigurationService } from './testLanguageConfigurationService'
import { ILanguageFeaturesService } from './languageFeatures'
import { languageFeatures } from '../../src/index'
import { makeInstantiationService } from './instantiation'
import { ICodeEditorService } from './codeEditorService'
import { ILogService, NullLogService } from './log'

export function createModelServices(disposables?: { add<T>(x: T): T }, serviceCollection?: { get(id: unknown): unknown, entries?(): Iterable<[unknown, unknown]> }) {
    const editors: unknown[] = []
    const services = new Map<unknown, unknown>([
        [ICodeEditorService, { listCodeEditors: () => editors }],
        [ILanguageService, new LanguageService()],
        [ILanguageConfigurationService, new TestLanguageConfigurationService()],
        [IModelService, new ModelService()],
        [ILogService, new NullLogService()],
        [ILanguageFeaturesService, languageFeatures], // src 的全局注册表:linkedEditing 等贡献缺省从这里取
    ])
    // 调用方给的 ServiceCollection 里的条目覆盖默认实现
    // 调用方给的可以是 ServiceCollection(有 entries())或 [token, 实例] 对数组
    if (Array.isArray(serviceCollection)) for (const [k, v] of serviceCollection as [unknown, unknown][]) services.set(k, v)
    else if (serviceCollection?.entries) for (const [k, v] of serviceCollection.entries()) services.set(k, v)
    // ModelService 读 files.eol:调用方给了 IConfigurationService 就接上
    const cfg = services.get(IConfigurationService)
    if (cfg) services.set(IModelService, new ModelService(cfg as never))
    const accessor = { get: (id: unknown) => services.get(id), getIfExists: (id: unknown) => services.get(id) }
    const di = makeInstantiationService(id => services.get(id))
    const inst = {
        _editors: editors,
        createInstance: di.createInstance.bind(di) as <T>(ctor: new (...a: any[]) => T, ...args: any[]) => T,
        get: (id: unknown) => services.get(id) as any,
        set: <T>(id: unknown, svc: T): T => { services.set(id, svc); return svc },
        stub: (id: unknown, svc: unknown): void => { services.set(id, svc) },
        invokeFunction: <T>(fn: (a: typeof accessor, ...r: unknown[]) => T, ...rest: unknown[]): T => fn(accessor, ...rest),
        dispose() { for (const s of services.values()) (s as { dispose?(): void } | undefined)?.dispose?.() },
    }
    disposables?.add(inst)
    return inst
}
export type TestInstantiationServiceLike = ReturnType<typeof createModelServices>

export function instantiateTextModel(_inst: unknown, text: string | string[], languageId?: string | null, options?: Record<string, unknown> | null, uri?: unknown) {
    return createTextModel(text, languageId, options, uri)
}

export function withEditorModel(text: string[], callback: (model: any) => void): void {
    const model = createTextModel(text.join('\n'))
    callback(model)
    ;(model as { dispose?(): void }).dispose?.()
}
