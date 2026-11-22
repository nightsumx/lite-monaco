// common/services/editorWorker:只有服务标识(IEditorWorkerService)。
import { createDecorator } from './instantiation'
export const IEditorWorkerService: any = createDecorator()
export type IEditorWorkerService = any
