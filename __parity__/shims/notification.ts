// Monaco INotificationService:服务标识 + 空实现(lite-monaco 没有通知中心)。
import { createDecorator } from './instantiation'
export const INotificationService: any = createDecorator()
export type INotificationService = any
export const nullNotificationService = { info() {}, warn() {}, error() {}, notify() {} }
