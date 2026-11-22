// dist 真文件压测：从 /fixtures/*.txt 拉打包产物（静态，不经 vite 变换）
// 分阶段 setTimeout yield，避免主线程堵死导致 aihand/CDP 无法读状态
// 结果：#report + window.__perfReport

import { createHighlighter } from 'shiki'
import { liteMonaco } from '../src/index'
import { EditorView } from '../src/core/view/editorview'

const host = document.getElementById('host')!
const reportEl = document.getElementById('report')!
const btnIndex = document.getElementById('run-index') as HTMLButtonElement
const btnTs = document.getElementById('run-ts') as HTMLButtonElement

type Report = Record<string, unknown>

function setReport(obj: Report | string) {
    if (typeof obj === 'string') {
        reportEl.textContent = obj
        return
    }
    ;(window as unknown as { __perfReport: Report }).__perfReport = obj
    reportEl.textContent = JSON.stringify(obj, null, 2)
}

function status(msg: string) {
    reportEl.textContent = msg
    ;(window as unknown as { __perfStatus: string }).__perfStatus = msg
}

const yield0 = () => new Promise<void>(r => setTimeout(r, 0))

function pct(xs: number[], p: number) {
    if (!xs.length) return 0
    const s = [...xs].sort((a, b) => a - b)
    return s[Math.min(s.length - 1, Math.floor(s.length * p))]
}

function withSyncTimeouts<T>(fn: () => T): T {
    const w = window
    const real = w.setTimeout.bind(w)
    const realClear = w.clearTimeout.bind(w)
    w.setTimeout = ((cb: TimerHandler, ms?: number, ...args: unknown[]) => {
        if (!ms) {
            try {
                if (typeof cb === 'function') (cb as (...a: unknown[]) => void)(...args)
            } catch { /* */ }
            return -1 as unknown as number
        }
        return real(cb, ms, ...args)
    }) as typeof setTimeout
    w.clearTimeout = ((id: number) => {
        if (id !== -1) realClear(id)
    }) as typeof clearTimeout
    try {
        return fn()
    } finally {
        w.setTimeout = real
        w.clearTimeout = realClear
    }
}

async function loadFixture(kind: 'index' | 'typescript') {
    const path = kind === 'index' ? '/fixtures/index.js.txt' : '/fixtures/typescript.js.txt'
    const name = kind === 'index' ? 'dist/index.js' : 'dist/typescript-*.js'
    const t0 = performance.now()
    const text = await (await fetch(path)).text()
    return { text, fetchMs: performance.now() - t0, name, path }
}

let view: EditorView | null = null

async function ensureEditor() {
    if (view) return view
    status('init shiki + editor…')
    const hl = await createHighlighter({ themes: ['dark-plus'], langs: ['javascript'] })
    const style = document.createElement('style')
    style.textContent = `
      #host .cm-editor { height: 100%; font-family: ui-monospace, Menlo, monospace; font-size: 13px; line-height: 20px; }
    `
    document.head.appendChild(style)
    view = liteMonaco({
        parent: host,
        options: { automaticLayout: true }, // 容器尺寸变了自动重排(Monaco 默认 false,要自己调 layout())
        highlighter: hl,
        doc: '// perf ready\n',
        lang: 'javascript',
        theme: 'dark-plus',
    })
    ;(window as unknown as { __cm7: () => EditorView | null }).__cm7 = () => view
    return view
}

function benchScroll(v: EditorView) {
    const sc = v.scrollDOM
    const maxScroll = Math.max(0, sc.scrollHeight - sc.clientHeight)
    return withSyncTimeouts(() => {
        const jump: number[] = []
        for (let i = 0; i <= 10; i++) {
            ;(v as unknown as { scrollRAF: number }).scrollRAF = 0
            const top = Math.floor((maxScroll * i) / 10)
            const t0 = performance.now()
            sc.scrollTop = top
            sc.dispatchEvent(new Event('scroll'))
            jump.push(performance.now() - t0)
        }
        const burst: number[] = []
        ;(v as unknown as { scrollRAF: number }).scrollRAF = 0
        sc.scrollTop = 0
        sc.dispatchEvent(new Event('scroll'))
        const step = Math.max(200, Math.floor(maxScroll / 40))
        for (let i = 1; i <= 30; i++) {
            ;(v as unknown as { scrollRAF: number }).scrollRAF = 0
            const t0 = performance.now()
            sc.scrollTop = Math.min(maxScroll, i * step)
            sc.dispatchEvent(new Event('scroll'))
            burst.push(performance.now() - t0)
        }
        return {
            maxScroll: Math.round(maxScroll),
            jump: {
                avg: +(jump.reduce((a, b) => a + b, 0) / jump.length).toFixed(2),
                p50: +pct(jump, 0.5).toFixed(2),
                p95: +pct(jump, 0.95).toFixed(2),
                worst: +pct(jump, 0.99).toFixed(2),
                over16: jump.filter(t => t > 16.7).length,
                over50: jump.filter(t => t > 50).length,
            },
            burst: {
                avg: +(burst.reduce((a, b) => a + b, 0) / burst.length).toFixed(2),
                p50: +pct(burst, 0.5).toFixed(2),
                p95: +pct(burst, 0.95).toFixed(2),
                worst: +pct(burst, 0.99).toFixed(2),
                over16: burst.filter(t => t > 16.7).length,
                over50: burst.filter(t => t > 50).length,
            },
            domLines: sc.querySelectorAll('.cm-line').length,
        }
    })
}

function benchType(v: EditorView, atLine: number, n: number) {
    const line = v.state.doc.line(Math.min(Math.max(1, atLine), v.state.doc.lines))
    const pos = line.from + Math.min(4, line.length)
    v.dispatch(v.state.update({ selection: { anchor: pos } }))
    const sc = v.scrollDOM
    const lh = sc.scrollHeight / Math.max(1, v.state.doc.lines)
    withSyncTimeouts(() => {
        ;(v as unknown as { scrollRAF: number }).scrollRAF = 0
        sc.scrollTop = Math.max(0, line.number * lh - 100)
        sc.dispatchEvent(new Event('scroll'))
    })
    const times: number[] = []
    for (let i = 0; i < n; i++) {
        const t0 = performance.now()
        const head = v.state.selection.main.head
        v.dispatch(v.state.update({
            changes: { from: head, insert: 'x' },
            selection: { anchor: head + 1 },
            userEvent: 'input.type',
        }))
        times.push(performance.now() - t0)
    }
    return {
        n,
        atLine: line.number,
        p50: +pct(times, 0.5).toFixed(2),
        p95: +pct(times, 0.95).toFixed(2),
        worst: +pct(times, 0.99).toFixed(2),
        avg: +(times.reduce((a, b) => a + b, 0) / times.length).toFixed(2),
    }
}

async function run(kind: 'index' | 'typescript') {
    btnIndex.disabled = true
    btnTs.disabled = true
    const partial: Report = { phase: 'start', kind }
    try {
        const v = await ensureEditor()
        await yield0()

        status(`fetch ${kind} fixture…`)
        const fix = await loadFixture(kind)
        partial.fixture = fix.name
        partial.bytes = fix.text.length
        partial.fetchMs = +fix.fetchMs.toFixed(1)
        setReport({ ...partial, phase: 'fetched' })
        await yield0()

        status(`load into editor (${(fix.text.length / 1024).toFixed(0)} KB)…`)
        const t0 = performance.now()
        v.dispatch(v.state.update({
            changes: { from: 0, to: v.state.doc.length, insert: fix.text },
        }))
        const loadMs = performance.now() - t0
        partial.lines = v.state.doc.lines
        partial.loadMs = +loadMs.toFixed(1)
        setReport({ ...partial, phase: 'loaded', domLines: v.scrollDOM.querySelectorAll('.cm-line').length })
        await yield0()

        status('scroll…')
        const scroll = benchScroll(v)
        partial.scroll = scroll
        setReport({ ...partial, phase: 'scrolled' })
        await yield0()

        status('type mid…')
        const typeN = kind === 'index' ? 12 : 5
        const typeMid = benchType(v, Math.floor(v.state.doc.lines / 2), typeN)
        partial.typeMid = typeMid
        setReport({ ...partial, phase: 'typed-mid' })
        await yield0()

        status('type end…')
        const typeEnd = benchType(v, v.state.doc.lines, kind === 'index' ? 8 : 4)
        partial.typeEnd = typeEnd
        partial.phase = 'done'
        partial.doneAt = new Date().toISOString()
        setReport(partial)
        return partial
    } catch (e) {
        const err = { phase: 'error', error: String(e instanceof Error ? e.stack || e.message : e), ...partial }
        setReport(err)
        throw e
    } finally {
        btnIndex.disabled = false
        btnTs.disabled = false
    }
}

btnIndex.onclick = () => { void run('index') }
btnTs.onclick = () => { void run('typescript') }

// 默认自动跑 index；#manual 只初始化不跑（给 CDP/大文件手动点）
if (!location.hash.startsWith('#manual')) void run('index')
