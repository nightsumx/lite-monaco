// Monaco contrib/wordPartOperations/browser/wordPartOperations:同 wordOperations.ts,按命令 id 对 editor.trigger。
function cmd(id: string) {
    return class { readonly id = id; runEditorCommand(_accessor: unknown, editor: any, args?: unknown) { editor.trigger('test', id, args) } }
}
export const CursorWordPartLeft = cmd('cursorWordPartLeft')
export const CursorWordPartLeftSelect = cmd('cursorWordPartLeftSelect')
export const CursorWordPartRight = cmd('cursorWordPartRight')
export const CursorWordPartRightSelect = cmd('cursorWordPartRightSelect')
export const DeleteWordPartLeft = cmd('deleteWordPartLeft')
export const DeleteWordPartRight = cmd('deleteWordPartRight')
