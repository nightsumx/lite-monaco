// 第三轮 M 组:sticky 行点击对齐 Monaco StickyScrollController。
// 浏览器实测(/tmp/lc-hunt/r3/fix-M/skmo.ts、skmo2.ts,Monaco 0.52):点 sticky 第 k 行 →
//   列 = 点中 token span 的起点(点在文本外 → 第 1 列);滚动 = revealPosition Simple,行顶落在视口第 5 行(maxLineCount)处。
// 修前:列固定为首个非空白字符、scrollIntoView 最小滚动 → 光标行被 sticky 头盖住。
import { describe, it, expect } from 'vitest'
import { makeScrolled } from './input-harness'
import { stickyScrollOverlay, stickyRevealScrollTop, stickyClickOffset } from '../../src/core/feature/stickyscroll'

const LH = 20
// 前 200 行平铺语句;第 201 行 class 头,第 202 行方法头,里面一长串语句 → 滚到深处时 sticky 显示 201、202
const PRE = Array.from({ length: 200 }, (_, i) => `y${i}()`)
const DOC = [...PRE, 'class A {', '    run(): void {', ...Array.from({ length: 296 }, (_, i) => `        x${i}()`), '    }', '}'].join('\n')
const N = 500

describe('sticky 点击滚动(Monaco revealPosition Simple)', () => {
    it('stickyRevealScrollTop:行在视口上方 → 行顶留 5 行;已在余量内不动;靠底 → 底部留 5 行', () => {
        // 视口 518 高:context = min(12.95, 5) = 5
        expect(stickyRevealScrollTop(4960, LH, 4947, 518)).toBe(4860) // Monaco 实测 st 4947 点 sticky 第 1 行(249 行顶 4960)→ 4860
        expect(stickyRevealScrollTop(4980, LH, 4947, 518)).toBe(4880) // 第 2 行(250)→ 4880
        expect(stickyRevealScrollTop(6000, LH, 5800, 518)).toBe(5800) // 已在 [st+100, st+518-120] 里
        expect(stickyRevealScrollTop(6400, LH, 5800, 518)).toBe(6400 + 20 + 100 - 518)
        // 矮视口:context = 视口行数/2
        expect(stickyRevealScrollTop(1000, LH, 990, 100)).toBe(1000 - 50)
    })

    it('点 sticky 第 2 行:光标进该行、滚到 sticky 区下面(行顶 = 视口第 5 行)', () => {
        const view = makeScrolled(DOC, { clientHeight: 518, scrollTop: 7000, lineHeight: LH, scrollHeight: N * LH })
        const st = () => view.scrollDOM.scrollTop
        view.scrollDOM.getBoundingClientRect = () => ({ top: 0, left: 0, right: 600, bottom: 518, width: 600, height: 518, x: 0, y: 0, toJSON() {} }) as DOMRect
        view.contentDOM.getBoundingClientRect = () => ({ top: -st(), left: 0, right: 600, bottom: 518, width: 600, height: 518, x: 0, y: -st(), toJSON() {} }) as DOMRect
        const off = stickyScrollOverlay(view)
        view.scrollDOM.dispatchEvent(new Event('scroll'))
        const rows = [...view.dom.querySelectorAll<HTMLElement>('.cm-sticky-line')]
        expect(rows.map(r => r.dataset.line)).toEqual(['201', '202'])
        // 点在代码列的容器上(不是 token span)→ Monaco 给第 1 列
        rows[1].querySelector('.cm-sticky-code')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        const head = view.state.selection.main.head
        expect(head).toBe(view.state.doc.line(202).from) // 修前:首个非空白(第 5 列)
        expect(st()).toBe(view.lineBlockAt(head).top - 5 * LH) // 修前:scrollIntoView 最小滚动 → 顶对齐(被 sticky 盖住)
        off()
        view.destroy()
    })
})

describe('sticky 点击列(Monaco getEditorPositionFromNode)', () => {
    const mk = (parts: [string, string][]) => {
        const inner = document.createElement('div')
        for (const [t, c] of parts) { const s = document.createElement('span'); s.textContent = t; s.style.color = c; inner.appendChild(s) }
        return inner
    }
    it('点中 token span → 该段起点;同色相邻 span 合成一段;点在文本外 → 0', () => {
        const inner = mk([['        ', '#d4d4d4'], ['batch', '#d4d4d4'], ['(', '#ffd700'], ['()', '#da70d6'], [' ', '#d4d4d4'], ['=>', '#d4d4d4'], [' ', '#d4d4d4'], ['{', '#da70d6']])
        const s = [...inner.children]
        expect(stickyClickOffset(s[1], inner)).toBe(0) // 前导空白与 batch 同色 → 一段,Monaco 第 1 列
        expect(stickyClickOffset(s[2], inner)).toBe(13)
        expect(stickyClickOffset(s[3], inner)).toBe(14)
        expect(stickyClickOffset(s[5], inner)).toBe(16) // ' ' 和 '=>' 同色并段
        expect(stickyClickOffset(s[7], inner)).toBe(20)
        expect(stickyClickOffset(inner, inner)).toBe(0)
        expect(stickyClickOffset(inner.parentElement, inner)).toBe(0)
    })
})
