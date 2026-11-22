// 两个小值类:EditDeltaInfo(common/textModelEditSource.ts)、FoldingRangeKind(common/languages.ts)。MIT,microsoft/vscode,= monaco-editor 0.55.1。
// 行为照搬;fromEdit 依赖 Monaco 内部的 StringEdit,公开 d.ts 里没有,不移植。

/** TextLength.ofText(text).lineCount:只数 '\n'(\r\n 算一个,单独的 \r 不算) */
function lineBreaks(text: string): number {
    let n = 0
    for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) n++
    return n
}

export class EditDeltaInfo {
    static fromText(text: string): EditDeltaInfo {
        return new EditDeltaInfo(lineBreaks(text), 0, text.length, 0)
    }

    static tryCreate(linesAdded: number | undefined, linesRemoved: number | undefined, charsAdded: number | undefined, charsRemoved: number | undefined): EditDeltaInfo | undefined {
        if (linesAdded === undefined || linesRemoved === undefined || charsAdded === undefined || charsRemoved === undefined) return undefined
        return new EditDeltaInfo(linesAdded, linesRemoved, charsAdded, charsRemoved)
    }

    constructor(
        readonly linesAdded: number,
        readonly linesRemoved: number,
        readonly charsAdded: number,
        readonly charsRemoved: number,
    ) { }
}

export class FoldingRangeKind {
    /** 注释区。值 'comment' */
    static readonly Comment = new FoldingRangeKind('comment')
    /** import 区。值 'imports' */
    static readonly Imports = new FoldingRangeKind('imports')
    /** #region / #endregion 之类标出的区。值 'region' */
    static readonly Region = new FoldingRangeKind('region')

    static fromValue(value: string): FoldingRangeKind {
        switch (value) {
            case 'comment': return FoldingRangeKind.Comment
            case 'imports': return FoldingRangeKind.Imports
            case 'region': return FoldingRangeKind.Region
        }
        return new FoldingRangeKind(value)
    }

    constructor(public value: string) { }
}
