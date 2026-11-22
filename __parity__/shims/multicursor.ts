// Monaco contrib/multicursor/browser/multicursor:各 Action 类 → lite-monaco 同功能动作(按 id 调 editor.getAction)。
// MultiCursorSelectionController 只是贡献点(lite-monaco 的多光标会话挂在内核选区上,创建编辑器就有),这里给 ID + dispose 空壳。
const act = (id: string) => class { run(_: unknown, editor: any, args?: unknown) { const a = editor.getAction(id); if (!a) throw new Error(`lite-monaco 缺动作: ${id}`); return a.run(args) } }
export const InsertCursorAbove = act('editor.action.insertCursorAbove')
export const InsertCursorBelow = act('editor.action.insertCursorBelow')
export const AddSelectionToNextFindMatchAction = act('editor.action.addSelectionToNextFindMatch')
export const SelectHighlightsAction = act('editor.action.selectHighlights')
export class MultiCursorSelectionController { static readonly ID = 'editor.contrib.multiCursorController'; constructor(_editor: unknown) {} dispose() {} }
