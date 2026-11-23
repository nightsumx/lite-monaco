// 最终补测:编辑核心与命令(multiCursorMergeOverlapping / cursorRedo / toggleTabFocusMode / triggerParameterHints /
// showDefinitionPreviewHover / copyWithSyntaxHighlighting 导出 / 补全枚举与事件类型导出)。
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, mountEditor } from './h2-helpers'
import { EditorState } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'
import { EditorView } from '../../src/core/view/editorview'
import { editorOptions, type IEditorOptions } from '../../src/core/options'
import { history, undo } from '../../src/core/edit/history'
import { cursorCharLeft, cursorCharRight, selectCharLeft, selectCharRight, deleteCharBackward } from '../../src/core/edit/commands'
import { cursorLineDown } from '../../src/core/edit/vertical'
import { tabFocusMoves, toggleTabFocusMode } from '../../src/core/edit/commands'
import { registerDefinitionProvider } from '../../src/lang/providers'
import { showDefinitionPreviewHover, definitionLinkField, setDefinitionLink } from '../../src/lang/defhover'
import * as core from '../../src/core/index'
import * as pub from '../../src/index'

afterEach(cleanup)

// ───────────── multiCursorMergeOverlapping ─────────────

const views: EditorView[] = []
afterEach(() => { for (const v of views.splice(0)) { v.destroy(); v.dom.parentElement?.remove() } })
function make(doc: string, options: IEditorOptions, sel: number[]) {
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    const view = new EditorView({
        state: EditorState.create({
            doc,
            selection: EditorSelection.create(sel.map(p => EditorSelection.cursor(p))),
            extensions: [EditorState.allowMultipleSelections.of(true), editorOptions.of(options), history()],
        }),
        parent,
    })
    views.push(view)
    return view
}
const run = (v: EditorView, cmd: (t: { state: EditorState, dispatch: (tr: never) => void }) => boolean) =>
    cmd({ state: v.state, dispatch: (tr: never) => v.dispatch(tr) } as never)
const heads = (v: EditorView) => v.state.selection.ranges.map(r => r.head)

describe('multiCursorMergeOverlapping', () => {
    it('默认 true:光标移动到同一点就合并(Monaco 默认)', () => {
        const v = make('abc\ndef', {}, [0, 1])
        run(v, cursorCharLeft as never)
        expect(heads(v)).toEqual([0])
        expect(v.state.selection.keepOverlap).toBe(false)
    })

    it('false:左移后重合的光标各自保留;再输入,两处都插入', () => {
        const v = make('abc\ndef', { multiCursorMergeOverlapping: false }, [0, 1])
        run(v, cursorCharLeft as never)
        expect(heads(v)).toEqual([0, 0])
        expect(v.state.selection.keepOverlap).toBe(true)
        // 输入:每个光标一次插入(Monaco 同样会在同一点插两遍)
        v.dispatch(v.state.update(v.state.replaceSelection('X'), { userEvent: 'input.type' }))
        expect(v.state.doc.toString()).toBe('XXabc\ndef')
        expect(v.state.selection.ranges.length).toBe(2) // 输入之后仍是两个光标
    })

    it('false:右移越过行尾 / 文档尾后重合的光标不合并,主光标下标不变', () => {
        const v = make('ab', { multiCursorMergeOverlapping: false }, [1, 2])
        run(v, cursorCharRight as never)
        expect(heads(v)).toEqual([2, 2])
        expect(v.state.selection.mainIndex).toBe(0)
    })

    it('false:扩选后重叠的选区不合并(true 时合并成一个)', () => {
        const mk = (merge: boolean) => {
            const v = make('abcdef', { multiCursorMergeOverlapping: merge }, [1, 3])
            run(v, selectCharRight as never) // [1,2] [3,4]
            run(v, selectCharRight as never) // [1,3] [3,5]
            run(v, selectCharRight as never) // [1,4] [3,6] 重叠
            return v
        }
        const merged = mk(true)
        expect(merged.state.selection.ranges.map(r => [r.from, r.to])).toEqual([[1, 6]])
        const kept = mk(false)
        expect(kept.state.selection.ranges.map(r => [r.from, r.to])).toEqual([[1, 4], [3, 6]])
        // 再往回缩:仍是两段
        run(kept, selectCharLeft as never)
        expect(kept.state.selection.ranges.map(r => [r.from, r.to])).toEqual([[1, 3], [3, 5]])
    })

    it('false:竖向移动到同一行同一列时也不合并', () => {
        // 两个光标在 (1,2) 和 (2,2):↓ 之后落在 (2,2) 和 (3,2)——不重合;换成末行两点:都被夹到末行尾
        const v = make('ab\ncd', { multiCursorMergeOverlapping: false }, [4, 5])
        run(v, cursorLineDown as never) // 末行:↓ 到行尾
        expect(heads(v)).toEqual([5, 5])
        const w = make('ab\ncd', {}, [4, 5])
        run(w, cursorLineDown as never)
        expect(heads(w)).toEqual([5])
    })

    it('false:重合的光标退格,删除只发生一次(重叠的删除合并),文档与默认路径一致', () => {
        const v = make('abc', { multiCursorMergeOverlapping: false }, [2, 3])
        run(v, cursorCharLeft as never) // 1, 2
        run(v, cursorCharLeft as never) // 0, 1
        run(v, cursorCharLeft as never) // 0, 0
        expect(heads(v)).toEqual([0, 0])
        v.dispatch(v.state.update(v.state.replaceSelection('Y'), { userEvent: 'input.type' }))
        expect(v.state.doc.toString()).toBe('YYabc')
        run(v, deleteCharBackward as never)
        expect(v.state.doc.toString()).toBe('abc')
        undo(v)
        expect(v.state.doc.toString()).toBe('YYabc')
    })

    it('运行时 updateOptions 切换生效(lite-monaco 实例)', () => {
        const ed = mountEditor('abc')
        ed.dispatch(ed.state.update({ selection: EditorSelection.create([EditorSelection.cursor(0), EditorSelection.cursor(1)]) }))
        ed.updateOptions({ multiCursorMergeOverlapping: false })
        expect(ed.getOption(pub.EditorOption.multiCursorMergeOverlapping)).toBe(false)
        core.cursorCharLeft({ state: ed.state, dispatch: (tr: never) => ed.dispatch(tr) } as never)
        expect(ed.state.selection.ranges.map((r: { head: number }) => r.head)).toEqual([0, 0])
    })

    it('EditorSelection.create(…, keepOverlap) 的通道:排序保留重叠;map / replaceRange 沿用;默认路径不变', () => {
        const a = EditorSelection.create([EditorSelection.range(2, 5), EditorSelection.range(0, 3)], 0, true)
        expect(a.ranges.map(r => [r.from, r.to])).toEqual([[0, 3], [2, 5]])
        expect(a.mainIndex).toBe(1)
        expect(a.keepOverlap).toBe(true)
        expect(a.replaceRange(EditorSelection.range(1, 4), 0).keepOverlap).toBe(true)
        const d = EditorSelection.create([EditorSelection.range(2, 5), EditorSelection.range(0, 3)], 0)
        expect(d.ranges.map(r => [r.from, r.to])).toEqual([[0, 5]])
        expect(d.keepOverlap).toBe(false)
    })
})

// ───────────── cursorUndo / cursorRedo(动作 / trigger 入口 + 栈上限) ─────────────

describe('cursorRedo', () => {
    const at = (ed: ReturnType<typeof mountEditor>, p: number) => ed.dispatch(ed.state.update({ selection: { anchor: p } }))
    it('getAction("cursorRedo") / trigger 都能把撤销过的光标位置找回来', async () => {
        const ed = mountEditor('abc\ndef\nghi')
        at(ed, 2); at(ed, 6); at(ed, 10)
        await ed.getAction('cursorUndo').run()
        await ed.getAction('cursorUndo').run()
        expect(ed.state.selection.main.head).toBe(2)
        await ed.getAction('cursorRedo').run()
        expect(ed.state.selection.main.head).toBe(6)
        ed.trigger('test', 'cursorRedo', null)
        expect(ed.state.selection.main.head).toBe(10)
        // 栈空:再 redo 什么也不发生
        await ed.getAction('cursorRedo').run()
        expect(ed.state.selection.main.head).toBe(10)
    })

    it('撤销栈上限 50:移动 60 次只能撤回 50 步,redo 能原路回来', () => {
        const parent = document.createElement('div'); document.body.appendChild(parent)
        const v = new EditorView({ state: EditorState.create({ doc: 'x'.repeat(100), extensions: [history()] }), parent })
        views.push(v)
        for (let i = 1; i <= 60; i++) v.dispatch(v.state.update({ selection: { anchor: i } }))
        let n = 0
        while (run(v, core.cursorUndo as never)) n++
        expect(n).toBe(50)
        expect(v.state.selection.main.head).toBe(10)
        let m = 0
        while (run(v, core.cursorRedo as never)) m++
        expect(m).toBe(50)
        expect(v.state.selection.main.head).toBe(60)
    })

    it('编辑文档清空 redo 栈', () => {
        const ed = mountEditor('abcdef')
        at(ed, 1); at(ed, 3)
        core.cursorUndo({ state: ed.state, dispatch: (tr: never) => ed.dispatch(tr) } as never)
        ed.dispatch(ed.state.update({ changes: { from: 0, insert: 'Z' }, userEvent: 'input.type' }))
        expect(core.cursorRedo({ state: ed.state, dispatch: (tr: never) => ed.dispatch(tr) } as never)).toBe(false)
    })
})

// ───────────── toggleTabFocusMode ─────────────

describe('editor.action.toggleTabFocusMode', () => {
    afterEach(() => { if (tabFocusMoves()) toggleTabFocusMode({ inputState: { tabFocusMode: 0 } }) })

    it('F1 面板有 Toggle Tab Key Moves Focus;getAction 认 editor.action.toggleTabFocusMode,run 翻全页开关并播报', async () => {
        const cmd = core.defaultPaletteCommands().find(c => c.id === 'toggleTabFocus')
        expect(cmd?.label).toBe('Toggle Tab Key Moves Focus')
        const ed = mountEditor('x')
        const act = ed.getAction('editor.action.toggleTabFocusMode')
        expect(act?.label).toBe('Toggle Tab Key Moves Focus')
        expect(tabFocusMoves()).toBe(false)
        await act.run()
        expect(tabFocusMoves()).toBe(true)
        expect(ed.inputState.tabFocusMode).toBe(0)
        const frame = () => new Promise(r => requestAnimationFrame(() => r(null)))
        const live = () => ed.dom.querySelector('[data-cm-a11y-live]')?.textContent
        await frame()
        expect(live()).toContain('Pressing Tab will now move focus')
        await act.run()
        expect(tabFocusMoves()).toBe(false)
        await frame()
        expect(live()).toContain('insert the tab character')
    })

    it('键盘 ⌃⇧M(Mac)翻转,与 F1 同一个开关', () => {
        const ed = mountEditor('x')
        ed.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'M', code: 'KeyM', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }))
        expect(tabFocusMoves()).toBe(true)
        ed.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'M', code: 'KeyM', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }))
        expect(tabFocusMoves()).toBe(false)
    })

    it('executeCommand / trigger 按 Monaco id 也能触发', () => {
        const ed = mountEditor('x')
        ed.trigger('test', 'editor.action.toggleTabFocusMode', null)
        expect(tabFocusMoves()).toBe(true)
    })
})

// ───────────── triggerParameterHints ─────────────

describe('editor.action.triggerParameterHints', () => {
    const tsEd = (features: Record<string, unknown> = {}) => mountEditor('function f(a: number) {}\nf(', {
        lang: 'typescript',
        features: { minimap: false, autocomplete: false, hover: false, stickyScroll: false, tsDiagnostics: false, codeActions: false, signatureHelp: true, ...features },
    })

    it('TS 编辑器:getAction 认它,label 为 Trigger Parameter Hints;run 向编辑器派发显式触发事件', async () => {
        const ed = tsEd()
        const act = ed.getAction('editor.action.triggerParameterHints')
        expect(act).toBeTruthy()
        expect(act.label).toBe('Trigger Parameter Hints')
        let fired = 0
        ed.dom.addEventListener('lite-monaco-signature-help', () => { fired++ })
        await act.run()
        expect(fired).toBe(1)
        expect(ed.getSupportedActions().some((a: { id: string }) => a.id === 'editor.action.triggerParameterHints')).toBe(true)
    })

    it('F1 面板里有这条,键帽 ⇧⌘Space(Mac)', async () => {
        const ed = tsEd()
        ed.focus()
        ed.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'F1', code: 'F1', bubbles: true, cancelable: true }))
        const rows = [...document.querySelectorAll('.cm-quick-input-row')]
        const row = rows.find(r => r.textContent?.includes('Trigger Parameter Hints'))
        expect(row).toBeTruthy()
        expect(row!.textContent).toContain('⇧⌘Space')
    })

    it('⇧⌘Space(Mac)触发同一事件;signatureHelp 关掉的编辑器没有这个动作', () => {
        const ed = tsEd()
        let fired = 0
        ed.dom.addEventListener('lite-monaco-signature-help', () => { fired++ })
        ed.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', metaKey: true, shiftKey: true, bubbles: true, cancelable: true }))
        expect(fired).toBe(1)
        const off = tsEd({ signatureHelp: false })
        expect(off.getAction('editor.action.triggerParameterHints')).toBeNull()
        const plain = mountEditor('x')
        expect(plain.getAction('editor.action.triggerParameterHints')).toBeNull()
    })

    it('parameterHints.enabled=false 只关打字自动弹,命令本身仍能触发', async () => {
        const ed = tsEd()
        ed.updateOptions({ parameterHints: { enabled: false } })
        let fired = 0
        ed.dom.addEventListener('lite-monaco-signature-help', () => { fired++ })
        await ed.getAction('editor.action.triggerParameterHints').run()
        expect(fired).toBe(1)
    })
})

// ───────────── showDefinitionPreviewHover ─────────────

describe('editor.action.showDefinitionPreviewHover', () => {
    const DOC = 'function target() {\n    return 1\n}\ntarget()'
    const CALL = DOC.lastIndexOf('target') + 2
    const withProvider = () => registerDefinitionProvider('plaintext', {
        provideDefinition: (model, pos) => {
            const w = model.getWordAtPosition(pos)
            if (!w || w.word !== 'target') return null
            return { uri: model.uri, range: { startLineNumber: 1, startColumn: 10, endLineNumber: 1, endColumn: 16 } }
        },
    })

    it('命令本身:有定义 → 返回 true、给光标下的词设 link(带预览),并弹出 hover 卡', async () => {
        const reg = withProvider()
        const ed = mountEditor(DOC, { lang: 'plaintext', features: { minimap: false, autocomplete: false, hover: true, stickyScroll: false, tsDiagnostics: false, signatureHelp: false, codeActions: false } })
        ed.dispatch(ed.state.update({ selection: { anchor: CALL } }))
        const acts = { definitionPreviewAt: async (v: EditorView, pos: number) => {
            const w = /\w+/g
            let m: RegExpExecArray | null
            const text = v.state.doc.toString()
            while ((m = w.exec(text))) if (pos >= m.index && pos <= m.index + m[0].length) return { from: m.index, to: m.index + m[0].length, count: 1, local: true, file: 'x', line: 1, text: 'function target() {\n    return 1\n}' }
            return null
        }, goToDefinition: async () => true, peekDefinition: async () => true }
        const ok = await showDefinitionPreviewHover(ed, acts)
        expect(ok).toBe(true)
        const link = ed.state.field(definitionLinkField)
        expect(link).toMatchObject({ from: DOC.lastIndexOf('target'), to: DOC.lastIndexOf('target') + 6 })
        expect(link!.preview?.text).toContain('function target')
        expect(document.querySelector('.cm-definition-preview-code')?.textContent).toContain('function target')
        reg.dispose()
    })

    it('命令本身:没有定义 → 返回 false,不设 link', async () => {
        const ed = mountEditor('plain words only')
        const acts = { definitionPreviewAt: async () => null, goToDefinition: async () => false, peekDefinition: async () => false }
        expect(await showDefinitionPreviewHover(ed, acts)).toBe(false)
        expect(ed.state.field(definitionLinkField, false) ?? null).toBeNull()
        void setDefinitionLink
    })

    it('经 getAction("editor.action.showDefinitionPreviewHover") 走已注册的 DefinitionProvider', async () => {
        const reg = withProvider()
        const ed = mountEditor(DOC, { lang: 'plaintext', features: { minimap: false, autocomplete: false, hover: true, stickyScroll: false, tsDiagnostics: false, signatureHelp: false, codeActions: false } })
        const act = ed.getAction('editor.action.showDefinitionPreviewHover')
        expect(act?.label).toBe('Show Definition Preview Hover')
        ed.dispatch(ed.state.update({ selection: { anchor: CALL } }))
        await act.run()
        await new Promise(r => setTimeout(r, 30))
        expect(ed.state.field(definitionLinkField)?.preview?.text).toContain('function target')
        reg.dispose()
    })

    it('没有定义来源的编辑器没有这个动作(无 provider 的 plaintext 仍有 F1 条目但返回 false)', async () => {
        const ed = mountEditor('x', { lang: 'plaintext' })
        const act = ed.getAction('editor.action.showDefinitionPreviewHover')
        expect(act).toBeTruthy()
        await act.run()
        expect(ed.state.field(definitionLinkField, false) ?? null).toBeNull()
    })
})

// ───────────── 导出面 ─────────────

describe('包出口:copyWithSyntaxHighlighting / 事件类型 / 补全枚举 / EditorZoom / registerLinkOpener', () => {
    it('core 导出 copyWithSyntaxHighlighting facet,设成 false 只写 text/plain', () => {
        expect(core.copyWithSyntaxHighlighting).toBeDefined()
        const parent = document.createElement('div'); document.body.appendChild(parent)
        const v = new EditorView({ state: EditorState.create({ doc: 'const a = 1', selection: { anchor: 0, head: 5 }, extensions: [core.copyWithSyntaxHighlighting.of(false)] }), parent })
        views.push(v)
        const store = new Map<string, string>()
        const sink = { clearData() { store.clear() }, setData(t: string, d: string) { store.set(t, d) } }
        expect(core.cutOrCopy(v, sink, false)).toBe(true)
        expect(store.get('text/plain')).toBe('const')
        expect(store.has('text/html')).toBe(false)
    })

    it('src/index 导出 EditorZoom(get/set/事件)与 registerLinkOpener', () => {
        expect(typeof pub.EditorZoom.getZoomLevel).toBe('function')
        expect(typeof pub.EditorZoom.setZoomLevel).toBe('function')
        expect(typeof pub.EditorZoom.onDidChangeZoomLevel).toBe('function')
        const seen: number[] = []
        const d = pub.EditorZoom.onDidChangeZoomLevel(l => seen.push(l))
        pub.EditorZoom.setZoomLevel(2)
        expect(pub.EditorZoom.getZoomLevel()).toBe(2)
        pub.EditorZoom.setZoomLevel(0)
        expect(seen).toEqual([2, 0])
        d.dispose()
        expect(typeof pub.registerLinkOpener).toBe('function')
    })

    it('补全枚举数值同 monaco.languages', async () => {
        // @ts-ignore 0.52 的 esm 子路径没有 d.ts
        const m0 = await import('monaco-editor/esm/vs/editor/common/standalone/standaloneEnums.js') as unknown as Record<string, Record<string, number>>
        // 已装的 0.52.2 比 0.55.1 少一个 Tool:0.55 起 Tool = 27、Snippet = 28(补全排序按种类数值比,Snippet 是最大值)。本库跟 0.55.1。
        const m: Record<string, Record<string, number>> = { ...m0, CompletionItemKind: { ...m0.CompletionItemKind, Tool: 27, Snippet: 28 } }
        for (const name of ['CompletionItemKind', 'CompletionItemTag', 'CompletionItemInsertTextRule', 'CompletionTriggerKind'] as const) {
            const mine = (pub as unknown as Record<string, Record<string, number>>)[name]
            expect(mine, name).toBeDefined()
            for (const [k, v] of Object.entries(m[name])) if (typeof v === 'number') expect(mine[k], `${name}.${k}`).toBe(v)
            for (const [k, v] of Object.entries(mine)) if (typeof v === 'number') expect(m[name][k], `${name}.${k}`).toBe(v)
        }
    })

    it('事件载荷类型可从包出口引用(编译期;IScrollEvent / ICursorPositionChangedEvent / ICursorSelectionChangedEvent / IContentSizeChangedEvent)', () => {
        const s: pub.IScrollEvent = { scrollTop: 0, scrollLeft: 0, scrollWidth: 0, scrollHeight: 0, scrollTopChanged: false, scrollLeftChanged: false, scrollWidthChanged: false, scrollHeightChanged: false }
        const c: pub.IContentSizeChangedEvent = { contentWidth: 0, contentHeight: 0, contentWidthChanged: false, contentHeightChanged: false }
        const p: pub.ICursorPositionChangedEvent | null = null
        const q: pub.ICursorSelectionChangedEvent | null = null
        expect([s.scrollTop, c.contentWidth, p, q]).toEqual([0, 0, null, null])
    })
})
