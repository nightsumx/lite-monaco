// 折叠键位对齐 Monaco 0.52 macOS(node_modules/monaco-editor/.../folding/browser/folding.js):
// ⌘⌥[ 折叠 / ⌘⌥] 展开;⌘K ⌘0 全折 / ⌘K ⌘J 全展 / ⌘K ⌘L 切换 / ⌘K ⌘[ ⌘K ⌘] 递归 / ⌘K ⌘1..7 按级。
// ⌘⇧[ ⌘⇧] 在 Mac 上不是折叠键(宿主常拿它切标签页),编辑器不能认领。
import { describe, expect, it } from 'vitest'
import { setMacPlatform } from './f5-replay'

setMacPlatform()
const { liteMonaco } = await import('../../src/litemonaco')
const core = await import('../../src/core/index')

const hl = {
    codeToTokens: (code: string) => ({ tokens: code.split('\n').map(l => [{ content: l, offset: 0 }]) }),
    getLastGrammarState: () => ({ getScopes: () => undefined }),
    getLoadedLanguages: () => ['text'],
    getTheme: () => ({ bg: '#1e1e1e', fg: '#d4d4d4', type: 'dark' as const }),
}
const DOC = 'function f() {\n    if (a) {\n        b()\n    }\n}\nfunction g() {\n    c()\n}\n'

function make(pos: number) {
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    const view = liteMonaco({ parent, highlighter: hl as never, doc: DOC, lang: 'text', theme: 'dark-plus', features: { minimap: false, stickyScroll: false, codeActions: false, signatureHelp: false } })
    view.dispatch(view.state.update({ selection: core.EditorSelection.cursor(pos) }))
    view.focus()
    return view
}
const CODES: Record<string, string> = { '[': 'BracketLeft', ']': 'BracketRight', '{': 'BracketLeft', '}': 'BracketRight', k: 'KeyK', j: 'KeyJ', l: 'KeyL', '0': 'Digit0', '2': 'Digit2' }
function press(view: { contentDOM: HTMLElement }, k: string, mods: KeyboardEventInit) {
    const e = new KeyboardEvent('keydown', { key: k, code: CODES[k], bubbles: true, cancelable: true, ...mods })
    view.contentDOM.dispatchEvent(e)
    return e
}
const folded = (view: ReturnType<typeof make>) => view.state.field(core.foldField).size
describe('折叠键位(Monaco macOS)', () => {
    it('⌘⌥[ 折叠光标所在块,⌘⌥] 展开', () => {
        const v = make(DOC.indexOf('b()'))
        press(v, '[', { metaKey: true, altKey: true })
        expect(folded(v)).toBe(1)
        press(v, '[', { metaKey: true, altKey: true })
        expect(folded(v)).toBe(2) // 再按一次折外层(Monaco fold 不是 toggle)
        press(v, ']', { metaKey: true, altKey: true })
        expect(folded(v)).toBe(1)
    })
    it('⌘⇧[ / ⌘⇧] 不折叠,事件冒泡到宿主', () => {
        const v = make(DOC.indexOf('b()'))
        const seen: string[] = []
        const onKey = (e: KeyboardEvent) => seen.push(e.key)
        window.addEventListener('keydown', onKey)
        press(v, '{', { metaKey: true, shiftKey: true })
        press(v, '}', { metaKey: true, shiftKey: true })
        window.removeEventListener('keydown', onKey)
        expect(folded(v)).toBe(0)
        expect(seen).toEqual(['{', '}'])
    })
    it('⌘K ⌘0 全折,⌘K ⌘J 全展', () => {
        const v = make(0)
        press(v, 'k', { metaKey: true }); press(v, '0', { metaKey: true })
        expect(folded(v)).toBe(3)
        press(v, 'k', { metaKey: true }); press(v, 'j', { metaKey: true })
        expect(folded(v)).toBe(0)
    })
    it('⌘K ⌘L 切换折叠', () => {
        const v = make(DOC.indexOf('c()'))
        press(v, 'k', { metaKey: true }); press(v, 'l', { metaKey: true })
        expect(folded(v)).toBe(1)
        press(v, 'k', { metaKey: true }); press(v, 'l', { metaKey: true })
        expect(folded(v)).toBe(0)
    })
    it('⌘K ⌘2 只折第 2 级', () => {
        const v = make(0)
        press(v, 'k', { metaKey: true }); press(v, '2', { metaKey: true })
        expect(folded(v)).toBe(1)
    })
})

describe('选区进折叠隐藏区时展开(Monaco revealCursor)', () => {
    it('程序把光标设进折叠体 → 那一块展开;设在块首行不展开', async () => {
        const v = make(DOC.indexOf('b()'))
        press(v, '[', { metaKey: true, altKey: true })
        expect(folded(v)).toBe(1)
        v.dispatch(v.state.update({ selection: core.EditorSelection.cursor(DOC.indexOf('{') ) }))
        await Promise.resolve()
        expect(folded(v)).toBe(1)
        v.dispatch(v.state.update({ selection: core.EditorSelection.cursor(DOC.indexOf('b()')) }))
        await Promise.resolve()
        expect(folded(v)).toBe(0)
    })
})
