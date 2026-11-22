// platform/theme/common/themeService:服务标识(类型 IColorTheme / ITokenStyle 编译期抹掉)。
import { createDecorator } from './instantiation'
export const IThemeService: any = createDecorator()
export type IThemeService = any
export type IColorTheme = any
export type ITokenStyle = any
