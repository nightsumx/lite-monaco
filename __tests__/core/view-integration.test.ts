import { describe, expect, it } from 'vitest'
import { EditorView } from '../../src/core/view/editorview'
import { EditorState } from '../../src/core/model/state'
import { defaultKeymap, keymapHandler } from '../../src/core/edit/keymap'
import { shikiHighlightCM7 } from '../../src/core/view/shiki'
import type { ScopedShiki } from '../../src/core/view/tokens'

// 阶段4 出口端到端(jsdom):内核 + shiki decorationProviders + keymap 三者接好后,
// state↔DOM 双向投影真的带高亮、键真的驱动命令。真浏览器输入/选区几何归 aipeek(5199),
// 这里钉「装饰随 doc 重算进 DOM」「键位分发命中命令改 state」这两条确定性契约。

// 假 highlighter:把每个 token 行按空白切词,给非空白词标 color。够喂 sharedTokens 的最小契约。
// sharedTokens 调 hl.codeToTokens(line, {grammarState}) 逐行,返回 {tokens:[{content,offset,color}], ...}。
function fakeShiki(): ScopedShiki {
    const isWs = (c: string) => c === ' ' || c === '\t' || c === '\n'
    return {
        codeToTokens(code: string) {
            const tokens: { content: string, offset: number, color?: string }[] = []
            let start = -1
            const flush = (end: number) => {
                if (start >= 0) tokens.push({ content: code.slice(start, end), offset: start, color: '#ff0000' })
                start = -1
            }
            for (let i = 0; i < code.length; i++) {
                if (isWs(code[i])) flush(i)
                else if (start < 0) start = i
            }
            flush(code.length)
            return { tokens: [tokens] }
        },
        getLastGrammarState: () => ({ getScopes: () => undefined }),
        getLoadedLanguages: () => ['ts'],
    } as unknown as ScopedShiki
}

function mount(doc: string) {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const view = new EditorView({
        state: EditorState.create({ doc }),
        parent: host,
        decorationProviders: [shikiHighlightCM7(fakeShiki(), { lang: 'ts', theme: 't' })],
    })
    return view
}

function coloredSpans(view: EditorView) {
    return Array.from(view.contentDOM.querySelectorAll('span'))
        .filter(s => (s.getAttribute('style') || '').includes('color:'))
        .map(s => s.textContent)
}

describe('视图集成 —— shiki 装饰投影', () => {
    it('挂载即带内联色 span', () => {
        const view = mount('const x = 1')
        const spans = coloredSpans(view)
        expect(spans).toContain('const')
        expect(spans).toContain('x')
        expect(spans).toContain('1')
        const colored = Array.from(view.contentDOM.querySelectorAll('span'))
            .find(s => s.textContent === 'const')
        expect(colored?.style.color).toBe('rgb(255, 0, 0)')
    })

    it('编辑后装饰随 doc 重算', () => {
        const view = mount('foo')
        view.dispatch(view.state.update({ changes: { from: 3, insert: ' bar' } }))
        const spans = coloredSpans(view)
        expect(spans).toContain('foo')
        expect(spans).toContain('bar')
    })

    it('乱序 token 不炸 RangeSet', () => {
        const hl: ScopedShiki = {
            codeToTokens: () => ({ tokens: [[
                { content: 'b', offset: 2, color: '#fff' },
                { content: 'a', offset: 0, color: '#000' },
            ]] }),
            getLastGrammarState: () => ({ getScopes: () => undefined }),
            getLoadedLanguages: () => ['ts'],
        }
        const host = document.createElement('div')
        document.body.appendChild(host)
        expect(() => new EditorView({
            state: EditorState.create({ doc: 'ab' }),
            parent: host,
            decorationProviders: [shikiHighlightCM7(hl, { lang: 'ts', theme: 't' })],
        })).not.toThrow()
        host.remove()
    })
})

describe('视图集成 —— keymap 驱动命令', () => {
    const run = keymapHandler(defaultKeymap)
    function key(k: string, mod: Record<string, boolean> = {}) {
        return { key: k, ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, ...mod, preventDefault() {} } as unknown as KeyboardEvent
    }

    it('ArrowRight 经 keymap 移动 view 的 state', () => {
        const view = mount('abc')
        view.dispatch(view.state.update({ selection: { anchor: 0 } }))
        run(key('ArrowRight'), view)
        expect(view.state.selection.main.head).toBe(1)
    })

    it('Backspace 经 keymap 删字符', () => {
        const view = mount('abc')
        view.dispatch(view.state.update({ selection: { anchor: 2 } }))
        run(key('Backspace'), view)
        expect(view.state.doc.toString()).toBe('ac')
    })

    // 组合键端到端(真 keydown 派到 contentDOM):验 editorview 的 preventDefault 兜底真的接了。
    function press(view: EditorView, k: string, mod: KeyboardEventInit = {}) {
        const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...mod })
        view.contentDOM.dispatchEvent(e)
        return e
    }

    it('Shift+Enter 经 view 切段落(不落原生 <br>),且 preventDefault', () => {
        const view = mount('abc')
        view.dispatch(view.state.update({ selection: { anchor: 2 } }))
        const e = press(view, 'Enter', { shiftKey: true })
        expect(view.state.doc.toString()).toBe('ab\nc')
        expect(e.defaultPrevented).toBe(true)
    })

    it('Cmd+b(未绑定命令组合)→ view 拦原生,不 mutate DOM', () => {
        const view = mount('abc')
        const e = press(view, 'b', { metaKey: true })
        expect(e.defaultPrevented).toBe(true) // 兜底:阻断原生加粗
        expect(view.state.doc.toString()).toBe('abc') // 文档未变
    })

    it('普通字符键不被兜底拦(留给原生 contenteditable 落字)', () => {
        const view = mount('abc')
        const e = press(view, 'x') // 无修饰
        expect(e.defaultPrevented).toBe(false)
    })
})
