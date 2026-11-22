import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'
import { EditorView } from '../../src/core/view/editorview'
import { editorOptions } from '../../src/core/options'
import { searchField, searchPanel, openSearch, rememberedFlags, clearFindHistory } from '../../src/core/feature/search'

// find.findOnType / find.history / find.replaceHistory —— Monaco findWidget._buildDomNode:
//   findOnType=false:输入框 onDidChange 不提交,Enter 才 state.change({searchString});
//   history='never' / replaceHistory='never':输入框用空 Set,历史不跨框 / 不进 workspace 存储。
beforeEach(() => { vi.useFakeTimers(); clearFindHistory(); Object.assign(rememberedFlags, { caseSensitive: false, wholeWord: false, regex: false, preserveCase: false }) })
afterEach(() => { vi.useRealTimers(); document.body.replaceChildren() })

function panel(find: Record<string, unknown> = {}, doc = 'alpha beta alpha') {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const view = new EditorView({
        state: EditorState.create({ doc, selection: EditorSelection.cursor(0), extensions: [searchField, editorOptions.of({ find: { seedSearchStringFromSelection: 'never', ...find } } as never)] }),
        parent: host,
    })
    const stop = searchPanel(view)
    openSearch({ state: view.state, dispatch: tr => view.dispatch(tr) })
    const find$ = view.dom.querySelector('textarea[main-field]') as HTMLTextAreaElement
    const key = (el: HTMLElement, k: string) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }))
    const type = (el: HTMLTextAreaElement, v: string) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })) }
    const replace$ = () => view.dom.querySelector('.cm-replace-input-box textarea') as HTMLTextAreaElement
    return { view, find$, replace$, key, type, q: () => view.state.field(searchField).query, done: () => { stop(); view.destroy() } }
}

describe('find.findOnType', () => {
    it('默认 true:打字即搜', () => {
        const p = panel()
        p.type(p.find$, 'alp')
        expect(p.q()).toBe('alp')
        p.done()
    })
    it('false:打字不提交,Enter 才提交并跳到下一处', () => {
        const p = panel({ findOnType: false })
        p.type(p.find$, 'beta')
        expect(p.q()).toBe('')
        p.key(p.find$, 'Enter')
        expect(p.q()).toBe('beta')
        expect(p.view.state.selection.main.from).toBe(6)
        p.done()
    })
    it('false:切大小写开关不把没回车的文字带进查询', () => {
        const p = panel({ findOnType: false })
        p.type(p.find$, 'beta')
        ;(p.view.dom.querySelector('[name=case]') as HTMLElement).click()
        expect(p.q()).toBe('')
        p.done()
    })
})

describe('find.history / find.replaceHistory', () => {
    const remember = (p: ReturnType<typeof panel>, el: HTMLTextAreaElement, v: string) => {
        p.type(el, v)
        vi.advanceTimersByTime(500)
    }
    it("默认 'workspace':历史跨编辑器共享(先在 A 记下,B 的 ↑ 能取回)", () => {
        const a = panel()
        remember(a, a.find$, 'alpha')
        a.done()
        const b = panel()
        b.key(b.find$, 'ArrowUp')
        expect(b.find$.value).toBe('alpha')
        b.done()
    })
    it("find.history:'never':不进共享历史,别的编辑器取不到", () => {
        const a = panel({ history: 'never' })
        remember(a, a.find$, 'alpha')
        a.done()
        const b = panel()
        b.key(b.find$, 'ArrowUp')
        expect(b.find$.value).toBe('')
        b.done()
    })
    it("find.history:'never':本框内 ↑ 仍能回到先前的查询", () => {
        const a = panel({ history: 'never' })
        remember(a, a.find$, 'alpha')
        a.type(a.find$, 'gamma')
        a.key(a.find$, 'ArrowUp')
        expect(a.find$.value).toBe('alpha')
        a.done()
    })
    it("replaceHistory:'never':替换框的历史不共享,查找框历史不受影响", () => {
        const a = panel({ replaceHistory: 'never' })
        ;(a.view.dom.querySelector('.cm-find-toggle-replace') as HTMLElement).click()
        a.type(a.replace$(), 'ZED')
        remember(a, a.find$, 'alpha') // 历史由查找框的改动触发 500ms 后一并记下(同既有 search.test 的顺序)
        a.done()
        const b = panel()
        ;(b.view.dom.querySelector('.cm-find-toggle-replace') as HTMLElement).click()
        b.key(b.find$, 'ArrowUp')
        b.key(b.replace$(), 'ArrowUp')
        expect(b.find$.value).toBe('alpha')
        expect(b.replace$().value).toBe('')
        b.done()
    })
    it("replaceHistory 默认 'workspace':替换框历史共享", () => {
        const a = panel()
        ;(a.view.dom.querySelector('.cm-find-toggle-replace') as HTMLElement).click()
        a.type(a.replace$(), 'ZED')
        remember(a, a.find$, 'alpha') // 历史由查找框的改动触发 500ms 后一并记下(同既有 search.test 的顺序)
        a.done()
        const b = panel()
        ;(b.view.dom.querySelector('.cm-find-toggle-replace') as HTMLElement).click()
        b.key(b.replace$(), 'ArrowUp')
        expect(b.replace$().value).toBe('ZED')
        b.done()
    })
})
