import { lines } from './_util.mjs'
// 10k / 50k 行:全选、扩选、滚动后再全选的耗时(setSelection + 强制布局 + 下一帧)
const code = `
const out = {}
const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
const n = editor.getModel().getLineCount()
const host = editor.getDomNode()
const t = async (name, f) => { await frame(); const a = performance.now(); f(); host.getBoundingClientRect(); host.querySelector('.view-lines, .cm-content').getBoundingClientRect(); out[name] = Math.round((performance.now() - a) * 10) / 10 }
await t('selectAll', () => editor.setSelection(new monaco.Selection(1, 1, n, 20)))
await t('selectAll2', () => editor.setSelection(new monaco.Selection(1, 1, n - 1, 20)))
await t('shrink', () => editor.setSelection(new monaco.Selection(1, 1, 5, 3)))
await t('extend', () => editor.setSelection(new monaco.Selection(1, 1, n, 3)))
editor.setScrollTop(5000); await frame()
await t('afterScroll', () => editor.setSelection(new monaco.Selection(2, 1, n, 7)))
return out`
export default [10000, 50000].map(n => ({ name: 'perf-' + n, create: { value: lines(n, i => 'line ' + i + ' ' + 'abcdef '.repeat(i % 7)) }, steps: [{ do: 'eval', code, label: 'perf' }] }))
