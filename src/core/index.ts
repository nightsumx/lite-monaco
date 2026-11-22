// CM7 内核公开面。自研 from-scratch CM6 重写,可独立于 @codemirror 使用。
// 目录: model/ view/ input/ edit/ feature/ chrome/ diff/ —— 见 src/ARCHITECTURE.md。

export { EditorState, Compartment, StateEffect, StateField, Facet, Annotation, AnnotationType, Transaction } from './model/state'
export type { Extension, StateCommand, TransactionSpec } from './model/state'
export { EditorSelection, SelectionRange } from './model/selection'
export { ChangeSet } from './model/change'
export { Rope } from './model/rope'

export { Decoration } from './model/decoration'
export type { DecorationSet } from './model/decoration'
export { RangeSet, RangeSetBuilder } from './model/rangeset'

export { decorations, EditorView, inputHandler } from './view/editorview'
export type { DecoSource, EditorViewConfig, FoldGutterSpec, InputHandler } from './view/editorview'

export { computeViewport, mapViewport, viewportIsAppropriate, makeScaler, IdScaler, Viewport } from './view/viewport'
export type { YScaler } from './view/viewport'
export { HeightMap, HeightOracle, BlockInfo, QueryType, MeasuredHeights } from './view/heightmap'
export { LineWidthMap, LineWidthOracle } from './view/linewidthmap'

export { buildDefaultKeymap, defaultKeymap, keymapHandler } from './edit/keymap'
export type { KeyBinding, KeymapTarget } from './edit/keymap'
export { keyOS, detectKeyOS } from './keyos'
export type { KeyOS } from './keyos'

export {
    cursorCharBackward,
    cursorCharForward,
    cursorCharLeft,
    cursorCharRight,
    cursorDocEnd,
    cursorDocStart,
    cursorGroupBackward,
    cursorGroupForward,
    cursorGroupForwardWin,
    cursorGroupLeft,
    cursorGroupRight,
    deleteGroupForwardWin,
    gotoLineNumber,
    selectGroupForwardWin,
    cursorWordEndRight,
    cursorWordLeft,
    cursorSubwordForward,
    cursorSubwordBackward,
    cursorLineBoundaryBackward,
    cursorLineBoundaryForward,
    cursorLineBoundaryLeft,
    cursorLineBoundaryRight,
    cursorLineDown,
    cursorLineEnd,
    cursorLineStart,
    cursorLineUp,
    cursorMatchingBracket,
    cursorPageDown,
    cursorPageUp,
    scrollLineDown,
    scrollLineUp,
    scrollPageDown,
    scrollPageUp,
    deleteBracketPair,
    deleteCharBackward,
    deleteCharBackwardStrict,
    deleteCharForward,
    deleteGroupBackward,
    deleteGroupForward,
    deleteToLineEnd,
    deleteToLineStart,
    deleteLineBoundaryForward,
    deleteLineBoundaryBackward,
    deleteTrailingWhitespace,
    deleteLine,
    deleteLineContentOrJoin,
    indentMore,
    indentLess,
    indentSelection,
    insertTab,
    insertNewline,
    insertNewlineAndIndent,
    insertNewlineKeepIndent,
    insertBlankLine,
    insertLineAfter,
    insertLineBefore,
    moveLineDown,
    moveLineUp,
    addCursorAbove,
    addCursorBelow,
    cursorColumnSelectLeft, cursorColumnSelectRight, cursorColumnSelectUp, cursorColumnSelectDown, cursorColumnSelectPageUp, cursorColumnSelectPageDown,
    selectAll,
    selectCharBackward,
    selectCharForward,
    selectCharLeft,
    selectCharRight,
    selectGroupBackward,
    selectGroupForward,
    selectGroupLeft,
    selectGroupRight,
    selectWordEndRight,
    selectWordLeft,
    selectSubwordForward,
    selectSubwordBackward,
    selectDocStart,
    selectDocEnd,
    selectLineDown,
    selectLineBoundaryBackward,
    selectLineBoundaryForward,
    selectLineBoundaryLeft,
    selectLineBoundaryRight,
    selectLineEnd,
    selectLineStart,
    selectLineUp,
    selectLine,
    selectPageDown,
    selectPageUp,
    selectNextOccurrence,
    selectAllOccurrences,
    selectMatchingBracket,
    simplifySelection,
    splitLine,
    joinLines,
    transformToUppercase,
    transformToLowercase,
    transformToTitleCase,
    transformToSnakeCase,
    transformToCamelCase,
    transformToKebabCase,
    transformToPascalCase,
    transformToConstantCase,
    sortLines,
    sortLinesDescending,
    indentToSpaces,
    indentToTabs,
    wrapInParens,
    wrapInBrackets,
    wrapInBraces,
    wrapInQuotes,
    reverseLines,
    removeDuplicateLines,
    selectInside,
    deleteInside,
    duplicateAndComment,
    stripLineComments,
    cycleSurrounding,
    toggleOptionalChain,
    toggleNullish,
    alignEquals,
    stripBlockComments,
    addBraces,
    addAwait,
    toggleExport,
    ifToTernary,
    functionToArrow,
    splitCallArgs,
    joinCallArgs,
    wrapTryCatch,
    unwrapTernary,
    toggleBoolean,
    promoteBinding,
    invertComparison,
    arrowToFunction,
    toggleArrowBraces,
    extractConstant,
    flipIfElse,
    negateIf,
    toggleObjectShorthand,
    swapOperands,
    toggleMemberAccess,
    toggleTrailingComma,
    splitDecl,
    joinDecl,
    unwrapIf,
    toggleAsync,
    removeBraces,
    inlineConstant,
    toggleStrictEq,
    splitArray,
    joinArray,
    toggleIncrement,
    splitString,
    joinString,
    wrapInIf,
    toggleSemicolon,
    toggleLog,
    toggleHexDec,
    mergeIf,
    splitIfAnd,
    toggleArrowParens,
    splitObject,
    joinObject,
    toggleAssignOp,
    toggleTypeImport,
    toggleExportDefault,
    reindentSelection,
    insertFinalNewline,
    duplicateSelection,
    selectParentSyntax,
    enclosingPair,
    removeBrackets,
    deleteBlankLines,
    deleteDuplicateLines,
    insertCursorAtEndOfEachLineSelected,
    incrementNumber,
    decrementNumber,
    findNumberAt,
    moveToNextOccurrence,
    moveToPrevOccurrence,
    toggleLineComment,
    toggleBlockComment,
    blockComment,
    blockUncomment,
    toggleComment,
    commentTokens,
    transposeChars,
    copyLineUp,
    copyLineDown,
    wordAt,
    toggleTabFocusMode,
    tabFocusMoves,
    temporarilySetTabFocusMode,
} from './edit/commands'
export type { CommentTokens } from './edit/commands'
export { countColumn, findColumn } from './model/column'
export { browser } from './browser'
export { atomicRanges, skipAtomsForSelection, skipAtomicRanges } from './edit/atomic'
export { InputState } from './input/inputstate'
export { rectangleSelectionStyle, handleMouseDown, basicMouseSelection, gutterMouseSelection, lineNumberSelectionStyle, multiCursorModifier, resolvedMultiCursorModifier, clickDefinitionHandler, hasMultiCursorModifier, dragScrollLinesPerSecond } from './input/mouseselection'
export type { MultiCursorModifier } from './input/mouseselection'
export { copyWithSyntaxHighlighting, cutOrCopy } from './input/clipboard'

export { attachOverlay } from './feature/overlay'
export type { OverlaySpec } from './feature/overlay'
export { contextMenuCM7, defaultContextMenuItems, contextMenuIsOpen, showContextMenu } from './feature/contextmenu'
export type { ContextMenuItem, ContextMenuOptions, ContextMenuActionProviders } from './feature/contextmenu'
export { openCommandPalette, commandPaletteCommand, defaultPaletteCommands, openGotoLine, gotoLineCommand } from './feature/commandpalette'
export type { PaletteCommand } from './feature/commandpalette'
export { rangeHighlightField } from './feature/gotoline'
export { focusPreventScroll, applyDOMSelection, maxOffset, clampDomPos } from './view/domutil'
export { setDiagnostics, diagnosticsField, diagnosticSquiggles, mapDiagnostics, goToNextProblem, goToPrevProblem } from './feature/diagnostics'
export { hoverSources, hoverMarkers, hoverTooltip, diagnosticHoverSource, diagnosticHoverActions, hoverPosFromPoint, placeTooltip, attachHoverCopyButton, showHover, scrollUpHover, scrollDownHover, scrollLeftHover, scrollRightHover, pageUpHover, pageDownHover, goToTopHover, goToBottomHover, HOVER_COMMANDS, colorHoverSource, colorToHex, hoverScrollKey, computeHoverPositions } from './feature/hover'
export type { HoverMarker, HoverPosition, HoverRangeLike } from './feature/hover'
export type { HoverAction } from './feature/hover'
export { findHexColors, hexColorDecorations } from './feature/hexcolor'
export { findSpecialChars, specialCharDecorations, unicodeHoverSource } from './feature/specialchar'
export { getFoldState, setFoldState, FoldSource, type FoldMemento, type FoldViewState } from './feature/foldstate'
export { findUrlAt, selectLink, registerLinkOpener, openLink, openLinkUrl, openDetectedLink, linkAt, computeLineLinks, linkDecorations, providerLinkDecorations, providerLinkField, setProviderLinks, type ProviderLink, activeLinkDecorations, activeLinkField, setActiveLink, linkHoverSource, linkDetector, LINK_COMMANDS } from './feature/link'
export type { ILinkOpener, LinkUri, DetectedLink } from './feature/link'
export { findTodos, gotoNextTodo, gotoPrevTodo } from './feature/todo'
export { findQuotedAt, toggleQuotes, unwrapQuotes } from './feature/quotes'
export { findTrailingWhitespace, trailingWhitespaceDecorations, findTabStops, tabStopDecorations } from './feature/whitespace'
export { findTags, findMatchingTag, findTagPair, jumpToMatchingTag, selectAroundTag, syncMatchingTag } from './feature/tags'
export { encodeUriSelection, decodeUriSelection } from './feature/uri'
export { closeHtmlTag } from './feature/html'
export { encodeHtml, decodeHtml, encodeHtmlSelection, decodeHtmlSelection } from './feature/htmlentity'
export { escapeText, unescapeText, escapeSelection, unescapeSelection } from './feature/escape'
export { convertRequireLine, convertRequireToImport, convertImportLine, convertImportToRequire } from './feature/requireimport'
export { concatToTemplate, convertConcatToTemplate, templateToConcat, convertTemplateToConcat } from './feature/concat'
export { ifToTernaryLine, functionToArrowLine, splitCallArgsAt, joinCallArgsAt, unwrapTernaryLine, toggleBooleanAt, promoteBindingLine, invertComparisonAt, arrowToFunctionLine, toggleArrowBracesLine, extractConstantEdit, flipIfElseLine, negateIfLine, toggleObjectShorthandAt, swapOperandsAt, toggleMemberAccessAt, toggleTrailingCommaAt, splitDeclLine, joinDeclLines, unwrapIfLine, toggleAsyncLine, removeBracesLine, inlineConstantEdit, toggleStrictEqAt, splitArrayAt, joinArrayAt, toggleIncrementAt, splitStringAt, joinStringAt, wrapInIfLine, toggleSemicolonLine, toggleLogAt, toggleHexDecAt, mergeIfLine, splitIfAndLine, toggleArrowParensLine, splitObjectAt, joinObjectAt, toggleAssignOpAt, toggleTypeImportLine, toggleExportDefaultLine } from './feature/refactor'
// signature / ts auto-diag 在产品层 src/tssignature.ts · src/tsdiagnostics.ts(避免 core 依赖 typescript)
export { stickyScrollOverlay, computeStickyLines, leadingIndent } from './feature/stickyscroll'
export type { StickyLine } from './feature/stickyscroll'
export { lineDiff, splitLinesDiff, sideBySideRows, charDiff, computeLineRangeMappings } from './diff/linediff'
export type { DiffOp, CharPart, LineRangeMapping } from './diff/linediff'
export { showReadOnlyMessage, hideReadOnlyMessage, installReadOnlyMessage } from './feature/readonlymessage'
export { a11ySession, applyEditorA11y, announce, alert, status, ariaLabelOf, screenReaderLabel, syncEditorAria, setActiveDescendant, tabFocusModeSync, toggleTabFocusModeAnnounced } from './feature/a11y'
export { placeholderLayer } from './feature/placeholder'
export type { A11yOptions } from './feature/a11y'
export type { HoverResult, HoverSource } from './feature/hover'
export { overviewRulerCM7, collectMarks } from './chrome/overviewruler'
export { minimapCM7, matchBands } from './chrome/minimap'
export { hScrollbarCM7 } from './chrome/hscrollbar'
export { vScrollbarCM7, vScrollGeometry, BAR_W as VSCROLL_BAR_W } from './chrome/vscrollbar'
export { scrollbarWheelOptions } from './chrome/wheelopts'
export { escapedLineFeedDecorations } from './feature/escapedlf'
export { middleScrollSession } from './input/middlescroll'
export { rulersLayer } from './chrome/rulers'
export type { Diagnostic, DiagnosticRelated, Severity } from './chrome/ruler'

export { shikiDecorations, shikiHighlightCM7 } from './view/shiki'
export type { ShikiOptions } from './view/shiki'

export { CharCategory } from './model/charcategory'
export { history, undo, redo, historyField, isolateHistory, clearHistory, invertedEffects, cursorUndo, cursorRedo } from './edit/history'
export { modelOptionsExtension, headLines, resolveModelOptions, type ModelOptionsInput } from './edit/modeloptions'
export { indentOptions, setIndentOptions, configuredIndentOptions, applyIndentOptions, detectIndentationFromContent, reindentLines, reindentSelectedLines, indentRulesFacet, autoIndentFacet } from './edit/commands'
export type { IndentOptions, IndentationRules } from './edit/commands'
export { addLineComment, removeLineComment } from './edit/comment'
export { guessIndentation } from './edit/indent'
export { deleteAllLeft, deleteAllRight, transposeLetters, transposeCharacters, deleteWordPartBackward, deleteWordPartForward, moveSelectionToNextFindMatch } from './edit/commands'
export { inPlaceReplaceUp, inPlaceReplaceDown } from './edit/inplace'
export { moveCaretLeft, moveCaretRight } from './edit/movecaret'
export { cursorWordStartLeft, selectWordStartLeft, cursorWordEndLeft, selectWordEndLeft, cursorWordStartRight, selectWordStartRight, cursorWordAccessibilityLeft, selectWordAccessibilityLeft, cursorWordAccessibilityRight, selectWordAccessibilityRight, deleteWordStartLeft, deleteWordEndLeft, deleteWordStartRight, deleteWordEndRight, deleteInsideWord } from './edit/commands'
export { selectionDecorations, activeLineDecorations, selectionMatchDecorations, bracketMatchingDecorations, highlightLayer, wordHighlightRanges, currentLineNumbers, type HighlightLayerOptions } from './feature/selectionlayer'
export { indentGuidesCM7, activeIndentGuide, activeIndentGuideLayer, guideLevel, indentUnit } from './feature/indentguides'
export { bracketPairGuideLayer, computeBracketGuides, guideConfig, type BracketGuide } from './feature/bracketguides'
export { bracketColorizeCM7, bracketColorDecorations } from './feature/bracketcolor'
export { selectToBracket, bracketSkip, isSkipScopes, type BracketSkip } from './edit/brackets'
export { foldField, extraFoldField, setExtraFolds, manualFoldField, setManualFolds, selectionOutOfFolds, removeManualFoldingRanges, foldAllBlockComments, foldAllMarkerRegions, unfoldAllMarkerRegions, foldAllExcept, unfoldAllExcept, toggleFoldRecursively, foldable, collectFoldableLines, transactionChangesFold, foldCode, unfoldCode, toggleFold, revealSelectionFolds, foldAll, unfoldAll, foldRecursively, unfoldRecursively, gotoNextFold, gotoPrevFold, gotoParentFold, foldLevel, foldFromSelection, foldDecorations, hiddenAreaDecorations, hiddenAreasField, setHiddenAreasEffect, hiddenLineRanges, hiddenRanges, foldGutterSpec, foldingMaximumRegions, foldingMarkers, type FoldMarkers, type MarkerStep } from './edit/fold'
export { InputMode } from './edit/inputmode'
export { autoClosedField, closeBracketChange, closeBrackets, closeBracketsInput, typeInCompositionOvertype, snippetAutoClosedEffects, compositionEndOvertype, compositionEndAutoClose, surroundCloseFor, closingConfig } from './edit/closebrackets'
export { indentOnCloseBracket, indentOnInput, autoIndentOnType } from './edit/indentoninput'
export {
    SuggestUi, suggestUi, peekSuggestUi, runSuggestCommand,
    suggestAccept, suggestAcceptAlternative, suggestAcceptOnEnter, suggestTab, suggestShiftTab, suggestTrigger, suggestClose, suggestLeaveSnippet,
    suggestNext, suggestPrev, suggestPageNext, suggestPagePrev,
    suggestOverlay, placeCompletionWidget, COMPLETION_VISIBLE_ROWS,
} from './feature/suggestwidget'
export type { SuggestHost, SuggestRow, SuggestInfo, SuggestUiState, SuggestCommandName } from './feature/suggestwidget'
export {
    searchField, searchDecorations, searchPanel,
    openSearch, openSearchReplace, closeSearch, toggleSearchReplace,
    findNext, findPrev,
    setSearchQuery, setReplacement, replaceNext, replaceAll, findMatches,
    toggleFindCaseSensitive, toggleFindWholeWord, toggleFindRegex,
    toggleFindInSelection, toggleFindPreserveCase, findToggleBindings, selectAllSearchMatches,
    findNextSelection, findPrevSelection, findWithSelection, FIND_COMMANDS,
} from './feature/search'
export type { SearchQuery } from './feature/search'

// Monaco 编辑器选项(名字 / 取值 / 默认值与 monaco-editor 一致)
export * from './options'
export { autoIndentOnPaste } from './edit/pasteindent'
export { setTokenTypeSource, standardTokenTypeAt, cachedTokenTypeAt, isCheapToTokenize, type TokenTypeSource, type TokenTypes } from './edit/brackets'
export { enterContext, autoWhitespaceTrims } from './edit/enter'
export { goodIndentFor } from './edit/moveindent'
