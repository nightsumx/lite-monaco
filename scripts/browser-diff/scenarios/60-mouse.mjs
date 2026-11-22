import { words, lines } from './_util.mjs'
const M = (name, create, steps, spec = {}) => ({ name, create, steps: [...steps, { do: 'snap', label: 'end', spec: { geometry: false, cursorRect: true, selRects: true, ...spec } }] })
const t = 'hello world foo_bar\n  second line here\n\nlast line with 中文 chars'
export default [
    M('click-mid', { value: t }, [{ do: 'click', at: [1, 8] }]),
    M('click-past-eol', { value: t }, [{ do: 'eval', code: 'H._x = 1' }, { do: 'click', at: [2, 19] }]),
    M('click-empty-line', { value: t }, [{ do: 'click', at: [3, 1] }]),
    M('dblclick-word', { value: t }, [{ do: 'click', at: [1, 15], count: 2 }]),
    M('tripleclick-line', { value: t }, [{ do: 'click', at: [2, 5], count: 3 }]),
    M('drag-select', { value: t }, [{ do: 'drag', from: [1, 3], to: [2, 8] }]),
    M('drag-select-up', { value: t }, [{ do: 'drag', from: [4, 10], to: [1, 2] }]),
    M('drag-wrapped', { value: lines(3, i => words(i * 20 + 10)), options: { wordWrap: 'on' }, width: 400 }, [{ do: 'drag', from: [1, 5], to: [2, 40] }]),
    M('click-cjk-boundary', { value: t }, [{ do: 'click', at: [4, 22] }]),
    M('shift-click-extend', { value: t }, [{ do: 'click', at: [1, 3] }, { do: 'eval', code: 'await H.shiftClick?.()' }]),
    M('gutter-click-select-line', { value: t }, [{ do: 'eval', code: 'const b = document.getElementById("editor-container").getBoundingClientRect(); const p = editor.getScrolledVisiblePosition({lineNumber:2,column:1}); H._gutter = { x: b.left + 20, y: b.top + p.top + 10 }; return H._gutter' }]),
    M('wheel-scroll', { value: lines(200, i => 'line ' + i) }, [{ do: 'wheel', dy: 120 }, { do: 'wheel', dy: 300 }, { do: 'wheel', dy: -80 }], { geometry: true }),
    M('wheel-horizontal', { value: lines(5, i => 'x'.repeat(300 * i)) }, [{ do: 'wheel', dx: 200 }, { do: 'wheel', dx: -50 }], { geometry: true }),
    M('wheel-fast-sensitivity', { value: lines(300, i => 'line ' + i), options: { mouseWheelScrollSensitivity: 3 } }, [{ do: 'wheel', dy: 100 }], { geometry: true }),
    M('wheel-smooth-off', { value: lines(300, i => 'line ' + i), options: { smoothScrolling: false } }, [{ do: 'wheel', dy: 100 }], { geometry: true }),
]
