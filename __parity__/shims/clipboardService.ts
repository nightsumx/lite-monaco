// Monaco IClipboardService:只有服务标识(实现用 testClipboardService.ts / 测试自带的替身)。
import { createDecorator } from './instantiation'
export const IClipboardService: any = createDecorator()
export type IClipboardService = any
