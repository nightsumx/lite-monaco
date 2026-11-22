import { createDecorator } from './instantiation'
// Monaco browser/services/editorWorkerService.ts 的 EditorWorkerService 基类:测试里被子类化并覆盖 computeWordRanges。
// lite-monaco 没有 Web Worker 取词,词距经 WordRangeService 接口(src/lang/worddistance.ts)取数;这里只是满足该接口的基类。
export class EditorWorkerService {
    private readonly _modelService: { getModel(uri: unknown): unknown }
    constructor(_workerDescriptor: unknown, modelService: { getModel(uri: unknown): unknown }, ..._rest: unknown[]) { this._modelService = modelService }
    canComputeWordRanges(resource: unknown): boolean { return !!this._modelService.getModel(resource) }
    computeWordRanges(_resource: unknown, _range: unknown): Promise<null> { return Promise.resolve(null) }
    dispose(): void { }
}
export const IEditorWorkerService: any = createDecorator()
