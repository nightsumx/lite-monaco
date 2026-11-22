// Monaco CharacterPairSupport → src/lang/langconfig 的 resolveCharacterPairs(缺省规则);这里只把结果包成 Monaco 的 Standard 实例。
import { resolveCharacterPairs } from '../../src/lang/langconfig'
import { StandardAutoClosingPairConditional } from './languageConfiguration'

export class CharacterPairSupport {
    private readonly _auto: StandardAutoClosingPairConditional[]
    private readonly _surround: { open: string, close: string }[]
    constructor(config: any) {
        const r = resolveCharacterPairs(config)
        this._auto = r.autoClosingPairs.map(p => new StandardAutoClosingPairConditional(p))
        this._surround = r.surroundingPairs === r.autoClosingPairs ? this._auto : r.surroundingPairs
    }
    getAutoClosingPairs() { return this._auto }
    getSurroundingPairs() { return this._surround }
}
