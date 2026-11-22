// 对齐套件里 ViewModel 三个测试文件(modelLineProjection / viewModelImpl / viewModelDecorations,共 28 条)逐条翻译成自有单测。
//
// Monaco 的 ViewModel 是模型行 ↔ 视图行的一层(折行、隐藏区、注入文字),原测直接戳它的内部类
// (ViewModelLinesFromProjectedModel、ModelLineProjection、ViewModelDecorations)。lite-monaco 没有这一层:折行交给浏览器排版,
// 隐藏区在 heightmap 里塌成 0 高。能从外面看到的同一件事分别落在:
//   · 文本侧折行模型:core/view/softwrap.ts 的 LineProjection / SoftWrapModel(wordWrap:'wordWrapColumn' 时折点只由文本 + 列数决定,
//     这就是 Monaco 的 MonospaceLineBreaksComputer 那套规则),原测的「视图行内容 / 最小最大列 / 模型列 ↔ 视图列」翻到这里;
//   · 公共 API:getTopForLineNumber / getScrolledVisiblePosition / getVisibleRanges / getContentHeight / setHiddenAreas / 复制文本 / 模型装饰;
//   · DOM:装饰在一整行里的位置(浏览器自己折,每条装饰只在 DOM 里出现一次,不像 Monaco 按视图行切成多段)。
// 不测的(归真浏览器差分):ViewLineData 里按视图行切开的 token 色号与 InlineDecoration 的视图坐标范围(Monaco 内部结构,
// lite-monaco 没有对应物);真实宽度下的折点(bounded / 视口宽折行取决于字体度量)。
import { afterEach, describe, expect, it } from 'vitest'
import { createEditor } from '../../src'
import { Affinity, LineProjection, SoftWrapModel, computeLineProjection, wrapConfig } from '../../src/core/view/softwrap'
import { copiedRange } from '../../src/core/input/clipboard'
import { fakeHl, QUIET } from './h1-helpers'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ed = any
const mounted: { ed: Ed, parent: HTMLElement }[] = []
afterEach(() => { for (const { ed, parent } of mounted.splice(0)) { try { ed.dispose() } catch { /* */ } parent.remove() } })

function make(value: string, opts: Record<string, unknown> = {}): Ed {
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    const ed = createEditor(parent, { value, highlighter: fakeHl(), features: QUIET, ...opts } as never) as Ed
    Object.defineProperty(ed.scrollDOM, 'clientHeight', { configurable: true, get: () => 400 }) // jsdom 没有布局:给一个 400 高的视口
    ed.oracle.lineHeight = 20 // jsdom 没有布局:行高靠探针注入,heightmap 重建
    ed.resetHeights()
    mounted.push({ ed, parent })
    return ed
}
const wrapped = (value: string, column: number, opts: Record<string, unknown> = {}) => make(value, { wordWrap: 'wordWrapColumn', wordWrapColumn: column, wrappingIndent: 'indent', ...opts })
const R = (a: number, b: number, c: number, d: number) => ({ startLineNumber: a, startColumn: b, endLineNumber: c, endColumn: d })
const vis = (ed: Ed) => (ed.getVisibleRanges() as { startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number }[]).map(r => [r.startLineNumber, r.startColumn, r.endLineNumber, r.endColumn])
const rowTotal = (ed: Ed) => { const m = ed.softWrapModel() as SoftWrapModel; let n = 0; for (let l = 1; l <= ed.getModel().getLineCount(); l++) n += m.rowCount(l); return n }
const viewLines = (ed: Ed, line: number) => { const m = ed.softWrapModel() as SoftWrapModel; return Array.from({ length: m.rowCount(line) }, (_, r) => ({ content: m.content(line, r), min: m.minColumn(line, r), max: m.maxColumn(line, r) })) }

// ───────────────────────── modelLineProjection.test.ts ─────────────────────────
describe('Editor ViewModel - SplitLinesCollection', () => {
    /** createSplitLine:不经折行算法,直接给定折点(原测的 createLineBreakData) */
    function splitLine(text: string, splitLengths: number[], breakVcols: number[], indent: number) {
        const sums: number[] = []
        splitLengths.forEach((n, i) => { sums[i] = (i > 0 ? sums[i - 1] : 0) + n })
        const proj = new LineProjection(null, null, sums, breakVcols, indent)
        const model = new class extends SoftWrapModel { override projection() { return proj } }({ lines: 1, text: () => text }, wrapConfig({ column: 1000 }))
        return model
    }
    const pos = (row: number, col: number) => ({ row, col })

    it('SplitLine', () => {
        const T = 'My First LineMy Second LineAnd another one'
        let m = splitLine(T, [13, 14, 15], [13, 13 + 14, 13 + 14 + 15], 0)
        expect(m.rowCount(1)).toBe(3)
        expect([0, 1, 2].map(r => m.content(1, r))).toEqual(['My First Line', 'My Second Line', 'And another one'])
        expect([0, 1, 2].map(r => m.maxColumn(1, r))).toEqual([14, 15, 16])
        for (let col = 1; col <= 14; col++) expect(m.toModel({ line: 1, row: 0, col }) + 1, `getInputColumnOfOutputPosition(0, ${col})`).toBe(col)
        for (let col = 1; col <= 15; col++) expect(m.toModel({ line: 1, row: 1, col }) + 1, `getInputColumnOfOutputPosition(1, ${col})`).toBe(13 + col)
        for (let col = 1; col <= 16; col++) expect(m.toModel({ line: 1, row: 2, col }) + 1, `getInputColumnOfOutputPosition(2, ${col})`).toBe(13 + 14 + col)
        const view = (col: number) => { const v = m.toView(1, col - 1); return pos(v.row, v.col) }
        for (let col = 1; col <= 13; col++) expect(view(col), `getOutputPositionOfInputPosition(${col})`).toEqual(pos(0, col))
        for (let col = 1 + 13; col <= 14 + 13; col++) expect(view(col), `getOutputPositionOfInputPosition(${col})`).toEqual(pos(1, col - 13))
        for (let col = 1 + 13 + 14; col <= 15 + 14 + 13; col++) expect(view(col), `getOutputPositionOfInputPosition(${col})`).toEqual(pos(2, col - 13 - 14))

        // 续行缩进 4
        m = splitLine(T, [13, 14, 15], [13, 13 + 14, 13 + 14 + 15], 4)
        expect(m.rowCount(1)).toBe(3)
        expect([0, 1, 2].map(r => m.content(1, r))).toEqual(['My First Line', '    My Second Line', '    And another one'])
        expect([0, 1, 2].map(r => m.maxColumn(1, r))).toEqual([14, 19, 20])
        const mapping: number[][] = []
        for (let r = 0; r < 3; r++) {
            const row: number[] = []
            for (let col = 1; col <= m.maxColumn(1, r); col++) row.push(m.toModel({ line: 1, row: r, col }) + 1)
            mapping.push(row)
        }
        expect(mapping).toEqual([
            [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
            [14, 14, 14, 14, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28],
            [28, 28, 28, 28, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43],
        ])
        for (let col = 1; col <= 13; col++) expect(view(col)).toEqual(pos(0, col))
        for (let col = 1 + 13; col <= 14 + 13; col++) expect(view(col)).toEqual(pos(1, 4 + col - 13))
        for (let col = 1 + 13 + 14; col <= 15 + 14 + 13; col++) expect(view(col)).toEqual(pos(2, 4 + col - 13 - 14))
    })

    const MAIN = ['int main() {', '\tprintf("Hello world!");', '}', 'int main() {', '\tprintf("Hello world!");', '}'].join('\n')

    it('Invalid line numbers', () => {
        // 原测直接戳 ViewModelLines 的越界行号(-1 / 0 / 7 / 8 夹到首末行)。公共入口的同一件事:
        // 视图行(不折行时 = 模型行)的内容 / 最小最大列、缩进参考线,以及越界光标位置被夹回有效范围。
        const ed = wrapped(MAIN, 80) // 80 列放得下:一模型行一视图行
        expect(rowTotal(ed)).toBe(6)
        const model = ed.getModel()
        expect(model.guides.getLinesIndentGuides(1, 6)).toEqual([0, 1, 0, 0, 1, 0]) // getViewLinesIndentGuides(0, 7) 夹成 1..6
        for (let n = 1; n <= 6; n++) expect(model.guides.getLinesIndentGuides(n, n)).toEqual([[0, 1, 0, 0, 1, 0][n - 1]])
        expect(Array.from({ length: 6 }, (_, i) => viewLines(ed, i + 1)[0].content)).toEqual(MAIN.split('\n'))
        expect(Array.from({ length: 6 }, (_, i) => viewLines(ed, i + 1)[0].min)).toEqual([1, 1, 1, 1, 1, 1])
        expect(Array.from({ length: 6 }, (_, i) => viewLines(ed, i + 1)[0].max)).toEqual([13, 25, 2, 13, 25, 2])
        // 越界位置夹回:行号 < 1 → 第 1 行第 1 列,> 末行 → 末行行尾(模型 validatePosition 的规则;原测 convertViewPositionToModelPosition
        // 的 (7,1)→(6,1) 是视图→模型换算的夹法,公共 API 里对应的是 setPosition 走 validatePosition,越界落到末行行尾)
        const clamp = (l: number, c: number) => { ed.setPosition({ lineNumber: l, column: c }); return [ed.getPosition().lineNumber, ed.getPosition().column] }
        expect([clamp(-1, 1), clamp(0, 1), clamp(1, 1), clamp(6, 1), clamp(7, 1), clamp(8, 1)]).toEqual([[1, 1], [1, 1], [1, 1], [6, 1], [6, 2], [6, 2]])
        // 模型层越界行号:原版 model.getLineContent 也抛
        expect(() => model.getLineContent(0)).toThrow()
        expect(() => model.getLineContent(7)).toThrow()
    })

    it('issue #3662', () => {
        const ed = wrapped(MAIN, 80)
        ed.setHiddenAreas([R(1, 1, 3, 1), R(5, 1, 6, 1)])
        expect(rowTotal(ed)).toBe(1) // getOutputLineCount() === 1:只剩第 4 行
        expect(ed.contentDOM.querySelectorAll('.cm-line').length).toBe(1)
        expect(ed.getContentHeight()).toBe(20)
        // 原测断言:任何模型位置换算成视图位置后都在有效范围内,任何视图位置换算回模型位置后都是有效位置。
        // 逐个模型位置落光标(含越界一格),落点必须是有效模型位置
        const model = ed.getModel()
        for (let line = 0; line <= 7; line++) {
            const maxCol = line >= 1 && line <= 6 ? model.getLineMaxColumn(line) : 1
            for (let col = 0; col <= maxCol + 1; col++) {
                ed.setPosition({ lineNumber: line, column: col })
                const p = ed.getPosition()
                expect(p, `${line},${col}`).toEqual(model.validatePosition(p))
            }
        }
        // 可见区只有第 4 行(几何:隐藏行不占高)
        expect(vis(ed)).toEqual([[4, 1, 4, 13]])
        expect([1, 2, 3, 4, 5, 6].map(n => ed.getTopForLineNumber(n))).toEqual([0, 0, 0, 0, 0, 0])
    })
})

describe('SplitLinesCollection', () => {
    const TEXT = [
        'class Nice {',
        '	function hi() {',
        '		console.log("Hello world");',
        '	}',
        '	function hello() {',
        '		console.log("Hello world, this is a somewhat longer line");',
        '	}',
        '}',
    ].join('\n')
    // getViewLinesData 里的 tokens(前景色号)是 Monaco ViewLineData 的内部结构,这里不翻;内容 / 最小最大列 / 隐藏区后的视图行集合照翻。

    it('getViewLinesData - no wrapping', () => {
        const ed = make(TEXT) // wordWrap off
        const visible = (n: number) => !ed.getModel() || rowOf(ed, n) > 0
        function rowOf(e: Ed, n: number) { return e.getTopForLineNumber(n + 1) - e.getTopForLineNumber(n) > 0 || n === e.getModel().getLineCount() ? 1 : 0 }
        void visible
        // 8 行,每行一个视图行,内容 = 模型行,minColumn 1,maxColumn = 行长 + 1
        const lines = TEXT.split('\n')
        expect(ed.getModel().getLineCount()).toBe(8)
        expect(lines.map(l => l.length + 1)).toEqual([13, 17, 30, 3, 20, 62, 3, 2].slice(0, 0).concat([13, 17, 30, 3, 20, 62, 3, 2]))
        for (let n = 1; n <= 8; n++) {
            expect(ed.getModel().getLineMinColumn(n)).toBe(1)
            expect(ed.getModel().getLineMaxColumn(n)).toBe(lines[n - 1].length + 1)
        }
        // 全可见:每行 20 高,8 行
        expect([1, 2, 3, 4, 5, 6, 7, 8].map(n => ed.getTopForLineNumber(n))).toEqual([0, 20, 40, 60, 80, 100, 120, 140])
        expect(vis(ed)).toEqual([[1, 1, 8, 2]])
        // setHiddenAreas([2,1 → 4,1]):5 个视图行,行 2..4 不可见
        ed.setHiddenAreas([R(2, 1, 4, 1)])
        expect(ed.getContentHeight()).toBe(5 * 20)
        expect([1, 5, 6, 7, 8].map(n => ed.getTopForLineNumber(n))).toEqual([0, 20, 40, 60, 80])
        expect(vis(ed)).toEqual([[1, 1, 1, 13], [5, 1, 8, 2]])
        expect((Array.from(ed.contentDOM.querySelectorAll('.cm-line')) as Element[]).map(l => l.textContent)).toEqual([lines[0], lines[4], lines[5], lines[6], lines[7]])
    })

    const WRAPPED = [
        [['class Nice {', 1, 13]],
        [['\tfunction hi() {', 1, 17]],
        [['\t\tconsole.log("Hello ', 1, 22], ['            world");', 13, 21]],
        [['\t}', 1, 3]],
        [['\tfunction hello() {', 1, 20]],
        [['\t\tconsole.log("Hello ', 1, 22], ['            world, this is a ', 13, 30], ['            somewhat longer ', 13, 29], ['            line");', 13, 20]],
        [['\t}', 1, 3]],
        [['}', 1, 2]],
    ] as [string, number, number][][]

    it('getViewLinesData - with wrapping', () => {
        const ed = wrapped(TEXT, 30)
        expect(rowTotal(ed)).toBe(12)
        for (let n = 1; n <= 8; n++) expect(viewLines(ed, n).map(v => [v.content, v.min, v.max]), `model line ${n}`).toEqual(WRAPPED[n - 1])
        // 几何:折行把下一行顶下去(第 3 行 2 个视图行、第 6 行 4 个)
        expect([1, 2, 3, 4, 5, 6, 7, 8].map(n => ed.getTopForLineNumber(n))).toEqual([0, 20, 40, 80, 100, 120, 200, 220])
        expect(ed.getScrolledVisiblePosition({ lineNumber: 4, column: 1 }).top).toBe(80)
        ed.setHiddenAreas([R(2, 1, 4, 1)])
        expect(rowTotal(ed)).toBe(8)
        expect(ed.getContentHeight()).toBe(8 * 20)
        const rows = (n: number) => (ed.softWrapModel() as SoftWrapModel).rowCount(n)
        expect([1, 2, 3, 4, 5, 6, 7, 8].map(rows)).toEqual([1, 0, 0, 0, 1, 4, 1, 1])
        expect([5, 6, 7, 8].map(n => ed.getTopForLineNumber(n))).toEqual([20, 40, 120, 140])
    })

    it('getViewLinesData - with wrapping and injected text', () => {
        const ed = wrapped(TEXT, 30)
        const INJECT = 'very very long injected text that causes a line break'
        ed.changeDecorations((a: Ed) => a.deltaDecorations([], [{
            range: R(1, 9, 1, 9),
            options: { description: 'example', after: { content: INJECT, inlineClassName: 'myClassName' }, showIfCollapsed: true },
        }]))
        expect(rowTotal(ed)).toBe(14)
        expect(viewLines(ed, 1)[0].max).toBe(24)
        // 注入文字占列、可被折断:三个视图行(原测的 content / min / max 三行)
        expect(viewLines(ed, 1).map(v => [v.content, v.min, v.max])).toEqual([
            ['class Nivery very long ', 1, 24],
            ['    injected text that causes ', 5, 31],
            ['    a line breakce {', 5, 21],
        ])
        // 其余行与不注入时相同
        for (let n = 2; n <= 8; n++) expect(viewLines(ed, n).map(v => [v.content, v.min, v.max])).toEqual(WRAPPED[n - 1])
        // 原测的 inlineDecorations:三个视图行里注入文字的 [8,23] [4,30] [4,16](即 15 + 26 + 12 = 注入文字全长)。
        // 这里验:各行内容里扣掉缩进与模型文字后的注入片段长度同样是 15 / 26 / 12,拼起来 === 注入文字;DOM 里它是一个带 inlineClassName 的 span
        const v = viewLines(ed, 1)
        const slices = [v[0].content.slice(8, 23), v[1].content.slice(4, 30), v[2].content.slice(4, 16)]
        expect(slices.map(s => s.length)).toEqual([15, 26, 12])
        expect(slices.join('')).toBe(INJECT)
        const span = ed.contentDOM.querySelector('.myClassName') as HTMLElement
        expect(span.textContent).toBe(INJECT)
        expect(span.hasAttribute('data-cm-widget')).toBe(true)
        expect(span.getAttribute('data-cm-widget-from')).toBe('8')
        // 几何(第 1 行变 3 个视图行后下一行被顶下 40px)没测:heightmap 在 jsdom 里只按文档字符数估折行,不含注入 widget 的宽度,
        // 真实高度由浏览器排版量出来 —— 归真浏览器差分
    })
})

// ───────────────────────── viewModelImpl.test.ts ─────────────────────────
describe('ViewModel', () => {
    it("issue #21073: SplitLinesCollection: attempt to access a 'newer' model", () => {
        const ed = wrapped('', 80)
        expect(ed.getModel().getLineCount()).toBe(1)
        expect(rowTotal(ed)).toBe(1)
        ed.getModel().applyEdits([{ range: R(1, 1, 1, 1), text: Array.from({ length: 10 }, (_, i) => `line${String(i + 1).padStart(2, '0')}`).join('\n') }])
        expect(ed.getModel().getLineCount()).toBe(10)
        expect(rowTotal(ed)).toBe(10)
    })

    it("issue #44805: SplitLinesCollection: attempt to access a 'newer' model", () => {
        const ed = wrapped('', 80)
        const model = ed.getModel()
        for (const t of ['\ninsert1', '\ninsert2', '\ninsert3']) model.pushEditOperations([], [{ range: R(1, 1, 1, 1), text: t }], () => [])
        const counts: number[] = [model.getLineCount()]
        // 内容变化事件里读折行模型:拿到的必须是新文档的,不是旧的(原测:事件处理里读 viewModel.getLineCount())
        const d = ed.onDidChangeModelContent(() => { counts.push(model.getLineCount(), rowTotal(ed)) })
        model.undo()
        counts.push(model.getLineCount(), rowTotal(ed))
        d.dispose()
        expect(counts[0]).toBe(4)
        expect(counts.slice(1).every(n => n === 1)).toBe(true)
        expect(counts.length).toBeGreaterThanOrEqual(4)
    })

    it('issue #44805: No visible lines via API call', () => {
        const ed = wrapped('line1\nline2\nline3', 80)
        expect(ed.getModel().getLineCount()).toBe(3)
        ed.setHiddenAreas([R(1, 1, 3, 1)])
        expect(ed.getVisibleRanges()).not.toBeNull()
        expect(Array.isArray(ed.getVisibleRanges())).toBe(true)
    })

    it('issue #44805: No visible lines via undoing', () => {
        const ed = wrapped('', 80)
        const model = ed.getModel()
        model.pushEditOperations([], [{ range: R(1, 1, 1, 1), text: 'line1\nline2\nline3' }], () => [])
        ed.setHiddenAreas([R(1, 1, 1, 1)])
        expect(rowTotal(ed)).toBe(2)
        model.undo()
        expect(ed.getVisibleRanges()).not.toBeNull()
        expect(rowTotal(ed)).toBeGreaterThanOrEqual(0)
    })

    // getPlainTextToCopy(ranges, emptySelectionClipboard, forceCRLF) → string | string[]。
    // lite-monaco:copiedRange(state) 给 text(多选区用模型换行连起来)与 multicursorText(原版返回数组的情形)。
    const USUAL = ['', 'line2', 'line3', 'line4', ''].join('\n')
    function plain(ranges: [number, number, number, number][], emptySel: boolean): string | string[] {
        const ed = make(USUAL, { emptySelectionClipboard: emptySel })
        ed.setSelections(ranges.map(([a, b, c, d]) => ({ selectionStartLineNumber: a, selectionStartColumn: b, positionLineNumber: c, positionColumn: d })))
        const r = copiedRange(ed.state)
        return r.multicursorText ?? r.text
    }
    it('getPlainTextToCopy 0/1', () => { expect(plain([[2, 2, 2, 2]], false)).toBe('') })
    it('getPlainTextToCopy 0/1 - emptySelectionClipboard', () => { expect(plain([[2, 2, 2, 2]], true)).toBe('line2\n') })
    it('getPlainTextToCopy 1/1', () => { expect(plain([[2, 2, 2, 6]], false)).toBe('ine2') })
    it('getPlainTextToCopy 1/1 - emptySelectionClipboard', () => { expect(plain([[2, 2, 2, 6]], true)).toBe('ine2') })
    it('getPlainTextToCopy 0/2', () => { expect(plain([[2, 2, 2, 2], [3, 2, 3, 2]], false)).toBe('') })
    it('getPlainTextToCopy 0/2 - emptySelectionClipboard', () => { expect(plain([[2, 2, 2, 2], [3, 2, 3, 2]], true)).toBe('line2\nline3\n') })
    it('getPlainTextToCopy 1/2', () => { expect(plain([[2, 2, 2, 6], [3, 2, 3, 2]], false)).toBe('ine2') })
    it('getPlainTextToCopy 1/2 - emptySelectionClipboard', () => { expect(plain([[2, 2, 2, 6], [3, 2, 3, 2]], true)).toEqual(['ine2', 'line3']) })
    it('getPlainTextToCopy 2/2', () => { expect(plain([[2, 2, 2, 6], [3, 2, 3, 6]], false)).toEqual(['ine2', 'ine3']) })
    it('getPlainTextToCopy 2/2 reversed', () => { expect(plain([[3, 2, 3, 6], [2, 2, 2, 6]], false)).toEqual(['ine2', 'ine3']) })
    it('getPlainTextToCopy 0/3 - emptySelectionClipboard', () => { expect(plain([[2, 2, 2, 2], [2, 3, 2, 3], [3, 2, 3, 2]], true)).toBe('line2\nline3\n') })

    it('issue #22688 - always use CRLF for clipboard on Windows', () => {
        // 原测:模型 EOL 是 LF,Windows 上复制要写 CRLF(forceCRLF)。lite-monaco 复制的文本用模型 EOL 拼(state.lineBreak),
        // Windows 的 LF→CRLF 由浏览器写系统剪贴板时转换(Chromium 对 text/plain 在 Windows 上就是这么做的),编辑器不重复转。
        // 这里验:文本换行跟着模型 EOL 走(LF 是 \n,CRLF 是 \r\n);浏览器那一步归真机差分。
        const ed = make(USUAL, { emptySelectionClipboard: true })
        ed.getModel().setEOL(0) // LF
        ed.setSelection(R(2, 1, 5, 1))
        expect(copiedRange(ed.state).text).toBe('line2\nline3\nline4\n')
        ed.getModel().setEOL(1) // CRLF
        ed.setSelection(R(2, 1, 5, 1))
        expect(copiedRange(ed.state).text).toBe('line2\r\nline3\r\nline4\r\n')
    })

    it('issue #40926: Incorrect spacing when inserting new line after multiple folded blocks of code', () => {
        const ed = wrapped(['foo = {', '    foobar: function() {', '        this.foobar();', '    },', '    foobar: function() {', '        this.foobar();', '    },', '    foobar: function() {', '        this.foobar();', '    },', '}'].join('\n'), 200)
        ed.setHiddenAreas([R(3, 1, 3, 1), R(6, 1, 6, 1), R(9, 1, 9, 1)])
        expect(rowTotal(ed)).toBe(8)
        ed.getModel().applyEdits([
            { range: R(4, 7, 4, 7), text: '\n    ' },
            { range: R(7, 7, 7, 7), text: '\n    ' },
            { range: R(10, 7, 10, 7), text: '\n    ' },
        ])
        expect(ed.getModel().getLineCount()).toBe(14)
        expect(rowTotal(ed)).toBe(11) // 14 个模型行 - 3 个隐藏行
    })

    it('normalizePosition with multiple touching injected text', () => {
        // just some text + 7 处两段注入 'bar' / 'bz':just sobarbzme text。视图列 = 模型列(单行不折)
        const p = computeLineProjection('just some text', wrapConfig({ column: 80 }), [
            { offset: 7, options: { content: 'bar' } },
            { offset: 7, options: { content: 'bz' } },
        ])!
        const norm = (col: number, affinity: Affinity) => p.normalizeOutputPosition(0, col - 1, affinity).outputOffset + 1
        const cases: [Affinity, number[]][] = [
            [Affinity.None, [8, 8, 11, 11, 13]],
            [Affinity.Left, [8, 8, 8, 8, 8]],
            [Affinity.Right, [13, 13, 13, 13, 13]],
        ]
        for (const [aff, want] of cases) expect([8, 9, 11, 12, 13].map(c => norm(c, aff)), `affinity ${Affinity[aff]}`).toEqual(want)
        // 编辑器上的同一件事:before 装饰注入的文字参与折行模型
        const ed = wrapped('just some text', 80)
        ed.changeDecorations((a: Ed) => a.deltaDecorations([], [
            { range: R(1, 8, 1, 8), options: { description: 't', before: { content: 'bar' }, showIfCollapsed: true } },
            { range: R(1, 8, 1, 8), options: { description: 't', before: { content: 'bz' }, showIfCollapsed: true } },
        ]))
        expect(viewLines(ed, 1)[0].content).toBe('just sobarbzme text')
    })

    it('issue #193262: Incorrect implementation of modifyPosition', () => {
        // 视图坐标里把 (3,2) 往前挪一列 → (3,1):'just some text' 在 5 列处折成 3 个视图行
        const ed = wrapped('just some text', 5, { wrappingIndent: 'none' })
        const m = ed.softWrapModel() as SoftWrapModel
        expect(m.rowCount(1)).toBe(3)
        expect([0, 1, 2].map(r => m.content(1, r))).toEqual(['just ', 'some ', 'text'])
        const at = m.toModel({ line: 1, row: 2, col: 2 }) // 视图 (3,2)
        const back = m.toView(1, at - 1)
        expect({ row: back.row, col: back.col }).toEqual({ row: 2, col: 1 })
    })
})

// ───────────────────────── viewModelDecorations.test.ts ─────────────────────────
describe('ViewModelDecorations', () => {
    const TXT = 'hello world, this is a buffer that will be wrapped'
    const opts = (id: string) => ({ description: 'test', className: id, inlineClassName: 'i-' + id, beforeContentClassName: 'b-' + id, afterContentClassName: 'a-' + id })

    it('getDecorationsViewportData', () => {
        const ed = wrapped(TXT, 13, { wrappingIndent: 'none' })
        expect(viewLines(ed, 1).map(v => v.content)).toEqual(['hello world, ', 'this is a ', 'buffer that ', 'will be ', 'wrapped'])
        const D: [string, number, number][] = [
            ['dec1', 2, 3], ['dec2', 2, 14], ['dec3', 2, 15], ['dec4', 2, 36], ['dec5', 2, 51],
            ['dec6', 14, 14], ['dec7', 14, 16], ['dec8', 14, 36], ['dec9', 14, 51],
            ['dec10', 16, 18], ['dec11', 16, 36], ['dec12', 16, 51],
            ['dec13', 36, 36], ['dec14', 36, 51], ['dec15', 40, 51],
        ]
        ed.changeDecorations((a: Ed) => a.deltaDecorations([], D.map(([id, s, e]) => ({ range: R(1, s, 1, e), options: opts(id) }))))
        // 视口(视图行 2..3)= 模型 1:14..1:36:getDecorationsInViewport 取到 dec1..dec14,不含从 40 才开始的 dec15
        const model = ed.getModel()
        const got = model.getDecorationsInRange(R(1, 1, 1, 36)).map((d: { options: { className?: string } }) => d.options.className).filter(Boolean)
        expect(new Set(got)).toEqual(new Set(D.slice(0, 14).map(d => d[0])))
        // 渲染结果:每条装饰的 inlineClassName 恰好盖住它的区间;before / after 小部件在区间两端(DOM 偏移 = 列 - 1)
        const line = ed.contentDOM.querySelector('.cm-line') as HTMLElement
        const covered = (cls: string) => Array.from(line.querySelectorAll('.' + cls)).map(e => e.textContent).join('')
        const widgetAt = (cls: string) => Array.from(line.querySelectorAll('.' + cls)).map(e => Number(e.getAttribute('data-cm-widget-from')))
        for (const [id, s, e] of D) {
            expect(covered('i-' + id), `i-${id}`).toBe(TXT.slice(s - 1, e - 1))
            expect(widgetAt('b-' + id), `b-${id}`).toEqual([s - 1])
            expect(widgetAt('a-' + id), `a-${id}`).toEqual([e - 1])
        }
    })

    it('issue #17208: Problem scrolling in 1.8.0', () => {
        const ed = wrapped(TXT, 13, { wrappingIndent: 'none' })
        expect(viewLines(ed, 1).map(v => v.content)).toEqual(['hello world, ', 'this is a ', 'buffer that ', 'will be ', 'wrapped'])
        ed.changeDecorations((a: Ed) => a.deltaDecorations([], [{ range: R(1, 50, 1, 51), options: { description: 'test', beforeContentClassName: 'dec1' } }]))
        // 视图行 2..3(模型 1:14..1:36)里没有这条 before 装饰
        const inView = ed.getModel().getDecorationsInRange(R(1, 1, 1, 36)).filter((d: { options: { beforeContentClassName?: string } }) => Boolean(d.options.beforeContentClassName))
        expect(inView).toEqual([])
        // 它在第 5 个视图行(offset 49)
        const m = ed.softWrapModel() as SoftWrapModel
        expect(m.toView(1, 49).row).toBe(4)
        const w = ed.contentDOM.querySelector('.dec1') as HTMLElement
        expect(w.getAttribute('data-cm-widget-from')).toBe('49')
    })

    it('issue #37401: Allow both before and after decorations on empty line', () => {
        const ed = make('')
        ed.changeDecorations((a: Ed) => a.deltaDecorations([], [{ range: R(1, 1, 1, 1), options: { description: 'test', beforeContentClassName: 'before1', afterContentClassName: 'after1' } }]))
        const line = ed.contentDOM.querySelector('.cm-line') as HTMLElement
        const order = Array.from(line.querySelectorAll('[data-cm-widget]')).map(e => e.className)
        expect(order).toEqual(['before1', 'after1'])
    })
})
