// 第六轮 H 组:peek 打开时的滚动照 Monaco ZoneWidget._showImpl → revealRange(行 L .. 行 L+1 第 1 列, Simple)。
// viewLines._computeScrollTopToRevealRange:盒 = [行 L 顶 - context 行, 行 L+1 顶(已含 zone 高)+ 1 行 + (context-1) 行 + 1 行(Simple)],
// context = sticky scroll 开着时 5 行;盒比视口高 → 滚到盒顶,否则最小滚动。末行用 revealLineNearTop。
// 实测 /tmp/lc-hunt/r6/H/peek-place.ts 22(行高 20、视口 518、zone 360):Monaco scrollTop 320(第 22 行顶 420 - 100),
// 修前 lite-monaco 302(只露出面板下一行,没留 sticky 余量)。
import { describe, expect, it } from 'vitest'
import { showPeek, closePeek } from '../../src/lang/tspeek'
import { EditorState } from '../../src/core/model/state'
import { EditorView } from '../../src/core/view/editorview'

const LH = 20

function setup(lines: number, sticky: number, viewportH = 518) {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const doc = Array.from({ length: lines }, (_, i) => `line ${i + 1}`).join('\n')
    const view = new EditorView({ state: EditorState.create({ doc }), parent: host })
    view.revealSurroundingLines = sticky
    ;(view as unknown as { lineBlockAt: (p: number) => unknown }).lineBlockAt = (p: number) => {
        const n = view.state.doc.lineAt(p).number
        return { from: 0, to: 0, top: (n - 1) * LH, bottom: n * LH, height: LH }
    }
    let st = 0
    Object.defineProperty(view.scrollDOM, 'scrollTop', { get: () => st, set: (v: number) => { st = Math.max(0, v) }, configurable: true })
    Object.defineProperty(view.scrollDOM, 'clientHeight', { get: () => viewportH, configurable: true })
    const loc = { file: '/main.ts', line: 1, start: 0, length: 4, local: true, preview: 'line 1', text: doc }
    const open = (line: number) => {
        view.dispatch(view.state.update({ selection: { anchor: view.state.doc.line(line).from + 2 } }))
        showPeek(view, { title: 'Definitions', locations: [loc] })
        return st
    }
    return { open, done: () => { closePeek(view); view.destroy(); host.remove() } }
}

describe('peek 打开时的 reveal(Monaco ZoneWidget.revealRange)', () => {
    it('sticky scroll 开着:第 22 行 → scrollTop 320(行顶上留 5 行)', () => {
        const s = setup(60, 5)
        expect(s.open(22)).toBe(320)
        s.done()
    })
    it('第 5 行:盒比视口高 → 盒顶 < 0 → 0', () => {
        const s = setup(60, 5)
        expect(s.open(5)).toBe(0)
        s.done()
    })
    it('没开 sticky:最小滚动露出 [行, 下一行 + 1 行]:第 22 行 → 440 + 360 + 20 + 20 - 518 = 322', () => {
        const s = setup(60, 0)
        expect(s.open(22)).toBe(322)
        s.done()
    })
})
