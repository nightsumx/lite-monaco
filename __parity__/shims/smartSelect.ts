// Monaco smartSelect.provideSelectionRanges → lite-monaco provideSelectionRanges(model 版;registry 是测试自己建的那张,provider 从它取)。
import { provideSelectionRanges as run } from '../../src/index'
export function provideSelectionRanges(registry: any, model: any, positions: any[], options: any, token: any) {
    return run(model, positions, options, token, registry)
}
