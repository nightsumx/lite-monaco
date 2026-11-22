// 第三轮 C 组:补全单项方向键 / 命令面板补登记 / 大小写变换的选区 / 括号匹配 always。
// 真值:Monaco 0.52 源码 + 对照页实测(/tmp/lc-hunt/r3/fix-C/*.ts)。
import { afterEach, describe, expect, it } from 'vitest'
import { setMacPlatform } from './f5-replay'
import type { EditorView } from '../../src/core/view/editorview'

setMacPlatform()
const { liteMonaco } = await import('../../src/litemonaco')
const core = await import('../../src/core/index')
const { defaultPaletteCommands, openCommandPalette } = await import('../../src/core/feature/commandpalette')
const { EditorState } = await import('../../src/core/model/state')
const { EditorSelection } = await import('../../src/core/model/selection')
const { bracketMatchingDecorations } = await import('../../src/core/feature/selectionlayer')

const hl = {
    codeToTokens: (code: string) => ({ tokens: code.split('\n').map(l => [{ content: l, offset: 0 }]) }),
    getLastGrammarState: () => ({ getScopes: () => undefined }),
    getLoadedLanguages: () => ['text'],
    getTheme: () => ({ bg: '#1e1e1e', fg: '#d4d4d4', type: 'dark' as const }),
}

const views: { destroy(): void, dom: HTMLElement }[] = []
afterEach(() => {
    for (const v of views.splice(0)) { v.destroy(); v.dom.parentElement?.remove() }
    document.querySelectorAll('.cm-completionList,.cm-completionDetails').forEach(n => n.remove())
})

function make(text: string) {
    const caret = text.indexOf('|')
    const doc = caret >= 0 ? text.slice(0, caret) + text.slice(caret + 1) : text
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    const view = liteMonaco({ parent, highlighter: hl as never, doc, lang: 'text', theme: 'dark-plus', features: { minimap: false, stickyScroll: false, codeActions: false, signatureHelp: false } })
    views.push(view)
    view.focus()
    view.dispatch(view.state.update({ selection: core.EditorSelection.cursor(caret < 0 ? 0 : caret) }))
    return view
}

const CODES: Record<string, string> = {
    '[': 'BracketLeft', ']': 'BracketRight', '/': 'Slash', '\\': 'Backslash',
    ArrowDown: 'ArrowDown', ArrowUp: 'ArrowUp', PageDown: 'PageDown', PageUp: 'PageUp', Enter: 'Enter', F1: 'F1', Space: 'Space',
}
function codeOf(k: string): string {
    if (CODES[k]) return CODES[k]
    if (/^[a-z]$/i.test(k)) return 'Key' + k.toUpperCase()
    if (/^\d$/.test(k)) return 'Digit' + k
    return k
}
function press(target: EventTarget, k: string, mods: KeyboardEventInit = {}) {
    const key = k === 'Space' ? ' ' : k
    const e = new KeyboardEvent('keydown', { key, code: codeOf(k), bubbles: true, cancelable: true, ...mods })
    target.dispatchEvent(e)
    return e
}
const tick = () => new Promise(r => setTimeout(r, 0))
async function settle(n = 6) { for (let i = 0; i < n; i++) await tick() }
// 补全控件状态:经 SuggestUi(真实路径 SuggestModel → SuggestUi)读
const cs = (view: EditorView) => {
    const ui = core.suggestUi(view)
    return {
        open: ui.state.open,
        options: ui.state.open && ui.host ? Array.from({ length: ui.state.count }, (_, i) => ({ label: ui.host!.rowAt(i).label })) : [],
        selected: ui.state.selected,
    }
}

// 'Mac 键位显示' → 按键序列:'⌘K ⌘L' → [[k,{meta}],[l,{meta}]]
function strokes(kb: string): [string, KeyboardEventInit][] {
    return kb.split(' ').map((chord) => {
        const mods: KeyboardEventInit = {}
        let i = 0
        for (; i < chord.length && '⌃⌥⇧⌘'.includes(chord[i]); i++) {
            if (chord[i] === '⌃') mods.ctrlKey = true
            if (chord[i] === '⌥') mods.altKey = true
            if (chord[i] === '⇧') mods.shiftKey = true
            if (chord[i] === '⌘') mods.metaKey = true
        }
        const rest = chord.slice(i)
        const key = rest === '↓' ? 'ArrowDown' : rest === '↑' ? 'ArrowUp' : rest.length === 1 ? rest.toLowerCase() : rest
        return [key, mods]
    })
}

describe('补全:只有一项时 ↑↓/PgUp/PgDn 不归列表(Monaco precondition MultipleSuggestions)', () => {
    const DOC = 'const o = { alpha: 1 }\no.al|\n'
    async function opened() {
        const view = make(DOC)
        core.suggestTrigger(view)
        await settle()
        expect(cs(view).open).toBe(true)
        expect(cs(view).options.map(o => o.label)).toEqual(['alpha'])
        return view
    }
    it('↓:列表关、光标下移,再按 Enter 是换行', async () => {
        const view = await opened()
        press(view.contentDOM, 'ArrowDown')
        expect(cs(view).open).toBe(false)
        expect(view.state.doc.lineAt(view.state.selection.main.head).number).toBe(3)
        press(view.contentDOM, 'Enter')
        expect(view.state.doc.toString()).toBe('const o = { alpha: 1 }\no.al\n\n')
    })
    it('↑:列表关、光标上移', async () => {
        const view = await opened()
        press(view.contentDOM, 'ArrowUp')
        expect(cs(view).open).toBe(false)
        expect(view.state.doc.lineAt(view.state.selection.main.head).number).toBe(1)
    })
    it('PageDown / PageUp:不翻列表,交给编辑器', async () => {
        for (const k of ['PageDown', 'PageUp']) {
            const view = await opened()
            const before = view.state.selection.main.head
            press(view.contentDOM, k)
            expect(cs(view).open).toBe(false)
            expect(view.state.selection.main.head).not.toBe(before)
        }
    })
    it('多项时 ↓ / ⌘↓ / ⌃N 移动选中项,↑ / ⌘↑ / ⌃P 反向', async () => {
        const view = make('alpha alps all\nal|')
        core.suggestTrigger(view)
        await settle()
        expect(cs(view).options.length).toBeGreaterThan(1)
        press(view.contentDOM, 'ArrowDown')
        expect(cs(view).selected).toBe(1)
        press(view.contentDOM, 'ArrowDown', { metaKey: true })
        expect(cs(view).selected).toBe(2)
        press(view.contentDOM, 'ArrowUp', { metaKey: true })
        expect(cs(view).selected).toBe(1)
        press(view.contentDOM, 'n', { ctrlKey: true })
        expect(cs(view).selected).toBe(2)
        press(view.contentDOM, 'p', { ctrlKey: true })
        expect(cs(view).selected).toBe(1)
        expect(cs(view).open).toBe(true)
        expect(view.state.selection.main.head).toBe(view.state.doc.length)
    })
})

describe('命令面板:补登记折叠/注释等命令,快捷键显示与实际绑定一致', () => {
    const FOLD_DOC = 'function a() {\n    if (x) {\n        y()\n    }\n}\nfunction b() {\n    z()\n}\n'
    const byLabel = (label: string) => defaultPaletteCommands().find(c => c.label === label)

    it('Monaco 原文标签都在', () => {
        const labels = new Set(defaultPaletteCommands().map(c => c.label))
        for (const l of [
            'Fold', 'Unfold', 'Fold All', 'Unfold All', 'Toggle Fold', 'Fold Recursively', 'Unfold Recursively',
            ...[1, 2, 3, 4, 5, 6, 7].map(n => `Fold Level ${n}`),
            'Go to Parent Fold', 'Create Folding Range from Selection',
            'Toggle Line Comment', 'Toggle Block Comment', 'Sort Lines Ascending',
            'Convert Indentation to Spaces', 'Convert Indentation to Tabs', 'Show or Focus Hover',
            'Move Line Up', 'Move Line Down', 'Add Cursor Above', 'Add Cursor Below', 'Insert Line Above', 'Insert Line Below',
            'Go to Bracket', 'Trim Trailing Whitespace', 'Cursor Undo', 'Cursor Redo',
            'Add Selection to Next Find Match', 'Move Last Selection to Next Find Match', 'Select All Occurrences of Find Match',
        ]) expect(labels.has(l), l).toBe(true)
        // 改成 Monaco 原文的旧标签不再出现
        for (const old of ['Sort Lines', 'Fold Selection', 'Go to Parent Folding Range', 'Show Hover'])
            expect(labels.has(old), old).toBe(false)
    })

    it('快捷键显示(Mac):折叠键位与 litemonaco.ts foldBindings 一致,⌘K 和弦带空格', () => {
        expect(byLabel('Fold')?.keybinding).toBe('⌥⌘[')
        expect(byLabel('Unfold')?.keybinding).toBe('⌥⌘]')
        expect(byLabel('Toggle Fold')?.keybinding).toBe('⌘K ⌘L')
        expect(byLabel('Fold All')?.keybinding).toBe('⌘K ⌘0')
        expect(byLabel('Unfold All')?.keybinding).toBe('⌘K ⌘J')
        expect(byLabel('Fold Recursively')?.keybinding).toBe('⌘K ⌘[')
        expect(byLabel('Unfold Recursively')?.keybinding).toBe('⌘K ⌘]')
        for (let n = 1; n <= 7; n++) expect(byLabel(`Fold Level ${n}`)?.keybinding).toBe(`⌘K ⌘${n}`)
        expect(byLabel('Toggle Line Comment')?.keybinding).toBe('⌘/')
        expect(byLabel('Toggle Block Comment')?.keybinding).toBe('⇧⌥A')
        expect(byLabel('Trigger Suggest')?.keybinding).toBe('⌃Space')
        expect(byLabel('Replace')?.keybinding).toBe('⌥⌘F')
        expect(byLabel('Show or Focus Hover')?.keybinding).toBe('⌘K ⌘I')
        // 第四轮补上了 Monaco 的 ⌘K ⌘,(r4p-fix.test.ts 真按验证)
        expect(byLabel('Create Folding Range from Selection')?.keybinding).toBe('⌘K ⌘,')
    })

    it('显示的键真按下去,和从面板执行效果相同', () => {
        const checks = ['Fold', 'Toggle Fold', 'Fold All', 'Fold Recursively', 'Fold Level 2', 'Toggle Line Comment', 'Toggle Block Comment',
            'Move Line Down', 'Copy Line Down', 'Add Cursor Below', 'Insert Line Below', 'Go to Bracket', 'Join Lines', 'Transpose Letters',
            'Add Selection to Next Find Match', 'Select All Occurrences of Find Match', 'Indent Line', 'Delete Line']
        for (const label of checks) {
            // Fold Level N 跳过包含光标行的块(Monaco),光标放在第 1 行才折得到第 2 层的 if
            const at = label === 'Fold Recursively' ? FOLD_DOC.indexOf('if') : label === 'Fold Level 2' ? 0 : FOLD_DOC.indexOf('y()') + 1
            const cmd = byLabel(label)
            expect(cmd?.keybinding, label).toBeTruthy()
            const viaPalette = make(FOLD_DOC)
            viaPalette.dispatch(viaPalette.state.update({ selection: core.EditorSelection.cursor(at) }))
            cmd!.run(viaPalette)
            const changed = viaPalette.state.doc.toString() !== FOLD_DOC || viaPalette.state.selection.ranges.length !== 1
                || viaPalette.state.selection.main.head !== at || viaPalette.state.selection.main.anchor !== at
                || viaPalette.state.field(core.foldField).size > 0
            expect(changed, `${label} 在这个文档上要有效果`).toBe(true)
            const viaKey = make(FOLD_DOC)
            viaKey.dispatch(viaKey.state.update({ selection: core.EditorSelection.cursor(at) }))
            for (const [k, mods] of strokes(cmd!.keybinding!)) press(viaKey.contentDOM, k, mods)
            expect(viaKey.state.doc.toString(), label).toBe(viaPalette.state.doc.toString())
            expect(viaKey.state.selection.ranges.map(r => [r.anchor, r.head]), label).toEqual(viaPalette.state.selection.ranges.map(r => [r.anchor, r.head]))
            expect([...viaKey.state.field(core.foldField)], label).toEqual([...viaPalette.state.field(core.foldField)])
        }
        expect([...make(FOLD_DOC).state.field(core.foldField)]).toEqual([])
    }, 60_000)

    it('面板里执行 Fold All / Unfold All', async () => {
        const view = make(FOLD_DOC)
        openCommandPalette(view)
        const input = view.dom.querySelector('.cm-quick-input-input') as HTMLInputElement
        input.value = '>fold all'
        input.dispatchEvent(new Event('input', { bubbles: true }))
        const first = view.dom.querySelector('.cm-quick-input-row.focused .cm-quick-input-label')?.textContent
        expect(first).toBe('Fold All')
        press(input, 'Enter')
        await settle(2)
        expect(view.state.field(core.foldField).size).toBeGreaterThan(0)
    })

    it('⌘K 和弦键帽:⌘ K ⌘ L,中间一个和弦分隔', () => {
        const view = make(FOLD_DOC)
        openCommandPalette(view)
        const input = view.dom.querySelector('.cm-quick-input-input') as HTMLInputElement
        input.value = '>toggle fold'
        input.dispatchEvent(new Event('input', { bubbles: true }))
        const row = [...view.dom.querySelectorAll('.cm-quick-input-row')].find(r => r.querySelector('.cm-quick-input-label')?.textContent === 'Toggle Fold')!
        const kb = row.querySelector('.cm-quick-input-kb')!
        expect([...kb.children].map(c => `${c.className}:${c.textContent}`)).toEqual([
            'cm-keybinding-key:⌘', 'cm-keybinding-key:K', 'cm-keybinding-chord-sep: ', 'cm-keybinding-key:⌘', 'cm-keybinding-key:L',
        ])
        expect(row.getAttribute('aria-label')).toBe('Toggle Fold, Command+K Command+L') // Monaco AriaLabelProvider(r5 O 组)
    })

    it('面板开着再按 F1:保留输入,选中 > 之后的过滤词(Monaco quickAccess.show 同前缀)', () => {
        const view = make('abc')
        press(view.contentDOM, 'F1')
        const input = view.dom.querySelector('.cm-quick-input-input') as HTMLInputElement
        expect(document.activeElement).toBe(input)
        input.value = '>fold'
        input.setSelectionRange(5, 5)
        input.dispatchEvent(new Event('input', { bubbles: true }))
        const e = press(input, 'F1')
        expect(e.defaultPrevented).toBe(true)
        expect(input.value).toBe('>fold')
        expect([input.selectionStart, input.selectionEnd]).toEqual([1, 5])
        expect(view.dom.querySelectorAll('.cm-quick-input-row').length).toBeGreaterThan(0)
    })

    it('Go to Line 开着按 F1:换成命令前缀,保留过滤词(Monaco 改写前缀)', () => {
        const view = make('abc')
        core.openGotoLine(view)
        const input = view.dom.querySelector('.cm-quick-input-input') as HTMLInputElement
        input.value = ':fo'
        input.dispatchEvent(new Event('input', { bubbles: true }))
        openCommandPalette(view)
        expect(input.value).toBe('>fo')
    })

    it('无匹配项时 Enter 面板不关(Monaco 同:列表空,Enter 无动作)', () => {
        const view = make('abc')
        openCommandPalette(view)
        const input = view.dom.querySelector('.cm-quick-input-input') as HTMLInputElement
        input.value = '>zzzzq'
        input.dispatchEvent(new Event('input', { bubbles: true }))
        press(input, 'Enter')
        expect(view.dom.querySelector('.cm-quick-input')).not.toBeNull()
    })
})

describe('Transform to Uppercase 等:选区跟 Monaco(executeEdits 无 cursorState,光标靠 tracked range 搬)', () => {
    type Case = [cmd: keyof typeof core, doc: string, sels: [number, number][], doc2: string, sels2: [number, number][]]
    // 每条都是 /tmp/lc-hunt/r3/fix-C/casing.ts 在 Monaco 上的实测
    const cases: Case[] = [
        ['transformToUppercase', 'let fooBar = 1', [[6, 6]], 'let FOOBAR = 1', [[6, 6]]],
        ['transformToUppercase', 'let fooBar = 1', [[4, 4]], 'let FOOBAR = 1', [[4, 4]]],
        ['transformToUppercase', 'let fooBar = 1', [[10, 10]], 'let FOOBAR = 1', [[10, 10]]],
        ['transformToUppercase', 'let fooBar = 1', [[11, 11]], 'let fooBar = 1', [[11, 11]]],
        ['transformToUppercase', 'let fooBar = 1', [[4, 10]], 'let FOOBAR = 1', [[4, 10]]],
        ['transformToUppercase', 'let fooBar = 1', [[10, 4]], 'let FOOBAR = 1', [[10, 4]]],
        ['transformToSnakeCase', 'let fooBar = 1', [[6, 6]], 'let foo_bar = 1', [[6, 6]]],
        ['transformToSnakeCase', 'let fooBar = 1', [[4, 10]], 'let foo_bar = 1', [[4, 11]]],
        ['transformToSnakeCase', 'let fooBar = 1', [[10, 4]], 'let foo_bar = 1', [[11, 4]]],
        ['transformToSnakeCase', 'let fooBar = 1', [[10, 10]], 'let foo_bar = 1', [[11, 11]]],
        ['transformToSnakeCase', 'let fooBar = 1', [[4, 4]], 'let foo_bar = 1', [[4, 4]]],
        ['transformToTitleCase', 'hello world', [[2, 2], [8, 8]], 'Hello World', [[2, 2], [8, 8]]],
        ['transformToKebabCase', 'a fooBar fooBar', [[4, 4], [11, 11]], 'a foo-bar foo-bar', [[4, 4], [12, 12]]],
        ['transformToUppercase', 'straße x', [[2, 2]], 'STRASSE x', [[2, 2]]],
        ['transformToUppercase', 'straße x', [[0, 6]], 'STRASSE x', [[0, 7]]],
    ]
    for (const [cmd, doc, sels, doc2, sels2] of cases) {
        it(`${cmd} ${JSON.stringify(doc)} ${JSON.stringify(sels)}`, () => {
            let state = EditorState.create({
                doc,
                selection: EditorSelection.create(sels.map(([a, h]) => EditorSelection.range(a, h))),
                extensions: [EditorState.allowMultipleSelections.of(true)],
            })
            const run = core[cmd] as (t: { state: typeof state, dispatch: (tr: { apply(): typeof state }) => void }) => boolean
            run({ state, dispatch: (tr) => { state = tr.apply() } })
            expect(state.doc.toString()).toBe(doc2)
            expect(state.selection.ranges.map(r => [r.anchor, r.head])).toEqual(sels2)
        })
    }
    it('空光标落在标点上:不改(Monaco getWordAtPosition 只认 Regular 词)', () => {
        let state = EditorState.create({ doc: 'a -- b', selection: EditorSelection.cursor(3) })
        const ok = core.transformToKebabCase({ state, dispatch: (tr) => { state = tr.apply() } })
        expect(ok).toBe(false)
        expect(state.doc.toString()).toBe('a -- b')
    })
})

describe('括号匹配:贴着括号匹配那一对,否则高亮包住光标的最近一对(Monaco matchBrackets: always)', () => {
    const marks = (doc: string, sels: [number, number][]) => {
        const state = EditorState.create({
            doc,
            selection: EditorSelection.create(sels.map(([a, h]) => EditorSelection.range(a, h))),
            extensions: [EditorState.allowMultipleSelections.of(true)],
        })
        const out: number[] = []
        const it = bracketMatchingDecorations(state).iter()
        while (it.value) { out.push(it.from); it.next() }
        return out.sort((a, b) => a - b)
    }
    // 每条都是 /tmp/lc-hunt/r3/fix-C/br-diff.ts 在 Monaco 上的实测(bracket-match 装饰起点)
    const cases: [string, [number, number][], number[]][] = [
        ['(abc)', [[2, 2]], [0, 4]],
        ['(abc)', [[0, 0]], [0, 4]],
        ['(abc)', [[1, 1]], [0, 4]],
        ['(abc)', [[4, 4]], [0, 4]],
        ['(abc)', [[5, 5]], [0, 4]],
        ['((ab))', [[1, 1]], [1, 4]],
        ['((ab))', [[5, 5]], [0, 5]],
        ['((ab))', [[3, 3]], [1, 4]],
        ['f()(x)', [[3, 3]], [3, 5]],
        ['a(b)c', [[4, 4]], [1, 3]],
        ['a(b)c', [[3, 3]], [1, 3]],
        ['{ [ ( x ) ] }', [[6, 6]], [4, 8]],
        ['{ [ x ( y ] }', [[4, 4]], [2, 10]],
        ['( x', [[2, 2]], []],
        ['x )', [[1, 1]], []],
        ['{ a ( b }', [[6, 6]], [0, 8]],
        ['(a) (b)', [[1, 1], [5, 5]], [0, 2, 4, 6]],
        ['(abc) x', [[1, 3]], []],
        ['(abc) x', [[6, 6]], []],
        ['// (\nf(x)', [[7, 7]], [6, 8]],
        ['a\n{\n  b\n}\n', [[6, 6]], [2, 8]],
        ['{\n\n}', [[2, 2]], [0, 3]],
    ]
    for (const [doc, sels, want] of cases)
        it(`${JSON.stringify(doc)} ${JSON.stringify(sels)} → ${JSON.stringify(want)}`, () => expect(marks(doc, sels)).toEqual(want))

    it('br1:光标不贴括号,高亮外层函数体的 { }', () => {
        const doc = 'function f() {\n    const a = 1\n    return a\n}\n'
        expect(marks(doc, [[doc.indexOf('a = 1'), doc.indexOf('a = 1')]])).toEqual([13, doc.lastIndexOf('}')])
    })

    it('大文档 / 超长行:有界,不卡', () => {
        const pad = 'x'.repeat(1000) + '\n'
        const doc = '{\n' + pad.repeat(3000) + '(' + 'y'.repeat(200_000) + ')\n' + pad.repeat(3000) + '}\n'
        const mid = doc.indexOf('(') + 100_000
        let state = EditorState.create({ doc, selection: EditorSelection.cursor(mid) })
        let total = 0
        for (let i = 0; i < 20; i++) {
            state = state.update({ selection: EditorSelection.cursor(mid + i) }).apply()
            const t0 = performance.now()
            bracketMatchingDecorations(state)
            total += performance.now() - t0
        }
        // 窗口外的外层 { } 不找(有界),窗口内的 ( ) 也在 4 万字符外 → 空
        expect(total / 20).toBeLessThan(20) // Monaco 给 matchBracket / findEnclosingBrackets 各 20ms
    })
})
