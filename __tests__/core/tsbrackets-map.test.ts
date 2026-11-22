// 括号跳过表(异步):区间表通过「表 → 当前文档」的累积改动映射成临时答案,新表回来后换成精确的。
// 真值:同一份新文本用 TS 语法树现算的区间表(tsskip.skipRangesIn)。
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createHighlighter, type Highlighter } from 'shiki'
import type * as TS from 'typescript'
import { EditorState } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'
import { ChangeSet } from '../../src/core/model/change'
import type { EditorView } from '../../src/core/view/editorview'
import { bracketSkip } from '../../src/core/edit/brackets'
import { closeBracketChange } from '../../src/core/edit/closebrackets'
import { clearTSServiceCache } from '../../src/lang/tsservice'
import {
    mappedSkipPredicate, skipRangesPredicate, SkipTracker, tsBracketSkipField,
} from '../../src/lang/tsbrackets'
import { skipRangesIn, tsSkipTree } from '../../src/lang/tsskip'

const { liteMonaco } = await import('../../src/litemonaco')

const SLOW = 60_000
let ts: typeof TS
let hl: Highlighter
beforeAll(async () => {
    ts = (await import('typescript')).default ?? await import('typescript')
    hl = await createHighlighter({ themes: ['dark-plus'], langs: ['typescript'] })
})
afterEach(() => clearTSServiceCache())

const rangesOf = (text: string, file = '/m.ts') => skipRangesIn(ts, tsSkipTree(ts, file, text).sf, 0, text.length + 1)
const docOf = (text: string) => EditorState.create({ doc: text }).doc
const apply = (text: string, ...changes: { from: number, to?: number, insert?: string }[]) => {
    const cs = ChangeSet.of(changes, text.length)
    return { cs, next: cs.apply(docOf(text)).toString() }
}
/** 旧文本 + 改动 → 映射谓词(对新文本) */
const mapped = (text: string, ...changes: { from: number, to?: number, insert?: string }[]) => {
    const { cs, next } = apply(text, ...changes)
    return { pred: mappedSkipPredicate(rangesOf(text), cs, docOf(text)), next }
}
const marks = (pred: (p: number) => boolean, len: number) => Array.from({ length: len }, (_, p) => pred(p) ? 1 : 0).join('')

describe('mappedSkipPredicate:基本映射', () => {
    it('无改动:和精确表一致', () => {
        const t = 'f("(", /a(/, `x${(1)}`) // ( x\n(y)'
        const { pred, next } = mapped(t)
        const exact = skipRangesPredicate(rangesOf(t))
        expect(marks(pred, next.length)).toBe(marks(exact, next.length))
    })

    it('字符串外插入:区间平移', () => {
        const t = 'f("(a)", b)'
        const { pred, next } = mapped(t, { from: 0, insert: 'let q = ' })
        expect(next).toBe('let q = f("(a)", b)')
        const open = next.indexOf('"(') + 1
        expect(pred(open)).toBe(true) // ( 在平移后的字符串里
        expect(pred(open + 2)).toBe(true) // )
        expect(pred(next.indexOf(', b'))).toBe(false)
        expect(marks(pred, next.length)).toBe(marks(skipRangesPredicate(rangesOf(next)), next.length))
    })

    it('字符串里打字:新字符和后面的括号仍在字符串里', () => {
        const t = 'f("ab(c")'
        const { pred, next } = mapped(t, { from: 5, insert: 'XY(' }) // "ab|(c"
        expect(next).toBe('f("abXY((c")')
        for (const p of [4, 5, 6, 7, 8, 9, 10]) expect(pred(p), `pos ${p}`).toBe(true)
        expect(pred(1)).toBe(false) // f( 的 ( 不在字符串里
        expect(pred(11)).toBe(false)
        expect(marks(pred, next.length)).toBe(marks(skipRangesPredicate(rangesOf(next)), next.length))
    })

    it('字符串里删字:区间收缩', () => {
        const t = 'f("a((b")(c)'
        const { pred, next } = mapped(t, { from: 4, to: 6 }) // 删 "((" 的前两个字符之一..
        expect(marks(pred, next.length)).toBe(marks(skipRangesPredicate(rangesOf(next)), next.length))
    })

    it('改动碰到边界:区间丢掉(开引号被删 / 闭引号被删 / 跨越边界)', () => {
        const t = 'f("(a)") + g("(b)")'
        // 删闭引号:第一个字符串的区间丢掉,括号不再被跳过;第二个不受影响
        const a = mapped(t, { from: 6, to: 7 })
        expect(a.next).toBe('f("(a)) + g("(b)")')
        expect(a.pred(3)).toBe(false)
        expect(a.pred(a.next.indexOf('(b') )).toBe(true)
        // 删开引号
        const b = mapped(t, { from: 2, to: 3 })
        expect(b.pred(b.next.indexOf('(a'))).toBe(false)
        // 替换跨过边界
        const c = mapped(t, { from: 6, to: 9, insert: 'zz' })
        expect(c.pred(3)).toBe(false)
        // 其余字符串仍在
        expect(c.pred(c.next.indexOf('(b'))).toBe(true)
    })

    it('在字符串前一格 / 后一格插入:区间不丢', () => {
        const t = 'f("(a)")'
        const before = mapped(t, { from: 2, insert: 'x' }) // f(x"(a)")
        expect(before.pred(4)).toBe(true)
        const after = mapped(t, { from: 7, insert: 'x' }) // f("(a)"x)
        expect(after.pred(3)).toBe(true)
    })

    it('行注释:在行尾追加 / 删最后一个字,注释还是注释;换行则丢掉', () => {
        const t = 'a = 1 // (x\nb(c)'
        const app = mapped(t, { from: 11, insert: ' (y' })
        expect(app.pred(app.next.indexOf('(x'))).toBe(true)
        expect(app.pred(app.next.indexOf('(y'))).toBe(true)
        expect(app.pred(app.next.indexOf('b(') + 1)).toBe(false)
        const del = mapped(t, { from: 10, to: 11 })
        expect(del.pred(del.next.indexOf('(') )).toBe(true)
        const nl = mapped(t, { from: 8, insert: '\n' })
        expect(nl.pred(nl.next.indexOf('(x'))).toBe(false)
        // `//` 本身被拆开
        const split = mapped(t, { from: 7, insert: 'k' })
        expect(split.pred(split.next.indexOf('(x'))).toBe(false)
    })

    it('多处改动:分别在不同区间里 / 区间外,位置都对', () => {
        const t = 'f("(a", g(")b"), /x(/) // (\n`t${(1)}u(`'
        const exact0 = rangesOf(t)
        expect(exact0.length).toBeGreaterThan(8)
        const { pred, next } = mapped(t,
            { from: 0, insert: '  ' },
            { from: 5, insert: 'zz' },
            { from: 12, insert: 'q' },
            { from: 18, to: 19 }, // 删正则体里的 x
        )
        expect(marks(pred, next.length)).toBe(marks(skipRangesPredicate(rangesOf(next)), next.length))
    })
})

describe('mappedSkipPredicate:和精确表的一致性(随机,只做不改词法结构的编辑)', () => {
    // 不改变字符串/注释/正则/模板串边界的编辑:字面量内部(离边界 ≥ 2 个字符)打 / 删字母和空格;代码里(离任何区间 ≥ 2)插 / 删空格。
    const LINES = [
        'const aa = f("x(y", \'q[r\')',
        '// c(c {',
        'bb = /a(b/',
        'cc = `t${(dd)}u(` + `w`',
        '/* e( */ gg(hh)',
        'ii = [1, jj("k[l")] // m)',
        '(( )) [ ] { }',
    ]
    const SRC = LINES.join('\n')
    const rnd = (seed: number) => () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed }

    it('1 ~ 6 处连续编辑,每步的映射结果和现算的精确表在所有位置一致', () => {
        const next = rnd(20240607)
        const pick = (n: number) => next() % n
        for (let round = 0; round < 200; round++) {
            const base = SRC
            const baseRanges = rangesOf(base)
            let text = base
            let cs: ChangeSet | null = null
            const steps = 1 + pick(6)
            for (let s = 0; s < steps; s++) {
                const ranges = rangesOf(text)
                const inside = (p: number, margin: number) => {
                    for (let i = 0; i < ranges.length; i += 2) {
                        const line = text.slice(ranges[i], ranges[i] + 2) === '//'
                        if (p >= ranges[i] + margin && p <= ranges[i + 1] - (line ? 0 : margin)) return true
                    }
                    return false
                }
                const nearRange = (p: number) => {
                    for (let i = 0; i < ranges.length; i += 2) if (p >= ranges[i] - 2 && p <= ranges[i + 1] + 2) return true
                    return false
                }
                let change: { from: number, to?: number, insert?: string } | null = null
                for (let tries = 0; tries < 50 && !change; tries++) {
                    const p = pick(text.length + 1)
                    const kind = pick(4)
                    if (kind === 0 && inside(p, 2)) change = { from: p, insert: 'ab '.slice(0, 1 + pick(3)) }
                    else if (kind === 1 && !nearRange(p)) change = { from: p, insert: ' ' }
                    else if (kind === 2 && inside(p, 2) && inside(p + 1, 2) && /[a-z ]/.test(text[p] ?? '')) change = { from: p, to: p + 1 }
                    else if (kind === 3 && !nearRange(p) && !nearRange(p + 1) && text[p] === ' ') change = { from: p, to: p + 1 }
                }
                if (!change) continue
                const step = ChangeSet.of(change, text.length)
                cs = cs ? cs.compose(step) : step
                text = step.apply(docOf(text)).toString()
            }
            if (!cs) continue
            const pred = mappedSkipPredicate(baseRanges, cs, docOf(base))
            expect(marks(pred, text.length), `round ${round}\n${JSON.stringify(text)}`).toBe(marks(skipRangesPredicate(rangesOf(text)), text.length))
        }
    })
})

describe('SkipTracker + StateField:按文档记累积改动', () => {
    const mk = (text: string) => EditorState.create({ doc: text, extensions: [tsBracketSkipField] })
    const setup = (text: string) => {
        const s0 = mk(text)
        const tracker = s0.field(tsBracketSkipField)
        tracker.begin(s0.doc)
        expect(tracker.adopt(s0.doc, rangesOf(text))).toBe(true)
        return { s0, tracker }
    }

    it('表对应的文档查精确表;之后每版文档查映射表;不认识的文档 undefined', () => {
        const { s0, tracker } = setup('f("(a", b)')
        expect(tracker.predicate(s0.doc)).toBeTypeOf('function')
        const s1 = s0.applyTransaction(s0.update({ changes: { from: 4, insert: 'XY' } }))
        const s2 = s1.applyTransaction(s1.update({ changes: { from: 0, insert: '  ' } }))
        expect(s2.doc.toString()).toBe('  f("(XYa", b)')
        const p2 = tracker.predicate(s2.doc)!
        expect(p2(s2.doc.toString().indexOf('(X'))).toBe(true)
        expect(tracker.predicate(s1.doc)!(s1.doc.toString().indexOf('(X'))).toBe(true)
        expect(tracker.predicate(EditorState.create({ doc: 'zzz' }).doc)).toBeUndefined()
        // 同一文档重复查是同一个谓词(hint 跟着它)
        expect(tracker.predicate(s2.doc)).toBe(p2)
    })

    it('试算 / 分叉的状态互不干扰', () => {
        const { s0, tracker } = setup('f("(a")')
        const tentative = s0.applyTransaction(s0.update({ changes: { from: 4, insert: '"' } })) // 没被采用
        const real = s0.applyTransaction(s0.update({ changes: { from: 4, insert: 'z' } }))
        expect(tracker.predicate(tentative.doc)!(3)).toBe(true)
        expect(tracker.predicate(real.doc)!(real.doc.toString().indexOf('(z'))).toBe(true)
        const next = real.applyTransaction(real.update({ changes: { from: 0, insert: ' ' } }))
        expect(tracker.predicate(next.doc)!(next.doc.toString().indexOf('(z'))).toBe(true)
    })

    it('请求期间文档又变了:回来的表按「请求时文档 → 当前文档」的改动继续映射', () => {
        const s0 = mk('x = "(a" + y')
        const tracker = s0.field(tsBracketSkipField)
        tracker.begin(s0.doc)
        const s1 = s0.applyTransaction(s0.update({ changes: { from: 0, insert: 'let ' } }))
        const s2 = s1.applyTransaction(s1.update({ changes: { from: 9, insert: 'bb' } }))
        // 回来了,但当前文档已是 s2
        expect(tracker.adopt(s0.doc, rangesOf('x = "(a" + y'))).toBe(true)
        expect(tracker.base!.doc).toBe(s0.doc)
        const t2 = s2.doc.toString()
        expect(marks(tracker.predicate(s2.doc)!, t2.length)).toBe(marks(skipRangesPredicate(rangesOf(t2)), t2.length))
        // 不是最近那次 begin 的结果不收
        expect(tracker.adopt(s1.doc, [])).toBe(false)
        tracker.begin(s1.doc)
        tracker.begin(s2.doc)
        expect(tracker.adopt(s1.doc, [])).toBe(false)
        expect(tracker.adopt(s2.doc, rangesOf(t2))).toBe(true)
        expect(tracker.base!.doc).toBe(s2.doc)
    })

    it('累积改动太多就不再映射(退回 shiki)', () => {
        const { s0, tracker } = setup('f("(a")' + ' x'.repeat(400))
        let s = s0
        for (let i = 0; i < 300; i++) s = s.applyTransaction(s.update({ changes: { from: 7 + 2 * i, insert: '_' } }))
        expect(tracker.predicate(s.doc)).toBeUndefined()
        expect(tracker.predicate(s0.doc)).toBeTypeOf('function')
    })

    it('没装字段:begin / adopt 照常,只有表对应的那版文档查得到', () => {
        const t = new SkipTracker()
        const d = docOf('f("(")')
        t.begin(d)
        t.adopt(d, rangesOf('f("(")'))
        expect(t.predicate(d)!(3)).toBe(true)
        expect(t.predicate(docOf('f("(")'))).toBeUndefined()
    })
})

describe('真编辑器:打字时临时表,新表回来换成精确表', () => {
    const views: EditorView[] = []
    afterEach(() => { for (const v of views.splice(0)) v.destroy() })
    const mount = (doc: string, fileName: string) => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const view = liteMonaco({
            parent, highlighter: hl as never, doc, lang: 'typescript', theme: 'dark-plus', fileName,
            features: { autocomplete: false, signatureHelp: false, hover: false, codeActions: false, tsDiagnostics: false, minimap: false, stickyScroll: false },
        })
        views.push(view)
        return view
    }
    const skipAt = (v: EditorView, pos: number) => bracketSkip(v, v.state.doc)?.(pos)
    const refreshCount = (v: EditorView) => {
        const c = { n: 0 }
        v.onTransaction(tr => { if (!tr.docChanged && tr.effects.length) c.n++ })
        return c
    }

    it('字符串里连续打字:每一版同步查都在字符串里,新表回来后仍对', async () => {
        const doc = 'const s = f("ab", 1)\nconst t = g(2)'
        const v = mount(doc, '/map1.ts')
        const c = refreshCount(v)
        await vi.waitFor(() => expect(c.n).toBeGreaterThan(0), { timeout: 30_000 })
        const open = doc.indexOf('"ab"')
        for (const ch of ['x', '(', 'y', ')']) {
            const at = v.state.doc.toString().indexOf('"ab') + 3
            v.dispatch(v.state.update({ changes: { from: at, insert: ch } }))
            const text = v.state.doc.toString()
            // 刚打完就问:新表还没回来,查到的是映射后的临时表
            expect(skipAt(v, at), `typed ${ch}`).toBe(true)
            expect(skipAt(v, text.indexOf('", 1)') - 1)).toBe(true)
            expect(skipAt(v, text.indexOf('f(') + 1), '字符串外的 ( 不跳').toBe(false)
        }
        expect(open).toBeGreaterThan(0)
        const before = c.n
        await vi.waitFor(() => expect(c.n).toBeGreaterThan(before), { timeout: 30_000 })
        const text = v.state.doc.toString()
        const exact = skipRangesPredicate(rangesOf(text, '/map1.ts'))
        for (let p = 0; p < text.length; p++) expect(skipAt(v, p), `pos ${p}`).toBe(exact(p))
    }, SLOW)

    it('删掉闭引号:临时表丢掉那个字符串;新表回来后是精确的(整行剩余都在未闭合字符串里)', async () => {
        const doc = 'f("a(b") + g(c)'
        const v = mount(doc, '/map2.ts')
        const c = refreshCount(v)
        await vi.waitFor(() => expect(c.n).toBeGreaterThan(0), { timeout: 30_000 })
        expect(skipAt(v, 4)).toBe(true)
        v.dispatch(v.state.update({ changes: { from: 6, to: 7 } })) // f("a(b) + g(c)
        expect(v.state.doc.toString()).toBe('f("a(b) + g(c)')
        expect(skipAt(v, 4)).toBe(false) // 临时表:碰到边界,丢掉
        const before = c.n
        await vi.waitFor(() => expect(c.n).toBeGreaterThan(before), { timeout: 30_000 })
        expect(skipAt(v, 4)).toBe(true) // 精确:未闭合字符串盖到行尾
        expect(skipAt(v, 11)).toBe(true)
    }, SLOW)

    it('飞行中的请求回来时文档又变了:表照样收下并映射,随后再发一次得到精确表', async () => {
        const doc = 'x = "(a" + (y)'
        const v = mount(doc, '/map3.ts')
        const c = refreshCount(v)
        await vi.waitFor(() => expect(c.n).toBeGreaterThan(0), { timeout: 30_000 })
        let text = doc
        for (let i = 0; i < 5; i++) {
            const at = text.indexOf('(a') + 1
            v.dispatch(v.state.update({ changes: { from: at, insert: 'k' } }))
            text = v.state.doc.toString()
            expect(skipAt(v, text.indexOf('(k'))).toBe(true)
            await new Promise(r => setTimeout(r, 20))
        }
        await vi.waitFor(() => {
            const exact = skipRangesPredicate(rangesOf(v.state.doc.toString(), '/map3.ts'))
            const t = v.state.doc.toString()
            for (let p = 0; p < t.length; p++) expect(skipAt(v, p), `pos ${p}`).toBe(exact(p))
        }, { timeout: 30_000 })
    }, SLOW)

    it('自动补括号不看跳过表:在字符串里打 ( 的结果,精确表 / 临时表 / 没表都一样', async () => {
        const doc = 'f("ab")'
        const v = mount(doc, '/map4.ts')
        const c = refreshCount(v)
        const typed = () => {
            const st = EditorState.create({ doc: v.state.doc.toString(), selection: EditorSelection.cursor(5) })
            return closeBracketChange(st, { from: 5, to: 5, insert: '(' }, true)
        }
        const none = typed() // TS 表还没回来
        await vi.waitFor(() => expect(c.n).toBeGreaterThan(0), { timeout: 30_000 })
        expect(typed()).toEqual(none)
        // 临时表:先在字符串里打一个字
        v.dispatch(v.state.update({ changes: { from: 4, insert: 'z' } }))
        v.dispatch(v.state.update({ changes: { from: 4, to: 5 } }))
        expect(skipAt(v, 4)).toBe(true)
        expect(typed()).toEqual(none)
    }, SLOW)
})
