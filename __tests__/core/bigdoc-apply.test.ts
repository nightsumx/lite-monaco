// 大批量改动(applyEdits 5 万处、分散的多光标编辑、撤销它们)走一次建树的 ChangeSet.apply:
// 结果必须和逐段 replace 恒等(文本、行数、每行内容),包括删跨行、插多行、改动挨着行首行尾、空文档。
import { describe, expect, it } from 'vitest'
import { ChangeSet, Rope } from '../../src/core/index'

function rng(seed: number) {
    let s = seed
    return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32
}
const sortedChanges = (r: () => number, len: number, k: number) => {
    const pts = Array.from({ length: k * 2 }, () => Math.floor(r() * (len + 1))).sort((a, b) => a - b)
    const out: { from: number, to: number, insert: string }[] = []
    for (let i = 0; i < pts.length; i += 2) {
        const pick = r()
        const insert = pick < 0.3 ? '' : pick < 0.6 ? 'x' : pick < 0.8 ? 'a\nb' : '\n\n#'
        const to = r() < 0.5 ? pts[i] : pts[i + 1]
        out.push({ from: pts[i], to, insert })
    }
    return out
}
// 逐段 replace(旧路径),作为对照
function replaceEach(doc: Rope, changes: { from: number, to: number, insert: string }[]): string {
    let text = doc.toString()
    for (let i = changes.length - 1; i >= 0; i--) {
        const c = changes[i]
        text = text.slice(0, c.from) + c.insert + text.slice(c.to)
    }
    return text
}

describe('ChangeSet.apply 大批量路径', () => {
    it('随机 2000 行文档、随机 1000~3000 处改动:文本和每行内容与逐段替换一致', () => {
        const r = rng(5)
        for (let round = 0; round < 6; round++) {
            const lines = Array.from({ length: 2000 }, (_, i) => (i % 7 === 0 ? '' : `line ${i} ${'q'.repeat(Math.floor(r() * 20))}`))
            const doc = Rope.of(lines)
            const changes = sortedChanges(r, doc.length, 1000 + Math.floor(r() * 2000))
            const set = ChangeSet.of(changes, doc.length)
            const out = set.apply(doc)
            const want = replaceEach(doc, changes)
            expect(out.toString()).toBe(want)
            expect(out.lines).toBe(want.split('\n').length)
            expect(out.length).toBe(want.length)
            for (const n of [1, 2, out.lines >> 1, out.lines]) expect(out.line(n).text).toBe(want.split('\n')[n - 1])
            // 反过来撤销(invert)同样走批量路径,回到原文
            expect(set.invert(doc).apply(out).toString()).toBe(doc.toString())
        }
    })

    it('每行行首插一个字符(applyEdits_50k 的形状):行数不变、每行多一个 #', () => {
        const lines = Array.from({ length: 5000 }, (_, i) => `const v${i} = ${i}`)
        const doc = Rope.of(lines)
        const specs = lines.map((_, i) => ({ from: doc.line(i + 1).from, insert: '#' }))
        const out = ChangeSet.of(specs, doc.length).apply(doc)
        expect(out.lines).toBe(5000)
        expect(out.line(1).text).toBe('#const v0 = 0')
        expect(out.line(5000).text).toBe('#const v4999 = 4999')
    })

    it('删光整篇(全是删除)得到空文档;往空文档里批量插入', () => {
        const doc = Rope.of(Array.from({ length: 1000 }, (_, i) => `l${i}`))
        const specs: { from: number, to: number }[] = []
        for (let n = 1; n <= 1000; n++) { const l = doc.line(n); specs.push({ from: l.from, to: Math.min(doc.length, l.to + 1) }) }
        const out = ChangeSet.of(specs, doc.length).apply(doc)
        expect(out.length).toBe(0)
        expect(out.lines).toBe(1)
        const ins = ChangeSet.of(Array.from({ length: 300 }, () => ({ from: 0, insert: 'ab\n' })), 0).apply(Rope.empty)
        expect(ins.lines).toBe(301)
        expect(ins.toString()).toBe('ab\n'.repeat(300))
    })
})
