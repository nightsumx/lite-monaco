import { afterEach, describe, expect, it } from 'vitest'
import { closeBrackets, closeBracketsInput, deleteBracketPair } from '../../src/core/edit/closebrackets'
import { EditorSelection } from '../../src/core/model/selection'
import { EditorState } from '../../src/core/model/state'
import { editorOptions, type IEditorOptions } from '../../src/core/options'
import { EditorView } from '../../src/core/view/editorview'

const views: EditorView[] = []
afterEach(() => { for (const v of views.splice(0)) v.destroy() })

function make(doc: string, options: IEditorOptions = {}, sel?: [number, number?]): EditorView {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const view = new EditorView({
        state: EditorState.create({
            doc,
            selection: sel ? EditorSelection.single(sel[0], sel[1] ?? sel[0]) : EditorSelection.cursor(doc.length),
            extensions: [editorOptions.of(options), closeBrackets()],
        }),
        parent: host,
    })
    views.push(view)
    return view
}

/** 打字:先问自动配对,没接管就普通插入 */
function type(view: EditorView, text: string): void {
    for (const ch of text) {
        const m = view.state.selection.main
        if (closeBracketsInput(view, m.from, m.to, ch)) continue
        view.dispatch(view.state.update({ changes: { from: m.from, to: m.to, insert: ch }, selection: { anchor: m.from + 1 }, userEvent: 'input.type' }))
    }
}

function backspace(view: EditorView): boolean {
    return deleteBracketPair({ state: view.state, dispatch: tr => view.dispatch(tr) })
}

describe('autoClosingBrackets', () => {
    it('默认 languageDefined:空白前补,单词前不补', () => {
        const v = make('')
        type(v, '(')
        expect(v.state.doc.toString()).toBe('()')
        const w = make('foo', {}, [0])
        type(w, '(')
        expect(w.state.doc.toString()).toBe('(foo')
    })

    it("'never':不补闭符", () => {
        const v = make('', { autoClosingBrackets: 'never' })
        type(v, '(')
        expect(v.state.doc.toString()).toBe('(')
    })

    it("'never' 只管括号,引号照补", () => {
        const v = make('', { autoClosingBrackets: 'never' })
        type(v, '"')
        expect(v.state.doc.toString()).toBe('""')
    })

    it("'always':单词前也补", () => {
        const v = make('foo', { autoClosingBrackets: 'always' }, [0])
        type(v, '(')
        expect(v.state.doc.toString()).toBe('()foo')
    })

    it("'beforeWhitespace':只在空白 / 行尾前补", () => {
        const a = make('x', { autoClosingBrackets: 'beforeWhitespace' }, [0])
        type(a, '(')
        expect(a.state.doc.toString()).toBe('(x')
        const b = make(' x', { autoClosingBrackets: 'beforeWhitespace' }, [0])
        type(b, '(')
        expect(b.state.doc.toString()).toBe('() x')
        // languageDefined 下 `;` 前会补,beforeWhitespace 不补
        const c = make(';', { autoClosingBrackets: 'beforeWhitespace' }, [0])
        type(c, '[')
        expect(c.state.doc.toString()).toBe('[;')
        const d = make(';', {}, [0])
        type(d, '[')
        expect(d.state.doc.toString()).toBe('[];')
    })
})

describe('autoClosingQuotes', () => {
    it("默认补引号;'never' 不补", () => {
        const a = make('')
        type(a, '"')
        expect(a.state.doc.toString()).toBe('""')
        const b = make('', { autoClosingQuotes: 'never' })
        type(b, '"')
        expect(b.state.doc.toString()).toBe('"')
        // 括号不受影响
        type(b, '(')
        expect(b.state.doc.toString()).toBe('"()')
    })

    it("默认单词后不补引号;'always' 补", () => {
        const a = make('it')
        type(a, '\'')
        expect(a.state.doc.toString()).toBe('it\'')
        const b = make('it', { autoClosingQuotes: 'always' })
        type(b, '\'')
        expect(b.state.doc.toString()).toBe('it\'\'')
    })

    it("'beforeWhitespace':分号前不补", () => {
        const a = make(';', { autoClosingQuotes: 'beforeWhitespace' }, [0])
        type(a, '"')
        expect(a.state.doc.toString()).toBe('";')
        const b = make(';', {}, [0])
        type(b, '"')
        expect(b.state.doc.toString()).toBe('"";')
    })
})

describe('autoClosingComments', () => {
    it('默认补 /** 的闭合 */;never 不补', () => {
        const a = make('/*')
        type(a, '*')
        expect(a.state.doc.toString()).toBe('/** */')
        const b = make('/*', { autoClosingComments: 'never' })
        type(b, '*')
        expect(b.state.doc.toString()).toBe('/**')
    })

    it('autoClosingBrackets never 不影响注释', () => {
        const a = make('/*', { autoClosingBrackets: 'never' })
        type(a, '*')
        expect(a.state.doc.toString()).toBe('/** */')
    })
})

describe('autoClosingOvertype', () => {
    it("'auto'(默认):只越过自动补的闭符", () => {
        const a = make('')
        type(a, '(')
        type(a, ')')
        expect(a.state.doc.toString()).toBe('()')
        expect(a.state.selection.main.head).toBe(2)
        // 手写的 ) 不越过
        const b = make('()', {}, [1])
        type(b, ')')
        expect(b.state.doc.toString()).toBe('())')
    })

    it("'always':手写的闭符也越过", () => {
        const b = make('()', { autoClosingOvertype: 'always' }, [1])
        type(b, ')')
        expect(b.state.doc.toString()).toBe('()')
        expect(b.state.selection.main.head).toBe(2)
    })

    it("'never':自动补的也不越过", () => {
        const a = make('', { autoClosingOvertype: 'never' })
        type(a, '(')
        type(a, ')')
        expect(a.state.doc.toString()).toBe('())')
    })
})

describe('autoClosingDelete', () => {
    it("'auto'(默认):只删自动补的一对", () => {
        const a = make('')
        type(a, '(')
        expect(backspace(a)).toBe(true)
        expect(a.state.doc.toString()).toBe('')
        const b = make('()', {}, [1])
        expect(backspace(b)).toBe(false)
    })

    it("'always':手写的一对也删", () => {
        const b = make('()', { autoClosingDelete: 'always' }, [1])
        expect(backspace(b)).toBe(true)
        expect(b.state.doc.toString()).toBe('')
    })

    it("'never':自动补的也不删对", () => {
        const a = make('', { autoClosingDelete: 'never' })
        type(a, '(')
        expect(backspace(a)).toBe(false)
    })

    it('括号和引号都 never 时不删对', () => {
        const a = make('()', { autoClosingDelete: 'always', autoClosingBrackets: 'never', autoClosingQuotes: 'never' }, [1])
        expect(backspace(a)).toBe(false)
        const b = make('()', { autoClosingDelete: 'always', autoClosingBrackets: 'never' }, [1])
        expect(backspace(b)).toBe(false)
        const c = make('""', { autoClosingDelete: 'always', autoClosingBrackets: 'never' }, [1])
        expect(backspace(c)).toBe(true)
    })
})

describe('autoSurround', () => {
    it('默认 languageDefined:括号和引号都包裹选区', () => {
        const a = make('abc', {}, [0, 3])
        type(a, '(')
        expect(a.state.doc.toString()).toBe('(abc)')
        const b = make('abc', {}, [0, 3])
        type(b, '"')
        expect(b.state.doc.toString()).toBe('"abc"')
    })

    it("'quotes':只包引号", () => {
        const a = make('abc', { autoSurround: 'quotes' }, [0, 3])
        type(a, '(')
        expect(a.state.doc.toString()).toBe('(')
        const b = make('abc', { autoSurround: 'quotes' }, [0, 3])
        type(b, '"')
        expect(b.state.doc.toString()).toBe('"abc"')
    })

    it("'brackets':只包括号", () => {
        const a = make('abc', { autoSurround: 'brackets' }, [0, 3])
        type(a, '"')
        expect(a.state.doc.toString()).toBe('"')
        const b = make('abc', { autoSurround: 'brackets' }, [0, 3])
        type(b, '[')
        expect(b.state.doc.toString()).toBe('[abc]')
    })

    it("'never':都不包", () => {
        const a = make('abc', { autoSurround: 'never' }, [0, 3])
        type(a, '(')
        expect(a.state.doc.toString()).toBe('(')
    })
})
