// contrib/codeAction/browser/codeAction:getCodeActions + 命令 id 都在 src/lang/codeaction.ts(纯逻辑,无 DI)。
export {
    getCodeActions, codeActionCommandId, quickFixCommandId, autoFixCommandId, refactorCommandId, refactorPreviewCommandId,
    sourceActionCommandId, organizeImportsCommandId, fixAllCommandId,
} from '../../src/lang/codeaction'
