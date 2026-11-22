// platform/contextview/browser/contextView:只有服务标识(测试用 mock<IContextMenuService>() 当占位,从不调用)。
import { createDecorator } from './instantiation'
export const IContextMenuService: any = createDecorator()
export const IContextViewService: any = createDecorator()
