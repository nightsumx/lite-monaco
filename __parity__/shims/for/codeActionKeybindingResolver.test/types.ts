// contrib/codeAction/common/types(模块名 types 太泛,只给这个测试文件用)→ src/lang/codeaction.ts 的同名导出。
export {
    CodeActionKind, CodeActionAutoApply, CodeActionTriggerSource, CodeActionItem, CodeActionCommandArgs, mayIncludeActionsOfKind, filtersAction,
} from '../../../../src/lang/codeaction'
export type { CodeActionFilter, CodeActionTrigger, CodeActionSet } from '../../../../src/lang/codeaction'
