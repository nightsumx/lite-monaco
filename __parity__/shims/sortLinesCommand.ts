// Monaco SortLinesCommand(sel, descending) → lite-monaco 同名动作(编辑器选区已由 testCommand 设好)。
import { lmCommand } from './testCommand'
export const SortLinesCommand = class {
    constructor(_sel: unknown, descending: boolean) {
        return lmCommand(editor => { editor.getAction(descending ? 'editor.action.sortLinesDescending' : 'editor.action.sortLinesAscending')!.run() }) as never
    }
}
