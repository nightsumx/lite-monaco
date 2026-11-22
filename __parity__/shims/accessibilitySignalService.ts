// platform/accessibilitySignal/browser/accessibilitySignalService:只要服务标识(参数装饰器 / serviceCollection 键)。lite-monaco 没有无障碍信号。
import { createDecorator } from './instantiation'
export const IAccessibilitySignalService: any = createDecorator()
