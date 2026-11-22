// AX 树抽取与状态表(探针和 a11y 场景共用)。
const SKIP = new Set(['generic', 'StaticText', 'InlineTextBox', 'none', 'presentation', 'LineBreak'])
export async function axTree(k, { all = false } = {}) {
    const { cdp } = k
    await cdp.send('Accessibility.enable')
    const { nodes } = await cdp.send('Accessibility.getFullAXTree')
    const byId = new Map(nodes.map(n => [n.nodeId, n]))
    const out = []
    const walk = (n, d) => {
        if (!n) return
        const role = n.role?.value
        const keep = !n.ignored && (all || !SKIP.has(role) || n.properties?.some(p => p.name === 'live'))
        if (keep && role !== 'RootWebArea') {
            const p = Object.fromEntries((n.properties ?? []).filter(p => !['url', 'focusable'].includes(p.name)).map(p => [p.name, p.value?.value]))
            out.push('  '.repeat(d) + `${role}${n.name?.value ? ` "${String(n.name.value).slice(0, 60)}"` : ''}${n.value?.value ? ` value=${JSON.stringify(String(n.value.value).slice(0, 30))}` : ''}${Object.keys(p).length ? ' ' + JSON.stringify(p) : ''}`)
        }
        for (const c of n.childIds ?? []) walk(byId.get(c), keep ? d + 1 : d)
    }
    walk(nodes[0], 0)
    return out
}
/**
 * 读屏会看到的节点摘要(按 AX 树,不是 DOM 属性):
 *   wrapper = 编辑器最外层节点的 role;textbox = 编辑框的名字/roledescription/autocomplete/haspopup/…;
 *   widgets = 浮层里有语义的节点 {role, name}(listbox/option/dialog/toolbar/button/checkbox/tooltip/menu…),按树序;
 *   live = 各 live region 的 {assertive, polite} 个数。
 */
const WIDGET = new Set(['listbox', 'option', 'dialog', 'toolbar', 'button', 'checkbox', 'tooltip', 'menu', 'menuitem', 'combobox', 'alert'])
export async function axSummary(k) {
    const { cdp } = k
    await cdp.send('Accessibility.enable')
    const { nodes } = await cdp.send('Accessibility.getFullAXTree')
    const props = n => Object.fromEntries((n.properties ?? []).map(p => [p.name, p.value?.value]))
    const live = { assertive: 0, polite: 0 }
    const widgets = []
    let textbox = null, wrapper = null
    const byId = new Map(nodes.map(n => [n.nodeId, n]))
    const visit = (n, parent) => {
        if (!n) return
        if (!n.ignored) {
            const role = n.role?.value, p = props(n)
            if (p.live) live[p.live] = (live[p.live] ?? 0) + 1
            if (role === 'textbox' && !textbox && p.editable === 'richtext') {
                textbox = { name: n.name?.value ?? '', roledescription: p.roledescription ?? null, autocomplete: p.autocomplete ?? null, hasPopup: p.hasPopup ?? null, multiline: !!p.multiline, readonly: !!p.readonly, required: !!p.required }
                wrapper = parent?.role?.value ?? null
            } else if (WIDGET.has(role) && !(role === 'alert' && p.live && !n.name?.value && !n.value?.value)) {
                widgets.push({ role, name: n.name?.value ?? '' })
            }
        }
        for (const c of n.childIds ?? []) visit(byId.get(c), n.ignored ? parent : n)
    }
    visit(nodes[0], null)
    // 命令面板这类长列表:Monaco 只渲染可见行,lite 渲染全部,只比前 8 个节点(角色和命名规则),并记总数不比
    return { wrapper, textbox, widgets: widgets.slice(0, 8), live }
}
const T = 'alpha alphabet alps\nalp'
export const STATES = {
    init: {},
    readOnly: { create: { value: 'line one\nline two', options: { readOnly: true, domReadOnly: true } } },
    ariaRequired: { create: { value: 'x', options: { ariaRequired: true, ariaLabel: 'My editor' } } },
    accOff: { create: { value: 'x', options: { accessibilitySupport: 'off' } } },
    accOn: { create: { value: 'x', options: { accessibilitySupport: 'on' } } },
    suggest: { create: { value: T, options: { quickSuggestions: false } }, steps: [{ eval: 'editor.setPosition({lineNumber:2,column:4}); editor.trigger("t","editor.action.triggerSuggest",{})' }, { wait: 800 }] },
    find: { steps: [{ eval: 'await editor.getAction("actions.find").run()' }, { wait: 400 }] },
    hover: { create: { value: 'line one', options: {} }, steps: [{ eval: 'editor.setPosition({lineNumber:1,column:2}); await editor.getAction("editor.action.showHover").run()' }, { wait: 600 }] },
    markers: { create: { value: 'line one\nline two' }, steps: [{ eval: 'monacoAPI.editor.setModelMarkers(editor.getModel(),"t",[{severity:8,message:"boom",startLineNumber:1,startColumn:1,endLineNumber:1,endColumn:5}])' }, { wait: 500 }, { eval: 'editor.setPosition({lineNumber:1,column:2}); await editor.getAction("editor.action.marker.next").run()' }, { wait: 500 }] },
    fold: { create: { value: 'function f() {\n  a\n  b\n}\nz', language: 'typescript' }, steps: [{ eval: 'await editor.getAction("editor.foldAll").run()' }, { wait: 300 }] },
    palette: { steps: [{ eval: 'await editor.getAction("editor.action.quickCommand").run()' }, { wait: 500 }] },
    contextmenu: { steps: [{ eval: 'editor.trigger("t","editor.action.showContextMenu",{})' }, { wait: 500 }] },
}
