// Monaco contrib/suggest/browser/suggestMemory.ts:再导出 + 服务标识。实现在 src/lang/suggestmemory.ts。
import { createDecorator } from './instantiation'
export { Memory, NoMemory, LRUMemory, PrefixMemory, SuggestMemoryService } from '../../src/lang/suggestmemory'
export const ISuggestMemoryService: any = createDecorator()
