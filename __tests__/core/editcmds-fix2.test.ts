// F5b 第 2 轮:编辑命令 / 键位对齐 Monaco 0.52(macOS 默认键位)。期望值全是对照页上 Monaco 的实测(/tmp/lc-hunt/h-edit/*.log)。
import { describe, expect, it } from 'vitest'
import { mount, setMacPlatform } from './f5-replay'

setMacPlatform()
const lm = await import('../../src/litemonaco')
const core = await import('../../src/core/index')
const mods = { lm, core }

type Step = string | { type: string } | { cmd: string }

function run(doc: string, steps: Step[], opts: { tabSize?: number, insertSpaces?: boolean } = {}): string {
    const r = mount(mods, { doc, ...opts })
    try {
        for (const s of steps) {
            if (typeof s === 'string') r.press(s)
            else if ('type' in s) r.type(s.type)
            else {
                const c: unknown = Reflect.get(core, s.cmd)
                if (typeof c !== 'function') throw new Error('no cmd ' + s.cmd)
                c(r.view)
            }
        }
        return r.result()
    } finally { r.destroy() }
}

const cases: [string, string, Step[], string, { tabSize?: number, insertSpaces?: boolean }?][] = [
    // E6 Join Lines
    ['join sel', '⟨a\n  b\n  c⟩\nd\n', [{ cmd: 'joinLines' }], '⟨a b c⟩\nd\n'],
    ['join trailing ws', 'a   ‸\n   b\n', ['Control+j'], 'a ‸b\n'],
    ['join multi cursor', 'a‸\nb\nc‸\nd\n', ['Control+j'], 'a‸ b\nc‸ d\n'],
    ['join sel within line', 'a⟨b⟩c\nd\n', ['Control+j'], 'a⟨b⟩c d\n'],
    ['join sel ends col0', '⟨a\n⟩b\nc\n', ['Control+j'], '⟨a ⟩b\nc\n'],
    ['join line ending with space', 'a ‸\nb\n', ['Control+j'], 'a ‸b\n'],
    ['join blank then indented', 'a‸\n\n   b\n', ['Control+j', 'Control+j'], 'a‸ b\n'],
    ['join next starts with )', 'f(‸\n)\n', ['Control+j'], 'f(‸ )\n'],
    // E7 Shift+Cmd+L / Cmd+F2
    ['shift cmd l word', 'foo fo‸o xfoo foo\n', ['Shift+Meta+l'], '⟨foo⟩ ⟨foo⟩ xfoo ⟨foo⟩\n'],
    ['shift cmd l case', '⟨foo⟩ Foo FOO\n', ['Shift+Meta+l'], '⟨foo⟩ ⟨Foo⟩ ⟨FOO⟩\n'],
    ['cmd f2', 'foo fo‸o xfoo foo\n', ['Meta+F2'], '⟨foo⟩ ⟨foo⟩ xfoo ⟨foo⟩\n'],
    // E8/E26 Sort
    ['sort cursor only', 'c\nb‸\na\n', [{ cmd: 'sortLines' }], '⟨a\nb\nc\n⟩'],
    ['sort case', '⟨b\nB\na\nA⟩\n', [{ cmd: 'sortLines' }], '⟨a\nA\nb\nB⟩\n'],
    ['sort partial lines', 'x⟨c\nb\na⟩y\n', [{ cmd: 'sortLines' }], 'a⟨y\nb\nx⟩c\n'],
    ['sort multi sel', '⟨b\na⟩\nx\n⟨d\nc⟩\n', [{ cmd: 'sortLines' }], '⟨a\nb⟩\nx\n⟨c\nd⟩\n'],
    ['sort unicode', '⟨é\ne\nz\nä⟩\n', [{ cmd: 'sortLines' }], '⟨ä\ne\né\nz⟩\n'],
    ['sort sel col0 end', '⟨c\nb\n⟩a\n', [{ cmd: 'sortLines' }], '⟨b\nc\n⟩a\n'],
    ['sort numbers', '⟨10\n9\n1\n2⟩\n', [{ cmd: 'sortLines' }], '⟨1\n10\n2\n9⟩\n'],
    ['sort desc', '⟨a\nc\nb⟩\n', [{ cmd: 'sortLinesDescending' }], '⟨c\nb\na⟩\n'],
    ['sort empty lines', '⟨b\n\na⟩\n', [{ cmd: 'sortLines' }], '⟨\na\nb⟩\n'],
    // E9 Delete Duplicate Lines
    ['dup sel', '⟨a\nb\na\nb⟩\n', [{ cmd: 'deleteDuplicateLines' }], '⟨a\n⟩b\n'],
    ['dup whole doc cursor', 'a\na‸\nb\na\n', [{ cmd: 'deleteDuplicateLines' }], 'a\nb‸\n'],
    ['dup adjacent', '⟨a\na\na⟩\nb\n', [{ cmd: 'deleteDuplicateLines' }], '‸a\nb\n'],
    ['dup trailing ws distinct', '⟨a\na \na⟩\n', [{ cmd: 'deleteDuplicateLines' }], '⟨a\na⟩ \n'],
    // E10 / E11 自动闭合
    ['/** autoclose', '‸\n', [{ type: '/**' }], '/**‸ */\n'],
    ['/** then enter', '‸\n', [{ type: '/**' }, 'Enter'], '/**\n * ‸\n */\n'],
    ['" in template ${}', 'x = `a${‸}`\n', [{ type: '"' }], 'x = `a${"‸"}`\n'],
    // E12 Transpose
    ['ctrl t mid', 'ab‸c\n', ['Control+t'], 'acb‸\n'],
    ['ctrl t eol', 'abcd‸\n', ['Control+t'], 'abdc‸\n'],
    ['ctrl t bol', '‸abcd\n', ['Control+t'], '‸abcd\n'],
    ['ctrl t emoji', 'a😀‸b\n', ['Control+t'], 'ab😀‸\n'],
    ['ctrl t empty line', 'a\n‸\nb\n', ['Control+t'], '\na‸\nb\n'],
    ['ctrl t line2 col0', 'ab\n‸cd\n', ['Control+t'], 'abc\n‸d\n'],
    // E13 Cmd+Enter 单独成撤销组
    ['undo after cmd enter', 'a‸b\n', ['Meta+Enter', { type: 'x' }, 'Meta+z'], 'ab\n‸\n'],
    ['undo after shift cmd enter', 'a‸b\n', ['Shift+Meta+Enter', { type: 'x' }, 'Meta+z'], '‸\nab\n'],
    // E14 Cmd+]
    ['cmd ] empty line', '‸\nx\n', ['Meta+]'], '    ‸\nx\n'],
    ['cmd ] ws-only mid', '  ‸  \nx\n', ['Meta+]'], '        ‸\nx\n'],
    ['cmd ] ws-only start', '‸    \nx\n', ['Meta+]'], '        ‸\nx\n'],
    ['cmd ] empty line tabs', '‸\nx\n', ['Meta+]'], '\t‸\nx\n', { insertSpaces: false }],
    ['cmd ] text line', 'a‸b\n', ['Meta+]'], '    a‸b\n'],
    // E17 trim 跳过字符串 / 正则
    ['trim ws in template', 'x = `a  \nb`  \n‸', [{ cmd: 'deleteTrailingWhitespace' }], 'x = `a  \nb`\n‸'],
    ['trim in string', 'x = "a  \nb‸\n', [{ cmd: 'deleteTrailingWhitespace' }], 'x = "a  \nb‸\n'],
    ['trim in block comment', '/* a  \n b */\n‸', [{ cmd: 'deleteTrailingWhitespace' }], '/* a\n b */\n‸'],
    // E18 大小写
    ['title sel', '⟨hello world-foo bar_baz⟩\n', [{ cmd: 'transformToTitleCase' }], '⟨Hello World-Foo Bar_Baz⟩\n'],
    ['title apostrophe', "⟨don't stop⟩\n", [{ cmd: 'transformToTitleCase' }], "⟨Don't Stop⟩\n"],
    ['snake kebab', '⟨foo-bar⟩\n', [{ cmd: 'transformToSnakeCase' }], '⟨foo-bar⟩\n'],
    ['snake acronym', '⟨XMLHttpRequest⟩\n', [{ cmd: 'transformToSnakeCase' }], '⟨xml_http_request⟩\n'],
    ['snake digits', '⟨foo2Bar⟩\n', [{ cmd: 'transformToSnakeCase' }], '⟨foo2_bar⟩\n'],
    ['camel pascal', '⟨FooBar⟩\n', [{ cmd: 'transformToCamelCase' }], '⟨fooBar⟩\n'],
    ['camel upper snake', '⟨FOO_BAR⟩\n', [{ cmd: 'transformToCamelCase' }], '⟨FOOBAR⟩\n'],
    ['camel snake', '⟨foo_bar_baz⟩\n', [{ cmd: 'transformToCamelCase' }], '⟨fooBarBaz⟩\n'],
    ['camel spaces', '⟨foo bar baz⟩\n', [{ cmd: 'transformToCamelCase' }], '⟨fooBarBaz⟩\n'],
    ['kebab acronym', '⟨getHTTPResponse⟩\n', [{ cmd: 'transformToKebabCase' }], '⟨get-http-response⟩\n'],
    ['kebab snake', '⟨foo_bar⟩\n', [{ cmd: 'transformToKebabCase' }], '⟨foo-bar⟩\n'],
    ['pascal kebab', '⟨foo-bar⟩\n', [{ cmd: 'transformToPascalCase' }], '⟨FooBar⟩\n'],
    ['pascal spaces', '⟨foo bar⟩\n', [{ cmd: 'transformToPascalCase' }], '⟨FooBar⟩\n'],
    // E22 多光标删词重叠
    ['alt bksp overlapping words', 'foo bar‸ baz‸\n', ['Alt+Backspace', 'Alt+Backspace'], '‸ \n'],
    // E23 相邻行 Alt+↓
    ['alt down adjacent', 'a‸\nb‸\nc\n', ['Alt+ArrowDown'], 'b\na‸\nc\n'],
    ['alt down multi cursor', 'a‸1\nb\nc‸1\nd\n', ['Alt+ArrowDown'], 'b\na‸1\nd\nc‸1\n'],
    // E24 Cmd+D 保持反向
    ['cmd d reversed sel', '⟩foo⟨ foo\n', ['Meta+d'], '⟩foo⟨ ⟨foo⟩\n'],
    // E25 撤销后 Cmd+U
    ['undo then cmd u', 'ab‸c\n', [{ type: 'x' }, 'Meta+z', 'Meta+u'], 'abc‸\n'],
    // E15 / E19 不落到浏览器、不删
    ['meta shift delete', 'a‸bc\n', ['Meta+Shift+Delete'], 'a‸bc\n'],
    ['sel meta shift backspace', 'a⟨bc⟩d\n', ['Meta+Shift+Backspace'], 'a⟨bc⟩d\n'],
    ['sel alt shift backspace', 'a⟨bc⟩d\n', ['Alt+Shift+Backspace'], 'a⟨bc⟩d\n'],
    // H15/E16 inPlaceReplace
    ['inplace down bool', 'x = tr‸ue\n', ['Shift+Meta+.'], 'x = ⟨false⟩\n'],
    ['inplace up number', 'x = 4‸2\n', ['Shift+Meta+,'], 'x = 4‸1\n'],
    ['inplace sel', 'x = ⟨true⟩\n', ['Shift+Meta+.'], 'x = ⟨false⟩\n'],
]

describe('F5b 编辑命令对齐 Monaco', () => {
    for (const [name, doc, steps, want, opts] of cases)
        it(name, () => expect(run(doc, steps, opts)).toBe(want))
})

describe('F5b 键位', () => {
    it('Alt+PageDown / PageUp、⌘⇧⌫ 等不落到浏览器(preventDefault)', () => {
        const r = mount(mods, { doc: 'a‸bc\n' })
        try {
            for (const k of ['Alt+PageDown', 'Alt+PageUp', 'Alt+Shift+PageDown', 'Meta+Shift+Delete', 'Meta+Shift+Backspace', 'Alt+Shift+Delete'])
                expect(r.press(k).defaultPrevented, k).toBe(true)
        } finally { r.destroy() }
    })
    it('只按修饰键不 preventDefault;⌘T 不绑', () => {
        const r = mount(mods, { doc: 'a‸bc\n' })
        try {
            for (const key of ['Meta', 'Control', 'Alt', 'Shift']) {
                const e = r.pressRaw({ key, keyCode: 0, metaKey: key === 'Meta', ctrlKey: key === 'Control', altKey: key === 'Alt', shiftKey: key === 'Shift' })
                expect(e.defaultPrevented, key).toBe(false)
            }
            const before = r.result()
            r.press('Meta+t')
            expect(r.result()).toBe(before)
        } finally { r.destroy() }
    })
    it('F7 / Shift+F7 在同词高亮间跳', () => {
        const r = mount(mods, { doc: 'let foo‸ = 1\nconsole.log(foo)\nconsole.log(foo)\n' })
        try {
            const pos = () => r.view.state.selection.main.head
            r.press('F7')
            expect(pos()).toBe(12 + 12)
            r.press('F7')
            expect(pos()).toBe(12 + 17 + 12)
            r.press('F7')
            expect(pos()).toBe(4)
            r.press('Shift+F7')
            expect(pos()).toBe(12 + 17 + 12)
        } finally { r.destroy() }
    })
})

const hl = {
    codeToTokens: (code: string) => ({ tokens: code.split('\n').map(l => [{ content: l, offset: 0 }]) }),
    getLastGrammarState: () => ({ getScopes: () => undefined }),
    getLoadedLanguages: () => ['typescript', 'text'],
    getTheme: () => ({ bg: '#1e1e1e', fg: '#d4d4d4', type: 'dark' as const }),
}
const plain = (parent: HTMLElement, doc: string) => lm.liteMonaco({
    parent, doc, highlighter: hl as never, lang: 'typescript', theme: 'dark-plus',
    features: { autocomplete: false, signatureHelp: false, hover: false, codeActions: false, tsDiagnostics: false, minimap: false, stickyScroll: false },
})

describe('H4 CRLF', () => {
    it('liteMonaco() 按首个换行定 lineSeparator,Enter / ⌘Enter / Join 都用 \\r\\n', () => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const view = plain(parent, 'ab\r\ncd\r\n')
        try {
            expect(view.state.lineBreak).toBe('\r\n')
            expect(view.state.doc.lines).toBe(3)
            view.dispatch(view.state.update({ selection: core.EditorSelection.cursor(1) }))
            core.insertNewline(view)
            expect(view.state.sliceDoc()).toBe('a\r\nb\r\ncd\r\n')
            core.insertNewlineKeepIndent(view)
            core.insertLineAfter(view)
            core.insertLineBefore(view)
            core.insertBlankLine(view)
            expect(view.state.sliceDoc().split('\r\n').join('').includes('\n')).toBe(false)
            const before = view.state.doc.lines
            view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }))
            expect(view.state.doc.lines).toBe(before + 1)
            expect(view.state.sliceDoc().split('\r\n').join('').includes('\n')).toBe(false)
        } finally { view.destroy(); parent.remove() }
    })
    it('LF 文档和没有换行的文档保持 \\n', () => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const a = plain(parent, 'ab\ncd\r\n')
        const b = plain(parent, 'ab')
        try {
            expect(a.state.lineBreak).toBe('\n')
            expect(b.state.lineBreak).toBe('\n')
        } finally { a.destroy(); b.destroy(); parent.remove() }
    })
})

describe('E1 剪贴板焦点', () => {
    it('写剪贴板走临时 textarea 后焦点回到编辑器', () => {
        const desc = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {} })
        const r = mount(mods, { doc: 'a⟨b⟩c\n' })
        try {
            r.view.contentDOM.focus()
            r.press('Meta+c')
            expect(document.activeElement).toBe(r.view.contentDOM)
            expect(r.result()).toBe('a⟨b⟩c\n')
        } finally {
            r.destroy()
            if (desc) Object.defineProperty(navigator, 'clipboard', desc)
            else Reflect.deleteProperty(navigator, 'clipboard')
        }
    })
})

describe('I10 复制 text/html', () => {
    function data() {
        const store = new Map<string, string>()
        return {
            clearData() { store.clear() },
            setData(type: string, value: string) { store.set(type, value) },
            getData(type: string) { return store.get(type) ?? '' },
            store,
        }
    }
    it('单选区写 text/plain 和 text/html,外壳是主题色和等宽字体', async () => {
        const { cutOrCopy } = await import('../../src/core/input/clipboard')
        const r = mount(mods, { doc: '⟨const a = 1⟩\n' })
        try {
            const d = data()
            expect(cutOrCopy(r.view, d, false)).toBe(true)
            expect(d.getData('text/plain')).toBe('const a = 1')
            const html = d.getData('text/html')
            expect(html.startsWith('<div style="color: #d4d4d4;background-color: #1e1e1e;font-family: Menlo, Monaco, \'Courier New\', monospace;')).toBe(true)
            expect(html).toContain('font-weight: normal;font-size: 12px;line-height: 18px;white-space: pre;')
            expect(html).toContain('<span style="color: #d4d4d4;">const a = 1</span>')
            expect(html.endsWith('</div>')).toBe(true)
        } finally { r.destroy() }
    })
    it('多选区不写 text/html', async () => {
        const { cutOrCopy } = await import('../../src/core/input/clipboard')
        const r = mount(mods, { doc: '⟨ab⟩ ⟨cd⟩\n' })
        try {
            const d = data()
            cutOrCopy(r.view, d, false)
            expect(d.getData('text/plain')).toBe('ab\ncd')
            expect(d.getData('text/html')).toBe('')
        } finally { r.destroy() }
    })
    it('plaintext 不写 text/html', async () => {
        const { cutOrCopy } = await import('../../src/core/input/clipboard')
        const r = mount(mods, { doc: '⟨ab⟩\n', lang: 'plaintext' })
        try {
            const d = data()
            cutOrCopy(r.view, d, false)
            expect(d.getData('text/plain')).toBe('ab')
            expect(d.getData('text/html')).toBe('')
        } finally { r.destroy() }
    })
})

describe('I11 只读', () => {
    it('只读时 ⌘V / ⌘X 提示 Cannot edit in read-only editor', async () => {
        const r = mount(mods, { doc: 'a⟨bc⟩d\n', readOnly: true })
        try {
            expect(r.view.state.readOnly).toBe(true)
            // 提示挂在 body 上(fixed,可溢出编辑器)
            for (const k of ['Meta+x', 'Meta+v']) {
                document.querySelectorAll('.cm-readonly-message').forEach(el => el.remove())
                r.press(k)
                await new Promise(res => setTimeout(res, 0)) // ⌘V 走原生 paste 事件,jsdom 里由 f5-replay 异步补发
                expect(document.querySelector('.cm-readonly-message')?.textContent, k).toContain('Cannot edit in read-only editor')
            }
            expect(r.result()).toBe('a⟨bc⟩d\n')
        } finally { r.destroy() }
    })
    it('只读时 Tab 焦点移到下一个可聚焦元素,不弹只读提示', () => {
        const r = mount(mods, { doc: 'a‸b\n', readOnly: true })
        const next = document.createElement('input')
        document.body.appendChild(next)
        try {
            document.querySelectorAll('.cm-readonly-message').forEach(el => el.remove())
            r.view.contentDOM.focus()
            const e = r.press('Tab')
            expect(e.defaultPrevented).toBe(true)
            expect(document.activeElement).toBe(next)
            expect(document.querySelector('.cm-readonly-message')).toBeNull()
            expect(r.result()).toBe('a‸b\n')
        } finally { r.destroy(); next.remove() }
    })
})

describe('Tab 焦点模式是全页单例', () => {
    it('在 A 上打开后,新建的 B 按 Tab 也移走焦点', () => {
        const a = mount(mods, { doc: 'a‸b\n' })
        const b = mount(mods, { doc: 'c‸d\n' })
        const next = document.createElement('input')
        document.body.appendChild(next)
        try {
            a.press('Control+Shift+m')
            expect(core.tabFocusMoves()).toBe(true)
            b.view.contentDOM.focus()
            const e = b.press('Tab')
            expect(e.defaultPrevented).toBe(true)
            expect(document.activeElement).toBe(next)
            expect(b.result()).toBe('c‸d\n')
            b.press('Control+Shift+m')
            expect(core.tabFocusMoves()).toBe(false)
        } finally {
            if (core.tabFocusMoves()) b.press('Control+Shift+m')
            a.destroy(); b.destroy(); next.remove()
        }
    })
})
