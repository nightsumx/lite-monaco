// Command Palette(F1)—— Monaco CommandsQuickAccessProvider('>' 前缀)。
// 共用 overlay.ts 的 quick input:输入框里带 '>',最近用过的在前、其余按 label 字母序,过滤用 Monaco 的
// or(matchesPrefix, matchesWords, matchesContiguousSubString) 并高亮命中,没命中的再按 tf-idf 给「similar commands」,
// 右侧键帽显示快捷键。删掉 '>' → 帮助列表;输入 ':' → Go to Line(openGotoLine 也在这里,两者是同一个 quick access)。

import type { EditorView } from '../view/editorview'
import type { StateCommand } from '../model/state'
import {
    selectAllOccurrences,
    selectLine,
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
    reindentLines,
    reindentSelectedLines,
    detectIndentationFromContent,
    applyIndentOptions,
    configuredIndentOptions,
    insertFinalNewline,
    duplicateSelection,
    selectParentSyntax,
    deleteBlankLines,
    deleteDuplicateLines,
    removeBrackets,
    insertCursorAtEndOfEachLineSelected,
    deleteInsideWord,
    incrementNumber,
    decrementNumber,
    moveToNextOccurrence,
    moveToPrevOccurrence,
    indentMore,
    indentLess,
    copyLineDown,
    copyLineUp,
    deleteLine,
    toggleComment,
    toggleBlockComment,
    moveLineUp,
    moveLineDown,
    addCursorAbove,
    addCursorBelow,
    insertLineAfter,
    insertLineBefore,
    cursorMatchingBracket,
    deleteTrailingWhitespace,
    deleteAllLeft,
    deleteAllRight,
    transposeLetters,
    transposeCharacters,
    selectNextOccurrence,
    selectPreviousOccurrence,
    moveSelectionToPreviousFindMatch,
    moveSelectionToNextFindMatch,
} from '../edit/commands'
import { cursorUndo, cursorRedo } from '../edit/history'
import { addCursorsToBottom, addCursorsToTop, focusNextCursor, focusPreviousCursor } from '../edit/cursoractions'
import { moveCaretLeft, moveCaretRight } from '../edit/movecaret'
import { EditorZoom } from '../view/viewapi'
import { showContextMenu } from './contextmenu'
import { inPlaceReplaceDown, inPlaceReplaceUp } from '../edit/inplace'
import { foldCode, unfoldCode, toggleFold, foldAll, unfoldAll, foldRecursively, unfoldRecursively, gotoNextFold, gotoPrevFold, gotoParentFold, foldLevel, foldFromSelection, removeManualFoldingRanges, foldAllBlockComments, foldAllMarkerRegions, unfoldAllMarkerRegions, foldAllExcept, unfoldAllExcept, toggleFoldRecursively } from '../edit/fold'
import { addLineComment, removeLineComment } from '../edit/comment'
import { indentConfig } from '../edit/enter'
import { selectLink } from './link'
import { selectToBracket } from '../edit/brackets'
import { toggleQuotes, unwrapQuotes } from './quotes'
import { jumpToMatchingTag, selectAroundTag, syncMatchingTag } from './tags'
import { encodeUriSelection, decodeUriSelection } from './uri'
import { closeHtmlTag } from './html'
import { encodeHtmlSelection, decodeHtmlSelection } from './htmlentity'
import { escapeSelection, unescapeSelection } from './escape'
import { convertRequireToImport, convertImportToRequire } from './requireimport'
import { convertConcatToTemplate, convertTemplateToConcat } from './concat'
import { gotoNextTodo, gotoPrevTodo } from './todo'
import { openSearch, openSearchReplace, findNext, findPrev, findNextSelection, findPrevSelection, findWithSelection } from './search'
import { goToNextProblem, goToPrevProblem } from './diagnostics'
import { hideHover, showHover } from './hover'
import { suggestTrigger } from './suggestwidget'
import { gotoLineProvider, GOTO_LINE_PREFIX } from './gotoline'
import { activeQuickInput, showQuickInput, type QuickAccessProvider, type QuickInput, type QuickPickItem } from './overlay'
import { toggleTabFocusModeAnnounced } from './a11y'
import { keyOS } from '../keyos'

export interface PaletteCommand {
    id: string
    label: string
    keybinding?: string
    /** Monaco action metadata.description:不显示,只进 tf-idf 语料 */
    description?: string
    run: (view: EditorView) => boolean | void | Promise<boolean | void>
}

const isMac = keyOS === 'mac'

function sc(run: StateCommand): (view: EditorView) => boolean {
    return (view) => run(view)
}

// 键帽显示要和实际绑定一致(litemonaco.ts 的 *Bindings 与 edit/keymap.ts);Mac 修饰键顺序 ⌃⌥⇧⌘(Monaco)。
// 和弦用空格隔开:'⌘K ⌘L' / 'Ctrl+K Ctrl+L'。只在 Mac 上有绑定的键(⌃K ⌃T ⌃J 等)别的平台不显示。
// Win/Linux 的方向键照 Monaco UILabelProvider 写成 UpArrow / DownArrow…(_keyCodeToUILabel 只在 Mac 画箭头符号)。
// Linux 和 Windows 键位不同的(kbOpts.linux)单给第三个参数。
const ARROW_LABEL: Record<string, string> = { '←': 'LeftArrow', '↑': 'UpArrow', '→': 'RightArrow', '↓': 'DownArrow' }
function kb(mac: string, other?: string, linux: string | undefined = other): string | undefined {
    return isMac ? mac : (keyOS === 'linux' ? linux : other)?.replace(/[←↑→↓]/g, a => ARROW_LABEL[a])
}
const chordK = (k: string) => kb(`⌘K ⌘${k}`, `Ctrl+K Ctrl+${k}`)

export function defaultPaletteCommands(extra: PaletteCommand[] = []): PaletteCommand[] {
    const mod = isMac ? '⌘' : 'Ctrl+'
    // Monaco 的 F1 里没有 Undo / Redo / Copy / Cut / Paste / Select All(它们是 menu-only 的 core 命令),这里也不登记
    const base: PaletteCommand[] = [
        { id: 'find', label: 'Find', keybinding: `${mod}F`, run: sc(openSearch) },
        { id: 'replace', label: 'Replace', keybinding: kb('⌥⌘F', 'Ctrl+H'), run: sc(openSearchReplace) },
        { id: 'gotoLine', label: 'Go to Line/Column...', keybinding: isMac ? '⌃G' : 'Ctrl+G', run: v => openGotoLine(v, base) },
        // Monaco 键帽取第一个能显示的绑定:查找下一个 / 上一个落在查找框的 Enter / ⇧Enter
        { id: 'findNext', label: 'Find Next', keybinding: kb('Enter', 'Enter'), run: sc(findNext) },
        { id: 'findPrev', label: 'Find Previous', keybinding: kb('⇧Enter', 'Shift+Enter'), run: sc(findPrev) },
        { id: 'findNextSel', label: 'Find Next Selection', keybinding: kb('⌘F3', 'Ctrl+F3'), run: sc(findNextSelection) },
        { id: 'findPrevSel', label: 'Find Previous Selection', keybinding: kb('⇧⌘F3', 'Ctrl+Shift+F3'), run: sc(findPrevSelection) },
        { id: 'findWithSel', label: 'Find with Selection', keybinding: kb('⌘E'), run: sc(findWithSelection) },
        { id: 'palette', label: 'Command Palette', keybinding: 'F1', run: v => openCommandPalette(v, base) },
        { id: 'changeAll', label: 'Change All Occurrences', keybinding: `${mod}F2`, run: sc(selectAllOccurrences) },
        { id: 'selectLine', label: 'Expand Line Selection', keybinding: `${mod}L`, run: sc(selectLine) },
        { id: 'indent', label: 'Indent Line', keybinding: `${mod}]`, run: sc(indentMore) },
        { id: 'outdent', label: 'Outdent Line', keybinding: `${mod}[`, run: sc(indentLess) },
        { id: 'copyLineDown', label: 'Copy Line Down', keybinding: kb('⇧⌥↓', 'Shift+Alt+↓', 'Ctrl+Shift+Alt+↓'), run: sc(copyLineDown) },
        { id: 'copyLineUp', label: 'Copy Line Up', keybinding: kb('⇧⌥↑', 'Shift+Alt+↑', 'Ctrl+Shift+Alt+↑'), run: sc(copyLineUp) },
        { id: 'deleteLine', label: 'Delete Line', keybinding: isMac ? '⇧⌘K' : 'Ctrl+Shift+K', run: sc(deleteLine) },
        { id: 'joinLines', label: 'Join Lines', keybinding: kb('⌃J'), run: sc(joinLines) },
        { id: 'moveLineUp', label: 'Move Line Up', keybinding: kb('⌥↑', 'Alt+↑'), run: sc(moveLineUp) },
        { id: 'moveLineDown', label: 'Move Line Down', keybinding: kb('⌥↓', 'Alt+↓'), run: sc(moveLineDown) },
        { id: 'cursorAbove', label: 'Add Cursor Above', keybinding: kb('⌥⌘↑', 'Ctrl+Alt+↑', 'Shift+Alt+↑'), run: sc(addCursorAbove) },
        { id: 'cursorBelow', label: 'Add Cursor Below', keybinding: kb('⌥⌘↓', 'Ctrl+Alt+↓', 'Shift+Alt+↓'), run: sc(addCursorBelow) },
        { id: 'lineBelow', label: 'Insert Line Below', keybinding: kb('⌘Enter', 'Ctrl+Enter'), run: sc(insertLineAfter) },
        { id: 'lineAbove', label: 'Insert Line Above', keybinding: kb('⇧⌘Enter', 'Ctrl+Shift+Enter'), run: sc(insertLineBefore) },
        { id: 'jumpBracket', label: 'Go to Bracket', keybinding: kb('⇧⌘\\', 'Ctrl+Shift+\\'), run: sc(cursorMatchingBracket) },
        { id: 'trimWs', label: 'Trim Trailing Whitespace', keybinding: chordK('X'), run: sc(deleteTrailingWhitespace) },
        { id: 'delLeft', label: 'Delete All Left', keybinding: kb('⌘Backspace'), run: sc(deleteAllLeft) },
        { id: 'delRight', label: 'Delete All Right', keybinding: kb('⌃K'), run: sc(deleteAllRight) },
        { id: 'transpose', label: 'Transpose Letters', keybinding: kb('⌃T'), run: sc(transposeLetters) },
        { id: 'transposeChars', label: 'Transpose Characters around the Cursor', run: sc(transposeCharacters) },
        { id: 'inPlaceUp', label: 'Replace with Previous Value', keybinding: kb('⇧⌘,', 'Ctrl+Shift+,'), run: sc(inPlaceReplaceUp) },
        { id: 'inPlaceDown', label: 'Replace with Next Value', keybinding: kb('⇧⌘.', 'Ctrl+Shift+.'), run: sc(inPlaceReplaceDown) },
        { id: 'cursorUndo', label: 'Cursor Undo', keybinding: `${mod}U`, run: sc(cursorUndo) },
        { id: 'cursorRedo', label: 'Cursor Redo', run: sc(cursorRedo) },
        { id: 'addSelNext', label: 'Add Selection to Next Find Match', keybinding: `${mod}D`, run: sc(selectNextOccurrence) },
        { id: 'moveSelNext', label: 'Move Last Selection to Next Find Match', keybinding: chordK('D'), run: sc(moveSelectionToNextFindMatch) },
        { id: 'addSelPrev', label: 'Add Selection to Previous Find Match', run: sc(selectPreviousOccurrence) },
        { id: 'moveSelPrev', label: 'Move Last Selection to Previous Find Match', run: sc(moveSelectionToPreviousFindMatch) },
        { id: 'cursorsBottom', label: 'Add Cursors to Bottom', run: sc(addCursorsToBottom) },
        { id: 'cursorsTop', label: 'Add Cursors to Top', run: sc(addCursorsToTop) },
        { id: 'focusNextCursor', label: 'Focus Next Cursor', run: sc(focusNextCursor) },
        { id: 'focusPrevCursor', label: 'Focus Previous Cursor', run: sc(focusPreviousCursor) },
        { id: 'deleteWord', label: 'Delete Word', run: sc(deleteInsideWord) },
        { id: 'moveTextLeft', label: 'Move Selected Text Left', run: v => moveCaretLeft(v) },
        { id: 'moveTextRight', label: 'Move Selected Text Right', run: v => moveCaretRight(v) },
        { id: 'fontZoomIn', label: 'Increase Editor Font Size', run: () => { EditorZoom.setZoomLevel(EditorZoom.getZoomLevel() + 1); return true } },
        { id: 'fontZoomOut', label: 'Decrease Editor Font Size', run: () => { EditorZoom.setZoomLevel(EditorZoom.getZoomLevel() - 1); return true } },
        { id: 'fontZoomReset', label: 'Reset Editor Font Size', run: () => { EditorZoom.setZoomLevel(0); return true } },
        { id: 'showContextMenu', label: 'Show Editor Context Menu', run: v => showContextMenu(v) },
        { id: 'selHighlights', label: 'Select All Occurrences of Find Match', keybinding: kb('⇧⌘L', 'Ctrl+Shift+L'), run: sc(selectAllOccurrences) },
        { id: 'lineComment', label: 'Toggle Line Comment', keybinding: `${mod}/`, run: sc(toggleComment) },
        { id: 'blockComment', label: 'Toggle Block Comment', keybinding: kb('⇧⌥A', 'Shift+Alt+A', 'Ctrl+Shift+A'), run: sc(toggleBlockComment) },
        { id: 'addLineComment', label: 'Add Line Comment', keybinding: chordK('C'), run: sc(addLineComment) },
        { id: 'removeLineComment', label: 'Remove Line Comment', keybinding: chordK('U'), run: sc(removeLineComment) },
        { id: 'upper', label: 'Transform to Uppercase', run: sc(transformToUppercase) },
        { id: 'lower', label: 'Transform to Lowercase', run: sc(transformToLowercase) },
        { id: 'title', label: 'Transform to Title Case', run: sc(transformToTitleCase) },
        { id: 'snake', label: 'Transform to Snake Case', run: sc(transformToSnakeCase) },
        { id: 'camel', label: 'Transform to Camel Case', run: sc(transformToCamelCase) },
        { id: 'kebab', label: 'Transform to Kebab Case', run: sc(transformToKebabCase) },
        { id: 'pascal', label: 'Transform to Pascal Case', run: sc(transformToPascalCase) },
        { id: 'constCase', label: 'Transform to Constant Case', run: sc(transformToConstantCase) },
        { id: 'sortLines', label: 'Sort Lines Ascending', run: sc(sortLines) },
        { id: 'sortDesc', label: 'Sort Lines Descending', run: sc(sortLinesDescending) },
        { id: 'toSpaces', label: 'Convert Indentation to Spaces', description: 'Convert the tab indentation to spaces.', run: sc(indentToSpaces) },
        { id: 'toTabs', label: 'Convert Indentation to Tabs', description: 'Convert the spaces indentation to tabs.', run: sc(indentToTabs) },
        // 缩进选项(Monaco contrib/indentation;都没有默认键位)
        { id: 'detectIndent', label: 'Detect Indentation from Content', description: 'Detect the indentation from content.', run: sc(detectIndentationFromContent) },
        { id: 'indentSpaces', label: 'Indent Using Spaces', description: 'Use indentation with spaces.', run: v => openTabSizePick(v, 'spaces') },
        { id: 'indentTabs', label: 'Indent Using Tabs', description: 'Use indentation with tabs.', run: v => openTabSizePick(v, 'tabs') },
        { id: 'tabDisplaySize', label: 'Change Tab Display Size', description: 'Change the space size equivalent of the tab.', run: v => openTabSizePick(v, 'display') },
        { id: 'reindentLines', label: 'Reindent Lines', description: 'Reindent the lines of the editor.', run: sc(reindentLines) },
        { id: 'toggleQ', label: 'Toggle Quotes', run: sc(toggleQuotes) },
        { id: 'unwrapQ', label: 'Unwrap Quotes', run: sc(unwrapQuotes) },
        { id: 'wrapParen', label: 'Wrap with Parentheses', run: sc(wrapInParens) },
        { id: 'wrapBrack', label: 'Wrap with Brackets', run: sc(wrapInBrackets) },
        { id: 'wrapBrace', label: 'Wrap with Braces', run: sc(wrapInBraces) },
        { id: 'wrapQuote', label: 'Wrap with Quotes', run: sc(wrapInQuotes) },
        { id: 'revLines', label: 'Reverse lines', run: sc(reverseLines) },
        { id: 'delDupLines', label: 'Delete Duplicate Lines', run: sc(removeDuplicateLines) },
        { id: 'selInside', label: 'Select Inside', run: sc(selectInside) },
        { id: 'delInside', label: 'Delete Inside', run: sc(deleteInside) },
        { id: 'dupComment', label: 'Duplicate and Comment', run: sc(duplicateAndComment) },
        { id: 'escape', label: 'Escape Selection', run: sc(escapeSelection) },
        { id: 'unescape', label: 'Unescape Selection', run: sc(unescapeSelection) },
        { id: 'reindent', label: 'Reindent Selected Lines', description: 'Reindent the selected lines of the editor.', run: sc(reindentSelectedLines) },
        { id: 'matchTag', label: 'Go to Matching Tag', run: sc(jumpToMatchingTag) },
        { id: 'selTag', label: 'Select Around Tag', run: sc(selectAroundTag) },
        { id: 'syncTag', label: 'Sync Matching Tag Name', run: sc(syncMatchingTag) },
        { id: 'encUri', label: 'Encode URI Component', run: sc(encodeUriSelection) },
        { id: 'decUri', label: 'Decode URI Component', run: sc(decodeUriSelection) },
        { id: 'nullish', label: 'Toggle ?? / ||', run: sc(toggleNullish) },
        { id: 'alignEq', label: 'Align Equals', run: sc(alignEquals) },
        { id: 'stripBlk', label: 'Strip Block Comments', run: sc(stripBlockComments) },
        { id: 'addBraces', label: 'Add Braces to Statement', run: sc(addBraces) },
        { id: 'addAwait', label: 'Add await / async', run: sc(addAwait) },
        { id: 'togExp', label: 'Toggle Export', run: sc(toggleExport) },
        { id: 'ifTern', label: 'Convert if/else to Ternary', run: sc(ifToTernary) },
        { id: 'unTern', label: 'Convert Ternary to if/else', run: sc(unwrapTernary) },
        { id: 'fnArrow', label: 'Convert Function to Arrow', run: sc(functionToArrow) },
        { id: 'splitArgs', label: 'Split Call Arguments', run: sc(splitCallArgs) },
        { id: 'joinArgs', label: 'Join Call Arguments', run: sc(joinCallArgs) },
        { id: 'tryCatch', label: 'Wrap in try/catch', run: sc(wrapTryCatch) },
        { id: 'togBool', label: 'Toggle true / false', run: sc(toggleBoolean) },
        { id: 'promote', label: 'Promote var / let', run: sc(promoteBinding) },
        { id: 'invCmp', label: 'Invert Comparison', run: sc(invertComparison) },
        { id: 'arrowFn', label: 'Convert Arrow to Function', run: sc(arrowToFunction) },
        { id: 'arrowBr', label: 'Toggle Arrow Braces', run: sc(toggleArrowBraces) },
        { id: 'extract', label: 'Extract Constant', run: sc(extractConstant) },
        { id: 'flipIf', label: 'Flip if / else', run: sc(flipIfElse) },
        { id: 'negIf', label: 'Negate if Condition', run: sc(negateIf) },
        { id: 'objShort', label: 'Toggle Object Shorthand', run: sc(toggleObjectShorthand) },
        { id: 'swapOp', label: 'Swap Operands', run: sc(swapOperands) },
        { id: 'dotBrack', label: 'Toggle . / [] Member', run: sc(toggleMemberAccess) },
        { id: 'trailComma', label: 'Toggle Trailing Comma', run: sc(toggleTrailingComma) },
        { id: 'splitDecl', label: 'Split Declaration', run: sc(splitDecl) },
        { id: 'joinDecl', label: 'Join Declarations', run: sc(joinDecl) },
        { id: 'unwrapIf', label: 'Unwrap if', run: sc(unwrapIf) },
        { id: 'togAsync', label: 'Toggle async', run: sc(toggleAsync) },
        { id: 'rmBraces', label: 'Remove Braces from Statement', run: sc(removeBraces) },
        { id: 'inline', label: 'Inline Constant', run: sc(inlineConstant) },
        { id: 'strictEq', label: 'Toggle == / ===', run: sc(toggleStrictEq) },
        { id: 'splitArr', label: 'Split Array', run: sc(splitArray) },
        { id: 'joinArr', label: 'Join Array', run: sc(joinArray) },
        { id: 'togInc', label: 'Toggle ++ Prefix / Postfix', run: sc(toggleIncrement) },
        { id: 'splitStr', label: 'Split String', run: sc(splitString) },
        { id: 'closeTag', label: 'Close HTML Tag', run: sc(closeHtmlTag) },
        { id: 'encHtml', label: 'Encode HTML Entities', run: sc(encodeHtmlSelection) },
        { id: 'decHtml', label: 'Decode HTML Entities', run: sc(decodeHtmlSelection) },
        { id: 'reqImp', label: 'Convert require to import', run: sc(convertRequireToImport) },
        { id: 'impReq', label: 'Convert import to require', run: sc(convertImportToRequire) },
        { id: 'toTpl', label: 'Convert Concatenation to Template', run: sc(convertConcatToTemplate) },
        { id: 'fromTpl', label: 'Convert Template to Concatenation', run: sc(convertTemplateToConcat) },
        { id: 'joinStr', label: 'Join Strings', run: sc(joinString) },
        { id: 'wrapIf', label: 'Wrap in if (true)', run: sc(wrapInIf) },
        { id: 'togSemi', label: 'Toggle Semicolon', run: sc(toggleSemicolon) },
        { id: 'togLog', label: 'Toggle console.log', run: sc(toggleLog) },
        { id: 'hexDec', label: 'Toggle Hex / Decimal', run: sc(toggleHexDec) },
        { id: 'mergeIf', label: 'Merge Nested if', run: sc(mergeIf) },
        { id: 'splitIf', label: 'Split if &&', run: sc(splitIfAnd) },
        { id: 'arrowPar', label: 'Toggle Arrow Parens', run: sc(toggleArrowParens) },
        { id: 'splitObj', label: 'Split Object', run: sc(splitObject) },
        { id: 'joinObj', label: 'Join Object', run: sc(joinObject) },
        { id: 'assignOp', label: 'Toggle += / = +', run: sc(toggleAssignOp) },
        { id: 'typeImp', label: 'Toggle import type', run: sc(toggleTypeImport) },
        { id: 'expDef', label: 'Toggle export default', run: sc(toggleExportDefault) },
        { id: 'stripCmt', label: 'Strip Line Comments', run: sc(stripLineComments) },
        { id: 'cycleSur', label: 'Cycle Surrounding Brackets', run: sc(cycleSurrounding) },
        { id: 'optChain', label: 'Toggle Optional Chain', run: sc(toggleOptionalChain) },
        { id: 'finalNl', label: 'Insert Final New Line', run: sc(insertFinalNewline) },
        { id: 'dupSel', label: 'Duplicate Selection', run: sc(duplicateSelection) },
        { id: 'selParent', label: 'Select Parent Bracket', run: sc(selectParentSyntax) },
        { id: 'delBlank', label: 'Delete Blank Lines', run: sc(deleteBlankLines) },
        { id: 'delDup', label: 'Delete Duplicate Lines', run: sc(deleteDuplicateLines) },
        { id: 'unwrap', label: 'Remove Brackets', keybinding: kb('⌥⌘Backspace', 'Ctrl+Alt+Backspace'), run: sc(removeBrackets) },
        { id: 'selectToBracket', label: 'Select to Bracket', description: 'Select the text inside and including the brackets or curly braces', run: sc(selectToBracket) },
        { id: 'cursorsAtEnds', label: 'Add Cursors to Line Ends', keybinding: isMac ? '⇧⌥I' : 'Shift+Alt+I', run: sc(insertCursorAtEndOfEachLineSelected) },
        { id: 'incNum', label: 'Increment Number', run: sc(incrementNumber) },
        { id: 'decNum', label: 'Decrement Number', run: sc(decrementNumber) },
        { id: 'nextOcc', label: 'Go to Next Occurrence', run: sc(moveToNextOccurrence) },
        { id: 'prevOcc', label: 'Go to Previous Occurrence', run: sc(moveToPrevOccurrence) },
        { id: 'selLink', label: 'Select Link', run: sc(selectLink) },
        { id: 'showHover', label: 'Show or Focus Hover', description: 'Show or focus the editor hover which shows documentation, references, and other content for a symbol at the current cursor position.', keybinding: chordK('I'), run: (v) => { void showHover(v); return true } },
        { id: 'hideHover', label: 'Hide Hover', description: 'Hide the editor hover.', run: v => hideHover(v) },
        // Monaco 有「本文件」(⌥F8)和「跨文件」(F8)两组;单文件里是一回事,两组键都绑了
        { id: 'nextProb', label: 'Go to Next Problem (Error, Warning, Info)', keybinding: kb('⌥F8', 'Alt+F8'), run: sc(goToNextProblem) },
        { id: 'prevProb', label: 'Go to Previous Problem (Error, Warning, Info)', keybinding: kb('⇧⌥F8', 'Shift+Alt+F8'), run: sc(goToPrevProblem) },
        { id: 'nextProbFiles', label: 'Go to Next Problem in Files (Error, Warning, Info)', keybinding: 'F8', run: sc(goToNextProblem) },
        { id: 'prevProbFiles', label: 'Go to Previous Problem in Files (Error, Warning, Info)', keybinding: kb('⇧F8', 'Shift+F8'), run: sc(goToPrevProblem) },
        // 折叠(Monaco folding.js;键位见 litemonaco.ts foldBindings)
        { id: 'foldCode', label: 'Fold', description: 'Fold the content in the editor', keybinding: kb('⌥⌘[', 'Ctrl+Shift+['), run: sc(foldCode) },
        { id: 'unfold', label: 'Unfold', description: 'Unfold the content in the editor', keybinding: kb('⌥⌘]', 'Ctrl+Shift+]'), run: sc(unfoldCode) },
        { id: 'fold', label: 'Toggle Fold', keybinding: chordK('L'), run: sc(toggleFold) },
        { id: 'foldAll', label: 'Fold All', keybinding: chordK('0'), run: sc(foldAll) },
        { id: 'unfoldAll', label: 'Unfold All', keybinding: chordK('J'), run: sc(unfoldAll) },
        { id: 'foldRec', label: 'Fold Recursively', keybinding: chordK('['), run: sc(foldRecursively) },
        { id: 'unfoldRec', label: 'Unfold Recursively', keybinding: chordK(']'), run: sc(unfoldRecursively) },
        ...[1, 2, 3, 4, 5, 6, 7].map(n => ({ id: `foldLv${n}`, label: `Fold Level ${n}`, keybinding: chordK(String(n)), run: sc(foldLevel(n)) })),
        { id: 'nextFold', label: 'Go to Next Folding Range', run: sc(gotoNextFold) },
        { id: 'prevFold', label: 'Go to Previous Folding Range', run: sc(gotoPrevFold) },
        { id: 'parentFold', label: 'Go to Parent Fold', run: sc(gotoParentFold) },
        { id: 'foldSel', label: 'Create Folding Range from Selection', keybinding: chordK(','), run: sc(foldFromSelection) },
        { id: 'removeManualFolds', label: 'Remove Manual Folding Ranges', keybinding: chordK('.'), run: sc(removeManualFoldingRanges) },
        { id: 'foldBlockComments', label: 'Fold All Block Comments', keybinding: chordK('/'), run: sc(foldAllBlockComments) },
        { id: 'foldRegions', label: 'Fold All Regions', keybinding: chordK('8'), run: sc(foldAllMarkerRegions) },
        { id: 'unfoldRegions', label: 'Unfold All Regions', keybinding: chordK('9'), run: sc(unfoldAllMarkerRegions) },
        { id: 'foldExcept', label: 'Fold All Except Selected', keybinding: chordK('-'), run: sc(foldAllExcept) },
        { id: 'unfoldExcept', label: 'Unfold All Except Selected', keybinding: chordK('='), run: sc(unfoldAllExcept) },
        { id: 'toggleFoldRec', label: 'Toggle Fold Recursively', keybinding: kb('⌘K ⇧⌘L', 'Ctrl+K Ctrl+Shift+L'), run: sc(toggleFoldRecursively) },
        { id: 'nextTodo', label: 'Go to Next TODO', run: sc(gotoNextTodo) },
        { id: 'prevTodo', label: 'Go to Previous TODO', run: sc(gotoPrevTodo) },
        { id: 'toggleTabFocus', label: 'Toggle Tab Key Moves Focus', description: 'Determines whether the tab key moves focus around the workbench or inserts the tab character in the current editor. This is also called tab trapping, tab navigation, or tab focus mode.', keybinding: kb('⌃⇧M', 'Ctrl+M'), run: v => toggleTabFocusModeAnnounced(v) },
        { id: 'triggerSuggest', label: 'Trigger Suggest', keybinding: kb('⌃Space', 'Ctrl+Space'), run: sc(suggestTrigger) },
    ]
    const seen = new Set(base.map(c => c.id))
    for (const e of extra) {
        if (!seen.has(e.id)) base.push(e)
    }
    return base
}

export const COMMAND_PREFIX = '>'

// Indent Using Spaces / Tabs、Change Tab Display Size 的 quick pick(Monaco ChangeIndentationSizeAction):
// 1–8,焦点在当前 tabSize;当前值和配置值不同时分别标 "Current Tab Size" / "Default Tab Size",相同标 "Configured Tab Size"。
// 输入数字过滤;没有匹配时显示提示行。选中:Spaces / Tabs 设 tabSize = indentSize = N 和 insertSpaces,Display 只改 tabSize。
function openTabSizePick(view: EditorView, kind: 'spaces' | 'tabs' | 'display'): boolean {
    const state = view.state
    const current = indentConfig(state).tabSize
    const configured = configuredIndentOptions(state).tabSize
    const describe = (n: number) => n === current && n === configured ? 'Configured Tab Size'
        : n === current ? 'Current Tab Size'
            : n === configured ? 'Default Tab Size' : undefined
    const choose = (n: number) => () => {
        const next = kind === 'display' ? { tabSize: n }
            : { tabSize: n, indentSize: n, insertSpaces: kind === 'spaces' }
        return applyIndentOptions(next)(view)
    }
    const all = [1, 2, 3, 4, 5, 6, 7, 8]
    let shown: number[] = all
    const provider: QuickAccessProvider = {
        prefix: '',
        placeholder: 'Select Tab Size for Current File',
        items(filter) {
            const q = filter.trim()
            const out: QuickPickItem[] = []
            shown = []
            for (const n of all) {
                const highlights = matchCommandLabel(q, String(n))
                if (!highlights) continue
                shown.push(n)
                out.push({ label: String(n), highlights, description: describe(n), run: choose(n) })
            }
            if (!out.length) out.push({ label: 'Press \'Enter\' to confirm your input or \'Escape\' to cancel' })
            return out
        },
        activeIndex: () => Math.max(0, shown.indexOf(current)),
    }
    // 从命令面板选中时面板已先关(accept 先 hide 再 run),这里新开一个
    showQuickInput(view, '', [provider])
    return true
}

// Monaco filters.ts isWordSeparator:空白 + ()[]{}<>`'"-/;:,.?!
function isWordSeparator(ch: string): boolean {
    return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || '()[]{}<>`\'"-/;:,.?!'.includes(ch)
}

// 下一个「词首」:分隔符本身或分隔符后一位
function nextWord(t: string, start: number): number {
    for (let i = start; i < t.length; i++)
        if (isWordSeparator(t[i]) || (i > 0 && isWordSeparator(t[i - 1]))) return i
    return t.length
}

// Monaco _matchesWords:查询逐字吃进目标,每段可在任一词首重新起头(trup → Tr·ansform to Up·percase)
function matchWordsAt(q: string, t: string, i: number, j: number): number[] | null {
    if (i === q.length) return []
    if (j === t.length) return null
    if (!(q[i] === t[j] || (isWordSeparator(q[i]) && isWordSeparator(t[j])))) return null
    let rest = matchWordsAt(q, t, i + 1, j + 1)
    let next = j + 1
    while (!rest && (next = nextWord(t, next)) < t.length) {
        rest = matchWordsAt(q, t, i + 1, next)
        next++
    }
    if (!rest) return null
    return q[i] === t[j] ? [j, ...rest] : rest
}

/** 命令 label 过滤 + 高亮区间;不匹配返回 null。空查询匹配一切(无高亮)。 */
export function matchCommandLabel(query: string, label: string): [number, number][] | null {
    if (!query) return []
    const q = query.toLowerCase()
    const t = label.toLowerCase()
    if (t.startsWith(q)) return [[0, q.length]]
    for (let start = 0; start < t.length; start = nextWord(t, start + 1)) {
        const hit = matchWordsAt(q, t, 0, start)
        if (!hit) continue
        const ranges: [number, number][] = []
        for (const k of hit) {
            const last = ranges[ranges.length - 1]
            if (last && last[1] === k) last[1] = k + 1
            else ranges.push([k, k + 1])
        }
        return ranges
    }
    const at = t.indexOf(q)
    return at >= 0 ? [[at, at + q.length]] : null
}

// Monaco CommandsHistory:模块级 LRU(50 条),值是全局递增的计数,越大越近(不落盘,同 standalone 编辑器)
const history = new Map<string, number>()
let historyCounter = 1
function pushHistory(id: string) {
    history.delete(id)
    history.set(id, historyCounter++)
    if (history.size > 50) history.delete(history.keys().next().value!)
}

function isLetter(ch: string): boolean {
    return ch.toLowerCase() !== ch.toUpperCase()
}

// Monaco TfIdfCalculator.splitTerms:以字母开头、至少 3 个字母/数字的词(小写),camelCase 再拆出 ≥3 字母的段
function splitTerms(input: string): string[] {
    const out: string[] = []
    let i = 0
    while (i < input.length) {
        const ch = input[i]
        const alnum = (c: string) => isLetter(c) || (c >= '0' && c <= '9')
        if (!alnum(ch)) { i++; continue }
        let j = i
        while (j < input.length && alnum(input[j])) j++
        const word = input.slice(i, j)
        // \b:前后不是 _(JS 的 \w 含 _)
        if (isLetter(ch) && word.length >= 3 && input[i - 1] !== '_' && input[j] !== '_') {
            out.push(word.toLowerCase())
            const parts: string[] = []
            let start = 0
            for (let k = 1; k < word.length; k++) {
                const a = word[k - 1], b = word[k]
                if (a >= 'a' && a <= 'z' && b >= 'A' && b <= 'Z') { parts.push(word.slice(start, k)); start = k }
            }
            if (parts.length) {
                parts.push(word.slice(start))
                for (const part of parts) {
                    let run = 0, ok = false
                    for (const c of part) { run = isLetter(c) ? run + 1 : 0; if (run >= 3) ok = true }
                    if (part.length > 2 && ok) out.push(part.toLowerCase())
                }
            }
        }
        i = j
    }
    return out
}

function termFrequencies(input: string): Map<string, number> {
    const tf = new Map<string, number>()
    for (const t of splitTerms(input)) tf.set(t, (tf.get(t) ?? 0) + 1)
    return tf
}

/** Monaco 命令面板的 tf-idf「similar commands」:每条命令一个 chunk(label - description),按最高分归一化,> 0.5 的前 5 个。 */
export function similarCommands(chunks: readonly string[], query: string): Map<number, number> {
    const docs = chunks.map(termFrequencies)
    const occurrences = new Map<string, number>()
    for (const tf of docs) for (const t of tf.keys()) occurrences.set(t, (occurrences.get(t) ?? 0) + 1)
    const idf = (t: string) => {
        const n = occurrences.get(t) ?? 0
        return n > 0 ? Math.log((docs.length + 1) / n) : 0
    }
    const embedding: [string, number][] = []
    for (const [t, n] of termFrequencies(query)) if (idf(t) > 0) embedding.push([t, n * idf(t)])
    const scores: { i: number, score: number }[] = []
    docs.forEach((tf, i) => {
        let sum = 0
        for (const [t, w] of embedding) sum += (tf.get(t) ?? 0) * idf(t) * w
        if (sum > 0) scores.push({ i, score: sum })
    })
    scores.sort((a, b) => b.score - a.score)
    const max = scores[0]?.score ?? 0
    const out = new Map<number, number>()
    for (const { i, score } of scores) {
        if (out.size === 5) break
        if (score / max > 0.5) out.set(i, score / max)
    }
    return out
}

// Monaco AbstractCommandsQuickAccessProvider._getPicks:label 命中 / id 全等 / (过滤词 ≥ 3)tf-idf;
// 排序 tf-idf 垫底、最近用过的在前(越近越前)、其余按 label;分组线 recently used / similar commands / other commands。
function commandsProvider(view: EditorView, commands: PaletteCommand[]): QuickAccessProvider {
    return {
        prefix: COMMAND_PREFIX,
        items(filter): QuickPickItem[] {
            const q = filter.trim()
            let similar: Map<number, number> | null = null
            const picks: { c: PaletteCommand, highlights: [number, number][], tfidf?: number }[] = []
            commands.forEach((c, i) => {
                const highlights = matchCommandLabel(q, c.label)
                if (highlights) picks.push({ c, highlights })
                else if (q === c.id) picks.push({ c, highlights: [] })
                else if (q.length >= 3) {
                    similar ??= similarCommands(commands.map(c => c.description ? `${c.label} - ${c.description}` : c.label), q)
                    const tfidf = similar.get(i)
                    if (tfidf) picks.push({ c, highlights: [], tfidf })
                }
            })
            const used = (c: PaletteCommand) => history.get(c.id)
            picks.sort((a, b) => {
                if (a.tfidf && b.tfidf) return a.tfidf === b.tfidf ? a.c.label.localeCompare(b.c.label) : b.tfidf - a.tfidf
                if (a.tfidf) return 1
                if (b.tfidf) return -1
                const ua = used(a.c), ub = used(b.c)
                if (ua && ub) return ub - ua
                if (ua) return -1
                if (ub) return 1
                return a.c.label.localeCompare(b.c.label)
            })
            const labels = new Map<string, number>()
            for (const p of picks) labels.set(p.c.label, (labels.get(p.c.label) ?? 0) + 1)
            let other = false
            let suggested = true
            return picks.map((p, i): QuickPickItem => {
                let separator: string | undefined
                if (i === 0 && used(p.c)) { separator = 'recently used'; other = true }
                if (suggested && p.tfidf !== undefined) { separator = 'similar commands'; suggested = false }
                if (other && p.tfidf === undefined && !used(p.c)) { separator = 'other commands'; other = false }
                return {
                    label: p.c.label,
                    highlights: p.highlights,
                    description: labels.get(p.c.label)! > 1 ? p.c.id : undefined,
                    keybinding: p.c.keybinding,
                    separator,
                    run: () => { pushHistory(p.c.id); return p.c.run(view) },
                }
            })
        },
    }
}

// '' 前缀:Monaco 删光前缀后的帮助列表(HelpQuickAccessProvider,按前缀排序),选中即换前缀;有输入就按 label 过滤(`?` 不命中 `:`)。
// '@' 只在宿主给了 Go to Symbol(TS)时列,选中直接开它的列表;'@:'(按类别)没有。
function helpProvider(view: EditorView, commands: PaletteCommand[]): QuickAccessProvider {
    const to = (prefix: string) => () => activeQuickInput(view)?.setValue(prefix)
    const symbol = commands.find(c => c.id === 'gotoSym')
    const rows: QuickPickItem[] = [
        { label: '\u2026', description: 'Show all Quick Access Providers', keepOpen: true, run: to('') },
        { label: GOTO_LINE_PREFIX, description: 'Go to Line/Column...', keybinding: isMac ? '⌃G' : 'Ctrl+G', keepOpen: true, run: to(GOTO_LINE_PREFIX) },
        ...(symbol ? [{ label: '@', description: 'Go to Symbol...', keybinding: symbol.keybinding, run: () => symbol.run(view) }] : []),
        { label: COMMAND_PREFIX, description: 'Show And Run Commands', keybinding: 'F1', keepOpen: true, run: to(COMMAND_PREFIX) },
    ]
    return {
        prefix: '',
        items(filter) {
            const out: QuickPickItem[] = []
            // Monaco quick pick 的 matchesFuzzy:这几个 label 都是符号,前缀 / camelCase / 连续子串都归结为子串
            const q = filter.trim()
            for (const r of rows) {
                const at = r.label.indexOf(q)
                if (at >= 0) out.push({ ...r, highlights: q ? [[at, at + q.length]] : [], ariaLabel: `${r.label}, ${r.description}` })
            }
            return out
        },
    }
}

// 外部贡献的命令(editor.addAction):按 view 登记,每次打开面板时现取(precondition 在贡献方判)。
const paletteContributors = new WeakMap<EditorView, Set<() => PaletteCommand[]>>()

export function addPaletteContributor(view: EditorView, fn: () => PaletteCommand[]): () => void {
    let set = paletteContributors.get(view)
    if (!set) paletteContributors.set(view, set = new Set())
    set.add(fn)
    return () => { set!.delete(fn) }
}

function contributedCommands(view: EditorView): PaletteCommand[] {
    const out: PaletteCommand[] = []
    for (const fn of paletteContributors.get(view) ?? []) out.push(...fn())
    return out
}

// 输入框里的 F1 / ⌃G 在这里接住(Monaco quickCommand、gotoLine 在 quick input 里照样生效);quick input 复用同一个 input
const keysBound = new WeakSet<HTMLInputElement>()

// Monaco QuickAccessController.show(prefix):
//   已是这个前缀:值不动;别的前缀(':' 跳行 / '>' 命令 / '' 帮助):过滤词搬到新前缀后面;新开:只有前缀。
//   最后都把前缀之后的部分选中。
function showQuickAccess(view: EditorView, prefix: string, commands: PaletteCommand[]): boolean {
    commands = [...commands, ...contributedCommands(view)]
    const v = activeQuickInput(view)?.input.value
    let value = prefix
    if (v !== undefined) {
        const rest = v.startsWith(COMMAND_PREFIX) || v.startsWith(GOTO_LINE_PREFIX) ? v.slice(1) : v
        if (v.startsWith(prefix)) value = v
        else if (rest) value = prefix + rest
    }
    const qi: QuickInput = showQuickInput(view, value, [
        commandsProvider(view, commands),
        gotoLineProvider(view),
        helpProvider(view, commands),
    ])
    qi.input.setSelectionRange(prefix.length, qi.input.value.length)
    if (!keysBound.has(qi.input)) {
        keysBound.add(qi.input)
        qi.input.addEventListener('keydown', (e) => {
            if (e.isComposing || e.altKey || e.shiftKey) return
            const f1 = e.key === 'F1' && !e.ctrlKey && !e.metaKey
            const g = e.code === 'KeyG' && e.ctrlKey && !e.metaKey
            if (!f1 && !g) return
            e.preventDefault()
            e.stopPropagation()
            showQuickAccess(view, f1 ? COMMAND_PREFIX : GOTO_LINE_PREFIX, commands)
        })
    }
    return true
}

export function openCommandPalette(view: EditorView, commands?: PaletteCommand[]): boolean {
    return showQuickAccess(view, COMMAND_PREFIX, commands ?? defaultPaletteCommands())
}

/** 打开 Go to Line(':');命令面板开着就原地换前缀、带上过滤词。 */
export function openGotoLine(view: EditorView, commands?: PaletteCommand[]): boolean {
    return showQuickAccess(view, GOTO_LINE_PREFIX, commands ?? defaultPaletteCommands())
}

export const gotoLineCommand = (view: EditorView) => openGotoLine(view)

export function commandPaletteCommand(extra?: PaletteCommand[]): (view: EditorView) => boolean {
    return (view) => openCommandPalette(view, defaultPaletteCommands(extra))
}
