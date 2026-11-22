import { lines } from './_util.mjs'
const css = "const s = document.createElement('style'); s.textContent = '.d-inline{background:#fa0}.d-class{background:#0af}.d-whole{background:#afa}.d-glyph{background:red;width:10px!important;height:10px!important;margin-left:3px}.d-lines{background:#a0a;width:4px!important;margin-left:3px}.d-before::before{content:\"<<\";color:#a0a}.d-after::after{content:\">>\";color:#0a0}.d-marg{background:#eee}.d-inj{background:#cfc}'; document.head.appendChild(s);"
const D = (name, decs, extra = {}, create = {}) => ({
    name, create: { value: lines(8, i => 'line number ' + i + ' with text'), ...create },
    steps: [{ do: 'eval', code: css + `editor.createDecorationsCollection(${JSON.stringify(decs)}.map(d => ({ range: new monaco.Range(...d.r), options: d.o })))` }, { do: 'snap', label: 'a', spec: { geometry: false, cursor: false, value: false, rects: extra.rects, count: extra.count, positions: extra.positions } }],
})
const R = { monaco: '.d-inline, .d-class, .d-whole', lite: '.d-inline, .d-class, .d-whole' }
export default [
    D('inline-class', [{ r: [2, 6, 2, 12], o: { inlineClassName: 'd-inline' } }], { rects: R }),
    D('class-range', [{ r: [3, 3, 3, 10], o: { className: 'd-class' } }], { rects: { monaco: '.d-class', lite: '.d-class' } }),
    D('class-multiline', [{ r: [2, 5, 4, 8], o: { className: 'd-class' } }], { rects: { monaco: '.d-class', lite: '.d-class' } }),
    D('whole-line', [{ r: [2, 1, 3, 1], o: { isWholeLine: true, className: 'd-whole' } }], { rects: { monaco: '.d-whole', lite: '.d-whole' } }),
    D('before-after', [{ r: [2, 6, 2, 12], o: { beforeContentClassName: 'd-before', afterContentClassName: 'd-after' } }], { positions: [[2, 5], [2, 6], [2, 12], [2, 13]] }),
    D('glyph-margin', [{ r: [2, 1, 2, 1], o: { glyphMarginClassName: 'd-glyph' } }], { rects: { monaco: '.d-glyph', lite: '.d-glyph' } }, { options: { glyphMargin: true } }),
    D('lines-decoration', [{ r: [2, 1, 4, 1], o: { linesDecorationsClassName: 'd-lines' } }], { rects: { monaco: '.d-lines', lite: '.d-lines' } }),
    D('margin-class', [{ r: [2, 1, 3, 1], o: { marginClassName: 'd-marg', isWholeLine: true } }], { rects: { monaco: '.d-marg', lite: '.d-marg' } }),
    D('overview-ruler', [{ r: [3, 1, 3, 5], o: { overviewRuler: { color: 'red', position: monaco => 4 } } }], {}),
    D('injected-text', [{ r: [2, 6, 2, 6], o: { after: { content: ' [hint] ', inlineClassName: 'd-inj' } } }], { positions: [[2, 5], [2, 6], [2, 7]] }),
    D('injected-text-collapsed-shown', [{ r: [2, 6, 2, 6], o: { showIfCollapsed: true, after: { content: ' [hint] ', inlineClassName: 'd-inj' } } }], { positions: [[2, 5], [2, 6], [2, 7]] }),
    D('injected-text-range', [{ r: [2, 6, 2, 7], o: { after: { content: ' [hint] ', inlineClassName: 'd-inj' } } }], { positions: [[2, 5], [2, 6], [2, 7], [2, 8]] }),
    D('empty-range-showIfCollapsed', [{ r: [2, 5, 2, 5], o: { className: 'd-class', showIfCollapsed: true } }], { rects: { monaco: '.d-class', lite: '.d-class' } }),
    D('selection-highlight-dup', [], { count: { occ: { monaco: '.selectionHighlight', lite: '.cm-selectionMatch, .cm-selectionMatchBox, [class*=selectionHighlight]' } } }),
    {
        name: 'word-highlight-and-selection-match', create: { value: 'foo bar foo baz foo' },
        steps: [{ do: 'eval', code: 'editor.setSelection(new monaco.Range(1,1,1,4))' }, { do: 'wait', ms: 600 }, { do: 'snap', label: 'a', spec: { geometry: false, count: { selHighlight: { monaco: '.selectionHighlight', lite: '.cm-selectionMatch, .cm-selectionMatchBox, [class*=selectionHighlight]' } } } }],
    },
    {
        name: 'bracket-match-highlight', create: { value: 'f(a, [1, {b}])' },
        steps: [{ do: 'eval', code: 'editor.setPosition({lineNumber:1,column:3})' }, { do: 'wait', ms: 300 }, { do: 'snap', label: 'a', spec: { geometry: false, count: { match: { monaco: '.bracket-match', lite: '.cm-bracketBox' } } } }],
    },
    {
        name: 'content-widget', create: { value: lines(5, i => 'line ' + i) },
        steps: [{ do: 'eval', code: 'const n = document.createElement("div"); n.className = "cw"; n.textContent = "W"; n.style.background = "#ff0"; editor.addContentWidget({ getId: () => "cw", getDomNode: () => n, getPosition: () => ({ position: { lineNumber: 2, column: 4 }, preference: [monaco.editor.ContentWidgetPositionPreference.EXACT] }) })' }, { do: 'snap', label: 'a', spec: { geometry: false, cursor: false, value: false, rects: { monaco: '.cw', lite: '.cw' } } }],
    },
    {
        name: 'content-widget-above-below', create: { value: lines(5, i => 'line ' + i) },
        steps: [{ do: 'eval', code: 'const mk = (id, pref, l) => { const n = document.createElement("div"); n.className = "cw"; n.textContent = id; n.style.cssText = "height:16px;background:#ff0"; editor.addContentWidget({ getId: () => id, getDomNode: () => n, getPosition: () => ({ position: { lineNumber: l, column: 4 }, preference: [pref] }) }) }; mk("above", monaco.editor.ContentWidgetPositionPreference.ABOVE, 3); mk("below", monaco.editor.ContentWidgetPositionPreference.BELOW, 3)' }, { do: 'snap', label: 'a', spec: { geometry: false, cursor: false, value: false, rects: { monaco: '.cw', lite: '.cw' } } }],
    },
    {
        name: 'overlay-widget', create: { value: 'x' },
        steps: [{ do: 'eval', code: 'const n = document.createElement("div"); n.className = "ow"; n.textContent = "OW"; n.style.cssText = "background:#0ff;width:60px;height:20px"; editor.addOverlayWidget({ getId: () => "ow", getDomNode: () => n, getPosition: () => ({ preference: monaco.editor.OverlayWidgetPositionPreference.TOP_RIGHT_CORNER }) })' }, { do: 'snap', label: 'a', spec: { geometry: false, cursor: false, value: false, rects: { monaco: '.ow', lite: '.ow' } } }],
    },
]
