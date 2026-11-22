// 传给 TS LanguageService 的格式选项,照 Monaco languages/typescript(tsMode.js FormatHelper._convertOptions):
//   ConvertTabsToSpaces = options.insertSpaces,TabSize = IndentSize = options.tabSize。
// options 有两种来源:
//   'format'(Format Document / Selection / 输入时 / 粘贴时)= model.getFormattingOptions()
//       = { tabSize: indentSize, insertSpaces } —— 缩进按 indentSize,tabSize 8 + indentSize 4 时一层 4 列;
//   'codefix'(Quick Fix,CodeActionAdaptor)= model.getOptions() —— 真 tabSize。
// 'editor':Monaco 没有对应(它的补全不带格式选项,也不应用 auto-import 编辑),按编辑器实际缩进给
//   (tabSize = tabSize,indentSize = indentSize)。
import type { FormatCodeSettings } from 'typescript'
import type { EditorState } from '../core/model/state'
import { indentConfig } from '../core/edit/enter'

export type TSFormatKind = 'format' | 'codefix' | 'editor'

/**
 * 只给「和编辑器有关」的几项(换行符、缩进);其余项由语言服务那一侧按 ts.getDefaultFormatCodeSettings 补齐
 * (主线程不加载 typescript;见 tsprotocol.ts FORMAT_ARG)。
 */
export function tsFormatOptions(state: EditorState, kind: TSFormatKind): FormatCodeSettings {
    const { tabSize, indentSize, insertSpaces } = indentConfig(state)
    const base: FormatCodeSettings = { newLineCharacter: '\n' }
    if (kind === 'editor') return { ...base, convertTabsToSpaces: insertSpaces, tabSize, indentSize }
    const size = kind === 'format' ? indentSize : tabSize
    return { ...base, convertTabsToSpaces: insertSpaces, tabSize: size, indentSize: size }
}
