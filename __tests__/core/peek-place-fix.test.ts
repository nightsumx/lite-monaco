// 第五轮 O 组:peek 面板的位置对齐 Monaco 的 zone widget(实测 /tmp/lc-hunt/r5/O/peek-place.ts):
// - 紧贴目标行(光标所在行)下沿,跟着内容滚动;
// - 高 18 行(ReferenceWidget heightInLines),不超过 max(12, 视口行数 × 0.8) 行;
// - 横向从编辑器左缘(含行号栏)到正文右缘(不盖 minimap / 竖滚动条);
// - 打开时面板下面那一行不在视口里就滚到刚好露出(Monaco revealRange(行, 下一行))。
// 差距:Monaco 的 zone 把后面的行往下推,这里是盖在后面的行上(没有视图层插行)。
import { describe, expect, it } from 'vitest'
import { showPeek, closePeek } from '../../src/lang/tspeek'
import { EditorState } from '../../src/core/model/state'
import { EditorView } from '../../src/core/view/editorview'

const LH = 20

function setup(lines: number, viewportH = 518) {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const doc = Array.from({ length: lines }, (_, i) => `line ${i + 1}`).join('\n')
    const view = new EditorView({ state: EditorState.create({ doc }), parent: host })
    // jsdom 无布局:行高 20、视口 518(对照页 Monaco 的几何)
    ;(view as unknown as { lineBlockAt: (p: number) => unknown }).lineBlockAt = (p: number) => {
        const n = view.state.doc.lineAt(p).number
        return { from: 0, to: 0, top: (n - 1) * LH, bottom: n * LH, height: LH }
    }
    let st = 0
    Object.defineProperty(view.scrollDOM, 'scrollTop', { get: () => st, set: (v: number) => { st = Math.max(0, v) }, configurable: true })
    Object.defineProperty(view.scrollDOM, 'clientHeight', { get: () => viewportH, configurable: true })
    Object.defineProperty(view.dom, 'clientHeight', { get: () => viewportH, configurable: true })
    const at = (line: number) => view.state.doc.line(line).from + 2
    const loc = { file: '/main.ts', line: 1, start: 0, length: 4, local: true, preview: 'line 1', text: doc }
    const done = () => { closePeek(view); view.destroy(); host.remove() }
    return { view, at, loc, done, scroll: (v: number) => { st = v; view.scrollDOM.dispatchEvent(new Event('scroll')) }, scrollTop: () => st }
}

describe('peek 面板位置(Monaco zone widget)', () => {
    it('贴在光标行下沿,高 18 行,不再贴底', () => {
        const { view, at, loc, done } = setup(60)
        view.dispatch(view.state.update({ selection: { anchor: at(5) } }))
        showPeek(view, { title: 'Definitions', locations: [loc] })
        const root = view.dom.querySelector('.cm-peek') as HTMLElement
        expect(root.style.top).toBe(`${5 * LH}px`)
        expect(root.style.height).toBe(`${18 * LH}px`)
        done()
    })

    it('跟着内容滚动', () => {
        const { view, at, loc, done, scroll } = setup(60)
        view.dispatch(view.state.update({ selection: { anchor: at(5) } }))
        showPeek(view, { title: 'Definitions', locations: [loc] })
        scroll(60)
        const root = view.dom.querySelector('.cm-peek') as HTMLElement
        expect(root.style.top).toBe(`${5 * LH - 60}px`)
        done()
    })

    it('面板下一行不在视口 → 滚到刚好露出', () => {
        const { view, at, loc, done, scrollTop } = setup(60)
        view.dispatch(view.state.update({ selection: { anchor: at(22) } }))
        showPeek(view, { title: 'Definitions', locations: [loc] })
        // 第 22 行底 440 + 面板 360 + 下一行 20 = 820,再 + 1 行(第六轮 H:Monaco revealRange 是 VerticalRevealType.Simple,
        // _computeScrollTopToRevealRange 底部多留 1 行,见 peek-r6-fix.test.ts)= 840,视口 518 → scrollTop 322
        expect(scrollTop()).toBe(840 - 518)
        const root = view.dom.querySelector('.cm-peek') as HTMLElement
        expect(root.style.top).toBe(`${440 - 322}px`)
        done()
    })

    it('矮编辑器:高度不超过 max(12, 视口行数 × 0.8) 行', () => {
        const { view, at, loc, done } = setup(60, 200)
        view.dispatch(view.state.update({ selection: { anchor: at(1) } }))
        showPeek(view, { title: 'Definitions', locations: [loc] })
        const root = view.dom.querySelector('.cm-peek') as HTMLElement
        expect(root.style.height).toBe(`${12 * LH}px`) // 200/20*0.8 = 8 < 12 → 12 行
        done()
    })

    it('文档在面板上方改了行数,面板跟着原来那行走', () => {
        const { view, at, loc, done } = setup(60)
        view.dispatch(view.state.update({ selection: { anchor: at(5) } }))
        showPeek(view, { title: 'Definitions', locations: [loc] })
        view.dispatch(view.state.update({ changes: { from: 0, insert: 'x\ny\n' } }))
        const root = view.dom.querySelector('.cm-peek') as HTMLElement
        expect(root.style.top).toBe(`${7 * LH}px`)
        done()
    })
})
