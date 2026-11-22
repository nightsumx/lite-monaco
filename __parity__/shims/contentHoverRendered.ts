// RenderedContentHover.computeHoverPositions 的外壳:行为在 src/core/feature/hover.ts 的 computeHoverPositions(同一份给 hover 卡定位用)。
// 这里只把 Monaco 的 Range / Position 对象翻成它吃的 line/column 纯数据,再把结果包回 Position。
import { core } from '../../src/index'
import { Position } from './position'

type R = { startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number }

export class RenderedContentHover {
    static computeHoverPositions(editor: any, anchorRange: R, hoverParts: { range: R, forceShowAtRange?: boolean }[]) {
        const r = core.computeHoverPositions(editor, anchorRange, hoverParts)
        return {
            showAtPosition: new Position(r.showAtPosition.lineNumber, r.showAtPosition.column),
            showAtSecondaryPosition: new Position(r.showAtSecondaryPosition.lineNumber, r.showAtSecondaryPosition.column),
        }
    }
}
