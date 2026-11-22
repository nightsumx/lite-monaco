const text = 'hello world\n\tindented line\n' + 'long '.repeat(40) + '\n中文字符和emoji😀混合\nlast'
export default [
    { name: 'plain-geometry', create: { value: text }, steps: [{ do: 'snap', label: 'a', spec: { lines: 'all', rows: 'all', positions: [[1, 1], [1, 6], [2, 2], [4, 3]] } }] },
    { name: 'wrap-on', create: { value: text, options: { wordWrap: 'on' } }, steps: [{ do: 'snap', label: 'a', spec: { lines: 'all', rows: 'all', domBreaks: true } }] },
]
