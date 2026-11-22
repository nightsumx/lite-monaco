// F5 编辑命令回放台(jsdom):用 liteMonaco() 装出和对照页一样的编辑器(Mac 键位、TS 语言),
// 按 Playwright 键名发 keydown、按输入管线(inputHandler → 默认插入)落字,读回文档 + 选区。
// 期望值来自 /tmp/lc-hunt 对照页上 Monaco 0.52.2 的实测(__fixtures__/f5-monaco-edit.json)。
// 标记:‸ 空光标,⟨ 锚点,⟩ 头(成对,先后不限)。
//
// 注意:keymap 在模块加载时按 navigator.platform 定平台,所以调用方要先 setMacPlatform() 再动态 import。

import type { EditorView } from '../../src/core/view/editorview'

export interface Fixture {
    file: string
    name: string
    doc: string
    keys: (string | { type: string } | { wait: number })[]
    tabSize?: number
    insertSpaces?: boolean
    lang?: string
    monaco: string
    wasDiff: boolean
}

export function setMacPlatform(): void {
    Object.defineProperty(window.navigator, 'platform', { value: 'MacIntel', configurable: true })
}

export function parse(spec: string): { doc: string, sels: [number, number][] } {
    let doc = ''
    const sels: [number, number][] = []
    let anchor: number | null = null, head: number | null = null
    for (const ch of spec) {
        if (ch === '‸') sels.push([doc.length, doc.length])
        else if (ch === '⟨') { anchor = doc.length; if (head !== null) { sels.push([anchor, head]); anchor = head = null } }
        else if (ch === '⟩') { head = doc.length; if (anchor !== null) { sels.push([anchor, head]); anchor = head = null } }
        else doc += ch
    }
    return { doc, sels }
}

export function render(doc: string, sels: [number, number][]): string {
    const marks: [number, string][] = []
    for (const [a, h] of sels) {
        if (a === h) marks.push([a, '‸'])
        else { marks.push([a, '⟨']); marks.push([h, '⟩']) }
    }
    marks.sort((x, y) => x[0] - y[0])
    let out = '', i = 0
    for (const [p, m] of marks) { out += doc.slice(i, p) + m; i = p }
    return out + doc.slice(i)
}

// Playwright 键名 → KeyboardEvent 初始化参数(美式布局,Playwright 不做 Mac ⌥ 组字)
const SHIFTED: Record<string, string> = { '\\': '|', '/': '?', '[': '{', ']': '}', ';': ':', '\'': '"', ',': '<', '.': '>', '-': '_', '=': '+', '`': '~' }
const CODES: Record<string, [string, number]> = {
    ArrowLeft: ['ArrowLeft', 37], ArrowRight: ['ArrowRight', 39], ArrowUp: ['ArrowUp', 38], ArrowDown: ['ArrowDown', 40],
    Home: ['Home', 36], End: ['End', 35], PageUp: ['PageUp', 33], PageDown: ['PageDown', 34],
    Backspace: ['Backspace', 8], Delete: ['Delete', 46], Enter: ['Enter', 13], Tab: ['Tab', 9], Escape: ['Escape', 27],
    ',': ['Comma', 188], '.': ['Period', 190], '\\': ['Backslash', 220], '/': ['Slash', 191], '[': ['BracketLeft', 219], ']': ['BracketRight', 221],
}

export function keyInit(spec: string): KeyboardEventInit & { keyCode: number } {
    const parts = spec.split('+')
    let base = parts.pop()!
    if (base === '' && parts.length) base = '+'
    const mods = new Set(parts)
    const shiftKey = mods.has('Shift')
    let key = base, code = '', keyCode = 0
    if (CODES[base]) [code, keyCode] = CODES[base]
    else if (base.length === 1 && base >= 'a' && base <= 'z') { code = 'Key' + base.toUpperCase(); keyCode = base.toUpperCase().charCodeAt(0) }
    if (base.length === 1 && shiftKey) key = SHIFTED[base] ?? base.toUpperCase()
    return {
        key, code, keyCode,
        metaKey: mods.has('Meta'), ctrlKey: mods.has('Control'), altKey: mods.has('Alt'), shiftKey,
        bubbles: true, cancelable: true,
    }
}

export interface Replay {
    view: EditorView
    press(spec: string): KeyboardEvent
    /** 按原样发一个 keydown(模拟 Mac 上 ⌥ 组出来的 event.key,比如 ⌥⇧A → 'Å')。 */
    pressRaw(init: KeyboardEventInit & { keyCode: number }): KeyboardEvent
    type(text: string): void
    result(): string
    destroy(): void
}

type LiteMonaco = typeof import('../../src/litemonaco')
type Core = typeof import('../../src/core/index')

/** 照对照页的装法建一个 liteMonaco(TS、关掉补全/悬停等弹层),设好文档和选区。 */
export function mount(mods: { lm: LiteMonaco, core: Core }, fx: Pick<Fixture, 'doc' | 'tabSize' | 'insertSpaces' | 'lang'> & { readOnly?: boolean }): Replay {
    const { lm, core } = mods
    const { doc, sels } = parse(fx.doc)
    const tabSize = fx.tabSize ?? 4, insertSpaces = fx.insertSpaces ?? true
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    const state = core.EditorState.create({
        doc,
        selection: core.EditorSelection.create(sels.map(([a, h]) => core.EditorSelection.range(a, h)), 0),
    })
    const ext = tabSize === 4 && insertSpaces ? [] : [core.EditorState.tabSize.of(tabSize), core.EditorState.indentUnit.of(insertSpaces ? ' '.repeat(tabSize) : '\t')]
    const hl = {
        codeToTokens: (code: string) => ({ tokens: code.split('\n').map(l => [{ content: l, offset: 0 }]) }),
        getLastGrammarState: () => ({ getScopes: () => undefined }),
        getLoadedLanguages: () => ['typescript', 'text'],
        getTheme: () => ({ bg: '#1e1e1e', fg: '#d4d4d4', type: 'dark' as const }),
    }
    const view = lm.liteMonaco({
        parent, extensions: ext, highlighter: hl as never, state, lang: fx.lang ?? 'typescript', theme: 'dark-plus', readOnly: fx.readOnly,
        features: { autocomplete: false, signatureHelp: false, hover: false, codeActions: false, tsDiagnostics: false, minimap: false, stickyScroll: false },
    })
    // jsdom 没有布局:一页行数按对照页实测(编辑器高度能放 25 行,Monaco 翻页 = 25 - 2 = 23 行)
    ;(view as { linesPerPage: () => number }).linesPerPage = () => 25
    // 对照页:聚焦后重设一次选区
    view.dispatch(view.state.update({ selection: core.EditorSelection.create(sels.map(([a, h]) => core.EditorSelection.range(a, h)), 0) }))
    const pressRaw = (init: KeyboardEventInit & { keyCode: number }) => {
        const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
        Object.defineProperty(e, 'keyCode', { value: init.keyCode })
        view.contentDOM.dispatchEvent(e)
        // 粘贴键 lite 不在 keydown 里认领(交给浏览器原生 paste 事件,见 keymap.ts):jsdom 没有「默认行为」,
        // 这里替浏览器补上——keydown 没被拦就用测试里的 navigator.clipboard 替身读文本,发一个 paste 事件。
        const isPaste = !e.defaultPrevented && ((init.key === 'v' && (init.metaKey || init.ctrlKey) && !init.altKey && !init.shiftKey) || (init.key === 'Insert' && init.shiftKey))
        if (isPaste) {
            const fire = (text: string) => {
                const pe = new Event('paste', { bubbles: true, cancelable: true })
                Object.defineProperty(pe, 'clipboardData', { value: { types: ['text/plain'], getData: (t: string) => (t === 'text/plain' ? text : '') } })
                view.contentDOM.dispatchEvent(pe)
            }
            const clip = (navigator as { clipboard?: { readText?: () => Promise<string> } }).clipboard
            if (clip?.readText) void clip.readText().then(fire, () => {})
            else fire('')
        }
        return e
    }
    const press = (spec: string) => pressRaw(keyInit(spec))
    const type = (text: string) => {
        for (const ch of text) {
            // 先过 keymap(打字键一般没绑),再按 domchange 的顺序问 inputHandler,都不认领就默认插入
            const e = press(ch === ' ' ? ' ' : ch)
            if (e.defaultPrevented) continue
            const main = view.state.selection.main
            let done = false
            for (const h of view.state.facet(core.inputHandler)) {
                if (h(view, main.from, main.to, ch)) { done = true; break }
            }
            if (!done) view.dispatch(view.state.update(view.state.replaceSelection(ch), { scrollIntoView: true, userEvent: 'input.type' }))
        }
    }
    return {
        view, press, pressRaw, type,
        result: () => render(view.state.doc.toString(), view.state.selection.ranges.map(r => [r.anchor, r.head])),
        destroy: () => { view.destroy(); parent.remove() },
    }
}

/** 回放一个场景,返回终态标记串。 */
export function replay(mods: { lm: LiteMonaco, core: Core }, fx: Fixture): string {
    const r = mount(mods, fx)
    try {
        for (const k of fx.keys) {
            if (typeof k === 'string') r.press(k)
            else if ('type' in k) r.type(k.type)
        }
        return r.result()
    } finally { r.destroy() }
}
