// Monaco RichEditBrackets → core/edit/brackets 的配对表(makeBracketTable)。只带电键用得上的字段。
import { makeBracketTable, type BracketTable } from '../../src/core/edit/brackets'
export class RichEditBrackets {
    readonly table: BracketTable
    constructor(_languageId: string, brackets: readonly (readonly [string, string])[]) { this.table = makeBracketTable(brackets) }
}
