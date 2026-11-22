// 第六轮 H 组(第 4 条:补全打开时 Monaco 先滚 22px):查下来不是补全的规则,是 Monaco 光标 reveal 的余量。
// viewLines._computeScrollTopToRevealRange:非鼠标来源上下各留 context = min(视口行数/2, max(cursorSurroundingLines=0,
// stickyScroll.enabled ? maxLineCount(5) : 0)) 行,Simple 再在底部多留 1 行;盒在视口内不动,否则最小滚动。
// Monaco 0.52 stickyScroll 默认开 → 打字 / 方向键 / End 都留 5 行。实测(/tmp/lc-hunt/r6/H/type-reveal.ts、arrow-reveal.ts,
// 20px 行高、视口 518):第 22 行打字 M 0→22(第 21 行 0→2),第 20 行 ↓ M 0→2,第 26 行 ↑(scrollTop 400)M → 380;修前 L 全不动。
// 补全列表因此在第 22 行打开时比 Monaco 低 22px(/tmp/lc-hunt/r6/H/sg-scroll.ts)。
import { describe, expect, it } from 'vitest'
import { EditorSelection } from '../../src/core/model/selection'
import { stickyScrollOverlay } from '../../src/core/feature/stickyscroll'
import { makeScrolled } from './input-harness'

const doc = Array.from({ length: 120 }, (_, i) => `const v${i} = ${i}`).join('\n')
const LH = 20
const at = (view: ReturnType<typeof makeScrolled>, line: number) => view.state.doc.line(line).from

describe('光标 reveal 留 sticky scroll 的余量(Monaco)', () => {
    it('开了 sticky scroll:第 22 行(底 440)reveal → scrollTop 22', () => {
        const view = makeScrolled(doc, { clientHeight: 518, scrollTop: 0, lineHeight: LH })
        const off = stickyScrollOverlay(view)
        view.dispatch(view.state.update({ selection: EditorSelection.cursor(at(view, 22)), scrollIntoView: true }))
        expect(view.scrollDOM.scrollTop).toBe(22)
        off()
        view.destroy()
    })
    it('向上:第 25 行(顶 480)、scrollTop 400 → 380(上方留 5 行)', () => {
        const view = makeScrolled(doc, { clientHeight: 518, scrollTop: 400, lineHeight: LH })
        const off = stickyScrollOverlay(view)
        view.dispatch(view.state.update({ selection: EditorSelection.cursor(at(view, 25)), scrollIntoView: true }))
        expect(view.scrollDOM.scrollTop).toBe(380)
        off()
        view.destroy()
    })
    it('盒在视口内:不动', () => {
        const view = makeScrolled(doc, { clientHeight: 518, scrollTop: 0, lineHeight: LH })
        const off = stickyScrollOverlay(view)
        view.dispatch(view.state.update({ selection: EditorSelection.cursor(at(view, 20)), scrollIntoView: true }))
        expect(view.scrollDOM.scrollTop).toBe(0)
        off()
        view.destroy()
    })
    it('没开 sticky scroll(或已卸载):照旧最小滚动,不留余量', () => {
        const view = makeScrolled(doc, { clientHeight: 518, scrollTop: 0, lineHeight: LH })
        const off = stickyScrollOverlay(view)
        off()
        view.dispatch(view.state.update({ selection: EditorSelection.cursor(at(view, 22)), scrollIntoView: true }))
        expect(view.scrollDOM.scrollTop).toBe(0)
        view.destroy()
    })
})
