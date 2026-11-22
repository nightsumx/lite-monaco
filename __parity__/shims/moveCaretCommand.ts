// Monaco contrib/caretOperations/browser/moveCaretCommand:MoveCaretCommand(selection, isMovingLeft) → 在真编辑器上跑 lite-monaco 的
// editor.action.moveCarretLeftAction / RightAction(选区已由 testCommand 设好,这里只翻译命令入口)。
import { lmCommand } from './testCommand'
export const MoveCaretCommand = function (this: unknown, _selection: unknown, isMovingLeft: boolean) {
    return lmCommand((editor) => { editor.getAction(isMovingLeft ? 'editor.action.moveCarretLeftAction' : 'editor.action.moveCarretRightAction').run() })
} as unknown as new (selection: unknown, isMovingLeft: boolean) => ReturnType<typeof lmCommand>
