export const words = (n, w = 'lorem ipsum dolor sit amet') => Array.from({ length: n }, (_, i) => w.split(' ')[i % w.split(' ').length]).join(' ')
export const lines = (n, f) => Array.from({ length: n }, (_, i) => f(i + 1)).join('\n')
export const code = lines(40, i => i % 5 === 0 ? `function f${i}() {` : i % 5 === 4 ? '}' : `    const v${i} = ${i} * 2 // comment ${words(i % 4 + 1)}`)
export const snapAll = (label, extra = {}) => ({ do: 'snap', label, spec: { lines: 'all', rows: 'all', ...extra } })
