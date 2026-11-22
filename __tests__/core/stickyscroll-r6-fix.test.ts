// 第六轮 V 组:sticky 的折叠作用域
// 1. 每次打字都整篇 collectFoldableLines(2 万行打字剖面占 56%,/tmp/lc-hunt/r6/V/caret.ts PROF=type)。
//    Monaco StickyLineCandidateProvider:改文档只排一次 50ms 后的更新(RunOnceScheduler),StickyModelProvider 再
//    Delayer(300) 防抖,期间沿用旧模型。这里同样防抖重算(STICKY_FOLD_DELAY),期间把旧作用域按改动映射过去
//    (行内打字行号不变,原样沿用)。
// 2. 手建折叠块(Create Folding Range from Selection)不进 sticky:Monaco 的 sticky 模型自己跑 IndentRangeProvider /
//    SyntaxRangeProvider,不读 FoldingModel 里的 userDefined 块(对照页实测 /tmp/lc-hunt/r6/V/manualsticky.ts:
//    平铺注释文档里手建 10–59 行的块,滚到第 30 行,Monaco 没有 sticky)。旧代码读手建块,缓存却不看手建表,
//    建 / 删之后要等下一次编辑才变。
import { describe, it, expect, vi, afterEach } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { EditorView } from '../../src/core/view/editorview'
import { foldScopes, stickyScrollOverlay } from '../../src/core/feature/stickyscroll'
import { foldField, manualFoldField, setManualFolds } from '../../src/core/edit/fold'

const calls = vi.hoisted(() => ({ n: 0 }))
vi.mock('../../src/core/edit/fold', async importOriginal => {
    const m = await importOriginal<typeof import('../../src/core/edit/fold')>()
    const wrap = <F extends (...a: never[]) => unknown>(f: F) => ((...a: Parameters<F>) => { calls.n++; return f(...a) }) as F
    return { ...m, collectFoldableLines: wrap(m.collectFoldableLines), providerFoldLines: m.providerFoldLines ? wrap(m.providerFoldLines) : undefined }
})

const block = (k: number) => [`function f${k}() {`, ...Array.from({ length: 8 }, (_, i) => `    const a${i} = ${i}`), '}'].join('\n')
const SRC = Array.from({ length: 200 }, (_, k) => block(k)).join('\n')

const FOLD = [foldField, manualFoldField]
function mount(doc: string, stLines: number) {
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    const view = new EditorView({ state: EditorState.create({ doc, extensions: FOLD }), parent })
    const lh = view.oracle.lineHeight || 20
    const st = lh * stLines
    view.scrollDOM.getBoundingClientRect = () => ({ top: 0, left: 0, right: 600, bottom: 300, width: 600, height: 300, x: 0, y: 0, toJSON() {} }) as DOMRect
    view.contentDOM.getBoundingClientRect = () => ({ top: -st, left: 0, right: 600, bottom: 300, width: 600, height: 300, x: 0, y: -st, toJSON() {} }) as DOMRect
    const off = stickyScrollOverlay(view)
    view.scrollDOM.dispatchEvent(new Event('scroll'))
    const sticky = () => [...view.dom.querySelectorAll<HTMLElement>('.cm-sticky-line')].map(r => r.querySelector('.cm-sticky-ln')!.textContent)
    const done = () => { off(); view.destroy(); parent.remove() }
    return { view, sticky, done }
}

afterEach(() => { vi.useRealTimers() })

describe('sticky 折叠作用域:打字不整篇重算', () => {
    it('打字期间不跑 collectFoldableLines;停手 STICKY_FOLD_DELAY 后重算一次;回车换行时旧作用域跟着下移', () => {
        vi.useFakeTimers()
        // 滚到第 13 行(f1 的体内):sticky = f1 的头(第 11 行)
        const { view, sticky, done } = mount(SRC, 12.5)
        expect(sticky()).toEqual(['11'])
        calls.n = 0
        const at = view.state.doc.line(3).from + 4
        for (let i = 0; i < 20; i++)
            view.dispatch(view.state.update({ changes: { from: at + i, insert: 'x' }, userEvent: 'input.type' }))
        expect(calls.n).toBe(0)
        expect(sticky()).toEqual(['11'])
        // 回车:f1 往下挪一行,不等重算 sticky 就指对行
        view.dispatch(view.state.update({ changes: { from: at, insert: '\n' }, userEvent: 'input.type' }))
        expect(calls.n).toBe(0)
        expect(sticky()).toEqual(['12'])
        vi.advanceTimersByTime(400)
        expect(calls.n).toBe(1)
        expect(sticky()).toEqual(['12'])
        done()
    })
})

describe('sticky 折叠作用域:手建块不算(Monaco)', () => {
    const FLAT = Array.from({ length: 100 }, (_, i) => `note ${i}`).join('\n')
    it('平铺文档里手建 10–59 行的块:foldScopes 里没有它', () => {
        const s0 = EditorState.create({ doc: FLAT, extensions: FOLD })
        const d = s0.doc
        const s1 = s0.update({ effects: setManualFolds.of([{ line: 10, from: d.line(10).from, to: d.line(59).to }]) }).apply()
        expect(foldScopes(s1)).toEqual([])
    })

    it('手建块和缩进块交叉:缩进块照常上 sticky(sticky 自己跑 IndentRangeProvider)', () => {
        const { view, sticky, done } = mount(SRC, 12.5)
        expect(sticky()).toEqual(['11'])
        const d = view.state.doc
        // 手建 5–15 行,和 f1(11–20)交叉:折叠模型里 f1 被挤掉,sticky 不受影响
        view.dispatch(view.state.update({ effects: setManualFolds.of([{ line: 5, from: d.line(5).from, to: d.line(15).to }]) }))
        expect(sticky()).toEqual(['11'])
        done()
        // 新文档对象(不吃缓存)上同样:作用域和没有手建块时一样
        const s0 = EditorState.create({ doc: SRC, extensions: FOLD })
        const s1 = s0.update({ effects: setManualFolds.of([{ line: 5, from: s0.doc.line(5).from, to: s0.doc.line(15).to }]) }).apply()
        expect(foldScopes(s1)).toEqual(foldScopes(EditorState.create({ doc: SRC })))
    })
})
