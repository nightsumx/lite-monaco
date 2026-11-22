import { describe, expect, it } from 'vitest'
import { liteMonaco } from '../../src/litemonaco'
import type { ShikiLike } from '../../src/litemonaco'
import { StateField } from '../../src/core/model/state'
import { historyField, undo } from '../../src/core/edit/history'
import { deleteCharBackward, selectNextOccurrence, toggleComment, toggleBlockComment } from '../../src/core/edit/commands'
import { openSearch, setSearchQuery, findNext, searchField } from '../../src/core/feature/search'
import { suggestTrigger, suggestUi } from '../../src/core/feature/suggestwidget'
import { foldCode, foldField } from '../../src/core/edit/fold'
import { contextMenuIsOpen } from '../../src/core/feature/contextmenu'
import { triggerSignatureHelp } from '../../src/lang/tssignature'
import { diagnosticsField } from '../../src/core/feature/diagnostics'
import { inputHandler } from '../../src/core/view/editorview'

function fakeHl(): ShikiLike {
    return {
        codeToTokens: () => ({ tokens: [[]], fg: '#fff', bg: '#000' }),
        getTheme: (name?: string) => name && name.includes('light')
            ? { bg: '#ffffff', fg: '#000000', type: 'light' as const }
            : { bg: '#1e1e1e', fg: '#d4d4d4', type: 'dark' as const },
    } as unknown as ShikiLike
}

describe('lite-monaco —— 一行挂上', () => {
    it('parent + highlighter + doc → 可编辑的 view', () => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const view = liteMonaco({
            parent,
            highlighter: fakeHl(),
            doc: 'const x = 1',
        })
        expect(parent.querySelector('.cm-editor')).not.toBeNull()
        expect(view.state.sliceDoc()).toBe('const x = 1')
        expect(document.getElementById('lite-monaco-base')).not.toBeNull()
        view.destroy()
        parent.remove()
    })

    it('onChange 在文档变更时触发', () => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        // FIX2 H24:传改动(Monaco onDidChangeModelContent 的 changes),不再每次拼整篇文档
        const seen: unknown[] = []
        const view = liteMonaco({
            parent,
            highlighter: fakeHl(),
            doc: 'abc',
            onChange: (changes, v) => seen.push([changes, v.state.sliceDoc()]),
        })
        view.dispatch(view.state.update({ changes: [{ from: 1, to: 1, insert: 'X' }, { from: 2, to: 3, insert: '\nY' }] }))
        expect(seen).toEqual([[[{ from: 1, to: 1, text: 'X' }, { from: 2, to: 3, text: '\nY' }], 'aXb\nY']])
        view.dispatch(view.state.update({ selection: { anchor: 1 } }))
        expect(seen).toHaveLength(1)
        view.destroy()
        parent.remove()
    })

    it('onSelectionChange:程序改文档也发一次(Monaco 改内容总有一次 cursor 事件);选区没变、只带 effect 的不发', () => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const seen: number[] = []
        const view = liteMonaco({ parent, highlighter: fakeHl(), doc: 'abc', onSelectionChange: s => seen.push(s.main.head) })
        view.dispatch(view.state.update({ changes: { from: 0, to: 3, insert: 'x\ny' } }))
        expect(seen).toEqual([0])
        view.dispatch(view.state.update({ selection: { anchor: 2 } }))
        view.dispatch(view.state.update({ selection: { anchor: 2 } }))
        view.dispatch(view.state.update({ effects: [] }))
        expect(seen).toEqual([0, 2])
        view.destroy()
        parent.remove()
    })

    it('readOnly 写入无效', () => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const view = liteMonaco({
            parent,
            highlighter: fakeHl(),
            doc: 'a',
            readOnly: true,
        })
        expect(view.state.readOnly).toBe(true)
        view.destroy()
        parent.remove()
    })

    it('打字 / 删 / undo / 查找 / 折叠 / 多选 走 shipped 命令', () => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const view = liteMonaco({
            parent,
            highlighter: fakeHl(),
            doc: 'function f() {\n  return 1\n}\nfoo foo\n',
        })
        const dispatch = (tr: Parameters<typeof view.dispatch>[0]) => view.dispatch(tr)
        view.dispatch(view.state.update({
            changes: { from: 0, insert: 'z' },
            selection: { anchor: 1 },
            userEvent: 'input.type',
        }))
        expect(view.state.sliceDoc().startsWith('zfunction')).toBe(true)
        expect(undo({ state: view.state, dispatch })).toBe(true)
        expect(view.state.sliceDoc().startsWith('function')).toBe(true)

        view.dispatch(view.state.update({ selection: { anchor: 1 } }))
        expect(deleteCharBackward({ state: view.state, dispatch })).toBe(true)
        expect(view.state.sliceDoc()[0]).toBe('u')
        expect(undo({ state: view.state, dispatch })).toBe(true)

        const foo = view.state.sliceDoc().indexOf('foo')
        view.dispatch(view.state.update({ selection: { anchor: foo } }))
        openSearch({ state: view.state, dispatch })
        setSearchQuery('foo')({ state: view.state, dispatch })
        expect(view.state.sliceDoc().slice(view.state.selection.main.from, view.state.selection.main.to)).toBe('foo')
        findNext({ state: view.state, dispatch })
        expect(view.state.selection.main.from).toBe(view.state.sliceDoc().lastIndexOf('foo'))

        view.dispatch(view.state.update({ selection: { anchor: 0 } }))
        expect(foldCode({ state: view.state, dispatch })).toBe(true)
        expect((view.state.field(foldField) as Set<number>).has(1)).toBe(true)

        const a = view.state.sliceDoc().indexOf('foo')
        view.dispatch(view.state.update({ selection: { anchor: a, head: a + 3 } }))
        expect(selectNextOccurrence({ state: view.state, dispatch })).toBe(true)
        expect(view.state.selection.ranges.length).toBe(2)

        view.destroy()
        parent.remove()
    })

    it('features.search=false 不装搜索 field，openSearch 无效', () => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const view = liteMonaco({
            parent,
            highlighter: fakeHl(),
            doc: 'foo',
            features: { search: false, overviewRuler: false, hover: false, minimap: false },
        })
        expect(view.state.field(searchField, false)).toBeUndefined()
        openSearch({ state: view.state, dispatch: tr => view.dispatch(tr) })
        expect(view.state.field(searchField, false)).toBeUndefined()
        view.destroy()
        parent.remove()
    })

    it('主题按实例:结构 CSS 一份共享,颜色变量挂各自 .cm-editor(同页一暗一亮互不覆盖)', () => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const dark = liteMonaco({ parent, highlighter: fakeHl(), doc: 'x', theme: 'dark-plus' })
        const light = liteMonaco({ parent, highlighter: fakeHl(), doc: 'x', theme: 'light-plus' })
        expect(document.querySelectorAll('#lite-monaco-base').length).toBe(1)
        expect(document.querySelectorAll('style[id^="lite-monaco-theme-"]').length).toBe(0)
        expect(dark.dom.style.getPropertyValue('--lm-editorCursor-foreground')).toBe('#aeafad')
        expect(light.dom.style.getPropertyValue('--lm-editorCursor-foreground')).toBe('#000000')
        expect(dark.dom.style.getPropertyValue('--lm-editor-background')).toBe('#1e1e1e')
        expect(light.dom.style.getPropertyValue('--lm-editor-background')).toBe('#ffffff')
        dark.destroy()
        light.destroy()
        parent.remove()
    })

    it('lineWrapping 开则 class 在；默认 a11y 写 role', () => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const view = liteMonaco({
            parent,
            highlighter: fakeHl(),
            doc: 'hello world',
            features: { lineWrapping: true, minimap: false, overviewRuler: false },
        })
        expect(view.lineWrapping).toBe(true)
        expect(view.dom.classList.contains('cm-lineWrapping')).toBe(true)
        expect(view.contentDOM.getAttribute('role')).toBe('textbox')
        expect(view.contentDOM.getAttribute('aria-multiline')).toBe('true')
        view.destroy()
        parent.remove()
    })

    it('features.contextMenu=false 右键不弹菜单', () => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const view = liteMonaco({
            parent,
            highlighter: fakeHl(),
            doc: 'x',
            features: { contextMenu: false, minimap: false, overviewRuler: false },
        })
        view.contentDOM.dispatchEvent(new MouseEvent('contextmenu', {
            bubbles: true, cancelable: true, clientX: 10, clientY: 10, button: 2,
        }))
        expect(contextMenuIsOpen()).toBe(false)
        expect(document.querySelector('.cm-context-menu')).toBeNull()
        view.destroy()
        parent.remove()
    })

    it('features.foldGutter=false 不画折叠箭头', () => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const view = liteMonaco({
            parent,
            highlighter: fakeHl(),
            doc: 'function f() {\n  return 1\n}\n',
            features: { foldGutter: false, minimap: false, overviewRuler: false },
        })
        expect(view.dom.querySelector('.cm-foldMarker-active')).toBeNull()
        view.destroy()
        parent.remove()
    })

    it('features.stickyScroll=false 不挂粘性条', () => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const view = liteMonaco({
            parent,
            highlighter: fakeHl(),
            doc: 'function f() {\n  return 1\n}\n',
            features: { stickyScroll: false, minimap: false, overviewRuler: false },
        })
        expect(view.dom.querySelector('.cm-sticky-scroll')).toBeNull()
        view.destroy()
        parent.remove()
    })

    it('features.minimap=false 不挂缩略图', () => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const view = liteMonaco({
            parent,
            highlighter: fakeHl(),
            doc: 'x',
            features: { minimap: false, overviewRuler: false },
        })
        expect(view.dom.querySelector('.cm-minimap')).toBeNull()
        view.destroy()
        parent.remove()
    })

    it('features.hScrollbar=false 不挂横条；signatureHelp=false 不弹签名卡', () => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const view = liteMonaco({
            parent,
            highlighter: fakeHl(),
            doc: 'function f(a: number) { return a }\nf',
            lang: 'typescript',
            features: { hScrollbar: false, signatureHelp: false, minimap: false, overviewRuler: false },
        })
        expect(view.dom.querySelector('.cm-hscrollbar')).toBeNull()
        triggerSignatureHelp(view)
        expect(view.dom.querySelector('.cm-signature-help')).toBeNull()
        view.destroy()
        parent.remove()
    })

    it('关行号/竖条/a11y/补全：DOM 与 field 都不装', () => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const view = liteMonaco({
            parent,
            highlighter: fakeHl(),
            doc: 'hello',
            features: {
                lineNumbers: false,
                vScrollbar: false,
                a11y: false,
                autocomplete: false,
                minimap: false,
                overviewRuler: false,
            },
        })
        expect(view.dom.querySelector('.cm-gutters')).toBeNull()
        expect(view.dom.querySelector('.cm-scrollbar')).toBeNull()
        expect(view.dom.querySelector('[data-cm-a11y-live]')).toBeNull()
        expect(suggestUi(view).state.open).toBe(false)
        expect(suggestTrigger(view)).toBe(false)
        expect(suggestUi(view).state.open).toBe(false)
        view.destroy()
        parent.remove()
    })

    it('关缩进线/当前行：缩进行没有对应 class', () => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const view = liteMonaco({
            parent,
            highlighter: fakeHl(),
            doc: 'a\n  b\n    c',
            features: {
                indentGuide: false,
                activeLine: false,
                minimap: false,
                overviewRuler: false,
            },
        })
        expect(view.contentDOM.querySelector('.cm-indentGuide')).toBeNull()
        expect(view.dom.querySelector('.cm-currentLine')).toBeNull()
        view.destroy()
        parent.remove()
    })

    it('hover:false 不挂 tooltip，mousemove 不弹卡', () => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const view = liteMonaco({
            parent,
            highlighter: fakeHl(),
            doc: 'foo',
            diagnostics: [{ from: 0, to: 3, severity: 'error', message: 'bad' }],
            features: { hover: false, minimap: false, overviewRuler: false },
        })
        view.contentDOM.dispatchEvent(new MouseEvent('mousemove', {
            clientX: 8, clientY: 8, bubbles: true,
        }))
        expect(view.dom.querySelector('.cm-tooltip-hover')).toBeNull()
        view.destroy()
        parent.remove()
    })

    it('selectionMatch:false 选中词没有同词 class', () => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const view = liteMonaco({
            parent,
            highlighter: fakeHl(),
            doc: 'foo foo',
            features: { selectionMatch: false, minimap: false, overviewRuler: false },
        })
        view.dispatch(view.state.update({ selection: { anchor: 0, head: 3 } }))
        expect(view.dom.querySelector('.cm-selectionMatchBox, .cm-selectionMatch')).toBeNull()
        view.destroy()
        parent.remove()
    })

    it('python 行注释用 #；html 块注释用 <!-- -->', () => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const py = liteMonaco({
            parent,
            highlighter: fakeHl(),
            doc: 'print(1)',
            lang: 'python',
            features: { minimap: false, overviewRuler: false },
        })
        expect(toggleComment({ state: py.state, dispatch: tr => py.dispatch(tr) })).toBe(true)
        expect(py.state.doc.toString()).toBe('# print(1)')
        py.destroy()

        const html = liteMonaco({
            parent,
            highlighter: fakeHl(),
            doc: 'div',
            lang: 'html',
            features: { minimap: false, overviewRuler: false },
        })
        html.dispatch(html.state.update({ selection: { anchor: 0, head: 3 } }))
        expect(toggleBlockComment({ state: html.state, dispatch: tr => html.dispatch(tr) })).toBe(true)
        expect(html.state.doc.toString()).toBe('<!-- div -->')
        html.destroy()
        parent.remove()
    })

    it('diagnostics 种子写出波浪线', () => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const view = liteMonaco({
            parent,
            highlighter: fakeHl(),
            doc: 'foo',
            diagnostics: [{ from: 0, to: 3, severity: 'error', message: 'bad' }],
            features: { hover: false, minimap: false },
        })
        expect(view.state.field(diagnosticsField)).toHaveLength(1)
        expect(view.contentDOM.querySelector('.cm-diagnostic-error')).not.toBeNull()
        view.destroy()
        parent.remove()
    })

    it('closeBrackets:false 输入 ( 不补闭符', () => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const view = liteMonaco({
            parent,
            highlighter: fakeHl(),
            doc: '',
            features: { closeBrackets: false, minimap: false, overviewRuler: false },
        })
        for (const h of view.state.facet(inputHandler))
            h(view, 0, 0, '(')
        expect(view.state.doc.toString()).toBe('')
        view.destroy()
        parent.remove()
    })

    it('multiCursor:false 再选下一处仍是单选区', () => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const view = liteMonaco({
            parent,
            highlighter: fakeHl(),
            doc: 'foo foo',
            features: { multiCursor: false, minimap: false, overviewRuler: false },
        })
        view.dispatch(view.state.update({ selection: { anchor: 0, head: 3 } }))
        expect(selectNextOccurrence({ state: view.state, dispatch: tr => view.dispatch(tr) })).toBe(true)
        expect(view.state.selection.ranges.length).toBe(1)
        view.destroy()
        parent.remove()
    })

    it('codeActions:false 不挂灯泡', () => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const off = liteMonaco({
            parent,
            highlighter: fakeHl(),
            doc: 'const x = 1',
            lang: 'typescript',
            features: { codeActions: false, minimap: false, overviewRuler: false },
        })
        expect(off.dom.querySelector('.cm-lightbulb')).toBeNull()
        off.destroy()
        const on = liteMonaco({
            parent,
            highlighter: fakeHl(),
            doc: 'const x = 1',
            lang: 'typescript',
            features: { minimap: false, overviewRuler: false },
        })
        expect(on.dom.querySelector('.cm-lightbulb')).not.toBeNull()
        on.destroy()
        parent.remove()
    })

    it('colors 覆盖写进 theme CSS；默认不换行；选区不触发 onChange', () => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const seen: unknown[] = []
        const view = liteMonaco({
            parent,
            highlighter: fakeHl(),
            doc: 'ab',
            theme: 'qa-custom',
            colors: { bg: '#ff00aa', fg: '#112233', dark: true },
            onChange: d => seen.push(d),
            features: { minimap: false, overviewRuler: false },
        })
        expect(view.dom.style.getPropertyValue('--lm-editor-background')).toBe('#ff00aa')
        expect(view.dom.style.getPropertyValue('--lm-editor-foreground')).toBe('#112233')
        expect(view.lineWrapping).toBe(false)
        expect(view.dom.classList.contains('cm-lineWrapping')).toBe(false)
        view.dispatch(view.state.update({ selection: { anchor: 1 } }))
        expect(seen).toEqual([])
        view.destroy()
        parent.remove()
    })

    it('bracketMatch:false 括号旁没有匹配 class', () => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const view = liteMonaco({
            parent,
            highlighter: fakeHl(),
            doc: '()',
            features: { bracketMatch: false, minimap: false, overviewRuler: false },
        })
        view.dispatch(view.state.update({ selection: { anchor: 1 } }))
        expect(view.dom.querySelector('.cm-bracketBox, .cm-matchingBracket')).toBeNull()
        view.destroy()
        parent.remove()
    })

    it('indentOnInput:false 行首 } 不拉齐', () => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const doc = 'function f() {\n        '
        const view = liteMonaco({
            parent,
            highlighter: fakeHl(),
            doc,
            features: { indentOnInput: false, minimap: false, overviewRuler: false },
        })
        const at = view.state.doc.length
        for (const h of view.state.facet(inputHandler))
            h(view, at, at, '}')
        expect(view.state.doc.toString()).toBe(doc)
        view.destroy()
        parent.remove()
    })

    it('extensions 并入 state；自定义 dispatch 接到事务', () => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const flag = StateField.define<number>({ create: () => 7, update: v => v })
        let hits = 0
        const view = liteMonaco({
            parent,
            highlighter: fakeHl(),
            doc: 'x',
            extensions: [flag],
            dispatch: (tr, v) => {
                hits++
                v.update(tr)
            },
            features: { minimap: false, overviewRuler: false },
        })
        expect(view.state.field(flag)).toBe(7)
        view.dispatch(view.state.update({ selection: { anchor: 1 } }))
        expect(hits).toBe(1)
        view.destroy()
        parent.remove()
    })

    it('css 块注释 /* */；sql 行注释 --', () => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const css = liteMonaco({
            parent,
            highlighter: fakeHl(),
            doc: 'body',
            lang: 'css',
            features: { minimap: false, overviewRuler: false },
        })
        css.dispatch(css.state.update({ selection: { anchor: 0, head: 4 } }))
        expect(toggleBlockComment({ state: css.state, dispatch: tr => css.dispatch(tr) })).toBe(true)
        expect(css.state.doc.toString()).toBe('/* body */')
        css.destroy()

        const sql = liteMonaco({
            parent,
            highlighter: fakeHl(),
            doc: 'select 1',
            lang: 'sql',
            features: { minimap: false, overviewRuler: false },
        })
        expect(toggleComment({ state: sql.state, dispatch: tr => sql.dispatch(tr) })).toBe(true)
        expect(sql.state.doc.toString()).toBe('-- select 1')
        sql.destroy()
        parent.remove()
    })

    it('tsDiagnostics:false 不装诊断 field', () => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const view = liteMonaco({
            parent,
            highlighter: fakeHl(),
            doc: 'const x: number = "nope"',
            lang: 'typescript',
            features: {
                tsDiagnostics: false,
                hover: false,
                overviewRuler: false,
                minimap: false,
            },
        })
        expect(view.state.field(diagnosticsField, false)).toBeUndefined()
        expect(view.contentDOM.querySelector('.cm-diagnostic')).toBeNull()
        view.destroy()
        parent.remove()
    })

    it('默认挂粘性条；destroy 卸掉编辑器', () => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const view = liteMonaco({
            parent,
            highlighter: fakeHl(),
            doc: 'function f() {\n  return 1\n}',
            features: { minimap: false, overviewRuler: false },
        })
        expect(view.dom.querySelector('.cm-sticky-scroll')).not.toBeNull()
        expect(view.dom.querySelector('.cm-hscrollbar')).not.toBeNull()
        expect(view.dom.querySelector('.cm-scrollbar')).not.toBeNull()
        view.destroy()
        expect(parent.querySelector('.cm-editor')).toBeNull()
        parent.remove()
    })

    it('关竖条仍开概览：单独挂 .cm-overviewRuler', () => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const view = liteMonaco({
            parent,
            highlighter: fakeHl(),
            doc: 'x',
            features: { vScrollbar: false, minimap: false },
        })
        expect(view.dom.querySelector('.cm-scrollbar')).toBeNull()
        expect(view.dom.querySelector('.cm-overviewRuler')).not.toBeNull()
        view.destroy()
        parent.remove()
    })

    it('javascript 也挂 Quick Fix 灯泡', () => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const view = liteMonaco({
            parent,
            highlighter: fakeHl(),
            doc: 'const x = 1',
            lang: 'javascript',
            features: { minimap: false, overviewRuler: false },
        })
        expect(view.dom.querySelector('.cm-lightbulb')).not.toBeNull()
        view.destroy()
        parent.remove()
    })

    it('history:false 打字后 undo 无效', () => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const view = liteMonaco({
            parent,
            highlighter: fakeHl(),
            doc: 'ab',
            features: { history: false, minimap: false, overviewRuler: false },
        })
        expect(view.state.field(historyField, false)).toBeUndefined()
        view.dispatch(view.state.update({
            changes: { from: 2, insert: 'c' },
            userEvent: 'input.type',
        }))
        expect(view.state.doc.toString()).toBe('abc')
        expect(undo({ state: view.state, dispatch: tr => view.dispatch(tr) })).toBe(false)
        expect(view.state.doc.toString()).toBe('abc')
        view.destroy()
        parent.remove()
    })

    it('tabIndent:false 按 Tab 不插缩进；默认 Tab 插 indentUnit', () => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const off = liteMonaco({
            parent,
            highlighter: fakeHl(),
            doc: 'x',
            features: { tabIndent: false, autocomplete: false, minimap: false, overviewRuler: false },
        })
        off.contentDOM.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Tab', keyCode: 9, bubbles: true, cancelable: true,
        }))
        expect(off.state.doc.toString()).toBe('x')
        off.destroy()

        const on = liteMonaco({
            parent,
            highlighter: fakeHl(),
            doc: 'x',
            features: { autocomplete: false, minimap: false, overviewRuler: false },
        })
        on.contentDOM.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Tab', keyCode: 9, bubbles: true, cancelable: true,
        }))
        expect(on.state.doc.toString()).toBe(on.state.indentUnit + 'x')
        on.destroy()
        parent.remove()
    })

    it('未知语言行注释回退 //；默认有行号槽', () => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const view = liteMonaco({
            parent,
            highlighter: fakeHl(),
            doc: 'hello',
            lang: 'unknown-lang',
            features: { minimap: false, overviewRuler: false },
        })
        expect(view.dom.querySelector('.cm-gutters')).not.toBeNull()
        expect(toggleComment({ state: view.state, dispatch: tr => view.dispatch(tr) })).toBe(true)
        expect(view.state.doc.toString()).toBe('// hello')
        view.destroy()

        const xml = liteMonaco({
            parent,
            highlighter: fakeHl(),
            doc: 'item',
            lang: 'xml',
            features: { minimap: false, overviewRuler: false },
        })
        xml.dispatch(xml.state.update({ selection: { anchor: 0, head: 4 } }))
        expect(toggleBlockComment({ state: xml.state, dispatch: tr => xml.dispatch(tr) })).toBe(true)
        expect(xml.state.doc.toString()).toBe('<!-- item -->')
        xml.destroy()

        const yaml = liteMonaco({
            parent,
            highlighter: fakeHl(),
            doc: 'key: 1',
            lang: 'yaml',
            features: { minimap: false, overviewRuler: false },
        })
        expect(toggleComment({ state: yaml.state, dispatch: tr => yaml.dispatch(tr) })).toBe(true)
        expect(yaml.state.doc.toString()).toBe('# key: 1')
        yaml.destroy()

        const lua = liteMonaco({
            parent,
            highlighter: fakeHl(),
            doc: 'print(1)',
            lang: 'lua',
            features: { minimap: false, overviewRuler: false },
        })
        expect(toggleComment({ state: lua.state, dispatch: tr => lua.dispatch(tr) })).toBe(true)
        expect(lua.state.doc.toString()).toBe('-- print(1)')
        lua.destroy()

        const sh = liteMonaco({
            parent,
            highlighter: fakeHl(),
            doc: 'echo hi',
            lang: 'shell',
            features: { minimap: false, overviewRuler: false },
        })
        expect(toggleComment({ state: sh.state, dispatch: tr => sh.dispatch(tr) })).toBe(true)
        expect(sh.state.doc.toString()).toBe('# echo hi')
        sh.destroy()

        const toml = liteMonaco({
            parent,
            highlighter: fakeHl(),
            doc: 'a = 1',
            lang: 'toml',
            features: { minimap: false, overviewRuler: false },
        })
        expect(toggleComment({ state: toml.state, dispatch: tr => toml.dispatch(tr) })).toBe(true)
        expect(toml.state.doc.toString()).toBe('# a = 1')
        toml.destroy()

        const vim = liteMonaco({
            parent,
            highlighter: fakeHl(),
            doc: 'set nocompatible',
            lang: 'vim',
            features: { minimap: false, overviewRuler: false },
        })
        expect(toggleComment({ state: vim.state, dispatch: tr => vim.dispatch(tr) })).toBe(true)
        expect(vim.state.doc.toString()).toBe('" set nocompatible')
        vim.destroy()

        const lisp = liteMonaco({
            parent,
            highlighter: fakeHl(),
            doc: '(foo)',
            lang: 'lisp',
            features: { minimap: false, overviewRuler: false },
        })
        expect(toggleComment({ state: lisp.state, dispatch: tr => lisp.dispatch(tr) })).toBe(true)
        expect(lisp.state.doc.toString()).toBe('; (foo)')
        lisp.destroy()
        parent.remove()
    })
})
