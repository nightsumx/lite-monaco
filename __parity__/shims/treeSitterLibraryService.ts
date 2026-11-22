// 服务标识(tree-sitter 在 lite-monaco 里不存在:分词走自研 / shiki)。
import { createDecorator } from './instantiation'
export const ITreeSitterLibraryService: any = createDecorator()
