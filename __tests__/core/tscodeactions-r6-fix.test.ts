// 第六轮 T 组:灯泡照 Monaco CodeActionOracle / monaco-typescript CodeActionAdaptor 改。
// 对照(compare-cm7 页,Monaco 0.52 打开 TS 诊断实测):光标停 ~260ms 出灯泡;光标两侧空白、挨不上 marker 不出;
// 菜单只有 quick fix("Change spelling to 'helloWorld'"),没有重构;连续移动光标期间不请求。
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'
import { EditorView } from '../../src/core/view/editorview'
import { diagnosticsField, setDiagnostics } from '../../src/core/feature/diagnostics'
import { clearTSServiceCache, getTSService } from '../../src/lang/tsservice'
import { setTsWorker } from '../../src/lang/tsbackend'
import { createTsEndpoint } from '../../src/lang/tsproject'
import { flattenMessage, type SlimDiagnostic, type TsResponse, type TsTransport } from '../../src/lang/tsprotocol'
import { codeActionsLightbulb, lightbulbTriggerRange, markerCodesAt, quickFixesAt } from '../../src/lang/tscodeactions'
import { setTsTags, tsTagField } from '../../src/lang/tsdiagnostics'

const SLOW = 60_000
const DOC = 'function f() {\n    const helloWorld = 1\n    helloWorl\n    let s = helloWorld  + 1\n}\nfunction g() { return 1 }\n'
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// 同线程回环的通道,外加记账:语言服务不在主线程(没法再往 svc 对象上套娃替换方法),改在通道上数请求。
// calls = 关心的几个 TS 方法被请求的顺序;spent = 每个 getCodeFixesAtPosition 从发出到回包的毫秒数
const WATCHED = ['getCodeFixesAtPosition', 'getApplicableRefactors', 'getCombinedCodeFix', 'getSyntacticDiagnostics', 'getSemanticDiagnostics', 'getSuggestionDiagnostics']
function spyTransport() {
    const calls: string[] = []
    const spent: number[] = []
    const started = new Map<number, number>()
    let listener: ((res: TsResponse) => void) | null = null
    const endpoint = createTsEndpoint((res) => {
        if (res.t === 'res' && started.has(res.id)) { spent.push(performance.now() - started.get(res.id)!); started.delete(res.id) }
        const out = structuredClone(res)
        queueMicrotask(() => listener?.(out))
    })
    const transport: TsTransport = {
        post: (req) => {
            if (req.t === 'call' && WATCHED.includes(req.method)) {
                calls.push(req.method)
                if (req.method === 'getCodeFixesAtPosition') started.set(req.id, performance.now())
            }
            endpoint.receive(structuredClone(req))
        },
        onMessage: (fn) => { listener = fn },
        terminate: () => endpoint.dispose(),
    }
    return { transport, calls, spent }
}
afterEach(() => { setTsWorker(null) })

async function until(pred: () => boolean, ms = 20_000) {
    const deadline = Date.now() + ms
    while (Date.now() < deadline) {
        if (pred()) return true
        await sleep(10)
    }
    return false
}

const stateAt = (doc: string, from: number, to = from) =>
    EditorState.create({ doc, selection: EditorSelection.single(from, to), extensions: [diagnosticsField, tsTagField] })
const pos = (doc: string, line: number, col: number) => {
    const ls = doc.split('\n')
    let p = 0
    for (let i = 0; i < line - 1; i++) p += ls[i].length + 1
    return p + col - 1
}

describe('触发区间:Monaco _getRangeOfSelectionUnlessWhitespaceEnclosed', () => {
    it('光标两侧都是空白 / 空行不触发;词边、行尾、选区触发', () => {
        expect(lightbulbTriggerRange(stateAt(DOC, pos(DOC, 4, 24)))).toBeNull() // `helloWorld  + 1` 两空格中间
        expect(lightbulbTriggerRange(stateAt('a\n\nb', 2))).toBeNull() // 空行
        expect(lightbulbTriggerRange(stateAt('  x', 0))).toBeNull() // 行首、首字符是空白
        expect(lightbulbTriggerRange(stateAt('x  ', 3))).toBeNull() // 行尾、末字符是空白
        expect(lightbulbTriggerRange(stateAt(DOC, pos(DOC, 3, 14)))).toEqual({ from: pos(DOC, 3, 14), to: pos(DOC, 3, 14) })
        expect(lightbulbTriggerRange(stateAt(DOC, pos(DOC, 3, 5)))).toEqual({ from: pos(DOC, 3, 5), to: pos(DOC, 3, 5) })
        // 选区原样(哪怕两头是空白)
        expect(lightbulbTriggerRange(stateAt(DOC, pos(DOC, 4, 24), pos(DOC, 4, 25)))).toEqual({ from: pos(DOC, 4, 24), to: pos(DOC, 4, 25) })
    })

    it('marker 取相交或相接的(areIntersectingOrTouching),诊断和建议标签都算,只要 TS 的', () => {
        const at = DOC.indexOf('helloWorl\n')
        let st = stateAt(DOC, at)
        st = st.applyTransaction(st.update({
            effects: [
                setDiagnostics.of([
                    { from: at, to: at + 9, severity: 'error', message: 'x', code: '(2552)', source: 'ts' },
                    { from: at, to: at + 9, severity: 'error', message: 'host', code: '(9999)', source: 'lint' },
                ]),
                setTsTags.of([{ from: DOC.indexOf('s ='), to: DOC.indexOf('s =') + 1, tag: 'unnecessary', message: 'unused', code: '(6133)' }]),
            ],
        }))
        expect(markerCodesAt(st, at, at)).toEqual([2552]) // 起点
        expect(markerCodesAt(st, at + 9, at + 9)).toEqual([2552]) // 终点相接
        expect(markerCodesAt(st, at + 10, at + 10)).toEqual([]) // 隔一个字
        expect(markerCodesAt(st, at - 1, at - 1)).toEqual([])
        const s = DOC.indexOf('s =')
        expect(markerCodesAt(st, s + 1, s + 1)).toEqual([6133])
        expect(markerCodesAt(st, 0, DOC.length)).toEqual([2552, 6133])
    })
})

describe('请求内容:monaco-typescript 只问 getCodeFixesAtPosition', () => {
    it('helloWorl 上只有拼写修复;行尾那一格 TS 不给(Monaco 同样不出灯泡);没 code 不问', async () => {
        clearTSServiceCache()
        const spy = spyTransport()
        setTsWorker(spy.transport)
        const s = getTSService({ lang: 'typescript', fileName: '/qf-r6.ts' })
        s.update(DOC)
        const svc = await s.ensure()
        const st = stateAt(DOC, 0)
        const at = DOC.indexOf('helloWorl\n')
        const titles = async (from: number, to = from) => (await quickFixesAt(svc, s.fileName, st, { from, to }, [2552])).map(i => i.description)
        expect(await titles(at + 3)).toEqual(["Change spelling to 'helloWorld'"])
        expect(await titles(at, at + 9)).toEqual(["Change spelling to 'helloWorld'"])
        expect(await titles(at + 9)).toEqual([])
        // 没 code → 根本不进 TS
        spy.calls.length = 0
        expect(await quickFixesAt(svc, s.fileName, st, { from: at, to: at }, [])).toEqual([])
        expect(spy.calls).toEqual([])
    }, SLOW)
})

describe('时间上限:withDeadline 让 TS 自己中断', () => {
    it('到点返回 undefined,之后同一份文件照常算出一样的结果', async () => {
        clearTSServiceCache()
        // 一大段要类型检查的代码
        const body = Array.from({ length: 400 }, (_, i) => `function f${i}(a: number, b: string) { const o = { a, b, k: [a, b] as const }; return o.k.map(x => String(x)).join(b) + f${Math.max(0, i - 1)}(a + 1, b) }`).join('\n') + '\nlet bad: number = "s"\n'
        const s = getTSService({ lang: 'typescript', fileName: '/deadline-r6.ts' })
        s.update(body)
        const svc = await s.ensure()
        await svc.$warm()
        expect(await s.withDeadline(0, d => d.getSemanticDiagnostics(s.fileName))).toBeUndefined()
        expect(s.semanticReady()).toBe(false) // 被中断的不算算过
        const full = (await s.withDeadline(60_000, d => d.getSemanticDiagnostics(s.fileName)))!
        expect(full.map(d => d.code)).toContain(2322)
        await vi.waitFor(() => expect(s.semanticReady()).toBe(true)) // 语义事件在回包之后到
        expect((await svc.getSemanticDiagnostics(s.fileName)).map(d => d.code)).toEqual(full.map(d => d.code))
        // 回调里改了文件再问:这一版还是被限时的请求,到点中断(现在每个请求自带截止时间,不再有「嵌套里层放不放宽外层」)
        expect(await s.withDeadline(0, async (d) => { s.update(body + ' '); return d.getSemanticDiagnostics(s.fileName) })).toBeUndefined()
        expect((await svc.getSemanticDiagnostics(s.fileName)).length).toBe(full.length)
        // 非取消的异常照常抛
        await expect(s.withDeadline(1000, async () => { throw new Error('boom') })).rejects.toThrow('boom')
    }, SLOW)

    it('semanticReady 跟着项目版本走:改了文件就不算', async () => {
        clearTSServiceCache()
        const s = getTSService({ lang: 'typescript', fileName: '/ready-r6.ts' })
        s.update('let a = 1\n')
        const svc = await s.ensure()
        let pings = 0
        const off = s.onSemanticChecked(() => pings++)
        expect(s.semanticReady()).toBe(false)
        await svc.getSemanticDiagnostics(s.fileName)
        await vi.waitFor(() => expect(s.semanticReady()).toBe(true)) // 语义事件在回包之后到
        expect(pings).toBe(1)
        s.update('let a = 1\n') // 同样的文本不算改
        expect(s.semanticReady()).toBe(true)
        s.update('let a = 2\n')
        expect(s.semanticReady()).toBe(false)
        // 同项目别的文件变了也不算
        await svc.getSemanticDiagnostics(s.fileName)
        await vi.waitFor(() => expect(s.semanticReady()).toBe(true))
        const other = getTSService({ lang: 'typescript', fileName: '/ready-r6-other.ts' })
        other.update('export {}\n')
        expect(s.semanticReady()).toBe(false)
        off()
    }, SLOW)
})

describe('自动触发:防抖 250ms、只按光标、移动时取消、等语义诊断', () => {
    async function setup(fileName: string) {
        clearTSServiceCache()
        const spy = spyTransport()
        setTsWorker(spy.transport)
        const calls = spy.calls
        const host = document.createElement('div')
        document.body.appendChild(host)
        const view = new EditorView({
            state: EditorState.create({ doc: DOC, selection: EditorSelection.single(0), extensions: [diagnosticsField, tsTagField] }),
            parent: host,
        })
        // jsdom 没布局:行 × 18px、列 × 8px
        view.caretCoords = (p: number) => {
            const l = view.state.doc.lineAt(p)
            const top = (l.number - 1) * 18 + 100
            return { left: 50 + (p - l.from) * 8, top, bottom: top + 18, height: 18 }
        }
        const rect = () => ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0, toJSON() {} }) as DOMRect
        view.dom.getBoundingClientRect = rect
        view.scrollDOM.getBoundingClientRect = rect
        const s = getTSService({ lang: 'typescript', fileName })
        s.update(DOC)
        const svc = await s.ensure()
        // 诊断像 tsdiagnostics 那样写进 field(2552 是诊断,6133 是标签)
        const diags = [...await svc.getSyntacticDiagnostics(s.fileName), ...await svc.getSemanticDiagnostics(s.fileName)]
        const sugg = await svc.getSuggestionDiagnostics(s.fileName)
        const lit = (d: SlimDiagnostic) => ({ from: d.start!, to: d.start! + d.length!, code: `(${d.code})`, message: flattenMessage(d.messageText, '\n') })
        view.dispatch(view.state.update({
            effects: [
                setDiagnostics.of(diags.map(d => ({ ...lit(d), severity: 'error' as const, source: 'ts' }))),
                setTsTags.of(sugg.filter(d => d.reportsUnnecessary).map(d => ({ ...lit(d), tag: 'unnecessary' as const }))),
            ],
        }))
        await sleep(0) // 让诊断带来的语义事件先到
        calls.length = 0
        view.contentDOM.focus()
        const off = codeActionsLightbulb(view, { lang: 'typescript', fileName })
        const bulb = view.dom.querySelector<HTMLElement>('.cm-lightbulb')!
        const shown = () => bulb.style.display !== 'none'
        const move = (p: number) => view.dispatch(view.state.update({ selection: EditorSelection.single(p) }))
        return { view, s, svc, calls, bulb, shown, move, done: () => { off(); view.destroy(); host.remove() } }
    }

    it('光标停下 250ms 才问;连续移动(100ms 一下)期间一次也不问;灯泡只调 getCodeFixesAtPosition', async () => {
        const { calls, shown, move, done } = await setup('/auto-r6.ts')
        await sleep(400)
        calls.length = 0
        const at = DOC.indexOf('helloWorl\n')
        for (let i = 0; i < 8; i++) { move(at + (i % 5)); await sleep(100) }
        expect(calls).toEqual([])
        const t0 = Date.now()
        expect(await until(shown, 3000)).toBe(true)
        const dt = Date.now() - t0
        expect(dt).toBeGreaterThanOrEqual(130) // 最后一次移动后 250ms(循环里已经等了 100)
        expect(dt).toBeLessThan(600)
        expect(calls).toEqual(['getCodeFixesAtPosition'])
        done()
    }, SLOW)

    it('没有 marker、两侧空白处不问 TS,灯泡藏起;未使用的 s(6133 标签)上出灯泡', async () => {
        const { calls, shown, move, done } = await setup('/auto2-r6.ts')
        const at = DOC.indexOf('helloWorl\n')
        move(at + 3)
        expect(await until(shown, 3000)).toBe(true)
        calls.length = 0
        move(pos(DOC, 2, 7)) // const,没 marker
        await sleep(150)
        expect(shown()).toBe(true) // Monaco:新结果出来前灯泡不动
        await sleep(300)
        expect(shown()).toBe(false)
        move(pos(DOC, 4, 24)) // 两空格中间
        await sleep(400)
        move(pos(DOC, 6, 10)) // function g:能重构,但没 marker
        await sleep(400)
        expect(calls).toEqual([])
        expect(shown()).toBe(false)
        move(pos(DOC, 4, 9))
        expect(await until(shown, 3000)).toBe(true)
        expect(calls).toEqual(['getCodeFixesAtPosition'])
        done()
    }, SLOW)

    it('文档改过、语义诊断还没重算:先不问(问就是一次全文类型检查),诊断算完后再按 250ms 触发', async () => {
        const { view, s, svc, calls, shown, move, done } = await setup('/auto3-r6.ts')
        const at = DOC.indexOf('helloWorl\n')
        // 在别处打一个字:诊断(field 里映射过去)还在,但这一版 program 没检查过
        view.dispatch(view.state.update({ changes: { from: DOC.length, insert: ' ' } }))
        move(at + 3)
        await sleep(600)
        expect(s.semanticReady()).toBe(false)
        expect(calls).toEqual([])
        expect(shown()).toBe(false)
        // 诊断跑完(tsdiagnostics 调 getSemanticDiagnostics)→ 通知 → 再等 250ms
        await svc.getSemanticDiagnostics(s.fileName)
        calls.length = 0
        await sleep(100)
        expect(calls).toEqual([])
        expect(await until(shown, 3000)).toBe(true)
        expect(calls).toEqual(['getCodeFixesAtPosition'])
        done()
    }, SLOW)

    it('没有诊断来通知时自己问,但单次限 30ms:超时 TS 中断、灯泡不出、这一版文档不再问', async () => {
        clearTSServiceCache()
        const spy = spyTransport()
        setTsWorker(spy.transport)
        // 很重的文件 + 光标在一个 marker 上;没装诊断,语义诊断永远没人算 → 等过诊断防抖后自己问
        const heavy = Array.from({ length: 1500 }, (_, i) => `function f${i}(a: number, b: string) { const o = { a, b, k: [a, b] as const }; return o.k.map(x => String(x)).join(b) + f${Math.max(0, i - 1)}(a + 1, b) }`).join('\n')
        const doc = heavy + '\nhelloWorl\n'
        const at = doc.lastIndexOf('helloWorl')
        const host = document.createElement('div')
        document.body.appendChild(host)
        const view = new EditorView({ state: EditorState.create({ doc, selection: EditorSelection.single(at + 3), extensions: [diagnosticsField] }), parent: host })
        view.caretCoords = (p: number) => ({ left: 50, top: 100 + view.state.doc.lineAt(p).number, bottom: 118, height: 18 })
        const s = getTSService({ lang: 'typescript', fileName: '/heavy-r6.ts' })
        s.update(doc)
        const svc = await s.ensure()
        await svc.$warm()
        const spent = spy.spent
        view.dispatch(view.state.update({ effects: setDiagnostics.of([{ from: at, to: at + 9, severity: 'error', message: 'x', code: '(2304)', source: 'ts' }]) }))
        view.contentDOM.focus()
        view.dispatch(view.state.update({ selection: EditorSelection.single(at + 3) })) // jsdom 聚焦会把选区读回 0
        const off = codeActionsLightbulb(view, { lang: 'typescript', fileName: '/heavy-r6.ts' })
        const bulb = view.dom.querySelector<HTMLElement>('.cm-lightbulb')!
        expect(await until(() => spent.length > 0, 10_000)).toBe(true)
        expect(spent[0]).toBeLessThan(45)
        expect(s.semanticReady()).toBe(false)
        expect(bulb.style.display).toBe('none')
        // 原地挪一下光标:同一版文档,不再问
        view.dispatch(view.state.update({ selection: EditorSelection.single(at + 4) }))
        await sleep(2_500)
        expect(spent.length).toBe(1)
        // 不限时的全文检查确实要比 30ms 久(否则这个用例没意义)
        const t = performance.now(); await svc.getSemanticDiagnostics(s.fileName)
        expect(performance.now() - t).toBeGreaterThan(30)
        off(); view.destroy(); host.remove()
    }, SLOW)
})
