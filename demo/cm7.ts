import { createHighlighter } from 'shiki'
import { liteMonaco } from '../src/index'
import { EditorView } from '../src/core/view/editorview'
import { Transaction } from '../src/core/model/state'
import { undo, isolateHistory } from '../src/core/index'
import { SAMPLE_CODE } from './sample'

const host = document.getElementById('host')!
const stats = document.getElementById('stats')!
const statusEl = document.getElementById('status')!

function setStatus(msg: string) {
    statusEl.textContent = msg
}

// 把 sample 重复拼到至少 targetLines 行（中间插编号注释，避免全同缓存误导手感）
function synthDoc(targetLines: number): string {
    const base = SAMPLE_CODE.replace(/\n+$/, '')
    const baseLines = base.split('\n').length
    const parts: string[] = []
    let lines = 0
    let block = 0
    while (lines < targetLines) {
        parts.push(`// ===== block ${block} (lines ~${lines + 1}…) =====\n` + base)
        lines += 1 + baseLines
        block++
    }
    return parts.join('\n\n')
}

const hl = await createHighlighter({ themes: ['dark-plus'], langs: ['typescript', 'javascript'] })

const style = document.createElement('style')
style.textContent = `
  #host .cm-editor { height: 100%; font-family: ui-monospace, Menlo, monospace; font-size: 13px; line-height: 20px; }
`
document.head.appendChild(style)

let txCount = 0
const txLog: { docChanged: boolean, time: number }[] = []
const view = liteMonaco({
    parent: host,
    options: { automaticLayout: true }, // 容器尺寸变了自动重排(Monaco 默认 false,要自己调 layout())
    highlighter: hl,
    doc: SAMPLE_CODE,
    lang: 'typescript',
    theme: 'dark-plus',
    dispatch: (tr, v) => { txCount++; v.update(tr) },
})

view.onTransaction((tr) => {
    txLog.push({ docChanged: tr.docChanged, time: tr.annotation(Transaction.time) ?? 0 })
    if (txLog.length > 50) txLog.shift()
    dump()
})

view.scrollDOM.addEventListener('scroll', () => {
    setTimeout(dump, 0)
}, { passive: true })

function dump() {
    const snap = view.introspect()
    const docLines = view.state.doc.lines
    const renderedLines = snap.domLines.length
    stats.textContent = [
        `doc: ${docLines.toLocaleString()} 行, ${snap.state.doc.length.toLocaleString()} 字符`,
        `viewport: from=${snap.viewport.from} to=${snap.viewport.to} startLine=${snap.viewport.startLine}`,
        `rendered: ${renderedLines} 行 (虚拟化率: ${docLines > 0 ? Math.round(renderedLines / docLines * 100) : 100}%)`,
        `selection = ${JSON.stringify(snap.state.selection.ranges[0])}`,
        `transactions = ${txCount} (log: ${txLog.length})`,
        `decorations = ${snap.decorations.length} 层, ${snap.decorations.reduce((n, d) => n + d.ranges.length, 0)} 区间`,
        `heightmap = ${snap.heightmap}`,
        `linewidth = ${JSON.stringify(snap.linewidth)}`,
    ].join('\n')
}
dump()

document.getElementById('insert')!.onclick = () => {
    const head = view.state.selection.main.head
    view.dispatch(view.state.update({ changes: { from: head, insert: 'x' }, selection: { anchor: head + 1 }, userEvent: 'input.type' }))
}
document.getElementById('newline')!.onclick = () => {
    const head = view.state.selection.main.head
    view.dispatch(view.state.update({ changes: { from: head, insert: '\n' }, selection: { anchor: head + 1 }, userEvent: 'input.type' }))
}
document.getElementById('undo')!.onclick = () => {
    undo({ state: view.state, dispatch: tr => view.dispatch(tr) })
}

const docBtns = {
    sample: document.getElementById('doc-sample') as HTMLButtonElement,
    '10k': document.getElementById('doc-10k') as HTMLButtonElement,
    '30k': document.getElementById('doc-30k') as HTMLButtonElement,
    '50k': document.getElementById('doc-50k') as HTMLButtonElement,
}

function setActive(key: keyof typeof docBtns) {
    for (const [k, b] of Object.entries(docBtns)) b.classList.toggle('active', k === key)
}

function setBusy(busy: boolean) {
    for (const b of Object.values(docBtns)) b.disabled = busy
}

async function loadDoc(key: keyof typeof docBtns, label: string, getText: () => string | Promise<string>) {
    setBusy(true)
    setActive(key)
    setStatus(`加载 ${label}…`)
    const t0 = performance.now()
    try {
        const text = await getText()
        const t1 = performance.now()
        view.dispatch(view.state.update({
            changes: { from: 0, to: view.state.doc.length, insert: text },
            selection: { anchor: 0 },
            annotations: isolateHistory.of('full'),
        }))
        // 滚回顶，方便从第一行开始试
        view.scrollDOM.scrollTop = 0
        view.scrollDOM.dispatchEvent(new Event('scroll'))
        const ms = performance.now() - t0
        setStatus(`已载入 ${label}：${view.state.doc.lines.toLocaleString()} 行 / ${(text.length / 1024).toFixed(0)} KB（取文 ${(t1 - t0).toFixed(0)}ms · 写入 ${(ms - (t1 - t0)).toFixed(0)}ms · 合计 ${ms.toFixed(0)}ms）`)
        dump()
    } catch (e) {
        setStatus(`加载失败: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
        setBusy(false)
    }
}

docBtns.sample.onclick = () => void loadDoc('sample', '样本', () => SAMPLE_CODE)
docBtns['10k'].onclick = () => void loadDoc('10k', '~1.1 万行 dist/index', async () => {
    const r = await fetch('/fixtures/index.js.txt')
    if (!r.ok) throw new Error(`fetch ${r.status}`)
    return r.text()
})
docBtns['30k'].onclick = () => void loadDoc('30k', '~3 万行合成', () => synthDoc(30_000))
docBtns['50k'].onclick = () => void loadDoc('50k', '~5 万行合成', () => synthDoc(50_000))

;(window as unknown as { __cm7: EditorView }).__cm7 = view
setStatus(`就绪 · 当前 ${view.state.doc.lines} 行。点上方按钮换大文档。`)
