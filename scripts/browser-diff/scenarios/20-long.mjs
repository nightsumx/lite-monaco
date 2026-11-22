import { lines, snapAll } from './_util.mjs'
const veryLong = 'abcdefghij'.repeat(1000)
export default [
    { name: 'line-10k-chars', create: { value: veryLong + '\nshort' }, steps: [{ do: 'snap', label: 'a', spec: { positions: [[1, 1], [1, 100], [1, 5000], [1, 10001]], lines: 'all' } }, { do: 'eval', code: 'editor.setScrollLeft(1e9)' }, { do: 'snap', label: 'right', spec: { positions: [[1, 10001]] } }] },
    { name: 'line-10k-wrap', create: { value: veryLong + '\nshort', options: { wordWrap: 'on' } }, steps: [snapAll('a', { positions: [[1, 5000], [1, 10001]] })] },
    { name: 'many-lines-5000', create: { value: lines(5000, i => 'line number ' + i) }, steps: [snapAll('a', {}), { do: 'eval', code: 'editor.setScrollTop(1e9)' }, { do: 'snap', label: 'bottom', spec: { geometry: true } }, { do: 'eval', code: 'editor.revealLineInCenter(2500)' }, { do: 'snap', label: 'mid' }] },
    { name: 'scrollBeyondLastLine-off', create: { value: lines(100, i => 'l' + i), options: { scrollBeyondLastLine: false } }, steps: [{ do: 'eval', code: 'editor.setScrollTop(1e9)' }, { do: 'snap', label: 'a' }] },
    { name: 'padding', create: { value: lines(100, i => 'l' + i), options: { padding: { top: 10, bottom: 30 } } }, steps: [{ do: 'snap', label: 'a', spec: { lines: [1, 2, 100] } }, { do: 'eval', code: 'editor.setScrollTop(1e9)' }, { do: 'snap', label: 'b' }] },
    { name: 'scrollbar-sizes', create: { value: lines(100, i => 'l'.repeat(i * 5)), options: { scrollbar: { verticalScrollbarSize: 20, horizontalScrollbarSize: 18 } } }, steps: [{ do: 'snap', label: 'a' }] },
    { name: 'scrollbar-hidden', create: { value: lines(100, i => 'l'.repeat(i * 5)), options: { scrollbar: { vertical: 'hidden', horizontal: 'hidden' } } }, steps: [{ do: 'snap', label: 'a' }] },
    { name: 'scrollBeyondLastColumn-0', create: { value: 'x'.repeat(200), options: { scrollBeyondLastColumn: 0 } }, steps: [{ do: 'snap', label: 'a' }] },
    { name: 'scrollBeyondLastColumn-20', create: { value: 'x'.repeat(200), options: { scrollBeyondLastColumn: 20 } }, steps: [{ do: 'snap', label: 'a' }] },
]
