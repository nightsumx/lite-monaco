// Sticky scroll(F6 P1-7):作用域来自折叠范围,选行和顶推照 Monaco findScrollWidgetState。
// 浏览器对 Monaco 逐 scrollTop 比对见 /tmp/lc-hunt/f6/sticky.ts。
import { describe, it, expect } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { EditorView } from '../../src/core/view/editorview'
import { foldScopes, scopeTree, stickyCandidates, stickyLayout, stickyScrollOverlay } from '../../src/core/feature/stickyscroll'

const SRC = [
    'class A {',            // 1
    '    x = 1',            // 2
    '',                     // 3
    '    run(): void {',    // 4
    '        if (a) {',     // 5
    '            b()',      // 6
    '        }',            // 7
    '        c()',          // 8
    '    }',                // 9
    '}',                    // 10
    'type U =',             // 11
    '    | 1',              // 12
    '    | 2',              // 13
    '',                     // 14
    'const z = 1',          // 15
].join('\n')

const LH = 20
const top = (n: number) => (n - 1) * LH
const bottom = (n: number) => n * LH
// 视口首行 = scrollTop 所在行
const layoutAt = (st: number, state = EditorState.create({ doc: SRC })) => {
    const roots = foldScopes(state)
    const first = Math.floor(st / LH) + 1
    return stickyLayout(stickyCandidates(roots, first, first + 20), st, LH, top, bottom)
}

describe('sticky 作用域', () => {
    it('作用域 = 折叠范围,止于收尾 `}` 前;非括号块吞掉后随空行', () => {
        const roots = foldScopes(EditorState.create({ doc: SRC }))
        const flat: [number, number][] = []
        const walk = (ns: typeof roots) => ns.forEach(n => { flat.push([n.start, n.end]); walk(n.children) })
        walk(roots)
        // class 1..9、run 4..8、if 5..6、type 11..14(含空行 14,对齐 VS Code 缩进范围)
        expect(flat).toEqual([[1, 9], [4, 8], [5, 6], [11, 14]])
    })

    it('scopeTree 按包含关系嵌套', () => {
        const t = scopeTree([{ start: 4, end: 8 }, { start: 1, end: 9 }, { start: 11, end: 12 }])
        expect(t.map(n => [n.start, n.children.map(c => c.start)])).toEqual([[1, [4]], [11, []]])
    })

    it('首行完全可见时不 sticky;滚过半行就钉住', () => {
        expect(layoutAt(0).lines).toEqual([])
        expect(layoutAt(5).lines).toEqual([1])
    })

    it('逐层钉住祖先作用域头,不钉普通语句行', () => {
        // 滚过 2.5 行:if 头已滚进第 3 格,体末行(6)还在它下面 → 三层都钉,不偏移
        expect(layoutAt(50)).toEqual({ lines: [1, 4, 5], lastOffset: 0 })
        // 视口首行 = 5:if 体末行顶已高过第 3 格 → 第 3 格被顶上去整整一行,藏在第 2 格下(Monaco 同)
        expect(layoutAt(top(5))).toEqual({ lines: [1, 4, 5], lastOffset: -20 })
        // 视口首行 = 6(b()):if 体末行底高过第 3 格顶 → 不再候选
        expect(layoutAt(top(6)).lines).toEqual([1, 4])
        // 视口首行 = 8(c()):if 已结束 → 只剩 class/run
        expect(layoutAt(top(8)).lines).toEqual([1, 4])
    })

    it('作用域快结束时最后一行被顶上去(负偏移),整块高度跟着缩', () => {
        // run 的体末行 8 顶到第 2 格:st = top(8) - 20 + 7 → 体末行底 = 20+20-7
        const r = layoutAt(top(8) - LH + 7)
        expect(r.lines).toEqual([1, 4])
        expect(r.lastOffset).toBe(-7)
    })
})

describe('sticky overlay', () => {
    it('按 scrollTop 画作用域行:带行号、保留缩进,点击跳到作用域头', () => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const view = new EditorView({ state: EditorState.create({ doc: SRC }), parent })
        const lh = view.oracle.lineHeight || LH
        // jsdom 无布局:让 contentDOM 相对 scrollDOM 上移 = 已滚过 2.5 行(三层都钉)
        const st = lh * 2.5
        view.scrollDOM.getBoundingClientRect = () => ({ top: 0, left: 0, right: 600, bottom: 300, width: 600, height: 300, x: 0, y: 0, toJSON() {} }) as DOMRect
        view.contentDOM.getBoundingClientRect = () => ({ top: -st, left: 0, right: 600, bottom: 300, width: 600, height: 300, x: 0, y: -st, toJSON() {} }) as DOMRect
        const off = stickyScrollOverlay(view)
        view.scrollDOM.dispatchEvent(new Event('scroll'))
        const rows = [...view.dom.querySelectorAll<HTMLElement>('.cm-sticky-line')]
        expect(rows.map(r => r.querySelector('.cm-sticky-ln')!.textContent)).toEqual(['1', '4', '5'])
        expect(rows[2].style.top).toBe(`${2 * lh}px`)
        expect(rows[1].querySelector('.cm-sticky-code')!.textContent).toBe('    run(): void {')
        rows[1].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        expect(view.state.doc.lineAt(view.state.selection.main.head).number).toBe(4)
        off()
        expect(view.dom.querySelector('.cm-sticky-scroll')).toBeNull()
        view.destroy()
        parent.remove()
    })
})
