// Monaco InstantiationService:按 ServiceCollection 解析 @IXxx 参数的 createInstance(用 instantiation.ts 的 makeInstantiationService)。
import { makeInstantiationService } from './instantiation'
export class InstantiationService {
    constructor(private readonly _services: { get(id: unknown): unknown }) {
        const inst: any = makeInstantiationService(id => this._services.get(id))
        this.createInstance = inst.createInstance
    }
    createInstance: <T>(ctor: new (...a: any[]) => T, ...args: any[]) => T
}
