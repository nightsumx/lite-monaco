// 字素簇边界:ZWJ、国旗、肤色、组合符、代理对、韩文 jamo、天城文、泰文 —— 方向键、Shift+方向键、Backspace/Delete、Alt+方向键、getOffsetForColumn、光标框
import { trace, S0 } from './_trace.mjs'
const P = (l, n) => Array.from({ length: n }, (_, i) => [l, i + 1])
const FAM = '👨‍👩‍👧', FLAG = '🇨🇳', SKIN = '👍🏽', HEART = '❤️', KEYCAP = '1️⃣'
const COMB = 'éạ̀x', HANGUL = '한' + '한', DEV = 'क्षि हिन्दी', THAI = 'สวัสดี', SUR = '𝒜𝒷😀𠮷'
const Rn = n => Array(n).fill('ArrowRight'), Ln = n => Array(n).fill('ArrowLeft')
const offs = n => ({ do: 'eval', label: 'o', code: `return Array.from({length: ${n}}, (_, i) => [editor.getOffsetForColumn(1, i+1), editor.getScrolledVisiblePosition({lineNumber:1,column:i+1}).left])` })
const cases = [
    ['zwj', 'a' + FAM + 'b' + FLAG + 'c' + SKIN + 'd' + HEART + 'e' + KEYCAP + 'f'],
    ['comb', COMB + ' ' + 'ñ'],
    ['hangul', HANGUL + ' ' + '각'],
    ['devanagari', DEV],
    ['thai', THAI],
    ['surrogate', SUR],
]
export default [
    ...cases.flatMap(([n, v]) => [
        trace(`right-${n}`, { value: v }, Rn(v.length + 1)),
        trace(`left-${n}`, { value: v }, ['End', ...Ln(v.length + 1)]),
        trace(`shift-${n}`, { value: v }, [...Array(4).fill('Shift+ArrowRight'), 'Shift+ArrowLeft', 'Shift+End', 'Shift+Home']),
        trace(`bksp-${n}`, { value: v }, ['End', 'Backspace', 'Backspace', 'Backspace', 'ArrowLeft', 'Backspace']),
        trace(`del-${n}`, { value: v }, ['Delete', 'Delete', 'ArrowRight', 'Delete', 'Delete']),
        trace(`word-${n}`, { value: v }, ['Alt+ArrowRight', 'Alt+ArrowRight', 'Alt+ArrowLeft', 'Alt+Shift+ArrowRight', 'Alt+Backspace']),
        { name: `offset-${n}`, create: { value: v }, steps: [offs(v.length + 1), { do: 'snap', label: 'g', spec: { positions: P(1, v.length + 1), cursor: false, glyphs: [1] } }] },
    ]),
    { name: 'click-inside-zwj', create: { value: 'a' + FAM + 'b' }, steps: [{ do: 'click', at: [1, 4], count: 1 }, { do: 'snap', label: 'a', spec: S0 }, { do: 'click', at: [1, 6], count: 1 }, { do: 'snap', label: 'b', spec: S0 }, { do: 'click', at: [1, 3], count: 2 }, { do: 'snap', label: 'c', spec: S0 }] },
    { name: 'drag-over-flag', create: { value: 'x' + FLAG + FLAG + 'y' }, steps: [{ do: 'drag', from: [1, 3], to: [1, 6] }, { do: 'snap', label: 'a', spec: S0 }] },
    trace('type-over-cluster', { value: 'a' + FAM + 'b' }, ['ArrowRight', 'Shift+ArrowRight', ['type', 'Z'], 'ArrowLeft', ['insertText', '́']]),
]
