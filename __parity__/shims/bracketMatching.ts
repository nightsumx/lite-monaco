// Monaco BracketMatchingController → 按 action id 调 lite-monaco 同名动作(editor.registerAndInstantiateContribution 见 testCodeEditor.ts)。
// 只翻译,不实现括号匹配(算法在 src/core/edit/brackets.ts)。
function run(editor: any, id: string, args?: unknown) {
    const a = editor.getAction(id)
    if (!a) throw new Error(`lite-monaco 缺动作: ${id}`)
    return a.run(args)
}
export class BracketMatchingController {
    static readonly ID = 'editor.contrib.bracketMatchingController'
    constructor(private readonly editor: any) {}
    jumpToBracket() { run(this.editor, 'editor.action.jumpToBracket') }
    selectToBracket(selectBrackets: boolean) { run(this.editor, 'editor.action.selectToBracket', { selectBrackets }) }
    removeBrackets() { run(this.editor, 'editor.action.removeBrackets') }
    dispose() {}
}
