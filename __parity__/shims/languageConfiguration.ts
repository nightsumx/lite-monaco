// Monaco common/languages/languageConfiguration:枚举/类型原样转出(IndentAction 等是纯数据),
// StandardAutoClosingPairConditional 的判定(notIn 三个禁区、isOK、shouldAutoClose)交给 core/edit/closebrackets。
import { closingPair, pairAllowedIn, pairShouldAutoClose } from '../../src/core/edit/closebrackets'
export * from '../../../../reference/_vscode-src/src/vs/editor/common/languages/languageConfiguration'

type Pair = ReturnType<typeof closingPair>
export class StandardAutoClosingPairConditional {
    readonly open: string
    readonly close: string
    private readonly _pair: Pair
    constructor(source: { open: string, close: string, notIn?: string[] }) {
        this._pair = closingPair(source as never)
        this.open = source.open
        this.close = source.close
    }
    isOK(standardToken: number): boolean { return pairAllowedIn(this._pair, standardToken) }
    shouldAutoClose(context: { getTokenCount(): number, findTokenIndexAtOffset(o: number): number, getStandardTokenType(i: number): number }, column: number): boolean {
        return pairShouldAutoClose(this._pair, context.getTokenCount(), o => context.getStandardTokenType(context.findTokenIndexAtOffset(o)), column)
    }
}
