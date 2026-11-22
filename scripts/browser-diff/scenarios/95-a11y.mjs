// 无障碍:两边 DOM 结构不同(Monaco EditContext,lite contenteditable),所以对比的是「读屏会看到的」:
//   ax  = Chromium AX 树摘要(外层 role、编辑框名字/roledescription/autocomplete/haspopup、浮层的 role+name、live region 个数)
//   a11y= 焦点元素 DOM 属性、live region 文本、role 计数(信息级)
// 没对齐的差异在 known.mjs 里逐条写了理由;这里的场景不再有泛化的「全部有意不同」。
const T = 'alpha alphabet alps\nalp'
const A = (name, options, extra = {}) => ({
    name, create: { value: 'line one\nline two\nline three', options },
    steps: [{ do: 'focus' }, { do: 'ax', label: 'init' }, { do: 'a11y', label: 'init' }, { do: 'keys', keys: ['ArrowDown', 'End'] }, { do: 'wait', ms: 400 }, { do: 'a11y', label: 'after-move' }, { do: 'type', text: 'x' }, { do: 'wait', ms: 400 }, { do: 'ax', label: 'after-type' }, { do: 'a11y', label: 'after-type' }],
    ...extra,
})
const S = (name, create, evalCode, wait = 600) => ({
    name, create, steps: [{ do: 'focus' }, { do: 'eval', code: evalCode }, { do: 'wait', ms: wait }, { do: 'ax', label: 'ax' }],
})
const K = (name, create, keys, wait = 600) => ({
    // tabFocusMode 是全局开关(Monaco 的 TabFocus 静态量),Ctrl+Shift+M 切一次会泄漏给后面所有场景(Tab 不再插缩进):取完快照再切回
    name, create, steps: [{ do: 'focus' }, { do: 'keys', keys }, { do: 'wait', ms: wait }, { do: 'ax', label: 'ax' }, { do: 'a11y', label: 'a11y' }, ...(keys.includes('Control+Shift+m') ? [{ do: 'keys', keys: ['Control+Shift+m'] }] : [])],
})
export default [
    A('default', {}),
    A('accessibilitySupport-on', { accessibilitySupport: 'on' }),
    A('accessibilitySupport-off', { accessibilitySupport: 'off' }),
    A('ariaLabel', { ariaLabel: 'My editor' }),
    A('ariaRequired', { ariaRequired: true }),
    A('readOnly', { readOnly: true, domReadOnly: true }),
    A('screenReaderAnnounceInlineSuggestion', { screenReaderAnnounceInlineSuggestion: true }),
    S('suggest', { value: T, options: { quickSuggestions: false } }, 'editor.setPosition({lineNumber:2,column:4}); editor.trigger("t","editor.action.triggerSuggest",{})'),
    S('find', { value: 'line one\nline two' }, 'await editor.getAction("actions.find").run()', 400),
    K('find-replace', { value: 'line one\nline two' }, ['Meta+Alt+f'], 400),
    S('markers', { value: 'line one\nline two' }, 'monaco.editor.setModelMarkers(editor.getModel(),"t",[{severity:8,message:"boom",startLineNumber:1,startColumn:1,endLineNumber:1,endColumn:5}]); await new Promise(r=>setTimeout(r,300)); editor.setPosition({lineNumber:1,column:2}); await editor.getAction("editor.action.marker.next").run()'),
    S('fold', { value: 'function f() {\n  a\n  b\n}\nz', language: 'typescript' }, 'await editor.getAction("editor.foldAll").run()', 300),
    S('palette', { value: 'x' }, 'await editor.getAction("editor.action.quickCommand").run()', 500),
    K('contextmenu', { value: 'x' }, ['Shift+F10'], 500),
    S('readonly-typing-alert', { value: 'x', options: { readOnly: true } }, 'editor.trigger("t","type",{text:"a"})', 400),
    // 读屏内容窗口:Monaco(accessibilitySupport:on)把光标周围 accessibilityPageSize 行写进 EditContext 元素;lite 读的是真 DOM(渲染出来的行)
    ...[undefined, 10].map(ps => ({
        name: 'pageSize-' + (ps ?? 'default'),
        create: { value: Array.from({ length: 2000 }, (_, i) => 'line ' + (i + 1)).join('\n'), options: { accessibilitySupport: 'on', ...(ps ? { accessibilityPageSize: ps } : {}) } },
        steps: [{ do: 'focus' }, { do: 'eval', label: 'sr', code: 'editor.setPosition({lineNumber:1000,column:3}); await new Promise(r=>setTimeout(r,400)); const ae=document.activeElement; const t=ae.value ?? ae.textContent ?? ""; return { follows: t.includes("line 1000"), lines: t.split("\\n").length }' }],
    })),
    K('tabFocusMode-alert', { value: 'x' }, ['Control+Shift+m'], 300),
]
