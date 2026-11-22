// H2 测试公用:用真 liteMonaco() 装配(带 H2 的 install*),假高亮器,jsdom 里几何用桩。
import { setMacPlatform } from './f5-replay'

setMacPlatform()
const { liteMonaco } = await import('../../src/litemonaco')
const { EditorView } = await import('../../src/core/view/editorview')

// V 组的 EditorView 重构进行中时,缺的视图选项入口补个空实现(方法齐了这里就是空操作,不影响 H2 的测试)
for (const m of ['applyViewOptions', 'applyZoom']) {
    const proto = EditorView.prototype as unknown as Record<string, unknown>
    if (typeof proto[m] !== 'function') proto[m] = function () {}
}

const hl = {
    codeToTokens: (code: string) => ({ tokens: code.split('\n').map(l => [{ content: l, offset: 0 }]) }),
    getLastGrammarState: () => ({ getScopes: () => undefined }),
    getLoadedLanguages: () => ['typescript', 'text'],
    getTheme: () => ({ bg: '#1e1e1e', fg: '#d4d4d4', type: 'dark' as const }),
}

export function rect(left: number, top: number, width: number, height: number) {
    return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() {} } as DOMRect
}

// 返回值当 any 用:H2 的方法是装在实例上的,类型归 H1 的 LiteMonacoEditor,这里不依赖它
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Ed = any

const mounted: { view: Ed, parent: HTMLElement }[] = []

export function mountEditor(doc: string, extra: Record<string, unknown> = {}): Ed {
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    const view = liteMonaco({
        parent, highlighter: hl as never, doc, lang: 'text',
        features: { minimap: false, autocomplete: false, hover: false, stickyScroll: false },
        ...extra,
    } as never) as Ed
    mounted.push({ view, parent })
    return view
}

export function cleanup(): void {
    for (const { view, parent } of mounted.splice(0)) {
        try { view.destroy() } catch { /* 已销毁 */ }
        parent.remove()
    }
    document.body.replaceChildren()
}

export function key(target: EventTarget, k: string, init: KeyboardEventInit = {}): KeyboardEvent {
    const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })
    target.dispatchEvent(ev)
    return ev
}

/** 把文档偏移 → 假视口坐标:第 n 行在 top = 100 + (n-1)*20,列 c 在 left = 50 + c*8 */
export function stubGeometry(view: Ed): void {
    view.dom.getBoundingClientRect = () => rect(0, 100, 800, 400)
    view.caretCoords = (pos: number) => {
        const line = view.state.doc.lineAt(pos)
        return { left: 50 + (pos - line.from) * 8, top: 100 + (line.number - 1) * 20, height: 20, bottom: 120 + (line.number - 1) * 20 }
    }
}
