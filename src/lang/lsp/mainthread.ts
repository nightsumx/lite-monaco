// 主线程版的 WorkerManager。monaco-editor 的 CSS / HTML / JSON 语言服务跑在 Web Worker 里
// (createWebWorker + withSyncedResources);lite-monaco 没有 worker 基建(宿主 CSP 不一定放行),所以这里直接在主线程
// 实例化 `CSSWorker / HTMLWorker / JSONWorker`(类原样沿用 Monaco 的,方法全是 async,以后要挪进 worker 只换这一层)。
// 模型来源:原版是 worker 里的镜像模型,这里直接读 editor.getModels()。
import { editor, type IDisposable, type Uri } from './_monaco'

export interface IMirrorModel {
    readonly uri: Uri
    readonly version: number
    getValue(): string
}
/** 对位 monaco 的 worker.IWorkerContext */
export interface IWorkerContext {
    getMirrorModels(): IMirrorModel[]
}

const context: IWorkerContext = {
    getMirrorModels: () => editor.getModels().map(m => ({
        uri: m.uri,
        version: m.getVersionId(),
        getValue: () => m.getValue(),
    })),
}

interface DefaultsLike {
    readonly onDidChange: (listener: (e: any) => any) => IDisposable
}

export class WorkerManager<T, C> {
    private client: T | null = null
    private readonly sub: IDisposable

    /** `data` 对位原版 createWebWorker 的 createData(每种语言取的字段不同:css 是 options,json 是 diagnosticsOptions) */
    constructor(
        defaults: DefaultsLike,
        private readonly create: (ctx: IWorkerContext, createData: C) => T,
        private readonly data: () => C,
    ) {
        // 选项变了(setOptions / setDiagnosticsOptions)→ 下次请求重建语言服务,同原版「配置变了停掉 worker」
        this.sub = defaults.onDidChange(() => { this.client = null })
    }

    getLanguageServiceWorker(..._resources: Uri[]): Promise<T> {
        if (!this.client) this.client = this.create(context, this.data())
        return Promise.resolve(this.client)
    }

    dispose(): void {
        this.sub.dispose()
        this.client = null
    }
}
