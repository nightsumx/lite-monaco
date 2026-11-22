// Monaco contrib/cursorUndo/browser/cursorUndo:CursorUndo / CursorRedo Action → lite-monaco 的 cursorUndo / cursorRedo 动作;
// CursorUndoRedoController 只是贡献点(lite-monaco 的光标历史是内核 StateField,创建编辑器时就在),这里给个空壳 + ID。
const act = (id: string) => class { run(_: unknown, editor: any, args?: unknown) { return editor.getAction(id).run(args) } }
export const CursorUndo = act('cursorUndo')
export const CursorRedo = act('cursorRedo')
export class CursorUndoRedoController { static readonly ID = 'editor.contrib.cursorUndoRedoController'; constructor(_editor: unknown) {} }
