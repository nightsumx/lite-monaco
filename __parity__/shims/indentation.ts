// Monaco contrib/indentation/browser/indentation.ts:
//   IndentationToSpacesCommand / IndentationToTabsCommand(sel, tabSize) → lite-monaco 动作 editor.action.indentationToSpaces / ToTabs(tabSize 来自 model 选项,run 前先写进去)
//   AutoIndentOnPaste → core autoIndentOnPaste(粘贴区间的自动缩进)
import { lmCommand } from './testCommand'

const convert = (id: string) => class {
    constructor(_sel: unknown, tabSize: number) {
        return lmCommand((editor, model) => {
            model.updateOptions({ tabSize })
            editor.getAction(id)!.run()
        })
    }
}
export const IndentationToSpacesCommand: any = convert('editor.action.indentationToSpaces')
export const IndentationToTabsCommand: any = convert('editor.action.indentationToTabs')

import { autoIndentOnPaste } from '../../src/core/edit/pasteindent'
export class AutoIndentOnPaste {
    static readonly ID = 'editor.contrib.autoIndentOnPaste'
    constructor(private readonly editor: any) {}
    trigger(range: any): void {
        const view = this.editor.getModel().attachedView ?? this.editor
        const doc = view.state.doc
        const at = (l: number, c: number) => doc.line(l).from + c - 1
        autoIndentOnPaste(view, at(range.startLineNumber, range.startColumn), at(range.endLineNumber, range.endColumn))
    }
}
