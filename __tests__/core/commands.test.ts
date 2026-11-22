import type { Transaction } from '../../src/core/model/state'
import { describe, expect, it } from 'vitest'
import {
    copyLineDown,
    copyLineUp,
    cursorCharBackward,
    cursorCharForward,
    cursorCharRight,
    cursorCharLeft,
    cursorDocEnd,
    cursorDocStart,
    cursorGroupBackward,
    cursorGroupForward,
    cursorWordEndRight,
    cursorWordLeft,
    selectWordEndRight,
    cursorLineBoundaryBackward,
    cursorLineDown,
    cursorLineEnd,
    cursorLineStart,
    cursorLineUp,
    deleteBracketPair,
    deleteCharBackward,
    deleteCharForward,
    deleteGroupBackward,
    deleteGroupForward,
    deleteLine,
    deleteLineContentOrJoin,
    deleteTrailingWhitespace,
    indentLess,
    indentMore,
    insertNewline,
    insertTab,
    insertNewlineAndIndent,
    insertLineAfter,
    insertLineBefore,
    cursorMatchingBracket,
    cursorPageDown,
    cursorPageUp,
    selectPageDown,
    moveLineDown,
    moveLineUp,
    selectAll,
    selectCharForward,
    selectGroupForward,
    selectLine,
    selectLineBoundaryBackward,
    selectLineEnd,
    selectNextOccurrence,
    selectAllOccurrences,
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
    sortLines,
    sortLinesDescending,
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
    moveToNextOccurrence,
    moveToPrevOccurrence,
    indentToSpaces,
    indentToTabs,
    wrapInParens,
    reverseLines,
    selectInside,
    reindentSelection,
    indentRulesFacet,
    deleteInside,
    transformToConstantCase,
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
    wrapTryCatch,
    splitCallArgs,
    joinCallArgs,
    functionToArrow,
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
    toggleLineComment,
    transposeChars,
} from '../../src/core/edit/commands'
import { EditorSelection } from '../../src/core/model/selection'
import { EditorState } from '../../src/core/model/state'


// CM7 纯 StateCommand 子集。core 无 EditorView,手搭最小 dispatch 环:cell 持态,dispatch=cell=tr.apply()。
// 命令收 {state, dispatch},钉「文档 + 选区」终态(纯函数,序列化即监测)。

function editor(doc = '', sel?: EditorSelection) {
    let state = EditorState.create({ doc, selection: sel, extensions: EditorState.allowMultipleSelections.of(true) })
    const dispatch = (tr: Transaction) => {
        state = tr.apply()
    }
    return {
        get state() { return state },
        run(cmd: (t: { state: EditorState, dispatch: (tr: Transaction) => void }) => boolean) {
            return cmd({ state, dispatch })
        },
        doc() { return state.doc.toString() },
        sel() { return state.selection },
    }
}

describe('commands —— 选区命令', () => {
    it('cursorDocStart / cursorDocEnd', () => {
        const e = editor('hello\nworld', EditorSelection.single(3))
        expect(e.run(cursorDocEnd)).toBe(true)
        expect(e.sel().main.from).toBe(11)
        expect(e.run(cursorDocStart)).toBe(true)
        expect(e.sel().main.from).toBe(0)
    })

    it('selectAll 覆盖全文', () => {
        const e = editor('abc')
        expect(e.run(selectAll)).toBe(true)
        expect(e.sel().main.from).toBe(0)
        expect(e.sel().main.to).toBe(3)
    })

    it('selectLine 扩到整行(含行尾换行)', () => {
        const e = editor('aa\nbb\ncc', EditorSelection.single(4))
        expect(e.run(selectLine)).toBe(true)
        // 第二行 from=3 to=5,选到 to+1=6(含换行)
        expect(e.sel().main.from).toBe(3)
        expect(e.sel().main.to).toBe(6)
    })

    it('selectLine 重复按逐行向下扩(对齐 Monaco expandLineSelection)', () => {
        const e = editor('aa\nbb\ncc\ndd', EditorSelection.single(1)) // 光标在第 1 行
        e.run(selectLine)                       // 第 1 次:整行 aa\n → 0..3
        expect([e.sel().main.from, e.sel().main.to]).toEqual([0, 3])
        e.run(selectLine)                       // 第 2 次:已整行 → 吞下第 2 行 → 0..6
        expect([e.sel().main.from, e.sel().main.to]).toEqual([0, 6])
        e.run(selectLine)                       // 第 3 次:再吞第 3 行 → 0..9
        expect([e.sel().main.from, e.sel().main.to]).toEqual([0, 9])
    })

    it('selectLine 扩到末行(无行尾换行)不越界、不再增长', () => {
        const e = editor('aa\nbb', EditorSelection.single(4)) // 光标在末行 bb
        e.run(selectLine)                       // bb 无换行 → 3..5(doc 尾)
        expect([e.sel().main.from, e.sel().main.to]).toEqual([3, 5])
        e.run(selectLine)                       // 已到 doc 尾,无下一行 → 不变
        expect([e.sel().main.from, e.sel().main.to]).toEqual([3, 5])
    })

    it('selectAllOccurrences:空选区先取当前词,选中全文所有同词', () => {
        const doc = 'foo bar\nfoo baz\nqux foo'
        const e = editor(doc, EditorSelection.single(doc.indexOf('foo') + 1)) // 光标在第一个 foo 内
        expect(e.run(selectAllOccurrences)).toBe(true)
        const rs = e.sel().ranges
        expect(rs.length).toBe(3) // 三处 foo
        expect(rs.every(r => e.state.sliceDoc(r.from, r.to) === 'foo')).toBe(true)
        // 主选区落在光标那一段(第一个 foo)
        expect(e.sel().main.from).toBe(0)
    })

    it('selectAllOccurrences:已有选区按选中串扩到全文', () => {
        const doc = 'ab xy ab xy ab'
        const from = doc.indexOf('xy')
        const e = editor(doc, EditorSelection.single(from, from + 2)) // 选中第一个 xy
        expect(e.run(selectAllOccurrences)).toBe(true)
        const rs = e.sel().ranges
        expect(rs.length).toBe(2) // 两处 xy
        expect(rs.every(r => e.state.sliceDoc(r.from, r.to) === 'xy')).toBe(true)
    })

    it('simplifySelection:多段收成主段', () => {
        const e = editor('abcdef', EditorSelection.create([
            EditorSelection.range(0, 1),
            EditorSelection.range(3, 4),
        ], 1))
        expect(e.run(simplifySelection)).toBe(true)
        expect(e.sel().ranges.length).toBe(1)
        expect(e.sel().main.from).toBe(3)
        expect(e.sel().main.to).toBe(4)
    })

    it('simplifySelection:单段非空塌成光标', () => {
        const e = editor('abc', EditorSelection.single(0, 3))
        expect(e.run(simplifySelection)).toBe(true)
        expect(e.sel().main.empty).toBe(true)
        expect(e.sel().main.from).toBe(3)
    })
})

describe('commands —— 光标移动(逻辑序)', () => {
    it('cursorCharForward / Backward 跨行走换行', () => {
        const e = editor('ab\ncd', EditorSelection.single(2)) // 行尾
        expect(e.run(cursorCharForward)).toBe(true)
        expect(e.sel().main.head).toBe(3) // 跨过换行到下行首
        expect(e.run(cursorCharBackward)).toBe(true)
        expect(e.sel().main.head).toBe(2)
    })

    it('非空选区时移动塌到端点,不再走一格', () => {
        const e = editor('abcde', EditorSelection.single(1, 4))
        expect(e.run(cursorCharForward)).toBe(true)
        expect(e.sel().main.empty).toBe(true)
        expect(e.sel().main.head).toBe(4) // 塌到 to
    })

    it('cursorCharRight / Left 在希伯来段走逻辑列 ±1(同 Monaco;以前是 LTR 壳的视觉移动)', () => {
        const heb = 'אבג'
        const e = editor(`a${heb}b`, EditorSelection.single(1))
        expect(e.run(cursorCharRight)).toBe(true)
        expect(e.sel().main.head).toBe(2)
        expect(e.run(cursorCharRight)).toBe(true)
        expect(e.sel().main.head).toBe(3)
        expect(e.run(cursorCharLeft)).toBe(true)
        expect(e.sel().main.head).toBe(2)
    })

    it('cursorCharRight 行尾仍跨行', () => {
        const e = editor('ab\ncd', EditorSelection.single(2))
        expect(e.run(cursorCharRight)).toBe(true)
        expect(e.sel().main.head).toBe(3)
    })

    it('cursorLineStart / LineEnd', () => {
        const e = editor('  hello', EditorSelection.single(4))
        expect(e.run(cursorLineStart)).toBe(true)
        expect(e.sel().main.head).toBe(0)
        expect(e.run(cursorLineEnd)).toBe(true)
        expect(e.sel().main.head).toBe(7)
    })

    it('cursorLineDown/Up 保持目标列(跨短行回长行)', () => {
        const e = editor('hello\nhi\nworld', EditorSelection.single(4)) // 第1行第4列
        expect(e.run(cursorLineDown)).toBe(true)
        expect(e.sel().main.head).toBe(8) // 第2行 "hi" 只有2列,落行尾(from=6,len=2)
        expect(e.run(cursorLineDown)).toBe(true)
        expect(e.sel().main.head).toBe(13) // 第3行回到第4列(from=9 + 4)
        // 反向上行:goalColumn 对称——经短行 "hi" 回第1行仍落第4列
        expect(e.run(cursorLineUp)).toBe(true)
        expect(e.sel().main.head).toBe(8) // 第2行行尾(短行夹住)
        expect(e.run(cursorLineUp)).toBe(true)
        expect(e.sel().main.head).toBe(4) // 第1行回到第4列
    })

    it('selectCharForward 锚不动只扩 head', () => {
        const e = editor('abcde', EditorSelection.single(1))
        expect(e.run(selectCharForward)).toBe(true)
        expect(e.sel().main.anchor).toBe(1)
        expect(e.sel().main.head).toBe(2)
    })

    it('selectLineEnd 扩到行尾', () => {
        const e = editor('hello', EditorSelection.single(2))
        expect(e.run(selectLineEnd)).toBe(true)
        expect(e.sel().main.anchor).toBe(2)
        expect(e.sel().main.head).toBe(5)
    })
})

describe('commands —— 删除', () => {
    it('deleteCharBackward 删光标前一字符', () => {
        const e = editor('abc', EditorSelection.single(2))
        expect(e.run(deleteCharBackward)).toBe(true)
        expect(e.doc()).toBe('ac')
        expect(e.sel().main.head).toBe(1)
    })

    it('deleteCharBackward 行首删换行合并行', () => {
        const e = editor('ab\ncd', EditorSelection.single(3)) // 第2行首
        expect(e.run(deleteCharBackward)).toBe(true)
        expect(e.doc()).toBe('abcd')
    })

    it('deleteCharForward 删光标后一字符', () => {
        const e = editor('abc', EditorSelection.single(1))
        expect(e.run(deleteCharForward)).toBe(true)
        expect(e.doc()).toBe('ac')
        expect(e.sel().main.head).toBe(1)
    })

    it('非空选区删整选区', () => {
        const e = editor('abcde', EditorSelection.single(1, 4))
        expect(e.run(deleteCharBackward)).toBe(true)
        expect(e.doc()).toBe('ae')
    })

    it('文档首退格无操作返回 false', () => {
        const e = editor('abc', EditorSelection.single(0))
        expect(e.run(deleteCharBackward)).toBe(false)
    })

    it('simplifySelection:已是单光标返 false', () => {
        const e = editor('abc', EditorSelection.single(1))
        expect(e.run(simplifySelection)).toBe(false)
    })
})

// 退格在纯空格前导缩进里删到上一个 tab stop(对齐 Monaco useTabStops,实测 __monaco()).
// tabSize 默认 4。Delete(forward)与方向键不变——实测 Monaco 只 Backspace 这么做。
describe('commands —— 退格缩进 tab stop(对齐 Monaco)', () => {
    it('6 空格 col6 退格 → 删到 col4(删2)', () => {
        const e = editor('      x', EditorSelection.single(6))
        expect(e.run(deleteCharBackward)).toBe(true)
        expect(e.doc()).toBe('    x')
        expect(e.sel().main.head).toBe(4)
    })

    it('4 空格 col4 退格 → 删到 col0(删4)', () => {
        const e = editor('    x', EditorSelection.single(4))
        expect(e.run(deleteCharBackward)).toBe(true)
        expect(e.doc()).toBe('x')
        expect(e.sel().main.head).toBe(0)
    })

    it('5 空格 col5 退格 → 删到 col4(删1,非整段)', () => {
        const e = editor('     x', EditorSelection.single(5))
        expect(e.run(deleteCharBackward)).toBe(true)
        expect(e.doc()).toBe('    x')
        expect(e.sel().main.head).toBe(4)
    })

    it('2 空格 col2 退格 → 删到 col0(删2)', () => {
        const e = editor('  x', EditorSelection.single(2))
        expect(e.run(deleteCharBackward)).toBe(true)
        expect(e.doc()).toBe('x')
    })

    it('正文中光标退格 → charwise 删 1(不 tab-stop)', () => {
        const e = editor('ab', EditorSelection.single(1))
        expect(e.run(deleteCharBackward)).toBe(true)
        expect(e.doc()).toBe('b')
    })

    it('缩进后正文里光标退格 → charwise 删 1', () => {
        const e = editor('  ab', EditorSelection.single(3))
        expect(e.run(deleteCharBackward)).toBe(true)
        expect(e.doc()).toBe('  b')
    })

    it('前导是 Tab 字符 → charwise 删 1(列宽非均匀不 tab-stop)', () => {
        const e = editor('\tx', EditorSelection.single(1))
        expect(e.run(deleteCharBackward)).toBe(true)
        expect(e.doc()).toBe('x')
    })

    it('Delete(forward)在前导缩进不 tab-stop,只删 1 空格(=Monaco)', () => {
        const e = editor('      x', EditorSelection.single(0))
        expect(e.run(deleteCharForward)).toBe(true)
        expect(e.doc()).toBe('     x')
    })

    it('多光标各自删到各自 tab stop', () => {
        // 两行各 6 空格,光标各在 col6(pos 6 与 pos 14)。
        const e = editor('      a\n      b', EditorSelection.create([
            EditorSelection.cursor(6), EditorSelection.cursor(14),
        ]))
        expect(e.run(deleteCharBackward)).toBe(true)
        expect(e.doc()).toBe('    a\n    b')
    })
})

describe('commands —— 行移动', () => {
    it('moveLineDown 把当前行与下一行互换', () => {
        const e = editor('one\ntwo\nthree', EditorSelection.single(1))
        expect(e.run(moveLineDown)).toBe(true)
        expect(e.doc()).toBe('two\none\nthree')
        // 选区跟随移动到新位置
        expect(e.sel().main.from).toBe(5)
    })

    it('moveLineUp 把当前行与上一行互换', () => {
        const e = editor('one\ntwo\nthree', EditorSelection.single(5))
        expect(e.run(moveLineUp)).toBe(true)
        expect(e.doc()).toBe('two\none\nthree')
    })

    it('首行 moveLineUp 无操作返 false', () => {
        const e = editor('one\ntwo', EditorSelection.single(1))
        expect(e.run(moveLineUp)).toBe(false)
        expect(e.doc()).toBe('one\ntwo')
    })

    it('末行 moveLineDown 无操作返 false', () => {
        const e = editor('one\ntwo', EditorSelection.single(5))
        expect(e.run(moveLineDown)).toBe(false)
    })
})

describe('commands —— 行复制', () => {
    it('copyLineDown 在下方插入副本', () => {
        const e = editor('foo\nbar', EditorSelection.single(1))
        expect(e.run(copyLineDown)).toBe(true)
        expect(e.doc()).toBe('foo\nfoo\nbar')
    })

    it('copyLineUp 在上方插入副本', () => {
        const e = editor('foo\nbar', EditorSelection.single(1))
        expect(e.run(copyLineUp)).toBe(true)
        expect(e.doc()).toBe('foo\nfoo\nbar')
    })
})

describe('commands —— 字符与行编辑', () => {
    it('transposeChars 交换光标两侧字符', () => {
        const e = editor('abcd', EditorSelection.single(2))
        expect(e.run(transposeChars)).toBe(true)
        expect(e.doc()).toBe('acbd')
        // 光标移到交换后位置
        expect(e.sel().main.from).toBe(3)
    })

    it('transposeChars 在文档首返 false', () => {
        const e = editor('abc', EditorSelection.single(0))
        expect(e.run(transposeChars)).toBe(false)
        expect(e.doc()).toBe('abc')
    })

    it('splitLine 在光标处插换行、光标留前', () => {
        const e = editor('abcd', EditorSelection.single(2))
        expect(e.run(splitLine)).toBe(true)
        expect(e.doc()).toBe('ab\ncd')
        expect(e.sel().main.from).toBe(2)
    })

    it('joinLines 本行与下一行，吃掉缩进留一空格', () => {
        const e = editor('foo\n  bar', EditorSelection.single(1))
        expect(e.run(joinLines)).toBe(true)
        expect(e.doc()).toBe('foo bar')
    })

    it('joinLines 选中多行一次拼完', () => {
        const e = editor('a\nb\nc', EditorSelection.single(0, 5))
        expect(e.run(joinLines)).toBe(true)
        expect(e.doc()).toBe('a b c')
    })

    it('joinLines 末行:文本不变,光标到行尾(Monaco JoinLinesAction)', () => {
        const e = editor('only', EditorSelection.single(0))
        expect(e.run(joinLines)).toBe(true)
        expect(e.doc()).toBe('only')
        expect(e.sel().main.head).toBe(4)
        expect(e.run(joinLines)).toBe(false)
    })

    it('transformToUppercase / Lowercase 改选区', () => {
        const e = editor('Hello', EditorSelection.single(0, 5))
        expect(e.run(transformToUppercase)).toBe(true)
        expect(e.doc()).toBe('HELLO')
        expect(e.run(transformToLowercase)).toBe(true)
        expect(e.doc()).toBe('hello')
    })

    it('空选区变换光标下的词', () => {
        const e = editor('foo BAR', EditorSelection.single(1))
        expect(e.run(transformToUppercase)).toBe(true)
        expect(e.doc()).toBe('FOO BAR')
    })

    it('transformToTitleCase 每个词首字母大写', () => {
        const e = editor('hello WORLD', EditorSelection.single(0, 11))
        expect(e.run(transformToTitleCase)).toBe(true)
        expect(e.doc()).toBe('Hello World')
    })

    it('sortLines 按字典序排选中行', () => {
        const e = editor('c\na\nb', EditorSelection.single(0, 5))
        expect(e.run(sortLines)).toBe(true)
        expect(e.doc()).toBe('a\nb\nc')
    })

    it('sortLines 空选区或已排好返 false', () => {
        expect(editor('a\nb', EditorSelection.single(0)).run(sortLines)).toBe(false)
        expect(editor('a\nb', EditorSelection.single(0, 3)).run(sortLines)).toBe(false)
    })

    it('wrapInParens 把选区包进括号', () => {
        const e = editor('foo', EditorSelection.single(0, 3))
        expect(e.run(wrapInParens)).toBe(true)
        expect(e.doc()).toBe('(foo)')
        expect(e.sel().main.from).toBe(1)
        expect(e.sel().main.to).toBe(4)
    })

    it('reverseLines 倒转选中行', () => {
        const e = editor('a\nb\nc', EditorSelection.single(0, 5))
        expect(e.run(reverseLines)).toBe(true)
        expect(e.doc()).toBe('c\nb\na')
        // Monaco:选区随行搬、列不变 → 第二次选区是 (3,1)→(1,2),止于行首不含第 3 行,只倒转前两行
        expect(e.run(reverseLines)).toBe(true)
        expect(e.doc()).toBe('b\nc\na')
        // Monaco:单个空光标 = 整篇
        const w = editor('a\nb', EditorSelection.single(0))
        expect(w.run(reverseLines)).toBe(true)
        expect(w.doc()).toBe('b\na')
    })

    it('stripLineComments 剥掉 // 注释，不碰 URL', () => {
        const e = editor('const x = 1 // hi\nconst u = "https://x.com"')
        expect(e.run(stripLineComments)).toBe(true)
        expect(e.doc()).toBe('const x = 1\nconst u = "https://x.com"')
        expect(e.run(stripLineComments)).toBe(false)
    })

    it('cycleSurrounding () → [] → {} → ()', () => {
        const e = editor('foo(bar)', EditorSelection.single(4))
        expect(e.run(cycleSurrounding)).toBe(true)
        expect(e.doc()).toBe('foo[bar]')
        expect(e.run(cycleSurrounding)).toBe(true)
        expect(e.doc()).toBe('foo{bar}')
        expect(e.run(cycleSurrounding)).toBe(true)
        expect(e.doc()).toBe('foo(bar)')
        expect(editor('plain', EditorSelection.single(1)).run(cycleSurrounding)).toBe(false)
    })

    it('toggleNullish || ⇄ ??', () => {
        const e = editor('a || b', EditorSelection.single(2))
        expect(e.run(toggleNullish)).toBe(true)
        expect(e.doc()).toBe('a ?? b')
        expect(e.run(toggleNullish)).toBe(true)
        expect(e.doc()).toBe('a || b')
        expect(editor('ab', EditorSelection.single(1)).run(toggleNullish)).toBe(false)
    })

    it('alignEquals 把赋值等号对齐', () => {
        const e = editor('a = 1\nbb = 2', EditorSelection.single(0, 11))
        expect(e.run(alignEquals)).toBe(true)
        expect(e.doc()).toBe('a  = 1\nbb = 2')
        expect(e.run(alignEquals)).toBe(false)
    })

    it('ifToTernary 把 if/else return 收成三元', () => {
        const e = editor('if (x) return a; else return b')
        expect(e.run(ifToTernary)).toBe(true)
        expect(e.doc()).toBe('return x ? a : b')
        expect(e.run(ifToTernary)).toBe(false)
    })

    it('wrapTryCatch 把当前行包进 try', () => {
        const e = editor('foo()')
        expect(e.run(wrapTryCatch)).toBe(true)
        expect(e.doc()).toBe('try {\n    foo()\n} catch (e) {\n}')
        expect(e.run(wrapTryCatch)).toBe(false)
    })

    it('unwrapTernary 把 return 三元拆回 if/else', () => {
        const e = editor('return x ? a : b')
        expect(e.run(unwrapTernary)).toBe(true)
        expect(e.doc()).toBe('if (x) return a; else return b')
        expect(e.run(ifToTernary)).toBe(true)
        expect(e.doc()).toBe('return x ? a : b')
    })

    it('toggleBoolean 翻转 true/false', () => {
        const e = editor('ok = true', EditorSelection.single(6))
        expect(e.run(toggleBoolean)).toBe(true)
        expect(e.doc()).toBe('ok = false')
        expect(e.run(toggleBoolean)).toBe(true)
        expect(e.doc()).toBe('ok = true')
        expect(editor('ok').run(toggleBoolean)).toBe(false)
    })

    it('promoteBinding var→let→const', () => {
        const e = editor('var x = 1')
        expect(e.run(promoteBinding)).toBe(true)
        expect(e.doc()).toBe('let x = 1')
        expect(e.run(promoteBinding)).toBe(true)
        expect(e.doc()).toBe('const x = 1')
        expect(e.run(promoteBinding)).toBe(false)
    })

    it('invertComparison 翻转比较符', () => {
        const e = editor('a === b', EditorSelection.single(3))
        expect(e.run(invertComparison)).toBe(true)
        expect(e.doc()).toBe('a !== b')
        expect(e.run(invertComparison)).toBe(true)
        expect(e.doc()).toBe('a === b')
        expect(editor('a + b', EditorSelection.single(2)).run(invertComparison)).toBe(false)
    })

    it('splitCallArgs / joinCallArgs 拆开再拼回', () => {
        const e = editor('foo(a, b, c)', EditorSelection.single(4))
        expect(e.run(splitCallArgs)).toBe(true)
        expect(e.doc()).toBe('foo(\n  a,\n  b,\n  c\n)')
        expect(e.run(joinCallArgs)).toBe(true)
        expect(e.doc()).toBe('foo(a, b, c)')
    })

    it('functionToArrow 单行函数收成箭头', () => {
        const e = editor('function f(x) { return x + 1 }')
        expect(e.run(functionToArrow)).toBe(true)
        expect(e.doc()).toBe('const f = (x) => x + 1')
        expect(e.run(functionToArrow)).toBe(false)
    })

    it('arrowToFunction 与 functionToArrow 往返', () => {
        const e = editor('const f = (x) => x + 1')
        expect(e.run(arrowToFunction)).toBe(true)
        expect(e.doc()).toBe('function f(x) { return x + 1 }')
        expect(e.run(functionToArrow)).toBe(true)
        expect(e.doc()).toBe('const f = (x) => x + 1')
    })

    it('toggleArrowBraces 表达式 ⇄ return 块', () => {
        const e = editor('const f = (x) => x + 1')
        expect(e.run(toggleArrowBraces)).toBe(true)
        expect(e.doc()).toBe('const f = (x) => { return x + 1 }')
        expect(e.run(toggleArrowBraces)).toBe(true)
        expect(e.doc()).toBe('const f = (x) => x + 1')
        expect(editor('const x = 1').run(toggleArrowBraces)).toBe(false)
    })

    it('extractConstant 把选区抽成 const _', () => {
        const e = editor('foo(bar)', EditorSelection.single(4, 7))
        expect(e.run(extractConstant)).toBe(true)
        expect(e.doc()).toBe('const _ = bar\nfoo(_)')
        expect(e.run(extractConstant)).toBe(false)
        expect(editor('foo(bar)').run(extractConstant)).toBe(false)
    })

    it('flipIfElse 对调两支', () => {
        const e = editor('if (x) return a; else return b')
        expect(e.run(flipIfElse)).toBe(true)
        expect(e.doc()).toBe('if (x) return b; else return a')
        expect(e.run(flipIfElse)).toBe(true)
        expect(e.doc()).toBe('if (x) return a; else return b')
        expect(editor('if (x) return a').run(flipIfElse)).toBe(false)
    })

    it('negateIf 给条件加/去 !', () => {
        const e = editor('if (x) return 1')
        expect(e.run(negateIf)).toBe(true)
        expect(e.doc()).toBe('if (!x) return 1')
        expect(e.run(negateIf)).toBe(true)
        expect(e.doc()).toBe('if (x) return 1')
        expect(editor('return 1').run(negateIf)).toBe(false)
    })

    it('toggleObjectShorthand { a: a } ⇄ { a }', () => {
        const e = editor('{ a: a }', EditorSelection.single(1))
        expect(e.run(toggleObjectShorthand)).toBe(true)
        expect(e.doc()).toBe('{ a }')
        expect(e.run(toggleObjectShorthand)).toBe(true)
        expect(e.doc()).toBe('{ a: a }')
        expect(editor('{ a: 1 }', EditorSelection.single(1)).run(toggleObjectShorthand)).toBe(false)
    })

    it('swapOperands 对调比较两边', () => {
        const e = editor('a === b', EditorSelection.single(3))
        expect(e.run(swapOperands)).toBe(true)
        expect(e.doc()).toBe('b === a')
        expect(e.run(swapOperands)).toBe(true)
        expect(e.doc()).toBe('a === b')
        expect(editor('foo').run(swapOperands)).toBe(false)
    })

    it("toggleMemberAccess obj.foo ⇄ obj['foo']", () => {
        const e = editor('obj.foo', EditorSelection.single(4))
        expect(e.run(toggleMemberAccess)).toBe(true)
        expect(e.doc()).toBe("obj['foo']")
        expect(e.run(toggleMemberAccess)).toBe(true)
        expect(e.doc()).toBe('obj.foo')
        expect(editor('obj').run(toggleMemberAccess)).toBe(false)
    })

    it('toggleTrailingComma 给调用加/去尾逗号', () => {
        const e = editor('foo(a, b)', EditorSelection.single(4))
        expect(e.run(toggleTrailingComma)).toBe(true)
        expect(e.doc()).toBe('foo(a, b,)')
        expect(e.run(toggleTrailingComma)).toBe(true)
        expect(e.doc()).toBe('foo(a, b)')
        expect(editor('foo()').run(toggleTrailingComma)).toBe(false)
    })

    it('splitDecl / joinDecl 拆开再拼回', () => {
        const e = editor('const a = 1, b = 2')
        expect(e.run(splitDecl)).toBe(true)
        expect(e.doc()).toBe('const a = 1\nconst b = 2')
        expect(e.run(joinDecl)).toBe(true)
        expect(e.doc()).toBe('const a = 1, b = 2')
        expect(editor('const a = 1').run(splitDecl)).toBe(false)
    })

    it('unwrapIf 拆掉无 else 的 if', () => {
        const e = editor('if (x) return 1')
        expect(e.run(unwrapIf)).toBe(true)
        expect(e.doc()).toBe('return 1')
        expect(e.run(unwrapIf)).toBe(false)
        expect(editor('if (x) return 1; else return 2').run(unwrapIf)).toBe(false)
    })

    it('toggleAsync 给 function / 箭头加/去 async', () => {
        const e = editor('function f() {}')
        expect(e.run(toggleAsync)).toBe(true)
        expect(e.doc()).toBe('async function f() {}')
        expect(e.run(toggleAsync)).toBe(true)
        expect(e.doc()).toBe('function f() {}')
        expect(editor('const x = 1').run(toggleAsync)).toBe(false)
    })

    it('addBraces 给 if 补花括号', () => {
        const e = editor('if (x) return 1')
        expect(e.run(addBraces)).toBe(true)
        expect(e.doc()).toBe('if (x) { return 1 }')
        expect(e.run(addBraces)).toBe(false)
    })

    it('removeBraces 拆掉单语句花括号', () => {
        const e = editor('if (x) { return 1 }')
        expect(e.run(removeBraces)).toBe(true)
        expect(e.doc()).toBe('if (x) return 1')
        expect(e.run(addBraces)).toBe(true)
        expect(e.doc()).toBe('if (x) { return 1 }')
    })

    it('inlineConstant 把抽出来的 _ 填回去', () => {
        const e = editor('foo(bar)', EditorSelection.single(4, 7))
        expect(e.run(extractConstant)).toBe(true)
        expect(e.doc()).toBe('const _ = bar\nfoo(_)')
        expect(e.run(inlineConstant)).toBe(true)
        expect(e.doc()).toBe('foo(bar)')
        expect(editor('foo(bar)').run(inlineConstant)).toBe(false)
    })

    it('toggleStrictEq == ⇄ ===', () => {
        const e = editor('a == b', EditorSelection.single(3))
        expect(e.run(toggleStrictEq)).toBe(true)
        expect(e.doc()).toBe('a === b')
        expect(e.run(toggleStrictEq)).toBe(true)
        expect(e.doc()).toBe('a == b')
        expect(editor('a + b', EditorSelection.single(2)).run(toggleStrictEq)).toBe(false)
    })

    it('splitArray / joinArray 拆开再拼回', () => {
        const e = editor('[a, b, c]', EditorSelection.single(1))
        expect(e.run(splitArray)).toBe(true)
        expect(e.doc()).toBe('[\n  a,\n  b,\n  c\n]')
        expect(e.run(joinArray)).toBe(true)
        expect(e.doc()).toBe('[a, b, c]')
        expect(editor('[a]').run(splitArray)).toBe(false)
    })

    it('toggleIncrement i++ ⇄ ++i', () => {
        const e = editor('i++')
        expect(e.run(toggleIncrement)).toBe(true)
        expect(e.doc()).toBe('++i')
        expect(e.run(toggleIncrement)).toBe(true)
        expect(e.doc()).toBe('i++')
        expect(editor('i + 1', EditorSelection.single(1)).run(toggleIncrement)).toBe(false)
    })

    it('splitString 在引号内拆成拼接', () => {
        const e = editor("'hello'", EditorSelection.single(3))
        expect(e.run(splitString)).toBe(true)
        expect(e.doc()).toBe("'he' + 'llo'")
        expect(editor('hello').run(splitString)).toBe(false)
    })

    it('joinString 把拆开的字面量拼回', () => {
        const e = editor("'hello'", EditorSelection.single(3))
        expect(e.run(splitString)).toBe(true)
        expect(e.run(joinString)).toBe(true)
        expect(e.doc()).toBe("'hello'")
        expect(editor("'hello'").run(joinString)).toBe(false)
    })

    it('wrapInIf 包进 if (true)，unwrapIf 拆掉', () => {
        const e = editor('return 1')
        expect(e.run(wrapInIf)).toBe(true)
        expect(e.doc()).toBe('if (true) return 1')
        expect(e.run(unwrapIf)).toBe(true)
        expect(e.doc()).toBe('return 1')
        expect(editor('if (x) return 1').run(wrapInIf)).toBe(false)
    })

    it('toggleSemicolon 行尾分号开关', () => {
        const e = editor('const x = 1')
        expect(e.run(toggleSemicolon)).toBe(true)
        expect(e.doc()).toBe('const x = 1;')
        expect(e.run(toggleSemicolon)).toBe(true)
        expect(e.doc()).toBe('const x = 1')
        expect(editor('if (x)').run(toggleSemicolon)).toBe(false)
    })

    it('toggleLog 包/拆 console.log', () => {
        const e = editor('foo', EditorSelection.single(0, 3))
        expect(e.run(toggleLog)).toBe(true)
        expect(e.doc()).toBe('console.log(foo)')
        expect(e.run(toggleLog)).toBe(true)
        expect(e.doc()).toBe('foo')
        expect(editor('   ').run(toggleLog)).toBe(false)
    })

    it('toggleHexDec 255 ⇄ 0xff', () => {
        const e = editor('255')
        expect(e.run(toggleHexDec)).toBe(true)
        expect(e.doc()).toBe('0xff')
        expect(e.run(toggleHexDec)).toBe(true)
        expect(e.doc()).toBe('255')
        expect(editor('foo').run(toggleHexDec)).toBe(false)
    })

    it('mergeIf / splitIfAnd 嵌套 if ⇄ &&', () => {
        const e = editor('if (a) if (b) return 1')
        expect(e.run(mergeIf)).toBe(true)
        expect(e.doc()).toBe('if (a && b) return 1')
        expect(e.run(splitIfAnd)).toBe(true)
        expect(e.doc()).toBe('if (a) if (b) return 1')
        expect(editor('if (a) return 1').run(mergeIf)).toBe(false)
    })

    it('toggleArrowParens x => ⇄ (x) =>', () => {
        const e = editor('const f = x => 1')
        expect(e.run(toggleArrowParens)).toBe(true)
        expect(e.doc()).toBe('const f = (x) => 1')
        expect(e.run(toggleArrowParens)).toBe(true)
        expect(e.doc()).toBe('const f = x => 1')
        expect(editor('const f = (x, y) => 1').run(toggleArrowParens)).toBe(false)
    })

    it('splitObject / joinObject 拆开再拼回', () => {
        const e = editor('{ a: 1, b: 2 }', EditorSelection.single(1))
        expect(e.run(splitObject)).toBe(true)
        expect(e.doc()).toBe('{\n  a: 1,\n  b: 2\n}')
        expect(e.run(joinObject)).toBe(true)
        expect(e.doc()).toBe('{a: 1, b: 2}')
        expect(editor('{ a: 1 }', EditorSelection.single(1)).run(splitObject)).toBe(false)
    })

    it('toggleAssignOp x = x + 1 ⇄ x += 1', () => {
        const e = editor('x = x + 1', EditorSelection.single(2))
        expect(e.run(toggleAssignOp)).toBe(true)
        expect(e.doc()).toBe('x += 1')
        expect(e.run(toggleAssignOp)).toBe(true)
        expect(e.doc()).toBe('x = x + 1')
        expect(editor('x = y + 1', EditorSelection.single(2)).run(toggleAssignOp)).toBe(false)
    })

    it('toggleTypeImport 加/去 type', () => {
        const e = editor("import { x } from 'm'")
        expect(e.run(toggleTypeImport)).toBe(true)
        expect(e.doc()).toBe("import type { x } from 'm'")
        expect(e.run(toggleTypeImport)).toBe(true)
        expect(e.doc()).toBe("import { x } from 'm'")
        expect(editor('const x = 1').run(toggleTypeImport)).toBe(false)
    })

    it('toggleExportDefault 加/去 default', () => {
        const e = editor('export function f() {}')
        expect(e.run(toggleExportDefault)).toBe(true)
        expect(e.doc()).toBe('export default function f() {}')
        expect(e.run(toggleExportDefault)).toBe(true)
        expect(e.doc()).toBe('export function f() {}')
        expect(editor('export const x = 1').run(toggleExportDefault)).toBe(false)
    })

    it('addAwait 在调用前加 await，函数加 async', () => {
        const e = editor('function f() {\n  foo()\n}', EditorSelection.single(18))
        expect(e.run(addAwait)).toBe(true)
        expect(e.doc()).toBe('async function f() {\n  await foo()\n}')
        expect(e.run(addAwait)).toBe(false)
    })

    it('toggleExport 给声明加/去掉 export', () => {
        const e = editor('const x = 1')
        expect(e.run(toggleExport)).toBe(true)
        expect(e.doc()).toBe('export const x = 1')
        expect(e.run(toggleExport)).toBe(true)
        expect(e.doc()).toBe('const x = 1')
    })

    it('stripBlockComments 剥 /* */，不碰字符串', () => {
        const e = editor('const x = 1 /* hi */\nconst s = "/* no */"')
        expect(e.run(stripBlockComments)).toBe(true)
        expect(e.doc()).toBe('const x = 1\nconst s = "/* no */"')
        expect(e.run(stripBlockComments)).toBe(false)
    })

    it('toggleOptionalChain a.b ⇄ a?.b', () => {
        const e = editor('a.b', EditorSelection.single(1))
        expect(e.run(toggleOptionalChain)).toBe(true)
        expect(e.doc()).toBe('a?.b')
        expect(e.run(toggleOptionalChain)).toBe(true)
        expect(e.doc()).toBe('a.b')
        expect(editor('ab', EditorSelection.single(1)).run(toggleOptionalChain)).toBe(false)
    })

    it('deleteInside 清空括号或引号内部', () => {
        const e = editor('foo(bar)', EditorSelection.single(4))
        expect(e.run(deleteInside)).toBe(true)
        expect(e.doc()).toBe('foo()')
        expect(e.run(deleteInside)).toBe(false)
        const q = editor("x = 'hi'", EditorSelection.single(5))
        expect(q.run(deleteInside)).toBe(true)
        expect(q.doc()).toBe("x = ''")
    })

    it('transformToConstantCase 成 FOO_BAR', () => {
        const e = editor('fooBar', EditorSelection.single(0, 6))
        expect(e.run(transformToConstantCase)).toBe(true)
        expect(e.doc()).toBe('FOO_BAR')
        expect(e.run(transformToConstantCase)).toBe(false)
    })

    it('duplicateAndComment 在上方留注释副本', () => {
        const e = editor('const x = 1')
        expect(e.run(duplicateAndComment)).toBe(true)
        expect(e.doc()).toBe('// const x = 1\nconst x = 1')
        expect(editor('', EditorSelection.single(0)).run(duplicateAndComment)).toBe(false)
    })

    // Monaco ReindentSelectedLines:语言没配 indentationRules 时不动(standalone TS 就是这样);
    // 配了规则从选区上一行起算(细节见 r4p-fix.test.ts)
    it('reindentSelection(= Reindent Selected Lines)没有缩进规则不动,有规则按上一行缩进选区', () => {
        const bare = editor('function f() {\nx\n}', EditorSelection.single(15, 16))
        expect(bare.run(reindentSelection)).toBe(false)
        let state = EditorState.create({
            doc: 'function f() {\nx\n}',
            selection: EditorSelection.single(15, 16),
            extensions: indentRulesFacet.of({ increaseIndentPattern: /^.*\{[^}]*$/, decreaseIndentPattern: /^\s*\}/ }),
        })
        const run = () => reindentSelection({ state, dispatch: tr => { state = tr.apply() } })
        expect(run()).toBe(true)
        expect(state.doc.toString()).toBe('function f() {\n    x\n}')
        expect(run()).toBe(false)
    })

    it('selectInside 选括号或引号内', () => {
        const e = editor('foo(bar)', EditorSelection.single(4))
        expect(e.run(selectInside)).toBe(true)
        expect(e.sel().main.from).toBe(4)
        expect(e.sel().main.to).toBe(7)
        expect(e.run(selectInside)).toBe(false)
        const q = editor("x = 'hi'", EditorSelection.single(5))
        expect(q.run(selectInside)).toBe(true)
        expect(q.sel().main.from).toBe(5)
        expect(q.sel().main.to).toBe(7)
    })

    it('indentToSpaces / indentToTabs 转换行首空白', () => {
        const e = editor('\thello\n\tworld')
        expect(e.run(indentToSpaces)).toBe(true)
        expect(e.doc()).toBe('    hello\n    world')
        expect(e.run(indentToSpaces)).toBe(false)
        expect(e.run(indentToTabs)).toBe(true)
        expect(e.doc()).toBe('\thello\n\tworld')
    })

    it('sortLinesDescending 倒序排选中行', () => {
        const e = editor('a\nb\nc', EditorSelection.single(0, 5))
        expect(e.run(sortLinesDescending)).toBe(true)
        expect(e.doc()).toBe('c\nb\na')
        expect(e.run(sortLinesDescending)).toBe(false)
    })

    it('insertFinalNewline 末尾没有换行才加', () => {
        const e = editor('hi', EditorSelection.single(0))
        expect(e.run(insertFinalNewline)).toBe(true)
        expect(e.doc()).toBe('hi\n')
        expect(e.run(insertFinalNewline)).toBe(false)
    })

    it('duplicateSelection 非空选区在后面再贴一份', () => {
        const e = editor('abXYcd', EditorSelection.single(2, 4))
        expect(e.run(duplicateSelection)).toBe(true)
        expect(e.doc()).toBe('abXYXYcd')
        expect(e.sel().main.from).toBe(4)
        expect(e.sel().main.to).toBe(6)
    })

    it('deleteBlankLines 删选区里的空行', () => {
        const e = editor('a\n\n\nb\n', EditorSelection.single(0, 6))
        expect(e.run(deleteBlankLines)).toBe(true)
        expect(e.doc()).toBe('a\nb\n')
    })

    it('deleteBlankLines 空选区删光标处连续空行', () => {
        const e = editor('a\n\n\nb', EditorSelection.single(2))
        expect(e.run(deleteBlankLines)).toBe(true)
        expect(e.doc()).toBe('a\nb')
    })

    it('deleteBlankLines 没空行返 false', () => {
        expect(editor('ab', EditorSelection.single(0)).run(deleteBlankLines)).toBe(false)
    })

    it('insertCursorAtEndOfEachLineSelected 选区每行末一个光标', () => {
        const e = editor('aa\nbb\ncc', EditorSelection.single(0, 8))
        expect(e.run(insertCursorAtEndOfEachLineSelected)).toBe(true)
        expect(e.sel().ranges.map(r => r.head)).toEqual([2, 5, 8])
        expect(e.sel().ranges.every(r => r.empty)).toBe(true)
        expect(e.run(insertCursorAtEndOfEachLineSelected)).toBe(false)
    })

    it('insertCursorAtEndOfEachLineSelected 末行光标落在选区终点(Monaco getCursorsForSelection)', () => {
        const e = editor('aa\nbb\ncc', EditorSelection.single(0, 7))
        expect(e.run(insertCursorAtEndOfEachLineSelected)).toBe(true)
        expect(e.sel().ranges.map(r => r.head)).toEqual([2, 5, 7])
        const one = editor('abcd', EditorSelection.single(1, 3))
        expect(one.run(insertCursorAtEndOfEachLineSelected)).toBe(true)
        expect(one.sel().ranges.map(r => r.head)).toEqual([3])
    })

    it('insertCursorAtEndOfEachLineSelected 空选区返 false', () => {
        expect(editor('aa\nbb', EditorSelection.single(1)).run(insertCursorAtEndOfEachLineSelected)).toBe(false)
    })

    it('deleteDuplicateLines 留首次、删后重复', () => {
        const e = editor('a\nb\na\nc\nb')
        expect(e.run(deleteDuplicateLines)).toBe(true)
        expect(e.doc()).toBe('a\nb\nc')
        expect(e.run(deleteDuplicateLines)).toBe(false)
    })

    it('deleteDuplicateLines 选区外的重复不动', () => {
        const e = editor('a\nb\na', EditorSelection.single(0, 3))
        expect(e.run(deleteDuplicateLines)).toBe(false)
        expect(e.doc()).toBe('a\nb\na')
    })

    it('transformToSnakeCase / Camel / Kebab 互转标识符', () => {
        const e = editor('fooBar', EditorSelection.single(0, 6))
        expect(e.run(transformToSnakeCase)).toBe(true)
        expect(e.doc()).toBe('foo_bar')
        expect(e.run(transformToCamelCase)).toBe(true)
        expect(e.doc()).toBe('fooBar')
        expect(e.run(transformToKebabCase)).toBe(true)
        expect(e.doc()).toBe('foo-bar')
        expect(e.run(transformToKebabCase)).toBe(false)
        const p = editor('foo_bar', EditorSelection.single(0, 7))
        expect(p.run(transformToPascalCase)).toBe(true)
        expect(p.doc()).toBe('FooBar')
        expect(p.run(transformToPascalCase)).toBe(false)
    })

    it('removeBrackets 拆掉包住光标的一对', () => {
        const e = editor('foo(bar)', EditorSelection.single(4))
        expect(e.run(removeBrackets)).toBe(true)
        expect(e.doc()).toBe('foobar')
        expect(e.run(removeBrackets)).toBe(false)
    })

    it('removeBrackets 选中整对也拆', () => {
        const e = editor('(hi)', EditorSelection.single(0, 4))
        expect(e.run(removeBrackets)).toBe(true)
        expect(e.doc()).toBe('hi')
    })

    it('incrementNumber / decrementNumber 改光标处数字', () => {
        const e = editor('x = 41', EditorSelection.single(5))
        expect(e.run(incrementNumber)).toBe(true)
        expect(e.doc()).toBe('x = 42')
        expect(e.run(decrementNumber)).toBe(true)
        expect(e.doc()).toBe('x = 41')
        expect(editor('abc', EditorSelection.single(1)).run(incrementNumber)).toBe(false)
    })

    it('incrementNumber 保留前导零和小数位', () => {
        const z = editor('n = 01', EditorSelection.single(5))
        expect(z.run(incrementNumber)).toBe(true)
        expect(z.doc()).toBe('n = 02')
        const d = editor('v = 3.5', EditorSelection.single(6))
        expect(d.run(incrementNumber)).toBe(true)
        expect(d.doc()).toBe('v = 4.5')
    })

    it('moveToNextOccurrence 跳下一处同词，末处环回', () => {
        const e = editor('foo x foo', EditorSelection.single(1))
        expect(e.run(moveToNextOccurrence)).toBe(true)
        expect(e.sel().main.from).toBe(6)
        expect(e.sel().main.to).toBe(9)
        expect(e.run(moveToNextOccurrence)).toBe(true)
        expect(e.sel().main.from).toBe(0)
        expect(editor('foo', EditorSelection.single(1)).run(moveToNextOccurrence)).toBe(false)
    })

    it('moveToPrevOccurrence 跳上一处同词', () => {
        const e = editor('foo x foo', EditorSelection.single(7))
        expect(e.run(moveToPrevOccurrence)).toBe(true)
        expect(e.sel().main.from).toBe(0)
    })

    it('enclosingPair / selectParentSyntax 先吃括号内，再包上括号', () => {
        expect(enclosingPair('foo(bar)', 4, 7)).toEqual({ from: 3, to: 8 })
        const e = editor('foo(bar)', EditorSelection.single(4, 7))
        expect(e.run(selectParentSyntax)).toBe(true)
        expect(e.sel().main.from).toBe(3)
        expect(e.sel().main.to).toBe(8)
        expect(e.run(selectParentSyntax)).toBe(false)
    })

    it('insertNewline 替换选区为换行', () => {
        const e = editor('abXYcd', EditorSelection.single(2, 4))
        expect(e.run(insertNewline)).toBe(true)
        expect(e.doc()).toBe('ab\ncd')
        expect(e.sel().main.from).toBe(3)
    })
})

describe('commands —— 删除行尾空白(禁正则词法扫描)', () => {
    it('删每行尾部空格与制表符', () => {
        const e = editor('a  \nb\t\nc')
        expect(e.run(deleteTrailingWhitespace)).toBe(true)
        expect(e.doc()).toBe('a\nb\nc')
    })

    it('无尾空白返 false', () => {
        const e = editor('a\nb\nc')
        expect(e.run(deleteTrailingWhitespace)).toBe(false)
    })

    it('只删尾部、不动行内空格', () => {
        const e = editor('a b  \nc d ')
        expect(e.run(deleteTrailingWhitespace)).toBe(true)
        expect(e.doc()).toBe('a b\nc d')
    })
})

describe('commands —— 多选区 changeByRange 合并', () => {
    it('两段非空选区各替换成换行,合并成单 changeset', () => {
        const e = editor('aXbYc', EditorSelection.create([
            EditorSelection.range(1, 2),
            EditorSelection.range(3, 4),
        ]))
        expect(e.run(insertNewline)).toBe(true)
        expect(e.doc()).toBe('a\nb\nc')
        expect(e.sel().ranges.length).toBe(2)
    })

    it('两个光标各 transpose,位置独立映射', () => {
        const e = editor('ab cd', EditorSelection.create([
            EditorSelection.cursor(1),
            EditorSelection.cursor(4),
        ]))
        expect(e.run(transposeChars)).toBe(true)
        // 'ab'→'ba'(光标1)、'cd'→'dc'(光标4):ba dc
        expect(e.doc()).toBe('ba dc')
    })
})

describe('commands —— 词级移动', () => {
    it('cursorGroupForward:从词首跳到词尾(空格前)', () => {
        const e = editor('foo bar baz', EditorSelection.single(0))
        e.run(cursorGroupForward)
        expect(e.sel().main.head).toBe(3) // 'foo' 末,空格前
    })

    it('cursorGroupForward:词中间跳到词尾', () => {
        const e = editor('foo bar', EditorSelection.single(1)) // 光标在 'o'
        e.run(cursorGroupForward)
        expect(e.sel().main.head).toBe(3) // 词尾
    })

    it('cursorGroupForward:空格处跳到下一词尾', () => {
        const e = editor('foo bar', EditorSelection.single(3)) // 空格处
        e.run(cursorGroupForward)
        expect(e.sel().main.head).toBe(4) // 空格组结束(bar 的 b 前)
    })

    it('cursorGroupBackward:从词尾跳到词首', () => {
        const e = editor('foo bar', EditorSelection.single(7)) // 光标在 'r' 后
        e.run(cursorGroupBackward)
        expect(e.sel().main.head).toBe(4) // 'bar' 首
    })

    it('cursorGroupForward:跨行同类别继续', () => {
        const e = editor('foo\nbar', EditorSelection.single(2)) // 'o'
        e.run(cursorGroupForward)
        expect(e.sel().main.head).toBe(7) // 'bar' 末(跨行同类别)
    })

    it('cursorGroupForward:标点组独立', () => {
        const e = editor('foo.bar', EditorSelection.single(0))
        e.run(cursorGroupForward)
        expect(e.sel().main.head).toBe(3) // '.' 前
        e.run(cursorGroupForward)
        expect(e.sel().main.head).toBe(4) // '.' 后
        e.run(cursorGroupForward)
        expect(e.sel().main.head).toBe(7) // bar 末
    })

    it('cursorGroupForward:文档末尾不越界', () => {
        const e = editor('foo', EditorSelection.single(0))
        e.run(cursorGroupForward)
        expect(e.sel().main.head).toBe(3)
        expect(e.run(cursorGroupForward)).toBe(false)
    })

    it('selectGroupForward:扩选到词尾', () => {
        const e = editor('foo bar', EditorSelection.single(0))
        e.run(selectGroupForward)
        expect(e.sel().main.anchor).toBe(0)
        expect(e.sel().main.head).toBe(3)
    })

    it('CJK 词级移动', () => {
        const e = editor('中文 测试', EditorSelection.single(0))
        e.run(cursorGroupForward)
        expect(e.sel().main.head).toBe(2) // '中文' 末,空格前
    })
})

// Monaco 方向键词移动:跳过非 Word(空白/标点),前向落词尾、后向落词首。
// 与 byGroup(每个类别边界都停)不同——实测 Monaco 偏移逐格钉死。
describe('commands —— Monaco 词移动(cursorWordEndRight / cursorWordLeft)', () => {
    it('前向:foo bar baz 逐词落词尾 0→3→7→11', () => {
        const e = editor('foo bar baz', EditorSelection.single(0))
        e.run(cursorWordEndRight); expect(e.sel().main.head).toBe(3)
        e.run(cursorWordEndRight); expect(e.sel().main.head).toBe(7)
        e.run(cursorWordEndRight); expect(e.sel().main.head).toBe(11)
    })

    it('前向:文档末尾不越界返 false', () => {
        const e = editor('foo', EditorSelection.single(3))
        expect(e.run(cursorWordEndRight)).toBe(false)
    })

    it('前向:标点滑过落词尾 foo.bar 0→3→7', () => {
        const e = editor('foo.bar', EditorSelection.single(0))
        e.run(cursorWordEndRight); expect(e.sel().main.head).toBe(3) // foo 尾(. 前)
        e.run(cursorWordEndRight); expect(e.sel().main.head).toBe(7) // 滑过 '.' 到 bar 尾
    })

    it('前向:跳前导空白 "  hello world" 2→7→13', () => {
        const e = editor('  hello world', EditorSelection.single(2))
        e.run(cursorWordEndRight); expect(e.sel().main.head).toBe(7)  // hello 尾
        e.run(cursorWordEndRight); expect(e.sel().main.head).toBe(13) // world 尾
    })

    it('后向:foo bar baz 逐词落词首 11→8→4→0', () => {
        const e = editor('foo bar baz', EditorSelection.single(11))
        e.run(cursorWordLeft); expect(e.sel().main.head).toBe(8)
        e.run(cursorWordLeft); expect(e.sel().main.head).toBe(4)
        e.run(cursorWordLeft); expect(e.sel().main.head).toBe(0)
    })

    it('后向:文档首不越界返 false', () => {
        const e = editor('foo', EditorSelection.single(0))
        expect(e.run(cursorWordLeft)).toBe(false)
    })

    it('词中间前向只补完当前词(对齐 Monaco)foo\\nbar 从 2 → 3', () => {
        const e = editor('foo\nbar', EditorSelection.single(2)) // 在 'o' 前,词内
        e.run(cursorWordEndRight); expect(e.sel().main.head).toBe(3) // 只到 foo 尾,不跨行
    })

    it('前向跨行:换行处越过空白到下一词尾 foo\\nbar 从 3 → 7', () => {
        const e = editor('foo\nbar', EditorSelection.single(3))
        e.run(cursorWordEndRight); expect(e.sel().main.head).toBe(7) // 跨换行到 bar 尾
    })

    it('CJK:整组词落词尾 0→2→5', () => {
        const e = editor('中文 测试', EditorSelection.single(0))
        e.run(cursorWordEndRight); expect(e.sel().main.head).toBe(2) // 中文 尾
        e.run(cursorWordEndRight); expect(e.sel().main.head).toBe(5) // 测试 尾
    })

    it('selectWordEndRight:锚不动,head 扩到词尾', () => {
        const e = editor('foo bar', EditorSelection.single(0))
        e.run(selectWordEndRight)
        expect(e.sel().main.anchor).toBe(0)
        expect(e.sel().main.head).toBe(3)
    })
})

describe('commands —— 删词', () => {
    it('deleteGroupForward:从词首删整词', () => {
        const e = editor('foo bar', EditorSelection.single(0))
        e.run(deleteGroupForward)
        expect(e.doc()).toBe(' bar')
    })

    it('deleteGroupForward:词中间删到词尾', () => {
        const e = editor('foo bar', EditorSelection.single(1))
        e.run(deleteGroupForward)
        expect(e.doc()).toBe('f bar')
    })

    it('deleteGroupBackward:从词尾删整词', () => {
        const e = editor('foo bar', EditorSelection.single(3))
        e.run(deleteGroupBackward)
        expect(e.doc()).toBe(' bar')
    })

    it('deleteGroupForward:单空格跨过', () => {
        const e = editor('foo bar', EditorSelection.single(3)) // 'foo' 后的空格
        e.run(deleteGroupForward)
        expect(e.doc()).toBe('foo') // 删掉 ' bar'（空格+bar）
    })

    it('deleteGroupForward:标点组独立删', () => {
        const e = editor('foo.bar', EditorSelection.single(3))
        e.run(deleteGroupForward)
        expect(e.doc()).toBe('foobar')
    })

    it('deleteGroupBackward:非空选区删选区', () => {
        const e = editor('foo bar', EditorSelection.single(0, 3))
        e.run(deleteGroupBackward)
        expect(e.doc()).toBe(' bar')
    })

    // Monaco deleteWordLeft 对齐(实测 Monaco 2024):驼峰整词删、标点停、尾空白保留、下划线属词、CJK/字母数字整组。
    it('对齐 Monaco:驼峰整词删(非驼峰段)', () => {
        const e = editor('fooBar', EditorSelection.single(6))
        e.run(deleteGroupBackward)
        expect(e.doc()).toBe('')
    })

    it('对齐 Monaco:标点处停(foo.bar → foo.)', () => {
        const e = editor('foo.bar', EditorSelection.single(7))
        e.run(deleteGroupBackward)
        expect(e.doc()).toBe('foo.')
    })

    it('对齐 Monaco:尾随空白保留(foo   bar → foo   )', () => {
        const e = editor('foo   bar', EditorSelection.single(9))
        e.run(deleteGroupBackward)
        expect(e.doc()).toBe('foo   ')
    })

    it('对齐 Monaco:下划线属词(hello_world 整删)', () => {
        const e = editor('hello_world', EditorSelection.single(11))
        e.run(deleteGroupBackward)
        expect(e.doc()).toBe('')
    })

    it('对齐 Monaco:CJK 整组', () => {
        const e = editor('中文字符', EditorSelection.single(4))
        e.run(deleteGroupBackward)
        expect(e.doc()).toBe('')
    })

    it('对齐 Monaco:字母数字整组(foo123)', () => {
        const e = editor('foo123', EditorSelection.single(6))
        e.run(deleteGroupBackward)
        expect(e.doc()).toBe('')
    })
})

describe('commands —— 多光标 addNextOccurrence', () => {
    it('空选区 → 选当前词', () => {
        const e = editor('foo bar foo', EditorSelection.single(1))
        e.run(selectNextOccurrence)
        expect(e.sel().main.from).toBe(0)
        expect(e.sel().main.to).toBe(3)
    })

    it('非空选区 → 加下一处匹配为新 range', () => {
        const e = editor('foo bar foo', EditorSelection.single(0, 3))
        expect(e.run(selectNextOccurrence)).toBe(true)
        expect(e.sel().ranges.length).toBe(2)
        expect(e.sel().ranges[1].from).toBe(8)
        expect(e.sel().ranges[1].to).toBe(11)
    })

    it('无更多匹配 → false', () => {
        const e = editor('foo bar', EditorSelection.single(0, 3))
        expect(e.run(selectNextOccurrence)).toBe(false)
        expect(e.sel().ranges.length).toBe(1)
    })

    it('环绕搜索:从末尾回到开头找', () => {
        const e = editor('foo bar foo', EditorSelection.single(8, 11))
        e.run(selectNextOccurrence) // 找到开头
        expect(e.sel().ranges.length).toBe(2)
        // 新 range(0,3) 排序后在 index 0,原 range(8,11) 在 index 1
        expect(e.sel().ranges[0].from).toBe(0)
        expect(e.sel().ranges[0].to).toBe(3)
        expect(e.sel().ranges[1].from).toBe(8)
        expect(e.sel().ranges[1].to).toBe(11)
    })

    it('多选区中已有匹配 → 跳过找下一个', () => {
        const e = editor('foo foo foo', EditorSelection.create([
            EditorSelection.range(0, 3),
            EditorSelection.range(4, 7),
        ]))
        e.run(selectNextOccurrence) // 跳过已选的,找第三个
        expect(e.sel().ranges.length).toBe(3)
        expect(e.sel().ranges[2].from).toBe(8)
        expect(e.sel().ranges[2].to).toBe(11)
    })
})

describe('commands —— 缩进', () => {
    // 默认 indentUnit 派生自 tabSize(默认 4)=Monaco insertSpaces:true 语义,一级缩进=4 空格。
    it('indentMore: 单行选区行首加一级缩进(4 空格,派生自 tabSize)', () => {
        const e = editor('hello', EditorSelection.single(2))
        e.run(indentMore)
        expect(e.doc()).toBe('    hello')
        expect(e.sel().main.from).toBe(6)
    })

    it('indentMore: 多行选区每行加缩进', () => {
        const e = editor('a\nb\nc', EditorSelection.single(0, 5))
        e.run(indentMore)
        expect(e.doc()).toBe('    a\n    b\n    c')
    })

    it('indentLess: 去掉一级缩进', () => {
        const e = editor('    hello', EditorSelection.single(5))
        e.run(indentLess)
        expect(e.doc()).toBe('hello')
    })

    it('indentLess: 不足一个 unit 去实际前导', () => {
        const e = editor(' hello', EditorSelection.single(2))
        e.run(indentLess)
        expect(e.doc()).toBe('hello')
    })

    it('indentLess: 无前导空白不变', () => {
        const e = editor('hello', EditorSelection.single(0))
        e.run(indentLess)
        expect(e.doc()).toBe('hello')
    })

    // Monaco 实测:无选区 Tab 补到下一个 tab stop(列 1 → 列 4,插 3 个空格)
    it('insertTab: 无选区补到下一个 tab stop', () => {
        const e = editor('abc', EditorSelection.single(1))
        e.run(insertTab)
        expect(e.doc()).toBe('a   bc')
    })

    it('insertTab: 有选区→indentMore', () => {
        const e = editor('abc', EditorSelection.single(0, 3))
        e.run(insertTab)
        expect(e.doc()).toBe('    abc')
    })

    it('insertTab: 只读返 false', () => {
        let state = EditorState.create({
            doc: 'abc',
            selection: EditorSelection.single(1),
            extensions: [EditorState.readOnly.of(true)],
        })
        expect(insertTab({ state, dispatch: tr => { state = tr.apply() } })).toBe(false)
        expect(state.doc.toString()).toBe('abc')
    })

    it('insertNewlineAndIndent: 继承上一行缩进', () => {
        const e = editor('    hello', EditorSelection.single(9))
        e.run(insertNewlineAndIndent)
        expect(e.doc()).toBe('    hello\n    ')
    })

    it('insertNewlineAndIndent: 无缩进行不缩进', () => {
        const e = editor('hello', EditorSelection.single(2))
        e.run(insertNewlineAndIndent)
        expect(e.doc()).toBe('he\nllo')
    })

    it('insertNewlineAndIndent: 只读返 false', () => {
        let state = EditorState.create({
            doc: 'ab',
            selection: EditorSelection.single(1),
            extensions: [EditorState.readOnly.of(true)],
        })
        expect(insertNewlineAndIndent({ state, dispatch: tr => { state = tr.apply() } })).toBe(false)
        expect(state.doc.toString()).toBe('ab')
    })

    it('indentUnit 派生自 tabSize=2 → 一级缩进 2 空格', () => {
        let state = EditorState.create({
            doc: 'hello',
            selection: EditorSelection.single(2),
            extensions: [EditorState.allowMultipleSelections.of(true), EditorState.tabSize.of(2)],
        })
        const dispatch = (tr: Transaction) => { state = tr.apply() }
        indentMore({ state, dispatch })
        expect(state.doc.toString()).toBe('  hello')
    })

    it('显式 indentUnit 覆盖 tabSize 派生', () => {
        let state = EditorState.create({
            doc: 'hello',
            selection: EditorSelection.single(2),
            extensions: [EditorState.allowMultipleSelections.of(true), EditorState.indentUnit.of('    ')],
        })
        const dispatch = (tr: Transaction) => { state = tr.apply() }
        indentMore({ state, dispatch })
        expect(state.doc.toString()).toBe('    hello')
    })
})

describe('cursorPageUp / cursorPageDown —— 翻页(对齐 Monaco cursorPageUp/Down)', () => {
    const doc = Array.from({ length: 100 }, (_, i) => `line${i}`).join('\n') // 100 行

    it('默认页(无 linesPerPage)跨 30 行', () => {
        const e = editor(doc, EditorSelection.single(0)) // line0 首
        expect(e.run(cursorPageDown)).toBe(true)
        expect(e.state.doc.lineAt(e.sel().main.head).number).toBe(31) // 第1行 + 30
    })

    it('PageUp clamp 到首行', () => {
        const e = editor(doc, EditorSelection.single(0))
        expect(e.run(cursorPageUp)).toBe(false) // 已在首行,无移动
    })

    it('PageDown clamp 到末行', () => {
        const e = editor(doc, EditorSelection.single(doc.length))
        expect(e.run(cursorPageDown)).toBe(false) // 已在末行
    })

    it('linesPerPage() 决定页大小', () => {
        let state = EditorState.create({ doc, selection: EditorSelection.single(0), extensions: EditorState.allowMultipleSelections.of(true) })
        const target = { state, dispatch: (tr: Transaction) => { state = tr.apply() }, linesPerPage: () => 10 }
        expect(cursorPageDown(target)).toBe(true)
        // Monaco pageSize = max(1, 可视行数 - 2):10 行视口一次跨 8 行
        expect(state.doc.lineAt(state.selection.main.head).number).toBe(9)
    })

    it('selectPageDown 扩选(锚不动)', () => {
        const e = editor(doc, EditorSelection.single(0))
        expect(e.run(selectPageDown)).toBe(true)
        expect(e.sel().main.anchor).toBe(0)
        expect(e.sel().main.head).toBeGreaterThan(0)
    })
})

describe('insertLineAfter / insertLineBefore —— 开行(对齐 Monaco Ctrl+Enter)', () => {
    it('insertLineAfter: 行中光标 → 行尾开新行,继承缩进', () => {
        const e = editor('  hello', EditorSelection.single(4)) // hello 中间
        e.run(insertLineAfter)
        expect(e.doc()).toBe('  hello\n  ')
        expect(e.sel().main.head).toBe(10) // 新行行首 + 2 缩进
    })

    it('insertLineAfter: 无缩进', () => {
        const e = editor('hello', EditorSelection.single(2))
        e.run(insertLineAfter)
        expect(e.doc()).toBe('hello\n')
        expect(e.sel().main.head).toBe(6)
    })

    // Monaco 实测(⌘⇧Enter):首行时在文档头插 \n,光标留在 (1,1),新行不带缩进
    it('insertLineBefore: 首行 → 文档头开空行,光标落新行', () => {
        const e = editor('  hello', EditorSelection.single(4))
        e.run(insertLineBefore)
        expect(e.doc()).toBe('\n  hello')
        expect(e.sel().main.head).toBe(0)
    })

    it('insertLineAfter: 末行也能开', () => {
        const e = editor('a\nb', EditorSelection.single(3))
        e.run(insertLineAfter)
        expect(e.doc()).toBe('a\nb\n')
    })
})

describe('cursorMatchingBracket —— 跳到匹配括号(对齐 Monaco jumpToBracket)', () => {
    // Monaco 实测:foo‸(a, b) → foo(a, b‸)(落在配对闭括号之前)
    it('光标处是开括号 → 跳到匹配闭括号之前', () => {
        //          0123456789012
        const e = editor('foo(bar(baz))', EditorSelection.single(3)) // 光标在 ( 前
        expect(e.run(cursorMatchingBracket)).toBe(true)
        expect(e.sel().main.head).toBe(12) // 最外 ) 在 12,落其前
    })

    it('光标前是闭括号 → 跳到匹配开括号(其前)', () => {
        const e = editor('foo(bar(baz))', EditorSelection.single(13)) // 光标在末尾,前一字符是 )
        expect(e.run(cursorMatchingBracket)).toBe(true)
        expect(e.sel().main.head).toBe(3) // 最外 ( 在 3,落其前
    })

    it('嵌套:内层配对', () => {
        const e = editor('foo(bar(baz))', EditorSelection.single(7)) // 光标在内层 ( 前,左侧是 r
        expect(e.run(cursorMatchingBracket)).toBe(true)
        expect(e.sel().main.head).toBe(11) // 内层 ) 在 11,落其前
    })

    // Monaco 实测:foo(a, ‸b) → foo(a, b‸)(不贴括号 → 包围括号的闭括号之前)
    it('不贴括号 → 跳到包围括号的闭括号之前', () => {
        const e = editor('foo(a, b)', EditorSelection.single(7))
        expect(e.run(cursorMatchingBracket)).toBe(true)
        expect(e.sel().main.head).toBe(8)
    })

    it('不邻括号 → 返 false', () => {
        const e = editor('foobar', EditorSelection.single(3))
        expect(e.run(cursorMatchingBracket)).toBe(false)
    })

    it('未闭合 → 返 false', () => {
        const e = editor('foo(bar', EditorSelection.single(3))
        expect(e.run(cursorMatchingBracket)).toBe(false)
    })
})

describe('toggleLineComment —— 行注释切换', () => {
    const slash = toggleLineComment('//')

    it('单行:光标行加注释', () => {
        const e = editor('const x = 1', EditorSelection.single(3))
        expect(e.run(slash)).toBe(true)
        expect(e.doc()).toBe('// const x = 1')
    })

    it('对称:再切换去注释', () => {
        const e = editor('// const x = 1', EditorSelection.single(3))
        expect(e.run(slash)).toBe(true)
        expect(e.doc()).toBe('const x = 1')
    })

    it('保留缩进:注释符插在首非空白处', () => {
        const e = editor('    return 1', EditorSelection.single(6))
        e.run(slash)
        expect(e.doc()).toBe('    // return 1')
    })

    it('多行选区:全未注释→全加', () => {
        const e = editor('a\nb\nc', EditorSelection.single(0, 5))
        e.run(slash)
        expect(e.doc()).toBe('// a\n// b\n// c')
    })

    it('多行选区:全已注释→全去', () => {
        const e = editor('// a\n// b\n// c', EditorSelection.single(0, 13))
        e.run(slash)
        expect(e.doc()).toBe('a\nb\nc')
    })

    it('混合(部分已注释)→全加(以未注释为准)', () => {
        const e = editor('// a\nb', EditorSelection.single(0, 6))
        e.run(slash)
        expect(e.doc()).toBe('// // a\n// b')
    })

    it('空行不落孤立注释符', () => {
        const e = editor('a\n\nb', EditorSelection.single(0, 4))
        e.run(slash)
        expect(e.doc()).toBe('// a\n\n// b')
    })

    it('去注释兼容无空格前缀 //x', () => {
        const e = editor('//x', EditorSelection.single(0))
        e.run(slash)
        expect(e.doc()).toBe('x')
    })
})

describe('deleteLine —— 删整行', () => {
    it('删中间行:含尾换行', () => {
        const e = editor('a\nb\nc', EditorSelection.single(2))
        expect(e.run(deleteLine)).toBe(true)
        expect(e.doc()).toBe('a\nc')
    })

    it('删首行', () => {
        const e = editor('a\nb\nc', EditorSelection.single(0))
        e.run(deleteLine)
        expect(e.doc()).toBe('b\nc')
    })

    it('删末行:删前导换行', () => {
        const e = editor('a\nb\nc', EditorSelection.single(4))
        e.run(deleteLine)
        expect(e.doc()).toBe('a\nb')
    })

    it('删唯一行:剩空文档', () => {
        const e = editor('only', EditorSelection.single(2))
        e.run(deleteLine)
        expect(e.doc()).toBe('')
    })

    it('多行选区:删覆盖的所有行', () => {
        const e = editor('a\nb\nc\nd', EditorSelection.single(0, 3))
        e.run(deleteLine)
        expect(e.doc()).toBe('c\nd')
    })
})

describe('deleteLineContentOrJoin —— ⌘⌫ 两段式', () => {
    it('有内容:清空行,光标到行首,换行保留', () => {
        const e = editor('hello\nworld', EditorSelection.single(3)) // hel|lo
        expect(e.run(deleteLineContentOrJoin)).toBe(true)
        expect(e.doc()).toBe('\nworld')
        expect(e.sel().main.head).toBe(0)
    })

    it('空行再按:并入上一行', () => {
        const e = editor('hello\n', EditorSelection.single(6)) // 第二行空|
        expect(e.run(deleteLineContentOrJoin)).toBe(true)
        expect(e.doc()).toBe('hello')
        expect(e.sel().main.head).toBe(5)
    })

    it('两下:有内容→清空→并入上一行', () => {
        const e = editor('aa\nbb\ncc', EditorSelection.single(4)) // 第二行 b|b
        e.run(deleteLineContentOrJoin)
        expect(e.doc()).toBe('aa\n\ncc')
        expect(e.sel().main.head).toBe(3) // 空行行首
        e.run(deleteLineContentOrJoin)
        expect(e.doc()).toBe('aa\ncc')
        expect(e.sel().main.head).toBe(2) // 上一行末
    })

    it('首行已空:返 false', () => {
        const e = editor('\nbb', EditorSelection.single(0))
        expect(e.run(deleteLineContentOrJoin)).toBe(false)
        expect(e.doc()).toBe('\nbb')
    })

    it('唯一行有内容:清空成空文档', () => {
        const e = editor('only', EditorSelection.single(2))
        e.run(deleteLineContentOrJoin)
        expect(e.doc()).toBe('')
        expect(e.sel().main.head).toBe(0)
    })
})

describe('cursorLineBoundaryBackward —— 智能 Home', () => {
    it('行尾按 Home:跳到首非空白处(缩进后)', () => {
        const e = editor('    hello', EditorSelection.single(9))
        expect(e.run(cursorLineBoundaryBackward)).toBe(true)
        expect(e.sel().main.head).toBe(4) // 首非空白 = line.from + 4
    })

    it('已在首非空白处:再按跳真行首(列0)', () => {
        const e = editor('    hello', EditorSelection.single(4))
        e.run(cursorLineBoundaryBackward)
        expect(e.sel().main.head).toBe(0)
    })

    it('无缩进行:直接跳行首', () => {
        const e = editor('hello', EditorSelection.single(3))
        e.run(cursorLineBoundaryBackward)
        expect(e.sel().main.head).toBe(0)
    })

    it('全空白行:首非空白=行尾,已在则跳行首', () => {
        const e = editor('    ', EditorSelection.single(4))
        e.run(cursorLineBoundaryBackward) // head=4=indentPos → 跳 0
        expect(e.sel().main.head).toBe(0)
    })

    it('多行:第2行智能 Home 只影响该行', () => {
        const e = editor('a\n  bb', EditorSelection.single(6))
        e.run(cursorLineBoundaryBackward)
        expect(e.sel().main.head).toBe(4) // 第2行 from=2 + indent 2
    })

    it('selectLineBoundaryBackward:锚不动扩到首非空白', () => {
        const e = editor('    hello', EditorSelection.single(9))
        e.run(selectLineBoundaryBackward)
        expect(e.sel().main.anchor).toBe(9)
        expect(e.sel().main.head).toBe(4)
    })
})

describe('deleteBracketPair —— 退格删配对', () => {
    it('光标夹在 () 中间:退格同删两个', () => {
        const e = editor('()', EditorSelection.single(1))
        expect(e.run(deleteBracketPair)).toBe(true)
        expect(e.doc()).toBe('')
        expect(e.sel().main.head).toBe(0)
    })

    it('各种配对都删', () => {
        for (const [o, c] of [['[', ']'], ['{', '}'], ['"', '"'], ['\'', '\''], ['`', '`']]) {
            const e = editor(o + c, EditorSelection.single(1))
            expect(e.run(deleteBracketPair)).toBe(true)
            expect(e.doc()).toBe('')
        }
    })

    it('前后不成对:返 false(走普通退格)', () => {
        const e = editor('(x', EditorSelection.single(1))
        expect(e.run(deleteBracketPair)).toBe(false)
    })

    it('非空选区:返 false', () => {
        const e = editor('()', EditorSelection.single(0, 2))
        expect(e.run(deleteBracketPair)).toBe(false)
    })

    it('文档首/尾:返 false', () => {
        expect(editor('()', EditorSelection.single(0)).run(deleteBracketPair)).toBe(false)
        expect(editor('()', EditorSelection.single(2)).run(deleteBracketPair)).toBe(false)
    })

    it('保留内容:光标在 (x) 的 ( 后但后面是 x 非 )→false', () => {
        const e = editor('(x)', EditorSelection.single(1))
        expect(e.run(deleteBracketPair)).toBe(false)
    })
})

describe('insertNewlineAndIndent —— 括号展开', () => {
    it('{|} 回车展开成三行,内层多一级缩进(4 空格,派生自 tabSize)', () => {
        const e = editor('{}', EditorSelection.single(1))
        e.run(insertNewlineAndIndent)
        expect(e.doc()).toBe('{\n    \n}')
        expect(e.sel().main.head).toBe(6) // { \n + 4空格 后
    })

    it('保留基准缩进:    {|} 内层 = 基准+unit,闭符回基准', () => {
        const e = editor('    {}', EditorSelection.single(5))
        e.run(insertNewlineAndIndent)
        expect(e.doc()).toBe('    {\n        \n    }')
    })

    it('() 和 [] 同样展开', () => {
        const a = editor('()', EditorSelection.single(1))
        a.run(insertNewlineAndIndent)
        expect(a.doc()).toBe('(\n    \n)')
        const b = editor('[]', EditorSelection.single(1))
        b.run(insertNewlineAndIndent)
        expect(b.doc()).toBe('[\n    \n]')
    })

    it('不成对(前后非括号对):普通继承缩进换行', () => {
        const e = editor('  ab', EditorSelection.single(4))
        e.run(insertNewlineAndIndent)
        expect(e.doc()).toBe('  ab\n  ') // 继承已有 2 空格前导,不是一级缩进
    })

    it('引号不展开(只 (){}[])', () => {
        const e = editor('""', EditorSelection.single(1))
        e.run(insertNewlineAndIndent)
        expect(e.doc()).toBe('"\n"') // 普通换行,无中间缩进行
    })

    it('行尾未闭合开括号:回车多缩进一级(对齐 Monaco)', () => {
        const e = editor('  if (x) {', EditorSelection.single(10))
        e.run(insertNewlineAndIndent)
        // Monaco 实测:缩进 = normalizeIndentation('  ' + '\t') → 下一个 tab stop(4 列),不是 2 + 4
        expect(e.doc()).toBe('  if (x) {\n    ')
        expect(e.sel().main.head).toBe(15)
    })

    it('行尾开括号(零基准):回车缩进一级(4 空格)', () => {
        const e = editor('foo(', EditorSelection.single(4))
        e.run(insertNewlineAndIndent)
        expect(e.doc()).toBe('foo(\n    ')
    })

    it('光标后紧跟闭符仍走三行展开(不是简单多缩进)', () => {
        const e = editor('foo()', EditorSelection.single(4))
        e.run(insertNewlineAndIndent)
        expect(e.doc()).toBe('foo(\n    \n)')
    })

    it('行尾非开括号:不多缩进', () => {
        const e = editor('  foo', EditorSelection.single(5))
        e.run(insertNewlineAndIndent)
        expect(e.doc()).toBe('  foo\n  ')
    })
})
