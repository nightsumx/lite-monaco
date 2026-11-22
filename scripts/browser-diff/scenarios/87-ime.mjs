// 输入法(CDP 模拟:Input.imeSetComposition / insertText,不是真输入法):开始、更新、提交、取消、组字中点击 / Esc / 失焦 / 外部编辑、选区替换、折行、RTL、多光标、只读
// 每一步都取:value、sel、光标框、组字事件序列(onDidCompositionStart/End + 内容变更)、焦点元素的文本(AX/value 的近似)
const S = { geometry: false, cursorRect: true, eval: `(() => { const a = document.activeElement; return { ev: window.__ime.slice(), act: a ? (a.value ?? a.textContent ?? '').slice(0, 200) : null, rtl: !!(editor.getModel().getValue().match(/[\\u0590-\\u08ff]/)) } })()` }
const hook = { do: 'eval', code: `window.__ime = []; editor.onDidCompositionStart(() => window.__ime.push('start')); editor.onDidCompositionEnd(() => window.__ime.push('end')); editor.onDidChangeModelContent(e => window.__ime.push('chg:' + e.changes.map(c => c.rangeOffset + ':' + c.rangeLength + ':' + c.text).join('|')))` }
const snap = l => ({ do: 'snap', label: l, spec: S })
const set = (text, o = {}) => ({ do: 'imeSet', text, ...o })
const I = (name, create, steps) => ({ name, create, steps: [hook, ...steps.flatMap((s, i) => s.do === 'snap' ? [s] : [s, snap(`s${String(i).padStart(2, '0')}_${s.do}`)])] })
export default [
    I('start-update-commit', { value: 'ab' }, [{ do: 'keys', keys: ['End'] }, set('n'), set('ni'), set('nih'), set('你好'), { do: 'imeCommit', text: '你好' }]),
    I('cancel', { value: 'ab' }, [{ do: 'keys', keys: ['End'] }, set('ni'), set('nih'), { do: 'imeCancel' }]),
    I('cancel-then-type', { value: 'ab' }, [{ do: 'keys', keys: ['End'] }, set('ni'), { do: 'imeCancel' }, { do: 'type', text: 'x' }]),
    I('replace-selection', { value: 'hello world' }, [{ do: 'eval', code: 'editor.setSelection(new monaco.Range(1,1,1,6))' }, set('ni'), set('你'), { do: 'imeCommit', text: '你' }]),
    I('replace-selection-cancel', { value: 'hello world' }, [{ do: 'eval', code: 'editor.setSelection(new monaco.Range(1,1,1,6))' }, set('ni'), { do: 'imeCancel' }]),
    I('inner-selection', { value: 'ab' }, [{ do: 'keys', keys: ['End'] }, set('nihao', { start: 2, end: 2 }), set('nihao', { start: 1, end: 4 }), { do: 'imeCommit', text: '你好' }]),
    I('middle-of-line', { value: 'abcdef' }, [{ do: 'keys', keys: ['End', 'ArrowLeft', 'ArrowLeft'] }, set('z'), set('zh'), set('中'), { do: 'imeCommit', text: '中' }]),
    I('empty-doc', { value: '' }, [set('a'), set('あ'), set('あい'), { do: 'imeCommit', text: 'あい' }]),
    I('second-line', { value: 'one\ntwo\nthree' }, [{ do: 'keys', keys: ['ArrowDown', 'End'] }, set('x'), set('xy'), { do: 'imeCommit', text: '漢' }]),
    I('two-rounds', { value: '' }, [set('ni'), { do: 'imeCommit', text: '你' }, set('hao'), { do: 'imeCommit', text: '好' }]),
    I('click-during', { value: 'abc\ndef\nghi' }, [{ do: 'keys', keys: ['End'] }, set('ni'), { do: 'click', at: [3, 2] }, { do: 'imeCommit', text: '你' }]),
    I('click-during-then-update', { value: 'abc\ndef\nghi' }, [{ do: 'keys', keys: ['End'] }, set('ni'), { do: 'click', at: [3, 2] }, set('nih')]),
    I('esc-during', { value: 'abc' }, [{ do: 'keys', keys: ['End'] }, set('ni'), { do: 'keys', keys: ['Escape'] }, { do: 'imeCommit', text: '你' }]),
    I('blur-during', { value: 'abc' }, [{ do: 'keys', keys: ['End'] }, set('ni'), { do: 'blur' }]),
    I('blur-during-refocus', { value: 'abc' }, [{ do: 'keys', keys: ['End'] }, set('ni'), { do: 'blur' }, { do: 'eval', code: 'editor.focus()' }, { do: 'type', text: 'x' }]),
    I('external-edit-before', { value: 'abc\ndef' }, [{ do: 'keys', keys: ['ArrowDown', 'End'] }, set('ni'), { do: 'eval', code: 'editor.executeEdits("t", [{ range: new monaco.Range(1,1,1,1), text: "XX" }])' }, set('nih'), { do: 'imeCommit', text: '你' }]),
    I('external-edit-after', { value: 'abc\ndef' }, [{ do: 'keys', keys: ['End'] }, set('ni'), { do: 'eval', code: 'editor.executeEdits("t", [{ range: new monaco.Range(2,1,2,1), text: "XX" }])' }, set('nih'), { do: 'imeCommit', text: '你' }]),
    I('external-setvalue', { value: 'abc' }, [{ do: 'keys', keys: ['End'] }, set('ni'), { do: 'eval', code: 'editor.setValue("replaced")' }, { do: 'imeCommit', text: '你' }]),
    I('external-setselection', { value: 'abc\ndef' }, [{ do: 'keys', keys: ['End'] }, set('ni'), { do: 'eval', code: 'editor.setPosition({lineNumber:2,column:2})' }, { do: 'imeCommit', text: '你' }]),
    I('wrapped', { value: 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod', options: { wordWrap: 'on' }, width: 300 }, [{ do: 'keys', keys: ['End'] }, set('zhong'), set('中文'), { do: 'imeCommit', text: '中文' }]),
    I('rtl-line', { value: 'שלום עולם' }, [{ do: 'keys', keys: ['End'] }, set('a'), set('ab'), { do: 'imeCommit', text: 'ab' }]),
    I('rtl-compose-he', { value: 'abc' }, [{ do: 'keys', keys: ['End'] }, set('ש'), set('של'), { do: 'imeCommit', text: 'של' }]),
    I('multicursor', { value: 'a\nb\nc' }, [{ do: 'eval', code: 'editor.setSelections([new monaco.Selection(1,2,1,2), new monaco.Selection(3,2,3,2)])' }, set('ni'), { do: 'imeCommit', text: '你' }]),
    I('readonly', { value: 'abc', options: { readOnly: true } }, [{ do: 'keys', keys: ['End'] }, set('ni'), { do: 'imeCommit', text: '你' }]),
    I('zwj-neighbour', { value: 'a👨‍👩‍👧b' }, [{ do: 'keys', keys: ['End', 'ArrowLeft'] }, set('x'), set('xy'), { do: 'imeCommit', text: '字' }]),
    I('decorations-during', { value: 'abc def' }, [{ do: 'eval', code: "const s=document.createElement('style');s.textContent='.dd{background:#fa0}';document.head.appendChild(s);editor.createDecorationsCollection([{range:new monaco.Range(1,1,1,4),options:{inlineClassName:'dd'}}])" }, { do: 'keys', keys: ['Home', 'ArrowRight'] }, set('ni'), set('nih'), { do: 'imeCommit', text: '你' }]),
]
