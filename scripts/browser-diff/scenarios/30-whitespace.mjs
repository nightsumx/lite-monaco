import { lines } from './_util.mjs'
const ws = 'a\tb  c   \n\t\tindented\t\n    spaces  trailing   \n nbsp​zwsp\u0001ctl\n'
const P = [[1, 2], [1, 3], [1, 4], [1, 7], [2, 3], [3, 5], [4, 3], [4, 6]]
const R = (name, options, value = ws) => ({ name, create: { value, options }, steps: [{ do: 'snap', label: 'a', spec: { positions: P, rows: 'all' } }] })
export default [
    R('default', {}),
    R('render-all', { renderWhitespace: 'all' }),
    R('render-boundary', { renderWhitespace: 'boundary' }),
    R('render-trailing', { renderWhitespace: 'trailing' }),
    R('tabSize-2', { tabSize: 2 }), R('tabSize-8', { tabSize: 8 }),
    R('controlChars', { renderControlCharacters: true }),
    R('control-off', { renderControlCharacters: false }),
    R('unicodeHighlight', { unicodeHighlight: { invisibleCharacters: true, ambiguousCharacters: true, nonBasicASCII: true } }),
    R('letterSpacing-2', { letterSpacing: 2 }),
    R('fontSize-20', { fontSize: 20, lineHeight: 0 }),
    R('fontSize-11-lh-auto', { fontSize: 11, lineHeight: 0 }),
    R('lineHeight-28', { lineHeight: 28 }),
    R('fontFamily-serif', { fontFamily: 'Georgia, serif' }),
    R('fontWeight-bold', { fontWeight: 'bold' }),
    R('indent-guides', {}, lines(10, i => '    '.repeat(i % 4) + 'x')),
    {
        name: 'guides-count', create: { value: lines(10, i => '    '.repeat(i % 4) + 'x') },
        steps: [{ do: 'snap', label: 'a', spec: { geometry: false, count: { guides: { monaco: '.core-guide-indent', lite: '.cm-indentGuide, .cm-activeIndentGuide, [class*=indent-guide]' } } } }],
    },
]
