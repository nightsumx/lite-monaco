import { words, lines } from './_util.mjs'
const K = (name, create, steps, spec = {}) => ({ name, create, steps: [...steps, { do: 'snap', label: 'end', spec: { geometry: false, cursorRect: true, selRects: true, ...spec } }] })
const para = lines(4, i => words(i * 20 + 10))
const code = 'function a() {\n    if (x) {\n        y()\n    }\n}\n'
const mod = process.platform === 'darwin' ? 'Meta' : 'Control'
const alt = 'Alt'
export default [
    K('type-brackets-quotes', { value: '' }, [{ do: 'type', text: 'f(a, [1, {b: "x"}]) \'q' }]),
    K('enter-autoindent', { value: code, language: 'plaintext' }, [{ do: 'keys', keys: [`${mod}+ArrowDown`, 'ArrowUp', 'ArrowUp', 'End', 'Enter'] }, { do: 'type', text: 'z' }]),
    K('tab-shift-tab', { value: 'a\nb\nc' }, [{ do: 'keys', keys: [`${mod}+a`, 'Tab', 'Tab', 'Shift+Tab'] }]),
    K('backspace-indent', { value: '        x' }, [{ do: 'keys', keys: ['Home', 'Home', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'Backspace', 'Backspace'] }]),
    K('smart-home', { value: '    indented text' }, [{ do: 'keys', keys: ['End', 'Home'] }, { do: 'snap', label: 'h1', spec: { geometry: false } }, { do: 'keys', keys: ['Home'] }]),
    K('word-nav', { value: 'foo_bar baz.qux  CamelCaseWord 中文字 x' }, [{ do: 'keys', keys: [`${alt}+ArrowRight`, `${alt}+ArrowRight`, `${alt}+ArrowRight`, `${alt}+ArrowRight`, `${alt}+ArrowRight`, `${alt}+Shift+ArrowLeft`, `${alt}+Backspace`] }]),
    K('line-nav', { value: lines(5, i => 'line ' + i + ' ' + 'x'.repeat(i * 3)) }, [{ do: 'keys', keys: [`${mod}+ArrowDown`, `${mod}+ArrowUp`, 'ArrowDown', 'ArrowDown', `${mod}+ArrowRight`, 'ArrowUp', 'ArrowUp', `${mod}+ArrowLeft`] }]),
    K('sticky-column', { value: 'long line here ok\nx\nlong line here ok' }, [{ do: 'keys', keys: ['ArrowDown', 'End', 'ArrowDown', 'ArrowDown', 'ArrowUp'] }]),
    K('wrap-updown', { value: para, options: { wordWrap: 'on' }, width: 400 }, [{ do: 'keys', keys: ['ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowUp'] }]),
    K('wrap-home-end', { value: para, options: { wordWrap: 'on' }, width: 400 }, [{ do: 'keys', keys: ['ArrowDown', 'ArrowDown', 'End', 'Home', 'Home', 'End', 'End'] }]),
    K('wrap-shift-select', { value: para, options: { wordWrap: 'on' }, width: 400 }, [{ do: 'keys', keys: ['ArrowDown', 'Shift+ArrowDown', 'Shift+ArrowDown', 'Shift+End', 'Shift+ArrowRight'] }]),
    K('pagedown-pageup', { value: lines(200, i => 'line ' + i) }, [{ do: 'keys', keys: ['PageDown', 'PageDown', 'PageUp'] }], { geometry: true }),
    K('select-all-delete', { value: 'abc\ndef' }, [{ do: 'keys', keys: [`${mod}+a`, 'Backspace'] }]),
    K('undo-redo', { value: 'one' }, [{ do: 'type', text: ' two three' }, { do: 'keys', keys: [`${mod}+z`] }, { do: 'snap', label: 'u1', spec: { geometry: false } }, { do: 'keys', keys: [`${mod}+Shift+z`] }]),
    K('move-copy-line', { value: 'a\nb\nc\nd' }, [{ do: 'keys', keys: [`${alt}+ArrowDown`, `${alt}+ArrowDown`, `${alt}+ArrowUp`, `${alt}+Shift+ArrowDown`] }]),
    K('delete-line-insert-line', { value: 'a\nb\nc\nd' }, [{ do: 'keys', keys: ['ArrowDown', `${mod}+Shift+k`, `${mod}+Enter`, `${mod}+Shift+Enter`] }]),
    K('add-cursor-below', { value: 'aaa\nbbb\nccc\nddd' }, [{ do: 'keys', keys: [`${mod}+${alt}+ArrowDown`, `${mod}+${alt}+ArrowDown`] }, { do: 'type', text: 'X' }]),
    K('select-next-occurrence', { value: 'foo bar foo baz foo' }, [{ do: 'keys', keys: [`${alt}+ArrowRight`.replace('Alt+ArrowRight', 'Home'), 'Shift+ArrowRight', 'Shift+ArrowRight', 'Shift+ArrowRight', `${mod}+d`, `${mod}+d`] }]),
    K('type-over-selection-multi', { value: 'a1\na2\na3' }, [{ do: 'keys', keys: [`${mod}+${alt}+ArrowDown`, `${mod}+${alt}+ArrowDown`, 'End', 'Shift+ArrowLeft'] }, { do: 'type', text: 'Z' }]),
    K('cut-copy-paste-line-empty-sel', { value: 'one\ntwo\nthree' }, [{ do: 'keys', keys: ['ArrowDown', `${mod}+x`, 'ArrowDown', `${mod}+v`] }]),
    K('paste-multiline', { value: 'a\n    b' }, [{ do: 'keys', keys: ['ArrowDown', 'End'] }, { do: 'paste', text: 'x\n  y\nz' }]),
    K('paste-in-brackets', { value: '()' }, [{ do: 'keys', keys: ['ArrowRight'] }, { do: 'paste', text: 'one\ntwo' }]),
    K('transpose-upper', { value: 'abcd efgh' }, [{ do: 'keys', keys: ['Home', 'ArrowRight', 'ArrowRight', 'Control+t', 'Shift+End'] }]),
    K('find-widget', { value: 'foo bar foo\nfoo baz' }, [{ do: 'keys', keys: [`${mod}+f`] }, { do: 'type', text: 'foo' }, { do: 'keys', keys: ['Enter', 'Enter'] }, { do: 'snap', label: 'f', spec: { geometry: false, count: { findWidget: { monaco: '.find-widget.visible', lite: '.cm-find-panel, .cm-find-widget, [class*=find-widget]' } } } }, { do: 'keys', keys: ['Escape'] }]),
    K('goto-line-f1', { value: lines(30, i => 'l' + i) }, [{ do: 'keys', keys: ['Control+g'] }, { do: 'type', text: '12' }, { do: 'keys', keys: ['Enter'] }], { geometry: true }),
    K('ime-compose', { value: 'ab' }, [{ do: 'keys', keys: ['End'] }, { do: 'ime', steps: ['n', 'ni', 'nih', 'niha', 'nihao'], commit: '你好', snapMid: 'mid', spec: { geometry: false, cursorRect: true } }]),
    K('ime-compose-in-middle-wrapped', { value: lines(2, i => words(i * 20 + 12)), options: { wordWrap: 'on' }, width: 400 }, [{ do: 'keys', keys: ['ArrowDown', 'End'] }, { do: 'ime', steps: ['z', 'zh', 'zho', 'zhon'], commit: '中', snapMid: 'mid', spec: { geometry: false, cursorRect: true } }]),
    K('readonly-typing', { value: 'ro', options: { readOnly: true } }, [{ do: 'type', text: 'zzz' }, { do: 'keys', keys: ['Backspace'] }]),
]
