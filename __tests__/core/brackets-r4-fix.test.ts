// 第四轮 B 组:括号匹配 / 彩虹括号 / Go to Bracket / Select to Bracket / Remove Brackets 跳过字符串、
// 注释、正则、模板串字面部分里的括号;两个新命令的语义、面板登记和键位。
// 真值:Monaco 0.52 对照页实测(/tmp/lc-hunt/r4/B/mon-match.ts、mon-color.ts、mon-cmd.ts、mon-multi.ts、
// mon-kb.ts、typing.ts)。token 用真 shiki(typescript + dark-plus),和对照页右侧同一套。
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createHighlighter, type Highlighter } from 'shiki'
import { parse, render, setMacPlatform } from './f5-replay'
import type { EditorView } from '../../src/core/view/editorview'
import type { StateCommand, Transaction } from '../../src/core/model/state'

setMacPlatform()
const { liteMonaco } = await import('../../src/litemonaco')
const core = await import('../../src/core/index')
const { EditorState } = await import('../../src/core/model/state')
const { EditorSelection } = await import('../../src/core/model/selection')
const { bracketMatchingDecorations } = await import('../../src/core/feature/selectionlayer')
const { bracketColorDecorations } = await import('../../src/core/feature/bracketcolor')
const { selectTokenCache, ensureTokenCache, prepareLinesFromTransaction } = await import('../../src/core/view/tokens')
const brackets = await import('../../src/core/edit/brackets')
const { defaultPaletteCommands } = await import('../../src/core/feature/commandpalette')
const { indentOnCloseBracket } = await import('../../src/core/edit/indentoninput')

const OPTS = { lang: 'typescript', theme: 'dark-plus' }
let hl: Highlighter
beforeAll(async () => {
    hl = await createHighlighter({ themes: ['dark-plus'], langs: ['typescript'] })
})

// 不建 view 也能带 token:给一个 owner 对象建自己的 token 缓存(同 EditorView 每个 view 一份)
function tokenized(owner: object, doc: string) {
    selectTokenCache(owner)
    ensureTokenCache(hl as never, doc.split('\n'), OPTS)
}

function stateOf(spec: string) {
    const { doc, sels } = parse(spec)
    return EditorState.create({
        doc,
        selection: EditorSelection.create(sels.map(([a, h]) => EditorSelection.range(a, h)), 0),
        extensions: [EditorState.allowMultipleSelections.of(true)],
    })
}

describe('括号匹配高亮跳过字符串/注释/正则/模板串字面(Monaco 只认 StandardTokenType.Other 里的括号)', () => {
    const marks = (spec: string, withTokens = true) => {
        const state = stateOf(spec)
        const owner = {}
        if (withTokens) tokenized(owner, state.doc.toString())
        const out: number[] = []
        const it = bracketMatchingDecorations(state, owner).iter()
        while (it.value) { out.push(it.from); it.next() }
        return out
    }
    // mon-match.ts 实测(bracket-match 装饰起点)
    const cases: [string, number[]][] = [
        ['f("(", x‸)', [1, 8]],
        ['f("(‸", x)', [1, 8]],
        ['f(‸"(", x)', [1, 8]],
        ["f('[', ‸x)", [1, 8]],
        ['f(`(`, x‸)', [1, 8]],
        ['f(`${(a‸)}`)', [5, 7]],
        ['f(`${a}‸`)', [4, 6]],
        ['f(`a${‸b}c`)', [5, 7]],
        ['f(/\\(/, x‸)', [1, 9]],
        ['f(/[(]/, x‸)', [1, 10]],
        ['// (\nf(x‸)', [6, 8]],
        ['/* ( */ f(x‸)', [9, 11]],
        ['f(x) // )‸', []],
        ['a = "(" + (b‸)', [10, 12]],
        ['"(abc‸)"', []],
        ['"(abc)‸"', []],
        ['// (a‸)', []],
        ['f("{", [x‸])', [7, 9]],
        ['f(`\n(\n`, x‸)', [1, 10]],
        ['x = `${"(" + y‸}`', [6, 14]],
    ]
    for (const [spec, want] of cases)
        it(`${JSON.stringify(spec)} → ${JSON.stringify(want)}`, () => expect(marks(spec)).toEqual(want))

    it('没有 token 信息时保持纯文本配对(现状)', () => {
        expect(marks('f("(", x‸)', false)).toEqual([3, 8])
    })
})

describe('彩虹括号跳过字符串/注释/正则/模板串字面(mon-color.ts:起点:层级)', () => {
    const PALETTE = ['#000001', '#000002', '#000003', '#000004', '#000005', '#000006']
    const levels = (doc: string) => {
        selectTokenCache(null)
        const set = bracketColorDecorations(hl as never, EditorState.create({ doc }), OPTS, PALETTE)
        const out: string[] = []
        set.between(0, doc.length, (from, _to, deco) => {
            const style = String((deco.spec as { attributes?: { style?: string } }).attributes?.style ?? '')
            out.push(`${from}:${PALETTE.findIndex(c => style.includes(c))}`)
        })
        return out.join(' ')
    }
    const cases: [string, string][] = [
        ['f("(", x)', '1:0 8:0'],
        ['f(`(${(a)})`)', '1:0 5:1 6:2 8:2 9:1 12:0'],
        ['f(/\\(/, [x])', '1:0 8:1 10:1 11:0'],
        ['// (\nf(x)', '6:0 8:0'],
        ['/* ( */ f(x)', '9:0 11:0'],
        ['f(`\n(\n`, x)', '1:0 10:0'],
        ["a('{', {b: [1]})", '1:0 7:1 11:2 13:2 14:1 15:0'],
        ['x = `${"(" + y}`', '6:0 14:0'],
        ['f(`a${b}c`)', '1:0 5:1 7:1 10:0'],
    ]
    for (const [doc, want] of cases)
        it(`${JSON.stringify(doc)} → ${want}`, () => expect(levels(doc)).toBe(want))
})

// 命令:target 自带 token 缓存(owner = target,和 view 一样);dispatch 时照 EditorView.update 先改行表
function runCmd(cmd: StateCommand, spec: string, withTokens = true) {
    let state = stateOf(spec)
    let steps = 0
    const target = {
        get state() { return state },
        dispatch(tr: Transaction) {
            selectTokenCache(target)
            prepareLinesFromTransaction(tr)
            state = tr.apply()
            if (tr.docChanged) steps++
        },
    }
    if (withTokens) tokenized(target, state.doc.toString())
    const ran = cmd(target)
    return { out: render(state.doc.toString(), state.selection.ranges.map(r => [r.anchor, r.head])), ran, steps }
}

// mon-cmd.ts 实测:[起始, Go to Bracket, Select to Bracket, Remove Brackets]
const CMD_CASES: [string, string, string, string][] = [
    ['x‸ ) (a)', 'x ) ‸(a)', 'x ) ⟨(a)⟩', 'x‸ ) (a)'],
    ['x‸ (a) b', 'x ‸(a) b', 'x ⟨(a)⟩ b', 'x‸ (a) b'],
    ['‸x ] (a)', 'x ] ‸(a)', 'x ] ⟨(a)⟩', '‸x ] (a)'],
    ['a(b)‸c', 'a‸(b)c', 'a⟩(b)⟨c', 'ab‸c'],
    ['a‸(b)c', 'a(b‸)c', 'a⟨(b)⟩c', 'a‸bc'],
    ['(a)‸(b)', '(a)(b‸)', '(a)⟨(b)⟩', '(a)‸b'],
    ['f(a, ⟨b⟩)', 'f(a, b‸)', 'f⟨(a, b)⟩', 'fa, ⟨b⟩'],
    ['f(⟨a, b⟩)', 'f(a, b‸)', 'f⟨(a, b)⟩', 'f⟨a, b⟩'],
    ['⟨f(a)⟩', 'f‸(a)', 'f⟨(a)⟩', '⟨fa⟩'],
    ['f(a‸) + g(b‸)', 'f‸(a) + g‸(b)', 'f⟩(a)⟨ + g⟩(b)⟨', 'fa‸ + g(b‸)'],
    ['{ [ x‸ ( y ] }', '{ [ x ( y ‸] }', '{ ⟨[ x ( y ]⟩ }', '{  x‸ ( y  }'],
    ['f(‸)', 'f‸()', 'f⟩()⟨', 'f‸'],
    ['f(g(‸))', 'f(g‸())', 'f(g⟩()⟨)', 'f(g‸)'],
    ['(‸', '(‸', '(‸', '(‸'],
    ['a\n{\n  b‸\n}', 'a\n{\n  b\n‸}', 'a\n⟨{\n  b\n}⟩', 'a\n\n  b‸\n'],
    ['[a, (b‸)]', '[a, ‸(b)]', '[a, ⟩(b)⟨]', '[a, b‸]'],
    ['f("(", x‸)', 'f‸("(", x)', 'f⟩("(", x)⟨', 'f"(", x‸'],
    ['"‸("', '"‸("', '"‸("', '"‸("'],
    ['f(x) // )‸', 'f(x) // )‸', 'f(x) // )‸', 'f(x) // )‸'],
    ['f(⟩a, b⟨)', 'f(a, b‸)', 'f⟨(a, b)⟩', 'f⟩a, b⟨'],
    ['‸', '‸', '‸', '‸'],
]

describe('Go to Bracket(editor.action.jumpToBracket,⇧⌘\\)', () => {
    for (const [start, want] of CMD_CASES)
        it(`${JSON.stringify(start)} → ${JSON.stringify(want)}`, () => expect(runCmd(core.cursorMatchingBracket, start).out).toBe(want))
    it('没动光标返回 false', () => expect(runCmd(core.cursorMatchingBracket, 'f(x) // )‸').ran).toBe(false))
})

describe('Select to Bracket(editor.action.selectToBracket,无默认键位)', () => {
    for (const [start, , want] of CMD_CASES)
        it(`${JSON.stringify(start)} → ${JSON.stringify(want)}`, () => expect(runCmd(brackets.selectToBracket, start).out).toBe(want))
    it('同一对括号的两个光标并成一个选区(mon-cmd:f(a‸, b‸) → f⟩(a, b)⟨)', () => {
        expect(runCmd(brackets.selectToBracket, 'f(a‸, b‸)').out).toBe('f⟩(a, b)⟨')
    })
    it('core 导出', () => expect(core.selectToBracket).toBe(brackets.selectToBracket))
})

describe('Remove Brackets(editor.action.removeBrackets,⌥⌘⌫)', () => {
    for (const [start, , , want] of CMD_CASES)
        it(`${JSON.stringify(start)} → ${JSON.stringify(want)}`, () => expect(runCmd(core.removeBrackets, start).out).toBe(want))

    // mon-multi.ts:每个选区按原来的行列位置、在前一次删除后的文档上找括号;每删一对一个撤销步
    const multi: [string, [number, number][], string, number][] = [
        ['f(a) + g(b)', [[3, 3], [10, 10]], 'fa‸ + g(b‸)', 1],
        ['f(a) + g(b)', [[10, 10], [3, 3]], 'fa‸ + gb‸', 2],
        ['f(a)\ng(b)', [[3, 3], [8, 8]], 'fa‸\ngb‸', 2],
        ['(a) (b) (c)', [[2, 2], [6, 6], [10, 10]], 'a‸ (b‸) c‸', 2],
        ['f(a, b)', [[3, 3], [6, 6]], 'fa‸, b‸', 1],
        ['((a))', [[2, 2], [3, 3]], '‸a‸', 2],
    ]
    for (const [doc, sels, want, steps] of multi) {
        it(`多光标 ${JSON.stringify(doc)} ${JSON.stringify(sels)} → ${JSON.stringify(want)}(${steps} 步)`, () => {
            // Monaco 的选区顺序 = 主选区在前;lite-monaco 的 ranges 按位置排,mainIndex 标主选区
            const ranges = sels.map(([a, h]) => EditorSelection.range(a, h))
            const order = [...ranges].sort((x, y) => x.from - y.from)
            const spec = render(doc, order.map(r => [r.anchor, r.head]))
            const r = runCmdMain(core.removeBrackets, spec, order.indexOf(ranges[0]))
            expect(r.out).toBe(want)
            expect(r.steps).toBe(steps)
        })
    }
    it('只读不改', () => {
        let state = EditorState.create({ doc: 'f(a)', selection: EditorSelection.cursor(3), extensions: [EditorState.readOnly.of(true)] })
        expect(core.removeBrackets({ state, dispatch: tr => { state = tr.apply() } })).toBe(false)
        expect(state.doc.toString()).toBe('f(a)')
    })
})

function runCmdMain(cmd: StateCommand, spec: string, mainIndex: number) {
    const { doc, sels } = parse(spec)
    let state = EditorState.create({
        doc,
        selection: EditorSelection.create(sels.map(([a, h]) => EditorSelection.range(a, h)), mainIndex),
        extensions: [EditorState.allowMultipleSelections.of(true)],
    })
    let steps = 0
    const target = {
        get state() { return state },
        dispatch(tr: Transaction) { state = tr.apply(); if (tr.docChanged) steps++ },
    }
    cmd(target)
    return { out: render(state.doc.toString(), state.selection.ranges.map(r => [r.anchor, r.head])), steps }
}

describe('命令面板登记 + 键位(Monaco 原文标签,显示和实际绑定一致)', () => {
    const views: EditorView[] = []
    afterEach(() => { for (const v of views.splice(0)) { v.destroy(); v.dom.parentElement?.remove() } })
    const byLabel = (l: string) => defaultPaletteCommands().find(c => c.label === l)

    it('Select to Bracket:登记,无键位', () => {
        const c = byLabel('Select to Bracket')
        expect(c).toBeTruthy()
        expect(c!.keybinding).toBeUndefined()
    })
    it('Remove Brackets:Mac 显示 ⌥⌘Backspace(mon-kb.ts:Monaco 标签原文)', () => {
        expect(byLabel('Remove Brackets')?.keybinding).toBe('⌥⌘Backspace')
    })
    it('Go to Bracket 仍是 ⇧⌘\\', () => expect(byLabel('Go to Bracket')?.keybinding).toBe('⇧⌘\\'))

    function mountReal(spec: string) {
        const { doc, sels } = parse(spec)
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const view = liteMonaco({
            parent, highlighter: hl as never, doc, lang: 'typescript', theme: 'dark-plus',
            features: { autocomplete: false, signatureHelp: false, hover: false, codeActions: false, tsDiagnostics: false, minimap: false, stickyScroll: false },
        })
        views.push(view)
        view.focus()
        view.dispatch(view.state.update({ selection: EditorSelection.create(sels.map(([a, h]) => EditorSelection.range(a, h)), 0) }))
        return view
    }
    const press = (view: EditorView, init: KeyboardEventInit & { keyCode: number }) => {
        const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
        Object.defineProperty(e, 'keyCode', { value: init.keyCode })
        view.contentDOM.dispatchEvent(e)
        return e
    }
    const out = (v: EditorView) => render(v.state.doc.toString(), v.state.selection.ranges.map(r => [r.anchor, r.head]))

    it('⌥⌘⌫ 真按键 → Remove Brackets(字符串里的括号不算)', () => {
        const v = mountReal('f("(", x‸)')
        const e = press(v, { key: 'Backspace', code: 'Backspace', keyCode: 8, metaKey: true, altKey: true })
        expect(e.defaultPrevented).toBe(true)
        expect(out(v)).toBe('f"(", x‸')
    })
    it('⇧⌘\\ 真按键 → Go to Bracket(真 view 的 token 缓存)', () => {
        const v = mountReal('f("(", x‸)')
        press(v, { key: '\\', code: 'Backslash', keyCode: 220, metaKey: true, shiftKey: true })
        expect(out(v)).toBe('f‸("(", x)')
    })
    it('面板 Select to Bracket 跑在真 view 上', () => {
        const v = mountReal('f("(", ‸x)')
        expect(byLabel('Select to Bracket')!.run(v)).toBe(true)
        expect(out(v)).toBe('f⟨("(", x)⟩')
    })
    it('高亮层(真 view)跳过字符串里的括号', () => {
        const v = mountReal('f("(", x‸)')
        const got: number[] = []
        const it = bracketMatchingDecorations(v.state, v).iter()
        while (it.value) { got.push(it.from); it.next() }
        expect(got).toEqual([1, 8])
    })
})

describe('闭括号回缩跳过字符串/注释里的括号(typing.ts 实测)', () => {
    const outdent = (spec: string, ch: string) => {
        const state = stateOf(spec)
        const owner = {}
        tokenized(owner, state.doc.toString())
        const at = state.selection.main.head
        const r = indentOnCloseBracket(state, at, ch, brackets.bracketSkip(owner, state.doc))
        const doc = state.doc.toString()
        return r ? doc.slice(0, r.from) + r.insert + doc.slice(r.to) : doc.slice(0, at) + ch + doc.slice(at)
    }
    it('前面字符串里有 {', () => expect(outdent('if (a) {\n    s = "{"\n    ‸', '}')).toBe('if (a) {\n    s = "{"\n}'))
    it('注释里有 {', () => expect(outdent('if (a) {\n    // {\n    ‸', '}')).toBe('if (a) {\n    // {\n}'))
    it('注释里有 }', () => expect(outdent('function f() {\n    if (a) {\n        // }\n        ‸', '}')).toBe('function f() {\n    if (a) {\n        // }\n    }'))
})

describe('回车:字符串里的括号不展开、不多缩进(typing.ts 实测)', () => {
    it('"(‸)" 回车', () => expect(runCmd(core.insertNewlineAndIndent, 'x = "(‸)"').out).toBe('x = "(\n‸)"'))
    it('"{‸}" 回车', () => expect(runCmd(core.insertNewlineAndIndent, 'x = "{‸}"').out).toBe('x = "{\n‸}"'))
    it('代码里照旧展开', () => expect(runCmd(core.insertNewlineAndIndent, 'x = (‸)').out).toBe('x = (\n    ‸\n)'))
})

describe('enclosingBrackets 按需往后推进:和暴力解一致(随机)', () => {
    // 暴力:pos 左边、配对闭括号在 pos 及以后的开括号里最靠右的那只
    const brute = (t: string, p: number, skip?: (i: number) => boolean): [number, number] | null => {
        for (let i = p - 1; i >= 0; i--) {
            if (!'([{'.includes(t[i]) || skip?.(i)) continue
            const j = brackets.matchForward(t, t[i], i, skip)
            if (j >= p) return [i, j]
        }
        return null
    }
    it('2000 组', () => {
        let seed = 7
        const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
        for (let n = 0; n < 2000; n++) {
            const len = 1 + Math.floor(rnd() * 24)
            let t = ''
            for (let k = 0; k < len; k++) t += '()[]{}ab'[Math.floor(rnd() * 8)]
            const mask = [...t].map(() => rnd() < 0.2)
            const skip = (i: number) => mask[i]
            const p = Math.floor(rnd() * (len + 1))
            expect(brackets.enclosingBrackets(t, 0, p)).toEqual(brute(t, p))
            expect(brackets.enclosingBrackets(t, 0, p, skip)).toEqual(brute(t, p, skip))
        }
    })
})

describe('isSkipScopes:按 vscode-textmate 的 StandardTokenType,越靠叶子越算数', () => {
    it('模板串 ${} 里的字符串仍跳过', () => {
        expect(brackets.isSkipScopes(['source.ts', 'string.template.ts', 'meta.template.expression.ts', 'meta.embedded.line.ts', 'string.quoted.double.ts'])).toBe(true)
    })
    it('meta.embedded 重置为 Other', () => {
        expect(brackets.isSkipScopes(['text.html', 'string.quoted.html', 'meta.embedded.block.js'])).toBe(false)
    })
    it('正则', () => expect(brackets.isSkipScopes(['source.ts', 'string.regexp.ts'])).toBe(true))
    it('regex 段名', () => expect(brackets.isSkipScopes(['source.py', 'regex.something'])).toBe(true))
})
