// 不折行时 scroll.width / content.width 的机制:Monaco 的 maxLineWidth 只来自「渲染过的行」(高水位,滚到才涨);
// lite 额外给没渲染的行一个「字数 × 字宽」的下界(横向滚动条不随竖向滚动漂)。
// start:还没滚过 → 两边按设计不同(known.mjs 里写了成因);walked:每一行都渲染过之后 → 两边必须一致(没有 known 规则,有差异就是未分类)。
import { lines } from './_util.mjs'
// 每停一步等 300ms:Monaco 对「慢路径」的行(超过 300 字符、比例字体)是 200ms 的 RunOnceScheduler 之后才量,滚得太快那些行不计
const walk = `
  const raf = () => new Promise(r => requestAnimationFrame(() => r())).then(() => new Promise(r => setTimeout(r, 300)))
  const sh = editor.getScrollHeight(), vh = editor.getLayoutInfo().height
  for (let t = 0; t < sh; t += Math.max(20, vh - 40)) { editor.setScrollTop(t); await raf(); await raf() }
  editor.setScrollTop(sh); await raf(); await raf()
  editor.setScrollTop(0); await raf(); await raf()
`
const W = (name, create) => ({
    name, create,
    steps: [
        { do: 'snap', label: 'start', spec: { lines: [1], positions: [] } },
        { do: 'eval', code: walk },
        { do: 'snap', label: 'walked', spec: { lines: [1], positions: [] } },
    ],
})
const inc = lines(40, i => 'line ' + i + ' ' + 'x'.repeat(i * 3))
export default [
    W('40-lines', { value: inc }),
    W('widest-in-middle-600', { value: lines(600, i => 'l' + i + (i === 300 ? ' ' + 'y'.repeat(500) : '')) }),
    W('fontSize-8', { value: inc, options: { fontSize: 8, lineHeight: 0 } }),
    W('fontSize-30', { value: inc, options: { fontSize: 30, lineHeight: 0 } }),
    W('minimap', { value: inc, options: { minimap: { enabled: true } } }),
    W('lineNumbers-off', { value: inc, options: { lineNumbers: 'off' } }),
    W('glyphMargin', { value: inc, options: { glyphMargin: true } }),
    W('folding-off', { value: inc, options: { folding: false } }),
    W('fontFamily-serif', { value: inc, options: { fontFamily: 'Georgia, serif' } }),
    W('tabSize-8', { value: lines(30, i => (i % 3 ? '\t\tx' + i + '\t' : 'a'.repeat(i))), options: { tabSize: 8 } }),
    W('padding', { value: lines(100, i => 'l' + i), options: { padding: { top: 10, bottom: 30 } } }),
    W('many-lines-400', { value: lines(400, i => 'line number ' + i) }),
    W('scrollbar-sizes', { value: lines(100, i => 'l'.repeat(i * 5)), options: { scrollbar: { verticalScrollbarSize: 20, horizontalScrollbarSize: 18 } } }),
]
