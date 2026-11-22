// Monaco 的 contrib/linesOperations/browser/linesOperations:每个 Action 类换成"按 id 调 lite-monaco 同名动作"。
const IDS: Record<string, string> = {
    SortLinesAscendingAction: 'editor.action.sortLinesAscending', SortLinesDescendingAction: 'editor.action.sortLinesDescending',
    DeleteDuplicateLinesAction: 'editor.action.removeDuplicateLines', ReverseLinesAction: 'editor.action.reverseLines',
    JoinLinesAction: 'editor.action.joinLines', IndentLinesAction: 'editor.action.indentLines',
    DeleteAllLeftAction: 'deleteAllLeft', DeleteAllRightAction: 'deleteAllRight', DeleteLinesAction: 'editor.action.deleteLines',
    InsertLineBeforeAction: 'editor.action.insertLineBefore', InsertLineAfterAction: 'editor.action.insertLineAfter',
    TransposeAction: 'editor.action.transpose', UpperCaseAction: 'editor.action.transformToUppercase',
    LowerCaseAction: 'editor.action.transformToLowercase', TitleCaseAction: 'editor.action.transformToTitlecase',
    SnakeCaseAction: 'editor.action.transformToSnakecase', CamelCaseAction: 'editor.action.transformToCamelcase',
    PascalCaseAction: 'editor.action.transformToPascalcase', KebabCaseAction: 'editor.action.transformToKebabcase',
    CopyLinesUpAction: 'editor.action.copyLinesUpAction', CopyLinesDownAction: 'editor.action.copyLinesDownAction',
    MoveLinesUpAction: 'editor.action.moveLinesUpAction', MoveLinesDownAction: 'editor.action.moveLinesDownAction',
    DuplicateSelectionAction: 'editor.action.duplicateSelection', TrimTrailingWhitespaceAction: 'editor.action.trimTrailingWhitespace',
    OutdentLinesAction: 'editor.action.outdentLines',
}
function make(name: string) {
    const id = IDS[name]
    return class {
        run(_: unknown, editor: any, args?: unknown) {
            const a = editor.getAction(id)
            if (!a) throw new Error(`lite-monaco 缺动作: ${id}`)
            return a.run(args)
        }
        // Monaco EditorCommand 形态:runEditorCommand(accessor, editor, args) 与 run 同义
        runEditorCommand(accessor: unknown, editor: any, args?: unknown) { return this.run(accessor, editor, args) }
    }
}
export const SortLinesAscendingAction = make('SortLinesAscendingAction')
export const SortLinesDescendingAction = make('SortLinesDescendingAction')
export const DeleteDuplicateLinesAction = make('DeleteDuplicateLinesAction')
export const ReverseLinesAction = make('ReverseLinesAction')
export const JoinLinesAction = make('JoinLinesAction')
export const IndentLinesAction = make('IndentLinesAction')
export const DeleteAllLeftAction = make('DeleteAllLeftAction')
export const DeleteAllRightAction = make('DeleteAllRightAction')
export const DeleteLinesAction = make('DeleteLinesAction')
export const InsertLineBeforeAction = make('InsertLineBeforeAction')
export const InsertLineAfterAction = make('InsertLineAfterAction')
export const TransposeAction = make('TransposeAction')
export const UpperCaseAction = make('UpperCaseAction')
export const LowerCaseAction = make('LowerCaseAction')
export const TitleCaseAction = make('TitleCaseAction')
export const SnakeCaseAction = make('SnakeCaseAction')
export const CamelCaseAction = make('CamelCaseAction')
export const PascalCaseAction = make('PascalCaseAction')
export const KebabCaseAction = make('KebabCaseAction')
export const CopyLinesUpAction = make('CopyLinesUpAction')
export const CopyLinesDownAction = make('CopyLinesDownAction')
export const MoveLinesUpAction = make('MoveLinesUpAction')
export const MoveLinesDownAction = make('MoveLinesDownAction')
export const DuplicateSelectionAction = make('DuplicateSelectionAction')
export const TrimTrailingWhitespaceAction = make('TrimTrailingWhitespaceAction')
export const OutdentLinesAction = make('OutdentLinesAction')
