import { lines } from './_util.mjs'
const nested = lines(30, i => i % 6 === 0 ? 'block ' + i : '    '.repeat(i % 3 + 1) + 'item ' + i)
const G = (name, create, steps, spec = {}) => ({ name, create, steps: [...steps, { do: 'snap', label: 'end', spec: { lines: 'all', rows: 'all', ...spec } }] })
export default [
    G('fold-all', { value: nested }, [{ do: 'eval', code: 'await editor.getAction("editor.foldAll").run()' }], { positions: [[1, 1]] }),
    G('fold-level-2', { value: nested }, [{ do: 'eval', code: 'await editor.getAction("editor.foldLevel2").run()' }]),
    G('fold-then-unfold', { value: nested }, [{ do: 'eval', code: 'await editor.getAction("editor.foldAll").run(); await editor.getAction("editor.unfoldAll").run()' }]),
    G('fold-cursor-inside-moves', { value: nested }, [{ do: 'eval', code: 'editor.setPosition({lineNumber:3,column:3}); await editor.getAction("editor.foldAll").run()' }]),
    G('fold-visible-ranges', { value: nested }, [{ do: 'eval', code: 'await editor.getAction("editor.foldAll").run()' }], { geometry: true }),
    G('folding-off', { value: nested, options: { folding: false } }, []),
    G('folding-strategy-indentation', { value: nested, options: { foldingStrategy: 'indentation' } }, []),
    G('viewzone-basic', { value: lines(10, i => 'l' + i) }, [{ do: 'eval', code: 'editor.changeViewZones(a => { const d = document.createElement("div"); d.style.background = "#fcc"; d.className = "vz"; a.addZone({ afterLineNumber: 3, heightInPx: 60, domNode: d }) })' }], { rects: { monaco: '.vz', lite: '.vz' } }),
    G('viewzone-lines-offset', { value: lines(10, i => 'l' + i) }, [{ do: 'eval', code: 'editor.changeViewZones(a => { for (const n of [0, 3, 3, 10]) { const d = document.createElement("div"); d.className = "vz"; a.addZone({ afterLineNumber: n, heightInLines: 2, domNode: d }) } })' }], { rects: { monaco: '.vz', lite: '.vz' } }),
    G('viewzone-remove', { value: lines(10, i => 'l' + i) }, [{ do: 'eval', code: 'let id; editor.changeViewZones(a => { const d = document.createElement("div"); id = a.addZone({ afterLineNumber: 2, heightInPx: 40, domNode: d }) }); editor.changeViewZones(a => a.removeZone(id))' }]),
    G('viewzone-with-wrap', { value: lines(3, i => 'word '.repeat(60 * i)), options: { wordWrap: 'on' } }, [{ do: 'eval', code: 'editor.changeViewZones(a => { const d = document.createElement("div"); a.addZone({ afterLineNumber: 1, heightInPx: 50, domNode: d }) })' }]),
    G('viewzone-edit-above', { value: lines(10, i => 'l' + i) }, [{ do: 'eval', code: 'editor.changeViewZones(a => { const d = document.createElement("div"); a.addZone({ afterLineNumber: 5, heightInPx: 40, domNode: d }) }); editor.getModel().applyEdits([{ range: new monaco.Range(1,1,1,1), text: "new\\nnew2\\n" }])' }]),
    G('padding-top-zone', { value: lines(5, i => 'l' + i), options: { padding: { top: 15, bottom: 5 } } }, [{ do: 'eval', code: 'editor.changeViewZones(a => { const d = document.createElement("div"); a.addZone({ afterLineNumber: 0, heightInPx: 30, domNode: d }) })' }]),
    G('decorations-lineheight', { value: lines(8, i => 'l' + i) }, [{ do: 'eval', code: 'editor.createDecorationsCollection([{ range: new monaco.Range(3,1,3,1), options: { lineHeight: 40 } }, { range: new monaco.Range(5,1,5,3), options: { lineHeight: 30 } }])' }]),
    G('hidden-areas', { value: lines(12, i => 'l' + i) }, [{ do: 'eval', code: 'editor.setHiddenAreas([new monaco.Range(3,1,5,1)])' }]),
]
