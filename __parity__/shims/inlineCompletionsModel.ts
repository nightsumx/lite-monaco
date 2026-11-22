// Monaco inlineCompletions/browser/model/inlineCompletionsModel:测试直接用 getSecondaryEdits(纯函数);
// InlineCompletionsModel 在测试里只出现在类型位置(实例由控制器给,见 inlineCompletionsController 垫片)。
export { getSecondaryEdits } from '../../src/lang/inline/secondary'
export type InlineCompletionsModel = import('../../src/lang/inline/model').InlineCompletionsModel
