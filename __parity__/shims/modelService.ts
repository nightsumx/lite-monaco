// Monaco IModelService / ModelService(common/services/model.js 与 modelService.js 共用这一份:vitest.parity.config.ts 把 model.js 映射到这里)
// → lite-monaco src/api/modelservice 的真实现。本垫片只做 URI 翻译(测试给 vscode-uri 的 URI,src 要自己的 Uri)。
import { ModelService as SrcModelService } from '../../src/api/modelservice'
import { Uri } from '../../src/api/uri'

export const IModelService: any = (..._a: unknown[]) => {}

const toUri = (r: { toString(): string }) => Uri.parse(r.toString())

export class ModelService extends SrcModelService {
    // @ts-expect-error 签名放宽:接受 vscode-uri 的 URI
    override createModel(value: string, languageSelection: { languageId: string } | null, resource?: { toString(): string }, isForSimpleWidget?: boolean) {
        return super.createModel(value, languageSelection as never, resource ? toUri(resource) : undefined, isForSimpleWidget)
    }
    // @ts-expect-error 同上
    override getModel(resource: { toString(): string }) { return super.getModel(toUri(resource)) }
    // @ts-expect-error 同上
    override destroyModel(resource: { toString(): string }) { super.destroyModel(toUri(resource)) }
    dispose() {}
}
