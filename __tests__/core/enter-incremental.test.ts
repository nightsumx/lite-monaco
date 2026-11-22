// 大文档里 Enter 的同步路径:成本只该跟改动大小有关,不跟文档行数有关。
// 1) sticky 作用域树按编辑映射行号:单段改动时不再对每个节点查 rope(结果必须和逐节点算一样)
// 2) 空查询时查找不把整篇文档切成字符串
import { describe, expect, it, vi } from 'vitest'
import type { ChangeSpec } from '../../src/core/model/change'
import { EditorState } from '../../src/core/model/state'
import { depthInvalidation, foldScopes, mapStickyTree, type StickyNode } from '../../src/core/feature/stickyscroll'
import { DepthIndex, DEPTH_BLOCK, type DepthLines } from '../../src/core/feature/depthindex'
import { depthAt } from '../../src/core/edit/brackets'
import { EDIT_RETOKENIZE_MAX } from '../../src/core/view/tokens'
import { searchField, setSearchQuery } from '../../src/core/feature/search'

// 参照:逐节点查 rope(旧实现原样)
function mapSlow(roots: readonly StickyNode[], oldDoc: EditorState['doc'], newDoc: EditorState['doc'], mapPos: (p: number, a: number) => number): StickyNode[] {
    const lineOf = (n: number, side: -1 | 1) => {
        const l = oldDoc.line(Math.max(1, Math.min(n, oldDoc.lines)))
        return newDoc.lineAt(mapPos(side < 0 ? l.to : l.from, side)).number
    }
    const map = (n: StickyNode): StickyNode => {
        const start = lineOf(n.start, 1)
        const end = n.end >= n.start ? Math.max(start - 1, lineOf(n.end, -1)) : start - (n.start - n.end)
        return { start, end, children: n.children.map(map) }
    }
    return roots.map(map)
}

const code = (n: number) => Array.from({ length: n }, (_, i) => (i % 8 === 0 ? `function f${i}() {` : i % 8 === 7 ? '}' : i % 8 === 3 ? '    if (a) {' : i % 8 === 5 ? '    }' : `        line ${i}`)).join('\n')

function rnd(seed: number) {
    let s = seed
    return (n: number) => (s = (s * 1103515245 + 12345) & 0x7fffffff) % n
}

describe('sticky 作用域树映射', () => {
    it('随机单段编辑(换行、删除、替换、跨行)后和逐节点算一样,连续映射也一样', () => {
        const r = rnd(11)
        let st = EditorState.create({ doc: code(600) })
        let fast = foldScopes(st, true)
        let slow = fast
        const inserts = ['\n', 'x', '\n    ', '\n}\n', '', '\n\n', 'a\nb\nc']
        for (let step = 0; step < 120; step++) {
            const len = st.doc.length
            const from = r(len + 1)
            const to = Math.min(len, from + (r(3) === 0 ? r(120) : 0))
            const insert = inserts[r(inserts.length)]
            const tr = st.update({ changes: { from, to, insert } })
            const mp = (p: number, a: number) => tr.changes.mapPos(p, a as -1 | 1)
            fast = mapStickyTree(fast, st.doc, tr.newDoc, mp, tr.changes)
            slow = mapSlow(slow, st.doc, tr.newDoc, mp)
            expect(fast, `step ${step}`).toEqual(slow)
            st = tr.apply()
        }
    })

    it('多段编辑(多光标)走原来的算法,结果一样', () => {
        const st = EditorState.create({ doc: code(200) })
        const roots = foldScopes(st, true)
        const tr = st.update({ changes: [{ from: 10, insert: '\n' }, { from: 400, to: 410, insert: 'z\ny' }, { from: 900, insert: '\n\n' }] })
        const mp = (p: number, a: number) => tr.changes.mapPos(p, a as -1 | 1)
        expect(mapStickyTree(roots, st.doc, tr.newDoc, mp, tr.changes)).toEqual(mapSlow(roots, st.doc, tr.newDoc, mp))
    })

    it('一次 Enter 查 rope 的次数不随节点数增长', () => {
        const count = (lines: number) => {
            const st = EditorState.create({ doc: code(lines) })
            const roots = foldScopes(st, true)
            const at = st.doc.line(Math.floor(lines / 2)).to
            const tr = st.update({ changes: { from: at, insert: '\n' } })
            let calls = 0
            for (const d of [st.doc, tr.newDoc]) {
                for (const k of ['line', 'lineAt'] as const) {
                    const orig = d[k].bind(d)
                    ;(d as unknown as Record<string, unknown>)[k] = (...a: [number]) => { calls++; return orig(...a) }
                }
            }
            mapStickyTree(roots, st.doc, tr.newDoc, (p, a) => tr.changes.mapPos(p, a as -1 | 1), tr.changes)
            return calls
        }
        const small = count(800)
        const big = count(8000)
        expect(big).toBeLessThanOrEqual(small + 8)
        expect(big).toBeLessThan(40)
    })
})

describe('查找:空查询', () => {
    it('改文档不切整篇文档', () => {
        const st = EditorState.create({ doc: code(2000), extensions: [searchField] })
        // Rope 有叶子和内部节点两种实现:树里出现的原型都盯着
        const protos: { sliceString: (...a: unknown[]) => string }[] = []
        const walk = (d: unknown) => {
            const o = Object.getPrototypeOf(d) as (typeof protos)[number]
            if (!protos.includes(o)) protos.push(o)
            const kids = (d as { children?: unknown[] }).children
            if (kids) for (const k of kids) walk(k)
        }
        walk(st.doc)
        const mocks = protos.map(o => vi.spyOn(o, 'sliceString'))
        const tr = st.update({ changes: { from: 5, insert: 'x' } })
        void tr.apply().field(searchField)
        const calls = mocks.reduce((n, m) => n + m.mock.calls.length, 0)
        mocks.forEach(m => m.mockRestore())
        expect(calls).toBe(0)
    })

    it('有查询时照常找(编辑后命中数更新)', () => {
        let st = EditorState.create({ doc: 'abc abc', extensions: [searchField] })
        setSearchQuery('abc')({ state: st, dispatch: tr => { st = tr.apply() } })
        expect(st.field(searchField).matches).toHaveLength(2)
        st = st.update({ changes: { from: 0, insert: 'abc ' } }).apply()
        expect(st.field(searchField).matches).toHaveLength(3)
    })
})

describe('括号深度索引:编辑后作废什么', () => {
    const doc = EditorState.create({ doc: code(100) }).doc
    const inv = (changes: ChangeSpec) => {
        const st = EditorState.create({ doc: code(100) })
        return depthInvalidation(st.doc, st.update({ changes }).changes)
    }
    it('打字:只作废改到的行和重分词窗口,行号不动', () => {
        const at = doc.line(45).from + 3
        expect(inv({ from: at, insert: 'x' })).toEqual({ lines: [44, 45 + EDIT_RETOKENIZE_MAX] })
        expect(inv({ from: at, to: at + 2, insert: '' })).toEqual({ lines: [44, 45 + EDIT_RETOKENIZE_MAX] })
    })
    it('同样行数的多行替换(两行换成含一个换行的文字):按 [首行, 末行] 作废', () => {
        const from = doc.line(45).to - 2, to = doc.line(46).from + 2
        expect(inv({ from, to, insert: 'a\nb' })).toEqual({ lines: [44, 46 + EDIT_RETOKENIZE_MAX] })
    })
    it('Enter、删行、粘贴多行:块边界挪位,编辑点之后全部作废', () => {
        expect(inv({ from: doc.line(45).to, insert: '\n' })).toEqual({ fromLine: 45 })
        expect(inv({ from: doc.line(45).to, to: doc.line(46).to, insert: '' })).toEqual({ fromLine: 45 })
        expect(inv({ from: 5, insert: 'a\nb\nc' })).toEqual({ fromLine: 1 })
    })
    it('多处改动里只要有一处改了行数,就按改了行数处理', () => {
        expect(inv([{ from: doc.line(10).to, insert: 'x' }, { from: doc.line(60).to, insert: '\n' }])).toEqual({ fromLine: 10 })
    })

    // 行内可判定的跳过(第一个引号之后的括号不算):跳过结果只取决于本行文字,和按「编辑点之后全作废」的结果比
    it('随机的不改行数的编辑:只按 depthInvalidation 作废,任何一行的深度都和从头数一样', () => {
        const r = rnd(23)
        const pieces = ['(', ')', '{', '}', '"', 'a', ' ', '[', ']']
        const randLine = () => Array.from({ length: r(7) }, () => pieces[r(pieces.length)]).join('')
        let lines = Array.from({ length: DEPTH_BLOCK * 3 + 17 }, randLine)
        const mk = (): DepthLines & { text: string } => {
            const starts: number[] = []
            let p = 0
            for (const l of lines) { starts.push(p); p += l.length + 1 }
            return { lines: lines.length, line: n => ({ from: starts[n - 1], text: lines[n - 1] }), text: lines.join('\n') }
        }
        const skipFor = (d: ReturnType<typeof mk>) => (pos: number) => {
            // 找行
            let lo = 1, hi = d.lines
            while (lo < hi) {
                const mid = (lo + hi + 1) >> 1
                if (d.line(mid).from <= pos) lo = mid
                else hi = mid - 1
            }
            const l = d.line(lo)
            const q = l.text.indexOf('"')
            return q >= 0 && pos - l.from > q
        }
        const idx = new DepthIndex()
        let d = mk()
        const check = () => {
            const skip = skipFor(d)
            for (const n of [1, 2, 50, DEPTH_BLOCK, DEPTH_BLOCK + 1, DEPTH_BLOCK * 2 + 5, d.lines - 3, d.lines]) {
                const from = n <= 1 ? 0 : d.line(n).from
                expect(idx.depthAtLine(d, n, skip), `line ${n}`).toBe(depthAt(d.text.slice(0, from), from, 0, skip))
            }
        }
        check()
        for (let step = 0; step < 150; step++) {
            const n = 1 + r(lines.length)
            const kind = r(8)
            const multi = kind === 0 && n < lines.length
            const oldDoc = EditorState.create({ doc: d.text }).doc
            const from = oldDoc.line(n).from + r(lines[n - 1].length + 1)
            let to = multi ? oldDoc.line(n + 1).from + r(lines[n].length + 1) : from + Math.min(r(3), oldDoc.line(n).to - from)
            let insert = multi ? randLine() + '\n' + randLine() : randLine()
            // 改行数的:Enter、把两行并成一行、删掉几行、粘贴多行
            if (kind === 1) insert = '\n' + randLine()
            else if (kind === 2 && n < lines.length) { to = oldDoc.line(n).to + 1; insert = '' }
            else if (kind === 3 && n + 2 < lines.length) { to = oldDoc.line(n + 2).from + r(3); insert = randLine() }
            else if (kind === 4) insert = randLine() + '\n' + randLine() + '\n' + randLine()
            if (to > oldDoc.length) to = oldDoc.length
            const st = EditorState.create({ doc: oldDoc })
            const tr = st.update({ changes: { from, to, insert } })
            lines = tr.newDoc.toJSON()
            d = mk()
            const i = depthInvalidation(oldDoc, tr.changes)
            if (!i) continue
            if ('lines' in i) idx.invalidateLines(i.lines[0], i.lines[1])
            else idx.invalidateFromLine(i.fromLine)
            if (step % 2 === 0) check()
        }
        check()
    })
})
