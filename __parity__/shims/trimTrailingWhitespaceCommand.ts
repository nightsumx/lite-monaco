// Monaco TrimTrailingWhitespaceCommand(sel, cursors, trimInRegexesAndStrings) / trimTrailingWhitespace(model, cursors, trimInRegexesAndStrings)
// → lite-monaco 的 trimTrailingWhitespaceWith(core)。getEditOperations:在草稿编辑器上跑,把删掉的区间翻成 Monaco 的 delete 操作形态。
import { runOnScratch } from './testCommand'
import { Range } from './range'
import { Selection } from './selection'
import { Position } from './position'
import { trimTrailingWhitespaceWith } from '../../src/core/edit/commands'

function ops(model: any, cursors: Position[], trimInStrings: boolean): { range: Range, text: null }[] {
    const lines: string[] = model.getLinesContent()
    // 草稿编辑器里把光标放到 cursors(空则放在 1,1 之外无光标语义:keepCursors=false)
    const out: { range: Range, text: null }[] = []
    const after = runOnScratch(model, new Selection(1, 1, 1, 1), (editor) => {
        if (cursors.length) editor.setSelections(cursors.map(p => new Selection(p.lineNumber, p.column, p.lineNumber, p.column)))
        // createEditor 返回的就是 core.EditorView(api 挂在它上面):它自己是 StateCommand 的 target
        trimTrailingWhitespaceWith({ keepCursors: cursors.length > 0, trimInStrings })(editor)
    })
    for (let i = 0; i < lines.length; i++) {
        if (lines[i] === after[i]) continue
        out.push({ range: new Range(i + 1, after[i].length + 1, i + 1, lines[i].length + 1), text: null })
    }
    return out
}

export class TrimTrailingWhitespaceCommand {
    constructor(private readonly sel: Selection, private readonly cursors: Position[], private readonly trimInStrings: boolean) {
        const self = this as any
        self.getEditOperations = (model: any, builder: any) => { for (const o of ops(model, self.cursors, self.trimInStrings)) builder.addEditOperation(o.range, o.text) }
    }
}
export function trimTrailingWhitespace(model: any, cursors: Position[], trimInRegexesAndStrings: boolean) {
    return ops(model, cursors, trimInRegexesAndStrings).map(o => ({ range: o.range, text: o.text }))
}
