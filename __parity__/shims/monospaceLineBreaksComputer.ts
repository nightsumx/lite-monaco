// Monaco common/viewModel/monospaceLineBreaksComputer:Factory 的接口形状 → src/core/view/softwrap.ts 的 computeLineProjection。
// 只翻译参数(FontInfo 的全角 / 半角字宽比 → fullWidth 列数;LineInjectedText → Injection),算法全在 src。
// previousLineBreakData 在 Monaco 里只是「只有折行列变了」时的增量提示(结果必须等于全量重算),这里不用它,直接全量算。
import { EditorOption } from '../../src/core/options'
import { computeLineProjection, wrapConfig, type Injection, type LineProjection } from '../../src/core/view/softwrap'

type InjectedLine = { column: number, options: Injection['options'] }

export class MonospaceLineBreaksComputerFactory {
    static create(options: { get(id: EditorOption): unknown }) {
        return new MonospaceLineBreaksComputerFactory(options.get(EditorOption.wordWrapBreakBeforeCharacters) as string, options.get(EditorOption.wordWrapBreakAfterCharacters) as string)
    }
    constructor(private readonly breakBefore: string, private readonly breakAfter: string) { }

    createLineBreaksComputer(
        fontInfo: { typicalFullwidthCharacterWidth: number, typicalHalfwidthCharacterWidth: number },
        tabSize: number, wrappingColumn: number, wrappingIndent: number, wordBreak: 'normal' | 'keepAll', wrapOnEscapedLineFeeds: boolean,
    ) {
        const requests: { text: string, injected: InjectedLine[] | null }[] = []
        const cfg = wrapConfig({
            column: wrappingColumn, tabSize, indent: wrappingIndent, wordBreak, escapedLineFeeds: wrapOnEscapedLineFeeds,
            breakBefore: this.breakBefore, breakAfter: this.breakAfter,
            fullWidth: fontInfo.typicalFullwidthCharacterWidth / fontInfo.typicalHalfwidthCharacterWidth,
        })
        return {
            addRequest: (text: string, injected: InjectedLine[] | null, _previous: unknown) => { requests.push({ text, injected }) },
            finalize: (): (LineProjection | null)[] => requests.map(r =>
                computeLineProjection(r.text, cfg, r.injected?.map(t => ({ offset: t.column - 1, options: t.options })))),
        }
    }
}
