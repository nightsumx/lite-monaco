// Monaco contrib/wordOperations/browser/wordOperations:每个命令类 = "按 Monaco 命令 id 对 editor.trigger"。
// 只翻译,不实现词移动/删词(算法在 src/core/edit/words.ts + commands.ts)。
function cmd(id: string) {
    return class { readonly id = id; runEditorCommand(_accessor: unknown, editor: any, args?: unknown) { editor.trigger('test', id, args) } }
}
export const CursorWordStartLeft = cmd('cursorWordStartLeft')
export const CursorWordEndLeft = cmd('cursorWordEndLeft')
export const CursorWordLeft = cmd('cursorWordLeft')
export const CursorWordStartRight = cmd('cursorWordStartRight')
export const CursorWordEndRight = cmd('cursorWordEndRight')
export const CursorWordRight = cmd('cursorWordRight')
export const CursorWordAccessibilityLeft = cmd('cursorWordAccessibilityLeft')
export const CursorWordAccessibilityRight = cmd('cursorWordAccessibilityRight')
export const DeleteWordStartLeft = cmd('deleteWordStartLeft')
export const DeleteWordEndLeft = cmd('deleteWordEndLeft')
export const DeleteWordLeft = cmd('deleteWordLeft')
export const DeleteWordStartRight = cmd('deleteWordStartRight')
export const DeleteWordEndRight = cmd('deleteWordEndRight')
export const DeleteWordRight = cmd('deleteWordRight')
export const CursorWordStartLeftSelect = cmd('cursorWordStartLeftSelect')
export const CursorWordEndLeftSelect = cmd('cursorWordEndLeftSelect')
export const CursorWordLeftSelect = cmd('cursorWordLeftSelect')
export const CursorWordStartRightSelect = cmd('cursorWordStartRightSelect')
export const CursorWordEndRightSelect = cmd('cursorWordEndRightSelect')
export const CursorWordRightSelect = cmd('cursorWordRightSelect')
export const CursorWordAccessibilityLeftSelect = cmd('cursorWordAccessibilityLeftSelect')
export const CursorWordAccessibilityRightSelect = cmd('cursorWordAccessibilityRightSelect')
export class DeleteInsideWord {
    readonly id = 'deleteInsideWord'
    run(_accessor: unknown, editor: any, args?: unknown) { editor.trigger('test', 'deleteInsideWord', args) }
}
