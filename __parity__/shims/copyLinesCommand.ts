// Monaco CopyLinesCommand(sel, copyDown) → lite-monaco copyLinesUp/Down 动作。
import { lmCommand } from './testCommand'
export const CopyLinesCommand = class {
    constructor(_sel: unknown, copyDown: boolean) {
        return lmCommand(editor => { editor.getAction(copyDown ? 'editor.action.copyLinesDownAction' : 'editor.action.copyLinesUpAction')!.run() }) as never
    }
}
