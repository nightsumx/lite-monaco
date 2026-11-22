// 第七轮:非 Mac 平台的默认键位照 Monaco kbOpts(primary / mac / linux / win)逐条对齐。
// Monaco 实测(/tmp/lc-hunt/r7/monaco-keys.ts,伪装 UA 后读 keybindingService.getKeybindings(),
// monaco-lookup.ts 读面板键帽,monaco-press.ts 按真键看派发到哪个命令)。差异表见第七轮报告。
// 平台开关:改 navigator.platform 后 vi.resetModules() 再动态 import(keymap / 面板在加载时读平台)。
import { afterAll, describe, expect, it, vi } from 'vitest'

const orig = window.navigator.platform

const hl = {
    codeToTokens: (code: string) => ({ tokens: code.split('\n').map(l => [{ content: l, offset: 0 }]) }),
    getLastGrammarState: () => ({ getScopes: () => undefined }),
    getLoadedLanguages: () => ['typescript', 'text'],
    getTheme: () => ({ bg: '#1e1e1e', fg: '#d4d4d4', type: 'dark' as const }),
}
const QUIET = { minimap: false, autocomplete: false, tsDiagnostics: false, hover: false, signatureHelp: false, codeActions: false, stickyScroll: false } as const

async function on(platform: string) {
    Object.defineProperty(window.navigator, 'platform', { value: platform, configurable: true })
    vi.resetModules()
    const { liteMonaco } = await import('../../src/litemonaco')
    const core = await import('../../src/core/index')
    const search = await import('../../src/core/feature/search')
    function mount(doc: string, cursor: number, lang = 'text') {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const view = liteMonaco({ parent, highlighter: hl as never, doc, lang, features: QUIET })
        view.dispatch(view.state.update({ selection: core.EditorSelection.single(cursor) }))
        return { view, done: () => { view.destroy(); parent.remove() } }
    }
    // 按键:修饰键用 'Ctrl' / 'Shift' / 'Alt' / 'Meta' 前缀,'+' 连接
    function press(view: InstanceType<typeof core.EditorView>, spec: string): KeyboardEvent {
        const parts = spec.split('+')
        const key = parts.pop()!
        const code = key.length === 1 ? (/\d/.test(key) ? `Digit${key}` : `Key${key.toUpperCase()}`) : key
        const e = new KeyboardEvent('keydown', {
            key, code, bubbles: true, cancelable: true,
            ctrlKey: parts.includes('Ctrl'), shiftKey: parts.includes('Shift'), altKey: parts.includes('Alt'), metaKey: parts.includes('Meta'),
        })
        view.contentDOM.dispatchEvent(e)
        return e
    }
    // 面板键帽:F1 打开面板(含 TS 命令,走 lite-monaco 组装的那份),按 label 过滤后读那一行的 aria-label
    // (`label, 读屏写法`),和 keybindingAriaLabel(期望键帽) 比
    const { keybindingAriaLabel, activeQuickInput } = await import('../../src/core/feature/overlay')
    function paletteKeys(view: InstanceType<typeof core.EditorView>) {
        press(view, 'F1')
        return {
            get(label: string): string | undefined {
                activeQuickInput(view)!.setValue('>' + label)
                const row = [...view.dom.querySelectorAll('.cm-quick-input-row')]
                    .find(r => r.querySelector('.cm-quick-input-label')?.textContent === label)
                return row?.getAttribute('aria-label') ?? undefined
            },
            aria: (label: string, kb: string) => `${label}, ${keybindingAriaLabel(kb)}`,
        }
    }
    const caseOn = (view: InstanceType<typeof core.EditorView>) => view.state.field(search.searchField, false)?.caseSensitive ?? false
    return { liteMonaco, core, mount, press, paletteKeys, caseOn }
}

afterAll(() => {
    Object.defineProperty(window.navigator, 'platform', { value: orig, configurable: true })
    vi.resetModules()
})

describe('Linux 默认键位(Monaco linux 字段)', () => {
    it('Copy Line Up/Down 是 Ctrl+Shift+Alt+↑↓;Shift+Alt+↑↓ 和 Ctrl+Shift+↑↓ 是 Add Cursor Above/Below', async () => {
        const { mount, press } = await on('Linux x86_64')
        const a = mount('aa\nbb\n', 4)
        press(a.view, 'Ctrl+Shift+Alt+ArrowUp')
        expect(a.view.state.doc.toString()).toBe('aa\nbb\nbb\n')
        a.done()
        const b = mount('aa\nbb\ncc', 4)
        press(b.view, 'Shift+Alt+ArrowUp')
        expect(b.view.state.doc.toString()).toBe('aa\nbb\ncc')
        expect(b.view.state.selection.ranges.length).toBe(2)
        press(b.view, 'Ctrl+Shift+ArrowDown')
        expect(b.view.state.selection.ranges.length).toBe(3)
        b.done()
    })
    it('块注释是 Ctrl+Shift+A,Shift+Alt+A 不是', async () => {
        const { mount, press } = await on('Linux x86_64')
        const a = mount('foo', 0, 'typescript')
        press(a.view, 'Shift+Alt+a')
        expect(a.view.state.doc.toString()).toBe('foo')
        press(a.view, 'Ctrl+Shift+a')
        expect(a.view.state.doc.toString()).toBe('/*  */foo')
        a.done()
    })
    it('查找开关 Alt+C(不是 Ctrl+Alt+C);Ctrl+Alt+←→ 不按子词移动(Monaco 只有 Mac 绑)', async () => {
        const { mount, press, caseOn } = await on('Linux x86_64')
        const a = mount('fooBar baz', 0)
        press(a.view, 'Ctrl+Alt+c')
        expect(caseOn(a.view)).toBe(false)
        press(a.view, 'Alt+c')
        expect(caseOn(a.view)).toBe(true)
        press(a.view, 'Ctrl+Alt+ArrowRight')
        expect(a.view.state.selection.main.head).toBe(0)
        a.done()
    })
    it('面板键帽跟着 Linux 绑定', async () => {
        const { mount, paletteKeys } = await on('Linux x86_64')
        const a = mount('const a = 1', 0, 'typescript')
        const k = paletteKeys(a.view)
        expect(k.get('Copy Line Up')).toBe(k.aria('Copy Line Up', 'Ctrl+Shift+Alt+UpArrow'))
        expect(k.get('Copy Line Down')).toBe(k.aria('Copy Line Down', 'Ctrl+Shift+Alt+DownArrow'))
        expect(k.get('Add Cursor Above')).toBe(k.aria('Add Cursor Above', 'Shift+Alt+UpArrow'))
        expect(k.get('Add Cursor Below')).toBe(k.aria('Add Cursor Below', 'Shift+Alt+DownArrow'))
        expect(k.get('Toggle Block Comment')).toBe(k.aria('Toggle Block Comment', 'Ctrl+Shift+A'))
        expect(k.get('Format Document')).toBe(k.aria('Format Document', 'Ctrl+Shift+I'))
        expect(k.get('Format Selection')).toBe(k.aria('Format Selection', 'Ctrl+K Ctrl+F'))
        expect(k.get('Peek Definition')).toBe(k.aria('Peek Definition', 'Ctrl+Shift+F10'))
        expect(k.get('Peek Implementation')).toBe(k.aria('Peek Implementation', 'Ctrl+Shift+F12'))
        expect(k.get('Go to Definition')).toBe(k.aria('Go to Definition', 'F12'))
        expect(k.get('Expand Selection')).toBe(k.aria('Expand Selection', 'Shift+Alt+RightArrow'))
        expect(k.get('Go to Next Problem (Error, Warning, Info)')).toBe(k.aria('Go to Next Problem (Error, Warning, Info)', 'Alt+F8'))
        expect(k.get('Trim Trailing Whitespace')).toBe(k.aria('Trim Trailing Whitespace', 'Ctrl+K Ctrl+X'))
        a.done()
    })
})

describe('Windows 默认键位(Monaco win 字段)', () => {
    it('Copy Line 是 Shift+Alt+↑↓,Add Cursor 是 Ctrl+Alt+↑↓,Ctrl+Shift+↑↓ 扩选', async () => {
        const { mount, press } = await on('Win32')
        const a = mount('aa\nbb\ncc', 4)
        press(a.view, 'Shift+Alt+ArrowDown')
        expect(a.view.state.doc.toString()).toBe('aa\nbb\nbb\ncc')
        a.done()
        const b = mount('aa\nbb\ncc', 4)
        press(b.view, 'Ctrl+Alt+ArrowUp')
        expect(b.view.state.selection.ranges.length).toBe(2)
        b.done()
        const c = mount('aa\nbb\ncc', 4)
        press(c.view, 'Ctrl+Shift+ArrowUp')
        expect(c.view.state.selection.ranges.length).toBe(1)
        expect([c.view.state.selection.main.anchor, c.view.state.selection.main.head]).toEqual([4, 1])
        c.done()
    })
    it('Shift+Delete 剪切(空选区剪整行),Ctrl+M 开 Tab 焦点模式', async () => {
        const { mount, press } = await on('Win32')
        const a = mount('ab\ncd', 0)
        press(a.view, 'Shift+Delete')
        expect(a.view.state.doc.toString()).toBe('cd')
        expect(a.view.inputState.tabFocusMode).toBe(-1)
        press(a.view, 'Ctrl+m')
        expect(a.view.inputState.tabFocusMode).toBe(0)
        press(a.view, 'Ctrl+m')
        expect(a.view.inputState.tabFocusMode).toBe(-1)
        a.done()
    })
    it('查找开关 Alt+C;查找框按钮写 Alt+C', async () => {
        const { mount, press, caseOn, core } = await on('Win32')
        const a = mount('foo', 0)
        press(a.view, 'Alt+c')
        expect(caseOn(a.view)).toBe(true)
        core.openSearch(a.view)
        const titles = [...a.view.dom.querySelectorAll('.cm-find-widget [aria-label]')].map(e => e.getAttribute('aria-label'))
        expect(titles).toContain('Match Case (Alt+C)')
        expect(titles).toContain('Preserve Case (Alt+P)')
        a.done()
    })
    it('面板键帽跟着 Windows 绑定', async () => {
        const { mount, paletteKeys } = await on('Win32')
        const a = mount('const a = 1', 0, 'typescript')
        const k = paletteKeys(a.view)
        expect(k.get('Copy Line Up')).toBe(k.aria('Copy Line Up', 'Shift+Alt+UpArrow'))
        expect(k.get('Add Cursor Above')).toBe(k.aria('Add Cursor Above', 'Ctrl+Alt+UpArrow'))
        expect(k.get('Toggle Block Comment')).toBe(k.aria('Toggle Block Comment', 'Shift+Alt+A'))
        expect(k.get('Format Document')).toBe(k.aria('Format Document', 'Shift+Alt+F'))
        expect(k.get('Peek Definition')).toBe(k.aria('Peek Definition', 'Alt+F12'))
        expect(k.get('Go to Definition')).toBe(k.aria('Go to Definition', 'F12'))
        expect(k.get('Go to Implementation')).toBe(k.aria('Go to Implementation', 'Ctrl+F12'))
        a.done()
    })
})

describe('Mac 默认键位(Monaco mac 字段)', () => {
    it('⌥⌘C 开查找开关(⌥C 不是),按钮写 ⌥⌘C', async () => {
        const { mount, press, caseOn, core } = await on('MacIntel')
        const a = mount('foo', 0)
        press(a.view, 'Alt+c')
        expect(caseOn(a.view)).toBe(false)
        press(a.view, 'Meta+Alt+c')
        expect(caseOn(a.view)).toBe(true)
        core.openSearch(a.view)
        const titles = [...a.view.dom.querySelectorAll('.cm-find-widget [aria-label]')].map(e => e.getAttribute('aria-label'))
        expect(titles).toContain('Match Case (⌥⌘C)')
        expect(titles).toContain('Preserve Case (⌥⌘P)')
        a.done()
    })
    it('⌃⇧M 开 Tab 焦点模式;⌃⌥→ 仍是子词', async () => {
        const { mount, press } = await on('MacIntel')
        const a = mount('fooBar baz', 0)
        press(a.view, 'Ctrl+Shift+m')
        expect(a.view.inputState.tabFocusMode).toBe(0)
        press(a.view, 'Ctrl+Shift+m')
        expect(a.view.inputState.tabFocusMode).toBe(-1)
        press(a.view, 'Ctrl+Alt+ArrowRight')
        expect(a.view.state.selection.main.head).toBe(3)
        a.done()
    })
    it('面板键帽:Go to Definition 是 F12(⌘F12 归 Go to Implementation)', async () => {
        const { mount, paletteKeys } = await on('MacIntel')
        const a = mount('const a = 1', 0, 'typescript')
        const k = paletteKeys(a.view)
        expect(k.get('Go to Definition')).toBe(k.aria('Go to Definition', 'F12'))
        expect(k.get('Go to Implementation')).toBe(k.aria('Go to Implementation', '⌘F12'))
        expect(k.get('Peek Implementation')).toBe(k.aria('Peek Implementation', '⇧⌘F12'))
        expect(k.get('Copy Line Up')).toBe(k.aria('Copy Line Up', '⇧⌥↑'))
        expect(k.get('Add Cursor Above')).toBe(k.aria('Add Cursor Above', '⌥⌘↑'))
        expect(k.get('Go to Next Problem (Error, Warning, Info)')).toBe(k.aria('Go to Next Problem (Error, Warning, Info)', '⌥F8'))
        expect(k.get('Format Selection')).toBe(k.aria('Format Selection', '⌘K ⌘F'))
        a.done()
    })
})

describe('三平台共有的缺键(Monaco 有、lite-monaco 之前没绑)', () => {
    it('⌘K ⌘X 去行尾空白;Alt+F8 跳到下一个问题', async () => {
        const { mount, press, core } = await on('Win32')
        const a = mount('a  \nb\nc', 0)
        press(a.view, 'Ctrl+k')
        press(a.view, 'Ctrl+x')
        expect(a.view.state.doc.toString()).toBe('a\nb\nc')
        a.view.dispatch(a.view.state.update({ effects: core.setDiagnostics.of([{ from: 4, to: 5, severity: 'error', message: 'x' }]) }))
        press(a.view, 'Alt+F8')
        expect(a.view.state.selection.main.from).toBe(4)
        a.done()
    })
    it('查找框里 Ctrl+Alt+Enter(Win)全部替换,Alt+Enter 仍是全选命中', async () => {
        const { mount, core } = await on('Win32')
        const a = mount('foo bar foo', 0)
        core.openSearchReplace(a.view)
        core.setSearchQuery('foo', { moveCursor: false })(a.view)
        core.setReplacement('z')(a.view)
        const find = a.view.dom.querySelector('.cm-find-input[main-field]') as HTMLInputElement
        find.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, altKey: true, bubbles: true, cancelable: true }))
        expect(a.view.state.doc.toString()).toBe('z bar z')
        a.done()
    })
})

describe('scrollLineUp / scrollLineDown / scrollPage(Monaco editorScroll,不动光标)', () => {
    it('按行高 / 页大小滚 scrollTop', async () => {
        const { core } = await on('Win32')
        const scrollDOM = { scrollTop: 100 } as HTMLElement
        const t = { state: core.EditorState.create({ doc: 'a' }), dispatch: () => {}, scrollDOM, oracle: { lineHeight: 20 }, linesPerPage: () => 12 }
        expect(core.scrollLineDown(t as never)).toBe(true)
        expect(scrollDOM.scrollTop).toBe(120)
        core.scrollLineUp(t as never)
        expect(scrollDOM.scrollTop).toBe(100)
        core.scrollPageDown(t as never)
        expect(scrollDOM.scrollTop).toBe(100 + 10 * 20)
        core.scrollPageUp(t as never)
        expect(scrollDOM.scrollTop).toBe(100)
    })
})
