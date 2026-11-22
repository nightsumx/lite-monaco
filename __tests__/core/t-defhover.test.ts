// Ctrl/⌘ 悬停定义链接 + definitionLinkOpensInPeek + peekWidgetDefaultFocus + showDefinitionPreviewHover
import { describe, expect, it } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { editorOptions, type IEditorOptions } from '../../src/core/options'
import { EditorView } from '../../src/core/view/editorview'
import { clickDefinitionHandler } from '../../src/core/input/mouseselection'
import { createTSActions, definitionPreviewText } from '../../src/lang/tsactions'
import {
    clickDefinition, definitionHoverSession, definitionLinkField, definitionPreviewHoverSource, hasDefinitionModifier, setDefinitionLink,
} from '../../src/lang/defhover'

const SLOW = 60_000
// export:各用例共用一个 TS 项目,脚本文件的同名全局函数会互相变成多处定义
const DOC = 'export function target(a: number) {\n    return a + 1\n}\nconst v = target(2)\n'
const CALL = DOC.indexOf('target(2)') + 2

function mount(options: IEditorOptions = {}, fileName = '/t-defhover.ts') {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const view = new EditorView({
        state: EditorState.create({ doc: DOC, selection: { anchor: CALL }, extensions: [definitionLinkField, editorOptions.of(options)] }),
        parent: host,
    })
    const actions = createTSActions({ lang: 'typescript', fileName })
    return { view, actions, done: () => { view.destroy(); host.remove() } }
}
async function until(pred: () => boolean, ms = 20_000) {
    const end = Date.now() + ms
    while (Date.now() < end) { if (pred()) return true; await new Promise(r => setTimeout(r, 20)) }
    return false
}

describe('hasDefinitionModifier / multiCursorModifier', () => {
    const noMods = { altKey: false, ctrlKey: false, metaKey: false }
    it('altKey(默认):Ctrl/⌘ 是跳定义键,Alt 不是', () => {
        const st = EditorState.create({ extensions: [editorOptions.of({})] })
        expect(hasDefinitionModifier(st, { ...noMods, ctrlKey: true }) || hasDefinitionModifier(st, { ...noMods, metaKey: true })).toBe(true)
        expect(hasDefinitionModifier(st, { ...noMods, altKey: true })).toBe(false)
    })
    it('ctrlCmd:Alt 才是跳定义键,Ctrl/⌘ 不是', () => {
        const st = EditorState.create({ extensions: [editorOptions.of({ multiCursorModifier: 'ctrlCmd' })] })
        expect(hasDefinitionModifier(st, { ...noMods, altKey: true })).toBe(true)
        expect(hasDefinitionModifier(st, { ...noMods, ctrlKey: true })).toBe(false)
        expect(hasDefinitionModifier(st, { ...noMods, metaKey: true })).toBe(false)
    })
})

describe('definitionPreviewText(Monaco getPreviewRangeBasedOnIndentation)', () => {
    it('取到同缩进的下一行为止,并去掉公共缩进', () => {
        const t = 'class A {\n    foo() {\n        return 1\n    }\n    bar() {}\n}\n'
        expect(definitionPreviewText(t, t.indexOf('foo'))).toBe('foo() {\n    return 1\n}')
    })
})

describe('definitionPreviewAt', () => {
    it('词范围 + 定义数 + 预览', async () => {
        const m = mount()
        const p = await m.actions.definitionPreviewAt(m.view, CALL)
        expect(p).toMatchObject({ from: DOC.indexOf('target(2)'), to: DOC.indexOf('target(2)') + 6, count: 1, local: true, line: 1 })
        expect(p!.text.startsWith('export function target')).toBe(true)
        expect(await m.actions.definitionPreviewAt(m.view, DOC.indexOf('{'))).toBeNull() // 空白 / 标点处没有词
        m.done()
    }, SLOW)
})

describe('definitionHoverSession:按住修饰键悬停 → 下划线装饰 + 手型光标;松开清除', () => {
    it('Ctrl 按下 + mousemove → link;keyup → 清', async () => {
        const m = mount()
        // jsdom 没布局:posAtCoords 桩成固定位置
        ;(m.view as unknown as { posAtCoords: () => number }).posAtCoords = () => CALL
        const off = definitionHoverSession(m.view, m.actions)
        m.view.contentDOM.dispatchEvent(new MouseEvent('mousemove', { clientX: 5, clientY: 5, ctrlKey: true, metaKey: true, bubbles: true }))
        expect(await until(() => !!m.view.state.field(definitionLinkField))).toBe(true)
        const l = m.view.state.field(definitionLinkField)!
        expect(l.from).toBe(DOC.indexOf('target(2)'))
        expect(l.preview?.text).toContain('function target')
        expect(m.view.contentDOM.classList.contains('cm-definition-link-active')).toBe(true)
        // hover 卡里有预览
        const hr = await definitionPreviewHoverSource(m.view.state, CALL, 1)
        expect(hr).toBeTruthy()
        expect(hr!.create().querySelector('pre')!.textContent).toContain('function target')
        window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Control' }))
        expect(m.view.state.field(definitionLinkField)).toBeNull()
        expect(m.view.contentDOM.classList.contains('cm-definition-link-active')).toBe(false)
        // multiCursorModifier 不是它的键(只按 Alt,默认 altKey 模式):不触发
        m.view.contentDOM.dispatchEvent(new MouseEvent('mousemove', { clientX: 5, clientY: 5, altKey: true, bubbles: true }))
        await new Promise(r => setTimeout(r, 300))
        expect(m.view.state.field(definitionLinkField)).toBeNull()
        off(); m.done()
    }, SLOW)

    it('没有定义的词不加 link', async () => {
        const m = mount()
        ;(m.view as unknown as { posAtCoords: () => number }).posAtCoords = () => DOC.indexOf('number') + 1
        const off = definitionHoverSession(m.view, m.actions)
        m.view.contentDOM.dispatchEvent(new MouseEvent('mousemove', { clientX: 5, clientY: 5, ctrlKey: true, metaKey: true, bubbles: true }))
        await new Promise(r => setTimeout(r, 1500))
        expect(m.view.state.field(definitionLinkField)).toBeNull()
        off(); m.done()
    }, SLOW)

    it('文档变更清掉 link', () => {
        const m = mount()
        m.view.dispatch(m.view.state.update({ effects: setDefinitionLink.of({ from: 0, to: 3, preview: null }) }))
        expect(m.view.state.field(definitionLinkField)).not.toBeNull()
        m.view.dispatch(m.view.state.update({ changes: { from: 0, insert: 'x' } }))
        expect(m.view.state.field(definitionLinkField)).toBeNull()
        m.done()
    })
})

describe('definitionLinkOpensInPeek', () => {
    it('false(默认):点击直接跳到定义', async () => {
        const m = mount({}, '/t-click-goto.ts')
        expect(clickDefinition(m.actions)(m.view)).toBe(true)
        expect(await until(() => m.view.state.selection.main.from === DOC.indexOf('target'))).toBe(true)
        expect(m.view.dom.querySelector('.cm-peek')).toBeNull()
        m.done()
    }, SLOW)
    it('true:点击开 Peek,不动光标', async () => {
        const m = mount({ definitionLinkOpensInPeek: true }, '/t-click-peek.ts')
        clickDefinition(m.actions)(m.view)
        expect(await until(() => !!document.querySelector('.cm-peek-widget, .cm-peek, [class*="peek"]'))).toBe(true)
        expect(m.view.state.selection.main.head).toBe(CALL)
        m.done()
    }, SLOW)
    it('没有定义:不弹消息(muteMessage)', async () => {
        const m = mount({}, '/t-click-none.ts')
        m.view.dispatch(m.view.state.update({ selection: { anchor: DOC.indexOf('number') + 1 } }))
        clickDefinition(m.actions)(m.view)
        await new Promise(r => setTimeout(r, 1500))
        expect(document.querySelector('.cm-editor-message')).toBeNull()
        m.done()
    }, SLOW)
    it('clickDefinitionHandler facet 能挂上', () => {
        const st = EditorState.create({ extensions: [clickDefinitionHandler.of(() => true)] })
        expect(st.facet(clickDefinitionHandler)).toHaveLength(1)
    })
})
