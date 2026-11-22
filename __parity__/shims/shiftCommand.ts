// Monaco ShiftCommand(sel, opts, languageConfigurationService) → lite-monaco indentLines / outdentLines 动作。
// opts 里的 tabSize / indentSize / insertSpaces 是 model 选项,useTabStops / autoIndent 是编辑器选项,run 前先写进去。
// getEditOperations:在草稿编辑器上跑同一个动作,把「哪些行的前导空白变成了什么」翻成 Monaco 的编辑操作形态(每个改动行整段前导空白一个操作)。
import { lmCommand } from './testCommand'
import { runOnScratch } from './testCommand'
import { Range } from './range'
import { Selection } from './selection'

const NAMES = ['none', 'keep', 'brackets', 'advanced', 'full']
export class ShiftCommand {
    constructor(private readonly sel: Selection, private readonly opts: any, _svc?: unknown) {
        const self = this
        const cmd: any = lmCommand((editor, model) => self.apply(editor, model))
        cmd.getEditOperations = (model: any, builder: any) => self.getEditOperations(model, builder)
        return cmd
    }
    private apply(editor: any, model: any) {
        const o = this.opts
        model.updateOptions({ tabSize: o.tabSize, indentSize: o.indentSize, insertSpaces: o.insertSpaces })
        editor.updateOptions({ useTabStops: o.useTabStops, autoIndent: NAMES[o.autoIndent] })
        editor.getAction(o.isUnshift ? 'editor.action.outdentLines' : 'editor.action.indentLines')!.run()
    }
    getEditOperations(model: any, builder: any) {
        const before: string[] = model.getLinesContent()
        const after = runOnScratch(model, this.sel, (e, m) => this.apply(e, m))
        const ws = (t: string) => /^[ \t]*/.exec(t)![0]
        for (let i = 0; i < before.length; i++) {
            const a = ws(before[i]), b = ws(after[i])
            if (a !== b) builder.addEditOperation(new Range(i + 1, 1, i + 1, a.length + 1), b)
        }
    }
}
