// 多光标:主光标上的补全编辑,平移到「上下文相同」的其他光标上。移植自 inlineCompletionsModel.getSecondaryEdits。
import type { Position } from '../../api/position'
import { PositionOffsetTransformer, TextReplacement } from './textedit'

/** 返回的数组按 positions.slice(1) 顺序,上下文对不上的光标被略去(Monaco 里同样 filter 掉) */
export function getSecondaryEdits(model: { getValue(): string }, positions: readonly Position[], primaryTextRepl: TextReplacement): TextReplacement[] {
    if (positions.length === 1) return [] // 没有副光标
    const text = model.getValue()
    const t = new PositionOffsetTransformer(text)
    const primaryOffset = t.getOffset(positions[0])
    const secondaryOffsets = positions.slice(1).map(p => t.getOffset(p))

    primaryTextRepl = primaryTextRepl.removeCommonPrefixAndSuffix(text)
    const primaryStart = t.getOffset(primaryTextRepl.range.getStartPosition())
    const primaryEnd = t.getOffset(primaryTextRepl.range.getEndPosition())

    const deltaFromOffsetToRangeStart = primaryStart - primaryOffset
    // 主光标的上下文范围 = 替换范围 ∪ 光标处空范围
    const primaryContextValue = text.substring(Math.min(primaryStart, primaryOffset), Math.max(primaryEnd, primaryOffset))

    const out: TextReplacement[] = []
    for (const secondaryOffset of secondaryOffsets) {
        const start = secondaryOffset + deltaFromOffsetToRangeStart
        const end = start + (primaryEnd - primaryStart)
        const contextValue = text.substring(Math.min(start, secondaryOffset), Math.max(end, secondaryOffset))
        if (contextValue !== primaryContextValue) continue
        out.push(new TextReplacement(t.getRange(start, end), primaryTextRepl.text))
    }
    return out
}
