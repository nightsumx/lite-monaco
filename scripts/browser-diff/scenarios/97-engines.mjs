// 跨引擎/跨环境补充场景(Firefox/WebKit/hi-DPI 下也跑):补全弹层、查找、撤销栈、装饰、占位/只读、IME 之外的输入路径。
// 这些在 Chromium 上已经一致;换引擎时看有没有「只在某引擎里出现」的差异。
const reg = `
    if (!monaco.languages.getLanguages().some(l => l.id === 'xlang')) monaco.languages.register({ id: 'xlang' })
    if (!globalThis.__xprov) globalThis.__xprov = monaco.languages.registerCompletionItemProvider('xlang', {
        provideCompletionItems(model, pos) {
            const w = model.getWordUntilPosition(pos)
            const range = { startLineNumber: pos.lineNumber, endLineNumber: pos.lineNumber, startColumn: w.startColumn, endColumn: w.endColumn }
            return { suggestions: ['foo', 'foobar', 'fob', 'format', 'zeta'].map((l, i) => ({ label: l, kind: monaco.languages.CompletionItemKind.Function, insertText: l, range, detail: 'd' + i })) }
        } })
`
// lite 的弹层可能挂在 host 之外,所以用 document 级查询;选中行取其标签文字
const rows = { eval: `(() => { const k = H.kind; const items = [...document.querySelectorAll(k === 'monaco' ? '.suggest-widget .monaco-list-row' : '.cm-completionItem')].filter(e => e.getClientRects().length); const sel = k === 'monaco' ? items.find(e => e.classList.contains('focused')) : items.find(e => e.classList.contains('cm-completionSelected')); return { n: items.length, labels: items.map(e => (e.querySelector(k === 'monaco' ? '.label-name' : '.cm-completionLabel') || e).textContent.trim()), selected: sel ? (sel.querySelector(k === 'monaco' ? '.label-name' : '.cm-completionLabel') || sel).textContent.trim() : null } })()` }
const S = (name, create, steps) => ({ name, create, steps: [...steps, { do: 'snap', label: 'end', spec: { geometry: false, cursorRect: true, selRects: true } }] })
export default [
    S('suggest-open-filter-accept', { value: 'fo', language: 'xlang', options: { quickSuggestions: false } }, [
        { do: 'eval', code: reg },
        { do: 'eval', code: 'editor.focus(); editor.setPosition({lineNumber:1,column:3}); editor.trigger("t","editor.action.triggerSuggest",{})' },
        { do: 'wait', ms: 1200 },
        { do: 'snap', label: 'open', spec: { geometry: false, cursor: false, value: false, ...rows } },
        { do: 'keys', keys: ['ArrowDown'] }, { do: 'wait', ms: 300 },
        { do: 'snap', label: 'down', spec: { geometry: false, cursor: false, value: false, ...rows } },
        { do: 'keys', keys: ['Enter'] },
    ]),
    S('suggest-type-narrow-escape', { value: '', language: 'xlang', options: { quickSuggestions: true } }, [
        { do: 'eval', code: reg },
        { do: 'type', text: 'fo' }, { do: 'wait', ms: 500 },
        { do: 'snap', label: 'fo', spec: { geometry: false, cursor: false, value: false, ...rows } },
        { do: 'type', text: 'r' }, { do: 'wait', ms: 300 },
        { do: 'snap', label: 'for', spec: { geometry: false, cursor: false, value: false, ...rows } },
        { do: 'keys', keys: ['Escape'] },
        { do: 'snap', label: 'closed', spec: { geometry: false, cursor: false, value: false, ...rows } },
    ]),
    S('suggest-tab-accept', { value: '', language: 'xlang', options: { quickSuggestions: true } }, [
        { do: 'eval', code: reg }, { do: 'type', text: 'zet' }, { do: 'wait', ms: 400 }, { do: 'keys', keys: ['Tab'] },
    ]),
    S('undo-redo-granularity', { value: 'one' }, [
        { do: 'keys', keys: ['End'] }, { do: 'type', text: ' two' }, { do: 'keys', keys: ['Enter'] }, { do: 'type', text: 'three' },
        { do: 'keys', keys: [`${process.platform === 'darwin' ? 'Meta' : 'Control'}+z`] }, { do: 'snap', label: 'u1', spec: { geometry: false } },
        { do: 'keys', keys: [`${process.platform === 'darwin' ? 'Meta' : 'Control'}+z`] }, { do: 'snap', label: 'u2', spec: { geometry: false } },
        { do: 'keys', keys: [`${process.platform === 'darwin' ? 'Meta' : 'Control'}+Shift+z`] },
    ]),
    S('beforeinput-insertText-commit', { value: 'ab' }, [{ do: 'keys', keys: ['End'] }, { do: 'insertText', text: 'xyz' }, { do: 'insertText', text: '中文' }]),
    S('delete-word-backspace-forward', { value: 'foo bar baz' }, [{ do: 'keys', keys: ['End', 'Alt+Backspace', 'Home', 'Alt+Delete', 'Delete', 'Backspace'] }]),
    S('type-emoji-and-combining', { value: '' }, [{ do: 'insertText', text: '👨‍👩‍👧' }, { do: 'insertText', text: 'é' }, { do: 'keys', keys: ['Backspace', 'ArrowLeft', 'ArrowLeft'] }]),
    S('tab-focus-order', { value: 'x' }, [{ do: 'eval', code: 'editor.focus()' }, { do: 'keys', keys: ['Tab'] }, { do: 'snap', label: 'tab', spec: { geometry: false, eval: 'document.activeElement && document.activeElement.tagName' } }]),
    // WebKit:选区 span 把 RTL 文本节点劈开,span 边界处的 collapsed range 没有 rect → 旧实现把 caret 落到行盒左缘(选区框跑到行首)
    S('rtl-selection-mark-boundary', { value: 'abc שלום עולם مرحبا def' }, [
        { do: 'eval', code: 'editor.focus(); editor.setSelection(new monaco.Selection(1,5,1,14))' }, { do: 'wait', ms: 80 },
        { do: 'snap', label: 'sel', spec: { geometry: false, cursor: false, value: false, selRects: true, positions: [[1, 1], [1, 5], [1, 9], [1, 14], [1, 20]] } },
    ]),
]
