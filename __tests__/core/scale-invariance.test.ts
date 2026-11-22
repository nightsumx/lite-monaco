// @vitest-environment jsdom
// 规模无关护栏:一次编辑的同步成本只取决于改了什么和屏幕上有什么,不取决于文档多大。
// wall-clock 在负载高的机器上 ±几 ms 不可信,所以这里数确定性的量:
//   - 从 rope 里切出的字符数(sliceString 返回长度之和)、toString / toJSON 次数(整篇文档物化)
//   - rope 逐行查找次数(lineInner)
//   - DOM 变更记录条数
// 同一份代码样式的文档取 1 万行和 5 万行各做一遍同样的编辑,后者不得超过前者加一个小常数。
// 红了就说明某个功能在按键路径上做了 O(文档) 的事。
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHighlighter, type Highlighter } from 'shiki'
import { liteMonaco } from '../../src/litemonaco'
import { makeScrolled } from './input-harness'
import type { EditorView } from '../../src/core/view/editorview'

const views: EditorView[] = []
afterEach(() => { for (const v of views.splice(0)) { v.destroy(); v.dom.parentElement?.remove() } })

const code = (n: number) => Array.from({ length: n }, (_, i) => (
    i % 8 === 0 ? `function f${i}(a: number) {`
        : i % 8 === 7 ? '}'
            : i % 8 === 3 ? `    if (a > ${i}) { // note`
                : i % 8 === 5 ? '    }'
                    : `        const s${i} = call(a, "str ${i}", [${i}])`)).join('\n')

// 小的一档要大过各功能的“小文档整篇处理”阈值(例如 2 万行以下折叠范围同步算),否则小的反而比大的贵
const SMALL = 10000
const LARGE = 50000
// 常数波动上限:一个 DEPTH_BLOCK(256 行)约 1.2 万字符,块边界落点不同会差一块;文档线性增长则差 40000 行 × 40 字符 ≈ 160 万
const SLACK_CHARS = 40000

interface Counts { sliced: number, toString: number, toJSON: number, lineInner: number, mutations: number, tokenize?: number }

function instrument(view: EditorView) {
    const counts: Counts = { sliced: 0, toString: 0, toJSON: 0, lineInner: 0, mutations: 0 }
    const restore: (() => void)[] = []
    let sliceDepth = 0
    const patch = (proto: object, name: string, wrap: (orig: (...a: unknown[]) => unknown) => (...a: unknown[]) => unknown) => {
        if (!Object.prototype.hasOwnProperty.call(proto, name)) return
        const orig = (proto as Record<string, (...a: unknown[]) => unknown>)[name]
        ;(proto as Record<string, unknown>)[name] = wrap(orig)
        restore.push(() => { (proto as Record<string, unknown>)[name] = orig })
    }
    const seen = new Set<object>()
    const walk = (proto: object | null) => {
        for (; proto && proto !== Object.prototype; proto = Object.getPrototypeOf(proto)) {
            if (seen.has(proto)) continue
            seen.add(proto)
            // 子类覆盖后调 super 时同一次切片会被两层包装各数一遍,只数最外层
            patch(proto, 'sliceString', o => function (this: unknown, ...a) {
                if (sliceDepth++ > 0) { try { return o.apply(this, a) } finally { sliceDepth-- } }
                try { const r = o.apply(this, a) as string; counts.sliced += r.length; return r } finally { sliceDepth-- }
            })
            patch(proto, 'toString', o => function (this: unknown, ...a) { counts.toString++; return o.apply(this, a) })
            patch(proto, 'toJSON', o => function (this: unknown, ...a) { counts.toJSON++; return o.apply(this, a) })
            patch(proto, 'lineInner', o => function (this: unknown, ...a) { counts.lineInner++; return o.apply(this, a) })
        }
    }
    walk(Object.getPrototypeOf(view.state.doc))
    // 编辑后会换成新的 rope 节点类型(叶子/内部节点),两种都挂上
    const big = (view.state.doc as unknown as { children: object[] | null }).children?.[0]
    if (big) walk(Object.getPrototypeOf(big))
    const mo = new MutationObserver(() => {})
    mo.observe(view.contentDOM.parentElement!, { subtree: true, childList: true, characterData: true, attributes: true })
    return {
        counts,
        done() {
            counts.mutations = mo.takeRecords().length
            mo.disconnect()
            for (const r of restore) r()
            return counts
        },
    }
}

// ---- 绝对预算 ----
// 规模无关只能抓“大文档比小文档贵”;两边一起变差(比如每键多读一遍视口)它看不出来。
// 所以把大档(5 万行)每个操作的计数记在 baselines/ops.json,超过基线 10% 就红。
// 要放宽预算必须改这个文件,在 diff 里看得见;变好了也别忘了收紧:UPDATE_BASELINE=1 npx vitest run scale-invariance 重写。
// 计数是确定性的(不看 wall-clock),CI 和高负载机器上都不会误报。
const BASELINE_PATH = resolve(process.cwd(), '__tests__/core/baselines/ops.json')
const TOLERANCE = 1.1
type Baselines = Record<string, Record<string, Partial<Counts>>>
const readBaselines = (): Baselines => { try { return JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) } catch { return {} } }
const recorded: Baselines = {}
function checkBaseline(suite: string, op: string, got: Counts) {
    ;(recorded[suite] ??= {})[op] = got
    if (process.env.UPDATE_BASELINE) return
    const base = readBaselines()[suite]?.[op]
    expect(base, `baselines/ops.json 里没有 ${suite}/${op},先 UPDATE_BASELINE=1 跑一遍`).toBeTruthy()
    for (const k of Object.keys(base!) as (keyof Counts)[]) {
        const b = base![k] ?? 0, v = got[k] ?? 0
        expect(v, `${suite}/${op} 的 ${k}:基线 ${b},现在 ${v}(超出 10%)`).toBeLessThanOrEqual(Math.ceil(b * TOLERANCE))
    }
}
afterAll(() => {
    if (!process.env.UPDATE_BASELINE) return
    const merged = { ...readBaselines() }
    for (const [suite, ops] of Object.entries(recorded)) merged[suite] = { ...merged[suite], ...ops }
    writeFileSync(BASELINE_PATH, JSON.stringify(merged, null, 2) + '\n')
})

// 自家写 DOM 必须包在 observer.ignore 里,否则观察者当成用户改了正文,下一次 flush 会读一遍整行(超长行上几十 ms)
const stray = (v: EditorView) => (v.observer as unknown as { hasPendingRecords(): boolean }).hasPendingRecords()

type Op = (v: EditorView) => void
const at = (v: EditorView, line: number, col = 4) => v.state.doc.line(line).from + col
const OPS: Record<string, Op> = {
    '打字': v => { const p = at(v, 40); v.dispatch(v.state.update({ changes: { from: p, insert: 'x' }, selection: { anchor: p + 1 } })) },
    'Enter': v => { const p = v.state.doc.line(40).to; v.dispatch(v.state.update({ changes: { from: p, insert: '\n    ' }, selection: { anchor: p + 5 } })) },
    'Backspace': v => { const p = at(v, 40, 8); v.dispatch(v.state.update({ changes: { from: p - 1, to: p }, selection: { anchor: p - 1 } })) },
    '粘贴三行': v => { const p = at(v, 40); v.dispatch(v.state.update({ changes: { from: p, insert: 'a()\nb()\nc()' }, selection: { anchor: p + 11 } })) },
}

function measure(lines: number, op: Op): Counts {
    // 视口在第 30 行附近,编辑落在视口内
    const view = makeScrolled(code(lines), { clientHeight: 800, scrollTop: 14 * 30, lineHeight: 14 })
    views.push(view)
    op(view) // 预热一次(首次编辑会建各种缓存)
    const probe = instrument(view)
    op(view)
    view.observer.flush()
    return probe.done()
}

describe('一次编辑的同步成本不随文档行数增长', () => {
    for (const [name, op] of Object.entries(OPS)) {
        it(name, () => {
            const small = measure(SMALL, op)
            const large = measure(LARGE, op)
            // 允许一点常数波动(rope 深一层多几次 lineInner),但不允许按文档规模放大
            expect(large.sliced, `sliceString 字符数 ${SMALL} 行 ${small.sliced} → ${LARGE} 行 ${large.sliced}`).toBeLessThanOrEqual(small.sliced + SLACK_CHARS)
            expect(large.toString, 'toString 次数').toBeLessThanOrEqual(small.toString)
            expect(large.toJSON, 'toJSON 次数').toBeLessThanOrEqual(small.toJSON)
            expect(large.lineInner, `rope 查行 ${small.lineInner} → ${large.lineInner}`).toBeLessThanOrEqual(small.lineInner * 1.5 + 50)
            expect(large.mutations, `DOM 变更 ${small.mutations} → ${large.mutations}`).toBeLessThanOrEqual(small.mutations + 4)
            checkBaseline('裸 view', name, large)
        })
    }
})


// 带全部界面功能的真 liteMonaco():折叠槽、sticky、minimap、括号着色、括号匹配、缩进线……
// 这些才是 r15 里发现 O(文档) 热点的地方(sticky 树映射、折叠范围、括号深度块、空查询)。
describe('全功能 liteMonaco():一次编辑的同步成本不随文档行数增长', () => {
    let hl: Highlighter
    beforeAll(async () => { hl = await createHighlighter({ themes: ['dark-plus'], langs: ['typescript'] }) })

    function mountFull(lines: number, docText = code(lines)) {
        let tokenize = 0
        const counting = {
            getLoadedLanguages: () => hl.getLoadedLanguages(),
            getLastGrammarState: (t: unknown) => hl.getLastGrammarState(t as never) as never,
            codeToTokens: (c: string, o: unknown) => { tokenize++; return hl.codeToTokens(c, o as never) as never },
            loadLanguage: (...a: unknown[]) => (hl.loadLanguage as (...a: unknown[]) => Promise<void>)(...a),
            loadTheme: (...a: unknown[]) => (hl.loadTheme as (...a: unknown[]) => Promise<void>)(...a),
            getLoadedThemes: () => hl.getLoadedThemes(),
            getTheme: (t: string) => hl.getTheme(t),
        }
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const view = liteMonaco({
            parent, highlighter: counting as never, doc: docText, lang: 'typescript', theme: 'dark-plus',
            features: { autocomplete: false, signatureHelp: false, hover: false, codeActions: false, tsDiagnostics: false },
        }) as unknown as EditorView
        const lh = 14
        Object.defineProperty(view.scrollDOM, 'clientHeight', { configurable: true, get: () => 800 })
        Object.defineProperty(view.scrollDOM, 'clientWidth', { configurable: true, get: () => 900 })
        let top = lh * 30
        Object.defineProperty(view.scrollDOM, 'scrollTop', { configurable: true, get: () => top, set: v => { top = v } })
        const sh = view.state.doc.lines * lh
        Object.defineProperty(view.scrollDOM, 'scrollHeight', { configurable: true, get: () => sh })
        Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get() { return (this as HTMLElement).classList?.contains('cm-line') ? lh : 0 } })
        view.oracle.lineHeight = lh
        view.resetHeights()
        view.remeasure()
        views.push(view)
        return { view, tokenized: () => tokenize, reset: () => { tokenize = 0 } }
    }

    async function measureFull(lines: number, op: Op) {
        const m = mountFull(lines)
        const { view } = m
        view.dispatch(view.state.update({ selection: { anchor: view.state.doc.line(40).from + 4 } }))
        op(view)
        await new Promise(r => setTimeout(r, 700)) // 等后台分词和空闲任务把预热那次编辑的尾巴做完
        const probe = instrument(view)
        m.reset()
        op(view)
        expect(stray(view), '编辑后留着没被 ignore 的 DOM 变更记录').toBe(false)
        view.observer.flush()
        const sync = { ...probe.done(), tokenize: m.tokenized() }
        return sync
    }

    for (const [name, op] of Object.entries(OPS)) {
        it(name, async () => {
            const small = await measureFull(SMALL, op)
            const large = await measureFull(LARGE, op)
            expect(large.sliced, `sliceString 字符数 ${small.sliced} → ${large.sliced}`).toBeLessThanOrEqual(small.sliced + SLACK_CHARS)
            expect(large.toString, 'toString 次数').toBeLessThanOrEqual(small.toString)
            expect(large.toJSON, 'toJSON 次数').toBeLessThanOrEqual(small.toJSON)
            expect(large.lineInner, `rope 查行 ${small.lineInner} → ${large.lineInner}`).toBeLessThanOrEqual(small.lineInner * 1.5 + 50)
            expect(large.tokenize!, `分词调用 ${small.tokenize} → ${large.tokenize}`).toBeLessThanOrEqual(small.tokenize! + 2)
            expect(large.mutations, `DOM 变更 ${small.mutations} → ${large.mutations}`).toBeLessThanOrEqual(small.mutations + 4)
            checkBaseline('全功能', name, large)
        }, 60000)
    }
})

// 超长行(压缩过的 JS、数据行):成本不得随行长涨。词法装饰只扫可见列窗口,文本分段隔一个包壳,
// 就地补丁只动落点的文本节点。同样的编辑在 10 万字符和 50 万字符的行上做,后者不得更贵。
describe('超长行:一次编辑 / 全选的同步成本不随行长增长', () => {
    let hl: Highlighter
    beforeAll(async () => { hl = await createHighlighter({ themes: ['dark-plus'], langs: ['typescript'] }) })
    const row = (n: number) => `var a=1;${'x_y = f(a, "https://e.example/p") ; '.repeat(Math.ceil(n / 33))}`.slice(0, n)
    const doc = (n: number) => `const head = 1\n${row(n)}\nconst tail = 2`
    const SHORT = 100_000, LONG = 500_000

    function mount(n: number) {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const view = liteMonaco({
            parent, highlighter: hl as never, doc: doc(n), lang: 'typescript', theme: 'dark-plus',
            features: { autocomplete: false, signatureHelp: false, hover: false, codeActions: false, tsDiagnostics: false },
        }) as unknown as EditorView
        Object.defineProperty(view.scrollDOM, 'clientHeight', { configurable: true, get: () => 400 })
        Object.defineProperty(view.scrollDOM, 'clientWidth', { configurable: true, get: () => 900 })
        view.oracle.lineHeight = 14
        view.resetHeights(); view.remeasure()
        // DOM≡doc 双射闸门只在 dev/test 开(每次 update 整行比一遍),生产是空操作;量生产成本要关掉它
        view.checkInvariants = () => {}
        views.push(view)
        return view
    }
    const mid = (v: EditorView) => v.state.doc.line(2).from + 2000
    const LOPS: Record<string, Op> = {
        '打字': v => { const p = mid(v); v.dispatch(v.state.update({ changes: { from: p, insert: 'x' }, selection: { anchor: p + 1 } })) },
        'Backspace': v => { const p = mid(v); v.dispatch(v.state.update({ changes: { from: p - 1, to: p }, selection: { anchor: p - 1 } })) },
        '全选': v => { v.dispatch(v.state.update({ selection: { anchor: 0, head: v.state.doc.length } })) },
    }
    async function measureLong(n: number, op: Op) {
        const view = mount(n)
        view.dispatch(view.state.update({ selection: { anchor: mid(view) } }))
        op(view)
        await new Promise(r => setTimeout(r, 300))
        const probe = instrument(view)
        op(view)
        expect(stray(view), '编辑后留着没被 ignore 的 DOM 变更记录').toBe(false)
        view.observer.flush()
        return probe.done()
    }
    for (const [name, op] of Object.entries(LOPS)) {
        it(name, async () => {
            const short = await measureLong(SHORT, op)
            const long = await measureLong(LONG, op)
            expect(long.sliced, `sliceString 字符数 ${short.sliced} → ${long.sliced}`).toBeLessThanOrEqual(short.sliced + SLACK_CHARS)
            expect(long.mutations, `DOM 变更 ${short.mutations} → ${long.mutations}`).toBeLessThanOrEqual(short.mutations + 4)
            expect(long.toString).toBeLessThanOrEqual(short.toString)
            checkBaseline('超长行', name, long)
        }, 60000)
    }
})
