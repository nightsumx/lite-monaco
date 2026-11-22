// Monaco common/cursor/cursorMoveCommands 的 CursorMove 命名空间:cursorMove 命令的参数常量(纯字符串枚举,值与 Monaco 一致)。
export namespace CursorMove {
    export const RawDirection = {
        Left: 'left', Right: 'right', Up: 'up', Down: 'down',
        PrevBlankLine: 'prevBlankLine', NextBlankLine: 'nextBlankLine',
        WrappedLineStart: 'wrappedLineStart', WrappedLineFirstNonWhitespaceCharacter: 'wrappedLineFirstNonWhitespaceCharacter',
        WrappedLineColumnCenter: 'wrappedLineColumnCenter', WrappedLineEnd: 'wrappedLineEnd',
        WrappedLineLastNonWhitespaceCharacter: 'wrappedLineLastNonWhitespaceCharacter',
        ViewPortTop: 'viewPortTop', ViewPortCenter: 'viewPortCenter', ViewPortBottom: 'viewPortBottom',
        ViewPortIfOutside: 'viewPortIfOutside',
    }
    export const RawUnit = {
        Line: 'line', WrappedLine: 'wrappedLine', Character: 'character', HalfLine: 'halfLine',
    }
}
