// Monaco 同名同形的 Position / Range / Selection 值类型(移植自 vs/editor/common/core/{position,range,selection})。
// 行号、列号都从 1 开始;Range 构造时自动把起止规整成 start <= end。

export interface IPosition {
    readonly lineNumber: number
    readonly column: number
}

export interface IRange {
    readonly startLineNumber: number
    readonly startColumn: number
    readonly endLineNumber: number
    readonly endColumn: number
}

export interface ISelection {
    readonly selectionStartLineNumber: number
    readonly selectionStartColumn: number
    readonly positionLineNumber: number
    readonly positionColumn: number
}

export enum SelectionDirection {
    /** 选区起点在前、光标在后 */
    LTR = 0,
    /** 选区光标在前 */
    RTL = 1,
}

/** 编辑器里的一个位置 */
export class Position {
    readonly lineNumber: number
    readonly column: number

    constructor(lineNumber: number, column: number) {
        this.lineNumber = lineNumber
        this.column = column
    }

    with(newLineNumber: number = this.lineNumber, newColumn: number = this.column): Position {
        if (newLineNumber === this.lineNumber && newColumn === this.column) return this
        return new Position(newLineNumber, newColumn)
    }

    delta(deltaLineNumber: number = 0, deltaColumn: number = 0): Position {
        return this.with(Math.max(1, this.lineNumber + deltaLineNumber), Math.max(1, this.column + deltaColumn))
    }

    equals(other: IPosition): boolean {
        return Position.equals(this, other)
    }

    static equals(a: IPosition | null, b: IPosition | null): boolean {
        if (!a && !b) return true
        return !!a && !!b && a.lineNumber === b.lineNumber && a.column === b.column
    }

    isBefore(other: IPosition): boolean {
        return Position.isBefore(this, other)
    }

    static isBefore(a: IPosition, b: IPosition): boolean {
        if (a.lineNumber < b.lineNumber) return true
        if (b.lineNumber < a.lineNumber) return false
        return a.column < b.column
    }

    isBeforeOrEqual(other: IPosition): boolean {
        return Position.isBeforeOrEqual(this, other)
    }

    static isBeforeOrEqual(a: IPosition, b: IPosition): boolean {
        if (a.lineNumber < b.lineNumber) return true
        if (b.lineNumber < a.lineNumber) return false
        return a.column <= b.column
    }

    /** 排序用的比较函数 */
    static compare(a: IPosition, b: IPosition): number {
        const aLineNumber = a.lineNumber | 0
        const bLineNumber = b.lineNumber | 0
        if (aLineNumber === bLineNumber) {
            const aColumn = a.column | 0
            const bColumn = b.column | 0
            return aColumn - bColumn
        }
        return aLineNumber - bLineNumber
    }

    clone(): Position {
        return new Position(this.lineNumber, this.column)
    }

    toString(): string {
        return '(' + this.lineNumber + ',' + this.column + ')'
    }

    static lift(pos: IPosition): Position {
        return new Position(pos.lineNumber, pos.column)
    }

    static isIPosition(obj: unknown): obj is IPosition {
        const o = obj as IPosition | null | undefined
        return !!o && typeof o.lineNumber === 'number' && typeof o.column === 'number'
    }

    toJSON(): IPosition {
        return { lineNumber: this.lineNumber, column: this.column }
    }
}

/** 编辑器里的一个区间,(startLineNumber,startColumn) <= (endLineNumber,endColumn) */
export class Range {
    readonly startLineNumber: number
    readonly startColumn: number
    readonly endLineNumber: number
    readonly endColumn: number

    constructor(startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number) {
        if (startLineNumber > endLineNumber || (startLineNumber === endLineNumber && startColumn > endColumn)) {
            this.startLineNumber = endLineNumber
            this.startColumn = endColumn
            this.endLineNumber = startLineNumber
            this.endColumn = startColumn
        } else {
            this.startLineNumber = startLineNumber
            this.startColumn = startColumn
            this.endLineNumber = endLineNumber
            this.endColumn = endColumn
        }
    }

    isEmpty(): boolean {
        return Range.isEmpty(this)
    }

    static isEmpty(range: IRange): boolean {
        return range.startLineNumber === range.endLineNumber && range.startColumn === range.endColumn
    }

    isSingleLine(): boolean {
        return this.startLineNumber === this.endLineNumber
    }

    /** 含边界 */
    containsPosition(position: IPosition): boolean {
        return Range.containsPosition(this, position)
    }

    static containsPosition(range: IRange, position: IPosition): boolean {
        if (position.lineNumber < range.startLineNumber || position.lineNumber > range.endLineNumber) return false
        if (position.lineNumber === range.startLineNumber && position.column < range.startColumn) return false
        if (position.lineNumber === range.endLineNumber && position.column > range.endColumn) return false
        return true
    }

    /** 不含边界 */
    static strictContainsPosition(range: IRange, position: IPosition): boolean {
        if (position.lineNumber < range.startLineNumber || position.lineNumber > range.endLineNumber) return false
        if (position.lineNumber === range.startLineNumber && position.column <= range.startColumn) return false
        if (position.lineNumber === range.endLineNumber && position.column >= range.endColumn) return false
        return true
    }

    containsRange(range: IRange): boolean {
        return Range.containsRange(this, range)
    }

    static containsRange(range: IRange, otherRange: IRange): boolean {
        if (otherRange.startLineNumber < range.startLineNumber || otherRange.endLineNumber < range.startLineNumber) return false
        if (otherRange.startLineNumber > range.endLineNumber || otherRange.endLineNumber > range.endLineNumber) return false
        if (otherRange.startLineNumber === range.startLineNumber && otherRange.startColumn < range.startColumn) return false
        if (otherRange.endLineNumber === range.endLineNumber && otherRange.endColumn > range.endColumn) return false
        return true
    }

    strictContainsRange(range: IRange): boolean {
        return Range.strictContainsRange(this, range)
    }

    static strictContainsRange(range: IRange, otherRange: IRange): boolean {
        if (otherRange.startLineNumber < range.startLineNumber || otherRange.endLineNumber < range.startLineNumber) return false
        if (otherRange.startLineNumber > range.endLineNumber || otherRange.endLineNumber > range.endLineNumber) return false
        if (otherRange.startLineNumber === range.startLineNumber && otherRange.startColumn <= range.startColumn) return false
        if (otherRange.endLineNumber === range.endLineNumber && otherRange.endColumn >= range.endColumn) return false
        return true
    }

    plusRange(range: IRange): Range {
        return Range.plusRange(this, range)
    }

    /** 两个区间的并集(最小起点、最大终点) */
    static plusRange(a: IRange, b: IRange): Range {
        let startLineNumber: number
        let startColumn: number
        let endLineNumber: number
        let endColumn: number
        if (b.startLineNumber < a.startLineNumber) {
            startLineNumber = b.startLineNumber
            startColumn = b.startColumn
        } else if (b.startLineNumber === a.startLineNumber) {
            startLineNumber = b.startLineNumber
            startColumn = Math.min(b.startColumn, a.startColumn)
        } else {
            startLineNumber = a.startLineNumber
            startColumn = a.startColumn
        }
        if (b.endLineNumber > a.endLineNumber) {
            endLineNumber = b.endLineNumber
            endColumn = b.endColumn
        } else if (b.endLineNumber === a.endLineNumber) {
            endLineNumber = b.endLineNumber
            endColumn = Math.max(b.endColumn, a.endColumn)
        } else {
            endLineNumber = a.endLineNumber
            endColumn = a.endColumn
        }
        return new Range(startLineNumber, startColumn, endLineNumber, endColumn)
    }

    intersectRanges(range: IRange): Range | null {
        return Range.intersectRanges(this, range)
    }

    /** 两个区间的交集,不相交返回 null */
    static intersectRanges(a: IRange, b: IRange): Range | null {
        let resultStartLineNumber = a.startLineNumber
        let resultStartColumn = a.startColumn
        let resultEndLineNumber = a.endLineNumber
        let resultEndColumn = a.endColumn
        const otherStartLineNumber = b.startLineNumber
        const otherStartColumn = b.startColumn
        const otherEndLineNumber = b.endLineNumber
        const otherEndColumn = b.endColumn
        if (resultStartLineNumber < otherStartLineNumber) {
            resultStartLineNumber = otherStartLineNumber
            resultStartColumn = otherStartColumn
        } else if (resultStartLineNumber === otherStartLineNumber) {
            resultStartColumn = Math.max(resultStartColumn, otherStartColumn)
        }
        if (resultEndLineNumber > otherEndLineNumber) {
            resultEndLineNumber = otherEndLineNumber
            resultEndColumn = otherEndColumn
        } else if (resultEndLineNumber === otherEndLineNumber) {
            resultEndColumn = Math.min(resultEndColumn, otherEndColumn)
        }
        if (resultStartLineNumber > resultEndLineNumber) return null
        if (resultStartLineNumber === resultEndLineNumber && resultStartColumn > resultEndColumn) return null
        return new Range(resultStartLineNumber, resultStartColumn, resultEndLineNumber, resultEndColumn)
    }

    equalsRange(other: IRange | null | undefined): boolean {
        return Range.equalsRange(this, other)
    }

    static equalsRange(a: IRange | null | undefined, b: IRange | null | undefined): boolean {
        if (!a && !b) return true
        return !!a && !!b
            && a.startLineNumber === b.startLineNumber
            && a.startColumn === b.startColumn
            && a.endLineNumber === b.endLineNumber
            && a.endColumn === b.endColumn
    }

    getEndPosition(): Position {
        return Range.getEndPosition(this)
    }

    static getEndPosition(range: IRange): Position {
        return new Position(range.endLineNumber, range.endColumn)
    }

    getStartPosition(): Position {
        return Range.getStartPosition(this)
    }

    static getStartPosition(range: IRange): Position {
        return new Position(range.startLineNumber, range.startColumn)
    }

    toString(): string {
        return '[' + this.startLineNumber + ',' + this.startColumn + ' -> ' + this.endLineNumber + ',' + this.endColumn + ']'
    }

    setEndPosition(endLineNumber: number, endColumn: number): Range {
        return new Range(this.startLineNumber, this.startColumn, endLineNumber, endColumn)
    }

    setStartPosition(startLineNumber: number, startColumn: number): Range {
        return new Range(startLineNumber, startColumn, this.endLineNumber, this.endColumn)
    }

    collapseToStart(): Range {
        return Range.collapseToStart(this)
    }

    static collapseToStart(range: IRange): Range {
        return new Range(range.startLineNumber, range.startColumn, range.startLineNumber, range.startColumn)
    }

    collapseToEnd(): Range {
        return Range.collapseToEnd(this)
    }

    static collapseToEnd(range: IRange): Range {
        return new Range(range.endLineNumber, range.endColumn, range.endLineNumber, range.endColumn)
    }

    /** 整体平移若干行 */
    delta(lineCount: number): Range {
        return new Range(this.startLineNumber + lineCount, this.startColumn, this.endLineNumber + lineCount, this.endColumn)
    }

    static fromPositions(start: IPosition, end: IPosition = start): Range {
        return new Range(start.lineNumber, start.column, end.lineNumber, end.column)
    }

    static lift(range: undefined | null): null
    static lift(range: IRange): Range
    static lift(range: IRange | undefined | null): Range | null
    static lift(range: IRange | undefined | null): Range | null {
        if (!range) return null
        return new Range(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn)
    }

    static isIRange(obj: unknown): obj is IRange {
        const o = obj as IRange | null | undefined
        return !!o
            && typeof o.startLineNumber === 'number'
            && typeof o.startColumn === 'number'
            && typeof o.endLineNumber === 'number'
            && typeof o.endColumn === 'number'
    }

    /** 两个区间有任何接触(含首尾相接)就为 true */
    static areIntersectingOrTouching(a: IRange, b: IRange): boolean {
        if (a.endLineNumber < b.startLineNumber || (a.endLineNumber === b.startLineNumber && a.endColumn < b.startColumn)) return false
        if (b.endLineNumber < a.startLineNumber || (b.endLineNumber === a.startLineNumber && b.endColumn < a.startColumn)) return false
        return true
    }

    /** 两个区间相交(首尾相接不算) */
    static areIntersecting(a: IRange, b: IRange): boolean {
        if (a.endLineNumber < b.startLineNumber || (a.endLineNumber === b.startLineNumber && a.endColumn <= b.startColumn)) return false
        if (b.endLineNumber < a.startLineNumber || (b.endLineNumber === a.startLineNumber && b.endColumn <= a.startColumn)) return false
        return true
    }

    /** 两个区间相交,但完全不相接(Monaco 0.55 areOnlyIntersecting,原样移植) */
    static areOnlyIntersecting(a: IRange, b: IRange): boolean {
        if (a.endLineNumber < (b.startLineNumber - 1) || (a.endLineNumber === b.startLineNumber && a.endColumn < (b.startColumn - 1))) return false
        if (b.endLineNumber < (a.startLineNumber - 1) || (b.endLineNumber === a.startLineNumber && b.endColumn < (a.startColumn - 1))) return false
        return true
    }

    /** 排序比较:先比起点再比终点 */
    static compareRangesUsingStarts(a: IRange | null | undefined, b: IRange | null | undefined): number {
        if (a && b) {
            const aStartLineNumber = a.startLineNumber | 0
            const bStartLineNumber = b.startLineNumber | 0
            if (aStartLineNumber === bStartLineNumber) {
                const aStartColumn = a.startColumn | 0
                const bStartColumn = b.startColumn | 0
                if (aStartColumn === bStartColumn) {
                    const aEndLineNumber = a.endLineNumber | 0
                    const bEndLineNumber = b.endLineNumber | 0
                    if (aEndLineNumber === bEndLineNumber) {
                        const aEndColumn = a.endColumn | 0
                        const bEndColumn = b.endColumn | 0
                        return aEndColumn - bEndColumn
                    }
                    return aEndLineNumber - bEndLineNumber
                }
                return aStartColumn - bStartColumn
            }
            return aStartLineNumber - bStartLineNumber
        }
        const aExists = a ? 1 : 0
        const bExists = b ? 1 : 0
        return aExists - bExists
    }

    /** 排序比较:先比终点再比起点 */
    static compareRangesUsingEnds(a: IRange, b: IRange): number {
        if (a.endLineNumber === b.endLineNumber) {
            if (a.endColumn === b.endColumn) {
                if (a.startLineNumber === b.startLineNumber) return a.startColumn - b.startColumn
                return a.startLineNumber - b.startLineNumber
            }
            return a.endColumn - b.endColumn
        }
        return a.endLineNumber - b.endLineNumber
    }

    static spansMultipleLines(range: IRange): boolean {
        return range.endLineNumber > range.startLineNumber
    }

    toJSON(): IRange {
        return this
    }
}

/** 带方向的区间:起点是 selectionStart,光标在 position */
export class Selection extends Range {
    readonly selectionStartLineNumber: number
    readonly selectionStartColumn: number
    readonly positionLineNumber: number
    readonly positionColumn: number

    constructor(selectionStartLineNumber: number, selectionStartColumn: number, positionLineNumber: number, positionColumn: number) {
        super(selectionStartLineNumber, selectionStartColumn, positionLineNumber, positionColumn)
        this.selectionStartLineNumber = selectionStartLineNumber
        this.selectionStartColumn = selectionStartColumn
        this.positionLineNumber = positionLineNumber
        this.positionColumn = positionColumn
    }

    toString(): string {
        return '[' + this.selectionStartLineNumber + ',' + this.selectionStartColumn + ' -> ' + this.positionLineNumber + ',' + this.positionColumn + ']'
    }

    equalsSelection(other: ISelection): boolean {
        return Selection.selectionsEqual(this, other)
    }

    static selectionsEqual(a: ISelection, b: ISelection): boolean {
        return a.selectionStartLineNumber === b.selectionStartLineNumber
            && a.selectionStartColumn === b.selectionStartColumn
            && a.positionLineNumber === b.positionLineNumber
            && a.positionColumn === b.positionColumn
    }

    getDirection(): SelectionDirection {
        if (this.selectionStartLineNumber === this.startLineNumber && this.selectionStartColumn === this.startColumn) {
            return SelectionDirection.LTR
        }
        return SelectionDirection.RTL
    }

    override setEndPosition(endLineNumber: number, endColumn: number): Selection {
        if (this.getDirection() === SelectionDirection.LTR) {
            return new Selection(this.startLineNumber, this.startColumn, endLineNumber, endColumn)
        }
        return new Selection(endLineNumber, endColumn, this.startLineNumber, this.startColumn)
    }

    getPosition(): Position {
        return new Position(this.positionLineNumber, this.positionColumn)
    }

    getSelectionStart(): Position {
        return new Position(this.selectionStartLineNumber, this.selectionStartColumn)
    }

    override setStartPosition(startLineNumber: number, startColumn: number): Selection {
        if (this.getDirection() === SelectionDirection.LTR) {
            return new Selection(startLineNumber, startColumn, this.endLineNumber, this.endColumn)
        }
        return new Selection(this.endLineNumber, this.endColumn, startLineNumber, startColumn)
    }

    static override fromPositions(start: IPosition, end: IPosition = start): Selection {
        return new Selection(start.lineNumber, start.column, end.lineNumber, end.column)
    }

    static fromRange(range: Range, direction: SelectionDirection): Selection {
        if (direction === SelectionDirection.LTR) {
            return new Selection(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn)
        }
        return new Selection(range.endLineNumber, range.endColumn, range.startLineNumber, range.startColumn)
    }

    static liftSelection(sel: ISelection): Selection {
        return new Selection(sel.selectionStartLineNumber, sel.selectionStartColumn, sel.positionLineNumber, sel.positionColumn)
    }

    static selectionsArrEqual(a: ISelection[] | null | undefined, b: ISelection[] | null | undefined): boolean {
        if ((a && !b) || (!a && b)) return false
        if (!a && !b) return true
        if (a!.length !== b!.length) return false
        for (let i = 0, len = a!.length; i < len; i++) {
            if (!Selection.selectionsEqual(a![i], b![i])) return false
        }
        return true
    }

    static isISelection(obj: unknown): obj is ISelection {
        const o = obj as ISelection | null | undefined
        return !!o
            && typeof o.selectionStartLineNumber === 'number'
            && typeof o.selectionStartColumn === 'number'
            && typeof o.positionLineNumber === 'number'
            && typeof o.positionColumn === 'number'
    }

    static createWithDirection(startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number, direction: SelectionDirection): Selection {
        if (direction === SelectionDirection.LTR) return new Selection(startLineNumber, startColumn, endLineNumber, endColumn)
        return new Selection(endLineNumber, endColumn, startLineNumber, startColumn)
    }
}
