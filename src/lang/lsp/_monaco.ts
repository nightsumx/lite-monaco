// 语言服务(CSS / HTML / JSON,来自 monaco-editor 0.58.0 的 src/languages/features,MIT,Microsoft)用到的 Monaco 命名空间。
// 原文件写的是 `import { languages, editor, Uri, ... } from '../../../editor'`,这里指到 lite-monaco 自己的实现。
export * as languages from '../../monaco/languages'
export * as editor from '../../monaco/editor'
export { Uri } from '../../api/uri'
export { Position, Range } from '../../api/position'
export { MarkerSeverity } from '../../api/markers'
export { Emitter } from '../../api/context'
export type { IDisposable, IEvent, CancellationToken, IRange, IMarkdownString } from '../../monaco/top-types'
