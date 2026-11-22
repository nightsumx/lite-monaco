// Monaco platform/workspace:服务标识 + toWorkspaceFolder(纯数据夹具)。
import { createDecorator } from './instantiation'
export const IWorkspaceContextService: any = createDecorator()
export type IWorkspaceContextService = any
export type IWorkspace = any
export const WORKSPACE_EXTENSION = 'code-workspace'
export function toWorkspaceFolder(resource: any) {
    const base = resource.path.replace(/\/+$/, '').split('/').pop() ?? ''
    return { uri: resource, name: base, index: 0, toResource: (rel: string) => resource.with({ path: resource.path.replace(/\/+$/, '') + '/' + rel }) }
}
