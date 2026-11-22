// TS/JS 括号跳过表:字符串 / 注释 / 正则 / 模板串字面的范围取自 TS 自己的语法树。
//
// shiki 的 TextMate 语法判正则靠向前看:`r = /a(b/g; f(x)` 里正则体有落单的 `(`,第一条正则规则配不上,
// 落到别的规则把 `/a(` 之后整行当正则,f(x) 的括号就不配对、不上色。Monaco 的 Monarch 分词器认得这是
// 正则。这里用 TS 的解析器:正则 / 除号、模板串、JSX 都按语法定,比 TextMate 准;TS 没加载、文档太大
// (L/XL)时不给,brackets.ts 退回 shiki scope。
//
// 语法树在语言服务一侧(Worker)里:服务一侧 `$skipRanges(fileName)` 返回整篇文档的跳过范围
// `[起, 止, 起, 止…]`(升序),规则见 tsskip.ts。主线程只存「最近一次返回的区间表 + 它对应的那份文档」:
//   - 查询的文档就是区间表对应的那份 → 二分谓词(扫描大多顺序进行,留 hint);
//   - 文档比区间表新(用户刚打了字,新表还在路上)→ 把区间表通过「表→当前文档」的累积改动映射成临时答案:
//     改动在区间外 → 区间平移;改动落在某区间内部(没碰到边界)→ 区间随之伸缩;碰到边界 → 丢掉。
//     映射是惰性的:不逐个区间重映射,查某个位置时才把它逆映射回表里的位置(O(log 改动数 + log 区间数))。
//     这份累积改动由 StateField(tsBracketSkipField)在事务里记下,所以渲染这一版文档时就能查到,不依赖事务监听的先后;
//   - 没有区间表(首次)/ 文档太大 / 改动太多 → undefined,退回 shiki scope。首次请求在空闲时发。
// 请求同时只飞一个;回来时若文档又变了,表仍按「请求时的文档 → 当前文档」的累积改动映射着用,并再发一个。
//
// 哪些算跳过(对齐 Monaco 括号树只收 StandardTokenType.Other):
//   - 字符串 / 正则 / 无替换模板串:整段;模板串头、中、尾的 `${` `}` 不算(和 ${} 里的代码一样算括号);
//   - 注释:节点之间的空隙(trivia + 标点)里的 `//` `/*` 一定是注释开头 —— 字面量、JSX 文本都是节点,
//     不会被扫到。JSDoc 整段算注释(里面 `{Type}` 的花括号不算,Monaco 同);
//   - JSX 文本不跳(Monarch 不认 JSX,`<p>(</p>` 的 `(` 照样是括号)。

import type { EditorView } from '../core/view/editorview'
import type { Rope } from '../core/model/rope'
import type { ChangeSet } from '../core/model/change'
import { setBracketSkipSource, type BracketSkip } from '../core/edit/brackets'
import { StateEffect, StateField } from '../core/model/state'
import { classifyDoc, materializeDoc } from '../core/perf'
import { getTSService, type TSServiceOptions } from './tsservice'

type SkipPredicate = NonNullable<BracketSkip>

/** 累积改动超过这么多处就不再映射(退回 shiki,等新表):防止服务一侧很慢时每个按键都在变长的改动上做功 */
const MAX_SEGS = 256

/** 升序不相交的区间表 [起, 止, 起, 止…] 上的查找,带「上次命中」的 hint */
class RangeTable {
    readonly n: number
    private hint = 0
    constructor(readonly r: readonly number[]) { this.n = r.length >> 1 }

    /** 起点 <= pos 的最后一段下标;没有 -1 */
    lastStartLE(pos: number): number {
        const { r, n } = this
        if (!n || r[0] > pos) return -1
        // 扫描大多顺序进行:先看上次那段,不中再二分
        const h = this.hint
        if (r[2 * h] <= pos && (h + 1 >= n || r[2 * h + 2] > pos)) return h
        let lo = 0, hi = n - 1
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1
            if (r[2 * mid] <= pos) lo = mid
            else hi = mid - 1
        }
        this.hint = lo
        return lo
    }

    /** pos 所在的段(起 <= pos < 止);没有 -1 */
    find(pos: number): number {
        const i = this.lastStartLE(pos)
        return i >= 0 && pos < this.r[2 * i + 1] ? i : -1
    }
}

/** 区间表 → 跳过谓词(表对应的就是被查的那份文档) */
export function skipRangesPredicate(ranges: readonly number[]): SkipPredicate {
    const t = new RangeTable(ranges)
    return pos => t.find(pos) >= 0
}

interface Seg { fromA: number, toA: number, fromB: number, toB: number, nl: boolean }

function segsOf(changes: ChangeSet): Seg[] {
    const out: Seg[] = []
    changes.iterChanges((fromA, toA, fromB, toB, text) => {
        out.push({ fromA, toA, fromB, toB, nl: text.lines > 1 })
    }, false)
    return out
}

/** 一处改动对一个区间 [rs, re) 的影响 */
const enum Fate { Out, Interior, Hit }

/**
 * 区间表通过累积改动映射后的跳过谓词。ranges 是旧文档(tableDoc)的表,changes 是旧文档 → 被查文档的改动。
 *   - 被查位置在未改动的字符上:减去它之前的净增减量,回到旧位置,看那里的区间还在不在;
 *   - 被查位置在新插入 / 替换的字符上:改动落在某区间内部,这些字符就算在这个区间里(在字符串里打字还是字符串)。
 * 区间「还在」= 没有任何一处改动碰到它的边界:改动整个在区间之前 / 之后、或严格在区间内部。
 * 行注释 `// …` 额外认:从 `//` 之后到行尾的改动(不含换行)都算在注释里,包括在行尾追加和删最后一个字;
 * 换行打进注释、碰到 `//` 的改动算碰到边界。
 */
export function mappedSkipPredicate(ranges: readonly number[], changes: ChangeSet, tableDoc: Rope): SkipPredicate {
    const table = new RangeTable(ranges)
    const segs = segsOf(changes)
    const m = segs.length
    // delta[k] = 前 k 处改动的净增减量(新 - 旧)
    const delta = new Array<number>(m + 1)
    delta[0] = 0
    for (let k = 0; k < m; k++) delta[k + 1] = delta[k] + (segs[k].toB - segs[k].fromB) - (segs[k].toA - segs[k].fromA)
    const lineComment = new Map<number, boolean>()
    const isLine = (ri: number) => {
        let v = lineComment.get(ri)
        if (v === undefined) {
            const rs = ranges[2 * ri], re = ranges[2 * ri + 1]
            v = re - rs >= 2 && tableDoc.sliceString(rs, rs + 2) === '//' && tableDoc.sliceString(re - 1, re) !== '`'
            lineComment.set(ri, v)
        }
        return v
    }
    const fate = (g: Seg, ri: number): Fate => {
        const rs = ranges[2 * ri], re = ranges[2 * ri + 1]
        if (isLine(ri) && g.fromA >= rs + 2 && g.toA <= re && !g.nl) return Fate.Interior
        if (g.toA <= rs || g.fromA >= re) return Fate.Out
        // 行注释里别的改动(换行、碰到 `//`):注释的形状变了
        if (isLine(ri)) return Fate.Hit
        if (rs < g.fromA && g.toA < re) return Fate.Interior
        return Fate.Hit
    }
    const kept = new Map<number, boolean>()
    const keep = (ri: number): boolean => {
        let v = kept.get(ri)
        if (v !== undefined) return v
        v = true
        const re = ranges[2 * ri + 1], rs = ranges[2 * ri]
        // 第一处 toA >= rs 的改动起往后看,到 fromA > re 为止(segs 按旧位置升序)
        let lo = 0, hi = m
        while (lo < hi) {
            const mid = (lo + hi) >> 1
            if (segs[mid].toA >= rs) hi = mid
            else lo = mid + 1
        }
        for (let k = lo; k < m && segs[k].fromA <= re; k++)
            if (fate(segs[k], ri) === Fate.Hit) { v = false; break }
        kept.set(ri, v)
        return v
    }
    return (pos) => {
        // 第一处 toB > pos 的改动:它之前的都在 pos 之前结束
        let lo = 0, hi = m
        while (lo < hi) {
            const mid = (lo + hi) >> 1
            if (segs[mid].toB > pos) hi = mid
            else lo = mid + 1
        }
        const g = lo < m ? segs[lo] : null
        if (g && g.fromB <= pos) {
            // 新插入 / 替换的字符:看这处改动是不是严格落在某个区间内部
            const i = table.lastStartLE(g.fromA)
            for (let ri = i; ri >= 0 && ri >= i - 1; ri--)
                if (fate(g, ri) === Fate.Interior && keep(ri)) return true
            return false
        }
        const ri = table.find(pos - delta[lo])
        return ri >= 0 && keep(ri)
    }
}

/** 一份「区间表 + 对应文档」,以及表对应的文档到它之后各版文档的累积改动 */
class SkipBase {
    since = new WeakMap<Rope, ChangeSet>()
    private preds = new WeakMap<Rope, SkipPredicate>()
    private exact: SkipPredicate | null = null
    constructor(readonly doc: Rope, public ranges: readonly number[] | null) {}

    predicate(doc: Rope): SkipPredicate | undefined {
        const ranges = this.ranges
        if (!ranges) return undefined
        if (doc === this.doc) return this.exact ??= skipRangesPredicate(ranges)
        let p = this.preds.get(doc)
        if (p) return p
        const ch = this.since.get(doc)
        if (!ch || ch.newLength !== doc.length) return undefined
        p = mappedSkipPredicate(ranges, ch, this.doc)
        this.preds.set(doc, p)
        return p
    }
}

/**
 * 一个编辑器的括号跳过状态:当前的表(base)和正在请求的那份(pending)。事务里调 advance 记累积改动
 * (按文档记,所以没提交的试算状态、分叉状态互不干扰)。
 */
export class SkipTracker {
    base: SkipBase | null = null
    pending: SkipBase | null = null

    advance(startDoc: Rope, changes: ChangeSet, newDoc: Rope): void {
        for (const b of [this.base, this.pending]) {
            if (!b) continue
            const prev = startDoc === b.doc ? null : b.since.get(startDoc)
            if (startDoc !== b.doc && !prev) continue
            const next = prev ? prev.compose(changes) : changes
            // 只数有改动的段;太多就不记(查询返回 undefined,退回 shiki,等新表)
            let n = 0
            for (let i = 1; i < next.sections.length; i += 2) if (next.sections[i] >= 0) n++
            if (n > MAX_SEGS) continue
            b.since.set(newDoc, next)
        }
    }

    /** 记下一次请求对应的文档;之后的改动开始累积 */
    begin(doc: Rope): void { this.pending = new SkipBase(doc, null) }

    /** 请求回来了:换成这张表。请求不是最近那次 begin 的就不收 */
    adopt(doc: Rope, ranges: readonly number[]): boolean {
        const p = this.pending
        if (!p || p.doc !== doc) return false
        p.ranges = ranges
        this.base = p
        this.pending = null
        return true
    }

    predicate(doc: Rope): SkipPredicate | undefined { return this.base?.predicate(doc) }
}

/** 记累积改动的状态字段。要让按键那一版文档渲染时就查得到映射表,编辑器要装它(lite-monaco 的 TS 语言会装) */
export const tsBracketSkipField = StateField.define<SkipTracker>({
    create: () => new SkipTracker(),
    update: (tracker, tr, state) => {
        if (tr.docChanged) tracker.advance(tr.startState.doc, tr.changes, state.doc)
        return tracker
    },
})

const refresh = StateEffect.define<null>()
const idle = (fn: () => void): (() => void) => {
    const w = globalThis as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number, cancelIdleCallback?: (h: number) => void }
    if (w.requestIdleCallback) {
        const h = w.requestIdleCallback(fn, { timeout: 500 })
        return () => w.cancelIdleCallback?.(h)
    }
    const t = setTimeout(fn, 0)
    return () => clearTimeout(t)
}

const DEBOUNCE_MS = 50

/** 给 view 登记 TS 语法树的括号跳过来源;返回退订 */
export function tsBracketSkipSession(view: EditorView, opts: TSServiceOptions): () => void {
    const session = getTSService(opts)
    // 没装 tsBracketSkipField 时自己持一份:只有「表对应的那版文档」查得到,文档变了退回 shiki 到新表回来
    const fallback = new SkipTracker()
    const tracker = () => view.state.field(tsBracketSkipField, false) ?? fallback
    let timer: ReturnType<typeof setTimeout> | null = null
    let pendingIdle: (() => void) | null = null
    let inflight = false
    let dirty = false
    let disposed = false

    const tooBig = (doc: Rope) => {
        const c = classifyDoc(doc.lines, doc.length)
        return c === 'L' || c === 'XL'
    }

    // 同时只飞一个请求:回来时文档又变了(或飞行期间有新改动)再发一个
    const request = async () => {
        if (disposed || inflight) { dirty = true; return }
        const doc = view.state.doc
        if (tooBig(doc) || tracker().base?.doc === doc) return
        inflight = true
        dirty = false
        const trk = tracker()
        session.update(materializeDoc(view.state))
        trk.begin(doc)
        let ranges: number[] | null = null
        try { ranges = await session.service().$skipRanges(session.fileName) }
        catch { ranges = null }
        inflight = false
        if (disposed) return
        if (ranges && tracker().adopt(doc, ranges)) view.dispatch(view.state.update({ effects: refresh.of(null) }))
        if (ranges && (dirty || view.state.doc !== doc)) schedule(0)
    }
    const schedule = (ms = DEBOUNCE_MS) => {
        if (disposed) return
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => { timer = null; void request() }, ms)
    }
    // 第一次:等 TS 加载,空闲时发,好了让装饰按新跳过表重画
    const firstRequest = () => {
        if (pendingIdle) return
        let cancel: (() => void) | null = null
        pendingIdle = () => cancel?.()
        void session.ensure().then(() => {
            if (disposed) return
            cancel = idle(() => {
                pendingIdle = null
                if (!disposed) void request()
            })
        }, () => { pendingIdle = null })
    }

    setBracketSkipSource(view, (doc) => {
        if (tooBig(doc)) return undefined
        const trk = tracker()
        const p = trk.predicate(doc)
        if (p) return p
        if (!trk.base) firstRequest()
        else if (!timer && !inflight) schedule()
        return undefined
    })
    const off = view.onTransaction((tr) => {
        if (tr.docChanged && tracker().base) schedule()
    })
    return () => {
        disposed = true
        pendingIdle?.()
        if (timer) clearTimeout(timer)
        off()
        setBracketSkipSource(view, null)
    }
}
