// Monaco BracketElectricCharacterSupport → core/edit/brackets 的 electricCharacters / electricAction。
// 只翻译 ScopedLineTokens(夹具给的 token 数据)→ (行前文本, 光标处 token 类型)。
import { electricAction, electricCharacters } from '../../src/core/edit/brackets'
import type { RichEditBrackets } from './richEditBrackets'

export class BracketElectricCharacterSupport {
    constructor(private readonly _brackets: RichEditBrackets | null) {}
    getElectricCharacters(): string[] { return this._brackets ? electricCharacters(this._brackets.table) : [] }
    onElectricCharacter(character: string, context: any, column: number) {
        if (!this._brackets) return null
        const type = context.getStandardTokenType(context.findTokenIndexAtOffset(column - 1))
        return electricAction(this._brackets.table, context.getLineContent().substring(0, column - 1), character, type)
    }
}
