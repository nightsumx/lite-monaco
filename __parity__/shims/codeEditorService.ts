// Monaco ICodeEditorService:只有服务标识(listCodeEditors 由 testTextModel.ts 的服务夹具给)。
import { createDecorator } from './instantiation'
export const ICodeEditorService: any = createDecorator()
