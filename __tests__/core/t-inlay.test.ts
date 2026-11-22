// inlayHints.enabled / fontSize / fontFamily / padding + typescriptDefaults.setInlayHintsOptions 逐项生效
import { afterEach, describe, expect, it } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { editorOptions, type IEditorOptions } from '../../src/core/options'
import { EditorView } from '../../src/core/view/editorview'
import {
    hintsToMarks, inlayDecorations, inlayField, inlayLayout, inlayPressedField, inlayVisible, setInlayHints, tsInlaySession,
    type InlayMark,
} from '../../src/lang/tsinlay'
import { typescriptDefaults } from '../../src/lang/tsapi'
import { clearTSServiceCache } from '../../src/lang/tsservice'
import { WidgetType } from '../../src/core/model/decoration'

const SLOW = 60_000
afterEach(() => { typescriptDefaults.setInlayHintsOptions({}) })

const stateWith = (options: IEditorOptions, doc = 'foo(1)') =>
    EditorState.create({ doc, extensions: [inlayField, inlayPressedField, editorOptions.of(options)] })

function widgets(state: EditorState, marks: InlayMark[]) {
    const out: { pos: number, el: HTMLElement }[] = []
    inlayDecorations(state, marks).between(0, state.doc.length, (from, _to, d) => {
        const w = (d as unknown as { spec: { widget: WidgetType & { toDOM(): HTMLElement } } }).spec.widget
        out.push({ pos: from, el: w.toDOM() as HTMLElement })
    })
    return out
}

async function until(pred: () => boolean, ms = 20_000) {
    const end = Date.now() + ms
    while (Date.now() < end) {
        if (pred()) return true
        await new Promise(r => setTimeout(r, 20))
    }
    return false
}

describe('hintsToMarks 带上 kind / padding', () => {
    it('whitespaceBefore/After → paddingLeft/Right;没有的不带键', () => {
        expect(hintsToMarks([{ position: 3, text: ': number', kind: 'Type', whitespaceBefore: true }, { position: 1, text: 'a:', kind: 'Parameter', whitespaceAfter: true }]))
            .toEqual([{ pos: 1, text: 'a:', kind: 'Parameter', paddingRight: true }, { pos: 3, text: ': number', kind: 'Type', paddingLeft: true }])
    })
})

describe('inlayHints.enabled', () => {
    const marks = [{ pos: 4, text: 'a:' }]
    it('on(默认)画;off 不画', () => {
        expect(widgets(stateWith({}), marks)).toHaveLength(1)
        expect(widgets(stateWith({ inlayHints: { enabled: 'off' } }), marks)).toHaveLength(0)
    })
    it('offUnlessPressed:没按 Ctrl+Alt 不画,按下才画;onUnlessPressed 相反', () => {
        const mk = (enabled: 'offUnlessPressed' | 'onUnlessPressed') => stateWith({ inlayHints: { enabled } })
        expect(inlayVisible(mk('offUnlessPressed'))).toBe(false)
        expect(inlayVisible(mk('onUnlessPressed'))).toBe(true)
    })
    it('Ctrl+Alt 按下 / 松开(window 键盘事件)切换可见性;Shift 或 Meta 同按不算', async () => {
        clearTSServiceCache()
        const host = document.createElement('div')
        document.body.appendChild(host)
        const view = new EditorView({ state: stateWith({ inlayHints: { enabled: 'offUnlessPressed' } }), parent: host })
        const off = tsInlaySession(view, { lang: 'typescript', fileName: '/t-inlay-key.ts' })
        expect(inlayVisible(view.state)).toBe(false)
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', altKey: true, ctrlKey: true }))
        expect(inlayVisible(view.state)).toBe(true)
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift', altKey: true, ctrlKey: true, shiftKey: true }))
        expect(inlayVisible(view.state)).toBe(false)
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', altKey: true, ctrlKey: true }))
        window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Alt', ctrlKey: true }))
        expect(inlayVisible(view.state)).toBe(false)
        off(); view.destroy(); host.remove()
    })
})

describe('inlayHints.fontSize / fontFamily / padding (Monaco _getLayoutInfo)', () => {
    it('fontSize 0 / <5 / 大于编辑器字号 → 用编辑器字号', () => {
        expect(inlayLayout(stateWith({ fontSize: 16, inlayHints: { fontSize: 0 } })).fontSize).toBe(16)
        expect(inlayLayout(stateWith({ fontSize: 16, inlayHints: { fontSize: 4 } })).fontSize).toBe(16)
        expect(inlayLayout(stateWith({ fontSize: 16, inlayHints: { fontSize: 20 } })).fontSize).toBe(16)
        expect(inlayLayout(stateWith({ fontSize: 16, inlayHints: { fontSize: 11 } })).fontSize).toBe(11)
    })
    it('widget 样式:字号 / 字体 / padding / 圆角', () => {
        const marks = [{ pos: 1, text: 'a:' }]
        const [w] = widgets(stateWith({ fontSize: 16, inlayHints: { fontSize: 10, fontFamily: 'Menlo', padding: true } }), marks)
        expect(w.el.style.fontSize).toBe('10px')
        expect(w.el.style.fontFamily).toContain('Menlo')
        expect(w.el.style.padding).toBe('1px 2px')
        expect(w.el.style.borderRadius).toBe('2px')
        // 全默认:不写内联样式(跟编辑器一致)
        const [d] = widgets(stateWith({}), marks)
        expect(d.el.style.fontSize).toBe('')
        expect(d.el.style.padding).toBe('')
    })
    it('paddingLeft / paddingRight → 宽 fontSize/3 的间隔;kind 进 class', () => {
        const [w] = widgets(stateWith({ fontSize: 15 }), [{ pos: 1, text: ': number', kind: 'Type', paddingLeft: true, paddingRight: true }])
        expect(w.el.style.marginLeft).toBe('5px')
        expect(w.el.style.marginRight).toBe('5px')
        expect(w.el.classList.contains('cm-inlayHint-type')).toBe(true)
    })
})

describe('typescriptDefaults.setInlayHintsOptions 逐项生效(真 TS)', () => {
    const DOC = 'function foo(count: number, name: string) { return count }\nconst v = foo(1, "x")\nenum E { A, B }\nfunction g() { return 1 }\n'
    async function hintsFor(prefs: Record<string, unknown>, options: IEditorOptions = {}) {
        clearTSServiceCache()
        typescriptDefaults.setInlayHintsOptions(prefs)
        const host = document.createElement('div')
        document.body.appendChild(host)
        const view = new EditorView({ state: EditorState.create({ doc: DOC, extensions: [inlayField, inlayPressedField, editorOptions.of(options)] }), parent: host })
        const off = tsInlaySession(view, { lang: 'typescript', fileName: '/t-inlay-opts.ts' })
        await new Promise(r => setTimeout(r, 450))
        await until(() => (view.state.field(inlayField)).length > 0, 3000)
        const texts = view.state.field(inlayField).map(m => m.text)
        const marks = view.state.field(inlayField)
        off(); view.destroy(); host.remove()
        return { texts, marks }
    }
    it('选项为空 = 不出 hint(Monaco 默认)', async () => {
        expect((await hintsFor({})).texts).toEqual([])
    }, SLOW)
    it('includeInlayParameterNameHints: all → 参数名;none → 没有', async () => {
        const all = await hintsFor({ includeInlayParameterNameHints: 'all' })
        expect(all.texts).toContain('count:')
        expect(all.texts).toContain('name:')
        expect((await hintsFor({ includeInlayParameterNameHints: 'none' })).texts).toEqual([])
    }, SLOW)
    it('includeInlayFunctionLikeReturnTypeHints → 返回类型提示,kind=Type', async () => {
        const r = await hintsFor({ includeInlayFunctionLikeReturnTypeHints: true })
        expect(r.texts.some(t => t.includes('number'))).toBe(true)
        expect(r.marks.every(m => m.kind === 'Type')).toBe(true)
    }, SLOW)
    it('includeInlayVariableTypeHints → 变量类型;includeInlayEnumMemberValueHints → 枚举值', async () => {
        const vt = await hintsFor({ includeInlayVariableTypeHints: true })
        expect(vt.texts).toEqual([': number'])
        expect(vt.marks[0].kind).toBe('Type')
        const en = await hintsFor({ includeInlayEnumMemberValueHints: true })
        expect(en.marks.some(m => m.kind === 'Enum')).toBe(true)
    }, SLOW)
    it('inlayHints.enabled=off:选项再全也不出;设置后运行时 setInlayHintsOptions 立刻刷新', async () => {
        expect((await hintsFor({ includeInlayParameterNameHints: 'all' }, { inlayHints: { enabled: 'off' } })).texts).toEqual([])
        clearTSServiceCache()
        typescriptDefaults.setInlayHintsOptions({})
        const host = document.createElement('div')
        document.body.appendChild(host)
        const view = new EditorView({ state: EditorState.create({ doc: DOC, extensions: [inlayField, inlayPressedField] }), parent: host })
        const off = tsInlaySession(view, { lang: 'typescript', fileName: '/t-inlay-live.ts' })
        await new Promise(r => setTimeout(r, 450))
        expect(view.state.field(inlayField)).toEqual([])
        typescriptDefaults.setInlayHintsOptions({ includeInlayParameterNameHints: 'all' })
        expect(await until(() => view.state.field(inlayField).some(m => m.text === 'count:'))).toBe(true)
        typescriptDefaults.setInlayHintsOptions({})
        expect(await until(() => view.state.field(inlayField).length === 0)).toBe(true)
        view.dispatch(view.state.update({ effects: setInlayHints.of([]) }))
        off(); view.destroy(); host.remove()
    }, SLOW)
})
