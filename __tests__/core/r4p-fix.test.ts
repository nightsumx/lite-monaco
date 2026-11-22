// 第四轮 P 组:补齐 Monaco 命令(折叠 / 注释 / 缩进)+ 面板与 Monaco 同构。
// 真值:Monaco 0.52.2 源码(contrib/{folding,comment,indentation})+ 对照页实测(/tmp/lc-hunt/r4/P/p-*.ts)。
// 选区写法同 Monaco:[锚点行, 锚点列, 光标行, 光标列],1 起。
import { afterEach, describe, expect, it } from 'vitest'
import { setMacPlatform } from './f5-replay'
import type { EditorView } from '../../src/core/view/editorview'

setMacPlatform()
const { liteMonaco } = await import('../../src/litemonaco')
const core = await import('../../src/core/index')
const { defaultPaletteCommands } = await import('../../src/core/feature/commandpalette')

const hl = {
    codeToTokens: (code: string) => ({ tokens: code.split('\n').map(l => [{ content: l, offset: 0 }]) }),
    getLastGrammarState: () => ({ getScopes: () => undefined }),
    getLoadedLanguages: () => ['text'],
    getTheme: () => ({ bg: '#1e1e1e', fg: '#d4d4d4', type: 'dark' as const }),
}

const views: EditorView[] = []
afterEach(() => {
    for (const v of views.splice(0)) { v.destroy(); v.dom.parentElement?.remove() }
})

type Sel = [number, number, number, number]

function make(doc: string, sels: Sel[] = [[1, 1, 1, 1]], lang = 'text') {
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    const view = liteMonaco({ parent, highlighter: hl as never, doc, lang, theme: 'dark-plus', options: { detectIndentation: false } as never, features: { minimap: false, stickyScroll: false, codeActions: false, signatureHelp: false, tsDiagnostics: false, hover: false, autocomplete: false } })
    views.push(view)
    view.focus()
    select(view, sels)
    return view
}
function pos(view: EditorView, line: number, col: number) {
    return view.state.doc.line(line).from + col - 1
}
function select(view: EditorView, sels: Sel[]) {
    view.dispatch(view.state.update({
        selection: core.EditorSelection.create(sels.map(s => core.EditorSelection.range(pos(view, s[0], s[1]), pos(view, s[2], s[3])))),
    }))
}
function sels(view: EditorView): Sel[] {
    const at = (p: number) => { const l = view.state.doc.lineAt(p); return [l.number, p - l.from + 1] }
    return view.state.selection.ranges.map(r => [...at(r.anchor), ...at(r.head)] as Sel)
}
const folded = (view: EditorView) => [...view.state.field(core.foldField)].sort((a, b) => a - b)
const run = (view: EditorView, label: string) => {
    const cmd = defaultPaletteCommands().find(c => c.label === label)
    expect(cmd, label).toBeTruthy()
    return cmd!.run(view)
}

const CODES: Record<string, string> = {
    '[': 'BracketLeft', ']': 'BracketRight', '/': 'Slash', '\\': 'Backslash', ',': 'Comma', '.': 'Period', '-': 'Minus', '=': 'Equal',
    Enter: 'Enter', ArrowDown: 'ArrowDown', ArrowUp: 'ArrowUp',
}
function codeOf(k: string): string {
    if (CODES[k]) return CODES[k]
    if (/^[a-z]$/i.test(k)) return 'Key' + k.toUpperCase()
    if (/^\d$/.test(k)) return 'Digit' + k
    return k
}
function press(target: EventTarget, k: string, mods: KeyboardEventInit = {}) {
    const e = new KeyboardEvent('keydown', { key: k, code: codeOf(k), bubbles: true, cancelable: true, ...mods })
    target.dispatchEvent(e)
    return e
}
// '⌘K ⇧⌘L' → [[k,{meta}],[l,{meta,shift}]]
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
        return [rest.length === 1 ? (mods.shiftKey ? rest.toUpperCase() : rest.toLowerCase()) : rest, mods]
    })
}
const tick = () => new Promise(r => setTimeout(r, 0))

// 对照页上用的文档(Monaco 的块:1-3 4-9 5-6 8-9 11-15 12-13 16-19 17-18)
// 带 // #region:用有 // region 标记的语言(Monaco plaintext 没有 region 标记)
const DOC = [
    '/**', ' * doc', ' */', 'function a() {', '    if (x) {', '        y()', '    }', '    /* block', '       more */', '}',
    '// #region R1', 'function b() {', '    z()', '}', '// #endregion', 'function c() {', '    if (q) {', '        w()', '    }', '}', '',
].join('\n')

describe('折叠:新命令(Monaco folding.js)', () => {
    it('Fold All Block Comments:起始行以块注释开头的块;光标在被藏的行上 → 挪到块首行行尾', () => {
        const v = make(DOC, [[9, 3, 9, 3]], 'java')
        run(v, 'Fold All Block Comments')
        expect(folded(v)).toEqual([1, 8])
        expect(sels(v)).toEqual([[8, 13, 8, 13]])
    })

    it('Fold All Regions / Unfold All Regions:只动 #region 块', () => {
        const v = make(DOC, [[13, 3, 13, 3]], 'java')
        run(v, 'Fold All Regions')
        expect(folded(v)).toEqual([11])
        expect(sels(v)).toEqual([[11, 14, 11, 14]])
        select(v, [[1, 1, 1, 1]])
        run(v, 'Fold All')
        run(v, 'Unfold All Regions')
        expect(folded(v)).toEqual([1, 4, 5, 8, 12, 16, 17])
    })

    it('Fold All Except Selected:不折选区所在最内层块的祖先、自己和子孙', () => {
        const cases: [Sel[], number[]][] = [
            [[[6, 3, 6, 3]], [1, 8, 11, 12, 16, 17]],
            [[[21, 1, 21, 1]], [1, 4, 5, 8, 11, 12, 16, 17]],
            [[[4, 3, 4, 3]], [1, 11, 12, 16, 17]],
            [[[6, 3, 6, 3], [18, 1, 18, 1]], [1, 8, 11, 12]],
            // 按选区起始行(Monaco startLineNumber),不是光标所在行;被藏的锚点挪到块首行行尾
            [[[18, 3, 6, 3]], [1, 8, 11, 12, 16, 17]],
        ]
        for (const [s, want] of cases) {
            const v = make(DOC, s, 'java')
            run(v, 'Fold All Except Selected')
            expect(folded(v), JSON.stringify(s)).toEqual(want)
        }
        const back = make(DOC, [[18, 3, 6, 3]], 'java')
        run(back, 'Fold All Except Selected')
        expect(sels(back)).toEqual([[16, 15, 6, 3]])
    })

    it('Unfold All Except Selected:选区那一族保持折叠', () => {
        for (const [s, want] of [[[6, 3, 6, 3], [4, 5]], [[16, 3, 16, 3], [16, 17]]] as [Sel, number[]][]) {
            const v = make(DOC, [[1, 1, 1, 1]], 'java')
            run(v, 'Fold All')
            select(v, [s])
            run(v, 'Unfold All Except Selected')
            expect(folded(v), JSON.stringify(s)).toEqual(want)
        }
    })

    it('Toggle Fold Recursively:最内层块没折 → 连里面一起折;折着 → 连里面一起展', () => {
        const v = make(DOC, [[4, 3, 4, 3]], 'java')
        run(v, 'Toggle Fold Recursively')
        expect(folded(v)).toEqual([4, 5, 8])
        run(v, 'Toggle Fold Recursively')
        expect(folded(v)).toEqual([])
        // 先 Fold Level 2(5 8 12 17),第 4 行没折 → 折 4 和里面
        run(v, 'Fold Level 2')
        run(v, 'Toggle Fold Recursively')
        expect(folded(v)).toEqual([4, 5, 8, 12, 17])
        // 光标在块体里:取包住它的最内层块,光标挪出隐藏区
        const w = make(DOC, [[6, 3, 6, 3]], 'java')
        run(w, 'Toggle Fold Recursively')
        expect(folded(w)).toEqual([5])
        expect(sels(w)).toEqual([[5, 13, 5, 13]])
    })

    it('Create Folding Range from Selection:末行列 1 不算,光标回到起始行行首,多选区各建一块', () => {
        const a = make(DOC, [[12, 3, 13, 4]], 'java')
        run(a, 'Create Folding Range from Selection')
        expect(folded(a)).toEqual([12])
        expect(sels(a)).toEqual([[12, 1, 12, 1]])
        const f = core.foldable(a.state, a.state.doc.line(12).from)!
        expect(a.state.doc.lineAt(f.to).number).toBe(13)

        const b = make(DOC, [[16, 3, 18, 1]], 'java')
        run(b, 'Create Folding Range from Selection')
        expect(b.state.doc.lineAt(core.foldable(b.state, b.state.doc.line(16).from)!.to).number).toBe(17)

        const c = make(DOC, [[5, 3, 6, 4], [17, 1, 18, 2]], 'java')
        run(c, 'Create Folding Range from Selection')
        expect(folded(c)).toEqual([5, 17])
        expect(sels(c)).toEqual([[17, 1, 17, 1]])

        const d = make(DOC, [[5, 3, 5, 4]], 'java')
        expect(run(d, 'Create Folding Range from Selection')).toBe(false)
        expect(folded(d)).toEqual([])
        expect(sels(d)).toEqual([[5, 3, 5, 4]])

        // 缩进看不出的块也能建;toggle 认它
        const e = make('a\nb\nc\nd\n', [[1, 1, 3, 2]])
        run(e, 'Create Folding Range from Selection')
        expect(folded(e)).toEqual([1])
        select(e, [[2, 1, 2, 1]])
        run(e, 'Toggle Fold')
        expect(folded(e)).toEqual([])
    })

    it('手建的块不被 TS outlining 的整表替换冲掉', () => {
        const v = make('a\nb\nc\nd\n', [[1, 1, 3, 2]])
        run(v, 'Create Folding Range from Selection')
        v.dispatch(v.state.update({ effects: core.setExtraFolds.of([]) }))
        expect(core.foldable(v.state, 0)).not.toBeNull()
        expect(folded(v)).toEqual([1])
    })

    it('Remove Manual Folding Ranges:删掉和选区行相交的手建块并展开,原来的缩进块回来', () => {
        const v = make(DOC, [[16, 3, 18, 4]], 'java')
        run(v, 'Create Folding Range from Selection')
        expect(v.state.doc.lineAt(core.foldable(v.state, v.state.doc.line(16).from)!.to).number).toBe(18)
        select(v, [[1, 1, 1, 1]])
        expect(run(v, 'Remove Manual Folding Ranges')).toBe(false)
        expect(folded(v)).toEqual([16])
        select(v, [[16, 1, 16, 1]])
        run(v, 'Remove Manual Folding Ranges')
        expect(folded(v)).toEqual([])
        expect(v.state.doc.lineAt(core.foldable(v.state, v.state.doc.line(16).from)!.to).number).toBe(19)

        const w = make('a\nb\nc\nd\n', [[1, 1, 3, 2]])
        run(w, 'Create Folding Range from Selection')
        select(w, [[3, 1, 3, 1]])
        run(w, 'Remove Manual Folding Ranges')
        expect(core.foldable(w.state, 0)).toBeNull()
    })

    it('Fold / Fold All 把被藏的光标挪到块首行行尾(Monaco hiddenRangeModel.adjustSelections)', () => {
        const v = make(DOC, [[6, 3, 6, 3]], 'java')
        run(v, 'Fold All')
        expect(sels(v)).toEqual([[4, 15, 4, 15]])
        expect(folded(v)).toContain(4)
    })
})

describe('注释:Add / Remove Line Comment(Monaco LineCommentCommand ForceAdd / ForceRemove)', () => {
    const cases: [string, Sel[], string, Sel[], string, Sel[]][] = [
        // doc, sels, add 后, add 选区, remove 后, remove 选区
        ['a\n// b\n\n    c\n', [[1, 1, 4, 6]], '// a\n// // b\n\n//     c\n', [[1, 4, 4, 9]], 'a\nb\n\n    c\n', [[1, 1, 4, 6]]],
        ['    a\n  // b\n', [[1, 1, 2, 3]], '//     a\n//   // b\n', [[1, 4, 2, 6]], '    a\n  b\n', [[1, 1, 2, 3]]],
        ['\n', [[1, 1, 1, 1]], '\n', [[1, 1, 1, 1]], '\n', [[1, 1, 1, 1]]],
        ['   \n', [[1, 4, 1, 4]], '   \n', [[1, 4, 1, 4]], '   \n', [[1, 4, 1, 4]]],
        ['abc\n', [[1, 4, 1, 4]], '// abc\n', [[1, 7, 1, 7]], 'abc\n', [[1, 4, 1, 4]]],
        ['// a\n//b\nc\n  //  d\n', [[1, 1, 4, 2]], '// // a\n// //b\n// c\n//   //  d\n', [[1, 4, 4, 5]], 'a\nb\nc\n   d\n', [[1, 1, 4, 2]]],
        ['a\nb\nc\n', [[1, 1, 3, 1]], '// a\n// b\nc\n', [[1, 4, 3, 1]], 'a\nb\nc\n', [[1, 1, 3, 1]]],
        ['// a\n// b\n', [[1, 5, 1, 5], [2, 3, 2, 3]], '// // a\n// // b\n', [[1, 8, 1, 8], [2, 6, 2, 6]], 'a\nb\n', [[1, 2, 1, 2], [2, 1, 2, 1]]],
        ['x // a\n', [[1, 1, 1, 1]], '// x // a\n', [[1, 4, 1, 4]], 'x // a\n', [[1, 1, 1, 1]]],
    ]
    it('Add Line Comment', () => {
        for (const [doc, s, want, wantSel] of cases) {
            const v = make(doc, s)
            run(v, 'Add Line Comment')
            expect(v.state.doc.toString(), JSON.stringify(doc)).toBe(want)
            expect(sels(v), JSON.stringify(doc)).toEqual(wantSel)
        }
    })
    it('Remove Line Comment', () => {
        for (const [doc, s, , , want, wantSel] of cases) {
            const v = make(doc, s)
            run(v, 'Remove Line Comment')
            expect(v.state.doc.toString(), JSON.stringify(doc)).toBe(want)
            expect(sels(v), JSON.stringify(doc)).toEqual(wantSel)
        }
    })
})

describe('缩进:Monaco indentation.js', () => {
    const opts = (v: EditorView) => [v.state.tabSize, v.state.indentUnit]

    it('Convert Indentation to Tabs:整篇把每段 tabSize 个连续空格换成 Tab,之后用 Tab 缩进', () => {
        const v = make('\ta\n    b\n      c\n  \t d\n  \t    e\n\t\n        \n', [[1, 2, 1, 2], [3, 1, 2, 3]])
        run(v, 'Convert Indentation to Tabs')
        expect(v.state.doc.toString()).toBe('\ta\n\tb\n\t  c\n  \t d\n  \t\te\n\t\n\t\t\n')
        expect(sels(v)).toEqual([[1, 2, 1, 2], [3, 1, 2, 3]])
        expect(opts(v)).toEqual([4, '\t'])
    })

    it('Convert Indentation to Spaces:每个 Tab 换成 tabSize 个空格,之后用空格缩进', () => {
        const v = make('\ta\n    b\n  \t d\n\t\n\t\t\n x\t\ty\n', [[1, 2, 1, 2]])
        run(v, 'Convert Indentation to Tabs')
        run(v, 'Convert Indentation to Spaces')
        expect(v.state.doc.toString()).toBe('    a\n    b\n       d\n    \n        \n x\t\ty\n')
        expect(sels(v)).toEqual([[1, 5, 1, 5]])
        expect(opts(v)).toEqual([4, '    '])
    })

    it('Detect Indentation from Content(Monaco guessIndentation)', () => {
        const a = make('a\n  b\n    c\n  d\n')
        run(a, 'Detect Indentation from Content')
        expect(opts(a)).toEqual([2, '  '])
        const b = make('a\n\tb\n\t\tc\n')
        run(b, 'Detect Indentation from Content')
        expect(opts(b)).toEqual([4, '\t'])
        const c = make('a\nb\n')
        run(c, 'Detect Indentation from Content')
        expect(opts(c)).toEqual([4, '    '])
    })

    it('Indent Using Spaces / Tabs、Change Tab Display Size:quick pick 1–8,默认焦点在当前 tab 宽', async () => {
        const v = make('a\n\tb\n')
        run(v, 'Indent Using Spaces')
        await tick()
        const input = v.dom.querySelector('.cm-quick-input-input') as HTMLInputElement
        expect(input.placeholder).toBe('Select Tab Size for Current File')
        const rows = () => [...v.dom.querySelectorAll('.cm-quick-input-row')].map(r => (r.classList.contains('focused') ? '*' : '') + r.textContent)
        expect(rows()).toEqual(['1', '2', '3', '*4Configured Tab Size', '5', '6', '7', '8'])
        press(input, 'ArrowDown')
        press(input, 'ArrowDown')
        press(input, 'Enter')
        await tick()
        expect(opts(v)).toEqual([6, '      '])
        // 宿主状态栏读得到:tab-size 变量跟着变
        expect(v.dom.style.getPropertyValue('--lm-tab-size')).toBe('6')

        run(v, 'Indent Using Tabs')
        await tick()
        const input2 = v.dom.querySelector('.cm-quick-input-input') as HTMLInputElement
        expect(rows()).toEqual(['1', '2', '3', '4Default Tab Size', '5', '*6Current Tab Size', '7', '8'])
        input2.value = '3'
        input2.dispatchEvent(new Event('input', { bubbles: true }))
        expect(rows()).toEqual(['*3'])
        input2.value = ''
        input2.dispatchEvent(new Event('input', { bubbles: true }))
        expect(rows()[5]).toBe('*6Current Tab Size')
        input2.value = '3'
        input2.dispatchEvent(new Event('input', { bubbles: true }))
        press(input2, 'Enter')
        await tick()
        expect(opts(v)).toEqual([3, '\t'])

        run(v, 'Change Tab Display Size')
        await tick()
        const input3 = v.dom.querySelector('.cm-quick-input-input') as HTMLInputElement
        input3.value = '8'
        input3.dispatchEvent(new Event('input', { bubbles: true }))
        press(input3, 'Enter')
        await tick()
        expect(opts(v)).toEqual([8, '\t'])
        // Tab 键按新配置缩进
        select(v, [[1, 1, 1, 1]])
        press(v.contentDOM, 'Tab')
        expect(v.state.doc.line(1).text).toBe('\ta')
    })

    // 第六轮更正:Monaco 默认 indentSize: 'tabSize',只改显示宽时空格缩进跟着变(第四轮对照脚本先 updateOptions({ indentSize: 4 }) 把它钉死了);
    // 显式设过 indentSize 后才不动它,见 indent-r6-fix.test.ts
    it('Change Tab Display Size:indentSize 默认跟着 tabSize 走', async () => {
        const v = make('a\n')
        run(v, 'Change Tab Display Size')
        await tick()
        const input = v.dom.querySelector('.cm-quick-input-input') as HTMLInputElement
        input.value = '2'
        input.dispatchEvent(new Event('input', { bubbles: true }))
        press(input, 'Enter')
        await tick()
        expect(opts(v)).toEqual([2, '  '])
    })

    it('缩进设置随 liteMonaco({ state }) 恢复保留', async () => {
        const v = make('a\n  b\n')
        run(v, 'Detect Indentation from Content')
        const state = v.state
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const w = liteMonaco({ parent, highlighter: hl as never, state, lang: 'text', theme: 'dark-plus', features: { minimap: false } })
        views.push(w)
        expect(opts(w)).toEqual([2, '  '])
    })

    // Monaco standalone 的 TS / JS 等没配 indentationRules,两条命令什么也不做(对照页实测文本不变)
    it('Reindent Lines / Reindent Selected Lines:语言没配缩进规则时不动(同 Monaco standalone)', () => {
        const src = 'function f() {\nconst a = 1\n        if (a) {\nb()\n}\n}\n'
        for (const lang of ['typescript', 'text']) {
            const v = make(src, [[2, 1, 4, 1]], lang)
            expect(run(v, 'Reindent Lines')).toBe(false)
            expect(run(v, 'Reindent Selected Lines')).toBe(false)
            expect(v.state.doc.toString()).toBe(src)
        }
    })

    // 宿主经 indentRulesFacet 配上 VS Code typescript-basics 的规则后,走 Monaco getReindentEditOperations
    const TS_RULES = {
        decreaseIndentPattern: /^\s*[\}\]\)].*$/,
        increaseIndentPattern: /^.*(\{[^}]*|\([^)]*|\[[^\]]*)$/,
        indentNextLinePattern: /^((.*=>\s*)|((.*[^\w]+|\s*)(if|while|for)\s*\(.*\)\s*))$/,
        unIndentedLinePattern: /^(\t|[ ])*[ ]\*[^/]*\*\/\s*$|^(\t|[ ])*[ ]\*\/\s*$|^(\t|[ ])*\*([ ]([^\*]|\*(?!\/))*)?$/,
    }
    function ruled(doc: string, sel: [number, number], unit?: string) {
        let state = core.EditorState.create({
            doc,
            selection: core.EditorSelection.single(sel[0], sel[1]),
            extensions: [core.indentRulesFacet.of(TS_RULES), ...(unit ? [core.EditorState.indentUnit.of(unit)] : [])],
        })
        return {
            run(cmd: (t: { state: typeof state, dispatch: (tr: ReturnType<typeof state.update>) => void }) => boolean) {
                return cmd({ state, dispatch: tr => { state = tr.apply() } })
            },
            get text() { return state.doc.toString() },
        }
    }

    it('Reindent Lines:有缩进规则时按 increase / decrease / indentNextLine 重排整篇', () => {
        const src = 'function f() {\nconst a = 1\n        if (a) {\nb()\n}\n}\n'
        const e = ruled(src, [0, 0])
        expect(e.run(core.reindentLines)).toBe(true)
        expect(e.text).toBe('function f() {\n    const a = 1\n    if (a) {\n        b()\n    }\n}\n')
        expect(e.run(core.reindentLines)).toBe(false)
        // 不带花括号的 if:下一行多缩一级,再下一行回来
        const t = ruled('if (a)\nb()\nc()\n', [0, 0], '\t')
        t.run(core.reindentLines)
        expect(t.text).toBe('if (a)\n\tb()\nc()\n')
    })

    it('Reindent Selected Lines:从选区上一行起算,止于行首的末行不算;第 1 行的单行选区跳过', () => {
        const src = 'function f() {\nconst a = 1\n        if (a) {\nb()\n}\n}\n'
        const from = src.indexOf('const'), to = src.indexOf('b()')
        const e = ruled(src, [from, to])
        expect(e.run(core.reindentSelectedLines)).toBe(true)
        expect(e.text).toBe('function f() {\n    const a = 1\n    if (a) {\nb()\n}\n}\n')
        const w = ruled('  a\nb\n', [0, 0])
        expect(w.run(core.reindentSelectedLines)).toBe(false)
        expect(w.text).toBe('  a\nb\n')
    })
})

describe('面板与 Monaco 同构', () => {
    const byLabel = (label: string) => defaultPaletteCommands().find(c => c.label === label)

    it('Monaco 面板里没有的 Undo / Redo / Copy / Cut / Paste / Select All 不登记', () => {
        const labels = new Set(defaultPaletteCommands().map(c => c.label))
        for (const l of ['Undo', 'Redo', 'Copy', 'Cut', 'Paste', 'Select All']) expect(labels.has(l), l).toBe(false)
        for (const l of ['Cursor Undo', 'Cursor Redo', 'Select All Occurrences of Find Match']) expect(labels.has(l), l).toBe(true)
    })

    it('新命令的 Monaco 原文标签和默认键位', () => {
        const want: Record<string, string | undefined> = {
            'Fold All Block Comments': '⌘K ⌘/',
            'Fold All Regions': '⌘K ⌘8',
            'Unfold All Regions': '⌘K ⌘9',
            'Fold All Except Selected': '⌘K ⌘-',
            'Unfold All Except Selected': '⌘K ⌘=',
            'Toggle Fold Recursively': '⌘K ⇧⌘L',
            'Create Folding Range from Selection': '⌘K ⌘,',
            'Remove Manual Folding Ranges': '⌘K ⌘.',
            'Add Line Comment': '⌘K ⌘C',
            'Remove Line Comment': '⌘K ⌘U',
            'Detect Indentation from Content': undefined,
            'Indent Using Spaces': undefined,
            'Indent Using Tabs': undefined,
            'Change Tab Display Size': undefined,
            'Convert Indentation to Spaces': undefined,
            'Convert Indentation to Tabs': undefined,
            'Reindent Lines': undefined,
            'Reindent Selected Lines': undefined,
        }
        for (const [label, kb] of Object.entries(want)) {
            const c = byLabel(label)
            expect(c, label).toBeTruthy()
            expect(c!.keybinding, label).toBe(kb)
        }
    })

    it('显示的键真按下去,和从面板执行效果相同', () => {
        const checks: [string, Sel[]][] = [
            ['Fold All Block Comments', [[9, 3, 9, 3]]],
            ['Fold All Regions', [[13, 3, 13, 3]]],
            ['Fold All Except Selected', [[6, 3, 6, 3]]],
            ['Toggle Fold Recursively', [[4, 3, 4, 3]]],
            ['Create Folding Range from Selection', [[12, 3, 13, 4]]],
            ['Add Line Comment', [[1, 1, 4, 6]]],
            ['Remove Line Comment', [[11, 1, 15, 1]]],
        ]
        for (const [label, s] of checks) {
            const cmd = byLabel(label)!
            const viaPalette = make(DOC, s, 'java')
            cmd.run(viaPalette)
            const changed = viaPalette.state.doc.toString() !== DOC || viaPalette.state.field(core.foldField).size > 0
            expect(changed, `${label} 在这个文档上要有效果`).toBe(true)
            const viaKey = make(DOC, s, 'java')
            for (const [k, mods] of strokes(cmd.keybinding!)) press(viaKey.contentDOM, k, mods)
            expect(viaKey.state.doc.toString(), label).toBe(viaPalette.state.doc.toString())
            expect(sels(viaKey), label).toEqual(sels(viaPalette))
            expect(folded(viaKey), label).toEqual(folded(viaPalette))
        }
        // 需要先有状态的:Unfold All Regions / Unfold All Except / Remove Manual
        const pre: [string, string, Sel[]][] = [
            ['Unfold All Regions', 'Fold All', [[1, 1, 1, 1]]],
            ['Unfold All Except Selected', 'Fold All', [[16, 3, 16, 3]]],
            ['Remove Manual Folding Ranges', 'Create Folding Range from Selection', [[16, 3, 18, 4]]],
        ]
        for (const [label, setup, s] of pre) {
            const cmd = byLabel(label)!
            const a = make(DOC, s, 'java')
            run(a, setup)
            const before = folded(a)
            cmd.run(a)
            expect(folded(a), label).not.toEqual(before)
            const b = make(DOC, s, 'java')
            run(b, setup)
            for (const [k, mods] of strokes(cmd.keybinding!)) press(b.contentDOM, k, mods)
            expect(folded(b), label).toEqual(folded(a))
        }
    })

    it('TS 下 Go to Symbol 的标签是 Monaco 的 "Go to Symbol..."', () => {
        const v = make('const a = 1\n', [[1, 1, 1, 1]], 'typescript')
        press(v.contentDOM, 'F1')
        const input = v.dom.querySelector('.cm-quick-input-input') as HTMLInputElement
        input.value = '>go to symbol'
        input.dispatchEvent(new Event('input', { bubbles: true }))
        const labels = [...v.dom.querySelectorAll('.cm-quick-input-row .cm-quick-input-label')].map(n => n.textContent)
        expect(labels).toContain('Go to Symbol...')
        expect(labels).not.toContain('Go to Symbol in Editor...')
        press(input, 'Escape')
    })
})
