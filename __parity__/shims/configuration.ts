// Monaco platform/configuration/common/configuration:服务标识 + ConfigurationTarget 枚举(值与 Monaco 一致)。
import { createDecorator } from './instantiation'
export const IConfigurationService: any = createDecorator()
export type IConfigurationService = any
export type IConfigurationValue<T> = any
export enum ConfigurationTarget { APPLICATION = 1, USER, USER_LOCAL, USER_REMOTE, WORKSPACE, WORKSPACE_FOLDER, DEFAULT, MEMORY }
