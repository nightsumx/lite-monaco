// Monaco common/core/edits/textEdit:TextReplacement / TextEdit 值类型 → lite-monaco 行内补全的同名值类型(src/lang/inline/textedit.ts)。
// 只给行内补全的测试用(for/ 作用域):别处的测试(diff fixtures 等)要真实现的 StringEdit 互转,不能被带到这个子集上。
export { TextEdit, TextReplacement } from '../../../../src/lang/inline/textedit'
