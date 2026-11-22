// 第五轮 R 组:不可见字符 / #hex 色块 / 行尾空白三个装饰提供者,修前每个新 state 都整篇扫一遍
// (decorations facet 每个新 state 重新求值,只动选区的事务也一样):2 万行文档里扩选一次,三家合计十几 ms。
// 修后:有 view 只扫视口里的整行,文档和视口都没变就原样返回上次的集合(lexscan.ts)。
// 浏览器实测(/tmp/lc-hunt/r5/R/perf2.ts,2 万行,关对照页同步滚动):扩选 15.07 → 见最终报告。
import { describe, expect, it } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'
import { EditorView, decorations } from '../../src/core/view/editorview'
import { specialCharDecorations } from '../../src/core/feature/specialchar'
import { hexColorDecorations } from '../../src/core/feature/hexcolor'
import { trailingWhitespaceDecorations } from '../../src/core/feature/whitespace'
import type { DecorationSet } from '../../src/core/model/decoration'

const PROVIDERS = { specialCharDecorations, hexColorDecorations, trailingWhitespaceDecorations }
// 每行都有三种命中:控制字符 \u0001(不可见字符的框超过 1000 个就不画,控制字符照画)、#fff、行尾两个空格
const LINES = 20_000
const BIG = Array.from({ length: LINES }, (_, i) => `const v${i}\u0001= '#fff' // line ${i}  `).join('\n')

function ranges(set: DecorationSet, doc: EditorState['doc']) {
    const out: number[] = []
    set.between(0, doc.length, from => { out.push(doc.lineAt(from).number) })
    return out
}

describe('词法装饰:只在文档 / 视口变化时重算', () => {
    const state0 = EditorState.create({ doc: BIG })
    const view = { viewport: { from: state0.doc.line(5000).from, to: state0.doc.line(5040).to } }

    for (const [name, fn] of Object.entries(PROVIDERS)) {
        it(`${name}:只动选区 → 同一个集合;有 view 只扫视口里的行;改文档 / 换视口才重算`, () => {
            const a = fn(state0, view as never)
            const s1 = state0.update({ selection: EditorSelection.cursor(state0.doc.line(5010).from + 2) }).apply()
            expect(fn(s1, view as never)).toBe(a)
            const lines = ranges(a, state0.doc)
            expect(Math.min(...lines)).toBe(5000)
            expect(Math.max(...lines)).toBe(5040)
            // 改文档:重算,命中位置跟着新文档
            const s2 = s1.update({ changes: { from: state0.doc.line(5001).from, insert: '#abc ' } }).apply()
            const b = fn(s2, view as never)
            expect(b).not.toBe(a)
            // 换视口:重算
            const view2 = { viewport: { from: s2.doc.line(9000).from, to: s2.doc.line(9010).to } }
            expect(Math.min(...ranges(fn(s2, view2 as never), s2.doc))).toBe(9000)
            // 没有 view:全文,按 doc 缓存
            const full = fn(s1)
            expect(fn(state0)).toBe(full)
            expect(ranges(full, state0.doc).length).toBeGreaterThanOrEqual(LINES)
        })
    }

    it('2 万行视图里移动光标 / 扩选:三家提供者不再整篇扫(每次 < 3ms)', () => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const v = new EditorView({
            state: EditorState.create({
                doc: BIG,
                extensions: [decorations.of(hexColorDecorations), decorations.of(specialCharDecorations), decorations.of(trailingWhitespaceDecorations)],
            }),
            parent,
        })
        const d = v.state.doc
        const at = (n: number) => d.line(n).from + 3
        // 预热(JIT + 首次扫视口)
        for (let i = 0; i < 5; i++) v.dispatch(v.state.update({ selection: EditorSelection.cursor(at(10 + i)) }))
        // 只量提供者本身:视图换 state 后 decorations facet 会被重新求值,这里模拟 30 次只动选区的 state
        let s = v.state
        const t0 = performance.now()
        for (let i = 0; i < 30; i++) {
            s = s.update({ selection: EditorSelection.range(at(10), at(20 + i)) }).apply()
            for (const fn of s.facet(decorations)) (fn as (st: EditorState, view: EditorView) => DecorationSet)(s, v)
        }
        const per = (performance.now() - t0) / 30
        expect(per).toBeLessThan(3)
        v.destroy()
        parent.remove()
    })
})
