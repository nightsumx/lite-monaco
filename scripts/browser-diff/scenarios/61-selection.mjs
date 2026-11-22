// 选区框(Monaco SelectionsOverlay):整行高、每个视觉行一块;折行 / 多行 / 空行 / CJK / emoji / view zone / 多光标 / 列选 / 大文件全选
import { lines, words } from './_util.mjs'
const S = (name, create, sels, spec = {}, pre = []) => ({
    name, create,
    steps: [...pre, { do: 'eval', code: `editor.setSelections(${JSON.stringify(sels)}.map(s => new monaco.Selection(...s)))` }, { do: 'wait', ms: 80 }, { do: 'snap', label: 'a', spec: { geometry: false, cursor: false, value: false, selRects: true, selHeights: true, ...spec } }],
})
const wrapText = lines(4, i => words(30 + i * 3))
export default [
    S('single-line', { value: 'hello world foo bar' }, [[1, 3, 1, 12]]),
    S('multi-line', { value: lines(8, i => 'line number ' + i + ' with text') }, [[2, 4, 6, 9]]),
    S('multi-line-short-tail', { value: 'a long first line here\nx\nlonger third line' }, [[1, 5, 3, 4]]),
    S('empty-lines', { value: 'abc\n\n\ndef\n\nghi' }, [[1, 2, 6, 2]]),
    S('empty-line-only', { value: 'abc\n\ndef' }, [[2, 1, 3, 1]]),
    S('select-all', { value: lines(12, i => 'row ' + i + ' ' + 'x'.repeat(i * 3)) }, [[1, 1, 12, 40]]),
    S('wrap-within-line', { value: wrapText, options: { wordWrap: 'on' }, width: 500 }, [[1, 20, 1, 150]]),
    S('wrap-multi-line', { value: wrapText, options: { wordWrap: 'on' }, width: 500 }, [[1, 30, 3, 80]]),
    S('wrap-select-all', { value: wrapText, options: { wordWrap: 'on' }, width: 500 }, [[1, 1, 4, 400]]),
    S('cjk', { value: '中文字符測試ABC日本語한국어\n第二行中文' }, [[1, 3, 2, 4]]),
    S('emoji', { value: 'a😀b👨‍👩‍👧c🇨🇳d❤️e\nsecond' }, [[1, 2, 2, 4]]),
    S('rtl', { value: 'abc שלום עולם مرحبا def\nxyz' }, [[1, 6, 1, 9]]),
    S('rtl-multi-line', { value: 'abc שלום עולם مرحبا def\nxyz' }, [[1, 6, 2, 3]]),
    S('tabs', { value: 'a\tb\tc\n\t\tindented' }, [[1, 2, 2, 3]]),
    S('multi-cursor', { value: lines(8, i => 'line number ' + i + ' with text') }, [[1, 3, 1, 8], [3, 1, 4, 6], [6, 5, 6, 12]]),
    S('multi-cursor-adjacent-lines', { value: lines(8, i => 'line number ' + i + ' with text') }, [[2, 3, 2, 8], [3, 5, 3, 14], [4, 2, 4, 6]]),
    S('column-select', { value: lines(8, i => 'line number ' + i + ' with text') }, [[2, 5, 2, 10], [3, 5, 3, 10], [4, 5, 4, 10], [5, 5, 5, 10]]),
    S('view-zone', { value: lines(10, i => 'line number ' + i + ' with text') }, [[2, 3, 6, 6]], {}, [{ do: 'eval', code: 'editor.changeViewZones(a => { const d = document.createElement("div"); a.addZone({ afterLineNumber: 3, heightInPx: 60, domNode: d }) })' }]),
    S('big-select-all-10k', { value: lines(10000, i => 'line ' + i + ' ' + 'abcdef '.repeat(i % 7)) }, [[1, 1, 10000, 20]]),
    S('big-select-middle-10k', { value: lines(10000, i => 'line ' + i + ' ' + 'abcdef '.repeat(i % 7)) }, [[100, 3, 9000, 5]]),
]
