// 折叠范围的逐行事实(缩进、region 标记)按头尾相同的行增量复用:任何编辑后结果和从头算一样。
import { describe, expect, it } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { foldable } from '../../src/core/edit/fold'

function ranges(state: EditorState): string {
    const out: string[] = []
    for (let n = 1; n <= state.doc.lines; n++) {
        const f = foldable(state, state.doc.line(n).from)
        if (f) out.push(`${n}-${state.doc.lineAt(f.to).number}`)
    }
    return out.join(' ')
}
// 从头算:先让逐行事实的缓存对上一份不相干的文档,这一份就没有可抄的头尾
const fresh = (state: EditorState) => {
    ranges(EditorState.create({ doc: 'unrelated' }))
    return ranges(EditorState.create({ doc: state.doc.toString() }))
}

describe('折叠范围增量', () => {
    const base = Array.from({ length: 400 }, (_, i) => (i % 10 === 0 ? `function f${i}() {` : i % 10 === 9 ? '}' : `    line ${i}`)).join('\n')
    it('随机编辑后和从头算一样', () => {
        let st = EditorState.create({ doc: base })
        expect(ranges(st)).toBe(fresh(st))
        let seed = 7
        const rnd = (n: number) => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n
        const inserts = ['\n', 'x', '\n    ', '\n}\n', '// #region a\n', '// #endregion\n', '', '\n\n']
        for (let step = 0; step < 60; step++) {
            const len = st.doc.length
            const from = rnd(len + 1)
            const to = Math.min(len, from + (rnd(3) === 0 ? rnd(40) : 0))
            st = st.update({ changes: { from, to, insert: inserts[rnd(inserts.length)] } }).apply()
            expect(ranges(st), `step ${step}`).toBe(fresh(st))
        }
    })
    it('开头、结尾、整篇替换', () => {
        let st = EditorState.create({ doc: base })
        ranges(st)
        for (const ch of [{ from: 0, insert: 'if (a) {\n  b\n}\n' }, { from: st.doc.length, insert: '\nz {\n  y\n}' }, { from: 0, to: st.doc.length, insert: 'a {\n b\n}' }]) {
            st = st.update({ changes: ch }).apply()
            expect(ranges(st)).toBe(fresh(st))
        }
    })
})
