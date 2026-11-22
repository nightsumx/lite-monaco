// Monaco CursorColumns(1 起的 column)→ lite-monaco core/edit/vcol(0 起的行内 offset)。只换 ±1,不实现算法。
import { visibleColumn, columnFromVisible, toStatusbarColumn, nextRenderTabStop, prevRenderTabStop } from '../../../../src/core/edit/vcol'

export class CursorColumns {
    static visibleColumnFromColumn(lineContent: string, column: number, tabSize: number): number {
        return visibleColumn(lineContent, column - 1, tabSize)
    }
    static toStatusbarColumn(lineContent: string, column: number, tabSize: number): number {
        return toStatusbarColumn(lineContent, column - 1, tabSize)
    }
    static columnFromVisibleColumn(lineContent: string, visible: number, tabSize: number): number {
        return columnFromVisible(lineContent, visible, tabSize) + 1
    }
    static nextRenderTabStop = nextRenderTabStop
    static nextIndentTabStop = nextRenderTabStop
    static prevRenderTabStop = prevRenderTabStop
    static prevIndentTabStop = prevRenderTabStop
}
