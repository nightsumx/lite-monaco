// Monaco BlockCommentCommand(sel, insertSpace, langConfigService) → lite-monaco editor.action.blockComment(insertSpace 是编辑器选项 comments.insertSpace)。
import { lmCommand } from './testCommand'
export class BlockCommentCommand {
    constructor(_sel: unknown, insertSpace: boolean, _svc?: unknown) {
        return lmCommand((editor) => {
            editor.updateOptions({ comments: { insertSpace } })
            editor.getAction('editor.action.blockComment')!.run()
        }) as never
    }
}
