// platform/environment/common/environment:只有服务标识(测试给一个带 isBuilt / isExtensionDevelopment 的占位对象)。
import { createDecorator } from './instantiation'
export const IEnvironmentService: any = createDecorator()
