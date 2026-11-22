// Monaco ILogService / NullLogService。
import { createDecorator } from './instantiation'
export const ILogService: any = createDecorator()
export type ILogService = any
export class NullLogService {
    trace() { } debug() { } info() { } warn() { } error() { } flush() { } dispose() { }
}
