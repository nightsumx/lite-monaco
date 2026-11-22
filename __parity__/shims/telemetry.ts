// platform/telemetry 的服务标识(只供 DI 声明用;lite-monaco 没有遥测)。
import { createDecorator } from './instantiation'
export const ITelemetryService: any = createDecorator()
