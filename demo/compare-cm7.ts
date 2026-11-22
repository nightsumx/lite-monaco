// compare-cm7.ts — Monaco vs lite-monaco CM7(自研内核)1:1 观感对齐
// 同代码、同主题(dark)、同字号、同操作,逐特性肉眼对照。左 Monaco 右 CM7。

import { createHighlighter, type Highlighter } from 'shiki'
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'
import { liteMonaco } from '../src/index'
import { EditorView } from '../src/core/view/editorview'
import { SAMPLE_CODE as CODE } from './sample'

// Monaco worker 接线(compare.ts 同款)。只 TS,其余归 editorWorker。
;(self as unknown as { MonacoEnvironment: unknown }).MonacoEnvironment = {
    getWorker(_: unknown, label: string) {
        if (label === 'typescript' || label === 'javascript') return new tsWorker()
        return new editorWorker()
    },
}

// 对照的是渲染层,不是类型检查 —— 关掉 Monaco TS 诊断,免全量分析冻页 + 无关波浪线噪音。
monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: true })

// 主题:CM7 用 shiki 内置 dark-plus(名 'dark-plus',bg #1e1e1e = Monaco vs-dark),Monaco 用内置 vs-dark。
// dark-plus 是 vs-dark 的 TextMate 版,底色/主色一致;keyword 细分色相略有差(monarch vs textmate),观感对齐可接受。
const CM7_THEME = 'dark-plus'

// 两侧统一排版:同字体族/字号/行高,minimap 密度与行高绑定,字体一致才谈得上观感对齐。
const FONT = `'JetBrains Mono','SF Mono',Menlo,Consolas,monospace`
const FONT_SIZE = 13
const LINE_HEIGHT = 20

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const syncBtn = $<HTMLButtonElement>('sync-scroll')
const docStatus = $<HTMLSpanElement>('doc-status')

// 当前文档(特性开关重渲染时沿用,不掉回 sample)
let currentDoc = CODE

function synthDoc(targetLines: number): string {
    const base = CODE.replace(/\n+$/, '')
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

const features = {
    lineNumbers: () => $<HTMLInputElement>('f-linenumbers').checked,
    minimap: () => $<HTMLInputElement>('f-minimap').checked,
    brackets: () => $<HTMLInputElement>('f-brackets').checked,
    indent: () => $<HTMLInputElement>('f-indent').checked,
    selection: () => $<HTMLInputElement>('f-selection').checked,
    folding: () => $<HTMLInputElement>('f-folding').checked,
}

function updateFeatureLabels() {
    document.querySelectorAll('.feature').forEach(el => {
        const input = el.querySelector('input') as HTMLInputElement
        el.classList.toggle('on', input.checked)
    })
}

let monacoEditor: monaco.editor.IStandaloneCodeEditor | null = null
let cm7View: EditorView | null = null
let hl: Highlighter | null = null
let syncScroll = true
let themeStyle: HTMLStyleElement | null = null

async function render() {
    if (!hl) hl = await createHighlighter({ themes: [CM7_THEME], langs: ['typescript', 'javascript'] })

    // 左:Monaco(vs-dark)
    const monacoHost = $('monaco-host')
    monacoHost.innerHTML = ''
    monacoEditor?.dispose()
    monacoEditor = monaco.editor.create(monacoHost, {
        value: currentDoc,
        language: 'typescript',
        theme: 'vs-dark',
        fontSize: FONT_SIZE,
        lineHeight: LINE_HEIGHT,
        fontFamily: FONT,
        fontLigatures: false,
        wordWrap: 'off', // 对齐:lite-monaco CM7 不折行,两边都不折才谈得上 contentWidth 观感对齐
        lineNumbers: features.lineNumbers() ? 'on' : 'off',
        minimap: { enabled: features.minimap(), scale: 1, showSlider: 'mouseover', renderCharacters: true, maxColumn: 120 },
        scrollBeyondLastLine: false, // 对齐:两边 scrollHeight=纯内容,thumb 同高
        scrollbar: { vertical: 'visible', horizontal: 'visible', verticalScrollbarSize: 14, horizontalScrollbarSize: 14 },
        bracketPairColorization: { enabled: features.brackets() },
        guides: { indentation: features.indent(), bracketPairs: false },
        selectionHighlight: features.selection(),
        folding: features.folding(),
        glyphMargin: false,
        renderLineHighlight: 'line',
        cursorBlinking: 'blink',
        cursorStyle: 'line',
        automaticLayout: true,
    })

    // 右:lite-monaco CM7(dark-plus 变体 vsDark)
    const cm7Host = $('cm7-host')
    cm7Host.innerHTML = ''
    cm7View?.destroy()
    themeStyle?.remove()
    themeStyle = document.createElement('style')
    themeStyle.textContent = `
#cm7-host { height: 100%; }
#cm7-host .cm-editor { height: 100%; font-family: ${FONT}; font-size: ${FONT_SIZE}px; line-height: ${LINE_HEIGHT}px; }
.cm-content { font-family: ${FONT}; }
.cm-gutterElement { font-family: ${FONT}; font-size: ${FONT_SIZE}px; line-height: ${LINE_HEIGHT}px; }`
    document.head.appendChild(themeStyle)
    cm7View = liteMonaco({
        parent: cm7Host,
        options: { automaticLayout: true }, // 容器尺寸变了自动重排(Monaco 默认 false,要自己调 layout())
        highlighter: hl,
        doc: currentDoc,
        lang: 'typescript',
        theme: CM7_THEME,
        features: {
            minimap: features.minimap(),
            overviewRuler: features.minimap(),
            bracketColors: features.brackets(),
            indentGuide: features.indent(),
            selectionMatch: features.selection(),
            lineNumbers: features.lineNumbers(),
            foldGutter: features.folding(),
        },
    })

    setupSyncScroll()
    const n = currentDoc.split('\n').length
    docStatus.textContent = `当前 ${n.toLocaleString()} 行`
}

function setupSyncScroll() {
    if (!monacoEditor || !cm7View) return
    let syncing = false
    monacoEditor.onDidScrollChange(e => {
        if (!syncScroll || syncing || !cm7View) return
        syncing = true
        cm7View.scrollDOM.scrollTop = e.scrollTop
        syncing = false
    })
    cm7View.scrollDOM.addEventListener('scroll', () => {
        if (!syncScroll || syncing || !monacoEditor) return
        syncing = true
        monacoEditor.setScrollTop(cm7View!.scrollDOM.scrollTop)
        syncing = false
    })
}

syncBtn.onclick = () => {
    syncScroll = !syncScroll
    syncBtn.textContent = `同步滚动: ${syncScroll ? 'ON' : 'OFF'}`
}

document.querySelectorAll('.feature input').forEach(input => {
    input.addEventListener('change', () => { updateFeatureLabels(); void render() })
})

const docBtns = {
    sample: $<HTMLButtonElement>('doc-sample'),
    '10k': $<HTMLButtonElement>('doc-10k'),
    '30k': $<HTMLButtonElement>('doc-30k'),
    '50k': $<HTMLButtonElement>('doc-50k'),
}

function setDocActive(key: keyof typeof docBtns) {
    for (const [k, b] of Object.entries(docBtns)) b.classList.toggle('active', k === key)
}

function setDocBusy(busy: boolean) {
    for (const b of Object.values(docBtns)) b.disabled = busy
}

async function loadDoc(key: keyof typeof docBtns, label: string, getText: () => string | Promise<string>) {
    setDocBusy(true)
    setDocActive(key)
    docStatus.textContent = `加载 ${label}…`
    const t0 = performance.now()
    try {
        currentDoc = await getText()
        await render()
        const ms = performance.now() - t0
        const n = currentDoc.split('\n').length
        docStatus.textContent = `已载入 ${label}：${n.toLocaleString()} 行 · ${ms.toFixed(0)}ms`
    } catch (e) {
        docStatus.textContent = `失败: ${e instanceof Error ? e.message : String(e)}`
    } finally {
        setDocBusy(false)
    }
}

docBtns.sample.onclick = () => void loadDoc('sample', '样本', () => CODE)
docBtns['10k'].onclick = () => void loadDoc('10k', '~1.1 万行', async () => {
    const r = await fetch('/fixtures/index.js.txt')
    if (!r.ok) throw new Error(`fetch ${r.status}`)
    return r.text()
})
docBtns['30k'].onclick = () => void loadDoc('30k', '~3 万行', () => synthDoc(30_000))
docBtns['50k'].onclick = () => void loadDoc('50k', '~5 万行', () => synthDoc(50_000))

updateFeatureLabels()
void render()

;(window as unknown as { __monaco: () => monaco.editor.IStandaloneCodeEditor | null }).__monaco = () => monacoEditor
;(window as unknown as { __cm7: () => EditorView | null }).__cm7 = () => cm7View
