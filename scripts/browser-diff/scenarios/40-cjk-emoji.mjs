const P = (l, n) => Array.from({ length: n }, (_, i) => [l, i + 1])
const S = (name, text, n = 12) => ({ name, create: { value: text }, steps: [{ do: 'snap', label: 'a', spec: { positions: P(1, n), cursor: false } }] })
export default [
    S('cjk', '中文字符測試ABC日本語한국어'),
    S('emoji', 'a😀b👨‍👩‍👧c🇨🇳d❤️e'),
    S('combining', 'éạ̀ ñ'),
    S('rtl', 'abc שלום עולם مرحبا def'),
    S('fullwidth-latin', 'ＡＢＣ１２３ｘｙｚ'),
    S('mixed-tab', 'a\t中\t😀\tb'),
    S('zwj-flags', '🏳️‍🌈🇯🇵🇰🇷'),
    S('math', '𝒜𝓑𝓒 𝔸𝔹ℂ'),
    { name: 'rtl-cursor-keys', create: { value: 'abc שלום עולם مرحبا def\nxyz' }, steps: [{ do: 'keys', keys: ['ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'Shift+ArrowRight', 'Shift+ArrowRight', 'Shift+ArrowRight'] }, { do: 'snap', label: 'a', spec: { positions: [[1, 5], [1, 9]], selRects: { monaco: '.selected-text', lite: '.cm-selectedText' } } }, { do: 'keys', keys: ['End', 'Shift+Home', 'ArrowDown'] }, { do: 'snap', label: 'b', spec: { positions: [[1, 5]] } }] },
    { name: 'cjk-cursor-keys', create: { value: '中文😀éx' }, steps: [{ do: 'keys', keys: ['End', 'ArrowLeft', 'ArrowLeft', 'ArrowLeft', 'Shift+ArrowLeft', 'Shift+ArrowLeft'] }, { do: 'snap', label: 'a', spec: { positions: [[1, 1], [1, 5]] } }] },
    { name: 'cjk-wrap', create: { value: '中文字符'.repeat(100), options: { wordWrap: 'on' }, width: 600 }, steps: [{ do: 'snap', label: 'a', spec: { rows: 'all', domBreaks: true } }] },
]
